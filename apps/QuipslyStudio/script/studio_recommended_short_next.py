#!/usr/bin/env python3
"""Print the next recommended native short to review.

This is the small steering-wheel command for the recommended shorts theater. It
does not record a review decision. It points a human or agent to the next
watch/listen target and provides dry-run commands before any local intent is
recorded.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_THEATER_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-theater"
    / "quipsly-studio-recommended-shorts-review-theater.json"
)
SCHEMA = "quipsly.studio.recommended-short-next.v1"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Recommended shorts theater JSON not found: {path}\nRun: script/agentctl.sh studio-recommended-shorts-review-theater")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def select_item(items: list[dict[str, Any]], short_id: str, rank: int | None) -> dict[str, Any]:
    if short_id:
        selected = next((item for item in items if str(item.get("shortId")) == short_id), None)
        if selected:
            return selected
        raise SystemExit(f"Short id not found in recommended theater: {short_id}")
    if rank is not None:
        selected = next((item for item in items if int(item.get("rank") or -1) == rank), None)
        if selected:
            return selected
        raise SystemExit(f"Rank not found in recommended theater: {rank}")
    pending = next((item for item in items if item.get("decision") == "pending"), None)
    if pending:
        return pending
    if items:
        return items[0]
    raise SystemExit("Recommended shorts theater has no review items.")


def build_payload(theater: dict[str, Any], item: dict[str, Any]) -> dict[str, Any]:
    path = str(item.get("path") or "")
    theater_json = Path(str(theater.get("jsonPath") or DEFAULT_THEATER_JSON))
    theater_html = theater_json.with_suffix(".html")
    commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "sourceTheaterVersion": theater.get("version"),
        "sourceTheaterJson": str(theater_json),
        "sourceTheaterHtml": str(theater_html),
        "sourceTheaterCommandRoom": theater.get("commandRoomJson"),
        "sourceTheaterLedger": theater.get("ledgerJson"),
        "counts": theater.get("counts", {}),
        "selected": {
            "rank": item.get("rank"),
            "shortId": item.get("shortId"),
            "episode": item.get("episode"),
            "version": item.get("version"),
            "title": item.get("title"),
            "durationLabel": item.get("durationLabel"),
            "durationSeconds": item.get("durationSeconds"),
            "aspect": item.get("aspect"),
            "hasAudio": item.get("hasAudio"),
            "hasVideo": item.get("hasVideo"),
            "probeStatus": item.get("probeStatus"),
            "probeWarning": item.get("probeWarning"),
            "decision": item.get("decision"),
            "reviewPriority": item.get("reviewPriority"),
            "reviewPriorityReason": item.get("reviewPriorityReason"),
            "platformFit": item.get("platformFit") or [],
            "path": path,
            "truth": item.get("truth"),
        },
        "watchFirstChecklist": [
            "Watch the short all the way through before recording any intent.",
            "Listen for cadence: do not reward over-tightening just because the clip is short.",
            "Check whether captions or future overlays would cover faces or key motion.",
            "Check if the first two seconds explain why a stranger should keep watching.",
            "Check whether the ending resolves, lands a point, or creates useful curiosity.",
        ],
        "safeCommands": {
            "openTheater": f"open {shell_quote(str(theater_html))}",
            "openShort": f"open {shell_quote(path)}" if path else "",
            "revealShort": f"open -R {shell_quote(path)}" if path else "",
            **commands,
        },
        "nextSafestAction": "Open/watch the selected short, then run a dry-run review command with a specific note before recording local intent.",
        "truth": "Read-only next-review routing. No decision, approval, publication, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth is created.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    item = payload["selected"]
    lines = [
        "# Next recommended short review",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        "",
        f"## {item.get('shortId')} - {item.get('title')}",
        "",
        f"- Rank: `{item.get('rank')}`",
        f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('version')}`",
        f"- Duration/aspect: `{item.get('durationLabel')}` / `{item.get('aspect')}`",
        f"- Media: audio `{item.get('hasAudio')}`, video `{item.get('hasVideo')}`, probe `{item.get('probeStatus')}`",
        f"- Current local review decision: `{item.get('decision')}`",
        f"- Priority: `{item.get('reviewPriority')}` - {item.get('reviewPriorityReason')}",
        f"- Platform fit: {', '.join(item.get('platformFit') or [])}",
        f"- File: `{item.get('path')}`",
        "",
        "## Watch-first checklist",
        "",
    ]
    for check in payload.get("watchFirstChecklist", []):
        lines.append(f"- {check}")
    lines.extend(["", "## Safe commands", ""])
    for label, command in payload.get("safeCommands", {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Truth boundary", "", payload.get("truth", "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Show the next recommended native short to review.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended shorts theater JSON.")
    parser.add_argument("--short-id", default="", help="Select a specific short id instead of first pending.")
    parser.add_argument("--rank", type=int, default=None, help="Select a specific recommendation rank.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    theater_path = Path(args.theater).expanduser()
    theater = read_json(theater_path)
    theater["jsonPath"] = str(theater_path)
    items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    payload = build_payload(theater, select_item(items, args.short_id, args.rank))
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
