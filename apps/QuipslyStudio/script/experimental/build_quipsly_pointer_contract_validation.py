#!/usr/bin/env python3
"""Validate the human/agent front-door pointer contracts for Quipsly OS.

This is a read-only guardrail for the production runway. It checks that the
latest next-action pointers for Studio, Nest, Photo Grove, Studio360, and Tower
carry enough truth for humans and agents to know what to open, what is safe,
what is pending, and what has not happened.
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
OUT_ROOT = OS_ROOT / "PointerContractValidation"
LATEST_POINTER = OS_ROOT / "latest-quipsly-pointer-contract-validation.json"

POINTERS = {
    "studio": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-next-review-card/latest-studio-next-review-card.json"),
    "studioSyncAid": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-sync-decision-aid.json"),
    "studioPackageDesk": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-package-quality-desk.json"),
    "studioReviewTheater": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/studio-review-theater/latest-studio-review-theater.json"),
    "studioNextShortsReviewBatch": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/shorts-review-batches/latest-shorts-review-batch.json"),
    "studioWatchListenRoom": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-watch-listen-review-room.json"),
    "studioDurationWarningReview": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-warning-packets/latest-duration-warning-review-packet.json"),
    "studioDurationExperimentMatrix": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-experiment-matrix/latest-duration-experiment-matrix.json"),
    "studioDurationVersionWorkorders": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-version-workorders/latest-duration-version-workorders.json"),
    "studioDurationEditRecipeSkeletons": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/duration-edit-recipes/latest-duration-edit-recipe-skeletons.json"),
    "studioTranscriptSourceWorkorders": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-source-workorders/latest-transcript-source-workorders.json"),
    "studioTranscriptExecutionReadiness": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-execution-readiness/latest-transcript-execution-readiness.json"),
    "studioTranscriptPilot": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-pilots/latest-transcript-pilot.json"),
    "studioTranscriptReviewWorkbench": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-review-workbench/latest-transcript-review-workbench.json"),
    "studioTranscriptReviewDecisionLedger": Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-transcript-review-decision-ledger.json"),
    "nest": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-next-card.json"),
    "nestAuthorDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-author-desk.json"),
    "nestReviewDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-review-desk.json"),
    "nestDailyPacket": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-daily-packet.json"),
    "dailyWritingReadiness": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-daily-writing-desk-readiness.json"),
    "nestWritingRunway": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-writing-publication-runway.json"),
    "nestRevisionBatch": Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting/latest-nest-writing-next-revision-batch.json"),
    "photo": Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-next-cull-card.json"),
    "photoWorkbench": Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-operator-workbench.json"),
    "photoCullTheater": Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-cull-theater.json"),
    "photoProofDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-proof-desk.json"),
    "photoNextCullBatch": Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-next-cull-batch.json"),
    "studio360": Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-next-source-card.json"),
    "studio360Workbench": Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-studio360-operator-workbench.json"),
    "studio360RepairPreflight": Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-repair-preflight.json"),
    "studio360SourceDesk": Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360/latest-360-source-desk.json"),
    "tower": Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-next-publishing-card/latest-tower-next-publishing-card.json"),
    "towerNextPublishingBatch": Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-next-publishing-batch/latest-tower-next-publishing-batch.json"),
    "towerSocialCommand": Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/latest-tower-social-command-center.json"),
    "towerWorkbench": Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-operator-workbench/latest-tower-operator-workbench.json"),
    "returnBrief": Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-return-brief.json"),
}
CURRENT_PRODUCTION_BLOCKERS_POINTER = OS_ROOT / "latest-current-production-blockers.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-pointer-contract-validation")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_target(pointer: dict[str, Any]) -> dict[str, Any]:
    path_value = str(pointer.get("jsonPath") or "")
    if not path_value:
        return {}
    return load_json(Path(path_value))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def check(
    checks: list[dict[str, Any]],
    lane: str,
    key: str,
    ok: bool,
    summary: str,
    evidence: dict[str, Any] | None = None,
    severity: str = "fail",
) -> None:
    checks.append({
        "lane": lane,
        "key": key,
        "status": "pass" if ok else severity,
        "summary": summary,
        "evidence": evidence or {},
    })


def path_exists(path_value: Any) -> bool:
    path = str(path_value or "")
    return bool(path and Path(path).exists())


def pointer_common_checks(checks: list[dict[str, Any]], lane: str, pointer_path: Path, pointer: dict[str, Any], target: dict[str, Any]) -> None:
    html_path = str(pointer.get("htmlPath") or target.get("htmlPath") or "")
    json_path = str(pointer.get("jsonPath") or "")
    action = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else target.get("firstSafeAction") if isinstance(target.get("firstSafeAction"), dict) else {}
    truth = pointer.get("truth") if isinstance(pointer.get("truth"), dict) else target.get("truth") if isinstance(target.get("truth"), dict) else {}
    check(checks, lane, "pointer-exists", pointer_path.exists(), "Latest pointer file exists", {"path": str(pointer_path)})
    check(checks, lane, "status-ready", bool(str(pointer.get("status") or target.get("status") or "")), "Pointer carries a status", {"status": pointer.get("status") or target.get("status")})
    check(checks, lane, "html-path-exists", path_exists(html_path), "Pointer card HTML exists", {"htmlPath": html_path})
    check(checks, lane, "json-path-exists", path_exists(json_path), "Pointer target JSON exists", {"jsonPath": json_path})
    check(checks, lane, "first-safe-action", bool(action.get("path") and action.get("safety")), "Pointer exposes a first safe action", {"firstSafeAction": action})
    forbidden_truth = [
        "externalPublishing",
        "externalUpload",
        "externalSchedulesCreated",
        "receiptTruthCreated",
        "sourceFilesMutated",
        "versionsOverwritten",
        "accountMutation",
        "approvalCreated",
    ]
    dangerous_true = [key for key in forbidden_truth if truth.get(key) is True]
    check(checks, lane, "no-dangerous-truth", not dangerous_true, "Pointer truth does not claim external or destructive actions", {"dangerousTrue": dangerous_true, "truth": truth})


def return_brief_target() -> dict[str, Any]:
    pointer = load_json(POINTERS["returnBrief"])
    target = load_target(pointer)
    return {**pointer, **target} if target else pointer


def conveyor_path_by_lane(brief: dict[str, Any]) -> dict[str, str]:
    rows = ((brief.get("productionConveyor") or {}).get("rows") if isinstance(brief.get("productionConveyor"), dict) else []) or []
    paths: dict[str, str] = {}
    for row in rows:
        if isinstance(row, dict):
            lane = str(row.get("lane") or "")
            path = str(row.get("path") or "")
            if lane and path:
                paths[lane] = path
    return paths


def build() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    loaded: dict[str, tuple[dict[str, Any], dict[str, Any]]] = {}
    for lane, pointer_path in POINTERS.items():
        if lane == "returnBrief":
            continue
        pointer = load_json(pointer_path)
        target = load_target(pointer)
        loaded[lane] = (pointer, target)
        pointer_common_checks(checks, lane, pointer_path, pointer, target)

    studio, studio_target = loaded["studio"]
    evidence = studio_target.get("evidenceContext") if isinstance(studio_target.get("evidenceContext"), dict) else {}
    open_labels = [str(item.get("label") or "") for item in studio_target.get("openCommands", []) if isinstance(item, dict)]
    current_card_has_sync_investigation = bool(evidence.get("syncInvestigationJsonPath"))
    check(checks, "studio", "first-evidence-exists", studio_target.get("firstEvidenceExists") is True, "Studio next review card points at existing first evidence", {"firstEvidencePath": studio_target.get("firstEvidencePath")})
    if current_card_has_sync_investigation:
        check(checks, "studio", "sync-worksheet-visible", evidence.get("syncReviewWorksheetExists") is True, "Studio sync worksheet is visible from next card", evidence)
        check(checks, "studio", "sync-snippets-visible", int(evidence.get("syncSnippetCount") or 0) > 0, "Studio sync snippet folder is visible from next card", evidence)
        check(checks, "studio", "sync-open-labels", "Open sync review worksheet" in open_labels and "Open sync snippets folder" in open_labels, "Studio next card has explicit sync worksheet/snippet open commands", {"openLabels": open_labels})
        check(checks, "studio", "sync-decision-aid-visible", evidence.get("syncDecisionAidExists") is True, "Studio next card points directly at the sync decision aid", evidence)
        check(checks, "studio", "sync-decision-aid-matches", evidence.get("syncDecisionAidMatchesInvestigation") is True, "Studio next card sync decision aid matches the source investigation", evidence)
        check(checks, "studio", "sync-decision-aid-open-label", "Open sync decision aid" in open_labels, "Studio next card has an explicit sync decision aid open command", {"openLabels": open_labels})
    else:
        check(checks, "studio", "next-card-nonsync-evidence-is-not-mislabeled", int(evidence.get("syncSnippetCount") or 0) == 0 and "Open sync snippets folder" not in open_labels and "Open sync review worksheet" not in open_labels, "Studio non-sync next card does not label ordinary review snippets as sync evidence", {"openLabels": open_labels, "evidence": evidence})
        check(checks, "studio", "next-card-keeps-sync-aid-separate", evidence.get("syncDecisionAidRelation") in {"", "separate-sync-review-door", None}, "Studio non-sync next card keeps unrelated sync decision aid as a separate front-door target", evidence)

    sync_aid, sync_aid_target = loaded["studioSyncAid"]
    sync_aid_counts = sync_aid.get("counts") if isinstance(sync_aid.get("counts"), dict) else {}
    sync_aid_truth = sync_aid.get("truth") if isinstance(sync_aid.get("truth"), dict) else sync_aid_target.get("truth") if isinstance(sync_aid_target.get("truth"), dict) else {}
    check(checks, "studioSyncAid", "aid-status-ready", sync_aid.get("status") == "studio-sync-decision-aid-ready", "Studio sync decision aid is ready", {"status": sync_aid.get("status")})
    check(checks, "studioSyncAid", "comparison-rows-ready", int(sync_aid_counts.get("comparisonRows") or 0) >= 5 and int(sync_aid_counts.get("readySnippetRows") or 0) >= 5, "Studio sync decision aid exposes five ready comparison rows", {"counts": sync_aid_counts})
    check(checks, "studioSyncAid", "no-missing-snippets", int(sync_aid_counts.get("missingSnippetRows") or 0) == 0, "Studio sync decision aid has no missing snippet rows", {"counts": sync_aid_counts})
    check(checks, "studioSyncAid", "outcome-routes-ready", int(sync_aid_counts.get("outcomeRows") or 0) >= 4, "Studio sync decision aid exposes reversible outcome routes", {"counts": sync_aid_counts})
    check(checks, "studioSyncAid", "source-investigation-visible", path_exists(sync_aid_target.get("syncInvestigationJsonPath")) and path_exists(sync_aid_target.get("syncInvestigationWorksheetPath")), "Studio sync decision aid links back to source investigation evidence", {"syncInvestigationJsonPath": sync_aid_target.get("syncInvestigationJsonPath"), "syncInvestigationWorksheetPath": sync_aid_target.get("syncInvestigationWorksheetPath")})
    bad_sync_truth = [
        key for key in ["reviewDecisionsWritten", "repairsExecuted", "exportsCreated", "externalPublishing", "externalUpload", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if sync_aid_truth.get(key) is True
    ]
    check(checks, "studioSyncAid", "decision-aid-is-read-only", not bad_sync_truth, "Studio sync decision aid truth stays read-only", {"dangerousTrue": bad_sync_truth, "truth": sync_aid_truth})

    studio_package_desk, studio_package_desk_target = loaded["studioPackageDesk"]
    studio_package_counts = studio_package_desk.get("counts") if isinstance(studio_package_desk.get("counts"), dict) else {}
    studio_package_truth = studio_package_desk.get("truth") if isinstance(studio_package_desk.get("truth"), dict) else studio_package_desk_target.get("truth") if isinstance(studio_package_desk_target.get("truth"), dict) else {}
    check(checks, "studioPackageDesk", "package-desk-ready", studio_package_desk.get("status") == "package-quality-desk-ready", "Studio package quality desk is ready", {"status": studio_package_desk.get("status")})
    check(checks, "studioPackageDesk", "package-desk-packages-and-shorts", int(studio_package_counts.get("currentBestPackages") or 0) >= 6 and int(studio_package_counts.get("readyShorts") or 0) >= 1, "Studio package quality desk carries package and shorts counts", {"counts": studio_package_counts})
    check(checks, "studioPackageDesk", "package-desk-warning-truth", int(studio_package_counts.get("warningEpisodes") or 0) >= 1 and int(studio_package_counts.get("receiptSlots") or 0) >= 1 and int(studio_package_counts.get("capturedReceipts") or 0) == 0, "Studio package quality desk keeps warnings visible and receipt truth empty", {"counts": studio_package_counts})
    bad_package_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "approvalCreated", "accountMutation", "originalsMutated"]
        if studio_package_truth.get(key) is True or studio_package_desk.get(key) is True
    ]
    check(checks, "studioPackageDesk", "package-desk-is-read-only", not bad_package_truth, "Studio package quality desk truth stays read-only", {"dangerousTrue": bad_package_truth, "truth": studio_package_truth})

    studio_review_theater, studio_review_theater_target = loaded["studioReviewTheater"]
    studio_theater_counts = studio_review_theater.get("counts") if isinstance(studio_review_theater.get("counts"), dict) else {}
    studio_theater_truth = studio_review_theater.get("truth") if isinstance(studio_review_theater.get("truth"), dict) else studio_review_theater_target.get("truth") if isinstance(studio_review_theater_target.get("truth"), dict) else {}
    check(checks, "studioReviewTheater", "theater-ready", studio_review_theater.get("status") == "studio-review-theater-ready", "Studio review theater is ready", {"status": studio_review_theater.get("status")})
    check(checks, "studioReviewTheater", "theater-media-counts", int(studio_theater_counts.get("episodes") or 0) >= 6 and int(studio_theater_counts.get("videoRows") or 0) >= 12 and int(studio_theater_counts.get("audioRows") or 0) >= 6, "Studio review theater exposes all episode long-form media rows", {"counts": studio_theater_counts})
    check(checks, "studioReviewTheater", "theater-shorts-and-missing", int(studio_theater_counts.get("shortRows") or 0) > 0 and int(studio_theater_counts.get("missingArtifacts") or 0) == 0, "Studio review theater exposes shorts and has no missing primary artifacts", {"counts": studio_theater_counts})
    bad_theater_truth = [
        key for key in ["approvalsChanged", "reviewLedgerWritten", "exportsCreated", "externalPublishing", "externalUpload", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if studio_theater_truth.get(key) is True or studio_review_theater.get(key) is True
    ]
    check(checks, "studioReviewTheater", "theater-is-read-only", not bad_theater_truth, "Studio review theater truth stays read-only", {"dangerousTrue": bad_theater_truth, "truth": studio_theater_truth})

    studio_shorts_batch, studio_shorts_batch_target = loaded["studioNextShortsReviewBatch"]
    studio_shorts_batch_counts = studio_shorts_batch.get("counts") if isinstance(studio_shorts_batch.get("counts"), dict) else {}
    studio_shorts_batch_truth = studio_shorts_batch.get("truth") if isinstance(studio_shorts_batch.get("truth"), dict) else studio_shorts_batch_target.get("truth") if isinstance(studio_shorts_batch_target.get("truth"), dict) else {}
    check(checks, "studioNextShortsReviewBatch", "shorts-batch-ready", studio_shorts_batch.get("status") == "studio-next-shorts-review-batch-ready", "Studio next shorts review batch is ready", {"status": studio_shorts_batch.get("status")})
    check(checks, "studioNextShortsReviewBatch", "shorts-batch-useful-rows", int(studio_shorts_batch_counts.get("sourceShortRows") or 0) >= 40 and int(studio_shorts_batch_counts.get("batchRows") or 0) >= 8 and int(studio_shorts_batch_counts.get("playableRows") or 0) >= 8, "Studio next shorts review batch exposes a useful watch/listen subset from the source shorts inventory", {"counts": studio_shorts_batch_counts})
    check(checks, "studioNextShortsReviewBatch", "shorts-batch-safe-default", int(studio_shorts_batch_counts.get("warningEpisodeRows") or 0) == 0 and int(studio_shorts_batch_counts.get("dryRunRows") or 0) >= int(studio_shorts_batch_counts.get("batchRows") or 0), "Studio next shorts review batch defaults to non-warning rows and exposes local dry-run commands", {"counts": studio_shorts_batch_counts})
    check(checks, "studioNextShortsReviewBatch", "shorts-batch-receipt-boundary", int(studio_shorts_batch_counts.get("capturedReceipts") or 0) == 0 and int(studio_shorts_batch_counts.get("receiptSlots") or 0) >= int(studio_shorts_batch_counts.get("batchRows") or 0), "Studio next shorts review batch keeps receipt slots empty until real platform proof exists", {"counts": studio_shorts_batch_counts})
    bad_studio_shorts_batch_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if studio_shorts_batch_truth.get(key) is True or studio_shorts_batch_counts.get(key) is True
    ]
    check(checks, "studioNextShortsReviewBatch", "shorts-batch-is-read-only", not bad_studio_shorts_batch_truth, "Studio next shorts review batch truth stays read-only", {"dangerousTrue": bad_studio_shorts_batch_truth, "truth": studio_shorts_batch_truth, "counts": studio_shorts_batch_counts})

    studio_watch_listen, studio_watch_listen_target = loaded["studioWatchListenRoom"]
    studio_watch_counts = studio_watch_listen.get("counts") if isinstance(studio_watch_listen.get("counts"), dict) else {}
    studio_watch_truth = studio_watch_listen.get("truth") if isinstance(studio_watch_listen.get("truth"), dict) else studio_watch_listen_target.get("truth") if isinstance(studio_watch_listen_target.get("truth"), dict) else {}
    check(checks, "studioWatchListenRoom", "watch-listen-ready", studio_watch_listen.get("status") == "watch-listen-review-ready", "Studio watch/listen review room is ready", {"status": studio_watch_listen.get("status")})
    check(checks, "studioWatchListenRoom", "watch-listen-review-items", int(studio_watch_counts.get("reviewItems") or 0) > 0 and int(studio_watch_counts.get("embeddableMediaRows") or 0) > 0, "Studio watch/listen review room exposes review items and embeddable media", {"counts": studio_watch_counts})
    check(checks, "studioWatchListenRoom", "watch-listen-note-templates", int(studio_watch_counts.get("localDecisionNoteTemplates") or 0) > 0, "Studio watch/listen review room includes local decision note templates", {"counts": studio_watch_counts})
    check(checks, "studioWatchListenRoom", "watch-listen-local-decision-commands", int(studio_watch_counts.get("localDecisionCommandRows") or 0) > 0, "Studio watch/listen review room exposes safe local decision commands", {"counts": studio_watch_counts})
    bad_watch_truth = [
        key for key in ["externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "originalsMutated", "approvalsChanged", "reviewLedgerWritten", "exportsCreated"]
        if studio_watch_truth.get(key) is True or studio_watch_counts.get(key) is True or studio_watch_listen.get(key) is True
    ]
    check(checks, "studioWatchListenRoom", "watch-listen-is-read-only", not bad_watch_truth, "Studio watch/listen review room truth stays read-only", {"dangerousTrue": bad_watch_truth, "truth": studio_watch_truth, "counts": studio_watch_counts})

    studio_duration_warning, studio_duration_warning_target = loaded["studioDurationWarningReview"]
    duration_action = (
        studio_duration_warning.get("firstSafeAction")
        if isinstance(studio_duration_warning.get("firstSafeAction"), dict)
        else studio_duration_warning_target.get("firstSafeAction")
        if isinstance(studio_duration_warning_target.get("firstSafeAction"), dict)
        else {}
    )
    duration_truth = str(studio_duration_warning.get("truth") or studio_duration_warning_target.get("truth") or "")
    duration_episode_count = int(studio_duration_warning.get("episodeCount") or studio_duration_warning_target.get("episodeCount") or 0)
    check(checks, "studioDurationWarningReview", "duration-warning-packet-ready", studio_duration_warning.get("status") == "duration-warning-review-ready", "Studio duration warning review packet is ready", {"status": studio_duration_warning.get("status")})
    check(checks, "studioDurationWarningReview", "duration-warning-episode-count", duration_episode_count >= 2, "Studio duration warning review packet carries warning episodes", {"episodeCount": duration_episode_count})
    check(checks, "studioDurationWarningReview", "duration-warning-first-action", path_exists(duration_action.get("path")) and bool(duration_action.get("command") and duration_action.get("safety")), "Studio duration warning packet exposes an exact safe open action", {"firstSafeAction": duration_action})
    check(checks, "studioDurationWarningReview", "duration-warning-read-only-truth", "does not mutate originals" in duration_truth and "publish" in duration_truth and "receipt" in duration_truth, "Studio duration warning packet states review-only truth", {"truth": duration_truth})

    studio_duration_matrix, studio_duration_matrix_target = loaded["studioDurationExperimentMatrix"]
    duration_matrix_truth = studio_duration_matrix.get("truth") if isinstance(studio_duration_matrix.get("truth"), dict) else studio_duration_matrix_target.get("truth") if isinstance(studio_duration_matrix_target.get("truth"), dict) else {}
    duration_matrix_episodes = studio_duration_matrix.get("episodes") if isinstance(studio_duration_matrix.get("episodes"), list) else studio_duration_matrix_target.get("episodes") if isinstance(studio_duration_matrix_target.get("episodes"), list) else []
    duration_matrix_html = str(studio_duration_matrix.get("htmlPath") or studio_duration_matrix_target.get("htmlPath") or "")
    bad_duration_matrix_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered"]
        if duration_matrix_truth.get(key) is True
    ]
    check(checks, "studioDurationExperimentMatrix", "duration-experiment-matrix-ready", studio_duration_matrix.get("status") == "duration-experiment-matrix-ready", "Studio duration experiment matrix is ready", {"status": studio_duration_matrix.get("status")})
    check(checks, "studioDurationExperimentMatrix", "duration-experiment-matrix-covers-episodes", len(duration_matrix_episodes) >= 6 and path_exists(duration_matrix_html), "Studio duration experiment matrix covers Episodes 1-6 and has an openable HTML report", {"episodes": len(duration_matrix_episodes), "htmlPath": duration_matrix_html})
    check(checks, "studioDurationExperimentMatrix", "duration-experiment-matrix-read-only", not bad_duration_matrix_truth and duration_matrix_truth.get("reviewOnly") is True, "Studio duration experiment matrix stays review-only", {"dangerousTrue": bad_duration_matrix_truth, "truth": duration_matrix_truth})

    studio_duration_workorders, studio_duration_workorders_target = loaded["studioDurationVersionWorkorders"]
    duration_workorders_truth = studio_duration_workorders.get("truth") if isinstance(studio_duration_workorders.get("truth"), dict) else studio_duration_workorders_target.get("truth") if isinstance(studio_duration_workorders_target.get("truth"), dict) else {}
    duration_workorders_counts = studio_duration_workorders.get("counts") if isinstance(studio_duration_workorders.get("counts"), dict) else studio_duration_workorders_target.get("counts") if isinstance(studio_duration_workorders_target.get("counts"), dict) else {}
    duration_workorders_html = str(studio_duration_workorders.get("htmlPath") or studio_duration_workorders_target.get("htmlPath") or "")
    bad_duration_workorders_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "editRecipesCreated"]
        if duration_workorders_truth.get(key) is True
    ]
    check(checks, "studioDurationVersionWorkorders", "duration-version-workorders-ready", studio_duration_workorders.get("status") == "duration-version-workorders-ready", "Studio duration version work orders are ready", {"status": studio_duration_workorders.get("status")})
    check(checks, "studioDurationVersionWorkorders", "duration-version-workorders-cover-episodes", int(duration_workorders_counts.get("episodes") or 0) >= 6 and int(duration_workorders_counts.get("workOrders") or 0) >= 18 and path_exists(duration_workorders_html), "Studio duration work orders cover Episodes 1-6 with multiple version targets", {"counts": duration_workorders_counts, "htmlPath": duration_workorders_html})
    check(checks, "studioDurationVersionWorkorders", "duration-version-workorders-read-only", not bad_duration_workorders_truth and duration_workorders_truth.get("workOrdersOnly") is True, "Studio duration work orders stay review-only and do not claim recipes/renders", {"dangerousTrue": bad_duration_workorders_truth, "truth": duration_workorders_truth})

    studio_duration_recipes, studio_duration_recipes_target = loaded["studioDurationEditRecipeSkeletons"]
    duration_recipes_truth = studio_duration_recipes.get("truth") if isinstance(studio_duration_recipes.get("truth"), dict) else studio_duration_recipes_target.get("truth") if isinstance(studio_duration_recipes_target.get("truth"), dict) else {}
    duration_recipes_counts = studio_duration_recipes.get("counts") if isinstance(studio_duration_recipes.get("counts"), dict) else studio_duration_recipes_target.get("counts") if isinstance(studio_duration_recipes_target.get("counts"), dict) else {}
    duration_recipes_html = str(studio_duration_recipes.get("htmlPath") or studio_duration_recipes_target.get("htmlPath") or "")
    bad_duration_recipes_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten"]
        if duration_recipes_truth.get(key) is True
    ]
    check(checks, "studioDurationEditRecipeSkeletons", "duration-edit-recipe-skeletons-ready", studio_duration_recipes.get("status") == "duration-edit-recipe-skeletons-ready", "Studio duration edit-recipe skeletons are ready", {"status": studio_duration_recipes.get("status")})
    check(checks, "studioDurationEditRecipeSkeletons", "duration-edit-recipe-skeletons-cover-episodes", int(duration_recipes_counts.get("episodes") or 0) >= 6 and int(duration_recipes_counts.get("recipes") or 0) >= 18 and path_exists(duration_recipes_html), "Studio duration recipe skeletons cover Episodes 1-6 with multiple version targets", {"counts": duration_recipes_counts, "htmlPath": duration_recipes_html})
    check(checks, "studioDurationEditRecipeSkeletons", "duration-edit-recipe-skeletons-read-only", not bad_duration_recipes_truth and duration_recipes_truth.get("editRecipeSkeletonsCreated") is True and duration_recipes_truth.get("timelineDecisionsWritten") is False, "Studio duration recipe skeletons do not claim timeline writes/renders", {"dangerousTrue": bad_duration_recipes_truth, "truth": duration_recipes_truth})

    studio_transcript_sources, studio_transcript_sources_target = loaded["studioTranscriptSourceWorkorders"]
    transcript_truth = studio_transcript_sources.get("truth") if isinstance(studio_transcript_sources.get("truth"), dict) else studio_transcript_sources_target.get("truth") if isinstance(studio_transcript_sources_target.get("truth"), dict) else {}
    transcript_counts = studio_transcript_sources.get("counts") if isinstance(studio_transcript_sources.get("counts"), dict) else studio_transcript_sources_target.get("counts") if isinstance(studio_transcript_sources_target.get("counts"), dict) else {}
    transcript_html = str(studio_transcript_sources.get("htmlPath") or studio_transcript_sources_target.get("htmlPath") or "")
    bad_transcript_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten", "asrRun", "transcriptSidecarsWritten", "transcriptsImported"]
        if transcript_truth.get(key) is True
    ]
    check(checks, "studioTranscriptSourceWorkorders", "transcript-source-workorders-ready", studio_transcript_sources.get("status") == "transcript-source-workorders-ready", "Studio transcript source work orders are ready", {"status": studio_transcript_sources.get("status")})
    check(checks, "studioTranscriptSourceWorkorders", "transcript-source-workorders-cover-sources", int(transcript_counts.get("sources") or 0) > 0 and int(transcript_counts.get("episodes") or 0) >= 3 and int(transcript_counts.get("highPrioritySources") or 0) > 0 and path_exists(transcript_html), "Studio transcript work orders expose audio-bearing source candidates", {"counts": transcript_counts, "htmlPath": transcript_html})
    check(checks, "studioTranscriptSourceWorkorders", "transcript-source-workorders-inventory-only", not bad_transcript_truth and transcript_truth.get("inventoryOnly") is True and transcript_truth.get("asrRun") is False and transcript_truth.get("transcriptSidecarsWritten") is False and transcript_truth.get("transcriptsImported") is False, "Studio transcript work orders stay inventory-only before ASR/reconciliation", {"dangerousTrue": bad_transcript_truth, "truth": transcript_truth})

    transcript_execution, transcript_execution_target = loaded["studioTranscriptExecutionReadiness"]
    transcript_execution_truth = transcript_execution.get("truth") if isinstance(transcript_execution.get("truth"), dict) else transcript_execution_target.get("truth") if isinstance(transcript_execution_target.get("truth"), dict) else {}
    transcript_execution_counts = transcript_execution.get("counts") if isinstance(transcript_execution.get("counts"), dict) else transcript_execution_target.get("counts") if isinstance(transcript_execution_target.get("counts"), dict) else {}
    transcript_execution_html = str(transcript_execution.get("htmlPath") or transcript_execution_target.get("htmlPath") or "")
    bad_transcript_execution_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten", "asrRun", "rawProviderOutputsWritten", "normalizedTranscriptsWritten", "reconciledTranscriptSpinesWritten", "transcriptsImported"]
        if transcript_execution_truth.get(key) is True
    ]
    check(checks, "studioTranscriptExecutionReadiness", "transcript-execution-readiness-ready", transcript_execution.get("status") == "transcript-execution-readiness-ready", "Studio transcript execution readiness is ready", {"status": transcript_execution.get("status")})
    check(checks, "studioTranscriptExecutionReadiness", "transcript-execution-readiness-selected-sources", int(transcript_execution_counts.get("selectedSources") or 0) > 0 and int(transcript_execution_counts.get("asrCommandsReady") or 0) > 0 and path_exists(transcript_execution_html), "Studio transcript execution readiness exposes selected ASR commands and an openable board", {"counts": transcript_execution_counts, "htmlPath": transcript_execution_html})
    check(checks, "studioTranscriptExecutionReadiness", "transcript-execution-readiness-planning-only", not bad_transcript_execution_truth and transcript_execution_truth.get("executionPlanningOnly") is True, "Studio transcript execution readiness does not claim ASR or transcript writes", {"dangerousTrue": bad_transcript_execution_truth, "truth": transcript_execution_truth})

    transcript_pilot, transcript_pilot_target = loaded["studioTranscriptPilot"]
    transcript_pilot_truth = transcript_pilot.get("truth") if isinstance(transcript_pilot.get("truth"), dict) else transcript_pilot_target.get("truth") if isinstance(transcript_pilot_target.get("truth"), dict) else {}
    transcript_pilot_counts = transcript_pilot.get("counts") if isinstance(transcript_pilot.get("counts"), dict) else transcript_pilot_target.get("counts") if isinstance(transcript_pilot_target.get("counts"), dict) else {}
    transcript_pilot_html = str(transcript_pilot.get("htmlPath") or transcript_pilot_target.get("htmlPath") or "")
    transcript_pilot_raw = str(transcript_pilot.get("rawProviderOutputPath") or transcript_pilot_target.get("rawProviderOutputPath") or "")
    transcript_pilot_normalized = str(transcript_pilot.get("normalizedTranscriptJsonPath") or transcript_pilot_target.get("normalizedTranscriptJsonPath") or "")
    bad_transcript_pilot_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten", "reconciledTranscriptSpinesWritten", "transcriptsImported", "filesDeleted"]
        if transcript_pilot_truth.get(key) is True
    ]
    check(checks, "studioTranscriptPilot", "transcript-pilot-status", transcript_pilot.get("status") in {"transcript-pilot-ready", "transcript-pilot-executed", "transcript-pilot-needs-review", "transcript-pilot-blocked", "transcript-pilot-failed"}, "Studio transcript pilot has a recognized status", {"status": transcript_pilot.get("status")})
    check(checks, "studioTranscriptPilot", "transcript-pilot-board-openable", bool(transcript_pilot_html and path_exists(transcript_pilot_html)), "Studio transcript pilot exposes an openable local board", {"htmlPath": transcript_pilot_html})
    check(checks, "studioTranscriptPilot", "transcript-pilot-safe-truth", not bad_transcript_pilot_truth and transcript_pilot_truth.get("transcriptsImported") is False and transcript_pilot_truth.get("timelineDecisionsWritten") is False, "Studio transcript pilot does not claim import, timeline, publication, or source mutation", {"dangerousTrue": bad_transcript_pilot_truth, "truth": transcript_pilot_truth})
    if transcript_pilot_truth.get("asrRun") is True:
        check(checks, "studioTranscriptPilot", "transcript-pilot-output-files-exist", path_exists(transcript_pilot_raw) and path_exists(transcript_pilot_normalized) and int(transcript_pilot_counts.get("normalizedTranscriptsWritten") or 0) > 0, "Executed transcript pilot wrote raw and normalized draft outputs", {"rawProviderOutputPath": transcript_pilot_raw, "normalizedTranscriptJsonPath": transcript_pilot_normalized, "counts": transcript_pilot_counts})

    transcript_review, transcript_review_target = loaded["studioTranscriptReviewWorkbench"]
    transcript_review_truth = transcript_review.get("truth") if isinstance(transcript_review.get("truth"), dict) else transcript_review_target.get("truth") if isinstance(transcript_review_target.get("truth"), dict) else {}
    transcript_review_counts = transcript_review.get("counts") if isinstance(transcript_review.get("counts"), dict) else transcript_review_target.get("counts") if isinstance(transcript_review_target.get("counts"), dict) else {}
    transcript_review_html = str(transcript_review.get("htmlPath") or transcript_review_target.get("htmlPath") or "")
    bad_transcript_review_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten", "reconciledTranscriptSpinesWritten", "transcriptsImported", "transcriptsEdited", "filesDeleted"]
        if transcript_review_truth.get(key) is True
    ]
    check(checks, "studioTranscriptReviewWorkbench", "transcript-review-workbench-ready", transcript_review.get("status") in {"transcript-review-workbench-ready", "transcript-review-workbench-empty"}, "Studio transcript review workbench has a recognized status", {"status": transcript_review.get("status")})
    check(checks, "studioTranscriptReviewWorkbench", "transcript-review-workbench-openable", bool(transcript_review_html and path_exists(transcript_review_html)), "Studio transcript review workbench exposes an openable local board", {"htmlPath": transcript_review_html})
    check(checks, "studioTranscriptReviewWorkbench", "transcript-review-workbench-safe-truth", not bad_transcript_review_truth and transcript_review_truth.get("reviewWorkbenchOnly") is True, "Studio transcript review workbench stays review-only before import/reconciliation", {"dangerousTrue": bad_transcript_review_truth, "truth": transcript_review_truth})
    check(checks, "studioTranscriptReviewWorkbench", "transcript-review-workbench-sees-drafts", int(transcript_review_counts.get("normalizedTranscripts") or 0) >= int(transcript_pilot_counts.get("normalizedTranscriptsWritten") or 0), "Transcript review workbench sees normalized drafts created by pilot/execution", {"reviewCounts": transcript_review_counts, "pilotCounts": transcript_pilot_counts})

    transcript_decision, transcript_decision_target = loaded["studioTranscriptReviewDecisionLedger"]
    transcript_decision_truth = transcript_decision.get("truth") if isinstance(transcript_decision.get("truth"), dict) else transcript_decision_target.get("truth") if isinstance(transcript_decision_target.get("truth"), dict) else {}
    transcript_decision_counts = transcript_decision.get("counts") if isinstance(transcript_decision.get("counts"), dict) else transcript_decision_target.get("counts") if isinstance(transcript_decision_target.get("counts"), dict) else {}
    transcript_decision_html = str(transcript_decision.get("htmlPath") or transcript_decision_target.get("htmlPath") or "")
    bad_transcript_decision_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "exportsRendered", "timelineDecisionsWritten", "reconciledTranscriptSpinesWritten", "transcriptsImported", "transcriptsEdited", "filesDeleted"]
        if transcript_decision_truth.get(key) is True
    ]
    check(checks, "studioTranscriptReviewDecisionLedger", "transcript-review-decision-ledger-ready", transcript_decision.get("status") in {"transcript-review-decision-ledger-ready", "transcript-review-decision-ledger-empty"}, "Studio transcript review decision ledger has a recognized status", {"status": transcript_decision.get("status")})
    check(checks, "studioTranscriptReviewDecisionLedger", "transcript-review-decision-ledger-openable", bool(transcript_decision_html and path_exists(transcript_decision_html)), "Studio transcript review decision ledger exposes an openable local board", {"htmlPath": transcript_decision_html})
    check(checks, "studioTranscriptReviewDecisionLedger", "transcript-review-decision-ledger-safe-truth", not bad_transcript_decision_truth and transcript_decision_truth.get("reviewDecisionLedgerOnly") is True, "Studio transcript review decision ledger stays metadata-only before import/reconciliation", {"dangerousTrue": bad_transcript_decision_truth, "truth": transcript_decision_truth})
    check(checks, "studioTranscriptReviewDecisionLedger", "transcript-review-decision-ledger-covers-workbench", int(transcript_decision_counts.get("items") or 0) >= int(transcript_review_counts.get("normalizedTranscripts") or 0), "Transcript review decision ledger covers normalized transcript drafts from the workbench", {"decisionCounts": transcript_decision_counts, "reviewCounts": transcript_review_counts})

    daily_writing_readiness, daily_writing_readiness_target = loaded["dailyWritingReadiness"]
    daily_readiness_truth = daily_writing_readiness.get("truth") if isinstance(daily_writing_readiness.get("truth"), dict) else daily_writing_readiness_target.get("truth") if isinstance(daily_writing_readiness_target.get("truth"), dict) else {}
    daily_readiness_counts = daily_writing_readiness.get("counts") if isinstance(daily_writing_readiness.get("counts"), dict) else daily_writing_readiness_target.get("counts") if isinstance(daily_writing_readiness_target.get("counts"), dict) else {}
    daily_readiness_html = str(daily_writing_readiness.get("htmlPath") or daily_writing_readiness_target.get("htmlPath") or "")
    daily_recommendation = daily_writing_readiness.get("recommendation") if isinstance(daily_writing_readiness.get("recommendation"), dict) else daily_writing_readiness_target.get("recommendation") if isinstance(daily_writing_readiness_target.get("recommendation"), dict) else {}
    bad_daily_readiness_truth = [
        key for key in ["manuscriptMutated", "canonicalManuscriptReplaced", "sourceFilesMutated", "externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "versionsOverwritten", "filesDeleted"]
        if daily_readiness_truth.get(key) is True
    ]
    check(checks, "dailyWritingReadiness", "daily-writing-readiness-ready", daily_writing_readiness.get("status") == "daily-writing-readiness-ready", "Daily Writing Desk readiness board is ready", {"status": daily_writing_readiness.get("status")})
    check(checks, "dailyWritingReadiness", "daily-writing-readiness-requirements", int(daily_readiness_counts.get("requirements") or 0) >= 10 and int(daily_readiness_counts.get("webReadyOrPartial") or 0) > 0 and path_exists(daily_readiness_html), "Daily Writing Desk readiness exposes requirements and an openable board", {"counts": daily_readiness_counts, "htmlPath": daily_readiness_html})
    check(checks, "dailyWritingReadiness", "daily-writing-readiness-recommendation", "web/Nest" in str(daily_recommendation.get("decision") or ""), "Daily Writing Desk readiness carries the web-first/native-parallel recommendation", {"recommendation": daily_recommendation})
    check(checks, "dailyWritingReadiness", "daily-writing-readiness-read-only", not bad_daily_readiness_truth and daily_readiness_truth.get("readinessPlanningOnly") is True, "Daily Writing Desk readiness does not claim manuscript/source/publication mutation", {"dangerousTrue": bad_daily_readiness_truth, "truth": daily_readiness_truth})

    current_blockers = load_json(CURRENT_PRODUCTION_BLOCKERS_POINTER)
    blocker_counts = current_blockers.get("counts") if isinstance(current_blockers.get("counts"), dict) else {}
    blocker_first_warning_action = current_blockers.get("firstWarningAction") if isinstance(current_blockers.get("firstWarningAction"), dict) else {}
    blocker_review_cards = current_blockers.get("reviewCards") if isinstance(current_blockers.get("reviewCards"), list) else []
    blocker_warning_cards = [
        card for card in blocker_review_cards
        if isinstance(card, dict) and isinstance(card.get("durationWarningReview"), dict)
    ]
    blocker_warning_episodes = sorted(int(card.get("episode") or 0) for card in blocker_warning_cards)
    blocker_aligned_with_warning = [
        card.get("episode") for card in blocker_warning_cards
        if str(card.get("durationSeverity") or "").lower() == "aligned"
    ]
    check(checks, "currentProductionBlockers", "current-blockers-pointer-exists", CURRENT_PRODUCTION_BLOCKERS_POINTER.exists(), "Current production blocker pointer exists in QuipslyOS", {"path": str(CURRENT_PRODUCTION_BLOCKERS_POINTER)})
    check(checks, "currentProductionBlockers", "current-blockers-warning-counts", int(blocker_counts.get("warningEpisodes") or 0) >= 2 and int(blocker_counts.get("durationWarningPacketEpisodes") or 0) >= 2, "Current production blockers carry duration warning packet counts", {"counts": blocker_counts})
    check(checks, "currentProductionBlockers", "current-blockers-first-warning-action", path_exists(blocker_first_warning_action.get("path")) and bool(blocker_first_warning_action.get("command") and blocker_first_warning_action.get("safety")), "Current production blockers expose a first warning action", {"firstWarningAction": blocker_first_warning_action})
    check(checks, "currentProductionBlockers", "current-blockers-only-warning-cards-enriched", blocker_warning_episodes == [1, 4] and not blocker_aligned_with_warning, "Only true duration-warning episodes are enriched with warning review actions", {"warningEpisodes": blocker_warning_episodes, "alignedWithWarning": blocker_aligned_with_warning})

    nest, nest_target = loaded["nest"]
    nest_counts = nest.get("counts") if isinstance(nest.get("counts"), dict) else {}
    check(checks, "nest", "writing-human-ask", bool(nest.get("humanAsk") or nest.get("humanQuestion")), "Nest pointer carries a human writing question", {"humanAsk": nest.get("humanAsk")})
    check(checks, "nest", "writing-counts", all(key in nest_counts for key in ["currentDrafts", "pendingHumanReview", "platformPackets", "receiptSlots", "sourceWords"]), "Nest pointer carries writing runway counts", {"counts": nest_counts})
    check(checks, "nest", "draft-source-fields", "draftPathExists" in nest and "sourcePathExists" in nest, "Nest pointer carries draft/source existence fields", {"draftPathExists": nest.get("draftPathExists"), "sourcePathExists": nest.get("sourcePathExists")})

    nest_author_desk, nest_author_desk_target = loaded["nestAuthorDesk"]
    nest_author_counts = nest_author_desk.get("counts") if isinstance(nest_author_desk.get("counts"), dict) else {}
    nest_author_truth = nest_author_desk.get("truth") if isinstance(nest_author_desk.get("truth"), dict) else nest_author_desk_target.get("truth") if isinstance(nest_author_desk_target.get("truth"), dict) else {}
    check(checks, "nestAuthorDesk", "author-desk-ready", nest_author_desk.get("status") == "author-desk-ready", "Nest author desk is ready", {"status": nest_author_desk.get("status")})
    check(checks, "nestAuthorDesk", "author-desk-tasks", int(nest_author_counts.get("deskTasks") or 0) > 0 and int(nest_author_counts.get("sourceFilesLinked") or 0) > 0, "Nest author desk has daily tasks linked to sources", {"counts": nest_author_counts})
    bad_author_truth = [
        key for key in ["canonicalManuscriptReplaced", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "accountMutation"]
        if nest_author_truth.get(key) is True or nest_author_desk.get(key) is True
    ]
    check(checks, "nestAuthorDesk", "author-desk-is-read-only", not bad_author_truth, "Nest author desk truth stays read-only", {"dangerousTrue": bad_author_truth, "truth": nest_author_truth})

    nest_review_desk, nest_review_desk_target = loaded["nestReviewDesk"]
    nest_review_counts = nest_review_desk.get("counts") if isinstance(nest_review_desk.get("counts"), dict) else {}
    nest_review_truth = nest_review_desk.get("truth") if isinstance(nest_review_desk.get("truth"), dict) else nest_review_desk_target.get("truth") if isinstance(nest_review_desk_target.get("truth"), dict) else {}
    check(checks, "nestReviewDesk", "review-desk-ready", nest_review_desk.get("status") == "writing-review-desk-ready", "Nest writing review desk is ready", {"status": nest_review_desk.get("status")})
    check(checks, "nestReviewDesk", "review-desk-rows", int(nest_review_counts.get("reviewRows") or 0) > 0 and int(nest_review_counts.get("reviewNoteTemplates") or 0) > 0, "Nest writing review desk has draft review rows and note templates", {"counts": nest_review_counts})
    check(checks, "nestReviewDesk", "review-desk-platforms", int(nest_review_counts.get("platformPackets") or 0) > 0 and int(nest_review_counts.get("pendingHumanReview") or nest_review_counts.get("needsHumanReview") or 0) > 0, "Nest writing review desk exposes platform packets and human-review need", {"counts": nest_review_counts})
    bad_review_truth = [
        key for key in ["canonicalManuscriptReplaced", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "accountMutation"]
        if nest_review_truth.get(key) is True or nest_review_desk.get(key) is True
    ]
    check(checks, "nestReviewDesk", "review-desk-is-read-only", not bad_review_truth, "Nest writing review desk truth stays read-only", {"dangerousTrue": bad_review_truth, "truth": nest_review_truth})

    nest_daily_packet, nest_daily_packet_target = loaded["nestDailyPacket"]
    nest_daily_counts = nest_daily_packet.get("counts") if isinstance(nest_daily_packet.get("counts"), dict) else {}
    nest_daily_truth = nest_daily_packet.get("truth") if isinstance(nest_daily_packet.get("truth"), dict) else nest_daily_packet_target.get("truth") if isinstance(nest_daily_packet_target.get("truth"), dict) else {}
    check(checks, "nestDailyPacket", "daily-packet-ready", nest_daily_packet.get("status") == "daily-writing-packet-ready", "Nest daily writing packet is ready", {"status": nest_daily_packet.get("status")})
    check(checks, "nestDailyPacket", "daily-packet-selected-tasks", int(nest_daily_counts.get("selectedTasks") or 0) > 0 and int(nest_daily_counts.get("availableSessions") or 0) > 0, "Nest daily writing packet exposes source-backed writing tasks", {"counts": nest_daily_counts})
    check(checks, "nestDailyPacket", "daily-packet-next-writing-card", nest_daily_counts.get("nextWritingCardReady") is True and nest_daily_counts.get("nextWritingCardPathExists") is True, "Nest daily writing packet exposes the current next writing card", {"counts": nest_daily_counts, "nextWritingCardPath": nest_daily_packet.get("nextWritingCardPath")})
    next_writing_card = nest_daily_packet.get("nextWritingCard") if isinstance(nest_daily_packet.get("nextWritingCard"), dict) else {}
    check(checks, "nestDailyPacket", "daily-packet-next-writing-draft-command", bool(next_writing_card.get("safeDraftPacketCommand")), "Nest daily writing packet carries a safe draft-preview command for the next writing card", {"safeDraftPacketCommand": next_writing_card.get("safeDraftPacketCommand"), "taskId": next_writing_card.get("taskId")})
    check(checks, "nestDailyPacket", "daily-packet-serious-draft-safe", nest_daily_counts.get("canonicalManuscriptReplaced") is False and nest_daily_counts.get("sourceFilesMutated") is False and nest_daily_counts.get("externalPublishing") is False, "Nest daily writing packet allows draft work without canon/source/publication mutation", {"counts": nest_daily_counts})
    bad_daily_truth = [
        key for key in ["canonicalManuscriptReplaced", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "accountMutation"]
        if nest_daily_truth.get(key) is True or nest_daily_packet.get(key) is True or nest_daily_counts.get(key) is True
    ]
    check(checks, "nestDailyPacket", "daily-packet-is-read-only", not bad_daily_truth, "Nest daily writing packet truth stays read-only", {"dangerousTrue": bad_daily_truth, "truth": nest_daily_truth, "counts": nest_daily_counts})

    nest_writing_runway, nest_writing_runway_target = loaded["nestWritingRunway"]
    nest_writing_runway_counts = nest_writing_runway.get("counts") if isinstance(nest_writing_runway.get("counts"), dict) else {}
    check(checks, "nestWritingRunway", "writing-runway-ready", nest_writing_runway.get("status") in {"needs-human-review", "needs-receipts", "runway-ready"}, "Writing publication runway is generated", {"status": nest_writing_runway.get("status")})
    check(checks, "nestWritingRunway", "writing-runway-drafts-visible", int(nest_writing_runway_counts.get("currentDrafts") or 0) > 0 and int(nest_writing_runway_counts.get("draftPackets") or 0) > 0, "Writing publication runway exposes current drafts and draft packets", {"counts": nest_writing_runway_counts})
    check(checks, "nestWritingRunway", "writing-runway-platforms-visible", int(nest_writing_runway_counts.get("platformDraftItems") or 0) > 0 and int(nest_writing_runway_counts.get("receiptSlots") or 0) > 0, "Writing publication runway exposes platform drafts and receipt slots", {"counts": nest_writing_runway_counts})
    check(checks, "nestWritingRunway", "writing-runway-no-fake-publication", int(nest_writing_runway_counts.get("capturedReceipts") or 0) == 0 and nest_writing_runway.get("externalPublishing") is not True and nest_writing_runway.get("sourceFilesMutated") is not True, "Writing publication runway does not claim receipts, publication, or source mutation", {"counts": nest_writing_runway_counts, "externalPublishing": nest_writing_runway.get("externalPublishing"), "sourceFilesMutated": nest_writing_runway.get("sourceFilesMutated")})

    nest_revision_batch, nest_revision_batch_target = loaded["nestRevisionBatch"]
    nest_revision_counts = nest_revision_batch.get("counts") if isinstance(nest_revision_batch.get("counts"), dict) else {}
    nest_revision_truth = nest_revision_batch.get("truth") if isinstance(nest_revision_batch.get("truth"), dict) else nest_revision_batch_target.get("truth") if isinstance(nest_revision_batch_target.get("truth"), dict) else {}
    check(checks, "nestRevisionBatch", "revision-batch-ready", nest_revision_batch.get("status") == "nest-writing-next-revision-batch-ready", "Nest writing revision batch is ready", {"status": nest_revision_batch.get("status")})
    check(checks, "nestRevisionBatch", "revision-batch-useful-rows", int(nest_revision_counts.get("batchRows") or 0) > 0 and int(nest_revision_counts.get("openableRows") or 0) > 0, "Nest revision batch exposes openable writing rows", {"counts": nest_revision_counts})
    check(checks, "nestRevisionBatch", "revision-batch-source-or-revision-queue", int(nest_revision_counts.get("sourceCheckRows") or 0) > 0 or int(nest_revision_counts.get("revisionRows") or 0) > 0 or int(nest_revision_counts.get("reviewRows") or 0) > 0, "Nest revision batch has source-check, revision, or review work", {"counts": nest_revision_counts})
    bad_revision_truth = [
        key for key in ["canonicalManuscriptReplaced", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "accountMutation", "approvalCreated"]
        if nest_revision_truth.get(key) is True or nest_revision_batch.get(key) is True or nest_revision_counts.get(key) is True
    ]
    check(checks, "nestRevisionBatch", "revision-batch-is-read-only", not bad_revision_truth, "Nest revision batch truth stays read-only", {"dangerousTrue": bad_revision_truth, "truth": nest_revision_truth, "counts": nest_revision_counts})

    photo, photo_target = loaded["photo"]
    photo_counts = photo.get("counts") if isinstance(photo.get("counts"), dict) else {}
    photo_first_dry_run_action = photo.get("firstDryRunAction") if isinstance(photo.get("firstDryRunAction"), dict) else {}
    photo_first_dry_run_command = str(photo.get("firstDryRunCommand") or photo_first_dry_run_action.get("command") or "")
    check(checks, "photo", "photo-human-ask", bool(photo.get("humanAsk")), "Photo next-cull pointer carries a human cull question", {"humanAsk": photo.get("humanAsk")})
    check(checks, "photo", "photo-counts", all(key in photo_counts for key in ["commands", "qualityFlags", "sourceExists", "thumbnailExists"]), "Photo next-cull pointer carries evidence counts", {"counts": photo_counts})
    check(checks, "photo", "photo-first-dry-run-command", bool(photo_first_dry_run_command), "Photo next-cull pointer carries the exact first safe dry-run command", {"firstDryRunCommand": photo_first_dry_run_command, "firstDryRunDecision": photo.get("firstDryRunDecision")})
    check(checks, "photo", "photo-safe-action", bool((photo.get("firstSafeAction") or {}).get("path")), "Photo pointer carries first safe action", {"firstSafeAction": photo.get("firstSafeAction")})

    photo_workbench, photo_workbench_target = loaded["photoWorkbench"]
    photo_workbench_counts = photo_workbench.get("counts") if isinstance(photo_workbench.get("counts"), dict) else {}
    photo_workbench_truth = photo_workbench.get("truth") if isinstance(photo_workbench.get("truth"), dict) else photo_workbench_target.get("truth") if isinstance(photo_workbench_target.get("truth"), dict) else {}
    check(checks, "photoWorkbench", "workbench-ready", photo_workbench.get("status") == "photo-grove-operator-workbench-ready", "Photo Grove operator workbench is ready", {"status": photo_workbench.get("status")})
    check(checks, "photoWorkbench", "workbench-rows", int(photo_workbench_counts.get("workbenchRows") or 0) > 0 and int(photo_workbench_counts.get("sourcePhotos") or 0) > 0, "Photo Grove operator workbench has rows and source photo counts", {"counts": photo_workbench_counts})
    check(checks, "photoWorkbench", "workbench-front-doors", int(photo_workbench_counts.get("frontDoors") or 0) >= 4, "Photo Grove operator workbench exposes multiple front doors", {"counts": photo_workbench_counts})
    bad_photo_truth = [
        key for key in ["originalsMutated", "metadataChanged", "sidecarDecisionsWritten", "clientDeliveryCreated", "proofSelectionChanged", "filesCopied", "filesDeleted", "externalUpload", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "versionsOverwritten"]
        if photo_workbench_truth.get(key) is True
    ]
    check(checks, "photoWorkbench", "workbench-is-read-only", not bad_photo_truth, "Photo Grove operator workbench truth stays read-only", {"dangerousTrue": bad_photo_truth, "truth": photo_workbench_truth})

    photo_cull_theater, photo_cull_theater_target = loaded["photoCullTheater"]
    photo_cull_theater_counts = photo_cull_theater.get("counts") if isinstance(photo_cull_theater.get("counts"), dict) else {}
    photo_cull_theater_truth = photo_cull_theater.get("truth") if isinstance(photo_cull_theater.get("truth"), dict) else photo_cull_theater_target.get("truth") if isinstance(photo_cull_theater_target.get("truth"), dict) else {}
    check(checks, "photoCullTheater", "theater-ready", photo_cull_theater.get("status") == "photo-grove-cull-theater-ready", "Photo Grove cull theater is ready", {"status": photo_cull_theater.get("status")})
    check(checks, "photoCullTheater", "theater-rows", int(photo_cull_theater_counts.get("theaterRows") or 0) >= 12 and int(photo_cull_theater_counts.get("sourcePhotos") or 0) > 0, "Photo Grove cull theater has broad review rows and source photo counts", {"counts": photo_cull_theater_counts})
    check(checks, "photoCullTheater", "theater-evidence", int(photo_cull_theater_counts.get("thumbnailRows") or 0) > 0 and int(photo_cull_theater_counts.get("sourceExistsRows") or 0) > 0 and int(photo_cull_theater_counts.get("dryRunCommands") or 0) > 0, "Photo Grove cull theater exposes thumbnails, source evidence, and dry-run actions", {"counts": photo_cull_theater_counts})
    bad_photo_theater_truth = [
        key for key in ["originalsMutated", "metadataChanged", "sidecarDecisionsWritten", "clientDeliveryCreated", "proofSelectionChanged", "filesCopied", "filesDeleted", "externalUpload", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "versionsOverwritten"]
        if photo_cull_theater_truth.get(key) is True
    ]
    check(checks, "photoCullTheater", "theater-is-read-only", not bad_photo_theater_truth, "Photo Grove cull theater truth stays read-only", {"dangerousTrue": bad_photo_theater_truth, "truth": photo_cull_theater_truth})

    photo_proof_desk, photo_proof_desk_target = loaded["photoProofDesk"]
    photo_proof_desk_counts = photo_proof_desk.get("counts") if isinstance(photo_proof_desk.get("counts"), dict) else {}
    photo_proof_desk_truth = photo_proof_desk.get("truth") if isinstance(photo_proof_desk.get("truth"), dict) else photo_proof_desk_target.get("truth") if isinstance(photo_proof_desk_target.get("truth"), dict) else {}
    check(checks, "photoProofDesk", "proof-desk-ready", photo_proof_desk.get("status") == "proof-desk-ready", "Photo Grove proof desk is ready", {"status": photo_proof_desk.get("status")})
    check(checks, "photoProofDesk", "proof-desk-candidates", int(photo_proof_desk_counts.get("sourcePhotos") or 0) > 0 and int(photo_proof_desk_counts.get("candidateStarterSet") or 0) > 0, "Photo Grove proof desk exposes source photos and a candidate starter set", {"counts": photo_proof_desk_counts})
    check(checks, "photoProofDesk", "proof-desk-next-cull-card", photo_proof_desk_counts.get("nextCullCardReady") is True and int(photo_proof_desk_counts.get("nextCullCommandRows") or 0) > 0, "Photo Grove proof desk exposes one next cull card and dry-run command rows", {"counts": photo_proof_desk_counts})
    photo_proof_rows = photo_proof_desk.get("rows") if isinstance(photo_proof_desk.get("rows"), list) else []
    photo_proof_next_cull = next((row for row in photo_proof_rows if isinstance(row, dict) and row.get("id") == "next-cull-card"), {})
    check(checks, "photoProofDesk", "proof-desk-next-cull-dry-run-command", bool(photo_proof_next_cull.get("firstDryRunCommand")), "Photo Grove proof desk next-cull row carries the exact safe dry-run command", {"firstDryRunCommand": photo_proof_next_cull.get("firstDryRunCommand"), "firstDryRunDecision": photo_proof_next_cull.get("firstDryRunDecision")})
    check(checks, "photoProofDesk", "proof-desk-decision-commands", int(photo_proof_desk_counts.get("metadataCommandRows") or 0) > 0 and int(photo_proof_desk_counts.get("cullSuggestionGroups") or 0) > 0, "Photo Grove proof desk exposes metadata-only decision commands and cull groups", {"counts": photo_proof_desk_counts})
    check(checks, "photoProofDesk", "proof-desk-not-delivery-yet", int(photo_proof_desk_counts.get("selectedForClientProof") or 0) == 0 and int(photo_proof_desk_counts.get("clientProofItems") or 0) == 0, "Photo Grove proof desk does not claim a client proof set before human cull decisions", {"counts": photo_proof_desk_counts})
    bad_photo_proof_truth = [
        key for key in ["originalsMutated", "metadataChanged", "sidecarDecisionsWritten", "clientDeliveryCreated", "proofSelectionChanged", "filesCopied", "filesDeleted", "externalUpload", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated", "versionsOverwritten"]
        if photo_proof_desk_truth.get(key) is True or photo_proof_desk_counts.get(key) is True or photo_proof_desk.get(key) is True
    ]
    check(checks, "photoProofDesk", "proof-desk-is-read-only", not bad_photo_proof_truth, "Photo Grove proof desk truth stays read-only", {"dangerousTrue": bad_photo_proof_truth, "truth": photo_proof_desk_truth, "counts": photo_proof_desk_counts})

    photo_batch, photo_batch_target = loaded["photoNextCullBatch"]
    photo_batch_counts = photo_batch.get("counts") if isinstance(photo_batch.get("counts"), dict) else {}
    photo_batch_action = photo_batch.get("firstSafeAction") if isinstance(photo_batch.get("firstSafeAction"), dict) else {}
    photo_batch_truth = photo_batch.get("truth") if isinstance(photo_batch.get("truth"), dict) else photo_batch_target.get("truth") if isinstance(photo_batch_target.get("truth"), dict) else {}
    check(checks, "photoNextCullBatch", "batch-ready", photo_batch.get("status") == "photo-grove-next-cull-batch-ready", "Photo Grove next cull batch is ready", {"status": photo_batch.get("status")})
    check(checks, "photoNextCullBatch", "batch-row-count", int(photo_batch_counts.get("batchRows") or 0) >= 6 and int(photo_batch_counts.get("dryRunCommandRows") or 0) >= 1, "Photo Grove next cull batch exposes a useful batch and dry-run command rows", {"counts": photo_batch_counts})
    check(checks, "photoNextCullBatch", "batch-first-safe-action", path_exists(photo_batch_action.get("path")) and bool(photo_batch_action.get("command") and photo_batch_action.get("safety")), "Photo Grove next cull batch exposes a safe open action", {"firstSafeAction": photo_batch_action})
    check(checks, "photoNextCullBatch", "batch-first-dry-run-command", bool(photo_batch.get("firstDryRunCommand")), "Photo Grove next cull batch exposes a first dry-run command for agents", {"firstDryRunCommand": photo_batch.get("firstDryRunCommand")})
    bad_photo_batch_truth = [
        key for key in ["originalsMutated", "metadataChanged", "sidecarDecisionsWritten", "filesCopied", "filesDeleted", "externalUpload", "externalPublishing", "receiptTruthCreated", "versionsOverwritten"]
        if photo_batch_truth.get(key) is True or photo_batch.get(key) is True
    ]
    check(checks, "photoNextCullBatch", "batch-is-read-only", not bad_photo_batch_truth, "Photo Grove next cull batch truth stays read-only", {"dangerousTrue": bad_photo_batch_truth, "truth": photo_batch_truth})

    studio360, studio360_target = loaded["studio360"]
    studio360_counts = studio360.get("counts") if isinstance(studio360.get("counts"), dict) else {}
    source_paths = studio360_target.get("sourcePaths") if isinstance(studio360_target.get("sourcePaths"), list) else []
    check(checks, "studio360", "360-human-ask", bool(studio360.get("humanAsk") or studio360.get("humanQuestion")), "360 next-source pointer carries a human inspection question", {"humanAsk": studio360.get("humanAsk")})
    check(checks, "studio360", "360-source-counts", int(studio360_counts.get("assetCount") or 0) > 0 and int(studio360_counts.get("sourcePaths") or 0) > 0, "360 next-source pointer carries source/asset counts", {"counts": studio360_counts})
    check(checks, "studio360", "360-source-paths", len(source_paths) > 0 and path_exists(source_paths[0]), "360 next-source target carries existing source paths", {"firstSourcePath": source_paths[0] if source_paths else "", "sourcePathCount": len(source_paths)})
    studio360_proof_action = (
        studio360.get("firstLocalProofCommand")
        or studio360_target.get("firstLocalProofCommand")
        or studio360.get("firstLocalProofReviewCommand")
        or studio360_target.get("firstLocalProofReviewCommand")
    )
    check(checks, "studio360", "360-local-proof-action-visible", bool(studio360_proof_action), "360 next-source pointer carries a local proof action: render if missing, review if already created", {"firstLocalProofCommand": studio360.get("firstLocalProofCommand") or studio360_target.get("firstLocalProofCommand"), "firstLocalProofReviewCommand": studio360.get("firstLocalProofReviewCommand") or studio360_target.get("firstLocalProofReviewCommand"), "firstLocalProofAspect": studio360.get("firstLocalProofAspect") or studio360_target.get("firstLocalProofAspect"), "firstLocalProofOutputExists": studio360.get("firstLocalProofOutputExists") or studio360_target.get("firstLocalProofOutputExists")})

    studio360_workbench, studio360_workbench_target = loaded["studio360Workbench"]
    studio360_workbench_counts = studio360_workbench.get("counts") if isinstance(studio360_workbench.get("counts"), dict) else {}
    studio360_workbench_truth = studio360_workbench.get("truth") if isinstance(studio360_workbench.get("truth"), dict) else studio360_workbench_target.get("truth") if isinstance(studio360_workbench_target.get("truth"), dict) else {}
    check(checks, "studio360Workbench", "workbench-ready-or-repair-first", studio360_workbench.get("status") in {"studio360-operator-workbench-ready", "studio360-operator-workbench-repair-first"}, "Studio360 operator workbench is ready enough to guide the next safe 360 action", {"status": studio360_workbench.get("status")})
    check(checks, "studio360Workbench", "workbench-source-and-recipe-counts", int(studio360_workbench_counts.get("sourceRows") or 0) > 0 and int(studio360_workbench_counts.get("readyRecipes") or 0) > 0, "Studio360 operator workbench carries source rows and ready recipe counts", {"counts": studio360_workbench_counts})
    check(checks, "studio360Workbench", "workbench-front-doors", int(studio360_workbench_counts.get("frontDoors") or 0) >= 4, "Studio360 operator workbench exposes multiple 360 front doors", {"counts": studio360_workbench_counts})
    check(checks, "studio360Workbench", "workbench-proof-or-candidates", int(studio360_workbench_counts.get("proofOutputsPresent") or 0) > 0 or int(studio360_workbench_counts.get("candidateRows") or 0) > 0, "Studio360 operator workbench exposes proof output or export candidate evidence", {"counts": studio360_workbench_counts})
    bad_studio360_truth = [
        key for key in ["proxiesCreated", "repairsExecuted", "rendererCommandsExecuted", "exportsCreated", "fullRenderCreated", "sourceFilesMutated", "metadataWritten", "versionsOverwritten", "filesDeleted", "externalUpload", "externalPublishing", "externalSchedulesCreated", "receiptTruthCreated"]
        if studio360_workbench_truth.get(key) is True or studio360_workbench_counts.get(key) is True
    ]
    check(checks, "studio360Workbench", "workbench-is-read-only", not bad_studio360_truth, "Studio360 operator workbench truth stays read-only", {"dangerousTrue": bad_studio360_truth, "truth": studio360_workbench_truth})

    studio360_repair_preflight, studio360_repair_preflight_target = loaded["studio360RepairPreflight"]
    studio360_repair_counts = studio360_repair_preflight.get("counts") if isinstance(studio360_repair_preflight.get("counts"), dict) else {}
    studio360_repair_boundary = studio360_repair_preflight.get("laneBoundary") if isinstance(studio360_repair_preflight.get("laneBoundary"), dict) else studio360_repair_preflight_target.get("laneBoundary") if isinstance(studio360_repair_preflight_target.get("laneBoundary"), dict) else {}
    check(checks, "studio360RepairPreflight", "repair-preflight-ready", studio360_repair_preflight.get("status") == "repair-preflight-ready", "Studio360 repair preflight is ready", {"status": studio360_repair_preflight.get("status")})
    check(checks, "studio360RepairPreflight", "repair-tickets-visible", int(studio360_repair_counts.get("tickets") or 0) > 0 and int(studio360_repair_counts.get("humanDecisionRequired") or 0) > 0, "Studio360 repair preflight exposes repair tickets and human decision need", {"counts": studio360_repair_counts})
    check(checks, "studio360RepairPreflight", "ready-work-can-continue", int(studio360_repair_boundary.get("readyGroupsCanContinue") or 0) > 0 or int(studio360_repair_boundary.get("readyRenderRecipesCanContinue") or 0) > 0, "Studio360 repair preflight keeps ready 360 work moving in parallel", {"laneBoundary": studio360_repair_boundary})
    bad_studio360_repair_truth = [
        key for key in ["originalsMutated", "decisionsWritten", "exportsCreated", "externalPublishing", "externalUpload", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted", "repairsExecuted", "rendererCommandsExecuted"]
        if studio360_repair_counts.get(key) is True or studio360_repair_preflight.get(key) is True
    ]
    check(checks, "studio360RepairPreflight", "repair-preflight-is-read-only", not bad_studio360_repair_truth, "Studio360 repair preflight does not claim repair, render, export, publication, or source mutation", {"dangerousTrue": bad_studio360_repair_truth, "counts": studio360_repair_counts})

    studio360_source_desk, studio360_source_desk_target = loaded["studio360SourceDesk"]
    studio360_source_counts = studio360_source_desk.get("counts") if isinstance(studio360_source_desk.get("counts"), dict) else {}
    studio360_source_truth = studio360_source_desk.get("truth") if isinstance(studio360_source_desk.get("truth"), dict) else studio360_source_desk_target.get("truth") if isinstance(studio360_source_desk_target.get("truth"), dict) else {}
    check(checks, "studio360SourceDesk", "source-desk-ready", studio360_source_desk.get("status") == "source-desk-ready", "Studio360 source desk is ready", {"status": studio360_source_desk.get("status")})
    check(checks, "studio360SourceDesk", "source-desk-source-shape", int(studio360_source_counts.get("groups") or 0) > 0 and int(studio360_source_counts.get("assets") or 0) > 0, "Studio360 source desk exposes source groups and assets", {"counts": studio360_source_counts})
    check(checks, "studio360SourceDesk", "source-desk-next-source-card", studio360_source_counts.get("nextSourceCardReady") is True and int(studio360_source_counts.get("nextSourcePaths") or 0) > 0, "Studio360 source desk exposes one next source inspection card", {"counts": studio360_source_counts})
    check(checks, "studio360SourceDesk", "source-desk-next-source-local-proof-action", studio360_source_counts.get("nextSourceLocalProofCommandReady") is True or studio360_source_counts.get("nextSourceLocalProofReviewReady") is True, "Studio360 source desk carries the next source local proof action while keeping it local", {"counts": studio360_source_counts})
    check(checks, "studio360SourceDesk", "source-desk-ready-work-visible", int(studio360_source_counts.get("rendererDryRunReadyRows") or 0) > 0 and int(studio360_source_counts.get("reframeReady") or 0) > 0 and int(studio360_source_counts.get("proofOutputsPresent") or 0) > 0, "Studio360 source desk keeps ready proof/reframe/export-prep work visible", {"counts": studio360_source_counts})
    check(checks, "studio360SourceDesk", "source-desk-repair-visible", int(studio360_source_counts.get("repairTickets") or 0) > 0 and int(studio360_source_counts.get("blockedMediaRepair") or 0) > 0, "Studio360 source desk keeps repair blockers visible without freezing the lane", {"counts": studio360_source_counts})
    bad_studio360_source_truth = [
        key for key in ["originalsMutated", "decisionsWritten", "exportsCreated", "externalPublishing", "externalUpload", "externalSchedulesCreated", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted", "repairsExecuted", "rendererCommandsExecuted", "fullRenderCreated"]
        if studio360_source_truth.get(key) is True or studio360_source_counts.get(key) is True or studio360_source_desk.get(key) is True
    ]
    check(checks, "studio360SourceDesk", "source-desk-is-read-only", not bad_studio360_source_truth, "Studio360 source desk does not claim repair, render, export, publication, or source mutation", {"dangerousTrue": bad_studio360_source_truth, "truth": studio360_source_truth, "counts": studio360_source_counts})

    tower, tower_target = loaded["tower"]
    tower_counts = tower.get("counts") if isinstance(tower.get("counts"), dict) else {}
    check(checks, "tower", "tower-platform-target", bool(tower.get("platform") and tower.get("episode")), "Tower pointer carries platform and episode target", {"platform": tower.get("platform"), "episode": tower.get("episode")})
    check(checks, "tower", "tower-no-fake-publication", tower.get("publicationState") == "not-published" and tower.get("approvalState") == "not-approved-for-external-action", "Tower pointer explicitly separates local prep from approval/publication", {"publicationState": tower.get("publicationState"), "approvalState": tower.get("approvalState")})
    check(checks, "tower", "tower-receipt-empty", str(tower.get("receiptSlot") or "").startswith("empty-") and int(tower_counts.get("capturedReceipts") or 0) == 0, "Tower pointer keeps receipt truth empty until real external proof exists", {"receiptSlot": tower.get("receiptSlot"), "counts": tower_counts})
    check(checks, "tower", "tower-first-dry-run-command", bool(tower.get("firstDryRunCommand")), "Tower next-publishing pointer carries a concrete local review dry-run command", {"firstDryRunCommand": tower.get("firstDryRunCommand"), "firstDryRunDecision": tower.get("firstDryRunDecision")})

    tower_batch, tower_batch_target = loaded["towerNextPublishingBatch"]
    tower_batch_counts = tower_batch.get("counts") if isinstance(tower_batch.get("counts"), dict) else {}
    tower_batch_truth = tower_batch.get("truth") if isinstance(tower_batch.get("truth"), dict) else tower_batch_target.get("truth") if isinstance(tower_batch_target.get("truth"), dict) else {}
    check(checks, "towerNextPublishingBatch", "batch-ready", tower_batch.get("status") == "tower-next-publishing-batch-ready", "Tower next publishing batch is ready", {"status": tower_batch.get("status")})
    check(checks, "towerNextPublishingBatch", "batch-useful-rows", int(tower_batch_counts.get("batchRows") or 0) >= 4 and int(tower_batch_counts.get("manualRows") or 0) > 0 and int(tower_batch_counts.get("shortRows") or 0) > 0, "Tower next publishing batch includes manual packet rows and short review rows", {"counts": tower_batch_counts})
    check(checks, "towerNextPublishingBatch", "batch-review-actions-visible", int(tower_batch_counts.get("dryRunRows") or 0) > 0 and int(tower_batch_counts.get("localShortReviewRows") or 0) > 0 and bool(tower_batch.get("firstDryRunCommand")), "Tower next publishing batch exposes dry-run review and local shorts review actions", {"counts": tower_batch_counts, "firstDryRunCommand": tower_batch.get("firstDryRunCommand")})
    check(checks, "towerNextPublishingBatch", "batch-receipt-boundary", int(tower_batch_counts.get("capturedReceipts") or 0) == 0 and int(tower_batch_counts.get("receiptSlots") or 0) >= int(tower_batch_counts.get("batchRows") or 0), "Tower next publishing batch keeps receipt slots empty until real platform proof exists", {"counts": tower_batch_counts})
    bad_tower_batch_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if tower_batch_truth.get(key) is True or tower_batch_counts.get(key) is True
    ]
    check(checks, "towerNextPublishingBatch", "batch-is-read-only", not bad_tower_batch_truth, "Tower next publishing batch truth stays read-only", {"dangerousTrue": bad_tower_batch_truth, "truth": tower_batch_truth, "counts": tower_batch_counts})

    tower_social, tower_social_target = loaded["towerSocialCommand"]
    tower_social_counts = tower_social.get("counts") if isinstance(tower_social.get("counts"), dict) else {}
    tower_social_truth = tower_social.get("truth") if isinstance(tower_social.get("truth"), dict) else tower_social_target.get("truth") if isinstance(tower_social_target.get("truth"), dict) else {}
    check(checks, "towerSocialCommand", "social-command-ready", tower_social.get("status") == "social-command-center-ready", "Tower social command center is ready", {"status": tower_social.get("status")})
    check(checks, "towerSocialCommand", "social-command-hootsuite-shape", int(tower_social_counts.get("items") or 0) >= 48 and int(tower_social_counts.get("platforms") or 0) >= 8 and int(tower_social_counts.get("draftOnlySchedules") or 0) >= 48, "Tower social command center exposes platform rows and draft schedule intent", {"counts": tower_social_counts})
    check(checks, "towerSocialCommand", "social-command-shorts-and-actions", int(tower_social_counts.get("shortsReadyForReview") or 0) > 0 and int(tower_social_counts.get("manualPublishingActionCards") or 0) > 0 and int(tower_social_counts.get("shortsPublishingActionCards") or 0) > 0, "Tower social command center exposes shorts and action cards", {"counts": tower_social_counts})
    check(checks, "towerSocialCommand", "social-command-shorts-review-operable", int(tower_social_counts.get("shortsPublishingCardsWithLocalReviewCommands") or 0) > 0, "Tower shorts action cards expose local keep/refine/reject review commands", {"counts": tower_social_counts})
    check(checks, "towerSocialCommand", "social-command-receipt-boundary", int(tower_social_counts.get("capturedReceipts") or 0) == 0 and int(tower_social_counts.get("readyForApproval") or 0) == 0 and int(tower_social_counts.get("draftOnlySchedules") or 0) > 0, "Tower social command center keeps approvals/receipts empty while exposing draft schedule intent", {"counts": tower_social_counts})
    bad_social_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if tower_social_truth.get(key) is True or tower_social_counts.get(key) is True
    ]
    check(checks, "towerSocialCommand", "social-command-is-read-only", not bad_social_truth, "Tower social command center truth stays read-only", {"dangerousTrue": bad_social_truth, "truth": tower_social_truth, "counts": tower_social_counts})

    tower_workbench, tower_workbench_target = loaded["towerWorkbench"]
    tower_workbench_counts = tower_workbench.get("counts") if isinstance(tower_workbench.get("counts"), dict) else {}
    tower_workbench_truth = tower_workbench.get("truth") if isinstance(tower_workbench.get("truth"), dict) else tower_workbench_target.get("truth") if isinstance(tower_workbench_target.get("truth"), dict) else {}
    check(checks, "towerWorkbench", "workbench-ready", tower_workbench.get("status") == "tower-operator-workbench-ready", "Tower operator workbench is ready", {"status": tower_workbench.get("status")})
    check(checks, "towerWorkbench", "workbench-rows", int(tower_workbench_counts.get("manualRows") or 0) > 0 and int(tower_workbench_counts.get("shortRows") or 0) > 0, "Tower operator workbench has manual and short rows", {"counts": tower_workbench_counts})
    check(checks, "towerWorkbench", "receipt-boundary", int(tower_workbench_counts.get("receiptSlots") or 0) > 0 and int(tower_workbench_counts.get("capturedReceipts") or 0) == 0 and int(tower_workbench_counts.get("readyForApproval") or 0) == 0, "Tower operator workbench keeps receipts and approval honest", {"counts": tower_workbench_counts})
    check(checks, "towerWorkbench", "workbench-front-doors", int(tower_workbench_counts.get("frontDoors") or 0) >= 4, "Tower operator workbench exposes multiple front doors", {"counts": tower_workbench_counts})
    bad_tower_truth = [
        key for key in ["externalPublishing", "externalUpload", "externalSchedulesCreated", "approvalCreated", "accountMutation", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "filesDeleted"]
        if tower_workbench_truth.get(key) is True
    ]
    check(checks, "towerWorkbench", "workbench-is-read-only", not bad_tower_truth, "Tower operator workbench truth stays read-only", {"dangerousTrue": bad_tower_truth, "truth": tower_workbench_truth})

    brief = return_brief_target()
    brief_pointer = load_json(POINTERS["returnBrief"])
    conveyor_paths = conveyor_path_by_lane(brief)
    brief_open_targets = brief.get("openTargets") if isinstance(brief.get("openTargets"), list) else []
    check(checks, "return-brief", "pointer-carries-top-queue", len(brief_pointer.get("topQueue") or []) > 0, "Latest return-brief pointer exposes the top queue for agents without target JSON chasing", {"topQueue": len(brief_pointer.get("topQueue") or [])})
    check(checks, "return-brief", "pointer-carries-first-actions", len(brief_pointer.get("firstActionsByLane") or []) > 0, "Latest return-brief pointer exposes first actions by lane for agents without target JSON chasing", {"firstActionsByLane": len(brief_pointer.get("firstActionsByLane") or [])})
    front_door_actions = brief_pointer.get("frontDoorActionsByLane") if isinstance(brief_pointer.get("frontDoorActionsByLane"), list) else []
    front_door_lanes = {str(item.get("lane") or "") for item in front_door_actions if isinstance(item, dict)}
    check(checks, "return-brief", "pointer-carries-front-door-actions", len(front_door_actions) >= 5 and {"Studio podcast/video", "Nest writing/research", "Photo Grove", "360 workflow", "Tower publishing/social"}.issubset(front_door_lanes), "Latest return-brief pointer exposes current front-door actions by lane", {"frontDoorActions": len(front_door_actions), "lanes": sorted(front_door_lanes)})
    bite_sized_actions = brief_pointer.get("biteSizedNextActionsByLane") if isinstance(brief_pointer.get("biteSizedNextActionsByLane"), list) else []
    bite_sized_lanes = {str(item.get("lane") or "") for item in bite_sized_actions if isinstance(item, dict)}
    bite_sized_with_commands = [
        item for item in bite_sized_actions
        if isinstance(item, dict) and (item.get("openCommand") or item.get("path"))
    ]
    writing_bite_action = next((item for item in bite_sized_actions if isinstance(item, dict) and item.get("lane") == "Nest writing/research"), {})
    photo_bite_action = next((item for item in bite_sized_actions if isinstance(item, dict) and item.get("lane") == "Photo Grove"), {})
    studio360_bite_action = next((item for item in bite_sized_actions if isinstance(item, dict) and item.get("lane") == "360 workflow"), {})
    tower_bite_action = next((item for item in bite_sized_actions if isinstance(item, dict) and item.get("lane") == "Tower publishing/social"), {})
    check(checks, "return-brief", "pointer-carries-bite-sized-next-actions", len(bite_sized_actions) >= 5 and len(bite_sized_with_commands) >= 5 and {"Studio podcast/video", "Nest writing/research", "Photo Grove", "360 workflow", "Tower publishing/social"}.issubset(bite_sized_lanes), "Latest return-brief pointer exposes one bite-sized safe next action by lane", {"biteSizedNextActions": len(bite_sized_actions), "withCommands": len(bite_sized_with_commands), "lanes": sorted(bite_sized_lanes)})
    writing_action_is_revision_batch = str(writing_bite_action.get("source") or "") == "nest-writing-next-revision-batch" and path_exists(writing_bite_action.get("path"))
    check(checks, "return-brief", "writing-bite-sized-source-backed-action", bool(writing_bite_action.get("firstDraftPacketCommand")) or writing_action_is_revision_batch, "Latest return-brief Nest writing bite-sized action carries either a safe draft-preview command or the source-backed revision batch", {"firstDraftPacketCommand": writing_bite_action.get("firstDraftPacketCommand"), "source": writing_bite_action.get("source"), "path": writing_bite_action.get("path")})
    check(checks, "return-brief", "photo-bite-sized-dry-run-command", bool(photo_bite_action.get("firstDryRunCommand")), "Latest return-brief Photo Grove bite-sized action carries the exact safe dry-run command", {"firstDryRunCommand": photo_bite_action.get("firstDryRunCommand"), "firstDryRunDecision": photo_bite_action.get("firstDryRunDecision")})
    check(checks, "return-brief", "studio360-bite-sized-local-proof-action", bool(studio360_bite_action.get("firstLocalProofCommand") or studio360_bite_action.get("firstLocalProofReviewCommand")), "Latest return-brief 360 bite-sized action carries a local proof action without claiming external publication", {"firstLocalProofCommand": studio360_bite_action.get("firstLocalProofCommand"), "firstLocalProofReviewCommand": studio360_bite_action.get("firstLocalProofReviewCommand"), "firstLocalProofAspect": studio360_bite_action.get("firstLocalProofAspect"), "firstLocalProofOutputExists": studio360_bite_action.get("firstLocalProofOutputExists")})
    check(checks, "return-brief", "tower-bite-sized-dry-run-command", bool(tower_bite_action.get("firstDryRunCommand")), "Latest return-brief Tower bite-sized action carries a concrete local review dry-run command", {"firstDryRunCommand": tower_bite_action.get("firstDryRunCommand"), "firstDryRunDecision": tower_bite_action.get("firstDryRunDecision")})
    sync_aid_html = str(sync_aid.get("htmlPath") or "")
    sync_aid_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == sync_aid_html and str(item.get("label") or "") == "Episode sync decision aid"
    ]
    check(checks, "return-brief", "sync-decision-aid-open-target", bool(sync_aid_html and sync_aid_open_targets and path_exists(sync_aid_html)), "Return brief exposes the Studio sync decision aid as an open target", {"syncDecisionAidHtml": sync_aid_html, "matchingTargets": len(sync_aid_open_targets)})
    studio_package_html = str(studio_package_desk.get("htmlPath") or "")
    studio_package_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_package_html and str(item.get("label") or "") == "Studio package quality desk"
    ]
    check(checks, "return-brief", "studio-package-desk-open-target", bool(studio_package_html and studio_package_open_targets and path_exists(studio_package_html)), "Return brief exposes the Studio package quality desk as an open target", {"studioPackageDeskHtml": studio_package_html, "matchingTargets": len(studio_package_open_targets)})
    studio_theater_html = str(studio_review_theater.get("htmlPath") or "")
    studio_theater_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_theater_html and str(item.get("label") or "") == "Studio review theater"
    ]
    check(checks, "return-brief", "studio-review-theater-open-target", bool(studio_theater_html and studio_theater_open_targets and path_exists(studio_theater_html)), "Return brief exposes the Studio review theater as an open target", {"studioReviewTheaterHtml": studio_theater_html, "matchingTargets": len(studio_theater_open_targets)})
    studio_shorts_batch_html = str(studio_shorts_batch.get("htmlPath") or "")
    studio_shorts_batch_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_shorts_batch_html and str(item.get("label") or "") == "Studio next shorts review batch"
    ]
    check(checks, "return-brief", "studio-next-shorts-review-batch-open-target", bool(studio_shorts_batch_html and studio_shorts_batch_open_targets and path_exists(studio_shorts_batch_html)), "Return brief exposes the Studio next shorts review batch as an open target", {"studioNextShortsReviewBatchHtml": studio_shorts_batch_html, "matchingTargets": len(studio_shorts_batch_open_targets)})
    studio_duration_matrix_html = str(studio_duration_matrix.get("htmlPath") or "")
    studio_duration_matrix_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_duration_matrix_html and str(item.get("label") or "") == "Studio duration experiment matrix"
    ]
    check(checks, "return-brief", "studio-duration-experiment-matrix-open-target", bool(studio_duration_matrix_html and studio_duration_matrix_open_targets and path_exists(studio_duration_matrix_html)), "Return brief exposes the Studio duration experiment matrix as an open target", {"studioDurationExperimentMatrixHtml": studio_duration_matrix_html, "matchingTargets": len(studio_duration_matrix_open_targets)})
    studio_duration_workorders_html = str(studio_duration_workorders.get("htmlPath") or "")
    studio_duration_workorders_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_duration_workorders_html and str(item.get("label") or "") == "Studio duration version work orders"
    ]
    check(checks, "return-brief", "studio-duration-version-workorders-open-target", bool(studio_duration_workorders_html and studio_duration_workorders_open_targets and path_exists(studio_duration_workorders_html)), "Return brief exposes the Studio duration version work orders as an open target", {"studioDurationVersionWorkordersHtml": studio_duration_workorders_html, "matchingTargets": len(studio_duration_workorders_open_targets)})
    studio_duration_recipes_html = str(studio_duration_recipes.get("htmlPath") or "")
    studio_duration_recipes_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_duration_recipes_html and str(item.get("label") or "") == "Studio duration edit-recipe skeletons"
    ]
    check(checks, "return-brief", "studio-duration-edit-recipe-skeletons-open-target", bool(studio_duration_recipes_html and studio_duration_recipes_open_targets and path_exists(studio_duration_recipes_html)), "Return brief exposes the Studio duration edit-recipe skeletons as an open target", {"studioDurationEditRecipeSkeletonsHtml": studio_duration_recipes_html, "matchingTargets": len(studio_duration_recipes_open_targets)})
    transcript_execution_html = str(transcript_execution.get("htmlPath") or "")
    transcript_execution_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == transcript_execution_html and str(item.get("label") or "") == "Studio transcript execution readiness"
    ]
    check(checks, "return-brief", "studio-transcript-execution-readiness-open-target", bool(transcript_execution_html and transcript_execution_open_targets and path_exists(transcript_execution_html)), "Return brief exposes the Studio transcript execution readiness board as an open target", {"studioTranscriptExecutionReadinessHtml": transcript_execution_html, "matchingTargets": len(transcript_execution_open_targets)})
    transcript_pilot_html = str(transcript_pilot.get("htmlPath") or "")
    transcript_pilot_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == transcript_pilot_html and str(item.get("label") or "") == "Studio transcript pilot"
    ]
    check(checks, "return-brief", "studio-transcript-pilot-open-target", bool(transcript_pilot_html and transcript_pilot_open_targets and path_exists(transcript_pilot_html)), "Return brief exposes the Studio transcript pilot board as an open target", {"studioTranscriptPilotHtml": transcript_pilot_html, "matchingTargets": len(transcript_pilot_open_targets)})
    transcript_review_html = str(transcript_review.get("htmlPath") or "")
    transcript_review_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == transcript_review_html and str(item.get("label") or "") == "Studio transcript review workbench"
    ]
    check(checks, "return-brief", "studio-transcript-review-workbench-open-target", bool(transcript_review_html and transcript_review_open_targets and path_exists(transcript_review_html)), "Return brief exposes the Studio transcript review workbench as an open target", {"studioTranscriptReviewWorkbenchHtml": transcript_review_html, "matchingTargets": len(transcript_review_open_targets)})
    transcript_decision_html = str(transcript_decision.get("htmlPath") or "")
    transcript_decision_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == transcript_decision_html and str(item.get("label") or "") == "Studio transcript review decision ledger"
    ]
    check(checks, "return-brief", "studio-transcript-review-decision-ledger-open-target", bool(transcript_decision_html and transcript_decision_open_targets and path_exists(transcript_decision_html)), "Return brief exposes the Studio transcript review decision ledger as an open target", {"studioTranscriptReviewDecisionLedgerHtml": transcript_decision_html, "matchingTargets": len(transcript_decision_open_targets)})
    studio_watch_html = str(studio_watch_listen.get("htmlPath") or "")
    studio_watch_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio_watch_html and str(item.get("label") or "") == "Studio watch/listen review room"
    ]
    check(checks, "return-brief", "studio-watch-listen-open-target", bool(studio_watch_html and studio_watch_open_targets and path_exists(studio_watch_html)), "Return brief exposes the Studio watch/listen review room as an open target", {"studioWatchListenHtml": studio_watch_html, "matchingTargets": len(studio_watch_open_targets)})
    photo_workbench_html = str(photo_workbench.get("htmlPath") or "")
    photo_workbench_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == photo_workbench_html and str(item.get("label") or "") == "Photo Grove operator workbench"
    ]
    check(checks, "return-brief", "photo-operator-workbench-open-target", bool(photo_workbench_html and photo_workbench_open_targets and path_exists(photo_workbench_html)), "Return brief exposes the Photo Grove operator workbench as an open target", {"photoWorkbenchHtml": photo_workbench_html, "matchingTargets": len(photo_workbench_open_targets)})
    photo_cull_theater_html = str(photo_cull_theater.get("htmlPath") or "")
    photo_cull_theater_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == photo_cull_theater_html and str(item.get("label") or "") == "Photo Grove cull theater"
    ]
    check(checks, "return-brief", "photo-cull-theater-open-target", bool(photo_cull_theater_html and photo_cull_theater_open_targets and path_exists(photo_cull_theater_html)), "Return brief exposes the Photo Grove cull theater as an open target", {"photoCullTheaterHtml": photo_cull_theater_html, "matchingTargets": len(photo_cull_theater_open_targets)})
    photo_proof_desk_html = str(photo_proof_desk.get("htmlPath") or "")
    photo_proof_desk_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == photo_proof_desk_html and str(item.get("label") or "") == "Photo Grove proof desk"
    ]
    check(checks, "return-brief", "photo-proof-desk-open-target", bool(photo_proof_desk_html and photo_proof_desk_open_targets and path_exists(photo_proof_desk_html)), "Return brief exposes the Photo Grove proof desk as an open target", {"photoProofDeskHtml": photo_proof_desk_html, "matchingTargets": len(photo_proof_desk_open_targets)})
    tower_social_html = str(tower_social.get("htmlPath") or "")
    tower_social_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == tower_social_html and str(item.get("label") or "") == "Tower social command center"
    ]
    check(checks, "return-brief", "tower-social-command-open-target", bool(tower_social_html and tower_social_open_targets and path_exists(tower_social_html)), "Return brief exposes the Tower social command center as an open target", {"towerSocialCommandHtml": tower_social_html, "matchingTargets": len(tower_social_open_targets)})
    tower_batch_html = str(tower_batch.get("htmlPath") or "")
    tower_batch_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == tower_batch_html and str(item.get("label") or "") == "Tower next publishing batch"
    ]
    check(checks, "return-brief", "tower-next-publishing-batch-open-target", bool(tower_batch_html and tower_batch_open_targets and path_exists(tower_batch_html)), "Return brief exposes the Tower next publishing batch as an open target", {"towerNextPublishingBatchHtml": tower_batch_html, "matchingTargets": len(tower_batch_open_targets)})
    tower_workbench_html = str(tower_workbench.get("htmlPath") or "")
    tower_workbench_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == tower_workbench_html and str(item.get("label") or "") == "Tower operator workbench"
    ]
    check(checks, "return-brief", "tower-operator-workbench-open-target", bool(tower_workbench_html and tower_workbench_open_targets and path_exists(tower_workbench_html)), "Return brief exposes the Tower operator workbench as an open target", {"towerWorkbenchHtml": tower_workbench_html, "matchingTargets": len(tower_workbench_open_targets)})
    nest_author_html = str(nest_author_desk.get("htmlPath") or "")
    nest_author_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == nest_author_html and str(item.get("label") or "") == "Nest author desk"
    ]
    check(checks, "return-brief", "nest-author-desk-open-target", bool(nest_author_html and nest_author_open_targets and path_exists(nest_author_html)), "Return brief exposes the Nest author desk as an open target", {"nestAuthorDeskHtml": nest_author_html, "matchingTargets": len(nest_author_open_targets)})
    nest_review_html = str(nest_review_desk.get("htmlPath") or "")
    nest_review_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == nest_review_html and str(item.get("label") or "") == "Nest writing review desk"
    ]
    check(checks, "return-brief", "nest-review-desk-open-target", bool(nest_review_html and nest_review_open_targets and path_exists(nest_review_html)), "Return brief exposes the Nest writing review desk as an open target", {"nestReviewDeskHtml": nest_review_html, "matchingTargets": len(nest_review_open_targets)})
    nest_daily_html = str(nest_daily_packet.get("htmlPath") or "")
    nest_daily_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == nest_daily_html and str(item.get("label") or "") == "Nest daily writing packet"
    ]
    check(checks, "return-brief", "nest-daily-writing-packet-open-target", bool(nest_daily_html and nest_daily_open_targets and path_exists(nest_daily_html)), "Return brief exposes the Nest daily writing packet as an open target", {"nestDailyWritingPacketHtml": nest_daily_html, "matchingTargets": len(nest_daily_open_targets)})
    daily_readiness_html = str(daily_writing_readiness.get("htmlPath") or "")
    daily_readiness_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == daily_readiness_html and str(item.get("label") or "") == "Daily Writing Desk readiness"
    ]
    check(checks, "return-brief", "daily-writing-readiness-open-target", bool(daily_readiness_html and daily_readiness_open_targets and path_exists(daily_readiness_html)), "Return brief exposes the Daily Writing Desk readiness board as an open target", {"dailyWritingReadinessHtml": daily_readiness_html, "matchingTargets": len(daily_readiness_open_targets)})
    writing_runway_html = str(nest_writing_runway.get("htmlPath") or "")
    writing_runway_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == writing_runway_html and str(item.get("label") or "") == "Writing publication runway"
    ]
    check(checks, "return-brief", "writing-publication-runway-open-target", bool(writing_runway_html and writing_runway_open_targets and path_exists(writing_runway_html)), "Return brief exposes the writing publication runway as an open target", {"writingPublicationRunwayHtml": writing_runway_html, "matchingTargets": len(writing_runway_open_targets)})
    nest_revision_html = str(nest_revision_batch.get("htmlPath") or "")
    nest_revision_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == nest_revision_html and str(item.get("label") or "") == "Nest writing revision batch"
    ]
    check(checks, "return-brief", "nest-writing-revision-batch-open-target", bool(nest_revision_html and nest_revision_open_targets and path_exists(nest_revision_html)), "Return brief exposes the Nest writing revision batch as an open target", {"nestRevisionBatchHtml": nest_revision_html, "matchingTargets": len(nest_revision_open_targets)})
    studio360_workbench_html = str(studio360_workbench.get("htmlPath") or "")
    studio360_workbench_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio360_workbench_html and str(item.get("label") or "") == "Studio360 operator workbench"
    ]
    check(checks, "return-brief", "studio360-operator-workbench-open-target", bool(studio360_workbench_html and studio360_workbench_open_targets and path_exists(studio360_workbench_html)), "Return brief exposes the Studio360 operator workbench as an open target", {"studio360WorkbenchHtml": studio360_workbench_html, "matchingTargets": len(studio360_workbench_open_targets)})
    studio360_repair_html = str(studio360_repair_preflight.get("htmlPath") or "")
    studio360_repair_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio360_repair_html and str(item.get("label") or "") == "Studio360 repair preflight"
    ]
    check(checks, "return-brief", "studio360-repair-preflight-open-target", bool(studio360_repair_html and studio360_repair_open_targets and path_exists(studio360_repair_html)), "Return brief exposes the Studio360 repair preflight as an open target", {"studio360RepairPreflightHtml": studio360_repair_html, "matchingTargets": len(studio360_repair_open_targets)})
    studio360_source_html = str(studio360_source_desk.get("htmlPath") or "")
    studio360_source_open_targets = [
        item for item in brief_open_targets
        if isinstance(item, dict) and str(item.get("path") or "") == studio360_source_html and str(item.get("label") or "") == "Studio360 source desk"
    ]
    check(checks, "return-brief", "studio360-source-desk-open-target", bool(studio360_source_html and studio360_source_open_targets and path_exists(studio360_source_html)), "Return brief exposes the Studio360 source desk as an open target", {"studio360SourceDeskHtml": studio360_source_html, "matchingTargets": len(studio360_source_open_targets)})
    expected = {
        "Studio podcast/video": str(studio_package_desk.get("htmlPath") or studio.get("htmlPath") or ""),
        "Nest writing/research": str(nest_revision_batch.get("htmlPath") or nest_daily_packet.get("htmlPath") or nest_review_desk.get("htmlPath") or nest_author_desk.get("htmlPath") or nest.get("nextWritingCardPath") or nest.get("htmlPath") or ""),
        "Photo Grove": str(photo_proof_desk.get("htmlPath") or photo_cull_theater.get("htmlPath") or photo_workbench.get("htmlPath") or photo.get("nextCullCardPath") or photo.get("htmlPath") or ""),
        "360 workflow": str(studio360_source_desk.get("htmlPath") or studio360_repair_preflight.get("htmlPath") or studio360_workbench.get("htmlPath") or studio360.get("next360SourceCardPath") or studio360.get("htmlPath") or ""),
        "Tower publishing/social": str(tower_social.get("htmlPath") or tower_workbench.get("htmlPath") or tower.get("nextPublishingCardPath") or tower.get("htmlPath") or ""),
    }
    for lane, expected_path in expected.items():
        actual = conveyor_paths.get(lane, "")
        check(checks, "return-brief", f"conveyor-{lane}", bool(expected_path and actual == expected_path and path_exists(actual)), f"Return brief conveyor points {lane} at latest next-action pointer", {"expected": expected_path, "actual": actual})

    failures = [item for item in checks if item["status"] == "fail"]
    warnings = [item for item in checks if item["status"] == "warn"]
    return {
        "schema": "quipsly.pointer-contract-validation.v1",
        "generatedAt": iso_now(),
        "status": "passed" if not failures else "failed",
        "counts": {
            "checks": len(checks),
            "passed": sum(1 for item in checks if item["status"] == "pass"),
            "failures": len(failures),
            "warnings": len(warnings),
            "lanes": 5,
            "pointerContracts": len(loaded),
        },
        "checks": checks,
        "truth": {
            "description": "Read-only validation of latest Quipsly OS next-action pointer contracts.",
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "accountMutation": False,
            "approvalCreated": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Quipsly pointer contract validation",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Checks: `{payload.get('counts', {}).get('checks')}`",
        f"- Passed: `{payload.get('counts', {}).get('passed')}`",
        f"- Failures: `{payload.get('counts', {}).get('failures')}`",
        f"- Warnings: `{payload.get('counts', {}).get('warnings')}`",
        "",
        "## Checks",
    ]
    for item in payload.get("checks") or []:
        lines.append(f"- `{item.get('status')}` `{item.get('lane')}` `{item.get('key')}` - {item.get('summary')}")
    lines.extend([
        "",
        "## Safety",
        "Read-only validation only. No source, export, publication, schedule, approval, account, or receipt truth is changed.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    rows = "".join(
        f"<tr><td>{esc(item.get('status'))}</td><td>{esc(item.get('lane'))}</td><td>{esc(item.get('key'))}</td><td>{esc(item.get('summary'))}</td></tr>"
        for item in payload.get("checks") or []
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly pointer contract validation</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f6f0df; --paper:#16221d; --leaf:#83c17f; --line:#3d5549; --gold:#e5bd55; --bad:#e57567; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 10% 0%, #30443a, #111715 52%, #201914); color:var(--ink); }}
    main {{ max-width: 1180px; margin: 34px auto; padding: 0 22px 56px; }}
    .card {{ border:1px solid var(--line); border-radius:28px; background:rgba(22,34,29,.94); padding:26px; box-shadow:0 24px 80px rgba(0,0,0,.35); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.26em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font:900 clamp(34px,5vw,62px)/.95 ui-serif, Georgia, serif; margin:12px 0; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }}
    .meta span {{ border:1px solid var(--line); background:rgba(255,255,255,.06); border-radius:999px; padding:8px 12px; font-weight:900; font-size:12px; }}
    table {{ width:100%; border-collapse:collapse; margin-top:18px; overflow:hidden; border-radius:18px; }}
    th, td {{ border-bottom:1px solid var(--line); padding:10px; text-align:left; vertical-align:top; }}
    th {{ color:var(--leaf); }}
    td:first-child {{ font-weight:900; }}
  </style>
</head>
<body><main><div class="card">
  <div class="eyebrow">Quipsly OS</div>
  <h1>Pointer contracts are production truth.</h1>
  <p>These checks guard the front doors that humans and agents use first. Passing here means each lane says what to open, what is safe, and what has not happened.</p>
  <div class="meta"><span>{esc(payload.get('status'))}</span><span>{esc(payload.get('counts', {}).get('checks'))} checks</span><span>{esc(payload.get('counts', {}).get('failures'))} failures</span><span>{esc(payload.get('counts', {}).get('warnings'))} warnings</span></div>
  <table><thead><tr><th>Status</th><th>Lane</th><th>Check</th><th>Summary</th></tr></thead><tbody>{rows}</tbody></table>
</div></main></body></html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    payload = build()
    out_dir = OUT_ROOT / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "quipsly-pointer-contract-validation.json"
    markdown_path = out_dir / "START-HERE-pointer-contract-validation.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open pointer contract validation",
            "command": f"open '{html_path}'",
            "path": str(html_path),
            "safety": "Read-only validation report. No source, export, publication, schedule, approval, account, or receipt truth is changed.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_json(LATEST_POINTER, {
        "schema": "quipsly.latest-pointer-contract-validation.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "counts": payload.get("counts"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    })
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload.get("status") == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
