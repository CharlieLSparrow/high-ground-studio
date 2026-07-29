#!/usr/bin/env python3
"""Smoke-test the dxRevive proof candidate planner.

This exercises the planner's three important states in temporary fixtures:
- waiting for bounces;
- invalid returned bounces;
- all returned bounces valid, including a tiny proof-snippet render.

Only the smoke report is registered on the real baseline.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


STEM_KEYS = ("charlieContribution", "homerContribution", "referenceContribution")
SAMPLE_RATE = 48_000
CHANNELS = 2
DURATION_SECONDS = 6.0


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


def make_wav(path: Path, *, duration: float = DURATION_SECONDS, sample_rate: int = SAMPLE_RATE, channels: int = CHANNELS) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame_count = max(1, int(round(duration * sample_rate)))
    sample_width = 2
    frames = bytearray()
    # Use a very small tone instead of digital silence so loudness filters do not
    # produce NaN during sandbox proof renders. This remains synthetic fixture
    # audio; no real baseline media is touched.
    for index in range(frame_count):
        sample = int(1800 * math.sin(2 * math.pi * 440 * index / sample_rate))
        packed = struct.pack("<h", sample)
        for _ in range(channels):
            frames.extend(packed)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(channels)
        handle.setsampwidth(sample_width)
        handle.setframerate(sample_rate)
        handle.writeframes(bytes(frames))


def fixture_probe(path: Path, *, duration: float = DURATION_SECONDS, sample_rate: int = SAMPLE_RATE, channels: int = CHANNELS) -> dict[str, Any]:
    return {
        "ok": True,
        "path": str(path),
        "durationSeconds": duration,
        "sampleRate": sample_rate,
        "channels": channels,
        "codec": "pcm_s16le",
        "format": "wav",
    }


def create_fixture(root: Path, scenario: str, validation_status: str) -> Path:
    baseline_dir = root / scenario / "baseline"
    baseline_dir.mkdir(parents=True, exist_ok=True)
    master = baseline_dir / "master.wav"
    make_wav(master)

    queue_path = baseline_dir / "listen-priority-queue.json"
    write_json(
        queue_path,
        {
            "schema": "quipsly.audio-workbench.listen-priority-queue.fixture",
            "items": [
                {"label": "fixture first check", "timeSeconds": 1.0},
                {"label": "fixture second check", "timeSeconds": 4.5},
            ],
        },
    )

    returned_dir = baseline_dir / "returned-bounces"
    results: list[dict[str, Any]] = []
    for index, key in enumerate(STEM_KEYS):
        returned = returned_dir / f"{key}.dxrevive.wav"
        status = "missing"
        valid = False
        errors: list[str] = []
        returned_probe = {"ok": False, "error": "missing-file", "path": str(returned)}
        if validation_status == "all-returned-bounces-valid-for-candidate-testing":
            make_wav(returned)
            status = "valid"
            valid = True
            returned_probe = fixture_probe(returned)
        elif validation_status == "invalid-bounces-need-repair":
            make_wav(returned)
            status = "invalid" if index == 0 else "valid"
            valid = index != 0
            errors = ["duration changed by 0.300s; tolerance is 0.100s"] if index == 0 else []
            returned_probe = fixture_probe(returned)
        results.append(
            {
                "key": key,
                "returnedPath": str(returned),
                "status": status,
                "valid": valid,
                "originalProbe": fixture_probe(returned),
                "returnedProbe": returned_probe,
                "errors": errors,
                "warnings": [],
            }
        )

    validation = {
        "schema": "quipsly.audio-workbench.dxrevive-bounce-validation.fixture",
        "generatedAt": scenario,
        "baselineDir": str(baseline_dir),
        "baselineId": f"dxrevive-proof-planner-smoke-{scenario}",
        "status": validation_status,
        "expectedCount": 3,
        "presentCount": 0 if validation_status == "waiting-for-bounces" else 3,
        "validatedCount": 3 if validation_status == "all-returned-bounces-valid-for-candidate-testing" else 2 if validation_status == "invalid-bounces-need-repair" else 0,
        "missingCount": 3 if validation_status == "waiting-for-bounces" else 0,
        "errorCount": 1 if validation_status == "invalid-bounces-need-repair" else 0,
        "results": results,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    validation_path = baseline_dir / "dxrevive-bounce-validation.json"
    write_json(validation_path, validation)

    manifest = {
        "baselineId": f"dxrevive-proof-planner-smoke-{scenario}",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": {
            "masterWav": str(master),
            "latestAudioListenPriorityQueue": str(queue_path),
            "latestDxReviveBounceValidation": str(validation_path),
        },
    }
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def run_planner(planner: Path, baseline_dir: Path, *, render: bool) -> tuple[int, str, str, dict[str, Any] | None]:
    cmd = [
        sys.executable,
        str(planner),
        "--baseline-dir",
        str(baseline_dir),
        "--proof-window-count",
        "2",
        "--window-duration",
        "0.3",
    ]
    if render:
        cmd.extend(["--render-proof", "--allow-proof-render"])
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    report: dict[str, Any] | None = None
    manifest_path = baseline_dir / "manifest.json"
    if manifest_path.exists():
        manifest = read_json(manifest_path)
        report_path = manifest.get("outputs", {}).get("latestDxReviveProofCandidatePlanner")
        if report_path and Path(str(report_path)).exists():
            report = read_json(Path(str(report_path)))
    return proc.returncode, proc.stdout, proc.stderr, report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Proof Candidate Planner Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This proves the proof-candidate planner waits, blocks, and renders proof snippets correctly in temporary fixtures.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failed scenario count: `{report['failedScenarioCount']}`",
        f"- Rendered proof snippets in sandbox: `{report['sandboxRenderSuccessCount']}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "| Scenario | Expected | Actual | Passed | Problems |",
        "|---|---|---|---:|---|",
    ]
    for item in report["scenarios"]:
        lines.append(
            f"| `{item['name']}` | `{item['expectedStatus']}` | `{item.get('actualStatus')}` | `{str(item['passed']).lower()}` | {'; '.join(item.get('problems') or []) or 'none'} |"
        )
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("ffmpeg and ffprobe are required for the planner smoke.")

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    planner = Path(__file__).with_name("audio_workbench_dxrevive_proof_candidate_planner.py")

    configs = [
        ("waiting", "waiting-for-bounces", "waiting-for-validated-dxrevive-bounces", False, 0),
        ("invalid", "invalid-bounces-need-repair", "blocked-invalid-dxrevive-bounces", False, 0),
        ("valid-render", "all-returned-bounces-valid-for-candidate-testing", "ready-for-dxrevive-proof-candidate", True, 4),
    ]
    scenarios: list[dict[str, Any]] = []
    sandbox_render_success_count = 0
    with tempfile.TemporaryDirectory(prefix="quipsly-dxrevive-proof-planner-smoke-") as temp:
        temp_root = Path(temp)
        for name, validation_status, expected_status, render, expected_successes in configs:
            fixture = create_fixture(temp_root, name, validation_status)
            returncode, stdout, stderr, planner_report = run_planner(planner, fixture, render=render)
            problems: list[str] = []
            actual_status = planner_report.get("status") if planner_report else None
            if returncode != 0:
                problems.append(f"planner exited {returncode}")
            if actual_status != expected_status:
                problems.append(f"status expected {expected_status}, got {actual_status}")
            if planner_report:
                render_successes = int(planner_report.get("renderSuccessCount") or 0)
                sandbox_render_success_count += render_successes
                if render_successes != expected_successes:
                    problems.append(f"render successes expected {expected_successes}, got {render_successes}")
                if planner_report.get("approvalStateChanged") or planner_report.get("branchStateChanged") or planner_report.get("originalMediaMutated"):
                    problems.append("planner mutated approval, branch, or original-media truth")
            else:
                problems.append("planner did not produce a report")
            scenarios.append(
                {
                    "name": name,
                    "validationStatus": validation_status,
                    "expectedStatus": expected_status,
                    "actualStatus": actual_status,
                    "passed": not problems,
                    "problems": problems,
                    "stdout": stdout[-1000:],
                    "stderr": stderr[-1000:],
                }
            )

    manifest_after = read_json(manifest_path)
    approval_preserved = manifest_after.get("approvalStatus") == manifest_before.get("approvalStatus")
    branch_preserved = (
        bool(manifest_after.get("branchInheritanceReady")) == bool(manifest_before.get("branchInheritanceReady"))
        and bool(manifest_after.get("branchRenderReady")) == bool(manifest_before.get("branchRenderReady"))
    )
    failed = [item for item in scenarios if not item["passed"]]
    passed = not failed and approval_preserved and branch_preserved
    report = {
        "schema": "quipsly.audio-workbench.dxrevive-proof-candidate-planner-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "plannerScript": str(planner),
        "passed": passed,
        "scenarioCount": len(scenarios),
        "failedScenarioCount": len(failed),
        "sandboxRenderSuccessCount": sandbox_render_success_count,
        "scenarios": scenarios,
        "realApprovalStatePreserved": approval_preserved,
        "realBranchStatePreserved": branch_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }
    output_json = baseline_dir / f"dxrevive-proof-candidate-planner-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"dxrevive-proof-candidate-planner-smoke-{slug}-{generated_at}.md"
    report["json"] = str(output_json)
    report["markdown"] = str(output_md)
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestDxReviveProofCandidatePlannerSmoke"] = str(output_json)
    outputs["latestDxReviveProofCandidatePlannerSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("dxReviveProofCandidatePlannerSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["dxReviveProofCandidatePlannerSmokeCount"] = len(history)
    manifest["dxReviveProofCandidatePlannerSmokePassed"] = passed
    manifest["dxReviveProofCandidatePlannerSmokeScenarioCount"] = len(scenarios)
    manifest["dxReviveProofCandidatePlannerSmokeFailedScenarioCount"] = len(failed)
    manifest["dxReviveProofCandidatePlannerSmokeSandboxRenderSuccessCount"] = sandbox_render_success_count
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "passed": passed,
                "scenarioCount": len(scenarios),
                "failedScenarioCount": len(failed),
                "sandboxRenderSuccessCount": sandbox_render_success_count,
                "markdown": str(output_md),
                "json": str(output_json),
                "approvalStateChanged": False,
                "branchStateChanged": False,
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
