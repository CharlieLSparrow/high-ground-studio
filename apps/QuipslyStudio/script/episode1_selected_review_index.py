#!/usr/bin/env python3
"""Build an index over all focused Episode 1 selected review trays.

The index is a read-only operator surface. It links the stable per-segment
review packs, summarizes ledger state, and keeps review/proof boundaries clear.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
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


def review_item_summary(progress: dict[str, Any], segment_id: str) -> dict[str, Any]:
    counts = {"pending": 0, "reviewed": 0, "issue": 0, "skip": 0}
    items = [item for item in progress.get("reviewItems") or [] if str(item.get("segmentId")) == segment_id]
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
    }


def build_packet(progress_path: str, pack_dir: str, next_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    progress = load_json(progress_path)
    next_packet = load_optional_json(next_path)
    recommended_segment = (next_packet.get("nextStep") or {}).get("recommendedSegmentId")
    pack_root = Path(pack_dir)
    segments = []
    for segment in progress.get("segments") or []:
        segment_id = str(segment.get("segmentId"))
        pack_json = pack_root / f"{segment_id}-review-pack.json"
        pack = load_optional_json(str(pack_json))
        status = review_item_summary(progress, segment_id)
        segments.append(
            {
                "segmentId": segment_id,
                "label": segment.get("label"),
                "startSeconds": segment.get("startSeconds"),
                "endSeconds": segment.get("endSeconds"),
                "isRecommendedNext": segment_id == recommended_segment,
                "reviewStatus": status,
                "packStatus": "ready" if pack and not pack.get("_loadError") else "missing-or-invalid",
                "packJson": str(pack_json),
                "packHtml": str(pack_root / f"{segment_id}-review-pack.html"),
                "readyClipCount": pack.get("readyClipCount"),
                "clipCount": pack.get("clipCount"),
                "contactSheetCount": pack.get("contactSheetCount"),
                "audioProbeCount": pack.get("audioProbeCount"),
                "warningCount": pack.get("warningCount"),
                "loadError": pack.get("_loadError"),
                "markReviewedCommand": (pack.get("safeCommands") or {}).get("markSegmentReviewedAfterRealReview"),
            }
        )
    summary = progress.get("summary") or {}
    return {
        "packetType": "quipsly-episode1-selected-review-index",
        "version": "2026-06-20.selected-review-index.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceProgressPath": progress_path,
        "sourceNextPath": next_path if os.path.exists(next_path) else None,
        "packDir": pack_dir,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "recommendedSegmentId": recommended_segment,
        "summary": {
            "segmentCount": len(segments),
            "readyPackCount": len([segment for segment in segments if segment["packStatus"] == "ready"]),
            "pendingReviewItems": summary.get("pending"),
            "reviewedItems": summary.get("reviewed"),
            "issueItems": summary.get("issue"),
            "readyForFinalDecision": summary.get("readyForFinalDecision"),
        },
        "segments": segments,
        "safeCommands": {
            "openIndex": "script/agentctl.sh episode1-selected-review-index --html",
            "prepareAllPacks": "script/agentctl.sh episode1-selected-all-segment-review-packs --json",
            "openCurrentRecommendedPack": "script/agentctl.sh episode1-selected-segment-review-pack --html",
            "openProgressLedger": "script/agentctl.sh episode1-selected-watch-review-progress --html",
        },
        "blockedClaims": [
            "Do not treat ready review packs as reviewed segments.",
            "Do not record final artifact pass until the selected watch/listen ledger is complete and unresolved issues are cleared.",
            "Do not treat artifact pass as publication or external platform receipt.",
        ],
        "truth": "This index links prepared focused review trays and ledger status. It does not review media, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    cards = []
    for segment in packet.get("segments") or []:
        status = segment.get("reviewStatus") or {}
        badge = "recommended" if segment.get("isRecommendedNext") else "segment"
        cards.append(
            f"""
            <article class="segment {esc(badge)}">
              <div>
                <span class="kicker">{esc(badge)} · {esc(segment.get('packStatus'))}</span>
                <h2>{esc(segment.get('segmentId'))}: {esc(segment.get('label'))}</h2>
                <p>{esc(status.get('pending'))} pending · {esc(status.get('reviewed'))} reviewed · {esc(status.get('issue'))} issues · {esc(segment.get('warningCount'))} pack warnings</p>
                <p>{esc(segment.get('readyClipCount'))}/{esc(segment.get('clipCount'))} clips ready · {esc(segment.get('contactSheetCount'))} contact sheets · {esc(segment.get('audioProbeCount'))} audio probe</p>
              </div>
              <div class="buttons">
                <a class="button" href="{file_url(segment.get('packHtml'))}">Open tray</a>
                <button data-copy="{esc(segment.get('markReviewedCommand'))}">Copy mark-reviewed command</button>
              </div>
            </article>
            """
        )
    summary = packet.get("summary") or {}
    blocked = "".join(f"<li>{esc(item)}</li>" for item in packet.get("blockedClaims") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Selected Review Index</title>
  <style>
    :root {{ --bg:#f1eadb; --paper:#fff9ed; --ink:#34281f; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d9ad33; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(217,173,51,.24),transparent 34rem),radial-gradient(circle at 90% 8%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1180px,calc(100% - 40px)); margin:0 auto; padding:48px 0 80px; }}
    .hero,.segment,.panel {{ background:rgba(255,249,237,.92); border:1px solid var(--line); border-radius:30px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:30px; }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:10px 0 12px; max-width:960px; font-size:clamp(2.2rem,5.8vw,5rem); line-height:.9; letter-spacing:-.06em; }}
    h2 {{ margin:6px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .stats,.buttons {{ display:flex; flex-wrap:wrap; gap:10px; }}
    .pill,.button,button {{ border-radius:999px; padding:9px 12px; font-weight:950; font-size:.76rem; letter-spacing:.07em; text-transform:uppercase; }}
    .pill {{ background:var(--river); color:white; }}
    .pill.gold {{ background:var(--gold); color:#302416; }}
    .segments {{ display:grid; gap:14px; margin-top:18px; }}
    .segment {{ padding:18px; display:flex; justify-content:space-between; gap:18px; align-items:flex-start; border-left:8px solid transparent; }}
    .segment.recommended {{ border-left-color:var(--gold); }}
    .button,button {{ appearance:none; border:0; background:#3b2d21; color:#fff6e8; text-decoration:none; cursor:pointer; display:inline-flex; }}
    button.copied {{ background:var(--fern); }}
    .panel {{ margin-top:18px; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly selected review map</span>
      <h1>Five trays. One honest ledger.</h1>
      <p>Every selected Episode 1 segment has a focused tray. Opening a tray is review prep; marking a segment reviewed still requires actual watch/listen review.</p>
      <div class="stats">
        <span class="pill gold">{esc(summary.get('readyPackCount'))}/{esc(summary.get('segmentCount'))} trays ready</span>
        <span class="pill">{esc(summary.get('pendingReviewItems'))} pending items</span>
        <span class="pill">{esc(summary.get('reviewedItems'))} reviewed</span>
        <span class="pill">{esc(summary.get('issueItems'))} issues</span>
        <span class="pill">next {esc(packet.get('recommendedSegmentId'))}</span>
      </div>
    </section>
    <section class="segments">{''.join(cards)}</section>
    <section class="panel">
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
    lines = [
        "# Episode 1 selected review index",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- Recommended segment: `{packet.get('recommendedSegmentId')}`",
        f"- Ready packs: `{packet.get('summary', {}).get('readyPackCount')}` / `{packet.get('summary', {}).get('segmentCount')}`",
        f"- Pending review items: `{packet.get('summary', {}).get('pendingReviewItems')}`",
        "",
        "## Segment trays",
        "",
    ]
    for segment in packet.get("segments") or []:
        status = segment.get("reviewStatus") or {}
        lines.append(f"- `{segment.get('segmentId')}` {segment.get('label')}: pack `{segment.get('packStatus')}`, pending `{status.get('pending')}`, html `{segment.get('packHtml')}`")
    lines.extend(["", "## Boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 7:
        print("usage: episode1_selected_review_index.py progress.json pack-dir next.json output.json output.html output.md", file=sys.stderr)
        return 2
    progress_path, pack_dir, next_path, output_json, output_html, output_md = sys.argv[1:7]
    packet = build_packet(progress_path, pack_dir, next_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-review-index-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segmentCount": packet["summary"]["segmentCount"],
        "readyPackCount": packet["summary"]["readyPackCount"],
        "recommendedSegmentId": packet.get("recommendedSegmentId"),
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
