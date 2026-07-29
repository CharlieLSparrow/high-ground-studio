#!/usr/bin/env python3
"""Build a read-only transcript confidence board for queued shorts.

This does not run ASR, normalize transcript text, approve captions, edit short
recipes, export, upload, publish, or mutate source media. It inspects the live
/shorts_queue transcript excerpts and flags where rough transcript evidence may
mislead hook, caption, cadence, or cut decisions.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from shorts_queue_quality_board import (  # noqa: E402
    DEFAULT_BASE_URL,
    fetch_json,
    queue_items,
    transcript_context,
    transcript_excerpt,
    transcript_segment_count,
    transcript_speakers,
    transcript_status,
)


DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly/QuipslyExports/ShortsTranscriptConfidenceBoards")
SCHEMA = "quipsly.studio.shorts-transcript-confidence-board.v1"
FILLERS = {"um", "uh", "like", "you", "know", "so", "and", "but", "okay"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(value: str, fallback: str = "shorts-transcript-confidence-board") -> str:
    text = (value or fallback).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text or fallback


def text(value: Any, fallback: str = "") -> str:
    if value is None:
        return fallback
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def tokens(value: str) -> list[str]:
    return re.findall(r"[a-zA-Z']+", value.lower())


def repeated_adjacent_tokens(words: list[str]) -> int:
    return sum(1 for left, right in zip(words, words[1:]) if left == right)


def repeated_bigrams(words: list[str]) -> int:
    bigrams = list(zip(words, words[1:]))
    counts = Counter(bigrams)
    return sum(count - 1 for count in counts.values() if count > 1)


def longest_repeated_run(words: list[str]) -> int:
    longest = 0
    current = 0
    previous = ""
    for word in words:
        if word == previous:
            current += 1
        else:
            current = 1
            previous = word
        longest = max(longest, current)
    return longest


def confidence_for(row: dict[str, Any], index: int) -> dict[str, Any]:
    excerpt = transcript_excerpt(row, max_chars=700)
    context = transcript_context(row)
    status = transcript_status(row)
    speakers = transcript_speakers(row)
    segment_count = transcript_segment_count(row)
    words = tokens(excerpt)
    word_count = len(words)
    adjacent = repeated_adjacent_tokens(words)
    bigram_repeats = repeated_bigrams(words)
    filler_count = sum(1 for word in words if word in FILLERS)
    filler_ratio = filler_count / word_count if word_count else 0.0
    repeated_ratio = (adjacent + bigram_repeats) / max(word_count, 1)
    unknown_speaker = not speakers or speakers.lower() in {"unknown", "speaker", "speakers"}

    score = 100
    warnings: list[str] = []
    next_actions: list[str] = []
    if status == "missing" or not excerpt:
        score -= 70
        warnings.append("missing transcript excerpt")
        next_actions.append("Create or link transcript/caption evidence before using words for edit decisions.")
    if word_count < 18 and status != "missing":
        score -= 20
        warnings.append("short excerpt may not explain the idea")
        next_actions.append("Open a longer transcript context or watch the export before judging hook/payoff.")
    if adjacent >= 4 or bigram_repeats >= 5 or repeated_ratio > 0.12:
        score -= 25
        warnings.append("repeated words/phrases suggest rough ASR or overlap duplication")
        next_actions.append("Do not quote this transcript directly; proof-listen or rerun transcript cleanup.")
    if filler_ratio > 0.18:
        score -= 12
        warnings.append("high filler ratio")
        next_actions.append("Use transcript for context only; judge cadence by listening.")
    if unknown_speaker:
        score -= 15
        warnings.append("speaker label uncertain")
        next_actions.append("Review or assign speaker before speaker-aware captions or reaction cuts.")
    if segment_count <= 0 and status != "missing":
        score -= 10
        warnings.append("segment count unavailable")
    score = max(0, min(100, score))

    if score >= 80:
        classification = "usable-context"
        next_actions.append("Transcript can guide review context, but still verify quotes by ear before publishing.")
    elif score >= 55:
        classification = "use-with-caution"
        next_actions.append("Use this transcript to orient review, not as caption or quote truth.")
    elif status == "missing":
        classification = "missing-transcript"
    else:
        classification = "needs-transcript-review"

    return {
        "index": index,
        "id": text(row.get("id")) or f"queue-index-{index}",
        "title": text(row.get("title")) or f"Short {index}",
        "status": status,
        "classification": classification,
        "confidenceScore": score,
        "speakers": speakers,
        "segmentCount": segment_count,
        "wordCount": word_count,
        "adjacentRepeatCount": adjacent,
        "bigramRepeatCount": bigram_repeats,
        "longestRepeatedRun": longest_repeated_run(words),
        "fillerRatio": round(filler_ratio, 3),
        "excerpt": excerpt,
        "warnings": warnings,
        "nextSafeActions": next_actions,
        "truth": text(context.get("truth"), "Transcript confidence is read-only evidence over current queue transcript context."),
    }


def build_board(args: argparse.Namespace) -> dict[str, Any]:
    state = fetch_json(args.base_url, "/state")
    queue = fetch_json(args.base_url, "/shorts_queue")
    rows = queue_items(queue)
    items = [confidence_for(row, index) for index, row in enumerate(rows, start=1)]
    ranked = sorted(items, key=lambda item: (item["confidenceScore"], item["index"]))
    limit = args.limit if args.limit and args.limit > 0 else len(ranked)
    visible = ranked[:limit]
    summary = {
        "total": len(items),
        "usableContext": sum(1 for item in items if item["classification"] == "usable-context"),
        "useWithCaution": sum(1 for item in items if item["classification"] == "use-with-caution"),
        "needsTranscriptReview": sum(1 for item in items if item["classification"] == "needs-transcript-review"),
        "missingTranscript": sum(1 for item in items if item["classification"] == "missing-transcript"),
    }
    board = {
        "schema": SCHEMA,
        "status": "shorts_transcript_confidence_board",
        "generatedAt": iso_now(),
        "activeSessionName": text(state.get("activeSessionName")),
        "summary": summary,
        "lowestConfidenceItems": visible,
        "nextSafeAction": visible[0]["nextSafeActions"][0] if visible and visible[0]["nextSafeActions"] else "No transcript confidence issues found in the visible queue.",
        "safeCommands": {
            "qualityBoard": "script/agentctl.sh shorts-queue-quality-board --markdown",
            "reviewQueuePacket": "script/agentctl.sh shorts-review-queue-packet --save --markdown",
            "transcriptWorkorders": "script/agentctl.sh studio-shorts-transcript-workorders --all",
            "selectedQuality": "script/agentctl.sh selected-short-quality",
        },
        "truth": (
            "Read-only transcript confidence board. It evaluates current transcript excerpts as evidence, not source truth. "
            "It does not run ASR, normalize transcript text, approve captions, edit recipes, export, upload, publish, create receipts, or mutate source media."
        ),
    }
    if args.save:
        folder = args.output_root / slug(str(board.get("activeSessionName") or "unknown-session")) / f"{stamp()}-shorts-transcript-confidence-board"
        folder.mkdir(parents=True, exist_ok=False)
        json_path = folder / "shorts-transcript-confidence-board.json"
        markdown_path = folder / "shorts-transcript-confidence-board.md"
        json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        markdown_path.write_text(markdown(board) + "\n", encoding="utf-8")
        board["artifact"] = {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}
    return board


def markdown(board: dict[str, Any]) -> str:
    summary = board["summary"]
    lines = [
        "# Shorts Transcript Confidence Board",
        "",
        f"- Session: `{board.get('activeSessionName') or 'unknown'}`",
        f"- Total shorts: `{summary['total']}`",
        f"- Usable context: `{summary['usableContext']}`",
        f"- Use with caution: `{summary['useWithCaution']}`",
        f"- Needs transcript review: `{summary['needsTranscriptReview']}`",
        f"- Missing transcript: `{summary['missingTranscript']}`",
        f"- Next safest action: {board['nextSafeAction']}",
        "",
        "## Lowest confidence transcript evidence",
        "",
    ]
    for item in board["lowestConfidenceItems"]:
        warnings = "; ".join(item["warnings"]) or "none"
        actions = "; ".join(item["nextSafeActions"]) or "none"
        lines.extend([
            f"### {item['index']:02d}. {item['title']}",
            "",
            f"- Classification: `{item['classification']}`",
            f"- Confidence: `{item['confidenceScore']}`",
            f"- Speakers: `{item['speakers'] or 'unknown'}`",
            f"- Segments: `{item['segmentCount']}`",
            f"- Words: `{item['wordCount']}`",
            f"- Repeats: adjacent `{item['adjacentRepeatCount']}`, bigram `{item['bigramRepeatCount']}`, longest run `{item['longestRepeatedRun']}`",
            f"- Filler ratio: `{item['fillerRatio']}`",
            f"- Warnings: {warnings}",
            f"- Next: {actions}",
            f"- Excerpt: {item['excerpt'] or 'missing'}",
            "",
        ])
    lines.extend(["## Safe commands", ""])
    for label, command in board["safeCommands"].items():
        lines.append(f"- `{label}`: `{command}`")
    if board.get("artifact"):
        lines.extend([
            "",
            "## Saved artifact",
            "",
            f"- JSON: `{board['artifact']['jsonPath']}`",
            f"- Markdown: `{board['artifact']['markdownPath']}`",
        ])
    lines.extend(["", f"Truth: {board['truth']}"])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    board = build_board(args)
    if args.markdown and not args.json:
        print(markdown(board))
    else:
        print(json.dumps(board, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
