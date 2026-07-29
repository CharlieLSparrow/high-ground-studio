#!/usr/bin/env python3
"""Inventory Episodes 1-6 media for reusable audio-workbench intake.

This is a non-mutating preflight. It scans known external-drive episode roots,
probes bounded media metadata with ffprobe, and identifies likely audio spine
candidates so Episodes 1-6 can enter the same source-aware cleanup workflow as
Episode 4. It does not sync, clean, render, upload, publish, approve, or mutate
original media.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

AUDIO_EXTS = {".wav", ".mp3", ".m4a", ".aac", ".aif", ".aiff", ".flac", ".caf"}
VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".insv", ".avi", ".mkv"}
MEDIA_EXTS = AUDIO_EXTS | VIDEO_EXTS
SPINE_TOKENS = ("charlie", "homer", "scott", "mic", "audio", "ep", "episode", "dji", "tx", "pod", "wav")
IGNORE_DIRS = {".git", ".Trash", ".Spotlight-V100", ".fseventsd", "node_modules", "__pycache__"}


@dataclass
class ScanConfig:
    max_files_per_episode: int
    max_probe_per_episode: int
    max_depth: int


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


def existing(paths: list[Path]) -> list[Path]:
    return [path for path in paths if path.exists()]


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


def depth_from_root(root: Path, path: Path) -> int:
    try:
        rel = path.relative_to(root)
    except ValueError:
        return 999
    return len(rel.parts) - 1


def iter_media_files(root: Path, config: ScanConfig) -> list[Path]:
    out: list[Path] = []
    if not root.exists() or not root.is_dir():
        return out
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        if depth_from_root(root, current_path) >= config.max_depth:
            dirs[:] = []
        dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
        for name in sorted(files):
            if len(out) >= config.max_files_per_episode:
                return out
            path = current_path / name
            if path.suffix.lower() in MEDIA_EXTS:
                out.append(path)
    return out


def probe_media(path: Path) -> dict[str, Any]:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration,bit_rate:stream=codec_type,codec_name,sample_rate,channels,width,height,r_frame_rate",
        "-of",
        "json",
        str(path),
    ]
    try:
        raw = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT, timeout=20)
        payload = json.loads(raw)
    except FileNotFoundError:
        return {"probeStatus": "ffprobe-missing"}
    except subprocess.TimeoutExpired:
        return {"probeStatus": "timeout"}
    except subprocess.CalledProcessError as exc:
        return {"probeStatus": "error", "error": exc.output.strip()[-800:]}
    except json.JSONDecodeError as exc:
        return {"probeStatus": "json-error", "error": str(exc)}
    fmt = payload.get("format") or {}
    streams = payload.get("streams") or []
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    first_audio = audio_streams[0] if audio_streams else {}
    first_video = video_streams[0] if video_streams else {}
    return {
        "probeStatus": "ok",
        "durationSeconds": float(fmt.get("duration")) if str(fmt.get("duration") or "").replace(".", "", 1).isdigit() else None,
        "bitRate": int(fmt.get("bit_rate")) if str(fmt.get("bit_rate") or "").isdigit() else None,
        "audioStreamCount": len(audio_streams),
        "videoStreamCount": len(video_streams),
        "audioCodec": first_audio.get("codec_name"),
        "sampleRate": int(first_audio.get("sample_rate")) if str(first_audio.get("sample_rate") or "").isdigit() else None,
        "channels": first_audio.get("channels"),
        "videoCodec": first_video.get("codec_name"),
        "width": first_video.get("width"),
        "height": first_video.get("height"),
        "frameRate": first_video.get("r_frame_rate"),
    }


def classify(path: Path, probe: dict[str, Any] | None = None) -> str:
    ext = path.suffix.lower()
    if ext in AUDIO_EXTS:
        return "audio"
    if ext in VIDEO_EXTS:
        if probe and probe.get("audioStreamCount") and probe.get("videoStreamCount"):
            return "video-with-audio"
        return "video"
    return "unknown"


def spine_score(path: Path, row: dict[str, Any]) -> int:
    name = path.name.lower()
    score = 0
    if path.suffix.lower() in {".wav", ".aif", ".aiff", ".flac"}:
        score += 30
    if row.get("audioStreamCount"):
        score += 20
    if not row.get("videoStreamCount"):
        score += 15
    duration = row.get("durationSeconds") or 0
    if duration >= 1200:
        score += 25
    elif duration >= 300:
        score += 12
    if any(token in name for token in SPINE_TOKENS):
        score += 12
    if "office" in name or "clip" in name or "reference" in name:
        score -= 20
    return score


def build_episode_inventory(episode_root: Path, media_root: Path, episode: int, config: ScanConfig) -> dict[str, Any]:
    raw_roots = existing(find_raw_candidates(media_root, episode))
    review_roots = existing(find_review_candidates(episode_root, episode))
    files: list[Path] = []
    for root in raw_roots:
        files.extend(iter_media_files(root, config))
    files = sorted(dict.fromkeys(files), key=lambda p: str(p).lower())[: config.max_files_per_episode]
    rows: list[dict[str, Any]] = []
    for index, path in enumerate(files):
        stat = path.stat()
        probed = index < config.max_probe_per_episode
        probe = probe_media(path) if probed else {"probeStatus": "not-probed-limit"}
        kind = classify(path, probe)
        row = {
            "path": str(path),
            "name": path.name,
            "extension": path.suffix.lower(),
            "kind": kind,
            "sizeBytes": stat.st_size,
            "probed": probed,
            **probe,
        }
        row["spineCandidateScore"] = spine_score(path, row) if kind in {"audio", "video-with-audio"} else 0
        rows.append(row)
    audio_rows = [r for r in rows if r["kind"] == "audio"]
    video_rows = [r for r in rows if r["kind"].startswith("video")]
    candidates = sorted((r for r in rows if r.get("spineCandidateScore", 0) >= 45), key=lambda r: (-r.get("spineCandidateScore", 0), str(r.get("path"))))[:8]
    not_probed_count = sum(1 for r in rows if r.get("probeStatus") == "not-probed-limit")
    probe_error_count = sum(1 for r in rows if r.get("probeStatus") not in {"ok", "not-probed-limit"})
    hard_stops: list[str] = []
    if not raw_roots:
        hard_stops.append("No raw media root found.")
    if not rows:
        hard_stops.append("No media files found in raw roots.")
    status = "inventory-ready"
    if hard_stops:
        status = "missing-media"
    elif not candidates:
        status = "needs-audio-spine-selection"
    elif probe_error_count:
        status = "inventory-ready-with-probe-warnings"
    return {
        "episode": episode,
        "status": status,
        "rawRoots": [str(p) for p in raw_roots],
        "reviewRoots": [str(p) for p in review_roots],
        "fileCount": len(rows),
        "audioFileCount": len(audio_rows),
        "videoFileCount": len(video_rows),
        "candidateSpineCount": len(candidates),
        "probeErrorCount": probe_error_count,
        "notProbedCount": not_probed_count,
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "candidateSpines": candidates,
        "mediaFiles": rows,
        "nextSafeAction": next_action_for_episode(status, candidates),
    }


def next_action_for_episode(status: str, candidates: list[dict[str, Any]]) -> str:
    if status == "missing-media":
        return "Attach or locate raw media before attempting sync or cleanup."
    if status == "needs-audio-spine-selection":
        return "Manually identify the intended long audio sources; do not guess a cleanup spine."
    if candidates:
        return "Review candidate spines, choose source roles, then create sync evidence and speaker activity maps before any cleanup candidate."
    return "Review inventory and rerun after media roots are corrected."


def build_report(manifest: dict[str, Any], baseline_dir: Path, episode_root: Path, media_root: Path, generated_at: str, config: ScanConfig) -> dict[str, Any]:
    episodes = [build_episode_inventory(episode_root, media_root, episode, config) for episode in range(1, 7)]
    hard_stop_count = sum(ep["hardStopCount"] for ep in episodes)
    probe_error_count = sum(ep["probeErrorCount"] for ep in episodes)
    candidate_count = sum(ep["candidateSpineCount"] for ep in episodes)
    status = "episodes-1-6-media-inventory-ready" if hard_stop_count == 0 else "episodes-1-6-media-inventory-needs-media"
    if hard_stop_count == 0 and probe_error_count:
        status = "episodes-1-6-media-inventory-ready-with-probe-warnings"
    return {
        "schema": "quipsly.audio-workbench.episodes-1-6-media-inventory-preflight.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "episodeRoot": str(episode_root),
        "mediaRoot": str(media_root),
        "status": status,
        "purpose": "Prepare Episodes 1-6 for source-aware audio cleanup by inventorying actual media roots and likely spine candidates without mutating originals.",
        "qualityScope": {
            "currentPrimaryGate": "Episode 4 v006 high-quality audio spine human listen remains first.",
            "branchPolicy": "No episode or shorts branch renders should inherit a spine until its audio gate passes.",
        },
        "scanLimits": {
            "maxFilesPerEpisode": config.max_files_per_episode,
            "maxProbePerEpisode": config.max_probe_per_episode,
            "maxDepth": config.max_depth,
        },
        "episodeCount": len(episodes),
        "scannedFileCount": sum(ep["fileCount"] for ep in episodes),
        "audioFileCount": sum(ep["audioFileCount"] for ep in episodes),
        "videoFileCount": sum(ep["videoFileCount"] for ep in episodes),
        "candidateSpineCount": candidate_count,
        "probeErrorCount": probe_error_count,
        "hardStopCount": hard_stop_count,
        "episodes": episodes,
        "nextSafeAction": "Use this inventory to choose source roles and sync baselines for Episodes 1-6 while Episode 4 waits on the human listen gate.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episodes 1-6 Media Inventory Preflight",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        f"Status: `{report['status']}`",
        "",
        "This is an intake preflight, not an edit or render. It scans known external-drive episode roots, probes bounded media metadata, and identifies likely audio spine candidates while leaving originals untouched.",
        "",
        "## Counts",
        "",
        f"- Episodes: `{report['episodeCount']}`",
        f"- Scanned media files: `{report['scannedFileCount']}`",
        f"- Audio files: `{report['audioFileCount']}`",
        f"- Video files: `{report['videoFileCount']}`",
        f"- Candidate spines: `{report['candidateSpineCount']}`",
        f"- Probe warnings/errors: `{report['probeErrorCount']}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        "",
        "## Episode inventory",
        "",
        "| Episode | Status | Files | Audio | Video | Candidate spines | Probe warnings | Next safe action |",
        "|---:|---|---:|---:|---:|---:|---:|---|",
    ]
    for ep in report["episodes"]:
        lines.append(f"| {ep['episode']} | `{ep['status']}` | {ep['fileCount']} | {ep['audioFileCount']} | {ep['videoFileCount']} | {ep['candidateSpineCount']} | {ep['probeErrorCount']} | {ep['nextSafeAction']} |")
    lines.extend(["", "## Candidate spine details", ""])
    for ep in report["episodes"]:
        lines.extend([f"### Episode {ep['episode']}", ""])
        for root in ep["rawRoots"][:6]:
            lines.append(f"- Raw root: `{root}`")
        if ep["hardStops"]:
            for stop in ep["hardStops"]:
                lines.append(f"- Hard stop: {stop}")
        if not ep["candidateSpines"]:
            lines.append("- Candidate spines: `none`")
        for candidate in ep["candidateSpines"][:8]:
            duration = candidate.get("durationSeconds")
            duration_text = f"{duration:.1f}s" if isinstance(duration, (float, int)) else "unknown duration"
            lines.append(f"- `{candidate['name']}` score `{candidate['spineCandidateScore']}`; {candidate['kind']}; {duration_text}; `{candidate['path']}`")
        lines.append("")
    lines.extend([
        "## Safety",
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
    for ep in report["episodes"]:
        rows.append(
            f"<tr><td>{ep['episode']}</td><td><code>{escape(ep['status'])}</code></td><td>{ep['fileCount']}</td><td>{ep['audioFileCount']}</td><td>{ep['videoFileCount']}</td><td>{ep['candidateSpineCount']}</td><td>{escape(ep['nextSafeAction'])}</td></tr>"
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episodes 1-6 Media Inventory Preflight</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; color: #2f271f; background: #fbf7ee; }}
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
  <h1>Episodes 1-6 Media Inventory Preflight</h1>
  <div class=\"card\">
    <span class=\"pill\">{escape(report['status'])}</span>
    <span class=\"pill\">{report['scannedFileCount']} files</span>
    <span class=\"pill\">{report['candidateSpineCount']} spine candidates</span>
    <p>{escape(report['purpose'])}</p>
  </div>
  <table>
    <thead><tr><th>Episode</th><th>Status</th><th>Files</th><th>Audio</th><th>Video</th><th>Spine candidates</th><th>Next safe action</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
  <div class=\"card\"><h2>Full markdown</h2><pre>{escape(markdown)}</pre></div>
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
    outputs.setdefault("audioEpisodeMediaInventoryPreflights", []).append(entry)
    outputs["latestAudioEpisodeMediaInventoryPreflight"] = entry
    outputs["latestAudioEpisodeMediaInventoryPreflightMarkdown"] = str(md_path)
    outputs["latestAudioEpisodeMediaInventoryPreflightHtml"] = str(html_path)
    outputs["latestAudioEpisodeMediaInventoryPreflightOpenCommand"] = str(open_path)

    manifest["audioEpisodeMediaInventoryPreflightLatestStatus"] = report["status"]
    manifest["audioEpisodeMediaInventoryPreflightEpisodeCount"] = report["episodeCount"]
    manifest["audioEpisodeMediaInventoryPreflightScannedFileCount"] = report["scannedFileCount"]
    manifest["audioEpisodeMediaInventoryPreflightAudioFileCount"] = report["audioFileCount"]
    manifest["audioEpisodeMediaInventoryPreflightVideoFileCount"] = report["videoFileCount"]
    manifest["audioEpisodeMediaInventoryPreflightCandidateSpineCount"] = report["candidateSpineCount"]
    manifest["audioEpisodeMediaInventoryPreflightProbeErrorCount"] = report["probeErrorCount"]
    manifest["audioEpisodeMediaInventoryPreflightHardStopCount"] = report["hardStopCount"]
    manifest["audioEpisodeMediaInventoryPreflightApprovalStateChanged"] = False
    manifest["audioEpisodeMediaInventoryPreflightBranchStateChanged"] = False
    manifest["audioEpisodeMediaInventoryPreflightRenderAttempted"] = False
    manifest["audioEpisodeMediaInventoryPreflightUploadAttempted"] = False
    manifest["audioEpisodeMediaInventoryPreflightPublicationAttempted"] = False
    manifest["audioEpisodeMediaInventoryPreflightOriginalMediaMutated"] = False
    manifest["latestAudioEpisodeMediaInventoryPreflightGeneratedAt"] = report["generatedAt"]
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    parser.add_argument("--episode-root", default=Path("/Volumes/My Passport/Episode_and_Shorts_Test"), type=Path)
    parser.add_argument("--media-root", default=Path("/Volumes/My Passport"), type=Path)
    parser.add_argument("--max-files-per-episode", default=250, type=int)
    parser.add_argument("--max-probe-per-episode", default=120, type=int)
    parser.add_argument("--max-depth", default=5, type=int)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    report_dir = baseline_dir / f"audio-episodes-1-6-media-inventory-preflight-{slug}-{generated_at}"
    report_dir.mkdir(parents=True, exist_ok=True)
    config = ScanConfig(args.max_files_per_episode, args.max_probe_per_episode, args.max_depth)
    report = build_report(manifest, baseline_dir, args.episode_root, args.media_root, generated_at, config)
    markdown = render_markdown(report)
    html = render_html(report, markdown)

    json_path = report_dir / "episodes-1-6-media-inventory-preflight.json"
    md_path = report_dir / "episodes-1-6-media-inventory-preflight.md"
    html_path = report_dir / "episodes-1-6-media-inventory-preflight.html"
    open_path = report_dir / "open-episodes-1-6-media-inventory-preflight.command"
    stable_json = baseline_dir / "EPISODES_1_6_MEDIA_INVENTORY_PREFLIGHT.json"
    stable_md = baseline_dir / "EPISODES_1_6_MEDIA_INVENTORY_PREFLIGHT.md"
    stable_html = baseline_dir / "EPISODES_1_6_MEDIA_INVENTORY_PREFLIGHT.html"
    stable_open = baseline_dir / "OPEN_EPISODES_1_6_MEDIA_INVENTORY_PREFLIGHT.command"

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
    print(f"Wrote Episodes 1-6 media inventory preflight: {stable_html}")
    print(json.dumps({
        "status": report["status"],
        "episodeCount": report["episodeCount"],
        "scannedFileCount": report["scannedFileCount"],
        "audioFileCount": report["audioFileCount"],
        "videoFileCount": report["videoFileCount"],
        "candidateSpineCount": report["candidateSpineCount"],
        "probeErrorCount": report["probeErrorCount"],
        "hardStopCount": report["hardStopCount"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
