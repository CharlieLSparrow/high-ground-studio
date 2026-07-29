#!/usr/bin/env python3
"""Create a manual dxRevive/Logic bounce packet for derived audio stems.

dxRevive is installed locally as plug-ins, not a CLI. This script creates the
safe manual/offline path requested by the audio workbench goal: package
derived stems, document expected return filenames, and register the packet
without approving audio, rendering branches, or mutating original media.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TREATMENT_STEM_KEYS = ("charlieContribution", "homerContribution", "referenceContribution")
REFERENCE_STEM_KEYS = ("charlieAligned", "homerDjiAligned", "referenceAligned")


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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def probe_media(path: Path) -> dict[str, Any]:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return {"ok": False, "error": "ffprobe-not-found", "path": str(path)}
    if not path.exists():
        return {"ok": False, "error": "missing-file", "path": str(path)}
    cmd = [
        ffprobe,
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        payload = json.loads(result.stdout or "{}")
    except (subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        return {"ok": False, "error": str(exc), "path": str(path)}

    audio_streams = [stream for stream in payload.get("streams", []) if stream.get("codec_type") == "audio"]
    first = audio_streams[0] if audio_streams else {}
    duration = payload.get("format", {}).get("duration") or first.get("duration")
    return {
        "ok": True,
        "path": str(path),
        "durationSeconds": float(duration) if duration is not None else None,
        "sampleRate": int(first["sample_rate"]) if str(first.get("sample_rate") or "").isdigit() else None,
        "channels": first.get("channels"),
        "codec": first.get("codec_name"),
        "format": payload.get("format", {}).get("format_name"),
    }


def make_link_or_copy(source: Path, target: Path, mode: str) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() or target.is_symlink():
        target.unlink()
    if mode == "copy":
        shutil.copy2(source, target)
        action = "copied-derived-stem"
    else:
        os.symlink(source, target)
        action = "symlinked-derived-stem"
    return {"source": str(source), "target": str(target), "action": action}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Manual Bounce Packet",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This packet is for manual/offline restoration through dxRevive, Logic Pro, or another AU/VST host. It packages derived stems only. Do not process or replace original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        f"- Huge media copied: `{str(report['hugeMediaCopied']).lower()}`",
        "",
        "## Folder contract",
        "",
        f"- Packet folder: `{report['packetDir']}`",
        f"- Input stems: `{report['inputDir']}`",
        f"- Return bounces here: `{report['returnDir']}`",
        "",
        "## Treatment stems",
        "",
        "| Stem | Purpose | Input | Expected returned file | Duration | Sample rate | Channels |",
        "|---|---|---|---|---:|---:|---:|",
    ]
    for stem in report["treatmentStems"]:
        probe = stem.get("probe") or {}
        lines.append(
            f"| `{stem['key']}` | {stem['purpose']} | `{stem['packetPath']}` | `{stem['expectedReturnPath']}` | `{probe.get('durationSeconds')}` | `{probe.get('sampleRate')}` | `{probe.get('channels')}` |"
        )
    lines.extend(
        [
            "",
            "## Reference-only stems",
            "",
            "These are for alignment/context. They should not be used to replace the production stems unless a new conform decision is created.",
            "",
        ]
    )
    for stem in report["referenceStems"]:
        lines.append(f"- `{stem['key']}` -> `{stem['packetPath']}`")
    lines.extend(
        [
            "",
            "## Manual bounce rules",
            "",
            "1. Open only the files from the input-stems folder in dxRevive/Logic.",
            "2. Bounce each treated file to the exact expected returned filename.",
            "3. Preserve duration, sample rate, and channel count unless you are deliberately creating a new conform version.",
            "4. Run the bounce validator before any candidate mix can use these returned files.",
            "5. If the restored audio sounds fake, metallic, chopped, or over-clean, reject the bounce and keep the existing v006 path.",
            "",
            "## Validate returned bounces",
            "",
            "```bash",
            f"python3 apps/QuipslyStudio/script/audio_workbench_dxrevive_bounce_validator.py --baseline-dir {shell_quote(report['baselineDir'])} --packet-dir {shell_quote(report['packetDir'])}",
            "```",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--link-mode", choices=["symlink", "copy"], default="symlink")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    sync_layer = manifest_before.get("syncLayer") if isinstance(manifest_before.get("syncLayer"), dict) else {}
    stems = sync_layer.get("stems") if isinstance(sync_layer.get("stems"), dict) else {}
    packet_dir = baseline_dir / f"dxrevive-manual-bounce-packet-{slug}-{generated_at}"
    input_dir = packet_dir / "input-stems"
    return_dir = packet_dir / "return-bounces"
    return_dir.mkdir(parents=True, exist_ok=True)

    treatment_stems: list[dict[str, Any]] = []
    reference_stems: list[dict[str, Any]] = []

    for key in TREATMENT_STEM_KEYS:
        source_value = stems.get(key)
        if not source_value:
            continue
        source = Path(str(source_value))
        packet_path = input_dir / f"{key}{source.suffix or '.wav'}"
        link = make_link_or_copy(source, packet_path, args.link_mode)
        expected_return = return_dir / f"{key}.dxrevive.wav"
        treatment_stems.append(
            {
                "key": key,
                "sourcePath": str(source),
                "packetPath": str(packet_path),
                "expectedReturnPath": str(expected_return),
                "purpose": "manual restoration candidate; returned file must validate before use",
                "link": link,
                "probe": probe_media(source),
            }
        )

    for key in REFERENCE_STEM_KEYS:
        source_value = stems.get(key)
        if not source_value:
            continue
        source = Path(str(source_value))
        packet_path = input_dir / f"reference-{key}{source.suffix or '.wav'}"
        link = make_link_or_copy(source, packet_path, args.link_mode)
        reference_stems.append(
            {
                "key": key,
                "sourcePath": str(source),
                "packetPath": str(packet_path),
                "purpose": "reference only; do not bounce as production replacement unless a new conform version is created",
                "link": link,
                "probe": probe_media(source),
            }
        )

    readme = return_dir / "PUT_DXREVIVE_BOUNCES_HERE.txt"
    readme.write_text(
        "Put manually restored dxRevive/Logic bounces in this folder using the exact expected filenames from dxrevive-bounce-packet-manifest.json.\n"
        "Then run audio_workbench_dxrevive_bounce_validator.py. Do not replace original media or edit manifest state by hand.\n",
        encoding="utf-8",
    )

    report = {
        "schema": "quipsly.audio-workbench.dxrevive-manual-bounce-packet.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "packetDir": str(packet_dir),
        "inputDir": str(input_dir),
        "returnDir": str(return_dir),
        "linkMode": args.link_mode,
        "treatmentStems": treatment_stems,
        "referenceStems": reference_stems,
        "treatmentStemCount": len(treatment_stems),
        "referenceStemCount": len(reference_stems),
        "hugeMediaCopied": args.link_mode == "copy",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    packet_json = packet_dir / "dxrevive-bounce-packet-manifest.json"
    packet_md = packet_dir / "dxrevive-bounce-packet.md"
    open_command = packet_dir / "OPEN_DXREVIVE_BOUNCE_PACKET.command"
    report["json"] = str(packet_json)
    report["markdown"] = str(packet_md)
    report["openCommand"] = str(open_command)
    write_json(packet_json, report)
    packet_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    open_command.write_text(
        "#!/bin/zsh\nset -euo pipefail\n"
        f"open {shell_quote(str(packet_md))}\n"
        f"open {shell_quote(str(input_dir))}\n"
        f"open {shell_quote(str(return_dir))}\n",
        encoding="utf-8",
    )
    os.chmod(open_command, 0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestDxReviveManualBouncePacket"] = str(packet_json)
    outputs["latestDxReviveManualBouncePacketMarkdown"] = str(packet_md)
    outputs["latestDxReviveManualBouncePacketOpenCommand"] = str(open_command)
    outputs["latestDxReviveManualBouncePacketReturnDir"] = str(return_dir)
    history = outputs.setdefault("dxReviveManualBouncePackets", [])
    if str(packet_json) not in history:
        history.append(str(packet_json))
    manifest["dxReviveManualBouncePacketCount"] = len(history)
    manifest["dxReviveManualBounceTreatmentStemCount"] = len(treatment_stems)
    manifest["dxReviveManualBounceReferenceStemCount"] = len(reference_stems)
    manifest["dxReviveManualBounceOriginalMediaMutated"] = False
    manifest["dxReviveManualBounceHugeMediaCopied"] = args.link_mode == "copy"
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "packet": str(packet_json),
                "markdown": str(packet_md),
                "openCommand": str(open_command),
                "returnDir": str(return_dir),
                "treatmentStemCount": len(treatment_stems),
                "referenceStemCount": len(reference_stems),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
