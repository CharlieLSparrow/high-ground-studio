#!/usr/bin/env python3
"""Turn selected Episode 1 quality flags into an actionable triage brief.

The quality scan is machine attention, not judgment. This brief groups those
flags by review segment and prepares commands a reviewer can use after actually
watching/listening.
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


def severity(flags: list[str]) -> str:
    if any(flag in flags for flag in ("source-missing", "ffmpeg-unavailable", "luma-unavailable", "audio-volume-unavailable")):
        return "blocked"
    if any(flag in flags for flag in ("very-dark-frame", "possible-audio-clipping", "possible-silence-or-very-low-audio")):
        return "review-first"
    if flags:
        return "needs-look"
    return "clear"


def issue_command(item_id: str, flags: list[str], label: str) -> str:
    joined = ", ".join(flags)
    return f'script/agentctl.sh episode1-selected-watch-review-mark {item_id} issue "Reviewer Name" "Quality triage during {label}: {joined}. Add exact timestamp and decision after real review."'


def segment_command(segment_id: str, label: str) -> str:
    return f'script/agentctl.sh episode1-selected-watch-review-mark all:{segment_id} reviewed "Reviewer Name" "Actually watched/listened to {label} across selected artifacts; quality flags reviewed."'


def grouped_triage(scan: dict[str, Any]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for item in scan.get("items") or []:
        segment_id = item.get("segmentId")
        if segment_id not in groups:
            groups[segment_id] = {
                "segmentId": segment_id,
                "label": item.get("label"),
                "severity": "clear",
                "flaggedItems": [],
                "clearItems": [],
            }
        flags = item.get("flags") or []
        item_severity = severity(flags)
        normalized = {
            "itemId": item.get("itemId"),
            "artifactId": item.get("artifactId"),
            "kind": item.get("kind"),
            "label": item.get("label"),
            "summary": item.get("summary"),
            "severity": item_severity,
            "flags": flags,
            "averageCheckpointLuma": item.get("averageCheckpointLuma"),
            "audio": item.get("audio"),
            "issueCommand": issue_command(str(item.get("itemId")), flags, str(item.get("label"))) if flags else None,
        }
        if flags:
            groups[segment_id]["flaggedItems"].append(normalized)
        else:
            groups[segment_id]["clearItems"].append(normalized)
        if item_severity == "blocked":
            groups[segment_id]["severity"] = "blocked"
        elif item_severity == "review-first" and groups[segment_id]["severity"] not in {"blocked"}:
            groups[segment_id]["severity"] = "review-first"
        elif item_severity == "needs-look" and groups[segment_id]["severity"] == "clear":
            groups[segment_id]["severity"] = "needs-look"
    result = []
    order = {"blocked": 0, "review-first": 1, "needs-look": 2, "clear": 3}
    for group in groups.values():
        group["flaggedItemCount"] = len(group["flaggedItems"])
        group["clearItemCount"] = len(group["clearItems"])
        group["markReviewedAfterReviewCommand"] = segment_command(str(group["segmentId"]), str(group["label"]))
        result.append(group)
    return sorted(result, key=lambda group: (order.get(group["severity"], 9), group["segmentId"] or ""))


def build_packet(scan_path: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    scan = load_json(scan_path)
    groups = grouped_triage(scan)
    flagged_groups = [group for group in groups if group.get("flaggedItemCount")]
    return {
        "packetType": "quipsly-episode1-selected-quality-triage",
        "version": "2026-06-20.selected-quality-triage.v1",
        "projectSlug": scan.get("projectSlug"),
        "episodeSlug": scan.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceQualityScanPath": scan_path,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segmentCount": len(groups),
        "flaggedSegmentCount": len(flagged_groups),
        "flaggedItemCount": scan.get("flaggedItemCount", 0),
        "totalFlagCount": scan.get("totalFlagCount", 0),
        "groups": groups,
        "safeCommands": {
            "openReviewConsole": "script/agentctl.sh episode1-selected-review-console --html",
            "openQualityScan": "script/agentctl.sh episode1-selected-quality-scan --html",
            "openQualityTriage": "script/agentctl.sh episode1-selected-quality-triage --html",
        },
        "truth": "This triage brief groups machine quality flags for attention. It does not mark review items reviewed, approve artifacts, reject artifacts, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    cards = []
    for group in packet.get("groups") or []:
        flagged = []
        for item in group.get("flaggedItems") or []:
            flags = "".join(f"<span class=\"flag\">{esc(flag)}</span>" for flag in item.get("flags") or [])
            audio = item.get("audio") or {}
            audio_text = ""
            if audio:
                audio_text = f"<p>Audio sample mean {esc(audio.get('meanVolumeDb'))} dB, max {esc(audio.get('maxVolumeDb'))} dB.</p>"
            luma_text = ""
            if item.get("averageCheckpointLuma") is not None:
                luma_text = f"<p>Average checkpoint luma: {esc(item.get('averageCheckpointLuma'))}</p>"
            flagged.append(
                f"""
                <section class="item {esc(item.get('severity'))}">
                  <h3>{esc(item.get('itemId'))}</h3>
                  <div class="flags">{flags}</div>
                  {luma_text}
                  {audio_text}
                  <button data-copy="{esc(item.get('issueCommand'))}">Copy issue command</button>
                </section>
                """
            )
        if not flagged:
            flagged.append("<p class=\"clear-note\">No machine quality flags in this segment. Still review it manually before marking reviewed.</p>")
        cards.append(
            f"""
            <article class="segment {esc(group.get('severity'))}">
              <div class="segment-head">
                <div>
                  <span class="kicker">{esc(group.get('segmentId'))} · {esc(group.get('severity'))}</span>
                  <h2>{esc(group.get('label'))}</h2>
                  <p>{esc(group.get('flaggedItemCount'))} flagged items · {esc(group.get('clearItemCount'))} clear items</p>
                </div>
                <button data-copy="{esc(group.get('markReviewedAfterReviewCommand'))}">Copy mark-reviewed command</button>
              </div>
              <div class="items">{''.join(flagged)}</div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Quality Triage</title>
  <style>
    :root {{ --bg:#f3ecdc; --paper:#fff9ed; --ink:#34281f; --muted:#75695d; --fern:#2d7552; --gold:#d8aa32; --clay:#a14d38; --river:#2e6f84; --line:rgba(68,50,36,.16); }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0%,rgba(216,170,50,.18),transparent 32rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1260px,calc(100% - 40px)); margin:0 auto; padding:48px 0 80px; }}
    .hero,.segment {{ background:rgba(255,249,237,.92); border:1px solid var(--line); border-radius:28px; box-shadow:0 20px 64px rgba(48,35,22,.13); }}
    .hero {{ padding:32px; margin-bottom:18px; }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.2rem,5vw,4.9rem); line-height:.9; letter-spacing:-.055em; }}
    h2,h3 {{ margin:0; letter-spacing:-.035em; }}
    p {{ color:var(--muted); line-height:1.45; }}
    .stats,.flags {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .pill,.flag {{ border-radius:999px; padding:7px 10px; font-size:.72rem; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }}
    .pill {{ background:var(--fern); color:white; }}
    .flag {{ background:var(--gold); color:#2d2418; }}
    .segment {{ padding:18px; margin-top:14px; }}
    .segment.review-first {{ border-color:rgba(161,77,56,.45); }}
    .segment-head {{ display:flex; align-items:flex-start; justify-content:space-between; gap:16px; }}
    .items {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; margin-top:14px; }}
    .item {{ background:rgba(255,255,255,.48); border:1px solid var(--line); border-radius:20px; padding:14px; }}
    button {{ appearance:none; border:0; border-radius:999px; background:#3b2d21; color:#fff6e6; font-weight:950; padding:10px 13px; cursor:pointer; }}
    button.copied {{ background:var(--fern); }}
    .clear-note {{ background:rgba(45,117,82,.08); border-radius:16px; padding:12px; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly attention triage</span>
      <h1>Look here first, then decide with your eyes and ears.</h1>
      <p>This groups machine quality flags by review segment. It is a calm checklist for attention, not an approval engine.</p>
      <div class="stats">
        <span class="pill">{esc(packet.get('segmentCount'))} segments</span>
        <span class="pill">{esc(packet.get('flaggedSegmentCount'))} flagged segments</span>
        <span class="pill">{esc(packet.get('flaggedItemCount'))} flagged items</span>
        <span class="pill">{esc(packet.get('totalFlagCount'))} total flags</span>
      </div>
      <p>{esc(packet.get('truth'))}</p>
    </section>
    {''.join(cards)}
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
        "# Episode 1 selected quality triage",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- Segments: `{packet['segmentCount']}`",
        f"- Flagged segments: `{packet['flaggedSegmentCount']}`",
        f"- Flagged items: `{packet['flaggedItemCount']}`",
        f"- Total flags: `{packet['totalFlagCount']}`",
        "",
        "## Boundary",
        "",
        packet["truth"],
        "",
        "## Segment triage",
        "",
    ]
    for group in packet.get("groups") or []:
        lines.append(f"- `{group.get('severity')}` `{group.get('segmentId')}` {group.get('label')} - flagged `{group.get('flaggedItemCount')}`")
        for item in group.get("flaggedItems") or []:
            lines.append(f"  - `{item.get('itemId')}`: {', '.join(item.get('flags') or [])}")
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: episode1_selected_quality_triage.py quality-scan.json output.json output.html output.md", file=sys.stderr)
        return 2
    scan_path, output_json, output_html, output_md = sys.argv[1:5]
    packet = build_packet(scan_path, output_json, output_html, output_md)
    write_json(output_json, packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-quality-triage-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "segmentCount": packet["segmentCount"],
        "flaggedSegmentCount": packet["flaggedSegmentCount"],
        "flaggedItemCount": packet["flaggedItemCount"],
        "totalFlagCount": packet["totalFlagCount"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
