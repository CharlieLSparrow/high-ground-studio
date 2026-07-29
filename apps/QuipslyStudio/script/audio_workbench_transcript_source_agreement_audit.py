#!/usr/bin/env python3
"""Audit transcript/source agreement readiness for the Episode audio spine.

This is a control-plane evidence artifact. It does not transcribe media yet and
does not approve audio, unlock branch renders, upload, publish, or mutate
original media. Its job is to make the current semantic-evidence gap explicit:
source/speaker energy evidence says the spine is coherent, but true transcript
agreement still needs ASR artifacts before it can become a real quality gate.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TRANSCRIPT_EXTENSIONS = {".json", ".srt", ".vtt", ".txt", ".md"}
TRANSCRIPT_TOKENS = ("transcript", "caption", "asr", "words")
SELF_AUDIT_TOKEN = "audio-transcript-source-agreement-audit"
CONTROL_PLANE_TRANSCRIPT_TOKENS = (SELF_AUDIT_TOKEN, "audio-asr-evidence-adapter")


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


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[Path | None, dict[str, Any]]:
    path = output_path(outputs.get(key))
    if not path or not path.exists() or path.suffix.lower() != ".json":
        return path, {}
    try:
        return path, read_json(path)
    except json.JSONDecodeError:
        return path, {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def bool_value(value: Any) -> bool:
    return bool(value)


def int_value(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def path_exists(value: Path | None) -> bool:
    return bool(value and value.exists())


def discover_transcript_files(baseline_dir: Path, outputs: dict[str, Any]) -> list[str]:
    discovered: set[str] = set()
    for key, value in outputs.items():
        if not any(token in key.lower() for token in TRANSCRIPT_TOKENS):
            continue
        path = output_path(value)
        if path and path.exists() and not any(token in str(path).lower() for token in CONTROL_PLANE_TRANSCRIPT_TOKENS):
            discovered.add(str(path))

    max_depth = 3
    base_parts = len(baseline_dir.parts)
    for root, dirs, files in os.walk(baseline_dir):
        root_path = Path(root)
        depth = len(root_path.parts) - base_parts
        if depth >= max_depth:
            dirs[:] = []
        for filename in files:
            lower = filename.lower()
            path = root_path / filename
            if any(token in str(path).lower() for token in CONTROL_PLANE_TRANSCRIPT_TOKENS):
                continue
            if path.suffix.lower() not in TRANSCRIPT_EXTENSIONS:
                continue
            if any(token in lower for token in TRANSCRIPT_TOKENS):
                discovered.add(str(path))
    return sorted(discovered)


def speaker_summary(spine_sanity: dict[str, Any]) -> list[dict[str, Any]]:
    rows = spine_sanity.get("speakerChecks")
    if not isinstance(rows, list):
        return []
    summary = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        summary.append(
            {
                "speaker": row.get("speaker"),
                "passed": bool_value(row.get("passed")),
                "activeSeconds": row.get("activeSeconds"),
                "masterAudibleWhenActivePercent": row.get("masterAudibleWhenActivePercent"),
                "quietActiveWindowCount": row.get("masterQuietWhenActiveWindowCount"),
            }
        )
    return summary


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Transcript / Source Agreement Audit",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is evidence routing, not approval. It separates semantic transcript agreement from the current source/speaker energy proxy so we do not pretend the audio has been transcript-verified before ASR artifacts exist.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Energy/source proxy passed: `{str(report['energyProxyAgreementPassed']).lower()}`",
        f"- Semantic transcript agreement implemented: `{str(report['semanticTranscriptAgreementImplemented']).lower()}`",
        f"- Transcript evidence files found: `{report['semanticTranscriptEvidenceFileCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Current gate effect: `{report['currentGateEffect']}`",
        "",
        "## Current evidence",
        "",
        f"- Source activity present: `{str(report['sourceActivityPresent']).lower()}`",
        f"- Speaker activity board present: `{str(report['speakerActivityBoardPresent']).lower()}`",
        f"- Source-balance triage present: `{str(report['sourceBalanceTriagePresent']).lower()}`",
        f"- Spine listen sanity present: `{str(report['spineListenSanityPresent']).lower()}`",
        f"- Speakers survive in master: `{str(report['speakerSurvivalPassed']).lower()}`",
        f"- Speaker activity focus windows: `{report['speakerActivityFocusWindowCount']}`",
        f"- Source-balance triage windows: `{report['sourceBalanceTriageWindowCount']}`",
        f"- Listen-priority queue items: `{report['listenPriorityQueueCount']}`",
        "",
        "## Speaker survival proxy",
        "",
        "| Speaker | Passed | Active seconds | Audible when active | Quiet active windows |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in report["speakerChecks"]:
        lines.append(
            f"| {row.get('speaker')} | `{str(row.get('passed')).lower()}` | `{row.get('activeSeconds')}` | `{row.get('masterAudibleWhenActivePercent')}%` | `{row.get('quietActiveWindowCount')}` |"
        )
    lines.extend(["", "## Transcript evidence files", ""])
    if report["semanticTranscriptEvidenceFiles"]:
        for path in report["semanticTranscriptEvidenceFiles"]:
            lines.append(f"- `{path}`")
    else:
        lines.append("- None found under the current v006 baseline or manifest outputs.")
    lines.extend(
        [
            "",
            "## Meaning",
            "",
            report["meaning"],
            "",
            "## Next best upgrade",
            "",
            report["nextBestUpgrade"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown_path: Path) -> str:
    speaker_cards = "\n".join(
        f"<li><strong>{html.escape(str(row.get('speaker')))}</strong>: passed={html.escape(str(row.get('passed')))}, active={html.escape(str(row.get('activeSeconds')))}s, audible={html.escape(str(row.get('masterAudibleWhenActivePercent')))}%, quiet={html.escape(str(row.get('quietActiveWindowCount')))}</li>"
        for row in report["speakerChecks"]
    )
    transcript_items = "\n".join(
        f"<li><code>{html.escape(path)}</code></li>" for path in report["semanticTranscriptEvidenceFiles"]
    ) or "<li>None found under the current v006 baseline or manifest outputs.</li>"
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Transcript / Source Agreement Audit</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif; margin: 32px; background: #f7f1e6; color: #2e241b; }}
    main {{ max-width: 980px; margin: 0 auto; background: #fffaf0; border: 1px solid #d8c6a8; border-radius: 22px; padding: 28px; box-shadow: 0 18px 55px rgba(78, 54, 28, 0.12); }}
    .pill {{ display: inline-block; padding: 7px 11px; border-radius: 999px; background: #173f35; color: #f5e6b8; font-weight: 700; margin: 4px 6px 4px 0; }}
    .risk {{ background: #70491f; }}
    code {{ background: #efe3cf; padding: 2px 5px; border-radius: 6px; }}
    a {{ color: #10624c; }}
  </style>
</head>
<body>
<main>
  <p class="pill">Status: {html.escape(str(report['status']))}</p>
  <p class="pill">Energy proxy: {html.escape(str(report['energyProxyAgreementPassed']).lower())}</p>
  <p class="pill risk">Transcript files: {report['semanticTranscriptEvidenceFileCount']}</p>
  <h1>Transcript / Source Agreement Audit</h1>
  <p>This page keeps us honest: source/speaker evidence is not the same thing as semantic transcript agreement.</p>
  <h2>Evidence</h2>
  <ul>
    <li>Source activity present: <code>{str(report['sourceActivityPresent']).lower()}</code></li>
    <li>Speaker activity board present: <code>{str(report['speakerActivityBoardPresent']).lower()}</code></li>
    <li>Source-balance triage present: <code>{str(report['sourceBalanceTriagePresent']).lower()}</code></li>
    <li>Spine sanity present: <code>{str(report['spineListenSanityPresent']).lower()}</code></li>
    <li>Hard stops: <code>{report['hardStopCount']}</code></li>
    <li>Review risks: <code>{report['reviewRiskCount']}</code></li>
  </ul>
  <h2>Speaker survival proxy</h2>
  <ul>{speaker_cards}</ul>
  <h2>Transcript evidence files</h2>
  <ul>{transcript_items}</ul>
  <h2>Meaning</h2>
  <p>{html.escape(report['meaning'])}</p>
  <h2>Next best upgrade</h2>
  <p>{html.escape(report['nextBestUpgrade'])}</p>
  <p><a href="{html.escape(markdown_path.name)}">Open Markdown companion</a></p>
</main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs_before = manifest_before.get("outputs") or {}
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = stamp()

    source_activity_path, source_activity = load_output_report(outputs_before, "sourceActivity")
    speaker_activity_path, speaker_activity = load_output_report(outputs_before, "latestAudioSpeakerActivityReviewBoard")
    source_balance_path, source_balance = load_output_report(outputs_before, "latestAudioSourceBalanceTriage")
    spine_sanity_path, spine_sanity = load_output_report(outputs_before, "latestAudioSpineListenSanityCheck")
    asr_adapter_path, asr_adapter = load_output_report(outputs_before, "latestAudioAsrEvidenceAdapter")
    asr_source_master_path, asr_source_master = load_output_report(outputs_before, "latestAudioAsrSourceMasterComparison")
    transcript_files = discover_transcript_files(baseline_dir, outputs_before)
    asr_transcript_files = []
    for result in asr_adapter.get("asrResults") if isinstance(asr_adapter.get("asrResults"), list) else []:
        if not isinstance(result, dict) or not result.get("ok"):
            continue
        path = result.get("transcriptJson")
        if isinstance(path, str) and path and Path(path).exists():
            asr_transcript_files.append(path)
    for path in asr_transcript_files:
        if path not in transcript_files:
            transcript_files.append(path)
    transcript_files = sorted(transcript_files)

    source_activity_present = bool(source_activity)
    speaker_activity_present = bool(speaker_activity)
    source_balance_present = bool(source_balance)
    spine_sanity_present = bool(spine_sanity)
    speaker_survival_passed = bool_value(source_balance.get("allSpeakersSurviveInMaster")) and bool_value(spine_sanity.get("passed"))
    speaker_activity_focus_window_count = int_value(speaker_activity.get("focusWindowCount"))
    source_balance_triage_window_count = int_value(source_balance.get("triageWindowCount"))
    listen_priority_queue_count = int_value(spine_sanity.get("listenPriorityQueueCount") or speaker_activity.get("listenPriorityQueueCount"))
    energy_proxy_passed = (
        source_activity_present
        and speaker_activity_present
        and source_balance_present
        and spine_sanity_present
        and speaker_survival_passed
        and speaker_activity_focus_window_count > 0
        and source_balance_triage_window_count > 0
    )
    semantic_transcript_available = len(transcript_files) > 0
    asr_source_master_present = bool(asr_source_master)
    asr_source_master_hard_stop_count = int_value(asr_source_master.get("hardStopCount"))
    asr_source_master_review_risk_count = int_value(asr_source_master.get("reviewRiskCount"))
    semantic_agreement_implemented = asr_source_master_present and asr_source_master_hard_stop_count == 0
    asr_adapter_present = bool(asr_adapter)
    asr_transcript_generated_count = int_value(asr_adapter.get("transcriptGeneratedCount"))
    hard_stop_count = (0 if energy_proxy_passed else 1) + asr_source_master_hard_stop_count
    review_risk_count = asr_source_master_review_risk_count if asr_source_master_present else 1
    if energy_proxy_passed and asr_source_master_present and asr_source_master_hard_stop_count > 0:
        status = "proof-window-asr-comparison-hard-stops"
    elif energy_proxy_passed and asr_source_master_present and asr_source_master_review_risk_count > 0:
        status = "proof-window-asr-comparison-ready-with-review-risks"
    elif energy_proxy_passed and asr_source_master_present and asr_transcript_generated_count > 0:
        status = "proof-window-asr-comparison-ready"
    elif energy_proxy_passed and asr_transcript_generated_count > 0:
        status = "proof-window-asr-evidence-ready-needs-semantic-agreement"
    elif energy_proxy_passed and semantic_transcript_available:
        status = "source-proxy-ready-transcript-evidence-present-needs-asr-agreement"
    elif energy_proxy_passed:
        status = "energy-proxy-agreement-ready-transcript-asr-missing"
    else:
        status = "needs-source-agreement-evidence-refresh"

    work_dir = baseline_dir / f"audio-transcript-source-agreement-audit-{slug}-{generated_at}"
    work_dir.mkdir(parents=True, exist_ok=True)
    json_path = work_dir / "audio-transcript-source-agreement-audit.json"
    markdown_path = work_dir / "audio-transcript-source-agreement-audit.md"
    html_path = work_dir / "audio-transcript-source-agreement-audit.html"
    open_command = work_dir / "OPEN_AUDIO_TRANSCRIPT_SOURCE_AGREEMENT_AUDIT.command"

    report = {
        "schema": "quipsly.audio-workbench.transcript-source-agreement-audit.v1",
        "generatedAt": iso_now(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "energyProxyAgreementPassed": energy_proxy_passed,
        "semanticTranscriptAgreementImplemented": semantic_agreement_implemented,
        "semanticTranscriptEvidenceFileCount": len(transcript_files),
        "semanticTranscriptEvidenceFiles": transcript_files,
        "asrEvidenceAdapterPresent": asr_adapter_present,
        "asrEvidenceAdapter": str(asr_adapter_path) if asr_adapter_path else None,
        "asrTranscriptGeneratedCount": asr_transcript_generated_count,
        "asrTranscriptFiles": asr_transcript_files,
        "asrSourceMasterComparisonPresent": asr_source_master_present,
        "asrSourceMasterComparison": str(asr_source_master_path) if asr_source_master_path else None,
        "asrSourceMasterComparisonStatus": asr_source_master.get("status"),
        "asrSourceMasterComparisonPairCount": int_value(asr_source_master.get("pairComparisonCount")),
        "asrSourceMasterComparisonHardStopCount": asr_source_master_hard_stop_count,
        "asrSourceMasterComparisonReviewRiskCount": asr_source_master_review_risk_count,
        "sourceActivityPresent": source_activity_present,
        "speakerActivityBoardPresent": speaker_activity_present,
        "sourceBalanceTriagePresent": source_balance_present,
        "spineListenSanityPresent": spine_sanity_present,
        "speakerSurvivalPassed": speaker_survival_passed,
        "speakerActivityFocusWindowCount": speaker_activity_focus_window_count,
        "sourceBalanceTriageWindowCount": source_balance_triage_window_count,
        "listenPriorityQueueCount": listen_priority_queue_count,
        "speakerChecks": speaker_summary(spine_sanity),
        "hardStopCount": hard_stop_count,
        "reviewRiskCount": review_risk_count,
        "currentGateEffect": "does-not-unlock-rendering; does-not-block-v006-machine-spine-without-human-listen",
        "meaning": "The current machine evidence says the v006 mastered spine preserves both speakers and has source/speaker activity evidence suitable for human review. Proof-window ASR source/master comparison is now registered as a semantic drift detector; it can catch missing speech, but it still does not replace Charlie's human listen.",
        "nextBestUpgrade": "Use the proof-window comparison to route targeted listening and repairs. Expand to full-spine chapter ASR only after proof-window precision stays useful and runtime remains practical.",
        "sourceActivityReport": str(source_activity_path) if source_activity_path else None,
        "speakerActivityReviewBoard": str(speaker_activity_path) if speaker_activity_path else None,
        "sourceBalanceTriage": str(source_balance_path) if source_balance_path else None,
        "spineListenSanityCheck": str(spine_sanity_path) if spine_sanity_path else None,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "humanListenStillRequired": manifest_before.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "json": str(json_path),
        "markdown": str(markdown_path),
        "html": str(html_path),
        "openCommand": str(open_command),
    }
    write_json(json_path, report)
    markdown_path.write_text(render_markdown(report) + "\n", encoding="utf-8")
    html_path.write_text(render_html(report, markdown_path), encoding="utf-8")
    open_command.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shlex.quote(str(html_path))}\n",
        encoding="utf-8",
    )
    open_command.chmod(0o755)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioTranscriptSourceAgreementAudit"] = str(json_path)
    outputs["latestAudioTranscriptSourceAgreementAuditMarkdown"] = str(markdown_path)
    outputs["latestAudioTranscriptSourceAgreementAuditHtml"] = str(html_path)
    outputs["latestAudioTranscriptSourceAgreementAuditOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioTranscriptSourceAgreementAudits", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioTranscriptSourceAgreementAuditCount"] = len(history)
    manifest["audioTranscriptSourceAgreementLatestStatus"] = status
    manifest["audioTranscriptSourceAgreementEnergyProxyPassed"] = energy_proxy_passed
    manifest["audioTranscriptSourceAgreementSemanticImplemented"] = semantic_agreement_implemented
    manifest["audioTranscriptSourceAgreementTranscriptFileCount"] = len(transcript_files)
    manifest["audioTranscriptSourceAgreementAsrAdapterPresent"] = asr_adapter_present
    manifest["audioTranscriptSourceAgreementAsrTranscriptGeneratedCount"] = asr_transcript_generated_count
    manifest["audioTranscriptSourceAgreementAsrSourceMasterComparisonPresent"] = asr_source_master_present
    manifest["audioTranscriptSourceAgreementAsrSourceMasterComparisonStatus"] = asr_source_master.get("status")
    manifest["audioTranscriptSourceAgreementAsrSourceMasterComparisonPairCount"] = int_value(asr_source_master.get("pairComparisonCount"))
    manifest["audioTranscriptSourceAgreementAsrSourceMasterComparisonHardStopCount"] = asr_source_master_hard_stop_count
    manifest["audioTranscriptSourceAgreementAsrSourceMasterComparisonReviewRiskCount"] = asr_source_master_review_risk_count
    manifest["audioTranscriptSourceAgreementHardStopCount"] = hard_stop_count
    manifest["audioTranscriptSourceAgreementReviewRiskCount"] = review_risk_count
    manifest["audioTranscriptSourceAgreementSourceActivityPresent"] = source_activity_present
    manifest["audioTranscriptSourceAgreementSpeakerActivityPresent"] = speaker_activity_present
    manifest["audioTranscriptSourceAgreementSourceBalancePresent"] = source_balance_present
    manifest["audioTranscriptSourceAgreementSpineSanityPresent"] = spine_sanity_present
    manifest["audioTranscriptSourceAgreementSpeakerSurvivalPassed"] = speaker_survival_passed
    manifest["audioTranscriptSourceAgreementSpeakerActivityFocusWindowCount"] = speaker_activity_focus_window_count
    manifest["audioTranscriptSourceAgreementSourceBalanceTriageWindowCount"] = source_balance_triage_window_count
    manifest["audioTranscriptSourceAgreementListenPriorityQueueCount"] = listen_priority_queue_count
    manifest["audioTranscriptSourceAgreementHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioTranscriptSourceAgreementApprovalStateChanged"] = False
    manifest["audioTranscriptSourceAgreementBranchStateChanged"] = False
    manifest["audioTranscriptSourceAgreementRenderAttempted"] = False
    manifest["audioTranscriptSourceAgreementBranchRenderAttempted"] = False
    manifest["audioTranscriptSourceAgreementUploadAttempted"] = False
    manifest["audioTranscriptSourceAgreementPublicationAttempted"] = False
    manifest["audioTranscriptSourceAgreementOriginalMediaMutated"] = False
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(
        json.dumps(
            {
                "baselineId": baseline_id,
                "status": status,
                "energyProxyAgreementPassed": energy_proxy_passed,
                "semanticTranscriptEvidenceFileCount": len(transcript_files),
                "hardStopCount": hard_stop_count,
                "reviewRiskCount": review_risk_count,
                "json": str(json_path),
                "markdown": str(markdown_path),
                "html": str(html_path),
            },
            indent=2,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
