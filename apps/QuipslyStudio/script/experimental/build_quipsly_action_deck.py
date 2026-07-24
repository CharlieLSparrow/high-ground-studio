#!/usr/bin/env python3
"""Build a safe action deck from the latest Quipsly OS board.

The action deck is a copyable command/control surface for humans and agents. It
separates local-safe commands from approval-required receipt/publishing templates.
It never executes the commands it displays.
"""
from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-board.json"
DEFAULT_RETURN_BRIEF_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-return-brief.json"
DEFAULT_PRODUCTION_RUNWAY_POINTER = DEFAULT_OS_ROOT.parent / "ProductionRunway" / "latest-quipsly-production-runway.json"
SCHEMA = "quipsly.safe-action-deck.v1"
HUMAN_ASK = (
    "Use this deck to copy or open local-safe commands only. "
    "Treat approval-required or unknown commands as blocked until exact human approval and real external evidence exist."
)
AGENT_SAFE_PARALLEL_WORK = (
    "Codex can add safer local commands, improve command labels, and prepare dry-run packets. "
    "Generating this deck must not execute any command or imply approval."
)

SAFE_LOCAL_PREFIXES = (
    "./script/agentctl.sh tower-review-decision ",
    "./script/agentctl.sh photo-grove-decision ",
    "./script/agentctl.sh photo-grove-group-decision ",
    "./script/agentctl.sh studio360-repair-decision ",
    "./script/agentctl.sh studio360-repair-status",
    "./script/agentctl.sh studio-duration-decision-sheet",
    "./script/agentctl.sh episode4-sync-stack",
    "./script/agentctl.sh tower-review-anomalies",
    "./script/agentctl.sh photo-grove-client-proof",
    "./script/agentctl.sh photo-grove-status",
    "./script/agentctl.sh photo-grove-decision-desk",
    "./script/agentctl.sh photo-grove-control-room",
    "./script/agentctl.sh quipsly-return-brief",
    "./script/agentctl.sh quipsly-human-help-board",
    "./script/agentctl.sh nest-writing-daily-packet",
    "./script/agentctl.sh nest-writing-draft-packet ",
)
APPROVAL_REQUIRED_PREFIXES = (
    "./script/agentctl.sh tower-receipt ",
    "./script/agentctl.sh release-receipt",
)
PLACEHOLDER_TOKENS = (
    "<real-url>",
    "<provider-id>",
    "<posted-at-iso>",
    "<captured-by>",
    "<reviewer>",
    "PHOTO_ID",
    "keep|reject|review|favorite|pending",
)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    if target_path and target_path.exists() and target_path != path:
        target = load_json(target_path)
        if target:
            return {**pointer, **target}
    return pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def resolve_board(pointer_path: Path) -> tuple[dict[str, Any], Path, dict[str, Any]]:
    pointer = load_json(pointer_path)
    board_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else pointer_path
    board = load_json(board_path)
    return board, board_path, pointer


def priority_rank(value: str) -> int:
    return {"attention": 0, "review": 1, "ready": 2}.get(value, 3)


def card_identity(card: dict[str, Any]) -> str:
    parts = [
        str(card.get("id") or ""),
        str(card.get("lane") or ""),
        str(card.get("title") or card.get("action") or ""),
        str(card.get("status") or card.get("reframeStatus") or ""),
    ]
    return "::".join(parts)


def sort_cards(cards: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        cards,
        key=lambda card: (
            priority_rank(str(card.get("priority") or "")),
            str(card.get("lane") or ""),
            str(card.get("deckSortKey") or card.get("title") or card.get("action") or ""),
            str(card.get("id") or ""),
        ),
    )


def select_balanced_cards(cards: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Pick action cards without letting one lane crowd out the others.

    The deck is a working surface, not a sortable archive. A purely alphabetical
    top-N sort can hide entire lanes when several systems are all attention
    priority. We still honor priority first, then round-robin across lanes inside
    each priority band so Studio, Nest, Tower, Photo Grove, and 360 all keep a
    visible next action.
    """
    ordered = sort_cards([card for card in cards if isinstance(card, dict)])
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    priority_bands = sorted({priority_rank(str(card.get("priority") or "")) for card in ordered})
    for band in priority_bands:
        band_cards = [card for card in ordered if priority_rank(str(card.get("priority") or "")) == band]
        lanes = sorted({str(card.get("lane") or "") for card in band_cards})
        while len(selected) < limit:
            added_in_round = False
            for lane in lanes:
                for card in band_cards:
                    if str(card.get("lane") or "") != lane:
                        continue
                    key = card_identity(card)
                    if key in selected_ids:
                        continue
                    selected.append(card)
                    selected_ids.add(key)
                    added_in_round = True
                    break
                if len(selected) >= limit:
                    return selected
            if not added_in_round:
                break
    return selected


def command_kind(command: str) -> tuple[str, str]:
    if not command:
        return "none", "No command available."
    if " && " in command:
        parts = [part.strip() for part in command.split(" && ") if part.strip()]
        kinds = [command_kind(part)[0] for part in parts]
        if parts and all(kind in {"safe-local", "open-local"} for kind in kinds):
            return "safe-local", "Local command chain. Each step is local/open-only and does not publish, upload, delete, or mutate source media."
        if any(kind == "approval-required" for kind in kinds):
            return "approval-required", "Command chain includes approval-required receipt or publication proof work."
        return "review-before-run", "Command chain includes a template or unknown command. Review before running."
    if any(token in command for token in PLACEHOLDER_TOKENS) and command.startswith(APPROVAL_REQUIRED_PREFIXES):
        return "approval-required", "Receipt/publishing proof template. Use only after explicit approval and a real external URL/provider receipt exists."
    if any(token in command for token in PLACEHOLDER_TOKENS):
        return "review-before-run", "Template command. Replace placeholders and review intent before running."
    if command.startswith(APPROVAL_REQUIRED_PREFIXES):
        return "approval-required", "Receipt command. Do not run unless the exact external receipt/action has been explicitly approved."
    if command.startswith(SAFE_LOCAL_PREFIXES):
        return "safe-local", "Local metadata/review command. It does not publish, upload, delete, or mutate source media."
    if command.startswith("open "):
        return "open-local", "Open local artifact only."
    return "review-before-run", "Unknown command shape. Review before running."


def add_command(commands: list[dict[str, str]], label: str, command: str, source: str) -> None:
    if not command:
        return
    kind, safety = command_kind(command)
    commands.append({"label": label, "command": command, "kind": kind, "source": source, "safety": safety})


def first_existing_path(card: dict[str, Any]) -> tuple[str, str]:
    candidates = [
        ("durationDecisionSheetHtml", "Duration decision sheet"),
        ("anomalySheetHtml", "Tower review anomaly sheet"),
        ("runwayHtml", "Runway packet"),
        ("durationWarningReviewHtml", "Duration warning packet"),
    ]
    repair = card.get("repairTask") if isinstance(card.get("repairTask"), dict) else {}
    if repair.get("markdownPath"):
        return str(repair.get("markdownPath")), "360 repair task"
    if repair.get("jsonPath"):
        return str(repair.get("jsonPath")), "360 repair task JSON"
    for key, label in candidates:
        if card.get(key):
            return str(card.get(key)), label
    if card.get("runwayJson"):
        return str(card.get("runwayJson")), "Runway JSON"
    return "", ""


def commands_from_duration_sheet(card: dict[str, Any]) -> list[dict[str, str]]:
    commands: list[dict[str, str]] = []
    json_path = card.get("durationDecisionSheetJson") or ""
    if not json_path:
        return commands
    packet = load_json(Path(str(json_path)))
    try:
        episode = int(card.get("episode") or 0)
    except (TypeError, ValueError):
        episode = 0
    for item in packet.get("episodes") or []:
        if not isinstance(item, dict) or int(item.get("episode") or 0) != episode:
            continue
        for command in item.get("safeReviewCommands") or []:
            add_command(commands, "Duration review decision", str(command), "duration-decision-sheet")
    return commands


def commands_from_anomaly_sheet(card: dict[str, Any]) -> list[dict[str, str]]:
    commands: list[dict[str, str]] = []
    json_path = card.get("anomalySheetJson") or ""
    if not json_path:
        return commands
    packet = load_json(Path(str(json_path)))
    try:
        episode = int(card.get("episode") or 0)
    except (TypeError, ValueError):
        episode = 0
    for item in packet.get("anomalies") or []:
        if not isinstance(item, dict) or int(item.get("episode") or 0) != episode:
            continue
        add_command(commands, "Reset diagnostic decision to pending", str(item.get("resetToPendingCommand") or ""), "tower-anomaly-sheet")
        add_command(commands, "Replace with real hold", str(item.get("replaceWithRealHoldCommand") or ""), "tower-anomaly-sheet")
        add_command(commands, "Approve after real review", str(item.get("approveAfterReviewCommand") or ""), "tower-anomaly-sheet")
    return commands


def suggested_commands(card: dict[str, Any]) -> list[dict[str, str]]:
    commands: list[dict[str, str]] = []
    open_path, open_label = first_existing_path(card)
    if open_path:
        add_command(commands, f"Open {open_label}", f"open {shell_quote(open_path)}", "artifact-path")
    add_command(commands, "Card command template", str(card.get("firstReceiptTemplate") or ""), "action-card")
    commands.extend(commands_from_duration_sheet(card))
    commands.extend(commands_from_anomaly_sheet(card))

    if card.get("lane") == "360 workflow" and card.get("groupKey"):
        group_key = str(card.get("groupKey"))
        add_command(commands, "Inspect 360 repair ledger", "./script/agentctl.sh studio360-repair-status", "360-suggested")
        add_command(commands, "Mark 360 source needs redownload", f"./script/agentctl.sh studio360-repair-decision {group_key} needs-redownload '<reviewer>' '<source missing/damaged; re-copy or re-download needed>'", "360-suggested")
        add_command(commands, "Park 360 source if human confirms not needed", f"./script/agentctl.sh studio360-repair-decision {group_key} park '<reviewer>' '<not needed for current edit; source preserved>'", "360-suggested")
    return commands


def build_rows(board: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    queue = board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else []
    queue = select_balanced_cards(queue, limit)
    rows: list[dict[str, Any]] = []
    for rank, card in enumerate(queue, 1):
        if not isinstance(card, dict):
            continue
        commands = suggested_commands(card)
        safe_count = sum(1 for command in commands if command["kind"] in {"safe-local", "open-local"})
        approval_count = sum(1 for command in commands if command["kind"] == "approval-required")
        rows.append({
            "rank": rank,
            "id": card.get("id") or f"action-{rank}",
            "lane": card.get("lane") or "",
            "priority": card.get("priority") or "",
            "status": card.get("status") or card.get("reframeStatus") or "",
            "action": card.get("action") or "",
            "explanation": card.get("explanation") or card.get("nextSafestAction") or "",
            "safety": card.get("safety") or "Local guidance only.",
            "commands": commands,
            "safeLocalCommandCount": safe_count,
            "approvalRequiredCommandCount": approval_count,
        })
    return rows


def build_rows_from_runway(runway: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    cards = runway.get("cards") if isinstance(runway.get("cards"), list) else []
    cards = select_balanced_cards(cards, limit)
    rows: list[dict[str, Any]] = []
    for rank, card in enumerate(cards, 1):
        if not isinstance(card, dict):
            continue
        commands: list[dict[str, str]] = []
        first = card.get("firstSafeAction") if isinstance(card.get("firstSafeAction"), dict) else {}
        add_command(commands, str(first.get("label") or "Open local evidence"), str(first.get("command") or card.get("openCommand") or card.get("primaryCommand") or ""), "production-runway")
        safe_count = sum(1 for command in commands if command["kind"] in {"safe-local", "open-local"})
        approval_count = sum(1 for command in commands if command["kind"] == "approval-required")
        safe_title = "".join(ch if ch.isalnum() else "-" for ch in str(card.get("title") or "card").lower()).strip("-")
        rows.append({
            "rank": rank,
            "id": f"production-runway-{rank}-{safe_title[:40]}",
            "lane": card.get("lane") or "",
            "priority": card.get("priority") or "",
            "status": card.get("status") or "",
            "action": card.get("title") or "Open production runway evidence",
            "explanation": card.get("nextSafestAction") or card.get("nextAction") or "Open local evidence and choose the next reversible action.",
            "safety": card.get("truth") or "Production runway card only. No command is executed by this deck.",
            "commands": commands,
            "safeLocalCommandCount": safe_count,
            "approvalRequiredCommandCount": approval_count,
        })
    return rows


def build_operating_loop_rows(start_rank: int) -> list[dict[str, Any]]:
    packet = load_pointer_target(DEFAULT_RETURN_BRIEF_POINTER)
    loops = packet.get("operatingLoops") if isinstance(packet.get("operatingLoops"), list) else []
    rows: list[dict[str, Any]] = []
    for offset, loop in enumerate(loops, 0):
        if not isinstance(loop, dict):
            continue
        commands: list[dict[str, str]] = []
        add_command(commands, "Open loop control room", str(loop.get("openCommand") or ""), "return-brief-loop")
        for step in loop.get("steps") or []:
            if not isinstance(step, dict):
                continue
            command = str(step.get("command") or "")
            if any(token in command for token in PLACEHOLDER_TOKENS):
                continue
            add_command(
                commands,
                f"Step {step.get('index') or '?'}: {step.get('label') or 'loop step'}",
                command,
                "return-brief-loop",
            )
        safe_count = sum(1 for command in commands if command["kind"] in {"safe-local", "open-local"})
        approval_count = sum(1 for command in commands if command["kind"] == "approval-required")
        rows.append({
            "rank": start_rank + offset,
            "id": f"operating-loop-{loop.get('loopKey') or offset}",
            "lane": loop.get("lane") or "",
            "priority": "ready",
            "status": loop.get("status") or "",
            "action": loop.get("label") or "Operating loop",
            "explanation": loop.get("nextSafestAction") or "Follow the next reversible local loop step.",
            "safety": loop.get("truth") or "Operating-loop commands are local guidance only.",
            "commands": commands,
            "safeLocalCommandCount": safe_count,
            "approvalRequiredCommandCount": approval_count,
        })
    return rows


def build_work_session_launcher_rows(start_rank: int) -> list[dict[str, Any]]:
    packet = load_pointer_target(DEFAULT_RETURN_BRIEF_POINTER)
    launchers = packet.get("productionWorkSessionLaunchers") if isinstance(packet.get("productionWorkSessionLaunchers"), list) else []
    rows: list[dict[str, Any]] = []
    for offset, launcher in enumerate(launchers, 0):
        if not isinstance(launcher, dict):
            continue
        commands: list[dict[str, str]] = []
        command = str(launcher.get("command") or "")
        path = str(launcher.get("path") or "")
        if command:
            add_command(commands, "Open work session", command, "return-brief-work-session")
        elif path:
            add_command(commands, "Open work session", f"open {shell_quote(path)}", "return-brief-work-session")
        safe_count = sum(1 for command in commands if command["kind"] in {"safe-local", "open-local"})
        approval_count = sum(1 for command in commands if command["kind"] == "approval-required")
        non_claims = launcher.get("explicitNonClaims") if isinstance(launcher.get("explicitNonClaims"), list) else []
        safety_bits = [
            str(launcher.get("truth") or "Work-session launcher only. It opens local evidence and does not perform platform actions."),
            *[str(item) for item in non_claims if item],
        ]
        rows.append({
            "rank": start_rank + offset,
            "id": f"work-session-{launcher.get('id') or offset}",
            "lane": launcher.get("lane") or "Production work session",
            "priority": "ready",
            "status": launcher.get("status") or "",
            "action": launcher.get("label") or "Open production work session",
            "explanation": launcher.get("whatItDoes") or launcher.get("firstHumanQuestion") or "Open the next concrete local work session.",
            "safety": " ".join(safety_bits).strip(),
            "commands": commands,
            "safeLocalCommandCount": safe_count,
            "approvalRequiredCommandCount": approval_count,
        })
    return rows


def build_current_workspace_rows(start_rank: int) -> list[dict[str, Any]]:
    packet = load_pointer_target(DEFAULT_RETURN_BRIEF_POINTER)
    workspaces = packet.get("currentWorkspaces") if isinstance(packet.get("currentWorkspaces"), list) else []
    rows: list[dict[str, Any]] = []
    for offset, workspace in enumerate(workspaces, 0):
        if not isinstance(workspace, dict):
            continue
        commands: list[dict[str, str]] = []
        command = str(workspace.get("openCommand") or "")
        path = str(workspace.get("path") or "")
        if command:
            add_command(commands, "Open current workspace", command, "return-brief-current-workspace")
        elif path:
            add_command(commands, "Open current workspace", f"open {shell_quote(path)}", "return-brief-current-workspace")
        safe_count = sum(1 for command in commands if command["kind"] in {"safe-local", "open-local"})
        approval_count = sum(1 for command in commands if command["kind"] == "approval-required")
        workspace_id = "".join(
            ch if ch.isalnum() else "-"
            for ch in str(workspace.get("label") or f"workspace-{offset}").lower()
        ).strip("-")
        rows.append({
            "rank": start_rank + offset,
            "id": f"current-workspace-{workspace_id[:46] or offset}",
            "lane": workspace.get("lane") or "Current workspace",
            "priority": "ready",
            "status": workspace.get("status") or "open-local-workspace",
            "action": workspace.get("label") or "Open current workspace",
            "explanation": workspace.get("description") or workspace.get("nextSafestAction") or "Open the concrete workspace for this lane.",
            "safety": workspace.get("truth") or "Current workspace action only. Opens local evidence and does not publish, upload, delete, mutate sources, approve, or capture receipts.",
            "commands": commands,
            "safeLocalCommandCount": safe_count,
            "approvalRequiredCommandCount": approval_count,
        })
    return rows


def render_markdown(payload: dict[str, Any]) -> str:
    current_workspace_rows = [
        row for row in payload["actions"]
        if str(row.get("id") or "").startswith("current-workspace-")
    ]
    lines = [
        "# Quipsly safe action deck",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        f"Human ask: {payload.get('humanAsk') or ''}",
        "",
        f"Codex can keep going: {payload.get('agentSafeParallelWork') or ''}",
        "",
        "## Rules",
        "",
        "- `safe-local` commands only update local metadata/ledgers or open local artifacts.",
        "- `approval-required` commands are receipt/publishing proof templates and must not be run without explicit approval and real platform evidence.",
        "- Unknown commands are marked `review-before-run`.",
        "",
    ]
    if current_workspace_rows:
        lines.extend([
            "## Start here: current workspaces",
            "",
            "These are the concrete lane workspaces from the current Return Brief. Opening them is local-only and does not approve, publish, upload, delete, mutate source files, or capture receipts.",
            "",
        ])
        for row in current_workspace_rows:
            command = next(iter(row.get("commands") or []), {})
            lines.extend([
                f"- **{row['lane']}** - {row['action']}: `{command.get('command') or 'No open command available.'}`",
            ])
        lines.append("")
    for row in payload["actions"]:
        lines.extend([
            f"## {row['rank']}. {row['lane']} - {row['action']}",
            "",
            f"- Priority: `{row['priority']}`",
            f"- Status: `{row['status']}`",
            f"- Why: {row['explanation']}",
            f"- Safety: {row['safety']}",
            "",
            "Commands:",
        ])
        for command in row["commands"]:
            lines.append(f"- `{command['kind']}` {command['label']}: `{command['command']}`")
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    current_workspace_rows = [
        row for row in payload["actions"]
        if str(row.get("id") or "").startswith("current-workspace-")
    ]
    workspace_cards = []
    for row in current_workspace_rows:
        command = next(iter(row.get("commands") or []), {})
        workspace_cards.append(f"""
          <article class="workspace-card">
            <p class="eyebrow">{html.escape(str(row.get('lane') or 'Current workspace'))}</p>
            <h3>{html.escape(str(row.get('action') or 'Open workspace'))}</h3>
            <p>{html.escape(str(row.get('explanation') or 'Open the concrete local workspace for this lane.'))}</p>
            <code>{html.escape(str(command.get('command') or 'No open command available.'))}</code>
          </article>
        """)
    workspace_section = ""
    if workspace_cards:
        workspace_section = f"""
        <section class="workspace-start">
          <p class="eyebrow">Start here · current workspaces</p>
          <h2>Open the lane you want to move forward.</h2>
          <p>These local-open actions come from the current Return Brief. They do not approve, publish, upload, delete, mutate source files, or capture receipts.</p>
          <div class="workspace-grid">{''.join(workspace_cards)}</div>
        </section>
        """
    cards = []
    for row in payload["actions"]:
        commands_html = []
        for command in row["commands"]:
            commands_html.append(f"""
            <div class="command {html.escape(command['kind'])}">
              <div><strong>{html.escape(command['label'])}</strong><span>{html.escape(command['kind'])}</span></div>
              <code>{html.escape(command['command'])}</code>
              <p>{html.escape(command['safety'])}</p>
            </div>
            """)
        cards.append(f"""
        <article class="card {html.escape(str(row['priority']))}">
          <p class="eyebrow">#{row['rank']} · {html.escape(row['priority'])} · {html.escape(row['lane'])}</p>
          <h2>{html.escape(row['action'])}</h2>
          <p class="status">{html.escape(row['status'])}</p>
          <p>{html.escape(row['explanation'])}</p>
          <p class="safety">{html.escape(row['safety'])}</p>
          <section class="commands">{''.join(commands_html) or '<p>No commands available yet.</p>'}</section>
        </article>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quipsly Safe Action Deck</title>
<style>
  :root {{ color-scheme:dark; --bg:#10150e; --panel:#1d2519; --panel2:#151b13; --ink:#f7f0d9; --muted:#b9ad8b; --gold:#ecc94f; --leaf:#6ed47f; --water:#7bcbd8; --clay:#d07155; --line:#394830; }}
  body {{ margin:0; color:var(--ink); background:radial-gradient(circle at top left,rgba(110,212,127,.18),transparent 30%),var(--bg); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
  main {{ max-width:1180px; margin:0 auto; padding:34px 24px 70px; }}
  header, .card {{ border:1px solid var(--line); background:rgba(29,37,25,.93); border-radius:28px; padding:24px; margin-bottom:16px; box-shadow:0 18px 60px rgba(0,0,0,.22); }}
  .eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
  h1 {{ font-size:clamp(40px,7vw,76px); line-height:.9; margin:0 0 12px; }}
  h2 {{ margin:0 0 8px; }}
  h3 {{ margin:0 0 8px; }}
  p {{ color:var(--muted); line-height:1.45; }}
  .workspace-start {{ border:1px solid rgba(123,203,216,.45); border-radius:28px; padding:24px; margin:0 0 16px; background:linear-gradient(135deg,rgba(123,203,216,.12),rgba(110,212,127,.09)); }}
  .workspace-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:12px; margin-top:16px; }}
  .workspace-card {{ border:1px solid rgba(247,240,217,.14); border-radius:20px; padding:14px; background:rgba(16,21,14,.62); }}
  .workspace-card code {{ font-size:12px; }}
  .card.attention {{ border-color:rgba(208,113,85,.78); }}
  .card.review {{ border-color:rgba(236,201,79,.5); }}
  .status {{ color:#dfecc9; margin:.1rem 0; }}
  .safety {{ color:#cfe7bd; }}
  .commands {{ display:grid; gap:10px; margin-top:16px; }}
  .command {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:var(--panel2); }}
  .command.safe-local, .command.open-local {{ border-color:rgba(110,212,127,.55); }}
  .command.approval-required {{ border-color:rgba(208,113,85,.75); }}
  .command.review-before-run {{ border-color:rgba(236,201,79,.65); }}
  .command div {{ display:flex; justify-content:space-between; gap:10px; margin-bottom:8px; }}
  .command span {{ color:var(--water); font-weight:900; text-transform:uppercase; font-size:11px; }}
  code {{ display:block; color:#ffe89a; white-space:pre-wrap; overflow-wrap:anywhere; }}
</style>
</head>
<body><main>
<header>
  <p class="eyebrow">Quipsly OS · safe action deck</p>
  <h1>Commands with rails, not mystery buttons.</h1>
  <p>Generated {html.escape(payload['generatedAt'])}. This deck reads the OS board and shows copyable local commands while separating approval-required receipt/publishing templates.</p>
  <p>{html.escape(payload['truth'])}</p>
  <p><b>Human ask:</b> {html.escape(str(payload.get('humanAsk') or ''))}</p>
  <p><b>Codex can keep going:</b> {html.escape(str(payload.get('agentSafeParallelWork') or ''))}</p>
</header>
{workspace_section}
{''.join(cards)}
</main></body></html>"""


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "lane", "priority", "status", "action", "command_kind", "command_label", "command"])
        writer.writeheader()
        for row in payload["actions"]:
            if not row["commands"]:
                writer.writerow({"rank": row["rank"], "lane": row["lane"], "priority": row["priority"], "status": row["status"], "action": row["action"], "command_kind": "none", "command_label": "", "command": ""})
            for command in row["commands"]:
                writer.writerow({"rank": row["rank"], "lane": row["lane"], "priority": row["priority"], "status": row["status"], "action": row["action"], "command_kind": command["kind"], "command_label": command["label"], "command": command["command"]})


def main() -> int:
    pointer_path = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_POINTER
    board, board_path, pointer = resolve_board(pointer_path)
    source_kind = "os-board"
    if pointer_path == DEFAULT_POINTER:
        runway = load_pointer_target(DEFAULT_PRODUCTION_RUNWAY_POINTER)
        if isinstance(runway.get("cards"), list) and runway.get("cards"):
            board = runway
            board_path = Path(str(runway.get("jsonPath") or DEFAULT_PRODUCTION_RUNWAY_POINTER))
            pointer = {"htmlPath": runway.get("htmlPath") or "", "jsonPath": runway.get("jsonPath") or ""}
            pointer_path = DEFAULT_PRODUCTION_RUNWAY_POINTER
            source_kind = "production-runway"
    if not board.get("priorityQueue") and not board.get("cards"):
        print(json.dumps({"ok": False, "error": f"No priority queue or production cards found via {pointer_path}"}, indent=2))
        return 1
    out_dir = DEFAULT_OS_ROOT / "ActionDecks" / f"{stamp()}-quipsly-action-deck"
    out_dir.mkdir(parents=True, exist_ok=False)
    actions = build_rows(board, 16) if board.get("priorityQueue") else build_rows_from_runway(board, 16)
    actions.extend(build_current_workspace_rows(len(actions) + 1))
    actions.extend(build_operating_loop_rows(len(actions) + 1))
    actions.extend(build_work_session_launcher_rows(len(actions) + 1))
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "action-deck-ready",
        "sourceKind": source_kind,
        "sourceBoardPointer": str(pointer_path),
        "sourceBoardJson": str(board_path),
        "sourceBoardHtml": pointer.get("htmlPath") or "",
        "sessionDir": str(out_dir),
        "actions": actions,
        "counts": {
            "actions": len(actions),
            "safeLocalCommands": sum(row["safeLocalCommandCount"] for row in actions),
            "approvalRequiredCommands": sum(row["approvalRequiredCommandCount"] for row in actions),
            "commands": sum(len(row["commands"]) for row in actions),
            "currentWorkspaceActions": sum(1 for row in actions if str(row.get("id") or "").startswith("current-workspace-")),
            "operatingLoopActions": sum(1 for row in actions if str(row.get("id") or "").startswith("operating-loop-")),
            "productionWorkSessionLauncherActions": sum(1 for row in actions if str(row.get("id") or "").startswith("work-session-")),
        },
        "humanAsk": HUMAN_ASK,
        "agentSafeParallelWork": AGENT_SAFE_PARALLEL_WORK,
        "nextSafestAction": "Open the safe action deck, copy only local-safe/open-local commands unless Charlie explicitly approves a real external receipt action.",
        "truth": "Safe action deck only. It displays commands and local artifacts but does not execute, approve, publish, upload, schedule, delete, mutate sources, or capture receipts.",
    }
    html_path = out_dir / "index.html"
    json_path = out_dir / "quipsly-action-deck.json"
    markdown_path = out_dir / "START-HERE-Quipsly-action-deck.md"
    csv_path = out_dir / "quipsly-action-deck.csv"
    payload.update({"htmlPath": str(html_path), "jsonPath": str(json_path), "markdownPath": str(markdown_path), "csvPath": str(csv_path)})
    payload["firstSafeAction"] = {
        "label": "Open Quipsly Safe Action Deck",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local command evidence only. It does not run any command, approve, publish, upload, schedule, delete, mutate sources, or capture receipts.",
    }
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_csv(csv_path, payload)
    write_json(json_path, payload)
    pointer_payload = {key: payload[key] for key in ["schema", "generatedAt", "status", "sourceKind", "sourceBoardPointer", "sourceBoardJson", "sourceBoardHtml", "htmlPath", "jsonPath", "markdownPath", "csvPath", "sessionDir", "actions", "counts", "firstSafeAction", "humanAsk", "agentSafeParallelWork", "nextSafestAction", "truth"]}
    write_json(DEFAULT_OS_ROOT / "latest-quipsly-action-deck.json", pointer_payload)
    print_payload = {key: value for key, value in pointer_payload.items() if key != "actions"}
    print_payload["actionsInPointer"] = len(actions)
    print(json.dumps({"ok": True, **print_payload}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
