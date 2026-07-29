#!/usr/bin/env python3
"""Smoke-test Human Listen Mission Reel notes inbox routing.

Creates synthetic notes packets and proves no-notes, pending-template,
pass/proof/repair, and wrong-baseline behavior without approving audio,
rendering branches, uploading, publishing, or mutating original media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio-workbench.human-listen-mission-reel-notes.v1"
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


def make_manifest(path: Path, baseline_id: str = BASELINE_ID) -> None:
    write_json(
        path / "manifest.json",
        {
            "baselineId": baseline_id,
            "approvalStatus": "machine-candidate-needs-human-listen-proof",
            "branchInheritanceReady": False,
            "branchRenderReady": False,
            "outputs": {},
        },
    )


def make_notes(path: Path, *, baseline_id: str = BASELINE_ID, overall: str = "pending", decisions: list[str] | None = None) -> None:
    decisions = decisions or ["pending"]
    rows = []
    for index, decision in enumerate(decisions, start=1):
        rows.append(
            {
                "index": index,
                "windowIndex": index,
                "label": f"synthetic window {index}",
                "reelTimecode": f"0:{index:02d} - 0:{index + 1:02d}",
                "sourceTimecode": f"1:{index:02d} - 1:{index + 1:02d}",
                "decision": decision,
                "reviewerNotes": "synthetic smoke note",
                "repairHint": "synthetic route",
            }
        )
    write_json(
        path,
        {
            "schema": SCHEMA,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "exportedAt": datetime.now(timezone.utc).isoformat(),
            "baselineId": baseline_id,
            "overallDecision": overall,
            "rows": rows,
            "approvalDecisionAllowed": False,
            "branchInheritanceDecisionAllowed": False,
        },
    )


def run_inbox(baseline_dir: Path, search_dir: Path) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_human_listen_mission_reel_notes_inbox.py",
            "--baseline-dir",
            str(baseline_dir),
            "--search-dir",
            str(search_dir),
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
        check=False,
    )
    parsed: dict[str, Any] = {}
    if proc.stdout.strip().startswith("{"):
        parsed = json.loads(proc.stdout)
    report_path = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX.json"
    report = read_json(report_path) if report_path.exists() else {}
    return {"ok": proc.returncode == 0, "stdout": parsed, "stderr": proc.stderr.strip(), "report": report}


def scenario(name: str, *, notes: dict[str, Any] | None, expect_status: str, expect_decision: str, expect_count: int) -> dict[str, Any]:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        baseline = root / "baseline"
        search = root / "search"
        baseline.mkdir()
        search.mkdir()
        make_manifest(baseline)
        if notes:
            make_notes(
                search / notes.get("filename", f"{name}-mission-reel-notes.json"),
                baseline_id=notes.get("baselineId", BASELINE_ID),
                overall=notes.get("overall", "pending"),
                decisions=notes.get("decisions", ["pending"]),
            )
        result = run_inbox(baseline, search)
        report = result["report"]
        safe = all(
            report.get(key) is False
            for key in (
                "approvalStateChanged",
                "branchStateChanged",
                "renderAttempted",
                "branchRenderAttempted",
                "uploadAttempted",
                "publicationAttempted",
                "originalMediaMutated",
            )
        )
        passed = bool(
            result["ok"]
            and report.get("status") == expect_status
            and report.get("missionReelDecision") == expect_decision
            and int(report.get("matchingCandidateCount") or 0) == expect_count
            and safe
        )
        return {
            "name": name,
            "passed": passed,
            "status": report.get("status"),
            "decision": report.get("missionReelDecision"),
            "matchingCandidateCount": report.get("matchingCandidateCount"),
            "safe": safe,
            "stderr": result["stderr"],
        }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Human Listen Mission Reel Notes Inbox Smoke",
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
        "| Scenario | Result | Status | Decision | Candidates | Safe |",
        "|---|---:|---|---|---:|---:|",
    ]
    for row in report["scenarios"]:
        lines.append(f"| {row['name']} | {'pass' if row['passed'] else 'FAIL'} | `{row.get('status')}` | `{row.get('decision')}` | `{row.get('matchingCandidateCount')}` | `{str(row.get('safe')).lower()}` |")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or BASELINE_ID)
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    scenarios = [
        scenario("no-notes", notes=None, expect_status="waiting-for-mission-reel-notes", expect_decision="none", expect_count=0),
        scenario("pending-template", notes={"overall": "pending", "decisions": ["pending", "pending"]}, expect_status="notes-incomplete", expect_decision="mission-reel-notes-incomplete", expect_count=1),
        scenario("all-pass", notes={"overall": "pass", "decisions": ["pass", "pass"]}, expect_status="notes-found", expect_decision="mission-reel-focused-pass", expect_count=1),
        scenario("needs-proof", notes={"overall": "needs-focused-proof", "decisions": ["pass", "needs-focused-proof"]}, expect_status="notes-found", expect_decision="mission-reel-needs-focused-proof", expect_count=1),
        scenario("needs-repair", notes={"overall": "needs-scoped-repair", "decisions": ["pass", "needs-scoped-repair"]}, expect_status="notes-found", expect_decision="mission-reel-needs-scoped-repair", expect_count=1),
        scenario("wrong-baseline", notes={"baselineId": "wrong-baseline", "overall": "pass", "decisions": ["pass"]}, expect_status="waiting-for-mission-reel-notes", expect_decision="none", expect_count=0),
    ]
    failure_count = sum(1 for item in scenarios if not item["passed"])
    report = {
        "schema": "quipsly.audio-workbench.human-listen-mission-reel-notes-inbox-smoke.v1",
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
    stable_json = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX_SMOKE.json"
    stable_md = baseline_dir / "HUMAN_LISTEN_MISSION_REEL_NOTES_INBOX_SMOKE.md"
    version_json = baseline_dir / f"human-listen-mission-reel-notes-inbox-smoke-{slug}-{generated_at}.json"
    version_md = baseline_dir / f"human-listen-mission-reel-notes-inbox-smoke-{slug}-{generated_at}.md"
    report.update({"json": str(stable_json), "markdown": str(stable_md), "versionedJson": str(version_json), "versionedMarkdown": str(version_md)})
    markdown = render_markdown(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    outputs["latestAudioHumanListenMissionReelNotesInboxSmoke"] = str(stable_json)
    outputs["latestAudioHumanListenMissionReelNotesInboxSmokeMarkdown"] = str(stable_md)
    history = outputs.setdefault("audioHumanListenMissionReelNotesInboxSmokes", [])
    if isinstance(history, list):
        history.append(str(version_json))
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeCount"] = int(manifest_after.get("audioHumanListenMissionReelNotesInboxSmokeCount") or 0) + 1
    manifest_after["audioHumanListenMissionReelNotesInboxSmokePassed"] = report["passed"]
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeScenarioCount"] = len(scenarios)
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeFailureCount"] = failure_count
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeApprovalStateChanged"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeBranchStateChanged"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeRenderAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeBranchRenderAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeUploadAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokePublicationAttempted"] = False
    manifest_after["audioHumanListenMissionReelNotesInboxSmokeOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps({"json": str(stable_json), "markdown": str(stable_md), "passed": report["passed"], "scenarioCount": len(scenarios), "failureCount": failure_count}, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
