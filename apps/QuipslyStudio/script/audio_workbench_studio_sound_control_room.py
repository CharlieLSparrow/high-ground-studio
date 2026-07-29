#!/usr/bin/env python3
"""Create a studio-sound control room for the current mastered audio candidate.

This is an inspectable audio QA surface, not an approval tool. It samples the
current master at the highest-priority human-listen windows, renders small
review-only proof clips, creates waveform/SVG and optional spectrogram evidence,
and registers the result on the manifest.

It does not approve audio, fail audio, unlock branch inheritance, render edit
branches, upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import array
import html
import json
import math
import shutil
import subprocess
import wave
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ReviewWindow:
    source: str
    label: str
    start: float
    end: float
    reason: str
    priority: int


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "m4aPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def int_value(value: Any, fallback: int = 0) -> int:
    if isinstance(value, list):
        for item in value:
            parsed = int_value(item, fallback=None)  # type: ignore[arg-type]
            if parsed is not None:
                return parsed
        return fallback
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def seconds_label(value: float) -> str:
    value = max(0.0, float(value))
    total = int(round(value))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def clamp_window(start: float, end: float, duration: float, pad: float) -> tuple[float, float]:
    start = max(0.0, start - pad)
    end = min(duration, end + pad)
    if end <= start:
        end = min(duration, start + 12.0)
    return start, end


def load_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists():
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def collect_windows(manifest: dict[str, Any], *, max_windows: int, pad: float) -> list[ReviewWindow]:
    outputs = manifest.get("outputs") or {}
    duration = float(((outputs.get("masterWav") or {}).get("probe") or {}).get("durationSeconds") or 0.0)
    windows: list[ReviewWindow] = []

    triage = load_report(outputs, "latestSpeakerCleanupTriageBoard")
    for row in triage.get("rows") or []:
        if not isinstance(row, dict):
            continue
        start = float(row.get("start") or 0.0)
        end = float(row.get("end") or start + float(row.get("durationSeconds") or 12.0))
        start, end = clamp_window(start, end, duration, pad)
        priority = int_value(row.get("listenOrder") or row.get("priority"), 50)
        windows.append(
            ReviewWindow(
                source="speaker-cleanup-triage",
                label=f"Triage {row.get('index')}: {row.get('symptom') or 'speaker cleanup'}",
                start=start,
                end=end,
                reason=str(row.get("reason") or row.get("reviewerPrompt") or "speaker cleanup listen check"),
                priority=priority,
            )
        )

    technical = load_report(outputs, "latestAudioTechnicalAuditionAuditJson") or load_report(outputs, "latestAudioTechnicalAuditionAudit")
    for row in technical.get("listenMoments") or []:
        if not isinstance(row, dict):
            continue
        start = float(row.get("startSeconds") or 0.0)
        end = float(row.get("endSeconds") or start + 12.0)
        start, end = clamp_window(start, end, duration, pad)
        reasons = row.get("reasons") if isinstance(row.get("reasons"), list) else []
        windows.append(
            ReviewWindow(
                source="technical-audition",
                label=f"Technical moment {row.get('index')}: risk {row.get('riskScore')}",
                start=start,
                end=end,
                reason=", ".join(str(item) for item in reasons) or "technical audition listen check",
                priority=100 + int_value(row.get("index"), 0),
            )
        )

    # Keep one representative intro, middle, and late-stage check even if other
    # reports change shape. These are review-only anchors, not edit decisions.
    for index, fraction in enumerate((0.02, 0.50, 0.92), start=1):
        if duration <= 0:
            continue
        center = duration * fraction
        start, end = clamp_window(center - 8.0, center + 8.0, duration, 0.0)
        windows.append(
            ReviewWindow(
                source="master-anchor",
                label=f"Whole-master anchor {index}",
                start=start,
                end=end,
                reason="general whole-episode sound sanity check",
                priority=200 + index,
            )
        )

    deduped: list[ReviewWindow] = []
    seen: set[int] = set()
    for window in sorted(windows, key=lambda item: (item.priority, item.start)):
        bucket = int(window.start // 3)
        if bucket in seen:
            continue
        seen.add(bucket)
        deduped.append(window)
        if len(deduped) >= max_windows:
            break
    return deduped


def read_window_samples(wav_path: Path, start: float, end: float) -> tuple[dict[str, Any], list[float]]:
    with wave.open(str(wav_path), "rb") as wav:
        channels = wav.getnchannels()
        sample_rate = wav.getframerate()
        sample_width = wav.getsampwidth()
        frame_count = wav.getnframes()
        start_frame = min(frame_count, max(0, int(start * sample_rate)))
        end_frame = min(frame_count, max(start_frame + 1, int(end * sample_rate)))
        wav.setpos(start_frame)
        raw = wav.readframes(end_frame - start_frame)

    if sample_width != 2:
        raise ValueError(f"Only 16-bit PCM WAV is currently supported for metrics; got sample width {sample_width}")
    samples = array.array("h")
    samples.frombytes(raw)
    if samples.itemsize != 2:
        samples.byteswap()
    values = [sample / 32768.0 for sample in samples]
    if not values:
        values = [0.0]
    peak = max(abs(value) for value in values)
    rms = math.sqrt(sum(value * value for value in values) / len(values))
    peak_dbfs = 20.0 * math.log10(max(peak, 1e-9))
    rms_dbfs = 20.0 * math.log10(max(rms, 1e-9))
    crest = peak_dbfs - rms_dbfs
    left_rms = right_rms = None
    if channels >= 2:
        left = values[0::channels]
        right = values[1::channels]
        left_rms = math.sqrt(sum(value * value for value in left) / max(1, len(left)))
        right_rms = math.sqrt(sum(value * value for value in right) / max(1, len(right)))
    chunk_size = max(channels * sample_rate // 4, channels)
    active_chunks = quiet_chunks = total_chunks = 0
    for offset in range(0, len(values), chunk_size):
        chunk = values[offset : offset + chunk_size]
        if not chunk:
            continue
        chunk_rms = math.sqrt(sum(value * value for value in chunk) / len(chunk))
        chunk_db = 20.0 * math.log10(max(chunk_rms, 1e-9))
        total_chunks += 1
        if chunk_db > -38.0:
            active_chunks += 1
        if chunk_db < -55.0:
            quiet_chunks += 1
    metrics = {
        "channels": channels,
        "sampleRate": sample_rate,
        "sampleWidthBits": sample_width * 8,
        "durationSeconds": round(end - start, 3),
        "peakDbfs": round(peak_dbfs, 2),
        "rmsDbfs": round(rms_dbfs, 2),
        "crestDb": round(crest, 2),
        "leftRightRmsDeltaDb": round(20.0 * math.log10(max(left_rms or 1e-9, 1e-9) / max(right_rms or 1e-9, 1e-9)), 2) if left_rms is not None and right_rms is not None else None,
        "activeRatio": round(active_chunks / total_chunks, 3) if total_chunks else 0.0,
        "quietRatio": round(quiet_chunks / total_chunks, 3) if total_chunks else 0.0,
        "riskFlags": [],
    }
    if metrics["peakDbfs"] > -1.0:
        metrics["riskFlags"].append("near-peak")
    if metrics["rmsDbfs"] < -33.0:
        metrics["riskFlags"].append("very-quiet")
    if metrics["rmsDbfs"] > -13.0:
        metrics["riskFlags"].append("very-dense")
    if metrics["leftRightRmsDeltaDb"] is not None and abs(metrics["leftRightRmsDeltaDb"]) > 4.0:
        metrics["riskFlags"].append("left-right-imbalance")
    if metrics["quietRatio"] > 0.65:
        metrics["riskFlags"].append("mostly-quiet")
    return metrics, values[0::channels]


def waveform_svg(samples: list[float], *, title: str, width: int = 900, height: int = 180) -> str:
    bins = min(width, max(1, len(samples)))
    step = max(1, len(samples) // bins)
    bars: list[str] = []
    mid = height / 2
    for i in range(0, len(samples), step):
        chunk = samples[i : i + step]
        if not chunk:
            continue
        value = max(abs(sample) for sample in chunk)
        h = max(1.0, value * (height * 0.92))
        x = len(bars) * (width / bins)
        bars.append(f'<line x1="{x:.1f}" y1="{mid - h/2:.1f}" x2="{x:.1f}" y2="{mid + h/2:.1f}" />')
    return "\n".join(
        [
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}">',
            '<rect width="100%" height="100%" rx="16" fill="#101813"/>',
            '<line x1="0" y1="50%" x2="100%" y2="50%" stroke="#6f7f72" stroke-width="1" opacity="0.45"/>',
            '<g stroke="#d7ba4b" stroke-width="1.2" opacity="0.95">',
            *bars,
            "</g>",
            "</svg>",
        ]
    )


def render_snippet(ffmpeg: str | None, source: Path, target: Path, start: float, duration: float) -> dict[str, Any]:
    if not ffmpeg:
        return {"ok": False, "reason": "ffmpeg not found", "path": str(target)}
    proc = subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(source), "-vn", "-c:a", "aac", "-b:a", "160k", str(target)],
        text=True,
        capture_output=True,
        check=False,
    )
    return {"ok": proc.returncode == 0 and target.exists(), "returncode": proc.returncode, "stderr": proc.stderr.strip(), "path": str(target)}


def render_spectrogram(ffmpeg: str | None, source: Path, target: Path, start: float, duration: float) -> dict[str, Any]:
    if not ffmpeg:
        return {"ok": False, "reason": "ffmpeg not found", "path": str(target)}
    proc = subprocess.run(
        [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-ss", f"{start:.3f}", "-t", f"{duration:.3f}", "-i", str(source), "-lavfi", "showspectrumpic=s=900x260:legend=disabled:scale=log", "-frames:v", "1", str(target)],
        text=True,
        capture_output=True,
        check=False,
    )
    return {"ok": proc.returncode == 0 and target.exists(), "returncode": proc.returncode, "stderr": proc.stderr.strip(), "path": str(target)}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Studio Sound Control Room",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is an audio microscope for the current mastered candidate. It does not approve audio, unlock branches, render edit branches, upload, publish, or mutate original media.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Windows: `{report['windowCount']}`",
        f"- Snippets rendered: `{report['snippetRenderOkCount']}` / `{report['windowCount']}`",
        f"- Spectrograms rendered: `{report['spectrogramRenderOkCount']}` / `{report['windowCount']}`",
        f"- Windows with risk flags: `{report['riskWindowCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Highest-priority windows",
        "",
        "| # | Time | Source | RMS | Peak | Crest | LR delta | Flags | Reason |",
        "|---:|---|---|---:|---:|---:|---:|---|---|",
    ]
    for item in report["windows"]:
        metrics = item["metrics"]
        flags = ", ".join(metrics.get("riskFlags") or []) or "none"
        lines.append(
            f"| {item['index']} | `{item['timecode']}` | `{item['source']}` | `{metrics['rmsDbfs']}` | `{metrics['peakDbfs']}` | `{metrics['crestDb']}` | `{metrics.get('leftRightRmsDeltaDb')}` | {flags} | {item['reason']} |"
        )
    lines.extend(
        [
            "",
            "## Next safe use",
            "",
            "Open the HTML control room and listen to the flagged windows. If the symptom is real, route a scoped v007 repair at the owning stage instead of rerunning the entire audio chain blindly.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for item in report["windows"]:
        metrics = item["metrics"]
        flags = ", ".join(metrics.get("riskFlags") or []) or "no machine flags"
        audio = f'<audio controls preload="metadata" src="{html.escape(item.get("snippetRelativePath") or "")}"></audio>' if item.get("snippetRelativePath") else "<p>No snippet rendered.</p>"
        spectrogram = f'<img src="{html.escape(item.get("spectrogramRelativePath") or "")}" alt="spectrogram" />' if item.get("spectrogramRelativePath") else ""
        cards.append(
            f"""
            <section class="window-card">
              <header><span class="index">{item['index']}</span><div><h2>{html.escape(item['label'])}</h2><p>{html.escape(item['timecode'])} · {html.escape(item['source'])}</p></div></header>
              <p class="reason">{html.escape(item['reason'])}</p>
              <div class="metrics">
                <span>RMS <b>{metrics['rmsDbfs']} dBFS</b></span>
                <span>Peak <b>{metrics['peakDbfs']} dBFS</b></span>
                <span>Crest <b>{metrics['crestDb']} dB</b></span>
                <span>LR Δ <b>{metrics.get('leftRightRmsDeltaDb')}</b></span>
                <span>Active <b>{metrics['activeRatio']}</b></span>
                <span>Quiet <b>{metrics['quietRatio']}</b></span>
              </div>
              <p class="flags">{html.escape(flags)}</p>
              {audio}
              <div class="visuals">
                <img src="{html.escape(item['waveformRelativePath'])}" alt="waveform" />
                {spectrogram}
              </div>
            </section>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Studio Sound Control Room</title>
<style>
:root {{ color-scheme: dark; --soil:#241d16; --moss:#18251c; --leaf:#49c16d; --honey:#d7ba4b; --clay:#b7653f; --paper:#f1e6cc; --ink:#f7f0df; }}
body {{ margin:0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, #253d2d, #111714 42%, #090d0b); color:var(--ink); }}
main {{ max-width: 1180px; margin: 0 auto; padding: 36px 24px 64px; }}
.hero {{ border:1px solid rgba(215,186,75,.35); border-radius:28px; padding:28px; background:linear-gradient(135deg, rgba(36,29,22,.92), rgba(24,37,28,.86)); box-shadow:0 24px 80px rgba(0,0,0,.35); }}
h1 {{ margin:0 0 8px; font-size:38px; letter-spacing:-.03em; }}
.summary {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-top:22px; }}
.pill {{ padding:14px 16px; border-radius:18px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.09); }}
.pill b {{ display:block; font-size:22px; color:var(--honey); }}
.window-card {{ margin-top:20px; padding:20px; border-radius:24px; background:rgba(11,17,13,.78); border:1px solid rgba(215,186,75,.22); }}
.window-card header {{ display:flex; gap:14px; align-items:center; }}
.index {{ display:grid; place-items:center; width:42px; height:42px; border-radius:50%; color:#0d130f; background:var(--honey); font-weight:900; }}
h2 {{ margin:0; font-size:20px; }}
p {{ color:rgba(247,240,223,.78); }}
.metrics {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }}
.metrics span, .flags {{ border-radius:999px; padding:7px 10px; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.08); }}
.flags {{ display:inline-block; color:var(--honey); }}
audio {{ width:100%; margin:14px 0; }}
.visuals {{ display:grid; grid-template-columns:1fr; gap:10px; }}
.visuals img {{ width:100%; border-radius:16px; border:1px solid rgba(255,255,255,.08); background:#101813; }}
code {{ color:var(--honey); }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p><code>QUIPSLY AUDIO WORKBENCH</code></p>
    <h1>Studio Sound Control Room</h1>
    <p>Window-by-window proof for the current mastered candidate. This helps humans and Codex hear, see, and route repairs without treating audio enhancement as a black box.</p>
    <div class="summary">
      <div class="pill"><b>{report['windowCount']}</b> windows</div>
      <div class="pill"><b>{report['snippetRenderOkCount']}</b> snippets</div>
      <div class="pill"><b>{report['spectrogramRenderOkCount']}</b> spectrograms</div>
      <div class="pill"><b>{report['riskWindowCount']}</b> flagged</div>
      <div class="pill"><b>{html.escape(report['approvalStatus'])}</b> approval</div>
    </div>
  </section>
  {''.join(cards)}
</main>
</body>
</html>"""


def render_notes_template(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": "quipsly.audio-workbench.studio-sound-notes.v1",
        "createdAt": report["generatedAt"],
        "baselineId": report["baselineId"],
        "sourceControlRoom": report["path"],
        "overallDecision": "pending",
        "reviewer": "",
        "reviewNotes": "",
        "decisionOptions": [
            "pass",
            "needs-focused-proof",
            "needs-scoped-v007-repair",
            "ignore-machine-flag",
            "pending",
        ],
        "rows": [
            {
                "index": item["index"],
                "timecode": item["timecode"],
                "startSeconds": item["startSeconds"],
                "endSeconds": item["endSeconds"],
                "label": item["label"],
                "source": item["source"],
                "riskFlags": list((item.get("metrics") or {}).get("riskFlags") or []),
                "decision": "pending",
                "symptomHeard": "",
                "repairRequest": "",
                "notes": "",
            }
            for item in report["windows"]
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--max-windows", type=int, default=24)
    parser.add_argument("--pad-seconds", type=float, default=1.5)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    master_wav_path = output_path(outputs.get("masterWav"))
    master_m4a_path = output_path(outputs.get("masterM4a")) or master_wav_path
    if not master_wav_path or not Path(master_wav_path).exists():
        raise FileNotFoundError("manifest outputs.masterWav is missing or not readable")
    if not master_m4a_path or not Path(master_m4a_path).exists():
        raise FileNotFoundError("manifest outputs.masterM4a is missing or not readable")
    master_wav = Path(master_wav_path)
    master_m4a = Path(master_m4a_path)
    ffmpeg = shutil.which("ffmpeg")

    version_dir = baseline_dir / f"studio-sound-control-room-{slug}-{generated_at}"
    clip_dir = version_dir / "clips"
    waveform_dir = version_dir / "waveforms"
    spectrogram_dir = version_dir / "spectrograms"
    for directory in (clip_dir, waveform_dir, spectrogram_dir):
        directory.mkdir(parents=True, exist_ok=True)

    windows = collect_windows(manifest_before, max_windows=args.max_windows, pad=args.pad_seconds)
    rendered: list[dict[str, Any]] = []
    for index, window in enumerate(windows, start=1):
        metrics, samples = read_window_samples(master_wav, window.start, window.end)
        duration = max(0.5, window.end - window.start)
        base_name = f"window-{index:02d}-{safe_slug(window.source)}"
        snippet_path = clip_dir / f"{base_name}.m4a"
        waveform_path = waveform_dir / f"{base_name}.svg"
        spectrogram_path = spectrogram_dir / f"{base_name}.png"
        waveform_path.write_text(waveform_svg(samples, title=window.label), encoding="utf-8")
        snippet_result = render_snippet(ffmpeg, master_m4a, snippet_path, window.start, duration)
        spectrogram_result = render_spectrogram(ffmpeg, master_wav, spectrogram_path, window.start, duration)
        rendered.append(
            {
                "index": index,
                "source": window.source,
                "label": window.label,
                "startSeconds": round(window.start, 3),
                "endSeconds": round(window.end, 3),
                "durationSeconds": round(duration, 3),
                "timecode": f"{seconds_label(window.start)} - {seconds_label(window.end)}",
                "reason": window.reason,
                "priority": window.priority,
                "metrics": metrics,
                "snippetRender": snippet_result,
                "spectrogramRender": spectrogram_result,
                "snippetPath": str(snippet_path) if snippet_result.get("ok") else None,
                "waveformPath": str(waveform_path),
                "spectrogramPath": str(spectrogram_path) if spectrogram_result.get("ok") else None,
                "snippetRelativePath": str(snippet_path.relative_to(version_dir)) if snippet_result.get("ok") else None,
                "waveformRelativePath": str(waveform_path.relative_to(version_dir)),
                "spectrogramRelativePath": str(spectrogram_path.relative_to(version_dir)) if spectrogram_result.get("ok") else None,
            }
        )

    snippet_ok = sum(1 for item in rendered if (item.get("snippetRender") or {}).get("ok"))
    spectrogram_ok = sum(1 for item in rendered if (item.get("spectrogramRender") or {}).get("ok"))
    risk_count = sum(1 for item in rendered if item["metrics"].get("riskFlags"))
    report = {
        "schema": "quipsly.audio-workbench.studio-sound-control-room.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "status": "ready-for-studio-sound-review" if rendered else "missing-review-windows",
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "sourceAudioPath": str(master_wav),
        "listeningAudioPath": str(master_m4a),
        "ffmpegPath": ffmpeg,
        "windowCount": len(rendered),
        "snippetRenderOkCount": snippet_ok,
        "spectrogramRenderOkCount": spectrogram_ok,
        "renderFailureCount": len(rendered) - snippet_ok,
        "spectrogramFailureCount": len(rendered) - spectrogram_ok,
        "riskWindowCount": risk_count,
        "windows": rendered,
        "derivedReviewRenderAttempted": bool(rendered),
        "branchRenderAttempted": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    stable_json = baseline_dir / "STUDIO_SOUND_CONTROL_ROOM.json"
    stable_md = baseline_dir / "STUDIO_SOUND_CONTROL_ROOM.md"
    stable_html = baseline_dir / "STUDIO_SOUND_CONTROL_ROOM.html"
    stable_notes_template = baseline_dir / "STUDIO_SOUND_NOTES_TEMPLATE.json"
    stable_open = baseline_dir / "OPEN_STUDIO_SOUND_CONTROL_ROOM.command"
    version_json = version_dir / "studio-sound-control-room.json"
    version_md = version_dir / "studio-sound-control-room.md"
    version_html = version_dir / "studio-sound-control-room.html"
    version_notes_template = version_dir / "studio-sound-notes-template.json"
    version_open = version_dir / "open-studio-sound-control-room.command"
    report.update(
        {
            "path": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "notesTemplatePath": str(stable_notes_template),
            "openCommand": str(stable_open),
            "versionedPath": str(version_json),
            "versionedMarkdownPath": str(version_md),
            "versionedHtmlPath": str(version_html),
            "versionedNotesTemplatePath": str(version_notes_template),
            "versionedOpenCommand": str(version_open),
        }
    )
    markdown = render_markdown(report)
    page = render_html(report)
    notes_template = render_notes_template(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_notes_template, version_notes_template):
        write_json(path, notes_template)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, version_html):
        path.write_text(page, encoding="utf-8")
    command = "#!/bin/zsh\nset -euo pipefail\nopen " + shell_quote(str(stable_html)) + "\n"
    for path in (stable_open, version_open):
        path.write_text(command, encoding="utf-8")
        path.chmod(0o755)

    manifest_after = read_json(manifest_path)
    outputs_after = manifest_after.setdefault("outputs", {})
    outputs_after["latestAudioStudioSoundControlRoom"] = str(stable_json)
    outputs_after["latestAudioStudioSoundControlRoomMarkdown"] = str(stable_md)
    outputs_after["latestAudioStudioSoundControlRoomHtml"] = str(stable_html)
    outputs_after["latestAudioStudioSoundNotesTemplate"] = str(stable_notes_template)
    outputs_after["latestAudioStudioSoundControlRoomOpenCommand"] = str(stable_open)
    history = outputs_after.setdefault("audioStudioSoundControlRooms", [])
    if isinstance(history, list):
        history.append(str(version_json))
    manifest_after["audioStudioSoundControlRoomCount"] = int(manifest_after.get("audioStudioSoundControlRoomCount") or 0) + 1
    manifest_after["audioStudioSoundControlRoomLatestStatus"] = report["status"]
    manifest_after["audioStudioSoundControlRoomWindowCount"] = len(rendered)
    manifest_after["audioStudioSoundControlRoomSnippetRenderOkCount"] = snippet_ok
    manifest_after["audioStudioSoundControlRoomSpectrogramRenderOkCount"] = spectrogram_ok
    manifest_after["audioStudioSoundControlRoomRenderFailureCount"] = len(rendered) - snippet_ok
    manifest_after["audioStudioSoundControlRoomRiskWindowCount"] = risk_count
    manifest_after["audioStudioSoundNotesTemplateWindowCount"] = len(rendered)
    manifest_after["audioStudioSoundControlRoomApprovalStateChanged"] = False
    manifest_after["audioStudioSoundControlRoomBranchStateChanged"] = False
    manifest_after["audioStudioSoundControlRoomBranchRenderAttempted"] = False
    manifest_after["audioStudioSoundControlRoomUploadAttempted"] = False
    manifest_after["audioStudioSoundControlRoomPublicationAttempted"] = False
    manifest_after["audioStudioSoundControlRoomOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "html": str(stable_html), "status": report["status"], "windowCount": len(rendered), "snippetRenderOkCount": snippet_ok, "spectrogramRenderOkCount": spectrogram_ok, "riskWindowCount": risk_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
