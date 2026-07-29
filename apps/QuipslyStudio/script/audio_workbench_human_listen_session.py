#!/usr/bin/env python3
"""Create a guided human-listen session packet for an audio baseline.

This is not an approval tool. It prepares the exact review checklist and
guarded command files a human can use after listening. The guarded commands
still require an explicit typed confirmation before they can record approval or
failure in the baseline manifest.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from html import escape
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2) + "\n")


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


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def relative_symlink(target: Path, link: Path) -> bool:
    if not target.exists():
        return False
    if link.exists() or link.is_symlink():
        raise FileExistsError(f"Refusing to overwrite listen-session link: {link}")
    link.symlink_to(os.path.relpath(target, link.parent), target_is_directory=target.is_dir())
    return True


def artifact_specs(outputs: dict[str, Any]) -> list[tuple[str, str, str | None]]:
    return [
        ("00-start-here", "latestAudioReviewStartHereMarkdown", output_path(outputs.get("latestAudioReviewStartHereMarkdown"))),
        ("01-open-start-here", "latestAudioReviewStartHereOpenCommand", output_path(outputs.get("latestAudioReviewStartHereOpenCommand"))),
        ("01a-producer-command-center", "latestAudioProducerCommandCenterHtml", output_path(outputs.get("latestAudioProducerCommandCenterHtml"))),
        ("01a1-audio-runway-state", "latestAudioRunwayStateHtml", output_path(outputs.get("latestAudioRunwayStateHtml"))),
        ("01a2-open-audio-runway-state", "latestAudioRunwayStateOpenCommand", output_path(outputs.get("latestAudioRunwayStateOpenCommand"))),
        ("01a3-listen-proof-coverage-map", "latestAudioListenProofCoverageMapHtml", output_path(outputs.get("latestAudioListenProofCoverageMapHtml"))),
        ("01a4-open-listen-proof-coverage-map", "latestAudioListenProofCoverageMapOpenCommand", output_path(outputs.get("latestAudioListenProofCoverageMapOpenCommand"))),
        ("01aa-human-approval-preflight", "latestAudioHumanApprovalPreflightHtml", output_path(outputs.get("latestAudioHumanApprovalPreflightHtml"))),
        ("01ab-open-human-approval-preflight", "latestAudioHumanApprovalPreflightOpenCommand", output_path(outputs.get("latestAudioHumanApprovalPreflightOpenCommand"))),
        ("01ac-human-listen-decision-front-door", "latestHumanListenDecisionFrontDoorHtml", output_path(outputs.get("latestHumanListenDecisionFrontDoorHtml"))),
        ("01ad-open-human-listen-decision-front-door", "latestHumanListenDecisionFrontDoorOpenCommand", output_path(outputs.get("latestHumanListenDecisionFrontDoorOpenCommand"))),
        ("01ae-human-listen-decision-front-door-smoke", "latestHumanListenDecisionFrontDoorSmokeMarkdown", output_path(outputs.get("latestHumanListenDecisionFrontDoorSmokeMarkdown"))),
        ("01b-unresolved-requirement-review", "latestAudioUnresolvedRequirementReviewHtml", output_path(outputs.get("latestAudioUnresolvedRequirementReviewHtml"))),
        ("01c-audio-production-doctrine", "latestAudioProductionDoctrineHtml", output_path(outputs.get("latestAudioProductionDoctrineHtml"))),
        ("01d-open-audio-production-doctrine", "latestAudioProductionDoctrineOpenCommand", output_path(outputs.get("latestAudioProductionDoctrineOpenCommand"))),
        ("01e-audio-transformation-lineage-ledger", "latestAudioTransformationLineageLedgerHtml", output_path(outputs.get("latestAudioTransformationLineageLedgerHtml"))),
        ("01f-open-audio-transformation-lineage-ledger", "latestAudioTransformationLineageLedgerOpenCommand", output_path(outputs.get("latestAudioTransformationLineageLedgerOpenCommand"))),
        ("01g-audio-transformation-lineage-ledger-smoke", "latestAudioTransformationLineageLedgerSmokeMarkdown", output_path(outputs.get("latestAudioTransformationLineageLedgerSmokeMarkdown"))),
        ("01h-open-audio-transformation-lineage-ledger-smoke", "latestAudioTransformationLineageLedgerSmokeOpenCommand", output_path(outputs.get("latestAudioTransformationLineageLedgerSmokeOpenCommand"))),
        ("02-human-listen-control-room", "latestAudioHumanListenControlRoomHtml", output_path(outputs.get("latestAudioHumanListenControlRoomHtml"))),
        ("03-human-listen-control-room-notes", "latestAudioHumanListenControlRoomNotesTemplate", output_path(outputs.get("latestAudioHumanListenControlRoomNotesTemplate"))),
        ("03a-final-listen-fast-pass", "latestAudioFinalListenFastPassHtml", output_path(outputs.get("latestAudioFinalListenFastPassHtml"))),
        ("03b-final-listen-fast-pass-notes", "latestAudioFinalListenFastPassNotesTemplate", output_path(outputs.get("latestAudioFinalListenFastPassNotesTemplate"))),
        ("03c-final-listen-fast-pass-inbox", "latestAudioFinalListenFastPassNotesInboxMarkdown", output_path(outputs.get("latestAudioFinalListenFastPassNotesInboxMarkdown"))),
        ("03d-platform-loudness-audit", "latestAudioPlatformLoudnessAuditHtml", output_path(outputs.get("latestAudioPlatformLoudnessAuditHtml"))),
        ("03e-open-platform-loudness-audit", "latestAudioPlatformLoudnessAuditOpenCommand", output_path(outputs.get("latestAudioPlatformLoudnessAuditOpenCommand"))),
        ("03f-broadcast-polish-scorecard", "latestAudioBroadcastPolishScorecardHtml", output_path(outputs.get("latestAudioBroadcastPolishScorecardHtml"))),
        ("03g-open-broadcast-polish-scorecard", "latestAudioBroadcastPolishScorecardOpenCommand", output_path(outputs.get("latestAudioBroadcastPolishScorecardOpenCommand"))),
        ("03g1-technical-audition-snippet-pack", "latestAudioTechnicalAuditionSnippetPackHtml", output_path(outputs.get("latestAudioTechnicalAuditionSnippetPackHtml"))),
        ("03g2-open-technical-audition-snippet-pack", "latestAudioTechnicalAuditionSnippetPackOpenCommand", output_path(outputs.get("latestAudioTechnicalAuditionSnippetPackOpenCommand"))),
        ("03g3-technical-audition-notes-template", "latestAudioTechnicalAuditionSnippetPackNotesTemplate", output_path(outputs.get("latestAudioTechnicalAuditionSnippetPackNotesTemplate"))),
        ("03g4-technical-audition-notes-inbox", "latestAudioTechnicalAuditionNotesInboxMarkdown", output_path(outputs.get("latestAudioTechnicalAuditionNotesInboxMarkdown"))),
        ("03h-smoothness-proof-pack", "latestAudioSmoothnessProofPackHtml", output_path(outputs.get("latestAudioSmoothnessProofPackHtml"))),
        ("03i-open-smoothness-proof-pack", "latestAudioSmoothnessProofPackOpenCommand", output_path(outputs.get("latestAudioSmoothnessProofPackOpenCommand"))),
        ("03j-smoothness-proof-notes-template", "latestAudioSmoothnessProofPackNotesTemplate", output_path(outputs.get("latestAudioSmoothnessProofPackNotesTemplate"))),
        ("03k-smoothness-proof-notes-inbox", "latestAudioSmoothnessProofNotesInboxMarkdown", output_path(outputs.get("latestAudioSmoothnessProofNotesInboxMarkdown"))),
        ("04-listen-priority-review-reel", "latestAudioListenPriorityReviewReelM4a", output_path(outputs.get("latestAudioListenPriorityReviewReelM4a"))),
        ("05-listen-priority-review-reel-guide", "latestAudioListenPriorityReviewReelMarkdown", output_path(outputs.get("latestAudioListenPriorityReviewReelMarkdown"))),
        ("06-post-review-action-queue", "latestAudioPostReviewActionQueueMarkdown", output_path(outputs.get("latestAudioPostReviewActionQueueMarkdown"))),
        ("07-process-review-notes-command", "latestAudioPostHumanListenNotesRoundtripCommand", output_path(outputs.get("latestAudioPostHumanListenNotesRoundtripCommand"))),
        ("08-producer-grade-audit", "latestAudioProducerGradeAuditMarkdown", output_path(outputs.get("latestAudioProducerGradeAuditMarkdown"))),
        ("09-producer-grade-audit-html", "latestAudioProducerGradeAuditHtml", output_path(outputs.get("latestAudioProducerGradeAuditHtml"))),
        ("10-speaker-cleanup-proof-pack", "latestSpeakerCleanupProofPackHtml", output_path(outputs.get("latestSpeakerCleanupProofPackHtml"))),
        ("11-speaker-cleanup-listen-map", "latestSpeakerCleanupListenMapMarkdown", output_path(outputs.get("latestSpeakerCleanupListenMapMarkdown"))),
        ("12-speaker-contribution-ledger", "latestAudioSpeakerContributionLedgerHtml", output_path(outputs.get("latestAudioSpeakerContributionLedgerHtml"))),
        ("13-speaker-contribution-review-markers", "latestAudioSpeakerContributionLedgerCsv", output_path(outputs.get("latestAudioSpeakerContributionLedgerCsv"))),
        ("14-speaker-preservation-proof-pack", "latestAudioSpeakerPreservationProofPackHtml", output_path(outputs.get("latestAudioSpeakerPreservationProofPackHtml"))),
        ("15-speaker-preservation-proof-playlist", "latestAudioSpeakerPreservationProofPackPlaylist", output_path(outputs.get("latestAudioSpeakerPreservationProofPackPlaylist"))),
        ("16-speaker-preservation-notes-template", "latestAudioSpeakerPreservationProofPackNotesTemplate", output_path(outputs.get("latestAudioSpeakerPreservationProofPackNotesTemplate"))),
        ("17-speaker-preservation-notes-inbox", "latestAudioSpeakerPreservationProofNotesInboxMarkdown", output_path(outputs.get("latestAudioSpeakerPreservationProofNotesInboxMarkdown"))),
        ("17a-speaker-cleanup-decision-matrix", "latestSpeakerCleanupDecisionMatrixHtml", output_path(outputs.get("latestSpeakerCleanupDecisionMatrixHtml"))),
        ("17b-open-speaker-cleanup-decision-matrix", "latestSpeakerCleanupDecisionMatrixOpenCommand", output_path(outputs.get("latestSpeakerCleanupDecisionMatrixOpenCommand"))),
        ("18-parameter-sweep-proof-snippets", "latestAudioWorkbenchParameterSweepProofSnippetPackHtml", output_path(outputs.get("latestAudioWorkbenchParameterSweepProofSnippetPackHtml"))),
        ("18a-dxrevive-return-workbench", "latestDxReviveReturnWorkbenchHtml", output_path(outputs.get("latestDxReviveReturnWorkbenchHtml"))),
        ("18b-open-dxrevive-return-workbench", "latestDxReviveReturnWorkbenchOpenCommand", output_path(outputs.get("latestDxReviveReturnWorkbenchOpenCommand"))),
        ("19-dxrevive-bounce-validation", "latestDxReviveBounceValidationMarkdown", output_path(outputs.get("latestDxReviveBounceValidationMarkdown"))),
        ("00-review-cockpit", "audioReviewCockpitHtml", output_path(outputs.get("audioReviewCockpitHtml"))),
        ("01-listening-copy", "masterM4a", output_path(outputs.get("masterM4a"))),
        ("02-full-wav-master", "masterWav", output_path(outputs.get("masterWav"))),
        ("03-proof-window-workorder", "proofWindowListenWorkorderMarkdown", output_path(outputs.get("proofWindowListenWorkorderMarkdown"))),
        ("04-proof-window-comparison", "proofWindowComparisonMarkdown", output_path(outputs.get("proofWindowComparisonMarkdown"))),
        ("05-qc-report", "qualityReportMarkdown", output_path(outputs.get("qualityReportMarkdown"))),
        ("06-source-activity", "sourceActivityMarkdown", output_path(outputs.get("sourceActivityMarkdown"))),
        ("07-source-contribution", "sourceContributionMarkdown", output_path(outputs.get("sourceContributionMarkdown"))),
        ("08-listen-decision-matrix", "latestListenDecisionMatrixMarkdown", output_path(outputs.get("latestListenDecisionMatrixMarkdown"))),
        ("09-proof-window-audio-lab", "latestProofWindowAudioLabMarkdown", output_path(outputs.get("latestProofWindowAudioLabMarkdown"))),
        ("10-reviewer-notes-template", "latestReviewerNotesTemplateMarkdown", output_path(outputs.get("latestReviewerNotesTemplateMarkdown"))),
        ("10a-reviewer-notes-template-html", "latestReviewerNotesTemplateHtml", output_path(outputs.get("latestReviewerNotesTemplateHtml"))),
        ("10b-open-reviewer-notes-template", "latestReviewerNotesTemplateOpenCommand", output_path(outputs.get("latestReviewerNotesTemplateOpenCommand"))),
        ("10c-branch-inheritance-gate", "latestBranchInheritanceGateMarkdown", output_path(outputs.get("latestBranchInheritanceGateMarkdown"))),
        ("10d-branch-inheritance-gate-html", "latestBranchInheritanceGateHtml", output_path(outputs.get("latestBranchInheritanceGateHtml"))),
        ("10e-open-branch-inheritance-gate", "latestBranchInheritanceGateOpenCommand", output_path(outputs.get("latestBranchInheritanceGateOpenCommand"))),
        ("10f-branch-render-preflight", "branchRenderPreflightMarkdown", output_path(outputs.get("branchRenderPreflightMarkdown"))),
        ("10g-branch-render-preflight-html", "branchRenderPreflightHtml", output_path(outputs.get("branchRenderPreflightHtml"))),
        ("10h-open-branch-render-preflight", "branchRenderPreflightOpenCommand", output_path(outputs.get("branchRenderPreflightOpenCommand"))),
        ("10i-approval-path-sandbox-smoke", "latestApprovalPathSmokeMarkdown", output_path(outputs.get("latestApprovalPathSmokeMarkdown"))),
        ("10j-open-approval-path-sandbox-smoke", "latestApprovalPathSmokeOpenCommand", output_path(outputs.get("latestApprovalPathSmokeOpenCommand"))),
        ("11-reviewer-console", "latestAudioReviewerConsoleReadme", output_path(outputs.get("latestAudioReviewerConsoleReadme"))),
        ("12-review-readiness", "latestReviewReadinessVerificationMarkdown", output_path(outputs.get("latestReviewReadinessVerificationMarkdown"))),
        ("13-post-listen-next-actions", "latestPostListenNextActionsMarkdown", output_path(outputs.get("latestPostListenNextActionsMarkdown"))),
        ("14-decision-command-verification", "latestListenDecisionCommandVerificationMarkdown", output_path(outputs.get("latestListenDecisionCommandVerificationMarkdown"))),
        ("15-approved-render-executor", "latestApprovedBranchRenderExecutorMarkdown", output_path(outputs.get("latestApprovedBranchRenderExecutorMarkdown"))),
        ("16-bleed-management-audit", "latestBleedManagementAuditMarkdown", output_path(outputs.get("latestBleedManagementAuditMarkdown"))),
        ("17-bleed-repair-workorder", "latestBleedRepairWorkorderMarkdown", output_path(outputs.get("latestBleedRepairWorkorderMarkdown"))),
        ("18-bleed-repair-preflight", "latestBleedRepairPreflightMarkdown", output_path(outputs.get("latestBleedRepairPreflightMarkdown"))),
        ("19-human-review-bundle", "latestHumanReviewBundleReadme", output_path(outputs.get("latestHumanReviewBundleReadme"))),
        ("20-handoff-index", "latestReviewHandoffIndexMarkdown", output_path(outputs.get("latestReviewHandoffIndexMarkdown"))),
    ]


def proof_snippet_specs(outputs: dict[str, Any]) -> list[tuple[str, str, str | None]]:
    specs: list[tuple[str, str, str | None]] = []
    for index, snippet in enumerate(outputs.get("proofSnippets") or [], start=1):
        if not isinstance(snippet, dict):
            continue
        label = safe_slug(str(snippet.get("label") or f"proof-window-{index}"))
        for key, title in [
            ("rawAligned", "raw-aligned"),
            ("sourceAwareContributionMix", "source-aware"),
            ("conformedMasterSpine", "conformed"),
            ("speakerSplitCharlieLeftHomerRight", "speaker-split"),
        ]:
            path = output_path(snippet.get(key))
            specs.append((f"proof-{index:02d}-{label}-{title}", f"proofSnippets.{index}.{key}", path))
    return specs


def command_script(
    *,
    baseline_dir: Path,
    status: str,
    prompt: str,
    notes: str,
    issue: str | None = None,
) -> str:
    issue_arg = ""
    if issue is not None:
        issue_arg = f" \\\n  --issue {shell_quote(issue)}"
    return f"""#!/bin/zsh
set -e
cd {shell_quote(str(Path.cwd()))}
echo {shell_quote(prompt)}
echo
read "CONFIRM?Type I LISTENED to continue: "
if [[ "$CONFIRM" != "I LISTENED" ]]; then
  echo "No manifest changes made."
  exit 1
fi
OUT={shell_quote(str(baseline_dir))}
python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\
  --baseline-dir "$OUT" \\
  --status {shell_quote(status)} \\
  --reviewer "Charlie or Mako" \\
  --notes {shell_quote(notes)}{issue_arg} \\
  --confirm-human-listened
if [[ {shell_quote(status)} == "human-approved-for-branch-inheritance" ]]; then
  python3 apps/QuipslyStudio/script/audio_workbench_branch_gate.py --baseline-dir "$OUT"
fi
echo "Listen decision recorded. Re-run the handoff index before branch rendering."
"""


def html_audio_card(title: str, description: str, source: str | None) -> str:
    if not source:
        return f"""
        <article class="card missing">
          <h3>{escape(title)}</h3>
          <p>{escape(description)}</p>
          <p class="status">Missing source</p>
        </article>
        """
    return f"""
    <article class="card">
      <h3>{escape(title)}</h3>
      <p>{escape(description)}</p>
      <audio controls preload="metadata" src="{escape(source)}"></audio>
    </article>
    """


def html_report(report: dict[str, Any]) -> str:
    primary = next((item for item in report["links"] if item["label"] == "01-listening-copy" and item["status"] == "present"), None)
    wav = next((item for item in report["links"] if item["label"] == "02-full-wav-master" and item["status"] == "present"), None)
    proof_cards = []
    for item in report["links"]:
        if not str(item["label"]).startswith("proof-"):
            continue
        proof_cards.append(
            html_audio_card(
                str(item["label"]).replace("-", " "),
                str(item["key"]),
                str(item["linkRelative"]) if item["status"] == "present" else None,
            )
        )
    checklist = [
        "Full M4A sounds globally balanced and natural.",
        "Charlie non-speaking gaps do not carry distracting Homer echo.",
        "Homer non-speaking gaps reduce park/background noise without sounding chopped.",
        "Overlap, laughter, and reaction moments still feel human.",
        "No pumping, clipping, harsh restoration, or abrupt silence calls attention to itself.",
        "Proof-window warnings are either harmless, acceptable, or named for v007 repair.",
        "WAV/M4A are normal handoff files Charlie can use in Premiere without repair.",
    ]
    checklist_html = "\n".join(
        f'<label><input type="checkbox"> {escape(item)}</label>' for item in checklist
    )
    artifact_rows = "\n".join(
        f"<tr><td>{escape(item['label'])}</td><td>{escape(item['status'])}</td><td><a href=\"{escape(item['linkRelative'])}\">{escape(item['linkRelative'])}</a></td></tr>"
        for item in report["links"]
    )
    primary_src = primary["linkRelative"] if primary else None
    wav_src = wav["linkRelative"] if wav else None
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Human Listen Session</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101713;
      --panel: #18251f;
      --panel2: #20352b;
      --ink: #f4ecd8;
      --muted: #b8ad93;
      --gold: #f4ca42;
      --green: #66d17c;
      --clay: #d56b4b;
      --line: rgba(244, 236, 216, 0.16);
    }}
    body {{
      margin: 0;
      font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Avenir Next", "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(102, 209, 124, .18), transparent 30rem),
        radial-gradient(circle at bottom right, rgba(244, 202, 66, .12), transparent 28rem),
        var(--bg);
      color: var(--ink);
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 32px; }}
    header {{ border: 1px solid var(--line); border-radius: 28px; padding: 28px; background: rgba(24,37,31,.86); box-shadow: 0 24px 80px rgba(0,0,0,.3); }}
    h1 {{ margin: 0 0 8px; font-size: clamp(32px, 5vw, 58px); letter-spacing: -0.04em; }}
    h2 {{ margin-top: 34px; color: var(--gold); letter-spacing: .12em; text-transform: uppercase; font-size: 13px; }}
    h3 {{ margin: 0 0 8px; }}
    .truth {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin-top: 20px; }}
    .pill {{ background: var(--panel2); border: 1px solid var(--line); border-radius: 16px; padding: 12px 14px; }}
    .pill strong {{ display: block; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .1em; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }}
    .card {{ background: rgba(24,37,31,.92); border: 1px solid var(--line); border-radius: 22px; padding: 18px; }}
    .missing {{ border-color: rgba(213,107,75,.6); }}
    audio {{ width: 100%; margin-top: 12px; }}
    label {{ display: block; padding: 10px 0; border-bottom: 1px solid var(--line); }}
    input {{ transform: scale(1.25); margin-right: 10px; accent-color: var(--green); }}
    table {{ width: 100%; border-collapse: collapse; background: rgba(24,37,31,.72); border-radius: 18px; overflow: hidden; }}
    td, th {{ padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
    a {{ color: var(--gold); }}
    code, pre {{ background: rgba(0,0,0,.32); border: 1px solid var(--line); border-radius: 14px; }}
    pre {{ padding: 14px; overflow: auto; }}
    .warn {{ color: var(--gold); }}
    .nope {{ color: var(--clay); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="warn">Quipsly Audio Workbench</p>
    <h1>Human listen session</h1>
    <p>This page does not approve the baseline. It puts the important audio, warnings, reports, and guarded decision commands in one place so a human can make the approval call without hunting through folders.</p>
    <div class="truth">
      <div class="pill"><strong>Baseline</strong>{escape(report['baselineId'])}</div>
      <div class="pill"><strong>Approval</strong>{escape(str(report['approvalStatus']))}</div>
      <div class="pill"><strong>Listen required</strong>{str(report['humanListenStillRequired']).lower()}</div>
      <div class="pill"><strong>Branch inheritance</strong>{str(report['branchInheritanceReady']).lower()}</div>
      <div class="pill"><strong>Missing links</strong>{report['missingLinkCount']}</div>
    </div>
  </header>

  <h2>Primary listen</h2>
  <div class="grid">
    {html_audio_card("Listening copy M4A", "Use this for the main human listen.", primary_src)}
    {html_audio_card("Full WAV master", "Production handoff master for Premiere and branch inheritance after approval.", wav_src)}
  </div>

  <h2>Proof windows</h2>
  <p>Compare raw, source-aware, conformed, and speaker-split windows. The conformed spine should be cleaner without becoming fake or chopped.</p>
  <div class="grid">
    {''.join(proof_cards) if proof_cards else '<p>No proof snippets found.</p>'}
  </div>

  <h2>Approval checklist</h2>
  <section class="card">
    {checklist_html}
  </section>

  <h2>Guarded commands</h2>
  <p>Only run these after a real listen. Each script requires typing <code>I LISTENED</code>.</p>
  <div class="grid">
    <article class="card">
      <h3>Approve for branch inheritance</h3>
      <p><a href="approve-after-human-listen.command">approve-after-human-listen.command</a></p>
    </article>
    <article class="card">
      <h3>Fail and repair as v007</h3>
      <p><a href="fail-after-human-listen.command">fail-after-human-listen.command</a></p>
    </article>
  </div>

  <h2>All linked artifacts</h2>
  <table>
    <thead><tr><th>Artifact</th><th>Status</th><th>Link</th></tr></thead>
    <tbody>{artifact_rows}</tbody>
  </table>
</main>
</body>
</html>
"""


def markdown_report(report: dict[str, Any]) -> str:
    lines = [
        f"# Human Listen Session: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This packet is the bridge between machine-QC-clean and human-approved. It does not approve v006 by itself.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Missing required links: `{report['missingLinkCount']}`",
        "",
        "## Minimum listen pass",
        "",
        "- Listen to the full M4A enough to catch global level, noise, and pacing issues.",
        "- Listen to every proof-window workorder item.",
        "- Confirm Charlie non-speaking gaps do not carry distracting Homer echo.",
        "- Confirm Homer non-speaking gaps reduce park/background noise without sounding chopped.",
        "- Confirm overlap, laughter, and reaction moments still feel human.",
        "- Confirm no restoration, gating, pumping, clipping, or silence artifacts call attention to themselves.",
        "- Confirm the WAV/M4A are normal stereo handoff files Charlie can use in Premiere without repair.",
        "",
        "## Open these",
        "",
        "| Link | Why | Status |",
        "|---|---|---:|",
    ]
    for item in report["links"]:
        why = {
            "00-review-cockpit": "Visual start point",
            "01-listening-copy": "Primary human listen file",
            "02-full-wav-master": "Production handoff master",
            "03-proof-window-workorder": "Focused warnings and pass/fail conditions",
            "04-proof-window-comparison": "Machine comparison context",
            "05-qc-report": "Loudness/duration/media checks",
            "06-source-activity": "Speaker/source activity evidence",
            "07-source-contribution": "Contribution/mix evidence",
            "08-review-readiness": "Package readiness audit",
            "09-post-listen-next-actions": "What to do after pass/fail",
            "10-decision-command-verification": "Proof decision commands are safe",
            "11-approved-render-executor": "Shows branch render remains locked",
            "12-bleed-management-audit": "Machine evidence for echo/noise reduction",
            "13-bleed-repair-workorder": "Conditional v007 repair path if listen fails",
            "14-bleed-repair-preflight": "Guarded proof-window repair command path",
            "15-human-review-bundle": "Full grouped review bundle",
            "16-handoff-index": "Latest top-level handoff index",
        }.get(item["label"], "Review artifact")
        lines.append(f"| `{item['linkRelative']}` | {why} | `{item['status']}` |")
    lines.extend(
        [
            "",
            "## After listening",
            "",
            "Only run one of these after a human has actually listened.",
            "",
        "- Guided HTML: `listen-session.html`",
        "- If it passes: `approve-after-human-listen.command`",
        "- If it fails: `fail-after-human-listen.command`",
            "",
            "The scripts require typing `I LISTENED` before touching the manifest. Tiny ritual, large banana-safety improvement.",
            "",
            "## If it fails",
            "",
            "Do not overwrite v006. Record the failure, name the failing window/artifact, then render v007 or a timestamped repair candidate.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    session_dir = baseline_dir / f"human-listen-session-{slug}-{generated_at}"
    base_session_dir = session_dir
    suffix = 1
    while session_dir.exists():
        session_dir = base_session_dir.with_name(f"{base_session_dir.name}-{suffix:02d}")
        suffix += 1
    session_dir.mkdir(parents=True, exist_ok=False)

    links: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    for label, key, path_value in artifact_specs(outputs) + proof_snippet_specs(outputs):
        target = Path(path_value) if path_value else None
        suffix = "".join(target.suffixes) if target else ""
        if target and target.is_dir():
            suffix = ""
        link = session_dir / f"{label}{suffix}"
        status = "missing"
        if target and relative_symlink(target, link):
            status = "present"
        else:
            missing.append({"label": label, "key": key, "target": str(target) if target else ""})
        links.append(
            {
                "label": label,
                "key": key,
                "target": str(target) if target else "",
                "link": str(link),
                "linkRelative": str(link.relative_to(session_dir)),
                "status": status,
            }
        )

    report = {
        "schema": "quipsly.audio-workbench.human-listen-session.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "sessionDir": str(session_dir),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "missingLinkCount": len(missing),
        "links": links,
        "missingLinks": missing,
    }

    report_path = session_dir / "human-listen-session.json"
    readme_path = session_dir / "README.md"
    approve_path = session_dir / "approve-after-human-listen.command"
    fail_path = session_dir / "fail-after-human-listen.command"
    html_path = session_dir / "listen-session.html"

    write_json(report_path, report)
    readme_path.write_text(markdown_report(report))
    html_path.write_text(html_report(report))
    approve_path.write_text(
        command_script(
            baseline_dir=baseline_dir,
            status="human-approved-for-branch-inheritance",
            prompt="This records human approval for v006 branch inheritance only after a real listen.",
            notes="Human listened to the v006 listen-session packet and approved it for edit branch inheritance.",
        )
    )
    fail_path.write_text(
        command_script(
            baseline_dir=baseline_dir,
            status="failed-human-listen",
            prompt="This records that v006 failed human listen and must be repaired as v007/timestamped candidate.",
            notes="Human listen found an issue; render v007/timestamped repair candidate instead of overwriting v006.",
            issue="Describe the failing window or artifact here before relying on this failure record.",
        )
    )
    approve_path.chmod(0o755)
    fail_path.chmod(0o755)

    outputs["latestHumanListenSession"] = str(report_path)
    outputs["latestHumanListenSessionReadme"] = str(readme_path)
    outputs["latestHumanListenSessionHtml"] = str(html_path)
    manifest["humanListenSessionCount"] = int(manifest.get("humanListenSessionCount") or 0) + 1
    manifest["humanListenSessionReady"] = len(missing) == 0
    manifest["humanListenSessionLatestStatus"] = "ready" if len(missing) == 0 else "needs-attention"
    manifest["humanListenSessionLinkCount"] = len(links)
    manifest["humanListenSessionMissingLinkCount"] = len(missing)
    manifest["humanListenSessionLatestGeneratedAt"] = generated_at
    manifest["humanListenSessionLatestMarkdown"] = str(readme_path)
    write_json(manifest_path, manifest)

    print(f"Wrote {readme_path}")
    print(f"Wrote {report_path}")
    print(f"Session ready: {len(missing) == 0}")
    print(f"Links: {len(links)}")
    print(f"Missing: {len(missing)}")


if __name__ == "__main__":
    main()
