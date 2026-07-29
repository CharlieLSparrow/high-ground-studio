#!/usr/bin/env python3
"""Smoke-test the marker-review notes inbox without mutating real approval truth.

The smoke copies the baseline manifest into a temporary baseline, creates
synthetic exported marker-review notes, and runs the inbox against that temp
baseline. It verifies:

- no-notes state is reported calmly
- all-pass notes are found and dry-routed as approval
- needs-repair notes are found and dry-routed as failure evidence
- wrong-baseline notes are ignored
- the real manifest approval/branch state is preserved

It registers only the smoke report on the real manifest. It does not approve
audio, fail audio, render branches, upload files, or mutate original media.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MARKER_REVIEW_SCHEMA = "quipsly.audio-workbench.marker-review-notes.v1"


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
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def load_markers(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    marker_packet_path = output_path((manifest.get("outputs") or {}).get("latestEditorMarkerPacket"))
    if marker_packet_path and Path(marker_packet_path).exists():
        packet = read_json(Path(marker_packet_path))
        markers = packet.get("markers") or []
        if markers:
            return list(markers)
    template_path = output_path((manifest.get("outputs") or {}).get("latestEditorMarkerReviewConsoleNotesTemplate"))
    if template_path and Path(template_path).exists():
        template = read_json(Path(template_path))
        markers = template.get("markers") or []
        if markers:
            return list(markers)
    raise RuntimeError("Could not find marker definitions for synthetic notes.")


def make_notes_packet(
    *,
    manifest: dict[str, Any],
    markers: list[dict[str, Any]],
    decision: str,
    baseline_id: str | None = None,
) -> dict[str, Any]:
    marker_notes = []
    for marker in markers:
        marker_notes.append(
            {
                "markerId": marker.get("markerId"),
                "category": marker.get("category"),
                "timecodeIn": marker.get("timecodeIn"),
                "sequenceStartSeconds": marker.get("sequenceStartSeconds"),
                "decision": decision,
                "notes": f"Synthetic {decision} note for inbox smoke. Not human review.",
            }
        )
    suggested = "pending-human-listen"
    if decision == "pass":
        suggested = "human-approved-for-branch-inheritance"
    elif decision == "needs-repair":
        suggested = "failed-human-listen"
    return {
        "schema": MARKER_REVIEW_SCHEMA,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "baselineId": baseline_id or manifest.get("baselineId"),
        "approvalStatusAtExport": manifest.get("approvalStatus"),
        "humanListenStillRequiredAtExport": True,
        "overallNotes": f"Synthetic {decision} marker notes packet for inbox smoke. Not human review.",
        "markers": marker_notes,
        "suggestedDecision": suggested,
        "note": "Synthetic packet for smoke test only.",
    }


def run_inbox(temp_baseline: Path, search_dir: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "python3",
            "apps/QuipslyStudio/script/audio_workbench_marker_review_notes_inbox.py",
            "--baseline-dir",
            str(temp_baseline),
            "--search-dir",
            str(search_dir),
            "--reviewer",
            "Marker notes inbox smoke",
        ],
        cwd=repo_root(),
        text=True,
        capture_output=True,
    )
    parsed: Any = None
    if result.stdout.strip():
        try:
            parsed = json.loads(result.stdout)
        except json.JSONDecodeError:
            parsed = None
    report = None
    if isinstance(parsed, dict) and parsed.get("json") and Path(parsed["json"]).exists():
        report = read_json(Path(parsed["json"]))
    return {
        "args": result.args,
        "returncode": result.returncode,
        "ok": result.returncode == 0,
        "stdout": result.stdout.strip(),
        "stderr": result.stderr.strip(),
        "parsedStdout": parsed,
        "report": report,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Marker Review Notes Inbox Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke uses temporary manifests and synthetic notes packets. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Verdict",
        "",
        f"- Smoke passed: `{str(report['smokePassed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- No-notes state OK: `{str(report['noNotesStateOk']).lower()}`",
        f"- All-pass notes dry-routed OK: `{str(report['allPassNotesDryRoutedOk']).lower()}`",
        f"- Needs-repair notes dry-routed OK: `{str(report['needsRepairNotesDryRoutedOk']).lower()}`",
        f"- Wrong-baseline notes ignored OK: `{str(report['wrongBaselineIgnoredOk']).lower()}`",
        "",
        "## Steps",
        "",
        "| Step | OK | Detail |",
        "|---|---:|---|",
    ]
    for step in report["steps"]:
        detail = step.get("detail") or ""
        lines.append(f"| {step['name']} | `{str(step['ok']).lower()}` | {detail} |")
    if report["errors"]:
        lines.extend(["", "## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
    lines.extend(
        [
            "",
            "## Guardrail",
            "",
            "This proves routing only. Real branch inheritance still requires an actual human listen and the guarded decision bridge with confirmation.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    real_manifest_path = baseline_dir / "manifest.json"
    real_before = read_json(real_manifest_path)
    approval_before = {
        "approvalStatus": real_before.get("approvalStatus"),
        "branchInheritanceReady": bool(real_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_before.get("branchRenderReady")),
    }
    real_hash_before = sha256(real_manifest_path)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_at = datetime.now(timezone.utc).isoformat()
    markers = load_markers(real_before)

    steps: list[dict[str, Any]] = []
    errors: list[str] = []

    with tempfile.TemporaryDirectory(prefix="quipsly-marker-inbox-smoke-") as temp_text:
        temp_root = Path(temp_text)
        temp_baseline = temp_root / "baseline"
        temp_baseline.mkdir()
        shutil.copy2(real_manifest_path, temp_baseline / "manifest.json")

        empty_dir = temp_root / "empty-notes"
        empty_dir.mkdir()
        no_notes = run_inbox(temp_baseline, empty_dir)
        no_notes_report = no_notes.get("report") or {}
        no_notes_ok = bool(
            no_notes["ok"]
            and no_notes_report
            and len(no_notes_report.get("matchingCandidates") or []) == 0
            and not no_notes_report.get("selectedCandidate")
            and not no_notes_report.get("approvalStateChanged")
            and not no_notes_report.get("branchStateChanged")
            and not no_notes_report.get("renderAttempted")
            and not no_notes_report.get("originalMediaMutated")
        )
        steps.append({"name": "no-notes state", "ok": no_notes_ok, "detail": "expected no selected candidate"})

        pass_dir = temp_root / "pass-notes"
        pass_dir.mkdir()
        pass_notes_path = pass_dir / f"{baseline_id}-marker-review-notes-pass.json"
        write_json(pass_notes_path, make_notes_packet(manifest=real_before, markers=markers, decision="pass"))
        pass_run = run_inbox(temp_baseline, pass_dir)
        pass_report = pass_run.get("report") or {}
        pass_candidate = pass_report.get("selectedCandidate") or {}
        pass_dry_run = pass_report.get("bridgeDryRun") or {}
        pass_ok = bool(
            pass_run["ok"]
            and pass_candidate.get("suggestedDecisionStatus") == "human-approved-for-branch-inheritance"
            and pass_dry_run.get("ok")
            and pass_report.get("approvalStateChanged") is False
            and pass_report.get("branchStateChanged") is False
            and pass_report.get("renderAttempted") is False
            and pass_report.get("originalMediaMutated") is False
        )
        steps.append({"name": "all-pass notes dry-route", "ok": pass_ok, "detail": "expected approval dry-run only"})

        repair_dir = temp_root / "repair-notes"
        repair_dir.mkdir()
        repair_notes_path = repair_dir / f"{baseline_id}-marker-review-notes-repair.json"
        write_json(repair_notes_path, make_notes_packet(manifest=real_before, markers=markers, decision="needs-repair"))
        repair_run = run_inbox(temp_baseline, repair_dir)
        repair_report = repair_run.get("report") or {}
        repair_candidate = repair_report.get("selectedCandidate") or {}
        repair_dry_run = repair_report.get("bridgeDryRun") or {}
        repair_ok = bool(
            repair_run["ok"]
            and repair_candidate.get("suggestedDecisionStatus") == "failed-human-listen"
            and repair_dry_run.get("ok")
            and repair_report.get("approvalStateChanged") is False
            and repair_report.get("branchStateChanged") is False
            and repair_report.get("renderAttempted") is False
            and repair_report.get("originalMediaMutated") is False
        )
        steps.append({"name": "needs-repair notes dry-route", "ok": repair_ok, "detail": "expected failure dry-run only"})

        wrong_dir = temp_root / "wrong-baseline-notes"
        wrong_dir.mkdir()
        wrong_notes_path = wrong_dir / "wrong-baseline-marker-review-notes.json"
        write_json(
            wrong_notes_path,
            make_notes_packet(
                manifest=real_before,
                markers=markers,
                decision="pass",
                baseline_id="wrong-baseline-for-smoke",
            ),
        )
        wrong_run = run_inbox(temp_baseline, wrong_dir)
        wrong_report = wrong_run.get("report") or {}
        ignored_reasons = " ".join(str(item.get("reason") or "") for item in wrong_report.get("ignoredFiles") or [])
        wrong_ok = bool(
            wrong_run["ok"]
            and len(wrong_report.get("matchingCandidates") or []) == 0
            and "wrong baselineId" in ignored_reasons
        )
        steps.append({"name": "wrong-baseline ignored", "ok": wrong_ok, "detail": "expected ignored wrong baseline"})

    real_after = read_json(real_manifest_path)
    approval_after = {
        "approvalStatus": real_after.get("approvalStatus"),
        "branchInheritanceReady": bool(real_after.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_after.get("branchRenderReady")),
    }
    real_approval_preserved = approval_before == approval_after

    for step in steps:
        if not step["ok"]:
            errors.append(f"Step failed: {step['name']}")
    if not real_approval_preserved:
        errors.append(f"Real approval/branch state changed: {approval_before} -> {approval_after}")

    report = {
        "schema": "quipsly.audio-workbench.marker-review-notes-inbox-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "realManifestSha256Before": real_hash_before,
        "approvalStateBefore": approval_before,
        "approvalStateAfter": approval_after,
        "realApprovalStatePreserved": real_approval_preserved,
        "noNotesStateOk": steps[0]["ok"],
        "allPassNotesDryRoutedOk": steps[1]["ok"],
        "needsRepairNotesDryRoutedOk": steps[2]["ok"],
        "wrongBaselineIgnoredOk": steps[3]["ok"],
        "smokePassed": not errors,
        "steps": steps,
        "errors": errors,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }

    json_path = baseline_dir / f"audio-marker-review-notes-inbox-smoke-{slug}-{timestamp}.json"
    md_path = baseline_dir / f"audio-marker-review-notes-inbox-smoke-{slug}-{timestamp}.md"
    write_json(json_path, report)
    md_path.write_text(markdown(report), encoding="utf-8")

    manifest = read_json(real_manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestMarkerReviewNotesInboxSmoke"] = str(json_path)
    outputs["latestMarkerReviewNotesInboxSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("markerReviewNotesInboxSmokes", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["markerReviewNotesInboxSmokeCount"] = len(history)
    write_json(real_manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "markdown": str(md_path),
                "json": str(json_path),
                "smokePassed": report["smokePassed"],
                "realApprovalStatePreserved": real_approval_preserved,
                "noNotesStateOk": report["noNotesStateOk"],
                "allPassNotesDryRoutedOk": report["allPassNotesDryRoutedOk"],
                "needsRepairNotesDryRoutedOk": report["needsRepairNotesDryRoutedOk"],
                "wrongBaselineIgnoredOk": report["wrongBaselineIgnoredOk"],
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
                "originalMediaMutated": False,
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
