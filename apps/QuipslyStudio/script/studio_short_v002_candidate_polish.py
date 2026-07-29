#!/usr/bin/env python3
"""Create a non-overwriting v002b polish candidate from v002 evidence.

First use case: trim likely trailing dead air detected in a v002 candidate evidence
packet. This is still derivative proof work, not canonical whole-source editing.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_EVIDENCE_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"
SCHEMA = "quipsly.studio.short-v002b-polish-candidate.v1"
VERSION = "2026-07-03.v1"


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def slug(text: str) -> str:
    out = []
    for char in text.lower():
        if char.isalnum():
            out.append(char)
        elif out and out[-1] != "-":
            out.append("-")
    return "".join(out).strip("-") or "candidate"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Missing JSON: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"Missing required tool: {name}")
    return path


def run(command: list[str], timeout: int = 180) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)


def latest_evidence_path(short_id: str, root: Path) -> Path:
    pointer = root / f"latest-{slug(short_id)}-v002-candidate-evidence.json"
    if pointer.exists():
        pointer_data = load_json(pointer)
        raw = pointer_data.get("jsonPath")
        if raw and Path(str(raw)).exists():
            return Path(str(raw))
    folder = root / slug(short_id)
    candidates = sorted(folder.glob("*/*v002-candidate-evidence.json"), key=lambda p: (p.stat().st_mtime, str(p)), reverse=True)
    if candidates:
        return candidates[0]
    raise SystemExit(f"No evidence packet found for {short_id}. Run studio-short-v002-candidate-evidence first.")


def probe_media(ffprobe: str, path: Path) -> dict[str, Any]:
    result = run([
        ffprobe,
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ], timeout=45)
    if result.returncode != 0:
        return {"ok": False, "error": (result.stderr or result.stdout).strip()}
    data = json.loads(result.stdout or "{}")
    streams = data.get("streams") if isinstance(data.get("streams"), list) else []
    video = next((s for s in streams if s.get("codec_type") == "video"), {})
    audio = next((s for s in streams if s.get("codec_type") == "audio"), {})
    fmt = data.get("format") if isinstance(data.get("format"), dict) else {}
    duration = None
    for raw in (fmt.get("duration"), video.get("duration"), audio.get("duration")):
        try:
            if raw is not None:
                duration = float(raw)
                break
        except (TypeError, ValueError):
            continue
    return {
        "ok": True,
        "durationSeconds": duration,
        "width": video.get("width"),
        "height": video.get("height"),
        "hasAudio": bool(audio),
        "hasVideo": bool(video),
        "audioCodec": audio.get("codec_name"),
        "videoCodec": video.get("codec_name"),
    }


def choose_trim(evidence: dict[str, Any], min_saved_seconds: float) -> dict[str, Any]:
    probe = evidence.get("probe") if isinstance(evidence.get("probe"), dict) else {}
    duration = probe.get("durationSeconds")
    if not isinstance(duration, (int, float)) or duration <= 0:
        raise SystemExit("Evidence packet lacks usable durationSeconds.")
    audio = evidence.get("audioDiagnostics") if isinstance(evidence.get("audioDiagnostics"), dict) else {}
    metrics = audio.get("metrics") if isinstance(audio.get("metrics"), dict) else {}
    segments = metrics.get("silenceSegments") if isinstance(metrics.get("silenceSegments"), list) else []
    candidates: list[dict[str, float]] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        end = segment.get("end")
        silence_duration = segment.get("duration")
        if not isinstance(end, (int, float)) or not isinstance(silence_duration, (int, float)):
            continue
        start = float(end) - float(silence_duration)
        if start < 4.0:
            continue
        if start < float(duration) * 0.50:
            continue
        if float(silence_duration) < 0.8:
            continue
        saved = float(duration) - max(start + 0.2, 0)
        if saved >= min_saved_seconds:
            candidates.append({"start": start, "end": float(end), "duration": float(silence_duration), "savedSeconds": saved})
    if not candidates:
        return {"ok": False, "reason": "No silence segment would save enough time to justify an automatic v002b trim.", "durationSeconds": duration}
    selected = sorted(candidates, key=lambda item: (item["start"], item["duration"]), reverse=True)[0]
    trim_end = max(1.0, selected["start"] + 0.2)
    trim_end = min(trim_end, float(duration) - 0.1)
    return {
        "ok": True,
        "reason": "Trim likely trailing dead air detected by v002 evidence.",
        "durationSeconds": float(duration),
        "trimStartSeconds": 0.0,
        "trimEndSeconds": trim_end,
        "targetDurationSeconds": trim_end,
        "selectedSilence": selected,
    }


def render_candidate(ffmpeg: str, source: Path, target: Path, trim: dict[str, Any]) -> dict[str, Any]:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise SystemExit(f"Refusing to overwrite existing candidate: {target}")
    duration = float(trim["targetDurationSeconds"])
    result = run([
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(source),
        "-t", f"{duration:.3f}",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "18",
        "-c:a", "aac",
        "-b:a", "160k",
        "-movflags", "+faststart",
        str(target),
    ], timeout=180)
    return {
        "ok": result.returncode == 0 and target.exists(),
        "exitCode": result.returncode,
        "path": str(target),
        "error": (result.stderr or result.stdout).strip() if result.returncode != 0 else "",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# V002b short polish candidate",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        "",
        "## Output",
        "",
        f"- Candidate: `{payload.get('output', {}).get('path')}`",
        f"- Duration: `{payload.get('output', {}).get('probe', {}).get('durationSeconds')}`",
        "",
        "## Polish decision",
        "",
        f"- Reason: {payload.get('trim', {}).get('reason')}",
        f"- Trim end: `{payload.get('trim', {}).get('trimEndSeconds')}`",
        f"- Saved: `{payload.get('trim', {}).get('selectedSilence', {}).get('savedSeconds')}` seconds",
        "",
        "## Truth boundary",
        "",
        str(payload.get("truth") or ""),
    ]
    return "\n".join(lines).rstrip() + "\n"


def build(args: argparse.Namespace) -> dict[str, Any]:
    short_id = args.short_id
    evidence_path = Path(args.evidence).expanduser() if args.evidence else latest_evidence_path(short_id, Path(args.evidence_root).expanduser())
    evidence = load_json(evidence_path)
    candidate = evidence.get("candidate") if isinstance(evidence.get("candidate"), dict) else {}
    hook_candidate = str(candidate.get("hookCandidate") or evidence.get("hookCandidate") or "")
    source = Path(str(candidate.get("outputPath") or evidence.get("artifacts", {}).get("candidatePath") or "")).expanduser()
    if not source.exists():
        raise SystemExit(f"Source candidate not found: {source}")
    trim = choose_trim(evidence, min_saved_seconds=float(args.min_saved_seconds))
    if not trim.get("ok") and not args.force:
        return {
            "schema": SCHEMA,
            "version": VERSION,
            "generatedAt": utc_now(),
            "status": "blocked-no-useful-trim",
            "shortId": short_id,
            "evidencePath": str(evidence_path),
            "trim": trim,
            "truth": "No output was rendered. The tool found no safe automatic trim worth exporting.",
        }
    episode = int(candidate.get("episode") or 0)
    target_dir = Path(args.root).expanduser() / f"Episode_{episode:02d}" / "v002" / "short-refinement-candidates" / short_id
    base = f"{stamp_now()}-{short_id}-v002b-candidate-silence-tail-trim"
    target = target_dir / f"{base}.mp4"
    ffmpeg = require_tool("ffmpeg")
    ffprobe = require_tool("ffprobe")
    render = render_candidate(ffmpeg, source, target, trim)
    probe = probe_media(ffprobe, target) if render.get("ok") else {"ok": False}
    status = "v002-candidate-exported" if render.get("ok") else "v002-candidate-render-failed"
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": status,
        "shortId": short_id,
        "episode": episode,
        "targetVersion": "v002b",
        "hookCandidate": hook_candidate,
        "sourceCandidatePath": str(source),
        "sourceCandidate": {
            "targetVersion": candidate.get("targetVersion"),
            "reviewStatus": candidate.get("reviewStatus"),
            "reviewedAt": candidate.get("reviewedAt"),
            "reviewer": candidate.get("reviewer"),
            "hookCandidate": hook_candidate,
            "manifestPath": candidate.get("manifestPath"),
            "outputPath": candidate.get("outputPath"),
        },
        "evidencePath": str(evidence_path),
        "output": {"path": str(target), "probe": probe},
        "trim": trim,
        "render": render,
        "qualityWarnings": ["Derivative v002b proof from a v002 candidate, not canonical whole-source edit path."],
        "nextSafestAction": "Regenerate the v002 candidate index and evidence, then watch/listen before keep/refine/reject.",
        "truth": "Derivative v002b candidate only. It does not mutate originals, overwrite previous versions, publish, upload, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.",
    }
    manifest = target_dir / f"{base}.json"
    markdown = target_dir / f"{base}.md"
    if manifest.exists() or markdown.exists():
        raise SystemExit(f"Refusing to overwrite existing manifest: {manifest}")
    manifest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown.write_text(render_markdown(payload), encoding="utf-8")
    payload["manifestPath"] = str(manifest)
    payload["markdownPath"] = str(markdown)
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Render a v002b candidate from v002 evidence.")
    parser.add_argument("--short-id", required=True)
    parser.add_argument("--root", default=str(DEFAULT_ROOT))
    parser.add_argument("--evidence-root", default=str(DEFAULT_EVIDENCE_ROOT))
    parser.add_argument("--evidence", default="")
    parser.add_argument("--min-saved-seconds", default="1.25")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()
    payload = build(args)
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
