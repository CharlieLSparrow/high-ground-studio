#!/usr/bin/env python3
"""Gate final Episode 1 selected-artifact decisions behind real review evidence.

This script is intentionally strict and read-only. It looks at the selected
watch/listen ledger plus prepared review trays and reports whether a final
artifact decision is allowed. It never marks review complete, never approves
artifacts, and never publishes anything.
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


def write_text(path: str, text: str) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")


def esc(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + quote(os.path.abspath(path))


def intish(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def build_blockers(progress: dict[str, Any], index: dict[str, Any], next_packet: dict[str, Any]) -> list[dict[str, str]]:
    progress_summary = progress.get("summary") or {}
    index_summary = index.get("summary") or {}
    blockers: list[dict[str, str]] = []

    pending = intish(progress_summary.get("pending"))
    reviewed = intish(progress_summary.get("reviewed"))
    issues = intish(progress_summary.get("issue"))
    total = intish(progress_summary.get("total"))
    ready_packs = intish(index_summary.get("readyPackCount"))
    segment_count = intish(index_summary.get("segmentCount"))

    if total <= 0:
        blockers.append(
            {
                "code": "no-review-items",
                "message": "No selected watch/listen review items exist, so a final artifact decision would be ungrounded.",
                "next": "Regenerate selected review progress and segment trays before deciding artifacts.",
            }
        )

    if pending > 0:
        blockers.append(
            {
                "code": "pending-review-items",
                "message": f"{pending} selected watch/listen review item(s) are still pending.",
                "next": "Open the recommended focused tray, actually watch/listen, then mark the segment reviewed or issue.",
            }
        )

    if reviewed <= 0:
        blockers.append(
            {
                "code": "nothing-reviewed-yet",
                "message": "No selected artifact review item has been marked reviewed yet.",
                "next": "Start with the recommended segment; review clips and contact sheets are only prep, not review.",
            }
        )

    if issues > 0:
        blockers.append(
            {
                "code": "open-review-issues",
                "message": f"{issues} selected review issue(s) are open.",
                "next": "Resolve or document review issues before recording a final artifact decision.",
            }
        )

    if segment_count <= 0 or ready_packs < segment_count:
        blockers.append(
            {
                "code": "missing-review-trays",
                "message": f"Only {ready_packs}/{segment_count} focused review tray(s) are ready.",
                "next": "Run the all-segment review pack generator, then rebuild the index and gate.",
            }
        )

    if progress_summary.get("readyForFinalDecision") is not True:
        blockers.append(
            {
                "code": "ledger-not-final-ready",
                "message": "The selected watch/listen ledger does not report readyForFinalDecision=true.",
                "next": "Complete pending review items and clear issues; do not override the ledger.",
            }
        )

    if next_packet.get("_loadError"):
        blockers.append(
            {
                "code": "next-packet-invalid",
                "message": f"The selected review next-step packet could not be loaded: {next_packet.get('_loadError')}",
                "next": "Regenerate the next-step packet before continuing.",
            }
        )

    return blockers


def build_packet(progress_path: str, index_path: str, next_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    progress = load_json(progress_path)
    index = load_optional_json(index_path)
    next_packet = load_optional_json(next_path)
    progress_summary = progress.get("summary") or {}
    index_summary = index.get("summary") or {}
    next_step = next_packet.get("nextStep") or {}
    blockers = build_blockers(progress, index, next_packet)
    allowed = len(blockers) == 0

    recommended_segment = next_step.get("recommendedSegmentId") or index.get("recommendedSegmentId")
    recommended_label = next_step.get("recommendedSegmentLabel")
    mark_command = (next_packet.get("safeCommands") or {}).get("markRecommendedSegmentReviewedAfterRealReview")
    issue_commands = (next_packet.get("safeCommands") or {}).get("markFlaggedItemsIssueAfterRealReview") or []

    final_command = (
        'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" '
        '"Selected segmented watch/listen review complete; no unresolved issues."'
    )

    state = "allowed" if allowed else "blocked"
    human = "Ready to record final artifact decision" if allowed else "Not ready for final pass yet"

    return {
        "packetType": "quipsly-episode1-selected-review-gate",
        "version": "2026-06-20.selected-review-gate.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceProgressPath": progress_path,
        "sourceIndexPath": index_path if os.path.exists(index_path) else None,
        "sourceNextPath": next_path if os.path.exists(next_path) else None,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "gate": {
            "state": state,
            "humanState": human,
            "allowedToRecordFinalPass": allowed,
            "allowedToPublish": False,
            "allowedToSchedule": False,
            "allowedToCaptureReceipt": False,
            "blockerCount": len(blockers),
            "blockers": blockers,
        },
        "reviewState": {
            "totalReviewItems": progress_summary.get("total"),
            "pendingReviewItems": progress_summary.get("pending"),
            "reviewedItems": progress_summary.get("reviewed"),
            "issueItems": progress_summary.get("issue"),
            "skipItems": progress_summary.get("skip"),
            "completionPercent": progress_summary.get("completionPercent"),
            "readyForFinalDecision": progress_summary.get("readyForFinalDecision"),
            "readyPackCount": index_summary.get("readyPackCount"),
            "segmentCount": index_summary.get("segmentCount"),
            "recommendedSegmentId": recommended_segment,
            "recommendedSegmentLabel": recommended_label,
        },
        "safeCommands": {
            "openGate": "script/agentctl.sh episode1-selected-review-gate --html",
            "openReviewIndex": "script/agentctl.sh episode1-selected-review-index --html",
            "openCurrentRecommendedPack": "script/agentctl.sh episode1-selected-segment-review-pack --html",
            "openProgressLedger": "script/agentctl.sh episode1-selected-watch-review-progress --html",
            "prepareAllPacks": "script/agentctl.sh episode1-selected-all-segment-review-packs --json",
            "markRecommendedSegmentReviewedAfterRealReview": mark_command,
            "markFlaggedItemsIssueAfterRealReview": issue_commands,
            "recordFinalArtifactPassIfAllowed": final_command if allowed else None,
        },
        "truth": "This gate reads selected Episode 1 review evidence and blocks or permits a final artifact decision. It does not review media, mark ledger items, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    gate = packet.get("gate") or {}
    review = packet.get("reviewState") or {}
    blockers = gate.get("blockers") or []
    blocker_html = "".join(
        f"""
        <article class="blocker">
          <span>{esc(item.get('code'))}</span>
          <h2>{esc(item.get('message'))}</h2>
          <p>{esc(item.get('next'))}</p>
        </article>
        """
        for item in blockers
    )
    commands = packet.get("safeCommands") or {}
    command_rows = []
    for label, command in commands.items():
        if not command:
            continue
        if isinstance(command, list):
            for index, item in enumerate(command, start=1):
                command_rows.append((f"{label} {index}", item))
        else:
            command_rows.append((label, command))
    command_html = "".join(
        f"""
        <div class="command-row">
          <div><strong>{esc(label)}</strong><code>{esc(command)}</code></div>
          <button data-copy="{esc(command)}">Copy</button>
        </div>
        """
        for label, command in command_rows
    )
    state_class = "allowed" if gate.get("allowedToRecordFinalPass") else "blocked"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Gate</title>
  <style>
    :root {{ --bg:#efe7d6; --paper:#fff9ed; --ink:#2e251e; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d8ac31; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 14% 0%,rgba(216,172,49,.24),transparent 34rem),radial-gradient(circle at 88% 10%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1160px,calc(100% - 40px)); margin:0 auto; padding:48px 0 80px; }}
    .hero,.panel,.blocker {{ background:rgba(255,249,237,.94); border:1px solid var(--line); border-radius:30px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:30px; }}
    .hero {{ border-left:10px solid var(--clay); }}
    .hero.allowed {{ border-left-color:var(--fern); }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:10px 0 12px; max-width:980px; font-size:clamp(2.25rem,6vw,5.4rem); line-height:.88; letter-spacing:-.065em; }}
    h2 {{ margin:8px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .stats,.commands {{ display:grid; gap:10px; }}
    .stats {{ grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); margin-top:18px; }}
    .stat {{ background:rgba(46,111,132,.12); border:1px solid rgba(46,111,132,.18); border-radius:18px; padding:12px; }}
    .stat strong {{ display:block; font-size:1.25rem; }}
    .blockers {{ display:grid; gap:14px; margin-top:18px; }}
    .blocker {{ padding:18px; border-left:8px solid var(--clay); box-shadow:none; }}
    .blocker span {{ color:var(--clay); font-size:.72rem; font-weight:950; letter-spacing:.16em; text-transform:uppercase; }}
    .panel {{ margin-top:18px; }}
    .command-row {{ display:flex; gap:14px; justify-content:space-between; align-items:center; background:rgba(59,45,33,.06); border:1px solid var(--line); border-radius:18px; padding:12px; }}
    code {{ display:block; margin-top:6px; color:#4d3a2c; white-space:pre-wrap; overflow-wrap:anywhere; }}
    button,.button {{ appearance:none; border:0; background:#3b2d21; color:#fff6e8; border-radius:999px; padding:9px 12px; font-weight:950; font-size:.76rem; letter-spacing:.07em; text-transform:uppercase; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    a {{ color:var(--river); font-weight:900; }}
  </style>
</head>
<body>
  <main>
    <section class="hero {esc(state_class)}">
      <span class="kicker">Quipsly review gate</span>
      <h1>{esc(gate.get('humanState'))}</h1>
      <p>{esc(packet.get('truth'))}</p>
      <div class="stats">
        <div class="stat"><span>Pending</span><strong>{esc(review.get('pendingReviewItems'))}</strong></div>
        <div class="stat"><span>Reviewed</span><strong>{esc(review.get('reviewedItems'))}</strong></div>
        <div class="stat"><span>Issues</span><strong>{esc(review.get('issueItems'))}</strong></div>
        <div class="stat"><span>Trays</span><strong>{esc(review.get('readyPackCount'))}/{esc(review.get('segmentCount'))}</strong></div>
        <div class="stat"><span>Next</span><strong>{esc(review.get('recommendedSegmentId'))}</strong></div>
      </div>
    </section>
    <section class="blockers">{blocker_html or '<article class="blocker"><span>allowed</span><h2>Final artifact decision may be recorded.</h2><p>This still is not publication, scheduling, upload, or receipt capture.</p></article>'}</section>
    <section class="panel">
      <span class="kicker">Safe commands</span>
      <h2>Move only from evidence</h2>
      <div class="commands">{command_html}</div>
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
    gate = packet.get("gate") or {}
    review = packet.get("reviewState") or {}
    lines = [
        "# Episode 1 selected review gate",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"State: **{gate.get('humanState')}**",
        f"Allowed to record final artifact pass: `{gate.get('allowedToRecordFinalPass')}`",
        "",
        "## Review state",
        "",
        f"- Pending: `{review.get('pendingReviewItems')}`",
        f"- Reviewed: `{review.get('reviewedItems')}`",
        f"- Issues: `{review.get('issueItems')}`",
        f"- Ready trays: `{review.get('readyPackCount')}` / `{review.get('segmentCount')}`",
        f"- Recommended next segment: `{review.get('recommendedSegmentId')}` {review.get('recommendedSegmentLabel') or ''}",
        "",
        "## Blockers",
        "",
    ]
    blockers = gate.get("blockers") or []
    if blockers:
        for blocker in blockers:
            lines.append(f"- `{blocker.get('code')}`: {blocker.get('message')} Next: {blocker.get('next')}")
    else:
        lines.append("- None. Final artifact decision may be recorded, but this is still not publication.")
    lines.extend(["", "## Truth boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_selected_review_gate.py progress.json index.json next.json output.json output.html output.md", file=sys.stderr)
        return 2
    progress_path, index_path, next_path, output_json, output_html, output_md = sys.argv[1:7]
    packet = build_packet(progress_path, index_path, next_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    write_text(output_html, html_page(packet))
    write_text(output_md, markdown(packet))
    print(output_json)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
