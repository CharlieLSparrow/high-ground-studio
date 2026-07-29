#!/usr/bin/env python3
"""Smoke-test the reusable profile intake packet contract.

This uses temporary manifests to prove the intake packet generator handles a
valid reusable profile and fails safely when the profile is missing. The real
baseline only receives the smoke report; approval, branch, render, and source
truth remain unchanged.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
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
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath", "openCommand"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=False)


def fixture_profile(path: Path) -> dict[str, Any]:
    profile = {
        "schema": "quipsly.audio-workbench.reusable-production-profile.v1",
        "profileName": "fixture-homer-preserving-clean",
        "sourceRoleTemplate": [
            {"id": "charlie-clean", "label": "Charlie local mic", "role": "charlie_audio"},
            {"id": "homer-park", "label": "Homer park mic", "role": "homer_audio"},
            {"id": "reference", "label": "Reference clip audio", "role": "reference_audio"},
        ],
        "reusableStages": [
            {"name": "source inventory", "purpose": "name sources", "proofArtifact": "manifest.rawSources", "requiresHumanGate": False},
            {"name": "sync layer", "purpose": "align sources", "proofArtifact": "sync report", "requiresHumanGate": False},
            {"name": "source-aware cleanup", "purpose": "reduce bleed", "proofArtifact": "proof snippets", "requiresHumanGate": True},
            {"name": "final stereo handoff", "purpose": "normal WAV/M4A", "proofArtifact": "QC report", "requiresHumanGate": True},
        ],
        "speakerAutomationProfiles": {
            "charlie": {"purpose": "preserve local voice", "gapAction": "duck bleed", "editableParameters": {"gateReleaseMs": 160}, "filter": "volume=1"},
            "homer": {"purpose": "preserve outdoor voice", "gapAction": "duck park noise", "editableParameters": {"gateReleaseMs": 240}, "filter": "volume=1"},
            "reference": {"purpose": "clip audio", "gapAction": "only present when used", "editableParameters": {}, "filter": "volume=1"},
        },
        "qualityTargets": {"integratedLufs": -16.0, "truePeakDbfs": -1.8},
        "riskFamilies": {"homerOutdoorGap": 2, "charlieEchoUnderHomer": 1},
        "focusWindowCount": 4,
        "listenPriorityQueueCount": 8,
    }
    write_json(path, profile)
    return profile


def make_manifest(root: Path, *, with_profile: bool) -> Path:
    profile_path = root / "fixture-reusable-profile.json"
    if with_profile:
        fixture_profile(profile_path)
    manifest = {
        "baselineId": "episode-fixture-audio-baseline-v001",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "rawSources": [],
        "outputs": {},
    }
    if with_profile:
        manifest["outputs"]["latestReusableAudioProductionProfile"] = str(profile_path)
    write_json(root / "manifest.json", manifest)
    return root / "manifest.json"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Reusable Profile Intake Packet Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This smoke proves the next-episode intake packet generator can create a human/machine handoff from a reusable audio profile and fails safely when no profile exists. It does not approve audio, render media, or touch original sources.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failed scenario count: `{report['failedScenarioCount']}`",
        f"- Approval state preserved: `{str(report['approvalStatePreserved']).lower()}`",
        f"- Branch state preserved: `{str(report['branchStatePreserved']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Passed | Evidence |",
        "|---|---:|---|",
    ]
    for scenario in report["scenarios"]:
        evidence = scenario.get("evidence") or scenario.get("stderrTail") or ""
        lines.append(f"| {scenario['name']} | `{str(scenario['passed']).lower()}` | {evidence} |")
    lines.extend(["", "## Meaning", "", "Future episodes now have a tested intake packet contract: source mapping, metadata requirements, stage checklist, profile parameters, quality targets, and human-listen safeguards can be generated before any new long-form render.", ""])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    approval_before = manifest_before.get("approvalStatus")
    branch_before = (manifest_before.get("branchInheritanceReady"), manifest_before.get("branchRenderReady"))
    script = Path(__file__).with_name("audio_workbench_reusable_profile_intake_packet.py")

    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-audio-intake-packet-smoke-") as tmp:
        tmp_root = Path(tmp)
        valid_root = tmp_root / "valid"
        valid_root.mkdir()
        make_manifest(valid_root, with_profile=True)
        valid_proc = run(["python3", str(script), "--baseline-dir", str(valid_root)])
        valid_manifest = read_json(valid_root / "manifest.json")
        valid_outputs = valid_manifest.get("outputs") or {}
        entry = valid_outputs.get("latestReusableAudioProfileIntakePacket") or {}
        packet_path = output_path(entry)
        markdown_path = Path(entry.get("markdownPath", "")) if isinstance(entry, dict) and entry.get("markdownPath") else None
        packet = read_json(packet_path) if packet_path and packet_path.exists() else {}
        valid_ok = (
            valid_proc.returncode == 0
            and bool(packet_path and packet_path.exists())
            and bool(markdown_path and markdown_path.exists())
            and packet.get("futureEpisodeReadiness") == "intake-ready-profile-not-production-default"
            and len(packet.get("sourceMappingWorksheet") or []) >= 3
            and int(packet.get("sourceMappingRowCount") or 0) == len(packet.get("sourceMappingWorksheet") or [])
            and len(packet.get("stageChecklist") or []) >= 4
            and int(packet.get("stageChecklistCount") or 0) == len(packet.get("stageChecklist") or [])
            and int(packet.get("requiredInputGroupCount") or 0) == len(packet.get("requiredFutureEpisodeInputs") or [])
            and bool(packet.get("agentAccessibilityContract"))
            and valid_manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof"
            and valid_manifest.get("branchInheritanceReady") is False
            and valid_manifest.get("branchRenderReady") is False
        )
        scenarios.append(
            {
                "name": "valid-profile-intake-packet",
                "passed": valid_ok,
                "evidence": f"return={valid_proc.returncode}; sourceRows={packet.get('sourceMappingRowCount')}; stages={packet.get('stageChecklistCount')}; inputGroups={packet.get('requiredInputGroupCount')}",
                "stderrTail": valid_proc.stderr[-1000:],
            }
        )

        missing_root = tmp_root / "missing-profile"
        missing_root.mkdir()
        make_manifest(missing_root, with_profile=False)
        missing_proc = run(["python3", str(script), "--baseline-dir", str(missing_root)])
        scenarios.append(
            {
                "name": "missing-profile-fails-safely",
                "passed": missing_proc.returncode != 0 and "Missing latestReusableAudioProductionProfile" in (missing_proc.stderr + missing_proc.stdout),
                "evidence": f"return={missing_proc.returncode}",
                "stderrTail": (missing_proc.stderr + missing_proc.stdout)[-1000:],
            }
        )

    manifest_after = read_json(manifest_path)
    approval_preserved = approval_before == manifest_after.get("approvalStatus")
    branch_preserved = branch_before == (manifest_after.get("branchInheritanceReady"), manifest_after.get("branchRenderReady"))
    failed = [scenario for scenario in scenarios if not scenario["passed"]]
    baseline_id = str(manifest_after.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_json = baseline_dir / f"audio-reusable-profile-intake-packet-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-reusable-profile-intake-packet-smoke-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio-workbench.reusable-profile-intake-packet-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "passed": not failed and approval_preserved and branch_preserved,
        "scenarioCount": len(scenarios),
        "failedScenarioCount": len(failed),
        "approvalStatePreserved": approval_preserved,
        "branchStatePreserved": branch_preserved,
        "originalMediaMutated": False,
        "scenarios": scenarios,
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    manifest_final = read_json(manifest_path)
    outputs = manifest_final.setdefault("outputs", {})
    entry = {"path": str(output_json), "markdownPath": str(output_md), "generatedAt": generated_at, "passed": report["passed"], "scenarioCount": len(scenarios), "failedScenarioCount": len(failed), "originalMediaMutated": False}
    history = outputs.setdefault("reusableAudioProfileIntakePacketSmokes", [])
    history.append(entry)
    outputs["latestReusableAudioProfileIntakePacketSmoke"] = entry
    outputs["latestReusableAudioProfileIntakePacketSmokeMarkdown"] = str(output_md)
    manifest_final["reusableAudioProfileIntakePacketSmokeCount"] = len(history)
    manifest_final["reusableAudioProfileIntakePacketSmokePassed"] = bool(report["passed"])
    manifest_final["reusableAudioProfileIntakePacketSmokeScenarioCount"] = len(scenarios)
    manifest_final["reusableAudioProfileIntakePacketSmokeFailedScenarioCount"] = len(failed)
    manifest_final["reusableAudioProfileIntakePacketSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_final)

    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
