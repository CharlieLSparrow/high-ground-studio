#!/usr/bin/env python3
"""Aggregate Episode 1 artifact review state into one honest packet.

This is a read/coordination surface for humans and agents. It does not approve,
promote, publish, upload, schedule, or capture receipts.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def load_optional_json(path: str) -> dict[str, Any] | None:
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: str, payload: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")


def latest_ledger_row(path: str) -> dict[str, Any] | None:
    if not os.path.exists(path):
        return None
    latest = None
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                latest = json.loads(line)
            except json.JSONDecodeError:
                continue
    return latest


def artifact_summary(item: dict[str, Any]) -> dict[str, Any]:
    sample = item.get("candidateEndingSample") or {}
    return {
        "artifactId": item.get("artifactId"),
        "path": item.get("outputPath") or item.get("path"),
        "sourcePath": item.get("sourcePath"),
        "durationSeconds": item.get("outputDurationSeconds") or item.get("durationSeconds"),
        "exists": item.get("exists"),
        "endingSamplePath": sample.get("path") or item.get("endingReviewSamplePath"),
        "endingSampleExists": sample.get("exists") or item.get("endingReviewSampleExists"),
        "endingSampleDurationSeconds": sample.get("sampleDurationSeconds") or item.get("endingReviewSampleDurationSeconds"),
    }


def recommended_action(current_decision: dict[str, Any] | None, tail_candidate: dict[str, Any] | None, tail_sanity: dict[str, Any] | None, promotion: dict[str, Any] | None) -> dict[str, Any]:
    if current_decision and current_decision.get("decision") == "pass":
        return {
            "state": "artifact-review-passed-not-publication-ready",
            "command": "script/agentctl.sh episode1-publication-action-queue --json",
            "action": "Artifact review has passed; review destination copy, writing/canon state, selected shorts, and receipt targets before any publication claim.",
        }
    if promotion and promotion.get("decision") == "promote-for-review":
        return {
            "state": "tail-candidate-selected-needs-watch-listen-review",
            "command": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected tail-trim artifact set; ready for destination-copy review, not publication receipt."',
            "action": "Perform watch/listen review against the selected tail-trim artifact set, then record pass/needs-fix/reject explicitly.",
        }
    if promotion and promotion.get("decision") == "reject-candidate":
        return {
            "state": "tail-candidate-rejected-needs-new-studio-fix",
            "command": "script/agentctl.sh episode1-tail-trim-candidate",
            "action": "Regenerate or revise Studio replacement artifacts before Tower artifact-ready claims.",
        }
    if tail_candidate and tail_sanity and tail_sanity.get("status") == "tail-trim-candidate-machine-sanity-ok":
        return {
            "state": "tail-candidate-sane-needs-ending-review",
            "command": 'script/agentctl.sh episode1-tail-trim-promote promote-for-review "Reviewer Name" "Tail-trim candidate ending samples reviewed; select candidate artifact set for full watch/listen review."',
            "action": "Open the review station, review the focused ending samples, then either select the candidate for watch/listen review or reject it.",
        }
    if tail_candidate:
        return {
            "state": "tail-candidate-exists-needs-machine-sanity",
            "command": "script/agentctl.sh episode1-tail-trim-candidate-sanity",
            "action": "Run machine sanity on the tail-trim candidate before asking a human or agent to review it.",
        }
    return {
        "state": "original-artifact-review-needs-tail-fix-or-review",
        "command": "script/agentctl.sh episode1-tail-trim-candidate",
        "action": "Generate the non-destructive tail-trim candidate, then review the ending before Tower artifact-ready claims.",
    }


def markdown(packet: dict[str, Any]) -> str:
    rec = packet["recommendedImmediateAction"]
    lines = [
        "# Episode 1 artifact review status",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Overall status: `{packet['status']}`",
        "",
        "## Current answer",
        "",
        f"- Recommended state: `{rec['state']}`",
        f"- Next action: {rec['action']}",
        f"- Command: `{rec['command']}`",
        "",
        "## Evidence surfaces",
        "",
        f"- Review station: `{packet.get('reviewStationHtml')}`",
        f"- Tail candidate: `{packet.get('tailTrimCandidatePacket')}`",
        f"- Tail candidate sanity: `{packet.get('tailTrimCandidateSanityPacket')}`",
        f"- Tail promotion decision: `{packet.get('tailTrimPromotionDecision')}`",
        f"- Current watch/listen decision: `{packet.get('artifactWatchListenReviewDecision')}`",
        "",
        "## Truth boundary",
        "",
        packet["truth"],
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    if len(sys.argv) != 11:
        print(
            "usage: episode1_artifact_review_status.py review-station.json tail-candidate.json tail-sanity.json tail-promotion-current.json current-watch-decision.json watch-ledger.jsonl action-queue.json studio-queue.json output.json output.md",
            file=sys.stderr,
        )
        return 2

    (
        review_station_path,
        tail_candidate_path,
        tail_sanity_path,
        tail_promotion_path,
        current_decision_path,
        watch_ledger_path,
        action_queue_path,
        studio_queue_path,
        output_json,
        output_md,
    ) = sys.argv[1:11]

    review_station = load_optional_json(review_station_path)
    tail_candidate = load_optional_json(tail_candidate_path)
    tail_sanity = load_optional_json(tail_sanity_path)
    promotion = load_optional_json(tail_promotion_path)
    current_decision = load_optional_json(current_decision_path)
    latest_watch_decision = latest_ledger_row(watch_ledger_path)
    action_queue = load_optional_json(action_queue_path)
    studio_queue = load_optional_json(studio_queue_path)

    rec = recommended_action(current_decision, tail_candidate, tail_sanity, promotion)
    selected_artifacts = promotion.get("selectedArtifactSet") if promotion else None
    packet = {
        "packetType": "quipsly-episode1-artifact-review-status",
        "version": "2026-06-20.artifact-review-status.v1",
        "projectSlug": "high-ground-odyssey-manuscript",
        "episodeSlug": "episode-1",
        "generatedAt": now_iso(),
        "status": rec["state"],
        "reviewStationPacket": review_station_path if review_station else None,
        "reviewStationHtml": (review_station or {}).get("reviewStationHtml"),
        "tailTrimCandidatePacket": tail_candidate_path if tail_candidate else None,
        "tailTrimCandidateStatus": (tail_candidate or {}).get("status"),
        "tailTrimCandidateSanityPacket": tail_sanity_path if tail_sanity else None,
        "tailTrimCandidateSanityStatus": (tail_sanity or {}).get("status"),
        "tailTrimCandidateSanityErrors": (tail_sanity or {}).get("errorCount"),
        "tailTrimCandidateSanityWarnings": (tail_sanity or {}).get("warningCount"),
        "tailTrimPromotionDecision": tail_promotion_path if promotion else None,
        "tailTrimPromotionStatus": (promotion or {}).get("status"),
        "selectedArtifactSet": [artifact_summary(item) for item in selected_artifacts] if selected_artifacts else [],
        "artifactWatchListenReviewDecision": current_decision_path if current_decision else None,
        "artifactWatchListenReviewStatus": (current_decision or {}).get("status"),
        "latestWatchListenLedgerDecision": latest_watch_decision,
        "publicationActionQueueStatus": (action_queue or {}).get("queueStatus"),
        "studioProofAttachmentQueueStatus": (studio_queue or {}).get("queueStatus"),
        "recommendedImmediateAction": rec,
        "blockedClaims": [
            "Do not claim artifact-ready until watch/listen review is completed against the selected artifact set.",
            "Do not claim publication-ready until destination copy, writing/canon state, selected shorts, and receipt targets are reviewed.",
            "Do not claim published until external URLs or provider ids are captured.",
        ],
        "truth": "This status packet aggregates current Episode 1 artifact-review evidence. It does not generate media, select candidates, approve artifacts, publish, upload, schedule, or capture receipts.",
    }
    write_json(output_json, packet)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))
    print(json.dumps({
        "packetType": "quipsly-episode1-artifact-review-status-result",
        "status": packet["status"],
        "recommendedImmediateAction": rec,
        "writtenTo": output_json,
        "markdown": output_md,
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
