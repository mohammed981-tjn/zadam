#!/usr/bin/env bash
#
# A film or an app build for the owner alone (the owner, 26 October, when the repository became public:
# «احذفهما، والفيلم لي وحدي»). A release, or a plain artifact, of a public repository is anyone's; so the files are
# locked to owner-delivery.pub.asc, a key whose private half the assistant holds, and kept for one day as an artifact.
# The assistant downloads the artifact, opens it, and sends the file in the conversation. If that key is lost (the
# session ended), a new one replaces the file here and the build is run again; nothing else changes.
#
#   .github/delivery/lock.sh NAME FILE...   →   delivery/NAME.tar.gpg
set -euo pipefail
name=$1
shift
mkdir -p delivery
tar -cf - "$@" | gpg --batch --yes --trust-model always \
  --recipient-file "$(dirname "$0")/owner-delivery.pub.asc" -o "delivery/$name.tar.gpg" -e
ls -l "delivery/$name.tar.gpg"
