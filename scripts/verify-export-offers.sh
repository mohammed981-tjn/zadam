#!/usr/bin/env bash
#
# بوّابةُ ممرّ الصادر: تُنشئ قاعدةً نظيفة، وتُطبّق الهجرة، وتُجرّب كلَّ حارسٍ
# بما وُضع لمنعه.
#
# WHY A SHELL SCRIPT AND NOT ANOTHER verify-*.ts
#
# `npm run verify` globs scripts/verify-*.ts, and every one of those runs on
# plain Node with no services. This one needs a real PostgreSQL, because what it
# checks is not TypeScript logic — it is what the database itself refuses. A
# constraint mocked in TypeScript proves nothing about the constraint.
#
# So it stays out of that glob deliberately, and is run by hand or by anyone
# touching the export schema:
#
#   ./scripts/verify-export-offers.sh
#
# It needs a PostgreSQL 16 binary directory and nothing else. It builds its own
# cluster in a temporary directory, uses it, and tears it down.
#
# THE STUBS, AND WHY THEY ARE SO SMALL
#
# The migration leans on `profiles`, `seasons`, `auth.uid()` and `is_admin()`,
# none of which this repository creates — the base schema is still outside the
# migrations directory. Rather than pretend otherwise, the stubs below are the
# minimum that lets the guards be exercised, and `auth.uid()` reads a table so
# one script can act as a farmer, another farmer, and an administrator in turn.
#
# And the permission checks run as an ordinary role, never as the cluster owner:
# a superuser bypasses row-level security entirely, so checking policies as one
# produces a pass that means nothing.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260903170000_export_offers.sql"
CHECKS="$ROOT/scripts/verify-export-offers.sql"

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "لم أجد ثنائيّات PostgreSQL. حدّد PGBIN=/path/to/postgres/bin" >&2
  exit 1
fi

# initdb refuses to run as root, so the cluster is built and driven as the
# postgres user — which also means the directory must be somewhere that user can
# write, not the repository.
DATADIR="$(mktemp -d /var/tmp/export-offers-XXXXXX)"
PORT="${PGPORT:-5439}"

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

# pg_ctl returns once the postmaster reports ready, but the socket can lag a
# moment behind it on a cold cluster.
for _ in $(seq 1 20); do
  su postgres -c "$PGBIN/pg_isready -h $DATADIR -p $PORT" >/dev/null 2>&1 && break
  sleep 0.5
done

PSQL="$PGBIN/psql -h $DATADIR -p $PORT -U postgres -v ON_ERROR_STOP=1"

# Written to a file rather than passed through `su -c`, which mangles quoting.
cat > "$DATADIR/stubs.sql" <<'SQL'
create schema if not exists auth;
create table profiles (id uuid primary key, role text default 'farmer', publish_record boolean default false);
create table seasons  (id uuid primary key default gen_random_uuid(), owner_id uuid references profiles(id));

-- Swappable identity: one script acts as farmer, other farmer, administrator.
create table _who (uid uuid);
insert into _who values (null);
create or replace function auth.uid() returns uuid language sql stable as $$ select uid from _who $$;
create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- The ordinary role the permission section runs as.
create role app_user nologin;
SQL
chmod 644 "$DATADIR/stubs.sql"

cp "$MIGRATION" "$DATADIR/migration.sql"
cp "$CHECKS"    "$DATADIR/checks.sql"
chmod 644 "$DATADIR/migration.sql" "$DATADIR/checks.sql"

echo "── الأساس"
su postgres -c "$PSQL -q -f $DATADIR/stubs.sql"

echo "── الهجرة"
su postgres -c "$PSQL -q -f $DATADIR/migration.sql" 2>&1 | grep -v 'NOTICE' || true

# Applying twice is not a nicety: a migration that cannot be re-run cannot be
# recovered after a partial failure, and this one is full of CREATE POLICY,
# which has no IF NOT EXISTS in PostgreSQL.
echo "── والهجرةُ ثانيةً — إعادةُ التطبيق لا تكسر"
su postgres -c "$PSQL -q -f $DATADIR/migration.sql" 2>&1 | grep -v 'NOTICE' || true

echo "── الحرّاس"
su postgres -c "$PSQL -f $DATADIR/checks.sql" 2>&1 | sed -e 's/^psql:[^ ]* //' -e 's/^NOTICE:  //'
