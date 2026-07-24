#!/usr/bin/env python3
"""Build a focused Photo Grove human review session from the current cull board.

This is an Aftershoot-like review slice: it gathers a small batch of candidates,
keeps originals untouched, and gives the reviewer visual thumbnails plus dry-run
commands for keep/reject/review/favorite. It does not write decisions.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
DEFAULT_CULL_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-cull-board.json"
LATEST_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-review-session.json"
SCHEMA = "quipsly.photo-grove.review-session.v1"
COMPARISON_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-review-session")


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                resolved = load_json(target, _depth=1)
                if resolved:
                    return {**payload, **resolved}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def file_uri(path: str) -> str:
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def candidate_score(row: dict[str, Any]) -> tuple[int, int, str]:
    flags = row.get("qualityFlags") if isinstance(row.get("qualityFlags"), list) else []
    status = str(row.get("status") or "")
    # Review-routed and quality-suspect images go first because humans need to
    # decide rather than trust thumbnail heuristics.
    review_rank = 0 if status == "review" else 1
    quality_rank = 0 if any("suspect" in str(flag) or "blank" in str(flag) or "clipping" in str(flag) for flag in flags) else 1
    return (review_rank, quality_rank, str(row.get("filename") or ""))


def comparison_label(index: int) -> str:
    if index < len(COMPARISON_LABELS):
        return COMPARISON_LABELS[index]
    return f"#{index + 1}"


def decision_ladder() -> list[dict[str, str]]:
    return [
        {
            "label": "1. Compare the sequence",
            "why": "Near-duplicates should be judged together so the tool does not create decision confetti.",
        },
        {
            "label": "2. Reveal source before harsh calls",
            "why": "RAW thumbnails can lie. Reject only after visual/source-aware review.",
        },
        {
            "label": "3. Use dry-run metadata first",
            "why": "Dry-runs show the exact sidecar/ledger intent while originals remain untouched.",
        },
        {
            "label": "4. Promote keep/favorite deliberately",
            "why": "Keep/favorite means this can feed proof/export packets later; it is not client approval.",
        },
    ]


def agent_review_checklist() -> list[str]:
    return [
        "Compare all candidates in the same sequence before suggesting a keep/reject split.",
        "Prefer review over reject when thumbnail analysis is suspect or source context is missing.",
        "Never treat a local sidecar decision as client approval or delivery.",
        "Prepare dry-run commands and notes; do not execute metadata decisions unless explicitly approved.",
        "Record why a decision was made so future photo classifiers can learn from the human/agent loop.",
    ]


def review_priority(row: dict[str, Any]) -> tuple[int, int, str]:
    status = str(row.get("status") or "")
    attention = str(row.get("attentionRoute") or "")
    flags = row.get("qualityFlags") if isinstance(row.get("qualityFlags"), list) else []
    if status == "review" or "review" in attention:
        base = 10
    elif any("suspect" in str(flag) or "blank" in str(flag) or "clipping" in str(flag) for flag in flags):
        base = 20
    elif not row.get("thumbnailExists") or not row.get("sourceExists"):
        base = 30
    else:
        base = 40
    return (base, int(row.get("rank") or 0), str(row.get("filename") or ""))


def compact_session_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "rank": row.get("rank") or 0,
        "comparisonLabel": row.get("comparisonLabel") or "",
        "photoId": row.get("photoId") or "",
        "filename": row.get("filename") or "",
        "status": row.get("status") or "",
        "reviewGroupId": row.get("reviewGroupId") or "",
        "attentionRoute": row.get("attentionRoute") or "",
        "attentionReasons": row.get("attentionReasons") or [],
        "decisionBias": row.get("decisionBias") or "",
        "sourcePath": row.get("sourcePath") or "",
        "sourceExists": bool(row.get("sourceExists")),
        "thumbnailPath": row.get("thumbnailPath") or "",
        "thumbnailExists": bool(row.get("thumbnailExists")),
        "qualityFlags": row.get("qualityFlags") or [],
        "qualityNote": row.get("qualityNote") or "",
        "qualitySignalCategory": row.get("qualitySignalCategory") or quality_signal_category(row),
        "openSourceCommand": row.get("openSourceCommand") or "",
        "dryRunKeep4Command": row.get("dryRunKeep4Command") or "",
        "dryRunFavorite5Command": row.get("dryRunFavorite5Command") or "",
        "dryRunReviewCommand": row.get("dryRunReviewCommand") or "",
        "dryRunRejectCommand": row.get("dryRunRejectCommand") or "",
        "humanQuestion": row.get("humanQuestion") or "",
        "nextSafestAction": "Open the visual contact sheet/review session, compare nearby frames, then use dry-run metadata commands before any real sidecar decision.",
        "truth": row.get("truth") or "Photo review row only. It does not mutate originals, write metadata decisions, export, deliver, upload, publish, or delete.",
    }


def compact_group_row(group: dict[str, Any]) -> dict[str, Any]:
    return {
        "groupId": group.get("groupId") or "",
        "count": group.get("count") or 0,
        "comparisonLabels": group.get("comparisonLabels") or [],
        "photoIds": group.get("photoIds") or [],
        "filenames": group.get("filenames") or [],
        "attentionRoutes": group.get("attentionRoutes") or [],
        "humanQuestion": group.get("humanQuestion") or "",
        "suggestedReview": group.get("suggestedReview") or "",
        "agentSafeWork": group.get("agentSafeWork") or "",
        "truth": "Photo group row only. It is visual review guidance, not metadata, delivery, publication, or receipt truth.",
    }


def build_start_here_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    compact = [compact_session_row(row) for row in rows]
    compact.sort(key=review_priority)
    return compact[:12]


def first_decision_queue(rows: list[dict[str, Any]], limit: int = 6) -> list[dict[str, Any]]:
    sorted_rows = sorted(rows, key=review_priority)[:limit]
    queue: list[dict[str, Any]] = []
    for row in sorted_rows:
        flags = [str(flag) for flag in row.get("qualityFlags") or []]
        attention_route = str(row.get("attentionRoute") or "")
        if row.get("status") == "review" or "review" in attention_route or any("suspect" in flag for flag in flags):
            suggested_action = "review"
            suggested_command = row.get("dryRunReviewCommand") or ""
            reason = "Safest first move: route this to review because the thumbnail/quality hints are not reliable enough for keep/reject."
        else:
            suggested_action = "compare"
            suggested_command = row.get("dryRunReviewCommand") or ""
            reason = "Compare against nearby frames before making a keep/reject call. Start with review if unsure."
        queue.append({
            "rank": row.get("rank") or 0,
            "comparisonLabel": row.get("comparisonLabel") or "",
            "photoId": row.get("photoId") or "",
            "filename": row.get("filename") or "",
            "reviewGroupId": row.get("reviewGroupId") or "",
            "thumbnailPath": row.get("thumbnailPath") or "",
            "thumbnailUri": row.get("thumbnailUri") or file_uri(row.get("thumbnailPath") or ""),
            "sourcePath": row.get("sourcePath") or "",
            "attentionRoute": attention_route,
            "qualityNote": row.get("qualityNote") or "",
            "qualityFlags": flags,
            "suggestedDryRunAction": suggested_action,
            "suggestedDryRunCommand": suggested_command,
            "suggestedReason": reason,
            "choices": [
                {"label": "Review", "command": row.get("dryRunReviewCommand") or "", "meaning": "Keep it in human review without judging it yet."},
                {"label": "Keep 4", "command": row.get("dryRunKeep4Command") or "", "meaning": "Mark as a likely keeper after visual/source review."},
                {"label": "Favorite 5", "command": row.get("dryRunFavorite5Command") or "", "meaning": "Mark as a standout candidate after visual/source review."},
                {"label": "Reject", "command": row.get("dryRunRejectCommand") or "", "meaning": "Reject only after source-aware review; originals remain untouched."},
            ],
            "truth": "Dry-run decision queue only. It does not write metadata, mutate originals, export, deliver, upload, publish, or delete.",
        })
    return queue


def quality_signal_category(row: dict[str, Any]) -> str:
    route = str(row.get("attentionRoute") or "").lower()
    flags = " ".join(str(flag).lower() for flag in row.get("qualityFlags") or [])
    note = str(row.get("qualityNote") or "").lower()
    filename = str(row.get("filename") or "").lower()
    text = " ".join([route, flags, note, filename])
    if "source-inspection" in route or "missing" in text or not row.get("sourceExists") or not row.get("thumbnailExists"):
        return "source-evidence-needed"
    if any(token in text for token in ("blur", "blurry", "soft", "blank", "clipping", "overexposed", "underexposed", "exposure", "dark", "technical", "suspect")):
        return "quality-problem-review"
    if any(token in text for token in ("duplicate", "near-duplicate", "sequence", "burst", "similar")):
        return "duplicate-sequence-review"
    if row.get("status") in {"keep", "favorite"} or any(token in text for token in ("keeper", "favorite", "hero", "proof")):
        return "possible-keeper-proof"
    return "normal-visual-cull"


def build_quality_signal_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    meta = {
        "source-evidence-needed": {
            "label": "Source evidence needed",
            "why": "Source or thumbnail evidence is incomplete. Reveal/rebuild evidence before judging the photo.",
            "humanDecision": "Can the original/source be opened and judged, or does this need a missing-media task?",
        },
        "quality-problem-review": {
            "label": "Quality/problem review",
            "why": "Blur, exposure, clipping, blank, dark, soft, suspect, or technical hints need source-aware review.",
            "humanDecision": "Is the issue real in the original, only a thumbnail artifact, recoverable, or a metadata reject?",
        },
        "duplicate-sequence-review": {
            "label": "Duplicate/sequence comparison",
            "why": "Likely related frames should be compared together before keep/favorite/reject decisions.",
            "humanDecision": "Which frame best tells the story, and should nearby frames stay review or become rejects?",
        },
        "possible-keeper-proof": {
            "label": "Possible keeper/proof",
            "why": "Existing hints suggest this could feed a client proof or export packet after deliberate review.",
            "humanDecision": "Would you be comfortable showing this to a client after source-aware review?",
        },
        "normal-visual-cull": {
            "label": "Normal visual cull",
            "why": "No strong automated hint. Review normally and keep decisions reversible.",
            "humanDecision": "Keep, favorite, reject, or leave for review after comparing the visual content.",
        },
    }
    order = [
        "source-evidence-needed",
        "quality-problem-review",
        "duplicate-sequence-review",
        "possible-keeper-proof",
        "normal-visual-cull",
    ]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[quality_signal_category(row)].append(row)

    queue: list[dict[str, Any]] = []
    for category in order:
        category_rows = grouped.get(category, [])
        details = meta[category]
        sample = category_rows[0] if category_rows else {}
        queue.append({
            "id": category,
            "label": details["label"],
            "count": len(category_rows),
            "why": details["why"],
            "humanDecision": details["humanDecision"],
            "agentSafeWork": "Prepare comparison notes and dry-run metadata commands only. Do not mutate originals or write live decisions.",
            "samplePhotoIds": [row.get("photoId") for row in category_rows[:6]],
            "sampleFilenames": [row.get("filename") for row in category_rows[:6]],
            "sampleComparisonLabels": [row.get("comparisonLabel") for row in category_rows[:6]],
            "safeCommand": sample.get("openSourceCommand") or sample.get("dryRunReviewCommand") or "",
            "truth": "Quality signal row only. It routes attention; it is not a keep/reject verdict, client approval, delivery, metadata write, upload, publish, delete, or source mutation.",
        })
    return queue


def build_payload(photo_root: Path, limit: int) -> dict[str, Any]:
    cull = load_json(DEFAULT_CULL_POINTER if photo_root == DEFAULT_PHOTO_ROOT else photo_root / "latest-photo-grove-cull-board.json")
    contact_pointer = load_json(photo_root / "latest-photo-grove-contact-sheet.json")
    contact_counts = contact_pointer.get("counts") if isinstance(contact_pointer.get("counts"), dict) else {}
    candidates = cull.get("candidateRows") if isinstance(cull.get("candidateRows"), list) else []
    selected = sorted([row for row in candidates if isinstance(row, dict)], key=candidate_score)[: max(1, limit)]
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in selected:
        groups[str(row.get("reviewGroupId") or "ungrouped")].append(row)

    session_rows: list[dict[str, Any]] = []
    for index, row in enumerate(selected, start=1):
        source_path = str(row.get("sourcePath") or "")
        thumb_path = str(row.get("thumbnailPath") or "")
        flags = [str(flag) for flag in (row.get("qualityFlags") or row.get("flags") or [])]
        session_rows.append({
            "rank": index,
            "comparisonLabel": comparison_label(index - 1),
            "photoId": row.get("photoId") or "",
            "filename": row.get("filename") or Path(source_path).name,
            "status": row.get("status") or "pending",
            "reviewGroupId": row.get("reviewGroupId") or "ungrouped",
            "attentionRoute": row.get("attentionRoute") or "pending-cull",
            "attentionReasons": [str(reason) for reason in (row.get("attentionReasons") or [])],
            "decisionBias": row.get("decisionBias") or "Inspect visually, compare nearby frames, then choose a metadata-only route.",
            "sourcePath": source_path,
            "sourceExists": bool(source_path and Path(source_path).exists()),
            "thumbnailPath": thumb_path,
            "thumbnailExists": bool(thumb_path and Path(thumb_path).exists()),
            "thumbnailUri": row.get("thumbnailUri") or file_uri(thumb_path),
            "qualityFlags": flags,
            "qualityNote": row.get("qualityNote") or "Inspect visually before trusting any automated hint.",
            "qualitySignalCategory": quality_signal_category({
                "attentionRoute": row.get("attentionRoute") or "pending-cull",
                "qualityFlags": flags,
                "qualityNote": row.get("qualityNote") or "",
                "filename": row.get("filename") or Path(source_path).name,
                "sourceExists": bool(source_path and Path(source_path).exists()),
                "thumbnailExists": bool(thumb_path and Path(thumb_path).exists()),
                "status": row.get("status") or "pending",
            }),
            "openSourceCommand": row.get("openSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else ""),
            "dryRunKeep4Command": row.get("dryRunKeep4Command") or "",
            "dryRunFavorite5Command": row.get("dryRunFavorite5Command") or "",
            "dryRunReviewCommand": row.get("dryRunReviewCommand") or "",
            "dryRunRejectCommand": row.get("dryRunRejectCommand") or "",
            "humanQuestion": "Is this a keeper, a reject, or a needs-review image after looking at the actual visual content?",
            "truth": "Review row only. Originals stay untouched; commands are dry-run metadata suggestions unless explicitly executed later.",
        })

    grouped = []
    for group_id, rows in sorted(groups.items()):
        group_photo_ids = [row.get("photoId") for row in rows]
        group_labels = [item.get("comparisonLabel") for item in session_rows if item.get("photoId") in group_photo_ids]
        grouped.append({
            "groupId": group_id,
            "count": len(rows),
            "comparisonLabels": group_labels,
            "photoIds": group_photo_ids,
            "filenames": [row.get("filename") for row in rows],
            "attentionRoutes": sorted({str(row.get("attentionRoute") or "pending-cull") for row in rows}),
            "humanQuestion": "Which frame, if any, would you be comfortable showing a client or using as a proof candidate?",
            "suggestedReview": "Compare this sequence as a group before choosing keep/reject so near-duplicates are handled intentionally.",
            "agentSafeWork": "Summarize visual/flag differences and prepare dry-run sidecar commands; do not execute metadata or copy deliverables.",
        })

    start_here_queue = build_start_here_queue(session_rows)
    first_decisions = first_decision_queue(session_rows)
    quality_signals = build_quality_signal_queue(session_rows)
    compact_rows = [compact_session_row(row) for row in session_rows]
    compact_groups = [compact_group_row(group) for group in grouped]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-review-session-ready" if session_rows else "photo-review-session-empty",
        "photoRoot": str(photo_root),
        "sourceCullBoardJson": cull.get("jsonPath") or "",
        "sourceCullBoardHtml": cull.get("htmlPath") or "",
        "counts": {
            "sessionRows": len(session_rows),
            "groups": len(grouped),
            "sourceCandidates": len(candidates),
            "contactSheetGroups": int(contact_counts.get("contactSheetGroups") or 0),
            "contactSheetSamples": int(contact_counts.get("contactSheetSamples") or 0),
            "sourceExists": sum(1 for row in session_rows if row["sourceExists"]),
            "thumbnailsPresent": sum(1 for row in session_rows if row["thumbnailExists"]),
            "reviewRows": sum(1 for row in session_rows if row["status"] == "review"),
            "qualitySignalRows": len(quality_signals),
            "sourceEvidenceNeededRows": next((item["count"] for item in quality_signals if item["id"] == "source-evidence-needed"), 0),
            "qualityProblemRows": next((item["count"] for item in quality_signals if item["id"] == "quality-problem-review"), 0),
            "duplicateSequenceRows": next((item["count"] for item in quality_signals if item["id"] == "duplicate-sequence-review"), 0),
            "possibleKeeperRows": next((item["count"] for item in quality_signals if item["id"] == "possible-keeper-proof"), 0),
            "dryRunCommands": sum(1 for row in session_rows for key in ["dryRunKeep4Command", "dryRunFavorite5Command", "dryRunReviewCommand", "dryRunRejectCommand"] if row.get(key)),
            "firstDecisionRows": len(first_decisions),
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
        },
        "rows": session_rows,
        "sessionRows": compact_rows,
        "reviewRows": [row for row in compact_rows if row.get("status") == "review"],
        "startHereQueue": start_here_queue,
        "firstDecisionQueue": first_decisions,
        "qualitySignalQueue": quality_signals,
        "groups": grouped,
        "groupRows": compact_groups,
        "sourcePointers": {
            "cullBoardHtml": cull.get("htmlPath") or "",
            "cullBoardJson": cull.get("jsonPath") or "",
            "contactSheetHtml": contact_pointer.get("htmlPath") or "",
            "contactSheetJson": contact_pointer.get("jsonPath") or "",
        },
        "primaryVisualReview": {
            "label": "Open visual contact sheet before deciding" if contact_pointer.get("htmlPath") else "Build visual contact sheet before deciding",
            "command": f"open {shell_quote(str(contact_pointer.get('htmlPath') or ''))}" if contact_pointer.get("htmlPath") else "./script/agentctl.sh photo-grove-contact-sheet 12",
            "path": contact_pointer.get("htmlPath") or "",
            "safety": "Local visual comparison only. It does not mutate originals, write metadata decisions, export, deliver, upload, publish, or delete.",
        },
        "decisionLadder": decision_ladder(),
        "agentReviewChecklist": agent_review_checklist(),
        "firstSafeAction": {},
        "nextSafestAction": "Open the Photo Grove review session, inspect one small batch visually, then use dry-run decisions before any real metadata ledger write.",
        "truth": {
            "reviewSessionOnly": True,
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
        },
        "safety": "Local review session only. Does not mutate originals, write metadata decisions, export, deliver, upload, publish, or delete files.",
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "rank", "comparisonLabel", "photoId", "filename", "status", "reviewGroupId", "attentionRoute", "qualitySignalCategory", "decisionBias", "sourcePath", "thumbnailPath", "qualityFlags", "qualityNote", "dryRunKeep4Command", "dryRunRejectCommand", "dryRunReviewCommand", "dryRunFavorite5Command"
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in payload["rows"]:
            csv_row = {key: row.get(key, "") for key in fieldnames}
            csv_row["qualityFlags"] = ",".join(row.get("qualityFlags") or [])
            writer.writerow(csv_row)


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove review session",
        "",
        f"- Updated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Rows: `{payload['counts']['sessionRows']}`",
        f"- Groups: `{payload['counts']['groups']}`",
        f"- Source candidates: `{payload['counts']['sourceCandidates']}`",
        f"- Contact sheet groups: `{payload['counts'].get('contactSheetGroups', 0)}`",
        f"- Quality/problem rows: `{payload['counts'].get('qualityProblemRows', 0)}`",
        f"- Duplicate/sequence rows: `{payload['counts'].get('duplicateSequenceRows', 0)}`",
        f"- Source evidence needed: `{payload['counts'].get('sourceEvidenceNeededRows', 0)}`",
        "",
        payload["safety"],
        "",
        "## How to review",
        "",
        "Look at the thumbnail, reveal the source if needed, and use dry-run decisions first. Automated quality flags are routing hints, not verdicts.",
        "",
        "Start with the visual contact sheet when it exists, then use this review session to narrow the metadata-sidecar decision.",
        "",
        f"- Visual review command: `{(payload.get('primaryVisualReview') or {}).get('command', '')}`",
        "",
        "## Decision ladder",
        "",
    ]
    for step in payload.get("decisionLadder") or []:
        lines.append(f"- **{step.get('label')}** - {step.get('why')}")
    lines.extend(["", "## Agent review checklist", ""])
    for item in payload.get("agentReviewChecklist") or []:
        lines.append(f"- {item}")
    lines.extend(["", "## Quality signal lanes", ""])
    for signal in payload.get("qualitySignalQueue") or []:
        lines.extend([
            f"### {signal.get('label')}",
            f"- Count: `{signal.get('count')}`",
            f"- Why: {signal.get('why')}",
            f"- Human decision: {signal.get('humanDecision')}",
            f"- Codex-safe work: {signal.get('agentSafeWork')}",
            f"- Samples: `{', '.join(signal.get('sampleFilenames') or [])}`",
            f"- Safe command: `{signal.get('safeCommand') or ''}`",
            "",
        ])
    lines.extend(["", "## First six dry-run decisions", ""])
    for row in payload.get("firstDecisionQueue") or []:
        lines.extend([
            f"### {row.get('comparisonLabel')}. {row.get('filename')}",
            f"- Photo ID: `{row.get('photoId')}`",
            f"- Group: `{row.get('reviewGroupId')}`",
            f"- Routing: `{row.get('attentionRoute')}`",
            f"- Suggested dry-run: `{row.get('suggestedDryRunAction')}`",
            f"- Why: {row.get('suggestedReason')}",
            f"- Source: `{row.get('sourcePath')}`",
            "```bash",
            row.get("suggestedDryRunCommand") or "",
            "```",
            "",
        ])
    lines.append("")
    for group in payload["groups"]:
        lines.extend([
            f"## Group {group['groupId']}",
            f"- Count: `{group['count']}`",
            f"- Labels: `{', '.join(group.get('comparisonLabels') or [])}`",
            f"- Human question: {group.get('humanQuestion')}",
            f"- Suggested review: {group['suggestedReview']}",
            f"- Agent-safe work: {group.get('agentSafeWork')}",
            "",
        ])
        for row in [item for item in payload["rows"] if item["reviewGroupId"] == group["groupId"]]:
            lines.extend([
                f"### {row.get('comparisonLabel')}. {row['filename']}",
                f"- Photo ID: `{row['photoId']}`",
                f"- Status: `{row['status']}`",
                f"- Quality note: {row['qualityNote']}",
                f"- Attention route: `{row.get('attentionRoute')}`",
                f"- Quality signal: `{row.get('qualitySignalCategory')}`",
                f"- Decision bias: {row.get('decisionBias')}",
                f"- Thumbnail: `{row['thumbnailPath']}`",
                f"- Source: `{row['sourcePath']}`",
                f"- Reveal source: `{row['openSourceCommand']}`",
                "- Dry-run keep:", "```bash", row["dryRunKeep4Command"], "```",
                "- Dry-run reject:", "```bash", row["dryRunRejectCommand"], "```",
                "- Dry-run review:", "```bash", row["dryRunReviewCommand"], "```",
                "- Dry-run favorite:", "```bash", row["dryRunFavorite5Command"], "```",
                "",
            ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    group_sections = []
    for group in payload["groups"]:
        cards = []
        for row in [item for item in payload["rows"] if item["reviewGroupId"] == group["groupId"]]:
            thumb = row.get("thumbnailUri") or file_uri(row.get("thumbnailPath") or "")
            flags = "".join(f"<span>{esc(flag)}</span>" for flag in row.get("qualityFlags") or [])
            cards.append(f"""
              <article class="photo-card">
                <div class="thumb">
                  <b>{esc(row.get('comparisonLabel'))}</b>
                  {f'<img src="{esc(thumb)}" alt="{esc(row["filename"])}">' if thumb else '<div class="missing">No thumbnail</div>'}
                </div>
                <div class="meta"><span>{esc(row['status'])}</span><span>{esc(row.get('qualitySignalCategory') or 'normal-visual-cull')}</span><span>{esc(row['photoId'])}</span></div>
                <h3>{esc(row.get('comparisonLabel'))}. {esc(row['filename'])}</h3>
                <p>{esc(row['qualityNote'])}</p>
                <p class="bias"><b>{esc(row.get('attentionRoute'))}</b><br>{esc(row.get('decisionBias'))}</p>
                <div class="flags">{flags}</div>
                <details><summary>Dry-run commands</summary>
                  <strong>Keep</strong><pre>{esc(row['dryRunKeep4Command'])}</pre>
                  <strong>Reject</strong><pre>{esc(row['dryRunRejectCommand'])}</pre>
                  <strong>Review</strong><pre>{esc(row['dryRunReviewCommand'])}</pre>
                  <strong>Favorite</strong><pre>{esc(row['dryRunFavorite5Command'])}</pre>
                  <strong>Reveal source</strong><pre>{esc(row['openSourceCommand'])}</pre>
                </details>
              </article>
            """)
        group_sections.append(f"""
          <section class="group">
            <div class="eyebrow">{esc(group['groupId'])}</div>
            <h2>{esc(group['count'])} image sequence · {esc(', '.join(group.get('comparisonLabels') or []))}</h2>
            <p><b>Human question:</b> {esc(group.get('humanQuestion'))}</p>
            <p><b>Attention routes:</b> {esc(', '.join(group.get('attentionRoutes') or []))}</p>
            <p>{esc(group['suggestedReview'])}</p>
            <p><b>Agent-safe work:</b> {esc(group.get('agentSafeWork'))}</p>
            <div class="cards">{''.join(cards)}</div>
          </section>
        """)
    counts = payload["counts"]
    ladder_html = "".join(
        f"<li><strong>{esc(step.get('label'))}</strong><span>{esc(step.get('why'))}</span></li>"
        for step in payload.get("decisionLadder") or []
    )
    agent_check_html = "".join(
        f"<li>{esc(item)}</li>"
        for item in payload.get("agentReviewChecklist") or []
    )
    quality_signal_html = "".join(
        f"""
        <article class="signal-card">
          <div class="signal-count">{esc(signal.get('count'))}</div>
          <h3>{esc(signal.get('label'))}</h3>
          <p>{esc(signal.get('why'))}</p>
          <p><b>Human decision:</b> {esc(signal.get('humanDecision'))}</p>
          <p><b>Codex can safely:</b> {esc(signal.get('agentSafeWork'))}</p>
          <details><summary>Samples</summary><pre>{esc(', '.join(signal.get('sampleFilenames') or []))}</pre><pre>{esc(signal.get('safeCommand') or '')}</pre></details>
        </article>
        """
        for signal in payload.get("qualitySignalQueue") or []
    )
    first_decision_html = []
    for row in payload.get("firstDecisionQueue") or []:
        thumb = row.get("thumbnailUri") or file_uri(row.get("thumbnailPath") or "")
        choices = "".join(
            f"""
            <details>
              <summary>{esc(choice.get('label'))}</summary>
              <p>{esc(choice.get('meaning'))}</p>
              <pre>{esc(choice.get('command'))}</pre>
            </details>
            """
            for choice in row.get("choices") or []
            if isinstance(choice, dict)
        )
        first_decision_html.append(f"""
          <article class="decision-card">
            <div class="decision-thumb">
              <b>{esc(row.get('comparisonLabel'))}</b>
              {f'<img src="{esc(thumb)}" alt="{esc(row.get("filename"))}">' if thumb else '<div class="missing">No thumbnail</div>'}
            </div>
            <div class="meta"><span>{esc(row.get('suggestedDryRunAction'))}</span><span>{esc(row.get('reviewGroupId'))}</span></div>
            <h3>{esc(row.get('filename'))}</h3>
            <p>{esc(row.get('qualityNote'))}</p>
            <p class="bias"><b>Why this is first:</b><br>{esc(row.get('suggestedReason'))}</p>
            <strong>Suggested dry-run</strong>
            <pre>{esc(row.get('suggestedDryRunCommand'))}</pre>
            <div class="choices">{choices}</div>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove review session</title>
  <style>
    :root {{ color-scheme: dark; --bg:#11170f; --panel:#192418; --ink:#f8f0d4; --muted:#b9ae8e; --line:rgba(248,240,212,.16); --moss:#87c987; --honey:#e8c45f; --clay:#e37b62; --creek:#69c4ce; }}
    body {{ margin:0; background:radial-gradient(circle at top left, rgba(135,201,135,.22), transparent 34rem), var(--bg); color:var(--ink); font-family:ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width:1320px; margin:0 auto; padding:38px 24px 72px; }}
    .hero, .group {{ border:1px solid var(--line); border-radius:30px; padding:24px; background:linear-gradient(135deg,rgba(25,36,24,.96),rgba(37,31,18,.9)); box-shadow:0 24px 80px rgba(0,0,0,.32); margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font-size:clamp(38px,6vw,76px); line-height:.94; margin:8px 0; }}
    h2, h3 {{ margin:8px 0; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .stat {{ border:1px solid var(--line); border-radius:16px; padding:10px 13px; background:rgba(255,255,255,.05); min-width:120px; }}
    .stat strong {{ display:block; font-size:25px; color:var(--moss); }}
    .guide {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:18px; }}
    .guide-box {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.18); }}
    .guide-box h2 {{ color:var(--honey); text-transform:uppercase; letter-spacing:.12em; font-size:12px; }}
    .guide-box ul {{ margin:0; padding-left:18px; color:var(--muted); }}
    .guide-box li {{ margin:8px 0; }}
    .guide-box li span {{ display:block; color:var(--muted); }}
    .cards, .signals {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }}
    .photo-card, .decision-card {{ border:1px solid var(--line); border-radius:22px; background:rgba(255,255,255,.055); padding:14px; }}
    .decision-card {{ background:linear-gradient(145deg,rgba(232,196,95,.13),rgba(255,255,255,.045)); border-color:rgba(232,196,95,.34); }}
    .signal-card {{ border:1px solid rgba(105,196,206,.28); border-radius:20px; padding:14px; background:rgba(105,196,206,.07); position:relative; }}
    .signal-count {{ position:absolute; top:12px; right:12px; min-width:34px; height:34px; border-radius:12px; display:grid; place-items:center; background:rgba(105,196,206,.16); color:var(--creek); font-weight:1000; }}
    .thumb, .decision-thumb {{ position:relative; aspect-ratio:3/2; border-radius:16px; background:#050705; display:flex; align-items:center; justify-content:center; overflow:hidden; }}
    .thumb b, .decision-thumb b {{ position:absolute; top:10px; left:10px; z-index:2; display:grid; place-items:center; min-width:34px; height:34px; border-radius:999px; background:rgba(232,196,95,.92); color:#17140e; font-weight:1000; box-shadow:0 8px 20px rgba(0,0,0,.35); }}
    .thumb img, .decision-thumb img {{ width:100%; height:100%; object-fit:contain; }}
    .missing {{ color:var(--clay); font-weight:900; }}
    .meta, .flags {{ display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; }}
    .meta span, .flags span {{ border-radius:999px; background:rgba(0,0,0,.28); color:var(--muted); padding:4px 7px; font-size:11px; font-weight:800; }}
    .bias {{ border-left:3px solid var(--honey); padding-left:9px; }}
    details {{ margin-top:10px; }}
    summary {{ color:var(--honey); cursor:pointer; font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.26); border-radius:12px; padding:10px; color:var(--creek); }}
    .choices details {{ border:1px solid var(--line); border-radius:14px; padding:8px 10px; background:rgba(0,0,0,.16); }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <div class="eyebrow">Photo Grove</div>
    <h1>Small batch culling, originals untouched.</h1>
    <p>{esc(payload['safety'])}</p>
    <div class="stats">
      <div class="stat"><strong>{counts['sessionRows']}</strong>review rows</div>
      <div class="stat"><strong>{counts['groups']}</strong>groups</div>
      <div class="stat"><strong>{counts['sourceCandidates']}</strong>source candidates</div>
      <div class="stat"><strong>{counts.get('contactSheetGroups', 0)}</strong>contact groups</div>
      <div class="stat"><strong>{counts['thumbnailsPresent']}</strong>thumbnails</div>
      <div class="stat"><strong>{counts['dryRunCommands']}</strong>dry-run commands</div>
    </div>
    <p><strong>Visual review first:</strong> {esc((payload.get('primaryVisualReview') or {}).get('label'))}</p>
    <pre>{esc((payload.get('primaryVisualReview') or {}).get('command'))}</pre>
    <div class="guide">
      <div class="guide-box">
        <h2>Decision ladder</h2>
        <ul>{ladder_html}</ul>
      </div>
      <div class="guide-box">
        <h2>Agent checklist</h2>
        <ul>{agent_check_html}</ul>
      </div>
    </div>
  </section>
  <section class="group">
    <div class="eyebrow">Quality signal lanes</div>
    <h2>Attention routing, not verdicts</h2>
    <p>These lanes surface source problems, quality hints, duplicate-ish sequences, and possible keepers. They help the first cull pass feel less like staring into a bucket of bees. They do not decide anything by themselves.</p>
    <div class="signals">{quality_signal_html}</div>
  </section>
  <section class="group">
    <div class="eyebrow">Start here</div>
    <h2>First six dry-run decisions</h2>
    <p>These are the safest first photos to inspect because they need source-aware human judgment. The suggested action is a dry-run only; originals and metadata stay untouched.</p>
    <div class="cards">{''.join(first_decision_html)}</div>
  </section>
  {''.join(group_sections)}
</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a focused Photo Grove review session packet.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    photo_root = Path(args.photo_root).expanduser()
    output_root = photo_root / "ReviewSessions"
    session_dir = output_root / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(photo_root, args.limit)
    json_path = session_dir / "photo-grove-review-session.json"
    markdown_path = session_dir / "START-HERE-photo-grove-review-session.md"
    csv_path = session_dir / "photo-grove-review-session.csv"
    html_path = session_dir / "index.html"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "pointerPath": str(photo_root / "latest-photo-grove-review-session.json"),
    })
    payload["firstSafeAction"] = {
        "label": "Open Photo Grove review session",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local photo review evidence only. No originals, metadata decisions, exports, delivery, upload, publication, or deletion are changed.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    compact_rows = [compact_session_row(row) for row in payload.get("rows") or []]
    compact_groups = [compact_group_row(group) for group in payload.get("groups") or []]
    start_here_queue = build_start_here_queue(payload.get("rows") or [])
    pointer = {
        "schema": SCHEMA,
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "counts": payload["counts"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "sessionDir": str(session_dir),
        "humanAsk": payload.get("humanAsk") or "Open the Photo Grove review session and inspect the selected groups before recording any keep/reject/favorite metadata.",
        "agentSafeParallelWork": payload.get("agentSafeParallelWork") or "Codex may improve review notes, comparison order, and dry-run metadata commands. Do not mutate originals, change metadata decisions, export, deliver, upload, publish, delete, or overwrite.",
        "firstSafeAction": payload["firstSafeAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "rows": compact_rows,
        "sessionRows": compact_rows,
        "selectedSourceCandidates": compact_rows,
        "groups": compact_groups,
        "startHereQueue": start_here_queue,
        "qualitySignalQueue": payload.get("qualitySignalQueue") or [],
        "reviewRows": [row for row in compact_rows if row.get("status") == "review"],
        "primaryVisualReview": payload.get("primaryVisualReview") or {},
        "sourcePointers": payload.get("sourcePointers") or {},
        "truth": payload["truth"],
    }
    write_json(photo_root / "latest-photo-grove-review-session.json", pointer)
    if photo_root == DEFAULT_PHOTO_ROOT:
        write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
