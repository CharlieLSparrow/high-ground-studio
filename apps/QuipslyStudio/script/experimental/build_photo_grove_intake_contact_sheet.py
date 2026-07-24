#!/usr/bin/env python3
"""Build a read-only Photo Grove intake contact sheet from an intake manifest.

This is the first visual review surface after card ingest. It reads the manifest
created by build_photo_grove_intake_manifest.py, creates small thumbnail copies in
a Quipsly-managed review folder, and writes HTML/JSON/CSV/Markdown review
artifacts. It never moves, edits, deletes, rates, uploads, publishes, or mutates
original photos.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
DEFAULT_OUTPUT_ROOT = DEFAULT_PHOTO_ROOT / "IntakeContactSheets"
LATEST_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-intake-contact-sheet.json"
SCHEMA = "quipsly.photo-grove.intake-contact-sheet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-photo-intake-contact-sheet")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path: str | Path) -> str:
    try:
        return Path(path).resolve().as_uri()
    except Exception:
        return ""


def size_label(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024 * 1024:
        return f"{size_bytes / (1024 * 1024 * 1024):.2f} GiB"
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MiB"
    if size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KiB"
    return f"{size_bytes} B"


def read_manifest(path: Path) -> Iterable[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            try:
                payload = json.loads(stripped)
            except json.JSONDecodeError as error:
                yield {
                    "id": f"manifest-line-{line_number}",
                    "kind": "manifest-error",
                    "warnings": [f"json-error:{error}"],
                    "relativePath": f"line {line_number}",
                }
                continue
            if isinstance(payload, dict):
                yield payload


def select_entries(entries: Iterable[dict[str, Any]], kinds: set[str], folder_contains: str, max_items: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    selected: list[dict[str, Any]] = []
    counts = {
        "seen": 0,
        "selected": 0,
        "skippedKind": 0,
        "skippedFolder": 0,
        "manifestErrors": 0,
    }
    needle = folder_contains.lower().strip()
    for entry in entries:
        counts["seen"] += 1
        if entry.get("kind") == "manifest-error":
            counts["manifestErrors"] += 1
            continue
        kind = str(entry.get("kind") or "image")
        if kinds and kind not in kinds:
            counts["skippedKind"] += 1
            continue
        relative = str(entry.get("relativePath") or "")
        folder = str(entry.get("folder") or "")
        if needle and needle not in relative.lower() and needle not in folder.lower():
            counts["skippedFolder"] += 1
            continue
        selected.append(entry)
        counts["selected"] += 1
        if len(selected) >= max_items:
            break
    return selected, counts


def make_thumbnail(source_path: Path, thumbnail_path: Path, max_size: int, sips_path: str | None) -> tuple[bool, str | None]:
    if not source_path.exists():
        return False, "source-missing"
    if not sips_path:
        return False, "sips-missing"
    thumbnail_path.parent.mkdir(parents=True, exist_ok=True)
    command = [sips_path, "-s", "format", "jpeg", "-Z", str(max_size), str(source_path), "--out", str(thumbnail_path)]
    try:
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=20)
    except subprocess.TimeoutExpired:
        return False, "thumbnail-timeout"
    except OSError as error:
        return False, f"thumbnail-error:{error}"
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "sips failed").strip().splitlines()[-1:]
        return False, f"thumbnail-failed:{detail[0] if detail else 'unknown'}"
    return True, None


def build_rows(entries: list[dict[str, Any]], out_dir: Path, max_thumb: int) -> tuple[list[dict[str, Any]], dict[str, int]]:
    sips_path = shutil.which("sips")
    rows: list[dict[str, Any]] = []
    counts = {
        "thumbnailReady": 0,
        "thumbnailFailed": 0,
        "sourceMissing": 0,
    }
    thumbnails_dir = out_dir / "thumbnails"
    for index, entry in enumerate(entries, start=1):
        source_path = Path(str(entry.get("path") or ""))
        entry_id = str(entry.get("id") or f"photo-{index:04d}")
        thumb_path = thumbnails_dir / f"{index:04d}-{entry_id}.jpg"
        thumb_ready, warning = make_thumbnail(source_path, thumb_path, max_thumb, sips_path)
        warnings = [str(item) for item in entry.get("warnings") or []]
        if warning:
            warnings.append(warning)
        if thumb_ready:
            counts["thumbnailReady"] += 1
        else:
            counts["thumbnailFailed"] += 1
            if warning == "source-missing":
                counts["sourceMissing"] += 1
        rows.append({
            "rank": index,
            "id": entry_id,
            "fileName": str(entry.get("fileName") or source_path.name),
            "relativePath": str(entry.get("relativePath") or ""),
            "folder": str(entry.get("folder") or ""),
            "kind": str(entry.get("kind") or "image"),
            "extension": str(entry.get("extension") or source_path.suffix.lower()),
            "sizeBytes": int(entry.get("sizeBytes") or 0),
            "sizeLabel": size_label(int(entry.get("sizeBytes") or 0)),
            "modifiedAt": str(entry.get("modifiedAt") or ""),
            "signature": str(entry.get("signature") or ""),
            "companionKey": str(entry.get("companionKey") or ""),
            "sourcePath": str(source_path),
            "sourceUri": file_uri(source_path),
            "thumbnailPath": str(thumb_path) if thumb_ready else "",
            "thumbnailUri": file_uri(thumb_path) if thumb_ready else "",
            "thumbnailReady": thumb_ready,
            "warnings": warnings,
            "revealSourceCommand": f"open -R {shell_quote(str(source_path))}" if str(source_path) else "",
        })
    return rows, counts


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = ["rank", "id", "fileName", "relativePath", "folder", "kind", "extension", "sizeLabel", "modifiedAt", "thumbnailReady", "warnings", "revealSourceCommand"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: ";".join(row[field]) if field == "warnings" else row.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    lines = [
        "# Photo Grove intake contact sheet",
        "",
        f"Generated: `{payload['generatedAt']}`",
        f"Manifest: `{payload['manifestJsonl']}`",
        f"HTML: `{payload['htmlPath']}`",
        "",
        "## Truth",
        "",
        "- Originals were not moved, deleted, edited, rated, uploaded, published, or overwritten.",
        "- Thumbnails are review copies in a Quipsly-managed output folder.",
        "- This packet is for visual orientation, not final culling judgment.",
        "",
        "## Counts",
        "",
        f"- Manifest rows seen before selection ended: {counts['selection']['seen']}",
        f"- Contact sheet rows: {counts['contactSheetRows']}",
        f"- Thumbnails ready: {counts['thumbnailReady']}",
        f"- Thumbnail failures: {counts['thumbnailFailed']}",
        f"- Source missing: {counts['sourceMissing']}",
        "",
        "## Next safe steps",
        "",
        "1. Open the HTML contact sheet.",
        "2. Confirm the card/session looks like the right shoot.",
        "3. Build sidecar-only ratings next: keep, reject, maybe, client-pick, duplicate-review.",
        "4. Add quality suggestions as suggestions only; never auto-delete or auto-reject originals.",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def card_html(row: dict[str, Any]) -> str:
    warnings = "".join(f"<span>{esc(warning)}</span>" for warning in row.get("warnings") or [])
    image = f"<img src='{esc(row['thumbnailUri'])}' alt='{esc(row['fileName'])}'>" if row.get("thumbnailUri") else "<div class='missing'>No thumbnail</div>"
    return f"""
    <article class="photo-card {esc(row.get('kind'))}">
      {image}
      <div class="card-body">
        <div class="rank">#{esc(row.get('rank'))}</div>
        <h2>{esc(row.get('fileName'))}</h2>
        <p>{esc(row.get('relativePath'))}</p>
        <dl>
          <div><dt>Kind</dt><dd>{esc(row.get('kind'))}</dd></div>
          <div><dt>Size</dt><dd>{esc(row.get('sizeLabel'))}</dd></div>
          <div><dt>Modified</dt><dd>{esc(row.get('modifiedAt'))}</dd></div>
        </dl>
        <div class="warnings">{warnings}</div>
        <code>{esc(row.get('revealSourceCommand'))}</code>
      </div>
    </article>
    """


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards = "".join(card_html(row) for row in payload.get("rows") or [])
    counts = payload["counts"]
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Photo Grove intake contact sheet</title>
<style>
:root {{ color-scheme: dark; --bg:#111812; --panel:#1d2a20; --card:#263626; --ink:#f8f0d5; --muted:#b8ad8d; --line:#46583f; --leaf:#8fd278; --moss:#4f7f54; --honey:#edc95c; --clay:#d88967; --water:#80d7dc; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:radial-gradient(circle at 8% -6%, rgba(143,210,120,.22), transparent 32rem), linear-gradient(135deg,#101711,#18150f 65%,#201a10); color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }}
main {{ max-width:1600px; margin:0 auto; padding:34px 24px 80px; }}
.hero {{ border:1px solid var(--line); border-radius:32px; padding:30px; background:rgba(29,42,32,.88); box-shadow:0 28px 100px rgba(0,0,0,.34); }}
.kicker {{ margin:0 0 10px; color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-weight:900; font-size:.75rem; }}
h1 {{ margin:0; font-size:clamp(2.2rem,5vw,5.4rem); line-height:.9; letter-spacing:-.07em; }}
.hero p {{ color:var(--muted); max-width:850px; line-height:1.65; }}
.counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:20px; }}
.count {{ border:1px solid var(--line); background:#121a14; border-radius:18px; padding:14px; }}
.count b {{ display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; font-size:.7rem; }}
.count span {{ color:var(--leaf); font-size:1.55rem; font-weight:950; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:16px; margin-top:24px; }}
.photo-card {{ border:1px solid var(--line); border-radius:22px; overflow:hidden; background:rgba(38,54,38,.95); box-shadow:0 14px 38px rgba(0,0,0,.24); }}
.photo-card img,.missing {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:flex; align-items:center; justify-content:center; background:#0c110d; color:var(--muted); }}
.card-body {{ padding:14px; }}
.rank {{ display:inline-block; color:#111812; background:var(--honey); border-radius:999px; padding:4px 8px; font-size:.72rem; font-weight:950; }}
h2 {{ margin:10px 0 6px; font-size:1rem; overflow-wrap:anywhere; }}
p {{ overflow-wrap:anywhere; }}
dl {{ display:grid; gap:6px; margin:12px 0; }}
dl div {{ display:flex; justify-content:space-between; gap:10px; border-top:1px solid rgba(255,255,255,.08); padding-top:6px; }}
dt {{ color:var(--muted); font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; }}
dd {{ margin:0; color:var(--ink); text-align:right; font-size:.8rem; overflow-wrap:anywhere; }}
.warnings {{ display:flex; flex-wrap:wrap; gap:5px; min-height:22px; }}
.warnings span {{ border:1px solid rgba(216,137,103,.5); color:#ffd2c2; background:rgba(216,137,103,.12); border-radius:999px; padding:3px 6px; font-size:.68rem; }}
code {{ display:block; color:var(--water); margin-top:10px; font-size:.7rem; overflow-wrap:anywhere; }}
.truth {{ margin-top:16px; border:1px solid var(--line); border-radius:18px; padding:14px; color:var(--muted); background:#111711; }}
</style>
</head>
<body><main>
<section class="hero">
  <p class="kicker">Photo Grove · intake contact sheet</p>
  <h1>Skim the card without touching the originals.</h1>
  <p>This is a visual orientation packet from the intake manifest. It creates tiny review thumbnails in Quipsly's workspace and keeps source photos sacred.</p>
  <div class="counts">
    <div class="count"><b>Rows</b><span>{esc(counts['contactSheetRows'])}</span></div>
    <div class="count"><b>Thumbnails</b><span>{esc(counts['thumbnailReady'])}</span></div>
    <div class="count"><b>Failures</b><span>{esc(counts['thumbnailFailed'])}</span></div>
    <div class="count"><b>Source missing</b><span>{esc(counts['sourceMissing'])}</span></div>
  </div>
  <div class="truth">No originals moved, deleted, edited, rated, uploaded, published, or overwritten. This is review evidence only.</div>
</section>
<section class="grid">{cards}</section>
</main></body></html>
"""
    path.write_text(html_doc, encoding="utf-8")


def prepare_output_dir(output_root: Path) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    out_dir = output_root / stamp()
    counter = 2
    base = out_dir
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def parse_kinds(raw: str) -> set[str]:
    return {part.strip() for part in raw.split(",") if part.strip()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="photo-grove-intake-manifest.jsonl from build_photo_grove_intake_manifest.py")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT), help="Where to write versioned contact-sheet artifacts.")
    parser.add_argument("--max-items", type=int, default=180, help="Maximum selected manifest rows to thumbnail and display.")
    parser.add_argument("--kinds", default="preview", help="Comma-separated manifest kinds to display. Default: preview.")
    parser.add_argument("--folder-contains", default="", help="Optional folder/path substring filter.")
    parser.add_argument("--thumbnail-size", type=int, default=520, help="Maximum thumbnail side in pixels.")
    args = parser.parse_args()

    manifest = Path(args.manifest).expanduser().resolve()
    if not manifest.exists():
        raise SystemExit(f"Manifest not found: {manifest}")

    out_dir = prepare_output_dir(Path(args.output_root).expanduser())
    selected, selection_counts = select_entries(read_manifest(manifest), parse_kinds(args.kinds), args.folder_contains, max(1, args.max_items))
    rows, thumbnail_counts = build_rows(selected, out_dir, max(80, args.thumbnail_size))

    json_path = out_dir / "photo-grove-intake-contact-sheet.json"
    csv_path = out_dir / "photo-grove-intake-contact-sheet.csv"
    md_path = out_dir / "START-HERE-photo-grove-intake-contact-sheet.md"
    html_path = out_dir / "index.html"
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-grove-intake-contact-sheet-ready",
        "manifestJsonl": str(manifest),
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "selection": {
            "kinds": sorted(parse_kinds(args.kinds)),
            "folderContains": args.folder_contains,
            "maxItems": args.max_items,
        },
        "counts": {
            "selection": selection_counts,
            "contactSheetRows": len(rows),
            **thumbnail_counts,
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "versionsOverwritten": False,
        },
        "rows": rows,
        "firstSafeAction": {
            "label": "Open intake contact sheet",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local thumbnail review only. No originals, metadata, delivery, upload, or publication state are changed.",
        },
        "nextSafestAction": "Confirm this is the right shoot/card, then build sidecar-only culling ratings from reviewed images.",
        "truth": {
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "versionsOverwritten": False,
            "description": "Photo Grove intake contact sheet only. It reads manifest evidence and writes versioned local thumbnails/review guidance.",
        },
    }
    write_json(json_path, payload)
    write_csv(csv_path, rows)
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    pointer = {key: payload[key] for key in ["schema", "generatedAt", "status", "sessionDir", "jsonPath", "csvPath", "markdownPath", "htmlPath", "counts", "firstSafeAction", "nextSafestAction", "truth"]}
    write_json(LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
