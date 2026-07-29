#!/usr/bin/env python3
"""Preflight, dry-run, or record local short review intent from an evidence draft.

Default behavior is preflight: explain what would happen without invoking the
ledger. Dry-run invokes the ledger in dry-run mode. Recording local intent
requires `--record`, and the evidence draft must be specific enough for recorded
intent unless `--force` is provided. This does not publish, approve, upload,
schedule, or create receipt truth.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LEDGER_SCRIPT = ROOT / "script" / "experimental" / "build_studio_short_review_decision_ledger.py"
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_JSON = (
    DEFAULT_RELEASE_ROOT
    / "shorts-command-room"
    / "recommended-review-packets"
    / "evidence-draft-index"
    / "quipsly-studio-short-evidence-draft-index.json"
)
OUTCOMES = {"keep", "refine", "hold", "reject", "needs-more-evidence"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"JSON not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def select_from_index(index: dict[str, Any], short_id: str, draft_id: str) -> dict[str, Any]:
    rows = index.get("drafts", []) if draft_id else index.get("latestByShort", [])
    rows = [row for row in rows if isinstance(row, dict)]
    if draft_id:
        selected = next((row for row in rows if str(row.get("draftId")) == draft_id), None)
        if selected:
            return selected
        raise SystemExit(f"Draft id not found in index: {draft_id}")
    if short_id:
        matches = [row for row in rows if str(row.get("shortId")) == short_id]
        if not matches:
            raise SystemExit(f"Short id not found in index: {short_id}")
        return sorted(matches, key=lambda row: str(row.get("generatedAt") or row.get("draftId") or ""), reverse=True)[0]
    pending = [
        row
        for row in rows
        if row.get("ledgerDecision") == "pending" and bool(row.get("specificEnoughForRecordedIntent"))
    ]
    if pending:
        return sorted(pending, key=lambda row: str(row.get("generatedAt") or row.get("draftId") or ""), reverse=True)[0]
    if rows:
        return sorted(rows, key=lambda row: str(row.get("generatedAt") or row.get("draftId") or ""), reverse=True)[0]
    raise SystemExit("Evidence-draft index has no drafts.")


def load_draft(args: argparse.Namespace) -> tuple[dict[str, Any], Path]:
    if args.draft:
        path = Path(args.draft).expanduser()
        return read_json(path), path
    index_path = Path(args.index).expanduser()
    index = read_json(index_path)
    row = select_from_index(index, args.short_id, args.draft_id)
    path = Path(str(row.get("jsonPath") or ""))
    if not str(path):
        raise SystemExit("Selected evidence draft does not include jsonPath.")
    return read_json(path), path


def evidence_note(draft: dict[str, Any]) -> str:
    parts: list[str] = []
    summary = str(draft.get("summary") or "").strip()
    if summary:
        parts.append(summary)
    for row in draft.get("dimensionEvidence", []):
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "").strip()
        note = str(row.get("note") or "").strip()
        if key and note:
            parts.append(f"{key}: {note}")
    confidence = str(draft.get("confidence") or "").strip()
    if confidence:
        parts.append(f"confidence: {confidence}")
    return " | ".join(parts) or "Evidence draft had no notes; review before recording local intent."


def selected_short_id(draft: dict[str, Any]) -> str:
    selected = draft.get("selected") if isinstance(draft.get("selected"), dict) else {}
    short_id = str(selected.get("shortId") or "").strip()
    if not short_id:
        raise SystemExit("Evidence draft is missing selected.shortId.")
    return short_id


def draft_specificity(draft: dict[str, Any]) -> dict[str, Any]:
    specificity = draft.get("specificity") if isinstance(draft.get("specificity"), dict) else {}
    return {
        "specificEnoughForDryRun": bool(specificity.get("specificEnoughForDryRun")),
        "specificEnoughForRecordedIntent": bool(specificity.get("specificEnoughForRecordedIntent")),
        "filledDimensionCount": specificity.get("filledDimensionCount") or 0,
        "totalEvidenceWords": specificity.get("totalEvidenceWords") or 0,
        "note": specificity.get("note") or "",
    }


def ledger_command(short_id: str, outcome: str, reviewer: str, note: str, release_root: Path, *, record: bool) -> list[str]:
    command = [
        "python3",
        str(LEDGER_SCRIPT),
        "record",
        short_id,
        outcome,
        reviewer,
        note,
    ]
    if not record:
        command.append("--dry-run")
    command.extend(["--root", str(release_root)])
    return command


def run_ledger(short_id: str, outcome: str, reviewer: str, note: str, release_root: Path, *, record: bool) -> dict[str, Any]:
    command = ledger_command(short_id, outcome, reviewer, note, release_root, record=record)
    completed = subprocess.run(command, cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        return {
            "ok": False,
            "returnCode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "command": command,
        }
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        payload = {"rawStdout": completed.stdout}
    payload["ok"] = bool(payload.get("ok", True))
    payload["command"] = command
    return payload


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    draft, draft_path = load_draft(args)
    short_id = selected_short_id(draft)
    outcome = (args.outcome or str(draft.get("outcome") or "needs-more-evidence")).strip().lower()
    if outcome not in OUTCOMES:
        raise SystemExit(f"Outcome must be one of {sorted(OUTCOMES)}")
    reviewer = args.reviewer or str(draft.get("reviewer") or "Codex")
    note = args.note.strip() if args.note else evidence_note(draft)
    specificity = draft_specificity(draft)
    record = bool(args.record)
    dry_run = bool(args.dry_run)
    if record and not specificity["specificEnoughForRecordedIntent"] and not args.force:
        raise SystemExit("Refusing to record local intent: evidence draft is not specific enough. Use --force only with deliberate human/agent approval.")
    release_root = Path(args.release_root).expanduser()
    if args.preflight and (dry_run or record):
        raise SystemExit("Choose only one mode: --preflight, --dry-run, or --record.")
    if dry_run and record:
        raise SystemExit("Choose only one mode: --dry-run or --record.")
    mode = "record-local-intent" if record else ("ledger-dry-run" if dry_run else "preflight-only")
    command = ledger_command(short_id, outcome, reviewer, note, release_root, record=record)
    result = (
        run_ledger(short_id, outcome, reviewer, note, release_root, record=record)
        if dry_run or record
        else {
            "ok": True,
            "preflightOnly": True,
            "dryRun": False,
            "ledgerMutated": False,
            "eventAppended": False,
            "externalActionTaken": False,
            "mediaMutated": False,
            "receiptTruthCreated": False,
            "commandPreview": command,
            "truth": "Preflight only. Ledger command was not executed.",
        }
    )
    return {
        "schema": "quipsly.studio.short-evidence-draft-record.v1",
        "generatedAt": iso_now(),
        "mode": mode,
        "recordRequested": record,
        "dryRunRequested": dry_run,
        "preflightRequested": not dry_run and not record,
        "force": bool(args.force),
        "draftPath": str(draft_path),
        "draftId": draft.get("draftId") or draft_path.parent.name,
        "shortId": short_id,
        "outcome": outcome,
        "reviewer": reviewer,
        "specificity": specificity,
        "note": note,
        "mutationContract": {
            "preflightOnly": not dry_run and not record,
            "ledgerCommandWillRun": dry_run or record,
            "ledgerMutationRequested": record,
            "requiresRecordFlagForMutation": True,
            "requiresSpecificEvidenceUnlessForced": True,
            "mutatesOnlyLocalShortReviewDecisionLedger": record,
            "externalPublishing": False,
            "externalUpload": False,
            "externalScheduleCreated": False,
            "approvalCreated": False,
            "accountMutation": False,
            "mediaMutation": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
            "receiptTruthCreated": False,
        },
        "commandPreview": {
            "argv": command,
            "cwd": str(ROOT),
            "humanReadable": " ".join(command),
        },
        "ledgerResult": result,
        "nextSafestAction": (
            "Inspect this preflight. If the mutation contract is right, rerun with --dry-run before considering --record."
            if not dry_run and not record
            else ("Inspect the dry-run result before recording local intent." if not record else "Inspect the recorded ledger state and update review boards if needed.")
        ),
        "truth": "Local short review intent helper. Preflight mode runs no ledger command. Dry-run mode mutates nothing. Record mode mutates only the local short review decision ledger; it still does not approve, publish, upload, schedule, mutate accounts, mutate media, overwrite exports, delete files, or create receipt truth.",
        "truthFlags": {
            "externalPublishing": False,
            "externalUpload": False,
            "externalScheduleCreated": False,
            "approvalCreated": False,
            "accountMutation": False,
            "mediaMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
            "receiptTruthCreated": False,
            "decisionLedgerMutationRequested": record,
        },
    }


def render_markdown(payload: dict[str, Any]) -> str:
    result = payload.get("ledgerResult", {}) if isinstance(payload.get("ledgerResult"), dict) else {}
    lines = [
        "# Short evidence draft record helper",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Mode: `{payload.get('mode')}`",
        "",
        f"- Draft: `{payload.get('draftId')}`",
        f"- Short: `{payload.get('shortId')}`",
        f"- Outcome: `{payload.get('outcome')}`",
        f"- Reviewer: `{payload.get('reviewer')}`",
        f"- Specific enough for recorded intent: `{payload.get('specificity', {}).get('specificEnoughForRecordedIntent')}`",
        f"- Ledger result ok: `{result.get('ok')}`",
        f"- Ledger mutated: `{result.get('ledgerMutated', payload.get('recordRequested'))}`",
        f"- Ledger command will run: `{payload.get('mutationContract', {}).get('ledgerCommandWillRun')}`",
        f"- Ledger mutation requested: `{payload.get('mutationContract', {}).get('ledgerMutationRequested')}`",
        f"- External action: `{result.get('externalActionTaken', False)}`",
        "",
        "## Note",
        "",
        payload.get("note", ""),
        "",
        "## Next safest action",
        "",
        payload.get("nextSafestAction", ""),
        "",
        "## Command preview",
        "",
        f"`{payload.get('commandPreview', {}).get('humanReadable')}`",
        "",
        "## Truth boundary",
        "",
        payload.get("truth", ""),
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Preflight, dry-run, or record local short review intent from an evidence draft.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX_JSON), help="Evidence-draft index JSON.")
    parser.add_argument("--draft", default="", help="Specific evidence draft JSON.")
    parser.add_argument("--draft-id", default="", help="Draft id to select from the index.")
    parser.add_argument("--short-id", default="", help="Latest draft for a short id.")
    parser.add_argument("--outcome", default="", help="Override draft outcome.")
    parser.add_argument("--reviewer", default="", help="Override draft reviewer.")
    parser.add_argument("--note", default="", help="Override generated evidence note.")
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT), help="Episode export/review root.")
    parser.add_argument("--preflight", action="store_true", help="Explain what would happen without invoking the ledger. This is the default.")
    parser.add_argument("--dry-run", action="store_true", help="Invoke the ledger in dry-run mode without mutating it.")
    parser.add_argument("--record", action="store_true", help="Record local review intent. Requires explicit flag and sufficiently specific evidence.")
    parser.add_argument("--force", action="store_true", help="Allow --record even if evidence is not specific enough.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    payload = build_payload(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
