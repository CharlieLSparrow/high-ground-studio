#!/usr/bin/env python3
"""Smoke-test the reusable Episode audio production profile.

This does not prove the profile is production-approved for another real
episode. It proves something narrower and useful: the exported Episode 4
profile can be applied to a fresh synthetic noisy/outdoor-style fixture without
Episode-4-specific paths, while preserving speech and reducing obvious
non-speaking bleed/noise on duplicated stems.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import struct
import subprocess
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SAMPLE_RATE = 48_000
CHANNELS = 2
DURATION_SECONDS = 12.0


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
    return out.strip("-") or "audio-profile"


def run_capture(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def make_wave(path: Path, generator: Any, *, duration: float = DURATION_SECONDS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = int(duration * SAMPLE_RATE)
    frames = bytearray()
    for index in range(frame_count):
        t = index / SAMPLE_RATE
        sample = max(-0.98, min(0.98, float(generator(t)))) * 32767
        packed = struct.pack("<h", int(sample))
        for _ in range(CHANNELS):
            frames.extend(packed)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(CHANNELS)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(bytes(frames))


def tone(t: float, frequency: float, amplitude: float) -> float:
    return amplitude * math.sin(2 * math.pi * frequency * t)


def in_range(t: float, start: float, end: float) -> bool:
    return start <= t < end


def create_fixture(fixture_dir: Path) -> dict[str, Path]:
    rng = random.Random(4242)
    charlie = fixture_dir / "charlie-aligned-synthetic.wav"
    homer = fixture_dir / "homer-outdoor-aligned-synthetic.wav"
    reference = fixture_dir / "reference-aligned-synthetic.wav"

    def charlie_gen(t: float) -> float:
        value = 0.0
        if in_range(t, 1.0, 3.0) or in_range(t, 8.0, 10.0):
            value += tone(t, 220, 0.22) + tone(t, 330, 0.08)
        if in_range(t, 4.0, 6.0):
            value += tone(t, 185, 0.006)  # Homer echo leaking quietly into Charlie source.
        value += rng.uniform(-0.002, 0.002)
        return value

    def homer_gen(t: float) -> float:
        value = rng.uniform(-0.018, 0.018)  # outdoor bed/park texture.
        if in_range(t, 4.0, 6.0) or in_range(t, 10.0, 11.3):
            value += tone(t, 180, 0.18) + tone(t, 275, 0.06)
        if in_range(t, 1.0, 3.0):
            value += tone(t, 220, 0.012)  # Charlie bleed/background under Homer mic.
        return value

    def reference_gen(t: float) -> float:
        if in_range(t, 6.5, 7.5):
            return tone(t, 520, 0.10)
        return rng.uniform(-0.001, 0.001)

    make_wave(charlie, charlie_gen)
    make_wave(homer, homer_gen)
    make_wave(reference, reference_gen)
    return {"charlie": charlie, "homer": homer, "reference": reference}


def apply_filter(input_path: Path, output_path: Path, filter_expr: str) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-y",
        "-i",
        str(input_path),
        "-af",
        filter_expr,
        "-ar",
        str(SAMPLE_RATE),
        "-c:a",
        "pcm_s16le",
        str(output_path),
    ]
    proc = run_capture(cmd)
    return {
        "command": cmd,
        "returnCode": proc.returncode,
        "ok": proc.returncode == 0 and output_path.exists(),
        "output": str(output_path),
        "stderrTail": proc.stderr[-3000:],
    }


def read_samples(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as handle:
        channels = handle.getnchannels()
        sample_rate = handle.getframerate()
        raw = handle.readframes(handle.getnframes())
    samples = struct.unpack("<" + "h" * (len(raw) // 2), raw)
    mono = []
    for index in range(0, len(samples), channels):
        mono.append(sum(samples[index : index + channels]) / channels / 32768.0)
    return mono, sample_rate


def rms_db(path: Path, start: float, end: float) -> float | None:
    samples, sample_rate = read_samples(path)
    start_i = max(0, int(start * sample_rate))
    end_i = min(len(samples), int(end * sample_rate))
    if end_i <= start_i:
        return None
    window = samples[start_i:end_i]
    rms = math.sqrt(sum(value * value for value in window) / len(window))
    if rms <= 1e-12:
        return -120.0
    return 20 * math.log10(rms)


def measure_pair(aligned: Path, contribution: Path, start: float, end: float) -> dict[str, Any]:
    aligned_db = rms_db(aligned, start, end)
    contribution_db = rms_db(contribution, start, end)
    delta = None
    if aligned_db is not None and contribution_db is not None:
        delta = contribution_db - aligned_db
    return {
        "start": start,
        "end": end,
        "alignedDbfs": round(aligned_db, 3) if aligned_db is not None else None,
        "contributionDbfs": round(contribution_db, 3) if contribution_db is not None else None,
        "deltaDb": round(delta, 3) if delta is not None else None,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Reusable Audio Production Profile Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Profile: `{report['profileName']}`",
        "",
        "This smoke uses synthetic noisy/outdoor-style audio to prove the reusable profile can run outside Episode 4 paths. It is machine evidence, not production approval.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failed scenario count: `{report['failedScenarioCount']}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        "",
        "## Checks",
        "",
        "| Check | Passed | Evidence |",
        "|---|---:|---|",
    ]
    for check in report["checks"]:
        lines.append(f"| {check['name']} | `{str(check['passed']).lower()}` | {check['evidence']} |")
    lines.extend(["", "## Measurements", ""])
    for key, value in report["measurements"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(
        [
            "",
            "## Meaning",
            "",
            "The profile can bootstrap another messy/noisy episode at the machine-contract level: duplicated stems, profile filters, duration preservation, speech retention checks, and non-speaking bleed/noise reduction checks all have an executable proof path. A real future episode still needs human listen proof before this becomes production-default behavior.",
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
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    profile_path = output_path(outputs.get("latestReusableAudioProductionProfile"))
    if not profile_path or not profile_path.exists():
        raise FileNotFoundError("Missing latestReusableAudioProductionProfile")
    profile = read_json(profile_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    work_dir = baseline_dir / f"audio-reusable-profile-smoke-{slug}-{generated_at}"
    fixture_dir = work_dir / "synthetic-fixture"
    stems = create_fixture(fixture_dir)

    profiles = profile.get("speakerAutomationProfiles") if isinstance(profile.get("speakerAutomationProfiles"), dict) else {}
    charlie_filter = profiles.get("charlie", {}).get("filter")
    homer_filter = profiles.get("homer", {}).get("filter")
    reference_filter = profiles.get("reference", {}).get("filter")
    if not charlie_filter or not homer_filter or not reference_filter:
        raise ValueError("Reusable profile is missing charlie/homer/reference filters")

    outputs_dir = work_dir / "derived-stems"
    charlie_contrib = outputs_dir / "charlie-contribution.wav"
    homer_contrib = outputs_dir / "homer-contribution.wav"
    reference_contrib = outputs_dir / "reference-contribution.wav"
    render_results = {
        "charlie": apply_filter(stems["charlie"], charlie_contrib, charlie_filter),
        "homer": apply_filter(stems["homer"], homer_contrib, homer_filter),
        "reference": apply_filter(stems["reference"], reference_contrib, reference_filter),
    }

    measurements = {
        "charlieSpeech": measure_pair(stems["charlie"], charlie_contrib, 1.0, 3.0),
        "charlieEchoUnderHomer": measure_pair(stems["charlie"], charlie_contrib, 4.0, 6.0),
        "homerSpeech": measure_pair(stems["homer"], homer_contrib, 4.0, 6.0),
        "homerOutdoorGap": measure_pair(stems["homer"], homer_contrib, 6.5, 7.5),
        "referenceWindow": measure_pair(stems["reference"], reference_contrib, 6.5, 7.5),
    }

    checks = [
        {
            "name": "all profile filters rendered on duplicated synthetic stems",
            "passed": all(item["ok"] for item in render_results.values()),
            "evidence": ", ".join(f"{key}={value['ok']}" for key, value in render_results.items()),
        },
        {
            "name": "Charlie speech is retained enough for review",
            "passed": (measurements["charlieSpeech"]["deltaDb"] or -999) > -12.0,
            "evidence": f"delta {measurements['charlieSpeech']['deltaDb']} dB during Charlie speech",
        },
        {
            "name": "Charlie echo under Homer is reduced",
            "passed": (measurements["charlieEchoUnderHomer"]["deltaDb"] or 999) < -6.0,
            "evidence": f"delta {measurements['charlieEchoUnderHomer']['deltaDb']} dB during Homer speech window",
        },
        {
            "name": "Homer speech is retained enough for review",
            "passed": (measurements["homerSpeech"]["deltaDb"] or -999) > -14.0,
            "evidence": f"delta {measurements['homerSpeech']['deltaDb']} dB during Homer speech",
        },
        {
            "name": "Homer outdoor gap/noise is reduced",
            "passed": (measurements["homerOutdoorGap"]["deltaDb"] or 999) < -3.0,
            "evidence": f"delta {measurements['homerOutdoorGap']['deltaDb']} dB during outdoor gap",
        },
        {
            "name": "Reference window survives controlled processing",
            "passed": (measurements["referenceWindow"]["deltaDb"] or -999) > -8.0,
            "evidence": f"delta {measurements['referenceWindow']['deltaDb']} dB during reference window",
        },
    ]
    failed = [check for check in checks if not check["passed"]]
    report = {
        "schema": "quipsly.audio-workbench.reusable-profile-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "profilePath": str(profile_path),
        "profileName": profile.get("profileName"),
        "workDir": str(work_dir),
        "fixtureStems": {key: str(value) for key, value in stems.items()},
        "derivedStems": {
            "charlie": str(charlie_contrib),
            "homer": str(homer_contrib),
            "reference": str(reference_contrib),
        },
        "renderResults": render_results,
        "measurements": measurements,
        "checks": checks,
        "passed": not failed,
        "scenarioCount": len(checks),
        "failedScenarioCount": len(failed),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": True,
        "originalMediaMutated": False,
        "syntheticFixtureOnly": True,
    }
    output_json = work_dir / "audio-reusable-profile-smoke.json"
    output_md = work_dir / "audio-reusable-profile-smoke.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestReusableAudioProductionProfileSmoke"] = str(output_json)
    outputs["latestReusableAudioProductionProfileSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("reusableAudioProductionProfileSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["reusableAudioProductionProfileSmokeCount"] = len(history)
    manifest["reusableAudioProductionProfileSmokePassed"] = not failed
    manifest["reusableAudioProductionProfileSmokeScenarioCount"] = len(checks)
    manifest["reusableAudioProductionProfileSmokeFailedScenarioCount"] = len(failed)
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": not failed,
                "scenarioCount": len(checks),
                "failedScenarioCount": len(failed),
                "markdown": str(output_md),
                "json": str(output_json),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": True,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
