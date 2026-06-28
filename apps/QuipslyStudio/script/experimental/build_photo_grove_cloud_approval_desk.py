#!/usr/bin/env python3
"""Build a non-executing Photo Grove cloud approval desk.

This is the handoff surface between verified local backup and any cloud copy.
It makes Drive, Photos, and GCS options explicit, but never uploads, creates
albums, writes bucket objects, mutates accounts, or claims cloud receipt truth.
"""

from __future__ import annotations

import html
import json
import os
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-cloud-approval-desk.json"
SCHEMA = "quipsly.photoGrove.cloudApprovalDesk.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-cloud-approval-desk")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath") or payload.get("latest")
        if target:
            target_path = Path(str(target))
            if target_path.exists() and target_path != path:
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload}
        return payload
    except Exception as exc:
        return {"status": "load-error", "path": str(path), "error": str(exc)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def count(payload: dict[str, Any], key: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    value = counts.get(key, payload.get(key))
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def env_signal(*names: str) -> str:
    present = [name for name in names if os.environ.get(name)]
    return "present: " + ", ".join(present) if present else "not detected in this process"


def backup_complete(backup: dict[str, Any]) -> bool:
    counts = backup.get("counts") if isinstance(backup.get("counts"), dict) else {}
    return bool(counts.get("backupComplete")) and count(backup, "missingDestination") == 0 and count(backup, "sizeMismatch") == 0 and count(backup, "activeBackupProcesses") == 0


def destination_cards(photo_root: Path, complete: bool, cloud_plan: dict[str, Any]) -> list[dict[str, Any]]:
    gate = "needs-human-approval" if complete else "blocked-local-backup-in-progress"
    local_backup = "/Volumes/My Passport/Bender_Card_Backup"
    cloud_plan_path = str(cloud_plan.get("htmlPath") or cloud_plan.get("markdownPath") or cloud_plan.get("jsonPath") or "")
    return [
        {
            "id": "google-drive-archive",
            "label": "Google Drive archive",
            "bestFor": "A human-browsable redundant archive and collaboration handoff folder.",
            "notFor": "Canonical app media truth, fast RAW processing, or replacing the local verified backup.",
            "authSignal": "requires Google Drive connector/browser approval",
            "approvalStatus": gate,
            "recommendedScope": "All verified local backup files only after missing=0 and mismatches=0.",
            "receiptSlots": ["approver", "driveFolderUrl", "uploadedFileCount", "manifestPath", "completedAt"],
            "safePrepCommand": f"open {shell_quote(cloud_plan_path)}" if cloud_plan_path else "./script/agentctl.sh photo-grove-cloud-duplication-plan",
            "executionSketch": "NOT RUN: create a Drive folder named Bender Card Backup YYYY-MM-DD, upload verified backup contents, then capture folder URL and file count receipt.",
            "riskNote": "Drive is useful for human access, but it can hide partial uploads unless receipt counts are captured.",
        },
        {
            "id": "google-photos-selects",
            "label": "Google Photos selects album",
            "bestFor": "Fast visual browsing, casual sharing, and review of curated JPEG/proxy selects.",
            "notFor": "RAW source truth, full card backup, or video/RAW archival completeness.",
            "authSignal": "requires Google Photos/browser approval",
            "approvalStatus": gate,
            "recommendedScope": "Curated JPEG/proxy selects after cull intent exists, not the whole RAW card.",
            "receiptSlots": ["approver", "albumUrl", "selectCount", "selectionManifestPath", "completedAt"],
            "safePrepCommand": f"open {shell_quote(str(photo_root / 'latest-photo-grove-next-cull-batch.json'))}",
            "executionSketch": "NOT RUN: export/copy approved JPEG selects into a versioned selects packet, upload that packet to a Photos album, then capture album URL.",
            "riskNote": "Photos is excellent for browsing but dangerous as source truth because RAW/original semantics are fuzzy.",
        },
        {
            "id": "gcs-media-vault",
            "label": "GCS media vault",
            "bestFor": "Quipsly-owned durable source/proxy storage with app-readable manifests and checksums.",
            "notFor": "A casual human browsing experience or any upload before bucket/path approval.",
            "authSignal": env_signal("QUIPSLY_MEDIA_BUCKET", "GOOGLE_CLOUD_STORAGE_BUCKET", "GCS_BUCKET"),
            "approvalStatus": gate,
            "recommendedScope": "Verified backup files with object paths rooted by card/session identity.",
            "receiptSlots": ["approver", "bucket", "prefix", "objectCount", "bytesUploaded", "manifestPath", "completedAt"],
            "safePrepCommand": "gcloud auth list && gcloud config list project",
            "executionSketch": f"NOT RUN: gcloud storage cp --recursive {shell_quote(local_backup)} gs://<approved-bucket>/media-vault/photo-grove/bender-card/<session-id>/",
            "riskNote": "Best app architecture path, but bucket/prefix mistakes are expensive; require an explicit approved destination first.",
        },
    ]


def build_payload(photo_root: Path) -> dict[str, Any]:
    backup = load_json(photo_root / "latest-photo-grove-card-backup-receipt.json")
    cloud_plan = load_json(photo_root / "latest-photo-grove-cloud-duplication-plan.json")
    complete = backup_complete(backup)
    counts = {
        "totalRows": count(backup, "totalRows"),
        "matched": count(backup, "matched"),
        "missingDestination": count(backup, "missingDestination"),
        "sizeMismatch": count(backup, "sizeMismatch"),
        "activeBackupProcesses": count(backup, "activeBackupProcesses"),
        "readyFolderCount": count(backup, "readyFolderCount"),
        "incompleteFolderCount": count(backup, "incompleteFolderCount"),
    }
    status = "photo-grove-cloud-approval-awaiting-human-choice" if complete else "photo-grove-cloud-approval-blocked-local-backup"
    plain = (
        "The local card backup is verified. Choose exactly one cloud duplication route, capture approval, then run the corresponding upload workflow with receipts."
        if complete
        else "Cloud duplication is not ready yet because the local backup is still incomplete. This desk prepares the approval choice and receipt requirements without uploading anything."
    )
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "statusLabel": "ready for explicit cloud choice" if complete else "waiting for local backup",
        "plainEnglish": plain,
        "photoRoot": str(photo_root),
        "sourceBackupReceiptJson": str(backup.get("jsonPath") or ""),
        "sourceCloudPlanJson": str(cloud_plan.get("jsonPath") or ""),
        "sourceCloudPlanHtml": str(cloud_plan.get("htmlPath") or ""),
        "backupComplete": complete,
        "counts": counts,
        "approvalBoundary": {
            "externalUploadAllowed": False,
            "humanApprovalCaptured": False,
            "accountMutationAllowed": False,
            "receiptTruthCreated": False,
            "cloudDestinationChosen": False,
        },
        "destinations": destination_cards(photo_root, complete, cloud_plan),
        "nextSafestAction": "Wait for local backup completion, then choose one destination explicitly. If backup is already complete, open this desk with Charlie/Mako and capture an approval receipt before upload.",
        "humanAsk": "Which cloud route should Photo Grove use first: Drive archive, Photos selects, or GCS media vault? Do not upload until the choice is explicit and receipt slots are ready.",
        "truth": "Cloud approval desk only. It does not upload, create folders/albums/bucket objects, mutate accounts, mutate originals, write metadata, publish, schedule, approve, or create external receipt truth.",
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
        "externalUpload": False,
    }


def render_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(dest['id'])}</div>
          <h2>{html.escape(dest['label'])}</h2>
          <p>{html.escape(dest['bestFor'])}</p>
          <dl>
            <dt>Status</dt><dd>{html.escape(dest['approvalStatus'])}</dd>
            <dt>Auth</dt><dd>{html.escape(dest['authSignal'])}</dd>
            <dt>Recommended scope</dt><dd>{html.escape(dest['recommendedScope'])}</dd>
            <dt>Not for</dt><dd>{html.escape(dest['notFor'])}</dd>
          </dl>
          <h3>Receipt slots</h3>
          <ul>{''.join(f'<li>{html.escape(str(slot))}</li>' for slot in dest['receiptSlots'])}</ul>
          <p class="risk">{html.escape(dest['riskNote'])}</p>
          <p><strong>Safe prep:</strong></p><code>{html.escape(dest['safePrepCommand'])}</code>
          <p><strong>Execution sketch:</strong></p><code>{html.escape(dest['executionSketch'])}</code>
        </article>
        """
        for dest in payload["destinations"]
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove cloud approval desk</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f2efe4; --ink:#2d2a21; --muted:#706957; --card:rgba(255,252,242,.92); --leaf:#2e6f4d; --sky:#477d91; --honey:#c99431; --clay:#a34d3d; }}
    body {{ margin:0; color:var(--ink); font-family:ui-rounded, "Avenir Next", system-ui, sans-serif; background:radial-gradient(circle at 12% 8%, rgba(71,125,145,.18), transparent 30rem), radial-gradient(circle at 85% 10%, rgba(201,148,49,.2), transparent 28rem), var(--bg); }}
    main {{ max-width:1220px; margin:auto; padding:44px 24px 72px; }}
    h1 {{ margin:0; font-size:clamp(2.7rem,6vw,5.4rem); line-height:.92; letter-spacing:-.06em; }}
    .deck {{ max-width:850px; color:var(--muted); font-size:1.1rem; line-height:1.65; }}
    .status {{ display:inline-flex; align-items:center; gap:.65rem; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(45,42,33,.13); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:{'var(--leaf)' if payload['backupComplete'] else 'var(--honey)'}; box-shadow:0 0 0 5px rgba(201,148,49,.16); }}
    .stats,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-top:26px; }}
    .stat,.card,.boundary {{ background:var(--card); border:1px solid rgba(45,42,33,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(45,42,33,.08); }}
    .stat strong {{ display:block; font-size:2.25rem; letter-spacing:-.05em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(46,111,77,.12); color:var(--leaf); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    dt {{ font-weight:900; margin-top:10px; }} dd {{ margin-left:0; color:var(--muted); }}
    .risk {{ color:var(--clay); font-weight:800; }}
    code {{ display:block; padding:12px; border-radius:14px; background:rgba(45,42,33,.08); overflow-wrap:anywhere; }}
    li {{ margin:.25rem 0; color:var(--muted); }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Photo Grove cloud approval desk</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="stats">
    <div class="stat"><div class="pill">matched</div><strong>{counts['matched']}</strong><span>verified local files</span></div>
    <div class="stat"><div class="pill">missing</div><strong>{counts['missingDestination']}</strong><span>must reach zero before cloud</span></div>
    <div class="stat"><div class="pill">mismatch</div><strong>{counts['sizeMismatch']}</strong><span>must remain zero</span></div>
    <div class="stat"><div class="pill">processes</div><strong>{counts['activeBackupProcesses']}</strong><span>active backup process(es)</span></div>
  </section>
  <section class="boundary">
    <h2>Approval boundary</h2>
    <p>{html.escape(payload['truth'])}</p>
  </section>
  <section class="grid">{cards}</section>
</main>
</body>
</html>
"""


def render_markdown(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    lines = [
        "# Photo Grove cloud approval desk",
        "",
        f"Status: `{payload['status']}` ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Backup gate",
        f"- Matched: `{counts['matched']}` / `{counts['totalRows']}`",
        f"- Missing destination: `{counts['missingDestination']}`",
        f"- Size mismatch: `{counts['sizeMismatch']}`",
        f"- Active backup processes: `{counts['activeBackupProcesses']}`",
        "",
        "## Destinations",
    ]
    for dest in payload["destinations"]:
        lines += [
            f"### {dest['label']}",
            f"- Status: `{dest['approvalStatus']}`",
            f"- Best for: {dest['bestFor']}",
            f"- Not for: {dest['notFor']}",
            f"- Auth signal: `{dest['authSignal']}`",
            f"- Recommended scope: {dest['recommendedScope']}",
            f"- Safe prep command: `{dest['safePrepCommand']}`",
            f"- Execution sketch: `{dest['executionSketch']}`",
            f"- Receipt slots: {', '.join(dest['receiptSlots'])}",
            f"- Risk: {dest['riskNote']}",
            "",
        ]
    lines += [
        "## Boundary",
        "- No upload was performed.",
        "- No account was mutated.",
        "- No originals or metadata were changed.",
        "- No receipt truth was created.",
    ]
    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    payload = build_payload(photo_root)
    out_dir = photo_root / "CloudApprovalDesks" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "photo-grove-cloud-approval-desk.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-cloud-approval-desk.md"
    payload.update({"sessionDir": str(out_dir), "jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    pointer = {
        "schema": "quipsly.photoGrove.cloudApprovalDeskPointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "statusLabel": payload["statusLabel"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload["counts"],
        "backupComplete": payload["backupComplete"],
        "approvalBoundary": payload["approvalBoundary"],
        "externalUpload": False,
        "externalPublishing": False,
        "originalsMutated": False,
        "metadataChanged": False,
    }
    write_json(photo_root / LATEST_POINTER, pointer)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "counts": payload["counts"],
        "backupComplete": payload["backupComplete"],
        "externalUpload": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
