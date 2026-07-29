#!/usr/bin/env python3
"""Record one reviewed Cut Rhythm finding inside a packet ledger.

This mutates only the packet's REVIEW_LEDGER_TEMPLATE.json review evidence.
It does not edit, approve, export, publish, delete, or mutate source media.
Before writing, it creates a timestamped backup beside the ledger.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
from pathlib import Path
from typing import Any


ALLOWED_OUTCOMES = {
    "unreviewed",
    "real-problem",
    "deliberate-choice",
    "false-positive",
    "needs-human-ear",
    "needs-source-check",
    "needs-edit-change",
}

ALLOWED_STATUSES = {
    "",
    "listen",
    "refine",
    "keep",
    "hold",
}


def load_ledger(path: Path) -> list[dict[str, Any]]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, list):
        raise ValueError(f"Ledger is not a list: {path}")
    return [item for item in value if isinstance(item, dict)]


def find_entry(ledger: list[dict[str, Any]], finding_id: str) -> dict[str, Any] | None:
    for entry in ledger:
        if str(entry.get("findingId", "")).strip() == finding_id:
            return entry
    return None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Record a rhythm review outcome in a packet ledger.")
    parser.add_argument("packet_dir")
    parser.add_argument("finding_id")
    parser.add_argument("outcome", choices=sorted(ALLOWED_OUTCOMES))
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--status", choices=sorted(ALLOWED_STATUSES), default="")
    parser.add_argument("--listen", default="")
    parser.add_argument("--visual", default="")
    parser.add_argument("--cadence", default="")
    parser.add_argument("--source-monitor", default="")
    parser.add_argument("--tradeoff", default="")
    parser.add_argument("--follow-up", default="")
    parser.add_argument("--edit-change-needed", action="store_true")
    parser.add_argument("--no-edit-change-needed", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    packet_dir = Path(args.packet_dir).expanduser()
    ledger_path = packet_dir / "REVIEW_LEDGER_TEMPLATE.json"
    if not ledger_path.exists():
        raise SystemExit(f"Missing ledger: {ledger_path}")

    ledger = load_ledger(ledger_path)
    entry = find_entry(ledger, args.finding_id)
    if entry is None:
        available = ", ".join(str(item.get("findingId", "")) for item in ledger)
        raise SystemExit(f"Finding not found: {args.finding_id}. Available: {available}")

    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%SZ")
    backup_path = ledger_path.with_name(f"REVIEW_LEDGER_TEMPLATE.backup-{stamp}.json")
    shutil.copy2(ledger_path, backup_path)

    entry["reviewer"] = args.reviewer
    entry["reviewedAt"] = stamp
    entry["outcome"] = args.outcome
    entry["recommendedStatus"] = args.status
    if args.listen:
        entry["listenNotes"] = args.listen
    if args.visual:
        entry["visualNotes"] = args.visual
    if args.cadence:
        entry["cadenceNotes"] = args.cadence
    if args.source_monitor:
        entry["sourceMonitorNotes"] = args.source_monitor
    if args.tradeoff:
        entry["tradeoff"] = args.tradeoff
    if args.follow_up:
        entry["followUp"] = args.follow_up
    if args.edit_change_needed:
        entry["editChangeNeeded"] = True
    if args.no_edit_change_needed:
        entry["editChangeNeeded"] = False

    ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    receipt = {
        "status": "cut_rhythm_review_recorded",
        "packetDir": str(packet_dir),
        "ledgerPath": str(ledger_path),
        "backupPath": str(backup_path),
        "findingId": args.finding_id,
        "outcome": args.outcome,
        "reviewer": args.reviewer,
        "recommendedStatus": args.status,
        "reviewedAt": stamp,
        "truth": "Packet ledger updated only. No edit, export, publish, delete, or source-media mutation occurred.",
    }

    receipt_path = packet_dir / f"review-record-receipt-{args.finding_id}-{stamp}.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    receipt["receiptPath"] = str(receipt_path)

    if args.json and not args.markdown:
        print(json.dumps(receipt, indent=2, sort_keys=True))
    else:
        print("# Cut Rhythm Review Recorded")
        print()
        print(f"- Finding ID: `{receipt['findingId']}`")
        print(f"- Outcome: `{receipt['outcome']}`")
        print(f"- Reviewer: {receipt['reviewer']}")
        print(f"- Recommended status: `{receipt['recommendedStatus']}`")
        print(f"- Ledger: `{receipt['ledgerPath']}`")
        print(f"- Backup: `{receipt['backupPath']}`")
        print(f"- Receipt: `{receipt['receiptPath']}`")
        print(f"- Truth: {receipt['truth']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
