#!/usr/bin/env python3
"""Choose the next safe Episode 1 selected-artifact review step.

This script is a read-only planner. It looks at the segmented review ledger,
machine quality triage, and the unified review console, then recommends one
small next step. It does not mark anything reviewed and it does not approve or
publish anything.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def load_optional_json(path: str) -> dict[str, Any]:
    if not path or not os.path.exists(path):
        return {}
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


def by_segment(progress: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in progress.get("reviewItems") or []:
        grouped.setdefault(str(item.get("segmentId")), []).append(item)
    return grouped


def segment_labels(progress: dict[str, Any]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for segment in progress.get("segments") or []:
        labels[str(segment.get("segmentId"))] = str(segment.get("label") or segment.get("segmentId"))
    for item in progress.get("reviewItems") or []:
        labels.setdefault(str(item.get("segmentId")), str(item.get("label") or item.get("segmentId")))
    return labels


def segment_status(items: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {"pending": 0, "reviewed": 0, "issue": 0, "skip": 0}
    for item in items:
        status = str(item.get("status") or "pending")
        counts[status] = counts.get(status, 0) + 1
    return {
        "itemCount": len(items),
        "pending": counts.get("pending", 0),
        "reviewed": counts.get("reviewed", 0),
        "issue": counts.get("issue", 0),
        "skip": counts.get("skip", 0),
        "complete": len(items) > 0 and counts.get("pending", 0) == 0 and counts.get("issue", 0) == 0,
        "hasIssue": counts.get("issue", 0) > 0,
    }


def triage_by_segment(triage: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(group.get("segmentId")): group for group in triage.get("groups") or []}


def issue_items(progress: dict[str, Any]) -> list[dict[str, Any]]:
    return [item for item in progress.get("reviewItems") or [] if item.get("status") == "issue"]


def pending_segments(progress: dict[str, Any], triage: dict[str, Any]) -> list[dict[str, Any]]:
    grouped = by_segment(progress)
    labels = segment_labels(progress)
    triage_groups = triage_by_segment(triage)
    severity_order = {"blocked": 0, "review-first": 1, "needs-look": 2, "clear": 3}
    segments: list[dict[str, Any]] = []
    for segment_id, items in grouped.items():
        status = segment_status(items)
        if status["pending"] <= 0:
            continue
        triage_group = triage_groups.get(segment_id, {})
        severity = str(triage_group.get("severity") or "clear")
        segments.append(
            {
                "segmentId": segment_id,
                "label": labels.get(segment_id, segment_id),
                "severity": severity,
                "severityRank": severity_order.get(severity, 9),
                "status": status,
                "flaggedItemCount": triage_group.get("flaggedItemCount", 0),
                "flaggedItems": triage_group.get("flaggedItems") or [],
                "clearItemCount": triage_group.get("clearItemCount", 0),
            }
        )
    return sorted(segments, key=lambda item: (item["severityRank"], item["segmentId"]))


def command_for_segment(segment_id: str, label: str) -> str:
    return (
        f'script/agentctl.sh episode1-selected-watch-review-mark all:{segment_id} '
        f'reviewed "Reviewer Name" "Actually watched/listened to {label} across selected artifacts; quality flags reviewed."'
    )


def command_for_issue(item_id: str, flags: list[str], label: str) -> str:
    joined = ", ".join(flags) if flags else "manual issue"
    return (
        f'script/agentctl.sh episode1-selected-watch-review-mark {item_id} '
        f'issue "Reviewer Name" "Review issue during {label}: {joined}. Add exact timestamp and decision."'
    )


def choose_next(progress: dict[str, Any], triage: dict[str, Any]) -> dict[str, Any]:
    summary = progress.get("summary") or {}
    issues = issue_items(progress)
    labels = segment_labels(progress)
    if issues:
        first = issues[0]
        segment_id = str(first.get("segmentId"))
        return {
            "state": "issue-needs-resolution",
            "recommendedSegmentId": segment_id,
            "recommendedSegmentLabel": labels.get(segment_id, str(first.get("label") or segment_id)),
            "recommendedItemId": first.get("itemId"),
            "priority": "resolve-issue-first",
            "reason": "At least one selected review item is already marked issue. Resolve or document that before continuing normal review.",
        }

    candidates = pending_segments(progress, triage)
    if candidates:
        candidate = candidates[0]
        severity = candidate.get("severity")
        priority = {
            "blocked": "blocked-source-first",
            "review-first": "review-first-quality-flag",
            "needs-look": "quality-flag-needs-look",
            "clear": "next-pending-segment",
        }.get(str(severity), "next-pending-segment")
        return {
            "state": "review-next-segment",
            "recommendedSegmentId": candidate["segmentId"],
            "recommendedSegmentLabel": candidate["label"],
            "priority": priority,
            "reason": f"Segment has {candidate['status']['pending']} pending selected review item(s) and machine triage severity {severity}.",
            "segment": candidate,
        }

    if summary.get("readyForFinalDecision"):
        return {
            "state": "ready-for-final-artifact-decision",
            "recommendedSegmentId": None,
            "recommendedSegmentLabel": None,
            "priority": "final-decision",
            "reason": "All selected segmented review items are resolved with no open issues. This permits a final artifact decision, not publication.",
        }

    return {
        "state": "no-action-derived",
        "recommendedSegmentId": None,
        "recommendedSegmentLabel": None,
        "priority": "inspect-progress",
        "reason": "The review ledger did not expose issues, pending segments, or final-decision readiness. Inspect the progress packet.",
    }


def build_packet(progress_path: str, triage_path: str, console_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    progress = load_json(progress_path)
    triage = load_optional_json(triage_path)
    console = load_optional_json(console_path)
    next_step = choose_next(progress, triage)
    recommended_segment = next_step.get("recommendedSegmentId")
    recommended_label = next_step.get("recommendedSegmentLabel")
    flagged_items = (next_step.get("segment") or {}).get("flaggedItems") or []
    issue_commands = [
        command_for_issue(str(item.get("itemId")), list(item.get("flags") or []), str(recommended_label or item.get("label") or "selected segment"))
        for item in flagged_items
    ]
    final_decision_command = None
    if next_step.get("state") == "ready-for-final-artifact-decision":
        final_decision_command = (
            'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" '
            '"Selected segmented watch/listen review complete; no unresolved issues."'
        )
    mark_reviewed_command = None
    if recommended_segment:
        mark_reviewed_command = command_for_segment(str(recommended_segment), str(recommended_label or recommended_segment))

    return {
        "packetType": "quipsly-episode1-selected-review-next",
        "version": "2026-06-20.selected-review-next.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceProgressPath": progress_path,
        "sourceTriagePath": triage_path if os.path.exists(triage_path) else None,
        "sourceConsolePath": console_path if os.path.exists(console_path) else None,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "progressSummary": progress.get("summary"),
        "triageSummary": {
            "segmentCount": triage.get("segmentCount"),
            "flaggedSegmentCount": triage.get("flaggedSegmentCount"),
            "flaggedItemCount": triage.get("flaggedItemCount"),
            "totalFlagCount": triage.get("totalFlagCount"),
            "loadError": triage.get("_loadError"),
        },
        "consoleSummary": {
            "segmentCount": console.get("segmentCount"),
            "reviewItemCount": console.get("reviewItemCount"),
            "loadError": console.get("_loadError"),
        },
        "nextStep": next_step,
        "safeCommands": {
            "openNext": "script/agentctl.sh episode1-selected-review-next --html",
            "openConsole": "script/agentctl.sh episode1-selected-review-console --html",
            "openQualityTriage": "script/agentctl.sh episode1-selected-quality-triage --html",
            "openProgress": "script/agentctl.sh episode1-selected-watch-review-progress --html",
            "markRecommendedSegmentReviewedAfterRealReview": mark_reviewed_command,
            "markRecommendedFlaggedItemsIssueAfterRealReview": issue_commands,
            "recordFinalDecisionAfterComplete": final_decision_command,
        },
        "blockedClaims": [
            "Do not mark the recommended segment reviewed until a human or agent actually watches/listens to that selected segment across the selected artifacts.",
            "Do not record a final artifact pass while selected review items are pending or unresolved issues exist.",
            "Do not treat artifact pass as publication; Tower destination copy, platform posting, and receipt capture are separate.",
        ],
        "truth": "This planner routes attention to the next selected Episode 1 review step. It does not review media, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    next_step = packet.get("nextStep") or {}
    commands = packet.get("safeCommands") or {}
    issue_buttons = []
    for command in commands.get("markRecommendedFlaggedItemsIssueAfterRealReview") or []:
        issue_buttons.append(f'<button data-copy="{esc(command)}">Copy issue command</button>')
    final_button = ""
    if commands.get("recordFinalDecisionAfterComplete"):
        final_button = f'<button data-copy="{esc(commands.get("recordFinalDecisionAfterComplete"))}">Copy final pass command</button>'
    mark_button = ""
    if commands.get("markRecommendedSegmentReviewedAfterRealReview"):
        mark_button = f'<button data-copy="{esc(commands.get("markRecommendedSegmentReviewedAfterRealReview"))}">Copy mark-reviewed command</button>'
    blocked = "".join(f"<li>{esc(item)}</li>" for item in packet.get("blockedClaims") or [])
    summary = packet.get("progressSummary") or {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Next Review Step</title>
  <style>
    :root {{ --bg:#f2ebdc; --paper:#fff9ee; --ink:#38291f; --muted:#75685b; --line:rgba(65,45,31,.16); --fern:#2f7656; --gold:#d8aa32; --clay:#a14d38; --river:#2f6f84; --shadow:0 24px 72px rgba(47,34,23,.14); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 16% 0%,rgba(216,170,50,.24),transparent 32rem),radial-gradient(circle at 92% 10%,rgba(47,118,86,.20),transparent 35rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1120px,calc(100% - 40px)); margin:0 auto; padding:50px 0 80px; }}
    .hero,.panel {{ background:rgba(255,249,238,.92); border:1px solid var(--line); border-radius:30px; box-shadow:var(--shadow); }}
    .hero {{ padding:34px; }}
    .panel {{ padding:22px; margin-top:16px; }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:10px 0 14px; max-width:900px; font-size:clamp(2.3rem,6vw,5.2rem); line-height:.9; letter-spacing:-.06em; }}
    h2,h3 {{ margin:0 0 8px; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    code {{ color:#234235; white-space:pre-wrap; overflow-wrap:anywhere; }}
    .stats,.buttons {{ display:flex; flex-wrap:wrap; gap:10px; }}
    .pill {{ border-radius:999px; padding:8px 11px; background:var(--river); color:white; font-size:.72rem; font-weight:950; text-transform:uppercase; letter-spacing:.08em; }}
    .pill.gold {{ background:var(--gold); color:#302416; }}
    .pill.green {{ background:var(--fern); }}
    button {{ appearance:none; border:0; border-radius:999px; background:#3b2d21; color:#fff6e8; font-weight:950; padding:10px 14px; cursor:pointer; }}
    button.secondary {{ background:var(--river); }}
    button.copied {{ background:var(--fern); }}
    .next {{ border-left:8px solid var(--gold); }}
    .truth {{ border-left:8px solid var(--fern); }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly review compass</span>
      <h1>Next step: {esc(next_step.get('priority'))}</h1>
      <p>{esc(next_step.get('reason'))}</p>
      <div class="stats">
        <span class="pill gold">{esc(next_step.get('state'))}</span>
        <span class="pill">{esc(next_step.get('recommendedSegmentId') or 'no segment')}</span>
        <span class="pill green">{esc(next_step.get('recommendedSegmentLabel') or 'inspect summary')}</span>
        <span class="pill">{esc(summary.get('pending'))} pending</span>
        <span class="pill">{esc(summary.get('issue'))} issues</span>
      </div>
    </section>
    <section class="panel next">
      <h2>Recommended operator move</h2>
      <p>Open the review console and quality triage, actually watch/listen, then use the copied command only if the segment truly passed review.</p>
      <div class="buttons">
        <button class="secondary" data-copy="{esc(commands.get('openConsole'))}">Copy open console</button>
        <button class="secondary" data-copy="{esc(commands.get('openQualityTriage'))}">Copy open triage</button>
        {mark_button}
        {''.join(issue_buttons)}
        {final_button}
      </div>
    </section>
    <section class="panel truth">
      <h2>Boundary</h2>
      <p>{esc(packet.get('truth'))}</p>
      <ul>{blocked}</ul>
    </section>
  </main>
  <script>
    document.querySelectorAll('button[data-copy]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        const text = button.getAttribute('data-copy') || '';
        try {{
          await navigator.clipboard.writeText(text);
          const old = button.textContent;
          button.textContent = 'Copied';
          button.classList.add('copied');
          setTimeout(() => {{ button.textContent = old; button.classList.remove('copied'); }}, 1300);
        }} catch (error) {{
          window.prompt('Copy command', text);
        }}
      }});
    }});
  </script>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    next_step = packet.get("nextStep") or {}
    commands = packet.get("safeCommands") or {}
    lines = [
        "# Episode 1 selected review next step",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- State: `{next_step.get('state')}`",
        f"- Priority: `{next_step.get('priority')}`",
        f"- Segment: `{next_step.get('recommendedSegmentId')}` {next_step.get('recommendedSegmentLabel') or ''}",
        f"- Reason: {next_step.get('reason')}",
        "",
        "## Safe commands",
        "",
        f"- Open console: `{commands.get('openConsole')}`",
        f"- Open triage: `{commands.get('openQualityTriage')}`",
    ]
    if commands.get("markRecommendedSegmentReviewedAfterRealReview"):
        lines.append(f"- Mark after real review: `{commands.get('markRecommendedSegmentReviewedAfterRealReview')}`")
    for command in commands.get("markRecommendedFlaggedItemsIssueAfterRealReview") or []:
        lines.append(f"- Mark issue after real review: `{command}`")
    if commands.get("recordFinalDecisionAfterComplete"):
        lines.append(f"- Final artifact decision: `{commands.get('recordFinalDecisionAfterComplete')}`")
    lines.extend(["", "## Boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_selected_review_next.py progress.json triage.json console.json output.json output.html output.md", file=sys.stderr)
        return 2
    progress_path, triage_path, console_path, output_json, output_html, output_md = sys.argv[1:7]
    packet = build_packet(progress_path, triage_path, console_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_html) or ".", exist_ok=True)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-review-next-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "nextStep": packet["nextStep"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
