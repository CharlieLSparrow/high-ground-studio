#!/usr/bin/env python3
from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path("/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio")
SPINE_TRANSCRIPT = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/transcript-spines/episode-04/"
    "20260701-131412-466404-transcript-spine/episode-04.transcript-spine.draft.json"
)
SESSION = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions/episode-4-sync-baseline-v2.quipsly-session.json"
OUTPUT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-charlie-mov-transcript-sanity")
PROVIDER = ROOT / "script/local_transcript_provider.py"

CHARLIE_MOVS = {
    "IMG_3746.MOV",
    "IMG_3749.MOV",
    "IMG_3751.MOV",
}

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "so",
    "that",
    "the",
    "this",
    "to",
    "we",
    "with",
    "you",
}


def run(command: list[str], *, timeout: int | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def load_json(path: Path) -> Any:
    return json.loads(path.read_text())


def words_for(text: str) -> list[str]:
    raw = re.findall(r"[a-zA-Z0-9']+", text.lower())
    return [word for word in raw if word and word not in STOPWORDS]


def text_from_segments(segments: list[dict[str, Any]], start: float, end: float) -> str:
    parts: list[str] = []
    for segment in segments:
        seg_start = float(segment.get("start") or 0.0)
        seg_end = float(segment.get("end") or seg_start)
        if seg_end < start or seg_start > end:
            continue
        text = str(segment.get("text") or "").strip()
        if text:
            parts.append(text)
    return " ".join(parts)


def extract_excerpt(source: Path, output: Path, start: float, duration: float) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "ffmpeg",
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-ss",
        f"{start:.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        str(source),
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(output),
    ]
    result = run(command, timeout=240)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"ffmpeg failed for {source}")


def transcribe_excerpt(path: Path, provider: str, model: str) -> dict[str, Any]:
    result = run(
        [
            "python3",
            str(PROVIDER),
            "--provider",
            provider,
            "--model",
            model,
            "--language",
            "en",
            str(path),
        ],
        timeout=900,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or result.stdout.strip() or f"transcript provider failed for {path}")
    return json.loads(result.stdout)


def compare_text(candidate: str, expected: str) -> dict[str, Any]:
    candidate_words = words_for(candidate)
    expected_words = words_for(expected)
    candidate_set = set(candidate_words)
    expected_set = set(expected_words)
    overlap = sorted(candidate_set & expected_set)
    union = candidate_set | expected_set
    jaccard = len(overlap) / len(union) if union else 0.0
    containment = len(overlap) / max(1, min(len(candidate_set), len(expected_set)))
    sequence_ratio = difflib.SequenceMatcher(None, " ".join(candidate_words), " ".join(expected_words)).ratio()
    return {
        "candidateWordCount": len(candidate_words),
        "expectedWordCount": len(expected_words),
        "overlapWordCount": len(overlap),
        "overlapWords": overlap[:40],
        "jaccard": round(jaccard, 4),
        "containment": round(containment, 4),
        "sequenceRatio": round(sequence_ratio, 4),
    }


def session_lanes() -> list[dict[str, Any]]:
    data = load_json(SESSION)
    sequences = (data.get("project") or {}).get("sequences") or []
    if not sequences:
        return []
    return sequences[0].get("lanes") or []


def candidate_lanes() -> list[dict[str, Any]]:
    lanes = []
    for lane in session_lanes():
        metadata = lane.get("metadata") or {}
        source_path = Path(str(metadata.get("sourcePath") or ""))
        if source_path.name in CHARLIE_MOVS:
            source_video = lane.get("sourceVideo") or {}
            lanes.append(
                {
                    "laneName": lane.get("name") or source_path.name,
                    "sourceName": source_path.name,
                    "sourcePath": str(source_path),
                    "durationSeconds": float(source_video.get("duration") or 0.0),
                    "offsetSeconds": float(source_video.get("offset") or 0.0),
                    "confidence": (metadata.get("syncV2") or {}).get("confidence"),
                    "syncSource": (metadata.get("syncV2") or {}).get("syncSource"),
                    "score": ((metadata.get("syncV2") or {}).get("analysisResult") or {}).get("score"),
                }
            )
    return lanes


def sample_starts(duration: float, sample_duration: float, samples_per_file: int) -> list[float]:
    if duration <= sample_duration + 2:
        return [0.0]
    candidates = [
        min(max(15.0, duration * 0.15), max(0.0, duration - sample_duration)),
        min(max(30.0, duration * 0.5), max(0.0, duration - sample_duration)),
        max(0.0, duration - sample_duration - 10.0),
    ]
    unique: list[float] = []
    for value in candidates:
        rounded = round(value, 3)
        if all(abs(rounded - existing) > 2.0 for existing in unique):
            unique.append(rounded)
    return unique[:samples_per_file]


def verdict(metrics: dict[str, Any]) -> str:
    if metrics["containment"] >= 0.45 or metrics["jaccard"] >= 0.26 or metrics["sequenceRatio"] >= 0.36:
        return "likely-match"
    if metrics["containment"] >= 0.25 or metrics["jaccard"] >= 0.14 or metrics["sequenceRatio"] >= 0.24:
        return "weak-match-review"
    return "mismatch-or-bad-asr"


def main() -> int:
    parser = argparse.ArgumentParser(description="Compare Episode 4 Charlie MOV excerpt transcripts against the Charlie spine transcript.")
    parser.add_argument("--sample-duration", type=float, default=28.0)
    parser.add_argument("--samples-per-file", type=int, default=2)
    parser.add_argument("--provider", default="whisper-cpp")
    parser.add_argument("--model", default="base")
    args = parser.parse_args()

    if not SPINE_TRANSCRIPT.exists():
        raise SystemExit(f"Missing spine transcript: {SPINE_TRANSCRIPT}")
    if not SESSION.exists():
        raise SystemExit(f"Missing session: {SESSION}")

    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    out_dir = OUTPUT_ROOT / generated_at
    excerpt_dir = out_dir / "excerpts"
    out_dir.mkdir(parents=True, exist_ok=True)

    spine = load_json(SPINE_TRANSCRIPT)
    spine_segments = spine.get("segments") or []
    results: list[dict[str, Any]] = []

    for lane in candidate_lanes():
        source = Path(lane["sourcePath"])
        if not source.exists():
            results.append({**lane, "status": "missing-source"})
            continue
        for source_start in sample_starts(lane["durationSeconds"], args.sample_duration, args.samples_per_file):
            sequence_start = lane["offsetSeconds"] + source_start
            sequence_end = sequence_start + args.sample_duration
            expected_text = text_from_segments(spine_segments, sequence_start, sequence_end)
            excerpt_name = f"{source.stem}-src-{source_start:.0f}s-seq-{sequence_start:.0f}s.wav"
            excerpt_path = excerpt_dir / excerpt_name
            try:
                extract_excerpt(source, excerpt_path, source_start, args.sample_duration)
                transcript = transcribe_excerpt(excerpt_path, args.provider, args.model)
                candidate_text = text_from_segments(transcript.get("segments") or [], 0.0, args.sample_duration + 1.0)
                metrics = compare_text(candidate_text, expected_text)
                results.append(
                    {
                        **lane,
                        "status": "checked",
                        "sample": {
                            "sourceStartSeconds": round(source_start, 3),
                            "durationSeconds": args.sample_duration,
                            "sequenceStartSeconds": round(sequence_start, 3),
                            "sequenceEndSeconds": round(sequence_end, 3),
                            "excerptPath": str(excerpt_path),
                        },
                        "candidateText": candidate_text,
                        "expectedSpineText": expected_text,
                        "metrics": metrics,
                        "verdict": verdict(metrics),
                    }
                )
            except Exception as error:
                results.append(
                    {
                        **lane,
                        "status": "failed",
                        "sample": {
                            "sourceStartSeconds": round(source_start, 3),
                            "durationSeconds": args.sample_duration,
                            "sequenceStartSeconds": round(sequence_start, 3),
                            "sequenceEndSeconds": round(sequence_end, 3),
                            "excerptPath": str(excerpt_path),
                        },
                        "error": str(error),
                    }
                )

    summary = {
        "likelyMatch": sum(1 for item in results if item.get("verdict") == "likely-match"),
        "weakMatchReview": sum(1 for item in results if item.get("verdict") == "weak-match-review"),
        "mismatchOrBadAsr": sum(1 for item in results if item.get("verdict") == "mismatch-or-bad-asr"),
        "failed": sum(1 for item in results if item.get("status") == "failed"),
        "missingSource": sum(1 for item in results if item.get("status") == "missing-source"),
        "checked": sum(1 for item in results if item.get("status") == "checked"),
    }
    payload = {
        "schema": "quipsly.episode4-charlie-mov-transcript-sanity.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "sessionPath": str(SESSION),
        "spineTranscriptPath": str(SPINE_TRANSCRIPT),
        "provider": args.provider,
        "model": args.model,
        "sampleDurationSeconds": args.sample_duration,
        "samplesPerFile": args.samples_per_file,
        "summary": summary,
        "truth": "Transcript overlap sanity check only. It does not mutate source media, session metadata, timeline decisions, exports, or publication state.",
        "results": results,
    }
    json_path = out_dir / "episode4-charlie-mov-transcript-sanity.json"
    md_path = out_dir / "episode4-charlie-mov-transcript-sanity.md"
    latest_path = OUTPUT_ROOT / "latest-episode4-charlie-mov-transcript-sanity.json"
    json_path.write_text(json.dumps(payload, indent=2) + "\n")
    latest_path.write_text(json.dumps(payload, indent=2) + "\n")

    lines = [
        "# Episode 4 Charlie MOV transcript sanity check",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Session: `{SESSION}`",
        f"- Spine transcript: `{SPINE_TRANSCRIPT}`",
        f"- Summary: `{summary}`",
        "",
        "## Results",
        "",
    ]
    for item in results:
        lines.extend(
            [
                f"### {item.get('sourceName')} @ source {((item.get('sample') or {}).get('sourceStartSeconds'))}s",
                "",
                f"- Verdict: `{item.get('verdict') or item.get('status')}`",
                f"- Sequence window: `{((item.get('sample') or {}).get('sequenceStartSeconds'))} -> {((item.get('sample') or {}).get('sequenceEndSeconds'))}`",
                f"- Offset: `{item.get('offsetSeconds')}` confidence `{item.get('confidence')}` score `{item.get('score')}`",
                f"- Metrics: `{item.get('metrics')}`",
                "",
                "Candidate MOV transcript:",
                "",
                f"> {str(item.get('candidateText') or item.get('error') or '').strip()}",
                "",
                "Expected spine transcript:",
                "",
                f"> {str(item.get('expectedSpineText') or '').strip()}",
                "",
            ]
        )
    md_path.write_text("\n".join(lines) + "\n")
    print(json.dumps({"ok": True, "jsonPath": str(json_path), "markdownPath": str(md_path), "summary": summary}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
