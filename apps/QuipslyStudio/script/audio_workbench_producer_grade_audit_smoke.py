#!/usr/bin/env python3
"""Smoke-test the producer-grade audio audit against a synthetic baseline."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
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


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def make_synthetic_baseline(temp_root: Path) -> Path:
    baseline_dir = temp_root / "baseline"
    baseline_dir.mkdir(parents=True)
    wav = baseline_dir / "master.wav"
    m4a = baseline_dir / "master.m4a"
    wav.write_bytes(b"synthetic wav placeholder")
    m4a.write_bytes(b"synthetic m4a placeholder")

    def report(name: str, payload: dict[str, Any]) -> str:
        path = baseline_dir / f"{name}.json"
        write_json(path, payload)
        return str(path)

    smoothness = report("smoothness", {
        "longSilenceSpans": [{"startSec": 15, "durationSec": 12.5}],
        "largestTransitions": [{"timeSec": 40, "classification": "large-level-jump-listen-check", "absDeltaDb": 19.2}],
        "classificationCounts": {"hard-silence-edge-listen-check": 3, "large-level-jump-listen-check": 2},
    })
    source_balance = report("source-balance", {
        "flagCounts": {"master_loud_without_registered_source": 2},
        "focusRows": [{"startSec": 30, "severity": 4, "flags": ["master_loud_without_registered_source"], "masterDbfs": -31.5}],
    })
    spine_sanity = report("spine-sanity", {
        "passed": True,
        "speakerChecks": [
            {"speaker": "charlie", "passed": True, "activeSeconds": 1000, "masterAudibleWhenActivePercent": 99.5, "masterQuietWhenActiveWindowCount": 0},
            {"speaker": "homer", "passed": True, "activeSeconds": 900, "masterAudibleWhenActivePercent": 98.9, "masterQuietWhenActiveWindowCount": 1},
        ],
    })
    queue = report("queue", {
        "queue": [
            {
                "title": "Synthetic priority moment",
                "timeSec": 15,
                "riskPriority": 1,
                "reasons": ["Synthetic long quiet span."],
            }
        ]
    })
    handoff = report("handoff", {"missingArtifactCount": 0})
    sweep_inbox = report("sweep-inbox", {"matchingCandidateCount": 0})
    sweep_smoke = report("sweep-smoke", {"passed": True})
    manifest = {
        "baselineId": "episode-4-conformed-production-baseline-synthetic",
        "approvalStatus": "machine-candidate-needs-human-listen-proof",
        "packageReadyForHumanListen": True,
        "branchInheritanceReady": False,
        "branchRenderReady": False,
        "outputs": {
            "masterWav": str(wav),
            "masterM4a": str(m4a),
            "latestAudioMasterSmoothnessAudit": smoothness,
            "latestAudioMasterSourceBalanceAudit": source_balance,
            "latestAudioSpineListenSanityCheck": spine_sanity,
            "latestAudioListenPriorityQueue": queue,
            "latestReviewHandoffIndex": handoff,
            "latestAudioWorkbenchParameterSweepNotesInbox": sweep_inbox,
            "latestAudioWorkbenchParameterSweepNotesInboxSmoke": sweep_smoke,
        },
    }
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Producer-Grade Audio Audit Smoke",
        "",
        f"Baseline: `{report['baselineId']}`",
        f"Passed: `{str(report['passed']).lower()}`",
        f"Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        "",
        "| Scenario | OK | Score | Moments |",
        "|---|---:|---:|---:|",
    ]
    for scenario in report["scenarios"]:
        lines.append(
            f"| {scenario['name']} | `{str(scenario['ok']).lower()}` | `{scenario.get('producerScore')}` | `{scenario.get('momentCount')}` |"
        )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    real_baseline = resolve_baseline_dir(args.baseline_dir)
    real_manifest_path = real_baseline / "manifest.json"
    real_before = read_json(real_manifest_path)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-producer-grade-audit-smoke-") as temp_text:
        synthetic = make_synthetic_baseline(Path(temp_text))
        proc = subprocess.run(
            ["python3", "apps/QuipslyStudio/script/audio_workbench_producer_grade_audit.py", "--baseline-dir", str(synthetic)],
            cwd=repo_root(),
            text=True,
            capture_output=True,
        )
        parsed: dict[str, Any] = {}
        if proc.stdout.strip():
            parsed = json.loads(proc.stdout)
        report = read_json(Path(parsed["json"])) if parsed.get("json") else {}
        scenarios.append({
            "name": "synthetic-happy-path",
            "ok": (
                proc.returncode == 0
                and report.get("producerScore", 0) >= 70
                and report.get("producerListenMoments")
                and report.get("approvalStateChanged") is False
                and report.get("branchStateChanged") is False
                and report.get("renderAttempted") is False
                and report.get("originalMediaMutated") is False
                and Path(report.get("html", "")).exists()
            ),
            "returncode": proc.returncode,
            "stderr": proc.stderr,
            "producerScore": report.get("producerScore"),
            "momentCount": len(report.get("producerListenMoments") or []),
        })

    real_after = read_json(real_manifest_path)
    approval_preserved = real_before.get("approvalStatus") == real_after.get("approvalStatus")
    branch_preserved = (
        real_before.get("branchInheritanceReady") == real_after.get("branchInheritanceReady")
        and real_before.get("branchRenderReady") == real_after.get("branchRenderReady")
    )
    passed = all(item["ok"] for item in scenarios) and approval_preserved and branch_preserved
    output_json = real_baseline / f"audio-producer-grade-audit-smoke-{slug}.json"
    output_md = real_baseline / f"audio-producer-grade-audit-smoke-{slug}.md"
    smoke_report = {
        "schema": "quipsly.audio-workbench.producer-grade-audit-smoke.v1",
        "baselineId": baseline_id,
        "passed": passed,
        "scenarios": scenarios,
        "realApprovalStatePreserved": approval_preserved,
        "realBranchStatePreserved": branch_preserved,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
    }
    write_json(output_json, smoke_report)
    output_md.write_text(render_markdown(smoke_report), encoding="utf-8")

    latest = read_json(real_manifest_path)
    outputs = latest.setdefault("outputs", {})
    outputs["latestAudioProducerGradeAuditSmoke"] = str(output_json)
    outputs["latestAudioProducerGradeAuditSmokeMarkdown"] = str(output_md)
    latest["audioProducerGradeAuditSmokePassed"] = passed
    latest["approvalStatus"] = real_before.get("approvalStatus")
    latest["branchInheritanceReady"] = bool(real_before.get("branchInheritanceReady"))
    latest["branchRenderReady"] = bool(real_before.get("branchRenderReady"))
    write_json(real_manifest_path, latest)

    print(json.dumps({"passed": passed, "json": str(output_json), "markdown": str(output_md)}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
