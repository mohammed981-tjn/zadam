#!/usr/bin/env bash
#
# بوّابةُ جواز المزرعة — والسجلُّ لا يعدّ إلّا ما حدث.
#
#   ./scripts/verify-farm-passport.sh
#
# WHY THE ARITHMETIC IS THE SMALL HALF
#
# `farmer_season_records` returns budgets, costs and revenue for **any** owner
# id handed to it and asks nothing about who is asking. So this gate has two
# jobs and the second matters more than the first: prove that the counts now
# match the rule the completion trigger already enforces, and prove that the
# `drop` this migration had to perform did not hand `EXECUTE` back to `PUBLIC`
# on the way past. A dropped-and-recreated function is public by default, and
# that is precisely the hole 20260903090000 was written to close.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start farm-passport

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
POLICIES="$(pg_stage "$ROOT/supabase/migrations/20260817120000_document_existing_policies_and_guards.sql" policies.sql)"
CONSENT="$(pg_stage "$ROOT/supabase/migrations/20260825120000_publish_record_consent.sql" consent.sql)"
RECORD="$(pg_stage "$ROOT/supabase/migrations/20260905090000_the_record_counts_only_what_happened.sql" record.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-farm-passport.sql" checks.sql)"

# ولا تُنصَّب `20260903120000` هنا. تُعلن `match_knowledge_entries` بنوعٍ اسمُه
# `extensions.vector` — وهو مسارُ Supabase للإضافة، بينما تُنصّبها التجهيزةُ في
# `public`. ولا حاجةَ إليها أصلاً: `public_farmer_profile` تأتي من هجرة
# الموافقة، و`farmer_season_records` تُسقِطها هجرةُ السجلّ وتُنشئها بصلاحيّاتها.
# وتنصيبُ هجرةٍ تفشل في منتصفها كان سيختبر حالةً لم توجد في الإنتاج قطّ.
echo "── الأساس";            pg_run_quiet "$BASE"
echo "── السياسات والحرّاس";  pg_run_quiet "$POLICIES"
echo "── موافقة النشر";       pg_run_quiet "$CONSENT"
echo "── السجلّ الصادق";      pg_run_quiet "$RECORD"

# مرّتين: الهجرةُ تُسقط الدالّةَ وتُنشئها، وهجرةٌ لا تُعاد لا تُطبَّق على قاعدةٍ
# سبق أن رأت نصفَها.
echo "── وثانيةً";            pg_run_quiet "$RECORD"

echo "── الحرّاس"
pg_run "$CHECKS"
