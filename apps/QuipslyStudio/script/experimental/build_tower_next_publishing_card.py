#!/usr/bin/env python3
"""Build one Tower next-publishing card.

This reads the latest Tower social command center and writes a tiny local card
for the next review/manual-publishing prep action. It never publishes, uploads,
schedules, approves, mutates accounts, or creates receipt truth.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_SOCIAL_COMMAND = "tower-social-command-center/latest-tower-social-command-center.json"
LATEST_NEXT_CARD = "tower-next-publishing-card/latest-tower-next-publishing-card.json"
SCHEMA = "quipsly.tower.next-publishing-card.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-next-publishing-card")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def concrete_command_from_template(command: str, replacements: dict[str, str]) -> str:
    if not command:
        return ""
    try:
        parts = shlex.split(command)
    except ValueError:
        return command
    return shlex.join([replacements.get(part, part) for part in parts])


def load_social_command(root: Path) -> tuple[dict[str, Any], Path]:
    pointer_path = root / LATEST_SOCIAL_COMMAND
    pointer = load_json(pointer_path)
    packet_path_value = str(pointer.get("jsonPath") or "")
    packet_path = Path(packet_path_value) if packet_path_value else pointer_path
    packet = load_json(packet_path)
    return ({**pointer, **packet} if packet else pointer), pointer_path


def pick_card(packet: dict[str, Any], kind: str) -> tuple[str, dict[str, Any]]:
    if kind == "shorts":
        deck = packet.get("shortsPublishingActionCards") if isinstance(packet.get("shortsPublishingActionCards"), dict) else {}
        cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
        return "shorts", next((card for card in cards if isinstance(card, dict)), {})
    deck = packet.get("manualPublishingActionCards") if isinstance(packet.get("manualPublishingActionCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    if cards:
        return "manual", next((card for card in cards if isinstance(card, dict)), {})
    deck = packet.get("shortsPublishingActionCards") if isinstance(packet.get("shortsPublishingActionCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    return "shorts", next((card for card in cards if isinstance(card, dict)), {})


def build_payload(root: Path, kind: str) -> dict[str, Any]:
    packet, pointer_path = load_social_command(root)
    selected_kind, card = pick_card(packet, kind)
    commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    target_label = (
        f"Episode {card.get('episode')} -> {card.get('platform')}"
        if selected_kind == "manual"
        else f"{card.get('episodeKey') or 'short'} -> {card.get('platform')}"
    )
    stage = str(card.get("stage") or card.get("stageLabel") or card.get("localAction") or "")
    approval_state = str(card.get("approvalState") or "not-approved-for-external-action")
    publication_state = str(card.get("publicationState") or "not-published")
    publish_ready = (
        approval_state in {"approved-for-external-action", "approved"}
        and publication_state in {"not-published", "not-posted", "not-uploaded"}
        and not any(token in stage.lower() for token in ["hold", "needs", "diagnostic", "blocked"])
    )
    label = target_label if publish_ready else f"Review {target_label} packet (not publish-ready)"
    review_only_reason = (
        "This target still needs local review or repair before any external platform action."
        if not publish_ready
        else "This target appears locally approved for the next publishing prep step, but external action still requires explicit Charlie approval."
    )
    open_commands = [
        {"label": "Open metadata", "command": commands.get("openMetadata") or ""},
        {"label": "Open checklist", "command": commands.get("openChecklist") or ""},
        {"label": "Open upload draft", "command": commands.get("openUploadDraft") or ""},
        {"label": "Open export", "command": commands.get("openExport") or ""},
    ]
    open_commands = [item for item in open_commands if item["command"]]
    review_dry_run_template = str(commands.get("reviewDryRun") or card.get("reviewDryRunCommandTemplate") or "")
    first_review_dry_run_decision = "pending"
    first_review_dry_run_command = concrete_command_from_template(review_dry_run_template, {
        "approve|refine|hold|pending": first_review_dry_run_decision,
        "<reviewer>": "Codex",
        "<notes>": f"Tower local dry-run for {target_label}; review-only={str(not publish_ready).lower()}; no human approval, publication, upload, schedule, account mutation, or receipt truth.",
    })
    receipt_dry_run_template = str(commands.get("receiptDryRun") or card.get("receiptDryRunCommandTemplate") or "")
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-next-publishing-card-ready" if card else "tower-next-publishing-card-needs-social-command-center",
        "root": str(root),
        "sourceSocialCommandPointerPath": str(pointer_path),
        "sourceSocialCommandJsonPath": str(packet.get("jsonPath") or ""),
        "sourceSocialCommandHtmlPath": str(packet.get("htmlPath") or ""),
        "kind": selected_kind,
        "cardId": str(card.get("id") or "next-publishing-card"),
        "label": label,
        "targetLabel": target_label,
        "readinessLabel": "publish-ready-after-explicit-approval" if publish_ready else "review-only-not-publish-ready",
        "publishReady": publish_ready,
        "reviewOnlyReason": review_only_reason,
        "platform": str(card.get("platform") or ""),
        "episode": card.get("episode") or card.get("episodeKey") or "",
        "stage": stage,
        "approvalState": approval_state,
        "publicationState": publication_state,
        "receiptSlot": str(card.get("receiptSlot") or "empty-until-real-platform-url-or-provider-id"),
        "plainEnglish": "Review one local Tower packet and decide the next local state. This card prepares human/manual publishing work but does not approve, publish, upload, schedule, mutate accounts, or create receipts.",
        "nextSafestAction": (
            (review_only_reason + " Open the local evidence, decide refine/hold/pending, and leave receipts empty.")
            if not publish_ready
            else str(card.get("nextSafestAction") or packet.get("nextSafestAction") or "Open local evidence, review it, and keep receipts empty until real platform proof exists.")
        ),
        "humanDecisionNeeded": str(card.get("humanDecisionNeeded") or "Human review is required before any platform action."),
        "codexSafeMove": str(card.get("codexSafeMove") or card.get("agentSafeParallelWork") or "Prepare summaries, copy variants, packet checks, and dry-run review notes without external action."),
        "manualChecklist": [str(item) for item in card.get("manualChecklist") if isinstance(card.get("manualChecklist"), list)] if isinstance(card.get("manualChecklist"), list) else [],
        "localPostingNoteYaml": str(card.get("localPostingNoteYaml") or ""),
        "commands": commands,
        "openCommands": open_commands,
        "reviewDryRunTemplate": review_dry_run_template,
        "firstReviewDryRunCommand": first_review_dry_run_command,
        "firstReviewDryRunDecision": first_review_dry_run_decision,
        "firstReviewDryRunSafety": "Dry-run only. It previews a local Tower review ledger update and does not approve, publish, upload, schedule, mutate accounts, overwrite, delete, or create receipt truth.",
        "receiptDryRunTemplate": receipt_dry_run_template,
        "receiptDryRunSafety": "Receipt dry-run template only. Real receipt capture requires explicit approval plus an actual external URL or provider id.",
        "countsContext": {
            "episodes": counts.get("episodes", 0),
            "manualPublishingActionCards": counts.get("manualPublishingActionCards", 0),
            "shortsPublishingActionCards": counts.get("shortsPublishingActionCards", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
            "draftOnlySchedules": counts.get("draftOnlySchedules", 0),
        },
        "firstSafeAction": {
            "label": "Open this Tower publishing card",
            "command": "",
            "path": "",
            "safety": "Opens one local Tower next-publishing card. No upload, post, schedule, approval, account mutation, overwrite, delete, or receipt truth.",
        },
        "truth": {
            "description": "Tower next-publishing card only. It reads local command-center evidence and writes a local operator card.",
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "externalUpload": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Tower next publishing card",
        "",
        f"**Target:** {payload.get('label')}",
        f"**Readiness:** `{payload.get('readinessLabel')}`",
        f"**Stage:** `{payload.get('stage')}`",
        f"**Approval:** `{payload.get('approvalState')}`",
        f"**Publication:** `{payload.get('publicationState')}`",
        f"**Receipt:** `{payload.get('receiptSlot')}`",
        "",
        "## Next safest action",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Human decision needed",
        str(payload.get("humanDecisionNeeded") or ""),
        "",
        "## Codex-safe work",
        str(payload.get("codexSafeMove") or ""),
        "",
        "## Open commands",
    ]
    for item in payload.get("openCommands") or []:
        lines.append(f"- {item.get('label')}: `{item.get('command')}`")
    if payload.get("firstReviewDryRunCommand"):
        lines.extend([
            "",
            "## Safe review dry-run",
            "",
            f"- Decision preview: `{payload.get('firstReviewDryRunDecision')}`",
            f"- Command: `{payload.get('firstReviewDryRunCommand')}`",
            f"- Safety: {payload.get('firstReviewDryRunSafety')}",
        ])
    if payload.get("receiptDryRunTemplate"):
        lines.extend([
            "",
            "## Receipt dry-run template",
            "",
            f"- Template: `{payload.get('receiptDryRunTemplate')}`",
            f"- Safety: {payload.get('receiptDryRunSafety')}",
        ])
    lines.extend(["", "## Manual checklist"])
    for item in payload.get("manualChecklist") or []:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Copyable local note",
        "",
        "```yaml",
        str(payload.get("localPostingNoteYaml") or "tower_local_note: {}"),
        "```",
        "",
        "## Safety",
        "- Does not publish.",
        "- Does not upload.",
        "- Does not schedule.",
        "- Does not approve.",
        "- Does not mutate accounts.",
        "- Does not create receipt truth.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    open_items = "".join(f"<li><b>{esc(item.get('label'))}</b><code>{esc(item.get('command'))}</code></li>" for item in payload.get("openCommands") or [])
    checklist = "".join(f"<li>{esc(item)}</li>" for item in payload.get("manualChecklist") or [])
    review_dry_run = f"""
    <section><h2>Safe review dry-run</h2><p>Decision preview: <b>{esc(payload.get('firstReviewDryRunDecision'))}</b></p><code>{esc(payload.get('firstReviewDryRunCommand'))}</code><p class="safety">{esc(payload.get('firstReviewDryRunSafety'))}</p></section>
    """ if payload.get("firstReviewDryRunCommand") else ""
    receipt_dry_run = f"""
    <section><h2>Receipt dry-run template</h2><code>{esc(payload.get('receiptDryRunTemplate'))}</code><p class="safety">{esc(payload.get('receiptDryRunSafety'))}</p></section>
    """ if payload.get("receiptDryRunTemplate") else ""
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower next publishing card</title>
  <style>
    :root {{ color-scheme: light; --ink:#20323a; --sky:#dff0ff; --blue:#2f73a8; --paper:#fbfcf7; --line:#c9d9df; --gold:#b77d27; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: linear-gradient(135deg,#f7fbff,#fff8e8 52%,#e9f4ef); color:var(--ink); }}
    main {{ max-width: 1040px; margin: 34px auto; padding: 0 20px 52px; }}
    .card {{ background: rgba(251,252,247,.94); border:1px solid var(--line); border-radius:28px; padding:28px; box-shadow:0 18px 60px rgba(39,71,89,.15); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.26em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font: 900 clamp(34px,5vw,62px)/.95 ui-serif, Georgia, serif; margin:12px 0; }}
    .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }}
    .meta span {{ border:1px solid var(--line); background:#fff; padding:8px 12px; border-radius:999px; font-weight:800; font-size:12px; }}
    .grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }}
    section {{ border:1px solid var(--line); background:rgba(223,240,255,.38); border-radius:18px; padding:18px; }}
    h2 {{ margin:0 0 10px; color:var(--blue); font-size:16px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:#fff; border:1px solid var(--line); border-radius:12px; padding:10px; }}
    .safety {{ color:#59666a; font-size:14px; }}
    @media(max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main><div class="card">
  <div class="eyebrow">Quipsly Tower</div>
  <h1>Review one publishing move.</h1>
  <p>{esc(payload.get('plainEnglish'))}</p>
  <div class="meta"><span>{esc(payload.get('label'))}</span><span>{esc(payload.get('readinessLabel'))}</span><span>{esc(payload.get('stage'))}</span><span>{esc(payload.get('approvalState'))}</span><span>{esc(payload.get('publicationState'))}</span><span>{esc(payload.get('receiptSlot'))}</span></div>
  <div class="grid">
    <section><h2>Next safest action</h2><p>{esc(payload.get('nextSafestAction'))}</p></section>
    <section><h2>Human decision</h2><p>{esc(payload.get('humanDecisionNeeded'))}</p></section>
    <section><h2>Open local evidence</h2><ul>{open_items}</ul></section>
    <section><h2>Checklist</h2><ul>{checklist}</ul></section>
    {review_dry_run}
    {receipt_dry_run}
  </div>
  <section style="margin-top:16px"><h2>Copyable local note</h2><pre>{esc(payload.get('localPostingNoteYaml'))}</pre></section>
  <p class="safety">Safety: local prep card only. No publish, upload, schedule, approval, account mutation, overwrite, delete, or receipt truth.</p>
</div></main></body></html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Tower next publishing card.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--kind", choices=["manual", "shorts"], default="manual")
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build_payload(root, args.kind)
    out_dir = root / "tower-next-publishing-card" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "tower-next-publishing-card.json"
    markdown_path = out_dir / "START-HERE-tower-next-publishing-card.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open this Tower publishing card",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens one local Tower next-publishing card. No upload, post, schedule, approval, account mutation, overwrite, delete, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_json(root / LATEST_NEXT_CARD, {
        "schema": "quipsly.tower.latest-next-publishing-card.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "label": payload.get("label"),
        "targetLabel": payload.get("targetLabel"),
        "readinessLabel": payload.get("readinessLabel"),
        "publishReady": payload.get("publishReady"),
        "reviewOnlyReason": payload.get("reviewOnlyReason"),
        "cardId": payload.get("cardId"),
        "kind": payload.get("kind"),
        "platform": payload.get("platform"),
        "episode": payload.get("episode"),
        "stage": payload.get("stage"),
        "publicationState": payload.get("publicationState"),
        "receiptSlot": payload.get("receiptSlot"),
        "approvalState": payload.get("approvalState"),
        "humanAsk": payload.get("humanDecisionNeeded"),
        "humanQuestion": payload.get("humanDecisionNeeded"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "codexSafeMove": payload.get("codexSafeMove"),
        "firstDryRunCommand": payload.get("firstReviewDryRunCommand"),
        "firstDryRunDecision": payload.get("firstReviewDryRunDecision"),
        "firstDryRunSafety": payload.get("firstReviewDryRunSafety"),
        "reviewDryRunTemplate": payload.get("reviewDryRunTemplate"),
        "receiptDryRunTemplate": payload.get("receiptDryRunTemplate"),
        "receiptDryRunSafety": payload.get("receiptDryRunSafety"),
        "counts": payload.get("countsContext"),
        "nextPublishingCardPath": str(html_path),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "sessionDir": str(out_dir),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    })
    print(json.dumps({
        "status": payload.get("status"),
        "label": payload.get("label"),
        "targetLabel": payload.get("targetLabel"),
        "readinessLabel": payload.get("readinessLabel"),
        "publishReady": payload.get("publishReady"),
        "reviewOnlyReason": payload.get("reviewOnlyReason"),
        "cardId": payload.get("cardId"),
        "kind": payload.get("kind"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "publicationState": payload.get("publicationState"),
        "receiptSlot": payload.get("receiptSlot"),
        "approvalState": payload.get("approvalState"),
        "firstDryRunCommand": payload.get("firstReviewDryRunCommand"),
        "firstDryRunDecision": payload.get("firstReviewDryRunDecision"),
        "firstSafeAction": payload.get("firstSafeAction"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
