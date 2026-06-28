#!/usr/bin/env python3
"""Build a local Studio review theater for Episodes 1-6.

The theater is a read-only reviewer surface over the current package quality desk:
long-form 16:9, 9:16, podcast audio, shorts, warnings, and decision prompts in
one calm HTML page. It does not approve, promote, export, publish, upload,
schedule, overwrite, delete, mutate sources, or create receipt truth.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PACKAGE_DESK_POINTER = DEFAULT_RELEASE_ROOT / "review-board/latest-studio-package-quality-desk.json"
LATEST_POINTER = "review-board/studio-review-theater/latest-studio-review-theater.json"
SCHEMA = "quipsly.studio.review-theater.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-review-theater")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    return {**pointer, **target} if target else pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).expanduser().resolve().as_uri()
    except Exception:
        return ""


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def duration_label(seconds: Any) -> str:
    total = int(round(safe_float(seconds)))
    if total <= 0:
        return ""
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def classify_artifact(row: dict[str, Any]) -> str:
    artifact_id = str(row.get("id") or row.get("label") or "").lower()
    if "9x16" in artifact_id or "9:16" in artifact_id:
        return "video9x16"
    if "16x9" in artifact_id or "16:9" in artifact_id:
        return "video16x9"
    if row.get("hasVideo"):
        return "video"
    if row.get("hasAudio"):
        return "audio"
    return "artifact"


def normalize_artifact(row: dict[str, Any]) -> dict[str, Any]:
    path = str(row.get("path") or "")
    return {
        "id": str(row.get("id") or row.get("label") or Path(path).stem),
        "label": str(row.get("label") or row.get("id") or Path(path).name),
        "kind": str(row.get("kind") or classify_artifact(row)),
        "slot": classify_artifact(row),
        "path": path,
        "uri": str(row.get("uri") or file_uri(path)),
        "exists": bool(row.get("exists")) or Path(path).exists(),
        "durationSeconds": safe_float(row.get("durationSeconds")),
        "durationLabel": str(row.get("durationLabel") or duration_label(row.get("durationSeconds"))),
        "hasAudio": bool(row.get("hasAudio")),
        "hasVideo": bool(row.get("hasVideo")),
        "bytes": safe_int(row.get("bytes")),
        "openCommand": f"open {shell_quote(path)}" if path else "",
    }


def duration_value(ep: dict[str, Any], *keys: str) -> tuple[float, str]:
    durations = ep.get("artifactDurations") if isinstance(ep.get("artifactDurations"), dict) else {}
    for key in keys:
        value = durations.get(key)
        if isinstance(value, dict):
            seconds = safe_float(value.get("durationSeconds"))
            label = str(value.get("durationLabel") or duration_label(seconds))
            if seconds or label:
                return seconds, label
        seconds = safe_float(value)
        if seconds:
            return seconds, duration_label(seconds)
    return 0.0, ""


def artifact_from_path(
    *,
    path: Path,
    artifact_id: str,
    label: str,
    slot: str,
    kind: str,
    has_video: bool,
    has_audio: bool,
    duration_seconds: float,
    duration_text: str,
) -> dict[str, Any]:
    return {
        "id": artifact_id,
        "label": label,
        "kind": kind,
        "slot": slot,
        "path": str(path),
        "uri": file_uri(str(path)),
        "exists": path.exists(),
        "durationSeconds": duration_seconds,
        "durationLabel": duration_text or duration_label(duration_seconds),
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "bytes": path.stat().st_size if path.exists() else 0,
        "openCommand": f"open {shell_quote(str(path))}",
        "source": "version-folder-inference",
    }


def media_candidates(version_dir: Path, extension: str) -> list[Path]:
    if not version_dir.exists():
        return []
    patterns = [
        f"video/*.{extension}",
        f"audio/*.{extension}",
        f"*.{extension}",
    ]
    seen: set[Path] = set()
    paths: list[Path] = []
    for pattern in patterns:
        for path in sorted(version_dir.glob(pattern)):
            if path.is_file() and path not in seen:
                seen.add(path)
                paths.append(path)
    return paths


def pick_video_artifact(version_dir: Path, slot: str) -> Path | None:
    opposite = "9x16" if slot == "16x9" else "16x9"
    candidates = [
        path
        for path in media_candidates(version_dir, "mp4")
        if "short" not in path.name.lower()
    ]
    if not candidates:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        points = 0
        if path.parent.name == "video":
            points += 1000
        if slot in name:
            points += 700
        if opposite in name:
            points -= 700
        if "full-release" in name:
            points += 220
        if "duration-candidate" in name:
            points += 180
        if "release-proof" in name:
            points -= 220
        if "podcast-audio" in name:
            points -= 1000
        size = path.stat().st_size if path.exists() else 0
        return points, size, path.name

    best = max(candidates, key=score)
    return best if slot in best.name.lower() else None


def pick_audio_artifact(version_dir: Path) -> Path | None:
    candidates = [
        path
        for path in media_candidates(version_dir, "m4a")
        if "short" not in path.name.lower()
    ]
    if not candidates:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        points = 0
        if path.parent.name == "audio":
            points += 1000
        if "podcast-audio" in name:
            points += 700
        if "full-release" in name:
            points += 220
        if "duration-candidate" in name:
            points += 180
        if "release-proof" in name:
            points -= 220
        size = path.stat().st_size if path.exists() else 0
        return points, size, path.name

    return max(candidates, key=score)


def infer_primary_artifacts(ep: dict[str, Any], version_dir: Path) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    video16 = pick_video_artifact(version_dir, "16x9")
    if video16:
        seconds, label = duration_value(ep, "longForm16x9", "video16x9", "longForm")
        artifacts.append(artifact_from_path(
            path=video16,
            artifact_id="videoMaster16x9",
            label="Long-form 16:9 video",
            slot="video16x9",
            kind="video+audio",
            has_video=True,
            has_audio=True,
            duration_seconds=seconds,
            duration_text=label,
        ))
    video9 = pick_video_artifact(version_dir, "9x16")
    if video9:
        seconds, label = duration_value(ep, "longForm9x16", "video9x16", "vertical")
        artifacts.append(artifact_from_path(
            path=video9,
            artifact_id="videoMaster9x16",
            label="Long-form 9:16 video",
            slot="video9x16",
            kind="video+audio",
            has_video=True,
            has_audio=True,
            duration_seconds=seconds,
            duration_text=label,
        ))
    audio = pick_audio_artifact(version_dir)
    if audio:
        seconds, label = duration_value(ep, "podcastAudio", "audioOnlyPodcast", "audio")
        artifacts.append(artifact_from_path(
            path=audio,
            artifact_id="audioOnlyPodcast",
            label="Audio-only podcast/RSS",
            slot="audio",
            kind="audio",
            has_video=False,
            has_audio=True,
            duration_seconds=seconds,
            duration_text=label,
        ))
    return artifacts


def find_shorts(version_dir: Path, limit: int = 8) -> list[dict[str, Any]]:
    candidates: list[Path] = []
    shorts_dir = version_dir / "shorts"
    if shorts_dir.exists():
        candidates.extend(sorted(path for path in shorts_dir.rglob("*.mp4") if path.is_file()))
    if not candidates and version_dir.exists():
        candidates.extend(sorted(path for path in version_dir.glob("*short*.mp4") if path.is_file()))
    rows = []
    for index, path in enumerate(candidates[:limit], 1):
        rows.append({
            "rank": index,
            "label": path.stem,
            "path": str(path),
            "uri": file_uri(str(path)),
            "exists": path.exists(),
            "openCommand": f"open {shell_quote(str(path))}",
        })
    return rows


def episode_priority(ep: dict[str, Any]) -> str:
    severity = ((ep.get("durationSpreadSeverity") or {}).get("level") if isinstance(ep.get("durationSpreadSeverity"), dict) else "") or ""
    if str(severity) in {"major", "warning"} or safe_float(ep.get("durationSpreadSeconds")) > 30:
        return "needs-attention"
    if str(ep.get("reviewReadiness") or "").lower() in {"approved", "ready"}:
        return "reviewed"
    return "watch-listen"


def normalize_episode(ep: dict[str, Any]) -> dict[str, Any]:
    version_dir = Path(str(ep.get("versionDir") or ""))
    checklist = ep.get("mediaReviewChecklist") if isinstance(ep.get("mediaReviewChecklist"), dict) else {}
    artifacts = [normalize_artifact(row) for row in (checklist.get("artifactRows") or []) if isinstance(row, dict)]
    if not artifacts:
        artifacts = infer_primary_artifacts(ep, version_dir)
    by_slot = {item["slot"]: item for item in artifacts}
    warnings = ep.get("warnings") if isinstance(ep.get("warnings"), list) else []
    blockers = ep.get("blockers") if isinstance(ep.get("blockers"), list) else []
    return {
        "episode": safe_int(ep.get("episode")),
        "version": str(ep.get("version") or ep.get("currentBestVersion") or ""),
        "reviewTargetVersion": str(ep.get("reviewTargetVersion") or ep.get("currentBestVersion") or ep.get("version") or ""),
        "versionDir": str(version_dir),
        "versionDirExists": version_dir.exists(),
        "priority": episode_priority(ep),
        "action": str(ep.get("action") or "Watch/listen and record review"),
        "humanAsk": str(ep.get("humanAsk") or "Watch/listen and record a local review decision."),
        "nextSafestAction": str(ep.get("nextSafestAction") or ep.get("durationDecisionNextAction") or "Open local evidence and record keep/refine/hold/needs-more-evidence."),
        "durationSpreadLabel": str(ep.get("durationSpreadLabel") or ""),
        "durationSpreadSeconds": safe_float(ep.get("durationSpreadSeconds")),
        "durationSeverity": ep.get("durationSpreadSeverity") if isinstance(ep.get("durationSpreadSeverity"), dict) else {},
        "artifactDurations": ep.get("artifactDurations") if isinstance(ep.get("artifactDurations"), dict) else {},
        "readyShortCount": safe_int(ep.get("readyShortCount") or ep.get("shortCount")),
        "shortCount": safe_int(ep.get("shortCount")),
        "warningCount": safe_int(ep.get("warningCount")),
        "blockerCount": safe_int(ep.get("blockerCount")),
        "warnings": warnings,
        "blockers": blockers,
        "artifacts": artifacts,
        "video16x9": by_slot.get("video16x9", {}),
        "video9x16": by_slot.get("video9x16", {}),
        "audio": by_slot.get("audio", {}),
        "shorts": find_shorts(version_dir),
        "reviewDecisionDryRunCommand": next((str(cmd.get("command")) for cmd in ep.get("commands", []) if isinstance(cmd, dict) and cmd.get("kind") == "review-dry-run"), ""),
        "reviewDecisionLiveCommand": next((str(cmd.get("command")) for cmd in ep.get("commands", []) if isinstance(cmd, dict) and cmd.get("kind") == "review-execute-after-preview"), ""),
        "truth": "Review theater row only. It opens local evidence and decision prompts without writing review state or publishing.",
    }


def build(release_root: Path = DEFAULT_RELEASE_ROOT) -> dict[str, Any]:
    desk = load_pointer_target(DEFAULT_PACKAGE_DESK_POINTER)
    episodes = [normalize_episode(ep) for ep in desk.get("episodes", []) if isinstance(ep, dict)]
    counts = desk.get("counts") if isinstance(desk.get("counts"), dict) else {}
    video_rows = sum(1 for ep in episodes for art in ep.get("artifacts", []) if art.get("hasVideo"))
    audio_rows = sum(1 for ep in episodes for art in ep.get("artifacts", []) if art.get("hasAudio") and not art.get("hasVideo"))
    short_rows = sum(len(ep.get("shorts") or []) for ep in episodes)
    missing_artifacts = [
        {"episode": ep.get("episode"), "label": art.get("label"), "path": art.get("path")}
        for ep in episodes
        for art in ep.get("artifacts", [])
        if not art.get("exists")
    ]
    priority_order = {"needs-attention": 0, "watch-listen": 1, "reviewed": 2}
    episodes = sorted(episodes, key=lambda ep: (priority_order.get(str(ep.get("priority")), 9), safe_int(ep.get("episode"))))
    status = "studio-review-theater-ready" if episodes and video_rows else "studio-review-theater-needs-package-desk"
    if missing_artifacts:
        status = "studio-review-theater-ready-with-missing-artifacts"
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(release_root),
        "packageDeskPointerPath": str(DEFAULT_PACKAGE_DESK_POINTER),
        "packageDeskJsonPath": str(desk.get("jsonPath") or ""),
        "packageDeskHtmlPath": str(desk.get("htmlPath") or ""),
        "label": "Studio review theater",
        "humanAsk": "Watch/listen through the current episode packages from one place. Record only local review notes or dry-run decisions until Charlie/Mako/Homer explicitly approve a live local review decision.",
        "nextSafestAction": "Start with Episode 1 v004 candidate evidence and Episode 4 sync mismatch, then watch/listen Episodes 2, 3, 5, and 6 for quality/pacing/platform fit.",
        "episodes": episodes,
        "counts": {
            "episodes": len(episodes),
            "videoRows": video_rows,
            "audioRows": audio_rows,
            "shortRows": short_rows,
            "missingArtifacts": len(missing_artifacts),
            "needsAttentionEpisodes": sum(1 for ep in episodes if ep.get("priority") == "needs-attention"),
            "watchListenEpisodes": sum(1 for ep in episodes if ep.get("priority") == "watch-listen"),
            "readyShortsFromPackageDesk": safe_int(counts.get("readyShorts")),
            "receiptSlots": safe_int(counts.get("receiptSlots")),
            "capturedReceipts": safe_int(counts.get("capturedReceipts")),
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
        "missingArtifacts": missing_artifacts,
        "firstSafeAction": {
            "label": "Open Studio review theater",
            "command": "",
            "path": "",
            "safety": "Opens local review theater only. No approval, promotion, repair, export, publish, upload, schedule, overwrite, source mutation, delete, or receipt truth.",
        },
        "truth": {
            "description": "Studio review theater only. It reads package-desk evidence and embeds local media for review.",
            "approvalsChanged": False,
            "reviewLedgerWritten": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio review theater",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Episodes: `{payload.get('counts', {}).get('episodes')}`",
        f"- Video rows: `{payload.get('counts', {}).get('videoRows')}`",
        f"- Audio rows: `{payload.get('counts', {}).get('audioRows')}`",
        f"- Shorts discovered: `{payload.get('counts', {}).get('shortRows')}`",
        f"- Captured receipts: `{payload.get('counts', {}).get('capturedReceipts')}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Episodes",
    ]
    for ep in payload.get("episodes") or []:
        lines.extend([
            f"### Episode {ep.get('episode')} - {ep.get('priority')}",
            f"- Version: `{ep.get('version')}` / review target `{ep.get('reviewTargetVersion')}`",
            f"- Duration spread: `{ep.get('durationSpreadLabel')}`",
            f"- Human ask: {ep.get('humanAsk')}",
            f"- Next: {ep.get('nextSafestAction')}",
            f"- 16:9: `{(ep.get('video16x9') or {}).get('path')}`",
            f"- 9:16: `{(ep.get('video9x16') or {}).get('path')}`",
            f"- Audio: `{(ep.get('audio') or {}).get('path')}`",
            f"- Shorts shown: `{len(ep.get('shorts') or [])}`",
            "",
        ])
    lines.extend([
        "## Safety",
        "Read-only local review surface. It does not approve, promote, export, publish, upload, schedule, overwrite, mutate sources, delete files, or create receipt truth.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    def video_block(title: str, artifact: dict[str, Any], css_class: str = "") -> str:
        if not artifact or not artifact.get("exists") or not artifact.get("uri"):
            return f"<div class='media missing'><strong>{esc(title)}</strong><p>Missing or unavailable.</p></div>"
        return f"""<div class='media {css_class}'><div class='media-title'>{esc(title)} <span>{esc(artifact.get('durationLabel'))}</span></div><video controls preload='metadata' src='{esc(artifact.get('uri'))}'></video><code>{esc(artifact.get('path'))}</code></div>"""

    def audio_block(artifact: dict[str, Any]) -> str:
        if not artifact or not artifact.get("exists") or not artifact.get("uri"):
            return "<div class='media missing'><strong>Podcast audio</strong><p>Missing or unavailable.</p></div>"
        return f"""<div class='media audio'><div class='media-title'>Podcast audio <span>{esc(artifact.get('durationLabel'))}</span></div><audio controls preload='metadata' src='{esc(artifact.get('uri'))}'></audio><code>{esc(artifact.get('path'))}</code></div>"""

    def short_cards(ep: dict[str, Any]) -> str:
        shorts = ep.get("shorts") or []
        if not shorts:
            return "<p class='muted'>No shorts discovered in this package folder yet.</p>"
        return "".join(
            f"<div class='short'><video controls preload='metadata' src='{esc(item.get('uri'))}'></video><strong>{esc(item.get('label'))}</strong><code>{esc(item.get('path'))}</code></div>"
            for item in shorts
        )

    episode_sections = []
    for ep in payload.get("episodes") or []:
        severity = ((ep.get("durationSeverity") or {}).get("label") if isinstance(ep.get("durationSeverity"), dict) else "") or ep.get("priority")
        warnings = "".join(f"<li>{esc(w)}</li>" for w in ep.get("warnings") or []) or "<li>No package-desk warning rows.</li>"
        blockers = "".join(f"<li>{esc(b)}</li>" for b in ep.get("blockers") or []) or "<li>No package-desk blocker rows.</li>"
        episode_sections.append(f"""
<section class='episode {esc(ep.get('priority'))}' id='episode-{esc(ep.get('episode'))}'>
  <div class='episode-head'>
    <div><div class='kicker'>Episode {esc(ep.get('episode'))}</div><h2>{esc(ep.get('action'))}</h2><p>{esc(ep.get('humanAsk'))}</p></div>
    <div class='status'><strong>{esc(ep.get('durationSpreadLabel'))}</strong><span>{esc(severity)}</span></div>
  </div>
  <div class='decision'><strong>Next safest action</strong><p>{esc(ep.get('nextSafestAction'))}</p><p><strong>Dry-run decision:</strong> <code>{esc(ep.get('reviewDecisionDryRunCommand'))}</code></p></div>
  <div class='media-grid'>{video_block('16:9 long-form', ep.get('video16x9') or {}, 'wide')}{video_block('9:16 vertical', ep.get('video9x16') or {}, 'vertical')}{audio_block(ep.get('audio') or {})}</div>
  <details><summary>Warnings and blockers</summary><div class='two'><div><h4>Warnings</h4><ul>{warnings}</ul></div><div><h4>Blockers</h4><ul>{blockers}</ul></div></div></details>
  <details><summary>Shorts discovered in package ({len(ep.get('shorts') or [])})</summary><div class='short-grid'>{short_cards(ep)}</div></details>
</section>""")
    nav = "".join(f"<a href='#episode-{esc(ep.get('episode'))}'>Ep {esc(ep.get('episode'))}<span>{esc(ep.get('priority'))}</span></a>" for ep in payload.get("episodes") or [])
    counts = payload.get("counts", {}) if isinstance(payload.get("counts"), dict) else {}
    html_text = f"""<!doctype html>
<html><head><meta charset='utf-8'><title>Studio review theater</title>
<style>
:root {{ color-scheme: dark; --bg:#121715; --panel:#1b241f; --panel2:#243129; --line:#405344; --text:#f7f0dd; --muted:#bec8b2; --honey:#e8b84d; --leaf:#7fd987; --clay:#d46f50; --sky:#65c7df; }}
* {{ box-sizing:border-box; }} body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 10% 0%,#2c3d30,#121715 48%); color:var(--text); }}
main {{ max-width:1500px; margin:0 auto; padding:28px; }} .hero,.episode {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(31,43,35,.94),rgba(18,23,21,.97)); border-radius:28px; padding:22px; box-shadow:0 22px 70px rgba(0,0,0,.35); }}
.hero {{ position:sticky; top:0; z-index:3; backdrop-filter: blur(20px); }} .kicker {{ color:var(--honey); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }} h1 {{ margin:8px 0; font-size:44px; line-height:1; }} h2 {{ margin:4px 0 8px; font-size:28px; }} p {{ color:var(--muted); line-height:1.5; }}
.metrics {{ display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:14px; }} .metric {{ background:var(--panel2); border:1px solid var(--line); border-radius:16px; padding:12px; }} .metric strong {{ display:block; font-size:24px; color:var(--leaf); }} .metric span {{ color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.08em; }}
.nav {{ display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }} .nav a {{ text-decoration:none; color:var(--text); background:#121816; border:1px solid var(--line); border-radius:999px; padding:8px 12px; }} .nav span {{ margin-left:8px; color:var(--honey); font-size:11px; }}
.stack {{ display:grid; gap:18px; margin-top:18px; }} .episode-head {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }} .status {{ min-width:140px; background:#121816; border:1px solid var(--line); border-radius:18px; padding:12px; text-align:center; }} .status strong {{ display:block; font-size:24px; color:var(--honey); }} .status span {{ color:var(--muted); font-size:12px; }}
.decision {{ border-left:4px solid var(--honey); padding:10px 14px; background:rgba(232,184,77,.08); border-radius:12px; margin:14px 0; }} code {{ display:block; color:#d9e3cf; background:#0d1210; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:8px; overflow:auto; font-size:11px; }}
.media-grid {{ display:grid; grid-template-columns:1.35fr .55fr 1fr; gap:14px; align-items:start; }} .media {{ background:#101613; border:1px solid var(--line); border-radius:18px; padding:12px; overflow:hidden; }} .media-title {{ display:flex; justify-content:space-between; gap:8px; color:var(--honey); font-weight:800; margin-bottom:8px; }} .media-title span {{ color:var(--muted); font-weight:600; }} video {{ width:100%; max-height:430px; background:#050706; border-radius:14px; }} .vertical video {{ max-height:520px; object-fit:contain; }} audio {{ width:100%; }} .missing {{ border-color:rgba(212,111,80,.7); }}
details {{ margin-top:12px; background:rgba(255,255,255,.035); border:1px solid rgba(255,255,255,.08); border-radius:16px; padding:12px; }} summary {{ cursor:pointer; color:var(--honey); font-weight:800; }} .two {{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }} .short-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-top:12px; }} .short {{ background:#101613; border:1px solid var(--line); border-radius:16px; padding:10px; }} .short video {{ max-height:260px; }} .short strong {{ display:block; margin:8px 0; }} .muted {{ color:var(--muted); }}
.needs-attention {{ border-color:rgba(212,111,80,.65); }} .watch-listen {{ border-color:rgba(232,184,77,.45); }}
@media(max-width:1000px) {{ main {{ padding:14px; }} .metrics {{ grid-template-columns:repeat(2,minmax(0,1fr)); }} .media-grid,.two {{ grid-template-columns:1fr; }} .hero {{ position:static; }} h1 {{ font-size:34px; }} }}
</style></head><body><main>
<section class='hero'><div class='kicker'>Quipsly Studio</div><h1>Review theater</h1><p>{esc(payload.get('humanAsk'))}</p><p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p>
<div class='metrics'><div class='metric'><strong>{esc(counts.get('episodes'))}</strong><span>episodes</span></div><div class='metric'><strong>{esc(counts.get('videoRows'))}</strong><span>videos</span></div><div class='metric'><strong>{esc(counts.get('audioRows'))}</strong><span>audio</span></div><div class='metric'><strong>{esc(counts.get('shortRows'))}</strong><span>shorts linked</span></div><div class='metric'><strong>{esc(counts.get('needsAttentionEpisodes'))}</strong><span>attention</span></div><div class='metric'><strong>{esc(counts.get('capturedReceipts'))}</strong><span>receipts</span></div></div>
<div class='nav'>{nav}</div></section><div class='stack'>{''.join(episode_sections)}</div>
<section class='episode'><h2>Safety truth</h2><p>This page is a local viewing surface only. It does not approve, promote, repair, export, publish, upload, schedule, overwrite, delete, mutate sources, or create receipt truth.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def render_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["episode", "priority", "version", "durationSpread", "video16x9", "video9x16", "audio", "shorts", "nextSafestAction"])
        writer.writeheader()
        for ep in payload.get("episodes") or []:
            writer.writerow({
                "episode": ep.get("episode"),
                "priority": ep.get("priority"),
                "version": ep.get("version"),
                "durationSpread": ep.get("durationSpreadLabel"),
                "video16x9": (ep.get("video16x9") or {}).get("path"),
                "video9x16": (ep.get("video9x16") or {}).get("path"),
                "audio": (ep.get("audio") or {}).get("path"),
                "shorts": len(ep.get("shorts") or []),
                "nextSafestAction": ep.get("nextSafestAction"),
            })


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Build Studio review theater.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser().resolve()
    payload = build(release_root)
    out_dir = release_root / "review-board" / "studio-review-theater" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio-review-theater.json"
    markdown_path = out_dir / "START-HERE-studio-review-theater.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "studio-review-theater.csv"
    payload.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path), "csvPath": str(csv_path)})
    payload["firstSafeAction"]["path"] = str(html_path)
    payload["firstSafeAction"]["command"] = f"open {shell_quote(str(html_path))}"
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    render_csv(csv_path, payload)
    pointer_payload = {
        "schema": "quipsly.studio.latest-review-theater.v1",
        "generatedAt": payload["generatedAt"],
        "status": payload["status"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "counts": payload.get("counts") or {},
        "humanAsk": payload.get("humanAsk") or "",
        "nextSafestAction": payload.get("nextSafestAction") or "",
        "firstSafeAction": payload.get("firstSafeAction") or {},
        "truth": payload.get("truth") or {},
    }
    latest_path = release_root / LATEST_POINTER
    write_json(latest_path, pointer_payload)
    print(json.dumps({"ok": True, **pointer_payload}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
