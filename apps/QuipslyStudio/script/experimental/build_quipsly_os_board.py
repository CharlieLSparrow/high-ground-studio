#!/usr/bin/env python3
"""Build a calm cross-lane Quipsly operating-system board.

The goal is not to invent another source of truth. This reads existing local
proof artifacts and summarizes the real state of Studio, Nest, Tower, Photo
Grove, and 360 work into one reviewable surface.
"""

from __future__ import annotations

import argparse
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
DEFAULT_TOWER_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Tower")
DEFAULT_BOOK_ROOT = Path("/Users/wall-e/Dev/high-ground-studio/apps/web/content/books/learning-to-lead")
DEFAULT_360_ROOTS = [Path("/Volumes/My Passport/Insta360"), Path("/Volumes/My Passport/Insta360 Download")]
DIAGNOSTIC_HOLD_MARKERS = ("smoke", "diagnostic", "test hold", "command smoke")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def is_diagnostic_review_hold(artifact: dict[str, Any]) -> bool:
    decision = str(artifact.get("decision") or "pending").lower()
    if decision not in {"hold", "refine", "reject"}:
        return False
    reviewer = str(artifact.get("reviewer") or "").lower()
    notes = str(artifact.get("notes") or "").lower()
    if reviewer not in {"codex", "agent", "automation", "quipsly"}:
        return False
    return any(marker in notes for marker in DIAGNOSTIC_HOLD_MARKERS)


def count_files(root: Path, extensions: set[str], limit: int = 100_000) -> tuple[int, list[str]]:
    if not root.exists():
        return 0, []
    total = 0
    samples: list[str] = []
    for current_root, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in {".Spotlight-V100", ".Trashes", ".fseventsd", "DerivedData", "node_modules"}]
        for filename in files:
            path = Path(current_root) / filename
            if path.suffix.lower() in extensions:
                total += 1
                if len(samples) < 8:
                    samples.append(str(path))
                if total >= limit:
                    return total, samples
    return total, samples


def latest_version_dir(episode_dir: Path) -> Path | None:
    candidates = sorted(
        [path for path in episode_dir.glob("v*") if path.is_dir()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return candidates[0] if candidates else None


def summarize_studio_action_cards(
    release_root: Path,
    release_status: dict[str, Any],
    validation: dict[str, Any],
    review_board: dict[str, Any],
    max_cards: int = 8,
) -> list[dict[str, Any]]:
    ledger = load_json(release_root / "review-board" / "human-review-ledger.json")
    duration_warning_packet = load_json(
        release_root / "review-board" / "duration-warning-packets" / "latest-duration-warning-review-packet.json"
    )
    duration_decision_sheet = load_json(
        release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json"
    )
    duration_repair_queue = load_json(
        release_root / "review-board" / "duration-repair-queues" / "latest-duration-repair-queue.json"
    )
    duration_repair_workorders = load_json(
        release_root / "review-board" / "duration-repair-workorders" / "latest-duration-repair-workorders.json"
    )
    duration_candidate_promotion = load_json(
        release_root / "review-board" / "duration-candidate-promotions" / "latest-duration-candidate-promotion-plan.json"
    )
    sync_investigation = load_json(
        release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json"
    )
    sync_stack = load_json(
        release_root / "review-board" / "sync-stacks" / "latest-episode-04-sync-stack.json"
    )
    package_quality_desk = load_json(
        release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json"
    )
    top_review_companion = load_json(
        release_root / "review-board" / "top-review-companions" / "latest-studio-top-review-companion.json"
    )
    shorts_review_cockpit = load_json(release_root / "latest-shorts-review-cockpit.json")

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

    release_by_episode = index_by_episode(release_status)
    validation_by_episode = index_by_episode(validation)
    board_by_episode = index_by_episode(review_board)
    ledger_by_episode = index_by_episode(ledger)
    episode_numbers = sorted(set(range(1, 7)) | set(release_by_episode) | set(validation_by_episode) | set(board_by_episode) | set(ledger_by_episode))

    cards: list[dict[str, Any]] = []
    if top_review_companion:
        companion_counts = top_review_companion.get("counts") if isinstance(top_review_companion.get("counts"), dict) else {}
        cards.append({
            "id": "studio-top-review-companion",
            "lane": "Studio podcast/video",
            "priority": "attention",
            "queueSortRank": -7,
            "status": top_review_companion.get("status") or "studio-top-review-companion-ready",
            "action": "Open Studio Top Review Companion",
            "explanation": (
                f"{companion_counts.get('reviewItems', 0)} top review item(s) are routed into one companion: "
                f"{companion_counts.get('durationCandidateItems', 0)} duration candidate and "
                f"{companion_counts.get('syncInvestigationItems', 0)} sync investigation item(s)."
            ),
            "itemCount": companion_counts.get("reviewItems", 0),
            "reviewPending": companion_counts.get("reviewItems", 0),
            "warningCount": companion_counts.get("syncInvestigationItems", 0),
            "runwayHtml": top_review_companion.get("htmlPath") or "",
            "runwayJson": top_review_companion.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(top_review_companion.get('htmlPath') or ''))}",
            "nextSafestAction": top_review_companion.get("nextSafestAction") or "Open the top review companion before deciding Episode 1/4 local review truth.",
            "firstSafeAction": top_review_companion.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio Top Review Companion",
                    "command": f"open {shell_quote(str(top_review_companion.get('htmlPath') or top_review_companion.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Top Review Companion only. No exports, repairs, approvals, uploads, schedules, publishing, source mutations, overwrites, deletes, or receipts.",
        })
    if package_quality_desk:
        desk_counts = package_quality_desk.get("counts") if isinstance(package_quality_desk.get("counts"), dict) else {}
        attention_count = (
            int(desk_counts.get("warningEpisodes") or 0)
            + int(desk_counts.get("blockedEpisodes") or 0)
            + int(desk_counts.get("blockingReviewRows") or 0)
            + int(desk_counts.get("syncInvestigationRows") or 0)
        )
        cards.append({
            "id": "studio-package-quality-desk",
            "lane": "Studio podcast/video",
            "priority": "attention" if attention_count else "review",
            "queueSortRank": -6,
            "status": package_quality_desk.get("status") or "package-quality-desk-ready",
            "action": "Open Studio Package Quality Desk",
            "explanation": (
                f"{desk_counts.get('episodes', 0)} episode(s), {desk_counts.get('currentBestPackages', 0)} current-best package(s), "
                f"{desk_counts.get('pendingReviewRows', 0)} pending local review row(s), {desk_counts.get('readyShorts', 0)} ready short(s), "
                f"{desk_counts.get('durationWorkorders', 0)} duration/sync work order(s), and "
                f"{desk_counts.get('syncInvestigationRows', 0)} sync investigation row(s) are combined into one Studio front door."
            ),
            "itemCount": desk_counts.get("episodes", 0),
            "reviewPending": desk_counts.get("pendingReviewRows", 0),
            "warningCount": desk_counts.get("warningEpisodes", 0),
            "shortsReady": desk_counts.get("readyShorts", 0),
            "shortsTotal": desk_counts.get("shorts", 0),
            "receiptSlots": desk_counts.get("receiptSlots", 0),
            "capturedReceipts": desk_counts.get("capturedReceipts", 0),
            "durationWorkorders": desk_counts.get("durationWorkorders", 0),
            "syncInvestigationRows": desk_counts.get("syncInvestigationRows", 0),
            "durationCandidatePromotionHtml": duration_candidate_promotion.get("htmlPath") or "",
            "durationCandidatePromotionJson": duration_candidate_promotion.get("jsonPath") or "",
            "durationCandidatePromotionExecuteAfterApproval": duration_candidate_promotion.get("executeCommandRequiresApproval") or "",
            "runwayHtml": package_quality_desk.get("htmlPath") or "",
            "runwayJson": package_quality_desk.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(package_quality_desk.get('htmlPath') or ''))}",
            "nextSafestAction": package_quality_desk.get("nextSafestAction") or "Open the Studio Package Quality Desk before touching review, repair, Tower, or receipt work.",
            "firstSafeAction": package_quality_desk.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio Package Quality Desk",
                    "command": f"open {shell_quote(str(package_quality_desk.get('htmlPath') or package_quality_desk.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Package Quality Desk only. No exports, repairs, approvals, uploads, schedules, publishing, source mutations, overwrites, deletes, or receipts.",
        })
    if shorts_review_cockpit:
        cockpit_counts = shorts_review_cockpit.get("counts") if isinstance(shorts_review_cockpit.get("counts"), dict) else {}
        cards.append({
            "id": "studio-shorts-review-cockpit",
            "lane": "Studio podcast/video",
            "priority": "attention" if int(cockpit_counts.get("reviewable") or 0) else "review",
            "queueSortRank": -5,
            "status": shorts_review_cockpit.get("status") or "shorts-review-cockpit-ready",
            "action": "Open Shorts Review Cockpit",
            "explanation": (
                f"{cockpit_counts.get('shorts', 0)} packaged short(s), {cockpit_counts.get('reviewable', 0)} reviewable with audio/video, "
                f"{cockpit_counts.get('needsAttention', 0)} attention item(s), and {cockpit_counts.get('postersCreated', 0)} local poster frame(s) are ready for watch/listen review."
            ),
            "itemCount": cockpit_counts.get("shorts", 0),
            "reviewPending": cockpit_counts.get("reviewable", 0),
            "warningCount": cockpit_counts.get("needsAttention", 0),
            "runwayHtml": shorts_review_cockpit.get("htmlPath") or "",
            "runwayJson": shorts_review_cockpit.get("jsonPath") or "",
            "decisionTemplatePath": shorts_review_cockpit.get("decisionTemplatePath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(shorts_review_cockpit.get('htmlPath') or ''))}",
            "nextSafestAction": shorts_review_cockpit.get("nextSafestAction") or "Open the Shorts Review Cockpit, watch/listen with sound, then record keep/refine/reject decisions.",
            "firstSafeAction": {
                "label": "Open Shorts Review Cockpit",
                "command": f"open {shell_quote(str(shorts_review_cockpit.get('htmlPath') or shorts_review_cockpit.get('jsonPath') or ''))}",
                "path": shorts_review_cockpit.get("htmlPath") or "",
                "safety": "Opens local shorts review evidence only. No approval, publishing, upload, schedule, receipt, overwrite, delete, or source mutation occurs.",
            },
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Shorts Review Cockpit",
                    "command": f"open {shell_quote(str(shorts_review_cockpit.get('htmlPath') or shorts_review_cockpit.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Shorts Review Cockpit only. No approvals, review mutations, external publishing, upload, schedule, receipt, overwrite, delete, or source mutation.",
        })
    if sync_investigation:
        sync_counts = sync_investigation.get("counts") if isinstance(sync_investigation.get("counts"), dict) else {}
        cards.append({
            "id": f"studio-00-sync-investigation-episode-{int(sync_investigation.get('episode') or 0):02d}",
            "lane": "Studio podcast/video",
            "priority": "attention",
            "queueSortRank": -4,
            "episode": sync_investigation.get("episode"),
            "version": sync_investigation.get("version") or "",
            "status": sync_investigation.get("status") or "sync-investigation-ready",
            "action": "Open sync investigation packet",
            "explanation": (
                f"Episode {sync_investigation.get('episode')} has a {sync_investigation.get('spreadLabel') or sync_investigation.get('durationSpreadSeconds')} "
                "long-form A/V spread. This is a re-sync/re-stack investigation, not a blind duration trim."
            ),
            "itemCount": sync_counts.get("comparisonPoints", 0),
            "reviewPending": 1,
            "warningCount": 1,
            "durationSpreadSeconds": sync_investigation.get("durationSpreadSeconds"),
            "videoDurationSeconds": sync_investigation.get("videoDurationSeconds"),
            "audioDurationSeconds": sync_investigation.get("audioDurationSeconds"),
            "syncInvestigationHtml": sync_investigation.get("htmlPath") or "",
            "syncInvestigationJson": sync_investigation.get("jsonPath") or "",
            "runwayHtml": sync_investigation.get("htmlPath") or "",
            "runwayJson": sync_investigation.get("jsonPath") or "",
            "nextSafestAction": sync_investigation.get("nextSafestAction") or "Open the sync investigation packet and decide whether to re-sync, re-stack, hold, or rebuild.",
            "firstSafeAction": sync_investigation.get("firstSafeAction") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(sync_investigation.get('htmlPath') or ''))}",
            "episodes": [sync_investigation.get("episode")],
            "safety": "Sync investigation only. No repairs, approvals, uploads, publishing, schedules, overwrites, deletes, source mutations, or receipts.",
        })
    if sync_stack:
        stack_counts = sync_stack.get("counts") if isinstance(sync_stack.get("counts"), dict) else {}
        cards.append({
            "id": "studio-00-episode-04-native-sync-stack",
            "lane": "Studio podcast/video",
            "priority": "attention",
            "queueSortRank": -3,
            "episode": sync_stack.get("episode") or 4,
            "status": sync_stack.get("status") or "episode-sync-stack-ready",
            "action": "Open Episode 4 native sync stack",
            "explanation": (
                f"Episode 4 now has a native whole-source stack with {stack_counts.get('candidateLanes', 0)} candidate lane(s), "
                f"{stack_counts.get('heldLanes', 0)} held/questionable lane(s), and {stack_counts.get('needsProxyLanes', 0)} candidate proxy gap(s). "
                "Use this as the edit/sync starting point; keep the sync investigation separate for publication readiness."
            ),
            "itemCount": stack_counts.get("lanes", 0),
            "reviewPending": 1,
            "warningCount": stack_counts.get("heldLanes", 0),
            "syncStackHtml": sync_stack.get("htmlPath") or "",
            "syncStackJson": sync_stack.get("jsonPath") or "",
            "syncStackMarkdown": sync_stack.get("markdownPath") or "",
            "sessionPath": sync_stack.get("sessionPath") or "",
            "reportPath": sync_stack.get("reportPath") or "",
            "runwayHtml": sync_stack.get("htmlPath") or "",
            "runwayJson": sync_stack.get("jsonPath") or "",
            "nextSafestAction": sync_stack.get("nextSafestAction") or "Open the Episode 4 native sync stack, confirm candidate/held lanes, then continue sync-control review before editing or publishing.",
            "firstSafeAction": sync_stack.get("firstSafeAction") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(sync_stack.get('htmlPath') or ''))}",
            "episodes": [sync_stack.get("episode") or 4],
            "safety": "Episode 4 sync stack evidence only. No repairs, approvals, uploads, publishing, schedules, overwrites, deletes, source mutations, or receipts.",
        })
    if duration_repair_workorders:
        workorder_counts = duration_repair_workorders.get("counts") if isinstance(duration_repair_workorders.get("counts"), dict) else {}
        cards.append({
            "id": "studio-00-duration-repair-workorders",
            "lane": "Studio podcast/video",
            "priority": "attention",
            "queueSortRank": -5 if int(workorder_counts.get("candidatesReadyForReview") or 0) else 0,
            "status": duration_repair_workorders.get("status") or "duration-repair-workorders-ready",
            "action": "Open duration/sync work orders",
            "explanation": (
                f"{workorder_counts.get('workorders', 0)} duration work order(s) are queued: "
                f"{workorder_counts.get('candidateManifests', 0)} candidate manifest(s), "
                f"{workorder_counts.get('candidateReviewPackets', 0)} candidate review packet(s), and "
                f"{workorder_counts.get('syncInvestigationFirst', 0)} sync-investigation-first item(s). "
                "Candidate commands are not executed, and major spreads should be treated as sync/content questions before repair."
            ),
            "itemCount": workorder_counts.get("workorders", 0),
            "reviewPending": workorder_counts.get("workorders", 0),
            "warningCount": workorder_counts.get("workorders", 0),
            "durationRepairWorkorderHtml": duration_repair_workorders.get("htmlPath") or "",
            "durationRepairWorkorderJson": duration_repair_workorders.get("jsonPath") or "",
            "durationCandidatePromotionHtml": duration_candidate_promotion.get("htmlPath") or "",
            "durationCandidatePromotionJson": duration_candidate_promotion.get("jsonPath") or "",
            "durationCandidatePromotionExecuteAfterApproval": duration_candidate_promotion.get("executeCommandRequiresApproval") or "",
            "runwayHtml": duration_repair_workorders.get("htmlPath") or "",
            "runwayJson": duration_repair_workorders.get("jsonPath") or "",
            "nextSafestAction": duration_repair_workorders.get("nextSafestAction") or "Open duration/sync work orders, review candidate and sync evidence, then choose hold/refine/approve without changing receipt truth.",
            "firstSafeAction": {
                "label": "Open duration/sync work orders",
                "command": f"open {shell_quote(str(duration_repair_workorders.get('htmlPath') or ''))}",
                "path": duration_repair_workorders.get("htmlPath") or "",
                "safety": "Opens local duration/sync work orders only. No candidate commands, approvals, publishing, uploads, schedules, source mutations, overwrites, deletes, or receipts.",
                "specificFirstSafeAction": duration_repair_workorders.get("firstSafeAction") or {},
                "candidatePromotionPlan": {
                    "label": "Open duration candidate promotion plan",
                    "command": f"open {shell_quote(str(duration_candidate_promotion.get('htmlPath') or ''))}",
                    "path": duration_candidate_promotion.get("htmlPath") or "",
                    "executeAfterApproval": duration_candidate_promotion.get("executeCommandRequiresApproval") or "",
                    "safety": "Promotion plan is dry-run/read-only unless a human explicitly runs the approval-gated execute command.",
                } if duration_candidate_promotion else {},
            },
            "firstReceiptTemplate": f"open {shell_quote(str(duration_repair_workorders.get('htmlPath') or ''))}",
            "episodes": duration_repair_workorders.get("episodes") or [],
            "safety": "Duration repair work orders only. Candidate commands are not executed; no originals, versions, receipts, uploads, schedules, or publications changed.",
        })
    if duration_repair_queue and not duration_repair_workorders:
        repair_counts = duration_repair_queue.get("counts") if isinstance(duration_repair_queue.get("counts"), dict) else {}
        repair_packet_path = duration_repair_queue.get("jsonPath") or ""
        repair_packet = load_json(Path(str(repair_packet_path))) if repair_packet_path else {}
        repair_tickets = repair_packet.get("tickets") if isinstance(repair_packet.get("tickets"), list) else []
        first_ticket = repair_tickets[0] if repair_tickets and isinstance(repair_tickets[0], dict) else {}
        first_commands = first_ticket.get("reviewCommands") if isinstance(first_ticket.get("reviewCommands"), list) else []
        first_command = str(first_commands[0].get("command") or "") if first_commands and isinstance(first_commands[0], dict) else ""
        cards.append({
            "id": "studio-00-duration-repair-queue",
            "lane": "Studio podcast/video",
            "priority": "attention",
            "queueSortRank": 0,
            "status": duration_repair_queue.get("status") or "duration-repair-queue-ready",
            "action": "Open duration repair queue",
            "explanation": (
                f"{repair_counts.get('tickets', 0)} duration repair ticket(s) translate warning spreads into evidence clips and versioned repair options. "
                "Review them before approving or regenerating any release artifact."
            ),
            "itemCount": repair_counts.get("tickets", 0),
            "reviewPending": repair_counts.get("tickets", 0),
            "warningCount": repair_counts.get("tickets", 0),
            "durationRepairQueueHtml": duration_repair_queue.get("htmlPath") or "",
            "durationRepairQueueJson": duration_repair_queue.get("jsonPath") or "",
            "runwayHtml": duration_repair_queue.get("htmlPath") or "",
            "runwayJson": duration_repair_queue.get("jsonPath") or "",
            "nextSafestAction": duration_repair_queue.get("nextSafestAction") or "",
            "firstSafeAction": duration_repair_queue.get("firstSafeAction") or {},
            "firstOpenCommand": duration_repair_queue.get("firstOpenCommand") or first_command,
            "firstReviewDecisionCommand": duration_repair_queue.get("firstReviewDecisionCommand") or "",
            "firstReceiptTemplate": first_command,
            "episodes": duration_repair_queue.get("episodes") or [],
            "safety": "Duration repair queue only. No trims, regenerations, approvals, uploads, publishing, schedules, overwrites, deletes, or receipts.",
        })

    def collect_list(key: str, *sources: dict[str, Any]) -> list[Any]:
        values: list[Any] = []
        for source in sources:
            raw = source.get(key)
            if isinstance(raw, list):
                for item in raw:
                    if item not in values:
                        values.append(item)
        return values

    for episode in episode_numbers:
        release_episode = release_by_episode.get(episode, {})
        validation_episode = validation_by_episode.get(episode, {})
        board_episode = board_by_episode.get(episode, {})
        ledger_episode = ledger_by_episode.get(episode, {})
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
        warnings = collect_list("warnings", board_episode, release_episode, validation_episode, ledger_episode)
        blockers = collect_list("blockers", validation_episode, release_episode, board_episode, ledger_episode)
        blockers = [item for item in blockers if item]
        artifacts = board_episode.get("artifacts") if isinstance(board_episode.get("artifacts"), dict) else {}
        shorts = board_episode.get("shorts") if isinstance(board_episode.get("shorts"), list) else []
        ready_short_count = (
            board_episode.get("readyShortCount")
            or release_episode.get("readyShortCount")
            or validation_episode.get("readyShortCount")
            or 0
        )
        try:
            duration_spread = float(board_episode.get("longFormDurationSpreadSeconds") or release_episode.get("longFormDurationSpreadSeconds") or 0)
        except (TypeError, ValueError):
            duration_spread = 0.0

        review_artifacts = ledger_episode.get("reviewArtifacts") if isinstance(ledger_episode.get("reviewArtifacts"), list) else []
        review_counts = {"pending": 0, "approved": 0, "hold": 0, "refine": 0, "reject": 0, "diagnosticHold": 0}
        first_pending_artifact = ""
        for artifact in review_artifacts:
            if not isinstance(artifact, dict):
                continue
            decision = str(artifact.get("decision") or "pending").lower()
            if decision == "approve":
                review_counts["approved"] += 1
            elif decision in {"hold", "refine", "reject"}:
                if is_diagnostic_review_hold(artifact):
                    review_counts["diagnosticHold"] += 1
                else:
                    review_counts[decision] += 1
            else:
                review_counts["pending"] += 1
                if not first_pending_artifact:
                    first_pending_artifact = str(artifact.get("id") or "")

        blocking_review_count = review_counts["hold"] + review_counts["refine"] + review_counts["reject"]
        total_artifacts = len(review_artifacts) or len(artifacts) + len(shorts)

        if blockers:
            priority = "attention"
            status = "blocked-local-package"
            action = "Fix local package blocker"
            explanation = "This episode has a package blocker. Repair or route around it locally before asking a human to review or approve it."
        elif blocking_review_count:
            priority = "attention"
            status = "review-needs-work"
            action = "Resolve review hold/refine/reject"
            explanation = f"{blocking_review_count} review decision(s) say the package needs work. Keep the old version, create a better one, and preserve the reason."
        elif review_counts["diagnosticHold"]:
            priority = "review"
            status = "diagnostic-review-hold"
            action = "Clear or confirm diagnostic review hold"
            explanation = f"{review_counts['diagnosticHold']} diagnostic/test hold(s) are visible. Keep them visible, but do not treat them as confirmed creative defects."
        elif warnings:
            priority = "attention"
            status = "review-with-warnings"
            action = "Open duration decision sheet" if duration_decision_sheet else "Human review warning episode"
            explanation = (
                "Open the duration decision sheet, review the exact tail/extra snippets, then record hold/refine/approve before publishing."
                if duration_decision_sheet
                else "The package is reviewable, but documented warning(s) need a listen/watch decision before any manual publishing packet is trusted."
            )
        elif review_counts["pending"]:
            priority = "review"
            status = "pending-human-review"
            action = "Watch/listen and record review"
            explanation = "The local package exists. A human should review long-form video, podcast audio, and shorts before Tower treats it as approved."
        else:
            priority = "ready"
            status = "local-package-reviewed"
            action = "Prepare Tower packet after approval"
            explanation = "Local review evidence is clear. Keep publication receipt truth separate until a real external URL/provider receipt exists."

        review_command = ""
        if first_pending_artifact:
            review_command = f"./script/agentctl.sh tower-review-decision {episode} {first_pending_artifact} approve '<reviewer>' '<notes>'"

        runway_html = str(release_root / "review-board" / "index.html")
        runway_json = str(release_root / "review-board" / "review-board.json")
        if warnings and duration_decision_sheet:
            runway_html = str(duration_decision_sheet.get("htmlPath") or runway_html)
            runway_json = str(duration_decision_sheet.get("jsonPath") or runway_json)

        cards.append({
            "id": f"studio-episode-{episode:02d}-{status}",
            "lane": "Studio podcast/video",
            "priority": priority,
            "episode": episode,
            "version": version,
            "status": status,
            "action": action,
            "explanation": explanation,
            "itemCount": total_artifacts,
            "reviewPending": review_counts["pending"],
            "reviewApproved": review_counts["approved"],
            "reviewHold": blocking_review_count,
            "reviewDiagnosticHold": review_counts["diagnosticHold"],
            "shortsReady": ready_short_count,
            "shortsTotal": len(shorts),
            "warningCount": len(warnings),
            "durationSpreadSeconds": round(duration_spread, 3),
            "runwayHtml": runway_html,
            "runwayJson": runway_json,
            "openCommand": f"open {shell_quote(runway_html)}" if runway_html else "",
            "durationWarningReviewHtml": duration_warning_packet.get("htmlPath") if warnings else "",
            "durationWarningReviewJson": duration_warning_packet.get("jsonPath") if warnings else "",
            "durationDecisionSheetHtml": duration_decision_sheet.get("htmlPath") if warnings else "",
            "durationDecisionSheetJson": duration_decision_sheet.get("jsonPath") if warnings else "",
            "firstReceiptTemplate": review_command,
            "reviewSourcePath": version_dir,
            "safety": "Local Studio review guidance only. No original media mutation, external publish, upload, schedule, or fake receipt.",
        })
        if len(cards) >= max_cards:
            break
    return cards


def summarize_studio(release_root: Path) -> dict[str, Any]:
    release_status = load_json(release_root / "release-status.json")
    validation = load_json(release_root / "review-board" / "release-validation.json")
    review_board = load_json(release_root / "review-board" / "review-board.json")
    review_blockers = load_json(release_root / "review-board" / "latest-review-blocker-report.json")
    duration_warning_packet = load_json(
        release_root / "review-board" / "duration-warning-packets" / "latest-duration-warning-review-packet.json"
    )
    duration_decision_sheet = load_json(
        release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json"
    )
    duration_repair_queue = load_json(
        release_root / "review-board" / "duration-repair-queues" / "latest-duration-repair-queue.json"
    )
    duration_repair_workorders = load_json(
        release_root / "review-board" / "duration-repair-workorders" / "latest-duration-repair-workorders.json"
    )
    sync_investigation = load_json(
        release_root / "review-board" / "sync-investigations" / "latest-sync-investigation.json"
    )
    sync_stack = load_json(
        release_root / "review-board" / "sync-stacks" / "latest-episode-04-sync-stack.json"
    )
    package_quality_desk = load_json(
        release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json"
    )
    action_cards = summarize_studio_action_cards(release_root, release_status, validation, review_board)
    episodes = release_status.get("episodes") if isinstance(release_status.get("episodes"), list) else []
    warning_episodes = validation.get("warningEpisodes") or release_status.get("warningEpisodes") or []
    blocked_episodes = validation.get("blockedEpisodes") or []
    current_best = []
    for episode in range(1, 7):
        explicit = next((item for item in episodes if isinstance(item, dict) and item.get("episode") == episode), None)
        version_dir = Path(str(explicit.get("versionDir"))) if explicit and explicit.get("versionDir") else latest_version_dir(release_root / f"Episode_{episode:02d}")
        current_best.append({
            "episode": episode,
            "versionDir": str(version_dir) if version_dir else "",
            "hasManifest": bool(version_dir and (version_dir / "manifest.json").exists()),
            "hasNotes": bool(version_dir and (version_dir / "notes.md").exists()),
        })
    status = "ready-with-warnings" if warning_episodes and not blocked_episodes else "blocked" if blocked_episodes else "review-ready"
    return {
        "lane": "Studio podcast/video",
        "status": status,
        "releaseRoot": str(release_root),
        "reviewBoardHtml": str(release_root / "review-board" / "index.html"),
        "validationPath": str(release_root / "review-board" / "release-validation.json"),
        "latestReviewBlockerReportHtml": review_blockers.get("htmlPath") or "",
        "latestReviewBlockerReportJson": review_blockers.get("jsonPath") or "",
        "latestReviewBlockerReportCounts": review_blockers.get("totals") or {},
        "latestStudioPackageQualityDeskHtml": package_quality_desk.get("htmlPath") or "",
        "latestStudioPackageQualityDeskJson": package_quality_desk.get("jsonPath") or "",
        "latestStudioPackageQualityDeskMarkdown": package_quality_desk.get("markdownPath") or "",
        "latestStudioPackageQualityDeskCsv": package_quality_desk.get("csvPath") or "",
        "latestStudioPackageQualityDeskCounts": package_quality_desk.get("counts") or {},
        "latestStudioPackageQualityDeskNextSafestAction": package_quality_desk.get("nextSafestAction") or "",
        "latestStudioPackageQualityDeskFirstSafeAction": package_quality_desk.get("firstSafeAction") or {},
        "latestDurationWarningReviewHtml": duration_warning_packet.get("htmlPath") or "",
        "latestDurationWarningReviewJson": duration_warning_packet.get("jsonPath") or "",
        "latestDurationDecisionSheetHtml": duration_decision_sheet.get("htmlPath") or "",
        "latestDurationDecisionSheetJson": duration_decision_sheet.get("jsonPath") or "",
        "latestDurationDecisionSheetMarkdown": duration_decision_sheet.get("markdownPath") or "",
        "latestDurationDecisionSheetStatus": duration_decision_sheet.get("status") or "",
        "latestDurationDecisionSheetCounts": duration_decision_sheet.get("counts") or {},
        "latestDurationDecisionSheetNextSafestAction": duration_decision_sheet.get("nextSafestAction") or "",
        "latestDurationDecisionSheetFirstSafeAction": duration_decision_sheet.get("firstSafeAction") or {},
        "latestDurationDecisionSheetEpisodes": duration_decision_sheet.get("episodes") or [],
        "latestDurationRepairQueueHtml": duration_repair_queue.get("htmlPath") or "",
        "latestDurationRepairQueueJson": duration_repair_queue.get("jsonPath") or "",
        "latestDurationRepairQueueMarkdown": duration_repair_queue.get("markdownPath") or "",
        "latestDurationRepairQueueStatus": duration_repair_queue.get("status") or "",
        "latestDurationRepairQueueNextSafestAction": duration_repair_queue.get("nextSafestAction") or "",
        "latestDurationRepairQueueFirstSafeAction": duration_repair_queue.get("firstSafeAction") or {},
        "latestDurationRepairQueueEpisodes": duration_repair_queue.get("episodes") or [],
        "latestDurationRepairQueueCounts": duration_repair_queue.get("counts") or {},
        "latestDurationRepairWorkorderHtml": duration_repair_workorders.get("htmlPath") or "",
        "latestDurationRepairWorkorderJson": duration_repair_workorders.get("jsonPath") or "",
        "latestDurationRepairWorkorderMarkdown": duration_repair_workorders.get("markdownPath") or "",
        "latestDurationRepairWorkorderEpisodes": duration_repair_workorders.get("episodes") or [],
        "latestDurationRepairWorkorderCounts": duration_repair_workorders.get("counts") or {},
        "latestDurationRepairWorkordersHtml": duration_repair_workorders.get("htmlPath") or "",
        "latestDurationRepairWorkordersJson": duration_repair_workorders.get("jsonPath") or "",
        "latestDurationRepairWorkordersMarkdown": duration_repair_workorders.get("markdownPath") or "",
        "latestDurationRepairWorkordersEpisodes": duration_repair_workorders.get("episodes") or [],
        "latestDurationRepairWorkordersCounts": duration_repair_workorders.get("counts") or {},
        "latestDurationRepairWorkOrdersHtml": duration_repair_workorders.get("htmlPath") or "",
        "latestDurationRepairWorkOrdersJson": duration_repair_workorders.get("jsonPath") or "",
        "latestDurationRepairWorkOrdersMarkdown": duration_repair_workorders.get("markdownPath") or "",
        "latestDurationRepairWorkOrdersEpisodes": duration_repair_workorders.get("episodes") or [],
        "latestDurationRepairWorkOrdersCounts": duration_repair_workorders.get("counts") or {},
        "latestSyncInvestigationHtml": sync_investigation.get("htmlPath") or "",
        "latestSyncInvestigationJson": sync_investigation.get("jsonPath") or "",
        "latestSyncInvestigationMarkdown": sync_investigation.get("markdownPath") or "",
        "latestSyncInvestigationStatus": sync_investigation.get("status") or "",
        "latestSyncInvestigationCounts": sync_investigation.get("counts") or {},
        "latestSyncInvestigationNextSafestAction": sync_investigation.get("nextSafestAction") or "",
        "latestSyncInvestigationFirstSafeAction": sync_investigation.get("firstSafeAction") or {},
        "latestEpisode4SyncStackHtml": sync_stack.get("htmlPath") or "",
        "latestEpisode4SyncStackJson": sync_stack.get("jsonPath") or "",
        "latestEpisode4SyncStackMarkdown": sync_stack.get("markdownPath") or "",
        "latestEpisode4SyncStackSessionPath": sync_stack.get("sessionPath") or "",
        "latestEpisode4SyncStackReportPath": sync_stack.get("reportPath") or "",
        "latestEpisode4SyncStackStatus": sync_stack.get("status") or "",
        "latestEpisode4SyncStackCounts": sync_stack.get("counts") or {},
        "latestEpisode4SyncStackNextSafestAction": sync_stack.get("nextSafestAction") or "",
        "latestEpisode4SyncStackFirstSafeAction": sync_stack.get("firstSafeAction") or {},
        "episodesTracked": len([item for item in current_best if item["hasManifest"]]),
        "warningEpisodes": warning_episodes,
        "blockedEpisodes": blocked_episodes,
        "currentBest": current_best,
        "actionCards": action_cards,
        "nextSafestAction": (
            package_quality_desk.get("nextSafestAction")
            if package_quality_desk
            else
            "Open the sync investigation packet for Episode 4, compare video/audio evidence, then decide whether to re-sync/re-stack before any repair or publishing step."
            if sync_investigation
            else
            "Open the duration repair queue for Episodes 1 and 4, review evidence snippets, then choose hold/refine/approve before creating any new version or publishing externally."
            if duration_repair_queue
            else
            "Open the duration decision sheet for Episodes 1 and 4, review the exact snippets, then capture human hold/refine/approve decisions before any external publishing."
            if duration_decision_sheet
            else "Open the duration-warning review packet for Episodes 1 and 4, review tail/mismatch snippets, then capture human decisions before any external publishing."
        ),
        "sourceEvidence": {
            "releaseStatusExists": (release_root / "release-status.json").exists(),
            "validationExists": (release_root / "review-board" / "release-validation.json").exists(),
            "reviewBoardEpisodes": len(review_board.get("episodes") or []),
            "durationDecisionSheetExists": bool(duration_decision_sheet),
        },
    }


def summarize_tower_action_cards(
    latest_runway: dict[str, Any],
    publisher_desk: dict[str, Any],
    anomaly_sheet: dict[str, Any],
    manual_calendar: dict[str, Any],
    social_command_center: dict[str, Any],
    review_command_sheet: dict[str, Any],
    manual_packet_board: dict[str, Any],
    max_cards: int = 10,
) -> list[dict[str, Any]]:
    json_path = latest_runway.get("jsonPath")
    if not json_path:
        return []
    runway = load_json(Path(str(json_path)))
    episodes = runway.get("episodes") if isinstance(runway.get("episodes"), list) else []
    cards: list[dict[str, Any]] = []
    if publisher_desk:
        publisher_counts = publisher_desk.get("counts") if isinstance(publisher_desk.get("counts"), dict) else {}
        cards.append({
            "id": "tower-publisher-desk",
            "lane": "Tower publishing/social",
            "priority": "attention" if publisher_counts.get("pendingRows") or publisher_counts.get("warningRows") else "review",
            "queueSortRank": -1,
            "status": publisher_desk.get("status") or "publisher-desk-ready",
            "action": "Open Tower Publisher Desk",
            "explanation": (
                f"{publisher_counts.get('episodes', 0)} episode(s), {publisher_counts.get('reviewRows', 0)} review row(s), "
                f"{publisher_counts.get('socialItems', 0)} platform row(s), and {publisher_counts.get('calendarRows', 0)} draft calendar row(s) "
                "are combined into one local publishing runway. Use this front door before touching platform packets or receipt commands."
            ),
            "itemCount": publisher_counts.get("socialItems", 0),
            "reviewPending": publisher_counts.get("pendingRows", 0),
            "warningCount": publisher_counts.get("warningRows", 0),
            "receiptSlots": publisher_counts.get("receiptSlots", 0),
            "capturedReceipts": publisher_counts.get("capturedReceipts", 0),
            "runwayHtml": publisher_desk.get("htmlPath") or "",
            "runwayJson": publisher_desk.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(publisher_desk.get('htmlPath') or ''))}",
            "nextSafestAction": publisher_desk.get("nextSafestAction") or "Open the Publisher Desk, clear local review/warning rows, then use platform packets only after explicit approval.",
            "humanAsk": publisher_desk.get("humanAsk") or "",
            "agentSafeParallelWork": publisher_desk.get("agentSafeParallelWork") or "",
            "operatorLadder": publisher_desk.get("operatorLadder") or [],
            "publicationTruthContract": publisher_desk.get("publicationTruthContract") or {},
            "firstSafeAction": publisher_desk.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Tower Publisher Desk",
                    "command": f"open {shell_quote(str(publisher_desk.get('htmlPath') or publisher_desk.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Publisher Desk only. No external publish, upload, schedule, account mutation, approval execution, or receipt capture occurred.",
        })
    if manual_packet_board:
        packet_counts = manual_packet_board.get("counts") if isinstance(manual_packet_board.get("counts"), dict) else {}
        cards.append({
            "id": "tower-manual-packet-board",
            "lane": "Tower publishing/social",
            "priority": "attention" if packet_counts.get("blockedByHumanReview") or packet_counts.get("packetRowsNeedingAttention") else "review",
            "queueSortRank": -0,
            "status": manual_packet_board.get("status") or "manual-packet-board-ready",
            "action": "Open manual publishing packet board",
            "explanation": (
                f"{packet_counts.get('calendarRows', 0)} platform packet row(s), "
                f"{packet_counts.get('localPacketsReady', 0)} local packet(s) ready, "
                f"{packet_counts.get('packetRowsNeedingAttention', 0)} packet row(s) needing attention, and "
                f"{packet_counts.get('capturedReceipts', 0)} captured receipt(s). "
                "Use this as manual posting prep only after artifact review and explicit approval."
            ),
            "itemCount": packet_counts.get("calendarRows", 0),
            "reviewPending": packet_counts.get("blockedByHumanReview", 0),
            "warningCount": packet_counts.get("packetRowsNeedingAttention", 0),
            "receiptSlots": packet_counts.get("receiptSlots", 0),
            "capturedReceipts": packet_counts.get("capturedReceipts", 0),
            "runwayHtml": manual_packet_board.get("htmlPath") or "",
            "runwayJson": manual_packet_board.get("jsonPath") or "",
            "runwayMarkdown": manual_packet_board.get("markdownPath") or "",
            "nextSafestAction": manual_packet_board.get("nextSafestAction") or "Open the manual packet board, clear review holds, then use packets only after explicit approval.",
            "humanAsk": manual_packet_board.get("humanAsk") or "",
            "agentSafeParallelWork": manual_packet_board.get("agentSafeParallelWork") or "",
            "firstSafeAction": manual_packet_board.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Tower manual publishing packet board",
                    "command": f"open {shell_quote(str(manual_packet_board.get('htmlPath') or manual_packet_board.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Manual packet board only. No external publish, upload, schedule, account mutation, approval execution, or receipt capture occurred.",
        })
    if review_command_sheet:
        review_counts = review_command_sheet.get("counts") if isinstance(review_command_sheet.get("counts"), dict) else {}
        cards.append({
            "id": "tower-review-command-sheet",
            "lane": "Tower publishing/social",
            "priority": "attention" if review_counts.get("warningRows") else "review",
            "queueSortRank": 0,
            "status": "review-command-sheet-ready",
            "action": "Open Tower review command sheet",
            "explanation": (
                f"{review_counts.get('reviewRows', 0)} local review rows are ready across {review_counts.get('episodes', 0)} episodes. "
                "Use this to record approve/refine/hold/pending decisions before any manual publishing or receipt capture."
            ),
            "itemCount": review_counts.get("reviewRows", 0),
            "reviewPending": review_counts.get("pendingRows", 0),
            "warningCount": review_counts.get("warningRows", 0),
            "receiptSlots": review_counts.get("receiptSlots", 0),
            "capturedReceipts": review_counts.get("capturedReceipts", 0),
            "runwayHtml": review_command_sheet.get("htmlPath") or "",
            "runwayJson": review_command_sheet.get("jsonPath") or "",
            "firstReceiptTemplate": "./script/agentctl.sh tower-review-decision EPISODE artifact_id approve|refine|hold|pending '<reviewer>' '<notes>'",
            "reviewCommandTemplate": review_command_sheet.get("reviewCommandTemplate") or "./script/agentctl.sh tower-review-decision EPISODE artifact_id approve|refine|hold|pending '<reviewer>' '<notes>'",
            "nextSafestAction": review_command_sheet.get("nextSafestAction") or "Open local artifacts, review the evidence, then record approve/refine/hold/pending decisions before any publishing.",
            "firstSafeAction": review_command_sheet.get("firstSafeAction") or {},
            "receiptCommandSafety": review_command_sheet.get("receiptCommandSafety") or "Receipt capture only happens after explicit approval and real external proof.",
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Tower review command sheet",
                    "command": f"open {shell_quote(str(review_command_sheet.get('htmlPath') or review_command_sheet.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Review command sheet only. No external publish, upload, schedule, account mutation, approval execution, or receipt capture occurred.",
        })
    if social_command_center:
        social_counts = social_command_center.get("counts") if isinstance(social_command_center.get("counts"), dict) else {}
        first_item = social_command_center.get("firstQueueItem") if isinstance(social_command_center.get("firstQueueItem"), dict) else {}
        cards.append({
            "id": "tower-social-command-center",
            "lane": "Tower publishing/social",
            "priority": "attention" if social_counts.get("blockedOrReview") else "review",
            "queueSortRank": 5,
            "status": "social-command-center-ready",
            "action": "Open Tower social command center",
            "explanation": (
                f"{social_counts.get('items', 0)} platform rows are visible across {social_counts.get('episodes', 0)} episodes. "
                f"{social_counts.get('blockedOrReview', 0)} rows still need review/warning decisions before any manual posting."
            ),
            "itemCount": social_counts.get("items", 0),
            "reviewPending": social_counts.get("blockedOrReview", 0),
            "reviewApproved": social_counts.get("readyForApproval", 0),
            "capturedReceipts": social_counts.get("capturedReceipts", 0),
            "runwayHtml": social_command_center.get("htmlPath") or "",
            "runwayJson": social_command_center.get("jsonPath") or "",
            "firstReceiptTemplate": social_command_center.get("reviewCommandTemplate") or first_item.get("reviewCommandTemplate") or "",
            "reviewCommandTemplate": social_command_center.get("reviewCommandTemplate") or first_item.get("reviewCommandTemplate") or "",
            "receiptCommandTemplate": first_item.get("receiptCommandTemplate") or "",
            "receiptCommandSafety": social_command_center.get("receiptCommandSafety") or first_item.get("receiptCommandSafety") or "Receipt commands are second-stage only after explicit approval and real proof.",
            "nextSafestAction": social_command_center.get("nextSafestAction") or "Open the Tower review command sheet first, then clear review/warning rows before any manual posting.",
            "humanAsk": social_command_center.get("humanAsk") or "",
            "agentSafeParallelWork": social_command_center.get("agentSafeParallelWork") or "",
            "manualPublishingWorkflow": social_command_center.get("manualPublishingWorkflow") or [],
            "publicationTruthContract": social_command_center.get("publicationTruthContract") or {},
            "firstSafeAction": social_command_center.get("firstSafeAction") or first_item.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Tower social command center",
                    "command": f"open {shell_quote(str(social_command_center.get('htmlPath') or social_command_center.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Social command center only. It does not publish, upload, schedule, approve, mutate accounts, or capture receipts.",
        })
    if manual_calendar:
        calendar_counts = manual_calendar.get("counts") if isinstance(manual_calendar.get("counts"), dict) else {}
        cards.append({
            "id": "tower-manual-publishing-calendar",
            "lane": "Tower publishing/social",
            "priority": "review",
            "queueSortRank": 10,
            "status": "draft-calendar-ready",
            "action": "Open manual publishing calendar",
            "explanation": (
                f"{calendar_counts.get('calendarRows', 0)} draft platform rows are mapped across {calendar_counts.get('dates', 0)} local draft dates. "
                "This is planning only; clear review holds before any explicitly approved manual posting."
            ),
            "itemCount": calendar_counts.get("calendarRows", 0),
            "reviewPending": calendar_counts.get("blockedByReview", 0),
            "receiptSlots": calendar_counts.get("calendarRows", 0),
            "capturedReceipts": calendar_counts.get("capturedReceipts", 0),
            "runwayHtml": manual_calendar.get("htmlPath") or "",
            "runwayJson": manual_calendar.get("jsonPath") or "",
            "nextSafestAction": manual_calendar.get("nextSafestAction") or "Use this as a draft local planning calendar only; clear review holds before approved manual posting.",
            "safety": "Manual calendar only. No external schedule, upload, publish, account mutation, approval, or receipt capture occurred.",
        })

    def priority_for_status(status: str) -> str:
        if status in {"blocked-local-package", "review-needs-work", "reviewed-with-warnings-needs-decision"}:
            return "attention"
        if status == "diagnostic-review-hold":
            return "review"
        if status in {"needs-human-review", "approved-local-ready-no-receipts"}:
            return "review"
        return "ready"

    def action_for_episode(ep: dict[str, Any]) -> tuple[str, str]:
        status = str(ep.get("status") or "")
        if status == "blocked-local-package":
            return "Fix package blockers", "Local package evidence has blockers. Repair locally before review or publishing prep."
        if status == "review-needs-work":
            return "Resolve review hold/refine/reject", "At least one local review decision blocks publication. Keep improving or record a clearer human decision."
        if status == "diagnostic-review-hold":
            if anomaly_sheet:
                return "Open review anomaly sheet", "A likely smoke/test hold is visible. Open the anomaly sheet, then reset to pending or replace it with a real review decision."
            return "Clear or confirm diagnostic review hold", "A test/agent hold is visible. Reset it to pending if it was only a smoke flag, or replace it with a confirmed repair decision after review."
        if status == "needs-human-review":
            return "Human review needed", "Watch/listen to long-form video, podcast audio, and shorts, then record approve/refine/hold decisions."
        if status == "reviewed-with-warnings-needs-decision":
            return "Decide documented warnings", "Warnings are documented but need explicit human acceptance or repair before upload."
        if status == "approved-local-ready-no-receipts":
            return "Manual publish packet ready; receipt needed after approval", "Only after explicit approval, publish manually and capture the platform URL/provider receipt."
        if status == "published-receipts-captured":
            return "Verify captured receipts", "Receipts exist. Confirm URLs/provider IDs and add analytics placeholders when available."
        return "Review Tower state", "Inspect the runway packet and choose the next safe local action."

    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        status = str(ep.get("status") or "")
        action, explanation = action_for_episode(ep)
        receipt_summary = ep.get("receiptSummary") if isinstance(ep.get("receiptSummary"), dict) else {}
        review_summary = ep.get("reviewArtifactSummary") if isinstance(ep.get("reviewArtifactSummary"), dict) else {}
        platform_queue = ep.get("platformQueue") if isinstance(ep.get("platformQueue"), list) else []
        first_receipt = next((item for item in platform_queue if isinstance(item, dict) and not (item.get("url") or item.get("providerId"))), {})
        receipt_template = ""
        action_cards = ep.get("actionCards") if isinstance(ep.get("actionCards"), dict) else {}
        receipt_actions = action_cards.get("receiptActions") if isinstance(action_cards.get("receiptActions"), list) else []
        if first_receipt:
            platform = first_receipt.get("platform")
            receipt_action = next((item for item in receipt_actions if isinstance(item, dict) and item.get("platform") == platform), {})
            receipt_template = str(receipt_action.get("commandTemplate") or "")
        cards.append({
            "id": f"tower-episode-{int(ep.get('episode') or 0):02d}-{status or 'review'}",
            "lane": "Tower publishing/social",
            "priority": priority_for_status(status),
            "episode": ep.get("episode") or "",
            "version": ep.get("version") or "",
            "status": status,
            "action": action,
            "explanation": explanation,
            "reviewPending": review_summary.get("pending") or 0,
            "reviewApproved": review_summary.get("approved") or 0,
            "reviewHold": review_summary.get("blocking") or review_summary.get("hold") or 0,
            "reviewDiagnosticHold": review_summary.get("diagnosticHold") or 0,
            "receiptSlots": receipt_summary.get("receiptSlots") or 0,
            "capturedReceipts": receipt_summary.get("capturedReceipts") or 0,
            "shortsReady": (ep.get("shorts") or {}).get("readyCount") if isinstance(ep.get("shorts"), dict) else 0,
            "shortsTotal": (ep.get("shorts") or {}).get("count") if isinstance(ep.get("shorts"), dict) else 0,
            "warningCount": len(ep.get("warnings") or []),
            "firstReceiptTemplate": receipt_template,
            "runwayJson": str(json_path),
            "runwayHtml": latest_runway.get("htmlPath") or "",
            "anomalySheetHtml": anomaly_sheet.get("htmlPath") if status == "diagnostic-review-hold" else "",
            "anomalySheetJson": anomaly_sheet.get("jsonPath") if status == "diagnostic-review-hold" else "",
            "safety": "Local Tower action only. No external publish, upload, schedule, account mutation, or fake receipt.",
        })
        if len(cards) >= max_cards:
            break
    return cards


def summarize_tower(release_root: Path) -> dict[str, Any]:
    review_board = load_json(release_root / "review-board" / "review-board.json")
    ledger = load_json(release_root / "review-board" / "human-review-ledger.json")
    tower_start_pointer = load_json(DEFAULT_TOWER_ROOT / "latest-tower-start-here.json")
    tower_start_here = load_json(Path(str(tower_start_pointer.get("jsonPath") or ""))) if tower_start_pointer.get("jsonPath") else tower_start_pointer
    tower_pointer = load_json(release_root / "tower-runway" / "latest-tower-runway.json")
    publisher_desk_pointer = load_json(release_root / "tower-publisher-desk" / "latest-tower-publisher-desk.json")
    publishing_sprint_pointer = load_json(release_root / "tower-publishing-sprint" / "latest-tower-publishing-sprint-companion.json")
    social_pointer = load_json(release_root / "tower-social-command-center" / "latest-tower-social-command-center.json")
    manual_calendar_pointer = load_json(release_root / "tower-manual-calendar" / "latest-tower-manual-calendar.json")
    manual_packet_pointer = load_json(release_root / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json")
    review_command_pointer = load_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json")
    anomaly_pointer = load_json(release_root / "review-board" / "tower-review-anomalies" / "latest-tower-review-anomalies.json")
    publication_control_pointer = load_json(release_root / "review-board" / "latest-tower-publication-control-room.json")
    episodes = review_board.get("episodes") if isinstance(review_board.get("episodes"), list) else []
    platform_ready = 0
    platform_missing = 0
    for episode in episodes:
        platform_prep = episode.get("platformPrep") if isinstance(episode, dict) else {}
        platform_ready += len(platform_prep.get("readyPlatforms") or [])
        platform_missing += len(platform_prep.get("missingPlatforms") or [])
    receipt_slots = 0
    ledger_text = json.dumps(ledger)
    if ledger:
        receipt_slots = ledger_text.count("receipt")
    action_cards = summarize_tower_action_cards(tower_pointer, publisher_desk_pointer, anomaly_pointer, manual_calendar_pointer, social_pointer, review_command_pointer, manual_packet_pointer)
    tower_start_counts = tower_start_here.get("counts") if isinstance(tower_start_here.get("counts"), dict) else {}
    if tower_start_here:
        action_cards.insert(0, {
            "id": "tower-start-here",
            "lane": "Tower publishing/social",
            "priority": "attention" if tower_start_counts.get("reviewPending") or tower_start_counts.get("warningCount") else "review",
            "queueSortRank": -4,
            "status": tower_start_here.get("status") or "tower-start-here-ready",
            "action": "Open Tower Start Here",
            "explanation": (
                f"{tower_start_counts.get('towerPriorityItems', 0)} Tower priority item(s), "
                f"{tower_start_counts.get('receiptSlots', 0)} receipt slot(s), "
                f"{tower_start_counts.get('reviewPending', 0)} review-pending row(s), "
                f"{tower_start_counts.get('warningCount', 0)} warning row(s), and "
                f"{tower_start_counts.get('capturedReceipts', 0)} captured receipt(s) are summarized into one first-door view."
            ),
            "itemCount": tower_start_counts.get("towerPriorityItems", 0),
            "reviewPending": tower_start_counts.get("reviewPending", 0),
            "reviewApproved": 0,
            "warningCount": tower_start_counts.get("warningCount", 0),
            "receiptSlots": tower_start_counts.get("receiptSlots", 0),
            "capturedReceipts": tower_start_counts.get("capturedReceipts", 0),
            "runwayHtml": tower_start_here.get("htmlPath") or tower_start_pointer.get("htmlPath") or "",
            "runwayJson": tower_start_here.get("jsonPath") or tower_start_pointer.get("jsonPath") or "",
            "runwayMarkdown": tower_start_here.get("markdownPath") or tower_start_pointer.get("markdownPath") or "",
            "nextSafestAction": tower_start_here.get("nextSafestAction") or "Open Tower Start Here before touching approval gates, platform packets, calendars, or receipts.",
            "firstSafeAction": tower_start_here.get("firstSafeAction") or {
                "label": "Open Tower Start Here",
                "command": f"open {shell_quote(str(tower_start_here.get('htmlPath') or tower_start_pointer.get('htmlPath') or ''))}",
                "path": tower_start_here.get("htmlPath") or tower_start_pointer.get("htmlPath") or "",
                "safety": "Opens local Tower evidence only. No external publishing or receipt mutation.",
            },
            "firstReceiptTemplate": f"open {shell_quote(str(tower_start_here.get('htmlPath') or tower_start_pointer.get('htmlPath') or ''))}",
            "safety": "Tower Start Here only. No external publish, upload, schedule, account mutation, approval execution, or receipt capture occurred.",
        })
    publishing_approval_gate = publication_control_pointer.get("publishingApprovalGate") if isinstance(publication_control_pointer.get("publishingApprovalGate"), dict) else {}
    receipt_capture_ladder = publication_control_pointer.get("receiptCaptureLadder") if isinstance(publication_control_pointer.get("receiptCaptureLadder"), list) else []
    if publication_control_pointer and publishing_approval_gate:
        gate_counts = publishing_approval_gate.get("countsContext") if isinstance(publishing_approval_gate.get("countsContext"), dict) else {}
        action_cards.insert(0, {
            "id": "tower-publication-approval-gate",
            "lane": "Tower publishing/social",
            "priority": "attention" if publishing_approval_gate.get("state") != "approval-request-ready" else "review",
            "queueSortRank": -3,
            "status": publishing_approval_gate.get("state") or publication_control_pointer.get("status") or "publication-approval-gate-ready",
            "action": "Open Tower publication approval gate",
            "explanation": (
                f"{gate_counts.get('readyForApproval', 0)} approval-ready item(s), "
                f"{gate_counts.get('blockedOrReview', 0)} blocked/review row(s), "
                f"{gate_counts.get('warningRows', 0)} warning row(s), and "
                f"{gate_counts.get('capturedReceipts', 0)} captured receipt(s). "
                "Use this gate before any platform action so local packets never masquerade as publication truth."
            ),
            "itemCount": gate_counts.get("receiptSlots", 0),
            "reviewPending": gate_counts.get("blockedOrReview", 0),
            "warningCount": gate_counts.get("warningRows", 0),
            "reviewApproved": gate_counts.get("readyForApproval", 0),
            "receiptSlots": gate_counts.get("receiptSlots", 0),
            "capturedReceipts": gate_counts.get("capturedReceipts", 0),
            "runwayHtml": publication_control_pointer.get("htmlPath") or "",
            "runwayJson": publication_control_pointer.get("jsonPath") or "",
            "runwayMarkdown": publication_control_pointer.get("markdownPath") or "",
            "nextSafestAction": publication_control_pointer.get("nextSafestAction") or publishing_approval_gate.get("message") or "Open the publication control room before any manual publishing step.",
            "humanAsk": publishing_approval_gate.get("humanQuestion") or publication_control_pointer.get("humanAsk") or "",
            "agentSafeParallelWork": publication_control_pointer.get("agentSafeParallelWork") or "",
            "firstSafeAction": publication_control_pointer.get("firstSafeAction") or {},
            "operatorLadder": receipt_capture_ladder,
            "publicationTruthContract": publication_control_pointer.get("publicationTruthContract") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(publication_control_pointer.get('htmlPath') or ''))}",
            "safety": "Tower publication approval gate only. No external publish, upload, schedule, account mutation, approval execution, or receipt capture occurred.",
        })
    if publishing_sprint_pointer:
        sprint_counts = publishing_sprint_pointer.get("counts") if isinstance(publishing_sprint_pointer.get("counts"), dict) else {}
        action_cards.insert(0, {
            "id": "tower-publishing-sprint-companion",
            "lane": "Tower publishing/social",
            "priority": "attention" if sprint_counts.get("blockedOrReview") else "review",
            "queueSortRank": -2,
            "status": publishing_sprint_pointer.get("status") or "tower-publishing-sprint-ready",
            "action": "Open Tower publishing sprint",
            "explanation": (
                f"{sprint_counts.get('episodes', 0)} episode(s), "
                f"{sprint_counts.get('blockedOrReview', 0)} blocked/review row(s), "
                f"{sprint_counts.get('socialItems', 0)} platform row(s), "
                f"{sprint_counts.get('readyForApproval', 0)} ready-for-approval row(s), and "
                f"{sprint_counts.get('capturedReceipts', 0)} receipt(s) are summarized into one receipt-gated publishing sprint."
            ),
            "itemCount": sprint_counts.get("socialItems", 0),
            "reviewPending": sprint_counts.get("blockedOrReview", 0),
            "reviewApproved": sprint_counts.get("readyForApproval", 0),
            "receiptSlots": sprint_counts.get("receiptSlots", 0),
            "capturedReceipts": sprint_counts.get("capturedReceipts", 0),
            "runwayHtml": publishing_sprint_pointer.get("htmlPath") or "",
            "runwayJson": publishing_sprint_pointer.get("jsonPath") or "",
            "runwayMarkdown": publishing_sprint_pointer.get("markdownPath") or "",
            "nextSafestAction": publishing_sprint_pointer.get("nextSafestAction") or "Open the publishing sprint and clear review blockers before platform packets.",
            "humanAsk": publishing_sprint_pointer.get("humanAsk") or "",
            "agentSafeParallelWork": publishing_sprint_pointer.get("agentSafeParallelWork") or "",
            "firstSafeAction": publishing_sprint_pointer.get("firstSafeAction") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(publishing_sprint_pointer.get('htmlPath') or ''))}",
            "safety": "Tower publishing sprint only. No publish, upload, schedule, approval, account mutation, overwrite, or receipt capture occurred.",
        })
    def tower_card_sort_rank(card: dict[str, Any]) -> int:
        raw_rank = card.get("queueSortRank")
        try:
            return int(raw_rank if raw_rank not in {None, ""} else 50)
        except Exception:
            return 50

    action_cards = sorted(action_cards, key=tower_card_sort_rank)
    return {
        "lane": "Tower publishing/social",
        "status": "packet-ready-no-receipts",
        "platformReadyCount": platform_ready,
        "platformMissingCount": platform_missing,
        "receiptSignalCount": receipt_slots,
        "reviewBoardHtml": str(release_root / "review-board" / "index.html"),
        "humanReviewLedger": str(release_root / "review-board" / "human-review-ledger.json"),
        "latestTowerStartHereHtml": tower_start_here.get("htmlPath") or tower_start_pointer.get("htmlPath") or "",
        "latestTowerStartHereJson": tower_start_here.get("jsonPath") or tower_start_pointer.get("jsonPath") or "",
        "latestTowerStartHereMarkdown": tower_start_here.get("markdownPath") or tower_start_pointer.get("markdownPath") or "",
        "latestTowerStartHereCounts": tower_start_counts,
        "latestTowerRunwayHtml": tower_pointer.get("htmlPath") or "",
        "latestTowerRunwayJson": tower_pointer.get("jsonPath") or "",
        "latestTowerRunwayCounts": tower_pointer.get("counts") or {},
        "latestTowerPublisherDeskHtml": publisher_desk_pointer.get("htmlPath") or "",
        "latestTowerPublisherDeskJson": publisher_desk_pointer.get("jsonPath") or "",
        "latestTowerPublisherDeskMarkdown": publisher_desk_pointer.get("markdownPath") or "",
        "latestTowerPublisherDeskCsv": publisher_desk_pointer.get("csvPath") or "",
        "latestTowerPublisherDeskCounts": publisher_desk_pointer.get("counts") or {},
        "latestTowerPublishingSprintHtml": publishing_sprint_pointer.get("htmlPath") or "",
        "latestTowerPublishingSprintJson": publishing_sprint_pointer.get("jsonPath") or "",
        "latestTowerPublishingSprintMarkdown": publishing_sprint_pointer.get("markdownPath") or "",
        "latestTowerPublishingSprintCounts": publishing_sprint_pointer.get("counts") or {},
        "latestTowerPublicationControlRoomHtml": publication_control_pointer.get("htmlPath") or "",
        "latestTowerPublicationControlRoomJson": publication_control_pointer.get("jsonPath") or "",
        "latestTowerPublicationControlRoomMarkdown": publication_control_pointer.get("markdownPath") or "",
        "latestTowerPublicationControlRoomCounts": publication_control_pointer.get("counts") or {},
        "latestTowerPublishingApprovalGate": publishing_approval_gate,
        "latestTowerReceiptCaptureLadder": receipt_capture_ladder,
        "latestTowerPublisherHumanAsk": publisher_desk_pointer.get("humanAsk") or "",
        "latestTowerPublisherAgentSafeParallelWork": publisher_desk_pointer.get("agentSafeParallelWork") or "",
        "latestTowerOperatorLadder": publisher_desk_pointer.get("operatorLadder") or [],
        "latestTowerPublicationTruthContract": publisher_desk_pointer.get("publicationTruthContract") or social_pointer.get("publicationTruthContract") or {},
        "latestTowerSocialCommandCenterHtml": social_pointer.get("htmlPath") or "",
        "latestTowerSocialCommandCenterJson": social_pointer.get("jsonPath") or "",
        "latestTowerSocialCommandCenterCsv": social_pointer.get("csvPath") or "",
        "latestTowerSocialCommandCenterCounts": social_pointer.get("counts") or {},
        "latestTowerManualCalendarHtml": manual_calendar_pointer.get("htmlPath") or "",
        "latestTowerManualCalendarJson": manual_calendar_pointer.get("jsonPath") or "",
        "latestTowerManualCalendarCsv": manual_calendar_pointer.get("csvPath") or "",
        "latestTowerManualCalendarCounts": manual_calendar_pointer.get("counts") or {},
        "latestTowerReviewCommandSheetHtml": review_command_pointer.get("htmlPath") or "",
        "latestTowerReviewCommandSheetJson": review_command_pointer.get("jsonPath") or "",
        "latestTowerReviewCommandSheetCsv": review_command_pointer.get("csvPath") or "",
        "latestTowerReviewCommandSheetCounts": review_command_pointer.get("counts") or {},
        "latestTowerReviewAnomalyHtml": anomaly_pointer.get("htmlPath") or "",
        "latestTowerReviewAnomalyJson": anomaly_pointer.get("jsonPath") or "",
        "latestTowerReviewAnomalyCounts": anomaly_pointer.get("counts") or {},
        "actionCards": action_cards,
        "nextSafestAction": (
            "Open Tower Start Here first. It points to the review gate, publisher desk, receipt readiness packet, calendar, and social command center without performing any external platform action."
            if tower_start_here
            else
            "Open the Tower publication approval gate first. It separates local packets, explicit approval, manual platform action, and real receipt truth before anyone touches an external platform."
            if publishing_approval_gate
            else
            "Open the Tower Publisher Desk first. It combines review rows, social packets, draft calendar, and receipt slots without publishing anything."
            if publisher_desk_pointer
            else
            "Open the Tower review command sheet first, then capture local approve/refine/hold/pending decisions before calendar or receipt work."
            if review_command_pointer
            else
            "Open the Tower review anomaly sheet first, then reset smoke/test holds to pending or replace them with real review decisions."
            if (anomaly_pointer.get("counts") or {}).get("anomalies")
            else
            "Open the Tower manual publishing calendar to see draft platform order, then clear review/warning rows before explicit-approved manual posting."
            if manual_calendar_pointer
            else
            "Open the Tower social command center, clear review/warning rows first, then use platform packets for explicit-approved manual posting and real receipt capture."
            if social_pointer
            else "Use platform-prep packets for manual review; do not mark published until real URLs or provider receipts are captured."
        ),
        "publicationTruth": "Local readiness and external publication receipts are separate.",
    }


def summarize_photo_action_cards(
    latest: Path | None,
    export_prep: dict[str, Any],
    review_status: dict[str, Any],
    manifest: dict[str, Any],
    review_batch: dict[str, Any],
    cull_suggestions: dict[str, Any],
    cull_theater: dict[str, Any],
    client_proof: dict[str, Any],
    first_keepers: dict[str, Any],
    max_cards: int = 8,
) -> list[dict[str, Any]]:
    if not latest:
        return []
    cards: list[dict[str, Any]] = []
    group_actions = (((export_prep.get("actionCards") or {}).get("groupActions") or [])
                     if isinstance(export_prep.get("actionCards"), dict) else [])
    quality_group_actions = (((export_prep.get("actionCards") or {}).get("qualityTriageGroupActions") or [])
                             if isinstance(export_prep.get("actionCards"), dict) else [])
    photo_actions = (((export_prep.get("actionCards") or {}).get("photoActions") or [])
                     if isinstance(export_prep.get("actionCards"), dict) else [])
    counts = review_status.get("counts") if isinstance(review_status.get("counts"), dict) else {}
    export_counts = export_prep.get("counts") if isinstance(export_prep.get("counts"), dict) else {}
    manifest_counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}

    if cull_theater:
        theater_counts = cull_theater.get("counts") if isinstance(cull_theater.get("counts"), dict) else {}
        cards.append({
            "id": "photo-grove-cull-theater",
            "lane": "Photo Grove",
            "priority": "attention",
            "queueSortRank": -5,
            "status": cull_theater.get("status") or "photo-grove-cull-theater-ready",
            "action": "Open Photo Grove cull theater",
            "explanation": (
                f"{theater_counts.get('theaterRows', 0)} photo row(s), "
                f"{theater_counts.get('groupRows', 0)} comparison group(s), "
                f"{theater_counts.get('thumbnailRows', 0)} thumbnail row(s), and "
                f"{theater_counts.get('dryRunCommands', 0)} dry-run decision command(s) are gathered into a broad Aftershoot-like review theater."
            ),
            "itemCount": theater_counts.get("theaterRows", 0),
            "reviewPending": theater_counts.get("pending", 0) or theater_counts.get("theaterRows", 0),
            "warningCount": theater_counts.get("qualityAttention", 0),
            "runwayHtml": cull_theater.get("htmlPath") or "",
            "runwayJson": cull_theater.get("jsonPath") or "",
            "runwayMarkdown": cull_theater.get("markdownPath") or "",
            "runwayCsv": cull_theater.get("csvPath") or "",
            "nextSafestAction": cull_theater.get("nextSafestAction") or "Open the cull theater, compare one group, and rehearse dry-run keep/reject/review/favorite decisions before any sidecar metadata write.",
            "humanAsk": cull_theater.get("humanAsk") or "Review a broader batch calmly, using dry-run commands only.",
            "agentSafeParallelWork": "Summarize candidate groups, improve review evidence, and prepare dry-run decision commands without mutating originals or metadata.",
            "firstSafeAction": cull_theater.get("firstSafeAction") or {},
            "firstReceiptTemplate": (cull_theater.get("firstSafeAction") or {}).get("command") if isinstance(cull_theater.get("firstSafeAction"), dict) else "",
            "metadataCommandSafety": "Cull theater commands are dry-run unless an explicit real decision command is run later; originals stay untouched.",
            "safety": "Photo Grove cull theater only. It opens local photo evidence and dry-run command rehearsal; no metadata, sidecar, proof, export, delivery, upload, publication, source mutation, delete, overwrite, or receipt truth changed.",
        })

    if first_keepers:
        keeper_counts = first_keepers.get("counts") if isinstance(first_keepers.get("counts"), dict) else {}
        cards.append({
            "id": "photo-grove-first-keepers",
            "lane": "Photo Grove",
            "priority": "attention" if int(keeper_counts.get("selectedForClientProof") or 0) == 0 else "review",
            "queueSortRank": 3,
            "status": first_keepers.get("status") or "first-keepers-review-ready",
            "action": "Open first-keepers review packet",
            "explanation": (
                f"{keeper_counts.get('candidatePhotos', 0)} candidate photo(s) across "
                f"{keeper_counts.get('candidateGroups', 0)} group(s) are ordered for first-pass keeper review. "
                "This is a calm starting point, not an automatic cull or proof verdict."
            ),
            "itemCount": keeper_counts.get("candidatePhotos", 0),
            "reviewPending": keeper_counts.get("pending", 0),
            "reviewApproved": keeper_counts.get("selectedForClientProof", 0),
            "runwayHtml": first_keepers.get("htmlPath") or "",
            "runwayJson": first_keepers.get("jsonPath") or "",
            "nextSafestAction": first_keepers.get("nextSafestAction") or "Open the first-keepers packet, compare candidates visually, then record metadata-only keep/favorite/review decisions after source review.",
            "firstSafeAction": first_keepers.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": first_keepers.get("firstMetadataCommand") or "",
            "firstReceiptTemplate": first_keepers.get("firstMetadataCommand") or "",
            "metadataCommandSafety": first_keepers.get("firstMetadataCommandSafety") or "Metadata-only after visual/source review; originals stay untouched.",
            "safety": "First-keeper candidates only. Originals stay untouched; no metadata, delivery, export, upload, publication, or client proof was changed.",
        })

    if cull_suggestions:
        cull_counts = cull_suggestions.get("counts") if isinstance(cull_suggestions.get("counts"), dict) else {}
        cull_packet_path = cull_suggestions.get("jsonPath") or ""
        cull_packet = load_json(Path(str(cull_packet_path))) if cull_packet_path else {}
        cull_groups = cull_packet.get("suggestions") if isinstance(cull_packet.get("suggestions"), list) else []
        first_group = cull_groups[0] if cull_groups and isinstance(cull_groups[0], dict) else {}
        first_commands = first_group.get("safeLocalCommands") if isinstance(first_group.get("safeLocalCommands"), list) else []
        first_command = ""
        for command in first_commands:
            if isinstance(command, dict) and command.get("command"):
                first_command = str(command.get("command"))
                break
        cards.append({
            "id": "photo-grove-cull-suggestions",
            "lane": "Photo Grove",
            "priority": "attention",
            "queueSortRank": 10,
            "status": "first-pass-cull-suggestions-ready",
            "action": "Open first-pass cull suggestions",
            "explanation": (
                f"{cull_counts.get('suggestionGroups', 0)} review groups are arranged into an Aftershoot-like first-pass cull surface. "
                "Use it to inspect and route groups; do not treat suggestions as keep/reject verdicts."
            ),
            "itemCount": cull_counts.get("suggestionGroups", 0),
            "reviewPending": cull_counts.get("pending", 0),
            "reviewApproved": cull_counts.get("selectedForClientProof", 0),
            "runwayHtml": cull_suggestions.get("htmlPath") or "",
            "runwayJson": cull_suggestions.get("jsonPath") or "",
            "nextSafestAction": cull_suggestions.get("nextSafestAction") or "Open the first suggestion group, inspect thumbnails/source files, then record metadata-only review decisions after human judgment.",
            "firstSafeAction": cull_suggestions.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": cull_suggestions.get("firstMetadataCommand") or first_command,
            "firstReceiptTemplate": cull_suggestions.get("firstMetadataCommand") or first_command,
            "metadataCommandSafety": cull_suggestions.get("firstMetadataCommandSafety") or "Metadata-only after review; originals stay untouched.",
            "safety": "Cull suggestions only. Originals stay untouched; no metadata, delivery, export, upload, or publication was changed.",
        })

    if review_batch:
        review_batch_counts = review_batch.get("counts") if isinstance(review_batch.get("counts"), dict) else {}
        cards.append({
            "id": "photo-grove-first-review-batch",
            "lane": "Photo Grove",
            "priority": "attention",
            "queueSortRank": 15,
            "status": review_batch.get("status") or "focused-review-batch-ready",
            "action": "Open focused photo review batch",
            "explanation": (
                f"{review_batch.get('groupCount', 0)} grouped review batches are ready. "
                "Review thumbnails and choose metadata-only keep/favorite/reject/review actions; do not mutate originals."
            ),
            "itemCount": review_batch_counts.get("groups", review_batch.get("groupCount", 0)),
            "reviewPending": review_batch_counts.get("groups", review_batch.get("groupCount", 0)),
            "runwayHtml": review_batch.get("htmlPath") or "",
            "runwayJson": review_batch.get("jsonPath") or "",
            "nextSafestAction": review_batch.get("nextSafestAction") or "Review these groups in order. Use quality hints to compare, not to auto-reject.",
            "firstSafeAction": review_batch.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": review_batch.get("firstMetadataCommand") or "",
            "firstReceiptTemplate": review_batch.get("firstMetadataCommand") or "",
            "metadataCommandSafety": review_batch.get("firstMetadataCommandSafety") or "Metadata-only after review; originals stay untouched.",
            "safety": "Focused review packet only. Originals stay untouched; no cull decision, export delivery, or client publication occurred.",
        })

    if counts.get("review", 0):
        cards.append({
            "id": "photo-grove-review-routed",
            "lane": "Photo Grove",
            "priority": "review",
            "status": "review-routed",
            "action": "Review routed photo group",
            "explanation": f"{counts.get('review', 0)} photos are intentionally routed to review. Compare the burst and decide keep/favorite/reject/review in metadata only.",
            "itemCount": counts.get("review", 0),
            "reviewPending": counts.get("pending", 0),
            "reviewApproved": counts.get("keep", 0) + counts.get("favorite", 0),
            "reviewHold": counts.get("review", 0),
            "runwayHtml": str(latest / "review-status.html") if (latest / "review-status.html").exists() else "",
            "runwayJson": str(latest / "review-status.json") if (latest / "review-status.json").exists() else "",
            "safety": "Local photo review only. Originals are untouched; decisions live in sidecar metadata.",
        })

    if counts.get("pending", 0):
        cards.append({
            "id": "photo-grove-pending-cull",
            "lane": "Photo Grove",
            "priority": "review" if review_batch else "attention",
            "status": "pending-cull",
            "action": "Cull pending photo groups",
            "explanation": f"{counts.get('pending', 0)} photos still need human/agent review. Use group decisions first so bursts stay understandable.",
            "itemCount": counts.get("pending", 0),
            "reviewPending": counts.get("pending", 0),
            "runwayHtml": str(latest / "index.html") if (latest / "index.html").exists() else "",
            "runwayJson": str(latest / "manifest.json") if (latest / "manifest.json").exists() else "",
            "safety": "Cull decisions update review metadata only. No delete, move, overwrite, or original mutation.",
        })

    if manifest_counts.get("qualityHinted", 0):
        quality_total = (
            int(manifest_counts.get("sharpnessReviewCandidates") or 0)
            + int(manifest_counts.get("exposureReviewCandidates") or 0)
            + int(manifest_counts.get("suspectPreviewCandidates") or 0)
        )
        cards.append({
            "id": "photo-grove-quality-hints",
            "lane": "Photo Grove",
            "priority": "review" if quality_total else "ready",
            "status": "quality-hints-ready",
            "action": "Review photo quality hints",
            "explanation": (
                f"{manifest_counts.get('qualityHinted', 0)} thumbnails have local quality hints. "
                f"{quality_total} are sharpness/exposure/suspect-preview review candidates. "
                "Use these as routing hints, not keep/reject decisions."
            ),
            "itemCount": quality_total,
            "reviewPending": quality_total,
            "runwayHtml": str(latest / "index.html") if (latest / "index.html").exists() else "",
            "runwayJson": str(latest / "quality-hints.json") if (latest / "quality-hints.json").exists() else "",
            "safety": "Thumbnail quality hints only. Originals stay untouched; no automatic cull decision is made.",
        })

    if export_prep:
        cards.append({
            "id": "photo-grove-export-prep",
            "lane": "Photo Grove",
            "priority": "ready" if export_counts.get("review", 0) or export_counts.get("pending", 0) else "review",
            "status": "export-prep-ready",
            "action": "Open review/export-prep packet",
            "explanation": "Use the export-prep packet to see selected, review, pending, and reject sections before preparing any client packet.",
            "itemCount": export_counts.get("total", 0),
            "reviewPending": export_counts.get("pending", 0),
            "reviewApproved": export_counts.get("selected", 0),
            "runwayHtml": export_prep.get("htmlPath") or "",
            "runwayJson": export_prep.get("jsonPath") or "",
            "safety": "Export prep is a packet only. It does not copy deliverables or create client delivery.",
        })

    if client_proof:
        client_counts = client_proof.get("counts") if isinstance(client_proof.get("counts"), dict) else {}
        selected_count = int(client_counts.get("selected") or 0)
        pending_count = int(client_counts.get("pending") or 0)
        starter_count = int(client_counts.get("candidateStarterSet") or client_proof.get("candidateStarterSetCount") or 0)
        delivery_status = client_proof.get("deliveryStatus") or "packet-ready"
        next_safest = client_proof.get("nextSafestAction") or (
            f"Start with {starter_count} candidate starter photos, then record metadata-only review/keep/favorite decisions after human inspection."
            if starter_count
            else "Open the client proof packet and cull or favorite at least a small keeper set before preparing any client-facing delivery."
        )
        cards.append({
            "id": "photo-grove-client-proof-packet",
            "lane": "Photo Grove",
            "priority": "ready" if selected_count else "attention",
            "queueSortRank": 20,
            "status": delivery_status,
            "action": "Open client proof packet",
            "explanation": (
                f"{selected_count} photos are selected for proof and {pending_count} are still pending cull. "
                f"{starter_count} starter candidate(s) are available for first-pass review. "
                "Use this packet as the client-delivery readiness surface; it does not copy files or publish anything."
            ),
            "nextSafestAction": next_safest,
            "itemCount": client_counts.get("total", 0),
            "reviewPending": pending_count,
            "reviewApproved": selected_count,
            "runwayHtml": client_proof.get("htmlPath") or "",
            "runwayJson": client_proof.get("jsonPath") or "",
            "safety": "Client proof packet only. It does not copy deliverables, upload, publish, or mutate originals.",
        })

    for group in quality_group_actions:
        if len(cards) >= max_cards:
            break
        if not isinstance(group, dict):
            continue
        commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
        cards.append({
            "id": f"photo-grove-quality-group-{group.get('groupId') or len(cards)}",
            "lane": "Photo Grove",
            "priority": "review",
            "status": group.get("priority") or "quality-triage",
            "action": f"Review quality triage group {group.get('groupId') or ''}".strip(),
            "explanation": group.get("nextSafestAction") or "Use thumbnail quality hints to decide which group deserves attention first; do not auto-reject.",
            "itemCount": group.get("size") or 0,
            "reviewPending": group.get("flaggedCount") or 0,
            "firstReceiptTemplate": commands.get("routeGroupReview") or "",
            "runwayHtml": export_prep.get("htmlPath") or "",
            "runwayJson": export_prep.get("jsonPath") or "",
            "safety": "Quality hints route attention only. Commands update sidecar review metadata and never alter source photos.",
        })

    for group in group_actions:
        if len(cards) >= max_cards:
            break
        if not isinstance(group, dict):
            continue
        commands = group.get("commands") if isinstance(group.get("commands"), dict) else {}
        cards.append({
            "id": f"photo-grove-group-{group.get('groupId') or len(cards)}",
            "lane": "Photo Grove",
            "priority": "review",
            "status": "group-review",
            "action": f"Review burst {group.get('groupId') or ''}".strip(),
            "explanation": f"{group.get('firstFilename', '')} to {group.get('lastFilename', '')}: compare related frames together before choosing keep/reject/review.",
            "itemCount": group.get("size") or 0,
            "firstReceiptTemplate": commands.get("routeGroupReview") or commands.get("keepGroup4") or "",
            "runwayHtml": export_prep.get("htmlPath") or "",
            "runwayJson": export_prep.get("jsonPath") or "",
            "safety": "Group command updates sidecar review metadata. It does not delete or alter source photos.",
        })

    for photo in photo_actions:
        if len(cards) >= max_cards:
            break
        if not isinstance(photo, dict):
            continue
        commands = photo.get("commands") if isinstance(photo.get("commands"), dict) else {}
        cards.append({
            "id": f"photo-grove-photo-{photo.get('id') or len(cards)}",
            "lane": "Photo Grove",
            "priority": "review",
            "status": "photo-review",
            "action": f"Review {photo.get('filename') or 'photo'}",
            "explanation": "Single-photo action card from the export-prep packet. Prefer group decisions when this belongs to a burst.",
            "itemCount": 1,
            "firstReceiptTemplate": commands.get("review") or commands.get("keep4") or "",
            "runwayHtml": export_prep.get("htmlPath") or "",
            "runwayJson": export_prep.get("jsonPath") or "",
            "safety": "Photo command updates sidecar review metadata only; originals remain untouched.",
        })
    return cards[:max_cards]


def summarize_photo(photo_root: Path) -> dict[str, Any]:
    pointer = load_json(photo_root / "latest-photo-grove-review.json")
    counts = pointer.get("counts") or {}
    latest = Path(str(pointer.get("latestSessionDir") or "")) if pointer.get("latestSessionDir") else None
    status_path = latest / "review-status.json" if latest else Path("")
    manifest_path = latest / "manifest.json" if latest else Path("")
    export_prep_path = latest / "export-packets" / "photo-grove-export-prep.json" if latest else Path("")
    export_prep_html = latest / "export-packets" / "photo-grove-export-prep.html" if latest else Path("")
    review_batch_pointer = load_json(photo_root / "latest-photo-grove-review-batch.json")
    cull_suggestions_pointer = load_json(photo_root / "latest-photo-grove-cull-suggestions.json")
    cull_theater_pointer = load_json(photo_root / "latest-photo-grove-cull-theater.json")
    start_here_pointer = load_json(photo_root / "latest-photo-grove-start-here.json")
    command_sheet_pointer = load_json(photo_root / "latest-photo-grove-command-sheet.json")
    client_proof_pointer = load_json(photo_root / "latest-photo-grove-client-proof-packet.json")
    first_keepers_pointer = load_json(photo_root / "latest-photo-grove-first-keepers.json")
    culling_sprint_pointer = load_json(photo_root / "latest-photo-grove-culling-sprint-companion.json")
    keeper_desk_pointer = load_json(photo_root / "latest-photo-grove-keeper-desk.json")
    proof_desk_pointer = load_json(photo_root / "latest-photo-grove-proof-desk.json")
    decision_desk_pointer = load_json(photo_root / "latest-photo-grove-decision-desk.json")
    control_room_pointer = load_json(photo_root / "latest-photo-grove-control-room.json")
    first_pass_triage_pointer = load_json(photo_root / "latest-photo-grove-first-pass-triage.json")
    export_prep = load_json(export_prep_path) if export_prep_path.exists() else {}
    review_status = load_json(status_path) if status_path.exists() else {}
    manifest = load_json(manifest_path) if manifest_path.exists() else {}
    current_review_counts = (
        review_status.get("counts")
        if isinstance(review_status.get("counts"), dict)
        else export_prep.get("counts")
        if isinstance(export_prep.get("counts"), dict)
        else counts
    )
    action_cards = summarize_photo_action_cards(latest, export_prep, review_status, manifest, review_batch_pointer, cull_suggestions_pointer, cull_theater_pointer, client_proof_pointer, first_keepers_pointer)
    if start_here_pointer:
        start_counts = start_here_pointer.get("counts") if isinstance(start_here_pointer.get("counts"), dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-start-here",
            "lane": "Photo Grove",
            "priority": "attention" if start_counts.get("cardBackupActiveProcesses") or start_counts.get("cardBackupMissingDestination") else "review",
            "queueSortRank": -6,
            "status": start_here_pointer.get("status") or "photo-grove-start-here-ready",
            "action": "Open Photo Grove Start Here",
            "explanation": (
                f"{start_counts.get('cardBackupMatched', 0)} backed-up file(s), "
                f"{start_counts.get('cardBackupMissingDestination', 0)} still missing from the local copy, "
                f"{start_counts.get('cardBackupActiveProcesses', 0)} active backup process(es), "
                f"{start_counts.get('cullTheaterRows', 0)} cull theater row(s), and "
                f"{start_counts.get('cullTheaterDryRunCommands', 0)} dry-run command(s) are summarized into one Photo Grove doorway."
            ),
            "itemCount": start_counts.get("cullTheaterRows", 0),
            "reviewPending": start_counts.get("readyCullWorksheetRows", 0),
            "reviewApproved": start_counts.get("readyCullAppliedDecisions", 0),
            "warningCount": start_counts.get("cardBackupMissingDestination", 0),
            "runwayHtml": start_here_pointer.get("htmlPath") or "",
            "runwayJson": start_here_pointer.get("jsonPath") or "",
            "runwayMarkdown": start_here_pointer.get("markdownPath") or "",
            "nextSafestAction": start_here_pointer.get("nextSafestAction") or "Open Photo Grove Start Here to see backup status, cull theater, cloud approval state, and the next safe review surface.",
            "firstSafeAction": start_here_pointer.get("firstSafeAction") or {
                "label": "Open Photo Grove Start Here",
                "command": f"open {shell_quote(str(start_here_pointer.get('htmlPath') or ''))}" if start_here_pointer.get("htmlPath") else "",
                "path": start_here_pointer.get("htmlPath") or "",
                "safety": "Opens local Photo Grove status only. No originals, metadata, cloud upload, delivery, publishing, or receipt truth changed.",
            },
            "firstReceiptTemplate": f"open {shell_quote(str(start_here_pointer.get('htmlPath') or ''))}",
            "safety": "Photo Grove Start Here only. No originals, metadata, exports, delivery, uploads, publications, accounts, schedules, approvals, or receipts changed.",
        })
    if first_pass_triage_pointer:
        first_pass_counts = first_pass_triage_pointer.get("counts") if isinstance(first_pass_triage_pointer.get("counts"), dict) else {}
        first_pass_groups = first_pass_triage_pointer.get("groups") if isinstance(first_pass_triage_pointer.get("groups"), list) else []
        first_group = first_pass_groups[0] if first_pass_groups and isinstance(first_pass_groups[0], dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-first-pass-triage",
            "lane": "Photo Grove",
            "priority": "attention" if first_pass_counts.get("groups") else "review",
            "queueSortRank": -4,
            "status": first_pass_triage_pointer.get("status") or "photo-grove-first-pass-triage-ready",
            "action": "Open Photo Grove first-pass triage",
            "explanation": (
                f"{first_pass_counts.get('groups', 0)} small group(s), "
                f"{first_pass_counts.get('samples', 0)} sample frame(s), and "
                f"{first_pass_counts.get('dryRunDirections', 0)} dry-run direction(s) make the first culling pass small enough to start."
            ),
            "itemCount": first_pass_counts.get("samples", 0),
            "reviewPending": first_pass_counts.get("groups", 0),
            "reviewApproved": 0,
            "runwayHtml": first_pass_triage_pointer.get("htmlPath") or "",
            "runwayJson": first_pass_triage_pointer.get("jsonPath") or "",
            "runwayMarkdown": first_pass_triage_pointer.get("markdownPath") or "",
            "runwayCsv": first_pass_triage_pointer.get("csvPath") or "",
            "nextSafestAction": first_pass_triage_pointer.get("nextSafestAction") or "Open first-pass triage, compare one small group, and rehearse metadata-only direction before any cull decision.",
            "humanAsk": first_pass_triage_pointer.get("humanAsk") or "Compare one small triage group visually, then choose only a metadata-only keep/review/reject/favorite direction if the intent is obvious.",
            "agentSafeParallelWork": first_pass_triage_pointer.get("agentSafeParallelWork") or "Prepare evidence summaries and improve triage packets without mutating originals, metadata, exports, delivery, accounts, schedules, uploads, publications, or receipts.",
            "firstSafeAction": first_pass_triage_pointer.get("firstSafeAction") or {
                "label": "Open first-pass triage",
                "command": f"open {shell_quote(str(first_pass_triage_pointer.get('htmlPath') or ''))}" if first_pass_triage_pointer.get("htmlPath") else "",
                "safety": "Opens local first-pass triage evidence only.",
            },
            "firstReviewDecisionCommand": first_group.get("firstDryRunCommand") or "",
            "firstReceiptTemplate": first_group.get("sidecarDecisionTemplate") or "",
            "metadataCommandSafety": "First-pass triage is read-only. Dry-run directions are rehearsal only; later live decisions must write sidecar metadata without touching originals.",
            "safety": "Photo Grove first-pass triage only. No originals, metadata, exports, client delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    first_review_recipe = control_room_pointer.get("firstReviewRecipe") if isinstance(control_room_pointer.get("firstReviewRecipe"), dict) else {}
    if control_room_pointer and first_review_recipe:
        recipe_counts = first_review_recipe.get("batchCounts") if isinstance(first_review_recipe.get("batchCounts"), dict) else {}
        recipe_rows = first_review_recipe.get("reviewRows") if isinstance(first_review_recipe.get("reviewRows"), list) else []
        first_row = recipe_rows[0] if recipe_rows and isinstance(recipe_rows[0], dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-first-review-recipe",
            "lane": "Photo Grove",
            "priority": "attention" if recipe_counts.get("recipeRows") else "review",
            "queueSortRank": 0,
            "status": first_review_recipe.get("state") or control_room_pointer.get("status") or "first-review-recipe-ready",
            "action": "Open Photo Grove first review recipe",
            "explanation": (
                f"{recipe_counts.get('recipeRows', 0)} tiny cull recipe row(s), "
                f"{recipe_counts.get('workableRows', 0)} workable with source/thumbnail evidence. "
                "Start here to compare, dry-run, and record one reversible reason at a time."
            ),
            "itemCount": recipe_counts.get("recipeRows", 0),
            "reviewPending": recipe_counts.get("recipeRows", 0),
            "reviewApproved": 0,
            "runwayHtml": control_room_pointer.get("htmlPath") or "",
            "runwayJson": control_room_pointer.get("jsonPath") or "",
            "runwayMarkdown": control_room_pointer.get("markdownPath") or "",
            "nextSafestAction": control_room_pointer.get("nextSafestAction") or "Open the first review recipe, compare source and thumbnail evidence, then dry-run one metadata decision before recording anything.",
            "humanAsk": first_review_recipe.get("oneSittingGoal") or "Work one small photo cull recipe and preserve the reason for each choice.",
            "agentSafeParallelWork": control_room_pointer.get("agentSafeParallelWork") or "Improve Photo Grove review packets without mutating originals or writing metadata.",
            "firstSafeAction": control_room_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": first_row.get("firstDryRunCommand") or "",
            "firstReceiptTemplate": first_row.get("sidecarDecisionTemplate") or "",
            "metadataCommandSafety": "Recipe commands are dry-run or sidecar metadata templates. Originals stay untouched and no client delivery is created.",
            "safety": "Photo Grove first review recipe only. No originals, metadata writes, exports, client delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    if culling_sprint_pointer:
        sprint_counts = culling_sprint_pointer.get("counts") if isinstance(culling_sprint_pointer.get("counts"), dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-culling-sprint-companion",
            "lane": "Photo Grove",
            "priority": "attention" if sprint_counts.get("pending") else "review",
            "queueSortRank": -2,
            "status": culling_sprint_pointer.get("status") or "photo-grove-culling-sprint-ready",
            "action": "Open Photo Grove culling sprint",
            "explanation": (
                f"{sprint_counts.get('sprintCandidateRows', 0)} first candidate(s), "
                f"{sprint_counts.get('sprintGroupRows', 0)} group row(s), "
                f"{sprint_counts.get('pending', 0)} pending photo(s), and "
                f"{sprint_counts.get('selectedForClientProof', 0)} selected proof photo(s) are summarized into one short culling sprint."
            ),
            "itemCount": sprint_counts.get("sprintCandidateRows", 0),
            "reviewPending": sprint_counts.get("pending", 0),
            "reviewApproved": sprint_counts.get("selectedForClientProof", 0),
            "runwayHtml": culling_sprint_pointer.get("htmlPath") or "",
            "runwayJson": culling_sprint_pointer.get("jsonPath") or "",
            "runwayMarkdown": culling_sprint_pointer.get("markdownPath") or "",
            "runwayCsv": culling_sprint_pointer.get("csvPath") or "",
            "nextSafestAction": culling_sprint_pointer.get("nextSafestAction") or "Open the culling sprint, inspect source evidence, and run dry-run metadata commands first.",
            "humanAsk": culling_sprint_pointer.get("humanAsk") or "Inspect a small keeper set before making metadata-only decisions.",
            "agentSafeParallelWork": culling_sprint_pointer.get("agentSafeParallelWork") or "Prepare comparison notes and diagnostics without mutating sources.",
            "firstSafeAction": culling_sprint_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": "",
            "metadataCommandSafety": "Culling Sprint is read-only. Suggested commands should be dry-run first; live commands update sidecar review metadata only.",
            "firstReceiptTemplate": f"open {shell_quote(str(culling_sprint_pointer.get('htmlPath') or ''))}",
            "safety": "Photo Grove culling sprint only. No originals, metadata commands, exports, delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    if decision_desk_pointer:
        decision_counts = decision_desk_pointer.get("counts") if isinstance(decision_desk_pointer.get("counts"), dict) else {}
        pending_or_review = int(decision_counts.get("pending") or 0) + int(decision_counts.get("review") or 0)
        action_cards.insert(0, {
            "id": "photo-grove-decision-desk",
            "lane": "Photo Grove",
            "priority": "attention" if pending_or_review or not int(decision_counts.get("selectedForClientProof") or 0) else "review",
            "queueSortRank": -1,
            "status": decision_desk_pointer.get("status") or "decision-desk-ready",
            "action": "Open Photo Grove Decision Desk",
            "explanation": (
                f"{decision_counts.get('total', 0)} photo(s), {decision_counts.get('pending', 0)} pending, "
                f"{decision_counts.get('review', 0)} routed to review, {decision_counts.get('nextCandidateRows', 0)} next-candidate row(s), "
                f"{decision_counts.get('decisionReceiptJsonFiles', 0)} decision receipt(s), and {decision_counts.get('ledgerSnapshots', 0)} ledger snapshot(s) "
                "are joined into one non-destructive review command surface."
            ),
            "itemCount": decision_counts.get("total", 0),
            "reviewPending": pending_or_review,
            "reviewApproved": decision_counts.get("keep", 0) + decision_counts.get("favorite", 0),
            "runwayHtml": decision_desk_pointer.get("htmlPath") or "",
            "runwayJson": decision_desk_pointer.get("jsonPath") or "",
            "runwayMarkdown": decision_desk_pointer.get("markdownPath") or "",
            "runwayCsv": decision_desk_pointer.get("csvPath") or "",
            "nextSafestAction": decision_desk_pointer.get("nextSafestAction") or "Open the Decision Desk, review next candidates, then run only metadata-sidecar decisions after visual inspection.",
            "humanAsk": decision_desk_pointer.get("humanAsk") or "Compare visual evidence and decide keep, reject, or review using metadata/sidecars only.",
            "agentSafeParallelWork": decision_desk_pointer.get("agentSafeParallelWork") or "Summarize evidence, prepare diagnostics, and improve local packets without mutating sources or external accounts.",
            "reviewContract": decision_desk_pointer.get("reviewContract") or {},
            "sourceTasks": decision_desk_pointer.get("sourceTasks") or [],
            "firstSafeAction": decision_desk_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": decision_desk_pointer.get("firstReviewDecisionCommand") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(decision_desk_pointer.get('htmlPath') or ''))}",
            "metadataCommandSafety": decision_desk_pointer.get("metadataCommandSafety") or "Decision Desk is read-only. Suggested commands update sidecar review metadata only after human/agent review.",
            "safety": "Photo Grove Decision Desk only. No originals, metadata commands, exports, client delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    if proof_desk_pointer:
        proof_counts = proof_desk_pointer.get("counts") if isinstance(proof_desk_pointer.get("counts"), dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-proof-desk",
            "lane": "Photo Grove",
            "priority": "attention" if proof_counts.get("pending") else "review",
            "queueSortRank": 0,
            "status": proof_desk_pointer.get("status") or "proof-desk-ready",
            "action": "Open Photo Grove Proof Desk",
            "explanation": (
                f"{proof_counts.get('sourcePhotos', 0)} photo(s), {proof_counts.get('pending', 0)} pending review item(s), "
                f"{proof_counts.get('firstKeeperCandidates', 0)} first-keeper candidate(s), "
                f"{proof_counts.get('cullSuggestionGroups', 0)} cull suggestion group(s), and "
                f"{proof_counts.get('metadataCommandRows', 0)} metadata command row(s) are joined into one proof runway."
            ),
            "itemCount": proof_counts.get("sourcePhotos", 0),
            "reviewPending": proof_counts.get("pending", 0),
            "reviewApproved": proof_counts.get("selectedForClientProof", 0),
            "runwayHtml": proof_desk_pointer.get("htmlPath") or "",
            "runwayJson": proof_desk_pointer.get("jsonPath") or "",
            "nextSafestAction": proof_desk_pointer.get("nextSafestAction") or "Open the Photo Grove Proof Desk before culling, proof prep, or export prep.",
            "humanAsk": proof_desk_pointer.get("humanAsk") or "Use the proof desk as a read-only cull/proof front door before metadata decisions.",
            "agentSafeParallelWork": proof_desk_pointer.get("agentSafeParallelWork") or "Summarize evidence, prepare diagnostics, and improve local packets without mutating sources or external accounts.",
            "reviewContract": proof_desk_pointer.get("reviewContract") or {},
            "sourceTasks": proof_desk_pointer.get("sourceTasks") or [],
            "firstSafeAction": proof_desk_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": "",
            "metadataCommandSafety": "Proof Desk is read-only. Metadata commands are not executed automatically and originals stay untouched.",
            "firstReceiptTemplate": f"open {shell_quote(str(proof_desk_pointer.get('htmlPath') or ''))}",
            "safety": "Photo Grove Proof Desk only. No originals, metadata, exports, delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    if keeper_desk_pointer:
        keeper_counts = keeper_desk_pointer.get("counts") if isinstance(keeper_desk_pointer.get("counts"), dict) else {}
        action_cards.insert(0, {
            "id": "photo-grove-keeper-desk",
            "lane": "Photo Grove",
            "priority": "attention" if keeper_counts.get("pending") else "review",
            "queueSortRank": 1,
            "status": keeper_desk_pointer.get("status") or "keeper-desk-ready",
            "action": "Open Photo Grove Keeper Desk",
            "explanation": (
                f"{keeper_counts.get('sourcePhotos', 0)} photo(s), {keeper_counts.get('firstKeeperCandidates', 0)} first-keeper candidate(s), "
                f"{keeper_counts.get('cullSuggestionGroups', 0)} suggestion group(s), and {keeper_counts.get('metadataCommandRows', 0)} metadata command row(s) "
                "are combined into one non-mutating cull/review runway."
            ),
            "itemCount": keeper_counts.get("firstKeeperCandidates", 0),
            "reviewPending": keeper_counts.get("pending", 0),
            "reviewApproved": keeper_counts.get("selectedForClientProof", 0),
            "runwayHtml": keeper_desk_pointer.get("htmlPath") or "",
            "runwayJson": keeper_desk_pointer.get("jsonPath") or "",
            "nextSafestAction": keeper_desk_pointer.get("nextSafestAction") or "Open the Keeper Desk, inspect source evidence, and only then make metadata-only cull decisions.",
            "firstSafeAction": keeper_desk_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": "",
            "metadataCommandSafety": "Keeper Desk is evidence first. Metadata commands are not executed automatically and originals stay untouched.",
            "firstReceiptTemplate": f"open {shell_quote(str(keeper_desk_pointer.get('htmlPath') or ''))}",
            "safety": "Photo Grove Keeper Desk only. No originals, metadata, exports, delivery, uploads, publications, accounts, schedules, or receipts changed.",
        })
    if command_sheet_pointer:
        command_counts = command_sheet_pointer.get("counts") if isinstance(command_sheet_pointer.get("counts"), dict) else {}
        command_sheet_insert_index = 1 if keeper_desk_pointer else 0
        action_cards.insert(command_sheet_insert_index, {
            "id": "photo-grove-command-sheet",
            "lane": "Photo Grove",
            "priority": "attention",
            "queueSortRank": 5,
            "status": "command-sheet-ready",
            "action": "Open Photo Grove command sheet",
            "explanation": (
                f"{command_counts.get('commands', 0)} metadata-only cull commands are collected for {command_counts.get('groups', 0)} groups. "
                "Use this to route review without mutating originals or creating client delivery."
            ),
            "itemCount": command_counts.get("commands", 0),
            "reviewPending": command_counts.get("groups", 0),
            "runwayHtml": command_sheet_pointer.get("htmlPath") or "",
            "runwayJson": command_sheet_pointer.get("jsonPath") or "",
            "nextSafestAction": command_sheet_pointer.get("nextSafestAction") or "",
            "humanAsk": command_sheet_pointer.get("humanAsk") or "Open source evidence before running any metadata-only cull command.",
            "agentSafeParallelWork": command_sheet_pointer.get("agentSafeParallelWork") or "Summarize evidence, prepare diagnostics, and improve local packets without mutating sources or external accounts.",
            "reviewContract": command_sheet_pointer.get("reviewContract") or {},
            "sourceTasks": command_sheet_pointer.get("sourceTasks") or [],
            "firstReviewCommand": command_sheet_pointer.get("firstReviewCommand") or "",
            "firstCullCommand": command_sheet_pointer.get("firstCullCommand") or "",
            "firstSafeAction": command_sheet_pointer.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": command_sheet_pointer.get("firstCullCommand") or "",
            "metadataCommandSafety": command_sheet_pointer.get("metadataCommandSafety") or "Metadata-only after visual/source review; originals stay untouched.",
            "firstReceiptTemplate": f"open {shell_quote(str(command_sheet_pointer.get('htmlPath') or ''))}",
            "safety": "Photo Grove command sheet only. Commands are metadata-only suggestions; no originals, metadata, exports, delivery, upload, or publication changed.",
        })
    def photo_card_sort_rank(card: dict[str, Any]) -> int:
        raw_rank = card.get("queueSortRank")
        try:
            return int(raw_rank if raw_rank not in {None, ""} else 50)
        except Exception:
            return 50

    action_cards = sorted(action_cards, key=photo_card_sort_rank)
    return {
        "lane": "Photo Grove",
        "status": "proof-board-ready" if pointer else "needs-first-board",
        "photoRoot": str(photo_root),
        "latestSessionDir": str(latest) if latest else "",
        "latestHtml": pointer.get("htmlPath") or "",
        "latestManifest": pointer.get("manifestPath") or "",
        "latestReviewStatusHtml": str(latest / "review-status.html") if latest and (latest / "review-status.html").exists() else "",
        "latestExportPrepHtml": str(export_prep_html) if export_prep_html.exists() else "",
        "latestExportPrepJson": str(export_prep_path) if export_prep_path.exists() else "",
        "latestPhotoGroveStartHereHtml": start_here_pointer.get("htmlPath") or "",
        "latestPhotoGroveStartHereJson": start_here_pointer.get("jsonPath") or "",
        "latestPhotoGroveStartHereMarkdown": start_here_pointer.get("markdownPath") or "",
        "latestPhotoGroveStartHereCounts": start_here_pointer.get("counts") or {},
        "latestReviewBatchHtml": review_batch_pointer.get("htmlPath") or "",
        "latestReviewBatchJson": review_batch_pointer.get("jsonPath") or "",
        "latestReviewBatchMarkdown": review_batch_pointer.get("markdownPath") or "",
        "latestReviewBatchCounts": {
            "groupCount": review_batch_pointer.get("groupCount") or 0,
            "generatedAt": review_batch_pointer.get("generatedAt") or "",
        },
        "latestCullSuggestionHtml": cull_suggestions_pointer.get("htmlPath") or "",
        "latestCullSuggestionJson": cull_suggestions_pointer.get("jsonPath") or "",
        "latestCullSuggestionMarkdown": cull_suggestions_pointer.get("markdownPath") or "",
        "latestCullSuggestionCounts": cull_suggestions_pointer.get("counts") or {},
        "latestCullSuggestionsHtml": cull_suggestions_pointer.get("htmlPath") or "",
        "latestCullSuggestionsJson": cull_suggestions_pointer.get("jsonPath") or "",
        "latestCullSuggestionsMarkdown": cull_suggestions_pointer.get("markdownPath") or "",
        "latestCullSuggestionsCounts": cull_suggestions_pointer.get("counts") or {},
        "latestCullTheaterHtml": cull_theater_pointer.get("htmlPath") or "",
        "latestCullTheaterJson": cull_theater_pointer.get("jsonPath") or "",
        "latestCullTheaterMarkdown": cull_theater_pointer.get("markdownPath") or "",
        "latestCullTheaterCsv": cull_theater_pointer.get("csvPath") or "",
        "latestCullTheaterCounts": cull_theater_pointer.get("counts") or {},
        "latestFirstKeepersHtml": first_keepers_pointer.get("htmlPath") or "",
        "latestFirstKeepersJson": first_keepers_pointer.get("jsonPath") or "",
        "latestFirstKeepersMarkdown": first_keepers_pointer.get("markdownPath") or "",
        "latestFirstKeepersCsv": first_keepers_pointer.get("csvPath") or "",
        "latestFirstKeepersCounts": first_keepers_pointer.get("counts") or {},
        "latestCullingSprintHtml": culling_sprint_pointer.get("htmlPath") or "",
        "latestCullingSprintJson": culling_sprint_pointer.get("jsonPath") or "",
        "latestCullingSprintMarkdown": culling_sprint_pointer.get("markdownPath") or "",
        "latestCullingSprintCsv": culling_sprint_pointer.get("csvPath") or "",
        "latestCullingSprintCounts": culling_sprint_pointer.get("counts") or {},
        "latestPhotoGroveControlRoomHtml": control_room_pointer.get("htmlPath") or "",
        "latestPhotoGroveControlRoomJson": control_room_pointer.get("jsonPath") or "",
        "latestPhotoGroveControlRoomMarkdown": control_room_pointer.get("markdownPath") or "",
        "latestPhotoGroveControlRoomCounts": control_room_pointer.get("counts") or {},
        "latestPhotoGroveFirstPassTriageHtml": first_pass_triage_pointer.get("htmlPath") or "",
        "latestPhotoGroveFirstPassTriageJson": first_pass_triage_pointer.get("jsonPath") or "",
        "latestPhotoGroveFirstPassTriageMarkdown": first_pass_triage_pointer.get("markdownPath") or "",
        "latestPhotoGroveFirstPassTriageCsv": first_pass_triage_pointer.get("csvPath") or "",
        "latestPhotoGroveFirstPassTriageCounts": first_pass_triage_pointer.get("counts") or {},
        "latestPhotoGroveFirstReviewRecipe": first_review_recipe,
        "latestKeeperDeskHtml": keeper_desk_pointer.get("htmlPath") or "",
        "latestKeeperDeskJson": keeper_desk_pointer.get("jsonPath") or "",
        "latestKeeperDeskMarkdown": keeper_desk_pointer.get("markdownPath") or "",
        "latestKeeperDeskCsv": keeper_desk_pointer.get("csvPath") or "",
        "latestKeeperDeskCounts": keeper_desk_pointer.get("counts") or {},
        "latestProofDeskHtml": proof_desk_pointer.get("htmlPath") or "",
        "latestProofDeskJson": proof_desk_pointer.get("jsonPath") or "",
        "latestProofDeskMarkdown": proof_desk_pointer.get("markdownPath") or "",
        "latestProofDeskCsv": proof_desk_pointer.get("csvPath") or "",
        "latestProofDeskCounts": proof_desk_pointer.get("counts") or {},
        "latestDecisionDeskHtml": decision_desk_pointer.get("htmlPath") or "",
        "latestDecisionDeskJson": decision_desk_pointer.get("jsonPath") or "",
        "latestDecisionDeskMarkdown": decision_desk_pointer.get("markdownPath") or "",
        "latestDecisionDeskCsv": decision_desk_pointer.get("csvPath") or "",
        "latestDecisionDeskCandidatesCsv": decision_desk_pointer.get("candidatesCsvPath") or "",
        "latestDecisionDeskCounts": decision_desk_pointer.get("counts") or {},
        "latestDecisionDeskNextSafestAction": decision_desk_pointer.get("nextSafestAction") or "",
        "latestPhotoGroveDecisionDeskHtml": decision_desk_pointer.get("htmlPath") or "",
        "latestPhotoGroveDecisionDeskJson": decision_desk_pointer.get("jsonPath") or "",
        "latestPhotoGroveDecisionDeskMarkdown": decision_desk_pointer.get("markdownPath") or "",
        "latestPhotoGroveDecisionDeskCsv": decision_desk_pointer.get("csvPath") or "",
        "latestPhotoGroveDecisionDeskCounts": decision_desk_pointer.get("counts") or {},
        "latestPhotoGroveDecisionDeskNextSafestAction": decision_desk_pointer.get("nextSafestAction") or "",
        "latestPhotoGroveProofDeskHtml": proof_desk_pointer.get("htmlPath") or "",
        "latestPhotoGroveProofDeskJson": proof_desk_pointer.get("jsonPath") or "",
        "latestPhotoGroveProofDeskMarkdown": proof_desk_pointer.get("markdownPath") or "",
        "latestPhotoGroveProofDeskCounts": proof_desk_pointer.get("counts") or {},
        "latestCommandSheetHtml": command_sheet_pointer.get("htmlPath") or "",
        "latestCommandSheetJson": command_sheet_pointer.get("jsonPath") or "",
        "latestCommandSheetMarkdown": command_sheet_pointer.get("markdownPath") or "",
        "latestCommandSheetCounts": command_sheet_pointer.get("counts") or {},
        "latestCommandSheetNextSafestAction": command_sheet_pointer.get("nextSafestAction") or "",
        "latestCommandSheetFirstReviewCommand": command_sheet_pointer.get("firstReviewCommand") or "",
        "latestCommandSheetFirstCullCommand": command_sheet_pointer.get("firstCullCommand") or "",
        "latestPhotoGroveCommandSheetHtml": command_sheet_pointer.get("htmlPath") or "",
        "latestPhotoGroveCommandSheetJson": command_sheet_pointer.get("jsonPath") or "",
        "latestPhotoGroveCommandSheetMarkdown": command_sheet_pointer.get("markdownPath") or "",
        "latestPhotoGroveCommandSheetCounts": command_sheet_pointer.get("counts") or {},
        "latestPhotoGroveCommandSheetNextSafestAction": command_sheet_pointer.get("nextSafestAction") or "",
        "latestPhotoGroveCommandSheetFirstReviewCommand": command_sheet_pointer.get("firstReviewCommand") or "",
        "latestPhotoGroveCommandSheetFirstCullCommand": command_sheet_pointer.get("firstCullCommand") or "",
        "latestClientProofHtml": client_proof_pointer.get("htmlPath") or "",
        "latestClientProofJson": client_proof_pointer.get("jsonPath") or "",
        "latestClientProofCsv": client_proof_pointer.get("csvPath") or "",
        "latestClientProofCounts": client_proof_pointer.get("counts") or {},
        "latestClientProofDeliveryStatus": client_proof_pointer.get("deliveryStatus") or "",
        "exportPrepCounts": export_prep.get("counts") or {},
        "reviewCounts": review_status.get("counts") or {},
        "qualityHintCounts": (manifest.get("counts") or {}) if manifest else {},
        "lastDecision": review_status.get("lastDecision") or {},
        "actionCards": action_cards,
        "counts": current_review_counts,
        "sourceImportCounts": counts,
        "nextSafestAction": (
            "Open Photo Grove Start Here first. It shows live card-backup progress, the review/cull doorway, and cloud approval status without touching originals."
            if start_here_pointer
            else
            "Open the Photo Grove cull theater first. Review one comparison group, rehearse dry-run keep/reject/review/favorite choices, and keep originals and metadata untouched unless an explicit sidecar decision is approved."
            if cull_theater_pointer
            else
            "Open the Photo Grove first-pass triage first. Compare one small group, rehearse a dry-run direction, and only then move toward sidecar metadata decisions."
            if first_pass_triage_pointer
            else
            "Open the Photo Grove Control Room first. It now includes the first review recipe: compare a tiny batch, dry-run one cull direction, and keep originals untouched."
            if first_review_recipe
            else
            "Open the Photo Grove Decision Desk first. It combines current review truth, decision receipts, next candidates, proof readiness, and safe metadata-only commands without touching originals."
            if decision_desk_pointer
            else
            "Open the Photo Grove Proof Desk first. It combines keeper candidates, cull suggestions, command rows, export prep, and client proof readiness without touching originals."
            if proof_desk_pointer
            else
            "Open the Photo Grove Keeper Desk first. It combines first keepers, cull suggestions, command rows, and proof readiness without touching originals."
            if keeper_desk_pointer
            else
            "Open the first-keepers packet, compare candidate photos visually, then record only metadata-sidecar decisions that match human/agent review intent."
            if first_keepers_pointer
            else "Open the Photo Grove command sheet, inspect source/thumbnail groups, then execute only the metadata-sidecar commands that match human/agent review intent."
            if command_sheet_pointer
            else "Open the first-pass cull suggestions, inspect source/thumbnail groups, then capture any keep/favorite/reject/review decisions as metadata-only sidecar updates."
            if cull_suggestions_pointer
            else
            "Open the focused photo review batch first, then capture any keep/favorite/reject/review decisions "
            "as metadata-only sidecar updates."
            if review_batch_pointer
            else "Open the client proof packet to see selected vs pending truth, then capture metadata-only cull decisions."
            if client_proof_pointer
            else "Use the export-prep packet to review favorites/keepers/pending groups, then capture decisions in the metadata ledger."
        ),
        "sourceEvidence": {
            "latestPointerExists": (photo_root / "latest-photo-grove-review.json").exists(),
            "latestSessionExists": bool(latest and latest.exists()),
            "exportPrepExists": export_prep_path.exists(),
            "controlRoomExists": bool(control_room_pointer),
            "firstPassTriageExists": bool(first_pass_triage_pointer),
            "decisionDeskExists": bool(decision_desk_pointer),
            "reviewBatchExists": bool(review_batch_pointer),
            "firstKeepersExists": bool(first_keepers_pointer),
            "clientProofExists": bool(client_proof_pointer),
        },
    }


def summarize_writing_action_cards(
    latest_start_here: dict[str, Any],
    latest_packet: dict[str, Any],
    latest_research: dict[str, Any],
    latest_draft: dict[str, Any],
    latest_runway: dict[str, Any],
    latest_daily: dict[str, Any],
    latest_author_desk: dict[str, Any],
    latest_writing_sprint: dict[str, Any],
    latest_momentum_board: dict[str, Any],
    latest_control_room: dict[str, Any],
    latest_next_card: dict[str, Any],
    latest_idea_router: dict[str, Any],
    max_cards: int = 12,
) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    packet_counts = latest_packet.get("counts") if isinstance(latest_packet.get("counts"), dict) else {}
    workbench_counts = latest_packet.get("workbenchCounts") if isinstance(latest_packet.get("workbenchCounts"), dict) else {}
    workbench_path = latest_packet.get("workbenchJsonPath")
    draft_path = latest_draft.get("jsonPath")
    runway_path = latest_runway.get("jsonPath")
    daily_path = latest_daily.get("jsonPath")
    workbench = load_json(Path(str(workbench_path))) if workbench_path else {}
    draft_packet = load_json(Path(str(draft_path))) if draft_path else {}
    runway = load_json(Path(str(runway_path))) if runway_path else {}
    daily_packet = load_json(Path(str(daily_path))) if daily_path else {}

    if latest_start_here:
        start_counts = latest_start_here.get("counts") if isinstance(latest_start_here.get("counts"), dict) else {}
        first_action = latest_start_here.get("firstSafeAction") if isinstance(latest_start_here.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-writing-start-here",
            "lane": "Nest writing/research",
            "priority": "attention" if start_counts.get("pendingHumanReview") or start_counts.get("draftsWithReviewFlags") else "ready",
            "queueSortRank": -8,
            "status": latest_start_here.get("status") or "nest-writing-start-here-ready",
            "action": "Open Nest Writing Start Here",
            "explanation": (
                f"{start_counts.get('sourceDocuments', 0)} source document(s), "
                f"{start_counts.get('sourceWords', 0)} source word(s), "
                f"{start_counts.get('currentDrafts', 0)} current draft(s), "
                f"{start_counts.get('pendingHumanReview', 0)} pending review item(s), and "
                f"{start_counts.get('platformDraftItems', 0)} platform draft item(s) are reduced into one author-facing first door."
            ),
            "itemCount": start_counts.get("currentDrafts", 0) or start_counts.get("sourceDocuments", 0),
            "reviewPending": start_counts.get("pendingHumanReview", 0),
            "warningCount": start_counts.get("draftsWithReviewFlags", 0),
            "receiptSlots": start_counts.get("receiptSlots", 0),
            "runwayHtml": latest_start_here.get("htmlPath") or "",
            "runwayJson": latest_start_here.get("jsonPath") or "",
            "runwayMarkdown": latest_start_here.get("markdownPath") or "",
            "nextSafestAction": latest_start_here.get("nextSafestAction") or "Open Nest Writing Start Here, choose the 25-minute source-backed writing sprint, and keep draft/canon/publication truth separate.",
            "humanAsk": latest_start_here.get("humanAsk") or "Open one source-backed task and make one small useful writing move.",
            "agentSafeParallelWork": "Prepare source trails, draft packets, revision batches, and platform packets without changing canonical manuscript text or publishing.",
            "writingContract": latest_start_here.get("writingContract") or {},
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("command") or "",
            "safety": "Nest Writing Start Here only. It opens local writing orientation evidence and does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite, delete, mutate accounts, or create receipts.",
        })

    if latest_momentum_board:
        momentum_counts = latest_momentum_board.get("counts") if isinstance(latest_momentum_board.get("counts"), dict) else {}
        first_action = latest_momentum_board.get("firstSafeAction") if isinstance(latest_momentum_board.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-writing-momentum-board",
            "lane": "Nest writing/research",
            "priority": "attention" if momentum_counts.get("pendingHumanReview") else "ready",
            "queueSortRank": -7,
            "status": latest_momentum_board.get("status") or "writing-momentum-ready",
            "action": "Open Nest writing momentum board",
            "explanation": (
                f"{momentum_counts.get('sourceDocuments', 0)} source document(s), "
                f"{momentum_counts.get('sourceWords', 0)} source word(s), "
                f"{momentum_counts.get('currentDrafts', 0)} current draft(s), "
                f"{momentum_counts.get('pendingHumanReview', 0)} pending review item(s), and "
                f"{momentum_counts.get('platformDraftItems', 0)} platform draft item(s) are joined into one source-first writing loop."
            ),
            "itemCount": momentum_counts.get("currentDrafts", 0) or momentum_counts.get("sourceDocuments", 0),
            "reviewPending": momentum_counts.get("pendingHumanReview", 0),
            "warningCount": 0,
            "receiptSlots": momentum_counts.get("receiptSlots", 0),
            "runwayHtml": latest_momentum_board.get("htmlPath") or "",
            "runwayJson": latest_momentum_board.get("jsonPath") or "",
            "runwayMarkdown": latest_momentum_board.get("markdownPath") or "",
            "nextSafestAction": latest_momentum_board.get("nextSafestAction") or "Open the writing momentum board, follow the source-first recipe, and keep draft/canon/publication truth separate.",
            "humanAsk": latest_momentum_board.get("humanAsk") or "Choose one source-backed writing move.",
            "agentSafeParallelWork": latest_momentum_board.get("agentSafeParallelWork") or "Prepare drafts, outlines, comparisons, and platform packets without replacing canon or publishing.",
            "writingContract": latest_momentum_board.get("writingContract") or {},
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("command") or "",
            "safety": "Nest writing momentum board only. It opens local evidence and draft packets; it does not mutate sources, replace manuscripts, publish, upload, schedule, approve, overwrite, mutate accounts, delete, or create receipts.",
        })

    if latest_next_card:
        next_counts = latest_next_card.get("counts") if isinstance(latest_next_card.get("counts"), dict) else {}
        first_action = latest_next_card.get("firstSafeAction") if isinstance(latest_next_card.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-writing-next-card",
            "lane": "Nest writing/research",
            "priority": "attention" if next_counts.get("draftsWithReviewFlags") or next_counts.get("pendingHumanReview") else "review",
            "queueSortRank": -7,
            "status": latest_next_card.get("status") or "nest-writing-next-card-ready",
            "action": "Open next Nest writing card",
            "explanation": (
                f"Next target: {latest_next_card.get('title') or latest_next_card.get('label') or 'source-backed writing task'}. "
                f"{next_counts.get('currentDrafts', 0)} current draft(s), "
                f"{next_counts.get('pendingHumanReview', 0)} pending review item(s), "
                f"{next_counts.get('draftsWithReviewFlags', 0)} flagged draft(s), and "
                f"{next_counts.get('sourceWords', 0)} source word(s) are in context."
            ),
            "itemCount": 1,
            "reviewPending": next_counts.get("pendingHumanReview", 0),
            "warningCount": next_counts.get("draftsWithReviewFlags", 0),
            "receiptSlots": next_counts.get("receiptSlots", 0),
            "runwayHtml": latest_next_card.get("htmlPath") or latest_next_card.get("nextWritingCardPath") or "",
            "runwayJson": latest_next_card.get("jsonPath") or "",
            "runwayMarkdown": latest_next_card.get("markdownPath") or "",
            "nextSafestAction": latest_next_card.get("nextSafestAction") or "Open this source-backed next card, compare draft and source, then record a local review/revision direction without replacing canon.",
            "humanAsk": latest_next_card.get("humanAsk") or latest_next_card.get("humanQuestion") or "",
            "agentSafeParallelWork": latest_next_card.get("codexCanContinueWith") or "",
            "firstSafeAction": first_action,
            "actionLadder": latest_next_card.get("actionLadder") or [],
            "firstReceiptTemplate": first_action.get("command") or "",
            "reviewNoteDraftCommand": latest_next_card.get("reviewNoteDraftCommand") or "",
            "reviewNoteDraftSafety": latest_next_card.get("reviewNoteDraftSafety") or "",
            "safety": "Nest writing next card only. It opens local draft/source guidance and does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite, mutate accounts, or create receipts.",
        })

    if latest_idea_router:
        router_counts = latest_idea_router.get("counts") if isinstance(latest_idea_router.get("counts"), dict) else {}
        first_action = latest_idea_router.get("firstSafeAction") if isinstance(latest_idea_router.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-idea-output-router",
            "lane": "Nest writing/research",
            "priority": "attention" if router_counts.get("pendingHumanReview") else "review",
            "queueSortRank": -6,
            "status": latest_idea_router.get("status") or "nest-idea-output-router-ready",
            "action": "Open Nest idea/output router",
            "explanation": (
                f"{router_counts.get('routerRows', 0)} source-backed idea route(s), "
                f"{router_counts.get('bookRoutes', 0)} book route(s), "
                f"{router_counts.get('articleRoutes', 0)} article route(s), "
                f"{router_counts.get('socialRoutes', 0)} social route(s), and "
                f"{router_counts.get('researchRoutes', 0)} research route(s) are prepared without canon or publication mutation."
            ),
            "itemCount": router_counts.get("routerRows", 0),
            "reviewPending": router_counts.get("pendingHumanReview", 0),
            "warningCount": 0,
            "receiptSlots": router_counts.get("receiptSlots", 0),
            "runwayHtml": latest_idea_router.get("htmlPath") or "",
            "runwayJson": latest_idea_router.get("jsonPath") or "",
            "runwayMarkdown": latest_idea_router.get("markdownPath") or "",
            "runwayCsv": latest_idea_router.get("csvPath") or "",
            "nextSafestAction": latest_idea_router.get("nextSafestAction") or "Pick one source-backed idea and prepare only a local outline, source note, article angle, short outline, quote card, or platform-copy preview.",
            "humanAsk": latest_idea_router.get("humanAsk") or "Choose which output this idea should become next, if any.",
            "agentSafeParallelWork": latest_idea_router.get("agentSafeParallelWork") or "Prepare outlines and platform-copy previews without canon replacement or external publication.",
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("command") or "",
            "safety": "Nest idea/output router only. It opens local routing evidence and does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite versions, mutate accounts, or create receipts.",
        })

    if latest_control_room:
        control_counts = latest_control_room.get("counts") if isinstance(latest_control_room.get("counts"), dict) else {}
        first_action = latest_control_room.get("firstSafeAction") if isinstance(latest_control_room.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-writing-control-room",
            "lane": "Nest writing/research",
            "priority": "attention" if control_counts.get("pendingHumanReview") or control_counts.get("draftsWithReviewFlags") else "review",
            "queueSortRank": -6,
            "status": latest_control_room.get("status") or "nest-writing-control-room-ready",
            "action": "Open Nest writing control room",
            "explanation": (
                f"{control_counts.get('currentDrafts', 0)} current draft(s), "
                f"{control_counts.get('pendingHumanReview', 0)} pending human review item(s), "
                f"{control_counts.get('sourceDocuments', 0)} source document(s), "
                f"{control_counts.get('sourceWords', 0)} source word(s), and "
                f"{control_counts.get('platformDraftItems', 0)} platform draft item(s) are joined into one writing/research front door."
            ),
            "itemCount": control_counts.get("currentDrafts", 0) or control_counts.get("sourceDocuments", 0),
            "reviewPending": control_counts.get("pendingHumanReview", 0),
            "warningCount": control_counts.get("draftsWithReviewFlags", 0),
            "receiptSlots": control_counts.get("receiptSlots", 0),
            "capturedReceipts": control_counts.get("capturedReceipts", 0),
            "runwayHtml": latest_control_room.get("htmlPath") or "",
            "runwayJson": latest_control_room.get("jsonPath") or "",
            "runwayMarkdown": latest_control_room.get("markdownPath") or "",
            "nextSafestAction": latest_control_room.get("nextSafestAction") or "Open the writing control room, choose one source-backed review task, and keep canon/publication state unchanged.",
            "humanAsk": latest_control_room.get("humanAsk") or "",
            "agentSafeParallelWork": latest_control_room.get("agentSafeParallelWork") or "",
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("command") or "",
            "safety": "Nest writing control room only. It opens local source/draft/review evidence and does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite versions, or create receipts.",
        })

    if latest_research:
        research_counts = latest_research.get("counts") if isinstance(latest_research.get("counts"), dict) else {}
        first_action = latest_research.get("firstSafeAction") if isinstance(latest_research.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-research-packet",
            "lane": "Nest writing/research",
            "priority": "attention" if research_counts.get("sourcePathNeedsReview") else "ready",
            "queueSortRank": -5,
            "status": latest_research.get("status") or "research-packet-ready",
            "action": "Open Nest research packet",
            "explanation": (
                f"{research_counts.get('sourceDocuments', 0)} source document(s), "
                f"{research_counts.get('sourceWords', 0)} source word(s), "
                f"{research_counts.get('researchRows', 0)} research row(s), and "
                f"{research_counts.get('startQueueRows', 0)} start-here action(s) are routed into a source-first research surface."
            ),
            "itemCount": research_counts.get("researchRows", 0),
            "reviewPending": research_counts.get("sourcePathNeedsReview", 0),
            "runwayHtml": latest_research.get("htmlPath") or "",
            "runwayJson": latest_research.get("packetPath") or latest_research.get("jsonPath") or "",
            "runwayMarkdown": latest_research.get("markdownPath") or "",
            "runwayCsv": latest_research.get("csvPath") or "",
            "nextSafestAction": latest_research.get("nextSafestAction") or "Open the research packet, create source notes, and keep manuscript/publication truth unchanged.",
            "humanAsk": "Use this packet to decide what sources need notes, quotes, questions, or source trails before drafting or publishing.",
            "agentSafeParallelWork": latest_research.get("agentSafeParallelWork") or "Prepare source notes, comparison questions, and draft-adjacent packets without changing source files or canonical manuscript text.",
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("safeCommand") or first_action.get("command") or "",
            "safety": "Research packet only. It opens local source evidence and does not mutate source files, replace canonical manuscript text, approve drafts, publish, schedule, upload, or create receipts.",
        })

    if latest_writing_sprint:
        sprint_counts = latest_writing_sprint.get("counts") if isinstance(latest_writing_sprint.get("counts"), dict) else {}
        first_action = latest_writing_sprint.get("firstSafeAction") if isinstance(latest_writing_sprint.get("firstSafeAction"), dict) else {}
        cards.append({
            "id": "nest-writing-sprint-companion",
            "lane": "Nest writing/research",
            "priority": "attention",
            "queueSortRank": -4,
            "status": latest_writing_sprint.get("status") or "nest-writing-sprint-ready",
            "action": "Open Nest writing sprint companion",
            "explanation": (
                f"{sprint_counts.get('sprintTasks', 0)} writing sprint task(s), "
                f"{sprint_counts.get('currentDrafts', 0)} current draft(s), "
                f"{sprint_counts.get('pendingHumanReview', 0)} pending review item(s), and "
                f"{sprint_counts.get('platformDraftItems', 0)} platform draft item(s) are routed into one source-backed session."
            ),
            "itemCount": sprint_counts.get("sprintTasks", 0),
            "reviewPending": sprint_counts.get("pendingHumanReview", 0),
            "receiptSlots": sprint_counts.get("receiptSlots", 0),
            "capturedReceipts": sprint_counts.get("capturedReceipts", 0),
            "runwayHtml": latest_writing_sprint.get("htmlPath") or "",
            "runwayJson": latest_writing_sprint.get("jsonPath") or "",
            "nextSafestAction": latest_writing_sprint.get("nextSafestAction") or "Open the writing sprint companion and move one source-backed draft forward without mutating sources or canon.",
            "humanAsk": latest_writing_sprint.get("humanAsk") or "",
            "agentSafeParallelWork": latest_writing_sprint.get("agentSafeParallelWork") or "",
            "firstSafeAction": first_action,
            "firstReceiptTemplate": first_action.get("command") or "",
            "safety": "Writing sprint companion only. It opens local source/draft/runway evidence and does not mutate source files, replace canonical manuscript text, publish, upload, schedule, or create receipts.",
        })

    if latest_author_desk:
        author_counts = latest_author_desk.get("counts") if isinstance(latest_author_desk.get("counts"), dict) else {}
        author_first_task = latest_author_desk.get("firstTask") if isinstance(latest_author_desk.get("firstTask"), dict) else {}
        author_first_command = (
            author_first_task.get("openExistingDraftPacket")
            or author_first_task.get("draftPacketCommand")
            or (latest_author_desk.get("firstSafeAction") or {}).get("command")
            or ""
        )
        author_first_action = {
            "label": f"Start writing task: {author_first_task.get('title')}" if author_first_task.get("title") else "Open Nest Author Desk",
            "taskId": author_first_task.get("taskId") or "",
            "title": author_first_task.get("title") or "",
            "type": author_first_task.get("type") or "",
            "sourceCount": author_first_task.get("sourceCount") or 0,
            "wordCount": author_first_task.get("wordCount") or 0,
            "command": author_first_command,
            "safety": author_first_task.get("commandSafety") or "Opens local writing evidence only. No source files, manuscripts, publications, schedules, uploads, or receipts are changed.",
        }
        cards.append({
            "id": "nest-writing-author-desk",
            "lane": "Nest writing/research",
            "priority": "attention",
            "queueSortRank": 2,
            "status": latest_author_desk.get("status") or "author-desk-ready",
            "action": "Open Nest Author Desk",
            "explanation": (
                f"{author_counts.get('deskTasks', 0)} source-backed writing task(s) are arranged as a practical author work surface. "
                f"Start with {author_first_task.get('title') or 'the first source-backed task'} and keep source provenance visible while writing."
            ),
            "itemCount": author_counts.get("deskTasks", 0),
            "reviewPending": author_counts.get("deskTasks", 0),
            "runwayHtml": latest_author_desk.get("htmlPath") or "",
            "runwayJson": latest_author_desk.get("jsonPath") or "",
            "nextSafestAction": latest_author_desk.get("nextSafestAction") or "Open the Author Desk, choose the first task, and write/review with the source trail visible.",
            "humanAsk": latest_author_desk.get("humanAsk") or author_first_task.get("humanAsk") or "",
            "agentSafeParallelWork": latest_author_desk.get("agentSafeParallelWork") or author_first_task.get("agentSafeParallelWork") or "",
            "writingContract": latest_author_desk.get("writingContract") or author_first_task.get("writingContract") or {},
            "sourceContract": latest_author_desk.get("sourceContract") or latest_author_desk.get("writingContract") or {},
            "sourceTasks": latest_author_desk.get("sourceTasks") or [],
            "firstSafeAction": author_first_action,
            "firstTask": author_first_task,
            "firstReceiptTemplate": author_first_command,
            "safety": "Author Desk only. It does not mutate source files, replace manuscripts, publish, schedule, upload, or create receipts.",
        })

    if daily_packet:
        counts = daily_packet.get("counts") if isinstance(daily_packet.get("counts"), dict) else {}
        daily_tasks = daily_packet.get("dailyTasks") if isinstance(daily_packet.get("dailyTasks"), list) else []
        first_task = daily_tasks[0] if daily_tasks and isinstance(daily_tasks[0], dict) else {}
        commands = first_task.get("safeLocalCommands") if isinstance(first_task.get("safeLocalCommands"), list) else []
        first_command = str(commands[0].get("command") or "") if commands and isinstance(commands[0], dict) else ""
        pointer_first_task = latest_daily.get("firstTask") if isinstance(latest_daily.get("firstTask"), dict) else {}
        if not first_command:
            first_command = str(pointer_first_task.get("draftPacketCommand") or "")
        first_safe_action = {
            "taskId": first_task.get("taskId") or pointer_first_task.get("taskId") or "",
            "title": first_task.get("title") or pointer_first_task.get("title") or "",
            "focus": first_task.get("focus") or pointer_first_task.get("focus") or "",
            "safeNextAction": first_task.get("safeNextAction") or pointer_first_task.get("safeNextAction") or "",
            "sourceCount": first_task.get("sourceCount") or pointer_first_task.get("sourceCount") or 0,
            "wordCount": first_task.get("wordCount") or pointer_first_task.get("wordCount") or 0,
            "command": first_command,
            "safety": pointer_first_task.get("commandSafety") or "Local draft-packet preview only; does not mutate source files or publish.",
        }
        cards.append({
            "id": "nest-writing-daily-packet",
            "lane": "Nest writing/research",
            "priority": "review",
            "status": "daily-writing-packet-ready",
            "action": "Open daily writing packet",
            "explanation": f"{counts.get('selectedTasks', 0)} source-backed writing tasks are arranged into a safe workday, starting with {first_task.get('title') or 'the top available task'}.",
            "itemCount": counts.get("selectedTasks", 0),
            "reviewPending": counts.get("humanReviewRequired", 0),
            "runwayHtml": latest_daily.get("htmlPath") or daily_packet.get("htmlPath") or "",
            "runwayJson": latest_daily.get("jsonPath") or daily_packet.get("jsonPath") or "",
            "nextSafestAction": latest_daily.get("nextSafestAction") or daily_packet.get("nextSafestAction") or "",
            "firstSafeAction": first_safe_action,
            "firstReceiptTemplate": first_command,
            "safety": "Daily writing packet only. It points to source-backed draft previews and does not mutate source files, replace manuscripts, approve, publish, upload, schedule, or create receipts.",
        })

    if latest_packet:
        cards.append({
            "id": "nest-writing-workbench",
            "lane": "Nest writing/research",
            "priority": "ready",
            "status": "workbench-ready",
            "action": "Open writing/research workbench",
            "explanation": f"{packet_counts.get('documents', 0)} source documents and {workbench_counts.get('draftQueue', 0)} draft-queue items are indexed for source-backed writing.",
            "itemCount": workbench_counts.get("draftQueue", 0),
            "reviewApproved": packet_counts.get("readyForReview", 0),
            "reviewPending": packet_counts.get("shortNotes", 0),
            "runwayHtml": latest_packet.get("workbenchHtmlPath") or latest_packet.get("htmlPath") or "",
            "runwayJson": latest_packet.get("workbenchJsonPath") or latest_packet.get("packetPath") or "",
            "humanAsk": latest_packet.get("humanAsk") or "",
            "agentSafeParallelWork": latest_packet.get("agentSafeParallelWork") or "",
            "sourceContract": latest_packet.get("sourceContract") or {},
            "draftContract": latest_packet.get("draftContract") or {},
            "sourceTasks": latest_packet.get("sourceTasks") or [],
            "safety": "Read-only source workbench. It does not mutate manuscript/source files or publish externally.",
        })

    if draft_packet:
        safety = draft_packet.get("safety") if isinstance(draft_packet.get("safety"), dict) else {}
        draft_preview = draft_packet.get("draftPreview") if isinstance(draft_packet.get("draftPreview"), dict) else {}
        cards.append({
            "id": f"nest-writing-draft-{latest_draft.get('taskId') or 'latest'}",
            "lane": "Nest writing/research",
            "priority": "review",
            "status": latest_draft.get("status") or draft_preview.get("draftStatus") or "draft-preview-needs-human-review",
            "action": "Review latest source-backed draft packet",
            "explanation": draft_preview.get("reviewerNote") or "Compare this draft preview against its source trail before approving any use.",
            "itemCount": latest_draft.get("sourceCount") or len(draft_packet.get("sources") or []),
            "reviewPending": 1,
            "receiptSlots": len(((draft_packet.get("towerHandoff") or {}).get("receiptSlots") or [])) if isinstance(draft_packet.get("towerHandoff"), dict) else 0,
            "capturedReceipts": 0,
            "runwayHtml": latest_draft.get("htmlPath") or "",
            "runwayJson": latest_draft.get("jsonPath") or "",
            "nextSafestAction": latest_draft.get("nextSafestAction") or draft_packet.get("nextSafestAction") or "Read the draft preview with the source trail visible before requesting revisions or approving any platform packet.",
            "firstSafeAction": latest_draft.get("firstSafeAction") or draft_packet.get("firstSafeAction") or {},
            "safety": (
                "Draft preview only. Source mutated: "
                f"{bool(safety.get('sourceFilesMutated'))}; canonical replaced: "
                f"{bool(safety.get('canonicalManuscriptReplaced'))}; external publishing: "
                f"{bool(safety.get('externalPublishing'))}."
            ),
        })

    if runway:
        counts = runway.get("counts") if isinstance(runway.get("counts"), dict) else {}
        cards.append({
            "id": "nest-writing-publication-runway",
            "lane": "Nest writing/research",
            "priority": "review" if counts.get("pendingHumanReview") else "ready",
            "status": "writing-runway-ready",
            "action": "Review writing publication runway",
            "explanation": "Inspect platform draft rows and receipt slots while keeping draft readiness, human approval, and external receipts separate.",
            "itemCount": counts.get("platformDraftItems", 0),
            "reviewPending": counts.get("pendingHumanReview", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
            "runwayHtml": latest_runway.get("htmlPath") or runway.get("htmlPath") or "",
            "runwayJson": latest_runway.get("jsonPath") or runway.get("jsonPath") or "",
            "nextSafestAction": latest_runway.get("nextSafestAction") or runway.get("nextSafestAction") or "Open the first current draft packet, compare it against source evidence, then request revision or approve platform copy.",
            "humanAsk": latest_runway.get("humanAsk") or runway.get("humanAsk") or "",
            "agentSafeParallelWork": latest_runway.get("agentSafeParallelWork") or runway.get("agentSafeParallelWork") or "",
            "publicationContract": latest_runway.get("publicationContract") or runway.get("publicationContract") or {},
            "draftContract": latest_runway.get("draftContract") or runway.get("draftContract") or {},
            "sourceTasks": latest_runway.get("sourceTasks") or runway.get("sourceTasks") or [],
            "firstSafeAction": latest_runway.get("firstSafeAction") or runway.get("firstSafeAction") or {},
            "firstReviewDecisionCommand": latest_runway.get("firstReviewCommand") or runway.get("firstReviewCommand") or "",
            "receiptCommandSafety": latest_runway.get("receiptCommandSafety") or runway.get("receiptCommandSafety") or "Receipt slots are placeholders until real external URLs/provider IDs exist.",
            "safety": "Writing runway only. It does not post, upload, schedule, replace source files, or create receipts.",
        })

    workbench_actions = workbench.get("actionCards") if isinstance(workbench.get("actionCards"), list) else []
    for action in workbench_actions:
        if len(cards) >= max_cards:
            break
        if not isinstance(action, dict):
            continue
        source_trail = action.get("sourceTrail") if isinstance(action.get("sourceTrail"), list) else []
        task_id = str(action.get("id") or "")
        cards.append({
            "id": f"nest-writing-task-{task_id or len(cards)}",
            "lane": "Nest writing/research",
            "priority": "ready" if action.get("risk") == "low" else "review",
            "status": action.get("status") or "ready-to-draft-with-provenance",
            "action": f"Create/review draft packet: {action.get('label') or task_id}",
            "explanation": action.get("explanation") or "Prepare a source-backed draft preview from the workbench action card.",
            "itemCount": len(source_trail),
            "firstReceiptTemplate": f"./script/agentctl.sh nest-writing-draft-packet {task_id}" if task_id else "",
            "runwayHtml": latest_packet.get("workbenchHtmlPath") or "",
            "runwayJson": latest_packet.get("workbenchJsonPath") or "",
            "safety": "Creates or points to draft previews only. Source files stay read-only until a human-controlled save path exists.",
        })
    def writing_card_sort_rank(card: dict[str, Any]) -> int:
        raw_rank = card.get("queueSortRank")
        try:
            return int(raw_rank if raw_rank not in {None, ""} else 50)
        except Exception:
            return 50

    cards = sorted(cards, key=writing_card_sort_rank)
    return cards[:max_cards]


def summarize_writing(book_root: Path) -> dict[str, Any]:
    source_count, samples = count_files(book_root, {".md", ".txt", ".docx", ".rtf"})
    start_here_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-start-here.json")
    packet_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-source-packet.json")
    research_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-research-packet.json")
    draft_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-draft-packet.json")
    runway_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-writing-publication-runway.json")
    session_cockpit_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-session-cockpit.json")
    daily_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-daily-packet.json")
    author_desk_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-author-desk.json")
    writing_sprint_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-sprint-companion.json")
    momentum_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-momentum-board.json")
    control_room_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-control-room.json")
    next_card_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-next-card.json")
    idea_router_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-idea-output-router.json")
    latest_start_here = load_json(start_here_pointer)
    latest_packet = load_json(packet_pointer)
    latest_research = load_json(research_pointer)
    latest_draft = load_json(draft_pointer)
    latest_runway = load_json(runway_pointer)
    latest_session_cockpit = load_json(session_cockpit_pointer)
    latest_daily = load_json(daily_pointer)
    latest_author_desk = load_json(author_desk_pointer)
    latest_writing_sprint = load_json(writing_sprint_pointer)
    latest_momentum_board = load_json(momentum_pointer)
    latest_control_room = load_json(control_room_pointer)
    latest_next_card = load_json(next_card_pointer)
    latest_idea_router = load_json(idea_router_pointer)
    action_cards = summarize_writing_action_cards(latest_start_here, latest_packet, latest_research, latest_draft, latest_runway, latest_daily, latest_author_desk, latest_writing_sprint, latest_momentum_board, latest_control_room, latest_next_card, latest_idea_router)
    return {
        "lane": "Nest writing/research",
        "status": "nest-writing-start-here-ready" if latest_start_here else "source-packet-ready" if latest_packet else "source-material-found" if source_count else "needs-source-intake",
        "bookRoot": str(book_root),
        "sourceDocumentCount": source_count,
        "sampleSources": samples,
        "latestNestWritingStartHereHtml": latest_start_here.get("htmlPath") or "",
        "latestNestWritingStartHereJson": latest_start_here.get("jsonPath") or "",
        "latestNestWritingStartHereMarkdown": latest_start_here.get("markdownPath") or "",
        "latestNestWritingStartHereCounts": latest_start_here.get("counts") or {},
        "latestNestWritingStartHereFirstSafeAction": latest_start_here.get("firstSafeAction") or {},
        "latestNestWritingNextCardHtml": latest_next_card.get("htmlPath") or latest_next_card.get("nextWritingCardPath") or "",
        "latestNestWritingNextCardJson": latest_next_card.get("jsonPath") or "",
        "latestNestWritingNextCardMarkdown": latest_next_card.get("markdownPath") or "",
        "latestNestWritingNextCardCounts": latest_next_card.get("counts") or {},
        "latestNestWritingNextCardNextSafestAction": latest_next_card.get("nextSafestAction") or "",
        "latestNestWritingNextCardActionLadder": latest_next_card.get("actionLadder") or [],
        "latestNestWritingMomentumBoardHtml": latest_momentum_board.get("htmlPath") or "",
        "latestNestWritingMomentumBoardJson": latest_momentum_board.get("jsonPath") or "",
        "latestNestWritingMomentumBoardMarkdown": latest_momentum_board.get("markdownPath") or "",
        "latestNestWritingMomentumBoardCounts": latest_momentum_board.get("counts") or {},
        "latestNestIdeaOutputRouterHtml": latest_idea_router.get("htmlPath") or "",
        "latestNestIdeaOutputRouterJson": latest_idea_router.get("jsonPath") or "",
        "latestNestIdeaOutputRouterMarkdown": latest_idea_router.get("markdownPath") or "",
        "latestNestIdeaOutputRouterCsv": latest_idea_router.get("csvPath") or "",
        "latestNestIdeaOutputRouterCounts": latest_idea_router.get("counts") or {},
        "latestPacketHtml": latest_packet.get("htmlPath") or "",
        "latestPacketJson": latest_packet.get("packetPath") or "",
        "latestWorkbenchHtml": latest_packet.get("workbenchHtmlPath") or "",
        "latestWorkbenchJson": latest_packet.get("workbenchJsonPath") or "",
        "workbenchCounts": latest_packet.get("workbenchCounts") or {},
        "latestResearchPacketHtml": latest_research.get("htmlPath") or "",
        "latestResearchPacketJson": latest_research.get("packetPath") or latest_research.get("jsonPath") or "",
        "latestResearchPacketMarkdown": latest_research.get("markdownPath") or "",
        "latestResearchPacketCsv": latest_research.get("csvPath") or "",
        "latestResearchPacketCounts": latest_research.get("counts") or {},
        "latestDraftPacketHtml": latest_draft.get("htmlPath") or "",
        "latestDraftPacketJson": latest_draft.get("jsonPath") or "",
        "latestDraftTaskId": latest_draft.get("taskId") or "",
        "latestWritingRunwayHtml": latest_runway.get("htmlPath") or "",
        "latestWritingRunwayJson": latest_runway.get("jsonPath") or "",
        "latestWritingRunwayCounts": latest_runway.get("counts") or {},
        "latestWritingSessionCockpitHtml": latest_session_cockpit.get("htmlPath") or "",
        "latestWritingSessionCockpitJson": latest_session_cockpit.get("jsonPath") or "",
        "latestWritingSessionCockpitCsv": latest_session_cockpit.get("csvPath") or "",
        "latestWritingSessionCockpitCounts": latest_session_cockpit.get("counts") or {},
        "latestWritingDailyPacketHtml": latest_daily.get("htmlPath") or "",
        "latestWritingDailyPacketJson": latest_daily.get("jsonPath") or "",
        "latestWritingDailyPacketMarkdown": latest_daily.get("markdownPath") or "",
        "latestWritingDailyPacketCsv": latest_daily.get("csvPath") or "",
        "latestWritingDailyPacketCounts": latest_daily.get("counts") or {},
        "latestWritingDailyPacketNextSafestAction": latest_daily.get("nextSafestAction") or "",
        "latestWritingDailyPacketFirstTask": latest_daily.get("firstTask") or {},
        "latestAuthorDeskHtml": latest_author_desk.get("htmlPath") or "",
        "latestAuthorDeskJson": latest_author_desk.get("jsonPath") or "",
        "latestAuthorDeskMarkdown": latest_author_desk.get("markdownPath") or "",
        "latestAuthorDeskCsv": latest_author_desk.get("csvPath") or "",
        "latestAuthorDeskCounts": latest_author_desk.get("counts") or {},
        "latestWritingSprintHtml": latest_writing_sprint.get("htmlPath") or "",
        "latestWritingSprintJson": latest_writing_sprint.get("jsonPath") or "",
        "latestWritingSprintMarkdown": latest_writing_sprint.get("markdownPath") or "",
        "latestWritingSprintCsv": latest_writing_sprint.get("csvPath") or "",
        "latestWritingSprintNotesTemplate": latest_writing_sprint.get("notesTemplatePath") or "",
        "latestWritingSprintCounts": latest_writing_sprint.get("counts") or {},
        "latestNestWritingControlRoomHtml": latest_control_room.get("htmlPath") or "",
        "latestNestWritingControlRoomJson": latest_control_room.get("jsonPath") or "",
        "latestNestWritingControlRoomMarkdown": latest_control_room.get("markdownPath") or "",
        "latestNestWritingControlRoomCounts": latest_control_room.get("counts") or {},
        "latestNestWritingControlRoomFirstSafeAction": latest_control_room.get("firstSafeAction") or {},
        "latestWritingHumanAsk": latest_author_desk.get("humanAsk") or latest_packet.get("humanAsk") or latest_runway.get("humanAsk") or "",
        "latestWritingAgentSafeParallelWork": latest_author_desk.get("agentSafeParallelWork") or latest_packet.get("agentSafeParallelWork") or latest_runway.get("agentSafeParallelWork") or "",
        "latestWritingContract": latest_author_desk.get("writingContract") or latest_packet.get("sourceContract") or latest_runway.get("publicationContract") or {},
        "latestWritingSourceTasks": latest_author_desk.get("sourceTasks") or latest_packet.get("sourceTasks") or latest_runway.get("sourceTasks") or [],
        "actionCards": action_cards,
        "nextSafestAction": (
            "Open Nest Writing Start Here first. It turns the writing/research lane into one calm source-backed author doorway without mutating source files, replacing canon, or publishing."
            if latest_start_here
            else
            "Open the Nest writing control room first. It joins source-backed drafts, review flags, platform draft packets, and canon/publication boundaries without mutating source files."
            if latest_control_room
            else
            "Open the Nest research packet, create source notes for one source cluster, then move into the Author Desk or writing sprint without mutating source files."
            if latest_research
            else
            "Open the Nest Author Desk, pick the first source-backed task, then generate/review a draft packet without mutating source files."
            if latest_author_desk
            else "Open the daily writing packet, pick the first source-backed task, then generate/review a draft packet without mutating source files."
            if latest_daily
            else
            "Open the writing session cockpit, choose the top source-backed session, then generate/review a draft packet without mutating source files."
            if latest_session_cockpit
            else "Review the latest draft packet, then use the writing workbench draft queue for the next source-backed episode page, outline, or article."
        ),
        "productTruth": "Nest should help capture, tag, outline, and draft without hiding source provenance.",
    }


def summarize_360_reframe_actions(latest_reframe: dict[str, Any], max_cards: int = 8) -> list[dict[str, Any]]:
    json_path = latest_reframe.get("jsonPath")
    if not json_path:
        return []
    packet = load_json(Path(str(json_path)))
    groups = packet.get("groups") if isinstance(packet.get("groups"), list) else []
    cards: list[dict[str, Any]] = []
    repair_root = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/media-repair-tasks")

    def repair_task_for(group_key: str) -> dict[str, str]:
        if not group_key:
            return {}
        md_candidates = sorted(
            repair_root.glob(f"{group_key}*.md"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        json_candidates = sorted(
            repair_root.glob(f"{group_key}*.json"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        md_path = md_candidates[0] if md_candidates else repair_root / f"{group_key}-repair-needed.md"
        json_path = json_candidates[0] if json_candidates else repair_root / f"{group_key}-repair-needed.json"
        task: dict[str, str] = {}
        if md_path.exists():
            task["markdownPath"] = str(md_path)
        if json_path.exists():
            task["jsonPath"] = str(json_path)
        return task

    def card_for_group(group: dict[str, Any], intent: str, priority: str, action: str, explanation: str) -> dict[str, Any]:
        review_source = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
        recipes = group.get("recipes") if isinstance(group.get("recipes"), list) else []
        group_key = str(group.get("groupKey") or "")
        repair_task = repair_task_for(group_key)
        reframe_status = str(group.get("reframeStatus") or "")
        is_attention = priority == "attention"
        if is_attention and repair_task:
            first_safe_action = {
                "label": "Open repair evidence",
                "command": f"open {shell_quote(str(repair_task.get('markdownPath') or repair_task.get('jsonPath') or latest_reframe.get('htmlPath') or ''))}",
                "safety": "Open local repair evidence only. No media is changed.",
            }
            next_safest_action = f"Open the repair evidence for {group_key}, then re-copy/redownload or park the source only after human review."
        elif is_attention:
            first_safe_action = {
                "label": "Open current 360 reframe packet",
                "command": f"open {shell_quote(str(latest_reframe.get('htmlPath') or latest_reframe.get('jsonPath') or ''))}",
                "safety": "Open local packet only. No media is changed.",
            }
            next_safest_action = f"Open the current 360 packet for {group_key}, then create repair evidence before retrying proxy/reframe work."
        else:
            first_safe_action = {
                "label": "Open current 360 reframe packet",
                "command": f"open {shell_quote(str(latest_reframe.get('htmlPath') or latest_reframe.get('jsonPath') or ''))}",
                "safety": "Open local recipe packet only. No render, upload, delete, or source mutation.",
            }
            next_safest_action = f"Review {group_key or 'this source set'} in the 360 reframe packet, then tune baseline/keyframes before any real export."
        return {
            "id": f"360-{group.get('id') or group.get('groupKey')}-{intent}",
            "lane": "360 workflow",
            "priority": priority,
            "queueSortRank": 20 if is_attention else 70,
            "status": reframe_status or group.get("workflowStatus") or "needs-review",
            "groupKey": group_key,
            "workflowStatus": group.get("workflowStatus") or "",
            "reframeStatus": reframe_status,
            "durationSeconds": group.get("durationSeconds") or 0,
            "assetCount": group.get("assetCount") or 0,
            "itemCount": group.get("assetCount") or len(recipes) or 1,
            "reviewPending": 1 if is_attention else 0,
            "action": action,
            "explanation": explanation,
            "repairTask": repair_task,
            "reviewSourceKind": review_source.get("kind") or "unavailable",
            "reviewSourcePath": review_source.get("path") or "",
            "recipeIds": [recipe.get("id") for recipe in recipes if isinstance(recipe, dict) and recipe.get("id")],
            "runwayHtml": latest_reframe.get("htmlPath") or "",
            "runwayJson": latest_reframe.get("jsonPath") or json_path,
            "firstReceiptTemplate": (
                f"open {shell_quote(str(repair_task.get('markdownPath') or repair_task.get('jsonPath') or latest_reframe.get('htmlPath') or ''))}"
                if is_attention
                else f"open {shell_quote(str(latest_reframe.get('htmlPath') or latest_reframe.get('jsonPath') or ''))}"
            ),
            "nextSafestAction": next_safest_action,
            "firstSafeAction": first_safe_action,
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open current 360 reframe packet",
                    "command": f"open {shell_quote(str(latest_reframe.get('htmlPath') or latest_reframe.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Recipe/review action only. No render, upload, delete, or source mutation.",
        }

    for group in groups:
        if not isinstance(group, dict):
            continue
        status = group.get("reframeStatus")
        if status == "blocked-media-repair":
            latest_failure = group.get("latestFailure") if isinstance(group.get("latestFailure"), dict) else {}
            error = latest_failure.get("error") or "The latest proxy/media prep failed or the review source is unavailable."
            group_key = str(group.get("groupKey") or "")
            repair_task = repair_task_for(group_key)
            if repair_task:
                error = f"Repair packet exists for {group_key}. Open it before retrying proxy/reframe work: {repair_task.get('markdownPath') or repair_task.get('jsonPath')}"
            cards.append(card_for_group(
                group,
                "repair-media",
                "attention",
                "Repair media/proxy prep before reframing",
                str(error),
            ))
        elif status == "blocked-needs-proxy":
            cards.append(card_for_group(
                group,
                "create-proxy",
                "attention",
                "Create a managed proxy",
                "This group has original media but no safe review proxy for comfortable reframing yet.",
            ))
        elif status == "parked-by-decision":
            decision = group.get("repairDecision") if isinstance(group.get("repairDecision"), dict) else {}
            cards.append(card_for_group(
                group,
                "parked-decision",
                "review",
                "Review parked 360 source decision",
                f"This source is parked by sidecar decision `{decision.get('action') or 'parked'}`. It remains reversible metadata; source media is untouched.",
            ))
        if len(cards) >= max_cards:
            return cards

    for group in groups:
        if len(cards) >= max_cards:
            break
        if not isinstance(group, dict) or group.get("reframeStatus") != "reframe-ready":
            continue
        cards.append(card_for_group(
            group,
            "review-recipes",
            "ready",
            "Review 16:9 and 9:16 reframe recipes",
            "Open this source set in Studio360, check the review source, then tune baseline/keyframes before any real export.",
        ))
    return cards


def summarize_360(roots: list[Path]) -> dict[str, Any]:
    extensions = {".insv", ".insp", ".mp4", ".mov", ".lrv"}
    packet_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-workflow-packet.json")
    proxy_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proxy-prep.json")
    proxy_failure_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proxy-prep-failure.json")
    reframe_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-reframe-packet.json")
    repair_preflight_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-repair-preflight.json")
    repair_status_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-repair-status.json")
    source_desk_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-source-desk.json")
    reframe_export_desk_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-reframe-export-desk.json")
    export_candidate_queue_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-export-candidate-queue.json")
    renderer_preflight_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-renderer-preflight.json")
    proof_render_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-render.json")
    proof_render_ledger_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-render-ledger.json")
    proof_sprint_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-sprint-companion.json")
    proof_control_room_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-proof-control-room.json")
    start_here_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-start-here.json")
    next_source_card_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-next-source-card.json")
    operator_workbench_pointer = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-operator-workbench.json")
    latest_packet = load_json(packet_pointer)
    latest_proxy = load_json(proxy_pointer)
    latest_proxy_failure = load_json(proxy_failure_pointer)
    latest_reframe = load_json(reframe_pointer)
    latest_repair_preflight = load_json(repair_preflight_pointer)
    latest_repair_status = load_json(repair_status_pointer)
    latest_source_desk = load_json(source_desk_pointer)
    latest_reframe_export_desk = load_json(reframe_export_desk_pointer)
    latest_export_candidate_queue = load_json(export_candidate_queue_pointer)
    latest_renderer_preflight = load_json(renderer_preflight_pointer)
    latest_proof_render = load_json(proof_render_pointer)
    latest_proof_render_ledger = load_json(proof_render_ledger_pointer)
    latest_proof_sprint = load_json(proof_sprint_pointer)
    latest_proof_control_room = load_json(proof_control_room_pointer)
    latest_start_here = load_json(start_here_pointer)
    latest_next_source_card = load_json(next_source_card_pointer)
    latest_operator_workbench = load_json(operator_workbench_pointer)
    reframe_action_cards = summarize_360_reframe_actions(latest_reframe)
    if latest_start_here:
        start_counts = latest_start_here.get("counts") if isinstance(latest_start_here.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-start-here",
            "lane": "360 workflow",
            "priority": "attention" if "repair" in str(latest_start_here.get("status") or "") else "review",
            "queueSortRank": -8,
            "status": latest_start_here.get("status") or "studio360-start-here-ready",
            "action": "Open Studio360 Start Here",
            "explanation": (
                f"{start_counts.get('assets', 0)} asset(s), {start_counts.get('assetGroups', 0)} group(s), "
                f"{start_counts.get('readyReframeGroups', 0)} reframe-ready group(s), "
                f"{start_counts.get('readyRecipes', 0)} recipe(s), "
                f"{start_counts.get('proofOutputsPresent', 0)} proof output(s), and "
                f"{start_counts.get('repairTickets', 0)} repair ticket(s) are summarized in the calm 360 front door."
            ),
            "itemCount": start_counts.get("assetGroups", 0),
            "reviewPending": start_counts.get("readyRecipes", 0),
            "warningCount": start_counts.get("repairTickets", 0) + start_counts.get("blockedMediaRepair", 0) + start_counts.get("damagedAssets", 0),
            "runwayHtml": latest_start_here.get("htmlPath") or "",
            "runwayJson": latest_start_here.get("jsonPath") or "",
            "runwayMarkdown": latest_start_here.get("markdownPath") or "",
            "nextSafestAction": latest_start_here.get("nextSafestAction") or "Open Studio360 Start Here before repair, proof, reframe, renderer, or export work.",
            "humanAsk": latest_start_here.get("humanAsk") or "Use the 360 front door to choose repair, proof, source-card, reframe/export, or renderer preflight work.",
            "agentSafeParallelWork": "Codex can summarize local evidence, improve review packets, and regenerate boards. Do not proxy, repair, render, export, upload, publish, delete, overwrite, mutate originals, or create receipts.",
            "firstSafeAction": latest_start_here.get("firstSafeAction") or {
                "label": "Open Studio360 Start Here",
                "command": f"open {shell_quote(str(latest_start_here.get('htmlPath') or latest_start_here.get('jsonPath') or ''))}",
                "path": latest_start_here.get("htmlPath") or latest_start_here.get("jsonPath") or "",
                "safety": "Opens local Studio360 orientation only. No media work is executed.",
            },
            "firstReceiptTemplate": f"open {shell_quote(str(latest_start_here.get('htmlPath') or ''))}",
            "safety": "Studio360 Start Here only. No proxy, repair, render, export, upload, publish, schedule, source mutation, overwrite, or receipt truth.",
        })
    if latest_next_source_card:
        next_source_counts = latest_next_source_card.get("counts") if isinstance(latest_next_source_card.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-next-source-card",
            "lane": "360 workflow",
            "priority": "review" if next_source_counts.get("localProofReviewReady") else "attention",
            "queueSortRank": -7,
            "status": latest_next_source_card.get("status") or "studio360-next-source-card-ready",
            "action": "Open Studio360 next source card",
            "explanation": (
                f"{next_source_counts.get('assetCount', 0)} asset(s), "
                f"{next_source_counts.get('sourcePaths', 0)} source path(s), "
                f"{next_source_counts.get('originalCount', 0)} original(s), "
                f"{next_source_counts.get('proxyCount', 0)} proxy item(s), and "
                f"proof review ready={'yes' if next_source_counts.get('localProofReviewReady') else 'no'} are summarized for the next 360 source decision."
            ),
            "itemCount": next_source_counts.get("assetCount", 0),
            "reviewPending": 1 if next_source_counts.get("localProofReviewReady") else 0,
            "warningCount": 0 if next_source_counts.get("localProofOutputExists") else 1,
            "runwayHtml": latest_next_source_card.get("htmlPath") or "",
            "runwayJson": latest_next_source_card.get("jsonPath") or "",
            "runwayMarkdown": latest_next_source_card.get("markdownPath") or "",
            "nextSafestAction": latest_next_source_card.get("nextSafestAction") or "Open the next source card and review local evidence before creating any proof or export.",
            "humanAsk": latest_next_source_card.get("humanAsk") or "Confirm the selected 360 source moment and choose whether it deserves review, repair, proof, or hold.",
            "agentSafeParallelWork": latest_next_source_card.get("agentSafeParallelWork") or "Codex can summarize source evidence and improve routing packets. Do not repair, render, export, upload, publish, delete, overwrite, mutate originals, or create receipts.",
            "firstSafeAction": latest_next_source_card.get("firstSafeAction") or {
                "label": "Open Studio360 next source card",
                "command": f"open {shell_quote(str(latest_next_source_card.get('htmlPath') or latest_next_source_card.get('jsonPath') or ''))}",
                "path": latest_next_source_card.get("htmlPath") or latest_next_source_card.get("jsonPath") or "",
                "safety": "Opens local next-source evidence only. No media work is executed.",
            },
            "firstReceiptTemplate": f"open {shell_quote(str(latest_next_source_card.get('htmlPath') or ''))}",
            "safety": "Studio360 next source card only. No proxy, repair, render, export, upload, publish, schedule, source mutation, overwrite, or receipt truth.",
        })
    if latest_operator_workbench:
        operator_counts = latest_operator_workbench.get("counts") if isinstance(latest_operator_workbench.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-operator-workbench",
            "lane": "360 workflow",
            "priority": "attention" if "repair" in str(latest_operator_workbench.get("status") or "") else "review",
            "queueSortRank": -7,
            "status": latest_operator_workbench.get("status") or "studio360-operator-workbench-ready",
            "action": "Open Studio360 operator workbench",
            "explanation": (
                f"{operator_counts.get('sourceRows', 0)} source row(s), "
                f"{operator_counts.get('reframeRows', 0)} reframe row(s), "
                f"{operator_counts.get('candidateRows', 0)} candidate row(s), "
                f"{operator_counts.get('proofOutputsPresent', 0)} proof output(s), and "
                f"{operator_counts.get('repairTickets', 0)} repair ticket(s) are gathered for hands-on 360 operations."
            ),
            "itemCount": operator_counts.get("sourceRows", 0) + operator_counts.get("reframeRows", 0),
            "reviewPending": operator_counts.get("proofOutputsPresent", 0) + operator_counts.get("readyRecipes", 0),
            "warningCount": operator_counts.get("repairTickets", 0) + operator_counts.get("blockedMediaRepair", 0) + operator_counts.get("damagedAssets", 0),
            "runwayHtml": latest_operator_workbench.get("htmlPath") or "",
            "runwayJson": latest_operator_workbench.get("jsonPath") or "",
            "runwayMarkdown": latest_operator_workbench.get("markdownPath") or "",
            "nextSafestAction": latest_operator_workbench.get("nextSafestAction") or "Open the operator workbench and choose exactly one local 360 source/reframe/proof review step.",
            "humanAsk": latest_operator_workbench.get("humanAsk") or "Use the workbench when you want source, reframe, proof, and repair state in one practical operating panel.",
            "agentSafeParallelWork": latest_operator_workbench.get("agentSafeParallelWork") or "Codex can summarize local evidence, improve review packets, and regenerate boards. Do not repair, render, export, upload, publish, delete, overwrite, mutate originals, or create receipts.",
            "firstSafeAction": latest_operator_workbench.get("firstSafeAction") or {
                "label": "Open Studio360 operator workbench",
                "command": f"open {shell_quote(str(latest_operator_workbench.get('htmlPath') or latest_operator_workbench.get('jsonPath') or ''))}",
                "path": latest_operator_workbench.get("htmlPath") or latest_operator_workbench.get("jsonPath") or "",
                "safety": "Opens local operator evidence only. No media work is executed.",
            },
            "firstReceiptTemplate": f"open {shell_quote(str(latest_operator_workbench.get('htmlPath') or ''))}",
            "safety": "Studio360 operator workbench only. No proxy, repair, render, export, upload, publish, schedule, source mutation, overwrite, or receipt truth.",
        })
    if latest_proof_control_room:
        proof_control_counts = latest_proof_control_room.get("counts") if isinstance(latest_proof_control_room.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-proof-control-room",
            "lane": "360 workflow",
            "priority": "attention" if proof_control_counts.get("blockedMediaRepair") or proof_control_counts.get("repairTickets") else "review",
            "queueSortRank": -7,
            "status": latest_proof_control_room.get("status") or "studio360-proof-control-room-ready",
            "action": "Open Studio360 proof control room",
            "explanation": (
                f"{proof_control_counts.get('proofOutputsPresent', 0)} proof output(s), "
                f"{proof_control_counts.get('exportCandidateRows', 0)} export candidate row(s), "
                f"{proof_control_counts.get('reframeReady', 0)} reframe-ready group(s), and "
                f"{proof_control_counts.get('blockedMediaRepair', 0)} repair block(s) are joined into one 360 front door."
            ),
            "itemCount": proof_control_counts.get("controlCards", 0),
            "reviewPending": (
                proof_control_counts.get("existingProofRows", 0)
                + proof_control_counts.get("nextProofRows", 0)
                + proof_control_counts.get("exportCandidateRows", 0)
            ),
            "warningCount": proof_control_counts.get("blockedMediaRepair", 0) + proof_control_counts.get("blockedNeedsProxy", 0) + proof_control_counts.get("damagedAssets", 0),
            "runwayHtml": latest_proof_control_room.get("htmlPath") or "",
            "runwayJson": latest_proof_control_room.get("jsonPath") or "",
            "runwayMarkdown": latest_proof_control_room.get("markdownPath") or "",
            "nextSafestAction": latest_proof_control_room.get("nextSafestAction") or "Open the proof control room before proof, repair, export-candidate, or full-render decisions.",
            "humanAsk": latest_proof_control_room.get("humanAsk") or "Choose exactly one next 360 action from the control room.",
            "agentSafeParallelWork": latest_proof_control_room.get("agentSafeParallelWork") or "Summarize local 360 evidence and improve packets without rendering or mutating originals.",
            "firstSafeAction": latest_proof_control_room.get("firstSafeAction") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(latest_proof_control_room.get('htmlPath') or ''))}",
            "safety": "Studio360 proof control room only. No render, full export, upload, publication, delete, overwrite, receipt, repair, or original mutation occurred.",
        })
    if latest_proof_sprint:
        proof_sprint_counts = latest_proof_sprint.get("counts") if isinstance(latest_proof_sprint.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-proof-sprint-companion",
            "lane": "360 workflow",
            "priority": "attention" if proof_sprint_counts.get("blockedMediaRepair") or proof_sprint_counts.get("proofNextRows") else "review",
            "queueSortRank": -6,
            "status": latest_proof_sprint.get("status") or "studio360-proof-sprint-ready",
            "action": "Open Studio360 proof sprint",
            "explanation": (
                f"{proof_sprint_counts.get('proofReviewRows', 0)} proof output(s), "
                f"{proof_sprint_counts.get('proofNextRows', 0)} next proof row(s), "
                f"{proof_sprint_counts.get('reframeReady', 0)} reframe-ready group(s), and "
                f"{proof_sprint_counts.get('blockedMediaRepair', 0)} repair block(s) are joined into one proof sprint."
            ),
            "itemCount": proof_sprint_counts.get("proofReviewRows", 0),
            "reviewPending": proof_sprint_counts.get("proofReviewRows", 0) + proof_sprint_counts.get("proofNextRows", 0),
            "warningCount": proof_sprint_counts.get("blockedMediaRepair", 0) + proof_sprint_counts.get("blockedNeedsProxy", 0),
            "runwayHtml": latest_proof_sprint.get("htmlPath") or "",
            "runwayJson": latest_proof_sprint.get("jsonPath") or "",
            "runwayMarkdown": latest_proof_sprint.get("markdownPath") or "",
            "nextSafestAction": latest_proof_sprint.get("nextSafestAction") or "Open the proof sprint, review existing proof outputs, then run at most one proof command.",
            "humanAsk": latest_proof_sprint.get("humanAsk") or "Review proof outputs before full render decisions.",
            "agentSafeParallelWork": latest_proof_sprint.get("agentSafeParallelWork") or "Summarize proof evidence without running renderer commands.",
            "firstSafeAction": latest_proof_sprint.get("firstSafeAction") or {},
            "firstReceiptTemplate": f"open {shell_quote(str(latest_proof_sprint.get('htmlPath') or ''))}",
            "safety": "Studio360 proof sprint only. No ffmpeg command, full render, upload, publication, delete, overwrite, receipt, or original mutation occurred.",
        })
    if latest_proof_render:
        proof_counts = latest_proof_render.get("counts") if isinstance(latest_proof_render.get("counts"), dict) else {}
        proof_ledger_counts = latest_proof_render_ledger.get("counts") if isinstance(latest_proof_render_ledger.get("counts"), dict) else {}
        proof_candidate = latest_proof_render.get("candidate") if isinstance(latest_proof_render.get("candidate"), dict) else {}
        proof_paths = latest_proof_render.get("paths") if isinstance(latest_proof_render.get("paths"), dict) else {}
        proof_probe = latest_proof_render.get("ffprobe") if isinstance(latest_proof_render.get("ffprobe"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-proof-render",
            "lane": "360 workflow",
            "priority": "review" if proof_counts.get("proofOutputCreated") or latest_proof_render.get("status") == "proof-output-already-exists" else "attention",
            "queueSortRank": -5,
            "status": latest_proof_render.get("status") or "proof-render-ready-for-review",
            "action": "Review Studio360 proof render",
            "explanation": (
                f"One {proof_candidate.get('aspect', '')} proof render receipt exists for "
                f"{proof_candidate.get('candidateId', 'a 360 candidate')}. "
                f"The proof ledger has {proof_ledger_counts.get('entries', 1)} receipt(s). "
                f"Output is {proof_probe.get('width', 0)}x{proof_probe.get('height', 0)}, "
                f"{round(float(proof_probe.get('durationSeconds') or 0), 2)}s, "
                f"audio={'yes' if proof_probe.get('audio') else 'no'}. Human review is required before full renders or batch promotion."
            ),
            "itemCount": 1,
            "reviewPending": 1,
            "warningCount": 0 if proof_probe.get("video") else 1,
            "proofOutputPath": proof_paths.get("proofOutputPath") or "",
            "proofLedgerJson": latest_proof_render_ledger.get("jsonPath") or "",
            "proofLedgerCounts": proof_ledger_counts,
            "runwayHtml": latest_proof_render.get("htmlPath") or "",
            "runwayJson": latest_proof_render.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(latest_proof_render.get('htmlPath') or proof_paths.get('proofOutputPath') or ''))}",
            "nextSafestAction": latest_proof_render.get("nextSafestAction") or "Open and inspect the proof render before promoting this renderer path.",
            "firstSafeAction": latest_proof_render.get("firstSafeAction") or {
                "label": "Open Studio360 proof render",
                "command": f"open {shell_quote(str(latest_proof_render.get('htmlPath') or proof_paths.get('proofOutputPath') or ''))}",
                "safety": "Open local proof output only. No source media is changed.",
            },
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio360 proof render",
                    "command": f"open {shell_quote(str(latest_proof_render.get('htmlPath') or proof_paths.get('proofOutputPath') or ''))}",
                }
            ],
            "safety": "Studio360 proof render review only. No full render, upload, publication, delete, overwrite, or original source mutation occurred.",
        })
    if latest_reframe_export_desk:
        reframe_export_counts = latest_reframe_export_desk.get("counts") if isinstance(latest_reframe_export_desk.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-reframe-export-desk",
            "lane": "360 workflow",
            "priority": "attention" if reframe_export_counts.get("blockedMediaRepair") or reframe_export_counts.get("blockedNeedsProxy") else "review",
            "queueSortRank": -3,
            "status": latest_reframe_export_desk.get("status") or "reframe-export-desk-ready",
            "action": "Open Studio360 Reframe/Export Desk",
            "explanation": (
                f"{reframe_export_counts.get('recipeGroups', reframe_export_counts.get('groups', 0))} recipe group(s), "
                f"{reframe_export_counts.get('recipes', 0)} 16:9/9:16 recipe(s), "
                f"{reframe_export_counts.get('readyRecipeGroups', 0)} ready group(s), "
                f"{reframe_export_counts.get('blockedMediaRepair', 0)} repair block(s), and "
                f"{reframe_export_counts.get('blockedNeedsProxy', 0)} proxy block(s) are combined into one 360 production runway."
            ),
            "itemCount": reframe_export_counts.get("recipeGroups", reframe_export_counts.get("groups", 0)),
            "reviewPending": int(reframe_export_counts.get("blockedMediaRepair") or 0) + int(reframe_export_counts.get("blockedNeedsProxy") or 0),
            "warningCount": reframe_export_counts.get("damagedAssets", 0),
            "readyRecipeGroups": reframe_export_counts.get("readyRecipeGroups", 0),
            "recipeCount": reframe_export_counts.get("recipes", 0),
            "runwayHtml": latest_reframe_export_desk.get("htmlPath") or "",
            "runwayJson": latest_reframe_export_desk.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(latest_reframe_export_desk.get('htmlPath') or ''))}",
            "nextSafestAction": latest_reframe_export_desk.get("nextSafestAction") or "Open the Studio360 Reframe/Export Desk before any render, proxy retry, repair, or publication work.",
            "firstSafeAction": latest_reframe_export_desk.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio360 Reframe/Export Desk",
                    "command": f"open {shell_quote(str(latest_reframe_export_desk.get('htmlPath') or latest_reframe_export_desk.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Studio360 Reframe/Export Desk only. No render, transcode, repair, parking, export, upload, publication, delete, overwrite, or source mutation occurred.",
        })
    if latest_export_candidate_queue:
        export_candidate_counts = latest_export_candidate_queue.get("counts") if isinstance(latest_export_candidate_queue.get("counts"), dict) else {}
        aspects = export_candidate_counts.get("aspects") if isinstance(export_candidate_counts.get("aspects"), dict) else {}
        reframe_action_cards.insert(1 if latest_reframe_export_desk else 0, {
            "id": "360-export-candidate-queue",
            "lane": "360 workflow",
            "priority": "attention" if export_candidate_counts.get("blockedGroups") else "review",
            "queueSortRank": -2,
            "status": latest_export_candidate_queue.get("status") or "candidate-queue-ready",
            "action": "Open Studio360 Export Candidate Queue",
            "explanation": (
                f"{export_candidate_counts.get('candidateRows', 0)} export candidate row(s), "
                f"{export_candidate_counts.get('readyGroups', 0)} ready group(s), "
                f"{aspects.get('16:9', 0)} 16:9 row(s), {aspects.get('9:16', 0)} 9:16 row(s), "
                f"and {export_candidate_counts.get('blockedGroups', 0)} blocked group(s) are prepared as versioned output intent. No renders or receipts are claimed."
            ),
            "itemCount": export_candidate_counts.get("candidateRows", 0),
            "reviewPending": export_candidate_counts.get("candidateRows", 0),
            "warningCount": export_candidate_counts.get("blockedGroups", 0),
            "candidateRows": export_candidate_counts.get("candidateRows", 0),
            "readyGroups": export_candidate_counts.get("readyGroups", 0),
            "blockedGroups": export_candidate_counts.get("blockedGroups", 0),
            "runwayHtml": latest_export_candidate_queue.get("htmlPath") or "",
            "runwayJson": latest_export_candidate_queue.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(latest_export_candidate_queue.get('htmlPath') or ''))}",
            "nextSafestAction": latest_export_candidate_queue.get("nextSafestAction") or "Review Studio360 export candidates before running any renderer.",
            "firstSafeAction": latest_export_candidate_queue.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio360 export candidate queue",
                    "command": f"open {shell_quote(str(latest_export_candidate_queue.get('htmlPath') or latest_export_candidate_queue.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Studio360 export candidate queue only. No render, transcode, repair, export, upload, publication, delete, overwrite, source mutation, or renderer command generation occurred.",
        })
    if latest_renderer_preflight:
        renderer_counts = latest_renderer_preflight.get("counts") if isinstance(latest_renderer_preflight.get("counts"), dict) else {}
        tools = latest_renderer_preflight.get("tools") if isinstance(latest_renderer_preflight.get("tools"), dict) else {}
        reframe_action_cards.insert(2 if latest_reframe_export_desk and latest_export_candidate_queue else 0, {
            "id": "360-renderer-preflight",
            "lane": "360 workflow",
            "priority": "attention" if renderer_counts.get("blockedRows") or renderer_counts.get("dryRunReadyRows") else "review",
            "queueSortRank": -2,
            "status": latest_renderer_preflight.get("status") or "renderer-preflight-ready",
            "action": "Open Studio360 Renderer Preflight",
            "explanation": (
                f"{renderer_counts.get('dryRunReadyRows', 0)} dry-run-ready row(s), "
                f"{renderer_counts.get('proofCommandsPrepared', 0)} proof command(s), "
                f"{renderer_counts.get('fullCommandsPrepared', 0)} full command(s), and "
                f"{renderer_counts.get('blockedRows', 0)} blocked renderer row(s) are prepared. "
                f"ffmpeg: {'yes' if tools.get('ffmpeg') else 'no'}, v360: {tools.get('ffmpegV360')}."
            ),
            "itemCount": renderer_counts.get("candidateRowsInspected", 0),
            "reviewPending": renderer_counts.get("dryRunReadyRows", 0),
            "warningCount": renderer_counts.get("blockedRows", 0),
            "dryRunReadyRows": renderer_counts.get("dryRunReadyRows", 0),
            "proofCommandsPrepared": renderer_counts.get("proofCommandsPrepared", 0),
            "fullCommandsPrepared": renderer_counts.get("fullCommandsPrepared", 0),
            "runwayHtml": latest_renderer_preflight.get("htmlPath") or "",
            "runwayJson": latest_renderer_preflight.get("jsonPath") or "",
            "shellPath": latest_renderer_preflight.get("shellPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(latest_renderer_preflight.get('htmlPath') or ''))}",
            "nextSafestAction": latest_renderer_preflight.get("nextSafestAction") or "Open the renderer preflight and run only one proof command after visual/source review.",
            "firstSafeAction": latest_renderer_preflight.get("firstSafeAction") or {},
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open Studio360 renderer preflight",
                    "command": f"open {shell_quote(str(latest_renderer_preflight.get('htmlPath') or latest_renderer_preflight.get('jsonPath') or ''))}",
                }
            ],
            "safety": "Studio360 renderer preflight only. No ffmpeg command was executed; no render, transcode, upload, publication, delete, overwrite, source mutation, or receipt occurred.",
        })
    if latest_source_desk:
        source_counts = latest_source_desk.get("counts") if isinstance(latest_source_desk.get("counts"), dict) else {}
        reframe_action_cards.insert(0, {
            "id": "360-source-desk",
            "lane": "360 workflow",
            "priority": "attention" if source_counts.get("blockedMediaRepair") else "review",
            "queueSortRank": -1,
            "status": latest_source_desk.get("status") or "source-desk-ready",
            "action": "Open Studio360 Source Desk",
            "explanation": (
                f"{source_counts.get('assets', 0)} asset(s), {source_counts.get('groups', 0)} source group(s), "
                f"{source_counts.get('reframeReady', 0)} reframe-ready group(s), and {source_counts.get('blockedMediaRepair', 0)} repair block(s) "
                "are combined into one proxy/repair/reframe runway."
            ),
            "itemCount": source_counts.get("groups", 0),
            "reviewPending": source_counts.get("blockedMediaRepair", 0),
            "warningCount": source_counts.get("damagedAssets", 0),
            "runwayHtml": latest_source_desk.get("htmlPath") or "",
            "runwayJson": latest_source_desk.get("jsonPath") or "",
            "firstReceiptTemplate": f"open {shell_quote(str(latest_source_desk.get('htmlPath') or ''))}",
            "nextSafestAction": latest_source_desk.get("nextSafestAction") or "Open the Source Desk and route blocked/proxy/reframe groups without mutating originals.",
            "firstSafeAction": latest_source_desk.get("firstSafeAction") or {},
            "safety": "Studio360 Source Desk only. No transcoding, repair, parking, export, upload, publication, delete, overwrite, or source mutation occurred.",
        })
    if latest_repair_preflight:
        repair_counts = latest_repair_preflight.get("counts") if isinstance(latest_repair_preflight.get("counts"), dict) else {}
        repair_preflight_insert_index = 1 if latest_source_desk else 0
        reframe_action_cards.insert(repair_preflight_insert_index, {
            "id": "360-repair-preflight",
            "lane": "360 workflow",
            "priority": "attention",
            "queueSortRank": 0,
            "status": "repair-preflight-ready",
            "action": "Open 360 repair preflight",
            "explanation": f"{repair_counts.get('tickets', 0)} blocked repair ticket(s) are summarized with source evidence and safe redownload/park commands. Use this before retrying proxy or reframe work.",
            "itemCount": repair_counts.get("tickets", 0),
            "reviewPending": repair_counts.get("blockedMediaRepair", 0),
            "warningCount": repair_counts.get("needsRedownloadOrSourceRecopy", 0),
            "runwayHtml": latest_repair_preflight.get("htmlPath") or "",
            "runwayJson": latest_repair_preflight.get("jsonPath") or "",
            "repairStatusHtml": latest_repair_status.get("htmlPath") or "",
            "repairStatusJson": latest_repair_status.get("jsonPath") or "",
            "repairStatusCounts": latest_repair_status.get("counts") or {},
            "firstReceiptTemplate": latest_repair_preflight.get("firstRepairDecisionCommand") or "",
            "firstReviewDecisionCommand": latest_repair_preflight.get("firstRepairDecisionCommand") or "",
            "statusCommand": latest_repair_preflight.get("statusCommand") or "./script/agentctl.sh studio360-repair-status",
            "repairDecisionSafety": latest_repair_preflight.get("repairDecisionSafety") or "Metadata-only repair routing after human/source review; source media stays untouched.",
            "firstOpenCommand": f"open {shell_quote(str(latest_repair_preflight.get('htmlPath') or latest_repair_preflight.get('jsonPath') or ''))}",
            "nextSafestAction": latest_repair_preflight.get("nextSafestAction") or "Open the 360 repair preflight, then repair or park blocked sources before retrying proxy/reframe work.",
            "firstSafeAction": latest_repair_preflight.get("firstSafeAction") or {
                "label": "Open 360 repair preflight",
                "command": f"open {shell_quote(str(latest_repair_preflight.get('htmlPath') or latest_repair_preflight.get('jsonPath') or ''))}",
                "safety": "Open local repair preflight only. No source media is changed.",
            },
            "commands": [
                {
                    "kind": "inspect",
                    "label": "Open 360 repair preflight",
                    "command": f"open {shell_quote(str(latest_repair_preflight.get('htmlPath') or latest_repair_preflight.get('jsonPath') or ''))}",
                },
                {
                    "kind": "status",
                    "label": "Show 360 repair status",
                    "command": "./script/agentctl.sh studio360-repair-status",
                },
            ],
            "safety": "Repair preflight only. No source repair, delete, overwrite, upload, publish, park decision, or export occurred.",
        })
    reframe_action_cards = sorted(
        reframe_action_cards,
        key=lambda card: (
            int(card.get("queueSortRank") if card.get("queueSortRank") not in {None, ""} else 50),
            str(card.get("id") or card.get("action") or ""),
        ),
    )
    total = 0
    samples: list[str] = []
    root_payloads = []
    for root in roots:
        count, root_samples = count_files(root, extensions, limit=10_000)
        total += count
        samples.extend(root_samples)
        root_payloads.append({"root": str(root), "exists": root.exists(), "assetCount": count})
    return {
        "lane": "360 workflow",
        "status": "workflow-packet-ready" if latest_packet else "assets-found-needs-workflow" if total else "needs-assets",
        "assetCount": total,
        "roots": root_payloads,
        "sampleAssets": samples[:10],
        "latestPacketHtml": latest_packet.get("htmlPath") or "",
        "latestPacketJson": latest_packet.get("packetPath") or "",
        "latestProxyPrepManifest": latest_proxy.get("manifestPath") or "",
        "latestProxyPath": latest_proxy.get("proxyPath") or "",
        "latestProxyPrepFailureManifest": latest_proxy_failure.get("manifestPath") or "",
        "latestProxyPrepFailureError": latest_proxy_failure.get("error") or "",
        "latestReframeHtml": latest_reframe.get("htmlPath") or "",
        "latestReframeJson": latest_reframe.get("jsonPath") or "",
        "latestReframeCounts": latest_reframe.get("counts") or {},
        "latest360ReframeExportDeskHtml": latest_reframe_export_desk.get("htmlPath") or "",
        "latest360ReframeExportDeskJson": latest_reframe_export_desk.get("jsonPath") or "",
        "latest360ReframeExportDeskMarkdown": latest_reframe_export_desk.get("markdownPath") or "",
        "latest360ReframeExportDeskCsv": latest_reframe_export_desk.get("csvPath") or "",
        "latest360ReframeExportDeskCounts": latest_reframe_export_desk.get("counts") or {},
        "latest360RendererPreflightHtml": latest_renderer_preflight.get("htmlPath") or "",
        "latest360RendererPreflightJson": latest_renderer_preflight.get("jsonPath") or "",
        "latest360RendererPreflightMarkdown": latest_renderer_preflight.get("markdownPath") or "",
        "latest360RendererPreflightCsv": latest_renderer_preflight.get("csvPath") or "",
        "latest360RendererPreflightShell": latest_renderer_preflight.get("shellPath") or "",
        "latest360RendererPreflightCounts": latest_renderer_preflight.get("counts") or {},
        "latest360ProofRenderHtml": latest_proof_render.get("htmlPath") or "",
        "latest360ProofRenderJson": latest_proof_render.get("jsonPath") or "",
        "latest360ProofRenderMarkdown": latest_proof_render.get("markdownPath") or "",
        "latest360ProofRenderCounts": latest_proof_render.get("counts") or {},
        "latest360ProofRenderOutputPath": (latest_proof_render.get("paths") or {}).get("proofOutputPath") if isinstance(latest_proof_render.get("paths"), dict) else "",
        "latest360ProofRenderProbe": latest_proof_render.get("ffprobe") or {},
        "latest360ProofRenderLedgerJson": latest_proof_render_ledger.get("jsonPath") or "",
        "latest360ProofRenderLedgerCounts": latest_proof_render_ledger.get("counts") or {},
        "latest360ProofSprintHtml": latest_proof_sprint.get("htmlPath") or "",
        "latest360ProofSprintJson": latest_proof_sprint.get("jsonPath") or "",
        "latest360ProofSprintMarkdown": latest_proof_sprint.get("markdownPath") or "",
        "latest360ProofSprintCounts": latest_proof_sprint.get("counts") or {},
        "latestStudio360ProofControlRoomHtml": latest_proof_control_room.get("htmlPath") or "",
        "latestStudio360ProofControlRoomJson": latest_proof_control_room.get("jsonPath") or "",
        "latestStudio360ProofControlRoomMarkdown": latest_proof_control_room.get("markdownPath") or "",
        "latestStudio360ProofControlRoomCounts": latest_proof_control_room.get("counts") or {},
        "latestStudio360StartHereHtml": latest_start_here.get("htmlPath") or "",
        "latestStudio360StartHereJson": latest_start_here.get("jsonPath") or "",
        "latestStudio360StartHereMarkdown": latest_start_here.get("markdownPath") or "",
        "latestStudio360StartHereCounts": latest_start_here.get("counts") or {},
        "latestStudio360NextSourceCardHtml": latest_next_source_card.get("htmlPath") or "",
        "latestStudio360NextSourceCardJson": latest_next_source_card.get("jsonPath") or "",
        "latestStudio360NextSourceCardMarkdown": latest_next_source_card.get("markdownPath") or "",
        "latestStudio360NextSourceCardCounts": latest_next_source_card.get("counts") or {},
        "latestStudio360OperatorWorkbenchHtml": latest_operator_workbench.get("htmlPath") or "",
        "latestStudio360OperatorWorkbenchJson": latest_operator_workbench.get("jsonPath") or "",
        "latestStudio360OperatorWorkbenchMarkdown": latest_operator_workbench.get("markdownPath") or "",
        "latestStudio360OperatorWorkbenchCounts": latest_operator_workbench.get("counts") or {},
        "latest360ExportCandidateQueueHtml": latest_export_candidate_queue.get("htmlPath") or "",
        "latest360ExportCandidateQueueJson": latest_export_candidate_queue.get("jsonPath") or "",
        "latest360ExportCandidateQueueMarkdown": latest_export_candidate_queue.get("markdownPath") or "",
        "latest360ExportCandidateQueueCsv": latest_export_candidate_queue.get("csvPath") or "",
        "latest360ExportCandidateQueueCounts": latest_export_candidate_queue.get("counts") or {},
        "latest360SourceDeskHtml": latest_source_desk.get("htmlPath") or "",
        "latest360SourceDeskJson": latest_source_desk.get("jsonPath") or "",
        "latest360SourceDeskMarkdown": latest_source_desk.get("markdownPath") or "",
        "latest360SourceDeskCsv": latest_source_desk.get("csvPath") or "",
        "latest360SourceDeskCounts": latest_source_desk.get("counts") or {},
        "latest360RepairPreflightHtml": latest_repair_preflight.get("htmlPath") or "",
        "latest360RepairPreflightJson": latest_repair_preflight.get("jsonPath") or "",
        "latest360RepairPreflightMarkdown": latest_repair_preflight.get("markdownPath") or "",
        "latest360RepairPreflightCounts": latest_repair_preflight.get("counts") or {},
        "latest360RepairStatusHtml": latest_repair_status.get("htmlPath") or "",
        "latest360RepairStatusJson": latest_repair_status.get("jsonPath") or "",
        "latest360RepairStatusMarkdown": latest_repair_status.get("markdownPath") or "",
        "latest360RepairStatusCounts": latest_repair_status.get("counts") or {},
        "actionCards": reframe_action_cards,
        "nextSafestAction": (
            "Open Studio360 Start Here first. It chooses the calm next doorway for repair, proof, source, reframe/export, renderer preflight, or workflow-packet work without touching originals."
            if latest_start_here
            else
            "Open the Studio360 proof control room first. It combines proof review, next proof, export candidates, repair, source, and renderer readiness without touching originals."
            if latest_proof_control_room
            else "Open the Studio360 Reframe/Export Desk first. It combines source, proxy, repair, and 16:9/9:16 recipe readiness without touching originals."
            if latest_reframe_export_desk
            else "Open the Studio360 Export Candidate Queue first. It prepares versioned output intent without rendering or touching originals."
            if latest_export_candidate_queue
            else "Open the Studio360 Source Desk first. It combines workflow, proxy, reframe, repair, and decision status without touching originals."
            if latest_source_desk
            else
            "Open the 360 repair preflight first, then redownload/re-copy or park blocked damaged sources before retrying reframe/proxy work."
            if latest_repair_preflight
            else "Open the latest reframe packet, review 16:9/9:16 recipes, then generate or repair proxies for blocked groups."
        ),
        "productTruth": "360 originals stay whole; reframing and output formats are metadata/export decisions.",
    }


def lane_badge(status: str) -> str:
    if "blocked" in status or "needs" in status:
        return "attention"
    if "warning" in status or "found" in status:
        return "review"
    return "ready"


def normalize_action_card(card: dict[str, Any], lane_name: str = "") -> dict[str, Any]:
    cloned = dict(card)
    if lane_name:
        cloned["sourceLane"] = lane_name
        cloned["lane"] = lane_name
    action = str(cloned.get("action") or cloned.get("id") or "Review action")
    title = str(cloned.get("title") or cloned.get("label") or action)
    first_safe = cloned.get("firstSafeAction") if isinstance(cloned.get("firstSafeAction"), dict) else {}
    primary_path = str(
        cloned.get("htmlPath")
        or cloned.get("runwayHtml")
        or cloned.get("worksheetPath")
        or cloned.get("markdownPath")
        or cloned.get("runwayMarkdown")
        or cloned.get("jsonPath")
        or cloned.get("runwayJson")
        or first_safe.get("path")
        or ""
    )
    open_command = str(
        cloned.get("openCommand")
        or cloned.get("firstOpenCommand")
        or first_safe.get("command")
        or cloned.get("firstReceiptTemplate")
        or (f"open {shell_quote(primary_path)}" if primary_path else "")
    )
    cloned["title"] = title
    cloned["displayTitle"] = title
    cloned["primaryPath"] = primary_path
    cloned["openCommand"] = open_command
    if primary_path and not cloned.get("htmlPath") and primary_path.endswith(".html"):
        cloned["htmlPath"] = primary_path
    if primary_path and not cloned.get("markdownPath") and primary_path.endswith(".md"):
        cloned["markdownPath"] = primary_path
    if primary_path and not cloned.get("jsonPath") and primary_path.endswith(".json"):
        cloned["jsonPath"] = primary_path
    if first_safe:
        first_safe = dict(first_safe)
        first_safe.setdefault("label", f"Open {title}")
        if primary_path:
            first_safe.setdefault("path", primary_path)
        if open_command:
            first_safe.setdefault("command", open_command)
        first_safe.setdefault("safety", str(cloned.get("safety") or "Opens local evidence only. No mutation."))
        cloned["firstSafeAction"] = first_safe
    elif open_command or primary_path:
        cloned["firstSafeAction"] = {
            "label": f"Open {title}",
            "command": open_command,
            "path": primary_path,
            "safety": str(cloned.get("safety") or "Opens local evidence only. No mutation."),
        }
    next_action = str(cloned.get("nextSafestAction") or cloned.get("explanation") or "")
    safety = str(cloned.get("safety") or "")
    if not cloned.get("humanAsk"):
        if "publish" in action.lower() or "receipt" in action.lower() or "tower" in str(cloned.get("lane") or "").lower():
            cloned["humanAsk"] = "Review the local evidence and approve or hold before any external publishing, scheduling, upload, or receipt capture."
        elif "render" in action.lower() or "export" in action.lower():
            cloned["humanAsk"] = "Review proof/readiness evidence first; only authorize a versioned export after the small reversible check passes."
        elif "sync" in action.lower() or "duration" in action.lower():
            cloned["humanAsk"] = "Watch/listen the evidence and decide whether this needs hold, refine, re-sync, or approval."
        elif "photo" in str(cloned.get("lane") or "").lower():
            cloned["humanAsk"] = "Compare visual evidence and decide keep, reject, or review using metadata/sidecars only."
        else:
            cloned["humanAsk"] = next_action or "Open the local evidence and choose the next safe reversible action."
    if not cloned.get("agentSafeParallelWork"):
        if cloned.get("agentCanContinueWith"):
            cloned["agentSafeParallelWork"] = cloned.get("agentCanContinueWith")
        elif "No external" in safety or "No publish" in safety or "No render" in safety or "No originals" in safety:
            cloned["agentSafeParallelWork"] = "Summarize evidence, prepare diagnostics, and improve local packets without mutating sources or external accounts."
        else:
            cloned["agentSafeParallelWork"] = "Open/read local artifacts, tighten the next action, and stop before irreversible work."
    cloned.setdefault("agentCanContinueWith", cloned.get("agentSafeParallelWork") or "")
    cloned.setdefault("suggestedOwner", "Human reviewer + Codex")
    return cloned


def build_priority_queue(lanes: list[dict[str, Any]], max_items: int = 12) -> list[dict[str, Any]]:
    priority_order = {"attention": 0, "review": 1, "ready": 2}
    cards: list[dict[str, Any]] = []
    for lane in lanes:
        lane_name = str(lane.get("lane") or "")
        action_cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        for card in action_cards:
            if not isinstance(card, dict):
                continue
            cards.append(normalize_action_card(card, lane_name))

    def sort_key(card: dict[str, Any]) -> tuple[int, int, int, int, int, str]:
        priority = str(card.get("priority") or "review")
        raw_queue_sort_rank = card.get("queueSortRank")
        queue_sort_rank = int(raw_queue_sort_rank if raw_queue_sort_rank not in {None, ""} else 50)
        review_hold = int(card.get("reviewHold") or 0)
        warning_count = int(card.get("warningCount") or 0)
        review_pending = int(card.get("reviewPending") or 0)
        return (
            priority_order.get(priority, 1),
            queue_sort_rank,
            -review_hold,
            -warning_count,
            -review_pending,
            str(card.get("id") or card.get("action") or ""),
        )

    return sorted(cards, key=sort_key)[:max_items]


def build_first_actions_by_lane(lanes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    preferred_card_ids = {
        "Studio podcast/video": ["studio-top-review-companion", "studio-package-quality-desk"],
        "Tower publishing/social": ["tower-start-here", "tower-publication-approval-gate", "tower-publisher-desk"],
        "Nest writing/research": ["nest-writing-start-here", "nest-writing-momentum-board", "nest-writing-next-card", "nest-writing-control-room", "nest-research-packet"],
        "Photo Grove": ["photo-grove-start-here", "photo-grove-cull-theater", "photo-grove-first-pass-triage", "photo-grove-first-review-recipe", "photo-grove-culling-sprint-companion"],
        "360 workflow": ["360-start-here", "360-next-source-card", "360-operator-workbench", "360-proof-control-room", "360-proof-sprint-companion"],
    }
    first_actions: list[dict[str, Any]] = []
    for lane in lanes:
        lane_name = str(lane.get("lane") or "")
        action_cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        normalized = [
            normalize_action_card(card, lane_name)
            for card in action_cards
            if isinstance(card, dict)
        ]
        first_card: dict[str, Any] = {}
        for preferred_id in preferred_card_ids.get(lane_name, []):
            first_card = next((card for card in normalized if card.get("id") == preferred_id), {})
            if first_card:
                break
        if not first_card:
            top = build_priority_queue([{"lane": lane_name, "actionCards": normalized}], max_items=1)
            first_card = top[0] if top else {}
        first_safe = first_card.get("firstSafeAction") if isinstance(first_card.get("firstSafeAction"), dict) else {}
        open_command = (
            first_safe.get("command")
            or first_card.get("firstReceiptTemplate")
            or (f"open {shell_quote(str(first_card.get('runwayHtml')))}" if first_card.get("runwayHtml") else "")
            or (f"open {shell_quote(str(first_card.get('runwayJson')))}" if first_card.get("runwayJson") else "")
        )
        first_actions.append({
            "lane": lane_name,
            "laneStatus": lane.get("status") or "",
            "laneNextSafestAction": lane.get("nextSafestAction") or "",
            "cardId": first_card.get("id") or "",
            "priority": first_card.get("priority") or "",
            "status": first_card.get("status") or first_card.get("reframeStatus") or "",
            "action": first_card.get("action") or "Open lane evidence",
            "why": first_card.get("explanation") or lane.get("nextSafestAction") or "",
            "humanAsk": first_card.get("humanAsk") or first_card.get("nextSafestAction") or "",
            "agentSafeParallelWork": first_card.get("agentSafeParallelWork") or first_card.get("agentCanContinueWith") or "",
            "openCommand": open_command,
            "path": first_safe.get("path") or first_card.get("runwayHtml") or first_card.get("runwayJson") or "",
            "safety": first_card.get("safety") or first_safe.get("safety") or "Local evidence only. No source mutation, approval, publishing, upload, schedule, account mutation, overwrite, or receipt capture.",
        })
    return first_actions


def prepare_session(output_root: Path) -> Path:
    session_dir = output_root / datetime.now().strftime("%Y%m%d-%H%M%S-%f-quipsly-os")
    counter = 2
    base = session_dir
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_markdown(session_dir: Path, board: dict[str, Any]) -> None:
    lines = [
        "# Quipsly operating-system board",
        "",
        f"Generated: {board['generatedAt']}",
        "",
        "This is a read-only aggregation of proof artifacts. It does not publish, upload, delete, or approve anything.",
        "",
        "| Lane | Status | Next safest action |",
        "| --- | --- | --- |",
    ]
    for lane in board["lanes"]:
        lines.append(f"| {lane['lane']} | `{lane['status']}` | {lane['nextSafestAction']} |")
    first_actions = board.get("firstActionsByLane") if isinstance(board.get("firstActionsByLane"), list) else []
    if first_actions:
        lines.extend([
            "",
            "## First safe action by lane",
            "",
            "| Lane | First action | Open command | Safety |",
            "| --- | --- | --- | --- |",
        ])
        for action in first_actions:
            if not isinstance(action, dict):
                continue
            lines.append(
                f"| {action.get('lane', '')} | {action.get('action', '')} | `{action.get('openCommand', '')}` | {action.get('safety', '')} |"
            )
    priority_queue = board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else []
    if priority_queue:
        lines.extend([
            "",
            "## Start-here priority queue",
            "",
            "This queue is derived from lane action cards. It is guidance only; it does not approve, publish, upload, delete, or mutate sources.",
            "",
        ])
        for card in priority_queue:
            if not isinstance(card, dict):
                continue
            lines.extend([
                f"### {card.get('action', 'Review action')}",
                "",
                f"- Lane: `{card.get('sourceLane') or card.get('lane') or ''}`",
                f"- Priority: `{card.get('priority', 'review')}`",
                f"- Status: `{card.get('status') or card.get('reframeStatus') or ''}`",
                f"- Episode/group: `{card.get('episode') or card.get('groupKey') or card.get('id') or ''}`",
                f"- Why: {card.get('explanation', '')}",
                f"- Human ask: {card.get('humanAsk') or card.get('nextSafestAction') or ''}",
                f"- Agent-safe work: {card.get('agentSafeParallelWork') or card.get('agentCanContinueWith') or ''}",
                f"- Safety: {card.get('safety', '')}",
                "",
            ])
    for lane in board["lanes"]:
        action_cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        if not action_cards:
            continue
        lines.extend([
            "",
            f"## {lane['lane']} action cards",
            "",
        ])
        for card in action_cards[:10]:
            if not isinstance(card, dict):
                continue
            lines.extend([
                f"### {card.get('action', 'Review action')}",
                "",
                f"- Priority: `{card.get('priority', 'review')}`",
                f"- Group: `{card.get('groupKey', '')}`",
                f"- Status: `{card.get('reframeStatus', '')}`",
                f"- Source: `{card.get('reviewSourcePath', '')}`",
                f"- Why: {card.get('explanation', '')}",
                f"- Human ask: {card.get('humanAsk') or card.get('nextSafestAction') or ''}",
                f"- Agent-safe work: {card.get('agentSafeParallelWork') or card.get('agentCanContinueWith') or ''}",
                f"- Safety: {card.get('safety', '')}",
                "",
            ])
    lines.extend([
        "",
        "## Open this first",
        "",
        f"- HTML board: `{session_dir / 'index.html'}`",
        f"- JSON board: `{session_dir / 'quipsly-os-board.json'}`",
        "",
        "## Product rules preserved",
        "",
        "- Sources stay intact.",
        "- Decisions live as metadata.",
        "- Local readiness, human approval, and external publication receipts stay separate.",
        "- Human approval is required before external publishing or account mutation.",
    ])
    (session_dir / "START-HERE-Quipsly-OS.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(session_dir: Path, board: dict[str, Any]) -> None:
    cards = []

    def render_action_cards(action_cards: list[Any]) -> str:
        rendered_cards = []
        for card in action_cards:
            if not isinstance(card, dict):
                continue
            priority = str(card.get("priority") or "review")
            recipe_ids = card.get("recipeIds") if isinstance(card.get("recipeIds"), list) else []
            recipe_text = ", ".join(str(item) for item in recipe_ids[:4])
            if not recipe_text and card.get("episode"):
                recipe_text = f"Episode {card.get('episode')}"
            status_text = str(card.get("reframeStatus") or card.get("status") or "")
            duration_text = ""
            if card.get("durationSeconds") not in {None, ""}:
                duration_text = f"{round(float(card.get('durationSeconds') or 0), 2)}s"
            elif card.get("receiptSlots") not in {None, ""}:
                duration_text = f"{card.get('capturedReceipts', 0)}/{card.get('receiptSlots', 0)} receipts"
            elif card.get("itemCount") not in {None, ""}:
                duration_text = f"{card.get('itemCount', 0)} item(s)"
            source_text = str(card.get("reviewSourceKind") or card.get("lane") or "")
            source_path = str(card.get("reviewSourcePath") or "")
            path_payload = {
                "reviewSourcePath": source_path,
                "runwayHtml": card.get("runwayHtml") or "",
                "runwayJson": card.get("runwayJson") or "",
                "firstReceiptTemplate": card.get("firstReceiptTemplate") or "",
                "humanAsk": card.get("humanAsk") or card.get("nextSafestAction") or "",
                "agentSafeParallelWork": card.get("agentSafeParallelWork") or card.get("agentCanContinueWith") or "",
                "safety": card.get("safety"),
            }
            rendered_cards.append(f"""
            <li class="action-card {html.escape(priority)}">
              <div class="action-top">
                <span class="action-priority">{html.escape(priority)}</span>
                <span class="action-group">{html.escape(str(card.get('groupKey') or card.get('version') or card.get('id') or 'action'))}</span>
              </div>
              <h3>{html.escape(str(card.get('action') or 'Review action'))}</h3>
              <p>{html.escape(str(card.get('explanation') or ''))}</p>
              <p><strong>Human ask:</strong> {html.escape(str(card.get('humanAsk') or card.get('nextSafestAction') or ''))}</p>
              <p><strong>Codex can safely:</strong> {html.escape(str(card.get('agentSafeParallelWork') or card.get('agentCanContinueWith') or ''))}</p>
              <dl>
                <div><dt>Status</dt><dd>{html.escape(status_text)}</dd></div>
                <div><dt>Count</dt><dd>{html.escape(duration_text)}</dd></div>
                <div><dt>Source</dt><dd>{html.escape(source_text)}</dd></div>
                <div><dt>Recipe/episode</dt><dd>{html.escape(recipe_text)}</dd></div>
              </dl>
              <details><summary>Paths and safety</summary><pre>{html.escape(json.dumps(path_payload, indent=2))}</pre></details>
            </li>
            """)
        if not rendered_cards:
            return ""
        return f"<section class=\"actions\"><h3>Next safe actions</h3><ul>{''.join(rendered_cards)}</ul></section>"

    priority_queue_html = render_action_cards(board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else [])
    first_actions = board.get("firstActionsByLane") if isinstance(board.get("firstActionsByLane"), list) else []
    first_actions_html = "\n".join(
        f"""
        <article class="front-door">
          <div class="action-top">
            <span class="action-priority">{html.escape(str(action.get('priority') or 'lane'))}</span>
            <span class="action-group">{html.escape(str(action.get('lane') or ''))}</span>
          </div>
          <h3>{html.escape(str(action.get('action') or 'Open lane evidence'))}</h3>
          <p>{html.escape(str(action.get('why') or action.get('laneNextSafestAction') or ''))}</p>
          <p><strong>Human ask:</strong> {html.escape(str(action.get('humanAsk') or ''))}</p>
          <p><strong>Codex can safely:</strong> {html.escape(str(action.get('agentSafeParallelWork') or ''))}</p>
          <code>{html.escape(str(action.get('openCommand') or ''))}</code>
          <small>{html.escape(str(action.get('safety') or ''))}</small>
        </article>
        """
        for action in first_actions
        if isinstance(action, dict)
    )
    for lane in board["lanes"]:
        badge = lane_badge(lane["status"])
        details = []
        action_cards_html = ""
        for key, value in lane.items():
            if key in {"lane", "status", "nextSafestAction"}:
                continue
            if key == "actionCards" and isinstance(value, list):
                action_cards_html = render_action_cards(value)
                continue
            if isinstance(value, (dict, list)):
                rendered = html.escape(json.dumps(value, indent=2)[:1600])
                details.append(f"<details><summary>{html.escape(key)}</summary><pre>{rendered}</pre></details>")
            else:
                details.append(f"<p><b>{html.escape(key)}:</b> {html.escape(str(value))}</p>")
        cards.append(f"""
        <article class="card {badge}">
          <div class="badge">{html.escape(lane['status'])}</div>
          <h2>{html.escape(lane['lane'])}</h2>
          <p class="next">{html.escape(lane['nextSafestAction'])}</p>
          {action_cards_html}
          <div class="details">{''.join(details)}</div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Operating-System Board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111712;
      --panel: #19241d;
      --ink: #f8f1dc;
      --muted: #c9bfa1;
      --moss: #88b66c;
      --gold: #eccb5d;
      --water: #64bed4;
      --clay: #c4795a;
      --line: rgba(248,241,220,.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background: radial-gradient(circle at top right, rgba(100,190,212,.18), transparent 34%),
                  radial-gradient(circle at top left, rgba(136,182,108,.2), transparent 42%),
                  var(--bg);
      color: var(--ink);
      font-family: Avenir Next, Helvetica Neue, sans-serif;
    }}
    header {{ padding: 36px clamp(20px, 5vw, 72px); border-bottom: 1px solid var(--line); }}
    .eyebrow {{ letter-spacing: .24em; text-transform: uppercase; color: var(--gold); font-weight: 900; font-size: 12px; }}
    h1 {{ margin: 10px 0; font-size: clamp(38px, 7vw, 84px); line-height: .9; max-width: 980px; }}
    header p {{ max-width: 860px; color: var(--muted); font-size: 18px; line-height: 1.5; }}
    main {{ padding: 28px clamp(16px, 4vw, 56px) 64px; display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 18px; }}
    .card {{ border: 1px solid var(--line); border-radius: 24px; background: linear-gradient(180deg, rgba(25,36,29,.94), rgba(14,20,16,.96)); padding: 20px; box-shadow: 0 18px 46px rgba(0,0,0,.25); }}
    .card.ready {{ border-color: rgba(136,182,108,.45); }}
    .card.review {{ border-color: rgba(236,203,93,.45); }}
    .card.attention {{ border-color: rgba(196,121,90,.5); }}
    .priority-board {{ margin: 26px clamp(16px, 4vw, 56px) 0; border: 1px solid rgba(236,203,93,.36); border-radius: 28px; padding: 22px; background: rgba(236,203,93,.07); box-shadow: 0 18px 46px rgba(0,0,0,.2); }}
	    .priority-board h2 {{ margin: 0 0 8px; font-size: clamp(24px, 4vw, 42px); }}
	    .priority-board > p {{ margin: 0 0 18px; max-width: 900px; }}
	    .front-doors {{ margin: 26px clamp(16px, 4vw, 56px) 0; border: 1px solid rgba(100,190,212,.32); border-radius: 28px; padding: 22px; background: rgba(100,190,212,.06); box-shadow: 0 18px 46px rgba(0,0,0,.18); }}
	    .front-doors h2 {{ margin: 0 0 8px; font-size: clamp(24px, 4vw, 42px); }}
	    .front-door-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); gap: 12px; margin-top: 18px; }}
	    .front-door {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(248,241,220,.05); }}
	    .front-door h3 {{ margin: 10px 0 6px; }}
	    .front-door code {{ display: block; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--water); background: rgba(0,0,0,.22); border-radius: 12px; padding: 10px; }}
	    .front-door small {{ display: block; color: var(--muted); margin-top: 8px; }}
	    .badge {{ display: inline-flex; border-radius: 999px; padding: 7px 10px; background: rgba(248,241,220,.09); color: var(--gold); text-transform: uppercase; letter-spacing: .12em; font-size: 11px; font-weight: 900; }}
    h2 {{ margin: 16px 0 8px; }}
    .next {{ color: var(--ink); font-weight: 700; line-height: 1.45; }}
    p {{ color: var(--muted); }}
    details {{ border-top: 1px solid var(--line); padding: 9px 0; }}
    summary {{ cursor: pointer; color: var(--water); font-weight: 800; }}
    pre {{ white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); font-size: 12px; }}
    .actions {{ margin: 18px 0; }}
    .actions h3 {{ margin: 0 0 10px; color: var(--gold); font-size: 13px; letter-spacing: .14em; text-transform: uppercase; }}
    .actions ul {{ list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }}
    .action-card {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(248,241,220,.055); }}
    .action-card.ready {{ border-color: rgba(136,182,108,.36); background: rgba(136,182,108,.075); }}
    .action-card.attention {{ border-color: rgba(196,121,90,.45); background: rgba(196,121,90,.08); }}
    .action-top {{ display: flex; justify-content: space-between; gap: 12px; align-items: center; }}
    .action-priority {{ border-radius: 999px; padding: 5px 8px; background: rgba(0,0,0,.24); color: var(--gold); text-transform: uppercase; letter-spacing: .12em; font-size: 10px; font-weight: 900; }}
    .action-group {{ color: var(--water); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; overflow-wrap: anywhere; }}
    .action-card h3 {{ margin: 10px 0 6px; font-size: 16px; color: var(--ink); }}
    .action-card p {{ margin: 0 0 10px; line-height: 1.4; }}
    .action-card dl {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0 0 10px; }}
    .action-card dl div {{ border-radius: 12px; background: rgba(0,0,0,.18); padding: 8px; min-width: 0; }}
    .action-card dt {{ color: var(--muted); font-size: 10px; text-transform: uppercase; letter-spacing: .12em; }}
    .action-card dd {{ margin: 3px 0 0; color: var(--ink); font-size: 12px; overflow-wrap: anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly OS</div>
    <h1>One calm map for the whole creative machine.</h1>
    <p>Studio, Nest, Tower, Photo Grove, and 360 are separate workbenches, but they share one rule: sources stay whole, decisions stay visible, and nothing becomes published just because a local artifact exists.</p>
  </header>
	  <section class="priority-board">
	    <h2>Start here: highest-signal reversible actions</h2>
	    <p>This queue is derived from the lane cards below. It is a triage map, not an approval system. Use it to decide what to review, repair, or prepare next while keeping publication receipts honest.</p>
	    {priority_queue_html}
	  </section>
	  <section class="front-doors">
	    <h2>Five front doors</h2>
	    <p>One first safe action per lane. These commands open local evidence only; they do not mutate sources, publish, upload, schedule, approve, or create receipts.</p>
	    <div class="front-door-grid">{first_actions_html}</div>
	  </section>
	  <main>{''.join(cards)}</main>
</body>
</html>
"""
    (session_dir / "index.html").write_text(html_text, encoding="utf-8")


def update_latest(output_root: Path, session_dir: Path, board: dict[str, Any]) -> None:
    lane_action_card_summaries: dict[str, list[dict[str, Any]]] = {}
    for lane in board.get("lanes") or []:
        if not isinstance(lane, dict):
            continue
        lane_name = str(lane.get("lane") or "")
        action_cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        lane_action_card_summaries[lane_name] = [
            {
                "id": str(card.get("id") or ""),
                "priority": str(card.get("priority") or ""),
                "queueSortRank": card.get("queueSortRank"),
                "status": str(card.get("status") or ""),
                "action": str(card.get("action") or ""),
                "path": str(card.get("runwayHtml") or card.get("htmlPath") or card.get("runwayJson") or card.get("jsonPath") or ""),
            }
            for card in action_cards
            if isinstance(card, dict)
        ]
    pointer = {
        "schema": "quipsly.os.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": board.get("status") or "quipsly-os-board-ready",
        "latestSessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "quipsly-os-board.json"),
        "markdownPath": str(session_dir / "START-HERE-Quipsly-OS.md"),
        "laneStatuses": {lane["lane"]: lane["status"] for lane in board["lanes"]},
        "laneActionCardIds": {
            lane_name: [card.get("id") for card in cards if card.get("id")]
            for lane_name, cards in lane_action_card_summaries.items()
        },
        "laneActionCards": lane_action_card_summaries,
        "priorityQueue": board.get("priorityQueue") or [],
        "firstActionsByLane": board.get("firstActionsByLane") or [],
        "humanAsk": "Open the Quipsly OS board to choose the next safest cross-lane action. Treat it as a triage map, not an approval or publication surface.",
        "agentSafeParallelWork": "Codex may improve local review boards, handoff fields, validation reports, metadata packets, and blocker precision. Do not mutate originals, approve, publish, upload, schedule, delete, overwrite versions, or create receipt truth.",
        "nextSafestAction": board.get("nextSafestAction") or "Open the OS board, start with the priority queue, and take the smallest reversible action that improves production truth.",
        "firstSafeAction": {
            "label": "Open Quipsly OS board",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local OS board evidence only. No source mutation, approval, publishing, upload, schedule, delete, overwrite, account mutation, or receipt capture occurs.",
        },
        "truth": "Latest pointer only. OS board sessions are versioned and preserved; this pointer does not approve, publish, upload, schedule, mutate sources, or create receipts.",
    }
    (output_root / "latest-quipsly-os-board.json").write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_board(args: argparse.Namespace) -> tuple[Path, dict[str, Any]]:
    output_root = Path(args.output_root)
    session_dir = prepare_session(output_root)
    release_root = Path(args.release_root)
    photo_root = Path(args.photo_root)
    book_root = Path(args.book_root)
    roots_360 = [Path(value) for value in args.roots_360]
    validation_pointer = load_json(output_root / "latest-quipsly-os-validation.json")
    validation_json_path = validation_pointer.get("jsonPath") if isinstance(validation_pointer, dict) else None
    validation_payload = load_json(Path(str(validation_json_path))) if validation_json_path else {}
    refresh_pointer = load_json(output_root / "latest-quipsly-os-refresh.json")
    refresh_json_path = refresh_pointer.get("jsonPath") if isinstance(refresh_pointer, dict) else None
    refresh_payload = load_json(Path(str(refresh_json_path))) if refresh_json_path else {}
    lanes = [
        summarize_studio(release_root),
        summarize_tower(release_root),
        summarize_writing(book_root),
        summarize_photo(photo_root),
        summarize_360(roots_360),
    ]
    board = {
        "schema": "quipsly.operating-system-board.v1",
        "generatedAt": iso_now(),
        "truth": "Read-only local aggregation. No publication, upload, account mutation, source mutation, or approval action is performed.",
        "sessionDir": str(session_dir),
        "latestQuipslyOSValidationHtml": validation_pointer.get("htmlPath") or "",
        "latestQuipslyOSValidationJson": validation_pointer.get("jsonPath") or "",
        "latestQuipslyOSValidationMarkdown": validation_pointer.get("markdownPath") or "",
        "latestQuipslyOSValidationStatus": validation_pointer.get("status") or validation_payload.get("status") or "not-run",
        "latestQuipslyOSValidationCounts": validation_pointer.get("counts") or validation_payload.get("counts") or {},
        "latestQuipslyOSRefreshHtml": refresh_pointer.get("htmlPath") or "",
        "latestQuipslyOSRefreshJson": refresh_pointer.get("jsonPath") or "",
        "latestQuipslyOSRefreshMarkdown": refresh_pointer.get("markdownPath") or "",
        "latestQuipslyOSRefreshStatus": refresh_pointer.get("status") or refresh_payload.get("status") or "not-run",
        "latestQuipslyOSRefreshCounts": refresh_pointer.get("counts") or refresh_payload.get("counts") or {},
        "priorityQueue": build_priority_queue(lanes),
        "firstActionsByLane": build_first_actions_by_lane(lanes),
        "lanes": lanes,
    }
    (session_dir / "quipsly-os-board.json").write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_markdown(session_dir, board)
    write_html(session_dir, board)
    update_latest(output_root, session_dir, board)
    return session_dir, board


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a cross-lane Quipsly OS board.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--photo-root", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--book-root", default=str(DEFAULT_BOOK_ROOT))
    parser.add_argument("--roots-360", nargs="*", default=[str(path) for path in DEFAULT_360_ROOTS])
    args = parser.parse_args()
    session_dir, board = build_board(args)
    result = {
        "ok": True,
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "quipsly-os-board.json"),
        "markdownPath": str(session_dir / "START-HERE-Quipsly-OS.md"),
        "laneStatuses": {lane["lane"]: lane["status"] for lane in board["lanes"]},
    }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
