#!/usr/bin/env bash
#
# بوّابةُ القيود المتقابلة (البند ١٨٨ ب): اقتراحٌ من شريكٍ في عقدٍ موقَّع، لا يُقيَّد شيءٌ قبل تأكيد الآخر؛
# وعند التأكيد يُقيَّد الدفتران في معاملةٍ واحدة بالرابط نفسه أو لا يُقيَّد شيء؛ والاعتراض والإلغاء لا يمسّان
# دفتراً؛ ولا يقترح غريبٌ على أحد، ولا يتغيّر قيدٌ متقابلٌ بُتّ فيه.
#
#   ./scripts/verify-ledger-links.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/pg-harness.sh
source "$ROOT/scripts/pg-harness.sh"

pg_start ledger-links

BASE="$(pg_stage "$ROOT/scripts/base-schema.sql" base-schema.sql)"
QUOTES="$(pg_stage "$ROOT/supabase/migrations/20261022040000_market_quotes.sql" quotes.sql)"
LEDGER="$(pg_stage "$ROOT/supabase/migrations/20261024110000_ledger_engine.sql" ledger.sql)"
FARM="$(pg_stage "$ROOT/supabase/migrations/20261024120000_farm_book.sql" farm.sql)"
OVERSIGHT="$(pg_stage "$ROOT/supabase/migrations/20261024130000_oversight.sql" oversight.sql)"
LINKS="$(pg_stage "$ROOT/supabase/migrations/20261024160000_ledger_links.sql" links.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-ledger-links.sql" checks.sql)"

# Supabase's own defaults, so that a revoke in a migration is what the checks meet.
DEFAULTS="$(printf '%s\n' \
  'alter default privileges in schema public grant all on tables to anon, authenticated, service_role;' \
  'alter default privileges in schema public grant execute on functions to public;' \
  'alter default privileges in schema public grant execute on functions to service_role;' \
  | pg_write defaults.sql)"

# What production has and the harness's small base does not: the signed agreements and the season's link to one.
AGREEMENTS="$(cat <<'EOF2' | pg_write agreements.sql
create table partnership_agreements (
  id uuid primary key default gen_random_uuid(),
  ref text,
  owner_id uuid not null,
  investor_id uuid not null,
  model text not null,
  status text not null default 'draft'
);
alter table seasons add column if not exists partnership_id uuid;
EOF2
)"

# `notify_user` is a function of production's notifications migration; the checks need only its body.
NOTIFY="$(cat <<'EOF3' | pg_write notify.sql
create or replace function public.notify_user(p_recipient uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path to 'public' as $f$
begin
  if p_recipient is null then return; end if;
  insert into notifications (recipient_id, kind, title, body, link) values (p_recipient, p_kind, p_title, p_body, p_link);
end $f$;
EOF3
)"

echo "── الأساس";       pg_run_quiet "$BASE"
echo "── الافتراضي";    pg_run_quiet "$DEFAULTS"
echo "── الإشعارات";    pg_run_quiet "$NOTIFY"
echo "── العقود";       pg_run_quiet "$AGREEMENTS"
echo "── الأسعار";      pg_run_quiet "$QUOTES"
echo "── المحرّك";      pg_run_quiet "$LEDGER"
echo "── دفتر المزرعة"; pg_run_quiet "$FARM"
echo "── الإشراف";      pg_run_quiet "$OVERSIGHT"
echo "── القيود المتقابلة"; pg_run "$LINKS" >/dev/null

echo "── الفحوص"
pg_run "$CHECKS"
