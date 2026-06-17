#!/bin/sh
set -eu

SYNC_ENABLED="${SD_FIRST_SEEN_SYNC_ENABLED:-1}"
SYNC_INTERVAL_SECONDS="${SD_FIRST_SEEN_SYNC_INTERVAL_SECONDS:-86400}"

run_first_seen_sync() {
  echo "[first-seen-sync] Starting sync from creation dates"
  if node /app/scripts/sync-first-seen-from-creation-dates.mjs; then
    echo "[first-seen-sync] Sync completed"
  else
    echo "[first-seen-sync] Sync failed, retrying at next interval"
  fi
}

if [ "$SYNC_ENABLED" = "1" ]; then
  run_first_seen_sync

  (
    while true; do
      sleep "$SYNC_INTERVAL_SECONDS"
      run_first_seen_sync
    done
  ) &
else
  echo "[first-seen-sync] Disabled by SD_FIRST_SEEN_SYNC_ENABLED=$SYNC_ENABLED"
fi

exec "$@"