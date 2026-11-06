#!/usr/bin/env bash
#
# بوّابةُ القوائم الماليّة الكاملة (البند ٢٠٥؛ الهجرة 20261106080000_ledger_statements_plus.sql): الفترة المقابلة (الشهر
# والسنة والموسم)، وأعمدة المقارنة لقائمة الدخل والميزانيّة والتدفّقات على دفترٍ مزروع وتطابقها مع التقارير القائمة،
# وأعمار الذمم ببنودها وسدادها ومن الأقدم ومجموعها رصيد الحساب، والميزانيّة التقديريّة مقابل الفعليّ لكلّ مرحلة، وقائمة
# التغيّر في حقوق الملكيّة تُقفل على ميزانيّة يومها، والإيضاحات — والغريب والزائر والمدير في غير فحصٍ يُرفضون.
#
# على السلسلة الكاملة: الأرقام تمرّ بالمحرّك ودفتر المزرعة والتسوية والتقارير من هجراتٍ عدّة.
#
#   ./scripts/verify-ledger-statements.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-statements
pg_apply_chain "$ROOT"

echo "── القوائم الماليّة"
pg_run "$(pg_stage "$ROOT/scripts/verify-ledger-statements.sql" checks.sql)"
