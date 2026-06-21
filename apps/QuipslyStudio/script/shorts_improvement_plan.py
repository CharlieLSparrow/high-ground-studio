#!/usr/bin/env python3
"""Create an actionable improvement plan for short-form candidates.

This is the bridge from "ranked candidate" to "what should Codex or a human
actually improve next?" It proposes edits and packaging work, but does not
mutate Studio state by itself.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

from shorts_board_common import esc, write_json, write_text
from shorts_growth_quality_board import build_board as build_growth_board
from shorts_platform_package_board import package_cards


def severity_rank(severity: str) -> int:
    return {
        "blocker": 0,
        "high": 1,
        "medium": 2,
        "low": 3,
        "polish": 4,
    }.get(severity, 9)


def action(
    kind: str,
    severity: str,
    label: str,
    why: str,
    command: str = "",
    human_check: str = "",
) -> dict[str, Any]:
    return {
        "kind": kind,
        "severity": severity,
        "label": label,
        "why": why,
        "command": command,
        "humanCheck": human_check,
    }


def export_action(card: dict[str, Any]) -> dict[str, Any] | None:
    commands = card.get("commands") or {}
    if card.get("primaryExportExists"):
        return None
    return action(
        "export",
        "blocker",
        "Export the short locally",
        "We cannot judge hook, crop, pacing, captions, or audio from a queue label. Make a real file first.",
        commands.get("exportLocal") or "",
        "Open the exported file after it finishes.",
    )


def hook_actions(card: dict[str, Any], packaged: dict[str, Any]) -> list[dict[str, Any]]:
    commands = card.get("commands") or {}
    missing = set(card.get("missingQualitySignals") or [])
    score = float((card.get("subscores") or {}).get("hook") or 0)
    variants = packaged.get("hookVariants") or []
    best_variant = variants[0].get("text") if variants else ""
    actions: list[dict[str, Any]] = []
    if "hook" in missing or score < 65:
        actions.append(
            action(
                "hook",
                "high",
                "Replace or sharpen the opening hook",
                "The first second matters. A weak hook makes a technically good short disappear in the feed.",
                commands.get("writeHook") or "",
                f"Try this first: {best_variant}" if best_variant else "Write a direct one-line promise for the clip.",
            )
        )
    elif score < 82:
        actions.append(
            action(
                "hook",
                "medium",
                "Test a stronger hook variant",
                "The hook is usable, but another angle may earn more attention.",
                commands.get("writeHook") or "",
                f"Candidate variant: {best_variant}" if best_variant else "Compare direct, curiosity, and teaching hooks.",
            )
        )
    return actions


def duration_actions(card: dict[str, Any]) -> list[dict[str, Any]]:
    duration = float(card.get("durationSeconds") or 0)
    commands = card.get("commands") or {}
    select = commands.get("select") or ""
    actions: list[dict[str, Any]] = []
    if duration <= 0:
        actions.append(
            action(
                "timing",
                "medium",
                "Confirm short duration",
                "Duration is missing or unreliable, so pacing cannot be scored honestly yet.",
                select,
                "Check the short range in the Studio shorts panel.",
            )
        )
    elif duration > 65:
        actions.append(
            action(
                "timing",
                "high",
                "Tighten the short or split it",
                "Long vertical clips need unusually strong payoff. This candidate is probably trying to do too much.",
                select,
                "Look for the cleanest 20-45 second spine, or split into two shorts.",
            )
        )
    elif duration < 12:
        actions.append(
            action(
                "timing",
                "medium",
                "Check standalone context",
                "Very short clips can work, but only if the hook and context are immediately clear.",
                select,
                "Watch without surrounding context and ask whether the point lands.",
            )
        )
    return actions


def visual_actions(card: dict[str, Any]) -> list[dict[str, Any]]:
    commands = card.get("commands") or {}
    stage = str(card.get("stage") or "")
    score = float((card.get("subscores") or {}).get("visual") or 0)
    actions: list[dict[str, Any]] = []
    if not card.get("primaryExportExists"):
        return actions
    if "visual-review" in stage or score < 72:
        actions.append(
            action(
                "visual",
                "high",
                "Generate visual proof and check safe zones",
                "Shorts need face-safe vertical crop and caption-safe text. Do not publish until the exported frame actually looks right.",
                commands.get("contactSheet") or "",
                "Check headroom, face position, captions/overlays, and platform UI danger zones.",
            )
        )
    if "caption-or-overlay-plan" in set(card.get("missingQualitySignals") or []):
        actions.append(
            action(
                "caption",
                "high",
                "Create a caption or overlay plan",
                "Muted autoplay is normal. The clip needs readable text that does not sit on faces.",
                commands.get("requestCaptionReview") or "",
                "Prefer short text chunks and keep important words out of the lower UI zone.",
            )
        )
    return actions


def audio_actions(card: dict[str, Any]) -> list[dict[str, Any]]:
    commands = card.get("commands") or {}
    stage = str(card.get("stage") or "")
    score = float((card.get("subscores") or {}).get("audio") or 0)
    if not card.get("primaryExportExists"):
        return []
    if "listen" in stage or score < 72:
        return [
            action(
                "audio",
                "high",
                "Run audio sanity and listen once",
                "A short can survive imperfect visuals faster than harsh or broken audio.",
                commands.get("audioSanity") or "",
                "Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.",
            )
        ]
    return []


def platform_actions(card: dict[str, Any], packaged: dict[str, Any]) -> list[dict[str, Any]]:
    copy = packaged.get("platformCopy") or {}
    youtube = copy.get("youtubeShorts") or {}
    instagram = copy.get("instagramReels") or {}
    actions: list[dict[str, Any]] = []
    if float((card.get("subscores") or {}).get("platform") or 0) < 76:
        actions.append(
            action(
                "platform-package",
                "medium",
                "Polish platform package",
                "A good short still needs a clear title, caption, hashtags, and destination-specific framing.",
                "",
                f"YouTube title draft: {youtube.get('title') or 'missing'}",
            )
        )
    if youtube.get("title") and instagram.get("caption"):
        actions.append(
            action(
                "platform-package",
                "polish",
                "Compare YouTube and Reels copy",
                "YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.",
                "",
                "Keep the promise consistent, but make each platform feel native.",
            )
        )
    return actions


def build_candidate_plan(card: dict[str, Any], packaged: dict[str, Any]) -> dict[str, Any]:
    actions: list[dict[str, Any]] = []
    maybe_export = export_action(card)
    if maybe_export:
        actions.append(maybe_export)
    actions.extend(hook_actions(card, packaged))
    actions.extend(duration_actions(card))
    actions.extend(visual_actions(card))
    actions.extend(audio_actions(card))
    actions.extend(platform_actions(card, packaged))
    if not actions:
        actions.append(
            action(
                "ready-check",
                "low",
                "Do one final watch/listen pass",
                "The automated checks do not see taste. Watch the exported short once like a viewer.",
                (card.get("commands") or {}).get("select") or "",
                "If it lands, move toward platform posting.",
            )
        )
    actions.sort(key=lambda item: (severity_rank(str(item.get("severity"))), str(item.get("kind"))))
    return {
        "id": card.get("id"),
        "title": card.get("title"),
        "growthScore": card.get("growthScore"),
        "growthTier": card.get("growthTier"),
        "stage": card.get("stage"),
        "primaryExportPath": card.get("primaryExportPath"),
        "primaryExportExists": card.get("primaryExportExists"),
        "topAction": actions[0],
        "actions": actions,
    }


def build_plan(queue_path: str, state_path: str, output_dir: str, basename: str) -> dict[str, Any]:
    growth = build_growth_board(queue_path, state_path, output_dir, f"{basename}-growth-source")
    packaged_cards = {card.get("id"): card for card in package_cards(growth)}
    plans = [
        build_candidate_plan(card, packaged_cards.get(card.get("id"), {}))
        for card in growth.get("cards") or []
    ]
    plans.sort(
        key=lambda item: (
            severity_rank(str((item.get("topAction") or {}).get("severity"))),
            -float(item.get("growthScore") or 0),
        )
    )
    json_path = os.path.join(output_dir, f"{basename}.json")
    html_path = os.path.join(output_dir, f"{basename}.html")
    md_path = os.path.join(output_dir, f"{basename}.md")
    counts: dict[str, int] = {}
    for plan in plans:
        severity = str((plan.get("topAction") or {}).get("severity") or "unknown")
        counts[severity] = counts.get(severity, 0) + 1
    return {
        "packetType": "quipsly-shorts-improvement-plan",
        "version": "2026-06-21.shorts-improvement-plan.v1",
        "truth": "This is an actionable improvement plan. It proposes changes but does not mutate Studio state, publish, schedule, upload, or approve.",
        "json": json_path,
        "html": html_path,
        "markdown": md_path,
        "candidateCount": len(plans),
        "topActionCounts": counts,
        "plans": plans,
    }


def html_page(packet: dict[str, Any]) -> str:
    rows: list[str] = []
    for plan in packet.get("plans") or []:
        action_rows = "".join(
            f"""
            <article class="action {esc(action.get('severity'))}">
              <p class="eyebrow">{esc(action.get('severity'))} / {esc(action.get('kind'))}</p>
              <h3>{esc(action.get('label'))}</h3>
              <p>{esc(action.get('why'))}</p>
              <p><strong>Human check:</strong> {esc(action.get('humanCheck'))}</p>
              <code>{esc(action.get('command'))}</code>
            </article>
            """
            for action in plan.get("actions") or []
        )
        top = plan.get("topAction") or {}
        rows.append(
            f"""
            <section class="candidate">
              <header>
                <div class="score"><strong>{esc(plan.get('growthScore'))}</strong><span>{esc(plan.get('growthTier'))}</span></div>
                <div>
                  <p class="eyebrow">{esc(plan.get('stage'))}</p>
                  <h2>{esc(plan.get('title'))}</h2>
                  <p>Top move: <strong>{esc(top.get('label'))}</strong></p>
                </div>
              </header>
              <div class="actions">{action_rows}</div>
            </section>
            """
        )
    count_html = "".join(
        f"<article><strong>{esc(value)}</strong><span>{esc(key)}</span></article>"
        for key, value in sorted((packet.get("topActionCounts") or {}).items(), key=lambda item: severity_rank(item[0]))
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts improvement plan</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101711;
      --panel: #18231a;
      --ink: #f8efd5;
      --muted: #baaf96;
      --gold: #f4d35e;
      --moss: #8fc974;
      --red: #ec746c;
      --line: rgba(248,239,213,.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 10% 0%, rgba(143,201,116,.22), transparent 24rem),
        radial-gradient(circle at 90% 5%, rgba(244,211,94,.12), transparent 26rem),
        var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 42px 24px 72px; }}
    .hero, .candidate, .action {{ border: 1px solid var(--line); background: rgba(24,35,26,.88); border-radius: 28px; }}
    .hero {{ padding: 32px; box-shadow: 0 28px 90px rgba(0,0,0,.28); }}
    .eyebrow {{ margin: 0 0 8px; color: var(--gold); text-transform: uppercase; letter-spacing: .22em; font-size: .72rem; font-weight: 900; }}
    h1 {{ margin: 0; font-size: clamp(2.4rem, 6vw, 4.9rem); line-height: .93; letter-spacing: -.07em; }}
    h2, h3 {{ margin: 0 0 8px; }}
    p {{ color: var(--muted); }}
    strong {{ color: var(--ink); }}
    .counts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 12px; margin-top: 22px; }}
    .counts article {{ border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: rgba(255,255,255,.04); }}
    .counts strong {{ display: block; color: var(--gold); font-size: 2rem; }}
    .counts span {{ color: var(--muted); }}
    .candidate {{ padding: 18px; margin-top: 16px; }}
    header {{ display: grid; grid-template-columns: 96px 1fr; gap: 18px; align-items: center; }}
    .score {{ display: grid; place-items: center; min-height: 88px; border-radius: 22px; background: rgba(244,211,94,.1); border: 1px solid rgba(244,211,94,.24); text-align: center; }}
    .score strong {{ color: var(--gold); font-size: 2.4rem; line-height: 1; }}
    .score span {{ color: var(--muted); font-size: .74rem; }}
    .actions {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; margin-top: 16px; }}
    .action {{ padding: 14px; border-radius: 20px; box-shadow: none; }}
    .action.blocker, .action.high {{ border-color: rgba(236,116,108,.48); }}
    .action.medium {{ border-color: rgba(244,211,94,.42); }}
    .action.low, .action.polish {{ border-color: rgba(143,201,116,.44); }}
    code {{ display: block; white-space: pre-wrap; word-break: break-word; min-height: 36px; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.32); color: #fff6bd; border: 1px solid rgba(244,211,94,.18); font-size: .8rem; }}
    @media (max-width: 760px) {{ header {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - shorts improvement plan</p>
      <h1>Make the next edit obvious.</h1>
      <p>Ranked actions for improving short quality before publication: export, hook, timing, visual crop, captions, audio, and platform package.</p>
      <div class="counts">{count_html}</div>
    </section>
    {''.join(rows)}
  </main>
</body>
</html>
"""


def markdown_page(packet: dict[str, Any]) -> str:
    lines = [
        "# Quipsly shorts improvement plan",
        "",
        packet.get("truth", ""),
        "",
    ]
    for plan in packet.get("plans") or []:
        lines.extend(
            [
                f"## {plan.get('growthScore')} - {plan.get('title')}",
                "",
                f"- Tier: `{plan.get('growthTier')}`",
                f"- Stage: `{plan.get('stage')}`",
                f"- Export: `{plan.get('primaryExportPath') or 'none yet'}`",
                "",
            ]
        )
        for item in plan.get("actions") or []:
            lines.extend(
                [
                    f"### {item.get('severity')} / {item.get('kind')} - {item.get('label')}",
                    "",
                    item.get("why") or "",
                    "",
                    f"- Human check: {item.get('humanCheck') or ''}",
                    "",
                    "```bash",
                    item.get("command") or "",
                    "```",
                    "",
                ]
            )
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_improvement_plan.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
            file=sys.stderr,
        )
        return 2
    queue_path, state_path, output_dir, basename = argv[1:5]
    mode = argv[5] if len(argv) > 5 else "--md"
    packet = build_plan(queue_path, state_path, output_dir, basename)
    write_json(packet["json"], packet)
    write_text(packet["html"], html_page(packet))
    write_text(packet["markdown"], markdown_page(packet))
    if mode == "--json":
        print(json.dumps(packet, indent=2, sort_keys=True))
    elif mode == "--html":
        print(packet["html"])
    else:
        print(packet["markdown"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
