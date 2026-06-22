#!/usr/bin/env python3
"""Track segmented watch/listen review progress for selected Episode 1 artifacts.

This is a progress ledger, not an approval decision. It lets humans and agents
review the selected 16:9 master, 9:16 master, and podcast audio in manageable
time chunks. Final artifact approval still flows through
`episode1-artifact-watch-review-decision`.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

SEGMENT_SECONDS = 900.0


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: str) -> dict[str, Any] | None:
    if not path or not os.path.exists(path):
        return None
    try:
        return load_json(path)
    except Exception as error:
        return {"_loadError": str(error), "_path": path}


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def fmt_time(seconds: float | int | None) -> str:
    if seconds is None:
        return "--:--"
    whole = max(0, int(round(float(seconds))))
    hours = whole // 3600
    minutes = (whole % 3600) // 60
    secs = whole % 60
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def selected_artifacts(station: dict[str, Any]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for item in station.get("selectedArtifacts") or []:
        artifact_id = item.get("artifactId")
        duration = item.get("durationSeconds")
        artifacts.append(
            {
                "artifactId": artifact_id,
                "path": item.get("path"),
                "durationSeconds": duration,
                "kind": "audio" if artifact_id == "podcast-audio-master" else "video",
            }
        )
    return artifacts


def build_segments(duration: float) -> list[dict[str, Any]]:
    segments: list[dict[str, Any]] = []
    index = 1
    start = 0.0
    while start < duration:
        end = min(duration, start + SEGMENT_SECONDS)
        segments.append(
            {
                "segmentId": f"segment-{index:03d}",
                "startSeconds": round(start, 3),
                "endSeconds": round(end, 3),
                "label": f"{fmt_time(start)} - {fmt_time(end)}",
            }
        )
        index += 1
        start = end
    return segments


def initial_packet(station: dict[str, Any], assist: dict[str, Any] | None, station_path: str, assist_path: str, current_path: str, ledger_path: str, html_path: str, md_path: str) -> dict[str, Any]:
    artifacts = selected_artifacts(station)
    max_duration = max([float(item.get("durationSeconds") or 0) for item in artifacts] or [0.0])
    segments = build_segments(max_duration)
    items: list[dict[str, Any]] = []
    for artifact in artifacts:
        duration = float(artifact.get("durationSeconds") or max_duration)
        for segment in segments:
            if segment["startSeconds"] >= duration:
                continue
            item_id = f"{artifact['artifactId']}:{segment['segmentId']}"
            items.append(
                {
                    "itemId": item_id,
                    "artifactId": artifact["artifactId"],
                    "segmentId": segment["segmentId"],
                    "startSeconds": segment["startSeconds"],
                    "endSeconds": min(segment["endSeconds"], duration),
                    "label": segment["label"],
                    "status": "pending",
                    "actor": None,
                    "note": None,
                    "updatedAt": None,
                }
            )
    return {
        "packetType": "quipsly-episode1-selected-watch-review-progress",
        "version": "2026-06-20.selected-watch-review-progress.v1",
        "projectSlug": station.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": station.get("episodeSlug", "episode-1"),
        "updatedAt": now_iso(),
        "sourceSelectedReviewStation": station_path,
        "sourceSelectedReviewStationHtml": station.get("reviewStationHtml") or station.get("html"),
        "sourceAssist": assist_path if assist else None,
        "sourceAssistHtml": assist.get("html") if assist else None,
        "currentPath": current_path,
        "ledgerPath": ledger_path,
        "html": html_path,
        "markdown": md_path,
        "artifactCount": len(artifacts),
        "segmentCount": len(segments),
        "reviewItemCount": len(items),
        "artifacts": artifacts,
        "segments": segments,
        "reviewItems": items,
        "summary": summarize_items(items),
        "safeCommands": {
            "openProgress": "script/agentctl.sh episode1-selected-watch-review-progress --html",
            "markSegmentReviewed": 'script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 reviewed "Reviewer Name" "Segment reviewed across selected artifacts."',
            "markItemIssue": 'script/agentctl.sh episode1-selected-watch-review-mark episode-16x9-master:segment-001 issue "Reviewer Name" "Describe exact time/problem."',
            "recordFinalDecisionAfterComplete": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Full selected artifact set reviewed; ready for destination-copy review, not publication receipt."',
        },
        "blockedClaims": [
            "Do not claim artifact-ready until all required review items are reviewed and final watch/listen decision is recorded.",
            "Do not claim publication-ready until Tower destination copy, schedule, and receipt targets are reviewed.",
            "Do not claim published until external receipts exist.",
        ],
        "truth": "This packet tracks segmented watch/listen review progress. It does not approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def summarize_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"pending": 0, "reviewed": 0, "issue": 0, "skip": 0}
    for item in items:
        counts[item.get("status", "pending")] = counts.get(item.get("status", "pending"), 0) + 1
    total = len(items)
    complete = counts.get("reviewed", 0) + counts.get("skip", 0)
    return {
        "total": total,
        "pending": counts.get("pending", 0),
        "reviewed": counts.get("reviewed", 0),
        "issue": counts.get("issue", 0),
        "skip": counts.get("skip", 0),
        "completionPercent": round((complete / total) * 100, 2) if total else 0,
        "hasIssues": counts.get("issue", 0) > 0,
        "readyForFinalDecision": total > 0 and counts.get("pending", 0) == 0 and counts.get("issue", 0) == 0,
    }


def mark_items(packet: dict[str, Any], target: str, status: str, actor: str, note: str) -> list[dict[str, Any]]:
    if status not in {"pending", "reviewed", "issue", "skip"}:
        raise SystemExit("status must be pending, reviewed, issue, or skip")
    updated: list[dict[str, Any]] = []
    now = now_iso()
    for item in packet.get("reviewItems") or []:
        item_id = item.get("itemId")
        segment_id = item.get("segmentId")
        artifact_id = item.get("artifactId")
        matches = (
            target == "all"
            or target == item_id
            or target == f"all:{segment_id}"
            or target == f"{artifact_id}:all"
            or target == segment_id
        )
        if matches:
            item["status"] = status
            item["actor"] = actor
            item["note"] = note
            item["updatedAt"] = now
            updated.append(dict(item))
    if not updated:
        raise SystemExit(f"No review items matched target: {target}")
    packet["updatedAt"] = now
    packet["summary"] = summarize_items(packet.get("reviewItems") or [])
    return updated


def append_ledger(path: str, record: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, sort_keys=True))
        handle.write("\n")


def media_link(artifact: dict[str, Any], segment: dict[str, Any]) -> str:
    # Browsers do not consistently honor media fragments on local files, but
    # including them still documents the intended review point.
    return f"{file_url(artifact.get('path'))}#t={segment.get('startSeconds')},{segment.get('endSeconds')}"


def html_page(packet: dict[str, Any]) -> str:
    artifact_by_id = {item["artifactId"]: item for item in packet.get("artifacts") or []}
    rows = []
    for item in packet.get("reviewItems") or []:
        artifact = artifact_by_id.get(item.get("artifactId"), {})
        rows.append(
            f"""
            <tr class="{esc(item.get('status'))}">
              <td><code>{esc(item.get('itemId'))}</code></td>
              <td>{esc(item.get('label'))}</td>
              <td><a href="{media_link(artifact, item)}">open at segment</a></td>
              <td><span class="pill {esc(item.get('status'))}">{esc(item.get('status'))}</span></td>
              <td>{esc(item.get('actor'))}</td>
              <td>{esc(item.get('note'))}</td>
            </tr>
            """
        )
    summary = packet.get("summary") or {}
    blocked = "".join(f"<li>{esc(item)}</li>" for item in packet.get("blockedClaims") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Watch/Listen Review Progress</title>
  <style>
    :root {{
      --bg: #f4efe2;
      --paper: #fffaf0;
      --ink: #392a20;
      --muted: #74675a;
      --line: rgba(73, 53, 37, 0.16);
      --fern: #2f7657;
      --gold: #d4a62e;
      --clay: #9d4d37;
      --sky: #2f6f84;
      --shadow: 0 22px 70px rgba(42, 32, 22, 0.14);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 14% 0%, rgba(212, 166, 46, 0.24), transparent 32rem),
        radial-gradient(circle at 88% 4%, rgba(47, 118, 87, 0.18), transparent 34rem),
        linear-gradient(135deg, #fbf6e9, var(--bg));
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header, main {{ padding-inline: clamp(22px, 5vw, 80px); }}
    header {{ padding-top: 52px; padding-bottom: 20px; }}
    .hero, .panel {{
      background: rgba(255, 250, 240, 0.88);
      border: 1px solid var(--line);
      border-radius: 28px;
      box-shadow: var(--shadow);
    }}
    .hero, .panel {{ padding: 26px; }}
    .kicker {{ color: #b17b27; font-size: .78rem; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; }}
    h1 {{ margin: 10px 0 12px; font-size: clamp(2rem, 5vw, 4.4rem); line-height: .95; letter-spacing: -.055em; }}
    p, li, td {{ color: var(--muted); line-height: 1.45; }}
    main {{ padding-bottom: 80px; }}
    .status-row {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }}
    .pill {{ display: inline-flex; border-radius: 999px; padding: 7px 10px; font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #fff; background: var(--sky); }}
    .pill.reviewed {{ background: var(--fern); }}
    .pill.pending {{ background: var(--gold); color: #2f2618; }}
    .pill.issue {{ background: var(--clay); }}
    .pill.skip {{ background: #6f6a5f; }}
    .panel {{ margin-top: 22px; overflow-x: auto; }}
    table {{ width: 100%; border-collapse: collapse; min-width: 980px; }}
    th, td {{ padding: 11px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    th {{ color: var(--ink); font-size: .78rem; text-transform: uppercase; letter-spacing: .12em; }}
    tr.issue {{ background: rgba(157, 77, 55, .08); }}
    tr.reviewed {{ background: rgba(47, 118, 87, .07); }}
    code {{ white-space: pre-wrap; overflow-wrap: anywhere; color: #274235; }}
    a {{ color: #225d74; font-weight: 800; }}
  </style>
</head>
<body>
  <header>
    <section class="hero">
      <div class="kicker">Quipsly Studio segmented review ledger</div>
      <h1>Watch/listen review, one sane chunk at a time.</h1>
      <p>This tracks review receipts for the selected Episode 1 artifacts. It does not approve the artifacts; it makes the final decision safer.</p>
      <div class="status-row">
        <span class="pill">{esc(summary.get('completionPercent'))}% complete</span>
        <span class="pill pending">{esc(summary.get('pending'))} pending</span>
        <span class="pill reviewed">{esc(summary.get('reviewed'))} reviewed</span>
        <span class="pill issue">{esc(summary.get('issue'))} issue</span>
        <span class="pill">{esc(packet.get('reviewItemCount'))} review items</span>
      </div>
    </section>
  </header>
  <main>
    <section class="panel">
      <h2>Review items</h2>
      <table>
        <thead><tr><th>Item</th><th>Segment</th><th>Open</th><th>Status</th><th>Actor</th><th>Note</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    <section class="panel">
      <h2>Safe commands</h2>
      <p><code>{esc(packet.get('safeCommands', {}).get('markSegmentReviewed'))}</code></p>
      <p><code>{esc(packet.get('safeCommands', {}).get('markItemIssue'))}</code></p>
      <p><code>{esc(packet.get('safeCommands', {}).get('recordFinalDecisionAfterComplete'))}</code></p>
    </section>
    <section class="panel">
      <h2>Blocked claims</h2>
      <ul>{blocked}</ul>
      <p>{esc(packet.get('truth'))}</p>
    </section>
  </main>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    summary = packet.get("summary") or {}
    lines = [
        "# Episode 1 selected watch/listen review progress",
        "",
        f"Updated: {packet['updatedAt']}",
        "",
        f"- Completion: `{summary.get('completionPercent')}`%",
        f"- Pending: `{summary.get('pending')}`",
        f"- Reviewed: `{summary.get('reviewed')}`",
        f"- Issues: `{summary.get('issue')}`",
        f"- Ready for final decision: `{summary.get('readyForFinalDecision')}`",
        "",
        "## Review items",
        "",
    ]
    for item in packet.get("reviewItems") or []:
        lines.append(f"- [{item.get('status')}] `{item.get('itemId')}` {item.get('label')} - {item.get('note') or ''}")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def persist(packet: dict[str, Any], current_path: str, html_path: str, md_path: str) -> None:
    packet["summary"] = summarize_items(packet.get("reviewItems") or [])
    packet["updatedAt"] = now_iso()
    write_json(current_path, packet)
    os.makedirs(os.path.dirname(html_path) or ".", exist_ok=True)
    with open(html_path, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    os.makedirs(os.path.dirname(md_path) or ".", exist_ok=True)
    with open(md_path, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))


def main() -> int:
    if len(sys.argv) < 9:
        print(
            "usage: episode1_selected_watch_review_progress.py station.json assist.json current.json ledger.json html md action actor [target] [status] [note]",
            file=sys.stderr,
        )
        return 2

    station_path, assist_path, current_path, ledger_path, html_path, md_path, action, actor = sys.argv[1:9]
    target = sys.argv[9] if len(sys.argv) > 9 else ""
    status = sys.argv[10] if len(sys.argv) > 10 else ""
    note = sys.argv[11] if len(sys.argv) > 11 else ""

    station = load_json(station_path)
    assist = load_optional_json(assist_path)
    current = load_optional_json(current_path)
    if not current:
        current = initial_packet(station, assist, station_path, assist_path, current_path, ledger_path, html_path, md_path)

    changed: list[dict[str, Any]] = []
    if action == "mark":
        if not target or not status:
            raise SystemExit("mark action requires target and status")
        changed = mark_items(current, target, status, actor, note)
        append_ledger(
            ledger_path,
            {
                "packetType": "quipsly-episode1-selected-watch-review-progress-ledger-entry",
                "version": "2026-06-20.selected-watch-review-progress-ledger.v1",
                "createdAt": now_iso(),
                "actor": actor,
                "target": target,
                "status": status,
                "note": note,
                "changedItemCount": len(changed),
                "changedItems": changed,
                "truth": "This ledger entry records segmented review progress only. It does not approve artifacts or publish.",
            },
        )
    elif action not in {"init", "status"}:
        raise SystemExit("action must be init, status, or mark")

    persist(current, current_path, html_path, md_path)
    print(
        json.dumps(
            {
                "packetType": "quipsly-episode1-selected-watch-review-progress-result",
                "action": action,
                "changedItemCount": len(changed),
                "current": current_path,
                "html": html_path,
                "markdown": md_path,
                "ledger": ledger_path,
                "summary": current.get("summary"),
                "truth": current.get("truth"),
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
