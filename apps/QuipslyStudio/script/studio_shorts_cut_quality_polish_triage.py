#!/usr/bin/env python3
"""Build a reviewer triage board from polish cockpits.

The triage board translates cockpit coverage into plain next actions: what to
open first, what to listen for, and what should not be treated as ready. It is a
navigation and review-planning surface only. It records no notes, no decisions,
no timeline edits, no exports, no publishing, and no receipts.
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
DEFAULT_COCKPIT_INDEX_JSON = (
    DEFAULT_ROOT
    / "shorts-command-room"
    / "cut-quality-polish-cockpits"
    / "index"
    / "quipsly-studio-shorts-cut-quality-polish-cockpit-index.json"
)
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "cut-quality-polish-triage"
DEFAULT_BASENAME = "quipsly-studio-shorts-cut-quality-polish-triage"
SCHEMA = "quipsly.studio.shorts-cut-quality-polish-triage.v1"
VERSION = "2026-07-02.v1"
LANE_ORDER = {
    "polish-first": 0,
    "review-then-polish": 1,
    "cadence-review-first": 2,
    "hold-for-human-feel-review": 3,
}
LANE_COPY = {
    "polish-first": {
        "label": "Polish first",
        "plainEnglish": "Best first candidate. Watch/listen for final hook, crop, caption, audio feel, and ending polish.",
        "firstQuestion": "Is the short already emotionally clear enough that small refinements can make it platform-ready?",
        "avoid": "Do not skip review just because the numbers look good.",
    },
    "review-then-polish": {
        "label": "Review, then polish",
        "plainEnglish": "Enough evidence to review, but it needs a real watch/listen pass before polish decisions.",
        "firstQuestion": "What exact moment earns the short, and what exact moment drags or confuses it?",
        "avoid": "Do not record keep/refine intent until at least one specific evidence note exists.",
    },
    "cadence-review-first": {
        "label": "Cadence review first",
        "plainEnglish": "Likely needs rhythm work before platform polish: pauses, J/L cuts, jump-cut covers, or breathing room.",
        "firstQuestion": "Which pauses preserve human meaning, and which pauses are just friction?",
        "avoid": "Do not over-clean. Preserve human cadence where silence carries thought or reaction.",
    },
    "hold-for-human-feel-review": {
        "label": "Hold for human-feel review",
        "plainEnglish": "May still be useful, but should not be treated as a polish candidate until a human-feel review says why.",
        "firstQuestion": "Is there a salvageable emotional or teaching beat here, or should it be rejected?",
        "avoid": "Do not let low-score material clog the polish lane.",
    },
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def file_uri(path: str | Path) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise SystemExit(
            f"Polish cockpit index not found: {path}\n"
            "Run: script/agentctl.sh studio-shorts-cut-quality-polish-cockpit-index --all"
        )
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def note_command(short_id: str, field: str, reviewer: str) -> str:
    return (
        "script/agentctl.sh studio-shorts-cut-quality-note "
        f"--short-id {shell_quote(short_id)} "
        f"--field {field} "
        f"--reviewer {shell_quote(reviewer)} "
        "--note '<specific watch/listen evidence>'"
    )


def decision_prompt(row: dict[str, Any]) -> str:
    lane = str(row.get("lane") or "unknown")
    meaningful = int(row.get("meaningfulPauseCount") or 0)
    long_pauses = int(row.get("longPauseCount") or 0)
    if lane == "polish-first":
        return "Check hook, caption-safe framing, audio feel, and ending payoff before marking any intent."
    if lane == "review-then-polish":
        return "Watch once without changing anything. Capture one hook note, one cadence note, and one crop/caption note."
    if lane == "cadence-review-first":
        return f"Inspect cadence first: {meaningful} meaningful pauses and {long_pauses} long pauses need human-feel judgment."
    if lane == "hold-for-human-feel-review":
        return "Only continue if there is a clear emotional, teaching, or story reason. Otherwise park or reject."
    return "Open the cockpit and record specific watch/listen evidence before any decision."


def enrich_row(row: dict[str, Any], reviewer: str) -> dict[str, Any]:
    short_id = str(row.get("shortId") or "")
    paths = row.get("artifactPaths") if isinstance(row.get("artifactPaths"), dict) else {}
    html_path = str(paths.get("html") or "")
    lane = str(row.get("lane") or "unknown")
    return {
        "shortId": short_id,
        "episode": row.get("episode"),
        "episodeVersion": row.get("episodeVersion"),
        "title": row.get("title"),
        "lane": lane,
        "laneLabel": LANE_COPY.get(lane, {}).get("label", lane),
        "score": row.get("score"),
        "cadenceLabel": row.get("cadenceLabel"),
        "meaningfulPauseCount": row.get("meaningfulPauseCount"),
        "longPauseCount": row.get("longPauseCount"),
        "taskCount": row.get("taskCount"),
        "previewRowCount": row.get("previewRowCount"),
        "worksheetAvailable": row.get("worksheetAvailable"),
        "notesRecorded": row.get("notesRecorded", 0),
        "decisionsRecorded": row.get("decisionsRecorded", 0),
        "cockpitHtml": html_path,
        "openCockpitCommand": f"open {shell_quote(html_path)}" if html_path else "",
        "decisionPrompt": decision_prompt(row),
        "safeNoteCommands": {
            "hook": note_command(short_id, "hook", reviewer),
            "cadence": note_command(short_id, "cadence", reviewer),
            "cropFraming": note_command(short_id, "cropFraming", reviewer),
            "captionPlan": note_command(short_id, "captionPlan", reviewer),
            "audioFeel": note_command(short_id, "audioFeel", reviewer),
        },
        "truth": "Triage row only. It records no notes, decisions, edits, exports, publishing, or receipts.",
    }


def build_triage(index_path: Path, output_dir: Path, reviewer: str, limit_per_lane: int) -> dict[str, Any]:
    index = read_json(index_path)
    rows = [row for row in index.get("latestByShort", []) if isinstance(row, dict)]
    rows.sort(key=lambda row: (LANE_ORDER.get(str(row.get("lane") or ""), 99), -int(row.get("score") or 0), int(row.get("episode") or 999), str(row.get("shortId") or "")))
    enriched = [enrich_row(row, reviewer) for row in rows]
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in enriched:
        grouped[str(row.get("lane") or "unknown")].append(row)

    lanes = []
    for lane in sorted(grouped, key=lambda key: LANE_ORDER.get(key, 99)):
        items = grouped[lane]
        visible = items[:limit_per_lane] if limit_per_lane > 0 else items
        copy = LANE_COPY.get(lane, {"label": lane, "plainEnglish": "", "firstQuestion": "", "avoid": ""})
        lanes.append({
            "lane": lane,
            "label": copy["label"],
            "plainEnglish": copy["plainEnglish"],
            "firstQuestion": copy["firstQuestion"],
            "avoid": copy["avoid"],
            "count": len(items),
            "visibleCount": len(visible),
            "hiddenCount": max(0, len(items) - len(visible)),
            "items": visible,
        })

    lane_counts = Counter(str(row.get("lane") or "unknown") for row in enriched)
    cadence_counts = Counter(str(row.get("cadenceLabel") or "unknown") for row in enriched)
    episodes = Counter(str(row.get("episode") or "unknown") for row in enriched)
    first = enriched[0] if enriched else {}
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "sourceCockpitIndexJson": str(index_path),
        "outputDir": str(output_dir),
        "reviewer": reviewer,
        "counts": {
            "items": len(enriched),
            "lanes": dict(sorted(lane_counts.items())),
            "cadenceLabels": dict(sorted(cadence_counts.items())),
            "episodes": dict(sorted(episodes.items())),
            "notesRecorded": sum(int(row.get("notesRecorded") or 0) for row in enriched),
            "decisionsRecorded": sum(int(row.get("decisionsRecorded") or 0) for row in enriched),
            "externalPublishing": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
        },
        "firstReviewTarget": first,
        "lanes": lanes,
        "nextSafestAction": (
            f"Open {first.get('shortId')} first, watch/listen in the cockpit, then record specific worksheet notes before any keep/refine/hold intent."
            if first else
            "Generate polish cockpits, then refresh triage."
        ),
        "truth": (
            "Polish triage only. It groups cockpit-ready shorts and suggests review order. It records no notes, records no "
            "review decision, edits no timeline, exports no media, publishes nothing, uploads nothing, mutates no source media, "
            "overwrites no cockpit, deletes nothing, and creates no approval or receipt truth."
        ),
    }


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Shorts polish triage",
        "",
        payload.get("truth", ""),
        "",
        "## Counts",
        "",
        f"- Items: `{counts.get('items', 0)}`",
        f"- Lanes: `{counts.get('lanes', {})}`",
        f"- Cadence labels: `{counts.get('cadenceLabels', {})}`",
        f"- Notes recorded: `{counts.get('notesRecorded', 0)}`",
        f"- Decisions recorded: `{counts.get('decisionsRecorded', 0)}`",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
    ]
    for lane in payload.get("lanes", []):
        lines.extend([
            f"## {lane.get('label')} ({lane.get('count')})",
            "",
            lane.get("plainEnglish", ""),
            "",
            f"- First question: {lane.get('firstQuestion')}",
            f"- Avoid: {lane.get('avoid')}",
            "",
        ])
        for row in lane.get("items", []):
            lines.extend([
                f"### {row.get('shortId')} - {row.get('title')}",
                "",
                f"- Episode: `{row.get('episode')}`",
                f"- Score/cadence: `{row.get('score')}` / `{row.get('cadenceLabel')}`",
                f"- Pauses: `{row.get('meaningfulPauseCount')}` meaningful / `{row.get('longPauseCount')}` long",
                f"- Notes/decisions: `{row.get('notesRecorded')}` / `{row.get('decisionsRecorded')}`",
                f"- Prompt: {row.get('decisionPrompt')}",
                f"- Cockpit: `{row.get('cockpitHtml')}`",
                f"- Open: `{row.get('openCockpitCommand')}`",
                "",
            ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lane_sections = []
    for lane in payload.get("lanes", []):
        cards = []
        for row in lane.get("items", []):
            cockpit = str(row.get("cockpitHtml") or "")
            cards.append(f"""
            <article class="card">
              <p class="eyebrow">Episode {esc(row.get('episode'))} · score {esc(row.get('score'))}</p>
              <h3>{esc(row.get('shortId'))}</h3>
              <p>{esc(row.get('title'))}</p>
              <div class="pills">
                <span>{esc(row.get('cadenceLabel'))}</span>
                <span>{esc(row.get('meaningfulPauseCount'))} meaningful pauses</span>
                <span>{esc(row.get('longPauseCount'))} long pauses</span>
                <span>{esc(row.get('notesRecorded'))} notes</span>
                <span>{esc(row.get('decisionsRecorded'))} decisions</span>
              </div>
              <p>{esc(row.get('decisionPrompt'))}</p>
              <a class="button" href="{esc(file_uri(cockpit))}">Open cockpit</a>
              <code>{esc(cockpit)}</code>
            </article>
            """)
        lane_sections.append(f"""
        <section class="lane {esc(lane.get('lane'))}">
          <div class="lane-head">
            <p class="eyebrow">{esc(lane.get('lane'))}</p>
            <h2>{esc(lane.get('label'))} <span>{esc(lane.get('count'))}</span></h2>
            <p>{esc(lane.get('plainEnglish'))}</p>
            <p><strong>First question:</strong> {esc(lane.get('firstQuestion'))}</p>
            <p><strong>Avoid:</strong> {esc(lane.get('avoid'))}</p>
          </div>
          <div class="grid">{''.join(cards)}</div>
        </section>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts polish triage</title>
  <style>
    :root {{ color-scheme: dark; --soil:#15110b; --moss:#1e3322; --leaf:#8edc89; --honey:#f3ce54; --cream:#fff1d4; --line:rgba(255,241,212,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:var(--cream); background:radial-gradient(circle at 8% -8%,rgba(142,220,137,.24),transparent 30rem),radial-gradient(circle at 95% 0%,rgba(243,206,84,.15),transparent 26rem),linear-gradient(135deg,var(--moss),var(--soil)); }}
    main {{ width:min(1480px,calc(100vw - 40px)); margin:0 auto; padding:36px 0 80px; }}
    header,.lane,.card {{ border:1px solid var(--line); border-radius:28px; background:rgba(255,241,212,.07); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding:32px; margin-bottom:18px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.16em; text-transform:uppercase; font-size:.76rem; font-weight:950; margin:0 0 8px; }}
    h1 {{ margin:0 0 12px; font-size:clamp(2.6rem,7vw,5.8rem); line-height:.9; }}
    h2 {{ margin:0 0 8px; font-size:2rem; }}
    h2 span {{ color:var(--leaf); font-size:1.2rem; }}
    h3 {{ margin:0 0 8px; }}
    p {{ color:#e0d1b4; line-height:1.55; }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:18px; }}
    .metrics div {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.22); }}
    .metrics strong {{ display:block; color:var(--leaf); font-size:2rem; }}
    .metrics span {{ color:#cdbf9e; text-transform:uppercase; letter-spacing:.09em; font-size:.72rem; font-weight:900; }}
    .lane {{ padding:22px; margin:16px 0; }}
    .lane-head {{ max-width:960px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(360px,1fr)); gap:14px; margin-top:16px; }}
    .card {{ padding:18px; background:rgba(0,0,0,.22); }}
    .pills {{ display:flex; flex-wrap:wrap; gap:7px; margin:10px 0 14px; }}
    .pills span {{ border:1px solid var(--line); border-radius:999px; padding:7px 10px; background:rgba(0,0,0,.24); font-weight:900; }}
    .button {{ display:inline-block; border:1px solid rgba(243,206,84,.5); border-radius:999px; padding:9px 13px; color:var(--honey); text-decoration:none; font-weight:950; margin-bottom:10px; }}
    code {{ display:block; color:#ffeaa3; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · shorts polish triage</p>
    <h1>Review order without systems anxiety.</h1>
    <p>{esc(payload.get('truth'))}</p>
    <p><strong>Next:</strong> {esc(payload.get('nextSafestAction'))}</p>
    <div class="metrics">
      <div><strong>{esc(counts.get('items', 0))}</strong><span>cockpit shorts</span></div>
      <div><strong>{esc((counts.get('lanes') or {}).get('polish-first', 0))}</strong><span>polish first</span></div>
      <div><strong>{esc((counts.get('lanes') or {}).get('review-then-polish', 0))}</strong><span>review first</span></div>
      <div><strong>{esc((counts.get('lanes') or {}).get('cadence-review-first', 0))}</strong><span>cadence first</span></div>
      <div><strong>{esc(counts.get('notesRecorded', 0))}</strong><span>notes</span></div>
      <div><strong>{esc(counts.get('decisionsRecorded', 0))}</strong><span>decisions</span></div>
    </div>
  </header>
  {''.join(lane_sections)}
</main>
</body>
</html>
"""


def write_outputs(payload: dict[str, Any], output_dir: Path, basename: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "json": output_dir / f"{basename}.json",
        "markdown": output_dir / f"{basename}.md",
        "html": output_dir / f"{basename}.html",
    }
    paths["json"].write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    paths["markdown"].write_text(render_markdown(payload), encoding="utf-8")
    paths["html"].write_text(render_html(payload), encoding="utf-8")
    return {key: str(path) for key, path in paths.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a reviewer triage board from polish cockpits.")
    parser.add_argument("--cockpit-index", default=str(DEFAULT_COCKPIT_INDEX_JSON), help="Polish cockpit index JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output folder for triage artifacts.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME, help="Output basename.")
    parser.add_argument("--reviewer", default="Codex", help="Reviewer label for safe note-command templates.")
    parser.add_argument("--limit-per-lane", type=int, default=0, help="Limit visible rows per lane; 0 shows all.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="markdown")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown")
    parser.add_argument("--json", dest="format", action="store_const", const="json")
    parser.add_argument("--html", dest="format", action="store_const", const="html")
    parser.add_argument("--all", dest="format", action="store_const", const="all")
    args = parser.parse_args()

    payload = build_triage(
        index_path=Path(args.cockpit_index).expanduser(),
        output_dir=Path(args.output_dir).expanduser(),
        reviewer=args.reviewer,
        limit_per_lane=args.limit_per_lane,
    )
    paths = write_outputs(payload, Path(args.output_dir).expanduser(), args.basename)
    payload["artifactPaths"] = paths
    Path(paths["json"]).write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(payload, indent=2, sort_keys=True))
    elif args.format == "html":
        print(paths["html"])
    elif args.format == "all":
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print(render_markdown(payload), end="")


if __name__ == "__main__":
    main()
