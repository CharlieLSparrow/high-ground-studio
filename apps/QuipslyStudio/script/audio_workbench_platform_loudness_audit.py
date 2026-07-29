#!/usr/bin/env python3
"""Audit platform loudness readiness for a Quipsly audio baseline.

This is a delivery-readiness surface, not an approval tool. It reads the
current baseline manifest and QC report, compares the mastered audio to
platform/reference loudness profiles, and writes JSON/Markdown/HTML evidence.
It does not normalize audio, approve audio, render branches, upload files, or
mutate original media.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PlatformProfile:
    id: str
    label: str
    target_lufs: float
    tolerance_lu: float
    true_peak_max_dbfs: float
    hard_gate: bool
    audience: str
    source_note: str
    source_url: str | None


PROFILES = [
    PlatformProfile(
        id="apple-podcasts-rss-audio",
        label="Apple Podcasts RSS audio",
        target_lufs=-16.0,
        tolerance_lu=1.0,
        true_peak_max_dbfs=-1.0,
        hard_gate=True,
        audience="Podcast RSS / Apple Podcasts delivery copy",
        source_note="Apple recommends podcast loudness around -16 dB LKFS (+/- 1 dB) and true peak not exceeding -1 dB FS before encoding.",
        source_url="https://podcasters.apple.com/support/893-audio-requirements",
    ),
    PlatformProfile(
        id="spotify-playback-reference",
        label="Spotify playback reference",
        target_lufs=-14.0,
        tolerance_lu=2.0,
        true_peak_max_dbfs=-1.0,
        hard_gate=False,
        audience="Spotify playback normalization reference, not a podcast-host approval gate",
        source_note="Spotify normalizes playback to -14 LUFS and recommends masters target -14 LUFS with true peak below -1 dB TP; louder masters should keep true peak below -2 dB TP.",
        source_url="https://support.spotify.com/us/artists/article/loudness-normalization/",
    ),
    PlatformProfile(
        id="quipsly-podcast-master",
        label="Quipsly podcast master",
        target_lufs=-16.0,
        tolerance_lu=1.0,
        true_peak_max_dbfs=-1.0,
        hard_gate=True,
        audience="Canonical long-form podcast spine for Premiere, Tower, RSS, and future episode branches",
        source_note="Internal Quipsly profile intentionally follows Apple-style spoken-word podcast loudness so the master is predictable and not overcooked.",
        source_url=None,
    ),
    PlatformProfile(
        id="quipsly-video-social-reference",
        label="Quipsly video/social reference",
        target_lufs=-14.0,
        tolerance_lu=3.0,
        true_peak_max_dbfs=-1.0,
        hard_gate=False,
        audience="YouTube/social video reference; advisory because official platform playback behavior varies",
        source_note="Use this as an editorial reference for video/social exports, not as a fake universal YouTube/Facebook/Instagram requirement.",
        source_url=None,
    ),
]


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def rounded(value: Any, digits: int = 2) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, digits)


def ffprobe_audio(path: str | None) -> dict[str, Any]:
    if not path:
        return {"exists": False, "error": "missing path"}
    media_path = Path(path)
    if not media_path.exists():
        return {"exists": False, "path": path, "error": "file missing"}
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_name,codec_type,sample_rate,channels,channel_layout,bits_per_sample",
        "-of",
        "json",
        str(media_path),
    ]
    try:
        raw = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
        payload = json.loads(raw)
    except FileNotFoundError:
        return {"exists": True, "path": path, "error": "ffprobe not found on PATH"}
    except subprocess.CalledProcessError as exc:
        return {"exists": True, "path": path, "error": exc.output.strip()}
    except json.JSONDecodeError as exc:
        return {"exists": True, "path": path, "error": f"ffprobe JSON decode failed: {exc}"}
    streams = payload.get("streams") or []
    stream = streams[0] if streams else {}
    fmt = payload.get("format") or {}
    return {
        "exists": True,
        "path": path,
        "sizeBytes": media_path.stat().st_size,
        "durationSeconds": rounded(fmt.get("duration"), 3),
        "bitRate": int(fmt["bit_rate"]) if str(fmt.get("bit_rate") or "").isdigit() else None,
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream["sample_rate"]) if str(stream.get("sample_rate") or "").isdigit() else None,
        "channels": stream.get("channels"),
        "channelLayout": stream.get("channel_layout"),
        "bitsPerSample": stream.get("bits_per_sample"),
        "error": None,
    }


def artifact_metrics(name: str, path: str | None, qc_artifact: dict[str, Any]) -> dict[str, Any]:
    loudness = qc_artifact.get("loudness") if isinstance(qc_artifact.get("loudness"), dict) else {}
    volume = qc_artifact.get("volume") if isinstance(qc_artifact.get("volume"), dict) else {}
    probe = ffprobe_audio(path)
    true_peak = rounded(loudness.get("truePeakDbfs"), 2)
    if true_peak is None:
        true_peak = rounded(volume.get("maxVolumeDb"), 2)
    return {
        "name": name,
        "path": path,
        "exists": bool(path and Path(path).exists()),
        "durationSeconds": probe.get("durationSeconds") if probe.get("durationSeconds") is not None else rounded(qc_artifact.get("durationSeconds"), 3),
        "sampleRate": probe.get("sampleRate"),
        "channels": probe.get("channels"),
        "channelLayout": probe.get("channelLayout"),
        "codec": probe.get("codec"),
        "bitRate": probe.get("bitRate"),
        "integratedLufs": rounded(loudness.get("integratedLufs"), 2),
        "loudnessRangeLu": rounded(loudness.get("loudnessRangeLu"), 2),
        "truePeakDbfs": true_peak,
        "meanVolumeDb": rounded(volume.get("meanVolumeDb"), 2),
        "maxVolumeDb": rounded(volume.get("maxVolumeDb"), 2),
        "qcWarnings": qc_artifact.get("warnings") or [],
        "probe": probe,
    }


def evaluate_profile(metrics: dict[str, Any], profile: PlatformProfile) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    warnings: list[str] = []
    advisories: list[str] = []
    integrated = metrics.get("integratedLufs")
    true_peak = metrics.get("truePeakDbfs")
    sample_rate = metrics.get("sampleRate")
    channels = metrics.get("channels")

    if integrated is None:
        checks.append({"id": "integrated-loudness", "status": "attention", "message": "Integrated LUFS missing from QC report."})
    else:
        delta = round(float(integrated) - profile.target_lufs, 2)
        in_range = abs(delta) <= profile.tolerance_lu
        checks.append(
            {
                "id": "integrated-loudness",
                "status": "pass" if in_range else "attention",
                "measured": integrated,
                "target": profile.target_lufs,
                "toleranceLu": profile.tolerance_lu,
                "deltaLu": delta,
                "message": f"Measured {integrated} LUFS, target {profile.target_lufs} LUFS, delta {delta:+.2f} LU.",
            }
        )
        if not in_range:
            warnings.append(f"Integrated loudness is {delta:+.2f} LU away from {profile.label} target.")

    if true_peak is None:
        checks.append({"id": "true-peak", "status": "attention", "message": "True peak missing from QC report."})
    else:
        headroom = round(profile.true_peak_max_dbfs - float(true_peak), 2)
        peak_ok = float(true_peak) <= profile.true_peak_max_dbfs
        checks.append(
            {
                "id": "true-peak",
                "status": "pass" if peak_ok else "attention",
                "measured": true_peak,
                "maxAllowed": profile.true_peak_max_dbfs,
                "headroomDb": headroom,
                "message": f"Measured {true_peak} dBFS true peak against max {profile.true_peak_max_dbfs} dBFS.",
            }
        )
        if not peak_ok:
            warnings.append(f"True peak is above {profile.label} max by {abs(headroom):.2f} dB.")
        elif headroom < 0.5:
            advisories.append(f"True peak passes but has only {headroom:.2f} dB headroom; watch encoded copies for intersample/codec changes.")

    if profile.id == "spotify-playback-reference" and integrated is not None and true_peak is not None:
        if float(integrated) > -14.0 and float(true_peak) > -2.0:
            warnings.append("Spotify warns louder-than--14 LUFS masters should keep true peak below -2 dB TP to reduce lossy-encoding distortion risk.")

    if sample_rate is not None and sample_rate not in (44100, 48000):
        advisories.append(f"Sample rate is {sample_rate} Hz. For podcast/video delivery, 44.1 kHz or 48 kHz is the normal target.")
    if channels is not None and channels not in (1, 2):
        advisories.append(f"Channel count is {channels}. Spoken-word delivery usually expects mono or stereo.")

    hard_attention = any(check["status"] == "attention" for check in checks)
    if hard_attention and profile.hard_gate:
        status = "attention"
    elif hard_attention:
        status = "advisory"
    else:
        status = "pass" if profile.hard_gate else "advisory-pass"

    if warnings:
        safe_next = "Do not use this profile as delivery-ready until the warning is reviewed or a new master is rendered."
    elif profile.hard_gate:
        safe_next = "This profile is machine-ready; human listen approval is still required before branch inheritance or publication."
    else:
        safe_next = "Use as advisory platform evidence; do not treat this as external publication approval."

    return {
        "profileId": profile.id,
        "label": profile.label,
        "status": status,
        "hardGate": profile.hard_gate,
        "audience": profile.audience,
        "sourceNote": profile.source_note,
        "sourceUrl": profile.source_url,
        "checks": checks,
        "warnings": warnings,
        "advisories": advisories,
        "safeNextAction": safe_next,
    }


def build_artifact_results(metrics: dict[str, Any]) -> dict[str, Any]:
    return {
        "metrics": metrics,
        "profileResults": [evaluate_profile(metrics, profile) for profile in PROFILES],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Platform Loudness Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is machine delivery evidence only. It does not approve audio, render branches, upload files, publish, or mutate source media.",
        "",
        "## Guardrails",
        "",
        f"- Publication approved: `{str(report['publicationApproved']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Downstream truth",
        "",
        f"- Current gate: `{report['downstreamTruth']['currentGate']}`",
        f"- Final episode gate: `{report['downstreamTruth']['finalEpisodeGate']}`",
        f"- Shorts gate: `{report['downstreamTruth']['shortsGate']}`",
        f"- Meaning: {report['downstreamTruth']['meaning']}",
        "",
        "## Summary",
        "",
        f"- Hard-gate attention count: `{report['summary']['hardGateAttentionCount']}`",
        f"- Advisory attention count: `{report['summary']['advisoryAttentionCount']}`",
        f"- Machine delivery ready for podcast-profile review: `{str(report['summary']['podcastProfilesMachineReady']).lower()}`",
        "",
        "## Artifact metrics",
        "",
        "| Artifact | LUFS | LRA | True peak | Duration | Sample rate | Channels | Codec |",
        "|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for artifact_name, artifact in report["artifacts"].items():
        metrics = artifact["metrics"]
        lines.append(
            f"| {artifact_name} | `{metrics.get('integratedLufs')}` | `{metrics.get('loudnessRangeLu')}` | `{metrics.get('truePeakDbfs')}` | `{metrics.get('durationSeconds')}` | `{metrics.get('sampleRate')}` | `{metrics.get('channels')}` | `{metrics.get('codec')}` |"
        )
    lines.extend(["", "## Platform profile results", ""])
    for artifact_name, artifact in report["artifacts"].items():
        lines.extend([f"### {artifact_name}", ""])
        lines.append("| Profile | Status | Checks | Warnings/advisories | Next safe action |")
        lines.append("|---|---:|---|---|---|")
        for result in artifact["profileResults"]:
            checks = "<br>".join(check.get("message", check["id"]) for check in result["checks"])
            notes = "<br>".join(result["warnings"] + result["advisories"]) or "No profile warnings."
            lines.append(
                f"| {result['label']} | `{result['status']}` | {checks} | {notes} | {result['safeNextAction']} |"
            )
        lines.append("")
    lines.extend(
        [
            "## Source references",
            "",
            "- Apple Podcasts audio requirements: https://podcasters.apple.com/support/893-audio-requirements",
            "- Spotify loudness normalization: https://support.spotify.com/us/artists/article/loudness-normalization/",
            "- YouTube/social profile is Quipsly advisory, not an official universal hard gate.",
            "",
            "## Next safest step",
            "",
            report["nextSafestStep"],
            "",
        ]
    )
    return "\n".join(lines)


def result_class(status: str) -> str:
    if status == "pass" or status == "advisory-pass":
        return "pass"
    if status == "attention":
        return "attention"
    return "advisory"


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for artifact_name, artifact in report["artifacts"].items():
        metrics = artifact["metrics"]
        result_items = []
        for result in artifact["profileResults"]:
            checks = "".join(f"<li>{escape(str(check.get('message', check['id'])))}</li>" for check in result["checks"])
            notes = result["warnings"] + result["advisories"]
            notes_html = "".join(f"<li>{escape(note)}</li>" for note in notes) or "<li>No profile warnings.</li>"
            result_items.append(
                f"""
                <section class=\"profile {result_class(str(result['status']))}\">
                  <h3>{escape(str(result['label']))}</h3>
                  <p><strong>Status:</strong> {escape(str(result['status']))} <span>{'hard gate' if result['hardGate'] else 'advisory'}</span></p>
                  <p>{escape(str(result['audience']))}</p>
                  <ul>{checks}</ul>
                  <ul>{notes_html}</ul>
                  <p class=\"next\">{escape(str(result['safeNextAction']))}</p>
                </section>
                """
            )
        cards.append(
            f"""
            <article class=\"artifact\">
              <h2>{escape(artifact_name)}</h2>
              <div class=\"metrics\">
                <span>LUFS <b>{escape(str(metrics.get('integratedLufs')))}</b></span>
                <span>LRA <b>{escape(str(metrics.get('loudnessRangeLu')))}</b></span>
                <span>True peak <b>{escape(str(metrics.get('truePeakDbfs')))}</b></span>
                <span>Duration <b>{escape(str(metrics.get('durationSeconds')))}</b></span>
                <span>Sample rate <b>{escape(str(metrics.get('sampleRate')))}</b></span>
                <span>Channels <b>{escape(str(metrics.get('channels')))}</b></span>
              </div>
              <p class=\"path\">{escape(str(metrics.get('path')))}</p>
              {''.join(result_items)}
            </article>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\">
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
<title>Quipsly Platform Loudness Audit</title>
<style>
:root {{ color-scheme: dark; --bg:#101713; --panel:#18251f; --panel2:#20362a; --ink:#f5ecd8; --muted:#b9ad93; --gold:#f4ca42; --green:#69d37b; --clay:#d56b4b; --blue:#59b8d8; --line:rgba(245,236,216,.16); }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next","Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at 15% 5%,rgba(105,211,123,.18),transparent 28rem),radial-gradient(circle at 90% 10%,rgba(244,202,66,.12),transparent 24rem),var(--bg); }}
main {{ max-width:1180px; margin:0 auto; padding:32px; }}
header,.artifact {{ border:1px solid var(--line); background:rgba(24,37,31,.9); border-radius:28px; padding:24px; margin-bottom:18px; box-shadow:0 24px 70px rgba(0,0,0,.22); }}
h1 {{ font-size:clamp(34px,5vw,62px); line-height:.96; letter-spacing:-.05em; margin:0 0 10px; }}
h2 {{ color:var(--gold); letter-spacing:.08em; text-transform:uppercase; font-size:14px; }}
.truth,.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:18px 0; }}
.truth span,.metrics span {{ background:var(--panel2); border:1px solid var(--line); border-radius:16px; padding:10px 12px; color:var(--muted); }}
b {{ color:var(--ink); display:block; font-size:19px; }}
.profile {{ border:1px solid var(--line); border-radius:20px; padding:16px; margin:14px 0; background:rgba(0,0,0,.18); }}
.profile.pass {{ border-color:rgba(105,211,123,.45); }} .profile.attention {{ border-color:rgba(213,107,75,.65); }} .profile.advisory {{ border-color:rgba(89,184,216,.45); }}
.profile h3 {{ margin:0 0 6px; }} .profile p {{ color:var(--muted); }} .next {{ color:var(--ink)!important; }}
.path {{ color:var(--muted); word-break:break-all; font-size:12px; }}
a {{ color:var(--gold); }}
</style>
</head>
<body>
<main>
<header>
  <h1>Platform loudness audit</h1>
  <p>Machine delivery evidence for <strong>{escape(str(report['baselineId']))}</strong>. This does not approve, publish, render, or mutate anything.</p>
  <div class=\"truth\">
    <span>Human listen required <b>{escape(str(report['humanListenStillRequired']).lower())}</b></span>
    <span>Hard-gate attention <b>{escape(str(report['summary']['hardGateAttentionCount']))}</b></span>
    <span>Advisory attention <b>{escape(str(report['summary']['advisoryAttentionCount']))}</b></span>
    <span>Podcast machine ready <b>{escape(str(report['summary']['podcastProfilesMachineReady']).lower())}</b></span>
    <span>Episode/shorts gate <b>{escape(str(report['downstreamTruth']['finalEpisodeGate']))}</b></span>
  </div>
  <p>{escape(str(report['downstreamTruth']['meaning']))}</p>
</header>
{''.join(cards)}
<footer>
<p>Sources: <a href=\"https://podcasters.apple.com/support/893-audio-requirements\">Apple Podcasts audio requirements</a> and <a href=\"https://support.spotify.com/us/artists/article/loudness-normalization/\">Spotify loudness normalization</a>. YouTube/social profile is advisory.</p>
</footer>
</main>
</body>
</html>
"""


def build_report(baseline_dir: Path, manifest: dict[str, Any], quality_report: dict[str, Any], generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    artifacts = quality_report.get("artifacts") if isinstance(quality_report.get("artifacts"), dict) else {}
    artifact_payloads: dict[str, Any] = {}
    for key, label in [("masterWav", "Master WAV"), ("masterM4a", "Listening M4A")]:
        path = output_path(outputs.get(key))
        qc_artifact = artifacts.get(key) if isinstance(artifacts.get(key), dict) else {}
        metrics = artifact_metrics(label, path, qc_artifact)
        artifact_payloads[label] = build_artifact_results(metrics)

    hard_attention = 0
    advisory_attention = 0
    podcast_ready = True
    for artifact in artifact_payloads.values():
        for result in artifact["profileResults"]:
            has_attention = result["status"] == "attention"
            if result["hardGate"] and has_attention:
                hard_attention += 1
            if not result["hardGate"] and (has_attention or result["status"] == "advisory"):
                advisory_attention += 1
            if result["profileId"] in ("apple-podcasts-rss-audio", "quipsly-podcast-master") and has_attention:
                podcast_ready = False

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "generatedAtSlug": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "humanListenStillRequired": manifest.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "publicationApproved": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "downstreamTruth": {
            "currentGate": "high-quality audio spine human listen",
            "finalEpisodeGate": "locked-until-audio-spine-approved",
            "shortsGate": "locked-until-audio-spine-approved",
            "meaning": "Platform loudness evidence is necessary delivery evidence, not proof that a final episode, podcast RSS file, or short is approved.",
        },
        "sourceQualityReport": output_path(outputs.get("qualityReport")),
        "artifacts": artifact_payloads,
        "summary": {
            "hardGateAttentionCount": hard_attention,
            "advisoryAttentionCount": advisory_attention,
            "podcastProfilesMachineReady": podcast_ready,
            "artifactCount": len(artifact_payloads),
        },
        "nextSafestStep": "If podcast profiles pass, use this as machine delivery evidence inside the human-listen packet. Do not unlock branch inheritance or publish until a human listen decision is explicitly recorded.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    quality_path = output_path(outputs.get("qualityReport"))
    if not quality_path or not Path(quality_path).exists():
        raise SystemExit("Missing qualityReport in manifest outputs. Run audio_workbench_qc.py before platform loudness audit.")
    quality_report = read_json(Path(quality_path))

    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = baseline_dir / f"audio-platform-loudness-audit-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=False)

    report = build_report(baseline_dir, manifest, quality_report, generated_at)
    json_path = out_dir / "platform-loudness-audit.json"
    md_path = out_dir / "platform-loudness-audit.md"
    html_path = out_dir / "platform-loudness-audit.html"
    command_path = out_dir / "open-platform-loudness-audit.command"

    write_json(json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report), encoding="utf-8")
    command_path.write_text(f"#!/bin/zsh\nset -e\nopen {shell_quote(str(html_path))}\n", encoding="utf-8")
    os.chmod(command_path, 0o755)

    outputs["latestAudioPlatformLoudnessAudit"] = str(json_path)
    outputs["latestAudioPlatformLoudnessAuditMarkdown"] = str(md_path)
    outputs["latestAudioPlatformLoudnessAuditHtml"] = str(html_path)
    outputs["latestAudioPlatformLoudnessAuditOpenCommand"] = str(command_path)
    for key, value in [
        ("audioPlatformLoudnessAuditHistory", str(json_path)),
        ("audioPlatformLoudnessAuditMarkdownHistory", str(md_path)),
        ("audioPlatformLoudnessAuditHtmlHistory", str(html_path)),
        ("audioPlatformLoudnessAuditOpenCommandHistory", str(command_path)),
    ]:
        history = outputs.setdefault(key, [])
        if value not in history:
            history.append(value)
    manifest["latestAudioPlatformLoudnessAuditGeneratedAt"] = report["generatedAt"]
    manifest["audioPlatformLoudnessHardGateAttentionCount"] = report["summary"]["hardGateAttentionCount"]
    manifest["audioPlatformLoudnessAdvisoryAttentionCount"] = report["summary"]["advisoryAttentionCount"]
    manifest["audioPlatformLoudnessPodcastProfilesMachineReady"] = report["summary"]["podcastProfilesMachineReady"]
    manifest["audioPlatformLoudnessApprovalStateChanged"] = report["approvalStateChanged"]
    manifest["audioPlatformLoudnessBranchStateChanged"] = report["branchStateChanged"]
    manifest["audioPlatformLoudnessRenderAttempted"] = report["renderAttempted"]
    manifest["audioPlatformLoudnessBranchRenderAttempted"] = report["branchRenderAttempted"]
    manifest["audioPlatformLoudnessUploadAttempted"] = report["uploadAttempted"]
    manifest["audioPlatformLoudnessPublicationAttempted"] = report["publicationAttempted"]
    manifest["audioPlatformLoudnessOriginalMediaMutated"] = report["originalMediaMutated"]
    manifest["audioPlatformLoudnessDownstreamFinalEpisodeGate"] = report["downstreamTruth"]["finalEpisodeGate"]
    manifest["audioPlatformLoudnessDownstreamShortsGate"] = report["downstreamTruth"]["shortsGate"]
    write_json(manifest_path, manifest)

    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(f"Wrote {html_path}")
    print(f"Open with {command_path}")
    print(
        "summary",
        json.dumps(report["summary"], sort_keys=True),
    )


if __name__ == "__main__":
    main()
