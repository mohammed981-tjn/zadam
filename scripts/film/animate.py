"""Moves each still of a film with Wan 2.2 on Hugging Face (backlog 140).

    python3 scripts/film/animate.py film/investors

The owner chose, on 23 October, moving shots for every scene of the investors'
film rather than stills with a camera move, knowing that the free Hugging Face
allowance runs out after a shot or two a day. So this runs once a day: it
animates the shots that have a still and no clip yet, in order, and stops at
the first refusal for quota, keeping what it made. The next run picks up where
this one stopped.

The stills are made and looked at first (film/<name>/frames/), because a
picture is cheap to remake and a clip is not; the owner caught a tablet whose
screen faced the camera instead of the man holding it, and that would have
cost a clip.

It runs in GitHub Actions rather than in a session: the session's Hugging Face
tool gives up after sixty seconds, which a five-second clip does not fit in,
and the session cannot reach Hugging Face to download what was made.
"""

import json
import os
import shutil
import sys

from gradio_client import Client, handle_file

SPACE = "zerogpu-aoti/wan2-2-fp8da-aoti-faster"

film = sys.argv[1].rstrip("/")
shots = json.load(open(f"{film}/shots.json", encoding="utf-8"))
os.makedirs(f"{film}/clips", exist_ok=True)

todo = [
    s for s in shots
    if os.path.exists(f"{film}/frames/{s['frame']}") and not os.path.exists(f"{film}/clips/{s['id']}.mp4")
]
print(f"{len(todo)} shot(s) to animate:", ", ".join(s["id"] for s in todo) or "none")
if not todo:
    sys.exit(0)


def connect(token):
    return Client(SPACE, token=token) if token else Client(SPACE)


def endpoint(client):
    """The video endpoint's name, read from the Space rather than assumed."""
    api = client.view_api(return_format="dict", print_info=False)
    names = list((api or {}).get("named_endpoints", {}).keys())
    for name in names:
        if "generate" in name:
            return name
    return names[0] if names else "/generate_video"


# The account's allowance first, if the repository holds a token; an anonymous
# caller has its own, smaller one, and a runner is a fresh address each time.
tokens = [t for t in [os.environ.get("HF_TOKEN") or None, None]]
made = 0
for token in tokens:
    client = connect(token)
    api_name = endpoint(client)
    print("caller:", "account" if token else "anonymous", "· endpoint:", api_name)
    out_of_quota = False
    for s in [s for s in todo if not os.path.exists(f"{film}/clips/{s['id']}.mp4")]:
        try:
            result = client.predict(
                input_image=handle_file(f"{film}/frames/{s['frame']}"),
                prompt=s["motion"],
                steps=6,
                duration_seconds=s.get("seconds", 5),
                randomize_seed=True,
                api_name=api_name,
            )
        except Exception as e:  # noqa: BLE001 — the Space's errors are plain exceptions
            message = str(e)
            print(f"shot {s['id']} refused:", message[:300])
            if "quota" in message.lower() or "zerogpu" in message.lower():
                out_of_quota = True
                break
            continue
        video = result[0] if isinstance(result, (list, tuple)) else result
        path = video.get("video") if isinstance(video, dict) else video
        shutil.copy(path, f"{film}/clips/{s['id']}.mp4")
        made += 1
        print(f"shot {s['id']} animated")
    if not out_of_quota:
        break

print(f"made {made} clip(s)")
