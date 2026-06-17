#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$ROOT_DIR/../.." && pwd)"
AGENT_URL="${QUIPSLY_AGENT_URL:-http://127.0.0.1:8080}"
SESSION_NAME="${1:-}"
PACKET_PATH="${2:-}"

usage() {
  cat <<'EOF'
Usage:
  script/report_native_episode_recovery.sh [session-name] [premiere-packet-json]

Examples:
  script/report_native_episode_recovery.sh episode-2-native-proof ../../content/quipsly/premiere-imports/episode-2.json
  script/report_native_episode_recovery.sh episode-1-premiere-rescue

Reports current production-editor recovery state using live app state plus safe
filesystem metadata. It intentionally treats zero-block large files as offline
placeholders even when stale Premiere packet health says "exists".
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

python3 - "$ROOT_DIR" "$REPO_ROOT" "$AGENT_URL" "$SESSION_NAME" "$PACKET_PATH" <<'PY'
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

root = Path(sys.argv[1])
repo_root = Path(sys.argv[2])
agent_url = sys.argv[3].rstrip("/")
session_name = sys.argv[4].strip()
packet_arg = sys.argv[5].strip()


def request(path: str):
    with urllib.request.urlopen(agent_url + path, timeout=20) as response:
        data = response.read()
    if not data:
        return {}
    return json.loads(data)


def command(command_name: str, **values):
    query = urllib.parse.urlencode(values)
    suffix = f"?{query}" if query else ""
    return request(f"/{command_name}{suffix}")


def state():
    return request("/state")


def local_status(path_value: str):
    if not path_value:
        return {
            "kind": "unknown",
            "exists": False,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "message": "No source path reported.",
            "nextAction": "Relink this lane to a whole source or attach a full-length proxy.",
        }
    if path_value.startswith("/__quipsly_missing_media__"):
        return {
            "kind": "missing-placeholder",
            "exists": False,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "message": "Premiere placeholder has no local file path.",
            "nextAction": "Relink this lane to the original whole source, or attach a full-length proxy.",
        }

    path = Path(path_value)
    try:
        stat = path.stat()
    except FileNotFoundError:
        return {
            "kind": "missing-local-file",
            "exists": False,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "message": "Path is not present locally.",
            "nextAction": "Recover/download/move the original, then relink it or attach a full-length proxy.",
        }
    except PermissionError:
        return {
            "kind": "permission-protected",
            "exists": True,
            "logicalBytes": 0,
            "allocatedBytesApprox": 0,
            "message": "macOS denied metadata access.",
            "nextAction": "Use the app's Grant originals later action only when you intentionally need original-folder work.",
        }

    logical = int(stat.st_size)
    allocated = int(getattr(stat, "st_blocks", 0)) * 512
    if logical > 1024 * 1024 and allocated == 0:
        return {
            "kind": "offline-placeholder",
            "exists": True,
            "logicalBytes": logical,
            "allocatedBytesApprox": allocated,
            "message": "Looks like a cloud/offline placeholder: large logical size, zero allocated bytes.",
            "nextAction": "Download/replace this file before generating a proxy. Do not preview from it.",
        }

    if logical == 0:
        return {
            "kind": "empty-file",
            "exists": True,
            "logicalBytes": logical,
            "allocatedBytesApprox": allocated,
            "message": "File exists but is empty.",
            "nextAction": "Replace it with the actual original or attach a valid full-length proxy.",
        }

    return {
        "kind": "local-file",
        "exists": True,
        "logicalBytes": logical,
        "allocatedBytesApprox": allocated,
        "message": "File has local bytes and can be considered for proxy generation if explicitly granted.",
        "nextAction": "Generate/attach a deterministic full-length proxy for this whole source lane.",
    }


def packet_path_for_session(session: str):
    if packet_arg:
        candidate = Path(packet_arg)
        if not candidate.is_absolute():
            candidate = (Path.cwd() / candidate).resolve()
        return candidate
    if not session:
        return None
    if "episode-2" in session:
        return repo_root / "content/quipsly/premiere-imports/episode-2.json"
    if "episode-1" in session:
        return repo_root / "content/quipsly/premiere-imports/episode-1.json"
    if "episode-3" in session:
        return repo_root / "content/quipsly/premiere-imports/episode-3.json"
    return None


if session_name:
    command("load_session", name=session_name)

current = state()
packet_path = packet_path_for_session(current.get("activeSessionName", "") or session_name)
packet = None
packet_media_by_name = {}
if packet_path and packet_path.exists():
    packet = json.loads(packet_path.read_text())
    for media in packet.get("media", []):
        names = {
            media.get("title"),
            media.get("originalName"),
            Path(media.get("filePath") or "").name,
            Path(media.get("actualMediaFilePath") or "").name,
        }
        for name in names:
            if name:
                packet_media_by_name.setdefault(name.lower(), media)

lanes = current.get("lanes", [])
blocked = []
ready = []
for lane in lanes:
    role = (lane.get("role") or "").lower()
    kind = (lane.get("mediaKind") or "").lower()
    is_audio = kind == "audio" or "audio" in role
    item = {
        "name": lane.get("name"),
        "role": lane.get("role"),
        "kind": kind,
        "ready": bool(lane.get("sourceReady")),
        "readiness": lane.get("sourceReadiness"),
        "detail": lane.get("sourceReadinessDetail"),
        "recoveryCategory": lane.get("recoveryCategory"),
        "recoveryNextAction": lane.get("recoveryNextAction"),
        "sourcePath": lane.get("sourcePath"),
        "proxyPath": lane.get("playbackPath") or lane.get("expectedProxyPath") or "",
        "localStatus": local_status(lane.get("sourcePath") or ""),
        "showDecisionCount": lane.get("activeCount"),
        "skipDecisionCount": lane.get("cutCount"),
    }
    packet_media = packet_media_by_name.get((Path(item["sourcePath"] or "").name).lower())
    if packet_media:
        item["packetHealth"] = packet_media.get("health")
        item["packetDurationSeconds"] = packet_media.get("durationSeconds")
    if item["ready"]:
        ready.append(item)
    elif not is_audio:
        blocked.append(item)

operator_steps = []
for item in blocked:
    status = item["localStatus"]["kind"]
    name = item["name"]
    if status == "offline-placeholder":
        operator_steps.append(f"Download or replace {name}: {item['sourcePath']}")
    elif status in {"missing-placeholder", "missing-local-file", "unknown"}:
        operator_steps.append(f"Relink or attach a full-length proxy for {name}")
    elif status == "local-file":
        operator_steps.append(f"Generate/attach a full-length proxy for {name}")
    else:
        operator_steps.append(f"Resolve {name}: {item['localStatus']['nextAction']}")

report = {
    "activeSessionName": current.get("activeSessionName"),
    "projectTitle": current.get("projectTitle"),
    "sequenceTitle": current.get("sequenceTitle"),
    "productionReady": current.get("productionReady"),
    "productionReadinessDetail": current.get("productionReadinessDetail"),
    "counts": {
        "lanes": current.get("laneCount"),
        "videoProxyReady": current.get("videoProxyReadyCount"),
        "videoBlocked": current.get("videoBlockedCount"),
        "audioReady": current.get("audioReadyCount"),
        "sourcePlayers": current.get("sourcePlayerCount"),
        "showDecisions": current.get("showDecisionCount"),
        "skipDecisions": current.get("skipDecisionCount"),
    },
    "packetPath": str(packet_path) if packet_path else "",
    "blockedVideoLanes": blocked,
    "readyLaneNames": [item["name"] for item in ready],
    "operatorSteps": operator_steps,
    "safeCommands": [
        "script/agentctl.sh attach-proxy '<lane name>' '/path/to/full-length-proxy.mp4'",
        "script/agentctl.sh relink-lane '<lane name>' '/path/to/whole-original-file.mp4'",
        "script/agentctl.sh retry-proxies  # only after explicitly granting the originals folder in-app",
    ],
}

print(json.dumps(report, indent=2))

out_dir = root / "reports"
out_dir.mkdir(parents=True, exist_ok=True)
out_name = f"{current.get('activeSessionName') or 'native-session'}-recovery-report.json"
out_path = out_dir / out_name
out_path.write_text(json.dumps(report, indent=2) + "\n")
print(f"\nWrote recovery report: {out_path}")
PY
