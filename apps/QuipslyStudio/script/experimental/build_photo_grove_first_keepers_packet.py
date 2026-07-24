#!/usr/bin/env python3
"""Build a non-mutating first-keepers review packet for Photo Grove.

This is deliberately not an auto-cull or auto-delivery tool. It looks at the
current Photo Grove manifest, thumbnail quality hints, review groups, and cull
suggestions, then creates a calm review order for likely keeper candidates.

The output is a packet of evidence and metadata-only command examples. It never
changes source photos, never writes review sidecars, never exports deliverables,
and never publishes anything.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.photo-grove.first-keepers.v1"
LATEST_POINTER = "latest-photo-grove-first-keepers.json"

SEVERE_FLAGS = {
    "blank-preview-candidate",
    "highlight-clipping-preview",
    "preview-all-white",
    "preview-very-dark",
    "thumbnail-analysis-suspect",
}
REVIEW_FLAGS = {
    "exposure-review-candidate",
    "relative-high-blurdetect-score",
    "shadow-clipping-preview",
    "sharpness-review-candidate",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-photo-first-keepers")


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def file_uri(path_value: Any) -> str:
    path = Path(str(path_value or ""))
    if not path.is_absolute():
        return ""
    try:
        return path.as_uri()
    except ValueError:
        return ""


def resolve_session(photo_root: Path, target: str) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    if target and target != "latest":
        session_dir = Path(target).expanduser()
        if not session_dir.is_absolute():
            session_dir = photo_root / target
        pointer = {"latestSessionDir": str(session_dir), "htmlPath": str(session_dir / "index.html"), "manifestPath": str(session_dir / "manifest.json")}
    else:
        pointer = load_json(photo_root / "latest-photo-grove-review.json")
        session_dir = Path(str(pointer.get("latestSessionDir") or ""))

    manifest_path = Path(str(pointer.get("manifestPath") or session_dir / "manifest.json"))
    manifest = load_json(manifest_path)
    if not session_dir.exists() or not manifest:
        raise SystemExit(
            "No Photo Grove session/manifest found. Run ./script/agentctl.sh photo-grove-board first, "
            "or pass an explicit session folder."
        )
    return session_dir, pointer, manifest


def latest_cull_by_group(photo_root: Path) -> dict[str, dict[str, Any]]:
    pointer = load_json(photo_root / "latest-photo-grove-cull-suggestions.json")
    packet = load_json(Path(str(pointer.get("jsonPath") or ""))) if pointer.get("jsonPath") else {}
    by_group: dict[str, dict[str, Any]] = {}
    for group in packet.get("suggestions") or []:
        if isinstance(group, dict) and group.get("groupId"):
            by_group[str(group["groupId"])] = group
    return by_group


def item_quality(item: dict[str, Any]) -> tuple[list[str], dict[str, Any], str]:
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    hints = analysis.get("qualityHints") if isinstance(analysis.get("qualityHints"), dict) else {}
    flags = [str(flag) for flag in hints.get("qualityFlags") or []]
    metrics = hints.get("metrics") if isinstance(hints.get("metrics"), dict) else {}
    note = str(hints.get("qualityNote") or "")
    return flags, metrics, note


def review_status(item: dict[str, Any]) -> str:
    review = item.get("review") if isinstance(item.get("review"), dict) else {}
    return str(review.get("status") or "pending")


def review_rating(item: dict[str, Any]) -> Any:
    review = item.get("review") if isinstance(item.get("review"), dict) else {}
    return review.get("rating")


def review_group_id(item: dict[str, Any]) -> str:
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    return str(analysis.get("reviewGroupId") or "ungrouped")


def review_group_position(item: dict[str, Any]) -> int:
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    try:
        return int(analysis.get("reviewGroupPosition") or 0)
    except (TypeError, ValueError):
        return 0


def review_group_size(item: dict[str, Any]) -> int:
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    try:
        return int(analysis.get("reviewGroupSize") or 0)
    except (TypeError, ValueError):
        return 0


def score_item(item: dict[str, Any]) -> tuple[float, list[str], list[str]]:
    flags, metrics, _note = item_quality(item)
    analysis = item.get("analysis") if isinstance(item.get("analysis"), dict) else {}
    problem_flags = [str(flag) for flag in analysis.get("problemFlags") or []]
    status = review_status(item)
    score = 100.0
    reasons: list[str] = []
    cautions: list[str] = []

    if status in {"keep", "favorite"}:
        score += 16
        reasons.append(f"already marked {status}")
    elif status == "pending":
        reasons.append("pending and ready for first visual review")
    elif status == "review":
        score += 4
        reasons.append("already routed to review")
    elif status == "reject":
        score -= 80
        cautions.append("already rejected in metadata")

    severe = [flag for flag in flags if flag in SEVERE_FLAGS]
    review_flags = [flag for flag in flags if flag in REVIEW_FLAGS]
    if severe:
        score -= 30 + 7 * len(severe)
        cautions.append("thumbnail/source mismatch risk: " + ", ".join(severe))
    if review_flags:
        score -= 8 + 3 * len(review_flags)
        cautions.append("needs visual comparison: " + ", ".join(review_flags))
    if not flags:
        score += 10
        reasons.append("thumbnail quality hints carry no warnings")

    blur = metrics.get("blurMean")
    if isinstance(blur, (int, float)):
        score += min(float(blur), 16.0) / 4.0
        reasons.append(f"thumbnail texture signal {float(blur):.2f}")
    if Path(str(item.get("thumbnailPath") or "")).exists():
        score += 3
    else:
        score -= 10
        cautions.append("thumbnail missing")
    if Path(str(item.get("sourcePath") or "")).exists():
        score += 5
    else:
        score -= 40
        cautions.append("source missing")

    group_size = review_group_size(item)
    group_position = review_group_position(item)
    if group_size > 2 and group_position:
        edge_distance = min(group_position - 1, group_size - group_position)
        if edge_distance:
            score += min(edge_distance, 3)
            reasons.append("not an edge frame in its sequence")

    if "raw-review" in problem_flags:
        reasons.append("RAW source preserved for source-aware review")
    return score, reasons[:5], cautions[:5]


def metadata_commands(item: dict[str, Any], group_id: str) -> dict[str, str]:
    photo_id = str(item.get("id") or "")
    filename = str(item.get("filename") or "")
    note = f"<visual/source reviewed; first-keeper candidate {filename}>"
    group_note = f"<first-keeper pass reviewed {group_id}>"
    mark_favorite = f"./script/agentctl.sh photo-grove-decision {photo_id} favorite 5 first-keeper-candidate reviewer {shell_quote(note)}" if photo_id else ""
    mark_keep = f"./script/agentctl.sh photo-grove-decision {photo_id} keep 4 first-keeper-candidate reviewer {shell_quote(note)}" if photo_id else ""
    route_group = f"./script/agentctl.sh photo-grove-group-decision {group_id} review - first-keeper-pass reviewer {shell_quote(group_note)}" if group_id and group_id != "ungrouped" else ""
    return {
        "revealSource": f"open -R {shell_quote(str(item.get('sourcePath') or ''))}" if item.get("sourcePath") else "",
        "dryRunFavorite": mark_favorite.replace(" photo-grove-decision ", " photo-grove-decision-dry-run ", 1),
        "dryRunKeep": mark_keep.replace(" photo-grove-decision ", " photo-grove-decision-dry-run ", 1),
        "dryRunGroupReview": route_group.replace(" photo-grove-group-decision ", " photo-grove-group-decision-dry-run ", 1),
        "markFavorite": mark_favorite,
        "markKeep": mark_keep,
        "routeGroupReview": route_group,
    }


def normalize_candidate(rank: int, item: dict[str, Any], group: dict[str, Any], cull_group: dict[str, Any]) -> dict[str, Any]:
    flags, metrics, quality_note = item_quality(item)
    score, reasons, cautions = score_item(item)
    group_id = review_group_id(item)
    source_path = str(item.get("sourcePath") or "")
    thumb_path = str(item.get("thumbnailPath") or "")
    commands = metadata_commands(item, group_id)
    return {
        "rank": rank,
        "id": item.get("id") or "",
        "filename": item.get("filename") or Path(source_path).name,
        "kind": item.get("kind") or "",
        "sourcePath": source_path,
        "sourceRelativePath": item.get("relativePath") or "",
        "thumbnailPath": thumb_path,
        "thumbnailUri": file_uri(thumb_path),
        "reviewStatus": review_status(item),
        "rating": review_rating(item),
        "groupId": group_id,
        "groupPosition": review_group_position(item),
        "groupSize": review_group_size(item) or group.get("size") or 0,
        "groupFirstFilename": group.get("firstFilename") or "",
        "groupLastFilename": group.get("lastFilename") or "",
        "candidateScore": round(score, 3),
        "qualityFlags": flags,
        "qualityNote": quality_note,
        "qualityMetrics": metrics,
        "reasons": reasons,
        "cautions": cautions,
        "cullSuggestion": {
            "recommendation": cull_group.get("recommendation") or "",
            "tone": cull_group.get("tone") or "",
            "priority": cull_group.get("priority") or "",
            "reason": cull_group.get("reason") or "",
        },
        "safeLocalCommands": commands,
        "reviewPrompt": (
            "Open the source or inspect the thumbnail at review size. If this truly feels like a keeper, "
            "record a metadata-only keep/favorite decision. If unsure, route the group to review."
        ),
        "truth": "First-keeper candidate only. This is not a keep verdict and does not change metadata.",
    }


def build_candidates(manifest: dict[str, Any], cull_by_group: dict[str, dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    group_lookup = {str(group.get("id")): group for group in manifest.get("reviewGroups") or [] if isinstance(group, dict)}
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in manifest.get("items") or []:
        if not isinstance(item, dict):
            continue
        if review_status(item) == "reject":
            continue
        by_group[review_group_id(item)].append(item)

    preselected: list[dict[str, Any]] = []
    per_group_limit = 2 if limit >= 16 else 1
    for group_id in sorted(by_group):
        ranked = sorted(by_group[group_id], key=lambda value: score_item(value)[0], reverse=True)
        preselected.extend(ranked[:per_group_limit])

    ranked_all = sorted(preselected, key=lambda value: score_item(value)[0], reverse=True)
    if len(ranked_all) < limit:
        seen = {str(item.get("id") or "") for item in ranked_all}
        extras = sorted(
            [item for group_items in by_group.values() for item in group_items if str(item.get("id") or "") not in seen],
            key=lambda value: score_item(value)[0],
            reverse=True,
        )
        ranked_all.extend(extras[: max(0, limit - len(ranked_all))])

    candidates: list[dict[str, Any]] = []
    for rank, item in enumerate(ranked_all[:limit], start=1):
        group_id = review_group_id(item)
        candidates.append(normalize_candidate(rank, item, group_lookup.get(group_id, {}), cull_by_group.get(group_id, {})))
    return candidates


def prepare_output_dir(photo_root: Path, session_dir: Path) -> Path:
    base = session_dir / "first-keepers" / stamp()
    out_dir = base
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def build_packet(photo_root: Path, target: str, limit: int) -> dict[str, Any]:
    session_dir, pointer, manifest = resolve_session(photo_root, target)
    cull_by_group = latest_cull_by_group(photo_root)
    candidates = build_candidates(manifest, cull_by_group, max(1, limit))
    counts = manifest.get("counts") if isinstance(manifest.get("counts"), dict) else {}
    pending_count = sum(1 for item in manifest.get("items") or [] if isinstance(item, dict) and review_status(item) == "pending")
    selected_count = sum(1 for item in manifest.get("items") or [] if isinstance(item, dict) and review_status(item) in {"keep", "favorite"})
    first = candidates[0] if candidates else {}
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "first-keepers-review-ready",
        "photoRoot": str(photo_root),
        "sessionDir": str(session_dir),
        "sourceManifestPath": str(pointer.get("manifestPath") or session_dir / "manifest.json"),
        "sourceReviewHtml": pointer.get("htmlPath") or str(session_dir / "index.html"),
        "truth": "First-keeper candidates only. Originals and review metadata are untouched; no delivery/export/publication occurred.",
        "counts": {
            "candidatePhotos": len(candidates),
            "candidateGroups": len({candidate.get("groupId") for candidate in candidates}),
            "sourcePhotos": len(manifest.get("items") or []),
            "sourceGroups": len(manifest.get("reviewGroups") or []),
            "pending": pending_count,
            "selectedForClientProof": selected_count,
            "qualityHinted": counts.get("qualityHinted", 0),
            "originalsMutated": False,
            "metadataChanged": False,
            "externalPublishing": False,
            "clientDeliveryCreated": False,
        },
        "candidates": candidates,
        "firstDryRunCommand": ((first.get("safeLocalCommands") or {}).get("dryRunFavorite") if isinstance(first.get("safeLocalCommands"), dict) else "") if first else "",
        "firstDryRunCommandSafety": "Dry-run only. It previews a metadata decision without writing the ledger, changing sidecars, exporting, delivering, uploading, publishing, deleting, or mutating originals.",
        "firstMetadataCommand": ((first.get("safeLocalCommands") or {}).get("markFavorite") if isinstance(first.get("safeLocalCommands"), dict) else "") if first else "",
        "firstMetadataCommandSafety": "Metadata-only favorite/keep after visual/source review; never deletes, moves, exports, uploads, publishes, or mutates originals.",
        "nextSafestAction": "Open the first-keepers packet, compare candidates visually, run the dry-run command first, and only then record metadata-only keep/favorite/review decisions.",
    }


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = [
        "rank",
        "id",
        "filename",
        "groupId",
        "candidateScore",
        "reviewStatus",
        "qualityFlags",
        "reasons",
        "cautions",
        "sourcePath",
        "thumbnailPath",
        "revealSourceCommand",
        "dryRunFavoriteCommand",
        "dryRunKeepCommand",
        "dryRunGroupReviewCommand",
        "markFavoriteCommand",
        "markKeepCommand",
        "routeGroupReviewCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for candidate in packet.get("candidates") or []:
            commands = candidate.get("safeLocalCommands") if isinstance(candidate.get("safeLocalCommands"), dict) else {}
            writer.writerow({
                "rank": candidate.get("rank", ""),
                "id": candidate.get("id", ""),
                "filename": candidate.get("filename", ""),
                "groupId": candidate.get("groupId", ""),
                "candidateScore": candidate.get("candidateScore", ""),
                "reviewStatus": candidate.get("reviewStatus", ""),
                "qualityFlags": ", ".join(candidate.get("qualityFlags") or []),
                "reasons": " | ".join(candidate.get("reasons") or []),
                "cautions": " | ".join(candidate.get("cautions") or []),
                "sourcePath": candidate.get("sourcePath", ""),
                "thumbnailPath": candidate.get("thumbnailPath", ""),
                "revealSourceCommand": commands.get("revealSource", ""),
                "dryRunFavoriteCommand": commands.get("dryRunFavorite", ""),
                "dryRunKeepCommand": commands.get("dryRunKeep", ""),
                "dryRunGroupReviewCommand": commands.get("dryRunGroupReview", ""),
                "markFavoriteCommand": commands.get("markFavorite", ""),
                "markKeepCommand": commands.get("markKeep", ""),
                "routeGroupReviewCommand": commands.get("routeGroupReview", ""),
            })


def render_candidate(candidate: dict[str, Any]) -> str:
    commands = candidate.get("safeLocalCommands") if isinstance(candidate.get("safeLocalCommands"), dict) else {}
    flags = "".join(f"<span>{esc(flag)}</span>" for flag in candidate.get("qualityFlags") or [])
    reasons = "".join(f"<li>{esc(reason)}</li>" for reason in candidate.get("reasons") or [])
    cautions = "".join(f"<li>{esc(caution)}</li>" for caution in candidate.get("cautions") or [])
    cull = candidate.get("cullSuggestion") if isinstance(candidate.get("cullSuggestion"), dict) else {}
    thumb = candidate.get("thumbnailUri") or ""
    img = f"<img src=\"{esc(thumb)}\" alt=\"{esc(candidate.get('filename'))}\" />" if thumb else "<div class=\"no-thumb\">No thumbnail</div>"
    return f"""
    <article class="candidate">
      <div class="rank">#{esc(candidate.get('rank'))}</div>
      <figure>{img}</figure>
      <section class="body">
        <div class="topline">
          <strong>{esc(candidate.get('filename'))}</strong>
          <span>{esc(candidate.get('candidateScore'))} score</span>
        </div>
        <p class="meta">{esc(candidate.get('groupId'))} · frame {esc(candidate.get('groupPosition'))}/{esc(candidate.get('groupSize'))} · {esc(candidate.get('reviewStatus'))}</p>
        <p>{esc(candidate.get('reviewPrompt'))}</p>
        <div class="flags">{flags or '<span>no quality flags</span>'}</div>
        <div class="columns">
          <div><h3>Why it floated up</h3><ul>{reasons or '<li>Needs visual review.</li>'}</ul></div>
          <div><h3>Cautions</h3><ul>{cautions or '<li>No obvious thumbnail warning carried.</li>'}</ul></div>
        </div>
        <p class="cull">{esc(cull.get('tone') or cull.get('reason') or 'No group-level cull warning carried.')}</p>
        <details>
          <summary>Safe commands after review</summary>
          <p class="label">Reveal source</p><pre>{esc(commands.get('revealSource'))}</pre>
          <p class="label">Dry-run favorite first</p><pre>{esc(commands.get('dryRunFavorite'))}</pre>
          <p class="label">Dry-run keep first</p><pre>{esc(commands.get('dryRunKeep'))}</pre>
          <p class="label">Dry-run route group first</p><pre>{esc(commands.get('dryRunGroupReview'))}</pre>
          <p class="label">Mark favorite after visual/source review</p><pre>{esc(commands.get('markFavorite'))}</pre>
          <p class="label">Mark keep after visual/source review</p><pre>{esc(commands.get('markKeep'))}</pre>
          <p class="label">Route whole group to review</p><pre>{esc(commands.get('routeGroupReview'))}</pre>
        </details>
      </section>
    </article>
    """


def render_html(packet: dict[str, Any]) -> str:
    counts = packet.get("counts") if isinstance(packet.get("counts"), dict) else {}
    candidates = "\n".join(render_candidate(candidate) for candidate in packet.get("candidates") or [])
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Photo Grove first keepers</title>
  <style>
    :root {{
      --bg:#11180f; --panel:#1c2819; --panel2:#25331f; --ink:#f7f0d8; --muted:#c8bfa5;
      --moss:#8fbc72; --leaf:#49d17d; --gold:#e7ca55; --clay:#c17854; --line:rgba(247,240,216,.16);
    }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 8% -5%, rgba(143,188,114,.24), transparent 32%), radial-gradient(circle at 100% 0%, rgba(231,202,85,.12), transparent 35%), var(--bg); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.22em; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; max-width:980px; font-size:clamp(38px,6vw,78px); line-height:.9; }}
    header p {{ max-width:980px; color:var(--muted); font-size:18px; line-height:1.5; }}
    .truth {{ border:1px solid rgba(143,188,114,.36); background:rgba(73,209,125,.08); border-radius:18px; padding:14px 16px; color:var(--moss); font-weight:800; }}
    .stats {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .stats span {{ border:1px solid var(--line); background:rgba(255,255,255,.05); border-radius:999px; padding:8px 12px; color:var(--muted); font-size:13px; font-weight:800; }}
    main {{ display:grid; gap:16px; padding:24px clamp(16px,4vw,56px) 70px; }}
    .candidate {{ display:grid; grid-template-columns:64px minmax(180px,320px) 1fr; gap:16px; border:1px solid var(--line); border-radius:24px; background:linear-gradient(135deg, rgba(28,40,25,.96), rgba(9,13,9,.98)); padding:16px; box-shadow:0 20px 60px rgba(0,0,0,.24); }}
    .rank {{ display:grid; place-items:center; align-self:start; height:52px; border-radius:18px; background:rgba(231,202,85,.14); color:var(--gold); font-weight:1000; }}
    figure {{ margin:0; border:1px solid var(--line); border-radius:18px; overflow:hidden; background:#070b06; }}
    img,.no-thumb {{ width:100%; aspect-ratio:4/3; object-fit:cover; display:grid; place-items:center; color:var(--muted); }}
    .topline {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .topline strong {{ font-size:22px; overflow-wrap:anywhere; }}
    .topline span {{ color:var(--gold); font-weight:900; }}
    .meta {{ margin-top:4px; color:var(--moss); font-weight:900; }}
    p {{ color:var(--muted); line-height:1.45; }}
    .flags,.stats {{ display:flex; flex-wrap:wrap; gap:8px; }}
    .flags span {{ border:1px solid var(--line); border-radius:999px; padding:5px 9px; color:var(--gold); background:rgba(231,202,85,.08); font-size:12px; font-weight:900; }}
    .columns {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(230px,1fr)); gap:12px; }}
    h3 {{ margin:10px 0 4px; color:var(--ink); }}
    ul {{ margin:6px 0 0 18px; padding:0; color:var(--muted); }}
    .cull {{ border-left:3px solid var(--clay); padding-left:12px; color:#e9c3aa; }}
    details {{ margin-top:12px; border:1px solid var(--line); border-radius:16px; padding:12px; background:rgba(0,0,0,.22); }}
    summary {{ cursor:pointer; color:var(--gold); font-weight:900; }}
    .label {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; margin-bottom:4px; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; border-radius:14px; padding:10px; background:rgba(0,0,0,.28); color:var(--ink); }}
    @media (max-width: 800px) {{ .candidate {{ grid-template-columns:1fr; }} .rank {{ width:64px; }} }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove · first keepers</div>
    <h1>Likely keepers, not machine verdicts.</h1>
    <p>This packet floats promising candidates from the current Photo Grove session so a human or agent can start the cull faster. It does not keep, reject, export, deliver, upload, publish, move, delete, or alter originals.</p>
    <p class="truth">{esc(packet.get('truth'))}</p>
    <div class="stats">
      <span>{esc(counts.get('candidatePhotos'))} candidates</span>
      <span>{esc(counts.get('candidateGroups'))} groups</span>
      <span>{esc(counts.get('sourcePhotos'))} source photos</span>
      <span>{esc(counts.get('pending'))} pending</span>
      <span>{esc(counts.get('selectedForClientProof'))} selected</span>
    </div>
  </header>
  <main>{candidates or '<article class="candidate"><section class="body"><h2>No first-keeper candidates</h2><p>Run Photo Grove board generation first.</p></section></article>'}</main>
</body>
</html>"""


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Photo Grove first keepers",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        "## Next safest action",
        "",
        packet["nextSafestAction"],
        "",
    ]
    for candidate in packet.get("candidates") or []:
        commands = candidate.get("safeLocalCommands") if isinstance(candidate.get("safeLocalCommands"), dict) else {}
        lines.extend([
            f"## #{candidate.get('rank')} {candidate.get('filename')}",
            "",
            f"- Group: `{candidate.get('groupId')}` ({candidate.get('groupPosition')}/{candidate.get('groupSize')})",
            f"- Candidate score: `{candidate.get('candidateScore')}`",
            f"- Current review status: `{candidate.get('reviewStatus')}`",
            f"- Quality flags: {', '.join(candidate.get('qualityFlags') or []) or 'none carried'}",
            f"- Reasons: {'; '.join(candidate.get('reasons') or []) or 'needs visual review'}",
            f"- Cautions: {'; '.join(candidate.get('cautions') or []) or 'none carried'}",
            f"- Source: `{candidate.get('sourcePath')}`",
            "",
            "Reveal source:",
            "",
            f"```bash\n{commands.get('revealSource') or ''}\n```",
            "",
            "Dry-run favorite first:",
            "",
            f"```bash\n{commands.get('dryRunFavorite') or ''}\n```",
            "",
            "Metadata-only favorite after source review:",
            "",
            f"```bash\n{commands.get('markFavorite') or ''}\n```",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a non-mutating Photo Grove first-keepers review packet.")
    parser.add_argument("target", nargs="?", default="latest", help="latest or a Photo Grove session folder")
    parser.add_argument("limit", nargs="?", type=int, default=24, help="candidate limit")
    parser.add_argument("--photo-root", default=str(DEFAULT_PHOTO_ROOT))
    args = parser.parse_args()

    photo_root = Path(args.photo_root)
    session_dir, _pointer, _manifest = resolve_session(photo_root, args.target)
    packet = build_packet(photo_root, args.target, args.limit)
    output_dir = prepare_output_dir(photo_root, session_dir)
    json_path = output_dir / "photo-first-keepers.json"
    html_path = output_dir / "index.html"
    markdown_path = output_dir / "START-HERE-photo-first-keepers.md"
    csv_path = output_dir / "photo-first-keepers.csv"

    packet.update({
        "outputDir": str(output_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Photo Grove first keepers",
            "path": str(html_path),
            "command": f"open {shell_quote(str(html_path))}",
            "safety": "Opens local candidate evidence only. No keep/reject metadata, export, delivery, upload, publication, or source mutation occurs.",
        },
    })

    write_json(json_path, packet)
    write_csv(csv_path, packet)
    html_path.write_text(render_html(packet), encoding="utf-8")
    write_markdown(markdown_path, packet)

    pointer = {
        "schema": "quipsly.photo-grove.latest-first-keepers.v1",
        "status": packet["status"],
        "updatedAt": iso_now(),
        "sessionDir": packet["sessionDir"],
        "outputDir": str(output_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet["counts"],
        "humanAsk": "Open the first-keepers packet, compare candidate photos visually, then mark only the photos/groups a human actually wants to keep reviewing.",
        "agentSafeParallelWork": "Codex may improve keeper notes, grouping, quality cautions, and dry-run metadata commands. Do not mutate originals, change metadata decisions, export, deliver, upload, publish, delete, or overwrite.",
        "truth": packet["truth"],
        "firstSafeAction": packet["firstSafeAction"],
        "firstDryRunCommand": packet.get("firstDryRunCommand") or "",
        "firstDryRunCommandSafety": packet.get("firstDryRunCommandSafety") or "",
        "firstMetadataCommand": packet.get("firstMetadataCommand") or "",
        "firstMetadataCommandSafety": packet.get("firstMetadataCommandSafety") or "",
        "nextSafestAction": packet["nextSafestAction"],
        "originalsMutated": False,
        "metadataChanged": False,
        "externalPublishing": False,
        "clientDeliveryCreated": False,
    }
    write_json(photo_root / LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
