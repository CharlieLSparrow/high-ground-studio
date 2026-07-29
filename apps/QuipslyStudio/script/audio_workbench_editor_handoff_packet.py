#!/usr/bin/env python3
"""Create a portable editor handoff packet for the mastered audio spine.

This packet is for humans and outside editors such as Premiere. It does not
approve the audio, render branches, copy huge media, or mutate source files. It
fingerprints the current WAV/M4A, records import guidance, and keeps the
machine-candidate approval status visible next to the file paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def ffprobe_audio(path: Path) -> dict[str, Any]:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_format",
            "-show_streams",
            "-of",
            "json",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return {
            "path": str(path),
            "exists": path.exists(),
            "ok": False,
            "error": proc.stderr.strip() or proc.stdout.strip(),
        }
    data = json.loads(proc.stdout)
    stream = next((item for item in data.get("streams", []) if item.get("codec_type") == "audio"), {})
    fmt = data.get("format") or {}
    try:
        duration = float(fmt.get("duration"))
    except (TypeError, ValueError):
        duration = None
    return {
        "path": str(path),
        "exists": path.exists(),
        "ok": True,
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream.get("sample_rate") or 0),
        "channels": int(stream.get("channels") or 0),
        "durationSeconds": duration,
        "sizeBytes": int(fmt.get("size") or 0),
        "formatName": fmt.get("format_name"),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def quality_summary(quality_report_path: str | None) -> dict[str, Any]:
    if not quality_report_path or not Path(quality_report_path).exists():
        return {"exists": False}
    report = load_json(Path(quality_report_path))
    artifacts = report.get("artifacts") or {}
    master_wav = artifacts.get("masterWav") if isinstance(artifacts, dict) else None
    master_m4a = artifacts.get("masterM4a") if isinstance(artifacts, dict) else None
    return {
        "exists": True,
        "path": quality_report_path,
        "machineVerdict": report.get("machineVerdict"),
        "approvalStatus": report.get("approvalStatus"),
        "warnings": report.get("warnings") or [],
        "advisories": report.get("advisories") or [],
        "masterWav": master_wav,
        "masterM4a": master_m4a,
    }


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def render_markdown(packet: dict[str, Any]) -> str:
    wav = packet["artifacts"]["masterWav"]
    m4a = packet["artifacts"]["masterM4a"]
    lines = [
        f"# Editor Handoff Packet: {packet['baselineId']}",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        "This packet is for importing the mastered Episode 4 audio spine into external editors such as Premiere. It is not human approval and it is not publication approval.",
        "",
        "## Current approval truth",
        "",
        f"- Approval status: `{packet['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(packet['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(packet['branchRenderReady']).lower()}`",
        f"- Human listen still required: `{str(packet['humanListenStillRequired']).lower()}`",
        "",
        "## Files",
        "",
        "| Artifact | Path | Codec | Sample rate | Channels | Duration | Size | SHA-256 |",
        "|---|---|---:|---:|---:|---:|---:|---|",
        f"| WAV master | `{wav['path']}` | `{wav.get('codec')}` | `{wav.get('sampleRate')}` | `{wav.get('channels')}` | `{wav.get('durationSeconds')}` | `{wav.get('sizeBytes')}` | `{wav.get('sha256')}` |",
        f"| M4A listening copy | `{m4a['path']}` | `{m4a.get('codec')}` | `{m4a.get('sampleRate')}` | `{m4a.get('channels')}` | `{m4a.get('durationSeconds')}` | `{m4a.get('sizeBytes')}` | `{m4a.get('sha256')}` |",
        "",
        "## Premiere import guidance",
        "",
        "1. Import the WAV master as the replacement or reference audio spine.",
        "2. Align it at sequence time `00:00:00:00` for the full synchronized Episode 4 timeline.",
        "3. Do not trim, stretch, or slip the WAV unless creating a new documented sync/conform version.",
        "4. Use the M4A for quick listening and sharing, not as the editing master.",
        "5. Treat the known long silence advisory as sync-layer truth. Final edit branches may skip that section, but the conformed spine preserves timeline duration.",
        "",
        "## Open commands",
        "",
        "```bash",
        f"open {shell_quote(wav['path'])}",
        f"open {shell_quote(m4a['path'])}",
        f"open {shell_quote(packet['linkedEvidence']['reviewHandoffIndexMarkdown'])}",
        "```",
        "",
        "## Linked evidence",
        "",
    ]
    for label, path in packet["linkedEvidence"].items():
        lines.append(f"- {label}: `{path}`")
    lines.extend(
        [
            "",
            "## Quality summary",
            "",
            f"- Quality report exists: `{str(packet['qualitySummary'].get('exists')).lower()}`",
            f"- Machine verdict: `{packet['qualitySummary'].get('machineVerdict')}`",
            f"- Warnings: `{len(packet['qualitySummary'].get('warnings') or [])}`",
            f"- Advisories: `{len(packet['qualitySummary'].get('advisories') or [])}`",
            "",
            "## Safety",
            "",
            f"- Original media mutated: `{str(packet['originalMediaMutated']).lower()}`",
            f"- Huge media copied by this packet: `{str(packet['hugeMediaCopied']).lower()}`",
            f"- Branch/render approval changed by this packet: `{str(packet['approvalStateChanged']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = load_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    wav_path_text = output_path(outputs.get("masterWav"))
    m4a_path_text = output_path(outputs.get("masterM4a"))
    if not wav_path_text or not Path(wav_path_text).exists():
        raise SystemExit("Missing masterWav artifact")
    if not m4a_path_text or not Path(m4a_path_text).exists():
        raise SystemExit("Missing masterM4a artifact")

    wav_path = Path(wav_path_text)
    m4a_path = Path(m4a_path_text)
    wav_probe = ffprobe_audio(wav_path)
    m4a_probe = ffprobe_audio(m4a_path)
    wav_probe["sha256"] = sha256_file(wav_path)
    m4a_probe["sha256"] = sha256_file(m4a_path)

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    packet = {
        "schema": "quipsly.audio-workbench.editor-handoff-packet.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "humanListenStillRequired": manifest_before.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "artifacts": {
            "masterWav": wav_probe,
            "masterM4a": m4a_probe,
        },
        "qualitySummary": quality_summary(output_path(outputs.get("qualityReport"))),
        "linkedEvidence": {
            "qualityReportMarkdown": output_path(outputs.get("qualityReportMarkdown")),
            "sourceActivityMarkdown": output_path(outputs.get("sourceActivityMarkdown")),
            "sourceContributionMarkdown": output_path(outputs.get("sourceContributionMarkdown")),
            "reviewHandoffIndexMarkdown": output_path(outputs.get("latestReviewHandoffIndexMarkdown")),
            "audioReviewCockpitHtml": output_path(outputs.get("audioReviewCockpitHtml")),
            "humanListenSessionReadme": output_path(outputs.get("latestHumanListenSessionReadme")),
        },
        "premiereImport": {
            "recommendedArtifact": "masterWav",
            "sequenceStartTimecode": "00:00:00:00",
            "sampleRate": 48000,
            "channels": 2,
            "doNotTrimStretchOrSlipWithoutNewConformVersion": True,
            "m4aUse": "quick listening and sharing only",
        },
        "originalMediaMutated": False,
        "hugeMediaCopied": False,
        "approvalStateChanged": False,
    }
    output_json = baseline_dir / f"audio-editor-handoff-packet-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-editor-handoff-packet-{slug}-{generated_at}.md"
    write_json(output_json, packet)
    output_md.write_text(render_markdown(packet), encoding="utf-8")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestEditorHandoffPacket"] = str(output_json)
    outputs["latestEditorHandoffPacketMarkdown"] = str(output_md)
    history = outputs.setdefault("editorHandoffPackets", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["editorHandoffPacketCount"] = len(history)
    manifest["editorHandoffPacketGeneratedAt"] = generated_at
    manifest["editorHandoffPacketHumanListenStillRequired"] = packet["humanListenStillRequired"]
    manifest["editorHandoffPacketApprovalStateChanged"] = False
    manifest["editorHandoffPacketHugeMediaCopied"] = False
    write_json(manifest_path, manifest)

    print(f"Wrote {output_md}")
    print(f"Wrote {output_json}")
    print(f"WAV duration: {wav_probe.get('durationSeconds')}")
    print(f"M4A duration: {m4a_probe.get('durationSeconds')}")
    print(f"Human listen still required: {packet['humanListenStillRequired']}")


if __name__ == "__main__":
    main()
