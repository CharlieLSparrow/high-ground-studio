#!/usr/bin/env python3
"""Smoke-test Audio Defect Atlas notes inbox routing.

Creates synthetic atlas notes packets and proves pass/proof/repair/wrong-baseline/
unknown-item/no-notes behavior without approving audio, rendering branches,
uploading, publishing, or mutating original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.defect-atlas-notes.v1"
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


def make_atlas(path: Path) -> Path:
    atlas_path = path / "AUDIO_DEFECT_ATLAS.json"
    items = [
        {"id": "technical-audition-0001-sibilance", "stage": "technical-audition", "title": "Sibilance check", "severity": "high", "severityRank": 3, "startSeconds": 10.0, "endSeconds": 18.0, "timecode": "00:10", "sourceKey": "latestAudioTechnicalAuditionAudit", "artifactPath": str(path / "fake.wav")},
        {"id": "speaker-cleanup-0002-gate", "stage": "speaker-cleanup", "title": "Gate naturalness", "severity": "high", "severityRank": 3, "startSeconds": 40.0, "endSeconds": 46.0, "timecode": "00:40", "sourceKey": "latestSpeakerCleanupListenReel", "artifactPath": str(path / "fake2.wav")},
    ]
    write_json(atlas_path, {"schema": "quipsly.audio-workbench.defect-atlas.v1", "baselineId": BASELINE_ID, "status": "ready-for-stage-aware-human-listen", "summary": {"itemCount": len(items), "timedItemCount": len(items), "stageCount": 2, "highSeverityCount": 2, "missingEvidenceCount": 0}, "items": items, "approvalStateChanged": False, "branchStateChanged": False, "renderAttempted": False, "uploadAttempted": False, "publicationAttempted": False, "originalMediaMutated": False})
    return atlas_path


def make_manifest(path: Path, baseline_id: str = BASELINE_ID) -> None:
    atlas_path = make_atlas(path)
    write_json(path / "manifest.json", {"baselineId": baseline_id, "approvalStatus": "machine-candidate-needs-human-listen-proof", "branchInheritanceReady": False, "branchRenderReady": False, "outputs": {"latestAudioDefectAtlas": str(atlas_path)}})


def make_notes(path: Path, *, baseline_id: str = BASELINE_ID, overall: str = "pending", decisions: list[tuple[str, str]] | None = None) -> None:
    decisions = decisions or [("technical-audition-0001-sibilance", "pending")]
    rows = []
    for item_id, decision in decisions:
        rows.append({"atlasItemId": item_id, "decision": decision, "notes": "synthetic smoke note"})
    write_json(path, {"schema": SCHEMA, "createdAt": datetime.now(timezone.utc).isoformat(), "baselineId": baseline_id, "overallDecision": overall, "items": rows})


def run_inbox(baseline_dir: Path, search_dir: Path) -> dict[str, Any]:
    proc = subprocess.run(
        ["python3", "apps/QuipslyStudio/script/audio_workbench_defect_atlas_notes_inbox.py", "--baseline-dir", str(baseline_dir), "--search-dir", str(search_dir)],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    parsed: dict[str, Any] = {}
    if proc.stdout.strip().startswith("{"):
        parsed = json.loads(proc.stdout)
    report_path = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX.json"
    report = read_json(report_path) if report_path.exists() else {}
    return {"ok": proc.returncode == 0, "stdout": parsed, "stderr": proc.stderr.strip(), "report": report}


def scenario(name: str, *, notes: dict[str, Any] | None, expect_status: str, expect_count: int, expect_repair: int = 0, expect_proof: int = 0, expect_pass: int = 0, expect_unknown: int = 0) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        baseline = root / "baseline"
        search = root / "search"
        baseline.mkdir()
        search.mkdir()
        make_manifest(baseline)
        if notes:
            make_notes(search / notes.get("filename", f"{name}-defect-atlas-notes.json"), baseline_id=notes.get("baselineId", BASELINE_ID), overall=notes.get("overall", "pending"), decisions=notes.get("decisions", [("technical-audition-0001-sibilance", "pending")]))
        result = run_inbox(baseline, search)
        report = result["report"]
        safe = all(report.get(key) is False for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"))
        passed = bool(
            result["ok"]
            and report.get("status") == expect_status
            and int(report.get("matchingCandidateCount") or 0) == expect_count
            and int(report.get("repairActionCount") or 0) == expect_repair
            and int(report.get("focusedProofActionCount") or 0) == expect_proof
            and int(report.get("passContextCount") or 0) == expect_pass
            and int(report.get("unknownItemCount") or 0) == expect_unknown
            and safe
        )
        return {"name": name, "passed": passed, "status": report.get("status"), "matchingCandidateCount": report.get("matchingCandidateCount"), "repairActionCount": report.get("repairActionCount"), "focusedProofActionCount": report.get("focusedProofActionCount"), "passContextCount": report.get("passContextCount"), "unknownItemCount": report.get("unknownItemCount"), "safe": safe, "stderr": result["stderr"]}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Defect Atlas Notes Inbox Smoke",
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
        "| Scenario | Result | Status | Candidates | Repair | Proof | Pass | Unknown | Safe |",
        "|---|---:|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in report["scenarios"]:
        lines.append(f"| {row['name']} | {'pass' if row['passed'] else 'FAIL'} | `{row.get('status')}` | `{row.get('matchingCandidateCount')}` | `{row.get('repairActionCount')}` | `{row.get('focusedProofActionCount')}` | `{row.get('passContextCount')}` | `{row.get('unknownItemCount')}` | `{str(row.get('safe')).lower()}` |")
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
        scenario("no-notes", notes=None, expect_status="waiting-for-defect-atlas-notes", expect_count=0),
        scenario("all-pass", notes={"overall": "pass", "decisions": [("technical-audition-0001-sibilance", "pass"), ("speaker-cleanup-0002-gate", "ignore-machine-flag")]}, expect_status="atlas-notes-found", expect_count=1, expect_pass=2),
        scenario("needs-proof", notes={"overall": "needs-proof", "decisions": [("technical-audition-0001-sibilance", "needs-proof")]}, expect_status="atlas-notes-found", expect_count=1, expect_proof=1),
        scenario("needs-repair", notes={"overall": "needs-repair", "decisions": [("technical-audition-0001-sibilance", "needs-repair")]}, expect_status="atlas-notes-found", expect_count=1, expect_repair=1),
        scenario("mixed", notes={"overall": "needs-repair", "decisions": [("technical-audition-0001-sibilance", "needs-repair"), ("speaker-cleanup-0002-gate", "needs-proof")]}, expect_status="atlas-notes-found", expect_count=1, expect_repair=1, expect_proof=1),
        scenario("unknown-item", notes={"overall": "needs-repair", "decisions": [("does-not-exist", "needs-repair")]}, expect_status="atlas-notes-incomplete", expect_count=1, expect_unknown=1),
        scenario("wrong-baseline", notes={"baselineId": "wrong-baseline", "overall": "pass", "decisions": [("technical-audition-0001-sibilance", "pass")]}, expect_status="waiting-for-defect-atlas-notes", expect_count=0),
    ]
    failure_count = sum(1 for item in scenarios if not item["passed"])
    report = {
        "schema": "quipsly.audio-workbench.defect-atlas-notes-inbox-smoke.v1",
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
    stable_json = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX_SMOKE.json"
    stable_md = baseline_dir / "AUDIO_DEFECT_ATLAS_NOTES_INBOX_SMOKE.md"
    version_json = baseline_dir / f"audio-defect-atlas-notes-inbox-smoke-{slug}-{generated_at}.json"
    version_md = baseline_dir / f"audio-defect-atlas-notes-inbox-smoke-{slug}-{generated_at}.md"
    report.update({"json": str(stable_json), "markdown": str(stable_md), "versionedJson": str(version_json), "versionedMarkdown": str(version_md)})
    markdown = render_markdown(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioDefectAtlasNotesInboxSmoke"] = str(stable_json)
    outputs["latestAudioDefectAtlasNotesInboxSmokeMarkdown"] = str(stable_md)
    outputs.setdefault("audioDefectAtlasNotesInboxSmokes", []).append(str(version_json))
    manifest_after["audioDefectAtlasNotesInboxSmokeCount"] = int(manifest_after.get("audioDefectAtlasNotesInboxSmokeCount") or 0) + 1
    manifest_after["audioDefectAtlasNotesInboxSmokePassed"] = report["passed"]
    manifest_after["audioDefectAtlasNotesInboxSmokeScenarioCount"] = len(scenarios)
    manifest_after["audioDefectAtlasNotesInboxSmokeFailureCount"] = failure_count
    manifest_after["audioDefectAtlasNotesInboxSmokeApprovalStateChanged"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokeBranchStateChanged"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokeRenderAttempted"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokeBranchRenderAttempted"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokeUploadAttempted"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokePublicationAttempted"] = False
    manifest_after["audioDefectAtlasNotesInboxSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "passed": report["passed"], "scenarioCount": len(scenarios), "failureCount": failure_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
