#!/usr/bin/env python3
"""Build a machine-listen sentinel for the current mastered audio spine.

This is an objective QC layer, not an approval system. It measures the current
mastered WAV/M4A, folds in existing speaker-survival and quality-gate truth, and
answers a practical question: is this spine technically safe enough for Charlie's
human listen and later branch inheritance after approval?

It does not approve audio, unlock branches, render episode/short branches,
upload, publish, or mutate source/original media.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import shlex
import struct
import subprocess
import wave
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except Exception:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(number):
        return None
    return number


def as_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def run_command(cmd: list[str], timeout: int = 240) -> tuple[int, str]:
    try:
        completed = subprocess.run(cmd, text=True, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError as exc:
        return 127, str(exc)
    except subprocess.TimeoutExpired as exc:
        return 124, (exc.stdout or "") + "\n" + (exc.stderr or "")
    return completed.returncode, (completed.stdout or "") + "\n" + (completed.stderr or "")


def ffprobe_audio(path: str | None) -> dict[str, Any]:
    if not path:
        return {"exists": False, "error": "missing path"}
    media = Path(path)
    if not media.exists():
        return {"exists": False, "path": path, "error": "file missing"}
    cmd = [
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "format=duration,bit_rate:stream=codec_name,sample_rate,channels,channel_layout,bits_per_sample",
        "-of", "json", str(media),
    ]
    code, raw = run_command(cmd, timeout=90)
    if code != 0:
        return {"exists": True, "path": path, "error": raw.strip()[-1200:]}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        return {"exists": True, "path": path, "error": f"ffprobe JSON decode failed: {exc}"}
    stream = (payload.get("streams") or [{}])[0]
    fmt = payload.get("format") or {}
    return {
        "exists": True,
        "path": path,
        "sizeBytes": media.stat().st_size,
        "durationSeconds": as_float(fmt.get("duration")),
        "bitRate": as_int(fmt.get("bit_rate")) or None,
        "codec": stream.get("codec_name"),
        "sampleRate": as_int(stream.get("sample_rate")) or None,
        "channels": as_int(stream.get("channels")) or None,
        "channelLayout": stream.get("channel_layout"),
        "bitsPerSample": as_int(stream.get("bits_per_sample")) or None,
        "error": None,
    }


def parse_loudnorm_json(raw: str) -> dict[str, Any]:
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end < start:
        return {"error": "loudnorm JSON not found", "rawTail": raw[-1600:]}
    try:
        payload = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        return {"error": f"loudnorm JSON decode failed: {exc}", "rawTail": raw[-1600:]}
    result: dict[str, Any] = {}
    for key, value in payload.items():
        result[key] = as_float(value) if isinstance(value, str) else value
    return result


def measure_loudnorm(path: str | None) -> dict[str, Any]:
    if not path or not Path(path).exists():
        return {"available": False, "error": "audio path missing"}
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-i", path,
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ]
    code, raw = run_command(cmd, timeout=420)
    parsed = parse_loudnorm_json(raw)
    parsed["available"] = code == 0 and "error" not in parsed
    parsed["exitCode"] = code
    if code != 0 and "error" not in parsed:
        parsed["error"] = raw.strip()[-1600:]
    return parsed


def measure_silence(path: str | None) -> dict[str, Any]:
    if not path or not Path(path).exists():
        return {"available": False, "error": "audio path missing"}
    cmd = [
        "ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-i", path,
        "-af", "silencedetect=noise=-45dB:d=2",
        "-f", "null", "-",
    ]
    code, raw = run_command(cmd, timeout=420)
    starts: list[float] = []
    events: list[dict[str, float]] = []
    for line in raw.splitlines():
        start_match = re.search(r"silence_start: ([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
            continue
        end_match = re.search(r"silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)", line)
        if end_match:
            start = starts.pop(0) if starts else max(0.0, float(end_match.group(1)) - float(end_match.group(2)))
            end = float(end_match.group(1))
            duration = float(end_match.group(2))
            events.append({"startSeconds": start, "endSeconds": end, "durationSeconds": duration})
    return {
        "available": code == 0,
        "exitCode": code,
        "threshold": "-45dB for >=2s",
        "eventCount": len(events),
        "longestSeconds": max((event["durationSeconds"] for event in events), default=0.0),
        "totalSeconds": round(sum(event["durationSeconds"] for event in events), 3),
        "eventsPreview": events[:20],
        "error": None if code == 0 else raw.strip()[-1600:],
    }


def pcm_wav_metrics(path: str | None, chunk_frames: int = 48000) -> dict[str, Any]:
    if not path or not Path(path).exists():
        return {"available": False, "error": "audio path missing"}
    try:
        with wave.open(path, "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            frame_rate = wav.getframerate()
            frame_count = wav.getnframes()
            if sample_width != 2:
                return {"available": False, "error": f"unsupported sample width {sample_width}; expected 16-bit PCM"}
            sums = [0.0 for _ in range(channels)]
            counts = [0 for _ in range(channels)]
            peaks = [0 for _ in range(channels)]
            near_clip = 0
            active_chunks = 0
            quiet_chunks = 0
            total_chunks = 0
            while True:
                frames = wav.readframes(chunk_frames)
                if not frames:
                    break
                samples = struct.unpack("<" + "h" * (len(frames) // 2), frames)
                total_chunks += 1
                chunk_sum = 0.0
                chunk_count = 0
                chunk_peak = 0
                for index, sample in enumerate(samples):
                    channel = index % channels
                    abs_sample = abs(sample)
                    sums[channel] += float(sample) * float(sample)
                    counts[channel] += 1
                    peaks[channel] = max(peaks[channel], abs_sample)
                    chunk_sum += float(sample) * float(sample)
                    chunk_count += 1
                    chunk_peak = max(chunk_peak, abs_sample)
                    if abs_sample >= 29203:  # about -1 dBFS for 16-bit PCM
                        near_clip += 1
                if chunk_count:
                    rms = math.sqrt(chunk_sum / chunk_count) / 32768.0
                    dbfs = 20.0 * math.log10(max(rms, 1e-12))
                    if dbfs > -50.0:
                        active_chunks += 1
                    if dbfs < -60.0 and chunk_peak < 64:
                        quiet_chunks += 1
            rms_values = [math.sqrt(sums[i] / counts[i]) / 32768.0 if counts[i] else 0.0 for i in range(channels)]
            db_values = [20.0 * math.log10(max(value, 1e-12)) for value in rms_values]
            peak_db = [20.0 * math.log10(max(peak / 32768.0, 1e-12)) for peak in peaks]
            balance_spread = max(db_values) - min(db_values) if db_values else 0.0
            return {
                "available": True,
                "channels": channels,
                "sampleWidthBytes": sample_width,
                "sampleRate": frame_rate,
                "frameCount": frame_count,
                "durationSeconds": round(frame_count / frame_rate, 3) if frame_rate else None,
                "rmsDbfsPerChannel": [round(value, 2) for value in db_values],
                "peakDbfsPerChannel": [round(value, 2) for value in peak_db],
                "channelBalanceSpreadDb": round(balance_spread, 2),
                "nearClipSampleCount": near_clip,
                "activeChunkRatio": round(active_chunks / total_chunks, 4) if total_chunks else 0.0,
                "nearDigitalSilenceChunkRatio": round(quiet_chunks / total_chunks, 4) if total_chunks else 0.0,
                "chunkSeconds": round(chunk_frames / frame_rate, 3) if frame_rate else None,
            }
    except wave.Error as exc:
        return {"available": False, "error": f"wave read failed: {exc}"}


def grade(report: dict[str, Any]) -> tuple[str, int, int, int, list[str], list[str]]:
    hard_stops: list[str] = []
    review_risks: list[str] = []
    strengths: list[str] = []
    wav = report["masterWavProbe"]
    m4a = report["masterM4aProbe"]
    loud = report["loudnorm"]
    silence = report["silence"]
    pcm = report["pcmWavMetrics"]
    spine_gate = report["sourceReports"].get("spineQualityGate") or {}
    quality_matrix = report["sourceReports"].get("qualityMethodsMatrix") or {}

    for label, probe in (("WAV", wav), ("M4A", m4a)):
        if not probe.get("exists") or probe.get("error"):
            hard_stops.append(f"{label} probe failed: {probe.get('error') or 'missing'}")
        if probe.get("sampleRate") != 48000:
            review_risks.append(f"{label} sample rate is {probe.get('sampleRate')}, expected 48000.")
        if probe.get("channels") != 2:
            review_risks.append(f"{label} channel count is {probe.get('channels')}, expected stereo.")
    if wav.get("codec") != "pcm_s16le":
        review_risks.append(f"WAV codec is {wav.get('codec')}, expected pcm_s16le for handoff.")
    if m4a.get("codec") != "aac":
        review_risks.append(f"M4A codec is {m4a.get('codec')}, expected AAC for listening copy.")
    if wav.get("durationSeconds") and m4a.get("durationSeconds"):
        spread = abs(float(wav["durationSeconds"]) - float(m4a["durationSeconds"]))
        if spread > 0.25:
            review_risks.append(f"WAV/M4A duration spread is {spread:.3f}s.")
        else:
            strengths.append(f"WAV/M4A duration spread is tight at {spread:.3f}s.")

    input_i = as_float(loud.get("input_i"))
    input_tp = as_float(loud.get("input_tp"))
    input_lra = as_float(loud.get("input_lra"))
    if not loud.get("available"):
        review_risks.append(f"loudnorm measurement unavailable: {loud.get('error')}")
    else:
        if input_i is not None and not (-20.0 <= input_i <= -12.0):
            hard_stops.append(f"Integrated loudness {input_i} LUFS is outside broad podcast sanity range -20 to -12.")
        elif input_i is not None and not (-17.5 <= input_i <= -14.5):
            review_risks.append(f"Integrated loudness {input_i} LUFS is outside preferred -17.5 to -14.5 window.")
        else:
            strengths.append(f"Integrated loudness {input_i} LUFS is in the preferred podcast window.")
        if input_tp is not None and input_tp > -0.1:
            hard_stops.append(f"True peak {input_tp} dBTP is near/over digital ceiling.")
        elif input_tp is not None and input_tp > -1.0:
            review_risks.append(f"True peak {input_tp} dBTP is hotter than preferred review margin.")
        else:
            strengths.append(f"True peak {input_tp} dBTP leaves headroom.")
        if input_lra is not None and input_lra > 18.0:
            review_risks.append(f"Loudness range {input_lra} LU may feel uneven for podcast delivery.")

    if silence.get("available"):
        longest = as_float(silence.get("longestSeconds")) or 0.0
        if longest > 120:
            hard_stops.append(f"Longest detected silence/gap is {longest:.1f}s.")
        elif longest > 20:
            review_risks.append(f"Longest detected silence/gap is {longest:.1f}s; verify intentional timing.")
        else:
            strengths.append(f"Longest detected silence/gap is {longest:.1f}s.")
    else:
        review_risks.append(f"silencedetect unavailable: {silence.get('error')}")

    if pcm.get("available"):
        balance = as_float(pcm.get("channelBalanceSpreadDb")) or 0.0
        if balance > 8:
            review_risks.append(f"Stereo channel RMS spread is {balance:.1f} dB; check mono compatibility/handoff.")
        else:
            strengths.append(f"Stereo channel RMS spread is {balance:.1f} dB.")
        near_clip = as_int(pcm.get("nearClipSampleCount"))
        if near_clip > 1000:
            review_risks.append(f"Near-clip sample count is {near_clip}; listen for limiter edge.")
        active_ratio = as_float(pcm.get("activeChunkRatio")) or 0.0
        if active_ratio < 0.25:
            hard_stops.append(f"Active audio chunk ratio is only {active_ratio:.2f}; possible missing speaker/audio.")
    else:
        review_risks.append(f"PCM WAV metrics unavailable: {pcm.get('error')}")

    if int(spine_gate.get("failCount") or 0) > 0:
        hard_stops.append(f"Spine quality gate has {spine_gate.get('failCount')} fail dimensions.")
    if not bool(spine_gate.get("machineReadyForHumanListen", True)):
        hard_stops.append("Spine quality gate is not machine-ready for human listen.")
    if quality_matrix and int(quality_matrix.get("hardStopCount") or 0) > 0:
        hard_stops.append(f"Quality methods matrix reports {quality_matrix.get('hardStopCount')} hard stops.")

    score = 100 - len(hard_stops) * 25 - len(review_risks) * 3
    score = max(0, min(100, score))
    if hard_stops:
        status = "machine-listen-sentinel-hard-stop"
    elif review_risks:
        status = "machine-listen-sentinel-ready-with-review-risks"
    else:
        status = "machine-listen-sentinel-clean-human-listen-required"
    return status, score, len(hard_stops), len(review_risks), hard_stops, review_risks + strengths[:8]


def file_fingerprint(path: str | None) -> dict[str, Any]:
    if not path or not Path(path).exists():
        return {"path": path, "exists": False}
    stat = Path(path).stat()
    return {"path": path, "exists": True, "sizeBytes": stat.st_size, "mtimeNs": stat.st_mtime_ns}


def cache_valid(report: dict[str, Any], master_wav_path: str | None, master_m4a_path: str | None) -> bool:
    if report.get("schema") != "quipsly.audio-workbench.machine-listen-sentinel.v1":
        return False
    cached = report.get("inputFingerprint") if isinstance(report.get("inputFingerprint"), dict) else {}
    current = {"masterWav": file_fingerprint(master_wav_path), "masterM4a": file_fingerprint(master_m4a_path)}
    return cached == current and bool(report.get("status"))


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    master_wav_path = output_path(outputs.get("masterWav"))
    master_m4a_path = output_path(outputs.get("masterM4a"))
    report: dict[str, Any] = {
        "schema": "quipsly.audio-workbench.machine-listen-sentinel.v1",
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "qualityTarget": "Episode 4 mastered audio spine",
        "finalEpisodeOrShortsGate": "downstream-after-human-listen-approval",
        "masterWavPath": master_wav_path,
        "masterM4aPath": master_m4a_path,
        "inputFingerprint": {"masterWav": file_fingerprint(master_wav_path), "masterM4a": file_fingerprint(master_m4a_path)},
        "masterWavProbe": ffprobe_audio(master_wav_path),
        "masterM4aProbe": ffprobe_audio(master_m4a_path),
        "loudnorm": measure_loudnorm(master_wav_path),
        "silence": measure_silence(master_wav_path),
        "pcmWavMetrics": pcm_wav_metrics(master_wav_path),
        "sourceReports": {
            "spineQualityGate": load_output_report(outputs, "latestAudioSpineQualityGate"),
            "qualityMethodsMatrix": load_output_report(outputs, "latestAudioQualityMethodsMatrix"),
            "sourceBalanceTriage": load_output_report(outputs, "latestAudioSourceBalanceTriage"),
            "morningPublicationReadiness": load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket"),
        },
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
    }
    status, score, hard_count, risk_count, hard_stops, findings = grade(report)
    report.update({
        "status": status,
        "score": score,
        "machineReadyForHumanListen": hard_count == 0,
        "humanListenRequired": str(manifest.get("approvalStatus") or "") != "human-approved-for-branch-inheritance",
        "publicationReady": False,
        "hardStopCount": hard_count,
        "reviewRiskCount": risk_count,
        "hardStops": hard_stops,
        "findings": findings,
        "metricCount": 6,
        "nextSafeAction": "Open the morning audio review launcher and listen to the spine; if it passes, record the guarded human listen decision before branch rendering." if hard_count == 0 else "Fix hard-stop audio findings before asking for human listen approval.",
    })
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Machine Listen Sentinel: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Status: `{report['status']}`",
        f"Score: `{report['score']}`",
        f"Quality target: `{report['qualityTarget']}`",
        f"Final episode/shorts gate: `{report['finalEpisodeOrShortsGate']}`",
        "",
        "This sentinel strengthens machine-side quality determination for the audio spine. It does not approve audio, unlock branches, render episode/short branches, upload, publish, or mutate source media.",
        "",
        "## Verdict",
        "",
        f"- Machine-ready for human listen: `{str(report['machineReadyForHumanListen']).lower()}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Publication ready: `{str(report['publicationReady']).lower()}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Next safe action: {report['nextSafeAction']}",
        "",
        "## Hard stops",
        "",
    ]
    if report["hardStops"]:
        lines.extend(f"- {item}" for item in report["hardStops"])
    else:
        lines.append("- none")
    lines.extend(["", "## Findings", ""])
    lines.extend(f"- {item}" for item in report["findings"][:24])
    lines.extend([
        "",
        "## Core metrics",
        "",
        f"- WAV probe: `{report['masterWavProbe']}`",
        f"- M4A probe: `{report['masterM4aProbe']}`",
        f"- Loudnorm: `{report['loudnorm']}`",
        f"- Silence: `{report['silence']}`",
        f"- PCM WAV metrics: `{report['pcmWavMetrics']}`",
        "",
        "## Safety",
        "",
    ])
    for key, value in report["safety"].items():
        lines.append(f"- {key}: `{str(value).lower()}`")
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any], markdown: str) -> str:
    hard = "".join(f"<li>{escape(item)}</li>" for item in report["hardStops"]) or "<li>none</li>"
    findings = "".join(f"<li>{escape(item)}</li>" for item in report["findings"][:24])
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Machine Listen Sentinel</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; background: #f7f1e4; color: #2c241b; }}
    .hero {{ background: linear-gradient(135deg, #183a2a, #755327); color: #fff8df; border-radius: 22px; padding: 22px; box-shadow: 0 18px 36px rgba(39, 31, 18, .18); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 14px; margin: 18px 0; }}
    .card {{ background: #fffdf7; border: 1px solid #dbc89e; border-radius: 18px; padding: 16px; }}
    .metric {{ font-size: 28px; font-weight: 900; }}
    code {{ background: #efe2c9; border-radius: 6px; padding: 2px 6px; }}
    pre {{ white-space: pre-wrap; background: #1f1913; color: #fff8e8; border-radius: 16px; padding: 16px; overflow: auto; }}
  </style>
</head>
<body>
  <div class=\"hero\">
    <h1>Machine Listen Sentinel</h1>
    <p><code>{escape(str(report['status']))}</code> score <strong>{report['score']}</strong></p>
    <p>{escape(report['nextSafeAction'])}</p>
  </div>
  <div class=\"grid\">
    <div class=\"card\"><div>Hard stops</div><div class=\"metric\">{report['hardStopCount']}</div></div>
    <div class=\"card\"><div>Review risks</div><div class=\"metric\">{report['reviewRiskCount']}</div></div>
    <div class=\"card\"><div>Machine-ready</div><div class=\"metric\">{str(report['machineReadyForHumanListen']).lower()}</div></div>
    <div class=\"card\"><div>Human listen</div><div class=\"metric\">{str(report['humanListenRequired']).lower()}</div></div>
  </div>
  <div class=\"card\"><h2>Hard stops</h2><ul>{hard}</ul></div>
  <div class=\"card\"><h2>Findings</h2><ul>{findings}</ul></div>
  <div class=\"card\"><h2>Full markdown</h2><pre>{escape(markdown)}</pre></div>
</body>
</html>
"""


def register(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_path: Path) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "openCommand": str(open_path),
        "generatedAt": report["generatedAt"],
        "status": report["status"],
    }
    outputs.setdefault("audioMachineListenSentinels", []).append(entry)
    outputs["latestAudioMachineListenSentinel"] = entry
    outputs["latestAudioMachineListenSentinelMarkdown"] = str(md_path)
    outputs["latestAudioMachineListenSentinelHtml"] = str(html_path)
    outputs["latestAudioMachineListenSentinelOpenCommand"] = str(open_path)
    manifest["audioMachineListenSentinelLatestStatus"] = report["status"]
    manifest["audioMachineListenSentinelScore"] = report["score"]
    manifest["audioMachineListenSentinelMetricCount"] = report["metricCount"]
    manifest["audioMachineListenSentinelHardStopCount"] = report["hardStopCount"]
    manifest["audioMachineListenSentinelReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioMachineListenSentinelMachineReadyForHumanListen"] = report["machineReadyForHumanListen"]
    manifest["audioMachineListenSentinelHumanListenRequired"] = report["humanListenRequired"]
    manifest["audioMachineListenSentinelPublicationReady"] = report["publicationReady"]
    for key, value in report["safety"].items():
        manifest["audioMachineListenSentinel" + key[:1].upper() + key[1:]] = value
    manifest["latestAudioMachineListenSentinelGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--force", action="store_true", help="Recompute full-file metrics instead of reusing the stable cache when source files are unchanged.")
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    master_wav_path = output_path(outputs.get("masterWav"))
    master_m4a_path = output_path(outputs.get("masterM4a"))
    generated_slug = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report_dir = baseline_dir / f"audio-machine-listen-sentinel-{slug}-{generated_slug}"
    report_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "AUDIO_MACHINE_LISTEN_SENTINEL.json"
    cached_report: dict[str, Any] | None = None
    if stable_json.exists() and not args.force:
        try:
            candidate = read_json(stable_json)
            if cache_valid(candidate, master_wav_path, master_m4a_path):
                cached_report = candidate
        except Exception:
            cached_report = None
    report = cached_report or build_report(baseline_dir)
    if cached_report:
        report = dict(report)
        report["cacheReused"] = True
        report["cacheReusedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    else:
        report["cacheReused"] = False
    markdown = render_markdown(report)
    html = render_html(report, markdown)
    json_path = report_dir / "machine-listen-sentinel.json"
    md_path = report_dir / "machine-listen-sentinel.md"
    html_path = report_dir / "machine-listen-sentinel.html"
    open_path = report_dir / "open-machine-listen-sentinel.command"
    stable_md = baseline_dir / "AUDIO_MACHINE_LISTEN_SENTINEL.md"
    stable_html = baseline_dir / "AUDIO_MACHINE_LISTEN_SENTINEL.html"
    stable_open = baseline_dir / "OPEN_AUDIO_MACHINE_LISTEN_SENTINEL.command"
    for path in (json_path, stable_json):
        write_json(path, report)
    for path in (md_path, stable_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (html_path, stable_html):
        path.write_text(html, encoding="utf-8")
    command = "#!/bin/zsh\nopen " + shell_quote(str(stable_html)) + "\n"
    for path in (open_path, stable_open):
        path.write_text(command, encoding="utf-8")
        os.chmod(path, 0o755)
    register(baseline_dir / "manifest.json", report, stable_json, stable_md, stable_html, stable_open)
    print(f"Wrote machine listen sentinel: {stable_html}")
    print(json.dumps({
        "status": report["status"],
        "score": report["score"],
        "hardStopCount": report["hardStopCount"],
        "reviewRiskCount": report["reviewRiskCount"],
        "machineReadyForHumanListen": report["machineReadyForHumanListen"],
        "humanListenRequired": report["humanListenRequired"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
