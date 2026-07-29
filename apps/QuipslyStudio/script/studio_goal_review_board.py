#!/usr/bin/env python3
"""Goal-shaped review board for Quipsly Studio Episodes 1-6.

This is intentionally read-only by default. It scans local versioned export
packages and reports review readiness without claiming upload, publication, or
human approval. It exists to keep Episodes 1-3, 5, and 6 moving while Episode 4
waits on missing watched/source clips.
"""
from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

DEFAULT_ROOT = Path(os.environ.get("QUIPSLY_EPISODE_EXPORT_ROOT", "/Volumes/My Passport/Episode_and_Shorts_Test"))
DEFAULT_SHORTS_START_HERE_BASENAME = "quipsly-studio-shorts-review-start-here"
PROOF_LANES = [1, 2, 3, 5, 6]
ALL_EPISODES = [1, 2, 3, 4, 5, 6]
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v"}
AUDIO_EXTENSIONS = {".m4a", ".mp3", ".wav", ".aac", ".flac"}


@dataclass
class EpisodeGoalState:
    episode: int
    folder: str
    status: str
    current_version: str
    current_version_path: str
    version_count: int
    longform_16x9: list[str] = field(default_factory=list)
    vertical_9x16: list[str] = field(default_factory=list)
    podcast_audio: list[str] = field(default_factory=list)
    shorts: list[str] = field(default_factory=list)
    carryforward_shorts: list[str] = field(default_factory=list)
    review_workorders: list[str] = field(default_factory=list)
    review_pages: list[str] = field(default_factory=list)
    review_theaters: list[str] = field(default_factory=list)
    contact_sheets: list[str] = field(default_factory=list)
    contact_sheet_frames: list[str] = field(default_factory=list)
    next_review_cards: list[str] = field(default_factory=list)
    review_decisions: list[str] = field(default_factory=list)
    review_decision_summaries: list[str] = field(default_factory=list)
    manifests: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    sync_reports: list[str] = field(default_factory=list)
    publication_packets: list[str] = field(default_factory=list)
    next_review_target: dict[str, Any] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    next_action: str = ""
    truth: str = "Local export/package readiness only. This is not human approval or publication receipt truth."


def version_sort_key(path: Path) -> tuple[int, str]:
    match = re.search(r"v(\d+)", path.name, flags=re.IGNORECASE)
    return (int(match.group(1)) if match else -1, path.name)


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def file_status(path: Path, root: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "relativePath": rel(path, root),
        "exists": path.exists(),
        "openCommand": f"open '{str(path).replace(chr(39), chr(39) + chr(34) + chr(39) + chr(34) + chr(39))}'" if path.exists() else "",
    }


def read_json_object(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def episode_folder(root: Path, episode: int) -> Path:
    candidates = [
        root / f"Episode_{episode:02d}",
        root / f"Episode_{episode}",
        root / f"episode-{episode}",
        root / f"episode_{episode:02d}",
    ]
    return next((candidate for candidate in candidates if candidate.exists()), candidates[0])


def version_dirs(folder: Path) -> list[Path]:
    if not folder.exists():
        return []
    dirs = [path for path in folder.iterdir() if path.is_dir() and path.name.lower().startswith("v")]
    return sorted(dirs, key=version_sort_key)


def classify_files(version: Path, root: Path) -> dict[str, list[str]]:
    files = [path for path in version.rglob("*") if path.is_file()]
    payload = {
        "longform_16x9": [],
        "vertical_9x16": [],
        "podcast_audio": [],
        "shorts": [],
        "carryforward_shorts": [],
        "review_workorders": [],
        "review_pages": [],
        "review_theaters": [],
        "contact_sheets": [],
        "contact_sheet_frames": [],
        "next_review_cards": [],
        "review_decisions": [],
        "review_decision_summaries": [],
        "manifests": [],
        "notes": [],
        "sync_reports": [],
        "publication_packets": [],
    }

    for path in files:
        name = path.name.lower()
        suffix = path.suffix.lower()
        display = rel(path, root)
        is_review_decision = "review-decision" in name or "review-decisions" in name
        is_review_decision_summary = is_review_decision and "summary" in name
        if suffix in VIDEO_EXTENSIONS:
            is_short = is_short_video(path)
            if is_short:
                payload["shorts"].append(display)
            elif "16x9" in name or "16:9" in name:
                payload["longform_16x9"].append(display)
            elif "9x16" in name or "9:16" in name:
                payload["vertical_9x16"].append(display)
        elif suffix in AUDIO_EXTENSIONS and any(token in name for token in ["podcast", "audio", "rss"]):
            payload["podcast_audio"].append(display)
        elif suffix == ".json" and any(token in name for token in ["manifest", "packet", "cockpit", "receipt", "validation", "workorder"]):
            if "carryforward" in name and "short" in name:
                payload["carryforward_shorts"].extend(carryforward_short_refs(path, root))
            if "workorder" in name and not is_review_decision:
                payload["review_workorders"].append(display)
            if is_review_decision_summary:
                payload["review_decision_summaries"].append(display)
            elif is_review_decision:
                payload["review_decisions"].append(display)
            if "publish" in name or "publication" in name or "podcast" in name or "delivery" in name:
                payload["publication_packets"].append(display)
            if "manifest" in name:
                payload["manifests"].append(display)
        elif suffix == ".md":
            if "next-carryforward-short-review-card" in name:
                payload["next_review_cards"].append(display)
            if "workorder" in name and not is_review_decision:
                payload["review_workorders"].append(display)
            if is_review_decision_summary:
                payload["review_decision_summaries"].append(display)
            elif is_review_decision:
                payload["review_decisions"].append(display)
            if "sync" in name or "missing" in name:
                payload["sync_reports"].append(display)
            if any(token in name for token in ["note", "start-here", "summary", "cockpit", "readme"]):
                payload["notes"].append(display)
            if "publish" in name or "publication" in name or "podcast" in name or "cockpit" in name:
                payload["publication_packets"].append(display)
        elif suffix == ".jsonl":
            if is_review_decision:
                payload["review_decisions"].append(display)
        elif suffix == ".html":
            if "next-carryforward-short-review-card" in name:
                payload["next_review_cards"].append(display)
            elif "contact-sheet" in name:
                payload["contact_sheets"].append(display)
            elif "review-theater" in name:
                payload["review_theaters"].append(display)
            elif "review" in name or "workorder" in name:
                payload["review_pages"].append(display)
        elif suffix in {".json", ".md"} and "next-carryforward-short-review-card" in name:
            payload["next_review_cards"].append(display)
        elif suffix in {".jpg", ".jpeg", ".png"}:
            if "contact-sheet" in [part.lower() for part in path.parts]:
                payload["contact_sheet_frames"].append(display)

    for values in payload.values():
        values.sort()
    return payload


def carryforward_short_refs(path: Path, root: Path) -> list[str]:
    display = rel(path, root)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return [display]

    candidates = data.get("candidates")
    if not isinstance(candidates, list):
        candidates = data.get("shortCandidates")
    if not isinstance(candidates, list):
        return [display]

    refs: list[str] = []
    for index, candidate in enumerate(candidates, start=1):
        if isinstance(candidate, dict):
            label = (
                candidate.get("title")
                or candidate.get("label")
                or candidate.get("filename")
                or candidate.get("sourcePath")
                or f"candidate-{index:02d}"
            )
        else:
            label = str(candidate)
        refs.append(f"{display}::{index:02d}:{label}")
    return refs or [display]


def is_short_video(path: Path) -> bool:
    name = path.name.lower()
    parts = {part.lower() for part in path.parts}
    if "short" in name:
        return True
    if {"shorts", "clips", "social-ready", "social-publication-queue", "top-12-first-posting-batch"} & parts:
        return True
    return False


def next_review_target_for(version: Path | None, root: Path) -> dict[str, Any]:
    if not version:
        return {}
    summaries = sorted(version.rglob("*review-decisions-summary.json"))
    for summary_path in summaries:
        try:
            data = json.loads(summary_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        candidate = data.get("nextCandidate")
        if not isinstance(candidate, dict) or not candidate:
            continue
        payload = dict(candidate)
        payload["summaryPath"] = rel(summary_path, root)
        payload["reviewedCandidates"] = data.get("reviewedCandidates", 0)
        payload["pendingCandidates"] = data.get("pendingCandidates", 0)
        payload["nextSafestAction"] = data.get("nextSafestAction", "")
        payload["truth"] = "Suggested next review target only. This is not an editorial decision, approval, export, or publication receipt."
        return payload
    return {}


def status_for(episode: int, folder: Path, versions: list[Path], files: dict[str, list[str]]) -> tuple[str, list[str], str]:
    warnings: list[str] = []
    if not folder.exists():
        return "missing-folder", ["episode export folder is missing"], "Create or locate the episode export package folder, then rerun the board."
    if not versions:
        return "needs-versioned-export", ["no versioned package folder found"], "Create the first non-overwriting versioned export package."

    has_16x9 = bool(files["longform_16x9"])
    has_audio = bool(files["podcast_audio"])
    short_count = len(files["shorts"])
    carryforward_count = len(files["carryforward_shorts"])
    has_manifest = bool(files["manifests"])
    has_notes = bool(files["notes"])
    has_sync = bool(files["sync_reports"])
    has_packets = bool(files["publication_packets"])

    if not has_16x9:
        warnings.append("missing 16:9 long-form video")
    if not has_audio:
        warnings.append("missing audio-only podcast file")
    if short_count < 5:
        if carryforward_count >= 5:
            warnings.append(
                f"only {short_count} native current-version short(s); {carryforward_count} carry-forward short candidate(s) need timing review"
            )
        else:
            warnings.append(f"only {short_count} short(s); goal asks for at least 5 useful shorts when practical")
    if not has_manifest:
        warnings.append("missing manifest evidence")
    if not has_notes:
        warnings.append("missing human-readable notes/start-here/summary")
    if not has_sync:
        warnings.append("missing sync or missing-media report")
    if not has_packets:
        warnings.append("missing publication/delivery packet evidence")
    if episode == 4:
        warnings.append("Episode 4 watched/source clips are still pending; do not stall broader proof lanes")

    if episode == 4 and (not has_16x9 or "pending" in " ".join(warnings).lower()):
        return "reviewable-until-clips-arrive" if has_16x9 or has_audio or short_count else "blocked-on-source-clips", warnings, "Keep current media synced/reviewable, list missing clips, and continue Episodes 1-3,5,6."
    if not has_16x9 or not has_audio:
        return "needs-core-export", warnings, "Generate the next version with 16:9 video and podcast audio before publishing review."
    if short_count < 5:
        if carryforward_count >= 5:
            return "needs-shorts-realignment-review", warnings, "Review/re-align carry-forward shorts against this version, then export native shorts in a new non-overwriting package."
        return "needs-shorts-pass", warnings, "Create or improve shorts recipes/exports, then rerun the board."
    if warnings:
        return "reviewable-with-warnings", warnings, "Review the current version, fix warnings in a new version, and keep prior versions intact."
    return "review-ready-local", [], "Human review can start. Capture approval or required changes before any external publishing."


def analyze_episode(root: Path, episode: int) -> EpisodeGoalState:
    folder = episode_folder(root, episode)
    versions = version_dirs(folder)
    current = versions[-1] if versions else None
    files = classify_files(current, root) if current else {
        "longform_16x9": [],
        "vertical_9x16": [],
        "podcast_audio": [],
        "shorts": [],
        "carryforward_shorts": [],
            "review_workorders": [],
            "review_pages": [],
            "review_theaters": [],
            "contact_sheets": [],
            "contact_sheet_frames": [],
            "next_review_cards": [],
            "review_decisions": [],
            "review_decision_summaries": [],
            "manifests": [],
        "notes": [],
        "sync_reports": [],
        "publication_packets": [],
    }
    status, warnings, next_action = status_for(episode, folder, versions, files)
    return EpisodeGoalState(
        episode=episode,
        folder=str(folder),
        status=status,
        current_version=current.name if current else "",
        current_version_path=str(current) if current else "",
        version_count=len(versions),
        next_review_target=next_review_target_for(current, root),
        warnings=warnings,
        next_action=next_action,
        **files,
    )


def build_board(root: Path, episodes: Iterable[int]) -> dict[str, object]:
    states = [analyze_episode(root, episode) for episode in episodes]
    counts: dict[str, int] = {}
    for state in states:
        counts[state.status] = counts.get(state.status, 0) + 1
    shorts_start_here = shorts_review_start_here_for(root)
    return {
        "model": "quipsly-studio-goal-review-board",
        "version": "2026-07-02.v11",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "root": str(root),
        "proofLanes": PROOF_LANES,
        "episode4Policy": "Keep Episode 4 synced/reviewable with current media, but do not stall while missing watched/source clips are pending.",
        "statusCounts": counts,
        "episodes": [asdict(state) for state in states],
        "shortsReviewStartHere": shorts_start_here,
        "nextBestActions": next_best_actions(states),
        "truth": "Read-only local package review. No original media mutation, no overwrite, no external publication, no approval claim.",
    }


def shorts_review_start_here_for(root: Path) -> dict[str, Any]:
    folder = root / "shorts-command-room" / "start-here"
    json_path = folder / f"{DEFAULT_SHORTS_START_HERE_BASENAME}.json"
    markdown_path = folder / f"{DEFAULT_SHORTS_START_HERE_BASENAME}.md"
    html_path = folder / f"{DEFAULT_SHORTS_START_HERE_BASENAME}.html"
    source = read_json_object(json_path)
    first_short = source.get("firstRecommendedShort") if isinstance(source.get("firstRecommendedShort"), dict) else {}
    first_draft = source.get("firstEvidenceDraft") if isinstance(source.get("firstEvidenceDraft"), dict) else {}
    counts = source.get("counts") if isinstance(source.get("counts"), dict) else {}
    return {
        "status": "available" if json_path.exists() or html_path.exists() or markdown_path.exists() else "missing",
        "json": file_status(json_path, root),
        "markdown": file_status(markdown_path, root),
        "html": file_status(html_path, root),
        "counts": counts,
        "firstRecommendedShort": {
            "shortId": first_short.get("shortId"),
            "episode": first_short.get("episode"),
            "title": first_short.get("title") or first_short.get("relativePath"),
            "durationLabel": first_short.get("durationLabel"),
            "platformFit": first_short.get("platformFit"),
            "reviewPriority": first_short.get("reviewPriority"),
            "reviewPriorityReason": first_short.get("reviewPriorityReason"),
        } if first_short else {},
        "firstEvidenceDraft": {
            "shortId": first_draft.get("shortId"),
            "draftId": first_draft.get("draftId"),
            "outcome": first_draft.get("outcome"),
            "status": first_draft.get("status"),
            "ledgerDecision": first_draft.get("ledgerDecision"),
            "specificEnoughForRecordedIntent": first_draft.get("specificEnoughForRecordedIntent"),
        } if first_draft else {},
        "nextSafestAction": source.get("nextSafestAction") or "Generate the shorts review Start Here board before structured shorts review.",
        "refreshCommand": "script/agentctl.sh studio-shorts-review-start-here --all",
        "openCommand": f"open '{str(html_path).replace(chr(39), chr(39) + chr(34) + chr(39) + chr(34) + chr(39))}'" if html_path.exists() else "",
        "truth": source.get("truth") or "Shorts Start Here status only. This does not approve, publish, upload, schedule, mutate media, or create receipt truth.",
    }


def next_best_actions(states: list[EpisodeGoalState]) -> list[str]:
    actions: list[str] = []
    for state in states:
        if state.episode == 4 and state.status in {"blocked-on-source-clips", "reviewable-until-clips-arrive"}:
            actions.append("Episode 4: preserve missing-clip list and continue other proof lanes until watched/source clips arrive.")
        elif state.status in {"needs-core-export", "needs-versioned-export", "missing-folder"}:
            actions.append(f"Episode {state.episode}: {state.next_action}")
        elif state.status == "needs-shorts-pass":
            actions.append(f"Episode {state.episode}: improve shorts count/quality before publication review.")
        elif state.status == "needs-shorts-realignment-review":
            if state.next_review_target:
                actions.append(
                    f"Episode {state.episode}: review candidate {int(state.next_review_target.get('index') or 0):02d} "
                    f"({state.next_review_target.get('title')}) before native short export."
                )
            else:
                actions.append(f"Episode {state.episode}: review carry-forward shorts against the current version before native short export.")
        elif state.status == "reviewable-with-warnings":
            actions.append(f"Episode {state.episode}: review current version and fix warnings in a new version.")
    if not actions:
        actions.append("Start human review on local-ready packages, then capture approval or revision notes before publishing.")
    return actions[:8]


def render_markdown(board: dict[str, object]) -> str:
    lines = [
        "# Quipsly Studio Goal Review Board",
        "",
        f"Generated: `{board['generatedAt']}`",
        f"Root: `{board['root']}`",
        "",
        "> Truth: read-only local package review. This is not upload, publication, approval, or receipt proof.",
        "",
        "## Status counts",
        "",
    ]
    for status, count in sorted((board["statusCounts"] or {}).items()):
        lines.append(f"- `{status}`: {count}")
    start_here = board.get("shortsReviewStartHere") if isinstance(board.get("shortsReviewStartHere"), dict) else {}
    if start_here:
        lines.extend(["", "## Shorts review front door", ""])
        lines.append(f"- Status: `{start_here.get('status')}`")
        lines.append(f"- HTML: `{(start_here.get('html') or {}).get('relativePath') or (start_here.get('html') or {}).get('path') or ''}`")
        lines.append(f"- Refresh: `{start_here.get('refreshCommand')}`")
        if start_here.get("openCommand"):
            lines.append(f"- Open: `{start_here.get('openCommand')}`")
        first_short = start_here.get("firstRecommendedShort") if isinstance(start_here.get("firstRecommendedShort"), dict) else {}
        if first_short:
            lines.append("- First recommended native short:")
            lines.append(f"  - Short: `{first_short.get('shortId')}`")
            lines.append(f"  - Episode: `{first_short.get('episode')}`")
            lines.append(f"  - Title: {first_short.get('title')}")
            lines.append(f"  - Duration: `{first_short.get('durationLabel')}`")
            lines.append(f"  - Platform fit: `{first_short.get('platformFit')}`")
            lines.append(f"  - Reason: {first_short.get('reviewPriorityReason')}")
        first_draft = start_here.get("firstEvidenceDraft") if isinstance(start_here.get("firstEvidenceDraft"), dict) else {}
        if first_draft:
            lines.append("- First evidence draft:")
            lines.append(f"  - Draft: `{first_draft.get('draftId')}`")
            lines.append(f"  - Short: `{first_draft.get('shortId')}`")
            lines.append(f"  - Outcome: `{first_draft.get('outcome')}`")
            lines.append(f"  - Ledger decision: `{first_draft.get('ledgerDecision')}`")
        lines.append(f"- Next safest action: {start_here.get('nextSafestAction')}")
        lines.append(f"- Truth: {start_here.get('truth')}")
    lines.extend(["", "## Episodes", ""])
    for episode in board["episodes"]:
        lines.append(f"### Episode {episode['episode']:02d} - `{episode['status']}`")
        lines.append("")
        lines.append(f"- Current version: `{episode['current_version'] or 'none'}`")
        lines.append(f"- Versions found: {episode['version_count']}")
        lines.append(f"- 16:9 long-form files: {len(episode['longform_16x9'])}")
        lines.append(f"- 9:16 vertical files: {len(episode['vertical_9x16'])}")
        lines.append(f"- Podcast audio files: {len(episode['podcast_audio'])}")
        lines.append(f"- Shorts: {len(episode['shorts'])}")
        lines.append(f"- Carry-forward short candidates: {len(episode['carryforward_shorts'])}")
        lines.append(f"- Review workorders: {len(episode['review_workorders'])}")
        lines.append(f"- Review pages: {len(episode['review_pages'])}")
        lines.append(f"- Review theaters: {len(episode['review_theaters'])}")
        lines.append(f"- Contact-sheet pages: {len(episode['contact_sheets'])}")
        lines.append(f"- Contact-sheet frames: {len(episode['contact_sheet_frames'])}")
        lines.append(f"- Next-review cards: {len(episode['next_review_cards'])}")
        lines.append(f"- Review decision ledgers: {len(episode['review_decisions'])}")
        lines.append(f"- Review decision summaries: {len(episode['review_decision_summaries'])}")
        lines.append(f"- Manifests: {len(episode['manifests'])}")
        lines.append(f"- Notes: {len(episode['notes'])}")
        lines.append(f"- Sync/missing-media reports: {len(episode['sync_reports'])}")
        if episode.get("next_review_target"):
            target = episode["next_review_target"]
            lines.append("- Recommended next review target:")
            lines.append(f"  - Candidate: `{int(target.get('index') or 0):02d}`")
            lines.append(f"  - Title: {target.get('title')}")
            lines.append(f"  - Duration: `{target.get('durationSeconds')}s`")
            lines.append(f"  - Bucket: `{target.get('durationBucket')}`")
            lines.append(f"  - Hint: {target.get('reviewHint')}")
            lines.append(f"  - Command: `{target.get('suggestedCommand')}`")
            if target.get("suggestedStructuredCommand"):
                lines.append(f"  - Structured command: `{target.get('suggestedStructuredCommand')}`")
        if episode["review_pages"] or episode["review_theaters"] or episode["review_workorders"] or episode["review_decisions"] or episode["review_decision_summaries"]:
            lines.append("- Review artifacts:")
            for label, key in [
                ("Page", "review_pages"),
                ("Review theater", "review_theaters"),
                ("Contact sheet", "contact_sheets"),
                ("Next review card", "next_review_cards"),
                ("Workorder", "review_workorders"),
                ("Decision ledger", "review_decisions"),
                ("Decision summary", "review_decision_summaries"),
            ]:
                for artifact in episode[key][:4]:
                    lines.append(f"  - {label}: `{artifact}`")
                if len(episode[key]) > 4:
                    lines.append(f"  - {label}: ... {len(episode[key]) - 4} more")
        if episode["warnings"]:
            lines.append("- Warnings:")
            for warning in episode["warnings"]:
                lines.append(f"  - {warning}")
        lines.append(f"- Next safest action: {episode['next_action']}")
        lines.append("")
    lines.extend(["## Next best actions", ""])
    for action in board["nextBestActions"]:
        lines.append(f"- {action}")
    lines.append("")
    return "\n".join(lines)


def parse_episodes(raw: str) -> list[int]:
    if not raw.strip():
        return ALL_EPISODES
    episodes: list[int] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        episodes.append(int(chunk))
    return episodes


def main() -> int:
    parser = argparse.ArgumentParser(description="Read-only goal review board for Quipsly Studio episode packages.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export root. Defaults to QUIPSLY_EPISODE_EXPORT_ROOT or My Passport test folder.")
    parser.add_argument("--episodes", default=",".join(str(ep) for ep in ALL_EPISODES), help="Comma-separated episode numbers.")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--write", default="", help="Optional output file. Parent folder must already be writable.")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    board = build_board(root, parse_episodes(args.episodes))
    output = json.dumps(board, indent=2, sort_keys=True) + "\n" if args.format == "json" else render_markdown(board)
    if args.write:
        output_path = Path(args.write).expanduser()
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
