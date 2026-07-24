#!/usr/bin/env python3
"""Build a broad, read-only Photo Grove cull theater.

This is the larger "sit down and review a batch" surface for Photo Grove. It
composes existing review/cull/proof evidence into one Aftershoot-like local
review bench without writing metadata, selecting proof images, copying files,
exporting, delivering, uploading, publishing, or mutating originals.
"""
from __future__ import annotations

import csv
import html
import ast
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-cull-theater.json"
SCHEMA = "quipsly.photo-grove.cull-theater.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-grove-cull-theater")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists() or not path.is_file():
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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def path_to_uri(path_value: Any) -> str:
    path = Path(str(path_value or ""))
    if not path.exists():
        return ""
    try:
        return path.as_uri()
    except Exception:
        return ""


def first_list(packet: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    for key in keys:
        value = packet.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            for child_key in ["cards", "rows", "reviewRows", "sessionRows", "startHereQueue", "firstDecisionQueue", "candidates", "groups", "triageGroups"]:
                child = value.get(child_key)
                if isinstance(child, list):
                    return [item for item in child if isinstance(item, dict)]
    return []


def rows_from_nested(packet: dict[str, Any], *keys: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for key in keys:
        value = packet.get(key)
        if isinstance(value, list):
            rows.extend(item for item in value if isinstance(item, dict))
        elif isinstance(value, dict):
            for child_key in ["cards", "rows", "reviewRows", "sessionRows", "startHereQueue", "firstDecisionQueue", "candidates", "groups", "triageGroups"]:
                child = value.get(child_key)
                if isinstance(child, list):
                    rows.extend(item for item in child if isinstance(item, dict))
    return rows


def load_source_boards(control: dict[str, Any]) -> dict[str, dict[str, Any]]:
    boards: dict[str, dict[str, Any]] = {}
    for board in control.get("sourceBoards") or []:
        if not isinstance(board, dict):
            continue
        key = str(board.get("key") or "")
        path = Path(str(board.get("jsonPath") or ""))
        if key and path.exists() and path.is_file():
            loaded = load_json(path)
            if loaded:
                boards[key] = {**board, **loaded}
        elif key:
            boards[key] = board
    return boards


def photo_id(row: dict[str, Any]) -> str:
    return str(row.get("photoId") or row.get("id") or row.get("photo_id") or "")


def by_photo_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    indexed: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = photo_id(row)
        if key and key not in indexed:
            indexed[key] = row
    return indexed


def nonempty(*values: Any) -> str:
    for value in values:
        text = str(value or "")
        if text:
            return text
    return ""


def maybe_mapping(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    text = str(value or "").strip()
    if not (text.startswith("{") and text.endswith("}")):
        return {}
    try:
        parsed = ast.literal_eval(text)
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def normalize_phrase(value: Any, *, fallback: str = "") -> str:
    mapping = maybe_mapping(value)
    if mapping:
        for key in ["recommendation", "decision", "suggestedIntent", "intent", "priority", "reason", "tone"]:
            text = str(mapping.get(key) or "").strip()
            if text:
                return text.replace("-", " ")
        return fallback
    text = str(value or "").strip()
    return text.replace("_", " ") if text else fallback


def normalize_decision(value: Any) -> str:
    text = normalize_phrase(value, fallback="review").strip()
    lowered = text.lower()
    if lowered in {"compare sharpness", "sharpness review candidate", "quality review"}:
        return "review - compare sharpness"
    if lowered in {"review before proof", "hold for review before proof", "needs human cull"}:
        return "review source first"
    return text or "review"


def normalize_confidence(value: Any) -> str:
    text = normalize_phrase(value, fallback="").strip()
    if not text:
        return "review"
    try:
        float(text)
        return f"candidate score {text}"
    except Exception:
        return text


def normalize_route(value: Any) -> str:
    text = normalize_phrase(value, fallback="review").strip()
    if text == "raw":
        return "source RAW"
    return text or "review"


def thumbnail_uri(row: dict[str, Any]) -> str:
    uri = str(row.get("thumbnailUri") or "")
    if uri:
        return uri
    return path_to_uri(row.get("thumbnailPath"))


def command_count(commands: dict[str, str]) -> int:
    return sum(1 for value in commands.values() if value)


def dry_run_decision_command(photo_id_value: str, decision: str, rating: str, tags: str, note: str) -> str:
    if not photo_id_value:
        return ""
    return (
        "./script/agentctl.sh photo-grove-decision-dry-run "
        f"{shell_quote(photo_id_value)} {decision} {rating} {shell_quote(tags)} codex {shell_quote(note)}"
    )


def merge_photo_row(
    seed: dict[str, Any],
    *,
    cull: dict[str, dict[str, Any]],
    proof: dict[str, dict[str, Any]],
    quality: dict[str, dict[str, Any]],
    suggestions: dict[str, dict[str, Any]],
    keepers: dict[str, dict[str, Any]],
    rank: int,
) -> dict[str, Any]:
    key = photo_id(seed)
    cull_row = cull.get(key, {})
    proof_row = proof.get(key, {})
    quality_row = quality.get(key, {})
    suggestion_row = suggestions.get(key, {})
    keeper_row = keepers.get(key, {})
    source_path = nonempty(seed.get("sourcePath"), quality_row.get("sourcePath"), keeper_row.get("sourcePath"))
    source_command = nonempty(
        seed.get("openSourceCommand"),
        seed.get("sourceCommand"),
        cull_row.get("openSourceCommand"),
        proof_row.get("openSourceCommand"),
        quality_row.get("openSourceCommand"),
        suggestion_row.get("openSourceCommand"),
        keeper_row.get("openCommand"),
        f"open {shell_quote(source_path)}" if source_path else "",
    )
    dry_run_commands = cull_row.get("dryRunCommands") if isinstance(cull_row.get("dryRunCommands"), dict) else {}
    alternate_commands = suggestion_row.get("alternateDryRunCommands") if isinstance(suggestion_row.get("alternateDryRunCommands"), dict) else {}
    commands = {
        "recommended": nonempty(
            seed.get("firstDryRunCommand"),
            seed.get("suggestedDryRunCommand"),
            cull_row.get("firstDryRunCommand"),
            suggestion_row.get("firstDryRunCommand"),
            proof_row.get("firstDryRunCommand"),
            keeper_row.get("routeGroupReviewCommand"),
            dry_run_decision_command(key, "review", "-", "needs-human-cull", "Dry-run route for human source-aware cull; originals untouched."),
        ),
        "review": nonempty(
            seed.get("dryRunReviewCommand"),
            dry_run_commands.get("review"),
            alternate_commands.get("review"),
            dry_run_decision_command(key, "review", "-", "needs-human-cull", "Dry-run route for human source-aware cull; originals untouched."),
        ),
        "keep": nonempty(
            seed.get("dryRunKeep4Command"),
            dry_run_commands.get("keep"),
            alternate_commands.get("keep"),
            keeper_row.get("markKeepCommand"),
            dry_run_decision_command(key, "keep", "4", "keeper", "Dry-run keep after visual/source review; originals untouched."),
        ),
        "favorite": nonempty(
            seed.get("dryRunFavorite5Command"),
            dry_run_commands.get("favorite"),
            alternate_commands.get("favorite"),
            keeper_row.get("markFavoriteCommand"),
            dry_run_decision_command(key, "favorite", "5", "hero,keeper", "Dry-run favorite after visual/source review; originals untouched."),
        ),
        "reject": nonempty(
            seed.get("dryRunRejectCommand"),
            dry_run_commands.get("reject"),
            alternate_commands.get("reject"),
            dry_run_decision_command(key, "reject", "-", "reject-after-review", "Dry-run reject metadata after visual/source review; original remains untouched."),
        ),
    }
    flags = seed.get("qualityFlags")
    if not isinstance(flags, list):
        flags = quality_row.get("qualityFlags") if isinstance(quality_row.get("qualityFlags"), list) else proof_row.get("qualityFlags") if isinstance(proof_row.get("qualityFlags"), list) else keeper_row.get("qualityFlags") if isinstance(keeper_row.get("qualityFlags"), list) else []
    source_exists = bool(seed.get("sourceExists")) or bool(source_path and Path(source_path).exists()) or bool(source_command)
    thumb = nonempty(thumbnail_uri(seed), thumbnail_uri(cull_row), thumbnail_uri(proof_row), thumbnail_uri(quality_row), thumbnail_uri(suggestion_row), thumbnail_uri(keeper_row))
    route = normalize_route(nonempty(seed.get("attentionRoute"), seed.get("route"), quality_row.get("attentionRoute"), suggestion_row.get("attentionRoute"), proof_row.get("proofRoute")))
    recommended = normalize_decision(nonempty(seed.get("decisionBias"), seed.get("suggestedIntent"), cull_row.get("recommendedFirstDecision"), suggestion_row.get("suggestedIntent"), proof_row.get("recommendedFirstDecision"), keeper_row.get("cullSuggestion"), "review"))
    confidence = normalize_confidence(nonempty(cull_row.get("confidence"), suggestion_row.get("confidence"), keeper_row.get("candidateScore")))
    proof_route = normalize_route(nonempty(proof_row.get("proofRoute"), keeper_row.get("kind")))
    proof_fit = normalize_confidence(nonempty(proof_row.get("proofFit"), keeper_row.get("candidateScore")))
    return {
        "rank": rank,
        "photoId": key,
        "filename": nonempty(seed.get("filename"), cull_row.get("filename"), proof_row.get("filename"), quality_row.get("filename"), suggestion_row.get("filename"), keeper_row.get("filename")),
        "reviewGroupId": nonempty(seed.get("reviewGroupId"), seed.get("group"), cull_row.get("reviewGroupId"), proof_row.get("reviewGroupId"), quality_row.get("reviewGroupId"), suggestion_row.get("reviewGroupId"), keeper_row.get("groupId")),
        "route": route,
        "recommendedFirstDecision": recommended,
        "confidence": confidence,
        "reviewPrompt": nonempty(seed.get("humanQuestion"), seed.get("reviewPrompt"), cull_row.get("humanQuestion"), proof_row.get("humanQuestion"), quality_row.get("humanQuestion"), keeper_row.get("reviewPrompt")),
        "qualityNote": nonempty(seed.get("qualityNote"), proof_row.get("qualityNote"), quality_row.get("qualityNote"), keeper_row.get("qualityNote")),
        "qualityFlags": flags,
        "proofRoute": proof_route,
        "proofFit": proof_fit,
        "thumbnailUri": thumb,
        "sourcePath": source_path,
        "sourceCommand": source_command,
        "sourcePathExists": source_exists,
        "thumbnailExists": bool(seed.get("thumbnailExists")) or bool(thumb),
        "commands": commands,
        "commandCount": command_count(commands),
        "safeNextAction": nonempty(cull_row.get("safeNextAction"), seed.get("nextSafestAction"), "Review the image, compare neighbor evidence, and only rehearse dry-run decisions unless Charlie approves metadata writes."),
        "truth": "Cull theater row only. This previews local evidence and dry-run actions without changing originals, metadata, sidecars, proof sets, exports, or receipts.",
    }


def build_group_rows(boards: dict[str, dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    for source_key in ["reviewBatch", "contactSheet", "firstPassTriage"]:
        board = boards.get(source_key, {})
        for group in first_list(board, "groups", "triageGroups")[:limit]:
            samples = [sample for sample in group.get("samples") or [] if isinstance(sample, dict)]
            sample_thumbs = [thumbnail_uri(sample) for sample in samples if thumbnail_uri(sample)]
            groups.append({
                "source": source_key,
                "rank": group.get("rank") or len(groups) + 1,
                "groupId": str(group.get("groupId") or ""),
                "priority": str(group.get("priority") or group.get("recommendedReviewMode") or group.get("reviewMode") or ""),
                "reviewPrompt": str(group.get("firstPassPrompt") or group.get("reviewPrompt") or group.get("nextSafestAction") or ""),
                "qualityFlags": group.get("qualityFlags") if isinstance(group.get("qualityFlags"), list) else [],
                "sampleCount": len(samples) or int(group.get("sampleCount") or group.get("size") or 0),
                "flaggedCount": int(group.get("flaggedCount") or 0),
                "thumbnailUris": sample_thumbs[:6],
                "command": str(group.get("openCommand") or (group.get("commands") or {}).get("open") if isinstance(group.get("commands"), dict) else ""),
                "truth": "Group context only. Use this to compare related photos before any explicit metadata decision.",
            })
            if len(groups) >= limit:
                return groups
    return groups


def build(root: Path = DEFAULT_ROOT, limit: int = 48) -> dict[str, Any]:
    control = load_pointer_target(root / "latest-photo-grove-control-room.json")
    boards = load_source_boards(control)
    counts = control.get("counts") if isinstance(control.get("counts"), dict) else {}

    cull_cards = rows_from_nested(control, "cullDecisionCards")
    proof_cards = rows_from_nested(control, "proofCandidateCards")
    quality_cards = rows_from_nested(control, "qualityEvidenceCards")
    suggestions = rows_from_nested(control, "suggestedFirstPassDecisions")
    recipe_rows = rows_from_nested(control, "firstReviewRecipe")
    review_session_rows = rows_from_nested(boards.get("reviewSession", {}), "startHereQueue", "sessionRows", "rows", "firstDecisionQueue")
    keeper_rows = rows_from_nested(boards.get("firstKeepers", {}), "candidates")
    keeper_desk_rows = rows_from_nested(boards.get("keeperDesk", {}), "firstKeeperCandidates")

    seed_rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source_rows in [review_session_rows, recipe_rows, cull_cards, proof_cards, quality_cards, suggestions, keeper_rows, keeper_desk_rows]:
        for row in source_rows:
            key = photo_id(row)
            if not key or key in seen:
                continue
            seed_rows.append(row)
            seen.add(key)
            if len(seed_rows) >= limit:
                break
        if len(seed_rows) >= limit:
            break

    cull_by_id = by_photo_id(cull_cards)
    proof_by_id = by_photo_id(proof_cards)
    quality_by_id = by_photo_id(quality_cards)
    suggestions_by_id = by_photo_id(suggestions)
    keepers_by_id = by_photo_id(keeper_rows + keeper_desk_rows)
    theater_rows = [
        merge_photo_row(
            row,
            cull=cull_by_id,
            proof=proof_by_id,
            quality=quality_by_id,
            suggestions=suggestions_by_id,
            keepers=keepers_by_id,
            rank=index,
        )
        for index, row in enumerate(seed_rows, 1)
    ]
    group_rows = build_group_rows(boards, min(16, max(6, limit // 3)))
    ready = bool(theater_rows and int(counts.get("sourcePhotos") or 0) > 0)
    truth = {
        "description": "Photo Grove cull theater only. It composes existing review/cull evidence into a local proof surface.",
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
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "photo-grove-cull-theater-ready" if ready else "photo-grove-cull-theater-needs-control-room",
        "photoRoot": str(root),
        "label": "Photo Grove cull theater",
        "humanAsk": "Review a broader photo batch calmly. Compare groups, inspect thumbnails/source paths, rehearse dry-run keep/reject/review/favorite actions, and do not write metadata until explicitly approved.",
        "nextSafestAction": "Open the theater, review the first group, and use dry-run commands only. If a real decision is approved later, write it through the existing decision tools, not by editing originals.",
        "groupRows": group_rows,
        "theaterRows": theater_rows,
        "counts": {
            "sourcePhotos": int(counts.get("sourcePhotos") or 0),
            "pending": int(counts.get("pending") or 0),
            "qualityAttention": int(counts.get("qualityAttention") or 0),
            "cullDecisionCards": len(cull_cards),
            "proofCandidateCards": len(proof_cards),
            "qualityEvidenceCards": len(quality_cards),
            "suggestedFirstPassRows": len(suggestions),
            "reviewSessionRows": len(review_session_rows),
            "firstKeeperCandidates": len(keeper_rows) + len(keeper_desk_rows),
            "groupRows": len(group_rows),
            "theaterRows": len(theater_rows),
            "thumbnailRows": len([row for row in theater_rows if row.get("thumbnailExists")]),
            "sourceExistsRows": len([row for row in theater_rows if row.get("sourcePathExists")]),
            "dryRunCommands": sum(int(row.get("commandCount") or 0) for row in theater_rows),
            "selectedForClientProof": int(counts.get("selectedForClientProof") or 0),
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
        },
        "firstSafeAction": {
            "label": "Open Photo Grove cull theater",
            "command": "",
            "path": "",
            "safety": "Opens local photo review evidence only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, source mutation, delete, overwrite, or receipt truth.",
        },
        "truth": truth,
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    lines = [
        "# Photo Grove cull theater",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Source photos: `{counts.get('sourcePhotos')}`",
        f"- Theater rows: `{counts.get('theaterRows')}`",
        f"- Group rows: `{counts.get('groupRows')}`",
        f"- Thumbnail rows: `{counts.get('thumbnailRows')}`",
        f"- Source-evidence rows: `{counts.get('sourceExistsRows')}`",
        "",
        "## Human ask",
        str(payload.get("humanAsk") or ""),
        "",
        "## Safety",
        "Read-only theater. No original, metadata, sidecar, proof set, copy, export, delivery, external account, or receipt truth is changed.",
        "",
        "## First rows",
    ]
    for row in (payload.get("theaterRows") or [])[:24]:
        commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
        lines.extend([
            f"### {row.get('rank')}. {row.get('filename')}",
            f"- Photo ID: `{row.get('photoId')}`",
            f"- Group: `{row.get('reviewGroupId')}`",
            f"- Suggested decision: `{row.get('recommendedFirstDecision')}`",
            f"- Prompt: {row.get('reviewPrompt')}",
            f"- Open source: `{row.get('sourceCommand')}`",
            f"- Dry-run review: `{commands.get('review') or commands.get('recommended')}`",
            "",
        ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    groups_html = []
    for group in payload.get("groupRows") or []:
        thumbs = "".join(f"<img src='{esc(uri)}' alt='group sample'>" for uri in group.get("thumbnailUris") or [])
        flags = ", ".join(str(flag) for flag in group.get("qualityFlags") or [])
        groups_html.append(f"""
        <article class="group-card">
          <div class="eyebrow">Group {esc(group.get('groupId'))} - {esc(group.get('source'))}</div>
          <h3>{esc(group.get('priority') or 'review group')}</h3>
          <p>{esc(group.get('reviewPrompt') or 'Compare the samples before making any decision.')}</p>
          <div class="sample-strip">{thumbs}</div>
          <p class="small">{esc(group.get('sampleCount'))} sample(s), {esc(group.get('flaggedCount'))} flagged. {esc(flags)}</p>
        </article>""")
    rows_html = []
    for row in payload.get("theaterRows") or []:
        commands = row.get("commands") if isinstance(row.get("commands"), dict) else {}
        flags = ", ".join(str(flag) for flag in row.get("qualityFlags") or [])
        source_link = path_to_uri(row.get("sourcePath"))
        rows_html.append(f"""
        <article class="photo-card">
          <div class="thumb">{f"<img src='{esc(row.get('thumbnailUri'))}' alt='thumbnail'>" if row.get('thumbnailUri') else "<span>No thumbnail</span>"}</div>
          <div class="photo-body">
            <div class="eyebrow">Row {esc(row.get('rank'))} - {esc(row.get('route'))}</div>
            <h2>{esc(row.get('filename'))}</h2>
            <p>{esc(row.get('reviewPrompt') or row.get('safeNextAction'))}</p>
            <div class="chips">
              <span>{esc(row.get('recommendedFirstDecision'))}</span>
              <span>{esc(row.get('reviewGroupId'))}</span>
              <span>{esc(row.get('confidence'))}</span>
              <span>{esc(row.get('proofRoute'))}</span>
              <span>{'source ok' if row.get('sourcePathExists') else 'source needs check'}</span>
            </div>
            <p class="small"><b>Quality:</b> {esc(row.get('qualityNote') or flags or 'No extra quality note.')}</p>
            <details><summary>Dry-run actions</summary>
              <code>{esc(commands.get('recommended') or '')}</code>
              <code>{esc(commands.get('review') or '')}</code>
              <code>{esc(commands.get('keep') or '')}</code>
              <code>{esc(commands.get('favorite') or '')}</code>
              <code>{esc(commands.get('reject') or '')}</code>
            </details>
            <p class="small"><b>Open source:</b> {f"<a href='{esc(source_link)}'>open file</a>" if source_link else ''}<code>{esc(row.get('sourceCommand'))}</code></p>
          </div>
        </article>""")
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Cull Theater</title>
  <style>
    :root {{ color-scheme: dark; --ink:#f9efd2; --muted:#cfc5a8; --paper:#14221b; --leaf:#90c985; --moss:#365440; --gold:#e9c75e; --clay:#d9794f; --line:#3b5747; --shadow:rgba(0,0,0,.38); }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at 8% -8%, #52745b, #18251d 38%, #17100d 86%); color:var(--ink); }}
    main {{ max-width: 1440px; margin: 32px auto; padding: 0 24px 72px; }}
    .hero {{ border:1px solid var(--line); border-radius:34px; padding:30px; background:linear-gradient(135deg, rgba(28,45,35,.96), rgba(35,27,19,.92)); box-shadow:0 28px 90px var(--shadow); }}
    .eyebrow {{ color:var(--gold); font-weight:950; letter-spacing:.24em; text-transform:uppercase; font-size:12px; }}
    h1 {{ font: 950 clamp(42px,5.6vw,78px)/.92 ui-serif, Georgia, serif; margin:10px 0 12px; color:#fff8dc; }}
    h2, h3 {{ margin:4px 0 8px; color:#fff7d6; }}
    .meta, .chips {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .meta span, .chips span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.075); font-weight:900; font-size:12px; }}
    .section-title {{ display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin:30px 0 12px; }}
    .group-grid {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(280px,1fr)); gap:14px; }}
    .group-card, .photo-card {{ border:1px solid var(--line); background:rgba(255,255,255,.052); box-shadow:0 14px 46px rgba(0,0,0,.18); }}
    .group-card {{ border-radius:24px; padding:16px; }}
    .sample-strip {{ display:grid; grid-template-columns: repeat(6,1fr); gap:5px; min-height:54px; }}
    .sample-strip img {{ width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; }}
    .photo-list {{ display:grid; grid-template-columns: repeat(auto-fit, minmax(460px,1fr)); gap:14px; }}
    .photo-card {{ display:grid; grid-template-columns: 180px 1fr; gap:16px; border-radius:26px; padding:16px; }}
    .thumb {{ background:#0d120f; border-radius:18px; min-height:158px; display:grid; place-items:center; overflow:hidden; }}
    .thumb img {{ width:100%; height:100%; object-fit:cover; display:block; }}
    .small {{ color:var(--muted); font-size:13px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.28); border:1px solid var(--line); border-radius:12px; padding:10px; color:#fff6d8; }}
    details {{ margin-top:10px; }}
    summary {{ cursor:pointer; color:var(--leaf); font-weight:950; }}
    a {{ color:#bee9af; }}
    .truth {{ margin-top:22px; color:#ddd2b4; border-top:1px solid var(--line); padding-top:16px; }}
    @media(max-width:760px) {{ .photo-list {{ grid-template-columns:1fr; }} .photo-card {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main>
  <section class="hero">
    <div class="eyebrow">Photo Grove Cull Theater</div>
    <h1>Review broadly. Decide gently. Preserve the originals.</h1>
    <p>{esc(payload.get('humanAsk'))}</p>
    <div class="meta">
      <span>{esc(payload.get('status'))}</span>
      <span>{esc(counts.get('sourcePhotos'))} source photos</span>
      <span>{esc(counts.get('theaterRows'))} review rows</span>
      <span>{esc(counts.get('groupRows'))} groups</span>
      <span>{esc(counts.get('thumbnailRows'))} thumbnails</span>
      <span>{esc(counts.get('dryRunCommands'))} dry-run actions</span>
    </div>
  </section>
  <section>
    <div class="section-title"><div><div class="eyebrow">First pass groups</div><h2>Compare neighbors before deciding.</h2></div></div>
    <div class="group-grid">{''.join(groups_html)}</div>
  </section>
  <section>
    <div class="section-title"><div><div class="eyebrow">Cull theater rows</div><h2>One calm decision at a time.</h2></div></div>
    <div class="photo-list">{''.join(rows_html)}</div>
  </section>
  <p class="truth">Truth boundary: this theater is local evidence only. No original, metadata, sidecar, proof selection, copy, export, delivery, upload, schedule, publication, account, receipt, delete, or overwrite truth was created.</p>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    rows = payload.get("theaterRows") if isinstance(payload.get("theaterRows"), list) else []
    with path.open("w", newline="", encoding="utf-8") as handle:
        fields = ["rank", "photoId", "filename", "reviewGroupId", "route", "recommendedFirstDecision", "reviewPrompt", "sourceCommand", "thumbnailExists", "sourcePathExists"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Build Photo Grove cull theater.")
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--limit", type=int, default=48)
    args = parser.parse_args()
    root = Path(args.root).expanduser().resolve()
    payload = build(root, args.limit)
    out_dir = root / "CullTheaters" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "photo-grove-cull-theater.json"
    markdown_path = out_dir / "START-HERE-photo-grove-cull-theater.md"
    html_path = out_dir / "index.html"
    csv_path = out_dir / "photo-grove-cull-theater.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Photo Grove cull theater",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local photo review evidence only. No metadata write, proof selection, copy, export, delivery, upload, publication, schedule, source mutation, delete, overwrite, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    write_csv(csv_path, payload)
    pointer_payload = {
        "schema": "quipsly.photo-grove.latest-cull-theater.v1",
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
    }
    write_json(root / LATEST_POINTER, pointer_payload)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0 if payload.get("status") == "photo-grove-cull-theater-ready" else 1


if __name__ == "__main__":
    raise SystemExit(main())
