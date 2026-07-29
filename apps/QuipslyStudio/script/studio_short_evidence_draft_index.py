#!/usr/bin/env python3
"""Index recommended-short evidence drafts for review clarity.

Evidence drafts are the reusable thinking layer between a watch/listen packet
and a local review decision. This index makes those drafts visible without
recording decisions or changing media.
"""
from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PACKET_ROOT = DEFAULT_ROOT / "shorts-command-room" / "recommended-review-packets"
DEFAULT_OUTPUT_DIR = DEFAULT_PACKET_ROOT / "evidence-draft-index"
DEFAULT_LEDGER_JSON = DEFAULT_ROOT / "review-board" / "studio-short-review-decision-ledger" / "studio-short-review-decision-ledger.json"
SCHEMA = "quipsly.studio.short-evidence-draft-index.v1"
VERSION = "2026-07-02.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def ledger_decisions(ledger_path: Path) -> dict[str, dict[str, Any]]:
    ledger = read_json(ledger_path)
    decisions: dict[str, dict[str, Any]] = {}
    for item in ledger.get("items", []):
        if isinstance(item, dict) and item.get("shortId"):
            decisions[str(item["shortId"])] = item
    return decisions


def draft_paths(packet_root: Path) -> list[Path]:
    if not packet_root.exists():
        return []
    return sorted(packet_root.glob("*/evidence-drafts/*/short-evidence-draft.json"))


def extract_draft(path: Path, decisions: dict[str, dict[str, Any]]) -> dict[str, Any]:
    draft = read_json(path)
    selected = draft.get("selected") if isinstance(draft.get("selected"), dict) else {}
    specificity = draft.get("specificity") if isinstance(draft.get("specificity"), dict) else {}
    short_id = str(selected.get("shortId") or path.parents[2].name)
    ledger_item = decisions.get(short_id, {})
    artifact_paths = draft.get("artifactPaths") if isinstance(draft.get("artifactPaths"), dict) else {}
    html_path = Path(str(artifact_paths.get("html") or path.with_suffix(".html")))
    md_path = Path(str(artifact_paths.get("markdown") or path.with_suffix(".md")))
    safe_commands = draft.get("safeCommands") if isinstance(draft.get("safeCommands"), dict) else {}
    return {
        "draftId": draft.get("draftId") or path.parent.name,
        "shortId": short_id,
        "episode": selected.get("episode"),
        "version": selected.get("version"),
        "title": selected.get("title") or short_id,
        "outcome": draft.get("outcome") or "needs-more-evidence",
        "status": draft.get("status") or "unknown",
        "reviewer": draft.get("reviewer") or "",
        "confidence": draft.get("confidence") or "",
        "generatedAt": draft.get("generatedAt") or "",
        "summary": draft.get("summary") or "",
        "filledDimensionCount": specificity.get("filledDimensionCount") or 0,
        "totalEvidenceWords": specificity.get("totalEvidenceWords") or 0,
        "specificEnoughForDryRun": bool(specificity.get("specificEnoughForDryRun")),
        "specificEnoughForRecordedIntent": bool(specificity.get("specificEnoughForRecordedIntent")),
        "specificityNote": specificity.get("note") or "",
        "ledgerDecision": ledger_item.get("decision") or "pending",
        "ledgerReviewer": ledger_item.get("reviewer") or "",
        "ledgerReviewedAt": ledger_item.get("reviewedAt") or "",
        "jsonPath": str(path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "htmlUri": file_uri(html_path),
        "jsonExists": path.exists(),
        "markdownExists": md_path.exists(),
        "htmlExists": html_path.exists(),
        "suggestedDryRunCommand": draft.get("suggestedDryRunCommand") or safe_commands.get("dryRunEvidenceDraft") or "",
        "recordedIntentCommandTemplate": draft.get("recordedIntentCommandTemplate") or safe_commands.get("recordIntentTemplate") or "",
        "openDraftCommand": f"open {shell_quote(str(html_path))}" if html_path else "",
        "truth": draft.get("truth") or "Evidence draft only.",
    }


def next_action_for(row: dict[str, Any]) -> str:
    if row["ledgerDecision"] != "pending":
        return "Ledger already has local intent. Compare draft to recorded notes before changing anything."
    if row["specificEnoughForRecordedIntent"]:
        return "Run the dry-run command and inspect the preview before recording local intent."
    if row["specificEnoughForDryRun"]:
        return "Dry-run is useful, but collect more review evidence before recording local intent."
    return "Return to the packet and add more specific watch/listen evidence."


def build_index(packet_root: Path, output_dir: Path, ledger_path: Path) -> dict[str, Any]:
    decisions = ledger_decisions(ledger_path)
    rows = [extract_draft(path, decisions) for path in draft_paths(packet_root)]
    for row in rows:
        row["nextSafestAction"] = next_action_for(row)
    by_short: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_short[row["shortId"]].append(row)
    latest_by_short = []
    for short_id, drafts in sorted(by_short.items()):
        latest_by_short.append(sorted(drafts, key=lambda item: item.get("generatedAt") or item.get("draftId") or "", reverse=True)[0])
    counts = {
        "drafts": len(rows),
        "shortsWithDrafts": len(by_short),
        "specificEnoughForDryRun": sum(1 for row in rows if row["specificEnoughForDryRun"]),
        "specificEnoughForRecordedIntent": sum(1 for row in rows if row["specificEnoughForRecordedIntent"]),
        "ledgerPending": sum(1 for row in rows if row["ledgerDecision"] == "pending"),
        "ledgerRecorded": sum(1 for row in rows if row["ledgerDecision"] != "pending"),
        "approvalCreated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "packetRoot": str(packet_root),
        "ledgerJson": str(ledger_path),
        "outputDir": str(output_dir),
        "counts": counts,
        "outcomes": dict(Counter(row["outcome"] for row in rows)),
        "statuses": dict(Counter(row["status"] for row in rows)),
        "latestByShort": latest_by_short,
        "drafts": rows,
        "nextSafestAction": "Review latest drafts with specific-enough evidence, run dry-run commands, and record local intent only when the preview still matches the evidence.",
        "truth": "Evidence-draft index only. It records no review decisions, approves nothing, publishes nothing, uploads nothing, schedules nothing, mutates no accounts, mutates no media, overwrites no exports, deletes nothing, and creates no receipt truth.",
    }


def render_markdown(index: dict[str, Any]) -> str:
    lines = [
        "# Studio short evidence draft index",
        "",
        f"Generated: `{index.get('generatedAt')}`",
        f"Packet root: `{index.get('packetRoot')}`",
        f"Ledger: `{index.get('ledgerJson')}`",
        "",
        index.get("truth", ""),
        "",
        "## Counts",
        "",
    ]
    for key, value in index.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Latest draft by short", ""])
    for row in index.get("latestByShort", []):
        lines.extend([
            f"### {row.get('shortId')} - {row.get('title')}",
            "",
            f"- Draft: `{row.get('draftId')}`",
            f"- Outcome: `{row.get('outcome')}`",
            f"- Status: `{row.get('status')}`",
            f"- Ledger decision: `{row.get('ledgerDecision')}`",
            f"- Filled dimensions: `{row.get('filledDimensionCount')}`",
            f"- Evidence words: `{row.get('totalEvidenceWords')}`",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Open: `{row.get('openDraftCommand')}`",
            f"- Dry-run: `{row.get('suggestedDryRunCommand')}`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(index: dict[str, Any]) -> str:
    metrics = "".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in index.get("counts", {}).items()
        if key in {"drafts", "shortsWithDrafts", "specificEnoughForRecordedIntent", "ledgerPending", "ledgerRecorded"}
    )
    cards = "\n".join(render_card(row) for row in index.get("latestByShort", []))
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio short evidence draft index</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110c; --moss:#17261b; --canopy:#233923; --cream:#fff0cf; --honey:#f2c94c; --fern:#86df91; --clay:#d66b55; --water:#77d1db; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing:border-box; }} body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 12% 0%,rgba(134,223,145,.17),transparent 28%),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1440px,calc(100vw - 36px)); margin:0 auto; padding:34px 0 90px; }}
    header,.card,.truth {{ border:1px solid var(--line); border-radius:30px; background:rgba(255,240,207,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:30px; margin-bottom:16px; }} .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-size:.78rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.3rem,6vw,5.5rem); line-height:.9; }} p,dd {{ color:#e1d2b4; }} code {{ color:#ffeaa3; overflow-wrap:anywhere; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }} .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }} .metrics strong {{ display:block; color:var(--fern); font-size:2rem; }} .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .truth {{ padding:18px; margin-bottom:16px; }} .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(340px,1fr)); gap:16px; }} .card {{ padding:18px; }} .card.ready {{ border-color:rgba(134,223,145,.45); }} .card.needs {{ border-color:rgba(242,201,76,.38); }} .card.recorded {{ border-color:rgba(119,209,219,.45); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; }} .pills span,a,button {{ border:1px solid var(--line); border-radius:999px; padding:8px 10px; background:rgba(0,0,0,.24); color:var(--cream); text-decoration:none; font-weight:900; font-size:.82rem; }} a:hover,button:hover {{ color:var(--honey); border-color:rgba(242,201,76,.55); }} button {{ cursor:pointer; }}
    dl {{ display:grid; grid-template-columns:120px minmax(0,1fr); gap:8px; }} dt {{ color:var(--fern); font-weight:950; }} .summary {{ border-left:3px solid var(--honey); padding-left:12px; }}
    .toast {{ position:fixed; right:20px; bottom:20px; padding:12px 16px; border-radius:16px; background:rgba(23,38,27,.96); border:1px solid rgba(134,223,145,.42); color:var(--fern); opacity:0; transform:translateY(8px); transition:.2s; }} .toast.show {{ opacity:1; transform:translateY(0); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · evidence map</p>
    <h1>Review thinking you can actually find again.</h1>
    <p>{esc(index.get('nextSafestAction'))}</p>
    <div class="metrics">{metrics}</div>
  </header>
  <section class="truth"><p>{esc(index.get('truth'))}</p></section>
  <section class="grid">{cards}</section>
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


def render_card(row: dict[str, Any]) -> str:
    if row.get("ledgerDecision") != "pending":
        cls = "recorded"
    elif row.get("specificEnoughForRecordedIntent"):
        cls = "ready"
    else:
        cls = "needs"
    return f"""
    <article class="card {cls}">
      <p class="eyebrow">Episode {esc(row.get('episode'))} · {esc(row.get('shortId'))}</p>
      <h2>{esc(row.get('title'))}</h2>
      <div class="pills">
        <span>{esc(row.get('outcome'))}</span>
        <span>{esc(row.get('status'))}</span>
        <span>ledger {esc(row.get('ledgerDecision'))}</span>
        <span>{esc(row.get('filledDimensionCount'))} dimensions</span>
        <span>{esc(row.get('totalEvidenceWords'))} words</span>
      </div>
      <p class="summary">{esc(row.get('summary') or 'No summary recorded.')}</p>
      <dl>
        <dt>Next</dt><dd>{esc(row.get('nextSafestAction'))}</dd>
        <dt>Draft</dt><dd><code>{esc(row.get('draftId'))}</code></dd>
        <dt>Specificity</dt><dd>{esc(row.get('specificityNote'))}</dd>
      </dl>
      <div class="pills">
        <a href="{esc(row.get('htmlUri'))}">Open draft</a>
        <button type="button" data-copy="{esc(row.get('suggestedDryRunCommand'))}">Copy dry-run</button>
        <button type="button" data-copy="{esc(row.get('recordedIntentCommandTemplate'))}">Copy record template</button>
      </div>
    </article>
    """


def write_outputs(index: dict[str, Any], output_dir: Path, basename: str, fmt: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{basename}.json"
    md_path = output_dir / f"{basename}.md"
    html_path = output_dir / f"{basename}.html"
    index["artifactPaths"] = {"json": str(json_path), "markdown": str(md_path), "html": str(html_path), "folder": str(output_dir)}
    if fmt in {"json", "all"}:
        json_path.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fmt in {"markdown", "all"}:
        md_path.write_text(render_markdown(index), encoding="utf-8")
    if fmt in {"html", "all"}:
        html_path.write_text(render_html(index), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Index Studio recommended-short evidence drafts.")
    parser.add_argument("--packet-root", default=str(DEFAULT_PACKET_ROOT), help="Recommended review packet root.")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER_JSON), help="Short review decision ledger JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default="quipsly-studio-short-evidence-draft-index")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    index = build_index(Path(args.packet_root).expanduser(), Path(args.output_dir).expanduser(), Path(args.ledger).expanduser())
    write_outputs(index, Path(args.output_dir).expanduser(), args.basename, args.format)
    if args.format == "json":
        print(json.dumps(index, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(index), end="")
    else:
        print(render_markdown(index), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
