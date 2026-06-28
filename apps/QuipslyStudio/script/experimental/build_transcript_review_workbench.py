#!/usr/bin/env python3
"""Build a transcript review workbench from draft ASR sidecars.

This is a review surface only. It reads normalized transcript JSON files created
by transcript pilots/execution and makes the evidence human/agent readable. It
does not edit transcripts, import them into episode state, reconcile spines,
write timeline decisions, render exports, approve, upload, publish, schedule,
overwrite, delete, or mutate original media/source files.
"""
from __future__ import annotations

import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
PILOT_POINTER = RELEASE_ROOT / "review-board/transcript-pilots/latest-transcript-pilot.json"
EXECUTION_ROOT = RELEASE_ROOT / "review-board/transcript-execution-readiness"
NORMALIZED_ROOT = EXECUTION_ROOT / "planned-normalized-transcripts"
OUT_ROOT = RELEASE_ROOT / "review-board/transcript-review-workbench"
LATEST_POINTER = OUT_ROOT / "latest-transcript-review-workbench.json"
SCHEMA = "quipsly.transcript-review-workbench.v1"

DANGEROUS_TRUTH_KEYS = [
    "transcriptsEdited",
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
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-transcript-review-workbench")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target and target.exists() and target != path:
        target_payload = load_json(target)
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def transcript_paths() -> list[Path]:
    paths: list[Path] = []
    if NORMALIZED_ROOT.exists():
        paths.extend(sorted(NORMALIZED_ROOT.glob("**/*.quipsly-transcript.json")))
    pilot = load_pointer(PILOT_POINTER)
    pilot_path = Path(str(pilot.get("normalizedTranscriptJsonPath") or "")) if pilot.get("normalizedTranscriptJsonPath") else None
    if pilot_path and pilot_path.exists() and pilot_path not in paths:
        paths.insert(0, pilot_path)
    return paths


def preview_segments(segments: list[dict[str, Any]], limit: int = 8) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for index, segment in enumerate(segments[:limit], start=1):
        rows.append({
            "index": index,
            "start": segment.get("start"),
            "end": segment.get("end"),
            "speaker": segment.get("speaker") or "Speaker",
            "text": str(segment.get("text") or "").strip(),
            "wordCount": len(str(segment.get("text") or "").split()),
            "timedWords": len(segment.get("words") or []) if isinstance(segment.get("words"), list) else 0,
            "reviewStatus": segment.get("reviewStatus") or "asr-draft",
        })
    return rows


def review_flags(transcript: dict[str, Any], segments: list[dict[str, Any]]) -> list[str]:
    flags: list[str] = []
    if not segments:
        flags.append("No transcript segments found; rerun ASR or inspect raw provider output.")
        return flags
    speakers = {str(segment.get("speaker") or "Speaker") for segment in segments}
    if speakers == {"Speaker"}:
        flags.append("Speaker labels are placeholders and need Charlie/Homer review before publication or quote extraction.")
    timed_words = sum(len(segment.get("words") or []) for segment in segments if isinstance(segment.get("words"), list))
    if timed_words == 0:
        flags.append("No word-level timings yet; usable for rough text, not karaoke captions or word-highlight editing.")
    source = transcript.get("source") if isinstance(transcript.get("source"), dict) else {}
    if not source.get("rawProviderOutputPath"):
        flags.append("Raw provider output path is missing; keep raw ASR evidence before promoting this transcript.")
    if transcript.get("status") != "normalized-transcript-ready":
        flags.append(f"Transcript status is {transcript.get('status')}; review before any downstream use.")
    return flags


def build_row(path: Path) -> dict[str, Any]:
    transcript = load_json(path)
    segments = transcript.get("segments") if isinstance(transcript.get("segments"), list) else []
    source = transcript.get("source") if isinstance(transcript.get("source"), dict) else {}
    flags = review_flags(transcript, [row for row in segments if isinstance(row, dict)])
    return {
        "transcriptPath": str(path),
        "status": transcript.get("status") or "unknown",
        "provider": transcript.get("provider") or "unknown",
        "model": transcript.get("model") or "unknown",
        "language": transcript.get("language") or "unknown",
        "source": source,
        "fileName": source.get("fileName") or path.name,
        "episode": source.get("episode"),
        "episodeLabel": source.get("episodeLabel") or "Episode unknown",
        "sourceKind": source.get("sourceKind") or "unknown",
        "sourcePath": source.get("sourcePath") or "",
        "rawProviderOutputPath": source.get("rawProviderOutputPath") or "",
        "counts": {
            "segments": len(segments),
            "words": sum(len(str(segment.get("text") or "").split()) for segment in segments if isinstance(segment, dict)),
            "timedWords": sum(len(segment.get("words") or []) for segment in segments if isinstance(segment, dict) and isinstance(segment.get("words"), list)),
            "placeholderSpeakerSegments": sum(1 for segment in segments if isinstance(segment, dict) and str(segment.get("speaker") or "Speaker") == "Speaker"),
        },
        "reviewFlags": flags,
        "previewSegments": preview_segments([row for row in segments if isinstance(row, dict)]),
        "nextReviewActions": [
            "Listen against the source audio for timing drift and missing words.",
            "Replace placeholder Speaker labels with Charlie/Homer/Guest when obvious.",
            "Mark unusable sections before any transcript spine reconciliation.",
            "Only after review: use this transcript for edit suggestions, captions, show notes, quotes, or Nest writing packets.",
        ],
        "truth": {
            "asrDraft": True,
            "speakerLabelsReviewed": False,
            "timingReviewed": False,
            "readyForCaptions": False,
            "readyForQuotes": False,
            "transcriptImported": False,
            "timelineDecisionsWritten": False,
            "sourceFilesMutated": False,
        },
    }


def build_payload() -> dict[str, Any]:
    rows = [build_row(path) for path in transcript_paths()]
    pilot = load_pointer(PILOT_POINTER)
    counts = {
        "normalizedTranscripts": len(rows),
        "episodes": len({str(row.get("episodeLabel") or "") for row in rows if row.get("episodeLabel")}),
        "segments": sum(int((row.get("counts") or {}).get("segments") or 0) for row in rows),
        "words": sum(int((row.get("counts") or {}).get("words") or 0) for row in rows),
        "timedWords": sum(int((row.get("counts") or {}).get("timedWords") or 0) for row in rows),
        "transcriptsWithReviewFlags": sum(1 for row in rows if row.get("reviewFlags")),
        "transcriptsImported": 0,
        "reconciledTranscriptSpinesWritten": 0,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "transcript-review-workbench-ready" if rows else "transcript-review-workbench-empty",
        "releaseRoot": str(RELEASE_ROOT),
        "pilotPointer": str(PILOT_POINTER),
        "latestPilotHtml": pilot.get("htmlPath") or "",
        "latestPilotStatus": pilot.get("status") or "not-run",
        "counts": counts,
        "transcripts": rows,
        "nextSafestAction": (
            "Review the first normalized draft transcript for speaker labels and timing before importing, reconciling, or using it for captions/quotes."
            if rows else
            "Run one transcript pilot first, then return here for review before batch ASR or reconciliation."
        ),
        "humanAsk": "Open the transcript workbench, read the flags, and review one draft transcript against its source audio before any import/reconciliation.",
        "agentSafeParallelWork": "Codex may build review UI, normalization checks, and reconciliation prep. It must not import transcripts, write timeline decisions, publish, upload, mutate sources, or create receipt truth.",
        "truth": {
            "reviewWorkbenchOnly": True,
            "transcriptsEdited": False,
            "transcriptsImported": False,
            "reconciledTranscriptSpinesWritten": False,
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


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Transcript review workbench",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        f"Next: {payload.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    for key in ["normalizedTranscripts", "episodes", "segments", "words", "timedWords", "transcriptsWithReviewFlags"]:
        lines.append(f"- {key}: `{counts.get(key, 0)}`")
    lines.extend(["", "## Draft transcripts", ""])
    for row in payload.get("transcripts") or []:
        counts = row.get("counts") if isinstance(row.get("counts"), dict) else {}
        lines.extend([
            f"### {row.get('episodeLabel')} · {row.get('fileName')}",
            "",
            f"- Transcript: `{row.get('transcriptPath')}`",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Raw provider output: `{row.get('rawProviderOutputPath')}`",
            f"- Segments: `{counts.get('segments', 0)}` · words: `{counts.get('words', 0)}` · timed words: `{counts.get('timedWords', 0)}`",
        ])
        for flag in row.get("reviewFlags") or []:
            lines.append(f"- Review flag: {flag}")
        lines.append("")
    lines.extend([
        "## Safety boundary",
        "",
        "- Review workbench only: no transcript edits, imports, reconciled spines, timeline decisions, renders, approvals, uploads, publications, schedules, source mutations, overwrites, deletes, or receipt truth.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    cards: list[str] = []
    for row in payload.get("transcripts") or []:
        row_counts = row.get("counts") if isinstance(row.get("counts"), dict) else {}
        flags = "".join(f"<li>{esc(flag)}</li>" for flag in (row.get("reviewFlags") or [])) or "<li>No review flags.</li>"
        preview = "".join(
            f"<tr><td>{esc(seg.get('start'))}–{esc(seg.get('end'))}</td><td>{esc(seg.get('speaker'))}</td><td>{esc(seg.get('text'))}</td></tr>"
            for seg in (row.get("previewSegments") or [])
        ) or "<tr><td colspan=\"3\">No preview segments.</td></tr>"
        cards.append(f"""
        <article class=\"card\">
          <p class=\"eyebrow\">{esc(row.get('episodeLabel'))} · {esc(row.get('sourceKind'))}</p>
          <h2>{esc(row.get('fileName'))}</h2>
          <p><b>Status:</b> {esc(row.get('status'))} · <b>Provider:</b> {esc(row.get('provider'))} · <b>Model:</b> {esc(row.get('model'))}</p>
          <div class=\"metrics\"><span>{esc(row_counts.get('segments'))} segments</span><span>{esc(row_counts.get('words'))} words</span><span>{esc(row_counts.get('timedWords'))} timed words</span></div>
          <p class=\"path\">Transcript: {esc(row.get('transcriptPath'))}</p>
          <p class=\"path\">Source: {esc(row.get('sourcePath'))}</p>
          <h3>Review flags</h3><ul>{flags}</ul>
          <details open><summary>Preview segments</summary><table><thead><tr><th>Time</th><th>Speaker</th><th>Text</th></tr></thead><tbody>{preview}</tbody></table></details>
        </article>
        """)
    html_text = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Transcript review workbench</title>
<style>
:root {{ color-scheme:dark; --bg:#10170f; --panel:#1c2a1f; --ink:#fff0d4; --muted:#c9b99b; --gold:#f3cc5a; --leaf:#8bd989; --water:#79d1df; --clay:#d98662; --line:#3d563f; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at 10% 0%,rgba(121,209,223,.18),transparent 32%),linear-gradient(135deg,#10170f,#241a12 74%); color:var(--ink); }}
main {{ max-width:1240px; margin:0 auto; padding:38px 24px 84px; }}
header,.card,.panel {{ border:1px solid var(--line); border-radius:30px; background:rgba(28,42,31,.92); padding:24px; margin:18px 0; box-shadow:0 18px 52px rgba(0,0,0,.28); }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.92; margin:.05em 0 .25em; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.metrics {{ display:flex; flex-wrap:wrap; gap:10px; margin:12px 0; }}
.metrics span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
.path {{ color:var(--muted); font-size:12px; overflow-wrap:anywhere; }}
table {{ width:100%; border-collapse:collapse; margin-top:10px; }}
th,td {{ text-align:left; vertical-align:top; padding:9px 7px; border-bottom:1px solid rgba(255,255,255,.08); }}
th {{ color:var(--water); }}
li {{ margin:.35rem 0; }}
</style></head><body><main>
<header><p class=\"eyebrow\">Quipsly Studio · transcript review</p><h1>Draft transcripts need eyes before they become spine.</h1><p>{esc(payload.get('nextSafestAction'))}</p><div class=\"metrics\"><span>{esc(counts.get('normalizedTranscripts'))} normalized transcripts</span><span>{esc(counts.get('segments'))} segments</span><span>{esc(counts.get('words'))} words</span><span>{esc(counts.get('timedWords'))} timed words</span></div></header>
<section class=\"panel\"><p class=\"eyebrow\">Safety</p><p>This workbench is review-only. It does not edit/import transcripts, reconcile spines, write timeline decisions, render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.</p></section>
{''.join(cards) if cards else '<section class="panel"><p>No normalized transcript sidecars found yet. Run one transcript pilot first.</p></section>'}
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    payload = build_payload()
    session_dir = OUT_ROOT / stamp()
    html_path = session_dir / "index.html"
    json_path = session_dir / "transcript-review-workbench.json"
    markdown_path = session_dir / "START-HERE-transcript-review-workbench.md"
    payload.update({
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "firstSafeAction": {
            "label": "Open transcript review workbench",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens a local transcript review workbench only. No edits, imports, reconciliation, timeline changes, renders, approvals, uploads, publications, schedules, overwrites, source mutations, deletes, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    write_json(LATEST_POINTER, payload)
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": payload.get("htmlPath"),
        "jsonPath": payload.get("jsonPath"),
        "markdownPath": payload.get("markdownPath"),
        "counts": payload.get("counts"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
