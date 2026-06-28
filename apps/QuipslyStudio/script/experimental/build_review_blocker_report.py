#!/usr/bin/env python3
"""Build a read-only review blocker/warning report for release packages.

The report is derived from local review-board artifacts. It does not approve,
publish, upload, delete, overwrite, or mutate source media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DIAGNOSTIC_HOLD_MARKERS = ("smoke", "diagnostic", "test hold", "command smoke")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-review-blockers")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def index_by_episode(payload: dict[str, Any]) -> dict[int, dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}
    episodes = payload.get("episodes") if isinstance(payload.get("episodes"), list) else []
    for item in episodes:
        if not isinstance(item, dict):
            continue
        try:
            episode = int(item.get("episode") or 0)
        except (TypeError, ValueError):
            continue
        if episode:
            indexed[episode] = item
    return indexed


def collect_unique_lists(key: str, *items: dict[str, Any]) -> list[Any]:
    values: list[Any] = []
    for item in items:
        raw = item.get(key)
        if not isinstance(raw, list):
            continue
        for value in raw:
            if value not in values:
                values.append(value)
    return values


def duration_label(seconds: Any) -> str:
    try:
        total = int(round(float(seconds or 0)))
    except (TypeError, ValueError):
        total = 0
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def build_warning_evidence(episode: int, board_episode: dict[str, Any], warnings: list[Any]) -> list[dict[str, Any]]:
    artifacts = board_episode.get("artifacts") if isinstance(board_episode.get("artifacts"), dict) else {}
    evidence: list[dict[str, Any]] = []
    duration_warnings = [str(warning) for warning in warnings if "duration" in str(warning).lower()]
    if not duration_warnings:
        return evidence

    comparison = []
    durations: list[float] = []
    for artifact_id in ("longForm16x9", "longForm9x16", "podcastAudio"):
        artifact = artifacts.get(artifact_id) if isinstance(artifacts.get(artifact_id), dict) else {}
        try:
            duration = float(artifact.get("durationSeconds") or 0)
        except (TypeError, ValueError):
            duration = 0
        if duration > 0:
            durations.append(duration)
        comparison.append({
            "artifactId": artifact_id,
            "label": artifact.get("label") or artifact_id,
            "durationSeconds": round(duration, 3),
            "durationLabel": artifact.get("durationLabel") or duration_label(duration),
            "path": artifact.get("path") or "",
            "status": artifact.get("status") or "",
            "hasAudio": bool(artifact.get("hasAudio")),
            "hasVideo": bool(artifact.get("hasVideo")),
        })
    spread = round(max(durations) - min(durations), 3) if len(durations) >= 2 else 0
    if spread >= 600:
        urgency = "major-duration-review"
        plain = "The audio-only file is far out of alignment with the long-form videos. Treat podcast/RSS audio as not publication-ready until reviewed or regenerated."
    elif spread >= 30:
        urgency = "duration-review"
        plain = "The audio-only file differs from the long-form videos. This may be intentional, but it needs a watch/listen decision before publishing."
    else:
        urgency = "minor-duration-note"
        plain = "Durations differ slightly. Confirm the difference is intentional before publishing."
    evidence.append({
        "kind": "long-form-duration-spread",
        "urgency": urgency,
        "spreadSeconds": spread,
        "spreadLabel": duration_label(spread),
        "plainEnglish": plain,
        "warnings": duration_warnings,
        "artifactComparison": comparison,
        "safeReviewCommands": [
            f"./script/agentctl.sh tower-review-decision {episode} longForm16x9 approve '<reviewer>' '<video reviewed; duration warning accepted or understood>'",
            f"./script/agentctl.sh tower-review-decision {episode} podcastAudio refine '<reviewer>' '<podcast audio duration mismatch needs repair/regeneration>'",
            f"./script/agentctl.sh tower-review-decision {episode} podcastAudio hold '<reviewer>' '<do not publish audio-only file until duration mismatch is resolved>'",
        ],
        "nonDestructiveRepairOptions": [
            "Watch/listen at the tail of each artifact and decide whether the video or audio is the intended episode boundary.",
            "If the long-form video is correct, create a new version with podcast audio regenerated or trimmed from the reviewed video/audio spine; never overwrite the current audio file.",
            "If the podcast audio is correct, create a new video version that includes the missing tail or documents why the video intentionally ends earlier.",
            "If the mismatch is intentional for a platform-specific reason, record an explicit local review decision and keep receipt truth separate.",
        ],
        "truth": "Warning evidence only. These commands record local review metadata and do not publish, upload, overwrite, or mutate media.",
    })
    return evidence


def is_diagnostic_review_hold(artifact: dict[str, Any]) -> bool:
    decision = str(artifact.get("decision") or "pending").lower()
    if decision not in {"hold", "refine", "reject"}:
        return False
    reviewer = str(artifact.get("reviewer") or "").lower()
    notes = str(artifact.get("notes") or "").lower()
    if reviewer not in {"codex", "agent", "automation", "quipsly"}:
        return False
    return any(marker in notes for marker in DIAGNOSTIC_HOLD_MARKERS)


def artifact_action(episode: int, artifact: dict[str, Any]) -> dict[str, Any]:
    artifact_id = str(artifact.get("id") or "")
    decision = str(artifact.get("decision") or "pending").lower()
    label = str(artifact.get("label") or artifact_id or "Artifact")
    if is_diagnostic_review_hold(artifact):
        return {
            "status": "diagnostic-review-hold",
            "action": f"Clear or confirm diagnostic hold for {label}",
            "why": str(artifact.get("notes") or "This looks like an agent/test hold, not a confirmed creative defect."),
            "safeOptions": [
                "Keep the diagnostic hold visible until a human or agent confirms it.",
                "If this was only a smoke-test flag, reset it to pending with an explanatory note.",
                "If review finds a real issue, replace it with a normal refine/hold decision.",
            ],
            "commandTemplates": [
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} pending '<reviewer>' '<diagnostic hold cleared; needs normal review>'",
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} refine '<reviewer>' '<confirmed repair needed>'",
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} hold '<reviewer>' '<confirmed hold reason>'",
            ],
        }
    if decision in {"hold", "refine", "reject"}:
        return {
            "status": "needs-work",
            "action": f"Resolve {label}",
            "why": str(artifact.get("notes") or "A blocking review decision is recorded for this artifact."),
            "safeOptions": [
                "Open the artifact paths and inspect the issue.",
                "If the issue is real, create a new version rather than overwriting this one.",
                "If this was only a smoke-test hold, a human can reset it to pending or approve with an explanatory note.",
            ],
            "commandTemplates": [
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} pending '<reviewer>' '<why reset to pending>'",
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} approve '<reviewer>' '<why approved>'",
                f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} refine '<reviewer>' '<what to repair>'",
            ],
        }
    if decision == "approve":
        return {
            "status": "approved-local-review",
            "action": f"Keep {label} review approval visible",
            "why": "This artifact has a local approval decision. It still is not externally published without receipt truth.",
            "safeOptions": ["Capture real platform receipts only after explicit publishing approval."],
            "commandTemplates": [],
        }
    return {
        "status": "pending-human-review",
        "action": f"Review {label}",
        "why": "No review decision is recorded yet.",
        "safeOptions": [
            "Watch/listen/open the artifact paths.",
            "Record approve/refine/reject/hold after review.",
            "Do not mark published without a real external receipt.",
        ],
        "commandTemplates": [
            f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} approve '<reviewer>' '<review notes>'",
            f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} refine '<reviewer>' '<what to improve>'",
            f"./script/agentctl.sh tower-review-decision {episode} {artifact_id} hold '<reviewer>' '<why held>'",
        ],
    }


def build_report(release_root: Path, only_episode: int | None = None) -> dict[str, Any]:
    review_root = release_root / "review-board"
    ledger = load_json(review_root / "human-review-ledger.json")
    board = load_json(review_root / "review-board.json")
    validation = load_json(review_root / "release-validation.json")
    release_status = load_json(release_root / "release-status.json")
    ledger_by_episode = index_by_episode(ledger)
    board_by_episode = index_by_episode(board)
    validation_by_episode = index_by_episode(validation)
    release_by_episode = index_by_episode(release_status)
    episode_numbers = sorted(set(ledger_by_episode) | set(board_by_episode) | set(validation_by_episode) | set(release_by_episode))
    if only_episode:
        episode_numbers = [episode for episode in episode_numbers if episode == only_episode]

    episodes: list[dict[str, Any]] = []
    totals = {
        "episodes": 0,
        "blockingReviewArtifacts": 0,
        "pendingReviewArtifacts": 0,
        "warningEpisodes": 0,
        "blockedEpisodes": 0,
        "approvedArtifacts": 0,
        "diagnosticReviewArtifacts": 0,
    }

    for episode in episode_numbers:
        ledger_episode = ledger_by_episode.get(episode, {})
        board_episode = board_by_episode.get(episode, {})
        validation_episode = validation_by_episode.get(episode, {})
        release_episode = release_by_episode.get(episode, {})
        warnings = collect_unique_lists("warnings", ledger_episode, board_episode, validation_episode, release_episode)
        warning_evidence = build_warning_evidence(episode, board_episode, warnings)
        blockers = [item for item in collect_unique_lists("blockers", validation_episode, release_episode, board_episode, ledger_episode) if item]
        review_artifacts = ledger_episode.get("reviewArtifacts") if isinstance(ledger_episode.get("reviewArtifacts"), list) else []
        artifact_reports: list[dict[str, Any]] = []
        blocking_count = 0
        diagnostic_count = 0
        pending_count = 0
        approved_count = 0
        for artifact in review_artifacts:
            if not isinstance(artifact, dict):
                continue
            decision = str(artifact.get("decision") or "pending").lower()
            diagnostic_hold = is_diagnostic_review_hold(artifact)
            if decision in {"hold", "refine", "reject"}:
                if diagnostic_hold:
                    diagnostic_count += 1
                else:
                    blocking_count += 1
            elif decision == "approve":
                approved_count += 1
            else:
                pending_count += 1
            action = artifact_action(episode, artifact)
            artifact_reports.append({
                "id": artifact.get("id") or "",
                "label": artifact.get("label") or artifact.get("id") or "",
                "decision": decision,
                "status": artifact.get("status") or "",
                "reviewer": artifact.get("reviewer") or "",
                "reviewedAt": artifact.get("reviewedAt") or "",
                "notes": artifact.get("notes") or "",
                "paths": artifact.get("paths") if isinstance(artifact.get("paths"), list) else [],
                "action": action,
                "diagnosticReviewHold": diagnostic_hold,
            })

        version = (
            board_episode.get("version")
            or release_episode.get("version")
            or validation_episode.get("version")
            or ledger_episode.get("version")
            or ""
        )
        version_dir = (
            board_episode.get("versionDir")
            or release_episode.get("versionDir")
            or validation_episode.get("versionDir")
            or ledger_episode.get("versionDir")
            or ""
        )
        if blockers or blocking_count:
            status = "needs-work"
            next_action = "Resolve blocking review decision or package blocker before Tower treats this as approval-ready."
        elif diagnostic_count:
            status = "diagnostic-review-hold"
            next_action = "A diagnostic/test hold is visible. Clear it to pending or confirm it as a real issue after review."
        elif warnings:
            status = "review-warning"
            next_action = "Human review must accept or repair warning before publication prep is trusted."
        elif pending_count:
            status = "pending-human-review"
            next_action = "Watch/listen/open pending artifacts and record decisions."
        else:
            status = "local-review-clear"
            next_action = "Keep receipt truth separate; prepare Tower packet only after explicit approval."

        episodes.append({
            "episode": episode,
            "version": version,
            "status": status,
            "versionDir": version_dir,
            "warnings": warnings,
            "warningEvidence": warning_evidence,
            "blockers": blockers,
            "nextAction": next_action,
            "readyShortCount": board_episode.get("readyShortCount") or release_episode.get("readyShortCount") or 0,
            "shortCount": len(board_episode.get("shorts") if isinstance(board_episode.get("shorts"), list) else []),
            "reviewCounts": {
                "blocking": blocking_count,
                "diagnostic": diagnostic_count,
                "pending": pending_count,
                "approved": approved_count,
            },
            "artifacts": artifact_reports,
        })
        totals["episodes"] += 1
        totals["blockingReviewArtifacts"] += blocking_count
        totals["diagnosticReviewArtifacts"] += diagnostic_count
        totals["pendingReviewArtifacts"] += pending_count
        totals["approvedArtifacts"] += approved_count
        if warnings:
            totals["warningEpisodes"] += 1
        if blockers:
            totals["blockedEpisodes"] += 1

    status = report_status(totals)
    next_action = report_next_action(totals)
    return {
        "schema": "quipsly.review-blocker-report.v1",
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "reviewBoardRoot": str(review_root),
        "status": status,
        "counts": totals,
        "nextSafestAction": next_action,
        "truth": "Read-only review report. No publish, upload, approval, delete, overwrite, source mutation, or account mutation performed.",
        "totals": totals,
        "episodes": episodes,
    }


def report_status(totals: dict[str, Any]) -> str:
    if int(totals.get("blockingReviewArtifacts") or 0) > 0 or int(totals.get("blockedEpisodes") or 0) > 0:
        return "review-blockers-need-work"
    if int(totals.get("diagnosticReviewArtifacts") or 0) > 0:
        return "diagnostic-review-hold"
    if int(totals.get("warningEpisodes") or 0) > 0:
        return "review-warning"
    if int(totals.get("pendingReviewArtifacts") or 0) > 0:
        return "pending-human-review"
    return "local-review-clear"


def report_next_action(totals: dict[str, Any]) -> str:
    if int(totals.get("blockingReviewArtifacts") or 0) > 0 or int(totals.get("blockedEpisodes") or 0) > 0:
        return "Open blocking review artifacts first, then record a local approve/refine/hold/pending decision without publishing."
    if int(totals.get("diagnosticReviewArtifacts") or 0) > 0:
        return "Clear diagnostic/test holds to pending or confirm them as real issues after watch/listen review."
    if int(totals.get("warningEpisodes") or 0) > 0:
        return "Inspect warning evidence and decide whether each warning is accepted, repaired, or held before Tower approval."
    if int(totals.get("pendingReviewArtifacts") or 0) > 0:
        return "Watch/listen/open pending artifacts and record local review decisions before any publishing packet becomes approval-ready."
    return "Keep local review clear, then continue Tower packet prep while receipt truth remains separate."


def prepare_output_dir(release_root: Path) -> Path:
    root = release_root / "review-board" / "blocker-reports"
    root.mkdir(parents=True, exist_ok=True)
    path = root / stamp_now()
    counter = 2
    base = path
    while path.exists():
        path = Path(f"{base}-{counter}")
        counter += 1
    path.mkdir(parents=True, exist_ok=False)
    return path


def write_markdown(output_dir: Path, report: dict[str, Any]) -> None:
    lines = [
        "# Quipsly review blocker report",
        "",
        f"Generated: {report['generatedAt']}",
        "",
        report["truth"],
        "",
        f"Status: `{report.get('status')}`",
        f"Next safest action: {report.get('nextSafestAction')}",
        "",
        "## Totals",
        "",
    ]
    for key, value in (report.get("totals") or {}).items():
        lines.append(f"- {key}: `{value}`")
    for episode in report.get("episodes") or []:
        lines.extend([
            "",
            f"## Episode {episode.get('episode')} {episode.get('version') or ''}",
            "",
            f"- Status: `{episode.get('status')}`",
            f"- Version dir: `{episode.get('versionDir')}`",
            f"- Next action: {episode.get('nextAction')}",
            f"- Ready shorts: `{episode.get('readyShortCount')}`",
            f"- Warnings: `{len(episode.get('warnings') or [])}`",
            f"- Blockers: `{len(episode.get('blockers') or [])}`",
        ])
        for warning in episode.get("warnings") or []:
            lines.append(f"  - Warning: {warning}")
        for evidence in episode.get("warningEvidence") or []:
            lines.extend([
                "",
                f"### Warning evidence: {evidence.get('kind')}",
                "",
                f"- Urgency: `{evidence.get('urgency')}`",
                f"- Spread: `{evidence.get('spreadLabel')}` (`{evidence.get('spreadSeconds')}` seconds)",
                f"- Plain English: {evidence.get('plainEnglish')}",
                "",
                "| Artifact | Duration | Status | Audio | Video | File |",
                "| --- | ---: | --- | --- | --- | --- |",
            ])
            for item in evidence.get("artifactComparison") or []:
                lines.append(
                    f"| {item.get('label')} | `{item.get('durationLabel')}` | `{item.get('status')}` | `{item.get('hasAudio')}` | `{item.get('hasVideo')}` | `{item.get('path')}` |"
                )
            commands = evidence.get("safeReviewCommands") if isinstance(evidence.get("safeReviewCommands"), list) else []
            if commands:
                lines.extend(["", "Safe warning review commands:"])
                for command in commands:
                    lines.append(f"- `{command}`")
            repair_options = evidence.get("nonDestructiveRepairOptions") if isinstance(evidence.get("nonDestructiveRepairOptions"), list) else []
            if repair_options:
                lines.extend(["", "Non-destructive repair options:"])
                for option in repair_options:
                    lines.append(f"- {option}")
        for blocker in episode.get("blockers") or []:
            lines.append(f"  - Blocker: {blocker}")
        for artifact in episode.get("artifacts") or []:
            action = artifact.get("action") if isinstance(artifact.get("action"), dict) else {}
            lines.extend([
                "",
                f"### {artifact.get('label') or artifact.get('id')}",
                "",
                f"- Decision: `{artifact.get('decision')}`",
                f"- Status: `{artifact.get('status')}`",
                f"- Reviewer: `{artifact.get('reviewer')}`",
                f"- Reviewed at: `{artifact.get('reviewedAt')}`",
                f"- Notes: {artifact.get('notes') or ''}",
                f"- Action: {action.get('action') or ''}",
                f"- Why: {action.get('why') or ''}",
            ])
            for path in artifact.get("paths") or []:
                lines.append(f"- File: `{path}`")
            commands = action.get("commandTemplates") if isinstance(action.get("commandTemplates"), list) else []
            if commands:
                lines.extend(["", "Safe command templates:"])
                for command in commands:
                    lines.append(f"- `{command}`")
    (output_dir / "review-blockers.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(output_dir: Path, report: dict[str, Any]) -> None:
    cards = []

    def file_uri(path_value: str) -> str:
        path = Path(path_value)
        try:
            return path.as_uri()
        except ValueError:
            return "file://" + quote(path_value)

    def render_media_previews(paths: list[Any]) -> str:
        previews: list[str] = []
        for raw_path in paths[:8]:
            path_text = str(raw_path)
            suffix = Path(path_text).suffix.lower()
            uri = file_uri(path_text)
            label = html.escape(Path(path_text).name or path_text)
            escaped_uri = html.escape(uri, quote=True)
            if suffix in {".mp4", ".mov", ".m4v", ".webm"}:
                previews.append(f"""
                <figure class="media-preview">
                  <figcaption>{label}</figcaption>
                  <video controls preload="metadata" src="{escaped_uri}"></video>
                  <a href="{escaped_uri}">Open video file</a>
                </figure>
                """)
            elif suffix in {".m4a", ".mp3", ".wav", ".aac", ".aiff", ".flac"}:
                previews.append(f"""
                <figure class="media-preview audio">
                  <figcaption>{label}</figcaption>
                  <audio controls preload="metadata" src="{escaped_uri}"></audio>
                  <a href="{escaped_uri}">Open audio file</a>
                </figure>
                """)
        if not previews:
            return ""
        return f"<div class=\"media-previews\">{''.join(previews)}</div>"

    for episode in report.get("episodes") or []:
        artifact_html = []
        for artifact in episode.get("artifacts") or []:
            action = artifact.get("action") if isinstance(artifact.get("action"), dict) else {}
            artifact_paths = artifact.get("paths") if isinstance(artifact.get("paths"), list) else []
            paths = "\n".join(str(path) for path in artifact_paths)
            commands = "\n".join(str(command) for command in action.get("commandTemplates") or [])
            previews = render_media_previews(artifact_paths)
            artifact_html.append(f"""
            <article class="artifact {html.escape(str(artifact.get('decision') or 'pending'))}">
              <div class="decision">{html.escape(str(artifact.get('decision') or 'pending'))}</div>
              <h3>{html.escape(str(artifact.get('label') or artifact.get('id') or 'Artifact'))}</h3>
              <p>{html.escape(str(action.get('why') or artifact.get('notes') or ''))}</p>
              <p><b>Next:</b> {html.escape(str(action.get('action') or 'Review artifact'))}</p>
              {previews}
              <details><summary>Files</summary><pre>{html.escape(paths)}</pre></details>
              <details><summary>Safe command templates</summary><pre>{html.escape(commands)}</pre></details>
            </article>
            """)
        warning_html = "".join(f"<li>{html.escape(str(warning))}</li>" for warning in episode.get("warnings") or [])
        warning_evidence_html = []
        for evidence in episode.get("warningEvidence") or []:
            rows = []
            for item in evidence.get("artifactComparison") or []:
                rows.append(f"""
                <tr>
                  <td>{html.escape(str(item.get('label') or item.get('artifactId') or 'artifact'))}</td>
                  <td><code>{html.escape(str(item.get('durationLabel') or ''))}</code></td>
                  <td>{html.escape(str(item.get('status') or ''))}</td>
                  <td>{'yes' if item.get('hasAudio') else 'no'}</td>
                  <td>{'yes' if item.get('hasVideo') else 'no'}</td>
                  <td><code>{html.escape(str(item.get('path') or ''))}</code></td>
                </tr>
                """)
            commands = "\n".join(str(command) for command in evidence.get("safeReviewCommands") or [])
            repair_options = "\n".join(str(option) for option in evidence.get("nonDestructiveRepairOptions") or [])
            warning_evidence_html.append(f"""
            <article class="warning-evidence {html.escape(str(evidence.get('urgency') or 'warning'))}">
              <div class="decision">{html.escape(str(evidence.get('urgency') or 'warning'))}</div>
              <h3>{html.escape(str(evidence.get('kind') or 'Warning evidence'))}</h3>
              <p><b>Spread:</b> {html.escape(str(evidence.get('spreadLabel') or ''))} ({html.escape(str(evidence.get('spreadSeconds') or 0))} seconds)</p>
              <p>{html.escape(str(evidence.get('plainEnglish') or ''))}</p>
              <table>
                <thead><tr><th>Artifact</th><th>Duration</th><th>Status</th><th>Audio</th><th>Video</th><th>File</th></tr></thead>
                <tbody>{''.join(rows)}</tbody>
              </table>
              <details><summary>Non-destructive repair options</summary><pre>{html.escape(repair_options)}</pre></details>
              <details><summary>Safe warning review commands</summary><pre>{html.escape(commands)}</pre></details>
            </article>
            """)
        blocker_html = "".join(f"<li>{html.escape(str(blocker))}</li>" for blocker in episode.get("blockers") or [])
        cards.append(f"""
        <section class="episode {html.escape(str(episode.get('status') or ''))}">
          <div class="status">{html.escape(str(episode.get('status') or ''))}</div>
          <h2>Episode {html.escape(str(episode.get('episode')))} {html.escape(str(episode.get('version') or ''))}</h2>
          <p class="next">{html.escape(str(episode.get('nextAction') or ''))}</p>
          <p><b>Version:</b> {html.escape(str(episode.get('versionDir') or ''))}</p>
          <div class="lists"><div><h3>Warnings</h3><ul>{warning_html or '<li>None</li>'}</ul></div><div><h3>Blockers</h3><ul>{blocker_html or '<li>None</li>'}</ul></div></div>
          {''.join(warning_evidence_html)}
          <div class="artifacts">{''.join(artifact_html)}</div>
        </section>
        """)
    totals = report.get("totals") if isinstance(report.get("totals"), dict) else {}
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Review Blockers</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111712; --panel:#19241d; --ink:#f8f1dc; --muted:#c9bfa1; --gold:#eccb5d; --clay:#c4795a; --moss:#88b66c; --water:#64bed4; --line:rgba(248,241,220,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:radial-gradient(circle at top right, rgba(100,190,212,.16), transparent 36%), var(--bg); color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(36px,7vw,76px); line-height:.92; max-width:960px; }}
    header p {{ max-width:880px; color:var(--muted); line-height:1.5; font-size:18px; }}
    .totals {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; color:var(--gold); background:rgba(248,241,220,.07); font-weight:800; }}
    main {{ padding:26px clamp(16px,4vw,56px) 70px; display:grid; gap:18px; }}
    .episode {{ border:1px solid var(--line); border-radius:24px; background:rgba(25,36,29,.92); padding:20px; box-shadow:0 18px 46px rgba(0,0,0,.25); }}
    .episode.needs-work {{ border-color:rgba(196,121,90,.55); }}
    .episode.review-warning {{ border-color:rgba(236,203,93,.55); }}
    .episode.pending-human-review {{ border-color:rgba(100,190,212,.42); }}
    .status,.decision {{ display:inline-flex; border-radius:999px; padding:6px 10px; background:rgba(0,0,0,.28); color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    h2 {{ margin:14px 0 8px; font-size:30px; }}
    .next {{ color:var(--ink); font-weight:800; }}
    .lists {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; color:var(--muted); }}
    .artifacts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:12px; margin-top:16px; }}
    .warning-evidence {{ border:1px solid rgba(236,203,93,.45); border-radius:18px; padding:14px; margin-top:14px; background:rgba(236,203,93,.08); }}
    .warning-evidence.major-duration-review {{ border-color:rgba(196,121,90,.65); background:rgba(196,121,90,.1); }}
    .artifact {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.17); }}
    .artifact.hold,.artifact.refine,.artifact.reject {{ border-color:rgba(196,121,90,.55); }}
    .artifact.approve {{ border-color:rgba(136,182,108,.5); }}
    .artifact.pending {{ border-color:rgba(100,190,212,.35); }}
    h3 {{ margin:10px 0 6px; }}
    p, li {{ color:var(--muted); }}
    table {{ width:100%; border-collapse:collapse; margin:10px 0; }}
    th, td {{ border-bottom:1px solid var(--line); padding:8px; text-align:left; vertical-align:top; }}
    th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.1em; font-size:10px; }}
    .media-previews {{ display:grid; gap:10px; margin:12px 0; }}
    .media-preview {{ margin:0; border:1px solid var(--line); border-radius:14px; padding:10px; background:rgba(248,241,220,.05); }}
    .media-preview figcaption {{ color:var(--gold); font-weight:800; margin-bottom:8px; overflow-wrap:anywhere; }}
    .media-preview video {{ width:100%; max-height:320px; border-radius:10px; background:#050805; }}
    .media-preview audio {{ width:100%; }}
    .media-preview a {{ display:inline-block; margin-top:8px; color:var(--water); font-weight:800; overflow-wrap:anywhere; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:800; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio</div>
    <h1>Review blockers without the dread fog.</h1>
    <p>{html.escape(str(report.get('truth') or ''))}</p>
    <p><b>Status:</b> {html.escape(str(report.get('status') or ''))}</p>
    <p><b>Next safest action:</b> {html.escape(str(report.get('nextSafestAction') or ''))}</p>
    <div class="totals">
      {''.join(f'<span class="pill">{html.escape(str(key))}: {html.escape(str(value))}</span>' for key, value in totals.items())}
    </div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    (output_dir / "index.html").write_text(html_text, encoding="utf-8")


def update_pointer(release_root: Path, output_dir: Path, report: dict[str, Any]) -> None:
    totals = report.get("totals") or {}
    pointer = {
        "schema": "quipsly.review-blocker-report.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": report.get("status") or report_status(totals),
        "humanAsk": "Open the blocker report and classify each pending or held artifact as approve, refine, hold, or reject before publication work.",
        "agentSafeParallelWork": "Codex may summarize blockers, surface diagnostic holds, prepare local review commands, and improve evidence packets. Do not approve on a human's behalf, publish, upload, schedule, overwrite, mutate media, or create receipts.",
        "latestSessionDir": str(output_dir),
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "review-blockers.json"),
        "markdownPath": str(output_dir / "review-blockers.md"),
        "counts": totals,
        "totals": totals,
        "nextSafestAction": report.get("nextSafestAction") or report_next_action(totals),
        "firstSafeAction": {
            "label": "Open review blocker report",
            "command": f"open '{str(output_dir / 'index.html')}'",
            "path": str(output_dir / "index.html"),
            "safety": "Opens local review blocker evidence only. It does not approve, publish, upload, schedule, mutate media, overwrite versions, or capture receipts.",
        },
        "truth": report.get("truth") or "Read-only review blocker pointer.",
    }
    (release_root / "review-board" / "latest-review-blocker-report.json").write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only review blocker report.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--episode", type=int, default=None)
    args = parser.parse_args()
    release_root = Path(args.release_root)
    report = build_report(release_root, args.episode)
    output_dir = prepare_output_dir(release_root)
    (output_dir / "review-blockers.json").write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_markdown(output_dir, report)
    write_html(output_dir, report)
    update_pointer(release_root, output_dir, report)
    print(json.dumps({
        "ok": True,
        "status": report.get("status"),
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "review-blockers.json"),
        "markdownPath": str(output_dir / "review-blockers.md"),
        "counts": report.get("counts") or report.get("totals") or {},
        "nextSafestAction": report.get("nextSafestAction"),
        "truth": report.get("truth"),
        "totals": report.get("totals") or {},
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
