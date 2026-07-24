#!/usr/bin/env python3
"""Build a focused Nest writing session cockpit from the latest workbench.

This is a calm operator view for writing sessions. It never edits source files,
replaces canonical manuscripts, publishes, or approves drafts. It points humans
and agents at source-backed tasks and safe draft-packet commands.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-writing-session-cockpit")


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def load_latest_workbench(nest_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer = load_json(nest_root / "latest-nest-writing-source-packet.json")
    workbench_path = Path(str(pointer.get("workbenchJsonPath") or ""))
    workbench = load_json(workbench_path) if workbench_path.exists() else {}
    if not workbench:
        raise SystemExit("No Nest writing workbench found. Run ./script/agentctl.sh nest-writing-workbench first.")
    return pointer, workbench, workbench_path


def index_action_cards(workbench: dict[str, Any]) -> dict[str, dict[str, Any]]:
    cards = workbench.get("actionCards") if isinstance(workbench.get("actionCards"), list) else []
    return {str(card.get("id") or ""): card for card in cards if isinstance(card, dict) and card.get("id")}


def task_score(task: dict[str, Any]) -> tuple[int, int, str]:
    task_type = str(task.get("type") or "")
    title = str(task.get("title") or "")
    if task_type == "episode-page" and "Episode 1" in title:
        lane = 0
    elif task_type == "episode-page" and "Episode" in title:
        lane = 1
    elif task_type == "article" or "article" in task_type:
        lane = 2
    else:
        lane = 3
    try:
        word_count = int(task.get("wordCount") or 0)
    except Exception:
        word_count = 0
    return lane, -word_count, title


def build_start_here(sessions: list[dict[str, Any]], available_count: int, workstream_count: int) -> dict[str, Any]:
    first = sessions[0] if sessions else {}
    if not first:
        return {
            "mode": "refresh-source-packet",
            "title": "Refresh Nest writing sources",
            "why": "No writing session is currently selected, so the safest move is to rebuild the source packet before drafting.",
            "safeCommand": "./script/agentctl.sh nest-writing-workbench",
            "humanQuestion": "Which source-backed book, article, episode page, or research note should become the next draft packet?",
            "agentMove": "Refresh source evidence and prepare a small, reviewable writing queue.",
        }
    command = str(first.get("draftPacketCommand") or "")
    return {
        "mode": "start-one-writing-session",
        "title": first.get("title") or first.get("taskId") or "First writing session",
        "why": "The calmest writing move is one source-backed session, not a giant rewrite. Open one packet, keep the source trail visible, and make one useful writing decision.",
        "safeCommand": command,
        "humanQuestion": "Should this become an outline, draft, rewrite, source-check, article seed, episode-page pass, or hold?",
        "agentMove": "Prepare source-backed draft material, outlines, comparison notes, and platform hooks without mutating source or canonical manuscript text.",
        "countsContext": {
            "selectedSessions": len(sessions),
            "availableDraftQueue": available_count,
            "workstreams": workstream_count,
        },
    }


def build_cockpit(nest_root: Path, limit: int = 16) -> dict[str, Any]:
    pointer, workbench, workbench_path = load_latest_workbench(nest_root)
    cards_by_id = index_action_cards(workbench)
    draft_queue = [item for item in (workbench.get("draftQueue") or []) if isinstance(item, dict)]
    selected = sorted(draft_queue, key=task_score)[: max(1, limit)]
    sessions: list[dict[str, Any]] = []
    for rank, task in enumerate(selected, start=1):
        task_id = str(task.get("id") or "")
        card = cards_by_id.get(task_id, {})
        source_trail = card.get("sourceTrail") if isinstance(card.get("sourceTrail"), list) else []
        sessions.append({
            "rank": rank,
            "taskId": task_id,
            "title": task.get("title") or card.get("label") or task_id,
            "type": task.get("type") or card.get("type") or "writing-task",
            "status": task.get("status") or card.get("status") or "ready-to-review",
            "wordCount": task.get("wordCount") or 0,
            "sourceCount": len(task.get("sourceIds") or []),
            "sourceIds": task.get("sourceIds") or [],
            "sourceTrail": source_trail,
            "safeNextAction": task.get("safeNextAction") or card.get("explanation") or "Review sources, then draft with provenance visible.",
            "humanReviewRequired": bool(task.get("humanReviewRequired", True)),
            "allowedActions": card.get("allowedActions") or ["create-outline-preview", "create-draft-preview", "create-social-copy-preview"],
            "blockedActions": card.get("blockedActions") or ["mutate-source-file", "publish-externally", "replace-canonical-manuscript-without-approval"],
            "draftPacketCommand": shell_command(["./script/agentctl.sh", "nest-writing-draft-packet", task_id]),
            "truth": "Writing session task only. It may create reviewable previews, but it does not mutate source files, replace manuscripts, approve, or publish.",
        })
    workstreams = workbench.get("workstreams") if isinstance(workbench.get("workstreams"), list) else []
    start_here = build_start_here(sessions, len(draft_queue), len(workstreams))
    return {
        "schema": "quipsly.nest-writing.session-cockpit.v1",
        "generatedAt": iso_now(),
        "status": "writing-session-cockpit-ready" if sessions else "writing-session-cockpit-needs-source-refresh",
        "nestRoot": str(nest_root),
        "sourcePointer": str(nest_root / "latest-nest-writing-source-packet.json"),
        "sourceWorkbench": str(workbench_path),
        "sourcePacketHtml": pointer.get("htmlPath") or "",
        "sourceWorkbenchHtml": pointer.get("workbenchHtmlPath") or "",
        "startHereToday": start_here,
        "truth": "Writing cockpit is local planning and preview guidance only. It does not edit source files, replace canonical manuscripts, publish, upload, schedule, approve, or create receipt truth.",
        "counts": {
            "selectedSessions": len(sessions),
            "availableDraftQueue": len(draft_queue),
            "workstreams": len(workstreams),
            "sourceFilesMutated": False,
            "externalPublishing": False,
        },
        "sessions": sessions,
        "workstreams": workstreams,
        "humanAsk": start_here.get("humanQuestion") or "Pick one writing session and keep its source trail visible.",
        "agentSafeParallelWork": start_here.get("agentMove") or "Prepare source-backed draft material without mutating source or canon.",
        "nextSafestAction": f"{start_here.get('title')}: {start_here.get('why')}",
        "firstSafeAction": {
            "label": "Open first writing packet command",
            "command": start_here.get("safeCommand") or "",
            "safety": "Local writing packet generation/opening only. No source mutation, canonical replacement, publication, upload, schedule, approval, or receipt capture occurs.",
        },
    }


def prepare_session_dir(nest_root: Path) -> Path:
    base = nest_root / "WritingSessionCockpit" / stamp_now()
    counter = 2
    session_dir = base
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["rank", "taskId", "title", "type", "status", "wordCount", "sourceCount", "humanReviewRequired", "draftPacketCommand", "safeNextAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for session in packet.get("sessions") or []:
            writer.writerow({field: session.get(field, "") for field in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Nest writing session cockpit",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Status: `{packet.get('status')}`",
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Human ask: {packet.get('humanAsk')}",
        "",
        "## Start here today",
        "",
        f"- Title: {packet.get('startHereToday', {}).get('title')}",
        f"- Why: {packet.get('startHereToday', {}).get('why')}",
        f"- Safe command: `{packet.get('startHereToday', {}).get('safeCommand') or ''}`",
        "",
        f"Source workbench: `{packet['sourceWorkbench']}`",
        f"Source workbench HTML: `{packet['sourceWorkbenchHtml']}`",
        "",
        "## Writing sessions",
        "",
    ]
    for session in packet.get("sessions") or []:
        lines.extend([
            f"### {session['rank']}. {session['title']}",
            "",
            f"- Task id: `{session['taskId']}`",
            f"- Type: `{session['type']}`",
            f"- Status: `{session['status']}`",
            f"- Source count: `{session['sourceCount']}`",
            f"- Word count: `{session['wordCount']}`",
            f"- Next: {session['safeNextAction']}",
            f"- Draft packet command: `{session['draftPacketCommand']}`",
            "- Source trail:",
        ])
        for source in session.get("sourceTrail") or []:
            lines.append(f"  - `{source.get('relativePath')}` `{source.get('wordCount')}` words tags `{', '.join(source.get('tags') or [])}`")
        lines.extend(["", "- Guardrails:"])
        lines.append(f"  - allowed: `{', '.join(session.get('allowedActions') or [])}`")
        lines.append(f"  - blocked: `{', '.join(session.get('blockedActions') or [])}`")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def write_html(path: Path, packet: dict[str, Any]) -> None:
    cards = []
    for session in packet.get("sessions") or []:
        trail = "".join(
            f"<li><code>{esc(source.get('relativePath'))}</code><span>{esc(source.get('wordCount'))} words</span></li>"
            for source in session.get("sourceTrail") or []
        ) or "<li>No source trail listed.</li>"
        blocked = ", ".join(session.get("blockedActions") or [])
        cards.append(f"""
        <article class=\"session-card\">
          <div class=\"rank\">#{esc(session['rank'])}</div>
          <div>
            <div class=\"eyebrow\">{esc(session['type'])} · {esc(session['status'])}</div>
            <h2>{esc(session['title'])}</h2>
            <p>{esc(session['safeNextAction'])}</p>
            <div class=\"chips\"><span>{esc(session['sourceCount'])} sources</span><span>{esc(session['wordCount'])} words</span><span>human review required</span></div>
            <details open><summary>Source trail</summary><ul>{trail}</ul></details>
            <details><summary>Draft packet command</summary><pre><code>{esc(session['draftPacketCommand'])}</code></pre></details>
            <p class=\"blocked\">Blocked actions: {esc(blocked)}</p>
          </div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
  <title>Nest Writing Session Cockpit</title>
  <style>
    :root {{ color-scheme:dark; --bg:#11180f; --panel:#1d2a1c; --ink:#faf0d8; --muted:#cdbf9f; --leaf:#9dc37a; --gold:#ebc85d; --water:#84c8d6; --line:rgba(250,240,216,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top left, rgba(157,195,122,.22), transparent 34%), linear-gradient(180deg,#152315,#0e140d); }}
    header {{ padding:42px clamp(22px,5vw,76px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:8px 0; font-size:clamp(42px,7vw,86px); line-height:.92; max-width:1120px; }}
    h2 {{ margin:6px 0; font-size:30px; }}
    p {{ color:var(--muted); line-height:1.5; max-width:980px; }}
    .summary, .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .summary span, .chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.05); color:var(--muted); font-weight:800; }}
    main {{ padding:26px clamp(16px,4vw,58px) 70px; display:grid; grid-template-columns:repeat(auto-fit,minmax(380px,1fr)); gap:16px; }}
    .session-card {{ display:grid; grid-template-columns:auto 1fr; gap:14px; border:1px solid var(--line); border-radius:24px; padding:18px; background:linear-gradient(180deg,rgba(29,42,28,.97),rgba(9,13,8,.97)); box-shadow:0 18px 52px rgba(0,0,0,.25); }}
    .rank {{ color:var(--gold); font-weight:900; padding-top:3px; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    details {{ color:var(--muted); margin-top:12px; }}
    li {{ margin:8px 0; }}
    li span {{ color:var(--leaf); margin-left:8px; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:14px; padding:10px; background:rgba(0,0,0,.23); }}
    .blocked {{ color:#d6a07e; font-size:13px; }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Quipsly Nest</div>
    <h1>Write from sources without losing the thread.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <p><strong>Start here:</strong> {esc((packet.get('startHereToday') or {}).get('humanQuestion'))}</p>
    <div class=\"summary\"><span>{esc(packet.get('status'))}</span><span>{packet['counts']['selectedSessions']} selected sessions</span><span>{packet['counts']['availableDraftQueue']} draft queue items</span><span>{packet['counts']['workstreams']} workstreams</span><span>0 source mutations</span></div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(nest_root: Path, session_dir: Path, packet: dict[str, Any]) -> None:
    first_writing_session_action = packet.get("firstSafeAction") or {}
    pointer = {
        "schema": "quipsly.nest-writing.latest-session-cockpit.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "writing-session-cockpit-ready",
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "nest-writing-session-cockpit.json"),
        "markdownPath": str(session_dir / "START-HERE-writing-session-cockpit.md"),
        "csvPath": str(session_dir / "writing-session-queue.csv"),
        "counts": packet.get("counts") or {},
        "startHereToday": packet.get("startHereToday") or {},
        "sessions": [
            {
                "rank": session.get("rank"),
                "taskId": session.get("taskId") or "",
                "title": session.get("title") or "",
                "type": session.get("type") or "",
                "status": session.get("status") or "",
                "wordCount": session.get("wordCount") or 0,
                "sourceCount": session.get("sourceCount") or 0,
                "sourceTrail": (session.get("sourceTrail") or [])[:6] if isinstance(session.get("sourceTrail"), list) else [],
                "safeNextAction": session.get("safeNextAction") or "",
                "humanReviewRequired": bool(session.get("humanReviewRequired", True)),
                "draftPacketCommand": session.get("draftPacketCommand") or "",
                "allowedActions": session.get("allowedActions") or [],
                "blockedActions": session.get("blockedActions") or [],
                "truth": session.get("truth") or "Writing session task only. No source mutation, canonical replacement, approval, or publication occurred.",
            }
            for session in (packet.get("sessions") or [])
            if isinstance(session, dict)
        ],
        "rows": [
            {
                "rank": session.get("rank"),
                "taskId": session.get("taskId") or "",
                "title": session.get("title") or "",
                "type": session.get("type") or "",
                "status": session.get("status") or "",
                "draftPacketCommand": session.get("draftPacketCommand") or "",
                "safeNextAction": session.get("safeNextAction") or "",
                "truth": session.get("truth") or "Writing session task only.",
            }
            for session in (packet.get("sessions") or [])
            if isinstance(session, dict)
        ],
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "humanAsk": packet.get("humanAsk") or "",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "",
        "firstSafeAction": {
            "label": "Open Nest writing session cockpit",
            "command": f"open {shlex.quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens the local writing cockpit only. It does not edit source files, replace canon, publish, upload, schedule, approve, or create receipt truth.",
        },
        "firstWritingSessionAction": first_writing_session_action,
        "truth": "Pointer only. Session cockpit artifacts are versioned and preserved.",
    }
    write_json(nest_root / "latest-nest-writing-session-cockpit.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Nest writing session cockpit.")
    parser.add_argument("nest_root", nargs="?", type=Path, default=DEFAULT_NEST_ROOT)
    parser.add_argument("--limit", type=int, default=16)
    args = parser.parse_args()
    nest_root = args.nest_root.expanduser().resolve()
    packet = build_cockpit(nest_root, limit=args.limit)
    session_dir = prepare_session_dir(nest_root)
    packet["sessionDir"] = str(session_dir)
    packet["htmlPath"] = str(session_dir / "index.html")
    packet["jsonPath"] = str(session_dir / "nest-writing-session-cockpit.json")
    packet["markdownPath"] = str(session_dir / "START-HERE-writing-session-cockpit.md")
    packet["csvPath"] = str(session_dir / "writing-session-queue.csv")
    write_json(session_dir / "nest-writing-session-cockpit.json", packet)
    write_csv(session_dir / "writing-session-queue.csv", packet)
    write_markdown(session_dir / "START-HERE-writing-session-cockpit.md", packet)
    write_html(session_dir / "index.html", packet)
    update_pointer(nest_root, session_dir, packet)
    print(json.dumps({
        "ok": True,
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "status": packet["status"],
        "startHereToday": packet.get("startHereToday") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "counts": packet["counts"],
        "truth": packet["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
