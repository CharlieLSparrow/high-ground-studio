#!/usr/bin/env python3
"""Smoke-test the dxRevive bounce validator contract.

The real Episode 4 baseline can wait for human-created dxRevive/Logic bounces,
but the validator itself should not be trusted on vibes. This script builds
temporary packet/baseline fixtures, runs the production validator against them,
and proves that missing, valid, duration-mismatched, sample-rate-mismatched, and
channel-mismatched returns route correctly.

It registers only the smoke report on the real baseline. It does not import
bounces, approve audio, unlock branches, render media, or touch original files.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STEM_KEYS = ("charlieContribution", "homerContribution", "referenceContribution")
DEFAULT_SAMPLE_RATE = 48_000
DEFAULT_CHANNELS = 2
DEFAULT_DURATION_SECONDS = 1.0


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


def make_wav(path: Path, *, duration: float, sample_rate: int = DEFAULT_SAMPLE_RATE, channels: int = DEFAULT_CHANNELS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = max(1, int(round(duration * sample_rate)))
    sample_width = 2
    silence = b"\x00" * frame_count * channels * sample_width
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(sample_width)
        handle.setframerate(sample_rate)
        handle.writeframes(silence)


def probe_for_fixture(path: Path, *, duration: float, sample_rate: int, channels: int) -> dict[str, Any]:
    return {
        "ok": True,
        "path": str(path),
        "durationSeconds": duration,
        "sampleRate": sample_rate,
        "channels": channels,
        "codec": "pcm_s16le",
        "format": "wav",
    }


def create_fixture(root: Path, scenario_name: str, returned_specs: dict[str, dict[str, Any]] | None) -> Path:
    baseline_dir = root / scenario_name / "baseline"
    packet_dir = baseline_dir / "dxrevive-fixture-packet"
    input_dir = packet_dir / "input-stems"
    return_dir = packet_dir / "return-bounces"
    source_dir = baseline_dir / "source-stems"
    return_dir.mkdir(parents=True, exist_ok=True)

    treatment_stems: list[dict[str, Any]] = []
    for key in STEM_KEYS:
        source = source_dir / f"{key}.wav"
        packet_path = input_dir / f"{key}.wav"
        expected_return = return_dir / f"{key}.dxrevive.wav"
        make_wav(source, duration=DEFAULT_DURATION_SECONDS, sample_rate=DEFAULT_SAMPLE_RATE, channels=DEFAULT_CHANNELS)
        packet_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, packet_path)
        treatment_stems.append(
            {
                "key": key,
                "sourcePath": str(source),
                "packetPath": str(packet_path),
                "expectedReturnPath": str(expected_return),
                "purpose": "validator smoke fixture",
                "probe": probe_for_fixture(
                    source,
                    duration=DEFAULT_DURATION_SECONDS,
                    sample_rate=DEFAULT_SAMPLE_RATE,
                    channels=DEFAULT_CHANNELS,
                ),
            }
        )

    if returned_specs:
        for key, spec in returned_specs.items():
            target = return_dir / f"{key}.dxrevive.wav"
            make_wav(
                target,
                duration=float(spec.get("duration", DEFAULT_DURATION_SECONDS)),
                sample_rate=int(spec.get("sampleRate", DEFAULT_SAMPLE_RATE)),
                channels=int(spec.get("channels", DEFAULT_CHANNELS)),
            )

    packet = {
        "schema": "quipsly.audio-workbench.dxrevive-manual-bounce-packet.v1",
        "generatedAt": scenario_name,
        "baselineDir": str(baseline_dir),
        "baselineId": f"dxrevive-validator-smoke-{scenario_name}",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "packetDir": str(packet_dir),
        "inputDir": str(input_dir),
        "returnDir": str(return_dir),
        "treatmentStems": treatment_stems,
        "referenceStems": [],
        "treatmentStemCount": len(treatment_stems),
        "referenceStemCount": 0,
        "hugeMediaCopied": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    packet_json = packet_dir / "dxrevive-bounce-packet-manifest.json"
    write_json(packet_json, packet)

    manifest = {
        "baselineId": f"dxrevive-validator-smoke-{scenario_name}",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": {
            "latestDxReviveManualBouncePacket": str(packet_json),
        },
    }
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def run_validator(validator_script: Path, baseline_dir: Path) -> tuple[int, str, str, dict[str, Any] | None]:
    completed = subprocess.run(
        [
            sys.executable,
            str(validator_script),
            "--baseline-dir",
            str(baseline_dir),
            "--duration-tolerance-seconds",
            "0.1",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    report: dict[str, Any] | None = None
    if (baseline_dir / "manifest.json").exists():
        manifest = read_json(baseline_dir / "manifest.json")
        report_path = manifest.get("outputs", {}).get("latestDxReviveBounceValidation")
        if report_path and Path(str(report_path)).exists():
            report = read_json(Path(str(report_path)))
    return completed.returncode, completed.stdout, completed.stderr, report


def scenario_passed(report: dict[str, Any] | None, expected_status: str, expected: dict[str, Any]) -> tuple[bool, list[str]]:
    problems: list[str] = []
    if not report:
        return False, ["validator did not produce a report"]
    if report.get("status") != expected_status:
        problems.append(f"status expected {expected_status}, got {report.get('status')}")
    for key, value in expected.items():
        if report.get(key) != value:
            problems.append(f"{key} expected {value}, got {report.get(key)}")
    if not bool(report.get("approvalStateChanged")) is False:
        problems.append("approvalStateChanged was not false")
    if not bool(report.get("branchStateChanged")) is False:
        problems.append("branchStateChanged was not false")
    if not bool(report.get("renderAttempted")) is False:
        problems.append("renderAttempted was not false")
    if not bool(report.get("originalMediaMutated")) is False:
        problems.append("originalMediaMutated was not false")
    return not problems, problems


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Bounce Validator Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This proves the manual dxRevive/Logic bounce validator contract with temporary WAV fixtures before real returned bounces are allowed near an audio candidate.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failed scenario count: `{report['failedScenarioCount']}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Expected status | Actual status | Passed | Problems |",
        "|---|---|---|---:|---|",
    ]
    for item in report["scenarios"]:
        problems = "; ".join(item.get("problems") or []) or "none"
        lines.append(
            f"| `{item['name']}` | `{item['expectedStatus']}` | `{item.get('actualStatus')}` | `{str(item['passed']).lower()}` | {problems} |"
        )
    lines.extend(
        [
            "",
            "## Current meaning",
            "",
            "The validator is now smoke-proven, but the real Episode 4 candidate still waits for actual returned bounces and human listen proof before any branch inheritance or branch render unlocks.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    if not shutil.which("ffprobe"):
        raise SystemExit("ffprobe is required for the production validator smoke.")

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    validator_script = Path(__file__).with_name("audio_workbench_dxrevive_bounce_validator.py")

    returned_all_valid = {
        key: {"duration": DEFAULT_DURATION_SECONDS, "sampleRate": DEFAULT_SAMPLE_RATE, "channels": DEFAULT_CHANNELS}
        for key in STEM_KEYS
    }
    scenarios_config = [
        {
            "name": "no-bounces",
            "returns": None,
            "expectedStatus": "waiting-for-bounces",
            "expected": {"expectedCount": 3, "presentCount": 0, "validatedCount": 0, "missingCount": 3, "errorCount": 0},
        },
        {
            "name": "all-valid",
            "returns": returned_all_valid,
            "expectedStatus": "all-returned-bounces-valid-for-candidate-testing",
            "expected": {"expectedCount": 3, "presentCount": 3, "validatedCount": 3, "missingCount": 0, "errorCount": 0},
        },
        {
            "name": "duration-mismatch",
            "returns": {
                **returned_all_valid,
                "homerContribution": {"duration": 1.35, "sampleRate": DEFAULT_SAMPLE_RATE, "channels": DEFAULT_CHANNELS},
            },
            "expectedStatus": "invalid-bounces-need-repair",
            "expected": {"expectedCount": 3, "presentCount": 3, "validatedCount": 2, "missingCount": 0, "errorCount": 1},
        },
        {
            "name": "sample-rate-mismatch",
            "returns": {
                **returned_all_valid,
                "referenceContribution": {"duration": DEFAULT_DURATION_SECONDS, "sampleRate": 44_100, "channels": DEFAULT_CHANNELS},
            },
            "expectedStatus": "invalid-bounces-need-repair",
            "expected": {"expectedCount": 3, "presentCount": 3, "validatedCount": 2, "missingCount": 0, "errorCount": 1},
        },
        {
            "name": "channel-mismatch",
            "returns": {
                **returned_all_valid,
                "charlieContribution": {"duration": DEFAULT_DURATION_SECONDS, "sampleRate": DEFAULT_SAMPLE_RATE, "channels": 1},
            },
            "expectedStatus": "invalid-bounces-need-repair",
            "expected": {"expectedCount": 3, "presentCount": 3, "validatedCount": 2, "missingCount": 0, "errorCount": 1},
        },
    ]

    scenario_results: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-dxrevive-validator-smoke-") as temp:
        temp_root = Path(temp)
        for config in scenarios_config:
            fixture_baseline = create_fixture(temp_root, str(config["name"]), config["returns"])
            returncode, stdout, stderr, validation_report = run_validator(validator_script, fixture_baseline)
            passed, problems = scenario_passed(validation_report, str(config["expectedStatus"]), dict(config["expected"]))
            if returncode != 0:
                passed = False
                problems.append(f"validator exited {returncode}")
            scenario_results.append(
                {
                    "name": config["name"],
                    "expectedStatus": config["expectedStatus"],
                    "actualStatus": validation_report.get("status") if validation_report else None,
                    "passed": passed,
                    "problems": problems,
                    "stdout": stdout.strip(),
                    "stderr": stderr.strip(),
                }
            )

    failed = [item for item in scenario_results if not item["passed"]]
    manifest_after = read_json(manifest_path)
    approval_preserved = manifest_after.get("approvalStatus") == manifest_before.get("approvalStatus")
    branch_preserved = (
        bool(manifest_after.get("branchInheritanceReady")) == bool(manifest_before.get("branchInheritanceReady"))
        and bool(manifest_after.get("branchRenderReady")) == bool(manifest_before.get("branchRenderReady"))
    )
    passed = not failed and approval_preserved and branch_preserved

    report = {
        "schema": "quipsly.audio-workbench.dxrevive-bounce-validator-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "validatorScript": str(validator_script),
        "passed": passed,
        "scenarioCount": len(scenario_results),
        "failedScenarioCount": len(failed),
        "scenarios": scenario_results,
        "realApprovalStatePreserved": approval_preserved,
        "realBranchStatePreserved": branch_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    output_json = baseline_dir / f"dxrevive-bounce-validator-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"dxrevive-bounce-validator-smoke-{slug}-{generated_at}.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestDxReviveBounceValidatorSmoke"] = str(output_json)
    outputs["latestDxReviveBounceValidatorSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("dxReviveBounceValidatorSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["dxReviveBounceValidatorSmokeCount"] = len(history)
    manifest["dxReviveBounceValidatorSmokePassed"] = passed
    manifest["dxReviveBounceValidatorSmokeScenarioCount"] = len(scenario_results)
    manifest["dxReviveBounceValidatorSmokeFailedScenarioCount"] = len(failed)
    manifest["dxReviveBounceValidatorSmokeOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": passed,
                "scenarioCount": len(scenario_results),
                "failedScenarioCount": len(failed),
                "markdown": str(output_md),
                "json": str(output_json),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
