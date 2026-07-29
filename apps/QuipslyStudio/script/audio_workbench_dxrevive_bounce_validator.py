#!/usr/bin/env python3
"""Validate returned dxRevive/Logic bounces before they can enter a baseline.

This checks returned manual restoration files against the derived stem contract:
same duration, sample rate, and channel count. It does not import the bounces
into a mix, approve audio, render branches, upload files, or mutate source
media.
"""

from __future__ import annotations

import argparse
import json
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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


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


def compare_probe(original: dict[str, Any], returned: dict[str, Any], tolerance: float) -> tuple[bool, list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    if not original.get("ok"):
        errors.append(f"original probe failed: {original.get('error')}")
    if not returned.get("ok"):
        errors.append(f"returned probe failed: {returned.get('error')}")
    if errors:
        return False, errors, warnings

    original_duration = original.get("durationSeconds")
    returned_duration = returned.get("durationSeconds")
    if original_duration is None or returned_duration is None:
        errors.append("duration missing from original or returned probe")
    else:
        delta = abs(float(original_duration) - float(returned_duration))
        if delta > tolerance:
            errors.append(f"duration changed by {delta:.3f}s; tolerance is {tolerance:.3f}s")

    if original.get("sampleRate") != returned.get("sampleRate"):
        errors.append(f"sample rate changed from {original.get('sampleRate')} to {returned.get('sampleRate')}")
    if original.get("channels") != returned.get("channels"):
        errors.append(f"channel count changed from {original.get('channels')} to {returned.get('channels')}")
    if returned.get("codec") not in {"pcm_s16le", "pcm_s24le", "pcm_s32le", "flac", "aac"}:
        warnings.append(f"returned codec is {returned.get('codec')}; prefer WAV PCM for production restoration bounces")
    return not errors, errors, warnings


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Bounce Validation",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Packet: `{report['packetDir']}`",
        "",
        "This validates manually restored dxRevive/Logic bounces before any candidate mix can use them. It does not import, approve, render, upload, or mutate source media.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Expected bounces: `{report['expectedCount']}`",
        f"- Present bounces: `{report['presentCount']}`",
        f"- Validated bounces: `{report['validatedCount']}`",
        f"- Missing bounces: `{report['missingCount']}`",
        f"- Error count: `{report['errorCount']}`",
        f"- Warning count: `{report['warningCount']}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Bounce detail",
        "",
        "| Stem | Status | Return file | Duration delta | Errors | Warnings |",
        "|---|---:|---|---:|---|---|",
    ]
    for item in report["results"]:
        lines.append(
            f"| `{item['key']}` | `{item['status']}` | `{item['returnedPath']}` | `{item.get('durationDeltaSeconds')}` | {'; '.join(item.get('errors') or []) or 'none'} | {'; '.join(item.get('warnings') or []) or 'none'} |"
        )
    lines.extend(
        [
            "",
            "## Next action",
            "",
            report["nextAction"],
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--packet-dir", type=Path)
    parser.add_argument("--duration-tolerance-seconds", type=float, default=0.1)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    packet_manifest_path = args.packet_dir / "dxrevive-bounce-packet-manifest.json" if args.packet_dir else output_path(outputs.get("latestDxReviveManualBouncePacket"))
    if not packet_manifest_path or not packet_manifest_path.exists():
        raise SystemExit("No dxRevive bounce packet found. Generate one first.")

    packet = read_json(packet_manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    results: list[dict[str, Any]] = []
    for stem in packet.get("treatmentStems") or []:
        returned = Path(str(stem.get("expectedReturnPath")))
        original_probe = stem.get("probe") if isinstance(stem.get("probe"), dict) else probe_media(Path(str(stem.get("sourcePath"))))
        returned_probe = probe_media(returned)
        status = "missing"
        valid = False
        errors: list[str] = []
        warnings: list[str] = []
        duration_delta: float | None = None
        if returned.exists():
            valid, errors, warnings = compare_probe(original_probe, returned_probe, args.duration_tolerance_seconds)
            status = "valid" if valid else "invalid"
            if original_probe.get("durationSeconds") is not None and returned_probe.get("durationSeconds") is not None:
                duration_delta = float(returned_probe["durationSeconds"]) - float(original_probe["durationSeconds"])
        results.append(
            {
                "key": stem.get("key"),
                "originalPath": stem.get("sourcePath"),
                "packetPath": stem.get("packetPath"),
                "returnedPath": str(returned),
                "status": status,
                "valid": valid,
                "originalProbe": original_probe,
                "returnedProbe": returned_probe,
                "durationDeltaSeconds": duration_delta,
                "errors": errors,
                "warnings": warnings,
            }
        )

    expected_count = len(results)
    present_count = sum(1 for item in results if item["status"] != "missing")
    validated_count = sum(1 for item in results if item["status"] == "valid")
    missing_count = sum(1 for item in results if item["status"] == "missing")
    error_count = sum(len(item["errors"]) for item in results)
    warning_count = sum(len(item["warnings"]) for item in results)
    if missing_count == expected_count:
        status = "waiting-for-bounces"
        next_action = "Run the manual dxRevive/Logic bounce pass, put returned files in the packet return-bounces folder, then rerun this validator."
    elif error_count:
        status = "invalid-bounces-need-repair"
        next_action = "Reject invalid returned bounces or recreate them without changing duration, sample rate, or channel count."
    elif validated_count == expected_count:
        status = "all-returned-bounces-valid-for-candidate-testing"
        next_action = "Create a new timestamped proof candidate that uses these validated derived bounces, then compare against v006 before any full promotion."
    else:
        status = "partial-bounces-valid"
        next_action = "Use only validated returned bounces in proof candidates; missing stems should continue using the current derived v006 path."

    report = {
        "schema": "quipsly.audio-workbench.dxrevive-bounce-validation.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "packetDir": str(Path(packet["packetDir"])),
        "packetManifest": str(packet_manifest_path),
        "durationToleranceSeconds": args.duration_tolerance_seconds,
        "status": status,
        "expectedCount": expected_count,
        "presentCount": present_count,
        "validatedCount": validated_count,
        "missingCount": missing_count,
        "errorCount": error_count,
        "warningCount": warning_count,
        "results": results,
        "nextAction": next_action,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    output_json = baseline_dir / f"dxrevive-bounce-validation-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"dxrevive-bounce-validation-{slug}-{generated_at}.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestDxReviveBounceValidation"] = str(output_json)
    outputs["latestDxReviveBounceValidationMarkdown"] = str(output_md)
    history = outputs.setdefault("dxReviveBounceValidations", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["dxReviveBounceValidationCount"] = len(history)
    manifest["dxReviveBounceValidationStatus"] = status
    manifest["dxReviveBounceValidationExpectedCount"] = expected_count
    manifest["dxReviveBounceValidationValidatedCount"] = validated_count
    manifest["dxReviveBounceValidationMissingCount"] = missing_count
    manifest["dxReviveBounceValidationErrorCount"] = error_count
    manifest["dxReviveBounceValidationOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "status": status,
                "markdown": str(output_md),
                "json": str(output_json),
                "expectedCount": expected_count,
                "presentCount": present_count,
                "validatedCount": validated_count,
                "missingCount": missing_count,
                "errorCount": error_count,
                "warningCount": warning_count,
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
