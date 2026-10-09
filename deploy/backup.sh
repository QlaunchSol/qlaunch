#!/usr/bin/env bash
# Nightly database dump (custom format, restorable with pg_restore), keeping
# the last 14. Run by launchpad-backup.timer. Copy ~/backups off this machine
# from time to time: a dump on the same disk doesn't survive losing the disk.
set -euo pipefail
DIR=/home/deploy/backups
mkdir -p "$DIR" && chmod 700 "$DIR"
URL=$(grep '^DATABASE_URL=' /home/deploy/launchpad/.env.production | cut -d= -f2-)
pg_dump --format=custom --no-owner "$URL" > "$DIR/launchpad-$(date -u +%Y%m%d-%H%M).dump"
ls -1t "$DIR"/launchpad-*.dump | tail -n +15 | xargs -r rm --
