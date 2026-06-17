#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${1:-high-ground-odyssey-manuscript}"
EPISODE_SLUG="${2:-episode-2}"
APP_NAME="QuipslyMac"
BUNDLE_ID="com.quipsly.mac"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_DIR="${QUIPSLY_MAC_SMOKE_DIR:-${TMPDIR:-/tmp}/quipsly-mac-smoke}"
SCREENSHOT="$SMOKE_DIR/episode-editor-${PROJECT_SLUG}-${EPISODE_SLUG}.png"
SESSION_FILE="$HOME/Library/Application Support/QuipslyMac/local-episode-edits/$PROJECT_SLUG/$EPISODE_SLUG.json"
MEDIA_WORKSPACE_ROOT="$(defaults read "$BUNDLE_ID" quipslyMac.mediaWorkspacePath 2>/dev/null || true)"
if [ -z "$MEDIA_WORKSPACE_ROOT" ]; then
  MEDIA_WORKSPACE_ROOT="$HOME/Library/Application Support/QuipslyMac"
fi
PLAYBACK_CACHE_ROOT="$MEDIA_WORKSPACE_ROOT/playback-cache/$PROJECT_SLUG/$EPISODE_SLUG"
SNAPSHOT_FILE="$SMOKE_DIR/episode-editor-visible-${PROJECT_SLUG}-${EPISODE_SLUG}-$$.json"
LOCK_DIR="$SMOKE_DIR/episode-editor-smoke.lock"
HAVE_LOCK=0

mkdir -p "$SMOKE_DIR"
for _ in $(seq 1 120); do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    HAVE_LOCK=1
    break
  fi
  sleep 0.5
done

if [ "$HAVE_LOCK" -ne 1 ]; then
  echo "FAIL: Could not acquire Episode Editor smoke lock: $LOCK_DIR" >&2
  exit 1
fi

cleanup() {
  defaults delete "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorSnapshotPath >/dev/null 2>&1 || true
  defaults delete "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorProjectSlug >/dev/null 2>&1 || true
  defaults delete "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorEpisodeSlug >/dev/null 2>&1 || true
  if [ "$HAVE_LOCK" -eq 1 ]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

cd "$ROOT_DIR"

echo "== Quipsly Mac Episode Editor smoke =="
echo "Project: $PROJECT_SLUG"
echo "Episode: $EPISODE_SLUG"

# Make the visible app open the exact surface under test.
defaults write "$BUNDLE_ID" quipslyMac.selectedSection episodeEditor
defaults write "$BUNDLE_ID" quipslyMac.editorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.editorEpisodeSlug "$EPISODE_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorProjectSlug "$PROJECT_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorEpisodeSlug "$EPISODE_SLUG"
defaults write "$BUNDLE_ID" quipslyMac.smokeEpisodeEditorSnapshotPath "$SNAPSHOT_FILE"
rm -f "$SNAPSHOT_FILE"

node - "$SESSION_FILE" "$PLAYBACK_CACHE_ROOT" <<'NODECACHE'
const fs = require('fs');
const path = require('path');
const [sessionFile, cacheRoot] = process.argv.slice(2);
const maxCacheBytes = Number(process.env.QUIPSLY_SMOKE_MAX_CACHE_MB || 500) * 1024 * 1024;

function naturalTrackOrder(trackId) {
  const digits = Number(String(trackId).replace(/\D/g, '') || 0);
  if (String(trackId).toUpperCase().startsWith('V')) return 10000 + digits;
  if (String(trackId).toUpperCase().startsWith('A')) return digits;
  return 5000 + digits;
}

function decisions(session) {
  return Array.isArray(session.editDecisions) ? session.editDecisions : (Array.isArray(session.editDecisions) ? session.editDecisions : []);
}

function decisionStart(decision) {
  return Number.isFinite(decision.timelineStart) ? decision.timelineStart : (decision.startIn || 0);
}

function clipContains(clip, playhead) {
  const start = decisionStart(clip);
  return playhead >= start && playhead < start + Math.max(0.05, clip.duration);
}

function programClip(session, playhead) {
  return decisions(session)
    .filter((clip) =>
      (String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video') &&
      clipContains(clip, playhead) &&
      clip.isActive
    )
    .sort((a, b) => naturalTrackOrder(b.trackId) - naturalTrackOrder(a.trackId))[0];
}

if (!fs.existsSync(sessionFile)) process.exit(0);

const session = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
const candidates = decisions(session)
  .filter((clip) => {
    if (!(String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video')) return false;
    if (!clip.isActive) return false;
    if (typeof clip.localMediaPath !== 'string' || clip.localMediaPath.length <= 0) return false;
    if (!fs.existsSync(clip.localMediaPath)) return false;
    return fs.statSync(clip.localMediaPath).size <= maxCacheBytes;
  })
  .sort((a, b) => decisionStart(a) - decisionStart(b) || naturalTrackOrder(b.trackId) - naturalTrackOrder(a.trackId));

const target = candidates.find((candidate) => {
  const sampleTime = decisionStart(candidate) + Math.min(0.02, Math.max(0.01, candidate.duration / 2));
  const program = programClip(session, sampleTime);
  return program && program.id === candidate.id;
}) || candidates[0];

if (!target) {
  console.log(`No smoke-cacheable video source under ${Math.round(maxCacheBytes / 1024 / 1024)} MB.`);
  process.exit(0);
}

fs.mkdirSync(cacheRoot, { recursive: true });
const ext = path.extname(target.localMediaPath) || '.mp4';
const cachePath = path.join(cacheRoot, `${target.sourceAssetId || target.id}${ext}`.replace(/[^a-zA-Z0-9._-]/g, '-'));
if (!fs.existsSync(cachePath)) {
  fs.copyFileSync(target.localMediaPath, cachePath);
}

let changed = false;
for (const clip of decisions(session)) {
  if (clip.sourceAssetId === target.sourceAssetId || clip.localMediaPath === target.localMediaPath) {
    if (clip.playbackMediaPath !== cachePath) {
      clip.playbackMediaPath = cachePath;
      changed = true;
    }
  }
}

if (changed) {
  session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));
  console.log(`Prepared playback cache: ${cachePath}`);
}
NODECACHE

./script/build_and_run.sh --verify
SNAPSHOT_READY=0
for _ in $(seq 1 240); do
  if node - "$PROJECT_SLUG" "$EPISODE_SLUG" "$SNAPSHOT_FILE" "$SESSION_FILE" <<'NODEWAIT'
const fs = require('fs');
const [projectSlug, episodeSlug, snapshotFile, sessionFile] = process.argv.slice(2);

if (!fs.existsSync(snapshotFile)) process.exit(1);

try {
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  if (snapshot.view !== 'EpisodeEditorView') process.exit(1);
  if (snapshot.projectSlug !== projectSlug || snapshot.episodeSlug !== episodeSlug) process.exit(1);
  if (snapshot.selectedProjectSlug !== projectSlug || snapshot.selectedEpisodeSlug !== episodeSlug) process.exit(1);
  if (snapshot.routeProjectDraft !== projectSlug || snapshot.routeEpisodeDraft !== episodeSlug) process.exit(1);

  const expectsSession = fs.existsSync(sessionFile);
  if (!expectsSession) process.exit(0);

  if (snapshot.hasLocalSession === false) process.exit(1);
  if (snapshot.monitorWallId !== 'episode-editor-monitor-wall') process.exit(1);
  if (snapshot.programMonitorId !== 'episode-editor-program-monitor') process.exit(1);
  if (snapshot.timelinePanelId !== 'episode-editor-native-timeline') process.exit(1);
  if (snapshot.timelineNavigatorId !== 'episode-editor-timeline-navigator') process.exit(1);
  if (snapshot.timelineKeyboardSchema !== 'transport-jkl-edit-d-s-v1') process.exit(1);
  if (snapshot.mediaWorkspaceSchema !== 'media-workspace-cache-proxy-render-v1') process.exit(1);
  if (typeof snapshot.mediaWorkspacePath !== 'string' || snapshot.mediaWorkspacePath.length <= 0) process.exit(1);
  if (typeof snapshot.mediaWorkspacePlaybackCachePath !== 'string' || !snapshot.mediaWorkspacePlaybackCachePath.includes('playback-cache')) process.exit(1);
  if (typeof snapshot.mediaWorkspaceProxyCachePath !== 'string' || !snapshot.mediaWorkspaceProxyCachePath.includes('media-cache')) process.exit(1);
  if (typeof snapshot.mediaWorkspaceSourceOriginalsPath !== 'string' || !snapshot.mediaWorkspaceSourceOriginalsPath.includes('source-originals')) process.exit(1);
  if (typeof snapshot.mediaWorkspaceRenderOutputPath !== 'string' || !snapshot.mediaWorkspaceRenderOutputPath.includes('renders')) process.exit(1);
  if (snapshot.mediaVaultPipelineId !== 'episode-editor-media-vault-pipeline') process.exit(1);
  if (snapshot.mediaVaultPipelineSchema !== 'local-original-proxy-gcs-register-v1') process.exit(1);
  if (snapshot.mediaVaultPipelineRenderPolicy !== 'source-originals-authoritative-proxies-preview-only-v1') process.exit(1);
  if (typeof snapshot.mediaVaultPipelineCandidateCount !== 'number') process.exit(1);
  if (typeof snapshot.mediaVaultPipelineReadySourceGroupCount !== 'number') process.exit(1);
  if (typeof snapshot.mediaVaultPipelineWaitingSourceGroupCount !== 'number') process.exit(1);
  if (typeof snapshot.mediaVaultPipelineDownloadSourceGroupCount !== 'number') process.exit(1);
  if (!Array.isArray(snapshot.episodeRescueBoardTargets) || snapshot.episodeRescueBoardTargets.length < 3) process.exit(1);
  for (const target of snapshot.episodeRescueBoardTargets) {
    if (!target.loaded) continue;
    if (typeof target.mediaVaultCandidateCount !== 'number') process.exit(1);
    if (typeof target.mediaVaultReadySourceCount !== 'number') process.exit(1);
    if (typeof target.mediaVaultWaitingSourceCount !== 'number') process.exit(1);
    if (typeof target.mediaVaultRowId !== 'string' || !target.mediaVaultRowId.includes('media-vault')) process.exit(1);
  }
  if (typeof snapshot.timelineDecisionCount !== 'number' || snapshot.timelineDecisionCount <= 0) process.exit(1);
  if (typeof snapshot.timelineNavigatorClipCount !== 'number' || snapshot.timelineNavigatorClipCount <= 0) process.exit(1);
  process.exit(0);
} catch {
  process.exit(1);
}
NODEWAIT
  then
    SNAPSHOT_READY=1
    break
  fi
  sleep 0.5
done

if [ "$SNAPSHOT_READY" -ne 1 ]; then
  echo "FAIL: Visible editor snapshot did not become screenshot-ready: $SNAPSHOT_FILE" >&2
  exit 1
fi

VISUAL_READY=0
for _ in $(seq 1 20); do
  if /usr/bin/osascript 2>/dev/null <<'APPLESCRIPT' | grep -q '^ready$'
with timeout of 1 second
  tell application id "com.quipsly.mac" to activate
  tell application "System Events"
    if exists process "QuipslyMac" then
      tell process "QuipslyMac"
        set frontmost to true
        if exists window 1 then
          perform action "AXRaise" of window 1
          try
            if exists static text "Episode Editor" of window 1 then return "ready"
          end try
          try
            if exists button "Show Web Preview" of window 1 then return "ready"
          end try
        end if
      end tell
    end if
  end tell
end timeout
return "not-ready"
APPLESCRIPT
  then
    VISUAL_READY=1
    break
  fi
  sleep 0.25
done

if [ "$VISUAL_READY" -ne 1 ]; then
  echo "INFO: Episode Editor visual marker was not accessible before capture; waiting for SwiftUI paint." >&2
  sleep 4
fi

sleep 0.5
/usr/bin/osascript >/dev/null 2>&1 <<'APPLESCRIPT' || true
tell application "Quipsly Mac" to activate
tell application "System Events"
  if exists process "QuipslyMac" then
    tell process "QuipslyMac"
      set frontmost to true
      if exists window 1 then perform action "AXRaise" of window 1
    end tell
  end if
end tell
APPLESCRIPT
sleep 0.5
find_quipsly_window_id() {
  /usr/bin/swift - <<'SWIFT'
import CoreGraphics

func matchingWindowID(options: CGWindowListOption) -> Int? {
  guard let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] else {
    return nil
  }

  for window in windows {
    let owner = window[kCGWindowOwnerName as String] as? String ?? ""
    let name = window[kCGWindowName as String] as? String ?? ""
    let number = window[kCGWindowNumber as String] as? Int ?? 0
    let layer = window[kCGWindowLayer as String] as? Int ?? -1
    if layer == 0 && owner == "Quipsly" && name == "Quipsly Mac" && number > 0 {
      return number
    }
  }

  return nil
}

if let windowID = matchingWindowID(options: [.optionOnScreenOnly, .excludeDesktopElements])
    ?? matchingWindowID(options: [.optionAll, .excludeDesktopElements]) {
  print(windowID)
}
SWIFT
}

CAPTURED=0
for _ in $(seq 1 8); do
  WINDOW_ID="$(find_quipsly_window_id)"
  if [[ -n "$WINDOW_ID" ]]; then
    rm -f "$SCREENSHOT"
    if screencapture -x -l "$WINDOW_ID" "$SCREENSHOT" >/dev/null 2>&1 && [[ -s "$SCREENSHOT" ]]; then
      CAPTURED=1
      break
    fi
  fi

  /usr/bin/osascript >/dev/null 2>&1 <<'APPLESCRIPT' || true
tell application id "com.quipsly.mac" to activate
tell application "System Events"
  if exists process "QuipslyMac" then
    tell process "QuipslyMac"
      set frontmost to true
      if exists window 1 then perform action "AXRaise" of window 1
    end tell
  end if
end tell
APPLESCRIPT
  sleep 0.5
done

if [[ "$CAPTURED" -ne 1 ]]; then
  echo "FAIL: Could not capture the Quipsly Mac window screenshot." >&2
  exit 1
fi
echo "Screenshot: $SCREENSHOT"

node - "$PROJECT_SLUG" "$EPISODE_SLUG" "$SNAPSHOT_FILE" "$SESSION_FILE" <<'NODESNAPSHOT'
const fs = require('fs');
const [projectSlug, episodeSlug, snapshotFile, sessionFile] = process.argv.slice(2);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

if (!fs.existsSync(snapshotFile)) {
  fail(`Missing app-authored visible editor snapshot: ${snapshotFile}`);
}

const stat = fs.statSync(snapshotFile);
const ageMs = Date.now() - stat.mtimeMs;
if (ageMs > 90_000) {
  fail(`Visible editor snapshot is stale: ${Math.round(ageMs / 1000)}s old`);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
if (snapshot.view !== 'EpisodeEditorView') fail(`Unexpected snapshot view: ${snapshot.view}`);
if (snapshot.projectSlug !== projectSlug) fail(`Snapshot project mismatch: ${snapshot.projectSlug}`);
if (snapshot.episodeSlug !== episodeSlug) fail(`Snapshot episode mismatch: ${snapshot.episodeSlug}`);
if (snapshot.selectedProjectSlug !== projectSlug) fail(`Selected project mismatch: ${snapshot.selectedProjectSlug}`);
if (snapshot.selectedEpisodeSlug !== episodeSlug) fail(`Selected episode mismatch: ${snapshot.selectedEpisodeSlug}`);
if (snapshot.routeProjectDraft !== projectSlug) fail(`Visible project draft mismatch: ${snapshot.routeProjectDraft}`);
if (snapshot.routeEpisodeDraft !== episodeSlug) fail(`Visible episode draft mismatch: ${snapshot.routeEpisodeDraft}`);
if (snapshot.episodeRescueBoardId !== 'episode-editor-rescue-board') fail('Episode rescue board marker missing');
if (snapshot.episodeRescueBoardSchema !== 'episode-1-3-local-rescue-readiness-v1') fail('Episode rescue board schema marker missing');
if (snapshot.episodeRescueBoardCopyReportButtonId !== 'episode-editor-copy-rescue-readiness-button') fail('Episode rescue board copy-report button marker missing');
if (snapshot.episodeRescueBoardCopyReportSchema !== 'copy-episode-1-3-readiness-markdown-v1') fail('Episode rescue board copy-report schema marker missing');
if (snapshot.episodeRescueBoardSourceProgressSchema !== 'episode-rescue-source-progress-v1') fail('Episode rescue board source-progress schema marker missing');
if (snapshot.episodeRescueBoardSourcePreflightSchema !== 'episode-rescue-source-preflight-v1') fail('Episode rescue board source-preflight schema marker missing');
if (typeof snapshot.episodeRescueBoardSourceWatchIsRunning !== 'boolean') fail('Episode rescue board source-watch running state missing');
if (!Array.isArray(snapshot.episodeRescueBoardSourceWatchEpisodeSlugs)) fail('Episode rescue board source-watch episode scope missing');
if (snapshot.episodeRescueBoardTargetCount !== 3) fail(`Episode rescue board expected 3 targets, got ${snapshot.episodeRescueBoardTargetCount}`);
if (!Array.isArray(snapshot.episodeRescueBoardTargets) || snapshot.episodeRescueBoardTargets.length !== 3) fail('Episode rescue board target list missing');
if (snapshot.sourceRecoveryPlanId !== 'episode-editor-source-recovery-plan') fail('Source recovery plan marker missing');
if (snapshot.sourceRecoveryPlanSchema !== 'source-recovery-plan-download-choose-review-v1') fail('Source recovery plan schema marker missing');
if (snapshot.sourceRecoveryRefreshStatusButtonId !== 'episode-editor-source-recovery-refresh-status-button') fail('Source recovery refresh-status button marker missing');
if (snapshot.sourceRecoveryStartWatchButtonId !== 'episode-editor-source-recovery-start-watch-button') fail('Source recovery native start-watch button marker missing');
if (snapshot.sourceRecoveryStartFirstThreeWatchButtonId !== 'episode-editor-source-recovery-start-first-three-watch-button') fail('Source recovery native first-three watch button marker missing');
if (snapshot.sourceRecoveryRevealReportButtonId !== 'episode-editor-source-recovery-reveal-report-button') fail('Source recovery reveal-report button marker missing');
if (snapshot.sourceRecoveryNextActionBannerId !== 'episode-editor-source-recovery-next-action-banner') fail('Source recovery next-action banner marker missing');
if (snapshot.sourceRecoveryNextActionSchema !== 'source-recovery-next-safe-action-v1') fail('Source recovery next-action schema marker missing');
if (!['download-known-files', 'choose-replacement-source', 'review-preserved-sources', 'source-recovery-clear'].includes(snapshot.sourceRecoveryNextActionKind)) fail(`Source recovery next-action kind invalid: ${snapshot.sourceRecoveryNextActionKind}`);
if (typeof snapshot.sourceRecoveryNextActionDiskGated !== 'boolean') fail('Source recovery next-action disk gate state missing');
if (snapshot.sourceRecoveryNextActionDiskGated !== (snapshot.sourceDownloadsBlockedByDisk && snapshot.sourceRecoveryNextActionKind === 'download-known-files')) fail('Source recovery next-action disk gate state is inconsistent');
if (snapshot.sourceRecoveryNextActionPrimaryButtonId !== 'episode-editor-source-recovery-next-action-primary') fail('Source recovery next-action primary button missing');
if (typeof snapshot.sourceRecoveryDownloadGroupCount !== 'number') fail('Source recovery download group count missing');
if (typeof snapshot.sourceRecoveryChooseGroupCount !== 'number') fail('Source recovery choose group count missing');
if (typeof snapshot.sourceRecoveryReviewOnlyGroupCount !== 'number') fail('Source recovery review-only group count missing');
if (snapshot.sourceReadinessSummaryStripId !== 'episode-editor-source-readiness-summary-strip') fail('Source readiness summary strip marker missing');
if (snapshot.sourceReadinessLastSummarySchema !== 'local-source-readiness-summary-v2') fail('Source readiness summary schema marker missing');
if (snapshot.sourceReadinessLastSummaryBlockerCount !== null && typeof snapshot.sourceReadinessLastSummaryBlockerCount !== 'number') fail('Source readiness summary blocker count invalid');
if (snapshot.sourceReadinessLastSummaryBlockerRowCount !== null && typeof snapshot.sourceReadinessLastSummaryBlockerRowCount !== 'number') fail('Source readiness summary blocker row count invalid');
if (!Array.isArray(snapshot.sourceReadinessLastSummaryBlockerRows)) fail('Source readiness summary blocker rows missing');
if (snapshot.sourceReadinessLiveProgressBannerId !== null) {
  if (snapshot.sourceReadinessLiveProgressBannerId !== 'episode-editor-source-readiness-live-progress-banner') fail('Source readiness live progress banner marker missing');
  if (snapshot.sourceReadinessLiveProgressSchema !== 'source-watch-live-progress-v1') fail('Source readiness live progress schema marker missing');
  if (!['current-episode', 'latest-batch'].includes(snapshot.sourceReadinessLiveProgressScope)) fail(`Source readiness live progress scope invalid: ${snapshot.sourceReadinessLiveProgressScope}`);
  if (typeof snapshot.sourceReadinessLiveProgressBlockerCount !== 'number') fail('Source readiness live progress blocker count missing');
  if (typeof snapshot.sourceReadinessLiveProgressRequestedCount !== 'number') fail('Source readiness live progress requested count missing');
  if (typeof snapshot.sourceReadinessLiveProgressDownloadingCount !== 'number') fail('Source readiness live progress downloading count missing');
  if (typeof snapshot.sourceReadinessLiveProgressDownloadedCount !== 'number') fail('Source readiness live progress downloaded count missing');
  if (typeof snapshot.sourceReadinessLiveProgressWatchIsRunning !== 'boolean') fail('Source readiness live progress watch-running state missing');
}
if (snapshot.sourceReadinessLastSummaryBlockerRows.length > 0) {
  const blockerRow = snapshot.sourceReadinessLastSummaryBlockerRows[0];
  if (typeof blockerRow.episodeSlug !== 'string') fail('Source readiness blocker row episode missing');
  if (typeof (blockerRow.name || blockerRow.label) !== 'string') fail('Source readiness blocker row label missing');
  if (!Array.isArray(blockerRow.trackIds)) fail('Source readiness blocker row track IDs missing');
  if (snapshot.sourceReadinessNextBlockerRevealButtonId !== 'episode-editor-source-readiness-next-blocker-reveal-button') fail('Source readiness next-blocker reveal marker missing');
  if (snapshot.sourceReadinessNextBlockerCopyButtonId !== 'episode-editor-source-readiness-next-blocker-copy-button') fail('Source readiness next-blocker copy marker missing');
  if (snapshot.sourceReadinessBlockerActionSchema !== 'source-readiness-board-reveal-copy-actions-v2') fail('Source readiness blocker action schema missing');
  if (typeof snapshot.sourceReadinessNextBlockerEpisodeSlug !== 'string') fail('Source readiness next-blocker episode missing');
  if (snapshot.sourceReadinessCurrentEpisodeBoardId !== 'episode-editor-source-readiness-current-episode-board') fail('Source readiness current-episode board marker missing');
  if (snapshot.sourceReadinessCurrentEpisodeBoardSchema !== 'source-readiness-current-episode-board-v1') fail('Source readiness current-episode board schema missing');
  if (typeof snapshot.sourceReadinessCurrentEpisodeBlockerCount !== 'number') fail('Source readiness current-episode blocker count missing');
  if (typeof snapshot.sourceReadinessCurrentEpisodeVisibleBlockerRows !== 'number') fail('Source readiness current-episode visible row count missing');
}
for (const target of snapshot.episodeRescueBoardTargets) {
  if (typeof target.cardId !== 'string' || !target.cardId.startsWith('episode-editor-rescue-card-')) fail('Episode rescue card marker missing');
  if (typeof target.loaded !== 'boolean') fail('Episode rescue target loaded state missing');
  if (typeof target.programMissingSourceDecisions !== 'number') fail('Episode rescue target program missing-source count missing');
  if (!('sourceProgressRowId' in target)) fail('Episode rescue target source-progress row marker missing');
  if (target.sourceProgressRowId !== null) {
    if (typeof target.sourceProgressTitle !== 'string') fail('Episode rescue target source-progress title missing');
    if (typeof target.sourceProgressBlockerCount !== 'number') fail('Episode rescue target source-progress blocker count missing');
    if (typeof target.sourceProgressRequestedCount !== 'number') fail('Episode rescue target source-progress requested count missing');
    if (typeof target.sourceProgressDownloadingCount !== 'number') fail('Episode rescue target source-progress downloading count missing');
    if (typeof target.sourceProgressDownloadedCount !== 'number') fail('Episode rescue target source-progress downloaded count missing');
  }
  if (typeof target.sourcePreflightRowId !== 'string' || !target.sourcePreflightRowId.startsWith('episode-editor-rescue-card-source-preflight-')) {
    fail('Episode rescue target source-preflight row marker missing');
  }
  if (typeof target.sourcePreflightSummary !== 'string') fail('Episode rescue target source-preflight summary missing');
  if (!['Open episode to calculate', 'No source downloads needed', 'Fits current disk', 'Free space first', 'Unknown source sizes', 'Disk space unknown'].includes(target.sourcePreflightRecommendation)) {
    fail(`Episode rescue target source-preflight recommendation invalid: ${target.sourcePreflightRecommendation}`);
  }
  if (target.loaded) {
    if (typeof target.sourcePreflightGroupCount !== 'number') fail('Loaded rescue target source-preflight group count missing');
    if (typeof target.sourcePreflightDecisionCount !== 'number') fail('Loaded rescue target source-preflight decision count missing');
    if (typeof target.sourcePreflightUniqueSourceCount !== 'number') fail('Loaded rescue target source-preflight unique source count missing');
    if (typeof target.sourcePreflightKnownSourceCount !== 'number') fail('Loaded rescue target source-preflight known source count missing');
    if (typeof target.sourcePreflightUnknownSourceCount !== 'number') fail('Loaded rescue target source-preflight unknown source count missing');
    if (typeof target.sourcePreflightEstimatedBytes !== 'number') fail('Loaded rescue target source-preflight estimated bytes missing');
    if (target.sourcePreflightKnownSourceCount + target.sourcePreflightUnknownSourceCount !== target.sourcePreflightUniqueSourceCount) {
      fail('Loaded rescue target source-preflight known/unknown counts do not match unique source count');
    }
    if (target.sourcePreflightEstimatedBytes < 0) fail('Loaded rescue target source-preflight estimated bytes cannot be negative');
    if (target.sourcePreflightFitsCurrentDisk !== null && typeof target.sourcePreflightFitsCurrentDisk !== 'boolean') {
      fail('Loaded rescue target source-preflight disk fit should be boolean or null');
    }
  }
}
if (snapshot.hasLocalSession === false) {
  if (fs.existsSync(sessionFile)) {
    fail('A local edit session exists on disk, but the visible editor did not load it');
  }
  console.log(JSON.stringify({
    visibleEditorSnapshot: 'ok',
    localEditState: 'empty',
    wroteAt: snapshot.wroteAt,
    projectSlug: snapshot.projectSlug,
    episodeSlug: snapshot.episodeSlug,
    hasConnectedNestProfile: Boolean(snapshot.hasConnectedNestProfile),
    message: 'No local edit session exists yet; empty-state route loaded cleanly.',
  }, null, 2));
  process.exit(0);
}
if (!snapshot.monitorWallId || snapshot.monitorWallId !== 'episode-editor-monitor-wall') fail('Monitor wall snapshot marker missing');
if (snapshot.renderReadinessPanelId !== 'episode-editor-render-readiness-panel') fail('Render readiness panel marker missing');
if (snapshot.renderReadinessSchema !== 'local-render-readiness-program-source-review-v2') fail('Render readiness schema marker missing');
if (snapshot.renderReadinessExportStatusSchema !== 'program-export-vs-source-review-v1') fail('Render readiness export/source-review schema marker missing');
if (snapshot.renderReadinessWorkflowStripId !== 'episode-editor-render-readiness-workflow-strip') fail('Render readiness workflow strip marker missing');
if (snapshot.renderReadinessWorkflowSchema !== 'edit-proof-draft-publish-strip-v1') fail('Render readiness workflow schema missing');
if (typeof snapshot.renderReadinessCanProof !== 'boolean') fail('Render readiness proof availability missing');
if (typeof snapshot.renderReadinessCanDraftExport !== 'boolean') fail('Render readiness draft export availability missing');
if (snapshot.renderReadinessCanDraftExport && !snapshot.renderReadinessCanProof) fail('Draft export cannot be ready when proof render is blocked');
if (snapshot.localDiskSafetySchema !== 'local-disk-space-render-source-guard-v1') fail('Local disk safety schema marker missing');
if (!['critical', 'constrained', 'ready', 'unknown'].includes(snapshot.localDiskSafetyLevel)) fail(`Local disk safety level invalid: ${snapshot.localDiskSafetyLevel}`);
if (snapshot.localDiskAvailableBytes !== null && typeof snapshot.localDiskAvailableBytes !== 'number') fail('Local disk available bytes invalid');
if (snapshot.localDiskSafetyLevel === 'ready') {
  if (snapshot.localDiskSafetyBannerId !== null) fail('Local disk safety banner should be hidden when disk is ready');
  if (snapshot.localDiskSafetyOpenCacheButtonId !== null) fail('Local disk cache button should be hidden when disk is ready');
  if (snapshot.localDiskSafetyStorageSettingsButtonId !== null) fail('Local disk storage settings button should be hidden when disk is ready');
} else if (snapshot.localDiskSafetyBannerId !== 'episode-editor-local-disk-safety-banner') {
  fail('Local disk safety banner marker missing while disk is not ready');
} else {
  if (snapshot.localDiskSafetyOpenCacheButtonId !== 'episode-editor-local-disk-open-cache-button') fail('Local disk cache button marker missing while disk is not ready');
  if (snapshot.localDiskSafetyStorageSettingsButtonId !== 'episode-editor-local-disk-storage-settings-button') fail('Local disk storage settings button marker missing while disk is not ready');
}
if (snapshot.sourceDownloadsDiskGateSchema !== 'critical-disk-pauses-source-materialization-v1') fail('Source-download disk gate schema missing');
if (typeof snapshot.sourceDownloadsBlockedByDisk !== 'boolean') fail('Source-download disk gate boolean missing');
if (snapshot.sourceDownloadsBlockedByDisk !== (snapshot.localDiskSafetyLevel === 'critical')) fail('Source-download disk gate should only activate on critical disk');
if (snapshot.sourceDownloadPreflightSchema !== 'source-materialization-size-preflight-v1') fail('Source-download preflight schema missing');
if (typeof snapshot.sourceDownloadPreflightSummary !== 'string') fail('Source-download preflight summary missing');
if (typeof snapshot.sourceDownloadPreflightGroupCount !== 'number') fail('Source-download preflight group count missing');
if (typeof snapshot.sourceDownloadPreflightDecisionCount !== 'number') fail('Source-download preflight decision count missing');
if (typeof snapshot.sourceDownloadPreflightUniqueSourceCount !== 'number') fail('Source-download preflight unique source count missing');
if (typeof snapshot.sourceDownloadPreflightKnownSourceCount !== 'number') fail('Source-download preflight known source count missing');
if (typeof snapshot.sourceDownloadPreflightUnknownSourceCount !== 'number') fail('Source-download preflight unknown source count missing');
if (typeof snapshot.sourceDownloadPreflightEstimatedBytes !== 'number') fail('Source-download preflight estimated bytes missing');
if (snapshot.sourceDownloadPreflightKnownSourceCount + snapshot.sourceDownloadPreflightUnknownSourceCount !== snapshot.sourceDownloadPreflightUniqueSourceCount) {
  fail('Source-download preflight known/unknown source counts do not match unique source count');
}
if (snapshot.sourceDownloadPreflightGroupCount !== snapshot.sourceRecoveryDownloadGroupCount) fail('Source-download preflight group count does not match download group count');
if (snapshot.sourceDownloadPreflightDecisionCount !== snapshot.sourceRecoveryDownloadDecisionCount) fail('Source-download preflight decision count does not match download decision count');
if (snapshot.sourceDownloadPreflightEstimatedBytes < 0) fail('Source-download preflight estimated bytes cannot be negative');
if (snapshot.sourceDownloadsBlockedByDisk) {
  if (typeof snapshot.sourceDownloadsBlockedReason !== 'string' || snapshot.sourceDownloadsBlockedReason.length < 12) fail('Source-download disk gate reason missing');
  if (snapshot.sourceReadinessStartWatchButtonEnabled !== false) fail('Source readiness watch should be disabled while disk gate is active');
  if (snapshot.sourceReadinessStartFirstThreeWatchButtonEnabled !== false) fail('Source readiness first-three watch should be disabled while disk gate is active');
  if (snapshot.sourceRecoveryStartWatchButtonEnabled !== false) fail('Source recovery start watch should be disabled while disk gate is active');
  if (snapshot.sourceRecoveryStartFirstThreeWatchButtonEnabled !== false) fail('Source recovery first-three watch should be disabled while disk gate is active');
  if (snapshot.sourceDownloadsExportGuideGateId !== 'episode-editor-source-download-disk-gate-export-guide') fail('Source-download export guide disk gate marker missing');
  if (snapshot.sourceRecoveryDownloadGroupCount > 0 && snapshot.sourceDownloadsRecoveryPlanGateId !== 'episode-editor-source-download-disk-gate-recovery-plan') {
    fail('Source-download recovery plan disk gate marker missing');
  }
} else {
  if (snapshot.sourceDownloadsBlockedReason !== null) fail('Source-download disk gate reason should be null when not blocked');
  if (typeof snapshot.sourceReadinessStartWatchButtonEnabled !== 'boolean') fail('Source readiness watch enabled state missing');
  if (typeof snapshot.sourceReadinessStartFirstThreeWatchButtonEnabled !== 'boolean') fail('Source readiness first-three enabled state missing');
  if (typeof snapshot.sourceRecoveryStartWatchButtonEnabled !== 'boolean') fail('Source recovery start watch enabled state missing');
  if (typeof snapshot.sourceRecoveryStartFirstThreeWatchButtonEnabled !== 'boolean') fail('Source recovery first-three enabled state missing');
}
if (snapshot.localExportGuideId !== 'episode-editor-local-export-guide') fail('Local export guide marker missing');
if (snapshot.localExportGuideSchema !== 'proof-then-draft-local-export-guide-v1') fail('Local export guide schema marker missing');
if (snapshot.sourceReadinessCommandRowId !== 'episode-editor-source-readiness-command-row') fail('Source readiness command row marker missing');
if (snapshot.sourceReadinessCommandSchema !== 'local-source-byte-readiness-command-v1') fail('Source readiness command schema marker missing');
if (snapshot.sourceReadinessAuditButtonId !== 'episode-editor-copy-source-readiness-command-button') fail('Source readiness audit button marker missing');
if (snapshot.sourceReadinessDownloadButtonId !== 'episode-editor-copy-source-readiness-download-command-button') fail('Source readiness download button marker missing');
if (snapshot.sourceReadinessWatchButtonId !== 'episode-editor-copy-source-readiness-watch-command-button') fail('Source readiness watch button marker missing');
if (snapshot.sourceReadinessFirstThreeWatchButtonId !== 'episode-editor-copy-source-readiness-first-three-watch-command-button') fail('Source readiness first-three watch button marker missing');
if (snapshot.sourceReadinessStartWatchButtonId !== 'episode-editor-start-source-readiness-watch-button') fail('Source readiness native start-watch button marker missing');
if (snapshot.sourceReadinessStartFirstThreeWatchButtonId !== 'episode-editor-start-source-readiness-first-three-watch-button') fail('Source readiness native first-three watch button marker missing');
if (snapshot.sourceReadinessRevealReportButtonId !== 'episode-editor-reveal-source-readiness-report-button') fail('Source readiness reveal-report button marker missing');
if (typeof snapshot.sourceReadinessCheckIsRunning !== 'boolean') fail('Source readiness checking state missing');
if (typeof snapshot.sourceReadinessWatchIsRunning !== 'boolean') fail('Source readiness running state missing');
if (snapshot.sourceReadinessLastReportPath !== null && typeof snapshot.sourceReadinessLastReportPath !== 'string') fail('Source readiness last report path invalid');
if (typeof snapshot.sourceReadinessAuditCommand !== 'string' || !snapshot.sourceReadinessAuditCommand.includes('render_program_source_readiness.mjs')) fail('Source readiness audit command missing');
if (typeof snapshot.sourceReadinessDownloadCommand !== 'string' || !snapshot.sourceReadinessDownloadCommand.includes('--download')) fail('Source readiness download command missing');
if (typeof snapshot.sourceReadinessWatchCommand !== 'string' || !snapshot.sourceReadinessWatchCommand.includes('render_program_source_watch.mjs')) fail('Source readiness watch command missing');
if (!snapshot.sourceReadinessWatchCommand.includes('--request')) fail('Source readiness watch command should request downloads');
if (typeof snapshot.sourceReadinessFirstThreeWatchCommand !== 'string' || !snapshot.sourceReadinessFirstThreeWatchCommand.includes('episode-1 episode-2 episode-3')) fail('Source readiness first-three watch command missing episode batch');
if (!snapshot.sourceReadinessFirstThreeWatchCommand.includes('--request')) fail('Source readiness first-three watch command should request downloads');
if (snapshot.renderProofSchema !== 'local-proof-render-current-playhead-v1') fail('Proof render schema marker missing');
if (snapshot.renderProofButtonId !== 'episode-editor-proof-render-button') fail('Proof render button marker missing');
if (typeof snapshot.renderProofButtonEnabled !== 'boolean') fail('Proof render button enabled state missing');
if (typeof snapshot.renderProofStartSeconds !== 'number') fail('Proof render start seconds missing');
if (snapshot.renderProofStartPolicy !== 'prefer-current-playhead-else-first-small-program-media-v1') fail('Proof render start policy marker missing');
if (snapshot.renderProofStartNoteId !== 'episode-editor-proof-render-start-note') fail('Proof render start note marker missing');
if (typeof snapshot.renderProofIsRunning !== 'boolean') fail('Proof render running state missing');
if (snapshot.renderProofRevealButtonId !== 'episode-editor-reveal-proof-render-button') fail('Proof render reveal button marker missing');
if (typeof snapshot.renderProofRevealButtonEnabled !== 'boolean') fail('Proof render reveal button enabled state missing');
if (snapshot.renderDraftExportSchema !== 'confirmed-local-full-draft-export-v1') fail('Draft export schema marker missing');
if (snapshot.renderDraftExportButtonId !== 'episode-editor-draft-export-button') fail('Draft export button marker missing');
if (typeof snapshot.renderDraftExportButtonEnabled !== 'boolean') fail('Draft export button enabled state missing');
if (typeof snapshot.renderDraftExportIsRunning !== 'boolean') fail('Draft export running state missing');
if (snapshot.renderDraftExportRevealButtonId !== 'episode-editor-reveal-draft-export-button') fail('Draft export reveal button marker missing');
if (typeof snapshot.renderDraftExportRevealButtonEnabled !== 'boolean') fail('Draft export reveal button enabled state missing');
if (snapshot.renderFullDraftExportCommandButtonId !== 'episode-editor-copy-full-draft-export-command-button') fail('Full draft export command button marker missing');
if (snapshot.renderFullDraftExportCommandSchema !== 'copy-guarded-full-draft-export-command-v1') fail('Full draft export command schema marker missing');
if (typeof snapshot.renderReadinessStatus !== 'string' || snapshot.renderReadinessStatus.length < 8) fail('Render readiness status missing');
if (typeof snapshot.renderReadinessActiveMissingSourceDecisions !== 'number') fail('Render readiness missing-source decision count missing');
if (typeof snapshot.renderReadinessActiveMissingSourceGroups !== 'number') fail('Render readiness missing-source group count missing');
if (typeof snapshot.renderReadinessProgramMissingSourceDecisions !== 'number') fail('Render readiness program missing-source decision count missing');
if (typeof snapshot.renderReadinessProgramMissingSourceGroups !== 'number') fail('Render readiness program missing-source group count missing');
if (typeof snapshot.renderReadinessProgramPartialSourceDecisions !== 'number') fail('Render readiness program partial-source decision count missing');
if (typeof snapshot.renderReadinessSourceReviewOnlyDecisions !== 'number') fail('Render readiness source-review-only decision count missing');
if (typeof snapshot.renderReadinessSourceReviewOnlyGroups !== 'number') fail('Render readiness source-review-only group count missing');
if (typeof snapshot.renderReadinessActiveVideoNeedsProxy !== 'number') fail('Render readiness video proxy count missing');
if (typeof snapshot.renderReadinessPreservedInactiveDecisions !== 'number') fail('Render readiness preserved inactive count missing');
if (snapshot.renderReadinessActiveMissingSourceGroups > snapshot.renderReadinessActiveMissingSourceDecisions) fail('Render readiness source groups exceed source decisions');
if (snapshot.renderReadinessProgramMissingSourceGroups > snapshot.renderReadinessActiveMissingSourceGroups) fail('Program missing source groups exceed active missing source groups');
if (snapshot.renderReadinessSourceReviewOnlyGroups > snapshot.renderReadinessActiveMissingSourceGroups) fail('Source-review-only groups exceed active missing source groups');
if (snapshot.renderReadinessProgramMissingSourceDecisions + snapshot.renderReadinessSourceReviewOnlyDecisions !== snapshot.renderReadinessActiveMissingSourceDecisions) {
  fail('Program/source-review missing source decisions do not add up to active missing decisions');
}
if (snapshot.sourceGapRescueSchema !== 'manual-source-gap-file-picker-or-reveal-download-v2') fail('Source gap rescue schema marker missing');
if (snapshot.renderReadinessActiveMissingSourceGroups > 0) {
  if (snapshot.sourceGapRescueListId !== 'episode-editor-source-gap-rescue-list') fail('Source gap rescue list marker missing while missing source groups exist');
  if (snapshot.sourceGapDiagnosticsButtonId !== 'episode-editor-copy-missing-source-diagnostics-button') fail('Source gap diagnostics copy button marker missing while missing source groups exist');
  if (snapshot.sourceGapDiagnosticsSchema !== 'copy-missing-source-diagnostics-v1') fail('Source gap diagnostics schema marker missing');
  if (!Array.isArray(snapshot.sourceGapRescueGroups)) fail('Source gap rescue groups are missing');
  if (snapshot.sourceGapRescueGroups.length !== snapshot.renderReadinessActiveMissingSourceGroups) fail('Source gap rescue group count mismatch');
  if (snapshot.sourceGapRescueVisibleButtonCount !== Math.min(6, snapshot.renderReadinessActiveMissingSourceGroups)) fail('Source gap rescue visible button count mismatch');
  for (const group of snapshot.sourceGapRescueGroups) {
    if (typeof group.label !== 'string' || group.label.length < 2) fail('Source gap rescue group label missing');
    if (typeof group.clipCount !== 'number' || group.clipCount <= 0) fail('Source gap rescue group clip count missing');
    if (typeof group.trackId !== 'string' || group.trackId.length === 0) fail('Source gap rescue group track ID missing');
    if (typeof group.expectedFileName !== 'string' || group.expectedFileName.length === 0) fail('Source gap rescue group expected filename missing');
    if (typeof group.sourcePathExists !== 'boolean') fail('Source gap rescue group source path exists marker missing');
    if (typeof group.sourcePathHasLocalBytes !== 'boolean') fail('Source gap rescue group source local bytes marker missing');
    if (group.estimatedDownloadBytes !== null && typeof group.estimatedDownloadBytes !== 'number') fail('Source gap rescue group estimated download bytes invalid');
    if (group.sourcePathExists) {
      if (typeof group.sourcePath !== 'string' || group.sourcePath.length === 0) fail('Source gap rescue group source path missing');
      if (typeof group.sourceGapRevealButtonId !== 'string' || !group.sourceGapRevealButtonId.includes('episode-editor-source-gap-reveal-')) {
        fail('Source gap rescue group reveal button marker missing for existing source');
      }
    }
    if (typeof group.recommendedAction !== 'string' || group.recommendedAction.length < 10) fail('Source gap rescue group recommended action missing');
    if (typeof group.firstStartIn !== 'number') fail('Source gap rescue group first source start missing');
    if (!Array.isArray(group.sampleClipIDs) || group.sampleClipIDs.length === 0) fail('Source gap rescue group sample clip IDs missing');
    if (typeof group.blocksProgramExport !== 'boolean') fail('Source gap rescue group program-blocking marker missing');
    if (typeof group.sourceReviewOnly !== 'boolean') fail('Source gap rescue group source-review marker missing');
    if (group.blocksProgramExport === group.sourceReviewOnly) fail('Source gap rescue group should be either program-blocking or source-review-only');
  }
}
if (snapshot.monitorDecisionOverlaySchema !== 'selected-decision-boundary-overlay-v1') fail('Selected decision monitor overlay schema marker missing');
if (snapshot.initialSelectionSchema !== 'program-video-first-v1') fail('Program/video-first initial selection schema marker missing');
if (snapshot.selectedDecisionBannerId !== 'episode-editor-selected-decision-banner') fail('Selected decision banner marker missing');
if (snapshot.selectedDecisionOverlayVisible !== true) fail('Selected decision overlay is not visible');
if (!snapshot.selectedClipTrackId || typeof snapshot.selectedClipTrackId !== 'string') fail('Selected decision track marker missing');
if (!String(snapshot.selectedClipTrackId).toUpperCase().startsWith('V')) fail(`Initial selected decision should be a video/program decision, got ${snapshot.selectedClipTrackId}`);
if (snapshot.selectedClipIsVideoLike !== true) fail('Initial selected decision is not video-like');
if (typeof snapshot.selectedClipIsActive !== 'boolean') fail('Selected decision active state missing');
if (typeof snapshot.selectedClipIsAtPlayhead !== 'boolean') fail('Selected decision playhead relation missing');
if (typeof snapshot.selectedClipIsProgramClip !== 'boolean') fail('Selected decision program relation missing');
if (snapshot.selectedClipIsAtPlayhead !== true) fail('Initial selected decision is not parked at the visible playhead');
if (snapshot.selectedClipIsProgramClip !== true) fail('Initial selected decision is not the program monitor decision');
if (typeof snapshot.selectedClipEditStart !== 'number' || typeof snapshot.selectedClipEditEnd !== 'number') fail('Selected decision edit boundaries missing');
if (typeof snapshot.selectedClipSourceStart !== 'number' || typeof snapshot.selectedClipSourceEnd !== 'number') fail('Selected decision source boundaries missing');
if (snapshot.selectedClipHasTimelineEdgeHandles !== true) fail('Selected decision timeline edge handles are not marked visible');
if (snapshot.selectedClipPlayheadMarkerVisible !== true) fail('Selected decision playhead marker is not marked visible');
if (!snapshot.programMonitorId || snapshot.programMonitorId !== 'episode-editor-program-monitor') fail('Program monitor snapshot marker missing');
if (!snapshot.timelinePanelId || snapshot.timelinePanelId !== 'episode-editor-native-timeline') fail('Native timeline snapshot marker missing');
if (!snapshot.timelineNavigatorId || snapshot.timelineNavigatorId !== 'episode-editor-timeline-navigator') fail('Timeline navigator snapshot marker missing');
if (!Array.isArray(snapshot.videoTracks) || snapshot.videoTracks.length === 0) fail('Snapshot has no video tracks');
if (!Array.isArray(snapshot.sourceMonitorIds) || snapshot.sourceMonitorIds.length !== snapshot.videoTracks.length) fail('Snapshot source monitor IDs do not match video tracks');
if (!snapshot.sourceMonitorIds.includes(`episode-editor-source-monitor-${snapshot.videoTracks[0]}`)) fail('First source monitor ID missing');
if (!Array.isArray(snapshot.timelineTracks) || snapshot.timelineTracks.length === 0) fail('Native timeline has no track IDs');
if (typeof snapshot.timelineTrackCount !== 'number' || snapshot.timelineTrackCount < snapshot.videoTracks.length) fail('Native timeline track count is invalid');
if (typeof snapshot.timelineVideoTrackCount !== 'number' || snapshot.timelineVideoTrackCount !== snapshot.videoTracks.length) fail('Native timeline video track count mismatch');
if (typeof snapshot.timelineAudioTrackCount !== 'number') fail('Native timeline audio track count missing');
if (typeof snapshot.timelineDecisionCount !== 'number' || snapshot.timelineDecisionCount <= 0) fail('Native timeline decision count missing');
if (typeof snapshot.timelineInactiveDecisionCount !== 'number') fail('Native timeline inactive decision count missing');
if (typeof snapshot.timelineNavigatorClipCount !== 'number' || snapshot.timelineNavigatorClipCount <= 0) fail('Timeline navigator clip count missing');
if (typeof snapshot.timelineNavigatorActiveSegments !== 'number' || snapshot.timelineNavigatorActiveSegments <= 0) fail('Timeline navigator active segments missing');
if (typeof snapshot.timelineNavigatorInactiveSegments !== 'number') fail('Timeline navigator inactive segments missing');
if (snapshot.timelineInactiveDecisionCount > 0 && snapshot.timelineNavigatorInactiveSegments <= 0) fail('Timeline navigator does not expose inactive segments');
if (snapshot.timelineFollowBehavior !== 'navigator-centers-selected-decision-or-playhead-anchor-v1') fail('Timeline navigator follow behavior marker missing');
if (snapshot.timelineKeyboardSchema !== 'transport-jkl-edit-d-s-v1') fail('Timeline keyboard shortcut schema marker missing');
if (snapshot.timelineClipAffordanceSchema !== 'visible-edge-handles-and-playhead-marker-v1') fail('Timeline clip affordance schema marker missing');
if (snapshot.timelineClipHandleInteractionSchema !== 'drag-trim-source-boundaries-v1') fail('Timeline clip handle interaction schema marker missing');
if (snapshot.timelineClipMoveInteractionSchema !== 'drag-move-edit-decision-v1') fail('Timeline clip move interaction schema marker missing');
if (snapshot.timelineSelectedBoundaryOverlaySchema !== 'selected-decision-row-boundary-brackets-v1') fail('Timeline selected boundary overlay schema marker missing');
if (snapshot.timelineDensityControlsSchema !== 'overview-normal-surgery-density-v1') fail('Timeline density controls schema marker missing');
if (snapshot.timelineClipSurgeryInspectorSchema !== 'selected-decision-surgery-metrics-v1') fail('Timeline decision surgery inspector schema marker missing');
if (snapshot.timelineClipSurgeryActionSchema !== 'selected-decision-surgery-actions-v1') fail('Timeline decision surgery action schema marker missing');
if (snapshot.timelinePlaybackModeSchema !== 'visible-play-edit-play-all-contract-v1') fail('Timeline playback mode schema marker missing');
if (!['edit', 'all'].includes(snapshot.playbackMode)) fail(`Timeline playback mode missing or invalid: ${snapshot.playbackMode}`);
if (typeof snapshot.timelinePlaybackModeExplanation !== 'string' || snapshot.timelinePlaybackModeExplanation.length < 8) fail('Timeline playback mode explanation missing');
if (snapshot.timelineSelectedSourceSchema !== 'always-visible-selected-source-relationship-v1') fail('Timeline selected source schema marker missing');
if (!['program-selected', 'source-visible-program-other', 'source-visible-skipped-by-edit', 'selected-outside-playhead'].includes(snapshot.timelineSelectedSourceRelationship)) {
  fail(`Timeline selected source relationship missing or invalid: ${snapshot.timelineSelectedSourceRelationship}`);
}
if (snapshot.timelineMonitorStripSchema !== 'program-and-source-monitor-strip-v1') fail('Timeline monitor strip schema marker missing');
if (snapshot.timelineMonitorStripVideoTrackCount !== snapshot.timelineVideoTrackCount) fail('Timeline monitor strip video track count mismatch');
if (snapshot.programClipAtPlayhead && typeof snapshot.timelineMonitorStripProgramTrack !== 'string') fail('Timeline monitor strip program track missing');
if (!['overview', 'normal', 'surgery'].includes(snapshot.timelineDensity)) fail(`Timeline density mode missing or invalid: ${snapshot.timelineDensity}`);
if (typeof snapshot.timelineDensityRowHeight !== 'number' || snapshot.timelineDensityRowHeight <= 0) fail('Timeline density row height missing');
if (typeof snapshot.timelineDensityRulerHeight !== 'number' || snapshot.timelineDensityRulerHeight <= 0) fail('Timeline density ruler height missing');
if (typeof snapshot.timelineDensityPixelsPerSecond !== 'number' || snapshot.timelineDensityPixelsPerSecond <= 0) fail('Timeline density pixel scale missing');
if (snapshot.timelinePrecisionNudgeSchema !== 'selected-decision-nudge-0.1-1-10-v1') fail('Timeline precision nudge schema marker missing');
if (snapshot.timelinePrecisionTrimSchema !== 'selected-decision-trim-0.1-1-10-v1') fail('Timeline precision trim schema marker missing');
if (snapshot.timelineVisibleInspectorControlsSchema !== 'selected-decision-visible-trim-move-controls-v3') fail('Timeline visible inspector controls schema marker missing');
if (snapshot.timelineClipBoundaryJumpSchema !== 'selected-decision-go-in-go-out-v1') fail('Timeline selected decision boundary jump schema marker missing');
if (!Array.isArray(snapshot.timelineKeyboardShortcuts) || !['J', 'K', 'L', 'D', 'S', 'E', '[', ']'].every((key) => snapshot.timelineKeyboardShortcuts.includes(key))) {
  fail('Timeline keyboard shortcut set is incomplete');
}
if (snapshot.timelineEditNavigationSchema !== 'prev-next-cut-skip-jump-v1') fail('Timeline edit navigation schema marker missing');
if (snapshot.timelineEditNavigationSelectionSchema !== 'jump-buttons-select-nearest-decision-v1') fail('Timeline edit navigation selection schema marker missing');
if (typeof snapshot.timelineEditNavigationCutCount !== 'number' || snapshot.timelineEditNavigationCutCount <= 0) fail('Timeline edit navigation cut count missing');
if (typeof snapshot.timelineEditNavigationSkippedCount !== 'number' || snapshot.timelineEditNavigationSkippedCount < 0) fail('Timeline edit navigation skipped count missing');
if (snapshot.timelineEditNavigationNextCut !== null && typeof snapshot.timelineEditNavigationNextCut !== 'number') fail('Timeline next cut target invalid');
if (snapshot.timelineEditNavigationPreviousCut !== null && typeof snapshot.timelineEditNavigationPreviousCut !== 'number') fail('Timeline previous cut target invalid');
if (snapshot.timelineEditNavigationPreviousSkipped !== null && typeof snapshot.timelineEditNavigationPreviousSkipped !== 'number') fail('Timeline previous skipped target invalid');
if (snapshot.timelineEditNavigationNextSkipped !== null && typeof snapshot.timelineEditNavigationNextSkipped !== 'number') fail('Timeline next skipped target invalid');
if (snapshot.timelineDecisionNavigationSchema !== 'select-at-playhead-prev-next-camera-decision-v2') fail('Timeline decision navigation schema marker missing');
if (!['video-tracks', 'all-tracks-fallback'].includes(snapshot.timelineDecisionNavigationFocus)) fail('Timeline decision navigation focus marker missing');
if (typeof snapshot.timelineDecisionNavigationCount !== 'number' || snapshot.timelineDecisionNavigationCount <= 0) fail('Timeline decision navigation count missing');
if (typeof snapshot.timelineDecisionNavigationAllSourceCount !== 'number' || snapshot.timelineDecisionNavigationAllSourceCount < snapshot.timelineDecisionNavigationCount) fail('Timeline all-source decision count invalid');
if (!snapshot.timelineDecisionNavigationCurrentClipId || typeof snapshot.timelineDecisionNavigationCurrentClipTrackId !== 'string') fail('Timeline decision navigation current clip marker missing');
if (typeof snapshot.timelineDecisionNavigationCurrentClipIsActive !== 'boolean') fail('Timeline decision navigation current clip active state missing');
if (snapshot.timelineDecisionNavigationPreviousClipId !== null && typeof snapshot.timelineDecisionNavigationPreviousClipTrackId !== 'string') fail('Timeline decision navigation previous clip marker invalid');
if (snapshot.timelineDecisionNavigationPreviousClipStart !== null && typeof snapshot.timelineDecisionNavigationPreviousClipStart !== 'number') fail('Timeline decision navigation previous start invalid');
if (snapshot.timelineDecisionNavigationNextClipId !== null && typeof snapshot.timelineDecisionNavigationNextClipTrackId !== 'string') fail('Timeline decision navigation next clip marker invalid');
if (snapshot.timelineDecisionNavigationNextClipStart !== null && typeof snapshot.timelineDecisionNavigationNextClipStart !== 'number') fail('Timeline decision navigation next start invalid');
if (snapshot.timelineDecisionNavigationFocus === 'video-tracks') {
  const isVideoTrack = (trackId) => typeof trackId === 'string' && trackId.toUpperCase().startsWith('V');
  if (!isVideoTrack(snapshot.timelineDecisionNavigationCurrentClipTrackId)) fail('Timeline camera navigation current target is not a V* track');
  if (snapshot.timelineDecisionNavigationPreviousClipId !== null && !isVideoTrack(snapshot.timelineDecisionNavigationPreviousClipTrackId)) fail('Timeline camera navigation previous target is not a V* track');
  if (snapshot.timelineDecisionNavigationNextClipId !== null && !isVideoTrack(snapshot.timelineDecisionNavigationNextClipTrackId)) fail('Timeline camera navigation next target is not a V* track');
}
if (typeof snapshot.timelineZoom !== 'number' || snapshot.timelineZoom <= 0) fail('Native timeline zoom missing');
if (snapshot.timelineTrackSummarySchema !== 'track-active-inactive-summary-rail-v1') fail('Timeline track summary schema marker missing');
if (!Array.isArray(snapshot.timelineTrackSummaries) || snapshot.timelineTrackSummaries.length !== snapshot.timelineTrackCount) fail('Timeline track summaries missing or mismatched');
if (!snapshot.timelineTrackSummaries.every((entry) =>
  typeof entry.trackId === 'string' &&
  typeof entry.clipCount === 'number' &&
  typeof entry.activeCount === 'number' &&
  typeof entry.inactiveCount === 'number' &&
  entry.clipCount === entry.activeCount + entry.inactiveCount
)) {
  fail('Timeline track summary counts are invalid');
}
if (snapshot.motionMetadataSchema !== 'local-decision-motion-envelope-v1') fail('Motion/keyframe metadata schema marker missing');
if (snapshot.monitorSourceSelectionSchema !== 'click-monitor-to-select-source-v1') fail('Monitor source selection schema marker missing');
if (snapshot.selectedSourceSpotlightVisible !== true) fail('Selected source spotlight is not visible');
if (!['program-selected', 'source-visible-program-other', 'source-visible-skipped-by-edit', 'selected-outside-playhead'].includes(snapshot.selectedSourceProgramRelationship)) {
  fail(`Selected source relationship missing or invalid: ${snapshot.selectedSourceProgramRelationship}`);
}
if (!snapshot.programClipAtPlayhead) fail('Program monitor has no clip at current playhead');
if (typeof snapshot.clipsWithMediaPath !== 'number') fail('Snapshot did not report media linkage count');
if (typeof snapshot.playableLocalVideoClips !== 'number') fail('Snapshot did not report playable local video count');
if (snapshot.clipsWithMediaPath <= 0) fail('No local media paths are linked into clips; monitors cannot verify source files');
if (snapshot.realPlaybackReady && snapshot.programClipHasPlayableMedia !== true && process.env.QUIPSLY_MAC_ALLOW_UNPLAYABLE_PROGRAM !== '1') {
  fail('Real playback is available, but the visible program monitor is not parked on playable media');
}

console.log(JSON.stringify({
  visibleEditorSnapshot: 'ok',
  wroteAt: snapshot.wroteAt,
  projectSlug: snapshot.projectSlug,
  episodeSlug: snapshot.episodeSlug,
  decisions: snapshot.decisions ?? snapshot.timelineClipCount,
  videoTracks: snapshot.videoTracks,
  timelineTracks: snapshot.timelineTracks,
  renderReadinessStatus: snapshot.renderReadinessStatus,
  renderProofSchema: snapshot.renderProofSchema,
  renderProofButtonEnabled: snapshot.renderProofButtonEnabled,
  renderProofStartSeconds: snapshot.renderProofStartSeconds,
  renderProofStartPolicy: snapshot.renderProofStartPolicy,
  renderProofRevealButtonEnabled: snapshot.renderProofRevealButtonEnabled,
  renderProofLastOutputPath: snapshot.renderProofLastOutputPath,
  renderDraftExportSchema: snapshot.renderDraftExportSchema,
  renderDraftExportButtonEnabled: snapshot.renderDraftExportButtonEnabled,
  renderDraftExportIsRunning: snapshot.renderDraftExportIsRunning,
  renderDraftExportRevealButtonEnabled: snapshot.renderDraftExportRevealButtonEnabled,
  renderDraftExportLastOutputPath: snapshot.renderDraftExportLastOutputPath,
  renderFullDraftExportCommandSchema: snapshot.renderFullDraftExportCommandSchema,
  renderReadinessActiveMissingSourceDecisions: snapshot.renderReadinessActiveMissingSourceDecisions,
  renderReadinessActiveMissingSourceGroups: snapshot.renderReadinessActiveMissingSourceGroups,
  renderReadinessProgramMissingSourceDecisions: snapshot.renderReadinessProgramMissingSourceDecisions,
  renderReadinessProgramMissingSourceGroups: snapshot.renderReadinessProgramMissingSourceGroups,
  renderReadinessProgramPartialSourceDecisions: snapshot.renderReadinessProgramPartialSourceDecisions,
  renderReadinessSourceReviewOnlyDecisions: snapshot.renderReadinessSourceReviewOnlyDecisions,
  renderReadinessSourceReviewOnlyGroups: snapshot.renderReadinessSourceReviewOnlyGroups,
  renderReadinessActiveVideoNeedsProxy: snapshot.renderReadinessActiveVideoNeedsProxy,
  renderReadinessPreservedInactiveDecisions: snapshot.renderReadinessPreservedInactiveDecisions,
  sourceGapDiagnosticsSchema: snapshot.sourceGapDiagnosticsSchema,
  sourceGapDiagnosticsButtonId: snapshot.sourceGapDiagnosticsButtonId,
  sourceGapRescueGroups: snapshot.sourceGapRescueGroups,
  timelineClipCount: snapshot.timelineClipCount,
  timelineInactiveClipCount: snapshot.timelineInactiveClipCount,
  timelineNavigatorClipCount: snapshot.timelineNavigatorClipCount,
  timelineNavigatorActiveSegments: snapshot.timelineNavigatorActiveSegments,
  timelineNavigatorInactiveSegments: snapshot.timelineNavigatorInactiveSegments,
  timelineKeyboardSchema: snapshot.timelineKeyboardSchema,
  timelineClipAffordanceSchema: snapshot.timelineClipAffordanceSchema,
  timelineClipHandleInteractionSchema: snapshot.timelineClipHandleInteractionSchema,
  timelineClipMoveInteractionSchema: snapshot.timelineClipMoveInteractionSchema,
  timelineSelectedBoundaryOverlaySchema: snapshot.timelineSelectedBoundaryOverlaySchema,
  timelineDensityControlsSchema: snapshot.timelineDensityControlsSchema,
  timelineClipSurgeryInspectorSchema: snapshot.timelineClipSurgeryInspectorSchema,
  timelineClipSurgeryActionSchema: snapshot.timelineClipSurgeryActionSchema,
  timelinePlaybackModeSchema: snapshot.timelinePlaybackModeSchema,
  playbackMode: snapshot.playbackMode,
  timelinePlaybackModeExplanation: snapshot.timelinePlaybackModeExplanation,
  timelineSelectedSourceSchema: snapshot.timelineSelectedSourceSchema,
  timelineSelectedSourceRelationship: snapshot.timelineSelectedSourceRelationship,
  timelineMonitorStripSchema: snapshot.timelineMonitorStripSchema,
  timelineMonitorStripVideoTrackCount: snapshot.timelineMonitorStripVideoTrackCount,
  timelineMonitorStripProgramTrack: snapshot.timelineMonitorStripProgramTrack,
  timelineDensity: snapshot.timelineDensity,
  timelineDensityRowHeight: snapshot.timelineDensityRowHeight,
  timelineDensityRulerHeight: snapshot.timelineDensityRulerHeight,
  timelineDensityPixelsPerSecond: snapshot.timelineDensityPixelsPerSecond,
  timelinePrecisionNudgeSchema: snapshot.timelinePrecisionNudgeSchema,
  timelinePrecisionTrimSchema: snapshot.timelinePrecisionTrimSchema,
  timelineVisibleInspectorControlsSchema: snapshot.timelineVisibleInspectorControlsSchema,
  timelineClipBoundaryJumpSchema: snapshot.timelineClipBoundaryJumpSchema,
  timelineEditNavigationSchema: snapshot.timelineEditNavigationSchema,
  timelineEditNavigationSelectionSchema: snapshot.timelineEditNavigationSelectionSchema,
  timelineEditNavigationCutCount: snapshot.timelineEditNavigationCutCount,
  timelineEditNavigationSkippedCount: snapshot.timelineEditNavigationSkippedCount,
  timelineEditNavigationPreviousCut: snapshot.timelineEditNavigationPreviousCut,
  timelineEditNavigationNextCut: snapshot.timelineEditNavigationNextCut,
  timelineEditNavigationPreviousSkipped: snapshot.timelineEditNavigationPreviousSkipped,
  timelineEditNavigationNextSkipped: snapshot.timelineEditNavigationNextSkipped,
  timelineDecisionNavigationSchema: snapshot.timelineDecisionNavigationSchema,
  timelineDecisionNavigationFocus: snapshot.timelineDecisionNavigationFocus,
  timelineDecisionNavigationCount: snapshot.timelineDecisionNavigationCount,
  timelineDecisionNavigationAllSourceCount: snapshot.timelineDecisionNavigationAllSourceCount,
  timelineDecisionNavigationCurrentClipTrackId: snapshot.timelineDecisionNavigationCurrentClipTrackId,
  timelineDecisionNavigationCurrentClipIsActive: snapshot.timelineDecisionNavigationCurrentClipIsActive,
  timelineDecisionNavigationPreviousClipTrackId: snapshot.timelineDecisionNavigationPreviousClipTrackId,
  timelineDecisionNavigationPreviousClipStart: snapshot.timelineDecisionNavigationPreviousClipStart,
  timelineDecisionNavigationNextClipTrackId: snapshot.timelineDecisionNavigationNextClipTrackId,
  timelineDecisionNavigationNextClipStart: snapshot.timelineDecisionNavigationNextClipStart,
  timelineTrackSummarySchema: snapshot.timelineTrackSummarySchema,
  timelineTrackSummaries: snapshot.timelineTrackSummaries,
  monitorDecisionOverlaySchema: snapshot.monitorDecisionOverlaySchema,
  monitorSourceSelectionSchema: snapshot.monitorSourceSelectionSchema,
  selectedSourceProgramRelationship: snapshot.selectedSourceProgramRelationship,
  initialSelectionSchema: snapshot.initialSelectionSchema,
  selectedClipTrackId: snapshot.selectedClipTrackId,
  selectedClipIsVideoLike: snapshot.selectedClipIsVideoLike,
  selectedClipIsAtPlayhead: snapshot.selectedClipIsAtPlayhead,
  selectedClipIsProgramClip: snapshot.selectedClipIsProgramClip,
  selectedClipHasTimelineEdgeHandles: snapshot.selectedClipHasTimelineEdgeHandles,
  selectedClipPlayheadMarkerVisible: snapshot.selectedClipPlayheadMarkerVisible,
  timelineZoom: snapshot.timelineZoom,
  hasConnectedNestProfile: Boolean(snapshot.hasConnectedNestProfile),
  programClipAtPlayhead: snapshot.programClipAtPlayhead,
  programClipHasPlayableMedia: Boolean(snapshot.programClipHasPlayableMedia),
  clipsWithMediaPath: snapshot.clipsWithMediaPath,
  playableLocalVideoClips: snapshot.playableLocalVideoClips,
  realPlaybackReady: Boolean(snapshot.realPlaybackReady),
}, null, 2));
NODESNAPSHOT

if [ ! -f "$SESSION_FILE" ]; then
  echo "PASS: Episode Editor empty-state smoke completed."
  exit 0
fi

node - "$PROJECT_SLUG" "$EPISODE_SLUG" "$SESSION_FILE" <<'NODE'
const fs = require('fs');
const [projectSlug, episodeSlug, sessionFile] = process.argv.slice(2);

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function load() {
  if (!fs.existsSync(sessionFile)) {
    fail(`Missing local edit session: ${sessionFile}`);
  }
  return JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
}

function decisions(session) {
  return Array.isArray(session.editDecisions) ? session.editDecisions : (Array.isArray(session.editDecisions) ? session.editDecisions : []);
}

function decisionStart(decision) {
  return Number.isFinite(decision.timelineStart) ? decision.timelineStart : (decision.startIn || 0);
}

function decisionName(decision) {
  return decision.name || decision.label || decision.id || 'decision';
}

function clipContains(clip, playhead) {
  const start = decisionStart(clip);
  return playhead >= start && playhead < start + Math.max(0.05, clip.duration);
}

function naturalTrackOrder(trackId) {
  const digits = Number(String(trackId).replace(/\D/g, '') || 0);
  if (String(trackId).toUpperCase().startsWith('V')) return 10000 + digits;
  if (String(trackId).toUpperCase().startsWith('A')) return digits;
  return 5000 + digits;
}

function programClip(session, playhead, mode) {
  return decisions(session)
    .filter((clip) =>
      (String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video') &&
      clipContains(clip, playhead) &&
      (mode === 'all' || clip.isActive)
    )
    .sort((a, b) => naturalTrackOrder(b.trackId) - naturalTrackOrder(a.trackId))[0];
}

const originalText = fs.readFileSync(sessionFile, 'utf8');
let session = JSON.parse(originalText);
let decisionList = decisions(session);

if (session.projectSlug !== projectSlug) fail(`Session project mismatch: ${session.projectSlug}`);
if (session.episodeSlug !== episodeSlug) fail(`Session episode mismatch: ${session.episodeSlug}`);
if (!Array.isArray(decisionList) || decisionList.length === 0) fail('No local edit decisions loaded');

const videoTracks = [...new Set(decisionList
  .filter((clip) => String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video')
  .map((clip) => clip.trackId))]
  .sort((a, b) => naturalTrackOrder(a) - naturalTrackOrder(b));

if (videoTracks.length === 0) fail('No video tracks available for monitor wall');

const clipsWithMediaPath = decisionList.filter((clip) => typeof clip.localMediaPath === 'string' && clip.localMediaPath.length > 0).length;
const existingMediaClips = decisionList.filter((clip) => typeof clip.localMediaPath === 'string' && clip.localMediaPath.length > 0 && fs.existsSync(clip.localMediaPath)).length;
const existingVideoMediaClips = decisionList.filter((clip) => (
  (String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video') &&
  typeof clip.localMediaPath === 'string' &&
  clip.localMediaPath.length > 0 &&
  fs.existsSync(clip.localMediaPath)
)).length;

if (clipsWithMediaPath <= 0) fail('Local edit decisions do not include Premiere media paths');

const editClip = programClip(session, 0, 'edit');
const allClip = programClip(session, 0, 'all');
if (!allClip) fail('Play All has no program/source clip at 0:00');
if (!editClip) fail('Play Edit has no active program clip at 0:00');

const targetIndex = decisionList.findIndex((clip) => String(clip.trackId).toUpperCase().startsWith('V') || String(clip.kind).toLowerCase() === 'video');
if (targetIndex < 0) fail('No video decision found for reversible edit test');

const before = JSON.parse(JSON.stringify(decisionList[targetIndex]));
try {
  decisionList[targetIndex].isActive = !decisionList[targetIndex].isActive;
  decisionList[targetIndex].sourceStart = Number((decisionList[targetIndex].sourceStart + 0.1).toFixed(3));
  decisionList[targetIndex].duration = Math.max(0.05, Number((decisionList[targetIndex].sourceEnd - decisionList[targetIndex].sourceStart).toFixed(3)));
  session.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  fs.writeFileSync(sessionFile, JSON.stringify(session, null, 2));

  const changed = load();
  const changedClip = decisions(changed)[targetIndex];
  if (changedClip.isActive === before.isActive) fail('Reversible active toggle did not persist');
  if (changedClip.sourceStart === before.sourceStart) fail('Reversible source-in nudge did not persist');
} finally {
  const restored = JSON.parse(originalText);
  restored.updatedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  fs.writeFileSync(sessionFile, JSON.stringify(restored, null, 2));
}

const restored = load();
const restoredDecisions = decisions(restored);
const restoredClip = restoredDecisions[targetIndex];
if (restoredClip.isActive !== before.isActive) fail('Restore failed for active flag');
if (restoredClip.sourceStart !== before.sourceStart) fail('Restore failed for sourceStart');

const active = restoredDecisions.filter((clip) => clip.isActive).length;
const inactive = restoredDecisions.length - active;
console.log(JSON.stringify({
  ok: true,
  projectSlug,
  episodeSlug,
  decisions: restoredDecisions.length,
  active,
  inactive,
  videoTracks,
  editMonitorAtZero: decisionName(editClip),
  playAllAtZero: decisionName(allClip),
  clipsWithMediaPath,
  existingMediaClips,
  existingVideoMediaClips,
  realPlaybackReady: existingVideoMediaClips > 0,
  reversibleEditRestored: true,
}, null, 2));
NODE

if /usr/bin/log show --last 2m --style compact --predicate "process == '$APP_NAME'" | rg -q 'Publishing changes from within view updates|Fatal error|SwiftUI.*cycle|crashed'; then
  echo "FAIL: suspicious QuipslyMac runtime log entry found" >&2
  /usr/bin/log show --last 2m --style compact --predicate "process == '$APP_NAME'" | rg 'Publishing changes from within view updates|Fatal error|SwiftUI.*cycle|crashed' >&2 || true
  exit 1
fi

echo "PASS: Episode Editor smoke completed."
