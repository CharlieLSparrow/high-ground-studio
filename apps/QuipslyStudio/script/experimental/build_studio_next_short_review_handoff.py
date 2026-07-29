#!/usr/bin/env python3
"""Build one actionable Studio shorts review handoff.

This is intentionally a thin view over the existing shorts review batch.
The batch is the working queue; this file answers "what is the next short
someone should watch or inspect?" without creating a second source of truth.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_POINTER = Path("review-board/shorts-review-batches/latest-shorts-review-batch.json")
LATEST_LEDGER_POINTER = Path("review-board/latest-studio-short-review-decision-ledger.json")
DEFAULT_LEDGER_PATH = Path("review-board/studio-short-review-decision-ledger/studio-short-review-decision-ledger.json")


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def refresh_batch(root: Path, limit: int, include_warnings: bool) -> dict[str, Any]:
    script = Path(__file__).with_name("build_studio_next_shorts_review_batch.py")
    command = [sys.executable, str(script), str(root), "--limit", str(limit)]
    if include_warnings:
        command.append("--include-warnings")
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            "Could not refresh Studio shorts review batch.\n"
            f"command: {' '.join(command)}\n"
            f"stdout: {completed.stdout.strip()}\n"
            f"stderr: {completed.stderr.strip()}"
        )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Batch refresh did not return JSON: {completed.stdout[:500]}") from exc


def load_batch(root: Path, batch_path: Path | None, refresh: bool, limit: int, include_warnings: bool) -> tuple[dict[str, Any], Path | None, dict[str, Any] | None]:
    if batch_path:
        batch = load_json(batch_path)
        return batch, batch_path, None

    latest_path = root / LATEST_POINTER
    pointer: dict[str, Any] | None = None
    if latest_path.exists():
        pointer = load_json(latest_path)
        json_path = Path(str(pointer.get("jsonPath", "")))
        if json_path.exists():
            return load_json(json_path), json_path, pointer

    if refresh:
        pointer = refresh_batch(root, limit=limit, include_warnings=include_warnings)
        latest_pointer = root / LATEST_POINTER
        if latest_pointer.exists():
            latest = load_json(latest_pointer)
            json_path = Path(str(latest.get("jsonPath", "")))
            if json_path.exists():
                return load_json(json_path), json_path, latest
        json_path = Path(str(pointer.get("jsonPath", "")))
        if json_path.exists():
            return load_json(json_path), json_path, pointer

    return {}, None, pointer


def load_decision_ledger(root: Path) -> tuple[dict[str, Any], Path | None]:
    pointer_path = root / LATEST_LEDGER_POINTER
    if pointer_path.exists():
        pointer = load_json(pointer_path)
        json_path = Path(str(pointer.get("jsonPath", "")))
        if json_path.exists():
            return load_json(json_path), json_path
    default_path = root / DEFAULT_LEDGER_PATH
    if default_path.exists():
        return load_json(default_path), default_path
    return {}, None


def decision_commands(short_id: str) -> dict[str, str]:
    return {
        "dryRunKeep": f"./script/agentctl.sh studio-short-review-decision-dry-run {short_id} keep '<reviewer>' '<why this short is locally promising>'",
        "dryRunRefine": f"./script/agentctl.sh studio-short-review-decision-dry-run {short_id} refine '<reviewer>' '<crop/pacing/caption/audio issue>'",
        "dryRunHold": f"./script/agentctl.sh studio-short-review-decision-dry-run {short_id} hold '<reviewer>' '<what must be checked before deciding>'",
        "dryRunReject": f"./script/agentctl.sh studio-short-review-decision-dry-run {short_id} reject '<reviewer>' '<why this should not move forward>'",
        "recordKeep": f"./script/agentctl.sh studio-short-review-decision {short_id} keep '<reviewer>' '<why this short is locally promising>'",
        "recordRefine": f"./script/agentctl.sh studio-short-review-decision {short_id} refine '<reviewer>' '<crop/pacing/caption/audio issue>'",
        "recordHold": f"./script/agentctl.sh studio-short-review-decision {short_id} hold '<reviewer>' '<what must be checked before deciding>'",
        "recordReject": f"./script/agentctl.sh studio-short-review-decision {short_id} reject '<reviewer>' '<why this should not move forward>'",
        "recordNeedsMoreEvidence": f"./script/agentctl.sh studio-short-review-decision {short_id} needs-more-evidence '<reviewer>' '<what evidence is missing>'",
        "recordIntentTemplate": "Choose one runnable record command: recordKeep, recordRefine, recordHold, recordReject, or recordNeedsMoreEvidence.",
    }


def row_from_ledger_item(item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or item.get("id") or "")
    commands = decision_commands(short_id)
    return {
        "id": short_id,
        "episode": item.get("episode", ""),
        "version": item.get("version", ""),
        "shortIndex": item.get("shortIndex", ""),
        "title": item.get("title", short_id),
        "humanTitle": item.get("title") or item.get("humanTitle") or short_id,
        "path": item.get("path", ""),
        "fileUri": item.get("fileUri", ""),
        "exists": bool(item.get("exists")),
        "bytes": item.get("bytes", 0),
        "durationSeconds": item.get("durationSeconds"),
        "durationLabel": item.get("durationLabel", ""),
        "hasAudio": bool(item.get("hasAudio")),
        "hasVideo": bool(item.get("hasVideo")),
        "codecSummary": item.get("codecSummary", []),
        "aspect": item.get("aspect", ""),
        "width": item.get("width", 0),
        "height": item.get("height", 0),
        "durationBucket": item.get("durationBucket", ""),
        "platformFit": item.get("platformFit", []),
        "reviewPriority": item.get("reviewPriority", 9999),
        "reviewPriorityReason": item.get("reviewPriorityReason", ""),
        "reviewSource": item.get("reviewSource", ""),
        "status": item.get("decision", "pending"),
        "reviewRisk": item.get("reviewRisk", ""),
        "episodeWarning": bool(item.get("episodeWarning")),
        "episodeDurationAligned": bool(item.get("episodeDurationAligned", True)),
        "reviewPrompt": item.get("reviewPrompt", ""),
        "nextSafestAction": item.get("nextSafestAction") or "Open the local short with sound on, then record only local review intent.",
        "openCommand": item.get("openCommand", ""),
        "revealCommand": item.get("revealCommand", ""),
        "dryRunCommand": commands["dryRunKeep"],
        "localReviewCommands": commands,
        "keepNoteTemplate": f"KEEP {short_id}: reason=",
        "refineNoteTemplate": f"REFINE {short_id}: crop/pacing/caption/audio issue=",
        "holdNoteTemplate": f"HOLD {short_id}: waiting_for=",
        "rejectNoteTemplate": f"REJECT {short_id}: reason=",
        "localReviewCommandSafety": "Local shorts intent only. These commands never publish, upload, schedule, approve external action, mutate media, overwrite, delete, mutate accounts, or create receipt truth.",
        "_sourceKind": "decision-ledger",
    }


def choose_row(rows: list[dict[str, Any]], ledger: dict[str, Any]) -> dict[str, Any] | None:
    """Choose one row that can actually move through the review loop."""

    def as_int(value: Any, default: int) -> int:
        try:
            return int(value)
        except (TypeError, ValueError):
            return default

    def as_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    def duration_score(row: dict[str, Any]) -> int:
        duration = as_float(row.get("durationSeconds"), 0.0)
        if 15 <= duration <= 60:
            return 0
        if 8 <= duration < 15 or 60 < duration <= 90:
            return 1
        if duration > 0:
            return 2
        return 3

    def platform_score(row: dict[str, Any]) -> int:
        aspect = str(row.get("aspect") or "").strip()
        width = as_int(row.get("width"), 0)
        height = as_int(row.get("height"), 0)
        if not aspect and width and height:
            aspect = "9:16" if height > width else "16:9" if width > height else "1:1"
        has_av = bool(row.get("exists") and row.get("hasVideo") and row.get("hasAudio"))
        if has_av and aspect == "9:16":
            return 0
        if has_av:
            return 1
        return 2

    status_order = {
        "ready": 0,
        "pending": 0,
        "review-needed": 1,
        "needs-review": 1,
        "hold": 5,
        "refine": 6,
        "keep": 7,
        "reject": 8,
    }

    def score(row: dict[str, Any]) -> tuple[int, ...]:
        playable = 0 if row.get("exists") and row.get("hasVideo") and row.get("hasAudio") else 1
        status = status_order.get(str(row.get("status", "")).lower(), 3)
        priority = as_int(row.get("reviewPriority"), 9999)
        warning = 1 if row.get("episodeWarning") else 0
        episode = as_int(row.get("episode"), 9999)
        short_index = as_int(row.get("shortIndex"), 9999)
        return (
            playable,
            status,
            platform_score(row),
            duration_score(row),
            priority,
            warning,
            episode,
            short_index,
        )

    ledger_items = ledger.get("items", []) if isinstance(ledger.get("items"), list) else []
    ledger_by_id = {
        str(item.get("shortId")): item
        for item in ledger_items
        if isinstance(item, dict) and item.get("shortId")
    }
    pending_ledger_ids = {
        short_id
        for short_id, item in ledger_by_id.items()
        if str(item.get("decision", "pending")) == "pending"
    }
    candidates: list[dict[str, Any]] = []
    candidate_ids: set[str] = set()
    if rows and pending_ledger_ids:
        for row in rows:
            short_id = str(row.get("id") or "")
            if short_id in pending_ledger_ids:
                candidate = dict(row)
                candidate["_sourceKind"] = "shorts-review-batch-and-decision-ledger"
                candidates.append(candidate)
                candidate_ids.add(short_id)
    pending_ledger_rows = [
        row_from_ledger_item(item)
        for item in ledger_items
        if (
            isinstance(item, dict)
            and str(item.get("decision", "pending")) == "pending"
            and str(item.get("shortId") or "") not in candidate_ids
        )
    ]
    candidates.extend(pending_ledger_rows)
    if candidates:
        return sorted(candidates, key=score)[0]

    if rows:
        row = dict(sorted(rows, key=score)[0])
        row["_sourceKind"] = "shorts-review-batch-only"
        return row
    return None


def default_output_dir(root: Path) -> Path:
    if root.exists():
        return root / "review-board" / "shorts-review-next"
    return Path.home() / "Desktop" / "Quipsly_Shorts_Review_Next"


def build_payload(root: Path, batch_path: Path | None, refresh: bool, limit: int, include_warnings: bool) -> dict[str, Any]:
    batch, resolved_batch_path, pointer = load_batch(
        root,
        batch_path=batch_path,
        refresh=refresh,
        limit=limit,
        include_warnings=include_warnings,
    )
    ledger, resolved_ledger_path = load_decision_ledger(root)
    rows = batch.get("rows", []) if isinstance(batch.get("rows"), list) else []
    row = choose_row(rows, ledger)
    truth = batch.get("truth") if isinstance(batch.get("truth"), dict) else {}
    base_truth = {
        "externalPublishing": False,
        "externalUpload": False,
        "externalSchedulesCreated": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
        "accountMutation": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
        "description": "One-short handoff over local shorts batch evidence. It does not approve, publish, upload, schedule, mutate source files, overwrite, delete, mutate accounts, or create receipt truth.",
    }
    base_truth.update({key: bool(value) for key, value in truth.items() if key in base_truth})
    base_truth["description"] = "One-short handoff over local shorts batch evidence. It does not approve, publish, upload, schedule, mutate source files, overwrite, delete, mutate accounts, or create receipt truth."

    if not row:
        return {
            "schema": "quipsly.studio.next-short-review-handoff.v1",
            "status": "studio-next-short-review-handoff-needs-batch",
            "generatedAt": utc_now(),
            "root": str(root),
            "sourceBatchPath": str(resolved_batch_path) if resolved_batch_path else "",
            "sourceLedgerPath": str(resolved_ledger_path) if resolved_ledger_path else "",
            "latestPointerPath": str(root / LATEST_POINTER),
            "latestLedgerPointerPath": str(root / LATEST_LEDGER_POINTER),
            "plainEnglish": "No shorts review rows were available. Build a shorts review batch first, then rerun this handoff.",
            "nextSafestAction": "Run ./script/agentctl.sh studio-next-shorts-review-batch and ./script/agentctl.sh studio-short-review-decision-ledger, then rerun this command.",
            "commands": {
                "buildBatch": "./script/agentctl.sh studio-next-shorts-review-batch --limit 12 --include-warnings",
                "buildDecisionLedger": "./script/agentctl.sh studio-short-review-decision-ledger",
            },
            "truth": base_truth,
        }

    short_id = str(row.get("id", ""))
    ledger_ids = {
        str(item.get("shortId"))
        for item in (ledger.get("items", []) if isinstance(ledger.get("items"), list) else [])
        if isinstance(item, dict) and item.get("shortId")
    }
    if short_id in ledger_ids:
        commands = decision_commands(short_id)
    else:
        commands = row.get("localReviewCommands") if isinstance(row.get("localReviewCommands"), dict) else {}
    return {
        "schema": "quipsly.studio.next-short-review-handoff.v1",
        "status": "studio-next-short-review-handoff-ready",
        "generatedAt": utc_now(),
        "root": str(root),
        "sourceBatchPath": str(resolved_batch_path) if resolved_batch_path else "",
        "sourceLedgerPath": str(resolved_ledger_path) if resolved_ledger_path else "",
        "latestPointerPath": str(root / LATEST_POINTER),
        "latestLedgerPointerPath": str(root / LATEST_LEDGER_POINTER),
        "sourceBatchGeneratedAt": batch.get("generatedAt", ""),
        "sourceBatchStatus": batch.get("status", ""),
        "sourceBatchHtmlPath": batch.get("htmlPath", "") or (pointer or {}).get("htmlPath", ""),
        "sourceBatchMarkdownPath": batch.get("markdownPath", "") or (pointer or {}).get("markdownPath", ""),
        "sourceBatchJsonPath": str(resolved_batch_path) if resolved_batch_path else "",
        "counts": batch.get("counts", {}),
        "plainEnglish": "This is the next local short to watch or inspect. It is a review handoff only, not publication approval.",
        "nextSafestAction": row.get("nextSafestAction") or "Open the local short with sound on, then record only local review intent.",
        "short": {
            "id": row.get("id", ""),
            "episode": row.get("episode", ""),
            "version": row.get("version", ""),
            "shortIndex": row.get("shortIndex", ""),
            "title": row.get("title", ""),
            "humanTitle": row.get("humanTitle", ""),
            "path": row.get("path", ""),
            "fileUri": row.get("fileUri", ""),
            "exists": bool(row.get("exists")),
            "bytes": row.get("bytes", 0),
            "durationSeconds": row.get("durationSeconds"),
            "durationLabel": row.get("durationLabel", ""),
            "hasAudio": bool(row.get("hasAudio")),
            "hasVideo": bool(row.get("hasVideo")),
            "codecSummary": row.get("codecSummary", []),
            "aspect": row.get("aspect", ""),
            "width": row.get("width", 0),
            "height": row.get("height", 0),
            "durationBucket": row.get("durationBucket", ""),
            "platformFit": row.get("platformFit", []),
            "reviewPriority": row.get("reviewPriority", 9999),
            "reviewPriorityReason": row.get("reviewPriorityReason", ""),
            "reviewSource": row.get("reviewSource", ""),
            "status": row.get("status", ""),
            "reviewRisk": row.get("reviewRisk", ""),
            "episodeWarning": bool(row.get("episodeWarning")),
            "episodeDurationAligned": bool(row.get("episodeDurationAligned")),
            "reviewPrompt": row.get("reviewPrompt", ""),
            "sourceKind": row.get("_sourceKind", ""),
        },
        "commands": {
            "openShort": row.get("openCommand", ""),
            "revealShort": row.get("revealCommand", ""),
            "openBatchHtml": f"open '{batch.get('htmlPath', '')}'" if batch.get("htmlPath") else "",
            "dryRunBatchIntent": row.get("dryRunCommand", ""),
            "dryRunKeep": commands.get("dryRunKeep", ""),
            "dryRunRefine": commands.get("dryRunRefine", ""),
            "dryRunHold": commands.get("dryRunHold", ""),
            "dryRunReject": commands.get("dryRunReject", ""),
            "recordKeep": commands.get("recordKeep", ""),
            "recordRefine": commands.get("recordRefine", ""),
            "recordHold": commands.get("recordHold", ""),
            "recordReject": commands.get("recordReject", ""),
            "recordNeedsMoreEvidence": commands.get("recordNeedsMoreEvidence", ""),
            "recordLocalIntentTemplate": commands.get("recordIntentTemplate") or commands.get("recordIntent", ""),
        },
        "noteTemplates": {
            "keep": row.get("keepNoteTemplate", ""),
            "refine": row.get("refineNoteTemplate", ""),
            "hold": row.get("holdNoteTemplate", ""),
            "reject": row.get("rejectNoteTemplate", ""),
        },
        "safety": row.get("localReviewCommandSafety", "Local review only. No publishing or source mutation."),
        "truth": base_truth,
    }


def render_markdown(payload: dict[str, Any]) -> str:
    short = payload.get("short") if isinstance(payload.get("short"), dict) else {}
    commands = payload.get("commands") if isinstance(payload.get("commands"), dict) else {}
    templates = payload.get("noteTemplates") if isinstance(payload.get("noteTemplates"), dict) else {}
    lines = [
        "# Studio next short review handoff",
        "",
        payload.get("plainEnglish", ""),
        "",
        f"Generated: `{payload.get('generatedAt', '')}`",
        f"Status: `{payload.get('status', '')}`",
        f"Source batch: `{payload.get('sourceBatchPath', '')}`",
        "",
        "## Start here",
        "",
    ]
    if payload.get("status") != "studio-next-short-review-handoff-ready":
        lines += [
            payload.get("nextSafestAction", ""),
            "",
            f"- Build batch: `{commands.get('buildBatch', '')}`",
            "",
        ]
    else:
        lines += [
            f"- Short: `{short.get('id', '')}`",
            f"- Title: {short.get('humanTitle') or short.get('title', '')}",
            f"- Episode/version: `{short.get('episode', '')}` / `{short.get('version', '')}`",
            f"- File: `{short.get('path', '')}`",
            f"- Duration: `{short.get('durationLabel', '')}`",
            f"- Shape: `{short.get('aspect', '')}` `{short.get('width', '')}x{short.get('height', '')}`",
            f"- Audio/video: `{short.get('hasAudio')}` / `{short.get('hasVideo')}`",
            f"- Status: `{short.get('status', '')}`",
            f"- Review risk: `{short.get('reviewRisk', '')}`",
            f"- Review priority: `{short.get('reviewPriority', '')}` {short.get('reviewPriorityReason', '')}",
            f"- Platform fit: {', '.join(short.get('platformFit') or []) or 'not listed'}",
            f"- Episode warning: `{short.get('episodeWarning')}`",
            f"- Source kind: `{short.get('sourceKind', '')}`",
            f"- Review source: `{short.get('reviewSource', '')}`",
            f"- Next safest action: {payload.get('nextSafestAction', '')}",
            "",
            "## Commands",
            "",
            f"- Open short: `{commands.get('openShort', '')}`",
            f"- Reveal short: `{commands.get('revealShort', '')}`",
            f"- Open batch HTML: `{commands.get('openBatchHtml', '')}`",
            f"- Dry-run batch intent: `{commands.get('dryRunBatchIntent', '')}`",
            f"- Dry-run keep: `{commands.get('dryRunKeep', '')}`",
            f"- Dry-run refine: `{commands.get('dryRunRefine', '')}`",
            f"- Dry-run hold: `{commands.get('dryRunHold', '')}`",
            f"- Dry-run reject: `{commands.get('dryRunReject', '')}`",
            f"- Record keep: `{commands.get('recordKeep', '')}`",
            f"- Record refine: `{commands.get('recordRefine', '')}`",
            f"- Record hold: `{commands.get('recordHold', '')}`",
            f"- Record reject: `{commands.get('recordReject', '')}`",
            f"- Record needs-more-evidence: `{commands.get('recordNeedsMoreEvidence', '')}`",
            f"- Template: `{commands.get('recordLocalIntentTemplate', '')}`",
            "",
            "## Review question",
            "",
            short.get("reviewPrompt", ""),
            "",
            "## Note templates",
            "",
            f"- Keep: `{templates.get('keep', '')}`",
            f"- Refine: `{templates.get('refine', '')}`",
            f"- Hold: `{templates.get('hold', '')}`",
            f"- Reject: `{templates.get('reject', '')}`",
            "",
        ]
    lines += [
        "## Safety boundary",
        "",
        "- Local review handoff only.",
        "- No external publishing.",
        "- No upload.",
        "- No schedule.",
        "- No approval.",
        "- No account mutation.",
        "- No source mutation.",
        "- No overwrite/delete.",
        "- No receipt truth without a real platform URL or provider id.",
        "",
    ]
    return "\n".join(lines)


def save_payload(payload: dict[str, Any], output_dir: Path, basename: str | None) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = basename or f"{stamp()}-next-short-review"
    json_path = output_dir / f"{stem}.json"
    markdown_path = output_dir / f"{stem}.md"
    write_json(json_path, payload)
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    return {"jsonPath": str(json_path), "markdownPath": str(markdown_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build one actionable Studio shorts review handoff.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--batch", default="", help="Path to a shorts-review-batch.json file.")
    parser.add_argument("--refresh-batch", action="store_true", help="Create a new local batch first if no latest pointer exists.")
    parser.add_argument("--limit", type=int, default=12, help="Batch limit when --refresh-batch is used.")
    parser.add_argument("--include-warnings", action="store_true", help="Include warning episodes when refreshing a batch.")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--basename", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--save", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    batch_path = Path(args.batch) if args.batch else None
    payload = build_payload(
        root=root,
        batch_path=batch_path,
        refresh=args.refresh_batch,
        limit=args.limit,
        include_warnings=args.include_warnings,
    )

    if args.save:
        output_dir = Path(args.output_dir) if args.output_dir else default_output_dir(root)
        paths = save_payload(payload, output_dir=output_dir, basename=args.basename or None)
        print(json.dumps({"status": payload.get("status"), **paths}, indent=2, sort_keys=True))
        return 0

    if args.json and not args.markdown:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
