#!/usr/bin/env python3
"""Build an Episodes 1-6 audio rollout readiness board.

This board applies the Episode 4 audio workbench as an intake/reuse lane for
Episodes 1-6 without approving audio, rendering branches, uploading files, or
mutating original media. It is deliberately a control-plane artifact: it tells a
human or agent what exists, what is missing, which episode is the current audio
spine proof target, and what the next safe action is.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath", "openCommand"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def existing(paths: list[Path]) -> list[str]:
    return [str(path) for path in paths if path.exists()]


def shallow_children(path: Path, limit: int = 40) -> list[dict[str, Any]]:
    if not path.exists() or not path.is_dir():
        return []
    rows: list[dict[str, Any]] = []
    try:
        children = sorted(path.iterdir(), key=lambda item: item.name.lower())[:limit]
    except OSError:
        return []
    interesting_tokens = ("v", "release", "podcast", "social", "short", "manifest", "note", "review", "audio", "spine", "sync")
    for child in children:
        lower = child.name.lower()
        if child.is_dir() or any(token in lower for token in interesting_tokens):
            rows.append({"name": child.name, "path": str(child), "kind": "dir" if child.is_dir() else "file"})
    return rows


def find_raw_candidates(media_root: Path, episode: int) -> list[Path]:
    candidates = [media_root / f"Episode {episode}"]
    podcast_root = media_root / "Podcast_Episodes"
    if episode == 1:
        candidates.append(podcast_root / "Episode_1_Jan_2026")
    if episode in (2, 3):
        candidates.append(podcast_root / "Episode_2_3_Feb_2026")
    if episode == 4:
        candidates.append(podcast_root / "Episode_4_Apr_2026")
    if episode >= 8:
        candidates.append(podcast_root / "Episode_8_Plus_May_2026")
    return candidates


def find_review_candidates(episode_root: Path, episode: int) -> list[Path]:
    candidates = [episode_root / f"Episode_{episode:02d}"]
    if episode == 4:
        candidates.append(episode_root / "Episode_4_Sync_Producer_Takes")
    return candidates


def next_action_for(episode: int, status: str) -> str:
    if episode == 4:
        return "Listen to v006, record pass/fail/focused-proof notes, then unlock branch inheritance only if the spine passes."
    if status == "ready-for-reusable-profile-intake":
        return "Create source inventory, sync evidence, speaker activity map, proof-window cleanup, then a candidate spine only after evidence agrees."
    if status == "needs-review-package-or-baseline":
        return "Use raw media to create a review package and explicit sync baseline before any cleanup or episode render."
    if status == "needs-raw-media-confirmation":
        return "Confirm raw media location before treating the review/export folder as reusable production evidence."
    return "Find or attach raw/review roots, then rerun this board."


def episode_status(episode: int, review_paths: list[str], raw_paths: list[str]) -> str:
    if episode == 4:
        return "current-audio-spine-proof-target"
    if review_paths and raw_paths:
        return "ready-for-reusable-profile-intake"
    if raw_paths:
        return "needs-review-package-or-baseline"
    if review_paths:
        return "needs-raw-media-confirmation"
    return "missing-media-and-review-root"


def current_spine_files(manifest: dict[str, Any]) -> list[str]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    candidates: list[Path] = []
    for key in (
        "latestNormalStereoAudioSpine",
        "latestM4AAudioListenCopy",
        "latestAudioSpineListenCopy",
        "latestAudioMorningAudioReviewLauncher",
        "stableAudioMorningAudioReviewLauncherOpenCommand",
        "latestAudioProducerCommandCenter",
    ):
        path = output_path(outputs.get(key))
        if path:
            candidates.append(path)
    return existing(candidates)


def build_episode_row(manifest: dict[str, Any], episode_root: Path, media_root: Path, episode: int) -> dict[str, Any]:
    review_candidates = find_review_candidates(episode_root, episode)
    raw_candidates = find_raw_candidates(media_root, episode)
    review_paths = existing(review_candidates)
    raw_paths = existing(raw_candidates)
    status = episode_status(episode, review_paths, raw_paths)
    review_children: list[dict[str, Any]] = []
    for review_path in review_paths:
        review_children.extend(shallow_children(Path(review_path), limit=20))
    raw_children: list[dict[str, Any]] = []
    for raw_path in raw_paths:
        raw_children.extend(shallow_children(Path(raw_path), limit=20))
    row: dict[str, Any] = {
        "episode": episode,
        "status": status,
        "reviewPaths": review_paths,
        "rawMediaPaths": raw_paths,
        "reviewArtifactHints": review_children[:25],
        "rawMediaHints": raw_children[:25],
        "nextSafeAction": next_action_for(episode, status),
        "useEpisode4ProfileAs": "starting audit/profile only; do not production-default without proof windows and listening",
        "originalMediaMutationAllowed": False,
        "renderAllowedFromThisBoard": False,
    }
    if episode == 4:
        row["currentAudioSpineArtifacts"] = current_spine_files(manifest)
        row["audioSpineGate"] = manifest.get("audioPostListenEpisodeRunwayAudioSpineGateStatus") or "waiting-for-human-listen"
        row["finalEpisodeGate"] = manifest.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus") or "locked-until-audio-spine-approved"
        row["shortsGate"] = manifest.get("audioPostListenEpisodeRunwayShortsGateStatus") or "locked-until-audio-spine-approved"
    return row


def build_report(manifest: dict[str, Any], baseline_dir: Path, episode_root: Path, media_root: Path, generated_at: str) -> dict[str, Any]:
    episodes = [build_episode_row(manifest, episode_root, media_root, episode) for episode in range(1, 7)]
    ready_count = sum(1 for row in episodes if row["status"] == "ready-for-reusable-profile-intake")
    proof_count = sum(1 for row in episodes if row["status"] == "current-audio-spine-proof-target")
    needs_media_count = sum(1 for row in episodes if row["status"] in {"needs-raw-media-confirmation", "missing-media-and-review-root"})
    hard_stop_count = 0
    status = "episodes-1-6-rollout-board-ready" if len(episodes) == 6 and proof_count >= 1 and hard_stop_count == 0 else "episodes-1-6-rollout-board-needs-attention"
    return {
        "schema": "quipsly.audio-workbench.episodes-1-6-rollout-readiness-board.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "episodeRoot": str(episode_root),
        "mediaRoot": str(media_root),
        "status": status,
        "purpose": "Aim the Episode 4 audio workbench at Episodes 1-6 without approving, rendering, uploading, publishing, or mutating source media.",
        "qualityScope": {
            "currentPrimaryGate": "Episode 4 high-quality audio spine v006 human listen",
            "finalEpisodeGate": manifest.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus") or "locked-until-audio-spine-approved",
            "shortsGate": manifest.get("audioPostListenEpisodeRunwayShortsGateStatus") or "locked-until-audio-spine-approved",
            "meaning": "Machine quality checks can prove delivery safety and surface risks; human listening still decides naturalness and publication confidence.",
        },
        "episodeCount": len(episodes),
        "readyForIntakeCount": ready_count,
        "currentProofTargetCount": proof_count,
        "needsMediaCount": needs_media_count,
        "hardStopCount": hard_stop_count,
        "episodes": episodes,
        "nextSafeAction": "Keep Episode 4 v006 as the morning listen target; use this board to queue Episodes 1-6 intake/proof work after the spine gate is resolved.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episodes 1-6 Audio Rollout Readiness Board",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report.get('baselineId')}`",
        f"Status: `{report['status']}`",
        "",
        "This is a control-plane board, not an approval or render step. It applies the Episode 4 audio workbench pattern to the real external-drive episode set while keeping originals untouched and branch renders locked until the current audio spine passes human listening.",
        "",
        "## Current quality target",
        "",
        f"- Current primary gate: `{report['qualityScope']['currentPrimaryGate']}`",
        f"- Final episode gate: `{report['qualityScope']['finalEpisodeGate']}`",
        f"- Shorts gate: `{report['qualityScope']['shortsGate']}`",
        f"- Meaning: {report['qualityScope']['meaning']}",
        "",
        "## Counts",
        "",
        f"- Episodes mapped: `{report['episodeCount']}`",
        f"- Ready for reusable-profile intake: `{report['readyForIntakeCount']}`",
        f"- Current proof targets: `{report['currentProofTargetCount']}`",
        f"- Needs media confirmation: `{report['needsMediaCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        "",
        "## Episode board",
        "",
        "| Episode | Status | Review paths | Raw paths | Next safe action |",
        "|---:|---|---:|---:|---|",
    ]
    for row in report["episodes"]:
        lines.append(
            f"| {row['episode']} | `{row['status']}` | {len(row['reviewPaths'])} | {len(row['rawMediaPaths'])} | {row['nextSafeAction']} |"
        )
    lines.extend(["", "## Details", ""])
    for row in report["episodes"]:
        lines.extend([
            f"### Episode {row['episode']}",
            "",
            f"- Status: `{row['status']}`",
            f"- Next safe action: {row['nextSafeAction']}",
            f"- Review paths: `{len(row['reviewPaths'])}`",
            f"- Raw media paths: `{len(row['rawMediaPaths'])}`",
        ])
        for path in row["reviewPaths"][:4]:
            lines.append(f"  - Review: `{path}`")
        for path in row["rawMediaPaths"][:4]:
            lines.append(f"  - Raw: `{path}`")
        if row.get("currentAudioSpineArtifacts"):
            lines.append("- Current Episode 4 spine artifacts:")
            for path in row["currentAudioSpineArtifacts"][:8]:
                lines.append(f"  - `{path}`")
        lines.append("")
    lines.extend([
        "## Safety assertions",
        "",
        f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
        f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
        f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
        f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
        f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
    ])
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown: str) -> str:
    rows = []
    for row in report["episodes"]:
        rows.append(
            f"<tr><td>{row['episode']}</td><td><code>{row['status']}</code></td><td>{len(row['reviewPaths'])}</td><td>{len(row['rawMediaPaths'])}</td><td>{row['nextSafeAction']}</td></tr>"
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episodes 1-6 Audio Rollout Readiness Board</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #2f271f; background: #fbf7ee; }}
    h1, h2 {{ color: #3b2a1f; }}
    .card {{ background: #fffdf7; border: 1px solid #dfd1b7; border-radius: 18px; padding: 20px; margin: 18px 0; box-shadow: 0 10px 30px rgba(88, 68, 42, .08); }}
    .pill {{ display: inline-block; padding: 7px 11px; border-radius: 999px; background: #e9f6de; color: #245d31; font-weight: 700; margin-right: 8px; }}
    table {{ width: 100%; border-collapse: collapse; background: white; border-radius: 14px; overflow: hidden; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid #eee1cd; text-align: left; vertical-align: top; }}
    th {{ background: #efe2c9; color: #4a3727; }}
    code {{ background: #f3eadb; padding: 2px 5px; border-radius: 5px; }}
    pre {{ white-space: pre-wrap; background: #211b16; color: #fff8e8; padding: 16px; border-radius: 14px; overflow: auto; }}
  </style>
</head>
<body>
  <h1>Episodes 1-6 Audio Rollout Readiness Board</h1>
  <div class=\"card\">
    <span class=\"pill\">{report['status']}</span>
    <span class=\"pill\">{report['episodeCount']} episodes</span>
    <span class=\"pill\">{report['readyForIntakeCount']} intake-ready</span>
    <span class=\"pill\">{report['currentProofTargetCount']} proof target</span>
    <p>{report['purpose']}</p>
    <p><strong>Current target:</strong> {report['qualityScope']['currentPrimaryGate']}</p>
  </div>
  <table>
    <thead><tr><th>Episode</th><th>Status</th><th>Review roots</th><th>Raw roots</th><th>Next safe action</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <div class=\"card\">
    <h2>Full markdown</h2>
    <pre>{markdown.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')}</pre>
  </div>
</body>
</html>
"""


def register(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_path: Path) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "openCommand": str(open_path),
        "generatedAt": report["generatedAt"],
        "status": report["status"],
    }
    history = outputs.setdefault("audioEpisodeRolloutReadinessBoards", [])
    history.append(entry)
    outputs["latestAudioEpisodeRolloutReadinessBoard"] = entry
    outputs["latestAudioEpisodeRolloutReadinessBoardMarkdown"] = str(md_path)
    outputs["latestAudioEpisodeRolloutReadinessBoardHtml"] = str(html_path)
    outputs["latestAudioEpisodeRolloutReadinessBoardOpenCommand"] = str(open_path)

    manifest["audioEpisodeRolloutReadinessLatestStatus"] = report["status"]
    manifest["audioEpisodeRolloutReadinessEpisodeCount"] = report["episodeCount"]
    manifest["audioEpisodeRolloutReadinessReadyForIntakeCount"] = report["readyForIntakeCount"]
    manifest["audioEpisodeRolloutReadinessCurrentProofTargetCount"] = report["currentProofTargetCount"]
    manifest["audioEpisodeRolloutReadinessNeedsMediaCount"] = report["needsMediaCount"]
    manifest["audioEpisodeRolloutReadinessHardStopCount"] = report["hardStopCount"]
    manifest["audioEpisodeRolloutReadinessApprovalStateChanged"] = False
    manifest["audioEpisodeRolloutReadinessBranchStateChanged"] = False
    manifest["audioEpisodeRolloutReadinessRenderAttempted"] = False
    manifest["audioEpisodeRolloutReadinessUploadAttempted"] = False
    manifest["audioEpisodeRolloutReadinessPublicationAttempted"] = False
    manifest["audioEpisodeRolloutReadinessOriginalMediaMutated"] = False
    manifest["latestAudioEpisodeRolloutReadinessBoardGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--episode-root", default=Path("/Volumes/My Passport/Episode_and_Shorts_Test"), type=Path)
    parser.add_argument("--media-root", default=Path("/Volumes/My Passport"), type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report_dir = baseline_dir / f"audio-episodes-1-6-rollout-readiness-board-{slug}-{generated_at}"
    report_dir.mkdir(parents=True, exist_ok=True)

    report = build_report(manifest, baseline_dir, args.episode_root, args.media_root, generated_at)
    markdown = render_markdown(report)
    html = render_html(report, markdown)

    json_path = report_dir / "episodes-1-6-audio-rollout-readiness-board.json"
    md_path = report_dir / "episodes-1-6-audio-rollout-readiness-board.md"
    html_path = report_dir / "episodes-1-6-audio-rollout-readiness-board.html"
    open_path = report_dir / "open-episodes-1-6-audio-rollout-readiness-board.command"
    stable_json = baseline_dir / "EPISODES_1_6_AUDIO_ROLLOUT_BOARD.json"
    stable_md = baseline_dir / "EPISODES_1_6_AUDIO_ROLLOUT_BOARD.md"
    stable_html = baseline_dir / "EPISODES_1_6_AUDIO_ROLLOUT_BOARD.html"
    stable_open = baseline_dir / "OPEN_EPISODES_1_6_AUDIO_ROLLOUT_BOARD.command"

    for path in (json_path, stable_json):
        write_json(path, report)
    for path in (md_path, stable_md):
        path.write_text(markdown + "\n", encoding="utf-8")
    for path in (html_path, stable_html):
        path.write_text(html, encoding="utf-8")
    command = "#!/bin/zsh\nopen " + shell_quote(str(stable_html)) + "\n"
    for path in (open_path, stable_open):
        path.write_text(command, encoding="utf-8")
        os.chmod(path, 0o755)

    register(manifest_path, report, stable_json, stable_md, stable_html, stable_open)
    print(f"Wrote Episodes 1-6 audio rollout readiness board: {stable_html}")
    print(json.dumps({
        "status": report["status"],
        "episodeCount": report["episodeCount"],
        "readyForIntakeCount": report["readyForIntakeCount"],
        "currentProofTargetCount": report["currentProofTargetCount"],
        "needsMediaCount": report["needsMediaCount"],
        "hardStopCount": report["hardStopCount"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
