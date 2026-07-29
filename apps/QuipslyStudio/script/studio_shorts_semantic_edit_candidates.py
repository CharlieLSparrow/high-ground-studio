#!/usr/bin/env python3
"""Create timestamped semantic edit candidates for shorts.

This reads the semantic review queue plus transcript cockpit sidecars and suggests
non-destructive test edits such as stronger in-points, abrupt out-point checks,
and J/L cut review windows. It does not edit timelines, export media, approve
transcripts, or publish.
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
DEFAULT_SEMANTIC_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-review-queue"
    / "quipsly-studio-shorts-semantic-review-queue.json"
)
DEFAULT_TRANSCRIPT_COCKPIT_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-review-cockpit"
    / "quipsly-studio-shorts-transcript-review-cockpit.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "semantic-edit-candidates"
DEFAULT_BASENAME = "quipsly-studio-shorts-semantic-edit-candidates"
SCHEMA = "quipsly.studio.shorts-semantic-edit-candidates.v1"
VERSION = "2026-07-02.v1"

GENERIC_WORDS = {
    "all", "right", "good", "morning", "welcome", "episode", "podcast", "lets", "let's",
    "go", "ahead", "get", "started", "im", "i'm", "scott", "sparrow", "brother",
    "charlie", "everyone", "everybody", "this", "is", "my", "and", "to", "the", "two",
    "three", "four", "five", "six", "one",
}
CONNECTOR_WORDS = {"so", "but", "and", "because", "if", "when", "now", "then"}
QUESTION_WORDS = {"how", "what", "why", "where", "when", "who", "which"}
WEAK_OUT_WORDS = {"about", "and", "the", "a", "to", "of", "with", "for", "it", "this", "that", "so", "but"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def clean_word(value: Any) -> str:
    text = str(value or "").strip().lower()
    return "".join(ch for ch in text if ch.isalnum() or ch == "'")


def index_by_short(rows: list[Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("shortId"):
            out[str(row["shortId"])] = row
    return out


def transcript_path_for(cockpit_item: dict[str, Any]) -> Path | None:
    normalized = cockpit_item.get("normalizedTranscript") if isinstance(cockpit_item.get("normalizedTranscript"), dict) else {}
    asr = cockpit_item.get("asrDraftTranscript") if isinstance(cockpit_item.get("asrDraftTranscript"), dict) else {}
    for source in (normalized, asr):
        path = source.get("path")
        if path and Path(str(path)).exists():
            return Path(str(path))
    return None


def flatten_words(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    for segment in transcript.get("segments", []):
        if not isinstance(segment, dict):
            continue
        segment_words = segment.get("words") if isinstance(segment.get("words"), list) else []
        if segment_words:
            for word in segment_words:
                if isinstance(word, dict):
                    item = dict(word)
                    item["segmentStart"] = segment.get("start")
                    item["segmentEnd"] = segment.get("end")
                    item["segmentText"] = segment.get("text")
                    item["clean"] = clean_word(item.get("word"))
                    words.append(item)
        else:
            text_words = str(segment.get("text") or "").split()
            start = float(segment.get("start") or 0)
            end = float(segment.get("end") or start)
            step = (end - start) / max(len(text_words), 1)
            for idx, text in enumerate(text_words):
                words.append({
                    "word": text,
                    "clean": clean_word(text),
                    "start": start + step * idx,
                    "end": start + step * (idx + 1),
                    "segmentStart": start,
                    "segmentEnd": end,
                    "segmentText": segment.get("text"),
                    "estimated": True,
                })
    return words


def phrase_from(words: list[dict[str, Any]], index: int, count: int = 16) -> str:
    return " ".join(str(word.get("word") or "").strip() for word in words[index:index + count]).strip()


def find_stronger_in(words: list[dict[str, Any]]) -> tuple[int, str] | None:
    if not words:
        return None
    for idx, word in enumerate(words[:60]):
        clean = word.get("clean")
        if clean in QUESTION_WORDS:
            return idx, "question-word"
    for idx, word in enumerate(words[:60]):
        clean = word.get("clean")
        if idx >= 8 and clean in CONNECTOR_WORDS:
            return idx, "thought-connector"
    for idx, word in enumerate(words[:60]):
        clean = str(word.get("clean") or "")
        if idx >= 8 and clean and clean not in GENERIC_WORDS and len(clean) > 3:
            return idx, "first-non-housekeeping-word"
    return None


def build_candidates(item: dict[str, Any], cockpit_item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    assessment = item.get("semanticAssessment") if isinstance(item.get("semanticAssessment"), dict) else {}
    flags = set(assessment.get("flags") if isinstance(assessment.get("flags"), list) else [])
    path = transcript_path_for(cockpit_item)
    transcript = read_json(path) if path else {}
    words = flatten_words(transcript)
    candidates: list[dict[str, Any]] = []

    if "generic-opener-risk" in flags:
        found = find_stronger_in(words)
        if found:
            idx, reason = found
            start = float(words[idx].get("start") or 0)
            audio_lead = max(0.0, start - 0.35)
            candidates.append({
                "type": "test-stronger-in-point",
                "candidateInSeconds": round(start, 2),
                "candidateAudioLeadSeconds": round(audio_lead, 2),
                "candidateVisualInSeconds": round(start, 2),
                "anchorWord": str(words[idx].get("word") or "").strip(),
                "anchorPhrase": phrase_from(words, idx),
                "reason": f"Generic opener risk; first stronger semantic anchor found by {reason}.",
                "humanReview": "Listen before applying. This may need a J-cut audio lead or a text hook instead of a hard trim.",
            })
        else:
            candidates.append({
                "type": "manual-hook-in-point-needed",
                "reason": "Generic opener risk, but transcript timing did not expose a reliable stronger word anchor.",
                "humanReview": "Watch/listen and choose an in-point or preserve setup with an explicit tradeoff note.",
            })

    if "abrupt-ending-risk" in flags and words:
        last_idx = len(words) - 1
        while last_idx > 0 and str(words[last_idx].get("clean") or "") in WEAK_OUT_WORDS:
            last_idx -= 1
        out_time = float(words[last_idx].get("end") or words[last_idx].get("start") or 0)
        candidates.append({
            "type": "check-earlier-out-point",
            "candidateOutSeconds": round(out_time, 2),
            "anchorWord": str(words[last_idx].get("word") or "").strip(),
            "anchorPhrase": phrase_from(words, max(0, last_idx - 10), 14),
            "reason": "Transcript appears to end on a weak connector or unfinished phrase.",
            "humanReview": "Listen for whether this candidate preserves the thought, or whether the clip needs more tail instead.",
        })

    if not candidates:
        candidates.append({
            "type": "watch-listen-semantic-review",
            "reason": "No automatic trim candidate was strong enough. Use semantic guidance as watch/listen questions only.",
            "humanReview": "Review hook, cadence, J/L cut, reaction, captions, and crop before recording a decision.",
        })

    safe_commands = dict(item.get("safeCommands") if isinstance(item.get("safeCommands"), dict) else {})
    if short_id and candidates:
        note = candidates[0].get("reason") or "Semantic edit candidate needs watch/listen review."
        field = "hook" if candidates[0].get("type") in {"test-stronger-in-point", "manual-hook-in-point-needed"} else "endingPayoff"
        safe_commands["recordTopCandidateNote"] = (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field {shell_quote(field)} "
            f"--kind review-evidence --reviewer Codex-Semantic-Candidate --note {shell_quote(str(note))}"
        )

    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "version": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "durationSeconds": item.get("durationSeconds"),
        "durationLabel": item.get("durationLabel"),
        "mediaPath": item.get("mediaPath"),
        "mediaUri": item.get("mediaUri"),
        "semanticPriority": item.get("semanticPriority"),
        "readinessLevel": item.get("readinessLevel"),
        "captionTruth": assessment.get("captionTruth"),
        "flags": sorted(flags),
        "transcriptPath": str(path) if path else "",
        "transcriptStatus": transcript.get("status") or cockpit_item.get("status"),
        "wordCountApprox": transcript.get("wordCountApprox") or (item.get("transcript") or {}).get("wordCountApprox"),
        "candidates": candidates,
        "safeCommands": safe_commands,
        "nextSafestAction": next_action(candidates, short_id),
        "truth": "Semantic edit candidate only. It does not mutate timeline decisions, edit media, approve transcripts, export, publish, upload, schedule, or create receipt truth.",
    }


def next_action(candidates: list[dict[str, Any]], short_id: str) -> str:
    prefix = f"{short_id}: " if short_id else ""
    first = candidates[0] if candidates else {}
    if first.get("type") == "test-stronger-in-point":
        return prefix + "audition the candidate in-point against audio/video, then record whether it improves the hook."
    if first.get("type") == "check-earlier-out-point":
        return prefix + "audition the candidate out-point and decide whether to trim, extend, or preserve the ending."
    return prefix + "watch/listen and record one specific semantic review note before timeline changes."


def build_board(queue_path: Path, cockpit_path: Path, limit: int) -> dict[str, Any]:
    queue = read_json(queue_path)
    cockpit = read_json(cockpit_path)
    cockpit_by_short = index_by_short(cockpit.get("items", []) if isinstance(cockpit.get("items"), list) else [])
    items = [item for item in queue.get("items", []) if isinstance(item, dict)]
    items.sort(key=lambda item: (-int(item.get("semanticPriority") or 0), int(item.get("rank") or 9999)))
    if limit > 0:
        items = items[:limit]
    built = [build_candidates(item, cockpit_by_short.get(str(item.get("shortId") or ""), {})) for item in items]
    candidate_types = Counter(candidate.get("type") for item in built for candidate in item.get("candidates", []))
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceSemanticReviewQueueJson": str(queue_path),
        "sourceTranscriptReviewCockpitJson": str(cockpit_path),
        "counts": {
            "items": len(built),
            "testStrongerInPoint": candidate_types.get("test-stronger-in-point", 0),
            "manualHookInPointNeeded": candidate_types.get("manual-hook-in-point-needed", 0),
            "checkEarlierOutPoint": candidate_types.get("check-earlier-out-point", 0),
            "watchListenSemanticReview": candidate_types.get("watch-listen-semantic-review", 0),
            "timelineMutations": 0,
            "exportsCreated": 0,
            "receiptTruthCreated": False,
        },
        "items": built,
        "nextSafestAction": built[0].get("nextSafestAction") if built else "No semantic edit candidates available.",
        "truth": "Read-only semantic edit candidates. They propose timestamped tests only; no timeline, media, export, transcript approval, publication, or receipt truth is mutated.",
    }


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts semantic edit candidates",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Semantic queue: `{board.get('sourceSemanticReviewQueueJson')}`",
        f"Transcript cockpit: `{board.get('sourceTranscriptReviewCockpitJson')}`",
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
    lines.extend(["", "## Candidates", ""])
    for item in board.get("items", []):
        lines.extend([
            f"### {item.get('shortId')} - {item.get('title')}",
            "",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('version')}`",
            f"- Duration: `{item.get('durationLabel')}`",
            f"- Flags: `{', '.join(item.get('flags') or [])}`",
            f"- Transcript: `{item.get('transcriptStatus')}` / `{item.get('transcriptPath')}`",
            f"- Next: {item.get('nextSafestAction')}",
            "",
        ])
        for candidate in item.get("candidates", []):
            lines.extend([
                f"- Candidate `{candidate.get('type')}`",
                f"  - Reason: {candidate.get('reason')}",
                f"  - In: `{candidate.get('candidateInSeconds', '')}` audio lead `{candidate.get('candidateAudioLeadSeconds', '')}` out `{candidate.get('candidateOutSeconds', '')}`",
                f"  - Anchor: `{candidate.get('anchorWord', '')}` / {candidate.get('anchorPhrase', '')}",
                f"  - Review: {candidate.get('humanReview')}",
            ])
        lines.extend(["", "Safe commands:"])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    metrics = "".join(f"<div><strong>{esc(v)}</strong><span>{esc(k)}</span></div>" for k, v in board.get("counts", {}).items())
    cards = "\n".join(render_item_html(item) for item in board.get("items", []))
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quipsly Studio semantic edit candidates</title><style>
:root{{color-scheme:dark;--soil:#171008;--moss:#14251a;--cream:#fff0d0;--fern:#8ee39a;--honey:#f2c94c;--water:#76d7df;--clay:#d87358;--line:rgba(255,240,208,.16)}}*{{box-sizing:border-box}}body{{margin:0;color:var(--cream);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% -10%,rgba(142,227,154,.18),transparent 32%),linear-gradient(140deg,var(--moss),var(--soil))}}main{{width:min(1500px,calc(100vw - 32px));margin:0 auto;padding:34px 0 90px}}header,.truth,.card{{border:1px solid var(--line);border-radius:28px;background:rgba(255,240,208,.07);box-shadow:0 24px 80px rgba(0,0,0,.24)}}header{{padding:30px;margin-bottom:16px}}h1{{font-size:clamp(34px,5vw,70px);line-height:.94;letter-spacing:-.05em;margin:0 0 8px}}h2{{color:var(--honey);font-size:13px;letter-spacing:.14em;text-transform:uppercase}}.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin-top:22px}}.metrics div{{border:1px solid var(--line);border-radius:18px;padding:13px;background:rgba(0,0,0,.18)}}.metrics strong{{display:block;color:var(--fern);font-size:26px}}.metrics span{{display:block;color:rgba(255,240,208,.62);font-size:11px;text-transform:uppercase;letter-spacing:.11em}}.truth{{padding:18px 22px;margin-bottom:16px;color:rgba(255,240,208,.78)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(430px,1fr));gap:16px}}.body{{padding:20px}}video{{width:100%;aspect-ratio:9/16;max-height:420px;object-fit:contain;background:#050604;border-bottom:1px solid var(--line)}}.pill{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:6px 9px;margin:3px;background:rgba(0,0,0,.2);font-size:12px}}blockquote{{margin:12px 0;padding:12px 14px;border-left:4px solid var(--honey);background:rgba(242,201,76,.1);border-radius:12px}}li{{margin:7px 0;color:rgba(255,240,208,.78)}}code{{color:var(--water);overflow-wrap:anywhere}}button{{border:1px solid var(--line);border-radius:999px;background:rgba(118,215,223,.13);color:var(--cream);padding:8px 10px;margin:4px}}
</style></head><body><main><header><h2>Quipsly Studio</h2><h1>Semantic edit candidates</h1><p>Timestamped in/out tests from transcript and review evidence. Use these to audition better hooks and endings without mutating timeline truth.</p><div class="metrics">{metrics}</div></header><section class="truth"><strong>Truth boundary:</strong> {esc(board.get('truth'))}<br><strong>Next:</strong> {esc(board.get('nextSafestAction'))}</section><section class="grid">{cards}</section></main><script>document.querySelectorAll('button[data-copy]').forEach((b)=>b.addEventListener('click',async()=>{{await navigator.clipboard.writeText(b.dataset.copy||'');const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,900)}}));</script></body></html>"""


def render_item_html(item: dict[str, Any]) -> str:
    media = f"<video controls preload='metadata' src='{esc(item.get('mediaUri'))}'></video>" if item.get("mediaUri") else ""
    candidates = "".join(
        f"<li><strong>{esc(candidate.get('type'))}</strong>: {esc(candidate.get('reason'))}<br><code>in {esc(candidate.get('candidateInSeconds',''))} audio {esc(candidate.get('candidateAudioLeadSeconds',''))} out {esc(candidate.get('candidateOutSeconds',''))}</code><br>{esc(candidate.get('anchorPhrase',''))}<br>{esc(candidate.get('humanReview'))}</li>"
        for candidate in item.get("candidates", [])
    )
    buttons = "".join(f"<button data-copy='{esc(command)}'>{esc(label)}</button>" for label, command in (item.get("safeCommands") or {}).items() if command)
    return f"""<article class="card">{media}<div class="body"><h2>{esc(item.get('shortId'))}</h2><h3>{esc(item.get('title'))}</h3><span class="pill">Episode {esc(item.get('episode'))}</span><span class="pill">{esc(item.get('durationLabel'))}</span><span class="pill">{esc(', '.join(item.get('flags') or []))}</span><p><strong>Next:</strong> {esc(item.get('nextSafestAction'))}</p><ul>{candidates}</ul><h4>Safe commands</h4>{buttons}<p><code>{esc(item.get('transcriptPath'))}</code></p></div></article>"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {"json": output_dir / f"{basename}.json", "markdown": output_dir / f"{basename}.md", "html": output_dir / f"{basename}.html"}
    if mode in {"json", "all"}:
        payload = dict(board)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(board), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(board), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build timestamped semantic edit candidates for shorts.")
    parser.add_argument("--semantic-queue", default=str(DEFAULT_SEMANTIC_QUEUE_JSON), help="Semantic review queue JSON.")
    parser.add_argument("--transcript-cockpit", default=str(DEFAULT_TRANSCRIPT_COCKPIT_JSON), help="Transcript review cockpit JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--limit", type=int, default=0, help="Limit item count. 0 means no limit.")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--json", action="store_true", help="Write JSON only.")
    group.add_argument("--markdown", action="store_true", help="Write Markdown only.")
    group.add_argument("--html", action="store_true", help="Write HTML only.")
    group.add_argument("--all", action="store_true", help="Write JSON, Markdown, and HTML.")
    args = parser.parse_args()
    mode = "all" if args.all or not (args.json or args.markdown or args.html) else ("json" if args.json else "markdown" if args.markdown else "html")
    board = build_board(Path(args.semantic_queue), Path(args.transcript_cockpit), args.limit)
    paths = write_outputs(board, Path(args.output_dir), args.basename, mode)
    print(json.dumps({"ok": True, "artifactPaths": {"folder": str(Path(args.output_dir)), **paths}, "counts": board.get("counts", {}), "nextSafestAction": board.get("nextSafestAction"), "truth": board.get("truth")}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
