#!/usr/bin/env python3
"""Build a dry-run Photo Grove cull rehearsal packet.

This script rehearses metadata-only keep/review/reject/favorite decisions for a
small focused review set and records the before/after previews. It does not
write the review ledger, append events, create decision receipts, copy files,
export photos, deliver proofs, publish, upload, or mutate originals.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import photo_grove_review_decision  # noqa: E402

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
LATEST_POINTER = "latest-photo-grove-cull-rehearsal.json"
SCHEMA = "quipsly.photo-grove.cull-rehearsal.v1"

ACTION_RECIPES = [
    {
        "key": "review",
        "status": "review",
        "rating": "-",
        "tags": "needs-human-cull,rehearsal",
        "note": "Dry-run rehearsal: route to review after visual/source inspection; originals untouched.",
    },
    {
        "key": "keep4",
        "status": "keep",
        "rating": "4",
        "tags": "keeper,rehearsal",
        "note": "Dry-run rehearsal: keep candidate after visual/source inspection; originals untouched.",
    },
    {
        "key": "favorite5",
        "status": "favorite",
        "rating": "5",
        "tags": "hero,keeper,rehearsal",
        "note": "Dry-run rehearsal: favorite candidate after visual/source inspection; originals untouched.",
    },
    {
        "key": "reject",
        "status": "reject",
        "rating": "-",
        "tags": "reject-after-review,rehearsal",
        "note": "Dry-run rehearsal: reject only after visual/source inspection; originals untouched.",
    },
]


def recommended_recipe_key(row: dict[str, Any]) -> str:
    route = str(row.get("attentionRoute") or "").lower()
    flags = {str(flag).lower() for flag in (row.get("qualityFlags") or [])}
    if route in {"source-inspection-needed", "quality-problem-review", "human-review-routed"}:
        return "review"
    if route == "near-duplicate-sequence":
        return "review"
    if route == "keeper-proof-candidate" and not {"missing-source", "missing-thumbnail", "quality-review"}.intersection(flags):
        return "keep4"
    return "review"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-cull-rehearsal")


def load_json(path: Path, *, resolve_pointer: bool = True) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    if resolve_pointer and payload.get("jsonPath"):
        target = Path(str(payload.get("jsonPath") or ""))
        if target.exists() and target != path:
            target_payload = load_json(target, resolve_pointer=False)
            if target_payload:
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def file_uri(path: str) -> str:
    if not path:
        return ""
    try:
        return Path(path).expanduser().resolve().as_uri()
    except Exception:
        return ""


def resolve_review_session(photo_root: Path) -> dict[str, Any]:
    return load_json(photo_root / "latest-photo-grove-review-session.json")


def resolve_review_ledger_session_arg(photo_root: Path, review_session: dict[str, Any]) -> str:
    """Return the canonical review ledger session for dry-run decisions.

    The rendered review-session packet is a report about the cull session. The
    actual dry-run/live metadata machinery needs the ledger session created by
    the Photo Grove review board. Prefer that source-of-truth pointer, then
    fall back to any explicit ledger/session fields, then finally let the
    decision helper resolve `latest`.
    """
    review_pointer = load_json(photo_root / "latest-photo-grove-review.json")
    candidates = [
        review_pointer.get("latestSessionDir"),
        review_pointer.get("sessionDir"),
        review_pointer.get("reviewLedgerPath"),
        review_pointer.get("ledgerPath"),
        review_session.get("latestLedgerSessionDir"),
        review_session.get("ledgerSessionDir"),
        review_session.get("reviewLedgerPath"),
        review_session.get("ledgerPath"),
    ]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(str(candidate)).expanduser()
        session_dir = path.parent if path.is_file() else path
        if (session_dir / "review-ledger.json").exists():
            return str(session_dir)
    return "latest"


def row_thumbnail(row: dict[str, Any]) -> str:
    for key in ("thumbnailPath", "thumbPath", "previewPath", "thumbnail"):
        value = str(row.get(key) or "")
        if value:
            return value
    return ""


def dry_run_preview(row: dict[str, Any], recipe: dict[str, str], actor: str, session: str) -> dict[str, Any]:
    photo_id = str(row.get("photoId") or row.get("id") or row.get("filename") or "")
    args = SimpleNamespace(
        photo_id=photo_id,
        status=recipe["status"],
        rating=recipe["rating"],
        tags=recipe["tags"],
        actor=actor,
        note=recipe["note"],
        group=False,
        session=session,
        dry_run=True,
    )
    try:
        result = photo_grove_review_decision.apply_decision(args)
        ok = bool(result.get("ok"))
        error = ""
    except Exception as exc:
        result = {}
        ok = False
        error = str(exc)
    return {
        "key": recipe["key"],
        "status": recipe["status"],
        "rating": recipe["rating"],
        "tags": recipe["tags"],
        "note": recipe["note"],
        "ok": ok,
        "error": error,
        "dryRun": True,
        "ledgerMutated": False,
        "originalsMutated": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
        "photoId": photo_id,
        "filename": row.get("filename") or result.get("filename") or "",
        "before": result.get("before") or [],
        "afterPreview": result.get("afterPreview") or [],
        "wouldUpdateCount": result.get("wouldUpdateCount") or 0,
        "command": (
            "./script/agentctl.sh photo-grove-decision-dry-run "
            f"{shell_quote(photo_id)} {recipe['status']} {shell_quote(recipe['rating'])} "
            f"{shell_quote(recipe['tags'])} {shell_quote(actor)} {shell_quote(recipe['note'])}"
        ),
    }


def build(photo_root: Path, limit: int, actor: str) -> tuple[Path, dict[str, Any]]:
    review_session = resolve_review_session(photo_root)
    rows = review_session.get("rows") if isinstance(review_session.get("rows"), list) else []
    selected_rows = [row for row in rows if isinstance(row, dict)][: max(1, limit)]
    output_dir = photo_root / "CullRehearsals" / stamp()
    output_dir.mkdir(parents=True, exist_ok=True)
    session_arg = resolve_review_ledger_session_arg(photo_root, review_session)

    rehearsal_rows: list[dict[str, Any]] = []
    for rank, row in enumerate(selected_rows, 1):
        previews = [dry_run_preview(row, recipe, actor, session_arg) for recipe in ACTION_RECIPES]
        attention_route = row.get("attentionRoute") or "pending-cull"
        rehearsal_rows.append({
            "rank": rank,
            "photoId": row.get("photoId") or row.get("id") or "",
            "filename": row.get("filename") or "",
            "reviewGroupId": row.get("reviewGroupId") or "",
            "comparisonLabel": row.get("comparisonLabel") or "",
            "attentionRoute": attention_route,
            "attentionReasons": row.get("attentionReasons") or [],
            "decisionBias": row.get("decisionBias") or "Inspect visually, compare nearby frames, then choose a metadata-only route.",
            "recommendedFirstDryRun": recommended_recipe_key(row),
            "sourcePath": row.get("sourcePath") or "",
            "sourceExists": bool(row.get("sourceExists")),
            "thumbnailPath": row_thumbnail(row),
            "qualityFlags": row.get("qualityFlags") or [],
            "qualityNote": row.get("qualityNote") or "",
            "humanQuestion": row.get("humanQuestion") or "Which metadata-only direction should this photo take after visual/source inspection?",
            "previews": previews,
            "openSourceCommand": row.get("openSourceCommand") or (f"open -R {shell_quote(str(row.get('sourcePath') or ''))}" if row.get("sourcePath") else ""),
        })

    preview_count = sum(len(row.get("previews") or []) for row in rehearsal_rows)
    preview_errors = sum(1 for row in rehearsal_rows for preview in row.get("previews") or [] if not preview.get("ok"))
    counts = {
        "sourceRows": len(rows),
        "rehearsalRows": len(rehearsal_rows),
        "dryRunPreviews": preview_count,
        "dryRunPreviewErrors": preview_errors,
        "ledgerMutated": False,
        "originalsMutated": False,
        "metadataChanged": False,
        "clientDeliveryCreated": False,
        "externalPublishing": False,
        "decisionReceiptsCreated": False,
    }
    status = "photo-cull-rehearsal-ready" if rehearsal_rows and preview_errors == 0 else "photo-cull-rehearsal-needs-attention"
    payload: dict[str, Any] = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "photoRoot": str(photo_root),
        "sessionDir": str(output_dir),
        "sourceReviewSessionJson": review_session.get("jsonPath") or "",
        "sourceReviewSessionHtml": review_session.get("htmlPath") or "",
        "sourceReviewLedgerSession": session_arg,
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "photo-grove-cull-rehearsal.json"),
        "markdownPath": str(output_dir / "START-HERE-photo-grove-cull-rehearsal.md"),
        "csvPath": str(output_dir / "photo-grove-cull-rehearsal.csv"),
        "actor": actor,
        "counts": counts,
        "rows": rehearsal_rows,
        "humanAsk": "Open the cull rehearsal, compare thumbnails/source files, then choose one metadata-only direction only after visual review.",
        "agentSafeParallelWork": "Codex can add comparison notes, improve rehearsal grouping, run more dry-run previews, and regenerate packets without writing cull decisions or touching originals.",
        "nextSafestAction": "Review the first rehearsal row, reveal the source if the thumbnail is suspect, then use dry-run before any execute-after-review metadata command.",
        "firstSafeAction": {},
        "safety": {
            "ledgerMutated": False,
            "originalsMutated": False,
            "metadataChanged": False,
            "clientDeliveryCreated": False,
            "externalPublishing": False,
            "decisionReceiptsCreated": False,
            "versionsOverwritten": False,
        },
        "truth": "Photo Grove cull rehearsal only. It records dry-run before/after previews and does not write the ledger, append events, create decision receipts, copy/export/deliver photos, upload, publish, or mutate originals.",
    }
    payload["firstSafeAction"] = {
        "label": "Open Photo Grove cull rehearsal",
        "command": f"open {shell_quote(payload['htmlPath'])}",
        "path": payload["htmlPath"],
        "safety": "Opens local dry-run rehearsal evidence only. No originals, metadata, exports, uploads, or delivery state are changed.",
    }
    write_outputs(output_dir, payload)
    latest = {
        "schema": "quipsly.photo-grove.cull-rehearsal.latest-pointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "photoRoot": str(photo_root),
        "sessionDir": str(output_dir),
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "counts": counts,
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "truth": payload["safety"],
        "truthDescription": payload["truth"],
    }
    write_json(photo_root / LATEST_POINTER, latest)
    return output_dir, payload


def write_outputs(output_dir: Path, payload: dict[str, Any]) -> None:
    write_json(output_dir / "photo-grove-cull-rehearsal.json", payload)
    write_markdown(output_dir / "START-HERE-photo-grove-cull-rehearsal.md", payload)
    write_csv(output_dir / "photo-grove-cull-rehearsal.csv", payload)
    (output_dir / "index.html").write_text(render_html(payload), encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "rank",
            "photoId",
            "filename",
            "reviewGroupId",
            "comparisonLabel",
            "attentionRoute",
            "recommendedFirstDryRun",
            "action",
            "ok",
            "wouldUpdateCount",
            "command",
            "sourcePath",
            "qualityFlags",
        ])
        writer.writeheader()
        for row in payload.get("rows") or []:
            for preview in row.get("previews") or []:
                writer.writerow({
                    "rank": row.get("rank"),
                    "photoId": row.get("photoId"),
                    "filename": row.get("filename"),
                    "reviewGroupId": row.get("reviewGroupId"),
                    "comparisonLabel": row.get("comparisonLabel"),
                    "attentionRoute": row.get("attentionRoute"),
                    "recommendedFirstDryRun": row.get("recommendedFirstDryRun"),
                    "action": preview.get("key"),
                    "ok": preview.get("ok"),
                    "wouldUpdateCount": preview.get("wouldUpdateCount"),
                    "command": preview.get("command"),
                    "sourcePath": row.get("sourcePath"),
                    "qualityFlags": ",".join(row.get("qualityFlags") or []),
                })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove cull rehearsal",
        "",
        payload.get("truth", ""),
        "",
        f"Status: `{payload.get('status')}`",
        f"Dry-run previews: `{(payload.get('counts') or {}).get('dryRunPreviews')}`",
        f"Preview errors: `{(payload.get('counts') or {}).get('dryRunPreviewErrors')}`",
        "",
        "## Review rows",
    ]
    for row in payload.get("rows") or []:
        lines.extend([
            "",
            f"### {row.get('rank')}. {row.get('filename')}",
            "",
            f"- Photo ID: `{row.get('photoId')}`",
            f"- Group: `{row.get('reviewGroupId')}` / label `{row.get('comparisonLabel')}`",
            f"- Attention route: `{row.get('attentionRoute')}`",
            f"- Recommended first dry-run: `{row.get('recommendedFirstDryRun')}`",
            f"- Decision bias: {row.get('decisionBias')}",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Quality flags: `{', '.join(row.get('qualityFlags') or []) or 'none'}`",
            f"- Question: {row.get('humanQuestion')}",
            "",
            "| Action | OK | Would update | Command |",
            "| --- | --- | ---: | --- |",
        ])
        for preview in row.get("previews") or []:
            lines.append(f"| {preview.get('key')} | `{preview.get('ok')}` | {preview.get('wouldUpdateCount')} | `{preview.get('command')}` |")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def render_html(payload: dict[str, Any]) -> str:
    esc = html.escape
    counts = payload.get("counts") or {}
    cards = []
    for row in payload.get("rows") or []:
        thumb = row.get("thumbnailPath") or ""
        img = f"<img src=\"{esc(file_uri(thumb), quote=True)}\" alt=\"{esc(str(row.get('filename') or 'photo'))}\">" if thumb and Path(thumb).exists() else "<div class=\"thumb-empty\">No thumbnail</div>"
        previews = "\n".join(
            f"""
            <details>
              <summary>{esc(str(preview.get('key')))} · ok {esc(str(preview.get('ok')))} · would update {esc(str(preview.get('wouldUpdateCount')))}</summary>
              <pre>{esc(str(preview.get('command') or ''))}</pre>
              <pre>{esc(json.dumps({'before': preview.get('before'), 'afterPreview': preview.get('afterPreview')}, indent=2, sort_keys=True)[:2400])}</pre>
            </details>
            """
            for preview in row.get("previews") or []
        )
        flags = ", ".join(row.get("qualityFlags") or []) or "none"
        cards.append(f"""
          <article class="card">
            <div class="thumb">{img}</div>
            <div>
              <p class="eyebrow">Row {esc(str(row.get('rank')))} · {esc(str(row.get('comparisonLabel') or ''))}</p>
              <h2>{esc(str(row.get('filename') or 'Photo'))}</h2>
              <p>{esc(str(row.get('humanQuestion') or ''))}</p>
              <p class="route"><strong>{esc(str(row.get('attentionRoute') or 'pending-cull'))}</strong><br>{esc(str(row.get('decisionBias') or ''))}</p>
              <p><strong>Recommended first dry-run:</strong> {esc(str(row.get('recommendedFirstDryRun') or 'review'))}</p>
              <p><strong>Quality flags:</strong> {esc(flags)}</p>
              <p><strong>Source:</strong> <code>{esc(str(row.get('sourcePath') or ''))}</code></p>
              <pre>{esc(str(row.get('openSourceCommand') or ''))}</pre>
              {previews}
            </div>
          </article>
        """)
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Photo Grove cull rehearsal</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111812; --panel:#18241b; --ink:#f5ead6; --muted:#b8aa92; --leaf:#7fd07a; --honey:#f4c95d; --clay:#d57a59; --line:rgba(245,234,214,.14); }}
    body {{ margin:0; background:radial-gradient(circle at 0 0, rgba(127,208,122,.16), transparent 34%), var(--bg); color:var(--ink); font:15px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; }}
    main {{ max-width:1200px; margin:0 auto; padding:42px 24px 70px; }}
    .hero {{ border:1px solid var(--line); background:linear-gradient(135deg, rgba(24,36,27,.95), rgba(38,48,31,.82)); border-radius:28px; padding:30px; }}
    .eyebrow {{ color:var(--honey); letter-spacing:.18em; text-transform:uppercase; font-weight:800; font-size:12px; }}
    h1 {{ font-size:clamp(38px, 5vw, 68px); line-height:.95; margin:8px 0 12px; letter-spacing:-.045em; }}
    p {{ color:var(--muted); }}
    .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:22px; }}
    .metric {{ border:1px solid var(--line); border-radius:18px; padding:16px; background:rgba(255,255,255,.05); }}
    .metric strong {{ display:block; color:var(--leaf); font-size:26px; }}
    .metric span {{ color:var(--muted); text-transform:uppercase; font-size:11px; letter-spacing:.12em; }}
    .card {{ display:grid; grid-template-columns:220px minmax(0,1fr); gap:18px; border:1px solid var(--line); border-radius:22px; margin-top:18px; padding:16px; background:rgba(255,255,255,.045); }}
    img {{ width:100%; height:180px; object-fit:contain; border-radius:16px; background:#050705; }}
    .thumb-empty {{ height:180px; display:grid; place-items:center; border-radius:16px; background:#050705; color:var(--muted); }}
    pre, code {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.28); border-radius:12px; padding:9px; color:var(--honey); }}
    details {{ border:1px solid var(--line); border-radius:14px; padding:10px; margin-top:8px; background:rgba(255,255,255,.035); }}
    summary {{ cursor:pointer; color:var(--leaf); font-weight:700; }}
    .route {{ border-left:3px solid var(--honey); padding-left:10px; }}
    @media (max-width:760px) {{ .card {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Photo Grove rehearsal</p>
    <h1>Preview the cull before the cull exists.</h1>
    <p>{esc(str(payload.get('truth') or ''))}</p>
    <div class="metrics">
      <div class="metric"><strong>{esc(str(counts.get('rehearsalRows')))}</strong><span>review rows</span></div>
      <div class="metric"><strong>{esc(str(counts.get('dryRunPreviews')))}</strong><span>dry-run previews</span></div>
      <div class="metric"><strong>{esc(str(counts.get('dryRunPreviewErrors')))}</strong><span>preview errors</span></div>
      <div class="metric"><strong>{esc(str(counts.get('originalsMutated')))}</strong><span>originals mutated</span></div>
    </div>
  </section>
  {''.join(cards)}
</main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("photo_root", nargs="?", default=str(DEFAULT_PHOTO_ROOT))
    parser.add_argument("--limit", type=int, default=6)
    parser.add_argument("--actor", default="codex")
    args = parser.parse_args()
    output_dir, payload = build(Path(args.photo_root).expanduser(), args.limit, args.actor)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(output_dir / "index.html"),
        "jsonPath": str(output_dir / "photo-grove-cull-rehearsal.json"),
        "counts": payload["counts"],
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
