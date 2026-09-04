#!/usr/bin/env bash
#
# عنقودُ PostgreSQL مؤقّت — يُبنى، يُستعمل، ثمّ يُهدم.
#
# WHY THIS FILE EXISTS
#
# Three gates now need a real PostgreSQL: the export corridor, the support
# auto-reply, and the investment audit. Each was carrying its own copy of the
# same forty lines — initdb, start, wait for the socket, tear down — and the
# copies had already started to drift.
#
# WHY IT DETECTS root INSTEAD OF ASSUMING IT
#
# The first two gates were written on a machine where this session runs as
# root, so they used `su postgres` throughout: initdb refuses to run as root,
# and that was the shortest way around it.
#
# A GitHub Actions runner is the opposite case. It runs as an ordinary user
# named `runner`, there is no need to drop privileges, and `su postgres` would
# demand a password and hang. So the gates could not run in CI at all — which is
# why 84 checks on a real database sat outside every automated run, and a
# migration change could go green while breaking a guard.
#
# Hence: as root, drop to the `postgres` user; as anyone else, run directly.
# Both paths produce the same cluster, so a gate behaves identically on a
# developer's machine, in this session, and on a runner.
#
# USAGE
#
#   source "$(dirname "${BASH_SOURCE[0]}")/pg-harness.sh"
#   pg_start export-offers            # اسمٌ يُميّز المجلّد المؤقّت
#   pg_run_quiet "$SOME_FILE.sql"     # يطبّق ملفّاً ويبتلع NOTICE
#   pg_run "$CHECKS.sql"              # يطبّق ويُظهر كلّ شيء
#   pg_stage "$REPO/path.sql" name    # ينسخ ملفّاً إلى مكانٍ يقرؤه العنقود
#
# The trap is installed by pg_start, so the cluster is torn down even when a
# gate fails — which is the normal case while a gate is being written.

# shellcheck shell=bash

PG_DATADIR=""
PG_PORT=""
PG_PSQL=""
PG_AS_POSTGRES=0

pg_find_bin() {
  PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
  if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
    # On a runner PostgreSQL may be installed but not under /usr/lib.
    if command -v pg_config >/dev/null 2>&1; then
      PGBIN="$(pg_config --bindir)"
    fi
  fi
  if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
    echo "لم أجد ثنائيّات PostgreSQL. حدّد PGBIN=/path/to/postgres/bin" >&2
    return 1
  fi
}

# يشغّل أمراً إمّا بالمستخدم postgres (حين نكون root) أو مباشرةً.
pg_sh() {
  if [ "$PG_AS_POSTGRES" = "1" ]; then
    su postgres -c "$1"
  else
    bash -c "$1"
  fi
}

pg_cleanup() {
  [ -n "$PG_DATADIR" ] || return 0
  pg_sh "$PGBIN/pg_ctl -D $PG_DATADIR/data stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PG_DATADIR"
}

pg_start() {
  local label="${1:-gate}"
  pg_find_bin || return 1

  if [ "$(id -u)" = "0" ]; then
    # initdb refuses to run as root, so drop to the postgres user — which also
    # means the directory must live where that user can write, not in the repo.
    PG_AS_POSTGRES=1
  fi

  PG_DATADIR="$(mktemp -d "/var/tmp/${label}-XXXXXX")"
  PG_PORT="${PGPORT:-$(( 5400 + RANDOM % 150 ))}"
  trap pg_cleanup EXIT

  chmod 777 "$PG_DATADIR"
  [ "$PG_AS_POSTGRES" = "1" ] && chown -R postgres "$PG_DATADIR"

  echo "── قاعدةٌ نظيفة في $PG_DATADIR (منفذ $PG_PORT)"
  pg_sh "$PGBIN/initdb -D $PG_DATADIR/data -U postgres" >/dev/null
  pg_sh "$PGBIN/pg_ctl -D $PG_DATADIR/data -o '-k $PG_DATADIR -p $PG_PORT -c listen_addresses=' -l $PG_DATADIR/log start" >/dev/null

  # pg_ctl returns once the postmaster reports ready, but the socket can lag a
  # moment behind it on a cold cluster.
  local i
  for i in $(seq 1 30); do
    pg_sh "$PGBIN/pg_isready -h $PG_DATADIR -p $PG_PORT" >/dev/null 2>&1 && break
    sleep 0.5
  done

  PG_PSQL="$PGBIN/psql -h $PG_DATADIR -p $PG_PORT -U postgres -v ON_ERROR_STOP=1"
}

# ينسخ ملفّاً من المستودع إلى مجلّد العنقود بصلاحيّةِ قراءةٍ للجميع — لأنّ
# المستخدم postgres لا يقرأ بالضرورة مسارَ المستودع.
pg_stage() {
  local src="$1" name="$2"
  cp "$src" "$PG_DATADIR/$name"
  chmod 644 "$PG_DATADIR/$name"
  echo "$PG_DATADIR/$name"
}

# يكتب نصّاً إلى ملفٍّ في مجلّد العنقود (بدل تمريره عبر `su -c` الذي يفسد الاقتباس).
pg_write() {
  local name="$1"
  cat > "$PG_DATADIR/$name"
  chmod 644 "$PG_DATADIR/$name"
  echo "$PG_DATADIR/$name"
}

pg_run_quiet() {
  pg_sh "$PG_PSQL -q -f $1" 2>&1 | grep -v 'NOTICE' || true
}

# A gate's own exit status is the whole point of a gate, and it is easy to lose:
# piping psql through sed hands the pipeline sed's status, which is always 0.
# `pipefail` would cover it, but only if every caller remembers to set it — so
# the status is read explicitly here and returned, whatever the caller's shell
# options happen to be.
pg_run() {
  local status
  pg_sh "$PG_PSQL -f $1" 2>&1 | sed -e 's/^psql:[^ ]* //' -e 's/^NOTICE:  //'
  status="${PIPESTATUS[0]}"
  return "$status"
}
