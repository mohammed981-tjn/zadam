#!/usr/bin/env bash
#
# بوّابةُ إصلاحات مراجعتَي 6 نوفمبر (البند ٢٠٩؛ الهجرة 20261106100000_ledger_review_fixes.sql): لا يُقفل دخل موسمٍ مرّتين
# (الموسم اليوم ثمّ الفترة حتى أمس)، وقائمة الملكيّة تُقفل على الميزانيّة في فترةٍ فيها إقفال، والميزانيّة التقديريّة والإيضاحات
# لا تريان قيد الإقفال، وتبديل «راجع كلّ قيد» بين المحاولة وإعادتها لا يكتب مرّتين، ووسمٌ ليس لصاحب الدفتر يُرفض على سطر
# المُعِدّ والمسوّدة تحفظ السعر ومعادل كلّ سطر، ودعوة المحاسب جوابها واحد وكلّ محاولةٍ تُعدّ والجوّال بهويّة الدخول، ولا يعتمد
# مسوّدةَ دفتر المنصّة من أعدّها.
#
# على السلسلة الكاملة: كلُّ إصلاحٍ يستبدل دالّةً من هجرةٍ سبقته، وبوّابةٌ تختار بعضها لا ترى ما نسيته هجرة.
#
#   ./scripts/verify-ledger-review-fixes.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-review-fixes
pg_apply_chain "$ROOT"

echo "── إصلاحات مراجعتَي 6 نوفمبر"
pg_run "$(pg_stage "$ROOT/scripts/verify-ledger-review-fixes.sql" checks.sql)"
