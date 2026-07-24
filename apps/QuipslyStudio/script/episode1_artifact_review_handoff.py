#!/usr/bin/env python3
"""Create an Episode 1 artifact-review handoff bundle.

This is a read-only coordination packet for humans, Codex, and other Quipslys.
It gathers the current status reader, review station, tail-trim candidate,
sanity packet, promotion state, and safe next commands into one small bundle.

It does not generate media, select candidates, approve artifacts, publish,
upload, schedule, or capture receipts.
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


def artifact_paths_from_candidate(candidate: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not candidate:
        return []
    artifacts: list[dict[str, Any]] = []
    for item in candidate.get("artifacts") or []:
        sample = item.get("candidateEndingSample") or {}
        artifacts.append(
            {
                "artifactId": item.get("artifactId"),
                "candidatePath": item.get("outputPath"),
                "candidateExists": bool(item.get("exists")),
                "candidateDurationSeconds": item.get("outputDurationSeconds"),
                "endingSamplePath": sample.get("path"),
                "endingSampleExists": bool(sample.get("exists")),
                "endingSampleDurationSeconds": sample.get("sampleDurationSeconds"),
            }
        )
    return artifacts


def sanity_contact_sheets(sanity: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not sanity:
        return []
    sheets: list[dict[str, Any]] = []
    for item in sanity.get("artifacts") or []:
        sheet = item.get("endingSampleContactSheet") or {}
        if sheet.get("path"):
            sheets.append(
                {
                    "artifactId": item.get("artifactId"),
                    "contactSheetPath": sheet.get("path"),
                    "exists": bool(sheet.get("exists")),
                }
            )
    return sheets


def safe_commands(status: dict[str, Any] | None) -> dict[str, str]:
    recommended = (status or {}).get("recommendedImmediateAction") or {}
    return {
        "openReviewStation": "open docs/quipsly/studio-proof/episode-1-artifact-review-station.html",
        "refreshStatus": "script/agentctl.sh episode1-artifact-review-status --json",
        "refreshHandoff": "script/agentctl.sh episode1-artifact-review-handoff --json",
        "recommendedImmediateAction": recommended.get("command") or "script/agentctl.sh episode1-artifact-review-status --json",
        "selectTailTrimCandidateForReview": 'script/agentctl.sh episode1-tail-trim-promote promote-for-review "Reviewer Name" "Tail-trim candidate ending samples reviewed; select candidate artifact set for full watch/listen review."',
        "rejectTailTrimCandidate": 'script/agentctl.sh episode1-tail-trim-promote reject-candidate "Reviewer Name" "Tail-trim candidate did not resolve the ending cleanly; regenerate replacement artifacts."',
        "passSelectedArtifactReview": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "Reviewed selected tail-trim artifact set; ready for destination-copy review, not publication receipt."',
        "explicitlyAcceptOriginalLongTail": 'script/agentctl.sh episode1-artifact-watch-review-decision pass "Reviewer Name" "accept-originals-with-tail-warning: reviewed original masters and intentionally accept the long-tail behavior."',
    }


def markdown(packet: dict[str, Any]) -> str:
    status = packet.get("statusPacket") or {}
    recommended = packet["recommendedImmediateAction"]
    commands = packet["safeCommands"]
    lines = [
        "# Episode 1 artifact review handoff",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        f"Current state: `{packet['currentState']}`",
        "",
        "## What this means",
        "",
        packet["plainEnglishState"],
        "",
        "## Review first",
        "",
        f"- Review station: `{packet['reviewStationHtml']}`",
        f"- Watch/listen worksheet: `{packet['watchListenWorksheet']}`",
        f"- Tail candidate packet: `{packet['tailTrimCandidatePacket']}`",
        f"- Tail candidate sanity: `{packet['tailTrimCandidateSanityPacket']}`",
        "",
        "## Focused ending samples",
        "",
    ]
    for artifact in packet["tailTrimCandidateArtifacts"]:
        lines.append(
            f"- `{artifact['artifactId']}`: `{artifact['endingSamplePath']}` "
            f"({artifact['endingSampleDurationSeconds']}s, exists: {artifact['endingSampleExists']})"
        )
    if not packet["tailTrimCandidateArtifacts"]:
        lines.append("- No tail-trim candidate artifacts found.")
    lines.extend(["", "## Contact sheets", ""])
    for sheet in packet["contactSheets"]:
        lines.append(f"- `{sheet['artifactId']}`: `{sheet['contactSheetPath']}` (exists: {sheet['exists']})")
    if not packet["contactSheets"]:
        lines.append("- No contact sheets found.")
    lines.extend(
        [
            "",
            "## Recommended immediate action",
            "",
            f"- State: `{recommended.get('state')}`",
            f"- Action: {recommended.get('action')}",
            f"- Command: `{recommended.get('command')}`",
            "",
            "## Safe commands",
            "",
        ]
    )
    for key, command in commands.items():
        lines.append(f"- {key}: `{command}`")
    lines.extend(
        [
            "",
            "## Blocked claims",
            "",
        ]
    )
    for claim in packet["blockedClaims"]:
        lines.append(f"- {claim}")
    lines.extend(
        [
            "",
            "## Truth boundary",
            "",
            packet["truth"],
            "",
        ]
    )
    return "\n".join(lines)


def plain_state(status: dict[str, Any] | None, promotion: dict[str, Any] | None) -> str:
    current = (status or {}).get("status")
    if current == "tail-candidate-sane-needs-ending-review":
        return (
            "The tail-trim candidate appears structurally sane. The next job is not to publish; "
            "it is to review the focused ending samples and explicitly select or reject the candidate."
        )
    if current == "tail-candidate-selected-needs-watch-listen-review":
        actor = (promotion or {}).get("actor") or "unknown reviewer"
        return (
            f"The tail-trim candidate has been selected for review by {actor}. "
            "The next job is full watch/listen review of the selected artifact set."
        )
    if current == "artifact-review-passed-not-publication-ready":
        return (
            "Artifact watch/listen review has passed, but publication is still not proven. "
            "Destination copy, writing/canon state, selected shorts, schedules, and receipt targets still matter."
        )
    return (
        "Episode 1 artifact review is still in progress. Use the recommended action and blocked claims below "
        "instead of inferring readiness from local files."
    )


def main() -> int:
    if len(sys.argv) != 9:
        print(
            "usage: episode1_artifact_review_handoff.py status.json review-station.json tail-candidate.json tail-sanity.json tail-promotion-current.json current-watch-decision.json output.json output.md",
            file=sys.stderr,
        )
        return 2

    (
        status_path,
        review_station_path,
        tail_candidate_path,
        tail_sanity_path,
        promotion_path,
        current_decision_path,
        output_json,
        output_md,
    ) = sys.argv[1:9]

    status = load_optional_json(status_path)
    review_station = load_optional_json(review_station_path)
    tail_candidate = load_optional_json(tail_candidate_path)
    tail_sanity = load_optional_json(tail_sanity_path)
    promotion = load_optional_json(promotion_path)
    current_decision = load_optional_json(current_decision_path)
    recommended = (status or {}).get("recommendedImmediateAction") or {}

    packet = {
        "packetType": "quipsly-episode1-artifact-review-handoff",
        "version": "2026-06-20.artifact-review-handoff.v1",
        "projectSlug": "high-ground-odyssey-manuscript",
        "episodeSlug": "episode-1",
        "generatedAt": now_iso(),
        "currentState": (status or {}).get("status", "unknown"),
        "plainEnglishState": plain_state(status, promotion),
        "statusPacketPath": status_path if status else None,
        "statusPacket": status,
        "reviewStationPacket": review_station_path if review_station else None,
        "reviewStationHtml": (review_station or {}).get("reviewStationHtml"),
        "watchListenWorksheet": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/studio-proof/episode-1-artifact-watch-listen-review.md",
        "tailTrimCandidatePacket": tail_candidate_path if tail_candidate else None,
        "tailTrimCandidateStatus": (tail_candidate or {}).get("status"),
        "tailTrimCandidateArtifacts": artifact_paths_from_candidate(tail_candidate),
        "tailTrimCandidateSanityPacket": tail_sanity_path if tail_sanity else None,
        "tailTrimCandidateSanityStatus": (tail_sanity or {}).get("status"),
        "tailTrimCandidateSanityErrors": (tail_sanity or {}).get("errorCount"),
        "tailTrimCandidateSanityWarnings": (tail_sanity or {}).get("warningCount"),
        "contactSheets": sanity_contact_sheets(tail_sanity),
        "tailTrimPromotionDecisionPath": promotion_path if promotion else None,
        "tailTrimPromotionDecision": promotion,
        "artifactWatchListenDecisionPath": current_decision_path if current_decision else None,
        "artifactWatchListenDecision": current_decision,
        "recommendedImmediateAction": recommended,
        "safeCommands": safe_commands(status),
        "blockedClaims": [
            "Do not claim artifact-ready until watch/listen review is completed against the selected artifact set.",
            "Do not claim publication-ready until destination copy, writing/canon state, selected shorts, schedule/queue state, and receipt targets are reviewed.",
            "Do not claim published until external URLs or provider ids are captured as receipts.",
            "Do not treat candidate generation, machine sanity, contact sheets, or this handoff packet as approval.",
        ],
        "truth": "This handoff bundle is a read-only coordination packet. It does not generate media, select candidates, approve artifacts, publish, upload, schedule, or capture receipts.",
    }

    write_json(output_json, packet)
    os.makedirs(os.path.dirname(output_md) or ".", exist_ok=True)
    with open(output_md, "w", encoding="utf-8") as handle:
        handle.write(markdown(packet))

    print(
        json.dumps(
            {
                "packetType": "quipsly-episode1-artifact-review-handoff-result",
                "status": packet["currentState"],
                "handoff": output_json,
                "markdown": output_md,
                "recommendedImmediateAction": recommended,
                "truth": packet["truth"],
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
