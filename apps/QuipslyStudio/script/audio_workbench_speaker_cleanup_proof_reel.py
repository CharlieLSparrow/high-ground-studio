#!/usr/bin/env python3
"""Render a focused speaker-cleanup proof pack for the mastered audio spine.

The speaker activity board names the moments most likely to reveal over-gating,
remaining phone-call echo, park noise, or dead-air artifacts. This script turns
those focus windows into grouped A/B review snippets:

- mastered spine
- Charlie aligned source
- Charlie gated contribution
- Homer aligned source
- Homer gated contribution
- reference contribution, when available

It renders derived review snippets only. It does not approve audio, fail audio,
render edit branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import shlex
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PRE_ROLL_SECONDS = 2.5
POST_ROLL_SECONDS = 2.5


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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "speaker-cleanup"


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"
    return f"{minutes:02d}:{secs:06.3f}"


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def ffprobe_duration(path: Path) -> float | None:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return None
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return None


def render_snippet(source: Path, output: Path, start: float, duration: float) -> dict[str, Any]:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
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
    proc = run_capture(command)
    duration_seconds = ffprobe_duration(output) if proc.returncode == 0 and output.exists() else None
    return {
        "command": command,
        "ok": proc.returncode == 0 and output.exists() and output.stat().st_size > 0,
        "returnCode": proc.returncode,
        "stderrTail": proc.stderr[-2000:],
        "path": str(output),
        "durationSeconds": duration_seconds,
    }


def window_bounds(row: dict[str, Any], master_duration: float | None) -> tuple[float, float, float]:
    start = float(row.get("start") or row.get("startSec") or 0.0)
    end = float(row.get("end") or row.get("endSec") or start + 2.0)
    clip_start = max(0.0, start - PRE_ROLL_SECONDS)
    clip_end = max(end + POST_ROLL_SECONDS, clip_start + 1.0)
    if master_duration is not None:
        clip_end = min(master_duration, clip_end)
    return clip_start, max(0.5, clip_end - clip_start), start


def render_html(report: dict[str, Any]) -> str:
    cards: list[str] = []
    for window in report["windows"]:
        flag_pills = "".join(f"<span>{escape(flag)}</span>" for flag in window.get("flags") or [])
        questions = "".join(f"<li>{escape(q)}</li>" for q in window.get("listenQuestions") or ["Does the master sound natural here?"])
        snippets = []
        for snippet in window["snippets"]:
            status = "ok" if snippet.get("ok") else "missing"
            snippets.append(
                f"""
                <section class="snippet {status}">
                  <div><b>{escape(snippet['label'])}</b><span>{escape(status)}</span></div>
                  <audio controls preload="metadata" src="{escape(file_uri(snippet.get('path')))}"></audio>
                  <p>{escape(snippet.get('purpose'))}</p>
                </section>
                """
            )
        cards.append(
            f"""
            <article class="card">
              <div class="top"><b>Window {escape(window['index'])}</b><span>{escape(window['timecode'])}</span><span>{escape(window['reason'])}</span></div>
              <div class="flags">{flag_pills}</div>
              <div class="grid">{''.join(snippets)}</div>
              <section class="listen"><h3>Listen questions</h3><ul>{questions}</ul></section>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Speaker Cleanup Proof Pack</title>
  <style>
    :root {{ --bg:#101812; --panel:#223126; --leaf:#8dbd79; --gold:#f1c85b; --clay:#cc7356; --ink:#fff4dc; --muted:#c6bda1; --line:rgba(255,244,220,.15); }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 12% 0%, rgba(141,189,121,.25), transparent 32rem), linear-gradient(145deg,#0d130f,#1a251d 55%,#221911); font:14px/1.45 ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif; }}
    header {{ position:sticky; top:0; z-index:5; padding:1.1rem 1.4rem; background:rgba(16,24,18,.93); backdrop-filter:blur(18px); border-bottom:1px solid var(--line); }}
    h1 {{ margin:0; color:var(--gold); letter-spacing:.1em; text-transform:uppercase; font-size:1.05rem; }}
    header p {{ margin:.3rem 0 0; color:var(--muted); }}
    main {{ display:grid; gap:1rem; max-width:1280px; margin:0 auto; padding:1rem; }}
    .truth,.card {{ background:rgba(34,49,38,.94); border:1px solid var(--line); border-radius:1.1rem; box-shadow:0 24px 80px rgba(0,0,0,.35); }}
    .truth {{ padding:1rem; display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.7rem; }}
    .pill {{ background:rgba(255,244,220,.06); border:1px solid var(--line); border-radius:.85rem; padding:.7rem; }}
    .pill b {{ display:block; color:var(--gold); font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; }}
    .card {{ padding:1rem; }}
    .top {{ display:flex; gap:.5rem; flex-wrap:wrap; align-items:center; }}
    .top b {{ color:var(--gold); }} .top span,.flags span {{ color:var(--muted); background:rgba(255,244,220,.07); border:1px solid var(--line); border-radius:999px; padding:.18rem .55rem; }}
    .flags {{ display:flex; flex-wrap:wrap; gap:.4rem; margin:.6rem 0; }} .flags span {{ color:var(--clay); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(17rem,1fr)); gap:.7rem; }}
    .snippet {{ background:rgba(0,0,0,.18); border:1px solid var(--line); border-radius:.85rem; padding:.7rem; }}
    .snippet div {{ display:flex; justify-content:space-between; gap:.5rem; color:var(--gold); }} .snippet span {{ color:var(--leaf); }}
    .snippet.missing span {{ color:var(--clay); }} audio {{ width:100%; margin:.45rem 0; }} p,li {{ color:var(--muted); }}
    .listen {{ margin-top:.75rem; }} h3 {{ margin:.3rem 0; color:var(--gold); font-size:.78rem; letter-spacing:.08em; text-transform:uppercase; }}
  </style>
</head>
<body>
  <header><h1>Speaker Cleanup Proof Pack</h1><p>Master vs aligned source vs gated contribution for the most important speaker-cleanup review windows. Evidence only, not approval.</p></header>
  <main>
    <section class="truth">
      <div class="pill"><b>Baseline</b>{escape(report['baselineId'])}</div>
      <div class="pill"><b>Approval</b>{escape(report['approvalStatus'])}</div>
      <div class="pill"><b>Windows</b>{escape(report['focusWindowCount'])}</div>
      <div class="pill"><b>Rendered snippets</b>{escape(report['renderSuccessCount'])} / {escape(report['renderAttemptCount'])}</div>
      <div class="pill"><b>Branch inheritance</b>{escape(report['branchInheritanceReady'])}</div>
    </section>
    {''.join(cards)}
  </main>
</body>
</html>
"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Proof Pack: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This pack renders focused A/B snippets for speaker cleanup review. It is derived review media only: no approval, no branch render, no upload, and no source-media mutation.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Focus windows: `{report['focusWindowCount']}`",
        f"- Rendered snippets: `{report['renderSuccessCount']}` / `{report['renderAttemptCount']}`",
        f"- HTML: `{report['html']}`",
        f"- Playlist: `{report['playlist']}`",
        "",
        "## Open",
        "",
        "```bash",
        f"open {shlex.quote(report['html'])}",
        "```",
        "",
        "## Windows",
        "",
        "| # | Time | Reason | Flags | Snippets OK | Listen questions |",
        "|---:|---:|---|---|---:|---|",
    ]
    for window in report["windows"]:
        flags = ", ".join(window.get("flags") or [])
        questions = "<br>".join(window.get("listenQuestions") or ["Does the master sound natural here?"])
        ok_count = sum(1 for snippet in window["snippets"] if snippet.get("ok"))
        lines.append(
            f"| {window['index']} | `{window['timecode']}` | {window['reason']} | {flags} | `{ok_count}/{len(window['snippets'])}` | {questions} |"
        )
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}` for derived review snippets only",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe must be available on PATH")

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    work_dir = baseline_dir / f"speaker-cleanup-proof-pack-{slug}-{generated_at}"
    snippets_dir = work_dir / "snippets"
    snippets_dir.mkdir(parents=True, exist_ok=True)

    board_path = output_path(outputs.get("latestAudioSpeakerActivityReviewBoard"))
    source_activity_path = output_path(outputs.get("sourceActivity"))
    master_path = output_path(outputs.get("masterM4a")) or output_path(outputs.get("masterWav"))
    if not board_path or not board_path.exists():
        raise FileNotFoundError("Missing latestAudioSpeakerActivityReviewBoard")
    if not source_activity_path or not source_activity_path.exists():
        raise FileNotFoundError("Missing sourceActivity")
    if not master_path or not master_path.exists():
        raise FileNotFoundError("Missing mastered audio spine")

    board = read_json(board_path)
    source_activity = read_json(source_activity_path)
    stem_meta = source_activity.get("stemMeta") if isinstance(source_activity.get("stemMeta"), dict) else {}
    roles = [
        ("master", "Mastered spine", master_path, "What the episode edit would inherit."),
        ("charlie-aligned", "Charlie raw aligned", output_path(stem_meta.get("charlieAligned")), "Charlie's aligned source before contribution gating."),
        ("charlie-contribution", "Charlie contribution", output_path(stem_meta.get("charlieContribution")), "Charlie's retained/gated contribution after cleanup."),
        ("homer-aligned", "Homer raw aligned", output_path(stem_meta.get("homerDjiAligned")), "Homer's aligned source before contribution gating."),
        ("homer-contribution", "Homer contribution", output_path(stem_meta.get("homerContribution")), "Homer's retained/gated contribution after cleanup."),
        ("reference-contribution", "Reference contribution", output_path(stem_meta.get("referenceContribution")), "Reference/clip audio contribution after control."),
    ]
    master_duration = ffprobe_duration(master_path)
    windows: list[dict[str, Any]] = []
    render_attempt_count = 0
    render_success_count = 0
    playlist_lines = ["#EXTM3U", f"# Speaker Cleanup Proof Pack: {baseline_id}"]
    focus_rows = board.get("focusRows") if isinstance(board.get("focusRows"), list) else []
    for index, row in enumerate(focus_rows, start=1):
        clip_start, duration, center = window_bounds(row, master_duration)
        window_slug = f"{index:02d}-{safe_slug(row.get('reason') or row.get('timecode') or str(index))}"
        snippets: list[dict[str, Any]] = []
        for role_key, label, source_path, purpose in roles:
            if not source_path or not source_path.exists():
                snippets.append(
                    {
                        "role": role_key,
                        "label": label,
                        "purpose": purpose,
                        "ok": False,
                        "missingSource": str(source_path) if source_path else None,
                    }
                )
                continue
            render_attempt_count += 1
            output = snippets_dir / f"{window_slug}__{role_key}.m4a"
            render = render_snippet(source_path, output, clip_start, duration)
            render_success_count += 1 if render["ok"] else 0
            snippets.append(
                {
                    "role": role_key,
                    "label": label,
                    "purpose": purpose,
                    "source": str(source_path),
                    **render,
                }
            )
            if render["ok"]:
                playlist_lines.append(f"#EXTINF:{float(render.get('durationSeconds') or duration):.3f},{index:02d} {label} - {row.get('reason') or row.get('timecode')}")
                playlist_lines.append(str(output))
        windows.append(
            {
                "index": index,
                "start": float(row.get("start") or 0.0),
                "end": float(row.get("end") or 0.0),
                "clipStart": clip_start,
                "durationSeconds": duration,
                "timecode": row.get("timecode") or timecode(center),
                "reason": row.get("reason") or "Speaker cleanup focus window",
                "flags": row.get("flags") or [],
                "listenQuestions": row.get("listenQuestions") or [],
                "safeActionsIfFails": row.get("safeActionsIfFails") or [],
                "snippets": snippets,
            }
        )

    output_json = work_dir / "speaker-cleanup-proof-pack.json"
    output_md = work_dir / "speaker-cleanup-proof-pack.md"
    output_html = work_dir / "speaker-cleanup-proof-pack.html"
    playlist = work_dir / "speaker-cleanup-proof-pack.m3u"
    report = {
        "schema": "quipsly.audio-workbench.speaker-cleanup-proof-pack.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "boardPath": str(board_path),
        "sourceActivity": str(source_activity_path),
        "masterPath": str(master_path),
        "focusWindowCount": len(windows),
        "renderAttemptCount": render_attempt_count,
        "renderSuccessCount": render_success_count,
        "renderFailureCount": render_attempt_count - render_success_count,
        "windows": windows,
        "json": str(output_json),
        "markdown": str(output_md),
        "html": str(output_html),
        "playlist": str(playlist),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": True,
        "originalMediaMutated": False,
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    output_html.write_text(render_html(report), encoding="utf-8")
    playlist.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestSpeakerCleanupProofPack"] = str(output_json)
    outputs["latestSpeakerCleanupProofPackMarkdown"] = str(output_md)
    outputs["latestSpeakerCleanupProofPackHtml"] = str(output_html)
    outputs["latestSpeakerCleanupProofPackPlaylist"] = str(playlist)
    history = outputs.setdefault("speakerCleanupProofPacks", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["speakerCleanupProofPackCount"] = len(history)
    manifest["speakerCleanupProofPackFocusWindowCount"] = len(windows)
    manifest["speakerCleanupProofPackRenderSuccessCount"] = render_success_count
    manifest["speakerCleanupProofPackRenderFailureCount"] = render_attempt_count - render_success_count
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "focusWindowCount": len(windows),
                "renderAttemptCount": render_attempt_count,
                "renderSuccessCount": render_success_count,
                "renderFailureCount": render_attempt_count - render_success_count,
                "markdown": str(output_md),
                "html": str(output_html),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": True,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )
    if render_attempt_count == 0 or render_success_count != render_attempt_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
