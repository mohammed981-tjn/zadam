"""Does the database have what the code says it has? (fix plan, wave one)

    SUPABASE_DB_URL=postgresql://… python3 scripts/db-drift.py

The review of 23 October found three functions written in the migrations and
never applied to production (delivery_confirm, delivery_cancel,
land_inspection_remove_photo) — each one a button that answers with an error.
Nobody noticed, because nothing compared the two. This does, every day: every
function and table that a migration in supabase/migrations creates must exist
in the public schema of the live database. Whatever is missing is printed and
the run fails, so GitHub tells the owner by email the same day.

Read-only: two catalog queries, no rows of any table. It does not compare
bodies or signatures — a function that exists but differs is not caught —
only that what was written was applied.

Something a later migration drops on purpose is not expected (the drops are
read from the migrations too). Anything else that is meant to be absent goes
in scripts/db-drift-ignore.txt, one name a line, with the reason as a comment.
"""

import glob
import os
import re
import subprocess
import sys

URL = os.environ.get("SUPABASE_DB_URL", "")
if not URL:
    print("SUPABASE_DB_URL is not set — nothing to compare against.")
    sys.exit(0)

NAME = r'(?:public\.)?"?([a-z_][a-z0-9_]*)"?'
created = {"function": {}, "table": {}}
dropped = set()
for path in sorted(glob.glob("supabase/migrations/*.sql")):
    sql = re.sub(r"--[^\n]*", "", open(path, encoding="utf-8").read())
    # Statements inside a string (execute $$…$$) count the same: they ran.
    for m in re.finditer(r"create\s+(?:or\s+replace\s+)?function\s+" + NAME + r"\s*\(", sql, re.I):
        created["function"].setdefault(m.group(1).lower(), os.path.basename(path))
    for m in re.finditer(r"create\s+table\s+(?:if\s+not\s+exists\s+)?" + NAME + r"\s*\(", sql, re.I):
        created["table"].setdefault(m.group(1).lower(), os.path.basename(path))
    for m in re.finditer(r"drop\s+(function|table)\s+(?:if\s+exists\s+)?" + NAME, sql, re.I):
        dropped.add((m.group(1).lower(), m.group(2).lower()))

ignored = set()
if os.path.exists("scripts/db-drift-ignore.txt"):
    for line in open("scripts/db-drift-ignore.txt", encoding="utf-8"):
        line = line.split("#", 1)[0].strip()
        if line:
            ignored.add(line.lower())


def live(query):
    out = subprocess.check_output(["psql", URL, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", query], text=True)
    return {x.strip().lower() for x in out.splitlines() if x.strip()}


have = {
    "function": live("select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'"),
    "table": live("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                  "where n.nspname = 'public' and c.relkind in ('r','p','v','m')"),
}

missing = []
for kind in ("table", "function"):
    for name, where in sorted(created[kind].items(), key=lambda kv: kv[1]):
        if name in have[kind] or (kind, name) in dropped or name in ignored:
            continue
        missing.append((kind, name, where))

summary = os.environ.get("GITHUB_STEP_SUMMARY")
lines = []
if missing:
    lines.append(f"### القاعدة تختلف عن الكود: {len(missing)} ناقص")
    lines.append("")
    lines.append("| النوع | الاسم | في الملفّ |")
    lines.append("|---|---|---|")
    for kind, name, where in missing:
        lines.append(f"| {'جدول' if kind == 'table' else 'دالّة'} | `{name}` | `{where}` |")
else:
    n = len(created["function"]) + len(created["table"])
    lines.append(f"### القاعدة توافق الكود: كلّ ما في الهجرات ({n}) موجود")
text = "\n".join(lines)
print(text)
if summary:
    with open(summary, "a", encoding="utf-8") as f:
        f.write(text + "\n")
sys.exit(1 if missing else 0)
