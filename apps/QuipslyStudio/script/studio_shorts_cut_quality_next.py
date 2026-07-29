#!/usr/bin/env python3
"""Print one next cut-quality target from the Studio shorts workbench.

This is the small steering command for the cut-quality loop. It reads the
workbench artifact and returns one short with watch/listen questions, safe
commands, and truth boundaries. It does not record intent, edit timelines,
export media, or publish.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def list_items(board: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in board.get("items", []) if isinstance(item, dict)]


def choose_item(items: list[dict[str, Any]], short_id: str, rank: int, readiness: str) -> dict[str, Any]:
    if short_id:
        for item in items:
            if str(item.get("shortId") or "") == short_id:
                return item
        raise SystemExit(f"Short not found in cut-quality workbench: {short_id}")
    if rank > 0:
        for item in items:
            if int(item.get("rank") or -1) == rank:
                return item
        raise SystemExit(f"Rank not found in cut-quality workbench: {rank}")
    if readiness:
        for item in items:
            if str(item.get("readinessLevel") or "") == readiness:
                return item
        raise SystemExit(f"No cut-quality item has readiness level: {readiness}")
    preferred = ["watch-listen-first", "caption-timing-review", "transcript-review", "media-needs-repair"]
    for level in preferred:
        for item in items:
            if str(item.get("readinessLevel") or "") == level:
                return item
    if items:
        return items[0]
    raise SystemExit("Cut-quality workbench has no items.")


def compact_item(item: dict[str, Any], board: dict[str, Any]) -> dict[str, Any]:
    questions = [
        {
            "dimension": question.get("dimension"),
            "question": question.get("question"),
            "watchFor": question.get("watchFor"),
        }
        for question in item.get("editorQuestions", [])
        if isinstance(question, dict)
    ]
    return {
        "model": "quipsly-studio-shorts-cut-quality-next",
        "sourceWorkbenchJson": board.get("artifactPaths", {}).get("json") or board.get("sourceWorkbenchJson") or "",
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "version": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "durationLabel": item.get("durationLabel"),
        "aspect": item.get("aspect"),
        "mediaPath": item.get("mediaPath"),
        "mediaUri": item.get("mediaUri"),
        "readinessLevel": item.get("readinessLevel"),
        "transcript": item.get("transcript"),
        "platformChecks": item.get("platformChecks"),
        "editorQuestions": questions,
        "safeCommands": item.get("safeCommands"),
        "nextSafestAction": item.get("nextSafestAction"),
        "reviewProtocol": [
            "Open or watch the short before recording any local intent.",
            "Answer hook, cadence, J/L cut, jump-cut cover, reaction, caption, crop, and platform-fit questions in plain language.",
            "If transcript evidence is missing, label word-aware claims as needs-more-evidence instead of guessing.",
            "Use an evidence draft before recording local keep/refine/hold/reject intent.",
        ],
        "truth": "Read-only next cut-quality target. It records no review decision, edits no timeline, exports nothing, publishes nothing, runs no ASR, mutates no media, and creates no receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Next shorts cut-quality target",
        "",
        f"- Short: `{payload.get('shortId')}`",
        f"- Episode/version: `Episode {payload.get('episode')}` / `{payload.get('version')}`",
        f"- Title: {payload.get('title')}",
        f"- Duration/aspect: `{payload.get('durationLabel')}` / `{payload.get('aspect')}`",
        f"- Readiness: `{payload.get('readinessLevel')}`",
        f"- Transcript: `{(payload.get('transcript') or {}).get('status')}` / `{(payload.get('transcript') or {}).get('kind')}`",
        f"- File: `{payload.get('mediaPath')}`",
        "",
        payload.get("truth", ""),
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Review protocol",
        "",
    ]
    for step in payload.get("reviewProtocol", []):
        lines.append(f"- {step}")
    lines.extend(["", "## Platform checks", ""])
    for check in payload.get("platformChecks", []):
        lines.append(f"- {check}")
    lines.extend(["", "## Editor questions", ""])
    for question in payload.get("editorQuestions", []):
        lines.append(
            f"- `{question.get('dimension')}`: {question.get('question')} "
            f"Watch for: {question.get('watchFor')}"
        )
    lines.extend(["", "## Safe commands", ""])
    for label, command in (payload.get("safeCommands") or {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Show the next cut-quality target.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON), help="Cut-quality workbench JSON.")
    parser.add_argument("--short-id", default="", help="Select a specific short id.")
    parser.add_argument("--rank", type=int, default=0, help="Select a specific rank.")
    parser.add_argument("--readiness", default="", help="Select first item matching readiness level.")
    parser.add_argument("--json", action="store_true", help="Print JSON.")
    parser.add_argument("--markdown", action="store_true", help="Print Markdown.")
    args = parser.parse_args()

    board = read_json(Path(args.workbench).expanduser())
    item = choose_item(list_items(board), args.short_id, args.rank, args.readiness)
    payload = compact_item(item, board)
    if args.markdown or not args.json:
        print(render_markdown(payload), end="")
    else:
        print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
