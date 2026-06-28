#!/usr/bin/env python3
"""Build a calm Photo Grove operator workbench.

This composes existing Photo Grove control-room evidence into one working
surface for humans and agents. It does not write metadata, select proof images,
copy/export/deliver, mutate originals, or publish anything.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-operator-workbench.json"
SCHEMA = "quipsly.photo-grove.operator-workbench.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-grove-operator-workbench")


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
            for child_key in ["cards", "rows", "reviewRows", "steps"]:
                child = value.get(child_key)
                if isinstance(child, list):
                    return [item for item in child if isinstance(item, dict)]
    return []


def by_photo_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        photo_id = str(row.get("photoId") or "")
        if photo_id and photo_id not in indexed:
            indexed[photo_id] = row
    return indexed


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


def merge_row(
    recipe_row: dict[str, Any],
    cull_by_id: dict[str, dict[str, Any]],
    proof_by_id: dict[str, dict[str, Any]],
    quality_by_id: dict[str, dict[str, Any]],
    suggestion_by_id: dict[str, dict[str, Any]],
    index: int,
) -> dict[str, Any]:
    photo_id = str(recipe_row.get("photoId") or "")
    cull = cull_by_id.get(photo_id, {})
    proof = proof_by_id.get(photo_id, {})
    quality = quality_by_id.get(photo_id, {})
    suggestion = suggestion_by_id.get(photo_id, {})
    filename = str(recipe_row.get("filename") or cull.get("filename") or proof.get("filename") or quality.get("filename") or "")
    thumbnail_uri = str(
        recipe_row.get("thumbnailUri")
        or cull.get("thumbnailUri")
        or proof.get("thumbnailUri")
        or quality.get("thumbnailUri")
        or suggestion.get("thumbnailUri")
        or ""
    )
    source_command = str(
        recipe_row.get("sourceCommand")
        or recipe_row.get("openSourceCommand")
        or cull.get("openSourceCommand")
        or proof.get("openSourceCommand")
        or quality.get("openSourceCommand")
        or suggestion.get("openSourceCommand")
        or ""
    )
    dry_run_commands = cull.get("dryRunCommands") if isinstance(cull.get("dryRunCommands"), dict) else {}
    alternate_commands = suggestion.get("alternateDryRunCommands") if isinstance(suggestion.get("alternateDryRunCommands"), dict) else {}
    commands = {
        "recommended": str(
            recipe_row.get("firstDryRunCommand")
            or suggestion.get("firstDryRunCommand")
            or cull.get("firstDryRunCommand")
            or ""
        ),
        "review": str(dry_run_commands.get("review") or alternate_commands.get("review") or ""),
        "keep": str(dry_run_commands.get("keep") or alternate_commands.get("keep") or ""),
        "favorite": str(dry_run_commands.get("favorite") or alternate_commands.get("favorite") or ""),
        "reject": str(dry_run_commands.get("reject") or alternate_commands.get("reject") or ""),
    }
    quality_flags = quality.get("qualityFlags") if isinstance(quality.get("qualityFlags"), list) else proof.get("qualityFlags") if isinstance(proof.get("qualityFlags"), list) else []
    return {
        "rank": index,
        "photoId": photo_id,
        "filename": filename,
        "reviewGroupId": str(recipe_row.get("group") or recipe_row.get("reviewGroupId") or cull.get("reviewGroupId") or ""),
        "route": str(recipe_row.get("route") or quality.get("attentionRoute") or suggestion.get("attentionRoute") or ""),
        "recommendedFirstDecision": str(cull.get("recommendedFirstDecision") or suggestion.get("suggestedIntent") or "review"),
        "confidence": str(cull.get("confidence") or suggestion.get("confidence") or ""),
        "reviewPrompt": str(recipe_row.get("reviewPrompt") or cull.get("humanQuestion") or proof.get("humanQuestion") or quality.get("humanQuestion") or ""),
        "qualityNote": str(proof.get("qualityNote") or quality.get("qualityNote") or ""),
        "qualityFlags": quality_flags,
        "proofRoute": str(proof.get("proofRoute") or ""),
        "proofFit": str(proof.get("proofFit") or ""),
        "thumbnailUri": thumbnail_uri,
        "sourceCommand": source_command,
        "sourcePathExists": bool(recipe_row.get("hasSourcePath")) or bool(source_command),
        "thumbnailExists": bool(recipe_row.get("hasThumbnail")) or bool(thumbnail_uri),
        "commands": commands,
        "localReviewNoteYaml": str(cull.get("localReviewNoteYaml") or ""),
        "localProofCandidateNoteYaml": str(proof.get("localProofCandidateNoteYaml") or ""),
        "localEvidenceNoteYaml": str(quality.get("localEvidenceNoteYaml") or ""),
        "safeNextAction": str(cull.get("safeNextAction") or "Open source/neighbor evidence, rehearse a dry-run decision, and do not write metadata unless explicitly approved."),
        "truth": "Workbench row only. It previews local evidence and dry-run decisions without mutating originals or writing metadata.",
    }


def build(root: Path = DEFAULT_ROOT, limit: int = 12) -> dict[str, Any]:
    control = load_pointer_target(root / "latest-photo-grove-control-room.json")
    next_card = load_pointer_target(root / "latest-photo-grove-next-cull-card.json")
    contact_sheet = load_pointer_target(root / "latest-photo-grove-contact-sheet.json")
    rehearsal = load_pointer_target(root / "latest-photo-grove-cull-rehearsal.json")
    cull_cards = first_list(control, "cullDecisionCards")
    proof_cards = first_list(control, "proofCandidateCards")
    quality_cards = first_list(control, "qualityEvidenceCards")
    suggestions = first_list(control, "suggestedFirstPassDecisions")
    recipe_rows = first_list(control, "firstReviewRecipe")[:limit]
    cull_by_id = by_photo_id(cull_cards)
    proof_by_id = by_photo_id(proof_cards)
    quality_by_id = by_photo_id(quality_cards)
    suggestion_by_id = by_photo_id(suggestions)
    workbench_rows = [
        merge_row(row, cull_by_id, proof_by_id, quality_by_id, suggestion_by_id, index)
        for index, row in enumerate(recipe_rows, 1)
    ]
    counts = control.get("counts") if isinstance(control.get("counts"), dict) else {}
    front_doors = [
        front_door("Photo Grove control room", control, "htmlPath"),
        front_door("Next cull card", next_card, "htmlPath", "nextCullCardPath"),
        front_door("Contact sheet", contact_sheet, "htmlPath"),
        front_door("Cull rehearsal", rehearsal, "htmlPath"),
        front_door("Cull decision cards", control, "cullDecisionCardsPath"),
        front_door("Proof candidate cards", control, "proofCandidateCardsPath"),
        front_door("Quality evidence cards", control, "qualityEvidenceCardsPath"),
    ]
    ready = bool(workbench_rows and counts.get("sourcePhotos"))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-grove-operator-workbench-ready" if ready else "photo-grove-operator-workbench-needs-control-room",
        "photoRoot": str(root),
        "label": "Photo Grove operator workbench",
        "humanAsk": "Review this small tray of photo evidence. Use dry-run commands to rehearse keep/reject/review/favorite, but do not write metadata or select proof images until explicitly approved.",
        "nextSafestAction": "Open the first workbench row, compare thumbnail/source/neighbor context, run only dry-run commands, then record a human decision later if approved.",
        "frontDoors": front_doors,
        "workbenchRows": workbench_rows,
        "counts": {
            "sourcePhotos": int(counts.get("sourcePhotos") or 0),
            "pending": int(counts.get("pending") or 0),
            "review": int(counts.get("review") or 0),
            "selectedForClientProof": int(counts.get("selectedForClientProof") or 0),
            "qualityAttention": int(counts.get("qualityAttention") or 0),
            "cullDecisionCards": len(cull_cards),
            "proofCandidateCards": len(proof_cards),
            "qualityEvidenceCards": len(quality_cards),
            "suggestedFirstPassRows": len(suggestions),
            "workbenchRows": len(workbench_rows),
            "frontDoors": len([item for item in front_doors if item.get("path")]),
            "originalsMutated": bool(counts.get("originalsMutated")),
            "metadataChanged": bool(counts.get("metadataChanged")),
            "clientDeliveryCreated": bool(counts.get("clientDeliveryCreated")),
        },
        "firstSafeAction": {
            "label": "Open Photo Grove operator workbench",
            "command": "",
            "path": "",
            "safety": "Opens local photo review evidence only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, source mutation, delete, overwrite, or receipt truth.",
        },
        "truth": {
            "description": "Photo Grove operator workbench only. It composes existing cull/review evidence into a local review surface.",
            "originalsMutated": False,
            "metadataChanged": False,
            "sidecarDecisionsWritten": False,
            "clientDeliveryCreated": False,
            "proofSelectionChanged": False,
            "filesCopied": False,
            "filesDeleted": False,
            "externalUpload": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "versionsOverwritten": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove operator workbench",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Source photos: `{payload.get('counts', {}).get('sourcePhotos')}`",
        f"- Pending: `{payload.get('counts', {}).get('pending')}`",
        f"- Workbench rows: `{payload.get('counts', {}).get('workbenchRows')}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Front doors",
    ]
    for item in payload.get("frontDoors") or []:
        if item.get("path"):
            lines.append(f"- {item.get('label')}: `{item.get('openCommand')}`")
    lines.extend(["", "## Workbench rows"])
    for row in payload.get("workbenchRows") or []:
        commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
        lines.extend([
            f"### {row.get('rank')}. {row.get('filename')}",
            f"- Photo ID: `{row.get('photoId')}`",
            f"- Group: `{row.get('reviewGroupId')}`",
            f"- Route: `{row.get('route')}`",
            f"- Suggested first decision: `{row.get('recommendedFirstDecision')}`",
            f"- Prompt: {row.get('reviewPrompt')}",
            f"- Open source: `{row.get('sourceCommand')}`",
            f"- Recommended dry run: `{commands.get('recommended') or commands.get('review')}`",
            "",
        ])
    lines.extend([
        "## Safety",
        "Read-only workbench. No original, sidecar, proof, copy, export, delivery, external account, or receipt truth is changed.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    front_doors = "".join(
        f"<a class='door' href='{esc(Path(str(item.get('path'))).as_uri() if item.get('path') else '#')}'><b>{esc(item.get('label'))}</b><span>{esc(item.get('pathExists'))}</span></a>"
        for item in payload.get("frontDoors") or []
        if item.get("path")
    )
    rows_html = []
    for row in payload.get("workbenchRows") or []:
        commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
        flags = ", ".join(str(flag) for flag in row.get("qualityFlags") or [])
        rows_html.append(f"""
        <article class="photo-card">
          <div class="thumb">{f"<img src='{esc(row.get('thumbnailUri'))}' alt='thumbnail'>" if row.get('thumbnailUri') else "<span>No thumbnail</span>"}</div>
          <div class="photo-body">
            <div class="eyebrow">Row {esc(row.get('rank'))} - {esc(row.get('route'))}</div>
            <h2>{esc(row.get('filename'))}</h2>
            <p>{esc(row.get('reviewPrompt'))}</p>
            <div class="chips">
              <span>{esc(row.get('recommendedFirstDecision'))}</span>
              <span>{esc(row.get('reviewGroupId'))}</span>
              <span>{esc(row.get('confidence'))}</span>
              <span>{esc(row.get('proofRoute'))}</span>
            </div>
            <p class="small"><b>Quality:</b> {esc(row.get('qualityNote') or flags or 'No extra quality note.')}</p>
            <details><summary>Dry-run commands</summary>
              <code>{esc(commands.get('recommended') or commands.get('review') or '')}</code>
              <code>{esc(commands.get('keep') or '')}</code>
              <code>{esc(commands.get('favorite') or '')}</code>
              <code>{esc(commands.get('reject') or '')}</code>
            </details>
            <details><summary>Local notes</summary><pre>{esc(row.get('localReviewNoteYaml') or row.get('localProofCandidateNoteYaml') or row.get('localEvidenceNoteYaml') or '')}</pre></details>
            <p class="small"><b>Open source:</b> <code>{esc(row.get('sourceCommand'))}</code></p>
          </div>
        </article>""")
    rows = "\n".join(rows_html)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove operator workbench</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f8f0dc; --paper:#17241e; --leaf:#8ac17d; --moss:#405d45; --gold:#e7be55; --clay:#d9784f; --line:#375144; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 12% 0%, #3d5a45, #121a16 44%, #201914); color:var(--ink); }}
    main {{ max-width: 1220px; margin: 34px auto; padding: 0 22px 60px; }}
    .hero {{ border:1px solid var(--line); border-radius:32px; padding:28px; background:rgba(23,36,30,.94); box-shadow:0 26px 90px rgba(0,0,0,.36); }}
    .eyebrow {{ color:var(--gold); font-weight:900; letter-spacing:.25em; text-transform:uppercase; font-size:12px; }}
    h1 {{ font: 900 clamp(38px,5vw,66px)/.95 ui-serif, Georgia, serif; margin:10px 0; }}
    .meta, .chips {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .meta span, .chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.07); font-weight:850; font-size:12px; }}
    .doors {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:10px; margin:18px 0; }}
    .door {{ color:var(--ink); text-decoration:none; border:1px solid var(--line); border-radius:18px; padding:14px; background:rgba(255,255,255,.055); display:flex; justify-content:space-between; gap:12px; }}
    .photo-card {{ display:grid; grid-template-columns: 190px 1fr; gap:18px; border:1px solid var(--line); border-radius:24px; padding:16px; margin-top:14px; background:rgba(255,255,255,.045); }}
    .thumb {{ background:#0d120f; border-radius:18px; min-height:150px; display:grid; place-items:center; overflow:hidden; }}
    .thumb img {{ width:100%; height:100%; object-fit:cover; display:block; }}
    h2 {{ margin:4px 0 8px; color:#fff8dd; }}
    .small {{ color:#c8d3c3; font-size:13px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.25); border:1px solid var(--line); border-radius:12px; padding:10px; color:#fff6d8; }}
    details {{ margin-top:10px; }}
    summary {{ cursor:pointer; color:var(--leaf); font-weight:900; }}
    .truth {{ margin-top:20px; color:#d6d1bd; }}
    @media(max-width:760px) {{ .photo-card {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main>
  <section class="hero">
    <div class="eyebrow">Photo Grove</div>
    <h1>Cull calmly. Preserve everything.</h1>
    <p>{esc(payload.get('humanAsk'))}</p>
    <div class="meta">
      <span>{esc(payload.get('status'))}</span>
      <span>{esc(counts.get('sourcePhotos'))} source photos</span>
      <span>{esc(counts.get('pending'))} pending</span>
      <span>{esc(counts.get('workbenchRows'))} workbench rows</span>
      <span>{esc(counts.get('qualityAttention'))} quality attention</span>
    </div>
    <div class="doors">{front_doors}</div>
  </section>
  <section>{rows}</section>
  <p class="truth">Safety: local evidence only. No original, metadata, proof-selection, copy, export, delivery, external account, or receipt truth is changed.</p>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    rows = payload.get("workbenchRows") if isinstance(payload.get("workbenchRows"), list) else []
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "photoId", "filename", "reviewGroupId", "route", "recommendedFirstDecision", "reviewPrompt", "sourceCommand"])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames})


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Build Photo Grove operator workbench.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=12)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build(root, args.limit)
    out_dir = root / "OperatorWorkbenches" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "photo-grove-operator-workbench.json"
    markdown_path = out_dir / "START-HERE-photo-grove-operator-workbench.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "photo-grove-operator-workbench.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Photo Grove operator workbench",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local photo review evidence only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, source mutation, delete, overwrite, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_csv(csv_path, payload)
    write_json(root / LATEST_POINTER, {
        "schema": "quipsly.photo-grove.latest-operator-workbench.v1",
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
    return 0 if payload.get("status") == "photo-grove-operator-workbench-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
