#!/usr/bin/env python3
"""Read-only selected decision state contract check.

Compares the active Studio state, selected decision intent evidence, and
selected decision cut-intelligence payloads. The goal is not to prove an edit is
good; it is to prove the tools are looking at the same decision before Codex or
a human changes review metadata.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any


MODEL = "quipsly-selected-decision-state-contract-check"
VERSION = "2026-06-30.selected-decision-state-contract-check.v1"
DEFAULT_BASE_URL = "http://127.0.0.1:8765"


@dataclass
class FetchResult:
    path: str
    ok: bool
    payload: dict[str, Any] | None = None
    error: str | None = None


def fetch_json(base_url: str, path: str, timeout: float = 3.0) -> FetchResult:
    url = base_url.rstrip("/") + path
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        return FetchResult(path=path, ok=False, error=f"HTTP {exc.code}: {exc.reason}")
    except urllib.error.URLError as exc:
        return FetchResult(path=path, ok=False, error=f"connection failed: {exc.reason}")
    except TimeoutError:
        return FetchResult(path=path, ok=False, error="connection timed out")
    except OSError as exc:
        return FetchResult(path=path, ok=False, error=str(exc))

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        return FetchResult(path=path, ok=False, error=f"invalid JSON: {exc}")

    if not isinstance(parsed, dict):
        return FetchResult(path=path, ok=False, error="JSON payload was not an object")
    return FetchResult(path=path, ok=True, payload=parsed)


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def first_present(payload: dict[str, Any], keys: list[str]) -> Any:
    for key in keys:
        if key in payload and payload[key] not in (None, ""):
            return payload[key]
    return None


def nested_first(payload: dict[str, Any], paths: list[list[str]]) -> Any:
    for path in paths:
        cursor: Any = payload
        for key in path:
            if not isinstance(cursor, dict) or key not in cursor:
                cursor = None
                break
            cursor = cursor[key]
        if cursor not in (None, ""):
            return cursor
    return None


def selected_decision_container(payload: dict[str, Any]) -> dict[str, Any]:
    for key in (
        "selectedDecision",
        "selectedDecisionIntentEvidence",
        "selectedDecisionCutIntelligence",
        "selectedDecisionIntent",
        "decision",
        "tag",
        "selectedTag",
    ):
        candidate = as_dict(payload.get(key))
        if candidate:
            return candidate
    return {}


def extract_identity(payload: dict[str, Any], source: str) -> dict[str, Any]:
    container = selected_decision_container(payload)
    combined = {**payload, **container}

    decision_id = first_present(
        combined,
        [
            "selectedDecisionId",
            "decisionId",
            "selectedTagId",
            "tagId",
            "id",
            "uuid",
        ],
    )
    lane_id = first_present(
        combined,
        [
            "selectedLaneId",
            "laneId",
            "trackId",
            "sourceLaneId",
            "sourceId",
        ],
    )
    kind = first_present(
        combined,
        [
            "decisionType",
            "selectedTagType",
            "tagType",
            "type",
            "kind",
            "intent",
            "action",
        ],
    )
    start = first_present(
        combined,
        [
            "selectedSequenceStart",
            "sequenceStart",
            "sequenceStartSeconds",
            "selectedTagStart",
            "start",
            "startSeconds",
            "in",
            "inSeconds",
        ],
    )
    end = first_present(
        combined,
        [
            "selectedSequenceEnd",
            "sequenceEnd",
            "sequenceEndSeconds",
            "end",
            "endSeconds",
            "out",
            "outSeconds",
        ],
    )
    duration = first_present(combined, ["duration", "durationSeconds", "lengthSeconds"])
    next_action = first_present(
        combined,
        [
            "nextAction",
            "nextSafeAction",
            "nextSafestAction",
            "recommendedAction",
        ],
    ) or nested_first(
        combined,
        [
            ["next", "action"],
            ["review", "nextAction"],
            ["quality", "nextAction"],
        ],
    )

    return {
        "source": source,
        "decisionId": decision_id,
        "laneId": lane_id,
        "kind": kind,
        "start": start,
        "end": end,
        "duration": duration,
        "nextAction": next_action,
        "status": payload.get("status"),
    }


def stable_boundary(identity: dict[str, Any]) -> str | None:
    start = identity.get("start")
    end = identity.get("end")
    lane_id = identity.get("laneId")
    if start is None and end is None:
        return None
    return f"{lane_id or 'unknown-lane'}:{start}->{end}"


def command_labels(payload: dict[str, Any]) -> list[str]:
    commands = payload.get("safeCommands")
    if not isinstance(commands, list):
        return []
    labels: list[str] = []
    for command in commands:
        if isinstance(command, str):
            labels.append(command)
        elif isinstance(command, dict):
            label = command.get("label") or command.get("command") or command.get("id")
            if label:
                labels.append(str(label))
    return labels


def build_report(base_url: str) -> dict[str, Any]:
    paths = {
        "state": "/state",
        "intentEvidence": "/selected_decision_intent_evidence",
        "cutIntelligence": "/selected_decision_cut_intelligence",
    }
    fetched = {name: fetch_json(base_url, path) for name, path in paths.items()}

    errors = [
        {"surface": name, "path": result.path, "error": result.error}
        for name, result in fetched.items()
        if not result.ok
    ]
    payloads = {
        name: result.payload or {}
        for name, result in fetched.items()
    }

    identities = {
        name: extract_identity(payload, name)
        for name, payload in payloads.items()
    }

    present_ids = {
        name: identity.get("decisionId")
        for name, identity in identities.items()
        if identity.get("decisionId")
    }
    id_values = set(present_ids.values())
    ids_match = len(id_values) <= 1 and len(present_ids) >= 2

    boundaries = {
        name: stable_boundary(identity)
        for name, identity in identities.items()
        if stable_boundary(identity)
    }
    boundary_values = set(boundaries.values())
    boundaries_match = len(boundary_values) <= 1 and len(boundaries) >= 2

    evidence_payload = payloads["intentEvidence"]
    intelligence_payload = payloads["cutIntelligence"]
    safe_commands = command_labels(evidence_payload) or command_labels(intelligence_payload)
    next_safe_command = (
        safe_commands[0]
        if safe_commands
        else "script/agentctl.sh selected-decision-production-brief --markdown"
    )

    problems: list[str] = []
    if errors:
        problems.append("one or more decision truth surfaces could not be read")
    if not ids_match:
        problems.append("selected decision ids are missing or disagree")
    if not boundaries_match and len(boundaries) >= 2:
        problems.append("selected decision boundaries disagree")
    if not present_ids and not boundaries:
        problems.append("no selected decision identity or boundary was discoverable")

    status = "contract-ok" if not problems else "needs-attention"
    return {
        "model": MODEL,
        "version": VERSION,
        "status": status,
        "baseUrl": base_url,
        "truth": {
            "readOnly": True,
            "mutatesSession": False,
            "exportsFiles": False,
            "publishesExternally": False,
            "touchesSourceMedia": False,
            "purpose": "Confirm selected decision surfaces agree before review or edit actions.",
        },
        "checks": {
            "idsMatch": ids_match,
            "boundariesMatch": boundaries_match,
            "presentIds": present_ids,
            "boundaries": boundaries,
            "problems": problems,
            "errors": errors,
        },
        "selectedDecision": identities["state"],
        "intentEvidence": {
            **identities["intentEvidence"],
            "safeCommands": command_labels(evidence_payload),
        },
        "cutIntelligence": {
            **identities["cutIntelligence"],
            "safeCommands": command_labels(intelligence_payload),
        },
        "nextSafeCommand": next_safe_command,
        "safeCommands": safe_commands,
    }


def render_markdown(report: dict[str, Any]) -> str:
    status = report["status"]
    checks = report["checks"]
    lines = [
        f"# Selected Decision State Contract: {status}",
        "",
        f"- Model: `{report['model']}`",
        f"- Version: `{report['version']}`",
        f"- Base URL: `{report['baseUrl']}`",
        "- Truth: read-only; no exports, publishing, source-media changes, or session mutation.",
        "",
        "## Contract checks",
        "",
        f"- Decision IDs match: `{checks['idsMatch']}`",
        f"- Boundaries match: `{checks['boundariesMatch']}`",
        f"- Present IDs: `{json.dumps(checks['presentIds'], sort_keys=True)}`",
        f"- Boundaries: `{json.dumps(checks['boundaries'], sort_keys=True)}`",
    ]

    if checks["problems"]:
        lines.extend(["", "## Needs attention", ""])
        lines.extend(f"- {problem}" for problem in checks["problems"])

    if checks["errors"]:
        lines.extend(["", "## Read errors", ""])
        for error in checks["errors"]:
            lines.append(f"- `{error['surface']}` `{error['path']}`: {error['error']}")

    lines.extend(
        [
            "",
            "## Selected decision",
            "",
            identity_line(report["selectedDecision"]),
            "",
            "## Intent evidence",
            "",
            identity_line(report["intentEvidence"]),
            "",
            "## Cut intelligence",
            "",
            identity_line(report["cutIntelligence"]),
            "",
            "## Next safe command",
            "",
            f"```bash\n{report['nextSafeCommand']}\n```",
        ]
    )
    return "\n".join(lines) + "\n"


def identity_line(identity: dict[str, Any]) -> str:
    parts = [
        f"id={identity.get('decisionId') or 'unknown'}",
        f"lane={identity.get('laneId') or 'unknown'}",
        f"kind={identity.get('kind') or 'unknown'}",
        f"start={identity.get('start') if identity.get('start') is not None else 'unknown'}",
        f"end={identity.get('end') if identity.get('end') is not None else 'unknown'}",
        f"next={identity.get('nextAction') or 'unknown'}",
    ]
    return "- " + "; ".join(parts)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--json", action="store_true", help="emit JSON")
    parser.add_argument("--markdown", action="store_true", help="emit Markdown")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    report = build_report(args.base_url)
    if args.json and not args.markdown:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(render_markdown(report), end="")
    return 0 if report["status"] == "contract-ok" else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
