#!/usr/bin/env python3
"""Verify v002 short review surfaces agree on warnings and commands.

This catches a specific class of production-anxiety bugs: two official local
review artifacts both look current, but one carries stale warning text or older
review commands. It reads local sidecars only and never records review decisions,
mutates media, overwrites exports, publishes, schedules, or creates receipt truth.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.short-v002-surface-alignment.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slug(text: str) -> str:
    out: list[str] = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "short"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def load_pointer(pointer: Path, key: str = "jsonPath") -> tuple[str, dict[str, Any]]:
    pointer_payload = load_json(pointer)
    raw_path = str(pointer_payload.get(key) or "")
    if not raw_path:
        return "", {}
    path = Path(raw_path)
    return str(path), load_json(path)


def latest_matching(pattern: str) -> tuple[str, dict[str, Any]]:
    paths = sorted(DEFAULT_ROOT.glob(pattern), key=lambda path: (path.stat().st_mtime, str(path)), reverse=True)
    if not paths:
        return "", {}
    return str(paths[0]), load_json(paths[0])


def refresh_artifacts(args: argparse.Namespace) -> dict[str, Any]:
    command = [
        sys.executable,
        str(SCRIPT_DIR / "studio_short_v002_review_refresh.py"),
        "--reviewer",
        args.reviewer,
        "--json",
    ]
    if args.skip_transcript:
        command.append("--skip-transcript")
    for short_id in args.short_id:
        command.extend(["--short-id", short_id])
    proc = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=900)
    payload: dict[str, Any] = {
        "command": command,
        "returncode": proc.returncode,
        "ok": proc.returncode == 0,
        "stderrTail": (proc.stderr or "")[-1600:],
    }
    if proc.returncode != 0:
        payload["stdoutTail"] = (proc.stdout or "")[-1600:]
        return payload
    try:
        data = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        payload.update({"ok": False, "error": f"Refresh JSON parse failed: {error}", "stdoutTail": (proc.stdout or "")[-1600:]})
        return payload
    payload["status"] = data.get("status") if isinstance(data, dict) else ""
    payload["counts"] = data.get("counts") if isinstance(data, dict) and isinstance(data.get("counts"), dict) else {}
    return payload


def commands_from(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        "keep": str(value.get("keep") or value.get("keepCommandAfterListen") or ""),
        "refineAgain": str(value.get("refineAgain") or value.get("refineAgainCommandAfterListen") or value.get("refine-again") or ""),
        "reject": str(value.get("reject") or value.get("rejectCommandAfterListen") or ""),
    }


def command_has_review_flags(command: str, warnings: list[str]) -> bool:
    if not command:
        return False
    if "--watched" not in command or "--listened" not in command:
        return False
    if warnings and "--acknowledge-warnings" not in command:
        return False
    return True


def item_alignment(short_id: str, queue_item: dict[str, Any], theater: dict[str, Any]) -> dict[str, Any]:
    short_slug = slug(short_id)
    quality_path, quality = latest_matching(f"review-board/short-v002-quality-briefs/*-{short_slug}-quality-brief.json")
    rehearsal_pointer = DEFAULT_ROOT / "review-board" / "short-v002-decision-rehearsals" / short_slug / f"latest-{short_slug}-decision-rehearsal.json"
    rehearsal_path, rehearsal = load_pointer(rehearsal_pointer)
    theater_item = {}
    for item in theater.get("items", []) if isinstance(theater.get("items"), list) else []:
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            theater_item = item
            break

    queue_commands = commands_from(queue_item.get("commands"))
    quality_commands = commands_from(quality.get("reviewCommands"))
    theater_commands = commands_from(theater_item.get("commands"))
    rehearsal_readback = rehearsal.get("agentReadback") if isinstance(rehearsal.get("agentReadback"), dict) else {}
    rehearsal_commands = commands_from(rehearsal_readback)

    warning_sources = {
        "queue": str(queue_item.get("warningSummary") or ""),
        "quality": str(quality.get("warningSummary") or ""),
        "theater": str(theater_item.get("warningSummary") or ""),
        "rehearsal": str(rehearsal_readback.get("warningSummary") or ""),
    }
    warnings = [str(value) for value in queue_item.get("warnings", []) if value] if isinstance(queue_item.get("warnings"), list) else []

    command_sources = {
        "queue": queue_commands,
        "quality": quality_commands,
        "theater": theater_commands,
        "rehearsal": rehearsal_commands,
    }
    problems: list[str] = []
    expected_warning = warning_sources["queue"]
    for name, summary in warning_sources.items():
        if summary != expected_warning:
            problems.append(f"{name} warningSummary does not match queue warningSummary")
    for decision in ("keep", "refineAgain", "reject"):
        expected_command = queue_commands.get(decision, "")
        for surface, commands in command_sources.items():
            candidate = commands.get(decision, "")
            if candidate != expected_command:
                problems.append(f"{surface} {decision} command does not match queue {decision} command")
            if decision != "hold" and not command_has_review_flags(candidate, warnings):
                problems.append(f"{surface} {decision} command is missing required review evidence flags")
    return {
        "shortId": short_id,
        "ok": not problems,
        "problems": problems,
        "paths": {
            "qualityBriefPath": quality_path,
            "decisionRehearsalPath": rehearsal_path,
        },
        "warningSummary": expected_warning,
        "warningSources": warning_sources,
        "commandSources": command_sources,
        "truth": "Alignment item only. It does not approve, record decisions, mutate media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    refresh = refresh_artifacts(args) if args.refresh else {}
    queue_pointer = DEFAULT_ROOT / "review-board" / "short-v002-review-queue" / "latest-short-v002-review-queue.json"
    queue_path, queue = load_pointer(queue_pointer)
    theater_pointer = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-theater" / "latest-short-v002-candidate-review-theater.json"
    theater_path, theater = load_pointer(theater_pointer)
    queue_items = [item for item in queue.get("items", []) if isinstance(item, dict)] if isinstance(queue.get("items"), list) else []
    if args.short_id:
        requested = set(args.short_id)
        queue_items = [item for item in queue_items if str(item.get("shortId") or "") in requested]
    items = [item_alignment(str(item.get("shortId") or ""), item, theater) for item in queue_items if str(item.get("shortId") or "")]
    failed = [item for item in items if not item.get("ok")]
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-surface-alignment-ready" if not failed and items else "short-v002-surface-alignment-needs-attention",
        "reviewer": args.reviewer,
        "refresh": refresh,
        "queuePath": queue_path,
        "theaterPath": theater_path,
        "counts": {
            "items": len(items),
            "failed": len(failed),
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": items,
        "agentReadback": {
            "failedShortIds": [item.get("shortId") for item in failed],
            "nextSafestAction": "Use the mismatched surface details to regenerate the stale artifact." if failed else "Review surfaces agree on warning summaries and local review commands.",
        },
        "truth": "Local review-surface alignment only. It reads sidecars and optional refresh output; it does not record review decisions, mutate source media, overwrite exports, upload, publish, schedule, mutate accounts, normalize transcript truth, or create receipt truth.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Short v002 review-surface alignment",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        f"Items: `{payload.get('counts', {}).get('items')}`",
        f"Failed: `{payload.get('counts', {}).get('failed')}`",
        "",
    ]
    for item in payload.get("items", []):
        lines.extend([
            f"## `{item.get('shortId')}`",
            "",
            f"- OK: `{item.get('ok')}`",
            f"- Warning: `{item.get('warningSummary') or 'none'}`",
        ])
        if item.get("problems"):
            lines.extend(["", "Problems:", ""])
            lines.extend([f"- {problem}" for problem in item.get("problems") or []])
        lines.append("")
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify v002 review surfaces agree on warnings and commands.")
    parser.add_argument("--short-id", action="append", default=[], help="Short id to verify. Repeatable. Defaults to current queue.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--refresh", action="store_true", help="Run the safe v002 refresh chain before checking alignment.")
    parser.add_argument("--skip-transcript", action="store_true", help="When refreshing, skip ASR transcript regeneration.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()
    payload = build_payload(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "short-v002-surface-alignment-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
