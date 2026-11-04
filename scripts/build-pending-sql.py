#!/usr/bin/env python3
"""Builds the one SQL file that brings the site's database up to the migrations (docs/sql/pending-*.sql).

    python3 scripts/build-pending-sql.py OUT APPLIED_NAMES_FILE --from VERSION [--hold VERSION=reason ...]

APPLIED_NAMES_FILE lists the names the site's schema_migrations already holds, one per line (`select name from
supabase_migrations.schema_migrations`). Names, not versions: most migrations were applied through the dashboard or
the MCP tool, which records its own timestamp (password_reset_requests is 20261026050000 here and 20261026101722 on the
site). Every migration file from VERSION on whose name the site does not hold, and not held back, goes in, in order,
each followed by its row in schema_migrations, all inside one transaction: if any statement fails nothing is applied.
Files before VERSION are the drift guard's (scripts/db-drift.py, weekly), not this file's. A held version is named in
the header with its reason.

Written on 3 November 2026 (audit code-quality-6, db-b-7): the bundle had been assembled by hand, and its header said
"everything not applied" while two migrations were missing from it.
"""
import os, re, sys

out, applied_file = sys.argv[1], sys.argv[2]
holds = {}
start = None
args = sys.argv[3:]
while args:
    if args[0] == "--from":
        start = args[1]
        args = args[2:]
    elif args[0] == "--hold":
        v, _, why = args[1].partition("=")
        holds[v] = why
        args = args[2:]
    else:
        sys.exit(f"unknown argument {args[0]}")

applied = {l.strip() for l in open(applied_file) if l.strip()}
root = os.path.join(os.path.dirname(__file__), "..", "supabase", "migrations")
files = sorted(f for f in os.listdir(root) if re.match(r"^\d{14}_.+\.sql$", f))
# A migration applied under another version (applied by hand with its own timestamp) is named here by its file's name.

if not start:
    sys.exit("--from VERSION is required")
files = [f for f in files if f[:14] >= start]
take = [f for f in files if f[15:-4] not in applied and f[:14] not in holds]
held = [f for f in files if f[:14] in holds]

lines = [
    "-- ما لم يُطبَّق على قاعدة الموقع من الهجرات، بالترتيب، مبنيٌّ بـ scripts/build-pending-sql.py لا باليد.",
    "-- معاملةٌ واحدة: إن توقّف عند خطأ لا يُطبَّق شيءٌ منه.",
]
if held:
    lines.append("-- يُطبَّق لاحقاً لا الآن:")
    for f in held:
        lines.append(f"--   {f}: {holds[f[:14]]}")
lines += ["begin;", ""]
for f in take:
    version, name = f[:14], f[15:-4]
    body = open(os.path.join(root, f), encoding="utf-8").read().rstrip("\n")
    lines += [f"-- ═══ {f} ═══", body, "",
              f"insert into supabase_migrations.schema_migrations (version, name) values ('{version}', '{name}') on conflict do nothing;",
              ""]
lines.append("commit;")
open(out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
print(f"{len(take)} migrations in {out}" + (f"; held: {', '.join(f[:14] for f in held)}" if held else ""))
for f in take:
    print("  ", f)
