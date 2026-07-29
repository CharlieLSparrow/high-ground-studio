#!/usr/bin/env python3
"""Build a dry-run patch packet from approved human-flow promotion actions.

The packet is an explicit bridge toward future timeline metadata application,
but this script does not apply anything. It reads sidecar approvals and writes
approved metadata patch previews only.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any


DEFAULT_SESSIONS_DIR = Path("/Users/wall-e/Movies/QuipslyExports/human-flow-review/sessions")


def text(value: Any, default: str = "") -> str:
    if value is None:
        return default
    result = str(value).strip()
    return result or default


def resolve_session_path(value: str) -> Path:
    if value == "latest":
        if not DEFAULT_SESSIONS_DIR.exists():
            raise FileNotFoundError(f"No review sessions folder exists yet: {DEFAULT_SESSIONS_DIR}")
        candidates = [
            path for path in DEFAULT_SESSIONS_DIR.iterdir()
            if path.is_dir() and (path / "review-session.json").exists()
        ]
        if not candidates:
            raise FileNotFoundError(f"No review sessions found under: {DEFAULT_SESSIONS_DIR}")
        return max(candidates, key=lambda path: path.stat().st_mtime)
    path = Path(value).expanduser()
    if path.is_file():
        return path.parent
    return path


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected JSON object at {path}")
    return payload


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            payload = json.loads(line)
            if isinstance(payload, dict):
                rows.append(payload)
    return rows


def approved_patch_from_approval(approval: dict[str, Any]) -> dict[str, Any] | None:
    if not approval.get("approvedForApply"):
        return None
    action = approval.get("actionSnapshot")
    if not isinstance(action, dict) or not action:
        return None
    patch = action.get("metadataPatch")
    if not isinstance(patch, dict):
        patch = {}
    return {
        "boundaryId": text(action.get("boundaryId"), text(approval.get("actionRef"), "unknown-boundary")),
        "actionType": text(action.get("actionType"), "unknown-action"),
        "label": text(action.get("label"), "Approved metadata patch"),
        "reason": text(action.get("reason"), "Approved human-flow review action."),
        "approvedBy": text(approval.get("reviewer"), "unknown-reviewer"),
        "approvedAt": text(approval.get("recordedAt"), ""),
        "approvalNotes": text(approval.get("notes"), ""),
        "metadataPatch": patch,
        "sourceApproval": approval,
        "applyState": "not_applied",
        "requiresExplicitApplyCommand": True,
        "truth": "Approved patch preview only. This packet has not mutated timeline metadata.",
    }


def build_packet(session_dir: Path) -> dict[str, Any]:
    session = read_json(session_dir / "review-session.json")
    plan_path = session_dir / "review-promotion-plan.json"
    approvals_path = session_dir / "review-promotion-approvals.jsonl"
    plan = read_json(plan_path) if plan_path.exists() else {}
    approvals = read_jsonl(approvals_path)
    approved_patches = [
        patch for patch in (approved_patch_from_approval(row) for row in approvals)
        if patch is not None
    ]
    action_counts: dict[str, int] = {}
    for patch in approved_patches:
        action_type = text(patch.get("actionType"), "unknown-action")
        action_counts[action_type] = action_counts.get(action_type, 0) + 1
    return {
        "model": "quipsly-human-flow-approved-patch-packet",
        "version": "2026-06-30.human-flow-approved-patch-packet.v1",
        "generatedAt": dt.datetime.now(dt.timezone.utc).astimezone().isoformat(timespec="seconds"),
        "sessionId": text(session.get("sessionId"), session_dir.name),
        "sessionDir": str(session_dir),
        "sourcePromotionPlan": str(plan_path),
        "sourceApprovalLedger": str(approvals_path),
        "promotionPlanActionCount": len(plan.get("actions", [])) if isinstance(plan.get("actions"), list) else 0,
        "approvalCount": len(approvals),
        "approvedPatchCount": len(approved_patches),
        "approvedActionCounts": action_counts,
        "patches": approved_patches,
        "nextAction": "Inspect this packet, then run a future explicit apply command only when the user approves timeline metadata mutation.",
        "truth": "Dry-run approved patch packet only. Source media, timeline metadata, exports, and publication state are untouched.",
    }


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Quipsly human-flow approved patch packet",
        "",
        f"- Session: `{packet['sessionId']}`",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Approvals: `{packet['approvalCount']}`",
        f"- Approved patches: `{packet['approvedPatchCount']}`",
        f"- Truth: {packet['truth']}",
        "",
        "## Approved action counts",
        "",
    ]
    for label, count in sorted(packet.get("approvedActionCounts", {}).items()):
        lines.append(f"- `{label}`: `{count}`")
    lines.extend(["", "## Patch previews", ""])
    if not packet.get("patches"):
        lines.append("No approved patches yet.")
        return "\n".join(lines)
    for patch in packet.get("patches") or []:
        lines.extend([
            f"### {patch['label']} - {patch['boundaryId']}",
            "",
            f"- Action type: `{patch['actionType']}`",
            f"- Approved by: `{patch['approvedBy']}`",
            f"- Approved at: `{patch['approvedAt']}`",
            f"- Reason: {patch['reason']}",
            f"- Approval notes: {patch['approvalNotes'] or 'None.'}",
            f"- Apply state: `{patch['applyState']}`",
            "",
            "Metadata patch preview:",
            "",
            "```json",
            json.dumps(patch["metadataPatch"], indent=2, sort_keys=True),
            "```",
            "",
        ])
    return "\n".join(lines)


def write_packet(session_dir: Path, packet: dict[str, Any]) -> dict[str, str]:
    json_path = session_dir / "review-approved-patch-packet.json"
    md_path = session_dir / "review-approved-patch-packet.md"
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(packet, handle, indent=2, sort_keys=True)
        handle.write("\n")
    with md_path.open("w", encoding="utf-8") as handle:
        handle.write(render_markdown(packet))
        handle.write("\n")
    return {"json": str(json_path), "markdown": str(md_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", default="latest", help="Session folder, review-session.json path, or 'latest'.")
    args = parser.parse_args()

    session_dir = resolve_session_path(args.session)
    packet = build_packet(session_dir)
    outputs = write_packet(session_dir, packet)
    print(json.dumps({"outputs": outputs, "packet": packet}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
