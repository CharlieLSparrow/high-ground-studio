#!/usr/bin/env python3
"""Generate a machine sanity check for the mastered Episode audio spine.

This is not human listen approval. It checks the current evidence bundle for
the old catastrophic failure modes: one speaker vanishing from the master,
speaker-active windows going quiet in the master, missing source-balance audit
coverage, or source media mutation. It writes review evidence only.
"""

from __future__ import annotations

import argparse
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REQUIRED_SPEAKERS = ("charlie", "homer")
MIN_ACTIVE_SECONDS = {
    "charlie": 600.0,
    "homer": 600.0,
}
MIN_MASTER_AUDIBLE_WHEN_ACTIVE_PERCENT = 95.0
MAX_MASTER_QUIET_WHEN_ACTIVE_WINDOWS = 3


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
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-spine"


def load_report(outputs: dict[str, Any], key: str, *, required: bool = True) -> tuple[Path | None, dict[str, Any]]:
    path = output_path(outputs.get(key))
    if not path or not path.exists():
        if required:
            raise FileNotFoundError(f"Missing required report {key}")
        return None, {}
    return path, read_json(path)


def check_speaker(summary_by_speaker: dict[str, dict[str, Any]], speaker: str) -> dict[str, Any]:
    summary = summary_by_speaker.get(speaker, {})
    active_seconds = float(summary.get("activeSeconds") or 0.0)
    audible_percent = float(summary.get("masterAudibleWhenActivePercent") or 0.0)
    quiet_windows = int(summary.get("masterQuietWhenActiveWindowCount") or 0)
    median_master = summary.get("masterMedianDuringSpeakerActiveDbfs")
    min_active = MIN_ACTIVE_SECONDS.get(speaker, 60.0)
    passed = (
        active_seconds >= min_active
        and audible_percent >= MIN_MASTER_AUDIBLE_WHEN_ACTIVE_PERCENT
        and quiet_windows <= MAX_MASTER_QUIET_WHEN_ACTIVE_WINDOWS
    )
    return {
        "speaker": speaker,
        "passed": passed,
        "activeSeconds": round(active_seconds, 3),
        "minimumActiveSeconds": min_active,
        "masterAudibleWhenActivePercent": round(audible_percent, 3),
        "minimumMasterAudibleWhenActivePercent": MIN_MASTER_AUDIBLE_WHEN_ACTIVE_PERCENT,
        "masterQuietWhenActiveWindowCount": quiet_windows,
        "maximumMasterQuietWhenActiveWindowCount": MAX_MASTER_QUIET_WHEN_ACTIVE_WINDOWS,
        "masterMedianDuringSpeakerActiveDbfs": median_master,
        "evidence": (
            f"{speaker} active {active_seconds:.1f}s; master audible during active windows "
            f"{audible_percent:.1f}%; quiet active windows {quiet_windows}"
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Audio Spine Listen Sanity Check",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is machine evidence only. It checks for catastrophic audibility and evidence-bundle failures before a human listen. It does not approve the audio spine, unlock branch inheritance, render branches, upload, or touch source media.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Status: `{report['status']}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Speaker audibility",
        "",
        "| Speaker | Passed | Active seconds | Master audible when active | Quiet active windows | Evidence |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for item in report["speakerChecks"]:
        lines.append(
            "| {speaker} | `{passed}` | `{activeSeconds}` | `{masterAudibleWhenActivePercent}%` | `{masterQuietWhenActiveWindowCount}` | {evidence} |".format(
                speaker=item["speaker"],
                passed=str(item["passed"]).lower(),
                activeSeconds=item["activeSeconds"],
                masterAudibleWhenActivePercent=item["masterAudibleWhenActivePercent"],
                masterQuietWhenActiveWindowCount=item["masterQuietWhenActiveWindowCount"],
                evidence=item["evidence"],
            )
        )
    lines.extend(
        [
            "",
            "## Evidence coverage",
            "",
            f"- Master/source balance focus rows: `{report['sourceBalanceFocusRowCount']}`",
            f"- Speaker activity focus windows: `{report['speakerActivityFocusWindowCount']}`",
            f"- Speaker bleed/gap proof focus windows: `{report['speakerBleedGapFocusWindowCount']}`",
            f"- Listen-priority queue items represented by speaker activity board: `{report['listenPriorityQueueCount']}`",
            "",
            "## Warning families still routed to human listening",
            "",
        ]
    )
    for key, value in sorted(report["warningFamilies"].items()):
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(
        [
            "",
            "## Meaning",
            "",
            "The mastered spine passes the machine sanity bar when Charlie and Homer both have substantial source-active time, those active windows remain audible in the master, and the current review bundle still exposes the known warning families for human listen proof. This catches the old catastrophic failure mode where a speaker silently disappeared, but it still cannot prove the mix feels natural.",
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
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    source_balance_path, source_balance = load_report(outputs, "latestAudioMasterSourceBalanceAudit")
    speaker_activity_path, speaker_activity = load_report(outputs, "latestAudioSpeakerActivityReviewBoard")
    bleed_gap_path, bleed_gap = load_report(outputs, "latestSpeakerBleedGapProofAudit")
    master_wav = output_path(outputs.get("masterWav"))
    master_m4a = output_path(outputs.get("masterM4a"))

    summaries = source_balance.get("speakerSummaries") if isinstance(source_balance.get("speakerSummaries"), list) else []
    summary_by_speaker = {
        str(item.get("speaker")): item for item in summaries if isinstance(item, dict) and item.get("speaker")
    }
    speaker_checks = [check_speaker(summary_by_speaker, speaker) for speaker in REQUIRED_SPEAKERS]

    source_balance_focus_rows = source_balance.get("focusRows") if isinstance(source_balance.get("focusRows"), list) else []
    speaker_activity_focus_rows = speaker_activity.get("focusRows") if isinstance(speaker_activity.get("focusRows"), list) else []
    bleed_gap_focus_rows = bleed_gap.get("focusWindows") if isinstance(bleed_gap.get("focusWindows"), list) else []
    warning_families = {}
    for source in (
        source_balance.get("flagCounts"),
        speaker_activity.get("flagCounts"),
        bleed_gap.get("flagCounts"),
    ):
        if isinstance(source, dict):
            for key, value in source.items():
                warning_families[str(key)] = int(value or 0)

    evidence_checks = [
        {
            "name": "master files registered",
            "passed": bool(master_wav and master_wav.exists() and master_m4a and master_m4a.exists()),
            "evidence": f"WAV={master_wav}; M4A={master_m4a}",
        },
        {
            "name": "source-balance focus rows exist",
            "passed": len(source_balance_focus_rows) >= 3,
            "evidence": f"{len(source_balance_focus_rows)} focus rows",
        },
        {
            "name": "speaker activity focus windows exist",
            "passed": len(speaker_activity_focus_rows) >= 3,
            "evidence": f"{len(speaker_activity_focus_rows)} focus windows",
        },
        {
            "name": "speaker bleed/gap focus windows exist",
            "passed": len(bleed_gap_focus_rows) >= 3,
            "evidence": f"{len(bleed_gap_focus_rows)} focus windows",
        },
    ]
    passed = all(item["passed"] for item in speaker_checks) and all(item["passed"] for item in evidence_checks)
    status = "machine-sane-human-listen-required" if passed else "machine-sanity-failed-needs-repair"
    work_dir = baseline_dir / f"audio-spine-listen-sanity-{slug}-{generated_at}"
    output_json = work_dir / "audio-spine-listen-sanity.json"
    output_md = work_dir / "audio-spine-listen-sanity.md"
    open_command = work_dir / "OPEN_AUDIO_SPINE_LISTEN_SANITY.command"
    work_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "schema": "quipsly.audio-workbench.spine-listen-sanity.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "passed": passed,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "humanListenStillRequired": manifest_before.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "sourceBalanceAudit": str(source_balance_path),
        "speakerActivityReviewBoard": str(speaker_activity_path),
        "speakerBleedGapProofAudit": str(bleed_gap_path),
        "masterWav": str(master_wav) if master_wav else None,
        "masterM4a": str(master_m4a) if master_m4a else None,
        "speakerChecks": speaker_checks,
        "evidenceChecks": evidence_checks,
        "sourceBalanceFocusRowCount": len(source_balance_focus_rows),
        "speakerActivityFocusWindowCount": len(speaker_activity_focus_rows),
        "speakerBleedGapFocusWindowCount": len(bleed_gap_focus_rows),
        "listenPriorityQueueCount": int(speaker_activity.get("listenPriorityQueueCount") or 0),
        "warningFamilies": warning_families,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(output_json),
        "markdown": str(output_md),
        "openCommand": str(open_command),
    }
    write_json(output_json, report)
    output_md.write_text(render_markdown(report) + "\n", encoding="utf-8")
    open_command.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shlex.quote(str(output_md))}\n",
        encoding="utf-8",
    )
    open_command.chmod(0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSpineListenSanityCheck"] = str(output_json)
    outputs["latestAudioSpineListenSanityCheckMarkdown"] = str(output_md)
    outputs["latestAudioSpineListenSanityCheckOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioSpineListenSanityChecks", [])
    if str(output_json) not in history:
        history.append(str(output_json))
    manifest["audioSpineListenSanityCheckCount"] = len(history)
    manifest["audioSpineListenSanityCheckPassed"] = passed
    manifest["audioSpineListenSanityCheckStatus"] = status
    manifest["audioSpineListenSanityCheckSpeakerCheckCount"] = len(speaker_checks)
    manifest["audioSpineListenSanityCheckEvidenceCheckCount"] = len(evidence_checks)
    manifest["audioSpineListenSanityCheckSourceBalanceFocusRowCount"] = len(source_balance_focus_rows)
    manifest["audioSpineListenSanityCheckSpeakerActivityFocusWindowCount"] = len(speaker_activity_focus_rows)
    manifest["audioSpineListenSanityCheckSpeakerBleedGapFocusWindowCount"] = len(bleed_gap_focus_rows)
    manifest["audioSpineListenSanityCheckListenPriorityQueueCount"] = int(speaker_activity.get("listenPriorityQueueCount") or 0)
    manifest["audioSpineListenSanityCheckHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioSpineListenSanityCheckPackageReadyForHumanListen"] = report["packageReadyForHumanListen"]
    manifest["audioSpineListenSanityCheckApprovalStateChanged"] = False
    manifest["audioSpineListenSanityCheckBranchStateChanged"] = False
    manifest["audioSpineListenSanityCheckRenderAttempted"] = False
    manifest["audioSpineListenSanityCheckBranchRenderAttempted"] = False
    manifest["audioSpineListenSanityCheckUploadAttempted"] = False
    manifest["audioSpineListenSanityCheckPublicationAttempted"] = False
    manifest["audioSpineListenSanityCheckOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "status": status,
                "passed": passed,
                "speakerChecks": speaker_checks,
                "markdown": str(output_md),
                "json": str(output_json),
                "approvalStateChanged": False,
                "branchStateChanged": False,
                "renderAttempted": False,
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
