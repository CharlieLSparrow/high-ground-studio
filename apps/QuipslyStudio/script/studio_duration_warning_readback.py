#!/usr/bin/env python3
"""Read back duration warnings without creating a second source of truth.

This is a front door over the existing duration decision sheet, repair
workorders, candidate review packets, sync investigation packets, release
validation, and review board. It creates no exports and no publication truth.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")


def now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: str | Path) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.exists():
        return {}
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def load_pointer_payload(*paths: Path) -> tuple[dict[str, Any], str]:
    for path in paths:
        pointer_or_payload = load_json(path)
        if not pointer_or_payload:
            continue
        payload_path = pointer_or_payload.get("jsonPath")
        if isinstance(payload_path, str) and payload_path:
            payload = load_json(payload_path)
            if payload:
                return payload, str(path)
        return pointer_or_payload, str(path)
    return {}, ""


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def path_ready(path_value: str | None) -> bool:
    if not path_value:
        return False
    path = Path(path_value)
    return path.exists() and path.stat().st_size > 0


def by_episode(items: list[Any]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for item in items:
        if not isinstance(item, dict):
            continue
        try:
            episode = int(item.get("episode"))
        except (TypeError, ValueError):
            continue
        result[episode] = item
    return result


def board_by_episode(board: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return by_episode(as_list(board.get("episodes")))


def validation_by_episode(validation: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return by_episode(as_list(validation.get("episodes")))


def decision_by_episode(decision_sheet: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return by_episode(as_list(decision_sheet.get("episodes")))


def first_path(*payloads: dict[str, Any], key: str) -> str:
    for payload in payloads:
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return ""


def artifact_duration_from_board(ep: dict[str, Any], artifact_key: str) -> float:
    artifact = as_dict(as_dict(ep.get("artifacts")).get(artifact_key))
    try:
        return float(artifact.get("durationSeconds") or 0)
    except (TypeError, ValueError):
        return 0.0


def artifact_path_from_board(ep: dict[str, Any], artifact_key: str) -> str:
    artifact = as_dict(as_dict(ep.get("artifacts")).get(artifact_key))
    return str(artifact.get("path") or "")


def format_seconds(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0))
    minutes, secs = divmod(round(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"


def candidate_review_for_episode(candidate_review: dict[str, Any], episode: int) -> dict[str, Any]:
    try:
        candidate_episode = int(candidate_review.get("episode"))
    except (TypeError, ValueError):
        return {}
    if candidate_episode != episode:
        return {}
    return candidate_review


def repair_workorder_has_episode(repair_workorders: dict[str, Any], episode: int) -> bool:
    for item in as_list(repair_workorders.get("episodes")):
        if isinstance(item, int) and item == episode:
            return True
        if isinstance(item, dict):
            try:
                if int(item.get("episode")) == episode:
                    return True
            except (TypeError, ValueError):
                continue
    return False


def sync_investigation_for_episode(sync_investigation: dict[str, Any], episode: int) -> dict[str, Any]:
    if not sync_investigation:
        return {}
    try:
        direct_episode = int(sync_investigation.get("episode"))
    except (TypeError, ValueError):
        direct_episode = 0
    if direct_episode == episode:
        return sync_investigation
    for key in ("episodes", "items", "investigations"):
        for item in as_list(sync_investigation.get(key)):
            if not isinstance(item, dict):
                continue
            try:
                if int(item.get("episode")) == episode:
                    return item
            except (TypeError, ValueError):
                continue
    return {}


def classify_episode(
    episode: int,
    board_ep: dict[str, Any],
    validation_ep: dict[str, Any],
    decision_ep: dict[str, Any],
    candidate_review: dict[str, Any],
    repair_workorders: dict[str, Any],
    sync_investigation: dict[str, Any],
) -> dict[str, Any]:
    candidate = candidate_review_for_episode(candidate_review, episode)
    sync_packet = sync_investigation_for_episode(sync_investigation, episode)
    workorder_exists = repair_workorder_has_episode(repair_workorders, episode)
    spread = float(
        board_ep.get("longFormDurationSpreadSeconds")
        or validation_ep.get("longFormDurationSpreadSeconds")
        or decision_ep.get("spreadSeconds")
        or 0
    )
    urgency = str(decision_ep.get("urgency") or ("major-duration-review" if spread >= 600 else "duration-review"))
    version = str(board_ep.get("version") or validation_ep.get("version") or decision_ep.get("version") or "")
    classification = "duration-review-needed"
    evidence_available = False
    evidence_paths: dict[str, str] = {}
    next_command = "./script/agentctl.sh studio-duration-warning-review-packet"
    next_action = (
        decision_ep.get("nextSafestAction")
        or board_ep.get("nextSafestAction")
        or "Open duration evidence, watch/listen, and decide approve/refine/hold before publishing."
    )
    if candidate:
        classification = "candidate-review-first"
        evidence_available = True
        evidence_paths = {
            "html": str(candidate.get("htmlPath") or ""),
            "json": str(candidate.get("jsonPath") or ""),
            "markdown": str(candidate.get("markdownPath") or ""),
            "candidateManifest": str(candidate.get("candidateManifestPath") or ""),
            "candidateDir": str(candidate.get("candidateDir") or ""),
        }
        next_command = "./script/agentctl.sh studio-duration-candidate-review latest"
        next_action = str(
            candidate.get("nextSafestAction")
            or "Open the duration candidate review before promoting or rejecting the candidate."
        )
    elif sync_packet:
        classification = "sync-investigation-first"
        evidence_available = True
        evidence_paths = {
            "html": str(sync_packet.get("htmlPath") or sync_investigation.get("htmlPath") or ""),
            "json": str(sync_packet.get("jsonPath") or sync_investigation.get("jsonPath") or ""),
            "markdown": str(sync_packet.get("markdownPath") or sync_investigation.get("markdownPath") or ""),
        }
        next_command = "./script/agentctl.sh studio-sync-investigation latest"
        next_action = str(sync_packet.get("nextSafestAction") or "Open sync investigation evidence before repair.")
    elif "major" in urgency or spread >= 600:
        classification = "sync-investigation-needed"
        next_command = "./script/agentctl.sh studio-sync-investigation latest"
        next_action = "Generate/open sync investigation evidence before trimming or approving this major duration mismatch."
    elif workorder_exists:
        classification = "candidate-workorder-available"
        evidence_available = True
        evidence_paths = {
            "html": str(repair_workorders.get("htmlPath") or ""),
            "json": str(repair_workorders.get("jsonPath") or ""),
            "markdown": str(repair_workorders.get("markdownPath") or ""),
        }
        next_command = "./script/agentctl.sh studio-duration-repair-workorders"
        next_action = str(repair_workorders.get("nextSafestAction") or next_action)
    return {
        "episode": episode,
        "version": version,
        "classification": classification,
        "urgency": urgency,
        "spreadSeconds": round(spread, 3),
        "spreadLabel": str(decision_ep.get("spreadLabel") or format_seconds(spread)),
        "status": "warning-actionable" if evidence_available else "warning-needs-evidence",
        "boardStatus": board_ep.get("status") or "",
        "validationStatus": validation_ep.get("status") or "",
        "primaryDecision": decision_ep.get("primaryDecision") or "",
        "nextSafestAction": next_action,
        "nextCommand": next_command,
        "evidenceAvailable": evidence_available,
        "evidencePaths": evidence_paths,
        "artifactDurations": {
            "longForm16x9": artifact_duration_from_board(board_ep, "longForm16x9"),
            "longForm9x16": artifact_duration_from_board(board_ep, "longForm9x16"),
            "podcastAudio": artifact_duration_from_board(board_ep, "podcastAudio"),
        },
        "artifactPaths": {
            "longForm16x9": artifact_path_from_board(board_ep, "longForm16x9"),
            "longForm9x16": artifact_path_from_board(board_ep, "longForm9x16"),
            "podcastAudio": artifact_path_from_board(board_ep, "podcastAudio"),
        },
        "unsafeActions": unsafe_actions_for(classification),
    }


def unsafe_actions_for(classification: str) -> list[str]:
    shared = [
        "Do not upload, schedule, publish, or claim receipt truth from duration-warning evidence.",
        "Do not overwrite previous versions or mutate original source media.",
    ]
    if classification == "candidate-review-first":
        return [
            "Do not approve Tower artifacts directly from a duration-candidate packet.",
            "Do not promote the candidate without watch/listen review.",
            *shared,
        ]
    if classification == "sync-investigation-needed":
        return [
            "Do not blind-trim a major audio/video mismatch.",
            "Do not mark the package clean until sync/content evidence explains the spread.",
            *shared,
        ]
    return [
        "Do not silence the warning without watch/listen evidence.",
        *shared,
    ]


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser().resolve()
    review_root = root / "review-board"
    board_path = review_root / "review-board.json"
    validation_path = review_root / "release-validation.json"
    decision_path = review_root / "duration-decision-sheets" / "latest-duration-decision-sheet.json"
    repair_workorders_path = review_root / "latest-duration-repair-workorders.json"
    candidate_review_path = review_root / "duration-candidate-reviews" / "latest-duration-candidate-review.json"
    sync_investigation_paths = [
        review_root / "sync-investigations" / "latest-studio-sync-investigation.json",
        review_root / "sync-investigations" / "latest-sync-investigation.json",
        review_root / "latest-sync-investigation.json",
    ]
    board = load_json(board_path)
    validation = load_json(validation_path)
    decision_sheet = load_json(decision_path)
    repair_workorders = load_json(repair_workorders_path)
    candidate_review = load_json(candidate_review_path)
    sync_investigation, sync_investigation_pointer = load_pointer_payload(*sync_investigation_paths)
    board_index = board_by_episode(board)
    validation_index = validation_by_episode(validation)
    decision_index = decision_by_episode(decision_sheet)
    warning_episodes = sorted(
        {
            int(value)
            for value in as_list(validation.get("warningEpisodes"))
            if isinstance(value, int) or (isinstance(value, str) and value.isdigit())
        }
        | set(decision_index.keys())
    )
    if args.episode:
        wanted = {int(value) for value in args.episode}
        warning_episodes = [episode for episode in warning_episodes if episode in wanted]
    episodes = [
        classify_episode(
            episode,
            board_index.get(episode, {}),
            validation_index.get(episode, {}),
            decision_index.get(episode, {}),
            candidate_review,
            repair_workorders,
            sync_investigation,
        )
        for episode in warning_episodes
    ]
    false_flags = []
    for payload in (candidate_review, repair_workorders):
        for key in ("externalPublishing", "receiptTruthCreated", "sourceFilesMutated", "versionsOverwritten", "originalMediaMutated"):
            if payload.get(key):
                false_flags.append(f"{Path(first_path(payload, key='jsonPath') or '').name or 'duration-evidence'}:{key}")
    payload = {
        "status": "duration-warning-readback-ready" if episodes and not false_flags else "duration-warning-readback-needs-attention",
        "generatedAt": iso_now(),
        "root": str(root),
        "sources": {
            "reviewBoardPath": str(board_path),
            "releaseValidationPath": str(validation_path),
            "durationDecisionSheetPath": str(decision_path),
            "durationRepairWorkordersPath": str(repair_workorders_path),
            "durationCandidateReviewPath": str(candidate_review_path),
            "syncInvestigationPath": sync_investigation_pointer or str(sync_investigation_paths[0]),
            "syncInvestigationExists": bool(sync_investigation),
        },
        "counts": {
            "warningEpisodes": len(episodes),
            "candidateReviewFirst": [ep["episode"] for ep in episodes if ep.get("classification") == "candidate-review-first"],
            "syncInvestigationNeeded": [ep["episode"] for ep in episodes if ep.get("classification") == "sync-investigation-needed"],
            "evidenceAvailable": sum(1 for ep in episodes if ep.get("evidenceAvailable")),
            "evidenceMissing": sum(1 for ep in episodes if not ep.get("evidenceAvailable")),
            "falseSafetyFlags": false_flags,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
        "episodes": episodes,
        "nextSafestAction": next_safest_action(episodes),
        "truth": "Readback only. It does not export, approve, upload, schedule, publish, mutate source media, overwrite versions, mutate accounts, silence warnings, or create receipt truth.",
    }
    if args.write:
        write_payload(root, payload)
    return payload


def next_safest_action(episodes: list[dict[str, Any]]) -> str:
    for episode in episodes:
        if episode.get("classification") == "sync-investigation-needed":
            return f"Episode {int(episode.get('episode') or 0):02d}: run/open sync investigation before any repair or approval."
    for episode in episodes:
        if episode.get("classification") == "candidate-review-first":
            return f"Episode {int(episode.get('episode') or 0):02d}: review the duration candidate packet before promotion."
    if episodes:
        return "Open duration warning evidence, watch/listen, and record approve/refine/hold locally."
    return "No warning episodes found. Regenerate release validation and duration decision sheets if this seems wrong."


def write_payload(root: Path, payload: dict[str, Any]) -> None:
    out_root = root / "review-board" / "duration-warning-readback"
    out_dir = out_root / f"{now_stamp()}-duration-warning-readback"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "duration-warning-readback.json"
    md_path = out_dir / "START-HERE-duration-warning-readback.md"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {
        "status": payload.get("status"),
        "generatedAt": payload.get("generatedAt"),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "counts": payload.get("counts"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "truth": payload.get("truth"),
    }
    (out_root / "latest-duration-warning-readback.json").write_text(
        json.dumps(pointer, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    payload["artifactPaths"] = {"json": str(json_path), "markdown": str(md_path)}


def render_markdown(payload: dict[str, Any]) -> str:
    counts = as_dict(payload.get("counts"))
    lines = [
        "# Duration warning readback",
        "",
        f"Status: `{payload.get('status')}`",
        f"Warning episodes: `{counts.get('warningEpisodes')}`",
        f"Candidate review first: `{', '.join(str(x) for x in counts.get('candidateReviewFirst') or []) or 'none'}`",
        f"Sync investigation needed: `{', '.join(str(x) for x in counts.get('syncInvestigationNeeded') or []) or 'none'}`",
        f"Evidence available/missing: `{counts.get('evidenceAvailable')}` / `{counts.get('evidenceMissing')}`",
        f"False safety flags: `{', '.join(counts.get('falseSafetyFlags') or []) or 'none'}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
    ]
    for episode in as_list(payload.get("episodes")):
        evidence_paths = as_dict(episode.get("evidencePaths"))
        lines.extend(
            [
                f"## Episode {int(episode.get('episode') or 0):02d} `{episode.get('version')}`",
                "",
                f"- Classification: `{episode.get('classification')}`",
                f"- Status: `{episode.get('status')}`",
                f"- Spread: `{episode.get('spreadLabel')}` / `{episode.get('spreadSeconds')}s`",
                f"- Board/validation: `{episode.get('boardStatus')}` / `{episode.get('validationStatus')}`",
                f"- Primary decision: {episode.get('primaryDecision') or 'Open duration evidence and decide locally.'}",
                f"- Evidence available: `{episode.get('evidenceAvailable')}`",
                f"- Evidence HTML: `{evidence_paths.get('html') or 'none'}`",
                f"- Next command: `{episode.get('nextCommand')}`",
                f"- Next safest action: {episode.get('nextSafestAction')}",
                f"- Unsafe actions: `{'; '.join(episode.get('unsafeActions') or [])}`",
                "",
            ]
        )
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Read back duration-warning readiness without creating publication truth.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT), help="Episode_and_Shorts_Test release root.")
    parser.add_argument("--episode", action="append", type=int, help="Limit to a warning episode number. Can repeat.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--write", action="store_true", help="Write a versioned readback packet and latest pointer.")
    args = parser.parse_args()
    payload = build_payload(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "duration-warning-readback-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
