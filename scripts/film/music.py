"""Composes the bed of music under a film's narration, once (backlog 143).

    python3 scripts/film/music.py film/investors

The owner asked, on 23 October, that the investors' film be «حماسي ومشجع» —
stirring and encouraging. The narration alone does not carry that; a bed of
music under it does. This asks ACE-Step on Hugging Face for an instrumental
piece as long as the film, from the `music` prompt in the film's music.json,
and keeps it as film/<name>/music.wav. A film that has a music.wav is not
composed for again: delete it from the branch to have it remade.

ACE-Step is Apache-2.0 (huggingface.co/ACE-Step/ACE-Step-v1-3.5B), so what
it makes may be used in an advertisement. MusicGen, the better-known one, is
CC-BY-NC — not for a commercial film.

The Space's one generate button takes its 22 inputs in the order of
ui/components.py in the Space (text2music_bnt.click), read on 23 October; the
endpoint is looked up rather than assumed, and anything else is printed so the
next attempt can be fixed. Stops quietly on refusal: the film is put together
without music if there is none.
"""

import json
import os
import subprocess
import sys

from gradio_client import Client

SPACE = "ACE-Step/ACE-Step"

film = sys.argv[1].rstrip("/")
spec_path = f"{film}/music.json"
target = f"{film}/music.wav"
if not os.path.exists(spec_path):
    print("no music.json — this film has no music")
    sys.exit(0)
if os.path.exists(target):
    print("music.wav is already there")
    sys.exit(0)
spec = json.load(open(spec_path, encoding="utf-8"))

token = os.environ.get("HF_TOKEN") or None
try:
    client = Client(SPACE, token=token) if token else Client(SPACE)
    api = client.view_api(return_format="dict", print_info=False) or {}
except Exception as e:  # noqa: BLE001 — the Space may be asleep or gone
    print("the Space did not answer:", str(e)[:300])
    sys.exit(0)

# The generate button is the endpoint with 22 parameters.
endpoints = {**api.get("named_endpoints", {}), **api.get("unnamed_endpoints", {})}
api_name = next((n for n, e in endpoints.items() if len(e.get("parameters", [])) == 22), None)
if api_name is None:
    print("no 22-input endpoint; the Space offers:", {n: len(e.get("parameters", [])) for n, e in endpoints.items()})
    sys.exit(0)
print("endpoint:", api_name)

args = [
    float(spec.get("seconds", 90)),  # audio_duration
    spec["music"],                   # prompt (tags)
    "[instrumental]",                # lyrics
    60,                              # infer_step
    15.0,                            # guidance_scale
    "euler",                         # scheduler_type
    "apg",                           # cfg_type
    10.0,                            # omega_scale
    "",                              # manual_seeds
    0.5,                             # guidance_interval
    0.0,                             # guidance_interval_decay
    3.0,                             # min_guidance_scale
    True,                            # use_erg_tag
    False,                           # use_erg_lyric
    True,                            # use_erg_diffusion
    "",                              # oss_steps
    0.0,                             # guidance_scale_text
    0.0,                             # guidance_scale_lyric
    False,                           # audio2audio_enable
    0.5,                             # ref_audio_strength
    None,                            # ref_audio_input
    "none",                          # lora_name_or_path
]
try:
    key = "fn_index" if isinstance(api_name, int) or str(api_name).isdigit() else "api_name"
    result = client.predict(*args, **{key: int(api_name) if key == "fn_index" else api_name})
except Exception as e:  # noqa: BLE001
    print("music refused:", str(e)[:300])
    sys.exit(0)

audio = result[0] if isinstance(result, (list, tuple)) else result
if isinstance(audio, dict):
    audio = audio.get("path") or audio.get("name")
if not audio or not os.path.exists(audio):
    print("no audio came back:", str(result)[:300])
    sys.exit(0)
# Whatever the Space returns (wav, mp3, flac), keep it as 48 kHz stereo wav.
subprocess.check_call(["ffmpeg", "-v", "error", "-y", "-i", audio, "-ar", "48000", "-ac", "2", target])
print("music made:", target)
