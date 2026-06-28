#!/usr/bin/env python3
"""Build one calm Photo Grove next-cull card.

The control room already contains several useful culling surfaces. This script
creates the smallest possible front door for a tired human or agent: one photo,
its related evidence, dry-run commands, and a clear stop condition.

Truth boundary:
- originals stay untouched
- metadata/sidecar ledgers are not written
- client proof, export, upload, publication, schedule, and receipts stay false
"""
from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_CONTROL_ROOM = "latest-photo-grove-control-room.json"
LATEST_POINTER = "latest-photo-grove-next-cull-card.json"
SCHEMA = "quipsly.photo-grove.next-cull-card.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-grove-next-cull-card")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def first_card(cards_payload: dict[str, Any], requested_photo_id: str = "") -> dict[str, Any]:
    cards = cards_payload.get("cards")
    if not isinstance(cards, list):
        return {}
    for raw in cards:
        if not isinstance(raw, dict):
            continue
        if requested_photo_id and str(raw.get("photoId") or "") != requested_photo_id:
            continue
        return raw
    return {}


def choose_cull_card(control: dict[str, Any], requested_photo_id: str = "") -> tuple[dict[str, Any], dict[str, Any]]:
    cards_payload = control.get("cullDecisionCards") if isinstance(control.get("cullDecisionCards"), dict) else {}
    cards = cards_payload.get("cards")
    if not isinstance(cards, list):
        return {}, {"mode": "blocked-no-cull-cards", "candidateCount": 0}
    if requested_photo_id:
        requested = first_card(cards_payload, requested_photo_id)
        return requested, {
            "mode": "requested-photo",
            "candidateCount": len(cards),
            "requestedPhotoId": requested_photo_id,
            "selectedPhotoId": requested.get("photoId") if requested else "",
        }

    quality_cards = control.get("qualityEvidenceCards") if isinstance(control.get("qualityEvidenceCards"), dict) else {}
    proof_cards = control.get("proofCandidateCards") if isinstance(control.get("proofCandidateCards"), dict) else {}
    blank_flag_names = {
        "blank-preview-candidate",
        "preview-all-white",
        "thumbnail-analysis-suspect",
        "missing-preview",
        "missing-thumbnail",
    }
    scored: list[tuple[float, int, dict[str, Any], dict[str, Any]]] = []
    skipped_blank = 0
    for idx, raw in enumerate(cards):
        if not isinstance(raw, dict):
            continue
        photo_id = str(raw.get("photoId") or "")
        quality = related_card(quality_cards, photo_id)
        proof = related_card(proof_cards, photo_id)
        flags = set(str(flag) for flag in ((quality.get("qualityFlags") or proof.get("qualityFlags") or []) if isinstance(quality.get("qualityFlags") or proof.get("qualityFlags") or [], list) else []))
        source_path = str(quality.get("sourcePath") or source_path_from_open_command(str(raw.get("openSourceCommand") or "")))
        thumbnail_path = str(quality.get("thumbnailPath") or "")
        score = 0.0
        if source_path and Path(source_path).exists():
            score += 40
        if thumbnail_path and Path(thumbnail_path).exists():
            score += 30
        if flags & blank_flag_names:
            score -= 100
            skipped_blank += 1
        if "raw-review" in flags:
            score += 5
        if "sequence-review" in flags:
            score += 4
        if str(raw.get("confidence") or "") == "group-context-needed":
            score += 3
        if str(raw.get("confidence") or "").startswith("attention-high"):
            score -= 10
        score -= idx / 1000
        scored.append((score, idx, raw, {
            "photoId": photo_id,
            "filename": raw.get("filename") or "",
            "score": round(score, 3),
            "flags": sorted(flags),
            "sourceExists": bool(source_path and Path(source_path).exists()),
            "thumbnailExists": bool(thumbnail_path and Path(thumbnail_path).exists()),
        }))
    if not scored:
        return {}, {"mode": "blocked-no-valid-cull-cards", "candidateCount": len(cards)}
    scored.sort(key=lambda item: item[0], reverse=True)
    selected_score, selected_index, selected, selected_diag = scored[0]
    return selected, {
        "mode": "auto-prefer-viewable",
        "candidateCount": len(scored),
        "selectedIndex": selected_index,
        "selectedScore": round(selected_score, 3),
        "selectedPhotoId": selected.get("photoId") or "",
        "skippedBlankOrSuspectPreviewCandidates": skipped_blank,
        "selected": selected_diag,
        "topCandidates": [diag for _, _, _, diag in scored[:5]],
    }


def related_card(cards_payload: dict[str, Any], photo_id: str) -> dict[str, Any]:
    cards = cards_payload.get("cards")
    if not isinstance(cards, list):
        return {}
    for raw in cards:
        if isinstance(raw, dict) and str(raw.get("photoId") or "") == photo_id:
            return raw
    return {}


def first_pass_row(payload: dict[str, Any], photo_id: str) -> dict[str, Any]:
    rows = payload.get("rows")
    if not isinstance(rows, list):
        return {}
    for raw in rows:
        if isinstance(raw, dict) and str(raw.get("photoId") or "") == photo_id:
            return raw
    return {}


def source_path_from_open_command(command: str) -> str:
    marker = "open -R '"
    if marker not in command:
        return ""
    tail = command.split(marker, 1)[1]
    return tail.split("'", 1)[0]


def build_payload(photo_root: Path, requested_photo_id: str = "") -> dict[str, Any]:
    control_pointer = load_json(photo_root / LATEST_CONTROL_ROOM)
    control_path = Path(str(control_pointer.get("jsonPath") or ""))
    control = load_json(control_path) if control_path.exists() else control_pointer

    cull_card, selection_diagnostics = choose_cull_card(control, requested_photo_id)
    if not cull_card:
        return {
            "schema": SCHEMA,
            "generatedAt": iso_now(),
            "status": "blocked-no-cull-card",
            "photoRoot": str(photo_root),
            "label": "Photo Grove next cull card needs source cards",
            "humanAsk": "No cull card was found. Rebuild Photo Grove control-room evidence before asking for a cull decision.",
            "nextSafestAction": "Rebuild the Photo Grove control room or first-pass triage, then rerun this command.",
            "truth": "No cull card was found. No source or metadata was changed.",
            "counts": {"qualityFlags": 0, "commands": 0, "sourceExists": False, "thumbnailExists": False},
        }

    photo_id = str(cull_card.get("photoId") or "")
    quality_card = related_card(control.get("qualityEvidenceCards") or {}, photo_id)
    proof_card = related_card(control.get("proofCandidateCards") or {}, photo_id)
    first_pass = first_pass_row((control.get("suggestedFirstPassDecisions") or {}), photo_id)

    open_source = str(cull_card.get("openSourceCommand") or quality_card.get("openSourceCommand") or "")
    source_path = str(quality_card.get("sourcePath") or source_path_from_open_command(open_source))
    thumbnail_uri = str(cull_card.get("thumbnailUri") or quality_card.get("thumbnailUri") or proof_card.get("thumbnailUri") or "")
    thumbnail_path = str(quality_card.get("thumbnailPath") or "")

    dry_runs = cull_card.get("dryRunCommands") if isinstance(cull_card.get("dryRunCommands"), dict) else {}
    alternate = first_pass.get("alternateDryRunCommands") if isinstance(first_pass.get("alternateDryRunCommands"), dict) else {}

    commands = {
        "openSource": open_source,
        "dryRunReview": str(dry_runs.get("review") or cull_card.get("firstDryRunCommand") or first_pass.get("firstDryRunCommand") or ""),
        "dryRunKeep": str(dry_runs.get("keep") or alternate.get("keep") or ""),
        "dryRunFavorite": str(dry_runs.get("favorite") or alternate.get("favorite") or ""),
        "dryRunReject": str(dry_runs.get("reject") or alternate.get("reject") or ""),
        "optionalLiveSidecarTemplate": str(cull_card.get("optionalSidecarDecisionTemplate") or "")
    }

    status = "next-cull-card-ready"
    if not source_path or not Path(source_path).exists():
        status = "next-cull-card-source-needs-attention"
    if not commands["dryRunReview"]:
        status = "next-cull-card-dry-run-missing"

    filename = str(cull_card.get("filename") or quality_card.get("filename") or proof_card.get("filename") or "")
    recommended_decision = str(cull_card.get("recommendedFirstDecision") or first_pass.get("recommendedFirstDecision") or "review")
    first_dry_run_key = {
        "favorite": "dryRunFavorite",
        "keep": "dryRunKeep",
        "reject": "dryRunReject",
        "review": "dryRunReview",
    }.get(recommended_decision.strip().lower(), "dryRunReview")
    first_dry_run_command = str(commands.get(first_dry_run_key) or commands.get("dryRunReview") or "")
    first_dry_run_action = {
        "label": f"Dry-run {recommended_decision or 'review'} decision for this photo",
        "command": first_dry_run_command,
        "decision": recommended_decision or "review",
        "safety": "Dry-run only. It prints the intended metadata decision without writing sidecars, mutating originals, copying files, exporting, delivering, uploading, publishing, deleting, overwriting, approving, or creating receipt truth.",
    } if first_dry_run_command else {}
    safe_next_action = "Open the source, compare it with neighbor context, run the review dry-run, and stop. Do not execute a live sidecar decision unless Charlie explicitly approves that exact write."
    quality_flags = quality_card.get("qualityFlags") or proof_card.get("qualityFlags") or []
    human_question = cull_card.get("humanQuestion") or proof_card.get("humanQuestion") or "What does the source/neighbor evidence actually show?"

    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "photoRoot": str(photo_root),
        "controlRoomJson": str(control_path) if control_path.exists() else str(photo_root / LATEST_CONTROL_ROOM),
        "label": f"{filename or photo_id} -> {recommended_decision}",
        "selectionDiagnostics": selection_diagnostics,
        "groupLabel": str(cull_card.get("reviewGroupId") or quality_card.get("reviewGroupId") or proof_card.get("reviewGroupId") or ""),
        "recommendedAction": recommended_decision,
        "humanAsk": human_question,
        "nextSafestAction": safe_next_action,
        "counts": {
            "qualityFlags": len(quality_flags) if isinstance(quality_flags, list) else 0,
            "commands": sum(1 for command in commands.values() if command),
            "sourceExists": bool(source_path and Path(source_path).exists()),
            "thumbnailExists": bool(thumbnail_path and Path(thumbnail_path).exists()),
        },
        "photo": {
            "photoId": photo_id,
            "filename": filename,
            "reviewGroupId": cull_card.get("reviewGroupId") or quality_card.get("reviewGroupId") or proof_card.get("reviewGroupId") or "",
            "suggestedIntent": cull_card.get("suggestedIntent") or first_pass.get("suggestedIntent") or "",
            "recommendedFirstDecision": recommended_decision,
            "confidence": cull_card.get("confidence") or first_pass.get("confidence") or "",
            "attentionRoute": quality_card.get("attentionRoute") or first_pass.get("attentionRoute") or "",
            "sourcePath": source_path,
            "sourceExists": bool(source_path and Path(source_path).exists()),
            "thumbnailUri": thumbnail_uri,
            "thumbnailPath": thumbnail_path,
            "thumbnailExists": bool(thumbnail_path and Path(thumbnail_path).exists())
        },
        "humanQuestion": human_question,
        "reason": cull_card.get("reason") or first_pass.get("reason") or "",
        "qualityFlags": quality_flags,
        "qualityNote": quality_card.get("qualityNote") or proof_card.get("qualityNote") or "",
        "safeNextAction": safe_next_action,
        "firstDryRunAction": first_dry_run_action,
        "firstDryRunCommand": first_dry_run_command,
        "firstDryRunDecision": recommended_decision or "review",
        "firstDryRunSafety": first_dry_run_action.get("safety") if first_dry_run_action else "",
        "stopConditions": [
            "thumbnail and source disagree",
            "source is missing or still downloading",
            "neighbor comparison is needed",
            "reviewer cannot explain the decision in one sentence",
            "any live sidecar write would be a guess"
        ],
        "commands": commands,
        "copyableLocalReviewNoteYaml": cull_card.get("localReviewNoteYaml") or "",
        "relatedEvidence": {
            "qualityEvidence": quality_card,
            "proofCandidate": proof_card,
            "firstPassDecision": first_pass
        },
        "truth": "Next cull card only. It opens evidence and dry-runs intent; it does not mutate originals, write metadata, select proof images, copy, export, deliver, upload, publish, schedule, delete, overwrite, or create receipt truth."
    }


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    photo = payload.get("photo") if isinstance(payload.get("photo"), dict) else {}
    commands = payload.get("commands") if isinstance(payload.get("commands"), dict) else {}
    lines = [
        "# Photo Grove next cull card",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Generated: `{payload.get('generatedAt')}`",
        f"- Photo: `{photo.get('filename')}` (`{photo.get('photoId')}`)",
        f"- Group: `{photo.get('reviewGroupId')}`",
        f"- Suggested intent: `{photo.get('suggestedIntent')}`",
        f"- Recommended first decision: `{photo.get('recommendedFirstDecision')}`",
        f"- Confidence: `{photo.get('confidence')}`",
        f"- Source exists: `{photo.get('sourceExists')}`",
        "",
        "## Question",
        "",
        str(payload.get("humanQuestion") or ""),
        "",
        "## Why this card",
        "",
        str(payload.get("reason") or ""),
        "",
        "## Selection diagnostics",
        "",
        "```json",
        json.dumps(payload.get("selectionDiagnostics") or {}, indent=2, sort_keys=True),
        "```",
        "",
        "## Safe next action",
        "",
        str(payload.get("safeNextAction") or ""),
        "",
        "## Commands",
        "",
    ]
    for label, command in commands.items():
        if command:
            lines.append(f"- {label}: `{command}`")
    lines.extend(["", "## Stop conditions", ""])
    for item in payload.get("stopConditions") or []:
        lines.append(f"- {item}")
    if payload.get("copyableLocalReviewNoteYaml"):
        lines.extend(["", "## Copyable local review note", "", "```yaml", str(payload.get("copyableLocalReviewNoteYaml") or ""), "```"])
    lines.extend(["", "## Truth boundary", "", str(payload.get("truth") or ""), ""])
    path.write_text("\n".join(lines), encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    photo = payload.get("photo") if isinstance(payload.get("photo"), dict) else {}
    commands = payload.get("commands") if isinstance(payload.get("commands"), dict) else {}
    quality_flags = payload.get("qualityFlags") or []
    selection_diagnostics = payload.get("selectionDiagnostics") if isinstance(payload.get("selectionDiagnostics"), dict) else {}
    command_items = "".join(
        f"<li><strong>{esc(label)}</strong><code>{esc(command)}</code></li>"
        for label, command in commands.items()
        if command
    )
    stop_items = "".join(f"<li>{esc(item)}</li>" for item in payload.get("stopConditions") or [])
    flag_items = "".join(f'<span class="pill">{esc(flag)}</span>' for flag in quality_flags)
    thumb = f'<img src="{esc(photo.get("thumbnailUri"))}" alt="Cull thumbnail">' if photo.get("thumbnailUri") else "<p>No thumbnail available.</p>"
    html_doc = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Photo Grove next cull card</title>
  <style>
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; background:#102019; color:#f7f0dd; }}
    main {{ max-width:980px; margin:0 auto; padding:40px 24px; }}
    .card {{ border:1px solid rgba(231,197,105,.35); background:rgba(255,255,255,.06); border-radius:24px; padding:28px; box-shadow:0 24px 60px rgba(0,0,0,.35); }}
    .eyebrow {{ color:#e8c35f; letter-spacing:.18em; text-transform:uppercase; font-size:12px; font-weight:800; }}
    h1 {{ margin:.25rem 0 1rem; font-size:42px; line-height:1; }}
    .grid {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
    .pill {{ display:inline-block; margin:4px 6px 4px 0; padding:6px 10px; border-radius:999px; background:rgba(232,195,95,.14); color:#f6d76f; font-size:12px; font-weight:800; }}
    code {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; margin:.35rem 0 1rem; padding:10px; border-radius:12px; background:rgba(0,0,0,.28); color:#d3f6dd; }}
    img {{ width:100%; max-height:520px; object-fit:contain; border-radius:18px; background:#0a0f0c; }}
    .truth {{ border-left:4px solid #7bbf7a; padding-left:14px; color:#d6e8d5; }}
  </style>
</head>
<body>
  <main>
    <section class="card">
      <div class="eyebrow">Photo Grove</div>
      <h1>One cull decision, no panic.</h1>
      <p><strong>{esc(photo.get('filename'))}</strong> · {esc(photo.get('photoId'))} · status <span class="pill">{esc(payload.get('status'))}</span></p>
      <div class="grid">
        <div>
          <h2>Ask</h2>
          <p>{esc(payload.get('humanQuestion'))}</p>
          <h2>Why this card</h2>
          <p>{esc(payload.get('reason'))}</p>
          <h2>Evidence tags</h2>
          <p>{flag_items}</p>
          <h2>Selection diagnostics</h2>
          <code>{esc(json.dumps(selection_diagnostics, indent=2, sort_keys=True))}</code>
        </div>
        <div>
          <h2>Thumbnail</h2>
          {thumb}
        </div>
      </div>
      <h2>Commands</h2>
      <ul>{command_items}</ul>
      <h2>Stop conditions</h2>
      <ul>{stop_items}</ul>
      <h2>Truth boundary</h2>
      <p class="truth">{esc(payload.get('truth'))}</p>
    </section>
  </main>
</body>
</html>
"""
    path.write_text(html_doc, encoding="utf-8")


def write_pointer(photo_root: Path, payload: dict[str, Any], output_dir: Path) -> None:
    photo = payload.get("photo") if isinstance(payload.get("photo"), dict) else {}
    html_path = str(output_dir / "index.html")
    pointer = {
        "schema": "quipsly.photo-grove.latest-next-cull-card.v1",
        "status": payload.get("status"),
        "generatedAt": payload.get("generatedAt"),
        "jsonPath": str(output_dir / "photo-grove-next-cull-card.json"),
        "markdownPath": str(output_dir / "START-HERE-photo-grove-next-cull-card.md"),
        "htmlPath": html_path,
        "nextCullCardPath": html_path,
        "label": payload.get("label") or "",
        "groupLabel": payload.get("groupLabel") or "",
        "recommendedAction": payload.get("recommendedAction") or "",
        "humanAsk": payload.get("humanAsk") or payload.get("humanQuestion") or "",
        "nextSafestAction": payload.get("nextSafestAction") or payload.get("safeNextAction") or "",
        "counts": payload.get("counts") if isinstance(payload.get("counts"), dict) else {},
        "firstSafeAction": {
            "label": "Open this Photo Grove next cull card",
            "command": f"open '{html_path}'",
            "path": html_path,
            "safety": "Opens one local cull card. No originals, metadata, exports, uploads, delivery state, source mutation, delete, overwrite, approval, or receipt truth is changed.",
        },
        "firstDryRunAction": payload.get("firstDryRunAction") if isinstance(payload.get("firstDryRunAction"), dict) else {},
        "firstDryRunCommand": payload.get("firstDryRunCommand") or "",
        "firstDryRunDecision": payload.get("firstDryRunDecision") or payload.get("recommendedAction") or "",
        "firstDryRunSafety": payload.get("firstDryRunSafety") or "",
        "selectionDiagnostics": payload.get("selectionDiagnostics") if isinstance(payload.get("selectionDiagnostics"), dict) else {},
        "photoId": photo.get("photoId") or "",
        "truth": "Pointer to the latest next-cull card. It does not mutate originals or metadata."
    }
    write_json(photo_root / LATEST_POINTER, pointer)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build one safe Photo Grove next-cull card.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--photo-id", default="")
    args = parser.parse_args()

    photo_root = Path(args.photo_root)
    output_dir = photo_root / "NextCullCards" / stamp()
    output_dir.mkdir(parents=True, exist_ok=True)

    payload = build_payload(photo_root, args.photo_id)
    payload["jsonPath"] = str(output_dir / "photo-grove-next-cull-card.json")
    payload["markdownPath"] = str(output_dir / "START-HERE-photo-grove-next-cull-card.md")
    payload["htmlPath"] = str(output_dir / "index.html")
    payload["nextCullCardPath"] = payload["htmlPath"]
    payload["firstSafeAction"] = {
        "label": "Open this Photo Grove next cull card",
        "command": f"open '{payload['htmlPath']}'",
        "path": payload["htmlPath"],
        "safety": "Opens one local cull card. No originals, metadata, exports, uploads, delivery state, source mutation, delete, overwrite, approval, or receipt truth is changed.",
    }

    write_json(output_dir / "photo-grove-next-cull-card.json", payload)
    write_markdown(output_dir / "START-HERE-photo-grove-next-cull-card.md", payload)
    write_html(output_dir / "index.html", payload)
    write_pointer(photo_root, payload, output_dir)
    photo = payload.get("photo") if isinstance(payload.get("photo"), dict) else {}
    print(json.dumps({
        "status": payload.get("status"),
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "htmlPath": payload["htmlPath"],
        "photoId": photo.get("photoId") or "",
        "sourceExists": photo.get("sourceExists") or False,
        "selectionDiagnostics": payload.get("selectionDiagnostics") if isinstance(payload.get("selectionDiagnostics"), dict) else {},
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
