#!/usr/bin/env python3
"""Create transcript/caption workorders from shorts transcript readiness.

Workorders are local planning artifacts. They do not run ASR, create transcript
text, import captions, burn captions into video, or mutate media. They give
reviewers and agents deterministic sidecar destinations and next actions for
word-evidence work.
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
DEFAULT_READINESS_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "transcript-readiness"
    / "quipsly-studio-shorts-transcript-readiness.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "transcript-workorders"
SCHEMA = "quipsly.studio.shorts-transcript-workorders.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Transcript readiness JSON not found: {path}\nRun: script/agentctl.sh studio-shorts-transcript-readiness --all")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def sidecar_paths(output_dir: Path, short_id: str) -> dict[str, str]:
    folder = output_dir / short_id
    return {
        "folder": str(folder),
        "rawProviderOutput": str(folder / f"{short_id}-raw-asr-output.json"),
        "normalizedTranscript": str(folder / f"{short_id}-normalized-transcript.json"),
        "captionDraftSrt": str(folder / f"{short_id}-caption-draft.srt"),
        "captionDraftVtt": str(folder / f"{short_id}-caption-draft.vtt"),
        "reviewNotes": str(folder / f"{short_id}-transcript-review-notes.md"),
        "decisionLedgerHint": str(folder / f"{short_id}-transcript-decision-ledger.jsonl"),
    }


def workorder_kind(status: str) -> str:
    if status == "timed-captions-available":
        return "verify-timed-captions"
    if status == "normalized-transcript-edit-review":
        return "use-normalized-transcript-for-edit-review"
    if status == "machine-draft-word-evidence":
        return "review-machine-draft-word-evidence"
    if status == "structured-transcript-candidate":
        return "verify-structured-transcript"
    if status == "text-only-evidence":
        return "upgrade-text-to-timed-captions"
    if status == "placeholder-word-evidence":
        return "create-or-link-word-evidence"
    return "create-or-link-word-evidence"


def workorder_priority(status: str, rank: int) -> int:
    base = int(rank or 999)
    if status == "missing-word-evidence":
        return base
    if status == "placeholder-word-evidence":
        return base + 10
    if status == "machine-draft-word-evidence":
        return base + 50
    if status == "normalized-transcript-edit-review":
        return base + 250
    if status == "text-only-evidence":
        return base + 100
    if status == "structured-transcript-candidate":
        return base + 200
    return base + 300


def workorder_steps(kind: str) -> list[str]:
    if kind == "use-normalized-transcript-for-edit-review":
        return [
            "Use the normalized transcript sidecar for hook, meaning, caption-placement, and cut-context review.",
            "Keep final caption publication separate from edit-review acceptance.",
            "If transcript words affect a cut decision, spot-check the source audio before final export.",
            "Record any remaining caption fixes before publication.",
        ]
    if kind == "review-machine-draft-word-evidence":
        return [
            "Open the short, ASR draft transcript, and caption draft sidecars.",
            "Listen through the short and correct obvious ASR errors before trusting the words.",
            "Check caption timing, line breaks, and face/microphone collision risk.",
            "Only after review, promote corrected words into the normalized transcript sidecar.",
        ]
    if kind == "verify-timed-captions":
        return [
            "Open the short and the strongest timed-caption candidate.",
            "Listen through enough of the short to confirm timing and speaker sense.",
            "Check whether caption placement would cover faces, microphones, hands, or key motion.",
            "If timing is usable, write review notes and keep caption evidence as sidecar metadata unless burn-in is explicitly approved.",
        ]
    if kind == "verify-structured-transcript":
        return [
            "Open the structured transcript candidate and inspect segment timing, words, and speaker labels.",
            "Listen to the short at the same sequence moment before trusting the text.",
            "If timing is plausible, derive caption draft sidecars for review; if not, mark needs-rerun or needs-speaker-review.",
        ]
    if kind == "upgrade-text-to-timed-captions":
        return [
            "Use text-only evidence for context and copy review, not precise edit timing.",
            "Create or request timed captions from the source audio/video before word-aware cuts.",
            "Store any generated captions in the planned sidecar paths, then rerun transcript readiness.",
        ]
    return [
        "Review the short by watching/listening first so a human does not wait on transcript tooling.",
        "Create or link transcript/caption evidence from the best available audio-bearing source.",
        "Write raw ASR/provider output and normalized transcript/caption sidecars to the planned paths.",
        "Rerun transcript readiness before making caption-aware or word-timed edit claims.",
    ]


def build_workorder(output_dir: Path, row: dict[str, Any]) -> dict[str, Any]:
    short_id = str(row.get("shortId") or "unknown-short")
    status = str(row.get("status") or "missing-word-evidence")
    kind = workorder_kind(status)
    paths = sidecar_paths(output_dir, short_id)
    candidates = row.get("candidates") if isinstance(row.get("candidates"), list) else []
    return {
        "shortId": short_id,
        "episode": row.get("episode"),
        "version": row.get("version"),
        "rank": row.get("rank"),
        "title": row.get("title"),
        "durationLabel": row.get("durationLabel"),
        "durationSeconds": row.get("durationSeconds"),
        "mediaPath": row.get("mediaPath"),
        "status": status,
        "kind": kind,
        "priority": workorder_priority(status, int(row.get("rank") or 999)),
        "candidateCount": row.get("candidateCount") or 0,
        "candidates": candidates[:8],
        "plannedSidecars": paths,
        "steps": workorder_steps(kind),
        "safeCommands": {
            "openShort": f"open {shell_quote(str(row.get('mediaPath') or ''))}" if row.get("mediaPath") else "",
            "revealShort": f"open -R {shell_quote(str(row.get('mediaPath') or ''))}" if row.get("mediaPath") else "",
            "makeFolder": f"mkdir -p {shell_quote(paths['folder'])}",
            "focusedPacket": (row.get("safeCommands") or {}).get("focusedPacket", "") if isinstance(row.get("safeCommands"), dict) else "",
            "readiness": "script/agentctl.sh studio-shorts-transcript-readiness --all",
        },
        "nextSafestAction": row.get("nextSafestAction") or "Review transcript readiness and create sidecar evidence before caption-aware edits.",
        "truth": "Transcript workorder only. It does not run ASR, create words, import transcripts, burn captions, mutate media, approve, publish, or create receipts.",
    }


def build_board(readiness_path: Path, output_dir: Path, limit: int) -> dict[str, Any]:
    readiness = read_json(readiness_path)
    rows = [row for row in readiness.get("items", []) if isinstance(row, dict)]
    workorders = [build_workorder(output_dir, row) for row in rows]
    workorders.sort(key=lambda item: (int(item.get("priority") or 9999), str(item.get("shortId") or "")))
    if limit > 0:
        workorders = workorders[:limit]
    counts = Counter(order["kind"] for order in workorders)
    status_counts = Counter(order["status"] for order in workorders)
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceReadinessJson": str(readiness_path),
        "outputDir": str(output_dir),
        "counts": {
            "workorders": len(workorders),
            "createOrLinkWordEvidence": counts.get("create-or-link-word-evidence", 0),
            "useNormalizedTranscriptForEditReview": counts.get("use-normalized-transcript-for-edit-review", 0),
            "reviewMachineDraftWordEvidence": counts.get("review-machine-draft-word-evidence", 0),
            "upgradeTextToTimedCaptions": counts.get("upgrade-text-to-timed-captions", 0),
            "verifyStructuredTranscript": counts.get("verify-structured-transcript", 0),
            "verifyTimedCaptions": counts.get("verify-timed-captions", 0),
            "missingWordEvidence": status_counts.get("missing-word-evidence", 0),
            "placeholderWordEvidence": status_counts.get("placeholder-word-evidence", 0),
            "timedCaptionsAvailable": status_counts.get("timed-captions-available", 0),
            "approvalCreated": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "workorders": workorders,
        "nextSafestAction": next_action(workorders),
        "truth": "Read-only transcript/caption workorders. No ASR is run, no transcript text is generated, no captions are imported or burned in, no media is mutated, no external publishing occurs, and no receipt truth is created.",
    }


def next_action(workorders: list[dict[str, Any]]) -> str:
    missing = next((order for order in workorders if order.get("kind") == "create-or-link-word-evidence"), None)
    if missing:
        return f"Start with {missing.get('shortId')}: create or link timed word evidence before caption-aware review."
    weak = next((order for order in workorders if order.get("kind") in {"upgrade-text-to-timed-captions", "verify-structured-transcript"}), None)
    if weak:
        return f"Start with {weak.get('shortId')}: upgrade or verify transcript timing before using it for cuts."
    ready = next((order for order in workorders if order.get("kind") == "verify-timed-captions"), None)
    if ready:
        return f"Start with {ready.get('shortId')}: verify timed captions by listening and checking caption-safe framing."
    return "Refresh transcript readiness before building transcript/caption workorders."


def render_markdown(board: dict[str, Any]) -> str:
    lines = [
        "# Studio shorts transcript/caption workorders",
        "",
        f"Generated: `{board.get('generatedAt')}`",
        f"Source readiness: `{board.get('sourceReadinessJson')}`",
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
    lines.extend(["", "## Workorders", ""])
    for order in board.get("workorders", []):
        lines.extend([
            f"### {order.get('shortId')} - {order.get('kind')}",
            "",
            f"- Episode/version: `Episode {order.get('episode')}` / `{order.get('version')}`",
            f"- Status: `{order.get('status')}`",
            f"- Priority: `{order.get('priority')}`",
            f"- Media: `{order.get('mediaPath')}`",
            f"- Planned folder: `{(order.get('plannedSidecars') or {}).get('folder')}`",
            f"- Next: {order.get('nextSafestAction')}",
            "- Steps:",
        ])
        for step in order.get("steps", []):
            lines.append(f"  - {step}")
        lines.append("- Planned sidecars:")
        for label, path in (order.get("plannedSidecars") or {}).items():
            lines.append(f"  - {label}: `{path}`")
        for label, command in (order.get("safeCommands") or {}).items():
            if command:
                lines.append(f"- {label}: `{command}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(board: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in board.get("counts", {}).items()
        if key in {"workorders", "createOrLinkWordEvidence", "verifyTimedCaptions", "missingWordEvidence", "placeholderWordEvidence", "timedCaptionsAvailable"}
    )
    cards = "\n".join(render_card(order) for order in board.get("workorders", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Quipsly Studio transcript workorders</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120c; --moss:#18291f; --cream:#fff0cf; --honey:#f2c94c; --leaf:#8ee39a; --water:#82dce5; --clay:#d87358; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 12% -8%,rgba(142,227,154,.2),transparent 30%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }} header,.truth,.card {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,207,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }} header {{ padding:30px; margin-bottom:16px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }} h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,6vw,5.4rem); line-height:.9; }} h2 {{ margin:0 0 8px; }} p,li {{ color:#e0d1b3; line-height:1.55; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }} .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }} .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }} .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .truth {{ padding:18px; margin-bottom:16px; border-color:rgba(242,201,76,.34); }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:16px; }} .card {{ padding:18px; }} .create-or-link-word-evidence {{ border-color:rgba(216,115,88,.5); }} .verify-timed-captions {{ border-color:rgba(142,227,154,.42); }} .verify-structured-transcript,.upgrade-text-to-timed-captions {{ border-color:rgba(242,201,76,.42); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0; }} .pill,button,a {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; font-size:.82rem; }} button {{ cursor:pointer; }} button:hover,a:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }}
    .command {{ display:flex; gap:8px; align-items:center; margin-top:8px; }} .command code {{ flex:1; display:block; padding:10px; border-radius:14px; background:rgba(0,0,0,.34); border:1px solid var(--line); }} .paths {{ border-left:3px solid var(--water); padding-left:12px; }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(24,41,31,.96); border:1px solid rgba(142,227,154,.42); color:var(--leaf); opacity:0; transform:translateY(8px); transition:.2s; }} .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header><p class=\"eyebrow\">Quipsly Studio · transcript workorders</p><h1>Turn missing words into safe next actions.</h1><p>These workorders plan transcript/caption sidecars for recommended shorts without pretending the text already exists.</p><div class=\"metrics\">{metrics}</div></header>
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


def render_card(order: dict[str, Any]) -> str:
    pills = "".join(
        f"<span class=\"pill\">{esc(label)}: {esc(value)}</span>"
        for label, value in [("Episode", order.get("episode")), ("Status", order.get("status")), ("Priority", order.get("priority")), ("Candidates", order.get("candidateCount"))]
        if value is not None and value != ""
    )
    commands = "".join(
        f"<div class=\"command\"><code>{esc(command)}</code><button data-copy=\"{esc(command)}\">Copy</button></div>"
        for command in (order.get("safeCommands") or {}).values()
        if command
    )
    steps = "".join(f"<li>{esc(step)}</li>" for step in order.get("steps", []))
    paths = "".join(f"<li><strong>{esc(label)}</strong>: <code>{esc(path)}</code></li>" for label, path in (order.get("plannedSidecars") or {}).items())
    return f"""
<article class=\"card {esc(order.get('kind'))}\">
  <p class=\"eyebrow\">{esc(order.get('kind'))}</p>
  <h2>{esc(order.get('shortId'))} · {esc(order.get('title'))}</h2>
  <div class=\"pills\">{pills}</div>
  <p><strong>Next:</strong> {esc(order.get('nextSafestAction'))}</p>
  <ol>{steps}</ol>
  <div class=\"paths\"><p><strong>Planned sidecars</strong></p><ul>{paths}</ul></div>
  {commands}
</article>
"""


def write_outputs(board: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    board["artifactPaths"] = {"folder": str(output_dir), "json": str(json_path), "markdown": str(md_path), "html": str(html_path)}
    json_path.write_text(json.dumps(board, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(board), encoding="utf-8")
    html_path.write_text(render_html(board), encoding="utf-8")
    return board["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Build transcript/caption workorders from shorts transcript readiness.")
    parser.add_argument("--readiness", default=str(DEFAULT_READINESS_JSON), help="Transcript readiness JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-transcript-workorders")
    parser.add_argument("--limit", type=int, default=0, help="Maximum workorders; 0 means all.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    output_dir = Path(args.output_dir).expanduser()
    board = build_board(Path(args.readiness).expanduser(), output_dir, args.limit)
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
