#!/usr/bin/env python3
"""Create/update a human review and receipt ledger for Quipsly release packages.

The ledger is intentionally local and conservative:
- It preserves existing reviewer decisions and receipt slots when regenerated.
- It creates empty, explicit places for approve/refine/reject and platform URLs.
- It does not publish, schedule, upload, approve, or mutate media.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DIAGNOSTIC_HOLD_MARKERS = ("smoke", "diagnostic", "test hold", "command smoke")
PLATFORMS = [
    "YouTube",
    "Podcast/RSS",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
    "HighGroundOdyssey.com",
]
REVIEW_ARTIFACTS = [
    ("longForm16x9", "Long-form 16:9 video"),
    ("longForm9x16", "Long-form 9:16 video"),
    ("podcastAudio", "Podcast/RSS audio"),
    ("shorts", "Shorts"),
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def existing_episode_map(existing: dict[str, Any]) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for item in existing.get("episodes") or []:
        if not isinstance(item, dict):
            continue
        key = f"{int(item.get('episode') or 0):02d}:{item.get('version') or ''}"
        result[key] = item
    return result


def is_diagnostic_review_hold(artifact: dict[str, Any]) -> bool:
    decision = str(artifact.get("decision") or "pending").lower()
    if decision not in {"hold", "refine", "reject"}:
        return False
    reviewer = str(artifact.get("reviewer") or "").lower()
    notes = str(artifact.get("notes") or "").lower()
    if reviewer not in {"codex", "agent", "automation", "quipsly"}:
        return False
    return any(marker in notes for marker in DIAGNOSTIC_HOLD_MARKERS)


def merge_review_artifacts(existing_episode: dict[str, Any], board_episode: dict[str, Any]) -> list[dict[str, Any]]:
    existing_by_id = {
        str(item.get("id") or ""): item
        for item in existing_episode.get("reviewArtifacts") or []
        if isinstance(item, dict)
    }
    artifacts = []
    for artifact_id, label in REVIEW_ARTIFACTS:
        prior = existing_by_id.get(artifact_id, {})
        if artifact_id == "shorts":
            asset_count = len(board_episode.get("shorts") or [])
            paths = [short.get("path") for short in board_episode.get("shorts") or [] if short.get("path")]
        else:
            artifact = (board_episode.get("artifacts") or {}).get(artifact_id) or {}
            asset_count = 1 if artifact.get("path") else 0
            paths = [artifact.get("path")] if artifact.get("path") else []
        artifacts.append({
            "id": artifact_id,
            "label": label,
            "status": prior.get("status") or "pending-review",
            "reviewer": prior.get("reviewer") or "",
            "reviewedAt": prior.get("reviewedAt") or "",
            "decision": prior.get("decision") or "pending",
            "notes": prior.get("notes") or "",
            "assetCount": asset_count,
            "paths": paths,
            "allowedDecisions": ["approve", "refine", "reject", "hold"],
        })
    return artifacts


def merge_receipts(existing_episode: dict[str, Any], board_episode: dict[str, Any]) -> list[dict[str, Any]]:
    existing_by_platform = {
        str(item.get("platform") or ""): item
        for item in existing_episode.get("receiptSlots") or []
        if isinstance(item, dict)
    }
    ready_platforms = set((board_episode.get("platformPrep") or {}).get("readyPlatforms") or [])
    slots = []
    for platform in PLATFORMS:
        prior = existing_by_platform.get(platform, {})
        slots.append({
            "platform": platform,
            "status": prior.get("status") or "not_published",
            "url": prior.get("url") or "",
            "providerId": prior.get("providerId") or "",
            "postedAt": prior.get("postedAt") or "",
            "capturedBy": prior.get("capturedBy") or "",
            "notes": prior.get("notes") or "",
            "localMetadataReady": platform in ready_platforms,
            "truth": "Empty means not published. Fill this only after a real platform URL or receipt exists.",
        })
    return slots


def build_ledger(root: Path) -> dict[str, Any]:
    board_path = root / "review-board" / "review-board.json"
    if not board_path.exists():
        raise SystemExit(f"Review board not found: {board_path}. Run release-review-board first.")
    board = load_json(board_path)
    ledger_path = root / "review-board" / "human-review-ledger.json"
    existing = load_json(ledger_path)
    existing_episodes = existing_episode_map(existing)
    now = iso_now()

    episodes = []
    for ep in board.get("episodes") or []:
        if not isinstance(ep, dict):
            continue
        key = f"{int(ep.get('episode') or 0):02d}:{ep.get('version') or ''}"
        prior = existing_episodes.get(key, {})
        review_artifacts = merge_review_artifacts(prior, ep)
        receipt_slots = merge_receipts(prior, ep)
        diagnostic_hold_count = sum(1 for item in review_artifacts if is_diagnostic_review_hold(item))
        has_blocking_review = any(
            item.get("decision") in {"reject", "refine", "hold"} and not is_diagnostic_review_hold(item)
            for item in review_artifacts
        )
        all_approved = all(item.get("decision") == "approve" for item in review_artifacts)
        any_receipts = any(item.get("url") for item in receipt_slots)
        episodes.append({
            "episode": ep.get("episode"),
            "version": ep.get("version"),
            "versionDir": ep.get("versionDir"),
            "status": prior.get("status") or ("approved-not-published" if all_approved else "pending-human-review"),
            "warnings": ep.get("warnings") or [],
            "nextSafestAction": prior.get("nextSafestAction") or ep.get("nextSafestAction"),
            "reviewArtifacts": review_artifacts,
            "receiptSlots": receipt_slots,
            "reviewSummary": {
                "allArtifactsApproved": all_approved,
                "hasBlockingReviewDecision": has_blocking_review,
                "diagnosticReviewHoldCount": diagnostic_hold_count,
                "hasAnyPublicationReceipt": any_receipts,
                "pendingReviewCount": sum(1 for item in review_artifacts if item.get("decision") == "pending"),
                "receiptCount": sum(1 for item in receipt_slots if item.get("url")),
            },
        })

    return {
        "packetType": "quipsly-human-review-ledger",
        "version": "2026-06-24.human-review-ledger.v1",
        "generatedAt": now,
        "updatedAt": now,
        "root": str(root),
        "sourceReviewBoard": str(board_path),
        "truth": "Local human review and receipt slots only. This ledger never publishes, uploads, approves by itself, or mutates media.",
        "allowedArtifactDecisions": ["approve", "refine", "reject", "hold"],
        "episodes": episodes,
    }


def render_markdown(ledger: dict[str, Any]) -> str:
    lines = [
        "# Human Review and Receipt Ledger",
        "",
        f"Generated: `{ledger['generatedAt']}`",
        "",
        "> This is where humans can record review decisions and where platform receipts belong after publication. Empty receipt slots mean not published.",
        "",
        "## How to use",
        "",
        "1. Watch/listen to each artifact listed in the review board.",
        "2. Mark each artifact approve/refine/reject/hold in the JSON or a future Studio UI.",
        "3. Do not fill receipt URLs until a platform actually returns a URL or proof.",
        "4. If an episode has warnings, record the human decision in notes before publishing.",
        "",
    ]
    for ep in ledger["episodes"]:
        summary = ep["reviewSummary"]
        lines.extend([
            f"## Episode {int(ep['episode']):02d} - {ep['version']}",
            "",
            f"- Status: `{ep['status']}`",
            f"- Pending review artifacts: `{summary['pendingReviewCount']}`",
            f"- Receipts captured: `{summary['receiptCount']}`",
            f"- Next: {ep['nextSafestAction']}",
            "",
            "### Review artifacts",
            "",
        ])
        for item in ep["reviewArtifacts"]:
            lines.append(f"- `{item['decision']}` {item['label']} ({item['assetCount']} file/group) - {item['notes'] or 'no notes yet'}")
        lines.extend(["", "### Receipt slots", ""])
        for slot in ep["receiptSlots"]:
            local = "metadata ready" if slot["localMetadataReady"] else "metadata missing"
            url = slot["url"] or "not published"
            lines.append(f"- {slot['platform']}: `{slot['status']}` / {local} / {url}")
        if ep["warnings"]:
            lines.extend(["", "### Warnings requiring human decision", ""])
            lines.extend(f"- {warning}" for warning in ep["warnings"])
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create/update Quipsly local human review ledger.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    ledger = build_ledger(root)
    output_dir = root / "review-board"
    json_path = output_dir / "human-review-ledger.json"
    md_path = output_dir / "human-review-ledger.md"
    write_json(json_path, ledger)
    md_path.write_text(render_markdown(ledger), encoding="utf-8")

    status_path = root / "release-status.json"
    status = load_json(status_path)
    status.setdefault("reviewBoard", {})["humanReviewLedgerPath"] = str(json_path)
    status.setdefault("reviewBoard", {})["humanReviewLedgerMarkdownPath"] = str(md_path)
    write_json(status_path, status)

    status_md_path = root / "release-status.md"
    if status_md_path.exists():
        text = status_md_path.read_text(encoding="utf-8")
        if "- Human review ledger:" not in text:
            text += f"- Human review ledger: `{md_path}`\n"
            status_md_path.write_text(text, encoding="utf-8")

    print(json.dumps({
        "ok": True,
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "episodeCount": len(ledger["episodes"]),
        "truth": ledger["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
