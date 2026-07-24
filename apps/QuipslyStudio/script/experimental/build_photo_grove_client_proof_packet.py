#!/usr/bin/env python3
"""Build a Photo Grove client proof/export-readiness packet.

The packet is a local reviewer surface. It never copies deliverables, exports client
files, mutates originals, uploads, publishes, or marks photos approved. It turns
current review metadata into a clear proof-readiness map: selected, review,
pending, rejected, and safe next actions.
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
from urllib.parse import quote

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-photo-client-proof")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_latest_cull_suggestions(session_dir: Path) -> tuple[Path, dict[str, Any]]:
    candidates = sorted(
        session_dir.glob("cull-suggestions/*/photo-cull-suggestions.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        return Path(""), {}
    path = candidates[0]
    return path, load_json(path)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def file_uri(path_value: str) -> str:
    try:
        return Path(path_value).as_uri()
    except ValueError:
        return "file://" + quote(path_value)


def resolve_latest_session(photo_root: Path) -> Path:
    pointer = load_json(photo_root / "latest-photo-grove-review.json")
    latest = pointer.get("latestSessionDir")
    if latest:
        path = Path(str(latest))
        if path.exists():
            return path
    candidates = sorted([path for path in photo_root.glob("20*-*") if path.is_dir()], key=lambda path: path.stat().st_mtime, reverse=True)
    if not candidates:
        raise SystemExit(f"No Photo Grove session found under {photo_root}")
    return candidates[0]


def reveal_command(path_value: str) -> str:
    return f"open -R {shlex.quote(path_value)}" if path_value else ""


def normalize_status(value: Any) -> str:
    status = str(value or "pending").lower()
    if status not in {"favorite", "keep", "review", "reject", "pending"}:
        return "pending"
    return status


def status_of(review: dict[str, Any]) -> str:
    return normalize_status(review.get("status"))


def load_review_decisions(session_dir: Path) -> tuple[Path, dict[str, dict[str, Any]], dict[str, dict[str, Any]], dict[str, int]]:
    ledger_path = session_dir / "review-ledger.json"
    ledger = load_json(ledger_path)
    decisions = ledger.get("decisions") if isinstance(ledger.get("decisions"), list) else []
    by_id: dict[str, dict[str, Any]] = {}
    by_filename: dict[str, dict[str, Any]] = {}
    status_counts: dict[str, int] = {}
    for decision in decisions:
        if not isinstance(decision, dict):
            continue
        status = normalize_status(decision.get("status"))
        status_counts[status] = status_counts.get(status, 0) + 1
        decision_id = str(decision.get("id") or "")
        filename = str(decision.get("filename") or "")
        if decision_id:
            by_id[decision_id] = decision
        if filename:
            by_filename[filename] = decision
    return ledger_path, by_id, by_filename, status_counts


def review_for_item(item: dict[str, Any], ledger_by_id: dict[str, dict[str, Any]], ledger_by_filename: dict[str, dict[str, Any]]) -> dict[str, Any]:
    item_id = str(item.get("id") or "")
    filename = str(item.get("filename") or "")
    ledger_review = ledger_by_id.get(item_id) or ledger_by_filename.get(filename)
    if ledger_review:
        return ledger_review
    review = item.get("review") if isinstance(item.get("review"), dict) else {}
    return review


def photo_record(item: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    quality = analysis.get("qualityHints") if isinstance(analysis.get("qualityHints"), dict) else {}
    source_path = str(review.get("sourcePath") or item.get("sourcePath") or "")
    thumb = str(item.get("thumbnailPath") or "")
    return {
        "id": review.get("id") or item.get("id") or "",
        "filename": review.get("filename") or item.get("filename") or "",
        "relativePath": item.get("relativePath") or "",
        "sourcePath": source_path,
        "thumbnailPath": thumb,
        "sourceRevealCommand": reveal_command(source_path),
        "thumbnailOpenCommand": f"open {shlex.quote(thumb)}" if thumb else "",
        "status": status_of(review),
        "rating": review.get("rating"),
        "tags": review.get("tags") or [],
        "note": review.get("note") or "",
        "kind": item.get("kind") or "",
        "bytesLabel": item.get("bytesLabel") or "",
        "reviewGroupId": review.get("reviewGroupId") or analysis.get("reviewGroupId") or "",
        "reviewGroupPosition": review.get("reviewGroupPosition") or analysis.get("reviewGroupPosition") or "",
        "reviewGroupSize": review.get("reviewGroupSize") or analysis.get("reviewGroupSize") or "",
        "qualityFlags": quality.get("qualityFlags") or [],
        "problemFlags": analysis.get("problemFlags") or [],
        "qualityNote": quality.get("qualityNote") or "",
    }


def candidate_score(record: dict[str, Any]) -> tuple[int, str]:
    """Rank review-start candidates without making a keep/reject verdict."""
    status = str(record.get("status") or "pending")
    flags = len(record.get("qualityFlags") or []) + len(record.get("problemFlags") or [])
    group_size = int(record.get("reviewGroupSize") or 0)
    rating = record.get("rating")
    try:
        rating_value = int(rating)
    except Exception:
        rating_value = 0
    status_rank = {"review": 0, "pending": 1, "keep": 2, "favorite": 2, "reject": 9}.get(status, 5)
    return (status_rank * 100 + flags * 12 - rating_value * 4 - min(group_size, 6), str(record.get("filename") or ""))


def candidate_starter_set(records: list[dict[str, Any]], limit: int = 24) -> list[dict[str, Any]]:
    candidates = [
        record
        for record in records
        if record.get("status") in {"review", "pending"}
    ]
    ranked = sorted(candidates, key=candidate_score)[:limit]
    starter: list[dict[str, Any]] = []
    for index, record in enumerate(ranked, start=1):
        item_id = str(record.get("id") or "")
        group_id = str(record.get("reviewGroupId") or "")
        enriched = dict(record)
        enriched["candidateRank"] = index
        enriched["candidateReason"] = "Suggested starting point for human cull review, not a keep verdict."
        enriched["metadataOnlyCommands"] = {
            "markReview": f"./script/agentctl.sh photo-grove-decision {item_id} review - needs-human-cull reviewer '<inspect this candidate before deciding>'" if item_id else "",
            "markKeepAfterInspection": f"./script/agentctl.sh photo-grove-decision {item_id} keep 4 client-proof-candidate reviewer '<keeper after human/source review>'" if item_id else "",
            "markFavoriteAfterInspection": f"./script/agentctl.sh photo-grove-decision {item_id} favorite 5 hero-candidate reviewer '<hero after human/source review>'" if item_id else "",
            "reviewGroup": f"./script/agentctl.sh photo-grove-group-decision {group_id} review - needs-human-cull reviewer '<compare this group before selecting proof candidates>'" if group_id else "",
        }
        starter.append(enriched)
    return starter


def proof_prep_recipe(starter_candidates: list[dict[str, Any]], delivery_status: str) -> list[dict[str, Any]]:
    first = starter_candidates[0] if starter_candidates else {}
    commands = first.get("metadataOnlyCommands") if isinstance(first.get("metadataOnlyCommands"), dict) else {}
    return [
        {
            "label": "1. Inspect the first starter candidate",
            "why": "Use thumbnail and source reveal as evidence, not as an automatic keep/reject verdict.",
            "command": first.get("sourceRevealCommand") or "",
            "safety": "Opens local source evidence only. No metadata or original file changes.",
        },
        {
            "label": "2. Compare the candidate's nearby group",
            "why": "Most photo culling quality comes from comparing similar frames, not judging one thumbnail in isolation.",
            "command": commands.get("reviewGroup") or "",
            "safety": "Metadata command shape only; run after review intent is clear.",
        },
        {
            "label": "3. Mark one decision as metadata only",
            "why": "Use keep/favorite/review/reject as reversible sidecar truth before any client delivery exists.",
            "command": commands.get("markKeepAfterInspection") or commands.get("markReview") or "",
            "safety": "Metadata-only decision. Originals stay untouched; client delivery is not created.",
        },
        {
            "label": "4. Regenerate proof readiness",
            "why": "After a few deliberate decisions, rebuild this packet so selected/review/pending counts tell the truth.",
            "command": "./script/agentctl.sh photo-grove-client-proof-packet",
            "safety": "Creates a new local packet version only. No deliverables copied.",
        },
        {
            "label": "5. Prepare client proof only after selected set exists",
            "why": "A starter set is not a client proof. Selected keep/favorite metadata should come first.",
            "command": "",
            "safety": "Delivery remains blocked until explicit human approval and a separate copy/export step.",
        },
    ]


def proof_mode_packet(delivery_status: str, selected_count: int, starter_candidates: list[dict[str, Any]]) -> dict[str, Any]:
    starter_count = len(starter_candidates)
    if selected_count == 0:
        return {
            "mode": "starter-review-deck",
            "label": "Starter review deck",
            "clientFacingAllowed": False,
            "humanMeaning": (
                "No photos have been deliberately kept/favorited yet. This packet is useful for culling, "
                "but it is not a client proof and should not be sent to a client."
            ),
            "nextReviewLoop": [
                "Open the starter review deck.",
                "Compare one small visual group.",
                "Mark only the obvious keep/favorite/review/reject decisions as metadata sidecars.",
                "Regenerate the packet and watch selected count rise before making a client proof.",
            ],
            "agentMeaning": (
                "Prepare comparison context, grouping, dry-run commands, and review notes. Do not execute metadata "
                "or call the packet client-ready without selected keep/favorite truth."
            ),
            "starterCandidateCount": starter_count,
            "selectedCount": selected_count,
            "deliveryStatus": delivery_status,
        }
    return {
        "mode": "selected-proof-prep",
        "label": "Selected proof prep",
        "clientFacingAllowed": False,
        "humanMeaning": (
            "Selected keep/favorite metadata exists, so this can be reviewed toward a client proof. "
            "It still needs explicit human approval before delivery/export/upload."
        ),
        "nextReviewLoop": [
            "Review selected keep/favorite photos.",
            "Remove accidental keepers by metadata sidecar if needed.",
            "Confirm export/copy plan separately.",
            "Only then create a versioned client delivery packet with explicit approval.",
        ],
        "agentMeaning": "Validate selected set, export plan, manifests, and receipt slots without creating external delivery truth.",
        "starterCandidateCount": starter_count,
        "selectedCount": selected_count,
        "deliveryStatus": delivery_status,
    }


def starter_review_deck(starter_candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build review rows that are explicit about evidence and non-delivery truth."""
    rows: list[dict[str, Any]] = []
    for record in starter_candidates:
        commands = record.get("metadataOnlyCommands") if isinstance(record.get("metadataOnlyCommands"), dict) else {}
        rows.append({
            "rank": record.get("candidateRank"),
            "id": record.get("id") or "",
            "filename": record.get("filename") or "",
            "status": record.get("status") or "pending",
            "rating": record.get("rating"),
            "reviewGroupId": record.get("reviewGroupId") or "",
            "reviewGroupSize": record.get("reviewGroupSize") or "",
            "thumbnailPath": record.get("thumbnailPath") or "",
            "sourcePath": record.get("sourcePath") or "",
            "sourceRevealCommand": record.get("sourceRevealCommand") or "",
            "qualityFlags": record.get("qualityFlags") or [],
            "problemFlags": record.get("problemFlags") or [],
            "candidateReason": record.get("candidateReason") or "Suggested starter candidate only.",
            "reviewQuestions": [
                "Is this frame actually sharp enough when opened from source?",
                "Is there a nearby duplicate or burst member that is better?",
                "Should this become keep, favorite, review, or reject metadata?",
            ],
            "metadataOnlyCommands": commands,
            "truth": "Starter review row only. It is not selected, delivered, uploaded, published, copied, or approved.",
        })
    return rows


def write_starter_decision_worksheet(path: Path, packet: dict[str, Any], limit: int = 6) -> None:
    """Write a tiny human/agent cull worksheet without creating cull truth."""
    rows = (packet.get("starterReviewDeck") or [])[:limit]
    lines = [
        "# Photo Grove starter decision worksheet",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        "This is a small working sheet for one careful culling pass. It does not mark keep/reject, copy files, deliver a client proof, upload, publish, mutate originals, or capture receipts.",
        "",
        f"Source session: `{packet.get('sessionDir')}`",
        f"Client-facing allowed: `{packet.get('clientFacingAllowed', False)}`",
        f"Delivery status: `{packet.get('deliveryStatus')}`",
        "",
        "## Review rhythm",
        "",
        "1. Open/reveal one source photo.",
        "2. Compare it to the group/nearby candidates.",
        "3. Write the reason in plain English.",
        "4. Only if the intent is obvious, copy one metadata-only command into a terminal deliberately.",
        "5. Regenerate Photo Grove status/client proof after any approved sidecar decision.",
        "",
        "## First six decisions",
        "",
    ]
    if not rows:
        lines.extend([
            "No starter review rows were available. Rebuild the Photo Grove cull suggestions and client proof packet first.",
            "",
        ])
    for row in rows:
        commands = row.get("metadataOnlyCommands") if isinstance(row.get("metadataOnlyCommands"), dict) else {}
        command_lines = []
        for label in ("markKeepAfterInspection", "markFavoriteAfterInspection", "markReview", "markRejectAfterInspection"):
            command = commands.get(label)
            if command:
                command_lines.append(f"- {label}: `{command}`")
        lines.extend([
            f"### {row.get('rank') or '?'} - {row.get('filename') or row.get('id')}",
            "",
            f"- Photo ID: `{row.get('id')}`",
            f"- Current status: `{row.get('status')}`",
            f"- Group: `{row.get('reviewGroupId') or '-'}`",
            f"- Source: `{row.get('sourcePath') or '-'}`",
            f"- Thumbnail: `{row.get('thumbnailPath') or '-'}`",
            f"- Reveal source: `{row.get('sourceRevealCommand') or '-'}`",
            f"- Flags: `{', '.join([*(row.get('qualityFlags') or []), *(row.get('problemFlags') or [])]) or 'none'}`",
            f"- Why this row is here: {row.get('candidateReason') or row.get('truth') or 'Starter candidate only.'}",
            "",
            "Decision:",
            "",
            "- [ ] Keep",
            "- [ ] Favorite",
            "- [ ] Review hold",
            "- [ ] Reject",
            "- [ ] Needs group comparison first",
            "",
            "Reason:",
            "",
            "> ",
            "",
            "Metadata-only commands, if explicitly approved:",
            "",
            *command_lines,
            "",
        ])
    lines.extend([
        "## After this worksheet",
        "",
        "- If no decisions were made, keep the packet as review evidence only.",
        "- If one or more sidecar decisions were approved and executed, run `./script/agentctl.sh photo-grove-status latest` and `./script/agentctl.sh photo-grove-client-proof latest`.",
        "- Do not create a client-facing proof until selected keep/favorite truth exists and delivery is explicitly approved.",
        "",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def build_packet(session_dir: Path, limit_per_section: int = 48) -> dict[str, Any]:
    manifest_path = session_dir / "manifest.json"
    review_status_path = session_dir / "review-status.json"
    export_prep_path = session_dir / "export-packets" / "photo-grove-export-prep.json"
    manifest = load_json(manifest_path)
    review_status = load_json(review_status_path)
    export_prep = load_json(export_prep_path)
    cull_suggestions_path, cull_suggestions = load_latest_cull_suggestions(session_dir)
    cull_groups = cull_suggestions.get("suggestions") if isinstance(cull_suggestions.get("suggestions"), list) else []
    first_cull_group = cull_groups[0] if cull_groups and isinstance(cull_groups[0], dict) else {}
    review_ledger_path, ledger_by_id, ledger_by_filename, ledger_status_counts = load_review_decisions(session_dir)
    items = manifest.get("items") if isinstance(manifest.get("items"), list) else []
    records = [
        photo_record(item, review_for_item(item, ledger_by_id, ledger_by_filename))
        for item in items
        if isinstance(item, dict)
    ]
    sections = {
        "selected": [r for r in records if r["status"] in {"favorite", "keep"}],
        "review": [r for r in records if r["status"] == "review"],
        "pending": [r for r in records if r["status"] == "pending"],
        "rejected": [r for r in records if r["status"] == "reject"],
    }
    quality_attention = [r for r in records if r["qualityFlags"] or r["problemFlags"]]
    starter_candidates = candidate_starter_set(records, limit=min(limit_per_section, 24))
    selected_count = len(sections["selected"])
    pending_count = len(sections["pending"])
    review_count = len(sections["review"])
    delivery_status = "not-ready-needs-cull" if selected_count == 0 or pending_count or review_count else "ready-for-client-proof-prep"
    review_recipe = proof_prep_recipe(starter_candidates, delivery_status)
    proof_mode = proof_mode_packet(delivery_status, selected_count, starter_candidates)
    starter_review_rows = starter_review_deck(starter_candidates)
    output_dir = session_dir / "client-proof-packets" / stamp_now()
    output_dir.mkdir(parents=True, exist_ok=False)
    first_starter_candidate = starter_candidates[0] if starter_candidates else {}
    human_ask = (
        "Inspect the candidate starter set and make a small number of metadata-only keep/favorite/review/reject decisions before preparing a client-facing proof."
        if delivery_status == "not-ready-needs-cull"
        else "Review the selected keeper set and approve a versioned client proof export only after the selection is intentionally ready."
    )
    agent_safe_parallel_work = (
        "Keep grouping, thumbnailing, validating packets, and preparing dry-run metadata commands. "
        "Do not mutate originals, execute metadata decisions, copy delivery files, upload, publish, or mark client proof delivery as created."
    )
    first_safe_action = {
        "label": "Open Photo Grove client proof packet",
        "command": f"open {shlex.quote(str(output_dir / 'index.html'))}",
        "path": str(output_dir / "index.html"),
        "safety": "Opens local culling/proof evidence only. No metadata, original, delivery, upload, publication, or account changes.",
    }
    source_tasks = [
        {
            "id": "inspect-starter-candidate",
            "label": "Inspect first starter candidate",
            "humanAsk": "Open or reveal the first starter candidate and compare it to nearby photos before making any keep/reject decision.",
            "agentSafeWork": "Expose source path, thumbnail path, nearby group context, and dry-run metadata commands only.",
            "doneWhen": "Reviewer knows whether the first starter candidate is keep, favorite, review, reject, or needs nearby comparison.",
        },
        {
            "id": "mark-small-keeper-set",
            "label": "Mark a small keeper set",
            "humanAsk": "After visual review, mark a few keep/favorite/review decisions as metadata-only sidecar truth.",
            "agentSafeWork": "Prepare command sheets and regenerate packets after decisions; do not deliver to clients.",
            "doneWhen": "The selected count is nonzero and pending/review counts explain remaining work honestly.",
        },
        {
            "id": "prepare-proof-after-selection",
            "label": "Prepare proof after selection",
            "humanAsk": "Only after selected photos exist, approve a separate versioned client proof packet/export step.",
            "agentSafeWork": "Keep export-prep manifests and receipt slots separate from delivery truth.",
            "doneWhen": "Client proof readiness is backed by selected metadata and explicit human approval.",
        },
    ]
    packet: dict[str, Any] = {
        "schema": "quipsly.photo-grove.client-proof-packet.v1",
        "generatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "sessionOutputDir": str(output_dir),
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "photo-client-proof-packet.json"),
        "markdownPath": str(output_dir / "START-HERE-photo-client-proof.md"),
        "csvPath": str(output_dir / "photo-client-proof-queue.csv"),
        "starterDecisionWorksheetPath": str(output_dir / "starter-decision-worksheet.md"),
        "sourceManifest": str(manifest_path),
        "sourceReviewStatus": str(review_status_path),
        "sourceExportPrep": str(export_prep_path),
        "sourceReviewLedger": str(review_ledger_path),
        "sourceCullSuggestions": str(cull_suggestions_path) if cull_suggestions_path != Path("") else "",
        "status": delivery_status,
        "deliveryStatus": delivery_status,
        "proofMode": proof_mode,
        "clientFacingAllowed": False,
        "truth": "Client proof packet only. It does not copy deliverables, mutate originals, upload, publish, or mark photos approved.",
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_parallel_work,
        "firstSafeAction": first_safe_action,
        "sourceTasks": source_tasks,
        "counts": {
            "total": len(records),
            "selected": selected_count,
            "favorite": sum(1 for r in records if r["status"] == "favorite"),
            "keep": sum(1 for r in records if r["status"] == "keep"),
            "review": review_count,
            "pending": pending_count,
            "reject": len(sections["rejected"]),
            "qualityAttention": len(quality_attention),
            "candidateStarterSet": len(starter_candidates),
            "starterReviewDeckRows": len(starter_review_rows),
            "cullSuggestionGroups": len(cull_groups),
            "originalsMutated": bool(manifest.get("counts", {}).get("originalsMutated") or review_status.get("originalsMutated") or export_prep.get("originalsMutated")),
            "externalDeliveryCreated": bool(export_prep.get("externalDeliveryCreated")),
            "copyPlanExecuted": bool(export_prep.get("copyPlanExecuted")),
            "proofSelectionRequiredBeforeDelivery": selected_count == 0,
        },
        "cullSuggestionSummary": cull_suggestions.get("counts") or {},
        "firstCullSuggestionGroup": first_cull_group,
        "cullSuggestionGroups": cull_groups[:12],
        "sections": {
            key: value[:limit_per_section]
            for key, value in sections.items()
        },
        "qualityAttention": quality_attention[:limit_per_section],
        "candidateStarterSet": starter_candidates,
        "starterReviewDeck": starter_review_rows,
        "firstStarterCandidate": first_starter_candidate,
        "firstCandidateStarter": first_starter_candidate,
        "proofPrepRecipe": review_recipe,
        "reviewCommands": {
            "markKeep": "./script/agentctl.sh photo-grove-decision <photo-id> keep 4 client-proof-candidate reviewer '<why this is a keeper>'",
            "markFavorite": "./script/agentctl.sh photo-grove-decision <photo-id> favorite 5 hero-candidate reviewer '<why this is a hero image>'",
            "markReview": "./script/agentctl.sh photo-grove-decision <photo-id> review - needs-human-cull reviewer '<what needs inspection>'",
            "markReject": "./script/agentctl.sh photo-grove-decision <photo-id> reject - rejected-after-review reviewer '<why reject after review>'",
            "groupReview": "./script/agentctl.sh photo-grove-group-decision <group-id> review - needs-human-cull reviewer '<compare burst/group before deciding>'",
        },
        "nextSafestAction": (
            "Use this as a starter review deck. Cull or favorite at least a small keeper set before building a client-facing proof packet."
            if delivery_status == "not-ready-needs-cull"
            else "Review the selected set, then create a versioned delivery packet only after explicit human approval."
        ),
        "sourceCounts": {
            "reviewLedger": ledger_status_counts,
            "reviewStatus": review_status.get("counts") or {},
            "exportPrep": export_prep.get("counts") or {},
            "manifest": manifest.get("counts") or {},
        },
    }
    write_json(output_dir / "photo-client-proof-packet.json", packet)
    write_csv(output_dir / "photo-client-proof-queue.csv", packet)
    write_markdown(output_dir / "START-HERE-photo-client-proof.md", packet)
    write_starter_decision_worksheet(output_dir / "starter-decision-worksheet.md", packet)
    write_html(output_dir / "index.html", packet)
    pointer = {
        "schema": "quipsly.photo-grove.latest-client-proof-packet.v1",
        "updatedAt": iso_now(),
        "status": packet["status"],
        "sessionDir": str(session_dir),
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "starterDecisionWorksheetPath": packet["starterDecisionWorksheetPath"],
        "deliveryStatus": delivery_status,
        "proofMode": packet.get("proofMode") or {},
        "clientFacingAllowed": False,
        "humanAsk": packet["humanAsk"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "firstSafeAction": packet["firstSafeAction"],
        "sourceTasks": packet["sourceTasks"],
        "counts": packet["counts"],
        "nextSafestAction": packet["nextSafestAction"],
        "candidateStarterSetCount": len(packet.get("candidateStarterSet") or []),
        "starterReviewDeckCount": len(packet.get("starterReviewDeck") or []),
        "starterReviewDeck": (packet.get("starterReviewDeck") or [])[:24],
        "starterDecisionWorksheetRows": min(6, len(packet.get("starterReviewDeck") or [])),
        "firstStarterCandidate": packet.get("firstStarterCandidate") or {},
        "firstCandidateStarter": packet.get("firstCandidateStarter") or packet.get("firstStarterCandidate") or {},
        "firstCullSuggestionGroup": packet.get("firstCullSuggestionGroup") or {},
        "cullSuggestionGroups": (packet.get("cullSuggestionGroups") or [])[:8],
        "cullSuggestionSummary": packet.get("cullSuggestionSummary") or {},
        "sourceCullSuggestions": packet.get("sourceCullSuggestions") or "",
        "proofPrepRecipe": packet.get("proofPrepRecipe") or [],
        "truth": "Pointer only. Client proof packets are versioned and preserved.",
    }
    write_json(session_dir / "client-proof-packets" / "latest-photo-client-proof-packet.json", pointer)
    write_json(DEFAULT_PHOTO_ROOT / "latest-photo-grove-client-proof-packet.json", pointer)
    return packet


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["section", "id", "filename", "status", "rating", "reviewGroupId", "sourcePath", "thumbnailPath", "sourceRevealCommand", "qualityFlags", "problemFlags"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for section, records in (packet.get("sections") or {}).items():
            for record in records:
                writer.writerow({
                    "section": section,
                    "id": record.get("id"),
                    "filename": record.get("filename"),
                    "status": record.get("status"),
                    "rating": record.get("rating"),
                    "reviewGroupId": record.get("reviewGroupId"),
                    "sourcePath": record.get("sourcePath"),
                    "thumbnailPath": record.get("thumbnailPath"),
                    "sourceRevealCommand": record.get("sourceRevealCommand"),
                    "qualityFlags": ",".join(record.get("qualityFlags") or []),
                    "problemFlags": ",".join(record.get("problemFlags") or []),
                })
        for record in packet.get("candidateStarterSet") or []:
            writer.writerow({
                "section": "candidateStarterSet",
                "id": record.get("id"),
                "filename": record.get("filename"),
                "status": record.get("status"),
                "rating": record.get("rating"),
                "reviewGroupId": record.get("reviewGroupId"),
                "sourcePath": record.get("sourcePath"),
                "thumbnailPath": record.get("thumbnailPath"),
                "sourceRevealCommand": record.get("sourceRevealCommand"),
                "qualityFlags": ",".join(record.get("qualityFlags") or []),
                "problemFlags": ",".join(record.get("problemFlags") or []),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    proof_mode = packet.get("proofMode") if isinstance(packet.get("proofMode"), dict) else {}
    lines = [
        "# Photo Grove client proof packet",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Delivery status: `{packet['deliveryStatus']}`",
        f"Proof mode: `{proof_mode.get('mode') or 'unknown'}`",
        f"Client-facing allowed: `{packet.get('clientFacingAllowed', False)}`",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        "## What this packet is",
        "",
        proof_mode.get("humanMeaning") or "This packet is local review evidence only.",
        "",
        "**Next review loop**",
        "",
    ]
    for step in proof_mode.get("nextReviewLoop") or []:
        lines.append(f"- {step}")
    lines.extend([
        "",
        f"Agent note: {proof_mode.get('agentMeaning') or 'Prepare evidence without mutating metadata or originals.'}",
        "",
        "## Counts",
        "",
    ])
    for key, value in (packet.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Review commands", ""])
    for label, command in (packet.get("reviewCommands") or {}).items():
        lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Proof prep recipe", ""])
    for step in packet.get("proofPrepRecipe") or []:
        lines.extend([
            f"### {step.get('label')}",
            f"- Why: {step.get('why')}",
            f"- Command: `{step.get('command') or ''}`",
            f"- Safety: {step.get('safety')}",
            "",
        ])
    lines.extend(["", f"## Cull suggestion groups ({len(packet.get('cullSuggestionGroups') or [])} shown)", ""])
    lines.append("These are routing hints for source-aware comparison, not automatic keep/reject verdicts.")
    lines.append("")
    for group in packet.get("cullSuggestionGroups") or []:
        lines.extend([
            f"### #{group.get('rank')} `{group.get('groupId')}` - `{group.get('recommendation')}`",
            "",
            f"- Priority: `{group.get('priority')}`",
            f"- Reason: {group.get('reason')}",
            f"- Tone: {group.get('tone')}",
            f"- Flags: `{', '.join(group.get('qualityFlags') or [])}`",
        ])
        for command in group.get("safeLocalCommands") or []:
            if isinstance(command, dict):
                lines.append(f"- {command.get('label')}: `{command.get('command')}`")
        for sample in (group.get("samples") or [])[:4]:
            if isinstance(sample, dict):
                lines.append(f"  - sample `{sample.get('filename')}` `{sample.get('sourceRelativePath')}` thumb `{sample.get('thumbnailPath')}`")
        lines.append("")
    lines.extend(["", f"## Candidate starter set ({len(packet.get('candidateStarterSet') or [])} shown)", ""])
    lines.append("These are review-start candidates only, not selected client proof photos.")
    lines.append("")
    for record in packet.get("candidateStarterSet") or []:
        lines.append(f"- #{record.get('candidateRank')} `{record.get('filename')}` `{record.get('status')}` group `{record.get('reviewGroupId') or '-'}`")
        lines.append(f"  - reason: {record.get('candidateReason') or 'starter candidate only'}")
        commands = record.get("metadataOnlyCommands") if isinstance(record.get("metadataOnlyCommands"), dict) else {}
        for label, command in commands.items():
            if command:
                lines.append(f"  - {label}: `{command}`")
        if record.get("sourceRevealCommand"):
            lines.append(f"  - reveal source: `{record.get('sourceRevealCommand')}`")
    for section, records in (packet.get("sections") or {}).items():
        lines.extend(["", f"## {section.title()} ({len(records)} shown)", ""])
        for record in records[:24]:
            lines.append(f"- `{record.get('filename')}` `{record.get('status')}` group `{record.get('reviewGroupId') or '-'}` thumb `{record.get('thumbnailPath')}`")
            if record.get("sourceRevealCommand"):
                lines.append(f"  - reveal source: `{record.get('sourceRevealCommand')}`")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def record_card(record: dict[str, Any]) -> str:
    thumb = str(record.get("thumbnailPath") or "")
    img = f"<img src=\"{esc(file_uri(thumb))}\" alt=\"{esc(record.get('filename'))}\">" if thumb else "<div class=\"no-thumb\">No thumbnail</div>"
    flags = ", ".join([*(record.get("qualityFlags") or []), *(record.get("problemFlags") or [])]) or "no flags"
    commands = record.get("metadataOnlyCommands") if isinstance(record.get("metadataOnlyCommands"), dict) else {}
    command_rows = "".join(
        f"<li><strong>{esc(label)}</strong><code>{esc(command)}</code></li>"
        for label, command in commands.items()
        if command
    )
    command_details = (
        f"<details><summary>Metadata-only review commands</summary><ul class=\"commands\">{command_rows}</ul></details>"
        if command_rows
        else ""
    )
    rank_badge = f"<b class=\"rank\">#{esc(record.get('candidateRank') or record.get('rank'))}</b>" if record.get("candidateRank") or record.get("rank") else ""
    reason = record.get("candidateReason") or record.get("truth") or ""
    return f"""
    <article class=\"photo-card {esc(record.get('status'))}\">
      {rank_badge}
      {img}
      <div class=\"photo-meta\">
        <strong>{esc(record.get('filename'))}</strong>
        <span>{esc(record.get('status'))} · group {esc(record.get('reviewGroupId') or '-')}</span>
        <small>{esc(flags)}</small>
        <small>{esc(reason)}</small>
        <code>{esc(record.get('sourceRevealCommand'))}</code>
        {command_details}
      </div>
    </article>
    """


def cull_group_card(group: dict[str, Any]) -> str:
    commands = "".join(
        f"<li><strong>{esc(command.get('label'))}</strong><code>{esc(command.get('command'))}</code></li>"
        for command in group.get("safeLocalCommands") or []
        if isinstance(command, dict)
    )
    sample_cards = []
    for sample in (group.get("samples") or [])[:6]:
        if not isinstance(sample, dict):
            continue
        thumb = str(sample.get("thumbnailPath") or "")
        img = f"<img src=\"{esc(file_uri(thumb))}\" alt=\"{esc(sample.get('filename'))}\">" if thumb else "<div class=\"no-thumb\">No thumbnail</div>"
        sample_cards.append(f"""
        <figure>
          {img}
          <figcaption>{esc(sample.get('filename'))}<br><small>{esc(', '.join(sample.get('qualityFlags') or []))}</small></figcaption>
        </figure>
        """)
    return f"""
    <article class=\"cull-group-card\">
      <div class=\"group-head\">
        <div>
          <div class=\"eyebrow\">#{esc(group.get('rank'))} · {esc(group.get('groupId'))}</div>
          <h3>{esc(group.get('recommendation'))}</h3>
        </div>
        <span>{esc(group.get('priority'))}</span>
      </div>
      <p>{esc(group.get('reason'))}</p>
      <p><strong>Review note:</strong> {esc(group.get('tone'))}</p>
      <div class=\"sample-strip\">{''.join(sample_cards)}</div>
      <details><summary>Metadata-only commands</summary><ul class=\"commands\">{commands}</ul></details>
    </article>
    """


def write_html(path: Path, packet: dict[str, Any]) -> None:
    proof_mode = packet.get("proofMode") if isinstance(packet.get("proofMode"), dict) else {}
    mode_steps = "".join(f"<li>{esc(step)}</li>" for step in proof_mode.get("nextReviewLoop") or [])
    worksheet_path = str(packet.get("starterDecisionWorksheetPath") or "")
    worksheet_link = (
        f"<a class=\"worksheet-link\" href=\"{esc(file_uri(worksheet_path))}\">Open starter decision worksheet</a>"
        if worksheet_path
        else ""
    )
    sections = []
    starter_records = packet.get("candidateStarterSet") or []
    recipe_cards = []
    for step in packet.get("proofPrepRecipe") or []:
        recipe_cards.append(f"""
        <article class=\"recipe-card\">
          <h3>{esc(step.get('label'))}</h3>
          <p>{esc(step.get('why'))}</p>
          <code>{esc(step.get('command') or 'No command needed for this step.')}</code>
          <small>{esc(step.get('safety'))}</small>
        </article>
        """)
    sections.append(f"""
    <section>
      <h2>Proof Prep Recipe</h2>
      <p>Use this as the first calm culling loop: inspect, compare, make one metadata-only decision, regenerate, and only then think about client proof delivery.</p>
      <div class=\"recipe-grid\">{''.join(recipe_cards)}</div>
    </section>
    """)
    sections.append(f"""
    <section>
      <h2>Cull Suggestion Groups</h2>
      <p>Group-level routing hints for source-aware comparison. These are not automatic keep/reject decisions, and thumbnails may lie about RAW quality.</p>
      <div class=\"cull-grid\">{''.join(cull_group_card(group) for group in (packet.get('cullSuggestionGroups') or [])[:8])}</div>
    </section>
    """)
    starter_grid = (
        "".join(record_card(record) for record in starter_records[:24])
        if starter_records
        else '<article class="empty-card">No starter candidates yet. Rebuild Photo Grove cull suggestions before proof prep.</article>'
    )
    sections.append(f"""
    <section>
      <h2>Candidate Starter Set</h2>
      <p>Review-start candidates only. These are not selected, approved, copied, delivered, uploaded, or published.</p>
      <div class=\"photo-grid\">{starter_grid}</div>
    </section>
    """)
    for section, records in (packet.get("sections") or {}).items():
        sections.append(f"""
        <section>
          <h2>{esc(section.title())}</h2>
          <div class=\"photo-grid\">{''.join(record_card(record) for record in records[:24])}</div>
        </section>
        """)
    quality_records = packet.get("qualityAttention") or []
    sections.append(f"""
    <section>
      <h2>Quality Attention</h2>
      <div class=\"photo-grid\">{''.join(record_card(record) for record in quality_records[:24])}</div>
    </section>
    """)
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Photo Grove Client Proof Packet</title>
  <style>
    :root {{ color-scheme:dark; --bg:#10170f; --panel:#1c2a1b; --ink:#fbf1da; --muted:#cbbd9d; --leaf:#96c078; --gold:#edc85d; --clay:#c97b5b; --line:rgba(251,241,218,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top left, rgba(150,192,120,.22), transparent 34%), linear-gradient(180deg,#142113,#0d130c); }}
    header {{ padding:42px clamp(22px,5vw,76px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:900; }}
    h1 {{ margin:8px 0; font-size:clamp(42px,7vw,86px); line-height:.92; }}
    h2 {{ color:var(--gold); margin:30px 0 12px; }}
    p {{ color:var(--muted); line-height:1.5; max-width:960px; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.05); color:var(--muted); font-weight:800; }}
    .gate {{ margin-top:22px; display:grid; grid-template-columns:minmax(0,1fr) minmax(280px,.7fr); gap:14px; }}
    .gate-card {{ border:1px solid rgba(237,200,93,.35); border-radius:22px; padding:16px; background:rgba(237,200,93,.07); }}
    .gate-card strong {{ color:var(--ink); }}
    .gate-card li {{ color:var(--muted); margin:7px 0; }}
    .worksheet-link {{ display:inline-flex; margin-top:16px; border:1px solid rgba(150,192,120,.65); border-radius:999px; padding:10px 13px; color:var(--ink); background:rgba(150,192,120,.13); font-weight:900; text-decoration:none; }}
    main {{ padding:24px clamp(16px,4vw,58px) 70px; }}
    .photo-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; }}
    .recipe-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
    .recipe-card {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.05); }}
    .recipe-card h3 {{ margin:0 0 8px; color:var(--ink); }}
    .recipe-card small {{ color:var(--leaf); font-weight:800; }}
    .cull-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; }}
    .cull-group-card {{ border:1px solid rgba(237,200,93,.36); border-radius:22px; padding:14px; background:rgba(237,200,93,.055); }}
    .group-head {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .group-head h3 {{ margin:4px 0 0; }}
    .group-head span {{ border:1px solid var(--line); border-radius:999px; padding:7px 9px; color:var(--gold); background:rgba(0,0,0,.18); font-weight:900; }}
    .sample-strip {{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:14px; overflow:hidden; background:rgba(0,0,0,.2); }}
    figcaption {{ padding:7px; color:var(--muted); font-size:11px; }}
    .commands {{ padding-left:18px; }}
    .commands li {{ display:grid; gap:5px; margin:8px 0; }}
    .photo-card {{ border:1px solid var(--line); border-radius:18px; overflow:hidden; background:rgba(0,0,0,.22); }}
    .photo-card {{ position:relative; }}
    .rank {{ position:absolute; z-index:2; top:8px; left:8px; border-radius:999px; padding:5px 8px; color:#12180f; background:var(--gold); box-shadow:0 6px 18px rgba(0,0,0,.28); }}
    .photo-card img, .no-thumb {{ width:100%; aspect-ratio:1; object-fit:cover; display:block; background:#050805; }}
    .photo-meta {{ padding:10px; display:grid; gap:4px; }}
    .photo-meta span, small {{ color:var(--muted); }}
    .empty-card {{ border:1px dashed var(--line); border-radius:18px; padding:20px; color:var(--muted); background:rgba(255,255,255,.04); }}
    code {{ color:var(--leaf); overflow-wrap:anywhere; font-size:10px; }}
    .selected {{ border-color:rgba(150,192,120,.65); }}
    .review {{ border-color:rgba(237,200,93,.65); }}
    .pending {{ border-color:rgba(251,241,218,.2); }}
    .rejected {{ opacity:.6; }}
    @media (max-width:900px) {{ .gate {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Photo Grove</div>
    <h1>{esc(proof_mode.get('label') or 'Client proof readiness')} without touching originals.</h1>
    <p>{esc(packet['truth'])}</p>
    <p><strong>Delivery status:</strong> {esc(packet['deliveryStatus'])}</p>
    <p><strong>Client-facing allowed:</strong> {esc(packet.get('clientFacingAllowed', False))}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class=\"summary\">
      <span>{packet['counts']['total']} total</span>
      <span>{packet['counts']['selected']} selected</span>
      <span>{packet['counts']['pending']} pending</span>
      <span>{packet['counts']['review']} review</span>
      <span>{packet['counts']['qualityAttention']} quality attention</span>
      <span>{packet['counts']['candidateStarterSet']} starter candidates</span>
      <span>0 external delivery</span>
    </div>
    <div class=\"gate\">
      <article class=\"gate-card\">
        <div class=\"eyebrow\">What this means</div>
        <p><strong>{esc(proof_mode.get('humanMeaning'))}</strong></p>
        <p>{esc(proof_mode.get('agentMeaning'))}</p>
        {worksheet_link}
      </article>
      <article class=\"gate-card\">
        <div class=\"eyebrow\">Next review loop</div>
        <ul>{mode_steps}</ul>
      </article>
    </div>
  </header>
  <main>{''.join(sections)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Photo Grove client proof/export readiness packet.")
    parser.add_argument("session", nargs="?", default="latest")
    parser.add_argument("--limit-per-section", type=int, default=48)
    args = parser.parse_args()
    session = resolve_latest_session(DEFAULT_PHOTO_ROOT) if args.session == "latest" else Path(args.session)
    packet = build_packet(session, limit_per_section=args.limit_per_section)
    print(json.dumps({
        "ok": True,
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "starterDecisionWorksheetPath": packet["starterDecisionWorksheetPath"],
        "deliveryStatus": packet["deliveryStatus"],
        "counts": packet["counts"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
