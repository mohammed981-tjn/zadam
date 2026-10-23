"""Puts a film together from its clips and the narrator's lines (backlog 140).

    python3 scripts/film/assemble.py film/investors out/

Each shot lasts as long as its clip, or as long as its line plus a breath if
the line is longer, holding the clip's last frame for the difference. Shots
cross-fade into one another and into the closing card (the logo on the dark
ground of the app's splash, then the site's address). Each line starts a
moment after its shot does.

Two files come out: 16:9 for the site and YouTube, and 4:5 cut from the same
picture for a phone's feed, as the other films are.

Nothing is drawn over the pictures: no captions or slogans. The words are the
narrator's, and Arabic set by ffmpeg's text filter is not shaped, so it would
come out as disconnected letters. The cards that explain the partnership
(backlog 143) are clips of their own, drawn in a browser by cards.mjs, where
Arabic is shaped.

If the film has a music.wav (music.py), it plays under the narration, quieter
whenever the narrator speaks, and comes up at the end.
"""

import json
import os
import subprocess
import sys

film = sys.argv[1].rstrip("/")
out = sys.argv[2].rstrip("/") if len(sys.argv) > 2 else "out"
name = os.path.basename(film)
shots = json.load(open(f"{film}/shots.json", encoding="utf-8"))
os.makedirs(out, exist_ok=True)

W, H, FPS = 1280, 720, 24
FADE = 0.5          # cross-fade between shots
LEAD = 0.35         # a line starts this long after its shot
BREATH = 0.8        # silence after a line before the next shot may start
CARD = 4.0          # the closing card
SITE = os.environ.get("FILM_SITE", "zadam-khaki.vercel.app")
LOGO = "public/sudagri-logo.webp"


def duration(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


missing = [s["id"] for s in shots if not os.path.exists(f"{film}/clips/{s['id']}.mp4")]
missing += [f"line {s['line']}" for s in shots if not os.path.exists(f"tts/fusha/{s['line']}.wav")]
if missing:
    print("not ready — missing:", ", ".join(missing))
    sys.exit(0)

inputs, filters, lengths = [], [], []
for i, s in enumerate(shots):
    clip, line = f"{film}/clips/{s['id']}.mp4", f"tts/fusha/{s['line']}.wav"
    c, l = duration(clip), duration(line)
    d = max(c, LEAD + l + BREATH)
    lengths.append(d)
    inputs += ["-i", clip]
    filters.append(
        f"[{i}:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},"
        f"setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration={max(0.0, d - c):.3f},"
        f"trim=duration={d:.3f},setpts=PTS-STARTPTS[v{i}]")

n = len(shots)
# The closing card: the logo fades in on the splash's dark green, the address
# under it. On a cream disc, as in the app's splash (backlog 107): the logo's
# own lettering is dark green and disappears straight on the dark ground.
DISC = 420
inputs += ["-loop", "1", "-t", f"{CARD}", "-i", LOGO]
filters.append(
    f"color=c=0x10160f:s={W}x{H}:r={FPS}:d={CARD}[bg];"
    f"color=c=0xf7f5ef:s={DISC}x{DISC}:r={FPS}:d={CARD},format=rgba,"
    f"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(hypot(X-{DISC // 2},Y-{DISC // 2}),{DISC // 2}),255,0)'[disc];"
    f"[{n}:v]scale=-1:{DISC - 60},format=rgba[logo];"
    f"[bg][disc]overlay=(W-w)/2:(H-h)/2-40:shortest=1[bgd];"
    f"[bgd][logo]overlay=(W-w)/2:(H-h)/2-40:shortest=1,"
    f"drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='{SITE}':"
    f"fontcolor=0xe8e6dc:fontsize=34:x=(w-text_w)/2:y=h-90,"
    f"fade=t=in:st=0:d=0.8,setsar=1,format=yuv420p,trim=duration={CARD}[v{n}]")
lengths.append(CARD)

# Cross-fade the chain. Each fade overlaps the end of one shot with the start
# of the next, so shot i starts at the sum of the lengths before it, less a
# fade for each join.
starts, t = [], 0.0
for i, d in enumerate(lengths):
    starts.append(t)
    t += d - FADE
total = starts[-1] + lengths[-1]
prev = "v0"
for i in range(1, n + 1):
    label = f"x{i}" if i < n else "vout"
    filters.append(f"[{prev}][v{i}]xfade=transition=fade:duration={FADE}:offset={starts[i]:.3f}[{label}]")
    prev = label

# The lines, each delayed to its shot.
audio_base = n + 1
for i, s in enumerate(shots):
    inputs += ["-i", f"tts/fusha/{s['line']}.wav"]
    ms = int((starts[i] + LEAD) * 1000)
    filters.append(f"[{audio_base + i}:a]aresample=48000,adelay={ms}|{ms},apad=whole_dur={total:.3f}[a{i}]")
MUSIC = f"{film}/music.wav"
if os.path.exists(MUSIC):
    # The narration keys a compressor on the music, so the music steps back
    # while a line is spoken and comes up between lines and at the end.
    filters.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,asplit=2[nar][key]")
    inputs += ["-stream_loop", "-1", "-i", MUSIC]
    filters.append(
        f"[{audio_base + n}:a]aresample=48000,atrim=duration={total:.3f},volume=0.32,"
        f"afade=t=in:st=0:d=1.5[bed]")
    filters.append("[bed][key]sidechaincompress=threshold=0.03:ratio=8:attack=30:release=500[ducked]")
    filters.append(f"[nar][ducked]amix=inputs=2:normalize=0,"
                   f"atrim=duration={total:.3f},afade=t=out:st={total - 2.5:.3f}:d=2.5[aout]")
else:
    filters.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,"
                   f"atrim=duration={total:.3f},afade=t=out:st={total - 1.2:.3f}:d=1.2[aout]")

wide = f"{out}/{name}-wide.mp4"
subprocess.check_call(
    ["ffmpeg", "-v", "error", "-y", *inputs, "-filter_complex", ";".join(filters),
     "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264", "-preset", "slow", "-crf", "20",
     "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", wide])

# 4:5 for a phone's feed, cut from the middle of the same picture.
portrait = f"{out}/{name}-portrait.mp4"
subprocess.check_call(
    ["ffmpeg", "-v", "error", "-y", "-i", wide, "-vf", f"crop={H * 4 // 5}:{H},scale=864:1080,setsar=1",
     "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", portrait])

print(f"{wide} and {portrait}: {total:.1f} s")
