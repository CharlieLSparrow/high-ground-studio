#!/usr/bin/env python3
"""Generate segment-level evidence for selected Episode 1 artifacts.

This helper creates visual review aids for the segmented watch/listen ledger.
It is intentionally not an approval tool: stills and probes make review calmer,
but the watch/listen ledger and final artifact decision remain separate.
"""

from __future__ import annotations

import html
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from typing import Any


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


def file_url(path: str | None) -> str:
    if not path:
        return ""
    return "file://" + os.path.abspath(path)


def slug(value: str) -> str:
    allowed = []
    for char in value.lower():
        if char.isalnum():
            allowed.append(char)
        elif char in {"-", "_", ":", "."}:
            allowed.append("-" if char == ":" else char)
        else:
            allowed.append("-")
    return "-".join(filter(None, "".join(allowed).split("-")))[:96] or "item"


def run_ffmpeg_still(ffmpeg: str, source: str, seconds: float, output: str) -> tuple[bool, str | None]:
    if os.path.exists(output) and os.path.getsize(output) > 0:
        return True, None
    os.makedirs(os.path.dirname(output), exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{max(0, seconds):.3f}",
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=640:-1",
        "-y",
        output,
    ]
    try:
        subprocess.run(command, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=60)
        return True, None
    except subprocess.CalledProcessError as error:
        return False, (error.stderr or str(error)).strip()
    except Exception as error:
        return False, str(error)


def checkpoint_times(start: float, end: float) -> list[dict[str, Any]]:
    duration = max(0.0, end - start)
    if duration <= 0:
        return []
    offsets = [
        ("opening", min(duration * 0.10, 30.0)),
        ("midpoint", duration * 0.50),
        ("ending", max(duration - min(duration * 0.10, 30.0), 0.0)),
    ]
    seen: set[int] = set()
    checkpoints: list[dict[str, Any]] = []
    for label, offset in offsets:
        seconds = start + offset
        key = int(round(seconds * 1000))
        if key in seen:
            continue
        seen.add(key)
        checkpoints.append({"label": label, "seconds": round(seconds, 3)})
    return checkpoints


def artifact_by_id(progress: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {item.get("artifactId"): item for item in progress.get("artifacts") or []}


def build_packet(progress: dict[str, Any], output_dir: str, output_json: str, output_html: str, output_md: str) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    artifacts = artifact_by_id(progress)
    evidence_items: list[dict[str, Any]] = []
    warnings: list[str] = []
    errors: list[str] = []

    for item in progress.get("reviewItems") or []:
        artifact = artifacts.get(item.get("artifactId"), {})
        source_path = artifact.get("path")
        kind = artifact.get("kind")
        exists = bool(source_path and os.path.exists(source_path))
        evidence = {
            "itemId": item.get("itemId"),
            "artifactId": item.get("artifactId"),
            "segmentId": item.get("segmentId"),
            "label": item.get("label"),
            "status": item.get("status"),
            "kind": kind,
            "sourcePath": source_path,
            "sourceExists": exists,
            "startSeconds": item.get("startSeconds"),
            "endSeconds": item.get("endSeconds"),
            "mediaLink": f"{file_url(source_path)}#t={item.get('startSeconds')},{item.get('endSeconds')}" if source_path else "",
            "stills": [],
            "warnings": [],
            "errors": [],
        }
        if not exists:
            evidence["errors"].append("Source artifact is missing.")
        elif kind == "video":
            if not ffmpeg:
                evidence["warnings"].append("ffmpeg is not available, so checkpoint stills were not generated.")
            else:
                start = float(item.get("startSeconds") or 0)
                end = float(item.get("endSeconds") or start)
                for checkpoint in checkpoint_times(start, end):
                    filename = f"{slug(str(item.get('itemId')))}-{checkpoint['label']}.jpg"
                    image_path = os.path.join(output_dir, "stills", filename)
                    ok, error = run_ffmpeg_still(ffmpeg, source_path, float(checkpoint["seconds"]), image_path)
                    still = {
                        "label": checkpoint["label"],
                        "seconds": checkpoint["seconds"],
                        "timecode": fmt_time(checkpoint["seconds"]),
                        "path": image_path,
                        "exists": ok and os.path.exists(image_path),
                    }
                    if error:
                        still["error"] = error
                        evidence["warnings"].append(f"{checkpoint['label']} still failed: {error}")
                    evidence["stills"].append(still)
        elif kind == "audio":
            evidence["warnings"].append("Audio segment has no visual stills; listen review is still required.")
        else:
            evidence["warnings"].append(f"Unknown artifact kind: {kind}")

        warnings.extend(f"{evidence['itemId']}: {warning}" for warning in evidence["warnings"])
        errors.extend(f"{evidence['itemId']}: {error}" for error in evidence["errors"])
        evidence_items.append(evidence)

    ready_video_items = [
        item for item in evidence_items
        if item.get("kind") == "video" and item.get("sourceExists") and item.get("stills")
    ]
    packet = {
        "packetType": "quipsly-episode1-selected-segment-evidence",
        "version": "2026-06-20.selected-segment-evidence.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceProgressPath": progress.get("currentPath"),
        "outputDir": output_dir,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "artifactCount": len(progress.get("artifacts") or []),
        "reviewItemCount": len(evidence_items),
        "videoEvidenceItemCount": len(ready_video_items),
        "warningCount": len(warnings),
        "errorCount": len(errors),
        "warnings": warnings,
        "errors": errors,
        "evidenceItems": evidence_items,
        "safeCommands": {
            "openEvidence": "script/agentctl.sh episode1-selected-segment-evidence --html",
            "openProgress": "script/agentctl.sh episode1-selected-watch-review-progress --html",
            "markSegmentReviewedAfterRealReview": 'script/agentctl.sh episode1-selected-watch-review-mark all:segment-001 reviewed "Reviewer Name" "Actually watched/listened to this segment."',
            "markIssue": 'script/agentctl.sh episode1-selected-watch-review-mark episode-16x9-master:segment-001 issue "Reviewer Name" "Describe exact issue and timestamp."',
        },
        "truth": "This packet supplies segment-level evidence only. It does not mark review items reviewed, approve artifacts, publish, upload, schedule, or capture receipts.",
    }
    return packet


def html_page(packet: dict[str, Any]) -> str:
    cards = []
    for item in packet.get("evidenceItems") or []:
        stills = []
        for still in item.get("stills") or []:
            if still.get("exists"):
                stills.append(
                    f"""
                    <figure>
                      <a href="{esc(file_url(still.get('path')))}"><img src="{esc(file_url(still.get('path')))}" alt="{esc(still.get('label'))} still"></a>
                      <figcaption>{esc(still.get('label'))} · {esc(still.get('timecode'))}</figcaption>
                    </figure>
                    """
                )
            else:
                stills.append(f"<p class=\"warn\">Missing still: {esc(still.get('label'))}</p>")
        if not stills:
            stills.append("<p class=\"warn\">No visual stills for this item. Audio/listen review remains manual.</p>")
        notes = "".join(f"<li>{esc(warning)}</li>" for warning in item.get("warnings") or [])
        errors = "".join(f"<li>{esc(error)}</li>" for error in item.get("errors") or [])
        cards.append(
            f"""
            <article class="card {esc(item.get('kind'))}">
              <div class="meta">
                <span>{esc(item.get('kind'))}</span>
                <span>{esc(item.get('status'))}</span>
                <span>{esc(item.get('label'))}</span>
              </div>
              <h2>{esc(item.get('itemId'))}</h2>
              <p><a href="{esc(item.get('mediaLink'))}">Open source at segment</a></p>
              <div class="stills">{''.join(stills)}</div>
              {f'<ul class="warn">{notes}</ul>' if notes else ''}
              {f'<ul class="error">{errors}</ul>' if errors else ''}
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Segment Evidence</title>
  <style>
    :root {{
      --bg: #f5efe2;
      --paper: #fffaf1;
      --ink: #34271e;
      --muted: #75695c;
      --fern: #2e7252;
      --gold: #d4a72f;
      --clay: #9d4d37;
      --line: rgba(71, 52, 36, .16);
      --shadow: 0 20px 70px rgba(45, 34, 22, .13);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 8%, rgba(212, 167, 47, .20), transparent 34rem),
        radial-gradient(circle at 88% 0%, rgba(46, 114, 82, .18), transparent 34rem),
        linear-gradient(135deg, #fbf6eb, var(--bg));
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    header, main {{ padding-inline: clamp(20px, 5vw, 76px); }}
    header {{ padding-top: 48px; padding-bottom: 20px; }}
    .hero, .card {{
      background: rgba(255, 250, 241, .9);
      border: 1px solid var(--line);
      border-radius: 26px;
      box-shadow: var(--shadow);
    }}
    .hero {{ padding: 28px; }}
    .kicker {{ color: #a87524; font-size: .78rem; font-weight: 900; letter-spacing: .22em; text-transform: uppercase; }}
    h1 {{ margin: 10px 0 12px; font-size: clamp(2.1rem, 5vw, 4.7rem); line-height: .92; letter-spacing: -.055em; }}
    h2 {{ margin: 8px 0 10px; font-size: 1.1rem; overflow-wrap: anywhere; }}
    p, li, figcaption {{ color: var(--muted); line-height: 1.45; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
    .pill {{ border-radius: 999px; padding: 8px 11px; font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: #fff; background: var(--fern); }}
    .pill.warn {{ background: var(--gold); color: #2f2618; }}
    .pill.error {{ background: var(--clay); }}
    main {{ display: grid; gap: 18px; padding-bottom: 80px; }}
    .card {{ padding: 20px; }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 8px; }}
    .meta span {{ border-radius: 999px; padding: 5px 8px; background: rgba(52, 39, 30, .08); color: var(--muted); font-size: .72rem; font-weight: 800; text-transform: uppercase; }}
    .stills {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-top: 12px; }}
    figure {{ margin: 0; }}
    img {{ width: 100%; border-radius: 16px; border: 1px solid var(--line); display: block; background: #1d1c19; }}
    a {{ color: #236b55; font-weight: 900; }}
    .warn {{ color: #815c19; }}
    .error {{ color: var(--clay); }}
  </style>
</head>
<body>
  <header>
    <section class="hero">
      <div class="kicker">Quipsly Studio segment evidence</div>
      <h1>Proof aids, not approval theater.</h1>
      <p>These stills and links make the selected Episode 1 review less scary. They do not replace watch/listen review.</p>
      <div class="stats">
        <span class="pill">{esc(packet.get('reviewItemCount'))} review items</span>
        <span class="pill">{esc(packet.get('videoEvidenceItemCount'))} video evidence items</span>
        <span class="pill warn">{esc(packet.get('warningCount'))} warnings</span>
        <span class="pill error">{esc(packet.get('errorCount'))} errors</span>
      </div>
    </section>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""


def markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 1 selected segment evidence",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"- Review items: `{packet['reviewItemCount']}`",
        f"- Video evidence items: `{packet['videoEvidenceItemCount']}`",
        f"- Warnings: `{packet['warningCount']}`",
        f"- Errors: `{packet['errorCount']}`",
        "",
        "## Boundary",
        "",
        packet["truth"],
        "",
        "## Items",
        "",
    ]
    for item in packet.get("evidenceItems") or []:
        lines.append(f"- `{item.get('itemId')}` {item.get('label')} - `{item.get('kind')}` - stills `{len(item.get('stills') or [])}`")
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) != 5:
        print("usage: episode1_selected_segment_evidence.py progress.json output-dir output.json output.html", file=sys.stderr)
        return 2
    progress_path, output_dir, output_json, output_html = sys.argv[1:5]
    output_md = os.path.splitext(output_html)[0] + ".md"
    progress = load_json(progress_path)
    os.makedirs(output_dir, exist_ok=True)
    packet = build_packet(progress, output_dir, output_json, output_html, output_md)
    write_json(output_json, packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(html_page(packet))
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-segment-evidence-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "reviewItemCount": packet["reviewItemCount"],
        "videoEvidenceItemCount": packet["videoEvidenceItemCount"],
        "warningCount": packet["warningCount"],
        "errorCount": packet["errorCount"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
