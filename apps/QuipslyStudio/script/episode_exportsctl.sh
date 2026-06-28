#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_EXPORT_ROOT="/Volumes/My Passport/Episode_and_Shorts_Test"
EXPORT_ROOT="${QUIPSLY_VERSIONED_EXPORT_ROOT:-$DEFAULT_EXPORT_ROOT}"
BLOCKER_DOC="/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md"

usage() {
  cat <<'USAGE'
QuipslyStudio episode export control

Usage:
  script/episode_exportsctl.sh prepare-v001
  script/episode_exportsctl.sh current-blockers
  script/episode_exportsctl.sh summary
  script/episode_exportsctl.sh open
  script/episode_exportsctl.sh open-blockers

This wrapper manages the external-drive Episode_and_Shorts_Test workspace.
It only stages derivative/proxy export evidence and gap reports; it never
mutates original source media.
USAGE
}

case "${1:-}" in
  prepare-v001|prepare|refresh)
    python3 "$APP_ROOT/script/prepare_versioned_export_workspace.py"
    python3 "$APP_ROOT/script/build_current_production_blocker_doc.py" "$EXPORT_ROOT" >/dev/null
    ;;
  current-blockers|review-blockers)
    python3 "$APP_ROOT/script/build_current_production_blocker_doc.py" "$EXPORT_ROOT"
    ;;
  summary)
    cat "$EXPORT_ROOT/versioned-export-workspace-summary.json"
    ;;
  open)
    /usr/bin/open "$EXPORT_ROOT"
    ;;
  open-blockers|blockers)
    if [[ ! -f "$BLOCKER_DOC" ]]; then
      python3 "$APP_ROOT/script/build_current_production_blocker_doc.py" "$EXPORT_ROOT" >/dev/null
    fi
    /usr/bin/open "$BLOCKER_DOC"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac
