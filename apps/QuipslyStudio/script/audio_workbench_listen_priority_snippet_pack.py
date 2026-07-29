#!/usr/bin/env python3
"""Render short listen-priority audio snippets from the mastered spine.

The listen-priority queue ranks the moments most likely to reveal bad gating,
awkward silence, bleed, or unnatural cleanup. This script turns that queue into
a small review packet of audio clips so humans can listen without manually
scrubbing the full two-hour master.

It does not approve audio, fail audio, render edit branches, upload files, or
mutate source media. It cuts derived review snippets from the mastered M4A/WAV.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "item"


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False)


def ffprobe_duration(path: Path, ffprobe: str) -> float | None:
    result = run_capture(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ]
    )
    if result.returncode != 0:
        return None
    try:
        return float(result.stdout.strip())
    except ValueError:
        return None


def queue_time(item: dict[str, Any]) -> float:
    for key in ["timeSec", "sequenceStartSeconds", "startSeconds", "start"]:
        value = item.get(key)
        if value is not None:
            try:
                return float(value)
            except (TypeError, ValueError):
                pass
    return 0.0


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def clip_window(center: float, source_duration: float | None, pre_seconds: float, post_seconds: float) -> tuple[float, float]:
    start = max(0.0, center - pre_seconds)
    end = center + post_seconds
    if source_duration is not None:
        end = min(source_duration, end)
    duration = max(0.5, end - start)
    return start, duration


def render_snippet(source: Path, output: Path, start: float, duration: float, ffmpeg: str) -> dict[str, Any]:
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-i",
        str(source),
        "-t",
        f"{duration:.3f}",
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        str(output),
    ]
    result = run_capture(command)
    return {
        "command": command,
        "returncode": result.returncode,
        "ok": result.returncode == 0 and output.exists() and output.stat().st_size > 0,
        "stderrTail": result.stderr[-2000:],
    }


def render_html(report: dict[str, Any]) -> str:
    cards: list[str] = []
    for item in report["snippets"]:
        questions = "".join(f"<li>{escape(q)}</li>" for q in item.get("listenQuestions") or [])
        reasons = "".join(f"<li>{escape(r)}</li>" for r in item.get("reasons") or [])
        cards.append(
            f"""
            <article class="card risk-{escape(item.get('riskPriority'))}">
              <div class="top"><span>#{escape(item.get('priority'))}</span><span>{escape(item.get('centerTimecode'))}</span><span>risk {escape(item.get('riskPriority'))}</span></div>
              <h2>{escape(item.get('title'))}</h2>
              <audio controls preload="metadata" src="{escape(file_uri(item.get('snippetPath')))}"></audio>
              <p><b>Clip window:</b> {escape(item.get('windowStartTimecode'))} to {escape(item.get('windowEndTimecode'))} ({escape(round(float(item.get('durationSeconds') or 0), 3))}s)</p>
              <div class="grid"><section><h3>Listen for</h3><ul>{questions}</ul></section><section><h3>Why here</h3><ul>{reasons}</ul></section></div>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Listen-Priority Snippet Pack</title>
  <style>
    :root {{ --bg:#111813; --panel:#223023; --ink:#fff4d8; --muted:#c5b996; --gold:#edc95a; --moss:#76a96f; --clay:#ca704e; --line:rgba(255,244,216,.16); }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 10% 0%, rgba(118,169,111,.22), transparent 30rem), linear-gradient(140deg,#0d130f,#172118 50%,#201912); font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif; }}
    header {{ padding:1.4rem; border-bottom:1px solid var(--line); position:sticky; top:0; background:rgba(17,24,19,.94); backdrop-filter:blur(18px); z-index:5; }}
    h1 {{ margin:0; color:var(--gold); letter-spacing:.08em; text-transform:uppercase; font-size:1.25rem; }}
    .sub {{ color:var(--muted); margin-top:.25rem; }}
    main {{ display:grid; gap:1rem; padding:1rem; max-width:1100px; margin:0 auto; }}
    .truth, .card {{ background:rgba(34,48,35,.95); border:1px solid var(--line); border-radius:1rem; box-shadow:0 22px 70px rgba(0,0,0,.35); }}
    .truth {{ padding:1rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(13rem,1fr)); gap:.75rem; }}
    .pill {{ background:#2d3c2f; border:1px solid var(--line); border-radius:.8rem; padding:.65rem; }}
    .pill b {{ color:var(--gold); display:block; font-size:.72rem; text-transform:uppercase; letter-spacing:.08em; }}
    .card {{ padding:1rem; }}
    .risk-1 {{ border-color:rgba(237,201,90,.78); }} .risk-2 {{ border-color:rgba(202,112,78,.66); }}
    .top {{ display:flex; gap:.5rem; flex-wrap:wrap; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:.75rem; }}
    .top span {{ background:#2d3c2f; border-radius:999px; padding:.18rem .55rem; }}
    h2 {{ margin:.55rem 0; }} h3 {{ margin:.2rem 0; color:var(--gold); font-size:.78rem; text-transform:uppercase; letter-spacing:.08em; }}
    audio {{ width:100%; margin:.5rem 0; }} .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; }} ul {{ margin:0; padding-left:1.1rem; color:var(--muted); }} p {{ color:var(--muted); }} a {{ color:#8ccfd0; }}
    @media (max-width:800px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header><h1>Listen-Priority Snippet Pack</h1><div class="sub">Short clips around the riskiest v006 review moments. Evidence only, not approval.</div></header>
  <main>
    <section class="truth">
      <div class="pill"><b>Baseline</b>{escape(report['baselineId'])}</div>
      <div class="pill"><b>Approval</b>{escape(report['approvalStatus'])}</div>
      <div class="pill"><b>Snippets</b>{escape(report['snippetCount'])} / {escape(report['queueCount'])}</div>
      <div class="pill"><b>Branch inheritance</b>{escape(report['branchInheritanceReady'])}</div>
    </section>
    {''.join(cards)}
  </main>
</body>
</html>
"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Listen-Priority Snippet Pack: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet contains short audio clips cut from the mastered listening copy around the listen-priority queue. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Queue items: `{report['queueCount']}`",
        f"- Snippets rendered: `{report['snippetCount']}`",
        f"- Render failures: `{report['renderFailureCount']}`",
        f"- HTML: `{report['html']}`",
        f"- Playlist: `{report['playlist']}`",
        "",
        "## Snippets",
        "",
        "| # | Time | Risk | Title | Clip |",
        "|---:|---:|---:|---|---|",
    ]
    for item in report["snippets"]:
        lines.append(
            f"| {item['priority']} | `{item['centerTimecode']}` | `{item.get('riskPriority')}` | {item['title']} | `{item['snippetPath']}` |"
        )
    if report["failures"]:
        lines.extend(["", "## Render failures", ""])
        for failure in report["failures"]:
            lines.append(f"- #{failure.get('priority')}: {failure.get('title')} -> {failure.get('stderrTail')}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--pre-seconds", type=float, default=12.0)
    parser.add_argument("--post-seconds", type=float, default=24.0)
    parser.add_argument("--limit", type=int, default=40)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "unknown-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")

    queue_path = output_path(outputs.get("latestAudioListenPriorityQueue"))
    if not queue_path or not Path(queue_path).exists():
        raise SystemExit("latestAudioListenPriorityQueue is not registered or missing")
    queue_packet = read_json(Path(queue_path))
    queue = list(queue_packet.get("queue") or [])[: max(1, args.limit)]
    source_path_text = output_path(outputs.get("masterM4a")) or output_path(outputs.get("masterWav"))
    if not source_path_text or not Path(source_path_text).exists():
        raise SystemExit("No masterM4a or masterWav registered for snippet rendering")
    source_path = Path(source_path_text)
    source_duration = ffprobe_duration(source_path, ffprobe)

    output_dir = baseline_dir / f"audio-listen-priority-snippet-pack-{slug}-{generated_at}"
    clips_dir = output_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    snippets: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []
    playlist_lines = ["#EXTM3U", f"# Quipsly listen-priority snippet pack for {baseline_id}"]
    for index, item in enumerate(queue, start=1):
        center = queue_time(item)
        start, duration = clip_window(center, source_duration, args.pre_seconds, args.post_seconds)
        title = str(item.get("title") or f"listen-priority-{index}")
        filename = f"{index:02d}-{safe_slug(title)[:70]}-{safe_slug(item.get('time') or timecode(center))}.m4a"
        snippet_path = clips_dir / filename
        render = render_snippet(source_path, snippet_path, start, duration, ffmpeg)
        snippet_duration = ffprobe_duration(snippet_path, ffprobe) if render["ok"] else None
        row = {
            "priority": item.get("priority", index),
            "riskPriority": item.get("riskPriority"),
            "title": title,
            "centerSeconds": center,
            "centerTimecode": timecode(center),
            "windowStartSeconds": start,
            "windowStartTimecode": timecode(start),
            "durationSeconds": snippet_duration if snippet_duration is not None else duration,
            "windowEndSeconds": start + (snippet_duration if snippet_duration is not None else duration),
            "windowEndTimecode": timecode(start + (snippet_duration if snippet_duration is not None else duration)),
            "snippetPath": str(snippet_path),
            "renderOk": render["ok"],
            "classifications": item.get("classifications") or [],
            "sources": item.get("sources") or [],
            "listenQuestions": item.get("listenQuestions") or [],
            "reasons": item.get("reasons") or [],
            "safeActionsIfFails": item.get("safeActionsIfFails") or [],
        }
        if render["ok"]:
            snippets.append(row)
            playlist_lines.extend([
                f"#EXTINF:{row['durationSeconds']:.3f},#{row['priority']} {title} @ {row['centerTimecode']}",
                str(snippet_path),
            ])
        else:
            failure = dict(row)
            failure["stderrTail"] = render.get("stderrTail")
            failures.append(failure)

    playlist_path = output_dir / "listen-priority-snippets.m3u"
    html_path = output_dir / "listen-priority-snippets.html"
    json_path = output_dir / "listen-priority-snippet-pack.json"
    md_path = baseline_dir / f"audio-listen-priority-snippet-pack-{slug}-{generated_at}.md"
    report_json_path = baseline_dir / f"audio-listen-priority-snippet-pack-{slug}-{generated_at}.json"
    open_command_path = output_dir / "open-listen-priority-snippets.command"

    report = {
        "schema": "quipsly.audio-workbench.listen-priority-snippet-pack.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "sourceAudio": str(source_path),
        "sourceDurationSeconds": source_duration,
        "queuePath": queue_path,
        "queueCount": len(queue),
        "snippetCount": len(snippets),
        "renderFailureCount": len(failures),
        "preSeconds": args.pre_seconds,
        "postSeconds": args.post_seconds,
        "outputDir": str(output_dir),
        "clipsDir": str(clips_dir),
        "html": str(html_path),
        "playlist": str(playlist_path),
        "json": str(report_json_path),
        "packetJson": str(json_path),
        "markdown": str(md_path),
        "openCommand": str(open_command_path),
        "snippets": snippets,
        "failures": failures,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": True,
        "originalMediaMutated": False,
    }

    playlist_path.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    write_json(json_path, report)
    write_json(report_json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    open_command_path.write_text(
        "#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(html_path)) + "\nopen " + shell_quote(str(md_path)) + "\n",
        encoding="utf-8",
    )
    os.chmod(open_command_path, 0o755)

    outputs["latestAudioListenPrioritySnippetPack"] = str(report_json_path)
    outputs["latestAudioListenPrioritySnippetPackMarkdown"] = str(md_path)
    outputs["latestAudioListenPrioritySnippetPackHtml"] = str(html_path)
    outputs["latestAudioListenPrioritySnippetPackPlaylist"] = str(playlist_path)
    outputs["latestAudioListenPrioritySnippetPackOpenCommand"] = str(open_command_path)
    history = outputs.setdefault("audioListenPrioritySnippetPacks", [])
    if str(report_json_path) not in history:
        history.append(str(report_json_path))
    manifest["audioListenPrioritySnippetPackCount"] = len(history)
    manifest["audioListenPrioritySnippetPackLatestSnippetCount"] = len(snippets)
    manifest["audioListenPrioritySnippetPackLatestFailureCount"] = len(failures)
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(report_json_path),
                "html": str(html_path),
                "playlist": str(playlist_path),
                "snippetCount": len(snippets),
                "renderFailureCount": len(failures),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": True,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
