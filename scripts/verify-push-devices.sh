#!/usr/bin/env bash
#
# بوّابةُ إشعارات الجوّال (البند ٢٠٧؛ الهجرة 20261106090000_push_devices.sql): رمز الجوّال لصاحب الجلسة وحده، وعشرة
# أجهزةٍ للحساب، والمفتاح لصاحبه؛ والإشعار يأخذه المُرسِل مرّةً ولا يعيده العضو؛ ومن أطفأ المفتاح والحساب المُغلَق والقديم
# لا يصلهم شيء؛ والجرس يدقّ مرّةً لكلّ جملة وحين يكون للمستلم جهاز، ولا يمنع الإشعار إن تعطّل.
#
# على السلسلة الكاملة: الإشعارات وزناداتها والحساب المُغلَق من هجراتٍ عدّة.
#
#   ./scripts/verify-push-devices.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start push-devices
pg_apply_chain "$ROOT"

echo "── إشعارات الجوّال"
pg_run "$(pg_stage "$ROOT/scripts/verify-push-devices.sql" checks.sql)"
