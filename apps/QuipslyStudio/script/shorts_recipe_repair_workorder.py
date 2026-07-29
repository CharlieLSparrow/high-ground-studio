#!/usr/bin/env python3
"""Create read-only recipe repair workorders from transcript alignment evidence.

This turns the transcript alignment audit into proof-watchable candidate repairs.
It does not apply changes, move timeline decisions, overwrite exports, mutate
session JSON, or touch source media.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from selected_short_story_repair_suggestions import clean_topic, dict_value, text_value, transcript_story_scaffold
from shorts_transcript_alignment_audit import DEFAULT_SESSION, DEFAULT_TRANSCRIPT, build_audit


def candidate_status(item: dict[str, Any]) -> str:
    diagnosis = text_value(item.get("diagnosis"))
    best = dict_value(item.get("bestTranscriptWindow"))
    improvement = float(item.get("scoreImprovement") or 0)
    if diagnosis == "current-range-supported":
        return "keep-current-range"
    if best.get("label") == "supported" and improvement >= 0.18:
        return "strong-repair-candidate"
    if best.get("label") in {"supported", "weak"} and improvement > 0:
        return "proof-watch-candidate"
    return "manual-review-needed"


def build_candidate_patch(item: dict[str, Any]) -> dict[str, Any]:
    title = text_value(item.get("title"), "Untitled short")
    best = dict_value(item.get("bestTranscriptWindow"))
    current_range = dict_value(item.get("currentRange"))
    duration = float(current_range.get("duration") or 0)
    best_start = best.get("start")
    best_end = best.get("end")
    excerpt = text_value(best.get("excerpt"))
    scaffold = transcript_story_scaffold(excerpt, clean_topic(title)) if excerpt else {}
    if isinstance(best_start, (int, float)) and duration > 0:
        candidate_end = float(best_start) + duration
    elif isinstance(best_end, (int, float)):
        candidate_end = float(best_end)
    else:
        candidate_end = None
    return {
        "shortId": text_value(item.get("id")),
        "title": title,
        "currentRange": current_range,
        "candidateRange": {
            "start": best_start,
            "end": candidate_end,
            "duration": duration or None,
            "source": "best-transcript-window-preserve-short-duration",
        },
        "candidateStory": {
            "label": text_value(scaffold.get("label"), "none"),
            "hookText": text_value(scaffold.get("hook")),
            "middleTurn": text_value(scaffold.get("turn")),
            "payoff": text_value(scaffold.get("payoff")),
            "captionDraft": text_value(scaffold.get("caption")),
            "primaryOverlayText": text_value(scaffold.get("overlay")),
        },
        "doNotApplyAutomatically": True,
        "truth": "Candidate patch only. Proof-watch against source monitors before applying any metadata change.",
    }


def build_workorder(session_path: Path, transcript_path: Path, limit: int | None = None) -> dict[str, Any]:
    audit = build_audit(session_path, transcript_path, limit)
    tasks: list[dict[str, Any]] = []
    for item in audit.get("items", []):
        item = dict_value(item)
        status = candidate_status(item)
        best = dict_value(item.get("bestTranscriptWindow"))
        current = dict_value(item.get("currentAlignment"))
        task: dict[str, Any] = {
            "rank": item.get("rank"),
            "shortId": text_value(item.get("id")),
            "title": text_value(item.get("title")),
            "status": status,
            "diagnosis": text_value(item.get("diagnosis")),
            "scoreImprovement": item.get("scoreImprovement"),
            "currentAlignment": {
                "label": current.get("label"),
                "score": current.get("score"),
                "overlapTokens": current.get("overlapTokens") or [],
            },
            "candidateAlignment": {
                "label": best.get("label"),
                "score": best.get("score"),
                "overlapTokens": best.get("overlapTokens") or [],
            },
            "candidatePatch": build_candidate_patch(item) if status in {"strong-repair-candidate", "proof-watch-candidate"} else {},
            "proofWatchChecklist": [
                "Open the candidate range against whole synced sources, not exported chopped clips.",
                "Confirm the transcript excerpt matches what is spoken in the source monitors.",
                "Confirm the hook, turn, and payoff are visible in the chosen range.",
                "Check cadence: do not tighten so much that the people sound robotic.",
                "Check 9:16 crop and face-safe overlay placement before any export.",
            ],
            "nextAction": "Proof-watch candidate patch before applying metadata." if status in {"strong-repair-candidate", "proof-watch-candidate"} else item.get("nextAction"),
        }
        tasks.append(task)

    counts: dict[str, int] = {}
    for task in tasks:
        counts[task["status"]] = counts.get(task["status"], 0) + 1

    return {
        "status": "shorts_recipe_repair_workorder",
        "model": "quipsly-shorts-recipe-repair-workorder",
        "version": "2026-07-04.shorts-recipe-repair-workorder.v1",
        "sessionPath": str(session_path),
        "transcriptPath": str(transcript_path),
        "sequenceTitle": audit.get("sequenceTitle"),
        "shortCount": len(tasks),
        "statusCounts": counts,
        "globalOffsetDiagnosis": dict_value(audit.get("offsetSummary")),
        "tasks": tasks,
        "truth": "Read-only repair workorder. It proposes candidate recipe metadata but does not mutate sessions, source media, exports, receipts, or review state.",
    }


def render_markdown(workorder: dict[str, Any]) -> str:
    offset = dict_value(workorder.get("globalOffsetDiagnosis"))
    lines = [
        "# Shorts recipe repair workorder",
        "",
        f"- Sequence: {workorder.get('sequenceTitle', '')}",
        f"- Shorts: {workorder.get('shortCount', 0)}",
        f"- Session: `{workorder.get('sessionPath', '')}`",
        f"- Transcript: `{workorder.get('transcriptPath', '')}`",
        f"- Global offset diagnosis: `{offset.get('diagnosis', 'unknown')}`",
        f"- Global offset likely: `{offset.get('globalOffsetLikely', False)}`",
        f"- Truth: {workorder.get('truth', '')}",
        "",
        "## Status counts",
    ]
    for label, count in sorted(dict_value(workorder.get("statusCounts")).items()):
        lines.append(f"- `{label}`: {count}")
    lines.extend(["", "## Repair tasks", ""])
    for task in workorder.get("tasks", []):
        task = dict_value(task)
        patch = dict_value(task.get("candidatePatch"))
        story = dict_value(patch.get("candidateStory"))
        candidate_range = dict_value(patch.get("candidateRange"))
        current_range = dict_value(patch.get("currentRange"))
        current = dict_value(task.get("currentAlignment"))
        candidate = dict_value(task.get("candidateAlignment"))
        lines.extend([
            f"### {task.get('rank')}. {task.get('title')}",
            "",
            f"- ID: `{task.get('shortId', '')}`",
            f"- Status: `{task.get('status', '')}`",
            f"- Diagnosis: `{task.get('diagnosis', '')}`",
            f"- Current alignment: `{current.get('label', '')}` score `{current.get('score', 0)}` overlap `{', '.join(current.get('overlapTokens') or [])}`",
            f"- Candidate alignment: `{candidate.get('label', '')}` score `{candidate.get('score', 0)}` overlap `{', '.join(candidate.get('overlapTokens') or [])}`",
            f"- Score improvement: `{task.get('scoreImprovement')}`",
            f"- Next: {task.get('nextAction', '')}",
        ])
        if patch:
            lines.extend([
                f"- Current range: `{current_range.get('start')}` -> `{current_range.get('end')}`",
                f"- Candidate range: `{candidate_range.get('start')}` -> `{candidate_range.get('end')}` ({candidate_range.get('duration')}s)",
                f"- Hook: {story.get('hookText', '')}",
                f"- Turn: {story.get('middleTurn', '')}",
                f"- Payoff: {story.get('payoff', '')}",
                f"- Caption: {story.get('captionDraft', '')}",
                f"- Overlay: {story.get('primaryOverlayText', '')}",
            ])
        lines.append("- Checklist: " + "; ".join(task.get("proofWatchChecklist") or []))
        lines.append("")
    return "\n".join(lines).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--session", type=Path, default=DEFAULT_SESSION)
    parser.add_argument("--transcript", type=Path, default=DEFAULT_TRANSCRIPT)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", type=Path, default=None)
    args = parser.parse_args()
    workorder = build_workorder(args.session, args.transcript, args.limit)
    output = json.dumps(workorder, indent=2, sort_keys=True) if args.json else render_markdown(workorder)
    if args.save:
        args.save.parent.mkdir(parents=True, exist_ok=True)
        args.save.write_text(output, encoding="utf-8")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
