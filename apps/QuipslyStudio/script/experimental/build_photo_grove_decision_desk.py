#!/usr/bin/env python3
"""Build a read-only Photo Grove Decision Desk.

This joins the current review ledger, review status, event log, decision
receipts, command sheet, proof desk, first keepers, cull suggestions, export
prep, and client proof readiness into one surface. It does not execute metadata
commands, mutate originals, copy deliverables, upload, publish, schedule, or
create client delivery truth.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.decision-desk.v1"
LATEST_POINTER = "latest-photo-grove-decision-desk.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-decision-desk")


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path_value: str) -> str:
    try:
        return Path(path_value).as_uri()
    except ValueError:
        return "file://" + quote(path_value)


def safe_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def pointer(photo_root: Path, filename: str) -> dict[str, Any]:
    return load_json(photo_root / filename)


def latest_review_session(photo_root: Path) -> tuple[dict[str, Any], Path | None]:
    review_pointer = pointer(photo_root, "latest-photo-grove-review.json")
    latest = Path(str(review_pointer.get("latestSessionDir") or "")) if review_pointer.get("latestSessionDir") else None
    return review_pointer, latest if latest and latest.exists() else None


def read_events(session_dir: Path | None) -> list[dict[str, Any]]:
    if not session_dir:
        return []
    path = session_dir / "review-events.jsonl"
    if not path.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
            if isinstance(payload, dict):
                events.append(payload)
        except Exception:
            continue
    return events


def manifest_indexes(session_dir: Path | None) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    manifest = load_json(session_dir / "manifest.json") if session_dir else {}
    items = manifest.get("items") if isinstance(manifest.get("items"), list) else []
    by_id: dict[str, dict[str, Any]] = {}
    by_filename: dict[str, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        if item.get("id"):
            by_id[str(item.get("id"))] = item
        if item.get("filename"):
            by_filename[str(item.get("filename"))] = item
    return by_id, by_filename


def latest_files(root: Path | None, pattern: str, limit: int = 12) -> list[str]:
    if not root or not root.exists():
        return []
    return [str(path) for path in sorted(root.glob(pattern), key=lambda item: item.stat().st_mtime, reverse=True)[:limit]]


def decision_counts(decisions: list[dict[str, Any]]) -> dict[str, int]:
    status_counts: Counter[str] = Counter()
    rated = 0
    tagged = 0
    flagged = 0
    for decision in decisions:
        status_counts[str(decision.get("status") or "pending")] += 1
        if decision.get("rating") is not None:
            rated += 1
        if decision.get("tags"):
            tagged += 1
        if decision.get("flags"):
            flagged += 1
    return {
        "total": len(decisions),
        "pending": status_counts.get("pending", 0),
        "review": status_counts.get("review", 0),
        "keep": status_counts.get("keep", 0),
        "favorite": status_counts.get("favorite", 0),
        "reject": status_counts.get("reject", 0),
        "rated": rated,
        "tagged": tagged,
        "flagged": flagged,
        "selectedForClientProof": status_counts.get("keep", 0) + status_counts.get("favorite", 0),
    }


def review_contract(status_counts: dict[str, int]) -> dict[str, Any]:
    return {
        "humanAsk": (
            "Compare routed groups visually, open source evidence when needed, then choose keep, favorite, "
            "review, or reject as metadata only. Do not deliver or reject from thumbnail evidence alone."
        ),
        "agentSafeParallelWork": (
            "Prepare comparison notes, group summaries, source/thumbnail diagnostics, dry-run metadata commands, "
            "client-proof prep packets, and export readiness packets. Do not execute metadata decisions, copy, "
            "delete, deliver, upload, publish, schedule, overwrite, or mutate originals."
        ),
        "reviewContract": {
            "stateTruth": "Photo decisions are sidecar/review metadata. Original photo files remain untouched.",
            "allowedWithoutApproval": [
                "open local review evidence",
                "summarize groups and quality hints",
                "prepare dry-run metadata commands",
                "prepare client-proof/export packets without copying deliverables",
                "write read-only review packets and dashboards",
            ],
            "requiresHumanApproval": [
                "execute keep/favorite/reject/review metadata commands",
                "copy proof deliverables",
                "export client packets",
                "upload, publish, schedule, delete, overwrite, or mutate account state",
            ],
            "neverInfer": [
                "a blurry thumbnail means reject",
                "a keep/favorite sidecar means client approved",
                "an export packet means delivered",
                "a local receipt slot means external publication exists",
            ],
            "counts": {
                "total": status_counts.get("total", 0),
                "pending": status_counts.get("pending", 0),
                "review": status_counts.get("review", 0),
                "selectedForClientProof": status_counts.get("selectedForClientProof", 0),
            },
        },
        "sourceTasks": [
            "Open the Decision Desk.",
            "Start with routed review groups before pending groups.",
            "Compare each candidate against nearby group alternatives.",
            "Use dry-run commands first when uncertain.",
            "Execute metadata-only decisions only after visual/source review.",
            "Prepare proof/export packets only from deliberate keep/favorite selections.",
        ],
    }


def group_rows(decisions: list[dict[str, Any]], limit: int = 36) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for decision in decisions:
        grouped[str(decision.get("reviewGroupId") or "ungrouped")].append(decision)
    rows: list[dict[str, Any]] = []
    for group_id, group_decisions in grouped.items():
        counts = Counter(str(decision.get("status") or "pending") for decision in group_decisions)
        flag_counts: Counter[str] = Counter()
        first = group_decisions[0] if group_decisions else {}
        for decision in group_decisions:
            for flag in decision.get("flags") or []:
                flag_counts[str(flag)] += 1
        pending_or_review = counts.get("pending", 0) + counts.get("review", 0)
        if counts.get("keep", 0) or counts.get("favorite", 0):
            next_action = "Review selected photos against neighbors, then prepare export/client proof only after human approval."
            priority = "selected"
        elif counts.get("review", 0):
            next_action = "Open this routed review group and decide keep/favorite/reject/review in metadata only after visual comparison."
            priority = "review-routed"
        elif counts.get("pending", 0):
            next_action = "Compare this pending group, then run only the metadata command that matches review intent."
            priority = "pending"
        else:
            next_action = "Inspect completed group before export prep; originals remain untouched."
            priority = "complete"
        rows.append({
            "groupId": group_id,
            "priority": priority,
            "size": len(group_decisions),
            "pending": counts.get("pending", 0),
            "review": counts.get("review", 0),
            "keep": counts.get("keep", 0),
            "favorite": counts.get("favorite", 0),
            "reject": counts.get("reject", 0),
            "pendingOrReview": pending_or_review,
            "firstFilename": first.get("filename") or "",
            "firstSourcePath": first.get("sourcePath") or "",
            "topFlags": [flag for flag, _count in flag_counts.most_common(6)],
            "nextSafestAction": next_action,
            "truth": "Group review metadata only. Originals are untouched.",
        })
    priority_order = {"review-routed": 0, "pending": 1, "selected": 2, "complete": 3}
    return sorted(rows, key=lambda row: (priority_order.get(str(row.get("priority")), 9), -safe_int(row.get("pendingOrReview")), str(row.get("groupId"))))[:limit]


def next_candidate_rows(
    decisions: list[dict[str, Any]],
    items_by_id: dict[str, dict[str, Any]],
    items_by_filename: dict[str, dict[str, Any]],
    limit: int = 24,
) -> list[dict[str, Any]]:
    candidates = [decision for decision in decisions if str(decision.get("status") or "pending") in {"pending", "review"}]
    def score(decision: dict[str, Any]) -> tuple[int, str]:
        status_rank = 0 if decision.get("status") == "review" else 1
        return (status_rank, str(decision.get("filename") or ""))
    rows: list[dict[str, Any]] = []
    for decision in sorted(candidates, key=score)[:limit]:
        photo_id = str(decision.get("id") or decision.get("filename") or "")
        source_item = items_by_id.get(photo_id) or items_by_filename.get(str(decision.get("filename") or "")) or {}
        analysis = source_item.get("analysis") if isinstance(source_item.get("analysis"), dict) else {}
        quality_hints = analysis.get("qualityHints") if isinstance(analysis.get("qualityHints"), dict) else {}
        metadata = source_item.get("metadata") if isinstance(source_item.get("metadata"), dict) else {}
        source_path = str(decision.get("sourcePath") or source_item.get("sourcePath") or "")
        thumbnail_path = str(source_item.get("thumbnailPath") or "")
        cull_rubric = [
            "Is the subject sharp enough for the intended use?",
            "Is expression/gesture/composition stronger than nearby group alternatives?",
            "Are there obvious exposure, blur, duplicate, or technical issues?",
            "Does it deserve keep/favorite, or should it stay review/reject as metadata only?",
        ]
        rows.append({
            "photoId": photo_id,
            "filename": decision.get("filename") or "",
            "status": decision.get("status") or "pending",
            "rating": decision.get("rating"),
            "reviewGroupId": decision.get("reviewGroupId") or "",
            "reviewGroupPosition": decision.get("reviewGroupPosition"),
            "reviewGroupSize": decision.get("reviewGroupSize"),
            "sourcePath": source_path,
            "thumbnailPath": thumbnail_path,
            "thumbnailUri": file_uri(thumbnail_path) if thumbnail_path else "",
            "thumbnailWarning": source_item.get("thumbnailWarning") or "",
            "qualityNote": quality_hints.get("qualityNote") or "",
            "qualityFlags": quality_hints.get("qualityFlags") or analysis.get("problemFlags") or [],
            "humanAsk": "Inspect the thumbnail/source, compare nearby group alternatives, then choose review, keep, favorite, or reject as metadata only.",
            "agentSafeParallelWork": "Prepare comparison notes, group summaries, quality hints, and dry-run metadata commands. Do not copy, delete, deliver, upload, publish, or mutate originals.",
            "cullRubric": cull_rubric,
            "pixelWidth": metadata.get("pixelWidth"),
            "pixelHeight": metadata.get("pixelHeight"),
            "flags": decision.get("flags") or [],
            "tags": decision.get("tags") or [],
            "openSourceCommand": command(["open", "-R", source_path]) if source_path else "",
            "dryRunReviewCommand": f"./script/agentctl.sh photo-grove-decision-dry-run {shell_quote(photo_id)} review - needs-human-cull codex {shell_quote('Dry-run route for human source-aware cull; originals untouched.')}",
            "dryRunKeep4Command": f"./script/agentctl.sh photo-grove-decision-dry-run {shell_quote(photo_id)} keep 4 keeper codex {shell_quote('Dry-run keep after visual/source review; originals untouched.')}",
            "dryRunFavorite5Command": f"./script/agentctl.sh photo-grove-decision-dry-run {shell_quote(photo_id)} favorite 5 hero,keeper codex {shell_quote('Dry-run favorite after visual/source review; originals untouched.')}",
            "dryRunRejectCommand": f"./script/agentctl.sh photo-grove-decision-dry-run {shell_quote(photo_id)} reject - reject-after-review codex {shell_quote('Dry-run reject metadata after visual/source review; original remains untouched.')}",
            "markReviewCommand": f"./script/agentctl.sh photo-grove-decision {shell_quote(photo_id)} review - needs-human-cull codex {shell_quote('Route for human source-aware cull; originals untouched.')}",
            "markKeep4Command": f"./script/agentctl.sh photo-grove-decision {shell_quote(photo_id)} keep 4 keeper codex {shell_quote('Keep after visual/source review; originals untouched.')}",
            "markFavorite5Command": f"./script/agentctl.sh photo-grove-decision {shell_quote(photo_id)} favorite 5 hero,keeper codex {shell_quote('Favorite after visual/source review; originals untouched.')}",
            "markRejectCommand": f"./script/agentctl.sh photo-grove-decision {shell_quote(photo_id)} reject - reject-after-review codex {shell_quote('Reject metadata after visual/source review; original remains untouched.')}",
        })
    return rows


def action_rows(parts: dict[str, dict[str, Any]], counts: dict[str, int], events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    proof = parts.get("proof") or {}
    keeper = parts.get("keeper") or {}
    command_sheet = parts.get("commandSheet") or {}
    first_keepers = parts.get("firstKeepers") or {}
    cull = parts.get("cullSuggestions") or {}
    client = parts.get("clientProof") or {}
    export_prep = parts.get("exportPrep") or {}
    review_batch = parts.get("reviewBatch") or {}
    if counts.get("selectedForClientProof"):
        rows.append({
            "rank": 1,
            "id": "selected-proof-prep",
            "title": "Review selected photos for proof readiness",
            "status": "selected-exists",
            "why": f"{counts.get('selectedForClientProof', 0)} photos are keep/favorite. They can feed export/client proof after human review.",
            "nextSafestAction": "Open export prep/client proof, compare selected photos, then prepare a copy plan only after approval.",
            "htmlPath": client.get("htmlPath") or export_prep.get("htmlPath") or "",
            "jsonPath": client.get("jsonPath") or export_prep.get("jsonPath") or "",
            "itemCount": counts.get("selectedForClientProof", 0),
            "pending": counts.get("pending", 0),
            "selected": counts.get("selectedForClientProof", 0),
            "safety": "Review/export prep only. No deliverables are copied and originals stay untouched.",
        })
    rows.append({
        "rank": 2,
        "id": "decision-status",
        "title": "Review current decision status",
        "status": "decision-status-ready",
        "why": f"{counts.get('total', 0)} photos are tracked: {counts.get('pending', 0)} pending, {counts.get('review', 0)} routed to review, {counts.get('keep', 0)} keep, {counts.get('favorite', 0)} favorite, {counts.get('reject', 0)} reject.",
        "nextSafestAction": "Use group-aware review decisions first so related frames stay understandable.",
        "htmlPath": parts.get("reviewStatusHtml") or "",
        "jsonPath": parts.get("reviewStatusJson") or "",
        "itemCount": counts.get("total", 0),
        "pending": counts.get("pending", 0) + counts.get("review", 0),
        "selected": counts.get("selectedForClientProof", 0),
        "safety": "Status only. No metadata command executes here.",
    })
    if first_keepers:
        first_counts = first_keepers.get("counts") if isinstance(first_keepers.get("counts"), dict) else {}
        rows.append({
            "rank": 3,
            "id": "first-keepers",
            "title": "Open first keeper candidates",
            "status": first_keepers.get("status") or "first-keepers-ready",
            "why": f"{first_counts.get('candidatePhotos', 0)} first-pass candidates can seed a small keeper set without overwhelming the reviewer.",
            "nextSafestAction": first_keepers.get("nextSafestAction") or "Compare candidates visually, then record metadata-only keep/favorite/review decisions.",
            "htmlPath": first_keepers.get("htmlPath") or "",
            "jsonPath": first_keepers.get("jsonPath") or "",
            "itemCount": first_counts.get("candidatePhotos", 0),
            "pending": first_counts.get("pending", 0),
            "selected": first_counts.get("selectedForClientProof", 0),
            "safety": "Candidate evidence only. Originals and review metadata remain unchanged until a separate decision command runs.",
        })
    if command_sheet:
        command_counts = command_sheet.get("counts") if isinstance(command_sheet.get("counts"), dict) else {}
        rows.append({
            "rank": 4,
            "id": "command-sheet",
            "title": "Use command sheet after visual review",
            "status": command_sheet.get("status") or "command-sheet-ready",
            "why": f"{command_counts.get('commands', 0)} metadata-only commands across {command_counts.get('groups', 0)} groups are available.",
            "nextSafestAction": command_sheet.get("nextSafestAction") or "Open source evidence, then run only the metadata command that matches review intent.",
            "htmlPath": command_sheet.get("htmlPath") or "",
            "jsonPath": command_sheet.get("jsonPath") or "",
            "itemCount": command_counts.get("commands", 0),
            "pending": command_counts.get("groups", 0),
            "selected": 0,
            "firstReviewCommand": command_sheet.get("firstReviewCommand") or "",
            "firstCullCommand": command_sheet.get("firstCullCommand") or "",
            "safety": command_sheet.get("metadataCommandSafety") or "Commands are metadata-only; originals stay untouched.",
        })
    if cull:
        cull_counts = cull.get("counts") if isinstance(cull.get("counts"), dict) else {}
        rows.append({
            "rank": 5,
            "id": "cull-suggestions",
            "title": "Inspect cull suggestions",
            "status": cull.get("status") or "cull-suggestions-ready",
            "why": f"{cull_counts.get('suggestionGroups', 0)} suggestion groups route attention without making automatic keep/reject decisions.",
            "nextSafestAction": cull.get("nextSafestAction") or "Inspect suggestions before metadata-only review decisions.",
            "htmlPath": cull.get("htmlPath") or "",
            "jsonPath": cull.get("jsonPath") or "",
            "itemCount": cull_counts.get("suggestionGroups", 0),
            "pending": cull_counts.get("pending", 0),
            "selected": cull_counts.get("selectedForClientProof", 0),
            "safety": "Suggestions are attention routing only; no auto-cull happens.",
        })
    if review_batch:
        batch_counts = review_batch.get("counts") if isinstance(review_batch.get("counts"), dict) else {}
        rows.append({
            "rank": 6,
            "id": "review-batch",
            "title": "Open focused review batch",
            "status": review_batch.get("status") or "review-batch-ready",
            "why": f"{batch_counts.get('groups', review_batch.get('groupCount', 0))} grouped batches are ready for comparison.",
            "nextSafestAction": review_batch.get("nextSafestAction") or "Review groups in order; quality hints route attention but do not decide.",
            "htmlPath": review_batch.get("htmlPath") or "",
            "jsonPath": review_batch.get("jsonPath") or "",
            "itemCount": batch_counts.get("groups", review_batch.get("groupCount", 0)),
            "pending": batch_counts.get("groups", review_batch.get("groupCount", 0)),
            "selected": 0,
            "safety": "Review batch only. Originals and metadata stay untouched.",
        })
    if proof:
        proof_counts = proof.get("counts") if isinstance(proof.get("counts"), dict) else {}
        rows.append({
            "rank": 7,
            "id": "proof-desk",
            "title": "Open proof desk overview",
            "status": proof.get("status") or "proof-desk-ready",
            "why": f"{proof_counts.get('sourcePhotos', 0)} photos, {proof_counts.get('firstKeeperCandidates', 0)} first keepers, and {proof_counts.get('metadataCommandRows', 0)} command rows are joined there.",
            "nextSafestAction": proof.get("nextSafestAction") or "Open proof desk before culling, proof prep, or export prep.",
            "htmlPath": proof.get("htmlPath") or "",
            "jsonPath": proof.get("jsonPath") or "",
            "itemCount": proof_counts.get("sourcePhotos", 0),
            "pending": proof_counts.get("pending", 0),
            "selected": proof_counts.get("selectedForClientProof", 0),
            "safety": "Proof desk is read-only. No decisions execute here.",
        })
    if events:
        last = events[-1]
        rows.append({
            "rank": 8,
            "id": "recent-decision-receipt",
            "title": "Inspect latest decision receipt",
            "status": "receipt-present",
            "why": f"Latest event updated {last.get('updatedCount', 0)} photo(s) in {last.get('reviewGroupId') or last.get('photoId') or 'unknown subject'} as {((last.get('after') or [{}])[0].get('status') if isinstance(last.get('after'), list) and last.get('after') else '')}.",
            "nextSafestAction": "Open the receipt before stacking more review decisions, especially when recovering context after an interruption.",
            "htmlPath": "",
            "jsonPath": "",
            "itemCount": last.get("updatedCount", 0),
            "pending": 0,
            "selected": 0,
            "safety": "Receipt evidence only. Original photos were not touched by the receipt itself.",
        })
    return sorted(rows, key=lambda row: safe_int(row.get("rank")))


def _shell_quote(value: Any) -> str:
    return "'" + str(value).replace("'", "'\"'\"'") + "'"


def build_first_pass_runway(groups: list[dict[str, Any]], candidates: list[dict[str, Any]], counts: dict[str, int]) -> dict[str, Any]:
    review_groups = [row for row in groups if row.get("priority") == "review-routed"]
    pending_groups = [row for row in groups if row.get("priority") == "pending"]
    starter_groups = (review_groups + pending_groups)[:6]
    starter_candidates = candidates[:12]

    group_actions: list[dict[str, Any]] = []
    for index, group in enumerate(starter_groups, start=1):
        group_id = str(group.get("groupId") or "")
        group_label = str(group.get("label") or group.get("title") or group_id or f"group {index}")
        note = f"first-pass cull group {index}: {group_label}"
        group_actions.append(
            {
                "rank": index,
                "groupId": group_id,
                "label": group_label,
                "priority": group.get("priority") or "pending",
                "photoCount": safe_int(group.get("photoCount") or group.get("count")),
                "reviewCount": safe_int(group.get("reviewCount")),
                "pendingCount": safe_int(group.get("pendingCount")),
                "firstSourcePath": group.get("firstSourcePath"),
                "recommendedHumanAction": "Open this cluster, compare near-duplicates, then mark the whole group review/keep/reject only after visual confirmation.",
                "dryRunReviewCommand": f"./script/agentctl.sh photo-grove-group-decision-dry-run {_shell_quote(group_id)} review {_shell_quote('needs-human-cull,first-pass')} {_shell_quote('reviewer')} {_shell_quote(note)}",
                "dryRunKeepCommand": f"./script/agentctl.sh photo-grove-group-decision-dry-run {_shell_quote(group_id)} keep {_shell_quote('first-pass-keeper-candidate')} {_shell_quote('reviewer')} {_shell_quote(note)}",
                "dryRunRejectCommand": f"./script/agentctl.sh photo-grove-group-decision-dry-run {_shell_quote(group_id)} reject {_shell_quote('duplicate-or-quality-reject,first-pass')} {_shell_quote('reviewer')} {_shell_quote(note)}",
                "executeAfterPreviewReviewCommand": f"./script/agentctl.sh photo-grove-group-decision {_shell_quote(group_id)} review {_shell_quote('needs-human-cull,first-pass')} {_shell_quote('reviewer')} {_shell_quote(note)}",
                "executeAfterPreviewKeepCommand": f"./script/agentctl.sh photo-grove-group-decision {_shell_quote(group_id)} keep {_shell_quote('first-pass-keeper-candidate')} {_shell_quote('reviewer')} {_shell_quote(note)}",
                "executeAfterPreviewRejectCommand": f"./script/agentctl.sh photo-grove-group-decision {_shell_quote(group_id)} reject {_shell_quote('duplicate-or-quality-reject,first-pass')} {_shell_quote('reviewer')} {_shell_quote(note)}",
            }
        )

    candidate_actions: list[dict[str, Any]] = []
    for index, candidate in enumerate(starter_candidates, start=1):
        photo_id = str(candidate.get("photoId") or candidate.get("id") or "")
        source_path = str(candidate.get("sourcePath") or candidate.get("path") or "")
        candidate_actions.append(
            {
                "rank": index,
                "photoId": photo_id,
                "sourcePath": source_path,
                "groupId": candidate.get("groupId"),
                "previewPath": candidate.get("previewPath") or candidate.get("thumbnailPath"),
                "decision": candidate.get("decision") or "pending",
                "suggestedAction": candidate.get("suggestedAction") or candidate.get("action") or "review",
                "dryRunKeepCommand": candidate.get("dryRunKeepCommand") or f"./script/agentctl.sh photo-grove-decision-dry-run {_shell_quote(photo_id or source_path)} keep {_shell_quote('first-pass-keeper-candidate')} {_shell_quote('reviewer')} {_shell_quote('first-pass single photo keep candidate')}",
                "dryRunReviewCommand": candidate.get("dryRunReviewCommand") or f"./script/agentctl.sh photo-grove-decision-dry-run {_shell_quote(photo_id or source_path)} review {_shell_quote('needs-human-cull,first-pass')} {_shell_quote('reviewer')} {_shell_quote('first-pass single photo review candidate')}",
                "dryRunRejectCommand": candidate.get("dryRunRejectCommand") or f"./script/agentctl.sh photo-grove-decision-dry-run {_shell_quote(photo_id or source_path)} reject {_shell_quote('duplicate-or-quality-reject,first-pass')} {_shell_quote('reviewer')} {_shell_quote('first-pass single photo reject candidate')}",
            }
        )

    selected = safe_int(counts.get("selectedForClientProof"))
    if selected:
        status = "proof-prep-can-start-after-human-check"
        next_action = "A client proof starter set exists. Review selected keeps before building export packets."
    elif review_groups:
        status = "review-routed-first-pass"
        next_action = "Start with the review-routed groups. They are the safest place to make visible cull progress."
    elif pending_groups:
        status = "pending-first-pass"
        next_action = "No review groups are routed yet. Start with the first pending clusters and dry-run decisions before executing."
    else:
        status = "no-first-pass-candidates"
        next_action = "No cull candidates are visible in the current ledger. Rebuild Photo Grove suggestions or ingest photos first."

    return {
        "status": status,
        "nextAction": next_action,
        "selectedForClientProof": selected,
        "reviewGroupCount": len(review_groups),
        "pendingGroupCount": len(pending_groups),
        "starterGroupCount": len(group_actions),
        "starterCandidateCount": len(candidate_actions),
        "safetyContract": {
            "mutatesOriginals": False,
            "exportsPhotos": False,
            "deliversToClient": False,
            "executeCommandsWriteMetadataOnly": True,
            "dryRunCommandsWriteNothing": True,
        },
        "groupActions": group_actions,
        "candidateActions": candidate_actions,
    }


def build_packet(photo_root: Path) -> dict[str, Any]:
    review_pointer, latest = latest_review_session(photo_root)
    ledger = load_json(latest / "review-ledger.json") if latest else {}
    review_status = load_json(latest / "review-status.json") if latest else {}
    decisions = ledger.get("decisions") if isinstance(ledger.get("decisions"), list) else []
    events = read_events(latest)
    status_counts = decision_counts(decisions)
    items_by_id, items_by_filename = manifest_indexes(latest)
    export_prep = load_json(latest / "export-packets" / "photo-grove-export-prep.json") if latest else {}
    export_html = str(latest / "export-packets" / "photo-grove-export-prep.html") if latest and (latest / "export-packets" / "photo-grove-export-prep.html").exists() else ""
    if export_prep and export_html and not export_prep.get("htmlPath"):
        export_prep["htmlPath"] = export_html
        export_prep["jsonPath"] = str(latest / "export-packets" / "photo-grove-export-prep.json")
    parts = {
        "reviewPointer": review_pointer,
        "proof": pointer(photo_root, "latest-photo-grove-proof-desk.json"),
        "keeper": pointer(photo_root, "latest-photo-grove-keeper-desk.json"),
        "commandSheet": pointer(photo_root, "latest-photo-grove-command-sheet.json"),
        "firstKeepers": pointer(photo_root, "latest-photo-grove-first-keepers.json"),
        "cullSuggestions": pointer(photo_root, "latest-photo-grove-cull-suggestions.json"),
        "reviewBatch": pointer(photo_root, "latest-photo-grove-review-batch.json"),
        "clientProof": pointer(photo_root, "latest-photo-grove-client-proof-packet.json"),
        "exportPrep": export_prep,
        "reviewStatusHtml": str(latest / "review-status.html") if latest and (latest / "review-status.html").exists() else "",
        "reviewStatusJson": str(latest / "review-status.json") if latest and (latest / "review-status.json").exists() else "",
    }
    groups = group_rows(decisions)
    candidates = next_candidate_rows(decisions, items_by_id, items_by_filename)
    rows = action_rows(parts, status_counts, events)
    first_pass_runway = build_first_pass_runway(groups, candidates, status_counts)
    receipts_dir = latest / "decision-receipts" if latest else None
    versions_dir = latest / "ledger-versions" if latest else None
    counts = {
        **status_counts,
        "events": len(events),
        "decisionReceiptJsonFiles": len(latest_files(receipts_dir, "*.json", 10_000)),
        "ledgerSnapshots": len(latest_files(versions_dir, "*.json", 10_000)),
        "groupRows": len(groups),
        "nextCandidateRows": len(candidates),
        "visualCandidateRows": sum(1 for candidate in candidates if candidate.get("thumbnailPath")),
        "actionRows": len(rows),
        "copyPlanExecuted": False,
        "clientDeliveryCreated": False,
        "originalsMutated": False,
        "externalPublishing": False,
    }
    if status_counts.get("selectedForClientProof"):
        status = "decision-desk-proof-prep-ready"
        next_action = "Review selected keep/favorite photos, then prepare a client-proof/export packet only after human approval."
    elif status_counts.get("review"):
        status = "decision-desk-review-routed"
        next_action = "Open routed review groups, compare visually, then convert the best frames to keep/favorite or reject in metadata only."
    elif status_counts.get("pending"):
        status = "decision-desk-needs-cull"
        next_action = "Open first keepers or cull suggestions, compare source evidence, then record metadata-only decisions."
    else:
        status = "decision-desk-reviewed"
        next_action = "Review proof/export readiness. External delivery and publication still require explicit approval and receipts."
    contract = review_contract(status_counts)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "photoRoot": str(photo_root),
        "latestSessionDir": str(latest) if latest else "",
        "status": status,
        "truth": "Photo Grove Decision Desk only. It reads local review metadata, receipts, and command packets; it does not execute metadata commands, mutate originals, copy deliverables, upload, publish, schedule, or create client delivery truth.",
        "humanAsk": contract["humanAsk"],
        "agentSafeParallelWork": contract["agentSafeParallelWork"],
        "reviewContract": contract["reviewContract"],
        "sourceTasks": contract["sourceTasks"],
        "counts": counts,
        "actionRows": rows,
        "groupRows": groups,
        "nextCandidateRows": candidates,
        "firstPassCullRunway": first_pass_runway,
        "firstPassRunwayStatus": first_pass_runway.get("status"),
        "recentEvents": events[-8:],
        "recentDecisionReceipts": latest_files(receipts_dir, "*.md", 12),
        "recentDecisionReceiptJson": latest_files(receipts_dir, "*.json", 12),
        "recentLedgerSnapshots": latest_files(versions_dir, "*.json", 8),
        "lastDecision": ledger.get("lastDecision") or review_status.get("lastDecision") or (events[-1] if events else {}),
        "sourcePointers": {
            "reviewHtml": review_pointer.get("htmlPath") or "",
            "reviewManifest": review_pointer.get("manifestPath") or "",
            "reviewLedger": str(latest / "review-ledger.json") if latest else "",
            "reviewStatusHtml": parts["reviewStatusHtml"],
            "reviewStatusJson": parts["reviewStatusJson"],
            "proofDeskHtml": parts["proof"].get("htmlPath") or "",
            "proofDeskJson": parts["proof"].get("jsonPath") or "",
            "keeperDeskHtml": parts["keeper"].get("htmlPath") or "",
            "keeperDeskJson": parts["keeper"].get("jsonPath") or "",
            "commandSheetHtml": parts["commandSheet"].get("htmlPath") or "",
            "commandSheetJson": parts["commandSheet"].get("jsonPath") or "",
            "firstKeepersHtml": parts["firstKeepers"].get("htmlPath") or "",
            "firstKeepersJson": parts["firstKeepers"].get("jsonPath") or "",
            "cullSuggestionsHtml": parts["cullSuggestions"].get("htmlPath") or "",
            "cullSuggestionsJson": parts["cullSuggestions"].get("jsonPath") or "",
            "reviewBatchHtml": parts["reviewBatch"].get("htmlPath") or "",
            "reviewBatchJson": parts["reviewBatch"].get("jsonPath") or "",
            "clientProofHtml": parts["clientProof"].get("htmlPath") or "",
            "clientProofJson": parts["clientProof"].get("jsonPath") or "",
            "exportPrepHtml": parts["exportPrep"].get("htmlPath") or "",
            "exportPrepJson": parts["exportPrep"].get("jsonPath") or "",
        },
        "firstSafeAction": {},
        "nextSafestAction": next_action,
        "safety": {
            "originalsMutated": False,
            "metadataCommandsExecuted": False,
            "copyPlanExecuted": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
        },
    }


def prepare_output_dir(photo_root: Path) -> Path:
    base = photo_root / "DecisionDesk" / stamp()
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["groupId", "priority", "size", "pending", "review", "keep", "favorite", "reject", "firstFilename", "topFlags", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row.get(field)) if field == "topFlags" else row.get(field, "") for field in fields})


def write_candidate_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = [
        "photoId", "filename", "status", "reviewGroupId", "sourcePath", "thumbnailPath", "qualityNote", "openSourceCommand", "flags", "qualityFlags",
        "humanAsk", "agentSafeParallelWork",
        "dryRunReviewCommand",
        "dryRunKeep4Command", "dryRunFavorite5Command", "dryRunRejectCommand",
        "markReviewCommand", "markKeep4Command", "markFavorite5Command", "markRejectCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: json.dumps(row.get(field)) if field in {"flags", "qualityFlags"} else row.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    lines = [
        "# Photo Grove Decision Desk",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        str(packet.get("truth") or ""),
        "",
        "## Human ask",
        "",
        str(packet.get("humanAsk") or ""),
        "",
        "## Codex can safely do",
        "",
        str(packet.get("agentSafeParallelWork") or ""),
        "",
        "## Review contract",
        "",
        "```json",
        json.dumps(packet.get("reviewContract") or {}, indent=2, sort_keys=True),
        "```",
        "",
        "## Counts",
        "",
    ]
    for key in ["total", "pending", "review", "keep", "favorite", "reject", "rated", "tagged", "flagged", "selectedForClientProof", "events", "decisionReceiptJsonFiles", "ledgerSnapshots"]:
        lines.append(f"- `{key}`: `{counts.get(key, 0)}`")
    runway = packet.get("firstPassCullRunway") or {}
    lines.extend([
        "",
        "## Next safest action",
        "",
        str(packet.get("nextSafestAction") or ""),
        "",
        "## First-pass cull runway",
        "",
        f"- Status: `{runway.get('status') or 'unknown'}`",
        f"- Next: {runway.get('nextAction') or ''}",
        f"- Starter groups: `{runway.get('starterGroupCount', 0)}`",
        f"- Starter photos: `{runway.get('starterCandidateCount', 0)}`",
        f"- Safety: `{json.dumps(runway.get('safetyContract') or {}, sort_keys=True)}`",
        "",
    ])
    for row in runway.get("groupActions") or []:
        lines.extend([
            f"### Group {row.get('rank')}: {row.get('label')}",
            f"- Group: `{row.get('groupId')}`",
            f"- Recommended action: {row.get('recommendedHumanAction')}",
            f"- Dry-run review: `{row.get('dryRunReviewCommand')}`",
            f"- Dry-run keep: `{row.get('dryRunKeepCommand')}`",
            f"- Dry-run reject: `{row.get('dryRunRejectCommand')}`",
            "",
        ])
    lines.extend(["", "## Workbench rows", ""])
    for row in packet.get("actionRows") or []:
        lines.extend([
            f"### {row.get('title')}",
            f"- Status: `{row.get('status')}`",
            f"- Why: {row.get('why')}",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Safety: {row.get('safety')}",
            f"- HTML: `{row.get('htmlPath')}`",
            f"- JSON: `{row.get('jsonPath')}`",
            "",
        ])
    lines.extend(["", "## Group rows", ""])
    for row in (packet.get("groupRows") or [])[:24]:
        lines.extend([
            f"### {row.get('groupId')} - {row.get('priority')}",
            f"- Size: `{row.get('size')}`; pending: `{row.get('pending')}`; review: `{row.get('review')}`; selected: `{safe_int(row.get('keep')) + safe_int(row.get('favorite'))}`; reject: `{row.get('reject')}`",
            f"- First file: `{row.get('firstFilename')}`",
            f"- Top flags: {', '.join(row.get('topFlags') or []) or 'none'}",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend(["", "## Next candidate commands", ""])
    for row in (packet.get("nextCandidateRows") or [])[:12]:
        lines.extend([
            f"### {row.get('filename')} - {row.get('status')}",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Open source: `{row.get('openSourceCommand')}`",
            f"- Dry-run review route: `{row.get('dryRunReviewCommand')}`",
            f"- Dry-run keep: `{row.get('dryRunKeep4Command')}`",
            f"- Dry-run favorite: `{row.get('dryRunFavorite5Command')}`",
            f"- Dry-run reject: `{row.get('dryRunRejectCommand')}`",
            f"- Review route: `{row.get('markReviewCommand')}`",
            f"- Keep: `{row.get('markKeep4Command')}`",
            f"- Favorite: `{row.get('markFavorite5Command')}`",
            f"- Reject: `{row.get('markRejectCommand')}`",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet.get("counts") or {}
    runway = packet.get("firstPassCullRunway") or {}
    runway_group_html = []
    for row in runway.get("groupActions") or []:
        runway_group_html.append(f"""
        <article class="group {esc(row.get('priority'))}">
          <div class="topline"><span>Step {esc(row.get('rank'))}</span><strong>{esc(row.get('groupId'))}</strong></div>
          <h3>{esc(row.get('label'))}</h3>
          <p>{esc(row.get('recommendedHumanAction'))}</p>
          <div class="chips"><span>{esc(row.get('photoCount'))} photos</span><span>{esc(row.get('pendingCount'))} pending</span><span>{esc(row.get('reviewCount'))} review</span><span>{esc(row.get('priority'))}</span></div>
          <p class="path">{esc(row.get('firstSourcePath'))}</p>
          <details><summary>Preview metadata-only group actions</summary><pre>{esc(row.get('dryRunReviewCommand'))}\n\n{esc(row.get('dryRunKeepCommand'))}\n\n{esc(row.get('dryRunRejectCommand'))}</pre></details>
          <details><summary>Execute only after visual confirmation</summary><pre>{esc(row.get('executeAfterPreviewReviewCommand'))}\n\n{esc(row.get('executeAfterPreviewKeepCommand'))}\n\n{esc(row.get('executeAfterPreviewRejectCommand'))}</pre></details>
        </article>
        """)
    runway_candidate_html = []
    for row in runway.get("candidateActions") or []:
        thumbnail = str(row.get("previewPath") or "")
        image_html = f"<img class='candidate-thumb' src='{esc(Path(thumbnail).as_uri())}' alt='{esc(row.get('photoId'))}'>" if thumbnail and Path(thumbnail).exists() else "<div class='candidate-thumb empty'>Open source to preview</div>"
        runway_candidate_html.append(f"""
        <article class="candidate">
          <div class="topline"><span>Photo {esc(row.get('rank'))}</span><strong>{esc(row.get('photoId') or row.get('groupId'))}</strong></div>
          {image_html}
          <div class="chips"><span>{esc(row.get('decision'))}</span><span>{esc(row.get('suggestedAction'))}</span><span>{esc(row.get('groupId'))}</span></div>
          <p class="path">{esc(row.get('sourcePath'))}</p>
          <details><summary>Preview single-photo decisions</summary><pre>{esc(row.get('dryRunReviewCommand'))}\n\n{esc(row.get('dryRunKeepCommand'))}\n\n{esc(row.get('dryRunRejectCommand'))}</pre></details>
        </article>
        """)
    action_html = []
    for row in packet.get("actionRows") or []:
        action_html.append(f"""
        <article class="action-row">
          <div class="kicker">{esc(row.get('status'))}</div>
          <h3>{esc(row.get('title'))}</h3>
          <p>{esc(row.get('why'))}</p>
          <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(row.get('itemCount'))} items</span><span>{esc(row.get('pending'))} pending</span><span>{esc(row.get('selected'))} selected</span></div>
          <details><summary>Paths and safety</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    group_html = []
    for row in packet.get("groupRows") or []:
        group_html.append(f"""
        <article class="group {esc(row.get('priority'))}">
          <div class="topline"><span>{esc(row.get('priority'))}</span><strong>{esc(row.get('groupId'))}</strong></div>
          <h3>{esc(row.get('firstFilename'))}</h3>
          <p>{esc(row.get('nextSafestAction'))}</p>
          <div class="chips"><span>{esc(row.get('size'))} photos</span><span>{esc(row.get('pending'))} pending</span><span>{esc(row.get('review'))} review</span><span>{esc(safe_int(row.get('keep')) + safe_int(row.get('favorite')))} selected</span></div>
          <p class="path">{esc(row.get('firstSourcePath'))}</p>
          <details><summary>Group JSON</summary><pre>{esc(json.dumps(row, indent=2))}</pre></details>
        </article>
        """)
    candidate_html = []
    for row in packet.get("nextCandidateRows") or []:
        thumbnail = str(row.get("thumbnailUri") or "")
        image_html = f"<img class='candidate-thumb' src='{esc(thumbnail)}' alt='{esc(row.get('filename'))}'>" if thumbnail else "<div class='candidate-thumb empty'>No thumbnail</div>"
        quality = ", ".join(row.get("qualityFlags") or row.get("flags") or []) or "no quality flags"
        candidate_html.append(f"""
        <article class="candidate">
          <div class="topline"><span>{esc(row.get('status'))}</span><strong>{esc(row.get('filename'))}</strong></div>
          {image_html}
          <div class="chips"><span>{esc(row.get('reviewGroupId'))}</span><span>{esc(row.get('reviewGroupPosition'))}/{esc(row.get('reviewGroupSize'))}</span><span>{esc(row.get('pixelWidth'))}x{esc(row.get('pixelHeight'))}</span></div>
          <p><strong>Human ask:</strong> {esc(row.get('humanAsk'))}</p>
          <p><strong>Review hint:</strong> {esc(row.get('qualityNote') or quality)}</p>
          <ul>
            {''.join(f"<li>{esc(item)}</li>" for item in row.get('cullRubric') or [])}
          </ul>
          <p><strong>Agent-safe parallel work:</strong> {esc(row.get('agentSafeParallelWork'))}</p>
          <p>{esc(row.get('sourcePath'))}</p>
          <details><summary>1. Open and preview dry-runs</summary><pre>{esc(row.get('openSourceCommand'))}\n\n{esc(row.get('dryRunReviewCommand'))}\n\n{esc(row.get('dryRunKeep4Command'))}\n\n{esc(row.get('dryRunFavorite5Command'))}\n\n{esc(row.get('dryRunRejectCommand'))}</pre></details>
          <details><summary>2. Execute metadata only after visual review</summary><pre>{esc(row.get('markReviewCommand'))}\n\n{esc(row.get('markKeep4Command'))}\n\n{esc(row.get('markFavorite5Command'))}\n\n{esc(row.get('markRejectCommand'))}</pre></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Decision Desk</title>
  <style>
    :root {{ color-scheme:dark; --bg:#10170f; --panel:#172516; --ink:#fff2d4; --muted:#cdbb99; --moss:#8fbd72; --water:#7ac9d7; --gold:#e5c65a; --clay:#c97855; --line:rgba(255,242,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 15% -8%, rgba(122,201,215,.2), transparent 36%), radial-gradient(circle at 90% 0%, rgba(143,189,114,.18), transparent 34%), linear-gradient(180deg,#172214,#070a06); }}
    header {{ padding:48px clamp(20px,5vw,84px); border-bottom:1px solid var(--line); }}
    .eyebrow,.kicker {{ color:var(--gold); text-transform:uppercase; letter-spacing:.24em; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1080px; margin:12px 0; font-size:clamp(42px,7vw,88px); line-height:.9; letter-spacing:-.05em; }}
    h2 {{ margin:0 0 16px; color:var(--gold); }}
    h3 {{ margin:8px 0; }}
    p {{ color:var(--muted); line-height:1.45; }}
    header p {{ max-width:980px; font-size:18px; }}
    .summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-top:24px; }}
    .contract {{ margin-top:22px; border:1px solid var(--line); border-radius:24px; padding:18px; background:rgba(255,255,255,.045); }}
    .contract h2 {{ margin:0 0 8px; color:var(--gold); font-size:18px; }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.055); }}
    .stat b {{ display:block; font-size:32px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ padding:30px clamp(16px,4vw,58px) 76px; display:grid; gap:22px; }}
    section {{ border:1px solid var(--line); border-radius:30px; padding:22px; background:linear-gradient(180deg,rgba(23,37,22,.94),rgba(7,10,6,.97)); box-shadow:0 22px 58px rgba(0,0,0,.25); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(330px,1fr)); gap:14px; }}
    article {{ border:1px solid var(--line); border-radius:20px; padding:16px; background:rgba(0,0,0,.2); }}
    .group.review-routed {{ border-color:rgba(122,201,215,.62); }}
    .group.pending {{ border-color:rgba(229,198,90,.55); }}
    .group.selected {{ border-color:rgba(143,189,114,.62); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; color:var(--gold); text-transform:uppercase; letter-spacing:.11em; font-size:11px; font-weight:950; }}
    .chips {{ display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }}
    .chips span {{ border:1px solid var(--line); border-radius:999px; padding:7px 9px; background:rgba(255,255,255,.055); font-size:12px; font-weight:850; }}
    .path, pre {{ overflow-wrap:anywhere; }}
    .candidate-thumb {{ width:100%; aspect-ratio:3/2; object-fit:cover; border-radius:14px; border:1px solid var(--line); background:rgba(0,0,0,.34); margin:10px 0 8px; }}
    .candidate-thumb.empty {{ display:flex; align-items:center; justify-content:center; color:var(--muted); }}
    summary {{ cursor:pointer; color:var(--water); font-weight:850; }}
    pre {{ white-space:pre-wrap; color:var(--muted); background:rgba(0,0,0,.32); border-radius:14px; padding:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove Decision Desk</div>
    <h1>Choose gently. Preserve fiercely.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
    <div class="summary">
      <div class="stat"><b>{esc(counts.get('total'))}</b><span>Total</span></div>
      <div class="stat"><b>{esc(counts.get('pending'))}</b><span>Pending</span></div>
      <div class="stat"><b>{esc(counts.get('review'))}</b><span>Review</span></div>
      <div class="stat"><b>{esc(counts.get('keep'))}</b><span>Keep</span></div>
      <div class="stat"><b>{esc(counts.get('favorite'))}</b><span>Favorite</span></div>
      <div class="stat"><b>{esc(counts.get('reject'))}</b><span>Reject</span></div>
      <div class="stat"><b>{esc(counts.get('events'))}</b><span>Events</span></div>
      <div class="stat"><b>{esc(counts.get('selectedForClientProof'))}</b><span>Selected</span></div>
    </div>
    <div class="contract">
      <h2>Human ask</h2>
      <p>{esc(packet.get('humanAsk'))}</p>
      <h2>Codex can safely do</h2>
      <p>{esc(packet.get('agentSafeParallelWork'))}</p>
      <details><summary>Review contract</summary><pre>{esc(json.dumps(packet.get('reviewContract') or {}, indent=2))}</pre></details>
    </div>
  </header>
  <main>
    <section>
      <h2>First-pass cull runway</h2>
      <p><strong>Status:</strong> {esc(runway.get('status'))} · <strong>Next:</strong> {esc(runway.get('nextAction'))}</p>
      <div class="chips">
        <span>{esc(runway.get('starterGroupCount'))} starter groups</span>
        <span>{esc(runway.get('starterCandidateCount'))} starter photos</span>
        <span>{esc(runway.get('reviewGroupCount'))} review groups</span>
        <span>{esc(runway.get('pendingGroupCount'))} pending groups</span>
      </div>
      <details><summary>Safety contract</summary><pre>{esc(json.dumps(runway.get('safetyContract') or {}, indent=2))}</pre></details>
      <div class="grid">{''.join(runway_group_html) or '<p>No first-pass group actions yet.</p>'}</div>
    </section>
    <section><h2>Starter photo candidates</h2><div class="grid">{''.join(runway_candidate_html) or '<p>No starter candidates yet.</p>'}</div></section>
    <section><h2>Decision workbench</h2><div class="grid">{''.join(action_html) or '<p>No action rows yet.</p>'}</div></section>
    <section><h2>Group decision map</h2><div class="grid">{''.join(group_html) or '<p>No groups yet.</p>'}</div></section>
    <section><h2>Next candidates</h2><div class="grid">{''.join(candidate_html) or '<p>No pending/review candidates.</p>'}</div></section>
    <section><h2>Recent receipts and snapshots</h2><pre>{esc(json.dumps({'receipts': packet.get('recentDecisionReceipts'), 'snapshots': packet.get('recentLedgerSnapshots'), 'lastDecision': packet.get('lastDecision')}, indent=2))}</pre></section>
    <section><h2>Source pointers</h2><pre>{esc(json.dumps(packet.get('sourcePointers') or {}, indent=2))}</pre></section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(photo_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path, candidates_csv_path: Path) -> None:
    first_safe = {
        "label": "Open Photo Grove Decision Desk",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local decision evidence only. No metadata command executes and no originals or deliverables are changed.",
    }
    first_candidate = (packet.get("nextCandidateRows") or [{}])[0]
    first_candidate_preview = {
        "label": "Preview the first candidate before any metadata decision",
        "photoId": first_candidate.get("photoId") or "",
        "filename": first_candidate.get("filename") or "",
        "thumbnailPath": first_candidate.get("thumbnailPath") or "",
        "qualityNote": first_candidate.get("qualityNote") or "",
        "openSourceCommand": first_candidate.get("openSourceCommand") or "",
        "dryRunReviewCommand": first_candidate.get("dryRunReviewCommand") or "",
        "dryRunKeep4Command": first_candidate.get("dryRunKeep4Command") or "",
        "dryRunFavorite5Command": first_candidate.get("dryRunFavorite5Command") or "",
        "dryRunRejectCommand": first_candidate.get("dryRunRejectCommand") or "",
        "executeReviewCommandAfterPreview": first_candidate.get("markReviewCommand") or "",
        "executeKeepCommandAfterPreview": first_candidate.get("markKeep4Command") or "",
        "executeFavoriteCommandAfterPreview": first_candidate.get("markFavorite5Command") or "",
        "executeRejectCommandAfterPreview": first_candidate.get("markRejectCommand") or "",
        "safety": "Dry-run commands report planned ledger changes without writing receipts, copying files, mutating originals, or creating client delivery truth. Execute commands are metadata-only and should follow visual review.",
    }
    pointer_payload = {
        "schema": "quipsly.photo-grove.latest-decision-desk.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "decision-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "candidatesCsvPath": str(candidates_csv_path),
        "sessionDir": str(out_dir),
        "latestReviewSessionDir": packet.get("latestSessionDir") or "",
        "counts": packet.get("counts") or {},
        "truth": packet.get("truth") or "",
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "reviewContract": packet.get("reviewContract") or {},
        "sourceTasks": packet.get("sourceTasks") or [],
        "firstPassRunwayStatus": packet.get("firstPassRunwayStatus") or "",
        "firstPassCullRunway": packet.get("firstPassCullRunway") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "Open Photo Grove decision evidence before metadata review commands.",
        "firstSafeAction": first_safe,
        "firstCandidatePreview": first_candidate_preview,
        "sourcePointers": packet.get("sourcePointers") or {},
        "originalsMutated": False,
        "metadataCommandsExecuted": False,
        "copyPlanExecuted": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }
    write_json(photo_root / LATEST_POINTER, pointer_payload)
    packet["firstSafeAction"] = first_safe
    packet["firstCandidatePreview"] = first_candidate_preview


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a read-only Photo Grove Decision Desk.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()
    photo_root = Path(args.photo_root)
    packet = build_packet(photo_root)
    out_dir = prepare_output_dir(photo_root)
    json_path = out_dir / "photo-grove-decision-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-photo-grove-decision-desk.md"
    csv_path = out_dir / "photo-grove-decision-groups.csv"
    candidates_csv_path = out_dir / "photo-grove-next-candidates.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "candidatesCsvPath": str(candidates_csv_path),
    })
    update_pointer(photo_root, out_dir, packet, html_path, json_path, markdown_path, csv_path, candidates_csv_path)
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet.get("groupRows") or [])
    write_candidate_csv(candidates_csv_path, packet.get("nextCandidateRows") or [])
    write_html(html_path, packet)
    print(json.dumps({
        "status": packet.get("status") or "decision-desk-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "candidatesCsvPath": str(candidates_csv_path),
        "counts": packet.get("counts"),
        "originalsMutated": False,
        "metadataCommandsExecuted": False,
        "copyPlanExecuted": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
