#!/usr/bin/env python3
"""Build an Episode 4 source/reference clip candidate workbench.

Episode 4 currently has synced production lanes, but the clip-weave proof needs
watched/source/reference clips as whole source lanes. This script scans likely
local media roots, excludes already attached session lanes and generated review
outputs, probes candidates, and writes a review board with safe attach commands.

Safety boundary: read-only inventory. It does not import media, mutate source
files, create edit decisions, export, publish, upload, schedule, delete, or
overwrite prior boards.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shlex
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen

SCRIPT_ROOT = Path(__file__).resolve().parent.parent
if str(SCRIPT_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_ROOT))

from quipsly_media_tools import resolve_media_tool

DEFAULT_BASE_URL = "http://127.0.0.1:8080"
RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
OUT_ROOT = RELEASE_ROOT / "review-board" / "episode4-source-clip-candidates"
LATEST_POINTER = OUT_ROOT / "latest-episode4-source-clip-candidates.json"
VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v", ".insv", ".lrv"}
DEFAULT_SCAN_ROOTS = [
    Path("/Volumes/My Passport/Episode 4/Watched Clips"),
    Path("/Volumes/My Passport/Episode 4/Source Clips"),
    Path("/Volumes/My Passport/Episode 4/Reference Clips"),
    Path("/Volumes/My Passport/Episode 4"),
    Path("/Volumes/My Passport/Podcast_Episodes/Episode_4_Apr_2026"),
    Path("/Volumes/My Passport/StudioCut/episode-004"),
    Path("/Volumes/My Passport/video"),
    Path("/Volumes/My Passport/Quipsly Media Workspace/source-originals"),
]
CONFIRMED_DROP_FOLDER_TERMS = {"watched clips", "source clips", "reference clips", "confirmed clips", "episode 4 clips"}
SKIP_DIR_TERMS = {
    ".app",
    ".logicx",
    ".fcpbundle",
    ".photoslibrary",
    ".theater",
    "__pycache__",
    "node_modules",
    "review-board",
    "quipslyexports",
    "episode_and_shorts_test",
    "mediavault",
    "proxy",
    "transcript-pilots",
    "transcript-execution-readiness",
}
SOURCE_TERMS = {
    "source": 28,
    "reference": 28,
    "youtube": 28,
    "watched": 26,
    "watch": 16,
    "clip": 18,
    "broll": 22,
    "b-roll": 22,
    "screen": 10,
    "download": 8,
}
PRODUCTION_TERMS = {"charlie", "homer", "phone", "camera", "insta360", "tx00", "mic"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-source-clip-candidates")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def compact_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    sec = int(round(seconds % 60))
    if minutes >= 60:
        return f"{minutes // 60}:{minutes % 60:02d}:{sec:02d}"
    return f"{minutes}:{sec:02d}"


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fetch_state(base_url: str) -> dict[str, Any]:
    try:
        with urlopen(base_url.rstrip("/") + "/state", timeout=10) as response:  # noqa: S310 - local Studio agent endpoint
            payload = json.loads(response.read().decode("utf-8"))
            return payload if isinstance(payload, dict) else {}
    except (URLError, TimeoutError, json.JSONDecodeError, OSError):
        return {}


def normalize_path(path: str) -> str:
    try:
        return str(Path(path).expanduser().resolve(strict=False))
    except Exception:
        return str(path)


def attached_source_paths(state: dict[str, Any]) -> set[str]:
    paths: set[str] = set()
    for lane in state.get("sourceLaneInventory") or state.get("lanes") or []:
        if not isinstance(lane, dict):
            continue
        for key in ("sourcePath", "originalPath"):
            value = str(lane.get(key) or "")
            if value:
                paths.add(normalize_path(value))
        source_video = lane.get("sourceVideo") if isinstance(lane.get("sourceVideo"), dict) else {}
        media_url = str(source_video.get("mediaURL") or "")
        if media_url.startswith("file://"):
            paths.add(normalize_path(media_url.removeprefix("file://")))
    return paths


def should_skip_dir(path: Path) -> bool:
    lowered_parts = [part.lower() for part in path.parts]
    return any(term in lowered_parts or any(part.endswith(term) for part in lowered_parts) for term in SKIP_DIR_TERMS)


def iter_video_files(roots: list[Path], limit: int) -> list[Path]:
    files: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        root = root.expanduser()
        if not root.exists():
            continue
        if root.is_file():
            candidates = [root]
        else:
            candidates = []
            for current, dirs, names in os.walk(root):
                current_path = Path(current)
                dirs[:] = [entry for entry in dirs if not should_skip_dir(current_path / entry)]
                for name in names:
                    path = current_path / name
                    if path.suffix.lower() in VIDEO_EXTENSIONS:
                        candidates.append(path)
        for path in candidates:
            key = normalize_path(str(path))
            if key in seen:
                continue
            seen.add(key)
            files.append(path)
            if limit > 0 and len(files) >= limit:
                return files
    return files


def quick_score(path: Path, attached: set[str]) -> tuple[int, list[str]]:
    score = 0
    reasons: list[str] = []
    normalized = normalize_path(str(path))
    haystack = " ".join(part.lower() for part in path.parts)
    if normalized in attached:
        score -= 200
        reasons.append("already attached to the live Episode 4 session")
    if "/episode 4/" in haystack or "episode_4" in haystack or "episode-004" in haystack:
        score += 16
        reasons.append("near Episode 4 material")
    if any(term in haystack for term in CONFIRMED_DROP_FOLDER_TERMS):
        score += 45
        reasons.append("inside a watched/source/reference drop folder")
    if "/video/" in haystack:
        score += 8
        reasons.append("generic video source pool")
    for term, value in SOURCE_TERMS.items():
        if term in haystack:
            score += value
            reasons.append(f"path/name suggests {term}")
    if any(term in haystack for term in PRODUCTION_TERMS):
        score -= 10
        reasons.append("looks like production camera/audio rather than watched/source clip")
    if "episode_and_shorts_test" in haystack or "review-board" in haystack or "quipslyexports" in haystack:
        score -= 80
        reasons.append("generated/review output path")
    if path.suffix.lower() == ".lrv":
        score -= 18
        reasons.append("low-resolution sidecar; useful only if original/proxy is missing")
    return score, reasons


def confirmation_status(path: Path) -> str:
    haystack = " ".join(part.lower() for part in path.parts)
    if any(term in haystack for term in CONFIRMED_DROP_FOLDER_TERMS):
        return "candidate-from-watch-clip-drop-folder"
    if "/podcast_episodes/episode_4" in haystack or "episode_4_apr_2026" in haystack:
        return "nearby-episode-media-unconfirmed"
    return "unconfirmed-candidate"


def probe_video(path: Path, ffprobe: str, timeout: int) -> dict[str, Any]:
    command = [
        ffprobe,
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"probeStatus": "timeout", "durationSeconds": 0.0, "warnings": [f"ffprobe timed out after {timeout}s"]}
    if result.returncode != 0:
        return {"probeStatus": "failed", "durationSeconds": 0.0, "warnings": [(result.stderr or result.stdout or "").strip()[-1000:]]}
    try:
        payload = json.loads(result.stdout or "{}")
    except Exception as exc:
        return {"probeStatus": "unreadable", "durationSeconds": 0.0, "warnings": [str(exc)]}
    fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
    streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
    video = [row for row in streams if row.get("codec_type") == "video"]
    audio = [row for row in streams if row.get("codec_type") == "audio"]
    duration = float(fmt.get("duration") or 0.0)
    return {
        "probeStatus": "ok",
        "durationSeconds": round(duration, 3),
        "durationLabel": compact_time(duration),
        "videoStreams": len(video),
        "audioStreams": len(audio),
        "width": video[0].get("width") if video else None,
        "height": video[0].get("height") if video else None,
        "codec": video[0].get("codec_name") if video else None,
        "warnings": [],
    }


def final_score(path: Path, quick: int, probe: dict[str, Any]) -> tuple[int, list[str]]:
    score = quick
    reasons: list[str] = []
    duration = float(probe.get("durationSeconds") or 0.0)
    if probe.get("probeStatus") == "ok":
        score += 10
        reasons.append("ffprobe readable")
    if 5 <= duration <= 900:
        score += 14
        reasons.append("clip-like duration")
    elif 900 < duration <= 2400:
        score += 3
        reasons.append("long reference candidate")
    elif duration > 2400:
        score -= 18
        reasons.append("too long for first clip-weave proof unless deliberately chosen")
    if int(probe.get("videoStreams") or 0) <= 0:
        score -= 80
        reasons.append("no video stream")
    if int(probe.get("width") or 0) >= 1280:
        score += 4
        reasons.append("usable source resolution")
    return score, reasons


def build_candidate(path: Path, attached: set[str], ffprobe: str, timeout: int) -> dict[str, Any]:
    quick, quick_reasons = quick_score(path, attached)
    probe = probe_video(path, ffprobe, timeout)
    score, probe_reasons = final_score(path, quick, probe)
    safe_import = f"script/agentctl.sh import {shell_quote(str(path))}"
    safe_role = f"script/agentctl.sh lane-role {shell_quote(path.name)} reference_clip"
    return {
        "path": str(path),
        "name": path.name,
        "parent": str(path.parent),
        "extension": path.suffix.lower(),
        "sizeBytes": path.stat().st_size if path.exists() else 0,
        "score": score,
        "quickScore": quick,
        "isAlreadyAttached": normalize_path(str(path)) in attached,
        "probe": probe,
        "reasons": quick_reasons + probe_reasons,
        "confirmationStatus": confirmation_status(path),
        "suggestedRole": "reference_clip",
        "safeAttachCommands": [
            safe_import,
            safe_role,
        ],
        "nextSafestAction": "Open or preview this file. Import only after confirming it is a watched/source/reference clip for Episode 4.",
        "truth": "Candidate only. It is not attached, synced, edited, exported, uploaded, published, scheduled, deleted, overwritten, or used as receipt truth.",
    }


def preview_stem(path: Path) -> str:
    clean = "".join(ch if ch.isalnum() or ch in "._-" else "-" for ch in path.stem)
    return clean[:80] or "candidate"


def candidate_frame_seeks(duration: float) -> list[tuple[str, float]]:
    if duration <= 0:
        return [("preview", 0.5)]
    if duration < 8:
        return [("early", min(0.5, duration * 0.20)), ("middle", duration * 0.50), ("late", max(0.5, duration * 0.82))]
    return [("early", max(1.0, duration * 0.12)), ("middle", duration * 0.50), ("late", min(duration - 0.75, duration * 0.86))]


def add_preview_images(payload: dict[str, Any], session_dir: Path, preview_limit: int) -> None:
    if preview_limit <= 0:
        return
    ffmpeg = resolve_media_tool("ffmpeg", required=False)
    if not ffmpeg:
        payload.setdefault("warnings", []).append("ffmpeg is not available, so candidate preview thumbnails were not generated.")
        return
    preview_dir = session_dir / "previews"
    preview_dir.mkdir(parents=True, exist_ok=True)
    for index, row in enumerate(payload.get("candidates") or []):
        if index >= preview_limit:
            break
        source = Path(str(row.get("path") or ""))
        if not source.exists():
            continue
        probe = row.get("probe") if isinstance(row.get("probe"), dict) else {}
        duration = float(probe.get("durationSeconds") or 0.0)
        frames: list[dict[str, Any]] = []
        warnings: list[str] = []
        for label, seek in candidate_frame_seeks(duration):
            output = preview_dir / f"{index + 1:02d}-{label}-{preview_stem(source)}.jpg"
            command = [
                ffmpeg,
                "-y",
                "-hide_banner",
                "-nostdin",
                "-loglevel",
                "error",
                "-ss",
                f"{max(0.0, seek):.3f}",
                "-i",
                str(source),
                "-frames:v",
                "1",
                "-vf",
                "scale=520:-1",
                str(output),
            ]
            result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=20)
            if result.returncode == 0 and output.exists() and output.stat().st_size > 0:
                frames.append({
                    "label": label,
                    "path": str(output),
                    "seekSeconds": round(seek, 3),
                })
            else:
                warnings.append(f"{label}: {(result.stderr or result.stdout or f'ffmpeg exited {result.returncode}').strip()[-300:]}")
        if frames:
            row["previewFrames"] = frames
            middle = next((frame for frame in frames if frame.get("label") == "middle"), frames[0])
            row["previewImagePath"] = middle["path"]
            row["previewImageSeekSeconds"] = middle["seekSeconds"]
        if warnings:
            row["previewWarning"] = " | ".join(warnings)[:900]


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Episode 4 source clip candidate workbench",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Generated: `{payload.get('generatedAt')}`",
        f"- Live session: {payload.get('liveSessionName') or 'not available'}",
        f"- Existing clip-like lanes: `{payload.get('existingClipLikeLaneCount')}`",
        f"- Scanned files: `{payload.get('counts', {}).get('scannedFiles')}`",
        f"- Candidates: `{payload.get('counts', {}).get('candidateRows')}`",
        f"- Truth: {payload.get('truth')}",
        "",
        "## Best first candidates",
    ]
    for index, row in enumerate(payload.get("candidates") or [], start=1):
        probe = row.get("probe") or {}
        lines.extend([
            "",
            f"### {index}. {row.get('name')}",
            f"- Score: `{row.get('score')}`",
            f"- Duration: `{probe.get('durationLabel') or probe.get('durationSeconds')}`",
            f"- Resolution: `{probe.get('width')}x{probe.get('height')}`",
            f"- Path: `{row.get('path')}`",
            f"- Preview frames: `{len(row.get('previewFrames') or [])}`",
            f"- Confirmation status: `{row.get('confirmationStatus')}`",
            f"- Reasons: {', '.join(row.get('reasons') or [])}",
            "- Safe commands:",
        ])
        lines.extend(f"  - `{cmd}`" for cmd in row.get("safeAttachCommands") or [])
        lines.append(f"- Next: {row.get('nextSafestAction')}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards = []
    for index, row in enumerate(payload.get("candidates") or [], start=1):
        probe = row.get("probe") or {}
        commands = "".join(f"<li><code>{esc(cmd)}</code></li>" for cmd in row.get("safeAttachCommands") or [])
        reasons = "".join(f"<li>{esc(reason)}</li>" for reason in row.get("reasons") or [])
        frames = row.get("previewFrames") if isinstance(row.get("previewFrames"), list) else []
        frame_grid = ""
        if frames:
            images = "".join(
                f"""<figure><img src="file://{esc(frame.get('path'))}" alt="{esc(frame.get('label'))} frame for {esc(row.get('name'))}"><figcaption>{esc(frame.get('label'))} · {esc(frame.get('seekSeconds'))}s</figcaption></figure>"""
                for frame in frames
            )
            frame_grid = f"""<div class="preview-grid">{images}</div>"""
        elif row.get("previewImagePath"):
            frame_grid = f"""<img class="preview" src="file://{esc(row.get('previewImagePath'))}" alt="preview frame for {esc(row.get('name'))}">"""
        cards.append(f"""
        <article class="card">
          <div class="rank">{index}</div>
          <div>
            <p class="eyebrow">score {esc(row.get('score'))} · {esc(probe.get('durationLabel') or probe.get('durationSeconds'))}</p>
            <h3>{esc(row.get('name'))}</h3>
            {frame_grid}
            <p><b>Confirmation:</b> <code>{esc(row.get('confirmationStatus'))}</code></p>
            <p>{esc(row.get('nextSafestAction'))}</p>
            <p class="path">{esc(row.get('path'))}</p>
            <p class="meta">{esc(probe.get('width'))}x{esc(probe.get('height'))} · {esc(probe.get('codec'))} · audio streams {esc(probe.get('audioStreams'))}</p>
            <details><summary>Why this surfaced</summary><ul>{reasons}</ul></details>
            <details><summary>Safe attach commands</summary><ol>{commands}</ol></details>
          </div>
        </article>
        """)
    roots = "".join(f"<li><code>{esc(root)}</code></li>" for root in payload.get("scanRoots") or [])
    counts = payload.get("counts") or {}
    metrics = "".join(f"<div><b>{esc(value)}</b><span>{esc(key)}</span></div>" for key, value in counts.items())
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Episode 4 source clips</title>
<style>
:root {{ color-scheme:dark; --bg:#11170f; --panel:#1d2c20; --ink:#fff2d8; --muted:#cbbd9f; --gold:#f1c85a; --leaf:#80db87; --water:#73cddd; --clay:#d8845f; --line:#3a563f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(115,205,221,.16),transparent 28%),linear-gradient(135deg,#10170f,#241b12 72%); color:var(--ink); }}
main {{ max-width:1160px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(29,44,32,.92); padding:22px; margin:16px 0; box-shadow:0 18px 52px rgba(0,0,0,.25); }}
h1 {{ font-size:clamp(38px,6vw,72px); line-height:.92; margin:.05em 0 .25em; }}
h3 {{ margin:.1em 0 .35em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
p,li,summary {{ color:var(--muted); line-height:1.45; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-top:18px; }}
.metrics div {{ border:1px solid var(--line); border-radius:16px; background:rgba(0,0,0,.18); padding:12px; }}
.metrics b {{ display:block; color:var(--leaf); font-size:24px; }}
.metrics span {{ display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:11px; }}
.card {{ display:grid; grid-template-columns:48px 1fr; gap:14px; }}
.preview {{ width:100%; max-height:260px; object-fit:cover; border-radius:18px; border:1px solid rgba(255,255,255,.12); margin:8px 0 10px; background:#080d08; }}
.preview-grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:8px 0 10px; }}
.preview-grid figure {{ margin:0; }}
.preview-grid img {{ width:100%; height:150px; object-fit:cover; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:#080d08; }}
.preview-grid figcaption {{ margin-top:4px; color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
@media(max-width:780px) {{ .preview-grid {{ grid-template-columns:1fr; }} .preview-grid img {{ height:auto; }} }}
.rank {{ width:42px; height:42px; display:grid; place-items:center; border-radius:16px; border:1px solid rgba(241,200,90,.45); background:rgba(241,200,90,.14); color:#ffe89a; font-weight:900; }}
.path,code {{ color:var(--leaf); overflow-wrap:anywhere; }}
.meta {{ color:var(--water); }}
details {{ margin-top:10px; }}
</style></head><body><main>
<header>
  <p class="eyebrow">Quipsly Studio · Episode 4 source clips</p>
  <h1>Find the watched clips before weaving them.</h1>
  <p>{esc(payload.get('summary'))}</p>
  <p>{esc(payload.get('truth'))}</p>
  <div class="metrics">{metrics}</div>
</header>
<section class="panel"><p class="eyebrow">Scan roots</p><ul>{roots}</ul></section>
<section>{''.join(cards)}</section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def build_payload(args: argparse.Namespace) -> dict[str, Any]:
    roots = [Path(root) for root in args.scan_root]
    state = fetch_state(args.base_url)
    attached = attached_source_paths(state)
    ffprobe = resolve_media_tool("ffprobe")
    scanned = iter_video_files(roots, args.scan_limit)
    rows = [build_candidate(path, attached, ffprobe, args.probe_timeout) for path in scanned]
    rows = [row for row in rows if not row["isAlreadyAttached"] and row["score"] >= args.min_score]
    rows.sort(key=lambda row: (-int(row.get("score") or 0), row.get("path") or ""))
    selected = rows[: args.limit]
    lane_inventory = state.get("sourceLaneInventory") if isinstance(state.get("sourceLaneInventory"), list) else []
    existing_clip_lanes = [
        lane for lane in lane_inventory
        if any(term in " ".join(str(lane.get(key) or "").lower() for key in ("laneName", "name", "role", "sourcePath")) for term in ("source", "reference", "clip", "b-roll", "broll", "youtube"))
    ]
    status = "source-clip-candidates-ready" if selected else "source-clip-candidates-empty"
    return {
        "schema": "quipsly.episode4-source-clip-candidates.v1",
        "status": status,
        "generatedAt": iso_now(),
        "episode": 4,
        "baseUrl": args.base_url,
        "liveSessionName": state.get("activeSessionName"),
        "sequenceTitle": state.get("sequenceTitle"),
        "scanRoots": [str(root) for root in roots],
        "existingAttachedPathCount": len(attached),
        "existingClipLikeLaneCount": len(existing_clip_lanes),
        "counts": {
            "scannedFiles": len(scanned),
            "candidateRows": len(selected),
            "filteredRows": len(rows),
            "probeLimit": args.scan_limit,
        },
        "candidates": selected,
        "watchedClipDropFolders": [
            "/Volumes/My Passport/Episode 4/Watched Clips",
            "/Volumes/My Passport/Episode 4/Source Clips",
            "/Volumes/My Passport/Episode 4/Reference Clips",
        ],
        "summary": "Episode 4 has synced production lanes, but clip-weave needs the actual clips watched during recording attached as whole lanes. This workbench surfaces local candidates, but rows are unconfirmed unless they live in a watched/source/reference drop folder or a human confirms them.",
        "nextSafestAction": "When the real watched clips are identified, put them in /Volumes/My Passport/Episode 4/Watched Clips or Source Clips, rerun this workbench, then import confirmed files as whole reference_clip lanes before creating weave decisions.",
        "truth": "Read-only source-clip discovery. No import, sync decision, timeline edit, source mutation, export, upload, publication, schedule, overwrite, delete, approval, or receipt truth occurred.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Episode 4 source/reference clip candidate workbench.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(OUT_ROOT))
    parser.add_argument("--scan-root", action="append", default=[str(root) for root in DEFAULT_SCAN_ROOTS])
    parser.add_argument("--scan-limit", type=int, default=260)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--min-score", type=int, default=-10)
    parser.add_argument("--probe-timeout", type=int, default=12)
    parser.add_argument("--preview-limit", type=int, default=16)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    payload = build_payload(args)
    session_dir = Path(args.output_root) / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "episode4-source-clip-candidates.json"
    md_path = session_dir / "episode4-source-clip-candidates.md"
    html_path = session_dir / "index.html"
    payload.update({
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
    })
    add_preview_images(payload, session_dir, args.preview_limit)
    write_json(json_path, payload)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": "quipsly.episode4-source-clip-candidates.latest-pointer.v1",
        "generatedAt": iso_now(),
        "status": payload["status"],
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "topCandidates": payload["candidates"][:10],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(LATEST_POINTER, pointer)

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(md_path.read_text(encoding="utf-8"))
    else:
        print(json.dumps({
            "status": payload["status"],
            "htmlPath": str(html_path),
            "jsonPath": str(json_path),
            "candidateRows": payload["counts"]["candidateRows"],
            "topCandidate": payload["candidates"][0] if payload["candidates"] else None,
            "truth": payload["truth"],
        }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
