#!/usr/bin/env bash
#
# بوّابةُ الردّ الآلي: قاعدةٌ حقيقيّة، ومهلةٌ تُحترم، وإنسانٌ يسبق الآلة.
#
# WHY THIS NEEDS A REAL POSTGRESQL
#
# The whole feature is two SQL statements: a query that decides who is due, and
# an UPDATE whose WHERE clause decides whether the answer may be written at all.
# Neither can be checked in TypeScript — a mocked WHERE clause proves nothing
# about the real one, and the race this is built to survive lives entirely
# inside that clause.
#
# So, like verify-export-offers.sh, this stays out of the `npm run verify` glob
# and is run by hand by anyone touching the support schema:
#
#   ./scripts/verify-support-auto-reply.sh
#
# It builds its own PostgreSQL cluster in a temporary directory, uses it, and
# tears it down.
#
# THE STUBS
#
# The feedback migration is real and applied here verbatim; only what the
# repository does not carry is stubbed — `auth.users`, `notifications`,
# `profiles`, and the Supabase roles the GRANT/REVOKE lines name. `auth.uid()`
# reads a table so a check can act as somebody.
#
# And the permission section runs as `anon` and `authenticated` — the roles that
# actually reach these functions in production — never as the cluster owner: a
# superuser bypasses row-level security and function ACLs alike, so a door
# checked as one is a door checked open.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FEEDBACK="$ROOT/supabase/migrations/20260818180000_feedback.sql"
AUTOREPLY="$ROOT/supabase/migrations/20260904100000_support_auto_reply.sql"
CHECKS="$ROOT/scripts/verify-support-auto-reply.sql"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "لم أجد ثنائيّات PostgreSQL. حدّد PGBIN=/path/to/postgres/bin" >&2
  exit 1
fi

DATADIR="$(mktemp -d /var/tmp/support-auto-reply-XXXXXX)"
PORT="${PGPORT:-5441}"

cleanup() {
  su postgres -c "$PGBIN/pg_ctl -D $DATADIR/data stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$DATADIR"
}
trap cleanup EXIT

chmod 777 "$DATADIR"
chown -R postgres "$DATADIR"

echo "── قاعدةٌ نظيفة في $DATADIR"
su postgres -c "$PGBIN/initdb -D $DATADIR/data -U postgres" >/dev/null
su postgres -c "$PGBIN/pg_ctl -D $DATADIR/data -o '-k $DATADIR -p $PORT -c listen_addresses=' -l $DATADIR/log start" >/dev/null

for _ in $(seq 1 20); do
  su postgres -c "$PGBIN/pg_isready -h $DATADIR -p $PORT" >/dev/null 2>&1 && break
  sleep 0.5
done

PSQL="$PGBIN/psql -h $DATADIR -p $PORT -U postgres -v ON_ERROR_STOP=1"

cat > "$DATADIR/stubs.sql" <<'SQL'
create schema if not exists auth;
create table auth.users (id uuid primary key);
create table profiles (id uuid primary key, role text default 'farmer');

-- الإشعاراتُ يكتبها زنادُ الملاحظات، فلا بدّ منها كي تُطبَّق الهجرةُ كما هي.
create table notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid,
  kind         text not null,
  title        text,
  body         text,
  link         text,
  created_at   timestamptz not null default now(),
  constraint notifications_kind_check check (kind is not null)
);

create table _who (uid uuid);
insert into _who values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who $$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- أدوارُ Supabase التي تسمّيها أسطرُ المنح والسحب في الهجرة.
-- وهي نفسُها الأدوارُ التي يُختبر بها البابُ في القسم (د)، لا دورٌ مخترعٌ
-- للاختبار: `anon` هو الدورُ الذي يحمله المفتاحُ المنشور في كلّ صفحة.
create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin;
SQL
chmod 644 "$DATADIR/stubs.sql"

cp "$FEEDBACK"  "$DATADIR/feedback.sql"
cp "$AUTOREPLY" "$DATADIR/autoreply.sql"
cp "$CHECKS"    "$DATADIR/checks.sql"
chmod 644 "$DATADIR/feedback.sql" "$DATADIR/autoreply.sql" "$DATADIR/checks.sql"

echo "── الأساس"
su postgres -c "$PSQL -q -f $DATADIR/stubs.sql"

echo "── ملاحظاتُ الزوّار"
su postgres -c "$PSQL -q -f $DATADIR/feedback.sql" 2>&1 | grep -v 'NOTICE' || true

echo "── الردّ الآلي"
su postgres -c "$PSQL -q -f $DATADIR/autoreply.sql" 2>&1 | grep -v 'NOTICE' || true

# إعادةُ التطبيق ليست تزيّناً: هجرةٌ لا تُعاد لا تُستأنَف بعد فشلٍ جزئيّ.
echo "── وثانيةً — إعادةُ التطبيق لا تكسر"
su postgres -c "$PSQL -q -f $DATADIR/autoreply.sql" 2>&1 | grep -v 'NOTICE' || true

echo "── الحرّاس"
su postgres -c "$PSQL -f $DATADIR/checks.sql" 2>&1 | sed -e 's/^psql:[^ ]* //' -e 's/^NOTICE:  //'
