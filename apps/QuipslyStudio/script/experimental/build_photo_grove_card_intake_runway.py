#!/usr/bin/env python3
"""Build a calm Photo Grove card intake runway.

This is deliberately a coordination artifact, not an importer. It reads the
latest backup/readiness/review sidecars and writes a human/agent-safe runway
that explains what can happen now and what must wait.
"""

from __future__ import annotations

import html
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any


DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-card-intake-runway.json"
SOURCES = {
    "backup": "latest-photo-grove-card-backup-receipt.json",
    "readyFolders": "latest-photo-grove-ready-folder-packet.json",
    "sampler": "latest-photo-grove-ready-folder-sampler.json",
    "worksheet": "latest-photo-grove-ready-cull-worksheet.json",
    "controlRoom": "latest-photo-grove-control-room.json",
}


def load_pointer(photo_root: Path, filename: str) -> dict[str, Any]:
    pointer = photo_root / filename
    if not pointer.exists():
        return {}
    try:
        pointer_payload = json.loads(pointer.read_text())
        target = pointer_payload.get("latest")
        if not target:
            return pointer_payload
        target_path = Path(target)
        if not target_path.exists():
            return pointer_payload
        return json.loads(target_path.read_text())
    except Exception as exc:
        return {"loadError": str(exc), "pointerPath": str(pointer)}


def count(payload: dict[str, Any], key: str, default: int = 0) -> int:
    if not isinstance(payload, dict):
        return default
    counts = payload.get("counts")
    if isinstance(counts, dict) and key in counts:
        try:
            return int(counts.get(key) or 0)
        except (TypeError, ValueError):
            return default
    try:
        return int(payload.get(key) or 0)
    except (TypeError, ValueError):
        return default


def first_path(payload: dict[str, Any]) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("htmlPath", "markdownPath", "jsonPath"):
        value = payload.get(key)
        if value:
            return str(value)
    return ""


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\"'\"'") + "'"


def status_from(backup: dict[str, Any]) -> tuple[str, str, str]:
    if not backup:
        return (
            "photo-grove-card-intake-needs-backup-receipt",
            "needs receipt",
            "Run the backup receipt before making card-level decisions.",
        )
    missing = count(backup, "missingDestination")
    mismatch = count(backup, "sizeMismatch")
    active = count(backup, "activeBackupProcesses")
    complete = bool((backup.get("counts") or {}).get("backupComplete"))
    if active or missing or mismatch or not complete:
        return (
            "photo-grove-card-intake-copy-in-progress",
            "copy in progress",
            "Keep the card and external drive mounted. Review only complete ready folders for now.",
        )
    return (
        "photo-grove-card-intake-backed-up",
        "local backup complete",
        "The card copy receipt is clean. It is now safe to advance into broader culling and optional approved cloud duplication.",
    )


def build_html(payload: dict[str, Any]) -> str:
    actions = payload["nextActions"]
    sources = payload["sourceArtifacts"]
    counts = payload["counts"]
    action_rows = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(action['kind'])}</div>
          <h3>{html.escape(action['label'])}</h3>
          <p>{html.escape(action['why'])}</p>
          <code>{html.escape(action.get('command') or 'no command needed')}</code>
        </article>
        """
        for action in actions
    )
    source_rows = "\n".join(
        f"""
        <tr>
          <th>{html.escape(label)}</th>
          <td>{html.escape(data.get('status') or 'missing')}</td>
          <td>{html.escape(data.get('path') or 'not available')}</td>
        </tr>
        """
        for label, data in sources.items()
    )
    count_rows = "\n".join(
        f"<tr><th>{html.escape(str(key))}</th><td>{html.escape(str(value))}</td></tr>"
        for key, value in counts.items()
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove card intake runway</title>
  <style>
    :root {{
      color-scheme: light dark;
      --bg: #f7f1e4;
      --ink: #2f281e;
      --muted: #766b5a;
      --leaf: #2f6b4f;
      --honey: #d59b2f;
      --clay: #a7503d;
      --card: rgba(255, 252, 244, 0.88);
    }}
    body {{
      margin: 0;
      font-family: ui-rounded, "Avenir Next", "Gill Sans", system-ui, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(circle at 12% 10%, rgba(213,155,47,.2), transparent 30rem),
        radial-gradient(circle at 86% 20%, rgba(47,107,79,.18), transparent 28rem),
        var(--bg);
    }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 40px 24px; }}
    h1 {{ font-size: clamp(2.2rem, 5vw, 4.8rem); line-height: .95; margin: 0; letter-spacing: -0.05em; }}
    .deck {{ max-width: 760px; color: var(--muted); font-size: 1.08rem; line-height: 1.6; }}
    .status {{
      display: inline-flex; gap: .65rem; align-items: center; margin: 20px 0;
      padding: 10px 14px; border-radius: 999px; background: var(--card);
      border: 1px solid rgba(47,40,30,.14); font-weight: 800;
    }}
    .dot {{ width: 12px; height: 12px; border-radius: 50%; background: var(--honey); box-shadow: 0 0 0 5px rgba(213,155,47,.16); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 28px; }}
    .card {{ background: var(--card); border: 1px solid rgba(47,40,30,.12); border-radius: 22px; padding: 20px; box-shadow: 0 16px 40px rgba(47,40,30,.08); }}
    .pill {{ display: inline-flex; padding: 5px 9px; border-radius: 999px; background: rgba(47,107,79,.12); color: var(--leaf); font-size: .72rem; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }}
    h2 {{ margin-top: 44px; }}
    h3 {{ margin-bottom: 8px; }}
    p {{ color: var(--muted); }}
    code {{ display: block; white-space: pre-wrap; overflow-wrap: anywhere; background: rgba(47,40,30,.08); padding: 10px; border-radius: 12px; color: var(--ink); }}
    table {{ width: 100%; border-collapse: collapse; background: var(--card); border-radius: 18px; overflow: hidden; }}
    th, td {{ padding: 11px 12px; border-bottom: 1px solid rgba(47,40,30,.1); text-align: left; vertical-align: top; }}
    th {{ width: 230px; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Memory card intake runway</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>

  <section class="grid">
    <article class="card"><div class="pill">matched</div><h3>{counts['matched']}</h3><p>Files proven present in the external-drive backup.</p></article>
    <article class="card"><div class="pill">missing</div><h3>{counts['missingDestination']}</h3><p>Files still not present at the backup destination.</p></article>
    <article class="card"><div class="pill">ready folders</div><h3>{counts['readyFolderCount']}</h3><p>Complete folders safe for review surfaces.</p></article>
    <article class="card"><div class="pill">worksheet</div><h3>{counts['readyCullWorksheetRows']}</h3><p>Sampled rows ready for sidecar-only culling.</p></article>
  </section>

  <h2>Next safe actions</h2>
  <section class="grid">{action_rows}</section>

  <h2>Evidence counts</h2>
  <table>{count_rows}</table>

  <h2>Source artifacts</h2>
  <table>{source_rows}</table>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Photo Grove card intake runway",
        "",
        f"Status: {payload['status']} ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Counts",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: {value}")
    lines += ["", "## Next safe actions"]
    for action in payload["nextActions"]:
        lines += [
            f"- {action['label']}",
            f"  - kind: {action['kind']}",
            f"  - why: {action['why']}",
            f"  - command: `{action.get('command') or 'none'}`",
        ]
    lines += ["", "## Safety", "- Originals mutated: false", "- Metadata changed: false", "- External publishing/uploading: false"]
    return "\n".join(lines) + "\n"


def main() -> int:
    photo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PHOTO_ROOT
    parts = {key: load_pointer(photo_root, filename) for key, filename in SOURCES.items()}
    backup = parts["backup"]
    ready = parts["readyFolders"]
    worksheet = parts["worksheet"]
    status, label, plain = status_from(backup)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
    out_dir = photo_root / "CardIntakeRunways" / f"{stamp}-card-intake-runway"
    out_dir.mkdir(parents=True, exist_ok=True)

    counts = {
        "totalRows": count(backup, "totalRows"),
        "matched": count(backup, "matched"),
        "missingDestination": count(backup, "missingDestination"),
        "sizeMismatch": count(backup, "sizeMismatch"),
        "activeBackupProcesses": count(backup, "activeBackupProcesses"),
        "readyFolderCount": count(backup, "readyFolderCount"),
        "incompleteFolderCount": count(backup, "incompleteFolderCount"),
        "readyFolderPacketReadyFolders": count(ready, "readyFolders"),
        "readyFolderPacketReadyMediaRows": count(ready, "readyMediaRows"),
        "readyCullWorksheetRows": count(worksheet, "worksheetRows"),
        "readyCullUnreviewedRows": count(worksheet, "unreviewedRows"),
        "readyCullAppliedDecisions": count(worksheet, "appliedDecisions"),
    }

    actions = [
        {
            "kind": "protect originals",
            "label": "Keep card and external drive mounted",
            "why": "The active backup receipt still shows missing files or active copy processes.",
            "command": "Do not eject /Volumes/Bender or /Volumes/My Passport yet.",
        },
        {
            "kind": "review now",
            "label": "Open ready cull worksheet",
            "why": "Only complete folders are sampled here; decisions remain sidecar-only and un-applied.",
            "command": f"open {shell_quote(first_path(worksheet))}" if first_path(worksheet) else "",
        },
        {
            "kind": "refresh truth",
            "label": "Refresh backup receipt later",
            "why": "When rsync finishes, this should move missingDestination and activeBackupProcesses to zero before final intake.",
            "command": "./script/agentctl.sh photo-grove-card-backup-receipt",
        },
        {
            "kind": "wait for approval",
            "label": "Defer cloud duplication",
            "why": "Google Drive, Google Photos, and buckets should receive only a verified local set, and only after explicit approval.",
            "command": "",
        },
    ]
    if status == "photo-grove-card-intake-backed-up":
        actions[0] = {
            "kind": "advance",
            "label": "Run full ready-folder review chain",
            "why": "The local backup is complete, so ready-folder, sampler, worksheet, and control room can be regenerated across the full card.",
            "command": "./script/agentctl.sh photo-grove-ready-folder-packet && ./script/agentctl.sh photo-grove-ready-folder-sampler && ./script/agentctl.sh photo-grove-ready-cull-worksheet && ./script/agentctl.sh photo-grove-control-room",
        }

    source_artifacts = {
        key: {
            "status": str(value.get("status") or "missing") if isinstance(value, dict) else "missing",
            "path": first_path(value) if isinstance(value, dict) else "",
        }
        for key, value in parts.items()
    }

    payload = {
        "status": status,
        "statusLabel": label,
        "plainEnglish": plain,
        "createdAt": datetime.now().isoformat(timespec="seconds"),
        "photoRoot": str(photo_root),
        "sourceArtifacts": source_artifacts,
        "counts": counts,
        "nextActions": actions,
        "truth": "Card intake runway only. It reads local sidecars and writes a local coordination artifact; it does not copy media, mutate originals, write metadata, upload, publish, delete, or approve cull decisions.",
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
    }

    json_path = out_dir / "photo-grove-card-intake-runway.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-card-intake-runway.md"
    payload["jsonPath"] = str(json_path)
    payload["htmlPath"] = str(html_path)
    payload["markdownPath"] = str(markdown_path)
    json_path.write_text(json.dumps(payload, indent=2) + "\n")
    html_path.write_text(build_html(payload))
    markdown_path.write_text(build_markdown(payload))
    (photo_root / LATEST_POINTER).write_text(
        json.dumps(
            {
                "schema": "quipsly.photoGrove.cardIntakeRunwayPointer.v1",
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

    print(
        json.dumps(
            {
                "status": status,
                "jsonPath": str(json_path),
                "htmlPath": str(html_path),
                "markdownPath": str(markdown_path),
                "counts": counts,
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
