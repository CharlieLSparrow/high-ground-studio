#!/usr/bin/env python3
"""Create a focused watch/listen packet for one recommended native short.

The packet is review evidence only. It embeds the selected short, lists media
facts, surfaces transcript/caption availability, and gives structured review
prompts plus dry-run commands. It does not record local intent.
"""
from __future__ import annotations

import argparse
import html
import json
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
DEFAULT_OUTPUT_ROOT = DEFAULT_ROOT / "shorts-command-room" / "recommended-review-packets"
SCHEMA = "quipsly.studio.recommended-short-review-packet.v1"
VERSION = "2026-07-02.v1"
TRANSCRIPT_PATTERNS = ("*transcript*", "*caption*", "*.srt", "*.vtt")
CAPTION_TIMING_MARKERS = ("-->",)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Recommended shorts theater JSON not found: {path}\nRun: script/agentctl.sh studio-recommended-shorts-review-theater")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def select_item(items: list[dict[str, Any]], short_id: str, rank: int | None) -> dict[str, Any]:
    if short_id:
        selected = next((item for item in items if str(item.get("shortId")) == short_id), None)
        if selected:
            return selected
        raise SystemExit(f"Short id not found in recommended theater: {short_id}")
    if rank is not None:
        selected = next((item for item in items if int(item.get("rank") or -1) == rank), None)
        if selected:
            return selected
        raise SystemExit(f"Rank not found in recommended theater: {rank}")
    pending = next((item for item in items if item.get("decision") == "pending"), None)
    if pending:
        return pending
    if items:
        return items[0]
    raise SystemExit("Recommended shorts theater has no review items.")


def transcript_candidates(root: Path, item: dict[str, Any]) -> dict[str, Any]:
    episode = item.get("episode")
    version = str(item.get("version") or "")
    search_roots: list[Path] = []
    if episode:
        try:
            episode_number = int(episode)
            base = root / f"Episode_{episode_number:02d}"
            if version:
                search_roots.append(base / version)
            search_roots.append(base)
        except (TypeError, ValueError):
            pass
    media_path = Path(str(item.get("path") or ""))
    if media_path.parent.exists():
        search_roots.append(media_path.parent)
    seen: set[str] = set()
    matches: list[dict[str, Any]] = []
    for search_root in search_roots:
        if not search_root.exists():
            continue
        for pattern in TRANSCRIPT_PATTERNS:
            for path in search_root.rglob(pattern):
                if not path.is_file():
                    continue
                key = str(path.resolve())
                if key in seen or path.name == media_path.name:
                    continue
                seen.add(key)
                text_report = transcript_text_report(path)
                matches.append(
                    {
                        "path": str(path),
                        "relativeToEpisodeRoot": str(path.relative_to(search_root)) if path.is_relative_to(search_root) else path.name,
                        "bytes": path.stat().st_size,
                        "kind": transcript_kind(path),
                        "hasReadableWords": text_report["hasReadableWords"],
                        "hasTranscriptWords": text_report["hasTranscriptWords"],
                        "looksLikeReviewPlaceholder": text_report["looksLikeReviewPlaceholder"],
                        "readableWordCount": text_report["readableWordCount"],
                        "readableCharacterCount": text_report["readableCharacterCount"],
                        "evidenceStatus": text_report["evidenceStatus"],
                    }
                )
    useful_matches = [match for match in matches if match.get("hasTranscriptWords")]
    placeholder_matches = [match for match in matches if not match.get("hasTranscriptWords")]
    if useful_matches:
        status = "candidate-transcript-or-caption-files-found"
        note = "Transcript/caption files with usable spoken-word text were found. They are evidence candidates only and are not canonical unless a later transcript ledger says so."
    elif placeholder_matches:
        status = "placeholder-transcript-or-caption-files-found-no-spoken-words"
        note = "Caption/transcript-shaped files were found, but they do not contain usable spoken-word transcript evidence. Semantic review still needs actual watch/listen evidence or a real transcript."
    else:
        status = "missing-transcript-or-caption-evidence"
        note = "No transcript/caption candidates found near this episode package. Review should rely on watch/listen evidence until transcripts are generated or linked."
    return {
        "status": status,
        "candidateCount": len(matches),
        "spokenWordCandidateCount": len(useful_matches),
        "readableCandidateCount": sum(1 for match in matches if match.get("hasReadableWords")),
        "placeholderCandidateCount": len(placeholder_matches),
        "candidates": matches[:20],
        "note": note,
    }


def transcript_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    name = path.name.lower()
    if suffix in {".srt", ".vtt"}:
        return "caption-file"
    if "caption" in name:
        return "caption-candidate"
    if "transcript" in name:
        return "transcript-candidate"
    return "text-evidence-candidate"


def transcript_text_report(path: Path) -> dict[str, Any]:
    """Classify whether a nearby transcript/caption artifact has actual words.

    Several generated packages currently contain SRT shells with one time range
    and no caption text. Those are useful as a warning, not as semantic evidence.
    """
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
    for line in raw.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        upper = stripped.upper()
        if upper in {"WEBVTT"}:
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
    word_count = len(words)
    char_count = len(text)
    placeholder = looks_like_review_placeholder(text, word_count)
    return {
        "hasReadableWords": word_count > 0,
        "hasTranscriptWords": word_count > 0 and not placeholder,
        "looksLikeReviewPlaceholder": placeholder,
        "readableWordCount": word_count,
        "readableCharacterCount": char_count,
        "evidenceStatus": (
            "review-placeholder-copy"
            if placeholder
            else ("readable-spoken-words-found" if word_count > 0 else "no-readable-words")
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


def review_dimensions() -> list[dict[str, str]]:
    return [
        {"key": "hook", "question": "Does the first two seconds give a stranger a reason to stay?"},
        {"key": "cadence", "question": "Does the edit preserve human rhythm, or did it over-tighten the thought?"},
        {"key": "meaning", "question": "Can the idea stand alone without missing context from the episode?"},
        {"key": "framing", "question": "Is the 9:16 crop comfortable, face-safe, and not visually awkward?"},
        {"key": "captions", "question": "Where should captions live so they do not cover faces, hands, or key motion?"},
        {"key": "audio", "question": "Is the audio understandable and emotionally natural enough for social viewing?"},
        {"key": "ending", "question": "Does the ending land, invite curiosity, or feel chopped off?"},
        {"key": "platform_fit", "question": "Which platforms fit this exact cut, and which need a variant?"},
        {"key": "risk_tradeoff", "question": "What did this short trade away, and is that trade acceptable?"},
    ]


def build_packet(root: Path, theater_path: Path, short_id: str, rank: int | None, reviewer: str) -> dict[str, Any]:
    theater = read_json(theater_path)
    items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    item = select_item(items, short_id, rank)
    media_path = Path(str(item.get("path") or ""))
    commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
    theater_html = theater_path.with_suffix(".html")
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "reviewer": reviewer,
        "releaseRoot": str(root),
        "sourceTheaterJson": str(theater_path),
        "sourceTheaterHtml": str(theater_html),
        "selected": {
            "rank": item.get("rank"),
            "shortId": item.get("shortId"),
            "episode": item.get("episode"),
            "version": item.get("version"),
            "title": item.get("title"),
            "durationLabel": item.get("durationLabel"),
            "durationSeconds": item.get("durationSeconds"),
            "aspect": item.get("aspect"),
            "hasAudio": item.get("hasAudio"),
            "hasVideo": item.get("hasVideo"),
            "width": item.get("width"),
            "height": item.get("height"),
            "probeStatus": item.get("probeStatus"),
            "probeWarning": item.get("probeWarning"),
            "decision": item.get("decision"),
            "reviewPriority": item.get("reviewPriority"),
            "reviewPriorityReason": item.get("reviewPriorityReason"),
            "platformFit": item.get("platformFit") or [],
            "path": str(media_path),
            "uri": item.get("uri") or file_uri(media_path),
        },
        "transcriptAwareness": transcript_candidates(root, item),
        "reviewDimensions": review_dimensions(),
        "suggestedLocalIntentFlow": [
            "Watch the short without touching the decision ledger.",
            "Write one sentence each for hook, cadence, meaning, framing/captions, audio, ending, and risk.",
            "Run a dry-run command first.",
            "Only then record local intent if the note is specific enough to teach the editor.",
        ],
        "safeCommands": {
            "openPacketFolder": "",
            "openTheater": f"open {shell_quote(str(theater_html))}",
            "openShort": f"open {shell_quote(str(media_path))}" if str(media_path) else "",
            "revealShort": f"open -R {shell_quote(str(media_path))}" if str(media_path) else "",
            "dryRunKeep": commands.get("dryRunKeep", ""),
            "dryRunRefine": commands.get("dryRunRefine", ""),
            "dryRunHold": commands.get("dryRunHold", ""),
            "dryRunReject": commands.get("dryRunReject", ""),
            "recordIntentTemplate": commands.get("recordIntentTemplate", ""),
        },
        "nextSafestAction": "Use this packet to watch/listen and write specific review notes. Run a dry-run command before recording local intent.",
        "truth": "Review packet generation only. No decision, approval, publication, upload, schedule, account mutation, media mutation, overwrite, delete, or receipt truth is created.",
    }


def packet_paths(output_root: Path, short_id: str, basename: str) -> tuple[Path, Path, Path]:
    folder = output_root / short_id
    return folder / f"{basename}.json", folder / f"{basename}.md", folder / f"{basename}.html"


def render_markdown(packet: dict[str, Any]) -> str:
    selected = packet["selected"]
    transcript = packet["transcriptAwareness"]
    lines = [
        "# Recommended short review packet",
        "",
        f"Generated: `{packet.get('generatedAt')}`",
        f"Reviewer: `{packet.get('reviewer')}`",
        "",
        f"## {selected.get('shortId')} - {selected.get('title')}",
        "",
        f"- Episode/version: `Episode {selected.get('episode')}` / `{selected.get('version')}`",
        f"- Duration/aspect: `{selected.get('durationLabel')}` / `{selected.get('aspect')}`",
        f"- Media: `{selected.get('width')}x{selected.get('height')}`, audio `{selected.get('hasAudio')}`, video `{selected.get('hasVideo')}`, probe `{selected.get('probeStatus')}`",
        f"- Current local review decision: `{selected.get('decision')}`",
        f"- Priority: `{selected.get('reviewPriority')}` - {selected.get('reviewPriorityReason')}",
        f"- Platform fit: {', '.join(selected.get('platformFit') or [])}",
        f"- File: `{selected.get('path')}`",
        "",
        "## Transcript and caption awareness",
        "",
        f"- Status: `{transcript.get('status')}`",
        f"- Candidate count: `{transcript.get('candidateCount')}`",
        f"- Note: {transcript.get('note')}",
        "",
    ]
    for candidate in transcript.get("candidates", []):
        lines.append(f"- `{candidate.get('kind')}`: `{candidate.get('path')}` ({candidate.get('bytes')} bytes)")
    lines.extend(["", "## Review dimensions", ""])
    for dimension in packet.get("reviewDimensions", []):
        lines.append(f"- `{dimension.get('key')}`: {dimension.get('question')}")
    lines.extend(["", "## Suggested local-intent flow", ""])
    for step in packet.get("suggestedLocalIntentFlow", []):
        lines.append(f"- {step}")
    lines.extend(["", "## Safe commands", ""])
    for label, command in packet.get("safeCommands", {}).items():
        if command:
            lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Truth boundary", "", packet.get("truth", "")])
    return "\n".join(lines).rstrip() + "\n"


def render_html(packet: dict[str, Any]) -> str:
    selected = packet["selected"]
    transcript = packet["transcriptAwareness"]
    media = (
        f"<video controls preload='metadata' src='{esc(selected.get('uri'))}'></video>"
        if selected.get("uri")
        else "<div class='missing'>No local video URI available.</div>"
    )
    dimensions = "\n".join(
        f"<label><strong>{esc(d.get('key'))}</strong><span>{esc(d.get('question'))}</span><textarea placeholder='Write specific review evidence here'></textarea></label>"
        for d in packet.get("reviewDimensions", [])
    )
    candidates = "\n".join(
        f"<li><code>{esc(c.get('path'))}</code><small>{esc(c.get('kind'))} · {esc(c.get('bytes'))} bytes</small></li>"
        for c in transcript.get("candidates", [])
    ) or "<li>No transcript/caption candidates found near this package.</li>"
    commands = "\n".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in packet.get("safeCommands", {}).items()
        if command
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly short review packet - {esc(selected.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110c; --moss:#17261b; --canopy:#233923; --cream:#fff0cf; --honey:#f2c94c; --fern:#86df91; --clay:#d66b55; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 12% 0%,rgba(134,223,145,.18),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1360px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.panel,.review {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,207,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:30px; margin-bottom:16px; }} .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ font-size:clamp(2.1rem,5vw,5rem); line-height:.9; margin:0 0 12px; }} p,li,small,span {{ color:#e1d2b4; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .grid {{ display:grid; grid-template-columns:minmax(280px,440px) minmax(0,1fr); gap:16px; }} .panel,.review {{ padding:18px; }}
    video {{ width:100%; aspect-ratio:9/16; max-height:640px; object-fit:contain; border-radius:22px; background:#050402; border:1px solid rgba(242,201,76,.24); }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }} .meta span {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); font-weight:900; }}
    label {{ display:grid; gap:7px; border:1px solid var(--line); border-radius:18px; padding:12px; margin-bottom:10px; background:rgba(0,0,0,.18); }} label strong {{ color:var(--fern); text-transform:uppercase; letter-spacing:.08em; }}
    textarea {{ width:100%; min-height:70px; color:var(--cream); background:rgba(0,0,0,.28); border:1px solid var(--line); border-radius:14px; padding:10px; }}
    button {{ border:1px solid var(--line); border-radius:999px; color:var(--cream); background:rgba(0,0,0,.25); padding:9px 12px; font-weight:900; cursor:pointer; margin:0 8px 8px 0; }} button:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(23,38,27,.96); border:1px solid rgba(134,223,145,.42); color:var(--fern); opacity:0; transform:translateY(8px); transition:.2s; }} .toast.show {{ opacity:1; transform:translateY(0); }}
    @media (max-width:900px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · watch/listen packet</p>
    <h1>{esc(selected.get('title'))}</h1>
    <p>{esc(packet.get('nextSafestAction'))}</p>
    <div class="meta">
      <span>{esc(selected.get('shortId'))}</span>
      <span>Episode {esc(selected.get('episode'))}</span>
      <span>{esc(selected.get('durationLabel'))}</span>
      <span>{esc(selected.get('aspect'))}</span>
      <span>{esc(selected.get('decision'))}</span>
    </div>
  </header>
  <section class="grid">
    <aside class="panel">
      {media}
      <p><strong>Priority:</strong> {esc(selected.get('reviewPriority'))} · {esc(selected.get('reviewPriorityReason'))}</p>
      <p><strong>Platform fit:</strong> {esc(', '.join(selected.get('platformFit') or []))}</p>
      <p><code>{esc(selected.get('path'))}</code></p>
      <h2>Transcript/caption evidence</h2>
      <p>{esc(transcript.get('status'))}: {esc(transcript.get('note'))}</p>
      <ul>{candidates}</ul>
      <h2>Safe commands</h2>
      <div>{commands}</div>
    </aside>
    <section class="review">
      <p class="eyebrow">Review fields</p>
      <h2>Write evidence before intent.</h2>
      {dimensions}
      <p>{esc(packet.get('truth'))}</p>
    </section>
  </section>
</main>
<div class="toast" id="toast">Copied command</div>
<script>
const toast = document.getElementById('toast');
document.querySelectorAll('[data-copy]').forEach((button) => {{
  button.addEventListener('click', async () => {{
    const value = button.getAttribute('data-copy') || '';
    try {{
      await navigator.clipboard.writeText(value);
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }} catch (error) {{
      window.prompt('Copy command', value);
    }}
  }});
}});
</script>
</body>
</html>
"""


def write_outputs(packet: dict[str, Any], output_root: Path, basename: str, fmt: str) -> dict[str, str]:
    short_id = str(packet["selected"].get("shortId") or "recommended-short")
    json_path, md_path, html_path = packet_paths(output_root, short_id, basename)
    json_path.parent.mkdir(parents=True, exist_ok=True)
    packet["safeCommands"]["openPacketFolder"] = f"open {shell_quote(str(json_path.parent))}"
    packet["artifactPaths"] = {"json": str(json_path), "markdown": str(md_path), "html": str(html_path), "folder": str(json_path.parent)}
    if fmt in {"json", "all"}:
        json_path.write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fmt in {"markdown", "all"}:
        md_path.write_text(render_markdown(packet), encoding="utf-8")
    if fmt in {"html", "all"}:
        html_path.write_text(render_html(packet), encoding="utf-8")
    return packet["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a focused review packet for one recommended Studio short.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export root.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended shorts theater JSON.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Output root for review packets.")
    parser.add_argument("--basename", default="recommended-short-review-packet")
    parser.add_argument("--short-id", default="", help="Select a specific short id instead of first pending.")
    parser.add_argument("--rank", type=int, default=None, help="Select a recommendation rank.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    packet = build_packet(root, Path(args.theater).expanduser(), args.short_id, args.rank, args.reviewer)
    write_outputs(packet, Path(args.output_root).expanduser(), args.basename, args.format)
    if args.format == "json":
        print(json.dumps(packet, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(packet), end="")
    else:
        print(render_markdown(packet), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
