#!/usr/bin/env python3
"""Build a read-only transcript/caption readiness board for recommended shorts.

This board connects the shorts review ladder to word evidence. It does not run
ASR, import transcripts, create captions, approve copy, or mutate media. It only
answers: which recommended shorts have nearby transcript/caption evidence, which
need transcript work, and what is the safest next action?
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
DEFAULT_THEATER_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "recommended-review-theater"
    / "quipsly-studio-recommended-shorts-review-theater.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "transcript-readiness"
SCHEMA = "quipsly.studio.shorts-transcript-readiness.v1"
VERSION = "2026-07-02.v1"
TRANSCRIPT_NAME_TOKENS = ("transcript", "caption", "captions", "subtitles", "sub-title", "words", "word-timing")
TRANSCRIPT_EXTENSIONS = {".srt", ".vtt", ".ass", ".ssa", ".sbv", ".txt", ".md", ".json"}
CAPTION_TIMING_MARKERS = ("-->",)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Recommended shorts theater JSON not found: {path}\nRun: script/agentctl.sh studio-recommended-shorts-review-theater")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def safe_text_sample(path: Path, limit: int = 280) -> str:
    if path.suffix.lower() not in {".srt", ".vtt", ".txt", ".md", ".json", ".sbv", ".ass", ".ssa"}:
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""
    squashed = " ".join(text.replace("\ufeff", "").split())
    return squashed[:limit]


def transcript_text_report(path: Path) -> dict[str, Any]:
    if path.suffix.lower() not in {".srt", ".vtt", ".txt", ".md", ".json", ".sbv", ".ass", ".ssa"}:
        return {
            "hasReadableWords": False,
            "hasTranscriptWords": False,
            "looksLikeReviewPlaceholder": False,
            "readableWordCount": 0,
            "readableCharacterCount": 0,
            "evidenceStatus": "unsupported-text-inspection",
        }
    try:
        raw = path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return {
            "hasReadableWords": False,
            "hasTranscriptWords": False,
            "looksLikeReviewPlaceholder": False,
            "readableWordCount": 0,
            "readableCharacterCount": 0,
            "evidenceStatus": "unreadable-file",
        }
    lines: list[str] = []
    for line in raw.replace("\ufeff", "").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.upper()
        if upper == "WEBVTT":
            continue
        if stripped.isdigit():
            continue
        if any(marker in stripped for marker in CAPTION_TIMING_MARKERS):
            continue
        if stripped.startswith(("NOTE", "STYLE", "REGION")):
            continue
        lines.append(stripped)
    text = " ".join(lines).strip()
    words = [word for word in text.replace("_", " ").split() if any(char.isalpha() for char in word)]
    placeholder = looks_like_review_placeholder(text, len(words))
    return {
        "hasReadableWords": bool(words),
        "hasTranscriptWords": bool(words) and not placeholder,
        "looksLikeReviewPlaceholder": placeholder,
        "readableWordCount": len(words),
        "readableCharacterCount": len(text),
        "evidenceStatus": (
            "review-placeholder-copy"
            if placeholder
            else ("readable-spoken-words-found" if words else "no-readable-words")
        ),
    }


def looks_like_review_placeholder(text: str, word_count: int) -> bool:
    lower = text.lower()
    placeholder_phrases = (
        "scouting clip",
        "candidate insight",
        "candidate homer",
        "candidate for conversation",
        "mid-episode candidate",
        "late episode candidate",
        "verify the spoken hook",
        "tighten before publishing",
    )
    if any(phrase in lower for phrase in placeholder_phrases):
        return True
    if word_count <= 16 and "candidate" in lower:
        return True
    if word_count <= 16 and "verify" in lower and "publishing" in lower:
        return True
    return False


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def is_transcript_candidate(path: Path) -> bool:
    if not path.is_file():
        return False
    suffix = path.suffix.lower()
    name = path.name.lower()
    if suffix in {".srt", ".vtt", ".ass", ".ssa", ".sbv"}:
        return True
    if suffix not in TRANSCRIPT_EXTENSIONS:
        return False
    return any(token in name for token in TRANSCRIPT_NAME_TOKENS)


def candidate_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    name = path.name.lower()
    if "normalized-transcript" in name:
        return "normalized-transcript-edit-review"
    if "asr-draft" in name or "raw-asr-output" in name:
        return "machine-asr-draft"
    if suffix in {".srt", ".vtt", ".ass", ".ssa", ".sbv"} and "caption-draft" in name:
        return "machine-caption-draft-file"
    if suffix in {".srt", ".vtt", ".ass", ".ssa", ".sbv"}:
        return "timed-caption-file"
    if suffix == ".json" and any(token in name for token in ("word", "transcript", "caption")):
        return "structured-transcript-candidate"
    if "caption" in name:
        return "caption-copy-candidate"
    if "transcript" in name:
        return "transcript-text-candidate"
    return "text-evidence-candidate"


def evidence_strength(kind: str, has_transcript_words: bool = True) -> int:
    if not has_transcript_words:
        return 0
    if kind == "normalized-transcript-edit-review":
        return 5
    if kind == "machine-caption-draft-file":
        return 4
    if kind == "timed-caption-file":
        return 4
    if kind == "machine-asr-draft":
        return 3
    if kind == "structured-transcript-candidate":
        return 3
    if kind == "transcript-text-candidate":
        return 2
    if kind == "caption-copy-candidate":
        return 2
    return 1


def search_roots_for(root: Path, item: dict[str, Any]) -> list[Path]:
    roots: list[Path] = []
    episode = item.get("episode")
    version = str(item.get("version") or "")
    if episode is not None:
        try:
            episode_number = int(episode)
            episode_root = root / f"Episode_{episode_number:02d}"
            if version:
                roots.append(episode_root / version)
            roots.append(episode_root)
        except (TypeError, ValueError):
            pass
    media_path = Path(str(item.get("path") or ""))
    if media_path.parent.exists():
        roots.append(media_path.parent)
    packet_root = root / "shorts-command-room" / "recommended-review-packets" / str(item.get("shortId") or "")
    roots.append(packet_root)
    transcript_workorder_root = root / "shorts-command-room" / "transcript-workorders" / str(item.get("shortId") or "")
    roots.append(transcript_workorder_root)
    seen: set[str] = set()
    unique_roots: list[Path] = []
    for candidate in roots:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        unique_roots.append(candidate)
    return unique_roots


def find_candidates(root: Path, item: dict[str, Any], max_candidates: int) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    seen: set[str] = set()
    media_path = Path(str(item.get("path") or ""))
    for search_root in search_roots_for(root, item):
        if not search_root.exists():
            continue
        for path in sorted(search_root.rglob("*")):
            if not is_transcript_candidate(path):
                continue
            if path == media_path:
                continue
            key = str(path.resolve())
            if key in seen:
                continue
            seen.add(key)
            kind = candidate_kind(path)
            text_report = transcript_text_report(path)
            matches.append(
                {
                    "path": str(path),
                    "fileUri": file_uri(path),
                    "openCommand": f"open {shell_quote(str(path))}",
                    "kind": kind,
                    "bytes": path.stat().st_size,
                    "strength": evidence_strength(kind, bool(text_report["hasTranscriptWords"])),
                    "hasReadableWords": text_report["hasReadableWords"],
                    "hasTranscriptWords": text_report["hasTranscriptWords"],
                    "looksLikeReviewPlaceholder": text_report["looksLikeReviewPlaceholder"],
                    "readableWordCount": text_report["readableWordCount"],
                    "readableCharacterCount": text_report["readableCharacterCount"],
                    "evidenceStatus": text_report["evidenceStatus"],
                    "needsHumanReview": kind in {"machine-asr-draft", "machine-caption-draft-file"} or "draft" in path.name.lower(),
                    "sample": safe_text_sample(path),
                    "truth": "Transcript/caption candidate only. This is evidence, not canonical transcript truth.",
                }
            )
    matches.sort(key=lambda row: (-int(row.get("strength") or 0), str(row.get("path") or "")))
    return matches[:max_candidates]


def readiness_for(candidates: list[dict[str, Any]]) -> tuple[str, str]:
    if not candidates:
        return "missing-word-evidence", "No transcript/caption files were found nearby. Review by watching/listening, then generate or link transcript evidence before caption-aware decisions."
    useful = [candidate for candidate in candidates if candidate.get("hasTranscriptWords")]
    if not useful:
        return "placeholder-word-evidence", "Caption/transcript-shaped files were found, but none contain readable words. Treat this like missing word evidence until real transcript/caption text is generated or linked."
    if any(candidate.get("kind") == "normalized-transcript-edit-review" for candidate in useful):
        return "normalized-transcript-edit-review", "Normalized transcript sidecar exists for edit review. It can support semantic/caption-aware workflow, but final caption publication still needs explicit review."
    if any(candidate.get("needsHumanReview") for candidate in useful):
        return "machine-draft-word-evidence", "Machine transcript/caption draft evidence exists. Review against the audio before using it for caption-aware cuts, captions, or semantic claims."
    strongest = max(int(candidate.get("strength") or 0) for candidate in useful)
    if strongest >= 4:
        return "timed-captions-available", "Timed caption evidence exists. Use it for caption placement and rough word-aware review, but still verify by listening."
    if strongest >= 3:
        return "structured-transcript-candidate", "Structured transcript evidence exists. Check timing/speaker quality before using it for cuts or captions."
    return "text-only-evidence", "Text/caption copy evidence exists, but timing is weak. Useful for copy review, not enough for precise cut timing."


def build_row(root: Path, item: dict[str, Any], max_candidates: int) -> dict[str, Any]:
    candidates = find_candidates(root, item, max_candidates=max_candidates)
    status, note = readiness_for(candidates)
    commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
    return {
        "shortId": item.get("shortId"),
        "rank": item.get("rank"),
        "episode": item.get("episode"),
        "version": item.get("version"),
        "title": item.get("title") or item.get("relativePath"),
        "durationLabel": item.get("durationLabel"),
        "durationSeconds": item.get("durationSeconds"),
        "platformFit": item.get("platformFit") or [],
        "mediaPath": item.get("path"),
        "mediaUri": item.get("uri"),
        "reviewDecision": item.get("decision"),
        "status": status,
        "candidateCount": len(candidates),
        "candidates": candidates,
        "note": note,
        "safeCommands": {
            "focusedPacket": f"script/agentctl.sh studio-recommended-short-review-packet --short-id {shell_quote(str(item.get('shortId') or ''))}",
            "evidenceDraft": f"script/agentctl.sh studio-recommended-short-evidence-draft --short-id {shell_quote(str(item.get('shortId') or ''))} --outcome needs-more-evidence --summary 'Transcript/caption evidence needs review.'",
            "dryRunRefine": commands.get("dryRunRefine", ""),
        },
        "nextSafestAction": next_action(status, item),
        "truth": "Short transcript readiness only. It does not run ASR, import transcripts, burn captions, approve copy, mutate media, or publish.",
    }


def next_action(status: str, item: dict[str, Any]) -> str:
    short_id = item.get("shortId") or "this short"
    if status == "timed-captions-available":
        return f"Open the focused packet for {short_id}, verify caption timing by listening, then write hook/caption/framing evidence."
    if status == "structured-transcript-candidate":
        return f"Review structured transcript timing/speaker quality for {short_id} before using it for captions or cuts."
    if status == "machine-draft-word-evidence":
        return f"Review the ASR/caption draft for {short_id} against the audio before promoting words into edit intelligence."
    if status == "normalized-transcript-edit-review":
        return f"Use the normalized transcript sidecar for edit-review context on {short_id}; final captions still need explicit approval before publishing."
    if status == "text-only-evidence":
        return f"Use text evidence for copy/context only; do not make precise timing claims for {short_id} until timed captions or transcript timing exists."
    return f"Create or link transcript/caption evidence for {short_id}; until then, review by watching/listening and mark caption-aware decisions as needs-more-evidence."


def build_board(root: Path, theater_path: Path, output_dir: Path, max_items: int, max_candidates: int) -> dict[str, Any]:
    theater = read_json(theater_path)
    items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    rows = [build_row(root, item, max_candidates=max_candidates) for item in items[:max_items]]
    counts = Counter(row["status"] for row in rows)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "releaseRoot": str(root),
        "sourceTheaterJson": str(theater_path),
        "outputDir": str(output_dir),
        "counts": {
            "items": len(rows),
            "timedCaptionsAvailable": counts.get("timed-captions-available", 0),
            "normalizedTranscriptEditReview": counts.get("normalized-transcript-edit-review", 0),
            "structuredTranscriptCandidates": counts.get("structured-transcript-candidate", 0),
            "machineDraftWordEvidence": counts.get("machine-draft-word-evidence", 0),
            "textOnlyEvidence": counts.get("text-only-evidence", 0),
            "missingWordEvidence": counts.get("missing-word-evidence", 0),
            "placeholderWordEvidence": counts.get("placeholder-word-evidence", 0),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": rows,
        "nextSafestAction": next_board_action(rows),
        "truth": "Read-only transcript/caption readiness. No ASR is run, no transcript is imported, no captions are burned in, no review decision is recorded, no media is mutated, no external publishing occurs, and no receipt truth is created.",
    }


def next_board_action(rows: list[dict[str, Any]]) -> str:
    missing = [row for row in rows if row.get("status") in {"missing-word-evidence", "placeholder-word-evidence"}]
    if missing:
        first = missing[0]
        return f"Start with {first.get('shortId')}: it is recommended but has no nearby word/caption evidence. Review by watching/listening and create or link transcript evidence before caption-aware decisions."
    weak = [row for row in rows if row.get("status") in {"text-only-evidence", "structured-transcript-candidate", "machine-draft-word-evidence", "normalized-transcript-edit-review"}]
    if weak:
        first = weak[0]
        return f"Start with {first.get('shortId')}: transcript evidence exists but needs timing/speaker review before cut or caption decisions."
    if rows:
        return f"Start with {rows[0].get('shortId')}: timed captions are available, so verify by listening and write caption/framing evidence."
    return "Refresh the recommended shorts theater before transcript readiness can be assessed."


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript and caption readiness",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Release root: `{board.get('releaseRoot')}`",
        "",
        board.get("truth", ""),
        "",
        f"Next safest action: {board.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in board.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Recommended shorts", ""])
    for row in board.get("items", []):
        lines.extend([
            f"### {row.get('shortId')} - {row.get('title')}",
            "",
            f"- Episode/version: `Episode {row.get('episode')}` / `{row.get('version')}`",
            f"- Duration: `{row.get('durationLabel')}`",
            f"- Transcript status: `{row.get('status')}`",
            f"- Candidate count: `{row.get('candidateCount')}`",
            f"- Note: {row.get('note')}",
            f"- Next: {row.get('nextSafestAction')}",
        ])
        for command_label, command in row.get("safeCommands", {}).items():
            if command:
                lines.append(f"- {command_label}: `{command}`")
        for candidate in row.get("candidates", [])[:5]:
            lines.append(f"- Candidate `{candidate.get('kind')}`: `{candidate.get('path')}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in board.get("counts", {}).items()
        if key in {"items", "timedCaptionsAvailable", "normalizedTranscriptEditReview", "structuredTranscriptCandidates", "machineDraftWordEvidence", "textOnlyEvidence", "missingWordEvidence", "placeholderWordEvidence"}
    )
    cards = "\n".join(render_card(row) for row in board.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Quipsly Studio shorts transcript readiness</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120d; --moss:#182a20; --grove:#223b29; --cream:#fff0d0; --honey:#f2c94c; --leaf:#8ee39a; --water:#82dce5; --clay:#d97357; --line:rgba(255,240,208,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 16% -8%,rgba(142,227,154,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); color:var(--cream); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,208,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:30px; margin-bottom:16px; }} .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.2rem,6vw,5rem); line-height:.92; }} h2 {{ margin:0 0 8px; }} p,li {{ color:#e0d1b3; line-height:1.55; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }} .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }} .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }} .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .truth {{ padding:18px; margin-bottom:16px; border-color:rgba(242,201,76,.34); }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:16px; }} .card {{ padding:18px; }}
    .timed-captions-available {{ border-color:rgba(142,227,154,.44); }} .structured-transcript-candidate,.text-only-evidence {{ border-color:rgba(242,201,76,.4); }} .missing-word-evidence {{ border-color:rgba(217,115,87,.48); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0; }} .pill,a,button {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; font-size:.82rem; }} a:hover,button:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }} button {{ cursor:pointer; }}
    .candidate {{ border-left:3px solid var(--water); padding:8px 0 8px 12px; margin:8px 0; background:rgba(130,220,229,.06); border-radius:0 14px 14px 0; }} .sample {{ color:#cfbea0; font-size:.9rem; }}
    .command {{ display:flex; gap:8px; align-items:center; margin-top:8px; }} .command code {{ flex:1; display:block; padding:10px; border-radius:14px; background:rgba(0,0,0,.34); border:1px solid var(--line); }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(24,42,32,.96); border:1px solid rgba(142,227,154,.42); color:var(--leaf); opacity:0; transform:translateY(8px); transition:.2s; }} .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header><p class=\"eyebrow\">Quipsly Studio · word evidence</p><h1>Captions are not magic stickers.</h1><p>This board shows which recommended shorts have transcript/caption evidence before we trust captions, hooks, or word-aware cuts.</p><div class=\"metrics\">{metrics}</div></header>
  <section class=\"truth\"><p><strong>Truth boundary:</strong> {esc(board.get('truth'))}</p><p><strong>Next:</strong> {esc(board.get('nextSafestAction'))}</p></section>
  <section class=\"grid\">{cards}</section>
</main>
<div class=\"toast\" id=\"toast\">Copied</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    const value = button.getAttribute('data-copy') || '';
    try {{ await navigator.clipboard.writeText(value); toast.textContent='Copied command'; }} catch (error) {{ toast.textContent='Copy failed'; }}
    toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1400);
  }});
}});
</script>
</body>
</html>
"""


def render_card(row: dict[str, Any]) -> str:
    platform_fit = row.get("platformFit") or []
    if isinstance(platform_fit, list):
        platform_text = ", ".join(str(item) for item in platform_fit)
    else:
        platform_text = str(platform_fit)
    pills = "".join(
        f"<span class=\"pill\">{esc(label)}: {esc(value)}</span>"
        for label, value in [
            ("Episode", row.get("episode")),
            ("Duration", row.get("durationLabel")),
            ("Status", row.get("status")),
            ("Candidates", row.get("candidateCount")),
        ]
        if value is not None and value != ""
    )
    commands = "".join(
        f"<div class=\"command\"><code>{esc(command)}</code><button data-copy=\"{esc(command)}\">Copy</button></div>"
        for command in row.get("safeCommands", {}).values()
        if command
    )
    candidates = "".join(render_candidate(candidate) for candidate in row.get("candidates", [])[:5])
    status_class = esc(row.get("status"))
    return f"""
<article class=\"card {status_class}\">
  <p class=\"eyebrow\">{esc(row.get('shortId'))}</p>
  <h2>{esc(row.get('title'))}</h2>
  <div class=\"pills\">{pills}</div>
  <p><strong>Platform fit:</strong> {esc(platform_text)}</p>
  <p>{esc(row.get('note'))}</p>
  <p><strong>Next:</strong> {esc(row.get('nextSafestAction'))}</p>
  {candidates if candidates else '<p>No transcript/caption candidates found nearby.</p>'}
  {commands}
</article>
"""


def render_candidate(candidate: dict[str, Any]) -> str:
    link = f"<a href=\"{esc(candidate.get('fileUri'))}\">Open</a>" if candidate.get("fileUri") else ""
    return f"""
<div class=\"candidate\">
  <strong>{esc(candidate.get('kind'))}</strong> {link}<br>
  <code>{esc(candidate.get('path'))}</code>
  <div class=\"sample\">{esc(candidate.get('sample'))}</div>
</div>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    board["artifactPaths"] = {
        "folder": str(output_dir),
        "json": str(json_path),
        "markdown": str(md_path),
        "html": str(html_path),
    }
    json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    return board["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a read-only shorts transcript/caption readiness board.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export/review root.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended shorts theater JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-transcript-readiness")
    parser.add_argument("--max-items", type=int, default=24, help="Maximum recommended shorts to inspect.")
    parser.add_argument("--max-candidates", type=int, default=8, help="Maximum transcript/caption candidates per short.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    output_dir = Path(args.output_dir).expanduser()
    board = build_board(
        root=root,
        theater_path=Path(args.theater).expanduser(),
        output_dir=output_dir,
        max_items=max(1, args.max_items),
        max_candidates=max(0, args.max_candidates),
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
