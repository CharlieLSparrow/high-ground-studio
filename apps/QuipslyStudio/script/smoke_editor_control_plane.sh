#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NO_BUILD=false

usage() {
  cat <<'USAGE'
Smoke QuipslyStudio editor control plane.

Usage:
  script/smoke_editor_control_plane.sh [--no-build]

This proves the product-grade automation contract:
  - named editor surfaces exist
  - each surface exposes state, semantic commands, and proof paths
  - pixel/Computer Use automation is explicitly a physical proof layer, not the product API
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
  "$ROOT_DIR/script/build_and_run.sh" --verify >/tmp/quipslystudio-control-plane-build.log
fi

"$ROOT_DIR/script/agentctl.sh" load-session episode-1-premiere-rescue >/tmp/quipslystudio-control-plane-load.json
"$ROOT_DIR/script/agentctl.sh" control-plane >/tmp/quipslystudio-control-plane.json
python3 - /tmp/quipslystudio-control-plane.json <<'PY'
import json
import sys

payload = json.load(open(sys.argv[1]))
errors = []

if payload.get("version") != "2026-06-16.editor-control-plane.v1":
    errors.append("Unexpected or missing control plane version.")

principle = payload.get("principle", "")
if "Pixel automation" not in principle:
    errors.append("Control plane does not distinguish semantic control from pixel automation.")

surfaces = {surface.get("id"): surface for surface in payload.get("surfaces") or []}
required = {
    "program-monitor",
    "source-monitor-wall",
    "decision-timeline",
    "inspector",
    "production-readiness",
}
missing = sorted(required - set(surfaces))
if missing:
    errors.append(f"Missing control surfaces: {', '.join(missing)}")

for surface_id, surface in surfaces.items():
    if not surface.get("stateFields"):
        errors.append(f"{surface_id} has no state fields.")
    if not surface.get("semanticCommands"):
        errors.append(f"{surface_id} has no semantic commands.")
    if "GET /state" not in surface.get("proof", []):
        errors.append(f"{surface_id} does not prove through /state.")

program_commands = surfaces.get("program-monitor", {}).get("semanticCommands", [])
if not any("/program_scroll" in command for command in program_commands):
    errors.append("Program monitor lacks semantic program_scroll control.")

timeline_commands = surfaces.get("decision-timeline", {}).get("semanticCommands", [])
if not any("/timeline_zoom" in command for command in timeline_commands):
    errors.append("Decision timeline lacks semantic timeline zoom control.")

rules = " ".join(payload.get("rules") or [])
if "Whole source lanes remain whole" not in rules:
    errors.append("Whole-source-lane rule missing from control plane.")

proof = {
    "status": "failed" if errors else "passed",
    "version": payload.get("version"),
    "surfaceCount": len(surfaces),
    "surfaces": sorted(surfaces.keys()),
    "errors": errors,
}
print(json.dumps(proof, indent=2, sort_keys=True))
if errors:
    raise SystemExit(1)
PY
