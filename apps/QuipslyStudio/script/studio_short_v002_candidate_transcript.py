#!/usr/bin/env python3
"""Generate a machine ASR draft for the exact current v002 candidate MP4.

Short-level transcripts are useful context, but a trimmed v002/v002b candidate
needs transcript evidence from the exact candidate file. This script writes a
versioned candidate-specific transcript sidecar under the review board.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_LEDGER = DEFAULT_ROOT / "review-board" / "short-v002-candidate-review-ledger" / "studio-short-v002-candidate-review-ledger.json"
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "review-board" / "short-v002-candidate-transcripts"
SCHEMA = "quipsly.studio.short-v002-candidate-transcript.v1"
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


def select_candidate(ledger: dict[str, Any], short_id: str) -> dict[str, Any]:
    for item in ledger.get("items", []):
        if isinstance(item, dict) and str(item.get("shortId") or "") == short_id:
            return item
    raise SystemExit(f"Short id not found in v002 candidate review ledger: {short_id}")


def transcript_text(data: dict[str, Any], max_chars: int = 900) -> str:
    if isinstance(data.get("text"), str):
        return " ".join(str(data.get("text") or "").split())[:max_chars]
    segments = data.get("segments") if isinstance(data.get("segments"), list) else []
    parts = [str(segment.get("text") or "").strip() for segment in segments if isinstance(segment, dict)]
    return " ".join(" ".join(parts).split())[:max_chars]


def caption_text(text: str) -> str:
    return " ".join(str(text or "").split())


def seconds_to_srt_time(value: Any) -> str:
    seconds = max(0.0, float(value or 0))
    total_ms = int(round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, ms = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def seconds_to_vtt_time(value: Any) -> str:
    return seconds_to_srt_time(value).replace(",", ".")


def transcript_segments(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [segment for segment in data.get("segments", []) if isinstance(segment, dict)]


def wrapped_caption_cues(data: dict[str, Any], max_chars: int = 72) -> list[dict[str, Any]]:
    cues: list[dict[str, Any]] = []
    for segment in transcript_segments(data):
        text = caption_text(str(segment.get("text") or ""))
        if not text:
            continue
        start = float(segment.get("start") or 0)
        end = float(segment.get("end") or start)
        words = text.split()
        if not words:
            continue
        segment_words = segment.get("words") if isinstance(segment.get("words"), list) else []
        timed_words = [
            word
            for word in segment_words
            if isinstance(word, dict)
            and str(word.get("word") or "").strip()
            and word.get("start") is not None
            and word.get("end") is not None
        ]
        if timed_words:
            chunks: list[list[dict[str, Any]]] = []
            current_words: list[dict[str, Any]] = []
            for timed_word in timed_words:
                current_text = " ".join(str(part.get("word") or "").strip() for part in [*current_words, timed_word]).strip()
                if current_words and len(current_text) > max_chars:
                    chunks.append(current_words)
                    current_words = [timed_word]
                else:
                    current_words.append(timed_word)
            if current_words:
                chunks.append(current_words)
            for chunk in chunks:
                chunk_text = caption_text(" ".join(str(part.get("word") or "").strip() for part in chunk))
                cues.append(
                    {
                        "start": float(chunk[0].get("start") or start),
                        "end": float(chunk[-1].get("end") or end),
                        "sourceStart": start,
                        "sourceEnd": end,
                        "text": chunk_text,
                        "wrappedFromSegment": len(chunks) > 1,
                        "timingSource": "word-timing",
                    }
                )
            continue
        chunks: list[str] = []
        current: list[str] = []
        for word in words:
            candidate = " ".join([*current, word]).strip()
            if current and len(candidate) > max_chars:
                chunks.append(" ".join(current))
                current = [word]
            else:
                current.append(word)
        if current:
            chunks.append(" ".join(current))
        chunk_count = max(1, len(chunks))
        duration = max(0.01, end - start)
        for index, chunk in enumerate(chunks):
            chunk_start = start + duration * (index / chunk_count)
            chunk_end = start + duration * ((index + 1) / chunk_count)
            cues.append(
                {
                    "start": chunk_start,
                    "end": chunk_end,
                    "sourceStart": start,
                    "sourceEnd": end,
                    "text": chunk,
                    "wrappedFromSegment": len(chunks) > 1,
                    "timingSource": "proportional-segment",
                }
            )
    return cues


def merge_tiny_caption_cues(cues: list[dict[str, Any]], max_chars: int = 84, min_duration: float = 0.8) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    index = 0
    while index < len(cues):
        cue = dict(cues[index])
        duration = float(cue.get("end") or 0) - float(cue.get("start") or 0)
        text = caption_text(str(cue.get("text") or ""))
        if 0 < duration < min_duration and index + 1 < len(cues):
            next_cue = cues[index + 1]
            combined_text = caption_text(f"{text} {next_cue.get('text') or ''}")
            if len(combined_text) <= max_chars:
                cue.update(
                    {
                        "end": next_cue.get("end"),
                        "text": combined_text,
                        "wrappedFromSegment": True,
                        "mergedTinyCue": True,
                        "timingSource": f"{cue.get('timingSource') or ''}+tiny-cue-merge",
                    }
                )
                index += 2
                merged.append(cue)
                continue
        if 0 < duration < min_duration and merged:
            previous = merged[-1]
            combined_text = caption_text(f"{previous.get('text') or ''} {text}")
            if len(combined_text) <= max_chars:
                previous.update(
                    {
                        "end": cue.get("end"),
                        "text": combined_text,
                        "wrappedFromSegment": True,
                        "mergedTinyCue": True,
                        "timingSource": f"{previous.get('timingSource') or ''}+tiny-cue-merge",
                    }
                )
                index += 1
                continue
        merged.append(cue)
        index += 1
    return merged


def caption_cues(data: dict[str, Any]) -> list[dict[str, Any]]:
    return merge_tiny_caption_cues(wrapped_caption_cues(data))


def render_srt(data: dict[str, Any]) -> str:
    blocks: list[str] = []
    for index, cue in enumerate(caption_cues(data), start=1):
        text = caption_text(str(cue.get("text") or ""))
        if not text:
            continue
        blocks.append(
            "\n".join(
                [
                    str(index),
                    f"{seconds_to_srt_time(cue.get('start'))} --> {seconds_to_srt_time(cue.get('end'))}",
                    text,
                ]
            )
        )
    return "\n\n".join(blocks).rstrip() + ("\n" if blocks else "")


def render_vtt(data: dict[str, Any]) -> str:
    blocks = ["WEBVTT", ""]
    for cue in caption_cues(data):
        text = caption_text(str(cue.get("text") or ""))
        if not text:
            continue
        blocks.extend(
            [
                f"{seconds_to_vtt_time(cue.get('start'))} --> {seconds_to_vtt_time(cue.get('end'))}",
                text,
                "",
            ]
        )
    return "\n".join(blocks).rstrip() + "\n"


def caption_review_stats(data: dict[str, Any]) -> dict[str, Any]:
    cues: list[dict[str, Any]] = []
    wrapped_count = 0
    merged_count = 0
    for cue in caption_cues(data):
        text = caption_text(str(cue.get("text") or ""))
        if not text:
            continue
        if cue.get("wrappedFromSegment"):
            wrapped_count += 1
        if cue.get("mergedTinyCue"):
            merged_count += 1
        duration = max(0.0, float(cue.get("end") or 0) - float(cue.get("start") or 0))
        cues.append(
            {
                "start": cue.get("start"),
                "end": cue.get("end"),
                "durationSeconds": round(duration, 3),
                "characters": len(text),
                "wordCount": len(text.split()),
                "text": text,
                "wrappedFromSegment": bool(cue.get("wrappedFromSegment")),
                "timingSource": cue.get("timingSource") or "",
            }
        )
    warnings: list[str] = []
    if not cues:
        warnings.append("no-caption-cues")
    long_cues = [cue for cue in cues if int(cue.get("characters") or 0) > 84]
    if long_cues:
        warnings.append("long-caption-cue-text")
    fast_cues = [
        cue
        for cue in cues
        if float(cue.get("durationSeconds") or 0) > 0
        and (int(cue.get("wordCount") or 0) / float(cue.get("durationSeconds") or 1)) > 4.5
    ]
    if fast_cues:
        warnings.append("fast-caption-reading-speed")
    tiny_cues = [cue for cue in cues if 0 < float(cue.get("durationSeconds") or 0) < 0.8]
    if tiny_cues:
        warnings.append("very-short-caption-cue")
    return {
        "status": "caption-draft-reviewable" if cues and not warnings else "caption-draft-needs-review",
        "cueCount": len(cues),
        "warnings": warnings,
        "longestCueCharacters": max((int(cue.get("characters") or 0) for cue in cues), default=0),
        "maxWordsPerSecond": round(
            max(
                (
                    int(cue.get("wordCount") or 0) / float(cue.get("durationSeconds") or 1)
                    for cue in cues
                    if float(cue.get("durationSeconds") or 0) > 0
                ),
                default=0.0,
            ),
            2,
        ),
        "wrappedCueCount": wrapped_count,
        "mergedTinyCueCount": merged_count,
        "wrappingPolicy": "Split long segment text into <=72 character draft cues, use word timing when available, and merge isolated <0.8s cues into neighbors when readable.",
        "sampleCue": cues[0] if cues else {},
        "truth": "Caption review stats are machine draft review hints for exact candidate sidecars. They are not final caption approval.",
    }


def has_transcript_payload(data: dict[str, Any]) -> bool:
    if transcript_text(data, max_chars=1):
        return True
    return False


def run_transcript(candidate_path: Path, provider: str, model: str, language: str) -> dict[str, Any]:
    script_path = Path(__file__).with_name("local_transcript_provider.py")
    command = [
        "python3",
        str(script_path),
        str(candidate_path),
        "--provider", provider,
        "--model", model,
        "--language", language,
    ]
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
    if result.returncode != 0:
        raise SystemExit((result.stderr or result.stdout or f"ASR failed with exit {result.returncode}").strip())
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(f"ASR provider did not return JSON: {error}\n{result.stdout[:500]}") from error
    if not isinstance(data, dict):
        raise SystemExit("ASR provider returned non-object JSON.")
    if not has_transcript_payload(data):
        raise SystemExit(
            "ASR provider returned JSON, but it contained no usable transcript text. "
            "This usually means a media manifest or non-transcript sidecar was selected."
        )
    return data


def render_markdown(payload: dict[str, Any]) -> str:
    transcript = payload.get("transcript") if isinstance(payload.get("transcript"), dict) else {}
    lines = [
        "# V002 candidate transcript draft",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Short: `{payload.get('shortId')}`",
        f"Status: `{payload.get('status')}`",
        f"Candidate: `{payload.get('candidatePath')}`",
        "",
        "## Preview",
        "",
        str(payload.get("preview") or ""),
        "",
        "## Provider",
        "",
        f"- Provider: `{transcript.get('provider') or payload.get('provider')}`",
        f"- Model: `{transcript.get('model') or payload.get('model')}`",
        f"- Language: `{transcript.get('language') or payload.get('language')}`",
        f"- Caption SRT draft: `{payload.get('captionDraftSrtPath') or ''}`",
        f"- Caption VTT draft: `{payload.get('captionDraftVttPath') or ''}`",
        f"- Caption review status: `{payload.get('captionDraftReview', {}).get('status') if isinstance(payload.get('captionDraftReview'), dict) else ''}`",
        "",
        "## Truth boundary",
        "",
        str(payload.get("truth") or ""),
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate exact-candidate transcript sidecar for a v002 short candidate.")
    parser.add_argument("--short-id", required=True)
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER))
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="en")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    args = parser.parse_args()

    ledger = load_json(Path(args.ledger).expanduser())
    candidate = select_candidate(ledger, args.short_id)
    candidate_path = Path(str(candidate.get("outputPath") or "")).expanduser()
    if not candidate_path.exists():
        raise SystemExit(f"Candidate output is missing: {candidate_path}")

    transcript = run_transcript(candidate_path, args.provider, args.model, args.language)
    short_slug = slug(args.short_id)
    output_dir = Path(args.output_root).expanduser() / short_slug
    output_dir.mkdir(parents=True, exist_ok=True)
    base = f"{stamp_now()}-{short_slug}-candidate-transcript"
    transcript_path = output_dir / f"{base}.json"
    markdown_path = output_dir / f"{base}.md"
    srt_path = output_dir / f"{base}.srt"
    vtt_path = output_dir / f"{base}.vtt"
    if transcript_path.exists() or markdown_path.exists() or srt_path.exists() or vtt_path.exists():
        raise SystemExit(f"Refusing to overwrite candidate transcript: {transcript_path}")

    payload = {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": utc_now(),
        "status": "candidate-transcript-draft-ready",
        "shortId": args.short_id,
        "episode": candidate.get("episode"),
        "targetVersion": candidate.get("targetVersion"),
        "candidatePath": str(candidate_path),
        "candidateManifestPath": candidate.get("manifestPath") or "",
        "provider": args.provider,
        "model": args.model,
        "language": args.language,
        "preview": transcript_text(transcript),
        "transcript": transcript,
        "captionDraftSrtPath": str(srt_path),
        "captionDraftVttPath": str(vtt_path),
        "captionDraftReview": caption_review_stats(transcript),
        "truth": "Machine transcript draft for this exact candidate. It is not normalized transcript truth and must be listen-checked before captions, publishing copy, or edit decisions rely on it.",
    }
    pointer = output_dir / f"latest-{short_slug}-candidate-transcript.json"
    payload["outputPaths"] = {
        "jsonPath": str(transcript_path),
        "markdownPath": str(markdown_path),
        "captionDraftSrtPath": str(srt_path),
        "captionDraftVttPath": str(vtt_path),
        "latestPointerJson": str(pointer),
    }
    transcript_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    srt_path.write_text(render_srt(transcript), encoding="utf-8")
    vtt_path.write_text(render_vtt(transcript), encoding="utf-8")
    pointer.write_text(json.dumps(payload["outputPaths"], indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
