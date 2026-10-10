#!/usr/bin/env bash
# Database dump (custom format, restorable with pg_restore), run hourly by
# launchpad-backup.timer, keeping the last 72 (three days). Each dump is
# written to a temp file, checked with pg_restore --list, then kept. The
# password comes from ~/.pgpass, never the command line. Copy ~/backups off
# this machine now and then: a dump on the same disk doesn't survive the disk.
set -euo pipefail
umask 077
DIR=/home/deploy/backups
mkdir -p "$DIR" && chmod 700 "$DIR"
URL=$(grep '^DATABASE_URL=' /home/deploy/launchpad/.env.production | cut -d= -f2-)
# postgres://user:pass@host:port/db → ~/.pgpass line host:port:db:user:pass
python3 -I - "$URL" > /home/deploy/.pgpass <<'PY'
import sys, urllib.parse as u
p = u.urlparse(sys.argv[1])
print(f"{p.hostname}:{p.port or 5432}:{p.path.lstrip('/')}:{p.username}:{u.unquote(p.password or '')}")
PY
chmod 600 /home/deploy/.pgpass
NOPASS=$(python3 -I -c "import sys, urllib.parse as u; p=u.urlparse(sys.argv[1]); print(f'postgres://{p.username}@{p.hostname}:{p.port or 5432}{p.path}')" "$URL")
STAMP=$(date -u +%Y%m%d-%H%M)
TMP="$DIR/.launchpad-$STAMP.dump.tmp"
pg_dump --format=custom --no-owner --dbname="$NOPASS" > "$TMP"
pg_restore --list "$TMP" > /dev/null   # refuses a truncated or corrupt dump
mv "$TMP" "$DIR/launchpad-$STAMP.dump"
ls -1t "$DIR"/launchpad-*.dump | tail -n +73 | xargs -r rm --
