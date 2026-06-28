#!/usr/bin/env python3
"""Mirror existing local short exports into the release root without overwrites."""

from __future__ import annotations

import argparse
import html
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_BOARD_NAME = "quipsly-shorts-local-export-board.json"
SCHEMA = "quipsly.shorts-export-mirror.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-shorts-export-mirror")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


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


def resolve_board_path(value: str) -> Path:
    path = Path(value).expanduser()
    if path.is_dir():
        return path / DEFAULT_BOARD_NAME
    return path


def choose_source(card: dict[str, Any]) -> Path:
    primary = Path(str(card.get("primaryExportPath") or ""))
    if primary.exists():
        return primary
    for raw in card.get("allExportedPaths") or []:
        path = Path(str(raw or ""))
        if path.exists():
            return path
    return primary


def mirror(board_path: Path, release_root: Path, dry_run: bool) -> dict[str, Any]:
    board = load_json(board_path)
    cards = board.get("cards") if isinstance(board.get("cards"), list) else []
    session_dir = release_root / "shorts-export-mirror" / stamp()
    rows: list[dict[str, Any]] = []
    copied = 0
    skipped_existing = 0
    missing_source = 0
    no_expected_path = 0
    bytes_copied = 0

    for card in cards:
        if not isinstance(card, dict):
            continue
        source = choose_source(card)
        expected = Path(str(card.get("expectedLocalExportPath") or ""))
        row = {
            "id": card.get("id") or "",
            "title": card.get("title") or "",
            "episodeKey": card.get("episodeKey") or "",
            "sourcePath": str(source),
            "expectedLocalExportPath": str(expected),
            "durationSeconds": card.get("durationSeconds") or 0,
            "status": "",
            "bytes": 0,
        }
        if not str(expected):
            row["status"] = "missing-expected-path"
            no_expected_path += 1
        elif expected.exists():
            row["status"] = "skipped-existing"
            row["bytes"] = expected.stat().st_size
            skipped_existing += 1
        elif not source.exists():
            row["status"] = "missing-source-export"
            missing_source += 1
        else:
            row["bytes"] = source.stat().st_size
            if dry_run:
                row["status"] = "would-copy"
            else:
                expected.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, expected)
                row["status"] = "copied"
                copied += 1
                bytes_copied += expected.stat().st_size
        rows.append(row)

    status = "dry-run-ready" if dry_run else "mirror-complete"
    if missing_source or no_expected_path:
        status = "dry-run-ready-with-warnings" if dry_run else "mirror-complete-with-warnings"

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(release_root),
        "boardPath": str(board_path),
        "sessionDir": str(session_dir),
        "truth": "Shorts export mirror only. It copies existing rendered short files to expected release-root paths without overwriting. It does not render, approve, publish, upload, schedule, capture receipts, delete, or mutate original/source media.",
        "dryRun": dry_run,
        "counts": {
            "cards": len(cards),
            "copied": copied,
            "wouldCopy": sum(1 for row in rows if row["status"] == "would-copy"),
            "skippedExisting": skipped_existing,
            "missingSource": missing_source,
            "missingExpectedPath": no_expected_path,
            "bytesCopied": bytes_copied,
            "originalsMutated": False,
            "externalPublishing": False,
            "versionsOverwritten": False,
        },
        "rows": rows,
        "nextSafestAction": "Regenerate the shorts local export board and confirm expected local export paths are detected before human review or publishing packet work.",
        "safety": {
            "originalsMutated": False,
            "sourceDeletes": False,
            "versionOverwrites": False,
            "externalPublishing": False,
            "rendering": False,
            "receiptTruthCreated": False,
        },
    }


def write_review_files(packet: dict[str, Any]) -> tuple[Path, Path, Path]:
    session_dir = Path(str(packet.get("sessionDir") or ""))
    json_path = session_dir / "shorts-export-mirror.json"
    md_path = session_dir / "START-HERE-shorts-export-mirror.md"
    html_path = session_dir / "index.html"
    write_json(json_path, packet)
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    md_path.write_text(
        "\n".join([
            "# Shorts export mirror",
            "",
            f"- Status: `{packet.get('status')}`",
            f"- Copied: `{counts.get('copied', 0)}`",
            f"- Skipped existing: `{counts.get('skippedExisting', 0)}`",
            f"- Missing source: `{counts.get('missingSource', 0)}`",
            f"- Dry run: `{packet.get('dryRun')}`",
            "",
            "## Truth",
            "",
            str(packet.get("truth") or ""),
            "",
            "## Next safest action",
            "",
            str(packet.get("nextSafestAction") or ""),
            "",
        ]),
        encoding="utf-8",
    )
    rows = packet.get("rows") if isinstance(packet.get("rows"), list) else []
    row_html = "\n".join(
        f"<tr><td>{esc(row.get('status'))}</td><td>{esc(row.get('episodeKey'))}</td><td>{esc(row.get('title'))}</td><td><code>{esc(row.get('expectedLocalExportPath'))}</code></td></tr>"
        for row in rows
    )
    html_path.write_text(
        f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Shorts export mirror</title>
<style>
body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #111713; color: #f6ecd8; }}
main {{ max-width: 1200px; margin: 0 auto; padding: 32px; }}
.card {{ border: 1px solid rgba(246,236,216,.18); border-radius: 20px; background: rgba(255,255,255,.06); padding: 22px; }}
table {{ width: 100%; border-collapse: collapse; }}
td, th {{ border-bottom: 1px solid rgba(246,236,216,.12); padding: 10px; text-align: left; vertical-align: top; }}
code {{ color: #f9d96c; overflow-wrap: anywhere; }}
</style>
</head>
<body><main>
<h1>Shorts export mirror</h1>
<div class="card">
<p>{esc(packet.get('truth'))}</p>
<p>Copied: <strong>{esc(counts.get('copied'))}</strong> · Skipped existing: <strong>{esc(counts.get('skippedExisting'))}</strong> · Missing source: <strong>{esc(counts.get('missingSource'))}</strong></p>
</div>
<h2>Rows</h2>
<table><thead><tr><th>Status</th><th>Episode</th><th>Title</th><th>Release-root path</th></tr></thead><tbody>{row_html}</tbody></table>
</main></body></html>
""",
        encoding="utf-8",
    )
    return json_path, md_path, html_path


def write_latest_pointer(release_root: Path, packet: dict[str, Any], json_path: Path, md_path: Path, html_path: Path) -> None:
    write_json(release_root / "latest-shorts-export-mirror.json", {
        "schema": "quipsly.latest-shorts-export-mirror.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "",
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts") or {},
        "humanAsk": "Use this mirror only to find copied local short exports at the release root. Review each short before any external publishing action.",
        "agentSafeParallelWork": "Codex may improve local mirror notes, missing-source diagnostics, and review packet links. Do not publish, upload, schedule, approve, delete originals, overwrite versions, or create receipt truth.",
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": {
            "label": "Open shorts export mirror",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local shorts mirror evidence only. No external publishing, upload, schedule, approval, overwrite, delete, source mutation, or receipt capture occurs.",
        },
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    })


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("board", nargs="?", default=str(DEFAULT_RELEASE_ROOT / DEFAULT_BOARD_NAME), help="Shorts board JSON or release root containing it")
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    release_root = Path(args.release_root)
    board_path = resolve_board_path(args.board)
    packet = mirror(board_path, release_root, args.dry_run)
    json_path, md_path, html_path = write_review_files(packet)
    write_latest_pointer(release_root, packet, json_path, md_path, html_path)
    print(json.dumps({
        "status": packet.get("status"),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "counts": packet.get("counts"),
        "nextSafestAction": packet.get("nextSafestAction"),
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
