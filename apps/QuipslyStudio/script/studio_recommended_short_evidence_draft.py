#!/usr/bin/env python3
"""Create a structured local evidence draft for a recommended short.

This bridges a focused review packet to a decision dry-run command. It writes a
versioned evidence draft beside the packet so review thinking is reusable, but
it does not record the Studio short review decision ledger.
"""
from __future__ import annotations

import argparse
import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PACKET_ROOT = DEFAULT_ROOT / "shorts-command-room" / "recommended-review-packets"
DEFAULT_PACKET_BASENAME = "recommended-short-review-packet"
SCHEMA = "quipsly.studio.recommended-short-evidence-draft.v1"
OUTCOMES = {"keep", "refine", "hold", "reject", "needs-more-evidence"}
DIMENSIONS = (
    "hook",
    "cadence",
    "meaning",
    "framing",
    "captions",
    "audio",
    "ending",
    "platform_fit",
    "risk_tradeoff",
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def slugify(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower())
    return cleaned.strip("-") or "draft"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(f"Review packet JSON not found: {path}\nRun: script/agentctl.sh studio-recommended-short-review-packet --short-id <id>")
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def default_packet_path(short_id: str) -> Path:
    if not short_id:
        return DEFAULT_PACKET_ROOT / "episode-2-short-01" / f"{DEFAULT_PACKET_BASENAME}.json"
    return DEFAULT_PACKET_ROOT / short_id / f"{DEFAULT_PACKET_BASENAME}.json"


def notes_from_args(args: argparse.Namespace) -> dict[str, str]:
    return {
        "hook": args.hook_note,
        "cadence": args.cadence_note,
        "meaning": args.meaning_note,
        "framing": args.framing_note,
        "captions": args.caption_note,
        "audio": args.audio_note,
        "ending": args.ending_note,
        "platform_fit": args.platform_fit_note,
        "risk_tradeoff": args.risk_tradeoff_note,
    }


def specificity(notes: dict[str, str], summary: str) -> dict[str, Any]:
    filled = [key for key, value in notes.items() if value.strip()]
    total_words = len(summary.split()) + sum(len(value.split()) for value in notes.values())
    return {
        "filledDimensions": filled,
        "filledDimensionCount": len(filled),
        "totalEvidenceWords": total_words,
        "specificEnoughForDryRun": bool(summary.strip()) and len(filled) >= 2 and total_words >= 18,
        "specificEnoughForRecordedIntent": bool(summary.strip()) and len(filled) >= 4 and total_words >= 40,
        "note": "Recorded local intent should wait for more specific evidence." if len(filled) < 4 or total_words < 40 else "Evidence is detailed enough to consider recording local intent after dry-run review.",
    }


def dimension_prompt(packet: dict[str, Any], key: str) -> str:
    for dimension in packet.get("reviewDimensions", []):
        if isinstance(dimension, dict) and dimension.get("key") == key:
            return str(dimension.get("question") or "")
    return ""


def combined_note(summary: str, notes: dict[str, str], confidence: str) -> str:
    parts = [summary.strip()] if summary.strip() else []
    for key in DIMENSIONS:
        value = notes.get(key, "").strip()
        if value:
            parts.append(f"{key}: {value}")
    if confidence:
        parts.append(f"confidence: {confidence}")
    return " | ".join(parts) or "needs watch/listen review before local intent"


def build_draft(packet: dict[str, Any], packet_path: Path, args: argparse.Namespace) -> dict[str, Any]:
    selected = packet.get("selected") if isinstance(packet.get("selected"), dict) else {}
    short_id = str(selected.get("shortId") or args.short_id or packet_path.parent.name)
    outcome = args.outcome.strip().lower()
    if outcome not in OUTCOMES:
        raise SystemExit(f"Outcome must be one of {sorted(OUTCOMES)}")
    notes = notes_from_args(args)
    summary = args.summary.strip()
    specificity_report = specificity(notes, summary)
    note = combined_note(summary, notes, args.confidence.strip())
    reviewer = args.reviewer.strip() or "Codex"
    dry_run = f"script/agentctl.sh studio-short-review-decision-dry-run {shell_quote(short_id)} {shell_quote(outcome)} {shell_quote(reviewer)} {shell_quote(note)}"
    live_template = f"script/agentctl.sh studio-short-review-decision {shell_quote(short_id)} {shell_quote(outcome)} {shell_quote(reviewer)} {shell_quote(note)}"
    draft_id = f"{stamp()}-{slugify(short_id)}-{slugify(outcome)}"
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "draftId": draft_id,
        "status": "draft-specific-enough-for-recorded-intent" if specificity_report["specificEnoughForRecordedIntent"] else "draft-needs-more-review-evidence",
        "sourcePacketJson": str(packet_path),
        "reviewer": reviewer,
        "outcome": outcome,
        "confidence": args.confidence.strip(),
        "selected": selected,
        "summary": summary,
        "dimensionEvidence": [
            {
                "key": key,
                "question": dimension_prompt(packet, key),
                "note": notes.get(key, "").strip(),
                "filled": bool(notes.get(key, "").strip()),
            }
            for key in DIMENSIONS
        ],
        "specificity": specificity_report,
        "transcriptAwareness": packet.get("transcriptAwareness", {}),
        "suggestedDryRunCommand": dry_run,
        "recordedIntentCommandTemplate": live_template,
        "safeCommands": {
            "openPacket": f"open {shell_quote(str(packet_path.with_suffix('.html')))}",
            "openShort": packet.get("safeCommands", {}).get("openShort", ""),
            "dryRunEvidenceDraft": dry_run,
            "recordIntentTemplate": live_template,
        },
        "nextSafestAction": "Run the dry-run command, inspect the preview, and only record local intent if the evidence is specific enough and the outcome still matches the watch/listen review.",
        "truth": "Evidence draft only. It does not record a review decision, approve publication, upload, schedule, mutate accounts, mutate media, overwrite exports, delete files, or create receipt truth.",
        "truthFlags": {
            "decisionLedgerMutated": False,
            "approvalCreated": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalScheduleCreated": False,
            "accountMutation": False,
            "mediaMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
            "receiptTruthCreated": False,
        },
    }


def render_markdown(draft: dict[str, Any]) -> str:
    selected = draft.get("selected", {})
    lines = [
        "# Recommended short evidence draft",
        "",
        f"Generated: `{draft.get('generatedAt')}`",
        f"Draft: `{draft.get('draftId')}`",
        f"Status: `{draft.get('status')}`",
        "",
        f"## {selected.get('shortId')} - {selected.get('title')}",
        "",
        f"- Episode/version: `Episode {selected.get('episode')}` / `{selected.get('version')}`",
        f"- Outcome draft: `{draft.get('outcome')}`",
        f"- Reviewer: `{draft.get('reviewer')}`",
        f"- Confidence: `{draft.get('confidence') or 'not stated'}`",
        f"- Duration/aspect: `{selected.get('durationLabel')}` / `{selected.get('aspect')}`",
        f"- Summary: {draft.get('summary') or 'none yet'}",
        "",
        "## Dimension evidence",
        "",
    ]
    for row in draft.get("dimensionEvidence", []):
        marker = "filled" if row.get("filled") else "empty"
        lines.extend([
            f"### {row.get('key')} ({marker})",
            "",
            f"- Prompt: {row.get('question') or 'none'}",
            f"- Note: {row.get('note') or 'none yet'}",
            "",
        ])
    lines.extend([
        "## Specificity",
        "",
        f"- Filled dimensions: `{draft.get('specificity', {}).get('filledDimensionCount')}`",
        f"- Evidence words: `{draft.get('specificity', {}).get('totalEvidenceWords')}`",
        f"- Specific enough for dry run: `{draft.get('specificity', {}).get('specificEnoughForDryRun')}`",
        f"- Specific enough for recorded intent: `{draft.get('specificity', {}).get('specificEnoughForRecordedIntent')}`",
        f"- Note: {draft.get('specificity', {}).get('note')}",
        "",
        "## Safe commands",
        "",
        f"- Dry-run evidence draft: `{draft.get('suggestedDryRunCommand')}`",
        f"- Record intent template: `{draft.get('recordedIntentCommandTemplate')}`",
        "",
        "## Truth boundary",
        "",
        draft.get("truth", ""),
    ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(draft: dict[str, Any]) -> str:
    selected = draft.get("selected", {})
    rows = "\n".join(
        f"<section class='dimension {'filled' if row.get('filled') else 'empty'}'><h3>{esc(row.get('key'))}</h3><p>{esc(row.get('question'))}</p><blockquote>{esc(row.get('note') or 'No evidence yet.')}</blockquote></section>"
        for row in draft.get("dimensionEvidence", [])
    )
    commands = "\n".join(
        f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"
        for label, command in draft.get("safeCommands", {}).items()
        if command
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly evidence draft - {esc(selected.get('shortId'))}</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110c; --moss:#17251a; --cream:#fff0cf; --honey:#f2c94c; --fern:#86df91; --clay:#d66b55; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; color:var(--cream); font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at 10% 0%,rgba(134,223,145,.16),transparent 28%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1180px,calc(100vw - 34px)); margin:0 auto; padding:34px 0 88px; }}
    header,.panel,.dimension {{ border:1px solid var(--line); border-radius:26px; background:rgba(255,240,207,.07); box-shadow:0 20px 64px rgba(0,0,0,.25); }}
    header,.panel {{ padding:26px; margin-bottom:16px; }} .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2rem,5vw,4.7rem); line-height:.9; }} p,blockquote,li {{ color:#e1d2b4; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:flex; flex-wrap:wrap; gap:8px; }} .metrics span {{ border:1px solid var(--line); border-radius:999px; background:rgba(0,0,0,.24); padding:8px 10px; font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:12px; }} .dimension {{ padding:16px; }} .dimension.filled {{ border-color:rgba(134,223,145,.42); }} .dimension.empty {{ border-color:rgba(214,107,85,.28); opacity:.82; }}
    blockquote {{ margin:10px 0 0; padding-left:12px; border-left:3px solid var(--honey); }} button {{ border:1px solid var(--line); border-radius:999px; color:var(--cream); background:rgba(0,0,0,.25); padding:9px 12px; font-weight:900; cursor:pointer; margin:0 8px 8px 0; }} button:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(23,38,27,.96); border:1px solid rgba(134,223,145,.42); color:var(--fern); opacity:0; transform:translateY(8px); transition:.2s; }} .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · evidence draft</p>
    <h1>{esc(selected.get('title'))}</h1>
    <div class="metrics">
      <span>{esc(selected.get('shortId'))}</span>
      <span>outcome {esc(draft.get('outcome'))}</span>
      <span>{esc(draft.get('status'))}</span>
      <span>{esc(draft.get('specificity', {}).get('filledDimensionCount'))} dimensions</span>
      <span>{esc(draft.get('specificity', {}).get('totalEvidenceWords'))} words</span>
    </div>
    <p>{esc(draft.get('summary') or 'No summary yet.')}</p>
  </header>
  <section class="panel">
    <p class="eyebrow">Specificity</p>
    <p>{esc(draft.get('specificity', {}).get('note'))}</p>
    <p>{esc(draft.get('truth'))}</p>
  </section>
  <section class="grid">{rows}</section>
  <section class="panel">
    <p class="eyebrow">Safe commands</p>
    {commands}
    <p><code>{esc(draft.get('suggestedDryRunCommand'))}</code></p>
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


def write_outputs(draft: dict[str, Any], packet_path: Path, output_root: str) -> dict[str, str]:
    base = Path(output_root).expanduser() if output_root else packet_path.parent / "evidence-drafts"
    folder = base / str(draft.get("draftId"))
    folder.mkdir(parents=True, exist_ok=True)
    json_path = folder / "short-evidence-draft.json"
    md_path = folder / "short-evidence-draft.md"
    html_path = folder / "short-evidence-draft.html"
    draft["artifactPaths"] = {"folder": str(folder), "json": str(json_path), "markdown": str(md_path), "html": str(html_path)}
    draft["safeCommands"]["openEvidenceDraftFolder"] = f"open {shell_quote(str(folder))}"
    draft["safeCommands"]["openEvidenceDraft"] = f"open {shell_quote(str(html_path))}"
    json_path.write_text(json.dumps(draft, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md_path.write_text(render_markdown(draft), encoding="utf-8")
    html_path.write_text(render_html(draft), encoding="utf-8")
    return draft["artifactPaths"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a structured evidence draft for a recommended Studio short.")
    parser.add_argument("--packet", default="", help="Review packet JSON. Defaults to packet for --short-id.")
    parser.add_argument("--short-id", default="", help="Short id used to locate the default packet.")
    parser.add_argument("--outcome", default="needs-more-evidence", choices=sorted(OUTCOMES))
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--confidence", default="needs-human-review")
    parser.add_argument("--summary", default="")
    parser.add_argument("--hook-note", default="")
    parser.add_argument("--cadence-note", default="")
    parser.add_argument("--meaning-note", default="")
    parser.add_argument("--framing-note", default="")
    parser.add_argument("--caption-note", default="")
    parser.add_argument("--audio-note", default="")
    parser.add_argument("--ending-note", default="")
    parser.add_argument("--platform-fit-note", default="")
    parser.add_argument("--risk-tradeoff-note", default="")
    parser.add_argument("--output-root", default="", help="Optional output root. Defaults to packet/evidence-drafts.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    packet_path = Path(args.packet).expanduser() if args.packet else default_packet_path(args.short_id)
    packet = read_json(packet_path)
    draft = build_draft(packet, packet_path, args)
    write_outputs(draft, packet_path, args.output_root)
    if args.format == "json":
        print(json.dumps(draft, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(draft), end="")
    else:
        print(render_markdown(draft), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
