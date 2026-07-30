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
TEST_TASK_EDIT_SOURCE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_SOURCE_TITLE:-}"
TEST_TASK_EDIT_UPDATED_TITLE="${QUIPSLY_CAPTURE_UI_TEST_TASK_EDIT_UPDATED_TITLE:-}"
TEST_GOAL_ID="${QUIPSLY_CAPTURE_UI_TEST_GOAL_ID:-}"
TEST_GOAL_EDIT_SOURCE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_SOURCE_TITLE:-}"
TEST_GOAL_EDIT_UPDATED_TITLE="${QUIPSLY_CAPTURE_UI_TEST_GOAL_EDIT_UPDATED_TITLE:-}"
TEST_NOTE_ID="${QUIPSLY_CAPTURE_UI_TEST_NOTE_ID:-}"
TEST_NOTE_BODY_BLOCK_ID="${QUIPSLY_CAPTURE_UI_TEST_NOTE_BODY_BLOCK_ID:-}"
TEST_NOTE_EDIT_SOURCE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_TITLE:-}"
TEST_NOTE_EDIT_UPDATED_TITLE="${QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_TITLE:-}"
TEST_NOTE_EDIT_SOURCE_BODY="${QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_SOURCE_BODY:-}"
TEST_NOTE_EDIT_UPDATED_BODY="${QUIPSLY_CAPTURE_UI_TEST_NOTE_EDIT_UPDATED_BODY:-}"
TEST_ANNOTATION_ID="${QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_ID:-}"
TEST_ANNOTATION_BODY="${QUIPSLY_CAPTURE_UI_TEST_ANNOTATION_BODY:-}"
TEST_SOURCE_INBOX_CAPTURE_ID="${QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_CAPTURE_ID:-}"
TEST_SOURCE_INBOX_TITLE="${QUIPSLY_CAPTURE_UI_TEST_SOURCE_INBOX_TITLE:-}"
TEST_RECURRENCE_SERIES_ID="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_SERIES_ID:-}"
TEST_RECURRENCE_LOCAL_DATE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_LOCAL_DATE:-}"
TEST_RECURRENCE_AUTHORING_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_AUTHORING_TITLE:-}"
TEST_RECURRENCE_EDIT_SOURCE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_SOURCE_TITLE:-}"
TEST_RECURRENCE_EDIT_FUTURE_TITLE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_FUTURE_TITLE:-}"
TEST_RECURRENCE_EDIT_TIMEZONE="${QUIPSLY_CAPTURE_UI_TEST_RECURRENCE_EDIT_TIMEZONE:-}"
TEST_TAGGED_TASK_TITLE="${QUIPSLY_CAPTURE_UI_TEST_TAGGED_TASK_TITLE:-}"
TEST_TAG_LABEL="${QUIPSLY_CAPTURE_UI_TEST_TAG_LABEL:-}"
TEST_PROJECT_NAME="${QUIPSLY_CAPTURE_UI_TEST_PROJECT_NAME:-}"
TEST_PROJECT_TASK_TITLE="${QUIPSLY_CAPTURE_UI_TEST_PROJECT_TASK_TITLE:-}"
TEST_PROJECT_TAG_LABEL="${QUIPSLY_CAPTURE_UI_TEST_PROJECT_TAG_LABEL:-}"
TEST_PROJECT_RETAG_LABEL="${QUIPSLY_CAPTURE_UI_TEST_PROJECT_RETAG_LABEL:-}"
TIMEOUT_SECONDS="${QUIPSLY_CAPTURE_UI_TEST_TIMEOUT_SECONDS:-900}"
TEST_MODE="${QUIPSLY_CAPTURE_UI_TEST_MODE:-surface}"
DERIVED_DATA_PATH="${QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH:-}"
RESULT_BUNDLE_PATH="${QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH:-/tmp/quipsly-capture-runtime-ui-${TEST_MODE}-$(date -u +%Y%m%dT%H%M%SZ)-$$.xcresult}"
TEST_CLASS="CaptureRoomRuntimeSmokeTests"
REQUIRES_PASSWORD_CREDENTIALS=true

case "$TEST_MODE" in
  google-handoff)
    TEST_CLASS="CaptureGoogleHandoffRuntimeUITests"
    TEST_CASE="testGoogleSignInOpensProtectedGoogleWebAuthenticationWithoutCredentials"
    REQUIRES_PASSWORD_CREDENTIALS=false
    if [[ -z "${QUIPSLY_CAPTURE_UI_TEST_BASE_URL:-}" ]]; then
      BASE_URL="https://nest.quipsly.com"
    fi
    ;;
  surface)
    TEST_CASE="testSignedInCaptureRoomSurfacesAreVisible"
    ;;
  room-join)
    TEST_CASE="testConsentedProviderRoomJoinsAndLeavesWithoutStartingRecording"
    if [[ -z "$TEST_SESSION_ID" || -z "$TEST_SESSION_TITLE" ]]; then
      echo "Room-join mode requires an exact consented Session ID and title." >&2
      exit 2
    fi
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
  task-edit)
    TEST_CASE="testOneTimeTaskEditRoundTripsAndRestoresThroughNest"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_TASK_EDIT_SOURCE_TITLE" || -z "$TEST_TASK_EDIT_UPDATED_TITLE" ]]; then
      echo "Task-edit mode requires one exact non-recurring open task ID plus source and temporary titles." >&2
      exit 2
    fi
    ;;
  goal-edit)
    TEST_CASE="testCanonicalGoalEditRoundTripsAndRestoresThroughNest"
    if [[ -z "$TEST_GOAL_ID" || -z "$TEST_GOAL_EDIT_SOURCE_TITLE" || -z "$TEST_GOAL_EDIT_UPDATED_TITLE" ]]; then
      echo "Goal-edit mode requires one exact active goal ID plus source and temporary titles." >&2
      exit 2
    fi
    ;;
  note-edit)
    TEST_CASE="testCanonicalDocumentNoteEditRoundTripsAndRestoresThroughNest"
    if [[ -z "$TEST_NOTE_ID" || -z "$TEST_NOTE_BODY_BLOCK_ID" || -z "$TEST_NOTE_EDIT_SOURCE_TITLE" || -z "$TEST_NOTE_EDIT_UPDATED_TITLE" || -z "$TEST_NOTE_EDIT_SOURCE_BODY" || -z "$TEST_NOTE_EDIT_UPDATED_BODY" ]]; then
      echo "Note-edit mode requires the exact note/body-block IDs plus source and temporary title/body values." >&2
      exit 2
    fi
    ;;
  annotation-review)
    TEST_CASE="testCanonicalSourceAnnotationResolveAndReopenRoundTripsThroughNest"
    if [[ -z "$TEST_ANNOTATION_ID" || -z "$TEST_ANNOTATION_BODY" ]]; then
      echo "Annotation-review mode requires one exact author-owned annotation ID and body." >&2
      exit 2
    fi
    ;;
  source-inbox-filing)
    TEST_CASE="testPrivateSourceInboxFilesIntoCanonicalResearch"
    if [[ -z "$TEST_SOURCE_INBOX_CAPTURE_ID" || -z "$TEST_SOURCE_INBOX_TITLE" || -z "$TEST_PROJECT_NAME" ]]; then
      echo "Source Inbox filing mode requires one exact private capture ID/title and writable Nest name." >&2
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
  tag-edit-offline)
    TEST_CASE="testWorkTagOutboxSurvivesOfflineRelaunchAndConverges"
    if [[ -z "$TEST_TASK_ID" || -z "$TEST_TAG_LABEL" ]]; then
      echo "Offline tag-edit mode requires one exact writable Task ID and reusable tag label." >&2
      exit 2
    fi
    ;;
  project-work)
    TEST_CASE="testIPhoneCapturesTaggedTaskDirectlyIntoWritableNest"
    if [[ -z "$TEST_PROJECT_NAME" || -z "$TEST_PROJECT_TASK_TITLE" || -z "$TEST_PROJECT_TAG_LABEL" || -z "$TEST_PROJECT_RETAG_LABEL" ]]; then
      echo "Project Work mode requires one writable Nest name, unique Task title, and two existing canonical tag labels." >&2
      exit 2
    fi
    ;;
  session-note-edit)
    TEST_CASE="testClientSafeDecisionCreatesEditsAndRelaunchesFromProtectedIPhoneOutbox"
    if [[ -z "$TEST_SESSION_ID" ]]; then
      echo "Session-note edit mode requires one exact writable Session ID." >&2
      exit 2
    fi
    ;;
  *)
    echo "Unknown QUIPSLY_CAPTURE_UI_TEST_MODE: $TEST_MODE (expected google-handoff, surface, room-join, capture-recovery, reminder, task-edit, goal-edit, note-edit, annotation-review, source-inbox-filing, recurrence, recurrence-authoring, recurrence-offline-authoring, recurrence-edit, recurrence-missed, tag-authoring, tag-edit, tag-edit-offline, project-work, or session-note-edit)" >&2
    exit 2
    ;;
esac

if [[ "$REQUIRES_PASSWORD_CREDENTIALS" == true && ( -z "$TEST_EMAIL" || -z "$TEST_PASSWORD" ) ]]; then
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
echo "Result:      $RESULT_BUNDLE_PATH"
if [[ -n "$DERIVED_DATA_PATH" ]]; then
  echo "DerivedData: $DERIVED_DATA_PATH"
fi

SMOKE_CREDENTIALS_FILE=""
SMOKE_CREDENTIALS_LOCK=""
cleanup_smoke_credentials() {
  if [[ -n "$SMOKE_CREDENTIALS_FILE" && -f "$SMOKE_CREDENTIALS_FILE" ]]; then
    unlink "$SMOKE_CREDENTIALS_FILE"
  fi
  if [[ -n "$SMOKE_CREDENTIALS_LOCK" && -d "$SMOKE_CREDENTIALS_LOCK" ]]; then
    rmdir "$SMOKE_CREDENTIALS_LOCK"
  fi
}
trap cleanup_smoke_credentials EXIT

if [[ "$REQUIRES_PASSWORD_CREDENTIALS" == true ]]; then
  SMOKE_CREDENTIALS_FILE="/tmp/quipsly-capture-runtime-ui-smoke-credentials.json"
  requested_credentials_file="${QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE:-$SMOKE_CREDENTIALS_FILE}"
  if [[ "$requested_credentials_file" != "$SMOKE_CREDENTIALS_FILE" ]]; then
    echo "The XCTest host bridge requires the exact credential packet path $SMOKE_CREDENTIALS_FILE; custom paths are not visible inside the test runner." >&2
    exit 2
  fi
  SMOKE_CREDENTIALS_LOCK="/tmp/quipsly-capture-runtime-ui-smoke-credentials.lock"
  if ! mkdir "$SMOKE_CREDENTIALS_LOCK"; then
    echo "Another credentialed Capture runtime UI smoke owns the canonical XCTest host bridge: $SMOKE_CREDENTIALS_LOCK" >&2
    exit 3
  fi
  umask 077
  python3 - "$SMOKE_CREDENTIALS_FILE" "$BASE_URL" "$TEST_EMAIL" "$TEST_PASSWORD" "$TEST_SESSION_ID" "$TEST_SESSION_TITLE" "$TEST_TASK_ID" "$TEST_TASK_EDIT_SOURCE_TITLE" "$TEST_TASK_EDIT_UPDATED_TITLE" "$TEST_GOAL_ID" "$TEST_GOAL_EDIT_SOURCE_TITLE" "$TEST_GOAL_EDIT_UPDATED_TITLE" "$TEST_RECURRENCE_SERIES_ID" "$TEST_RECURRENCE_LOCAL_DATE" "$TEST_RECURRENCE_AUTHORING_TITLE" "$TEST_RECURRENCE_EDIT_SOURCE_TITLE" "$TEST_RECURRENCE_EDIT_FUTURE_TITLE" "$TEST_RECURRENCE_EDIT_TIMEZONE" "$TEST_TAGGED_TASK_TITLE" "$TEST_TAG_LABEL" "$TEST_PROJECT_NAME" "$TEST_PROJECT_TASK_TITLE" "$TEST_PROJECT_TAG_LABEL" "$TEST_PROJECT_RETAG_LABEL" "$TEST_NOTE_ID" "$TEST_NOTE_BODY_BLOCK_ID" "$TEST_NOTE_EDIT_SOURCE_TITLE" "$TEST_NOTE_EDIT_UPDATED_TITLE" "$TEST_NOTE_EDIT_SOURCE_BODY" "$TEST_NOTE_EDIT_UPDATED_BODY" "$TEST_ANNOTATION_ID" "$TEST_ANNOTATION_BODY" "$TEST_SOURCE_INBOX_CAPTURE_ID" "$TEST_SOURCE_INBOX_TITLE" <<'PY'
import json
import sys

path, base_url, email, password, session_id, session_title, task_id, task_edit_source_title, task_edit_updated_title, goal_id, goal_edit_source_title, goal_edit_updated_title, recurrence_series_id, recurrence_local_date, recurrence_authoring_title, recurrence_edit_source_title, recurrence_edit_future_title, recurrence_edit_timezone, tagged_task_title, tag_label, project_name, project_task_title, project_tag_label, project_retag_label, note_id, note_body_block_id, note_edit_source_title, note_edit_updated_title, note_edit_source_body, note_edit_updated_body, annotation_id, annotation_body, source_inbox_capture_id, source_inbox_title = sys.argv[1:35]
with open(path, "w", encoding="utf-8") as handle:
    json.dump(
        {
            "baseURL": base_url,
            "email": email,
            "password": password,
            "sessionID": session_id or None,
            "sessionTitle": session_title or None,
            "taskID": task_id or None,
            "taskEditSourceTitle": task_edit_source_title or None,
            "taskEditUpdatedTitle": task_edit_updated_title or None,
            "goalID": goal_id or None,
            "goalEditSourceTitle": goal_edit_source_title or None,
            "goalEditUpdatedTitle": goal_edit_updated_title or None,
            "recurrenceSeriesID": recurrence_series_id or None,
            "recurrenceScheduledLocalDate": recurrence_local_date or None,
            "recurrenceAuthoringTitle": recurrence_authoring_title or None,
            "recurrenceEditSourceTitle": recurrence_edit_source_title or None,
            "recurrenceEditFutureTitle": recurrence_edit_future_title or None,
            "recurrenceEditTimezone": recurrence_edit_timezone or None,
            "taggedTaskTitle": tagged_task_title or None,
            "tagLabel": tag_label or None,
            "projectName": project_name or None,
            "projectTaskTitle": project_task_title or None,
            "projectTagLabel": project_tag_label or None,
            "projectRetagLabel": project_retag_label or None,
            "noteID": note_id or None,
            "noteBodyBlockID": note_body_block_id or None,
            "noteEditSourceTitle": note_edit_source_title or None,
            "noteEditUpdatedTitle": note_edit_updated_title or None,
            "noteEditSourceBody": note_edit_source_body or None,
            "noteEditUpdatedBody": note_edit_updated_body or None,
            "annotationID": annotation_id or None,
            "annotationBody": annotation_body or None,
            "sourceInboxCaptureID": source_inbox_capture_id or None,
            "sourceInboxTitle": source_inbox_title or None,
        },
        handle,
    )
PY
fi

export QUIPSLY_CAPTURE_UI_TEST_BASE_URL="$BASE_URL"
export QUIPSLY_CAPTURE_UI_TEST_EMAIL="$TEST_EMAIL"
export QUIPSLY_CAPTURE_UI_TEST_PASSWORD="$TEST_PASSWORD"
export QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE="$SMOKE_CREDENTIALS_FILE"
export DEVELOPER_DIR="$DEVELOPER_DIR_VALUE"

XCODEBUILD_ARGUMENTS=(
  -project "$PROJECT_PATH"
  -scheme HighGroundCapture
  -destination "$DESTINATION"
  -only-testing:"HighGroundCaptureUITests/$TEST_CLASS/$TEST_CASE"
)
if [[ -n "$DERIVED_DATA_PATH" ]]; then
  XCODEBUILD_ARGUMENTS+=(-derivedDataPath "$DERIVED_DATA_PATH")
fi
if [[ -e "$RESULT_BUNDLE_PATH" ]]; then
  echo "Refusing to overwrite existing runtime UI result bundle: $RESULT_BUNDLE_PATH" >&2
  exit 3
fi
XCODEBUILD_ARGUMENTS+=(-resultBundlePath "$RESULT_BUNDLE_PATH")
XCODEBUILD_ARGUMENTS+=(test)

run_with_timeout "$TIMEOUT_SECONDS" \
  "$DEVELOPER_DIR_VALUE/usr/bin/xcodebuild" \
  "${XCODEBUILD_ARGUMENTS[@]}"

cleanup_smoke_credentials
trap - EXIT

"${XCRUN:-/usr/bin/xcrun}" xcresulttool get test-results summary \
  --path "$RESULT_BUNDLE_PATH" |
  node -e '
let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { raw += chunk; });
process.stdin.on("end", () => {
  const [expectedClass, expectedCase] = process.argv.slice(1);
  const summary = JSON.parse(raw);
  const passed = Number(summary.passedTests || 0);
  const failed = Number(summary.failedTests || 0);
  const skipped = Number(summary.skippedTests || 0);
  const total = Number(summary.totalTestCount || 0);
  if (
    summary.result !== "Passed"
    || passed !== 1
    || failed !== 0
    || skipped !== 0
    || total !== 1
  ) {
    console.error(JSON.stringify({
      error: "Capture runtime UI proof did not execute exactly one passing test.",
      expected: `${expectedClass}/${expectedCase}`,
      result: summary.result || null,
      passed,
      failed,
      skipped,
      total,
    }, null, 2));
    process.exit(4);
  }
  console.log(JSON.stringify({
    ok: true,
    selectedTest: `${expectedClass}/${expectedCase}`,
    result: summary.result,
    passed,
    failed,
    skipped,
    total,
  }, null, 2));
});
' "$TEST_CLASS" "$TEST_CASE"
