#!/usr/bin/env python3
"""Review and optionally promote one ASR draft transcript sidecar.

This command is deliberately conservative:
- default mode is a dry-run plan;
- "accept-for-edit-review" writes a normalized transcript sidecar that is
  usable for edit/caption review, but still not final publication approval;
- "needs-correction" and "hold" record local review intent only;
- source media and previous exports are never mutated.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_WORKBENCH_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "workbench"
    / "quipsly-studio-shorts-transcript-intake-workbench.json"
)
SCHEMA = "quipsly.studio.shorts-transcript-review-promote.v1"
VERSION = "2026-07-02.v1"
OUTCOMES = {"accept-for-edit-review", "needs-correction", "hold"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def select_item(workbench: dict[str, Any], short_id: str) -> dict[str, Any]:
    items = [item for item in workbench.get("items", []) if isinstance(item, dict)]
    if short_id:
        selected = next((item for item in items if str(item.get("shortId") or "") == short_id), None)
        if selected:
            return selected
        raise SystemExit(f"Short id not found in transcript workbench: {short_id}")
    ready = [
        item
        for item in items
        if str(item.get("status") or "") == "asr-draft-present-needs-review"
        and item.get("destinations", {}).get("asrDraftTranscript", {}).get("exists")
        and not item.get("destinations", {}).get("normalizedTranscript", {}).get("exists")
    ]
    if ready:
        return sorted(ready, key=lambda item: (int(item.get("episode") or 999), str(item.get("shortId") or "")))[0]
    fallback = [
        item
        for item in items
        if item.get("destinations", {}).get("asrDraftTranscript", {}).get("exists")
    ]
    if fallback:
        return sorted(fallback, key=lambda item: (int(item.get("episode") or 999), str(item.get("shortId") or "")))[0]
    raise SystemExit("No ASR draft transcript exists in the transcript workbench.")


def dest_path(item: dict[str, Any], key: str) -> Path:
    destinations = item.get("destinations") if isinstance(item.get("destinations"), dict) else {}
    status = destinations.get(key) if isinstance(destinations.get(key), dict) else {}
    return Path(str(status.get("path") or ""))


def ledger_path(item: dict[str, Any]) -> Path:
    normalized = dest_path(item, "normalizedTranscript")
    short_id = str(item.get("shortId") or "unknown-short")
    if normalized:
        return normalized.with_name(f"{short_id}-transcript-review-ledger.jsonl")
    return DEFAULT_ROOT / "shorts-command-room" / "transcript-workorders" / short_id / f"{short_id}-transcript-review-ledger.jsonl"


def normalized_from_draft(draft: dict[str, Any], item: dict[str, Any], reviewer: str, note: str) -> dict[str, Any]:
    segments = draft.get("segments") if isinstance(draft.get("segments"), list) else []
    normalized_segments = []
    for index, segment in enumerate(segments):
        if not isinstance(segment, dict):
            continue
        normalized_segments.append(
            {
                "id": f"seg-{index + 1:03d}",
                "start": segment.get("start"),
                "end": segment.get("end"),
                "text": segment.get("text"),
                "words": segment.get("words") if isinstance(segment.get("words"), list) else [],
                "speaker": "unknown",
                "reviewStatus": "accepted-for-edit-review",
                "source": "local-whisper-asr-draft",
            }
        )
    return {
        "schema": "quipsly.studio.short-normalized-transcript.v1",
        "version": "2026-07-02.v1",
        "generatedAt": iso_now(),
        "shortId": item.get("shortId"),
        "episode": item.get("episode"),
        "title": item.get("title"),
        "status": "accepted-for-edit-review",
        "finalCaptionApproval": False,
        "reviewer": reviewer,
        "reviewNote": note,
        "sourceDraftTranscript": dest_path(item, "asrDraftTranscript").as_posix(),
        "sourceRawProviderOutput": dest_path(item, "rawProviderOutput").as_posix(),
        "sourceAudioSidecar": item.get("audioSidecar", {}).get("path"),
        "text": draft.get("text") or "",
        "wordCountApprox": draft.get("wordCountApprox") or 0,
        "segments": normalized_segments,
        "reviewChecklist": [
            "Accepted only for edit review and caption-aware workflow development.",
            "Speaker labels are not final unless explicitly corrected.",
            "Caption publication still requires final caption review.",
            "If words affect a cut, spot-check the audio before final export.",
        ],
        "truth": "Normalized transcript sidecar accepted for edit review. It is not final caption approval, external publication approval, upload, schedule, source mutation, or receipt truth.",
    }


def build_plan(item: dict[str, Any], outcome: str, reviewer: str, note: str, force: bool) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "unknown-short")
    draft_path = dest_path(item, "asrDraftTranscript")
    normalized_path = dest_path(item, "normalizedTranscript")
    ledger = ledger_path(item)
    blockers = []
    if outcome not in OUTCOMES:
        blockers.append(f"Unsupported outcome: {outcome}")
    if not draft_path.exists():
        blockers.append(f"ASR draft transcript missing: {draft_path}")
    if outcome == "accept-for-edit-review" and normalized_path.exists() and not force:
        blockers.append(f"Normalized transcript already exists: {normalized_path}. Use --force to replace review sidecar.")
    if outcome == "accept-for-edit-review" and not note.strip():
        blockers.append("A review note is required when accepting machine words for edit review.")
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "shortId": short_id,
        "episode": item.get("episode"),
        "outcome": outcome,
        "reviewer": reviewer,
        "note": note,
        "status": "blocked" if blockers else "ready-to-record",
        "blockers": blockers,
        "paths": {
            "asrDraftTranscript": str(draft_path),
            "normalizedTranscript": str(normalized_path),
            "ledger": str(ledger),
        },
        "safeCommands": {
            "openDraft": f"open {shell_quote(str(draft_path))}" if draft_path.exists() else "",
            "openAudio": f"open {shell_quote(str(item.get('audioSidecar', {}).get('path') or ''))}" if item.get("audioSidecar", {}).get("exists") else "",
            "openWorkbench": "script/agentctl.sh studio-shorts-transcript-intake-workbench --all",
        },
        "truth": "Transcript review/promote plan only. No source media, exports, publishing state, or receipts are mutated.",
    }


def record_review(item: dict[str, Any], plan: dict[str, Any], force: bool) -> dict[str, Any]:
    if plan.get("blockers"):
        return plan
    draft_path = Path(plan["paths"]["asrDraftTranscript"])
    normalized_path = Path(plan["paths"]["normalizedTranscript"])
    ledger = Path(plan["paths"]["ledger"])
    draft = read_json(draft_path)
    event = {
        "schema": "quipsly.studio.short-transcript-review-ledger.v1",
        "recordedAt": iso_now(),
        "shortId": plan.get("shortId"),
        "episode": plan.get("episode"),
        "outcome": plan.get("outcome"),
        "reviewer": plan.get("reviewer"),
        "note": plan.get("note"),
        "sourceDraftTranscript": str(draft_path),
        "normalizedTranscript": str(normalized_path) if plan.get("outcome") == "accept-for-edit-review" else "",
        "truth": "Local transcript review ledger event only. It is not publication, upload, schedule, source mutation, or receipt truth.",
    }
    normalized_written = False
    if plan.get("outcome") == "accept-for-edit-review":
        normalized = normalized_from_draft(draft, item, str(plan.get("reviewer") or ""), str(plan.get("note") or ""))
        normalized_path.parent.mkdir(parents=True, exist_ok=True)
        if normalized_path.exists() and not force:
            raise SystemExit(f"Normalized transcript exists: {normalized_path}")
        normalized_path.write_text(json.dumps(normalized, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        normalized_written = True
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with ledger.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return {
        **plan,
        "status": "recorded",
        "normalizedTranscriptWritten": normalized_written,
        "ledgerEventWritten": True,
        "recordedEvent": event,
        "truth": "Transcript review event recorded locally. Accepted sidecars are edit-review inputs, not final caption approval or publication receipts.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript review/promote",
        "",
        f"Short: `{payload.get('shortId')}`",
        f"Episode: `Episode {payload.get('episode')}`",
        f"Outcome: `{payload.get('outcome')}`",
        f"Status: `{payload.get('status')}`",
        "",
    ]
    if payload.get("blockers"):
        lines.extend(["## Blockers", ""])
        for blocker in payload.get("blockers", []):
            lines.append(f"- {blocker}")
        lines.append("")
    paths = payload.get("paths") if isinstance(payload.get("paths"), dict) else {}
    if paths:
        lines.extend(["## Paths", ""])
        for key, path in paths.items():
            lines.append(f"- {key}: `{path}`")
        lines.append("")
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Review/promote one ASR draft transcript sidecar.")
    parser.add_argument("--workbench", default=str(DEFAULT_WORKBENCH_JSON))
    parser.add_argument("--short-id", default="")
    parser.add_argument("--outcome", choices=sorted(OUTCOMES), default="accept-for-edit-review")
    parser.add_argument("--reviewer", default="codex")
    parser.add_argument("--note", default="Machine ASR draft accepted for edit-review use; final captions still require human review.")
    parser.add_argument("--record-review", action="store_true", help="Actually write ledger and optional normalized transcript sidecar.")
    parser.add_argument("--force", action="store_true", help="Allow replacing normalized transcript sidecar. Does not touch source media.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    workbench = read_json(Path(args.workbench).expanduser())
    item = select_item(workbench, args.short_id)
    plan = build_plan(item, args.outcome, args.reviewer, args.note, args.force)
    payload = record_review(item, plan, args.force) if args.record_review else plan
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
