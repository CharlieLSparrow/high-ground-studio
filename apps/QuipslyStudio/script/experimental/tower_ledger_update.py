#!/usr/bin/env python3
"""Safely update Quipsly Tower human-review and receipt ledger metadata.

This script mutates only Quipsly-owned ledger files under the release review
board. It never uploads, schedules, publishes, approves externally, deletes, or
touches media. Every update snapshots the previous ledger and appends an event.
"""

from __future__ import annotations

import argparse
import copy
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import build_human_review_ledger

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
REVIEW_DECISIONS = {"approve", "refine", "reject", "hold", "pending"}
RECEIPT_STATUSES = {"not_published", "receipt_captured", "published", "scheduled", "needs_verification"}
DIAGNOSTIC_HOLD_MARKERS = ("smoke", "diagnostic", "test hold", "command smoke")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def snapshot_ledger(ledger_path: Path) -> Path:
    version_dir = ledger_path.parent / "ledger-versions"
    version_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    snapshot = version_dir / f"human-review-ledger-before-{stamp}.json"
    counter = 2
    while snapshot.exists():
        snapshot = version_dir / f"human-review-ledger-before-{stamp}-{counter}.json"
        counter += 1
    shutil.copy2(ledger_path, snapshot)
    return snapshot


def append_event(root: Path, event: dict[str, Any]) -> Path:
    event_path = root / "review-board" / "tower-ledger-events.jsonl"
    with event_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, sort_keys=True) + "\n")
    return event_path


def ledger_paths(root: Path) -> tuple[Path, Path]:
    ledger_path = root / "review-board" / "human-review-ledger.json"
    markdown_path = root / "review-board" / "human-review-ledger.md"
    if not ledger_path.exists():
        raise SystemExit(f"Human review ledger not found: {ledger_path}. Run release-human-review-ledger first.")
    return ledger_path, markdown_path


def is_diagnostic_review_hold(artifact: dict[str, Any]) -> bool:
    decision = str(artifact.get("decision") or "pending").lower()
    if decision not in {"hold", "refine", "reject"}:
        return False
    reviewer = str(artifact.get("reviewer") or "").lower()
    notes = str(artifact.get("notes") or "").lower()
    if reviewer not in {"codex", "agent", "automation", "quipsly"}:
        return False
    return any(marker in notes for marker in DIAGNOSTIC_HOLD_MARKERS)


def find_episode(ledger: dict[str, Any], episode_number: int, version: str | None) -> dict[str, Any]:
    matches = [
        item for item in ledger.get("episodes") or []
        if isinstance(item, dict) and int(item.get("episode") or 0) == episode_number
    ]
    if version:
        matches = [item for item in matches if str(item.get("version") or "") == version]
    if not matches:
        suffix = f" version {version}" if version else ""
        raise SystemExit(f"Episode {episode_number}{suffix} not found in human review ledger.")
    return matches[0]


def recompute_episode_summary(episode: dict[str, Any]) -> None:
    review_artifacts = episode.get("reviewArtifacts") or []
    receipt_slots = episode.get("receiptSlots") or []
    diagnostic_hold_count = sum(1 for item in review_artifacts if is_diagnostic_review_hold(item))
    has_blocking = any(
        item.get("decision") in {"reject", "refine", "hold"} and not is_diagnostic_review_hold(item)
        for item in review_artifacts
    )
    all_approved = bool(review_artifacts) and all(item.get("decision") == "approve" for item in review_artifacts)
    any_receipts = any(item.get("url") or item.get("providerId") for item in receipt_slots)
    pending = sum(1 for item in review_artifacts if item.get("decision") == "pending")
    receipt_count = sum(1 for item in receipt_slots if item.get("url") or item.get("providerId"))
    episode["reviewSummary"] = {
        "allArtifactsApproved": all_approved,
        "hasBlockingReviewDecision": has_blocking,
        "diagnosticReviewHoldCount": diagnostic_hold_count,
        "hasAnyPublicationReceipt": any_receipts,
        "pendingReviewCount": pending,
        "receiptCount": receipt_count,
    }
    if has_blocking:
        episode["status"] = "review-needs-work"
    elif diagnostic_hold_count:
        episode["status"] = "diagnostic-review-hold"
    elif all_approved and receipt_count:
        episode["status"] = "published-receipts-captured"
    elif all_approved:
        episode["status"] = "approved-not-published"
    else:
        episode["status"] = "pending-human-review"


def persist_ledger(root: Path, ledger_path: Path, markdown_path: Path, ledger: dict[str, Any]) -> None:
    ledger["updatedAt"] = iso_now()
    write_json(ledger_path, ledger)
    markdown_path.write_text(build_human_review_ledger.render_markdown(ledger), encoding="utf-8")


def apply_review_decision(args: argparse.Namespace) -> dict[str, Any]:
    root = args.root.expanduser().resolve()
    ledger_path, markdown_path = ledger_paths(root)
    ledger = load_json(ledger_path)
    decision = args.decision.strip().lower()
    if decision not in REVIEW_DECISIONS:
        raise SystemExit(f"Decision must be one of {sorted(REVIEW_DECISIONS)}")
    episode = find_episode(ledger, args.episode, args.version)
    artifacts = episode.get("reviewArtifacts") or []
    artifact = next((item for item in artifacts if item.get("id") == args.artifact_id), None)
    if not artifact:
        valid = ", ".join(str(item.get("id")) for item in artifacts)
        raise SystemExit(f"Artifact id not found: {args.artifact_id}. Valid ids: {valid}")

    before = dict(artifact)
    if args.dry_run:
        episode_preview = copy.deepcopy(episode)
        preview_artifacts = episode_preview.get("reviewArtifacts") or []
        preview_artifact = next((item for item in preview_artifacts if item.get("id") == args.artifact_id), None)
        if not preview_artifact:
            raise SystemExit(f"Artifact id not found in dry-run preview: {args.artifact_id}")
        reviewed_at = iso_now()
        preview_artifact["decision"] = decision
        preview_artifact["status"] = "pending-review" if decision == "pending" else "reviewed"
        preview_artifact["reviewer"] = args.reviewer
        preview_artifact["reviewedAt"] = reviewed_at
        preview_artifact["notes"] = args.notes
        recompute_episode_summary(episode_preview)
        return {
            "ok": True,
            "dryRun": True,
            "kind": "review-decision",
            "ledgerPath": str(ledger_path),
            "markdownPath": str(markdown_path),
            "eventLogPath": str(root / "review-board" / "tower-ledger-events.jsonl"),
            "snapshotPath": "",
            "snapshotCreated": False,
            "ledgerMutated": False,
            "eventAppended": False,
            "episode": args.episode,
            "version": episode.get("version") or "",
            "artifactId": args.artifact_id,
            "decision": decision,
            "before": before,
            "afterPreview": dict(preview_artifact),
            "episodeStatusBefore": episode.get("status"),
            "episodeStatusAfterPreview": episode_preview.get("status"),
            "externalActionTaken": False,
            "mediaMutated": False,
            "truth": "Dry-run only. No ledger file, event log, snapshot, media, account, platform, or publication state was changed.",
        }
    snapshot = snapshot_ledger(ledger_path)
    artifact["decision"] = decision
    artifact["status"] = "pending-review" if decision == "pending" else "reviewed"
    artifact["reviewer"] = args.reviewer
    artifact["reviewedAt"] = iso_now()
    artifact["notes"] = args.notes
    recompute_episode_summary(episode)
    ledger["lastTowerLedgerUpdate"] = {
        "kind": "review-decision",
        "episode": args.episode,
        "version": episode.get("version") or "",
        "artifactId": args.artifact_id,
        "decision": decision,
        "actor": args.reviewer,
        "updatedAt": artifact["reviewedAt"],
    }
    persist_ledger(root, ledger_path, markdown_path, ledger)
    event = {
        "schema": "quipsly.tower.ledger-event.v1",
        "createdAt": iso_now(),
        "kind": "review-decision",
        "episode": args.episode,
        "version": episode.get("version") or "",
        "artifactId": args.artifact_id,
        "actor": args.reviewer,
        "before": before,
        "after": artifact,
        "snapshotPath": str(snapshot),
        "externalActionTaken": False,
        "mediaMutated": False,
    }
    event_path = append_event(root, event)
    return {
        "ok": True,
        "dryRun": False,
        "kind": "review-decision",
        "ledgerPath": str(ledger_path),
        "markdownPath": str(markdown_path),
        "eventLogPath": str(event_path),
        "snapshotPath": str(snapshot),
        "snapshotCreated": True,
        "ledgerMutated": True,
        "eventAppended": True,
        "episode": args.episode,
        "version": episode.get("version") or "",
        "artifactId": args.artifact_id,
        "decision": decision,
        "episodeStatus": episode.get("status"),
        "externalActionTaken": False,
        "mediaMutated": False,
    }


def apply_receipt(args: argparse.Namespace) -> dict[str, Any]:
    root = args.root.expanduser().resolve()
    ledger_path, markdown_path = ledger_paths(root)
    ledger = load_json(ledger_path)
    if not args.url and not args.provider_id:
        raise SystemExit("Receipt capture requires a real URL and/or provider id. Empty receipts must stay not_published.")
    status = args.status.strip().lower()
    if status not in RECEIPT_STATUSES:
        raise SystemExit(f"Receipt status must be one of {sorted(RECEIPT_STATUSES)}")
    if status == "not_published":
        raise SystemExit("Use receipt_captured, published, scheduled, or needs_verification when recording a non-empty receipt.")
    episode = find_episode(ledger, args.episode, args.version)
    slots = episode.get("receiptSlots") or []
    slot = next((item for item in slots if item.get("platform") == args.platform), None)
    if not slot:
        valid = ", ".join(str(item.get("platform")) for item in slots)
        raise SystemExit(f"Platform not found: {args.platform}. Valid platforms: {valid}")

    before = dict(slot)
    if args.dry_run:
        episode_preview = copy.deepcopy(episode)
        preview_slots = episode_preview.get("receiptSlots") or []
        preview_slot = next((item for item in preview_slots if item.get("platform") == args.platform), None)
        if not preview_slot:
            raise SystemExit(f"Platform not found in dry-run preview: {args.platform}")
        captured_at = iso_now()
        preview_slot["status"] = status
        preview_slot["url"] = args.url
        preview_slot["providerId"] = args.provider_id
        preview_slot["postedAt"] = args.posted_at or captured_at
        preview_slot["capturedBy"] = args.captured_by
        preview_slot["notes"] = args.notes
        preview_slot["capturedAt"] = captured_at
        preview_slot["truth"] = "Receipt would be recorded locally after an external platform produced a URL or provider proof. This dry-run did not publish or record."
        recompute_episode_summary(episode_preview)
        return {
            "ok": True,
            "dryRun": True,
            "kind": "receipt",
            "ledgerPath": str(ledger_path),
            "markdownPath": str(markdown_path),
            "eventLogPath": str(root / "review-board" / "tower-ledger-events.jsonl"),
            "snapshotPath": "",
            "snapshotCreated": False,
            "ledgerMutated": False,
            "eventAppended": False,
            "episode": args.episode,
            "version": episode.get("version") or "",
            "platform": args.platform,
            "status": status,
            "before": before,
            "afterPreview": dict(preview_slot),
            "episodeStatusBefore": episode.get("status"),
            "episodeStatusAfterPreview": episode_preview.get("status"),
            "externalActionTaken": False,
            "mediaMutated": False,
            "receiptRecordedOnly": False,
            "truth": "Dry-run only. No receipt, ledger file, event log, snapshot, media, account, platform, or publication state was changed.",
        }
    snapshot = snapshot_ledger(ledger_path)
    slot["status"] = status
    slot["url"] = args.url
    slot["providerId"] = args.provider_id
    slot["postedAt"] = args.posted_at or iso_now()
    slot["capturedBy"] = args.captured_by
    slot["notes"] = args.notes
    slot["capturedAt"] = iso_now()
    slot["truth"] = "Receipt was recorded locally after an external platform produced a URL or provider proof. This command did not publish."
    recompute_episode_summary(episode)
    ledger["lastTowerLedgerUpdate"] = {
        "kind": "receipt",
        "episode": args.episode,
        "version": episode.get("version") or "",
        "platform": args.platform,
        "status": status,
        "actor": args.captured_by,
        "updatedAt": slot["capturedAt"],
    }
    persist_ledger(root, ledger_path, markdown_path, ledger)
    event = {
        "schema": "quipsly.tower.ledger-event.v1",
        "createdAt": iso_now(),
        "kind": "receipt",
        "episode": args.episode,
        "version": episode.get("version") or "",
        "platform": args.platform,
        "actor": args.captured_by,
        "before": before,
        "after": slot,
        "snapshotPath": str(snapshot),
        "externalActionTaken": False,
        "mediaMutated": False,
        "receiptRecordedOnly": True,
    }
    event_path = append_event(root, event)
    return {
        "ok": True,
        "dryRun": False,
        "kind": "receipt",
        "ledgerPath": str(ledger_path),
        "markdownPath": str(markdown_path),
        "eventLogPath": str(event_path),
        "snapshotPath": str(snapshot),
        "snapshotCreated": True,
        "ledgerMutated": True,
        "eventAppended": True,
        "episode": args.episode,
        "version": episode.get("version") or "",
        "platform": args.platform,
        "status": status,
        "episodeStatus": episode.get("status"),
        "externalActionTaken": False,
        "mediaMutated": False,
        "receiptRecordedOnly": True,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Safely update Quipsly Tower review/receipt ledger metadata.")
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    subparsers = parser.add_subparsers(dest="command", required=True)

    review = subparsers.add_parser("review-decision", help="Record a local artifact review decision.")
    review.add_argument("episode", type=int)
    review.add_argument("artifact_id")
    review.add_argument("decision")
    review.add_argument("reviewer")
    review.add_argument("notes", nargs="?", default="")
    review.add_argument("--version")
    review.add_argument("--dry-run", action="store_true", help="Preview the local ledger change without writing files.")
    review.set_defaults(func=apply_review_decision)

    receipt = subparsers.add_parser("receipt", help="Record a real external receipt URL/provider id after manual publication.")
    receipt.add_argument("episode", type=int)
    receipt.add_argument("platform")
    receipt.add_argument("url")
    receipt.add_argument("provider_id", nargs="?", default="")
    receipt.add_argument("posted_at", nargs="?", default="")
    receipt.add_argument("captured_by", nargs="?", default="codex")
    receipt.add_argument("notes", nargs="?", default="")
    receipt.add_argument("--status", default="receipt_captured")
    receipt.add_argument("--version")
    receipt.add_argument("--dry-run", action="store_true", help="Preview the local receipt change without writing files.")
    receipt.set_defaults(func=apply_receipt)

    args = parser.parse_args()
    result = args.func(args)
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
