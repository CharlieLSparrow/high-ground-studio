#!/usr/bin/env python3
"""Build an Episode 4 watched/source clip cue review packet.

This packet turns missing source-clip cues into reviewable moments. It can also
extract timestamped audio snippets from the transcript source audio so humans or
agents can quickly identify which watched/source clip belongs in each cue.

Safety boundary: reads transcript metadata and source audio, writes timestamped
sidecar review artifacts only. It never mutates source files, imports clips,
writes timeline decisions, creates shorts, renders final exports, publishes,
deletes, moves, renames, or overwrites existing outputs.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
CUE_POINTER = RELEASE_ROOT / "review-board/episode4-transcript-cues/latest-episode4-transcript-cues.json"
INTAKE_POINTER = RELEASE_ROOT / "review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-source-clip-cue-review"
LATEST_POINTER = OUT_ROOT / "latest-episode4-source-clip-cue-review.json"
SCHEMA = "quipsly.episode4-source-clip-cue-review.v1"
PRIMARY_DROP_ROOT = RELEASE_ROOT / "Episode_04_Watched_Source_Clip_Dropbox"
NEEDS_HUMAN_FOLDER = PRIMARY_DROP_ROOT / "needs-human-identification"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-source-clip-cue-review")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def fmt_time(seconds: Any) -> str:
    try:
        value = max(0.0, float(seconds or 0.0))
    except Exception:
        value = 0.0
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = pointer.get("jsonPath")
    if isinstance(target, str) and target:
        target_payload = load_json(Path(target))
        if target_payload:
            return {**pointer, **target_payload}
    return pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def truth() -> dict[str, Any]:
    return {
        "sidecarReviewArtifactsOnly": True,
        "sourceFilesReadOnly": True,
        "sourceFilesMutated": False,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "finalExportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def source_for_hit(hit: dict[str, Any]) -> dict[str, Any]:
    transcript_path = hit.get("transcriptPath")
    if not isinstance(transcript_path, str) or not transcript_path:
        return {}
    transcript = load_json(Path(transcript_path))
    source = transcript.get("source")
    return source if isinstance(source, dict) else {}


def review_context_for(cue: dict[str, Any]) -> list[dict[str, Any]]:
    contexts: list[dict[str, Any]] = []
    for hit in dict_list(cue.get("hits"))[:5]:
        source = source_for_hit(hit)
        contexts.append(
            {
                "timeLabel": hit.get("timeLabel") or fmt_time(hit.get("startSeconds")),
                "startSeconds": hit.get("startSeconds"),
                "endSeconds": hit.get("endSeconds"),
                "reviewStartSeconds": hit.get("reviewStartSeconds"),
                "reviewEndSeconds": hit.get("reviewEndSeconds"),
                "text": hit.get("text") or "",
                "segmentId": hit.get("segmentId") or "",
                "chunkId": hit.get("chunkId") or source.get("chunkId") or "",
                "transcriptPath": hit.get("transcriptPath") or "",
                "chunkSourcePath": source.get("sourcePath") or "",
                "originalSourcePath": source.get("originalSourcePath") or "",
                "originalSourceKind": source.get("originalSourceKind") or "",
            }
        )
    return contexts


def preferred_source_path(contexts: list[dict[str, Any]]) -> str:
    for context in contexts:
        path = context.get("originalSourcePath")
        if isinstance(path, str) and path and Path(path).exists():
            return path
    for context in contexts:
        path = context.get("chunkSourcePath")
        if isinstance(path, str) and path and Path(path).exists():
            return path
    return ""


def extract_audio(source_path: str, start_seconds: float, end_seconds: float, output_path: Path) -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return {"ok": False, "error": "ffmpeg not found", "path": ""}
    if not source_path or not Path(source_path).exists():
        return {"ok": False, "error": "source audio not found", "path": ""}
    duration = max(0.5, end_seconds - start_seconds)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        f"{max(0.0, start_seconds):.3f}",
        "-t",
        f"{duration:.3f}",
        "-i",
        source_path,
        "-vn",
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        str(output_path),
    ]
    result = subprocess.run(command, check=False, text=True, capture_output=True, timeout=120)
    if result.returncode != 0:
        return {"ok": False, "error": (result.stderr or result.stdout or "ffmpeg failed").strip()[:1000], "path": ""}
    return {"ok": True, "error": "", "path": str(output_path), "durationSeconds": duration}


def clip_search_hints(contexts: list[dict[str, Any]]) -> list[str]:
    text = " ".join(str(context.get("text") or "") for context in contexts)
    words = re.findall(r"[A-Za-z][A-Za-z'-]{2,}", text.lower())
    stopwords = {
        "after", "and", "are", "audio", "because", "before", "came", "clip", "crap", "doing", "don't", "ended",
        "finishing", "from", "got", "had", "have", "he's", "here", "him",
        "into", "itself", "i've", "just", "keep", "kind", "let", "let's", "like", "long", "okay", "perfect", "playing", "recording", "show",
        "some", "sound", "speak", "started", "take", "that", "that's", "the", "there", "think", "this", "true",
        "then", "stop", "video", "watch", "we'll", "were", "with", "work", "yeah", "you",
    }
    counts: dict[str, int] = {}
    for word in words:
        if word in stopwords or len(word) < 4:
            continue
        counts[word] = counts.get(word, 0) + 1
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return [word for word, _count in ranked[:10]]


def review_prompt_for(item: dict[str, Any]) -> str:
    cue_id = str(item.get("cueId") or "this cue")
    label = str(item.get("reviewWindowLabel") or "the cue window")
    hints = item.get("searchHints") or []
    hint_text = ", ".join(str(hint) for hint in hints[:5]) if hints else "listen for the exact clip title/topic"
    return (
        f"Review {cue_id} at {label}. Identify the watched/source media being introduced, using these transcript hints: "
        f"{hint_text}. If found, copy the matching file into {NEEDS_HUMAN_FOLDER} with the cue ID in the filename."
    )


def build_review_items(cues: dict[str, Any], intake: dict[str, Any], session_dir: Path, extract: bool, limit: int) -> list[dict[str, Any]]:
    intake_checklist = dict_list(intake.get("cueRecoveryChecklist"))
    intake_by_id = {str(item.get("cueId")): item for item in intake_checklist if item.get("cueId")}
    items: list[dict[str, Any]] = []
    audio_dir = session_dir / "audio-review-windows"
    for cue in dict_list(cues.get("cueGroups")):
        cue_id = str(cue.get("cueId") or "")
        if not cue_id:
            continue
        intake_item = intake_by_id.get(cue_id, {})
        if intake_item and intake_item.get("status") != "missing-source-file":
            continue
        contexts = review_context_for(cue)
        start = as_float(cue.get("reviewStartSeconds"), as_float(cue.get("startSeconds"), 0.0))
        end = as_float(cue.get("reviewEndSeconds"), as_float(cue.get("endSeconds"), start + 45.0))
        source_path = preferred_source_path(contexts)
        audio: dict[str, Any] = {"ok": False, "error": "not requested", "path": ""}
        if extract:
            audio = extract_audio(
                source_path,
                start,
                end,
                audio_dir / f"{cue_id}-{fmt_time(start).replace(':', '-')}-{fmt_time(end).replace(':', '-')}.m4a",
            )
        suggested_filename = intake_item.get("suggestedFilename") or f"{cue_id}-short-description.mp4"
        review_window_label = cue.get("reviewWindowLabel") or intake_item.get("reviewWindowLabel") or f"{fmt_time(start)} -> {fmt_time(end)}"
        hints = clip_search_hints(contexts)
        human_action = (
            f"Review Episode 4 around {review_window_label}. If this is a watched/source clip moment, copy the matching "
            f"media into {NEEDS_HUMAN_FOLDER} as {suggested_filename} or another cue-friendly filename."
        )
        drop_instruction = f"Drop likely source media as {suggested_filename} into {NEEDS_HUMAN_FOLDER}."
        items.append(
            {
                "cueId": cue_id,
                "status": "missing-source-file",
                "confidence": cue.get("confidence") or intake_item.get("confidence") or "unknown",
                "cueType": cue.get("cueType") or intake_item.get("cueType") or "",
                "score": cue.get("score") or intake_item.get("score") or 0,
                "hitCount": cue.get("hitCount") or intake_item.get("hitCount") or len(contexts),
                "reviewStartSeconds": start,
                "reviewEndSeconds": end,
                "reviewWindowLabel": review_window_label,
                "suggestedFilename": suggested_filename,
                "humanAction": human_action,
                "searchHints": hints,
                "sourceAudioPath": source_path,
                "audioReviewClip": audio,
                "contexts": contexts,
                "dropInstruction": drop_instruction,
            }
        )
        items[-1]["reviewPrompt"] = review_prompt_for(items[-1])
        if len(items) >= limit:
            break
    return items


def render_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 watched/source clip cue review packet",
        "",
        f"Generated: `{manifest.get('generatedAt')}`",
        f"Status: `{manifest.get('status')}`",
        f"Review items: `{len(manifest.get('reviewItems') or [])}`",
        f"Drop folder: `{manifest.get('needsHumanIdentificationFolder')}`",
        "",
        "## Purpose",
        "",
        "Listen/read these cue windows to identify the watched/source clips that need to be dropped into Episode 4 intake.",
        "This packet is review-only. It does not import clips or write timeline metadata.",
        "",
    ]
    for index, item in enumerate(manifest.get("reviewItems") or [], 1):
        audio = item.get("audioReviewClip") or {}
        lines += [
            f"## {index}. {item.get('cueId')} - {item.get('reviewWindowLabel')}",
            "",
            f"- Confidence: `{item.get('confidence')}`",
            f"- Cue type: `{item.get('cueType')}`",
            f"- Suggested filename: `{item.get('suggestedFilename')}`",
            f"- Search hints: `{', '.join(item.get('searchHints') or []) or 'listen for exact title/topic'}`",
            f"- Source audio: `{item.get('sourceAudioPath') or 'not found'}`",
            f"- Audio review clip: `{audio.get('path') if audio.get('ok') else audio.get('error')}`",
            f"- Drop instruction: {item.get('dropInstruction')}",
            f"- Review prompt: {item.get('reviewPrompt')}",
            "",
            "Evidence/context:",
        ]
        for context in (item.get("contexts") or [])[:5]:
            lines.append(f"- `{context.get('timeLabel')}` {context.get('text')}")
        lines.append("")
    lines += [
        "## After identifying a clip",
        "",
        "```bash",
        "./script/agentctl.sh episode4-source-clip-intake",
        "./script/agentctl.sh episode4-apply-preview",
        "./script/agentctl.sh episode4-cut-intelligence-state --save-markdown",
        "```",
        "",
    ]
    return "\n".join(lines)


def render_html(manifest: dict[str, Any]) -> str:
    cards = []
    for index, item in enumerate(manifest.get("reviewItems") or [], 1):
        audio = item.get("audioReviewClip") or {}
        audio_html = ""
        if audio.get("ok") and audio.get("path"):
            audio_html = f"<audio controls src=\"file://{esc(audio.get('path'))}\"></audio>"
        else:
            audio_html = f"<p class=\"warning\">Audio clip: {esc(audio.get('error') or 'not extracted')}</p>"
        contexts = "".join(
            f"<li><code>{esc(context.get('timeLabel'))}</code> {esc(context.get('text'))}</li>"
            for context in (item.get("contexts") or [])[:5]
        )
        cards.append(
            f"""
            <article>
              <p class="eyebrow">Cue {index:02d} · {esc(item.get('confidence'))}</p>
              <h2>{esc(item.get('cueId'))} · {esc(item.get('reviewWindowLabel'))}</h2>
              {audio_html}
              <p><strong>Suggested filename:</strong> <code>{esc(item.get('suggestedFilename'))}</code></p>
              <p><strong>Search hints:</strong> {esc(', '.join(item.get('searchHints') or []) or 'listen for exact title/topic')}</p>
              <p><strong>Source audio:</strong> <code>{esc(item.get('sourceAudioPath') or 'not found')}</code></p>
              <p>{esc(item.get('dropInstruction'))}</p>
              <p><strong>Prompt:</strong> {esc(item.get('reviewPrompt'))}</p>
              <ul>{contexts}</ul>
            </article>
            """
        )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Episode 4 Cue Review Packet</title>
  <style>
    body {{ margin: 0; background: #151b16; color: #f6efd9; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width: 1100px; margin: 0 auto; padding: 42px 24px 80px; }}
    .hero, article {{ border: 1px solid rgba(235, 198, 91, .25); border-radius: 24px; background: linear-gradient(135deg, rgba(37, 50, 39, .96), rgba(26, 31, 27, .98)); box-shadow: 0 24px 64px rgba(0,0,0,.25); }}
    .hero {{ padding: 30px; }}
    article {{ padding: 24px; margin-top: 18px; }}
    h1 {{ margin: 0; font-family: Georgia, serif; font-size: clamp(36px, 6vw, 64px); }}
    h2 {{ margin: 5px 0 14px; }}
    p, li {{ color: #d8ceb0; line-height: 1.55; }}
    code {{ color: #ffe58a; overflow-wrap: anywhere; }}
    audio {{ width: 100%; margin: 10px 0 16px; }}
    .eyebrow {{ color: #f4c85d; text-transform: uppercase; letter-spacing: .16em; font-weight: 900; font-size: 12px; }}
    .warning {{ color: #ff9a84; font-weight: 800; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Episode 4</p>
    <h1>Watched/source clip cue review</h1>
    <p>Review the moments where the transcript says a clip was watched. Identify the matching media, drop it into intake, then rebuild apply preview.</p>
  </section>
  {''.join(cards)}
</main>
</body>
</html>
"""


def build_manifest(args: argparse.Namespace) -> dict[str, Any]:
    cues = load_pointer(Path(args.cue_pointer))
    intake = load_pointer(Path(args.intake_pointer))
    session_dir = Path(args.out_root) / stamp()
    NEEDS_HUMAN_FOLDER.mkdir(parents=True, exist_ok=True)
    items = build_review_items(cues, intake, session_dir, args.extract_audio, args.limit)
    manifest = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-source-clip-cue-review-ready" if items else "episode4-source-clip-cue-review-empty",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "dropRoot": str(PRIMARY_DROP_ROOT),
        "needsHumanIdentificationFolder": str(NEEDS_HUMAN_FOLDER),
        "cuePointer": str(args.cue_pointer),
        "intakePointer": str(args.intake_pointer),
        "extractAudio": bool(args.extract_audio),
        "reviewItems": items,
        "truth": truth(),
    }
    json_path = session_dir / "episode4-source-clip-cue-review.json"
    markdown_path = session_dir / "episode4-source-clip-cue-review.md"
    html_path = session_dir / "index.html"
    manifest.update({"sessionDir": str(session_dir), "jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, manifest)
    markdown_path.write_text(render_markdown(manifest), encoding="utf-8")
    html_path.write_text(render_html(manifest), encoding="utf-8")
    write_json(Path(args.latest_pointer), {
        "schema": "quipsly.episode4-source-clip-cue-review-pointer.v1",
        "generatedAt": iso_now(),
        "status": manifest.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "dropRoot": str(PRIMARY_DROP_ROOT),
        "needsHumanIdentificationFolder": str(NEEDS_HUMAN_FOLDER),
        "extractAudio": bool(args.extract_audio),
        "reviewItemCount": len(items),
        "truth": manifest.get("truth"),
    })
    return manifest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cue-pointer", default=str(CUE_POINTER))
    parser.add_argument("--intake-pointer", default=str(INTAKE_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--limit", type=int, default=9)
    parser.add_argument("--extract-audio", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    manifest = build_manifest(args)
    if args.json:
        print(json.dumps(manifest, indent=2, sort_keys=True))
        return 0
    if args.markdown:
        print(render_markdown(manifest))
        return 0
    print(f"Episode 4 source clip cue review: {manifest.get('status')}")
    print(f"  Board: {manifest.get('htmlPath')}")
    print(f"  Markdown: {manifest.get('markdownPath')}")
    print(f"  Items: {len(manifest.get('reviewItems') or [])}")
    print(f"  Audio extracted: {manifest.get('extractAudio')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
