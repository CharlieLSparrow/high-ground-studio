#!/usr/bin/env python3
"""Create a plain-English human listen mission board for the current audio spine.

This is the reviewer runway between machine evidence and a real approval
decision. It collects the Studio Sound Control Room, Repair Planner, Notes
Inbox, Post-Review Queue, Producer Command Center, and Human Decision Front Door
into one small surface that says what to listen to and what remains locked.

It does not approve audio, unlock branch inheritance, render edit branches,
upload, publish, or mutate original media.
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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


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


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def seconds_label(value: float) -> str:
    total = int(round(max(0.0, float(value))))
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


def local_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "`missing`"
    text = label or Path(path).name
    return f"[{text}]({Path(path).as_uri()})" if Path(path).exists() else f"`{path}`"


def html_link(path: str | None, label: str | None = None) -> str:
    if not path:
        return "<span class='missing'>missing</span>"
    text = html.escape(label or Path(path).name)
    if Path(path).exists():
        return f"<a href='{html.escape(Path(path).as_uri())}'>{text}</a>"
    return f"<code>{html.escape(path)}</code>"


def artifact(label: str, path: str | None, why: str) -> dict[str, Any]:
    exists = bool(path and Path(path).exists())
    return {
        "label": label,
        "path": path,
        "exists": exists,
        "sizeBytes": Path(path).stat().st_size if exists else None,
        "why": why,
    }


def window_summary(window: dict[str, Any]) -> dict[str, Any]:
    start = float(window.get("startSeconds") or 0.0)
    end = float(window.get("endSeconds") or start)
    metrics = window.get("metrics") or {}
    return {
        "index": window.get("index"),
        "label": window.get("label"),
        "source": window.get("source"),
        "startSeconds": round(start, 3),
        "endSeconds": round(end, 3),
        "timecode": f"{seconds_label(start)} - {seconds_label(end)}",
        "durationSeconds": round(max(0.0, end - start), 3),
        "reason": window.get("reason"),
        "riskFlags": list(metrics.get("riskFlags") or []),
        "rmsDbfs": metrics.get("rmsDbfs"),
        "peakDbfs": metrics.get("peakDbfs"),
        "quietRatio": metrics.get("quietRatio"),
        "snippetPath": window.get("snippetPath"),
        "waveformPath": window.get("waveformPath"),
        "spectrogramPath": window.get("spectrogramPath"),
    }


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    control_room, control_room_path = load_output_report(outputs, "latestAudioStudioSoundControlRoom")
    repair_planner, repair_planner_path = load_output_report(outputs, "latestAudioStudioSoundRepairPlanner")
    notes_inbox, notes_inbox_path = load_output_report(outputs, "latestAudioStudioSoundNotesInbox")
    post_review_queue, post_review_queue_path = load_output_report(outputs, "latestAudioPostReviewActionQueue")
    producer_command_center, producer_command_center_path = load_output_report(outputs, "latestAudioProducerCommandCenter")
    proof_coverage, proof_coverage_path = load_output_report(outputs, "latestAudioListenProofCoverageMap")
    decision_front_door, decision_front_door_path = load_output_report(outputs, "latestHumanListenDecisionFrontDoor")

    windows = [window_summary(row) for row in control_room.get("windows") or [] if isinstance(row, dict)]
    risk_windows = [row for row in windows if row["riskFlags"]]
    focus_windows = risk_windows + [row for row in windows if not row["riskFlags"]][: min(8, max(0, 8 - len(risk_windows)))]
    repair_actions = [row for row in repair_planner.get("actions") or [] if isinstance(row, dict)]

    listen_audio_path = control_room.get("listeningAudioPath") or output_path(outputs.get("masterWav")) or output_path(outputs.get("masterM4a"))
    notes_template_path = control_room.get("notesTemplatePath") or output_path(outputs.get("latestAudioStudioSoundNotesTemplate"))
    required_artifacts = [
        artifact("Current listenable audio spine", listen_audio_path, "The actual v006 candidate to approve, reject, or route to scoped repair."),
        artifact("Studio Sound Control Room", control_room_path, "Window-by-window proof clips, waveforms, spectrograms, and metrics."),
        artifact("Studio Sound Notes Template", notes_template_path, "Fill this or copy it before processing listen notes."),
        artifact("Studio Sound Notes Inbox", notes_inbox_path, "Safe return path for focused Studio Sound notes."),
        artifact("Studio Sound Repair Planner", repair_planner_path, "Routes machine-visible flags to likely owning stage."),
        artifact("Post-review Action Queue", post_review_queue_path, "Unified queue after exported notes are processed."),
        artifact("Human Listen Decision Front Door", decision_front_door_path, "Guarded route for pass/fail/needs-proof after real listening."),
        artifact("Producer Command Center", producer_command_center_path, "Full artifact index for deeper review."),
        artifact("Listen Proof Coverage Map", proof_coverage_path, "Maps remaining partial/locked requirements to proof paths."),
    ]
    missing_artifacts = [row for row in required_artifacts if not row["exists"]]

    mission_steps = [
        {
            "step": 1,
            "title": "Listen to the current audio spine as a whole thing, not a metric pile.",
            "action": "Open the listenable audio spine and listen for echo, chopped reactions, missing Homer, missing Charlie, fatigue, jumps, and level imbalance.",
            "artifact": listen_audio_path,
        },
        {
            "step": 2,
            "title": "Check the machine-risk window first.",
            "action": "The current risk is the opening quiet region. Decide whether it is pre-roll/intro trim work or a real audio failure.",
            "artifact": repair_planner_path,
        },
        {
            "step": 3,
            "title": "Sample the Studio Sound focus windows.",
            "action": "Use the Control Room proof clips to verify speaker preservation, reaction sound, overlap, and transition smoothness.",
            "artifact": control_room_path,
        },
        {
            "step": 4,
            "title": "Record notes in the Studio Sound template.",
            "action": "Mark pass, proof-needed, or repair-needed at the window level. Do not treat focused notes as whole-spine approval.",
            "artifact": notes_template_path,
        },
        {
            "step": 5,
            "title": "Process notes before changing audio.",
            "action": "Run the notes inbox and post-review queue so any v007 repair is stage-owned and scoped.",
            "artifact": notes_inbox_path,
        },
        {
            "step": 6,
            "title": "Only then use the guarded decision route.",
            "action": "Use the Human Listen Decision Front Door to record approve, fail, or needs-proof. Until then branch inheritance and renders stay locked.",
            "artifact": decision_front_door_path,
        },
    ]

    status = "ready-for-human-listen-mission" if not missing_artifacts else "needs-review-artifacts"
    return {
        "schema": "quipsly.audio-workbench.human-listen-mission-board.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool_value(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "listenAudioPath": listen_audio_path,
        "requiredArtifacts": required_artifacts,
        "requiredArtifactCount": len(required_artifacts),
        "missingArtifactCount": len(missing_artifacts),
        "missionSteps": mission_steps,
        "missionStepCount": len(mission_steps),
        "controlRoomStatus": control_room.get("status"),
        "controlRoomWindowCount": len(windows),
        "riskWindowCount": len(risk_windows),
        "focusWindows": focus_windows,
        "focusWindowCount": len(focus_windows),
        "repairPlannerStatus": repair_planner.get("status"),
        "repairActionCount": len(repair_actions),
        "repairActions": repair_actions,
        "notesInboxStatus": notes_inbox.get("status"),
        "notesInboxDecision": notes_inbox.get("studioSoundDecision"),
        "notesCandidateCount": int_value(notes_inbox.get("matchingCandidateCount")),
        "postReviewActionCount": int_value(post_review_queue.get("sourceWithNotesCandidateCount")) or int_value(post_review_queue.get("repairActionCount")) + int_value(post_review_queue.get("focusedProofActionCount")) + int_value(post_review_queue.get("passContextCount")),
        "producerCommandCenterStatus": producer_command_center.get("status"),
        "listenProofCoverageStatus": proof_coverage.get("status"),
        "decisionFrontDoorStatus": decision_front_door.get("status"),
        "nextSafeAction": "Human listen and notes are next. Do not unlock branch inheritance, render branches, upload, or publish until the guarded decision route records a real human result.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Human Listen Mission Board",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the short, calm path from machine evidence to a real human listen decision. It does not approve audio, unlock branch inheritance, render, upload, publish, or mutate original media.",
        "",
        "## Current lock state",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Required artifacts missing: `{report['missingArtifactCount']}` / `{report['requiredArtifactCount']}`",
        "",
        "## Mission",
        "",
    ]
    for step in report["missionSteps"]:
        lines.extend(
            [
                f"### {step['step']}. {step['title']}",
                "",
                step["action"],
                "",
                f"Artifact: {local_link(step.get('artifact'))}",
                "",
            ]
        )

    lines.extend(["## First focus windows", ""])
    if not report["focusWindows"]:
        lines.append("No Studio Sound focus windows were available. Regenerate the Control Room before approval.")
    for window in report["focusWindows"]:
        flags = ", ".join(window["riskFlags"]) if window["riskFlags"] else "none"
        lines.extend(
            [
                f"### Window {window['index']}: {window['label']}",
                "",
                f"- Time: `{window['timecode']}`",
                f"- Reason: {window.get('reason') or 'review'}",
                f"- Risk flags: `{flags}`",
                f"- Snippet: {local_link(window.get('snippetPath'))}",
                f"- Spectrogram: {local_link(window.get('spectrogramPath'))}",
                "",
            ]
        )

    lines.extend(["## Repair planner summary", ""])
    if not report["repairActions"]:
        lines.append("No scoped machine repair actions are currently planned. Human listen is still required.")
    for action in report["repairActions"]:
        lines.extend(
            [
                f"### {action.get('actionType')}",
                "",
                f"- Time: `{action.get('timecode')}`",
                f"- Owner: `{action.get('humanOwner')}`",
                f"- First move: {action.get('firstMove')}",
                "",
            ]
        )

    lines.extend(
        [
            "## Required artifacts",
            "",
            "| Artifact | Exists | Why | Path |",
            "|---|---:|---|---|",
        ]
    )
    for item in report["requiredArtifacts"]:
        lines.append(
            f"| {item['label']} | `{str(item['exists']).lower()}` | {item['why']} | {local_link(item.get('path'))} |"
        )

    lines.extend(
        [
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines) + "\n"


def render_html(report: dict[str, Any]) -> str:
    step_cards = []
    for step in report["missionSteps"]:
        step_cards.append(
            f"<section class='card'><p class='eyebrow'>Step {step['step']}</p><h2>{html.escape(step['title'])}</h2><p>{html.escape(step['action'])}</p><p>{html_link(step.get('artifact'), 'Open artifact')}</p></section>"
        )
    window_rows = []
    for window in report["focusWindows"]:
        flags = ", ".join(window["riskFlags"]) if window["riskFlags"] else "none"
        cls = "risk" if window["riskFlags"] else "ok"
        window_rows.append(
            f"<tr class='{cls}'><td>{html.escape(str(window['index']))}</td><td>{html.escape(str(window['label']))}</td><td><code>{html.escape(str(window['timecode']))}</code></td><td>{html.escape(flags)}</td><td>{html_link(window.get('snippetPath'), 'snippet')}</td><td>{html_link(window.get('spectrogramPath'), 'spectrogram')}</td></tr>"
        )
    artifact_rows = []
    for item in report["requiredArtifacts"]:
        cls = "ok" if item["exists"] else "bad"
        artifact_rows.append(
            f"<tr class='{cls}'><td>{html.escape(item['label'])}</td><td>{str(item['exists']).lower()}</td><td>{html.escape(item['why'])}</td><td>{html_link(item.get('path'))}</td></tr>"
        )
    repair_rows = []
    for action in report["repairActions"]:
        repair_rows.append(
            f"<tr><td>{html.escape(str(action.get('actionType')))}</td><td><code>{html.escape(str(action.get('timecode')))}</code></td><td>{html.escape(str(action.get('humanOwner')))}</td><td>{html.escape(str(action.get('firstMove')))}</td></tr>"
        )
    if not repair_rows:
        repair_rows.append("<tr><td colspan='4'>No scoped repair actions yet. Human listen is still required.</td></tr>")

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Human Listen Mission Board</title>
<style>
body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #121812; color: #f5eddc; }}
main {{ max-width: 1180px; margin: 0 auto; padding: 34px; }}
.hero, .card {{ border: 1px solid rgba(245, 237, 220, .16); border-radius: 22px; background: linear-gradient(135deg, rgba(255,255,255,.07), rgba(255,255,255,.025)); box-shadow: 0 18px 60px rgba(0,0,0,.28); }}
.hero {{ padding: 28px; margin-bottom: 22px; }}
.grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }}
.card {{ padding: 18px; }}
.eyebrow {{ color: #ffd86b; text-transform: uppercase; letter-spacing: .16em; font-size: 11px; font-weight: 800; }}
h1 {{ font-size: 42px; margin: 0 0 8px; }}
h2 {{ margin: 0 0 10px; }}
.metric {{ display: inline-block; padding: 8px 11px; border-radius: 999px; background: rgba(255,255,255,.08); margin: 4px 6px 4px 0; font-weight: 700; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }}
th, td {{ text-align: left; vertical-align: top; padding: 10px; border-bottom: 1px solid rgba(255,255,255,.11); }}
a {{ color: #8ee7ff; font-weight: 700; text-decoration: none; }}
code {{ color: #ffe08a; }}
.ok td:nth-child(2) {{ color: #8ee59a; font-weight: 800; }}
.bad td:nth-child(2), .missing {{ color: #ff8b8b; font-weight: 800; }}
.risk td:first-child {{ color: #ff8b8b; font-weight: 900; }}
.next {{ border-color: rgba(255,216,107,.35); background: rgba(255,216,107,.08); }}
</style>
</head>
<body>
<main>
<section class="hero">
<p class="eyebrow">Quipsly Studio Sound</p>
<h1>Human Listen Mission Board</h1>
<p>This is the shortest honest route from v006 machine evidence to a real human decision.</p>
<p>
<span class="metric">status: {html.escape(str(report['status']))}</span>
<span class="metric">approval: {html.escape(str(report['approvalStatus']))}</span>
<span class="metric">missing artifacts: {report['missingArtifactCount']} / {report['requiredArtifactCount']}</span>
<span class="metric">branch inheritance: {str(report['branchInheritanceReady']).lower()}</span>
<span class="metric">render ready: {str(report['branchRenderReady']).lower()}</span>
</p>
</section>
<section class="grid">{''.join(step_cards)}</section>
<section class="card next"><h2>Next safe action</h2><p>{html.escape(report['nextSafeAction'])}</p></section>
<section class="card"><h2>First focus windows</h2><table><thead><tr><th>#</th><th>Window</th><th>Time</th><th>Flags</th><th>Snippet</th><th>Spectrogram</th></tr></thead><tbody>{''.join(window_rows)}</tbody></table></section>
<section class="card"><h2>Repair planner</h2><table><thead><tr><th>Action</th><th>Time</th><th>Owner</th><th>First move</th></tr></thead><tbody>{''.join(repair_rows)}</tbody></table></section>
<section class="card"><h2>Required artifacts</h2><table><thead><tr><th>Artifact</th><th>Exists</th><th>Why</th><th>Path</th></tr></thead><tbody>{''.join(artifact_rows)}</tbody></table></section>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


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

    report = build_report(manifest_before, baseline_dir, generated_at)
    output_dir = baseline_dir / f"audio-human-listen-mission-board-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)
    versioned_json = output_dir / "human-listen-mission-board.json"
    versioned_md = output_dir / "human-listen-mission-board.md"
    versioned_html = output_dir / "human-listen-mission-board.html"
    versioned_open = output_dir / "open-human-listen-mission-board.command"
    stable_json = baseline_dir / "HUMAN_LISTEN_MISSION_BOARD.json"
    stable_md = baseline_dir / "HUMAN_LISTEN_MISSION_BOARD.md"
    stable_html = baseline_dir / "HUMAN_LISTEN_MISSION_BOARD.html"
    stable_open = baseline_dir / "OPEN_HUMAN_LISTEN_MISSION_BOARD.command"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(versioned_json, report)
    versioned_md.write_text(markdown, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(versioned_open, versioned_html, versioned_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "missionStepCount": report["missionStepCount"],
        "requiredArtifactCount": report["requiredArtifactCount"],
        "missingArtifactCount": report["missingArtifactCount"],
        "focusWindowCount": report["focusWindowCount"],
        "repairActionCount": report["repairActionCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioHumanListenMissionBoards", [])
    history.append(entry)
    outputs["latestAudioHumanListenMissionBoard"] = entry
    outputs["latestAudioHumanListenMissionBoardMarkdown"] = str(stable_md)
    outputs["latestAudioHumanListenMissionBoardHtml"] = str(stable_html)
    outputs["latestAudioHumanListenMissionBoardOpenCommand"] = str(stable_open)
    manifest_after["audioHumanListenMissionBoardCount"] = len(history)
    manifest_after["audioHumanListenMissionBoardLatestStatus"] = report["status"]
    manifest_after["audioHumanListenMissionBoardMissionStepCount"] = report["missionStepCount"]
    manifest_after["audioHumanListenMissionBoardRequiredArtifactCount"] = report["requiredArtifactCount"]
    manifest_after["audioHumanListenMissionBoardMissingArtifactCount"] = report["missingArtifactCount"]
    manifest_after["audioHumanListenMissionBoardFocusWindowCount"] = report["focusWindowCount"]
    manifest_after["audioHumanListenMissionBoardRepairActionCount"] = report["repairActionCount"]
    manifest_after["audioHumanListenMissionBoardLatestGeneratedAt"] = generated_at
    manifest_after["audioHumanListenMissionBoardLatestMarkdown"] = str(stable_md)
    manifest_after["audioHumanListenMissionBoardApprovalStateChanged"] = False
    manifest_after["audioHumanListenMissionBoardBranchStateChanged"] = False
    manifest_after["audioHumanListenMissionBoardRenderAttempted"] = False
    manifest_after["audioHumanListenMissionBoardUploadAttempted"] = False
    manifest_after["audioHumanListenMissionBoardPublicationAttempted"] = False
    manifest_after["audioHumanListenMissionBoardOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
