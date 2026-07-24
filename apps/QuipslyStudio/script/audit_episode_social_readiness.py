#!/usr/bin/env python3
"""Audit QuipslyStudio episode sessions for social-short publication readiness.

This script talks to the running native app AgentServer. It does not edit source
media, does not promote drafts to Keep, and only generates reviewed queues when
shorts are already explicitly marked Keep.
"""
from __future__ import annotations

import argparse
import html
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

DEFAULT_SESSIONS = [
    "episode-1-premiere-rescue",
    "episode-2-native-proof",
    "episode-3-premiere-rescue",
]


def get_json(base_url: str, path: str, timeout: int = 30) -> dict[str, Any]:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for(base_url: str, predicate, timeout: float = 40, interval: float = 0.35) -> dict[str, Any]:
    deadline = time.time() + timeout
    last: dict[str, Any] = {}
    while time.time() < deadline:
        last = get_json(base_url, "/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def last_exported_short_path(publish_notes: str) -> str:
    marker = "Exported 9:16 short: "
    for line in reversed((publish_notes or "").splitlines()):
        if marker in line:
            return line.split(marker, 1)[1].strip()
    return ""


def load_session(base_url: str, session: str) -> dict[str, Any]:
    get_json(base_url, "/load_session?name=" + urllib.parse.quote(session))
    return wait_for(
        base_url,
        lambda payload: payload.get("activeSessionName") == session and payload.get("laneCount", 0) > 0,
        timeout=45,
    )


def summarize_short_queue(base_url: str) -> dict[str, Any]:
    queue = get_json(base_url, "/shorts_queue")
    clips = queue.get("clips") or []
    by_status: dict[str, int] = {}
    rows: list[dict[str, Any]] = []
    for index, clip in enumerate(clips, start=1):
        status = (clip.get("reviewStatus") or "draft").lower()
        by_status[status] = by_status.get(status, 0) + 1
        rows.append({
            "index": index,
            "id": clip.get("id", ""),
            "title": clip.get("title", ""),
            "sequenceStartTime": clip.get("sequenceStartTime", clip.get("startTime", 0)),
            "recipeDuration": clip.get("recipeDuration", clip.get("duration", 0)),
            "reviewStatus": status,
            "exportStatus": clip.get("exportStatus", ""),
            "lastExportedPath": last_exported_short_path(clip.get("publishNotes", "")),
            "lastExportedExists": Path(last_exported_short_path(clip.get("publishNotes", ""))).exists() if last_exported_short_path(clip.get("publishNotes", "")) else False,
            "hookText": clip.get("hookText", ""),
            "captionDraft": clip.get("captionDraft", ""),
        })
    return {"count": len(clips), "reviewStatusCounts": by_status, "clips": rows}


def generate_reviewed_queue(base_url: str, session: str, output_root: Path) -> dict[str, Any]:
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in session).strip("-") or "episode"
    output_dir = output_root / safe
    output_dir.mkdir(parents=True, exist_ok=True)
    basename = f"{safe}-reviewed-keeps"
    get_json(
        base_url,
        "/reviewed_social_queue_generate?directory="
        + urllib.parse.quote(str(output_dir))
        + "&basename="
        + urllib.parse.quote(basename),
    )
    state = wait_for(
        base_url,
        lambda payload: (payload.get("socialPublicationQueue") or {}).get("status") in {"generated", "failed", "blocked"},
        timeout=35,
    )
    queue = state.get("socialPublicationQueue") or {}
    return {
        "status": queue.get("status", "unknown"),
        "outputPath": queue.get("outputPath", ""),
        "error": queue.get("error", ""),
        "manifestExpected": str(Path(queue.get("outputPath", "")) / f"{basename}-reviewed-social-queue.json") if queue.get("outputPath") else "",
    }


def compact_state_summary(state: dict[str, Any], queue_summary: dict[str, Any]) -> dict[str, Any]:
    delivery = state.get("deliveryReadiness") or {}
    delivery_counts = delivery.get("counts") or {}
    review_counts = state.get("shortReviewCounts") or {}
    lanes = state.get("lanes") or []
    unresolved = [
        {
            "name": lane.get("name", ""),
            "sourceReadiness": lane.get("sourceReadiness", ""),
            "recoveryCategory": lane.get("recoveryCategory", ""),
            "recoveryNextAction": lane.get("recoveryNextAction", ""),
        }
        for lane in lanes
        if not lane.get("sourceReady", False) and not lane.get("ignoreForProduction", False)
    ]
    return {
        "session": state.get("activeSessionName", ""),
        "title": state.get("projectTitle", ""),
        "laneCount": state.get("laneCount", 0),
        "productionReady": state.get("productionReady", False),
        "deliveryCounts": delivery_counts,
        "shortReviewCounts": review_counts,
        "shortQueue": queue_summary,
        "canGenerateReviewedQueue": int(review_counts.get("keep") or queue_summary.get("reviewStatusCounts", {}).get("keep") or 0) > 0,
        "unresolvedNonIgnoredLaneCount": len(unresolved),
        "unresolvedNonIgnoredLanes": unresolved[:8],
        "lastMediaAction": state.get("lastMediaAction", ""),
    }


def write_review_html(report: dict[str, Any], output_root: Path) -> Path:
    rows: list[str] = []
    for session in report["sessions"]:
        status_counts = (session.get("shortQueue") or {}).get("reviewStatusCounts") or {}
        queue_generation = session.get("reviewedQueueGeneration") or {}
        rows.append(
            f"""
            <section class="episode">
              <div class="episodeHeader">
                <div>
                  <p class="eyebrow">{html.escape(session.get('session', ''))}</p>
                  <h2>{html.escape(session.get('title') or session.get('session') or 'Episode')}</h2>
                </div>
                <div class="status {html.escape(str(queue_generation.get('status', 'not-requested')).replace('-', '_'))}">
                  {html.escape(str(queue_generation.get('status', 'not-requested')))}
                </div>
              </div>
              <div class="metrics">
                <span>production ready: <strong>{html.escape(str(session.get('productionReady')))}</strong></span>
                <span>shorts: <strong>{html.escape(str((session.get('shortQueue') or {}).get('count', 0)))}</strong></span>
                <span>keep: <strong>{html.escape(str(status_counts.get('keep', 0)))}</strong></span>
                <span>draft: <strong>{html.escape(str(status_counts.get('draft', 0)))}</strong></span>
                <span>review: <strong>{html.escape(str(status_counts.get('ready-for-human-review', 0)))}</strong></span>
              </div>
              <p class="queuePath">{html.escape(queue_generation.get('outputPath') or queue_generation.get('error') or 'No reviewed queue generated yet.')}</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Short</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Export</th>
                    <th>Agent actions</th>
                  </tr>
                </thead>
                <tbody>
            """
        )
        for clip in (session.get("shortQueue") or {}).get("clips") or []:
            clip_id = clip.get("id", "")
            export_path = clip.get("lastExportedPath") or ""
            export_cell = (
                f"<a href=\"file://{html.escape(export_path)}\">open export</a>"
                if export_path and clip.get("lastExportedExists")
                else html.escape(clip.get("exportStatus") or "not exported")
            )
            rows.append(
                f"""
                  <tr>
                    <td>{html.escape(str(clip.get('index', '')))}</td>
                    <td>
                      <strong>{html.escape(clip.get('title', 'Untitled'))}</strong>
                      <small>{html.escape(clip.get('hookText') or clip.get('captionDraft') or '')}</small>
                    </td>
                    <td>{float(clip.get('sequenceStartTime') or 0):.2f}s · {float(clip.get('recipeDuration') or 0):.2f}s</td>
                    <td><span class="pill {html.escape(clip.get('reviewStatus', 'draft').replace('-', '_'))}">{html.escape(clip.get('reviewStatus', 'draft'))}</span></td>
                    <td>{export_cell}</td>
                    <td>
                      <code>script/agentctl.sh load-session {html.escape(session.get('session', ''))}</code><br>
                      <code>script/agentctl.sh shorts-select id {html.escape(clip_id)}</code><br>
                      <code>script/agentctl.sh shorts-review-selected keep "approved after review"</code>
                    </td>
                  </tr>
                """
            )
        rows.append("</tbody></table></section>")

    page = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly Episodes 1-3 Social Readiness</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101514;
      --panel: #18211f;
      --panel2: #202b27;
      --ink: #f3eddb;
      --muted: #a79d89;
      --gold: #f4cf45;
      --green: #4dd77f;
      --red: #ff5f6d;
      --blue: #42a5ff;
    }}
    body {{ margin: 0; background: radial-gradient(circle at top left, #263a32, var(--bg) 45%); color: var(--ink); font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Avenir Next", sans-serif; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 42px 28px 70px; }}
    h1 {{ font-size: clamp(34px, 5vw, 62px); line-height: .95; margin: 0 0 14px; letter-spacing: -0.05em; }}
    h2 {{ margin: 0; font-size: 26px; }}
    .lede {{ color: var(--muted); max-width: 760px; font-size: 17px; }}
    .episode {{ background: color-mix(in srgb, var(--panel) 88%, transparent); border: 1px solid #39463f; border-radius: 24px; padding: 22px; margin: 22px 0; box-shadow: 0 18px 60px #0007; }}
    .episodeHeader, .metrics {{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: space-between; }}
    .eyebrow {{ margin: 0 0 4px; color: var(--gold); font-size: 12px; font-weight: 900; letter-spacing: .28em; text-transform: uppercase; }}
    .metrics {{ justify-content: flex-start; margin: 16px 0; }}
    .metrics span, .status, .pill {{ background: var(--panel2); border: 1px solid #46524b; border-radius: 999px; padding: 6px 10px; color: var(--muted); font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .08em; }}
    .status.generated, .pill.keep {{ color: var(--green); border-color: color-mix(in srgb, var(--green) 45%, #46524b); }}
    .status.skipped_no_kept_shorts, .pill.ready_for_human_review {{ color: var(--gold); border-color: color-mix(in srgb, var(--gold) 45%, #46524b); }}
    .pill.draft {{ color: var(--blue); }}
    .pill.needs_captions {{ color: var(--red); }}
    .queuePath {{ color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; overflow-wrap: anywhere; }}
    table {{ width: 100%; border-collapse: collapse; overflow: hidden; border-radius: 14px; }}
    th, td {{ border-bottom: 1px solid #33413a; padding: 10px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .12em; }}
    td small {{ display: block; color: var(--muted); margin-top: 5px; }}
    code {{ color: #c6e4ff; font-size: 11px; }}
    a {{ color: #90caf9; }}
  </style>
</head>
<body>
  <main>
    <p class="eyebrow">Quipsly Social Publishing Readiness</p>
    <h1>Episodes 1-3 short queue truth.</h1>
    <p class="lede">This dashboard is generated from the running native QuipslyStudio app. It does not approve drafts. It shows what exists, what is exported, and what can safely become a reviewed social upload queue.</p>
    {''.join(rows)}
  </main>
</body>
</html>
"""
    html_path = output_root / "episodes-1-3-social-readiness.html"
    html_path.write_text(page)
    return html_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-url", default="http://127.0.0.1:8080")
    parser.add_argument("--sessions", nargs="*", default=DEFAULT_SESSIONS)
    parser.add_argument("--output", default=str(Path.home() / "Movies" / "QuipslyExports" / "SocialQueues" / "episodes-1-3-readiness"))
    parser.add_argument("--generate-reviewed", action="store_true", help="Generate reviewed queues only for sessions with keep-status shorts.")
    args = parser.parse_args()

    output_root = Path(args.output)
    output_root.mkdir(parents=True, exist_ok=True)

    report: dict[str, Any] = {
        "model": "quipsly-episodes-social-readiness-audit",
        "version": "2026-06-18.episodes-social-readiness.v1",
        "agentUrl": args.agent_url,
        "sessions": [],
        "truth": "This audit loads each native session through the running app. It never promotes drafts; only keep-status shorts may generate reviewed social queues.",
    }

    for session in args.sessions:
        state = load_session(args.agent_url, session)
        if state.get("activeSessionName") != session:
            report["sessions"].append({"session": session, "status": "failed-to-load", "stateActiveSession": state.get("activeSessionName")})
            continue
        queue_summary = summarize_short_queue(args.agent_url)
        summary = compact_state_summary(state, queue_summary)
        summary["status"] = "loaded"
        if args.generate_reviewed and summary["canGenerateReviewedQueue"]:
            summary["reviewedQueueGeneration"] = generate_reviewed_queue(args.agent_url, session, output_root)
        elif args.generate_reviewed:
            summary["reviewedQueueGeneration"] = {
                "status": "skipped-no-kept-shorts",
                "outputPath": "",
                "error": "No shorts are marked Keep; drafts were intentionally not promoted.",
            }
        report["sessions"].append(summary)

    report_path = output_root / "episodes-1-3-social-readiness.json"
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True))
    html_path = write_review_html(report, output_root)
    print(json.dumps({
        "status": "pass",
        "reportPath": str(report_path),
        "htmlPath": str(html_path),
        "sessions": [
            {
                "session": item.get("session"),
                "status": item.get("status"),
                "shorts": (item.get("shortQueue") or {}).get("count"),
                "keep": ((item.get("shortQueue") or {}).get("reviewStatusCounts") or {}).get("keep", 0),
                "reviewedQueue": (item.get("reviewedQueueGeneration") or {}).get("status", "not-requested"),
            }
            for item in report["sessions"]
        ],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
