#!/usr/bin/env bash
#
# بوّابةُ مفتاح القيد (البند ٢٠٣، متابعة القيد بلا شبكة؛ الهجرة 20261106060000_ledger_client_key.sql): القيد الذي ضاع
# ردُّه فأُرسل مرّةً ثانية بمفتاحه يُحفظ مرّةً ويُرحَّل مرّة؛ ومفاتيح مختلفة قيودٌ مختلفة؛ وما لا مفتاح له كما كان؛
# وغير صاحب الموسم لا يكتب بالمفتاح ولا يقرأ به ولا يصطدم به؛ والمفتاح لا يتغيّر بعد الحفظ؛ وحرّاس الدفتر على حالها.
#
# على السلسلة الكاملة (كبوّابة الوكيل): الكتابة تمرّ بسياسة صاحب الموسم وبزنادات الدفتر والترحيل من هجراتٍ عدّة، وبوّابةٌ
# تختار بعضها لا ترى ما نسيته هجرة.
#
#   ./scripts/verify-ledger-client-key.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-client-key
pg_apply_chain "$ROOT"

echo "── مفتاح القيد"
pg_run "$(pg_stage "$ROOT/scripts/verify-ledger-client-key.sql" checks.sql)"
