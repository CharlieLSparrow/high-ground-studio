#!/usr/bin/env python3
"""Smoke-test the speaker-cleanup triage notes inbox.

The real v006 baseline stays locked. This script builds temporary baseline copies,
feeds synthetic exported triage notes into the inbox, and registers a smoke report
on the real manifest.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.speaker-cleanup-triage-notes.v1"


@dataclass(frozen=True)
class Scenario:
    name: str
    notes: list[dict[str, Any]]
    expected_count: int
    expected_decision: str | None
    expected_status: str | None


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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def triage_packet(*, baseline_id: str, overall: str, rows: list[str]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "baselineId": baseline_id,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "overallDecision": overall,
        "rows": [
            {
                "index": index,
                "timecode": f"00:{index:02d}:00",
                "decision": decision,
                "symptomHeard": f"synthetic {decision} symptom {index}",
                "repairRequest": f"synthetic {decision} route {index}",
            }
            for index, decision in enumerate(rows, start=1)
        ],
    }


def scenarios(baseline_id: str) -> list[Scenario]:
    return [
        Scenario(
            name="no-notes",
            notes=[],
            expected_count=0,
            expected_decision=None,
            expected_status=None,
        ),
        Scenario(
            name="all-pass-focused",
            notes=[triage_packet(baseline_id=baseline_id, overall="pass", rows=["pass", "pass", "pass"])],
            expected_count=1,
            expected_decision="speaker-cleanup-passed",
            expected_status="pending-human-listen",
        ),
        Scenario(
            name="needs-more-proof",
            notes=[triage_packet(baseline_id=baseline_id, overall="needs-proof", rows=["pass", "needs-proof"])],
            expected_count=1,
            expected_decision="needs-more-proof",
            expected_status="needs-focused-proof",
        ),
        Scenario(
            name="needs-scoped-repair",
            notes=[triage_packet(baseline_id=baseline_id, overall="needs-repair", rows=["pass", "needs-repair"])],
            expected_count=1,
            expected_decision="needs-scoped-v007-repair",
            expected_status="failed-human-listen",
        ),
        Scenario(
            name="wrong-baseline-ignored",
            notes=[triage_packet(baseline_id=f"{baseline_id}-wrong", overall="pass", rows=["pass"])],
            expected_count=0,
            expected_decision=None,
            expected_status=None,
        ),
    ]


def run_inbox(temp_baseline: Path, search_dir: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_triage_notes_inbox.py",
            "--baseline-dir",
            str(temp_baseline),
            "--no-default-search",
            "--search-dir",
            str(search_dir),
            "--reviewer",
            "speaker-cleanup-triage-smoke",
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )


def evaluate_scenario(real_manifest: dict[str, Any], scenario: Scenario, temp_root: Path) -> dict[str, Any]:
    temp_baseline = temp_root / scenario.name / "baseline"
    search_dir = temp_root / scenario.name / "notes"
    temp_baseline.mkdir(parents=True)
    search_dir.mkdir(parents=True)
    write_json(temp_baseline / "manifest.json", real_manifest)
    for index, packet in enumerate(scenario.notes, start=1):
        write_json(search_dir / f"speaker-cleanup-triage-notes-{scenario.name}-{index}.json", packet)

    proc = run_inbox(temp_baseline, search_dir)
    if proc.returncode != 0:
        return {
            "name": scenario.name,
            "passed": False,
            "reason": "inbox command failed",
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }

    manifest = read_json(temp_baseline / "manifest.json")
    outputs = manifest.get("outputs") or {}
    report_path = output_path(outputs.get("latestSpeakerCleanupTriageNotesInbox"))
    report = read_json(Path(report_path)) if report_path else {}
    selected = report.get("selectedCandidate") or {}
    failures: list[str] = []
    if int(report.get("matchingCandidateCount") or 0) != scenario.expected_count:
        failures.append(f"candidate count {report.get('matchingCandidateCount')} != {scenario.expected_count}")
    if (selected.get("speakerCleanupTriageDecision") if selected else None) != scenario.expected_decision:
        failures.append(f"decision {selected.get('speakerCleanupTriageDecision') if selected else None} != {scenario.expected_decision}")
    if (selected.get("suggestedDecisionStatus") if selected else None) != scenario.expected_status:
        failures.append(f"status {selected.get('suggestedDecisionStatus') if selected else None} != {scenario.expected_status}")
    if report.get("approvalStateChanged") is not False:
        failures.append("approval state changed")
    if report.get("branchStateChanged") is not False:
        failures.append("branch state changed")
    if report.get("renderAttempted") is not False:
        failures.append("render attempted")
    if report.get("uploadAttempted") is not False:
        failures.append("upload attempted")
    if report.get("publicationAttempted") is not False:
        failures.append("publication attempted")
    if report.get("originalMediaMutated") is not False:
        failures.append("original media mutated")
    if scenario.expected_count and not ((report.get("decisionDryRun") or {}).get("ok")):
        failures.append("decision dry-run did not pass")

    return {
        "name": scenario.name,
        "passed": not failures,
        "failures": failures,
        "candidateCount": report.get("matchingCandidateCount"),
        "selectedDecision": selected.get("speakerCleanupTriageDecision") if selected else None,
        "suggestedStatus": selected.get("suggestedDecisionStatus") if selected else None,
        "decisionDryRunOk": (report.get("decisionDryRun") or {}).get("ok") if selected else None,
        "approvalStateChanged": report.get("approvalStateChanged"),
        "branchStateChanged": report.get("branchStateChanged"),
        "renderAttempted": report.get("renderAttempted"),
        "uploadAttempted": report.get("uploadAttempted"),
        "publicationAttempted": report.get("publicationAttempted"),
        "originalMediaMutated": report.get("originalMediaMutated"),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Speaker Cleanup Triage Notes Inbox Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This smoke proves the triage-notes return path without changing approval, branch, render, upload, publication, or original-media state.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failure count: `{report['failureCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Passed | Candidate count | Decision | Suggested status | Dry-run | Failures |",
        "|---|---:|---:|---|---|---:|---|",
    ]
    for scenario in report["scenarios"]:
        failures = "; ".join(scenario.get("failures") or []) or "none"
        lines.append(
            f"| {scenario['name']} | `{str(scenario['passed']).lower()}` | `{scenario.get('candidateCount')}` | `{scenario.get('selectedDecision')}` | `{scenario.get('suggestedStatus')}` | `{scenario.get('decisionDryRunOk')}` | {failures} |"
        )
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "A passed smoke means the notes inbox route is safe to use. It still does not approve the audio spine or unlock branch rendering.",
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
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    with tempfile.TemporaryDirectory(prefix="quipsly-speaker-cleanup-triage-inbox-smoke-") as tmp:
        temp_root = Path(tmp)
        results = [evaluate_scenario(manifest_before, scenario, temp_root) for scenario in scenarios(baseline_id)]

    failure_count = sum(0 if result.get("passed") else 1 for result in results)
    output_json = baseline_dir / f"speaker-cleanup-triage-notes-inbox-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"speaker-cleanup-triage-notes-inbox-smoke-{slug}-{generated_at}.md"
    stable_json = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_NOTES_INBOX_SMOKE.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_TRIAGE_NOTES_INBOX_SMOKE.md"
    report = {
        "schema": "quipsly.audio-workbench.speaker-cleanup-triage-notes-inbox-smoke.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "passed": failure_count == 0,
        "scenarioCount": len(results),
        "failureCount": failure_count,
        "scenarios": results,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
        "stableJson": str(stable_json),
        "stableMarkdown": str(stable_md),
    }
    markdown = render_markdown(report)
    for path in (output_json, stable_json):
        write_json(path, report)
    for path in (output_md, stable_md):
        path.write_text(markdown, encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestSpeakerCleanupTriageNotesInboxSmoke"] = str(stable_json)
    outputs["latestSpeakerCleanupTriageNotesInboxSmokeMarkdown"] = str(stable_md)
    history = outputs.setdefault("speakerCleanupTriageNotesInboxSmokes", [])
    if isinstance(history, list):
        history.append(str(output_json))
    manifest_after["speakerCleanupTriageNotesInboxSmokeCount"] = int(manifest_after.get("speakerCleanupTriageNotesInboxSmokeCount") or 0) + 1
    manifest_after["speakerCleanupTriageNotesInboxSmokePassed"] = bool(report["passed"])
    manifest_after["speakerCleanupTriageNotesInboxSmokeScenarioCount"] = len(results)
    manifest_after["speakerCleanupTriageNotesInboxSmokeFailureCount"] = failure_count
    manifest_after["speakerCleanupTriageNotesInboxSmokeApprovalStateChanged"] = False
    manifest_after["speakerCleanupTriageNotesInboxSmokeBranchStateChanged"] = False
    manifest_after["speakerCleanupTriageNotesInboxSmokeRenderAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxSmokeUploadAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxSmokePublicationAttempted"] = False
    manifest_after["speakerCleanupTriageNotesInboxSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "passed": report["passed"], "scenarioCount": len(results), "failureCount": failure_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
