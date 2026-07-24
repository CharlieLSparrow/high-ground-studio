#!/usr/bin/env python3
"""Build a draft-only Tower manual publishing calendar.

This is a Hootsuite-like planning surface over the Tower social command center.
It assigns local draft slots to platform packets so reviewers can see the runway,
but it does not schedule, publish, upload, mutate accounts, or create receipts.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.manual-publishing-calendar.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-tower-manual-calendar")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def open_command(path_value: Any) -> str:
    path_text = str(path_value or "")
    return f"open {shell_quote(path_text)}" if path_text else ""


def load_social_command_center(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "tower-social-command-center" / "latest-tower-social-command-center.json"
    pointer = load_json(pointer_path)
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    if not packet:
        raise SystemExit("No Tower social command center found. Run ./script/agentctl.sh tower-social-command-center first.")
    return pointer, packet, packet_path


def platform_slot_offset(platform_order: int) -> int:
    return max(0, platform_order - 1)


def draft_status_for(item: dict[str, Any]) -> str:
    stage = str(item.get("stage") or "")
    if item.get("receiptStatus") not in {"", "not_published", None}:
        return "receipt-captured"
    if stage in {"approved-local-ready-no-receipts", "ready-for-approval"}:
        return "ready-for-manual-post-after-approval"
    if stage == "diagnostic-review-hold":
        return "blocked-by-diagnostic-hold"
    if stage == "needs-human-review":
        return "blocked-by-human-review"
    if stage:
        return f"blocked-by-{stage}"
    return "draft-only-needs-review"


def row_work_mode(draft_status: str) -> tuple[str, str, str]:
    if draft_status == "receipt-captured":
        return (
            "verify-receipt",
            "Confirm the URL/provider receipt is real before analytics or public claims.",
            "Prepare receipt verification notes and analytics placeholders; do not invent performance data.",
        )
    if draft_status == "ready-for-manual-post-after-approval":
        return (
            "approval-needed",
            "Get exact human approval for this episode, platform, version, and action before any external post.",
            "Prepare copy/paste packet and receipt slot only; do not post, schedule, upload, or approve.",
        )
    if draft_status.startswith("blocked"):
        return (
            "clear-review-blocker",
            "Resolve the local review/warning hold before treating this platform packet as usable.",
            "Summarize the blocker and improve local packet clarity without external action.",
        )
    return (
        "packet-prep",
        "Use this as draft packet prep only; review local evidence before approval.",
        "Improve metadata/checklist/copy clarity without external publishing.",
    )


def row_for(item: dict[str, Any], base_date: date) -> dict[str, Any]:
    try:
        episode = int(item.get("episode") or 0)
    except (TypeError, ValueError):
        episode = 0
    try:
        platform_order = int(item.get("platformOrder") or 1)
    except (TypeError, ValueError):
        platform_order = 1
    episode_offset = max(episode - 1, 0) * 2
    slot_date = base_date + timedelta(days=episode_offset + platform_slot_offset(platform_order))
    draft_status = draft_status_for(item)
    work_mode, human_question, agent_safe_work = row_work_mode(draft_status)
    return {
        "slotDate": slot_date.isoformat(),
        "episode": episode,
        "version": item.get("version") or "",
        "platform": item.get("platform") or "",
        "platformKind": item.get("platformKind") or "",
        "stage": item.get("stage") or "",
        "stageLabel": item.get("stageLabel") or "",
        "draftStatus": draft_status,
        "workMode": work_mode,
        "humanQuestion": human_question,
        "agentSafeParallelWork": agent_safe_work,
        "draftScheduleStatus": item.get("draftScheduleStatus") or "draft-only-not-scheduled",
        "packetStatus": item.get("packetStatus") or "",
        "metadataPath": item.get("metadataPath") or "",
        "checklistPath": item.get("checklistPath") or "",
        "uploadJobPath": item.get("uploadJobPath") or "",
        "receiptCommandTemplate": item.get("receiptCommandTemplate") or "",
        "nextSafestAction": item.get("nextSafestAction") or "Review local package before publication.",
        "externalActionTaken": bool(item.get("externalActionTaken")),
        "truth": "Draft calendar row only. No external schedule, upload, post, approval, account mutation, or receipt capture occurred.",
    }


def start_here_today(rows: list[dict[str, Any]]) -> dict[str, Any]:
    priority_order = {
        "clear-review-blocker": 0,
        "approval-needed": 1,
        "packet-prep": 2,
        "verify-receipt": 3,
    }
    if not rows:
        return {
            "mode": "empty-calendar",
            "title": "No draft rows yet",
            "why": "Generate Tower social command center rows before calendar work.",
            "safeAction": "Run tower-social-command-center and rebuild the manual calendar.",
        }
    first = sorted(rows, key=lambda row: (priority_order.get(str(row.get("workMode")), 99), row.get("slotDate"), row.get("episode"), str(row.get("platform"))))[0]
    return {
        "mode": first.get("workMode") or "packet-prep",
        "title": f"Episode {first.get('episode')} - {first.get('platform')}",
        "slotDate": first.get("slotDate") or "",
        "draftStatus": first.get("draftStatus") or "",
        "why": first.get("humanQuestion") or "",
        "safeAction": first.get("nextSafestAction") or "",
        "agentMove": first.get("agentSafeParallelWork") or "",
        "truth": first.get("truth") or "",
    }


def build_packet(release_root: Path, start_date: str | None = None) -> dict[str, Any]:
    pointer, command_center, command_center_path = load_social_command_center(release_root)
    if start_date:
        base_date = date.fromisoformat(start_date)
    else:
        base_date = datetime.now(timezone.utc).date()
    items = [item for item in (command_center.get("items") or []) if isinstance(item, dict)]
    rows = sorted(
        [row_for(item, base_date) for item in items],
        key=lambda row: (row["slotDate"], row["episode"], str(row["platform"])),
    )
    by_date: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_date.setdefault(str(row["slotDate"]), []).append(row)
    by_status: dict[str, int] = {}
    by_work_mode: dict[str, int] = {}
    for row in rows:
        by_status[str(row.get("draftStatus") or "unknown")] = by_status.get(str(row.get("draftStatus") or "unknown"), 0) + 1
        by_work_mode[str(row.get("workMode") or "unknown")] = by_work_mode.get(str(row.get("workMode") or "unknown"), 0) + 1
    counts = {
        "calendarRows": len(rows),
        "dates": len(by_date),
        "episodes": len({row["episode"] for row in rows if row["episode"]}),
        "platforms": len({row["platform"] for row in rows if row["platform"]}),
        "blockedByReview": sum(1 for row in rows if str(row["draftStatus"]).startswith("blocked")),
        "readyForManualPostAfterApproval": sum(1 for row in rows if row["draftStatus"] == "ready-for-manual-post-after-approval"),
        "capturedReceipts": sum(1 for row in rows if row["draftStatus"] == "receipt-captured"),
        "approvalNeededRows": by_work_mode.get("approval-needed", 0),
        "clearReviewBlockerRows": by_work_mode.get("clear-review-blocker", 0),
        "packetPrepRows": by_work_mode.get("packet-prep", 0),
        "verifyReceiptRows": by_work_mode.get("verify-receipt", 0),
        "externalSchedulesCreated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sourceSocialCommandCenterPointer": str(release_root / "tower-social-command-center" / "latest-tower-social-command-center.json"),
        "sourceSocialCommandCenterJson": str(command_center_path),
        "sourceSocialCommandCenterHtml": pointer.get("htmlPath") or command_center.get("htmlPath") or "",
        "startDate": base_date.isoformat(),
        "truth": "Manual publishing calendar only. It creates local draft slots and does not schedule, publish, upload, mutate accounts, approve, or capture receipts.",
        "counts": counts,
        "statusBreakdown": by_status,
        "workModeBreakdown": by_work_mode,
        "startHereToday": start_here_today(rows),
        "rows": rows,
        "byDate": by_date,
        "nextSafestAction": "Use the calendar to see draft packet order, but clear human review/warning holds before any explicitly approved manual posting.",
    }


def prepare_output_dir(release_root: Path) -> Path:
    out_dir = release_root / "tower-manual-calendar" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["slotDate", "episode", "version", "platform", "platformKind", "draftStatus", "workMode", "humanQuestion", "agentSafeParallelWork", "stage", "metadataPath", "checklistPath", "receiptCommandTemplate", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("rows") or []:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Tower manual publishing calendar",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Start date: `{packet['startDate']}`",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        "## Start here today",
        "",
        f"- Mode: `{(packet.get('startHereToday') or {}).get('mode')}`",
        f"- Row: `{(packet.get('startHereToday') or {}).get('title')}`",
        f"- Why: {(packet.get('startHereToday') or {}).get('why')}",
        f"- Agent move: {(packet.get('startHereToday') or {}).get('agentMove')}",
        "",
    ]
    for day, rows in packet.get("byDate", {}).items():
        lines.extend([f"## {day}", ""])
        for row in rows:
            lines.extend([
                f"- Episode `{row.get('episode')}` `{row.get('platform')}` - `{row.get('draftStatus')}`",
                f"  - Work mode: `{row.get('workMode')}`",
                f"  - Human question: {row.get('humanQuestion')}",
                f"  - Stage: `{row.get('stage')}`",
                f"  - Metadata: `{row.get('metadataPath')}`",
                f"  - Checklist: `{row.get('checklistPath')}`",
                f"  - Receipt template: `{row.get('receiptCommandTemplate')}`",
            ])
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    day_sections: list[str] = []
    start = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    for day, rows in packet.get("byDate", {}).items():
        cards = []
        for row in rows:
            cards.append(f"""
            <article class="slot {esc(row.get('draftStatus'))}">
              <div><strong>Episode {esc(row.get('episode'))}</strong><span>{esc(row.get('platform'))}</span></div>
              <p>{esc(row.get('platformKind'))}</p>
              <p class="status">{esc(row.get('draftStatus'))}</p>
              <p class="mode">{esc(row.get('workMode'))}</p>
              <p><b>Human question:</b> {esc(row.get('humanQuestion'))}</p>
              <p>{esc(row.get('nextSafestAction'))}</p>
              <details><summary>Packet paths and receipt slot</summary>
                <code>{esc(row.get('metadataPath'))}</code>
                <code>{esc(row.get('checklistPath'))}</code>
                <code>{esc(row.get('receiptCommandTemplate'))}</code>
              </details>
            </article>
            """)
        day_sections.append(f"<section class=\"day\"><h2>{esc(day)}</h2><div class=\"slots\">{''.join(cards)}</div></section>")
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower Manual Publishing Calendar</title>
  <style>
    :root {{ color-scheme:dark; --bg:#11170f; --panel:#1d2519; --ink:#fff0d4; --muted:#d4c2a0; --gold:#edc85d; --sky:#88cddd; --moss:#94bd72; --clay:#c97958; --line:rgba(255,240,212,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 50% -10%, rgba(136,205,221,.2), transparent 32%), linear-gradient(180deg,#172115,#0b1009); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,84px); line-height:.92; }}
    h2 {{ color:var(--gold); }}
    p {{ color:var(--muted); line-height:1.45; }}
    .summary {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:16px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:18px; }}
    .day {{ border:1px solid var(--line); border-radius:28px; padding:20px; background:linear-gradient(180deg,rgba(29,37,25,.97),rgba(10,14,8,.98)); }}
    .slots {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }}
    .slot {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.22); }}
    .slot div {{ display:flex; justify-content:space-between; gap:10px; color:var(--ink); }}
    .slot span {{ color:var(--sky); font-weight:900; }}
    .status {{ color:var(--gold); font-weight:900; }}
    .mode {{ color:var(--sky); font-weight:900; text-transform:uppercase; letter-spacing:.08em; font-size:.8rem; }}
    .blocked-by-diagnostic-hold, .blocked-by-human-review {{ border-color:rgba(201,121,88,.6); }}
    .ready-for-manual-post-after-approval {{ border-color:rgba(148,189,114,.7); }}
    details {{ margin-top:10px; }}
    code {{ display:block; color:var(--sky); overflow-wrap:anywhere; margin-top:6px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower draft calendar</div>
    <h1>A publishing runway that knows the difference between ready and posted.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary">
      <span>{packet['counts']['calendarRows']} draft rows</span>
      <span>{packet['counts']['dates']} draft dates</span>
      <span>{packet['counts']['blockedByReview']} blocked/review</span>
      <span>{packet['counts']['capturedReceipts']} receipts</span>
      <span>{packet['counts']['approvalNeededRows']} approval needed</span>
      <span>{packet['counts']['packetPrepRows']} packet prep</span>
    </div>
  </header>
  <main>
    <section class="day">
      <h2>Start here today</h2>
      <p><strong>{esc(start.get('title'))}</strong> · {esc(start.get('mode'))} · {esc(start.get('draftStatus'))}</p>
      <p>{esc(start.get('why'))}</p>
      <p><b>Codex can do:</b> {esc(start.get('agentMove'))}</p>
      <p>{esc(start.get('truth'))}</p>
    </section>
    {''.join(day_sections)}
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(release_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    rows = packet.get("rows") if isinstance(packet.get("rows"), list) else []
    first_row = rows[0] if rows and isinstance(rows[0], dict) else {}
    pointer = {
        "schema": "quipsly.tower.latest-manual-calendar.v1",
        "status": packet.get("status") or "tower-manual-calendar-ready",
        "updatedAt": iso_now(),
        "humanAsk": "Use this calendar as a draft posting map only; clear local review holds and explicitly approve any external publishing action first.",
        "agentSafeParallelWork": "Codex may improve packet order, metadata drafts, receipt slots, and calendar clarity. Do not schedule, publish, upload, send, mutate accounts, approve, or create receipt truth.",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "statusBreakdown": packet.get("statusBreakdown") or {},
        "workModeBreakdown": packet.get("workModeBreakdown") or {},
        "startHereToday": packet.get("startHereToday") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "Use the calendar only after local review state is clear.",
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "sourceSocialCommandCenterJson": packet.get("sourceSocialCommandCenterJson") or "",
        "firstCalendarRow": {
            "slotDate": first_row.get("slotDate") or "",
            "episode": first_row.get("episode") or "",
            "platform": first_row.get("platform") or "",
            "draftStatus": first_row.get("draftStatus") or "",
            "stage": first_row.get("stage") or "",
            "metadataPath": first_row.get("metadataPath") or "",
            "checklistPath": first_row.get("checklistPath") or "",
            "receiptCommandTemplate": first_row.get("receiptCommandTemplate") or "",
            "nextSafestAction": first_row.get("nextSafestAction") or "",
            "truth": first_row.get("truth") or "",
        },
        "truth": packet.get("truth") or "",
    }
    write_json(release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json", pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a draft-only Tower manual publishing calendar.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--start-date", default="")
    args = parser.parse_args()

    release_root = Path(args.release_root)
    packet = build_packet(release_root, args.start_date or None)
    out_dir = prepare_output_dir(release_root)
    json_path = out_dir / "tower-manual-calendar.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-Tower-manual-calendar.md"
    csv_path = out_dir / "tower-manual-calendar.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Tower manual publishing calendar",
            "command": open_command(html_path),
            "path": str(html_path),
            "safety": "Opens the local draft-only manual calendar. It does not schedule, publish, upload, approve, mutate accounts, or create receipt truth.",
        },
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(release_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
