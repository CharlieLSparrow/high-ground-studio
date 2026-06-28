#!/usr/bin/env python3
"""Build a Studio360 proof control room.

This is the human/agent front door for 360 work. It joins proof review,
proof-next, renderer preflight, reframe/export, repair, and source evidence into
one calm local surface. It does not run ffmpeg, render, repair, transcode,
upload, publish, schedule, delete, overwrite, park, approve, or mutate original
media.
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
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "ProofControlRooms"
LATEST_POINTER_NAME = "latest-360-proof-control-room.json"
ALIAS_POINTER_NAMES = ("latest-studio360-proof-control-room.json",)
SCHEMA = "quipsly.studio360.proof-control-room.v1"

POINTERS = {
    "proofReview": "latest-360-proof-review-desk.json",
    "proofNext": "latest-360-proof-next-brief.json",
    "proofSprint": "latest-360-proof-sprint-companion.json",
    "rendererPreflight": "latest-360-renderer-preflight.json",
    "reframeExport": "latest-360-reframe-export-desk.json",
    "exportCandidateQueue": "latest-360-export-candidate-queue.json",
    "reframePacket": "latest-360-reframe-packet.json",
    "repairPreflight": "latest-360-repair-preflight.json",
    "repairStatus": "latest-360-repair-status.json",
    "sourceDesk": "latest-360-source-desk.json",
    "workflowPacket": "latest-360-workflow-packet.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-proof-control-room")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except Exception:
        return ""


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def pointer_and_payload(root: Path, pointer_name: str) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = root / pointer_name
    pointer = load_json(pointer_path)
    target = Path(str(pointer.get("jsonPath") or pointer.get("packetPath") or pointer.get("manifestPath") or ""))
    payload = load_json(target) if target.exists() else {}
    return pointer, payload, target


def counts_from(*payloads: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for payload in payloads:
        counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
        for key, value in counts.items():
            if key not in merged:
                merged[key] = value
    return merged


def first_action(payload: dict[str, Any], fallback_label: str, fallback_path: str = "") -> dict[str, str]:
    action = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    path = str(action.get("path") or payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or fallback_path or "")
    command = str(action.get("command") or (f"open {shell_quote(path)}" if path else ""))
    return {
        "label": str(action.get("label") or fallback_label),
        "command": command,
        "path": path,
        "safety": str(action.get("safety") or "Opens local evidence only. No render, full export, upload, publish, delete, overwrite, account mutation, or original-media mutation."),
    }


def lane_card(card_id: str, title: str, payload: dict[str, Any], counts: dict[str, Any], fallback_label: str) -> dict[str, Any]:
    status = str(payload.get("status") or "missing-evidence")
    action = first_action(payload, fallback_label)
    missing = not bool(payload)
    outputs_missing = safe_int(counts.get("outputsMissing"))
    blocked = safe_int(counts.get("blockedMediaRepair")) + safe_int(counts.get("blockedNeedsProxy")) + safe_int(counts.get("damagedAssets"))
    if missing:
        severity = "missing-evidence"
        plain = "This expected 360 evidence surface is not available yet. Regenerate the lane before trusting downstream state."
    elif card_id in {"reframeExport", "reframePacket"} and blocked:
        severity = "repair-first"
        plain = "Repair/proxy evidence exists; resolve or park those groups before treating 360 export as clean."
    elif card_id == "proofReview" and outputs_missing:
        severity = "proof-output-missing"
        plain = "Proof rows exist, but at least one output is missing. Do not promote to full render until proof evidence is present."
    elif card_id == "proofNext" and safe_int(counts.get("readyToRunProofRows")):
        severity = "proof-next"
        plain = "There is at least one safe 10-second proof candidate. Run at most one proof when explicitly warranted, then review it."
    elif card_id == "rendererPreflight" and safe_int(counts.get("dryRunReadyRows")):
        severity = "dry-run-ready"
        plain = "Renderer dry-run intent is prepared, but that is not full render approval. Proof first, then explicit full-render approval."
    elif card_id == "exportCandidateQueue" and safe_int(counts.get("candidateRows")):
        severity = "export-candidates"
        plain = "Versioned export intent exists, but candidates are not rendered outputs. Review proof evidence before full render approval."
    else:
        severity = "review-ready"
        plain = "Local evidence is ready to inspect. Keep review truth separate from full render and publication truth."
    return {
        "id": card_id,
        "title": title,
        "status": status,
        "severity": severity,
        "plainEnglish": plain,
        "counts": counts,
        "firstSafeAction": action,
        "nextSafestAction": str(payload.get("nextSafestAction") or plain),
        "humanAsk": str(payload.get("humanAsk") or "Open the local evidence and classify the next 360 action before any render/export work."),
        "agentSafeParallelWork": str(payload.get("agentSafeParallelWork") or "Summarize local 360 evidence and improve packets only; do not render, mutate originals, or publish."),
        "htmlPath": str(payload.get("htmlPath") or ""),
        "jsonPath": str(payload.get("jsonPath") or ""),
        "markdownPath": str(payload.get("markdownPath") or ""),
        "truth": "Control-room card only. It describes local evidence and does not execute side effects.",
    }


def proof_review_rows(payload: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    output: list[dict[str, Any]] = []
    for idx, row in enumerate(rows[:limit], 1):
        if not isinstance(row, dict):
            continue
        path = str(row.get("outputPath") or "")
        output.append({
            "rank": idx,
            "type": "existing-proof",
            "candidateId": str(row.get("candidateId") or row.get("recipeId") or row.get("groupKey") or f"proof-{idx}"),
            "groupKey": str(row.get("groupKey") or ""),
            "aspect": str(row.get("aspect") or ""),
            "status": str(row.get("status") or ""),
            "outputPath": path,
            "outputExists": bool(row.get("outputExists")) or Path(path).exists(),
            "durationSeconds": safe_float(row.get("durationSeconds")),
            "frame": f"{row.get('width') or ''}x{row.get('height') or ''}".strip("x"),
            "audioCodec": str(row.get("audioCodec") or ""),
            "openCommand": str(row.get("openCommand") or (f"open {shell_quote(path)}" if path else "")),
            "reviewPrompt": "Inspect framing, horizon, crop, motion comfort, and audio before approving any full render path.",
        })
    return output


def proof_next_rows(payload: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
    if not rows and isinstance(payload.get("firstProofCandidate"), dict):
        rows = [payload["firstProofCandidate"]]
    output: list[dict[str, Any]] = []
    for idx, row in enumerate(rows[:limit], 1):
        if not isinstance(row, dict):
            continue
        proof_command = str(row.get("proofReceiptCommand") or row.get("firstProofRenderCommand") or row.get("proofDryRunCommand") or "")
        output.append({
            "rank": idx,
            "type": "next-proof-candidate",
            "candidateId": str(row.get("candidateId") or row.get("recipeId") or row.get("groupKey") or f"candidate-{idx}"),
            "groupKey": str(row.get("groupKey") or ""),
            "aspect": str(row.get("aspect") or ""),
            "status": str(row.get("status") or row.get("proofGate") or ""),
            "proofSeconds": safe_float(row.get("proofSeconds") or 10),
            "proofSourcePath": str(row.get("proofSourcePath") or row.get("futureRenderSourcePath") or ""),
            "proposedProofOutputPath": str(row.get("proposedProofOutputPath") or ""),
            "proofCommand": proof_command,
            "humanAsk": str(row.get("humanReviewAsk") or "Only run this proof if the source/recipe is the one you mean to test."),
            "nextSafestAction": str(row.get("nextSafestAction") or "Run one short proof, inspect it, and stop before full renders."),
        })
    return output


def aspect_pair_rows(payload: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    rows = payload.get("aspectPairRows") if isinstance(payload.get("aspectPairRows"), list) else []
    output: list[dict[str, Any]] = []
    for idx, row in enumerate(rows[: max(1, limit)], 1):
        if not isinstance(row, dict):
            continue
        wide_output = str(row.get("wideOutput") or "")
        vertical_output = str(row.get("verticalOutput") or "")
        wide_exists = Path(wide_output).exists() if wide_output else False
        vertical_exists = Path(vertical_output).exists() if vertical_output else False
        output.append({
            "rank": safe_int(row.get("rank")) or idx,
            "groupKey": str(row.get("groupKey") or ""),
            "status": str(row.get("status") or "paired-proof-review"),
            "sequenceDurationSeconds": safe_float(row.get("sequenceDurationSeconds")),
            "sourcePath": str(row.get("sourcePath") or ""),
            "has16x9": bool(row.get("has16x9")),
            "has9x16": bool(row.get("has9x16")),
            "wideCandidateId": str(row.get("wideCandidateId") or ""),
            "verticalCandidateId": str(row.get("verticalCandidateId") or ""),
            "wideProposedOutputPath": wide_output,
            "verticalProposedOutputPath": vertical_output,
            "wideProofPath": wide_output if wide_exists else "",
            "verticalProofPath": vertical_output if vertical_exists else "",
            "wideOutputExists": wide_exists,
            "verticalOutputExists": vertical_exists,
            "wideProofCommand": str(row.get("wideProofCommand") or ""),
            "verticalProofCommand": str(row.get("verticalProofCommand") or ""),
            "nextSafestAction": str(row.get("nextSafestAction") or "Review wide and vertical proof evidence together before any full render."),
            "truth": str(row.get("truth") or "Aspect pair row only. It does not render, approve, upload, mutate originals, overwrite, publish, or create receipts."),
        })
    return output


def build_source_routing_cards(workflow: dict[str, Any], source_desk: dict[str, Any], limit: int) -> dict[str, Any]:
    groups = workflow.get("groups") if isinstance(workflow.get("groups"), list) else []
    if not groups:
        groups = source_desk.get("groups") if isinstance(source_desk.get("groups"), list) else []
    workflow_items = workflow.get("items") if isinstance(workflow.get("items"), list) else []
    items_by_id = {
        str(item.get("id") or item.get("assetId") or ""): item
        for item in workflow_items
        if isinstance(item, dict) and str(item.get("id") or item.get("assetId") or "")
    }

    def assets_for(group: dict[str, Any]) -> list[dict[str, Any]]:
        raw_assets = group.get("assets") if isinstance(group.get("assets"), list) else []
        resolved: list[dict[str, Any]] = []
        for raw in raw_assets:
            if isinstance(raw, dict):
                resolved.append(raw)
                continue
            item = items_by_id.get(str(raw))
            if item:
                resolved.append(item)
        return resolved

    def route_for(group: dict[str, Any], assets: list[dict[str, Any]]) -> tuple[int, str, str, str]:
        status = str(group.get("status") or "unknown")
        kinds = {str(asset.get("kind") or "") for asset in assets}
        has_proxy = "proxy" in kinds
        has_companion = "insta360-low-res-companion" in kinds
        has_original = "insta360-original-video" in kinds
        has_review_source = "video-export-or-source" in kinds
        if status == "proxy-ready" or has_proxy:
            return (
                1,
                "proxy-safe-reframe-review",
                "Proxy-safe: inspect proof/reframe intent before any full render.",
                "Open the source evidence, confirm this is the intended 360 moment, then review or create one small proof if warranted.",
            )
        if status == "has-low-res-companion" or (has_original and has_companion):
            return (
                2,
                "companion-first-review",
                "Companion-first: review low-res companion before touching heavy originals.",
                "Confirm the companion/original pair and decide whether proxy prep is actually worth doing.",
            )
        if status == "needs-proxy":
            return (
                3,
                "proxy-prep-candidate",
                "Needs proxy: candidate for explicit proxy prep, not an automatic job.",
                "Inspect the source group and only then run proxy prep if this source belongs in the current 360 work.",
            )
        if status == "review-source" or has_review_source:
            return (
                4,
                "classify-before-reframe",
                "Review source: classify before using it as 360 evidence.",
                "Open the local evidence and decide if this is a 360 source, exported clip, reference, or parked mystery media.",
            )
        return (
            5,
            "park-until-understood",
            "Unclear: keep visible but parked until source identity is understood.",
            "Do not generate proxies or render proofs until the source group is classified.",
        )

    sorted_groups: list[tuple[int, int, dict[str, Any], str, str, str]] = []
    for index, group in enumerate(groups, 1):
        if not isinstance(group, dict):
            continue
        assets = assets_for(group)
        priority, route, label, next_action = route_for(group, assets)
        sorted_groups.append((priority, index, group, route, label, next_action))

    cards: list[dict[str, Any]] = []
    source_desk_path = str(source_desk.get("htmlPath") or "")
    for rank, (_, original_index, group, route, label, next_action) in enumerate(sorted(sorted_groups)[: max(1, limit)], 1):
        assets = assets_for(group)
        source_paths = [str(asset.get("sourcePath") or "") for asset in assets if str(asset.get("sourcePath") or "")]
        first_source = source_paths[0] if source_paths else ""
        kinds = sorted({str(asset.get("kind") or "unknown") for asset in assets})
        duration_seconds = max([safe_float(asset.get("durationSeconds")) for asset in assets] or [0.0])
        original_count = sum(1 for asset in assets if str(asset.get("kind") or "") == "insta360-original-video")
        companion_count = sum(1 for asset in assets if str(asset.get("kind") or "") == "insta360-low-res-companion")
        proxy_count = sum(1 for asset in assets if str(asset.get("kind") or "") == "proxy")
        damaged = [
            {
                "filename": str(asset.get("filename") or ""),
                "error": str(asset.get("ffprobeError") or ""),
                "sourcePath": str(asset.get("sourcePath") or ""),
            }
            for asset in assets
            if str(asset.get("ffprobeError") or "")
        ]
        group_key = str(group.get("groupKey") or group.get("key") or f"group-{original_index:04d}")
        cards.append({
            "id": f"studio360-source-{group_key}",
            "rank": rank,
            "groupKey": group_key,
            "groupId": str(group.get("groupId") or ""),
            "status": str(group.get("status") or "unknown"),
            "route": route,
            "label": label,
            "assetCount": len(assets),
            "kinds": kinds,
            "durationSeconds": round(duration_seconds, 3),
            "originalCount": original_count,
            "companionCount": companion_count,
            "proxyCount": proxy_count,
            "damagedAssets": damaged,
            "sourcePaths": source_paths[:6],
            "openSourceCommand": f"open -R {shell_quote(first_source)}" if first_source else "",
            "sourceDeskCommand": f"open {shell_quote(source_desk_path)}" if source_desk_path else "",
            "candidateProxyPrepCommand": f"./script/agentctl.sh studio360-proxy-prep {shell_quote(group_key)}",
            "candidateProxyPrepSafety": "Candidate command only. Do not run until a human confirms this source belongs in the current 360 workflow.",
            "humanQuestion": "Is this the intended 360 source group, and is it safe to review via companion/proxy before any full render?",
            "codexSafeMove": "Summarize source/proxy/companion evidence, prepare a review note, and keep damaged or unclear groups visible. Do not mutate originals or run proxy/render commands without approval.",
            "nextSafestAction": next_action,
            "localEvidenceNoteYaml": "\n".join([
                f"groupKey: {group_key}",
                f"status: {str(group.get('status') or 'unknown')}",
                f"route: {route}",
                f"assetCount: {len(assets)}",
                f"originalCount: {original_count}",
                f"companionCount: {companion_count}",
                f"proxyCount: {proxy_count}",
                f"durationSeconds: {round(duration_seconds, 3)}",
                "decision: pending-human-review",
                "receiptTruth: none",
            ]),
            "truth": "Source routing card only. It does not generate proxies, render, full-export, repair, upload, publish, schedule, mutate source media, write metadata, overwrite versions, delete files, or create receipts.",
        })

    return {
        "schema": "quipsly.studio360.source-routing-cards.v1",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "sourceGroupsConsidered": len(sorted_groups),
            "proxySafeCards": sum(1 for card in cards if card.get("route") == "proxy-safe-reframe-review"),
            "companionFirstCards": sum(1 for card in cards if card.get("route") == "companion-first-review"),
            "proxyPrepCandidateCards": sum(1 for card in cards if card.get("route") == "proxy-prep-candidate"),
            "classificationCards": sum(1 for card in cards if card.get("route") == "classify-before-reframe"),
            "damagedCards": sum(1 for card in cards if card.get("damagedAssets")),
        },
        "allowedLocalActions": ["open-source-in-finder", "open-source-desk", "copy-evidence-note", "classify-for-review", "hold"],
        "doNotDo": [
            "Do not mutate originals.",
            "Do not write source metadata.",
            "Do not auto-run proxy prep from a card.",
            "Do not render proofs or full exports from a source-routing card.",
            "Do not upload, publish, schedule, overwrite, delete, or create receipts.",
        ],
        "truth": "Source routing cards are local evidence only. They do not generate proxies, render, full-export, repair, upload, publish, schedule, mutate source media, write metadata, overwrite versions, delete files, or create receipts.",
    }


def build_render_dry_run_cards(
    export_candidate: dict[str, Any],
    renderer_preflight: dict[str, Any],
    proof_review: dict[str, Any],
    limit: int,
) -> dict[str, Any]:
    candidate_rows = [
        row
        for row in (export_candidate.get("candidateRows") if isinstance(export_candidate.get("candidateRows"), list) else [])
        if isinstance(row, dict)
    ]
    preflight_rows = [
        row
        for row in (renderer_preflight.get("preflightRows") if isinstance(renderer_preflight.get("preflightRows"), list) else [])
        if isinstance(row, dict)
    ]
    preflight_by_candidate = {str(row.get("candidateId") or ""): row for row in preflight_rows}
    proof_rows = [
        row
        for row in (proof_review.get("rows") if isinstance(proof_review.get("rows"), list) else [])
        if isinstance(row, dict)
    ]
    existing_proofs = {
        str(row.get("candidateId") or "")
        for row in proof_rows
        if row.get("outputExists") or str(row.get("status") or "").lower() in {"proof-output-present", "review-ready"}
    }

    cards: list[dict[str, Any]] = []
    renderer_path = str(renderer_preflight.get("htmlPath") or renderer_preflight.get("markdownPath") or "")
    export_path = str(export_candidate.get("htmlPath") or export_candidate.get("markdownPath") or "")
    for rank, candidate in enumerate(candidate_rows[: max(1, limit)], 1):
        candidate_id = str(candidate.get("candidateId") or "")
        preflight = preflight_by_candidate.get(candidate_id, {})
        review_source = str(candidate.get("reviewSourcePath") or "")
        future_source = str(candidate.get("futureRenderSourcePath") or preflight.get("futureRenderSourcePath") or "")
        proposed_proof = str(candidate.get("proposedProofOutputPath") or preflight.get("proposedProofOutputPath") or "")
        proposed_output = str(candidate.get("proposedOutputPath") or "")
        proof_exists = candidate_id in existing_proofs
        status = str(candidate.get("status") or preflight.get("status") or "candidate-review")
        proof_gate = str(candidate.get("proofFirstGate") or "Run and review one short proof before any full render.")
        full_gate = str(candidate.get("fullRenderGate") or "Full render waits for proof review and explicit human approval.")
        route = "review-existing-proof-before-full-render" if proof_exists else "dry-run-before-proof-render"
        if str(candidate.get("renderRisk") or "") != "proof-first-ready":
            route = "inspect-render-risk-before-proof"
        cards.append({
            "id": f"studio360-render-dry-run-{candidate_id or rank}",
            "rank": rank,
            "candidateId": candidate_id,
            "recipeId": str(candidate.get("recipeId") or preflight.get("recipeId") or ""),
            "groupKey": str(candidate.get("groupKey") or preflight.get("groupKey") or ""),
            "aspect": str(candidate.get("aspect") or preflight.get("aspect") or ""),
            "version": str(candidate.get("version") or preflight.get("version") or ""),
            "status": status,
            "route": route,
            "proofExists": proof_exists,
            "sequenceDurationSeconds": safe_float(candidate.get("sequenceDurationSeconds") or preflight.get("sequenceDurationSeconds")),
            "keyframeCount": safe_int(candidate.get("keyframeCount")),
            "renderRisk": str(candidate.get("renderRisk") or "review"),
            "renderRiskReasons": candidate.get("renderRiskReasons") if isinstance(candidate.get("renderRiskReasons"), list) else [],
            "reviewSourcePath": review_source,
            "futureRenderSourcePath": future_source,
            "proposedProofOutputPath": proposed_proof,
            "proposedOutputPath": proposed_output,
            "openReviewSourceCommand": f"open -R {shell_quote(review_source)}" if review_source else "",
            "openFutureSourceCommand": f"open -R {shell_quote(future_source)}" if future_source else "",
            "openProposedOutputFolderCommand": f"mkdir -p {shell_quote(str(Path(proposed_output).parent))} && open {shell_quote(str(Path(proposed_output).parent))}" if proposed_output else "",
            "openRendererPreflightCommand": f"open {shell_quote(renderer_path)}" if renderer_path else "./script/agentctl.sh studio360-renderer-preflight",
            "openExportCandidateQueueCommand": f"open {shell_quote(export_path)}" if export_path else "./script/agentctl.sh studio360-export-candidate-queue",
            "dryRunCommand": "./script/agentctl.sh studio360-renderer-preflight",
            "dryRunCommandSafety": "Safe readiness command only. It regenerates renderer preflight evidence; it does not execute ffmpeg, create proof output, create full output, upload, publish, schedule, delete, overwrite, or mutate sources.",
            "proofGate": proof_gate,
            "fullRenderGate": full_gate,
            "humanQuestion": "Is this the right 360 source, aspect, version, and framing recipe to proof before any full render?",
            "codexSafeMove": "Open the proxy/review source, compare the recipe/output intent, copy the dry-run note, and mark whether this candidate should get one proof render later. Do not render or mutate originals.",
            "nextSafestAction": "Review the proxy/source and renderer preflight evidence; if correct, ask a human before running exactly one short proof." if not proof_exists else "Watch the existing proof and record whether the candidate can advance toward explicit full-render approval.",
            "renderDryRunNoteYaml": "\n".join([
                f"candidateId: {candidate_id}",
                f"groupKey: {str(candidate.get('groupKey') or preflight.get('groupKey') or '')}",
                f"aspect: {str(candidate.get('aspect') or preflight.get('aspect') or '')}",
                f"version: {str(candidate.get('version') or preflight.get('version') or '')}",
                f"route: {route}",
                f"status: {status}",
                f"proofExists: {str(proof_exists).lower()}",
                f"reviewSourcePath: {review_source}",
                f"futureRenderSourcePath: {future_source}",
                f"proposedProofOutputPath: {proposed_proof}",
                f"proposedOutputPath: {proposed_output}",
                "decision: pending-human-proof-review",
                "receiptTruth: none",
            ]),
            "notAllowedYet": [
                "run full render",
                "upload",
                "publish",
                "schedule",
                "create receipt truth",
                "delete source files",
                "overwrite versions",
                "mutate original media",
            ],
            "truth": "Render dry-run card only. It exposes local candidate evidence and preflight intent; it does not execute renderer commands, create proof output, create full exports, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
        })

    return {
        "schema": "quipsly.studio360.render-dry-run-cards.v1",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "candidateRowsConsidered": len(candidate_rows),
            "dryRunBeforeProofCards": sum(1 for card in cards if card.get("route") == "dry-run-before-proof-render"),
            "existingProofReviewCards": sum(1 for card in cards if card.get("route") == "review-existing-proof-before-full-render"),
            "renderRiskCards": sum(1 for card in cards if card.get("route") == "inspect-render-risk-before-proof"),
        },
        "allowedLocalActions": ["open-review-source", "open-renderer-preflight", "open-export-candidate-queue", "copy-render-dry-run-note", "mark-needs-proof-review", "hold"],
        "doNotDo": [
            "Do not execute renderer commands from this card.",
            "Do not create proof outputs without explicit candidate choice.",
            "Do not create full renders from dry-run readiness alone.",
            "Do not mutate originals.",
            "Do not upload, publish, schedule, overwrite, delete, or create receipts.",
        ],
        "truth": "Render dry-run cards are local candidate guidance only. They do not render proofs, create full exports, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
    }


def build_proof_review_ladder(
    existing_proofs: list[dict[str, Any]],
    next_proofs: list[dict[str, Any]],
    repair_tickets: list[Any],
    limit: int,
) -> list[dict[str, Any]]:
    """Create a proof-first review ladder without claiming approval state."""
    rows: list[dict[str, Any]] = []
    for proof in existing_proofs[: max(1, limit)]:
        if not isinstance(proof, dict):
            continue
        rows.append({
            "kind": "watch-existing-proof",
            "label": "Watch existing proof",
            "groupKey": proof.get("groupKey") or "",
            "candidateId": proof.get("candidateId") or "",
            "aspect": proof.get("aspect") or "",
            "status": "needs-human-proof-review" if proof.get("outputExists") else "proof-output-missing",
            "safeCommand": proof.get("openCommand") or "",
            "lookFor": [
                "Is the subject or action framed clearly?",
                "Does the horizon/roll feel intentional?",
                "Is crop/zoom comfortable in this aspect ratio?",
                "Does movement feel watchable rather than seasick?",
                "Is audio present when expected?",
            ],
            "decisionOptions": ["usable-proof", "needs-reframe", "wrong-source", "missing-audio", "hold"],
            "nextSafestAction": proof.get("reviewPrompt") or "Watch the proof and record a local review note before any full render.",
            "safety": "Local proof review only. No render, export, upload, publish, delete, overwrite, or original-media mutation.",
        })
    if len(rows) < limit:
        for proof in next_proofs[: max(0, limit - len(rows))]:
            if not isinstance(proof, dict):
                continue
            rows.append({
                "kind": "optional-next-proof",
                "label": "Optional next proof",
                "groupKey": proof.get("groupKey") or "",
                "candidateId": proof.get("candidateId") or "",
                "aspect": proof.get("aspect") or "",
                "status": proof.get("status") or "dry-run-ready",
                "safeCommand": proof.get("proofCommand") or "",
                "lookFor": [
                    "Confirm this is the intended source before running it.",
                    "Confirm this is a 10-second proof, not a full render.",
                    "After proof exists, watch it before moving to export candidates.",
                ],
                "decisionOptions": ["run-one-proof", "skip-for-now", "wrong-source", "needs-recipe-adjustment", "hold"],
                "nextSafestAction": proof.get("nextSafestAction") or "Run at most one short proof only after source/recipe confirmation.",
                "safety": "At most one deliberate local short proof. No full render, upload, publication, schedule, source mutation, or receipt truth.",
            })
    if repair_tickets and len(rows) < limit:
        for ticket in repair_tickets[: max(0, limit - len(rows))]:
            if not isinstance(ticket, dict):
                continue
            classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
            first = ticket.get("firstSafeAction") if isinstance(ticket.get("firstSafeAction"), dict) else {}
            rows.append({
                "kind": "repair-blocker-visible",
                "label": "Repair blocker stays visible",
                "groupKey": ticket.get("groupKey") or "",
                "candidateId": ticket.get("groupId") or "",
                "aspect": "source",
                "status": classification.get("status") or ticket.get("reframeStatus") or "repair-review",
                "safeCommand": first.get("command") or ticket.get("openEvidenceCommand") or "",
                "lookFor": [
                    "Is this source actually needed for the current production run?",
                    "Is there a usable companion/proxy elsewhere?",
                    "Does this require re-copy/re-download from card, camera, cloud, or archive?",
                ],
                "decisionOptions": ["needs-redownload", "needs-companion", "park", "not-needed", "hold"],
                "nextSafestAction": ticket.get("nextSafestAction") or classification.get("nextSafestAction") or "Inspect repair evidence or park with a note.",
                "safety": "Repair visibility only. No recopy, delete, overwrite, render, upload, publish, or original-media mutation.",
            })
    for index, row in enumerate(rows, start=1):
        row["ladderRank"] = index
    return rows


def build_full_render_gate(counts: dict[str, Any], proof_review_ladder: list[dict[str, Any]]) -> dict[str, Any]:
    existing = safe_int(counts.get("proofOutputsPresent"))
    export_candidates = safe_int(counts.get("exportCandidateRows"))
    repair_tickets = safe_int(counts.get("repairTickets"))
    first = proof_review_ladder[0] if proof_review_ladder else {}
    if existing:
        state = "proof-review-needed"
        message = "Local proof outputs exist, but full renders still need explicit human proof review and approval."
    elif safe_int(counts.get("readyToRunProofRows")):
        state = "short-proof-needed"
        message = "Proof candidates exist, but full render remains blocked until one short proof is created and watched."
    else:
        state = "source-or-recipe-needed"
        message = "No proof is ready to trust yet. Regenerate or inspect source/recipe evidence before render talk."
    return {
        "schema": "quipsly.studio360.full-render-gate.v1",
        "state": state,
        "message": message,
        "proofOutputsPresent": existing,
        "exportCandidateRows": export_candidates,
        "repairTicketsVisible": repair_tickets,
        "humanApprovalRequired": True,
        "receiptTruthCreated": False,
        "localReadinessIsNotPublication": True,
        "firstProofReviewAction": first,
        "requirements": [
            "At least one relevant proof output has been watched with sound when audio matters.",
            "Framing, horizon/roll, crop, motion comfort, source identity, and aspect ratio are reviewed.",
            "Repair blockers are either parked with reason or irrelevant to this export candidate.",
            "A human explicitly approves the exact full-render candidate before render/export execution.",
            "External publication receipts stay empty until a real platform URL/provider ID exists.",
        ],
        "doNotDo": [
            "Do not treat dry-run-ready as render-approved.",
            "Do not treat an existing proof file as reviewed.",
            "Do not let damaged unrelated groups block ready proof review.",
            "Do not claim publication, upload, schedule, or receipt truth from local files.",
        ],
        "nextSafestAction": first.get("nextSafestAction") or "Open the proof control room and review one existing proof before any full-render decision.",
        "safety": "Gate/readiness model only. It does not render, export, upload, publish, schedule, approve, overwrite, delete, repair, or mutate sources.",
    }


def build_proof_loop(loaded: dict[str, dict[str, Any]], next_proofs: list[dict[str, Any]]) -> list[dict[str, str]]:
    def open_command(key: str, fallback: str) -> str:
        payload = loaded.get(key) or {}
        path = str(payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or "")
        return f"open {shell_quote(path)}" if path else fallback

    return [
        {
            "step": "1",
            "label": "Verify source and proxy truth",
            "why": "360 editing gets dangerous when source/proxy/companion files are ambiguous. Confirm the group before any render work.",
            "command": open_command("sourceDesk", "./script/agentctl.sh studio360-source-desk"),
            "doneWhen": "The source desk shows the expected group, source files, proxy state, and any companion relationship.",
            "safety": "Read-only source evidence; no repair, proxy generation, render, export, upload, delete, or source mutation.",
        },
        {
            "step": "2",
            "label": "Resolve or park repair blockers",
            "why": "Damaged sources should be explicit tickets, not silent reasons the whole lane feels haunted.",
            "command": open_command("repairPreflight", "./script/agentctl.sh studio360-repair-preflight"),
            "doneWhen": "Blocked groups are either repair-ready, parked with reason, or safe to ignore while ready groups continue.",
            "safety": "Review/preflight only; does not recopy, delete, overwrite, mutate, or repair media.",
        },
        {
            "step": "3",
            "label": "Check renderer dry-run before proof",
            "why": "Dry-run commands prove intent and paths without spending time or creating misleading finished exports.",
            "command": open_command("rendererPreflight", "./script/agentctl.sh studio360-renderer-preflight"),
            "doneWhen": "A proof candidate has a clear recipe, source path, output path, and no unresolved source ambiguity.",
            "safety": "Dry-run/readiness only; no render command executed.",
        },
        {
            "step": "4",
            "label": "Run or review exactly one short proof",
            "why": "Proofs are small truth samples. They should answer framing/crop/horizon/motion questions before any full export.",
            "command": open_command("proofNext", "./script/agentctl.sh studio360-proof-next-brief"),
            "doneWhen": "One local proof exists or an existing proof has been reviewed for framing, horizon, crop, motion, and audio.",
            "safety": "Opens proof candidate guidance. Render commands remain inside the proof candidate section and require explicit selection.",
        },
        {
            "step": "5",
            "label": "Only then consider export candidates",
            "why": "Export candidates are recipes, not finished truth. Full renders require proof confidence and explicit approval.",
            "command": open_command("exportCandidateQueue", "./script/agentctl.sh studio360-export-candidate-queue"),
            "doneWhen": "The queue identifies which candidates are proof-backed, blocked, or still dry-run only.",
            "safety": "Queue/readiness only; no full render, external publishing, upload, schedule, or receipt truth.",
        },
    ]


def build_ready_continuation_plan(
    counts: dict[str, Any],
    next_proofs: list[dict[str, Any]],
    loaded: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    def surface_command(payload: dict[str, Any], fallback: str = "") -> str:
        path = str(payload.get("htmlPath") or payload.get("markdownPath") or payload.get("jsonPath") or "")
        return f"open {shell_quote(path)}" if path else fallback

    first_proof = next_proofs[0] if next_proofs else {}
    renderer_payload = loaded.get("rendererPreflight") or {}
    source_payload = loaded.get("sourceDesk") or loaded.get("workflowPacket") or {}
    export_payload = loaded.get("exportCandidateQueue") or {}
    proof_review_payload = loaded.get("proofReview") or {}
    proof_command = str(first_proof.get("proofCommand") or "")
    proof_candidate_id = str(first_proof.get("candidateId") or "")
    ready_groups = safe_int(counts.get("readyGroupsCanContinue"))
    ready_recipes = safe_int(counts.get("readyRenderRecipesCanContinue"))
    repair_tickets = safe_int(counts.get("repairTickets"))
    return {
        "schema": "quipsly.studio360.ready-continuation-plan.v1",
        "headline": f"{ready_groups} ready 360 groups can continue while {repair_tickets} repair tickets stay parked.",
        "plainEnglish": "The 360 lane is not globally blocked. Damaged groups stay visible as repair evidence, while ready groups can move through source check, renderer dry-run, one short proof, proof review, and later explicit full-render approval.",
        "readyGroupsCanContinue": ready_groups,
        "readyRenderRecipesCanContinue": ready_recipes,
        "repairTicketsParked": repair_tickets,
        "firstProofCandidate": first_proof,
        "steps": [
            {
                "label": "Confirm the ready source group",
                "command": surface_command(source_payload, "./script/agentctl.sh studio360-source-desk"),
                "doneWhen": "The source/proxy/companion relationship for the proof candidate is clear.",
                "safety": "Opens source/proxy/companion evidence. It does not repair, proxy, render, upload, delete, or mutate source media.",
            },
            {
                "label": "Check renderer dry-run intent",
                "command": surface_command(renderer_payload, "./script/agentctl.sh studio360-renderer-preflight"),
                "doneWhen": "The selected proof candidate has a specific recipe, source path, and output path.",
                "safety": "Opens renderer preflight evidence only. It does not execute render commands.",
            },
            {
                "label": "Run or review one short proof",
                "command": proof_command,
                "doneWhen": f"One 10-second proof exists for `{proof_candidate_id}` and has been watched for framing, horizon, crop, motion, and audio.",
                "safety": "Runs at most one local proof command only if a human/operator deliberately chooses this candidate. No full render, upload, publication, schedule, source mutation, or receipt truth.",
            },
            {
                "label": "Inspect proof output before full renders",
                "command": surface_command(proof_review_payload, "./script/agentctl.sh studio360-proof-review-desk"),
                "doneWhen": "A reviewer marks whether the proof is good enough, needs reframe changes, or should stay blocked.",
                "safety": "Opens proof review evidence only. It does not create full renders or mutate source media.",
            },
            {
                "label": "Only then inspect export candidates",
                "command": surface_command(export_payload, "./script/agentctl.sh studio360-export-candidate-queue"),
                "doneWhen": "A full-render candidate is selected only after proof confidence exists.",
                "safety": "Opens export candidate queue evidence only. It does not render, upload, publish, or create receipts.",
            },
        ],
        "doNotDo": [
            "Do not let damaged groups make ready groups feel blocked.",
            "Do not render full exports from dry-run readiness alone.",
            "Do not mutate or delete original 360 media.",
            "Do not treat proof output as a publishing receipt.",
        ],
        "truth": "Continuation plan only. It opens local evidence and may display a proof command, but it does not execute renders or mutate source media.",
    }


def build_studio360_start_queue(
    existing_proofs: list[dict[str, Any]],
    next_proofs: list[dict[str, Any]],
    repair_action_queue: list[Any],
    repair_start_here: dict[str, Any],
    limit: int,
) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []

    for row in existing_proofs[:3]:
        if not isinstance(row, dict):
            continue
        queue.append({
            "kind": "review-existing-proof",
            "label": "Watch an existing proof",
            "title": f"{row.get('candidateId') or 'proof'} {row.get('aspect') or ''}".strip(),
            "status": "proof-output-present" if row.get("outputExists") else "proof-output-missing",
            "why": "Existing proof output is the safest first stop: watch framing, horizon, crop, motion comfort, and audio before creating more renders.",
            "safeCommand": row.get("openCommand") or "",
            "humanDecision": "Mark proof as usable, needs reframe, wrong source, missing audio, or hold.",
            "codexCanDo": "Summarize proof evidence, compare it with recipe/source paths, and prepare review notes without rendering or mutating media.",
            "nextSafestAction": row.get("reviewPrompt") or "Inspect proof output and record a local review decision.",
            "safety": "Opens existing local proof output only. No render, full export, upload, publish, delete, overwrite, repair, or original-media mutation.",
        })

    for row in next_proofs[:2]:
        if not isinstance(row, dict):
            continue
        queue.append({
            "kind": "run-one-proof-candidate",
            "label": "Optionally run one short proof",
            "title": f"{row.get('candidateId') or 'candidate'} {row.get('aspect') or ''}".strip(),
            "status": row.get("status") or "proof-needed",
            "why": "A short proof is useful only when this exact source/recipe is the one we mean to test. It is not full-render approval.",
            "safeCommand": row.get("proofCommand") or "",
            "humanDecision": "Confirm the candidate/source/recipe, then run at most this one proof or skip it.",
            "codexCanDo": "Check paths, summarize recipe intent, and prepare a proof-review note; do not run full renders or claim publication.",
            "nextSafestAction": row.get("nextSafestAction") or "Run one short proof only if source and recipe are correct.",
            "safety": "At most one local short proof command when deliberately selected. No full render, upload, publication, schedule, source mutation, or receipt truth.",
        })

    if repair_start_here:
        queue.append({
            "kind": "repair-start-here",
            "label": "Resolve or park the first repair blocker",
            "title": repair_start_here.get("groupKey") or repair_start_here.get("label") or "Repair blocker",
            "status": repair_start_here.get("status") or "repair-review",
            "why": "Damaged 360 groups should stay visible as repair tickets, but they should not block ready proof/reframe work.",
            "safeCommand": repair_start_here.get("openEvidenceCommand") or "",
            "humanDecision": "Choose needs-source, needs-redownload, needs-companion, use-companion, park, review, or not-needed.",
            "codexCanDo": repair_start_here.get("codexSafeAction") or "Prepare a repair note or missing-media task without touching original media.",
            "nextSafestAction": repair_start_here.get("humanAction") or "Inspect repair evidence and park or classify the blocker.",
            "safety": "Repair evidence only. Does not recopy, delete, overwrite, mutate, proxy, render, upload, publish, or create receipts.",
        })

    for row in repair_action_queue[:2]:
        if not isinstance(row, dict):
            continue
        queue.append({
            "kind": "repair-action",
            "label": row.get("label") or "Repair action",
            "title": row.get("groupKey") or "Repair ticket",
            "status": row.get("status") or "repair-review",
            "why": "This repair ticket can be classified or parked while ready 360 groups keep moving.",
            "safeCommand": row.get("openEvidenceCommand") or "",
            "humanDecision": row.get("humanAction") or "Classify or park this repair ticket.",
            "codexCanDo": row.get("codexSafeAction") or "Summarize blocker evidence and prepare safe next steps.",
            "nextSafestAction": row.get("nextSafestAction") or row.get("humanAction") or "Inspect repair evidence.",
            "safety": "Repair action queue only. Does not mutate, recopy, delete, render, upload, publish, or create receipts.",
        })

    for index, row in enumerate(queue[: max(1, limit)], start=1):
        row["queueRank"] = index
    return queue[: max(1, limit)]


def build_studio360_proof_runway(
    proof_review_ladder: list[dict[str, Any]],
    studio360_start_queue: list[dict[str, Any]],
    next_proofs: list[dict[str, Any]],
    repair_tickets: list[Any],
    full_render_gate: dict[str, Any],
    counts: dict[str, Any],
) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for row in proof_review_ladder[:8]:
        if not isinstance(row, dict):
            continue
        kind = str(row.get("kind") or "")
        if "repair" in kind:
            phase = "Park or classify repair ticket"
            allowed = ["needs-source", "needs-redownload", "needs-companion", "use-companion", "park", "not-needed", "review"]
        elif "candidate" in kind or "run" in kind:
            phase = "Run or review one short proof"
            allowed = ["run-one-proof", "hold", "wrong-source", "needs-reframe", "needs-more-evidence"]
        else:
            phase = "Watch existing proof"
            allowed = ["usable-proof", "needs-reframe", "wrong-source", "missing-audio", "hold"]
        rows.append({
            "rank": row.get("ladderRank") or len(rows) + 1,
            "phase": phase,
            "kind": kind,
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "status": row.get("status") or "",
            "openCommand": row.get("safeCommand") or "",
            "nextSafestAction": row.get("nextSafestAction") or "Inspect this proof evidence and record a local decision.",
            "lookFor": row.get("lookFor") if isinstance(row.get("lookFor"), list) else [],
            "allowedLocalDecisions": allowed,
            "notAllowedYet": [
                "full render approval",
                "external publish",
                "upload",
                "schedule",
                "receipt capture",
                "overwrite source",
                "delete original media",
            ],
            "safety": row.get("safety") or "Local 360 proof guidance only. No render/export/upload/publish/source mutation.",
        })

    repair_rows: list[dict[str, Any]] = []
    for ticket in repair_tickets[:3]:
        if not isinstance(ticket, dict):
            continue
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        action = ticket.get("firstSafeAction") if isinstance(ticket.get("firstSafeAction"), dict) else {}
        repair_rows.append({
            "groupKey": ticket.get("groupKey") or "",
            "status": classification.get("status") or ticket.get("reframeStatus") or "repair-review",
            "reason": classification.get("reason") or "Repair evidence needs review before this group can be trusted.",
            "openCommand": action.get("command") or "",
            "nextSafestAction": ticket.get("nextSafestAction") or classification.get("nextSafestAction") or "Inspect repair evidence and park/classify the group.",
            "damagedAssets": len(ticket.get("damagedAssets") if isinstance(ticket.get("damagedAssets"), list) else []),
            "safety": "Repair ticket visibility only. Do not recopy, delete, overwrite, render, publish, upload, schedule, or mutate source media from this runway.",
        })

    first_row = rows[0] if rows else {}
    return {
        "schema": "quipsly.studio360.proof-runway.v1",
        "plainEnglish": "A 360 session should start by watching one small proof, not by staring into a pile of damaged files and render recipes. Review existing proofs first, run one short proof only when source/recipe are clear, and keep full renders behind human approval.",
        "firstMove": first_row.get("nextSafestAction") or "Open the 360 proof control room and choose one proof or repair row.",
        "firstOpenCommand": first_row.get("openCommand") or "",
        "rows": rows,
        "repairParkingLot": repair_rows,
        "nextProofPreviewRows": next_proofs[:3],
        "startQueuePreview": studio360_start_queue[:5],
        "fullRenderGate": {
            "state": full_render_gate.get("state") or "",
            "message": full_render_gate.get("message") or "",
            "humanApprovalRequired": bool(full_render_gate.get("humanApprovalRequired")),
            "nextSafestAction": full_render_gate.get("nextSafestAction") or "",
        },
        "counts": {
            "proofRows": len(rows),
            "repairRows": len(repair_rows),
            "existingProofRows": counts.get("existingProofRows", 0),
            "nextProofRows": counts.get("nextProofRows", 0),
            "readyGroupsCanContinue": counts.get("readyGroupsCanContinue", 0),
            "repairTickets": counts.get("repairTickets", 0),
            "fullRenderCreated": counts.get("fullRenderCreated", False),
            "rendererCommandsExecuted": counts.get("rendererCommandsExecuted", False),
        },
        "truth": "Studio360 proof runway only. It opens local evidence and review guidance; it does not render, full-export, repair, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
    }


def build_reframe_export_runway(
    export_candidate_payload: dict[str, Any],
    proof_review_ladder: list[dict[str, Any]],
    next_proofs: list[dict[str, Any]],
    repair_tickets: list[Any],
    full_render_gate: dict[str, Any],
    counts: dict[str, Any],
    limit: int,
) -> dict[str, Any]:
    candidate_rows = export_candidate_payload.get("candidateRows") if isinstance(export_candidate_payload.get("candidateRows"), list) else []
    ready_rows: list[dict[str, Any]] = []
    blocked_rows: list[dict[str, Any]] = []
    for row in candidate_rows:
        if not isinstance(row, dict):
            continue
        target = ready_rows if str(row.get("status") or "") == "candidate-ready" and bool(row.get("reviewSourceExists")) else blocked_rows
        target.append(row)
    runway_rows: list[dict[str, Any]] = []
    for index, row in enumerate(ready_rows[: max(1, limit)], start=1):
        runway_rows.append({
            "rank": index,
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "version": row.get("version") or "",
            "status": row.get("status") or "",
            "sequenceDurationSeconds": row.get("sequenceDurationSeconds") or 0,
            "keyframeCount": row.get("keyframeCount") or 0,
            "reviewSourcePath": row.get("reviewSourcePath") or "",
            "futureRenderSourcePath": row.get("futureRenderSourcePath") or "",
            "proposedProofOutputPath": row.get("proposedProofOutputPath") or "",
            "proposedOutputPath": row.get("proposedOutputPath") or "",
            "proofGate": row.get("proofFirstGate") or "Run and review proof before full render.",
            "fullRenderGate": row.get("fullRenderGate") or "Full render requires proof review and explicit approval.",
            "nextSafestAction": row.get("nextSafestAction") or "Review recipe/proof evidence before any full render.",
            "truth": row.get("truth") or "Export candidate metadata only. No render, upload, publish, delete, overwrite, or source mutation occurred.",
        })
    repair_rows: list[dict[str, Any]] = []
    for ticket in repair_tickets[:3]:
        if not isinstance(ticket, dict):
            continue
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        repair_rows.append({
            "groupKey": ticket.get("groupKey") or "",
            "status": classification.get("status") or ticket.get("reframeStatus") or "repair-review",
            "reason": classification.get("reason") or "Repair evidence needs review before this group can be trusted for export.",
            "nextSafestAction": ticket.get("nextSafestAction") or classification.get("nextSafestAction") or "Inspect repair evidence and park/classify the group.",
            "truth": "Repair blocker row only. It does not repair, recopy, delete, overwrite, render, export, upload, publish, schedule, or mutate originals.",
        })
    proof_rows = [
        {
            "rank": row.get("ladderRank") or index,
            "kind": row.get("kind") or "",
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "status": row.get("status") or "",
            "decisionNeeded": row.get("humanDecision") or "Review proof evidence before full render.",
            "openCommand": row.get("safeCommand") or "",
        }
        for index, row in enumerate(proof_review_ladder[: max(1, limit)], start=1)
        if isinstance(row, dict)
    ]
    next_proof_rows = [
        {
            "candidateId": row.get("candidateId") or "",
            "groupKey": row.get("groupKey") or "",
            "aspect": row.get("aspect") or "",
            "proofSeconds": row.get("proofSeconds") or 0,
            "proofCommand": row.get("proofCommand") or "",
            "nextSafestAction": row.get("nextSafestAction") or "Run one short proof only after source/recipe check.",
        }
        for row in next_proofs[:3]
        if isinstance(row, dict)
    ]
    return {
        "schema": "quipsly.studio360.reframe-export-runway.v1",
        "headline": "Reframe/export runway: proof first, full render later.",
        "plainEnglish": "This is the 360 production runway from whole source sphere to 16:9 and 9:16 exports. It keeps recipes, proof outputs, repair blockers, and full-render approval separate so ready groups can move without pretending damaged groups are fixed.",
        "rows": runway_rows,
        "proofReviewRows": proof_rows,
        "nextProofRows": next_proof_rows,
        "repairRows": repair_rows,
        "fullRenderGate": full_render_gate,
        "counts": {
            "candidateRows": len(candidate_rows),
            "readyRows": len(ready_rows),
            "blockedRows": len(blocked_rows),
            "runwayRows": len(runway_rows),
            "proofReviewRows": len(proof_rows),
            "nextProofRows": len(next_proof_rows),
            "repairRows": len(repair_rows),
            "renderedFilesPresent": counts.get("exportCandidateRenderedFilesPresent", 0),
            "proofOutputsPresent": counts.get("proofOutputsPresent", 0),
            "fullRenderCreated": counts.get("fullRenderCreated", False),
            "rendererCommandsExecuted": counts.get("rendererCommandsExecuted", False),
            "originalsMutated": counts.get("originalsMutated", False),
            "exportsCreated": counts.get("exportsCreated", False),
        },
        "gates": [
            "A recipe/candidate is not an export.",
            "A proof render is not a full render.",
            "A local full render is not publication.",
            "A local receipt is not valid without a real external URL/provider proof.",
            "Damaged repair tickets stay visible without freezing unrelated ready groups.",
        ],
        "nextSafestAction": "Open existing proofs first, then use the first ready candidate row to confirm 16:9/9:16 recipe intent before any full render approval.",
        "truth": "Studio360 reframe/export runway only. It does not render, full-export, repair, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
    }


def build_payload(root: Path, out_dir: Path, limit: int) -> dict[str, Any]:
    loaded: dict[str, dict[str, Any]] = {}
    pointer_paths: dict[str, str] = {}
    for key, filename in POINTERS.items():
        pointer, payload, target = pointer_and_payload(root, filename)
        combined = {**pointer, **payload} if payload else pointer
        loaded[key] = combined
        pointer_paths[key] = str(root / filename)

    proof_review = loaded["proofReview"]
    proof_next = loaded["proofNext"]
    proof_sprint = loaded["proofSprint"]
    renderer = loaded["rendererPreflight"]
    reframe_export = loaded["reframeExport"]
    export_candidate = loaded["exportCandidateQueue"]
    reframe_packet = loaded["reframePacket"]
    repair_preflight = loaded["repairPreflight"]
    repair_status = loaded["repairStatus"]
    source_desk = loaded["sourceDesk"]
    workflow = loaded["workflowPacket"]

    proof_review_counts = counts_from(proof_review)
    proof_next_counts = counts_from(proof_next)
    proof_sprint_counts = counts_from(proof_sprint)
    renderer_counts = counts_from(renderer)
    reframe_counts = counts_from(reframe_export, reframe_packet)
    export_candidate_counts = counts_from(export_candidate)
    repair_counts = counts_from(repair_preflight, repair_status)
    source_counts = counts_from(source_desk, workflow)

    cards = [
        lane_card("proofReview", "Proof review desk", proof_review, proof_review_counts, "Open proof review desk"),
        lane_card("proofNext", "Next proof queue", proof_next, proof_next_counts, "Open proof-next brief"),
        lane_card("rendererPreflight", "Renderer preflight", renderer, renderer_counts, "Open renderer preflight"),
        lane_card("reframeExport", "Reframe/export desk", reframe_export, reframe_counts, "Open reframe/export desk"),
        lane_card("exportCandidateQueue", "Export candidate queue", export_candidate, export_candidate_counts, "Open export candidate queue"),
        lane_card("repairPreflight", "Repair preflight tickets", repair_preflight, repair_counts, "Open repair preflight"),
        lane_card("repairStatus", "Repair decisions/status", repair_status, counts_from(repair_status), "Open repair status"),
        lane_card("sourceDesk", "Source/source-pair evidence", source_desk or workflow, source_counts, "Open Studio360 source evidence"),
    ]

    existing_proofs = proof_review_rows(proof_review, limit)
    next_proofs = proof_next_rows(proof_next, limit)
    paired_proofs = aspect_pair_rows(proof_sprint, limit)
    proof_sprint_loop = proof_sprint.get("proofSprintLoop") if isinstance(proof_sprint.get("proofSprintLoop"), dict) else {}
    proof_loop = build_proof_loop(loaded, next_proofs)
    repair_tickets = repair_preflight.get("tickets") if isinstance(repair_preflight.get("tickets"), list) else []
    repair_action_queue = repair_preflight.get("repairActionQueue") if isinstance(repair_preflight.get("repairActionQueue"), list) else []
    repair_start_here = repair_preflight.get("startHereToday") if isinstance(repair_preflight.get("startHereToday"), dict) else {}
    repair_lane_boundary = repair_preflight.get("laneBoundary") if isinstance(repair_preflight.get("laneBoundary"), dict) else {}
    operator_recopy_checklist = repair_preflight.get("operatorRecopyChecklist") if isinstance(repair_preflight.get("operatorRecopyChecklist"), list) else []
    blocked_media = safe_int(reframe_counts.get("blockedMediaRepair")) + safe_int(reframe_counts.get("blockedNeedsProxy")) + safe_int(reframe_counts.get("damagedAssets"))
    outputs_present = safe_int(proof_review_counts.get("outputsPresent"))
    ready_next = safe_int(proof_next_counts.get("readyToRunProofRows")) or safe_int(proof_next_counts.get("proofOutputsNotYetRendered"))
    dry_run_ready = safe_int(renderer_counts.get("dryRunReadyRows"))

    ready_groups_can_continue = safe_int(repair_lane_boundary.get("readyGroupsCanContinue")) or safe_int(reframe_counts.get("reframeReady"))
    ready_render_recipes_can_continue = safe_int(repair_lane_boundary.get("readyRenderRecipesCanContinue")) or dry_run_ready

    if blocked_media and (ready_groups_can_continue or ready_render_recipes_can_continue):
        status = "studio360-control-room-repair-parallel-proof-ready"
        next_action = "Park damaged groups as repair tickets, then continue with one proof/reframe/export-prep action from the ready 360 groups."
    elif blocked_media:
        status = "studio360-control-room-repair-first"
        next_action = "Use the repair checklist for damaged groups before trusting 360 proof/reframe/export-prep work."
    elif outputs_present:
        status = "studio360-control-room-proof-review-ready"
        next_action = "Open proof outputs, inspect framing/horizon/crop/motion/audio, then decide if one full-render plan deserves approval."
    elif ready_next or dry_run_ready:
        status = "studio360-control-room-proof-needed"
        next_action = "Run at most one short proof command, inspect it, and stop before full renders."
    else:
        status = "studio360-control-room-needs-source-evidence"
        next_action = "Regenerate Studio360 source/reframe/proof surfaces and keep the lane visible as recoverable evidence."

    counts = {
        "controlCards": len(cards),
        "existingProofRows": len(existing_proofs),
        "nextProofRows": len(next_proofs),
        "proofOutputsPresent": outputs_present,
        "proofOutputsMissing": safe_int(proof_review_counts.get("outputsMissing")),
        "proofAspectPairs": safe_int(proof_sprint_counts.get("proofAspectPairs")) or len(paired_proofs),
        "pairedWideVerticalProofGroups": safe_int(proof_sprint_counts.get("pairedWideVerticalProofGroups")) or sum(1 for row in paired_proofs if row.get("has16x9") and row.get("has9x16")),
        "readyToRunProofRows": safe_int(proof_next_counts.get("readyToRunProofRows")),
        "proofOutputsNotYetRendered": safe_int(proof_next_counts.get("proofOutputsNotYetRendered")),
        "rendererDryRunReadyRows": dry_run_ready,
        "exportCandidateRows": safe_int(export_candidate_counts.get("candidateRows")),
        "exportCandidateBlockedGroups": safe_int(export_candidate_counts.get("blockedGroups")),
        "exportCandidateReadyGroups": safe_int(export_candidate_counts.get("readyGroups")),
        "exportCandidateRenderedFilesPresent": safe_int(export_candidate_counts.get("renderedFilesPresent")),
        "reframeReady": safe_int(reframe_counts.get("reframeReady")),
        "blockedMediaRepair": safe_int(reframe_counts.get("blockedMediaRepair")),
        "blockedNeedsProxy": safe_int(reframe_counts.get("blockedNeedsProxy")),
        "damagedAssets": safe_int(reframe_counts.get("damagedAssets")),
        "repairTickets": safe_int(repair_counts.get("tickets")),
        "repairTicketsWithEvidence": sum(1 for ticket in repair_tickets if isinstance(ticket, dict) and ticket.get("repairEvidencePresent")),
        "repairTicketsNeedingSourceRecopy": safe_int(repair_counts.get("needsRedownloadOrSourceRecopy")),
        "readyGroupsCanContinue": ready_groups_can_continue,
        "readyRenderRecipesCanContinue": ready_render_recipes_can_continue,
        "assetGroups": safe_int(source_counts.get("groups")),
        "assets": safe_int(source_counts.get("assets")),
        "rendererCommandsExecuted": False,
        "exportsCreated": False,
        "fullRenderCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    effective_repair_lane_boundary = {**repair_lane_boundary} if repair_lane_boundary else {}
    if effective_repair_lane_boundary:
        effective_repair_lane_boundary["readyGroupsCanContinue"] = (
            safe_int(effective_repair_lane_boundary.get("readyGroupsCanContinue"))
            or counts["readyGroupsCanContinue"]
        )
        effective_repair_lane_boundary["readyRenderRecipesCanContinue"] = (
            safe_int(effective_repair_lane_boundary.get("readyRenderRecipesCanContinue"))
            or counts["readyRenderRecipesCanContinue"]
        )
    ready_continuation_plan = build_ready_continuation_plan(counts, next_proofs, loaded)
    proof_review_ladder = build_proof_review_ladder(existing_proofs, next_proofs, repair_tickets, limit)
    full_render_gate = build_full_render_gate(counts, proof_review_ladder)
    source_routing_cards = build_source_routing_cards(workflow, source_desk, limit)
    render_dry_run_cards = build_render_dry_run_cards(export_candidate, renderer, proof_review, limit)
    studio360_start_queue = build_studio360_start_queue(
        existing_proofs,
        next_proofs,
        repair_action_queue,
        repair_start_here,
        limit,
    )
    proof_runway = build_studio360_proof_runway(
        proof_review_ladder,
        studio360_start_queue,
        next_proofs,
        repair_tickets,
        full_render_gate,
        counts,
    )
    reframe_export_runway = build_reframe_export_runway(
        export_candidate,
        proof_review_ladder,
        next_proofs,
        repair_tickets,
        full_render_gate,
        counts,
        limit,
    )
    counts["studio360StartQueueRows"] = len(studio360_start_queue)
    counts["proofReviewLadderRows"] = len(proof_review_ladder)
    proof_runway_counts = proof_runway.get("counts") if isinstance(proof_runway.get("counts"), dict) else {}
    reframe_export_runway_counts = reframe_export_runway.get("counts") if isinstance(reframe_export_runway.get("counts"), dict) else {}
    counts["studio360ProofRunwayRows"] = safe_int(proof_runway_counts.get("proofRows"))
    counts["studio360ProofRunwayRepairRows"] = safe_int(proof_runway_counts.get("repairRows"))
    counts["studio360ReframeExportRunwayRows"] = safe_int(reframe_export_runway_counts.get("runwayRows"))
    counts["studio360ReframeExportReadyRows"] = safe_int(reframe_export_runway_counts.get("readyRows"))
    counts["studio360ReframeExportBlockedRows"] = safe_int(reframe_export_runway_counts.get("blockedRows"))
    counts["studio360SourceRoutingCards"] = safe_int((source_routing_cards.get("counts") or {}).get("cards"))
    counts["studio360RenderDryRunCards"] = safe_int((render_dry_run_cards.get("counts") or {}).get("cards"))
    counts["fullRenderGateNeedsHumanApproval"] = full_render_gate["humanApprovalRequired"]

    first_path = str(out_dir / "index.html")
    first_safe_action = {
        "label": "Open Studio360 proof control room",
        "command": f"open {shell_quote(first_path)}",
        "path": first_path,
        "safety": "Opens local 360 evidence only. No render, export, upload, publish, schedule, delete, overwrite, repair, account mutation, or original-media mutation occurs.",
    }

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "studio360Root": str(root),
        "sessionDir": str(out_dir),
        "counts": counts,
        "firstSafeAction": first_safe_action,
        "humanAsk": "Open the control room and choose exactly one next 360 action: inspect an existing proof, run one short proof if warranted, or resolve/park a blocker.",
        "agentSafeParallelWork": "Codex can summarize proof evidence, improve review packets, prepare missing-media tasks, and regenerate local boards. Do not render, mutate originals, publish, upload, schedule, delete, overwrite, or fabricate receipts.",
        "nextSafestAction": next_action,
        "proofControlProtocol": [
            "Start with existing proof outputs if any exist.",
            "If no reviewed proof exists, run at most one short proof command only when the source and recipe are correct.",
            "Repair/proxy/damaged-source blockers come before trusting full export plans, but they should not freeze ready proof/reframe work.",
            "Full render approval is separate from proof readiness.",
            "Publication receipt truth is separate from local export readiness.",
        ],
        "proofLoop": proof_loop,
        "proofSprintLoop": proof_sprint_loop,
        "aspectPairRows": paired_proofs,
        "proofRunway": proof_runway,
        "reframeExportRunway": reframe_export_runway,
        "sourceRoutingCards": source_routing_cards,
        "renderDryRunCards": render_dry_run_cards,
        "studio360StartQueue": studio360_start_queue,
        "proofReviewLadder": proof_review_ladder,
        "fullRenderGate": full_render_gate,
        "readyContinuationPlan": ready_continuation_plan,
        "reviewChecklist": [
            "Is the subject framed well in 16:9 and 9:16?",
            "Does horizon/roll feel intentional rather than accidentally tilted?",
            "Does the reframe movement feel calm and watchable?",
            "Does crop/zoom preserve faces, hands, captions, and key action?",
            "Is audio present and appropriate for this proof?",
            "Is the proof using the expected source/proxy rather than parked or mystery media?",
        ],
        "cards": cards,
        "existingProofRows": existing_proofs,
        "nextProofRows": next_proofs,
        "repairStartHere": repair_start_here,
        "repairLaneBoundary": effective_repair_lane_boundary,
        "operatorRecopyChecklist": operator_recopy_checklist[:limit],
        "repairActionQueue": repair_action_queue[:limit],
        "repairTickets": repair_tickets[:limit],
        "sourcePointers": {
            key: {
                "pointerPath": pointer_paths[key],
                "htmlPath": loaded[key].get("htmlPath") or "",
                "jsonPath": loaded[key].get("jsonPath") or loaded[key].get("packetPath") or "",
                "status": loaded[key].get("status") or "",
            }
            for key in POINTERS
        },
        "truth": {
            "description": "Studio360 proof control room only. It reads local evidence and writes versioned guidance.",
            "rendererCommandsExecuted": False,
            "exportsCreated": False,
            "fullRenderCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceMediaMutated": False,
        },
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["id", "title", "status", "severity", "nextSafestAction", "humanAsk", "agentSafeParallelWork", "htmlPath", "jsonPath", "firstSafeCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for card in payload.get("cards") or []:
            first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
            writer.writerow({
                "id": card.get("id"),
                "title": card.get("title"),
                "status": card.get("status"),
                "severity": card.get("severity"),
                "nextSafestAction": card.get("nextSafestAction"),
                "humanAsk": card.get("humanAsk"),
                "agentSafeParallelWork": card.get("agentSafeParallelWork"),
                "htmlPath": card.get("htmlPath"),
                "jsonPath": card.get("jsonPath"),
                "firstSafeCommand": first.get("command", ""),
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio360 proof control room",
        "",
        f"Generated: `{payload['generatedAt']}`",
        f"Status: `{payload['status']}`",
        "",
        payload["truth"]["description"],
        "",
        f"Next safest action: {payload['nextSafestAction']}",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    proof_runway = payload.get("proofRunway") if isinstance(payload.get("proofRunway"), dict) else {}
    lines.extend(["", "## Proof runway", "", proof_runway.get("plainEnglish", ""), ""])
    lines.append(f"- First move: {proof_runway.get('firstMove', '')}")
    lines.append(f"- Open: `{proof_runway.get('firstOpenCommand', '')}`")
    lines.append(f"- Truth: {proof_runway.get('truth', '')}")
    for row in proof_runway.get("rows") or []:
        if not isinstance(row, dict):
            continue
        decisions = ", ".join(str(item) for item in (row.get("allowedLocalDecisions") if isinstance(row.get("allowedLocalDecisions"), list) else []))
        lines.extend([
            "",
            f"### {row.get('rank')}. {row.get('phase')}",
            "",
            f"- Candidate: `{row.get('candidateId')}`",
            f"- Group: `{row.get('groupKey')}`",
            f"- Aspect: `{row.get('aspect')}`",
            f"- Status: `{row.get('status')}`",
            f"- Allowed local decisions: `{decisions}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
            "```bash",
            str(row.get("openCommand") or ""),
            "```",
        ])
    repairs = proof_runway.get("repairParkingLot") if isinstance(proof_runway.get("repairParkingLot"), list) else []
    if repairs:
        lines.extend(["", "### Repair parking lot", ""])
        for row in repairs:
            if isinstance(row, dict):
                lines.append(f"- `{row.get('groupKey')}` `{row.get('status')}` - {row.get('nextSafestAction')} `{row.get('openCommand')}`")
    source_deck = payload.get("sourceRoutingCards") if isinstance(payload.get("sourceRoutingCards"), dict) else {}
    if source_deck:
        lines.extend([
            "",
            "## Source routing cards",
            "",
            f"Path: `{payload.get('sourceRoutingCardsPath', '')}`",
            "",
            source_deck.get("truth", ""),
            "",
        ])
        for card in (source_deck.get("cards") if isinstance(source_deck.get("cards"), list) else [])[:6]:
            if not isinstance(card, dict):
                continue
            lines.extend([
                f"### {card.get('rank')}. {card.get('groupKey')} - {card.get('route')}",
                "",
                f"- Status: `{card.get('status')}`",
                f"- Kinds: `{', '.join(str(kind) for kind in (card.get('kinds') if isinstance(card.get('kinds'), list) else []))}`",
                f"- Original/companion/proxy: `{card.get('originalCount')}` / `{card.get('companionCount')}` / `{card.get('proxyCount')}`",
                f"- Next: {card.get('nextSafestAction')}",
                f"- Human question: {card.get('humanQuestion')}",
                f"- Codex safe move: {card.get('codexSafeMove')}",
                "",
                "```bash",
                str(card.get("openSourceCommand") or card.get("sourceDeskCommand") or ""),
                "```",
                "",
                f"Safety: {card.get('truth')}",
                "",
            ])
    dry_run_deck = payload.get("renderDryRunCards") if isinstance(payload.get("renderDryRunCards"), dict) else {}
    if dry_run_deck:
        lines.extend([
            "",
            "## Render dry-run cards",
            "",
            f"Path: `{payload.get('renderDryRunCardsPath', '')}`",
            "",
            dry_run_deck.get("truth", ""),
            "",
        ])
        for card in (dry_run_deck.get("cards") if isinstance(dry_run_deck.get("cards"), list) else [])[:6]:
            if not isinstance(card, dict):
                continue
            blocked = ", ".join(str(item) for item in (card.get("notAllowedYet") if isinstance(card.get("notAllowedYet"), list) else []))
            lines.extend([
                f"### {card.get('rank')}. {card.get('candidateId')} - {card.get('route')}",
                "",
                f"- Group/aspect/version: `{card.get('groupKey')}` `{card.get('aspect')}` `{card.get('version')}`",
                f"- Status: `{card.get('status')}`",
                f"- Proof gate: {card.get('proofGate')}",
                f"- Full render gate: {card.get('fullRenderGate')}",
                f"- Not allowed yet: `{blocked}`",
                f"- Next: {card.get('nextSafestAction')}",
                f"- Human question: {card.get('humanQuestion')}",
                f"- Codex safe move: {card.get('codexSafeMove')}",
                "",
                "```bash",
                str(card.get("openRendererPreflightCommand") or card.get("dryRunCommand") or ""),
                "```",
                "",
                f"Safety: {card.get('truth')}",
                "",
            ])
    lines.extend(["", "## Start here: one 360 action", ""])
    for row in payload.get("studio360StartQueue") or []:
        if not isinstance(row, dict):
            continue
        lines.extend([
            f"### {row.get('queueRank')}. {row.get('label')}",
            "",
            f"- Type: `{row.get('kind')}`",
            f"- Title: `{row.get('title')}`",
            f"- Status: `{row.get('status')}`",
            f"- Why: {row.get('why')}",
            f"- Human decision: {row.get('humanDecision')}",
            f"- Codex can: {row.get('codexCanDo')}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
            "```bash",
            str(row.get("safeCommand") or ""),
            "```",
            "",
            f"Safety: {row.get('safety')}",
            "",
        ])
    sprint_loop = payload.get("proofSprintLoop") if isinstance(payload.get("proofSprintLoop"), dict) else {}
    pair_rows = payload.get("aspectPairRows") if isinstance(payload.get("aspectPairRows"), list) else []
    if sprint_loop or pair_rows:
        lines.extend([
            "",
            "## One source, two proofs",
            "",
        ])
        if sprint_loop:
            lines.extend([
                f"Name: {sprint_loop.get('name')}",
                "",
                f"Goal: {sprint_loop.get('goal')}",
                "",
                f"Why: {sprint_loop.get('whyItExists')}",
                "",
                f"Done when: {sprint_loop.get('doneWhen')}",
                "",
                f"Agent use: {sprint_loop.get('agentUse')}",
                "",
                f"Truth: {sprint_loop.get('truth')}",
                "",
                "Do not do:",
            ])
            for item in sprint_loop.get("doNotDo") or []:
                lines.append(f"- {item}")
            lines.append("")
        for row in pair_rows:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"### {row.get('rank')}. {row.get('groupKey')} - {row.get('status')}",
                "",
                f"- Source: `{row.get('sourcePath')}`",
                f"- Duration: `{row.get('sequenceDurationSeconds')}`",
                f"- 16:9: `{row.get('wideCandidateId')}` exists=`{row.get('wideOutputExists')}` planned=`{row.get('wideProposedOutputPath')}` playable=`{row.get('wideProofPath')}`",
                f"- 9:16: `{row.get('verticalCandidateId')}` exists=`{row.get('verticalOutputExists')}` planned=`{row.get('verticalProposedOutputPath')}` playable=`{row.get('verticalProofPath')}`",
                f"- Next: {row.get('nextSafestAction')}",
                "",
                "Wide proof command:",
                "",
                "```bash",
                str(row.get("wideProofCommand") or ""),
                "```",
                "",
                "Vertical proof command:",
                "",
                "```bash",
                str(row.get("verticalProofCommand") or ""),
                "```",
                "",
                f"Safety: {row.get('truth')}",
                "",
            ])
    gate = payload.get("fullRenderGate") if isinstance(payload.get("fullRenderGate"), dict) else {}
    if gate:
        lines.extend([
            "",
            "## Full render gate",
            "",
            f"- State: `{gate.get('state')}`",
            f"- Message: {gate.get('message')}",
            f"- Human approval required: `{gate.get('humanApprovalRequired')}`",
            f"- Receipt truth created: `{gate.get('receiptTruthCreated')}`",
            f"- Next safest action: {gate.get('nextSafestAction')}",
            "",
            "Requirements before full render:",
        ])
        for item in gate.get("requirements") or []:
            lines.append(f"- {item}")
        lines.extend(["", "Do not do:"])
        for item in gate.get("doNotDo") or []:
            lines.append(f"- {item}")
    lines.extend(["", "## Proof review ladder", ""])
    for row in payload.get("proofReviewLadder") or []:
        if not isinstance(row, dict):
            continue
        decisions = ", ".join(str(item) for item in row.get("decisionOptions") or [])
        lines.extend([
            f"### {row.get('ladderRank')}. {row.get('label')}",
            "",
            f"- Type: `{row.get('kind')}`",
            f"- Candidate: `{row.get('candidateId')}`",
            f"- Group: `{row.get('groupKey')}`",
            f"- Aspect: `{row.get('aspect')}`",
            f"- Status: `{row.get('status')}`",
            f"- Decisions: {decisions}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
            "Look for:",
            *[f"- {item}" for item in row.get("lookFor") or []],
            "",
            "```bash",
            str(row.get("safeCommand") or ""),
            "```",
            "",
            f"Safety: {row.get('safety')}",
            "",
        ])
    lines.extend(["", "## Proof loop", ""])
    for step in payload.get("proofLoop") or []:
        lines.append(f"- {step.get('step')}. {step.get('label')}: `{step.get('command')}`")
        lines.append(f"  - Done when: {step.get('doneWhen')}")
        lines.append(f"  - Safety: {step.get('safety')}")
    ready_plan = payload.get("readyContinuationPlan") if isinstance(payload.get("readyContinuationPlan"), dict) else {}
    if ready_plan:
        lines.extend([
            "",
            "## Ready continuation plan",
            "",
            ready_plan.get("headline", ""),
            "",
            ready_plan.get("plainEnglish", ""),
            "",
        ])
        for step in ready_plan.get("steps") or []:
            if not isinstance(step, dict):
                continue
            lines.extend([
                f"- {step.get('label')}: `{step.get('command')}`",
                f"  - Done when: {step.get('doneWhen')}",
                f"  - Safety: {step.get('safety')}",
            ])
        lines.append("")
        lines.append("Do not do:")
        for item in ready_plan.get("doNotDo") or []:
            lines.append(f"- {item}")
    lines.extend(["", "## Open first", "", "```bash", payload["firstSafeAction"]["command"], "```", "", "## Control cards", ""])
    for card in payload.get("cards") or []:
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        lines.extend([
            f"### {card.get('title')}",
            "",
            f"- Status: `{card.get('status')}`",
            f"- Severity: `{card.get('severity')}`",
            f"- Next: {card.get('nextSafestAction')}",
            f"- Human ask: {card.get('humanAsk')}",
            f"- Codex can: {card.get('agentSafeParallelWork')}",
            "",
            "```bash",
            str(first.get("command") or ""),
            "```",
            "",
        ])
    lines.extend(["## Existing proof outputs", ""])
    for row in payload.get("existingProofRows") or []:
        lines.extend([
            f"- `{row.get('aspect')}` `{row.get('candidateId')}` exists=`{row.get('outputExists')}` duration=`{row.get('durationSeconds')}` path=`{row.get('outputPath')}`",
        ])
    lines.extend(["", "## Next proof candidates", ""])
    for row in payload.get("nextProofRows") or []:
        lines.extend([
            f"- `{row.get('aspect')}` `{row.get('candidateId')}` status=`{row.get('status')}`",
            "  ```bash",
            f"  {row.get('proofCommand') or ''}",
            "  ```",
        ])
    lines.extend(["", "## Repair blocker tickets", ""])
    start = payload.get("repairStartHere") if isinstance(payload.get("repairStartHere"), dict) else {}
    if start:
        lines.extend([
            "### Start here",
            "",
            f"- Group: `{start.get('groupKey') or 'none'}`",
            f"- Task: {start.get('label')}",
            f"- Human action: {start.get('humanAction')}",
            f"- Codex-safe action: {start.get('codexSafeAction')}",
            "",
            "```bash",
            str(start.get("openEvidenceCommand") or ""),
            "```",
            "",
            "Reveal commands when evidence is missing:",
            "",
            *[f"- `{command}`" for command in start.get("revealCommands") or []],
            "",
        ])
    lane_boundary = payload.get("repairLaneBoundary") if isinstance(payload.get("repairLaneBoundary"), dict) else {}
    if lane_boundary:
        lines.extend([
            "### Lane boundary",
            "",
            f"- Blocked repair groups: `{lane_boundary.get('blockedRepairGroups')}`",
            f"- Ready groups can continue: `{lane_boundary.get('readyGroupsCanContinue')}`",
            f"- Ready render recipes can continue: `{lane_boundary.get('readyRenderRecipesCanContinue')}`",
            f"- Human message: {lane_boundary.get('humanMessage')}",
            f"- Codex-safe parallel work: {lane_boundary.get('codexSafeParallelWork')}",
            f"- Do not do: {lane_boundary.get('doNotDo')}",
            "",
        ])
    operator_rows = payload.get("operatorRecopyChecklist") if isinstance(payload.get("operatorRecopyChecklist"), list) else []
    if operator_rows:
        lines.extend(["### Operator recopy checklist", ""])
        for row in operator_rows:
            if isinstance(row, dict):
                lines.extend([
                    f"- `{row.get('groupKey')}` `{row.get('status')}` - {row.get('humanAction')}",
                    f"  - `{row.get('openOperatorPacketCommand') or 'no operator packet command'}`",
                ])
        lines.append("")
    for row in payload.get("repairActionQueue") or []:
        if isinstance(row, dict):
            lines.extend([
                f"### P{row.get('priority')} - {row.get('groupKey')} - {row.get('label')}",
                "",
                f"- Status: `{row.get('status')}`",
                f"- Human: {row.get('humanAction')}",
                f"- Codex: {row.get('codexSafeAction')}",
                f"- Evidence present: `{row.get('repairEvidencePresent')}`",
                "",
            ])
    for ticket in payload.get("repairTickets") or []:
        if not isinstance(ticket, dict):
            continue
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        lines.extend([
            f"### {ticket.get('groupKey')}",
            "",
            f"- Status: `{classification.get('status') or ticket.get('reframeStatus') or 'review'}`",
            f"- Reason: {classification.get('reason') or 'Repair evidence needs review.'}",
            f"- Next: {ticket.get('nextSafestAction') or classification.get('nextSafestAction') or 'Inspect repair evidence.'}",
            f"- Evidence present: `{ticket.get('repairEvidencePresent')}`",
            f"- Evidence: `{ticket.get('repairEvidenceMarkdown') or ticket.get('repairEvidenceJson') or 'none yet'}`",
            "",
            "Damaged sources:",
        ])
        for asset in ticket.get("damagedAssets") or []:
            if isinstance(asset, dict):
                lines.append(f"- `{asset.get('sourcePath')}` - `{asset.get('kind')}` - {asset.get('error')}")
        lines.extend(["", "Safe commands:", ""])
        for command in ticket.get("safeLocalCommands") or []:
            if isinstance(command, dict):
                lines.append(f"- `{command.get('command')}` - {command.get('safety')}")
        lines.append("")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_proof_runway_markdown(path: Path, payload: dict[str, Any]) -> None:
    proof_runway = payload.get("proofRunway") if isinstance(payload.get("proofRunway"), dict) else {}
    rows = proof_runway.get("rows") if isinstance(proof_runway.get("rows"), list) else []
    repairs = proof_runway.get("repairParkingLot") if isinstance(proof_runway.get("repairParkingLot"), list) else []
    lines = [
        "# Studio360 proof runway",
        "",
        "> Local 360 proof guidance only. This does not render, full-export, repair, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
        "",
        f"Generated: `{payload.get('generatedAt', '')}`",
        f"Status: `{payload.get('status', '')}`",
        f"First move: {proof_runway.get('firstMove', '')}",
        "",
        "```bash",
        str(proof_runway.get("firstOpenCommand") or ""),
        "```",
        "",
        proof_runway.get("plainEnglish", ""),
        "",
        "## Proof/review order",
        "",
    ]
    for row in rows:
        if not isinstance(row, dict):
            continue
        allowed = ", ".join(str(item) for item in (row.get("allowedLocalDecisions") if isinstance(row.get("allowedLocalDecisions"), list) else []))
        blocked = ", ".join(str(item) for item in (row.get("notAllowedYet") if isinstance(row.get("notAllowedYet"), list) else []))
        lines.extend([
            f"### {row.get('rank')}. {row.get('phase')}",
            "",
            f"- Candidate: `{row.get('candidateId', '')}`",
            f"- Group: `{row.get('groupKey', '')}`",
            f"- Aspect: `{row.get('aspect', '')}`",
            f"- Status: `{row.get('status', '')}`",
            f"- Allowed local decisions: `{allowed}`",
            f"- Not allowed yet: `{blocked}`",
            f"- Next safest action: {row.get('nextSafestAction', '')}",
            "",
            "Open evidence:",
            "",
            "```bash",
            str(row.get("openCommand") or ""),
            "```",
            "",
            "Look for:",
        ])
        for item in row.get("lookFor") if isinstance(row.get("lookFor"), list) else []:
            lines.append(f"- [ ] {item}")
        lines.extend(["", f"Safety: {row.get('safety', '')}", ""])
    if repairs:
        lines.extend(["", "## Repair parking lot", ""])
        for row in repairs:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"### {row.get('groupKey', '')}",
                "",
                f"- Status: `{row.get('status', '')}`",
                f"- Damaged assets: `{row.get('damagedAssets', 0)}`",
                f"- Reason: {row.get('reason', '')}",
                f"- Next safest action: {row.get('nextSafestAction', '')}",
                "",
                "```bash",
                str(row.get("openCommand") or ""),
                "```",
                "",
                f"Safety: {row.get('safety', '')}",
                "",
            ])
    gate = proof_runway.get("fullRenderGate") if isinstance(proof_runway.get("fullRenderGate"), dict) else {}
    lines.extend([
        "## Full render boundary",
        "",
        f"- State: `{gate.get('state', '')}`",
        f"- Human approval required: `{gate.get('humanApprovalRequired', '')}`",
        f"- Message: {gate.get('message', '')}",
        f"- Next safest action: {gate.get('nextSafestAction', '')}",
        "",
        "## Explicit non-claims",
        "",
        "- This runway did not render a proof.",
        "- This runway did not create a full export.",
        "- This runway did not repair or mutate source media.",
        "- This runway did not upload, publish, schedule, or create receipts.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_reframe_export_runway_markdown(path: Path, payload: dict[str, Any]) -> None:
    runway = payload.get("reframeExportRunway") if isinstance(payload.get("reframeExportRunway"), dict) else {}
    counts = runway.get("counts") if isinstance(runway.get("counts"), dict) else {}
    lines = [
        "# Studio360 reframe/export runway",
        "",
        "> Local 360 reframe/export guidance only. This does not render, full-export, repair, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
        "",
        runway.get("headline", ""),
        "",
        runway.get("plainEnglish", ""),
        "",
        "## Current truth",
        "",
        f"- Candidate rows: `{counts.get('candidateRows', 0)}`",
        f"- Ready rows: `{counts.get('readyRows', 0)}`",
        f"- Blocked rows: `{counts.get('blockedRows', 0)}`",
        f"- Existing proof outputs: `{counts.get('proofOutputsPresent', 0)}`",
        f"- Rendered full export files present: `{counts.get('renderedFilesPresent', 0)}`",
        f"- Full render created: `{counts.get('fullRenderCreated', False)}`",
        f"- Renderer commands executed: `{counts.get('rendererCommandsExecuted', False)}`",
        f"- Originals mutated: `{counts.get('originalsMutated', False)}`",
        "",
        "## Gates",
        "",
    ]
    for gate in runway.get("gates") or []:
        lines.append(f"- {gate}")
    lines.extend([
        "",
        "## Ready candidate rows",
        "",
    ])
    for row in runway.get("rows") or []:
        if not isinstance(row, dict):
            continue
        lines.extend([
            f"### {row.get('rank')}. {row.get('candidateId')}",
            "",
            f"- Group/aspect/version: `{row.get('groupKey')}` `{row.get('aspect')}` `{row.get('version')}`",
            f"- Duration: `{row.get('sequenceDurationSeconds')}` seconds",
            f"- Keyframes: `{row.get('keyframeCount')}`",
            f"- Review source: `{row.get('reviewSourcePath')}`",
            f"- Future render source: `{row.get('futureRenderSourcePath')}`",
            f"- Proposed proof output: `{row.get('proposedProofOutputPath')}`",
            f"- Proposed full output: `{row.get('proposedOutputPath')}`",
            f"- Proof gate: {row.get('proofGate')}",
            f"- Full render gate: {row.get('fullRenderGate')}",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Truth: {row.get('truth')}",
            "",
        ])
    lines.extend(["## Existing proof review rows", ""])
    for row in runway.get("proofReviewRows") or []:
        if not isinstance(row, dict):
            continue
        lines.extend([
            f"- `{row.get('candidateId')}` `{row.get('aspect')}` status=`{row.get('status')}`",
            f"  - Decision needed: {row.get('decisionNeeded')}",
            f"  - Open: `{row.get('openCommand')}`",
        ])
    lines.extend(["", "## Next proof rows", ""])
    for row in runway.get("nextProofRows") or []:
        if not isinstance(row, dict):
            continue
        lines.extend([
            f"- `{row.get('candidateId')}` `{row.get('aspect')}` proofSeconds=`{row.get('proofSeconds')}`",
            f"  - Command: `{row.get('proofCommand')}`",
            f"  - Next: {row.get('nextSafestAction')}",
        ])
    repairs = runway.get("repairRows") if isinstance(runway.get("repairRows"), list) else []
    if repairs:
        lines.extend(["", "## Repair rows", ""])
        for row in repairs:
            if not isinstance(row, dict):
                continue
            lines.extend([
                f"- `{row.get('groupKey')}` status=`{row.get('status')}`",
                f"  - Why: {row.get('reason')}",
                f"  - Next: {row.get('nextSafestAction')}",
                f"  - Truth: {row.get('truth')}",
            ])
    gate = runway.get("fullRenderGate") if isinstance(runway.get("fullRenderGate"), dict) else {}
    lines.extend([
        "",
        "## Full render boundary",
        "",
        f"- State: `{gate.get('state', '')}`",
        f"- Message: {gate.get('message', '')}",
        f"- Human approval required: `{gate.get('humanApprovalRequired', True)}`",
        f"- Next: {gate.get('nextSafestAction', '')}",
        "",
        "## Truth",
        "",
        runway.get("truth", ""),
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_source_routing_cards_markdown(path: Path, payload: dict[str, Any]) -> None:
    deck = payload.get("sourceRoutingCards") if isinstance(payload.get("sourceRoutingCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    counts = deck.get("counts") if isinstance(deck.get("counts"), dict) else {}
    lines = [
        "# Studio360 source routing cards",
        "",
        "> Local 360 source/proxy/companion routing only. This does not generate proxies, render, full-export, repair, upload, publish, schedule, mutate source media, write metadata, overwrite versions, delete files, or create receipts.",
        "",
        f"Generated: `{payload.get('generatedAt', '')}`",
        f"Status: `{payload.get('status', '')}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in counts.items():
        lines.append(f"- {key}: `{value}`")
    lines.extend([
        "",
        "## Allowed local actions",
        "",
    ])
    for action in deck.get("allowedLocalActions") if isinstance(deck.get("allowedLocalActions"), list) else []:
        lines.append(f"- {action}")
    lines.extend(["", "## Do not do", ""])
    for item in deck.get("doNotDo") if isinstance(deck.get("doNotDo"), list) else []:
        lines.append(f"- {item}")
    lines.extend(["", "## Cards", ""])
    for card in cards:
        if not isinstance(card, dict):
            continue
        kinds = ", ".join(str(kind) for kind in (card.get("kinds") if isinstance(card.get("kinds"), list) else []))
        source_paths = card.get("sourcePaths") if isinstance(card.get("sourcePaths"), list) else []
        lines.extend([
            f"### {card.get('rank')}. {card.get('groupKey')} - {card.get('route')}",
            "",
            f"- Status: `{card.get('status')}`",
            f"- Label: {card.get('label')}",
            f"- Kinds: `{kinds}`",
            f"- Asset count: `{card.get('assetCount')}`",
            f"- Duration: `{card.get('durationSeconds')}` seconds",
            f"- Original/companion/proxy: `{card.get('originalCount')}` / `{card.get('companionCount')}` / `{card.get('proxyCount')}`",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex safe move: {card.get('codexSafeMove')}",
            f"- Next safest action: {card.get('nextSafestAction')}",
            "",
            "Open source:",
            "",
            "```bash",
            str(card.get("openSourceCommand") or card.get("sourceDeskCommand") or ""),
            "```",
            "",
            "Evidence note:",
            "",
            "```yaml",
            str(card.get("localEvidenceNoteYaml") or ""),
            "```",
            "",
            f"Candidate proxy prep command, not auto-approved: `{card.get('candidateProxyPrepCommand')}`",
            f"Candidate safety: {card.get('candidateProxyPrepSafety')}",
            "",
            "Source paths:",
        ])
        for source_path in source_paths:
            lines.append(f"- `{source_path}`")
        damaged = card.get("damagedAssets") if isinstance(card.get("damagedAssets"), list) else []
        if damaged:
            lines.extend(["", "Damaged evidence:"])
            for asset in damaged:
                if isinstance(asset, dict):
                    lines.append(f"- `{asset.get('filename')}` - {asset.get('error')} - `{asset.get('sourcePath')}`")
        lines.extend(["", f"Truth: {card.get('truth')}", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_render_dry_run_cards_markdown(path: Path, payload: dict[str, Any]) -> None:
    deck = payload.get("renderDryRunCards") if isinstance(payload.get("renderDryRunCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    counts = deck.get("counts") if isinstance(deck.get("counts"), dict) else {}
    lines = [
        "# Studio360 render dry-run cards",
        "",
        "> Local 360 render-candidate guidance only. This does not execute renderer commands, create proof output, create full exports, upload, publish, schedule, mutate source media, overwrite versions, delete files, or create receipts.",
        "",
        f"Generated: `{payload.get('generatedAt', '')}`",
        f"Status: `{payload.get('status', '')}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in counts.items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Allowed local actions", ""])
    for action in deck.get("allowedLocalActions") if isinstance(deck.get("allowedLocalActions"), list) else []:
        lines.append(f"- {action}")
    lines.extend(["", "## Do not do", ""])
    for item in deck.get("doNotDo") if isinstance(deck.get("doNotDo"), list) else []:
        lines.append(f"- {item}")
    lines.extend(["", "## Cards", ""])
    for card in cards:
        if not isinstance(card, dict):
            continue
        blocked = ", ".join(str(item) for item in (card.get("notAllowedYet") if isinstance(card.get("notAllowedYet"), list) else []))
        reasons = ", ".join(str(item) for item in (card.get("renderRiskReasons") if isinstance(card.get("renderRiskReasons"), list) else []))
        lines.extend([
            f"### {card.get('rank')}. {card.get('candidateId')} - {card.get('route')}",
            "",
            f"- Recipe: `{card.get('recipeId')}`",
            f"- Group/aspect/version: `{card.get('groupKey')}` `{card.get('aspect')}` `{card.get('version')}`",
            f"- Status: `{card.get('status')}`",
            f"- Duration/keyframes: `{card.get('sequenceDurationSeconds')}` seconds / `{card.get('keyframeCount')}`",
            f"- Proof exists: `{card.get('proofExists')}`",
            f"- Render risk: `{card.get('renderRisk')}` {reasons}",
            f"- Review source: `{card.get('reviewSourcePath')}`",
            f"- Future render source: `{card.get('futureRenderSourcePath')}`",
            f"- Proposed proof output: `{card.get('proposedProofOutputPath')}`",
            f"- Proposed full output: `{card.get('proposedOutputPath')}`",
            f"- Proof gate: {card.get('proofGate')}",
            f"- Full render gate: {card.get('fullRenderGate')}",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex safe move: {card.get('codexSafeMove')}",
            f"- Next safest action: {card.get('nextSafestAction')}",
            f"- Not allowed yet: `{blocked}`",
            "",
            "Open renderer preflight:",
            "",
            "```bash",
            str(card.get("openRendererPreflightCommand") or card.get("dryRunCommand") or ""),
            "```",
            "",
            "Open review source:",
            "",
            "```bash",
            str(card.get("openReviewSourceCommand") or ""),
            "```",
            "",
            "Evidence note:",
            "",
            "```yaml",
            str(card.get("renderDryRunNoteYaml") or ""),
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards_html = []
    for card in payload.get("cards") or []:
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        cards_html.append(f"""
        <article class="card {esc(card.get('severity'))}">
          <p class="eyebrow">{esc(card.get('severity'))}</p>
          <h2>{esc(card.get('title'))}</h2>
          <p><strong>Status:</strong> {esc(card.get('status'))}</p>
          <p>{esc(card.get('plainEnglish'))}</p>
          <p><strong>Next:</strong> {esc(card.get('nextSafestAction'))}</p>
          <p><strong>Human:</strong> {esc(card.get('humanAsk'))}</p>
          <p><strong>Codex:</strong> {esc(card.get('agentSafeParallelWork'))}</p>
          <pre>{esc(first.get('command'))}</pre>
        </article>
        """)
    existing_html = []
    for row in payload.get("existingProofRows") or []:
        uri = file_uri(str(row.get("outputPath") or ""))
        media = f'<video controls src="{esc(uri)}"></video>' if uri and row.get("outputExists") else '<div class="missing">No playable local proof output found.</div>'
        existing_html.append(f"""
        <article class="proof">
          <div><span>{esc(row.get('aspect'))}</span><strong>{esc(row.get('candidateId'))}</strong></div>
          {media}
          <p>{esc(row.get('durationSeconds'))}s · {esc(row.get('frame'))} · audio {esc(row.get('audioCodec'))}</p>
          <pre>{esc(row.get('openCommand'))}</pre>
        </article>
        """)
    next_html = []
    for row in payload.get("nextProofRows") or []:
        next_html.append(f"""
        <article class="nextproof">
          <p class="eyebrow">{esc(row.get('aspect'))}</p>
          <h3>{esc(row.get('candidateId'))}</h3>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <pre>{esc(row.get('proofCommand'))}</pre>
        </article>
        """)
    repair_html = []
    start = payload.get("repairStartHere") if isinstance(payload.get("repairStartHere"), dict) else {}
    lane_boundary = payload.get("repairLaneBoundary") if isinstance(payload.get("repairLaneBoundary"), dict) else {}
    operator_recopy_html = []
    for row in payload.get("operatorRecopyChecklist") or []:
        if not isinstance(row, dict):
            continue
        reveals = "".join(f"<code>{esc(command)}</code>" for command in row.get("revealCommands") or []) or "<p>No reveal commands available.</p>"
        operator_recopy_html.append(f"""
        <article class="repair-queue-card">
          <p class="eyebrow">operator recopy checklist</p>
          <h3>{esc(row.get('groupKey'))}</h3>
          <p><strong>Status:</strong> {esc(row.get('status'))}</p>
          <p><strong>Human:</strong> {esc(row.get('humanAction'))}</p>
          <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
          <pre>{esc(row.get('openOperatorPacketCommand') or 'No operator packet command available.')}</pre>
          <div class="repair-command">{reveals}</div>
        </article>
        """)
    repair_queue_html = []
    for row in payload.get("repairActionQueue") or []:
        if not isinstance(row, dict):
            continue
        repair_queue_html.append(f"""
        <article class="repair-queue-card">
          <p class="eyebrow">priority {esc(row.get('priority'))}</p>
          <h3>{esc(row.get('groupKey'))}</h3>
          <p><strong>{esc(row.get('label'))}</strong></p>
          <p><strong>Human:</strong> {esc(row.get('humanAction'))}</p>
          <p><strong>Codex:</strong> {esc(row.get('codexSafeAction'))}</p>
          <pre>{esc(row.get('openEvidenceCommand') or 'No evidence packet yet; inspect damaged source paths first.')}</pre>
        </article>
        """)
    for ticket in payload.get("repairTickets") or []:
        if not isinstance(ticket, dict):
            continue
        classification = ticket.get("classification") if isinstance(ticket.get("classification"), dict) else {}
        damaged = "".join(
            f"<li><code>{esc(asset.get('sourcePath'))}</code><span>{esc(asset.get('kind'))}</span><p>{esc(asset.get('error'))}</p></li>"
            for asset in ticket.get("damagedAssets") or []
            if isinstance(asset, dict)
        ) or "<li>No damaged source rows carried.</li>"
        commands = "".join(
            f"<div class=\"repair-command\"><strong>{esc(command.get('label'))}</strong><pre>{esc(command.get('command'))}</pre><p>{esc(command.get('safety'))}</p></div>"
            for command in ticket.get("safeLocalCommands") or []
            if isinstance(command, dict)
        ) or "<p>No command is safe until evidence exists.</p>"
        repair_html.append(f"""
        <article class="repair-ticket">
          <p class="eyebrow">Repair blocker</p>
          <h3>{esc(ticket.get('groupKey'))}</h3>
          <p><strong>Status:</strong> {esc(classification.get('status') or ticket.get('reframeStatus') or 'review')}</p>
          <p>{esc(classification.get('reason') or 'Repair evidence needs review before this group can be trusted for export.')}</p>
          <p><strong>Next:</strong> {esc(ticket.get('nextSafestAction') or classification.get('nextSafestAction') or 'Inspect repair evidence.')}</p>
          <p><strong>Evidence present:</strong> {esc(ticket.get('repairEvidencePresent'))}</p>
          <h4>Damaged sources</h4>
          <ul class="damaged">{damaged}</ul>
          <h4>Safe local commands</h4>
          {commands}
        </article>
        """)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    count_html = "".join(f"<li><strong>{esc(k)}</strong><span>{esc(v)}</span></li>" for k, v in counts.items())
    protocol_html = "".join(f"<li>{esc(item)}</li>" for item in payload.get("proofControlProtocol") or [])
    checklist_html = "".join(f"<li>{esc(item)}</li>" for item in payload.get("reviewChecklist") or [])
    start_queue_html = "".join(
        f"""
        <article class="start-action {esc(row.get('kind'))}">
          <div class="queue-rank">{esc(row.get('queueRank'))}</div>
          <div>
            <p class="eyebrow">{esc(row.get('kind'))}</p>
            <h3>{esc(row.get('title'))}</h3>
            <p><strong>{esc(row.get('label'))}</strong> · {esc(row.get('status'))}</p>
            <p>{esc(row.get('why'))}</p>
            <p><strong>Human decision:</strong> {esc(row.get('humanDecision'))}</p>
            <p><strong>Codex can:</strong> {esc(row.get('codexCanDo'))}</p>
            <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
            <pre>{esc(row.get('safeCommand'))}</pre>
            <p class="muted">{esc(row.get('safety'))}</p>
          </div>
        </article>
        """
        for row in payload.get("studio360StartQueue") or []
        if isinstance(row, dict)
    )
    sprint_loop = payload.get("proofSprintLoop") if isinstance(payload.get("proofSprintLoop"), dict) else {}
    pair_contract_html = ""
    if sprint_loop:
        donts = "".join(f"<li>{esc(item)}</li>" for item in sprint_loop.get("doNotDo") or [])
        pair_contract_html = f"""
        <article class="pair-contract">
          <p class="eyebrow">Proof pair contract</p>
          <h3>{esc(sprint_loop.get('name'))}</h3>
          <p>{esc(sprint_loop.get('goal'))}</p>
          <p><strong>Why:</strong> {esc(sprint_loop.get('whyItExists'))}</p>
          <p><strong>Done when:</strong> {esc(sprint_loop.get('doneWhen'))}</p>
          <p><strong>Agent use:</strong> {esc(sprint_loop.get('agentUse'))}</p>
          <h4>Do not do</h4>
          <ul>{donts}</ul>
          <p class="muted">{esc(sprint_loop.get('truth'))}</p>
        </article>
        """
    pair_rows_html = "".join(
        f"""
        <article class="aspect-pair">
          <p class="eyebrow">source pair {esc(row.get('rank'))}</p>
          <h3>{esc(row.get('groupKey'))}</h3>
          <p><strong>Status:</strong> {esc(row.get('status'))} · <strong>Duration:</strong> {esc(row.get('sequenceDurationSeconds'))}s</p>
          <p><strong>Source:</strong> <code>{esc(row.get('sourcePath'))}</code></p>
          <div class="pair-videos">
            <div>
              <h4>16:9 {esc(row.get('wideCandidateId'))}</h4>
              {f'<video controls src="{esc(file_uri(str(row.get("wideProofPath") or "")))}"></video>' if row.get('wideOutputExists') else '<div class="missing">16:9 proof not present yet.</div>'}
              <pre>{esc(row.get('wideProofCommand'))}</pre>
            </div>
            <div>
              <h4>9:16 {esc(row.get('verticalCandidateId'))}</h4>
              {f'<video controls src="{esc(file_uri(str(row.get("verticalProofPath") or "")))}"></video>' if row.get('verticalOutputExists') else '<div class="missing">9:16 proof not present yet.</div>'}
              <pre>{esc(row.get('verticalProofCommand'))}</pre>
            </div>
          </div>
          <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
          <p class="muted">{esc(row.get('truth'))}</p>
        </article>
        """
        for row in payload.get("aspectPairRows") or []
        if isinstance(row, dict)
    )
    gate = payload.get("fullRenderGate") if isinstance(payload.get("fullRenderGate"), dict) else {}
    gate_requirements = "".join(f"<li>{esc(item)}</li>" for item in gate.get("requirements", [])) if gate else ""
    gate_donts = "".join(f"<li>{esc(item)}</li>" for item in gate.get("doNotDo", [])) if gate else ""
    full_render_gate_html = ""
    if gate:
        first = gate.get("firstProofReviewAction") if isinstance(gate.get("firstProofReviewAction"), dict) else {}
        full_render_gate_html = f"""
        <article class="gate-card">
          <p class="eyebrow">Full render gate</p>
          <h2>{esc(gate.get('state'))}</h2>
          <p>{esc(gate.get('message'))}</p>
          <p><strong>Human approval required:</strong> {esc(gate.get('humanApprovalRequired'))} · <strong>Receipt truth created:</strong> {esc(gate.get('receiptTruthCreated'))}</p>
          <p><strong>Next safest action:</strong> {esc(gate.get('nextSafestAction'))}</p>
          <pre>{esc(first.get('safeCommand') or '')}</pre>
          <h3>Requirements before full render</h3>
          <ol>{gate_requirements}</ol>
          <h3>Do not do</h3>
          <ul>{gate_donts}</ul>
        </article>
        """
    proof_ladder_html = "".join(
        f"""
        <article class="proof-ladder {esc(row.get('kind'))}">
          <div class="queue-rank">{esc(row.get('ladderRank'))}</div>
          <div>
            <p class="eyebrow">{esc(row.get('kind'))}</p>
            <h3>{esc(row.get('label'))}: {esc(row.get('candidateId'))}</h3>
            <p><strong>Group:</strong> {esc(row.get('groupKey'))} · <strong>Aspect:</strong> {esc(row.get('aspect'))} · <strong>Status:</strong> {esc(row.get('status'))}</p>
            <p><strong>Decision options:</strong> {esc(', '.join(str(item) for item in (row.get('decisionOptions') or [])))}</p>
            <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
            <ul>{''.join(f'<li>{esc(item)}</li>' for item in (row.get('lookFor') or []))}</ul>
            <pre>{esc(row.get('safeCommand'))}</pre>
            <p class="muted">{esc(row.get('safety'))}</p>
          </div>
        </article>
        """
        for row in payload.get("proofReviewLadder") or []
        if isinstance(row, dict)
    )
    proof_loop_html = "".join(
        f"""
        <article class="loop-card">
          <b>{esc(step.get('step'))}</b>
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('why'))}</p>
          <pre>{esc(step.get('command'))}</pre>
          <p><strong>Done when:</strong> {esc(step.get('doneWhen'))}</p>
          <p>{esc(step.get('safety'))}</p>
        </article>
        """
        for step in payload.get("proofLoop") or []
    )
    ready_plan = payload.get("readyContinuationPlan") if isinstance(payload.get("readyContinuationPlan"), dict) else {}
    ready_plan_steps = "".join(
        f"""
        <article class="loop-card">
          <h3>{esc(step.get('label'))}</h3>
          <p><strong>Done when:</strong> {esc(step.get('doneWhen'))}</p>
          <pre>{esc(step.get('command'))}</pre>
          <p>{esc(step.get('safety'))}</p>
        </article>
        """
        for step in (ready_plan.get("steps") if isinstance(ready_plan.get("steps"), list) else [])
        if isinstance(step, dict)
    )
    ready_plan_donts = "".join(f"<li>{esc(item)}</li>" for item in ready_plan.get("doNotDo", [])) if ready_plan else ""
    lane_boundary_card = ""
    if lane_boundary:
        lane_boundary_card = f"""
        <article class="repair-start">
          <p class="eyebrow">Lane boundary</p>
          <h3>{esc(lane_boundary.get('readyGroupsCanContinue'))} ready groups can keep moving</h3>
          <p>{esc(lane_boundary.get('humanMessage'))}</p>
          <p><strong>Codex-safe parallel work:</strong> {esc(lane_boundary.get('codexSafeParallelWork'))}</p>
          <p><strong>Do not do:</strong> {esc(lane_boundary.get('doNotDo'))}</p>
        </article>
        """
    start_card = ""
    if start:
        reveal_commands = "".join(f"<code>{esc(command)}</code>" for command in (start.get("revealCommands") or []))
        if not reveal_commands:
            reveal_commands = "<p>No reveal commands available.</p>"
        start_card = f"""
        <article class="repair-start">
          <p class="eyebrow">Start here today</p>
          <h3>{esc(start.get('label'))}</h3>
          <p><strong>Group:</strong> {esc(start.get('groupKey') or 'none')}</p>
          <p><strong>Human:</strong> {esc(start.get('humanAction'))}</p>
          <p><strong>Codex:</strong> {esc(start.get('codexSafeAction'))}</p>
          <pre>{esc(start.get('openEvidenceCommand') or 'No evidence packet yet; inspect damaged source paths first.')}</pre>
          <div class="repair-command">{reveal_commands}</div>
        </article>
        """
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Studio360 proof control room</title>
<style>
:root {{
  color-scheme: dark;
  --bg: #101914;
  --panel: #18241d;
  --panel2: #213126;
  --ink: #f5efd9;
  --muted: #b9c1aa;
  --gold: #e0b73f;
  --moss: #7fb56b;
  --clay: #c06b42;
  --blue: #7bc7d9;
  --line: rgba(245,239,217,.16);
}}
* {{ box-sizing: border-box; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at 20% 0%, #274332 0%, var(--bg) 42%, #0b100d 100%); color: var(--ink); }}
main {{ max-width: 1440px; margin: 0 auto; padding: 28px; }}
.hero {{ border:1px solid var(--line); border-radius: 28px; padding: 28px; background: linear-gradient(135deg, rgba(224,183,63,.14), rgba(127,181,107,.08)); box-shadow: 0 24px 80px rgba(0,0,0,.35); }}
.eyebrow {{ letter-spacing:.18em; text-transform:uppercase; color: var(--gold); font-weight: 800; font-size: .78rem; }}
h1 {{ margin:.25rem 0; font-size: clamp(2rem, 5vw, 4.8rem); line-height:.94; }}
h2,h3 {{ margin:.25rem 0 .5rem; }}
p {{ color: var(--muted); line-height:1.5; }}
.grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap: 16px; margin-top: 20px; }}
	.card,.proof,.nextproof,.panel {{ border:1px solid var(--line); border-radius: 22px; padding: 18px; background: rgba(24,36,29,.82); }}
	.start-action {{ display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; border:1px solid rgba(224,183,63,.45); border-radius:22px; padding:18px; background:linear-gradient(135deg, rgba(224,183,63,.13), rgba(24,36,29,.82)); }}
	.start-action.review-existing-proof {{ border-color:rgba(123,199,217,.45); }}
	.start-action.repair-start-here,.start-action.repair-action {{ border-color:rgba(192,107,66,.62); }}
	.proof-ladder {{ display:grid; grid-template-columns:46px 1fr; gap:14px; align-items:start; border:1px solid rgba(123,199,217,.42); border-radius:22px; padding:18px; background:linear-gradient(135deg, rgba(123,199,217,.10), rgba(24,36,29,.82)); }}
	.proof-ladder.optional-next-proof {{ border-color:rgba(224,183,63,.5); }}
	.proof-ladder.repair-blocker-visible {{ border-color:rgba(192,107,66,.62); }}
	.gate-card {{ border:1px solid rgba(224,183,63,.62); border-radius:26px; padding:22px; background:linear-gradient(135deg, rgba(224,183,63,.16), rgba(12,18,14,.9)); box-shadow:0 18px 60px rgba(0,0,0,.28); }}
	.queue-rank {{ display:grid; place-items:center; width:42px; height:42px; border-radius:16px; color:#101914; background:var(--gold); font-weight:950; }}
	.loop-card {{ border:1px solid rgba(123,199,217,.35); border-radius:22px; padding:18px; background:rgba(123,199,217,.07); }}
.loop-card b {{ display:inline-grid; place-items:center; width:30px; height:30px; border-radius:999px; color:var(--blue); background:rgba(123,199,217,.14); }}
.repair-ticket {{ border:1px solid rgba(192,107,66,.72); border-radius:22px; padding:18px; background:linear-gradient(145deg, rgba(65,34,23,.84), rgba(24,36,29,.78)); }}
.repair-start {{ border:1px solid rgba(224,183,63,.62); border-radius:22px; padding:18px; background:linear-gradient(135deg, rgba(224,183,63,.14), rgba(123,199,217,.08)); margin-bottom:16px; }}
.repair-queue-card {{ border:1px solid rgba(224,183,63,.35); border-radius:22px; padding:18px; background:rgba(12,18,14,.78); }}
.repair-ticket h4 {{ margin:.75rem 0 .35rem; color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:.78rem; }}
.repair-ticket ul {{ padding-left:18px; }}
.repair-ticket li {{ margin-bottom:10px; color:var(--muted); }}
.repair-ticket li code {{ display:block; color:#f9e7a7; word-break:break-word; }}
.repair-ticket li span {{ color:var(--blue); font-weight:800; }}
.repair-command {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.24); margin-top:10px; }}
.repair-command strong {{ color:var(--ink); }}
.pair-contract {{ border:1px solid rgba(127,181,107,.58); border-radius:22px; padding:18px; background:linear-gradient(135deg, rgba(127,181,107,.16), rgba(12,18,14,.84)); }}
.aspect-pair {{ border:1px solid rgba(123,199,217,.42); border-radius:22px; padding:18px; background:linear-gradient(145deg, rgba(28,58,52,.76), rgba(24,36,29,.86)); }}
.pair-videos {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(240px,1fr)); gap:14px; align-items:start; }}
.aspect-pair code {{ color:#f9e7a7; word-break:break-word; }}
.card.repair-first,.card.proof-output-missing,.card.missing-evidence {{ border-color: rgba(192,107,66,.7); background: rgba(60,32,24,.78); }}
.card.proof-next,.card.dry-run-ready {{ border-color: rgba(224,183,63,.65); }}
ul.counts {{ list-style:none; padding:0; display:grid; grid-template-columns: repeat(auto-fit, minmax(190px,1fr)); gap:10px; }}
ul.counts li {{ display:flex; justify-content:space-between; gap:12px; border:1px solid var(--line); border-radius:14px; padding:10px 12px; background: rgba(0,0,0,.22); }}
	pre {{ white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,.34); border:1px solid var(--line); border-radius: 14px; padding: 12px; color:#f9e7a7; }}
	.muted {{ color:var(--muted); font-size:.92rem; }}
video {{ width:100%; max-height:260px; border-radius:16px; background:#050805; border:1px solid rgba(255,255,255,.1); }}
.missing {{ border:1px dashed var(--clay); color:#ffd4bf; padding:24px; border-radius:16px; }}
section {{ margin-top:28px; }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio360</p>
    <h1>Proof control room</h1>
    <p>{esc(payload.get('truth', {}).get('description'))}</p>
    <p><strong>Status:</strong> {esc(payload.get('status'))}</p>
    <p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p>
    <pre>{esc(payload.get('firstSafeAction', {}).get('command'))}</pre>
  </section>
	  <section class="panel">
	    <h2>Counts that matter</h2>
	    <ul class="counts">{count_html}</ul>
	  </section>
	  <section class="panel">
	    <p class="eyebrow">Start here</p>
	    <h2>Choose exactly one 360 action</h2>
	    <p>Proof review, one deliberate proof render, or blocker classification. Ready groups keep moving; damaged groups stay visible but parked until evidence is real.</p>
	    <div class="grid">{start_queue_html or '<p>No 360 start queue rows found.</p>'}</div>
	  </section>
  <section class="panel">
    <p class="eyebrow">One source, two proofs</p>
    <h2>Review 16:9 and 9:16 together</h2>
    <p>A source is not really proven until the wide and vertical reframes both make sense. This keeps Insta360-style work honest without mutating originals or pretending proof files are publication receipts.</p>
    {pair_contract_html}
    <div class="grid">{pair_rows_html or '<p>No paired proof rows found yet. Regenerate the proof sprint companion, then refresh this control room.</p>'}</div>
  </section>
  <section class="panel">
    <p class="eyebrow">Approval boundary</p>
    <h2>Full render is gated by proof review</h2>
    {full_render_gate_html}
  </section>
  <section class="panel">
    <p class="eyebrow">Proof review ladder</p>
    <h2>Watch, decide, then render later</h2>
    <p>Existing proof files are evidence, not approval. Use this ladder to review proofs, choose one next proof only when warranted, and keep repair blockers visible without freezing unrelated ready groups.</p>
    <div class="grid">{proof_ladder_html or '<p>No proof review ladder rows found.</p>'}</div>
  </section>
	  <section>
	    <h2>Control cards</h2>
    <div class="grid">{''.join(cards_html)}</div>
  </section>
  <section class="panel">
    <h2>Proof loop</h2>
    <div class="grid">{proof_loop_html}</div>
  </section>
  <section class="panel">
    <p class="eyebrow">Continue without pretending repairs are done</p>
    <h2>{esc(ready_plan.get('headline') if ready_plan else 'Ready groups can continue')}</h2>
    <p>{esc(ready_plan.get('plainEnglish') if ready_plan else '')}</p>
    <div class="grid">{ready_plan_steps}</div>
    <h3>Do not do</h3>
    <ul>{ready_plan_donts}</ul>
  </section>
  <section class="panel">
    <h2>Proof control protocol</h2>
    <ol>{protocol_html}</ol>
    <h2>Review checklist</h2>
    <ol>{checklist_html}</ol>
  </section>
  <section>
    <h2>Repair blockers before full export</h2>
    {lane_boundary_card}
    {start_card}
    <h3>Operator recopy checklist</h3>
    <div class="grid">{''.join(operator_recopy_html) or '<p>No operator recopy rows in this pass.</p>'}</div>
    <div class="grid">{''.join(repair_queue_html)}</div>
    <div class="grid">{''.join(repair_html) or '<p>No repair blockers found in this control-room pass.</p>'}</div>
  </section>
  <section>
    <h2>Existing proofs</h2>
    <div class="grid">{''.join(existing_html) or '<p>No existing proof rows found.</p>'}</div>
  </section>
  <section>
    <h2>Next proof candidates</h2>
    <div class="grid">{''.join(next_html) or '<p>No next proof candidates found.</p>'}</div>
  </section>
</main>
</body>
</html>""", encoding="utf-8")


def build(root: Path, output_root: Path, limit: int) -> dict[str, Any]:
    out_dir = output_root / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(root, out_dir, max(1, limit))
    json_path = out_dir / "studio360-proof-control-room.json"
    csv_path = out_dir / "studio360-proof-control-room.csv"
    md_path = out_dir / "START-HERE-studio360-proof-control-room.md"
    proof_runway_path = out_dir / "PROOF-RUNWAY.md"
    reframe_export_runway_path = out_dir / "REFRAME-EXPORT-RUNWAY.md"
    source_routing_cards_path = out_dir / "SOURCE-ROUTING-CARDS.md"
    render_dry_run_cards_path = out_dir / "RENDER-DRY-RUN-CARDS.md"
    html_path = out_dir / "index.html"
    payload["jsonPath"] = str(json_path)
    payload["csvPath"] = str(csv_path)
    payload["markdownPath"] = str(md_path)
    payload["proofRunwayPath"] = str(proof_runway_path)
    payload["reframeExportRunwayPath"] = str(reframe_export_runway_path)
    payload["sourceRoutingCardsPath"] = str(source_routing_cards_path)
    payload["renderDryRunCardsPath"] = str(render_dry_run_cards_path)
    payload["htmlPath"] = str(html_path)
    next_source_card_pointer = load_json(root / "latest-360-next-source-card.json")
    payload["next360SourceCardPath"] = str(next_source_card_pointer.get("htmlPath") or "")
    if payload["next360SourceCardPath"]:
        payload["firstSafeAction"] = {
            "label": "Open next Studio360 source card",
            "command": f"open {shell_quote(payload['next360SourceCardPath'])}",
            "path": payload["next360SourceCardPath"],
            "safety": "Opens one local 360 source-inspection card. No proxy, render, repair, export, upload, publication, schedule, metadata write, delete, overwrite, source mutation, or receipt truth.",
        }
    write_json(json_path, payload)
    write_csv(csv_path, payload)
    write_markdown(md_path, payload)
    write_proof_runway_markdown(proof_runway_path, payload)
    write_reframe_export_runway_markdown(reframe_export_runway_path, payload)
    write_source_routing_cards_markdown(source_routing_cards_path, payload)
    write_render_dry_run_cards_markdown(render_dry_run_cards_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": "quipsly.studio360.latest-proof-control-room.v1",
        "updatedAt": iso_now(),
        "status": payload["status"],
        "outputDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(md_path),
        "proofRunwayPath": str(proof_runway_path),
        "reframeExportRunwayPath": str(reframe_export_runway_path),
        "next360SourceCardPath": payload.get("next360SourceCardPath") or "",
        "sourceRoutingCardsPath": str(source_routing_cards_path),
        "renderDryRunCardsPath": str(render_dry_run_cards_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "repairLaneBoundary": payload.get("repairLaneBoundary") or {},
        "readyContinuationPlan": payload.get("readyContinuationPlan") or {},
        "operatorRecopyChecklist": payload.get("operatorRecopyChecklist") or [],
        "proofLoop": payload.get("proofLoop") or [],
        "proofRunway": payload.get("proofRunway") or {},
        "reframeExportRunway": payload.get("reframeExportRunway") or {},
        "sourceRoutingCards": payload.get("sourceRoutingCards") or {},
        "renderDryRunCards": payload.get("renderDryRunCards") or {},
        "studio360StartQueue": payload.get("studio360StartQueue") or [],
        "truth": payload["truth"],
    }
    write_json(root / LATEST_POINTER_NAME, pointer)
    for alias in ALIAS_POINTER_NAMES:
        write_json(root / alias, pointer)
    return pointer


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local Studio360 proof control room")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--output-root", default="")
    parser.add_argument("--limit", type=int, default=8)
    args = parser.parse_args()
    root = Path(args.root)
    output_root = Path(args.output_root) if args.output_root else root / "ProofControlRooms"
    pointer = build(root, output_root, args.limit)
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
