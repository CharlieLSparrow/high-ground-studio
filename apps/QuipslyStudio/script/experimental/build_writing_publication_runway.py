#!/usr/bin/env python3
"""Build a Tower-style publication runway for Nest writing draft packets.

This reads local NestWriting/DraftPackets artifacts and turns them into a
reviewable publishing runway: draft status, source trail, platform packet
status, receipt slots, and next safe actions. It does not publish, upload,
schedule, mutate source files, or replace canonical manuscripts.
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

DEFAULT_DRAFT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/DraftPackets")
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/WritingRunway")
DEFAULT_POINTER_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(str(value))


def prepare_session(output_root: Path) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    base = output_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S-%f')}-writing-runway"
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def discover_draft_packets(draft_root: Path) -> list[Path]:
    if not draft_root.exists():
        return []
    if draft_root.is_file() and draft_root.name == "draft-packet.json":
        return [draft_root]
    direct_packet = draft_root / "draft-packet.json"
    if direct_packet.exists():
        return [direct_packet]
    return sorted(
        draft_root.glob("*/draft-packet.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )


def receipt_count(tower_handoff: dict[str, Any]) -> int:
    count = 0
    for slot in tower_handoff.get("receiptSlots") or []:
        if slot.get("url") or slot.get("providerId"):
            count += 1
    return count


def normalize_packet(path: Path) -> dict[str, Any]:
    packet = load_json(path)
    safety = packet.get("safety") if isinstance(packet.get("safety"), dict) else {}
    tower = packet.get("towerHandoff") if isinstance(packet.get("towerHandoff"), dict) else {}
    platforms = packet.get("platformPackets") if isinstance(packet.get("platformPackets"), dict) else {}
    draft = packet.get("draftPreview") if isinstance(packet.get("draftPreview"), dict) else {}
    task = packet.get("task") if isinstance(packet.get("task"), dict) else {}
    artifact_paths = packet.get("artifactPaths") if isinstance(packet.get("artifactPaths"), dict) else {}
    platform_rows = []
    for platform, platform_packet in sorted(platforms.items()):
        platform_packet = platform_packet if isinstance(platform_packet, dict) else {}
        platform_rows.append({
            "platform": platform,
            "status": platform_packet.get("status") or "draft-only",
            "type": platform_packet.get("type") or "",
            "title": platform_packet.get("title") or platform_packet.get("titleDraft") or draft.get("headline") or task.get("title"),
            "needsReceipt": True,
        })
    try:
        version_mtime = path.stat().st_mtime
    except OSError:
        version_mtime = 0.0
    title = draft.get("headline") or task.get("title") or path.parent.name
    html_path = artifact_paths.get("html") or str(path.parent / "index.html")
    markdown_path = artifact_paths.get("markdown") or str(path.parent / "START-HERE-draft-packet.md")
    source_count = len(packet.get("sources") or [])
    next_safest_action = "Review draft packet against source trail, then approve platform copy or request revision. Capture receipts only after real external URLs exist."
    return {
        "id": task.get("id") or path.parent.name,
        "title": title,
        "type": task.get("type") or draft.get("kind") or "draft",
        "versionLabel": path.parent.name,
        "versionCreatedAt": packet.get("generatedAt") or "",
        "versionMtime": version_mtime,
        "historyCount": 0,
        "historyVersions": [],
        "sessionDir": str(path.parent),
        "jsonPath": str(path),
        "htmlPath": html_path,
        "markdownPath": markdown_path,
        "towerHandoffPath": artifact_paths.get("towerHandoff") or str(path.parent / "tower-handoff.json"),
        "platformPacketsPath": artifact_paths.get("platformPackets") or str(path.parent / "platform-packets.json"),
        "sourceCount": source_count,
        "draftStatus": draft.get("draftStatus") or "draft-preview-needs-human-review",
        "towerStatus": tower.get("status") or "draft-ready-for-human-review",
        "platformRows": platform_rows,
        "receiptSlots": tower.get("receiptSlots") or [],
        "receiptCount": receipt_count(tower),
        "safety": {
            "sourceFilesMutated": safety.get("sourceFilesMutated") is True,
            "externalPublishing": safety.get("externalPublishing") is True,
            "canonicalManuscriptReplaced": safety.get("canonicalManuscriptReplaced") is True,
            "previousVersionsOverwritten": safety.get("previousVersionsOverwritten") is True,
        },
        "primaryLabel": f"Open draft packet: {title}",
        "primaryPath": html_path,
        "primaryCommand": f"open {shell_quote(html_path)}",
        "humanAsk": f"Review this draft against its {source_count} visible source trail item(s). Decide whether it needs human rewrite, agent revision, mixed-authorship review, or publication prep.",
        "agentSafeParallelWork": "Prepare comparison notes, platform-copy packets, and revision suggestions. Do not mutate source files, replace the canonical manuscript, publish, schedule, upload, or create receipts.",
        "nextSafestAction": next_safest_action,
    }


def collapse_current_drafts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep the latest visible draft per task while preserving older versions as history."""
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row.get("id") or row.get("jsonPath")), []).append(row)
    current_rows: list[dict[str, Any]] = []
    for _, versions in grouped.items():
        ordered = sorted(
            versions,
            key=lambda item: (float(item.get("versionMtime") or 0), str(item.get("jsonPath") or "")),
            reverse=True,
        )
        current = dict(ordered[0])
        history = []
        for older in ordered[1:]:
            history.append({
                "versionLabel": older.get("versionLabel"),
                "generatedAt": older.get("versionCreatedAt"),
                "sessionDir": older.get("sessionDir"),
                "jsonPath": older.get("jsonPath"),
                "htmlPath": older.get("htmlPath"),
                "markdownPath": older.get("markdownPath"),
                "draftStatus": older.get("draftStatus"),
                "receiptCount": older.get("receiptCount"),
            })
        current["historyCount"] = len(history)
        current["historyVersions"] = history
        current_rows.append(current)
    return sorted(
        current_rows,
        key=lambda item: (float(item.get("versionMtime") or 0), str(item.get("title") or "")),
        reverse=True,
    )


def summarize(rows: list[dict[str, Any]], total_versions: int | None = None) -> dict[str, int]:
    platform_items = sum(len(row.get("platformRows") or []) for row in rows)
    receipt_slots = sum(len(row.get("receiptSlots") or []) for row in rows)
    receipts = sum(row.get("receiptCount", 0) for row in rows)
    version_total = total_versions if total_versions is not None else len(rows)
    unsafe = sum(
        1 for row in rows
        if any(row.get("safety", {}).values())
    )
    return {
        "draftPackets": len(rows),
        "currentDrafts": len(rows),
        "totalDraftVersions": version_total,
        "olderVersionsPreserved": max(0, version_total - len(rows)),
        "pendingHumanReview": sum(1 for row in rows if "review" in str(row.get("draftStatus") or "").lower()),
        "platformDraftItems": platform_items,
        "receiptSlots": receipt_slots,
        "capturedReceipts": receipts,
        "unsafePackets": unsafe,
    }


def first_review_target(rows: list[dict[str, Any]], runway_html_path: Path) -> dict[str, Any]:
    if rows:
        first = rows[0]
        return {
            "label": f"Open draft packet: {first.get('title') or first.get('id')}",
            "path": str(first.get("htmlPath") or first.get("markdownPath") or first.get("jsonPath") or runway_html_path),
            "draftId": str(first.get("id") or ""),
            "title": str(first.get("title") or ""),
            "versionLabel": str(first.get("versionLabel") or ""),
        }
    return {
        "label": "Open writing publication runway",
        "path": str(runway_html_path),
        "draftId": "",
        "title": "",
        "versionLabel": "",
    }


def next_runway_action(counts: dict[str, int], rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "Generate a source-backed draft packet from the Nest writing workbench before preparing platform copy or receipt slots."
    if counts.get("unsafePackets", 0):
        return "Inspect unsafe draft packets before any review or platform packet work; source mutation and external publishing must remain false."
    if counts.get("pendingHumanReview", 0):
        return "Open the first current draft packet, compare it against the source trail, then approve platform copy or request revision. Capture receipts only after real external URLs exist."
    if counts.get("capturedReceipts", 0) < counts.get("receiptSlots", 0):
        return "Review approved platform copy, then manually publish only with explicit approval and capture real URLs/provider IDs as receipts."
    return "Audit captured receipt slots against live platform URLs before marking the writing runway complete."


def publication_contract(counts: dict[str, int]) -> dict[str, Any]:
    return {
        "mode": "draft-to-publication-runway",
        "assistantMayDraft": True,
        "assistantMayPreparePlatformCopy": True,
        "humanApprovalRequiredBeforeExternalPublish": True,
        "externalPublishingBlockedHere": True,
        "receiptTruthRequiresExternalUrl": True,
        "canonicalWriteBlockedHere": True,
        "summary": "This runway can prepare serious platform packets and revision advice, but publishing truth starts only when a real external receipt or URL exists.",
        "counts": counts,
    }


def publication_source_tasks(rows: list[dict[str, Any]]) -> list[dict[str, str]]:
    first_title = str((rows[0] if rows else {}).get("title") or "the first current draft")
    return [
        {
            "label": "Open current draft packet",
            "why": f"Review {first_title} against its source trail before platform promotion.",
            "safety": "Local evidence only; no external accounts touched.",
        },
        {
            "label": "Review platform packets",
            "why": "Prepare YouTube, Patreon, article, episode-page, and social copy without pretending it has shipped.",
            "safety": "Draft platform copy only.",
        },
        {
            "label": "Request revision or approve for manual publishing",
            "why": "Separate writing quality from publication mechanics.",
            "safety": "Human decision point; no upload/schedule here.",
        },
        {
            "label": "Capture receipts after real publication",
            "why": "Tower truth should be based on real URLs/provider IDs, not optimism.",
            "safety": "Only after an explicit external publishing action.",
        },
    ]


def write_csvs(session_dir: Path, rows: list[dict[str, Any]]) -> tuple[Path, Path]:
    platform_csv = session_dir / "writing-platform-queue.csv"
    receipt_csv = session_dir / "writing-receipt-slots.csv"
    with platform_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draftId", "title", "versionLabel", "historyCount", "platform", "type", "status", "packetPath", "nextAction"])
        writer.writeheader()
        for row in rows:
            for platform in row.get("platformRows") or []:
                writer.writerow({
                    "draftId": row.get("id"),
                    "title": row.get("title"),
                    "versionLabel": row.get("versionLabel"),
                    "historyCount": row.get("historyCount"),
                    "platform": platform.get("platform"),
                    "type": platform.get("type"),
                    "status": platform.get("status"),
                    "packetPath": row.get("platformPacketsPath"),
                    "nextAction": row.get("nextSafestAction"),
                })
    with receipt_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["draftId", "title", "versionLabel", "platform", "status", "url", "providerId", "receiptTruth"])
        writer.writeheader()
        for row in rows:
            for slot in row.get("receiptSlots") or []:
                writer.writerow({
                    "draftId": row.get("id"),
                    "title": row.get("title"),
                    "versionLabel": row.get("versionLabel"),
                    "platform": slot.get("platform"),
                    "status": slot.get("status"),
                    "url": slot.get("url") or "",
                    "providerId": slot.get("providerId") or "",
                    "receiptTruth": "not published unless URL/provider receipt is present",
                })
    return platform_csv, receipt_csv


def write_markdown(path: Path, runway: dict[str, Any]) -> None:
    counts = runway["counts"]
    lines = [
        "# Nest writing publication runway",
        "",
        f"Generated: {runway['generatedAt']}",
        "",
        runway["truth"],
        "",
        f"First safe action: {runway['nextSafestAction']}",
        "",
        "## Human/agent contract",
        "",
        f"- Human ask: {runway.get('humanAsk')}",
        f"- Agent-safe parallel work: {runway.get('agentSafeParallelWork')}",
        f"- Contract: {(runway.get('publicationContract') or {}).get('summary') if isinstance(runway.get('publicationContract'), dict) else ''}",
        "",
        "## Counts",
        "",
        f"- Current draft packets: {counts['currentDrafts']}",
        f"- Total draft versions preserved: {counts['totalDraftVersions']}",
        f"- Older versions preserved in history: {counts['olderVersionsPreserved']}",
        f"- Pending human review: {counts['pendingHumanReview']}",
        f"- Platform draft items: {counts['platformDraftItems']}",
        f"- Receipt slots: {counts['receiptSlots']}",
        f"- Captured receipts: {counts['capturedReceipts']}",
        f"- Unsafe packets: {counts['unsafePackets']}",
        "",
        "## Draft packets",
        "",
        "| Draft | Current version | History | Type | Sources | Status | Receipts | Human ask | Next action |",
        "| --- | --- | ---: | --- | ---: | --- | ---: | --- | --- |",
    ]
    for row in runway.get("drafts") or []:
        lines.append(
            f"| [{row['title']}]({row['htmlPath']}) | `{row.get('versionLabel')}` | {row.get('historyCount', 0)} | {row['type']} | {row['sourceCount']} | {row['draftStatus']} | {row['receiptCount']} | {row.get('humanAsk') or ''} | {row['nextSafestAction']} |"
        )
    lines.extend([
        "",
        "## Safety",
        "",
        "- Source files mutated: false expected.",
        "- External publishing: false expected.",
        "- Canonical manuscript replacement: false expected.",
        "- Receipt slots stay empty until real external URLs or provider IDs exist.",
        "",
        "## Files",
        "",
        f"- JSON: `{runway['jsonPath']}`",
        f"- Platform queue: `{runway['platformQueueCsvPath']}`",
        f"- Receipt slots: `{runway['receiptSlotsCsvPath']}`",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, runway: dict[str, Any]) -> None:
    counts = runway["counts"]
    cards = []
    for row in runway.get("drafts") or []:
        platforms = "".join(
            f"<span>{html.escape(str(platform.get('platform')))}: {html.escape(str(platform.get('status')))}</span>"
            for platform in row.get("platformRows") or []
        )
        cards.append(f"""
          <article>
            <div class="eyebrow">{html.escape(str(row.get('type')))}</div>
            <h2>{html.escape(str(row.get('title')))}</h2>
            <p><strong>Human ask:</strong> {html.escape(str(row.get('humanAsk') or 'Review against source trail.'))}</p>
            <p><strong>Agent-safe work:</strong> {html.escape(str(row.get('agentSafeParallelWork') or 'Prepare notes and packets without mutating sources.'))}</p>
            <p>{html.escape(str(row.get('nextSafestAction')))}</p>
            <div class="meta">
              <span>current: {html.escape(str(row.get('versionLabel')))}</span>
              <span>{row.get('historyCount', 0)} older versions</span>
              <span>{row.get('sourceCount')} sources</span>
              <span>{row.get('receiptCount')} receipts</span>
              <span>{html.escape(str(row.get('draftStatus')))}</span>
            </div>
            <div class="platforms">{platforms}</div>
            <p><strong>Primary command:</strong> <code>{html.escape(str(row.get('primaryCommand') or ''))}</code></p>
            <p><a href="{html.escape(str(row.get('htmlPath')))}">Open draft packet</a></p>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Publication Runway</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1d2a20; --ink:#fbf0d8; --muted:#c9bda0; --gold:#eac95f; --moss:#90bf73; --line:rgba(251,240,216,.16); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top left, rgba(144,191,115,.18), transparent 36%), var(--bg); }}
    header {{ padding:34px clamp(20px,5vw,76px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(38px,6vw,82px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.55; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; padding:24px clamp(16px,4vw,56px); }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(0,0,0,.18); }}
    .stat b {{ display:block; font-size:30px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; padding:0 clamp(16px,4vw,56px) 64px; }}
    article {{ border:1px solid var(--line); border-radius:24px; padding:18px; background:linear-gradient(180deg,var(--panel),#121a14); }}
    h2 {{ font-size:21px; line-height:1.1; margin:10px 0; }}
    .meta,.platforms {{ display:flex; gap:7px; flex-wrap:wrap; margin-top:12px; }}
    .meta span,.platforms span {{ border:1px solid var(--line); border-radius:999px; padding:6px 8px; color:var(--muted); font-size:11px; font-weight:800; }}
    a {{ color:var(--gold); }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower + Nest</div>
    <h1>Drafts are ready to review, not magically published.</h1>
    <p>{html.escape(runway['truth'])}</p>
    <p><strong>Human ask:</strong> {html.escape(str(runway.get('humanAsk') or 'Review the draft packet against source trail before promotion.'))}</p>
    <p><strong>Agent-safe work:</strong> {html.escape(str(runway.get('agentSafeParallelWork') or 'Prepare packets and revision notes without publishing.'))}</p>
    <p><strong>First safe action:</strong> {html.escape(str(runway.get('nextSafestAction') or 'Open the first draft packet and compare it to its source trail.'))}</p>
  </header>
  <div class="stats">
    <div class="stat"><b>{counts['currentDrafts']}</b><span>Current drafts</span></div>
    <div class="stat"><b>{counts['olderVersionsPreserved']}</b><span>Older versions</span></div>
    <div class="stat"><b>{counts['pendingHumanReview']}</b><span>Review</span></div>
    <div class="stat"><b>{counts['platformDraftItems']}</b><span>Platform drafts</span></div>
    <div class="stat"><b>{counts['receiptSlots']}</b><span>Receipt slots</span></div>
    <div class="stat"><b>{counts['capturedReceipts']}</b><span>Receipts</span></div>
  </div>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def build_runway(draft_root: Path, output_root: Path) -> dict[str, Any]:
    session_dir = prepare_session(output_root)
    all_rows = [normalize_packet(path) for path in discover_draft_packets(draft_root)]
    rows = collapse_current_drafts(all_rows)
    platform_csv, receipt_csv = write_csvs(session_dir, rows)
    json_path = session_dir / "writing-publication-runway.json"
    md_path = session_dir / "START-HERE-writing-publication-runway.md"
    html_path = session_dir / "index.html"
    counts = summarize(rows, total_versions=len(all_rows))
    review_target = first_review_target(rows, html_path)
    next_action = next_runway_action(counts, rows)
    contract = publication_contract(counts)
    first_safe_action = {
        "label": review_target["label"],
        "command": f"open {shell_quote(review_target['path'])}",
        "openCommand": f"open {shell_quote(review_target['path'])}",
        "path": review_target["path"],
        "draftId": review_target["draftId"],
        "title": review_target["title"],
        "versionLabel": review_target["versionLabel"],
        "nextSafestAction": next_action,
        "safety": "Opens local writing review evidence only. It does not publish, schedule, upload, replace manuscripts, mutate sources, or create receipts.",
    }
    runway = {
        "schema": "quipsly.nest-writing.publication-runway.v2",
        "generatedAt": iso_now(),
        "draftRoot": str(draft_root),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "platformQueueCsvPath": str(platform_csv),
        "receiptSlotsCsvPath": str(receipt_csv),
        "truth": "Local writing publication runway only. Draft readiness, human approval, and external receipts remain separate.",
        "humanAsk": "Review current drafts against their source trails, choose revise/approve/hold, and only then use platform packets for manual publication.",
        "agentSafeParallelWork": "Prepare platform copy, revision notes, source comparisons, metadata packets, and receipt slots. Do not publish, schedule, upload, replace manuscripts, mutate sources, or create receipt truth.",
        "publicationContract": contract,
        "draftContract": contract,
        "sourceTasks": publication_source_tasks(rows),
        "status": (
            "needs-human-review"
            if counts.get("pendingHumanReview", 0)
            else "needs-receipts"
            if counts.get("receiptSlots", 0) and counts.get("capturedReceipts", 0) < counts.get("receiptSlots", 0)
            else "runway-ready"
        ),
        "counts": counts,
        "drafts": rows,
        "allDraftVersionCount": len(all_rows),
        "nextSafestAction": next_action,
        "firstSafeAction": first_safe_action,
        "firstReviewCommand": first_safe_action["command"],
        "receiptCommandSafety": "Receipt slots are placeholders until a real external URL or provider ID exists. This runway never claims publication without receipt evidence.",
        "externalPublishing": False,
        "sourceFilesMutated": False,
    }
    write_json(json_path, runway)
    write_markdown(md_path, runway)
    write_html(html_path, runway)
    pointer = {
        "schema": "quipsly.nest-writing.latest-publication-runway.v1",
        "updatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "platformQueueCsvPath": str(platform_csv),
        "receiptSlotsCsvPath": str(receipt_csv),
        "status": runway["status"],
        "counts": runway["counts"],
        "humanAsk": runway["humanAsk"],
        "agentSafeParallelWork": runway["agentSafeParallelWork"],
        "publicationContract": runway["publicationContract"],
        "draftContract": runway["draftContract"],
        "sourceTasks": runway["sourceTasks"],
        "nextSafestAction": runway["nextSafestAction"],
        "firstSafeAction": runway["firstSafeAction"],
        "firstReviewCommand": runway["firstReviewCommand"],
        "receiptCommandSafety": runway["receiptCommandSafety"],
        "truth": "Pointer only. Versioned writing runway sessions are preserved.",
    }
    write_json(DEFAULT_POINTER_ROOT / "latest-writing-publication-runway.json", pointer)
    return runway


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a local writing publication runway from Nest draft packets.")
    parser.add_argument("draft_root", nargs="?", default=str(DEFAULT_DRAFT_ROOT))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    args = parser.parse_args()
    runway = build_runway(Path(args.draft_root).expanduser(), Path(args.output_root).expanduser())
    print(json.dumps({
        "ok": True,
        "sessionDir": runway["sessionDir"],
        "htmlPath": runway["htmlPath"],
        "jsonPath": runway["jsonPath"],
        "markdownPath": runway["markdownPath"],
        "counts": runway["counts"],
        "sourceFilesMutated": False,
        "externalPublishing": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
