#!/usr/bin/env bash
#
# بوّابةُ الوكيل يكتب مراحل الموسم وأدلّتها (البند ١٦٩؛ قرار المالك 6 نوفمبر 2026: «نعم، ويُعلَّم أنه من الوكيل»؛
# الهجرة 20261106050000_agent_writes_stages.sql): لا يكتب إلا وكيلٌ موثّقٌ بإذنٍ قائمٍ في المواسم، في موسمٍ جارٍ،
# وبالحرّاس نفسها؛ وما كتبه معلَّمٌ ومسجَّلٌ ويُخبَر به المزارع، ويعترض عليه المزارع وحده فتُفتح المرحلة، ودليلها يبقى.
#
# على السلسلة الكاملة (كبوّابة الحذف من التخزين): الاعتماد يمرّ بحرّاسٍ من خمس هجراتٍ وبسياسات الدلو، وبوّابةٌ تختار
# بعضها وتمنح نفسها ما تقرؤه لا ترى ما نسيته هجرة.
#
#   ./scripts/verify-agent-stages.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start agent-stages
pg_apply_chain "$ROOT"

echo "── الوكيل يكتب المراحل"
pg_run "$(pg_stage "$ROOT/scripts/verify-agent-stages.sql" checks.sql)"
