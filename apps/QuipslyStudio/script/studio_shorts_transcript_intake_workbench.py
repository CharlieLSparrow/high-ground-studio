#!/usr/bin/env python3
"""Build a transcript-intake review workbench for recommended shorts.

This workbench sits between audio sidecars and transcript truth. It makes ASR
or manual transcript work easy to start, but it does not create spoken-word
truth, approve captions, mutate media, publish, upload, or create receipts.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-intake"
    / "index"
    / "quipsly-studio-shorts-transcript-intake-index.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "transcript-intake" / "workbench"
SCHEMA = "quipsly.studio.shorts-transcript-intake-workbench.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Transcript intake index not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-transcript-intake-index --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def destination_status(path_value: str) -> dict[str, Any]:
    path = Path(path_value) if path_value else Path()
    exists = bool(path_value and path.exists())
    return {
        "path": path_value,
        "exists": exists,
        "bytes": path.stat().st_size if exists and path.is_file() else 0,
        "fileUri": file_uri(path) if exists else "",
    }


def read_asr_draft_summary(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {
            "exists": False,
            "wordCountApprox": 0,
            "segmentCount": 0,
            "sample": "",
            "status": "missing",
        }
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {
            "exists": True,
            "wordCountApprox": 0,
            "segmentCount": 0,
            "sample": "",
            "status": "unreadable",
        }
    text = str(data.get("text") or "").strip()
    segments = data.get("segments") if isinstance(data.get("segments"), list) else []
    return {
        "exists": True,
        "status": data.get("status") or "asr-draft-needs-human-review",
        "wordCountApprox": data.get("wordCountApprox") or len([word for word in text.split() if word.strip()]),
        "segmentCount": len(segments),
        "sample": text[:420],
        "provider": data.get("provider") or "",
        "model": data.get("model") or "",
        "truth": data.get("truth") or "ASR draft summary only. Review against audio before promotion.",
    }


def item_status(row: dict[str, Any]) -> str:
    normalized = str(row.get("normalizedTranscriptPath") or "")
    if normalized and Path(normalized).exists():
        return "transcript-sidecar-present-needs-review"
    raw = str(row.get("rawProviderOutputPath") or "")
    srt = str(row.get("captionDraftSrtPath") or "")
    vtt = str(row.get("captionDraftVttPath") or "")
    draft = asr_draft_transcript_path(row)
    if draft.exists() or (raw and Path(raw).exists()) or (srt and Path(srt).exists()) or (vtt and Path(vtt).exists()):
        return "asr-draft-present-needs-review"
    if row.get("audioSidecarExists"):
        return "ready-for-asr-or-manual-transcript"
    return "needs-audio-sidecar"


def asr_draft_transcript_path(row: dict[str, Any]) -> Path:
    normalized = str(row.get("normalizedTranscriptPath") or "")
    short_id = str(row.get("shortId") or "unknown-short")
    if normalized:
        return Path(normalized).with_name(f"{short_id}-asr-draft-transcript.json")
    return DEFAULT_OUTPUT_DIR / "drafts" / f"{short_id}-asr-draft-transcript.json"


def worksheet_path(output_dir: Path, short_id: str) -> Path:
    return output_dir / "worksheets" / f"{short_id}-transcript-intake-review.md"


def worksheet_text(row: dict[str, Any], status: str) -> str:
    short_id = str(row.get("shortId") or "unknown-short")
    destinations = {
        "rawProviderOutput": row.get("rawProviderOutputPath") or "",
        "normalizedTranscript": row.get("normalizedTranscriptPath") or "",
        "captionDraftSrt": row.get("captionDraftSrtPath") or "",
        "captionDraftVtt": row.get("captionDraftVttPath") or "",
    }
    lines = [
        f"# Transcript intake review: {short_id}",
        "",
        f"- Episode: Episode {row.get('episode')}",
        f"- Title: {row.get('title') or ''}",
        f"- Status: {status}",
        f"- Audio sidecar: `{row.get('audioSidecarPath') or ''}`",
        f"- Source short: `{row.get('mediaPath') or ''}`",
        "",
        "## Planned sidecars",
        "",
    ]
    for label, path in destinations.items():
        lines.append(f"- {label}: `{path}`")
    lines.extend(
        [
            "",
            "## Human or agent transcript notes",
            "",
            "- Speaker confidence:",
            "- Words that need verification:",
            "- Caption timing risks:",
            "- Face/caption collision risks:",
            "- Editing meaning notes:",
            "",
            "## Truth boundary",
            "",
            "This worksheet is not transcript truth. Use it to prepare or review raw ASR/manual transcript work, then write normalized transcript/caption sidecars only when the words have been checked.",
        ]
    )
    return "\n".join(lines).rstrip() + "\n"


def build_item(row: dict[str, Any], output_dir: Path, write_worksheets: bool) -> dict[str, Any]:
    short_id = str(row.get("shortId") or "unknown-short")
    status = item_status(row)
    worksheet = worksheet_path(output_dir, short_id)
    if write_worksheets and not worksheet.exists():
        worksheet.parent.mkdir(parents=True, exist_ok=True)
        worksheet.write_text(worksheet_text(row, status), encoding="utf-8")
    audio_path = Path(str(row.get("audioSidecarPath") or ""))
    normalized = str(row.get("normalizedTranscriptPath") or "")
    raw = str(row.get("rawProviderOutputPath") or "")
    draft = str(asr_draft_transcript_path(row))
    srt = str(row.get("captionDraftSrtPath") or "")
    vtt = str(row.get("captionDraftVttPath") or "")
    transcript_folder = Path(normalized).parent if normalized else output_dir / "missing-destination"
    return {
        "shortId": short_id,
        "episode": row.get("episode"),
        "episodeVersion": row.get("episodeVersion"),
        "title": row.get("title"),
        "status": status,
        "sourceStatus": row.get("status") or "unknown",
        "audioSidecar": destination_status(str(audio_path)),
        "sourceMedia": destination_status(str(row.get("mediaPath") or "")),
        "worksheet": destination_status(str(worksheet)),
        "destinations": {
            "rawProviderOutput": destination_status(raw),
            "asrDraftTranscript": destination_status(draft),
            "normalizedTranscript": destination_status(normalized),
            "captionDraftSrt": destination_status(srt),
            "captionDraftVtt": destination_status(vtt),
        },
        "asrDraftSummary": read_asr_draft_summary(Path(draft)),
        "safeCommands": {
            "openAudio": f"open {shell_quote(str(audio_path))}" if audio_path.exists() else "",
            "openWorksheet": f"open {shell_quote(str(worksheet))}" if worksheet.exists() else "",
            "makeDestinationFolder": f"mkdir -p {shell_quote(str(transcript_folder))}",
            "openDestinationFolder": f"open {shell_quote(str(transcript_folder))}" if transcript_folder.exists() else "",
            "rerunReadiness": "script/agentctl.sh studio-shorts-transcript-readiness --all",
        },
        "nextSafestAction": (
            "Run ASR or manual transcript review from the audio sidecar, then write raw provider output plus normalized transcript/caption sidecars."
            if status == "ready-for-asr-or-manual-transcript"
            else "Review the ASR draft against the audio before promoting any words into normalized transcript truth."
            if status == "asr-draft-present-needs-review"
            else "Review the existing transcript sidecar before using it for caption-aware edit decisions."
            if status == "transcript-sidecar-present-needs-review"
            else "Create or repair the audio sidecar before transcript review."
        ),
        "truth": "Transcript-intake workbench item only. It is not spoken-word truth, edit approval, publication, upload, schedule, source mutation, or receipt truth.",
    }


def build_workbench(index_path: Path, output_dir: Path, limit: int, write_worksheets: bool) -> dict[str, Any]:
    index = read_json(index_path)
    rows = [row for row in index.get("latestByShort", []) if isinstance(row, dict)]
    rows.sort(key=lambda row: (int(row.get("episode") or 999), str(row.get("shortId") or "")))
    if limit > 0:
        rows = rows[:limit]
    items = [build_item(row, output_dir, write_worksheets) for row in rows]
    statuses = Counter(str(item.get("status") or "unknown") for item in items)
    counts = {
        "items": len(items),
        "readyForAsrOrManualTranscript": statuses.get("ready-for-asr-or-manual-transcript", 0),
        "asrDraftPresentNeedsReview": statuses.get("asr-draft-present-needs-review", 0),
        "transcriptSidecarPresentNeedsReview": statuses.get("transcript-sidecar-present-needs-review", 0),
        "needsAudioSidecar": statuses.get("needs-audio-sidecar", 0),
        "worksheetsExisting": sum(1 for item in items if item.get("worksheet", {}).get("exists")),
        "rawProviderOutputsExisting": sum(1 for item in items if item.get("destinations", {}).get("rawProviderOutput", {}).get("exists")),
        "asrDraftTranscriptsExisting": sum(1 for item in items if item.get("destinations", {}).get("asrDraftTranscript", {}).get("exists")),
        "captionDraftsExisting": sum(1 for item in items if item.get("destinations", {}).get("captionDraftSrt", {}).get("exists") or item.get("destinations", {}).get("captionDraftVtt", {}).get("exists")),
        "asrDraftWordsApprox": sum(int(item.get("asrDraftSummary", {}).get("wordCountApprox") or 0) for item in items),
        "asrDraftSegments": sum(int(item.get("asrDraftSummary", {}).get("segmentCount") or 0) for item in items),
        "transcriptTruthCreated": False,
        "reviewDecisionRecorded": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceIndexJson": str(index_path),
        "outputDir": str(output_dir),
        "counts": counts,
        "items": items,
        "nextSafestAction": "Pick one ready short, create or review transcript sidecars, then rerun transcript readiness before using words for edit decisions.",
        "truth": "Transcript intake workbench only. It may create review worksheets, but it does not run ASR, create transcript truth, record approval, mutate media, publish, upload, schedule, delete, overwrite exports, or create receipts.",
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript intake workbench",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Source index: `{board.get('sourceIndexJson')}`",
        "",
        "## Counts",
        "",
    ]
    for key, value in (board.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Shorts", ""])
    for item in board.get("items", []):
        if not isinstance(item, dict):
            continue
        summary = item.get("asrDraftSummary") if isinstance(item.get("asrDraftSummary"), dict) else {}
        lines.extend(
            [
                f"### {item.get('shortId')} · Episode {item.get('episode')}",
                "",
                f"- Title: {item.get('title') or ''}",
                f"- Status: `{item.get('status')}`",
                f"- Audio: `{item.get('audioSidecar', {}).get('path')}`",
                f"- Worksheet: `{item.get('worksheet', {}).get('path')}`",
                f"- Normalized transcript: `{item.get('destinations', {}).get('normalizedTranscript', {}).get('path')}`",
                f"- ASR draft words/segments: `{summary.get('wordCountApprox') or 0}` / `{summary.get('segmentCount') or 0}`",
                f"- ASR draft sample: {summary.get('sample') or ''}",
                f"- Next: {item.get('nextSafestAction')}",
                "",
            ]
        )
    lines.extend(["## Truth boundary", "", str(board.get("truth") or "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    counts = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in (board.get("counts") or {}).items()
    )
    cards = []
    for item in board.get("items", []):
        if not isinstance(item, dict):
            continue
        audio = item.get("audioSidecar", {}) if isinstance(item.get("audioSidecar"), dict) else {}
        worksheet = item.get("worksheet", {}) if isinstance(item.get("worksheet"), dict) else {}
        destinations = item.get("destinations", {}) if isinstance(item.get("destinations"), dict) else {}
        normalized = destinations.get("normalizedTranscript", {}) if isinstance(destinations.get("normalizedTranscript"), dict) else {}
        summary = item.get("asrDraftSummary", {}) if isinstance(item.get("asrDraftSummary"), dict) else {}
        audio_control = (
            f"<audio controls preload=\"metadata\" src=\"{esc(audio.get('fileUri'))}\"></audio>"
            if audio.get("fileUri")
            else "<div class=\"missing\">No audio sidecar yet</div>"
        )
        draft_summary = (
            f"""
            <div class="draft">
              <strong>ASR draft</strong>
              <span>{esc(summary.get('wordCountApprox') or 0)} words · {esc(summary.get('segmentCount') or 0)} segments · {esc(summary.get('model') or '')}</span>
              <p>{esc(summary.get('sample') or '')}</p>
            </div>
            """
            if summary.get("exists")
            else "<div class=\"draft missing\">No ASR draft yet</div>"
        )
        cards.append(
            f"""
            <article class="card">
              <div class="card-head">
                <div>
                  <p class="eyebrow">Episode {esc(item.get('episode'))}</p>
                  <h2>{esc(item.get('shortId'))}</h2>
                  <p>{esc(item.get('title') or '')}</p>
                </div>
                <span class="status">{esc(item.get('status'))}</span>
              </div>
              {audio_control}
              {draft_summary}
              <dl>
                <dt>Worksheet</dt><dd><code>{esc(worksheet.get('path'))}</code></dd>
                <dt>Normalized transcript</dt><dd><code>{esc(normalized.get('path'))}</code></dd>
                <dt>Next</dt><dd>{esc(item.get('nextSafestAction'))}</dd>
              </dl>
            </article>
            """
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Transcript Intake Workbench</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15100b; --moss:#15251b; --fern:#24452d; --honey:#f2cc55; --cream:#fff1d5; --leaf:#84e093; --clay:#d87962; --line:rgba(255,241,213,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 8% 0%,rgba(132,224,147,.2),transparent 28%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1480px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.card,.truth {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,241,213,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header,.truth {{ padding:28px; margin-bottom:16px; }}
    .eyebrow {{ margin:0 0 7px; color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.72rem; font-weight:950; }}
    h1 {{ margin:0 0 10px; font-size:clamp(2.5rem,6vw,5.5rem); line-height:.9; }}
    h2 {{ margin:0; }}
    p,dd,dt {{ color:#deceb0; line-height:1.45; }}
    code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.08em; font-size:.7rem; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; }}
    .card {{ padding:18px; }}
    .card-head {{ display:flex; justify-content:space-between; gap:14px; align-items:flex-start; }}
    .status {{ border:1px solid rgba(242,204,85,.32); border-radius:999px; color:var(--honey); padding:7px 10px; background:rgba(242,204,85,.12); font-size:.72rem; font-weight:950; white-space:nowrap; }}
    audio {{ width:100%; margin:12px 0; }}
    dl {{ display:grid; grid-template-columns:140px minmax(0,1fr); gap:8px 12px; margin:10px 0 0; }}
    dt {{ color:var(--leaf); font-weight:950; }}
    dd {{ margin:0; }}
    .missing {{ border:1px solid rgba(216,121,98,.35); border-radius:16px; padding:14px; color:#ffb3a2; background:rgba(216,121,98,.1); }}
    .draft {{ border:1px solid rgba(132,224,147,.24); border-radius:18px; padding:13px; margin:10px 0 14px; background:rgba(132,224,147,.08); }}
    .draft strong,.draft span {{ display:block; }}
    .draft span {{ color:#cdbf9e; font-size:.82rem; margin-top:3px; }}
    .draft p {{ margin:9px 0 0; color:#f3e3c0; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · transcript intake</p>
    <h1>Words start here. Truth comes after review.</h1>
    <p>Use this workbench to listen, transcribe, and route sidecars without confusing intake artifacts for canonical transcript truth.</p>
    <div class="metrics">{counts}</div>
  </header>
  <section class="truth"><strong>Truth boundary:</strong> {esc(board.get('truth'))}</section>
  <section class="grid">{''.join(cards)}</section>
</main>
</body>
</html>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    board["artifactPaths"] = {
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
    }
    json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    return board["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Studio shorts transcript-intake workbench.")
    parser.add_argument("--index", default=str(DEFAULT_INDEX_JSON), help="Transcript intake index JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-transcript-intake-workbench")
    parser.add_argument("--limit", type=int, default=0, help="Limit items. 0 means all.")
    parser.add_argument("--no-worksheets", action="store_true", help="Do not create missing worksheet markdown files.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    board = build_workbench(
        index_path=Path(args.index).expanduser(),
        output_dir=output_dir,
        limit=args.limit,
        write_worksheets=not args.no_worksheets,
    )
    paths = write_outputs(board, output_dir, args.basename)
    if args.format == "json":
        print(json.dumps(board, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(board), end="")
    elif args.format == "all":
        print(json.dumps({"ok": True, "artifactPaths": paths, "truth": board["truth"]}, indent=2, sort_keys=True))
    else:
        print(render_markdown(board), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
