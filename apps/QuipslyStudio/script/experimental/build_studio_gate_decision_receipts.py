#!/usr/bin/env python3
"""Build and optionally record local Studio gate classification receipts.

This is the bridge between a human reviewer choosing a Studio gate option and
Quipsly preserving that judgment as inspectable local metadata. It never
promotes packages, approves Tower, publishes, uploads, schedules, overwrites,
deletes, mutates source media, or creates external receipts.
"""
from __future__ import annotations

import csv
import html
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio.gate-decision-receipts.v1"
EVENT_SCHEMA = "quipsly.studio.gate-decision-receipt-event.v1"
RECEIPT_DIR_NAME = "studio-gate-decision-receipts"
COMPANION_POINTER = "review-board/top-review-companions/latest-studio-top-review-companion.json"

LEDGER_COMPATIBILITY = {
    "promote-after-review": "promote",
    "refine-or-rebuild": "refine",
    "hold-current-package": "hold",
    "need-more-evidence": "need-more-evidence",
    "re-sync-or-re-stack-required": "refine",
    "missing-or-wrong-source": "need-more-evidence",
    "trim-candidate": "refine",
    "intentional-mismatch-with-notes": "promote",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp(label: str = "studio-gate-decision-receipts") -> str:
    return datetime.now(timezone.utc).strftime(f"%Y%m%d-%H%M%S-%f-{label}")


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                target_payload = load_json(target)
                if target_payload:
                    return {**payload, **target_payload}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def receipt_root(release_root: Path) -> Path:
    return release_root / "review-board" / RECEIPT_DIR_NAME


def pointer_path(release_root: Path) -> Path:
    return release_root / "review-board" / "latest-studio-gate-decision-receipt-packet.json"


def ledger_path(release_root: Path) -> Path:
    return receipt_root(release_root) / "studio-gate-decision-receipts.json"


def events_path(release_root: Path) -> Path:
    return receipt_root(release_root) / "studio-gate-decision-receipt-events.jsonl"


def load_companion(release_root: Path) -> dict[str, Any]:
    return load_json(release_root / COMPANION_POINTER)


def gate_options(companion: dict[str, Any]) -> list[dict[str, Any]]:
    gates = companion.get("gateClassificationDeck") if isinstance(companion.get("gateClassificationDeck"), list) else []
    rows: list[dict[str, Any]] = []
    for gate in gates:
        if not isinstance(gate, dict):
            continue
        gate_id = str(gate.get("id") or gate.get("reviewItemId") or gate.get("title") or "studio-gate")
        options = gate.get("decisionOptions") if isinstance(gate.get("decisionOptions"), list) else []
        option_rows: list[dict[str, Any]] = []
        for option in options:
            if not isinstance(option, dict):
                continue
            key = str(option.get("key") or option.get("id") or option.get("label") or "option")
            compat = LEDGER_COMPATIBILITY.get(key, "need-more-evidence")
            option_rows.append({
                "key": key,
                "label": str(option.get("label") or key),
                "means": str(option.get("means") or option.get("plainEnglish") or ""),
                "codexMayDo": str(option.get("codexMayDo") or ""),
                "danger": str(option.get("danger") or option.get("watchFor") or ""),
                "compatibleStudioReviewDecision": compat,
                "dryRunCommand": f"./script/agentctl.sh studio-gate-decision-receipt-dry-run {shell_quote(gate_id)} {shell_quote(key)} '<reviewer>' '<notes>'",
                "recordCommand": f"./script/agentctl.sh studio-gate-decision-receipt {shell_quote(gate_id)} {shell_quote(key)} '<reviewer>' '<notes>'",
                "ledgerDryRunCommand": f"./script/agentctl.sh studio-review-decision-dry-run {shell_quote(str(gate.get('reviewItemId') or gate_id))} {compat} '<reviewer>' '<notes>'",
                "safety": "Dry-run first. Record command writes only a local gate receipt sidecar/event; it does not promote, approve, publish, upload, schedule, overwrite, mutate source media, or create external receipts.",
            })
        rows.append({
            "gateId": gate_id,
            "reviewItemId": str(gate.get("reviewItemId") or gate_id),
            "rank": gate.get("rank"),
            "state": str(gate.get("state") or "queued"),
            "episode": gate.get("episode") or "unknown",
            "title": str(gate.get("title") or "Studio gate"),
            "owner": str(gate.get("owner") or "Mako or Charlie"),
            "classificationType": str(gate.get("classificationType") or gate.get("gate") or "studio-gate"),
            "plainEnglish": str(gate.get("plainEnglish") or "Choose the evidence classification before any package or Tower action."),
            "humanQuestion": str(gate.get("humanQuestion") or "What local classification does this evidence support?"),
            "doneWhen": str(gate.get("doneWhen") or "A local gate receipt records the classification and the package/Tower state remains honest."),
            "towerImpact": str(gate.get("towerImpact") or "Tower stays review-gated until this is classified."),
            "notAllowedYet": str(gate.get("notAllowedYet") or "No approval, publication, upload, schedule, receipt, overwrite, or source mutation."),
            "openEvidenceCommand": str(gate.get("openEvidenceCommand") or gate.get("firstEvidenceCommand") or ""),
            "dryRunDecisionCommand": str(gate.get("dryRunDecisionCommand") or ""),
            "recommendedFirstMove": str(gate.get("recommendedFirstMove") or "Open local evidence before recording a receipt."),
            "decisionOptions": option_rows,
        })
    return rows


def load_receipt_ledger(release_root: Path) -> dict[str, Any]:
    path = ledger_path(release_root)
    if path.exists():
        return load_json(path)
    return {
        "schema": SCHEMA,
        "createdAt": iso_now(),
        "updatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "receipts": [],
        "truth": "Local Studio gate classification receipts only. Not package promotion, Tower approval, external publication, upload, schedule, source mutation, overwrite, or receipt truth.",
    }


def receipt_by_gate(ledger: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(row.get("gateId") or ""): row
        for row in ledger.get("receipts") or []
        if isinstance(row, dict) and row.get("gateId")
    }


def build_packet(release_root: Path) -> dict[str, Any]:
    companion = load_companion(release_root)
    rows = gate_options(companion)
    ledger = load_receipt_ledger(release_root)
    existing = receipt_by_gate(ledger)
    for row in rows:
        receipt = existing.get(row["gateId"], {})
        row["currentReceipt"] = receipt
        row["receiptStatus"] = str(receipt.get("status") or "not-recorded")
        row["receiptOptionKey"] = str(receipt.get("optionKey") or "")
        row["receiptReviewer"] = str(receipt.get("reviewer") or "")
        row["receiptRecordedAt"] = str(receipt.get("recordedAt") or "")
    counts = {
        "gates": len(rows),
        "decisionOptions": sum(len(row.get("decisionOptions") or []) for row in rows),
        "receiptsRecorded": sum(1 for row in rows if row.get("receiptStatus") == "recorded"),
        "activeGates": sum(1 for row in rows if row.get("state") == "active"),
        "queuedGates": sum(1 for row in rows if row.get("state") != "active"),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "packagePromotionsCreated": False,
    }
    session_dir = receipt_root(release_root) / stamp()
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-studio-gate-decision-receipts.md"
    csv_path = session_dir / "studio-gate-decision-receipts.csv"
    json_path = session_dir / "studio-gate-decision-receipts-packet.json"
    first_gate = rows[0] if rows else {}
    packet = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio-gate-receipt-packet-ready" if rows else "studio-gate-receipt-packet-empty",
        "releaseRoot": str(release_root),
        "sourceCompanionHtml": companion.get("htmlPath") or "",
        "sourceCompanionJson": companion.get("jsonPath") or "",
        "receiptLedgerPath": str(ledger_path(release_root)),
        "eventLogPath": str(events_path(release_root)),
        "counts": counts,
        "gateReceipts": rows,
        "firstGateReceipt": first_gate,
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "jsonPath": str(json_path),
        "humanAsk": "Open evidence, choose one gate classification, dry-run the receipt, then record only a local gate receipt after real human review.",
        "nextSafestAction": first_gate.get("recommendedFirstMove") or "Open the first Studio gate evidence before recording any receipt.",
        "firstSafeAction": {
            "label": "Open Studio gate decision receipt packet",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local gate receipt guidance only. No package promotion, Tower approval, publication, upload, schedule, overwrite, source mutation, or external receipt truth.",
        },
        "truth": "Local Studio gate receipt packet only. It can prepare or record local gate-classification metadata; it does not promote packages, approve Tower, publish, upload, schedule, overwrite, delete, mutate source media, or create external receipt truth.",
        "agentSafeParallelWork": "Codex can improve evidence summaries, dry-run commands, receipt templates, and review packets. Do not record a live gate receipt without explicit reviewer judgment.",
        "safety": {
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "originalsMutated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "packagePromotionsCreated": False,
        },
    }
    return packet


def write_markdown(packet: dict[str, Any], path: Path) -> None:
    lines = [
        "# Studio gate decision receipt packet",
        "",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Status: `{packet['status']}`",
        f"- Gates: `{packet['counts']['gates']}`",
        f"- Decision options: `{packet['counts']['decisionOptions']}`",
        f"- Receipts recorded: `{packet['counts']['receiptsRecorded']}`",
        "",
        packet["truth"],
        "",
    ]
    for gate in packet.get("gateReceipts") or []:
        lines.extend([
            f"## {gate.get('title')}",
            "",
            f"- Gate ID: `{gate.get('gateId')}`",
            f"- State: `{gate.get('state')}`",
            f"- Owner: `{gate.get('owner')}`",
            f"- Current receipt: `{gate.get('receiptStatus')}` `{gate.get('receiptOptionKey')}`",
            f"- Human question: {gate.get('humanQuestion')}",
            f"- Done when: {gate.get('doneWhen')}",
            f"- Tower impact: {gate.get('towerImpact')}",
            f"- Not allowed yet: {gate.get('notAllowedYet')}",
            f"- Open evidence: `{gate.get('openEvidenceCommand') or 'open the Studio gate companion'}`",
            "",
            "### Decision options",
            "",
        ])
        for option in gate.get("decisionOptions") or []:
            lines.extend([
                f"- **{option.get('label')}** (`{option.get('key')}`)",
                f"  - Means: {option.get('means')}",
                f"  - Codex may: {option.get('codexMayDo')}",
                f"  - Watch for: {option.get('danger')}",
                f"  - Compatible Studio ledger decision: `{option.get('compatibleStudioReviewDecision')}`",
                f"  - Dry-run receipt: `{option.get('dryRunCommand')}`",
                f"  - Record local receipt: `{option.get('recordCommand')}`",
                f"  - Ledger dry-run bridge: `{option.get('ledgerDryRunCommand')}`",
            ])
        lines.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def write_csv(packet: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        fields = ["gateId", "title", "state", "optionKey", "optionLabel", "compatibleStudioReviewDecision", "dryRunCommand", "recordCommand", "receiptStatus"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for gate in packet.get("gateReceipts") or []:
            for option in gate.get("decisionOptions") or []:
                writer.writerow({
                    "gateId": gate.get("gateId"),
                    "title": gate.get("title"),
                    "state": gate.get("state"),
                    "optionKey": option.get("key"),
                    "optionLabel": option.get("label"),
                    "compatibleStudioReviewDecision": option.get("compatibleStudioReviewDecision"),
                    "dryRunCommand": option.get("dryRunCommand"),
                    "recordCommand": option.get("recordCommand"),
                    "receiptStatus": gate.get("receiptStatus"),
                })


def write_html(packet: dict[str, Any], path: Path) -> None:
    cards: list[str] = []
    for gate in packet.get("gateReceipts") or []:
        option_html = []
        for option in gate.get("decisionOptions") or []:
            option_html.append(f"""
<li>
  <h3>{esc(option.get('label'))}</h3>
  <p><b>Means:</b> {esc(option.get('means'))}</p>
  <p><b>Codex may:</b> {esc(option.get('codexMayDo'))}</p>
  <p><b>Watch for:</b> {esc(option.get('danger'))}</p>
  <p><b>Ledger bridge:</b> {esc(option.get('compatibleStudioReviewDecision'))}</p>
  <code>{esc(option.get('dryRunCommand'))}</code>
  <code>{esc(option.get('recordCommand'))}</code>
</li>""")
        cards.append(f"""
<article class="gate {esc(gate.get('state'))}">
  <p class="eyebrow">Episode {esc(gate.get('episode'))} · {esc(gate.get('classificationType'))} · {esc(gate.get('state'))}</p>
  <h2>{esc(gate.get('title'))}</h2>
  <p>{esc(gate.get('plainEnglish'))}</p>
  <div class="receipt">Current local receipt: <b>{esc(gate.get('receiptStatus'))}</b> {esc(gate.get('receiptOptionKey'))}</div>
  <div class="question"><b>Human question</b><p>{esc(gate.get('humanQuestion'))}</p></div>
  <div class="question"><b>Done when</b><p>{esc(gate.get('doneWhen'))}</p></div>
  <div class="question"><b>Evidence first</b><code>{esc(gate.get('openEvidenceCommand') or 'open the Studio gate companion')}</code></div>
  <ol class="options">{''.join(option_html)}</ol>
</article>""")
    counts = packet.get("counts") or {}
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Studio gate decision receipt packet</title>
<style>
:root {{ color-scheme: dark; --bg:#101710; --panel:#1a271d; --line:rgba(248,239,213,.16); --ink:#f8efd5; --muted:#baae8f; --honey:#efca54; --leaf:#66d07d; --clay:#e8795f; --creek:#70c9dc; }}
body {{ margin:0; background:radial-gradient(circle at top left, rgba(102,208,125,.22), transparent 34rem), linear-gradient(180deg,#121b12,#090d0a 72%); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,'Avenir Next',Inter,sans-serif; }}
main {{ max-width:1180px; margin:0 auto; padding:42px 24px 72px; }}
.hero {{ border:1px solid var(--line); border-radius:30px; padding:30px; background:linear-gradient(135deg,rgba(26,39,29,.96),rgba(35,29,17,.88)); box-shadow:0 28px 90px rgba(0,0,0,.36); }}
.eyebrow {{ color:var(--honey); letter-spacing:.24em; text-transform:uppercase; font-size:12px; font-weight:900; }}
h1 {{ margin:8px 0 12px; font-size:clamp(42px,7vw,82px); line-height:.92; }}
.hero p {{ max-width:900px; color:var(--muted); font-size:18px; }}
.stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }} .stat {{ border:1px solid var(--line); border-radius:18px; padding:12px 15px; background:rgba(0,0,0,.18); }} .stat b {{ display:block; color:var(--leaf); font-size:28px; }}
.gate {{ margin-top:18px; border:1px solid var(--line); border-radius:26px; padding:22px; background:rgba(255,255,255,.055); }} .gate.active {{ border-color:rgba(232,121,95,.5); }}
h2 {{ margin:5px 0 8px; font-size:30px; }} .receipt,.question {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.18); margin-top:10px; }}
.options {{ display:grid; gap:12px; padding-left:22px; }} .options li {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(0,0,0,.16); }} h3 {{ margin:0 0 8px; color:var(--honey); }} code {{ display:block; color:var(--creek); white-space:pre-wrap; word-break:break-word; margin-top:8px; }} p {{ color:var(--muted); }}
</style>
</head>
<body><main>
<section class="hero"><p class="eyebrow">Quipsly Studio · local gate receipts</p><h1>Choose a gate classification without moving the world.</h1><p>This packet lets a reviewer record the local meaning of Studio evidence. It does not approve Tower, promote packages, publish, upload, schedule, overwrite, mutate media, or create external receipt truth.</p><div class="stats"><div class="stat"><b>{counts.get('gates',0)}</b>Gates</div><div class="stat"><b>{counts.get('decisionOptions',0)}</b>Options</div><div class="stat"><b>{counts.get('receiptsRecorded',0)}</b>Local receipts</div></div></section>
{''.join(cards)}
</main></body></html>"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")


def pointer_payload(packet: dict[str, Any]) -> dict[str, Any]:
    return {
        "schema": SCHEMA,
        "generatedAt": packet.get("generatedAt"),
        "status": packet.get("status"),
        "counts": packet.get("counts") or {},
        "htmlPath": packet.get("htmlPath"),
        "jsonPath": packet.get("jsonPath"),
        "markdownPath": packet.get("markdownPath"),
        "csvPath": packet.get("csvPath"),
        "receiptLedgerPath": packet.get("receiptLedgerPath"),
        "eventLogPath": packet.get("eventLogPath"),
        "humanAsk": packet.get("humanAsk"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "firstSafeAction": packet.get("firstSafeAction"),
        "firstGateReceipt": packet.get("firstGateReceipt") or {},
        "gateReceiptOptions": packet.get("gateReceipts") or [],
        "truth": packet.get("truth"),
        "safety": packet.get("safety") or {},
        "agentSafeParallelWork": packet.get("agentSafeParallelWork"),
    }


def persist_packet(packet: dict[str, Any], release_root: Path) -> dict[str, Any]:
    write_html(packet, Path(packet["htmlPath"]))
    write_markdown(packet, Path(packet["markdownPath"]))
    write_csv(packet, Path(packet["csvPath"]))
    write_json(Path(packet["jsonPath"]), packet)
    pointer = pointer_payload(packet)
    write_json(pointer_path(release_root), pointer)
    write_json(receipt_root(release_root) / "latest-studio-gate-decision-receipt-packet.json", pointer)
    return pointer


def find_gate_and_option(release_root: Path, gate_id: str, option_key: str) -> tuple[dict[str, Any], dict[str, Any]]:
    companion = load_companion(release_root)
    for gate in gate_options(companion):
        if gate.get("gateId") != gate_id and gate.get("reviewItemId") != gate_id:
            continue
        for option in gate.get("decisionOptions") or []:
            if option.get("key") == option_key:
                return gate, option
        valid = ", ".join(str(option.get("key")) for option in gate.get("decisionOptions") or [])
        raise SystemExit(f"Option not found for {gate_id}: {option_key}. Valid options: {valid}")
    valid_gates = ", ".join(str(g.get("gateId")) for g in gate_options(companion))
    raise SystemExit(f"Gate not found: {gate_id}. Valid gates: {valid_gates}")


def snapshot_ledger(path: Path) -> str:
    if not path.exists():
        return ""
    version_dir = path.parent / "ledger-versions"
    version_dir.mkdir(parents=True, exist_ok=True)
    target = version_dir / f"studio-gate-decision-receipts-before-{stamp('update')}.json"
    shutil.copy2(path, target)
    return str(target)


def record_receipt(release_root: Path, gate_id: str, option_key: str, reviewer: str, notes: str, *, dry_run: bool) -> dict[str, Any]:
    if not reviewer.strip():
        raise SystemExit("Reviewer is required")
    gate, option = find_gate_and_option(release_root, gate_id, option_key)
    now = iso_now()
    receipt = {
        "schema": EVENT_SCHEMA,
        "status": "recorded",
        "gateId": gate.get("gateId"),
        "reviewItemId": gate.get("reviewItemId"),
        "episode": gate.get("episode"),
        "title": gate.get("title"),
        "optionKey": option.get("key"),
        "optionLabel": option.get("label"),
        "compatibleStudioReviewDecision": option.get("compatibleStudioReviewDecision"),
        "reviewer": reviewer,
        "notes": notes,
        "recordedAt": now,
        "sourceCompanionPointer": str(release_root / COMPANION_POINTER),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "originalsMutated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "packagePromotionsCreated": False,
        "truth": "Local Studio gate classification receipt only. Not package promotion, Tower approval, external publication, upload, schedule, source mutation, overwrite, or external receipt truth.",
    }
    ledger = load_receipt_ledger(release_root)
    receipts = [row for row in ledger.get("receipts") or [] if isinstance(row, dict)]
    before = next((row for row in receipts if row.get("gateId") == gate.get("gateId")), {})
    preview_receipts = [row for row in receipts if row.get("gateId") != gate.get("gateId")]
    preview_receipts.append(receipt)
    if dry_run:
        return {
            "ok": True,
            "dryRun": True,
            "kind": "studio-gate-decision-receipt",
            "gateId": gate.get("gateId"),
            "optionKey": option.get("key"),
            "reviewer": reviewer,
            "before": before,
            "afterPreview": receipt,
            "countsAfterPreview": {"receiptsRecorded": len(preview_receipts)},
            "ledgerPath": str(ledger_path(release_root)),
            "eventLogPath": str(events_path(release_root)),
            "ledgerMutated": False,
            "eventAppended": False,
            "snapshotCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "packagePromotionsCreated": False,
            "sourceFilesMutated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "truth": "Dry-run only. No gate receipt, ledger, event log, package, Tower approval, publication, upload, schedule, external receipt, source media, or version state was changed.",
        }
    root = receipt_root(release_root)
    root.mkdir(parents=True, exist_ok=True)
    snap = snapshot_ledger(ledger_path(release_root))
    ledger.update({
        "schema": SCHEMA,
        "updatedAt": now,
        "releaseRoot": str(release_root),
        "receipts": preview_receipts,
        "counts": {"receiptsRecorded": len(preview_receipts)},
        "lastGateDecisionReceipt": receipt,
        "truth": "Local Studio gate classification receipts only. Not package promotion, Tower approval, external publication, upload, schedule, source mutation, overwrite, or external receipt truth.",
    })
    if not ledger.get("createdAt"):
        ledger["createdAt"] = now
    write_json(ledger_path(release_root), ledger)
    with events_path(release_root).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(receipt, sort_keys=True) + "\n")
    persist_packet(build_packet(release_root), release_root)
    return {
        "ok": True,
        "dryRun": False,
        "kind": "studio-gate-decision-receipt",
        "gateId": gate.get("gateId"),
        "optionKey": option.get("key"),
        "reviewer": reviewer,
        "ledgerPath": str(ledger_path(release_root)),
        "eventLogPath": str(events_path(release_root)),
        "snapshotPath": snap,
        "ledgerMutated": True,
        "eventAppended": True,
        "snapshotCreated": bool(snap),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "packagePromotionsCreated": False,
        "sourceFilesMutated": False,
        "originalsMutated": False,
        "versionsOverwritten": False,
        "truth": "Local Studio gate classification receipt recorded only. No package promotion, Tower approval, publication, upload, schedule, source mutation, overwrite, or external receipt truth occurred.",
    }


def main(argv: list[str]) -> int:
    if len(argv) == 1 or argv[1] == "build":
        release_root = Path(argv[2]) if len(argv) > 2 else DEFAULT_RELEASE_ROOT
        print(json.dumps(persist_packet(build_packet(release_root), release_root), indent=2, sort_keys=True))
        return 0
    if argv[1] == "record":
        if len(argv) < 6:
            raise SystemExit("Usage: build_studio_gate_decision_receipts.py record GATE_ID OPTION_KEY REVIEWER [notes] [--dry-run] [--release-root PATH]")
        dry_run = "--dry-run" in argv
        release_root = DEFAULT_RELEASE_ROOT
        clean = [value for value in argv[2:] if value != "--dry-run"]
        if "--release-root" in clean:
            idx = clean.index("--release-root")
            release_root = Path(clean[idx + 1])
            clean = clean[:idx] + clean[idx + 2:]
        gate_id, option_key, reviewer = clean[0], clean[1], clean[2]
        notes = clean[3] if len(clean) > 3 else ""
        print(json.dumps(record_receipt(release_root, gate_id, option_key, reviewer, notes, dry_run=dry_run), indent=2, sort_keys=True))
        return 0
    release_root = Path(argv[1])
    print(json.dumps(persist_packet(build_packet(release_root), release_root), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
