#!/usr/bin/env python3
"""Episode 4 YouTube-standard recipe review ledger.

Records human/agent review decisions for metadata-only recipe operations from
`episode4-youtube-standard-recipe`. This is the promotion bridge from generated
SHOW/SKIP/specialist suggestions into future branch metadata.

Safety boundary: sidecar review metadata only. This command never writes app
timeline/session state, imports clips, creates shorts, renders exports,
publishes, uploads, deletes, overwrites recipe artifacts, or mutates source
media.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
RECIPE_POINTER = RELEASE_ROOT / "review-board/episode4-youtube-standard-recipe/latest-episode4-youtube-standard-recipe.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-youtube-standard-recipe-review"
LATEST_POINTER = OUT_ROOT / "latest-episode4-youtube-standard-recipe-review-ledger.json"
SCHEMA = "quipsly.episode4-youtube-standard-recipe-review-ledger.v1"
VALID_DECISIONS = {"keep", "refine", "reject", "hold", "needs-source", "needs-listen", "needs-visual-review"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-youtube-recipe-review")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = str(pointer.get("jsonPath") or pointer.get("ledgerPath") or "")
    if target:
        payload = load_json(Path(target))
        if payload:
            return {**pointer, **payload, "pointerPath": str(path)}
    return {**pointer, "pointerPath": str(path)}


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def as_text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    text = str(value).strip()
    return text if text else fallback


def fmt_time(seconds: Any) -> str:
    value = max(0.0, as_float(seconds))
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def operation_id(operation: dict[str, Any]) -> str:
    return str(operation.get("operationId") or operation.get("id") or operation.get("cueId") or "").strip()


def operation_kind(operation: dict[str, Any]) -> str:
    return str(operation.get("operationKind") or "unknown")


def truth(ledger_mutated: bool = False) -> dict[str, Any]:
    return {
        "sidecarReviewMetadataOnly": True,
        "ledgerMutated": ledger_mutated,
        "recipeArtifactOverwritten": False,
        "timelineDecisionsWritten": False,
        "branchMetadataWritten": False,
        "clipsImported": False,
        "shortsCreated": False,
        "sourceFilesMutated": False,
        "exportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def decision_next_action(decision: str, operation: dict[str, Any]) -> str:
    kind = operation_kind(operation)
    if decision == "keep":
        return "Queue this operation for branch-metadata promotion after one visual/audio proof pass."
    if decision == "refine":
        return "Create a narrowed or retimed operation before promotion; preserve this event as why the first suggestion was not enough."
    if decision == "reject":
        return "Keep rejection as training evidence; do not promote this operation into the branch."
    if decision == "needs-source":
        return "Recover or confirm source media before this can become real clip-weave metadata."
    if decision == "needs-listen":
        return "Open the sequence range and listen for cadence, breath, and human flow before deciding."
    if decision == "needs-visual-review":
        return "Open the range in Studio and review framing/reactions before deciding."
    if kind == "source-placeholder-slot":
        return "Keep the placeholder visible, but do not write real clip insert metadata until source intake confirms media."
    return "Hold this operation for later review."


def default_review(operation: dict[str, Any]) -> dict[str, Any]:
    kind = operation_kind(operation)
    if kind == "source-placeholder-slot":
        decision = "needs-source"
        status = "review-needed"
    elif kind in {"cadence-tighten-review", "reaction-cover-review"}:
        decision = "needs-listen"
        status = "review-needed"
    else:
        decision = "pending"
        status = "unreviewed"
    return {
        "operationId": operation_id(operation),
        "operationKind": kind,
        "sequenceLabel": operation.get("sequenceLabel") or "",
        "status": status,
        "decision": decision,
        "reviewer": "",
        "lastReviewedAt": "",
        "notes": "",
        "audioNote": "",
        "visualNote": "",
        "cadenceNote": "",
        "sourceNote": "",
        "nextAction": decision_next_action(decision, operation),
        "history": [],
    }


def operation_start(operation: dict[str, Any]) -> float:
    return as_float(operation.get("sequenceStartSeconds") or operation.get("startSeconds"))


def operation_end(operation: dict[str, Any]) -> float:
    explicit = as_float(operation.get("sequenceEndSeconds") or operation.get("endSeconds"))
    if explicit > 0:
        return explicit
    duration = as_float(operation.get("durationSeconds"))
    return operation_start(operation) + max(0.0, duration)


def operation_window(operation: dict[str, Any]) -> str:
    label = as_text(operation.get("sequenceLabel"))
    if label:
        return label
    start = operation_start(operation)
    end = operation_end(operation)
    return f"{fmt_time(start)} -> {fmt_time(end)}" if end > start else fmt_time(start)


def review_priority(operation: dict[str, Any], review: dict[str, Any]) -> tuple[int, float, str]:
    decision = as_text(review.get("decision"), "pending")
    status = as_text(review.get("status"), "unreviewed")
    kind = operation_kind(operation)
    if status == "reviewed":
        bucket = 99
    elif decision == "needs-listen":
        bucket = 0
    elif decision == "needs-visual-review":
        bucket = 1
    elif kind in {"cadence-tighten-review", "reaction-cover-review"}:
        bucket = 2
    elif decision in {"pending", ""}:
        bucket = 3
    elif decision == "needs-source":
        bucket = 8
    else:
        bucket = 6
    return (bucket, operation_start(operation), operation_id(operation))


def cut_guidance(operation: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    kind = operation_kind(operation)
    reason = as_text(operation.get("reason"), "No generated reason was recorded.")
    tradeoff = as_text(operation.get("tradeoff"), "Tradeoff needs human/agent review.")
    if kind == "cadence-tighten-review":
        return {
            "reviewMode": "listen-first",
            "editIntent": "Tighten only what is truly slowing the thought, while preserving breath, uncertainty, laughter, and human timing.",
            "why": reason,
            "tradeoff": tradeoff,
            "listenFor": [
                "Does the pause carry thought, warmth, awkwardness, or a meaningful turn?",
                "Does removing it make the speaker sound artificially certain or rushed?",
                "Would an L-cut preserve the emotional tail better than a hard trim?",
            ],
            "visualCheck": [
                "If the trim creates a same-face jump, use a real reaction, alternate source, or intentional hard cut.",
                "Do not hide a cadence problem by only changing picture.",
            ],
            "suggestedDecisions": ["keep", "refine", "needs-visual-review", "reject"],
            "doNotAutomate": "Do not flatten timing just because silence is measurable.",
        }
    if kind == "reaction-cover-review":
        return {
            "reviewMode": "watch-and-listen",
            "editIntent": "Use reaction coverage only when it makes the exchange more human or hides a distracting jump without lying about the moment.",
            "why": reason,
            "tradeoff": tradeoff,
            "listenFor": [
                "Does the audio still feel continuous through the cover?",
                "Does the reaction belong emotionally to the line it is covering?",
                "Would a J-cut or L-cut make the reaction land more naturally?",
            ],
            "visualCheck": [
                "Reaction should be readable, not wallpaper.",
                "Return to the speaker when the idea needs their face again.",
            ],
            "suggestedDecisions": ["keep", "refine", "needs-listen", "reject"],
            "doNotAutomate": "Do not use a reaction cover if it feels emotionally false.",
        }
    if kind == "source-placeholder-slot":
        return {
            "reviewMode": "source-recovery",
            "editIntent": "Hold the intended source-clip moment open until real watched/source media is recovered.",
            "why": reason,
            "tradeoff": tradeoff,
            "listenFor": [
                "What source clip are the hosts introducing?",
                "Does the source clip answer a setup or only decorate the segment?",
            ],
            "visualCheck": [
                "Do not promote a placeholder into a real insert until source intake confirms media.",
            ],
            "suggestedDecisions": ["needs-source", "hold", "reject"],
            "doNotAutomate": "Do not invent source media.",
        }
    if kind in {"show-range-review", "skip-range-review"}:
        return {
            "reviewMode": "watch-and-listen",
            "editIntent": "Decide whether this range belongs in the YouTube-standard branch while protecting meaning and conversational trust.",
            "why": reason,
            "tradeoff": tradeoff,
            "listenFor": [
                "Does this range advance the episode promise?",
                "Does cutting it remove needed setup, humility, humor, or relationship context?",
            ],
            "visualCheck": [
                "If kept, does the monitor wall suggest a better source choice or framing?",
                "If skipped, is the return point understandable?",
            ],
            "suggestedDecisions": ["keep", "refine", "reject", "needs-listen"],
            "doNotAutomate": "Do not remove context just to hit a target duration.",
        }
    return {
        "reviewMode": "inspect",
        "editIntent": "Review this operation before branch metadata promotion.",
        "why": reason,
        "tradeoff": tradeoff,
        "listenFor": ["Does this operation improve meaning, rhythm, or clarity?"],
        "visualCheck": ["Does this operation create visual confusion or a false-feeling cut?"],
        "suggestedDecisions": ["keep", "refine", "reject", "hold"],
        "doNotAutomate": "Do not promote uncertain edits without a review note.",
    }


def selected_next_operation(ledger: dict[str, Any], requested_operation_id: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    operations = dict_list(ledger.get("operations"))
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    if requested_operation_id:
        operation = next((item for item in operations if operation_id(item) == requested_operation_id), {})
        review = reviews.get(requested_operation_id) if isinstance(reviews.get(requested_operation_id), dict) else default_review(operation)
        return operation, review
    candidates: list[tuple[tuple[int, float, str], dict[str, Any], dict[str, Any]]] = []
    for operation in operations:
        oid = operation_id(operation)
        if not oid:
            continue
        review = reviews.get(oid) if isinstance(reviews.get(oid), dict) else default_review(operation)
        candidates.append((review_priority(operation, review), operation, review))
    candidates.sort(key=lambda item: item[0])
    if not candidates:
        return {}, {}
    _priority, operation, review = candidates[0]
    return operation, review


def next_review_commands(operation: dict[str, Any], guidance: dict[str, Any]) -> list[dict[str, str]]:
    oid = operation_id(operation)
    mode = as_text(guidance.get("reviewMode"))
    note_flags = (
        "--audio-note \"audio flow note\" "
        "--visual-note \"visual/reaction note\" "
        "--cadence-note \"cadence note\" "
        "--source-note \"source/media note\""
    )
    if mode == "listen-first":
        note_flags = (
            "--audio-note \"what the ear proves\" "
            "--cadence-note \"pause/breath/cadence note\" "
            "--visual-note \"jump/reaction/framing note\""
        )
    elif mode == "watch-and-listen":
        note_flags = (
            "--audio-note \"audio continuity note\" "
            "--visual-note \"reaction/framing note\" "
            "--cadence-note \"rhythm note\""
        )
    elif mode == "source-recovery":
        note_flags = (
            "--source-note \"needed source clip or confirmed media note\" "
            "--audio-note \"setup/reaction audio note\""
        )
    commands = []
    for decision in guidance.get("suggestedDecisions", [])[:4]:
        commands.append(
            {
                "decision": as_text(decision),
                "dryRun": (
                    f"./script/agentctl.sh episode4-youtube-recipe-review-decision-dry-run {oid} {as_text(decision)} "
                    f"Codex \"review note\" {note_flags}"
                ),
                "record": (
                    f"./script/agentctl.sh episode4-youtube-recipe-review-decision {oid} {as_text(decision)} "
                    f"Codex \"review note\" {note_flags}"
                ),
            }
        )
    return commands


def note_prompts_for_guidance(guidance: dict[str, Any]) -> dict[str, str]:
    mode = as_text(guidance.get("reviewMode"))
    if mode == "listen-first":
        return {
            "audioNote": "What does the ear prove about sentence meaning, breath, and continuity?",
            "cadenceNote": "Which pause should stay human, and which pause can tighten without making the speaker robotic?",
            "visualNote": "If audio tightening creates a jump, what honest visual cover or reframe should be considered?",
            "sourceNote": "Only note source media if the timing needs a clip or b-roll answer.",
        }
    if mode == "watch-and-listen":
        return {
            "audioNote": "Does the audio still feel continuous through the proposed visual move?",
            "visualNote": "Does the reaction/framing genuinely support the moment, or is it just wallpaper?",
            "cadenceNote": "Does the cut preserve rhythm, laughter, uncertainty, and the human beat?",
            "sourceNote": "Does any source/b-roll media clarify the thought better than a face cut?",
        }
    if mode == "source-recovery":
        return {
            "sourceNote": "What source clip is needed or confirmed, and where did it come from?",
            "audioNote": "What spoken setup/reaction should lead into or out of the source clip?",
            "visualNote": "What should the viewer see during the source moment?",
            "cadenceNote": "Should the source clip enter with a J-cut, exit with an L-cut, or play clean?",
        }
    return {
        "audioNote": "What does the audio prove about whether this edit is safe?",
        "visualNote": "What does the monitor wall prove about the picture decision?",
        "cadenceNote": "What rhythm or pause should be preserved or tightened?",
        "sourceNote": "What source context, if any, is required before promotion?",
    }


def next_review_payload(ledger: dict[str, Any], requested_operation_id: str = "") -> dict[str, Any]:
    operation, review = selected_next_operation(ledger, requested_operation_id)
    if not operation:
        return {
            "schema": SCHEMA + ".next-review",
            "generatedAt": iso_now(),
            "status": "episode4-youtube-standard-next-review-empty",
            "ledgerPath": ledger.get("ledgerPath"),
            "truth": truth(),
        }
    guidance = cut_guidance(operation, review)
    guidance["notePrompts"] = note_prompts_for_guidance(guidance)
    return {
        "schema": SCHEMA + ".next-review",
        "generatedAt": iso_now(),
        "status": "episode4-youtube-standard-next-review-ready",
        "ledgerPath": ledger.get("ledgerPath"),
        "operationId": operation_id(operation),
        "operationKind": operation_kind(operation),
        "window": operation_window(operation),
        "sequenceStartSeconds": operation_start(operation),
        "sequenceEndSeconds": operation_end(operation),
        "operation": operation,
        "review": review,
        "guidance": guidance,
        "commands": next_review_commands(operation, guidance),
        "truth": truth(),
    }


def counts_for(operations: list[dict[str, Any]], reviews: dict[str, Any], events: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts: dict[str, int] = {}
    decision_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    for operation in operations:
        kind = operation_kind(operation)
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
    for review in reviews.values():
        if not isinstance(review, dict):
            continue
        status = str(review.get("status") or "unknown")
        decision = str(review.get("decision") or "unknown")
        status_counts[status] = status_counts.get(status, 0) + 1
        decision_counts[decision] = decision_counts.get(decision, 0) + 1
    return {
        "operations": len(operations),
        "reviews": len(reviews),
        "events": len(events),
        "reviewed": status_counts.get("reviewed", 0),
        "unreviewed": status_counts.get("unreviewed", 0),
        "reviewNeeded": status_counts.get("review-needed", 0),
        "keep": decision_counts.get("keep", 0),
        "refine": decision_counts.get("refine", 0),
        "reject": decision_counts.get("reject", 0),
        "needsListen": decision_counts.get("needs-listen", 0),
        "needsSource": decision_counts.get("needs-source", 0),
        "needsVisualReview": decision_counts.get("needs-visual-review", 0),
        "statusCounts": status_counts,
        "decisionCounts": decision_counts,
        "kindCounts": kind_counts,
    }


def learning_dataset_record(operation: dict[str, Any], review: dict[str, Any], ledger: dict[str, Any]) -> dict[str, Any]:
    guidance = cut_guidance(operation, review)
    guidance["notePrompts"] = note_prompts_for_guidance(guidance)
    history = review.get("history") if isinstance(review.get("history"), list) else []
    branch = ledger.get("branch") if isinstance(ledger.get("branch"), dict) else {}
    duration_plan = ledger.get("durationPlan") if isinstance(ledger.get("durationPlan"), dict) else {}
    has_rich_notes = any(as_text(review.get(key)) for key in ["audioNote", "visualNote", "cadenceNote", "sourceNote"])
    return {
        "schema": "quipsly.edit-learning.recipe-review-record.v1",
        "episode": as_text(ledger.get("episode"), "episode-4"),
        "branchId": as_text(branch.get("branchId")),
        "targetLabel": as_text(duration_plan.get("targetLabel")),
        "operationId": operation_id(operation),
        "operationKind": operation_kind(operation),
        "window": operation_window(operation),
        "sequenceStartSeconds": operation_start(operation),
        "sequenceEndSeconds": operation_end(operation),
        "decision": as_text(review.get("decision"), "pending"),
        "status": as_text(review.get("status"), "unreviewed"),
        "reviewer": as_text(review.get("reviewer")),
        "lastReviewedAt": as_text(review.get("lastReviewedAt")),
        "editIntent": as_text(guidance.get("editIntent")),
        "reviewMode": as_text(guidance.get("reviewMode")),
        "reason": as_text(operation.get("reason")),
        "tradeoff": as_text(guidance.get("tradeoff")),
        "doNotAutomate": as_text(guidance.get("doNotAutomate")),
        "notePrompts": guidance.get("notePrompts") if isinstance(guidance.get("notePrompts"), dict) else {},
        "notes": {
            "general": as_text(review.get("notes")),
            "audio": as_text(review.get("audioNote")),
            "visual": as_text(review.get("visualNote")),
            "cadence": as_text(review.get("cadenceNote")),
            "source": as_text(review.get("sourceNote")),
        },
        "historyCount": len(history),
        "hasHumanOrAgentNotes": any(
            as_text(review.get(key))
            for key in ["notes", "audioNote", "visualNote", "cadenceNote", "sourceNote"]
        ),
        "promotionReadiness": "reviewed-with-rich-notes"
        if as_text(review.get("status")) == "reviewed" and has_rich_notes
        else "reviewed-without-rich-notes"
        if as_text(review.get("status")) == "reviewed"
        else "not-reviewed",
        "safetyTruth": truth(),
    }


def build_learning_dataset(ledger: dict[str, Any]) -> list[dict[str, Any]]:
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    records = []
    for operation in dict_list(ledger.get("operations")):
        oid = operation_id(operation)
        if not oid:
            continue
        review = reviews.get(oid) if isinstance(reviews.get(oid), dict) else default_review(operation)
        records.append(learning_dataset_record(operation, review, ledger))
    return records


def learning_dataset_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    readiness_counts: dict[str, int] = {}
    kind_counts: dict[str, int] = {}
    gaps: list[dict[str, Any]] = []
    for record in records:
        readiness = as_text(record.get("promotionReadiness"), "unknown")
        readiness_counts[readiness] = readiness_counts.get(readiness, 0) + 1
        kind = as_text(record.get("operationKind"), "unknown")
        kind_counts[kind] = kind_counts.get(kind, 0) + 1
        if readiness != "reviewed-with-rich-notes" and len(gaps) < 8:
            gaps.append(
                {
                    "operationId": record.get("operationId"),
                    "operationKind": kind,
                    "window": record.get("window"),
                    "decision": record.get("decision"),
                    "status": record.get("status"),
                    "gap": "needs review notes" if record.get("status") == "reviewed" else "needs review",
                    "nextBestPrompt": (
                        "Add audio/visual/cadence/source notes before using this as strong edit-learning evidence."
                        if record.get("status") == "reviewed"
                        else "Review this operation and capture at least one specific note lane."
                    ),
                }
            )
    return {
        "recordCount": len(records),
        "readinessCounts": readiness_counts,
        "kindCounts": kind_counts,
        "richNoteCoveragePercent": round(
            (readiness_counts.get("reviewed-with-rich-notes", 0) / len(records)) * 100,
            2,
        )
        if records
        else 0,
        "reviewCoveragePercent": round(
            (
                (readiness_counts.get("reviewed-with-rich-notes", 0) + readiness_counts.get("reviewed-without-rich-notes", 0))
                / len(records)
            )
            * 100,
            2,
        )
        if records
        else 0,
        "nextLearningGaps": gaps,
    }


def create_ledger(recipe_pointer: Path) -> tuple[Path, dict[str, Any]]:
    recipe = load_pointer(recipe_pointer)
    session_dir = OUT_ROOT / stamp()
    operations = dict_list(recipe.get("metadataOperations"))
    reviews = {operation_id(operation): default_review(operation) for operation in operations if operation_id(operation)}
    ledger = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "updatedAt": iso_now(),
        "status": "episode4-youtube-standard-recipe-review-ledger-ready" if operations else "episode4-youtube-standard-recipe-review-ledger-empty",
        "episode": "episode-4",
        "sessionDir": str(session_dir),
        "recipePointer": str(recipe_pointer),
        "recipeJsonPath": recipe.get("jsonPath") or "",
        "branch": recipe.get("branch") if isinstance(recipe.get("branch"), dict) else {},
        "durationPlan": recipe.get("durationPlan") if isinstance(recipe.get("durationPlan"), dict) else {},
        "operations": operations,
        "reviews": reviews,
        "events": [],
        "counts": counts_for(operations, reviews, []),
        "nextSafestAction": "Review recipe operations in Studio; record keep/refine/reject/needs-listen before branch metadata promotion.",
        "truth": truth(),
    }
    write_surfaces(session_dir, ledger)
    return session_dir, ledger


def current_ledger_dir() -> Path | None:
    pointer = load_json(LATEST_POINTER)
    ledger_path = str(pointer.get("ledgerPath") or "")
    if ledger_path and Path(ledger_path).exists():
        return Path(ledger_path).parent
    return None


def load_or_create_ledger(recipe_pointer: Path, session: str = "latest") -> tuple[Path, dict[str, Any]]:
    if session and session not in {"latest", ""}:
        session_dir = Path(session).expanduser()
        ledger_path = session_dir / "episode4-youtube-standard-recipe-review-ledger.json"
        if ledger_path.exists():
            return session_dir, load_json(ledger_path)
    session_dir = current_ledger_dir()
    if session_dir:
        ledger = load_json(session_dir / "episode4-youtube-standard-recipe-review-ledger.json")
        if ledger:
            return session_dir, ledger
    return create_ledger(recipe_pointer)


def event_to_review_fields(event: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": "reviewed",
        "decision": event.get("decision"),
        "reviewer": event.get("reviewer"),
        "lastReviewedAt": event.get("createdAt"),
        "notes": event.get("notes"),
        "audioNote": event.get("audioNote"),
        "visualNote": event.get("visualNote"),
        "cadenceNote": event.get("cadenceNote"),
        "sourceNote": event.get("sourceNote"),
        "nextAction": event.get("nextAction"),
    }


def record_decision(args: argparse.Namespace) -> dict[str, Any]:
    if args.decision not in VALID_DECISIONS:
        raise SystemExit(f"Decision must be one of: {', '.join(sorted(VALID_DECISIONS))}")
    session_dir, ledger = load_or_create_ledger(Path(args.recipe_pointer), args.session)
    operations = dict_list(ledger.get("operations"))
    operation = next((item for item in operations if operation_id(item) == args.operation_id), None)
    if not operation:
        raise SystemExit(f"Recipe operation not found in ledger: {args.operation_id}")
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    review = reviews.get(args.operation_id) if isinstance(reviews.get(args.operation_id), dict) else default_review(operation)
    event = {
        "eventId": f"episode4-youtube-recipe-review-event-{len(ledger.get('events') or []) + 1:04d}",
        "createdAt": iso_now(),
        "operationId": args.operation_id,
        "operationKind": operation_kind(operation),
        "sequenceLabel": operation.get("sequenceLabel") or "",
        "decision": args.decision,
        "reviewer": args.reviewer,
        "notes": args.notes,
        "audioNote": args.audio_note,
        "visualNote": args.visual_note,
        "cadenceNote": args.cadence_note,
        "sourceNote": args.source_note,
        "nextAction": args.next_action or decision_next_action(args.decision, operation),
        "dryRun": bool(args.dry_run),
        "truth": truth(ledger_mutated=False),
    }
    if args.dry_run:
        return {
            "schema": "quipsly.episode4-youtube-standard-recipe-review-decision-dry-run.v1",
            "generatedAt": iso_now(),
            "status": "dry-run-ready",
            "sessionDir": str(session_dir),
            "operation": operation,
            "wouldAppendEvent": event,
            "wouldUpdateReview": {**review, **event_to_review_fields(event)},
            "truth": truth(ledger_mutated=False),
        }
    history = review.get("history") if isinstance(review.get("history"), list) else []
    history.append({**event, "truth": truth(ledger_mutated=True)})
    review.update(event_to_review_fields(event))
    review["history"] = history
    reviews[args.operation_id] = review
    events = ledger.get("events") if isinstance(ledger.get("events"), list) else []
    events.append({**event, "truth": truth(ledger_mutated=True)})
    ledger["reviews"] = reviews
    ledger["events"] = events
    ledger["status"] = "episode4-youtube-standard-recipe-review-ledger-in-progress"
    write_surfaces(session_dir, ledger)
    return {
        "schema": "quipsly.episode4-youtube-standard-recipe-review-decision.v1",
        "generatedAt": iso_now(),
        "status": "decision-recorded",
        "sessionDir": str(session_dir),
        "ledgerPath": ledger.get("ledgerPath"),
        "operationId": args.operation_id,
        "decision": args.decision,
        "truth": truth(ledger_mutated=True),
    }


def render_markdown(ledger: dict[str, Any]) -> str:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    branch = ledger.get("branch") if isinstance(ledger.get("branch"), dict) else {}
    duration_plan = ledger.get("durationPlan") if isinstance(ledger.get("durationPlan"), dict) else {}
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    next_review = ledger.get("nextReview") if isinstance(ledger.get("nextReview"), dict) else {}
    next_guidance = next_review.get("guidance") if isinstance(next_review.get("guidance"), dict) else {}
    learning_dataset = ledger.get("learningDataset") if isinstance(ledger.get("learningDataset"), dict) else {}
    lines = [
        "# Episode 4 YouTube-standard recipe review ledger",
        "",
        f"Status: `{ledger.get('status')}`",
        f"Branch: `{branch.get('branchId')}`",
        f"Target: `{duration_plan.get('targetLabel')}`",
        f"Estimated keep: `{duration_plan.get('estimatedKeepLabel')}`",
        f"Updated: `{ledger.get('updatedAt')}`",
        "",
        "## Counts",
        "",
    ]
    for key in ["operations", "reviewed", "unreviewed", "reviewNeeded", "events", "keep", "refine", "reject", "needsListen", "needsSource"]:
        lines.append(f"- {key}: `{counts.get(key, 0)}`")
    if learning_dataset:
        summary = learning_dataset.get("summary") if isinstance(learning_dataset.get("summary"), dict) else {}
        lines += [
            "",
            "## Edit-learning dataset",
            "",
            f"- Path: `{learning_dataset.get('path')}`",
            f"- Records: `{learning_dataset.get('recordCount', 0)}`",
            f"- Reviewed with rich notes: `{learning_dataset.get('reviewedWithRichNotes', 0)}`",
            f"- Unreviewed: `{learning_dataset.get('unreviewed', 0)}`",
            f"- Review coverage: `{summary.get('reviewCoveragePercent', 0)}%`",
            f"- Rich-note coverage: `{summary.get('richNoteCoveragePercent', 0)}%`",
            "- Truth: labeled review evidence only; this does not train a model or write edit metadata by itself.",
        ]
        gaps = summary.get("nextLearningGaps") if isinstance(summary.get("nextLearningGaps"), list) else []
        if gaps:
            lines += ["", "### Next learning gaps", ""]
            for gap in gaps[:5]:
                lines.append(
                    f"- `{gap.get('operationId')}` · `{gap.get('operationKind')}` · `{gap.get('window')}`: {gap.get('nextBestPrompt')}"
                )
    if next_review:
        lines += [
            "",
            "## Next review focus",
            "",
            f"- Operation: `{next_review.get('operationId')}`",
            f"- Kind: `{next_review.get('operationKind')}`",
            f"- Window: `{next_review.get('window')}`",
            f"- Review mode: `{next_guidance.get('reviewMode')}`",
            f"- Intent: {next_guidance.get('editIntent', '')}",
            f"- Why: {next_guidance.get('why', '')}",
            f"- Tradeoff: {next_guidance.get('tradeoff', '')}",
            f"- Do not automate: {next_guidance.get('doNotAutomate', '')}",
        ]
        note_prompts = next_guidance.get("notePrompts") if isinstance(next_guidance.get("notePrompts"), dict) else {}
        for key in ["audioNote", "visualNote", "cadenceNote", "sourceNote"]:
            if note_prompts.get(key):
                lines.append(f"- `{key}` prompt: {note_prompts.get(key)}")
        lines.append("")
    lines += ["", "## Operations", ""]
    for operation in dict_list(ledger.get("operations")):
        oid = operation_id(operation)
        review = reviews.get(oid) if isinstance(reviews.get(oid), dict) else {}
        lines += [
            f"### {oid}",
            "",
            f"- Kind: `{operation_kind(operation)}`",
            f"- Range: `{operation.get('sequenceLabel')}`",
            f"- Decision: `{review.get('decision', 'pending')}`",
            f"- Status: `{review.get('status', 'unreviewed')}`",
            f"- Reason: {operation.get('reason', '')}",
            f"- Next: {review.get('nextAction', '')}",
        ]
        for key, label in [
            ("audioNote", "Audio note"),
            ("visualNote", "Visual note"),
            ("cadenceNote", "Cadence note"),
            ("sourceNote", "Source note"),
        ]:
            if review.get(key):
                lines.append(f"- {label}: {review.get(key)}")
        history = review.get("history") if isinstance(review.get("history"), list) else []
        if history:
            lines.append(f"- History events: `{len(history)}`")
        lines.append("")
    lines += [
        "## Safety",
        "",
        "- Sidecar review metadata only.",
        "- No timeline/session state is written.",
        "- No source media is mutated.",
        "- No export or publishing is performed.",
        "",
    ]
    return "\n".join(lines)


def render_next_review_markdown(payload: dict[str, Any]) -> str:
    if payload.get("status") != "episode4-youtube-standard-next-review-ready":
        return "# Episode 4 next YouTube-standard recipe review\n\nNo reviewable operation was found."
    guidance = payload.get("guidance") if isinstance(payload.get("guidance"), dict) else {}
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    commands = dict_list(payload.get("commands"))
    lines = [
        "# Episode 4 next YouTube-standard recipe review",
        "",
        f"- Operation: `{payload.get('operationId')}`",
        f"- Kind: `{payload.get('operationKind')}`",
        f"- Window: `{payload.get('window')}`",
        f"- Review mode: `{guidance.get('reviewMode')}`",
        f"- Current decision: `{review.get('decision', 'pending')}`",
        f"- Current status: `{review.get('status', 'unreviewed')}`",
        "",
        "## Edit intent",
        "",
        str(guidance.get("editIntent") or ""),
        "",
        "## Why this was suggested",
        "",
        str(guidance.get("why") or ""),
        "",
        "## Tradeoff",
        "",
        str(guidance.get("tradeoff") or ""),
        "",
        "## Listen for",
        "",
    ]
    for item in guidance.get("listenFor", []) if isinstance(guidance.get("listenFor"), list) else []:
        lines.append(f"- {item}")
    lines.extend(["", "## Visual check", ""])
    for item in guidance.get("visualCheck", []) if isinstance(guidance.get("visualCheck"), list) else []:
        lines.append(f"- {item}")
    lines.extend(
        [
            "",
            "## Do not automate",
            "",
            str(guidance.get("doNotAutomate") or ""),
            "",
            "## Review note prompts",
            "",
        ]
    )
    note_prompts = guidance.get("notePrompts") if isinstance(guidance.get("notePrompts"), dict) else {}
    for key in ["audioNote", "visualNote", "cadenceNote", "sourceNote"]:
        if note_prompts.get(key):
            lines.append(f"- `{key}`: {note_prompts.get(key)}")
    lines.extend(
        [
            "",
            "## Decision commands",
            "",
        ]
    )
    for command in commands:
        lines.extend(
            [
                f"### {command.get('decision')}",
                "",
                f"- Dry run: `{command.get('dryRun')}`",
                f"- Record after review: `{command.get('record')}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Safety boundary",
            "",
            "This is a review handoff only. It does not write timeline metadata, branch metadata, source media, exports, or publishing state.",
        ]
    )
    return "\n".join(lines)


def render_html(ledger: dict[str, Any]) -> str:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    branch = ledger.get("branch") if isinstance(ledger.get("branch"), dict) else {}
    duration_plan = ledger.get("durationPlan") if isinstance(ledger.get("durationPlan"), dict) else {}
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    next_review = ledger.get("nextReview") if isinstance(ledger.get("nextReview"), dict) else {}
    next_guidance = next_review.get("guidance") if isinstance(next_review.get("guidance"), dict) else {}
    learning_dataset = ledger.get("learningDataset") if isinstance(ledger.get("learningDataset"), dict) else {}
    learning_summary = learning_dataset.get("summary") if isinstance(learning_dataset.get("summary"), dict) else {}
    learning_gaps = learning_summary.get("nextLearningGaps") if isinstance(learning_summary.get("nextLearningGaps"), list) else []
    gap_rows = "".join(
        f"<li><strong>{esc(gap.get('operationId'))}</strong> · {esc(gap.get('operationKind'))} · {esc(gap.get('window'))}<br><span>{esc(gap.get('nextBestPrompt'))}</span></li>"
        for gap in learning_gaps[:5]
    )
    next_commands = dict_list(next_review.get("commands"))
    listen_items = "".join(f"<li>{esc(item)}</li>" for item in next_guidance.get("listenFor", [])[:4]) if isinstance(next_guidance.get("listenFor"), list) else ""
    visual_items = "".join(f"<li>{esc(item)}</li>" for item in next_guidance.get("visualCheck", [])[:4]) if isinstance(next_guidance.get("visualCheck"), list) else ""
    note_prompts = next_guidance.get("notePrompts") if isinstance(next_guidance.get("notePrompts"), dict) else {}
    note_prompt_rows = "".join(
        f"<div class='note-prompt'><strong>{esc(key)}</strong><span>{esc(note_prompts.get(key))}</span></div>"
        for key in ["audioNote", "visualNote", "cadenceNote", "sourceNote"]
        if note_prompts.get(key)
    )
    command_rows = "".join(
        f"<div class='command-row'><strong>{esc(command.get('decision'))}</strong><code>{esc(command.get('dryRun'))}</code></div>"
        for command in next_commands[:4]
    )
    next_review_html = ""
    if next_review:
        next_review_html = f"""
    <section class="next-review">
      <p class="meta">Next review focus</p>
      <h2>{esc(next_review.get('operationId'))}</h2>
      <p class="decision">{esc(next_review.get('operationKind'))} · {esc(next_review.get('window'))} · {esc(next_guidance.get('reviewMode'))}</p>
      <p>{esc(next_guidance.get('editIntent'))}</p>
      <div class="review-columns">
        <div><h3>Listen for</h3><ul>{listen_items}</ul></div>
        <div><h3>Visual check</h3><ul>{visual_items}</ul></div>
      </div>
      <p><strong>Why:</strong> {esc(next_guidance.get('why'))}</p>
      <p><strong>Tradeoff:</strong> {esc(next_guidance.get('tradeoff'))}</p>
      <p class="warn"><strong>Do not automate:</strong> {esc(next_guidance.get('doNotAutomate'))}</p>
      <h3>Review note prompts</h3>
      <div class="note-prompts">{note_prompt_rows}</div>
      <div class="commands">{command_rows}</div>
    </section>
"""
    cards = []
    for operation in dict_list(ledger.get("operations")):
        oid = operation_id(operation)
        review = reviews.get(oid) if isinstance(reviews.get(oid), dict) else {}
        decision = str(review.get("decision") or "pending")
        tint = "moss" if decision == "keep" else "clay" if decision == "reject" else "honey" if decision in {"refine", "needs-listen", "needs-source", "needs-visual-review"} else "creek"
        note_rows = "".join(
            f"<p class='note'><strong>{esc(label)}:</strong> {esc(review.get(key))}</p>"
            for key, label in [
                ("audioNote", "Audio"),
                ("visualNote", "Visual"),
                ("cadenceNote", "Cadence"),
                ("sourceNote", "Source"),
            ]
            if review.get(key)
        )
        history = review.get("history") if isinstance(review.get("history"), list) else []
        history_row = f"<p class='meta'>History events: {esc(len(history))}</p>" if history else ""
        cards.append(
            f"<article class='card {tint}'><p class='meta'>{esc(operation_kind(operation))} · {esc(operation.get('sequenceLabel'))}</p>"
            f"<h3>{esc(oid)}</h3><p>{esc(operation.get('reason'))}</p>"
            f"<p class='decision'>Decision: {esc(decision)} · Status: {esc(review.get('status') or 'unreviewed')}</p>"
            f"{note_rows}{history_row}<p class='meta'>{esc(review.get('nextAction') or '')}</p></article>"
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 YouTube recipe review ledger</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #11160f;
      --panel: #1c251b;
      --ink: #f6efd9;
      --muted: #bfb392;
      --honey: #f2c94c;
      --moss: #5ec27d;
      --clay: #d66b55;
      --creek: #65b7d9;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at 18% 0%, #304026, var(--bg) 42%);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }}
    main {{ width: min(1180px, calc(100vw - 48px)); margin: 0 auto; padding: 34px 0 64px; }}
    header {{
      border: 1px solid rgba(242, 201, 76, 0.26);
      background: linear-gradient(135deg, rgba(28, 37, 27, 0.94), rgba(38, 31, 18, 0.88));
      border-radius: 28px;
      padding: 28px;
    }}
    h1 {{ margin: 0; font-size: clamp(2rem, 4vw, 4rem); letter-spacing: -0.05em; }}
    .metrics {{ display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 22px; }}
    .metric, .card {{
      border: 1px solid rgba(246, 239, 217, 0.12);
      background: rgba(17, 22, 15, 0.72);
      border-radius: 18px;
      padding: 15px;
    }}
    .learning-gaps {{
      margin-top: 10px;
      border: 1px solid rgba(246, 239, 217, 0.12);
      border-radius: 16px;
      padding: 10px 12px;
      background: rgba(17, 22, 15, 0.48);
    }}
    .learning-gaps summary {{ cursor: pointer; color: var(--honey); font-weight: 800; }}
    .learning-gaps li {{ margin: 9px 0; color: var(--muted); }}
    .learning-gaps span {{ color: var(--ink); }}
    .metric strong {{ display: block; color: var(--honey); font-size: 1.35rem; }}
    .meta {{ color: var(--muted); font-size: 0.86rem; }}
    .next-review {{
      margin-top: 18px;
      border: 1px solid rgba(242, 201, 76, 0.34);
      background: linear-gradient(135deg, rgba(242, 201, 76, 0.16), rgba(101, 183, 217, 0.10));
      border-radius: 24px;
      padding: 20px;
    }}
    .next-review h2 {{ margin: 0 0 8px; letter-spacing: -0.03em; }}
    .review-columns {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }}
    .commands {{ display: grid; gap: 8px; margin-top: 12px; }}
    .command-row {{ display: grid; grid-template-columns: 90px 1fr; gap: 10px; align-items: start; }}
    .command-row code {{ color: var(--creek); overflow-wrap: anywhere; }}
    .note-prompts {{ display: grid; gap: 8px; margin: 10px 0 14px; }}
    .note-prompt {{ display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 8px 10px; border-radius: 12px; background: rgba(246, 239, 217, 0.06); }}
    .note {{ margin: 7px 0; color: var(--muted); }}
    .note strong {{ color: var(--ink); }}
    .warn {{ color: var(--honey); }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }}
    .card h3 {{ margin: 0 0 8px; }}
    .decision {{ font-weight: 800; }}
    .moss {{ border-color: rgba(94, 194, 125, 0.34); }}
    .honey {{ border-color: rgba(242, 201, 76, 0.34); }}
    .clay {{ border-color: rgba(214, 107, 85, 0.34); }}
    .creek {{ border-color: rgba(101, 183, 217, 0.30); }}
    @media (max-width: 800px) {{ .metrics, .grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <header>
      <p class="meta">Quipsly Studio · sidecar review metadata only</p>
      <h1>Episode 4 recipe review ledger</h1>
      <p>Branch <code>{esc(branch.get('branchId'))}</code> · Target {esc(duration_plan.get('targetLabel'))} · Estimated keep {esc(duration_plan.get('estimatedKeepLabel'))}</p>
      <p class="meta">Edit-learning evidence: <code>{esc(learning_dataset.get('path', 'not generated'))}</code> · {esc(learning_dataset.get('recordCount', 0))} records · no model training claimed.</p>
      <p class="meta">Review coverage {esc(learning_summary.get('reviewCoveragePercent', 0))}% · Rich-note coverage {esc(learning_summary.get('richNoteCoveragePercent', 0))}%</p>
      <details class="learning-gaps"><summary>Next learning gaps</summary><ul>{gap_rows}</ul></details>
      <div class="metrics">
        <div class="metric"><strong>{esc(counts.get('operations', 0))}</strong><span class="meta">operations</span></div>
        <div class="metric"><strong>{esc(counts.get('reviewed', 0))}</strong><span class="meta">reviewed</span></div>
        <div class="metric"><strong>{esc(counts.get('unreviewed', 0))}</strong><span class="meta">unreviewed</span></div>
        <div class="metric"><strong>{esc(counts.get('reviewNeeded', 0))}</strong><span class="meta">needs review</span></div>
        <div class="metric"><strong>{esc(counts.get('events', 0))}</strong><span class="meta">events</span></div>
      </div>
    </header>
    {next_review_html}
    <section class="grid">
      {''.join(cards)}
    </section>
  </main>
</body>
</html>
"""


def write_surfaces(session_dir: Path, ledger: dict[str, Any]) -> None:
    operations = dict_list(ledger.get("operations"))
    reviews = ledger.get("reviews") if isinstance(ledger.get("reviews"), dict) else {}
    events = dict_list(ledger.get("events"))
    ledger["updatedAt"] = iso_now()
    ledger["counts"] = counts_for(operations, reviews, events)
    ledger["truth"] = truth()
    ledger_path = session_dir / "episode4-youtube-standard-recipe-review-ledger.json"
    markdown_path = session_dir / "episode4-youtube-standard-recipe-review-ledger.md"
    html_path = session_dir / "index.html"
    learning_dataset_path = session_dir / "episode4-youtube-standard-recipe-review-learning.jsonl"
    ledger.update(
        {
            "ledgerPath": str(ledger_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "learningDatasetPath": str(learning_dataset_path),
        }
    )
    ledger["nextReview"] = next_review_payload(ledger)
    learning_records = build_learning_dataset(ledger)
    learning_summary = learning_dataset_summary(learning_records)
    ledger["learningDataset"] = {
        "schema": "quipsly.edit-learning.recipe-review-dataset.v1",
        "path": str(learning_dataset_path),
        "recordCount": len(learning_records),
        "reviewedWithRichNotes": sum(1 for record in learning_records if record.get("promotionReadiness") == "reviewed-with-rich-notes"),
        "unreviewed": sum(1 for record in learning_records if record.get("promotionReadiness") == "not-reviewed"),
        "summary": learning_summary,
        "truth": truth(),
    }
    write_json(ledger_path, ledger)
    learning_dataset_path.write_text(
        "".join(json.dumps(record, sort_keys=True) + "\n" for record in learning_records),
        encoding="utf-8",
    )
    markdown_path.write_text(render_markdown(ledger), encoding="utf-8")
    html_path.write_text(render_html(ledger), encoding="utf-8")
    write_json(
        LATEST_POINTER,
        {
            "schema": SCHEMA + ".pointer",
            "generatedAt": iso_now(),
            "status": ledger.get("status"),
            "sessionDir": str(session_dir),
            "ledgerPath": str(ledger_path),
            "markdownPath": str(markdown_path),
            "htmlPath": str(html_path),
            "learningDatasetPath": str(learning_dataset_path),
            "learningDataset": ledger.get("learningDataset"),
            "branch": ledger.get("branch"),
            "durationPlan": ledger.get("durationPlan"),
            "counts": ledger.get("counts"),
            "nextSafestAction": ledger.get("nextSafestAction"),
            "truth": ledger.get("truth"),
        },
    )


def command_build(args: argparse.Namespace) -> dict[str, Any]:
    session_dir, ledger = load_or_create_ledger(Path(args.recipe_pointer), "latest")
    write_surfaces(session_dir, ledger)
    return ledger


def command_next(args: argparse.Namespace) -> dict[str, Any]:
    session_dir, ledger = load_or_create_ledger(Path(args.recipe_pointer), args.session)
    write_surfaces(session_dir, ledger)
    payload = next_review_payload(ledger, args.operation_id)
    payload["sessionDir"] = str(session_dir)
    payload["markdown"] = render_next_review_markdown(payload)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command")

    build_parser = subparsers.add_parser("build", help="Build a fresh recipe review ledger.")
    build_parser.add_argument("--recipe-pointer", default=str(RECIPE_POINTER))
    build_parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    build_parser.add_argument("--markdown", action="store_true", help="Print Markdown.")
    build_parser.set_defaults(func=command_build)

    next_parser = subparsers.add_parser("next", help="Show the next recipe operation to review.")
    next_parser.add_argument("--recipe-pointer", default=str(RECIPE_POINTER))
    next_parser.add_argument("--session", default="latest")
    next_parser.add_argument("--operation-id", default="")
    next_parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    next_parser.add_argument("--markdown", action="store_true", help="Print Markdown.")
    next_parser.set_defaults(func=command_next)

    record_parser = subparsers.add_parser("record", help="Record one recipe-operation review decision.")
    record_parser.add_argument("operation_id")
    record_parser.add_argument("decision")
    record_parser.add_argument("reviewer", nargs="?", default="Codex")
    record_parser.add_argument("notes", nargs="?", default="")
    record_parser.add_argument("--recipe-pointer", default=str(RECIPE_POINTER))
    record_parser.add_argument("--session", default="latest")
    record_parser.add_argument("--audio-note", default="")
    record_parser.add_argument("--visual-note", default="")
    record_parser.add_argument("--cadence-note", default="")
    record_parser.add_argument("--source-note", default="")
    record_parser.add_argument("--next-action", default="")
    record_parser.add_argument("--dry-run", action="store_true")
    record_parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    record_parser.add_argument("--markdown", action="store_true", help="Print Markdown when the command returns a ledger.")
    record_parser.set_defaults(func=record_decision)

    parser.add_argument("--json", action="store_true", help="Print JSON. This is the default.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown when the command returns a ledger.")
    args = parser.parse_args()
    if not hasattr(args, "func"):
        args = parser.parse_args(["build"])
    result = args.func(args)
    if args.markdown and isinstance(result, dict) and result.get("markdown"):
        print(result.get("markdown"))
    elif args.markdown and isinstance(result, dict) and result.get("schema") == SCHEMA:
        print(render_markdown(result))
    else:
        print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
