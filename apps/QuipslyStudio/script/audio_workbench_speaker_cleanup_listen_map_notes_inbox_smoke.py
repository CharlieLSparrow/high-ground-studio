#!/usr/bin/env python3
"""Smoke-test speaker-cleanup listen-map notes inbox routing.

This uses temporary baseline copies and synthetic exported notes so the real v006
manifest is not approved, failed, rendered, or mutated.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = "quipsly.audio.speaker-cleanup-listen-map-notes.v1"


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
    out = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in value.lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def packet(baseline_id: str, decisions: list[str], *, wrong_baseline: bool = False) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "baselineId": baseline_id + "-wrong" if wrong_baseline else baseline_id,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "notes": [
            {
                "index": index,
                "timecode": f"00:{index:02d}:00.000",
                "family": "synthetic cleanup window",
                "decision": decision,
                "note": f"synthetic {decision} note",
            }
            for index, decision in enumerate(decisions, start=1)
        ],
    }


def make_temp_baseline(real_manifest: dict[str, Any], temp_root: Path, name: str) -> tuple[Path, Path]:
    baseline_dir = temp_root / name / "baseline"
    search_dir = temp_root / name / "search"
    baseline_dir.mkdir(parents=True)
    search_dir.mkdir(parents=True)
    manifest = json.loads(json.dumps(real_manifest))
    manifest["outputs"] = {}
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir, search_dir


def run_inbox(baseline_dir: Path, search_dir: Path) -> dict[str, Any]:
    proc = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_speaker_cleanup_listen_map_notes_inbox.py",
            "--baseline-dir",
            str(baseline_dir),
            "--no-default-search",
            "--search-dir",
            str(search_dir),
            "--reviewer",
            "Smoke Test",
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
    parsed: Any = None
    if proc.stdout.strip():
        try:
            parsed = json.loads(proc.stdout)
        except json.JSONDecodeError:
            parsed = None
    report = read_json(Path(parsed["json"])) if parsed and parsed.get("json") else None
    return {"returncode": proc.returncode, "ok": proc.returncode == 0, "stdout": proc.stdout, "stderr": proc.stderr, "parsed": parsed, "report": report}


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Speaker Cleanup Listen Map Notes Inbox Smoke",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Passed: `{str(report['passed']).lower()}`",
        "",
        "| Scenario | OK | Matching | Cleanup decision | Suggested status | Dry-run OK |",
        "|---|---:|---:|---|---|---:|",
    ]
    for scenario in report["scenarios"]:
        lines.append(
            f"| {scenario['name']} | `{str(scenario['ok']).lower()}` | `{scenario.get('matchingCandidateCount')}` | `{scenario.get('speakerCleanupDecision') or ''}` | `{scenario.get('suggestedStatus') or ''}` | `{str(scenario.get('decisionDryRunOk')).lower()}` |"
        )
    lines.extend(
        [
            "",
            "## Real manifest safety",
            "",
            f"- Approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
            f"- Branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
            "- Render attempted: `false`",
            "- Original media mutated: `false`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    real_baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = real_baseline_dir / "manifest.json"
    real_before = read_json(manifest_path)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    cases = [
        ("no-notes", None, 0, None, None),
        ("all-pass-focused", packet(baseline_id, ["pass", "pass", "pass"]), 1, "speaker-cleanup-passed", "pending-human-listen"),
        ("needs-proof", packet(baseline_id, ["pass", "needs-proof", "pass"]), 1, "needs-proof", "needs-focused-proof"),
        ("needs-repair", packet(baseline_id, ["pass", "needs-repair", "pass"]), 1, "needs-repair", "failed-human-listen"),
        ("wrong-baseline", packet(baseline_id, ["pass"], wrong_baseline=True), 0, None, None),
    ]
    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-speaker-cleanup-inbox-smoke-") as temp_text:
        temp_root = Path(temp_text)
        for name, payload, expected_count, expected_cleanup, expected_status in cases:
            baseline_dir, search_dir = make_temp_baseline(real_before, temp_root, name)
            if payload:
                write_json(search_dir / f"{name}-speaker-cleanup-listen-map-notes.json", payload)
            result = run_inbox(baseline_dir, search_dir)
            report = result.get("report") or {}
            selected = report.get("selectedCandidate") or {}
            ok = (
                result["ok"]
                and report.get("matchingCandidateCount") == expected_count
                and (expected_cleanup is None or selected.get("speakerCleanupDecision") == expected_cleanup)
                and (expected_status is None or selected.get("suggestedDecisionStatus") == expected_status)
                and report.get("approvalStateChanged") is False
                and report.get("branchStateChanged") is False
                and report.get("renderAttempted") is False
                and report.get("originalMediaMutated") is False
            )
            scenarios.append(
                {
                    "name": name,
                    "ok": ok,
                    "returncode": result["returncode"],
                    "matchingCandidateCount": report.get("matchingCandidateCount"),
                    "expectedMatchingCandidateCount": expected_count,
                    "speakerCleanupDecision": selected.get("speakerCleanupDecision"),
                    "expectedSpeakerCleanupDecision": expected_cleanup,
                    "suggestedStatus": selected.get("suggestedDecisionStatus"),
                    "expectedSuggestedStatus": expected_status,
                    "decisionDryRunOk": (report.get("decisionDryRun") or {}).get("ok"),
                    "stderr": result["stderr"],
                }
            )

    real_after = read_json(manifest_path)
    approval_preserved = real_before.get("approvalStatus") == real_after.get("approvalStatus")
    branch_preserved = real_before.get("branchInheritanceReady") == real_after.get("branchInheritanceReady") and real_before.get("branchRenderReady") == real_after.get("branchRenderReady")
    passed = all(item["ok"] for item in scenarios) and approval_preserved and branch_preserved

    output_json = real_baseline_dir / f"speaker-cleanup-listen-map-notes-inbox-smoke-{slug}-{generated_at}.json"
    output_md = real_baseline_dir / f"speaker-cleanup-listen-map-notes-inbox-smoke-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio.speaker-cleanup-listen-map-notes-inbox-smoke.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(real_baseline_dir),
        "passed": passed,
        "scenarioCount": len(scenarios),
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
    write_json(output_json, report)
    output_md.write_text(render_markdown(report), encoding="utf-8")

    latest = read_json(manifest_path)
    outputs = latest.setdefault("outputs", {})
    outputs["latestSpeakerCleanupListenMapNotesInboxSmoke"] = str(output_json)
    outputs["latestSpeakerCleanupListenMapNotesInboxSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("speakerCleanupListenMapNotesInboxSmokes", [])
    if isinstance(history, list):
        history.append(str(output_json))
    latest["speakerCleanupListenMapNotesInboxSmokeCount"] = int(latest.get("speakerCleanupListenMapNotesInboxSmokeCount") or 0) + 1
    latest["speakerCleanupListenMapNotesInboxSmokePassed"] = passed
    latest["approvalStatus"] = real_before.get("approvalStatus")
    latest["packageReadyForHumanListen"] = bool(real_before.get("packageReadyForHumanListen"))
    latest["branchInheritanceReady"] = bool(real_before.get("branchInheritanceReady"))
    latest["branchRenderReady"] = bool(real_before.get("branchRenderReady"))
    write_json(manifest_path, latest)

    print(f"Wrote {output_md}")
    print(f"passed={passed} scenarios={len(scenarios)}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
