#!/usr/bin/env python3
"""Build a source-backed daily writing packet for Quipsly Nest.

The daily packet turns the current writing session cockpit into a calm workday:
which source-backed writing sessions to open first, what can be drafted safely,
and what must remain human-reviewed. It never edits source files, replaces the
canonical manuscript, publishes, schedules, uploads, or creates receipt truth.
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
SCHEMA = "quipsly.nest-writing.daily-packet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-daily-writing-packet")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def shell_command(parts: list[Any]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def load_latest_session_cockpit(nest_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = nest_root / "latest-nest-writing-session-cockpit.json"
    pointer = load_json(pointer_path)
    cockpit_path = Path(str(pointer.get("jsonPath") or ""))
    cockpit = load_json(cockpit_path) if cockpit_path.exists() else {}
    if not cockpit:
        raise SystemExit("No writing session cockpit found. Run ./script/agentctl.sh nest-writing-session-cockpit first.")
    return pointer, cockpit, cockpit_path


def task_focus(session: dict[str, Any]) -> str:
    task_type = str(session.get("type") or "")
    title = str(session.get("title") or "")
    if "episode" in task_type or "Episode" in title:
        return "episode-page"
    if "article" in task_type:
        return "article"
    if "outline" in task_type:
        return "outline"
    return "source-backed-writing"


def writing_prompt(session: dict[str, Any]) -> str:
    title = str(session.get("title") or "this writing task")
    focus = task_focus(session)
    if focus == "episode-page":
        return (
            f"Create a reviewable episode-page draft for {title}. Keep the source trail visible, "
            "separate summary, show notes, Patreon/social hooks, and unanswered questions, and do not treat the draft as approved copy."
        )
    if focus == "article":
        return (
            f"Turn {title} into a reviewable article draft with a clear thesis, source-backed sections, pull quotes, "
            "and questions for Charlie/Homer before publication."
        )
    if focus == "outline":
        return f"Create a structure-first outline for {title}, preserving source order and marking where human writing is still needed."
    return f"Prepare a source-backed draft or outline for {title}, with provenance visible and no source mutation."


def research_prompt(session: dict[str, Any]) -> str:
    trail = session.get("sourceTrail") if isinstance(session.get("sourceTrail"), list) else []
    titles = [str(source.get("title") or source.get("relativePath") or "") for source in trail if isinstance(source, dict)]
    source_hint = ", ".join([title for title in titles if title][:3]) or "the listed source trail"
    return (
        f"Before drafting, scan {source_hint} for claims, names, dates, episode references, and open loops. "
        "Capture missing context as questions instead of inventing certainty."
    )


def content_partner_policy() -> dict[str, Any]:
    return {
        "title": "Quipsly may draft seriously; humans decide canon.",
        "summary": (
            "Agent-authored prose is allowed and can be publication-minded, but it must keep source trail, authorship, "
            "review state, and canon/publication status visible. Drafting is useful. Silent replacement is not."
        ),
        "allowed": [
            "write bold first-pass prose",
            "try alternate structures or voices",
            "prepare source-backed article, book, social, and episode-page drafts",
            "mark uncertainties as questions instead of pretending certainty",
        ],
        "notAllowedWithoutExplicitApproval": [
            "replace the canonical manuscript",
            "mutate source files",
            "erase authorship/review provenance",
            "publish, schedule, upload, or create receipt truth",
        ],
    }


def writing_sprint_plan(session: dict[str, Any]) -> dict[str, Any]:
    title = str(session.get("title") or "this writing task")
    return {
        "title": f"25-minute source-backed writing sprint for {title}",
        "durationMinutes": 25,
        "purpose": "Move one real draft forward without losing the source trail or turning review state into fake completion.",
        "humanMoves": [
            "Open the source trail and skim only enough to feel oriented.",
            "Pick one small section, paragraph, hook, outline move, or unanswered question.",
            "Write or approve one meaningful improvement, then stop before the system becomes a maze.",
        ],
        "agentMoves": [
            "Prepare a draft packet, outline, comparison, or alternate pass with source references visible.",
            "Make uncertainty explicit as questions or research gaps.",
            "Keep the draft reviewable and reversible instead of pretending it is approved canon.",
        ],
        "doneWhen": [
            "There is one clearer draft, outline move, source question, or publication packet than when the sprint started.",
            "A human can see what changed, where it came from, and what still needs approval.",
        ],
        "reviewGate": "Drafts may be real, useful, and ambitious. They still need human review before becoming canonical or public.",
        "seriousDraftAllowed": True,
        "canonicalReplacementAllowed": False,
        "sourceMutationAllowed": False,
        "externalPublishingAllowed": False,
    }


def daily_writing_runway(first_task: dict[str, Any]) -> dict[str, Any]:
    task_title = str(first_task.get("title") or "the first source-backed task")
    return {
        "title": "Start here: one calm writing sprint",
        "recommendedTaskTitle": task_title,
        "steps": [
            "Open the first task and its source trail.",
            "Run or inspect the draft packet only if it helps you write.",
            "Spend 25 minutes making one real, reviewable improvement.",
            "Capture questions and publication hooks as notes instead of forcing fake certainty.",
        ],
        "successLooksLike": "One source-backed writing move is clearer, visible, and reviewable.",
        "notTheGoal": "Do not turn the daily packet into a committee meeting about whether writing may begin.",
    }


def safe_commands(session: dict[str, Any]) -> list[dict[str, str]]:
    task_id = str(session.get("taskId") or "")
    commands: list[dict[str, str]] = []
    if task_id:
        commands.append({
            "label": "Generate/review draft packet",
            "command": shell_command(["./script/agentctl.sh", "nest-writing-draft-packet", task_id]),
            "safety": "Local draft-packet preview only; does not mutate source files or publish.",
        })
    return commands


def build_daily_packet(nest_root: Path, limit: int) -> dict[str, Any]:
    pointer, cockpit, cockpit_path = load_latest_session_cockpit(nest_root)
    source_pointer = load_json(nest_root / "latest-nest-writing-source-packet.json")
    sessions = [item for item in (cockpit.get("sessions") or []) if isinstance(item, dict)]
    selected = sessions[: max(1, limit)]
    daily_tasks: list[dict[str, Any]] = []
    for rank, session in enumerate(selected, start=1):
        commands = safe_commands(session)
        daily_tasks.append({
            "rank": rank,
            "taskId": session.get("taskId") or "",
            "title": session.get("title") or session.get("taskId") or "Untitled writing task",
            "type": session.get("type") or "writing-task",
            "focus": task_focus(session),
            "status": session.get("status") or "ready-to-draft-with-provenance",
            "wordCount": session.get("wordCount") or 0,
            "sourceCount": session.get("sourceCount") or len(session.get("sourceTrail") or []),
            "sourceTrail": session.get("sourceTrail") if isinstance(session.get("sourceTrail"), list) else [],
            "writingPrompt": writing_prompt(session),
            "researchPrompt": research_prompt(session),
            "twentyFiveMinuteSprint": writing_sprint_plan(session),
            "seriousDraftAllowed": True,
            "canonicalReplacementAllowed": False,
            "sourceMutationAllowed": False,
            "externalPublishingAllowed": False,
            "safeNextAction": session.get("safeNextAction") or "Review the source trail, then generate a draft packet.",
            "humanReviewRequired": bool(session.get("humanReviewRequired", True)),
            "safeLocalCommands": commands,
            "blockedActions": session.get("blockedActions") or [
                "mutate-source-file",
                "publish-externally",
                "replace-canonical-manuscript-without-approval",
            ],
            "truth": "Daily writing task only. It may point to draft previews, but it does not approve, publish, replace, or mutate source material.",
        })
    first_task = daily_tasks[0] if daily_tasks else {}
    first_commands = first_task.get("safeLocalCommands") if isinstance(first_task.get("safeLocalCommands"), list) else []
    first_command = first_commands[0] if first_commands and isinstance(first_commands[0], dict) else {}
    policy = content_partner_policy()
    runway = daily_writing_runway(first_task)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "daily-writing-packet-ready",
        "nestRoot": str(nest_root),
        "sourceSessionCockpit": str(cockpit_path),
        "sourceSessionCockpitHtml": pointer.get("htmlPath") or cockpit.get("htmlPath") or "",
        "sourcePacketHtml": source_pointer.get("htmlPath") or cockpit.get("sourcePacketHtml") or "",
        "sourceWorkbenchHtml": source_pointer.get("workbenchHtmlPath") or cockpit.get("sourceWorkbenchHtml") or "",
        "truth": "Daily writing packet only. It does not edit source files, replace canonical manuscripts, approve, publish, upload, schedule, or create receipt truth.",
        "writingPartnerPolicy": policy,
        "dailyWritingRunway": runway,
        "humanAsk": "Open the first source-backed writing task, decide one writing move, then review or generate a draft packet with the source trail visible.",
        "agentSafeParallelWork": "Prepare serious drafts, outlines, draft packets, research prompts, source comparisons, and platform-copy previews. Keep provenance and review state visible. Do not mutate source files, replace canonical manuscript text, publish, schedule, upload, or create receipts.",
        "counts": {
            "selectedTasks": len(daily_tasks),
            "availableSessions": len(sessions),
            "humanReviewRequired": sum(1 for task in daily_tasks if task.get("humanReviewRequired")),
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "dailyTasks": daily_tasks,
        "nextSafestAction": "Open the first daily writing task and do one 25-minute source-backed writing sprint. Generate its draft packet if useful; do not wait for bureaucracy to bless the act of writing.",
        "firstSafeAction": {
            "label": first_command.get("label") or "Generate/review first draft packet",
            "command": first_command.get("command") or "",
            "safety": first_command.get("safety") or "Local draft-packet preview only; does not mutate source files or publish.",
            "taskId": first_task.get("taskId") or "",
            "title": first_task.get("title") or "",
            "focus": first_task.get("focus") or "",
            "sourceCount": first_task.get("sourceCount") or 0,
            "wordCount": first_task.get("wordCount") or 0,
            "twentyFiveMinuteSprint": first_task.get("twentyFiveMinuteSprint") or {},
            "seriousDraftAllowed": True,
            "canonicalReplacementAllowed": False,
        },
    }


def prepare_session_dir(nest_root: Path) -> Path:
    base = nest_root / "DailyWritingPackets" / stamp_now()
    session_dir = base
    counter = 2
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["rank", "taskId", "title", "type", "focus", "status", "wordCount", "sourceCount", "humanReviewRequired", "seriousDraftAllowed", "canonicalReplacementAllowed", "draftPacketCommand", "safeNextAction", "sprintDoneWhen"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for task in packet.get("dailyTasks") or []:
            command = ""
            commands = task.get("safeLocalCommands") if isinstance(task.get("safeLocalCommands"), list) else []
            if commands:
                command = str(commands[0].get("command") or "")
            writer.writerow({
                "rank": task.get("rank", ""),
                "taskId": task.get("taskId", ""),
                "title": task.get("title", ""),
                "type": task.get("type", ""),
                "focus": task.get("focus", ""),
                "status": task.get("status", ""),
                "wordCount": task.get("wordCount", ""),
                "sourceCount": task.get("sourceCount", ""),
                "humanReviewRequired": task.get("humanReviewRequired", ""),
                "seriousDraftAllowed": task.get("seriousDraftAllowed", ""),
                "canonicalReplacementAllowed": task.get("canonicalReplacementAllowed", ""),
                "draftPacketCommand": command,
                "safeNextAction": task.get("safeNextAction", ""),
                "sprintDoneWhen": " | ".join((task.get("twentyFiveMinuteSprint") or {}).get("doneWhen") or []),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    runway = packet.get("dailyWritingRunway") if isinstance(packet.get("dailyWritingRunway"), dict) else {}
    policy = packet.get("writingPartnerPolicy") if isinstance(packet.get("writingPartnerPolicy"), dict) else {}
    lines = [
        "# Daily writing packet",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        "## Start here",
        "",
        f"**{runway.get('title') or 'One calm writing sprint'}**",
        "",
        runway.get("successLooksLike") or "One source-backed writing move is clearer, visible, and reviewable.",
        "",
    ]
    for step in runway.get("steps") or []:
        lines.append(f"- {step}")
    lines.extend([
        "",
        "## Content partner policy",
        "",
        f"**{policy.get('title') or 'Quipsly may draft seriously; humans decide canon.'}**",
        "",
        policy.get("summary") or "Agent-authored drafts are allowed when provenance and review state stay visible.",
        "",
        "**Allowed**",
        "",
    ])
    for item in policy.get("allowed") or []:
        lines.append(f"- {item}")
    lines.extend(["", "**Not allowed without explicit approval**", ""])
    for item in policy.get("notAllowedWithoutExplicitApproval") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        f"Source cockpit: `{packet['sourceSessionCockpit']}`",
        f"Source cockpit HTML: `{packet['sourceSessionCockpitHtml']}`",
        f"Source packet HTML: `{packet['sourcePacketHtml']}`",
        "",
        "## Today-ish writing queue",
        "",
    ])
    for task in packet.get("dailyTasks") or []:
        sprint = task.get("twentyFiveMinuteSprint") if isinstance(task.get("twentyFiveMinuteSprint"), dict) else {}
        lines.extend([
            f"### {task['rank']}. {task['title']}",
            "",
            f"- Task id: `{task['taskId']}`",
            f"- Focus: `{task['focus']}`",
            f"- Status: `{task['status']}`",
            f"- Sources: `{task['sourceCount']}`",
            f"- Words: `{task['wordCount']}`",
            f"- Human review required: `{task['humanReviewRequired']}`",
            f"- Serious agent draft allowed: `{task.get('seriousDraftAllowed', True)}`",
            f"- Canonical replacement allowed: `{task.get('canonicalReplacementAllowed', False)}`",
            f"- Next: {task['safeNextAction']}",
            "",
            "**25-minute sprint**",
            "",
            sprint.get("purpose") or "Move one real draft forward without losing the source trail.",
            "",
            "**Human moves**",
            "",
        ])
        for move in sprint.get("humanMoves") or []:
            lines.append(f"- {move}")
        lines.extend(["", "**Agent moves**", ""])
        for move in sprint.get("agentMoves") or []:
            lines.append(f"- {move}")
        lines.extend(["", "**Done when**", ""])
        for done in sprint.get("doneWhen") or []:
            lines.append(f"- {done}")
        lines.extend([
            "",
            "**Writing prompt**",
            "",
            task["writingPrompt"],
            "",
            "**Research prompt**",
            "",
            task["researchPrompt"],
            "",
            "**Safe local commands**",
            "",
        ])
        for command in task.get("safeLocalCommands") or []:
            lines.append(f"- `{command.get('command')}` - {command.get('safety')}")
        lines.extend(["", "**Source trail**", ""])
        for source in task.get("sourceTrail") or []:
            if not isinstance(source, dict):
                continue
            tags = ", ".join(source.get("tags") or [])
            lines.append(f"- `{source.get('relativePath')}` - `{source.get('wordCount')}` words - {tags}")
        lines.extend(["", f"Blocked actions: `{', '.join(task.get('blockedActions') or [])}`", ""])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    cards: list[str] = []
    runway = packet.get("dailyWritingRunway") if isinstance(packet.get("dailyWritingRunway"), dict) else {}
    policy = packet.get("writingPartnerPolicy") if isinstance(packet.get("writingPartnerPolicy"), dict) else {}
    runway_steps = "".join(f"<li>{esc(step)}</li>" for step in runway.get("steps") or [])
    policy_allowed = "".join(f"<li>{esc(item)}</li>" for item in policy.get("allowed") or [])
    policy_blocked = "".join(f"<li>{esc(item)}</li>" for item in policy.get("notAllowedWithoutExplicitApproval") or [])
    for task in packet.get("dailyTasks") or []:
        sprint = task.get("twentyFiveMinuteSprint") if isinstance(task.get("twentyFiveMinuteSprint"), dict) else {}
        human_moves = "".join(f"<li>{esc(move)}</li>" for move in sprint.get("humanMoves") or [])
        agent_moves = "".join(f"<li>{esc(move)}</li>" for move in sprint.get("agentMoves") or [])
        done_when = "".join(f"<li>{esc(done)}</li>" for done in sprint.get("doneWhen") or [])
        trail = "".join(
            f"<li><code>{esc(source.get('relativePath'))}</code><span>{esc(source.get('wordCount'))} words</span></li>"
            for source in task.get("sourceTrail") or []
            if isinstance(source, dict)
        ) or "<li>No source trail listed.</li>"
        commands = "".join(
            f"<pre><code>{esc(command.get('command'))}</code></pre><p class=\"safety\">{esc(command.get('safety'))}</p>"
            for command in task.get("safeLocalCommands") or []
        ) or "<p>No command listed.</p>"
        cards.append(f"""
        <article class="task-card">
          <div class="rank">{esc(task['rank'])}</div>
          <div class="task-body">
            <div class="eyebrow">{esc(task['focus'])} · {esc(task['status'])}</div>
            <h2>{esc(task['title'])}</h2>
            <p>{esc(task['safeNextAction'])}</p>
            <div class="chips"><span>{esc(task['sourceCount'])} sources</span><span>{esc(task['wordCount'])} words</span><span>human review</span></div>
            <section class="sprint">
              <h3>Start now: 25-minute sprint</h3>
              <p>{esc(sprint.get('purpose'))}</p>
              <div class="move-grid">
                <div><h4>Human moves</h4><ul>{human_moves}</ul></div>
                <div><h4>Quipsly moves</h4><ul>{agent_moves}</ul></div>
                <div><h4>Done when</h4><ul>{done_when}</ul></div>
              </div>
              <p class="safety">{esc(sprint.get('reviewGate'))}</p>
            </section>
            <section><h3>Write</h3><p>{esc(task['writingPrompt'])}</p></section>
            <section><h3>Research first</h3><p>{esc(task['researchPrompt'])}</p></section>
            <details open><summary>Safe local command</summary>{commands}</details>
            <details><summary>Source trail</summary><ul>{trail}</ul></details>
            <p class="blocked">Blocked: {esc(', '.join(task.get('blockedActions') or []))}</p>
          </div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Daily Writing Packet</title>
  <style>
    :root {{ color-scheme:dark; --soil:#10160e; --bark:#1d2518; --moss:#95bc72; --fern:#5fbf82; --honey:#edc85e; --paper:#fff2d2; --muted:#d1c0a0; --water:#85d0da; --clay:#c66f4d; --line:rgba(255,242,210,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--paper); background:radial-gradient(circle at 18% 0%, rgba(149,188,114,.24), transparent 30%), radial-gradient(circle at 100% 10%, rgba(133,208,218,.14), transparent 28%), linear-gradient(180deg,#172315,#0c110a); }}
    header {{ padding:46px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--honey); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,90px); line-height:.9; max-width:1120px; }}
    h2 {{ margin:6px 0 8px; font-size:30px; }}
    h3 {{ margin:16px 0 4px; color:var(--moss); font-size:13px; letter-spacing:.14em; text-transform:uppercase; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary, .chips {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .summary span, .chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:800; }}
    .runway {{ margin:26px clamp(16px,4vw,62px) 0; display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:18px; }}
    .runway-card {{ border:1px solid var(--line); border-radius:28px; padding:22px; background:linear-gradient(180deg,rgba(29,37,24,.95),rgba(11,15,9,.96)); box-shadow:0 24px 64px rgba(0,0,0,.18); }}
    .runway-card strong {{ color:var(--paper); }}
    .runway-card li {{ color:var(--muted); }}
    main {{ padding:28px clamp(16px,4vw,62px) 80px; display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:18px; }}
    .task-card {{ display:grid; grid-template-columns:42px 1fr; gap:14px; border:1px solid var(--line); border-radius:28px; padding:20px; background:linear-gradient(180deg,rgba(29,37,24,.97),rgba(11,15,9,.98)); box-shadow:0 24px 64px rgba(0,0,0,.28); }}
    .rank {{ width:34px; height:34px; display:grid; place-items:center; border-radius:50%; background:rgba(237,200,94,.14); color:var(--honey); font-weight:900; border:1px solid rgba(237,200,94,.38); }}
    .sprint {{ border:1px solid rgba(237,200,94,.22); border-radius:18px; padding:14px; margin-top:14px; background:rgba(237,200,94,.07); }}
    .move-grid {{ display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; }}
    h4 {{ margin:10px 0 4px; color:var(--paper); font-size:12px; text-transform:uppercase; letter-spacing:.1em; }}
    details {{ margin-top:14px; color:var(--muted); }}
    summary {{ cursor:pointer; color:var(--paper); font-weight:900; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border:1px solid var(--line); border-radius:15px; padding:11px; background:rgba(0,0,0,.24); }}
    li {{ margin:8px 0; }}
    li span {{ color:var(--fern); margin-left:8px; }}
    .blocked {{ color:#d79878; font-size:13px; }}
    .safety {{ color:var(--fern); font-size:13px; margin-top:-4px; }}
    @media (max-width:900px) {{ .runway {{ grid-template-columns:1fr; }} .move-grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Nest daily packet</div>
    <h1>A writing day with the source trail still glowing.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary">
      <span>{packet['counts']['selectedTasks']} selected tasks</span>
      <span>{packet['counts']['availableSessions']} available sessions</span>
      <span>{packet['counts']['humanReviewRequired']} need human review</span>
      <span>0 source mutations</span>
    </div>
  </header>
  <section class="runway">
    <article class="runway-card">
      <div class="eyebrow">Start here</div>
      <h2>{esc(runway.get('title'))}</h2>
      <p><strong>{esc(runway.get('successLooksLike'))}</strong></p>
      <ul>{runway_steps}</ul>
      <p>{esc(runway.get('notTheGoal'))}</p>
    </article>
    <article class="runway-card">
      <div class="eyebrow">Content partner policy</div>
      <h2>{esc(policy.get('title'))}</h2>
      <p>{esc(policy.get('summary'))}</p>
      <h3>Allowed</h3><ul>{policy_allowed}</ul>
      <h3>Needs explicit approval</h3><ul>{policy_blocked}</ul>
    </article>
  </section>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(nest_root: Path, session_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    daily_tasks = packet.get("dailyTasks") if isinstance(packet.get("dailyTasks"), list) else []
    first_task = daily_tasks[0] if daily_tasks and isinstance(daily_tasks[0], dict) else {}
    first_commands = first_task.get("safeLocalCommands") if isinstance(first_task.get("safeLocalCommands"), list) else []
    first_command = first_commands[0] if first_commands and isinstance(first_commands[0], dict) else {}
    next_card = load_json(nest_root / "latest-nest-writing-next-card.json")
    next_card_action = next_card.get("firstSafeAction") if isinstance(next_card.get("firstSafeAction"), dict) else {}
    counts = dict(packet.get("counts") or {})
    counts["nextWritingCardReady"] = bool(next_card.get("status") == "nest-writing-next-card-ready")
    counts["nextWritingCardPathExists"] = bool(next_card.get("htmlPath") and Path(str(next_card.get("htmlPath"))).exists())
    pointer = {
        "schema": "quipsly.nest-writing.latest-daily-packet.v1",
        "updatedAt": iso_now(),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(session_dir),
        "counts": counts,
        "status": packet.get("status") or "daily-writing-packet-ready",
        "truth": packet.get("truth") or "Daily writing packet pointer only. Versioned packets are preserved.",
        "humanAsk": packet.get("humanAsk") or "Open the first source-backed writing task with source trail visible.",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "Prepare local draft/research packets only.",
        "nextSafestAction": packet.get("nextSafestAction") or "Open the first daily writing task with source trail visible.",
        "writingPartnerPolicy": packet.get("writingPartnerPolicy") or {},
        "dailyWritingRunway": packet.get("dailyWritingRunway") or {},
        "nextWritingCard": {
            "status": next_card.get("status") or "",
            "label": next_card.get("label") or next_card.get("title") or "",
            "taskId": next_card.get("taskId") or "",
            "suggestedWritingMove": next_card.get("suggestedWritingMove") or "",
            "recommendedDecision": next_card.get("recommendedDecision") or "",
            "humanAsk": next_card.get("humanAsk") or next_card.get("humanQuestion") or "",
            "codexCanContinueWith": next_card.get("codexCanContinueWith") or "",
            "htmlPath": next_card.get("htmlPath") or next_card.get("nextWritingCardPath") or "",
            "jsonPath": next_card.get("jsonPath") or "",
            "markdownPath": next_card.get("markdownPath") or "",
            "firstSafeAction": next_card_action,
            "safeDraftPacketCommand": next_card.get("safeDraftPacketCommand") or "",
            "safeDraftPacketSafety": next_card.get("safeDraftPacketSafety") or "Creates a local draft preview packet only; no canonical manuscript replacement, source mutation, publication, upload, schedule, approval, overwrite, account mutation, or receipt truth.",
            "truth": next_card.get("truth") or {},
        },
        "nextWritingCardAction": next_card_action,
        "nextWritingCardPath": next_card.get("htmlPath") or next_card.get("nextWritingCardPath") or "",
        "dailyTasks": [
            {
                "rank": task.get("rank"),
                "taskId": task.get("taskId") or "",
                "title": task.get("title") or "",
                "type": task.get("type") or "",
                "focus": task.get("focus") or "",
                "status": task.get("status") or "",
                "wordCount": task.get("wordCount") or 0,
                "sourceCount": task.get("sourceCount") or 0,
                "writingPrompt": task.get("writingPrompt") or "",
                "researchPrompt": task.get("researchPrompt") or "",
                "safeNextAction": task.get("safeNextAction") or "",
                "sourceTrail": (task.get("sourceTrail") or [])[:6] if isinstance(task.get("sourceTrail"), list) else [],
                "safeLocalCommands": task.get("safeLocalCommands") or [],
                "twentyFiveMinuteSprint": task.get("twentyFiveMinuteSprint") or {},
                "seriousDraftAllowed": task.get("seriousDraftAllowed", True),
                "canonicalReplacementAllowed": task.get("canonicalReplacementAllowed", False),
                "sourceMutationAllowed": task.get("sourceMutationAllowed", False),
                "externalPublishingAllowed": task.get("externalPublishingAllowed", False),
                "truth": task.get("truth") or "Daily writing task only. No approval, publication, source mutation, or canonical replacement occurred.",
            }
            for task in daily_tasks
            if isinstance(task, dict)
        ],
        "rows": [
            {
                "rank": task.get("rank"),
                "taskId": task.get("taskId") or "",
                "title": task.get("title") or "",
                "focus": task.get("focus") or "",
                "draftPacketCommand": ((task.get("safeLocalCommands") or [{}])[0].get("command") if isinstance(task.get("safeLocalCommands"), list) and task.get("safeLocalCommands") else ""),
                "safeNextAction": task.get("safeNextAction") or "",
                "truth": task.get("truth") or "Daily writing task only.",
            }
            for task in daily_tasks
            if isinstance(task, dict)
        ],
        "firstTask": {
            "rank": first_task.get("rank") or 0,
            "taskId": first_task.get("taskId") or "",
            "title": first_task.get("title") or "",
            "focus": first_task.get("focus") or "",
            "writingPrompt": first_task.get("writingPrompt") or "",
            "researchPrompt": first_task.get("researchPrompt") or "",
            "safeNextAction": first_task.get("safeNextAction") or "",
            "sourceCount": first_task.get("sourceCount") or 0,
            "wordCount": first_task.get("wordCount") or 0,
            "sourceTrail": (first_task.get("sourceTrail") or [])[:6] if isinstance(first_task.get("sourceTrail"), list) else [],
            "draftPacketCommand": first_command.get("command") or "",
            "commandSafety": first_command.get("safety") or "",
            "twentyFiveMinuteSprint": first_task.get("twentyFiveMinuteSprint") or {},
            "seriousDraftAllowed": first_task.get("seriousDraftAllowed", True),
            "canonicalReplacementAllowed": first_task.get("canonicalReplacementAllowed", False),
        },
        "dailyWritingFirstTask": {
            "rank": first_task.get("rank") or 0,
            "taskId": first_task.get("taskId") or "",
            "title": first_task.get("title") or "",
            "focus": first_task.get("focus") or "",
            "writingPrompt": first_task.get("writingPrompt") or "",
            "researchPrompt": first_task.get("researchPrompt") or "",
            "safeNextAction": first_task.get("safeNextAction") or "",
            "sourceCount": first_task.get("sourceCount") or 0,
            "wordCount": first_task.get("wordCount") or 0,
            "sourceTrail": (first_task.get("sourceTrail") or [])[:6] if isinstance(first_task.get("sourceTrail"), list) else [],
            "draftPacketCommand": first_command.get("command") or "",
            "commandSafety": first_command.get("safety") or "",
            "twentyFiveMinuteSprint": first_task.get("twentyFiveMinuteSprint") or {},
            "seriousDraftAllowed": first_task.get("seriousDraftAllowed", True),
            "canonicalReplacementAllowed": first_task.get("canonicalReplacementAllowed", False),
        },
        "firstWritingTask": {
            "rank": first_task.get("rank") or 0,
            "taskId": first_task.get("taskId") or "",
            "title": first_task.get("title") or "",
            "focus": first_task.get("focus") or "",
            "writingPrompt": first_task.get("writingPrompt") or "",
            "researchPrompt": first_task.get("researchPrompt") or "",
            "safeNextAction": first_task.get("safeNextAction") or "",
            "sourceCount": first_task.get("sourceCount") or 0,
            "wordCount": first_task.get("wordCount") or 0,
            "draftPacketCommand": first_command.get("command") or "",
            "commandSafety": first_command.get("safety") or "",
            "twentyFiveMinuteSprint": first_task.get("twentyFiveMinuteSprint") or {},
            "seriousDraftAllowed": first_task.get("seriousDraftAllowed", True),
            "canonicalReplacementAllowed": first_task.get("canonicalReplacementAllowed", False),
        },
        "dailyWritingTruth": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
            "humanReviewRequired": True,
        },
        "firstSafeAction": {
            "label": "Open Nest daily writing packet",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens the local daily writing packet only. It does not mutate source files, replace canon, publish, upload, schedule, approve, or create receipt truth.",
        },
        "firstWritingTaskAction": packet.get("firstSafeAction") or {},
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    write_json(nest_root / "latest-nest-writing-daily-packet.json", pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Quipsly Nest daily writing packet.")
    parser.add_argument("limit", nargs="?", type=int, default=8)
    parser.add_argument("--nest-root", default=str(DEFAULT_NEST_ROOT))
    args = parser.parse_args()

    nest_root = Path(args.nest_root)
    packet = build_daily_packet(nest_root, args.limit)
    session_dir = prepare_session_dir(nest_root)
    json_path = session_dir / "daily-writing-packet.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-daily-writing-packet.md"
    csv_path = session_dir / "daily-writing-queue.csv"
    packet.update({
        "sessionDir": str(session_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(nest_root, session_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
