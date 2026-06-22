#!/usr/bin/env python3
"""Build a unified Episode 1 selected artifact review console.

The console groups the selected 16:9 master, 9:16 master, and podcast audio by
review segment. It gives humans and agents one calm surface for watch/listen
review while preserving the truth boundary: viewing aids are not approval.
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


def media_fragment(path: str | None, start: float | int | None, end: float | int | None) -> str:
    if not path:
        return ""
    return f"{file_url(path)}#t={start},{end}"


def artifact_label(artifact_id: str) -> str:
    return {
        "episode-16x9-master": "16:9 episode master",
        "episode-9x16-master": "9:16 vertical master",
        "podcast-audio-master": "Podcast audio",
    }.get(artifact_id, artifact_id)


def artifact_kind(artifact_id: str) -> str:
    return "audio" if artifact_id == "podcast-audio-master" else "video"


def group_items(progress: dict[str, Any], evidence: dict[str, Any], quality: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    artifacts = {item.get("artifactId"): item for item in progress.get("artifacts") or []}
    evidence_by_item = {item.get("itemId"): item for item in evidence.get("evidenceItems") or []}
    quality_by_item = {item.get("itemId"): item for item in (quality or {}).get("items") or []}
    groups: dict[str, dict[str, Any]] = {}
    for item in progress.get("reviewItems") or []:
        segment_id = item.get("segmentId")
        if segment_id not in groups:
            groups[segment_id] = {
                "segmentId": segment_id,
                "label": item.get("label"),
                "startSeconds": item.get("startSeconds"),
                "endSeconds": item.get("endSeconds"),
                "items": [],
            }
        artifact_id = item.get("artifactId")
        artifact = artifacts.get(artifact_id, {})
        evidence_item = evidence_by_item.get(item.get("itemId"), {})
        groups[segment_id]["items"].append({
            **item,
            "artifactLabel": artifact_label(str(artifact_id)),
            "artifactKind": artifact.get("kind") or artifact_kind(str(artifact_id)),
            "sourcePath": artifact.get("path"),
            "sourceExists": bool(artifact.get("path") and os.path.exists(str(artifact.get("path")))),
            "evidence": evidence_item,
            "quality": quality_by_item.get(item.get("itemId"), {}),
        })
    return [groups[key] for key in sorted(groups)]


def build_packet(progress_path: str, evidence_path: str, quality_path: str | None, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    progress = load_json(progress_path)
    evidence = load_json(evidence_path)
    quality = load_json(quality_path) if quality_path and os.path.exists(quality_path) else None
    groups = group_items(progress, evidence, quality)
    summary = progress.get("summary") or {}
    return {
        "packetType": "quipsly-episode1-selected-review-console",
        "version": "2026-06-20.selected-review-console.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceProgressPath": progress_path,
        "sourceEvidencePath": evidence_path,
        "sourceQualityScanPath": quality_path if quality else None,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segmentCount": len(groups),
        "reviewItemCount": len(progress.get("reviewItems") or []),
        "qualityFlaggedItemCount": (quality or {}).get("flaggedItemCount", 0),
        "qualityTotalFlagCount": (quality or {}).get("totalFlagCount", 0),
        "summary": summary,
        "groups": groups,
        "safeCommands": {
            "openConsole": "script/agentctl.sh episode1-selected-review-console --html",
            "openProgress": "script/agentctl.sh episode1-selected-watch-review-progress --html",
            "openEvidence": "script/agentctl.sh episode1-selected-segment-evidence --html",
            "openQualityScan": "script/agentctl.sh episode1-selected-quality-scan --html",
            "markSegmentReviewedTemplate": 'script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 reviewed "Reviewer Name" "Actually watched/listened to this segment across selected artifacts."',
            "markIssueTemplate": 'script/agentctl.sh episode1-selected-watch-review-mark episode-16x9-master:segment-001 issue "Reviewer Name" "Describe exact timestamp and problem."',
        },
        "truth": "This console helps review selected artifacts in segments. It does not mark segments reviewed, approve artifacts, publish, upload, schedule, or capture receipts.",
    }


def stills_html(item: dict[str, Any]) -> str:
    stills = []
    for still in (item.get("evidence") or {}).get("stills") or []:
        if still.get("exists"):
            stills.append(
                f"""
                <figure>
                  <a href="{esc(file_url(still.get('path')))}"><img src="{esc(file_url(still.get('path')))}" alt="{esc(still.get('label'))} still"></a>
                  <figcaption>{esc(still.get('label'))} · {esc(still.get('timecode'))}</figcaption>
                </figure>
                """
            )
    return "".join(stills)


def media_html(item: dict[str, Any]) -> str:
    source = item.get("sourcePath")
    start = item.get("startSeconds")
    end = item.get("endSeconds")
    if not source:
        return '<p class="error">No source file path.</p>'
    if item.get("artifactKind") == "audio":
        return f'<audio controls preload="metadata" src="{esc(media_fragment(source, start, end))}"></audio>'
    return f'<video controls preload="metadata" src="{esc(media_fragment(source, start, end))}"></video>'


def command_for_segment(group: dict[str, Any]) -> str:
    return f'script/agentctl.sh episode1-selected-watch-review-mark all:{group.get("segmentId")} reviewed "Reviewer Name" "Actually watched/listened to {group.get("label")} across selected artifacts."'


def command_for_issue(item: dict[str, Any]) -> str:
    return f'script/agentctl.sh episode1-selected-watch-review-mark {item.get("itemId")} issue "Reviewer Name" "Describe exact timestamp and problem."'


def html_page(packet: dict[str, Any]) -> str:
    summary = packet.get("summary") or {}
    segment_cards = []
    for group in packet.get("groups") or []:
        review_command = command_for_segment(group)
        item_cards = []
        for item in group.get("items") or []:
            warnings = "".join(f"<li>{esc(warning)}</li>" for warning in (item.get("evidence") or {}).get("warnings") or [])
            quality_flags = (item.get("quality") or {}).get("flags") or []
            quality_html = "".join(f"<span class=\"quality-flag\">{esc(flag)}</span>" for flag in quality_flags)
            item_cards.append(
                f"""
                <section class="artifact-card {esc(item.get('artifactKind'))} {esc(item.get('status'))}">
                  <div class="artifact-head">
                    <div>
                      <span class="tiny">{esc(item.get('artifactKind'))}</span>
                      <h3>{esc(item.get('artifactLabel'))}</h3>
                      <p>{esc(item.get('itemId'))}</p>
                    </div>
                    <span class="status {esc(item.get('status'))}">{esc(item.get('status'))}</span>
                  </div>
                  <div class="media">{media_html(item)}</div>
                  {f'<div class="quality-flags">{quality_html}</div>' if quality_html else ''}
                  <div class="stills">{stills_html(item)}</div>
                  {f'<ul class="warn">{warnings}</ul>' if warnings else ''}
                  <button data-copy="{esc(command_for_issue(item))}">Copy issue command</button>
                </section>
                """
            )
        segment_cards.append(
            f"""
            <article class="segment-card" id="{esc(group.get('segmentId'))}">
              <header class="segment-head">
                <div>
                  <span class="kicker">{esc(group.get('segmentId'))}</span>
                  <h2>{esc(group.get('label'))}</h2>
                </div>
                <button data-copy="{esc(review_command)}">Copy mark-reviewed command</button>
              </header>
              <div class="artifact-grid">{''.join(item_cards)}</div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Review Console</title>
  <style>
    :root {{
      --bg: #f3ecdc;
      --paper: #fff9ed;
      --ink: #34281f;
      --muted: #75695d;
      --fern: #2d7552;
      --moss: #e6efd8;
      --gold: #d8aa32;
      --clay: #a14d38;
      --river: #2e6f84;
      --line: rgba(68, 50, 36, .16);
      --shadow: 0 22px 70px rgba(48, 35, 22, .14);
    }}
    * {{ box-sizing: border-box; }}
    html {{ scroll-behavior: smooth; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 8% 0%, rgba(216, 170, 50, .20), transparent 30rem),
        radial-gradient(circle at 92% 4%, rgba(45, 117, 82, .16), transparent 34rem),
        linear-gradient(135deg, #fbf6ea, var(--bg));
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    body::before {{
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: .19;
      background-image: linear-gradient(120deg, rgba(52, 40, 31, .06) 1px, transparent 1px);
      background-size: 28px 28px;
    }}
    .shell {{ width: min(1500px, calc(100% - 40px)); margin: 0 auto; padding: 48px 0 80px; }}
    .hero, .segment-card {{
      background: rgba(255, 249, 237, .9);
      border: 1px solid var(--line);
      border-radius: 30px;
      box-shadow: var(--shadow);
    }}
    .hero {{ padding: clamp(24px, 4vw, 42px); margin-bottom: 22px; }}
    .kicker, .tiny {{ color: #a97524; font-size: .76rem; font-weight: 950; letter-spacing: .2em; text-transform: uppercase; }}
    h1 {{ margin: 10px 0 14px; max-width: 900px; font-size: clamp(2.3rem, 6vw, 5.6rem); line-height: .88; letter-spacing: -.06em; }}
    h2, h3 {{ margin: 0; letter-spacing: -.035em; }}
    p, li, figcaption {{ color: var(--muted); line-height: 1.45; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }}
    .pill, .status {{
      border-radius: 999px;
      padding: 8px 11px;
      font-size: .72rem;
      font-weight: 950;
      text-transform: uppercase;
      letter-spacing: .08em;
      background: var(--river);
      color: #fff;
    }}
    .pending {{ background: var(--gold); color: #2d2418; }}
    .reviewed {{ background: var(--fern); color: #fff; }}
    .issue {{ background: var(--clay); color: #fff; }}
    .segment-nav {{ display: flex; gap: 8px; flex-wrap: wrap; margin: 18px 0 0; }}
    .segment-nav a {{ color: var(--fern); background: rgba(45, 117, 82, .1); border-radius: 999px; padding: 8px 10px; text-decoration: none; font-weight: 900; }}
    .segment-card {{ margin-top: 18px; padding: 18px; }}
    .segment-head {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }}
    .artifact-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }}
    .artifact-card {{ background: rgba(255,255,255,.46); border: 1px solid var(--line); border-radius: 22px; padding: 14px; }}
    .artifact-head {{ display: flex; justify-content: space-between; gap: 12px; margin-bottom: 12px; }}
    video, audio {{ width: 100%; border-radius: 16px; background: #161411; border: 1px solid rgba(0,0,0,.18); }}
    video {{ aspect-ratio: 16 / 9; object-fit: contain; max-height: 360px; }}
    .artifact-card.audio .media {{ display: flex; align-items: center; min-height: 120px; }}
    .stills {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 10px; }}
    figure {{ margin: 0; }}
    img {{ display: block; width: 100%; border-radius: 12px; border: 1px solid var(--line); }}
    figcaption {{ font-size: .76rem; margin-top: 4px; }}
    button {{
      appearance: none;
      border: 0;
      border-radius: 999px;
      background: #3b2d21;
      color: #fff6e6;
      font-weight: 950;
      padding: 10px 13px;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(52, 40, 31, .16);
    }}
    button.copied {{ background: var(--fern); }}
    .warn {{ color: #795716; }}
    .boundary {{ margin-top: 18px; border-left: 4px solid var(--gold); padding-left: 14px; }}
    @media (max-width: 1100px) {{ .artifact-grid {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main class="shell">
    <section class="hero">
      <span class="kicker">Quipsly Studio review console</span>
      <h1>Review the episode in sane, receipt-backed chunks.</h1>
      <p>This console groups the selected 16:9 master, 9:16 master, and podcast audio by the same sequence segment. It is a calm review station, not an approval machine.</p>
      <div class="stats">
        <span class="pill">{esc(packet.get('segmentCount'))} segments</span>
        <span class="pill pending">{esc(summary.get('pending'))} pending</span>
        <span class="pill reviewed">{esc(summary.get('reviewed'))} reviewed</span>
        <span class="pill issue">{esc(summary.get('issue'))} issues</span>
        <span class="pill">{esc(packet.get('qualityFlaggedItemCount'))} machine-flagged</span>
        <span class="pill">{esc(summary.get('completionPercent'))}% complete</span>
      </div>
      <nav class="segment-nav">
        {''.join(f'<a href="#{esc(group.get("segmentId"))}">{esc(group.get("label"))}</a>' for group in packet.get('groups') or [])}
      </nav>
      <p class="boundary">{esc(packet.get('truth'))}</p>
    </section>
    {''.join(segment_cards)}
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
        "# Episode 1 selected review console",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- Segments: `{packet['segmentCount']}`",
        f"- Review items: `{packet['reviewItemCount']}`",
        f"- Completion: `{packet.get('summary', {}).get('completionPercent')}`%",
        "",
        "## Truth boundary",
        "",
        packet["truth"],
        "",
        "## Segment commands",
        "",
    ]
    for group in packet.get("groups") or []:
        lines.append(f"- `{group.get('label')}`: `{command_for_segment(group)}`")
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) not in {5, 6}:
        print("usage: episode1_selected_review_console.py progress.json evidence.json [quality.json] output.json output.html", file=sys.stderr)
        return 2
    if len(sys.argv) == 5:
        progress_path, evidence_path, output_json, output_html = sys.argv[1:5]
        quality_path = None
    else:
        progress_path, evidence_path, quality_path, output_json, output_html = sys.argv[1:6]
    output_md = os.path.splitext(output_html)[0] + ".md"
    packet = build_packet(progress_path, evidence_path, quality_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-review-console-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segmentCount": packet["segmentCount"],
        "reviewItemCount": packet["reviewItemCount"],
        "summary": packet["summary"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
