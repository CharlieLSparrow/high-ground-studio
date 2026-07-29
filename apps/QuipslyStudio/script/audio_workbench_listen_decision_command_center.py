#!/usr/bin/env python3
"""Create the Episode 4 listen-decision command center.

This is the calm handoff cockpit for the current v006 audio-spine gate. It
points Charlie at the one audio file to judge, gives Codex the exact decision
phrases/commands, and makes the source-aware branch-render invariant explicit.

It does not approve audio, unlock branch inheritance, render media, upload,
publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


READY_STATUS = "listen-decision-command-center-ready-human-listen-required"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def bool_value(value: Any) -> bool:
    return bool(value)


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "m4aPath",
            "wavPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path:
        return {}
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(report_path)
    except json.JSONDecodeError:
        return {}


def artifact(outputs: dict[str, Any], label: str, key: str, why: str, *, required: bool = True) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": bool(path and Path(path).exists()),
        "required": required,
        "why": why,
    }


def file_artifact(label: str, path: Path, why: str, *, required: bool = True) -> dict[str, Any]:
    return {
        "label": label,
        "key": label.lower().replace(" ", "-"),
        "path": str(path),
        "exists": path.exists(),
        "required": required,
        "why": why,
    }


def command_line(baseline_dir: Path, utterance: str, *, notes: str = "", record: bool = False) -> str:
    parts = [
        "python3",
        "apps/QuipslyStudio/script/audio_workbench_codex_listen_decision_intake.py",
        "--baseline-dir",
        str(baseline_dir),
        "--utterance",
        utterance,
        "--reviewer",
        "Charlie",
    ]
    if notes:
        parts.extend(["--notes", notes])
    if record:
        parts.extend(["--record", "--confirm-human-listened"])
    return " ".join(shell_quote(part) if any(ch.isspace() for ch in part) else part for part in parts)


def build_report(baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    baseline_id = str(manifest.get("baselineId") or manifest.get("id") or baseline_dir.name)

    fast = load_output_report(outputs, "latestAudioFastReadbackCheck")
    post_approval = load_output_report(outputs, "latestAudioPostApprovalRenderRehearsal")
    codex_record_smoke = load_output_report(outputs, "latestAudioCodexListenDecisionRecordSandboxSmoke")

    listen_m4a = baseline_dir / "episode4-mastered-audio-spine-v006.m4a"
    listen_wav = baseline_dir / "episode4-mastered-audio-spine-v006.wav"
    record_command = output_path(outputs.get("latestHumanListenDecisionRecordCommand")) or str(baseline_dir / "RECORD_EPISODE_4_AUDIO_DECISION.command")

    required_artifacts = [
        file_artifact("Recommended v006 listening M4A", listen_m4a, "This is the one file Charlie should judge for the current audio-spine gate."),
        file_artifact("Optional WAV handoff", listen_wav, "This is the full-quality handoff if Charlie or Premiere needs the uncompressed master.", required=False),
        artifact(outputs, "Fast readback", "latestAudioFastReadbackCheckHtml", "Cheap package-coherence proof before any human decision is recorded."),
        artifact(outputs, "Final listen mission packet", "latestAudioFinalListenMissionPacketHtml", "Human-facing review mission with evidence links and proof windows."),
        artifact(outputs, "Human listen decision front door", "latestHumanListenDecisionFrontDoorHtml", "Guarded decision explanation and terminal recorder entrypoint."),
        file_artifact("Guarded record command", Path(record_command), "The local command that can record the decision after real listening."),
        artifact(outputs, "Source-aware stem manifest", "latestAudioSourceAwareStemManifestHtml", "Shows Charlie, Homer, and clip/source refined stems remain the editing truth."),
        artifact(outputs, "Source-aware timing contract", "latestAudioSourceAwareTimingContractHtml", "Proves refined stems stay on one sequence clock for branch edits."),
        artifact(outputs, "Post-approval render rehearsal", "latestAudioPostApprovalRenderRehearsalHtml", "Proves render branches stay locked now and wake through source-aware gates after approval."),
    ]
    missing = [item for item in required_artifacts if item["required"] and not item["exists"]]

    source_aware_ready = (
        manifest.get("branchRenderAudioTruth") == "source-aware-refined-stems"
        and bool_value(manifest.get("audioSourceAwareTimingContractReady"))
        and int_value(manifest.get("audioSourceAwareTimingContractReadyRoleCount")) >= 3
        and bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorInheritsSourceAwareAudioTruth"))
        and not bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed"))
    )
    danger_room_ready = (
        bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokePassed"))
        and bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved"))
        and manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth") == "source-aware-refined-stems"
        and bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems"))
        and bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented"))
    )
    locked_clean = (
        manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof"
        and bool_value(manifest.get("packageReadyForHumanListen"))
        and not bool_value(manifest.get("branchInheritanceReady"))
        and not bool_value(manifest.get("branchRenderReady"))
        and not bool_value(manifest.get("approvedBranchRenderCommandsExposed"))
    )
    fast_clean = bool_value(fast.get("passed")) and int_value(fast.get("hardStopCount")) == 0
    status = READY_STATUS if not missing and locked_clean and fast_clean and source_aware_ready and danger_room_ready else "listen-decision-command-center-needs-attention"

    decision_phrases = [
        {
            "label": "Pass",
            "tellCodex": "Approve v006 audio spine",
            "meaning": "Charlie listened to the v006 spine and accepts it as the audio gate for source-aware branch rendering.",
            "recordCommand": command_line(baseline_dir, "Approve v006 audio spine", record=True),
            "dryRunCommand": command_line(baseline_dir, "Approve v006 audio spine"),
        },
        {
            "label": "Needs proof",
            "tellCodex": "Needs proof around MM:SS because ...",
            "meaning": "Charlie is not rejecting v006 yet, but wants a focused proof window or comparison before approval.",
            "recordCommand": command_line(
                baseline_dir,
                "Needs proof around MM:SS because ...",
                notes="Replace MM:SS and this note with the exact uncertainty.",
                record=True,
            ),
            "dryRunCommand": command_line(
                baseline_dir,
                "Needs proof around MM:SS because ...",
                notes="Replace MM:SS and this note with the exact uncertainty.",
            ),
        },
        {
            "label": "Fail",
            "tellCodex": "Fail, issue at MM:SS because ...",
            "meaning": "Charlie heard a real defect; v006 stays locked and the issue should route to scoped v007 repair/proof.",
            "recordCommand": command_line(
                baseline_dir,
                "Fail, issue at MM:SS because ...",
                notes="Replace MM:SS and this note with the exact defect.",
                record=True,
            ),
            "dryRunCommand": command_line(
                baseline_dir,
                "Fail, issue at MM:SS because ...",
                notes="Replace MM:SS and this note with the exact defect.",
            ),
        },
    ]

    return {
        "schema": "quipsly.audio-workbench.listen-decision-command-center.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool_value(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "branchRenderAudioTruth": manifest.get("branchRenderAudioTruth"),
        "masteredSpineOnlyEditingAllowed": bool_value(manifest.get("masteredSpineOnlyEditingAllowed")),
        "recommendedListenFile": str(listen_m4a),
        "recommendedListenFileExists": listen_m4a.exists(),
        "optionalWavFile": str(listen_wav),
        "optionalWavFileExists": listen_wav.exists(),
        "recordDecisionCommand": record_command,
        "requiredArtifacts": required_artifacts,
        "requiredArtifactCount": sum(1 for item in required_artifacts if item["required"]),
        "missingRequiredArtifactCount": len(missing),
        "fastReadbackStatus": fast.get("status") or manifest.get("audioFastReadbackCheckLatestStatus"),
        "fastReadbackPassed": fast_clean,
        "fastReadbackHardStopCount": int_value(fast.get("hardStopCount")),
        "sourceAwareReady": source_aware_ready,
        "sourceAwareTimingContractStatus": manifest.get("audioSourceAwareTimingContractLatestStatus"),
        "sourceAwareTimingContractReady": bool_value(manifest.get("audioSourceAwareTimingContractReady")),
        "sourceAwareTimingContractReadyRoleCount": int_value(manifest.get("audioSourceAwareTimingContractReadyRoleCount")),
        "sourceAwareStemResolvedCount": int_value(manifest.get("audioSourceAwareStemManifestResolvedStemCount")),
        "postApprovalRenderRehearsalStatus": post_approval.get("status") or manifest.get("audioPostApprovalRenderRehearsalLatestStatus"),
        "postApprovalRenderRehearsalBranchCount": int_value(post_approval.get("branchCount") or manifest.get("audioPostApprovalRenderRehearsalBranchCount")),
        "postApprovalRenderRehearsalMissingInputCount": int_value(post_approval.get("missingInputCount") or manifest.get("audioPostApprovalRenderRehearsalMissingInputCount")),
        "postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth": bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorInheritsSourceAwareAudioTruth")),
        "postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed": bool_value(manifest.get("audioPostApprovalRenderRehearsalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed")),
        "codexRecordSandboxSmokePassed": bool_value(codex_record_smoke.get("passed") or manifest.get("audioCodexListenDecisionRecordSandboxSmokePassed")),
        "codexRecordSandboxSmokeCheckCount": int_value(codex_record_smoke.get("checkCount") or manifest.get("audioCodexListenDecisionRecordSandboxSmokeCheckCount")),
        "codexRecordSandboxSmokeFailureCount": int_value(codex_record_smoke.get("failureCount") or manifest.get("audioCodexListenDecisionRecordSandboxSmokeFailureCount")),
        "codexRecordSandboxSmokeRealApprovalPreserved": bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeRealApprovalPreserved")),
        "codexRecordSandboxSmokeSandboxBranchRenderAudioTruth": manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxBranchRenderAudioTruth"),
        "codexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems": bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorWillUseRefinedStems")),
        "codexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented": bool_value(manifest.get("audioCodexListenDecisionRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented")),
        "dangerRoomReady": danger_room_ready,
        "decisionPhrases": decision_phrases,
        "nextSafeAction": "Charlie listens to the v006 M4A. If it passes, record guarded approval and refresh post-listen gates. If not, route exact timestamps to proof or scoped v007 repair.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 Listen Decision Command Center: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the small cockpit for the current human listen gate. It does not approve, render, upload, publish, or mutate original media.",
        "",
        "## Listen first",
        "",
        f"- Recommended file: `{report['recommendedListenFile']}`",
        f"- Exists: `{str(report['recommendedListenFileExists']).lower()}`",
        f"- Current status: `{report['status']}`",
        f"- Fast readback: `{report['fastReadbackStatus']}`",
        f"- Fast readback hard stops: `{report['fastReadbackHardStopCount']}`",
        "",
        "## Say one of these to Codex",
        "",
    ]
    for phrase in report["decisionPhrases"]:
        lines.extend(
            [
                f"### {phrase['label']}",
                "",
                f"- Tell Codex: `{phrase['tellCodex']}`",
                f"- Meaning: {phrase['meaning']}",
                f"- Dry-run CLI: `{phrase['dryRunCommand']}`",
                f"- Record CLI after real listening: `{phrase['recordCommand']}`",
                "",
            ]
        )
    lines.extend(
        [
            "## Source-aware branch rule",
            "",
            f"- Branch render audio truth: `{report['branchRenderAudioTruth']}`",
            f"- Source-aware ready: `{str(report['sourceAwareReady']).lower()}`",
            f"- Source-aware timing: `{report['sourceAwareTimingContractStatus']}`",
            f"- Source-aware timing roles: `{report['sourceAwareTimingContractReadyRoleCount']}`",
            f"- Refined stems resolved: `{report['sourceAwareStemResolvedCount']}`",
            f"- Mastered-spine-only editing allowed: `{str(report['masteredSpineOnlyEditingAllowed']).lower()}`",
            "",
            "The v006 mastered spine is the listen/Premiere/delivery convenience artifact. Branch editing and rendering must use the separate refined Charlie, Homer, and clip/source stems on the shared sequence clock.",
            "",
            "## Post-approval rehearsal",
            "",
            f"- Rehearsal status: `{report['postApprovalRenderRehearsalStatus']}`",
            f"- Branches planned: `{report['postApprovalRenderRehearsalBranchCount']}`",
            f"- Missing inputs: `{report['postApprovalRenderRehearsalMissingInputCount']}`",
            f"- Sandbox executor inherits source-aware audio: `{str(report['postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth']).lower()}`",
            f"- Sandbox executor allows mastered-spine-only editing: `{str(report['postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed']).lower()}`",
            "",
            "## Danger-room proof",
            "",
            f"- Codex record sandbox smoke passed: `{str(report['codexRecordSandboxSmokePassed']).lower()}`",
            f"- Checks: `{report['codexRecordSandboxSmokeCheckCount']}`",
            f"- Failures: `{report['codexRecordSandboxSmokeFailureCount']}`",
            f"- Real approval preserved: `{str(report['codexRecordSandboxSmokeRealApprovalPreserved']).lower()}`",
            f"- Sandbox branch audio truth: `{report['codexRecordSandboxSmokeSandboxBranchRenderAudioTruth']}`",
            f"- Sandbox executor uses refined stems: `{str(report['codexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems']).lower()}`",
            f"- Sandbox executor blocks master-only: `{str(report['codexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented']).lower()}`",
            "",
            "## Required artifacts",
            "",
        ]
    )
    for item in report["requiredArtifacts"]:
        required = "required" if item["required"] else "optional"
        lines.append(f"- `{item['label']}` ({required}, exists `{str(item['exists']).lower()}`): `{item['path']}`")
    lines.extend(
        [
            "",
            "## Safety",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
            f"Next safe action: {report['nextSafeAction']}",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    phrase_cards = []
    for phrase in report["decisionPhrases"]:
        phrase_cards.append(
            f"""
            <article class="card">
              <p class="eyebrow">{e(phrase['label'])}</p>
              <h3>{e(phrase['tellCodex'])}</h3>
              <p>{e(phrase['meaning'])}</p>
              <details><summary>CLI commands</summary>
                <p><strong>Dry run</strong></p><pre>{e(phrase['dryRunCommand'])}</pre>
                <p><strong>Record after real listen</strong></p><pre>{e(phrase['recordCommand'])}</pre>
              </details>
            </article>
            """
        )
    artifact_rows = "\n".join(
        f"<tr><td>{e(item['label'])}</td><td>{'required' if item['required'] else 'optional'}</td><td>{str(item['exists']).lower()}</td><td><code>{e(item['path'])}</code></td></tr>"
        for item in report["requiredArtifacts"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Episode 4 Listen Decision Command Center</title>
  <style>
    :root {{
      --bg: #f8f1e5;
      --ink: #35251a;
      --muted: #786450;
      --card: #fffaf0;
      --line: #dbc7aa;
      --green: #2f6b4f;
      --gold: #b88924;
      --red: #9d3f34;
    }}
    body {{ margin: 0; background: radial-gradient(circle at top left, #fff8db, var(--bg) 34%, #efe3ce); color: var(--ink); font-family: ui-serif, Georgia, serif; }}
    main {{ max-width: 1160px; margin: 0 auto; padding: 42px 24px 80px; }}
    .hero {{ border: 1px solid var(--line); border-radius: 28px; background: rgba(255,250,240,.9); padding: 30px; box-shadow: 0 18px 60px rgba(61,42,24,.12); }}
    .eyebrow {{ color: var(--gold); text-transform: uppercase; letter-spacing: .18em; font-weight: 800; font-size: .78rem; }}
    h1 {{ margin: 0; font-size: clamp(2.1rem, 5vw, 4.4rem); line-height: .95; }}
    h2 {{ margin-top: 34px; }}
    code, pre {{ font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }}
    pre {{ overflow: auto; background: #211810; color: #fbeecf; border-radius: 14px; padding: 14px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 16px; margin-top: 18px; }}
    .card {{ background: var(--card); border: 1px solid var(--line); border-radius: 20px; padding: 18px; }}
    .pillrow {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }}
    .pill {{ border: 1px solid var(--line); border-radius: 999px; padding: 9px 12px; background: white; }}
    .good {{ color: var(--green); font-weight: 800; }}
    .warn {{ color: var(--gold); font-weight: 800; }}
    .bad {{ color: var(--red); font-weight: 800; }}
    table {{ width: 100%; border-collapse: collapse; background: var(--card); border-radius: 18px; overflow: hidden; }}
    th, td {{ text-align: left; border-bottom: 1px solid var(--line); padding: 10px; vertical-align: top; }}
    td code {{ word-break: break-all; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Audio Workbench</p>
    <h1>Episode 4 listen decision cockpit</h1>
    <p>Judge one file. Keep branch rendering locked. When approved, wake the source-aware stems, not a flattened-master shortcut.</p>
    <div class="pillrow">
      <span class="pill">Status: <strong>{e(report['status'])}</strong></span>
      <span class="pill">Fast readback: <strong>{e(report['fastReadbackStatus'])}</strong></span>
      <span class="pill">Source-aware ready: <strong>{str(report['sourceAwareReady']).lower()}</strong></span>
      <span class="pill">Danger room: <strong>{str(report['dangerRoomReady']).lower()}</strong></span>
    </div>
    <p><strong>Listen file:</strong> <code>{e(report['recommendedListenFile'])}</code></p>
  </section>

  <h2>Say one of these to Codex</h2>
  <div class="grid">{''.join(phrase_cards)}</div>

  <h2>Source-aware branch rule</h2>
  <div class="grid">
    <article class="card"><p class="eyebrow">Editing truth</p><h3>{e(report['branchRenderAudioTruth'])}</h3><p>Charlie, Homer, and clip/source refined stems stay synced to one sequence clock.</p></article>
    <article class="card"><p class="eyebrow">Not allowed</p><h3>Mastered-spine-only branch editing: {str(report['masteredSpineOnlyEditingAllowed']).lower()}</h3><p>The mastered spine is for listening, manual Premiere use, and delivery convenience.</p></article>
    <article class="card"><p class="eyebrow">Post-approval rehearsal</p><h3>{e(report['postApprovalRenderRehearsalStatus'])}</h3><p>{report['postApprovalRenderRehearsalBranchCount']} branches planned, {report['postApprovalRenderRehearsalMissingInputCount']} missing inputs.</p></article>
    <article class="card"><p class="eyebrow">Danger-room proof</p><h3>{str(report['codexRecordSandboxSmokePassed']).lower()}</h3><p>Sandbox executor uses refined stems: {str(report['codexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems']).lower()}.</p></article>
  </div>

  <h2>Required artifacts</h2>
  <table><thead><tr><th>Artifact</th><th>Need</th><th>Exists</th><th>Path</th></tr></thead><tbody>{artifact_rows}</tbody></table>

  <h2>Safety</h2>
  <p>No approval, branch unlock, render, upload, publication, or original-media mutation was attempted by this command center.</p>
  <p><strong>Next safe action:</strong> {e(report['nextSafeAction'])}</p>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, listen_file: Path) -> None:
    lines = ["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}"]
    if listen_file.exists():
        lines.append(f"open {shell_quote(str(listen_file))}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def update_manifest(baseline_dir: Path, report: dict[str, Any], paths: dict[str, str]) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": paths["json"],
        "jsonPath": paths["json"],
        "markdownPath": paths["markdown"],
        "htmlPath": paths["html"],
        "openCommand": paths["openCommand"],
        "versionedPath": paths["versionedJson"],
        "versionedJsonPath": paths["versionedJson"],
        "versionedMarkdownPath": paths["versionedMarkdown"],
        "versionedHtmlPath": paths["versionedHtml"],
        "versionedOpenCommand": paths["versionedOpenCommand"],
        "generatedAt": report["generatedAt"],
        "schema": report["schema"],
        "status": report["status"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioListenDecisionCommandCenters", [])
    history.append(entry)
    outputs["latestAudioListenDecisionCommandCenter"] = entry
    outputs["latestAudioListenDecisionCommandCenterMarkdown"] = paths["markdown"]
    outputs["latestAudioListenDecisionCommandCenterHtml"] = paths["html"]
    outputs["latestAudioListenDecisionCommandCenterOpenCommand"] = paths["openCommand"]
    outputs["latestAudioListenDecisionCommandCenterVersionedJson"] = paths["versionedJson"]
    outputs["latestAudioListenDecisionCommandCenterVersionedMarkdown"] = paths["versionedMarkdown"]
    outputs["latestAudioListenDecisionCommandCenterVersionedHtml"] = paths["versionedHtml"]
    outputs["latestAudioListenDecisionCommandCenterVersionedOpenCommand"] = paths["versionedOpenCommand"]

    manifest["audioListenDecisionCommandCenterLatestStatus"] = report["status"]
    manifest["audioListenDecisionCommandCenterCount"] = len(history)
    manifest["audioListenDecisionCommandCenterMissingRequiredArtifactCount"] = report["missingRequiredArtifactCount"]
    manifest["audioListenDecisionCommandCenterRequiredArtifactCount"] = report["requiredArtifactCount"]
    manifest["audioListenDecisionCommandCenterApprovalStatus"] = report["approvalStatus"]
    manifest["audioListenDecisionCommandCenterPackageReadyForHumanListen"] = report["packageReadyForHumanListen"]
    manifest["audioListenDecisionCommandCenterBranchInheritanceReady"] = report["branchInheritanceReady"]
    manifest["audioListenDecisionCommandCenterBranchRenderReady"] = report["branchRenderReady"]
    manifest["audioListenDecisionCommandCenterBranchRenderAudioTruth"] = report["branchRenderAudioTruth"]
    manifest["audioListenDecisionCommandCenterMasteredSpineOnlyEditingAllowed"] = report["masteredSpineOnlyEditingAllowed"]
    manifest["audioListenDecisionCommandCenterRecommendedListenFile"] = report["recommendedListenFile"]
    manifest["audioListenDecisionCommandCenterRecommendedListenFileExists"] = report["recommendedListenFileExists"]
    manifest["audioListenDecisionCommandCenterRecordDecisionCommand"] = report["recordDecisionCommand"]
    manifest["audioListenDecisionCommandCenterFastReadbackStatus"] = report["fastReadbackStatus"]
    manifest["audioListenDecisionCommandCenterFastReadbackPassed"] = report["fastReadbackPassed"]
    manifest["audioListenDecisionCommandCenterFastReadbackHardStopCount"] = report["fastReadbackHardStopCount"]
    manifest["audioListenDecisionCommandCenterSourceAwareReady"] = report["sourceAwareReady"]
    manifest["audioListenDecisionCommandCenterSourceAwareTimingContractStatus"] = report["sourceAwareTimingContractStatus"]
    manifest["audioListenDecisionCommandCenterSourceAwareTimingContractReady"] = report["sourceAwareTimingContractReady"]
    manifest["audioListenDecisionCommandCenterSourceAwareTimingContractReadyRoleCount"] = report["sourceAwareTimingContractReadyRoleCount"]
    manifest["audioListenDecisionCommandCenterSourceAwareStemResolvedCount"] = report["sourceAwareStemResolvedCount"]
    manifest["audioListenDecisionCommandCenterPostApprovalRenderRehearsalStatus"] = report["postApprovalRenderRehearsalStatus"]
    manifest["audioListenDecisionCommandCenterPostApprovalRenderRehearsalBranchCount"] = report["postApprovalRenderRehearsalBranchCount"]
    manifest["audioListenDecisionCommandCenterPostApprovalRenderRehearsalMissingInputCount"] = report["postApprovalRenderRehearsalMissingInputCount"]
    manifest["audioListenDecisionCommandCenterPostApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth"] = report["postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth"]
    manifest["audioListenDecisionCommandCenterPostApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed"] = report["postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokePassed"] = report["codexRecordSandboxSmokePassed"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeCheckCount"] = report["codexRecordSandboxSmokeCheckCount"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeFailureCount"] = report["codexRecordSandboxSmokeFailureCount"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeRealApprovalPreserved"] = report["codexRecordSandboxSmokeRealApprovalPreserved"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxBranchRenderAudioTruth"] = report["codexRecordSandboxSmokeSandboxBranchRenderAudioTruth"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems"] = report["codexRecordSandboxSmokeSandboxExecutorWillUseRefinedStems"]
    manifest["audioListenDecisionCommandCenterCodexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented"] = report["codexRecordSandboxSmokeSandboxExecutorMasterOnlyPrevented"]
    manifest["audioListenDecisionCommandCenterDangerRoomReady"] = report["dangerRoomReady"]
    manifest["audioListenDecisionCommandCenterApprovalStateChanged"] = False
    manifest["audioListenDecisionCommandCenterBranchStateChanged"] = False
    manifest["audioListenDecisionCommandCenterRenderAttempted"] = False
    manifest["audioListenDecisionCommandCenterBranchRenderAttempted"] = False
    manifest["audioListenDecisionCommandCenterUploadAttempted"] = False
    manifest["audioListenDecisionCommandCenterPublicationAttempted"] = False
    manifest["audioListenDecisionCommandCenterOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    generated_iso = datetime.now(timezone.utc).isoformat()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    manifest = read_json(baseline_dir / "manifest.json")
    baseline_id = str(manifest.get("baselineId") or manifest.get("id") or baseline_dir.name)
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))

    report = build_report(baseline_dir, generated_iso)
    stable_json = baseline_dir / "AUDIO_LISTEN_DECISION_COMMAND_CENTER.json"
    stable_md = baseline_dir / "AUDIO_LISTEN_DECISION_COMMAND_CENTER.md"
    stable_html = baseline_dir / "AUDIO_LISTEN_DECISION_COMMAND_CENTER.html"
    stable_open = baseline_dir / "OPEN_AUDIO_LISTEN_DECISION_COMMAND_CENTER.command"
    version_dir = baseline_dir / f"audio-listen-decision-command-center-{slug}-{stamp}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "listen-decision-command-center.json"
    version_md = version_dir / "listen-decision-command-center.md"
    version_html = version_dir / "listen-decision-command-center.html"
    version_open = version_dir / "open-listen-decision-command-center.command"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, version_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, Path(report["recommendedListenFile"]))
    write_open_command(version_open, version_html, Path(report["recommendedListenFile"]))

    paths = {
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJson": str(version_json),
        "versionedMarkdown": str(version_md),
        "versionedHtml": str(version_html),
        "versionedOpenCommand": str(version_open),
    }
    update_manifest(baseline_dir, report, paths)
    print(json.dumps({
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "status": report["status"],
        "missingRequiredArtifactCount": report["missingRequiredArtifactCount"],
        "sourceAwareReady": report["sourceAwareReady"],
        "dangerRoomReady": report["dangerRoomReady"],
        "approvalStateChanged": False,
        "renderAttempted": False,
        "publicationAttempted": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
