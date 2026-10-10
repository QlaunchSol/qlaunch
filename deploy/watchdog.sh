#!/usr/bin/env bash
# Restarts the app if it stops answering /api/health for 3 checks in a row
# (run every minute by launchpad-watchdog.timer, as root). A deploy's few
# seconds of downtime never add up to 3 minutes; a service stopped on purpose
# is left alone.
set -u
state=/run/launchpad-watchdog.failures
systemctl is-active --quiet launchpad || { rm -f "$state"; exit 0; }
if curl -fsS --max-time 10 http://127.0.0.1:3000/api/health | grep -q '"ok":true'; then
  rm -f "$state"
  exit 0
fi
failures=$(( $(cat "$state" 2>/dev/null || echo 0) + 1 ))
echo "$failures" > "$state"
echo "health check failed ($failures in a row)"
if [ "$failures" -ge 3 ]; then
  echo "restarting launchpad"
  rm -f "$state"
  systemctl restart launchpad
fi
