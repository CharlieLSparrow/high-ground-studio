#!/usr/bin/env python3
"""Create a speaker-cleanup decision matrix for an audio baseline.

This is a reviewer and agent transparency surface. It joins the speaker cleanup
listen map, proof snippets, contribution ledger, preservation proof pack, and
notes inbox state into one decision table. It does not render audio, approve
v006, fail v006, unlock branches, upload, publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in ("path", "markdownPath", "htmlPath", "openCommand", "playlistPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not Path(path).exists() or Path(path).suffix.lower() != ".json":
        return {}
    try:
        return read_json(Path(path))
    except json.JSONDecodeError:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def float_value(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def format_time(seconds: Any) -> str:
    total = max(0, int(round(float_value(seconds))))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def overlap_seconds(a_start: float, a_end: float, b_start: float, b_end: float) -> float:
    return max(0.0, min(a_end, b_end) - max(a_start, b_start))


def near_seconds(a_start: float, a_end: float, b_start: float, b_end: float, pad: float = 6.0) -> bool:
    return overlap_seconds(a_start - pad, a_end + pad, b_start, b_end) > 0.0


def snippet_summary(snippet: dict[str, Any]) -> dict[str, Any]:
    path = output_path(snippet.get("path")) or snippet.get("path")
    return {
        "label": snippet.get("label") or snippet.get("role") or "snippet",
        "role": snippet.get("role") or "unknown",
        "purpose": snippet.get("purpose") or "",
        "path": path,
        "ok": bool(snippet.get("ok", bool(path and Path(str(path)).exists()))),
        "durationSeconds": float_value(snippet.get("durationSeconds") or snippet.get("duration")),
    }


def compact_marker(marker: dict[str, Any]) -> dict[str, Any]:
    return {
        "timecode": marker.get("timecode") or format_time(marker.get("start")),
        "start": float_value(marker.get("start")),
        "end": float_value(marker.get("end")),
        "priority": int_value(marker.get("priority")),
        "category": marker.get("category") or marker.get("source") or "review",
        "flags": marker.get("flags") or [],
        "guidance": marker.get("guidance") or "Listen for speaker presence, bleed, gating, and natural overlap.",
        "charlieDeltaDb": marker.get("charlieDeltaDb"),
        "homerDeltaDb": marker.get("homerDeltaDb"),
    }


def compact_preservation_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "speaker": item.get("speaker") or "unknown",
        "timecode": item.get("timecode") or format_time(item.get("markerStart")),
        "markerStart": float_value(item.get("markerStart")),
        "markerEnd": float_value(item.get("markerEnd")),
        "sourceLabel": item.get("sourceLabel") or "source",
        "flags": item.get("flags") or [],
        "guidance": item.get("guidance") or "Compare source vs master for natural speaker preservation.",
        "masterSnippet": item.get("masterSnippet"),
        "sourceSnippet": item.get("sourceSnippet"),
        "renderStatus": item.get("renderStatus") or "unknown",
        "charlieDeltaDb": item.get("charlieDeltaDb"),
        "homerDeltaDb": item.get("homerDeltaDb"),
    }


def build_matrix(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    listen_map = load_output_report(outputs, "latestSpeakerCleanupListenMap")
    proof_pack = load_output_report(outputs, "latestSpeakerCleanupProofPack")
    proof_pack_audit = load_output_report(outputs, "latestSpeakerCleanupProofPackAudit")
    contribution_ledger = load_output_report(outputs, "latestAudioSpeakerContributionLedger")
    preservation_pack = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    speaker_activity = load_output_report(outputs, "latestAudioSpeakerActivityReviewBoard")
    cleanup_notes_inbox = load_output_report(outputs, "latestSpeakerCleanupListenMapNotesInbox")
    cleanup_notes_smoke = load_output_report(outputs, "latestSpeakerCleanupListenMapNotesInboxSmoke")
    preservation_notes_inbox = load_output_report(outputs, "latestAudioSpeakerPreservationProofNotesInbox")

    listen_rows = listen_map.get("rows") if isinstance(listen_map.get("rows"), list) else []
    contribution_markers = contribution_ledger.get("reviewMarkers") if isinstance(contribution_ledger.get("reviewMarkers"), list) else []
    preservation_items = preservation_pack.get("items") if isinstance(preservation_pack.get("items"), list) else []
    speaker_summaries = contribution_ledger.get("speakerSummaries") if isinstance(contribution_ledger.get("speakerSummaries"), list) else []

    decision_rows: list[dict[str, Any]] = []
    missing_snippet_count = 0
    total_snippet_count = 0
    for row in listen_rows:
        start = float_value(row.get("start"))
        end = float_value(row.get("end"))
        snippets = [snippet_summary(item) for item in (row.get("snippets") or []) if isinstance(item, dict)]
        total_snippet_count += len(snippets)
        missing_snippet_count += sum(1 for item in snippets if not item.get("ok"))
        related_markers = [compact_marker(item) for item in contribution_markers if near_seconds(start, end, float_value(item.get("start")), float_value(item.get("end")))]
        related_markers = sorted(related_markers, key=lambda item: (-int_value(item.get("priority")), float_value(item.get("start"))))[:5]
        related_preservation = [compact_preservation_item(item) for item in preservation_items if near_seconds(start, end, float_value(item.get("markerStart")), float_value(item.get("markerEnd")))]
        related_preservation = sorted(related_preservation, key=lambda item: (item.get("speaker") or "", float_value(item.get("markerStart"))))[:4]
        flags = row.get("flags") or []
        priority = 4 if any("loss" in str(flag) or "overgate" in str(flag) for flag in flags) else 3 if any("bleed" in str(flag) or "noise" in str(flag) for flag in flags) else 2
        decision_rows.append(
            {
                "index": row.get("index") or len(decision_rows) + 1,
                "timecode": row.get("timecode") or format_time(start),
                "start": start,
                "end": end,
                "durationSeconds": float_value(row.get("durationSeconds") or (end - start)),
                "priority": priority,
                "family": row.get("family") or "speaker cleanup",
                "reason": row.get("reason") or "Speaker-aware cleanup review window",
                "flags": flags,
                "questions": row.get("questions") or ["Does the mastered spine sound natural and emotionally intact here?"],
                "passBar": row.get("passBar") or "Speaker sounds natural and cleanup is not noticeable.",
                "failBar": row.get("failBar") or "Speaker sounds chopped, gated, echo-heavy, or emotionally flattened.",
                "safeActionsIfFails": row.get("safeActionsIfFails") or ["Create a scoped v007 proof-window repair candidate instead of editing v006 in place."],
                "snippets": snippets,
                "relatedContributionMarkers": related_markers,
                "relatedPreservationItems": related_preservation,
                "suggestedReviewerAction": "listen-ab-then-note-pass-or-scoped-repair",
            }
        )

    missing_evidence = []
    required_reports = {
        "speaker cleanup listen map": listen_map,
        "speaker cleanup proof pack": proof_pack,
        "speaker cleanup proof pack audit": proof_pack_audit,
        "speaker contribution ledger": contribution_ledger,
        "speaker preservation proof pack": preservation_pack,
        "speaker activity review board": speaker_activity,
    }
    for label, report in required_reports.items():
        if not report:
            missing_evidence.append(label)

    decision_status = "ready-for-human-listen"
    if missing_evidence or missing_snippet_count:
        decision_status = "needs-artifact-repair-before-human-listen"

    return {
        "schema": "quipsly.audio-workbench.speaker-cleanup-decision-matrix.v1",
        "generatedAt": generated_at,
        "baselineId": manifest.get("baselineId"),
        "baselineDir": str(baseline_dir),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "humanListenStillRequired": manifest.get("approvalStatus") != "human-approved-for-branch-inheritance",
        "decisionStatus": decision_status,
        "windowCount": len(decision_rows),
        "proofSnippetCount": total_snippet_count,
        "missingSnippetCount": missing_snippet_count,
        "relatedContributionMarkerCount": sum(len(row["relatedContributionMarkers"]) for row in decision_rows),
        "relatedPreservationItemCount": sum(len(row["relatedPreservationItems"]) for row in decision_rows),
        "proofPackAuditPassed": proof_pack_audit.get("passed") is True,
        "proofPackAuditErrorCount": int_value(proof_pack_audit.get("errorCount")),
        "proofPackAuditWarningCount": int_value(proof_pack_audit.get("warningCount")),
        "speakerSummaries": speaker_summaries,
        "cleanupNotesInboxCandidateCount": int_value(cleanup_notes_inbox.get("matchingCandidateCount")) if cleanup_notes_inbox else 0,
        "cleanupNotesInboxSmokePassed": cleanup_notes_smoke.get("passed") is True if cleanup_notes_smoke else False,
        "preservationNotesInboxCandidateCount": int_value(preservation_notes_inbox.get("matchingCandidateCount")) if preservation_notes_inbox else 0,
        "missingEvidence": missing_evidence,
        "rows": decision_rows,
        "sourceArtifacts": {
            "speakerCleanupListenMap": output_path(outputs.get("latestSpeakerCleanupListenMap")),
            "speakerCleanupProofPack": output_path(outputs.get("latestSpeakerCleanupProofPack")),
            "speakerCleanupProofPackHtml": output_path(outputs.get("latestSpeakerCleanupProofPackHtml")),
            "speakerCleanupProofPackAudit": output_path(outputs.get("latestSpeakerCleanupProofPackAudit")),
            "speakerContributionLedger": output_path(outputs.get("latestAudioSpeakerContributionLedger")),
            "speakerPreservationProofPack": output_path(outputs.get("latestAudioSpeakerPreservationProofPack")),
            "speakerActivityReviewBoard": output_path(outputs.get("latestAudioSpeakerActivityReviewBoard")),
        },
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Decision Matrix: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This matrix joins the speaker cleanup listen map, A/B proof snippets, contribution ledger, preservation proof pack, and notes inbox state. It is a decision surface, not an approval tool.",
        "",
        "## Current truth",
        "",
        f"- Decision status: `{report['decisionStatus']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Windows: `{report['windowCount']}`",
        f"- Proof snippets: `{report['proofSnippetCount']}`; missing snippets: `{report['missingSnippetCount']}`",
        f"- Related contribution markers surfaced: `{report['relatedContributionMarkerCount']}`",
        f"- Related preservation items surfaced: `{report['relatedPreservationItemCount']}`",
        f"- Proof pack audit passed: `{str(report['proofPackAuditPassed']).lower()}`; errors `{report['proofPackAuditErrorCount']}`; warnings `{report['proofPackAuditWarningCount']}`",
        "",
        "## Speaker summaries",
        "",
    ]
    for item in report.get("speakerSummaries") or []:
        lines.append(
            f"- {item.get('label') or item.get('speaker')}: retained `{item.get('retainedActivePercent', 'n/a')}`% of active windows; loss-risk windows `{item.get('lossRiskWindowCount', 0)}`; bleed-risk windows `{item.get('bleedRiskWindowCount', 0)}`."
        )
    if not report.get("speakerSummaries"):
        lines.append("- No speaker summary rows were available.")
    lines.extend(["", "## Decision rows", ""])
    for row in report.get("rows") or []:
        lines.extend(
            [
                f"### {row['index']}. {row['timecode']} - {row['reason']}",
                "",
                f"- Range: `{format_time(row['start'])}` to `{format_time(row['end'])}` (`{row['durationSeconds']:.1f}s`)",
                f"- Family: `{row['family']}`; priority `{row['priority']}`; flags `{', '.join(row['flags']) or 'none'}`",
                f"- Pass bar: {row['passBar']}",
                f"- Fail bar: {row['failBar']}",
                f"- Snippets: `{len(row['snippets'])}`; nearby contribution markers `{len(row['relatedContributionMarkers'])}`; preservation items `{len(row['relatedPreservationItems'])}`",
                "- Questions:",
            ]
        )
        for question in row.get("questions") or []:
            lines.append(f"  - {question}")
        lines.append("- Safe action if failed:")
        for action in row.get("safeActionsIfFails") or []:
            lines.append(f"  - {action}")
        lines.append("")
    if report.get("missingEvidence"):
        lines.extend(["## Missing evidence", ""])
        for item in report["missingEvidence"]:
            lines.append(f"- {item}")
        lines.append("")
    lines.extend(
        [
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


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for row in report.get("rows") or []:
        snippets_html = []
        for snippet in row.get("snippets") or []:
            src = snippet.get("path") or ""
            if src:
                snippets_html.append(
                    f"""
                    <div class=\"snippet\">
                      <strong>{e(snippet.get('label'))}</strong><span>{e(snippet.get('role'))} · {snippet.get('durationSeconds', 0):.1f}s</span>
                      <audio controls preload=\"metadata\" src=\"{e(src)}\"></audio>
                    </div>
                    """
                )
        markers = "".join(
            f"<li><strong>{e(item.get('timecode'))}</strong> p{e(item.get('priority'))}: {e(', '.join(item.get('flags') or []))}</li>"
            for item in row.get("relatedContributionMarkers") or []
        ) or "<li>No nearby contribution marker surfaced.</li>"
        preservation = "".join(
            f"<li><strong>{e(item.get('speaker'))}</strong> {e(item.get('timecode'))}: {e(item.get('sourceLabel'))}</li>"
            for item in row.get("relatedPreservationItems") or []
        ) or "<li>No nearby preservation A/B item surfaced.</li>"
        questions = "".join(f"<li>{e(question)}</li>" for question in row.get("questions") or [])
        actions = "".join(f"<li>{e(action)}</li>" for action in row.get("safeActionsIfFails") or [])
        cards.append(
            f"""
            <article class=\"window-card\">
              <header>
                <span class=\"index\">{e(row.get('index'))}</span>
                <div>
                  <h3>{e(row.get('timecode'))} · {e(row.get('reason'))}</h3>
                  <p>{e(format_time(row.get('start')))} to {e(format_time(row.get('end')))} · {row.get('durationSeconds', 0):.1f}s · priority {e(row.get('priority'))}</p>
                </div>
              </header>
              <div class=\"chips\"><span>{e(row.get('family'))}</span>{''.join(f'<span>{e(flag)}</span>' for flag in row.get('flags') or [])}</div>
              <section class=\"bars\">
                <div><strong>Pass</strong><p>{e(row.get('passBar'))}</p></div>
                <div><strong>Fail</strong><p>{e(row.get('failBar'))}</p></div>
              </section>
              <section class=\"question-grid\">
                <div><h4>Listen questions</h4><ul>{questions}</ul></div>
                <div><h4>If it fails</h4><ul>{actions}</ul></div>
              </section>
              <section><h4>A/B proof snippets</h4><div class=\"snippet-grid\">{''.join(snippets_html) or '<p>No snippets found for this row.</p>'}</div></section>
              <section class=\"question-grid\">
                <div><h4>Nearby contribution evidence</h4><ul>{markers}</ul></div>
                <div><h4>Nearby preservation evidence</h4><ul>{preservation}</ul></div>
              </section>
            </article>
            """
        )
    speaker_rows = "".join(
        f"<tr><td>{e(item.get('label') or item.get('speaker'))}</td><td>{e(item.get('retainedActivePercent', 'n/a'))}%</td><td>{e(item.get('lossRiskWindowCount', 0))}</td><td>{e(item.get('bleedRiskWindowCount', 0))}</td></tr>"
        for item in report.get("speakerSummaries") or []
    ) or "<tr><td colspan='4'>No speaker summaries found.</td></tr>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Speaker Cleanup Decision Matrix</title>
  <style>
    :root {{ color-scheme: dark; --bg:#0f1713; --panel:#17251e; --panel2:#21372c; --ink:#f6efd9; --muted:#bfb292; --gold:#f1c84b; --green:#6bd37d; --clay:#d36d51; --cyan:#5cc7d9; --line:rgba(246,239,217,.15); }}
    body {{ margin:0; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Avenir Next","Segoe UI",sans-serif; color:var(--ink); background:radial-gradient(circle at 12% 0%,rgba(107,211,125,.16),transparent 28rem),radial-gradient(circle at 88% 10%,rgba(241,200,75,.12),transparent 30rem),var(--bg); }}
    main {{ max-width:1320px; margin:0 auto; padding:32px; }}
    .hero,.window-card {{ border:1px solid var(--line); background:rgba(23,37,30,.9); box-shadow:0 24px 80px rgba(0,0,0,.25); border-radius:28px; }}
    .hero {{ padding:28px; margin-bottom:24px; }}
    h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,64px); letter-spacing:-.045em; }}
    h2 {{ margin:26px 0 12px; color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:12px; }}
    h3 {{ margin:0; font-size:20px; }} h4 {{ margin:18px 0 8px; color:var(--gold); }}
    .truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; margin-top:18px; }}
    .pill {{ border:1px solid var(--line); background:var(--panel2); border-radius:18px; padding:12px; }}
    .pill strong {{ display:block; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.11em; }}
    table {{ width:100%; border-collapse:collapse; overflow:hidden; border-radius:18px; background:rgba(23,37,30,.74); }} td,th {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; }} th {{ color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.1em; }}
    .window-card {{ padding:20px; margin:16px 0; }} .window-card header {{ display:flex; gap:14px; align-items:center; }}
    .index {{ display:grid; place-items:center; min-width:44px; height:44px; border-radius:14px; background:var(--gold); color:#2b2108; font-weight:900; }}
    .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }} .chips span {{ border:1px solid var(--line); border-radius:999px; padding:4px 9px; color:var(--muted); background:rgba(255,255,255,.04); }}
    .bars,.question-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    .bars div,.question-grid div,.snippet {{ border:1px solid var(--line); background:rgba(33,55,44,.7); border-radius:18px; padding:14px; }}
    .bars strong {{ color:var(--green); }} .bars div:nth-child(2) strong {{ color:var(--clay); }}
    .snippet-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:10px; }}
    .snippet span {{ display:block; color:var(--muted); font-size:12px; }} audio {{ width:100%; margin-top:8px; }}
    footer {{ color:var(--muted); padding:24px 0 8px; }}
  </style>
</head>
<body>
<main>
  <section class=\"hero\">
    <p style=\"color:var(--gold);text-transform:uppercase;letter-spacing:.18em;font-weight:800\">Quipsly Audio Workbench</p>
    <h1>Speaker Cleanup Decision Matrix</h1>
    <p>This joins cleanup windows, A/B snippets, source contribution evidence, and preservation proof into one reviewer surface. It does not approve v006 or unlock branch rendering.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Status</strong>{e(report['decisionStatus'])}</div>
      <div class=\"pill\"><strong>Windows</strong>{e(report['windowCount'])}</div>
      <div class=\"pill\"><strong>Proof snippets</strong>{e(report['proofSnippetCount'])} total / {e(report['missingSnippetCount'])} missing</div>
      <div class=\"pill\"><strong>Approval</strong>{e(report['approvalStatus'])}</div>
      <div class=\"pill\"><strong>Branch render</strong>{str(report['branchRenderReady']).lower()}</div>
    </div>
  </section>
  <h2>Speaker summaries</h2>
  <table><thead><tr><th>Speaker</th><th>Retained active</th><th>Loss-risk windows</th><th>Bleed-risk windows</th></tr></thead><tbody>{speaker_rows}</tbody></table>
  <h2>Decision windows</h2>
  {''.join(cards)}
  <footer>Generated {e(report['generatedAt'])}. Original media mutated: false. Render attempted: false.</footer>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text("\n".join(["#!/bin/zsh", "set -euo pipefail", f"open {shell_quote(str(html_path))}", f"open {shell_quote(str(markdown_path))}"]) + "\n", encoding="utf-8")
    os.chmod(path, 0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"speaker-cleanup-decision-matrix-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_json = output_dir / "speaker-cleanup-decision-matrix.json"
    output_md = output_dir / "speaker-cleanup-decision-matrix.md"
    output_html = output_dir / "speaker-cleanup-decision-matrix.html"
    output_open = output_dir / "open-speaker-cleanup-decision-matrix.command"
    stable_json = baseline_dir / "SPEAKER_CLEANUP_DECISION_MATRIX.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_DECISION_MATRIX.md"
    stable_html = baseline_dir / "SPEAKER_CLEANUP_DECISION_MATRIX.html"
    stable_open = baseline_dir / "OPEN_SPEAKER_CLEANUP_DECISION_MATRIX.command"

    report = build_matrix(manifest_before, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(output_json, report)
    output_md.write_text(markdown, encoding="utf-8")
    output_html.write_text(html_doc, encoding="utf-8")
    write_open_command(output_open, output_html, output_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(output_json),
        "versionedMarkdownPath": str(output_md),
        "versionedHtmlPath": str(output_html),
        "versionedOpenCommand": str(output_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["decisionStatus"],
        "windowCount": report["windowCount"],
        "proofSnippetCount": report["proofSnippetCount"],
        "missingSnippetCount": report["missingSnippetCount"],
        "relatedContributionMarkerCount": report["relatedContributionMarkerCount"],
        "relatedPreservationItemCount": report["relatedPreservationItemCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("speakerCleanupDecisionMatrices", [])
    history.append(entry)
    outputs["latestSpeakerCleanupDecisionMatrix"] = entry
    outputs["latestSpeakerCleanupDecisionMatrixMarkdown"] = str(stable_md)
    outputs["latestSpeakerCleanupDecisionMatrixHtml"] = str(stable_html)
    outputs["latestSpeakerCleanupDecisionMatrixOpenCommand"] = str(stable_open)
    outputs["latestSpeakerCleanupDecisionMatrixVersionedJson"] = str(output_json)
    outputs["latestSpeakerCleanupDecisionMatrixVersionedMarkdown"] = str(output_md)
    outputs["latestSpeakerCleanupDecisionMatrixVersionedHtml"] = str(output_html)
    outputs["latestSpeakerCleanupDecisionMatrixVersionedOpenCommand"] = str(output_open)
    manifest_after["speakerCleanupDecisionMatrixCount"] = len(history)
    manifest_after["speakerCleanupDecisionMatrixLatestStatus"] = report["decisionStatus"]
    manifest_after["speakerCleanupDecisionMatrixWindowCount"] = report["windowCount"]
    manifest_after["speakerCleanupDecisionMatrixMissingSnippetCount"] = report["missingSnippetCount"]
    manifest_after["speakerCleanupDecisionMatrixOriginalMediaMutated"] = False
    manifest_after["speakerCleanupDecisionMatrixApprovalStateChanged"] = False
    manifest_after["speakerCleanupDecisionMatrixBranchStateChanged"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
