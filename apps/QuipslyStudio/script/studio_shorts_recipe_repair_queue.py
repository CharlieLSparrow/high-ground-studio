#!/usr/bin/env python3
"""Build a repair queue for shorts whose current recipe needs rethinking.

This queue converts semantic/audition evidence into next actions like
"choose a better source span" or "audition the candidate before editing." It is
review guidance only and does not mutate source media, timeline metadata,
canonical exports, publishing state, or receipt truth.
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
DEFAULT_SEMANTIC_QUEUE_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-review-queue"
    / "quipsly-studio-shorts-semantic-review-queue.json"
)
DEFAULT_CANDIDATES_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-edit-candidates"
    / "quipsly-studio-shorts-semantic-edit-candidates.json"
)
DEFAULT_AUDITION_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "semantic-edit-auditions"
    / "index"
    / "quipsly-studio-shorts-semantic-edit-audition-index.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "recipe-repair-queue"
DEFAULT_BASENAME = "quipsly-studio-shorts-recipe-repair-queue"
SCHEMA = "quipsly.studio.shorts-recipe-repair-queue.v1"
VERSION = "2026-07-02.v1"


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


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def index_by_short(rows: list[Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if isinstance(row, dict) and row.get("shortId"):
            out[str(row["shortId"])] = row
    return out


def latest_auditions_by_short(rows: list[Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("shortId"):
            continue
        short_id = str(row["shortId"])
        if short_id not in out:
            out[short_id] = row
    return out


def classify(theater: dict[str, Any], semantic: dict[str, Any], candidate: dict[str, Any], audition: dict[str, Any]) -> dict[str, Any]:
    semantic_assessment = semantic.get("semanticAssessment") if isinstance(semantic.get("semanticAssessment"), dict) else {}
    flags = set(semantic_assessment.get("flags") if isinstance(semantic_assessment.get("flags"), list) else [])
    audition_warnings = audition.get("warnings") if isinstance(audition.get("warnings"), list) else []
    has_candidate = bool(candidate.get("candidates"))
    has_audition = bool(audition)
    has_source_range = any(theater.get(key) is not None for key in ("sequenceStart", "sequenceEnd", "sourceStart", "sourceEnd"))

    reasons: list[str] = []
    if "generic-opener-risk" in flags:
        reasons.append("Opening likely starts with setup/housekeeping instead of a stranger-facing hook.")
    if "abrupt-ending-risk" in flags:
        reasons.append("Ending may stop on an unfinished connector or weak payoff.")
    if "too-little-word-context" in flags:
        reasons.append("Transcript sample is too thin to prove hook, turn, and payoff.")
    if audition_warnings:
        reasons.extend(str(warning) for warning in audition_warnings)
    if not has_source_range:
        reasons.append("The current review theater does not expose original episode/source in-out metadata for this short.")

    if audition_warnings:
        status = "needs-new-source-span"
        severity = 95
        next_action = "Choose or generate a better source span from the episode timeline; do not polish this short as-is."
    elif has_candidate and not has_audition and ("generic-opener-risk" in flags or "abrupt-ending-risk" in flags):
        status = "needs-audition-preview"
        severity = 80
        next_action = "Render or review a candidate audition preview before changing edit decisions."
    elif "machine-draft-needs-audio-check" in flags:
        status = "needs-transcript-audio-review"
        severity = 60
        next_action = "Review ASR against audio before using transcript words for recipe repair."
    elif flags:
        status = "needs-human-feel-review"
        severity = 45
        next_action = "Watch/listen and record a focused review note before promoting or rejecting."
    else:
        status = "reviewable"
        severity = 20
        next_action = "Review normally for hook, cadence, captions, crop, and platform fit."

    return {
        "status": status,
        "severity": severity,
        "reasons": reasons,
        "flags": sorted(flags),
        "missingSourceRange": not has_source_range,
        "nextAction": next_action,
    }


def build_item(theater: dict[str, Any], semantic: dict[str, Any], candidate: dict[str, Any], audition: dict[str, Any]) -> dict[str, Any]:
    short_id = str(theater.get("shortId") or semantic.get("shortId") or candidate.get("shortId") or audition.get("shortId") or "")
    classification = classify(theater, semantic, candidate, audition)
    media_path = str(theater.get("path") or semantic.get("mediaPath") or candidate.get("mediaPath") or "")
    safe_commands = {
        "openShort": f"open {shell_quote(media_path)}" if media_path else "",
        "revealShort": f"open -R {shell_quote(media_path)}" if media_path else "",
    }
    if candidate:
        safe_commands["createAuditionDryRun"] = f"script/agentctl.sh studio-shorts-semantic-edit-audition --short-id {shell_quote(short_id)} --dry-run"
        safe_commands["renderAuditionPreview"] = f"script/agentctl.sh studio-shorts-semantic-edit-audition --short-id {shell_quote(short_id)} --render-preview"
    if audition.get("safeCommands"):
        commands = audition.get("safeCommands") if isinstance(audition.get("safeCommands"), dict) else {}
        safe_commands["openLatestAuditionPacket"] = str(commands.get("openPacket") or "")
        safe_commands["openLatestAuditionPreview"] = str(commands.get("openPreview") or "")
    note = "; ".join(classification["reasons"][:3]) or classification["nextAction"]
    if short_id:
        field = "hook" if classification["status"] in {"needs-new-source-span", "needs-audition-preview"} else "riskTradeoff"
        safe_commands["recordRepairEvidenceNote"] = (
            "script/agentctl.sh studio-shorts-cut-quality-note "
            f"--short-id {shell_quote(short_id)} --field {shell_quote(field)} "
            f"--kind review-evidence --reviewer Codex-Recipe-Repair --note {shell_quote(note)}"
        )
    return {
        "shortId": short_id,
        "episode": theater.get("episode") or semantic.get("episode") or candidate.get("episode") or audition.get("episode"),
        "version": theater.get("version") or semantic.get("version") or candidate.get("version"),
        "rank": theater.get("rank") or semantic.get("rank") or candidate.get("rank"),
        "title": theater.get("title") or semantic.get("title") or candidate.get("title") or audition.get("title"),
        "durationSeconds": theater.get("durationSeconds") or semantic.get("durationSeconds") or candidate.get("durationSeconds"),
        "durationLabel": theater.get("durationLabel") or semantic.get("durationLabel") or candidate.get("durationLabel"),
        "mediaPath": media_path,
        "mediaUri": theater.get("uri") or semantic.get("mediaUri") or candidate.get("mediaUri") or file_uri(media_path),
        "repairStatus": classification["status"],
        "repairSeverity": classification["severity"],
        "repairReasons": classification["reasons"],
        "repairFlags": classification["flags"],
        "missingSourceRange": classification["missingSourceRange"],
        "semanticAssessment": semantic.get("semanticAssessment"),
        "latestCandidate": (candidate.get("candidates") or [{}])[0] if isinstance(candidate.get("candidates"), list) and candidate.get("candidates") else {},
        "latestAudition": audition,
        "safeCommands": safe_commands,
        "nextSafestAction": f"{short_id}: {classification['nextAction']}" if short_id else classification["nextAction"],
        "truth": "Recipe repair queue item only. It records no review decision, edits no timeline, creates no publishing export, mutates no media, and creates no receipt truth.",
    }


def build_queue(theater_path: Path, semantic_path: Path, candidates_path: Path, audition_path: Path, limit: int) -> dict[str, Any]:
    theater = read_json(theater_path)
    semantic = read_json(semantic_path)
    candidates = read_json(candidates_path)
    auditions = read_json(audition_path)
    semantic_by_short = index_by_short(semantic.get("items", []) if isinstance(semantic.get("items"), list) else [])
    candidate_by_short = index_by_short(candidates.get("items", []) if isinstance(candidates.get("items"), list) else [])
    audition_by_short = latest_auditions_by_short(auditions.get("items", []) if isinstance(auditions.get("items"), list) else [])
    raw_items = [item for item in theater.get("items", []) if isinstance(item, dict)]
    items = [
        build_item(
            item,
            semantic_by_short.get(str(item.get("shortId") or ""), {}),
            candidate_by_short.get(str(item.get("shortId") or ""), {}),
            audition_by_short.get(str(item.get("shortId") or ""), {}),
        )
        for item in raw_items
    ]
    items.sort(key=lambda item: (-int(item.get("repairSeverity") or 0), int(item.get("rank") or 9999)))
    if limit > 0:
        items = items[:limit]
    statuses = Counter(str(item.get("repairStatus")) for item in items)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceTheaterJson": str(theater_path),
        "sourceSemanticReviewQueueJson": str(semantic_path),
        "sourceSemanticEditCandidatesJson": str(candidates_path),
        "sourceSemanticAuditionIndexJson": str(audition_path),
        "counts": {
            "items": len(items),
            "needsNewSourceSpan": statuses.get("needs-new-source-span", 0),
            "needsAuditionPreview": statuses.get("needs-audition-preview", 0),
            "needsTranscriptAudioReview": statuses.get("needs-transcript-audio-review", 0),
            "needsHumanFeelReview": statuses.get("needs-human-feel-review", 0),
            "reviewable": statuses.get("reviewable", 0),
            "missingSourceRange": sum(1 for item in items if item.get("missingSourceRange")),
            "timelineMutations": 0,
            "exportsCreatedForPublishing": 0,
            "receiptTruthCreated": False,
        },
        "items": items,
        "nextSafestAction": items[0].get("nextSafestAction") if items else "No short recipe repair items available.",
        "truth": "Read-only short recipe repair queue. It turns review evidence into next actions but does not mutate source media, edit metadata, exports, publication state, or receipt truth.",
    }


def render_markdown(queue: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts recipe repair queue",
        "",
        f"Generated: `{queue.get('generatedAt')}`",
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
    lines.extend(["", "## Repair queue", ""])
    for item in queue.get("items", []):
        lines.extend([
            f"### {item.get('shortId')} - {item.get('title')}",
            "",
            f"- Episode/version: `Episode {item.get('episode')}` / `{item.get('version')}`",
            f"- Duration: `{item.get('durationLabel')}`",
            f"- Status: `{item.get('repairStatus')}` severity `{item.get('repairSeverity')}`",
            f"- Missing source range: `{item.get('missingSourceRange')}`",
            f"- Next: {item.get('nextSafestAction')}",
            "",
            "Reasons:",
        ])
        for reason in item.get("repairReasons", []):
            lines.append(f"- {reason}")
        lines.extend(["", "Safe commands:"])
        for label, command in (item.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(queue: dict[str, Any]) -> str:
    metrics = "".join(f"<div><strong>{esc(v)}</strong><span>{esc(k)}</span></div>" for k, v in queue.get("counts", {}).items())
    cards = "\n".join(render_item_html(item) for item in queue.get("items", []))
    return f"""<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Quipsly Studio short recipe repair queue</title><style>
:root{{color-scheme:dark;--soil:#171008;--moss:#13261c;--cream:#fff0d0;--fern:#8ee39a;--honey:#f2c94c;--water:#76d7df;--clay:#d87358;--line:rgba(255,240,208,.16)}}*{{box-sizing:border-box}}body{{margin:0;color:var(--cream);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 18% -10%,rgba(142,227,154,.18),transparent 30%),linear-gradient(140deg,var(--moss),var(--soil))}}main{{width:min(1500px,calc(100vw - 32px));margin:0 auto;padding:34px 0 90px}}header,.truth,.card{{border:1px solid var(--line);border-radius:28px;background:rgba(255,240,208,.07);box-shadow:0 24px 80px rgba(0,0,0,.24)}}header{{padding:30px;margin-bottom:16px}}h1{{font-size:clamp(34px,5vw,70px);line-height:.94;letter-spacing:-.05em;margin:0 0 8px}}h2{{color:var(--honey);font-size:13px;letter-spacing:.14em;text-transform:uppercase}}.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-top:22px}}.metrics div{{border:1px solid var(--line);border-radius:18px;padding:13px;background:rgba(0,0,0,.18)}}.metrics strong{{display:block;color:var(--fern);font-size:26px}}.metrics span{{font-size:11px;text-transform:uppercase;letter-spacing:.11em;color:rgba(255,240,208,.62)}}.truth{{padding:18px 22px;margin-bottom:16px;color:rgba(255,240,208,.78)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(440px,1fr));gap:16px}}.card{{overflow:hidden}}video{{width:100%;aspect-ratio:9/16;max-height:380px;object-fit:contain;background:#050604;border-bottom:1px solid var(--line)}}.body{{padding:20px}}.pill{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:6px 9px;margin:3px;background:rgba(0,0,0,.2);font-size:12px}}.risk{{color:var(--clay)}}.warn{{color:var(--honey)}}.good{{color:var(--fern)}}li{{margin:7px 0;color:rgba(255,240,208,.78)}}code{{color:var(--water);overflow-wrap:anywhere}}button{{border:1px solid var(--line);border-radius:999px;background:rgba(118,215,223,.13);color:var(--cream);padding:8px 10px;margin:4px}}
</style></head><body><main><header><h2>Quipsly Studio</h2><h1>Short recipe repair queue</h1><p>Turns failed auditions and semantic risks into calm next actions, without cutting files or pretending review evidence is edit truth.</p><div class="metrics">{metrics}</div></header><section class="truth"><strong>Truth boundary:</strong> {esc(queue.get('truth'))}<br><strong>Next:</strong> {esc(queue.get('nextSafestAction'))}</section><section class="grid">{cards}</section></main><script>document.querySelectorAll('button[data-copy]').forEach((b)=>b.addEventListener('click',async()=>{{await navigator.clipboard.writeText(b.dataset.copy||'');const t=b.textContent;b.textContent='Copied';setTimeout(()=>b.textContent=t,900)}}));</script></body></html>"""


def render_item_html(item: dict[str, Any]) -> str:
    video = f"<video controls preload='metadata' src='{esc(item.get('mediaUri'))}'></video>" if item.get("mediaUri") else ""
    status = str(item.get("repairStatus") or "")
    cls = "risk" if status == "needs-new-source-span" else ("warn" if status.startswith("needs") else "good")
    reasons = "".join(f"<li>{esc(reason)}</li>" for reason in item.get("repairReasons", [])) or "<li>No repair reasons.</li>"
    buttons = "".join(f"<button data-copy='{esc(command)}'>{esc(label)}</button>" for label, command in (item.get("safeCommands") or {}).items() if command)
    return f"""<article class="card">{video}<div class="body"><h2>{esc(item.get('shortId'))}</h2><h3>{esc(item.get('title'))}</h3><span class="pill">Episode {esc(item.get('episode'))}</span><span class="pill">{esc(item.get('durationLabel'))}</span><span class="pill {cls}">{esc(status)}</span><span class="pill">source range missing: {esc(item.get('missingSourceRange'))}</span><p><strong>Next:</strong> {esc(item.get('nextSafestAction'))}</p><h4>Reasons</h4><ul>{reasons}</ul><h4>Safe commands</h4>{buttons}<p><code>{esc(item.get('mediaPath'))}</code></p></div></article>"""


def write_outputs(queue: dict[str, Any], output_dir: Path, basename: str, mode: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {"json": output_dir / f"{basename}.json", "markdown": output_dir / f"{basename}.md", "html": output_dir / f"{basename}.html"}
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
    parser = argparse.ArgumentParser(description="Build the Studio shorts recipe repair queue.")
    parser.add_argument("--theater", default=str(DEFAULT_THEATER_JSON), help="Recommended review theater JSON.")
    parser.add_argument("--semantic-queue", default=str(DEFAULT_SEMANTIC_QUEUE_JSON), help="Semantic review queue JSON.")
    parser.add_argument("--candidates", default=str(DEFAULT_CANDIDATES_JSON), help="Semantic edit candidates JSON.")
    parser.add_argument("--auditions", default=str(DEFAULT_AUDITION_INDEX_JSON), help="Semantic edit audition index JSON.")
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
    queue = build_queue(Path(args.theater), Path(args.semantic_queue), Path(args.candidates), Path(args.auditions), args.limit)
    paths = write_outputs(queue, Path(args.output_dir), args.basename, mode)
    print(json.dumps({"ok": True, "artifactPaths": {"folder": str(Path(args.output_dir)), **paths}, "counts": queue.get("counts"), "nextSafestAction": queue.get("nextSafestAction"), "truth": queue.get("truth")}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
