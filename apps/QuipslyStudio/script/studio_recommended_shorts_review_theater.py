#!/usr/bin/env python3
"""Generate a watch-first theater for recommended native Studio shorts.

The Studio shorts command room already owns the cross-episode routing truth.
This script turns its `recommendedNextShorts` queue into a focused local review
surface: playable videos, media facts, local-intent commands, and clear truth
boundaries. It never records decisions, mutates media, publishes, or creates
approval/receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_COMMAND_ROOM_JSON = DEFAULT_ROOT / "shorts-command-room" / "quipsly-studio-shorts-command-room.json"
DEFAULT_LEDGER_JSON = DEFAULT_ROOT / "review-board" / "studio-short-review-decision-ledger" / "studio-short-review-decision-ledger.json"
DEFAULT_OUTPUT_DIR = DEFAULT_ROOT / "shorts-command-room" / "recommended-review-theater"
DEFAULT_BASENAME = "quipsly-studio-recommended-shorts-review-theater"
SCHEMA = "quipsly.studio.recommended-shorts-review-theater.v1"
VERSION = "2026-07-02.v1"


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    return data if isinstance(data, dict) else {}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def file_uri(path: Path) -> str:
    try:
        return path.expanduser().resolve().as_uri()
    except ValueError:
        return ""


def esc(value: Any) -> str:
    return html.escape(str(value if value is not None else ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def native_short_lookup(room: dict[str, Any]) -> dict[str, dict[str, Any]]:
    lookup: dict[str, dict[str, Any]] = {}
    for episode in room.get("episodes", []):
        if not isinstance(episode, dict):
            continue
        episode_number = episode.get("episode")
        for short in episode.get("nativeShorts", []):
            if not isinstance(short, dict):
                continue
            index = short.get("index")
            short_id = f"episode-{episode_number}-short-{int(index):02d}" if isinstance(index, int) else ""
            rel_path = str(short.get("relativePath") or "")
            if short_id:
                lookup[short_id] = short
            if rel_path:
                lookup[rel_path] = short
    return lookup


def ledger_lookup(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("shortId")): item
        for item in ledger.get("items", [])
        if isinstance(item, dict) and item.get("shortId")
    }


def safe_commands(short_id: str) -> dict[str, str]:
    dry = "script/agentctl.sh studio-short-review-decision-dry-run"
    live = "script/agentctl.sh studio-short-review-decision"
    return {
        "dryRunKeep": f"{dry} {shell_quote(short_id)} keep Codex 'watch/listen review: locally promising, not approval'",
        "dryRunRefine": f"{dry} {shell_quote(short_id)} refine Codex 'watch/listen review: needs crop pacing caption or audio refinement'",
        "dryRunHold": f"{dry} {shell_quote(short_id)} hold Codex 'watch/listen review: needs more evidence before deciding'",
        "dryRunReject": f"{dry} {shell_quote(short_id)} reject Codex 'watch/listen review: not a good platform candidate'",
        "recordIntentTemplate": f"{live} {shell_quote(short_id)} keep|refine|hold|reject|needs-more-evidence '<reviewer>' '<watch/listen notes>'",
    }


def build_item(root: Path, recommendation: dict[str, Any], native: dict[str, Any], ledger_item: dict[str, Any], rank: int) -> dict[str, Any]:
    short_id = str(recommendation.get("shortId") or ledger_item.get("shortId") or f"recommended-short-{rank:02d}")
    rel_path = str(recommendation.get("relativePath") or native.get("relativePath") or "")
    native_path = str(native.get("path") or "")
    path = Path(native_path) if native_path else root / rel_path
    facts = native.get("mediaFacts") if isinstance(native.get("mediaFacts"), dict) else {}
    return {
        "rank": rank,
        "shortId": short_id,
        "episode": recommendation.get("episode") or ledger_item.get("episode"),
        "version": recommendation.get("currentVersion") or ledger_item.get("version") or "",
        "title": recommendation.get("title") or native.get("title") or ledger_item.get("title") or short_id,
        "shortIndex": recommendation.get("shortIndex") or native.get("index") or ledger_item.get("shortIndex"),
        "relativePath": rel_path,
        "path": str(path),
        "uri": native.get("uri") or file_uri(path),
        "exists": bool(facts.get("exists", path.exists())),
        "decision": ledger_item.get("decision") or "pending",
        "reviewer": ledger_item.get("reviewer") or "",
        "reviewedAt": ledger_item.get("reviewedAt") or "",
        "notes": ledger_item.get("notes") or "",
        "durationLabel": recommendation.get("durationLabel") or facts.get("durationLabel") or ledger_item.get("durationLabel") or "unknown",
        "durationSeconds": recommendation.get("durationSeconds") or facts.get("durationSeconds") or ledger_item.get("durationSeconds") or 0,
        "aspect": recommendation.get("aspect") or facts.get("aspect") or ledger_item.get("aspect") or "unknown",
        "hasAudio": bool(facts.get("hasAudio", ledger_item.get("hasAudio", False))),
        "hasVideo": bool(facts.get("hasVideo", ledger_item.get("hasVideo", False))),
        "width": facts.get("width") or ledger_item.get("width") or 0,
        "height": facts.get("height") or ledger_item.get("height") or 0,
        "probeStatus": facts.get("status") or ledger_item.get("probeStatus") or "unknown",
        "probeWarning": facts.get("warning") or ledger_item.get("probeWarning") or "",
        "durationBucket": native.get("durationBucket") or ledger_item.get("durationBucket") or "",
        "platformFit": recommendation.get("platformFit") if isinstance(recommendation.get("platformFit"), list) else ledger_item.get("platformFit", []),
        "reviewPriority": recommendation.get("reviewPriority") or ledger_item.get("reviewPriority") or 9999,
        "reviewPriorityReason": recommendation.get("reviewPriorityReason") or ledger_item.get("reviewPriorityReason") or "Needs watch/listen review.",
        "commands": safe_commands(short_id),
        "truth": "Recommended review routing only. Watch/listen evidence is required before recording local intent. This is not approval, publication, upload, schedule, account mutation, or receipt truth.",
    }


def build_theater(root: Path, command_room_path: Path, ledger_path: Path, limit: int, reviewer: str) -> dict[str, Any]:
    room = read_json(command_room_path)
    ledger = read_json(ledger_path)
    native = native_short_lookup(room)
    ledger_items = ledger_lookup(ledger)
    recommendations = [item for item in room.get("recommendedNextShorts", []) if isinstance(item, dict)]
    if limit > 0:
        recommendations = recommendations[:limit]
    items = []
    for rank, recommendation in enumerate(recommendations, start=1):
        short_id = str(recommendation.get("shortId") or "")
        rel_path = str(recommendation.get("relativePath") or "")
        items.append(build_item(root, recommendation, native.get(short_id) or native.get(rel_path) or {}, ledger_items.get(short_id) or {}, rank))
    counts = {
        "items": len(items),
        "pending": sum(1 for item in items if item.get("decision") == "pending"),
        "reviewed": sum(1 for item in items if item.get("decision") != "pending"),
        "playable": sum(1 for item in items if item.get("exists") and item.get("hasVideo")),
        "probeWarnings": sum(1 for item in items if item.get("probeStatus") != "ok"),
        "externalPublishing": False,
        "approvalCreated": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "version": VERSION,
        "generatedAt": iso_now(),
        "releaseRoot": str(root),
        "reviewer": reviewer,
        "commandRoomJson": str(command_room_path),
        "ledgerJson": str(ledger_path),
        "sourceCommandRoomVersion": room.get("version"),
        "sourceLedgerStatus": ledger.get("status"),
        "counts": counts,
        "items": items,
        "nextSafestAction": "Open the HTML theater, watch/listen from the top recommendation down, dry-run any intent first, then record local intent only when the note is specific.",
        "truth": "Read-only review theater. It does not record decisions, approve publication, upload, schedule, mutate accounts, mutate media, overwrite, delete, or create platform receipt truth.",
    }


def render_markdown(theater: dict[str, Any]) -> str:
    lines = [
        "# Recommended shorts review theater",
        "",
        f"Generated: `{theater.get('generatedAt')}`",
        f"Source command room: `{theater.get('commandRoomJson')}`",
        f"Source ledger: `{theater.get('ledgerJson')}`",
        "",
        theater.get("truth", ""),
        "",
        "## Counts",
        "",
    ]
    for key, value in theater.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Review queue", ""])
    for item in theater.get("items", []):
        lines.extend(
            [
                f"### {item.get('rank')}. {item.get('shortId')} - {item.get('title')}",
                "",
                f"- Episode: `{item.get('episode')}`",
                f"- Version: `{item.get('version')}`",
                f"- Duration/aspect: `{item.get('durationLabel')}` / `{item.get('aspect')}`",
                f"- Media: `{item.get('width')}x{item.get('height')}`, audio `{item.get('hasAudio')}`, video `{item.get('hasVideo')}`, probe `{item.get('probeStatus')}`",
                f"- Decision: `{item.get('decision')}`",
                f"- Priority: `{item.get('reviewPriority')}` - {item.get('reviewPriorityReason')}",
                f"- Platform fit: {', '.join(item.get('platformFit') or [])}",
                f"- File: `{item.get('path')}`",
                f"- Dry-run keep: `{item.get('commands', {}).get('dryRunKeep')}`",
                f"- Dry-run refine: `{item.get('commands', {}).get('dryRunRefine')}`",
                f"- Record template: `{item.get('commands', {}).get('recordIntentTemplate')}`",
                "",
            ]
        )
    return "\n".join(lines).rstrip() + "\n"


def command_button(label: str, command: str) -> str:
    return f"<button type='button' data-copy='{esc(command)}'>{esc(label)}</button>"


def render_item_html(item: dict[str, Any]) -> str:
    commands = item.get("commands", {})
    platform_fit = ", ".join(item.get("platformFit") or [])
    media = (
        f"<video controls preload='metadata' src='{esc(item.get('uri'))}'></video>"
        if item.get("uri") and item.get("exists")
        else "<div class='missing'>Local media missing or not playable from this path.</div>"
    )
    return f"""
    <article class="short-card decision-{esc(item.get('decision'))}" id="{esc(item.get('shortId'))}">
      <div class="rank">#{esc(item.get('rank'))}</div>
      <div class="meta">
        <span>Episode {esc(item.get('episode'))}</span>
        <span>{esc(item.get('durationLabel'))}</span>
        <span>{esc(item.get('aspect'))}</span>
        <span>{esc(item.get('probeStatus'))}</span>
        <span>{esc(item.get('decision'))}</span>
      </div>
      <h2>{esc(item.get('title'))}</h2>
      {media}
      <p class="reason">{esc(item.get('reviewPriorityReason'))}</p>
      <dl>
        <dt>Platform fit</dt><dd>{esc(platform_fit)}</dd>
        <dt>Media</dt><dd>{esc(item.get('width'))}x{esc(item.get('height'))} · audio {esc(item.get('hasAudio'))} · video {esc(item.get('hasVideo'))}</dd>
        <dt>File</dt><dd><code>{esc(item.get('path'))}</code></dd>
        <dt>Truth</dt><dd>{esc(item.get('truth'))}</dd>
      </dl>
      <div class="commands">
        {command_button('Copy dry-run keep', commands.get('dryRunKeep', ''))}
        {command_button('Copy dry-run refine', commands.get('dryRunRefine', ''))}
        {command_button('Copy dry-run hold', commands.get('dryRunHold', ''))}
        {command_button('Copy dry-run reject', commands.get('dryRunReject', ''))}
        {command_button('Copy record template', commands.get('recordIntentTemplate', ''))}
      </div>
    </article>
    """


def render_html(theater: dict[str, Any]) -> str:
    items = "\n".join(render_item_html(item) for item in theater.get("items", []))
    jumps = "\n".join(
        f"<a href='#{esc(item.get('shortId'))}'>#{esc(item.get('rank'))} E{esc(item.get('episode'))} · {esc(item.get('durationLabel'))}</a>"
        for item in theater.get("items", [])
    )
    stats = "\n".join(
        f"<div><strong>{esc(value)}</strong><span>{esc(key)}</span></div>"
        for key, value in theater.get("counts", {}).items()
        if key in {"items", "pending", "reviewed", "playable", "probeWarnings"}
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Studio recommended shorts theater</title>
  <style>
    :root {{ color-scheme: dark; --soil:#17120c; --moss:#16251b; --canopy:#203b25; --fern:#83dd90; --honey:#f2c94c; --cream:#fff0cf; --clay:#d66b55; --water:#77d1db; --line:rgba(255,240,207,.16); }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--cream); background: radial-gradient(circle at 12% 0%, rgba(131,221,144,.18), transparent 28%), radial-gradient(circle at 86% 8%, rgba(242,201,76,.16), transparent 24%), linear-gradient(135deg, var(--moss), var(--soil)); }}
    main {{ width: min(1560px, calc(100vw - 36px)); margin: 0 auto; padding: 34px 0 90px; }}
    header, .sticky, .short-card {{ border: 1px solid var(--line); border-radius: 30px; background: rgba(255,240,207,.07); box-shadow: 0 24px 80px rgba(0,0,0,.28); }}
    header {{ padding: 30px; margin-bottom: 16px; }}
    .eyebrow {{ margin: 0 0 8px; color: var(--honey); letter-spacing: .18em; text-transform: uppercase; font-size: .78rem; font-weight: 950; }}
    h1 {{ font-size: clamp(2.4rem, 6vw, 5.7rem); line-height: .88; margin: 0 0 14px; }}
    h2 {{ margin: 10px 0; }}
    p, dd {{ color: #e1d2b4; }}
    .stats {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 20px; }}
    .stats div {{ border: 1px solid var(--line); border-radius: 18px; padding: 13px; background: rgba(0,0,0,.22); }}
    .stats strong {{ display: block; color: var(--fern); font-size: 2rem; }}
    .stats span {{ color: #cdbf9e; text-transform: uppercase; letter-spacing: .1em; font-size: .72rem; font-weight: 900; }}
    .sticky {{ position: sticky; top: 0; z-index: 20; padding: 14px; margin-bottom: 18px; backdrop-filter: blur(18px); background: rgba(21,30,20,.86); }}
    .jumps {{ display: flex; flex-wrap: wrap; gap: 8px; }}
    .jumps a, button {{ border: 1px solid var(--line); border-radius: 999px; color: var(--cream); background: rgba(0,0,0,.24); padding: 8px 11px; text-decoration: none; font-weight: 850; }}
    button {{ cursor: pointer; }}
    button:hover, .jumps a:hover {{ border-color: rgba(242,201,76,.55); color: var(--honey); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 18px; }}
    .short-card {{ position: relative; padding: 16px; overflow: hidden; }}
    .short-card::before {{ content: ""; position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at 15% 0%, rgba(131,221,144,.09), transparent 34%); }}
    .rank {{ position: absolute; top: 14px; right: 14px; color: var(--honey); font-size: 2rem; font-weight: 950; opacity: .72; }}
    .meta {{ display: flex; flex-wrap: wrap; gap: 7px; padding-right: 58px; }}
    .meta span {{ border: 1px solid var(--line); background: rgba(0,0,0,.25); border-radius: 999px; padding: 7px 9px; font-size: .76rem; font-weight: 900; }}
    video {{ width: 100%; aspect-ratio: 9 / 16; max-height: 570px; object-fit: contain; border: 1px solid rgba(242,201,76,.22); border-radius: 20px; background: #050402; }}
    .missing {{ min-height: 420px; display: grid; place-items: center; border: 1px solid rgba(214,107,85,.45); border-radius: 20px; color: var(--clay); background: rgba(0,0,0,.24); }}
    .reason {{ color: var(--honey); font-weight: 850; }}
    dl {{ display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 8px; }}
    dt {{ color: var(--fern); font-weight: 950; }}
    code {{ color: #ffeaa3; overflow-wrap: anywhere; }}
    .commands {{ display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }}
    .toast {{ position: fixed; right: 20px; bottom: 20px; padding: 12px 16px; border-radius: 16px; background: rgba(22,37,27,.95); border: 1px solid rgba(131,221,144,.42); color: var(--fern); opacity: 0; transform: translateY(8px); transition: .2s; }}
    .toast.show {{ opacity: 1; transform: translateY(0); }}
  </style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Quipsly Studio · recommended shorts</p>
    <h1>Watch first. Decide second. Never fake receipt truth.</h1>
    <p>{esc(theater.get('nextSafestAction'))}</p>
    <p>{esc(theater.get('truth'))}</p>
    <div class="stats">{stats}</div>
  </header>
  <section class="sticky">
    <p class="eyebrow">Jump to candidate</p>
    <div class="jumps">{jumps}</div>
  </section>
  <section class="grid">{items}</section>
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


def write_outputs(theater: dict[str, Any], output_dir: Path, basename: str, fmt: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if fmt in {"json", "all"}:
        (output_dir / f"{basename}.json").write_text(json.dumps(theater, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if fmt in {"markdown", "all"}:
        (output_dir / f"{basename}.md").write_text(render_markdown(theater), encoding="utf-8")
    if fmt in {"html", "all"}:
        (output_dir / f"{basename}.html").write_text(render_html(theater), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate a read-only theater for recommended native Studio shorts.")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Episode export root.")
    parser.add_argument("--command-room", default=str(DEFAULT_COMMAND_ROOM_JSON), help="Shorts command room JSON.")
    parser.add_argument("--ledger", default=str(DEFAULT_LEDGER_JSON), help="Native short review decision ledger JSON.")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Output directory.")
    parser.add_argument("--basename", default=DEFAULT_BASENAME)
    parser.add_argument("--limit", type=int, default=12, help="Maximum recommended shorts to include. Use 0 for all recommendations.")
    parser.add_argument("--reviewer", default="Codex")
    parser.add_argument("--format", choices=["markdown", "json", "html", "all"], default="all")
    parser.add_argument("--markdown", dest="format", action="store_const", const="markdown", help="Print/write Markdown only.")
    parser.add_argument("--json", dest="format", action="store_const", const="json", help="Print/write JSON only.")
    parser.add_argument("--html", dest="format", action="store_const", const="html", help="Print/write HTML only.")
    parser.add_argument("--all", dest="format", action="store_const", const="all", help="Write all formats.")
    args = parser.parse_args()

    root = Path(args.root).expanduser()
    theater = build_theater(
        root=root,
        command_room_path=Path(args.command_room).expanduser(),
        ledger_path=Path(args.ledger).expanduser(),
        limit=max(args.limit, 0),
        reviewer=args.reviewer,
    )
    output_dir = Path(args.output_dir).expanduser()
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
