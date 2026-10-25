"""Puts together the film that walks through the platform (backlog 199).

    python3 scripts/film/platform_assemble.py film/platform work/ out/

From what platform_shoot.mjs drew into work/ and the narrator's lines in
film/platform/voice/<line>.wav. Each scene is a page of the live site: it lasts
as long as its line plus a breath, and the camera scrolls slowly down the page
from the scene's anchor while the line is spoken, the scene's title and address
in a band at the bottom. An opening card comes first; the last scene is the
closing card. Scenes cross-fade; the music of the investors' film plays quietly
under the narration.

Three files come out: platform-wide.mp4 (16:9), platform-portrait.mp4 (4:5, the
same picture on the dark ground under the logo, for a phone's feed) and
platform-sheet.jpg, one frame from each scene, to look over the film at a glance.
"""

import json
import os
import subprocess
import sys

from PIL import Image

film = sys.argv[1].rstrip("/")
work = sys.argv[2].rstrip("/")
out = sys.argv[3].rstrip("/") if len(sys.argv) > 3 else "out"
os.makedirs(out, exist_ok=True)

W, H, FPS = 1280, 720, 24
FADE = 0.5      # cross-fade between scenes
LEAD = 0.45     # a line starts this long into its scene
BREATH = 0.9    # after the line, before the next scene starts to come in
SHORTEST = 5.0  # a scene is never shorter than this
INTRO = 3.5     # the opening card, with music alone
SPEED = 70      # how far the camera scrolls down a page, in pixels a second
MUSIC = "film/investors/music.wav"
LOGO = "public/sudagri-logo.webp"

scenes = json.load(open(f"{film}/scenes.json", encoding="utf-8"))
meta = json.load(open(f"{work}/shots.json", encoding="utf-8"))


def duration(path):
    return float(subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path]).strip())


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


missing = [s["line"] for s in scenes if not os.path.exists(f"{film}/voice/{s['line']}.wav")]
missing += [s["id"] for s in scenes if s.get("path") and not os.path.exists(f"{work}/shot-{s['id']}.jpg")]
if missing:
    print("not ready — missing:", ", ".join(missing))
    sys.exit(0)

clips, lengths, voices = [], [], []

# The opening card.
run(["-loop", "1", "-framerate", str(FPS), "-t", str(INTRO), "-i", f"{work}/intro.png",
     "-vf", f"scale={W}:{H},format=yuv420p,fade=t=in:st=0:d=0.6", "-r", str(FPS),
     "-c:v", "libx264", "-crf", "18", "-preset", "medium", f"{work}/clip-00.mp4"])
clips.append(f"{work}/clip-00.mp4")
lengths.append(INTRO)
voices.append(None)

for s in scenes:
    voice = f"{film}/voice/{s['line']}.wav"
    d = round(max(SHORTEST, LEAD + duration(voice) + BREATH + FADE), 2)
    clip = f"{work}/clip-{s['id']}.mp4"
    if s.get("card"):
        run(["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", f"{work}/{s['card']}.png",
             "-vf", f"scale={W}:{H},format=yuv420p,fade=t=out:st={d - 1.2}:d=1.2", "-r", str(FPS),
             "-c:v", "libx264", "-crf", "18", "-preset", "medium", clip])
    else:
        m = meta[s["id"]]
        shot = Image.open(f"{work}/shot-{s['id']}.jpg").convert("RGB")
        if shot.width != W:
            shot = shot.resize((W, round(shot.height * W / shot.width)), Image.LANCZOS)
        y0 = min(m["y0"], max(0, shot.height - H))
        span = max(0, min(shot.height - y0 - H, int(SPEED * d)))
        strip = f"{work}/strip-{s['id']}.jpg"
        shot.crop((0, y0, W, y0 + H + span)).save(strip, quality=93)
        # The camera eases in and out of its scroll: half a cosine over the scene.
        y = f"{span}*(1-cos(PI*t/{d}))/2"
        run(["-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", strip,
             "-loop", "1", "-framerate", str(FPS), "-t", str(d), "-i", f"{work}/cap-{s['id']}.png",
             "-filter_complex",
             f"[0:v]crop={W}:{H}:0:'{y}',setsar=1[bg];"
             f"[1:v]format=rgba,fade=t=in:st=0.5:d=0.6:alpha=1[cap];"
             f"[bg][cap]overlay=0:0,format=yuv420p[v]",
             "-map", "[v]", "-r", str(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", clip])
    clips.append(clip)
    lengths.append(d)
    voices.append(voice)
    print("scene", s["id"], d, "s")

# Scenes overlap by FADE; scene i starts at the sum of those before it, less the overlaps.
starts, t = [], 0.0
for i, d in enumerate(lengths):
    starts.append(t)
    t += d - FADE
total = round(starts[-1] + lengths[-1], 2)

# Picture: one cross-fade after another.
inputs = sum((["-i", c] for c in clips), [])
chain, last = [], "[0:v]"
for i in range(1, len(clips)):
    tag = f"[x{i}]"
    chain.append(f"{last}[{i}:v]xfade=transition=fade:duration={FADE}:offset={starts[i]:.3f}{tag}")
    last = tag
run([*inputs, "-filter_complex", ";".join(chain), "-map", last, "-r", str(FPS),
     "-c:v", "libx264", "-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p", f"{work}/picture.mp4"])

# Sound: each line LEAD into its scene, over the music, which comes up at the end.
spoken = [(starts[i] + LEAD, v) for i, v in enumerate(voices) if v]
ins = sum((["-i", v] for _, v in spoken), []) + ["-stream_loop", "-1", "-i", MUSIC]
parts = [f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,adelay={int(at * 1000)}:all=1[a{i}]"
         for i, (at, _) in enumerate(spoken)]
n = len(spoken)
parts.append("".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0[voice]")
parts.append(f"[{n}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{total},"
             f"volume='if(lt(t,{INTRO}),0.55,if(gt(t,{total - 6}),0.45,0.14))':eval=frame,"
             f"afade=t=in:st=0:d=1,afade=t=out:st={total - 2.5}:d=2.5[music]")
parts.append("[voice][music]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]")
run([*ins, "-filter_complex", ";".join(parts), "-map", "[a]", "-t", str(total),
     "-c:a", "pcm_s16le", f"{work}/sound.wav"])

wide = f"{out}/platform-wide.mp4"
run(["-i", f"{work}/picture.mp4", "-i", f"{work}/sound.wav", "-map", "0:v", "-map", "1:a",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", wide])

# 4:5 for a phone: the same picture on the dark ground, under the logo.
PW, PH = 1080, 1350
vh = round(PW * H / W)
run(["-i", wide, "-loop", "1", "-i", LOGO, "-filter_complex",
     f"color=c=0x0a2d22:s={PW}x{PH}:r={FPS}[g];[0:v]scale={PW}:{vh}[v];[1:v]scale=230:-1[l];"
     f"[g][l]overlay=(W-w)/2:110:shortest=1[gl];[gl][v]overlay=0:{(PH - vh) // 2 + 70}:shortest=1,format=yuv420p[p]",
     "-map", "[p]", "-map", "0:a", "-t", str(total), "-c:v", "libx264", "-crf", "21", "-preset", "medium",
     "-c:a", "copy", "-movflags", "+faststart", f"{out}/platform-portrait.mp4"])

# One frame from the middle of each scene, side by side.
for i, (st, d) in enumerate(zip(starts, lengths)):
    run(["-ss", f"{st + d * 0.6:.2f}", "-i", wide, "-frames:v", "1", "-vf", "scale=384:216", f"{work}/sheet-{i:02d}.jpg"])
run(["-framerate", "1", "-i", f"{work}/sheet-%02d.jpg", "-vf", "tile=4x7:padding=4:color=white",
     "-frames:v", "1", f"{out}/platform-sheet.jpg"])
print("film:", wide, total, "s")
