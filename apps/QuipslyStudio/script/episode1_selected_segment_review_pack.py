#!/usr/bin/env python3
"""Build a focused review pack for the currently recommended Episode 1 segment.

The pack creates derived review clips and a small HTML console for the segment
recommended by episode1_selected_review_next.py. It does not mark review
complete or approve artifacts.
"""

from __future__ import annotations

import html
import json
import os
import subprocess
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


def slug(value: str) -> str:
    keep = []
    for char in value.lower():
        if char.isalnum():
            keep.append(char)
        elif keep and keep[-1] != "-":
            keep.append("-")
    return "".join(keep).strip("-") or "item"


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


def run_ffmpeg(args: list[str]) -> tuple[bool, str]:
    try:
        proc = subprocess.run(args, check=False, capture_output=True, text=True)
    except FileNotFoundError as error:
        return False, str(error)
    if proc.returncode != 0:
        return False, (proc.stderr or proc.stdout or "").strip()
    return True, (proc.stderr or proc.stdout or "").strip()


def make_contact_sheet(review_path: Path, output_path: Path, duration: float) -> dict[str, Any]:
    result: dict[str, Any] = {
        "path": str(output_path),
        "status": "pending",
        "warning": None,
        "checkpointCount": 9,
    }
    if output_path.exists() and output_path.stat().st_size > 0:
        result["status"] = "exists"
        return result
    if duration <= 0:
        result["status"] = "invalid-duration"
        result["warning"] = "Cannot build contact sheet for invalid duration."
        return result
    fps = max(0.001, 9.0 / duration)
    ok, message = run_ffmpeg(
        [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-i",
            str(review_path),
            "-vf",
            f"fps={fps:.6f},scale=320:-1,tile=3x3",
            "-frames:v",
            "1",
            str(output_path),
        ]
    )
    result["status"] = "ready" if ok else "failed"
    if not ok:
        result["warning"] = message[-1200:]
    return result


def audio_volume_probe(review_path: Path) -> dict[str, Any]:
    ok, message = run_ffmpeg(
        [
            "ffmpeg",
            "-hide_banner",
            "-i",
            str(review_path),
            "-af",
            "volumedetect",
            "-f",
            "null",
            "-",
        ]
    )
    result: dict[str, Any] = {"status": "ready" if ok else "failed", "meanVolumeDb": None, "maxVolumeDb": None, "warning": None}
    if not ok:
        result["warning"] = message[-1200:]
        return result
    for line in message.splitlines():
        if "mean_volume:" in line:
            result["meanVolumeDb"] = line.split("mean_volume:", 1)[1].strip().split(" ")[0]
        if "max_volume:" in line:
            result["maxVolumeDb"] = line.split("max_volume:", 1)[1].strip().split(" ")[0]
    if result["meanVolumeDb"] is None and result["maxVolumeDb"] is None:
        result["status"] = "no-volume-data"
        result["warning"] = "ffmpeg completed but did not return volumedetect values."
    return result


def artifact_by_id(progress: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {str(item.get("artifactId")): item for item in progress.get("artifacts") or []}


def review_items_for_segment(progress: dict[str, Any], segment_id: str) -> list[dict[str, Any]]:
    return [item for item in progress.get("reviewItems") or [] if str(item.get("segmentId")) == segment_id]


def mark_segment_reviewed_command(segment_id: str, label: str) -> str:
    return (
        f'script/agentctl.sh episode1-selected-watch-review-mark all:{segment_id} reviewed "Reviewer Name" '
        f'"Actually watched/listened to {label} across selected artifacts; quality flags reviewed."'
    )


def mark_item_issue_command(item_id: str, label: str) -> str:
    return (
        f'script/agentctl.sh episode1-selected-watch-review-mark {item_id} issue "Reviewer Name" '
        f'"Review issue during {label}: add exact timestamp, artifact, and decision."'
    )


def build_review_clip(artifact: dict[str, Any], item: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    source = artifact.get("path")
    artifact_id = str(artifact.get("artifactId"))
    kind = str(artifact.get("kind") or "video")
    start = float(item.get("startSeconds") or 0)
    end = float(item.get("endSeconds") or start)
    duration = max(0.0, end - start)
    extension = ".m4a" if kind == "audio" else ".mp4"
    output = output_dir / f"{slug(artifact_id)}-{slug(str(item.get('segmentId')))}-review{extension}"
    result: dict[str, Any] = {
        "artifactId": artifact_id,
        "kind": kind,
        "sourcePath": source,
        "reviewPath": str(output),
        "contactSheetPath": None,
        "contactSheet": None,
        "audioProbe": None,
        "startSeconds": start,
        "endSeconds": end,
        "durationSeconds": round(duration, 3),
        "status": "pending",
        "warning": None,
    }
    if not source or not os.path.exists(source):
        result["status"] = "missing-source"
        result["warning"] = "Source artifact does not exist on this machine."
        return result
    if duration <= 0:
        result["status"] = "invalid-range"
        result["warning"] = "Review segment has an invalid duration."
        return result
    if output.exists() and output.stat().st_size > 0:
        result["status"] = "exists"
        if kind == "audio":
            result["audioProbe"] = audio_volume_probe(output)
        else:
            contact_sheet = output_dir / f"{slug(artifact_id)}-{slug(str(item.get('segmentId')))}-contact-sheet.jpg"
            result["contactSheetPath"] = str(contact_sheet)
            result["contactSheet"] = make_contact_sheet(output, contact_sheet, duration)
        return result

    if kind == "audio":
        args = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source,
            "-vn",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            str(output),
        ]
    else:
        args = [
            "ffmpeg",
            "-hide_banner",
            "-y",
            "-ss",
            f"{start:.3f}",
            "-t",
            f"{duration:.3f}",
            "-i",
            source,
            "-vf",
            "scale='min(1280,iw)':-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "24",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            str(output),
        ]
    ok, message = run_ffmpeg(args)
    result["status"] = "ready" if ok else "failed"
    if not ok:
        result["warning"] = message[-1200:]
    elif kind == "audio":
        result["audioProbe"] = audio_volume_probe(output)
    else:
        contact_sheet = output_dir / f"{slug(artifact_id)}-{slug(str(item.get('segmentId')))}-contact-sheet.jpg"
        result["contactSheetPath"] = str(contact_sheet)
        result["contactSheet"] = make_contact_sheet(output, contact_sheet, duration)
    return result


def label_for_segment(progress: dict[str, Any], segment_id: str) -> str:
    for segment in progress.get("segments") or []:
        if str(segment.get("segmentId")) == segment_id:
            return str(segment.get("label") or segment_id)
    for item in progress.get("reviewItems") or []:
        if str(item.get("segmentId")) == segment_id:
            return str(item.get("label") or segment_id)
    return segment_id


def build_packet(next_path: str, progress_path: str, output_dir: str, output_json: str, output_html: str, output_md: str, explicit_segment_id: str | None = None) -> dict[str, Any]:
    next_packet = load_json(next_path)
    progress = load_json(progress_path)
    next_step = next_packet.get("nextStep") or {}
    segment_id = str(explicit_segment_id or next_step.get("recommendedSegmentId") or "")
    if not segment_id:
        raise SystemExit("No recommended segment in selected review next packet.")
    output_root = Path(output_dir)
    output_root.mkdir(parents=True, exist_ok=True)
    artifacts = artifact_by_id(progress)
    items = review_items_for_segment(progress, segment_id)
    clips = [build_review_clip(artifacts.get(str(item.get("artifactId")), {}), item, output_root) for item in items]
    ready = [clip for clip in clips if clip.get("status") in {"ready", "exists"}]
    warnings = [
        clip
        for clip in clips
        if clip.get("warning")
        or (clip.get("contactSheet") or {}).get("warning")
        or (clip.get("audioProbe") or {}).get("warning")
    ]
    segment_label = next_step.get("recommendedSegmentLabel") if segment_id == str(next_step.get("recommendedSegmentId") or "") else label_for_segment(progress, segment_id)
    is_current_recommendation = segment_id == str(next_step.get("recommendedSegmentId") or "")
    return {
        "packetType": "quipsly-episode1-selected-segment-review-pack",
        "version": "2026-06-20.selected-segment-review-pack.v1",
        "projectSlug": progress.get("projectSlug"),
        "episodeSlug": progress.get("episodeSlug"),
        "generatedAt": now_iso(),
        "sourceNextPath": next_path,
        "sourceProgressPath": progress_path,
        "outputDir": output_dir,
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "stableJson": str(output_root / f"{slug(segment_id)}-review-pack.json"),
        "stableHtml": str(output_root / f"{slug(segment_id)}-review-pack.html"),
        "stableMarkdown": str(output_root / f"{slug(segment_id)}-review-pack.md"),
        "segmentId": segment_id,
        "segmentLabel": segment_label,
        "isCurrentRecommendation": is_current_recommendation,
        "startSeconds": items[0].get("startSeconds") if items else None,
        "endSeconds": max([float(item.get("endSeconds") or 0) for item in items] or [0.0]),
        "clipCount": len(clips),
        "readyClipCount": len(ready),
        "warningCount": len(warnings),
        "contactSheetCount": len([clip for clip in clips if clip.get("contactSheetPath")]),
        "audioProbeCount": len([clip for clip in clips if clip.get("audioProbe")]),
        "clips": clips,
        "safeCommands": {
            "openPack": "script/agentctl.sh episode1-selected-segment-review-pack --html",
            "openNext": "script/agentctl.sh episode1-selected-review-next --html",
            "openConsole": "script/agentctl.sh episode1-selected-review-console --html",
            "markSegmentReviewedAfterRealReview": (
                next_packet.get("safeCommands", {}).get("markRecommendedSegmentReviewedAfterRealReview")
                if is_current_recommendation
                else mark_segment_reviewed_command(segment_id, str(segment_label))
            ),
            "markIssueAfterRealReview": (
                next_packet.get("safeCommands", {}).get("markRecommendedFlaggedItemsIssueAfterRealReview")
                if is_current_recommendation
                else [mark_item_issue_command(str(item.get("itemId")), str(segment_label)) for item in items]
            ),
        },
        "blockedClaims": [
            "Derived review clips are not source edits and do not replace the selected artifact set.",
            "Do not mark the segment reviewed until the review clips or original artifacts have actually been watched/listened to.",
            "Do not record final pass until all selected review ledger items are complete and unresolved issues are cleared.",
        ],
        "truth": "This pack creates derived media for focused review of the recommended selected Episode 1 segment. It does not review, approve, publish, upload, schedule, or capture receipts.",
    }


def html_page(packet: dict[str, Any]) -> str:
    clip_cards = []
    for clip in packet.get("clips") or []:
        if clip.get("kind") == "audio":
            media = f'<audio controls preload="metadata" src="{file_url(clip.get("reviewPath"))}"></audio>'
        else:
            media = f'<video controls preload="metadata" src="{file_url(clip.get("reviewPath"))}"></video>'
        contact = ""
        if clip.get("contactSheetPath"):
            contact = f'<a href="{file_url(clip.get("contactSheetPath"))}"><img class="contact" src="{file_url(clip.get("contactSheetPath"))}" alt="Contact sheet for {esc(clip.get("artifactId"))}"></a>'
        audio_probe = ""
        if clip.get("audioProbe"):
            probe = clip.get("audioProbe") or {}
            audio_probe = f'<p class="probe">Audio mean {esc(probe.get("meanVolumeDb"))} dB · max {esc(probe.get("maxVolumeDb"))} dB · {esc(probe.get("status"))}</p>'
        warning = f'<p class="warning">{esc(clip.get("warning"))}</p>' if clip.get("warning") else ""
        if (clip.get("contactSheet") or {}).get("warning"):
            warning += f'<p class="warning">{esc((clip.get("contactSheet") or {}).get("warning"))}</p>'
        if (clip.get("audioProbe") or {}).get("warning"):
            warning += f'<p class="warning">{esc((clip.get("audioProbe") or {}).get("warning"))}</p>'
        clip_cards.append(
            f"""
            <article class="clip {esc(clip.get('status'))}">
              <div class="clip-head">
                <div>
                  <span class="kicker">{esc(clip.get('kind'))} · {esc(clip.get('status'))}</span>
                  <h2>{esc(clip.get('artifactId'))}</h2>
                  <p>{fmt_time(clip.get('startSeconds'))} - {fmt_time(clip.get('endSeconds'))} · {esc(clip.get('durationSeconds'))}s</p>
                </div>
              </div>
              {media}
              {contact}
              {audio_probe}
              {warning}
              <p><a href="{file_url(clip.get('reviewPath'))}">Open derived review clip</a></p>
            </article>
            """
        )
    commands = packet.get("safeCommands") or {}
    issue_buttons = []
    for command in commands.get("markIssueAfterRealReview") or []:
        issue_buttons.append(f'<button data-copy="{esc(command)}">Copy issue command</button>')
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episode 1 Focused Segment Review Pack</title>
  <style>
    :root {{ --bg:#f1eadb; --paper:#fff9ed; --ink:#34281f; --muted:#76695d; --line:rgba(63,45,31,.16); --fern:#2f7656; --gold:#d9ad33; --clay:#a34d38; --river:#2e6f84; --shadow:0 24px 76px rgba(47,34,23,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(217,173,51,.24),transparent 34rem),radial-gradient(circle at 90% 8%,rgba(47,118,86,.18),transparent 34rem),linear-gradient(135deg,#fbf6ea,var(--bg)); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ width:min(1280px,calc(100% - 40px)); margin:0 auto; padding:48px 0 80px; }}
    .hero,.clip,.panel {{ background:rgba(255,249,237,.92); border:1px solid var(--line); border-radius:30px; box-shadow:var(--shadow); }}
    .hero,.panel {{ padding:28px; }}
    .kicker {{ color:#a97524; font-size:.76rem; font-weight:950; letter-spacing:.2em; text-transform:uppercase; }}
    h1 {{ margin:10px 0 12px; max-width:960px; font-size:clamp(2.2rem,5.8vw,5rem); line-height:.9; letter-spacing:-.06em; }}
    h2 {{ margin:6px 0; letter-spacing:-.035em; }}
    p,li {{ color:var(--muted); line-height:1.45; }}
    .stats,.buttons {{ display:flex; flex-wrap:wrap; gap:10px; }}
    .pill {{ border-radius:999px; padding:8px 11px; background:var(--river); color:white; font-size:.72rem; font-weight:950; letter-spacing:.08em; text-transform:uppercase; }}
    .pill.gold {{ background:var(--gold); color:#302416; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; margin-top:18px; }}
    .clip {{ padding:16px; overflow:hidden; }}
    video,audio {{ width:100%; border-radius:20px; background:#151515; }}
    video {{ max-height:70vh; }}
    .contact {{ width:100%; margin-top:10px; border-radius:18px; border:1px solid var(--line); }}
    .probe {{ background:rgba(47,118,86,.10); color:#254536; border-radius:14px; padding:10px; font-weight:800; }}
    .warning {{ color:var(--clay); font-weight:800; }}
    button {{ appearance:none; border:0; border-radius:999px; background:#3b2d21; color:#fff6e8; font-weight:950; padding:10px 14px; cursor:pointer; }}
    button.secondary {{ background:var(--river); }}
    button.copied {{ background:var(--fern); }}
    a {{ color:#235f75; font-weight:850; }}
    .panel {{ margin-top:18px; }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <span class="kicker">Quipsly focused review tray</span>
      <h1>{esc(packet.get('segmentId'))}: {esc(packet.get('segmentLabel'))}</h1>
      <p>This page contains derived review clips for the exact selected segment currently recommended by the review planner.</p>
      <div class="stats">
        <span class="pill gold">{esc(packet.get('clipCount'))} clips</span>
        <span class="pill">{esc(packet.get('readyClipCount'))} ready</span>
        <span class="pill">{esc(packet.get('contactSheetCount'))} contact sheets</span>
        <span class="pill">{esc(packet.get('audioProbeCount'))} audio probes</span>
        <span class="pill">{esc(packet.get('warningCount'))} warnings</span>
        <span class="pill">{fmt_time(packet.get('startSeconds'))} start</span>
      </div>
    </section>
    <section class="grid">{''.join(clip_cards)}</section>
    <section class="panel">
      <h2>After actual review</h2>
      <p>Use these only after a human or agent actually watches/listens to the segment. This page is not approval.</p>
      <div class="buttons">
        <button data-copy="{esc(commands.get('markSegmentReviewedAfterRealReview'))}">Copy mark-reviewed command</button>
        {''.join(issue_buttons)}
        <button class="secondary" data-copy="{esc(commands.get('openConsole'))}">Copy open console</button>
      </div>
      <p>{esc(packet.get('truth'))}</p>
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
        "# Episode 1 focused segment review pack",
        "",
        f"Generated: {packet['generatedAt']}",
        f"Segment: `{packet['segmentId']}` {packet.get('segmentLabel')}",
        "",
        f"- Clips: `{packet['clipCount']}`",
        f"- Ready clips: `{packet['readyClipCount']}`",
        f"- Warnings: `{packet['warningCount']}`",
        f"- Contact sheets: `{packet.get('contactSheetCount')}`",
        f"- Audio probes: `{packet.get('audioProbeCount')}`",
        "",
        "## Clips",
        "",
    ]
    for clip in packet.get("clips") or []:
        lines.append(f"- `{clip.get('status')}` `{clip.get('artifactId')}` {clip.get('reviewPath')}")
        if clip.get("contactSheetPath"):
            lines.append(f"  - Contact sheet: {clip.get('contactSheetPath')}")
        if clip.get("audioProbe"):
            lines.append(f"  - Audio probe: {clip.get('audioProbe')}")
    lines.extend(["", "## Boundary", "", packet["truth"], ""])
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) not in {7, 8}:
        print("usage: episode1_selected_segment_review_pack.py next.json progress.json output-dir output.json output.html output.md [segment-id]", file=sys.stderr)
        return 2
    next_path, progress_path, output_dir, output_json, output_html, output_md = sys.argv[1:7]
    explicit_segment_id = sys.argv[7] if len(sys.argv) == 8 else None
    packet = build_packet(next_path, progress_path, output_dir, output_json, output_html, output_md, explicit_segment_id)
    write_json(output_json, packet)
    write_json(packet["stableJson"], packet)
    rendered_html = html_page(packet)
    rendered_md = markdown(packet)
    with open(output_html, "w", encoding="utf-8") as handle:
        handle.write(rendered_html)
    with open(packet["stableHtml"], "w", encoding="utf-8") as handle:
        handle.write(rendered_html)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(rendered_md)
    with open(packet["stableMarkdown"], "w", encoding="utf-8") as handle:
        handle.write(rendered_md)
    print(json.dumps({
        "packetType": "quipsly-episode1-selected-segment-review-pack-result",
        "json": output_json,
        "html": output_html,
        "markdown": output_md,
        "stableJson": packet["stableJson"],
        "stableHtml": packet["stableHtml"],
        "stableMarkdown": packet["stableMarkdown"],
        "outputDir": output_dir,
        "segmentId": packet["segmentId"],
        "readyClipCount": packet["readyClipCount"],
        "warningCount": packet["warningCount"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
