#!/usr/bin/env python3
"""Build a calm Nest Writing Start Here page.

This is the author-facing first door over the existing Nest writing/research
surfaces. It does not mutate sources, replace canonical manuscript text,
publish, upload, schedule, approve, overwrite, delete, mutate accounts, or
create receipt truth.
"""

from __future__ import annotations

import html
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_POINTER = "latest-nest-writing-start-here.json"
SCHEMA = "quipsly.nest-writing.startHere.v1"

SOURCES = {
    "controlRoom": "latest-nest-writing-control-room.json",
    "authorDesk": "latest-nest-writing-author-desk.json",
    "dailyReadiness": "latest-daily-writing-desk-readiness.json",
    "dailyPacket": "latest-nest-writing-daily-packet.json",
    "sessionCockpit": "latest-nest-writing-session-cockpit.json",
    "reviewDesk": "latest-nest-writing-review-desk.json",
    "momentumBoard": "latest-nest-writing-momentum-board.json",
    "revisionBatch": "latest-nest-writing-next-revision-batch.json",
    "nextCard": "latest-nest-writing-next-card.json",
    "ideaRouter": "latest-nest-idea-output-router.json",
    "draftPacket": "latest-nest-writing-draft-packet.json",
    "sourcePacket": "latest-nest-writing-source-packet.json",
    "researchPacket": "latest-nest-writing-research-packet.json",
    "publicationRunway": "latest-writing-publication-runway.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-nest-writing-start-here")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath") or payload.get("packetPath") or payload.get("latest")
        if target:
            target_path = Path(str(target))
            if target_path.exists() and target_path != path and target_path.is_file():
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload}
        payload.setdefault("pointerPath", str(path))
        return payload
    except Exception as exc:
        return {"status": "load-error", "path": str(path), "error": str(exc)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def count(payload: dict[str, Any], key: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    value = counts.get(key, payload.get(key))
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def first_path(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    for key in ("htmlPath", "markdownPath", "jsonPath", "packetPath", "workbenchHtmlPath"):
        value = payload.get(key)
        if value:
            return str(value)
    value = first.get("path")
    return str(value) if value else ""


def first_command(payload: dict[str, Any]) -> str:
    first = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    command = first.get("command")
    if command:
        return str(command)
    path = first_path(payload)
    return f"open {shell_quote(path)}" if path else ""


def source_summary(parts: dict[str, dict[str, Any]]) -> dict[str, dict[str, str]]:
    return {
        key: {
            "status": str(payload.get("status") or "missing"),
            "path": first_path(payload),
            "command": first_command(payload),
        }
        for key, payload in parts.items()
    }


def extract_first_task(author: dict[str, Any], control: dict[str, Any]) -> dict[str, Any]:
    for key in ("firstTask", "firstWritingTask", "dailyWritingFirstTask"):
        value = author.get(key)
        if isinstance(value, dict) and value:
            return value
    value = control.get("firstReviewTarget")
    return value if isinstance(value, dict) else {}


def status_from(parts: dict[str, dict[str, Any]], counts: dict[str, int]) -> tuple[str, str, str]:
    readiness = parts["dailyReadiness"]
    recommendation = str(readiness.get("recommendation") or "")
    if counts["pendingHumanReview"] or counts["draftsWithReviewFlags"]:
        return (
            "nest-writing-start-here-review-and-write",
            "write today, review one flagged draft",
            "Nest has source-backed drafts and enough web readiness for serious daily writing, but several drafts still need human/agent review before canon or publication.",
        )
    if "web" in recommendation.lower():
        return (
            "nest-writing-start-here-web-first",
            "web writing first",
            recommendation,
        )
    return (
        "nest-writing-start-here-source-backed",
        "source-backed writing ready",
        "Open one source-backed task, write or revise a small target, and keep draft/canon/publication truth separate.",
    )


def action_card(kind: str, label: str, why: str, command: str = "", path: str = "") -> dict[str, str]:
    return {
        "kind": kind,
        "label": label,
        "why": why,
        "command": command or (f"open {shell_quote(path)}" if path else ""),
        "path": path,
    }


def build_actions(parts: dict[str, dict[str, Any]], counts: dict[str, int], first_task: dict[str, Any]) -> list[dict[str, str]]:
    task_id = str(first_task.get("taskId") or "first")
    open_source = str(first_task.get("openFirstSource") or "")
    open_draft = str(first_task.get("openExistingDraftPacket") or "")
    return [
        action_card(
            "write",
            "Start a 25-minute source-backed writing sprint",
            "Open the first source and draft packet, choose one small target, then write/revise without replacing canon.",
            open_source or first_command(parts["authorDesk"]),
            first_path(parts["authorDesk"]),
        ),
        action_card(
            "momentum",
            "Open the writing momentum board",
            "Use the calm source-first work loop: open evidence, open or refresh a draft packet, choose one writing move, then stop before canon or publication changes.",
            first_command(parts["momentumBoard"]),
            first_path(parts["momentumBoard"]),
        ),
        action_card(
            "draft",
            "Generate or open the draft packet",
            "Create enough inspectable material to work with; draft freely, but never secretly or canonically.",
            str(first_task.get("draftPacketCommand") or f"./script/agentctl.sh nest-writing-draft-packet {task_id}"),
            first_path(parts["draftPacket"]),
        ),
        action_card(
            "route",
            "Route one idea into useful outputs",
            "Pick a source-backed thought and decide whether it wants to become a book section, article, episode page, short, quote card, social post, or research note.",
            first_command(parts["ideaRouter"]) or "./script/agentctl.sh nest-idea-output-router",
            first_path(parts["ideaRouter"]),
        ),
        action_card(
            "review",
            "Open the next revision batch",
            f"Review {counts['revisionBatchRows']} source-backed draft card(s) and classify revise, split, hold, source-check, or human-ready.",
            first_command(parts["revisionBatch"]),
            first_path(parts["revisionBatch"]),
        ),
        action_card(
            "source",
            "Open the visible source trail",
            "Keep evidence, uncertainty, and author voice visible while drafting or revising.",
            open_source or first_command(parts["sourcePacket"]),
            first_path(parts["sourcePacket"]),
        ),
        action_card(
            "author-desk",
            "Open the Nest Author Desk",
            "A calmer author-facing desk over daily tasks, source links, draft packets, and the writing contract.",
            first_command(parts["authorDesk"]),
            first_path(parts["authorDesk"]),
        ),
        action_card(
            "readiness",
            "Open Daily Writing Desk readiness",
            "Confirms web/native readiness and keeps daily serious writing from waiting on unfinished native surfaces.",
            first_command(parts["dailyReadiness"]),
            first_path(parts["dailyReadiness"]),
        ),
        action_card(
            "control-room",
            "Open the full Nest writing control room",
            "Operator dashboard for drafts, sources, review flags, platform packets, and publication boundaries.",
            first_command(parts["controlRoom"]),
            first_path(parts["controlRoom"]),
        ),
        action_card(
            "publication-prep",
            "Open writing publication runway",
            "Prepare platform copy packets and receipt slots without publishing or replacing manuscript truth.",
            first_command(parts["publicationRunway"]),
            first_path(parts["publicationRunway"]),
        ),
    ]


def build_payload(root: Path) -> dict[str, Any]:
    parts = {key: read_json(root / filename) for key, filename in SOURCES.items()}
    control = parts["controlRoom"]
    author = parts["authorDesk"]
    readiness = parts["dailyReadiness"]
    revision = parts["revisionBatch"]
    first_task = extract_first_task(author, control)
    counts = {
        "sourceDocuments": count(control, "sourceDocuments"),
        "sourceWords": count(control, "sourceWords"),
        "currentDrafts": count(control, "currentDrafts"),
        "draftPackets": count(control, "draftPackets"),
        "pendingHumanReview": count(control, "pendingHumanReview"),
        "draftsWithReviewFlags": count(control, "draftsWithReviewFlags"),
        "reviewReady": count(control, "reviewReady"),
        "platformDraftItems": count(control, "platformDraftItems"),
        "receiptSlots": count(control, "receiptSlots"),
        "availableDailyTasks": count(author, "availableDailyTasks") or count(control, "availableDailyTasks"),
        "nativeReadyOrPartial": count(readiness, "nativeReadyOrPartial"),
        "webReadyOrPartial": count(readiness, "webReadyOrPartial"),
        "readinessRequirements": count(readiness, "requirements"),
        "revisionBatchRows": count(revision, "batchRows") or count(revision, "items"),
        "ideaRouterRows": count(parts["ideaRouter"], "routerRows"),
        "ideaRouterActionableRows": count(parts["ideaRouter"], "actionableRows"),
        "ideaRouterSocialRoutes": count(parts["ideaRouter"], "socialRoutes"),
        "ideaRouterArticleRoutes": count(parts["ideaRouter"], "articleRoutes"),
        "sourceFilesMutated": count(control, "sourceFilesMutated") or count(author, "sourceFilesMutated"),
        "canonicalManuscriptReplaced": count(control, "canonicalManuscriptReplaced") or count(author, "canonicalManuscriptReplaced"),
        "externalPublishing": count(control, "externalPublishing") or count(author, "externalPublishing"),
        "receiptTruthCreated": count(control, "receiptTruthCreated") or count(author, "receiptTruthCreated"),
    }
    status, label, plain = status_from(parts, counts)
    writing_contract = author.get("writingContract") if isinstance(author.get("writingContract"), dict) else {}
    source_contract = author.get("sourceContract") if isinstance(author.get("sourceContract"), dict) else {}
    contract = writing_contract or source_contract or {
        "assistantMayDraft": True,
        "assistantMayRewrite": True,
        "assistantMustKeepSourceTrailVisible": True,
        "canonicalWriteBlocked": True,
        "publicationBlocked": True,
        "summary": "Draft freely, but never secretly. Keep source trail and canon boundary visible.",
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "statusLabel": label,
        "plainEnglish": plain,
        "nestRoot": str(root),
        "counts": counts,
        "firstTask": first_task,
        "writingContract": contract,
        "recommendation": readiness.get("recommendation") or "Start daily serious writing in the web/Nest surface first while native matures in parallel.",
        "sourceArtifacts": source_summary(parts),
        "nextActions": build_actions(parts, counts, first_task),
        "humanAsk": "Open one source-backed task and do one small useful writing move. Keep sources, drafts, canon, publication packets, and receipts separate.",
        "nextSafestAction": "Start with the 25-minute writing sprint or next revision batch; do not wait for a perfect app before writing, and do not replace canonical text from a packet.",
        "truth": "Nest Writing Start Here only. It reads local writing/research evidence and writes a local orientation packet; it does not mutate source files, replace canonical manuscript text, publish, upload, schedule, approve, overwrite, delete, mutate accounts, or create receipt truth.",
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "accountMutation": False,
        "receiptTruthCreated": False,
        "versionsOverwritten": False,
    }


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    first_task = payload.get("firstTask") if isinstance(payload.get("firstTask"), dict) else {}
    cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(action['kind'])}</div>
          <h2>{html.escape(action['label'])}</h2>
          <p>{html.escape(action['why'])}</p>
          <code>{html.escape(action.get('command') or 'No command available')}</code>
        </article>
        """
        for action in payload["nextActions"]
    )
    sources = "\n".join(
        f"<tr><th>{html.escape(key)}</th><td>{html.escape(value.get('status') or 'missing')}</td><td>{html.escape(value.get('path') or '')}</td></tr>"
        for key, value in payload["sourceArtifacts"].items()
    )
    contract = payload.get("writingContract") if isinstance(payload.get("writingContract"), dict) else {}
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Writing Start Here</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f4eddd; --ink:#30291f; --muted:#746852; --card:rgba(255,252,242,.92); --leaf:#356f4e; --sky:#427f8e; --honey:#c8922f; --clay:#a34d3d; }}
    body {{ margin:0; color:var(--ink); font-family:ui-rounded, "Avenir Next", "Gill Sans", system-ui, sans-serif; background:radial-gradient(circle at 12% 8%, rgba(53,111,78,.16), transparent 30rem), radial-gradient(circle at 90% 12%, rgba(200,146,47,.22), transparent 28rem), var(--bg); }}
    main {{ max-width:1220px; margin:auto; padding:44px 24px 72px; }}
    h1 {{ margin:0; font-size:clamp(2.8rem,6vw,5.6rem); line-height:.9; letter-spacing:-.06em; }}
    .deck {{ max-width:880px; color:var(--muted); line-height:1.65; font-size:1.1rem; }}
    .status {{ display:inline-flex; gap:.65rem; align-items:center; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(48,41,31,.13); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:var(--leaf); box-shadow:0 0 0 5px rgba(53,111,78,.14); }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:14px; margin-top:26px; }}
    .stat,.card,.panel {{ background:var(--card); border:1px solid rgba(48,41,31,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(48,41,31,.08); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.05em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(53,111,78,.12); color:var(--leaf); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    code {{ display:block; padding:12px; border-radius:14px; background:rgba(48,41,31,.08); overflow-wrap:anywhere; }}
    table {{ width:100%; border-collapse:collapse; margin-top:18px; border-radius:18px; overflow:hidden; background:var(--card); }}
    th,td {{ padding:11px 12px; border-bottom:1px solid rgba(48,41,31,.1); text-align:left; vertical-align:top; }}
    th {{ width:250px; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Nest Writing Start Here</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="stats">
    <div class="stat"><div class="pill">sources</div><strong>{counts['sourceDocuments']}</strong><span>{counts['sourceWords']} source words</span></div>
    <div class="stat"><div class="pill">drafts</div><strong>{counts['currentDrafts']}</strong><span>{counts['pendingHumanReview']} pending review</span></div>
    <div class="stat"><div class="pill">review</div><strong>{counts['draftsWithReviewFlags']}</strong><span>flagged draft(s)</span></div>
    <div class="stat"><div class="pill">platform</div><strong>{counts['platformDraftItems']}</strong><span>draft item(s), not receipts</span></div>
    <div class="stat"><div class="pill">ideas</div><strong>{counts['ideaRouterRows']}</strong><span>{counts['ideaRouterSocialRoutes']} social routes, {counts['ideaRouterArticleRoutes']} article routes</span></div>
    <div class="stat"><div class="pill">web</div><strong>{counts['webReadyOrPartial']}</strong><span>ready/partial checks</span></div>
    <div class="stat"><div class="pill">native</div><strong>{counts['nativeReadyOrPartial']}</strong><span>ready/partial checks</span></div>
  </section>
  <section class="panel">
    <h2>First writing target</h2>
    <p><strong>{html.escape(str(first_task.get('title') or 'No first task found'))}</strong></p>
    <p>{html.escape(str(first_task.get('humanAsk') or payload.get('humanAsk') or 'Choose one small source-backed writing move.'))}</p>
    <p><strong>Contract:</strong> {html.escape(str(contract.get('summary') or 'Draft freely, but never secretly.'))}</p>
  </section>
  <h2>Next safe actions</h2>
  <section class="grid">{cards}</section>
  <h2>Artifact map</h2>
  <table>{sources}</table>
</main>
</body>
</html>
"""


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    first_task = payload.get("firstTask") if isinstance(payload.get("firstTask"), dict) else {}
    lines = [
        "# Nest Writing Start Here",
        "",
        f"Status: `{payload['status']}` ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Counts",
        f"- Source documents: `{counts['sourceDocuments']}`",
        f"- Source words: `{counts['sourceWords']}`",
        f"- Current drafts: `{counts['currentDrafts']}`",
        f"- Pending human review: `{counts['pendingHumanReview']}`",
        f"- Drafts with review flags: `{counts['draftsWithReviewFlags']}`",
        f"- Platform draft items: `{counts['platformDraftItems']}`",
        f"- Idea/output router rows: `{counts['ideaRouterRows']}`",
        f"- Idea/output actionable rows: `{counts['ideaRouterActionableRows']}`",
        f"- Idea/output social routes: `{counts['ideaRouterSocialRoutes']}`",
        f"- Idea/output article routes: `{counts['ideaRouterArticleRoutes']}`",
        f"- Web ready/partial checks: `{counts['webReadyOrPartial']}`",
        f"- Native ready/partial checks: `{counts['nativeReadyOrPartial']}`",
        "",
        "## First writing target",
        f"- Title: `{first_task.get('title') or 'missing'}`",
        f"- Task: `{first_task.get('taskId') or 'missing'}`",
        f"- Safe next action: {first_task.get('safeNextAction') or payload.get('nextSafestAction')}",
        "",
        "## Next safe actions",
    ]
    for action in payload["nextActions"]:
        lines += [
            f"- {action['label']}",
            f"  - kind: `{action['kind']}`",
            f"  - why: {action['why']}",
            f"  - command: `{action.get('command') or 'none'}`",
        ]
    lines += [
        "",
        "## Boundary",
        f"- {payload['truth']}",
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_NEST_ROOT
    payload = build_payload(root)
    out_dir = root / "StartHere" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "nest-writing-start-here.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-nest-writing.md"
    payload.update({"sessionDir": str(out_dir), "jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {
        "schema": "quipsly.nest-writing.startHerePointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "statusLabel": payload["statusLabel"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload["counts"],
        "firstSafeAction": {"label": "Open Nest Writing Start Here", "command": f"open {shell_quote(str(html_path))}", "path": str(html_path), "safety": "Opens local writing orientation only. No source/canon/publication mutation."},
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    write_json(root / LATEST_POINTER, pointer)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "counts": payload["counts"],
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
