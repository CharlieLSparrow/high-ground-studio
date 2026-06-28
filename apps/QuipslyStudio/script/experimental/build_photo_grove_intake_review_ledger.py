#!/usr/bin/env python3
"""Create a Photo Grove review ledger from an intake contact sheet.

This bridges the raw intake/contact-sheet layer into the existing Photo Grove
review-decision machinery. It writes a Quipsly-owned ledger session with pending
metadata decisions, dry-run commands, and provenance. It never moves, edits,
deletes, rates, uploads, publishes, exports, or mutates original photos.
"""
from __future__ import annotations

import argparse
import html
import json
import re
import shlex
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
DEFAULT_OUTPUT_ROOT = DEFAULT_PHOTO_ROOT / "IntakeReviewLedgers"
LATEST_CONTACT_SHEET_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-intake-contact-sheet.json"
LATEST_INTAKE_LEDGER_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-intake-review-ledger.json"
GLOBAL_REVIEW_POINTER = DEFAULT_PHOTO_ROOT / "latest-photo-grove-review.json"
SCHEMA = "quipsly.photo-grove.intake-review-ledger.v1"
LEDGER_SCHEMA = "quipsly.photo-grove.review-ledger.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-photo-intake-review-ledger")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_command(parts: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in parts)


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "-", value.strip()).strip("-").lower() or "ungrouped"


def resolve_contact_sheet(value: str) -> tuple[dict[str, Any], Path]:
    if value == "latest":
        pointer = load_json(LATEST_CONTACT_SHEET_POINTER)
        json_path = Path(str(pointer.get("jsonPath") or ""))
        if not json_path.exists():
            raise SystemExit(f"Latest intake contact sheet JSON not found from {LATEST_CONTACT_SHEET_POINTER}")
        return load_json(json_path), json_path
    path = Path(value).expanduser()
    if path.is_dir():
        path = path / "photo-grove-intake-contact-sheet.json"
    if not path.exists():
        raise SystemExit(f"Intake contact sheet JSON not found: {path}")
    return load_json(path), path


def prepare_output_dir(output_root: Path) -> Path:
    output_root.mkdir(parents=True, exist_ok=True)
    out_dir = output_root / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def group_id_for(row: dict[str, Any]) -> str:
    companion = str(row.get("companionKey") or "").strip()
    if companion:
        return f"companion-{safe_slug(companion)}"
    folder = str(row.get("folder") or "ungrouped")
    return f"folder-{safe_slug(folder)}"


def decision_commands(photo_id: str, session_dir: Path) -> dict[str, str]:
    base = ["python3", "apps/QuipslyStudio/script/photo_grove_review_decision.py", photo_id]
    session = ["--session", str(session_dir)]
    return {
        "dryRunReview": shell_command([*base, "review", "-", "intake-review", "reviewer", "Needs visual/source review before culling.", *session, "--dry-run"]),
        "dryRunKeep": shell_command([*base, "keep", "4", "intake-keeper", "reviewer", "Keeper after visual/source review.", *session, "--dry-run"]),
        "dryRunFavorite": shell_command([*base, "favorite", "5", "hero-candidate,intake-keeper", "reviewer", "Hero candidate after visual/source review.", *session, "--dry-run"]),
        "dryRunReject": shell_command([*base, "reject", "-", "reject-after-review", "reviewer", "Reject metadata only after visual/source review.", *session, "--dry-run"]),
        "liveReviewTemplate": shell_command([*base, "review", "-", "intake-review", "reviewer", "<why review is needed>", *session]),
    }


def build_decisions(rows: list[dict[str, Any]], session_dir: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    groups_by_id: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups_by_id[group_id_for(row)].append(row)

    group_rows: list[dict[str, Any]] = []
    for group_id, group in sorted(groups_by_id.items()):
        group_rows.append({
            "id": group_id,
            "size": len(group),
            "firstFilename": group[0].get("fileName") or "",
            "lastFilename": group[-1].get("fileName") or "",
            "source": "intake-contact-sheet",
        })

    group_sizes = {group["id"]: int(group["size"]) for group in group_rows}
    positions: dict[str, int] = defaultdict(int)
    decisions: list[dict[str, Any]] = []
    for row in rows:
        group_id = group_id_for(row)
        positions[group_id] += 1
        photo_id = str(row.get("id") or f"photo-{len(decisions) + 1:04d}")
        warnings = [str(item) for item in row.get("warnings") or []]
        tags = ["intake-contact-sheet"]
        if row.get("kind"):
            tags.append(f"kind-{safe_slug(str(row.get('kind')))}")
        decisions.append({
            "id": photo_id,
            "photoId": photo_id,
            "filename": str(row.get("fileName") or ""),
            "sourcePath": str(row.get("sourcePath") or ""),
            "sourceUri": str(row.get("sourceUri") or ""),
            "thumbnailPath": str(row.get("thumbnailPath") or ""),
            "thumbnailUri": str(row.get("thumbnailUri") or ""),
            "relativePath": str(row.get("relativePath") or ""),
            "folder": str(row.get("folder") or ""),
            "kind": str(row.get("kind") or "image"),
            "extension": str(row.get("extension") or ""),
            "sizeBytes": int(row.get("sizeBytes") or 0),
            "modifiedAt": str(row.get("modifiedAt") or ""),
            "signature": str(row.get("signature") or ""),
            "companionKey": str(row.get("companionKey") or ""),
            "reviewGroupId": group_id,
            "reviewGroupPosition": positions[group_id],
            "reviewGroupSize": group_sizes.get(group_id, 1),
            "status": "pending",
            "rating": None,
            "tags": tags,
            "flags": warnings,
            "note": "",
            "updatedAt": "",
            "updatedBy": "",
            "sourcePacket": "intake-contact-sheet",
            "commands": decision_commands(photo_id, session_dir),
        })
    return decisions, group_rows


def write_markdown(session_dir: Path, ledger: dict[str, Any], pointer: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove intake review ledger",
        "",
        f"Generated: `{ledger['generatedAt']}`",
        f"Session: `{session_dir}`",
        f"Source contact sheet: `{ledger.get('sourceContactSheetJson')}`",
        "",
        "Originals are untouched. These are pending Quipsly review metadata rows created from the intake contact sheet.",
        "",
        "## Counts",
        "",
    ]
    for key, value in ledger.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend([
        "",
        "## First safe action",
        "",
        f"Open status board: `{pointer['firstSafeAction']['command']}`",
        "",
        "## Decision model",
        "",
        "- `pending`: not yet reviewed.",
        "- `review`: needs human/source inspection.",
        "- `keep`: safe keeper candidate after review.",
        "- `favorite`: hero candidate after review.",
        "- `reject`: metadata-only reject after review; original file is still untouched.",
        "",
        "## First rows",
        "",
        "| File | Status | Group | Dry-run review |",
        "| --- | --- | --- | --- |",
    ])
    for decision in (ledger.get("decisions") or [])[:25]:
        command = decision.get("commands", {}).get("dryRunReview", "")
        lines.append(f"| `{decision.get('filename')}` | {decision.get('status')} | `{decision.get('reviewGroupId')}` | `{command}` |")
    (session_dir / "START-HERE-intake-review-ledger.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(session_dir: Path, ledger: dict[str, Any]) -> None:
    cards = []
    for decision in (ledger.get("decisions") or [])[:120]:
        image = f"<img src='{esc(decision.get('thumbnailUri'))}' alt='{esc(decision.get('filename'))}'>" if decision.get("thumbnailUri") else "<div class='missing'>No thumbnail</div>"
        flags = "".join(f"<span>{esc(flag)}</span>" for flag in decision.get("flags") or [])
        command = decision.get("commands", {}).get("dryRunReview", "")
        cards.append(f"""
        <article class="card">
          {image}
          <div class="body">
            <b>{esc(decision.get('filename'))}</b>
            <small>{esc(decision.get('relativePath'))}</small>
            <p>Status: <strong>{esc(decision.get('status'))}</strong> · Group: <code>{esc(decision.get('reviewGroupId'))}</code></p>
            <div class="flags">{flags}</div>
            <code>{esc(command)}</code>
          </div>
        </article>
        """)
    counts = ledger.get("counts") or {}
    html_doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Photo Grove intake review ledger</title>
<style>
:root {{ color-scheme:dark; --bg:#111812; --panel:#1d2a20; --ink:#f8f0d5; --muted:#b8ad8d; --line:#46583f; --leaf:#8fd278; --honey:#edc95c; --water:#80d7dc; }}
* {{ box-sizing:border-box; }} body {{ margin:0; background:radial-gradient(circle at 10% -10%, rgba(143,210,120,.22), transparent 34rem), #111812; color:var(--ink); font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; }}
main {{ max-width:1500px; margin:0 auto; padding:32px 24px 80px; }} .hero {{ border:1px solid var(--line); border-radius:30px; padding:28px; background:rgba(29,42,32,.9); }}
.kicker {{ margin:0 0 8px; color:var(--honey); text-transform:uppercase; letter-spacing:.24em; font-weight:900; font-size:.75rem; }} h1 {{ margin:0; font-size:clamp(2.2rem,5vw,5rem); line-height:.92; letter-spacing:-.06em; }}
.stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }} .stat {{ border:1px solid var(--line); border-radius:16px; padding:12px; background:#121a14; }} .stat b {{ color:var(--leaf); font-size:1.6rem; }} .stat span {{ display:block; color:var(--muted); text-transform:uppercase; letter-spacing:.1em; font-size:.68rem; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; margin-top:22px; }} .card {{ border:1px solid var(--line); border-radius:20px; overflow:hidden; background:#1b271e; }} img,.missing {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:flex; align-items:center; justify-content:center; background:#0b100c; color:var(--muted); }} .body {{ padding:12px; }} b,small,code {{ display:block; overflow-wrap:anywhere; }} small,p {{ color:var(--muted); }} code {{ color:var(--water); font-size:.68rem; }} .flags {{ display:flex; flex-wrap:wrap; gap:5px; min-height:18px; }} .flags span {{ border:1px solid var(--line); border-radius:999px; padding:3px 6px; color:var(--muted); font-size:.68rem; }}
</style></head><body><main>
<section class="hero"><p class="kicker">Photo Grove · sidecar decisions</p><h1>Pending cull decisions, no original mutations.</h1><p>This ledger turns an intake contact sheet into reversible review metadata. Dry-run before any live sidecar write.</p><div class="stats"><div class="stat"><b>{esc(counts.get('total'))}</b><span>Total</span></div><div class="stat"><b>{esc(counts.get('pending'))}</b><span>Pending</span></div><div class="stat"><b>{esc(counts.get('groups'))}</b><span>Groups</span></div></div></section>
<section class="grid">{''.join(cards)}</section>
</main></body></html>"""
    (session_dir / "index.html").write_text(html_doc, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contact-sheet", default="latest", help="latest, contact-sheet JSON file, or contact-sheet session folder.")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--promote-latest", action="store_true", help="Also point latest-photo-grove-review.json at this intake ledger session.")
    args = parser.parse_args()

    contact_sheet, contact_sheet_path = resolve_contact_sheet(args.contact_sheet)
    rows = contact_sheet.get("rows") if isinstance(contact_sheet.get("rows"), list) else []
    if not rows:
        raise SystemExit("Contact sheet has no rows to seed into a review ledger.")

    session_dir = prepare_output_dir(Path(args.output_root).expanduser())
    decisions, groups = build_decisions(rows, session_dir)
    now = iso_now()
    counts = {
        "total": len(decisions),
        "pending": len(decisions),
        "review": 0,
        "keep": 0,
        "favorite": 0,
        "reject": 0,
        "rated": 0,
        "flagged": sum(1 for decision in decisions if decision.get("flags")),
        "groups": len(groups),
        "metadataChanged": False,
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
        "versionsOverwritten": False,
    }
    ledger = {
        "schema": LEDGER_SCHEMA,
        "originSchema": SCHEMA,
        "generatedAt": now,
        "updatedAt": now,
        "sessionDir": str(session_dir),
        "sourceContactSheetJson": str(contact_sheet_path),
        "sourceManifestJsonl": contact_sheet.get("manifestJsonl") or "",
        "sourceContactSheetHtml": contact_sheet.get("htmlPath") or "",
        "decisions": decisions,
        "groups": groups,
        "counts": counts,
        "truth": {
            "metadataChanged": False,
            "originalsMutated": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "versionsOverwritten": False,
            "description": "Intake review ledger only. It creates pending sidecar decision rows from a contact sheet; original files remain untouched.",
        },
    }
    ledger_path = session_dir / "review-ledger.json"
    write_json(ledger_path, ledger)
    (session_dir / "review-events.jsonl").write_text("", encoding="utf-8")

    pointer = {
        "schema": SCHEMA,
        "generatedAt": now,
        "status": "photo-grove-intake-review-ledger-ready",
        "latestSessionDir": str(session_dir),
        "ledgerPath": str(ledger_path),
        "htmlPath": str(session_dir / "index.html"),
        "markdownPath": str(session_dir / "START-HERE-intake-review-ledger.md"),
        "sourceContactSheetJson": str(contact_sheet_path),
        "counts": counts,
        "firstSafeAction": {
            "label": "Open intake review ledger",
            "command": shell_command(["open", str(session_dir / "index.html")]),
            "path": str(session_dir / "index.html"),
            "safety": "Opens local pending cull metadata only. Originals and publication state are unchanged.",
        },
        "firstDryRunCommand": decisions[0]["commands"]["dryRunReview"] if decisions else "",
        "promotedToGlobalLatestReview": bool(args.promote_latest),
        "truth": ledger["truth"],
    }
    write_markdown(session_dir, ledger, pointer)
    write_html(session_dir, ledger)
    write_json(LATEST_INTAKE_LEDGER_POINTER, pointer)
    if args.promote_latest:
        write_json(GLOBAL_REVIEW_POINTER, {
            "schema": "quipsly.photo-grove.latest-review.v1",
            "updatedAt": now,
            "latestSessionDir": str(session_dir),
            "ledgerPath": str(ledger_path),
            "source": "intake-contact-sheet-ledger",
            "truth": ledger["truth"],
        })
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
