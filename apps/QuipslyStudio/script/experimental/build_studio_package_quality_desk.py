#!/usr/bin/env python3
"""Build a local Studio package-quality desk for Episodes 1-6.

This script is intentionally read-only. It joins the existing release package,
review, validation, duration, sync, and Tower packet artifacts into one calm
front door. It does not export, repair, approve, publish, schedule, upload,
mutate accounts, capture receipts, or touch original media.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.package-quality-desk.v1"
PLATFORMS = [
    "YouTube",
    "Podcast/RSS",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
    "HighGroundOdyssey.com",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def list_dicts(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    raw = payload.get(key)
    return [item for item in raw if isinstance(item, dict)] if isinstance(raw, list) else []


def index_by_episode(payload: dict[str, Any]) -> dict[int, dict[str, Any]]:
    indexed: dict[int, dict[str, Any]] = {}
    for item in list_dicts(payload, "episodes"):
        episode = safe_int(item.get("episode"))
        if episode:
            indexed[episode] = item
    return indexed


def latest_version_dir(episode_dir: Path) -> Path | None:
    if not episode_dir.exists():
        return None
    candidates = sorted(
        [path for path in episode_dir.glob("v*") if path.is_dir()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def duration_label(seconds: Any) -> str:
    value = safe_float(seconds, 0.0)
    minutes, secs = divmod(int(round(value)), 60)
    hours, mins = divmod(minutes, 60)
    if hours:
        return f"{hours}:{mins:02d}:{secs:02d}"
    return f"{mins}:{secs:02d}"


def collect_unique(*values: Any) -> list[Any]:
    collected: list[Any] = []
    for value in values:
        if isinstance(value, list):
            for item in value:
                if item and item not in collected:
                    collected.append(item)
    return collected


def artifact_duration_map(board_episode: dict[str, Any]) -> dict[str, float]:
    artifacts = board_episode.get("artifacts") if isinstance(board_episode.get("artifacts"), dict) else {}
    durations: dict[str, float] = {}
    for key, artifact in artifacts.items():
        if isinstance(artifact, dict):
            durations[str(key)] = safe_float(artifact.get("durationSeconds"), 0.0)
    return durations


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).as_uri()
    except ValueError:
        return "file://" + quote(path_value)


def path_exists(path_value: str) -> bool:
    return bool(path_value) and Path(path_value).exists()


def media_kind(key: str, item: dict[str, Any]) -> str:
    if item.get("hasVideo") and item.get("hasAudio"):
        return "video+audio"
    if item.get("hasVideo"):
        return "video"
    if item.get("hasAudio"):
        return "audio"
    if "short" in key.lower():
        return "short"
    return "artifact"


def load_package_manifest(version_dir: str) -> dict[str, Any]:
    if not version_dir:
        return {}
    return load_json(Path(version_dir) / "manifest.json")


def media_row(key: str, item: dict[str, Any]) -> dict[str, Any]:
    path = str(item.get("path") or "")
    return {
        "id": key,
        "label": str(item.get("title") or item.get("label") or key),
        "kind": media_kind(key, item),
        "path": path,
        "uri": file_uri(path),
        "exists": bool(item.get("exists")) and path_exists(path),
        "durationSeconds": round(safe_float(item.get("durationSeconds"), 0.0), 3),
        "durationLabel": duration_label(item.get("durationSeconds")),
        "bytes": safe_int(item.get("bytes") or item.get("sizeBytes")),
        "hasAudio": bool(item.get("hasAudio")),
        "hasVideo": bool(item.get("hasVideo")),
        "codecSummary": item.get("codecSummary") if isinstance(item.get("codecSummary"), list) else [],
    }


def build_media_review_checklist(version_dir: str, manifest: dict[str, Any]) -> dict[str, Any]:
    version_path = Path(version_dir) if version_dir else Path()
    artifacts = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}
    artifact_rows = [media_row(str(key), artifact) for key, artifact in artifacts.items() if isinstance(artifact, dict)]
    artifact_by_id = {row["id"]: row for row in artifact_rows}
    shorts = manifest.get("shorts") if isinstance(manifest.get("shorts"), list) else []
    short_rows = [media_row(f"short-{index + 1:02d}", short) for index, short in enumerate(shorts) if isinstance(short, dict)]
    shorts_dir = ""
    if short_rows:
        shorts_dir = str(Path(short_rows[0]["path"]).parent)
    elif version_dir and (version_path / "shorts").exists():
        shorts_dir = str(version_path / "shorts")
    platform_prep_dir = str(version_path / "platform-prep") if version_dir and (version_path / "platform-prep").exists() else ""
    publish_packet_dirs = sorted(
        [str(path) for path in version_path.glob("*publish-packet") if path.is_dir()]
    ) if version_dir and version_path.exists() else []
    social_ready_dirs = sorted(
        [str(path) for path in version_path.glob("*social-ready") if path.is_dir()]
    ) if version_dir and version_path.exists() else []
    podcast_ready_dirs = sorted(
        [str(path) for path in version_path.glob("*podcast-ready") if path.is_dir()]
    ) if version_dir and version_path.exists() else []
    manifest_path = str(version_path / "manifest.json") if version_dir else ""
    notes_path = str(version_path / "notes.md") if version_dir and (version_path / "notes.md").exists() else ""
    sync_gap_path = str(version_path / "sync-gap-report.md") if version_dir and (version_path / "sync-gap-report.md").exists() else ""
    missing_media_path = str(version_path / "missing-media-and-sync-notes.md") if version_dir and (version_path / "missing-media-and-sync-notes.md").exists() else ""
    publication_cockpit_path = str(version_path / "PUBLICATION-COCKPIT.md") if version_dir and (version_path / "PUBLICATION-COCKPIT.md").exists() else ""

    def action(label: str, artifact_id: str, check: str) -> dict[str, Any]:
        row = artifact_by_id.get(artifact_id, {})
        return {
            "label": label,
            "artifactId": artifact_id,
            "path": row.get("path") or "",
            "uri": row.get("uri") or "",
            "exists": row.get("exists", False),
            "durationLabel": row.get("durationLabel") or "0:00",
            "check": check,
        }

    review_sequence = [
        action("1. Watch 16:9 long-form master", "videoMaster16x9", "Check opening, two middle jumps, ending, audio presence, and whether the edit feels publishable."),
        action("2. Listen to podcast audio", "audioOnlyPodcast", "Check the same beginning/middle/ending points for sync, gaps, extra tail, and obvious quality issues."),
        action("3. Watch 9:16 vertical master", "videoMaster9x16", "Check framing, face position, captions/text overlap, and whether it can serve as the vertical episode cut."),
    ]
    if short_rows:
        review_sequence.append({
            "label": f"4. Review {len(short_rows)} short(s)",
            "artifactId": "shorts",
            "path": shorts_dir,
            "uri": file_uri(shorts_dir),
            "exists": path_exists(shorts_dir),
            "durationLabel": ", ".join(row["durationLabel"] for row in short_rows[:5]) + ("..." if len(short_rows) > 5 else ""),
            "check": "Open shorts from the folder or Shorts Review Cockpit; judge hook, crop, sound, caption safety, and platform fit.",
        })
    review_sequence.append({
        "label": "5. Read package notes",
        "artifactId": "manifest-notes",
        "path": notes_path or manifest_path,
        "uri": file_uri(notes_path or manifest_path),
        "exists": path_exists(notes_path or manifest_path),
        "durationLabel": "",
        "check": "Use notes, sync-gap report, and missing-media notes as context. They are evidence, not approval.",
    })

    return {
        "versionDir": version_dir,
        "manifestPath": manifest_path,
        "manifestExists": path_exists(manifest_path),
        "notesPath": notes_path,
        "syncGapReportPath": sync_gap_path,
        "missingMediaNotesPath": missing_media_path,
        "publicationCockpitPath": publication_cockpit_path,
        "platformPrepDir": platform_prep_dir,
        "publishPacketDirs": publish_packet_dirs,
        "socialReadyDirs": social_ready_dirs,
        "podcastReadyDirs": podcast_ready_dirs,
        "shortsDir": shorts_dir,
        "artifactRows": artifact_rows,
        "shortRows": short_rows,
        "reviewSequence": review_sequence,
        "gapSummary": manifest.get("gapSummary") if isinstance(manifest.get("gapSummary"), list) else [],
        "sourcePolicy": manifest.get("sourcePolicy") or "",
        "publicationTruth": manifest.get("publicationTruth") or "Local readiness is not publication.",
        "longFormDurationAlignmentReady": bool(manifest.get("longFormDurationAlignmentReady")),
        "longFormDurationSpreadSeconds": round(safe_float(manifest.get("longFormDurationSpreadSeconds"), 0.0), 3),
        "allPrimaryMediaExists": all(item.get("exists") for item in review_sequence[:3]),
        "safeReviewerSummary": "Watch/listen the exact artifacts below before recording approve/refine/hold. Do not infer publication from package existence.",
    }


def review_summary(ledger_episode: dict[str, Any]) -> dict[str, Any]:
    counts = {"pending": 0, "approved": 0, "hold": 0, "refine": 0, "reject": 0}
    first_pending = ""
    artifacts = ledger_episode.get("reviewArtifacts") if isinstance(ledger_episode.get("reviewArtifacts"), list) else []
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            continue
        decision = str(artifact.get("decision") or "pending").lower()
        if decision == "approve":
            counts["approved"] += 1
        elif decision in {"hold", "refine", "reject"}:
            counts[decision] += 1
        else:
            counts["pending"] += 1
            if not first_pending:
                first_pending = str(artifact.get("id") or "")
    return {
        "counts": counts,
        "pendingArtifactId": first_pending,
        "artifactCount": len([item for item in artifacts if isinstance(item, dict)]),
        "blockingCount": counts["hold"] + counts["refine"] + counts["reject"],
    }


def receipt_summary(ledger_episode: dict[str, Any]) -> dict[str, Any]:
    slots = ledger_episode.get("receiptSlots") if isinstance(ledger_episode.get("receiptSlots"), list) else []
    captured = 0
    for slot in slots:
        if isinstance(slot, dict) and (slot.get("url") or slot.get("providerId")):
            captured += 1
    return {"receiptSlots": len(slots), "capturedReceipts": captured}


def duration_spread_severity(seconds: Any) -> dict[str, Any]:
    spread = safe_float(seconds, 0.0)
    if spread >= 1800:
        return {
            "level": "critical",
            "label": "major A/V spread",
            "plain": "Do not publish until the long-form video/audio boundary or sync intent is confirmed.",
        }
    if spread >= 120:
        return {
            "level": "high",
            "label": "duration decision needed",
            "plain": "Review the extra tail or shorter boundary before treating the package as publishable.",
        }
    if spread >= 10:
        return {
            "level": "warning",
            "label": "duration warning",
            "plain": "Review the A/V spread before approval; this may be intentional but needs a recorded decision.",
        }
    if spread >= 1:
        return {
            "level": "attention",
            "label": "minor duration spread",
            "plain": "Check the end boundary if this episode is heading toward publication.",
        }
    return {
        "level": "ok",
        "label": "aligned",
        "plain": "No meaningful long-form A/V spread detected by the package desk.",
    }


def review_readiness_for_card(card: dict[str, Any]) -> dict[str, Any]:
    checklist = card.get("mediaReviewChecklist") if isinstance(card.get("mediaReviewChecklist"), dict) else {}
    if safe_int(card.get("blockerCount")):
        return {
            "status": "not-reviewable-local-blocker",
            "label": "Not reviewable yet",
            "plain": "The local package has blockers. Fix or route around those before asking a human to approve/refine/hold.",
        }
    if not card.get("hasManifest"):
        return {
            "status": "not-reviewable-missing-manifest",
            "label": "Missing manifest",
            "plain": "The current-best package folder does not expose a manifest, so reviewers do not have enough evidence.",
        }
    if not checklist.get("allPrimaryMediaExists", False):
        return {
            "status": "reviewable-with-file-attention",
            "label": "Reviewable, but check files",
            "plain": "A reviewer can inspect the package, but at least one primary artifact link needs attention.",
        }
    if safe_int(card.get("warningCount")):
        return {
            "status": "reviewable-with-warnings",
            "label": "Reviewable with warnings",
            "plain": "The package can be watched/listened locally, but the warnings must be judged before publishing prep.",
        }
    return {
        "status": "reviewable",
        "label": "Reviewable",
        "plain": "The local package has enough evidence for a human/agent watch-listen pass.",
    }


def publish_readiness_for_card(card: dict[str, Any]) -> dict[str, Any]:
    review = card.get("review") if isinstance(card.get("review"), dict) else {}
    counts = review.get("counts") if isinstance(review.get("counts"), dict) else {}
    severity = card.get("durationSpreadSeverity") if isinstance(card.get("durationSpreadSeverity"), dict) else {}
    if safe_int(card.get("blockerCount")):
        return {
            "status": "not-publish-ready-local-blocker",
            "label": "Not publish-ready",
            "plain": "Local package blockers must be fixed before publication packets can be trusted.",
        }
    if severity.get("level") in {"critical", "high", "warning", "attention"} or safe_int(card.get("warningCount")):
        return {
            "status": "not-publish-ready-duration-decision",
            "label": "Needs duration decision",
            "plain": severity.get("plain") or "Warnings must be resolved or explicitly accepted before publication prep.",
        }
    if safe_int(review.get("blockingCount")):
        return {
            "status": "not-publish-ready-review-blocking",
            "label": "Review says hold/refine",
            "plain": "A local review decision says this package needs work. Preserve old versions and create the next reversible improvement.",
        }
    if safe_int(counts.get("pending")):
        return {
            "status": "not-publish-ready-human-review",
            "label": "Needs review decision",
            "plain": "The package is locally reviewable, but a human/agent decision is still pending before Tower should prepare platform work.",
        }
    return {
        "status": "ready-for-manual-packet-prep",
        "label": "Packet-prep ready",
        "plain": "Local review evidence is clear enough to prepare manual platform packets. This is still not external publication or receipt truth.",
    }


def hydrate_duration_decision_affordances(cards: list[dict[str, Any]], duration_decision_sheet: dict[str, Any]) -> None:
    decisions_by_episode: dict[int, dict[str, Any]] = {}
    for item in duration_decision_sheet.get("episodes") if isinstance(duration_decision_sheet.get("episodes"), list) else []:
        if isinstance(item, dict):
            episode = safe_int(item.get("episode"))
            if episode:
                decisions_by_episode[episode] = item
    first = duration_decision_sheet.get("firstSafeAction") if isinstance(duration_decision_sheet.get("firstSafeAction"), dict) else {}

    for card in cards:
        spread = safe_float(card.get("durationSpreadSeconds"), 0.0)
        severity = duration_spread_severity(spread)
        episode = safe_int(card.get("episode"))
        decision = decisions_by_episode.get(episode, {})
        card["durationSpreadSeverity"] = severity
        card["durationDecision"] = decision
        if decision:
            card["durationDecisionPlain"] = decision.get("primaryDecision") or severity["plain"]
            card["durationDecisionNextAction"] = decision.get("nextSafestAction") or severity["plain"]
            if episode == safe_int(first.get("episode")):
                card["durationDecisionFirstOpenCommand"] = first.get("firstOpenCommand") or ""
                card["durationDecisionFirstReviewCommand"] = first.get("firstReviewCommand") or ""
        card["reviewReadiness"] = review_readiness_for_card(card)
        card["publishReadiness"] = publish_readiness_for_card(card)


def build_readiness_summary(cards: list[dict[str, Any]]) -> dict[str, Any]:
    current_best: dict[str, dict[str, Any]] = {}
    reviewable = 0
    packet_prep_ready = 0
    publish_blockers: list[dict[str, Any]] = []
    duration_decisions: list[dict[str, Any]] = []
    for card in cards:
        episode = safe_int(card.get("episode"))
        review_readiness = card.get("reviewReadiness") if isinstance(card.get("reviewReadiness"), dict) else {}
        publish_readiness = card.get("publishReadiness") if isinstance(card.get("publishReadiness"), dict) else {}
        if str(review_readiness.get("status") or "").startswith("reviewable"):
            reviewable += 1
        if publish_readiness.get("status") == "ready-for-manual-packet-prep":
            packet_prep_ready += 1
        else:
            publish_blockers.append({
                "episode": episode,
                "version": card.get("version"),
                "status": publish_readiness.get("status"),
                "label": publish_readiness.get("label"),
                "plain": publish_readiness.get("plain"),
                "nextSafestAction": card.get("nextSafestAction"),
            })
        if card.get("durationDecision") or safe_float(card.get("durationSpreadSeconds"), 0.0) >= 1:
            duration_decisions.append({
                "episode": episode,
                "version": card.get("version"),
                "spreadSeconds": card.get("durationSpreadSeconds"),
                "spreadLabel": card.get("durationSpreadLabel"),
                "severity": (card.get("durationSpreadSeverity") or {}).get("level"),
                "plain": card.get("durationDecisionPlain") or (card.get("durationSpreadSeverity") or {}).get("plain"),
                "nextSafestAction": card.get("durationDecisionNextAction") or card.get("nextSafestAction"),
            })
        current_best[str(episode)] = {
            "version": card.get("version"),
            "versionDir": card.get("versionDir"),
            "reviewReadiness": review_readiness,
            "publishReadiness": publish_readiness,
            "durationSpreadSeconds": card.get("durationSpreadSeconds"),
            "readyShortCount": card.get("readyShortCount"),
            "shortCount": card.get("shortCount"),
        }
    return {
        "reviewablePackages": reviewable,
        "packetPrepReadyPackages": packet_prep_ready,
        "publishBlockedPackages": len(publish_blockers),
        "publishBlockers": publish_blockers,
        "durationDecisionQueue": duration_decisions,
        "currentBestVersionByEpisode": current_best,
        "plain": "Review-ready means a local package can be inspected. Packet-prep-ready means local evidence is clear enough to prepare platform packets. Neither means published.",
    }


def commands_for_episode(episode: int, version_dir: str, review_artifact: str) -> list[dict[str, str]]:
    commands = []
    if version_dir:
        commands.append({
            "kind": "open",
            "label": "Open current-best package folder",
            "safety": "Local evidence only. No review ledger, receipt, export, publish, upload, schedule, or source file changes.",
            "command": f"open {shell_quote(version_dir)}",
        })
    if review_artifact:
        dry_run = f"./script/agentctl.sh tower-review-decision-dry-run {episode} {review_artifact} approve '<reviewer>' '<notes>'"
        execute = f"./script/agentctl.sh tower-review-decision {episode} {review_artifact} approve '<reviewer>' '<notes>'"
        commands.append({
            "kind": "review-dry-run",
            "label": "Preview local review decision",
            "safety": "Dry-run only. Shows the exact local review ledger change without writing it.",
            "command": dry_run,
        })
        commands.append({
            "kind": "review-execute-after-preview",
            "label": "Execute local review decision after preview",
            "safety": "Local review ledger metadata only. Still not publication, scheduling, upload, receipt truth, export, or source mutation.",
            "command": execute,
        })
    return commands


def default_human_ask(card: dict[str, Any]) -> str:
    episode = card.get("episode")
    status = str(card.get("status") or "")
    if status == "sync-investigation-first":
        return f"Classify Episode {episode}'s sync mismatch before any rebuild, trim, promotion, or publishing path."
    if status == "duration-workorder-ready":
        return f"Watch/listen the Episode {episode} duration evidence and choose hold, refine, or approve as a local review decision only."
    if status == "review-with-warnings":
        return f"Watch/listen Episode {episode}'s warning evidence and decide whether the warning is acceptable, needs refinement, or should hold the package."
    if status == "review-needs-work":
        return f"Use the existing review decision on Episode {episode} to make the next reversible improvement without overwriting older versions."
    if status == "pending-human-review":
        return f"Watch/listen Episode {episode}'s long-form files and shorts, then record a local review decision before Tower work."
    if status == "local-package-reviewed":
        return f"Confirm Episode {episode}'s local review evidence still matches the intended publishing packet before any external receipt work."
    return f"Open Episode {episode}'s local evidence and choose the next reversible action."


def default_agent_safe_parallel_work(card: dict[str, Any]) -> str:
    status = str(card.get("status") or "")
    if status == "sync-investigation-first":
        return "Generate clearer snippet, duration, transcript, and source-evidence packets; do not trim, rebuild, promote, approve, publish, upload, schedule, overwrite, delete, or mutate media."
    if status == "duration-workorder-ready":
        return "Prepare watch/listen notes, sample evidence, and dry-run local review commands; do not execute review decisions until the candidate has been checked."
    if status in {"review-with-warnings", "pending-human-review"}:
        return "Improve review clarity, platform metadata packets, and validation summaries; keep publication receipt truth empty until a real platform receipt exists."
    return "Improve local evidence, manifests, notes, and validation summaries without changing source media, publication truth, or external accounts."


def package_human_ask(duration_workorders: dict[str, Any], sync_investigation: dict[str, Any], tower_review_sheet: dict[str, Any]) -> str:
    if duration_workorders and sync_investigation:
        return "Review the two front-door blockers in order: Episode 1 v004 candidate watch/listen, then Episode 4 sync mismatch evidence. Do not approve or publish until those local decisions are clear."
    if sync_investigation:
        return "Resolve the active sync investigation before treating the package set as publication-ready."
    if duration_workorders:
        return "Watch/listen the active duration work orders and decide hold, refine, or approve as local review truth only."
    if tower_review_sheet:
        return "Review local Tower rows and warnings before preparing any manual platform packet."
    return "Open the package desk and decide the next local, reversible review action."


def package_agent_safe_work(duration_workorders: dict[str, Any], sync_investigation: dict[str, Any], tower_review_sheet: dict[str, Any]) -> str:
    if duration_workorders and sync_investigation:
        return "Improve evidence packets, snippets, transcript/duration summaries, and dry-run review commands for Episode 1 and Episode 4. Do not promote, approve, publish, upload, schedule, overwrite, delete, capture receipts, or mutate sources."
    if sync_investigation:
        return "Prepare clearer sync/source/tail evidence and dry-run hold/refine commands; do not rebuild or trim without explicit approval."
    if duration_workorders:
        return "Prepare watch/listen notes and review-command dry runs; do not execute review decisions until evidence has been checked."
    if tower_review_sheet:
        return "Improve platform packets, review clarity, and receipt slots while keeping external receipt truth empty."
    return "Improve local manifests, notes, validation, and review clarity without touching source media or external accounts."


def package_review_contract() -> list[str]:
    return [
        "Current-best package folders are evidence, not approval.",
        "Candidate review packets can become the next package only after a human/agent watch-listen decision.",
        "Sync investigations are content truth questions, not blind trim requests.",
        "Tower platform packets are preparation, not publication.",
        "Receipt slots stay empty until a real external platform URL or provider id exists.",
    ]


def hydrate_episode_review_affordances(cards: list[dict[str, Any]], safe_review_queue: list[dict[str, Any]]) -> None:
    queue_by_episode: dict[int, dict[str, Any]] = {}
    for item in safe_review_queue:
        if not isinstance(item, dict):
            continue
        episode = safe_int(item.get("episode"))
        if episode and episode not in queue_by_episode:
            queue_by_episode[episode] = item

    for card in cards:
        episode = safe_int(card.get("episode"))
        queue_item = queue_by_episode.get(episode)
        if queue_item:
            primary = {
                "id": queue_item.get("id") or f"episode-{episode}-primary-safe-action",
                "kind": queue_item.get("kind") or "local-review-evidence",
                "label": queue_item.get("label") or card.get("action") or "Open local evidence",
                "command": queue_item.get("command") or "",
                "path": queue_item.get("path") or "",
                "safety": queue_item.get("safety") or "Local evidence only.",
                "why": queue_item.get("why") or card.get("nextSafestAction") or "",
                "candidateVersion": queue_item.get("candidateVersion") or "",
                "currentVersion": queue_item.get("currentVersion") or "",
            }
            card["primaryReviewAction"] = primary
            card["action"] = primary["label"]
            card["nextSafestAction"] = primary["why"] or card.get("nextSafestAction")
            if primary["candidateVersion"]:
                card["reviewTargetVersion"] = primary["candidateVersion"]
                card["currentBestVersion"] = primary["currentVersion"] or card.get("version")
            commands = card.get("commands") if isinstance(card.get("commands"), list) else []
            if primary["command"] and all(command.get("command") != primary["command"] for command in commands if isinstance(command, dict)):
                card["commands"] = [{
                    "kind": "primary-safe-action",
                    "label": primary["label"],
                    "command": primary["command"],
                    "safety": primary["safety"],
                }] + commands
        else:
            card["primaryReviewAction"] = {
                "id": f"episode-{episode}-open-current-package",
                "kind": "local-package-evidence",
                "label": card.get("action") or "Open local package evidence",
                "command": (card.get("commands") or [{}])[0].get("command") if card.get("commands") else "",
                "path": card.get("versionDir") or "",
                "safety": "Local evidence only. No exports, repairs, approvals, uploads, schedules, receipts, source mutations, or overwrites.",
                "why": card.get("nextSafestAction") or "",
                "candidateVersion": "",
                "currentVersion": card.get("version") or "",
            }
        card["humanAsk"] = default_human_ask(card)
        card["agentSafeParallelWork"] = default_agent_safe_parallel_work(card)


def build_safe_review_queue(
    duration_workorders: dict[str, Any],
    candidate_review: dict[str, Any],
    duration_candidate_rehearsal: dict[str, Any],
    sync_investigation: dict[str, Any],
    sync_rehearsal: dict[str, Any],
    tower_review_sheet: dict[str, Any],
    duration_decision_sheet: dict[str, Any],
    release_root: Path,
) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    candidate_first = candidate_review.get("firstSafeAction") if isinstance(candidate_review.get("firstSafeAction"), dict) else {}
    rehearsal_first = duration_candidate_rehearsal.get("firstSafeAction") if isinstance(duration_candidate_rehearsal.get("firstSafeAction"), dict) else {}
    workorder_first = duration_workorders.get("firstSafeAction") if isinstance(duration_workorders.get("firstSafeAction"), dict) else {}
    decision_first = duration_decision_sheet.get("firstSafeAction") if isinstance(duration_decision_sheet.get("firstSafeAction"), dict) else {}
    if candidate_first.get("command"):
        queue.append({
            "id": "episode-1-duration-candidate-review",
            "lane": "Studio podcast/video",
            "label": candidate_first.get("label") or "Open duration candidate review packet",
            "episode": candidate_review.get("episode"),
            "currentVersion": candidate_review.get("currentVersion") or candidate_review.get("sourceVersion"),
            "candidateVersion": candidate_review.get("candidateVersion") or candidate_review.get("version"),
            "kind": "watch-listen-review",
            "command": candidate_first.get("command"),
            "path": candidate_first.get("path") or candidate_review.get("htmlPath") or "",
            "safety": candidate_first.get("safety") or "Opens local candidate evidence only. No repair, approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": "Latest machine-aligned candidate evidence is available. A human/agent watch-listen pass can decide whether this candidate should become the current review target.",
        })
    if duration_candidate_rehearsal:
        queue.append({
            "id": "episode-1-duration-candidate-decision-rehearsal",
            "lane": "Studio podcast/video",
            "label": rehearsal_first.get("label") or "Open Episode 1 duration candidate decision rehearsal",
            "episode": duration_candidate_rehearsal.get("episode") or 1,
            "currentVersion": duration_candidate_rehearsal.get("currentVersion"),
            "candidateVersion": duration_candidate_rehearsal.get("candidateVersion"),
            "kind": "duration-candidate-decision-rehearsal",
            "command": rehearsal_first.get("command") or f"open {shell_quote(str(duration_candidate_rehearsal.get('htmlPath') or duration_candidate_rehearsal.get('jsonPath') or ''))}",
            "path": rehearsal_first.get("path") or duration_candidate_rehearsal.get("htmlPath") or duration_candidate_rehearsal.get("jsonPath") or "",
            "safety": rehearsal_first.get("safety") or "Opens local duration-candidate decision rehearsal only. No live decisions, promotion, review-ledger mutation, approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": "Use this after watch/listen evidence to choose promote, refine, hold, or more-evidence before any live candidate promotion or Tower decision.",
        })
    elif workorder_first.get("command"):
        queue.append({
            "id": "episode-1-duration-candidate-review",
            "lane": "Studio podcast/video",
            "label": workorder_first.get("label") or "Open duration candidate review packet",
            "episode": workorder_first.get("episode"),
            "currentVersion": workorder_first.get("currentVersion"),
            "candidateVersion": workorder_first.get("candidateVersion"),
            "kind": "watch-listen-review",
            "command": workorder_first.get("command"),
            "path": workorder_first.get("path") or "",
            "safety": workorder_first.get("safety") or "Opens local candidate evidence only. No repair, approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": "Machine-aligned candidate evidence is available. A human/agent watch-listen pass can decide whether this candidate should become the current review target.",
        })
    elif decision_first.get("firstOpenCommand") or duration_decision_sheet.get("htmlPath"):
        episode = safe_int(decision_first.get("episode")) or 1
        command = decision_first.get("firstOpenCommand") or f"open {shell_quote(str(duration_decision_sheet.get('htmlPath') or duration_decision_sheet.get('jsonPath') or ''))}"
        queue.append({
            "id": f"episode-{episode}-duration-decision-sheet",
            "lane": "Studio podcast/video",
            "label": "Open duration decision evidence",
            "episode": episode,
            "currentVersion": decision_first.get("version"),
            "kind": "watch-listen-duration-decision",
            "command": command,
            "path": duration_decision_sheet.get("htmlPath") or duration_decision_sheet.get("jsonPath") or "",
            "safety": decision_first.get("safety") or "Opens local duration evidence only. No approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": decision_first.get("nextSafestAction") or "Review long-form A/V spread evidence before treating the package as publishable.",
        })
    for item in duration_decision_sheet.get("episodes") if isinstance(duration_decision_sheet.get("episodes"), list) else []:
        if not isinstance(item, dict):
            continue
        episode = safe_int(item.get("episode"))
        if not episode or any(existing.get("id") == f"episode-{episode}-duration-decision-sheet" for existing in queue):
            continue
        queue.append({
            "id": f"episode-{episode}-duration-decision-sheet",
            "lane": "Studio podcast/video",
            "label": f"Open Episode {episode} duration decision sheet",
            "episode": episode,
            "currentVersion": item.get("version"),
            "kind": "watch-listen-duration-decision",
            "command": f"open {shell_quote(str(duration_decision_sheet.get('htmlPath') or duration_decision_sheet.get('jsonPath') or ''))}",
            "path": duration_decision_sheet.get("htmlPath") or duration_decision_sheet.get("jsonPath") or "",
            "safety": "Opens local duration evidence only. No approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": item.get("nextSafestAction") or "Review long-form A/V spread evidence before treating the package as publishable.",
        })
    if sync_investigation:
        queue.append({
            "id": "episode-4-sync-investigation",
            "lane": "Studio podcast/video",
            "label": "Open Episode 4 sync investigation",
            "episode": sync_investigation.get("episode"),
            "currentVersion": sync_investigation.get("version"),
            "kind": "sync-content-investigation",
            "command": f"open {shell_quote(str(sync_investigation.get('htmlPath') or sync_investigation.get('jsonPath') or ''))}",
            "path": sync_investigation.get("htmlPath") or sync_investigation.get("jsonPath") or "",
            "safety": "Opens local sync evidence only. No repair, approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": "Episode 4 has a major A/V spread. Treat it as a sync/content question, not a blind trim candidate.",
        })
    if sync_rehearsal:
        rehearsal_first = sync_rehearsal.get("firstSafeAction") if isinstance(sync_rehearsal.get("firstSafeAction"), dict) else {}
        queue.append({
            "id": "episode-4-sync-decision-rehearsal",
            "lane": "Studio podcast/video",
            "label": rehearsal_first.get("label") or "Open Episode 4 sync decision rehearsal",
            "episode": sync_rehearsal.get("episode") or 4,
            "currentVersion": sync_rehearsal.get("version"),
            "kind": "sync-decision-rehearsal",
            "command": rehearsal_first.get("command") or f"open {shell_quote(str(sync_rehearsal.get('htmlPath') or sync_rehearsal.get('jsonPath') or ''))}",
            "path": rehearsal_first.get("path") or sync_rehearsal.get("htmlPath") or sync_rehearsal.get("jsonPath") or "",
            "safety": rehearsal_first.get("safety") or "Opens local sync decision rehearsal only. No live decisions, repairs, approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": "Use this after reviewing Episode 4 snippets to choose hold/re-stack, trim-candidate, source-needed, or continue-review before any live decision.",
        })
    if tower_review_sheet:
        review_template = str(tower_review_sheet.get("reviewCommandTemplate") or "./script/agentctl.sh tower-review-decision EPISODE artifact_id approve|refine|hold|pending '<reviewer>' '<notes>'")
        dry_run_template = str(tower_review_sheet.get("reviewDryRunCommandTemplate") or review_template.replace("tower-review-decision ", "tower-review-decision-dry-run ", 1))
        queue.append({
            "id": "tower-review-command-sheet",
            "lane": "Tower publishing/social",
            "label": "Open Tower review command sheet",
            "kind": "local-review-ledger",
            "command": f"open {shell_quote(str(tower_review_sheet.get('htmlPath') or tower_review_sheet.get('jsonPath') or ''))}",
            "dryRunCommandTemplate": dry_run_template,
            "executeCommandTemplateAfterPreview": review_template,
            "path": tower_review_sheet.get("htmlPath") or tower_review_sheet.get("jsonPath") or "",
            "safety": "Opens local review command sheet only. No external platform action or receipt capture.",
            "why": "Use this only after media evidence has been watched/listened and the local review decision is clear.",
        })
    if not queue:
        queue.append({
            "id": "release-review-board",
            "lane": "Studio podcast/video",
            "label": "Open release review board",
            "kind": "local-review-board",
            "command": f"open {shell_quote(str(release_root / 'review-board' / 'index.html'))}",
            "path": str(release_root / "review-board" / "index.html"),
            "safety": "Opens local review board only.",
            "why": "Start with the current release evidence and choose the next reversible local action.",
        })
    return queue


def build_package_start_here_queue(
    safe_review_queue: list[dict[str, Any]],
    episodes: list[dict[str, Any]],
    limit: int = 10,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()

    def append(row: dict[str, Any]) -> None:
        row_id = str(row.get("id") or f"start-{len(rows) + 1}")
        if row_id in seen or len(rows) >= limit:
            return
        seen.add(row_id)
        row["queueRank"] = len(rows) + 1
        rows.append(row)

    for item in safe_review_queue[:4]:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "Open local evidence")
        append({
            "id": f"safe-{item.get('id') or len(rows) + 1}",
            "source": "safeReviewQueue",
            "kind": item.get("kind") or "local-review-action",
            "lane": item.get("lane") or "Studio podcast/video",
            "label": label,
            "episode": item.get("episode") or "",
            "version": item.get("candidateVersion") or item.get("currentVersion") or "",
            "status": "evidence-first",
            "why": item.get("why") or "Open local evidence before making a review or publishing decision.",
            "safeCommand": item.get("command") or "",
            "dryRunCommandTemplate": item.get("dryRunCommandTemplate") or "",
            "executeCommandTemplateAfterPreview": item.get("executeCommandTemplateAfterPreview") or "",
            "humanDecision": "Watch/listen/open the evidence, then choose approve, refine, hold, or need-more-evidence. Do not treat this as publication.",
            "codexCanDo": "Prepare summaries, compare manifests, improve packets, and run dry-run commands without approving or publishing.",
            "nextSafestAction": item.get("why") or "Open the local evidence and decide the next reversible step.",
            "safety": item.get("safety") or "Local evidence only. No export, repair, approval, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "path": item.get("path") or "",
        })

    status_priority = {
        "sync-investigation-first": 0,
        "duration-workorder-ready": 1,
        "review-needs-work": 2,
        "review-with-warnings": 3,
        "pending-human-review": 4,
        "blocked-local-package": 5,
        "local-package-reviewed": 6,
    }
    for card in sorted(
        [card for card in episodes if isinstance(card, dict)],
        key=lambda card: (status_priority.get(str(card.get("status") or ""), 9), safe_int(card.get("episode"))),
    ):
        primary = card.get("primaryReviewAction") if isinstance(card.get("primaryReviewAction"), dict) else {}
        review_readiness = card.get("reviewReadiness") if isinstance(card.get("reviewReadiness"), dict) else {}
        publish_readiness = card.get("publishReadiness") if isinstance(card.get("publishReadiness"), dict) else {}
        severity = card.get("durationSpreadSeverity") if isinstance(card.get("durationSpreadSeverity"), dict) else {}
        episode = safe_int(card.get("episode"))
        append({
            "id": f"episode-{episode}-package-review",
            "source": "episodePackageCard",
            "kind": "episode-package-review",
            "lane": "Studio podcast/video",
            "label": f"Episode {episode}: {card.get('action') or 'Review package'}",
            "episode": episode,
            "version": card.get("reviewTargetVersion") or card.get("version") or "",
            "currentBestVersion": card.get("currentBestVersion") or card.get("version") or "",
            "status": card.get("status") or "unknown",
            "reviewReadiness": review_readiness.get("label") or "Unknown",
            "publishReadiness": publish_readiness.get("label") or "Unknown",
            "warningCount": safe_int(card.get("warningCount")),
            "blockerCount": safe_int(card.get("blockerCount")),
            "readyShortCount": safe_int(card.get("readyShortCount")),
            "shortCount": safe_int(card.get("shortCount")),
            "durationSpreadLabel": card.get("durationSpreadLabel") or "0:00",
            "durationSpreadSeverity": severity.get("label") or "aligned",
            "why": card.get("nextSafestAction") or "Open package evidence and choose the next reversible action.",
            "safeCommand": primary.get("command") or ((card.get("commands") or [{}])[0].get("command") if card.get("commands") else ""),
            "humanDecision": card.get("humanAsk") or "Watch/listen to the local package and choose approve, refine, hold, or need-more-evidence.",
            "codexCanDo": card.get("agentSafeParallelWork") or "Improve local evidence, manifests, metadata packets, and validation without changing external truth.",
            "nextSafestAction": card.get("nextSafestAction") or "Open the local evidence and decide the next reversible step.",
            "safety": primary.get("safety") or "Local package evidence only. No approval, external publishing, receipt creation, overwrite, delete, or source mutation.",
            "path": primary.get("path") or card.get("versionDir") or "",
        })

    return rows


def classify_episode(
    episode: int,
    release_episode: dict[str, Any],
    validation_episode: dict[str, Any],
    board_episode: dict[str, Any],
    ledger_episode: dict[str, Any],
    duration_workorder_episodes: set[int],
    sync_investigation_episode: int,
) -> tuple[str, str, str]:
    warnings = collect_unique(
        release_episode.get("warnings"),
        validation_episode.get("warnings"),
        board_episode.get("warnings"),
        ledger_episode.get("warnings"),
    )
    blockers = collect_unique(validation_episode.get("blockers"), release_episode.get("blockers"), board_episode.get("blockers"))
    review = review_summary(ledger_episode)
    if blockers:
        return "blocked-local-package", "Fix package blockers", "Local package evidence has blockers. Repair or route around it before human review or publishing prep."
    if episode == sync_investigation_episode:
        return "sync-investigation-first", "Open sync investigation", "A long-form A/V spread needs sync or stack investigation before blind trimming or publishing."
    if episode in duration_workorder_episodes:
        return "duration-workorder-ready", "Open duration/sync work order", "A versioned work order exists. Review evidence and choose hold/refine/approve without changing receipt truth."
    if review["blockingCount"]:
        return "review-needs-work", "Resolve review hold/refine/reject", "A review decision says this package needs work. Keep old versions and make the next reversible improvement."
    if warnings:
        return "review-with-warnings", "Review documented warning", "The package is locally reviewable, but the warning needs a human listen/watch decision before platform work."
    if review["counts"]["pending"]:
        return "pending-human-review", "Watch/listen and record review", "Local package exists. Human review should approve/refine/hold the episode and shorts before Tower treats it as approved."
    return "local-package-reviewed", "Prepare Tower packet after approval", "Local review evidence is clear. External receipt truth still remains separate until real platform proof exists."


def build_episode_cards(
    release_root: Path,
    release_status: dict[str, Any],
    validation: dict[str, Any],
    review_board: dict[str, Any],
    ledger: dict[str, Any],
    duration_workorders: dict[str, Any],
    sync_investigation: dict[str, Any],
) -> list[dict[str, Any]]:
    release_by_episode = index_by_episode(release_status)
    validation_by_episode = index_by_episode(validation)
    board_by_episode = index_by_episode(review_board)
    ledger_by_episode = index_by_episode(ledger)
    duration_workorder_episodes = {safe_int(item) for item in duration_workorders.get("episodes", []) if safe_int(item)}
    sync_episode = safe_int(sync_investigation.get("episode")) if sync_investigation else 0
    episode_numbers = sorted(set(range(1, 7)) | set(release_by_episode) | set(validation_by_episode) | set(board_by_episode) | set(ledger_by_episode))

    cards: list[dict[str, Any]] = []
    for episode in episode_numbers:
        release_episode = release_by_episode.get(episode, {})
        validation_episode = validation_by_episode.get(episode, {})
        board_episode = board_by_episode.get(episode, {})
        ledger_episode = ledger_by_episode.get(episode, {})
        explicit_version_dir = (
            board_episode.get("versionDir")
            or release_episode.get("versionDir")
            or validation_episode.get("versionDir")
            or ledger_episode.get("versionDir")
            or ""
        )
        version_dir_path = Path(str(explicit_version_dir)) if explicit_version_dir else latest_version_dir(release_root / f"Episode_{episode:02d}")
        version_dir = str(version_dir_path) if version_dir_path else ""
        version = (
            board_episode.get("version")
            or release_episode.get("version")
            or validation_episode.get("version")
            or ledger_episode.get("version")
            or (version_dir_path.name if version_dir_path else "")
        )
        warnings = collect_unique(
            release_episode.get("warnings"),
            validation_episode.get("warnings"),
            board_episode.get("warnings"),
            ledger_episode.get("warnings"),
        )
        blockers = collect_unique(validation_episode.get("blockers"), release_episode.get("blockers"), board_episode.get("blockers"))
        review = review_summary(ledger_episode)
        receipts = receipt_summary(ledger_episode)
        durations = artifact_duration_map(board_episode)
        short_count = safe_int(board_episode.get("shortCount") or release_episode.get("shortCount") or len(board_episode.get("shorts") or []))
        ready_short_count = safe_int(board_episode.get("readyShortCount") or release_episode.get("readyShortCount") or validation_episode.get("readyShortCount"))
        duration_spread = safe_float(board_episode.get("longFormDurationSpreadSeconds") or release_episode.get("longFormDurationSpreadSeconds"), 0.0)
        status, action, next_safest = classify_episode(
            episode,
            release_episode,
            validation_episode,
            board_episode,
            ledger_episode,
            duration_workorder_episodes,
            sync_episode,
        )
        first_review_artifact = review.get("pendingArtifactId") or "longForm16x9"
        has_manifest = bool(version_dir and (Path(version_dir) / "manifest.json").exists())
        has_notes = bool(version_dir and (Path(version_dir) / "notes.md").exists())
        manifest = load_package_manifest(version_dir)
        cards.append({
            "episode": episode,
            "version": version,
            "versionDir": version_dir,
            "status": status,
            "action": action,
            "nextSafestAction": next_safest,
            "hasManifest": has_manifest,
            "hasNotes": has_notes,
            "warningCount": len(warnings),
            "warnings": warnings,
            "blockerCount": len(blockers),
            "blockers": blockers,
            "durationSpreadSeconds": round(duration_spread, 3),
            "durationSpreadLabel": duration_label(duration_spread),
            "artifactDurations": durations,
            "readyShortCount": ready_short_count,
            "shortCount": short_count,
            "review": review,
            "receipts": receipts,
            "commands": commands_for_episode(episode, version_dir, str(first_review_artifact)),
            "towerPlatformsReady": release_episode.get("platformPrepReadyPlatforms") or PLATFORMS,
            "publicationReceiptStatus": release_episode.get("publicationReceiptStatus") or "no platform receipts captured",
            "mediaReviewChecklist": build_media_review_checklist(version_dir, manifest),
        })
    return cards


def build_rows(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for card in cards:
        review_counts = (card.get("review") or {}).get("counts") or {}
        receipts = card.get("receipts") or {}
        checklist = card.get("mediaReviewChecklist") if isinstance(card.get("mediaReviewChecklist"), dict) else {}
        rows.append({
            "episode": card.get("episode"),
            "version": card.get("version"),
            "reviewTargetVersion": card.get("reviewTargetVersion") or "",
            "reviewReadiness": (card.get("reviewReadiness") or {}).get("status") if isinstance(card.get("reviewReadiness"), dict) else "",
            "publishReadiness": (card.get("publishReadiness") or {}).get("status") if isinstance(card.get("publishReadiness"), dict) else "",
            "durationSeverity": (card.get("durationSpreadSeverity") or {}).get("level") if isinstance(card.get("durationSpreadSeverity"), dict) else "",
            "status": card.get("status"),
            "action": card.get("action"),
            "nextSafestAction": card.get("nextSafestAction"),
            "humanAsk": card.get("humanAsk"),
            "warnings": card.get("warningCount"),
            "blockers": card.get("blockerCount"),
            "pendingReview": review_counts.get("pending", 0),
            "blockingReview": (card.get("review") or {}).get("blockingCount", 0),
            "readyShorts": card.get("readyShortCount"),
            "shorts": card.get("shortCount"),
            "durationSpreadSeconds": card.get("durationSpreadSeconds"),
            "receiptSlots": receipts.get("receiptSlots", 0),
            "capturedReceipts": receipts.get("capturedReceipts", 0),
            "allPrimaryMediaExists": checklist.get("allPrimaryMediaExists", False),
            "manifestPath": checklist.get("manifestPath") or "",
            "shortsDir": checklist.get("shortsDir") or "",
            "versionDir": card.get("versionDir"),
        })
    return rows


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "episode",
        "version",
        "reviewTargetVersion",
        "reviewReadiness",
        "publishReadiness",
        "durationSeverity",
        "status",
        "action",
        "nextSafestAction",
        "humanAsk",
        "warnings",
        "blockers",
        "pendingReview",
        "blockingReview",
        "readyShorts",
        "shorts",
        "durationSpreadSeconds",
        "receiptSlots",
        "capturedReceipts",
        "allPrimaryMediaExists",
        "manifestPath",
        "shortsDir",
        "versionDir",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def css_class(status: str) -> str:
    if status in {"blocked-local-package", "sync-investigation-first", "duration-workorder-ready", "review-with-warnings", "review-needs-work"}:
        return "attention"
    if status in {"pending-human-review"}:
        return "review"
    return "ready"


def html_anchor(label: str, uri: str) -> str:
    if not uri:
        return ""
    return f'<a href="{html.escape(uri, quote=True)}">{html.escape(label)}</a>'


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") or {}
    cards = payload.get("episodes") or []
    generated = html.escape(str(payload.get("updatedAt") or ""))
    first_action = payload.get("firstSafeAction") or {}
    first_command = html.escape(str(first_action.get("command") or ""))
    next_action = html.escape(str(payload.get("nextSafestAction") or ""))
    start_queue = [item for item in payload.get("startHereQueue") or [] if isinstance(item, dict)]
    start_queue_html = "".join(
        f"""
        <article class="start-card">
          <div class="start-rank">{html.escape(str(item.get('queueRank') or '?'))}</div>
          <div>
            <p class="eyebrow">{html.escape(str(item.get('lane') or item.get('kind') or 'review lane'))}</p>
            <h3>{html.escape(str(item.get('label') or 'Open evidence'))}</h3>
            <div class="chips">
              {f"<span>Episode {html.escape(str(item.get('episode')))}</span>" if item.get('episode') else ""}
              {f"<span>{html.escape(str(item.get('version')))}</span>" if item.get('version') else ""}
              <span>{html.escape(str(item.get('status') or 'evidence-first'))}</span>
              {f"<span>{html.escape(str(item.get('reviewReadiness')))}</span>" if item.get('reviewReadiness') else ""}
              {f"<span>{html.escape(str(item.get('durationSpreadLabel')))} spread</span>" if item.get('durationSpreadLabel') else ""}
            </div>
            <p>{html.escape(str(item.get('why') or item.get('nextSafestAction') or 'Open local evidence before making a decision.'))}</p>
            {f"<code>{html.escape(str(item.get('safeCommand')))}</code>" if item.get('safeCommand') else ""}
            {f"<p class='command-label'>Dry-run before writing</p><code>{html.escape(str(item.get('dryRunCommandTemplate')))}</code>" if item.get('dryRunCommandTemplate') else ""}
            <div class="decision-split">
              <div><strong>Human decision</strong><p>{html.escape(str(item.get('humanDecision') or 'Decide approve, refine, hold, or need more evidence.'))}</p></div>
              <div><strong>Codex can safely</strong><p>{html.escape(str(item.get('codexCanDo') or 'Prepare evidence without changing source or publication truth.'))}</p></div>
            </div>
            <p class="safety">{html.escape(str(item.get('safety') or 'Local evidence only.'))}</p>
          </div>
        </article>
        """
        for item in start_queue[:6]
    )
    safe_queue = [item for item in payload.get("safeReviewQueue") or [] if isinstance(item, dict)]
    safe_queue_html = "".join(
        f"""
        <article class="queue-card">
          <p class="eyebrow">{html.escape(str(item.get('kind') or 'review action'))}</p>
          <h3>{html.escape(str(item.get('label') or 'Open evidence'))}</h3>
          <p>{html.escape(str(item.get('why') or 'Open local evidence before making a review decision.'))}</p>
          <code>{html.escape(str(item.get('command') or ''))}</code>
          {f"<p class='command-label'>Dry-run template</p><code>{html.escape(str(item.get('dryRunCommandTemplate')))}</code>" if item.get('dryRunCommandTemplate') else ""}
          {f"<p class='command-label'>Execute only after preview</p><code>{html.escape(str(item.get('executeCommandTemplateAfterPreview')))}</code>" if item.get('executeCommandTemplateAfterPreview') else ""}
          <p class="safety">{html.escape(str(item.get('safety') or 'Local evidence only.'))}</p>
        </article>
        """
        for item in safe_queue[:4]
    )
    contract_html = "".join(
        f"<li>{html.escape(str(item))}</li>"
        for item in payload.get("reviewContract") or []
    )
    card_html = []
    for card in cards:
        status = str(card.get("status") or "")
        warnings = card.get("warnings") if isinstance(card.get("warnings"), list) else []
        blockers = card.get("blockers") if isinstance(card.get("blockers"), list) else []
        commands = card.get("commands") if isinstance(card.get("commands"), list) else []
        command_html = "".join(
            f"""
            <div class="command-block {html.escape(str(command.get('kind') or 'command'))}">
              <strong>{html.escape(str(command.get('label') or command.get('kind') or 'Command'))}</strong>
              <code>{html.escape(str(command.get('command') or ''))}</code>
              <p>{html.escape(str(command.get('safety') or 'Local command. Read before running.'))}</p>
            </div>
            """
            for command in commands if isinstance(command, dict)
        )
        warning_html = "".join(f"<li>{html.escape(str(item))}</li>" for item in warnings[:4])
        blocker_html = "".join(f"<li>{html.escape(str(item))}</li>" for item in blockers[:4])
        primary = card.get("primaryReviewAction") if isinstance(card.get("primaryReviewAction"), dict) else {}
        primary_command = html.escape(str(primary.get("command") or ""))
        primary_html = f"""
          <div class="primary-action">
            <p class="eyebrow">Start here for this episode</p>
            <strong>{html.escape(str(primary.get('label') or card.get('action') or 'Open local evidence'))}</strong>
            <p>{html.escape(str(primary.get('why') or card.get('nextSafestAction') or 'Open the evidence and choose the next reversible action.'))}</p>
            {f"<code>{primary_command}</code>" if primary_command else ""}
            <p class="safety">{html.escape(str(primary.get('safety') or 'Local evidence only.'))}</p>
          </div>
        """
        version_note = ""
        if card.get("reviewTargetVersion") and card.get("reviewTargetVersion") != card.get("version"):
            version_note = f"<p class='version-note'>Current-best package: {html.escape(str(card.get('currentBestVersion') or card.get('version')))}. Review target: {html.escape(str(card.get('reviewTargetVersion')))} candidate evidence.</p>"
        review_readiness = card.get("reviewReadiness") if isinstance(card.get("reviewReadiness"), dict) else {}
        publish_readiness = card.get("publishReadiness") if isinstance(card.get("publishReadiness"), dict) else {}
        severity = card.get("durationSpreadSeverity") if isinstance(card.get("durationSpreadSeverity"), dict) else {}
        readiness_html = f"""
          <div class="readiness-split">
            <div>
              <p class="eyebrow">Review readiness</p>
              <strong>{html.escape(str(review_readiness.get('label') or 'Unknown'))}</strong>
              <p>{html.escape(str(review_readiness.get('plain') or 'Open the local package evidence first.'))}</p>
            </div>
            <div>
              <p class="eyebrow">Publish readiness</p>
              <strong>{html.escape(str(publish_readiness.get('label') or 'Unknown'))}</strong>
              <p>{html.escape(str(publish_readiness.get('plain') or 'Do not treat local readiness as external publication.'))}</p>
            </div>
            <div>
              <p class="eyebrow">A/V spread</p>
              <strong>{html.escape(str(card.get('durationSpreadLabel') or '0:00'))} · {html.escape(str(severity.get('label') or 'aligned'))}</strong>
              <p>{html.escape(str(card.get('durationDecisionPlain') or severity.get('plain') or 'No duration decision needed.'))}</p>
            </div>
          </div>
        """
        checklist = card.get("mediaReviewChecklist") if isinstance(card.get("mediaReviewChecklist"), dict) else {}
        review_sequence = checklist.get("reviewSequence") if isinstance(checklist.get("reviewSequence"), list) else []
        sequence_html = "".join(
            f"""
            <li class="review-step {'missing' if not step.get('exists') else ''}">
              <div>
                <strong>{html.escape(str(step.get('label') or 'Review artifact'))}</strong>
                <p>{html.escape(str(step.get('check') or 'Open and inspect the local evidence.'))}</p>
                {f"<span>{html.escape(str(step.get('durationLabel') or ''))}</span>" if step.get('durationLabel') else ""}
              </div>
              {html_anchor("Open", str(step.get('uri') or ""))}
            </li>
            """
            for step in review_sequence if isinstance(step, dict)
        )
        artifact_rows = checklist.get("artifactRows") if isinstance(checklist.get("artifactRows"), list) else []
        artifact_table_html = "".join(
            f"""
            <tr>
              <td>{html.escape(str(row.get('id') or 'artifact'))}</td>
              <td>{html.escape(str(row.get('kind') or 'media'))}</td>
              <td>{html.escape(str(row.get('durationLabel') or '0:00'))}</td>
              <td>{'yes' if row.get('exists') else 'missing'}</td>
              <td>{html_anchor("open", str(row.get('uri') or ""))}</td>
            </tr>
            """
            for row in artifact_rows if isinstance(row, dict)
        )
        short_rows = checklist.get("shortRows") if isinstance(checklist.get("shortRows"), list) else []
        short_preview_html = "".join(
            f"""
            <li>
              <span>{html.escape(str(row.get('label') or 'short'))}</span>
              <em>{html.escape(str(row.get('durationLabel') or '0:00'))}</em>
              {html_anchor("open", str(row.get('uri') or ""))}
            </li>
            """
            for row in short_rows[:6] if isinstance(row, dict)
        )
        support_links = [
            ("Manifest", checklist.get("manifestPath")),
            ("Notes", checklist.get("notesPath")),
            ("Sync-gap report", checklist.get("syncGapReportPath")),
            ("Missing-media notes", checklist.get("missingMediaNotesPath")),
            ("Publication cockpit", checklist.get("publicationCockpitPath")),
            ("Platform prep", checklist.get("platformPrepDir")),
            ("Shorts folder", checklist.get("shortsDir")),
        ]
        support_html = "".join(
            f"<a href=\"{html.escape(file_uri(str(path)), quote=True)}\">{html.escape(label)}</a>"
            for label, path in support_links if path
        )
        gap_summary = checklist.get("gapSummary") if isinstance(checklist.get("gapSummary"), list) else []
        gap_html = "".join(f"<li>{html.escape(str(item))}</li>" for item in gap_summary[:3])
        card_html.append(f"""
        <article class="card {css_class(status)}">
          <div class="card-head">
            <div>
              <p class="eyebrow">Episode {html.escape(str(card.get('episode')))}</p>
              <h2>{html.escape(str(card.get('version') or 'unknown version'))}</h2>
            </div>
            <span class="pill">{html.escape(status)}</span>
          </div>
          <p class="action">{html.escape(str(card.get('action') or 'Review package'))}</p>
          <p>{html.escape(str(card.get('nextSafestAction') or 'Open the evidence and choose the next reversible action.'))}</p>
          {version_note}
          {readiness_html}
          {primary_html}
          <div class="review-checklist">
            <div class="review-checklist-head">
              <div>
                <p class="eyebrow">Reviewer path</p>
                <h3>Watch-listen checklist</h3>
              </div>
              <span class="check-pill">{'primary media present' if checklist.get('allPrimaryMediaExists') else 'needs file attention'}</span>
            </div>
            <p>{html.escape(str(checklist.get('safeReviewerSummary') or 'Open local evidence before recording a decision.'))}</p>
            <ol>{sequence_html}</ol>
            <details>
              <summary>Artifact details</summary>
              <table>
                <thead><tr><th>Artifact</th><th>Kind</th><th>Duration</th><th>Exists</th><th>Open</th></tr></thead>
                <tbody>{artifact_table_html}</tbody>
              </table>
            </details>
            {f"<details><summary>Shorts quick links</summary><ul class='short-list'>{short_preview_html}</ul></details>" if short_preview_html else ""}
            {f"<details><summary>Gap/source notes</summary><ul>{gap_html}</ul><p>{html.escape(str(checklist.get('sourcePolicy') or ''))}</p></details>" if gap_html or checklist.get('sourcePolicy') else ""}
            <div class="support-links">{support_html}</div>
          </div>
          <div class="ask-block">
            <strong>Human ask</strong>
            <p>{html.escape(str(card.get('humanAsk') or 'Open local evidence and decide the next safe action.'))}</p>
            <strong>Agent-safe parallel work</strong>
            <p>{html.escape(str(card.get('agentSafeParallelWork') or 'Improve evidence and validation without changing source or publication truth.'))}</p>
          </div>
          <div class="stats">
            <span>{html.escape(str(card.get('readyShortCount')))} / {html.escape(str(card.get('shortCount')))} shorts</span>
            <span>{html.escape(str(card.get('warningCount')))} warnings</span>
            <span>{html.escape(str((card.get('review') or {}).get('counts', {}).get('pending', 0)))} pending reviews</span>
            <span>{html.escape(str(card.get('durationSpreadLabel')))} A/V spread</span>
          </div>
          {('<h3>Warnings</h3><ul>' + warning_html + '</ul>') if warning_html else ''}
          {('<h3>Blockers</h3><ul>' + blocker_html + '</ul>') if blocker_html else ''}
          <p class="path">{html.escape(str(card.get('versionDir') or 'No package folder found'))}</p>
          <div class="commands">{command_html}</div>
        </article>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quipsly Studio Package Quality Desk</title>
<style>
:root {{
  --soil: #201914;
  --bark: #3a2a1f;
  --moss: #6f8f5d;
  --fern: #9fbd80;
  --honey: #f3c557;
  --clay: #df7b52;
  --cream: #f7eedc;
  --muted: #c4b9a5;
  --panel: rgba(255, 248, 229, .08);
  --line: rgba(255, 248, 229, .16);
}}
* {{ box-sizing: border-box; }}
body {{ margin: 0; background: radial-gradient(circle at top left, rgba(111,143,93,.24), transparent 34%), linear-gradient(135deg, #121713, var(--soil)); color: var(--cream); font-family: Avenir Next, ui-sans-serif, system-ui, sans-serif; }}
main {{ max-width: 1220px; margin: 0 auto; padding: 42px 28px 64px; }}
.hero {{ border: 1px solid var(--line); background: rgba(32,25,20,.72); border-radius: 28px; padding: 30px; box-shadow: 0 24px 70px rgba(0,0,0,.34); }}
.eyebrow {{ margin: 0 0 8px; letter-spacing: .24em; text-transform: uppercase; color: var(--honey); font-weight: 900; font-size: 12px; }}
h1 {{ margin: 0; font-size: clamp(36px, 6vw, 74px); line-height: .92; letter-spacing: -.05em; }}
p {{ color: var(--muted); line-height: 1.55; }}
.grid {{ display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); gap: 12px; margin: 22px 0; }}
.metric {{ background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 14px; }}
.metric strong {{ display: block; font-size: 26px; color: var(--cream); }}
.metric span {{ color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 800; }}
.next {{ background: rgba(243,197,87,.12); border: 1px solid rgba(243,197,87,.38); border-radius: 18px; padding: 16px; }}
.cards {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; margin-top: 28px; }}
.card {{ background: rgba(10, 12, 10, .44); border: 1px solid var(--line); border-radius: 22px; padding: 20px; }}
.card.attention {{ border-color: rgba(223,123,82,.7); box-shadow: inset 0 0 0 1px rgba(223,123,82,.16); }}
.card.review {{ border-color: rgba(243,197,87,.62); }}
.card.ready {{ border-color: rgba(159,189,128,.62); }}
.card-head {{ display: flex; justify-content: space-between; gap: 14px; align-items: start; }}
h2 {{ margin: 0; font-size: 24px; }}
h3 {{ margin: 16px 0 6px; color: var(--honey); text-transform: uppercase; letter-spacing: .14em; font-size: 11px; }}
.pill {{ border-radius: 999px; padding: 7px 10px; background: rgba(255,255,255,.09); color: var(--honey); font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; }}
.action {{ color: var(--cream); font-weight: 900; }}
.version-note {{ color: var(--honey); font-weight: 800; }}
.primary-action {{ margin: 14px 0; border: 1px solid rgba(243,197,87,.34); border-radius: 16px; padding: 12px; background: rgba(243,197,87,.08); }}
.primary-action strong {{ color: var(--cream); }}
	.primary-action .safety {{ font-size: 12px; color: #a99c87; }}
	.start-queue {{ display: grid; gap: 12px; margin: 16px 0 24px; }}
	.start-card {{ display: grid; grid-template-columns: auto 1fr; gap: 14px; align-items: start; border: 1px solid rgba(243,197,87,.34); border-radius: 20px; padding: 16px; background: linear-gradient(135deg, rgba(243,197,87,.11), rgba(111,143,93,.07)); }}
	.start-rank {{ width: 38px; height: 38px; border-radius: 14px; display: grid; place-items: center; background: rgba(243,197,87,.18); border: 1px solid rgba(243,197,87,.36); color: var(--honey); font-weight: 1000; }}
	.start-card h3 {{ margin: 0 0 8px; color: var(--cream); text-transform: none; letter-spacing: -.02em; font-size: 20px; }}
	.start-card .safety {{ margin-bottom: 0; font-size: 12px; color: #a99c87; }}
	.chips {{ display: flex; flex-wrap: wrap; gap: 7px; margin: 8px 0 10px; }}
	.chips span {{ border-radius: 999px; padding: 6px 9px; background: rgba(255,255,255,.08); color: var(--cream); font-size: 11px; font-weight: 900; }}
	.decision-split {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin: 12px 0; }}
	.decision-split > div {{ border: 1px solid rgba(255,248,229,.10); border-radius: 14px; padding: 10px; background: rgba(0,0,0,.18); }}
	.decision-split strong {{ color: var(--fern); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; }}
	.decision-split p {{ margin: 6px 0 0; font-size: 12px; }}
	.readiness-split {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; margin: 14px 0; }}
.readiness-split > div {{ border: 1px solid rgba(255,248,229,.12); border-radius: 16px; padding: 12px; background: rgba(0,0,0,.18); }}
.readiness-split strong {{ color: var(--cream); }}
.readiness-split p:last-child {{ margin-bottom: 0; font-size: 12px; }}
.review-checklist {{ margin: 14px 0; border: 1px solid rgba(111,143,93,.38); border-radius: 18px; padding: 14px; background: rgba(111,143,93,.08); }}
.review-checklist-head {{ display: flex; justify-content: space-between; gap: 12px; align-items: start; }}
.review-checklist h3 {{ margin: 0; color: var(--cream); text-transform: none; letter-spacing: -.02em; font-size: 18px; }}
.review-checklist ol {{ list-style: none; display: grid; gap: 9px; margin: 12px 0; padding: 0; }}
.review-step {{ display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; border: 1px solid rgba(255,248,229,.12); background: rgba(0,0,0,.18); border-radius: 14px; padding: 10px; }}
.review-step.missing {{ border-color: rgba(223,123,82,.46); background: rgba(223,123,82,.10); }}
.review-step strong {{ color: var(--cream); }}
.review-step p {{ margin: 4px 0; font-size: 12px; }}
.review-step span {{ color: var(--honey); font-weight: 900; font-size: 12px; }}
.review-step a, .support-links a, .short-list a {{ display: inline-flex; border-radius: 999px; padding: 7px 10px; background: rgba(143,207,226,.14); color: #a9e6f1; text-decoration: none; font-weight: 900; font-size: 12px; }}
.check-pill {{ border-radius: 999px; padding: 7px 10px; background: rgba(159,189,128,.16); color: var(--fern); font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: .12em; white-space: nowrap; }}
.review-checklist details {{ margin-top: 9px; }}
.review-checklist summary {{ cursor: pointer; color: var(--honey); font-weight: 900; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }}
th, td {{ text-align: left; border-bottom: 1px solid rgba(255,248,229,.10); padding: 7px; vertical-align: top; }}
th {{ color: var(--honey); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; }}
.short-list {{ list-style: none; display: grid; gap: 7px; padding: 0; }}
.short-list li {{ display: grid; grid-template-columns: 1fr auto auto; gap: 8px; align-items: center; border-bottom: 1px solid rgba(255,248,229,.08); padding: 7px 0; }}
.short-list span {{ color: var(--cream); overflow-wrap: anywhere; }}
.short-list em {{ color: var(--honey); font-style: normal; font-weight: 900; }}
.support-links {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }}
.ask-block {{ border: 1px solid rgba(159,189,128,.22); background: rgba(159,189,128,.07); border-radius: 16px; padding: 12px; margin: 12px 0; }}
.ask-block strong {{ color: var(--fern); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; }}
.ask-block p {{ margin: 6px 0 10px; }}
.stats {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }}
.stats span {{ border-radius: 999px; padding: 7px 9px; background: rgba(255,255,255,.08); color: var(--cream); font-size: 12px; }}
.path {{ font-size: 12px; word-break: break-all; color: #a99c87; }}
.commands {{ display: grid; gap: 8px; }}
.queue {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 16px; }}
.queue-card {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(0,0,0,.20); }}
.queue-card h3 {{ margin: 0 0 8px; color: var(--cream); text-transform: none; letter-spacing: -.02em; font-size: 18px; }}
.queue-card .safety {{ font-size: 12px; color: #a99c87; }}
.command-label {{ margin: 12px 0 4px; color: var(--honey); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 900; }}
.command-block {{ border: 1px solid var(--line); border-radius: 14px; padding: 10px; background: rgba(0,0,0,.18); }}
.command-block strong {{ display: block; margin-bottom: 6px; color: var(--cream); }}
.command-block.review-dry-run {{ border-color: rgba(143,207,226,.42); background: rgba(143,207,226,.08); }}
.command-block.review-execute-after-preview {{ border-color: rgba(243,197,87,.28); }}
.command-block p {{ margin: 7px 0 0; font-size: 12px; color: #a99c87; }}
code {{ display: block; white-space: pre-wrap; word-break: break-word; background: rgba(0,0,0,.32); color: var(--fern); border-radius: 12px; padding: 10px; font-size: 12px; }}
ul {{ color: var(--muted); padding-left: 19px; }}
@media (max-width: 760px) {{ .grid {{ grid-template-columns: repeat(2, minmax(0,1fr)); }} main {{ padding: 22px 14px; }} }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio</p>
    <h1>Package Quality Desk</h1>
    <p>One local front door for Episodes 1-6. This desk joins release packages, review rows, warnings, duration workorders, sync investigations, Tower prep, and receipt slots without changing any files or pretending anything is published.</p>
    <div class="grid">
      <div class="metric"><strong>{counts.get('episodes', 0)}</strong><span>episodes</span></div>
      <div class="metric"><strong>{counts.get('currentBestPackages', 0)}</strong><span>packages</span></div>
      <div class="metric"><strong>{counts.get('reviewablePackages', 0)}</strong><span>reviewable</span></div>
      <div class="metric"><strong>{counts.get('packetPrepReadyPackages', 0)}</strong><span>packet prep</span></div>
      <div class="metric"><strong>{counts.get('warningEpisodes', 0)}</strong><span>warnings</span></div>
      <div class="metric"><strong>{counts.get('pendingReviewRows', 0)}</strong><span>pending review</span></div>
      <div class="metric"><strong>{counts.get('readyShorts', 0)}</strong><span>ready shorts</span></div>
      <div class="metric"><strong>{counts.get('capturedReceipts', 0)}</strong><span>receipts</span></div>
    </div>
    <div class="next"><strong>Next safest action:</strong> {next_action}<br><br><code>{first_command}</code></div>
    <div class="ask-block">
      <strong>Human ask</strong>
      <p>{html.escape(str(payload.get('humanAsk') or 'Open local evidence and decide the next safe action.'))}</p>
      <strong>Codex can safely</strong>
      <p>{html.escape(str(payload.get('agentSafeParallelWork') or 'Improve local evidence without changing sources or publication truth.'))}</p>
    </div>
	    <h3>Review contract</h3>
	    <ul>{contract_html}</ul>
	    <h3>Start here: package review queue</h3>
	    <p>These are the safest first actions. They open evidence, rehearse decisions, or review current-best packages. They do not publish, approve, upload, overwrite, mutate originals, or create receipt truth.</p>
	    <div class="start-queue">{start_queue_html}</div>
	    <h3>Supporting safe queue</h3>
	    <div class="queue">{safe_queue_html}</div>
    <p>Generated {generated}. Safety: no exports, repairs, approvals, uploads, schedules, source mutations, overwrites, deletes, or receipts happened here.</p>
  </section>
  <section class="cards">
    {''.join(card_html)}
  </section>
</main>
</body>
</html>"""


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") or {}
    lines = [
        "# Quipsly Studio Package Quality Desk",
        "",
        "This is the local read-first surface for Episodes 1-6. It does not export, repair, approve, publish, schedule, upload, mutate accounts, capture receipts, or touch original media.",
        "",
        f"Generated: {payload.get('updatedAt')}",
        f"Episodes: {counts.get('episodes', 0)}",
        f"Current-best packages: {counts.get('currentBestPackages', 0)}",
        f"Reviewable packages: {counts.get('reviewablePackages', 0)}",
        f"Packet-prep-ready packages: {counts.get('packetPrepReadyPackages', 0)}",
        f"Warning episodes: {counts.get('warningEpisodes', 0)}",
        f"Pending review rows: {counts.get('pendingReviewRows', 0)}",
        f"Ready shorts: {counts.get('readyShorts', 0)}",
        f"Start-here rows: {counts.get('startHereRows', 0)}",
        f"Captured receipts: {counts.get('capturedReceipts', 0)}",
        "",
        "## Next safest action",
        "",
        str(payload.get("nextSafestAction") or "Open the desk and choose the next reversible local action."),
        "",
        "## Human ask",
        "",
        str(payload.get("humanAsk") or ""),
        "",
        "## Agent-safe parallel work",
        "",
        str(payload.get("agentSafeParallelWork") or ""),
        "",
        "## Review contract",
        "",
    ]
    for item in payload.get("reviewContract") or []:
        lines.append(f"- {item}")
    lines.append("")
    first = payload.get("firstSafeAction") or {}
    if first.get("command"):
        lines += ["```bash", str(first.get("command")), "```", ""]
    start_here = [item for item in payload.get("startHereQueue") or [] if isinstance(item, dict)]
    if start_here:
        lines += [
            "## Start here: package review queue",
            "",
            "Open local evidence first. These rows do not publish, approve, upload, overwrite, mutate originals, or create receipt truth.",
            "",
        ]
        for item in start_here:
            lines.append(f"- {item.get('queueRank')}. {item.get('label')} [{item.get('status') or item.get('kind')}]")
            if item.get("why"):
                lines.append(f"  - Why: {item.get('why')}")
            if item.get("humanDecision"):
                lines.append(f"  - Human decision: {item.get('humanDecision')}")
            if item.get("codexCanDo"):
                lines.append(f"  - Codex can safely: {item.get('codexCanDo')}")
            if item.get("safeCommand"):
                lines += ["  ```bash", f"  {item.get('safeCommand')}", "  ```"]
            if item.get("dryRunCommandTemplate"):
                lines += ["  ```bash", f"  {item.get('dryRunCommandTemplate')}", "  ```"]
        lines.append("")
    queue = [item for item in payload.get("safeReviewQueue") or [] if isinstance(item, dict)]
    if queue:
        lines += ["## Safe review queue", ""]
        for item in queue:
            lines.append(f"- {item.get('label')}: {item.get('why')}")
            if item.get("command"):
                lines += ["  ```bash", f"  {item.get('command')}", "  ```"]
        lines.append("")
    lines.append("## Episode rows")
    lines.append("")
    for card in payload.get("episodes") or []:
        review_target = f" -> review {card.get('reviewTargetVersion')}" if card.get("reviewTargetVersion") else ""
        lines.append(f"- Episode {card.get('episode')} {card.get('version')}{review_target}: {card.get('status')} - {card.get('nextSafestAction')}")
        review_readiness = card.get("reviewReadiness") if isinstance(card.get("reviewReadiness"), dict) else {}
        publish_readiness = card.get("publishReadiness") if isinstance(card.get("publishReadiness"), dict) else {}
        severity = card.get("durationSpreadSeverity") if isinstance(card.get("durationSpreadSeverity"), dict) else {}
        lines.append(f"  - Review readiness: {review_readiness.get('label', 'Unknown')} - {review_readiness.get('plain', '')}")
        lines.append(f"  - Publish readiness: {publish_readiness.get('label', 'Unknown')} - {publish_readiness.get('plain', '')}")
        lines.append(f"  - A/V spread: {card.get('durationSpreadLabel')} ({severity.get('label', 'aligned')})")
        if card.get("humanAsk"):
            lines.append(f"  - Human ask: {card.get('humanAsk')}")
        if card.get("agentSafeParallelWork"):
            lines.append(f"  - Agent-safe parallel work: {card.get('agentSafeParallelWork')}")
        primary = card.get("primaryReviewAction") if isinstance(card.get("primaryReviewAction"), dict) else {}
        if primary.get("command"):
            lines += ["  ```bash", f"  {primary.get('command')}", "  ```"]
        checklist = card.get("mediaReviewChecklist") if isinstance(card.get("mediaReviewChecklist"), dict) else {}
        if checklist:
            lines.append("  - Watch-listen checklist:")
            for step in checklist.get("reviewSequence") or []:
                if not isinstance(step, dict):
                    continue
                lines.append(
                    f"    - {step.get('label')}: {step.get('check')} "
                    f"[{step.get('durationLabel') or 'no duration'}] `{step.get('path') or 'missing path'}`"
                )
            if checklist.get("manifestPath"):
                lines.append(f"  - Manifest: `{checklist.get('manifestPath')}`")
            if checklist.get("notesPath"):
                lines.append(f"  - Notes: `{checklist.get('notesPath')}`")
            if checklist.get("syncGapReportPath"):
                lines.append(f"  - Sync-gap report: `{checklist.get('syncGapReportPath')}`")
            if checklist.get("missingMediaNotesPath"):
                lines.append(f"  - Missing-media notes: `{checklist.get('missingMediaNotesPath')}`")
            if checklist.get("platformPrepDir"):
                lines.append(f"  - Platform prep: `{checklist.get('platformPrepDir')}`")
            if checklist.get("shortsDir"):
                lines.append(f"  - Shorts folder: `{checklist.get('shortsDir')}`")
    lines.append("")
    lines.append("## Safety")
    lines.append("")
    for key in ("exportsCreated", "repairsExecuted", "approvalsChanged", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "originalsMutated", "versionsOverwritten"):
        lines.append(f"- {key}: {payload.get(key)}")
    return "\n".join(lines) + "\n"


def build_desk(release_root: Path) -> dict[str, Any]:
    release_status = load_json(release_root / "release-status.json")
    validation = load_json(release_root / "review-board" / "release-validation.json")
    review_board = load_json(release_root / "review-board" / "review-board.json")
    ledger = load_json(release_root / "review-board" / "human-review-ledger.json")
    blocker_report = load_json(release_root / "review-board" / "latest-review-blocker-report.json")
    duration_workorders = load_json(release_root / "review-board" / "duration-repair-workorders" / "latest-duration-repair-workorders.json")
    candidate_review_pointer = load_json(release_root / "review-board" / "duration-candidate-reviews" / "latest-duration-candidate-review.json")
    candidate_review = candidate_review_pointer
    candidate_review_json = Path(str(candidate_review_pointer.get("jsonPath") or ""))
    if candidate_review_json.exists():
        candidate_review = load_json(candidate_review_json)
    duration_candidate_rehearsal = load_json(release_root / "review-board" / "latest-duration-candidate-decision-rehearsal.json")
    sync_investigation = load_json(release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json")
    sync_rehearsal = load_json(release_root / "review-board" / "latest-sync-decision-rehearsal.json")
    duration_decision_sheet = load_json(release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json")
    duration_warning_packet = load_json(release_root / "review-board" / "duration-warning-packets" / "latest-duration-warning-review-packet.json")
    tower_review_sheet = load_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json")

    episodes = build_episode_cards(release_root, release_status, validation, review_board, ledger, duration_workorders, sync_investigation)
    safe_review_queue = build_safe_review_queue(duration_workorders, candidate_review, duration_candidate_rehearsal, sync_investigation, sync_rehearsal, tower_review_sheet, duration_decision_sheet, release_root)
    hydrate_episode_review_affordances(episodes, safe_review_queue)
    hydrate_duration_decision_affordances(episodes, duration_decision_sheet)
    readiness_summary = build_readiness_summary(episodes)
    start_here_queue = build_package_start_here_queue(safe_review_queue, episodes)
    review_pending = 0
    review_blocking = 0
    ready_shorts = 0
    total_shorts = 0
    captured_receipts = 0
    receipt_slots = 0
    warning_episodes = 0
    blocked_episodes = 0
    current_best = 0
    for card in episodes:
        review = card.get("review") or {}
        counts = review.get("counts") or {}
        review_pending += safe_int(counts.get("pending"))
        review_blocking += safe_int(review.get("blockingCount"))
        ready_shorts += safe_int(card.get("readyShortCount"))
        total_shorts += safe_int(card.get("shortCount"))
        receipts = card.get("receipts") or {}
        captured_receipts += safe_int(receipts.get("capturedReceipts"))
        receipt_slots += safe_int(receipts.get("receiptSlots"))
        warning_episodes += 1 if safe_int(card.get("warningCount")) else 0
        blocked_episodes += 1 if safe_int(card.get("blockerCount")) else 0
        current_best += 1 if card.get("hasManifest") else 0

    workorder_counts = duration_workorders.get("counts") if isinstance(duration_workorders.get("counts"), dict) else {}
    sync_counts = sync_investigation.get("counts") if isinstance(sync_investigation.get("counts"), dict) else {}
    tower_counts = tower_review_sheet.get("counts") if isinstance(tower_review_sheet.get("counts"), dict) else {}
    first_review_queue_action = safe_review_queue[0] if safe_review_queue else {}
    duration_signal = duration_workorders if duration_workorders else duration_decision_sheet
    if duration_signal and sync_investigation:
        next_action = "Use the review queue: watch/listen the Episode 1 v004 duration candidate, inspect Episode 4 sync evidence, then use the sync decision rehearsal before any live hold/re-stack/trim decision."
    elif sync_investigation:
        next_action = sync_investigation.get("nextSafestAction") or "Open the sync investigation packet before any repair or publishing step."
    elif duration_signal:
        next_action = duration_signal.get("nextSafestAction") or "Open duration/sync evidence and choose the next reversible local action."
    elif tower_review_sheet:
        first_review_queue_action = {
            "label": "Open Tower review command sheet",
            "command": f"open {shell_quote(str(tower_review_sheet.get('htmlPath') or tower_review_sheet.get('jsonPath') or ''))}",
            "path": tower_review_sheet.get("htmlPath") or tower_review_sheet.get("jsonPath") or "",
            "safety": "Opens local review command sheet only. No external platform action.",
        }
        next_action = tower_review_sheet.get("nextSafestAction") or "Open Tower review sheet and clear local review rows before any manual publishing."
    else:
        first_review_queue_action = {
            "label": "Open review board",
            "command": f"open {shell_quote(str(release_root / 'review-board' / 'index.html'))}",
            "path": str(release_root / "review-board" / "index.html"),
            "safety": "Opens local review board only.",
        }
        next_action = "Open the review board and choose the next reversible local action."
    human_ask = package_human_ask(duration_signal, sync_investigation, tower_review_sheet)
    agent_safe_parallel_work = package_agent_safe_work(duration_signal, sync_investigation, tower_review_sheet)

    output_root = release_root / "review-board" / "studio-package-quality-desk"
    session_dir = output_root / f"{stamp_now()}-studio-package-quality-desk"
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "studio-package-quality-desk.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-studio-package-quality-desk.md"
    csv_path = session_dir / "studio-package-quality-desk.csv"
    first_safe = {
        "label": "Open Studio package quality desk",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens the local package quality desk only. It does not approve, promote, repair, publish, upload, schedule, overwrite, mutate sources, or create receipt truth.",
    }

    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "status": "package-quality-desk-ready",
        "updatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "episodes": episodes,
        "rows": build_rows(episodes),
        "counts": {
            "episodes": len(episodes),
            "currentBestPackages": current_best,
            "warningEpisodes": warning_episodes,
            "blockedEpisodes": blocked_episodes,
            "reviewablePackages": readiness_summary["reviewablePackages"],
            "packetPrepReadyPackages": readiness_summary["packetPrepReadyPackages"],
            "publishBlockedPackages": readiness_summary["publishBlockedPackages"],
            "pendingReviewRows": review_pending,
            "blockingReviewRows": review_blocking,
            "readyShorts": ready_shorts,
            "shorts": total_shorts,
            "receiptSlots": receipt_slots,
            "capturedReceipts": captured_receipts,
            "durationWorkorders": safe_int(workorder_counts.get("workorders") or len(duration_workorders.get("episodes") or [])),
            "candidateManifests": safe_int(workorder_counts.get("candidateManifests")),
            "candidateReviewPackets": safe_int(workorder_counts.get("candidateReviewPackets")),
            "durationCandidateDecisionRehearsalRows": 1 if duration_candidate_rehearsal else 0,
            "syncInvestigationRows": 1 if sync_investigation else 0,
            "syncDecisionRehearsalRows": 1 if sync_rehearsal else 0,
            "syncComparisonPoints": safe_int(sync_counts.get("comparisonPoints")),
            "towerReviewRows": safe_int(tower_counts.get("reviewRows")),
            "towerWarningRows": safe_int(tower_counts.get("warningRows")),
            "startHereRows": len(start_here_queue),
        },
        "readinessSummary": readiness_summary,
        "currentBestVersionByEpisode": readiness_summary["currentBestVersionByEpisode"],
        "durationDecisionQueue": readiness_summary["durationDecisionQueue"],
        "publishBlockers": readiness_summary["publishBlockers"],
        "nextSafestAction": next_action,
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe_parallel_work,
        "reviewContract": package_review_contract(),
        "firstSafeAction": first_safe,
        "firstReviewQueueAction": first_review_queue_action,
        "startHereQueue": start_here_queue,
        "safeReviewQueue": safe_review_queue,
        "sourceEvidence": {
            "releaseStatus": str(release_root / "release-status.json"),
            "releaseValidation": str(release_root / "review-board" / "release-validation.json"),
            "reviewBoard": str(release_root / "review-board" / "review-board.json"),
            "humanReviewLedger": str(release_root / "review-board" / "human-review-ledger.json"),
            "blockerReportHtml": blocker_report.get("htmlPath") or "",
            "durationWarningPacketHtml": duration_warning_packet.get("htmlPath") or "",
            "durationDecisionSheetHtml": duration_decision_sheet.get("htmlPath") or "",
            "durationWorkordersHtml": duration_workorders.get("htmlPath") or "",
            "durationCandidateDecisionRehearsalHtml": duration_candidate_rehearsal.get("htmlPath") or "",
            "syncInvestigationHtml": sync_investigation.get("htmlPath") or "",
            "syncDecisionRehearsalHtml": sync_rehearsal.get("htmlPath") or "",
            "towerReviewCommandSheetHtml": tower_review_sheet.get("htmlPath") or "",
        },
        "truth": {
            "localReadModelOnly": True,
            "localReadinessIsNotPublication": True,
            "reviewRowsAreNotApprovals": True,
            "receiptSlotsAreNotReceipts": True,
        },
        "exportsCreated": False,
        "repairsExecuted": False,
        "approvalsChanged": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
    }

    pointer_path = output_root / "latest-studio-package-quality-desk.json"
    review_board_pointer_path = release_root / "review-board" / "latest-studio-package-quality-desk.json"
    payload["pointerPath"] = str(pointer_path)
    payload["reviewBoardPointerPath"] = str(review_board_pointer_path)
    payload["pointerPaths"] = {
        "nested": str(pointer_path),
        "reviewBoard": str(review_board_pointer_path),
    }

    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_csv(csv_path, payload["rows"])
    write_json(json_path, payload)
    write_json(pointer_path, payload)
    write_json(review_board_pointer_path, payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local Studio Package Quality Desk.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    payload = build_desk(Path(args.release_root).expanduser())
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": payload.get("htmlPath"),
        "jsonPath": payload.get("jsonPath"),
        "markdownPath": payload.get("markdownPath"),
        "csvPath": payload.get("csvPath"),
        "pointerPath": payload.get("pointerPath"),
        "counts": payload.get("counts"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
        "safety": {
            "exportsCreated": payload.get("exportsCreated"),
            "repairsExecuted": payload.get("repairsExecuted"),
            "approvalsChanged": payload.get("approvalsChanged"),
            "externalPublishing": payload.get("externalPublishing"),
            "externalSchedulesCreated": payload.get("externalSchedulesCreated"),
            "receiptTruthCreated": payload.get("receiptTruthCreated"),
            "originalsMutated": payload.get("originalsMutated"),
            "versionsOverwritten": payload.get("versionsOverwritten"),
        },
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
