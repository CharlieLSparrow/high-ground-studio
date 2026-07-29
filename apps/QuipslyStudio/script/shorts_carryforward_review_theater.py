#!/usr/bin/env python3
"""Build a batch review theater for carry-forward short candidates.

The theater is a read-only review surface. It embeds local candidate videos,
shows start/middle/end frames when available, and provides structured review
commands. It never edits media, approves candidates, exports native target
shorts, or publishes externally.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_WORKORDER = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/"
    "shorts-carryforward-review/episode-01-v004-shorts-realignment-workorder.json"
)

REVIEW_FIELDS = [
    ("hook", "Hook", "Does the first moment earn attention without feeling clickbait or chopped?"),
    ("pacing", "Pacing", "Does the short feel human, tight, and alive rather than over-cleaned?"),
    ("framing", "9:16 framing", "Are faces, gestures, and key visuals safely framed for vertical platforms?"),
    ("captions", "Captions", "Would captions support comprehension without covering faces or the key visual?"),
    ("audio", "Audio and cadence", "Does the voice rhythm sound natural, clear, and emotionally intact?"),
    ("ending", "Ending", "Does the final beat resolve, invite curiosity, or clearly need refinement?"),
    ("platform_fit", "Platform fit", "Where does this belong: YouTube Shorts, Instagram, Facebook, LinkedIn, Patreon, or nowhere yet?"),
    ("risk", "Risk", "What could make this candidate confusing, off-voice, weak, or mistimed against the target version?"),
    ("tradeoff", "Tradeoff", "What creative tradeoff are we accepting or rejecting?"),
]


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return data


def file_uri(path_text: str) -> str:
    try:
        return Path(path_text).expanduser().resolve().as_uri()
    except ValueError:
        return ""


def ledger_path_for(workorder_path: Path) -> Path:
    name = workorder_path.name
    if name.endswith(".json"):
        name = name[:-5]
    return workorder_path.with_name(f"{name}-review-decisions.jsonl")


def summary_path_for(workorder_path: Path) -> Path:
    ledger_path = ledger_path_for(workorder_path)
    return ledger_path.with_name(ledger_path.name.replace(".jsonl", "-summary.json"))


def contact_sheet_dir_for(workorder_path: Path) -> Path:
    return workorder_path.parent / "contact-sheet"


def output_dir_for(workorder_path: Path) -> Path:
    return workorder_path.parent / "review-theater"


def latest_decisions(summary_path: Path) -> dict[int, dict[str, Any]]:
    if not summary_path.exists():
        return {}
    try:
        summary = read_json(summary_path)
    except (OSError, json.JSONDecodeError, ValueError):
        return {}
    latest: dict[int, dict[str, Any]] = {}
    for event in summary.get("latestDecisions", []):
        if not isinstance(event, dict):
            continue
        try:
            latest[int(event.get("index"))] = event
        except (TypeError, ValueError):
            continue
    return latest


def frame_files(contact_sheet_dir: Path, index: int) -> list[Path]:
    frames_dir = contact_sheet_dir / "frames"
    if not frames_dir.exists():
        return []
    order = {"start": 0, "middle": 1, "end": 2}

    def sort_key(path: Path) -> tuple[int, str]:
        label = path.stem.rsplit("-", 1)[-1]
        return (order.get(label, 99), path.name)

    return sorted(frames_dir.glob(f"{index:02d}-*.jpg"), key=sort_key)


def structured_command(index: int, reviewer: str, default_risk: str) -> str:
    return (
        f"script/agentctl.sh shorts-carryforward-record-review --index {index} "
        f"--outcome refine --reviewer {reviewer} "
        "--note \"reviewed against v004; record the creative reason before promotion\" "
        "--hook-note \"\" --pacing-note \"\" --framing-note \"\" --caption-note \"\" "
        "--audio-note \"\" --ending-note \"\" --platform-fit-note \"\" "
        f"--risk-note \"{default_risk}\" "
        "--tradeoff-note \"\" --confidence needs-human-review"
    )


def candidate_card(item: dict[str, Any], contact_sheet_dir: Path, decision: dict[str, Any] | None, reviewer: str) -> dict[str, Any]:
    index = int(item.get("index") or 0)
    facts = item.get("media_facts", {}) if isinstance(item.get("media_facts"), dict) else {}
    source_path = str(item.get("source_path") or "")
    frames = [
        {
            "label": path.stem.rsplit("-", 1)[-1],
            "path": str(path),
            "uri": file_uri(str(path)),
        }
        for path in frame_files(contact_sheet_dir, index)
    ]
    return {
        "index": index,
        "title": item.get("title") or f"Candidate {index:02d}",
        "filename": item.get("filename") or Path(source_path).name,
        "sourcePath": source_path,
        "sourceUri": file_uri(source_path),
        "durationSeconds": facts.get("duration_seconds"),
        "durationBucket": facts.get("duration_bucket"),
        "aspect": facts.get("aspect"),
        "hasAudio": facts.get("has_audio"),
        "hasVideo": facts.get("has_video"),
        "reviewHint": facts.get("review_hint") or "",
        "status": item.get("status") or "needs-review",
        "decision": decision or {},
        "frames": frames,
        "commands": {
            "accept": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome accept --reviewer {reviewer} --note \"Works against target version\"",
            "refine": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome refine --reviewer {reviewer} --note \"Good candidate, needs creative refinement\"",
            "reject": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome reject --reviewer {reviewer} --note \"Not useful for target version\"",
            "hold": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome hold --reviewer {reviewer} --note \"Needs more context before deciding\"",
            "structured_refine": structured_command(index, reviewer, "carry-forward timing may drift from the target version"),
        },
    }


def build_theater(workorder_path: Path, contact_sheet_dir: Path, reviewer: str) -> dict[str, Any]:
    workorder = read_json(workorder_path)
    decisions = latest_decisions(summary_path_for(workorder_path))
    items = [
        candidate_card(item, contact_sheet_dir, decisions.get(int(item.get("index") or 0)), reviewer)
        for item in workorder.get("items", [])
        if isinstance(item, dict)
    ]
    reviewed = len([item for item in items if item.get("decision")])
    return {
        "model": "quipsly-studio-shorts-carryforward-review-theater",
        "version": "2026-07-02.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceWorkorder": str(workorder_path),
        "sourceSummary": str(summary_path_for(workorder_path)),
        "contactSheetDir": str(contact_sheet_dir),
        "episode": workorder.get("episode"),
        "sourceVersion": workorder.get("sourceVersion"),
        "targetVersion": workorder.get("targetVersion"),
        "candidateCount": len(items),
        "reviewedCount": reviewed,
        "pendingCount": max(len(items) - reviewed, 0),
        "reviewFields": [{"key": key, "label": label, "prompt": prompt} for key, label, prompt in REVIEW_FIELDS],
        "candidates": items,
        "truth": "Read-only review theater. This is not approval, native export, publication, or receipt truth.",
    }


def render_markdown(theater: dict[str, Any]) -> str:
    lines = [
        "# Carry-forward shorts review theater",
        "",
        f"Generated: `{theater['generatedAt']}`",
        f"Episode: `{theater.get('episode')}`",
        f"Source version: `{theater.get('sourceVersion')}`",
        f"Target version: `{theater.get('targetVersion')}`",
        "",
        "> Truth: read-only batch review surface. Watch candidates before recording decisions. Accepted/refined candidates still need native target-version export.",
        "",
        "## Counts",
        "",
        f"- Candidates: {theater['candidateCount']}",
        f"- Reviewed: {theater['reviewedCount']}",
        f"- Pending: {theater['pendingCount']}",
        "",
        "## Review dimensions",
        "",
    ]
    for field in theater["reviewFields"]:
        lines.append(f"- **{field['label']}**: {field['prompt']}")
    lines.extend(["", "## Candidates", ""])
    for candidate in theater["candidates"]:
        lines.append(f"### {candidate['index']:02d}. {candidate['title']}")
        lines.append("")
        lines.append(f"- Duration: `{candidate.get('durationSeconds')}s`")
        lines.append(f"- Bucket: `{candidate.get('durationBucket')}`")
        lines.append(f"- Aspect: `{candidate.get('aspect')}`")
        lines.append(f"- Source: `{candidate.get('sourcePath')}`")
        lines.append(f"- Hint: {candidate.get('reviewHint')}")
        decision = candidate.get("decision") or {}
        if decision:
            lines.append(f"- Existing decision: `{decision.get('outcome')}` by {decision.get('reviewer')}")
        else:
            lines.append("- Existing decision: none")
        for frame in candidate.get("frames", []):
            lines.append(f"- Frame `{frame.get('label')}`: `{frame.get('path')}`")
        lines.append(f"- Structured refine: `{candidate['commands']['structured_refine']}`")
        lines.append("")
    return "\n".join(lines)


def render_html(theater: dict[str, Any]) -> str:
    fields = "\n".join(
        f"""
        <article class="field">
          <h3>{html.escape(field['label'])}</h3>
          <p>{html.escape(field['prompt'])}</p>
        </article>
        """
        for field in theater["reviewFields"]
    )
    candidate_html = "\n".join(render_candidate_html(candidate) for candidate in theater["candidates"])
    candidate_nav = "\n".join(
        f"""
        <a class="candidate-jump {'reviewed' if candidate.get('decision') else 'pending'}" href="#candidate-{int(candidate['index']):02d}">
          <strong>{int(candidate['index']):02d}</strong>
          <span>{html.escape(candidate['title'])}</span>
          <em>{'reviewed' if candidate.get('decision') else 'pending'}</em>
        </a>
        """
        for candidate in theater["candidates"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly carry-forward shorts review theater</title>
  <style>
    :root {{
      color-scheme: dark;
      --soil: #17110c;
      --bark: #2c2118;
      --moss: #75945d;
      --fern: #cfe8aa;
      --honey: #edc45c;
      --clay: #cf6647;
      --cream: #fff5dd;
      --line: rgba(255, 245, 221, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 12% 0%, rgba(117, 148, 93, 0.34), transparent 30rem),
        radial-gradient(circle at 94% 8%, rgba(237, 196, 92, 0.18), transparent 28rem),
        linear-gradient(135deg, #0f1712, var(--soil));
      color: var(--cream);
    }}
    main {{ width: min(1440px, calc(100vw - 36px)); margin: 0 auto; padding: 36px 0 80px; }}
    .hero, .panel, .candidate {{
      border: 1px solid var(--line);
      border-radius: 30px;
      background: rgba(255, 245, 221, 0.07);
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.24);
    }}
    .hero {{ padding: 30px; margin-bottom: 18px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 900; font-size: 0.78rem; }}
    h1 {{ margin: 0; font-size: clamp(2.2rem, 5vw, 5rem); line-height: 0.9; }}
    h2, h3 {{ margin-top: 0; }}
    p, li {{ color: #e6d9bf; }}
    .stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px; }}
    .pill {{ border: 1px solid rgba(207, 232, 170, 0.22); background: rgba(117, 148, 93, 0.12); color: var(--fern); border-radius: 999px; padding: 8px 12px; font-weight: 900; }}
    .panel {{ padding: 22px; margin-bottom: 18px; }}
    .review-cockpit {{ position: sticky; top: 0; z-index: 10; backdrop-filter: blur(18px); background: rgba(15, 23, 18, 0.82); }}
    .jump-grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }}
    .candidate-jump {{ display: grid; gap: 4px; min-height: 92px; padding: 12px; border: 1px solid var(--line); border-radius: 18px; background: rgba(0, 0, 0, 0.18); color: var(--cream); text-decoration: none; }}
    .candidate-jump strong {{ color: var(--honey); font-size: 1.1rem; }}
    .candidate-jump span {{ font-weight: 850; line-height: 1.1; }}
    .candidate-jump em {{ align-self: end; justify-self: start; border-radius: 999px; padding: 4px 8px; font-style: normal; font-weight: 900; font-size: 0.72rem; text-transform: uppercase; }}
    .candidate-jump.pending em {{ color: #ffd2bf; background: rgba(207, 102, 71, 0.18); }}
    .candidate-jump.reviewed em {{ color: var(--fern); background: rgba(117, 148, 93, 0.22); }}
    .field-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }}
    .field {{ border: 1px solid rgba(237, 196, 92, 0.18); background: rgba(0, 0, 0, 0.18); border-radius: 20px; padding: 14px; }}
    .field h3 {{ color: var(--honey); margin-bottom: 6px; }}
    .candidate {{ padding: 18px; margin-bottom: 18px; }}
    .candidate-grid {{ display: grid; grid-template-columns: minmax(320px, 0.42fr) minmax(0, 1fr); gap: 18px; align-items: start; }}
    video {{ width: 100%; max-height: 620px; background: #030302; border-radius: 24px; border: 1px solid rgba(237, 196, 92, 0.2); }}
    .frames {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }}
    figure {{ margin: 0; border: 1px solid var(--line); border-radius: 18px; padding: 8px; background: rgba(0, 0, 0, 0.2); }}
    img {{ width: 100%; border-radius: 12px; display: block; }}
    figcaption {{ margin-top: 5px; color: var(--fern); font-weight: 900; }}
    code {{ display: block; overflow-x: auto; padding: 12px; border-radius: 14px; background: rgba(0, 0, 0, 0.34); color: #ffe8a3; }}
    button.copy-command {{ margin: 10px 0 0; border: 0; border-radius: 999px; padding: 9px 13px; background: var(--honey); color: #20150d; font-weight: 950; cursor: pointer; }}
    .copy-status {{ margin-left: 10px; color: var(--fern); font-weight: 850; }}
    .decision {{ border-left: 4px solid var(--honey); padding-left: 12px; }}
    .no-decision {{ border-left: 4px solid var(--clay); padding-left: 12px; }}
    @media (max-width: 980px) {{ .candidate-grid, .field-grid, .jump-grid {{ grid-template-columns: 1fr; }} main {{ width: min(100vw - 24px, 760px); }} .review-cockpit {{ position: static; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio batch review</p>
      <h1>Carry-forward shorts review theater</h1>
      <p>Watch candidates, compare hooks and cadence, then record structured decisions. This is local review evidence only, not approval or publication truth.</p>
      <div class="stats">
        <span class="pill">{theater['candidateCount']} candidates</span>
        <span class="pill">{theater['reviewedCount']} reviewed</span>
        <span class="pill">{theater['pendingCount']} pending</span>
        <span class="pill">Episode {html.escape(str(theater.get('episode')))}</span>
        <span class="pill">{html.escape(str(theater.get('sourceVersion')))} -> {html.escape(str(theater.get('targetVersion')))}</span>
      </div>
    </section>
    <section class="panel review-cockpit">
      <p class="eyebrow">Review cockpit</p>
      <h2>Pick a short, watch it, then record why</h2>
      <p>This page is read-only. Copying a command does not record a decision until the command is run through Studio tooling.</p>
      <div class="jump-grid">{candidate_nav}</div>
    </section>
    <section class="panel">
      <p class="eyebrow">What to judge</p>
      <div class="field-grid">{fields}</div>
    </section>
    {candidate_html}
  </main>
  <script>
    document.querySelectorAll('[data-copy-command]').forEach((button) => {{
      button.addEventListener('click', async () => {{
        const command = button.getAttribute('data-copy-command') || '';
        const status = button.parentElement?.querySelector('.copy-status');
        try {{
          await navigator.clipboard.writeText(command);
          if (status) status.textContent = 'copied';
        }} catch (error) {{
          if (status) status.textContent = 'copy failed; select the command text';
        }}
      }});
    }});
  </script>
</body>
</html>
"""


def render_candidate_html(candidate: dict[str, Any]) -> str:
    poster_uri = ""
    for frame in candidate.get("frames", []):
        if frame.get("label") == "middle":
            poster_uri = str(frame.get("uri") or "")
            break
    if not poster_uri and candidate.get("frames"):
        poster_uri = str(candidate["frames"][0].get("uri") or "")
    frames = "\n".join(
        f"""
        <figure>
          <img src="{html.escape(str(frame.get('uri') or ''))}" alt="{html.escape(candidate['title'])} {html.escape(str(frame.get('label') or 'frame'))}">
          <figcaption>{html.escape(str(frame.get('label') or 'frame'))}</figcaption>
        </figure>
        """
        for frame in candidate.get("frames", [])
    )
    decision = candidate.get("decision") or {}
    if decision:
        decision_html = f"""
        <div class="decision">
          <strong>Decision:</strong> {html.escape(str(decision.get('outcome')))} by {html.escape(str(decision.get('reviewer')))}
          <p>{html.escape(str(decision.get('notes') or ''))}</p>
        </div>
        """
    else:
        decision_html = '<div class="no-decision"><strong>Decision:</strong> pending</div>'
    return f"""
    <article class="candidate" id="candidate-{int(candidate['index']):02d}">
      <div class="candidate-grid">
        <div>
          <p class="eyebrow">Candidate {int(candidate['index']):02d}</p>
          <h2>{html.escape(candidate['title'])}</h2>
          <p>{html.escape(str(candidate.get('reviewHint') or 'Review the short before deciding.'))}</p>
          <div class="stats">
            <span class="pill">{html.escape(str(candidate.get('durationSeconds')))}s</span>
            <span class="pill">{html.escape(str(candidate.get('durationBucket')))}</span>
            <span class="pill">{html.escape(str(candidate.get('aspect')))}</span>
          </div>
          <div class="frames">{frames}</div>
          {decision_html}
        </div>
        <div>
          <video controls preload="metadata" src="{html.escape(candidate.get('sourceUri') or '')}" poster="{html.escape(poster_uri)}"></video>
          <h3>Record structured refinement</h3>
          <code>{html.escape(candidate['commands']['structured_refine'])}</code>
          <button class="copy-command" data-copy-command="{html.escape(candidate['commands']['structured_refine'], quote=True)}">Copy structured refine command</button><span class="copy-status"></span>
        </div>
      </div>
    </article>
    """


def write_outputs(theater: dict[str, Any], output_dir: Path, basename: str, fmt: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if fmt in {"json", "all"}:
        (output_dir / f"{basename}.json").write_text(json.dumps(theater, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fmt in {"markdown", "all"}:
        (output_dir / f"{basename}.md").write_text(render_markdown(theater), encoding="utf-8")
    if fmt in {"html", "all"}:
        (output_dir / f"{basename}.html").write_text(render_html(theater), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a batch theater for carry-forward short review.")
    parser.add_argument("--workorder", default=str(DEFAULT_WORKORDER), help="Carry-forward workorder JSON.")
    parser.add_argument("--contact-sheet-dir", default="", help="Contact sheet folder. Defaults beside the workorder.")
    parser.add_argument("--output-dir", default="", help="Output folder. Defaults beside the workorder.")
    parser.add_argument("--basename", default="episode-01-v004-carryforward-shorts-review-theater")
    parser.add_argument("--reviewer", default="Mako")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    args = parser.parse_args()

    workorder_path = Path(args.workorder).expanduser()
    contact_sheet_dir = Path(args.contact_sheet_dir).expanduser() if args.contact_sheet_dir else contact_sheet_dir_for(workorder_path)
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else output_dir_for(workorder_path)
    theater = build_theater(workorder_path, contact_sheet_dir, args.reviewer)
    write_outputs(theater, output_dir, args.basename, args.format)

    if args.format == "json":
        print(json.dumps(theater, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(theater), end="")
    else:
        print(render_markdown(theater), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
