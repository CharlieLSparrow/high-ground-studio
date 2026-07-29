#!/usr/bin/env python3
"""Build an Episode 4 host-spine duration workbench.

This is the source-placeholder-aware duration planning layer for Episode 4. It
uses the transcript spine, edit-intelligence proposals, and source-placeholder
workbench to create reviewable duration recipes over one intact episode spine.

Safety boundary: sidecar planning artifacts only. This command never imports
clips, writes timeline/session state, creates shorts, renders exports, publishes,
uploads, deletes, overwrites previous versions, or mutates source media.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SPINE_POINTER = RELEASE_ROOT / "review-board/transcript-spines/latest-episode-04-transcript-spine.json"
EDIT_POINTER = RELEASE_ROOT / "review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
PLACEHOLDER_POINTER = RELEASE_ROOT / "review-board/episode4-source-placeholder-workbench/latest-episode4-source-placeholder-workbench.json"
OUT_ROOT = RELEASE_ROOT / "review-board/episode4-host-spine-duration-workbench"
LATEST_POINTER = OUT_ROOT / "latest-episode4-host-spine-duration-workbench.json"
SCHEMA = "quipsly.episode4-host-spine-duration-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-host-spine-duration-workbench")


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = pointer.get("jsonPath")
    if isinstance(target, str) and target:
        payload = load_json(Path(target))
        if payload:
            return {**pointer, **payload, "pointerPath": str(path)}
    return {**pointer, "pointerPath": str(path)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def dict_list(value: Any) -> list[dict[str, Any]]:
    return value if isinstance(value, list) and all(isinstance(item, dict) for item in value) else []


def as_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return fallback


def fmt_time(seconds: Any) -> str:
    value = max(0.0, as_float(seconds))
    whole = int(value)
    return f"{whole // 3600:02d}:{(whole % 3600) // 60:02d}:{whole % 60:02d}"


def truth() -> dict[str, Any]:
    return {
        "sidecarPlanningArtifactsOnly": True,
        "sourceFilesReadOnly": True,
        "sourceFilesMutated": False,
        "clipsImported": False,
        "timelineDecisionsWritten": False,
        "shortsCreated": False,
        "finalExportsRendered": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
        "filesDeleted": False,
    }


def duration_seconds(spine: dict[str, Any]) -> float:
    counts = spine.get("counts") if isinstance(spine.get("counts"), dict) else {}
    return as_float(counts.get("durationSeconds") or spine.get("durationSeconds"))


def compression(duration: float, low_minutes: float | None = None, high_minutes: float | None = None, seconds: list[int] | None = None) -> dict[str, Any]:
    if seconds:
        values = [float(value) for value in seconds]
        low = min(values)
        high = max(values)
        label = "/".join(str(value) for value in seconds) + " sec"
    else:
        low = float(low_minutes or 0) * 60
        high = float(high_minutes or low_minutes or 0) * 60
        label = f"{low_minutes:g}-{high_minutes:g} min" if high_minutes and high_minutes != low_minutes else f"{low_minutes:g} min"
    if duration <= 0 or low <= 0:
        return {"targetLabel": label, "targetSecondsRange": [low, high], "keepPercentRange": [], "removePercentRange": [], "cutPressure": "unknown"}
    keep_low = max(0.0, min(1.0, low / duration))
    keep_high = max(0.0, min(1.0, high / duration))
    center = (keep_low + keep_high) / 2
    pressure = "light" if center >= 0.7 else "medium" if center >= 0.45 else "heavy" if center >= 0.20 else "short-form"
    return {
        "targetLabel": label,
        "targetSecondsRange": [round(low, 3), round(high, 3)],
        "keepPercentRange": [round(keep_low * 100, 1), round(keep_high * 100, 1)],
        "removePercentRange": [round((1 - keep_high) * 100, 1), round((1 - keep_low) * 100, 1)],
        "cutPressure": pressure,
    }


def top_ranges(rows: list[dict[str, Any]], limit: int = 5) -> list[dict[str, Any]]:
    out = []
    for row in rows[:limit]:
        out.append({
            "id": row.get("id"),
            "timeLabel": row.get("timeLabel"),
            "startSeconds": row.get("startSeconds"),
            "endSeconds": row.get("endSeconds"),
            "confidence": row.get("confidence"),
            "summary": row.get("summary") or row.get("explanation") or row.get("intent"),
            "tradeoff": row.get("tradeoff"),
        })
    return out


def make_recipe(
    variant_id: str,
    label: str,
    target: dict[str, Any],
    duration: float,
    edit: dict[str, Any],
    placeholders: list[dict[str, Any]],
) -> dict[str, Any]:
    shorts = dict_list(edit.get("shortCandidates"))
    cadence = dict_list(edit.get("cadenceCandidates"))
    reactions = dict_list(edit.get("reactionCoverCandidates"))
    clip_weave = dict_list(edit.get("clipWeaveWorkorders"))
    placeholder_count = len(placeholders)
    pressure = target.get("cutPressure")
    if variant_id == "full-review":
        purpose = "A generous internal review cut that proves sync, sequence truth, and obvious-reset cleanup without over-tightening the human flow."
        safe_now = [
            "Remove technical resets, duplicate setup, and obvious dead air.",
            "Keep reflective pauses and relationship texture unless review proves they are accidental drift.",
            "Leave source placeholders visible where watched clips belong.",
        ]
        not_yet = ["Do not call this publication-ready until source placeholders are resolved or explicitly deferred."]
    elif variant_id == "youtube-standard":
        purpose = "Primary public long-form candidate: clear enough for YouTube while still feeling like a real conversation."
        safe_now = [
            "Shape the opening promise quickly.",
            "Use reaction-cover candidates to soften harsh same-speaker jumps.",
            "Trim repeated explanations before trimming personality.",
        ]
        not_yet = ["Do not use missing watched clips as if they are included; keep them as placeholder cards."]
    elif variant_id == "tight-feature":
        purpose = "Focused 22-30 minute feature cut with one thesis arc and stronger viewer-retention pressure."
        safe_now = [
            "Choose one thesis arc and move side arcs into shorts or notes.",
            "Audit every large deletion for speaker fairness and cadence damage.",
            "Prefer fewer, stronger clip inserts once source media exists.",
        ]
        not_yet = ["Do not flatten uncertainty or warmth just to hit the target runtime."]
    elif variant_id == "clip-weave-proof":
        purpose = "8-12 minute proof section around the watched-clip moment: host setup, source placeholder, reaction return, and meaning."
        safe_now = [
            "Build the host setup/reaction shell around the placeholder cue.",
            "Mark the exact missing media slot and intended J/L-cut behavior.",
            "Review cue audio before deciding how much setup/reaction to preserve.",
        ]
        not_yet = ["Do not write the real clip insert until source intake finds a cue-matched file."]
    else:
        purpose = "Shorts family: separate 30/45/60/90 second recipes, each with its own hook and payoff."
        safe_now = [
            "Use top short candidates as review ranges, not automatic exports.",
            "Keep captions face-safe and hook-first.",
            "Create separate duration variants instead of mechanically trimming one endpoint.",
        ]
        not_yet = ["Do not export platform-ready shorts until visual framing and transcript/captions are reviewed."]

    return {
        "id": f"ep4-host-spine-{variant_id}",
        "label": label,
        "status": "ready-for-host-spine-review" if variant_id != "clip-weave-proof" or placeholder_count else "needs-source-placeholder",
        "target": target,
        "purpose": purpose,
        "sourceModel": "one-intact-episode-spine-with-transparent-metadata-decisions",
        "sequenceDurationSeconds": duration,
        "sourcePlaceholderCount": placeholder_count,
        "cutPressure": pressure,
        "candidateEvidence": {
            "shortCandidates": top_ranges(shorts, 4),
            "cadenceCandidates": top_ranges(cadence, 4),
            "reactionCoverCandidates": top_ranges(reactions, 4),
            "clipWeaveWorkorders": top_ranges(clip_weave, 4),
            "sourcePlaceholders": [
                {
                    "cueId": item.get("cueId"),
                    "timeLabel": item.get("timeLabel"),
                    "suggestedFilename": item.get("suggestedFilename"),
                    "jCutHint": item.get("jCutHint"),
                    "lCutHint": item.get("lCutHint"),
                    "audioReviewClipPath": (item.get("cueReview") or {}).get("audioReviewClipPath") if isinstance(item.get("cueReview"), dict) else "",
                }
                for item in placeholders[:4]
            ],
        },
        "safeNow": safe_now,
        "notAllowedYet": not_yet,
        "humanFeelingCutRules": [
            "Cut technical waste before cutting human breath.",
            "Prefer reaction covers where a jump cut would feel like a glitch rather than a choice.",
            "Use J-cuts and L-cuts only when they make the idea arrive more naturally by ear.",
            "Preserve pauses that signal thought, emotional reset, laughter, or relationship warmth.",
            "If the transcript-only reason is strong but visual proof is unknown, mark review-needed rather than applying blindly.",
        ],
        "reviewQuestions": [
            "Does the cut still sound like Charlie and Homer, or like the editor sanded off the people?",
            "Does this duration have its own reason to exist?",
            "Did we remove confusion, or did we remove useful context?",
            "Are source placeholders visible enough that no one mistakes the draft for complete?",
        ],
        "nextAgentMove": "Create or refine metadata-only SHOW/SKIP/review-note decisions for this branch; do not render or publish.",
    }


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    spine = load_pointer(Path(args.spine_pointer))
    edit = load_pointer(Path(args.edit_pointer))
    placeholder = load_pointer(Path(args.placeholder_pointer))
    duration = duration_seconds(spine)
    placeholders = dict_list(placeholder.get("items"))
    counts = spine.get("counts") if isinstance(spine.get("counts"), dict) else {}
    edit_counts = edit.get("counts") if isinstance(edit.get("counts"), dict) else {}
    variants = [
        make_recipe("full-review", "Full review 75-90", compression(duration, 75, 90), duration, edit, placeholders),
        make_recipe("youtube-standard", "YouTube standard 35-45", compression(duration, 35, 45), duration, edit, placeholders),
        make_recipe("tight-feature", "Tight feature 22-30", compression(duration, 22, 30), duration, edit, placeholders),
        make_recipe("clip-weave-proof", "Clip-weave proof 8-12", compression(duration, 8, 12), duration, edit, placeholders),
        make_recipe("shorts-family", "Shorts family 30/45/60/90", compression(duration, seconds=[30, 45, 60, 90]), duration, edit, placeholders),
    ]
    session_dir = Path(args.out_root) / stamp()
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "episode4-host-spine-duration-workbench-ready" if duration > 0 else "episode4-host-spine-duration-workbench-needs-spine",
        "episode": 4,
        "episodeLabel": "Episode 4",
        "sessionDir": str(session_dir),
        "sourcePointers": {
            "transcriptSpine": str(args.spine_pointer),
            "editIntelligence": str(args.edit_pointer),
            "sourcePlaceholderWorkbench": str(args.placeholder_pointer),
        },
        "spine": {
            "durationSeconds": duration,
            "durationLabel": counts.get("durationLabel") or fmt_time(duration),
            "segments": counts.get("segments"),
            "words": counts.get("words"),
            "sourceChunks": counts.get("sourceChunks"),
            "speakerStatus": "placeholder-needs-review",
        },
        "editIntelligenceCounts": edit_counts,
        "sourcePlaceholderCounts": placeholder.get("counts") if isinstance(placeholder.get("counts"), dict) else {},
        "variantCount": len(variants),
        "variants": variants,
        "nextSafestAction": "Pick one host-spine duration recipe, then make metadata-only review decisions over the intact Episode 4 spine.",
        "truth": truth(),
    }
    write_surfaces(session_dir, packet, Path(args.latest_pointer))
    return packet


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 host-spine duration workbench",
        "",
        f"Status: `{packet.get('status')}`",
        f"Generated: `{packet.get('generatedAt')}`",
        "",
        "Duration recipes over one intact Episode 4 spine. No media is chopped, rendered, or published.",
        "",
        f"Spine: `{(packet.get('spine') or {}).get('durationLabel')}` · `{(packet.get('spine') or {}).get('segments')}` segments · `{(packet.get('spine') or {}).get('words')}` words",
        f"Next: {packet.get('nextSafestAction')}",
        "",
    ]
    for variant in packet.get("variants") or []:
        target = variant.get("target") if isinstance(variant.get("target"), dict) else {}
        lines += [
            f"## {variant.get('label')}",
            "",
            f"- Status: `{variant.get('status')}`",
            f"- Target: `{target.get('targetLabel')}`",
            f"- Cut pressure: `{variant.get('cutPressure')}`",
            f"- Purpose: {variant.get('purpose')}",
            f"- Keep percent: `{target.get('keepPercentRange')}`",
            f"- Remove percent: `{target.get('removePercentRange')}`",
            f"- Source placeholders: `{variant.get('sourcePlaceholderCount')}`",
            "",
            "### Safe now",
        ]
        lines += [f"- {item}" for item in variant.get("safeNow") or []]
        lines += ["", "### Not allowed yet"]
        lines += [f"- {item}" for item in variant.get("notAllowedYet") or []]
        lines += ["", "### Human-feeling cut rules"]
        lines += [f"- {item}" for item in variant.get("humanFeelingCutRules") or []]
        evidence = variant.get("candidateEvidence") if isinstance(variant.get("candidateEvidence"), dict) else {}
        if evidence.get("sourcePlaceholders"):
            lines += ["", "### Source placeholders"]
            for item in evidence.get("sourcePlaceholders") or []:
                lines.append(f"- `{item.get('cueId')}` {item.get('timeLabel')} · `{item.get('suggestedFilename')}`")
        if evidence.get("shortCandidates"):
            lines += ["", "### Top short candidates"]
            for item in evidence.get("shortCandidates") or []:
                lines.append(f"- `{item.get('id')}` {item.get('timeLabel')} · {item.get('summary')}")
    return "\n".join(lines).rstrip() + "\n"


def render_html(packet: dict[str, Any]) -> str:
    spine = packet.get("spine") if isinstance(packet.get("spine"), dict) else {}
    cards = []
    for variant in packet.get("variants") or []:
        target = variant.get("target") if isinstance(variant.get("target"), dict) else {}
        evidence = variant.get("candidateEvidence") if isinstance(variant.get("candidateEvidence"), dict) else {}
        safe = "".join(f"<li>{esc(item)}</li>" for item in variant.get("safeNow") or [])
        no = "".join(f"<li>{esc(item)}</li>" for item in variant.get("notAllowedYet") or [])
        rules = "".join(f"<li>{esc(item)}</li>" for item in variant.get("humanFeelingCutRules") or [])
        shorts = "".join(f"<li><code>{esc(item.get('id'))}</code> {esc(item.get('timeLabel'))} · {esc(item.get('summary'))}</li>" for item in evidence.get("shortCandidates") or [])
        placeholders = "".join(f"<li><code>{esc(item.get('cueId'))}</code> {esc(item.get('timeLabel'))} · <code>{esc(item.get('suggestedFilename'))}</code></li>" for item in evidence.get("sourcePlaceholders") or [])
        cards.append(f"""
        <article class="card">
          <p class="eyebrow">{esc(variant.get('status'))} · {esc(variant.get('cutPressure'))}</p>
          <h2>{esc(variant.get('label'))} <span>{esc(target.get('targetLabel'))}</span></h2>
          <p>{esc(variant.get('purpose'))}</p>
          <div class="metrics">
            <div><strong>{esc(target.get('keepPercentRange'))}</strong><span>keep %</span></div>
            <div><strong>{esc(target.get('removePercentRange'))}</strong><span>remove %</span></div>
            <div><strong>{esc(variant.get('sourcePlaceholderCount'))}</strong><span>source placeholders</span></div>
          </div>
          <div class="columns"><section><h3>Safe now</h3><ul>{safe}</ul></section><section><h3>Not allowed yet</h3><ul>{no}</ul></section></div>
          <section><h3>Human-feeling cut rules</h3><ul>{rules}</ul></section>
          <div class="columns"><section><h3>Source placeholders</h3><ul>{placeholders or '<li>None active.</li>'}</ul></section><section><h3>Top short candidates</h3><ul>{shorts or '<li>No candidates loaded.</li>'}</ul></section></div>
        </article>
        """)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Episode 4 Host-Spine Duration Workbench</title><style>
    body {{ margin:0; background:#121812; color:#f6edcf; font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }}
    main {{ max-width:1180px; margin:0 auto; padding:42px 24px 72px; }}
    header,.card {{ border:1px solid rgba(240,189,79,.28); border-radius:26px; padding:24px; background:linear-gradient(135deg,rgba(36,55,38,.95),rgba(23,28,23,.98)); box-shadow:0 20px 60px rgba(0,0,0,.30); margin:16px 0; }}
    .eyebrow {{ color:#f0bd4f; text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
    h1 {{ margin:0; font-family:Georgia,serif; font-size:clamp(40px,6vw,72px); line-height:.92; }} h2 {{ font-family:Georgia,serif; font-size:30px; }} h2 span {{ color:#a9b69a; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:16px; }}
    p,li {{ color:#d4c9ad; line-height:1.55; }} code {{ color:#ffe28a; }} h3 {{ color:#f0bd4f; }}
    .metrics,.columns {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }} .metrics div,section {{ border-radius:18px; background:rgba(255,255,255,.06); padding:14px; }} .metrics strong {{ display:block; color:#ffe28a; font-size:22px; }}
    </style></head><body><main><header><p class="eyebrow">Quipsly Studio · Episode 4</p><h1>Duration recipes over one living spine.</h1><p>Plan multiple Episode 4 runtimes without chopping source media. Source placeholders stay visible until watched clips are recovered.</p><div class="metrics"><div><strong>{esc(spine.get('durationLabel'))}</strong><span>spine duration</span></div><div><strong>{esc(spine.get('segments'))}</strong><span>segments</span></div><div><strong>{esc(spine.get('words'))}</strong><span>words</span></div><div><strong>{esc(packet.get('variantCount'))}</strong><span>duration recipes</span></div></div><p><strong>Next:</strong> {esc(packet.get('nextSafestAction'))}</p></header>{''.join(cards)}</main></body></html>"""


def write_surfaces(session_dir: Path, packet: dict[str, Any], latest_pointer: Path) -> None:
    json_path = session_dir / "episode4-host-spine-duration-workbench.json"
    markdown_path = session_dir / "episode4-host-spine-duration-workbench.md"
    html_path = session_dir / "index.html"
    packet.update({"jsonPath": str(json_path), "markdownPath": str(markdown_path), "htmlPath": str(html_path)})
    write_json(json_path, packet)
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_json(latest_pointer, {
        "schema": "quipsly.episode4-host-spine-duration-workbench-pointer.v1",
        "generatedAt": iso_now(),
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "variantCount": packet.get("variantCount"),
        "spine": packet.get("spine"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "truth": packet.get("truth"),
    })


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spine-pointer", default=str(SPINE_POINTER))
    parser.add_argument("--edit-pointer", default=str(EDIT_POINTER))
    parser.add_argument("--placeholder-pointer", default=str(PLACEHOLDER_POINTER))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--latest-pointer", default=str(LATEST_POINTER))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    packet = build_packet(args)
    if args.json:
        print(json.dumps(packet, indent=2, sort_keys=True))
        return
    if args.markdown:
        print(render_markdown(packet))
        return
    print(f"Episode 4 host-spine duration workbench: {packet.get('status')}")
    print(f"  Board: {packet.get('htmlPath')}")
    print(f"  Packet: {packet.get('jsonPath')}")
    print(f"  Variants: {packet.get('variantCount')}")
    print(f"  Next: {packet.get('nextSafestAction')}")


if __name__ == "__main__":
    main()
