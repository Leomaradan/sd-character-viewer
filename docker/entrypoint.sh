#!/bin/sh
set -eu

SYNC_ENABLED_RAW="${SD_FIRST_SEEN_SYNC_ENABLED:-1}"
SYNC_INTERVAL_SECONDS="${SD_FIRST_SEEN_SYNC_INTERVAL_SECONDS:-86400}"

is_true() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1 | true | yes | on)
      return 0
      ;;
    0 | false | no | off | "")
      return 1
      ;;
    *)
      echo "[first-seen-sync] Invalid SD_FIRST_SEEN_SYNC_ENABLED value '$1', defaulting to disabled"
      return 1
      ;;
  esac
}

run_first_seen_sync() {
  echo "[first-seen-sync] Starting sync from creation dates"
  if node /app/scripts/sync-first-seen-from-creation-dates.mjs; then
    echo "[first-seen-sync] Sync completed"
  else
    echo "[first-seen-sync] Sync failed, retrying at next interval"
  fi
}


 SYNC_PID=""
 APP_PID=""
 cleanup() {
   if [ -n "${SYNC_PID}" ]; then
     kill "${SYNC_PID}" 2>/dev/null || true
     wait "${SYNC_PID}" 2>/dev/null || true
   fi
   if [ -n "${APP_PID}" ]; then
     kill "${APP_PID}" 2>/dev/null || true
     wait "${APP_PID}" 2>/dev/null || true
   fi
 }
 trap cleanup INT TERM

if is_true "$SYNC_ENABLED_RAW"; then
  run_first_seen_sync

  (
    while true; do
      sleep "$SYNC_INTERVAL_SECONDS"
      run_first_seen_sync
    done
  ) &
  SYNC_PID=$!
else
  echo "[first-seen-sync] Disabled by SD_FIRST_SEEN_SYNC_ENABLED=$SYNC_ENABLED_RAW"
fi

"$@" &
 "$@" &
 APP_PID=$!