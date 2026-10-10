#!/usr/bin/env bash
# Builds and deploys on this one machine.
#
# The build runs in its own systemd unit with a hard RAM cap (spilling to
# swap), so a build that outgrows the 1 GB machine is killed alone, never the
# live site or the shell it was started from. It builds into .next-build
# (which keeps Turbopack's cache between builds) while the site keeps serving
# .next-live; a successful build is copied over and the service restarted.
#
#   deploy/build.sh            build, then swap in and restart
#   deploy/build.sh --no-swap  build only
set -euo pipefail
cd "$(dirname "$0")/.."
LOG="${BUILD_LOG:-/tmp/launchpad-build.log}"
SWAP=1
[ "${1:-}" = "--no-swap" ] && SWAP=0

systemctl --user stop launchpad-build 2>/dev/null || true
systemctl --user reset-failed launchpad-build 2>/dev/null || true
echo "building… (log: $LOG)"
start=$(date +%s)
set +e
systemd-run --user --unit=launchpad-build --wait --quiet \
  --working-directory="$PWD" \
  -p MemoryHigh=450M -p MemoryMax=550M -p MemorySwapMax=5G -p CPUWeight=30 -p Nice=10 \
  -E PATH="$PATH" -E NODE_OPTIONS=--max-old-space-size=2048 -E NEXT_TELEMETRY_DISABLED=1 \
  -E NEXT_DIST_DIR=.next-build -E BUILD_LOG="$LOG" \
  bash -c 'set -a; [ -f .env.production ] && . ./.env.production; set +a
    node_modules/.bin/next build > "$BUILD_LOG" 2>&1; rc=$?
    cg=/sys/fs/cgroup$(cut -d: -f3 /proc/self/cgroup)
    echo "$(( $(cat $cg/memory.peak) / 1048576 )) MB RAM, $(( $(cat $cg/memory.swap.peak) / 1048576 )) MB swap" > "$BUILD_LOG.peak"
    exit $rc'
status=$?
set -e
peak=$(cat "$LOG.peak" 2>/dev/null || true)
systemctl --user reset-failed launchpad-build 2>/dev/null || true
echo "build exit $status after $(( $(date +%s) - start ))s; peak ${peak:-n/a}"
if [ $status -ne 0 ]; then
  sed 's/\x1b\[[0-9;]*m//g' "$LOG" | tail -30
  exit $status
fi
[ $SWAP -eq 1 ] || exit 0

# Database schema first (each migration runs once), so new code never meets an old schema.
(set -a; . ./.env.production; set +a; node_modules/.bin/tsx scripts/migrate.mts)

# Swap in, keeping the previous build until the new one answers /api/health;
# if it doesn't, roll back to the previous build.
rm -rf .next-live.new
rsync -a --exclude cache .next-build/ .next-live.new/
mkdir -p .next-live.new/cache
setfacl -R -m u:qlaunch:rX .next-live.new && setfacl -m u:qlaunch:rwX .next-live.new/cache
healthy() {
  for i in $(seq 1 40); do
    [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health)" = 200 ] && return 0
    sleep 1
  done
  return 1
}
sudo systemctl stop launchpad
rm -rf .next-live.old
[ -d .next-live ] && mv .next-live .next-live.old
mv .next-live.new .next-live
sudo systemctl start launchpad
if healthy; then
  rm -rf .next-live.old
  echo "live: healthy"
  exit 0
fi
echo "new build is unhealthy (journalctl -u launchpad -n 50)" >&2
if [ -d .next-live.old ]; then
  sudo systemctl stop launchpad
  rm -rf .next-live.failed && mv .next-live .next-live.failed && mv .next-live.old .next-live
  sudo systemctl start launchpad
  healthy && echo "rolled back to the previous build; the failed one is in .next-live.failed" >&2
fi
exit 1
