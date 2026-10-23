"""Makes the still of each shot that has none yet, with Z-Image on Hugging Face
(backlog 140).

    python3 scripts/film/frames.py film/investors

Run after animate.py in the same job, never before it: a still made today is
not moved today. It is committed, looked at, and remade if it is wrong — the
owner caught a tablet whose screen faced the camera rather than the man
holding it — and only a still that has been in the branch for a run gets a
clip. Deleting a bad still from the branch is enough to have it remade.

Stops at the first refusal for quota, like animate.py.
"""

import json
import os
import sys

from gradio_client import Client
from PIL import Image

SPACE = "mcp-tools/Z-Image-Turbo"

film = sys.argv[1].rstrip("/")
shots = json.load(open(f"{film}/shots.json", encoding="utf-8"))
todo = [s for s in shots if s.get("image") and not os.path.exists(f"{film}/frames/{s['frame']}")]
print(f"{len(todo)} still(s) to make:", ", ".join(s["id"] for s in todo) or "none")
if not todo:
    sys.exit(0)


def first_path(result):
    """The image file in whatever shape the Space's gallery comes back in."""
    gallery = result[0] if isinstance(result, (list, tuple)) else result
    item = gallery[0] if isinstance(gallery, list) and gallery else gallery
    if isinstance(item, (list, tuple)):
        item = item[0]
    if isinstance(item, dict):
        item = item.get("image") or item.get("path") or item.get("name")
        if isinstance(item, dict):
            item = item.get("path")
    return item


token = os.environ.get("HF_TOKEN") or None
client = Client(SPACE, token=token) if token else Client(SPACE)
api = client.view_api(return_format="dict", print_info=False) or {}
names = list(api.get("named_endpoints", {}).keys())
api_name = next((n for n in names if "generate" in n), names[0] if names else "/generate")
print("endpoint:", api_name)

os.makedirs(f"{film}/frames", exist_ok=True)
for s in todo:
    try:
        result = client.predict(
            prompt=s["image"],
            resolution="1280x720 ( 16:9 )",
            steps=8,
            random_seed=True,
            api_name=api_name,
        )
    except Exception as e:  # noqa: BLE001
        message = str(e)
        print(f"still {s['id']} refused:", message[:300])
        if "quota" in message.lower() or "zerogpu" in message.lower():
            break
        continue
    path = first_path(result)
    Image.open(path).convert("RGB").save(f"{film}/frames/{s['frame']}", "WEBP", quality=90)
    print(f"still {s['id']} made")
