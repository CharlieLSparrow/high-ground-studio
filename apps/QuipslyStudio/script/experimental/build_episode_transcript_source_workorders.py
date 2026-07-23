#!/usr/bin/env python3
"""Build transcript source work orders for episode media.

This inventories audio-bearing media that could improve episode transcripts:
external high-quality audio, call recordings, podcast masters, and video scratch
tracks. It creates review-only work orders and suggested commands; it does not
run ASR, write transcript sidecars, import transcripts, edit timelines, mutate
media, publish, schedule, or create receipt truth.
"""
from __future__ import annotations

import hashlib
import html
import json
import os
import re
import shlex
import shutil
import subprocess
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
EXTERNAL_ROOT = Path("/Volumes/My Passport")
OUT_ROOT = RELEASE_ROOT / "review-board" / "transcript-source-workorders"
SCHEMA = "quipsly.episode-transcript-source-workorders.v1"
TRANSCRIPT_PROVIDER = Path(__file__).resolve().parent.parent / "local_transcript_provider.py"

MEDIA_EXTENSIONS = {".wav", ".aif", ".aiff", ".m4a", ".mp3", ".aac", ".flac", ".mp4", ".mov", ".mkv", ".insv"}
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".m4a", ".mp3", ".aac", ".flac"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".insv"}
SKIP_PART_NAMES = {"captions", "thumbnails", "transcripts", "platform-copy", "node_modules", ".trashes", ".spotlight-v100", ".fseventsd"}
LOW_VALUE_PART_NAMES = {"shorts", "social-ready", "social-publication-queue"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-source-workorders")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(value).lower()).strip("-")
    return cleaned or "media"


def safe_id(path: Path) -> str:
    digest = hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:10]
    return f"{slug(path.stem)[:50]}-{digest}"


def candidate_roots(episode_filter: int | None = None) -> list[dict[str, Any]]:
    roots = [
        {"label": "release packages", "path": RELEASE_ROOT, "kind": "release-package"},
        {"label": "Episode 1 source folder", "path": EXTERNAL_ROOT / "Episode 1", "kind": "source-folder"},
        {"label": "Episode 2 source folder", "path": EXTERNAL_ROOT / "Episode 2", "kind": "source-folder"},
        {"label": "Episode 3 source folder", "path": EXTERNAL_ROOT / "Episode 3", "kind": "source-folder"},
        {"label": "Episode 4 source folder", "path": EXTERNAL_ROOT / "Episode 4", "kind": "source-folder"},
        {"label": "Episode 5 source folder", "path": EXTERNAL_ROOT / "Episode 5", "kind": "source-folder"},
        {"label": "Episode 6 source folder", "path": EXTERNAL_ROOT / "Episode 6", "kind": "source-folder"},
        {"label": "Podcast_Episodes source folders", "path": EXTERNAL_ROOT / "Podcast_Episodes", "kind": "source-folder"},
        {"label": "Desktop Media audio stash", "path": EXTERNAL_ROOT / "Desktop Media", "kind": "source-folder"},
        {"label": "Episode Potential Recordings", "path": EXTERNAL_ROOT / "Episode Potential Recordings", "kind": "source-folder"},
        {"label": "Insta360 Download", "path": EXTERNAL_ROOT / "Insta360 Download", "kind": "source-folder"},
    ]
    if episode_filter:
        keep_labels = {
            "release packages",
            f"Episode {episode_filter} source folder",
            "Podcast_Episodes source folders",
            "Desktop Media audio stash",
        }
        roots = [root for root in roots if root["label"] in keep_labels]
    return [root for root in roots if Path(root["path"]).exists()]


def should_skip_path(path: Path) -> bool:
    parts = {part.lower() for part in path.parts}
    if parts & SKIP_PART_NAMES:
        return True
    name = path.name.lower()
    if name.startswith("._"):
        return True
    return False


def is_derivative_path(path: Path) -> bool:
    parts = {part.lower() for part in path.parts}
    name = path.name.lower()
    return bool(parts & LOW_VALUE_PART_NAMES) or "short" in name or "thumbnail" in name


def discover_media(episode_filter: int | None = None) -> list[dict[str, Any]]:
    seen: set[Path] = set()
    records: list[dict[str, Any]] = []
    for root in candidate_roots(episode_filter):
        root_path = Path(root["path"])
        for dirpath, dirnames, filenames in os.walk(root_path, topdown=True, onerror=lambda _err: None):
            dirnames[:] = [d for d in dirnames if d.lower() not in SKIP_PART_NAMES]
            directory = Path(dirpath)
            for filename in filenames:
                path = directory / filename
                if path.suffix.lower() not in MEDIA_EXTENSIONS:
                    continue
                if should_skip_path(path):
                    continue
                try:
                    resolved = path.resolve()
                except Exception:
                    resolved = path
                if resolved in seen:
                    continue
                seen.add(resolved)
                records.append({"path": resolved, "rootLabel": root["label"], "rootKind": root["kind"], "derivative": is_derivative_path(resolved)})
    return sorted(records, key=lambda item: str(item["path"]).lower())


def ffprobe(path: Path) -> dict[str, Any]:
    command = [
        "ffprobe", "-v", "error", "-show_entries",
        "format=duration,size:stream=codec_type,codec_name,channels,sample_rate,width,height,r_frame_rate",
        "-of", "json", str(path),
    ]
    try:
        result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=12, check=False)
        if result.returncode != 0:
            return {"ok": False, "error": result.stderr.strip() or result.stdout.strip() or "ffprobe failed"}
        payload = json.loads(result.stdout or "{}")
        streams = payload.get("streams") if isinstance(payload.get("streams"), list) else []
        fmt = payload.get("format") if isinstance(payload.get("format"), dict) else {}
        return {"ok": True, "streams": streams, "format": fmt}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def duration_label(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def infer_episode(path: Path) -> int | None:
    text = str(path).lower()
    patterns = [
        r"episode[_\s-]*0?([1-6])\b",
        r"episode_0?([1-6])\b",
        r"\bep\s*0?([1-6])\b",
        r"\bep0?([1-6])\b",
        r"episode-0?([1-6])\b",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return int(match.group(1))
    name = path.name.lower()
    if "first pod" in name or "ep1" in name or "episode1" in name:
        return 1
    if "title sequence" in name and "2" in name:
        return 2
    if "ep3" in name:
        return 3
    if "ep4" in name or "charlie ep4" in name:
        return 4
    if "episode 6" in name or "ep 6" in name:
        return 6
    return None


def classify_source(path: Path, has_video: bool, root_kind: str, derivative: bool) -> tuple[str, str, int]:
    text = str(path).lower()
    suffix = path.suffix.lower()
    if derivative:
        return "derivative-short-or-social", "Low priority: derivative output. Transcribe only if source transcript is unavailable or this exact exported clip needs caption QA.", 5
    if "podcast-audio" in text:
        return "exported-podcast-master", "High value for RSS/show notes and final audio boundary checks.", 2
    if "call with" in text or re.search(r"\bcall\b", path.name.lower()):
        return "call-recording", "High value continuity source; useful for speaker/content recovery when camera or external audio breaks.", 1
    if suffix in {".wav", ".aif", ".aiff", ".flac"}:
        return "external-high-quality-audio", "High value word source; likely best ASR quality when synced correctly.", 1
    if suffix in AUDIO_EXTENSIONS:
        return "external-audio", "Useful audio source; compare against HQ and call tracks for transcript confidence.", 2
    if has_video and root_kind == "release-package":
        return "exported-video-audio", "Useful for validating final exported video/audio alignment; not always best word source.", 3
    if has_video:
        return "source-video-scratch-audio", "Useful sync anchor and fallback transcript source; scratch audio may be lower quality.", 3
    return "unknown-audio-bearing-media", "Needs human classification before relying on transcript quality.", 4


def transcript_output_plan(path: Path, episode: int | None, media_id: str) -> dict[str, Any]:
    ep_label = f"episode-{episode:02d}" if episode else "episode-unknown"
    base_dir = OUT_ROOT / "planned-transcripts" / ep_label
    return {
        "sidecarSrtPath": str(base_dir / f"{media_id}.srt"),
        "sidecarJsonPath": str(base_dir / f"{media_id}.quipsly-transcript.json"),
        "providerCommandTemplate": f"{shell_quote(str(TRANSCRIPT_PROVIDER))} {shell_quote(str(path))} > {shell_quote(str(base_dir / (media_id + '.srt')))}",
        "doctorCommand": f"{shell_quote(str(TRANSCRIPT_PROVIDER))} --doctor",
    }


def build_record(item: dict[str, Any]) -> dict[str, Any] | None:
    path = Path(item["path"])
    probe = ffprobe(path)
    if not probe.get("ok"):
        return {
            "mediaId": safe_id(path),
            "path": str(path),
            "rootLabel": item.get("rootLabel"),
            "rootKind": item.get("rootKind"),
            "status": "probe-failed",
            "probeError": probe.get("error"),
            "transcriptionPriority": 9,
            "recommendedAction": "Investigate media readability before transcript work.",
        }
    streams = probe.get("streams") or []
    audio_streams = [s for s in streams if s.get("codec_type") == "audio"]
    video_streams = [s for s in streams if s.get("codec_type") == "video"]
    if not audio_streams:
        return None
    fmt = probe.get("format") or {}
    try:
        duration = float(fmt.get("duration")) if fmt.get("duration") else None
    except Exception:
        duration = None
    media_id = safe_id(path)
    episode = infer_episode(path)
    source_kind, value_note, priority = classify_source(path, bool(video_streams), str(item.get("rootKind") or ""), bool(item.get("derivative")))
    plan = transcript_output_plan(path, episode, media_id)
    return {
        "mediaId": media_id,
        "episode": episode,
        "episodeLabel": f"Episode {episode}" if episode else "Episode unknown",
        "path": str(path),
        "fileName": path.name,
        "rootLabel": item.get("rootLabel"),
        "rootKind": item.get("rootKind"),
        "sourceKind": source_kind,
        "status": "transcript-needed",
        "transcriptionPriority": priority,
        "durationSeconds": duration,
        "durationLabel": duration_label(duration),
        "hasAudio": True,
        "hasVideo": bool(video_streams),
        "audioStreams": audio_streams,
        "videoStreams": video_streams,
        "sizeBytes": int(fmt.get("size") or 0) if str(fmt.get("size") or "").isdigit() else None,
        "valueNote": value_note,
        "transcriptOutputPlan": plan,
        "safeNextAction": "Run ASR into the planned sidecar path, then import/reconcile transcript metadata only after review.",
        "truth": {
            "inventoryOnly": True,
            "asrRun": False,
            "transcriptSidecarWritten": False,
            "transcriptImported": False,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def provider_doctor() -> dict[str, Any]:
    if not TRANSCRIPT_PROVIDER.exists():
        return {"exists": False, "path": str(TRANSCRIPT_PROVIDER), "available": False}
    try:
        result = subprocess.run([str(TRANSCRIPT_PROVIDER), "--doctor"], text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20, check=False)
        payload = json.loads(result.stdout) if result.stdout.strip().startswith("{") else {}
        payload.update({"exists": True, "path": str(TRANSCRIPT_PROVIDER), "returnCode": result.returncode})
        if result.stderr.strip():
            payload["stderrTail"] = result.stderr[-1200:]
        payload["available"] = bool(
            result.returncode == 0 and (
                payload.get("pythonWhisperAvailable")
                or payload.get("mlxWhisperAvailable")
                or payload.get("whisperCliPath")
                or (payload.get("whisperCppCliPath") and payload.get("whisperCppModelExists"))
            )
        )
        return payload
    except Exception as exc:
        return {"exists": TRANSCRIPT_PROVIDER.exists(), "path": str(TRANSCRIPT_PROVIDER), "available": False, "error": str(exc)}


def build(episode_filter: int | None = None) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    probe_failures: list[dict[str, Any]] = []
    for item in discover_media(episode_filter):
        record = build_record(item)
        if not record:
            continue
        if episode_filter and record.get("episode") != episode_filter:
            continue
        if record.get("status") == "probe-failed":
            probe_failures.append(record)
        else:
            records.append(record)
    records.sort(key=lambda r: (int(r.get("episode") or 99), int(r.get("transcriptionPriority") or 9), str(r.get("sourceKind") or ""), str(r.get("path") or "")))
    by_episode: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        key = str(record.get("episode") or "unknown")
        by_episode.setdefault(key, []).append(record)
    episode_packets = []
    for key, items in sorted(by_episode.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 99):
        episode_packets.append({
            "episode": int(key) if key.isdigit() else None,
            "episodeLabel": f"Episode {key}" if key.isdigit() else "Episode unknown",
            "sources": items,
            "counts": {
                "sources": len(items),
                "priorityHigh": len([x for x in items if int(x.get("transcriptionPriority") or 9) <= 2]),
                "videoScratch": len([x for x in items if "video" in str(x.get("sourceKind") or "")]),
                "callRecordings": len([x for x in items if x.get("sourceKind") == "call-recording"]),
                "externalAudio": len([x for x in items if "external" in str(x.get("sourceKind") or "")]),
                "podcastMasters": len([x for x in items if x.get("sourceKind") == "exported-podcast-master"]),
            },
            "reconciliationPlan": [
                "Prefer high-quality external audio or call recording for word accuracy when available.",
                "Use exported podcast master to verify final edit/audio boundary.",
                "Use video scratch audio as sync anchor and fallback, not as primary transcript truth unless it is the only available source.",
                "Keep separate source transcripts; promote a reconciled transcript spine only after comparing timing and speaker confidence.",
            ],
        })
    doctor = provider_doctor()
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "transcript-source-workorders-ready" if records else "transcript-source-workorders-empty",
        "releaseRoot": str(RELEASE_ROOT),
        "episodeFilter": episode_filter,
        "candidateRoots": [{**root, "path": str(root["path"])} for root in candidate_roots(episode_filter)],
        "providerDoctor": doctor,
        "counts": {
            "episodes": len(episode_packets),
            "sources": len(records),
            "highPrioritySources": len([r for r in records if int(r.get("transcriptionPriority") or 9) <= 2]),
            "videoAudioSources": len([r for r in records if r.get("hasVideo")]),
            "audioOnlySources": len([r for r in records if not r.get("hasVideo")]),
            "callRecordings": len([r for r in records if r.get("sourceKind") == "call-recording"]),
            "externalHighQualityAudio": len([r for r in records if r.get("sourceKind") == "external-high-quality-audio"]),
            "podcastMasters": len([r for r in records if r.get("sourceKind") == "exported-podcast-master"]),
            "derivativeSources": len([r for r in records if r.get("sourceKind") == "derivative-short-or-social"]),
            "probeFailures": len(probe_failures),
            "asrRun": 0,
            "transcriptsImported": 0,
        },
        "truth": {
            "inventoryOnly": True,
            "asrRun": False,
            "transcriptSidecarsWritten": False,
            "transcriptsImported": False,
            "timelineDecisionsWritten": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
        "nextSafestAction": "Run the transcript provider doctor, then transcribe high-priority Episode sources into planned sidecars before reconciling one transcript spine.",
        "episodes": episode_packets,
        "sources": records,
        "probeFailures": probe_failures,
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Episode transcript source work orders",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This inventories audio-bearing episode sources for future ASR. It does not run transcription or import transcript truth.",
        "",
        f"Provider doctor available: `{(payload.get('providerDoctor') or {}).get('available')}`",
        f"Provider doctor command: `{shell_quote(str(TRANSCRIPT_PROVIDER))} --doctor`",
        "",
        "## Why multiple transcripts",
        "",
        "- External high-quality audio is usually best for words.",
        "- Call recordings can preserve continuity when cameras or external tracks break.",
        "- Video scratch audio helps sync and verifies what was present at a moment.",
        "- Podcast/export audio verifies final edit boundaries.",
        "- Reconciled transcript truth should be promoted after comparison, not guessed from one source.",
        "",
        "## Episode summary",
        "",
        "| Episode | Sources | High priority | Call | External audio | Video audio | Podcast masters |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for ep in payload.get("episodes") or []:
        counts = ep.get("counts") or {}
        lines.append(f"| {ep.get('episodeLabel')} | {counts.get('sources', 0)} | {counts.get('priorityHigh', 0)} | {counts.get('callRecordings', 0)} | {counts.get('externalAudio', 0)} | {counts.get('videoScratch', 0)} | {counts.get('podcastMasters', 0)} |")
    lines.extend(["", "## High priority work orders", ""])
    for source in [s for s in payload.get("sources") or [] if int(s.get("transcriptionPriority") or 9) <= 2][:80]:
        plan = source.get("transcriptOutputPlan") or {}
        lines.extend([
            f"### {source.get('episodeLabel')} · {source.get('sourceKind')} · `{source.get('fileName')}`",
            "",
            f"- Duration: `{source.get('durationLabel')}`",
            f"- Path: `{source.get('path')}`",
            f"- Value: {source.get('valueNote')}",
            f"- Planned SRT: `{plan.get('sidecarSrtPath')}`",
            f"- Suggested command: `{plan.get('providerCommandTemplate')}`",
            "",
        ])
    lines.extend([
        "## Safety boundary",
        "",
        "- No ASR was run by this work-order board.",
        "- No transcript sidecars were written or imported.",
        "- No media, source files, timelines, exports, approvals, uploads, publications, schedules, or receipt truth were mutated.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    sections = []
    for ep in payload.get("episodes") or []:
        cards = []
        for source in ep.get("sources") or []:
            plan = source.get("transcriptOutputPlan") or {}
            priority = int(source.get("transcriptionPriority") or 9)
            cards.append(f"""
            <article class="source p{priority}">
              <p class="eyebrow">Priority {priority} · {esc(source.get('sourceKind'))}</p>
              <h3>{esc(source.get('fileName'))}</h3>
              <p><b>Duration:</b> {esc(source.get('durationLabel'))} · <b>Kind:</b> {'video+audio' if source.get('hasVideo') else 'audio-only'}</p>
              <p>{esc(source.get('valueNote'))}</p>
              <p class="path">{esc(source.get('path'))}</p>
              <details><summary>Planned sidecar command</summary><pre><code>{esc(plan.get('providerCommandTemplate'))}</code></pre></details>
            </article>
            """)
        counts = ep.get("counts") or {}
        sections.append(f"""
        <section class="episode">
          <p class="eyebrow">{esc(ep.get('episodeLabel'))}</p>
          <h2>{esc(counts.get('sources'))} audio-bearing sources · {esc(counts.get('priorityHigh'))} high priority</h2>
          <p class="muted">Call {esc(counts.get('callRecordings'))} · external {esc(counts.get('externalAudio'))} · video scratch {esc(counts.get('videoScratch'))} · podcast masters {esc(counts.get('podcastMasters'))}</p>
          <div class="grid">{''.join(cards)}</div>
        </section>
        """)
    doctor = payload.get("providerDoctor") or {}
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Episode transcript source work orders</title>
<style>
:root {{ color-scheme:dark; --bg:#101710; --panel:#1c2a20; --ink:#fff0d2; --muted:#c9bda1; --gold:#edcb58; --leaf:#82db8d; --water:#67c9dc; --line:#3b5137; --clay:#dc805b; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(103,201,220,.16),transparent 30%),linear-gradient(135deg,#101710,#1d2119); color:var(--ink); }}
main {{ max-width:1320px; margin:0 auto; padding:36px 24px 80px; }}
header,.episode {{ border:1px solid var(--line); border-radius:28px; background:rgba(28,42,32,.94); padding:24px; margin:18px 0; box-shadow:0 18px 50px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,74px); line-height:.92; margin:0 0 12px; }}
h2,h3 {{ margin:.2rem 0 .7rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-weight:900; font-size:12px; }}
.muted {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }}
.source {{ border:1px solid var(--line); border-radius:18px; background:rgba(20,29,22,.98); padding:14px; }}
.source.p1,.source.p2 {{ border-color:rgba(130,219,141,.75); }}
.source.p3 {{ border-color:rgba(237,203,88,.65); }}
.source.p4,.source.p5 {{ border-color:rgba(220,128,91,.55); }}
.path {{ color:var(--muted); font-size:12px; overflow-wrap:anywhere; }}
pre {{ white-space:pre-wrap; color:var(--leaf); }}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Studio · transcript runway</p><h1>Transcript source work orders</h1><p>Every useful audio source becomes visible before transcription: HQ audio, call recordings, video scratch audio, and exported podcast/video audio.</p><p><b>Provider available:</b> {esc(doctor.get('available'))} · <b>Next:</b> {esc(payload.get('nextSafestAction'))}</p></header>
{''.join(sections)}
<section class="episode"><p class="eyebrow">Safety</p><p>No ASR, transcript sidecar write, transcript import, timeline mutation, export, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth was created.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def latest_pointer_name(episode_filter: int | None) -> str:
    if episode_filter:
        return f"latest-transcript-source-workorders-episode-{episode_filter:02d}.json"
    return "latest-transcript-source-workorders.json"


def main() -> None:
    parser = argparse.ArgumentParser(description="Build transcript source work orders.")
    parser.add_argument("--episode", type=int, choices=range(1, 99), help="Focus on one episode without overwriting the global latest pointer.")
    args = parser.parse_args()

    payload = build(args.episode)
    session_dir = OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "transcript-source-workorders.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-transcript-source-workorders.md"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open transcript source work orders",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local transcript-source inventory only. It does not run ASR, write transcript sidecars, import transcripts, mutate media, render, approve, upload, publish, schedule, overwrite, delete, or create receipt truth.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    latest = OUT_ROOT / latest_pointer_name(args.episode)
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": payload["status"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload.get("counts") or {},
        "firstSafeAction": payload.get("firstSafeAction") or {},
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
