#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT="$ROOT_DIR/script/agentctl.sh"
OUT_ROOT="${TMPDIR:-/tmp}/quipsly-native-production-editor-matrix"
PROOF_SECONDS="3"
NO_BUILD=0
KEEP_OUTPUTS=0

usage() {
  cat <<'USAGE'
Smoke the native Quipsly production-editor loop.

Checks:
  1. Episode 1 loads as production-ready and has monitor wall/playback proof.
  2. Episode 1 exports bounded proxy-backed 16:9 and 9:16 deliverables.
  3. Episode 2 loads as honestly blocked with known video blockers.
  4. Episode 2 exposes a no-prompt media recovery report for operators/agents.
  5. Episode 3 loads as an honest blocked rescue session with source monitors and edit decisions.

Usage:
  script/smoke_native_production_editor_matrix.sh [--no-build] [--proof-seconds N] [--keep-outputs]
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build)
      NO_BUILD=1
      shift
      ;;
    --proof-seconds)
      PROOF_SECONDS="${2:-}"
      if [[ -z "$PROOF_SECONDS" ]]; then usage; exit 2; fi
      shift 2
      ;;
    --keep-outputs)
      KEEP_OUTPUTS=1
      shift
      ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      usage
      exit 2
      ;;
  esac
done

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required for export media validation." >&2
  exit 2
fi

if [[ "$NO_BUILD" == "0" ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipsly-production-editor-matrix-build.log
fi

for _ in {1..30}; do
  if "$AGENT" health >/tmp/quipsly-production-editor-matrix-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done
"$AGENT" health >/tmp/quipsly-production-editor-matrix-health.json

if [[ "$KEEP_OUTPUTS" == "0" ]]; then
  rm -rf "$OUT_ROOT"
fi
mkdir -p "$OUT_ROOT"

run_interactive_smoke() {
  local session="$1"
  shift
  "$ROOT_DIR/script/smoke_native_session_interactive_editor.sh" --session "$session" --no-build "$@"
}

state_json() {
  "$AGENT" state
}

wait_for_export() {
  local state_path="$1"
  if "$AGENT" wait-export 120 > "$state_path"; then
    return 0
  fi
  python3 - "$state_path" <<'PY'
import json
import sys

state = json.load(open(sys.argv[1]))
export_state = state.get("exportState") or {}
print(json.dumps({
    "exportStatus": export_state.get("status") or state.get("exportStatus"),
    "exportKind": export_state.get("kind"),
    "exportError": export_state.get("error"),
    "outputPaths": export_state.get("outputPaths"),
    "lastMediaAction": state.get("lastMediaAction"),
}, indent=2), file=sys.stderr)
PY
  return 1
}

assert_state_field() {
  local state_path="$1"
  local expression="$2"
  local message="$3"
  python3 - "$state_path" "$expression" "$message" <<'PY'
import json, sys
state = json.load(open(sys.argv[1]))
expr = sys.argv[2]
message = sys.argv[3]
try:
    ok = bool(eval(expr, {"__builtins__": {}}, {"s": state}))
except Exception as exc:
    print(f"Bad assertion {expr!r}: {exc}", file=sys.stderr)
    raise SystemExit(2)
if not ok:
    print(message, file=sys.stderr)
    print(json.dumps({
        "activeSessionName": state.get("activeSessionName"),
        "productionReady": state.get("productionReady"),
        "productionReadinessDetail": state.get("productionReadinessDetail"),
        "videoProxyReadyCount": state.get("videoProxyReadyCount"),
        "videoBlockedCount": state.get("videoBlockedCount"),
        "audioReadyCount": state.get("audioReadyCount"),
        "audioBlockedCount": state.get("audioBlockedCount"),
        "sourceMonitorVideoCount": state.get("sourceMonitorVideoCount"),
        "sourcePlayerCount": state.get("sourcePlayerCount"),
        "lastMediaAction": state.get("lastMediaAction"),
    }, indent=2), file=sys.stderr)
    raise SystemExit(1)
PY
}

probe_output() {
  local file="$1"
  local expected_width="$2"
  local expected_height="$3"
  python3 - "$file" "$expected_width" "$expected_height" <<'PY'
import json, subprocess, sys
path, expected_width, expected_height = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
video = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=codec_name,width,height,duration", "-of", "json", path
]))["streams"][0]
audio = json.loads(subprocess.check_output([
    "ffprobe", "-v", "error", "-select_streams", "a:0",
    "-show_entries", "stream=codec_name,duration", "-of", "json", path
]))["streams"][0]
errors = []
if video.get("codec_name") != "h264": errors.append(f"video codec {video.get('codec_name')}")
if video.get("width") != expected_width or video.get("height") != expected_height:
    errors.append(f"dimensions {video.get('width')}x{video.get('height')}")
if audio.get("codec_name") != "aac": errors.append(f"audio codec {audio.get('codec_name')}")
if float(video.get("duration") or 0) <= 0: errors.append("missing video duration")
if float(audio.get("duration") or 0) <= 0: errors.append("missing audio duration")
if errors:
    print(f"{path} failed probe: " + "; ".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(json.dumps({
    "path": path,
    "video": video,
    "audio": audio,
}, indent=2))
PY
}

echo "== Episode 1 interactive/editor proof =="
run_interactive_smoke episode-1-premiere-rescue --require-production --min-source-monitors 3 | tee "$OUT_ROOT/episode-1-interactive.json"

EP1_EXPORT_DIR="$OUT_ROOT/episode-1-export"
mkdir -p "$EP1_EXPORT_DIR"
"$AGENT" load-session episode-1-premiere-rescue >/tmp/quipsly-production-editor-matrix-ep1-load.json
sleep 1
"$AGENT" export-proxy-package "$EP1_EXPORT_DIR" episode-1-production-matrix "$PROOF_SECONDS" >/tmp/quipsly-production-editor-matrix-ep1-export-command.json
wait_for_export "$OUT_ROOT/episode-1-export-state.json"
assert_state_field "$OUT_ROOT/episode-1-export-state.json" 's.get("productionReady") is True' "Episode 1 should remain production ready after export."
assert_state_field "$OUT_ROOT/episode-1-export-state.json" 's.get("videoProxyReadyCount", 0) >= 3 and s.get("audioReadyCount", 0) >= 2' "Episode 1 should have proxy-backed video and audio lanes."
assert_state_field "$OUT_ROOT/episode-1-export-state.json" '(s.get("exportState") or {}).get("status") == "completed"' "Episode 1 export state should report completed."
assert_state_field "$OUT_ROOT/episode-1-export-state.json" '((s.get("exportState") or {}).get("outputPaths") or []).__len__() == 2' "Episode 1 export state should report both output paths."

printf '\n== Episode 1 export media proof ==\n'
probe_output "$EP1_EXPORT_DIR/episode-1-production-matrix-16x9.mp4" 1920 1080 | tee "$OUT_ROOT/episode-1-16x9-probe.json"
probe_output "$EP1_EXPORT_DIR/episode-1-production-matrix-9x16.mp4" 1080 1920 | tee "$OUT_ROOT/episode-1-9x16-probe.json"

printf '\n== Episode 2 honest blocked proof ==\n'
run_interactive_smoke episode-2-native-proof --allow-blocked-readiness --min-source-monitors 4 | tee "$OUT_ROOT/episode-2-blocked.json"
state_json > "$OUT_ROOT/episode-2-state.json"
"$AGENT" recovery-report > "$OUT_ROOT/episode-2-recovery-report.json"
assert_state_field "$OUT_ROOT/episode-2-state.json" 's.get("productionReady") is False' "Episode 2 should still be blocked until missing video proxies are resolved."
assert_state_field "$OUT_ROOT/episode-2-state.json" 's.get("videoProxyReadyCount", 0) >= 4 and s.get("videoBlockedCount", 0) >= 1' "Episode 2 should show partial proxy readiness plus real blockers."

python3 - "$OUT_ROOT/episode-2-recovery-report.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
errors = []
if report.get("status") != "ok":
    errors.append(f"recovery report status should be ok, got {report.get('status')!r}")
if report.get("productionReady") is not False:
    errors.append("Episode 2 recovery report should preserve honest blocked production state.")
blocked = report.get("blockedLanes") or []
if len(blocked) < 3:
    errors.append(f"expected at least 3 blocked lanes in recovery report, got {len(blocked)}")
rules = report.get("rules") or []
if not any("must not probe protected originals" in rule for rule in rules):
    errors.append("recovery report must carry the no-prompt protected-original rule.")
charlie = next((lane for lane in blocked if "CharlieVid1" in (lane.get("laneName") or "")), None)
if not charlie:
    errors.append("CharlieVid1 blocked lane missing from recovery report.")
elif charlie.get("sourceProbePolicy") != "not_probed_protected_original":
    errors.append(
        "CharlieVid1 should be reported as not_probed_protected_original, "
        f"got {charlie.get('sourceProbePolicy')!r}"
    )

if errors:
    print("\nEpisode 2 recovery report contract FAILED:", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    print(json.dumps({
        "status": report.get("status"),
        "productionReady": report.get("productionReady"),
        "blockedLaneNames": [lane.get("laneName") for lane in blocked],
        "rules": rules,
    }, indent=2), file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "status": "passed",
    "blockedLaneNames": [lane.get("laneName") for lane in blocked],
    "charlieSourceProbePolicy": charlie.get("sourceProbePolicy") if charlie else None,
}, indent=2))
PY

printf '\n== Episode 3 rescue-session proof ==\n'
run_interactive_smoke episode-3-premiere-rescue --allow-blocked-readiness --min-source-monitors 6 | tee "$OUT_ROOT/episode-3-blocked.json"
state_json > "$OUT_ROOT/episode-3-state.json"
"$AGENT" recovery-report > "$OUT_ROOT/episode-3-recovery-report.json"
assert_state_field "$OUT_ROOT/episode-3-state.json" 's.get("productionReady") is False' "Episode 3 should remain honestly blocked until proxies/relinks are resolved."
assert_state_field "$OUT_ROOT/episode-3-state.json" 's.get("sourceMonitorVideoCount", 0) >= 6 and s.get("showDecisionCount", 0) >= 1 and s.get("skipDecisionCount", 0) >= 1' "Episode 3 should preserve source monitors and edit decisions."

python3 - "$OUT_ROOT/episode-3-recovery-report.json" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
errors = []
if report.get("status") != "ok":
    errors.append(f"recovery report status should be ok, got {report.get('status')!r}")
if report.get("productionReady") is not False:
    errors.append("Episode 3 recovery report should preserve honest blocked production state.")
if report.get("videoBlockedCount", 0) < 1:
    errors.append("Episode 3 should report video blockers until proxies/relinks exist.")
if report.get("showDecisionCount", 0) < 1 or report.get("skipDecisionCount", 0) < 1:
    errors.append("Episode 3 recovery report should preserve SHOW/SKIP decisions.")
blocked = report.get("blockedLanes") or []
if len(blocked) < 1:
    errors.append("Episode 3 recovery report should include blocked lanes.")
rules = report.get("rules") or []
if not any("SHOW/SKIP/camera choices are metadata overlays" in rule for rule in rules):
    errors.append("Episode 3 recovery report must carry the metadata-overlays rule.")

if errors:
    print("\nEpisode 3 recovery report contract FAILED:", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    print(json.dumps({
        "status": report.get("status"),
        "productionReady": report.get("productionReady"),
        "videoBlockedCount": report.get("videoBlockedCount"),
        "showDecisionCount": report.get("showDecisionCount"),
        "skipDecisionCount": report.get("skipDecisionCount"),
        "blockedLaneNames": [lane.get("laneName") for lane in blocked],
        "rules": rules,
    }, indent=2), file=sys.stderr)
    raise SystemExit(1)

print(json.dumps({
    "status": "passed",
    "blockedLaneCount": len(blocked),
    "sourceMonitorVideoCount": report.get("sourceMonitorVideoCount"),
    "showDecisionCount": report.get("showDecisionCount"),
    "skipDecisionCount": report.get("skipDecisionCount"),
}, indent=2))
PY

python3 - "$OUT_ROOT/episode-1-export-state.json" "$OUT_ROOT/episode-2-state.json" "$OUT_ROOT/episode-3-state.json" "$OUT_ROOT" <<'PY'
import json, sys
from pathlib import Path

def local_file_status(path_value):
    if not path_value or path_value.startswith("/__quipsly_missing_media__"):
        return {
            "kind": "missing-placeholder",
            "exists": False,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "nextAction": "Relink this Premiere placeholder to the whole original source, or attach a full-length proxy.",
        }
    path = Path(path_value)
    if not path.exists():
        return {
            "kind": "missing-local-file",
            "exists": False,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "nextAction": "Recover/download/move the original, then relink it or attach a full-length proxy.",
        }
    stat = path.stat()
    logical = stat.st_size
    allocated = getattr(stat, "st_blocks", 0) * 512
    if logical > 0 and allocated == 0:
        return {
            "kind": "offline-placeholder",
            "exists": True,
            "logicalBytes": logical,
            "allocatedBytesApprox": allocated,
            "nextAction": "Download or replace this cloud/offline placeholder before proxy generation; the editor must not preview from it.",
        }
    return {
        "kind": "local-file",
        "exists": True,
        "logicalBytes": logical,
        "allocatedBytesApprox": allocated,
        "nextAction": "Generate/attach the deterministic full-length proxy for this whole source lane.",
    }

episode1 = json.load(open(sys.argv[1]))
episode2 = json.load(open(sys.argv[2]))
episode3 = json.load(open(sys.argv[3]))

def video_blockers(state):
    blockers = []
    for lane in state.get("lanes", []):
        role = (lane.get("role") or "").lower()
        kind = (lane.get("mediaKind") or "").lower()
        if lane.get("sourceReady"):
            continue
        if kind == "audio" or "audio" in role:
            continue
        source_path = lane.get("sourcePath") or ""
        blockers.append({
            "name": lane.get("name"),
            "role": lane.get("role"),
            "recoveryCategory": lane.get("recoveryCategory"),
            "recoveryNextAction": lane.get("recoveryNextAction"),
            "readiness": lane.get("sourceReadiness"),
            "detail": lane.get("sourceReadinessDetail"),
            "sourcePath": source_path,
            "expectedProxyPath": lane.get("playbackPath"),
            "localFileStatus": local_file_status(source_path),
        })
    return blockers

episode2_blockers = video_blockers(episode2)
episode3_blockers = video_blockers(episode3)

errors = []
for blocker in episode2_blockers:
    detail = (blocker.get("detail") or "").lower()
    if "too short for this whole lane" in detail or "clipped file" in detail:
        errors.append(
            f"{blocker.get('name')}: stale short-proxy validation failure leaked into the production matrix. "
            "Run the adversarial smoke with session restore, or reload a clean session."
        )

if errors:
    print("\nProduction editor matrix FAILED:", file=sys.stderr)
    for error in errors:
        print(f" - {error}", file=sys.stderr)
    raise SystemExit(1)

summary = {
    "status": "passed",
    "outputRoot": sys.argv[4],
    "episode1": {
        k: episode1.get(k) for k in [
            "productionReady", "productionReadinessDetail", "videoProxyReadyCount", "audioReadyCount", "storageAccessNeededCount", "lastMediaAction"
        ]
    },
    "episode2": {
        k: episode2.get(k) for k in [
            "productionReady", "productionReadinessDetail", "videoProxyReadyCount", "videoBlockedCount", "audioReadyCount", "lastMediaAction"
        ]
    },
    "episode3": {
        k: episode3.get(k) for k in [
            "productionReady", "productionReadinessDetail", "sourceMonitorVideoCount", "videoProxyReadyCount", "videoBlockedCount", "audioReadyCount", "audioBlockedCount", "showDecisionCount", "skipDecisionCount", "lastMediaAction"
        ]
    },
    "episode2Blockers": episode2_blockers,
    "episode3Blockers": episode3_blockers,
}
print("\n== Production editor matrix summary ==")
print(json.dumps(summary, indent=2))
PY

printf '\nNative production editor matrix PASSED.\n'
