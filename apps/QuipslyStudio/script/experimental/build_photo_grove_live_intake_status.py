#!/usr/bin/env python3
"""Build a live Photo Grove intake status board.

This is an evidence surface for long-running card copies. It does not import,
upload, approve, cull, or mutate metadata. It reads the canonical full-card
backup receipt plus any fast CardIngests manifests and reports what is copied,
what is still in motion, and what must not be treated as cloud/publish truth.
"""

from __future__ import annotations

import html
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-live-intake-status.json"


def read_json(path: Path) -> dict[str, Any]:
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


def count(payload: dict[str, Any], key: str) -> int:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    value = counts.get(key, payload.get(key))
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def bytes_to_gib(value: int) -> float:
    return round(value / 1024 / 1024 / 1024, 2)


def first_path(payload: dict[str, Any]) -> str:
    for key in ("htmlPath", "markdownPath", "jsonPath"):
        value = payload.get(key)
        if value:
            return str(value)
    return ""


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def active_copy_processes() -> list[dict[str, str]]:
    try:
        output = subprocess.check_output(["ps", "-axo", "pid,ppid,etime,command"], text=True)
    except Exception as exc:
        return [{"pid": "", "elapsed": "", "command": f"process scan failed: {exc}"}]
    rows: list[dict[str, str]] = []
    for line in output.splitlines():
        lowered = line.lower()
        if "rsync " not in lowered and "rsync\t" not in lowered and not lowered.endswith("rsync"):
            continue
        if "/volumes/bender" not in lowered and "cardingests" not in lowered and "bender_card_backup" not in lowered:
            continue
        parts = line.strip().split(None, 3)
        if len(parts) < 4:
            continue
        rows.append({"pid": parts[0], "ppid": parts[1], "elapsed": parts[2], "command": parts[3]})
    return rows


def destination_stats(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"path": str(path), "exists": False, "files": 0, "bytes": 0, "gib": 0.0}
    files = 0
    total = 0
    by_extension: dict[str, int] = {}
    for child in path.iterdir():
        if not child.is_file() or child.name.startswith("._"):
            continue
        files += 1
        try:
            total += child.stat().st_size
        except OSError:
            pass
        ext = child.suffix.lower().lstrip(".") or "noext"
        by_extension[ext] = by_extension.get(ext, 0) + 1
    return {
        "path": str(path),
        "exists": True,
        "files": files,
        "bytes": total,
        "gib": bytes_to_gib(total),
        "byExtension": by_extension,
    }


def load_fast_intakes(photo_root: Path) -> list[dict[str, Any]]:
    intake_root = photo_root / "CardIngests"
    rows: list[dict[str, Any]] = []
    if not intake_root.exists():
        return rows
    for manifest_path in sorted(intake_root.glob("*/manifests/photo-grove-card-intake-manifest.json"), reverse=True):
        payload = read_json(manifest_path)
        intake_folder = Path(str(payload.get("intakeFolder") or manifest_path.parents[1]))
        dest = intake_folder / "raw" / "107CANON"
        stats = destination_stats(dest)
        planned = int(payload.get("photoOnlyFiles") or payload.get("totalFiles") or 0)
        copied = int(stats.get("files") or 0)
        percent = round((copied / planned) * 100, 1) if planned else 0.0
        rows.append(
            {
                "id": intake_folder.name,
                "status": payload.get("status") or "unknown",
                "sourceFolder": payload.get("sourceFolder") or "",
                "intakeFolder": str(intake_folder),
                "plannedFiles": planned,
                "plannedGiB": payload.get("photoOnlyGiB") or payload.get("totalGiB") or 0,
                "copiedFiles": copied,
                "copiedGiB": stats.get("gib") or 0,
                "percentFiles": percent,
                "selectionRule": payload.get("photoOnlySelectionRule") or payload.get("selectionRule") or "",
                "skippedForPhotoIntake": payload.get("skippedForPhotoIntake") or [],
                "manifestPath": str(manifest_path),
                "startHere": str(intake_folder / "START-HERE.md"),
            }
        )
    return rows


def status_from(backup: dict[str, Any], fast_intakes: list[dict[str, Any]], processes: list[dict[str, str]]) -> tuple[str, str, str]:
    missing = count(backup, "missingDestination")
    mismatch = count(backup, "sizeMismatch")
    active = len(processes)
    if active or missing or mismatch:
        return (
            "photo-grove-live-intake-copying",
            "Copying: keep drives mounted",
            "The local intake is still in motion. Treat this page as live evidence, not final backup truth. Cull only material that another surface explicitly marks as safe.",
        )
    if fast_intakes and all(int(row.get("copiedFiles") or 0) >= int(row.get("plannedFiles") or 0) for row in fast_intakes):
        return (
            "photo-grove-live-intake-local-ready",
            "Local intake ready to validate",
            "The live copy processes have stopped and fast intake counts look complete. Refresh backup receipts and source-integrity checks before cloud duplication or proof selection.",
        )
    return (
        "photo-grove-live-intake-needs-refresh",
        "Needs receipt refresh",
        "No active copy was detected, but the latest receipts do not yet prove a clean final state. Refresh the card intake runway before advancing.",
    )


def build_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    fast_rows = "\n".join(
        f"""
        <article class="card">
          <div class="pill">fast intake</div>
          <h3>{html.escape(row['id'])}</h3>
          <p>{html.escape(row['selectionRule'])}</p>
          <div class="meter"><span style="width:{min(float(row['percentFiles']), 100.0)}%"></span></div>
          <p><strong>{row['copiedFiles']}</strong> / {row['plannedFiles']} files copied ({row['copiedGiB']} / {row['plannedGiB']} GiB)</p>
          <code>{html.escape(row['intakeFolder'])}</code>
        </article>
        """
        for row in payload["fastIntakes"]
    ) or '<article class="card"><div class="pill">fast intake</div><h3>No fast intake manifests found</h3><p>Use the canonical full-card backup receipt only.</p></article>'
    proc_rows = "\n".join(
        f"<tr><td>{html.escape(p.get('pid',''))}</td><td>{html.escape(p.get('elapsed',''))}</td><td>{html.escape(p.get('command',''))}</td></tr>"
        for p in payload["activeCopyProcesses"]
    ) or "<tr><td colspan=\"3\">No active Bender/CardIngest rsync processes detected.</td></tr>"
    action_rows = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(action['kind'])}</div>
          <h3>{html.escape(action['label'])}</h3>
          <p>{html.escape(action['why'])}</p>
          <code>{html.escape(action.get('command') or 'No command needed')}</code>
        </article>
        """
        for action in payload["nextActions"]
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove live intake status</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f6efdf; --ink:#2f281f; --muted:#746a59; --leaf:#2e6f4d; --moss:#dbe9d4; --honey:#d49b31; --card:rgba(255,252,244,.9); }}
    body {{ margin:0; font-family:ui-rounded,"Avenir Next","Gill Sans",system-ui,sans-serif; color:var(--ink); background:radial-gradient(circle at 15% 10%,rgba(212,155,49,.22),transparent 32rem),radial-gradient(circle at 85% 18%,rgba(46,111,77,.18),transparent 28rem),var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:42px 24px; }}
    h1 {{ font-size:clamp(2.3rem,5vw,5rem); line-height:.94; margin:0; letter-spacing:-.06em; }}
    .deck {{ max-width:820px; color:var(--muted); font-size:1.08rem; line-height:1.62; }}
    .status {{ display:inline-flex; gap:.65rem; align-items:center; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(47,40,31,.13); font-weight:900; margin-bottom:18px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:var(--honey); box-shadow:0 0 0 5px rgba(212,155,49,.15); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:14px; margin-top:24px; }}
    .card,.stat {{ background:var(--card); border:1px solid rgba(47,40,31,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(47,40,31,.08); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.04em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(46,111,77,.12); color:var(--leaf); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    .meter {{ height:12px; border-radius:999px; background:rgba(47,40,31,.1); overflow:hidden; margin:14px 0; }}
    .meter span {{ display:block; height:100%; background:linear-gradient(90deg,var(--leaf),var(--honey)); }}
    code {{ display:block; padding:11px; border-radius:13px; background:rgba(47,40,31,.08); overflow-wrap:anywhere; }}
    table {{ width:100%; border-collapse:collapse; background:var(--card); border-radius:20px; overflow:hidden; margin-top:16px; }}
    th,td {{ padding:11px 12px; border-bottom:1px solid rgba(47,40,31,.1); text-align:left; vertical-align:top; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Photo Grove live intake status</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="grid">
    <article class="stat"><div class="pill">full backup</div><strong>{counts['fullBackupMatched']}</strong><span>matched, {counts['fullBackupMissing']} still missing</span></article>
    <article class="stat"><div class="pill">fast intake</div><strong>{counts['fastCopiedFiles']}</strong><span>copied of {counts['fastPlannedFiles']} planned photo files</span></article>
    <article class="stat"><div class="pill">active copy</div><strong>{counts['activeCopyProcesses']}</strong><span>rsync process rows detected</span></article>
    <article class="stat"><div class="pill">cloud</div><strong>0</strong><span>uploads attempted from this board</span></article>
  </section>
  <h2>Fast intake manifests</h2>
  <section class="grid">{fast_rows}</section>
  <h2>Next safe actions</h2>
  <section class="grid">{action_rows}</section>
  <h2>Active copy processes</h2>
  <table><tr><th>PID</th><th>Elapsed</th><th>Command</th></tr>{proc_rows}</table>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Photo Grove live intake status",
        "",
        f"Status: {payload['status']} ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Counts",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: {value}")
    lines += ["", "## Fast intakes"]
    for row in payload["fastIntakes"]:
        lines.append(f"- {row['id']}: {row['copiedFiles']}/{row['plannedFiles']} files copied; folder `{row['intakeFolder']}`")
    lines += ["", "## Next actions"]
    for action in payload["nextActions"]:
        lines.append(f"- {action['label']}: `{action.get('command') or 'none'}`")
    lines += [
        "",
        "## Safety",
        "- Originals mutated: false",
        "- Metadata changed: false",
        "- Google Drive/Photos/GCS upload attempted: false",
        "- Publishing/account/receipt mutation: false",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    backup = read_json(photo_root / "latest-photo-grove-card-backup-receipt.json")
    start_here = read_json(photo_root / "latest-photo-grove-start-here.json")
    card_runway = read_json(photo_root / "latest-photo-grove-card-intake-runway.json")
    fast_intakes = load_fast_intakes(photo_root)
    processes = active_copy_processes()
    status, status_label, plain = status_from(backup, fast_intakes, processes)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    out_dir = photo_root / "LiveIntakeStatus" / f"{stamp}-photo-grove-live-intake-status"
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {
        "fullBackupMatched": count(backup, "matched"),
        "fullBackupMissing": count(backup, "missingDestination"),
        "fullBackupSizeMismatch": count(backup, "sizeMismatch"),
        "fullBackupReadyFolders": count(backup, "readyFolderCount"),
        "fullBackupIncompleteFolders": count(backup, "incompleteFolderCount"),
        "activeCopyProcesses": len(processes),
        "fastIntakeCount": len(fast_intakes),
        "fastPlannedFiles": sum(int(row.get("plannedFiles") or 0) for row in fast_intakes),
        "fastCopiedFiles": sum(int(row.get("copiedFiles") or 0) for row in fast_intakes),
        "fastPlannedGiB": round(sum(float(row.get("plannedGiB") or 0) for row in fast_intakes), 2),
        "fastCopiedGiB": round(sum(float(row.get("copiedGiB") or 0) for row in fast_intakes), 2),
    }
    next_actions = [
        {
            "kind": "protect",
            "label": "Keep card and external drive mounted",
            "why": "Both the canonical full-card backup and the fast photo intake are still active or not fully validated.",
            "command": "Do not eject /Volumes/Bender or /Volumes/My Passport.",
        },
        {
            "kind": "watch",
            "label": "Open current Photo Grove Start Here",
            "why": "Use the human-first door for safe culling actions while the backup remains incomplete.",
            "command": f"open {shell_quote(first_path(start_here))}" if first_path(start_here) else "./script/agentctl.sh photo-grove-start-here",
        },
        {
            "kind": "refresh",
            "label": "Refresh full-card intake after rsync exits",
            "why": "This is the receipt-backed way to turn copying into validated local backup truth.",
            "command": "./script/agentctl.sh photo-grove-refresh-card-intake",
        },
        {
            "kind": "defer",
            "label": "Do not cloud-mirror yet",
            "why": "Cloud duplication should wait for a clean local backup receipt and explicit route approval.",
            "command": "",
        },
    ]
    payload = {
        "status": status,
        "statusLabel": status_label,
        "createdAt": datetime.now().isoformat(),
        "photoRoot": str(photo_root),
        "plainEnglish": plain,
        "counts": counts,
        "fastIntakes": fast_intakes,
        "activeCopyProcesses": processes,
        "sourceArtifacts": {
            "backupReceipt": {"status": backup.get("status") or "missing", "path": first_path(backup)},
            "startHere": {"status": start_here.get("status") or "missing", "path": first_path(start_here)},
            "cardIntakeRunway": {"status": card_runway.get("status") or "missing", "path": first_path(card_runway)},
        },
        "nextActions": next_actions,
        "truth": "Live intake status only. It reads receipts/manifests/process state and writes a local report; it does not mutate originals, metadata, cull decisions, proof selections, exports, uploads, publication state, account state, approvals, or receipts.",
        "safety": {
            "originalsMutated": False,
            "metadataChanged": False,
            "externalUploadAttempted": False,
            "publicationChanged": False,
            "receiptTruthCreated": False,
        },
    }
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-photo-grove-live-intake-status.md"
    json_path = out_dir / "photo-grove-live-intake-status.json"
    html_path.write_text(build_html(payload), encoding="utf-8")
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")
    write_json(json_path, {**payload, "htmlPath": str(html_path), "markdownPath": str(markdown_path), "jsonPath": str(json_path)})
    pointer = {
        "status": status,
        "createdAt": payload["createdAt"],
        "latest": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "jsonPath": str(json_path),
        "counts": counts,
        "truth": payload["truth"],
    }
    write_json(photo_root / LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
