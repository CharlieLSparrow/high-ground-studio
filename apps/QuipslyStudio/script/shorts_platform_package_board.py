#!/usr/bin/env python3
"""Generate platform packaging drafts for short-form candidates.

This does not publish. It turns a ranked short queue into practical copy and
quality notes that make each export more likely to work in a vertical feed.
"""

from __future__ import annotations

import os
import re
import sys
from typing import Any

from shorts_board_common import emit_packet_outputs, esc
from shorts_growth_quality_board import build_board


STOP_WORDS = {
    "about",
    "after",
    "again",
    "because",
    "before",
    "between",
    "could",
    "every",
    "from",
    "have",
    "into",
    "just",
    "like",
    "make",
    "more",
    "that",
    "their",
    "there",
    "thing",
    "this",
    "through",
    "what",
    "when",
    "where",
    "with",
    "would",
    "your",
}

DEFAULT_HASHTAGS = {
    "youtube": ["#HighGroundOdyssey", "#PodcastClips", "#Wisdom", "#Storytelling", "#PersonalGrowth"],
    "instagram": ["#HighGroundOdyssey", "#Reels", "#PodcastMoment", "#CreativeLife", "#GrowthMindset"],
    "facebook": ["#HighGroundOdyssey", "#PodcastClip", "#LifeLessons", "#Conversation", "#CreativeWork"],
    "linkedin": ["#Leadership", "#Coaching", "#CreativeWork", "#SystemsThinking", "#HighGroundOdyssey"],
    "patreon": ["#BehindTheScenes", "#HighGroundOdyssey", "#CreatorNotes"],
}


def words(value: str) -> list[str]:
    return re.findall(r"[A-Za-z][A-Za-z0-9']+", value)


def compact(value: str, max_words: int) -> str:
    parts = words(value)
    if not parts:
        return ""
    clipped = " ".join(parts[:max_words])
    return clipped + ("..." if len(parts) > max_words else "")


def title_case(value: str) -> str:
    value = re.sub(r"\s+", " ", value).strip()
    if not value:
        return "A High Ground Odyssey Moment"
    return value[:1].upper() + value[1:]


def extract_keywords(card: dict[str, Any]) -> list[str]:
    source = " ".join(
        str(card.get(key) or "")
        for key in ["title", "hookText", "overlayText", "nextGrowthAction"]
    )
    candidates = []
    for word in words(source):
        lower = word.lower()
        if len(lower) < 4 or lower in STOP_WORDS:
            continue
        candidates.append(lower)
    seen: set[str] = set()
    unique: list[str] = []
    for word in candidates:
        if word in seen:
            continue
        seen.add(word)
        unique.append(word)
    return unique[:8]


def hook_variants(card: dict[str, Any]) -> list[dict[str, str]]:
    title = str(card.get("title") or "this moment")
    hook = str(card.get("hookText") or "").strip()
    overlay = str(card.get("overlayText") or "").strip()
    base = hook or overlay or title
    short_base = compact(base, 12) or "This is the moment the conversation turns"
    return [
        {
            "angle": "direct",
            "text": title_case(short_base),
            "why": "Fastest to understand in the feed.",
        },
        {
            "angle": "curiosity",
            "text": title_case(f"The part nobody tells you about {compact(title, 6) or 'this'}"),
            "why": "Creates an information gap without lying.",
        },
        {
            "angle": "teaching",
            "text": title_case(f"One useful way to think about {compact(title, 7) or 'this'}"),
            "why": "Frames the clip as immediately useful.",
        },
        {
            "angle": "conversation",
            "text": title_case(f"We had to talk through {compact(title, 7) or 'this'}"),
            "why": "Preserves the podcast's human conversation feel.",
        },
    ]


def platform_copy(card: dict[str, Any]) -> dict[str, Any]:
    title = str(card.get("title") or "High Ground Odyssey clip").strip()
    hook = str(card.get("hookText") or "").strip()
    keywords = extract_keywords(card)
    keyword_tags = [f"#{word.title().replace('-', '')}" for word in keywords[:4]]
    duration = float(card.get("durationSeconds") or 0)
    score = card.get("growthScore")
    tier = card.get("growthTier")
    hook_line = hook or hook_variants(card)[0]["text"]
    short_description = (
        f"{hook_line}\n\nA short moment from High Ground Odyssey about {', '.join(keywords[:3]) or 'creative work and growth'}."
    )
    youtube_title = title_case(compact(hook_line, 11) or title)
    instagram_caption = (
        f"{hook_line}\n\nSave this if it helps you think about the work differently."
    )
    facebook_caption = (
        f"{hook_line}\n\nThis clip is from our ongoing High Ground Odyssey conversation."
    )
    linkedin_caption = (
        f"{hook_line}\n\nA useful leadership/creative-work reflection from High Ground Odyssey."
    )
    patreon_note = (
        f"Short clip candidate: {title}. Use this as a teaser or behind-the-scenes discussion prompt."
    )
    return {
        "youtubeShorts": {
            "title": youtube_title[:95],
            "description": short_description,
            "hashtags": list(dict.fromkeys(keyword_tags + DEFAULT_HASHTAGS["youtube"]))[:8],
            "cta": "Watch the full episode when it is live.",
            "notes": "Keep the first visible text punchy; title should make the promise immediately.",
        },
        "instagramReels": {
            "caption": instagram_caption,
            "hashtags": list(dict.fromkeys(keyword_tags + DEFAULT_HASHTAGS["instagram"]))[:10],
            "cta": "Save/share if this lands.",
            "notes": "Prioritize visual readability and face-safe captions.",
        },
        "facebookReels": {
            "caption": facebook_caption,
            "hashtags": list(dict.fromkeys(keyword_tags + DEFAULT_HASHTAGS["facebook"]))[:8],
            "cta": "Share with someone who would enjoy this conversation.",
            "notes": "Readable captions matter; assume many viewers start muted.",
        },
        "linkedin": {
            "caption": linkedin_caption,
            "hashtags": list(dict.fromkeys(keyword_tags + DEFAULT_HASHTAGS["linkedin"]))[:6],
            "cta": "What would you add to this?",
            "notes": "Only use if the clip has a clear work, leadership, coaching, or learning angle.",
        },
        "patreon": {
            "note": patreon_note,
            "tags": DEFAULT_HASHTAGS["patreon"],
            "cta": "Ask supporters what part they want expanded in the next episode.",
            "notes": "Patreon can be more conversational and behind-the-scenes than public feeds.",
        },
        "qualityContext": {
            "growthScore": score,
            "growthTier": tier,
            "durationSeconds": duration,
        },
    }


def improvement_prompts(card: dict[str, Any]) -> list[str]:
    prompts: list[str] = []
    missing = set(card.get("missingQualitySignals") or [])
    if "hook" in missing:
        prompts.append("Write a sharper first-line hook before exporting or posting.")
    if "caption-or-overlay-plan" in missing:
        prompts.append("Create a caption/overlay plan that does not cover faces.")
    if "local-export" in missing:
        prompts.append("Export locally before making a posting decision.")
    stage = str(card.get("stage") or "")
    if "visual-review" in stage:
        prompts.append("Generate a contact sheet and check crop, headroom, and caption safe zones.")
    if "listen" in stage:
        prompts.append("Listen through once for clipping, sudden loudness, or awkward cut points.")
    duration = float(card.get("durationSeconds") or 0)
    if duration > 65:
        prompts.append("Consider tightening the short or splitting it into multiple clips.")
    if duration < 12 and duration > 0:
        prompts.append("Make sure the clip has enough context to stand alone.")
    if not prompts:
        prompts.append("Do one human/agent watch pass, then prepare the strongest platform copy.")
    return prompts


def package_cards(board: dict[str, Any]) -> list[dict[str, Any]]:
    packaged: list[dict[str, Any]] = []
    for card in board.get("cards") or []:
        packaged.append(
            {
                "id": card.get("id"),
                "title": card.get("title"),
                "growthScore": card.get("growthScore"),
                "growthTier": card.get("growthTier"),
                "stage": card.get("stage"),
                "nextGrowthAction": card.get("nextGrowthAction"),
                "primaryExportPath": card.get("primaryExportPath"),
                "primaryExportExists": card.get("primaryExportExists"),
                "hookVariants": hook_variants(card),
                "platformCopy": platform_copy(card),
                "improvementPrompts": improvement_prompts(card),
                "commands": card.get("commands") or {},
            }
        )
    return packaged


def html_page(packet: dict[str, Any]) -> str:
    rows: list[str] = []
    for card in packet.get("cards") or []:
        hook_html = "".join(
            f"<li><strong>{esc(item.get('angle'))}</strong>: {esc(item.get('text'))}<small>{esc(item.get('why'))}</small></li>"
            for item in card.get("hookVariants") or []
        )
        prompts_html = "".join(f"<li>{esc(prompt)}</li>" for prompt in card.get("improvementPrompts") or [])
        youtube = ((card.get("platformCopy") or {}).get("youtubeShorts") or {})
        instagram = ((card.get("platformCopy") or {}).get("instagramReels") or {})
        commands = card.get("commands") or {}
        rows.append(
            f"""
            <section class="card">
              <header>
                <div class="score"><strong>{esc(card.get('growthScore'))}</strong><span>{esc(card.get('growthTier'))}</span></div>
                <div>
                  <p class="eyebrow">{esc(card.get('stage'))}</p>
                  <h2>{esc(card.get('title'))}</h2>
                  <p>{esc(card.get('nextGrowthAction'))}</p>
                </div>
              </header>
              <div class="grid">
                <article>
                  <h3>Hook tests</h3>
                  <ul>{hook_html}</ul>
                </article>
                <article>
                  <h3>YouTube Shorts</h3>
                  <p><strong>Title:</strong> {esc(youtube.get('title'))}</p>
                  <p>{esc(youtube.get('description'))}</p>
                  <p class="tags">{esc(' '.join(youtube.get('hashtags') or []))}</p>
                </article>
                <article>
                  <h3>Instagram / Facebook</h3>
                  <p>{esc(instagram.get('caption'))}</p>
                  <p class="tags">{esc(' '.join(instagram.get('hashtags') or []))}</p>
                </article>
                <article>
                  <h3>Improve before posting</h3>
                  <ul>{prompts_html}</ul>
                  <code>{esc(commands.get('exportLocal') or commands.get('contactSheet') or commands.get('audioSanity') or commands.get('select') or '')}</code>
                </article>
              </div>
            </section>
            """
        )
    top = (packet.get("cards") or [{}])[0] if packet.get("cards") else {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly shorts platform package board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #101610;
      --panel: #18241a;
      --ink: #f8efd5;
      --muted: #baaf96;
      --gold: #f2ca4d;
      --moss: #8fc974;
      --blue: #5abfd3;
      --line: rgba(248,239,213,.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      background:
        radial-gradient(circle at 8% 0%, rgba(143,201,116,.2), transparent 25rem),
        radial-gradient(circle at 90% 8%, rgba(242,202,77,.14), transparent 24rem),
        var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{ max-width: 1240px; margin: 0 auto; padding: 42px 24px 70px; }}
    .hero, .card {{ border: 1px solid var(--line); background: rgba(24,36,26,.88); border-radius: 28px; box-shadow: 0 28px 90px rgba(0,0,0,.28); }}
    .hero {{ padding: 32px; margin-bottom: 18px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--gold); text-transform: uppercase; letter-spacing: .22em; font-size: .72rem; font-weight: 900; }}
    h1 {{ margin: 0; font-size: clamp(2.4rem, 6vw, 4.9rem); line-height: .93; letter-spacing: -.07em; }}
    h2, h3 {{ margin: 0 0 8px; }}
    p, li {{ color: var(--muted); }}
    .card {{ padding: 20px; margin-top: 16px; }}
    header {{ display: grid; grid-template-columns: 96px 1fr; gap: 18px; align-items: center; }}
    .score {{ display: grid; place-items: center; padding: 12px; min-height: 88px; border-radius: 22px; background: rgba(242,202,77,.1); border: 1px solid rgba(242,202,77,.24); text-align: center; }}
    .score strong {{ color: var(--gold); font-size: 2.4rem; line-height: 1; }}
    .score span {{ color: var(--muted); font-size: .74rem; }}
    .grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }}
    article {{ border: 1px solid var(--line); border-radius: 20px; padding: 14px; background: rgba(255,255,255,.035); }}
    small {{ display: block; color: var(--moss); margin-top: 3px; }}
    .tags {{ color: var(--blue); font-weight: 700; }}
    code {{ display: block; white-space: pre-wrap; word-break: break-word; padding: 10px 12px; border-radius: 12px; background: rgba(0,0,0,.32); color: #fff6bd; border: 1px solid rgba(242,202,77,.18); font-size: .8rem; }}
    @media (max-width: 860px) {{ .grid, header {{ grid-template-columns: 1fr; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio - platform package board</p>
      <h1>Make the short feel native before it ships.</h1>
      <p>Draft hooks, captions, titles, descriptions, hashtags, and platform notes for the best candidates. The top current candidate is <strong>{esc(top.get('title') or 'none')}</strong>.</p>
    </section>
    {''.join(rows)}
  </main>
</body>
</html>
"""


def markdown_page(packet: dict[str, Any]) -> str:
    lines = [
        "# Quipsly shorts platform package board",
        "",
        "Draft hooks, titles, captions, descriptions, hashtags, and practical fixes for social shorts.",
        "",
    ]
    for card in packet.get("cards") or []:
        youtube = ((card.get("platformCopy") or {}).get("youtubeShorts") or {})
        instagram = ((card.get("platformCopy") or {}).get("instagramReels") or {})
        lines.extend([
            f"## {card.get('growthScore')} - {card.get('title')}",
            "",
            f"- Tier: `{card.get('growthTier')}`",
            f"- Stage: `{card.get('stage')}`",
            f"- Export: `{card.get('primaryExportPath') or 'none yet'}`",
            "",
            "### Hook tests",
            "",
        ])
        for item in card.get("hookVariants") or []:
            lines.append(f"- **{item.get('angle')}**: {item.get('text')} ({item.get('why')})")
        lines.extend([
            "",
            "### YouTube Shorts",
            "",
            f"- Title: {youtube.get('title')}",
            f"- Description: {youtube.get('description')}",
            f"- Hashtags: {' '.join(youtube.get('hashtags') or [])}",
            "",
            "### Instagram / Facebook",
            "",
            f"- Caption: {instagram.get('caption')}",
            f"- Hashtags: {' '.join(instagram.get('hashtags') or [])}",
            "",
            "### Improve before posting",
            "",
        ])
        for prompt in card.get("improvementPrompts") or []:
            lines.append(f"- {prompt}")
        lines.extend(["", "```bash", (card.get("commands") or {}).get("exportLocal") or "", "```", ""])
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) < 5:
        print(
            "Usage: shorts_platform_package_board.py SHORTS_QUEUE_JSON STATE_JSON OUTPUT_DIR BASENAME [--json|--html|--md]",
            file=sys.stderr,
        )
        return 2
    queue_path, state_path, output_dir, basename = argv[1:5]
    mode = argv[5] if len(argv) > 5 else "--md"
    growth_board = build_board(queue_path, state_path, output_dir, f"{basename}-growth-source")
    packet = {
        "packetType": "quipsly-shorts-platform-package-board",
        "version": "2026-06-21.shorts-platform-package-board.v1",
        "generatedAt": growth_board.get("generatedAt"),
        "truth": "This board drafts packaging. It does not publish, schedule, upload, approve, or guarantee performance.",
        "researchBasis": [
            "Riverside-style social-ready clips, aspect ratios, layouts, and captions.",
            "Descript-style templates, captions, generated B-roll, brand styling, and social aspect ratios.",
            "OpusClip-style candidate ranking and hook/flow/engagement/trend thinking.",
            "CapCut-style caption timing and manual subtitle correction as a first-class workflow.",
        ],
        "json": os.path.join(output_dir, f"{basename}.json"),
        "html": os.path.join(output_dir, f"{basename}.html"),
        "markdown": os.path.join(output_dir, f"{basename}.md"),
        "cards": package_cards(growth_board),
    }
    emit_packet_outputs(packet, html_page(packet), markdown_page(packet), mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
