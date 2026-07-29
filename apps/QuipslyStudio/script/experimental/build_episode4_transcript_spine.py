#!/usr/bin/env python3
"""Build one draft Episode 4 transcript spine from normalized chunk transcripts.

This script consolidates completed managed ASR chunks into a single searchable
transcript artifact. It keeps source lineage and uses deterministic chunk-range
ownership to avoid overlap duplicates. It does not import the transcript into the
editor, write captions, edit timelines, render exports, or mutate source media.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
CHUNKS_POINTER = RELEASE_ROOT / "review-board/transcript-full-asr/latest-episode-04-transcript-chunks.json"
OUT_ROOT = RELEASE_ROOT / "review-board/transcript-spines/episode-04"
LATEST_POINTER = RELEASE_ROOT / "review-board/transcript-spines/latest-episode-04-transcript-spine.json"
SCHEMA = "quipsly.episode-transcript-spine.v1"
EPISODE = 4


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-spine")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: float) -> str:
    seconds = max(0.0, float(seconds or 0.0))
    whole = int(seconds)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


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


def normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def segment_midpoint(segment: dict[str, Any]) -> float:
    start = float(segment.get("start") or 0.0)
    end = float(segment.get("end") or start)
    return (start + end) / 2.0


def owned_by_chunk(segment: dict[str, Any], chunk: dict[str, Any], is_last: bool) -> bool:
    midpoint = segment_midpoint(segment)
    nominal_start = float(chunk.get("nominalStartSeconds") or 0.0)
    nominal_end = float(chunk.get("nominalEndSeconds") or nominal_start)
    if is_last:
        return nominal_start <= midpoint <= nominal_end + 0.25
    return nominal_start <= midpoint < nominal_end


def collect_segments(manifest: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    chunks = [row for row in manifest.get("chunks") or [] if isinstance(row, dict)]
    collected: list[dict[str, Any]] = []
    seen: set[tuple[int, str]] = set()
    for index, chunk in enumerate(chunks):
        path = Path(str(chunk.get("normalizedTranscriptJsonPath") or ""))
        if not path.exists():
            warnings.append(f"Missing normalized chunk transcript: {path}")
            continue
        payload = load_json(path)
        is_last = index == len(chunks) - 1
        for segment_index, segment in enumerate(payload.get("segments") or []):
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "").strip()
            if not text:
                continue
            try:
                start = float(segment.get("start") or 0.0)
                end = float(segment.get("end") or start)
            except Exception:
                continue
            if end <= start:
                continue
            if not owned_by_chunk(segment, chunk, is_last):
                continue
            key = (round(start * 10), normalize_text(text))
            if key in seen:
                continue
            seen.add(key)
            words = segment.get("words") if isinstance(segment.get("words"), list) else []
            collected.append({
                "segmentId": f"ep4-seg-{len(collected) + 1:04d}",
                "speaker": segment.get("speaker") or "Speaker",
                "speakerStatus": "placeholder-needs-review",
                "start": round(start, 3),
                "end": round(end, 3),
                "timeLabel": fmt_time(start),
                "text": text,
                "words": words,
                "wordCount": len(words),
                "reviewStatus": "asr-draft-needs-review",
                "sourceChunkId": chunk.get("chunkId") or segment.get("sourceChunkId"),
                "sourceTranscriptPath": str(path),
                "chunkSegmentIndex": segment_index,
            })
    return sorted(collected, key=lambda row: float(row.get("start") or 0.0)), warnings


def build_plaintext(segments: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for segment in segments:
        lines.append(f"[{segment.get('timeLabel')}] {segment.get('speaker')}: {segment.get('text')}")
    return "\n".join(lines).rstrip() + "\n"


def build_search_index(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    index: list[dict[str, Any]] = []
    for segment in segments:
        tokens = sorted(set(re.findall(r"[a-z0-9']+", str(segment.get("text") or "").lower())))
        index.append({
            "segmentId": segment.get("segmentId"),
            "start": segment.get("start"),
            "end": segment.get("end"),
            "tokens": tokens,
        })
    return index


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
    lines = [
        "# Episode 4 draft transcript spine",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Source",
        "",
        f"- File: `{source.get('fileName')}`",
        f"- Path: `{source.get('sourcePath')}`",
        f"- Duration: `{source.get('durationSeconds')}` seconds",
        "",
        "## Counts",
        "",
    ]
    for key in ["segments", "words", "sourceChunks", "missingChunks", "durationSeconds"]:
        lines.append(f"- {key}: `{counts.get(key)}`")
    lines.extend(["", "## First segments", ""])
    for segment in (payload.get("segments") or [])[:12]:
        if not isinstance(segment, dict):
            continue
        lines.append(f"- `{segment.get('timeLabel')}` {segment.get('text')}")
    warnings = payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
    if warnings:
        lines.extend(["", "## Warnings", ""])
        for warning in warnings:
            lines.append(f"- {warning}")
    lines.extend(["", "## Truth boundary", ""])
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    for key in ["asrDraft", "speakerLabelsReviewed", "timingReviewed", "readyForCaptions", "readyForQuotes", "transcriptImported", "timelineDecisionsWritten", "sourceFilesMutated"]:
        lines.append(f"- {key}: `{truth.get(key)}`")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    source = payload.get("source") if isinstance(payload.get("source"), dict) else {}
    rows = "".join(
        f"<tr><td><code>{esc(segment.get('timeLabel'))}</code></td><td>{esc(segment.get('speaker'))}</td><td>{esc(segment.get('text'))}</td><td><code>{esc(segment.get('sourceChunkId'))}</code></td></tr>"
        for segment in (payload.get("segments") or [])[:160]
        if isinstance(segment, dict)
    )
    return f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 transcript spine</title>
<style>
:root {{ color-scheme:dark; --bg:#0d1510; --panel:#19251c; --ink:#fff0d4; --muted:#c8b897; --line:#36523b; --leaf:#76dc86; --gold:#f1c64e; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(118,220,134,.16),transparent 28%),linear-gradient(135deg,#0b130f,#251b11 75%); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:36px 24px 80px; }}
header,.panel {{ border:1px solid var(--line); border-radius:28px; background:rgba(25,37,28,.92); padding:22px; margin:18px 0; box-shadow:0 18px 48px rgba(0,0,0,.3); }}
h1 {{ font-size:clamp(38px,6vw,74px); line-height:.92; margin:.08em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.17em; font-size:12px; font-weight:900; }}
.counts {{ display:flex; flex-wrap:wrap; gap:10px; }} .pill {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.22); }}
.path {{ color:var(--muted); overflow-wrap:anywhere; }} table {{ width:100%; border-collapse:collapse; font-size:13px; }} td,th {{ vertical-align:top; text-align:left; padding:8px; border-bottom:1px solid rgba(255,255,255,.08); }} code {{ color:var(--leaf); }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · Episode 4 transcript spine</p><h1>{esc(payload.get('status'))}</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"counts\"><span class=\"pill\">segments {esc(counts.get('segments'))}</span><span class=\"pill\">words {esc(counts.get('words'))}</span><span class=\"pill\">chunks {esc(counts.get('sourceChunks'))}</span><span class=\"pill\">duration {esc(counts.get('durationLabel'))}</span></div></header>
<section class=\"panel\"><p class=\"eyebrow\">Source</p><h2>{esc(source.get('fileName'))}</h2><p class=\"path\">{esc(source.get('sourcePath'))}</p></section>
<section class=\"panel\"><p class=\"eyebrow\">Transcript preview</p><table><thead><tr><th>Time</th><th>Speaker</th><th>Text</th><th>Chunk</th></tr></thead><tbody>{rows}</tbody></table><p>Showing first 160 segments only. Use the JSON/plaintext artifacts for the full draft.</p></section>
</main></body></html>"""


def build(args: argparse.Namespace) -> dict[str, Any]:
    manifest = load_pointer(Path(args.chunks_pointer))
    segments, warnings = collect_segments(manifest)
    source = manifest.get("source") if isinstance(manifest.get("source"), dict) else {}
    chunks = [row for row in manifest.get("chunks") or [] if isinstance(row, dict)]
    words = sum(int(segment.get("wordCount") or 0) for segment in segments)
    duration = float(source.get("durationSeconds") or 0.0)
    out_dir = OUT_ROOT / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode-4-draft-transcript-spine-ready" if segments else "episode-4-draft-transcript-spine-empty",
        "episode": EPISODE,
        "episodeLabel": "Episode 4",
        "source": source,
        "chunkManifestPath": manifest.get("jsonPath") or str(args.chunks_pointer),
        "counts": {
            "segments": len(segments),
            "words": words,
            "sourceChunks": len(chunks),
            "missingChunks": sum(1 for row in chunks if not Path(str(row.get("normalizedTranscriptJsonPath") or "")).exists()),
            "durationSeconds": duration,
            "durationLabel": fmt_time(duration),
        },
        "segments": segments,
        "searchIndex": build_search_index(segments) if args.include_search_index else [],
        "warnings": warnings,
        "nextSafestAction": "Review speaker labels/timing, then connect this draft spine to clip cues, shorts scoring, and transcript-aware editing. Do not publish captions from this draft as-is.",
        "truth": {
            "asrDraft": True,
            "chunkOverlapResolvedByMidpointOwnership": True,
            "speakerLabelsReviewed": False,
            "timingReviewed": False,
            "readyForCaptions": False,
            "readyForQuotes": False,
            "transcriptImported": False,
            "timelineDecisionsWritten": False,
            "sourceFilesMutated": False,
            "exportsRendered": False,
            "externalPublishing": False,
        },
    }
    json_path = out_dir / "episode-04.transcript-spine.draft.json"
    plaintext_path = out_dir / "episode-04.transcript-spine.draft.txt"
    markdown_path = out_dir / "episode-04.transcript-spine.draft.md"
    html_path = out_dir / "index.html"
    payload.update({
        "jsonPath": str(json_path),
        "plaintextPath": str(plaintext_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
    })
    write_json(json_path, payload)
    plaintext_path.write_text(build_plaintext(segments), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    html_path.write_text(render_html(payload), encoding="utf-8")
    write_json(LATEST_POINTER, {
        "schema": "quipsly.episode-transcript-spine-pointer.v1",
        "generatedAt": iso_now(),
        "status": payload["status"],
        "jsonPath": str(json_path),
        "plaintextPath": str(plaintext_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "truth": payload["truth"],
    })
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Episode 4 draft transcript spine from chunk transcripts.")
    parser.add_argument("--chunks-pointer", default=str(CHUNKS_POINTER))
    parser.add_argument("--include-search-index", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()
    payload = build(args)
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.markdown:
        print(render_markdown(payload), end="")
    else:
        counts = payload.get("counts") or {}
        print(f"Episode 4 transcript spine: {payload.get('status')}")
        print(f"  Board: {payload.get('htmlPath')}")
        print(f"  JSON: {payload.get('jsonPath')}")
        print(f"  Text: {payload.get('plaintextPath')}")
        print(f"  Segments: {counts.get('segments')} words={counts.get('words')} chunks={counts.get('sourceChunks')} missing={counts.get('missingChunks')}")
        print(f"  Next: {payload.get('nextSafestAction')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
