#!/usr/bin/env python3
"""Generate a delivery/device translation survival audit for the audio spine.

This is a derived review-media layer, not a final episode render. It takes the
current mastered Episode 4 v006 audio spine, extracts bounded proof windows, and
encodes them through practical delivery/listening profiles so Quipsly can answer
a better question than "does the master meter well?": does it survive the kinds
of transformations listeners and platforms are likely to apply?

It does not approve audio, unlock branches, render final episode/short branches,
upload, publish, or mutate source/original media.
"""

from __future__ import annotations

import argparse
import json
import math
import shlex
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


BASELINE_ID_FALLBACK = "episode-4-v006-audio-spine"
WINDOWS = [
    {
        "id": "long-silence-bridge",
        "label": "Long-silence bridge",
        "startSeconds": 1760.0,
        "durationSeconds": 24.0,
        "reason": "Checks whether a quiet structural gap feels intentional and survives compression without digital deadness.",
    },
    {
        "id": "post-wall-e-echo-check",
        "label": "Post Wall-E echo check",
        "startSeconds": 2062.0,
        "durationSeconds": 24.0,
        "reason": "Checks Charlie/Homer bleed suppression and intelligibility after lossy encode.",
    },
    {
        "id": "meetings-park-noise-check",
        "label": "Meetings section park-noise check",
        "startSeconds": 4180.0,
        "durationSeconds": 24.0,
        "reason": "Checks Homer's outdoor recording texture after compression and phone-style playback.",
    },
    {
        "id": "camera-assistant-overlap-check",
        "label": "Camera assistant overlap check",
        "startSeconds": 5710.0,
        "durationSeconds": 24.0,
        "reason": "Checks natural overlap, laughter, and reaction survival where over-gating would hurt the human feel.",
    },
]

PROFILES = [
    {
        "id": "source-window",
        "label": "Source proof WAV",
        "extension": "wav",
        "description": "Uncompressed control snippet from the mastered spine.",
        "kind": "control",
        "args": ["-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2"],
    },
    {
        "id": "podcast-aac-128",
        "label": "Podcast AAC 128k stereo",
        "extension": "m4a",
        "description": "Apple/Podcast-style AAC handoff audition.",
        "kind": "delivery",
        "args": ["-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2"],
    },
    {
        "id": "podcast-mp3-128",
        "label": "Podcast MP3 128k stereo",
        "extension": "mp3",
        "description": "Spotify-compatible MP3 survival audition.",
        "kind": "delivery",
        "args": ["-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100", "-ac", "2"],
    },
    {
        "id": "phone-mono-aac-96",
        "label": "Phone mono AAC 96k",
        "extension": "m4a",
        "description": "Small-device mono fold-down audition with gentle bandwidth limiting.",
        "kind": "device",
        "args": [
            "-af",
            "highpass=f=90,lowpass=f=7200",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-ar",
            "48000",
            "-ac",
            "1",
        ],
    },
]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio"


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def run_command(cmd: list[str], timeout: int = 180) -> tuple[int, str]:
    try:
        completed = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        return 127, str(exc)
    except subprocess.TimeoutExpired as exc:
        return 124, (exc.stdout or "") + "\n" + (exc.stderr or "")
    return completed.returncode, (completed.stdout or "") + "\n" + (completed.stderr or "")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def find_spine_paths(baseline_dir: Path, manifest: dict[str, Any]) -> dict[str, str | None]:
    outputs = manifest.get("outputs") or {}
    candidates: list[str] = []
    for value in outputs.values():
        path = output_path(value)
        if path:
            candidates.append(path)
    candidates.extend(str(path) for path in baseline_dir.glob("*mastered-audio-spine-v006.*"))
    candidates.extend(str(path) for path in baseline_dir.glob("episode4-mastered-audio-spine-v006.*"))
    wav = next((path for path in candidates if path.endswith(".wav") and Path(path).exists()), None)
    m4a = next((path for path in candidates if path.endswith(".m4a") and Path(path).exists()), None)
    return {"wav": wav, "m4a": m4a}


def ffprobe_audio(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"exists": False, "path": str(path), "error": "missing"}
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_name,sample_rate,channels,channel_layout",
        "-of",
        "json",
        str(path),
    ]
    code, raw = run_command(cmd, timeout=60)
    if code != 0:
        return {"exists": True, "path": str(path), "error": raw.strip()[-1000:]}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"exists": True, "path": str(path), "error": f"ffprobe JSON decode failed: {exc}"}
    stream = (payload.get("streams") or [{}])[0]
    fmt = payload.get("format") or {}
    return {
        "exists": True,
        "path": str(path),
        "sizeBytes": path.stat().st_size,
        "durationSeconds": as_float(fmt.get("duration")),
        "bitRate": as_float(fmt.get("bit_rate")),
        "codec": stream.get("codec_name"),
        "sampleRate": as_float(stream.get("sample_rate")),
        "channels": as_float(stream.get("channels")),
        "channelLayout": stream.get("channel_layout"),
        "error": None,
    }


def parse_loudnorm_json(raw: str) -> dict[str, Any]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < start:
        return {"available": False, "error": "loudnorm JSON not found", "rawTail": raw[-1000:]}
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        return {"available": False, "error": f"loudnorm JSON decode failed: {exc}", "rawTail": raw[-1000:]}
    result: dict[str, Any] = {"available": True}
    for key, value in payload.items():
        result[key] = as_float(value) if isinstance(value, str) else value
    return result


def measure_loudnorm(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"available": False, "error": "missing"}
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostats",
        "-nostdin",
        "-i",
        str(path),
        "-af",
        "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
    ]
    code, raw = run_command(cmd, timeout=120)
    parsed = parse_loudnorm_json(raw)
    parsed["exitCode"] = code
    if code != 0 and not parsed.get("error"):
        parsed["available"] = False
        parsed["error"] = raw.strip()[-1000:]
    return parsed


def render_profile(source_wav: Path, out_path: Path, window: dict[str, Any], profile: dict[str, Any]) -> dict[str, Any]:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()
    cmd = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-nostats",
        "-nostdin",
        "-ss",
        f"{float(window['startSeconds']):.3f}",
        "-t",
        f"{float(window['durationSeconds']):.3f}",
        "-i",
        str(source_wav),
        *profile["args"],
        str(out_path),
    ]
    code, raw = run_command(cmd, timeout=180)
    probe = ffprobe_audio(out_path)
    loudnorm = measure_loudnorm(out_path) if out_path.exists() else {"available": False, "error": "render failed"}
    return {
        "windowId": window["id"],
        "windowLabel": window["label"],
        "profileId": profile["id"],
        "profileLabel": profile["label"],
        "kind": profile["kind"],
        "path": str(out_path),
        "renderExitCode": code,
        "renderSucceeded": code == 0 and out_path.exists() and out_path.stat().st_size > 0,
        "renderLogTail": raw.strip()[-1000:],
        "probe": probe,
        "loudnorm": loudnorm,
    }


def evaluate_result(result: dict[str, Any], source_metrics: dict[str, Any] | None) -> dict[str, Any]:
    hard_stops: list[str] = []
    review_risks: list[str] = []
    if not result.get("renderSucceeded"):
        hard_stops.append("render failed")
    probe = result.get("probe") or {}
    loudnorm = result.get("loudnorm") or {}
    duration = as_float(probe.get("durationSeconds"))
    if duration is None:
        hard_stops.append("duration unavailable")
    else:
        delta = abs(duration - 24.0)
        if delta > 1.2:
            hard_stops.append(f"duration changed by {delta:.2f}s")
        elif delta > 0.35:
            review_risks.append(f"duration padding/drift {delta:.2f}s")
    input_i = as_float(loudnorm.get("input_i"))
    input_tp = as_float(loudnorm.get("input_tp"))
    if input_tp is not None:
        if input_tp >= -0.1:
            hard_stops.append(f"near clipping after translation: {input_tp:.2f} dBTP")
        elif input_tp > -1.0:
            review_risks.append(f"tight true-peak headroom after translation: {input_tp:.2f} dBTP")
    if source_metrics:
        source_i = as_float((source_metrics.get("loudnorm") or {}).get("input_i"))
        if source_i is not None and input_i is not None:
            diff = abs(input_i - source_i)
            result["loudnessDeltaFromSourceLu"] = round(diff, 3)
            if diff > 1.75:
                review_risks.append(f"translation loudness drift {diff:.2f} LU")
            if source_i > -30.0 and input_i < -35.0:
                review_risks.append(f"speech-like source became too quiet after translation: {input_i:.2f} LUFS")
    return {
        "hardStops": hard_stops,
        "reviewRisks": review_risks,
        "passed": not hard_stops,
    }


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# {report['title']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Baseline: `{report['baselineId']}`",
        f"- Source WAV: `{report['sourceWav']}`",
        f"- Windows: `{report['windowCount']}`",
        f"- Translation renders: `{report['translationRenderCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Derived review media rendered: `{report['derivedReviewMediaRendered']}`",
        f"- Final/branch render attempted: `{report['branchRenderAttempted']}`",
        f"- Upload/publication attempted: `{report['uploadAttempted']}` / `{report['publicationAttempted']}`",
        f"- Original media mutated: `{report['originalMediaMutated']}`",
        "",
        "## What this proves",
        "",
        "This checks whether the mastered audio spine survives practical delivery and device translations before final episode or shorts branches inherit it.",
        "",
        "## Results",
        "",
        "| Window | Profile | Codec | LUFS | True peak | Duration | Verdict |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for result in report["results"]:
        probe = result.get("probe") or {}
        loud = result.get("loudnorm") or {}
        eval_result = result.get("evaluation") or {}
        verdict = "pass" if eval_result.get("passed") else "hard stop"
        if eval_result.get("reviewRisks"):
            verdict += f" ({len(eval_result['reviewRisks'])} risk)"
        lines.append(
            "| "
            + " | ".join(
                [
                    str(result["windowLabel"]),
                    str(result["profileLabel"]),
                    str(probe.get("codec") or ""),
                    f"{as_float(loud.get('input_i')):.2f}" if as_float(loud.get("input_i")) is not None else "",
                    f"{as_float(loud.get('input_tp')):.2f}" if as_float(loud.get("input_tp")) is not None else "",
                    f"{as_float(probe.get('durationSeconds')):.2f}" if as_float(probe.get("durationSeconds")) is not None else "",
                    verdict,
                ]
            )
            + " |"
        )
    if report["hardStops"]:
        lines.extend(["", "## Hard stops", ""])
        lines.extend(f"- {item}" for item in report["hardStops"])
    if report["reviewRisks"]:
        lines.extend(["", "## Review risks", ""])
        lines.extend(f"- {item}" for item in report["reviewRisks"])
    lines.extend(
        [
            "",
            "## Research basis",
            "",
            "- Apple Podcasts recommends audio around `-16 dB LKFS`, true peak below `-1 dB FS`, and notes LKFS is measured using ITU-R BS.1770.",
            "- Spotify Creator guidance accepts `MP3`, `M4A`, and `WAV` audio episodes.",
            "- EBU R 128 and ITU-R BS.1770 remain useful as metering discipline, but not as a replacement for human listen approval.",
            "",
            "## Open folder",
            "",
            f"`open {shell_quote(report['outputDirectory'])}`",
        ]
    )
    return "\n".join(lines) + "\n"


def build_html(report: dict[str, Any]) -> str:
    rows = []
    for result in report["results"]:
        probe = result.get("probe") or {}
        loud = result.get("loudnorm") or {}
        eval_result = result.get("evaluation") or {}
        risks = eval_result.get("reviewRisks") or []
        stops = eval_result.get("hardStops") or []
        css = "stop" if stops else "risk" if risks else "pass"
        rows.append(
            "<tr class='{css}'><td>{window}</td><td>{profile}</td><td>{codec}</td><td>{lufs}</td>"
            "<td>{tp}</td><td>{duration}</td><td><audio controls src='{src}'></audio></td><td>{notes}</td></tr>".format(
                css=css,
                window=escape(str(result["windowLabel"])),
                profile=escape(str(result["profileLabel"])),
                codec=escape(str(probe.get("codec") or "")),
                lufs=escape(f"{as_float(loud.get('input_i')):.2f}" if as_float(loud.get("input_i")) is not None else ""),
                tp=escape(f"{as_float(loud.get('input_tp')):.2f}" if as_float(loud.get("input_tp")) is not None else ""),
                duration=escape(f"{as_float(probe.get('durationSeconds')):.2f}" if as_float(probe.get("durationSeconds")) is not None else ""),
                src=escape(Path(result["path"]).name),
                notes=escape("; ".join(stops + risks) or "pass"),
            )
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>{escape(report['title'])}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 28px; background: #f8f2e8; color: #2e241b; }}
    .card {{ background: #fffaf0; border: 1px solid #e2cfa9; border-radius: 18px; padding: 22px; box-shadow: 0 10px 30px rgba(68, 45, 24, .10); }}
    h1 {{ margin-top: 0; }}
    .status {{ display: inline-block; padding: 7px 12px; border-radius: 999px; background: #173f2e; color: #d7f6d8; font-weight: 700; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 22px; }}
    th, td {{ padding: 10px; border-bottom: 1px solid #eadcc1; vertical-align: top; }}
    th {{ text-align: left; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #7a5c2e; }}
    audio {{ width: 230px; }}
    tr.pass {{ background: rgba(37, 125, 72, .07); }}
    tr.risk {{ background: rgba(205, 143, 31, .13); }}
    tr.stop {{ background: rgba(164, 42, 42, .13); }}
    code {{ background: rgba(80, 50, 20, .09); padding: 2px 5px; border-radius: 6px; }}
  </style>
</head>
<body>
  <main class="card">
    <p class="status">{escape(report['status'])}</p>
    <h1>{escape(report['title'])}</h1>
    <p>This is derived review media only. It does not approve the audio, unlock branches, render final episode/short branches, upload, publish, or mutate originals.</p>
    <ul>
      <li>Hard stops: <strong>{report['hardStopCount']}</strong></li>
      <li>Review risks: <strong>{report['reviewRiskCount']}</strong></li>
      <li>Translation renders: <strong>{report['translationRenderCount']}</strong></li>
      <li>Source: <code>{escape(report['sourceWav'])}</code></li>
    </ul>
    <table>
      <thead><tr><th>Window</th><th>Profile</th><th>Codec</th><th>LUFS</th><th>TP</th><th>Duration</th><th>Listen</th><th>Notes</th></tr></thead>
      <tbody>
        {''.join(rows)}
      </tbody>
    </table>
  </main>
</body>
</html>
"""


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or BASELINE_ID_FALLBACK)
    spine_paths = find_spine_paths(baseline_dir, manifest)
    source_wav = spine_paths.get("wav")
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(baseline_id)
    output_dir = baseline_dir / f"audio-translation-survival-audit-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    hard_stops: list[str] = []
    review_risks: list[str] = []
    results: list[dict[str, Any]] = []
    source_metrics_by_window: dict[str, dict[str, Any]] = {}

    if not source_wav or not Path(source_wav).exists():
        hard_stops.append("current v006 mastered WAV missing")
    else:
        source = Path(source_wav)
        for window in WINDOWS:
            source_metrics: dict[str, Any] | None = None
            for profile in PROFILES:
                out_name = f"{window['id']}--{profile['id']}.{profile['extension']}"
                result = render_profile(source, output_dir / out_name, window, profile)
                if profile["id"] == "source-window":
                    source_metrics = result
                    source_metrics_by_window[window["id"]] = result
                result["evaluation"] = evaluate_result(result, source_metrics if profile["id"] != "source-window" else None)
                results.append(result)
        for result in results:
            eval_result = result.get("evaluation") or {}
            for stop in eval_result.get("hardStops") or []:
                hard_stops.append(f"{result['windowLabel']} / {result['profileLabel']}: {stop}")
            for risk in eval_result.get("reviewRisks") or []:
                review_risks.append(f"{result['windowLabel']} / {result['profileLabel']}: {risk}")

    translation_count = len([result for result in results if result.get("profileId") != "source-window"])
    status = (
        "translation-survival-audit-blocked"
        if hard_stops
        else "translation-survival-audit-ready-with-review-risks"
        if review_risks
        else "translation-survival-audit-ready"
    )

    report: dict[str, Any] = {
        "title": "Episode 4 v006 translation survival audit",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "status": status,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "sourceWav": source_wav,
        "sourceM4a": spine_paths.get("m4a"),
        "outputDirectory": str(output_dir),
        "windowCount": len(WINDOWS),
        "profileCount": len(PROFILES),
        "translationRenderCount": translation_count,
        "hardStopCount": len(hard_stops),
        "reviewRiskCount": len(review_risks),
        "hardStops": hard_stops,
        "reviewRisks": review_risks,
        "windows": WINDOWS,
        "profiles": PROFILES,
        "results": results,
        "derivedReviewMediaRendered": bool(results),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    json_path = output_dir / "translation-survival-audit.json"
    markdown_path = output_dir / "translation-survival-audit.md"
    html_path = output_dir / "translation-survival-audit.html"
    stable_json = baseline_dir / "AUDIO_TRANSLATION_SURVIVAL_AUDIT.json"
    stable_md = baseline_dir / "AUDIO_TRANSLATION_SURVIVAL_AUDIT.md"
    stable_html = baseline_dir / "AUDIO_TRANSLATION_SURVIVAL_AUDIT.html"
    open_command = baseline_dir / "OPEN_AUDIO_TRANSLATION_SURVIVAL_AUDIT.command"

    markdown = build_markdown(report)
    html = build_html(report)
    for path in (json_path, stable_json):
        write_json(path, report)
    for path in (markdown_path, stable_md):
        write_text(path, markdown)
    for path in (html_path, stable_html):
        write_text(path, html)
    write_text(open_command, f"#!/bin/zsh\nopen {shell_quote(str(stable_html))}\n")
    open_command.chmod(0o755)

    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioTranslationSurvivalAudit"] = str(stable_json)
    outputs["latestAudioTranslationSurvivalAuditMarkdown"] = str(stable_md)
    outputs["latestAudioTranslationSurvivalAuditHtml"] = str(stable_html)
    outputs["latestAudioTranslationSurvivalAuditOpenCommand"] = str(open_command)
    outputs["latestAudioTranslationSurvivalAuditVersioned"] = str(json_path)
    outputs["latestAudioTranslationSurvivalAuditVersionedMarkdown"] = str(markdown_path)
    outputs["latestAudioTranslationSurvivalAuditVersionedHtml"] = str(html_path)

    manifest.update(
        {
            "audioTranslationSurvivalAuditLatestStatus": status,
            "audioTranslationSurvivalAuditWindowCount": len(WINDOWS),
            "audioTranslationSurvivalAuditProfileCount": len(PROFILES),
            "audioTranslationSurvivalAuditTranslationRenderCount": translation_count,
            "audioTranslationSurvivalAuditHardStopCount": len(hard_stops),
            "audioTranslationSurvivalAuditReviewRiskCount": len(review_risks),
            "audioTranslationSurvivalAuditDerivedReviewMediaRendered": bool(results),
            "audioTranslationSurvivalAuditApprovalStateChanged": False,
            "audioTranslationSurvivalAuditBranchStateChanged": False,
            "audioTranslationSurvivalAuditRenderAttempted": False,
            "audioTranslationSurvivalAuditBranchRenderAttempted": False,
            "audioTranslationSurvivalAuditUploadAttempted": False,
            "audioTranslationSurvivalAuditPublicationAttempted": False,
            "audioTranslationSurvivalAuditOriginalMediaMutated": False,
        }
    )
    write_json(manifest_path, manifest)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    report = build_report(baseline_dir)
    print(json.dumps({
        "status": report["status"],
        "hardStopCount": report["hardStopCount"],
        "reviewRiskCount": report["reviewRiskCount"],
        "translationRenderCount": report["translationRenderCount"],
        "html": str(Path(report["baselineDir"]) / "AUDIO_TRANSLATION_SURVIVAL_AUDIT.html"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
