#!/usr/bin/env python3
"""Build a Tower publishing operator workbench.

This composes existing Tower/social publication evidence into one local
operator surface. It does not publish, upload, schedule, approve, mutate
accounts, or capture receipts.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_POINTER = "tower-operator-workbench/latest-tower-operator-workbench.json"
SCHEMA = "quipsly.tower.operator-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-operator-workbench")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path else {}
    return {**pointer, **target} if target else pointer


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def first_list(packet: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    for key in keys:
        value = packet.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            for child_key in ["cards", "rows", "items", "slots"]:
                child = value.get(child_key)
                if isinstance(child, list):
                    return [item for item in child if isinstance(item, dict)]
    return []


def front_door(label: str, packet: dict[str, Any], *path_keys: str) -> dict[str, Any]:
    for key in path_keys:
        path = str(packet.get(key) or "")
        if path:
            return {
                "label": label,
                "path": path,
                "pathExists": Path(path).exists(),
                "openCommand": f"open {shell_quote(path)}",
            }
    return {"label": label, "path": "", "pathExists": False, "openCommand": ""}


def command_from(commands: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = str(commands.get(key) or "")
        if value:
            return value
    return ""


def normalize_manual_row(card: dict[str, Any], rank: int) -> dict[str, Any]:
    commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
    gate = card.get("postingGate") if isinstance(card.get("postingGate"), dict) else {}
    return {
        "rank": rank,
        "kind": "long-form/platform",
        "id": str(card.get("id") or f"manual-{rank}"),
        "episode": str(card.get("episode") or ""),
        "version": str(card.get("version") or ""),
        "platform": str(card.get("platform") or ""),
        "stage": str(card.get("stage") or ""),
        "stageLabel": str(card.get("stageLabel") or ""),
        "publicationState": str(card.get("publicationState") or "not-published"),
        "approvalState": str(card.get("approvalState") or "not-approved-for-external-action"),
        "receiptSlot": str(card.get("receiptSlot") or "empty-until-real-platform-url-or-provider-id"),
        "humanDecisionNeeded": str(card.get("humanDecisionNeeded") or ""),
        "nextSafestAction": str(card.get("nextSafestAction") or ""),
        "metadataReady": bool((card.get("packetEvidence") or {}).get("metadataReady")) if isinstance(card.get("packetEvidence"), dict) else False,
        "checklistReady": bool((card.get("packetEvidence") or {}).get("checklistReady")) if isinstance(card.get("packetEvidence"), dict) else False,
        "uploadDraftReady": bool((card.get("packetEvidence") or {}).get("uploadDraftReady")) if isinstance(card.get("packetEvidence"), dict) else False,
        "externalPostingAllowedNow": bool(gate.get("externalPostingAllowedNow")),
        "receiptCaptureAllowedNow": bool(gate.get("receiptCaptureAllowedNow")),
        "openPrimaryCommand": command_from(commands, "openMetadata", "openChecklist", "openUploadDraft"),
        "openChecklistCommand": command_from(commands, "openChecklist"),
        "openMetadataCommand": command_from(commands, "openMetadata"),
        "openUploadDraftCommand": command_from(commands, "openUploadDraft"),
        "reviewDryRunCommand": command_from(commands, "reviewDryRun"),
        "receiptDryRunCommand": command_from(commands, "receiptDryRun"),
        "localPostingNoteYaml": str(card.get("localPostingNoteYaml") or ""),
        "truth": str(card.get("truth") or "Tower manual row only. No external action occurred."),
    }


def normalize_short_row(card: dict[str, Any], rank: int) -> dict[str, Any]:
    commands = card.get("commands") if isinstance(card.get("commands"), dict) else {}
    gate = card.get("postingGate") if isinstance(card.get("postingGate"), dict) else {}
    return {
        "rank": rank,
        "kind": "short/platform",
        "id": str(card.get("id") or card.get("shortId") or f"short-{rank}"),
        "episode": str(card.get("episodeKey") or ""),
        "version": "",
        "platform": str(card.get("platform") or ""),
        "stage": str(card.get("stage") or ""),
        "stageLabel": str(card.get("titleDraft") or ""),
        "publicationState": str(card.get("publicationState") or "not-published"),
        "approvalState": str(card.get("approvalState") or "not-approved-for-external-action"),
        "receiptSlot": str(card.get("receiptSlot") or "empty-until-real-platform-url-or-provider-id"),
        "humanDecisionNeeded": str(card.get("humanDecisionNeeded") or ""),
        "nextSafestAction": str(card.get("nextSafestAction") or ""),
        "durationSeconds": card.get("durationSeconds"),
        "aspectFit": str(card.get("aspectFit") or ""),
        "externalPostingAllowedNow": bool(gate.get("externalPostingAllowedNow")),
        "receiptCaptureAllowedNow": bool(gate.get("receiptCaptureAllowedNow")),
        "openPrimaryCommand": command_from(commands, "openExport"),
        "openExportCommand": command_from(commands, "openExport"),
        "reviewDryRunCommand": "",
        "receiptDryRunCommand": "",
        "titleDraft": str(card.get("titleDraft") or ""),
        "captionDraft": str(card.get("captionDraft") or ""),
        "localPostingNoteYaml": str(card.get("localPostingNoteYaml") or ""),
        "truth": str(card.get("truth") or "Tower short row only. No external action occurred."),
    }


def build(root: Path = DEFAULT_ROOT, manual_limit: int = 8, short_limit: int = 8) -> dict[str, Any]:
    social = load_pointer_target(root / "tower-social-command-center/latest-tower-social-command-center.json")
    control = load_pointer_target(root / "tower-publication-control-room/latest-tower-publication-control-room.json")
    next_card = load_pointer_target(root / "tower-next-publishing-card/latest-tower-next-publishing-card.json")
    manual_cards = first_list(social, "manualPublishingActionCards")[:manual_limit]
    short_cards = first_list(social, "shortsPublishingActionCards")[:short_limit]
    review_slots = first_list(social, "reviewWeekPlan")[:10]
    manual_rows = [normalize_manual_row(card, index) for index, card in enumerate(manual_cards, 1)]
    short_rows = [normalize_short_row(card, index) for index, card in enumerate(short_cards, 1)]
    counts = social.get("counts") if isinstance(social.get("counts"), dict) else {}
    control_counts = control.get("counts") if isinstance(control.get("counts"), dict) else {}
    front_doors = [
        front_door("Tower publication control room", control, "htmlPath"),
        front_door("Tower social command center", social, "htmlPath"),
        front_door("Next publishing card", next_card, "htmlPath", "nextPublishingCardPath"),
        front_door("Manual publishing action cards", social, "manualPublishingActionCardsPath"),
        front_door("Shorts publishing action cards", social, "shortsPublishingActionCardsPath"),
        front_door("Draft social calendar", social, "draftSocialCalendarPath"),
        front_door("Review week plan", social, "reviewWeekPlanPath"),
    ]
    ready = bool(manual_rows or short_rows)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-operator-workbench-ready" if ready else "tower-operator-workbench-needs-social-command-center",
        "releaseRoot": str(root),
        "label": "Tower operator workbench",
        "humanAsk": "Review platform packets and shorts locally. Prepare copy, checklists, dry-run decisions, and receipt slots, but do not publish, upload, schedule, approve, or capture receipt truth without explicit approval.",
        "nextSafestAction": "Open the first platform row, inspect local metadata/checklist/export evidence, then record only a local review/refine/hold decision if approved.",
        "frontDoors": front_doors,
        "manualRows": manual_rows,
        "shortRows": short_rows,
        "reviewWeekPlanRows": review_slots,
        "counts": {
            "episodes": int(counts.get("episodes") or control_counts.get("episodes") or 0),
            "platforms": int(counts.get("platforms") or 0),
            "manualRows": len(manual_rows),
            "shortRows": len(short_rows),
            "reviewWeekPlanRows": len(review_slots),
            "socialItems": int(counts.get("items") or control_counts.get("socialItems") or 0),
            "draftOnlySchedules": int(counts.get("draftOnlySchedules") or control_counts.get("calendarRows") or 0),
            "receiptSlots": int(control_counts.get("receiptSlots") or 0),
            "capturedReceipts": int(counts.get("capturedReceipts") or control_counts.get("capturedReceipts") or 0),
            "readyForApproval": int(counts.get("readyForApproval") or control_counts.get("readyForApproval") or 0),
            "blockedOrReview": int(counts.get("blockedOrReview") or control_counts.get("blockedOrReview") or 0),
            "frontDoors": len([item for item in front_doors if item.get("path")]),
            "externalPublishing": bool(control_counts.get("externalPublishing")),
            "externalSchedulesCreated": bool(control_counts.get("externalSchedulesCreated")),
            "receiptTruthCreated": bool(control_counts.get("receiptTruthCreated")),
            "accountMutation": bool(control_counts.get("accountMutation")),
        },
        "firstSafeAction": {
            "label": "Open Tower operator workbench",
            "command": "",
            "path": "",
            "safety": "Opens local Tower review evidence only. No external publishing, upload, schedule, approval, account mutation, or receipt capture.",
        },
        "truth": {
            "description": "Tower operator workbench only. It composes local packet, calendar, review, and receipt-slot evidence.",
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "accountMutation": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Tower operator workbench",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Episodes: `{payload.get('counts', {}).get('episodes')}`",
        f"- Social items: `{payload.get('counts', {}).get('socialItems')}`",
        f"- Receipt slots: `{payload.get('counts', {}).get('receiptSlots')}`",
        f"- Captured receipts: `{payload.get('counts', {}).get('capturedReceipts')}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Front doors",
    ]
    for item in payload.get("frontDoors") or []:
        if item.get("path"):
            lines.append(f"- {item.get('label')}: `{item.get('openCommand')}`")
    lines.extend(["", "## Long-form/platform rows"])
    for row in payload.get("manualRows") or []:
        lines.extend([
            f"### {row.get('rank')}. Episode {row.get('episode')} -> {row.get('platform')}",
            f"- Stage: `{row.get('stage')}`",
            f"- Approval: `{row.get('approvalState')}`",
            f"- Receipt: `{row.get('receiptSlot')}`",
            f"- Next: {row.get('nextSafestAction')}",
            f"- Open: `{row.get('openPrimaryCommand')}`",
            f"- Review dry run: `{row.get('reviewDryRunCommand')}`",
            "",
        ])
    lines.extend(["", "## Shorts rows"])
    for row in payload.get("shortRows") or []:
        lines.extend([
            f"### {row.get('rank')}. {row.get('platform')} - {row.get('titleDraft')}",
            f"- Stage: `{row.get('stage')}`",
            f"- Duration: `{row.get('durationSeconds')}`",
            f"- Open: `{row.get('openPrimaryCommand')}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "## Safety",
        "Local operator surface only. No external publish, upload, schedule, approval, account mutation, or receipt capture.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    doors = "".join(
        f"<a class='door' href='{esc(Path(str(item.get('path'))).as_uri() if item.get('path') else '#')}'><b>{esc(item.get('label'))}</b><span>{esc(item.get('pathExists'))}</span></a>"
        for item in payload.get("frontDoors") or []
        if item.get("path")
    )
    def row_html(row: dict[str, Any]) -> str:
        title = f"Episode {row.get('episode')} -> {row.get('platform')}" if row.get("kind") == "long-form/platform" else f"{row.get('platform')} - {row.get('titleDraft') or row.get('stageLabel')}"
        details = row.get("localPostingNoteYaml") or row.get("captionDraft") or ""
        return f"""
        <article class="row">
          <div class="rail">{esc(row.get('kind'))}</div>
          <div>
            <div class="eyebrow">{esc(row.get('stage'))}</div>
            <h2>{esc(title)}</h2>
            <p>{esc(row.get('humanDecisionNeeded') or row.get('nextSafestAction'))}</p>
            <div class="chips">
              <span>{esc(row.get('publicationState'))}</span>
              <span>{esc(row.get('approvalState'))}</span>
              <span>{esc(row.get('receiptSlot'))}</span>
              <span>post allowed: {esc(row.get('externalPostingAllowedNow'))}</span>
            </div>
            <details><summary>Open and dry-run commands</summary>
              <code>{esc(row.get('openPrimaryCommand'))}</code>
              <code>{esc(row.get('reviewDryRunCommand'))}</code>
              <code>{esc(row.get('receiptDryRunCommand'))}</code>
            </details>
            <details><summary>Local note/caption</summary><pre>{esc(details)}</pre></details>
          </div>
        </article>"""
    manual = "".join(row_html(row) for row in payload.get("manualRows") or [])
    shorts = "".join(row_html(row) for row in payload.get("shortRows") or [])
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower operator workbench</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f8f0dc; --paper:#17211f; --sky:#9fcbe3; --gold:#e6bd58; --line:#3a514d; --clay:#d9784f; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 80% 0%, #36566a, #111918 48%, #211915); color:var(--ink); }}
    main {{ max-width: 1240px; margin:34px auto; padding:0 22px 60px; }}
    .hero {{ border:1px solid var(--line); border-radius:32px; padding:28px; background:rgba(23,33,31,.94); box-shadow:0 26px 90px rgba(0,0,0,.36); }}
    .eyebrow {{ color:var(--gold); font-size:12px; letter-spacing:.25em; text-transform:uppercase; font-weight:900; }}
    h1 {{ font:900 clamp(38px,5vw,66px)/.95 ui-serif, Georgia, serif; margin:10px 0; }}
    .meta,.chips {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .meta span,.chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.07); font-weight:850; font-size:12px; }}
    .doors {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:10px; margin:18px 0; }}
    .door {{ color:var(--ink); text-decoration:none; border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.055); display:flex; justify-content:space-between; gap:12px; }}
    h2 {{ margin:4px 0 8px; color:#fff8df; }}
    .row {{ display:grid; grid-template-columns:150px 1fr; gap:18px; border:1px solid var(--line); border-radius:24px; padding:16px; margin-top:14px; background:rgba(255,255,255,.045); }}
    .rail {{ color:var(--sky); font-weight:950; text-transform:uppercase; letter-spacing:.12em; font-size:12px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.25); border:1px solid var(--line); border-radius:12px; padding:10px; color:#fff6d8; }}
    details {{ margin-top:10px; }}
    summary {{ cursor:pointer; color:var(--sky); font-weight:900; }}
    @media(max-width:760px) {{ .row {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main>
  <section class="hero">
    <div class="eyebrow">Quipsly Tower</div>
    <h1>Prepare the launch. Do not fake the receipt.</h1>
    <p>{esc(payload.get('humanAsk'))}</p>
    <div class="meta">
      <span>{esc(payload.get('status'))}</span>
      <span>{esc(counts.get('socialItems'))} social items</span>
      <span>{esc(counts.get('draftOnlySchedules'))} draft slots</span>
      <span>{esc(counts.get('receiptSlots'))} receipt slots</span>
      <span>{esc(counts.get('capturedReceipts'))} receipts captured</span>
      <span>{esc(counts.get('readyForApproval'))} ready for approval</span>
    </div>
    <div class="doors">{doors}</div>
  </section>
  <section><h1>Long-form/platform rows</h1>{manual}</section>
  <section><h1>Shorts rows</h1>{shorts}</section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    rows = (payload.get("manualRows") or []) + (payload.get("shortRows") or [])
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "kind", "episode", "platform", "stage", "publicationState", "approvalState", "receiptSlot", "openPrimaryCommand", "nextSafestAction"])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames})


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Build Tower operator workbench.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--manual-limit", type=int, default=8)
    parser.add_argument("--short-limit", type=int, default=8)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build(root, args.manual_limit, args.short_limit)
    out_dir = root / "tower-operator-workbench" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "tower-operator-workbench.json"
    markdown_path = out_dir / "START-HERE-tower-operator-workbench.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "tower-operator-workbench.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Tower operator workbench",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local Tower review evidence only. No external publishing, upload, schedule, approval, account mutation, or receipt capture.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_csv(csv_path, payload)
    write_json(root / LATEST_POINTER, {
        "schema": "quipsly.tower.latest-operator-workbench.v1",
        "updatedAt": payload.get("generatedAt"),
        "status": payload.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload.get("counts"),
        "humanAsk": payload.get("humanAsk"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    })
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload.get("status") == "tower-operator-workbench-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
