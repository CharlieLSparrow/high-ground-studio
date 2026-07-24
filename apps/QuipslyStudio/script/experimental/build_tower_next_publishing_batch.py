#!/usr/bin/env python3
"""Build a small Tower publishing/review batch.

Reads the latest Tower social command center and writes a compact local batch of
manual publishing packet rows plus shorts review rows. This is a runway artifact,
not a publisher: it never posts, uploads, schedules, approves, mutates accounts,
or creates receipt truth.
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

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_SOCIAL_COMMAND = "tower-social-command-center/latest-tower-social-command-center.json"
LATEST_BATCH = "tower-next-publishing-batch/latest-tower-next-publishing-batch.json"
SCHEMA = "quipsly.tower.next-publishing-batch.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-next-publishing-batch")


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
    packet_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else pointer_path
    packet = load_json(packet_path)
    merged = {**pointer, **packet} if packet else pointer
    return merged, pointer_path


def open_command_for_path(path_value: Any) -> str:
    path = str(path_value or "")
    return f"open {shell_quote(path)}" if path else ""


def card_commands(card: dict[str, Any]) -> dict[str, str]:
    commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
    return {str(k): str(v) for k, v in commands.items() if v}


def manual_row(card: dict[str, Any], index: int) -> dict[str, Any]:
    commands = card_commands(card)
    episode = card.get("episode") or ""
    platform = str(card.get("platform") or "")
    target = f"Episode {episode} -> {platform}" if episode or platform else str(card.get("id") or "manual packet")
    stage = str(card.get("stage") or card.get("stageLabel") or "")
    approval_state = str(card.get("approvalState") or "not-approved-for-external-action")
    publication_state = str(card.get("publicationState") or "not-published")
    review_template = str(commands.get("reviewDryRun") or "")
    first_dry_run_command = concrete_command_from_template(review_template, {
        "approve|refine|hold|pending": "pending",
        "<reviewer>": "Codex",
        "<notes>": f"Tower batch local dry-run for {target}; pending only; no approval, upload, publication, schedule, account mutation, overwrite, delete, or receipt truth.",
    })
    evidence = card.get("packetEvidence") if isinstance(card.get("packetEvidence"), dict) else {}
    return {
        "index": index,
        "kind": "manual-longform",
        "id": str(card.get("id") or f"manual-{index}"),
        "label": f"Review {target} packet",
        "targetLabel": target,
        "episode": episode,
        "platform": platform,
        "version": str(card.get("version") or ""),
        "stage": stage,
        "stageLabel": str(card.get("stageLabel") or stage),
        "approvalState": approval_state,
        "publicationState": publication_state,
        "receiptSlot": str(card.get("receiptSlot") or "empty-until-real-platform-url-or-provider-id"),
        "readinessLabel": "review-only-not-publish-ready",
        "humanDecisionNeeded": str(card.get("humanDecisionNeeded") or "Review this local packet before any platform work depends on it."),
        "nextSafestAction": str(card.get("nextSafestAction") or "Open local metadata/checklist, decide approve/refine/hold/pending locally, and leave receipts empty."),
        "codexSafeMove": str(card.get("codexSafeMove") or "Prepare packet checks and dry-run review notes without external action."),
        "manualChecklist": [str(item) for item in card.get("manualChecklist", []) if isinstance(item, str)] if isinstance(card.get("manualChecklist"), list) else [],
        "localPostingNoteYaml": str(card.get("localPostingNoteYaml") or ""),
        "openCommands": [
            {"label": "Open metadata", "command": commands.get("openMetadata", "")},
            {"label": "Open checklist", "command": commands.get("openChecklist", "")},
            {"label": "Open upload draft", "command": commands.get("openUploadDraft", "")},
        ],
        "reviewDryRunTemplate": review_template,
        "firstDryRunCommand": first_dry_run_command,
        "firstDryRunDecision": "pending",
        "firstDryRunSafety": "Dry-run only. No approval, upload, publication, schedule, account mutation, overwrite, delete, source mutation, or receipt truth.",
        "receiptDryRunTemplate": str(commands.get("receiptDryRun") or ""),
        "receiptDryRunSafety": "Template only. Real receipt capture requires explicit approval plus a real external URL/provider id.",
        "evidence": evidence,
        "truth": str(card.get("truth") or "Tower manual card only. It does not publish, upload, schedule, approve, mutate accounts, or create receipt truth."),
    }


def shorts_row(card: dict[str, Any], index: int) -> dict[str, Any]:
    commands = card_commands(card)
    episode = str(card.get("episodeKey") or "")
    platform = str(card.get("platform") or "")
    title = str(card.get("titleDraft") or card.get("shortId") or f"Short {index}")
    review_path = str(card.get("reviewPath") or "")
    return {
        "index": index,
        "kind": "short-review",
        "id": str(card.get("id") or f"short-{index}"),
        "label": f"Watch/listen {title} for {platform}",
        "targetLabel": f"{episode} -> {platform}" if episode or platform else title,
        "episode": episode,
        "platform": platform,
        "shortId": str(card.get("shortId") or ""),
        "shortIndex": card.get("shortIndex") or "",
        "titleDraft": title,
        "captionDraft": str(card.get("captionDraft") or ""),
        "durationSeconds": card.get("durationSeconds") or 0,
        "stage": str(card.get("stage") or "needs-short-review"),
        "approvalState": str(card.get("approvalState") or "not-approved-for-external-action"),
        "publicationState": str(card.get("publicationState") or "not-published"),
        "receiptSlot": str(card.get("receiptSlot") or "empty-until-real-platform-url-or-provider-id"),
        "readinessLabel": "watch-listen-review-needed",
        "reviewPath": review_path,
        "openCommands": [
            {"label": "Open short export", "command": commands.get("openExport") or open_command_for_path(review_path)},
            {"label": "Reveal short export", "command": commands.get("revealExport", "")},
        ],
        "reviewCommands": [
            {"label": "Keep locally", "command": commands.get("keepLocalReview", "")},
            {"label": "Refine locally", "command": commands.get("refineLocalReview", "")},
            {"label": "Reject locally", "command": commands.get("rejectLocalReview", "")},
        ],
        "commandSafety": str(card.get("commandSafety") or "Short review commands update local Quipsly review metadata only. They do not post, upload, schedule, approve external action, mutate accounts, or create publication receipt truth."),
        "platformCheck": str(card.get("platformCheck") or ""),
        "humanDecisionNeeded": str(card.get("humanDecisionNeeded") or "Watch/listen locally, then choose keep/refine/reject/hold before platform approval."),
        "nextSafestAction": str(card.get("nextSafestAction") or "Open the local short with sound on, then record only local review state."),
        "codexSafeMove": str(card.get("codexSafeMove") or "Open/reveal the export, compare platform fit, and keep receipts empty."),
        "manualChecklist": [str(item) for item in card.get("manualChecklist", []) if isinstance(item, str)] if isinstance(card.get("manualChecklist"), list) else [],
        "localPostingNoteYaml": str(card.get("localPostingNoteYaml") or ""),
        "truth": str(card.get("truth") or "Tower short card only. It does not publish, upload, schedule, approve, mutate accounts, or create receipt truth."),
    }


def pick_rows(packet: dict[str, Any], limit: int, manual_limit: int, shorts_limit: int) -> list[dict[str, Any]]:
    manual_deck = packet.get("manualPublishingActionCards") if isinstance(packet.get("manualPublishingActionCards"), dict) else {}
    shorts_deck = packet.get("shortsPublishingActionCards") if isinstance(packet.get("shortsPublishingActionCards"), dict) else {}
    manual_cards = [card for card in manual_deck.get("cards", []) if isinstance(card, dict)] if isinstance(manual_deck.get("cards"), list) else []
    shorts_cards = [card for card in shorts_deck.get("cards", []) if isinstance(card, dict)] if isinstance(shorts_deck.get("cards"), list) else []

    rows: list[dict[str, Any]] = []
    for card in manual_cards[:manual_limit]:
        rows.append(manual_row(card, len(rows) + 1))
    for card in shorts_cards[:shorts_limit]:
        if len(rows) >= limit:
            break
        rows.append(shorts_row(card, len(rows) + 1))
    return rows[:limit]


def build_payload(root: Path, limit: int, manual_limit: int, shorts_limit: int) -> dict[str, Any]:
    packet, pointer_path = load_social_command(root)
    rows = pick_rows(packet, limit=limit, manual_limit=manual_limit, shorts_limit=shorts_limit)
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    first_row = rows[0] if rows else {}
    first_open = next((item for item in first_row.get("openCommands", []) if isinstance(item, dict) and item.get("command")), {})
    first_dry = str(first_row.get("firstDryRunCommand") or "")
    if not first_dry:
        first_dry = next((str(row.get("firstDryRunCommand") or "") for row in rows if row.get("firstDryRunCommand")), "")
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-next-publishing-batch-ready" if rows else "tower-next-publishing-batch-needs-social-command-center",
        "root": str(root),
        "sourceSocialCommandPointerPath": str(pointer_path),
        "sourceSocialCommandJsonPath": str(packet.get("jsonPath") or ""),
        "sourceSocialCommandHtmlPath": str(packet.get("htmlPath") or ""),
        "title": "Tower next publishing batch",
        "plainEnglish": "A compact local batch for reviewing long-form platform packets and shorts before any approval, upload, schedule, post, or receipt capture.",
        "nextSafestAction": "Work top-down: open one local packet/export, record only local review truth, keep every receipt empty, and move to the next row if one stalls.",
        "counts": {
            "batchRows": len(rows),
            "manualRows": sum(1 for row in rows if row.get("kind") == "manual-longform"),
            "shortRows": sum(1 for row in rows if row.get("kind") == "short-review"),
            "reviewOnlyRows": sum(1 for row in rows if "review" in str(row.get("readinessLabel") or "")),
            "publishReadyRows": 0,
            "dryRunRows": sum(1 for row in rows if row.get("firstDryRunCommand")),
            "localShortReviewRows": sum(1 for row in rows if row.get("reviewCommands")),
            "receiptSlots": sum(1 for row in rows if str(row.get("receiptSlot") or "").startswith("empty-")),
            "capturedReceipts": int(counts.get("capturedReceipts") or 0),
            "sourceManualCards": int(counts.get("manualPublishingActionCards") or 0),
            "sourceShortCards": int(counts.get("shortsPublishingActionCards") or 0),
        },
        "rows": rows,
        "firstSafeAction": {
            "label": "Open Tower next publishing batch",
            "path": "",
            "command": "",
            "safety": "Opens local Tower batch only. No approval, upload, publication, schedule, account mutation, overwrite, delete, source mutation, or receipt truth.",
        },
        "firstOpenCommand": str(first_open.get("command") or ""),
        "firstDryRunCommand": first_dry,
        "firstDryRunDecision": "pending" if first_dry else "",
        "firstDryRunSafety": "Dry-run only. No approval, upload, publication, schedule, account mutation, overwrite, delete, source mutation, or receipt truth." if first_dry else "",
        "truth": {
            "description": "Tower publishing batch only. It reads local action cards and writes local review runway artifacts.",
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "externalUpload": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "versionsOverwritten": False,
            "sourceFilesMutated": False,
            "filesDeleted": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Tower next publishing batch",
        "",
        f"Generated: `{payload.get('generatedAt')}`",
        f"Status: `{payload.get('status')}`",
        "",
        str(payload.get("plainEnglish") or ""),
        "",
        "## Next safest action",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Counts",
    ]
    for key, value in (payload.get("counts") or {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Batch rows"])
    for row in payload.get("rows") or []:
        lines.extend([
            "",
            f"### {row.get('index')}. {row.get('label')}",
            "",
            f"- Kind: `{row.get('kind')}`",
            f"- Stage: `{row.get('stage')}`",
            f"- Approval: `{row.get('approvalState')}`",
            f"- Publication: `{row.get('publicationState')}`",
            f"- Receipt: `{row.get('receiptSlot')}`",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Human decision: {row.get('humanDecisionNeeded')}",
            f"- Safety: {row.get('truth')}",
        ])
        opens = [item for item in row.get("openCommands") or [] if isinstance(item, dict) and item.get("command")]
        if opens:
            lines.append("- Open commands:")
            for item in opens:
                lines.append(f"  - {item.get('label')}: `{item.get('command')}`")
        if row.get("firstDryRunCommand"):
            lines.append(f"- Dry-run review: `{row.get('firstDryRunCommand')}`")
        reviews = [item for item in row.get("reviewCommands") or [] if isinstance(item, dict) and item.get("command")]
        if reviews:
            lines.append("- Local short review commands:")
            for item in reviews:
                lines.append(f"  - {item.get('label')}: `{item.get('command')}`")
            lines.append(f"- Command safety: {row.get('commandSafety')}")
    lines.extend([
        "",
        "## Safety boundary",
        "- Does not publish.",
        "- Does not upload.",
        "- Does not schedule.",
        "- Does not approve external action.",
        "- Does not mutate accounts or sources.",
        "- Does not create receipt truth.",
        "- Does not overwrite previous versions.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["index", "kind", "label", "episode", "platform", "stage", "approvalState", "publicationState", "receiptSlot", "nextSafestAction", "firstOpenCommand", "firstDryRunCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload.get("rows") or []:
            opens = [item for item in row.get("openCommands") or [] if isinstance(item, dict) and item.get("command")]
            writer.writerow({
                "index": row.get("index"),
                "kind": row.get("kind"),
                "label": row.get("label"),
                "episode": row.get("episode"),
                "platform": row.get("platform"),
                "stage": row.get("stage"),
                "approvalState": row.get("approvalState"),
                "publicationState": row.get("publicationState"),
                "receiptSlot": row.get("receiptSlot"),
                "nextSafestAction": row.get("nextSafestAction"),
                "firstOpenCommand": opens[0].get("command") if opens else "",
                "firstDryRunCommand": row.get("firstDryRunCommand") or "",
            })


def render_html(path: Path, payload: dict[str, Any]) -> None:
    cards: list[str] = []
    for row in payload.get("rows") or []:
        opens = "".join(
            f"<li><b>{esc(item.get('label'))}</b><br><code>{esc(item.get('command'))}</code></li>"
            for item in row.get("openCommands") or []
            if isinstance(item, dict) and item.get("command")
        )
        reviews = "".join(
            f"<li><b>{esc(item.get('label'))}</b><br><code>{esc(item.get('command'))}</code></li>"
            for item in row.get("reviewCommands") or []
            if isinstance(item, dict) and item.get("command")
        )
        checklist = "".join(f"<li>{esc(item)}</li>" for item in row.get("manualChecklist") or [])
        dry = f"<p><b>Dry-run review</b><br><code>{esc(row.get('firstDryRunCommand'))}</code></p><p class='safety'>{esc(row.get('firstDryRunSafety'))}</p>" if row.get("firstDryRunCommand") else ""
        cards.append(f"""
        <article class="card {esc(row.get('kind'))}">
          <p class="eyebrow">{esc(row.get('kind'))} · row {esc(row.get('index'))}</p>
          <h2>{esc(row.get('label'))}</h2>
          <div class="chips"><span>{esc(row.get('stage'))}</span><span>{esc(row.get('approvalState'))}</span><span>{esc(row.get('publicationState'))}</span></div>
          <p><b>Next</b><br>{esc(row.get('nextSafestAction'))}</p>
          <p><b>Human decision</b><br>{esc(row.get('humanDecisionNeeded'))}</p>
          <p><b>Receipt</b><br><code>{esc(row.get('receiptSlot'))}</code></p>
          {f'<p><b>Caption draft</b><br>{esc(row.get("captionDraft"))}</p>' if row.get('captionDraft') else ''}
          <div class="columns">
            <section><h3>Open</h3><ul>{opens or '<li>No local open command recorded.</li>'}</ul></section>
            <section><h3>Checklist</h3><ul>{checklist or '<li>Inspect local evidence before choosing a state.</li>'}</ul></section>
          </div>
          {dry}
          {f'<section><h3>Local short review commands</h3><ul>{reviews}</ul><p class="safety">{esc(row.get("commandSafety"))}</p></section>' if reviews else ''}
          <details><summary>Copyable local note</summary><pre>{esc(row.get('localPostingNoteYaml'))}</pre></details>
          <p class="truth">{esc(row.get('truth'))}</p>
        </article>
        """)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    count_cards = "".join(f"<div><b>{esc(k)}</b><span>{esc(v)}</span></div>" for k, v in counts.items())
    html_text = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tower next publishing batch</title>
<style>
:root {{ color-scheme: dark; --bg:#11170f; --panel:#1d281c; --panel2:#26331f; --ink:#f8efd3; --muted:#b9ad8d; --gold:#f0cb4d; --leaf:#78d989; --water:#78c7d6; --clay:#cf775e; --line:#445335; }}
* {{ box-sizing:border-box; }} body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink); background:radial-gradient(circle at 10% 0%,rgba(120,217,137,.16),transparent 30%),radial-gradient(circle at 90% 10%,rgba(240,203,77,.14),transparent 28%),var(--bg); }}
main {{ max-width:1240px; margin:0 auto; padding:34px 24px 70px; }}
header,.card,.boundary {{ border:1px solid var(--line); background:linear-gradient(135deg,rgba(29,40,28,.96),rgba(38,51,31,.86)); border-radius:28px; padding:24px; box-shadow:0 22px 70px rgba(0,0,0,.28); }}
.eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
h1 {{ font-size:clamp(38px,7vw,72px); line-height:.92; margin:0 0 12px; }} h2 {{ margin:0 0 8px; }} h3 {{ color:var(--leaf); margin:0 0 8px; }}
p,li {{ color:var(--muted); line-height:1.45; }} code,pre {{ color:#ffe89a; overflow-wrap:anywhere; white-space:pre-wrap; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:18px 0; }} .counts div {{ border:1px solid var(--line); background:rgba(0,0,0,.18); border-radius:16px; padding:12px; }} .counts span {{ display:block; font-size:24px; color:var(--ink); font-weight:900; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; margin-top:18px; }} .card.short-review {{ border-color:rgba(120,199,214,.56); }} .card.manual-longform {{ border-color:rgba(240,203,77,.54); }}
.chips {{ display:flex; flex-wrap:wrap; gap:8px; margin:10px 0 16px; }} .chips span {{ background:rgba(0,0,0,.23); border:1px solid var(--line); border-radius:999px; color:var(--ink); padding:7px 10px; font-size:12px; font-weight:800; }}
.columns {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }} section {{ min-width:0; }} .safety {{ color:var(--leaf); }} .truth {{ color:#d9cfad; font-size:13px; }}
.boundary {{ margin-top:18px; border-color:rgba(207,119,94,.5); }} @media(max-width:720px){{.columns{{grid-template-columns:1fr}}}}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Tower · local batch</p><h1>Review the next few publishing decisions without pretending anything shipped.</h1><p>{esc(payload.get('plainEnglish'))}</p><p><b>Next safest action:</b> {esc(payload.get('nextSafestAction'))}</p><p><b>Generated:</b> <code>{esc(payload.get('generatedAt'))}</code></p></header>
<section class="counts">{count_cards}</section>
<section class="grid">{''.join(cards)}</section>
<section class="boundary"><p class="eyebrow">Safety boundary</p><ul><li>No external publishing.</li><li>No upload.</li><li>No schedule.</li><li>No external approval.</li><li>No account mutation.</li><li>No source mutation.</li><li>No overwrite/delete.</li><li>No receipt truth without a real platform URL or provider id.</li></ul></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_outputs(root: Path, payload: dict[str, Any]) -> dict[str, str]:
    out_dir = root / "tower-next-publishing-batch" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "tower-next-publishing-batch.json"
    md_path = out_dir / "START-HERE-tower-next-publishing-batch.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "tower-next-publishing-batch.csv"
    payload.update({
        "outputPath": str(md_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"].update({"path": str(html_path), "command": f"open {shell_quote(str(html_path))}"})
    write_json(json_path, payload)
    render_markdown(md_path, payload)
    render_csv(csv_path, payload)
    render_html(html_path, payload)
    pointer = {
        "schema": "quipsly.latest-tower-next-publishing-batch.v1",
        "generatedAt": payload["generatedAt"],
        "status": payload["status"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "outputPath": str(md_path),
        "counts": payload["counts"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstOpenCommand": payload.get("firstOpenCommand", ""),
        "firstDryRunCommand": payload.get("firstDryRunCommand", ""),
        "firstDryRunDecision": payload.get("firstDryRunDecision", ""),
        "firstDryRunSafety": payload.get("firstDryRunSafety", ""),
        "nextSafestAction": payload.get("nextSafestAction", ""),
        "truth": payload["truth"],
    }
    latest_path = root / LATEST_BATCH
    write_json(latest_path, pointer)
    return {"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(md_path), "csvPath": str(csv_path), "latestPointerPath": str(latest_path)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a compact Tower publishing/review batch.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=8)
    parser.add_argument("--manual-limit", type=int, default=3)
    parser.add_argument("--short-limit", type=int, default=5)
    args = parser.parse_args()
    root = Path(args.root)
    payload = build_payload(root, limit=max(args.limit, 1), manual_limit=max(args.manual_limit, 0), shorts_limit=max(args.short_limit, 0))
    paths = write_outputs(root, payload)
    print(json.dumps({"status": payload["status"], "counts": payload["counts"], **paths}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
