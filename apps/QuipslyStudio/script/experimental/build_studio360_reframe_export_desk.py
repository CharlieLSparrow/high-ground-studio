#!/usr/bin/env python3
"""Build a Studio360 Reframe/Export Desk front door.

This is a local-only, read-only production runway over Studio360 source,
repair, proxy, and reframe recipe evidence. It does not render, transcode,
repair, park, export, upload, publish, delete, overwrite, or mutate source
media. The point is to make the 360 workflow reviewable before anyone takes a
costly or irreversible action.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.reframe-export-desk.v1"
LATEST_POINTER = "latest-360-reframe-export-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-reframe-export-desk")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def pointer(root: Path, filename: str) -> dict[str, Any]:
    return load_json(root / filename)


def packet_from_pointer(pointer_payload: dict[str, Any]) -> dict[str, Any]:
    path_value = pointer_payload.get("jsonPath") or pointer_payload.get("packetPath") or pointer_payload.get("manifestPath") or ""
    return load_json(Path(str(path_value))) if path_value else {}


def open_action(label: str, path_value: Any, safety: str) -> dict[str, str]:
    value = str(path_value or "")
    return {
        "label": label,
        "command": command(["open", value]) if value else "",
        "path": value,
        "safety": safety,
    }


def reframe_truth_contract() -> list[str]:
    return [
        "360 originals stay whole and untouched.",
        "Reframe recipes are metadata instructions for 16:9 and 9:16 output, not rendered proof by themselves.",
        "Proof renders are review evidence only; full exports require an explicit later action.",
        "Repair blockers come before export work because bad or missing media should not be hidden by a pretty packet.",
        "Publication truth requires external platform receipts. This desk only prepares local evidence.",
    ]


def human_ask_for_priority(priority: str) -> str:
    if priority == "repair-first":
        return "Check whether this source group should be recopied/redownloaded, parked, or left for later before any export attempt."
    if priority == "proxy-first":
        return "Confirm the source belongs in this episode/workflow and should receive a managed proxy."
    if priority == "ready-to-review":
        return "Review the 16:9 and 9:16 recipe intent, framing, and available proof evidence before authorizing a real export."
    if priority == "parked":
        return "No action needed unless a human wants to reopen this parked source group."
    return "Classify this source group as ready, repair-first, proxy-first, parked, or not part of this production."


def agent_work_for_priority(priority: str) -> str:
    if priority == "repair-first":
        return "Open repair evidence, summarize missing/damaged files, and prepare exact recopy/redownload tasks without changing media."
    if priority == "proxy-first":
        return "Prepare proxy-needed commands and diagnostics; do not transcode unless explicitly asked."
    if priority == "ready-to-review":
        return "Compare recipe metadata, proof receipts, and review-source paths; flag framing/export risks without rendering."
    if priority == "parked":
        return "Leave parked sidecar decisions intact and keep the group visible as recoverable evidence."
    return "Inspect source/reframe routing and make the next reversible classification more precise."


def readiness_label(priority: str) -> str:
    return {
        "repair-first": "repair-before-export",
        "proxy-first": "proxy-before-review",
        "ready-to-review": "recipe-review-ready",
        "parked": "parked-recoverable",
        "review": "classification-needed",
    }.get(priority, "classification-needed")


def group_index(groups: list[Any]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for item in groups:
        if not isinstance(item, dict):
            continue
        key = str(item.get("groupKey") or item.get("id") or "")
        if key:
            indexed[key] = item
    return indexed


def build_group_rows(source_packet: dict[str, Any], reframe_packet: dict[str, Any], repair_packet: dict[str, Any]) -> list[dict[str, Any]]:
    source_rows = group_index(source_packet.get("groupRows") if isinstance(source_packet.get("groupRows"), list) else [])
    repair_rows = group_index(repair_packet.get("tickets") if isinstance(repair_packet.get("tickets"), list) else [])
    rows: list[dict[str, Any]] = []
    for group in reframe_packet.get("groups") or []:
        if not isinstance(group, dict):
            continue
        key = str(group.get("groupKey") or group.get("id") or "")
        source_row = source_rows.get(key, {})
        repair_row = repair_rows.get(key, {})
        recipes = [recipe for recipe in (group.get("recipes") or []) if isinstance(recipe, dict)]
        ready_recipes = [recipe for recipe in recipes if recipe.get("status") == "ready-for-reframe-review"]
        export_recipes = [recipe for recipe in recipes if not recipe.get("exportCreated")]
        review_source = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
        status = str(group.get("reframeStatus") or source_row.get("status") or "needs-review")
        damaged_count = len(group.get("damagedAssets") or []) if isinstance(group.get("damagedAssets"), list) else safe_int(source_row.get("damagedAssetCount"))
        if status == "reframe-ready" and ready_recipes:
            priority = "ready-to-review"
            action = "Review 16:9 and 9:16 recipes"
            next_safest = "Open the reframe packet, inspect the review proxy/companion, then tune framing/keyframes before any real export."
        elif status == "blocked-media-repair":
            priority = "repair-first"
            action = "Resolve repair evidence"
            next_safest = repair_row.get("nextSafestAction") or "Open repair preflight and recopy/redownload or park only after human confirmation."
        elif status == "blocked-needs-proxy":
            priority = "proxy-first"
            action = "Create or attach managed proxy"
            next_safest = "Generate or attach a managed proxy before reframing/export recipe review."
        elif "parked" in status:
            priority = "parked"
            action = "Keep parked unless reopened"
            next_safest = group.get("nextSafestAction") or "Leave parked sidecar status intact unless a human reopens this source group."
        else:
            priority = "review"
            action = "Review source routing"
            next_safest = group.get("nextSafestAction") or source_row.get("nextSafestAction") or "Inspect source routing before any proxy/reframe/export work."
        rows.append({
            "groupKey": key,
            "groupId": group.get("id") or source_row.get("groupId") or "",
            "priority": priority,
            "readiness": readiness_label(priority),
            "status": status,
            "workflowStatus": group.get("workflowStatus") or source_row.get("workflowStatus") or "",
            "action": action,
            "nextSafestAction": next_safest,
            "humanAsk": human_ask_for_priority(priority),
            "agentSafeParallelWork": agent_work_for_priority(priority),
            "assetCount": safe_int(group.get("assetCount") or source_row.get("assetCount")),
            "durationSeconds": safe_float(group.get("durationSeconds") or source_row.get("durationSeconds")),
            "recipeCount": len(recipes),
            "readyRecipeCount": len(ready_recipes),
            "exportRecipeCount": len(export_recipes),
            "damagedAssetCount": damaged_count,
            "reviewSourceKind": review_source.get("kind") or source_row.get("reviewSourceKind") or "",
            "reviewSourcePath": review_source.get("path") or source_row.get("reviewSourcePath") or "",
            "recipeIds": [recipe.get("id") for recipe in recipes if recipe.get("id")],
            "repairEvidencePresent": bool(repair_row.get("repairEvidencePresent") or source_row.get("repairEvidencePresent")),
            "safeLocalCommands": repair_row.get("safeLocalCommands") if isinstance(repair_row.get("safeLocalCommands"), list) else [],
            "truth": "Read-only group row. It references source/reframe/repair evidence only; no render, repair, export, upload, delete, overwrite, or source mutation occurred.",
        })
    order = {"repair-first": 0, "proxy-first": 1, "review": 2, "ready-to-review": 3, "parked": 4}
    return sorted(rows, key=lambda row: (order.get(str(row.get("priority")), 9), str(row.get("groupKey"))))


def action_rows(parts: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    source = parts.get("source") or {}
    reframe = parts.get("reframe") or {}
    repair = parts.get("repair") or {}
    repair_status = parts.get("repairStatus") or {}
    workflow = parts.get("workflow") or {}
    proxy = parts.get("proxy") or {}
    proxy_failure = parts.get("proxyFailure") or {}
    proof = parts.get("proof") or {}
    proof_ledger = parts.get("proofLedger") or {}
    rows: list[dict[str, Any]] = []
    if source:
        counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
        rows.append({
            "rank": 1,
            "id": "source-desk",
            "title": "Open source desk",
            "status": source.get("status") or "source-desk-ready",
            "why": f"{counts.get('assets', 0)} assets, {counts.get('groups', 0)} groups, {counts.get('reframeReady', 0)} reframe-ready groups, and {counts.get('blockedMediaRepair', 0)} repair blocks are already summarized.",
            "nextSafestAction": source.get("nextSafestAction") or "Open source desk before proxy/reframe/export work.",
            "humanAsk": "Use this as the map of what Studio360 knows exists before deciding which groups deserve proxy, repair, reframe, or parking work.",
            "agentSafeParallelWork": "Summarize source groups, missing repair blockers, and ready candidates without touching media.",
            "htmlPath": source.get("htmlPath") or "",
            "jsonPath": source.get("jsonPath") or "",
            "itemCount": safe_int(counts.get("groups")),
            "pending": safe_int(counts.get("blockedMediaRepair")) + safe_int(counts.get("blockedNeedsProxy")),
            "ready": safe_int(counts.get("reframeReady")),
            "safety": "Read-only source desk. No transcoding, repair, parking, export, upload, publication, delete, overwrite, or source mutation.",
        })
    if repair:
        counts = repair.get("counts") if isinstance(repair.get("counts"), dict) else {}
        rows.append({
            "rank": 2,
            "id": "repair-preflight",
            "title": "Resolve repair blockers first",
            "status": repair.get("status") or "repair-preflight-ready",
            "why": f"{counts.get('tickets', 0)} repair ticket(s), {counts.get('candidateFiles', 0)} candidate file(s), and {counts.get('needsRedownloadOrSourceRecopy', 0)} likely recopy/redownload item(s) are visible before any proxy retry.",
            "nextSafestAction": repair.get("nextSafestAction") or "Inspect repair evidence before recopy/redownload or metadata-only parking decisions.",
            "humanAsk": "Decide whether each repair ticket should be recovered now, parked, or ignored as not part of the current production.",
            "agentSafeParallelWork": "Prepare exact missing-file and candidate-source summaries for the human; no recopy, delete, or overwrite.",
            "htmlPath": repair.get("htmlPath") or "",
            "jsonPath": repair.get("jsonPath") or "",
            "itemCount": safe_int(counts.get("tickets")),
            "pending": safe_int(counts.get("blockedMediaRepair")),
            "ready": 0,
            "safety": "Repair preflight only. No repair, delete, overwrite, upload, publish, park decision, or export occurs.",
        })
    if reframe:
        counts = reframe.get("counts") if isinstance(reframe.get("counts"), dict) else {}
        rows.append({
            "rank": 3,
            "id": "reframe-recipes",
            "title": "Review 16:9 and 9:16 recipes",
            "status": reframe.get("status") or "reframe-packet-ready",
            "why": f"{counts.get('recipes', 0)} metadata recipes across {counts.get('groups', 0)} groups are ready or blocked with explicit reasons. Exports created: {counts.get('exportsCreated', 0)}.",
            "nextSafestAction": reframe.get("nextSafestAction") or "Review recipes and tune framing/keyframes before explicit export.",
            "humanAsk": "Review whether these recipes describe the intended 16:9 and 9:16 outputs before authorizing proof or final renders.",
            "agentSafeParallelWork": "Compare ready recipes against repair/proxy evidence and flag groups that should not be exported yet.",
            "htmlPath": reframe.get("htmlPath") or "",
            "jsonPath": reframe.get("jsonPath") or "",
            "itemCount": safe_int(counts.get("recipes")),
            "pending": safe_int(counts.get("blockedMediaRepair")) + safe_int(counts.get("blockedNeedsProxy")),
            "ready": safe_int(counts.get("reframeReady")),
            "safety": "Recipe packet only. No render, upload, delete, overwrite, source mutation, or publication.",
        })
    if proof or proof_ledger:
        proof_counts = proof_ledger.get("counts") if isinstance(proof_ledger.get("counts"), dict) else {}
        latest = proof_ledger.get("latestEntry") if isinstance(proof_ledger.get("latestEntry"), dict) else {}
        latest_candidate = latest.get("candidate") if isinstance(latest.get("candidate"), dict) else {}
        rows.append({
            "rank": 4,
            "id": "proof-render-ledger",
            "title": "Review local proof renders",
            "status": proof_ledger.get("status") or proof.get("status") or "proof-render-evidence",
            "why": f"{proof_counts.get('entries', 0)} proof render receipt(s) exist. Latest: {latest_candidate.get('candidateId') or 'none yet'}.",
            "nextSafestAction": proof_ledger.get("nextSafestAction") or proof.get("nextSafestAction") or "Open the latest proof output and inspect framing/audio before any full render.",
            "humanAsk": "Watch proof renders as evidence, not as final deliverables, and decide what needs framing or sync notes.",
            "agentSafeParallelWork": "Index proof receipts, surface the newest proof paths, and note missing proof coverage without rendering more.",
            "htmlPath": proof.get("htmlPath") or latest.get("htmlPath") or "",
            "jsonPath": proof_ledger.get("jsonPath") or proof.get("jsonPath") or "",
            "itemCount": safe_int(proof_counts.get("entries")),
            "pending": 0,
            "ready": safe_int(proof_counts.get("entries")),
            "safety": "Proof-render evidence only. No full render, upload, delete, overwrite, publication, or source mutation is implied.",
        })
    if proxy:
        rows.append({
            "rank": 5,
            "id": "latest-proxy-prep",
            "title": "Inspect latest proxy prep receipt",
            "status": proxy.get("status") or "proxy-prep-recorded",
            "why": f"Latest proxy prep is for group {proxy.get('groupKey') or 'unknown'} and points at a managed proxy receipt.",
            "nextSafestAction": "Open the proxy-prep manifest before relying on a new proxy in reframe/export review.",
            "humanAsk": "Confirm this proxy prep receipt belongs to the source group before trusting it in review.",
            "agentSafeParallelWork": "Cross-check proxy-prep receipt paths against source/reframe groups without creating or replacing proxies.",
            "htmlPath": "",
            "jsonPath": proxy.get("manifestPath") or "",
            "itemCount": 1,
            "pending": 0,
            "ready": 1,
            "safety": "Pointer only. This desk does not create or replace proxies.",
        })
    if proxy_failure:
        rows.append({
            "rank": 6,
            "id": "latest-proxy-failure",
            "title": "Inspect latest proxy failure",
            "status": "proxy-prep-failure-recorded",
            "why": f"Latest failed proxy attempt is for group {proxy_failure.get('groupKey') or 'unknown'}: {proxy_failure.get('error') or 'no error text'}",
            "nextSafestAction": "Open the failure manifest and fix source/proxy prerequisites before retrying.",
            "humanAsk": "Decide whether this failed proxy attempt should be retried, parked, or routed to repair first.",
            "agentSafeParallelWork": "Summarize the failure reason and prerequisites so a retry can be deliberate later.",
            "htmlPath": "",
            "jsonPath": proxy_failure.get("manifestPath") or "",
            "itemCount": 1,
            "pending": 1,
            "ready": 0,
            "safety": "Failure pointer only. No retry is executed here.",
        })
    if workflow:
        counts = workflow.get("counts") if isinstance(workflow.get("counts"), dict) else {}
        rows.append({
            "rank": 7,
            "id": "workflow-packet",
            "title": "Open raw workflow packet",
            "status": workflow.get("status") or "workflow-packet-ready",
            "why": f"Workflow truth sees {counts.get('assets', 0)} assets and {counts.get('groups', 0)} source groups before reframe routing.",
            "nextSafestAction": workflow.get("nextSafestAction") or "Use workflow packet for raw source grouping evidence.",
            "humanAsk": "Use the raw workflow packet only to understand grouping; do not treat it as edit or export approval.",
            "agentSafeParallelWork": "Compare workflow grouping with source desk/reframe desk counts and flag mismatches.",
            "htmlPath": workflow.get("htmlPath") or "",
            "jsonPath": workflow.get("jsonPath") or workflow.get("packetPath") or "",
            "itemCount": safe_int(counts.get("groups")),
            "pending": safe_int((counts.get("countsByGroupStatus") or {}).get("needs-proxy")) if isinstance(counts.get("countsByGroupStatus"), dict) else 0,
            "ready": safe_int((counts.get("countsByGroupStatus") or {}).get("proxy-ready")) if isinstance(counts.get("countsByGroupStatus"), dict) else 0,
            "safety": "Workflow packet only. No source media is moved, transcoded, deleted, uploaded, published, or mutated.",
        })
    if repair_status:
        counts = repair_status.get("counts") if isinstance(repair_status.get("counts"), dict) else {}
        rows.append({
            "rank": 8,
            "id": "repair-status",
            "title": "Check sidecar repair decisions",
            "status": repair_status.get("status") or "repair-status-ready",
            "why": f"{counts.get('groupDecisionCount', 0)} group decision(s) and {counts.get('eventCount', 0)} event(s) are currently recorded.",
            "nextSafestAction": repair_status.get("nextSafestAction") or "Check status before adding any new metadata-only repair decision.",
            "humanAsk": "Verify existing sidecar repair decisions before adding a new parking or recovery note.",
            "agentSafeParallelWork": "Summarize existing sidecar decisions and make conflicting or stale repair notes visible.",
            "htmlPath": repair_status.get("htmlPath") or "",
            "jsonPath": repair_status.get("jsonPath") or "",
            "itemCount": safe_int(counts.get("groupDecisionCount")),
            "pending": 0,
            "ready": safe_int(counts.get("groupDecisionCount")),
            "safety": "Status only. No media, decisions, exports, uploads, or publication state changes.",
        })
    return sorted(rows, key=lambda row: safe_int(row.get("rank")))


def summarize_counts(parts: dict[str, dict[str, Any]], group_rows: list[dict[str, Any]]) -> dict[str, Any]:
    workflow_counts = parts.get("workflow", {}).get("counts") if isinstance(parts.get("workflow", {}).get("counts"), dict) else {}
    source_counts = parts.get("source", {}).get("counts") if isinstance(parts.get("source", {}).get("counts"), dict) else {}
    reframe_counts = parts.get("reframe", {}).get("counts") if isinstance(parts.get("reframe", {}).get("counts"), dict) else {}
    repair_counts = parts.get("repair", {}).get("counts") if isinstance(parts.get("repair", {}).get("counts"), dict) else {}
    repair_status_counts = parts.get("repairStatus", {}).get("counts") if isinstance(parts.get("repairStatus", {}).get("counts"), dict) else {}
    proof_ledger_counts = parts.get("proofLedger", {}).get("counts") if isinstance(parts.get("proofLedger", {}).get("counts"), dict) else {}
    return {
        "assets": safe_int(source_counts.get("assets") or workflow_counts.get("assets")),
        "groups": safe_int(source_counts.get("groups") or reframe_counts.get("groups") or workflow_counts.get("groups") or len(group_rows)),
        "recipeGroups": len(group_rows),
        "recipes": safe_int(reframe_counts.get("recipes") or sum(safe_int(row.get("recipeCount")) for row in group_rows)),
        "readyRecipeGroups": sum(1 for row in group_rows if row.get("priority") == "ready-to-review"),
        "readyRecipes": sum(safe_int(row.get("readyRecipeCount")) for row in group_rows),
        "exportRecipeRows": sum(safe_int(row.get("exportRecipeCount")) for row in group_rows),
        "reframeReady": safe_int(reframe_counts.get("reframeReady") or source_counts.get("reframeReady")),
        "blockedMediaRepair": safe_int(reframe_counts.get("blockedMediaRepair") or repair_counts.get("blockedMediaRepair") or source_counts.get("blockedMediaRepair")),
        "blockedNeedsProxy": safe_int(reframe_counts.get("blockedNeedsProxy") or source_counts.get("blockedNeedsProxy")),
        "parkedDamagedSources": safe_int(reframe_counts.get("parkedDamagedSources")),
        "parkedByDecision": safe_int(reframe_counts.get("parkedByDecision")),
        "damagedAssets": safe_int(reframe_counts.get("damagedAssets") or source_counts.get("damagedAssets")),
        "repairTickets": safe_int(repair_counts.get("tickets") or source_counts.get("repairTickets")),
        "repairDecisions": safe_int(repair_status_counts.get("groupDecisionCount") or source_counts.get("repairDecisions")),
        "latestProxyPrepSuccess": 1 if parts.get("proxy") else 0,
        "latestProxyPrepFailure": 1 if parts.get("proxyFailure") else 0,
        "proofRenderReceipts": safe_int(proof_ledger_counts.get("entries")),
        "exportsCreated": safe_int(reframe_counts.get("exportsCreated")),
        "originalsMutated": False,
        "externalPublishing": False,
    }


def build_packet(root: Path) -> dict[str, Any]:
    pointers = {
        "workflow": pointer(root, "latest-360-workflow-packet.json"),
        "source": pointer(root, "latest-360-source-desk.json"),
        "reframe": pointer(root, "latest-360-reframe-packet.json"),
        "repair": pointer(root, "latest-360-repair-preflight.json"),
        "repairStatus": pointer(root, "latest-360-repair-status.json"),
        "proxy": pointer(root, "latest-360-proxy-prep.json"),
        "proxyFailure": pointer(root, "latest-360-proxy-prep-failure.json"),
        "proof": pointer(root, "latest-360-proof-render.json"),
        "proofLedger": pointer(root, "latest-360-proof-render-ledger.json"),
    }
    packets = {key: packet_from_pointer(value) for key, value in pointers.items()}
    group_rows = build_group_rows(packets.get("source", {}), packets.get("reframe", {}), packets.get("repair", {}))
    rows = action_rows(pointers)
    counts = summarize_counts(pointers, group_rows)
    if not pointers["workflow"] and not pointers["reframe"] and not pointers["source"]:
        status = "needs-360-workflow-packet"
        next_action = "Generate a Studio360 workflow packet before reframe/export readiness can be reviewed."
    elif counts["blockedMediaRepair"]:
        status = "repair-first"
        next_action = "Open this Reframe/Export Desk, resolve repair blockers first, then return to reframe recipe review."
    elif counts["blockedNeedsProxy"]:
        status = "proxy-first"
        next_action = "Create or attach managed proxies for blocked groups before any export recipe work."
    elif counts["readyRecipeGroups"]:
        status = "reframe-review-ready"
        next_action = "Review ready 16:9/9:16 reframe recipes, tune keyframes/framing, then prepare explicit versioned exports."
    else:
        status = "needs-review"
        next_action = "Open source/reframe evidence and classify what is ready, parked, or blocked before export."
    if counts["blockedMediaRepair"]:
        human_ask = "Resolve or deliberately park the repair-blocked 360 groups before trusting any full export plan."
        agent_work = "Prepare exact repair summaries and safe recovery tasks while humans review ready recipes elsewhere."
    elif counts["blockedNeedsProxy"]:
        human_ask = "Confirm which proxy-blocked 360 groups belong in the current production and should get managed proxies."
        agent_work = "Prepare proxy-needed diagnostics and identify groups that can still be reviewed without new transcodes."
    elif counts["readyRecipeGroups"]:
        human_ask = "Review the ready 16:9 and 9:16 recipes/proofs, then explicitly choose which exports should be rendered."
        agent_work = "Rank ready recipe groups, surface proof coverage gaps, and prepare versioned export intent packets."
    else:
        human_ask = "Use this desk to classify the 360 runway before authorizing render, repair, or publishing work."
        agent_work = "Keep source/reframe/proof/repair evidence synchronized and make the next reversible classification clearer."
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "studio360Root": str(root),
        "status": status,
        "truth": "Studio360 Reframe/Export Desk only. It summarizes source, proxy, repair, and 16:9/9:16 recipe readiness without rendering, transcoding, repairing, parking, exporting, uploading, publishing, deleting, overwriting, or mutating originals.",
        "reframeExportTruthContract": reframe_truth_contract(),
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_work,
        "reviewChecklist": [
            "Open repair-first groups before authorizing any full export.",
            "Confirm proxy-safe review sources for every recipe group you intend to export.",
            "Treat proof renders as evidence, not as publication-ready receipts.",
            "Prefer versioned export intent packets over ad hoc renders.",
            "Keep originals, source grouping, repair decisions, recipes, proof receipts, and external publication receipts separate.",
        ],
        "counts": counts,
        "actionRows": rows,
        "groupRows": group_rows[:120],
        "sourcePointers": {
            key: {
                "htmlPath": value.get("htmlPath") or "",
                "jsonPath": value.get("jsonPath") or value.get("packetPath") or value.get("manifestPath") or "",
                "markdownPath": value.get("markdownPath") or "",
                "csvPath": value.get("csvPath") or "",
                "status": value.get("status") or "",
            }
            for key, value in pointers.items()
        },
        "firstSafeAction": open_action(
            "Open Studio360 Reframe/Export Desk",
            "",
            "The desk opens local evidence only. No source media changes.",
        ),
        "nextSafestAction": next_action,
        "safety": {
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "repairDecisionsWritten": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(root: Path) -> Path:
    base = root / "ReframeExportDesk" / stamp()
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["groupKey", "priority", "readiness", "status", "action", "durationSeconds", "recipeCount", "readyRecipeCount", "damagedAssetCount", "reviewSourceKind", "reviewSourcePath", "humanAsk", "agentSafeParallelWork", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("groupRows") or []:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Studio360 Reframe/Export Desk",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Counts",
        "",
    ]
    if packet.get("humanAsk") or packet.get("agentSafeParallelWork"):
        lines.extend([
            "## Start here",
            "",
            f"- Human ask: {packet.get('humanAsk')}",
            f"- Agent-safe parallel work: {packet.get('agentSafeParallelWork')}",
            "",
        ])
    lines.extend(["## Truth contract", ""])
    for item in packet.get("reframeExportTruthContract") or []:
        lines.append(f"- {item}")
    lines.append("")
    for key in [
        "assets", "groups", "recipeGroups", "recipes", "readyRecipeGroups", "readyRecipes", "exportRecipeRows",
        "blockedMediaRepair", "blockedNeedsProxy", "parkedDamagedSources", "parkedByDecision", "damagedAssets",
        "repairTickets", "repairDecisions", "exportsCreated",
        "proofRenderReceipts",
    ]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    lines.extend(["", "## Next safest action", "", str(packet.get("nextSafestAction") or ""), "", "## Workbench rows", ""])
    for row in packet.get("actionRows") or []:
        lines.extend([
            f"### {row.get('title')}",
            f"- Status: `{row.get('status')}`",
            f"- Why: {row.get('why')}",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Agent-safe work: {row.get('agentSafeParallelWork')}",
            f"- Safety: {row.get('safety')}",
            f"- HTML: `{row.get('htmlPath')}`",
            f"- JSON: `{row.get('jsonPath')}`",
            "",
        ])
    lines.extend(["", "## Priority recipe groups", ""])
    for row in (packet.get("groupRows") or [])[:36]:
        lines.extend([
            f"### {row.get('groupKey')} - {row.get('status')}",
            f"- Priority: `{row.get('priority')}`",
            f"- Readiness: `{row.get('readiness')}`",
            f"- Action: {row.get('action')}",
            f"- Recipes: `{row.get('readyRecipeCount')}` ready / `{row.get('recipeCount')}` total",
            f"- Review source: `{row.get('reviewSourceKind')}` `{row.get('reviewSourcePath')}`",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Agent-safe work: {row.get('agentSafeParallelWork')}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    action_html = []
    for row in packet.get("actionRows") or []:
        action_html.append(f"""
        <article class="workbench-row">
          <div class="kicker">{esc(row.get('status'))}</div>
          <h3>{esc(row.get('title'))}</h3>
          <p>{esc(row.get('why'))}</p>
          <p><strong>Human ask:</strong> {esc(row.get('humanAsk'))}</p>
          <p><strong>Agent-safe work:</strong> {esc(row.get('agentSafeParallelWork'))}</p>
          <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(row.get('itemCount'))} items</span><span>{esc(row.get('pending'))} pending</span><span>{esc(row.get('ready'))} ready</span></div>
          <details><summary>Open paths and safety</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    groups_html = []
    for row in packet.get("groupRows") or []:
        groups_html.append(f"""
        <article class="group {esc(row.get('priority'))}">
          <div class="topline"><span>{esc(row.get('priority'))}</span><strong>{esc(row.get('groupKey'))}</strong></div>
          <h3>{esc(row.get('action'))}</h3>
          <p><strong>Readiness:</strong> {esc(row.get('readiness'))}</p>
          <p><strong>Human ask:</strong> {esc(row.get('humanAsk'))}</p>
          <p><strong>Agent-safe work:</strong> {esc(row.get('agentSafeParallelWork'))}</p>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(row.get('readyRecipeCount'))}/{esc(row.get('recipeCount'))} recipes</span><span>{esc(row.get('damagedAssetCount'))} damaged</span><span>{esc(round(safe_float(row.get('durationSeconds')), 1))}s</span></div>
          <p class="path"><b>{esc(row.get('reviewSourceKind'))}</b><br>{esc(row.get('reviewSourcePath'))}</p>
          <details><summary>Evidence JSON</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Reframe/Export Desk</title>
  <style>
    :root {{ color-scheme: dark; --cedar:#11170f; --canopy:#172417; --moss:#8fbd72; --fern:#4f9464; --honey:#e5c65a; --water:#7fc9d7; --clay:#c97955; --ink:#fff4d8; --muted:#c9bc9e; --line:rgba(255,244,216,.16); }}
    * {{ box-sizing: border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 12% -8%, rgba(127,201,215,.2), transparent 34%), radial-gradient(circle at 92% 0%, rgba(143,189,114,.18), transparent 35%), linear-gradient(180deg,#182116,#070b07); }}
    header {{ padding:48px clamp(20px,5vw,84px); border-bottom:1px solid var(--line); }}
    .eyebrow,.kicker {{ color:var(--honey); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1080px; margin:12px 0; font-size:clamp(42px,7vw,88px); line-height:.9; letter-spacing:-.055em; }}
    h2 {{ margin:0 0 16px; color:var(--honey); }}
    h3 {{ margin:8px 0 8px; }}
    p {{ color:var(--muted); line-height:1.46; }}
    header p {{ max-width:980px; font-size:18px; }}
    .summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-top:24px; }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.025)); }}
    .stat b {{ display:block; font-size:32px; color:var(--ink); }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ padding:30px clamp(16px,4vw,58px) 76px; display:grid; gap:22px; }}
    section {{ border:1px solid var(--line); border-radius:30px; padding:22px; background:linear-gradient(180deg,rgba(23,36,23,.92),rgba(7,11,7,.96)); box-shadow:0 22px 58px rgba(0,0,0,.26); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:rgba(0,0,0,.2); }}
    .group.repair-first {{ border-color:rgba(201,121,85,.65); }}
    .group.proxy-first {{ border-color:rgba(127,201,215,.55); }}
    .group.ready-to-review {{ border-color:rgba(143,189,114,.62); }}
    .group.parked {{ opacity:.78; border-style:dashed; }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--honey); text-transform:uppercase; letter-spacing:.11em; font-size:11px; font-weight:950; }}
    .chips {{ display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }}
    .chips span {{ border:1px solid var(--line); border-radius:999px; padding:7px 9px; color:var(--ink); background:rgba(255,255,255,.055); font-size:12px; font-weight:850; }}
    .path {{ overflow-wrap:anywhere; font-size:12px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); background:rgba(0,0,0,.3); border-radius:14px; padding:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360 Reframe / Export Desk</div>
    <h1>The sphere stays whole. The output gets deliberate.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Agent-safe parallel work:</strong> {esc(packet.get('agentSafeParallelWork'))}</p>
    <div class="summary">
      <div class="stat"><b>{esc(counts.get('assets'))}</b><span>Assets</span></div>
      <div class="stat"><b>{esc(counts.get('groups'))}</b><span>Groups</span></div>
      <div class="stat"><b>{esc(counts.get('recipes'))}</b><span>Recipes</span></div>
      <div class="stat"><b>{esc(counts.get('readyRecipeGroups'))}</b><span>Ready groups</span></div>
      <div class="stat"><b>{esc(counts.get('blockedMediaRepair'))}</b><span>Repair blocks</span></div>
      <div class="stat"><b>{esc(counts.get('blockedNeedsProxy'))}</b><span>Proxy blocks</span></div>
      <div class="stat"><b>{esc(counts.get('exportsCreated'))}</b><span>Exports</span></div>
      <div class="stat"><b>{esc(counts.get('proofRenderReceipts'))}</b><span>Proofs</span></div>
      <div class="stat"><b>{esc(counts.get('repairDecisions'))}</b><span>Repair decisions</span></div>
    </div>
  </header>
  <main>
    <section>
      <h2>Reframe/export truth contract</h2>
      <div class="grid">
        {''.join(f'<article><p>{esc(item)}</p></article>' for item in (packet.get('reframeExportTruthContract') or []))}
      </div>
      <h2>Review checklist</h2>
      <div class="grid">
        {''.join(f'<article><p>{esc(item)}</p></article>' for item in (packet.get('reviewChecklist') or []))}
      </div>
    </section>
    <section><h2>Workbench</h2><div class="grid">{''.join(action_html) or '<p>No workbench rows yet. Generate workflow/source/reframe packets.</p>'}</div></section>
    <section><h2>Recipe groups</h2><div class="grid">{''.join(groups_html) or '<p>No recipe groups yet. Run the Studio360 workflow and reframe packet first.</p>'}</div></section>
    <section><h2>Source pointers</h2><pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    first_safe = open_action(
        "Open Studio360 Reframe/Export Desk",
        html_path,
        "Opens local reframe/export readiness evidence only. No render, upload, repair, delete, overwrite, publication, or source mutation occurs.",
    )
    pointer_payload = {
        "schema": "quipsly.studio360.latest-reframe-export-desk.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "reframe-export-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "truth": packet.get("truth") or "",
        "reframeExportTruthContract": packet.get("reframeExportTruthContract") or [],
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "reviewChecklist": packet.get("reviewChecklist") or [],
        "nextSafestAction": packet.get("nextSafestAction") or "Open Studio360 reframe/export evidence before any render or publishing work.",
        "firstSafeAction": first_safe,
        "sourcePointers": packet.get("sourcePointers") or {},
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "repairDecisionsWritten": False,
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    packet["firstSafeAction"] = first_safe


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local-only Studio360 Reframe/Export Desk.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    args = parser.parse_args()
    root = Path(args.studio360_root)
    packet = build_packet(root)
    out_dir = prepare_output_dir(root)
    json_path = out_dir / "360-reframe-export-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-360-reframe-export-desk.md"
    csv_path = out_dir / "360-reframe-export-groups.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    update_pointer(root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    print(json.dumps({
        "status": packet.get("status") or "reframe-export-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
        "humanAsk": packet.get("humanAsk"),
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
