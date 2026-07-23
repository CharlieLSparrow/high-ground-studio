#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$PROJECT_DIR/HighGroundCapture.xcodeproj"

DEVELOPER_DIR_VALUE="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
DESTINATION="${QUIPSLY_CAPTURE_UI_TEST_DESTINATION:-platform=iOS Simulator,name=iPhone 17 Pro}"
BASE_URL="${QUIPSLY_CAPTURE_UI_TEST_BASE_URL:-http://127.0.0.1:3012}"
TEST_EMAIL="${QUIPSLY_CAPTURE_UI_TEST_EMAIL:-}"
TEST_PASSWORD="${QUIPSLY_CAPTURE_UI_TEST_PASSWORD:-}"
TEST_SESSION_ID="${QUIPSLY_CAPTURE_UI_TEST_SESSION_ID:-}"
TEST_SESSION_TITLE="${QUIPSLY_CAPTURE_UI_TEST_SESSION_TITLE:-}"
TEST_TASK_ID="${QUIPSLY_CAPTURE_UI_TEST_TASK_ID:-}"
TEST_RECURRENCE_SERIES_ID="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_SERIES_ID:-}"
TEST_RECURRENCE_LOCAL_DATE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_LOCAL_DATE:-}"
TEST_RECURRENCE_AUTHORING_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_AUTHORING_TITLE:-}"
TEST_RECURRENCE_EDIT_SOURCE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_SOURCE_TITLE:-}"
TEST_RECURRENCE_EDIT_FUTURE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_FUTURE_TITLE:-}"
TEST_RECURRENCE_EDIT_TIMEZONE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_TIMEZONE:-}"
TEST_TAGGED_TASK_TITLE="${QUIPSLY_CAPTURE_UI_TEST_TAGGED_TASK_TITLE:-}"
TEST_TAG_LABEL="${QUIPSLY_CAPTURE_UI_TEST_TAG_LABEL:-}"
TIMEOUT_SECONDS="${QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:-900}"
TEST_MODE="${QUIPSLY_CAPTURE_UI_TEST_MODE:-surface}"

case "$TEST_MODE" in
  surface)
    TEST_CASE="testSignedInCaptureRoomSurfacesAreVisible"
    ;;
  capture-recovery)
    TEST_CASE="testConsentedCapturePlaybackAndCrashRecovery"
    ;;
  recurrence)
    TEST_CASE="testCanonicalRecurrenceRoundTripsThroughSignedInToday"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_RECURRENCE_SERIES_ID" || -z "$TEST_RECURRENCE_LOCAL_DATE" ]]; then
      echo "Recurrence mode requires exact task, recurrence-series, and scheduled-local-date identities." >&2
      exit 2
    fi
    ;;
  reminder)
    TEST_CASE="testOneTimeTaskReminderCancelsAndReactivatesThroughNest"
    if [[ -z "$TEST_TASK_ID" ]]; then
      echo "Reminder mode requires one exact non-recurring open task ID." >&2
      exit 2
    fi
    ;;
  recurrence-authoring)
    TEST_CASE="testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence"
    if [[ -z "$TEST_RECURRENCE_AUTHORING_TITLE" ]]; then
      echo "Recurrence-authoring mode requires one exact unique Task title." >&2
      exit 2
    fi
    ;;
  recurrence-offline-authoring)
    TEST_CASE="testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges"
    if [[ -z "$TEST_SESSION_ID" || -z "$TEST_RECURRENCE_AUTHORING_TITLE" ]]; then
      echo "Recurrence-offline-authoring mode requires an exact Session ID and unique Task title." >&2
      exit 2
    fi
    ;;
  recurrence-edit)
    TEST_CASE="testIPhoneVersionsThisAndFutureRecurrenceWithoutRewritingHistory"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_RECURRENCE_SERIES_ID" || -z "$TEST_RECURRENCE_EDIT_SOURCE_TITLE" || -z "$TEST_RECURRENCE_EDIT_FUTURE_TITLE" || -z "$TEST_RECURRENCE_EDIT_TIMEZONE" ]]; then
      echo "Recurrence-edit mode requires exact task/series IDs, source/future titles, and a target IANA timezone." >&2
      exit 2
    fi
    ;;
  recurrence-missed)
    TEST_CASE="testIPhoneExplicitlySkipsMissedOccurrenceAndContinuesSeries"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_RECURRENCE_SERIES_ID" || -z "$TEST_RECURRENCE_LOCAL_DATE" ]]; then
      echo "Recurrence-missed mode requires exact task, recurrence-series, and scheduled-local-date identities." >&2
      exit 2
    fi
    ;;
  tag-authoring)
    TEST_CASE="testIPhoneCreatesReusableNestTagWithCanonicalTask"
    if [[ -z "$TEST_SESSION_ID" || -z "$TEST_TAGGED_TASK_TITLE" || -z "$TEST_TAG_LABEL" ]]; then
      echo "Tag-authoring mode requires an exact Session ID, unique Task title, and unique tag label." >&2
      exit 2
    fi
    ;;
  tag-edit)
    TEST_CASE="testCanonicalWorkTagsRoundTripThroughSignedInToday"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_TAG_LABEL" ]]; then
      echo "Tag-edit mode requires one exact writable Task ID and reusable tag label." >&2
      exit 2
    fi
    ;;
  *)
    echo "Unknown QUIPSLY_CAPTURE_UI_TEST_MODE: $TEST_MODE (expected surface, capture-recovery, reminder, recurrence, recurrence-authoring, recurrence-offline-authoring, recurrence-edit, recurrence-missed, tag-authoring, or tag-edit)" >&2
    exit 2
    ;;
esac

if [[ -z "$TEST_EMAIL" || -z "$TEST_PASSWORD" ]]; then
  cat >&2 <<'EOF'
Missing Capture runtime UI smoke credentials.

Set:
  QUIPSLY_CAPTURE_UI_TEST_EMAIL
  QUIPSLY_CAPTURE_UI_TEST_PASSWORD

Optional:
  QUIPSLY_CAPTURE_UI_TEST_BASE_URL=http://127.0.0.1:3012
  QUIPSLY_CAPTURE_UI_TEST_DESTINATION='platform=iOS Simulator,name=iPhone 17 Pro'

This smoke uses real native Firebase login plus Quipsly bearer verification.
It does not bypass auth and it expects the user to have at least one capture session.
EOF
  exit 2
fi

if [[ ! -d "$DEVELOPER_DIR_VALUE" ]]; then
  echo "Full Xcode developer directory is missing: $DEVELOPER_DIR_VALUE" >&2
  exit 3
fi

run_with_timeout() {
  local seconds="$1"
  shift
  if command -v perl >/dev/null 2>&1; then
    perl -e 'alarm shift; exec @ARGV' "$seconds" "$@"
  else
    "$@"
  fi
}

echo "Running HighGroundCapture runtime UI smoke"
echo "Project:     $PROJECT_PATH"
echo "Xcode:       $DEVELOPER_DIR_VALUE"
echo "Destination: $DESTINATION"
echo "Nest:        $BASE_URL"
echo "Mode:        $TEST_MODE"

SMOKE_CREDENTIALS_FILE="${QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE:-/tmp/quipsly-capture-runtime-ui-smoke-credentials.json}"
cleanup_smoke_credentials() {
  rm -f "$SMOKE_CREDENTIALS_FILE"
}
trap cleanup_smoke_credentials EXIT

umask 077
python3 - "$SMOKE_CREDENTIALS_FILE" "$BASE_URL" "$TEST_EMAIL" "$TEST_PASSWORD" "$TEST_SESSION_ID" "$TEST_SESSION_TITLE" "$TEST_TASK_ID" "$TEST_RECURRENCE_SERIES_ID" "$TEST_RECURRENCE_LOCAL_DATE" "$TEST_RECURRENCE_AUTHORING_TITLE" "$TEST_RECURRENCE_EDIT_SOURCE_TITLE" "$TEST_RECURRENCE_EDIT_FUTURE_TITLE" "$TEST_RECURRENCE_EDIT_TIMEZONE" "$TEST_TAGGED_TASK_TITLE" "$TEST_TAG_LABEL" <<'PY'
import json
import sys

path, base_url, email, password, session_id, session_title, task_id, recurrence_series_id, recurrence_local_date, recurrence_authoring_title, recurrence_edit_source_title, recurrence_edit_future_title, recurrence_edit_timezone, tagged_task_title, tag_label = sys.argv[1:16]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "baseURL": base_url,
            "email": email,
            "password": password,
            "sessionID": session_id or None,
            "sessionTitle": session_title or None,
            "taskID": task_id or None,
            "recurrenceSeriesID": recurrence_series_id or None,
            "recurrenceScheduledLocalDate": recurrence_local_date or None,
            "recurrenceAuthoringTitle": recurrence_authoring_title or None,
            "recurrenceEditSourceTitle": recurrence_edit_source_title or None,
            "recurrenceEditFutureTitle": recurrence_edit_future_title or None,
            "recurrenceEditTimezone": recurrence_edit_timezone or None,
            "taggedTaskTitle": tagged_task_title or None,
            "tagLabel": tag_label or None,
        },
        handle,
    )
PY

export QUIPSLY_CAPTURE_UI_TEST_BASE_URL="$BASE_URL"
export QUIPSLY_CAPTURE_UI_TEST_EMAIL="$TEST_EMAIL"
export QUIPSLY_CAPTURE_UI_TEST_PASSWORD="$TEST_PASSWORD"
export QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE="$SMOKE_CREDENTIALS_FILE"
export DEVELOPER_DIR="$DEVELOPER_DIR_VALUE"

run_with_timeout "$TIMEOUT_SECONDS" \
  "$DEVELOPER_DIR_VALUE/usr/bin/xcodebuild" \
    -project "$PROJECT_PATH" \
    -scheme HighGroundCapture \
    -destination "$DESTINATION" \
    -only-testing:HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests/$TEST_CASE \
    test
