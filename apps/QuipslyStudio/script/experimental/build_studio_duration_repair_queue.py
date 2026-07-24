#!/usr/bin/env python3
"""Build a repair/options queue for Studio duration mismatches.

This reads the duration decision sheet and turns each warning into a reversible
production ticket: what to review, what likely happened, and what versioned
repair options are safe to consider. It does not trim, regenerate, approve,
publish, upload, schedule, or capture receipts.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-duration-repair-queue.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-duration-repair-queue")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def file_url(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def media_kind(path: str) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in {".mp4", ".mov", ".m4v", ".webm"}:
        return "video"
    if suffix in {".m4a", ".mp3", ".wav", ".aac", ".flac"}:
        return "audio"
    return "file"


def parse_open_command_path(command: str) -> str:
    if not command.startswith("open "):
        return ""
    raw = command[5:].strip()
    if raw.startswith("'") and raw.endswith("'"):
        return raw[1:-1].replace("'\\''", "'")
    return raw


def load_latest_decision_sheet(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json"
    pointer = load_json(pointer_path)
    packet_path = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(packet_path) if packet_path.exists() else {}
    if not packet:
        raise SystemExit("No duration decision sheet found. Run ./script/agentctl.sh studio-duration-decision-sheet first.")
    return pointer, packet, packet_path


def artifact_label(artifact: dict[str, Any]) -> str:
    return str(artifact.get("label") or artifact.get("artifactId") or "artifact")


def build_repair_options(episode: dict[str, Any]) -> list[dict[str, str]]:
    longest = episode.get("longestArtifact") if isinstance(episode.get("longestArtifact"), dict) else {}
    shortest = episode.get("shortestArtifact") if isinstance(episode.get("shortestArtifact"), dict) else {}
    longest_id = str(longest.get("artifactId") or "")
    shortest_id = str(shortest.get("artifactId") or "")
    spread = str(episode.get("spreadLabel") or "")
    options = [
        {
            "id": "review-evidence-first",
            "label": "Review evidence before repair",
            "description": "Open the generated tail/extra snippets and decide which boundary is creatively correct before making a new version.",
            "risk": "low",
        }
    ]
    if longest_id == "podcastAudio":
        options.extend([
            {
                "id": "hold-podcast-audio",
                "label": "Hold podcast audio",
                "description": f"Podcast audio is the longest artifact by {spread}. Treat RSS audio as not publication-ready until the extra audio is reviewed.",
                "risk": "low",
            },
            {
                "id": "regenerate-audio-to-video-boundary",
                "label": "Create next version with audio boundary matched to video",
                "description": f"If the video boundary is correct, make a new version with podcast audio aligned to {artifact_label(shortest)}. Preserve the old version.",
                "risk": "medium",
            },
            {
                "id": "approve-extra-audio-only-if-intentional",
                "label": "Approve extra audio only with human confirmation",
                "description": "Only use the longer podcast audio if a human confirms the extra material is intentional and belongs in the RSS release.",
                "risk": "human-approval-required",
            },
        ])
    elif longest_id.startswith("longForm") or shortest_id == "podcastAudio":
        options.extend([
            {
                "id": "review-video-tail",
                "label": "Review extra video tail",
                "description": f"Video appears longer than audio by {spread}. Check whether the tail is intentional content, dead air, or an export boundary issue.",
                "risk": "low",
            },
            {
                "id": "regenerate-audio-to-video-boundary",
                "label": "Create next version with podcast audio extended/regenerated",
                "description": f"If the video tail is real episode content, create a new podcast audio version that reaches the video boundary. Preserve old versions.",
                "risk": "medium",
            },
            {
                "id": "trim-video-tail-in-next-version",
                "label": "Create next video version trimmed to audio boundary",
                "description": f"If the audio boundary is correct, create a new video version trimmed to {artifact_label(shortest)}. Preserve old versions.",
                "risk": "medium",
            },
        ])
    else:
        options.append({
            "id": "manual-duration-review",
            "label": "Manual duration review",
            "description": "The mismatch pattern is unusual. Review snippets and create a versioned repair plan before approving.",
            "risk": "review",
        })
    return options


def review_decision_commands(episode: dict[str, Any]) -> list[dict[str, str]]:
    episode_number = str(episode.get("episode") or "")
    artifacts: dict[str, dict[str, Any]] = {}
    for key in ["longestArtifact", "shortestArtifact"]:
        artifact = episode.get(key) if isinstance(episode.get(key), dict) else {}
        artifact_id = str(artifact.get("artifactId") or artifact.get("key") or "")
        if artifact_id:
            artifacts[artifact_id] = artifact
    if not artifacts:
        artifacts = {
            "longForm16x9": {"label": "16:9 long-form video"},
            "podcastAudio": {"label": "podcast audio"},
        }
    spread_label = str(episode.get("spreadLabel") or "duration warning")
    commands: list[dict[str, str]] = []
    for artifact_id, artifact in sorted(artifacts.items()):
        label = str(artifact.get("label") or artifact_id)
        commands.extend([
            {
                "label": f"Hold {label}",
                "decision": "hold",
                "artifactId": artifact_id,
                "command": f"./script/agentctl.sh tower-review-decision {episode_number} {artifact_id} hold '<reviewer>' '<duration warning {spread_label}; hold until review is resolved>'",
                "safety": "Records a local hold decision only; no publish, upload, trim, overwrite, or external receipt.",
            },
            {
                "label": f"Request refinement for {label}",
                "decision": "refine",
                "artifactId": artifact_id,
                "command": f"./script/agentctl.sh tower-review-decision {episode_number} {artifact_id} refine '<reviewer>' '<duration warning {spread_label}; create/review a versioned repair before approval>'",
                "safety": "Records a local refine decision only; repair still requires a separate versioned action.",
            },
            {
                "label": f"Approve {label} after review",
                "decision": "approve",
                "artifactId": artifact_id,
                "command": f"./script/agentctl.sh tower-review-decision {episode_number} {artifact_id} approve '<reviewer>' '<duration warning reviewed; artifact approved with explicit human note>'",
                "safety": "Records local approval only; external publishing still requires a real publish step and receipt.",
            },
        ])
    commands.append({
        "label": "Keep pending with notes",
        "decision": "pending",
        "artifactId": "duration-warning",
        "command": f"./script/agentctl.sh tower-review-decision {episode_number} duration-warning pending '<reviewer>' '<duration warning {spread_label}; needs Charlie/Mako decision>'",
        "safety": "Records local pending state only; useful when the evidence is unclear.",
    })
    return commands


def review_commands(episode: dict[str, Any]) -> list[dict[str, str]]:
    rows = episode.get("reviewRows") if isinstance(episode.get("reviewRows"), list) else []
    commands: list[dict[str, str]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        command = str(row.get("openCommand") or "")
        review_path = str(row.get("reviewPath") or "")
        if not command and row.get("reviewPath"):
            command = f"open {shell_quote(str(row.get('reviewPath')))}"
        if not review_path:
            review_path = parse_open_command_path(command)
        if command:
            commands.append({
                "kind": str(row.get("kind") or "review"),
                "artifactId": str(row.get("artifactId") or ""),
                "label": str(row.get("label") or row.get("artifactId") or "review clip"),
                "startLabel": str(row.get("startLabel") or ""),
                "durationLabel": str(row.get("durationLabel") or ""),
                "reviewPath": review_path,
                "mediaKind": media_kind(review_path),
                "mediaUrl": file_url(review_path),
                "exists": str(bool(review_path and Path(review_path).exists())).lower(),
                "command": command,
            })
    return commands


def build_ticket(episode: dict[str, Any]) -> dict[str, Any]:
    return {
        "episode": episode.get("episode"),
        "version": episode.get("version") or "",
        "urgency": episode.get("urgency") or "duration-review",
        "spreadSeconds": episode.get("spreadSeconds") or 0,
        "spreadLabel": episode.get("spreadLabel") or "",
        "status": episode.get("status") or "review-warning",
        "plainEnglish": episode.get("plainEnglish") or "",
        "likelyInterpretation": episode.get("likelyInterpretation") or "",
        "primaryDecision": episode.get("primaryDecision") or "",
        "nextSafestAction": episode.get("nextSafestAction") or "Review generated snippets before deciding repair path.",
        "longestArtifact": episode.get("longestArtifact") if isinstance(episode.get("longestArtifact"), dict) else {},
        "shortestArtifact": episode.get("shortestArtifact") if isinstance(episode.get("shortestArtifact"), dict) else {},
        "reviewCommands": review_commands(episode),
        "repairOptions": build_repair_options(episode),
        "reviewDecisionCommands": review_decision_commands(episode),
        "truth": "Repair ticket only. Review evidence first; any repair must create a new version and preserve prior exports.",
    }


def build_packet(release_root: Path) -> dict[str, Any]:
    pointer, sheet, sheet_path = load_latest_decision_sheet(release_root)
    episodes = [episode for episode in (sheet.get("episodes") or []) if isinstance(episode, dict)]
    tickets = [build_ticket(episode) for episode in episodes]
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sourceDecisionSheetPointer": str(release_root / "review-board" / "duration-decision-sheets" / "latest-duration-decision-sheet.json"),
        "sourceDecisionSheetJson": str(sheet_path),
        "sourceDecisionSheetHtml": pointer.get("htmlPath") or sheet.get("htmlPath") or "",
        "truth": "Duration repair queue only. It does not trim, regenerate, approve, publish, upload, schedule, overwrite, delete, or capture receipts.",
        "counts": {
            "tickets": len(tickets),
            "majorWarnings": sum(1 for ticket in tickets if ticket.get("urgency") == "major-duration-review"),
            "reviewWarnings": sum(1 for ticket in tickets if ticket.get("urgency") != "major-duration-review"),
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
        "tickets": tickets,
        "nextSafestAction": "Open each ticket's review snippets, then choose hold/refine/approve as a human-reviewed decision before creating any new version.",
    }


def prepare_output_dir(release_root: Path) -> Path:
    out_dir = release_root / "review-board" / "duration-repair-queues" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = ["episode", "version", "urgency", "spreadLabel", "primaryDecision", "nextSafestAction", "firstOpenCommand", "firstReviewDecisionCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for ticket in packet.get("tickets") or []:
            commands = ticket.get("reviewCommands") if isinstance(ticket.get("reviewCommands"), list) else []
            writer.writerow({
                "episode": ticket.get("episode", ""),
                "version": ticket.get("version", ""),
                "urgency": ticket.get("urgency", ""),
                "spreadLabel": ticket.get("spreadLabel", ""),
                "primaryDecision": ticket.get("primaryDecision", ""),
                "nextSafestAction": ticket.get("nextSafestAction", ""),
                "firstOpenCommand": commands[0].get("command") if commands and isinstance(commands[0], dict) else "",
                "firstReviewDecisionCommand": (ticket.get("reviewDecisionCommands") or [{}])[0].get("command") if isinstance(ticket.get("reviewDecisionCommands"), list) and ticket.get("reviewDecisionCommands") else "",
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Studio duration repair queue",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Source decision sheet: `{packet['sourceDecisionSheetJson']}`",
        f"Source decision sheet HTML: `{packet['sourceDecisionSheetHtml']}`",
        "",
    ]
    for ticket in packet.get("tickets") or []:
        lines.extend([
            f"## Episode {ticket['episode']} {ticket['version']} - {ticket['spreadLabel']} spread",
            "",
            f"- Urgency: `{ticket['urgency']}`",
            f"- Primary decision: {ticket['primaryDecision']}",
            f"- Likely interpretation: {ticket['likelyInterpretation']}",
            f"- Next: {ticket['nextSafestAction']}",
            "",
            "### Review snippets",
            "",
        ])
        for command in ticket.get("reviewCommands") or []:
            lines.append(f"- `{command.get('kind')}` {command.get('label')} {command.get('startLabel')} / {command.get('durationLabel')}: `{command.get('command')}`")
        lines.extend(["", "### Versioned repair options", ""])
        for option in ticket.get("repairOptions") or []:
            lines.append(f"- `{option.get('risk')}` **{option.get('label')}** - {option.get('description')}")
        lines.extend(["", "### Record a local review decision", ""])
        for command in ticket.get("reviewDecisionCommands") or []:
            lines.append(f"- `{command.get('decision')}` **{command.get('label')}**: `{command.get('command')}` - {command.get('safety')}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    cards: list[str] = []
    for ticket in packet.get("tickets") or []:
        command_cards: list[str] = []
        for command in ticket.get("reviewCommands") or []:
            media_url = str(command.get("mediaUrl") or "")
            media_kind_value = str(command.get("mediaKind") or "file")
            if media_url and media_kind_value == "video":
                media_html = f"<video controls preload=\"metadata\" src=\"{esc(media_url)}\"></video>"
            elif media_url and media_kind_value == "audio":
                media_html = f"<audio controls preload=\"metadata\" src=\"{esc(media_url)}\"></audio>"
            elif media_url:
                media_html = f"<a class=\"media-link\" href=\"{esc(media_url)}\">Open file</a>"
            else:
                media_html = "<div class=\"missing-media\">No local review media path found.</div>"
            command_cards.append(
                f"""
                <div class="command media-kind-{esc(media_kind_value)}">
                  <div class="clip-meta">
                    <strong>{esc(command.get('kind'))} · {esc(command.get('label'))}</strong>
                    <span>{esc(command.get('startLabel'))} / {esc(command.get('durationLabel'))}</span>
                    <span class="exists exists-{esc(command.get('exists'))}">{'clip found' if command.get('exists') == 'true' else 'check path'}</span>
                  </div>
                  {media_html}
                  <details><summary>Open command</summary><code>{esc(command.get('command'))}</code><code>{esc(command.get('reviewPath'))}</code></details>
                </div>
                """
            )
        commands_html = "".join(command_cards)
        options_html = "".join(
            f"<li><strong>{esc(option.get('label'))}</strong><span>{esc(option.get('risk'))}</span><p>{esc(option.get('description'))}</p></li>"
            for option in ticket.get("repairOptions") or []
        )
        decision_html = "".join(
            f"<div class=\"decision-command decision-{esc(command.get('decision'))}\"><strong>{esc(command.get('label'))}</strong><p>{esc(command.get('safety'))}</p><code>{esc(command.get('command'))}</code></div>"
            for command in ticket.get("reviewDecisionCommands") or []
        )
        cards.append(f"""
        <article class="ticket urgency-{esc(ticket['urgency'])}">
          <div class="ticket-head">
            <div><div class="eyebrow">Episode {esc(ticket['episode'])} · {esc(ticket['version'])}</div><h2>{esc(ticket['spreadLabel'])} duration spread</h2></div>
            <span>{esc(ticket['urgency'])}</span>
          </div>
          <p class="plain">{esc(ticket['plainEnglish'])}</p>
          <p>{esc(ticket['likelyInterpretation'])}</p>
          <div class="decision">{esc(ticket['primaryDecision'])}</div>
          <section><h3>Review evidence first</h3><div class="clip-grid">{commands_html}</div></section>
          <section><h3>Record local review decision</h3><div class="decision-command-grid">{decision_html}</div></section>
          <section><h3>Versioned repair options</h3><ul>{options_html}</ul></section>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio Duration Repair Queue</title>
  <style>
    :root {{ color-scheme:dark; --bg:#11170f; --panel:#1b2418; --ink:#fff0d2; --muted:#d4c2a0; --gold:#ecc85d; --water:#82d0dd; --clay:#cd7552; --moss:#94bf70; --line:rgba(255,240,210,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 16% 0%, rgba(236,200,93,.18), transparent 30%), linear-gradient(180deg,#162115,#0b1009); color:var(--ink); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.2em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(42px,7vw,84px); line-height:.92; }}
    h2 {{ margin:6px 0 0; font-size:32px; }}
    h3 {{ color:var(--moss); text-transform:uppercase; letter-spacing:.14em; font-size:13px; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }}
    .summary span, .ticket-head span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:18px; }}
    .ticket {{ border:1px solid var(--line); border-radius:28px; padding:20px; background:linear-gradient(180deg,rgba(27,36,24,.98),rgba(11,15,8,.98)); box-shadow:0 24px 68px rgba(0,0,0,.3); }}
    .urgency-major-duration-review {{ border-color:rgba(205,117,82,.7); }}
    .ticket-head {{ display:flex; justify-content:space-between; gap:16px; align-items:flex-start; }}
    .plain {{ color:var(--ink); font-weight:800; }}
    .decision {{ border:1px solid rgba(236,200,93,.4); border-radius:18px; padding:12px; color:var(--gold); background:rgba(236,200,93,.08); font-weight:900; }}
    .clip-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }}
    .decision-command-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; }}
    .decision-command {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(255,255,255,.04); display:grid; gap:6px; }}
    .decision-command strong {{ color:var(--ink); }}
    .decision-command p {{ margin:0; font-size:13px; }}
    .decision-hold {{ border-color:rgba(205,117,82,.55); }}
    .decision-refine,.decision-pending {{ border-color:rgba(236,200,93,.45); }}
    .decision-approve {{ border-color:rgba(148,191,112,.48); }}
    .command {{ border:1px solid var(--line); border-radius:18px; padding:12px; background:rgba(0,0,0,.25); margin:0; display:grid; gap:9px; }}
    .clip-meta {{ display:flex; gap:8px; align-items:center; flex-wrap:wrap; }}
    .command span {{ color:var(--muted); }}
    video {{ width:100%; aspect-ratio:16/9; border-radius:14px; background:#050806; border:1px solid var(--line); }}
    audio {{ width:100%; }}
    details {{ border-top:1px solid var(--line); padding-top:8px; }}
    summary {{ cursor:pointer; color:var(--water); font-weight:800; }}
    .exists {{ border-radius:999px; padding:4px 8px; font-size:11px; text-transform:uppercase; letter-spacing:.08em; }}
    .exists-true {{ color:#10200f !important; background:var(--moss); }}
    .exists-false {{ color:#fff0d2 !important; background:rgba(205,117,82,.5); }}
    .missing-media, .media-link {{ border:1px dashed var(--line); border-radius:14px; padding:16px; color:var(--muted); }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    li {{ margin:12px 0; color:var(--muted); }}
    li strong {{ color:var(--ink); }}
    li span {{ margin-left:8px; color:var(--gold); font-size:12px; text-transform:uppercase; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio repair runway</div>
    <h1>Duration warnings become decisions, not dread.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary"><span>{packet['counts']['tickets']} tickets</span><span>{packet['counts']['majorWarnings']} major</span><span>{packet['counts']['reviewWarnings']} review</span><span>0 versions overwritten</span></div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(release_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    tickets = packet.get("tickets") if isinstance(packet.get("tickets"), list) else []
    first_ticket = tickets[0] if tickets and isinstance(tickets[0], dict) else {}
    review_commands = first_ticket.get("reviewCommands") if isinstance(first_ticket.get("reviewCommands"), list) else []
    decision_commands = first_ticket.get("reviewDecisionCommands") if isinstance(first_ticket.get("reviewDecisionCommands"), list) else []
    first_review_command = next((command for command in review_commands if isinstance(command, dict) and command.get("command")), {})
    first_decision_command = next((command for command in decision_commands if isinstance(command, dict) and command.get("command")), {})
    first_repair_evidence_action = {
        "episode": first_ticket.get("episode") or 0,
        "version": first_ticket.get("version") or "",
        "urgency": first_ticket.get("urgency") or "",
        "spreadLabel": first_ticket.get("spreadLabel") or "",
        "nextSafestAction": first_ticket.get("nextSafestAction") or "",
        "primaryDecision": first_ticket.get("primaryDecision") or "",
        "firstOpenCommand": first_review_command.get("command") or "",
        "firstDecisionCommand": first_decision_command.get("command") or "",
        "safety": "Review evidence first; any decision is local review metadata only. Any repair must create a new version and preserve prior exports.",
    }
    first_safe_action = {
        "label": "Open Studio duration repair queue",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens the local repair queue only. It does not repair, approve, publish, upload, schedule, overwrite, delete, mutate media, or create receipt truth.",
    }
    pointer = {
        "schema": "quipsly.studio-duration-repair-queue.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": "duration-repair-queue-ready" if tickets else "no-duration-repair-tickets",
        "humanAsk": "Review the first repair ticket and decide whether the package needs a new repair version, a hold, or a clear explanation.",
        "agentSafeParallelWork": "Codex may open local evidence, compare manifests, draft repair notes, and prepare commands. Do not repair destructively, promote, approve, publish, upload, schedule, overwrite, delete, mutate sources, or create receipts.",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": first_safe_action,
        "firstRepairEvidenceAction": first_repair_evidence_action,
        "firstOpenCommand": first_safe_action["command"],
        "firstReviewEvidenceCommand": first_repair_evidence_action["firstOpenCommand"],
        "firstReviewDecisionCommand": first_repair_evidence_action["firstDecisionCommand"],
        "episodes": [
            {
                "episode": ticket.get("episode"),
                "version": ticket.get("version"),
                "status": ticket.get("status"),
                "urgency": ticket.get("urgency"),
                "spreadLabel": ticket.get("spreadLabel"),
                "nextSafestAction": ticket.get("nextSafestAction"),
                "primaryDecision": ticket.get("primaryDecision"),
            }
            for ticket in tickets
        ],
        "truth": packet.get("truth") or "",
    }
    canonical_pointer = release_root / "review-board" / "duration-repair-queues" / "latest-duration-repair-queue.json"
    write_json(canonical_pointer, pointer)
    write_json(release_root / "review-board" / "latest-duration-repair-queue.json", {
        **pointer,
        "canonicalPointerPath": str(canonical_pointer),
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Studio duration repair queue.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()

    release_root = Path(args.release_root)
    packet = build_packet(release_root)
    out_dir = prepare_output_dir(release_root)
    json_path = out_dir / "duration-repair-queue.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-duration-repair-queue.md"
    csv_path = out_dir / "duration-repair-queue.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(release_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
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
