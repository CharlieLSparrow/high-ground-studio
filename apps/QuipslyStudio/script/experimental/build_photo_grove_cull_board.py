#!/usr/bin/env python3
"""Build a reviewer-facing Photo Grove Cull Board.

This is the calm "start culling here" surface that sits on top of the existing
Photo Grove decision desk. It does not analyze photos itself and it does not
write review decisions. It reads the current metadata/thumbnail state, exposes
candidate cards, and keeps dry-run actions close at hand so humans and agents
can inspect before making metadata-only decisions.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.cull-board.v1"
LATEST_POINTER = "latest-photo-grove-cull-board.json"
LATEST_ALIAS_POINTERS = [
    "latest-photo-grove-board.json",
    "latest-photo-cull-board.json",
]


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-cull-board")


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


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path_value: str) -> str:
    if not path_value:
        return ""
    try:
        return Path(path_value).resolve().as_uri()
    except Exception:
        return path_value


def parse_jsonish_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    text = str(value or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except Exception:
        pass
    return [part.strip() for part in text.split(",") if part.strip()]


def load_decision_desk(photo_root: Path) -> tuple[dict[str, Any], Path]:
    pointer = load_json(photo_root / "latest-photo-grove-decision-desk.json")
    target = Path(str(pointer.get("jsonPath") or ""))
    desk = load_json(target) if target.exists() else pointer
    if not desk:
        raise SystemExit(f"No Photo Grove decision desk found at {photo_root / LATEST_POINTER}. Run photo-grove-decision-desk first.")
    return desk, target if target.exists() else photo_root / "latest-photo-grove-decision-desk.json"


def read_candidate_rows(desk: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    csv_path = Path(str(desk.get("candidatesCsvPath") or ""))
    rows: list[dict[str, Any]] = []
    if csv_path.exists():
        with csv_path.open(newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for raw in reader:
                source_path = str(raw.get("sourcePath") or "")
                thumbnail_path = str(raw.get("thumbnailPath") or "")
                rows.append({
                    "photoId": raw.get("photoId") or "",
                    "filename": raw.get("filename") or "",
                    "status": raw.get("status") or "pending",
                    "reviewGroupId": raw.get("reviewGroupId") or "",
                    "sourcePath": source_path,
                    "thumbnailPath": thumbnail_path,
                    "thumbnailUri": file_uri(thumbnail_path),
                    "qualityNote": raw.get("qualityNote") or "",
                    "flags": parse_jsonish_list(raw.get("flags")),
                    "qualityFlags": parse_jsonish_list(raw.get("qualityFlags")),
                    "openSourceCommand": raw.get("openSourceCommand") or (f"open -R {shell_quote(source_path)}" if source_path else ""),
                    "dryRunReviewCommand": raw.get("dryRunReviewCommand") or "",
                    "dryRunKeep4Command": raw.get("dryRunKeep4Command") or "",
                    "dryRunFavorite5Command": raw.get("dryRunFavorite5Command") or "",
                    "dryRunRejectCommand": raw.get("dryRunRejectCommand") or "",
                    "truth": "Candidate card only. Inspect visually before executing any metadata decision.",
                })
                if len(rows) >= limit:
                    break
    return rows


def choose_status(counts: dict[str, Any], candidate_rows: list[dict[str, Any]]) -> str:
    if not candidate_rows:
        selected = int(counts.get("selectedForClientProof") or 0)
        pending = int(counts.get("pending") or 0)
        if selected and not pending:
            return "cull-board-selected-review"
        return "cull-board-needs-candidates"
    review = int(counts.get("review") or 0)
    pending = int(counts.get("pending") or 0)
    if review:
        return "cull-board-review-routed"
    if pending:
        return "cull-board-ready"
    return "cull-board-ready"


def start_here_today(candidate_rows: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    if not candidate_rows:
        return {
            "mode": "rebuild-candidates",
            "title": "Rebuild Photo Grove Decision Desk",
            "why": "The cull board has no candidate rows, so the safest move is to refresh the decision evidence before judging photos.",
            "recommendedMove": "rebuild-decision-desk",
            "safeCommand": "./script/agentctl.sh photo-grove-decision-desk",
            "humanQuestion": "Do we have the latest review session and thumbnails before making any cull decisions?",
            "agentMove": "Refresh read-only boards and validate paths; do not execute metadata decisions.",
        }
    source_first = next((row for row in candidate_rows if row.get("openSourceCommand") and (row.get("qualityFlags") or row.get("flags"))), candidate_rows[0])
    status = str(source_first.get("status") or "pending")
    if status == "review":
        recommended = "compare-review-routed-photo"
    else:
        recommended = "inspect-before-routing"
    return {
        "mode": "inspect-first-candidate",
        "title": source_first.get("filename") or "First cull candidate",
        "why": "Start with one visible candidate, compare thumbnail/source evidence, and rehearse the decision before writing metadata.",
        "recommendedMove": recommended,
        "safeCommand": source_first.get("openSourceCommand") or source_first.get("dryRunReviewCommand") or "",
        "humanQuestion": "Is this a keep, favorite, reject, or review item after source-aware visual comparison?",
        "agentMove": "Prepare a comparison note and dry-run command; do not mutate originals or write the live decision unless explicitly approved.",
        "photoId": source_first.get("photoId") or "",
        "reviewGroupId": source_first.get("reviewGroupId") or "",
        "countsContext": {
            "candidateRows": len(candidate_rows),
            "pending": counts.get("pending", 0),
            "review": counts.get("review", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
        },
    }


def classify_attention(row: dict[str, Any]) -> dict[str, Any]:
    flags = [str(flag).lower() for flag in [*(row.get("flags") or []), *(row.get("qualityFlags") or [])]]
    note = str(row.get("qualityNote") or "").lower()
    status = str(row.get("status") or "").lower()
    filename = str(row.get("filename") or "").lower()
    text = " ".join([*flags, note, status, filename])
    reasons: list[str] = []

    if not row.get("thumbnailPath") or "missing thumbnail" in text or "no thumbnail" in text:
        reasons.append("thumbnail missing or incomplete")
    if not row.get("sourcePath"):
        reasons.append("source path missing from candidate evidence")
    if any(token in text for token in ("blank", "clipping", "overexposed", "underexposed", "exposure", "dark", "blur", "blurry", "soft", "suspect", "technical")):
        reasons.append("quality or technical issue hint")
    if any(token in text for token in ("duplicate", "near-duplicate", "sequence", "burst", "similar")):
        reasons.append("possible duplicate/sequence comparison")
    if status in {"keep", "favorite"} or any(token in text for token in ("keeper", "favorite", "hero")):
        reasons.append("possible client-proof candidate")
    if status == "review":
        reasons.append("already routed to human review")

    if "thumbnail missing or incomplete" in reasons or "source path missing from candidate evidence" in reasons:
        route = "source-inspection-needed"
        decision_bias = "Reveal source or rebuild thumbnail evidence before any keep/reject decision."
    elif "quality or technical issue hint" in reasons:
        route = "quality-problem-review"
        decision_bias = "Prefer review/source inspection before reject; thumbnails can lie."
    elif "possible duplicate/sequence comparison" in reasons:
        route = "near-duplicate-sequence"
        decision_bias = "Compare the group before choosing one keep/favorite or metadata reject."
    elif "possible client-proof candidate" in reasons:
        route = "keeper-proof-candidate"
        decision_bias = "Can feed proof/export prep after deliberate visual review; not client approval."
    elif "already routed to human review" in reasons:
        route = "human-review-routed"
        decision_bias = "Open source evidence and decide keep/favorite/reject/review as metadata only."
    else:
        route = "pending-cull"
        decision_bias = "Inspect visually, compare nearby frames, then choose a metadata-only route."

    return {
        "attentionRoute": route,
        "attentionReasons": reasons or ["no specific automated hint; needs normal visual cull"],
        "decisionBias": decision_bias,
        "truth": "Attention route only. This is not a keep/reject verdict and does not write metadata.",
    }


def build_attention_routes(candidate_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    route_meta = {
        "source-inspection-needed": {
            "label": "Source inspection needed",
            "why": "Evidence is incomplete or thumbnails may be missing; reveal/rebuild before decisions.",
            "humanQuestion": "Can the source file be opened and judged directly?",
        },
        "quality-problem-review": {
            "label": "Quality/problem review",
            "why": "Blur, exposure, clipping, blank, or technical hints route attention here.",
            "humanQuestion": "Is the issue real in the source, recoverable, or only a thumbnail artifact?",
        },
        "near-duplicate-sequence": {
            "label": "Duplicate/sequence comparison",
            "why": "Likely related frames should be compared as a group before keep/reject choices.",
            "humanQuestion": "Which frame best tells the story, and should the rest remain review or metadata reject?",
        },
        "keeper-proof-candidate": {
            "label": "Keeper/proof candidate",
            "why": "Existing metadata or hints suggest this could feed proof/export prep after review.",
            "humanQuestion": "Would you be comfortable showing this to a client after source-aware review?",
        },
        "human-review-routed": {
            "label": "Already routed to review",
            "why": "These need human judgment before becoming keep/favorite/reject metadata.",
            "humanQuestion": "What decision would reduce uncertainty without pretending client approval happened?",
        },
        "pending-cull": {
            "label": "Pending cull",
            "why": "No strong automated hint; inspect normally and keep the decision reversible.",
            "humanQuestion": "Is this worth keeping, favoriting, rejecting as metadata, or routing for later review?",
        },
    }
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in candidate_rows:
        route = str(row.get("attentionRoute") or "pending-cull")
        grouped.setdefault(route, []).append(row)
    order = [
        "source-inspection-needed",
        "quality-problem-review",
        "near-duplicate-sequence",
        "keeper-proof-candidate",
        "human-review-routed",
        "pending-cull",
    ]
    routes: list[dict[str, Any]] = []
    for route_id in order:
        rows = grouped.get(route_id, [])
        meta = route_meta[route_id]
        routes.append({
            "id": route_id,
            "label": meta["label"],
            "count": len(rows),
            "why": meta["why"],
            "humanQuestion": meta["humanQuestion"],
            "samplePhotoIds": [row.get("photoId") for row in rows[:8]],
            "sampleFilenames": [row.get("filename") for row in rows[:8]],
            "safeNextAction": "Open contact sheet/review session, compare visually, and use dry-run metadata commands first.",
            "truth": "Attention lane only. No originals, metadata, export, delivery, upload, or publication state changes.",
        })
    return routes


def build_packet(photo_root: Path, limit: int) -> dict[str, Any]:
    desk, desk_path = load_decision_desk(photo_root)
    contact_pointer = load_json(photo_root / "latest-photo-grove-contact-sheet.json")
    contact_counts = contact_pointer.get("counts") if isinstance(contact_pointer.get("counts"), dict) else {}
    counts = desk.get("counts") if isinstance(desk.get("counts"), dict) else {}
    candidate_rows = read_candidate_rows(desk, limit)
    for row in candidate_rows:
        row.update(classify_attention(row))
    attention_routes = build_attention_routes(candidate_rows)
    status = choose_status(counts, candidate_rows)
    start = start_here_today(candidate_rows, counts)
    contact_html = str(contact_pointer.get("htmlPath") or "")
    contact_json = str(contact_pointer.get("jsonPath") or "")
    primary_visual_review = {
        "label": "Open visual contact sheet first" if contact_html else "Build visual contact sheet first",
        "path": contact_html,
        "command": f"open {shell_quote(contact_html)}" if contact_html else "./script/agentctl.sh photo-grove-contact-sheet 12",
        "why": (
            "The contact sheet shows grouped visual comparisons before metadata decisions, which is the closest current Photo Grove surface to an Aftershoot-style culling pass."
            if contact_html
            else "No current contact sheet pointer was found, so build one before making review decisions from isolated cards."
        ),
        "safety": "Local review evidence only. No originals, metadata decisions, exports, delivery, upload, publication, delete, or overwrite occurs.",
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "photoRoot": str(photo_root),
        "sourceDecisionDeskJson": str(desk_path),
        "sourceDecisionDeskHtml": desk.get("htmlPath") or "",
        "sourceCandidatesCsvPath": desk.get("candidatesCsvPath") or "",
        "truth": "Cull board only. Originals are never mutated, moved, deleted, exported, uploaded, published, or delivered.",
        "counts": {
            "total": counts.get("total", 0),
            "pending": counts.get("pending", 0),
            "review": counts.get("review", 0),
            "keep": counts.get("keep", 0),
            "favorite": counts.get("favorite", 0),
            "reject": counts.get("reject", 0),
            "candidateRows": len(candidate_rows),
            "attentionRoutes": len(attention_routes),
            "sourceInspectionNeeded": next((route["count"] for route in attention_routes if route["id"] == "source-inspection-needed"), 0),
            "qualityProblemReview": next((route["count"] for route in attention_routes if route["id"] == "quality-problem-review"), 0),
            "nearDuplicateSequence": next((route["count"] for route in attention_routes if route["id"] == "near-duplicate-sequence"), 0),
            "keeperProofCandidates": next((route["count"] for route in attention_routes if route["id"] == "keeper-proof-candidate"), 0),
            "contactSheetGroups": contact_counts.get("contactSheetGroups", 0),
            "contactSheetSamples": contact_counts.get("contactSheetSamples", 0),
            "selectedForClientProof": counts.get("selectedForClientProof", 0),
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
            "clientDeliveryCreated": False,
        },
        "candidateRows": candidate_rows,
        "attentionRoutes": attention_routes,
        "attentionRoutingContract": {
            "plain": "Photo Grove routes attention; it does not make final keep/reject calls from heuristics.",
            "routesAreVerdicts": False,
            "humanReviewRequiredForMetadataDecision": True,
            "dryRunBeforeLiveMetadata": True,
            "clientApprovalCreatedHere": False,
        },
        "startHereToday": start,
        "primaryVisualReview": primary_visual_review,
        "sourcePointers": {
            "decisionDeskHtml": desk.get("htmlPath") or "",
            "decisionDeskJson": str(desk_path),
            "candidatesCsvPath": desk.get("candidatesCsvPath") or "",
            "contactSheetHtml": contact_html,
            "contactSheetJson": contact_json,
        },
        "humanAsk": "Open the cull board, compare candidate thumbnails/source files, and choose keep, favorite, reject, or review only after visual/source-aware inspection.",
        "agentSafeParallelWork": "Codex can improve candidate notes, grouping, quality hints, dry-run commands, and review packets. It must not execute live cull decisions, mutate originals, export, upload, publish, or create client delivery state.",
        "nextSafestAction": "Open the cull board, inspect candidates visually, use dry-run commands first, then record metadata-only decisions only after review.",
    }


def prepare_output(photo_root: Path) -> Path:
    out_dir = photo_root / "CullBoard" / stamp()
    counter = 2
    base = out_dir
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = [
        "photoId",
        "filename",
        "status",
        "reviewGroupId",
        "qualityNote",
        "flags",
        "qualityFlags",
        "attentionRoute",
        "attentionReasons",
        "decisionBias",
        "thumbnailPath",
        "sourcePath",
        "dryRunReviewCommand",
        "dryRunKeep4Command",
        "dryRunFavorite5Command",
        "dryRunRejectCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("candidateRows") or []:
            writer.writerow({
                "photoId": row.get("photoId") or "",
                "filename": row.get("filename") or "",
                "status": row.get("status") or "",
                "reviewGroupId": row.get("reviewGroupId") or "",
                "qualityNote": row.get("qualityNote") or "",
                "flags": ", ".join(row.get("flags") or []),
                "qualityFlags": ", ".join(row.get("qualityFlags") or []),
                "attentionRoute": row.get("attentionRoute") or "",
                "attentionReasons": ", ".join(row.get("attentionReasons") or []),
                "decisionBias": row.get("decisionBias") or "",
                "thumbnailPath": row.get("thumbnailPath") or "",
                "sourcePath": row.get("sourcePath") or "",
                "dryRunReviewCommand": row.get("dryRunReviewCommand") or "",
                "dryRunKeep4Command": row.get("dryRunKeep4Command") or "",
                "dryRunFavorite5Command": row.get("dryRunFavorite5Command") or "",
                "dryRunRejectCommand": row.get("dryRunRejectCommand") or "",
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    start = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    lines = [
        "# Photo Grove Cull Board",
        "",
        f"- Generated: `{packet['generatedAt']}`",
        f"- Status: `{packet['status']}`",
        f"- Total indexed photos: `{counts['total']}`",
        f"- Candidate cards: `{counts['candidateRows']}`",
        f"- Pending: `{counts['pending']}`",
        f"- Review-routed: `{counts['review']}`",
        f"- Keep/favorite: `{int(counts.get('keep') or 0) + int(counts.get('favorite') or 0)}`",
        "",
        packet["truth"],
        "",
        f"Human ask: {packet.get('humanAsk') or ''}",
        "",
        f"Codex can keep going: {packet.get('agentSafeParallelWork') or ''}",
        "",
        "## Start here",
        "",
        f"- Visual review first: `{(packet.get('primaryVisualReview') or {}).get('label')}`",
        f"- Visual review command: `{(packet.get('primaryVisualReview') or {}).get('command')}`",
        f"- Visual review safety: {(packet.get('primaryVisualReview') or {}).get('safety')}",
        "",
        f"- Mode: `{start.get('mode')}`",
        f"- Photo/task: `{start.get('title')}`",
        f"- Why: {start.get('why')}",
        f"- Recommended move: `{start.get('recommendedMove')}`",
        f"- Safe command: `{start.get('safeCommand')}`",
        f"- Human question: {start.get('humanQuestion')}",
        f"- Codex-safe move: {start.get('agentMove')}",
        "",
        "## Board protocol",
        "",
        "1. Open the HTML board.",
        "2. Compare candidate thumbnails and reveal originals only when needed.",
        "3. Run dry-run commands before real metadata decisions.",
        "4. Never treat a thumbnail-quality hint as an automatic keep/reject verdict.",
        "",
        "## Attention routing",
        "",
        (packet.get("attentionRoutingContract") or {}).get("plain", ""),
        "",
    ]
    for route in packet.get("attentionRoutes") or []:
        lines.extend([
            f"### {route.get('label')}",
            f"- Count: `{route.get('count')}`",
            f"- Why: {route.get('why')}",
            f"- Human question: {route.get('humanQuestion')}",
            f"- Safe next action: {route.get('safeNextAction')}",
            f"- Sample filenames: `{', '.join(route.get('sampleFilenames') or [])}`",
            "",
        ])
    lines.extend([
        "## First candidates",
        "",
    ])
    for row in (packet.get("candidateRows") or [])[:12]:
        lines.append(f"- `{row.get('filename')}` - `{row.get('status')}` - `{row.get('attentionRoute')}` - {row.get('decisionBias') or row.get('qualityNote') or 'inspect visually'}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    start = packet.get("startHereToday") if isinstance(packet.get("startHereToday"), dict) else {}
    route_sections = []
    for route in packet.get("attentionRoutes") or []:
        route_sections.append(f"""
        <article class="route-card">
          <div class="route-count">{esc(route.get('count'))}</div>
          <h3>{esc(route.get('label'))}</h3>
          <p>{esc(route.get('why'))}</p>
          <p><b>Human question:</b> {esc(route.get('humanQuestion'))}</p>
          <details><summary>Samples</summary><code>{esc(', '.join(route.get('sampleFilenames') or []))}</code></details>
        </article>
        """)
    cards: list[str] = []
    for row in packet.get("candidateRows") or []:
        thumb = row.get("thumbnailUri") or ""
        image = f"<img src='{esc(thumb)}' alt='{esc(row.get('filename'))}'>" if thumb else "<div class='missing'>No thumbnail</div>"
        flags = "".join(f"<span>{esc(flag)}</span>" for flag in (row.get("qualityFlags") or row.get("flags") or [])[:6])
        commands = [
            ("Dry-run review", row.get("dryRunReviewCommand") or ""),
            ("Dry-run keep", row.get("dryRunKeep4Command") or ""),
            ("Dry-run favorite", row.get("dryRunFavorite5Command") or ""),
            ("Dry-run reject", row.get("dryRunRejectCommand") or ""),
        ]
        command_html = "".join(
            f"<details><summary>{esc(label)}</summary><code>{esc(command)}</code></details>"
            for label, command in commands if command
        )
        cards.append(f"""
        <article class="photo-card">
          <div class="thumb">{image}</div>
          <div class="card-body">
            <div class="status-row"><b>{esc(row.get('filename'))}</b><em>{esc(row.get('status'))}</em></div>
            <p>{esc(row.get('qualityNote') or 'Inspect this candidate visually before deciding.')}</p>
            <p class="bias"><b>{esc(row.get('attentionRoute') or 'pending-cull')}:</b> {esc(row.get('decisionBias') or '')}</p>
            <div class="chips">{flags}</div>
            <div class="meta">Group: <code>{esc(row.get('reviewGroupId') or 'ungrouped')}</code></div>
            <div class="commands">{command_html}</div>
          </div>
        </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Cull Board</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg:#101711;
      --panel:#18231b;
      --panel2:#223126;
      --ink:#f7eed9;
      --muted:#c8b99a;
      --moss:#92bd76;
      --fern:#3d7d55;
      --gold:#e6c85e;
      --clay:#b86b4b;
      --line:rgba(247,238,217,.14);
    }}
    body {{
      margin:0;
      font-family:Avenir Next, Helvetica Neue, sans-serif;
      color:var(--ink);
      background:
        radial-gradient(circle at 10% 0%, rgba(146,189,118,.22), transparent 32%),
        radial-gradient(circle at 80% 6%, rgba(230,200,94,.13), transparent 26%),
        linear-gradient(180deg,#111810,#0c110d);
    }}
    header {{ padding:42px clamp(20px,5vw,78px) 24px; border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.24em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:.25em 0; font-size:clamp(42px,7vw,92px); line-height:.88; max-width:920px; }}
    p {{ color:var(--muted); line-height:1.55; }}
    code {{ color:var(--gold); overflow-wrap:anywhere; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:12px; padding:22px clamp(16px,4vw,58px); }}
    .stat {{ border:1px solid var(--line); background:linear-gradient(180deg,rgba(34,49,38,.92),rgba(13,20,15,.88)); border-radius:24px; padding:16px; box-shadow:0 20px 80px rgba(0,0,0,.22); }}
    .stat b {{ display:block; font-size:32px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    .truth {{ margin:0 clamp(16px,4vw,58px) 22px; border:1px solid rgba(146,189,118,.32); border-radius:24px; background:rgba(61,125,85,.12); padding:18px 20px; }}
    .start {{ margin:0 clamp(16px,4vw,58px) 22px; border:1px solid rgba(230,200,94,.3); border-radius:24px; background:linear-gradient(135deg,rgba(230,200,94,.13),rgba(61,125,85,.10)); padding:18px 20px; }}
    .start h2 {{ margin:.1rem 0 .35rem; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; padding:0 clamp(16px,4vw,58px) 64px; }}
    .routes {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; margin:0 clamp(16px,4vw,58px) 22px; }}
    .route-card {{ border:1px solid var(--line); border-radius:22px; background:rgba(255,255,255,.055); padding:14px; }}
    .route-count {{ display:inline-grid; place-items:center; min-width:38px; height:38px; border-radius:999px; color:#15170f; background:var(--gold); font-weight:1000; }}
    .route-card h3 {{ margin:10px 0 4px; }}
    .photo-card {{ overflow:hidden; border:1px solid var(--line); border-radius:26px; background:linear-gradient(180deg,rgba(24,35,27,.98),rgba(11,16,12,.98)); box-shadow:0 22px 90px rgba(0,0,0,.25); }}
    .thumb {{ aspect-ratio:4/3; background:#050806; display:grid; place-items:center; border-bottom:1px solid var(--line); }}
    .thumb img {{ width:100%; height:100%; object-fit:cover; display:block; }}
    .missing {{ color:var(--muted); }}
    .card-body {{ padding:14px 14px 16px; }}
    .status-row {{ display:flex; gap:10px; justify-content:space-between; align-items:start; }}
    .status-row b {{ line-height:1.15; }}
    .status-row em {{ font-style:normal; color:var(--gold); font-weight:900; font-size:11px; text-transform:uppercase; letter-spacing:.1em; }}
    .chips {{ display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }}
    .chips span {{ border:1px solid rgba(230,200,94,.24); border-radius:999px; color:var(--gold); background:rgba(230,200,94,.08); padding:4px 8px; font-size:11px; font-weight:800; }}
    .bias {{ border-left:3px solid var(--gold); padding-left:9px; }}
    .meta {{ color:var(--muted); font-size:12px; margin-bottom:10px; }}
    details {{ border-top:1px solid var(--line); padding:8px 0; }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; font-size:12px; }}
    details code {{ display:block; margin-top:6px; color:#f5deb3; white-space:pre-wrap; font-size:11px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove</div>
    <h1>Cull calmly. Keep the originals sacred.</h1>
    <p>This board turns the current Photo Grove decision desk into a human/agent review path. Quality hints route attention; they are not verdicts.</p>
  </header>
  <section class="stats">
    <div class="stat"><b>{esc(counts.get('total'))}</b><span>Indexed</span></div>
    <div class="stat"><b>{esc(counts.get('candidateRows'))}</b><span>Candidates</span></div>
    <div class="stat"><b>{esc(counts.get('pending'))}</b><span>Pending</span></div>
    <div class="stat"><b>{esc(counts.get('review'))}</b><span>Review</span></div>
    <div class="stat"><b>{esc(int(counts.get('keep') or 0) + int(counts.get('favorite') or 0))}</b><span>Keep/Fav</span></div>
    <div class="stat"><b>{esc(counts.get('reject'))}</b><span>Reject</span></div>
  </section>
  <section class="truth"><b>Truth:</b> {esc(packet.get('truth'))}<br><b>Human ask:</b> {esc(packet.get('humanAsk'))}<br><b>Codex can keep going:</b> {esc(packet.get('agentSafeParallelWork'))}<br><b>Next:</b> {esc(packet.get('nextSafestAction'))}</section>
  <section class="start">
    <div class="eyebrow">Visual review first</div>
    <h2>{esc((packet.get('primaryVisualReview') or {}).get('label'))}</h2>
    <p>{esc((packet.get('primaryVisualReview') or {}).get('why'))}</p>
    <p><b>Safety:</b> {esc((packet.get('primaryVisualReview') or {}).get('safety'))}</p>
    <code>{esc((packet.get('primaryVisualReview') or {}).get('command'))}</code>
  </section>
  <section class="start">
    <div class="eyebrow">Start here today · {esc(start.get('mode'))}</div>
    <h2>{esc(start.get('title'))}</h2>
    <p>{esc(start.get('why'))}</p>
    <p><b>Recommended move:</b> {esc(start.get('recommendedMove'))}</p>
    <p><b>Human question:</b> {esc(start.get('humanQuestion'))}</p>
    <p><b>Codex-safe move:</b> {esc(start.get('agentMove'))}</p>
    <code>{esc(start.get('safeCommand'))}</code>
  </section>
  <section class="start">
    <div class="eyebrow">Attention routing, not verdicts</div>
    <h2>Aftershoot-like triage without automatic rejection</h2>
    <p>{esc((packet.get('attentionRoutingContract') or {}).get('plain'))}</p>
  </section>
  <section class="routes">{''.join(route_sections)}</section>
  <main class="grid">{''.join(cards) if cards else '<p>No candidate rows found. Rebuild the Photo Grove Decision Desk first.</p>'}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build reviewer-facing Photo Grove cull board.")
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=36)
    args = parser.parse_args()
    photo_root = Path(args.photo_root).expanduser()
    packet = build_packet(photo_root, max(1, args.limit))
    out_dir = prepare_output(photo_root)
    json_path = out_dir / "photo-grove-cull-board.json"
    csv_path = out_dir / "photo-grove-cull-board.csv"
    markdown_path = out_dir / "START-HERE-photo-grove-cull-board.md"
    html_path = out_dir / "index.html"
    packet.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Photo Grove Cull Board",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local cull evidence only. No originals, metadata decisions, exports, delivery, upload, or publication are changed.",
        },
    })
    write_json(json_path, packet)
    write_csv(csv_path, packet)
    write_markdown(markdown_path, packet)
    write_html(html_path, packet)
    write_json(photo_root / LATEST_POINTER, packet)
    for alias in LATEST_ALIAS_POINTERS:
        write_json(photo_root / alias, packet)
    print(json.dumps({
        "status": packet["status"],
        "counts": packet["counts"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "latestPointer": str(photo_root / LATEST_POINTER),
        "latestAliasPointers": [str(photo_root / alias) for alias in LATEST_ALIAS_POINTERS],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
