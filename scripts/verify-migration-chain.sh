#!/usr/bin/env bash
#
# السلسلة الكاملة: كلّ هجرةٍ بالترتيب على قاعدةٍ فارغة بصلاحيّات Supabase الافتراضيّة، ثمّ ما يقرؤه الموقع
# بحساب عضوٍ عاديّ (فحص 3 نوفمبر 2026: code-quality-1 وdb-b-1..3).
#
# WHY
#
# Every other gate loads the few migrations its feature needs, then grants itself what it reads. That is how three
# faults reached the pending bundle with every gate green: a check constraint calling a function no member could
# run, four tables no member could read, and two policies reading a column members had lost. Production has
# revoked default privileges since 20261024030000; a gate that re-grants them cannot see what a migration forgot.
#
# This gate applies all of supabase/migrations in order, with only the defaults Supabase starts every project with
# (scripts/supabase-platform.sql), and fails on the first migration that does not apply. Then, as a signed-in member:
#   A) every table the site reads with `.from("…")` can be read (policy subqueries included);
#   B) every function a CHECK constraint calls can be executed;
#   C) every function the site calls with `.rpc("…")` exists, and the ones a member cannot execute are exactly the
#      server-only list in verify-migration-chain.sql (a new one is a decision, not a detail).
#
#   ./scripts/verify-migration-chain.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/scripts/pg-harness.sh"

pg_start migration-chain

pg_apply_chain "$ROOT"

# What the site reads and calls, from its own source, so the list cannot fall behind it.
TABLES="$(grep -rhoE '\.from\("[a-z_]+"\)' "$ROOT/src" --include=*.ts --include=*.tsx | sed -E 's/.*"([a-z_]+)".*/\1/' | sort -u | paste -sd, -)"
RPCS="$(grep -rhoE '\.rpc\("[a-z_]+"' "$ROOT/src" --include=*.ts --include=*.tsx | sed -E 's/.*"([a-z_]+)"/\1/' | sort -u | paste -sd, -)"
LISTS="$(printf "select set_config('chain.tables', '%s', false), set_config('chain.rpcs', '%s', false);\n" "$TABLES" "$RPCS" | pg_write lists.sql)"
CHECKS="$(pg_stage "$ROOT/scripts/verify-migration-chain.sql" checks.sql)"
cat "$LISTS" "$CHECKS" | pg_write run.sql >/dev/null
pg_run "$PG_DATADIR/run.sql"
