#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
shift 2 >/dev/null 2>&1 || true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/QuipslyMac"
LOG_DIR="$APP_SUPPORT/render-logs/$PROJECT_SLUG/$EPISODE_SLUG"
WIDTH="${QUIPSLY_DRAFT_EXPORT_WIDTH:-1280}"
HEIGHT="${QUIPSLY_DRAFT_EXPORT_HEIGHT:-720}"
FPS="${QUIPSLY_DRAFT_EXPORT_FPS:-24}"
CHUNK_SECONDS="${QUIPSLY_DRAFT_EXPORT_CHUNK_SECONDS:-60}"
CHUNK_TIMEOUT_MS="${QUIPSLY_DRAFT_EXPORT_CHUNK_TIMEOUT_MS:-180000}"
START_CHUNK=""
ONLY_CHUNK=""
BACKGROUND=0
DRY_RUN=0

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --background)
      BACKGROUND=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --width)
      WIDTH="$2"
      shift 2
      ;;
    --height)
      HEIGHT="$2"
      shift 2
      ;;
    --fps)
      FPS="$2"
      shift 2
      ;;
    --chunk-seconds)
      CHUNK_SECONDS="$2"
      shift 2
      ;;
    --chunk-timeout-ms)
      CHUNK_TIMEOUT_MS="$2"
      shift 2
      ;;
    --start-chunk)
      START_CHUNK="$2"
      shift 2
      ;;
    --only-chunk)
      ONLY_CHUNK="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

mkdir -p "$LOG_DIR"
STAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
LOG_FILE="$LOG_DIR/$EPISODE_SLUG-draft-export-$STAMP.log"
JOB_FILE="$LOG_DIR/$EPISODE_SLUG-draft-export-$STAMP.job.sh"

cd "$ROOT_DIR"

COMMAND=(
  node script/render_program_chunked_export.mjs
  "$PROJECT_SLUG"
  "$EPISODE_SLUG"
  --width "$WIDTH"
  --height "$HEIGHT"
  --fps "$FPS"
  --chunk-seconds "$CHUNK_SECONDS"
  --chunk-timeout-ms "$CHUNK_TIMEOUT_MS"
)

if [[ -n "$START_CHUNK" ]]; then
  COMMAND+=(--start-chunk "$START_CHUNK")
fi

if [[ -n "$ONLY_CHUNK" ]]; then
  COMMAND+=(--only-chunk "$ONLY_CHUNK")
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  COMMAND+=(--dry-run)
fi

{
  echo "== Quipsly Mac draft export =="
  echo "Project: $PROJECT_SLUG"
  echo "Episode: $EPISODE_SLUG"
  echo "Mode: $([[ "$DRY_RUN" -eq 1 ]] && echo dry-run || echo render)"
  echo "Dimensions: ${WIDTH}x${HEIGHT} @ ${FPS}fps"
  echo "Chunk seconds: $CHUNK_SECONDS"
  echo "Chunk timeout ms: $CHUNK_TIMEOUT_MS"
  echo "Start chunk: ${START_CHUNK:-all}"
  echo "Only chunk: ${ONLY_CHUNK:-none}"
  echo "Started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Command: ${COMMAND[*]}"
  echo
} >"$LOG_FILE"

if [[ "$BACKGROUND" -eq 1 ]]; then
  {
    echo '#!/usr/bin/env bash'
    echo 'set +e'
    printf 'cd %q\n' "$ROOT_DIR"
    printf 'LOG_FILE=%q\n' "$LOG_FILE"
    echo '{'
    printf '  '
    printf '%q ' "${COMMAND[@]}"
    printf '\n'
    echo '  status=$?'
    echo '  echo'
    echo '  echo "Finished: $(date -u +%Y-%m-%dT%H:%M:%SZ)"'
    echo '  echo "Exit code: $status"'
    echo '  exit "$status"'
    echo '} >>"$LOG_FILE" 2>&1'
  } >"$JOB_FILE"
  chmod +x "$JOB_FILE"
  nohup bash "$JOB_FILE" >/dev/null 2>&1 &
  PID=$!
  echo "Started background draft export."
  echo "PID: $PID"
  echo "Log: $LOG_FILE"
  echo "Job: $JOB_FILE"
  exit 0
fi

"${COMMAND[@]}" | tee -a "$LOG_FILE"
echo "Log: $LOG_FILE"
