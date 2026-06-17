#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke Episode 1 delivery readiness contract.

Usage:
  script/smoke_episode1_delivery_readiness.sh [--no-build]

This does not render or publish. It proves the app can tell humans and agents
the truth about:
  - 16:9 episode master readiness
  - 9:16 vertical render readiness
  - social short clip export readiness or queue gap
  - podcast audio master gap
  - direct channel publishing gap
USAGE
}

for arg in "$@"; do
  case "$arg" in
    --no-build)
      NO_BUILD=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$NO_BUILD" == false ]]; then
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-delivery-readiness-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-delivery-readiness-load.json
"$ROOT_DIR/script/agentctl.sh" state >/tmp/quipslystudio-delivery-readiness-state.json

python3 - /tmp/quipslystudio-delivery-readiness-state.json "$ROOT_DIR" <<'PY'
import json
import subprocess
import sys
import time

state_path = sys.argv[1]
root_dir = sys.argv[2]
agentctl = f"{root_dir}/script/agentctl.sh"

last_state = {}
for _ in range(20):
    result = subprocess.run([agentctl, "state"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode == 0:
        try:
            last_state = json.loads(result.stdout)
        except Exception:
            last_state = {}
        if (
            last_state.get("activeSessionName") == "episode-1-premiere-rescue"
            and last_state.get("productionReady") is True
            and int(last_state.get("sourcePlayerCount") or 0) >= 3
        ):
            open(state_path, "w").write(json.dumps(last_state, indent=2, sort_keys=True))
            raise SystemExit(0)
    time.sleep(0.25)

open(state_path, "w").write(json.dumps(last_state, indent=2, sort_keys=True))
raise SystemExit("Episode 1 did not become productionReady before delivery readiness check.")
PY

"$ROOT_DIR/script/agentctl.sh" delivery-readiness >/tmp/quipslystudio-delivery-readiness.json

python3 - /tmp/quipslystudio-delivery-readiness.json <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1]))
errors = []

if payload.get("model") != "episode-to-platform-delivery-readiness":
    errors.append("Missing delivery readiness model name.")
if payload.get("version") != "2026-06-16.delivery-readiness.v1":
    errors.append("Unexpected delivery readiness version.")
if "proxy-first" not in payload.get("sourcePolicy", ""):
    errors.append("Proxy-first source policy is missing.")
if payload.get("readyForDirectPublishing") is not False:
    errors.append("Direct publishing should not be claimed ready yet.")
if "Export readiness is not account publishing" not in payload.get("publishingTruth", ""):
    errors.append("Publishing truth does not separate export from account publishing.")

lanes = {lane.get("id"): lane for lane in payload.get("lanes") or []}
required = {
    "episode-16x9-master",
    "episode-9x16-master",
    "social-short-clips",
    "podcast-audio-master",
    "channel-publishing",
}
missing = sorted(required - set(lanes))
if missing:
    errors.append(f"Missing delivery lanes: {', '.join(missing)}")

for lane_id in ["episode-16x9-master", "episode-9x16-master"]:
    lane = lanes.get(lane_id, {})
    if lane.get("status") != "ready":
        errors.append(f"{lane_id} should be render-ready for Episode 1 proxy session.")
    if "/export_proxy_package" not in lane.get("agentAction", ""):
        errors.append(f"{lane_id} lacks export proxy package agent action.")

social = lanes.get("social-short-clips", {})
if social.get("status") not in {"ready", "planned", "blocked"}:
    errors.append("Social shorts lane has unexpected status.")
social_text = social.get("summary", "") + social.get("blocker", "") + social.get("nextAction", "")
if social.get("status") == "ready":
    if "/shorts_export_selected" not in social.get("agentAction", ""):
        errors.append("Ready social shorts lane lacks selected-short export agent action.")
    if "captions" not in social_text:
        errors.append("Ready social shorts lane does not name remaining caption/template work.")
else:
    if "clip queue" not in social_text:
        errors.append("Social shorts lane does not name the clip queue gap.")

podcast = lanes.get("podcast-audio-master", {})
if "audio-only" not in (podcast.get("blocker", "") + podcast.get("nextAction", "")):
    errors.append("Podcast lane does not name the audio-only master gap.")

publishing = lanes.get("channel-publishing", {})
if publishing.get("status") != "planned":
    errors.append("Direct channel publishing should be planned, not ready.")
if "OAuth" not in publishing.get("blocker", ""):
    errors.append("Direct publishing lane does not name channel OAuth/integration gap.")

proof = {
    "status": "failed" if errors else "passed",
    "version": payload.get("version"),
    "renderFoundationReady": payload.get("renderFoundationReady"),
    "readyForDirectPublishing": payload.get("readyForDirectPublishing"),
    "lanes": {lane_id: lanes.get(lane_id, {}).get("status") for lane_id in sorted(lanes)},
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
