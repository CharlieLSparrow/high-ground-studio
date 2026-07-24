#!/usr/bin/env python3
"""Build a Tower manual publishing packet board.

This board joins artifact review state with platform calendar packet rows. It is
manual-publishing prep only: reviewers can see what local files need approval,
what platform packets/checklists exist, and where receipt truth will later be
recorded. It never posts, schedules, uploads, approves, or captures a receipt.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.manual-packet-board.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-manual-packet-board")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as handle:
        return [dict(row) for row in csv.DictReader(handle)]


def load_review_sheet(release_root: Path) -> tuple[dict[str, Any], Path, list[dict[str, str]]]:
    pointer = load_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else pointer
    csv_path = Path(str(packet.get("csvPath") or pointer.get("csvPath") or ""))
    return packet, packet_path if packet_path.exists() else release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json", read_csv_rows(csv_path)


def load_calendar(release_root: Path) -> tuple[dict[str, Any], Path, list[dict[str, str]]]:
    pointer = load_json(release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json")
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else pointer
    csv_path = Path(str(packet.get("csvPath") or pointer.get("csvPath") or ""))
    return packet, packet_path if packet_path.exists() else release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json", read_csv_rows(csv_path)


def episode_number(value: Any) -> int:
    try:
        return int(value)
    except Exception:
        return 0


def group_review_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("episode") or "")].append(row)
    episodes: list[dict[str, Any]] = []
    for episode, episode_rows in sorted(grouped.items(), key=lambda item: episode_number(item[0])):
        decisions = Counter(row.get("currentDecision") or "pending" for row in episode_rows)
        warnings = sum(1 for row in episode_rows if row.get("durationCandidateReviewStatus") or row.get("syncInvestigationStatus"))
        ready_files = sum(1 for row in episode_rows if row.get("primaryPath") and Path(row["primaryPath"]).exists())
        first_open = next((row.get("openCommand") or "" for row in episode_rows if row.get("openCommand")), "")
        episodes.append({
            "episode": episode_number(episode),
            "version": episode_rows[0].get("version") or "",
            "artifactRows": len(episode_rows),
            "readyFiles": ready_files,
            "pending": decisions.get("pending", 0),
            "approve": decisions.get("approve", 0) + decisions.get("approved", 0),
            "refine": decisions.get("refine", 0),
            "hold": decisions.get("hold", 0),
            "reject": decisions.get("reject", 0),
            "warningLinkedRows": warnings,
            "firstOpenCommand": first_open,
            "artifacts": episode_rows,
            "nextSafestAction": "Open local artifacts, inspect warning evidence, then record dry-run review decisions before any approval.",
        })
    return episodes


def packet_path_exists(value: str) -> bool:
    return bool(value) and Path(value).exists()


def annotate_packet_row(row: dict[str, str]) -> dict[str, Any]:
    annotated: dict[str, Any] = dict(row)
    metadata_exists = packet_path_exists(row.get("metadataPath") or "")
    checklist_exists = packet_path_exists(row.get("checklistPath") or "")
    warnings: list[str] = []
    if not metadata_exists:
        warnings.append("missing-metadata-json")
    if not checklist_exists:
        warnings.append("missing-checklist")
    if row.get("draftStatus") == "blocked-by-human-review":
        warnings.append("blocked-by-human-review")
    if not row.get("slotDate"):
        warnings.append("missing-slot-date")
    if not row.get("platform"):
        warnings.append("missing-platform")
    if not row.get("platformKind"):
        warnings.append("missing-platform-kind")
    annotated["metadataExists"] = metadata_exists
    annotated["checklistExists"] = checklist_exists
    annotated["packetWarnings"] = warnings
    annotated["packetWarningSummary"] = ", ".join(warnings) if warnings else "none"
    annotated["packetQuality"] = "packet-ready-after-approval" if not warnings or warnings == ["blocked-by-human-review"] else "packet-needs-attention"
    annotated["localPacketReady"] = metadata_exists and checklist_exists
    return annotated


def group_calendar_rows(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get("slotDate") or "unscheduled")].append(row)
    days: list[dict[str, Any]] = []
    for day, day_rows in sorted(grouped.items()):
        annotated_rows = [annotate_packet_row(row) for row in day_rows]
        status_counts = Counter(str(row.get("draftStatus") or "draft-only") for row in annotated_rows)
        quality_counts = Counter(str(row.get("packetQuality") or "unknown") for row in annotated_rows)
        platforms = sorted({str(row.get("platform") or "") for row in annotated_rows if row.get("platform")})
        days.append({
            "slotDate": day,
            "rows": annotated_rows,
            "rowCount": len(annotated_rows),
            "platforms": platforms,
            "blockedByHumanReview": status_counts.get("blocked-by-human-review", 0),
            "readyForManualPostAfterApproval": status_counts.get("ready-for-manual-post-after-approval", 0),
            "receiptCaptured": status_counts.get("receipt-captured", 0),
            "localPacketReady": sum(1 for row in annotated_rows if row.get("localPacketReady")),
            "packetNeedsAttention": quality_counts.get("packet-needs-attention", 0),
            "packetReadyAfterApproval": quality_counts.get("packet-ready-after-approval", 0),
            "nextSafestAction": "Use as draft order only. Clear review holds and capture real receipts only after explicit manual publication.",
        })
    return days


def build_packet(release_root: Path) -> dict[str, Any]:
    review_packet, review_path, review_rows = load_review_sheet(release_root)
    calendar_packet, calendar_path, calendar_rows = load_calendar(release_root)
    episode_rows = group_review_rows(review_rows)
    calendar_days = group_calendar_rows(calendar_rows)
    annotated_calendar_rows = [row for day in calendar_days for row in day.get("rows", [])]
    review_counts = review_packet.get("counts") if isinstance(review_packet.get("counts"), dict) else {}
    calendar_counts = calendar_packet.get("counts") if isinstance(calendar_packet.get("counts"), dict) else {}
    warning_counts = Counter(warning for row in annotated_calendar_rows for warning in row.get("packetWarnings", []))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "manual-packet-board-review-first",
        "releaseRoot": str(release_root),
        "sourceReviewCommandSheetJson": str(review_path),
        "sourceReviewCommandSheetHtml": review_packet.get("htmlPath") or "",
        "sourceManualCalendarJson": str(calendar_path),
        "sourceManualCalendarHtml": calendar_packet.get("htmlPath") or "",
        "truth": "Manual publishing packet board only. No publish, upload, schedule, approval, account mutation, source mutation, overwrite, or receipt capture occurred.",
        "counts": {
            "episodes": len(episode_rows),
            "artifactReviewRows": len(review_rows),
            "calendarRows": len(calendar_rows),
            "calendarDays": len(calendar_days),
            "platforms": calendar_counts.get("platforms", 0),
            "receiptSlots": review_counts.get("receiptSlots", calendar_counts.get("calendarRows", 0)),
            "capturedReceipts": review_counts.get("capturedReceipts", 0),
            "blockedByReview": calendar_counts.get("blockedByReview", 0),
            "localPacketsReady": sum(1 for row in annotated_calendar_rows if row.get("localPacketReady")),
            "packetRowsNeedingAttention": sum(1 for row in annotated_calendar_rows if row.get("packetQuality") == "packet-needs-attention"),
            "missingMetadataJson": warning_counts.get("missing-metadata-json", 0),
            "missingChecklist": warning_counts.get("missing-checklist", 0),
            "blockedByHumanReview": warning_counts.get("blocked-by-human-review", 0),
            "readyForApproval": 0,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
        },
        "episodeReview": episode_rows,
        "calendarDays": calendar_days,
        "packetWarningCounts": dict(warning_counts),
        "humanAsk": "Use this board as manual publishing prep only: review episode artifacts first, clear human approval gates second, then use packet metadata/checklists for manual posting and paste real receipts afterward.",
        "agentSafeParallelWork": "Codex can improve metadata packets, checklists, platform copy, calendar rows, receipt-slot clarity, and blocker summaries. It must not publish, upload, schedule, approve, mutate accounts, overwrite versions, or create receipt truth.",
        "nextSafestAction": "Start with episode artifact review, then use calendar packets as manual posting prep only after explicit human approval.",
    }


def prepare_output(release_root: Path) -> Path:
    out_dir = release_root / "tower-manual-packet-board" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["slotDate", "episode", "version", "platform", "platformKind", "draftStatus", "packetQuality", "packetWarningSummary", "metadataExists", "checklistExists", "metadataPath", "checklistPath", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for day in packet.get("calendarDays") or []:
            for row in day.get("rows") or []:
                writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    lines = [
        "# Tower manual publishing packet board",
        "",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Status: `{packet['status']}`",
        f"- Episodes: `{counts['episodes']}`",
        f"- Artifact review rows: `{counts['artifactReviewRows']}`",
        f"- Calendar rows: `{counts['calendarRows']}`",
        f"- Local packets ready: `{counts.get('localPacketsReady')}`",
        f"- Packet rows needing attention: `{counts.get('packetRowsNeedingAttention')}`",
        f"- Receipt slots: `{counts['receiptSlots']}`",
        f"- Captured receipts: `{counts['capturedReceipts']}`",
        "",
        packet["truth"],
        "",
        f"Human ask: {packet.get('humanAsk')}",
        "",
        f"Codex-safe parallel work: {packet.get('agentSafeParallelWork')}",
        "",
        f"Next safest action: {packet.get('nextSafestAction')}",
        "",
        "## Episode review first",
        "",
    ]
    for ep in packet.get("episodeReview") or []:
        lines.append(f"- Episode `{ep['episode']}` `{ep['version']}`: `{ep['pending']}` pending artifact decisions, `{ep['readyFiles']}/{ep['artifactRows']}` files present")
    lines.extend(["", "## Calendar packet runway", ""])
    for day in packet.get("calendarDays") or []:
        lines.append(f"- `{day['slotDate']}`: `{day['rowCount']}` packet rows, `{day.get('localPacketReady')}` local packets ready, `{day.get('packetNeedsAttention')}` need packet attention, platforms: {', '.join(day['platforms'])}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    episode_cards = []
    for ep in packet.get("episodeReview") or []:
        artifact_rows = []
        for row in ep.get("artifacts") or []:
            artifact_rows.append(f"""
              <li>
                <b>{esc(row.get('label'))}</b>
                <span>{esc(row.get('currentDecision'))}</span>
                <code>{esc(row.get('primaryPath'))}</code>
              </li>
            """)
        episode_cards.append(f"""
        <article class="episode">
          <h3>Episode {esc(ep.get('episode'))} <small>{esc(ep.get('version'))}</small></h3>
          <p>{esc(ep.get('readyFiles'))}/{esc(ep.get('artifactRows'))} local artifact files present. {esc(ep.get('pending'))} pending decisions.</p>
          <p>{esc(ep.get('nextSafestAction'))}</p>
          <ul>{''.join(artifact_rows)}</ul>
        </article>
        """)
    day_cards = []
    for day in packet.get("calendarDays") or []:
        row_cards = []
        for row in day.get("rows") or []:
            row_cards.append(f"""
            <div class="slot">
              <strong>Ep {esc(row.get('episode'))} - {esc(row.get('platform'))}</strong>
              <span>{esc(row.get('draftStatus'))}</span>
              <span>{esc(row.get('packetQuality'))}</span>
              <p>{esc(row.get('platformKind'))}</p>
              <p>{esc(row.get('packetWarningSummary'))}</p>
              <details><summary>Packet paths</summary>
                <code>{esc(row.get('metadataPath'))}</code>
                <code>{esc(row.get('checklistPath'))}</code>
              </details>
            </div>
            """)
        day_cards.append(f"<section class='day'><h3>{esc(day.get('slotDate'))}</h3><div class='slots'>{''.join(row_cards)}</div></section>")
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower Manual Publishing Packet Board</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111711; --panel:#1d261c; --ink:#fff0d4; --muted:#d2c19f; --gold:#ecc85f; --sky:#90cde0; --moss:#94bd72; --line:rgba(255,240,212,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top, rgba(144,205,224,.2), transparent 30%), linear-gradient(180deg,#162114,#0a1009); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,88px); line-height:.9; max-width:980px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    code {{ display:block; color:var(--gold); overflow-wrap:anywhere; font-size:11px; margin-top:6px; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; padding:22px clamp(16px,4vw,58px); }}
    .stat {{ border:1px solid var(--line); border-radius:24px; padding:16px; background:linear-gradient(180deg,rgba(29,38,28,.96),rgba(10,16,9,.96)); }}
    .stat b {{ display:block; font-size:32px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-weight:900; font-size:11px; }}
    main {{ padding:0 clamp(16px,4vw,58px) 72px; display:grid; gap:20px; }}
    .section {{ border:1px solid var(--line); border-radius:28px; padding:20px; background:rgba(0,0,0,.18); }}
    .episodes {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(290px,1fr)); gap:14px; }}
    .episode, .day {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(255,255,255,.045); }}
    .episode li {{ margin:10px 0; }}
    .episode li span {{ color:var(--sky); margin-left:8px; font-weight:900; }}
    .slots {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:10px; }}
    .slot {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.22); }}
    .slot span {{ display:inline-block; margin-top:6px; color:var(--gold); font-weight:900; font-size:12px; }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower</div>
    <h1>Publishing packets, not pretend publishing.</h1>
    <p>Review artifacts first, then use platform packets as manual posting prep. Receipts stay empty until a real platform URL or proof exists.</p>
    <p><strong>Human ask:</strong> {esc(packet.get('humanAsk'))}</p>
    <p><strong>Next safest action:</strong> {esc(packet.get('nextSafestAction'))}</p>
  </header>
  <section class="stats">
    <div class="stat"><b>{esc(counts.get('episodes'))}</b><span>Episodes</span></div>
    <div class="stat"><b>{esc(counts.get('artifactReviewRows'))}</b><span>Review rows</span></div>
    <div class="stat"><b>{esc(counts.get('calendarRows'))}</b><span>Packet rows</span></div>
    <div class="stat"><b>{esc(counts.get('localPacketsReady'))}</b><span>Local packets ready</span></div>
    <div class="stat"><b>{esc(counts.get('packetRowsNeedingAttention'))}</b><span>Need packet attention</span></div>
    <div class="stat"><b>{esc(counts.get('platforms'))}</b><span>Platforms</span></div>
    <div class="stat"><b>{esc(counts.get('receiptSlots'))}</b><span>Receipt slots</span></div>
    <div class="stat"><b>{esc(counts.get('capturedReceipts'))}</b><span>Receipts</span></div>
  </section>
  <main>
    <section class="section">
      <h2>1. Review the actual artifacts</h2>
      <div class="episodes">{''.join(episode_cards)}</div>
    </section>
    <section class="section">
      <h2>2. Use platform packets as manual prep</h2>
      {''.join(day_cards)}
    </section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Tower manual publishing packet board.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser()
    packet = build_packet(release_root)
    out_dir = prepare_output(release_root)
    json_path = out_dir / "tower-manual-packet-board.json"
    csv_path = out_dir / "tower-manual-packet-board.csv"
    markdown_path = out_dir / "START-HERE-tower-manual-packet-board.md"
    html_path = out_dir / "index.html"
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Tower manual publishing packet board",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local packet/review evidence only. No publish, upload, schedule, approval, account mutation, or receipt capture.",
        },
    })
    write_json(json_path, packet)
    write_csv(csv_path, packet)
    write_markdown(markdown_path, packet)
    write_html(html_path, packet)
    pointer = release_root / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json"
    write_json(pointer, packet)
    print(json.dumps({
        "status": packet["status"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "latestPointer": str(pointer),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
