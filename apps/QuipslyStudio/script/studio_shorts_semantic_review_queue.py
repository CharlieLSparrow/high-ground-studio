#!/usr/bin/env python3
"""Build a transcript-aware semantic review queue for recommended shorts.

This queue turns cut-quality evidence into concrete editorial questions about
hook clarity, cadence, captions, endings, and likely review action. It does not
approve transcripts, edit timelines, export media, publish, or mutate source
files.
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
DEFAULT_CUT_QUALITY_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-workbench"
    / "quipsly-studio-shorts-cut-quality-workbench.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "semantic-review-queue"
DEFAULT_BASENAME = "quipsly-studio-shorts-semantic-review-queue"
SCHEMA = "quipsly.studio.shorts-semantic-review-queue.v1"
VERSION = "2026-07-02.v1"

GENERIC_OPENERS = (
    "all right",
    "good morning",
    "welcome to",
    "let's go ahead",
    "i'm scott",
    "this is my brother",
    "and i am",
)
WEAK_ENDINGS = {"about", "and", "the", "a", "to", "of", "with", "for", "it", "this", "that", "so", "but"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Cut-quality workbench JSON not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-workbench --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def words(sample: str) -> list[str]:
    cleaned = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in sample)
    return [part for part in cleaned.split() if part]


def first_words(sample: str, count: int = 18) -> str:
    parts = sample.split()
    return " ".join(parts[:count]) + (" ..." if len(parts) > count else "")


def contains_generic_opener(sample: str) -> bool:
    lowered = sample.lower().strip()
    return any(phrase in lowered[:160] for phrase in GENERIC_OPENERS)


def ending_risk(sample_words: list[str]) -> bool:
    return bool(sample_words and sample_words[-1] in WEAK_ENDINGS)


def semantic_assessment(item: dict[str, Any]) -> dict[str, Any]:
    transcript = item.get("transcript") if isinstance(item.get("transcript"), dict) else {}
    sample = str(transcript.get("sample") or "")
    parts = words(sample)
    word_count = int(transcript.get("wordCountApprox") or len(parts))
    duration = float(item.get("durationSeconds") or 0)
    accepted = bool(transcript.get("acceptedForEditReview"))
    generic = contains_generic_opener(sample)
    too_short = word_count > 0 and word_count < 14
    abrupt = ending_risk(parts)

    flags: list[str] = []
    if not sample:
        flags.append("no-word-sample")
    if generic:
        flags.append("generic-opener-risk")
    if too_short:
        flags.append("too-little-word-context")
    if abrupt:
        flags.append("abrupt-ending-risk")
    if not accepted:
        flags.append("machine-draft-needs-audio-check")
    if duration > 60:
        flags.append("long-short-retention-risk")

    if not sample:
        hook_state = "unknown-hook"
        hook_reason = "No transcript sample is linked yet; hook quality must be judged by watching/listening."
    elif generic:
        hook_state = "likely-needs-stronger-in-point"
        hook_reason = "The opening reads like setup or episode housekeeping, not a stranger-facing social hook."
    elif too_short:
        hook_state = "needs-more-context"
        hook_reason = "The transcript sample is too thin to prove hook, turn, and payoff."
    else:
        hook_state = "reviewable-hook-candidate"
        hook_reason = "The sample contains enough words to evaluate whether the idea lands as a short."

    if duration <= 35:
        cadence_state = "tight-social-review"
        cadence_guidance = "Check that the cut keeps a human breath and does not over-tighten the idea."
    elif duration <= 60:
        cadence_state = "mini-argument-review"
        cadence_guidance = "Make sure every beat earns the longer runtime; split if the idea naturally branches."
    else:
        cadence_state = "long-short-review"
        cadence_guidance = "Treat as a high-retention risk unless the story/context clearly needs the length."

    guidance = []
    if generic:
        guidance.append("Try a later in-point after the greeting/setup, or add a text hook if the setup must stay.")
    if abrupt:
        guidance.append("Check the out-point; the transcript appears to stop on a weak connector word.")
    if not accepted:
        guidance.append("Listen before using words for semantic cut decisions; ASR may miss names, cadence, or speaker intent.")
    guidance.append("Review whether a J-cut or L-cut would preserve the thought handoff better than a hard visual cut.")
    guidance.append("Check vertical framing and caption-safe face space before platform packaging.")

    suggested_note_field = "hook" if generic or too_short else ("endingPayoff" if abrupt else "cadence")
    suggested_note = hook_reason
    if abrupt:
        suggested_note += " Also check whether the out-point cuts off the thought."

    return {
        "hookState": hook_state,
        "hookReason": hook_reason,
        "firstWords": first_words(sample),
        "flags": flags,
        "cadenceState": cadence_state,
        "cadenceGuidance": cadence_guidance,
        "captionTruth": "accepted-for-edit-review" if accepted else "machine-draft-needs-review",
        "suggestedNoteField": suggested_note_field,
        "suggestedNote": suggested_note,
        "guidance": guidance,
        "truth": "Semantic assessment is heuristic review guidance from current transcript/cut-quality evidence. It is not transcript truth, edit approval, caption approval, export, publication, or receipt truth.",
    }


def semantic_priority(item: dict[str, Any], assessment: dict[str, Any]) -> int:
    score = 0
    if item.get("readinessLevel") == "transcript-edit-review-ready":
        score += 20
    if "generic-opener-risk" in assessment["flags"]:
        score += 18
    if "abrupt-ending-risk" in assessment["flags"]:
        score += 14
    if "too-little-word-context" in assessment["flags"]:
        score += 10
    if item.get("durationBucket") == "tight-social-idea":
        score += 6
    if item.get("durationBucket") == "mini-argument":
        score += 3
    return score


def build_item(item: dict[str, Any]) -> dict[str, Any]:
    short_id = str(item.get("shortId") or "")
    assessment = semantic_assessment(item)
    safe_commands = dict(item.get("safeCommands") if isinstance(item.get("safeCommands"), dict) else {})
    note_field = assessment["suggestedNoteField"]
    note = assessment["suggestedNote"]
    if short_id:
        safe_commands["recordSemanticEvidenceNotePreview"] = (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field {shell_quote(note_field)} "
            f"--kind review-evidence --reviewer Codex-Semantic --note {shell_quote(note)}"
        )
    return {
        "shortId": short_id,
        "episode": item.get("episode"),
        "version": item.get("version"),
        "rank": item.get("rank"),
        "title": item.get("title"),
        "durationSeconds": item.get("durationSeconds"),
        "durationLabel": item.get("durationLabel"),
        "durationBucket": item.get("durationBucket"),
        "aspect": item.get("aspect"),
        "mediaPath": item.get("mediaPath"),
        "mediaUri": item.get("mediaUri"),
        "readinessLevel": item.get("readinessLevel"),
        "transcript": item.get("transcript"),
        "semanticAssessment": assessment,
        "semanticPriority": semantic_priority(item, assessment),
        "editorQuestions": item.get("editorQuestions"),
        "platformChecks": item.get("platformChecks"),
        "safeCommands": safe_commands,
        "nextSafestAction": next_item_action(item, assessment),
        "truth": "Semantic review queue item only. It records no review decision, edits no timeline, exports nothing, publishes nothing, mutates no media, and creates no receipt truth.",
    }


def next_item_action(item: dict[str, Any], assessment: dict[str, Any]) -> str:
    short_id = str(item.get("shortId") or "this short")
    if item.get("readinessLevel") == "transcript-draft-review":
        return f"{short_id}: listen against ASR, then accept-for-edit-review, mark needs-correction, or hold before using words as cut evidence."
    if "generic-opener-risk" in assessment["flags"]:
        return f"{short_id}: test a stronger in-point or note why the setup must stay."
    if "abrupt-ending-risk" in assessment["flags"]:
        return f"{short_id}: check whether the out-point cuts off the thought, then adjust or note the tradeoff."
    return f"{short_id}: watch the cut for hook, cadence, J/L cuts, jump-cut cover, captions, crop, and platform fit."


def build_queue(cut_quality_path: Path, limit: int) -> dict[str, Any]:
    board = read_json(cut_quality_path)
    raw_items = [item for item in board.get("items", []) if isinstance(item, dict)]
    items = [build_item(item) for item in raw_items]
    items.sort(key=lambda item: (-int(item.get("semanticPriority") or 0), int(item.get("rank") or 9999)))
    if limit > 0:
        items = items[:limit]
    flags = Counter(flag for item in items for flag in (item.get("semanticAssessment") or {}).get("flags", []))
    hook_states = Counter(str((item.get("semanticAssessment") or {}).get("hookState")) for item in items)
    caption_states = Counter(str((item.get("semanticAssessment") or {}).get("captionTruth")) for item in items)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceCutQualityJson": str(cut_quality_path),
        "counts": {
            "items": len(items),
            "reviewableHookCandidate": hook_states.get("reviewable-hook-candidate", 0),
            "likelyNeedsStrongerInPoint": hook_states.get("likely-needs-stronger-in-point", 0),
            "needsMoreContext": hook_states.get("needs-more-context", 0),
            "acceptedForEditReview": caption_states.get("accepted-for-edit-review", 0),
            "machineDraftNeedsReview": caption_states.get("machine-draft-needs-review", 0),
            "genericOpenerRisk": flags.get("generic-opener-risk", 0),
            "abruptEndingRisk": flags.get("abrupt-ending-risk", 0),
            "tooLittleWordContext": flags.get("too-little-word-context", 0),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "items": items,
        "nextSafestAction": next_board_action(items),
        "truth": "Read-only semantic review queue. It does not approve transcripts, edit timelines, export media, publish, upload, schedule, mutate source media, or create receipt truth.",
    }


def next_board_action(items: list[dict[str, Any]]) -> str:
    for item in items:
        assessment = item.get("semanticAssessment") or {}
        if item.get("readinessLevel") == "transcript-draft-review":
            return item.get("nextSafestAction") or "Review ASR drafts against audio before semantic/caption-aware editing."
        if "generic-opener-risk" in assessment.get("flags", []):
            return item.get("nextSafestAction") or "Start with a generic opener risk."
    return "Open the highest-priority short, watch/listen, and record one semantic evidence note before changing edit state."


def render_markdown(queue: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts semantic review queue",
        "",
        f"Generated: `{queue.get('generatedAt')}`",
        f"Cut-quality source: `{queue.get('sourceCutQualityJson')}`",
        "",
        queue.get("truth", ""),
        "",
        f"Next safest action: {queue.get('nextSafestAction')}",
        "",
        "## Counts",
        "",
    ]
    for key, value in queue.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Queue", ""])
    for item in queue.get("items", []):
        assessment = item.get("semanticAssessment") or {}
        transcript = item.get("transcript") or {}
        lines.extend([
            f"### {item.get('shortId')} - {item.get('title')}",
            "",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('version')}`",
            f"- Duration/aspect: `{item.get('durationLabel')}` / `{item.get('aspect')}` / `{item.get('durationBucket')}`",
            f"- Readiness: `{item.get('readinessLevel')}`",
            f"- Transcript: `{transcript.get('status')}` / `{transcript.get('cockpitStatus')}` / words `{transcript.get('wordCountApprox')}`",
            f"- Hook state: `{assessment.get('hookState')}`",
            f"- Flags: `{', '.join(assessment.get('flags') or [])}`",
            f"- First words: {assessment.get('firstWords')}",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "Guidance:",
        ])
        for guidance in assessment.get("guidance", []):
            lines.append(f"- {guidance}")
        lines.extend(["", "Safe commands:"])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(queue: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in queue.get("counts", {}).items()
    )
    cards = "\n".join(render_item_html(item) for item in queue.get("items", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio semantic review queue</title>
  <style>
    :root {{ color-scheme: dark; --soil:#171109; --moss:#13261c; --cream:#fff1d6; --fern:#8de59b; --honey:#f4c84f; --water:#76d7de; --clay:#dc755b; --line:rgba(255,241,214,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 18% -10%,rgba(141,229,155,.18),transparent 28%),linear-gradient(140deg,var(--moss),var(--soil)); }}
    main {{ width:min(1500px,calc(100vw - 32px)); margin:0 auto; padding:34px 0 80px; }}
    header,.truth,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,214,.07); box-shadow:0 24px 80px rgba(0,0,0,.24); }}
    header {{ padding:30px; margin-bottom:16px; }} h1 {{ margin:0 0 8px; font-size:clamp(34px,5vw,70px); letter-spacing:-.05em; line-height:.94; }} h2 {{ color:var(--honey); text-transform:uppercase; letter-spacing:.14em; font-size:13px; }}
    .lede {{ max-width:980px; color:rgba(255,241,214,.76); font-size:18px; line-height:1.55; }} .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-top:22px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.18); }} .metrics strong {{ display:block; color:var(--fern); font-size:26px; }} .metrics span {{ color:rgba(255,241,214,.62); font-size:11px; text-transform:uppercase; letter-spacing:.11em; }}
    .truth {{ padding:18px 22px; margin-bottom:16px; color:rgba(255,241,214,.78); }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); gap:16px; }}
    .card {{ overflow:hidden; }} video {{ width:100%; aspect-ratio:9/16; max-height:440px; object-fit:contain; background:#050604; border-bottom:1px solid var(--line); }} .body {{ padding:20px; }}
    .pill {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:6px 9px; margin:3px; background:rgba(0,0,0,.18); color:rgba(255,241,214,.82); font-size:12px; }} .warn {{ color:var(--honey); }} .risk {{ color:var(--clay); }} .good {{ color:var(--fern); }}
    blockquote {{ margin:12px 0; padding:12px 14px; border-left:4px solid var(--honey); background:rgba(244,200,79,.1); border-radius:12px; }} li {{ margin:7px 0; color:rgba(255,241,214,.76); line-height:1.45; }} code {{ color:var(--water); overflow-wrap:anywhere; }} button {{ border:1px solid var(--line); border-radius:999px; background:rgba(118,215,222,.13); color:var(--cream); padding:8px 10px; margin:4px; }}
  </style>
</head>
<body><main>
<header><h2>Quipsly Studio</h2><h1>Semantic shorts review queue</h1><p class="lede">Transcript-aware edit guidance for hooks, cadence, endings, captions, and platform fit. It helps a human or agent review smarter without pretending ASR is final truth.</p><div class="metrics">{metrics}</div></header>
<section class="truth"><strong>Truth boundary:</strong> {esc(queue.get('truth'))}<br><strong>Next:</strong> {esc(queue.get('nextSafestAction'))}</section>
<section class="grid">{cards}</section>
</main><script>document.querySelectorAll('button[data-copy]').forEach((b)=>b.addEventListener('click',async()=>{{await navigator.clipboard.writeText(b.dataset.copy||'');const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,900)}}));</script></body></html>"""


def render_item_html(item: dict[str, Any]) -> str:
    assessment = item.get("semanticAssessment") or {}
    transcript = item.get("transcript") or {}
    media = f"<video controls preload='metadata' src='{esc(item.get('mediaUri'))}'></video>" if item.get("mediaUri") else ""
    flag_class = "risk" if assessment.get("flags") else "good"
    guidance = "".join(f"<li>{esc(line)}</li>" for line in assessment.get("guidance", []))
    buttons = "".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in (item.get("safeCommands") or {}).items()
        if command
    )
    return f"""
<article class="card">{media}<div class="body">
  <h2>{esc(item.get('shortId'))}</h2><h3>{esc(item.get('title'))}</h3>
  <span class="pill">Episode {esc(item.get('episode'))}</span><span class="pill">{esc(item.get('durationLabel'))}</span><span class="pill">{esc(item.get('readinessLevel'))}</span><span class="pill {flag_class}">{esc(assessment.get('hookState'))}</span><span class="pill">{esc(assessment.get('captionTruth'))}</span>
  <blockquote>{esc(assessment.get('firstWords') or 'No transcript sample yet.')}</blockquote>
  <p><strong>Why:</strong> {esc(assessment.get('hookReason'))}</p>
  <p><strong>Transcript:</strong> {esc(transcript.get('status'))} / {esc(transcript.get('cockpitStatus'))} / words {esc(transcript.get('wordCountApprox'))}</p>
  <p><strong>Next:</strong> {esc(item.get('nextSafestAction'))}</p>
  <h4>Guidance</h4><ul>{guidance}</ul>
  <h4>Safe commands</h4>{buttons}
  <p><code>{esc(item.get('mediaPath'))}</code></p>
</div></article>"""


def write_outputs(queue: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    if mode in {"json", "all"}:
        payload = dict(queue)
        payload["artifactPaths"] = {key: str(path) for key, path in paths.items()}
        paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if mode in {"markdown", "all"}:
        paths["markdown"].write_text(render_markdown(queue), encoding="utf-8")
    if mode in {"html", "all"}:
        paths["html"].write_text(render_html(queue), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the Studio shorts semantic review queue.")
    parser.add_argument("--cut-quality", default=str(DEFAULT_CUT_QUALITY_JSON), help="Cut-quality workbench JSON.")
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
    queue = build_queue(Path(args.cut_quality), args.limit)
    paths = write_outputs(queue, Path(args.output_dir), args.basename, mode)
    print(json.dumps({
        "ok": True,
        "artifactPaths": {"folder": str(Path(args.output_dir)), **paths},
        "counts": queue.get("counts", {}),
        "nextSafestAction": queue.get("nextSafestAction"),
        "truth": queue.get("truth"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
