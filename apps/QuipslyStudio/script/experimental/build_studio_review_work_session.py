#!/usr/bin/env python3
"""Build a calm Studio review work session for the next reversible actions.

This packet joins the current Studio quality desk, top review companion, sync
control room, shorts cockpit, and Tower receipt readiness into one 25-minute
front door. It is deliberately local-only: it does not approve, promote,
repair, export, publish, upload, schedule, mutate accounts, overwrite versions,
delete files, capture receipts, or touch original media.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.review-work-session.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-review-work-session")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except Exception:
        return default


def safe_count(payload: dict[str, Any], key: str) -> int:
    return safe_int(as_dict(payload.get("counts")).get(key), 0)


def command_open(path: str) -> str:
    return f"open {shell_quote(path)}" if path else ""


def first_existing(paths: list[Path]) -> dict[str, Any]:
    for path in paths:
        payload = load_json(path)
        if payload:
            return payload
    return {}


def merge_pointer_target(payload: dict[str, Any]) -> dict[str, Any]:
    target_path = str(payload.get("jsonPath") or "")
    if not target_path:
        return payload
    target = load_json(Path(target_path))
    if not target:
        return payload
    return {**payload, **target}


def gate_by_episode(top_review: dict[str, Any], episode: int) -> dict[str, Any]:
    for row in as_list(top_review.get("gateClassificationDeck")):
        if isinstance(row, dict) and safe_int(row.get("episode")) == episode:
            return row
    if episode == safe_int(as_dict(top_review.get("firstGateClassification")).get("episode")):
        return as_dict(top_review.get("firstGateClassification"))
    return {}


def evidence_action(label: str, path: str, reason: str) -> dict[str, Any]:
    return {
        "label": label,
        "path": path,
        "command": command_open(path),
        "reason": reason,
        "safety": "Opens local evidence only. No approval, promotion, repair, export, publish, upload, schedule, account mutation, overwrite, delete, source mutation, or receipt capture occurs.",
    }


def decision_options(gate: dict[str, Any]) -> list[dict[str, Any]]:
    options: list[dict[str, Any]] = []
    for option in as_list(gate.get("decisionOptions")):
        if isinstance(option, dict):
            options.append({
                "key": str(option.get("key") or ""),
                "label": str(option.get("label") or option.get("key") or "Decision option"),
                "means": str(option.get("means") or ""),
                "codexMayDo": str(option.get("codexMayDo") or ""),
                "watchFor": str(option.get("danger") or option.get("watchFor") or ""),
            })
    return options


def make_task(
    *,
    rank: int,
    task_id: str,
    title: str,
    lane: str,
    owner: str,
    why: str,
    first_action: dict[str, Any],
    decision_question: str,
    done_when: str,
    codex_parallel_work: str,
    decision_rows: list[dict[str, Any]] | None = None,
    caution: str = "Do not turn review evidence into publication truth.",
    status: str = "ready-for-review",
) -> dict[str, Any]:
    return {
        "rank": rank,
        "id": task_id,
        "title": title,
        "lane": lane,
        "owner": owner,
        "status": status,
        "whyThisMatters": why,
        "firstAction": first_action,
        "decisionQuestion": decision_question,
        "doneWhen": done_when,
        "codexParallelWork": codex_parallel_work,
        "decisionOptions": decision_rows or [],
        "caution": caution,
        "truthBoundary": "Local review/work-session guidance only. This packet records no approval and creates no external publication or receipt truth.",
    }


def mmss(seconds: Any) -> str:
    try:
        total = max(0, int(round(float(seconds))))
    except Exception:
        return "unknown"
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def artifact_by_id(episode: dict[str, Any], artifact_id: str) -> dict[str, Any]:
    checklist = as_dict(episode.get("mediaReviewChecklist"))
    for row in as_list(checklist.get("artifactRows")):
        if isinstance(row, dict) and str(row.get("id") or "") == artifact_id:
            return row
    return {}


def command_by_kind(episode: dict[str, Any], kind: str) -> dict[str, Any]:
    for row in as_list(episode.get("commands")):
        if isinstance(row, dict) and str(row.get("kind") or "") == kind:
            return row
    return {}


def build_episode_package_runway(package_quality: dict[str, Any]) -> list[dict[str, Any]]:
    thin_rows = {
        safe_int(row.get("episode")): row
        for row in as_list(package_quality.get("rows"))
        if isinstance(row, dict) and safe_int(row.get("episode"))
    }
    runway: list[dict[str, Any]] = []
    episode_rows = [row for row in as_list(package_quality.get("episodes")) if isinstance(row, dict)]
    if not episode_rows:
        episode_rows = list(thin_rows.values())

    for episode in sorted(episode_rows, key=lambda row: safe_int(row.get("episode"))):
        ep_num = safe_int(episode.get("episode"))
        thin = thin_rows.get(ep_num, {})
        primary = as_dict(episode.get("primaryReviewAction"))
        open_package = command_by_kind(episode, "open")
        dry_run = command_by_kind(episode, "review-dry-run")
        video_16 = artifact_by_id(episode, "videoMaster16x9")
        video_9 = artifact_by_id(episode, "videoMaster9x16")
        podcast = artifact_by_id(episode, "audioOnlyPodcast")
        checklist = as_dict(episode.get("mediaReviewChecklist"))
        review_counts = as_dict(as_dict(episode.get("review")).get("counts"))

        review_target = str(episode.get("reviewTargetVersion") or thin.get("reviewTargetVersion") or "")
        current_version = str(episode.get("currentBestVersion") or episode.get("version") or thin.get("version") or "")
        version_dir = str(checklist.get("versionDir") or episode.get("versionDir") or thin.get("versionDir") or "")
        shorts_dir = str(checklist.get("shortsDir") or episode.get("shortsDir") or thin.get("shortsDir") or version_dir)
        manifest_path = str(checklist.get("manifestPath") or episode.get("manifestPath") or thin.get("manifestPath") or "")
        notes_path = str(checklist.get("notesPath") or episode.get("notesPath") or "")

        duration_spread = episode.get("durationSpreadSeconds", thin.get("durationSpreadSeconds", 0))
        warnings = safe_int(episode.get("warnings", thin.get("warnings", 0)))
        blockers = safe_int(episode.get("blockerCount", thin.get("blockers", 0)))
        ready_shorts = safe_int(episode.get("readyShortCount", thin.get("readyShorts", thin.get("shorts", 0))))
        pending_review = safe_int(review_counts.get("pending"), safe_int(thin.get("pendingReview"), 0))

        runway.append({
            "episode": ep_num,
            "label": f"Episode {ep_num}",
            "currentBestVersion": current_version,
            "reviewTargetVersion": review_target,
            "versionDisplay": f"{current_version} -> {review_target}" if review_target and review_target != current_version else current_version,
            "status": str(episode.get("status") or thin.get("status") or "unknown"),
            "reviewReadiness": str(as_dict(episode.get("reviewReadiness")).get("label") or thin.get("reviewReadiness") or ""),
            "publishReadiness": str(as_dict(episode.get("publishReadiness")).get("label") or thin.get("publishReadiness") or ""),
            "publishReadinessStatus": str(as_dict(episode.get("publishReadiness")).get("status") or thin.get("publishReadiness") or ""),
            "durationSpreadSeconds": duration_spread,
            "durationSpreadLabel": str(episode.get("durationSpreadLabel") or mmss(duration_spread)),
            "durationSeverity": str(as_dict(episode.get("durationSpreadSeverity")).get("label") or thin.get("durationSeverity") or ""),
            "warnings": warnings,
            "blockers": blockers,
            "pendingReview": pending_review,
            "readyShorts": ready_shorts,
            "versionDir": version_dir,
            "shortsDir": shorts_dir,
            "manifestPath": manifest_path,
            "notesPath": notes_path,
            "video16x9Path": str(video_16.get("path") or ""),
            "video16x9Duration": str(video_16.get("durationLabel") or mmss(video_16.get("durationSeconds"))),
            "video9x16Path": str(video_9.get("path") or ""),
            "video9x16Duration": str(video_9.get("durationLabel") or mmss(video_9.get("durationSeconds"))),
            "podcastAudioPath": str(podcast.get("path") or ""),
            "podcastAudioDuration": str(podcast.get("durationLabel") or mmss(podcast.get("durationSeconds"))),
            "primaryActionLabel": str(primary.get("label") or episode.get("action") or thin.get("action") or "Open package evidence"),
            "primaryActionPath": str(primary.get("path") or version_dir),
            "primaryActionCommand": str(primary.get("command") or command_open(version_dir)),
            "openPackageCommand": str(open_package.get("command") or command_open(version_dir)),
            "dryRunReviewCommand": str(dry_run.get("command") or ""),
            "humanAsk": str(episode.get("humanAsk") or thin.get("humanAsk") or ""),
            "nextSafestAction": str(episode.get("nextSafestAction") or thin.get("nextSafestAction") or ""),
            "safeReviewerSummary": str(episode.get("safeReviewerSummary") or ""),
            "publicationReceiptStatus": str(episode.get("publicationReceiptStatus") or "no platform receipts captured"),
            "truth": "Local review runway only. This row does not approve, promote, repair, export, publish, upload, schedule, mutate sources, overwrite versions, or capture receipts.",
        })
    return runway


def build_human_reviewer_runway(episode_package_runway: list[dict[str, Any]], work_tasks: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    task_lookup = {str(task.get("id") or ""): task for task in work_tasks if isinstance(task, dict)}
    rows: list[dict[str, Any]] = []
    for row in episode_package_runway:
        if not isinstance(row, dict):
            continue
        episode = safe_int(row.get("episode"))
        duration_spread = float(row.get("durationSpreadSeconds") or 0)
        warnings = safe_int(row.get("warnings"))
        publish_status = str(row.get("publishReadinessStatus") or row.get("publishReadiness") or "")
        if episode == 1:
            priority = 1
            review_mode = "Watch/listen candidate gate"
            decision_prompt = "Does Episode 1 v004 feel like the best current long-form candidate, or should it be refined/held?"
            primary_task = task_lookup.get("episode-1-v004-watch-listen-gate", {})
        elif episode == 4:
            priority = 2
            review_mode = "Classify sync/tail uncertainty"
            decision_prompt = "Is the Episode 4 mismatch wrong-source, tail cleanup, intentional, or needs more evidence?"
            primary_task = task_lookup.get("episode-4-sync-tail-gate", {})
        elif duration_spread > 2 or warnings:
            priority = 20 + episode
            review_mode = "Review with warnings"
            decision_prompt = "Does this package pass a practical watch/listen review, or should the warnings become a refine/hold task?"
            primary_task = {}
        else:
            priority = 10 + episode
            review_mode = "Normal human review"
            decision_prompt = "Does the long-form episode and its shorts pass review for quality, pacing, and platform fit?"
            primary_task = {}
        action = as_dict(primary_task.get("firstAction"))
        open_command = str(action.get("command") or row.get("primaryActionCommand") or row.get("openPackageCommand") or "")
        rows.append({
            "priority": priority,
            "episode": episode,
            "label": row.get("label") or f"Episode {episode}",
            "versionDisplay": row.get("versionDisplay") or row.get("currentBestVersion") or "",
            "reviewMode": review_mode,
            "status": row.get("status") or "",
            "reviewReadiness": row.get("reviewReadiness") or "",
            "publishGate": row.get("publishReadiness") or row.get("publishReadinessStatus") or "",
            "durationSpreadLabel": row.get("durationSpreadLabel") or "",
            "durationSeverity": row.get("durationSeverity") or "",
            "warnings": warnings,
            "readyShorts": safe_int(row.get("readyShorts")),
            "openCommand": open_command,
            "openPath": str(action.get("path") or row.get("primaryActionPath") or row.get("versionDir") or ""),
            "versionDir": row.get("versionDir") or "",
            "video16x9Path": row.get("video16x9Path") or "",
            "video9x16Path": row.get("video9x16Path") or "",
            "podcastAudioPath": row.get("podcastAudioPath") or "",
            "shortsDir": row.get("shortsDir") or "",
            "manifestPath": row.get("manifestPath") or "",
            "notesPath": row.get("notesPath") or "",
            "decisionPrompt": decision_prompt,
            "allowedLocalDecisions": ["approve-for-next-local-step", "refine", "hold", "needs-more-evidence"],
            "notAllowedYet": [
                "external publish",
                "schedule",
                "upload",
                "receipt capture",
                "overwrite current version",
                "delete originals",
            ],
            "reviewerNotes": [
                "Watch enough beginning/middle/end to know if the episode feels coherent.",
                "Check audio sync and tail behavior before approving.",
                "For shorts, check hook clarity, face/caption overlap, crop, and platform fit.",
            ],
            "nextSafestAction": row.get("nextSafestAction") or "Open the local evidence and record a reversible review note.",
            "truth": "Reviewer runway row only. A local review decision can guide the next package step, but it is not publication, upload, schedule, receipt truth, overwrite, delete, or source mutation.",
        })
    rows.sort(key=lambda item: safe_int(item.get("priority")))
    return {
        "schema": "quipsly.studio.human-reviewer-runway.v1",
        "plainEnglish": "This is the human review airport board. It tells Charlie, Mako, or Homer what to watch first, what decision is allowed locally, and what still must not become publication truth.",
        "firstMove": rows[0].get("nextSafestAction") if rows else "Open the package quality desk and find the first reviewable package.",
        "firstOpenCommand": rows[0].get("openCommand") if rows else "",
        "reviewerRoles": [
            {"name": "Charlie", "focus": "systems anxiety, overall story, publishing risk, and final owner approval"},
            {"name": "Mako", "focus": "edit feel, pacing, sync, crop, shorts quality, and practical reviewer notes"},
            {"name": "Homer", "focus": "voice, message accuracy, coaching/book alignment, and episode substance"},
            {"name": "Codex", "focus": "evidence packets, metadata, summaries, validation, and safe next-step prep"},
        ],
        "rows": rows,
        "counts": {
            "episodes": len(rows),
            "priorityGateRows": sum(1 for row in rows if safe_int(row.get("priority")) <= 2),
            "normalReviewRows": sum(1 for row in rows if safe_int(row.get("priority")) > 2),
            "readyShorts": counts.get("readyShorts", 0),
            "publishBlockedPackages": counts.get("publishBlockedPackages", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
        },
        "truth": "Human reviewer runway only. It does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, mutate sources, or capture receipts.",
    }


def build_review_decision_cards(human_reviewer_runway: dict[str, Any]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for row in as_list(human_reviewer_runway.get("rows")):
        if not isinstance(row, dict):
            continue
        episode = safe_int(row.get("episode"))
        if not episode:
            continue
        allowed = [str(item) for item in as_list(row.get("allowedLocalDecisions"))] or [
            "approve-for-next-local-step",
            "refine",
            "hold",
            "needs-more-evidence",
        ]
        evidence_paths = [
            {"label": "Open evidence", "path": row.get("openPath") or row.get("versionDir") or "", "command": row.get("openCommand") or ""},
            {"label": "16:9 video", "path": row.get("video16x9Path") or "", "command": command_open(str(row.get("video16x9Path") or ""))},
            {"label": "9:16 video", "path": row.get("video9x16Path") or "", "command": command_open(str(row.get("video9x16Path") or ""))},
            {"label": "Podcast audio", "path": row.get("podcastAudioPath") or "", "command": command_open(str(row.get("podcastAudioPath") or ""))},
            {"label": "Shorts folder", "path": row.get("shortsDir") or "", "command": command_open(str(row.get("shortsDir") or ""))},
            {"label": "Manifest", "path": row.get("manifestPath") or "", "command": command_open(str(row.get("manifestPath") or ""))},
            {"label": "Notes", "path": row.get("notesPath") or "", "command": command_open(str(row.get("notesPath") or ""))},
        ]
        evidence_paths = [item for item in evidence_paths if item.get("path") or item.get("command")]
        template_lines = [
            f"episode: {episode}",
            f"version: {row.get('versionDisplay') or ''}",
            "reviewer: <Charlie|Mako|Homer|Codex>",
            f"localDecision: <{'|'.join(allowed)}>",
            f"decisionPrompt: {row.get('decisionPrompt') or ''}",
            "evidenceWatched:",
            "  beginning: <watched/listened/not checked>",
            "  middle: <watched/listened/not checked>",
            "  ending: <watched/listened/not checked>",
            "  shorts: <checked/not checked>",
            "notes:",
            "  story/pacing: <one sentence>",
            "  audio/sync: <one sentence>",
            "  crop/captions/platform: <one sentence>",
            "nextSafeAction: <promote local package candidate|refine with notes|hold|collect more evidence>",
            "notPublicationApproval: true",
            "notExternalUploadOrSchedule: true",
            "notReceiptTruth: true",
        ]
        cards.append({
            "id": f"episode-{episode:02d}-local-review-decision-card",
            "episode": episode,
            "label": row.get("label") or f"Episode {episode}",
            "versionDisplay": row.get("versionDisplay") or "",
            "status": row.get("status") or "",
            "reviewMode": row.get("reviewMode") or "",
            "publishGate": row.get("publishGate") or "",
            "durationSpreadLabel": row.get("durationSpreadLabel") or "",
            "durationSeverity": row.get("durationSeverity") or "",
            "readyShorts": safe_int(row.get("readyShorts")),
            "decisionPrompt": row.get("decisionPrompt") or "",
            "allowedLocalDecisions": allowed,
            "defaultLocalDecision": "needs-more-evidence" if safe_int(row.get("priority")) <= 2 else "hold",
            "evidencePaths": evidence_paths,
            "copyableDecisionTemplate": "\n".join(template_lines),
            "firstSafeAction": {
                "label": "Open local review evidence",
                "command": row.get("openCommand") or "",
                "path": row.get("openPath") or row.get("versionDir") or "",
                "safety": "Opens local evidence only. It does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete, mutate sources, or capture receipts.",
            },
            "truth": "Review decision card only. It is a copyable local note template, not an approval record, publication action, upload, schedule, receipt, overwrite, delete, or source mutation.",
        })
    return cards


def build_reviewer_daily_checklist(review_decision_cards: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    for card in review_decision_cards:
        if not isinstance(card, dict):
            continue
        evidence = [item for item in as_list(card.get("evidencePaths")) if isinstance(item, dict)]
        first = as_dict(card.get("firstSafeAction"))
        items.append({
            "episode": safe_int(card.get("episode")),
            "label": str(card.get("label") or f"Episode {card.get('episode') or '?'}"),
            "versionDisplay": str(card.get("versionDisplay") or ""),
            "status": str(card.get("status") or ""),
            "reviewMode": str(card.get("reviewMode") or ""),
            "publishGate": str(card.get("publishGate") or ""),
            "durationSpreadLabel": str(card.get("durationSpreadLabel") or ""),
            "durationSeverity": str(card.get("durationSeverity") or ""),
            "readyShorts": safe_int(card.get("readyShorts")),
            "decisionPrompt": str(card.get("decisionPrompt") or ""),
            "defaultLocalDecision": str(card.get("defaultLocalDecision") or "needs-more-evidence"),
            "firstOpenCommand": str(first.get("command") or ""),
            "firstOpenPath": str(first.get("path") or ""),
            "video16x9Path": str(next((item.get("path") for item in evidence if str(item.get("label") or "") == "16:9 video"), "") or ""),
            "video9x16Path": str(next((item.get("path") for item in evidence if str(item.get("label") or "") == "9:16 video"), "") or ""),
            "podcastAudioPath": str(next((item.get("path") for item in evidence if str(item.get("label") or "") == "Podcast audio"), "") or ""),
            "shortsPath": str(next((item.get("path") for item in evidence if str(item.get("label") or "") == "Shorts folder"), "") or ""),
            "copyableDecisionTemplate": str(card.get("copyableDecisionTemplate") or ""),
            "truth": str(card.get("truth") or "Local review checklist item only. It does not approve, promote, publish, upload, schedule, mutate media, overwrite, delete, or create receipt truth."),
        })
    return {
        "schema": "quipsly.studio.reviewer-daily-checklist.v1",
        "items": items,
        "counts": {
            "items": len(items),
            "priorityItems": sum(1 for item in items if str(item.get("reviewMode") or "").startswith("priority")),
            "readyShorts": safe_int(counts.get("readyShorts")),
            "publishBlockedPackages": safe_int(counts.get("publishBlockedPackages")),
            "capturedReceipts": safe_int(counts.get("capturedReceipts")),
        },
        "allowedLocalDecisions": ["approve-for-next-local-step", "refine", "hold", "needs-more-evidence"],
        "reviewRhythm": [
            "Open one episode evidence packet.",
            "Watch/listen beginning, middle, ending, and at least one short when practical.",
            "Pick a local classification only: approve next local step, refine, hold, or needs more evidence.",
            "Copy the decision note and keep Tower publication blocked until explicit approval exists.",
        ],
        "truth": "Reviewer daily checklist only. It does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
    }


def build_duration_warning_cards(duration_workorders: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    workorders = [row for row in as_list(duration_workorders.get("workorders")) if isinstance(row, dict)]
    cards: list[dict[str, Any]] = []
    for index, row in enumerate(workorders[:limit], start=1):
        episode = safe_int(row.get("episode"))
        current_version = str(row.get("currentVersion") or "")
        candidate_version = str(row.get("candidateVersion") or "")
        candidate_status = str(row.get("candidateStatus") or row.get("status") or "")
        artifacts = [artifact for artifact in as_list(row.get("artifacts")) if isinstance(artifact, dict)]
        artifact_lines = [
            f"{artifact.get('label')}: {artifact.get('durationLabel')} -> {artifact.get('path')}"
            for artifact in artifacts
        ]
        first_action = as_dict(row.get("firstSafeAction"))
        candidate_commands = [command for command in as_list(row.get("candidateCommands")) if isinstance(command, dict)]
        if row.get("candidateReviewHtmlPath"):
            route = "review-duration-candidate"
            first_command = command_open(str(row.get("candidateReviewHtmlPath") or ""))
            human_question = "Does the duration-aligned candidate preserve the actual ending and feel correct?"
        elif candidate_commands:
            route = "candidate-command-review"
            first_command = str(first_action.get("command") or "")
            human_question = "Should this workorder become a versioned candidate after review, or is sync/content investigation safer?"
        else:
            route = "sync-investigation-first"
            first_command = str(first_action.get("command") or "")
            human_question = "Is this a sync/content problem rather than a trim/candidate problem?"
        note = "\n".join([
            "studio_duration_warning_note:",
            f"  episode: {episode}",
            f"  currentVersion: \"{current_version}\"",
            f"  candidateVersion: \"{candidate_version}\"",
            f"  route: \"{route}\"",
            f"  candidateStatus: \"{candidate_status}\"",
            f"  currentSpread: \"{row.get('spreadLabel') or row.get('durationSpreadLabel') or ''}\"",
            f"  candidateSpreadSeconds: {row.get('candidateDurationSpreadSeconds') if row.get('candidateDurationSpreadSeconds') is not None else 'null'}",
            "  localDecision: hold # review-candidate | refine | hold | sync-investigate | source-needed",
            "  promoteToCurrentBest: false",
            "  externalPublicationApproved: false",
            "  reviewer: \"\"",
            "  reason: \"\"",
        ])
        cards.append({
            "rank": index,
            "episode": episode,
            "currentVersion": current_version,
            "candidateVersion": candidate_version,
            "route": route,
            "candidateStatus": candidate_status,
            "spreadLabel": row.get("spreadLabel") or row.get("durationSpreadLabel") or "",
            "candidateDurationSpreadSeconds": row.get("candidateDurationSpreadSeconds"),
            "candidateAlreadyExists": bool(row.get("candidateAlreadyExists")),
            "candidateReviewHtmlPath": row.get("candidateReviewHtmlPath") or "",
            "candidateManifestPath": row.get("candidateManifestPath") or "",
            "firstOpenCommand": first_command,
            "humanQuestion": human_question,
            "codexSafeMove": "Summarize local A/V evidence, prepare review notes, and keep promotion/export/publication blocked until a human approves the exact next step.",
            "artifactSummary": artifact_lines,
            "candidateCommands": candidate_commands,
            "localDurationWarningNoteYaml": note,
            "truth": "Duration warning card only. It does not approve, promote, trim, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        })
    by_route: dict[str, int] = {}
    for card in cards:
        route = str(card.get("route") or "duration-review")
        by_route[route] = by_route.get(route, 0) + 1
    return {
        "schema": "quipsly.studio.duration-warning-cards.v1",
        "headline": f"Duration warning cards: {len(cards)} episode(s) with A/V spread or sync review workorders.",
        "plainEnglish": "These cards make duration warnings reviewable instead of scary. They route each warning to candidate review, command review, or sync investigation without promoting or repairing anything automatically.",
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "byRoute": by_route,
            "repairsExecuted": False,
            "exportsCreated": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
            "receiptTruthCreated": False,
        },
        "allowedLocalDecisions": [
            "review-candidate",
            "refine",
            "hold",
            "sync-investigate",
            "source-needed",
        ],
        "doNotDo": [
            "Do not promote a candidate from duration alignment alone.",
            "Do not trim, repair, export, publish, upload, schedule, overwrite, delete, or capture receipts from this deck.",
            "Do not treat a duration match as content approval.",
        ],
        "truth": "Duration warning cards are local review routing only. They do not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original/source media.",
    }


def build_payload(release_root: Path, session_dir: Path) -> dict[str, Any]:
    review_board = release_root / "review-board"
    package_quality = load_json(review_board / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json")
    top_review = load_json(review_board / "top-review-companions" / "latest-studio-top-review-companion.json")
    sync_control = first_existing([
        review_board / "sync-control-rooms" / "latest-sync-control-room.json",
        review_board / "latest-sync-control-room.json",
        review_board / "sync-control-rooms" / "latest-studio-sync-control-room.json",
    ])
    duration_workorders = merge_pointer_target(first_existing([
        review_board / "duration-repair-workorders" / "latest-duration-repair-workorders.json",
        review_board / "latest-duration-repair-workorders.json",
    ]))
    shorts = first_existing([
        release_root / "latest-shorts-review-cockpit.json",
        release_root / "review-board" / "latest-shorts-review-cockpit.json",
    ])
    tower_receipts = load_json(release_root / "tower-receipt-readiness" / "latest-tower-receipt-readiness-packet.json")

    episode1_gate = gate_by_episode(top_review, 1)
    episode4_gate = gate_by_episode(top_review, 4)
    package_counts = as_dict(package_quality.get("counts"))
    sync_counts = as_dict(sync_control.get("counts"))
    duration_counts = as_dict(duration_workorders.get("counts"))
    shorts_counts = as_dict(shorts.get("counts"))
    tower_counts = as_dict(tower_receipts.get("counts"))
    episode_package_runway = build_episode_package_runway(package_quality)

    episode1_evidence = str(episode1_gate.get("firstEvidencePath") or top_review.get("htmlPath") or package_quality.get("htmlPath") or "")
    episode4_evidence = str(episode4_gate.get("firstEvidencePath") or sync_control.get("htmlPath") or top_review.get("htmlPath") or "")
    package_evidence = str(package_quality.get("htmlPath") or "")
    shorts_evidence = str(shorts.get("htmlPath") or shorts.get("markdownPath") or "")
    tower_evidence = str(tower_receipts.get("htmlPath") or tower_receipts.get("markdownPath") or "")

    work_tasks = [
        make_task(
            rank=1,
            task_id="episode-1-v004-watch-listen-gate",
            title="Episode 1 v004 watch/listen gate",
            lane="Studio podcast/video",
            owner=str(episode1_gate.get("owner") or "Charlie or Mako"),
            why="Episode 1 is closest to promotion, but a duration candidate is not a package approval. This is the fastest high-value human review target.",
            first_action=evidence_action("Open Episode 1 duration candidate evidence", episode1_evidence, "Review beginning, middle, and ending snippets before choosing promote, refine, hold, or need-more-evidence."),
            decision_question=str(episode1_gate.get("humanQuestion") or "Does Episode 1 v004 pass watch/listen review well enough to become a real versioned review package?"),
            done_when=str(episode1_gate.get("doneWhen") or "A local decision note says promote, refine, hold, or need more evidence."),
            codex_parallel_work=str(episode1_gate.get("agentSafeParallelWork") or "Prepare comparison notes, summarize snippets, and build dry-run next steps without changing package truth."),
            decision_rows=decision_options(episode1_gate),
            caution="Do not approve Tower artifacts or call Episode 1 publish-ready from a candidate packet alone.",
            status=str(episode1_gate.get("state") or "active"),
        ),
        make_task(
            rank=2,
            task_id="episode-4-sync-tail-gate",
            title="Episode 4 sync/tail classification",
            lane="Studio podcast/video",
            owner=str(episode4_gate.get("owner") or "Charlie or Mako"),
            why="Episode 4 has the clearest known sync/duration uncertainty. The right move is classify evidence, not trim or restack by vibes.",
            first_action=evidence_action("Open Episode 4 sync control room", episode4_evidence, "Compare sync snippets and classify the podcast-audio tail before any rebuild, hold, or trim candidate."),
            decision_question=str(episode4_gate.get("humanQuestion") or sync_control.get("humanAsk") or "Does the Episode 4 tail contain real content, wrong-source evidence, expendable cleanup, or not enough evidence?"),
            done_when=str(episode4_gate.get("doneWhen") or "A local classification says hold/re-stack, source-needed, trim-candidate, intentional-with-notes, or more evidence."),
            codex_parallel_work=str(episode4_gate.get("agentSafeParallelWork") or sync_control.get("agentSafeParallelWork") or "Prepare sync notes, missing-media tasks, and dry-run review commands without rendering or changing package truth."),
            decision_rows=decision_options(episode4_gate),
            caution="Do not trim the tail just to make durations match unless a human confirms it is expendable.",
            status=str(episode4_gate.get("state") or sync_control.get("status") or "active"),
        ),
        make_task(
            rank=3,
            task_id="shorts-review-can-continue",
            title="Keep shorts moving while long-form gates wait",
            lane="Studio shorts",
            owner="Codex with Charlie/Mako review",
            why=f"There are {safe_count(package_quality, 'readyShorts')} ready shorts in current package evidence. Shorts can keep improving even when long-form publication gates are blocked.",
            first_action=evidence_action("Open shorts review cockpit", shorts_evidence, "Review hooks, crop, audio, text overlap, and platform fit. Keep local approval separate from publication."),
            decision_question="Which shorts deserve human review, refinement, or a new versioned export candidate?",
            done_when="A short has a clear local review/refine/hold note and no false publication claim.",
            codex_parallel_work="Prepare captions, platform packets, safer filenames, and review notes. Do not upload or schedule externally.",
            decision_rows=[
                {"key": "review", "label": "Send to review", "means": "The short is locally ready for a person to watch.", "codexMayDo": "Improve packet metadata and local review instructions.", "watchFor": "Local review is not platform publication."},
                {"key": "refine", "label": "Refine", "means": "The hook, crop, text, or audio needs another local pass.", "codexMayDo": "Create a new versioned local candidate if export tooling is available.", "watchFor": "Never overwrite old versions."},
                {"key": "hold", "label": "Hold", "means": "The short should not move forward yet.", "codexMayDo": "Explain why and continue another short.", "watchFor": "Do not delete the evidence."},
            ],
            caution="Shorts momentum is good; fake publication is not.",
        ),
        make_task(
            rank=4,
            task_id="package-quality-sweep",
            title="Package quality sweep for Episodes 1-6",
            lane="Studio review",
            owner="Codex",
            why=f"All {safe_count(package_quality, 'currentBestPackages')} current-best packages are reviewable, but {safe_count(package_quality, 'publishBlockedPackages')} remain publish-blocked and {safe_count(package_quality, 'warningEpisodes')} episodes carry warnings.",
            first_action=evidence_action("Open package quality desk", package_evidence, "Use the package-quality desk to see which files exist, what is warning, and what is only locally ready."),
            decision_question="What is the next reversible improvement that makes a package easier to review without changing truth state?",
            done_when="The package has clearer notes, warnings, or review instructions, or a precise blocker is recorded.",
            codex_parallel_work="Improve manifests, metadata packets, validation reports, and blocker precision while leaving old versions and originals untouched.",
            caution="Reviewable means openable; publishable requires explicit review and receipt path.",
        ),
        make_task(
            rank=5,
            task_id="tower-receipt-boundary",
            title="Tower receipt boundary stays honest",
            lane="Tower/publishing",
            owner="Codex after explicit approval",
            why=f"Tower currently has {safe_int(tower_counts.get('receiptSlots'))} receipt slots and {safe_int(tower_counts.get('capturedReceipts'))} captured receipts. That is good truth: packets exist, external proof does not.",
            first_action=evidence_action("Open Tower receipt readiness packet", tower_evidence, "Confirm local packets are waiting for approval and real external receipts, not pretending to be published."),
            decision_question="After a human approves a package, which platform gets a manual packet and receipt slot first?",
            done_when="A packet has explicit approval language and a receipt slot still waiting for real external proof.",
            codex_parallel_work="Prepare platform copy, checklists, calendar drafts, receipt templates, and manual publishing packets without publishing.",
            caution="Receipt slots are not receipts. Publication truth only comes from real platform URLs/IDs after explicit approval.",
        ),
    ]

    counts = {
        "workTasks": len(work_tasks),
        "topReviewItems": safe_count(top_review, "reviewItems"),
        "gateClassificationRows": safe_count(top_review, "gateClassificationRows"),
        "gateClassificationOptions": safe_count(top_review, "gateClassificationOptions"),
        "currentBestPackages": safe_int(package_counts.get("currentBestPackages")),
        "reviewablePackages": safe_int(package_counts.get("reviewablePackages")),
        "publishBlockedPackages": safe_int(package_counts.get("publishBlockedPackages")),
        "pendingReviewRows": safe_int(package_counts.get("pendingReviewRows")),
        "readyShorts": safe_int(package_counts.get("readyShorts")),
        "warningEpisodes": safe_int(package_counts.get("warningEpisodes")),
        "syncComparisonPoints": safe_int(package_counts.get("syncComparisonPoints")) or safe_int(sync_counts.get("comparisonRows")),
        "durationWorkorders": safe_int(package_counts.get("durationWorkorders")) or safe_int(duration_counts.get("workorders")),
        "episodePackageRunwayRows": len(episode_package_runway),
        "receiptSlots": safe_int(package_counts.get("receiptSlots")) or safe_int(tower_counts.get("receiptSlots")),
        "capturedReceipts": safe_int(package_counts.get("capturedReceipts")) or safe_int(tower_counts.get("capturedReceipts")),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "approvalsChanged": False,
        "exportsCreated": False,
        "repairsExecuted": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }

    first_task = work_tasks[0]
    human_reviewer_runway = build_human_reviewer_runway(episode_package_runway, work_tasks, counts)
    review_decision_cards = build_review_decision_cards(human_reviewer_runway)
    reviewer_daily_checklist = build_reviewer_daily_checklist(review_decision_cards, counts)
    duration_warning_cards = build_duration_warning_cards(duration_workorders)
    reviewer_counts = as_dict(human_reviewer_runway.get("counts"))
    counts["humanReviewerRunwayRows"] = safe_int(reviewer_counts.get("episodes"))
    counts["humanReviewerPriorityGateRows"] = safe_int(reviewer_counts.get("priorityGateRows"))
    counts["reviewDecisionCards"] = len(review_decision_cards)
    counts["reviewerDailyChecklistItems"] = safe_int((reviewer_daily_checklist.get("counts") or {}).get("items"))
    counts["durationWarningCards"] = safe_int((duration_warning_cards.get("counts") or {}).get("cards"))
    work_session_plan = {
        "sessionLengthMinutes": 25,
        "mode": "review-one-gate-and-continue",
        "plainEnglish": "Open one evidence packet, make one local classification or sharper blocker, then stop before accidentally changing package or publication truth.",
        "rhythm": [
            "0-3 min: open the first evidence packet and read the question.",
            "3-15 min: watch/listen the prepared snippets or inspect the local artifact evidence.",
            "15-22 min: choose promote/refine/hold/more-evidence only as a local classification.",
            "22-25 min: write the next safe action for Codex; if unsure, mark needs-more-evidence and continue another lane.",
        ],
        "firstTaskId": first_task["id"],
        "firstOpenCommand": first_task["firstAction"].get("command") or "",
        "ifTired": "Do not make a promotion or publication call. Mark needs-more-evidence or hold, then use shorts/package metadata work as the low-risk lane.",
        "agentFallback": "If no human is available, Codex may improve evidence packets, metadata, validation, and reviewer instructions, but must not approve, publish, promote, overwrite, or capture receipts.",
    }

    first_safe_action = {
        "label": "Open Studio review work session",
        "path": str(session_dir / "index.html"),
        "command": command_open(str(session_dir / "index.html")),
        "safety": "Opens local review guidance only. No approval, promotion, repair, export, publish, upload, schedule, overwrite, delete, account mutation, source mutation, or receipt capture occurs.",
    }

    return {
        "schema": SCHEMA,
        "status": "studio-review-work-session-ready",
        "updatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "studio-review-work-session.json"),
        "markdownPath": str(session_dir / "START-HERE-studio-review-work-session.md"),
        "csvPath": str(session_dir / "studio-review-work-session.csv"),
        "reviewWorksheetPath": str(session_dir / "review-worksheet.md"),
        "episodePackageRunwayPath": str(session_dir / "episode-package-runway.md"),
        "humanReviewerRunwayPath": str(session_dir / "HUMAN-REVIEWER-RUNWAY.md"),
        "reviewDecisionCardsPath": str(session_dir / "REVIEW-DECISION-CARDS.md"),
        "reviewerDailyChecklistPath": str(session_dir / "REVIEWER-DAILY-CHECKLIST.md"),
        "durationWarningCardsPath": str(session_dir / "DURATION-WARNING-CARDS.md"),
        "reviewerReturnHandoffPath": str(session_dir / "REVIEWER-RETURN-HANDOFF.md"),
        "pointerPath": str(release_root / "review-board" / "studio-review-work-sessions" / "latest-studio-review-work-session.json"),
        "counts": counts,
        "firstSafeAction": first_safe_action,
        "firstWorkSessionTask": first_task,
        "workSessionPlan": work_session_plan,
        "workTasks": work_tasks,
        "episodePackageRunway": episode_package_runway,
        "humanReviewerRunway": human_reviewer_runway,
        "reviewDecisionCards": review_decision_cards,
        "reviewerDailyChecklist": reviewer_daily_checklist,
        "durationWarningCards": duration_warning_cards,
        "sourcePointers": {
            "packageQualityDesk": str(review_board / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json"),
            "topReviewCompanion": str(review_board / "top-review-companions" / "latest-studio-top-review-companion.json"),
            "syncControlRoom": str(review_board / "sync-control-rooms" / "latest-sync-control-room.json"),
            "durationRepairWorkorders": str(review_board / "duration-repair-workorders" / "latest-duration-repair-workorders.json"),
            "towerReceiptReadiness": str(release_root / "tower-receipt-readiness" / "latest-tower-receipt-readiness-packet.json"),
        },
        "nextSafestAction": "Open the Studio review work session, review Episode 1 v004 evidence first, and record only a local classification before any package promotion or Tower approval.",
        "humanAsk": "If you have one small review window, classify Episode 1 v004 first. If that is too much, inspect Episode 4 sync evidence or keep shorts/package packets moving without changing publication truth.",
        "agentSafeParallelWork": "Codex may improve evidence, metadata, validation, packet clarity, and blocker precision. Codex must not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or mutate original/source media without explicit approval.",
        "truth": {
            "localReviewGuidanceOnly": True,
            "approvalsChanged": False,
            "exportsCreated": False,
            "repairsExecuted": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
        },
    }


def write_csv(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "rank", "id", "title", "lane", "owner", "status", "firstCommand", "decisionQuestion", "doneWhen", "caution"
        ])
        writer.writeheader()
        for task in payload["workTasks"]:
            writer.writerow({
                "rank": task["rank"],
                "id": task["id"],
                "title": task["title"],
                "lane": task["lane"],
                "owner": task["owner"],
                "status": task["status"],
                "firstCommand": as_dict(task.get("firstAction")).get("command") or "",
                "decisionQuestion": task["decisionQuestion"],
                "doneWhen": task["doneWhen"],
                "caution": task["caution"],
            })


def write_episode_package_runway(payload: dict[str, Any], path: Path) -> None:
    lines = [
        "# Episode package runway",
        "",
        "> One row per current local episode package. Local evidence only: no approval, promotion, repair, export, publish, upload, schedule, overwrite, source mutation, account change, or receipt capture.",
        "",
        f"Updated: `{payload['updatedAt']}`",
        f"Release root: `{payload['releaseRoot']}`",
        "",
        "## At-a-glance",
        "",
        "| Episode | Version | Status | Review | Publish gate | Shorts | Warnings | Next safest action |",
        "| --- | --- | --- | --- | --- | ---: | ---: | --- |",
    ]
    for row in as_list(payload.get("episodePackageRunway")):
        if not isinstance(row, dict):
            continue
        lines.append(
            "| "
            + " | ".join([
                str(row.get("label") or ""),
                str(row.get("versionDisplay") or ""),
                str(row.get("status") or ""),
                str(row.get("reviewReadiness") or ""),
                str(row.get("publishReadiness") or row.get("publishReadinessStatus") or ""),
                str(row.get("readyShorts") or 0),
                str(row.get("warnings") or 0),
                str(row.get("nextSafestAction") or "").replace("|", "/"),
            ])
            + " |"
        )
    lines.extend(["", "## Episode work cards", ""])
    for row in as_list(payload.get("episodePackageRunway")):
        if not isinstance(row, dict):
            continue
        lines.extend([
            f"### {row.get('label')} · {row.get('versionDisplay')}",
            "",
            f"- Status: `{row.get('status')}`",
            f"- Review readiness: `{row.get('reviewReadiness')}`",
            f"- Publish gate: `{row.get('publishReadiness') or row.get('publishReadinessStatus')}`",
            f"- Duration spread: `{row.get('durationSpreadLabel')}` (`{row.get('durationSeverity')}`)",
            f"- Shorts ready: `{row.get('readyShorts')}`",
            f"- Pending review artifacts: `{row.get('pendingReview')}`",
            f"- Warnings: `{row.get('warnings')}`",
            f"- Receipt status: {row.get('publicationReceiptStatus')}",
            f"- Human ask: {row.get('humanAsk')}",
            f"- Next safest action: {row.get('nextSafestAction')}",
            "",
            "Primary local evidence:",
            "",
            "```bash",
            str(row.get("primaryActionCommand") or ""),
            "```",
            "",
            "Open package folder:",
            "",
            "```bash",
            str(row.get("openPackageCommand") or ""),
            "```",
            "",
        ])
        if row.get("dryRunReviewCommand"):
            lines.extend([
                "Preview a local review decision only after watch/listen review:",
                "",
                "```bash",
                str(row.get("dryRunReviewCommand") or ""),
                "```",
                "",
            ])
        media_lines = [
            ("16:9 video", row.get("video16x9Path"), row.get("video16x9Duration")),
            ("9:16 video", row.get("video9x16Path"), row.get("video9x16Duration")),
            ("Podcast audio", row.get("podcastAudioPath"), row.get("podcastAudioDuration")),
            ("Shorts folder", row.get("shortsDir"), ""),
            ("Manifest", row.get("manifestPath"), ""),
            ("Notes", row.get("notesPath"), ""),
        ]
        lines.append("Review artifacts:")
        for label, media_path, duration in media_lines:
            if media_path:
                suffix = f" · `{duration}`" if duration else ""
                lines.append(f"- {label}{suffix}: `{media_path}`")
        lines.extend([
            "",
            f"Safety truth: {row.get('truth')}",
            "",
        ])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_human_reviewer_runway(payload: dict[str, Any], path: Path) -> None:
    runway = as_dict(payload.get("humanReviewerRunway"))
    rows = [row for row in as_list(runway.get("rows")) if isinstance(row, dict)]
    lines = [
        "# Human reviewer runway",
        "",
        "> Local reviewer guidance only. This does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        f"Updated: `{payload['updatedAt']}`",
        f"First move: {runway.get('firstMove', '')}",
        "",
        "```bash",
        str(runway.get("firstOpenCommand") or ""),
        "```",
        "",
        runway.get("plainEnglish", ""),
        "",
        "## Reviewer roles",
        "",
    ]
    for role in as_list(runway.get("reviewerRoles")):
        if isinstance(role, dict):
            lines.append(f"- **{role.get('name')}**: {role.get('focus')}")
    lines.extend(["", "## Watch/review order", ""])
    for row in rows:
        blocked = ", ".join(str(item) for item in as_list(row.get("notAllowedYet")))
        allowed = ", ".join(str(item) for item in as_list(row.get("allowedLocalDecisions")))
        lines.extend([
            f"### {row.get('priority')}. {row.get('label')} · {row.get('versionDisplay')}",
            "",
            f"- Mode: `{row.get('reviewMode')}`",
            f"- Status: `{row.get('status')}`",
            f"- Review readiness: `{row.get('reviewReadiness')}`",
            f"- Publish gate: `{row.get('publishGate')}`",
            f"- Duration: `{row.get('durationSpreadLabel')}` (`{row.get('durationSeverity')}`)",
            f"- Shorts ready: `{row.get('readyShorts')}`",
            f"- Warnings: `{row.get('warnings')}`",
            f"- Decision prompt: {row.get('decisionPrompt')}",
            f"- Allowed local decisions: `{allowed}`",
            f"- Not allowed yet: `{blocked}`",
            f"- Next safest action: {row.get('nextSafestAction')}",
            "",
            "Open local evidence:",
            "",
            "```bash",
            str(row.get("openCommand") or ""),
            "```",
            "",
            "Artifacts:",
        ])
        for label, field in [
            ("16:9 video", "video16x9Path"),
            ("9:16 video", "video9x16Path"),
            ("Podcast audio", "podcastAudioPath"),
            ("Shorts folder", "shortsDir"),
            ("Manifest", "manifestPath"),
            ("Notes", "notesPath"),
        ]:
            if row.get(field):
                lines.append(f"- {label}: `{row.get(field)}`")
        lines.extend(["", "Reviewer notes:"])
        for note in as_list(row.get("reviewerNotes")):
            lines.append(f"- [ ] {note}")
        lines.extend(["", f"Truth: {row.get('truth')}", ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_review_decision_cards(payload: dict[str, Any], path: Path) -> None:
    cards = [card for card in as_list(payload.get("reviewDecisionCards")) if isinstance(card, dict)]
    lines = [
        "# Studio review decision cards",
        "",
        "> Copyable local review note templates only. These cards do not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        f"Updated: `{payload['updatedAt']}`",
        "",
        "## How to use",
        "",
        "1. Open the local evidence for one episode.",
        "2. Watch/listen enough beginning, middle, ending, and shorts context to make the local decision honest.",
        "3. Copy the template, fill it in, and paste it into the reviewer notes surface or handoff thread.",
        "4. If unsure, choose `needs-more-evidence` and keep the conveyor moving.",
        "",
    ]
    for card in cards:
        lines.extend([
            f"## {card.get('label')} · {card.get('versionDisplay')}",
            "",
            f"- Status: `{card.get('status')}`",
            f"- Review mode: `{card.get('reviewMode')}`",
            f"- Publish gate: `{card.get('publishGate')}`",
            f"- Duration: `{card.get('durationSpreadLabel')}` (`{card.get('durationSeverity')}`)",
            f"- Shorts ready: `{card.get('readyShorts')}`",
            f"- Decision prompt: {card.get('decisionPrompt')}",
            f"- Allowed local decisions: `{', '.join(str(item) for item in as_list(card.get('allowedLocalDecisions')))}`",
            f"- Safest default if tired/uncertain: `{card.get('defaultLocalDecision')}`",
            "",
            "Open first:",
            "",
            "```bash",
            str(as_dict(card.get("firstSafeAction")).get("command") or ""),
            "```",
            "",
            "Evidence paths:",
            "",
        ])
        for item in as_list(card.get("evidencePaths")):
            if isinstance(item, dict):
                lines.append(f"- {item.get('label')}: `{item.get('path') or item.get('command') or ''}`")
        lines.extend([
            "",
            "Copyable local review note:",
            "",
            "```yaml",
            str(card.get("copyableDecisionTemplate") or ""),
            "```",
            "",
            f"Truth: {card.get('truth')}",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_reviewer_daily_checklist(payload: dict[str, Any], path: Path) -> None:
    checklist = as_dict(payload.get("reviewerDailyChecklist"))
    items = [item for item in as_list(checklist.get("items")) if isinstance(item, dict)]
    counts = as_dict(checklist.get("counts"))
    lines = [
        "# Studio reviewer daily checklist",
        "",
        "A calm one-page review lane for Episodes 1-6. Open one thing, watch/listen enough to be honest, then record one local classification.",
        "",
        "> Local review only. This does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        f"Updated: `{payload['updatedAt']}`",
        f"Status: `{payload['status']}`",
        "",
        "## Today's review rhythm",
        "",
    ]
    for step in as_list(checklist.get("reviewRhythm")):
        lines.append(f"- [ ] {step}")
    lines.extend([
        "",
        "## Counts",
        "",
        f"- Checklist items: `{counts.get('items', 0)}`",
        f"- Priority items: `{counts.get('priorityItems', 0)}`",
        f"- Ready shorts: `{counts.get('readyShorts', 0)}`",
        f"- Publish-blocked packages: `{counts.get('publishBlockedPackages', 0)}`",
        f"- Captured receipts: `{counts.get('capturedReceipts', 0)}`",
        "",
        "## Episode checklist",
        "",
    ])
    for item in items:
        lines.extend([
            f"### Episode {item.get('episode')} - {item.get('versionDisplay')}",
            "",
            f"- Status: `{item.get('status')}`",
            f"- Review mode: `{item.get('reviewMode')}`",
            f"- Publish gate: `{item.get('publishGate')}`",
            f"- Duration spread: `{item.get('durationSpreadLabel')}` (`{item.get('durationSeverity')}`)",
            f"- Ready shorts: `{item.get('readyShorts')}`",
            f"- Decision prompt: {item.get('decisionPrompt')}",
            f"- Safest default if tired/uncertain: `{item.get('defaultLocalDecision')}`",
            "",
            "Open first:",
            "",
            "```bash",
            str(item.get("firstOpenCommand") or ""),
            "```",
            "",
            "Review checklist:",
            "",
            "- [ ] Watch/listen beginning.",
            "- [ ] Watch/listen middle.",
            "- [ ] Watch/listen ending.",
            "- [ ] Check 16:9 video.",
            "- [ ] Check 9:16 video.",
            "- [ ] Check podcast audio.",
            "- [ ] Check at least one short if available.",
            "- [ ] Choose local decision only: `approve-for-next-local-step`, `refine`, `hold`, or `needs-more-evidence`.",
            "",
            "Paths:",
            "",
            f"- 16:9 video: `{item.get('video16x9Path')}`",
            f"- 9:16 video: `{item.get('video9x16Path')}`",
            f"- Podcast audio: `{item.get('podcastAudioPath')}`",
            f"- Shorts: `{item.get('shortsPath')}`",
            "",
            "Copyable local decision note:",
            "",
            "```yaml",
            str(item.get("copyableDecisionTemplate") or ""),
            "```",
            "",
            f"Truth: {item.get('truth')}",
            "",
        ])
    lines.extend([
        "## Explicit non-claims",
        "",
        "- This checklist does not approve publishing.",
        "- This checklist does not upload or schedule anything.",
        "- This checklist does not create platform receipt truth.",
        "- This checklist does not overwrite versions or mutate original/source media.",
        "",
        str(checklist.get("truth") or ""),
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_duration_warning_cards(payload: dict[str, Any], path: Path) -> None:
    deck = as_dict(payload.get("durationWarningCards"))
    lines = [
        "# Studio duration warning cards",
        "",
        deck.get("headline", ""),
        "",
        deck.get("plainEnglish", ""),
        "",
        "> Local review routing only. These cards do not approve, promote, trim, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        "## Counts",
    ]
    for key, value in as_dict(deck.get("counts")).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Allowed local decisions"])
    for item in as_list(deck.get("allowedLocalDecisions")):
        lines.append(f"- `{item}`")
    lines.extend(["", "## Cards"])
    for card in as_list(deck.get("cards")):
        if not isinstance(card, dict):
            continue
        artifacts = "\n".join(f"- {line}" for line in as_list(card.get("artifactSummary"))) or "- No artifact summary available."
        commands = []
        for command in as_list(card.get("candidateCommands")):
            if isinstance(command, dict):
                commands.extend([
                    f"- {command.get('label')} (`{command.get('kind')}`)",
                    f"  - `{command.get('command')}`",
                    f"  - Safety: {command.get('safety')}",
                ])
        lines.extend([
            "",
            f"### {card.get('rank')}. Episode {safe_int(card.get('episode')):02d} {card.get('currentVersion')} -> {card.get('candidateVersion')}",
            "",
            f"- Route: `{card.get('route')}`",
            f"- Candidate status: `{card.get('candidateStatus')}`",
            f"- Current spread: `{card.get('spreadLabel')}`",
            f"- Candidate spread seconds: `{card.get('candidateDurationSpreadSeconds')}`",
            f"- Candidate already exists: `{card.get('candidateAlreadyExists')}`",
            f"- Candidate review: `{card.get('candidateReviewHtmlPath')}`",
            f"- Candidate manifest: `{card.get('candidateManifestPath')}`",
            f"- Open first: `{card.get('firstOpenCommand')}`",
            f"- Human question: {card.get('humanQuestion')}",
            f"- Codex-safe move: {card.get('codexSafeMove')}",
            "",
            "Artifacts:",
            artifacts,
            "",
            "Candidate commands (human confirmation required):",
            *(commands or ["- No candidate commands staged."]),
            "",
            "Copyable duration warning note:",
            "",
            "```yaml",
            str(card.get("localDurationWarningNoteYaml") or ""),
            "```",
            "",
            f"Truth: {card.get('truth')}",
        ])
    lines.extend(["", "## Do not do"])
    for item in as_list(deck.get("doNotDo")):
        lines.append(f"- {item}")
    lines.extend(["", "## Truth", "", str(deck.get("truth") or "")])
    path.write_text("\n".join(str(line) for line in lines).rstrip() + "\n", encoding="utf-8")


def write_reviewer_return_handoff(payload: dict[str, Any], path: Path) -> None:
    counts = payload["counts"]
    human_runway = as_dict(payload.get("humanReviewerRunway"))
    human_rows = [row for row in as_list(human_runway.get("rows")) if isinstance(row, dict)]
    work_tasks = [task for task in as_list(payload.get("workTasks")) if isinstance(task, dict)]
    first_command = str(human_runway.get("firstOpenCommand") or as_dict(payload.get("firstSafeAction")).get("command") or "")
    lines = [
        "# Studio reviewer return handoff",
        "",
        "Open this when you want to resume Episode 1-6 review without decoding every board first.",
        "",
        "> Local review only. This does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        f"- Updated: `{payload['updatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- First move: {human_runway.get('firstMove') or payload.get('nextSafestAction')}",
        f"- Open first: `{first_command}`",
        f"- Full review session: `{payload.get('htmlPath') or ''}`",
        f"- Human reviewer runway: `{payload.get('humanReviewerRunwayPath') or ''}`",
        f"- Review worksheet: `{payload.get('reviewWorksheetPath') or ''}`",
        f"- Review decision cards: `{payload.get('reviewDecisionCardsPath') or ''}`",
        f"- Reviewer daily checklist: `{payload.get('reviewerDailyChecklistPath') or ''}`",
        f"- Duration warning cards: `{payload.get('durationWarningCardsPath') or ''}`",
        "",
        "## Current Studio truth",
        "",
        f"- Current-best packages: `{counts.get('currentBestPackages', 0)}`",
        f"- Reviewable packages: `{counts.get('reviewablePackages', 0)}`",
        f"- Ready shorts: `{counts.get('readyShorts', 0)}`",
        f"- Publish-blocked packages: `{counts.get('publishBlockedPackages', 0)}`",
        f"- Warning episodes: `{counts.get('warningEpisodes', 0)}`",
        f"- Pending review rows: `{counts.get('pendingReviewRows', 0)}`",
        f"- Duration workorders: `{counts.get('durationWorkorders', 0)}`",
        f"- Sync comparison points: `{counts.get('syncComparisonPoints', 0)}`",
        f"- Review decision cards: `{counts.get('reviewDecisionCards', 0)}`",
        f"- Receipt slots: `{counts.get('receiptSlots', 0)}`",
        f"- Captured receipts: `{counts.get('capturedReceipts', 0)}`",
        "",
        "## Review rhythm",
        "",
    ]
    for step in as_list(as_dict(payload.get("workSessionPlan")).get("rhythm")):
        lines.append(f"- {step}")
    lines.extend(["", "## Watch/review order", ""])
    if not human_rows:
        lines.append("No human reviewer runway rows are available. Open the full review session.")
    for row in human_rows[:8]:
        blocked = ", ".join(str(item) for item in as_list(row.get("notAllowedYet"))) or "external publication actions"
        allowed = ", ".join(str(item) for item in as_list(row.get("allowedLocalDecisions"))) or "review/refine/hold/needs-more-evidence"
        lines.extend([
            f"### {row.get('priority')}. {row.get('label')} · {row.get('versionDisplay')}",
            "",
            f"- Mode: `{row.get('reviewMode')}`",
            f"- Status: `{row.get('status')}`",
            f"- Publish gate: `{row.get('publishGate')}`",
            f"- Duration: `{row.get('durationSpreadLabel')}` (`{row.get('durationSeverity')}`)",
            f"- Shorts ready: `{row.get('readyShorts')}`",
            f"- Decision prompt: {row.get('decisionPrompt')}",
            f"- Decision card: `episode-{safe_int(row.get('episode')):02d}-local-review-decision-card`",
            f"- Allowed local decisions: `{allowed}`",
            f"- Not allowed yet: `{blocked}`",
            f"- Next safest action: {row.get('nextSafestAction')}",
            "",
            "Open evidence:",
            "",
            "```bash",
            str(row.get("openCommand") or ""),
            "```",
            "",
        ])
    lines.extend(["## Safe Codex work while Charlie is away", ""])
    for task in work_tasks[:5]:
        action = as_dict(task.get("firstAction"))
        lines.extend([
            f"### {task.get('rank')}. {task.get('title')}",
            "",
            f"- Lane: `{task.get('lane')}`",
            f"- Owner: `{task.get('owner')}`",
            f"- Codex can safely do: {task.get('codexParallelWork')}",
            f"- Evidence: `{action.get('command') or ''}`",
            f"- Caution: {task.get('caution')}",
            "",
        ])
    lines.extend([
        "## Explicit non-claims",
        "",
        "- No package was approved or promoted.",
        "- No repair or export was executed by this handoff.",
        "- No external upload, publication, schedule, account mutation, or receipt capture happened.",
        "- No original media or source file was mutated.",
        "- Current-best package truth remains separate from review target truth.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_markdown(payload: dict[str, Any], path: Path) -> None:
    counts = payload["counts"]
    lines = [
        "# Studio review work session",
        "",
        f"- Updated: `{payload['updatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Current-best packages: `{counts['currentBestPackages']}`",
        f"- Ready shorts: `{counts['readyShorts']}`",
        f"- Publish-blocked packages: `{counts['publishBlockedPackages']}`",
        f"- Receipt truth created: `{counts['receiptTruthCreated']}`",
        f"- Review worksheet: `{payload.get('reviewWorksheetPath') or ''}`",
        f"- Episode package runway: `{payload.get('episodePackageRunwayPath') or ''}`",
        f"- Human reviewer runway: `{payload.get('humanReviewerRunwayPath') or ''}`",
        f"- Review decision cards: `{payload.get('reviewDecisionCardsPath') or ''}`",
        f"- Duration warning cards: `{payload.get('durationWarningCardsPath') or ''}`",
        "",
        payload["humanAsk"],
        "",
        "## 25-minute rhythm",
        "",
    ]
    for step in payload["workSessionPlan"]["rhythm"]:
        lines.append(f"- {step}")
    lines.extend(["", "## Episode package runway", ""])
    for row in as_list(payload.get("episodePackageRunway")):
        if not isinstance(row, dict):
            continue
        lines.append(
            f"- Episode {row.get('episode')} `{row.get('versionDisplay')}` · "
            f"{row.get('status')} · {row.get('readyShorts')} shorts · "
            f"{row.get('warnings')} warning(s) · next: {row.get('nextSafestAction')}"
        )
    human_runway = as_dict(payload.get("humanReviewerRunway"))
    lines.extend(["", "## Human reviewer runway", "", human_runway.get("plainEnglish", ""), ""])
    lines.append(f"- First move: {human_runway.get('firstMove', '')}")
    lines.append(f"- Open: `{human_runway.get('firstOpenCommand', '')}`")
    for row in as_list(human_runway.get("rows")):
        if isinstance(row, dict):
            lines.append(
                f"- {row.get('priority')}. Episode {row.get('episode')} `{row.get('reviewMode')}` · "
                f"{row.get('decisionPrompt')} · open: `{row.get('openCommand')}`"
            )
    lines.extend(["", "## Work tasks", ""])
    for task in payload["workTasks"]:
        action = as_dict(task.get("firstAction"))
        lines.extend([
            f"### {task['rank']}. {task['title']}",
            "",
            f"- Lane: `{task['lane']}`",
            f"- Owner: `{task['owner']}`",
            f"- Status: `{task['status']}`",
            f"- Why: {task['whyThisMatters']}",
            f"- First action: {action.get('label') or ''}",
            f"- Command: `{action.get('command') or ''}`",
            f"- Decision question: {task['decisionQuestion']}",
            f"- Done when: {task['doneWhen']}",
            f"- Codex can safely do: {task['codexParallelWork']}",
            f"- Caution: {task['caution']}",
            "",
        ])
        options = [item for item in as_list(task.get("decisionOptions")) if isinstance(item, dict)]
        if options:
            lines.append("Decision options:")
            for option in options:
                lines.append(f"- `{option.get('key')}` - {option.get('label')}: {option.get('means')}")
            lines.append("")
    lines.extend([
        "## Safety truth",
        "",
        "This packet is local guidance only. It does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_review_worksheet(payload: dict[str, Any], path: Path) -> None:
    lines = [
        "# Studio review worksheet",
        "",
        "> Local worksheet only. This does not approve, promote, repair, export, publish, upload, schedule, mutate accounts, overwrite versions, delete files, capture receipts, or touch original media.",
        "",
        f"Updated: `{payload['updatedAt']}`",
        f"Release root: `{payload['releaseRoot']}`",
        "",
        "## Session rhythm",
        "",
    ]
    for step in payload["workSessionPlan"]["rhythm"]:
        lines.append(f"- [ ] {step}")
    human_runway = as_dict(payload.get("humanReviewerRunway"))
    lines.extend([
        "",
        "## Human reviewer runway",
        "",
        f"- First move: {human_runway.get('firstMove', '')}",
        "",
        "```bash",
        str(human_runway.get("firstOpenCommand") or ""),
        "```",
        "",
    ])
    for row in as_list(human_runway.get("rows")):
        if isinstance(row, dict):
            lines.extend([
                f"### {row.get('priority')}. {row.get('label')} · {row.get('reviewMode')}",
                "",
                f"- Decision prompt: {row.get('decisionPrompt')}",
                f"- Decision card id: `episode-{safe_int(row.get('episode')):02d}-local-review-decision-card`",
                f"- Publish gate: `{row.get('publishGate')}`",
                f"- Local evidence: `{row.get('openPath')}`",
                "",
            ])
    lines.extend([
        "",
        "## Decisions",
        "",
    ])
    for task in payload["workTasks"]:
        action = as_dict(task.get("firstAction"))
        lines.extend([
            f"### {task['rank']}. {task['title']}",
            "",
            f"- Lane: `{task['lane']}`",
            f"- Owner: `{task['owner']}`",
            f"- Status: `{task['status']}`",
            f"- Why: {task['whyThisMatters']}",
            f"- Evidence: `{action.get('path') or ''}`",
            "",
            "Open evidence:",
            "",
            "```bash",
            str(action.get("command") or ""),
            "```",
            "",
            f"Decision question: {task['decisionQuestion']}",
            "",
            "Choose one local classification:",
            "",
        ])
        options = [item for item in as_list(task.get("decisionOptions")) if isinstance(item, dict)]
        if options:
            for option in options:
                lines.append(f"- [ ] `{option.get('key')}` - {option.get('label')}: {option.get('means')}")
        else:
            lines.extend([
                "- [ ] Review",
                "- [ ] Refine",
                "- [ ] Hold",
                "- [ ] Need more evidence",
            ])
        lines.extend([
            "",
            "Evidence notes:",
            "",
            "- Beginning:",
            "- Middle:",
            "- Ending:",
            "- Audio:",
            "- Sync:",
            "- Human concern:",
            "",
            "Next safe action:",
            "",
            "- ",
            "",
            f"Caution: {task['caution']}",
            "",
        ])
    lines.extend([
        "## Boundary",
        "",
        "A checked box here is review evidence, not package approval, Tower approval, publication, schedule, upload, or receipt truth.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_html(payload: dict[str, Any], path: Path) -> None:
    counts = payload["counts"]
    task_cards = []
    for task in payload["workTasks"]:
        action = as_dict(task.get("firstAction"))
        options = "".join(
            f"<li><strong>{esc(option.get('label'))}</strong><br><span>{esc(option.get('means'))}</span><br><em>{esc(option.get('watchFor'))}</em></li>"
            for option in as_list(task.get("decisionOptions")) if isinstance(option, dict)
        )
        task_cards.append(f"""
        <section class=\"task\">
          <div class=\"rank\">{esc(task['rank'])}</div>
          <div class=\"task-body\">
            <p class=\"eyebrow\">{esc(task['lane'])} · {esc(task['owner'])} · {esc(task['status'])}</p>
            <h2>{esc(task['title'])}</h2>
            <p>{esc(task['whyThisMatters'])}</p>
            <div class=\"action\"><strong>{esc(action.get('label'))}</strong><code>{esc(action.get('command'))}</code><span>{esc(action.get('safety'))}</span></div>
            <p><strong>Decision:</strong> {esc(task['decisionQuestion'])}</p>
            <p><strong>Done when:</strong> {esc(task['doneWhen'])}</p>
            <p><strong>Codex lane:</strong> {esc(task['codexParallelWork'])}</p>
            {('<ul class=\"options\">' + options + '</ul>') if options else ''}
            <p class=\"caution\">{esc(task['caution'])}</p>
          </div>
        </section>
        """)
    rhythm = "".join(f"<li>{esc(step)}</li>" for step in payload["workSessionPlan"]["rhythm"])
    worksheet_path = str(payload.get("reviewWorksheetPath") or "")
    worksheet_link = f"<a class=\"worksheet\" href=\"{Path(worksheet_path).resolve().as_uri()}\">Open review worksheet</a>" if worksheet_path else ""
    runway_path = str(payload.get("episodePackageRunwayPath") or "")
    runway_link = f"<a class=\"worksheet\" href=\"{Path(runway_path).resolve().as_uri()}\">Open episode package runway</a>" if runway_path else ""
    human_runway_path = str(payload.get("humanReviewerRunwayPath") or "")
    human_runway_link = f"<a class=\"worksheet\" href=\"{Path(human_runway_path).resolve().as_uri()}\">Open human reviewer runway</a>" if human_runway_path else ""
    decision_cards_path = str(payload.get("reviewDecisionCardsPath") or "")
    decision_cards_link = f"<a class=\"worksheet\" href=\"{Path(decision_cards_path).resolve().as_uri()}\">Open review decision cards</a>" if decision_cards_path else ""
    runway_rows = []
    for row in as_list(payload.get("episodePackageRunway")):
        if not isinstance(row, dict):
            continue
        primary_command = str(row.get("primaryActionCommand") or "")
        command_link = ""
        action_path = str(row.get("primaryActionPath") or row.get("versionDir") or "")
        if action_path:
            command_link = f"<a href=\"{Path(action_path).resolve().as_uri()}\">Open evidence</a>"
        runway_rows.append(f"""
          <tr>
            <td><strong>{esc(row.get('label'))}</strong><br><span>{esc(row.get('versionDisplay'))}</span></td>
            <td><span class=\"pill\">{esc(row.get('status'))}</span><br><span>{esc(row.get('reviewReadiness'))}</span></td>
            <td>{esc(row.get('publishReadiness') or row.get('publishReadinessStatus'))}<br><span>{esc(row.get('durationSpreadLabel'))} · {esc(row.get('durationSeverity'))}</span></td>
            <td><strong>{esc(row.get('readyShorts'))}</strong> shorts<br><span>{esc(row.get('warnings'))} warning(s)</span></td>
            <td>{esc(row.get('nextSafestAction'))}<br>{command_link}<code>{esc(primary_command)}</code></td>
          </tr>
        """)
    human_reviewer_runway = as_dict(payload.get("humanReviewerRunway"))
    human_rows = []
    for row in as_list(human_reviewer_runway.get("rows")):
        if not isinstance(row, dict):
            continue
        action_path = str(row.get("openPath") or row.get("versionDir") or "")
        command_link = f"<a href=\"{Path(action_path).resolve().as_uri()}\">Open evidence</a>" if action_path else ""
        human_rows.append(f"""
          <tr>
            <td><strong>{esc(row.get('priority'))}. {esc(row.get('label'))}</strong><br><span>{esc(row.get('versionDisplay'))}</span></td>
            <td><span class=\"pill\">{esc(row.get('reviewMode'))}</span><br><span>{esc(row.get('reviewReadiness'))}</span></td>
            <td>{esc(row.get('decisionPrompt'))}<br><span>Decision card: episode-{safe_int(row.get('episode')):02d}-local-review-decision-card</span><br><span>Blocked: publish/upload/schedule/receipts</span></td>
            <td>{command_link}<code>{esc(row.get('openCommand'))}</code></td>
          </tr>
        """)
    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <title>Studio review work session</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111713; --card:#19221c; --ink:#f4ead7; --muted:#b9ad92; --gold:#e2bd45; --leaf:#6fcf89; --clay:#c56a4a; --line:#334234; }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; background:radial-gradient(circle at top left,#253a2d,#111713 42%,#0b0f0c); color:var(--ink); }}
    main {{ max-width:1180px; margin:0 auto; padding:40px 24px 64px; }}
    header {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(25,34,28,.96),rgba(36,31,20,.92)); border-radius:28px; padding:28px; box-shadow:0 20px 80px rgba(0,0,0,.3); }}
    h1 {{ margin:0 0 10px; font-size:42px; letter-spacing:-.04em; }}
    h2 {{ margin:0 0 8px; font-size:24px; }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:800; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:22px; }}
    .metric {{ background:#101612; border:1px solid var(--line); border-radius:18px; padding:14px; }}
    .metric strong {{ display:block; color:var(--leaf); font-size:28px; }}
    .plan, .task {{ margin-top:18px; border:1px solid var(--line); background:rgba(25,34,28,.86); border-radius:24px; padding:22px; }}
    .plan ul {{ margin:12px 0 0; padding-left:22px; color:var(--muted); }}
    .task {{ display:grid; grid-template-columns:52px 1fr; gap:18px; }}
    .rank {{ width:42px; height:42px; border-radius:14px; display:grid; place-items:center; background:rgba(226,189,69,.16); color:var(--gold); font-weight:900; }}
    .task p {{ color:var(--muted); line-height:1.45; }}
    .action {{ display:grid; gap:8px; background:#0c120e; border:1px solid var(--line); border-radius:16px; padding:14px; margin:12px 0; }}
    code {{ white-space:pre-wrap; color:#c8f7d8; }}
    .options {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px; padding:0; list-style:none; }}
    .options li {{ border:1px solid rgba(226,189,69,.24); background:rgba(226,189,69,.08); border-radius:16px; padding:12px; }}
    .options span, .options em {{ color:var(--muted); }}
    .caution {{ color:#ffd3c2 !important; }}
    .worksheet {{ display:inline-block; margin-top:14px; color:#0d150f; background:var(--leaf); border-radius:999px; padding:10px 14px; text-decoration:none; font-weight:900; }}
    .runway {{ width:100%; border-collapse:collapse; margin-top:14px; overflow:hidden; border-radius:18px; }}
    .runway th, .runway td {{ text-align:left; vertical-align:top; border-bottom:1px solid var(--line); padding:12px; }}
    .runway th {{ color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:11px; }}
    .runway span {{ color:var(--muted); }}
    .runway code {{ display:block; margin-top:6px; max-width:460px; font-size:11px; color:#c8f7d8; }}
    .runway a {{ color:var(--leaf); font-weight:800; text-decoration:none; }}
    .pill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:4px 8px; background:#0c120e; color:var(--ink) !important; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class=\"eyebrow\">Quipsly Studio · Local review only</p>
    <h1>Studio review work session</h1>
    <p>{esc(payload['humanAsk'])}</p>
    <div class=\"grid\">
      <div class=\"metric\"><strong>{counts['currentBestPackages']}</strong>current-best packages</div>
      <div class=\"metric\"><strong>{counts['readyShorts']}</strong>ready shorts</div>
      <div class=\"metric\"><strong>{counts['publishBlockedPackages']}</strong>publish-blocked packages</div>
      <div class=\"metric\"><strong>{counts['capturedReceipts']}</strong>captured receipts</div>
    </div>
  </header>
  <section class=\"plan\">
    <p class=\"eyebrow\">25-minute rhythm</p>
    <h2>{esc(payload['workSessionPlan']['plainEnglish'])}</h2>
    <ul>{rhythm}</ul>
    {worksheet_link}
    {runway_link}
    {human_runway_link}
    {decision_cards_link}
  </section>
  <section class=\"plan\">
    <p class=\"eyebrow\">Human reviewer runway</p>
    <h2>{esc(human_reviewer_runway.get('plainEnglish'))}</h2>
    <p><strong>First move:</strong> {esc(human_reviewer_runway.get('firstMove'))}</p>
    <table class=\"runway\">
      <thead><tr><th>Order</th><th>Mode</th><th>Decision prompt</th><th>Evidence</th></tr></thead>
      <tbody>{''.join(human_rows)}</tbody>
    </table>
  </section>
  <section class=\"plan\">
    <p class=\"eyebrow\">Episode 1-6 package runway</p>
    <h2>Open the right package, see the gate, take the safest next step.</h2>
    <table class=\"runway\">
      <thead><tr><th>Episode</th><th>Review state</th><th>Publish gate</th><th>Shorts</th><th>Next action</th></tr></thead>
      <tbody>{''.join(runway_rows)}</tbody>
    </table>
  </section>
  {''.join(task_cards)}
</main>
</body>
</html>
"""
    path.write_text(html_doc, encoding="utf-8")


def build(release_root: Path) -> dict[str, Any]:
    session_dir = release_root / "review-board" / "studio-review-work-sessions" / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(release_root, session_dir)
    write_json(session_dir / "studio-review-work-session.json", payload)
    write_markdown(payload, session_dir / "START-HERE-studio-review-work-session.md")
    write_review_worksheet(payload, session_dir / "review-worksheet.md")
    write_episode_package_runway(payload, session_dir / "episode-package-runway.md")
    write_human_reviewer_runway(payload, session_dir / "HUMAN-REVIEWER-RUNWAY.md")
    write_review_decision_cards(payload, session_dir / "REVIEW-DECISION-CARDS.md")
    write_reviewer_daily_checklist(payload, session_dir / "REVIEWER-DAILY-CHECKLIST.md")
    write_duration_warning_cards(payload, session_dir / "DURATION-WARNING-CARDS.md")
    write_reviewer_return_handoff(payload, session_dir / "REVIEWER-RETURN-HANDOFF.md")
    write_html(payload, session_dir / "index.html")
    write_csv(payload, session_dir / "studio-review-work-session.csv")
    write_json(release_root / "review-board" / "studio-review-work-sessions" / "latest-studio-review-work-session.json", payload)
    write_json(release_root / "review-board" / "latest-studio-review-work-session.json", payload)
    return payload


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RELEASE_ROOT
    payload = build(release_root)
    print(json.dumps({
        "status": payload["status"],
        "counts": payload["counts"],
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "reviewDecisionCardsPath": payload["reviewDecisionCardsPath"],
        "reviewerDailyChecklistPath": payload["reviewerDailyChecklistPath"],
        "durationWarningCardsPath": payload["durationWarningCardsPath"],
        "reviewerReturnHandoffPath": payload["reviewerReturnHandoffPath"],
        "pointerPath": payload["pointerPath"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "truth": payload["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
