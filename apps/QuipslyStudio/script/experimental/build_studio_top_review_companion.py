#!/usr/bin/env python3
"""Build a focused Studio review companion for the current top blockers.

This is a local-only reviewer runway. It reads the current duration-candidate
and sync-investigation packets, then creates one calm front door for the next
watch/listen decisions. It does not approve, promote, repair, publish, upload,
schedule, mutate media, overwrite versions, or capture receipts.
"""

from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.top-review-companion.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-top-review-companion")


def load_json(path: Path) -> dict[str, Any]:
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


def format_duration(seconds: float | int | str) -> str:
    try:
        value = float(seconds)
    except Exception:
        value = 0.0
    sign = "-" if value < 0 else ""
    value = abs(value)
    whole = int(value)
    millis = int(round((value - whole) * 1000))
    minutes, sec = divmod(whole, 60)
    hours, minute = divmod(minutes, 60)
    if hours:
        return f"{sign}{hours}h {minute}m {sec}.{millis:03d}s"
    if minute:
        return f"{sign}{minute}m {sec}.{millis:03d}s"
    return f"{sign}{sec}.{millis:03d}s"


def decision_note_template(*, episode: int | str, label: str, decision_choices: list[str], evidence_paths: list[str], caution: str) -> dict[str, Any]:
    choices = ", ".join(decision_choices)
    evidence_lines = "\n".join(f"- {path}" for path in evidence_paths if path)
    if not evidence_lines:
        evidence_lines = "- Evidence path not available in latest pointer."
    markdown = f"""## Local Studio decision note

- Episode: {episode}
- Item: {label}
- Decision: <choose one: {choices}>
- Reason:
- Evidence reviewed:
{evidence_lines}
- Follow-up for Codex:
- Follow-up for Charlie/Mako/Homer:
- Tower impact:
- Explicit non-claims: not published, not uploaded, not scheduled, no external receipt, no source media mutated, no older version overwritten.
- Caution: {caution}
"""
    return {
        "title": f"Local decision note - Episode {episode}",
        "decisionChoices": decision_choices,
        "evidencePaths": [path for path in evidence_paths if path],
        "caution": caution,
        "copyPasteMarkdown": markdown.strip() + "\n",
        "truth": "This is a local review note template only. It does not approve, publish, upload, schedule, capture receipts, overwrite versions, delete files, or mutate source media.",
    }


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def deep_packet(pointer: dict[str, Any]) -> dict[str, Any]:
    packet = load_json(Path(str(pointer.get("jsonPath") or "")))
    return packet or pointer


def summarize_duration_candidate(pointer: dict[str, Any], packet: dict[str, Any], rehearsal_pointer: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not packet:
        return None
    rehearsal_pointer = rehearsal_pointer or {}
    rehearsal_first = rehearsal_pointer.get("firstSafeAction") if isinstance(rehearsal_pointer.get("firstSafeAction"), dict) else {}
    rehearsal_html = rehearsal_pointer.get("htmlPath") or ""
    rehearsal_json = rehearsal_pointer.get("jsonPath") or ""
    rehearsal_markdown = rehearsal_pointer.get("markdownPath") or ""
    artifacts = [item for item in as_list(packet.get("artifacts")) if isinstance(item, dict)]
    snippet_count = 0
    still_count = 0
    artifact_rows: list[dict[str, Any]] = []
    for artifact in artifacts:
        snippets = [item for item in as_list(artifact.get("snippets")) if isinstance(item, dict)]
        stills = [item for item in as_list(artifact.get("stills")) if isinstance(item, dict)]
        snippet_count += len(snippets)
        still_count += len(stills)
        artifact_rows.append({
            "key": artifact.get("key") or "",
            "label": artifact.get("label") or artifact.get("key") or "Artifact",
            "path": artifact.get("path") or "",
            "exists": bool(artifact.get("exists")),
            "sizeBytes": artifact.get("sizeBytes") or 0,
            "snippetCount": len(snippets),
            "stillCount": len(stills),
            "firstSnippetPath": (snippets[0].get("outputPath") if snippets else "") or "",
            "snippetLabels": [snippet.get("label") or snippet.get("id") for snippet in snippets[:5]],
        })
    evidence_paths = [
        str(pointer.get("htmlPath") or packet.get("htmlPath") or ""),
        str(pointer.get("jsonPath") or packet.get("jsonPath") or ""),
        str(rehearsal_html or ""),
    ]
    note_template = decision_note_template(
        episode=packet.get("episode") or 1,
        label=f"Episode {packet.get('episode') or 1} {packet.get('candidateVersion') or packet.get('version') or 'candidate'} duration candidate",
        decision_choices=["promote-after-review", "refine-or-rebuild", "hold-current-package", "need-more-evidence"],
        evidence_paths=evidence_paths,
        caution="A duration candidate is not Tower approval. Promote/refine/hold must be explicit before any package truth changes.",
    )
    return {
        "id": "episode-1-duration-candidate",
        "kind": "duration-candidate-review",
        "episode": packet.get("episode") or 1,
        "label": f"Episode {packet.get('episode') or 1} {packet.get('candidateVersion') or packet.get('version') or 'candidate'} duration candidate",
        "status": packet.get("status") or pointer.get("status") or "review-evidence-ready",
        "currentVersion": packet.get("currentVersion") or "",
        "candidateVersion": packet.get("candidateVersion") or packet.get("version") or "",
        "htmlPath": pointer.get("htmlPath") or packet.get("htmlPath") or "",
        "jsonPath": pointer.get("jsonPath") or packet.get("jsonPath") or "",
        "markdownPath": pointer.get("markdownPath") or packet.get("markdownPath") or "",
        "openCommand": f"open {shell_quote(str(pointer.get('htmlPath') or packet.get('htmlPath') or ''))}",
        "counts": {
            "artifacts": len(artifacts),
            "snippets": snippet_count,
            "stills": still_count,
        },
        "artifactRows": artifact_rows,
        "humanAsk": packet.get("humanAsk") or "Watch/listen the candidate snippets and decide whether this candidate deserves promotion, refinement, or hold.",
        "reviewerQuestions": [
            "Do the beginning, middle, and ending snippets feel like the same episode window across 16:9 video, 9:16 video, and podcast audio?",
            "Does the ending feel complete rather than clipped, stretched, or padded?",
            "Is the candidate clearly better than holding the current package, or does it still need a rebuild?",
            "Would you be comfortable asking Codex to promote this into a real versioned review package?",
        ],
        "localDecisionNoteTemplate": note_template,
        "evidenceToOpen": [
            {"label": "Candidate review packet", "path": pointer.get("htmlPath") or packet.get("htmlPath") or ""},
            {"label": "Candidate JSON evidence", "path": pointer.get("jsonPath") or packet.get("jsonPath") or ""},
            {"label": "Duration candidate decision rehearsal", "path": rehearsal_html},
        ],
        "decisionRehearsal": {
            "status": rehearsal_pointer.get("status") or "",
            "htmlPath": rehearsal_html,
            "jsonPath": rehearsal_json,
            "markdownPath": rehearsal_markdown,
            "counts": rehearsal_pointer.get("counts") if isinstance(rehearsal_pointer.get("counts"), dict) else {},
            "firstSafeAction": rehearsal_first,
            "nextSafestAction": rehearsal_pointer.get("nextSafestAction") or "",
            "truth": rehearsal_pointer.get("truth") or {},
        },
        "codexCanDo": packet.get("agentSafeParallelWork") or "Summarize local evidence and prepare promotion-plan previews. Do not approve, promote, publish, upload, schedule, overwrite, delete, mutate sources, or capture receipts.",
        "nextSafestAction": packet.get("nextSafestAction") or pointer.get("nextSafestAction") or "",
        "decisionMenu": [
            "promote candidate to a versioned review package after watch/listen review",
            "hold current package and explain why",
            "refine/rebuild candidate as a new version",
            "return to pending with clearer notes",
            "open the duration candidate decision rehearsal and choose promote/refine/hold/more-evidence before any live decision",
        ],
        "decisionRows": [
            {
                "decision": "Promote after review",
                "means": "The v004 snippets pass human watch/listen review and should become a real versioned review package before Tower approval.",
                "codexMayDo": "Prepare or run a local promotion/rebuild step only after explicit human direction.",
                "watchFor": "Do not treat the candidate packet itself as publication approval.",
            },
            {
                "decision": "Refine or rebuild",
                "means": "The candidate is close, but duration, sync, ending, or content still needs repair in a newer version.",
                "codexMayDo": "Create a precise rebuild work order and keep v003/v004 evidence intact.",
                "watchFor": "Do not overwrite v003 or v004 while experimenting.",
            },
            {
                "decision": "Hold current package",
                "means": "The current package stays blocked while more evidence or a better candidate is prepared.",
                "codexMayDo": "Improve notes, snippets, and reviewer guidance without changing package truth.",
                "watchFor": "Do not unblock Tower artifacts from wishful thinking.",
            },
            {
                "decision": "Need more evidence",
                "means": "The reviewer cannot decide from the current snippets/stills.",
                "codexMayDo": "Generate more local snippets/stills or a clearer comparison packet.",
                "watchFor": "Evidence generation is safe; approval is still separate.",
            },
        ],
        "doNotDo": [
            "Do not approve Tower artifacts directly from a duration-candidate packet.",
            "Do not overwrite the current package or delete older candidates.",
            "Do not call Episode 1 published, scheduled, uploaded, or receipt-backed from this evidence.",
        ],
        "acceptanceRule": packet.get("candidateAcceptanceNextStep") or "A candidate is not approval. Promote or rebuild it into a versioned package before Tower artifacts can be approved.",
        "safeCommands": [
            {"label": "Open candidate review packet", "command": f"open {shell_quote(str(pointer.get('htmlPath') or packet.get('htmlPath') or ''))}"},
            {"label": "Open duration candidate decision rehearsal", "command": rehearsal_first.get("command") or (f"open {shell_quote(str(rehearsal_html))}" if rehearsal_html else "")},
            {"label": "Build promotion plan preview", "command": packet.get("candidatePromotionPlanCommand") or ""},
        ],
        "truth": packet.get("truth") or pointer.get("truth") or "Local duration-candidate evidence only.",
    }


def summarize_sync_investigation(pointer: dict[str, Any], packet: dict[str, Any], rehearsal_pointer: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not packet:
        return None
    artifacts = [item for item in as_list(packet.get("artifacts")) if isinstance(item, dict)]
    comparisons = [item for item in as_list(packet.get("comparisons")) if isinstance(item, dict)]
    spread_seconds = round(float(packet.get("durationSpreadSeconds") or packet.get("durationGapSeconds") or 0), 3)
    rehearsal_pointer = rehearsal_pointer or {}
    rehearsal_first = rehearsal_pointer.get("firstSafeAction") if isinstance(rehearsal_pointer.get("firstSafeAction"), dict) else {}
    rehearsal_counts = rehearsal_pointer.get("counts") if isinstance(rehearsal_pointer.get("counts"), dict) else {}
    rehearsal_html = rehearsal_pointer.get("htmlPath") or ""
    rehearsal_json = rehearsal_pointer.get("jsonPath") or ""
    rehearsal_markdown = rehearsal_pointer.get("markdownPath") or ""
    artifact_rows: list[dict[str, Any]] = []
    for artifact in artifacts:
        summary = artifact.get("summary") if isinstance(artifact.get("summary"), dict) else {}
        artifact_rows.append({
            "key": artifact.get("key") or "",
            "label": artifact.get("label") or artifact.get("key") or "Artifact",
            "path": artifact.get("path") or "",
            "exists": bool(artifact.get("exists")),
            "durationSeconds": round(float(summary.get("durationSeconds") or artifact.get("manifestDurationSeconds") or 0), 3),
            "videoStreams": summary.get("videoStreams") or 0,
            "audioStreams": summary.get("audioStreams") or 0,
            "sizeBytes": artifact.get("sizeBytes") or 0,
        })
    evidence_paths = [
        str(pointer.get("htmlPath") or packet.get("htmlPath") or ""),
        str(packet.get("worksheetPath") or packet.get("markdownPath") or ""),
        str(pointer.get("jsonPath") or packet.get("jsonPath") or ""),
        str(rehearsal_html or ""),
    ]
    note_template = decision_note_template(
        episode=packet.get("episode") or 4,
        label=f"Episode {packet.get('episode') or 4} sync/duration investigation",
        decision_choices=["re-sync-or-re-stack-required", "missing-or-wrong-source", "intentional-mismatch-with-notes", "need-more-evidence"],
        evidence_paths=evidence_paths,
        caution="A duration spread is evidence, not a repair plan. Do not blind-trim or force Episode 4 forward without classification.",
    )
    return {
        "id": "episode-4-sync-investigation",
        "kind": "sync-investigation",
        "episode": packet.get("episode") or 4,
        "label": f"Episode {packet.get('episode') or 4} sync/duration investigation",
        "status": packet.get("status") or pointer.get("status") or "sync-investigation-ready",
        "version": packet.get("version") or "",
        "htmlPath": pointer.get("htmlPath") or packet.get("htmlPath") or "",
        "jsonPath": pointer.get("jsonPath") or packet.get("jsonPath") or "",
        "markdownPath": pointer.get("markdownPath") or packet.get("markdownPath") or "",
        "openCommand": f"open {shell_quote(str(pointer.get('htmlPath') or packet.get('htmlPath') or ''))}",
        "counts": {
            "artifacts": len(artifacts),
            "comparisonPoints": len(comparisons),
            "snippets": (packet.get("counts") or {}).get("snippets", 0) if isinstance(packet.get("counts"), dict) else 0,
        },
        "artifactRows": artifact_rows,
        "durationSpreadSeconds": spread_seconds,
        "durationSpreadLabel": format_duration(spread_seconds),
        "plainEnglishDurationSummary": packet.get("plainEnglishDurationSummary") or "",
        "humanAsk": rehearsal_pointer.get("humanAsk") or packet.get("humanAsk") or "Compare the prepared video/audio snippets, then use the rehearsal to choose hold/re-stack, trim-candidate, source-needed, or continue-review.",
        "decisionRehearsal": {
            "status": rehearsal_pointer.get("status") or "",
            "htmlPath": rehearsal_html,
            "jsonPath": rehearsal_json,
            "markdownPath": rehearsal_markdown,
            "counts": rehearsal_counts,
            "firstSafeAction": rehearsal_first,
            "nextSafestAction": rehearsal_pointer.get("nextSafestAction") or "",
            "truth": rehearsal_pointer.get("truth") or {},
        },
        "reviewerQuestions": [
            "At the shared beginning/middle/video-ending points, do the video masters and podcast audio describe the same moment?",
            "Does the podcast-only tail sound like useful episode content, accidental extra recording, or the wrong audio source?",
            "Is there evidence of missing phone/camera segments that should be stacked before any final edit?",
            "Can Episode 4 move forward as a rebuild plan, or should it stay held until missing media is found?",
            "After reviewing snippets, which rehearsal scenario is safest: hold/re-stack, trim-candidate, source-needed, or continue-review?",
        ],
        "localDecisionNoteTemplate": note_template,
        "evidenceToOpen": [
            {"label": "Sync investigation packet", "path": pointer.get("htmlPath") or packet.get("htmlPath") or ""},
            {"label": "Sync worksheet", "path": packet.get("worksheetPath") or packet.get("markdownPath") or ""},
            {"label": "Sync JSON evidence", "path": pointer.get("jsonPath") or packet.get("jsonPath") or ""},
            {"label": "Sync decision rehearsal", "path": rehearsal_html},
        ],
        "codexCanDo": packet.get("agentSafeParallelWork") or "Summarize sync evidence and prepare a safer re-stack work order. Do not repair, approve, publish, upload, schedule, overwrite, delete, mutate sources, or capture receipts.",
        "nextSafestAction": packet.get("nextSafestAction") or pointer.get("nextSafestAction") or "",
        "decisionMenu": [
            "hold for re-sync/re-stack",
            "mark current package as intentionally mismatched with notes",
            "create a versioned rebuild plan",
            "return to pending with clearer media tasks",
            "open the sync decision rehearsal and choose a scenario before any live decision",
        ],
        "decisionRows": [
            {
                "decision": "Re-sync / re-stack required",
                "means": "The current package has real source alignment problems and needs a new version built from the best available spine/source stack.",
                "codexMayDo": "Create a versioned rebuild plan and continue work on other episodes while Episode 4 remains held.",
                "watchFor": "Do not force a bad package just because the files exist.",
            },
            {
                "decision": "Missing or wrong source",
                "means": "The duration spread likely comes from missing video, wrong podcast audio, or a source segment that has not been attached.",
                "codexMayDo": "Create a missing-media task list and keep the current sync investigation as evidence.",
                "watchFor": "Do not delete parked/mystery files until a human confirms they are unrelated.",
            },
            {
                "decision": "Intentional mismatch with notes",
                "means": "A human has confirmed the mismatch is acceptable for a specific reason.",
                "codexMayDo": "Record the reason and prepare a cautious package note.",
                "watchFor": "This must be explicit human judgment, not an inferred shortcut.",
            },
            {
                "decision": "Need more evidence",
                "means": "The current snippets do not prove the cause of the mismatch.",
                "codexMayDo": "Generate additional local comparison snippets and a tighter review worksheet.",
                "watchFor": "More evidence is safer than a blind trim.",
            },
        ],
        "doNotDo": [
            f"Do not blind-trim {format_duration(spread_seconds)} from audio or video.",
            "Do not mark Episode 4 publish-ready until the mismatch is classified.",
            "Do not overwrite v001 while investigating a rebuild.",
        ],
        "acceptanceRule": packet.get("unblocksWhen") or "Episode 4 moves forward only after the mismatch is classified from snippet evidence, not from duration alone.",
        "safeCommands": [
            {"label": "Open sync investigation packet", "command": f"open {shell_quote(str(pointer.get('htmlPath') or packet.get('htmlPath') or ''))}"},
            {"label": "Open worksheet", "command": f"open {shell_quote(str(packet.get('worksheetPath') or packet.get('markdownPath') or ''))}"},
            {"label": "Open sync decision rehearsal", "command": rehearsal_first.get("command") or (f"open {shell_quote(str(rehearsal_html))}" if rehearsal_html else "")},
        ],
        "truth": packet.get("truth") or pointer.get("truth") or "Local sync investigation evidence only.",
    }


def build_gate_classification_deck(items: list[dict[str, Any]], priority_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    item_by_id = {str(item.get("id") or ""): item for item in items if isinstance(item, dict)}
    deck: list[dict[str, Any]] = []
    for queue_item in priority_queue:
        if not isinstance(queue_item, dict):
            continue
        item_id = str(queue_item.get("id") or "")
        item = item_by_id.get(item_id, {})
        base = {
            "rank": queue_item.get("position") or len(deck) + 1,
            "id": f"classify-{item_id}" if item_id else f"classify-{len(deck) + 1}",
            "reviewItemId": item_id,
            "episode": item.get("episode") or "",
            "title": queue_item.get("title") or item.get("label") or "Studio review gate",
            "state": "active" if not deck else "queued",
            "gate": queue_item.get("unblockMode") or "local-review-classification",
            "owner": "Mako or Charlie",
            "humanQuestion": queue_item.get("humanQuestion") or item.get("humanAsk") or "What local review decision does this evidence support?",
            "doneWhen": queue_item.get("doneWhen") or item.get("acceptanceRule") or "A local decision note names the next safe action.",
            "towerImpact": queue_item.get("towerImpact") or "Tower stays in packet-prep until this gate is classified.",
            "openEvidenceCommand": queue_item.get("firstEvidenceCommand") or item.get("openCommand") or "",
            "dryRunDecisionCommand": queue_item.get("dryRunDecisionCommand") or "",
            "firstEvidencePath": queue_item.get("firstEvidencePath") or "",
            "agentSafeParallelWork": queue_item.get("agentSafeParallelWork") or item.get("codexCanDo") or "Codex can summarize evidence and improve local packets without mutating source or publication truth.",
            "notAllowedYet": [
                queue_item.get("unsafeShortcut") or "Do not collapse local review evidence into approval or publication truth.",
                "Do not publish, upload, schedule, send, mutate accounts, overwrite versions, delete media, or capture receipts from this gate.",
            ],
            "receiptTruth": "none",
        }
        if item_id == "episode-1-duration-candidate":
            options = [
                {
                    "key": "promote-after-review",
                    "label": "Promote after watch/listen review",
                    "means": "Episode 1 v004 feels like the best current long-form candidate and should become a real versioned review package before Tower approval.",
                    "codexMayDo": "Prepare the promotion path or versioned package update only after explicit human direction.",
                    "danger": "Candidate evidence is not the same thing as approval or publication readiness.",
                },
                {
                    "key": "refine-or-rebuild",
                    "label": "Refine or rebuild",
                    "means": "The candidate is useful, but pacing, audio/video duration, ending, or content needs another version.",
                    "codexMayDo": "Write a versioned rebuild work order and keep all existing package evidence intact.",
                    "danger": "Do not overwrite v003/v004 while making a better candidate.",
                },
                {
                    "key": "hold-current-package",
                    "label": "Hold current package",
                    "means": "Do not advance Episode 1 yet; keep Tower packets draft-only while more review or repair happens.",
                    "codexMayDo": "Improve notes, snippets, packets, and reviewer guidance without changing package truth.",
                    "danger": "Do not unblock Tower because the local packet looks close.",
                },
                {
                    "key": "need-more-evidence",
                    "label": "Need more evidence",
                    "means": "The reviewer cannot decide from the current snippets/stills.",
                    "codexMayDo": "Generate more local snippets/stills/comparison notes.",
                    "danger": "Do not promote because the decision surface is vague.",
                },
            ]
            base.update({
                "classificationType": "duration-candidate-watch-listen",
                "plainEnglish": "Watch/listen only the prepared Episode 1 v004 evidence first; classify whether this candidate should move forward, be refined, be held, or needs more evidence.",
                "decisionOptions": options,
                "recommendedFirstMove": "Open the duration candidate evidence, review beginning/middle/ending snippets, then use the dry-run decision rehearsal before any live promotion or package-state change.",
            })
        elif item_id == "episode-4-sync-investigation":
            options = [
                {
                    "key": "re-sync-or-re-stack-required",
                    "label": "Re-sync or re-stack required",
                    "means": "Episode 4 has real alignment/source-stack work before it can become a publishable package.",
                    "codexMayDo": "Create a versioned rebuild plan and continue other lanes while Episode 4 remains held.",
                    "danger": "Do not force a bad sync package into Tower.",
                },
                {
                    "key": "missing-or-wrong-source",
                    "label": "Missing or wrong source",
                    "means": "The mismatch likely comes from missing media, wrong audio, or a source segment that has not been attached.",
                    "codexMayDo": "Create missing-media tasks and preserve parked/mystery files for human confirmation.",
                    "danger": "Do not delete or discard mystery media without human confirmation.",
                },
                {
                    "key": "trim-candidate",
                    "label": "Trim candidate",
                    "means": "The extra tail may be accidental dead air or unrelated recording, but this must be proven from snippets.",
                    "codexMayDo": "Prepare a versioned trim proposal and keep the original package evidence intact.",
                    "danger": "Do not blind-trim from duration spread alone.",
                },
                {
                    "key": "intentional-mismatch-with-notes",
                    "label": "Intentional mismatch with notes",
                    "means": "A human explicitly accepts the mismatch for a known reason and the package carries that note.",
                    "codexMayDo": "Record the reason in local review notes and keep Tower cautious.",
                    "danger": "This cannot be inferred by Codex.",
                },
                {
                    "key": "need-more-evidence",
                    "label": "Need more evidence",
                    "means": "The current snippets do not prove the cause.",
                    "codexMayDo": "Generate tighter local comparison snippets and a smaller worksheet.",
                    "danger": "More evidence is safer than a fake classification.",
                },
            ]
            base.update({
                "classificationType": "sync-gap-classification",
                "plainEnglish": "Use the prepared sync snippets to classify why Episode 4’s audio/video spread exists before any trim, rebuild, or Tower movement.",
                "decisionOptions": options,
                "recommendedFirstMove": "Open the sync investigation packet, compare the prepared evidence, then use the sync decision rehearsal before any live decision.",
            })
        else:
            options = [
                {
                    "key": "promote",
                    "label": "Promote",
                    "means": "The local evidence supports moving to the next versioned package step.",
                    "codexMayDo": "Prepare the next local artifact only after explicit direction.",
                    "danger": "Promotion is not publication.",
                },
                {
                    "key": "refine",
                    "label": "Refine",
                    "means": "The evidence is useful but not enough for the next package state.",
                    "codexMayDo": "Improve the evidence packet.",
                    "danger": "Do not claim readiness from partial evidence.",
                },
                {
                    "key": "hold",
                    "label": "Hold",
                    "means": "Keep the item visible but do not advance it.",
                    "codexMayDo": "Clarify the blocker and move to another lane.",
                    "danger": "Do not let a hold become invisible.",
                },
            ]
            base.update({
                "classificationType": "local-review-classification",
                "plainEnglish": "Classify the local gate before downstream Tower work.",
                "decisionOptions": options,
                "recommendedFirstMove": "Open evidence, choose one local decision, and keep publication truth unchanged.",
            })
        deck.append(base)
    return deck


def build_payload(release_root: Path) -> dict[str, Any]:
    duration_pointer = load_json(release_root / "review-board" / "latest-duration-candidate-review.json")
    duration_rehearsal_pointer = load_json(release_root / "review-board" / "latest-duration-candidate-decision-rehearsal.json")
    sync_pointer = load_json(release_root / "review-board" / "latest-sync-investigation.json")
    sync_rehearsal_pointer = load_json(release_root / "review-board" / "latest-sync-decision-rehearsal.json")
    package_quality = load_json(release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json")
    items = [
        item
        for item in [
            summarize_duration_candidate(duration_pointer, deep_packet(duration_pointer), duration_rehearsal_pointer),
            summarize_sync_investigation(sync_pointer, deep_packet(sync_pointer), sync_rehearsal_pointer),
        ]
        if item
    ]
    priority_queue = []
    for index, item in enumerate(items, start=1):
        item_id = item.get("id", "")
        safe_commands = [command for command in item.get("safeCommands", []) if isinstance(command, dict)]
        first_evidence_path = (item.get("evidenceToOpen") or [{}])[0].get("path", "")
        rehearsal = item.get("decisionRehearsal") if isinstance(item.get("decisionRehearsal"), dict) else {}
        rehearsal_first = rehearsal.get("firstSafeAction") if isinstance(rehearsal.get("firstSafeAction"), dict) else {}
        if item_id == "episode-1-duration-candidate":
            done_when = "A local decision note says promote, refine, or hold Episode 1 v004 after watch/listen review."
            unsafe_shortcut = "Do not treat the candidate packet itself as Tower approval or a published package."
            unblock_mode = "watch-listen-duration-candidate"
            human_question = "Does Episode 1 v004 pass beginning/middle/ending watch-listen review well enough to promote, or should it be refined/held?"
            tower_impact = "Tower can draft Episode 1 packets, but cannot approve the Episode 1 package from a candidate packet alone."
            agent_safe = "Prepare comparison notes, summarize snippets, and create dry-run promotion/refine/hold notes without changing review truth."
        elif item_id == "episode-4-sync-investigation":
            done_when = "The mismatch is classified as re-stack, missing/source-needed, trim-candidate, intentional-with-notes, or continue-review."
            unsafe_shortcut = "Do not blind-trim Episode 4 just because a duration spread exists."
            unblock_mode = "classify-sync-gap"
            human_question = "Is Episode 4’s spread caused by missing/wrong media, needed re-stack, acceptable mismatch, trim candidate, or insufficient evidence?"
            tower_impact = "Tower must keep Episode 4 in draft/manual-prep until sync classification or a versioned rebuild plan exists."
            agent_safe = "Prepare missing-media tasks, sync comparison notes, and rehearsal previews while continuing other episode/Tower prep."
        else:
            done_when = "The reviewer can name the next local action and the evidence used."
            unsafe_shortcut = "Do not collapse local evidence into publication truth."
            unblock_mode = "local-review-classification"
            human_question = "What reversible local decision does this evidence support?"
            tower_impact = "Tower may prepare packets but must not advance receipt or publication truth."
            agent_safe = "Clarify evidence and prepare local-only next actions."
        priority_queue.append({
            "position": index,
            "id": item_id,
            "title": item.get("title") or item.get("label") or "Untitled review item",
            "status": item.get("status", "needs-review"),
            "unblockMode": unblock_mode,
            "humanQuestion": human_question,
            "towerImpact": tower_impact,
            "agentSafeParallelWork": agent_safe,
            "doneWhen": done_when,
            "unsafeShortcut": unsafe_shortcut,
            "firstEvidencePath": first_evidence_path,
            "firstEvidenceCommand": safe_commands[0].get("command", "") if safe_commands else (f"open {shell_quote(str(first_evidence_path))}" if first_evidence_path else ""),
            "dryRunDecisionCommand": rehearsal_first.get("command") or "",
        })

    gate_classification_deck = build_gate_classification_deck(items, priority_queue)
    studio_unblock_cockpit = {
        "headline": "Two Studio questions are holding Tower back; everything else is safe prep.",
        "plainEnglish": "This surface separates human judgment gates from agent-safe production work. The point is not to slow publishing down; it is to prevent fake readiness from leaking into Tower.",
        "currentGates": [
            {
                "id": item.get("id", ""),
                "episode": item.get("episode", ""),
                "gate": queue_item.get("unblockMode", ""),
                "humanQuestion": queue_item.get("humanQuestion", ""),
                "doneWhen": queue_item.get("doneWhen", ""),
                "towerImpact": queue_item.get("towerImpact", ""),
                "firstEvidencePath": queue_item.get("firstEvidencePath", ""),
                "firstEvidenceCommand": queue_item.get("firstEvidenceCommand", ""),
                "dryRunDecisionCommand": queue_item.get("dryRunDecisionCommand", ""),
            }
            for item, queue_item in zip(items, priority_queue)
        ],
        "agentSafeParallelWork": [
            "Improve reviewer packets, manifests, validation summaries, and local-only metadata.",
            "Prepare platform copy and manual publishing packets as drafts.",
            "Generate or summarize local snippets/stills/waveform evidence when the UI path is blocked.",
            "Clarify blockers into small questions that Charlie, Mako, or Homer can answer quickly.",
            "Keep working other lanes when one episode stalls.",
        ],
        "humanOnlyOrExplicitApprovalWork": [
            "Approve a package for publication.",
            "Publish, upload, schedule, send, mutate external accounts, or capture a real receipt.",
            "Declare an intentional mismatch acceptable.",
            "Delete or discard mystery media.",
        ],
        "towerUnlockConditions": [
            "Episode 1: v004 is promoted/refined/held through an explicit local decision after watch-listen evidence.",
            "Episode 4: sync spread is classified and either held with clear tasks or routed into a new versioned rebuild plan.",
            "Any Tower artifact: external receipt truth still requires explicit approval plus a real platform URL/receipt.",
        ],
        "whatNotToWaitFor": [
            "Do not wait for full automation before preparing manual publishing packets.",
            "Do not wait for every episode to be perfect before making another episode clearer.",
            "Do not wait for external credentials to improve local packets, notes, manifests, and review boards.",
        ],
    }

    review_state_machine = {
        "principle": "Review truth moves one reversible step at a time: local evidence, local decision, versioned package action, Tower packet prep, explicit external receipt.",
        "states": [
            {
                "id": "local-evidence",
                "plain": "Evidence exists locally: manifests, snippets, sync reports, notes, and review packets.",
                "allowedNext": ["watch-listen-decision"],
            },
            {
                "id": "watch-listen-decision",
                "plain": "A human or agent reviewer records a local decision: promote, refine, hold, re-stack, source-needed, or continue-review.",
                "allowedNext": ["versioned-package-action"],
            },
            {
                "id": "versioned-package-action",
                "plain": "A new version or explicit no-change note is created without overwriting older versions.",
                "allowedNext": ["tower-packet-prep"],
            },
            {
                "id": "tower-packet-prep",
                "plain": "Tower can prepare metadata, platform packets, calendar slots, and receipt placeholders.",
                "allowedNext": ["external-publication-receipt"],
            },
            {
                "id": "external-publication-receipt",
                "plain": "Only explicit approval plus an actual platform URL or receipt can create publication truth.",
                "allowedNext": [],
            },
        ],
        "forbiddenTransitions": [
            "candidate packet -> Tower approval",
            "sync duration spread -> blind trim",
            "local packet -> published",
            "reviewable -> receipt-backed",
            "metadata prepared -> externally scheduled",
        ],
    }

    tower_boundary = {
        "plain": "Tower may prepare packets and receipt slots, but it cannot claim approval, publication, scheduling, upload, or receipt truth from this companion.",
        "towerCanDoNow": [
            "prepare platform metadata packets",
            "show manual-publishing checklists",
            "hold receipt slots",
            "surface next safest local review action",
        ],
        "towerCannotDoWithoutExplicitApproval": [
            "publish",
            "upload",
            "schedule externally",
            "send messages",
            "mutate accounts",
            "mark a receipt as real without a URL or platform artifact",
        ],
    }

    first = items[0] if items else {}
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio-top-review-companion-ready" if items else "studio-top-review-companion-empty",
        "releaseRoot": str(release_root),
        "sourcePackageQualityDeskJson": package_quality.get("jsonPath") or "",
        "sourcePackageQualityDeskHtml": package_quality.get("htmlPath") or "",
        "counts": {
            "reviewItems": len(items),
            "durationCandidateItems": sum(1 for item in items if item.get("kind") == "duration-candidate-review"),
            "durationCandidateDecisionRehearsalItems": 1 if duration_rehearsal_pointer else 0,
            "syncInvestigationItems": sum(1 for item in items if item.get("kind") == "sync-investigation"),
            "localDecisionNoteTemplates": sum(1 for item in items if item.get("localDecisionNoteTemplate")),
            "gateClassificationRows": len(gate_classification_deck),
            "gateClassificationOptions": sum(len(card.get("decisionOptions") or []) for card in gate_classification_deck),
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
        },
        "reviewRunway": {
            "headline": "Review Episode 1 candidate and Episode 4 sync evidence before Tower publishing work.",
            "firstFifteenMinutes": [
                "Open the first review item.",
                "Watch/listen only the prepared snippets first, not the entire episode.",
                "Write a local decision note: promote, refine, hold, or pending-with-clearer-evidence.",
            ],
            "firstHour": [
                "Classify Episode 1 v004: promote candidate, refine candidate, or keep current v003 on hold.",
                "Use the Episode 1 duration candidate decision rehearsal before any live candidate promotion or review-ledger change.",
                "Classify Episode 4: sync/re-stack needed, versioned rebuild needed, source media needed, trim-candidate, or intentional mismatch with notes.",
                "Do not approve Tower artifacts until the current-best package matches the reviewed decision.",
            ],
            "doNotDo": [
                "Do not publish, upload, schedule, send, mutate accounts, or capture receipts.",
                "Do not approve a current Tower artifact directly from a duration-candidate packet.",
                "Do not force Episode 4 by trimming blindly from duration alone.",
                "Do not overwrite old versions or mutate original media.",
            ],
            "codexParallelWork": [
                "Summarize snippets and manifests into reviewer notes.",
                "Prepare dry-run local review commands and promotion-plan previews.",
                "Make missing decisions more precise without executing review ledger mutations.",
                "Use the sync decision rehearsal to preview hold/re-stack/source-needed/trim-candidate paths before any live decision.",
            ],
        },
        "studioUnblockCockpit": studio_unblock_cockpit,
        "priorityReviewQueue": priority_queue,
        "gateClassificationDeck": gate_classification_deck,
        "firstGateClassification": gate_classification_deck[0] if gate_classification_deck else {},
        "reviewStateMachine": review_state_machine,
        "towerBoundary": tower_boundary,
        "reviewItems": items,
        "firstReviewItem": first,
        "firstSafeAction": {
            "label": "Open Studio top review companion",
            "command": "",
            "path": "",
            "safety": "Opens local review evidence only. No publishing, upload, scheduling, account mutation, approval, receipt capture, overwrite, delete, or source mutation.",
        },
        "nextSafestAction": first.get("nextSafestAction") or "Open the top review companion and classify the first local review item.",
        "truth": "Top review companion only. It reads local evidence and creates a reviewer map; it does not approve, promote, repair, publish, upload, schedule, mutate accounts, overwrite versions, delete files, mutate sources, or capture receipts.",
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["id", "kind", "episode", "label", "status", "currentVersion", "candidateVersion", "version", "htmlPath", "nextSafestAction", "acceptanceRule"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for item in payload.get("reviewItems", []):
            writer.writerow({field: item.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio top review companion",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Review items: `{payload['counts']['reviewItems']}`",
        "",
        f"- Reviewer worksheet: `{payload.get('worksheetPath', '')}`",
        "",
        payload["truth"],
        "",
        "## First 15 minutes",
        "",
    ]
    for step in payload["reviewRunway"]["firstFifteenMinutes"]:
        lines.append(f"- {step}")
    lines.extend(["", "## First hour", ""])
    for step in payload["reviewRunway"]["firstHour"]:
        lines.append(f"- {step}")
    lines.extend(["", "## Do not do", ""])
    for step in payload["reviewRunway"]["doNotDo"]:
        lines.append(f"- {step}")
    lines.extend(["", "## Priority review queue", ""])
    for item in payload.get("priorityReviewQueue", []):
        lines.extend([
            f"### {item.get('position', '')}. {item.get('title', 'Review item')}",
            f"- Status: `{item.get('status', '')}`",
            f"- Human question: {item.get('humanQuestion', '')}",
            f"- Tower impact: {item.get('towerImpact', '')}",
            f"- Agent-safe parallel work: {item.get('agentSafeParallelWork', '')}",
            f"- Done when: {item.get('doneWhen', '')}",
            f"- Unsafe shortcut to avoid: {item.get('unsafeShortcut', '')}",
            f"- First evidence: `{item.get('firstEvidencePath', '')}`",
            f"- First evidence command: `{item.get('firstEvidenceCommand', '')}`",
            f"- Dry-run decision command: `{item.get('dryRunDecisionCommand', '')}`",
            "",
        ])
    lines.extend(["", "## Gate classification deck", ""])
    for gate in payload.get("gateClassificationDeck", []):
        if not isinstance(gate, dict):
            continue
        lines.extend([
            f"### {gate.get('rank', '')}. {gate.get('title', '')}",
            f"- State: `{gate.get('state', '')}`",
            f"- Owner: {gate.get('owner', '')}",
            f"- Gate: `{gate.get('gate', '')}`",
            f"- Type: `{gate.get('classificationType', '')}`",
            f"- Plain English: {gate.get('plainEnglish', '')}",
            f"- Recommended first move: {gate.get('recommendedFirstMove', '')}",
            f"- Human question: {gate.get('humanQuestion', '')}",
            f"- Done when: {gate.get('doneWhen', '')}",
            f"- Tower impact: {gate.get('towerImpact', '')}",
            f"- Open evidence: `{gate.get('openEvidenceCommand', '')}`",
            f"- Dry-run decision: `{gate.get('dryRunDecisionCommand', '')}`",
            "",
            "Decision options:",
        ])
        for option in gate.get("decisionOptions", []):
            if not isinstance(option, dict):
                continue
            lines.append(f"- **{option.get('label', '')}** (`{option.get('key', '')}`): {option.get('means', '')} Codex may: {option.get('codexMayDo', '')} Danger: {option.get('danger', '')}")
        lines.append("")
        lines.append("Not allowed yet:")
        for warning in gate.get("notAllowedYet", []):
            lines.append(f"- {warning}")
        lines.append("")
    cockpit = payload.get("studioUnblockCockpit", {})
    lines.extend(["", "## Studio unblock cockpit", "", cockpit.get("plainEnglish", "")])
    lines.extend(["", "### Current gates", ""])
    for gate in cockpit.get("currentGates", []):
        lines.extend([
            f"- **Episode {gate.get('episode', '')} / {gate.get('gate', '')}**: {gate.get('humanQuestion', '')}",
            f"  Tower impact: {gate.get('towerImpact', '')}",
            f"  Done when: {gate.get('doneWhen', '')}",
        ])
    lines.extend(["", "### Agent-safe parallel work", ""])
    for action in cockpit.get("agentSafeParallelWork", []):
        lines.append(f"- {action}")
    lines.extend(["", "### Human-only or explicit-approval work", ""])
    for action in cockpit.get("humanOnlyOrExplicitApprovalWork", []):
        lines.append(f"- {action}")
    lines.extend(["", "### Tower unlock conditions", ""])
    for condition in cockpit.get("towerUnlockConditions", []):
        lines.append(f"- {condition}")
    lines.extend(["", "## Review state machine", ""])
    lines.append(payload.get("reviewStateMachine", {}).get("principle", ""))
    for state in payload.get("reviewStateMachine", {}).get("states", []):
        lines.append(f"- `{state.get('id', '')}`: {state.get('plain', '')} Next: {', '.join(state.get('allowedNext', [])) or 'none'}.")
    lines.extend(["", "Forbidden shortcuts:"])
    for transition in payload.get("reviewStateMachine", {}).get("forbiddenTransitions", []):
        lines.append(f"- {transition}")
    boundary = payload.get("towerBoundary", {})
    lines.extend(["", "## Tower boundary", "", boundary.get("plain", "")])
    lines.append("")
    lines.append("Tower can do now:")
    for action in boundary.get("towerCanDoNow", []):
        lines.append(f"- {action}")
    lines.append("")
    lines.append("Tower cannot do without explicit approval:")
    for action in boundary.get("towerCannotDoWithoutExplicitApproval", []):
        lines.append(f"- {action}")
    lines.extend(["", "## Review items", ""])
    for item in payload.get("reviewItems", []):
        lines.extend([
            f"### {item['label']}",
            f"- Status: `{item['status']}`",
            f"- Open: `{item['openCommand']}`",
            f"- Human ask: {item['humanAsk']}",
            f"- Codex can do: {item['codexCanDo']}",
            f"- Acceptance rule: {item['acceptanceRule']}",
            f"- Next safest action: {item['nextSafestAction']}",
            "",
            "Reviewer questions:",
        ])
        for question in item.get("reviewerQuestions", []):
            lines.append(f"- {question}")
        lines.append("")
        lines.append("Decision rows:")
        for row in item.get("decisionRows", []):
            lines.append(f"- **{row.get('decision', '')}**: {row.get('means', '')} Codex may: {row.get('codexMayDo', '')} Watch for: {row.get('watchFor', '')}")
        note_template = item.get("localDecisionNoteTemplate") if isinstance(item.get("localDecisionNoteTemplate"), dict) else {}
        if note_template.get("copyPasteMarkdown"):
            lines.extend([
                "",
                "Copyable local decision note:",
                "",
                "```markdown",
                str(note_template.get("copyPasteMarkdown", "")).rstrip(),
                "```",
            ])
        lines.extend([
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_worksheet(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio top review worksheet",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Companion: `{payload.get('htmlPath', '')}`",
        "",
        "Use this as a local decision sheet. It does not approve, publish, upload, schedule, capture receipts, overwrite versions, delete files, or mutate source media.",
        "",
        "## How to use this",
        "",
        "1. Open the evidence packet for one item.",
        "2. Watch or listen only the prepared snippets first.",
        "3. Answer the reviewer questions in plain English.",
        "4. Choose one decision row.",
        "5. Ask Codex to take the safe next action, or leave the item held.",
        "",
        "## Current priority queue",
        "",
    ]
    for item in payload.get("priorityReviewQueue", []):
        lines.extend([
            f"### {item.get('position', '')}. {item.get('title', 'Review item')}",
            "",
            f"- Status: `{item.get('status', '')}`",
            f"- Human question: {item.get('humanQuestion', '')}",
            f"- Tower impact: {item.get('towerImpact', '')}",
            f"- Agent-safe parallel work: {item.get('agentSafeParallelWork', '')}",
            f"- Done when: {item.get('doneWhen', '')}",
            f"- Unsafe shortcut to avoid: {item.get('unsafeShortcut', '')}",
            f"- First evidence: `{item.get('firstEvidencePath', '')}`",
            f"- First evidence command: `{item.get('firstEvidenceCommand', '')}`",
            f"- Dry-run decision command: `{item.get('dryRunDecisionCommand', '')}`",
            "",
        ])
    lines.extend(["## Gate classification deck", ""])
    for gate in payload.get("gateClassificationDeck", []):
        if not isinstance(gate, dict):
            continue
        lines.extend([
            f"### {gate.get('rank', '')}. {gate.get('title', '')}",
            "",
            f"- State: `{gate.get('state', '')}`",
            f"- Owner: {gate.get('owner', '')}",
            f"- Gate: `{gate.get('gate', '')}`",
            f"- Type: `{gate.get('classificationType', '')}`",
            f"- Plain English: {gate.get('plainEnglish', '')}",
            f"- Recommended first move: {gate.get('recommendedFirstMove', '')}",
            f"- Human question: {gate.get('humanQuestion', '')}",
            f"- Done when: {gate.get('doneWhen', '')}",
            f"- Tower impact: {gate.get('towerImpact', '')}",
            f"- Open evidence: `{gate.get('openEvidenceCommand', '')}`",
            f"- Dry-run decision: `{gate.get('dryRunDecisionCommand', '')}`",
            "",
            "#### Decision options",
            "",
        ])
        for option in gate.get("decisionOptions", []):
            if not isinstance(option, dict):
                continue
            lines.extend([
                f"- [ ] **{option.get('label', '')}** (`{option.get('key', '')}`)",
                f"  - Means: {option.get('means', '')}",
                f"  - Codex may do: {option.get('codexMayDo', '')}",
                f"  - Danger: {option.get('danger', '')}",
            ])
        lines.extend(["", "#### Not allowed yet", ""])
        for warning in gate.get("notAllowedYet", []):
            lines.append(f"- {warning}")
        lines.extend(["", "---", ""])
    cockpit = payload.get("studioUnblockCockpit", {})
    lines.extend([
        "## Studio unblock cockpit",
        "",
        cockpit.get("plainEnglish", ""),
        "",
        "### Current gates",
        "",
    ])
    for gate in cockpit.get("currentGates", []):
        lines.extend([
            f"#### Episode {gate.get('episode', '')}: {gate.get('gate', '')}",
            "",
            f"- Human question: {gate.get('humanQuestion', '')}",
            f"- Tower impact: {gate.get('towerImpact', '')}",
            f"- Done when: {gate.get('doneWhen', '')}",
            f"- First evidence: `{gate.get('firstEvidencePath', '')}`",
            f"- First evidence command: `{gate.get('firstEvidenceCommand', '')}`",
            f"- Dry-run decision command: `{gate.get('dryRunDecisionCommand', '')}`",
            "",
        ])
    lines.extend(["### Agent-safe parallel work", ""])
    for action in cockpit.get("agentSafeParallelWork", []):
        lines.append(f"- {action}")
    lines.extend(["", "### Human-only or explicit-approval work", ""])
    for action in cockpit.get("humanOnlyOrExplicitApprovalWork", []):
        lines.append(f"- {action}")
    lines.extend(["", "### Tower unlock conditions", ""])
    for condition in cockpit.get("towerUnlockConditions", []):
        lines.append(f"- {condition}")
    lines.extend(["", "### What not to wait for", ""])
    for item in cockpit.get("whatNotToWaitFor", []):
        lines.append(f"- {item}")
    lines.append("")
    lines.extend([
        "## Review state machine",
        "",
        payload.get("reviewStateMachine", {}).get("principle", ""),
        "",
    ])
    for state in payload.get("reviewStateMachine", {}).get("states", []):
        lines.append(f"- `{state.get('id', '')}`: {state.get('plain', '')}")
    lines.extend(["", "Forbidden shortcuts:", ""])
    for transition in payload.get("reviewStateMachine", {}).get("forbiddenTransitions", []):
        lines.append(f"- {transition}")
    boundary = payload.get("towerBoundary", {})
    lines.extend([
        "",
        "## Tower boundary",
        "",
        boundary.get("plain", ""),
        "",
    ]
    )
    for action in boundary.get("towerCanDoNow", []):
        lines.append(f"- Can prepare: {action}")
    for action in boundary.get("towerCannotDoWithoutExplicitApproval", []):
        lines.append(f"- Cannot do without explicit approval: {action}")
    lines.append("")
    for index, item in enumerate(payload.get("reviewItems", []), start=1):
        lines.extend([
            f"## {index}. {item.get('label', 'Review item')}",
            "",
            f"- Kind: `{item.get('kind', '')}`",
            f"- Episode: `{item.get('episode', '')}`",
            f"- Status: `{item.get('status', '')}`",
            f"- Human ask: {item.get('humanAsk', '')}",
            f"- Next safest action: {item.get('nextSafestAction', '')}",
            f"- Acceptance rule: {item.get('acceptanceRule', '')}",
            "",
        ])
        if item.get("durationSpreadSeconds"):
            lines.extend([
                f"- Duration spread: `{item.get('durationSpreadSeconds')}` seconds (`{item.get('durationSpreadLabel', '')}`)",
                f"- Plain English: {item.get('plainEnglishDurationSummary', '')}",
                "",
            ])
        lines.extend(["### Evidence to open", ""])
        for evidence in item.get("evidenceToOpen", []):
            lines.append(f"- {evidence.get('label', 'Evidence')}: `{evidence.get('path', '')}`")
        lines.extend(["", "### Reviewer questions", ""])
        for question in item.get("reviewerQuestions", []):
            lines.append(f"- [ ] {question}")
        lines.extend(["", "### Decision rows", ""])
        for row in item.get("decisionRows", []):
            lines.extend([
                f"#### {row.get('decision', '')}",
                "",
                f"- Means: {row.get('means', '')}",
                f"- Codex may do: {row.get('codexMayDo', '')}",
                f"- Watch for: {row.get('watchFor', '')}",
                "",
            ])
        lines.extend(["### Do not do", ""])
        for warning in item.get("doNotDo", []):
            lines.append(f"- {warning}")
        note_template = item.get("localDecisionNoteTemplate") if isinstance(item.get("localDecisionNoteTemplate"), dict) else {}
        if note_template.get("copyPasteMarkdown"):
            lines.extend([
                "",
                "### Copyable local decision note",
                "",
                "```markdown",
                str(note_template.get("copyPasteMarkdown", "")).rstrip(),
                "```",
            ])
        lines.extend([
            "",
            "### Local decision note",
            "",
            "- Decision:",
            "- Reason:",
            "- Follow-up for Codex:",
            "- Follow-up for Charlie/Mako/Homer:",
            "",
            "---",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    esc = html.escape
    first_15 = "".join(f"<li>{esc(str(step))}</li>" for step in payload["reviewRunway"]["firstFifteenMinutes"])
    first_hour = "".join(f"<li>{esc(str(step))}</li>" for step in payload["reviewRunway"]["firstHour"])
    do_not = "".join(f"<li>{esc(str(step))}</li>" for step in payload["reviewRunway"]["doNotDo"])
    priority_queue = "".join(
        f"<li><b>{esc(str(item.get('position')))}. {esc(str(item.get('title') or 'Review item'))}</b><br><span>{esc(str(item.get('humanQuestion') or ''))}</span><br><span>{esc(str(item.get('doneWhen') or ''))}</span><br><em>Tower: {esc(str(item.get('towerImpact') or ''))}</em><br><em>Avoid: {esc(str(item.get('unsafeShortcut') or ''))}</em></li>"
        for item in payload.get("priorityReviewQueue", [])
    )
    gate_classification_cards = "".join(
        f"""
        <article class="classification-card classification-{esc(str(gate.get('state') or 'queued'))}">
          <p class="eyebrow">{esc(str(gate.get('state') or 'queued'))} · {esc(str(gate.get('classificationType') or 'classification'))}</p>
          <h3>{esc(str(gate.get('rank') or ''))}. {esc(str(gate.get('title') or 'Gate'))}</h3>
          <p>{esc(str(gate.get('plainEnglish') or ''))}</p>
          <p><b>Owner:</b> {esc(str(gate.get('owner') or ''))}</p>
          <p><b>Question:</b> {esc(str(gate.get('humanQuestion') or ''))}</p>
          <p><b>Done when:</b> {esc(str(gate.get('doneWhen') or ''))}</p>
          <p><b>Tower impact:</b> {esc(str(gate.get('towerImpact') or ''))}</p>
          <p><b>Recommended first move:</b> {esc(str(gate.get('recommendedFirstMove') or ''))}</p>
          <h4>Decision options</h4>
          <ul>{"".join(f"<li><b>{esc(str(option.get('label') or 'Option'))}</b> <code>{esc(str(option.get('key') or ''))}</code><br>{esc(str(option.get('means') or ''))}<br><em>Codex may:</em> {esc(str(option.get('codexMayDo') or ''))}<br><em>Danger:</em> {esc(str(option.get('danger') or ''))}</li>" for option in (gate.get('decisionOptions') or []) if isinstance(option, dict))}</ul>
          <h4>Not allowed yet</h4>
          <ul>{"".join(f"<li>{esc(str(warning))}</li>" for warning in (gate.get('notAllowedYet') or []))}</ul>
          <pre>{esc(str(gate.get('openEvidenceCommand') or ''))}</pre>
          <pre>{esc(str(gate.get('dryRunDecisionCommand') or ''))}</pre>
        </article>
        """
        for gate in payload.get("gateClassificationDeck", [])
        if isinstance(gate, dict)
    )
    cockpit = payload.get("studioUnblockCockpit", {})
    cockpit_gates = "".join(
        f"<li><b>Episode {esc(str(gate.get('episode') or ''))}: {esc(str(gate.get('gate') or 'gate'))}</b><br>{esc(str(gate.get('humanQuestion') or ''))}<br><em>{esc(str(gate.get('towerImpact') or ''))}</em><code>{esc(str(gate.get('firstEvidenceCommand') or ''))}</code></li>"
        for gate in cockpit.get("currentGates", [])
    )
    cockpit_agent_safe = "".join(f"<li>{esc(str(action))}</li>" for action in cockpit.get("agentSafeParallelWork", []))
    cockpit_human_only = "".join(f"<li>{esc(str(action))}</li>" for action in cockpit.get("humanOnlyOrExplicitApprovalWork", []))
    cockpit_unlocks = "".join(f"<li>{esc(str(condition))}</li>" for condition in cockpit.get("towerUnlockConditions", []))
    cockpit_not_wait = "".join(f"<li>{esc(str(item))}</li>" for item in cockpit.get("whatNotToWaitFor", []))
    state_machine = "".join(
        f"<li><b>{esc(str(state.get('id') or 'state'))}</b>: {esc(str(state.get('plain') or ''))}</li>"
        for state in payload.get("reviewStateMachine", {}).get("states", [])
    )
    forbidden_transitions = "".join(
        f"<li>{esc(str(transition))}</li>"
        for transition in payload.get("reviewStateMachine", {}).get("forbiddenTransitions", [])
    )
    boundary = payload.get("towerBoundary", {})
    tower_can = "".join(f"<li>{esc(str(action))}</li>" for action in boundary.get("towerCanDoNow", []))
    tower_cannot = "".join(f"<li>{esc(str(action))}</li>" for action in boundary.get("towerCannotDoWithoutExplicitApproval", []))
    cards: list[str] = []
    for item in payload.get("reviewItems", []):
        commands = "".join(f"<li><b>{esc(str(cmd.get('label') or 'Command'))}</b><code>{esc(str(cmd.get('command') or ''))}</code></li>" for cmd in item.get("safeCommands", []))
        decisions = "".join(f"<li>{esc(str(decision))}</li>" for decision in item.get("decisionMenu", []))
        questions = "".join(f"<li>{esc(str(question))}</li>" for question in item.get("reviewerQuestions", []))
        evidence_links = "".join(f"<li><b>{esc(str(evidence.get('label') or 'Evidence'))}</b><code>{esc(str(evidence.get('path') or ''))}</code></li>" for evidence in item.get("evidenceToOpen", []))
        warnings = "".join(f"<li>{esc(str(warning))}</li>" for warning in item.get("doNotDo", []))
        decision_rows = "".join(
            f"<tr><td>{esc(str(row.get('decision') or ''))}</td><td>{esc(str(row.get('means') or ''))}</td><td>{esc(str(row.get('codexMayDo') or ''))}</td><td>{esc(str(row.get('watchFor') or ''))}</td></tr>"
            for row in item.get("decisionRows", [])
        )
        note_template = item.get("localDecisionNoteTemplate") if isinstance(item.get("localDecisionNoteTemplate"), dict) else {}
        note_html = ""
        if note_template.get("copyPasteMarkdown"):
            note_html = f"""
          <h3>Copyable local decision note</h3>
          <p class="safety">{esc(str(note_template.get('truth') or 'Local note template only.'))}</p>
          <pre>{esc(str(note_template.get('copyPasteMarkdown') or ''))}</pre>
            """
        artifacts = "".join(
            f"<tr><td>{esc(str(row.get('label') or row.get('key') or ''))}</td><td>{esc(str(row.get('exists')))}</td><td>{esc(str(row.get('durationSeconds') or row.get('snippetCount') or ''))}</td><td><code>{esc(str(row.get('path') or row.get('firstSnippetPath') or ''))}</code></td></tr>"
            for row in item.get("artifactRows", [])
        )
        duration_note = ""
        if item.get("durationSpreadSeconds"):
            duration_note = f"<p class=\"warning\"><b>Duration spread:</b> {esc(str(item.get('durationSpreadLabel')))} ({esc(str(item.get('durationSpreadSeconds')))} seconds). {esc(str(item.get('plainEnglishDurationSummary') or ''))}</p>"
        cards.append(f"""
        <article class="card {esc(str(item.get('kind')))}">
          <p class="eyebrow">Episode {esc(str(item.get('episode')))} · {esc(str(item.get('kind')))}</p>
          <h2>{esc(str(item.get('label')))}</h2>
          <p><b>Status:</b> {esc(str(item.get('status')))}</p>
          {duration_note}
          <p>{esc(str(item.get('humanAsk')))}</p>
          <p><b>Next:</b> {esc(str(item.get('nextSafestAction')))}</p>
          <p><b>Acceptance rule:</b> {esc(str(item.get('acceptanceRule')))}</p>
          <h3>Evidence to open</h3>
          <ul class="commands">{evidence_links}</ul>
          <h3>Reviewer questions</h3>
          <ul>{questions}</ul>
          <h3>Decision menu</h3>
          <ul>{decisions}</ul>
          <h3>Decision worksheet</h3>
          <table><thead><tr><th>Decision</th><th>Means</th><th>Codex may do</th><th>Watch for</th></tr></thead><tbody>{decision_rows}</tbody></table>
          {note_html}
          <h3>Safe commands</h3>
          <ul class="commands">{commands}</ul>
          <h3>Evidence</h3>
          <table><thead><tr><th>Artifact</th><th>Exists</th><th>Duration/snips</th><th>Path</th></tr></thead><tbody>{artifacts}</tbody></table>
          <h3>Do not do</h3>
          <ul>{warnings}</ul>
          <p class="safety">{esc(str(item.get('truth')))}</p>
        </article>
        """)
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio top review companion</title>
  <style>
    :root {{ color-scheme: dark; --bg:#11170f; --panel:#1d261d; --ink:#fff8dc; --muted:#d8cda8; --gold:#f6cf4b; --blue:#72c7ff; --red:#ec7a67; --line:rgba(246,207,75,.22); }}
    body {{ margin:0; background:radial-gradient(circle at 12% 0%,#273c29 0,#11170f 42%,#0b0f0b 100%); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:38px 24px 64px; }}
    .hero,.card {{ background:rgba(29,38,29,.92); border:1px solid var(--line); border-radius:24px; padding:24px; box-shadow:0 22px 60px rgba(0,0,0,.28); }}
    .worksheet {{ display:inline-flex; align-items:center; gap:8px; margin-top:12px; padding:10px 14px; border-radius:999px; color:#17210f; background:var(--gold); font-weight:900; text-decoration:none; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin-top:18px; }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
    h1,h2,h3 {{ margin:.2em 0 .45em; }}
    p,li {{ color:var(--muted); line-height:1.48; }}
    code {{ display:block; color:#caf0c7; overflow-wrap:anywhere; margin-top:6px; }}
    table {{ width:100%; border-collapse:collapse; margin-top:10px; }}
    th,td {{ text-align:left; border-top:1px solid rgba(255,255,255,.1); padding:8px; vertical-align:top; color:var(--muted); }}
    th {{ color:var(--ink); }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.24); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:14px; color:#f5edc5; }}
    .safety {{ border-left:4px solid var(--gold); padding-left:12px; color:#fff0a8; }}
    .warning {{ border:1px solid rgba(236,122,103,.45); background:rgba(236,122,103,.12); border-radius:14px; padding:10px 12px; color:#ffd7cd; }}
    .sync-investigation {{ border-color:rgba(114,199,255,.35); }}
    .duration-candidate-review {{ border-color:rgba(246,207,75,.35); }}
    .classification-card {{ background:rgba(15,24,18,.94); border:1px solid rgba(114,199,255,.28); border-radius:22px; padding:18px; }}
    .classification-active {{ border-color:rgba(246,207,75,.55); box-shadow:0 0 0 1px rgba(246,207,75,.14), 0 18px 60px rgba(0,0,0,.24); }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio</p>
    <h1>Top review companion</h1>
    <p>{esc(payload['truth'])}</p>
    <p><b>Next safest action:</b> {esc(str(payload['nextSafestAction']))}</p>
    <a class="worksheet" href="{esc(Path(str(payload.get('worksheetPath') or '')).name)}">Open reviewer worksheet</a>
  </section>
  <section class="grid">
    <article class="card"><h2>First 15 minutes</h2><ul>{first_15}</ul></article>
    <article class="card"><h2>First hour</h2><ul>{first_hour}</ul></article>
    <article class="card"><h2>Do not do</h2><ul>{do_not}</ul></article>
  </section>
  <section class="hero">
    <p class="eyebrow">Studio unblock cockpit</p>
    <h2>{esc(str(cockpit.get('headline') or 'Current review gates'))}</h2>
    <p>{esc(str(cockpit.get('plainEnglish') or ''))}</p>
    <div class="grid">
      <article class="card"><h3>Current human gates</h3><ul>{cockpit_gates}</ul></article>
      <article class="card"><h3>Agent-safe parallel work</h3><ul>{cockpit_agent_safe}</ul></article>
      <article class="card"><h3>Explicit approval only</h3><ul>{cockpit_human_only}</ul></article>
      <article class="card"><h3>Tower unlocks</h3><ul>{cockpit_unlocks}</ul><h3>Do not wait for</h3><ul>{cockpit_not_wait}</ul></article>
    </div>
  </section>
  <section class="grid">
    <article class="card"><h2>Priority review queue</h2><ul>{priority_queue}</ul></article>
    <article class="card"><h2>Review state machine</h2><p>{esc(str(payload.get('reviewStateMachine', {}).get('principle') or ''))}</p><ul>{state_machine}</ul><h3>Forbidden shortcuts</h3><ul>{forbidden_transitions}</ul></article>
    <article class="card"><h2>Tower boundary</h2><p>{esc(str(boundary.get('plain') or ''))}</p><h3>Can prepare</h3><ul>{tower_can}</ul><h3>Cannot do without approval</h3><ul>{tower_cannot}</ul></article>
  </section>
  <section class="hero">
    <p class="eyebrow">Gate classification deck</p>
    <h2>Pick one local decision. Do not turn it into publishing truth.</h2>
    <div class="grid">{gate_classification_cards}</div>
  </section>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>""", encoding="utf-8")


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_RELEASE_ROOT
    session_dir = release_root / "review-board" / "top-review-companions" / stamp()
    session_dir.mkdir(parents=True, exist_ok=False)
    payload = build_payload(release_root)
    json_path = session_dir / "studio-top-review-companion.json"
    markdown_path = session_dir / "START-HERE-studio-top-review-companion.md"
    csv_path = session_dir / "studio-top-review-companion.csv"
    worksheet_path = session_dir / "STUDIO-TOP-REVIEW-WORKSHEET.md"
    html_path = session_dir / "index.html"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "worksheetPath": str(worksheet_path),
        "htmlPath": str(html_path),
    })
    payload["firstSafeAction"].update({
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
    })
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_worksheet(worksheet_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": "quipsly.studio.top-review-companion.latest.v1",
        "status": payload["status"],
        "updatedAt": payload["generatedAt"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "worksheetPath": str(worksheet_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "humanAsk": "Review the two front-door Studio blockers in order: Episode 1 v004 duration candidate snippets, then Episode 4 sync evidence. Record promote/refine/hold/re-stack/source-needed decisions before Tower approval.",
        "agentSafeParallelWork": "Codex can summarize evidence, prepare dry-run promotion or sync-decision rehearsal notes, and improve review packets. It must not approve, promote, repair, publish, upload, schedule, overwrite, delete, mutate sources, or capture receipts without explicit approval.",
        "firstSafeAction": payload["firstSafeAction"],
        "firstReviewItem": payload.get("firstReviewItem") or {},
        "firstLocalDecisionNoteTemplate": (payload.get("firstReviewItem") or {}).get("localDecisionNoteTemplate") or {},
        "reviewRunway": payload["reviewRunway"],
        "studioUnblockCockpit": payload["studioUnblockCockpit"],
        "priorityReviewQueue": payload["priorityReviewQueue"],
        "gateClassificationDeck": payload["gateClassificationDeck"],
        "firstGateClassification": payload["firstGateClassification"],
        "reviewStateMachine": payload["reviewStateMachine"],
        "towerBoundary": payload["towerBoundary"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(release_root / "review-board" / "top-review-companions" / "latest-studio-top-review-companion.json", pointer)
    write_json(release_root / "review-board" / "latest-studio-top-review-companion.json", pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
