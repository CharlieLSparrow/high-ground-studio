#!/usr/bin/env python3
"""Machine quality scan for selected Episode 1 review artifacts.

This is a triage assistant, not a reviewer. It flags likely visual/audio
attention points so humans and agents can review faster without pretending the
machine approved the artifact set.
"""

from __future__ import annotations

import html
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from statistics import mean
from typing import Any
from urllib.parse import quote


DARK_LUMA_THRESHOLD = 55.0
VERY_DARK_LUMA_THRESHOLD = 35.0
AUDIO_SAMPLE_SECONDS = 30.0


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


def run(command: list[str], timeout: int = 60) -> tuple[int, str]:
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=timeout)
        return result.returncode, result.stdout
    except Exception as error:
        return 99, str(error)


def parse_float(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def still_luma(ffmpeg: str, path: str) -> dict[str, Any]:
    code, output = run([
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "info",
        "-i",
        path,
        "-vf",
        "signalstats,metadata=print",
        "-frames:v",
        "1",
        "-f",
        "null",
        "-",
    ])
    yavg = parse_float(r"lavfi\.signalstats\.YAVG=([-0-9.]+)", output)
    ylow = parse_float(r"lavfi\.signalstats\.YLOW=([-0-9.]+)", output)
    yhigh = parse_float(r"lavfi\.signalstats\.YHIGH=([-0-9.]+)", output)
    flags: list[str] = []
    if yavg is None:
        flags.append("luma-unavailable")
    elif yavg < VERY_DARK_LUMA_THRESHOLD:
        flags.append("very-dark-frame")
    elif yavg < DARK_LUMA_THRESHOLD:
        flags.append("dark-frame")
    return {
        "path": path,
        "exitCode": code,
        "lumaAverage": yavg,
        "lumaLow": ylow,
        "lumaHigh": yhigh,
        "flags": flags,
    }


def audio_sample(ffmpeg: str, path: str, start: float) -> dict[str, Any]:
    code, output = run([
        ffmpeg,
        "-hide_banner",
        "-nostats",
        "-ss",
        f"{max(0, start):.3f}",
        "-t",
        f"{AUDIO_SAMPLE_SECONDS:.3f}",
        "-i",
        path,
        "-af",
        "volumedetect",
        "-f",
        "null",
        "-",
    ], timeout=90)
    mean_volume = parse_float(r"mean_volume:\s*([-0-9.]+) dB", output)
    max_volume = parse_float(r"max_volume:\s*([-0-9.]+) dB", output)
    flags: list[str] = []
    if mean_volume is None:
        flags.append("audio-volume-unavailable")
    elif mean_volume < -50:
        flags.append("possible-silence-or-very-low-audio")
    if max_volume is not None and max_volume > -1:
        flags.append("possible-audio-clipping")
    return {
        "path": path,
        "sampleStartSeconds": round(start, 3),
        "sampleDurationSeconds": AUDIO_SAMPLE_SECONDS,
        "exitCode": code,
        "meanVolumeDb": mean_volume,
        "maxVolumeDb": max_volume,
        "flags": flags,
    }


def scan_item(ffmpeg: str | None, item: dict[str, Any]) -> dict[str, Any]:
    result = {
        "itemId": item.get("itemId"),
        "artifactId": item.get("artifactId"),
        "segmentId": item.get("segmentId"),
        "label": item.get("label"),
        "kind": item.get("kind"),
        "sourcePath": item.get("sourcePath"),
        "flags": [],
        "stills": [],
        "audio": None,
        "summary": "not-scanned",
    }
    if not ffmpeg:
        result["flags"].append("ffmpeg-unavailable")
        return result
    if not item.get("sourceExists"):
        result["flags"].append("source-missing")
        return result
    if item.get("kind") == "video":
        lumas = []
        for still in item.get("stills") or []:
            path = still.get("path")
            if not path or not os.path.exists(path):
                result["flags"].append(f"missing-still:{still.get('label')}")
                continue
            scanned = {
                "label": still.get("label"),
                "seconds": still.get("seconds"),
                "timecode": still.get("timecode"),
                **still_luma(ffmpeg, path),
            }
            if scanned.get("lumaAverage") is not None:
                lumas.append(float(scanned["lumaAverage"]))
            result["stills"].append(scanned)
            result["flags"].extend(scanned.get("flags") or [])
        if lumas:
            avg = mean(lumas)
            result["averageCheckpointLuma"] = round(avg, 2)
            if avg < DARK_LUMA_THRESHOLD:
                result["flags"].append("segment-generally-dark")
        result["summary"] = "visual-attention-needed" if result["flags"] else "visual-scan-clear"
    elif item.get("kind") == "audio":
        result["audio"] = audio_sample(ffmpeg, str(item.get("sourcePath")), float(item.get("startSeconds") or 0))
        result["flags"].extend(result["audio"].get("flags") or [])
        result["summary"] = "audio-attention-needed" if result["flags"] else "audio-sample-clear"
    else:
        result["flags"].append("unknown-kind")
    result["flags"] = sorted(set(result["flags"]))
    return result


def html_page(packet: dict[str, Any]) -> str:
    cards = []
    for item in packet.get("items") or []:
        flags = item.get("flags") or []
        flag_html = "".join(f"<span class=\"flag\">{esc(flag)}</span>" for flag in flags) or '<span class="ok">scan clear</span>'
        stills = []
        for still in item.get("stills") or []:
            still_flags = "".join(f"<span class=\"flag\">{esc(flag)}</span>" for flag in still.get("flags") or [])
            stills.append(
                f"""
                <figure>
                  <a href="{esc(file_url(still.get('path')))}"><img src="{esc(file_url(still.get('path')))}" alt="{esc(still.get('label'))}"></a>
                  <figcaption>{esc(still.get('label'))} · luma {esc(still.get('lumaAverage'))} {still_flags}</figcaption>
                </figure>
                """
            )
        audio = item.get("audio") or {}
        audio_html = ""
        if audio:
            audio_html = f"<p>Audio sample: mean `{esc(audio.get('meanVolumeDb'))}` dB, max `{esc(audio.get('maxVolumeDb'))}` dB.</p>"
        cards.append(
            f"""
            <article class="card {esc(item.get('summary'))}">
              <div class="meta"><span>{esc(item.get('kind'))}</span><span>{esc(item.get('label'))}</span></div>
              <h2>{esc(item.get('itemId'))}</h2>
              <div class="flags">{flag_html}</div>
              {audio_html}
              <div class="stills">{''.join(stills)}</div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Quality Scan</title>
  <style>
    :root {{ --bg:#f3ecdc; --paper:#fff9ed; --ink:#34281f; --muted:#75695d; --fern:#2d7552; --gold:#d8aa32; --clay:#a14d38; --line:rgba(68,50,36,.16); }}
    body {{ margin:0; color:var(--ink); background:linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1320px,calc(100% - 40px)); margin:0 auto; padding:48px 0 80px; }}
    .hero,.card {{ background:rgba(255,249,237,.92); border:1px solid var(--line); border-radius:26px; box-shadow:0 20px 64px rgba(48,35,22,.13); }}
    .hero {{ padding:30px; margin-bottom:18px; }}
    h1 {{ margin:8px 0 10px; font-size:clamp(2.2rem,5vw,4.9rem); line-height:.9; letter-spacing:-.055em; }}
    p,figcaption {{ color:var(--muted); }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    .stats,.flags,.meta {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .pill,.flag,.ok,.meta span {{ border-radius:999px; padding:7px 10px; font-size:.72rem; font-weight:900; text-transform:uppercase; letter-spacing:.06em; }}
    .pill,.ok {{ background:var(--fern); color:white; }}
    .flag {{ background:var(--gold); color:#2d2418; }}
    .card {{ padding:18px; margin-top:14px; }}
    .visual-attention-needed,.audio-attention-needed {{ border-color:rgba(161,77,56,.45); }}
    .stills {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; margin-top:12px; }}
    figure {{ margin:0; }}
    img {{ width:100%; border-radius:14px; border:1px solid var(--line); display:block; background:#161411; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly machine triage</span>
      <h1>Quality flags are attention guides, not verdicts.</h1>
      <p>This scan looks for likely dark visual checkpoints and audio-volume concerns. It does not replace watch/listen review.</p>
      <div class="stats">
        <span class="pill">{esc(packet.get('itemCount'))} items</span>
        <span class="pill">{esc(packet.get('flaggedItemCount'))} flagged</span>
        <span class="pill">{esc(packet.get('totalFlagCount'))} flags</span>
      </div>
    </section>
    {''.join(cards)}
  </main>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 selected quality scan",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- Items: `{packet['itemCount']}`",
        f"- Flagged items: `{packet['flaggedItemCount']}`",
        f"- Total flags: `{packet['totalFlagCount']}`",
        "",
        "## Boundary",
        "",
        packet["truth"],
        "",
        "## Flags",
        "",
    ]
    for item in packet.get("items") or []:
        if item.get("flags"):
            lines.append(f"- `{item.get('itemId')}` {item.get('label')}: {', '.join(item.get('flags'))}")
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: episode1_selected_quality_scan.py evidence.json output.json output.html output.md", file=sys.stderr)
        return 2
    evidence_path, output_json, output_html, output_md = sys.argv[1:5]
    evidence = load_json(evidence_path)
    ffmpeg = shutil.which("ffmpeg")
    items = [scan_item(ffmpeg, item) for item in evidence.get("evidenceItems") or []]
    flagged = [item for item in items if item.get("flags")]
    packet = {
        "packetType": "quipsly-episode1-selected-quality-scan",
        "version": "2026-06-20.selected-quality-scan.v1",
        "projectSlug": evidence.get("projectSlug"),
        "episodeSlug": evidence.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceEvidencePath": evidence_path,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "thresholds": {
            "darkLumaAverageBelow": DARK_LUMA_THRESHOLD,
            "veryDarkLumaAverageBelow": VERY_DARK_LUMA_THRESHOLD,
            "audioSampleSeconds": AUDIO_SAMPLE_SECONDS,
        },
        "itemCount": len(items),
        "flaggedItemCount": len(flagged),
        "totalFlagCount": sum(len(item.get("flags") or []) for item in items),
        "items": items,
        "flaggedItems": [{"itemId": item.get("itemId"), "flags": item.get("flags"), "summary": item.get("summary")} for item in flagged],
        "truth": "This machine quality scan flags likely attention points. It does not mark review items reviewed, approve artifacts, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_json, packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-quality-scan-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "itemCount": packet["itemCount"],
        "flaggedItemCount": packet["flaggedItemCount"],
        "totalFlagCount": packet["totalFlagCount"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
