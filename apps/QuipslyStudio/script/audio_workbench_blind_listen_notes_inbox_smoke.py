#!/usr/bin/env python3
"""Smoke-test blind-listen notes inbox routing.

Creates synthetic blind-listen packets and proves pass/proof/repair/low-rating/
wrong-baseline/unknown-id/no-notes behavior without approving audio, rendering
branches, uploading, publishing, or mutating original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.blind-listen-notes.v1"
BASELINE_ID = "episode-4-conformed-production-baseline-v006-candidate-homer-preserving-clean"


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


def make_sampler(path: Path) -> Path:
    sampler_path = path / "AUDIO_BLIND_LISTEN_SAMPLER.json"
    samples = [
        {
            "blindId": "BLIND-01",
            "startSeconds": 10.0,
            "endSeconds": 22.0,
            "durationSeconds": 12.0,
            "listenTimecode": "00:10",
            "hiddenReveal": {
                "defectAtlasItemId": "technical-audition-0001-sibilance",
                "stage": "technical-audition",
                "severity": "high",
                "title": "Sibilance check",
                "nextAction": "Listen before repair.",
            },
        },
        {
            "blindId": "BLIND-02",
            "startSeconds": 40.0,
            "endSeconds": 55.0,
            "durationSeconds": 15.0,
            "listenTimecode": "00:40",
            "hiddenReveal": {
                "defectAtlasItemId": "speaker-cleanup-0002-gate",
                "stage": "speaker-cleanup",
                "severity": "medium",
                "title": "Gate naturalness",
                "nextAction": "Check reactions survive.",
            },
        },
    ]
    write_json(sampler_path, {"schema": "quipsly.audio-workbench.blind-listen-sampler.v1", "baselineId": BASELINE_ID, "status": "blind-listen-sampler-ready", "sampleCount": len(samples), "hiddenRevealCount": len(samples), "stageStratumCount": 2, "severityStratumCount": 2, "samples": samples, "approvalStateChanged": False, "branchStateChanged": False, "renderAttempted": False, "uploadAttempted": False, "publicationAttempted": False, "originalMediaMutated": False})
    return sampler_path


def make_manifest(path: Path, baseline_id: str = BASELINE_ID) -> None:
    sampler_path = make_sampler(path)
    write_json(path / "manifest.json", {"baselineId": baseline_id, "approvalStatus": "machine-candidate-needs-human-listen-proof", "branchInheritanceReady": False, "branchRenderReady": False, "outputs": {"latestAudioBlindListenSampler": str(sampler_path)}})


def make_notes(path: Path, *, baseline_id: str = BASELINE_ID, rows: list[dict[str, Any]] | None = None) -> None:
    rows = rows or [{"blindId": "BLIND-01", "decision": "unsure", "notes": "synthetic"}]
    write_json(path, {"schema": SCHEMA, "baselineId": baseline_id, "generatedAt": datetime.now(timezone.utc).isoformat(), "notes": rows})


def run_inbox(baseline_dir: Path, search_dir: Path) -> dict[str, Any]:
    proc = subprocess.run(
        ["python3", "apps/QuipslyStudio/script/audio_workbench_blind_listen_notes_inbox.py", "--baseline-dir", str(baseline_dir), "--search-dir", str(search_dir)],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    report_path = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX.json"
    report = read_json(report_path) if report_path.exists() else {}
    return {"ok": proc.returncode == 0, "stdout": proc.stdout.strip(), "stderr": proc.stderr.strip(), "report": report}


def scenario(name: str, *, notes: dict[str, Any] | None, expect_status: str, expect_candidates: int, expect_repair: int = 0, expect_proof: int = 0, expect_pass: int = 0, expect_pending: int = 0, expect_unknown: int = 0, expect_low: int = 0) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        baseline = root / "baseline"
        search = root / "search"
        baseline.mkdir()
        search.mkdir()
        make_manifest(baseline)
        if notes:
            make_notes(search / notes.get("filename", f"{name}-blind-listen-notes.json"), baseline_id=notes.get("baselineId", BASELINE_ID), rows=notes.get("rows"))
        result = run_inbox(baseline, search)
        report = result["report"]
        safe = all(report.get(key) is False for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"))
        passed = bool(
            result["ok"]
            and report.get("status") == expect_status
            and int(report.get("matchingCandidateCount") or 0) == expect_candidates
            and int(report.get("repairActionCount") or 0) == expect_repair
            and int(report.get("focusedProofActionCount") or 0) == expect_proof
            and int(report.get("passContextCount") or 0) == expect_pass
            and int(report.get("pendingActionCount") or 0) == expect_pending
            and int(report.get("unknownBlindIdCount") or 0) == expect_unknown
            and int(report.get("lowRatingCount") or 0) == expect_low
            and safe
        )
        return {"name": name, "passed": passed, "status": report.get("status"), "matchingCandidateCount": report.get("matchingCandidateCount"), "repairActionCount": report.get("repairActionCount"), "focusedProofActionCount": report.get("focusedProofActionCount"), "passContextCount": report.get("passContextCount"), "pendingActionCount": report.get("pendingActionCount"), "unknownBlindIdCount": report.get("unknownBlindIdCount"), "lowRatingCount": report.get("lowRatingCount"), "safe": safe, "stderr": result["stderr"]}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Blind Listen Notes Inbox Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenarios: `{report['scenarioCount']}`",
        f"- Failures: `{report['failureCount']}`",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "| Scenario | Result | Status | Candidates | Repair | Proof | Pass | Pending | Unknown | Low ratings | Safe |",
        "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["scenarios"]:
        lines.append(f"| {row['name']} | {'pass' if row['passed'] else 'FAIL'} | `{row.get('status')}` | `{row.get('matchingCandidateCount')}` | `{row.get('repairActionCount')}` | `{row.get('focusedProofActionCount')}` | `{row.get('passContextCount')}` | `{row.get('pendingActionCount')}` | `{row.get('unknownBlindIdCount')}` | `{row.get('lowRatingCount')}` | `{str(row.get('safe')).lower()}` |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()
    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or BASELINE_ID)
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    scenarios = [
        scenario("no-notes", notes=None, expect_status="waiting-for-blind-listen-notes", expect_candidates=0),
        scenario("all-pass", notes={"rows": [{"blindId": "BLIND-01", "decision": "pass", "notes": "sounds okay"}, {"blindId": "BLIND-02", "decision": "pass", "notes": "sounds okay"}]}, expect_status="blind-listen-notes-found", expect_candidates=1, expect_pass=2),
        scenario("needs-proof", notes={"rows": [{"blindId": "BLIND-01", "decision": "needs-focused-proof", "notes": "not sure"}]}, expect_status="blind-listen-notes-found", expect_candidates=1, expect_proof=1),
        scenario("needs-repair", notes={"rows": [{"blindId": "BLIND-01", "decision": "needs-repair", "notes": "bad gate"}]}, expect_status="blind-listen-notes-found", expect_candidates=1, expect_repair=1),
        scenario("low-rating", notes={"rows": [{"blindId": "BLIND-01", "decision": "pass", "clarityScore": "2", "notes": "technically pass but strained"}]}, expect_status="blind-listen-notes-found", expect_candidates=1, expect_proof=1, expect_low=1),
        scenario("unknown-id", notes={"rows": [{"blindId": "BLIND-99", "decision": "needs-repair", "notes": "bad id"}]}, expect_status="blind-listen-notes-incomplete", expect_candidates=1, expect_unknown=1),
        scenario("wrong-baseline", notes={"baselineId": "wrong-baseline", "rows": [{"blindId": "BLIND-01", "decision": "pass", "notes": "wrong"}]}, expect_status="waiting-for-blind-listen-notes", expect_candidates=0),
    ]
    failure_count = sum(1 for row in scenarios if not row["passed"])
    report = {
        "schema": "quipsly.audio-workbench.blind-listen-notes-inbox-smoke.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "passed": failure_count == 0,
        "scenarioCount": len(scenarios),
        "failureCount": failure_count,
        "scenarios": scenarios,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    stable_json = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX_SMOKE.json"
    stable_md = baseline_dir / "AUDIO_BLIND_LISTEN_NOTES_INBOX_SMOKE.md"
    version_json = baseline_dir / f"audio-blind-listen-notes-inbox-smoke-{slug}-{generated_at}.json"
    version_md = baseline_dir / f"audio-blind-listen-notes-inbox-smoke-{slug}-{generated_at}.md"
    report.update({"json": str(stable_json), "markdown": str(stable_md), "versionedJson": str(version_json), "versionedMarkdown": str(version_md)})
    markdown = render_markdown(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioBlindListenNotesInboxSmoke"] = str(stable_json)
    outputs["latestAudioBlindListenNotesInboxSmokeMarkdown"] = str(stable_md)
    outputs.setdefault("audioBlindListenNotesInboxSmokes", []).append(str(version_json))
    manifest_after["audioBlindListenNotesInboxSmokePassed"] = report["passed"]
    manifest_after["audioBlindListenNotesInboxSmokeScenarioCount"] = len(scenarios)
    manifest_after["audioBlindListenNotesInboxSmokeFailureCount"] = failure_count
    manifest_after["audioBlindListenNotesInboxSmokeApprovalStateChanged"] = False
    manifest_after["audioBlindListenNotesInboxSmokeBranchStateChanged"] = False
    manifest_after["audioBlindListenNotesInboxSmokeRenderAttempted"] = False
    manifest_after["audioBlindListenNotesInboxSmokeUploadAttempted"] = False
    manifest_after["audioBlindListenNotesInboxSmokePublicationAttempted"] = False
    manifest_after["audioBlindListenNotesInboxSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "passed": report["passed"], "scenarioCount": len(scenarios), "failureCount": failure_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
