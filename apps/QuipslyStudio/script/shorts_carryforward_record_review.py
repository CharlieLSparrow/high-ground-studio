#!/usr/bin/env python3
"""Record review decisions for carry-forward short candidates.

This appends review events to a JSONL ledger beside the workorder. It never
edits media, rewrites the source workorder, approves publishing, or makes an
older short count as a native current-version export. The ledger is the review
trail that lets humans and agents convert carry-forward candidates into
explicit accept/refine/reject/hold decisions.
"""
from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_WORKORDER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/"
    "shorts-carryforward-review/episode-01-v004-shorts-realignment-workorder.json"
)
OUTCOMES = {"accept", "refine", "reject", "hold"}
REVIEW_DIMENSIONS = [
    "hook",
    "pacing",
    "framing",
    "captions",
    "audio",
    "ending",
    "platform_fit",
    "risk",
    "tradeoff",
]


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return data


def ledger_path_for(workorder_path: Path) -> Path:
    name = workorder_path.name
    if name.endswith(".json"):
        name = name[:-5]
    return workorder_path.with_name(f"{name}-review-decisions.jsonl")


def summary_json_path_for(ledger_path: Path) -> Path:
    return ledger_path.with_name(ledger_path.name.replace(".jsonl", "-summary.json"))


def summary_md_path_for(ledger_path: Path) -> Path:
    return ledger_path.with_name(ledger_path.name.replace(".jsonl", "-summary.md"))


def load_events(ledger_path: Path) -> list[dict[str, Any]]:
    if not ledger_path.exists():
        return []
    events: list[dict[str, Any]] = []
    for line in ledger_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(event, dict):
            events.append(event)
    return events


def item_by_index(workorder: dict[str, Any], index: int) -> dict[str, Any]:
    for item in workorder.get("items", []):
        if isinstance(item, dict) and int(item.get("index") or -1) == index:
            return item
    raise ValueError(f"No workorder item with index {index}")


def latest_decisions(events: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    latest: dict[int, dict[str, Any]] = {}
    for event in events:
        try:
            index = int(event.get("index"))
        except (TypeError, ValueError):
            continue
        latest[index] = event
    return latest


def candidate_priority(item: dict[str, Any]) -> tuple[int, int]:
    """Lower tuple wins; all pending candidates remain visible."""
    facts = item.get("media_facts", {}) if isinstance(item.get("media_facts"), dict) else {}
    bucket = str(facts.get("duration_bucket") or "")
    if bucket == "standard-social-short":
        bucket_rank = 0
    elif bucket == "short-hook":
        bucket_rank = 1
    elif bucket == "extended-short":
        bucket_rank = 2
    elif bucket == "micro-proof":
        bucket_rank = 3
    else:
        bucket_rank = 4
    return (bucket_rank, int(item.get("index") or 9999))


def recommended_next_candidate(workorder: dict[str, Any], latest: dict[int, dict[str, Any]]) -> dict[str, Any] | None:
    pending: list[dict[str, Any]] = []
    for item in workorder.get("items", []):
        if not isinstance(item, dict):
            continue
        try:
            index = int(item.get("index"))
        except (TypeError, ValueError):
            continue
        if index not in latest:
            pending.append(item)
    if not pending:
        return None

    item = sorted(pending, key=candidate_priority)[0]
    facts = item.get("media_facts", {}) if isinstance(item.get("media_facts"), dict) else {}
    return {
        "index": item.get("index"),
        "title": item.get("title"),
        "filename": item.get("filename"),
        "sourcePath": item.get("source_path"),
        "durationSeconds": facts.get("duration_seconds"),
        "durationBucket": facts.get("duration_bucket"),
        "aspect": facts.get("aspect"),
        "reviewHint": facts.get("review_hint"),
        "suggestedCommand": (
            f"script/agentctl.sh shorts-carryforward-record-review --index {item.get('index')} "
            "--outcome refine --reviewer Codex --note \"reviewed against v004; needs final human wording\""
        ),
        "suggestedStructuredCommand": (
            f"script/agentctl.sh shorts-carryforward-record-review --index {item.get('index')} "
            "--outcome refine --reviewer Codex "
            "--note \"reviewed against v004; record the creative reason before promotion\" "
            "--hook-note \"\" --pacing-note \"\" --framing-note \"\" --caption-note \"\" "
            "--audio-note \"\" --ending-note \"\" --platform-fit-note \"\" "
            "--risk-note \"carry-forward timing may drift from the target version\" "
            "--tradeoff-note \"\" --confidence needs-human-review"
        ),
        "truth": "Suggested next review target only. This is not an editorial decision.",
    }


def build_event(workorder: dict[str, Any], index: int, args: argparse.Namespace) -> dict[str, Any]:
    item = item_by_index(workorder, index)
    outcome = args.outcome.strip().lower()
    if outcome not in OUTCOMES:
        raise ValueError(f"Outcome must be one of: {', '.join(sorted(OUTCOMES))}")
    now = datetime.now(timezone.utc).isoformat()
    return {
        "model": "quipsly-studio-shorts-carryforward-review-decision",
        "version": "2026-07-02.v1",
        "recordedAt": now,
        "episode": workorder.get("episode"),
        "sourceVersion": workorder.get("sourceVersion"),
        "targetVersion": workorder.get("targetVersion"),
        "index": index,
        "title": item.get("title", ""),
        "filename": item.get("filename", ""),
        "sourcePath": item.get("source_path", ""),
        "outcome": outcome,
        "reviewer": args.reviewer,
        "notes": args.note,
        "timingNote": args.timing_note,
        "framingNote": args.framing_note,
        "captionNote": args.caption_note,
        "audioNote": args.audio_note,
        "hookNote": args.hook_note,
        "pacingNote": args.pacing_note,
        "endingNote": args.ending_note,
        "platformFitNote": args.platform_fit_note,
        "riskNote": args.risk_note,
        "tradeoffNote": args.tradeoff_note,
        "confidence": args.confidence,
        "reviewDimensions": review_dimensions_for(args),
        "nextAction": args.next_action or next_action_for(outcome),
        "truth": (
            "Review decision over a carry-forward short candidate. This does not mutate media, "
            "export a native target-version short, approve publication, or create platform receipt truth."
        ),
    }


def review_dimensions_for(args: argparse.Namespace) -> dict[str, str]:
    return {
        "hook": args.hook_note,
        "pacing": args.pacing_note,
        "framing": args.framing_note,
        "captions": args.caption_note,
        "audio": args.audio_note,
        "ending": args.ending_note,
        "platform_fit": args.platform_fit_note,
        "risk": args.risk_note,
        "tradeoff": args.tradeoff_note,
    }


def next_action_for(outcome: str) -> str:
    if outcome == "accept":
        return "Export this candidate as a native target-version short in the next non-overwriting short package."
    if outcome == "refine":
        return "Adjust start/end/framing/captions/audio, then export a native target-version short."
    if outcome == "reject":
        return "Do not promote this carry-forward candidate into the target version."
    return "Hold until Charlie, Mako, Homer, or Codex can provide the missing decision context."


def write_event(ledger_path: Path, event: dict[str, Any]) -> None:
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    with ledger_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def build_summary(workorder: dict[str, Any], ledger_path: Path, events: list[dict[str, Any]]) -> dict[str, Any]:
    latest = latest_decisions(events)
    total_items = len([item for item in workorder.get("items", []) if isinstance(item, dict)])
    outcome_counts = Counter(event.get("outcome", "unknown") for event in latest.values())
    pending = total_items - len(latest)
    next_candidate = recommended_next_candidate(workorder, latest)
    return {
        "model": "quipsly-studio-shorts-carryforward-review-summary",
        "version": "2026-07-02.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "episode": workorder.get("episode"),
        "sourceVersion": workorder.get("sourceVersion"),
        "targetVersion": workorder.get("targetVersion"),
        "ledger": str(ledger_path),
        "totalCandidates": total_items,
        "reviewedCandidates": len(latest),
        "pendingCandidates": max(pending, 0),
        "outcomeCounts": dict(sorted(outcome_counts.items())),
        "nextCandidate": next_candidate or {},
        "latestDecisions": [latest[index] for index in sorted(latest)],
        "nextSafestAction": summary_next_action(total_items, latest, next_candidate),
        "truth": (
            "Aggregate review state only. Accepted candidates still require native target-version export "
            "before they count as current shorts."
        ),
    }


def summary_next_action(total_items: int, latest: dict[int, dict[str, Any]], next_candidate: dict[str, Any] | None) -> str:
    if not latest:
        if next_candidate:
            return f"Review candidate {int(next_candidate.get('index') or 0):02d}: {next_candidate.get('title')}."
        return "Review the first carry-forward short candidate and record accept, refine, reject, or hold."
    accepted = [event for event in latest.values() if event.get("outcome") == "accept"]
    refined = [event for event in latest.values() if event.get("outcome") == "refine"]
    pending = total_items - len(latest)
    if pending > 0:
        if next_candidate:
            return f"Continue review with candidate {int(next_candidate.get('index') or 0):02d}: {next_candidate.get('title')}."
        return f"Continue review: {pending} candidate(s) still need an outcome."
    if accepted or refined:
        return "Create a native target-version shorts export package from accepted/refined candidates."
    return "All candidates were rejected or held. Create fresh shorts from the target-version timeline."


def render_summary_markdown(summary: dict[str, Any]) -> str:
    lines = [
        "# Shorts carry-forward review summary",
        "",
        f"Generated: `{summary['generatedAt']}`",
        f"Episode: `{summary.get('episode')}`",
        f"Source version: `{summary.get('sourceVersion')}`",
        f"Target version: `{summary.get('targetVersion')}`",
        f"Ledger: `{summary.get('ledger')}`",
        "",
        "> Truth: accepted carry-forward candidates still need native target-version export before they count as current shorts.",
        "",
        "## Counts",
        "",
        f"- Total candidates: {summary['totalCandidates']}",
        f"- Reviewed candidates: {summary['reviewedCandidates']}",
        f"- Pending candidates: {summary['pendingCandidates']}",
    ]
    for outcome, count in summary.get("outcomeCounts", {}).items():
        lines.append(f"- `{outcome}`: {count}")
    next_candidate = summary.get("nextCandidate") or {}
    if next_candidate:
        lines.extend(["", "## Recommended next candidate", ""])
        lines.append(f"- Candidate: `{int(next_candidate['index']):02d}`")
        lines.append(f"- Title: {next_candidate.get('title')}")
        lines.append(f"- Duration: `{next_candidate.get('durationSeconds')}s`")
        lines.append(f"- Bucket: `{next_candidate.get('durationBucket')}`")
        lines.append(f"- Aspect: `{next_candidate.get('aspect')}`")
        lines.append(f"- Review hint: {next_candidate.get('reviewHint')}")
        lines.append(f"- Suggested command: `{next_candidate.get('suggestedCommand')}`")
        if next_candidate.get("suggestedStructuredCommand"):
            lines.append(f"- Structured command: `{next_candidate.get('suggestedStructuredCommand')}`")
    lines.extend(["", "## Latest decisions", ""])
    for event in summary.get("latestDecisions", []):
        lines.append(f"- {event['index']:02d}. `{event['outcome']}` - {event['title']} ({event['reviewer']})")
        if event.get("notes"):
            lines.append(f"  - Note: {event['notes']}")
        dimensions = event.get("reviewDimensions") if isinstance(event.get("reviewDimensions"), dict) else {}
        for dimension in REVIEW_DIMENSIONS:
            value = dimensions.get(dimension)
            if value:
                lines.append(f"  - {dimension.replace('_', ' ').title()}: {value}")
        if event.get("confidence"):
            lines.append(f"  - Confidence: {event['confidence']}")
        if event.get("nextAction"):
            lines.append(f"  - Next: {event['nextAction']}")
    lines.extend(["", "## Next safest action", "", summary["nextSafestAction"], ""])
    return "\n".join(lines)


def write_summary(summary: dict[str, Any], ledger_path: Path) -> None:
    summary_json_path_for(ledger_path).write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary_md_path_for(ledger_path).write_text(render_summary_markdown(summary), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Record or summarize carry-forward short review decisions.")
    parser.add_argument("--workorder", default=str(DEFAULT_WORKORDER), help="Shorts carry-forward workorder JSON.")
    parser.add_argument("--summary", action="store_true", help="Only print/regenerate the current review summary.")
    parser.add_argument("--next", action="store_true", help="Print only the recommended next candidate.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown for --summary or --next.")
    parser.add_argument("--index", type=int, help="Candidate index to review.")
    parser.add_argument("--outcome", choices=sorted(OUTCOMES), help="Review outcome.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer name.")
    parser.add_argument("--note", default="", help="General review note.")
    parser.add_argument("--timing-note", default="", help="Timing/hook/ending note.")
    parser.add_argument("--framing-note", default="", help="9:16 framing note.")
    parser.add_argument("--caption-note", default="", help="Caption/text placement note.")
    parser.add_argument("--audio-note", default="", help="Cadence/audio note.")
    parser.add_argument("--hook-note", default="", help="Does the short earn attention quickly?")
    parser.add_argument("--pacing-note", default="", help="Does the rhythm feel human, tight, and not over-cleaned?")
    parser.add_argument("--ending-note", default="", help="Does the ending resolve cleanly or create useful curiosity?")
    parser.add_argument("--platform-fit-note", default="", help="Platform fit across YouTube Shorts, Instagram, Facebook, LinkedIn, etc.")
    parser.add_argument("--risk-note", default="", help="Reason this candidate may be confusing, weak, unsafe, or off-voice.")
    parser.add_argument("--tradeoff-note", default="", help="Explicit creative tradeoff accepted or rejected in this decision.")
    parser.add_argument("--confidence", default="", help="Optional confidence label such as low, medium, high, or needs-human-review.")
    parser.add_argument("--next-action", default="", help="Override next action.")
    args = parser.parse_args()

    workorder_path = Path(args.workorder).expanduser()
    workorder = read_json(workorder_path)
    ledger_path = ledger_path_for(workorder_path)

    if not args.summary and not args.next:
        if args.index is None or not args.outcome:
            parser.error("--index and --outcome are required unless --summary or --next is used")
        event = build_event(workorder, args.index, args)
        write_event(ledger_path, event)

    events = load_events(ledger_path)
    summary = build_summary(workorder, ledger_path, events)
    write_summary(summary, ledger_path)
    if args.next:
        next_candidate = summary.get("nextCandidate") or {}
        if args.json:
            print(json.dumps(next_candidate, indent=2, sort_keys=True))
        elif next_candidate:
            print(f"Candidate {int(next_candidate['index']):02d}: {next_candidate.get('title')}")
            print(f"Duration: {next_candidate.get('durationSeconds')}s")
            print(f"Bucket: {next_candidate.get('durationBucket')}")
            print(f"Hint: {next_candidate.get('reviewHint')}")
            print(f"Command: {next_candidate.get('suggestedCommand')}")
        else:
            print("No pending carry-forward short candidates.")
    elif args.json:
        print(json.dumps(summary, indent=2, sort_keys=True))
    else:
        print(render_summary_markdown(summary), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
