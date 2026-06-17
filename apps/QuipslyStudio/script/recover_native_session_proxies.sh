#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION=""
EXECUTE=0
MAX_SOURCE_GB="${QUIPSLY_SAFE_PROXY_MAX_SOURCE_GB:-5}"
MAX_DURATION="${QUIPSLY_SAFE_PROXY_MAX_DURATION_SECONDS:-0}"
TIMEOUT="${QUIPSLY_PROXY_TIMEOUT_SECONDS:-900}"
PROBE_TIMEOUT="${QUIPSLY_SOURCE_PROBE_TIMEOUT_SECONDS:-8}"
KIND="all"
LIMIT="0"
ALLOW_LARGE=0

usage() {
  cat <<'USAGE'
Recover deterministic MediaVault proxies for a native Quipsly session.

Default mode is a dry run. It does not touch originals, run ffmpeg, attach
proxies, or mutate the session.

Usage:
  script/recover_native_session_proxies.sh --session episode-3-premiere-rescue
  script/recover_native_session_proxies.sh --session episode-3-premiere-rescue --execute
  script/recover_native_session_proxies.sh --session episode-3-premiere-rescue --execute --allow-large-source

Options:
  --session NAME          Native session name or absolute .quipsly-session.json path.
  --execute              Generate/attach safe proxies and save the session.
  --kind all|video|audio  Restrict proxy work by media kind. Default: all.
  --limit N              Process at most N reachable lanes. Default: no limit.
  --max-source-gb N      Skip originals larger than N GB. Default: 5.
  --max-duration N       Skip lanes longer than N seconds. Default: disabled.
  --allow-large-source   Remove size/duration caps for an intentional large proxy pass.
  --timeout N            Per-file ffmpeg timeout seconds. Default: 900.
  --probe-timeout N      Per-source probe timeout seconds. Default: 8.

Production invariants:
  - Whole source lanes stay whole.
  - SHOW/SKIP decisions remain metadata overlays.
  - Existing proxies are reused.
  - Missing/offline/protected files are reported, not silently replaced.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --session)
      SESSION="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --kind)
      KIND="${2:-all}"
      shift 2
      ;;
    --limit)
      LIMIT="${2:-0}"
      shift 2
      ;;
    --max-source-gb)
      MAX_SOURCE_GB="${2:-5}"
      shift 2
      ;;
    --max-duration)
      MAX_DURATION="${2:-0}"
      shift 2
      ;;
    --allow-large-source)
      ALLOW_LARGE=1
      shift
      ;;
    --timeout)
      TIMEOUT="${2:-900}"
      shift 2
      ;;
    --probe-timeout)
      PROBE_TIMEOUT="${2:-8}"
      shift 2
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$SESSION" ]]; then
  echo "--session is required" >&2
  usage >&2
  exit 2
fi

mkdir -p "$ROOT_DIR/reports"
STAMP="$(date +%Y%m%d-%H%M%S)"
SAFE_SESSION="$(basename "$SESSION" .quipsly-session.json | tr -c '[:alnum:]_.-' '-')"
REPORT="$ROOT_DIR/reports/${SAFE_SESSION}-proxy-recovery-${STAMP}.json"

ARGS=(
  "$ROOT_DIR/script/prepare_session_proxies.py"
  --session "$SESSION"
  --kind "$KIND"
  --short-first
  --skip-existing
  --timeout "$TIMEOUT"
  --probe-timeout "$PROBE_TIMEOUT"
)

if [[ "$LIMIT" != "0" ]]; then
  ARGS+=(--limit "$LIMIT")
fi

if [[ "$ALLOW_LARGE" == "0" ]]; then
  ARGS+=(--max-source-gb "$MAX_SOURCE_GB")
  if [[ "$MAX_DURATION" != "0" ]]; then
    ARGS+=(--max-duration "$MAX_DURATION")
  fi
fi

if [[ "$EXECUTE" == "1" ]]; then
  ARGS+=(--attach --load-first --save-session "$(basename "$SESSION" .quipsly-session.json)")
else
  ARGS+=(--dry-run)
fi

(
  cd "$ROOT_DIR"
  python3 "${ARGS[@]}"
) | tee "$REPORT"

echo
echo "Proxy recovery report written to: $REPORT"
if [[ "$EXECUTE" != "1" ]]; then
  echo "Dry run only. Add --execute to generate/attach safe proxies."
fi
