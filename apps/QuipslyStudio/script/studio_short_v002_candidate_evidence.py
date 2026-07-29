#!/usr/bin/env python3
"""Create watch/listen evidence packets for local v002 short candidates.

This tool turns a v002 candidate row into concrete review evidence: probe data,
a contact sheet, audio/silence diagnostics, and a practical recommendation. It
records no review decision. Review state belongs to
studio_short_v002_candidate_review.py.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import shlex
import shutil
import subprocess
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_LEDGER = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-evidence"
DEFAULT_CANDIDATE_TRANSCRIPT_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-transcripts"
SCHEMA = "quipsly.studio.short-v002-candidate-evidence.v1"
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


def run(command: list[str], timeout: int = 60) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise SystemExit(f"Missing required tool: {name}")
    return path


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
    try:
        data = json.loads(result.stdout or "{}")
    except json.JSONDecodeError as error:
        return {"ok": False, "error": f"Could not parse ffprobe JSON: {error}"}
    streams = data.get("streams") if isinstance(data.get("streams"), list) else []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
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
        "videoCodec": video.get("codec_name"),
        "audioCodec": audio.get("codec_name"),
        "hasVideo": bool(video),
        "hasAudio": bool(audio),
        "audioChannels": audio.get("channels"),
        "sampleRate": audio.get("sample_rate"),
        "bitRate": fmt.get("bit_rate"),
        "formatName": fmt.get("format_name"),
    }


def make_contact_sheet(ffmpeg: str, media_path: Path, output_path: Path, duration: float | None) -> dict[str, Any]:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        output_path.unlink()
    frame_count = 9
    if duration and duration > 0:
        interval = max(duration / frame_count, 0.65)
    else:
        interval = 2.0
    vf = f"fps=1/{interval:.4f},scale=300:-1,tile=3x3:padding=8:margin=8:color=0x17251d"
    result = run([
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-y",
        "-i", str(media_path),
        "-frames:v", "1",
        "-vf", vf,
        str(output_path),
    ], timeout=90)
    return {
        "ok": result.returncode == 0 and output_path.exists(),
        "path": str(output_path),
        "filter": vf,
        "error": (result.stderr or result.stdout).strip() if result.returncode != 0 else "",
    }


def parse_audio(stderr: str) -> dict[str, Any]:
    mean_volume = None
    max_volume = None
    silence_starts: list[float] = []
    silence_ends: list[dict[str, float]] = []
    for line in stderr.splitlines():
        mean_match = re.search(r"mean_volume:\s*([-0-9.]+) dB", line)
        max_match = re.search(r"max_volume:\s*([-0-9.]+) dB", line)
        start_match = re.search(r"silence_start:\s*([-0-9.]+)", line)
        end_match = re.search(r"silence_end:\s*([-0-9.]+) \| silence_duration:\s*([-0-9.]+)", line)
        if mean_match:
            mean_volume = float(mean_match.group(1))
        if max_match:
            max_volume = float(max_match.group(1))
        if start_match:
            silence_starts.append(float(start_match.group(1)))
        if end_match:
            silence_ends.append({"end": float(end_match.group(1)), "duration": float(end_match.group(2))})
    return {
        "meanVolumeDb": mean_volume,
        "maxVolumeDb": max_volume,
        "silenceStartCount": len(silence_starts),
        "silenceSegmentCount": len(silence_ends),
        "longestSilenceSeconds": max([entry["duration"] for entry in silence_ends], default=0),
        "silenceSegments": silence_ends[:12],
    }


def audio_diagnostics(ffmpeg: str, media_path: Path) -> dict[str, Any]:
    result = run([
        ffmpeg,
        "-hide_banner",
        "-i", str(media_path),
        "-af", "silencedetect=n=-35dB:d=0.35,volumedetect",
        "-f", "null",
        "-",
    ], timeout=120)
    metrics = parse_audio(result.stderr or "")
    warnings: list[str] = []
    max_volume = metrics.get("maxVolumeDb")
    if isinstance(max_volume, (int, float)) and max_volume >= -0.5:
        warnings.append("Peak level is close to clipping; listen for harshness before approving.")
    if metrics.get("longestSilenceSeconds", 0) and float(metrics.get("longestSilenceSeconds") or 0) >= 1.2:
        warnings.append("Contains a long detected silence; check whether the pause is meaningful or drag.")
    if int(metrics.get("silenceSegmentCount") or 0) >= 4:
        warnings.append("Multiple silence segments detected; review cadence before promoting.")
    return {
        "ok": result.returncode == 0,
        "exitCode": result.returncode,
        "metrics": metrics,
        "warnings": warnings,
        "error": (result.stderr or result.stdout).strip()[-1600:] if result.returncode != 0 else "",
    }


def latest_candidate_transcript(short_id: str, transcript_root: Path) -> dict[str, Any]:
    short_slug = slug(short_id)
    pointer = transcript_root / short_slug / f"latest-{short_slug}-candidate-transcript.json"
    if pointer.exists():
        pointer_data = load_json(pointer)
        json_path = pointer_data.get("jsonPath")
        if json_path and Path(str(json_path)).exists():
            return load_json(Path(str(json_path)))
    folder = transcript_root / short_slug
    if folder.exists():
        candidates = sorted(folder.glob("*candidate-transcript.json"), key=lambda p: (p.stat().st_mtime, str(p)), reverse=True)
        if candidates:
            return load_json(candidates[0])
    return {}


def transcript_preview(data: dict[str, Any], max_chars: int = 900) -> str:
    if isinstance(data.get("text"), str):
        return " ".join(str(data.get("text") or "").split())[:max_chars]
    segments = data.get("segments") if isinstance(data.get("segments"), list) else []
    parts = [str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)]
    return " ".join(" ".join(parts).split())[:max_chars]


def transcript_evidence(short_id: str, root: Path, hook_candidate: str, candidate_path: Path) -> dict[str, Any]:
    candidate_transcript = latest_candidate_transcript(short_id, DEFAULT_CANDIDATE_TRANSCRIPT_ROOT)
    if candidate_transcript:
        transcript = candidate_transcript.get("transcript") if isinstance(candidate_transcript.get("transcript"), dict) else {}
        preview = str(candidate_transcript.get("preview") or "") or transcript_preview(transcript)
        warnings: list[str] = []
        source_path = str(candidate_transcript.get("candidatePath") or "")
        if source_path and Path(source_path).expanduser() != candidate_path:
            warnings.append("Latest candidate transcript points at a different candidate file; regenerate ASR for the current candidate.")
        if not preview:
            warnings.append("Latest candidate transcript sidecar has no usable transcript text; regenerate ASR after ignoring non-transcript media manifests.")
            return {
                "status": "candidate-machine-draft-empty",
                "source": "candidate-specific-asr",
                "transcriptJson": str((candidate_transcript.get("outputPaths") or {}).get("jsonPath") or ""),
                "captionDraftSrt": "",
                "provider": transcript.get("provider") or candidate_transcript.get("provider") or "",
                "model": transcript.get("model") or candidate_transcript.get("model") or "",
                "language": transcript.get("language") or candidate_transcript.get("language") or "",
                "preview": "",
                "warnings": warnings,
                "truth": "A candidate-specific transcript sidecar exists, but it contains no usable transcript text. Treat it as failed evidence until regenerated.",
            }
        if hook_candidate and preview and token_overlap(hook_candidate, preview) < 0.18:
            warnings.append("Hook clue and exact-candidate ASR preview have low word overlap; verify the candidate before trusting transcript text.")
        return {
            "status": "candidate-machine-draft-needs-review",
            "source": "candidate-specific-asr",
            "transcriptJson": str((candidate_transcript.get("outputPaths") or {}).get("jsonPath") or ""),
            "captionDraftSrt": "",
            "provider": transcript.get("provider") or candidate_transcript.get("provider") or "",
            "model": transcript.get("model") or candidate_transcript.get("model") or "",
            "language": transcript.get("language") or candidate_transcript.get("language") or "",
            "preview": preview,
            "warnings": warnings,
            "truth": "Machine transcript draft for this exact candidate. It is not normalized transcript truth and must be listen-checked before captions or edit decisions rely on it.",
        }
    workorder_dir = root / "shorts-command-room" / "transcript-workorders" / short_id
    transcript_path = workorder_dir / f"{short_id}-asr-draft-transcript.json"
    caption_path = workorder_dir / f"{short_id}-caption-draft.srt"
    if not transcript_path.exists():
        return {
            "status": "missing",
            "source": "missing",
            "transcriptJson": "",
            "captionDraftSrt": str(caption_path) if caption_path.exists() else "",
            "preview": "",
            "warnings": ["No ASR draft transcript sidecar found for this v002 candidate."],
        }
    data = load_json(transcript_path)
    segments = data.get("segments") if isinstance(data.get("segments"), list) else []
    text_parts = [str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)]
    preview = " ".join(part for part in text_parts if part).strip()
    preview = " ".join(preview.split())[:900]
    warnings: list[str] = []
    if hook_candidate and preview and token_overlap(hook_candidate, preview) < 0.18:
        warnings.append("Hook clue and ASR preview have low word overlap; verify candidate lineage before trusting transcript text.")
    return {
        "status": "machine-draft-needs-review",
        "source": "short-level-asr-fallback",
        "transcriptJson": str(transcript_path),
        "captionDraftSrt": str(caption_path) if caption_path.exists() else "",
        "provider": data.get("provider") or "",
        "model": data.get("model") or "",
        "language": data.get("language") or "",
        "preview": preview,
        "warnings": warnings,
        "truth": "Machine transcript draft only. It is not normalized transcript truth and must be listen-checked before captions or edit decisions rely on it.",
    }


def token_overlap(left: str, right: str) -> float:
    stopwords = {
        "a", "an", "and", "are", "as", "at", "be", "been", "but", "for", "from", "have", "how", "i", "in",
        "is", "it", "like", "me", "my", "of", "on", "or", "so", "that", "the", "this", "to", "was", "we",
        "with", "you", "your", "i'm", "i'd", "i'll", "it's",
    }
    def tokens(value: str) -> set[str]:
        return {
            token for token in re.findall(r"[a-zA-Z']{3,}", value.lower())
            if token not in stopwords
        }
    left_tokens = tokens(left)
    right_tokens = tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))


def select_candidate(ledger: dict[str, Any], short_id: str | None) -> dict[str, Any]:
    items = [item for item in ledger.get("items", []) if isinstance(item, dict)]
    if short_id:
        candidate = next((item for item in items if str(item.get("shortId") or "") == short_id), None)
        if not candidate:
            raise SystemExit(f"Short id not found in v002 candidate review ledger: {short_id}")
        return candidate
    for item in items:
        if item.get("candidateStatus") == "v002-candidate-exported" and item.get("outputExists") and item.get("reviewStatus") in {"needs-listen", "pending-review"}:
            return item
    for item in items:
        if item.get("candidateStatus") == "v002-candidate-exported" and item.get("outputExists"):
            return item
    raise SystemExit("No exported v002 candidate found in review ledger.")


def recommendation(candidate: dict[str, Any], probe: dict[str, Any], audio: dict[str, Any], transcript: dict[str, Any]) -> dict[str, Any]:
    blockers: list[str] = []
    warnings: list[str] = []
    if not candidate.get("outputExists"):
        blockers.append("Candidate output file is missing.")
    if not probe.get("ok"):
        blockers.append(f"ffprobe failed: {probe.get('error')}")
    if probe.get("ok") and not probe.get("hasAudio"):
        blockers.append("Candidate has no audio stream.")
    if probe.get("ok") and not probe.get("hasVideo"):
        blockers.append("Candidate has no video stream.")
    duration = probe.get("durationSeconds")
    if isinstance(duration, (int, float)):
        if duration < 8:
            warnings.append("Candidate is very short; check whether it has enough context.")
        if duration > 60:
            warnings.append("Candidate is longer than normal social-short range; consider a tighter cut.")
    if probe.get("width") != 1080 or probe.get("height") != 1920:
        warnings.append("Candidate is not 1080x1920; confirm platform framing/export settings.")
    warnings.extend(audio.get("warnings") or [])
    warnings.extend(transcript.get("warnings") or [])
    if blockers:
        return {"recommendedReviewStatus": "hold", "blockers": blockers, "warnings": warnings, "nextSafestAction": "Resolve blockers before watch/listen review."}
    return {
        "recommendedReviewStatus": "needs-listen",
        "blockers": blockers,
        "warnings": warnings,
        "nextSafestAction": "Watch the candidate with sound on. If the hook lands and cadence feels human, record keep; otherwise record refine-again with notes.",
    }


def render_markdown(payload: dict[str, Any]) -> str:
    c = payload["candidate"]
    rec = payload["recommendation"]
    transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
    lines = [
        "# Studio short v002 candidate evidence",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{c.get('shortId')}`",
        f"Episode: `{c.get('episode')}`",
        f"Candidate status: `{c.get('candidateStatus')}`",
        f"Current review status: `{c.get('reviewStatus')}`",
        f"Recommended review status: `{rec.get('recommendedReviewStatus')}`",
        "",
        "## Open the candidate",
        "",
        f"- Candidate MP4: `{c.get('outputPath')}`",
        f"- Contact sheet: `{payload.get('artifacts', {}).get('contactSheetPath')}`",
        "",
        "## Hook clue",
        "",
        str(c.get("hookCandidate") or "(missing)"),
        "",
        "## Transcript clue",
        "",
        f"- Status: `{transcript.get('status') or 'missing'}`",
        f"- Transcript: `{transcript.get('transcriptJson') or ''}`",
        "",
        str(transcript.get("preview") or "(missing)"),
        "",
        "## Findings",
        "",
    ]
    if rec.get("blockers"):
        lines.extend(["### Blockers", ""])
        lines.extend([f"- {item}" for item in rec.get("blockers") or []])
        lines.append("")
    if rec.get("warnings"):
        lines.extend(["### Warnings", ""])
        lines.extend([f"- {item}" for item in rec.get("warnings") or []])
        lines.append("")
    lines.extend([
        "## Next safest action",
        "",
        str(rec.get("nextSafestAction") or ""),
        "",
        "## Truth boundary",
        "",
        str(payload.get("truth") or ""),
    ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    c = payload["candidate"]
    rec = payload["recommendation"]
    transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
    contact = payload.get("artifacts", {}).get("contactSheetPath") or ""
    image_html = f"<img src=\"file://{escape(contact)}\" alt=\"Contact sheet\">" if contact else ""
    warnings = "".join(f"<li>{escape(str(item))}</li>" for item in rec.get("warnings") or [])
    blockers = "".join(f"<li>{escape(str(item))}</li>" for item in rec.get("blockers") or [])
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quipsly v002 Candidate Evidence</title>
  <style>
    :root {{ color-scheme: dark; --bg:#101915; --panel:#203129; --ink:#f8ecd1; --muted:#baad90; --gold:#dabe55; --leaf:#86ca91; --clay:#ce6d50; }}
    body {{ margin:0; padding:32px; background:radial-gradient(circle at top left,#2d4633,var(--bg)); color:var(--ink); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Avenir Next",sans-serif; }}
    main {{ max-width:1100px; margin:0 auto; }}
    h1 {{ font-size:34px; margin:0 0 8px; }}
    .sub {{ color:var(--muted); margin-bottom:22px; }}
    .card {{ background:rgba(32,49,41,.9); border:1px solid rgba(218,190,85,.28); border-radius:24px; padding:22px; margin:18px 0; box-shadow:0 18px 55px rgba(0,0,0,.28); }}
    .pill {{ display:inline-block; border-radius:999px; padding:4px 10px; margin:0 6px 6px 0; background:rgba(218,190,85,.16); color:var(--gold); font-weight:850; }}
    img {{ width:100%; border-radius:18px; border:1px solid rgba(248,236,209,.16); background:#111; }}
    code,.path {{ color:var(--muted); word-break:break-all; }}
    li {{ margin:6px 0; }}
  </style>
</head>
<body><main>
  <h1>v002 candidate evidence</h1>
  <p class="sub">Watch/listen packet. Evidence, not approval.</p>
  <section class="card">
    <p><span class="pill">{escape(str(c.get('shortId')))}</span><span class="pill">Episode {escape(str(c.get('episode')))}</span><span class="pill">{escape(str(rec.get('recommendedReviewStatus')))}</span></p>
    <p><strong>Hook:</strong> {escape(str(c.get('hookCandidate') or 'missing'))}</p>
    <p><strong>Transcript:</strong> {escape(str(transcript.get('status') or 'missing'))}</p>
    <p>{escape(str(transcript.get('preview') or 'No transcript preview available.'))}</p>
    <p class="path">{escape(str(c.get('outputPath') or ''))}</p>
  </section>
  <section class="card">{image_html}</section>
  <section class="card"><h2>Warnings</h2><ul>{warnings or '<li>None from automated checks.</li>'}</ul><h2>Blockers</h2><ul>{blockers or '<li>None from automated checks.</li>'}</ul></section>
  <section class="card"><h2>Next safest action</h2><p>{escape(str(rec.get('nextSafestAction') or ''))}</p></section>
</main></body></html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    short_id = slug(str(payload["candidate"].get("shortId") or "candidate"))
    basename = f"{stamp_now()}-{short_id}-v002-candidate-evidence"
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    pointer = output_dir.parent / f"latest-{short_id}-v002-candidate-evidence.json"
    paths = {"jsonPath": str(json_path), "markdownPath": str(md_path), "htmlPath": str(html_path)}
    pointer.write_text(json.dumps(paths, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    paths["latestPointerJson"] = str(pointer)
    return paths


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    ledger = load_json(Path(args.ledger).expanduser())
    candidate = select_candidate(ledger, args.short_id)
    media_path = Path(str(candidate.get("outputPath") or "")).expanduser()
    if not media_path.exists():
        probe = {"ok": False, "error": f"Output file does not exist: {media_path}"}
        audio = {"ok": False, "warnings": [], "error": "missing output"}
        contact = {"ok": False, "path": "", "error": "missing output"}
    else:
        ffprobe = require_tool("ffprobe")
        ffmpeg = require_tool("ffmpeg")
        probe = probe_media(ffprobe, media_path)
        out_root = Path(args.output_root).expanduser() / slug(str(candidate.get("shortId") or "candidate")) / stamp_now()
        contact = make_contact_sheet(ffmpeg, media_path, out_root / "contact-sheet.jpg", probe.get("durationSeconds") if probe.get("ok") else None)
        audio = audio_diagnostics(ffmpeg, media_path)
    transcript = transcript_evidence(str(candidate.get("shortId") or ""), DEFAULT_ROOT, str(candidate.get("hookCandidate") or ""), media_path)
    rec = recommendation(candidate, probe, audio, transcript)
    output_root = Path(args.output_root).expanduser() / slug(str(candidate.get("shortId") or "candidate"))
    artifacts = {
        "contactSheetPath": contact.get("path") or "",
        "candidatePath": str(media_path),
    }
    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "short-v002-candidate-evidence-ready" if not rec.get("blockers") else "short-v002-candidate-evidence-blocked",
        "ledgerPath": str(Path(args.ledger).expanduser()),
        "candidate": candidate,
        "probe": probe,
        "contactSheet": contact,
        "audioDiagnostics": audio,
        "transcript": transcript,
        "recommendation": rec,
        "artifacts": artifacts,
        "safeCommands": {
            "openCandidate": f"open {shlex.quote(str(media_path))}",
            "revealCandidate": f"open -R {shlex.quote(str(media_path))}",
            "recordNeedsListen": f"./script/agentctl.sh studio-short-v002-candidate-review {candidate.get('shortId')} needs-listen REVIEWER 'Reviewed evidence; needs watch/listen.'",
            "recordKeep": f"./script/agentctl.sh studio-short-v002-candidate-review {candidate.get('shortId')} keep REVIEWER 'Candidate works after watch/listen; still not externally published.'",
            "recordRefineAgain": f"./script/agentctl.sh studio-short-v002-candidate-review {candidate.get('shortId')} refine-again REVIEWER 'Needs another refinement pass.'",
            "recordReject": f"./script/agentctl.sh studio-short-v002-candidate-review {candidate.get('shortId')} reject REVIEWER 'Reject this v002 candidate.'",
        },
        "truth": "Local v002 candidate evidence only. It creates review sidecars and diagnostics; it does not record review decisions, render new media, mutate sources, overwrite versions, upload, publish, schedule, approve externally, delete files, mutate accounts, normalize transcript truth, or create receipt truth.",
    }
    payload["outputPaths"] = write_outputs(payload, output_root)
    return payload


def print_payload(payload: dict[str, Any], fmt: str) -> None:
    if fmt == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif fmt == "html":
        print(render_html(payload))
    else:
        print(render_markdown(payload), end="")


def main() -> int:
    parser = argparse.ArgumentParser(description="Create evidence packet for a v002 short candidate.")
    parser.add_argument("--short-id", default="")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--format", choices=["markdown", "json", "html"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    args = parser.parse_args()
    payload = build_packet(args)
    print_payload(payload, args.format)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
