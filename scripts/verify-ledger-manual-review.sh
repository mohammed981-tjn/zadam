#!/usr/bin/env bash
#
# بوّابةُ القيد اليدويّ والمراجعة (البند ٢٠٥؛ الهجرة 20261106070000_ledger_manual_review.sql): القيد غير المتوازن يُرفض،
# والغريب يُرفض، وقيد المُعِدّ لا يُرحَّل حتى يعتمده صاحب الدفتر، والردّ يُسجَّل، وسجلّ التدقيق لا يُعدَّل ولا يُحذف ولو
# بمفتاح الخدمة أو المدير، والفترة المقفلة ترفض القيد، وقيد الإقفال يصفّر الإيراد والمصروف في الأرباح المحتجزة ولا
# يتكرّر، والقيود الجاهزة تُرحَّل متوازنة، وتقرير الاستثناءات يجد كلّ نوع.
#
# على السلسلة الكاملة: القيد يمرّ بدالّة النشر وحرّاس المحرّك وزنادات السجلّ من هجراتٍ عدّة، وبوّابةٌ تختار بعضها لا ترى
# ما نسيته هجرة.
#
#   ./scripts/verify-ledger-manual-review.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-manual-review
pg_apply_chain "$ROOT"

echo "── القيد اليدويّ والمراجعة"
pg_run "$(pg_stage "$ROOT/scripts/verify-ledger-manual-review.sql" checks.sql)"
