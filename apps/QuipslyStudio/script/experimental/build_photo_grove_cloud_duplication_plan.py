#!/usr/bin/env python3
"""Prepare a non-executing Photo Grove cloud duplication plan.

This answers "where could this card live next?" without uploading anything.
The plan is intentionally blocked until local backup evidence is complete and a
human approves a concrete destination.
"""

from __future__ import annotations

import html
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-cloud-duplication-plan.json"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text())
        target = payload.get("jsonPath")
        if target and Path(str(target)).exists() and Path(str(target)) != path:
            loaded = json.loads(Path(str(target)).read_text())
            return {**payload, **loaded}
        latest = payload.get("latest")
        if latest and Path(str(latest)).exists():
            return json.loads(Path(str(latest)).read_text())
        return payload
    except Exception as exc:
        return {"loadError": str(exc), "path": str(path)}


def count(payload: dict[str, Any], key: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    value = counts.get(key, payload.get(key))
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def env_present(*names: str) -> bool:
    return any(bool(os.environ.get(name)) for name in names)


def build_destinations(backup_complete: bool) -> list[dict[str, Any]]:
    gate = "ready after explicit approval" if backup_complete else "blocked until local backup completes"
    return [
        {
            "id": "google-drive",
            "label": "Google Drive archival folder",
            "purpose": "Human-browsable redundant copy and client/project handoff staging.",
            "authSignal": "unknown in this process",
            "status": gate,
            "execution": "manual/connector-driven later",
            "notes": "Use only after local receipt has zero missing files and zero size mismatches.",
        },
        {
            "id": "google-photos",
            "label": "Google Photos album",
            "purpose": "Fast visual browsing and sharing for JPEG/proxy picks, not RAW/source truth.",
            "authSignal": "unknown in this process",
            "status": gate,
            "execution": "manual/connector-driven later",
            "notes": "Prefer curated selects or proxies first; avoid dumping all RAW/video into Photos.",
        },
        {
            "id": "gcs-media-vault",
            "label": "Google Cloud Storage media vault",
            "purpose": "Durable Quipsly-owned source/proxy vault for app workflows.",
            "authSignal": "bucket env present" if env_present("QUIPSLY_MEDIA_BUCKET", "GOOGLE_CLOUD_STORAGE_BUCKET", "GCS_BUCKET") else "bucket env not detected",
            "status": gate,
            "execution": "scripted upload later",
            "notes": "Use object paths with card/session identity and checksum receipts before marking cloud-backed.",
        },
    ]


def build_html(payload: dict[str, Any]) -> str:
    rows = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(dest['id'])}</div>
          <h2>{html.escape(dest['label'])}</h2>
          <p>{html.escape(dest['purpose'])}</p>
          <dl>
            <dt>Status</dt><dd>{html.escape(dest['status'])}</dd>
            <dt>Auth</dt><dd>{html.escape(dest['authSignal'])}</dd>
            <dt>Execution</dt><dd>{html.escape(dest['execution'])}</dd>
          </dl>
          <p class="note">{html.escape(dest['notes'])}</p>
        </article>
        """
        for dest in payload["destinations"]
    )
    counts = payload["counts"]
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove cloud duplication plan</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#eef4ea; --ink:#233024; --muted:#6a735f; --card:rgba(255,255,248,.88); --leaf:#2e6d4d; --honey:#c8902f; }}
    body {{ margin:0; background: radial-gradient(circle at 20% 10%, rgba(200,144,47,.18), transparent 30rem), radial-gradient(circle at 90% 15%, rgba(46,109,77,.16), transparent 28rem), var(--bg); color:var(--ink); font-family: ui-rounded, "Avenir Next", system-ui, sans-serif; }}
    main {{ max-width:1120px; margin:auto; padding:42px 24px; }}
    h1 {{ font-size: clamp(2.4rem, 5vw, 4.8rem); line-height:.94; margin:0; letter-spacing:-.05em; }}
    .deck {{ max-width:780px; color:var(--muted); line-height:1.62; font-size:1.08rem; }}
    .status {{ display:inline-flex; gap:.6rem; align-items:center; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(35,48,36,.14); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:var(--honey); box-shadow:0 0 0 5px rgba(200,144,47,.16); }}
    .grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(260px,1fr)); gap:16px; margin-top:30px; }}
    .card {{ background:var(--card); border:1px solid rgba(35,48,36,.13); border-radius:24px; padding:22px; box-shadow:0 18px 44px rgba(35,48,36,.08); }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; color:var(--leaf); background:rgba(46,109,77,.12); text-transform:uppercase; font-weight:900; font-size:.72rem; letter-spacing:.08em; }}
    dt {{ font-weight:900; margin-top:10px; }}
    dd {{ margin-left:0; color:var(--muted); }}
    .note {{ color:var(--muted); }}
    code {{ display:block; padding:12px; border-radius:14px; background:rgba(35,48,36,.08); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Cloud duplication plan</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="grid">
    <article class="card"><div class="pill">local receipt</div><h2>{counts['matched']} / {counts['totalRows']}</h2><p>Files matched in the local backup receipt.</p></article>
    <article class="card"><div class="pill">missing</div><h2>{counts['missingDestination']}</h2><p>Files still missing from the local backup.</p></article>
    <article class="card"><div class="pill">mismatch</div><h2>{counts['sizeMismatch']}</h2><p>Size mismatches found in the backup receipt.</p></article>
  </section>
  <section class="grid">{rows}</section>
  <h2>Safety</h2>
  <code>No upload, delete, metadata write, cloud mutation, album creation, bucket object creation, or publication receipt is performed by this plan.</code>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Photo Grove cloud duplication plan",
        "",
        f"Status: {payload['status']} ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Destinations",
    ]
    for dest in payload["destinations"]:
        lines += [
            f"- {dest['label']} ({dest['id']})",
            f"  - status: {dest['status']}",
            f"  - auth: {dest['authSignal']}",
            f"  - purpose: {dest['purpose']}",
        ]
    lines += ["", "## Safety", "- No external upload or mutation was performed."]
    return "\n".join(lines) + "\n"


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    backup = load_json(photo_root / "latest-photo-grove-card-backup-receipt.json")
    total = count(backup, "totalRows")
    missing = count(backup, "missingDestination")
    mismatch = count(backup, "sizeMismatch")
    active = count(backup, "activeBackupProcesses")
    complete = bool((backup.get("counts") or {}).get("backupComplete")) and missing == 0 and mismatch == 0 and active == 0
    status = "photo-grove-cloud-duplication-ready-for-approval" if complete else "photo-grove-cloud-duplication-waiting-for-local-backup"
    label = "ready for approval" if complete else "waiting for local backup"
    plain = (
        "The local card backup appears complete. Choose one explicit cloud destination before any upload."
        if complete
        else "Cloud duplication is intentionally held until the local external-drive backup is complete and verified. This plan prepares the route without uploading partial evidence."
    )
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    out_dir = photo_root / "CloudDuplicationPlans" / f"{stamp}-cloud-duplication-plan"
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "totalRows": total,
        "matched": count(backup, "matched"),
        "missingDestination": missing,
        "sizeMismatch": mismatch,
        "activeBackupProcesses": active,
    }
    payload = {
        "schema": "quipsly.photoGrove.cloudDuplicationPlan.v1",
        "status": status,
        "statusLabel": label,
        "plainEnglish": plain,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "photoRoot": str(photo_root),
        "counts": counts,
        "destinations": build_destinations(complete),
        "truth": "Planning artifact only. No cloud upload, external mutation, publication receipt, metadata write, delete, or approval action is performed.",
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
    }
    json_path = out_dir / "photo-grove-cloud-duplication-plan.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-cloud-duplication-plan.md"
    payload.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    json_path.write_text(json.dumps(payload, indent=2) + "\n")
    html_path.write_text(build_html(payload))
    markdown_path.write_text(build_markdown(payload))
    (photo_root / LATEST_POINTER).write_text(
        json.dumps(
            {
                "schema": "quipsly.photoGrove.cloudDuplicationPlanPointer.v1",
                "status": status,
                "jsonPath": str(json_path),
                "htmlPath": str(html_path),
                "markdownPath": str(markdown_path),
                "counts": counts,
                "originalsMutated": False,
                "metadataChanged": False,
                "externalPublishing": False,
            },
            indent=2,
        )
        + "\n"
    )
    print(json.dumps({"status": status, "jsonPath": str(json_path), "htmlPath": str(html_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
