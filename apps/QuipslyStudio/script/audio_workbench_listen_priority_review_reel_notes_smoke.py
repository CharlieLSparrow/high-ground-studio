#!/usr/bin/env python3
"""Smoke-test review-reel notes packets against the guarded notes inbox logic.

This creates synthetic notes in a temporary directory, validates that the shared
listen-priority inbox code classifies them correctly, and dry-runs the guarded
record-listen-decision command. It does not approve audio, fail audio, render
branches, upload files, write synthetic notes into the baseline folder, or mutate
original media.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import tempfile
import sys
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
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def load_inbox_module() -> Any:
    path = Path(__file__).with_name("audio_workbench_listen_priority_notes_inbox.py")
    spec = importlib.util.spec_from_file_location("audio_workbench_listen_priority_notes_inbox", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import inbox module from {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def packet_with_decisions(template: dict[str, Any], *, baseline_id: str, scenario: str) -> dict[str, Any]:
    packet = json.loads(json.dumps(template))
    packet["baselineId"] = baseline_id
    packet["exportedAt"] = "2026-07-10T14:40:00Z"
    packet["reviewer"] = "Codex smoke reviewer"
    items = packet.get("items") or []
    if scenario == "all-pass":
        packet["suggestedDecision"] = "human-approved-for-branch-inheritance"
        for item in items:
            item["decision"] = "pass"
            item["notes"] = "smoke pass"
    elif scenario == "needs-proof":
        packet["suggestedDecision"] = "needs-focused-proof"
        for index, item in enumerate(items):
            item["decision"] = "needs-proof" if index == 0 else "pass"
            item["notes"] = "smoke focused proof needed" if index == 0 else "smoke pass"
    elif scenario == "needs-repair":
        packet["suggestedDecision"] = "failed-human-listen"
        for index, item in enumerate(items):
            item["decision"] = "needs-repair" if index == 0 else "pass"
            item["notes"] = "smoke repair required" if index == 0 else "smoke pass"
    elif scenario == "wrong-baseline":
        packet["baselineId"] = "wrong-baseline-for-smoke"
        packet["suggestedDecision"] = "human-approved-for-branch-inheritance"
        for item in items:
            item["decision"] = "pass"
            item["notes"] = "wrong baseline smoke"
    else:
        raise ValueError(f"Unknown scenario: {scenario}")
    return packet


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Review Reel Notes Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke validates that notes exported by the one-play review reel use the same guarded listen-priority notes contract as the main console. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Scenario count: `{len(report['scenarios'])}`",
        "",
        "## Scenarios",
        "",
        "| Scenario | Expected | Classified | Dry-run OK | Ignored reason |",
        "|---|---:|---:|---:|---|",
    ]
    for item in report["scenarios"]:
        lines.append(
            f"| {item['scenario']} | `{item['expectedStatus']}` | `{item.get('classifiedStatus')}` | `{str(item.get('dryRunOk')).lower()}` | {item.get('ignoredReason') or ''} |"
        )
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--reviewer", default="Codex smoke reviewer")
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    reel_path = output_path(outputs.get("latestAudioListenPriorityReviewReel"))
    if not reel_path:
        raise SystemExit("Manifest does not register latestAudioListenPriorityReviewReel")
    reel = read_json(Path(reel_path))
    template_path = Path(str(reel.get("notesTemplate") or ""))
    if not template_path.exists():
        raise SystemExit(f"Missing review reel notes template: {template_path}")
    template = read_json(template_path)
    inbox = load_inbox_module()

    expected = {
        "all-pass": "human-approved-for-branch-inheritance",
        "needs-proof": "needs-focused-proof",
        "needs-repair": "failed-human-listen",
        "wrong-baseline": None,
    }
    scenarios: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="quipsly-review-reel-notes-smoke-") as tmp:
        tmp_dir = Path(tmp)
        for scenario, expected_status in expected.items():
            packet = packet_with_decisions(template, baseline_id=baseline_id, scenario=scenario)
            path = tmp_dir / f"audio-listen-priority-review-reel-notes-{scenario}.json"
            write_json(path, packet)
            candidate, ignored = inbox.classify_file(path, baseline_id)
            if expected_status is None:
                scenarios.append(
                    {
                        "scenario": scenario,
                        "expectedStatus": None,
                        "classifiedStatus": None,
                        "dryRunOk": None,
                        "ignoredReason": (ignored or {}).get("reason"),
                    }
                )
                continue
            dry_run = None
            if candidate is not None:
                dry_run = inbox.run_decision_dry_run(baseline_dir, candidate, packet, args.reviewer)
            scenarios.append(
                {
                    "scenario": scenario,
                    "expectedStatus": expected_status,
                    "classifiedStatus": candidate.suggested_status if candidate else None,
                    "dryRunOk": bool((dry_run or {}).get("ok")),
                    "dryRunReturncode": (dry_run or {}).get("returncode"),
                    "ignoredReason": (ignored or {}).get("reason") if ignored else None,
                }
            )

    passed = all(
        (
            (item["expectedStatus"] is None and item.get("ignoredReason"))
            or (item.get("classifiedStatus") == item["expectedStatus"] and item.get("dryRunOk") is True)
        )
        for item in scenarios
    )
    output_json = baseline_dir / f"audio-listen-priority-review-reel-notes-smoke-{slug}-{generated_at}.json"
    output_md = baseline_dir / f"audio-listen-priority-review-reel-notes-smoke-{slug}-{generated_at}.md"
    report = {
        "schema": "quipsly.audio.listenPriorityReviewReelNotesSmoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "reviewReel": str(reel_path),
        "notesTemplate": str(template_path),
        "passed": passed,
        "scenarios": scenarios,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
        "markdown": str(output_md),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")

    previous_approval = manifest.get("approvalStatus")
    previous_branch_inheritance = bool(manifest.get("branchInheritanceReady"))
    previous_branch_render = bool(manifest.get("branchRenderReady"))
    outputs["latestAudioListenPriorityReviewReelNotesSmoke"] = str(output_json)
    outputs["latestAudioListenPriorityReviewReelNotesSmokeMarkdown"] = str(output_md)
    history = outputs.setdefault("audioListenPriorityReviewReelNotesSmokes", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioListenPriorityReviewReelNotesSmokeCount"] = len(history)
    manifest["audioListenPriorityReviewReelNotesSmokeLatestPassed"] = passed
    manifest["approvalStatus"] = previous_approval
    manifest["branchInheritanceReady"] = previous_branch_inheritance
    manifest["branchRenderReady"] = previous_branch_render
    write_json(manifest_path, manifest)

    print(str(output_json))
    print(str(output_md))
    print(json.dumps({"passed": passed, "scenarios": scenarios}, indent=2))


if __name__ == "__main__":
    main()
