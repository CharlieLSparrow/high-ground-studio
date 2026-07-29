#!/usr/bin/env python3
"""Create a top-level quality gate for the current mastered audio spine.

This gate aggregates objective file checks and existing workbench evidence into
one decision surface. It does not approve audio, unlock branches, render media,
upload, publish, or mutate original/source media. Its job is to say whether the
spine is machine-ready for human listening and whether downstream episode/short
branches may inherit it after a guarded human pass.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
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


def load_report(outputs: dict[str, Any], key: str) -> tuple[str | None, dict[str, Any]]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return path, {}
    try:
        return path, read_json(Path(path))
    except json.JSONDecodeError:
        return path, {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def as_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number or number in (float("inf"), float("-inf")):
        return None
    return number


def as_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def ffprobe_audio(path: str | None) -> dict[str, Any]:
    if not path:
        return {"exists": False, "error": "missing path"}
    media = Path(path)
    if not media.exists():
        return {"exists": False, "path": path, "error": "file missing"}
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "a:0",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_name,sample_rate,channels,channel_layout,bits_per_sample",
        "-of",
        "json",
        str(media),
    ]
    try:
        raw = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT)
        payload = json.loads(raw)
    except FileNotFoundError:
        return {"exists": True, "path": path, "error": "ffprobe not found on PATH"}
    except subprocess.CalledProcessError as exc:
        return {"exists": True, "path": path, "error": exc.output.strip()[-1200:]}
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


def dimension(id_: str, label: str, status: str, score: int, evidence: list[str], risks: list[str], next_action: str) -> dict[str, Any]:
    return {
        "id": id_,
        "label": label,
        "status": status,
        "score": max(0, min(100, int(score))),
        "evidence": evidence,
        "risks": risks,
        "nextAction": next_action,
    }


def status_weight(status: str) -> int:
    if status in {"pass", "strong"}:
        return 0
    if status in {"attention", "needs-focused-proof", "human-listen-required"}:
        return 1
    return 2


def build_file_integrity(master_wav: dict[str, Any], master_m4a: dict[str, Any]) -> dict[str, Any]:
    risks: list[str] = []
    evidence = []
    for label, probe in (("WAV", master_wav), ("M4A", master_m4a)):
        evidence.append(f"{label}: exists={probe.get('exists')}, codec={probe.get('codec')}, sampleRate={probe.get('sampleRate')}, channels={probe.get('channels')}, duration={probe.get('durationSeconds')}s")
        if not probe.get("exists"):
            risks.append(f"{label} is missing.")
        if probe.get("error"):
            risks.append(f"{label} probe error: {probe.get('error')}")
        if probe.get("sampleRate") != 48000:
            risks.append(f"{label} sample rate is {probe.get('sampleRate')}, expected 48000.")
        if probe.get("channels") != 2:
            risks.append(f"{label} channel count is {probe.get('channels')}, expected stereo.")
    if master_wav.get("codec") != "pcm_s16le":
        risks.append(f"WAV codec is {master_wav.get('codec')}, expected pcm_s16le for Premiere/handoff stability.")
    if master_m4a.get("codec") != "aac":
        risks.append(f"M4A codec is {master_m4a.get('codec')}, expected AAC listening copy.")
    wav_dur = as_float(master_wav.get("durationSeconds"))
    m4a_dur = as_float(master_m4a.get("durationSeconds"))
    if wav_dur and m4a_dur:
        spread = abs(wav_dur - m4a_dur)
        evidence.append(f"WAV/M4A duration spread: {spread:.3f}s")
        if spread > 0.25:
            risks.append(f"WAV/M4A duration spread is {spread:.3f}s.")
    status = "pass" if not risks else "fail"
    return dimension("file-integrity", "File integrity and handoff shape", status, 100 if not risks else 45, evidence, risks, "Repair missing/probe/shape issues before any listening or branch work." if risks else "Use WAV for Premiere/manual edit, M4A for morning listening.")


def build_delivery_loudness(platform: dict[str, Any]) -> dict[str, Any]:
    summary = platform.get("summary") if isinstance(platform.get("summary"), dict) else {}
    hard = as_int(summary.get("hardGateAttentionCount"))
    advisory = as_int(summary.get("advisoryAttentionCount"))
    ready = bool(summary.get("podcastProfilesMachineReady"))
    evidence = [
        f"Podcast profiles machine-ready: {str(ready).lower()}",
        f"Hard-gate attention count: {hard}",
        f"Advisory attention count: {advisory}",
        "Reference: Apple-style podcast master target remains the Quipsly spine target; Spotify/YouTube-style loudness remains advisory for downstream video/social copies.",
    ]
    risks: list[str] = []
    if hard:
        risks.append(f"{hard} hard delivery loudness/true-peak attention item(s).")
    if not ready:
        risks.append("Podcast profiles are not machine-ready.")
    if advisory:
        risks.append(f"{advisory} advisory platform attention item(s).")
    if hard or not ready:
        return dimension("delivery-loudness", "Delivery loudness and peak discipline", "fail", 40, evidence, risks, "Fix hard loudness/peak issues before listening approval.")
    return dimension("delivery-loudness", "Delivery loudness and peak discipline", "pass" if advisory == 0 else "attention", 100 if advisory == 0 else 85, evidence, risks, "Keep the current master level unless human listening finds a real loudness problem.")


def build_broadcast_polish(broadcast: dict[str, Any]) -> dict[str, Any]:
    score = int(round(as_float(broadcast.get("overallScore")) or 0))
    status = str(broadcast.get("overallStatus") or "missing")
    risks: list[str] = []
    evidence = [f"Broadcast scorecard status: {status}", f"Overall score: {score}"]
    categories = broadcast.get("categories") if isinstance(broadcast.get("categories"), list) else []
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        evidence.append(f"{cat.get('label')}: {cat.get('status')} / {cat.get('score')}")
        for risk in cat.get("risks") or []:
            risks.append(str(risk))
    if not broadcast:
        return dimension("broadcast-polish", "Broadcast polish and smoothness", "fail", 0, ["Broadcast polish scorecard missing."], ["No broadcast polish evidence."], "Regenerate the broadcast polish scorecard.")
    if status == "strong" and score >= 90:
        gate_status = "pass"
    elif score >= 80:
        gate_status = "needs-focused-proof"
    else:
        gate_status = "fail"
    return dimension("broadcast-polish", "Broadcast polish and smoothness", gate_status, score, evidence[:12], risks[:12], "Listen to the smoothness/edge proof moments before approving the spine." if gate_status != "pass" else "No additional machine polish action before human listen.")


def build_speaker_survival(spine_sanity: dict[str, Any], producer: dict[str, Any]) -> dict[str, Any]:
    risks = [str(r) for r in producer.get("risks") or []]
    strengths = [str(s) for s in producer.get("strengths") or []]
    passed = bool(spine_sanity.get("passed"))
    evidence = [f"Spine sanity passed: {str(passed).lower()}", f"Producer status: {producer.get('status') or 'missing'}"] + strengths[:4]
    if not passed:
        return dimension("speaker-survival", "Charlie/Homer survival and source balance", "fail", 25, evidence, ["Spine sanity did not pass."] + risks[:6], "Do not approve until speaker survival is repaired and re-proved.")
    return dimension("speaker-survival", "Charlie/Homer survival and source balance", "attention" if risks else "pass", 82 if risks else 100, evidence, risks[:8], "Sample source-balance warnings and focused proof windows during the human listen." if risks else "No machine speaker-survival blocker.")


def build_reviewability(coverage: dict[str, Any], final_fast_pass: dict[str, Any], morning_launcher: dict[str, Any]) -> dict[str, Any]:
    missing = as_int(coverage.get("missingArtifactCount"))
    item_count = as_int(final_fast_pass.get("itemCount"))
    launcher_hard = as_int(morning_launcher.get("hardStopCount"))
    evidence = [
        f"Listen proof coverage status: {coverage.get('status') or 'missing'}",
        f"Missing listen-proof artifacts: {missing}",
        f"Final fast-pass items: {item_count}",
        f"Morning launcher hard stops: {launcher_hard}",
    ]
    risks: list[str] = []
    if missing:
        risks.append(f"{missing} listen-proof artifact(s) missing.")
    if item_count <= 0:
        risks.append("Final fast-pass item count is zero or missing.")
    if launcher_hard:
        risks.append(f"Morning launcher has {launcher_hard} hard stop(s).")
    return dimension("reviewability", "Human/agent reviewability", "pass" if not risks else "fail", 100 if not risks else 35, evidence, risks, "Open the morning review launcher and record the guarded human listen decision." if not risks else "Repair review surfaces before asking a tired human to listen.")


def build_branch_truth(manifest: dict[str, Any], runway: dict[str, Any]) -> dict[str, Any]:
    approval = str(manifest.get("approvalStatus") or "unknown")
    inheritance = bool(manifest.get("branchInheritanceReady"))
    render = bool(manifest.get("branchRenderReady"))
    episode_gate = ((runway.get("qualityGates") or {}).get("finalEpisode") or {}).get("status") if isinstance(runway.get("qualityGates"), dict) else None
    shorts_gate = ((runway.get("qualityGates") or {}).get("shorts") or {}).get("status") if isinstance(runway.get("qualityGates"), dict) else None
    evidence = [
        f"Approval status: {approval}",
        f"Branch inheritance ready: {str(inheritance).lower()}",
        f"Branch render ready: {str(render).lower()}",
        f"Final episode gate: {episode_gate}",
        f"Shorts gate: {shorts_gate}",
    ]
    risks: list[str] = []
    if approval != "machine-candidate-needs-human-listen-proof":
        risks.append("Approval status is no longer the expected pending-human-listen state; verify before using this gate.")
    if inheritance or render:
        risks.append("A branch gate is already unlocked; verify human approval evidence before rendering.")
    return dimension("branch-truth", "Branch inheritance and publication truth", "human-listen-required" if not risks else "attention", 90 if not risks else 65, evidence, risks, "Keep final episode and shorts locked until the guarded listen decision records a pass.")


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    master_wav = ffprobe_audio(output_path(outputs.get("masterWav")))
    master_m4a = ffprobe_audio(output_path(outputs.get("masterM4a")))
    _, platform = load_report(outputs, "latestAudioPlatformLoudnessAudit")
    _, broadcast = load_report(outputs, "latestAudioBroadcastPolishScorecard")
    _, producer = load_report(outputs, "latestAudioProducerGradeAudit")
    _, spine_sanity = load_report(outputs, "latestAudioSpineListenSanityCheck")
    _, coverage = load_report(outputs, "latestAudioListenProofCoverageMap")
    _, final_fast_pass = load_report(outputs, "latestAudioFinalListenFastPass")
    _, morning_launcher = load_report(outputs, "latestAudioMorningAudioReviewLauncher")
    _, runway = load_report(outputs, "latestAudioPostListenEpisodeRunway")

    dimensions = [
        build_file_integrity(master_wav, master_m4a),
        build_delivery_loudness(platform),
        build_broadcast_polish(broadcast),
        build_speaker_survival(spine_sanity, producer),
        build_reviewability(coverage, final_fast_pass, morning_launcher),
        build_branch_truth(manifest, runway),
    ]
    fail_count = sum(1 for d in dimensions if status_weight(d["status"]) >= 2)
    attention_count = sum(1 for d in dimensions if status_weight(d["status"]) == 1)
    pass_count = sum(1 for d in dimensions if status_weight(d["status"]) == 0)
    score = round(sum(int(d["score"]) for d in dimensions) / max(1, len(dimensions)), 1)
    human_required = str(manifest.get("approvalStatus") or "") != "human-approved-for-branch-inheritance"
    machine_ready = fail_count == 0 and bool(manifest.get("packageReadyForHumanListen"))
    if fail_count:
        status = "machine-attention-required"
    elif human_required:
        status = "machine-ready-human-listen-required"
    else:
        status = "human-approved-audio-spine-ready-for-branch-inheritance"

    return {
        "schema": "quipsly.audio-workbench.spine-quality-gate.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "machineReadyForHumanListen": machine_ready,
        "humanListenRequired": human_required,
        "publicationReady": False if human_required else machine_ready,
        "score": score,
        "dimensionCount": len(dimensions),
        "passCount": pass_count,
        "attentionCount": attention_count,
        "failCount": fail_count,
        "reviewRiskCount": sum(len(d.get("risks") or []) for d in dimensions),
        "dimensions": dimensions,
        "masterWav": master_wav,
        "masterM4a": master_m4a,
        "nextSafeAction": "Listen to the v006 spine and record a guarded human decision; if it fails, route exact notes into scoped v007 repair planning." if fail_count == 0 else "Fix machine attention failures before asking for final listen approval.",
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Audio Spine Quality Gate",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Status: `{report['status']}`",
        f"Score: `{report['score']}`",
        "",
        "This gate answers a narrow question: is the current mastered audio spine safe enough for human listening and downstream inheritance after approval? It does not approve audio, render branches, upload, publish, or mutate originals.",
        "",
        "## Summary",
        "",
        f"- Machine-ready for human listen: `{str(report['machineReadyForHumanListen']).lower()}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Publication ready: `{str(report['publicationReady']).lower()}`",
        f"- Pass/attention/fail: `{report['passCount']}` / `{report['attentionCount']}` / `{report['failCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Next safe action: {report['nextSafeAction']}",
        "",
        "## Dimensions",
        "",
        "| Dimension | Status | Score | Evidence | Risks |",
        "|---|---|---:|---|---|",
    ]
    for item in report["dimensions"]:
        evidence = "<br>".join(item.get("evidence") or []) or "none"
        risks = "<br>".join(item.get("risks") or []) or "none"
        lines.append(f"| {item['label']} | `{item['status']}` | {item['score']} | {evidence} | {risks} |")
    lines.extend([
        "",
        "## Safety",
        "",
    ])
    for key, value in report["safety"].items():
        lines.append(f"- {key}: `{str(value).lower()}`")
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown: str) -> str:
    rows = []
    for item in report["dimensions"]:
        risks = item.get("risks") or []
        rows.append(
            "<tr>"
            f"<td>{escape(item['label'])}</td>"
            f"<td><code>{escape(item['status'])}</code></td>"
            f"<td>{item['score']}</td>"
            f"<td>{escape(item['nextAction'])}</td>"
            f"<td>{escape('; '.join(risks) if risks else 'none')}</td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episode 4 Audio Spine Quality Gate</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; background: #fbf7ee; color: #30261d; }}
    .card {{ background: #fffdf7; border: 1px solid #dccaa9; border-radius: 18px; padding: 18px; margin: 18px 0; box-shadow: 0 12px 28px rgba(66, 45, 22, .08); }}
    .pill {{ display: inline-block; padding: 7px 12px; border-radius: 999px; background: #e7f4d9; color: #265d2d; font-weight: 800; margin-right: 8px; }}
    .warn {{ background: #fff2c4; color: #6d4d00; }}
    table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 14px; overflow: hidden; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid #eee1cd; text-align: left; vertical-align: top; }}
    th {{ background: #efe2c9; color: #4a3727; }}
    code {{ background: #f1e7d5; padding: 2px 6px; border-radius: 5px; }}
    pre {{ white-space: pre-wrap; background: #211b16; color: #fff8e8; padding: 16px; border-radius: 14px; overflow: auto; }}
  </style>
</head>
<body>
  <h1>Episode 4 Audio Spine Quality Gate</h1>
  <div class=\"card\">
    <span class=\"pill\">{escape(report['status'])}</span>
    <span class=\"pill\">score {report['score']}</span>
    <span class=\"pill warn\">human listen required: {str(report['humanListenRequired']).lower()}</span>
    <p>{escape(report['nextSafeAction'])}</p>
  </div>
  <table>
    <thead><tr><th>Dimension</th><th>Status</th><th>Score</th><th>Next action</th><th>Risks</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
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
    history = outputs.setdefault("audioSpineQualityGates", [])
    history.append(entry)
    outputs["latestAudioSpineQualityGate"] = entry
    outputs["latestAudioSpineQualityGateMarkdown"] = str(md_path)
    outputs["latestAudioSpineQualityGateHtml"] = str(html_path)
    outputs["latestAudioSpineQualityGateOpenCommand"] = str(open_path)

    manifest["audioSpineQualityGateLatestStatus"] = report["status"]
    manifest["audioSpineQualityGateScore"] = report["score"]
    manifest["audioSpineQualityGateDimensionCount"] = report["dimensionCount"]
    manifest["audioSpineQualityGatePassCount"] = report["passCount"]
    manifest["audioSpineQualityGateAttentionCount"] = report["attentionCount"]
    manifest["audioSpineQualityGateFailCount"] = report["failCount"]
    manifest["audioSpineQualityGateReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioSpineQualityGateMachineReadyForHumanListen"] = report["machineReadyForHumanListen"]
    manifest["audioSpineQualityGateHumanListenRequired"] = report["humanListenRequired"]
    manifest["audioSpineQualityGatePublicationReady"] = report["publicationReady"]
    for key, value in report["safety"].items():
        manifest["audioSpineQualityGate" + key[:1].upper() + key[1:]] = value
    manifest["latestAudioSpineQualityGateGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report_dir = baseline_dir / f"audio-spine-quality-gate-{slug}-{generated_at}"
    report_dir.mkdir(parents=True, exist_ok=True)

    report = build_report(manifest, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html = render_html(report, markdown)

    json_path = report_dir / "audio-spine-quality-gate.json"
    md_path = report_dir / "audio-spine-quality-gate.md"
    html_path = report_dir / "audio-spine-quality-gate.html"
    open_path = report_dir / "open-audio-spine-quality-gate.command"
    stable_json = baseline_dir / "AUDIO_SPINE_QUALITY_GATE.json"
    stable_md = baseline_dir / "AUDIO_SPINE_QUALITY_GATE.md"
    stable_html = baseline_dir / "AUDIO_SPINE_QUALITY_GATE.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SPINE_QUALITY_GATE.command"

    for path in (json_path, stable_json):
        write_json(path, report)
    for path in (md_path, stable_md):
        path.write_text(markdown + "\n", encoding="utf-8")
    for path in (html_path, stable_html):
        path.write_text(html, encoding="utf-8")
    command = "#!/bin/zsh\nopen " + shell_quote(str(stable_html)) + "\n"
    for path in (open_path, stable_open):
        path.write_text(command, encoding="utf-8")
        os.chmod(path, 0o755)

    register(manifest_path, report, stable_json, stable_md, stable_html, stable_open)
    print(f"Wrote audio spine quality gate: {stable_html}")
    print(json.dumps({
        "status": report["status"],
        "score": report["score"],
        "passCount": report["passCount"],
        "attentionCount": report["attentionCount"],
        "failCount": report["failCount"],
        "machineReadyForHumanListen": report["machineReadyForHumanListen"],
        "humanListenRequired": report["humanListenRequired"],
        "publicationReady": report["publicationReady"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
