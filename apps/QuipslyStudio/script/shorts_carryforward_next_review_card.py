#!/usr/bin/env python3
"""Build a focused review card for the next carry-forward short candidate.

This reads the review summary produced by shorts_carryforward_record_review.py
and creates one human/agent review card for the recommended next candidate. It
does not mutate media, approve a candidate, export a native short, or publish.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SUMMARY = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_01/v004/"
    "shorts-carryforward-review/episode-01-v004-shorts-realignment-workorder-review-decisions-summary.json"
)


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


def default_contact_sheet_dir(summary_path: Path) -> Path:
    return summary_path.parent / "contact-sheet"


def frame_files(contact_sheet_dir: Path, index: int) -> list[Path]:
    frames_dir = contact_sheet_dir / "frames"
    if not frames_dir.exists():
        return []
    order = {"start": 0, "middle": 1, "end": 2}

    def sort_key(path: Path) -> tuple[int, str]:
        label = path.stem.rsplit("-", 1)[-1]
        return (order.get(label, 99), path.name)

    return sorted(frames_dir.glob(f"{index:02d}-*.jpg"), key=sort_key)


def build_card(summary_path: Path, contact_sheet_dir: Path) -> dict[str, Any]:
    summary = read_json(summary_path)
    candidate = summary.get("nextCandidate")
    if not isinstance(candidate, dict) or not candidate:
        return {
            "model": "quipsly-studio-shorts-carryforward-next-review-card",
            "version": "2026-07-02.v3",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "no-pending-candidate",
            "sourceSummary": str(summary_path),
            "truth": "No pending candidate found in the review summary.",
        }
    index = int(candidate.get("index") or 0)
    frames = [
        {
            "path": str(path),
            "uri": file_uri(str(path)),
            "label": path.stem.rsplit("-", 1)[-1],
        }
        for path in frame_files(contact_sheet_dir, index)
    ]
    return {
        "model": "quipsly-studio-shorts-carryforward-next-review-card",
        "version": "2026-07-02.v3",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "needs-review",
        "sourceSummary": str(summary_path),
        "contactSheetDir": str(contact_sheet_dir),
        "episode": summary.get("episode"),
        "sourceVersion": summary.get("sourceVersion"),
        "targetVersion": summary.get("targetVersion"),
        "candidate": candidate,
        "frames": frames,
        "reviewChecks": [
            "Watch the full candidate before recording a decision.",
            "Confirm the hook starts on a complete thought, breath, or intentional cold open.",
            "Confirm the ending resolves cleanly without feeling chopped.",
            "Check 9:16 framing for faces, gestures, and caption safety.",
            "Listen for human cadence, not just tightness.",
            "Record accept, refine, reject, or hold with a short note.",
        ],
        "structuredReviewFields": [
            {
                "key": "hook",
                "label": "Hook",
                "prompt": "Does the first moment earn attention without feeling clickbait or chopped?",
            },
            {
                "key": "pacing",
                "label": "Pacing",
                "prompt": "Does the short feel human, tight, and alive rather than over-cleaned?",
            },
            {
                "key": "framing",
                "label": "9:16 framing",
                "prompt": "Are faces, gestures, and key visuals safely framed for vertical platforms?",
            },
            {
                "key": "captions",
                "label": "Captions",
                "prompt": "Would captions support comprehension without covering faces or the key visual?",
            },
            {
                "key": "audio",
                "label": "Audio and cadence",
                "prompt": "Does the voice rhythm sound natural, clear, and emotionally intact?",
            },
            {
                "key": "ending",
                "label": "Ending",
                "prompt": "Does the final beat resolve, invite curiosity, or clearly need refinement?",
            },
            {
                "key": "platform_fit",
                "label": "Platform fit",
                "prompt": "Where does this belong: YouTube Shorts, Instagram, Facebook, LinkedIn, Patreon, or nowhere yet?",
            },
            {
                "key": "risk",
                "label": "Risk",
                "prompt": "What could make this candidate confusing, off-voice, weak, or mistimed against the target version?",
            },
            {
                "key": "tradeoff",
                "label": "Tradeoff",
                "prompt": "What creative tradeoff are we accepting or rejecting?",
            },
        ],
        "commands": {
            "accept": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome accept --reviewer Mako --note \"Works against v004\"",
            "refine": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome refine --reviewer Mako --note \"Good idea, needs timing/framing/caption/audio adjustment\"",
            "reject": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome reject --reviewer Mako --note \"Not useful for v004\"",
            "hold": f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome hold --reviewer Mako --note \"Needs Charlie decision\"",
            "structured_refine": candidate.get("suggestedStructuredCommand")
            or f"script/agentctl.sh shorts-carryforward-record-review --index {index} --outcome refine --reviewer Mako --note \"Reviewed against v004; record creative reason before promotion\" --hook-note \"\" --pacing-note \"\" --framing-note \"\" --caption-note \"\" --audio-note \"\" --ending-note \"\" --platform-fit-note \"\" --risk-note \"carry-forward timing may drift from the target version\" --tradeoff-note \"\" --confidence needs-human-review",
        },
        "truth": "Focused review card only. This is not an editorial decision, approval, native export, publication, or receipt.",
    }


def render_markdown(card: dict[str, Any]) -> str:
    if card.get("status") == "no-pending-candidate":
        return "# Next carry-forward short review card\n\nNo pending candidate found.\n"
    candidate = card["candidate"]
    lines = [
        "# Next carry-forward short review card",
        "",
        f"Generated: `{card['generatedAt']}`",
        f"Episode: `{card.get('episode')}`",
        f"Source version: `{card.get('sourceVersion')}`",
        f"Target version: `{card.get('targetVersion')}`",
        "",
        "> Truth: focused review card only. It is not approval, export, publication, or receipt truth.",
        "",
        f"## Candidate {int(candidate.get('index') or 0):02d}: {candidate.get('title')}",
        "",
        f"- Duration: `{candidate.get('durationSeconds')}s`",
        f"- Bucket: `{candidate.get('durationBucket')}`",
        f"- Aspect: `{candidate.get('aspect')}`",
        f"- Source path: `{candidate.get('sourcePath')}`",
        f"- Review hint: {candidate.get('reviewHint')}",
        f"- Source URI: `{file_uri(str(candidate.get('sourcePath') or ''))}`",
        "",
        "## Watch first",
        "",
        "Open or preview the source short before recording an outcome. The frames below are navigation aids, not enough evidence by themselves.",
        "",
        "## Frames",
        "",
    ]
    for frame in card.get("frames", []):
        lines.append(f"- `{frame.get('label')}`: `{frame.get('path')}`")
    lines.extend(["", "## Checks", ""])
    for check in card["reviewChecks"]:
        lines.append(f"- {check}")
    lines.extend(["", "## Structured creative review fields", ""])
    for field in card.get("structuredReviewFields", []):
        lines.append(f"- **{field.get('label')}**: {field.get('prompt')}")
    lines.extend(["", "## Record a decision", ""])
    for outcome, command in card["commands"].items():
        lines.append(f"- `{outcome}`: `{command}`")
    lines.append("")
    return "\n".join(lines)


def render_html(card: dict[str, Any]) -> str:
    if card.get("status") == "no-pending-candidate":
        body = "<h1>No pending carry-forward short candidate</h1>"
    else:
        candidate = card["candidate"]
        frame_html = "\n".join(
            f"""
            <figure>
              <img src="{html.escape(frame.get('uri', ''))}" alt="{html.escape(candidate.get('title', 'candidate'))} {html.escape(frame.get('label', 'frame'))}">
              <figcaption>{html.escape(frame.get('label', 'frame'))}</figcaption>
            </figure>
            """
            for frame in card.get("frames", [])
        )
        checks = "\n".join(f"<li>{html.escape(check)}</li>" for check in card["reviewChecks"])
        fields = "\n".join(
            f"""
            <article class="field-card">
              <h3>{html.escape(str(field.get('label', 'Review field')))}</h3>
              <p>{html.escape(str(field.get('prompt', 'Record what matters for this dimension.')))}</p>
            </article>
            """
            for field in card.get("structuredReviewFields", [])
        )
        commands = "\n".join(
            f"<code>{html.escape(outcome)}: {html.escape(command)}</code>"
            for outcome, command in card["commands"].items()
        )
        source_uri = file_uri(str(candidate.get("sourcePath") or ""))
        poster_uri = ""
        for frame in card.get("frames", []):
            if frame.get("label") == "middle":
                poster_uri = str(frame.get("uri") or "")
                break
        if not poster_uri and card.get("frames"):
            poster_uri = str(card["frames"][0].get("uri") or "")
        body = f"""
        <section class="hero">
          <p class="eyebrow">Quipsly Studio next review bite</p>
          <h1>Candidate {int(candidate.get('index') or 0):02d}: {html.escape(candidate.get('title', 'Untitled'))}</h1>
          <p>{html.escape(candidate.get('reviewHint', 'Review hook, pacing, captions, and ending.'))}</p>
          <div class="facts">
            <span>{html.escape(str(candidate.get('durationSeconds')))}s</span>
            <span>{html.escape(str(candidate.get('durationBucket')))}</span>
            <span>{html.escape(str(candidate.get('aspect')))}</span>
            <a href="{html.escape(source_uri)}">Open source short</a>
          </div>
        </section>
        <section class="video-panel">
          <div>
            <p class="eyebrow">Watch first</p>
            <h2>Review the moving short, not just the metadata</h2>
            <p>Use the frame strip as orientation, but record a decision only after watching the whole candidate for hook, rhythm, framing, captions, audio, and ending.</p>
          </div>
          <video controls preload="metadata" src="{html.escape(source_uri)}" poster="{html.escape(poster_uri)}"></video>
        </section>
        <section class="frames">{frame_html}</section>
        <section class="panel">
          <h2>Review checks</h2>
          <ul>{checks}</ul>
        </section>
        <section class="panel">
          <h2>Creative review fields</h2>
          <div class="field-grid">{fields}</div>
        </section>
        <section class="panel">
          <h2>Record a decision</h2>
          <div class="commands">{commands}</div>
        </section>
        """
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly next short review card</title>
  <style>
    :root {{
      color-scheme: dark;
      --bark: #211813;
      --moss: #75945d;
      --fern: #c8e4a0;
      --honey: #edc45c;
      --cream: #fff7df;
      --line: rgba(255, 247, 223, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--cream);
      background:
        radial-gradient(circle at 15% 10%, rgba(117, 148, 93, 0.34), transparent 26rem),
        radial-gradient(circle at 95% 0%, rgba(237, 196, 92, 0.18), transparent 22rem),
        linear-gradient(135deg, #111a13, var(--bark));
    }}
    main {{ width: min(1160px, calc(100vw - 40px)); margin: 0 auto; padding: 38px 0 80px; }}
    .hero, .panel {{ border: 1px solid var(--line); border-radius: 28px; background: rgba(255, 247, 223, 0.07); padding: 26px; margin-bottom: 18px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 900; font-size: 0.78rem; }}
    h1 {{ margin: 0; font-size: clamp(2rem, 5vw, 4.1rem); line-height: 0.95; }}
    h2 {{ margin-top: 0; }}
    p, li {{ color: #eadfc7; }}
    .facts {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; align-items: center; }}
    .facts span, .facts a {{ border: 1px solid rgba(200, 228, 160, 0.24); border-radius: 999px; padding: 8px 12px; color: var(--fern); background: rgba(117, 148, 93, 0.12); font-weight: 800; text-decoration: none; }}
    .frames {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-bottom: 18px; }}
    .video-panel {{ display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(280px, 0.45fr); gap: 18px; align-items: center; border: 1px solid var(--line); border-radius: 28px; background: rgba(0, 0, 0, 0.22); padding: 18px; margin-bottom: 18px; }}
    .video-panel video {{ width: 100%; max-height: 520px; border-radius: 24px; background: #050504; border: 1px solid rgba(237, 196, 92, 0.24); box-shadow: 0 22px 60px rgba(0, 0, 0, 0.34); }}
    figure {{ margin: 0; border: 1px solid var(--line); border-radius: 22px; padding: 10px; background: rgba(0, 0, 0, 0.18); }}
    img {{ display: block; width: 100%; border-radius: 16px; }}
    figcaption {{ margin-top: 6px; color: var(--fern); font-weight: 800; }}
    .field-grid {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }}
    .field-card {{ border: 1px solid rgba(200, 228, 160, 0.18); border-radius: 18px; padding: 14px; background: rgba(0, 0, 0, 0.18); }}
    .field-card h3 {{ margin: 0 0 6px; color: var(--honey); }}
    .field-card p {{ margin: 0; }}
    .commands {{ display: grid; gap: 10px; }}
    code {{ display: block; padding: 12px; border-radius: 14px; background: rgba(0, 0, 0, 0.35); color: #ffe8a3; overflow-x: auto; }}
    @media (max-width: 900px) {{ .video-panel {{ grid-template-columns: 1fr; }} }}
    @media (max-width: 760px) {{ .frames, .field-grid {{ grid-template-columns: 1fr; }} main {{ width: min(100vw - 24px, 720px); }} }}
  </style>
</head>
<body>
  <main>{body}</main>
</body>
</html>
"""


def default_output_dir(summary_path: Path) -> Path:
    return summary_path.parent / "next-review-card"


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a focused next-candidate carry-forward short review card.")
    parser.add_argument("--summary", default=str(DEFAULT_SUMMARY), help="Carry-forward review summary JSON.")
    parser.add_argument("--contact-sheet-dir", default="", help="Contact sheet directory. Defaults beside the summary.")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults beside the summary.")
    parser.add_argument("--basename", default="episode-01-v004-next-carryforward-short-review-card")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    args = parser.parse_args()

    summary_path = Path(args.summary).expanduser()
    contact_sheet_dir = Path(args.contact_sheet_dir).expanduser() if args.contact_sheet_dir else default_contact_sheet_dir(summary_path)
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else default_output_dir(summary_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    card = build_card(summary_path, contact_sheet_dir)

    if args.format in {"json", "all"}:
        (output_dir / f"{args.basename}.json").write_text(json.dumps(card, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.format in {"markdown", "all"}:
        (output_dir / f"{args.basename}.md").write_text(render_markdown(card), encoding="utf-8")
    if args.format in {"html", "all"}:
        (output_dir / f"{args.basename}.html").write_text(render_html(card), encoding="utf-8")

    if args.format == "json":
        print(json.dumps(card, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(card), end="")
    else:
        print(render_markdown(card), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
