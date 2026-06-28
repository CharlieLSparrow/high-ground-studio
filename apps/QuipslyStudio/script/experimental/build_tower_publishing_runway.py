#!/usr/bin/env python3
"""Build a Quipsly Tower publishing runway from local release evidence.

Tower is not a publisher yet. This script creates a calm manual-publishing
runway that joins local package readiness, human review state, platform packet
state, receipt slots, and next-safe actions. It never uploads, schedules,
publishes, approves, or mutates media/accounts.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
PLATFORM_ORDER = [
    "YouTube",
    "Podcast/RSS",
    "HighGroundOdyssey.com",
    "Patreon",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
]
DIAGNOSTIC_HOLD_MARKERS = ("smoke", "diagnostic", "test hold", "command smoke")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def prepare_session_dir(root: Path) -> Path:
    session_root = root / "tower-runway"
    session_dir = session_root / datetime.now().strftime("%Y%m%d-%H%M%S-tower-runway")
    counter = 2
    while session_dir.exists():
        session_dir = session_root / f"{session_dir.name}-{counter}"
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def human_duration(seconds: Any) -> str:
    try:
        total = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def index_by_episode(items: list[Any]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            episode = int(item.get("episode") or 0)
        except Exception:
            episode = 0
        if episode:
            result[episode] = item
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


def artifact_summary(review_artifacts: list[dict[str, Any]]) -> dict[str, Any]:
    decisions = [item.get("decision") or "pending" for item in review_artifacts]
    diagnostic_holds = sum(1 for item in review_artifacts if is_diagnostic_review_hold(item))
    real_blocking = sum(
        1
        for item in review_artifacts
        if (item.get("decision") or "pending") in {"refine", "reject", "hold"}
        and not is_diagnostic_review_hold(item)
    )
    return {
        "totalReviewArtifacts": len(review_artifacts),
        "pending": sum(1 for item in decisions if item == "pending"),
        "approved": sum(1 for item in decisions if item == "approve"),
        "refine": sum(1 for item in decisions if item == "refine"),
        "reject": sum(1 for item in decisions if item == "reject"),
        "hold": sum(1 for item in decisions if item == "hold"),
        "diagnosticHold": diagnostic_holds,
        "blocking": real_blocking,
    }


def receipt_summary(receipt_slots: list[dict[str, Any]]) -> dict[str, Any]:
    captured = [slot for slot in receipt_slots if slot.get("url") or slot.get("providerId")]
    ready = [slot for slot in receipt_slots if slot.get("localMetadataReady")]
    return {
        "receiptSlots": len(receipt_slots),
        "metadataReadySlots": len(ready),
        "capturedReceipts": len(captured),
        "notPublishedSlots": sum(1 for slot in receipt_slots if (slot.get("status") or "not_published") == "not_published"),
    }


def status_for_episode(
    board_ep: dict[str, Any],
    ledger_ep: dict[str, Any],
    validation_ep: dict[str, Any],
) -> str:
    blockers = validation_ep.get("blockers") or []
    warnings = [*(board_ep.get("warnings") or []), *(validation_ep.get("warnings") or [])]
    review_summary = ledger_ep.get("reviewSummary") or {}
    review_artifacts = ledger_ep.get("reviewArtifacts") if isinstance(ledger_ep.get("reviewArtifacts"), list) else []
    diagnostic_hold_count = sum(1 for item in review_artifacts if isinstance(item, dict) and is_diagnostic_review_hold(item))
    real_blocking_review = any(
        isinstance(item, dict)
        and str(item.get("decision") or "pending").lower() in {"hold", "refine", "reject"}
        and not is_diagnostic_review_hold(item)
        for item in review_artifacts
    )
    has_blocking_review = real_blocking_review or (
        bool(review_summary.get("hasBlockingReviewDecision"))
        and not diagnostic_hold_count
    )
    pending_review = int(review_summary.get("pendingReviewCount") or 0)
    receipts = int(review_summary.get("receiptCount") or 0)
    if blockers:
        return "blocked-local-package"
    if has_blocking_review:
        return "review-needs-work"
    if diagnostic_hold_count:
        return "diagnostic-review-hold"
    if pending_review > 0:
        return "needs-human-review"
    if warnings:
        return "reviewed-with-warnings-needs-decision"
    if receipts == 0:
        return "approved-local-ready-no-receipts"
    return "published-receipts-captured"


def next_action_for_episode(status: str, board_ep: dict[str, Any], validation_ep: dict[str, Any]) -> str:
    if status == "blocked-local-package":
        blockers = validation_ep.get("blockers") or []
        return "Fix local package blockers: " + "; ".join(str(item) for item in blockers[:4])
    if status == "review-needs-work":
        return "Resolve hold/refine/reject review decisions before publication."
    if status == "diagnostic-review-hold":
        return "A diagnostic/test review hold is visible. Reset it to pending if it was only a smoke flag, or confirm a real repair decision after review."
    if status == "needs-human-review":
        return "Open the review board, watch/listen to long-form video, podcast audio, and shorts, then record approve/refine/hold decisions."
    if status == "reviewed-with-warnings-needs-decision":
        return "Record a human decision for warnings before any manual upload."
    if status == "approved-local-ready-no-receipts":
        return "Use platform packets for manual upload only after explicit approval; capture URL/provider receipt afterward."
    return "Verify captured receipts and update analytics placeholders."


def build_platform_queue(ledger_ep: dict[str, Any], board_ep: dict[str, Any]) -> list[dict[str, Any]]:
    slots_by_platform = {
        slot.get("platform"): slot
        for slot in ledger_ep.get("receiptSlots") or []
        if isinstance(slot, dict)
    }
    platform_prep = board_ep.get("platformPrep") or {}
    ready_platforms = set(platform_prep.get("readyPlatforms") or [])
    queue = []
    for order, platform in enumerate(PLATFORM_ORDER, start=1):
        slot = slots_by_platform.get(platform, {})
        local_ready = bool(slot.get("localMetadataReady") or platform in ready_platforms)
        has_receipt = bool(slot.get("url") or slot.get("providerId"))
        status = "receipt-captured" if has_receipt else "metadata-ready-needs-approval" if local_ready else "metadata-missing"
        queue.append({
            "order": order,
            "platform": platform,
            "status": status,
            "localMetadataReady": local_ready,
            "receiptStatus": slot.get("status") or "not_published",
            "url": slot.get("url") or "",
            "providerId": slot.get("providerId") or "",
            "postedAt": slot.get("postedAt") or "",
            "nextSafestAction": "Capture receipt already present." if has_receipt else "Await explicit approval, then publish manually and paste receipt." if local_ready else "Generate or repair platform metadata packet.",
        })
    return queue


def build_calendar_draft(episode: int, platform_queue: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "episode": episode,
            "platform": item["platform"],
            "queueOrder": item["order"],
            "targetWindow": "unscheduled",
            "status": "draft-only-not-scheduled",
            "externalScheduleCreated": False,
            "truth": "Calendar draft only. No platform schedule exists until a real external receipt or scheduler record is captured.",
        }
        for item in platform_queue
    ]


def shell_command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def build_action_cards(
    episode: int,
    review_artifacts: list[dict[str, Any]],
    platform_queue: list[dict[str, Any]],
) -> dict[str, Any]:
    review_actions = []
    for artifact in review_artifacts:
        artifact_id = artifact.get("id") or ""
        review_actions.append({
            "kind": "review-artifact",
            "artifactId": artifact_id,
            "label": artifact.get("label") or artifact_id,
            "currentDecision": artifact.get("decision") or "pending",
            "assetCount": artifact.get("assetCount") or 0,
            "commands": {
                decision: shell_command([
                    "./script/agentctl.sh",
                    "tower-review-decision",
                    episode,
                    artifact_id,
                    decision,
                    "<reviewer>",
                    "<notes>",
                ])
                for decision in ["approve", "refine", "reject", "hold", "pending"]
            },
            "truth": "Local ledger decision only. This command does not publish, upload, schedule, approve externally, or mutate media.",
        })
    receipt_actions = []
    for item in platform_queue:
        receipt_actions.append({
            "kind": "receipt-slot",
            "platform": item["platform"],
            "currentStatus": item["receiptStatus"],
            "localMetadataReady": item["localMetadataReady"],
            "commandTemplate": shell_command([
                "./script/agentctl.sh",
                "tower-receipt",
                episode,
                item["platform"],
                "<real-url>",
                "<provider-id>",
                "<posted-at-iso>",
                "<captured-by>",
                "<notes>",
            ]),
            "truth": "Use only after manual publication returns a real URL or provider id. The command records receipt metadata; it does not publish.",
        })
    return {
        "schema": "quipsly.tower.action-cards.v1",
        "episode": episode,
        "reviewActions": review_actions,
        "receiptActions": receipt_actions,
        "truth": "Safe action cards. Commands mutate only local Tower ledger metadata and do not perform external publishing.",
    }


def build_runway(root: Path) -> dict[str, Any]:
    review_board = load_json(root / "review-board" / "review-board.json")
    ledger = load_json(root / "review-board" / "human-review-ledger.json")
    validation = load_json(root / "review-board" / "release-validation.json")
    release_status = load_json(root / "release-status.json")
    board_eps = index_by_episode(review_board.get("episodes") or [])
    ledger_eps = index_by_episode(ledger.get("episodes") or [])
    validation_eps = index_by_episode(validation.get("episodes") or [])
    release_eps = index_by_episode(release_status.get("episodes") or [])
    episodes = []
    calendar_items = []

    for episode in sorted(set(board_eps) | set(ledger_eps) | set(validation_eps) | set(release_eps)):
        board_ep = board_eps.get(episode) or {}
        ledger_ep = ledger_eps.get(episode) or {}
        validation_ep = validation_eps.get(episode) or {}
        release_ep = release_eps.get(episode) or {}
        platform_queue = build_platform_queue(ledger_ep, board_ep)
        calendar_draft = build_calendar_draft(episode, platform_queue)
        calendar_items.extend(calendar_draft)
        review_artifacts = ledger_ep.get("reviewArtifacts") or []
        receipt_slots = ledger_ep.get("receiptSlots") or []
        artifacts = board_ep.get("artifacts") or {}
        status = status_for_episode(board_ep, ledger_ep, validation_ep)
        action_cards = build_action_cards(episode, review_artifacts, platform_queue)
        episodes.append({
            "episode": episode,
            "version": board_ep.get("version") or ledger_ep.get("version") or release_ep.get("version") or "",
            "status": status,
            "versionDir": board_ep.get("versionDir") or ledger_ep.get("versionDir") or release_ep.get("versionDir") or "",
            "manifestPath": board_ep.get("manifestPath") or "",
            "reviewBoardHtml": review_board.get("htmlPath") or str(root / "review-board" / "index.html"),
            "reviewSummary": ledger_ep.get("reviewSummary") or {},
            "reviewArtifactSummary": artifact_summary(review_artifacts),
            "receiptSummary": receipt_summary(receipt_slots),
            "warnings": sorted(set([*(board_ep.get("warnings") or []), *(validation_ep.get("warnings") or []), *(release_ep.get("warnings") or [])])),
            "blockers": validation_ep.get("blockers") or [],
            "longForm": {
                "video16x9": artifacts.get("longForm16x9") or {},
                "video9x16": artifacts.get("longForm9x16") or {},
                "podcastAudio": artifacts.get("podcastAudio") or {},
                "durationSpreadSeconds": board_ep.get("longFormDurationSpreadSeconds") or release_ep.get("longFormDurationSpreadSeconds") or 0,
            },
            "shorts": {
                "count": len(board_ep.get("shorts") or []),
                "readyCount": board_ep.get("readyShortCount") or release_ep.get("readyShortCount") or 0,
                "sample": (board_ep.get("shorts") or [])[:5],
            },
            "platformQueue": platform_queue,
            "calendarDraft": calendar_draft,
            "actionCards": action_cards,
            "nextSafestAction": next_action_for_episode(status, board_ep, validation_ep),
            "publicationTruth": "Local readiness, human approval, schedule drafts, and external receipts are separate.",
        })

    captured_receipts = sum(ep["receiptSummary"]["capturedReceipts"] for ep in episodes)
    pending_review = sum(ep["reviewArtifactSummary"]["pending"] for ep in episodes)
    diagnostic_holds = sum(ep["reviewArtifactSummary"].get("diagnosticHold", 0) for ep in episodes)
    warnings = [ep["episode"] for ep in episodes if ep["warnings"]]
    blockers = [ep["episode"] for ep in episodes if ep["blockers"]]
    return {
        "schema": "quipsly.tower.publishing-runway.v1",
        "generatedAt": iso_now(),
        "root": str(root),
        "truth": "Tower runway is local review and manual-publishing prep only. It does not publish, upload, schedule, approve, or mutate accounts/media.",
        "sourceEvidence": {
            "reviewBoardJson": str(root / "review-board" / "review-board.json"),
            "humanReviewLedger": str(root / "review-board" / "human-review-ledger.json"),
            "releaseValidation": str(root / "review-board" / "release-validation.json"),
            "releaseStatus": str(root / "release-status.json"),
        },
        "counts": {
            "episodes": len(episodes),
            "blockedEpisodes": len(blockers),
            "warningEpisodes": len(warnings),
            "pendingReviewArtifacts": pending_review,
            "diagnosticReviewHolds": diagnostic_holds,
            "capturedReceipts": captured_receipts,
            "calendarDraftItems": len(calendar_items),
        },
        "blockedEpisodes": blockers,
        "warningEpisodes": warnings,
        "episodes": episodes,
        "calendarDraft": calendar_items,
    }


def write_csvs(session_dir: Path, runway: dict[str, Any]) -> None:
    with (session_dir / "platform-queue.csv").open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["episode", "version", "episodeStatus", "platform", "queueOrder", "platformStatus", "receiptStatus", "url", "nextSafestAction"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for ep in runway["episodes"]:
            for item in ep["platformQueue"]:
                writer.writerow({
                    "episode": ep["episode"],
                    "version": ep["version"],
                    "episodeStatus": ep["status"],
                    "platform": item["platform"],
                    "queueOrder": item["order"],
                    "platformStatus": item["status"],
                    "receiptStatus": item["receiptStatus"],
                    "url": item["url"],
                    "nextSafestAction": item["nextSafestAction"],
                })
    with (session_dir / "receipt-slots.csv").open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["episode", "version", "platform", "status", "url", "providerId", "postedAt"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for ep in runway["episodes"]:
            for item in ep["platformQueue"]:
                writer.writerow({
                    "episode": ep["episode"],
                    "version": ep["version"],
                    "platform": item["platform"],
                    "status": item["receiptStatus"],
                    "url": item["url"],
                    "providerId": item["providerId"],
                    "postedAt": item["postedAt"],
                })
    with (session_dir / "social-calendar-draft.csv").open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["episode", "platform", "queueOrder", "targetWindow", "status", "externalScheduleCreated", "truth"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for item in runway["calendarDraft"]:
            writer.writerow(item)


def write_markdown(session_dir: Path, runway: dict[str, Any]) -> None:
    lines = [
        "# Quipsly Tower publishing runway",
        "",
        f"Generated: `{runway['generatedAt']}`",
        "",
        "> Local runway only. Nothing here is externally published, uploaded, scheduled, approved, or sent.",
        "",
        "## Current truth",
        "",
        f"- Episodes tracked: `{runway['counts']['episodes']}`",
        f"- Blocked episodes: `{', '.join(map(str, runway['blockedEpisodes'])) or 'none'}`",
        f"- Warning episodes: `{', '.join(map(str, runway['warningEpisodes'])) or 'none'}`",
        f"- Pending review artifacts: `{runway['counts']['pendingReviewArtifacts']}`",
        f"- Diagnostic review holds: `{runway['counts'].get('diagnosticReviewHolds', 0)}`",
        f"- Captured external receipts: `{runway['counts']['capturedReceipts']}`",
        f"- Calendar draft items: `{runway['counts']['calendarDraftItems']}`",
        "",
        "## Episode runway",
        "",
    ]
    for ep in runway["episodes"]:
        lines.extend([
            f"### Episode {int(ep['episode']):02d} - {ep['version']}",
            "",
            f"- Status: `{ep['status']}`",
            f"- Version dir: `{ep['versionDir']}`",
            f"- Review pending: `{ep['reviewArtifactSummary']['pending']}`",
            f"- Diagnostic holds: `{ep['reviewArtifactSummary'].get('diagnosticHold', 0)}`",
            f"- Receipts captured: `{ep['receiptSummary']['capturedReceipts']}`",
            f"- Shorts: `{ep['shorts']['readyCount']}/{ep['shorts']['count']}`",
            f"- Next: {ep['nextSafestAction']}",
            "",
            "| Platform | Status | Receipt | Next |",
            "| --- | --- | --- | --- |",
        ])
        for item in ep["platformQueue"]:
            receipt = item["url"] or item["receiptStatus"]
            lines.append(f"| {item['platform']} | `{item['status']}` | `{receipt}` | {item['nextSafestAction']} |")
        if ep["warnings"]:
            lines.extend(["", "Warnings:"])
            lines.extend(f"- {warning}" for warning in ep["warnings"])
        if ep["blockers"]:
            lines.extend(["", "Blockers:"])
            lines.extend(f"- {blocker}" for blocker in ep["blockers"])
        lines.extend(["", "Safe local review commands:", ""])
        for action in (ep.get("actionCards") or {}).get("reviewActions", []):
            commands = action.get("commands") or {}
            lines.append(f"- {action.get('label')} currently `{action.get('currentDecision')}`")
            lines.append(f"  - Hold: `{commands.get('hold', '')}`")
            lines.append(f"  - Refine: `{commands.get('refine', '')}`")
            lines.append(f"  - Approve: `{commands.get('approve', '')}`")
        lines.extend(["", "Receipt templates:", ""])
        for action in (ep.get("actionCards") or {}).get("receiptActions", []):
            lines.append(f"- {action.get('platform')}: `{action.get('commandTemplate')}`")
        lines.append("")
    (session_dir / "START-HERE-Tower-runway.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(session_dir: Path, runway: dict[str, Any]) -> None:
    cards = []
    for ep in runway["episodes"]:
        platform_rows = []
        for item in ep["platformQueue"]:
            platform_rows.append(
                f"<tr><td>{html.escape(item['platform'])}</td><td><code>{html.escape(item['status'])}</code></td><td>{html.escape(item['url'] or item['receiptStatus'])}</td></tr>"
            )
        warnings = "".join(f"<li>{html.escape(str(warning))}</li>" for warning in ep["warnings"]) or "<li>none</li>"
        action_rows = []
        for action in (ep.get("actionCards") or {}).get("reviewActions", []):
            commands = action.get("commands") or {}
            action_rows.append(
                f"<li><b>{html.escape(str(action.get('label')))}</b><pre><code>{html.escape(commands.get('hold', ''))}</code></pre><pre><code>{html.escape(commands.get('refine', ''))}</code></pre><pre><code>{html.escape(commands.get('approve', ''))}</code></pre></li>"
            )
        receipt_rows = []
        for action in (ep.get("actionCards") or {}).get("receiptActions", []):
            receipt_rows.append(
                f"<li><b>{html.escape(str(action.get('platform')))}</b><pre><code>{html.escape(str(action.get('commandTemplate') or ''))}</code></pre></li>"
            )
        cards.append(f"""
        <article class="card">
          <div class="card-head">
            <div>
              <span class="eyebrow">Episode {int(ep['episode']):02d}</span>
              <h2>{html.escape(ep['version'] or 'current')}</h2>
            </div>
            <strong class="status">{html.escape(ep['status'])}</strong>
          </div>
          <p>{html.escape(ep['nextSafestAction'])}</p>
          <div class="stats">
            <span>{ep['reviewArtifactSummary']['pending']} review pending</span>
            <span>{ep['reviewArtifactSummary'].get('diagnosticHold', 0)} diagnostic holds</span>
            <span>{ep['receiptSummary']['capturedReceipts']} receipts</span>
            <span>{ep['shorts']['readyCount']}/{ep['shorts']['count']} shorts</span>
          </div>
          <table><thead><tr><th>Platform</th><th>Status</th><th>Receipt</th></tr></thead><tbody>{''.join(platform_rows)}</tbody></table>
          <details><summary>Warnings</summary><ul>{warnings}</ul></details>
          <details><summary>Safe local review commands</summary><ul class="commands">{''.join(action_rows)}</ul></details>
          <details><summary>Receipt templates</summary><ul class="commands">{''.join(receipt_rows)}</ul></details>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Tower Publishing Runway</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101719; --panel:#172326; --ink:#f6f0df; --muted:#c3b99f; --sky:#8dc8d8; --gold:#e8c55f; --line:rgba(246,240,223,.14); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top right, rgba(141,200,216,.18), transparent 34%), linear-gradient(180deg,#101719,#0c1112); }}
    header {{ padding:38px clamp(22px,5vw,74px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,86px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; margin-top:22px; }}
    .summary span, .stats span {{ border:1px solid var(--line); border-radius:999px; padding:9px 12px; background:rgba(255,255,255,.05); color:var(--muted); font-weight:800; }}
    main {{ padding:26px clamp(16px,4vw,56px) 60px; display:grid; gap:18px; }}
    .card {{ border:1px solid var(--line); border-radius:24px; padding:20px; background:linear-gradient(180deg,rgba(23,35,38,.96),rgba(12,17,18,.96)); box-shadow:0 20px 60px rgba(0,0,0,.22); }}
    .card-head {{ display:flex; justify-content:space-between; gap:16px; align-items:start; }}
    h2 {{ margin:5px 0 0; font-size:32px; }}
    .status {{ color:var(--sky); border:1px solid rgba(141,200,216,.35); border-radius:999px; padding:8px 12px; background:rgba(141,200,216,.09); }}
    .stats {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }}
    table {{ width:100%; border-collapse:collapse; margin-top:12px; overflow:hidden; border-radius:14px; }}
    th, td {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }}
    th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; }}
    code {{ color:var(--sky); overflow-wrap:anywhere; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:12px; padding:10px; background:rgba(0,0,0,.22); }}
    .commands {{ padding-left:18px; }}
    .commands li {{ margin:12px 0; }}
    details {{ margin-top:12px; color:var(--muted); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower</div>
    <h1>Publishing runway, not fake green checks.</h1>
    <p>Review packages, platform metadata, calendar drafts, and receipt slots stay separate so humans know exactly what is ready and what is merely prepared.</p>
    <div class="summary">
      <span>{runway['counts']['episodes']} episodes</span>
      <span>{runway['counts']['pendingReviewArtifacts']} review artifacts pending</span>
      <span>{runway['counts'].get('diagnosticReviewHolds', 0)} diagnostic holds</span>
      <span>{runway['counts']['capturedReceipts']} receipts captured</span>
      <span>{runway['counts']['calendarDraftItems']} calendar draft items</span>
    </div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    (session_dir / "index.html").write_text(html_text, encoding="utf-8")


def update_pointer(root: Path, session_dir: Path, runway: dict[str, Any]) -> None:
    pointer = {
        "schema": "quipsly.tower.latest-runway.v1",
        "updatedAt": iso_now(),
        "status": runway.get("status") or "tower-runway-ready",
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "tower-runway.json"),
        "markdownPath": str(session_dir / "START-HERE-Tower-runway.md"),
        "counts": runway.get("counts") or {},
        "truth": "Pointer only. Runway sessions are versioned and preserved.",
        "humanAsk": "Review the Tower runway before approving any publishing action. Confirm local package readiness, platform metadata, calendar intent, and receipt slots separately.",
        "agentSafeParallelWork": "Codex may improve local packet clarity, metadata drafts, calendar drafts, receipt slots, and review summaries. Do not publish, upload, schedule, approve, delete, overwrite, mutate accounts, or create receipt truth.",
        "nextSafestAction": runway.get("nextSafestAction") or "Open the Tower runway and choose the next review packet or manual publishing packet to prepare.",
        "firstSafeAction": {
            "label": "Open Tower publishing runway",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local publishing runway evidence only. No external publishing, upload, schedule, approval, account mutation, source mutation, overwrite, delete, or receipt capture occurs.",
        },
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    write_json(root / "tower-runway" / "latest-tower-runway.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Quipsly Tower publishing runway.")
    parser.add_argument("root", nargs="?", type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    root = args.root.expanduser().resolve()
    runway = build_runway(root)
    session_dir = prepare_session_dir(root)
    write_json(session_dir / "tower-runway.json", runway)
    write_json(session_dir / "review-action-cards.json", {
        "schema": "quipsly.tower.review-action-cards.v1",
        "generatedAt": runway["generatedAt"],
        "truth": "Safe local action cards only. These commands do not publish, upload, schedule, approve externally, or mutate media.",
        "episodes": [
            {
                "episode": episode["episode"],
                "version": episode["version"],
                "status": episode["status"],
                "actionCards": episode["actionCards"],
            }
            for episode in runway["episodes"]
        ],
    })
    write_json(session_dir / "social-calendar-draft.json", {
        "schema": "quipsly.tower.social-calendar-draft.v1",
        "generatedAt": runway["generatedAt"],
        "truth": "Draft queue only. No external schedules were created.",
        "items": runway["calendarDraft"],
    })
    write_csvs(session_dir, runway)
    write_markdown(session_dir, runway)
    write_html(session_dir, runway)
    update_pointer(root, session_dir, runway)
    print(json.dumps({
        "ok": True,
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "tower-runway.json"),
        "markdownPath": str(session_dir / "START-HERE-Tower-runway.md"),
        "counts": runway["counts"],
        "truth": runway["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
