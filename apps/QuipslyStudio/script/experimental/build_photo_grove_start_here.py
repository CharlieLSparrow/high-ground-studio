#!/usr/bin/env python3
"""Build a human-first Photo Grove Start Here page.

The control room is detailed; this page is the calm first door. It points a
reviewer to the safest next artifact, keeps backup/cull/cloud truth separate,
and explains what not to touch yet.
"""

from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-start-here.json"
SOURCES = {
    "controlRoom": "latest-photo-grove-control-room.json",
    "cardBackupReceipt": "latest-photo-grove-card-backup-receipt.json",
    "cardIntakeRunway": "latest-photo-grove-card-intake-runway.json",
    "liveIntakeStatus": "latest-photo-grove-live-intake-status.json",
    "cloudDuplicationPlan": "latest-photo-grove-cloud-duplication-plan.json",
    "cloudApprovalDesk": "latest-photo-grove-cloud-approval-desk.json",
    "readyFolderSampler": "latest-photo-grove-ready-folder-sampler.json",
    "readyCullWorksheet": "latest-photo-grove-ready-cull-worksheet.json",
    "nextCullBatch": "latest-photo-grove-next-cull-batch.json",
    "cullTheater": "latest-photo-grove-cull-theater.json",
    "firstPassTriage": "latest-photo-grove-first-pass-triage.json",
    "readyCullDecisionDraft": "latest-photo-grove-ready-cull-decision-draft.json",
    "readyCullReceiptPreview": "latest-photo-grove-ready-cull-receipt-preview.json",
    "sampleCullRehearsal": "latest-photo-grove-sample-cull-rehearsal.json",
}


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath")
        if target:
            target_path = Path(str(target))
            if target_path.exists() and target_path != path:
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload}
        latest = payload.get("latest")
        if latest:
            latest_path = Path(str(latest))
            if latest_path.exists():
                latest_payload = json.loads(latest_path.read_text(encoding="utf-8"))
                if isinstance(latest_payload, dict):
                    return latest_payload
        return payload
    except Exception as exc:
        return {"status": "load-error", "error": str(exc), "path": str(path)}


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
    for key in ("htmlPath", "markdownPath", "jsonPath"):
        value = payload.get(key)
        if value:
            return str(value)
    return ""


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\\''") + "'"


def source_summary(parts: dict[str, dict[str, Any]]) -> dict[str, dict[str, str]]:
    return {
        key: {
            "status": str(payload.get("status") or "missing"),
            "path": first_path(payload),
        }
        for key, payload in parts.items()
    }


def status_from(control: dict[str, Any], backup: dict[str, Any]) -> tuple[str, str, str]:
    missing = count(backup, "missingDestination")
    mismatch = count(backup, "sizeMismatch")
    active = count(backup, "activeBackupProcesses")
    if active or missing or mismatch:
        return (
            "photo-grove-start-here-backup-in-progress",
            "Backup still running",
            "Keep the card and external drive mounted. Use only complete-folder review surfaces until the local backup receipt is clean.",
        )
    if count(control, "readyCullPreviewActionableDecisionRows"):
        return (
            "photo-grove-start-here-ready-to-review-draft",
            "Cull draft ready for receipt preview",
            "A sidecar cull draft has actionable decisions. Inspect the receipt preview before any ledger write.",
        )
    return (
        "photo-grove-start-here-ready-for-cull-intent",
        "Ready for cull intent",
        "The safe next action is to review sampled thumbnails and draft keep/reject/review/favorite intent as sidecar metadata.",
    )


def action_card(kind: str, label: str, why: str, path: str = "", command: str = "") -> dict[str, str]:
    return {
        "kind": kind,
        "label": label,
        "why": why,
        "path": path,
        "command": command or (f"open {shell_quote(path)}" if path else ""),
    }


def build_actions(parts: dict[str, dict[str, Any]], counts: dict[str, int]) -> list[dict[str, str]]:
    actions = [
        action_card(
            "start",
            "Open the Photo Grove control room",
            "Use this when you want the full operator dashboard with backup, cull, proof, cloud, and safety counts.",
            first_path(parts["controlRoom"]),
        ),
        action_card(
            "review",
            "Open first-pass triage",
            f"Start with {counts['firstPassTriageGroups']} comparison group(s), {counts['firstPassTriageSamples']} sample frame(s), and {counts['firstPassTriageDryRunDirections']} dry-run direction(s).",
            first_path(parts["firstPassTriage"]),
            command=f"open {shell_quote(first_path(parts['firstPassTriage']))}" if first_path(parts["firstPassTriage"]) else "./script/agentctl.sh photo-grove-first-pass-triage",
        ),
        action_card(
            "protect",
            "Open live card intake status",
            "Use this when a card copy is running. It shows active copy processes, fast intake progress, full-backup gaps, and cloud-copy safety state.",
            first_path(parts["liveIntakeStatus"]),
            command=f"open {shell_quote(first_path(parts['liveIntakeStatus']))}" if first_path(parts["liveIntakeStatus"]) else "./script/agentctl.sh photo-grove-live-intake-status",
        ),
        action_card(
            "review",
            "Open the broad cull theater",
            f"Review {counts['cullTheaterRows']} photo row(s) across {counts['cullTheaterGroupRows']} comparison group(s), with {counts['cullTheaterDryRunCommands']} dry-run commands and no metadata writes.",
            first_path(parts["cullTheater"]),
        ),
        action_card(
            "review",
            "Open the ready cull worksheet",
            f"Review {counts['readyCullWorksheetRows']} sampled row(s) from complete backup folders only.",
            first_path(parts["readyCullWorksheet"]),
        ),
        action_card(
            "review",
            "Open the next cull batch",
            f"Work one coherent group: {counts['nextCullBatchRows']} photo(s), {counts['nextCullBatchDryRunRows']} dry-run command row(s), no live metadata writes.",
            first_path(parts["nextCullBatch"]),
        ),
        action_card(
            "draft",
            "Draft one cull intent",
            "Example: mark one worksheet row as review without applying metadata truth.",
            command="./script/agentctl.sh photo-grove-ready-cull-decision-draft --set ready-cull-0001=review --note 'ready-cull-0001=Needs human look' --reviewer charlie",
        ),
        action_card(
            "practice",
            "Open sample cull rehearsal",
            "Practice the cull-intent shape with rehearsal-only review rows before making real quality judgments.",
            first_path(parts["sampleCullRehearsal"]),
            command=f"open {shell_quote(first_path(parts['sampleCullRehearsal']))}" if first_path(parts["sampleCullRehearsal"]) else "./script/agentctl.sh photo-grove-sample-cull-rehearsal",
        ),
        action_card(
            "verify",
            "Open the ready cull receipt preview",
            f"Validate the draft before any ledger write: {counts['readyCullPreviewActionableDecisionRows']} actionable, {counts['readyCullPreviewInvalidRows']} invalid, {counts['readyCullPreviewMissingSourceRows']} missing source.",
            first_path(parts["readyCullReceiptPreview"]),
        ),
        action_card(
            "protect",
            "Check the card intake runway",
            f"Backup is still missing {counts['cardBackupMissingDestination']} file(s); this page explains what is safe while copying.",
            first_path(parts["cardIntakeRunway"]),
        ),
        action_card(
            "later",
            "Read the cloud duplication plan",
            "Prepared routes for Drive, Photos, and GCS, blocked until local backup is complete and explicitly approved.",
            first_path(parts["cloudDuplicationPlan"]),
        ),
        action_card(
            "approval",
            "Open the cloud approval desk",
            "Choose Drive archive, Photos selects, or GCS media vault only after local backup is clean; this page lists receipt slots without uploading.",
            first_path(parts["cloudApprovalDesk"]),
        ),
    ]
    return actions


def build_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    actions = "\n".join(
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
    source_rows = "\n".join(
        f"<tr><th>{html.escape(key)}</th><td>{html.escape(value.get('status') or 'missing')}</td><td>{html.escape(value.get('path') or '')}</td></tr>"
        for key, value in payload["sourceArtifacts"].items()
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove Start Here</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f5efdf; --ink:#2d271e; --muted:#746956; --card:rgba(255,252,242,.9); --leaf:#2e6f4d; --moss:#dfead8; --honey:#d19a31; --clay:#a34d3d; }}
    body {{ margin:0; color:var(--ink); font-family: ui-rounded, "Avenir Next", "Gill Sans", system-ui, sans-serif; background: radial-gradient(circle at 10% 8%, rgba(209,154,49,.22), transparent 30rem), radial-gradient(circle at 88% 18%, rgba(46,111,77,.17), transparent 28rem), var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:44px 24px; }}
    h1 {{ font-size:clamp(2.5rem,6vw,5.4rem); line-height:.92; margin:0; letter-spacing:-.06em; }}
    .deck {{ max-width:820px; color:var(--muted); font-size:1.1rem; line-height:1.65; }}
    .status {{ display:inline-flex; gap:.65rem; align-items:center; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(45,39,30,.13); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:var(--honey); box-shadow:0 0 0 5px rgba(209,154,49,.16); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-top:28px; }}
    .card,.stat {{ background:var(--card); border:1px solid rgba(45,39,30,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(45,39,30,.08); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.04em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(46,111,77,.12); color:var(--leaf); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    code {{ display:block; padding:11px; border-radius:13px; background:rgba(45,39,30,.08); overflow-wrap:anywhere; }}
    table {{ width:100%; border-collapse:collapse; background:var(--card); border-radius:20px; overflow:hidden; margin-top:18px; }}
    th,td {{ padding:11px 12px; border-bottom:1px solid rgba(45,39,30,.1); text-align:left; vertical-align:top; }}
    th {{ width:220px; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Photo Grove Start Here</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="grid">
    <div class="stat"><div class="pill">backup</div><strong>{counts['cardBackupMatched']}</strong><span>matched; {counts['cardBackupMissingDestination']} missing</span></div>
    <div class="stat"><div class="pill">sample</div><strong>{counts['readyFolderSamplerSampledFiles']}</strong><span>safe thumbnails</span></div>
    <div class="stat"><div class="pill">triage</div><strong>{counts['firstPassTriageGroups']}</strong><span>first-pass groups</span></div>
    <div class="stat"><div class="pill">theater</div><strong>{counts['cullTheaterRows']}</strong><span>{counts['cullTheaterDryRunCommands']} dry-run commands</span></div>
    <div class="stat"><div class="pill">worksheet</div><strong>{counts['readyCullWorksheetRows']}</strong><span>rows ready</span></div>
    <div class="stat"><div class="pill">draft</div><strong>{counts['readyCullDraftActionableDecisionRows']}</strong><span>actionable decisions</span></div>
  </section>
  <h2>Next safe actions</h2>
  <section class="grid">{actions}</section>
  <h2>Artifact map</h2>
  <table>{source_rows}</table>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Photo Grove Start Here",
        "",
        f"Status: {payload['status']} ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Next safe actions",
    ]
    for action in payload["nextActions"]:
        lines += [
            f"- {action['label']}",
            f"  - kind: {action['kind']}",
            f"  - why: {action['why']}",
            f"  - command: `{action.get('command') or 'none'}`",
        ]
    lines += ["", "## Safety", "- Does not mutate originals.", "- Does not write metadata.", "- Does not upload, publish, delete, schedule, or approve."]
    return "\n".join(lines) + "\n"


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    parts = {key: read_json(photo_root / filename) for key, filename in SOURCES.items()}
    control = parts["controlRoom"]
    backup = parts["cardBackupReceipt"]
    status, status_label, plain = status_from(control, backup)
    counts = {
        "cardBackupMatched": count(backup, "matched"),
        "cardBackupMissingDestination": count(backup, "missingDestination"),
        "cardBackupSizeMismatch": count(backup, "sizeMismatch"),
        "cardBackupActiveProcesses": count(backup, "activeBackupProcesses"),
        "readyFolderSamplerSampledFiles": count(parts["readyFolderSampler"], "sampledFiles"),
        "readyCullWorksheetRows": count(parts["readyCullWorksheet"], "worksheetRows"),
        "nextCullBatchRows": count(parts["nextCullBatch"], "batchRows"),
        "nextCullBatchDryRunRows": count(parts["nextCullBatch"], "dryRunCommandRows"),
        "cullTheaterRows": count(parts["cullTheater"], "theaterRows"),
        "cullTheaterGroupRows": count(parts["cullTheater"], "groupRows"),
        "cullTheaterDryRunCommands": count(parts["cullTheater"], "dryRunCommands"),
        "firstPassTriageGroups": count(parts["firstPassTriage"], "groups"),
        "firstPassTriageSamples": count(parts["firstPassTriage"], "samples"),
        "firstPassTriageDryRunDirections": count(parts["firstPassTriage"], "dryRunDirections"),
        "readyCullDraftRows": count(parts["readyCullDecisionDraft"], "draftRows"),
        "readyCullDraftActionableDecisionRows": count(parts["readyCullDecisionDraft"], "actionableDecisionRows"),
        "readyCullPreviewDecisionRows": count(parts["readyCullReceiptPreview"], "decisionRows"),
        "readyCullPreviewActionableDecisionRows": count(parts["readyCullReceiptPreview"], "actionableDecisionRows"),
        "readyCullPreviewInvalidRows": count(parts["readyCullReceiptPreview"], "invalidRows"),
        "readyCullPreviewMissingSourceRows": count(parts["readyCullReceiptPreview"], "missingSourceRows"),
        "sampleCullRehearsalRows": count(parts["sampleCullRehearsal"], "rehearsalRows"),
    }
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    out_dir = photo_root / "StartHere" / f"{stamp}-photo-grove-start-here"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "quipsly.photoGrove.startHere.v1",
        "status": status,
        "statusLabel": status_label,
        "plainEnglish": plain,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "photoRoot": str(photo_root),
        "counts": counts,
        "sourceArtifacts": source_summary(parts),
        "nextActions": build_actions(parts, counts),
        "truth": "Photo Grove Start Here only. It links local artifacts and explains safe next actions; it does not mutate originals, metadata, review ledgers, proof selections, exports, uploads, publication state, account state, or approvals.",
        "originalsMutated": False,
        "metadataChanged": False,
        "reviewLedgerChanged": False,
        "externalPublishing": False,
    }
    json_path = out_dir / "photo-grove-start-here.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE.md"
    payload.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(build_html(payload), encoding="utf-8")
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")
    write_json(
        photo_root / LATEST_POINTER,
        {
            "schema": "quipsly.photoGrove.startHerePointer.v1",
            "status": status,
            "jsonPath": str(json_path),
            "htmlPath": str(html_path),
            "markdownPath": str(markdown_path),
            "counts": counts,
            "originalsMutated": False,
            "metadataChanged": False,
            "reviewLedgerChanged": False,
            "externalPublishing": False,
        },
    )
    print(json.dumps({"status": status, "jsonPath": str(json_path), "htmlPath": str(html_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
