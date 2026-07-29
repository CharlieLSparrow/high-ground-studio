#!/usr/bin/env python3
"""Build a read-only shorts command room across the current Studio proof lanes.

This reads the Studio goal review board and creates a local reviewer surface for
shorts across Episodes 1-3, 5, and 6. It separates native current-version shorts
from carry-forward candidates and never mutates media, exports, or review
ledgers.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_BOARD = DEFAULT_ROOT / "quipsly-studio-goal-review-board.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room"
PROOF_LANES = {1, 2, 3, 5, 6}


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"Expected JSON object: {path}")
    return data


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def native_short_cards(root: Path, episode: dict[str, Any]) -> list[dict[str, Any]]:
    cards: list[dict[str, Any]] = []
    for index, rel_path in enumerate(episode.get("shorts", []), start=1):
        path = root / rel_path
        facts = probe_media_facts(path)
        cards.append(
            {
                "index": index,
                "kind": "native-current-short",
                "title": title_from_filename(path.name, index),
                "path": str(path),
                "relativePath": rel_path,
                "uri": file_uri(path),
                "mediaFacts": facts,
                "durationBucket": duration_bucket(facts.get("durationSeconds") or 0),
                "platformFit": platform_fit_for(facts),
                "reviewPriority": review_priority_for(facts, index),
                "reviewPriorityReason": review_priority_reason(facts),
                "truth": "Native current-version short package artifact. Still requires human review and publication receipt before any publish claim.",
            }
        )
    return cards


def probe_media_facts(path: Path) -> dict[str, Any]:
    if not path.exists():
        return media_fact_error("missing", False, "File is missing from local package path.")
    command = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        result = subprocess.run(command, check=False, capture_output=True, text=True, timeout=8)
    except FileNotFoundError:
        return media_fact_error("ffprobe-missing", True, "ffprobe is not available on this machine.")
    except subprocess.TimeoutExpired:
        return media_fact_error("probe-timeout", True, "ffprobe timed out.")
    if result.returncode != 0:
        return media_fact_error("probe-failed", True, result.stderr.strip()[:500] or "ffprobe failed.")
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return media_fact_error("probe-json-failed", True, "ffprobe returned invalid JSON.")
    streams = payload.get("streams", []) if isinstance(payload.get("streams"), list) else []
    video_stream = next((stream for stream in streams if stream.get("codec_type") == "video"), {})
    audio_stream = next((stream for stream in streams if stream.get("codec_type") == "audio"), {})
    try:
        duration = float(payload.get("format", {}).get("duration") or 0)
    except (TypeError, ValueError):
        duration = 0.0
    width = int(video_stream.get("width") or 0)
    height = int(video_stream.get("height") or 0)
    return {
        "status": "ok",
        "exists": True,
        "durationSeconds": round(duration, 3),
        "durationLabel": format_duration(duration),
        "width": width,
        "height": height,
        "aspect": aspect_label(width, height),
        "hasAudio": bool(audio_stream),
        "hasVideo": bool(video_stream),
        "videoCodec": str(video_stream.get("codec_name") or ""),
        "audioCodec": str(audio_stream.get("codec_name") or ""),
        "warning": "",
    }


def media_fact_error(status: str, exists: bool, warning: str) -> dict[str, Any]:
    return {
        "status": status,
        "exists": exists,
        "durationSeconds": 0,
        "durationLabel": "unknown",
        "width": 0,
        "height": 0,
        "aspect": "unknown",
        "hasAudio": False,
        "hasVideo": False,
        "videoCodec": "",
        "audioCodec": "",
        "warning": warning,
    }


def format_duration(seconds: float) -> str:
    if seconds <= 0:
        return "unknown"
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    if minutes:
        return f"{minutes}:{remainder:04.1f}"
    return f"{remainder:.1f}s"


def aspect_label(width: int, height: int) -> str:
    if width <= 0 or height <= 0:
        return "unknown"
    ratio = width / height
    if abs(ratio - 9 / 16) < 0.04:
        return "9:16"
    if abs(ratio - 16 / 9) < 0.04:
        return "16:9"
    if abs(ratio - 1) < 0.04:
        return "1:1"
    return f"{width}:{height}"


def duration_bucket(seconds: float) -> str:
    if seconds <= 0:
        return "unknown"
    if seconds < 8:
        return "micro-proof"
    if seconds < 15:
        return "short-hook"
    if seconds <= 60:
        return "standard-social-short"
    if seconds <= 90:
        return "extended-short"
    return "too-long-for-first-pass"


def platform_fit_for(facts: dict[str, Any]) -> list[str]:
    aspect = facts.get("aspect")
    seconds = float(facts.get("durationSeconds") or 0)
    if aspect != "9:16" or not facts.get("hasAudio") or not facts.get("hasVideo"):
        return ["needs-review-before-platform-routing"]
    platforms = ["YouTube Shorts", "Instagram Reels", "Facebook Reels"]
    if 20 <= seconds <= 75:
        platforms.append("LinkedIn excerpt")
    if 8 <= seconds <= 60:
        platforms.append("Patreon teaser")
    return platforms


def review_priority_for(facts: dict[str, Any], index: int) -> int:
    score = 1000 + index
    if facts.get("status") != "ok":
        return score + 5000
    if facts.get("aspect") == "9:16":
        score -= 250
    if facts.get("hasAudio"):
        score -= 200
    bucket = duration_bucket(facts.get("durationSeconds") or 0)
    if bucket == "standard-social-short":
        score -= 400
    elif bucket == "short-hook":
        score -= 250
    elif bucket == "extended-short":
        score -= 100
    elif bucket == "micro-proof":
        score += 200
    elif bucket == "too-long-for-first-pass":
        score += 300
    return score


def review_priority_reason(facts: dict[str, Any]) -> str:
    if facts.get("status") != "ok":
        return f"Probe status is {facts.get('status')}; check file health before creative review."
    bucket = duration_bucket(facts.get("durationSeconds") or 0)
    aspect = facts.get("aspect")
    if aspect != "9:16":
        return f"Aspect is {aspect}; review framing before platform routing."
    if not facts.get("hasAudio"):
        return "No audio detected; verify whether this is intentional."
    if bucket == "standard-social-short":
        return "Strong first-pass review candidate: 9:16, audio present, standard social duration."
    if bucket == "short-hook":
        return "Possible hook candidate: short enough to work, but check whether it has a complete thought."
    if bucket == "extended-short":
        return "Extended candidate: may work, but likely needs tighter pacing or platform-specific cutdown."
    if bucket == "micro-proof":
        return "Very short candidate: useful as proof or punchline only if context is obvious."
    if bucket == "too-long-for-first-pass":
        return "Long candidate: save for later or split into tighter social cuts."
    return "Needs watch/listen review."


def carry_forward_summary(episode: dict[str, Any]) -> dict[str, Any]:
    return {
        "count": len(episode.get("carryforward_shorts", [])),
        "reviewTheaters": episode.get("review_theaters", []),
        "nextReviewCards": episode.get("next_review_cards", []),
        "nextReviewTarget": episode.get("next_review_target", {}),
        "truth": "Carry-forward candidates are not native current-version shorts until reviewed and re-exported.",
    }


def title_from_filename(filename: str, index: int) -> str:
    stem = Path(filename).stem
    full_release_match = re.search(r"full[-_ ]release[-_ ]\d+[-_ ](.+)$", stem, flags=re.IGNORECASE)
    is_full_release_title = bool(full_release_match)
    if full_release_match:
        stem = full_release_match.group(1)
    cleanup = stem.replace("-", " ").replace("_", " ")
    noise = {
        "mp4",
        "mov",
        "m4v",
        "9x16",
        "16x9",
        "full",
        "release",
        "social",
        "publication",
        "queue",
        "clips",
    }
    if is_full_release_title:
        noise.add("short")
    words = " ".join(word for word in cleanup.split() if word.lower() not in noise)
    return words.title() if words else f"Short {index:02d}"


def episode_action(episode: dict[str, Any]) -> str:
    status = episode.get("status")
    number = episode.get("episode")
    if status == "needs-shorts-realignment-review":
        target = episode.get("next_review_target", {})
        if target:
            return f"Review carry-forward Candidate {int(target.get('index') or 0):02d}: {target.get('title')}."
        return "Review carry-forward shorts before counting them as current-version shorts."
    if status == "review-ready-local":
        return "Start human review of current shorts; record keep/refine/hold/reject before publishing."
    if number == 4:
        return "Keep visible but do not block broader review while source clips are missing."
    return episode.get("next_action") or "Inspect package state and choose the next safe review action."


def build_room(board_path: Path, root: Path, max_embed_per_episode: int) -> dict[str, Any]:
    board = read_json(board_path)
    episodes: list[dict[str, Any]] = []
    for episode in board.get("episodes", []):
        if int(episode.get("episode") or -1) not in PROOF_LANES:
            continue
        native = native_short_cards(root, episode)
        episodes.append(
            {
                "episode": episode.get("episode"),
                "status": episode.get("status"),
                "currentVersion": episode.get("current_version"),
                "nativeShortCount": len(native),
                "carryForward": carry_forward_summary(episode),
                "nativeShorts": native,
                "embeddedShorts": native[:max_embed_per_episode],
                "hiddenShortCount": max(len(native) - max_embed_per_episode, 0),
                "nextAction": episode_action(episode),
                "truth": "Episode short review state only. This is not approval, publication, or receipt truth.",
            }
        )
    return {
        "model": "quipsly-studio-shorts-command-room",
        "version": "2026-07-02.v2",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "sourceBoard": str(board_path),
        "root": str(root),
        "maxEmbedPerEpisode": max_embed_per_episode,
        "episodes": episodes,
        "recommendedNextShorts": recommended_next_shorts(episodes, limit=12),
        "totals": {
            "episodes": len(episodes),
            "nativeShorts": sum(ep["nativeShortCount"] for ep in episodes),
            "carryForwardCandidates": sum(ep["carryForward"]["count"] for ep in episodes),
            "embeddedShorts": sum(len(ep["embeddedShorts"]) for ep in episodes),
            "probeOkShorts": sum(1 for ep in episodes for short in ep["nativeShorts"] if short.get("mediaFacts", {}).get("status") == "ok"),
            "probeWarningShorts": sum(1 for ep in episodes for short in ep["nativeShorts"] if short.get("mediaFacts", {}).get("status") != "ok"),
        },
        "truth": "Read-only shorts command room. Does not mutate media, record decisions, publish, or claim approval.",
    }


def recommended_next_shorts(episodes: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for episode in episodes:
        for short in episode["nativeShorts"]:
            candidates.append(
                {
                    "episode": episode["episode"],
                    "currentVersion": episode.get("currentVersion"),
                    "shortIndex": short["index"],
                    "shortId": f"episode-{episode['episode']}-short-{int(short['index']):02d}",
                    "title": short["title"],
                    "relativePath": short["relativePath"],
                    "durationLabel": short["mediaFacts"].get("durationLabel"),
                    "durationSeconds": short["mediaFacts"].get("durationSeconds"),
                    "aspect": short["mediaFacts"].get("aspect"),
                    "platformFit": short.get("platformFit", []),
                    "reviewPriority": short.get("reviewPriority", 9999),
                    "reviewPriorityReason": short.get("reviewPriorityReason", ""),
                    "dryRunKeepCommand": (
                        f"script/agentctl.sh studio-short-review-decision-dry-run "
                        f"episode-{episode['episode']}-short-{int(short['index']):02d} keep Codex "
                        "\"local watch/listen review needed before recording\""
                    ),
                    "truth": "Recommended review routing only. This is not a review decision, approval, publication, or receipt.",
                }
            )
    return sorted(candidates, key=lambda item: (item["reviewPriority"], item["episode"], item["shortIndex"]))[:limit]


def render_markdown(room: dict[str, Any]) -> str:
    lines = [
        "# Quipsly Studio Shorts Command Room",
        "",
        f"Generated: `{room['generatedAt']}`",
        f"Root: `{room['root']}`",
        "",
        "> Truth: read-only short review runway. Current shorts, carry-forward candidates, approvals, and publication receipts are separate states.",
        "",
        "## Totals",
        "",
        f"- Episodes: {room['totals']['episodes']}",
        f"- Native current-version shorts: {room['totals']['nativeShorts']}",
        f"- Carry-forward candidates: {room['totals']['carryForwardCandidates']}",
        f"- Embedded preview shorts: {room['totals']['embeddedShorts']}",
        f"- Probe OK shorts: {room['totals']['probeOkShorts']}",
        f"- Probe warning shorts: {room['totals']['probeWarningShorts']}",
        "",
        "## Recommended next shorts",
        "",
    ]
    for item in room.get("recommendedNextShorts", []):
        lines.append(
            f"- Episode {int(item['episode']):02d} Short {int(item['shortIndex']):02d}: "
            f"**{item['title']}** - `{item['durationLabel']}`, `{item['aspect']}`"
        )
        lines.append(f"  - Why: {item['reviewPriorityReason']}")
        lines.append(f"  - Dry run: `{item['dryRunKeepCommand']}`")
    lines.extend([
        "",
        "## Episodes",
        "",
    ])
    for episode in room["episodes"]:
        lines.append(f"### Episode {int(episode['episode']):02d} - `{episode['status']}`")
        lines.append("")
        lines.append(f"- Current version: `{episode.get('currentVersion')}`")
        lines.append(f"- Native shorts: {episode['nativeShortCount']}")
        lines.append(f"- Carry-forward candidates: {episode['carryForward']['count']}")
        lines.append(f"- Hidden from HTML embed limit: {episode['hiddenShortCount']}")
        lines.append(f"- Next action: {episode['nextAction']}")
        if episode["carryForward"]["reviewTheaters"]:
            for theater in episode["carryForward"]["reviewTheaters"]:
                lines.append(f"- Carry-forward theater: `{theater}`")
        for short in episode["nativeShorts"][:8]:
            lines.append(f"- Short {short['index']:02d}: `{short['relativePath']}`")
            facts = short.get("mediaFacts", {})
            lines.append(
                f"  - Media: `{facts.get('durationLabel', 'unknown')}`, `{facts.get('aspect', 'unknown')}`, "
                f"audio `{facts.get('hasAudio', False)}`, probe `{facts.get('status', 'unknown')}`"
            )
            lines.append(f"  - Priority: {short.get('reviewPriorityReason')}")
        if len(episode["nativeShorts"]) > 8:
            lines.append(f"- ... {len(episode['nativeShorts']) - 8} more native shorts")
        lines.append("")
    return "\n".join(lines)


def render_html(room: dict[str, Any]) -> str:
    episode_nav = "\n".join(
        f"""<a href="#episode-{int(ep['episode']):02d}"><strong>Episode {int(ep['episode']):02d}</strong><span>{html.escape(ep['status'])}</span><em>{ep['nativeShortCount']} shorts</em></a>"""
        for ep in room["episodes"]
    )
    episodes = "\n".join(render_episode_html(ep, Path(room["root"])) for ep in room["episodes"])
    recommendations = "\n".join(render_recommendation_html(item) for item in room.get("recommendedNextShorts", []))
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio Shorts Command Room</title>
  <style>
    :root {{
      color-scheme: dark;
      --soil: #15110d;
      --canopy: #0e1b14;
      --moss: #7f9f63;
      --fern: #d1ecaa;
      --honey: #efc960;
      --clay: #d36d4d;
      --cream: #fff3dc;
      --line: rgba(255, 243, 220, 0.16);
    }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      color: var(--cream);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 8% 0%, rgba(127, 159, 99, 0.32), transparent 30rem),
        radial-gradient(circle at 96% 6%, rgba(239, 201, 96, 0.18), transparent 26rem),
        linear-gradient(135deg, var(--canopy), var(--soil));
    }}
    main {{ width: min(1480px, calc(100vw - 36px)); margin: 0 auto; padding: 36px 0 90px; }}
    .hero, .episode, .nav {{ border: 1px solid var(--line); border-radius: 32px; background: rgba(255, 243, 220, 0.07); box-shadow: 0 26px 86px rgba(0,0,0,0.25); }}
    .hero {{ padding: 30px; margin-bottom: 18px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); letter-spacing: 0.16em; text-transform: uppercase; font-weight: 950; font-size: 0.78rem; }}
    h1 {{ margin: 0; font-size: clamp(2.4rem, 6vw, 5.6rem); line-height: 0.9; }}
    h2 {{ margin: 0 0 8px; }}
    p {{ color: #e7d9bf; }}
    .stats, .episode-stats {{ display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }}
    .pill {{ border: 1px solid rgba(209, 236, 170, 0.22); background: rgba(127, 159, 99, 0.13); color: var(--fern); border-radius: 999px; padding: 8px 12px; font-weight: 950; }}
    .nav {{ position: sticky; top: 0; z-index: 20; padding: 16px; margin-bottom: 18px; backdrop-filter: blur(18px); background: rgba(14, 27, 20, 0.84); display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }}
    .nav a {{ display: grid; gap: 5px; color: var(--cream); text-decoration: none; border: 1px solid var(--line); border-radius: 18px; padding: 12px; background: rgba(0,0,0,0.18); }}
    .nav strong {{ color: var(--honey); }}
    .nav span, .nav em {{ font-size: 0.8rem; color: #dacbad; font-style: normal; }}
    .episode {{ padding: 22px; margin-bottom: 20px; }}
    .recommendations {{ border: 1px solid var(--line); border-radius: 32px; background: rgba(255, 243, 220, 0.07); padding: 22px; margin-bottom: 18px; }}
    .recommendation-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }}
    .recommendation {{ border: 1px solid var(--line); background: rgba(0,0,0,0.2); border-radius: 20px; padding: 14px; }}
    .recommendation h3 {{ margin: 0 0 8px; }}
    .short-grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 16px; }}
    .short-card {{ border: 1px solid var(--line); border-radius: 22px; background: rgba(0,0,0,0.22); padding: 10px; }}
    video {{ width: 100%; aspect-ratio: 9 / 16; max-height: 480px; background: #050402; border-radius: 16px; border: 1px solid rgba(239, 201, 96, 0.18); }}
    .short-card h3 {{ margin: 8px 0 4px; font-size: 0.95rem; }}
    code {{ display: block; overflow-x: auto; padding: 10px; border-radius: 12px; color: #ffe8a3; background: rgba(0,0,0,0.34); }}
    .warning {{ border-left: 4px solid var(--clay); padding-left: 12px; }}
    @media (max-width: 1180px) {{ .short-grid, .recommendation-grid {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }} .nav {{ grid-template-columns: repeat(2, 1fr); }} }}
    @media (max-width: 720px) {{ .short-grid, .recommendation-grid, .nav {{ grid-template-columns: 1fr; }} main {{ width: min(100vw - 24px, 760px); }} .nav {{ position: static; }} }}
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <p class="eyebrow">Quipsly Studio review runway</p>
      <h1>Shorts Command Room</h1>
      <p>One calm place to see native current shorts, carry-forward candidates, and the next safest review action. This page is read-only and does not claim approval or publication.</p>
      <div class="stats">
        <span class="pill">{room['totals']['episodes']} proof lanes</span>
        <span class="pill">{room['totals']['nativeShorts']} native shorts</span>
        <span class="pill">{room['totals']['carryForwardCandidates']} carry-forward candidates</span>
        <span class="pill">{room['totals']['embeddedShorts']} embedded previews</span>
        <span class="pill">{room['totals']['probeOkShorts']} probe OK</span>
      </div>
    </section>
    <nav class="nav">{episode_nav}</nav>
    <section class="recommendations">
      <p class="eyebrow">Review next</p>
      <h2>Best next shorts to watch</h2>
      <p>Transparent heuristic: 9:16 shorts with audio, clean probes, and practical social duration rise first. This is routing, not approval.</p>
      <div class="recommendation-grid">{recommendations}</div>
    </section>
    {episodes}
  </main>
</body>
</html>
"""


def render_episode_html(episode: dict[str, Any], root: Path) -> str:
    carry = episode["carryForward"]
    theaters = "".join(
        f'<p><a class="pill" href="{html.escape(file_uri(root / theater))}">Open carry-forward review theater</a></p>'
        for theater in carry.get("reviewTheaters", [])
    )
    carry_block = ""
    if carry.get("count"):
        carry_block = f"""
        <div class="warning">
          <strong>{carry['count']} carry-forward candidate(s) need review.</strong>
          <p>{html.escape(carry.get('truth') or '')}</p>
          {theaters}
        </div>
        """
    shorts = "\n".join(render_short_html(short) for short in episode["embeddedShorts"])
    more = ""
    if episode["hiddenShortCount"]:
        more = f"<p class='warning'>{episode['hiddenShortCount']} additional native shorts are listed in the JSON/Markdown command room but not embedded here to keep the page responsive.</p>"
    return f"""
    <section class="episode" id="episode-{int(episode['episode']):02d}">
      <p class="eyebrow">Episode {int(episode['episode']):02d}</p>
      <h2>{html.escape(episode['status'])}</h2>
      <p>{html.escape(episode['nextAction'])}</p>
      <div class="episode-stats">
        <span class="pill">version {html.escape(str(episode.get('currentVersion')))}</span>
        <span class="pill">{episode['nativeShortCount']} native shorts</span>
        <span class="pill">{carry['count']} carry-forward</span>
      </div>
      {carry_block}
      <div class="short-grid">{shorts}</div>
      {more}
    </section>
    """


def render_short_html(short: dict[str, Any]) -> str:
    facts = short.get("mediaFacts", {}) if isinstance(short.get("mediaFacts"), dict) else {}
    return f"""
    <article class="short-card">
      <video controls preload="metadata" src="{html.escape(short['uri'])}"></video>
      <h3>{html.escape(short['title'])}</h3>
      <p><strong>{html.escape(str(facts.get('durationLabel', 'unknown')))}</strong> · {html.escape(str(facts.get('aspect', 'unknown')))} · audio {html.escape(str(facts.get('hasAudio', False)))} · probe {html.escape(str(facts.get('status', 'unknown')))}</p>
      <p>{html.escape(str(short.get('reviewPriorityReason') or 'Needs watch/listen review.'))}</p>
      <p>{html.escape(short['truth'])}</p>
      <code>{html.escape(short['relativePath'])}</code>
    </article>
    """


def render_recommendation_html(item: dict[str, Any]) -> str:
    return f"""
    <article class="recommendation">
      <p class="eyebrow">Episode {int(item['episode']):02d} · Short {int(item['shortIndex']):02d}</p>
      <h3>{html.escape(str(item['title']))}</h3>
      <p><strong>{html.escape(str(item.get('durationLabel')))}</strong> · {html.escape(str(item.get('aspect')))}</p>
      <p>{html.escape(str(item.get('reviewPriorityReason')))}</p>
      <p>{html.escape(', '.join(item.get('platformFit') or []))}</p>
      <code>{html.escape(str(item.get('dryRunKeepCommand')))}</code>
    </article>
    """


def write_outputs(room: dict[str, Any], output_dir: Path, basename: str, fmt: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if fmt in {"json", "all"}:
        (output_dir / f"{basename}.json").write_text(json.dumps(room, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fmt in {"markdown", "all"}:
        (output_dir / f"{basename}.md").write_text(render_markdown(room), encoding="utf-8")
    if fmt in {"html", "all"}:
        (output_dir / f"{basename}.html").write_text(render_html(room), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a read-only shorts review command room across proof episodes.")
    parser.add_argument("--board", default=str(DEFAULT_BOARD), help="Studio goal review board JSON.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export root.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default="quipsly-studio-shorts-command-room")
    parser.add_argument("--max-embed-per-episode", type=int, default=12, help="Limit embedded video previews per episode.")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    room = build_room(Path(args.board).expanduser(), root, max(args.max_embed_per_episode, 0))
    output_dir = Path(args.output_dir).expanduser()
    write_outputs(room, output_dir, args.basename, args.format)

    if args.format == "json":
        print(json.dumps(room, indent=2, sort_keys=True))
    elif args.format == "html":
        print(render_html(room), end="")
    else:
        print(render_markdown(room), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
