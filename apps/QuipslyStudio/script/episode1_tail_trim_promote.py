#!/usr/bin/env python3
"""Promote an Episode 1 tail-trim candidate into the selected artifact set for review.

This is an explicit Studio handoff. It does not publish, upload, schedule, or
claim final artifact approval. It only says: use these reviewed candidate paths
as the selected artifacts for the next watch/listen review decision.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

REQUIRED_ARTIFACT_IDS = {"episode-16x9-master", "episode-9x16-master", "podcast-audio-master"}


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_json(path: str) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def fail(message: str) -> None:
    raise SystemExit(message)


def artifact_record(item: dict[str, Any]) -> dict[str, Any]:
    sample = item.get("candidateEndingSample") or {}
    return {
        "artifactId": item.get("artifactId"),
        "path": item.get("outputPath"),
        "durationSeconds": item.get("outputDurationSeconds"),
        "sourcePath": item.get("sourcePath"),
        "targetDurationSeconds": item.get("targetDurationSeconds"),
        "trimmedTailSeconds": item.get("trimmedTailSeconds"),
        "exists": bool(item.get("exists")),
        "endingReviewSamplePath": sample.get("path"),
        "endingReviewSampleExists": bool(sample.get("exists")),
        "endingReviewSampleDurationSeconds": sample.get("sampleDurationSeconds"),
    }


def main() -> int:
    if len(sys.argv) != 11:
        print(
            "usage: episode1_tail_trim_promote.py candidate.json output-current.json ledger.jsonl action-queue.json studio-queue.json writing-status.json review-station.json actor note decision",
            file=sys.stderr,
        )
        return 2

    (
        candidate_path,
        output_current_path,
        ledger_path,
        action_queue_path,
        studio_queue_path,
        writing_status_path,
        review_station_path,
        actor,
        note,
        decision,
    ) = sys.argv[1:11]

    if decision not in {"promote-for-review", "reject-candidate"}:
        fail("decision must be promote-for-review or reject-candidate")

    candidate = load_json(candidate_path)
    if candidate.get("failedArtifactCount") not in (0, None):
        fail("Cannot promote candidate with failed artifacts.")
    if candidate.get("failedCandidateSampleCount") not in (0, None):
        fail("Cannot promote candidate with failed ending samples.")

    artifact_items = [item for item in candidate.get("artifacts", []) if item.get("artifactId") in REQUIRED_ARTIFACT_IDS]
    present_ids = {item.get("artifactId") for item in artifact_items}
    missing_ids = sorted(REQUIRED_ARTIFACT_IDS - present_ids)
    if missing_ids:
        fail(f"Candidate missing required artifacts: {', '.join(missing_ids)}")

    selected_artifacts = []
    for item in artifact_items:
        record = artifact_record(item)
        if not record["path"] or not os.path.exists(record["path"]):
            fail(f"Candidate artifact missing on disk: {record['artifactId']}")
        if not record["endingReviewSamplePath"] or not os.path.exists(record["endingReviewSamplePath"]):
            fail(f"Candidate ending review sample missing on disk: {record['artifactId']}")
        selected_artifacts.append(record)

    created_at = now_iso()
    status = "tail-trim-candidate-selected-for-watch-listen-review" if decision == "promote-for-review" else "tail-trim-candidate-rejected"
    packet = {
        "packetType": "quipsly-tail-trim-promotion-decision",
        "version": "2026-06-20.tail-trim-promotion.v1",
        "projectSlug": candidate.get("projectSlug", "high-ground-odyssey-manuscript"),
        "episodeSlug": candidate.get("episodeSlug", "episode-1"),
        "createdAt": created_at,
        "actor": actor,
        "decision": decision,
        "status": status,
        "note": note,
        "sourceTailTrimCandidate": candidate_path,
        "sourceReviewStation": review_station_path,
        "selectedArtifactSet": selected_artifacts if decision == "promote-for-review" else [],
        "truth": "This records whether the tail-trim candidate is the selected artifact set for watch/listen review. It does not approve final artifacts, publish, upload, schedule, or capture receipts.",
    }

    write_json(output_current_path, packet)
    os.makedirs(os.path.dirname(ledger_path) or ".", exist_ok=True)
    with open(ledger_path, "a", encoding="utf-8") as handle:
        handle.write(json.dumps(packet, sort_keys=True))
        handle.write("\n")

    for path in (action_queue_path, studio_queue_path, writing_status_path):
        payload = load_json(path)
        payload["updatedAt"] = created_at
        if path == action_queue_path:
            payload["currentTailTrimPromotionDecision"] = output_current_path
            payload["currentTailTrimPromotionLedger"] = ledger_path
            payload["currentSelectedArtifactSet"] = output_current_path if decision == "promote-for-review" else None
            payload["queueStatus"] = status
            payload["readyNow"] = [
                "Open the review station and perform watch/listen review on the selected tail-trim artifact set.",
                "Record artifact pass/needs-fix/reject after review; do not treat promotion as final approval.",
            ] if decision == "promote-for-review" else [
                "Regenerate or revise candidate artifacts before Tower artifact-ready claims.",
            ]
            payload["notReadyYet"] = [
                "Tail-trim candidate selected, but artifact watch/listen review still has not passed.",
                "Do not claim publication-ready until artifact review is passed.",
                "Do not claim published until external URLs or provider ids are captured.",
            ] if decision == "promote-for-review" else [
                "Tail-trim candidate rejected; replacement artifact set still needed.",
                "Do not claim publication-ready until artifact review is passed.",
            ]
            payload.setdefault("operatorCommands", {})["promoteTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-promote promote-for-review [actor] [note]"
        elif path == studio_queue_path:
            payload["currentTailTrimPromotionDecision"] = output_current_path
            payload["currentTailTrimPromotionLedger"] = ledger_path
            payload["currentSelectedArtifactSet"] = output_current_path if decision == "promote-for-review" else None
            payload["queueStatus"] = status
            payload["blockedClaims"] = [
                "Candidate selection is not final artifact approval.",
                "Do not claim artifact-ready until watch/listen review passes against the selected artifact set.",
            ]
            payload.setdefault("operatorCommands", {})["promoteTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-promote promote-for-review [actor] [note]"
        else:
            artifacts = payload.setdefault("authoritativeArtifacts", {})
            artifacts["tailTrimPromotionDecision"] = output_current_path
            artifacts["tailTrimPromotionLedger"] = ledger_path
            if decision == "promote-for-review":
                artifacts["selectedArtifactSetForWatchListenReview"] = output_current_path
            current = payload.setdefault("currentState", {})
            current["studioProofStatus"] = status
            current["publicationActionQueueStatus"] = status
            payload.setdefault("operatorCommands", {})["promoteTailTrimCandidate"] = "script/agentctl.sh episode1-tail-trim-promote promote-for-review [actor] [note]"
        write_json(path, payload)

    print(json.dumps({
        "packetType": "quipsly-tail-trim-promotion-result",
        "status": status,
        "decision": decision,
        "actor": actor,
        "currentDecision": output_current_path,
        "ledger": ledger_path,
        "selectedArtifactCount": len(packet["selectedArtifactSet"]),
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
