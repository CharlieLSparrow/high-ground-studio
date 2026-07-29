#!/usr/bin/env python3
"""Read back long-form episode package readiness.

This is a calm cockpit view over the existing release review board and package
validation report. It creates no exports and no publication truth.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
REQUIRED_PLATFORMS = (
    "YouTube",
    "Podcast/RSS",
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
    "HighGroundOdyssey.com",
)


def load_json(path: str | Path) -> dict[str, Any]:
    candidate = Path(path)
    if not candidate.exists():
        return {}
    try:
        data = json.loads(candidate.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def path_ready(path_value: str) -> bool:
    if not path_value:
        return False
    path = Path(path_value)
    return path.exists() and path.stat().st_size > 0


def validation_by_episode(validation: dict[str, Any]) -> dict[int, dict[str, Any]]:
    result: dict[int, dict[str, Any]] = {}
    for item in as_list(validation.get("episodes")):
        if not isinstance(item, dict):
            continue
        try:
            episode = int(item.get("episode"))
        except (TypeError, ValueError):
            continue
        result[episode] = item
    return result


def artifact_from_board(ep: dict[str, Any], key: str) -> dict[str, Any]:
    artifacts = as_dict(ep.get("artifacts"))
    artifact = as_dict(artifacts.get(key))
    return {
        "label": artifact.get("label") or key,
        "path": artifact.get("path") or "",
        "exists": bool(artifact.get("exists")) if "exists" in artifact else path_ready(str(artifact.get("path") or "")),
        "durationSeconds": artifact.get("durationSeconds") or 0,
        "hasAudio": bool(artifact.get("hasAudio")),
        "hasVideo": bool(artifact.get("hasVideo")),
        "status": artifact.get("status") or "",
    }


def artifact_from_validation(validation_ep: dict[str, Any], label: str) -> dict[str, Any]:
    for check in as_list(validation_ep.get("checks")):
        if not isinstance(check, dict):
            continue
        if str(check.get("label") or "").lower() == label.lower():
            return {
                "label": check.get("label") or label,
                "path": check.get("path") or "",
                "exists": bool(check.get("exists")),
                "durationSeconds": check.get("durationSeconds") or 0,
                "hasAudio": bool(check.get("hasAudio")),
                "hasVideo": bool(check.get("hasVideo")),
                "status": check.get("status") or check.get("artifactStatus") or "",
                "aspectStatus": as_dict(check.get("aspectCheck")).get("status") or "",
            }
    return {}


def first_nonempty(*values: dict[str, Any]) -> dict[str, Any]:
    for value in values:
        if value:
            return value
    return {}


def build_episode_item(ep: dict[str, Any], validation_ep: dict[str, Any]) -> dict[str, Any]:
    episode = ep.get("episode")
    version = ep.get("version") or validation_ep.get("version") or ""
    receipt_status = ep.get("publicationReceiptStatus") or validation_ep.get("receiptStatus") or "no platform receipts captured"
    platforms = sorted(set(as_dict(ep.get("platformPrep")).get("readyPlatforms") or []))
    missing_platforms = [platform for platform in REQUIRED_PLATFORMS if platform not in platforms]
    long_16 = first_nonempty(
        artifact_from_board(ep, "longForm16x9"),
        artifact_from_validation(validation_ep, "Long-form 16:9 video"),
    )
    long_9 = first_nonempty(
        artifact_from_board(ep, "longForm9x16"),
        artifact_from_validation(validation_ep, "Long-form 9:16 video"),
    )
    audio = first_nonempty(
        artifact_from_board(ep, "podcastAudio"),
        artifact_from_validation(validation_ep, "Audio-only podcast/RSS"),
    )
    blockers = [str(item) for item in as_list(validation_ep.get("blockers")) if item]
    warnings = [str(item) for item in as_list(ep.get("warnings")) if item]
    for warning in as_list(validation_ep.get("warnings")):
        if warning:
            warnings.append(str(warning))
    warnings = list(dict.fromkeys(warnings))
    missing_artifacts = []
    for key, artifact in {
        "longForm16x9": long_16,
        "longForm9x16": long_9,
        "podcastAudio": audio,
    }.items():
        if not path_ready(str(artifact.get("path") or "")):
            missing_artifacts.append(key)
    ready_short_count = int(validation_ep.get("readyShortCount") if validation_ep.get("readyShortCount") is not None else ep.get("readyShortCount") or 0)
    short_count = int(validation_ep.get("shortCount") if validation_ep.get("shortCount") is not None else ep.get("shortCount") or 0)
    duration_spread = float(ep.get("longFormDurationSpreadSeconds") or validation_ep.get("longFormDurationSpreadSeconds") or 0)
    false_publication_flags = []
    if receipt_status != "no platform receipts captured":
        false_publication_flags.append("receipt-status-not-empty")
    if blockers or missing_artifacts or missing_platforms:
        status = "needs-attention"
    elif warnings:
        status = "ready-for-watch-listen-with-warnings"
    else:
        status = "ready-for-watch-listen"
    return {
        "episode": episode,
        "version": version,
        "status": status,
        "boardStatus": ep.get("status") or "",
        "validationStatus": validation_ep.get("status") or "",
        "versionDir": ep.get("versionDir") or validation_ep.get("versionDir") or "",
        "manifestPath": ep.get("manifestPath") or str(Path(str(ep.get("versionDir") or "")) / "manifest.json"),
        "notesPath": ep.get("notesPath") or str(Path(str(ep.get("versionDir") or "")) / "notes.md"),
        "syncGapReportPath": ep.get("syncGapReportPath") or str(Path(str(ep.get("versionDir") or "")) / "sync-gap-report.md"),
        "artifacts": {
            "longForm16x9": long_16,
            "longForm9x16": long_9,
            "podcastAudio": audio,
        },
        "readyShortCount": ready_short_count,
        "shortCount": short_count,
        "platformsReady": platforms,
        "missingPlatforms": missing_platforms,
        "blockers": blockers,
        "warnings": warnings,
        "missingArtifacts": missing_artifacts,
        "durationSpreadSeconds": duration_spread,
        "durationReviewNeeded": duration_spread > 0.5,
        "publicationReceiptStatus": receipt_status,
        "falsePublicationFlags": false_publication_flags,
        "nextSafestAction": ep.get("nextSafestAction") or validation_ep.get("nextSafestAction") or "Open current package, watch/listen, and record approve/refine before publishing.",
    }


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    root = Path(args.root).expanduser().resolve()
    board_path = root / "review-board" / "review-board.json"
    validation_path = root / "review-board" / "release-validation.json"
    board = load_json(board_path)
    validation = load_json(validation_path)
    validation_index = validation_by_episode(validation)
    episodes = [
        build_episode_item(ep, validation_index.get(int(ep.get("episode") or 0), {}))
        for ep in as_list(board.get("episodes"))
        if isinstance(ep, dict)
    ]
    if args.episode:
        wanted = {int(value) for value in args.episode}
        episodes = [ep for ep in episodes if int(ep.get("episode") or 0) in wanted]
    ready = sum(1 for ep in episodes if ep.get("status") == "ready-for-watch-listen")
    warning_ready = sum(1 for ep in episodes if ep.get("status") == "ready-for-watch-listen-with-warnings")
    needs_attention = sum(1 for ep in episodes if ep.get("status") == "needs-attention")
    false_flags = sorted({flag for ep in episodes for flag in ep.get("falsePublicationFlags", [])})
    status = "episode-package-readback-ready" if episodes and needs_attention == 0 and not false_flags else "episode-package-readback-needs-attention"
    return {
        "status": status,
        "root": str(root),
        "sources": {
            "reviewBoardPath": str(board_path),
            "reviewBoardExists": bool(board),
            "releaseValidationPath": str(validation_path),
            "releaseValidationExists": bool(validation),
            "releaseValidationGeneratedAt": validation.get("generatedAt") or "",
        },
        "counts": {
            "episodes": len(episodes),
            "readyForWatchListen": ready,
            "readyForWatchListenWithWarnings": warning_ready,
            "needsAttention": needs_attention,
            "falsePublicationFlags": false_flags,
            "noReceiptsClaimed": all(ep.get("publicationReceiptStatus") == "no platform receipts captured" for ep in episodes),
        },
        "episodes": episodes,
        "nextSafestAction": next_action(episodes),
        "truth": "Readback only. It does not export, approve, upload, schedule, publish, mutate source media, overwrite versions, mutate accounts, or create receipt truth.",
    }


def next_action(episodes: list[dict[str, Any]]) -> str:
    for episode in episodes:
        if episode.get("status") == "needs-attention":
            return f"Episode {int(episode.get('episode') or 0):02d}: resolve blockers/missing artifacts before publication review."
    for episode in episodes:
        if episode.get("durationReviewNeeded"):
            return f"Episode {int(episode.get('episode') or 0):02d}: watch/listen duration mismatch before publication."
    if episodes:
        return "Open current-best packages and do human watch/listen approval before any upload."
    return "No episode packages found. Regenerate the release review board."


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Episode package readback",
        "",
        f"Status: `{payload.get('status')}`",
        f"Episodes: `{payload.get('counts', {}).get('episodes')}`",
        f"Ready: `{payload.get('counts', {}).get('readyForWatchListen')}`",
        f"Ready with warnings: `{payload.get('counts', {}).get('readyForWatchListenWithWarnings')}`",
        f"Needs attention: `{payload.get('counts', {}).get('needsAttention')}`",
        f"False publication flags: `{', '.join(payload.get('counts', {}).get('falsePublicationFlags') or []) or 'none'}`",
        f"No receipts claimed: `{payload.get('counts', {}).get('noReceiptsClaimed')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
    ]
    for ep in as_list(payload.get("episodes")):
        artifacts = as_dict(ep.get("artifacts"))
        lines.extend(
            [
                f"## Episode {int(ep.get('episode') or 0):02d} `{ep.get('version')}`",
                "",
                f"- Status: `{ep.get('status')}`",
                f"- Board/validation: `{ep.get('boardStatus')}` / `{ep.get('validationStatus')}`",
                f"- Version dir: `{ep.get('versionDir')}`",
                f"- Shorts: `{ep.get('readyShortCount')}/{ep.get('shortCount')}`",
                f"- Platforms: `{len(ep.get('platformsReady') or [])}/8`",
                f"- Missing platforms: `{', '.join(ep.get('missingPlatforms') or []) or 'none'}`",
                f"- Missing artifacts: `{', '.join(ep.get('missingArtifacts') or []) or 'none'}`",
                f"- Duration spread: `{ep.get('durationSpreadSeconds')}` seconds",
                f"- Receipt status: `{ep.get('publicationReceiptStatus')}`",
                f"- 16:9: `{as_dict(artifacts.get('longForm16x9')).get('path') or ''}`",
                f"- 9:16: `{as_dict(artifacts.get('longForm9x16')).get('path') or ''}`",
                f"- Podcast audio: `{as_dict(artifacts.get('podcastAudio')).get('path') or ''}`",
                f"- Blockers: `{'; '.join(ep.get('blockers') or []) or 'none'}`",
                f"- Warnings: `{'; '.join(ep.get('warnings') or []) or 'none'}`",
                f"- Next: {ep.get('nextSafestAction')}",
                "",
            ]
        )
    lines.extend(["## Truth boundary", "", str(payload.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Read back Quipsly long-form episode package readiness.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--episode", action="append", default=[], help="Episode number to include. Repeatable.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()
    payload = build_payload(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0 if payload.get("status") == "episode-package-readback-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
