#!/usr/bin/env python3
"""Build the speaker-cleanup acceptance board for an audio baseline.

This is the bridge between machine audio evidence and human listen approval. It
summarizes whether speaker-aware cleanup has enough proof to ask for human ears,
which artifacts support that proof, and what remains locked. It does not approve
or fail audio, unlock branch inheritance, render episode branches, upload,
publish, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
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
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "m4aPath",
            "playlistPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def seconds_label(value: Any) -> str:
    try:
        seconds = max(0.0, float(value))
    except (TypeError, ValueError):
        return "unknown"
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = seconds % 60
    if hours:
        return f"{hours}:{minutes:02d}:{secs:05.2f}"
    return f"{minutes}:{secs:05.2f}"


def local_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "`missing`"
    display = label or Path(path).name
    path_obj = Path(path)
    if path_obj.exists():
        return f"[{display}]({path_obj.as_uri()})"
    return f"`{path}`"


def html_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "<span class='missing'>missing</span>"
    display = html.escape(label or Path(path).name)
    path_obj = Path(path)
    if path_obj.exists():
        return f"<a href='{html.escape(path_obj.as_uri())}'>{display}</a>"
    return f"<code>{html.escape(path)}</code>"


def artifact(label: str, key: str, path: str | None, why: str) -> dict[str, Any]:
    exists = bool(path and Path(path).exists())
    return {
        "label": label,
        "key": key,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists else None,
        "why": why,
    }


def check(name: str, passed: bool, detail: str, *, next_action: str, evidence_keys: list[str]) -> dict[str, Any]:
    return {
        "name": name,
        "status": "passed" if passed else "needs-attention",
        "passed": passed,
        "detail": detail,
        "nextAction": next_action,
        "evidenceKeys": evidence_keys,
    }


def compact_triage_rows(triage: dict[str, Any], limit: int = 15) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for row in triage.get("rows") or []:
        if not isinstance(row, dict):
            continue
        rows.append(
            {
                "index": row.get("index"),
                "timecode": row.get("timecode") or seconds_label(row.get("start")),
                "start": row.get("start"),
                "end": row.get("end"),
                "durationSeconds": row.get("durationSeconds"),
                "priority": row.get("priority"),
                "mustListen": bool_value(row.get("mustListen")),
                "symptom": row.get("symptom"),
                "reason": row.get("reason"),
                "reviewerPrompt": row.get("reviewerPrompt"),
                "failurePrompt": row.get("failurePrompt"),
                "safeActionIfFails": row.get("safeActionIfFails"),
                "flags": row.get("flags") or [],
            }
        )
    rows.sort(key=lambda item: (0 if item.get("mustListen") else 1, -(int_value(item.get("priority"))), float(item.get("start") or 0.0)))
    return rows[:limit]


def count_symptoms(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        symptom = str(row.get("symptom") or "unknown")
        counts[symptom] = counts.get(symptom, 0) + 1
    return dict(sorted(counts.items()))


def all_false(report: dict[str, Any], keys: list[str]) -> bool:
    return bool(report) and all(report.get(key) is False for key in keys)


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    approval_status = str(manifest.get("approvalStatus") or "unknown")
    package_ready = bool_value(manifest.get("packageReadyForHumanListen"))
    branch_inheritance_ready = bool_value(manifest.get("branchInheritanceReady"))
    branch_render_ready = bool_value(manifest.get("branchRenderReady"))

    cleanup_triage, cleanup_triage_path = load_output_report(outputs, "latestSpeakerCleanupTriageBoard")
    cleanup_pack, cleanup_pack_path = load_output_report(outputs, "latestSpeakerCleanupProofPack")
    cleanup_audit, cleanup_audit_path = load_output_report(outputs, "latestSpeakerCleanupProofPackAudit")
    cleanup_matrix, cleanup_matrix_path = load_output_report(outputs, "latestSpeakerCleanupDecisionMatrix")
    cleanup_map, cleanup_map_path = load_output_report(outputs, "latestSpeakerCleanupListenMap")
    preservation_pack, preservation_pack_path = load_output_report(outputs, "latestAudioSpeakerPreservationProofPack")
    preservation_inbox, preservation_inbox_path = load_output_report(outputs, "latestAudioSpeakerPreservationProofNotesInbox")
    bleed_audit, bleed_audit_path = load_output_report(outputs, "latestSpeakerBleedGapProofAudit")
    spine_sanity, spine_sanity_path = load_output_report(outputs, "latestAudioSpineListenSanityCheck")
    post_queue, post_queue_path = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    mission_board, mission_board_path = load_output_report(outputs, "latestAudioHumanListenMissionBoard")
    mission_reel, mission_reel_path = load_output_report(outputs, "latestAudioHumanListenMissionReel")

    source_artifacts = [
        artifact("Speaker cleanup triage board", "latestSpeakerCleanupTriageBoard", cleanup_triage_path, "Symptom-first listen map with pass/fail bars."),
        artifact("Speaker cleanup proof pack", "latestSpeakerCleanupProofPack", cleanup_pack_path, "A/B snippets for raw aligned stems, contribution-gated stems, and master."),
        artifact("Speaker cleanup proof pack audit", "latestSpeakerCleanupProofPackAudit", cleanup_audit_path, "Mechanical audit for proof snippet existence and failure counts."),
        artifact("Speaker cleanup decision matrix", "latestSpeakerCleanupDecisionMatrix", cleanup_matrix_path, "Cleanup windows tied to evidence and safe repair actions."),
        artifact("Speaker cleanup listen map", "latestSpeakerCleanupListenMap", cleanup_map_path, "Playable review path for cleanup windows."),
        artifact("Speaker preservation proof pack", "latestAudioSpeakerPreservationProofPack", preservation_pack_path, "A/B proof for Charlie and Homer preservation risk."),
        artifact("Speaker preservation notes inbox", "latestAudioSpeakerPreservationProofNotesInbox", preservation_inbox_path, "Focused notes return path for preservation proof."),
        artifact("Speaker bleed/gap proof audit", "latestSpeakerBleedGapProofAudit", bleed_audit_path, "Broad source-activity evidence for echo, park noise, overlap, and over-gating risk."),
        artifact("Audio spine listen sanity check", "latestAudioSpineListenSanityCheck", spine_sanity_path, "Machine sanity guard that active Charlie/Homer windows remain audible in the master."),
        artifact("Post-review action queue", "latestAudioPostReviewActionQueue", post_queue_path, "Unified queue after exported reviewer notes."),
        artifact("Human Listen Mission Board", "latestAudioHumanListenMissionBoard", mission_board_path, "Calm reviewer mission path."),
        artifact("Human Listen Mission Reel", "latestAudioHumanListenMissionReel", mission_reel_path, "Short focused derived listen reel."),
    ]

    triage_rows = compact_triage_rows(cleanup_triage)
    missing_artifact_count = sum(1 for item in source_artifacts if not item["exists"])
    missing_snippet_count = int_value(cleanup_triage.get("missingSnippetCount")) + int_value(cleanup_matrix.get("missingSnippetCount"))
    machine_checks = [
        check(
            "cleanup-proof-pack-rendered",
            int_value(cleanup_pack.get("renderSuccessCount")) >= 90 and int_value(cleanup_pack.get("renderFailureCount")) == 0,
            f"rendered={cleanup_pack.get('renderSuccessCount') or 0}; failures={cleanup_pack.get('renderFailureCount') or 0}; windows={cleanup_pack.get('focusWindowCount') or 0}",
            next_action="If this fails, regenerate proof snippets before asking for human cleanup approval.",
            evidence_keys=["latestSpeakerCleanupProofPack"],
        ),
        check(
            "cleanup-proof-pack-audit-passed",
            bool_value(cleanup_audit.get("passed")) and int_value(cleanup_audit.get("errorCount")) == 0 and int_value(cleanup_audit.get("warningCount")) == 0,
            f"passed={str(bool_value(cleanup_audit.get('passed'))).lower()}; errors={cleanup_audit.get('errorCount') or 0}; warnings={cleanup_audit.get('warningCount') or 0}",
            next_action="If this fails, repair missing or broken proof files before human listen.",
            evidence_keys=["latestSpeakerCleanupProofPackAudit"],
        ),
        check(
            "triage-board-complete",
            cleanup_triage.get("status") == "ready-for-human-triage" and int_value(cleanup_triage.get("missingEvidenceCount")) == 0 and int_value(cleanup_triage.get("missingSnippetCount")) == 0,
            f"status={cleanup_triage.get('status') or 'missing'}; windows={cleanup_triage.get('windowCount') or 0}; mustListen={cleanup_triage.get('mustListenCount') or 0}; missingEvidence={cleanup_triage.get('missingEvidenceCount') or 0}; missingSnippets={cleanup_triage.get('missingSnippetCount') or 0}",
            next_action="If this fails, rebuild the triage board before routing notes.",
            evidence_keys=["latestSpeakerCleanupTriageBoard"],
        ),
        check(
            "decision-matrix-ready",
            cleanup_matrix.get("decisionStatus") == "ready-for-human-listen" and int_value(cleanup_matrix.get("missingSnippetCount")) == 0,
            f"status={cleanup_matrix.get('decisionStatus') or cleanup_matrix.get('status') or 'missing'}; windows={cleanup_matrix.get('windowCount') or 0}; proofSnippets={cleanup_matrix.get('proofSnippetCount') or 0}; missingSnippets={cleanup_matrix.get('missingSnippetCount') or 0}",
            next_action="If this fails, restore the decision matrix before using cleanup notes as action truth.",
            evidence_keys=["latestSpeakerCleanupDecisionMatrix"],
        ),
        check(
            "preservation-proof-ready",
            int_value(preservation_pack.get("itemCount")) > 0 and int_value(preservation_pack.get("renderFailureCount")) == 0,
            f"items={preservation_pack.get('itemCount') or 0}; snippets={preservation_pack.get('renderedSnippetCount') or 0}; failures={preservation_pack.get('renderFailureCount') or 0}",
            next_action="If this fails, rebuild the speaker preservation proof pack before approval.",
            evidence_keys=["latestAudioSpeakerPreservationProofPack"],
        ),
        check(
            "spine-listen-sanity-passed",
            bool_value(spine_sanity.get("passed")) and spine_sanity.get("status") == "machine-sane-human-listen-required",
            f"status={spine_sanity.get('status') or 'missing'}; passed={str(bool_value(spine_sanity.get('passed'))).lower()}",
            next_action="If this fails, do not ask for approval. Repair the master/source relationship first.",
            evidence_keys=["latestAudioSpineListenSanityCheck"],
        ),
        check(
            "post-review-queue-safe",
            post_queue.get("status") == "ready-for-review-actions" and all_false(post_queue, ["approvalStateChanged", "branchStateChanged", "renderAttempted", "originalMediaMutated"]),
            f"status={post_queue.get('status') or 'missing'}; sourcesWithNotes={post_queue.get('sourceWithNotesCandidateCount') or 0}; repair={post_queue.get('repairActionCount') or 0}; proof={post_queue.get('focusedProofActionCount') or 0}; pass={post_queue.get('passContextCount') or 0}",
            next_action="If this fails, regenerate the queue before using reviewer notes.",
            evidence_keys=["latestAudioPostReviewActionQueue"],
        ),
        check(
            "human-listen-runway-ready",
            mission_board.get("status") == "ready-for-human-listen-mission" and mission_reel.get("status") == "ready-for-focused-human-listen" and int_value(mission_reel.get("missingSnippetCount")) == 0,
            f"missionBoard={mission_board.get('status') or 'missing'}; missionReel={mission_reel.get('status') or 'missing'}; reelItems={mission_reel.get('itemCount') or 0}; missingSnippets={mission_reel.get('missingSnippetCount') or 0}",
            next_action="If this fails, refresh the mission board/reel before handing off to Charlie or Mako.",
            evidence_keys=["latestAudioHumanListenMissionBoard", "latestAudioHumanListenMissionReel"],
        ),
        check(
            "branch-locks-preserved",
            package_ready and not branch_inheritance_ready and not branch_render_ready and approval_status == "machine-candidate-needs-human-listen-proof",
            f"approval={approval_status}; packageReady={str(package_ready).lower()}; branchInheritance={str(branch_inheritance_ready).lower()}; branchRender={str(branch_render_ready).lower()}",
            next_action="Keep branch inheritance/render locked until a real human listen decision is recorded.",
            evidence_keys=["manifest.json"],
        ),
    ]

    passed_count = sum(1 for item in machine_checks if item["passed"])
    status = "machine-evidence-ready-human-listen-required" if missing_artifact_count == 0 and missing_snippet_count == 0 and passed_count == len(machine_checks) else "needs-evidence-repair-before-human-approval"
    return {
        "schema": "quipsly.audio-workbench.speaker-cleanup-acceptance-board.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "approvalStatus": approval_status,
        "packageReadyForHumanListen": package_ready,
        "branchInheritanceReady": branch_inheritance_ready,
        "branchRenderReady": branch_render_ready,
        "humanListenRequired": True,
        "machineCheckCount": len(machine_checks),
        "machineCheckPassedCount": passed_count,
        "machineCheckNeedsAttentionCount": len(machine_checks) - passed_count,
        "missingArtifactCount": missing_artifact_count,
        "missingSnippetCount": missing_snippet_count,
        "mustListenCount": int_value(cleanup_triage.get("mustListenCount")),
        "windowCount": int_value(cleanup_triage.get("windowCount")),
        "focusWindowCount": len(triage_rows),
        "proofSnippetCount": int_value(cleanup_matrix.get("proofSnippetCount")) or int_value(cleanup_pack.get("renderSuccessCount")),
        "preservationSnippetCount": int_value(preservation_pack.get("renderedSnippetCount")),
        "symptomCounts": count_symptoms(triage_rows),
        "sourceArtifacts": source_artifacts,
        "machineChecks": machine_checks,
        "focusWindows": triage_rows,
        "criticalCleanup": manifest.get("criticalCleanup") or {},
        "reviewerInstruction": "Use this board to verify that the cleanup evidence is complete, then listen. Passing this board is not approval; it only means the human listen is now properly armed.",
        "nextSafeAction": "Open the Human Listen Mission Board or Speaker Cleanup Triage Board, listen to the focus windows, export notes, then route the guarded human decision. Do not unlock branch inheritance or render edit branches yet.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Speaker Cleanup Acceptance Board",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This board answers one production question: is the speaker-aware cleanup evidence complete enough to ask for a real human listen decision? It does not approve v006, fail v006, unlock branch inheritance, render branches, upload, publish, or mutate original media.",
        "",
        "## Current answer",
        "",
        f"- Status: `{report['status']}`",
        f"- Machine checks passed: `{report['machineCheckPassedCount']}` / `{report['machineCheckCount']}`",
        f"- Missing artifacts: `{report['missingArtifactCount']}`",
        f"- Missing snippets: `{report['missingSnippetCount']}`",
        f"- Must-listen windows: `{report['mustListenCount']}`",
        f"- Human listen required: `{str(report['humanListenRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        "",
        "## Machine checks",
        "",
        "| Check | Status | Detail | Next action |",
        "|---|---|---|---|",
    ]
    for item in report["machineChecks"]:
        lines.append(f"| {item['name']} | {item['status']} | {item['detail']} | {item['nextAction']} |")
    lines.extend(["", "## Source artifacts", ""])
    for item in report["sourceArtifacts"]:
        state = "present" if item["exists"] else "missing"
        lines.append(f"- `{state}` {item['label']}: {local_link(item.get('path'))} - {item['why']}")
    lines.extend(["", "## Listen focus windows", "", "| # | Time | Symptom | Why listen | Fail if |", "|---:|---|---|---|---|"])
    for row in report["focusWindows"]:
        lines.append(
            f"| {row.get('index')} | {row.get('timecode')} | {row.get('symptom')} | {row.get('reviewerPrompt') or row.get('reason')} | {row.get('failurePrompt') or row.get('safeActionIfFails')} |"
        )
    lines.extend(
        [
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
            "The monkey-proof bit: this board can say the evidence is ready. Only a real human listen can say the audio is approved.",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    checks = "".join(
        f"<tr><td>{html.escape(item['name'])}</td><td class='{html.escape(item['status'])}'>{html.escape(item['status'])}</td><td>{html.escape(item['detail'])}</td><td>{html.escape(item['nextAction'])}</td></tr>"
        for item in report["machineChecks"]
    )
    artifacts = "".join(
        f"<li><strong>{html.escape(item['label'])}</strong> <span class='{('ok' if item['exists'] else 'missing')}'>{'present' if item['exists'] else 'missing'}</span><br>{html_link(item.get('path'))}<br><em>{html.escape(item['why'])}</em></li>"
        for item in report["sourceArtifacts"]
    )
    windows = "".join(
        f"<tr><td>{html.escape(str(row.get('index')))}</td><td>{html.escape(str(row.get('timecode')))}</td><td>{html.escape(str(row.get('symptom')))}</td><td>{html.escape(str(row.get('reviewerPrompt') or row.get('reason') or 'Listen for naturalness'))}</td><td>{html.escape(str(row.get('failurePrompt') or row.get('safeActionIfFails') or 'Route scoped repair'))}</td></tr>"
        for row in report["focusWindows"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Speaker Cleanup Acceptance Board</title>
<style>
:root {{ color-scheme: dark; --bg:#101712; --panel:#18251d; --panel2:#223328; --ink:#f8edd4; --muted:#bcae95; --gold:#f4c542; --green:#88d58d; --red:#e66a5f; --cyan:#70d6d1; --line:#39513f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; background:radial-gradient(circle at 15% 0%,#284634,#101712 58%); color:var(--ink); }}
main {{ max-width:1240px; margin:0 auto; padding:34px; }}
h1 {{ font-size:38px; margin:0 0 8px; }}
p, li, td {{ color:var(--muted); line-height:1.45; }}
.hero {{ border:1px solid var(--line); background:rgba(24,37,29,.9); border-radius:24px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.28); }}
.badges {{ display:flex; flex-wrap:wrap; gap:10px; margin:20px 0; }}
.badge {{ padding:10px 13px; border-radius:999px; background:rgba(255,255,255,.05); border:1px solid var(--line); }}
.badge strong {{ color:var(--gold); }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:18px; }}
.card {{ background:rgba(34,51,40,.78); border:1px solid var(--line); border-radius:20px; padding:18px; }}
table {{ width:100%; border-collapse:separate; border-spacing:0 8px; }}
th {{ text-align:left; color:var(--gold); font-size:12px; letter-spacing:.08em; text-transform:uppercase; }}
td {{ background:rgba(24,37,29,.85); border-top:1px solid var(--line); border-bottom:1px solid var(--line); padding:12px; vertical-align:top; }}
td:first-child {{ border-left:1px solid var(--line); border-radius:14px 0 0 14px; }}
td:last-child {{ border-right:1px solid var(--line); border-radius:0 14px 14px 0; }}
.passed,.ok {{ color:var(--green); font-weight:800; }}
.needs-attention,.missing {{ color:var(--red); font-weight:800; }}
a {{ color:var(--cyan); }}
code {{ color:var(--gold); }}
@media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
</style>
</head>
<body><main>
<section class="hero">
<h1>Speaker Cleanup Acceptance Board</h1>
<p>Evidence bridge for Episode 4 v006: whole source sync stays intact, cleanup lives on derived stems, and human approval remains separate from machine confidence.</p>
<div class="badges">
  <div class="badge"><strong>Status</strong> {html.escape(report['status'])}</div>
  <div class="badge"><strong>Checks</strong> {report['machineCheckPassedCount']} / {report['machineCheckCount']}</div>
  <div class="badge"><strong>Must-listen</strong> {report['mustListenCount']}</div>
  <div class="badge"><strong>Missing artifacts</strong> {report['missingArtifactCount']}</div>
  <div class="badge"><strong>Branch render</strong> {str(report['branchRenderReady']).lower()}</div>
</div>
<p><strong>Next:</strong> {html.escape(report['nextSafeAction'])}</p>
</section>
<div class="grid">
<section class="card"><h2>Machine checks</h2><table><thead><tr><th>Check</th><th>Status</th><th>Detail</th><th>Next</th></tr></thead><tbody>{checks}</tbody></table></section>
<section class="card"><h2>Source artifacts</h2><ul>{artifacts}</ul></section>
</div>
<section class="card"><h2>Listen focus windows</h2><table><thead><tr><th>#</th><th>Time</th><th>Symptom</th><th>Listen for</th><th>Fail if</th></tr></thead><tbody>{windows}</tbody></table></section>
</main></body></html>
"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\nset -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build speaker-cleanup acceptance board for an audio baseline.")
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(str(manifest.get("baselineId") or "audio-baseline"))

    report = build_report(manifest, baseline_dir, generated_at)
    version_dir = baseline_dir / f"speaker-cleanup-acceptance-board-{slug}-{generated_at}"
    version_dir.mkdir(parents=True, exist_ok=True)

    stable_json = baseline_dir / "SPEAKER_CLEANUP_ACCEPTANCE_BOARD.json"
    stable_md = baseline_dir / "SPEAKER_CLEANUP_ACCEPTANCE_BOARD.md"
    stable_html = baseline_dir / "SPEAKER_CLEANUP_ACCEPTANCE_BOARD.html"
    stable_open = baseline_dir / "OPEN_SPEAKER_CLEANUP_ACCEPTANCE_BOARD.command"
    version_json = version_dir / "speaker-cleanup-acceptance-board.json"
    version_md = version_dir / "speaker-cleanup-acceptance-board.md"
    version_html = version_dir / "speaker-cleanup-acceptance-board.html"
    version_open = version_dir / "open-speaker-cleanup-acceptance-board.command"

    report.update(
        {
            "path": str(stable_json),
            "jsonPath": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "openCommand": str(stable_open),
            "versionedPath": str(version_json),
            "versionedJsonPath": str(version_json),
            "versionedMarkdownPath": str(version_md),
            "versionedHtmlPath": str(version_html),
            "versionedOpenCommand": str(version_open),
        }
    )

    markdown = render_markdown(report)
    html_payload = render_html(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown + "\n", encoding="utf-8")
    for path in (stable_html, version_html):
        path.write_text(html_payload, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(version_open, version_html, version_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "schema": report["schema"],
        "status": report["status"],
        "generatedAt": generated_at,
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(version_json),
        "versionedJsonPath": str(version_json),
        "versionedMarkdownPath": str(version_md),
        "versionedHtmlPath": str(version_html),
        "versionedOpenCommand": str(version_open),
        "machineCheckCount": report["machineCheckCount"],
        "machineCheckPassedCount": report["machineCheckPassedCount"],
        "machineCheckNeedsAttentionCount": report["machineCheckNeedsAttentionCount"],
        "missingArtifactCount": report["missingArtifactCount"],
        "missingSnippetCount": report["missingSnippetCount"],
        "focusWindowCount": report["focusWindowCount"],
        "mustListenCount": report["mustListenCount"],
        "humanListenRequired": report["humanListenRequired"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = list(manifest_after.get("speakerCleanupAcceptanceBoards") or [])
    history.append(entry)
    manifest_after["speakerCleanupAcceptanceBoards"] = history
    outputs["latestSpeakerCleanupAcceptanceBoard"] = str(stable_json)
    outputs["latestSpeakerCleanupAcceptanceBoardMarkdown"] = str(stable_md)
    outputs["latestSpeakerCleanupAcceptanceBoardHtml"] = str(stable_html)
    outputs["latestSpeakerCleanupAcceptanceBoardOpenCommand"] = str(stable_open)
    outputs["latestSpeakerCleanupAcceptanceBoardVersioned"] = str(version_json)
    outputs["latestSpeakerCleanupAcceptanceBoardVersionedMarkdown"] = str(version_md)
    outputs["latestSpeakerCleanupAcceptanceBoardVersionedHtml"] = str(version_html)
    manifest_after["speakerCleanupAcceptanceBoardCount"] = len(history)
    manifest_after["speakerCleanupAcceptanceBoardLatestStatus"] = report["status"]
    manifest_after["speakerCleanupAcceptanceBoardMachineCheckCount"] = report["machineCheckCount"]
    manifest_after["speakerCleanupAcceptanceBoardMachineCheckPassedCount"] = report["machineCheckPassedCount"]
    manifest_after["speakerCleanupAcceptanceBoardMachineCheckNeedsAttentionCount"] = report["machineCheckNeedsAttentionCount"]
    manifest_after["speakerCleanupAcceptanceBoardMissingArtifactCount"] = report["missingArtifactCount"]
    manifest_after["speakerCleanupAcceptanceBoardMissingSnippetCount"] = report["missingSnippetCount"]
    manifest_after["speakerCleanupAcceptanceBoardFocusWindowCount"] = report["focusWindowCount"]
    manifest_after["speakerCleanupAcceptanceBoardMustListenCount"] = report["mustListenCount"]
    manifest_after["speakerCleanupAcceptanceBoardHumanListenRequired"] = True
    manifest_after["speakerCleanupAcceptanceBoardLatestGeneratedAt"] = generated_at
    manifest_after["speakerCleanupAcceptanceBoardLatestMarkdown"] = str(stable_md)
    manifest_after["speakerCleanupAcceptanceBoardApprovalStateChanged"] = False
    manifest_after["speakerCleanupAcceptanceBoardBranchStateChanged"] = False
    manifest_after["speakerCleanupAcceptanceBoardRenderAttempted"] = False
    manifest_after["speakerCleanupAcceptanceBoardOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
