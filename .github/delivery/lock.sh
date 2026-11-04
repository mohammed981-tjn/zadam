#!/usr/bin/env bash
#
# A film or an app build for the owner alone (the owner, 26 October, when the repository became public:
# «احذفهما، والفيلم لي وحدي»). A release, or a plain artifact, of a public repository is anyone's; so the files are
# locked to owner-delivery.pub.asc, a key whose private half the assistant holds, and left on the «owner-delivery»
# pre-release: the one place the assistant's session can download from (artifact storage is closed to it). Anyone may
# see that a locked file is there; no one but the assistant can open it. The assistant downloads it, opens it, sends the
# file in the conversation, and removes the release (clear-delivery.yml). If the key is lost (the session ended), a new
# one replaces the file here and the build is run again; nothing else changes.
#
#   .github/delivery/lock.sh NAME FILE...   →   delivery/NAME.tar.gpg, and on the release when GH_TOKEN is set
set -euo pipefail
name=$1
shift
mkdir -p delivery
tar -cf - "$@" | gpg --batch --yes --trust-model always \
  --recipient-file "$(dirname "$0")/owner-delivery.pub.asc" -o "delivery/$name.tar.gpg" -e
ls -l "delivery/$name.tar.gpg"
if [ -n "${GH_TOKEN:-}" ]; then
  gh release view owner-delivery >/dev/null 2>&1 ||
    gh release create owner-delivery --prerelease --title "تسليمٌ مقفل" \
      --notes "ملفّاتٌ مقفلة للمالك وحده، لا تُفتح إلا بمفتاح المساعد، وتُحذف بعد تسليمها."
  gh release upload owner-delivery "delivery/$name.tar.gpg" --clobber
  echo "### مقفلٌ للمالك: $name.tar.gpg" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi
