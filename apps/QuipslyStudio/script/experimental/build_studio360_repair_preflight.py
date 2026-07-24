#!/usr/bin/env python3
"""Build a focused repair/preflight packet for blocked Studio360 groups.

The packet reads the latest reframe packet and existing media-repair evidence,
then creates a calm operator surface for damaged/missing 360 sources. It does
not repair in place, delete, overwrite, upload, publish, or mark a decision.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_STUDIO360_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.repair-preflight.v2"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-repair-preflight")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def usable_path(path: Path) -> str:
    text = str(path)
    return "" if text in {"", "."} else text


def load_latest_reframe_packet(root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = root / "latest-360-reframe-packet.json"
    pointer = load_json(pointer_path)
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    if not packet:
        raise SystemExit("No Studio360 reframe packet found. Run ./script/agentctl.sh studio360-workflow-packet and reframe prep first.")
    return pointer, packet, packet_path


def latest_repair_evidence(root: Path, group_key: str) -> tuple[dict[str, Any], Path, Path]:
    repair_root = root / "media-repair-tasks"
    json_candidates = sorted(
        repair_root.glob(f"{group_key}*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    markdown_candidates = sorted(
        repair_root.glob(f"{group_key}*.md"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    json_path = json_candidates[0] if json_candidates else Path("")
    markdown_path = markdown_candidates[0] if markdown_candidates else Path("")
    return load_json(json_path), json_path, markdown_path


def latest_repair_request(root: Path, group_key: str) -> tuple[dict[str, Any], Path, Path]:
    request_root = root / "media-repair-requests"
    json_candidates = sorted(
        request_root.glob(f"{group_key}-evidence-request-*.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    markdown_candidates = sorted(
        request_root.glob(f"{group_key}-evidence-request-*.md"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    json_path = json_candidates[0] if json_candidates else Path("")
    markdown_path = markdown_candidates[0] if markdown_candidates else Path("")
    return load_json(json_path), json_path, markdown_path


def ensure_repair_request(root: Path, group_key: str, damaged_assets: list[dict[str, Any]], classification: dict[str, str]) -> tuple[dict[str, Any], Path, Path]:
    existing, existing_json, existing_markdown = latest_repair_request(root, group_key)
    if usable_path(existing_json) or usable_path(existing_markdown):
        return existing, existing_json, existing_markdown
    request_root = root / "media-repair-requests"
    request_root.mkdir(parents=True, exist_ok=True)
    basename = f"{group_key}-evidence-request-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f')}"
    json_path = request_root / f"{basename}.json"
    markdown_path = request_root / f"{basename}.md"
    reveal_commands = [
        str(asset.get("revealCommand") or "")
        for asset in damaged_assets
        if isinstance(asset, dict) and asset.get("revealCommand")
    ]
    decision_commands = [
        {
            "label": "Mark needs redownload after human confirmation",
            "command": f"./script/agentctl.sh studio360-repair-decision {group_key} needs-redownload '<reviewer>' '<source damaged; re-copy or re-download needed>'",
            "safety": "Metadata-only decision; no media is deleted or changed.",
        },
        {
            "label": "Park if not needed after human confirmation",
            "command": f"./script/agentctl.sh studio360-repair-decision {group_key} park '<reviewer>' '<not needed for current edit; source preserved>'",
            "safety": "Metadata-only decision; reversible and source-preserving.",
        },
    ]
    payload = {
        "schema": "quipsly.studio360.repair-evidence-request.v1",
        "generatedAt": iso_now(),
        "status": "operator-evidence-request",
        "groupKey": group_key,
        "truth": "This packet is a request for human/operator evidence, not proof that the source is repaired, usable, parked, or redownloaded.",
        "humanAsk": "Reveal the damaged source paths, confirm whether a clean source can be re-copied or redownloaded, then record a metadata-only decision only after review.",
        "agentSafeParallelWork": "Codex can keep this request visible, summarize source paths, and prepare decision templates; it must not infer the human decision.",
        "classification": classification,
        "damagedAssets": damaged_assets,
        "revealCommands": reveal_commands,
        "decisionCommandTemplates": decision_commands,
        "nextSafestAction": classification.get("nextSafestAction") or "Inspect damaged paths before any repair decision.",
        "safety": {
            "originalsMutated": False,
            "decisionsWritten": False,
            "exportsCreated": False,
            "externalPublishing": False,
        },
    }
    write_json(json_path, payload)
    lines = [
        f"# Studio360 repair evidence request - {group_key}",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        f"Human ask: {payload['humanAsk']}",
        "",
        f"Codex can keep going: {payload['agentSafeParallelWork']}",
        "",
        f"Next safest action: {payload['nextSafestAction']}",
        "",
        "## Reveal damaged sources",
        "",
    ]
    for command in reveal_commands:
        lines.append(f"- `{command}`")
    if not reveal_commands:
        lines.append("- No reveal command available. Inspect the ticket damaged source paths.")
    lines.extend(["", "## Damaged source paths", ""])
    for asset in damaged_assets:
        lines.append(f"- `{asset.get('sourcePath')}` - `{asset.get('kind')}` - {asset.get('error')}")
    lines.extend(["", "## Decision templates - run only after human confirmation", ""])
    for command in decision_commands:
        lines.append(f"- {command['label']}: `{command['command']}`")
        lines.append(f"  - Safety: {command['safety']}")
    lines.append("")
    markdown_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return payload, json_path, markdown_path


def classify_repair(evidence: dict[str, Any], group: dict[str, Any]) -> dict[str, str]:
    candidates = evidence.get("candidates") if isinstance(evidence.get("candidates"), list) else []
    failed_count = sum(1 for item in candidates if isinstance(item, dict) and item.get("ffprobeStatus") == "failed")
    hashes = {str(item.get("sha256") or "") for item in candidates if isinstance(item, dict) and item.get("sha256")}
    if not evidence:
        return {
            "status": "needs-repair-evidence",
            "reason": "No focused repair evidence packet exists for this group yet. Do not guess from the blocked status alone.",
            "nextSafestAction": "Inspect the damaged asset paths, confirm whether source media can be re-copied, then create repair evidence or park only after human confirmation.",
        }
    if candidates and failed_count == len(candidates) and len(hashes) <= 1:
        return {
            "status": "needs-redownload-or-source-recopy",
            "reason": "All found candidates fail ffprobe and appear byte-identical; no usable companion proxy was found.",
            "nextSafestAction": "Re-download/re-copy the original from camera/card/cloud, or park the group if it is not needed.",
        }
    if group.get("reframeStatus") == "blocked-media-repair":
        return {
            "status": "needs-media-repair-review",
            "reason": "The group is blocked by media repair, but evidence is incomplete or mixed.",
            "nextSafestAction": "Open the repair evidence and decide whether to redownload, attach a companion proxy, or park the group.",
        }
    return {
        "status": "repair-review",
        "reason": "Review evidence before taking action.",
        "nextSafestAction": "Open repair evidence, then choose a reversible metadata-only decision.",
    }


def candidate_rows(evidence: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in evidence.get("candidates") or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("path") or "")
        rows.append({
            "path": path,
            "bytes": item.get("bytes") or 0,
            "sha256": item.get("sha256") or "",
            "ffprobeStatus": item.get("ffprobeStatus") or "unknown",
            "ffprobeError": item.get("ffprobeError") or "",
            "revealCommand": f"open -R {shell_quote(path)}" if path else "",
        })
    return rows


def damaged_asset_rows(group: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in group.get("damagedAssets") or []:
        if not isinstance(item, dict):
            continue
        path = str(item.get("sourcePath") or "")
        rows.append({
            "id": item.get("id") or "",
            "filename": item.get("filename") or Path(path).name,
            "kind": item.get("kind") or "",
            "sourcePath": path,
            "error": item.get("error") or "",
            "revealCommand": f"open -R {shell_quote(path)}" if path else "",
        })
    return rows


def group_ticket(root: Path, group: dict[str, Any]) -> dict[str, Any]:
    group_key = str(group.get("groupKey") or "")
    evidence, evidence_json, evidence_markdown = latest_repair_evidence(root, group_key)
    classification = classify_repair(evidence, group)
    damaged_assets = damaged_asset_rows(group)
    evidence_json_text = usable_path(evidence_json)
    evidence_markdown_text = usable_path(evidence_markdown)
    evidence_target = evidence_markdown_text or evidence_json_text
    request: dict[str, Any] = {}
    request_json_text = ""
    request_markdown_text = ""
    if not evidence_target:
        request, request_json, request_markdown = ensure_repair_request(root, group_key, damaged_assets, classification)
        request_json_text = usable_path(request_json)
        request_markdown_text = usable_path(request_markdown)
    request_target = request_markdown_text or request_json_text
    operator_target = evidence_target or request_target
    commands = [
        {
            "label": "Open repair evidence" if evidence_target else "Open repair evidence request",
            "command": f"open {shell_quote(operator_target)}" if operator_target else "",
            "safety": "Open local evidence only." if evidence_target else "Open local operator request only; this is not repair evidence or a decision.",
        },
        {
            "label": "Inspect repair ledger/status",
            "command": "./script/agentctl.sh studio360-repair-status",
            "safety": "Local status read only.",
        },
        {
            "label": "Mark needs redownload after human confirmation",
            "command": f"./script/agentctl.sh studio360-repair-decision {group_key} needs-redownload '<reviewer>' '<source damaged; re-copy or re-download needed>'",
            "safety": "Metadata-only decision; no media is deleted or changed.",
        },
        {
            "label": "Park if not needed after human confirmation",
            "command": f"./script/agentctl.sh studio360-repair-decision {group_key} park '<reviewer>' '<not needed for current edit; source preserved>'",
            "safety": "Metadata-only decision; reversible and source-preserving.",
        },
    ]
    safe_local_commands = [command for command in commands if command.get("command")]
    first_safe_action = safe_local_commands[0] if safe_local_commands else {
        "label": "Inspect repair ledger/status",
        "command": "./script/agentctl.sh studio360-repair-status",
        "safety": "Local status read only.",
    }
    return {
        "groupKey": group_key,
        "groupId": group.get("id") or "",
        "reframeStatus": group.get("reframeStatus") or "",
        "workflowStatus": group.get("workflowStatus") or "",
        "assetCount": group.get("assetCount") or 0,
        "damagedAssets": damaged_assets,
        "durationSeconds": group.get("durationSeconds") or 0,
        "repairEvidenceJson": evidence_json_text,
        "repairEvidenceMarkdown": evidence_markdown_text,
        "repairEvidencePresent": bool(evidence_target),
        "repairRequestJson": request_json_text,
        "repairRequestMarkdown": request_markdown_text,
        "repairRequestPresent": bool(request_target),
        "operatorPacketJson": evidence_json_text or request_json_text,
        "operatorPacketMarkdown": evidence_markdown_text or request_markdown_text,
        "operatorPacketKind": "repair-evidence" if evidence_target else "repair-evidence-request" if request_target else "",
        "repairEvidenceStatus": evidence.get("status") or evidence.get("conclusion") or "",
        "candidateCount": len(candidate_rows(evidence)),
        "candidates": candidate_rows(evidence),
        "classification": classification,
        "nextSafestAction": classification.get("nextSafestAction") or "Inspect this repair ticket before retrying proxy or reframe work.",
        "firstSafeAction": first_safe_action,
        "safeLocalCommands": safe_local_commands,
        "truth": "Repair/preflight ticket only. It does not modify source media or record a repair decision.",
    }


def action_priority(status: str) -> int:
    if status == "needs-repair-evidence":
        return 10
    if status == "needs-redownload-or-source-recopy":
        return 20
    if status == "needs-media-repair-review":
        return 30
    return 40


def action_label(status: str) -> str:
    if status == "needs-repair-evidence":
        return "Create focused evidence before deciding"
    if status == "needs-redownload-or-source-recopy":
        return "Re-copy/re-download source or park after confirmation"
    if status == "needs-media-repair-review":
        return "Review mixed evidence and choose a metadata-only route"
    return "Review repair evidence"


def human_action(status: str) -> str:
    if status == "needs-repair-evidence":
        return "Open the damaged source locations and confirm whether a source re-copy, camera/card download, or companion proxy exists before recording any decision."
    if status == "needs-redownload-or-source-recopy":
        return "If the clip matters, re-copy/re-download the source from the camera/card/cloud. If it does not matter, park it with a note."
    if status == "needs-media-repair-review":
        return "Open the evidence packet and decide whether this group needs source repair, a companion/proxy route, or parking."
    return "Inspect the local evidence and choose the smallest reversible next step."


def codex_safe_action(status: str) -> str:
    if status == "needs-repair-evidence":
        return "Prepare clearer evidence prompts and reveal commands only; do not infer a repair decision."
    if status == "needs-redownload-or-source-recopy":
        return "Keep the redownload/recopy task visible and continue other ready 360 groups; do not mark parked without human confirmation."
    return "Summarize evidence and prepare decision commands; do not mutate media or record decisions without explicit human confirmation."


def ticket_action_queue(tickets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for ticket in tickets:
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        status = str(classification.get("status") or ticket.get("reframeStatus") or "repair-review")
        evidence_path = str(ticket.get("repairEvidenceMarkdown") or ticket.get("repairEvidenceJson") or "")
        request_path = str(ticket.get("repairRequestMarkdown") or ticket.get("repairRequestJson") or "")
        operator_path = str(ticket.get("operatorPacketMarkdown") or ticket.get("operatorPacketJson") or evidence_path or request_path or "")
        open_evidence_command = f"open {shell_quote(evidence_path)}" if evidence_path else ""
        open_operator_packet_command = f"open {shell_quote(operator_path)}" if operator_path else ""
        reveal_commands = [
            str(asset.get("revealCommand") or "")
            for asset in ticket.get("damagedAssets") or []
            if isinstance(asset, dict) and asset.get("revealCommand")
        ]
        decision_commands = [
            command
            for command in ticket.get("safeLocalCommands") or []
            if isinstance(command, dict) and "studio360-repair-decision" in str(command.get("command") or "")
        ]
        rows.append({
            "priority": action_priority(status),
            "groupKey": ticket.get("groupKey") or "",
            "status": status,
            "label": action_label(status),
            "humanAction": human_action(status),
            "codexSafeAction": codex_safe_action(status),
            "repairEvidencePresent": bool(ticket.get("repairEvidencePresent")),
            "repairEvidencePath": evidence_path,
            "repairRequestPresent": bool(ticket.get("repairRequestPresent")),
            "repairRequestPath": request_path,
            "operatorPacketKind": ticket.get("operatorPacketKind") or "",
            "operatorPacketPath": operator_path,
            "openEvidenceCommand": open_evidence_command,
            "openOperatorPacketCommand": open_operator_packet_command,
            "revealCommands": reveal_commands,
            "damagedSourceCount": len(ticket.get("damagedAssets") or []),
            "candidateCount": int(ticket.get("candidateCount") or 0),
            "decisionCommandTemplates": decision_commands,
            "nextSafestAction": ticket.get("nextSafestAction") or classification.get("nextSafestAction") or human_action(status),
            "truth": "Action queue row only. It does not repair media or record a decision.",
        })
    return sorted(rows, key=lambda row: (int(row.get("priority") or 99), str(row.get("groupKey") or "")))


def build_packet(root: Path, limit: int) -> dict[str, Any]:
    pointer, packet, packet_path = load_latest_reframe_packet(root)
    source_counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    groups = [group for group in (packet.get("groups") or []) if isinstance(group, dict)]
    blocked = [group for group in groups if group.get("reframeStatus") == "blocked-media-repair"]
    tickets = [group_ticket(root, group) for group in blocked[: max(1, limit)]]
    repair_action_queue = ticket_action_queue(tickets)
    ready_groups = int(source_counts.get("reframeReady") or source_counts.get("readyRecipeGroups") or 0)
    ready_recipes = int(source_counts.get("readyRecipes") or source_counts.get("exportRecipeRows") or 0)
    if not ready_groups:
        ready_groups = sum(1 for group in groups if group.get("reframeStatus") != "blocked-media-repair")
    operator_recopy_checklist = [
        {
            "groupKey": row.get("groupKey") or "",
            "status": row.get("status") or "",
            "operatorPacketPath": row.get("operatorPacketPath") or "",
            "openOperatorPacketCommand": row.get("openOperatorPacketCommand") or "",
            "humanAction": row.get("humanAction") or "",
            "revealCommands": row.get("revealCommands") or [],
            "damagedSourceCount": row.get("damagedSourceCount") or 0,
            "nextSafestAction": row.get("nextSafestAction") or "",
            "truth": "Operator checklist row only. It asks for source evidence or recopy; it does not repair, park, delete, or mutate media.",
        }
        for row in repair_action_queue
    ]
    first_queue_row = repair_action_queue[0] if repair_action_queue else {}
    first_ticket = tickets[0] if tickets else {}
    first_ticket_safe_action = first_ticket.get("firstSafeAction") if isinstance(first_ticket.get("firstSafeAction"), dict) else {
        "label": "Inspect repair ledger/status",
        "command": "./script/agentctl.sh studio360-repair-status",
        "safety": "Local status read only.",
    }
    first_ticket_commands = first_ticket.get("safeLocalCommands") if isinstance(first_ticket.get("safeLocalCommands"), list) else []
    first_repair_decision_action = next(
        (
            command
            for command in first_ticket_commands
            if isinstance(command, dict)
            and "studio360-repair-decision" in str(command.get("command") or "")
        ),
        {},
    )
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "sourceReframePointer": str(root / "latest-360-reframe-packet.json"),
        "sourceReframeJson": str(packet_path),
        "sourceReframeHtml": pointer.get("htmlPath") or packet.get("htmlPath") or "",
        "truth": "Repair preflight only. It does not repair in place, delete, overwrite, upload, publish, park, approve, or capture receipts.",
        "counts": {
            "tickets": len(tickets),
            "blockedMediaRepair": len(blocked),
            "needsRedownloadOrSourceRecopy": sum(1 for ticket in tickets if ticket.get("classification", {}).get("status") == "needs-redownload-or-source-recopy"),
            "needsRepairEvidence": sum(1 for ticket in tickets if ticket.get("classification", {}).get("status") == "needs-repair-evidence"),
            "repairEvidencePresent": sum(1 for ticket in tickets if ticket.get("repairEvidencePresent")),
            "humanDecisionRequired": len(tickets),
            "candidateFiles": sum(int(ticket.get("candidateCount") or 0) for ticket in tickets),
            "repairRequestsPresent": sum(1 for ticket in tickets if ticket.get("repairRequestPresent")),
            "originalsMutated": False,
            "decisionsWritten": False,
            "exportsCreated": False,
            "externalPublishing": False,
        },
        "laneBoundary": {
            "blockedRepairGroups": len(blocked),
            "readyGroupsCanContinue": ready_groups,
            "readyRenderRecipesCanContinue": ready_recipes,
            "humanMessage": (
                "These repair tickets should stay visible, but they do not need to freeze ready 360 proof/reframe/export-prep work."
                if blocked
                else "No repair-blocked groups are currently blocking the 360 lane."
            ),
            "codexSafeParallelWork": "Continue proof review, renderer preflight, reframe recipe cleanup, and export candidate packet prep for ready groups while repair tickets wait for human source evidence.",
            "doNotDo": "Do not mark damaged groups parked, repaired, redownloaded, or usable without explicit human/source evidence.",
            "truth": "Lane boundary only. It changes workflow visibility, not media or decision state.",
        },
        "operatorRecopyChecklist": operator_recopy_checklist,
        "startHereToday": {
            "label": first_queue_row.get("label") or "No 360 repair blockers found",
            "groupKey": first_queue_row.get("groupKey") or "",
            "humanAction": first_queue_row.get("humanAction") or "Review ready proof/export candidates instead.",
            "codexSafeAction": first_queue_row.get("codexSafeAction") or "Keep 360 evidence synchronized and avoid fake render/publish claims.",
            "openEvidenceCommand": first_queue_row.get("openEvidenceCommand") or "",
            "openOperatorPacketCommand": first_queue_row.get("openOperatorPacketCommand") or "",
            "revealCommands": first_queue_row.get("revealCommands") or [],
            "nextSafestAction": first_queue_row.get("nextSafestAction") or "Open current 360 proof/reframe evidence.",
            "truth": "This is a routing hint, not a repair decision.",
        },
        "repairActionQueue": repair_action_queue,
        "tickets": tickets,
        "nextSafestAction": "Open the repair evidence or operator packet for the first damaged group, but keep ready 360 proof/reframe work moving in parallel.",
        "firstTicketSafeAction": first_ticket_safe_action,
        "firstRepairDecisionAction": first_repair_decision_action,
    }


def prepare_output_dir(root: Path) -> Path:
    out_dir = root / "repair-preflight" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["priority", "groupKey", "classificationStatus", "label", "humanAction", "codexSafeAction", "candidateCount", "damagedAssetCount", "repairEvidencePresent", "repairEvidenceMarkdown", "repairRequestPresent", "repairRequestMarkdown", "operatorPacketKind", "operatorPacketPath", "damagedSourcePaths", "openEvidenceCommand", "openOperatorPacketCommand", "nextSafestAction"]
    queue_by_group = {
        str(row.get("groupKey") or ""): row
        for row in packet.get("repairActionQueue") or []
        if isinstance(row, dict)
    }
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for ticket in packet.get("tickets") or []:
            classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
            queue_row = queue_by_group.get(str(ticket.get("groupKey") or ""), {})
            writer.writerow({
                "priority": queue_row.get("priority", ""),
                "groupKey": ticket.get("groupKey", ""),
                "classificationStatus": classification.get("status", ""),
                "label": queue_row.get("label", ""),
                "humanAction": queue_row.get("humanAction", ""),
                "codexSafeAction": queue_row.get("codexSafeAction", ""),
                "candidateCount": ticket.get("candidateCount", ""),
                "damagedAssetCount": len(ticket.get("damagedAssets") or []),
                "repairEvidencePresent": ticket.get("repairEvidencePresent", False),
                "repairEvidenceMarkdown": ticket.get("repairEvidenceMarkdown", ""),
                "repairRequestPresent": ticket.get("repairRequestPresent", False),
                "repairRequestMarkdown": ticket.get("repairRequestMarkdown", ""),
                "operatorPacketKind": ticket.get("operatorPacketKind", ""),
                "operatorPacketPath": ticket.get("operatorPacketMarkdown") or ticket.get("operatorPacketJson") or "",
                "damagedSourcePaths": "\n".join(str(asset.get("sourcePath") or "") for asset in ticket.get("damagedAssets") or []),
                "openEvidenceCommand": queue_row.get("openEvidenceCommand", ""),
                "openOperatorPacketCommand": queue_row.get("openOperatorPacketCommand", ""),
                "nextSafestAction": classification.get("nextSafestAction", ""),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Studio360 repair preflight",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Source reframe packet: `{packet['sourceReframeJson']}`",
        "",
        "## Start here today",
        "",
        f"- Group: `{packet.get('startHereToday', {}).get('groupKey') or 'none'}`",
        f"- Task: {packet.get('startHereToday', {}).get('label')}",
        f"- Human action: {packet.get('startHereToday', {}).get('humanAction')}",
        f"- Codex-safe action: {packet.get('startHereToday', {}).get('codexSafeAction')}",
        f"- Open evidence: `{packet.get('startHereToday', {}).get('openEvidenceCommand') or 'none'}`",
        f"- Open operator packet: `{packet.get('startHereToday', {}).get('openOperatorPacketCommand') or 'none'}`",
        "",
        "### Reveal commands when evidence is missing",
        "",
        *[f"- `{command}`" for command in packet.get("startHereToday", {}).get("revealCommands") or []],
        "",
        "## Lane boundary",
        "",
        f"- Blocked repair groups: `{packet.get('laneBoundary', {}).get('blockedRepairGroups')}`",
        f"- Ready groups that can continue: `{packet.get('laneBoundary', {}).get('readyGroupsCanContinue')}`",
        f"- Ready render recipes that can continue: `{packet.get('laneBoundary', {}).get('readyRenderRecipesCanContinue')}`",
        f"- Human message: {packet.get('laneBoundary', {}).get('humanMessage')}",
        f"- Codex-safe parallel work: {packet.get('laneBoundary', {}).get('codexSafeParallelWork')}",
        f"- Do not do: {packet.get('laneBoundary', {}).get('doNotDo')}",
        "",
        "## Operator recopy checklist",
        "",
    ]
    for row in packet.get("operatorRecopyChecklist") or []:
        lines.extend([
            f"### {row.get('groupKey')} - {row.get('status')}",
            "",
            f"- Human action: {row.get('humanAction')}",
            f"- Open operator packet: `{row.get('openOperatorPacketCommand') or 'none'}`",
            f"- Damaged sources: `{row.get('damagedSourceCount')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "- Reveal commands:",
            *[f"  - `{command}`" for command in row.get("revealCommands") or []],
            "",
        ])
    lines.extend([
        "## Repair action queue",
        "",
    ])
    for row in packet.get("repairActionQueue") or []:
        lines.extend([
            f"### P{row.get('priority')} - {row.get('groupKey')} - {row.get('label')}",
            "",
            f"- Status: `{row.get('status')}`",
            f"- Human: {row.get('humanAction')}",
            f"- Codex: {row.get('codexSafeAction')}",
            f"- Evidence present: `{row.get('repairEvidencePresent')}`",
            f"- Open evidence: `{row.get('openEvidenceCommand') or 'none'}`",
            f"- Repair request present: `{row.get('repairRequestPresent')}`",
            f"- Open operator packet: `{row.get('openOperatorPacketCommand') or 'none'}`",
            f"- Damaged sources: `{row.get('damagedSourceCount')}`",
            f"- Candidates: `{row.get('candidateCount')}`",
            "",
        ])
    for ticket in packet.get("tickets") or []:
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        lines.extend([
            f"## {ticket.get('groupKey')}",
            "",
            f"- Status: `{classification.get('status')}`",
            f"- Reason: {classification.get('reason')}",
            f"- Next: {classification.get('nextSafestAction')}",
            f"- Evidence present: `{ticket.get('repairEvidencePresent')}`",
            f"- Evidence: `{ticket.get('repairEvidenceMarkdown') or ticket.get('repairEvidenceJson') or 'none yet'}`",
            f"- Repair request present: `{ticket.get('repairRequestPresent')}`",
            f"- Repair request: `{ticket.get('repairRequestMarkdown') or ticket.get('repairRequestJson') or 'none'}`",
            f"- Operator packet kind: `{ticket.get('operatorPacketKind') or 'none'}`",
            "",
            "### Damaged source paths",
            "",
        ])
        for asset in ticket.get("damagedAssets") or []:
            lines.append(f"- `{asset.get('sourcePath')}` - `{asset.get('kind')}` - {asset.get('error')}")
        lines.extend([
            "",
            "### Candidates",
            "",
        ])
        for candidate in ticket.get("candidates") or []:
            lines.append(f"- `{candidate.get('path')}` - `{candidate.get('ffprobeStatus')}` - {candidate.get('ffprobeError')}")
        lines.extend(["", "### Safe local commands", ""])
        for command in ticket.get("safeLocalCommands") or []:
            lines.append(f"- `{command.get('command')}` - {command.get('safety')}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    start = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    lane_boundary = packet.get("laneBoundary") if isinstance(packet.get("laneBoundary"), dict) else {}
    recopy_cards = []
    for row in packet.get("operatorRecopyChecklist") or []:
        if not isinstance(row, dict):
            continue
        reveal_html = "".join(f"<code>{esc(command)}</code>" for command in row.get("revealCommands") or []) or "<span>No reveal commands available.</span>"
        recopy_cards.append(f"""
        <article class="queue-card">
          <div class="ticket-head">
            <div><div class="eyebrow">operator recopy checklist</div><h2>{esc(row.get('groupKey'))}</h2></div>
            <span>{esc(row.get('status'))}</span>
          </div>
          <p><strong>Human:</strong> {esc(row.get('humanAction'))}</p>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="command"><strong>Open operator packet</strong><code>{esc(row.get('openOperatorPacketCommand') or 'No operator packet available.')}</code></div>
          <section><h3>Reveal damaged sources</h3><div class="reveals">{reveal_html}</div></section>
          <p>{esc(row.get('truth'))}</p>
        </article>
        """)
    queue_cards = []
    for row in packet.get("repairActionQueue") or []:
        if not isinstance(row, dict):
            continue
        reveal_html = "".join(f"<code>{esc(command)}</code>" for command in row.get("revealCommands") or []) or "<span>No reveal commands available.</span>"
        queue_cards.append(f"""
        <article class="queue-card p{esc(row.get('priority'))}">
          <div class="ticket-head">
            <div><div class="eyebrow">priority {esc(row.get('priority'))}</div><h2>{esc(row.get('groupKey'))}</h2></div>
            <span>{esc(row.get('status'))}</span>
          </div>
          <h3>{esc(row.get('label'))}</h3>
          <p><strong>Human:</strong> {esc(row.get('humanAction'))}</p>
          <p><strong>Codex:</strong> {esc(row.get('codexSafeAction'))}</p>
          <div class="next">{esc(row.get('nextSafestAction'))}</div>
          <div class="command"><strong>Open operator packet</strong><code>{esc(row.get('openOperatorPacketCommand') or 'No operator packet available; inspect damaged source paths first.')}</code><p>{esc(row.get('operatorPacketKind') or 'repair routing')}</p></div>
          <div class="command"><strong>Open repair evidence</strong><code>{esc(row.get('openEvidenceCommand') or 'No repair evidence exists yet; this is still a human/operator evidence request.')}</code></div>
          <section><h3>Reveal damaged sources</h3><div class="reveals">{reveal_html}</div></section>
        </article>
        """)
    cards: list[str] = []
    for ticket in packet.get("tickets") or []:
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        damaged_html = "".join(
            f"<li><code>{esc(asset.get('sourcePath'))}</code><span>{esc(asset.get('kind'))}</span><p>{esc(asset.get('error'))}</p></li>"
            for asset in ticket.get("damagedAssets") or []
        ) or "<li>No damaged source rows carried.</li>"
        candidate_html = "".join(
            f"<li><code>{esc(candidate.get('path'))}</code><span>{esc(candidate.get('ffprobeStatus'))}</span><p>{esc(candidate.get('ffprobeError'))}</p></li>"
            for candidate in ticket.get("candidates") or []
        ) or "<li>No candidate rows found.</li>"
        command_html = "".join(
            f"<div class=\"command\"><strong>{esc(command.get('label'))}</strong><code>{esc(command.get('command'))}</code><p>{esc(command.get('safety'))}</p></div>"
            for command in ticket.get("safeLocalCommands") or []
        )
        cards.append(f"""
        <article class="ticket">
          <div class="ticket-head">
            <div><div class="eyebrow">360 repair group</div><h2>{esc(ticket.get('groupKey'))}</h2></div>
            <span>{esc(classification.get('status'))}</span>
          </div>
          <p>{esc(classification.get('reason'))}</p>
          <div class="next">{esc(classification.get('nextSafestAction'))}</div>
          <section><h3>Damaged source paths</h3><ul>{damaged_html}</ul></section>
          <section><h3>Candidate evidence</h3><ul>{candidate_html}</ul></section>
          <section><h3>Safe local commands</h3>{command_html}</section>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Repair Preflight</title>
  <style>
    :root {{ color-scheme:dark; --bg:#11170f; --panel:#1b2518; --ink:#fff0d2; --muted:#d5c4a3; --gold:#ecc75d; --moss:#93c174; --water:#84ceda; --clay:#c77555; --line:rgba(255,240,210,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at 15% -10%, rgba(132,206,218,.18), transparent 32%), linear-gradient(180deg,#172315,#0b1009); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,84px); line-height:.92; }}
    h2 {{ margin:6px 0 0; font-size:32px; }}
    h3 {{ color:var(--moss); text-transform:uppercase; letter-spacing:.14em; font-size:13px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }}
    .summary span, .ticket-head span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:18px; }}
    .ticket {{ border:1px solid rgba(199,117,85,.55); border-radius:28px; padding:20px; background:linear-gradient(180deg,rgba(27,37,24,.98),rgba(10,14,8,.98)); box-shadow:0 24px 68px rgba(0,0,0,.3); }}
    .start {{ border:1px solid rgba(236,199,93,.5); border-radius:28px; padding:20px; margin-top:20px; background:linear-gradient(135deg,rgba(236,199,93,.16),rgba(147,193,116,.1)); }}
    .queue {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; }}
    .queue-card {{ border:1px solid rgba(236,199,93,.34); border-radius:24px; padding:18px; background:rgba(12,18,10,.82); }}
    .queue-card.p10 {{ border-color:rgba(236,199,93,.65); }}
    .queue-card.p20 {{ border-color:rgba(199,117,85,.72); }}
    .ticket-head {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }}
    .next {{ border:1px solid rgba(236,199,93,.4); border-radius:18px; padding:12px; color:var(--gold); background:rgba(236,199,93,.08); font-weight:900; }}
    li {{ margin:12px 0; color:var(--muted); }}
    li span {{ color:var(--clay); margin-left:8px; font-weight:900; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    .command {{ border:1px solid var(--line); border-radius:15px; padding:11px; background:rgba(0,0,0,.24); margin:9px 0; }}
    .reveals {{ display:grid; gap:8px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio360 repair preflight</div>
    <h1>Damaged media gets a repair path, not a mystery fog.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary">
      <span>{packet['counts']['tickets']} repair tickets</span>
      <span>{packet['counts']['needsRepairEvidence']} need evidence</span>
      <span>{packet['counts']['repairEvidencePresent']} have evidence</span>
      <span>{packet['counts']['candidateFiles']} candidate files</span>
      <span>{packet['counts']['needsRedownloadOrSourceRecopy']} need redownload/source recopy</span>
      <span>{esc(lane_boundary.get('readyGroupsCanContinue'))} ready groups can continue</span>
      <span>0 originals mutated</span>
    </div>
    <section class="start">
      <div class="eyebrow">Start here today</div>
      <h2>{esc(start.get('label') or 'No repair blockers found')}</h2>
      <p><strong>Group:</strong> {esc(start.get('groupKey') or 'none')}</p>
      <p><strong>Human:</strong> {esc(start.get('humanAction'))}</p>
      <p><strong>Codex:</strong> {esc(start.get('codexSafeAction'))}</p>
      <pre>{esc(start.get('openOperatorPacketCommand') or start.get('openEvidenceCommand') or 'No operator packet yet; inspect damaged source paths first.')}</pre>
      <div class="reveals">{''.join(f'<code>{esc(command)}</code>' for command in (start.get('revealCommands') or [])) or '<span>No reveal commands available.</span>'}</div>
    </section>
    <section class="start">
      <div class="eyebrow">Lane boundary</div>
      <h2>{esc(lane_boundary.get('readyGroupsCanContinue'))} ready groups can keep moving.</h2>
      <p>{esc(lane_boundary.get('humanMessage'))}</p>
      <p><strong>Codex-safe parallel work:</strong> {esc(lane_boundary.get('codexSafeParallelWork'))}</p>
      <p><strong>Do not do:</strong> {esc(lane_boundary.get('doNotDo'))}</p>
    </section>
  </header>
  <main>
    <section>
      <h2>Operator recopy checklist</h2>
      <div class="queue">{''.join(recopy_cards) or '<article class="queue-card"><h2>No operator recopy tasks</h2><p>Review ready proof/export candidates instead.</p></article>'}</div>
    </section>
    <section>
      <h2>Repair action queue</h2>
      <div class="queue">{''.join(queue_cards) or '<article class="queue-card"><h2>No repair blockers</h2><p>Review proof/export candidates instead.</p></article>'}</div>
    </section>
    <section>
      <h2>Ticket detail</h2>
      {''.join(cards)}
    </section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    first_ticket_action = packet.get("firstTicketSafeAction") if isinstance(packet.get("firstTicketSafeAction"), dict) else {}
    first_repair_decision = packet.get("firstRepairDecisionAction") if isinstance(packet.get("firstRepairDecisionAction"), dict) else {}
    pointer = {
        "schema": "quipsly.studio360.latest-repair-preflight.v1",
        "updatedAt": iso_now(),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "status": "repair-preflight-ready",
        "counts": packet.get("counts") or {},
        "humanAsk": "Review repair preflight rows and operator request packets before deciding whether a damaged/missing 360 source needs redownload, replacement, parking, or companion fallback.",
        "agentSafeParallelWork": "Codex may improve repair request packets, reveal commands, evidence summaries, and dry-run decision templates. Do not repair, delete, overwrite, publish, upload, mutate originals, or write repair decisions without explicit approval.",
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "startHereToday": packet.get("startHereToday") or {},
        "laneBoundary": packet.get("laneBoundary") or {},
        "operatorRecopyChecklist": packet.get("operatorRecopyChecklist") or [],
        "repairActionQueue": packet.get("repairActionQueue") or [],
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "firstTicketSafeAction": first_ticket_action,
        "statusCommand": "./script/agentctl.sh studio360-repair-status",
        "firstRepairDecisionAction": first_repair_decision,
        "firstRepairDecisionCommand": first_repair_decision.get("command", ""),
        "repairDecisionSafety": first_repair_decision.get("safety", ""),
    }
    write_json(root / "latest-360-repair-preflight.json", pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Studio360 repair preflight packet.")
    parser.add_argument("limit", nargs="?", type=int, default=8)
    parser.add_argument("--studio360-root", default=str(DEFAULT_STUDIO360_ROOT))
    args = parser.parse_args()

    root = Path(args.studio360_root)
    packet = build_packet(root, args.limit)
    out_dir = prepare_output_dir(root)
    json_path = out_dir / "360-repair-preflight.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-repair-preflight.md"
    csv_path = out_dir / "360-repair-preflight.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Studio360 repair preflight",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local repair/preflight evidence only. No source repair, delete, overwrite, upload, publish, park decision, or export occurs.",
        },
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
