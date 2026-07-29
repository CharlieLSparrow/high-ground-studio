#!/usr/bin/env python3
"""Render a focused smoothness proof pack from the current audio master.

The broadcast polish scorecard can identify dense smoothness/listen-check markers,
but a reviewer still needs fast proof by ear. This script turns the smoothness
audit's top transitions and long low-level spans into short derived audio clips
plus an HTML review board with local notes export.

It does not approve audio, fail audio, render edit branches, upload files, or
mutate original media. It renders derived review snippets from the mastered
listening copy only.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ProofMoment:
    id: str
    kind: str
    title: str
    center_seconds: float
    start_seconds: float
    duration_seconds: float
    evidence: dict[str, Any]
    listen_questions: list[str]
    suggested_next_action: str


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    input_path = input_path.expanduser()
    if (input_path / "manifest.json").exists():
        return input_path.resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
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


def safe_slug(value: Any) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "item"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path_text: str | None) -> str:
    if not path_text:
        return ""
    return Path(path_text).expanduser().resolve().as_uri()


def escape(value: Any) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if math.isnan(number) or math.isinf(number):
        return default
    return number


def timecode(seconds: float) -> str:
    seconds = max(0.0, seconds)
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    return f"{hours:02d}:{minutes:02d}:{secs:06.3f}"


def run_capture(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, capture_output=True, check=False, timeout=timeout)


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


def clip_window(center: float, source_duration: float | None, pre_seconds: float, post_seconds: float) -> tuple[float, float]:
    start = max(0.0, center - pre_seconds)
    end = center + post_seconds
    if source_duration is not None:
        end = min(source_duration, end)
    return start, max(0.5, end - start)


def bounded_window(start: float, end: float, source_duration: float | None, pad: float, max_duration: float) -> tuple[float, float, float]:
    window_start = max(0.0, start - pad)
    window_end = end + pad
    if source_duration is not None:
        window_end = min(source_duration, window_end)
    if window_end - window_start > max_duration:
        center = (start + end) / 2.0
        window_start = max(0.0, center - max_duration / 2.0)
        window_end = window_start + max_duration
        if source_duration is not None and window_end > source_duration:
            window_end = source_duration
            window_start = max(0.0, window_end - max_duration)
    duration = max(0.5, window_end - window_start)
    return window_start, duration, window_start + duration


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
    try:
        result = run_capture(command)
    except subprocess.TimeoutExpired as exc:
        return {"ok": False, "command": command, "returncode": None, "stderrTail": f"ffmpeg timed out: {exc}"}
    return {
        "ok": result.returncode == 0 and output.exists() and output.stat().st_size > 0,
        "command": command,
        "returncode": result.returncode,
        "stderrTail": result.stderr[-2000:],
    }


def transition_questions(item: dict[str, Any]) -> list[str]:
    classification = str(item.get("classification") or "transition")
    questions = [
        "Does the transition feel like a natural conversational start/stop instead of a gate snapping open or shut?",
        "Do Charlie and Homer both still sound present if this is an overlap or reaction moment?",
    ]
    if "hard-silence" in classification:
        questions.append("Is the room tone or breath transition believable, or does it feel like a hard mute?")
    if "large-level" in classification:
        questions.append("Does the level jump feel like normal emphasis, or does it need a crossfade/automation repair?")
    return questions


def select_moments(
    smoothness: dict[str, Any],
    source_duration: float | None,
    transition_limit: int,
    silence_limit: int,
    pre_seconds: float,
    post_seconds: float,
    silence_pad: float,
    max_silence_clip_seconds: float,
) -> list[ProofMoment]:
    moments: list[ProofMoment] = []
    seen_centers: set[int] = set()

    transitions = list(smoothness.get("largestTransitions") or [])
    transitions.sort(key=lambda item: float_value(item.get("absDeltaDb")), reverse=True)
    for index, item in enumerate(transitions[: max(0, transition_limit)], start=1):
        center = float_value(item.get("timeSec"))
        bucket = int(round(center * 2))
        if bucket in seen_centers:
            continue
        seen_centers.add(bucket)
        start, duration = clip_window(center, source_duration, pre_seconds, post_seconds)
        classification = str(item.get("classification") or "transition")
        delta = float_value(item.get("absDeltaDb"))
        moments.append(
            ProofMoment(
                id=f"transition-{index:02d}-{safe_slug(item.get('time') or timecode(center))}",
                kind="transition",
                title=f"{classification} at {item.get('time') or timecode(center)} ({delta:.1f} dB)",
                center_seconds=center,
                start_seconds=start,
                duration_seconds=duration,
                evidence=item,
                listen_questions=transition_questions(item),
                suggested_next_action="If this sounds abrupt, route a scoped v007 smoothing/crossfade proof around this timestamp. If it sounds natural, record pass context only.",
            )
        )

    silences = list(smoothness.get("longSilenceSpans") or [])
    silences.sort(key=lambda item: float_value(item.get("durationSec")), reverse=True)
    for index, item in enumerate(silences[: max(0, silence_limit)], start=1):
        start_sec = float_value(item.get("startSec"))
        end_sec = float_value(item.get("endSec"), start_sec + float_value(item.get("durationSec")))
        center = (start_sec + end_sec) / 2.0
        bucket = int(round(center * 2))
        if bucket in seen_centers:
            continue
        seen_centers.add(bucket)
        window_start, duration, _ = bounded_window(
            start_sec,
            end_sec,
            source_duration,
            silence_pad,
            max_silence_clip_seconds,
        )
        moments.append(
            ProofMoment(
                id=f"silence-{index:02d}-{safe_slug(item.get('start') or timecode(start_sec))}",
                kind="long-low-level-span",
                title=f"Long low-level span {item.get('start') or timecode(start_sec)} to {item.get('end') or timecode(end_sec)}",
                center_seconds=center,
                start_seconds=window_start,
                duration_seconds=duration,
                evidence=item,
                listen_questions=[
                    "Does this low-level span feel like an intentional pause, watching/listening moment, or a dead-air problem?",
                    "Does the transition into and out of the span preserve room tone and human cadence?",
                    "Would a shorter pause or ambience bed make this feel more professional without over-cleaning it?",
                ],
                suggested_next_action="If this feels like dead air, route a scoped v007 pause-shaping proof. If it feels intentional, preserve it and record pass context.",
            )
        )

    moments.sort(key=lambda moment: moment.center_seconds)
    return moments


def render_html(report: dict[str, Any]) -> str:
    cards: list[str] = []
    for item in report["moments"]:
        questions = "".join(f"<li>{escape(q)}</li>" for q in item.get("listenQuestions") or [])
        evidence = item.get("evidence") if isinstance(item.get("evidence"), dict) else {}
        evidence_bits = "".join(
            f"<li><b>{escape(key)}</b>: {escape(value)}</li>"
            for key, value in evidence.items()
            if key in {"classification", "absDeltaDb", "fromDbfs", "toDbfs", "durationSec", "start", "end", "time"}
        )
        cards.append(
            f"""
            <article class="card kind-{escape(item.get('kind'))}" data-moment-id="{escape(item.get('id'))}">
              <div class="top"><span>{escape(item.get('kind'))}</span><span>{escape(item.get('centerTimecode'))}</span><span>{escape(item.get('windowDurationSeconds'))}s</span></div>
              <h2>{escape(item.get('title'))}</h2>
              <audio controls preload="metadata" src="{escape(file_uri(item.get('snippetPath')))}"></audio>
              <p><b>Window:</b> {escape(item.get('windowStartTimecode'))} to {escape(item.get('windowEndTimecode'))}</p>
              <div class="grid"><section><h3>Listen for</h3><ul>{questions}</ul></section><section><h3>Evidence</h3><ul>{evidence_bits}</ul></section></div>
              <label>Decision
                <select data-field="decision">
                  <option value="unreviewed">Unreviewed</option>
                  <option value="pass-context">Pass, keep as context</option>
                  <option value="needs-focused-proof">Needs focused proof</option>
                  <option value="needs-scoped-repair">Needs scoped v007 repair</option>
                </select>
              </label>
              <label>Notes<textarea data-field="notes" placeholder="What did you hear? Gate snap, dead air, natural pause, good reaction, etc."></textarea></label>
              <p class="next"><b>Safe next action:</b> {escape(item.get('suggestedNextAction'))}</p>
            </article>
            """
        )
    notes_template = escape(json.dumps(report.get("notesTemplate") or {}, indent=2))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Quipsly Smoothness Proof Pack</title>
  <style>
    :root {{ --bg:#111812; --panel:#223025; --leaf:#75a878; --gold:#edc95a; --ink:#fff5d6; --muted:#cbbb99; --clay:#ca704e; --cyan:#8ccfd0; --line:rgba(255,245,214,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 5% 0%, rgba(117,168,120,.2), transparent 26rem), radial-gradient(circle at 90% 15%, rgba(237,201,90,.14), transparent 24rem), linear-gradient(145deg,#0d130f,#172219 58%,#211811); font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif; }}
    header {{ position:sticky; top:0; z-index:5; padding:1.15rem 1.4rem; border-bottom:1px solid var(--line); background:rgba(17,24,18,.93); backdrop-filter:blur(18px); }}
    h1 {{ margin:0; color:var(--gold); letter-spacing:.08em; text-transform:uppercase; font-size:1.25rem; }}
    .sub {{ color:var(--muted); margin-top:.25rem; }}
    main {{ max-width:1180px; margin:0 auto; padding:1rem; display:grid; gap:1rem; }}
    .truth,.card,.notes {{ background:rgba(34,48,37,.95); border:1px solid var(--line); border-radius:1rem; box-shadow:0 22px 70px rgba(0,0,0,.34); }}
    .truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(12rem,1fr)); gap:.75rem; padding:1rem; }}
    .pill {{ background:rgba(255,255,255,.055); border:1px solid var(--line); border-radius:.8rem; padding:.65rem; }}
    .pill b,.top span,h3 {{ color:var(--gold); text-transform:uppercase; letter-spacing:.08em; font-size:.72rem; }}
    .pill b {{ display:block; }}
    .card {{ padding:1rem; }}
    .kind-transition {{ border-color:rgba(237,201,90,.55); }} .kind-long-low-level-span {{ border-color:rgba(202,112,78,.55); }}
    .top {{ display:flex; flex-wrap:wrap; gap:.5rem; }} .top span {{ background:#2d3b30; border-radius:999px; padding:.18rem .55rem; }}
    h2 {{ margin:.55rem 0; }} audio {{ width:100%; margin:.4rem 0 .6rem; }} p,li {{ color:var(--muted); }}
    .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:1rem; }} ul {{ margin:0; padding-left:1.1rem; }}
    label {{ display:block; margin-top:.7rem; color:var(--muted); font-weight:700; }} select,textarea {{ width:100%; margin-top:.25rem; border-radius:.65rem; border:1px solid var(--line); background:#101711; color:var(--ink); padding:.55rem; }} textarea {{ min-height:4.5rem; resize:vertical; }}
    .notes {{ padding:1rem; }} button {{ border:0; border-radius:999px; padding:.65rem 1rem; background:var(--gold); color:#251c0d; font-weight:800; cursor:pointer; }} pre {{ white-space:pre-wrap; word-break:break-word; background:#101711; padding:1rem; border-radius:.75rem; color:var(--cyan); }}
    @media (max-width:800px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header><h1>Smoothness Proof Pack</h1><div class="sub">Focused clips for edge, jump, and long-pause proof. Evidence only, not approval.</div></header>
  <main>
    <section class="truth">
      <div class="pill"><b>Baseline</b>{escape(report['baselineId'])}</div>
      <div class="pill"><b>Approval</b>{escape(report['approvalStatus'])}</div>
      <div class="pill"><b>Moments</b>{escape(report['momentCount'])}</div>
      <div class="pill"><b>Failures</b>{escape(report['renderFailureCount'])}</div>
      <div class="pill"><b>Branch inheritance</b>{escape(report['branchInheritanceReady'])}</div>
    </section>
    <section class="notes"><button id="exportNotes">Export notes JSON</button><p>Notes export locally in your browser. They do not approve v006 or change the manifest.</p><pre id="template">{notes_template}</pre></section>
    {''.join(cards)}
  </main>
  <script>
    const template = {json.dumps(report.get('notesTemplate') or {})};
    document.getElementById('exportNotes').addEventListener('click', () => {{
      const notes = {{...template, exportedAt: new Date().toISOString(), moments: []}};
      document.querySelectorAll('.card').forEach(card => {{
        notes.moments.push({{
          id: card.dataset.momentId,
          decision: card.querySelector('[data-field="decision"]').value,
          notes: card.querySelector('[data-field="notes"]').value
        }});
      }});
      const blob = new Blob([JSON.stringify(notes, null, 2)], {{type: 'application/json'}});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `quipsly-smoothness-proof-notes-${{Date.now()}}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }});
  </script>
</body>
</html>
"""


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Smoothness Proof Pack: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This proof pack renders short derived audio clips around the smoothness audit's top transitions and long low-level spans. It does not approve audio, fail audio, render edit branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Smoothness audit passed: `{str(report['smoothnessAuditPassed']).lower()}`",
        f"- Classification counts: `{report['classificationCounts']}`",
        f"- Moments selected: `{report['momentCount']}`",
        f"- Snippets rendered: `{report['snippetCount']}`",
        f"- Render failures: `{report['renderFailureCount']}`",
        f"- HTML: `{report['html']}`",
        f"- Playlist: `{report['playlist']}`",
        "",
        "## Moments",
        "",
        "| # | Kind | Center | Title | Clip |",
        "|---:|---|---:|---|---|",
    ]
    for index, item in enumerate(report["moments"], start=1):
        lines.append(
            f"| {index} | `{item['kind']}` | `{item['centerTimecode']}` | {item['title']} | `{item['snippetPath']}` |"
        )
    if report["failures"]:
        lines.extend(["", "## Render failures", ""])
        for failure in report["failures"]:
            lines.append(f"- {failure.get('id')}: {failure.get('stderrTail')}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
            f"- Derived review snippets rendered: `{str(report['derivedReviewSnippetsRendered']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
            "## Next safest step",
            "",
            report["nextSafestStep"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--transition-limit", type=int, default=18)
    parser.add_argument("--silence-limit", type=int, default=8)
    parser.add_argument("--pre-seconds", type=float, default=5.0)
    parser.add_argument("--post-seconds", type=float, default=9.0)
    parser.add_argument("--silence-pad-seconds", type=float, default=3.0)
    parser.add_argument("--max-silence-clip-seconds", type=float, default=32.0)
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

    smoothness_path = output_path(outputs.get("latestAudioMasterSmoothnessAudit"))
    if not smoothness_path or not Path(smoothness_path).exists():
        raise SystemExit("latestAudioMasterSmoothnessAudit is not registered or missing")
    smoothness = read_json(Path(smoothness_path))
    source_path_text = output_path(outputs.get("masterM4a")) or output_path(outputs.get("masterWav"))
    if not source_path_text or not Path(source_path_text).exists():
        raise SystemExit("No masterM4a or masterWav registered for smoothness proof rendering")
    source_path = Path(source_path_text)
    source_duration = ffprobe_duration(source_path, ffprobe)

    moments = select_moments(
        smoothness,
        source_duration,
        args.transition_limit,
        args.silence_limit,
        args.pre_seconds,
        args.post_seconds,
        args.silence_pad_seconds,
        args.max_silence_clip_seconds,
    )

    output_dir = baseline_dir / f"audio-smoothness-proof-pack-{slug}-{generated_at}"
    clips_dir = output_dir / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)
    playlist_lines = ["#EXTM3U", f"# Quipsly smoothness proof pack for {baseline_id}"]
    rendered: list[dict[str, Any]] = []
    failures: list[dict[str, Any]] = []

    for index, moment in enumerate(moments, start=1):
        snippet_path = clips_dir / f"{index:02d}-{safe_slug(moment.id)[:80]}.m4a"
        result = render_snippet(source_path, snippet_path, moment.start_seconds, moment.duration_seconds, ffmpeg)
        actual_duration = ffprobe_duration(snippet_path, ffprobe) if result["ok"] else None
        row = {
            "id": moment.id,
            "kind": moment.kind,
            "title": moment.title,
            "centerSeconds": moment.center_seconds,
            "centerTimecode": timecode(moment.center_seconds),
            "windowStartSeconds": moment.start_seconds,
            "windowStartTimecode": timecode(moment.start_seconds),
            "windowDurationSeconds": round(actual_duration if actual_duration is not None else moment.duration_seconds, 3),
            "windowEndSeconds": moment.start_seconds + (actual_duration if actual_duration is not None else moment.duration_seconds),
            "windowEndTimecode": timecode(moment.start_seconds + (actual_duration if actual_duration is not None else moment.duration_seconds)),
            "snippetPath": str(snippet_path),
            "renderOk": result["ok"],
            "evidence": moment.evidence,
            "listenQuestions": moment.listen_questions,
            "suggestedNextAction": moment.suggested_next_action,
        }
        if result["ok"]:
            rendered.append(row)
            playlist_lines.extend([
                f"#EXTINF:{row['windowDurationSeconds']:.3f},{index:02d} {moment.title}",
                str(snippet_path),
            ])
        else:
            row["stderrTail"] = result.get("stderrTail")
            failures.append(row)

    notes_template = {
        "schema": "quipsly.audio-workbench.smoothness-proof-notes.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "sourcePack": None,
        "exportedAt": None,
        "reviewer": None,
        "overallDecision": "unreviewed",
        "moments": [
            {"id": item["id"], "decision": "unreviewed", "notes": ""}
            for item in rendered
        ],
    }

    report = {
        "schema": "quipsly.audio-workbench.smoothness-proof-pack.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedAtSlug": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "smoothnessAudit": smoothness_path,
        "smoothnessAuditPassed": smoothness.get("passed") is True,
        "classificationCounts": smoothness.get("classificationCounts") or {},
        "sourceAudio": str(source_path),
        "sourceDurationSeconds": source_duration,
        "outputDir": str(output_dir),
        "clipsDir": str(clips_dir),
        "momentCount": len(moments),
        "snippetCount": len(rendered),
        "renderFailureCount": len(failures),
        "transitionLimit": args.transition_limit,
        "silenceLimit": args.silence_limit,
        "moments": rendered,
        "failures": failures,
        "notesTemplate": notes_template,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "branchRenderAttempted": False,
        "derivedReviewSnippetsRendered": bool(rendered),
        "originalMediaMutated": False,
        "nextSafestStep": "Listen to these focused smoothness proof snippets. If they sound natural, export pass-context notes. If not, route exact timestamps to a scoped v007 smoothing/crossfade or pause-shaping proof candidate.",
    }

    playlist_path = output_dir / "smoothness-proof-snippets.m3u"
    html_path = output_dir / "smoothness-proof-pack.html"
    report_json_path = output_dir / "smoothness-proof-pack.json"
    md_path = output_dir / "smoothness-proof-pack.md"
    notes_template_path = output_dir / "smoothness-proof-notes-template.json"
    open_command_path = output_dir / "open-smoothness-proof-pack.command"

    notes_template["sourcePack"] = str(report_json_path)
    report["notesTemplate"] = notes_template
    report.update(
        {
            "json": str(report_json_path),
            "markdown": str(md_path),
            "html": str(html_path),
            "playlist": str(playlist_path),
            "notesTemplatePath": str(notes_template_path),
            "openCommand": str(open_command_path),
        }
    )

    playlist_path.write_text("\n".join(playlist_lines) + "\n", encoding="utf-8")
    write_json(report_json_path, report)
    write_json(notes_template_path, notes_template)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    open_command_path.write_text(
        "#!/bin/zsh\nset -euo pipefail\nopen "
        + shell_quote(str(html_path))
        + "\nopen "
        + shell_quote(str(md_path))
        + "\n",
        encoding="utf-8",
    )
    os.chmod(open_command_path, 0o755)

    outputs["latestAudioSmoothnessProofPack"] = str(report_json_path)
    outputs["latestAudioSmoothnessProofPackMarkdown"] = str(md_path)
    outputs["latestAudioSmoothnessProofPackHtml"] = str(html_path)
    outputs["latestAudioSmoothnessProofPackPlaylist"] = str(playlist_path)
    outputs["latestAudioSmoothnessProofPackNotesTemplate"] = str(notes_template_path)
    outputs["latestAudioSmoothnessProofPackOpenCommand"] = str(open_command_path)
    history = outputs.setdefault("audioSmoothnessProofPackHistory", [])
    if str(report_json_path) not in history:
        history.append(str(report_json_path))
    manifest["audioSmoothnessProofPackCount"] = len(history)
    manifest["audioSmoothnessProofPackLatestMomentCount"] = len(moments)
    manifest["audioSmoothnessProofPackLatestSnippetCount"] = len(rendered)
    manifest["audioSmoothnessProofPackLatestFailureCount"] = len(failures)
    manifest["latestAudioSmoothnessProofPackGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "json": str(report_json_path),
                "markdown": str(md_path),
                "html": str(html_path),
                "playlist": str(playlist_path),
                "notesTemplate": str(notes_template_path),
                "openCommand": str(open_command_path),
                "momentCount": len(moments),
                "snippetCount": len(rendered),
                "renderFailureCount": len(failures),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "branchRenderAttempted": False,
                "derivedReviewSnippetsRendered": bool(rendered),
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
