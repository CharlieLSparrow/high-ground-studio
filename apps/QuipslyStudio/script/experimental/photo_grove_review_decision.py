#!/usr/bin/env python3
"""Apply safe Photo Grove review decisions to a ledger.

This mutates only Quipsly-owned review metadata. Before updating the current
ledger, it snapshots the previous ledger into `ledger-versions/` and appends an
event to `review-events.jsonl`.
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-review.json")
VALID_STATUSES = {"pending", "keep", "reject", "review", "favorite"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower() or "decision"


def resolve_session(value: str | None) -> Path:
    if value and value != "latest":
        path = Path(value).expanduser()
        if path.is_file():
            return path.parent
        return path
    pointer = load_json(DEFAULT_POINTER)
    latest = pointer.get("latestSessionDir")
    if not latest:
        raise SystemExit(f"No latest Photo Grove session pointer found at {DEFAULT_POINTER}")
    return Path(str(latest))


def normalize_tags(tags_value: str) -> list[str]:
    tags = []
    for raw in tags_value.split(","):
        tag = raw.strip().lower().replace(" ", "-")
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def normalize_rating(value: str) -> int | None:
    if not value or value in {"-", "none", "null"}:
        return None
    try:
        rating = int(value)
    except ValueError as exc:
        raise SystemExit(f"Rating must be 1-5 or '-': {value}") from exc
    if rating < 1 or rating > 5:
        raise SystemExit(f"Rating must be 1-5 or '-': {value}")
    return rating


def snapshot_ledger(ledger_path: Path) -> Path:
    version_dir = ledger_path.parent / "ledger-versions"
    version_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    snapshot = version_dir / f"review-ledger-before-{stamp}.json"
    counter = 2
    while snapshot.exists():
        snapshot = version_dir / f"review-ledger-before-{stamp}-{counter}.json"
        counter += 1
    shutil.copy2(ledger_path, snapshot)
    return snapshot


def write_markdown(session_dir: Path, ledger: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove review ledger",
        "",
        f"Updated: {ledger.get('updatedAt') or ledger.get('generatedAt') or iso_now()}",
        "",
        "Originals are untouched. Decisions below are Quipsly metadata.",
        "",
        "| File | Status | Rating | Tags | Flags | Note |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]
    for decision in ledger.get("decisions") or []:
        flags = ", ".join(decision.get("flags") or []) or "none"
        tags = ", ".join(decision.get("tags") or []) or "-"
        rating = decision.get("rating") if decision.get("rating") is not None else "-"
        note = str(decision.get("note") or "").replace("|", "\\|")
        lines.append(
            f"| `{decision.get('filename')}` | {decision.get('status')} | {rating} | {tags} | {flags} | {note} |"
        )
    (session_dir / "review-ledger.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def append_event(session_dir: Path, event: dict[str, Any]) -> None:
    with (session_dir / "review-events.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")


def receipt_projection(decision: dict[str, Any]) -> dict[str, Any]:
    return {
        "photoId": decision.get("id") or decision.get("photoId") or "",
        "filename": decision.get("filename") or "",
        "sourcePath": decision.get("sourcePath") or "",
        "reviewGroupId": decision.get("reviewGroupId") or "",
        "reviewGroupPosition": decision.get("reviewGroupPosition"),
        "reviewGroupSize": decision.get("reviewGroupSize"),
        "status": decision.get("status"),
        "rating": decision.get("rating"),
        "tags": list(decision.get("tags") or []),
        "flags": list(decision.get("flags") or []),
        "note": decision.get("note") or "",
        "updatedAt": decision.get("updatedAt") or "",
        "updatedBy": decision.get("updatedBy") or "",
    }


def write_decision_receipts(session_dir: Path, event: dict[str, Any]) -> dict[str, str]:
    receipt_dir = session_dir / "decision-receipts"
    receipt_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    subject = event.get("reviewGroupId") or event.get("photoId") or event.get("filename") or "decision"
    status = ""
    after = event.get("after") if isinstance(event.get("after"), list) else []
    if after and isinstance(after[0], dict):
        status = str(after[0].get("status") or "")
    base = receipt_dir / f"{stamp}-{safe_slug(str(subject))}-{safe_slug(status)}"
    json_path = base.with_suffix(".json")
    markdown_path = base.with_suffix(".md")
    counter = 2
    while json_path.exists() or markdown_path.exists():
        candidate = receipt_dir / f"{stamp}-{safe_slug(str(subject))}-{safe_slug(status)}-{counter}"
        json_path = candidate.with_suffix(".json")
        markdown_path = candidate.with_suffix(".md")
        counter += 1

    receipt = {
        "schema": "quipsly.photo-grove.decision-receipt.v1",
        "createdAt": event.get("createdAt") or iso_now(),
        "actor": event.get("actor") or "",
        "subject": subject,
        "status": status,
        "updatedCount": event.get("updatedCount") or 0,
        "reviewGroupId": event.get("reviewGroupId") or "",
        "snapshotPath": event.get("snapshotPath") or "",
        "eventLogPath": str(session_dir / "review-events.jsonl"),
        "ledgerPath": str(session_dir / "review-ledger.json"),
        "before": event.get("before") or [],
        "after": event.get("after") or [],
        "truth": "Photo Grove decision receipt only. It records Quipsly metadata changes; original photo files are untouched.",
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }
    write_json(json_path, receipt)

    lines = [
        "# Photo Grove decision receipt",
        "",
        f"Created: `{receipt['createdAt']}`",
        f"Actor: `{receipt['actor']}`",
        f"Subject: `{receipt['subject']}`",
        f"Status: `{receipt['status']}`",
        f"Updated photos: `{receipt['updatedCount']}`",
        "",
        receipt["truth"],
        "",
        f"Snapshot before change: `{receipt['snapshotPath']}`",
        f"Ledger: `{receipt['ledgerPath']}`",
        f"Event log: `{receipt['eventLogPath']}`",
        "",
        "## Updated photos",
        "",
        "| File | Status | Rating | Tags | Source | Note |",
        "| --- | --- | ---: | --- | --- | --- |",
    ]
    for row in receipt.get("after") or []:
        tags = ", ".join(row.get("tags") or []) or "-"
        rating = row.get("rating") if row.get("rating") is not None else "-"
        source = row.get("sourcePath") or ""
        note = str(row.get("note") or "").replace("|", "\\|")
        lines.append(
            f"| `{row.get('filename')}` | {row.get('status')} | {rating} | {tags} | `{source}` | {note} |"
        )
    lines.extend([
        "",
        "## Boundary",
        "",
        "- Originals mutated: `false`",
        "- Client delivery created: `false`",
        "- External publishing: `false`",
    ])
    markdown_path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    return {"decisionReceiptJson": str(json_path), "decisionReceiptMarkdown": str(markdown_path)}


def apply_decision(args: argparse.Namespace) -> dict[str, Any]:
    session_dir = resolve_session(args.session)
    ledger_path = session_dir / "review-ledger.json"
    if not ledger_path.exists():
        raise SystemExit(f"Photo Grove review ledger not found: {ledger_path}")
    ledger = load_json(ledger_path)
    decisions = ledger.get("decisions")
    if not isinstance(decisions, list):
        raise SystemExit(f"Invalid Photo Grove ledger decisions shape: {ledger_path}")
    status = args.status.lower()
    if status not in VALID_STATUSES:
        raise SystemExit(f"Status must be one of {sorted(VALID_STATUSES)}")
    rating = normalize_rating(args.rating)
    tags = normalize_tags(args.tags)
    if args.group:
        matched_decisions = [decision for decision in decisions if decision.get("reviewGroupId") == args.photo_id]
        if not matched_decisions:
            raise SystemExit(f"Review group id not found in ledger: {args.photo_id}")
    else:
        matched_decisions = [
            decision
            for decision in decisions
            if decision.get("id") == args.photo_id or decision.get("filename") == args.photo_id
        ][:1]
        if not matched_decisions:
            raise SystemExit(f"Photo id or filename not found in ledger: {args.photo_id}")

    before = [
        {
            **receipt_projection(decision),
        }
        for decision in matched_decisions
    ]
    if args.dry_run:
        after_preview = []
        for matched in matched_decisions:
            preview = receipt_projection(matched)
            preview["status"] = status
            preview["rating"] = rating
            if tags:
                preview["tags"] = sorted(set([*(matched.get("tags") or []), *tags]))
            preview["note"] = args.note
            preview["updatedAt"] = iso_now()
            preview["updatedBy"] = args.actor
            after_preview.append(preview)
        return {
            "ok": True,
            "dryRun": True,
            "sessionDir": str(session_dir),
            "ledgerPath": str(ledger_path),
            "photoId": matched_decisions[0].get("id"),
            "filename": matched_decisions[0].get("filename"),
            "reviewGroupId": args.photo_id if args.group else matched_decisions[0].get("reviewGroupId") or "",
            "wouldUpdateCount": len(matched_decisions),
            "status": status,
            "rating": rating,
            "tags": tags,
            "before": before,
            "afterPreview": after_preview,
            "truth": "Dry-run only. This previews Quipsly review metadata changes and does not write the ledger, append events, create receipts, copy files, or touch originals.",
            "originalsMutated": False,
            "ledgerMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
        }
    snapshot = snapshot_ledger(ledger_path)
    updated_at = iso_now()
    for matched in matched_decisions:
        matched["status"] = status
        matched["rating"] = rating
        if tags:
            matched["tags"] = sorted(set([*(matched.get("tags") or []), *tags]))
        matched["note"] = args.note
        matched["updatedAt"] = updated_at
        matched["updatedBy"] = args.actor
    ledger["updatedAt"] = iso_now()
    ledger["lastDecision"] = {
        "photoId": matched_decisions[0].get("id"),
        "filename": matched_decisions[0].get("filename"),
        "reviewGroupId": args.photo_id if args.group else matched_decisions[0].get("reviewGroupId") or "",
        "updatedCount": len(matched_decisions),
        "status": status,
        "actor": args.actor,
        "updatedAt": updated_at,
    }
    counts = {
        "pending": 0,
        "keep": 0,
        "reject": 0,
        "review": 0,
        "favorite": 0,
        "rated": 0,
    }
    for decision in decisions:
        state = decision.get("status")
        if state in counts:
            counts[state] += 1
        if decision.get("rating") is not None:
            counts["rated"] += 1
    ledger["counts"] = {**(ledger.get("counts") or {}), **counts, "originalsMutated": False}
    write_json(ledger_path, ledger)
    write_markdown(session_dir, ledger)
    event = {
        "schema": "quipsly.photo-grove.review-event.v1",
        "createdAt": iso_now(),
        "actor": args.actor,
        "photoId": matched_decisions[0].get("id"),
        "filename": matched_decisions[0].get("filename"),
        "reviewGroupId": args.photo_id if args.group else matched_decisions[0].get("reviewGroupId") or "",
        "updatedCount": len(matched_decisions),
        "before": before,
        "after": [
            receipt_projection(decision)
            for decision in matched_decisions
        ],
        "snapshotPath": str(snapshot),
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
    }
    append_event(session_dir, event)
    receipt_paths = write_decision_receipts(session_dir, event)
    try:
        import photo_grove_review_status

        photo_grove_review_status.build_status(session_dir)
    except Exception:
        pass
    export_prep_path = ""
    try:
        import photo_grove_export_packet

        export_packet = photo_grove_export_packet.build_export_packet(session_dir)
        export_prep_path = str(export_packet.get("markdownPath") or "")
    except Exception:
        pass
    return {
        "ok": True,
        "dryRun": False,
        "sessionDir": str(session_dir),
        "ledgerPath": str(ledger_path),
        "eventLogPath": str(session_dir / "review-events.jsonl"),
        **receipt_paths,
        "exportPrepPath": export_prep_path,
        "snapshotPath": str(snapshot),
        "photoId": matched_decisions[0].get("id"),
        "filename": matched_decisions[0].get("filename"),
        "reviewGroupId": args.photo_id if args.group else matched_decisions[0].get("reviewGroupId") or "",
        "updatedCount": len(matched_decisions),
        "status": status,
        "rating": rating,
        "tags": matched_decisions[0].get("tags") or [],
        "originalsMutated": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Apply a safe Photo Grove review decision.")
    parser.add_argument("photo_id", help="Photo id or filename from review-ledger.json.")
    parser.add_argument("status", help="pending, keep, reject, review, or favorite.")
    parser.add_argument("rating", nargs="?", default="-", help="1-5 or '-'")
    parser.add_argument("tags", nargs="?", default="", help="Comma-separated tags to add.")
    parser.add_argument("actor", nargs="?", default="codex", help="Actor label.")
    parser.add_argument("note", nargs="?", default="", help="Decision note.")
    parser.add_argument("--group", action="store_true", help="Treat photo_id as a reviewGroupId and update every photo in that group.")
    parser.add_argument("--session", default="latest", help="Session dir, ledger path, or 'latest'.")
    parser.add_argument("--dry-run", action="store_true", help="Preview the metadata decision without writing the ledger, event log, receipts, or derived packets.")
    result = apply_decision(parser.parse_args())
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
