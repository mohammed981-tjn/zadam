#!/usr/bin/env bash
#
# محاكي التطبيق (البند ٢٠٢؛ المالك، 6 نوفمبر 2026: «ابني محاكي للاختبارات والمعاينة»).
#
# يبني تطبيق Flutter للويب ويشغّله في Chromium بمقاس جوّال (390×844)، ثمّ يصوّر الرئيسيّة وكلّ تبويبٍ في الشريط
# السفليّ، ومحادثةً مع المساعد، والقائمة الجانبيّة، وأقسام اللوحة (الأخبار والأفلام والأمطار والنفير والخدمات
# والتعدين)، ويفشل إن رمت الصفحة خطأً أو غاب قسمٌ باسمه. ليس بديلاً عن الجوّال الحقيقيّ: الخرائط والكاميرا والتخزين الآمن تعمل في
# المتصفّح بغير ما تعمل في Android، لكنّ الشاشات والألوان والنصوص والتنقّل هي نفسها.
#
#   ./scripts/app-preview.sh            # الصور في out/app-preview/
#   OUT=/some/dir ./scripts/app-preview.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUT:-$ROOT/out/app-preview}"
PORT="${PORT:-3200}"
mkdir -p "$OUT"
cd "$ROOT/mobile"
flutter build web --release --no-web-resources-cdn --no-wasm-dry-run \
  --dart-define=SUPABASE_URL="${SUPABASE_URL:-}" \
  --dart-define=SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-}" \
  --dart-define=SITE_URL="${SITE_URL:-}"
python3 -m http.server "$PORT" --directory build/web >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf "http://localhost:$PORT/" >/dev/null && break; sleep 0.5; done
node "$ROOT/scripts/app-preview.mjs" "http://localhost:$PORT/" "$OUT"
