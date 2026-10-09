#!/usr/bin/env bash
# Runs a heavy command (type-check, tests…) in its own memory-capped systemd
# unit, so it can never push the machine into an OOM that takes down other
# work. Usage: deploy/capped.sh npx tsc --noEmit
set -uo pipefail
cd "$(dirname "$0")/.."
unit="capped-$$"
systemd-run --user --unit="$unit" --wait --pipe --quiet --collect \
  --working-directory="$PWD" -p MemoryHigh=450M -p MemoryMax=550M -p MemorySwapMax=4G -p Nice=10 \
  -E PATH="$PATH" -E NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1600}" -- "$@"
