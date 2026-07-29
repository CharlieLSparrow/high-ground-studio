#!/usr/bin/env python3
"""Run resumable Episode 4 transcript chunks.

This is a conservative full-source ASR runner for long Episode 4 audio/video.
It creates managed WAV chunks, runs the local transcript provider one chunk at a
time, normalizes provider output into Quipsly transcript JSON, and writes a
manifest/board that can be resumed.

Safety boundary: this script never imports transcripts into an edit, writes
reconciled transcript spines, edits timelines, renders exports, publishes,
uploads, schedules, deletes, overwrites prior sessions, or mutates original
media. It only writes managed chunk artifacts under the review-board folder.
"""
from __future__ import annotations

import argparse
import html
import importlib.util
import json
import math
import shlex
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
READINESS_POINTER = RELEASE_ROOT / "review-board/transcript-execution-readiness/latest-transcript-execution-readiness-episode-04.json"
OUT_ROOT = RELEASE_ROOT / "review-board/transcript-full-asr/episode-04"
LATEST_POINTER = RELEASE_ROOT / "review-board/transcript-full-asr/latest-episode-04-transcript-chunks.json"
PROVIDER = Path(__file__).resolve().parent.parent / "local_transcript_provider.py"
PILOT = Path(__file__).resolve().parent / "run_transcript_pilot.py"
SCHEMA = "quipsly.episode-transcript-chunks.v1"
POINTER_SCHEMA = "quipsly.episode-transcript-chunks-pointer.v1"
EPISODE = 4

DANGEROUS_TRUTH_KEYS = [
    "transcriptsImported",
    "reconciledTranscriptSpinesWritten",
    "timelineDecisionsWritten",
    "exportsRendered",
    "externalPublishing",
    "externalUpload",
    "externalSchedulesCreated",
    "approvalCreated",
    "receiptTruthCreated",
    "sourceFilesMutated",
    "versionsOverwritten",
    "filesDeleted",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-chunks")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def load_pilot_module() -> Any:
    spec = importlib.util.spec_from_file_location("quipsly_run_transcript_pilot", PILOT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load transcript pilot helpers from {PILOT}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


PILOT_HELPERS = load_pilot_module()


def iter_sources(readiness: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for episode in readiness.get("episodes") or []:
        if not isinstance(episode, dict):
            continue
        episode_number = episode.get("episode") if isinstance(episode.get("episode"), int) else None
        if episode_number != EPISODE:
            continue
        for item in episode.get("selectedSources") or []:
            if not isinstance(item, dict):
                continue
            source = dict(item)
            source.setdefault("episode", episode_number)
            source.setdefault("episodeLabel", episode.get("episodeLabel") or f"Episode {episode_number}")
            rows.append(source)
    return rows


def source_duration(row: dict[str, Any]) -> float:
    try:
        return float(row.get("durationSeconds") or 0)
    except Exception:
        return 0.0


def probe_duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe or not path.exists():
        return 0.0
    command = [
        ffprobe,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False, timeout=30)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def fallback_sources() -> list[dict[str, Any]]:
    candidates = [
        Path("/Volumes/My Passport/Episode 4/Charlie Ep4.wav"),
        Path("/Volumes/My Passport/Episode 4/TX00_MIC005_20260226_070456_orig.wav"),
    ]
    rows: list[dict[str, Any]] = []
    for index, path in enumerate(candidates, start=1):
        if not path.exists() or not path.is_file():
            continue
        duration = probe_duration(path)
        rows.append({
            "queueId": f"episode-4-fallback-{index:02d}",
            "episode": EPISODE,
            "episodeLabel": "Episode 4",
            "mediaId": f"fallback-{index:02d}",
            "sourceKind": "external-high-quality-audio" if "Charlie" in path.name else "external-audio",
            "fileName": path.name,
            "sourcePath": str(path),
            "durationSeconds": duration,
            "durationLabel": f"{duration:.1f}s" if duration else "unknown",
            "valueNote": "Fallback direct Episode 4 source discovered from known local path.",
        })
    return rows


def choose_source(rows: list[dict[str, Any]], explicit_source: str | None) -> tuple[dict[str, Any] | None, list[str]]:
    warnings: list[str] = []
    if explicit_source:
        path = Path(explicit_source).expanduser().resolve()
        if not path.exists() or not path.is_file():
            return None, [f"Explicit source is not readable: {path}"]
        duration = probe_duration(path)
        return {
            "queueId": "episode-4-explicit-source",
            "episode": EPISODE,
            "episodeLabel": "Episode 4",
            "mediaId": "explicit-source",
            "sourceKind": "explicit-source",
            "fileName": path.name,
            "sourcePath": str(path),
            "durationSeconds": duration,
            "durationLabel": f"{duration:.1f}s" if duration else "unknown",
            "valueNote": "Explicit source passed to transcript chunk runner.",
        }, warnings

    readable: list[dict[str, Any]] = []
    for row in [*rows, *fallback_sources()]:
        path = Path(str(row.get("sourcePath") or ""))
        if path.exists() and path.is_file():
            enriched = dict(row)
            if source_duration(enriched) <= 0:
                enriched["durationSeconds"] = probe_duration(path)
            readable.append(enriched)
        else:
            warnings.append(f"Transcript source is not readable and was skipped: {path}")

    if not readable:
        return None, warnings + ["No Episode 4 transcript sources are readable."]

    def rank(row: dict[str, Any]) -> tuple[int, float, str]:
        kind = str(row.get("sourceKind") or "")
        kind_rank = {
            "external-high-quality-audio": 0,
            "call-recording": 1,
            "external-audio": 2,
            "exported-podcast-master": 3,
            "source-video-scratch-audio": 4,
            "exported-video-audio": 5,
        }.get(kind, 6)
        return (kind_rank, -(source_duration(row) or 0.0), str(row.get("sourcePath") or ""))

    return sorted(readable, key=rank)[0], warnings


def chunk_rows(source: dict[str, Any], chunk_duration: float, overlap: float) -> list[dict[str, Any]]:
    duration = source_duration(source)
    if duration <= 0:
        return []
    rows: list[dict[str, Any]] = []
    count = max(1, math.ceil(duration / chunk_duration))
    for index in range(count):
        nominal_start = index * chunk_duration
        nominal_end = min(duration, nominal_start + chunk_duration)
        excerpt_start = max(0.0, nominal_start - overlap)
        excerpt_end = min(duration, nominal_end + overlap)
        rows.append({
            "index": index,
            "chunkId": f"episode-04-chunk-{index + 1:03d}",
            "nominalStartSeconds": round(nominal_start, 3),
            "nominalEndSeconds": round(nominal_end, 3),
            "excerptStartSeconds": round(excerpt_start, 3),
            "excerptEndSeconds": round(excerpt_end, 3),
            "excerptDurationSeconds": round(max(0.0, excerpt_end - excerpt_start), 3),
            "status": "pending",
        })
    return rows


def session_from_latest(args: argparse.Namespace, source: dict[str, Any]) -> Path | None:
    if args.session == "new":
        return None
    if args.session and args.session not in {"latest", ""}:
        candidate = Path(args.session).expanduser()
        return candidate if candidate.exists() else candidate
    pointer = load_json(LATEST_POINTER)
    target_text = str(pointer.get("jsonPath") or "")
    target = Path(target_text) if target_text else None
    if not target or not target.exists():
        return None
    manifest = load_json(target)
    if not manifest:
        return None
    same_source = str((manifest.get("source") or {}).get("sourcePath") or "") == str(source.get("sourcePath") or "")
    same_chunk = float(manifest.get("chunkDurationSeconds") or 0) == float(args.chunk_duration)
    same_overlap = float(manifest.get("overlapSeconds") or 0) == float(args.overlap)
    if same_source and same_chunk and same_overlap:
        return target.parent
    return None


def create_or_load_manifest(args: argparse.Namespace, source: dict[str, Any], warnings: list[str]) -> tuple[Path, dict[str, Any]]:
    session_dir = session_from_latest(args, source) or (OUT_ROOT / stamp())
    manifest_path = session_dir / "episode-04-transcript-chunks.json"
    if manifest_path.exists():
        manifest = load_json(manifest_path)
        existing_warnings = manifest.get("warnings") if isinstance(manifest.get("warnings"), list) else []
        manifest["warnings"] = [*existing_warnings, *warnings]
        return session_dir, manifest

    chunks = chunk_rows(source, args.chunk_duration, args.overlap)
    for row in chunks:
        chunk_id = row["chunkId"]
        row["excerptPath"] = str(session_dir / "chunks" / f"{chunk_id}.wav")
        row["rawProviderOutputPath"] = str(session_dir / "provider-outputs" / f"{chunk_id}.provider-output.txt")
        row["normalizedTranscriptJsonPath"] = str(session_dir / "normalized" / f"{chunk_id}.quipsly-transcript.json")
        row["error"] = ""
        row["startedAt"] = ""
        row["completedAt"] = ""
        row["segmentCount"] = 0
        row["wordCount"] = 0

    manifest = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "updatedAt": iso_now(),
        "status": "transcript-chunks-planned" if chunks else "transcript-chunks-blocked",
        "episode": EPISODE,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "chunkDurationSeconds": float(args.chunk_duration),
        "overlapSeconds": float(args.overlap),
        "provider": args.provider,
        "model": args.model,
        "language": args.language,
        "readinessPointer": str(args.readiness_pointer),
        "source": source,
        "chunks": chunks,
        "counts": {},
        "warnings": warnings,
        "nextSafestAction": "Run one chunk with --execute --max-chunks 1, review the chunk transcript, then continue.",
        "truth": truth(args, execution_dry_run=True),
    }
    update_counts(manifest)
    return session_dir, manifest


def truth(args: argparse.Namespace, execution_dry_run: bool) -> dict[str, Any]:
    payload = {
        "executionDryRun": execution_dry_run,
        "asrRun": False,
        "managedChunkAudioWritten": False,
        "rawProviderOutputsWritten": False,
        "normalizedTranscriptsWritten": False,
    }
    for key in DANGEROUS_TRUTH_KEYS:
        payload[key] = False
    return payload


def run_command(command: list[str], timeout: int | None = None) -> tuple[bool, str, str, int]:
    try:
        result = subprocess.run(
            command,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        return False, exc.stdout or "", f"Timed out after {timeout}s. {exc.stderr or ''}", 124
    return result.returncode == 0, result.stdout, result.stderr, result.returncode


def create_excerpt(source_path: Path, chunk: dict[str, Any]) -> tuple[bool, str]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False, "ffmpeg is not available."
    excerpt_path = Path(str(chunk.get("excerptPath") or ""))
    excerpt_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-ss",
        f"{float(chunk.get('excerptStartSeconds') or 0):.3f}",
        "-t",
        f"{float(chunk.get('excerptDurationSeconds') or 0):.3f}",
        "-i",
        str(source_path),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(excerpt_path),
    ]
    ok, stdout, stderr, code = run_command(command)
    if not ok or not excerpt_path.exists() or excerpt_path.stat().st_size <= 0:
        detail = (stderr or stdout or f"ffmpeg exited with code {code}").strip()
        return False, detail[-2000:]
    return True, ""


def run_provider(chunk: dict[str, Any], args: argparse.Namespace) -> tuple[bool, str]:
    raw_path = Path(str(chunk.get("rawProviderOutputPath") or ""))
    raw_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        "python3",
        str(PROVIDER),
        str(chunk.get("excerptPath") or ""),
        "--provider",
        args.provider,
        "--model",
        args.model,
        "--language",
        args.language,
    ]
    ok, stdout, stderr, code = run_command(command, timeout=args.timeout)
    if stdout:
        raw_path.write_text(stdout.rstrip() + "\n", encoding="utf-8")
    if not ok or not raw_path.exists() or raw_path.stat().st_size <= 0:
        detail = (stderr or stdout or f"Transcript provider exited with code {code}").strip()
        return False, detail[-3000:]
    return True, stdout


def offset_normalized_transcript(payload: dict[str, Any], chunk: dict[str, Any], original_source: dict[str, Any]) -> dict[str, Any]:
    offset = float(chunk.get("excerptStartSeconds") or 0.0)
    for segment in payload.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        local_start = float(segment.get("start") or 0.0)
        local_end = float(segment.get("end") or local_start)
        segment["chunkLocalStart"] = round(local_start, 3)
        segment["chunkLocalEnd"] = round(local_end, 3)
        segment["start"] = round(local_start + offset, 3)
        segment["end"] = round(local_end + offset, 3)
        segment["sourceChunkId"] = chunk.get("chunkId")
        for word in segment.get("words") or []:
            if not isinstance(word, dict):
                continue
            word_start = float(word.get("start") or 0.0)
            word_end = float(word.get("end") or word_start)
            word["chunkLocalStart"] = round(word_start, 3)
            word["chunkLocalEnd"] = round(word_end, 3)
            word["start"] = round(word_start + offset, 3)
            word["end"] = round(word_end + offset, 3)
            word["sourceChunkId"] = chunk.get("chunkId")

    source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
    source.update({
        "episode": EPISODE,
        "episodeLabel": "Episode 4",
        "chunkId": chunk.get("chunkId"),
        "chunkIndex": chunk.get("index"),
        "nominalStartSeconds": chunk.get("nominalStartSeconds"),
        "nominalEndSeconds": chunk.get("nominalEndSeconds"),
        "excerptStartSeconds": chunk.get("excerptStartSeconds"),
        "excerptEndSeconds": chunk.get("excerptEndSeconds"),
        "excerptDurationSeconds": chunk.get("excerptDurationSeconds"),
        "isManagedExcerpt": True,
        "sourcePath": chunk.get("excerptPath"),
        "originalSourcePath": original_source.get("sourcePath"),
        "originalSourceKind": original_source.get("sourceKind"),
        "originalFileName": original_source.get("fileName"),
    })
    payload["source"] = source
    payload["status"] = payload.get("status") or "normalized-transcript-ready"
    payload["truth"] = {
        "asrDraft": True,
        "chunkTimesOffsetToEpisodeSequence": True,
        "speakerLabelsReviewed": False,
        "timingReviewed": False,
        "readyForCaptions": False,
        "readyForQuotes": False,
        "transcriptImported": False,
        "timelineDecisionsWritten": False,
        "sourceFilesMutated": False,
    }
    return payload


def normalize_chunk(chunk: dict[str, Any], raw_text: str, source: dict[str, Any]) -> tuple[bool, str]:
    raw_path = Path(str(chunk.get("rawProviderOutputPath") or ""))
    normalized_path = Path(str(chunk.get("normalizedTranscriptJsonPath") or ""))
    execution_source = {
        "episode": EPISODE,
        "episodeLabel": "Episode 4",
        "queueId": chunk.get("chunkId"),
        "sourceKind": f"{source.get('sourceKind') or 'source'}-managed-chunk",
        "fileName": Path(str(chunk.get("excerptPath") or "")).name,
        "sourcePath": chunk.get("excerptPath"),
        "durationSeconds": chunk.get("excerptDurationSeconds"),
        "isManagedExcerpt": True,
        "originalSourcePath": source.get("sourcePath"),
        "excerptStartSeconds": chunk.get("excerptStartSeconds"),
        "excerptDurationSeconds": chunk.get("excerptDurationSeconds"),
    }
    payload, warnings = PILOT_HELPERS.normalize_provider_output(raw_text, execution_source, raw_path)
    payload = offset_normalized_transcript(payload, chunk, source)
    if warnings:
        chunk["warnings"] = [*list(chunk.get("warnings") or []), *warnings]
    write_json(normalized_path, payload)
    ok = normalized_path.exists() and normalized_path.stat().st_size > 0 and bool((payload.get("counts") or {}).get("segments"))
    return ok, "" if ok else "Normalized transcript contained no timed segments."


def update_counts(manifest: dict[str, Any]) -> None:
    chunks = [row for row in manifest.get("chunks") or [] if isinstance(row, dict)]
    counts = {
        "chunks": len(chunks),
        "pending": sum(1 for row in chunks if row.get("status") == "pending"),
        "chunkAudioReady": sum(1 for row in chunks if Path(str(row.get("excerptPath") or "")).exists()),
        "rawProviderOutputsWritten": sum(1 for row in chunks if Path(str(row.get("rawProviderOutputPath") or "")).exists()),
        "normalizedTranscriptsWritten": sum(1 for row in chunks if Path(str(row.get("normalizedTranscriptJsonPath") or "")).exists()),
        "failed": sum(1 for row in chunks if row.get("status") == "failed"),
        "segments": sum(int(row.get("segmentCount") or 0) for row in chunks),
        "words": sum(int(row.get("wordCount") or 0) for row in chunks),
    }
    counts["remaining"] = max(0, counts["chunks"] - counts["normalizedTranscriptsWritten"] - counts["failed"])
    manifest["counts"] = counts
    if counts["chunks"] == 0:
        manifest["status"] = "transcript-chunks-blocked"
    elif counts["normalizedTranscriptsWritten"] == counts["chunks"]:
        manifest["status"] = "transcript-chunks-normalized-complete"
        manifest["nextSafestAction"] = "Review and reconcile chunk transcripts into one Episode 4 transcript spine; do not import blindly."
    elif counts["normalizedTranscriptsWritten"] > 0:
        manifest["status"] = "transcript-chunks-in-progress"
        manifest["nextSafestAction"] = "Continue running one or more remaining chunks, then review before reconciliation."
    else:
        manifest["status"] = "transcript-chunks-planned"
    manifest["updatedAt"] = iso_now()
    manifest["truth"] = truth(argparse.Namespace(), execution_dry_run=False)
    manifest["truth"].update({
        "asrRun": counts["rawProviderOutputsWritten"] > 0,
        "managedChunkAudioWritten": counts["chunkAudioReady"] > 0,
        "rawProviderOutputsWritten": counts["rawProviderOutputsWritten"] > 0,
        "normalizedTranscriptsWritten": counts["normalizedTranscriptsWritten"] > 0,
    })


def execute_chunks(manifest: dict[str, Any], args: argparse.Namespace) -> None:
    source = manifest.get("source") if isinstance(manifest.get("source"), dict) else {}
    source_path = Path(str(source.get("sourcePath") or ""))
    if not source_path.exists():
        manifest.setdefault("warnings", []).append(f"Source path is no longer readable: {source_path}")
        manifest["status"] = "transcript-chunks-blocked"
        return

    executed = 0
    for chunk in manifest.get("chunks") or []:
        if not isinstance(chunk, dict):
            continue
        if executed >= args.max_chunks:
            break
        if Path(str(chunk.get("normalizedTranscriptJsonPath") or "")).exists():
            chunk["status"] = "normalized"
            continue
        if chunk.get("status") == "failed" and not args.retry_failed:
            continue

        chunk["startedAt"] = iso_now()
        chunk["status"] = "excerpting"
        ok, error = create_excerpt(source_path, chunk)
        if not ok:
            chunk["status"] = "failed"
            chunk["error"] = error
            executed += 1
            continue

        chunk["status"] = "asr-running"
        ok, raw_or_error = run_provider(chunk, args)
        if not ok:
            chunk["status"] = "failed"
            chunk["error"] = raw_or_error
            executed += 1
            continue

        chunk["status"] = "normalizing"
        ok, error = normalize_chunk(chunk, raw_or_error, source)
        if not ok:
            chunk["status"] = "failed"
            chunk["error"] = error
            executed += 1
            continue

        normalized = load_json(Path(str(chunk.get("normalizedTranscriptJsonPath") or "")))
        counts = normalized.get("counts") if isinstance(normalized.get("counts"), dict) else {}
        chunk["status"] = "normalized"
        chunk["completedAt"] = iso_now()
        chunk["segmentCount"] = int(counts.get("segments") or 0)
        chunk["wordCount"] = int(counts.get("words") or 0)
        chunk["error"] = ""
        executed += 1

    manifest["lastExecution"] = {
        "generatedAt": iso_now(),
        "execute": True,
        "maxChunks": args.max_chunks,
        "provider": args.provider,
        "model": args.model,
        "language": args.language,
    }
    update_counts(manifest)


def render_markdown(manifest: dict[str, Any]) -> str:
    source = manifest.get("source") if isinstance(manifest.get("source"), dict) else {}
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    lines = [
        "# Episode 4 transcript chunks",
        "",
        f"Generated: `{manifest.get('generatedAt')}`",
        f"Updated: `{manifest.get('updatedAt')}`",
        f"Status: `{manifest.get('status')}`",
        "",
        f"Next: {manifest.get('nextSafestAction')}",
        "",
        "## Source",
        "",
        f"- Kind: `{source.get('sourceKind')}`",
        f"- File: `{source.get('fileName')}`",
        f"- Duration: `{source.get('durationSeconds')}` seconds",
        f"- Path: `{source.get('sourcePath')}`",
        "",
        "## Counts",
        "",
    ]
    for key in ["chunks", "normalizedTranscriptsWritten", "rawProviderOutputsWritten", "chunkAudioReady", "failed", "remaining", "segments", "words"]:
        lines.append(f"- {key}: `{counts.get(key)}`")
    lines.extend(["", "## Chunks", ""])
    for row in manifest.get("chunks") or []:
        if not isinstance(row, dict):
            continue
        lines.append(
            f"- `{row.get('chunkId')}` `{row.get('status')}` "
            f"{row.get('nominalStartSeconds')}s-{row.get('nominalEndSeconds')}s "
            f"segments `{row.get('segmentCount')}` words `{row.get('wordCount')}`"
        )
        if row.get("error"):
            lines.append(f"  - error: {row.get('error')}")
    warnings = manifest.get("warnings") if isinstance(manifest.get("warnings"), list) else []
    if warnings:
        lines.extend(["", "## Warnings", ""])
        for warning in warnings[-20:]:
            lines.append(f"- {warning}")
    lines.extend(["", "## Truth boundary", ""])
    truth_payload = manifest.get("truth") if isinstance(manifest.get("truth"), dict) else {}
    for key in ["managedChunkAudioWritten", "asrRun", "rawProviderOutputsWritten", "normalizedTranscriptsWritten", *DANGEROUS_TRUTH_KEYS]:
        lines.append(f"- {key}: `{truth_payload.get(key)}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(manifest: dict[str, Any]) -> str:
    source = manifest.get("source") if isinstance(manifest.get("source"), dict) else {}
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    rows_html = "".join(
        f"<tr><td><code>{esc(row.get('chunkId'))}</code></td><td>{esc(row.get('status'))}</td>"
        f"<td>{esc(row.get('nominalStartSeconds'))}-{esc(row.get('nominalEndSeconds'))}s</td>"
        f"<td>{esc(row.get('segmentCount'))}</td><td>{esc(row.get('wordCount'))}</td>"
        f"<td class='path'>{esc(row.get('normalizedTranscriptJsonPath'))}</td><td class='bad'>{esc(row.get('error'))}</td></tr>"
        for row in manifest.get("chunks") or []
        if isinstance(row, dict)
    )
    warnings = manifest.get("warnings") if isinstance(manifest.get("warnings"), list) else []
    warnings_html = "".join(f"<li>{esc(w)}</li>" for w in warnings[-20:]) or "<li>No warnings.</li>"
    truth_payload = manifest.get("truth") if isinstance(manifest.get("truth"), dict) else {}
    truth_html = "".join(
        f"<span class='pill'>{esc(key)}: <code>{esc(truth_payload.get(key))}</code></span>"
        for key in ["managedChunkAudioWritten", "asrRun", "normalizedTranscriptsWritten", "transcriptsImported", "timelineDecisionsWritten", "sourceFilesMutated"]
    )
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 transcript chunks</title>
<style>
:root {{ color-scheme:dark; --bg:#0f1712; --panel:#18251c; --ink:#fff1d6; --muted:#c8b998; --line:#35533d; --leaf:#78dc83; --gold:#f2c64f; --clay:#d98157; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(120,220,131,.16),transparent 28%),linear-gradient(135deg,#0c130f,#251b11 75%); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel {{ border:1px solid var(--line); border-radius:28px; background:rgba(24,37,28,.92); padding:22px; margin:18px 0; box-shadow:0 18px 46px rgba(0,0,0,.32); }}
h1 {{ font-size:clamp(38px,6vw,72px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); letter-spacing:.17em; text-transform:uppercase; font-size:12px; font-weight:900; }}
.counts,.truth {{ display:flex; flex-wrap:wrap; gap:10px; margin:14px 0; }}
.pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.2); }}
.path {{ color:var(--muted); overflow-wrap:anywhere; max-width:420px; }}
.bad {{ color:#ffb0a0; max-width:320px; overflow-wrap:anywhere; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; }}
th,td {{ text-align:left; vertical-align:top; padding:8px; border-bottom:1px solid rgba(255,255,255,.08); }}
code {{ color:var(--leaf); }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · Episode 4 transcript runway</p><h1>{esc(manifest.get('status'))}</h1><p>{esc(manifest.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">chunks {esc(counts.get('chunks'))}</span><span class=\"pill\">normalized {esc(counts.get('normalizedTranscriptsWritten'))}</span><span class=\"pill\">remaining {esc(counts.get('remaining'))}</span><span class=\"pill\">segments {esc(counts.get('segments'))}</span><span class=\"pill\">words {esc(counts.get('words'))}</span></div></header>
<section class=\"panel\"><p class=\"eyebrow\">Source</p><h2>{esc(source.get('fileName'))}</h2><p>{esc(source.get('sourceKind'))} · {esc(source.get('durationSeconds'))}s</p><p class=\"path\">{esc(source.get('sourcePath'))}</p></section>
<section class=\"panel\"><p class=\"eyebrow\">Chunks</p><table><thead><tr><th>Chunk</th><th>Status</th><th>Range</th><th>Segments</th><th>Words</th><th>Transcript</th><th>Error</th></tr></thead><tbody>{rows_html}</tbody></table></section>
<section class=\"panel\"><p class=\"eyebrow\">Truth boundary</p><div class=\"truth\">{truth_html}</div></section>
<section class=\"panel\"><p class=\"eyebrow\">Warnings</p><ul>{warnings_html}</ul></section>
</main></body></html>"""


def write_surfaces(session_dir: Path, manifest: dict[str, Any]) -> tuple[Path, Path, Path]:
    manifest_path = session_dir / "episode-04-transcript-chunks.json"
    markdown_path = session_dir / "episode-04-transcript-chunks.md"
    html_path = session_dir / "index.html"
    write_json(manifest_path, manifest)
    markdown_path.write_text(render_markdown(manifest), encoding="utf-8")
    html_path.write_text(render_html(manifest), encoding="utf-8")
    pointer = {
        "schema": POINTER_SCHEMA,
        "generatedAt": iso_now(),
        "episode": EPISODE,
        "status": manifest.get("status"),
        "sessionDir": str(session_dir),
        "jsonPath": str(manifest_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": manifest.get("counts") or {},
        "truth": manifest.get("truth") or {},
    }
    write_json(LATEST_POINTER, pointer)
    return manifest_path, markdown_path, html_path


def build(args: argparse.Namespace) -> dict[str, Any]:
    readiness = load_pointer(Path(args.readiness_pointer))
    sources = iter_sources(readiness)
    source, warnings = choose_source(sources, args.source)
    if not source:
        session_dir = OUT_ROOT / stamp()
        manifest = {
            "schema": SCHEMA,
            "generatedAt": iso_now(),
            "updatedAt": iso_now(),
            "status": "transcript-chunks-blocked",
            "episode": EPISODE,
            "episodeLabel": "Episode 4",
            "sessionDir": str(session_dir),
            "source": {},
            "chunks": [],
            "counts": {"chunks": 0, "remaining": 0, "failed": 0, "segments": 0, "words": 0},
            "warnings": warnings,
            "nextSafestAction": "Make an Episode 4 audio/video transcript source readable, then rerun this command.",
            "truth": truth(args, execution_dry_run=not args.execute),
        }
        write_surfaces(session_dir, manifest)
        return manifest

    session_dir, manifest = create_or_load_manifest(args, source, warnings)
    if args.execute:
        execute_chunks(manifest, args)
    else:
        manifest["lastExecution"] = {
            "generatedAt": iso_now(),
            "execute": False,
            "note": "Dry-run/plan only. No chunk audio or ASR generated in this invocation.",
        }
        update_counts(manifest)
        manifest["truth"]["executionDryRun"] = True
    manifest_path, markdown_path, html_path = write_surfaces(session_dir, manifest)
    manifest["jsonPath"] = str(manifest_path)
    manifest["markdownPath"] = str(markdown_path)
    manifest["htmlPath"] = str(html_path)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Run resumable Episode 4 transcript chunks.")
    parser.add_argument("--readiness-pointer", default=str(READINESS_POINTER))
    parser.add_argument("--source", default="", help="Explicit source media/audio path to chunk.")
    parser.add_argument("--session", default="latest", help="latest, new, or a session folder path.")
    parser.add_argument("--chunk-duration", type=float, default=600.0)
    parser.add_argument("--overlap", type=float, default=1.5)
    parser.add_argument("--max-chunks", type=int, default=1)
    parser.add_argument("--execute", action="store_true", help="Actually create chunk audio and run ASR for pending chunks.")
    parser.add_argument("--retry-failed", action="store_true")
    parser.add_argument("--timeout", type=int, default=900)
    parser.add_argument("--provider", default="auto")
    parser.add_argument("--model", default="base")
    parser.add_argument("--language", default="en")
    parser.add_argument("--json", action="store_true", help="Print full manifest JSON.")
    parser.add_argument("--markdown", action="store_true", help="Print markdown report.")
    args = parser.parse_args()

    if args.chunk_duration <= 0:
        parser.error("--chunk-duration must be positive")
    if args.overlap < 0:
        parser.error("--overlap cannot be negative")
    if args.max_chunks <= 0:
        parser.error("--max-chunks must be positive")

    manifest = build(args)
    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(manifest), end="")
    else:
        counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
        print(f"Episode 4 transcript chunks: {manifest.get('status')}")
        print(f"  Board: {manifest.get('htmlPath') or (Path(str(manifest.get('sessionDir') or '')) / 'index.html')}")
        print(f"  JSON: {manifest.get('jsonPath') or (Path(str(manifest.get('sessionDir') or '')) / 'episode-04-transcript-chunks.json')}")
        print(f"  Chunks: {counts.get('chunks', 0)} normalized={counts.get('normalizedTranscriptsWritten', 0)} remaining={counts.get('remaining', 0)} failed={counts.get('failed', 0)}")
        print(f"  Next: {manifest.get('nextSafestAction')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
