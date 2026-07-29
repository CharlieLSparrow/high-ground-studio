#!/usr/bin/env python3
"""Create and maintain a local Quipsly publication receipt ledger.

This is intentionally not a publisher. It records platform receipt truth after a
human/operator uploads or schedules something elsewhere.

A file existing locally is readiness. A publication receipt requires at least a
public/scheduled URL or provider receipt id.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.publication-receipt-ledger.v1"
VALID_STATUSES = {
    "pending-human-upload",
    "uploaded-processing",
    "scheduled",
    "published",
    "failed",
    "skipped",
}
RECEIPT_REQUIRED_STATUSES = {"uploaded-processing", "scheduled", "published"}


@dataclass
class ReceiptEntry:
    platform: str
    lane: str
    status: str = "pending-human-upload"
    expectedArtifact: str = ""
    publicUrl: str = ""
    providerReceiptId: str = ""
    capturedAtUtc: str = ""
    notes: str = ""


@dataclass
class ReceiptCheck:
    id: str
    status: str
    detail: str


DEFAULT_ENTRIES = [
    ReceiptEntry("YouTube", "long-form-video"),
    ReceiptEntry("Podcast RSS", "podcast-audio"),
    ReceiptEntry("Spotify", "podcast-distribution"),
    ReceiptEntry("Apple Podcasts", "podcast-distribution"),
    ReceiptEntry("YouTube Shorts", "social-short"),
    ReceiptEntry("Instagram Reels", "social-short"),
    ReceiptEntry("Facebook Reels", "social-short"),
]


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_ledger(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def default_expected_artifacts(ready_dir: Path) -> dict[tuple[str, str], str]:
    return {
        ("YouTube", "long-form-video"): "High-Ground-Odyssey-Episode-04-main-59m26-video-v007.mp4",
        ("Podcast RSS", "podcast-audio"): "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a",
        ("Spotify", "podcast-distribution"): "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a",
        ("Apple Podcasts", "podcast-distribution"): "High-Ground-Odyssey-Episode-04-main-59m26-podcast-audio-v007.m4a",
        ("YouTube Shorts", "social-short"): "episode-4-v007-social-shorts-builder/START_HERE_EPISODE_4_V007_BUILDER_SHORTS.md",
        ("Instagram Reels", "social-short"): "episode-4-v007-social-shorts-builder/START_HERE_EPISODE_4_V007_BUILDER_SHORTS.md",
        ("Facebook Reels", "social-short"): "episode-4-v007-social-shorts-builder/START_HERE_EPISODE_4_V007_BUILDER_SHORTS.md",
    }


def init_ledger(path: Path, ready_dir: Path, episode_id: str, title: str, *, force: bool) -> dict[str, Any]:
    if path.exists() and not force:
        return load_ledger(path)
    expected = default_expected_artifacts(ready_dir)
    entries: list[dict[str, Any]] = []
    for entry in DEFAULT_ENTRIES:
        item = asdict(entry)
        item["expectedArtifact"] = expected.get((entry.platform, entry.lane), "")
        entries.append(item)
    ledger = {
        "schema": SCHEMA,
        "episodeId": episode_id,
        "title": title,
        "readyDir": str(ready_dir),
        "createdAtUtc": now_utc(),
        "updatedAtUtc": now_utc(),
        "truth": {
            "scope": "publication receipt capture only",
            "uploadsPerformedByThisTool": False,
            "publicationPerformedByThisTool": False,
            "originalMediaMutated": False,
            "rule": "Do not claim external publication until a platform URL or provider receipt id is captured here.",
        },
        "entries": entries,
    }
    path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n")
    return ledger


def find_entry(ledger: dict[str, Any], platform: str, lane: str | None = None) -> dict[str, Any]:
    platform_norm = platform.lower()
    matches = [e for e in ledger.get("entries", []) if str(e.get("platform", "")).lower() == platform_norm]
    if lane:
        matches = [e for e in matches if str(e.get("lane", "")).lower() == lane.lower()]
    if not matches:
        raise SystemExit(f"No receipt entry found for platform={platform!r} lane={lane!r}")
    if len(matches) > 1:
        lanes = ", ".join(e.get("lane", "") for e in matches)
        raise SystemExit(f"Multiple entries match platform={platform!r}; pass --lane. Matching lanes: {lanes}")
    return matches[0]


def record_receipt(
    ledger: dict[str, Any],
    *,
    platform: str,
    lane: str | None,
    status: str,
    public_url: str,
    provider_receipt_id: str,
    notes: str,
) -> None:
    if status not in VALID_STATUSES:
        raise SystemExit(f"Unsupported receipt status {status!r}; use one of {sorted(VALID_STATUSES)}")
    entry = find_entry(ledger, platform, lane)
    entry["status"] = status
    if public_url:
        entry["publicUrl"] = public_url
    if provider_receipt_id:
        entry["providerReceiptId"] = provider_receipt_id
    if notes:
        entry["notes"] = notes
    entry["capturedAtUtc"] = now_utc()
    ledger["updatedAtUtc"] = now_utc()


def validate_ledger(ledger: dict[str, Any], ready_dir: Path) -> tuple[str, list[ReceiptCheck], dict[str, int]]:
    checks: list[ReceiptCheck] = []
    entries = ledger.get("entries") or []
    receipt_count = 0
    ready_count = 0
    pending_count = 0
    hard_stop_count = 0
    for entry in entries:
        platform = entry.get("platform", "unknown")
        lane = entry.get("lane", "unknown")
        status = entry.get("status", "")
        check_id = f"{platform}:{lane}"
        if status not in VALID_STATUSES:
            checks.append(ReceiptCheck(check_id, "failed", f"unsupported status {status!r}"))
            hard_stop_count += 1
            continue
        artifact = entry.get("expectedArtifact") or ""
        artifact_path = ready_dir / artifact if artifact else None
        if artifact_path and artifact_path.exists():
            ready_count += 1
        url = bool(entry.get("publicUrl"))
        provider = bool(entry.get("providerReceiptId"))
        if status in RECEIPT_REQUIRED_STATUSES and not (url or provider):
            checks.append(ReceiptCheck(check_id, "failed", f"status {status!r} requires publicUrl or providerReceiptId"))
            hard_stop_count += 1
        elif url or provider:
            receipt_count += 1
            checks.append(ReceiptCheck(check_id, "passed", f"receipt captured for status {status}"))
        else:
            pending_count += 1
            checks.append(ReceiptCheck(check_id, "pending", f"no external receipt captured; status {status}"))
    summary = {
        "entryCount": len(entries),
        "artifactReadyCount": ready_count,
        "receiptCapturedCount": receipt_count,
        "pendingReceiptCount": pending_count,
        "hardStopCount": hard_stop_count,
    }
    status = "failed" if hard_stop_count else "ready-for-receipt-capture" if receipt_count == 0 else "receipts-partially-captured" if receipt_count < len(entries) else "receipts-captured"
    return status, checks, summary


def write_markdown(path: Path, ledger: dict[str, Any], status: str, checks: list[ReceiptCheck], summary: dict[str, int]) -> None:
    lines = [
        f"# Publication receipts - {ledger.get('title') or ledger.get('episodeId')}",
        "",
        f"Status: `{status}`",
        f"Receipt captured count: `{summary['receiptCapturedCount']}` / `{summary['entryCount']}`",
        f"Hard stops: `{summary['hardStopCount']}`",
        "",
        "## Truth",
        "",
        "- This ledger records receipts after manual/platform upload work.",
        "- This ledger does not upload, publish, schedule, mutate accounts, or mutate original media.",
        "- Local files being ready is not publication. Publication means a URL, scheduled URL, or provider receipt id is captured here.",
        "",
        "## Receipt entries",
        "",
    ]
    for entry in ledger.get("entries", []):
        lines.extend(
            [
                f"### {entry.get('platform')} - {entry.get('lane')}",
                "",
                f"- Status: `{entry.get('status')}`",
                f"- Expected artifact: `{entry.get('expectedArtifact') or ''}`",
                f"- Public URL: `{entry.get('publicUrl') or ''}`",
                f"- Provider receipt ID: `{entry.get('providerReceiptId') or ''}`",
                f"- Captured at UTC: `{entry.get('capturedAtUtc') or ''}`",
                f"- Notes: {entry.get('notes') or ''}",
                "",
            ]
        )
    lines.extend(["## Checks", ""])
    for check in checks:
        lines.append(f"- `{check.status}` {check.id}: {check.detail}")
    lines.extend([
        "",
        "## Example receipt commands",
        "",
        "```bash",
        "python3 apps/QuipslyStudio/script/quipsly_publication_receipt_ledger.py --ready-dir \"/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712\" --record --platform YouTube --lane long-form-video --status published --public-url \"https://youtu.be/...\" --notes \"manual upload receipt\"",
        "python3 apps/QuipslyStudio/script/quipsly_publication_receipt_ledger.py --ready-dir \"/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Upload_Candidates/READY_TO_UPLOAD_EP4_20260712\" --record --platform \"Podcast RSS\" --lane podcast-audio --status published --public-url \"https://.../episode-4\" --notes \"RSS episode page\"",
        "```",
        "",
    ])
    path.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ready-dir", required=True, type=Path)
    parser.add_argument("--episode-id", default="episode-4")
    parser.add_argument("--title", default="High Ground Odyssey Episode 4")
    parser.add_argument("--ledger-name", default="PUBLICATION_RECEIPTS_EP04_V007.json")
    parser.add_argument("--markdown-name", default="PUBLICATION_RECEIPTS_EP04_V007.md")
    parser.add_argument("--init", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--record", action="store_true")
    parser.add_argument("--platform", default="")
    parser.add_argument("--lane", default="")
    parser.add_argument("--status", default="pending-human-upload")
    parser.add_argument("--public-url", default="")
    parser.add_argument("--provider-receipt-id", default="")
    parser.add_argument("--notes", default="")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    ready_dir = args.ready_dir.expanduser().resolve()
    if not ready_dir.exists():
        raise SystemExit(f"ready dir does not exist: {ready_dir}")
    ledger_path = ready_dir / args.ledger_name
    markdown_path = ready_dir / args.markdown_name

    if args.init or not ledger_path.exists():
        ledger = init_ledger(ledger_path, ready_dir, args.episode_id, args.title, force=args.force or not ledger_path.exists())
    else:
        ledger = load_ledger(ledger_path)

    if args.record:
        if not args.platform:
            raise SystemExit("--record requires --platform")
        record_receipt(
            ledger,
            platform=args.platform,
            lane=args.lane or None,
            status=args.status,
            public_url=args.public_url,
            provider_receipt_id=args.provider_receipt_id,
            notes=args.notes,
        )
        ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n")

    status, checks, summary = validate_ledger(ledger, ready_dir)
    ledger["status"] = status
    ledger["summary"] = summary
    ledger["checks"] = [asdict(check) for check in checks]
    ledger["updatedAtUtc"] = now_utc()
    ledger_path.write_text(json.dumps(ledger, indent=2, sort_keys=True) + "\n")
    write_markdown(markdown_path, ledger, status, checks, summary)

    result = {
        "status": status,
        "ledger": str(ledger_path),
        "markdown": str(markdown_path),
        **summary,
        "truth": ledger.get("truth", {}),
    }
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print(json.dumps(result, indent=2))
    return 0 if summary["hardStopCount"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
