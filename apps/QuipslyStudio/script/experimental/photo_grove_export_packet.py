#!/usr/bin/env python3
"""Build Photo Grove review/export-prep packets from current review metadata.

This is intentionally not an exporter yet. It reads the immutable source manifest
and the mutable Quipsly review ledger, then writes packet artifacts that explain
what is ready to review, what is selected, what is rejected, and what still needs
human attention. Originals are never copied, moved, deleted, or modified.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-review.json")
LATEST_EXPORT_PREP_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove/latest-photo-grove-export-prep.json")


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_session(value: str | None) -> Path:
    if value and value != "latest":
        path = Path(value).expanduser()
        if path.is_file():
            return path.parent
        return path
    pointer = load_json(DEFAULT_POINTER)
    latest = pointer.get("latestSessionDir")
    if not latest:
        raise SystemExit(f"No latest Photo Grove session pointer found at {DEFAULT_POINTER}")
    return Path(str(latest))


def shell_command(parts: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in parts)


def command_for(decision: dict[str, Any], status: str, rating: str = "-", tags: str = "", actor: str = "reviewer", note: str = "<note>") -> str:
    return shell_command([
        "./script/agentctl.sh",
        "photo-grove-decision",
        str(decision.get("id") or decision.get("filename") or ""),
        status,
        rating,
        tags,
        actor,
        note,
    ])


def group_command(group_id: str, status: str, rating: str = "-", tags: str = "", actor: str = "reviewer", note: str = "<note>") -> str:
    return shell_command([
        "./script/agentctl.sh",
        "photo-grove-group-decision",
        group_id,
        status,
        rating,
        tags,
        actor,
        note,
    ])


def classify(decision: dict[str, Any]) -> str:
    status = str(decision.get("status") or "pending").lower()
    rating = decision.get("rating")
    if status == "reject":
        return "reject"
    if status == "favorite" or rating == 5:
        return "favorite"
    if status == "keep" or (isinstance(rating, int) and rating >= 4):
        return "keep"
    if status == "review":
        return "review"
    return "pending"


def quality_hints(decision: dict[str, Any]) -> dict[str, Any]:
    analysis = decision.get("analysis") if isinstance(decision.get("analysis"), dict) else {}
    hints = analysis.get("qualityHints") if isinstance(analysis.get("qualityHints"), dict) else {}
    return hints


def quality_flags(decision: dict[str, Any]) -> list[str]:
    hints = quality_hints(decision)
    flags = hints.get("qualityFlags") if isinstance(hints.get("qualityFlags"), list) else []
    problem_flags = (decision.get("analysis") or {}).get("problemFlags") if isinstance(decision.get("analysis"), dict) else []
    generic_flags = {"raw-review", "sequence-review"}
    combined: list[str] = []
    for flag in [*flags, *(problem_flags if isinstance(problem_flags, list) else [])]:
        if flag in generic_flags:
            continue
        if flag and flag not in combined:
            combined.append(str(flag))
    return combined


def quality_attention_score(decision: dict[str, Any]) -> int:
    flags = quality_flags(decision)
    score = len(flags)
    weight = {
        "thumbnail-analysis-suspect": 4,
        "blank-preview-candidate": 4,
        "preview-all-white": 4,
        "preview-very-dark": 4,
        "sharpness-review-candidate": 3,
        "exposure-review-candidate": 3,
        "highlight-clipping-preview": 2,
        "shadow-clipping-preview": 2,
    }
    return score + sum(weight.get(flag, 0) for flag in flags)


def build_quality_triage_groups(decisions: list[dict[str, Any]], groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    decisions_by_group: dict[str, list[dict[str, Any]]] = {}
    for decision in decisions:
        analysis = decision.get("analysis") if isinstance(decision.get("analysis"), dict) else {}
        group_id = str(analysis.get("reviewGroupId") or decision.get("reviewGroupId") or "")
        if not group_id:
            continue
        decisions_by_group.setdefault(group_id, []).append(decision)

    group_payloads: list[dict[str, Any]] = []
    for group in groups:
        group_id = str(group.get("id") or "")
        group_decisions = decisions_by_group.get(group_id, [])
        if not group_decisions:
            continue
        scored = sorted(group_decisions, key=quality_attention_score, reverse=True)
        flagged = [decision for decision in group_decisions if quality_attention_score(decision) > 0]
        all_flags: list[str] = []
        for decision in group_decisions:
            for flag in quality_flags(decision):
                if flag not in all_flags:
                    all_flags.append(flag)
        score = sum(quality_attention_score(decision) for decision in group_decisions)
        if not flagged:
            priority = "normal-sequence-review"
            next_action = "Review this group as a normal burst/sequence before selecting keepers."
            review_mode = "keeper-selection"
        elif any(flag in all_flags for flag in {"thumbnail-analysis-suspect", "blank-preview-candidate", "preview-all-white", "preview-very-dark"}):
            priority = "preview-suspect"
            next_action = "Inspect RAW/source before judging; the thumbnail preview may be misleading."
            review_mode = "source-inspection"
        elif any(flag in all_flags for flag in {"sharpness-review-candidate", "exposure-review-candidate"}):
            priority = "quality-review"
            next_action = "Compare nearby frames for sharpness/exposure before choosing keepers."
            review_mode = "burst-comparison"
        else:
            priority = "review-hints"
            next_action = "Use quality hints as routing context only; do not auto-reject."
            review_mode = "metadata-review"
        group_payloads.append({
            "groupId": group_id,
            "priority": priority,
            "recommendedReviewMode": review_mode,
            "score": score,
            "size": group.get("size") or len(group_decisions),
            "firstFilename": group.get("firstFilename") or (group_decisions[0].get("filename") if group_decisions else ""),
            "lastFilename": group.get("lastFilename") or (group_decisions[-1].get("filename") if group_decisions else ""),
            "flaggedCount": len(flagged),
            "qualityFlags": all_flags,
            "nextSafestAction": next_action,
            "samplePhotos": [
                {
                    "id": decision.get("id"),
                    "filename": decision.get("filename"),
                    "thumbnailPath": decision.get("thumbnailPath") or "",
                    "thumbnailRelativePath": decision.get("thumbnailRelativePath") or "",
                    "qualityFlags": quality_flags(decision),
                    "score": quality_attention_score(decision),
                }
                for decision in scored[:6]
            ],
            "commands": {
                "routeGroupReview": group_command(group_id, "review", "-", "quality-triage,needs-human-cull", "reviewer", "<quality hints reviewed; compare group>"),
                "keepGroup4": group_command(group_id, "keep", "4", "sequence-keeper", "reviewer", "<selected keepers after group review>"),
                "rejectGroup": group_command(group_id, "reject", "-", "sequence-reject", "reviewer", "<reject after human review only>"),
            },
            "truth": "Quality triage only. Hints route attention; they are not automatic keep/reject decisions.",
        })
    return sorted(group_payloads, key=lambda item: (item["score"], item["flaggedCount"], item["size"]), reverse=True)


def enrich_decisions(manifest: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    items_by_id = {item.get("id"): item for item in manifest.get("items") or []}
    enriched: list[dict[str, Any]] = []
    for decision in ledger.get("decisions") or []:
        source_item = items_by_id.get(decision.get("id")) or {}
        merged = {
            **source_item,
            **decision,
            "thumbnailPath": source_item.get("thumbnailPath") or "",
            "thumbnailRelativePath": source_item.get("thumbnailRelativePath") or "",
            "relativePath": source_item.get("relativePath") or decision.get("filename") or "",
            "metadata": source_item.get("metadata") or {},
            "analysis": source_item.get("analysis") or {},
        }
        merged["packetSection"] = classify(merged)
        enriched.append(merged)
    return enriched


def summarize(decisions: list[dict[str, Any]]) -> dict[str, int]:
    counts = {
        "total": len(decisions),
        "favorite": 0,
        "keep": 0,
        "review": 0,
        "pending": 0,
        "reject": 0,
        "selectedForClientProof": 0,
        "needsHumanAttention": 0,
        "rated": 0,
        "flagged": 0,
        "qualityReviewCandidates": 0,
    }
    for decision in decisions:
        section = decision.get("packetSection")
        if section in counts:
            counts[section] += 1
        if section in {"favorite", "keep"}:
            counts["selectedForClientProof"] += 1
        if section in {"review", "pending"}:
            counts["needsHumanAttention"] += 1
        if decision.get("rating") is not None:
            counts["rated"] += 1
        if decision.get("flags"):
            counts["flagged"] += 1
        if quality_attention_score(decision) > 0:
            counts["qualityReviewCandidates"] = counts.get("qualityReviewCandidates", 0) + 1
    return counts


def build_action_cards(decisions: list[dict[str, Any]], groups: list[dict[str, Any]], quality_triage_groups: list[dict[str, Any]]) -> dict[str, Any]:
    next_decisions = [
        decision for decision in decisions
        if decision.get("packetSection") in {"review", "pending"}
    ]
    next_decisions = sorted(next_decisions, key=quality_attention_score, reverse=True)[:24]
    return {
        "schema": "quipsly.photo-grove.action-cards.v1",
        "truth": "Safe local review commands only. Commands mutate Quipsly metadata ledgers, never original photos.",
        "qualityTriageGroupActions": quality_triage_groups[:24],
        "photoActions": [
            {
                "id": decision.get("id"),
                "filename": decision.get("filename"),
                "section": decision.get("packetSection"),
                "flags": decision.get("flags") or [],
                "qualityFlags": quality_flags(decision),
                "qualityScore": quality_attention_score(decision),
                "commands": {
                    "favorite5": command_for(decision, "favorite", "5", "favorite", "reviewer", "<why this is a hero frame>"),
                    "keep4": command_for(decision, "keep", "4", "keeper", "reviewer", "<why this should be kept>"),
                    "review": command_for(decision, "review", "-", "needs-human-cull", "reviewer", "<what needs checking>"),
                    "reject": command_for(decision, "reject", "-", "reject-candidate", "reviewer", "<why this can be rejected>"),
                },
            }
            for decision in next_decisions
        ],
        "groupActions": [
            {
                "groupId": group.get("id"),
                "size": group.get("size"),
                "firstFilename": group.get("firstFilename"),
                "lastFilename": group.get("lastFilename"),
                "commands": {
                    "routeGroupReview": group_command(str(group.get("id") or ""), "review", "-", "sequence-review,needs-human-cull", "reviewer", "<compare this burst>"),
                    "keepGroup4": group_command(str(group.get("id") or ""), "keep", "4", "sequence-keeper", "reviewer", "<group keeper note>"),
                    "rejectGroup": group_command(str(group.get("id") or ""), "reject", "-", "sequence-reject", "reviewer", "<group rejection note>"),
                },
            }
            for group in sorted(groups, key=lambda item: item.get("size") or 0, reverse=True)[:24]
        ],
    }


def build_copy_plan(decisions: list[dict[str, Any]], packet_dir: Path) -> list[dict[str, Any]]:
    plan: list[dict[str, Any]] = []
    for decision in decisions:
        if decision.get("packetSection") not in {"favorite", "keep"}:
            continue
        safe_stem = "".join(char if char.isalnum() or char in {"-", "_"} else "-" for char in Path(str(decision.get("filename") or "photo")).stem)
        plan.append({
            "id": decision.get("id"),
            "filename": decision.get("filename"),
            "section": decision.get("packetSection"),
            "rating": decision.get("rating"),
            "originalSourcePath": decision.get("sourcePath"),
            "reviewPreviewSourcePath": decision.get("thumbnailPath") or "",
            "plannedReviewPreviewDestination": str(packet_dir / "client-proof-previews" / f"{safe_stem}-{decision.get('id')}.jpg"),
            "copyExecuted": False,
            "truth": "Plan only. Originals are not copied or mutated by this packet.",
        })
    return plan


def write_csv(path: Path, decisions: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "packetSection",
            "id",
            "filename",
            "status",
            "rating",
            "tags",
            "flags",
            "reviewGroupId",
            "sourcePath",
            "thumbnailPath",
            "recommendedAction",
        ])
        writer.writeheader()
        for decision in decisions:
            section = decision.get("packetSection") or "pending"
            recommended = {
                "favorite": "include in client proof packet",
                "keep": "include after quick human check",
                "review": "human compare before selection",
                "pending": "needs cull decision",
                "reject": "exclude unless human reverses",
            }.get(section, "needs review")
            writer.writerow({
                "packetSection": section,
                "id": decision.get("id"),
                "filename": decision.get("filename"),
                "status": decision.get("status"),
                "rating": "" if decision.get("rating") is None else decision.get("rating"),
                "tags": ";".join(decision.get("tags") or []),
                "flags": ";".join(decision.get("flags") or []),
                "reviewGroupId": decision.get("reviewGroupId") or "",
                "sourcePath": decision.get("sourcePath") or "",
                "thumbnailPath": decision.get("thumbnailPath") or "",
                "recommendedAction": recommended,
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    lines = [
        "# Photo Grove review/export prep",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        packet["truth"],
        "",
        "## Counts",
        "",
        f"- Total: {counts['total']}",
        f"- Favorites: {counts['favorite']}",
        f"- Keep: {counts['keep']}",
        f"- Review: {counts['review']}",
        f"- Pending: {counts['pending']}",
        f"- Reject: {counts['reject']}",
        f"- Selected for client proof: {counts['selectedForClientProof']}",
        f"- Needs human attention: {counts['needsHumanAttention']}",
        f"- Quality review candidates: {counts.get('qualityReviewCandidates', 0)}",
        "",
        "## Start-here quality triage groups",
        "",
        "Quality hints route attention only. They are not automatic keep/reject decisions.",
        "",
        "| Group | Priority | Flagged | Flags | Next |",
        "| --- | --- | ---: | --- | --- |",
    ]
    for group in packet.get("qualityTriageGroups", [])[:14]:
        flags = ", ".join(group.get("qualityFlags") or []) or "none"
        lines.append(
            f"| `{group.get('groupId')}` | {group.get('priority')} | {group.get('flaggedCount')}/{group.get('size')} | {flags} | {group.get('nextSafestAction')} |"
        )
    lines.extend([
        "",
        "### Safe group review commands",
        "",
        "Use these when a whole burst/sequence decision is obvious after review. These update Quipsly metadata only.",
        "",
    ])
    for group in packet.get("qualityTriageGroups", [])[:8]:
        lines.append(f"#### {group.get('groupId')} - {group.get('recommendedReviewMode')}")
        for label, command in (group.get("commands") or {}).items():
            lines.append(f"- {label}: `{command}`")
        lines.append("")
    lines.extend([
        "",
        "## Selected / likely client proof candidates",
        "",
        "| File | Section | Rating | Tags | Flags |",
        "| --- | --- | ---: | --- | --- |",
    ])
    selected = [item for item in packet["decisions"] if item["packetSection"] in {"favorite", "keep"}]
    for decision in selected[:80]:
        rating = decision.get("rating") if decision.get("rating") is not None else "-"
        tags = ", ".join(decision.get("tags") or []) or "-"
        flags = ", ".join(decision.get("flags") or []) or "none"
        lines.append(f"| `{decision.get('filename')}` | {decision.get('packetSection')} | {rating} | {tags} | {flags} |")
    if not selected:
        lines.append("| _No selected photos yet_ | - | - | - | - |")
    lines.extend([
        "",
        "## Safe local commands",
        "",
        "These commands update Quipsly review metadata only. They do not touch originals.",
        "",
    ])
    for action in (packet.get("actionCards") or {}).get("photoActions", [])[:8]:
        lines.append(f"### {action.get('filename')}")
        for label, command in (action.get("commands") or {}).items():
            lines.append(f"- {label}: `{command}`")
        lines.append("")
    lines.extend([
        "## Files",
        "",
        f"- CSV: `{packet['csvPath']}`",
        f"- JSON: `{packet['jsonPath']}`",
        f"- HTML: `{packet['htmlPath']}`",
        "",
        "## Safety",
        "",
        "- Originals mutated: false",
        "- Copy plan executed: false",
        "- External delivery/publication: false",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    triage_cards = []
    for group in packet.get("qualityTriageGroups", [])[:14]:
        samples = []
        for sample in group.get("samplePhotos") or []:
            thumb = sample.get("thumbnailRelativePath") or sample.get("thumbnailPath") or ""
            if thumb:
                samples.append(f"<img src='{html.escape(str(thumb))}' alt='{html.escape(str(sample.get('filename') or 'photo'))}'>")
        flags = ", ".join(group.get("qualityFlags") or []) or "normal sequence review"
        triage_cards.append(f"""
          <article class="triage {html.escape(str(group.get('priority') or 'review'))}">
            <div class="triage-head">
              <b>{html.escape(str(group.get('groupId') or 'group'))}</b>
              <span>{html.escape(str(group.get('priority') or 'review'))}</span>
            </div>
            <p>{html.escape(str(group.get('nextSafestAction') or 'Review group.'))}</p>
            <small>{html.escape(str(group.get('flaggedCount')))} of {html.escape(str(group.get('size')))} flagged · {html.escape(flags)}</small>
            <small class="mode">{html.escape(str(group.get('recommendedReviewMode') or 'review'))}</small>
            <div class="triage-strip">{''.join(samples)}</div>
            <details><summary>Safe metadata commands</summary><pre>{html.escape(json.dumps(group.get('commands') or {}, indent=2))}</pre></details>
          </article>
        """)
    cards = []
    for decision in packet["decisions"][:160]:
        section = str(decision.get("packetSection") or "pending")
        thumb = decision.get("thumbnailRelativePath") or decision.get("thumbnailPath") or ""
        if thumb:
            preview = f"<img src='{html.escape(str(thumb))}' alt='Photo preview'>"
        else:
            preview = "<div class='empty'>Preview pending</div>"
        tags = ", ".join(decision.get("tags") or []) or "no tags"
        flags = ", ".join(decision.get("flags") or []) or "no flags"
        rating = decision.get("rating") if decision.get("rating") is not None else "-"
        cards.append(f"""
          <article class="card {html.escape(section)}">
            <div class="preview">{preview}</div>
            <div class="body">
              <b>{html.escape(str(decision.get('filename') or 'photo'))}</b>
              <span>{html.escape(section)} · rating {html.escape(str(rating))}</span>
              <small>{html.escape(tags)}</small>
              <small>{html.escape(flags)}</small>
            </div>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Photo Grove Export Prep</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111812; --panel:#1b271e; --ink:#f8f0dc; --muted:#c9bfa7; --moss:#8fc073; --gold:#e9c65b; --clay:#bf765a; --line:rgba(248,240,220,.16); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at top left, rgba(143,192,115,.18), transparent 36%), var(--bg); color:var(--ink); }}
    header {{ padding:34px clamp(20px,5vw,70px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ margin:10px 0; font-size:clamp(34px,6vw,76px); line-height:.92; }}
    p {{ color:var(--muted); max-width:900px; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; padding:22px clamp(16px,4vw,56px); }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:linear-gradient(180deg,var(--panel),#121a14); }}
    .stat b {{ display:block; font-size:30px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ padding:0 clamp(16px,4vw,56px) 56px; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:14px; }}
    .triage-grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:14px; margin-bottom:24px; }}
    .triage {{ border:1px solid var(--line); border-radius:22px; padding:14px; background:linear-gradient(180deg,rgba(27,39,30,.95),rgba(8,12,9,.95)); }}
    .triage.preview-suspect {{ border-color:rgba(191,118,90,.6); }}
    .triage.quality-review {{ border-color:rgba(233,198,91,.55); }}
    .triage-head {{ display:flex; justify-content:space-between; gap:10px; align-items:start; }}
    .triage-head span {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    .triage-strip {{ display:flex; gap:6px; overflow:hidden; margin-top:10px; }}
    .triage-strip img {{ width:54px; height:54px; border-radius:10px; object-fit:cover; border:1px solid var(--line); }}
    .mode {{ display:inline-flex; width:max-content; margin-top:8px; border-radius:999px; padding:5px 8px; background:rgba(143,192,115,.14); color:var(--moss); text-transform:uppercase; letter-spacing:.12em; font-size:10px; font-weight:900; }}
    .card {{ border:1px solid var(--line); border-radius:20px; overflow:hidden; background:rgba(0,0,0,.22); }}
    .card.favorite {{ border-color:rgba(233,198,91,.62); }}
    .card.keep {{ border-color:rgba(143,192,115,.48); }}
    .card.review, .card.pending {{ border-color:rgba(191,118,90,.45); }}
    .preview {{ height:170px; background:#070b08; display:grid; place-items:center; }}
    .preview img {{ width:100%; height:100%; object-fit:cover; display:block; }}
    .empty {{ color:var(--muted); }}
    .body {{ padding:13px; display:grid; gap:5px; }}
    .body span {{ color:var(--gold); font-weight:800; }}
    .body small {{ color:var(--muted); overflow-wrap:anywhere; }}
    details {{ margin-top:10px; }}
    summary {{ cursor:pointer; color:var(--gold); font-weight:800; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
    code {{ color:var(--gold); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Photo Grove Export Prep</div>
    <h1>Review choices become a calm packet.</h1>
    <p>{html.escape(packet['truth'])}</p>
    <p>Session: <code>{html.escape(packet['sessionDir'])}</code></p>
  </header>
  <div class="stats">
    <div class="stat"><b>{counts['total']}</b><span>Total</span></div>
    <div class="stat"><b>{counts['favorite']}</b><span>Favorites</span></div>
    <div class="stat"><b>{counts['keep']}</b><span>Keep</span></div>
    <div class="stat"><b>{counts['review']}</b><span>Review</span></div>
    <div class="stat"><b>{counts['pending']}</b><span>Pending</span></div>
    <div class="stat"><b>{counts['reject']}</b><span>Reject</span></div>
    <div class="stat"><b>{counts.get('qualityReviewCandidates', 0)}</b><span>Quality hints</span></div>
  </div>
  <main>
    <section>
      <h2>Start-here triage groups</h2>
      <p>Quality hints route attention only. They are not automatic keep/reject decisions.</p>
      <div class="triage-grid">{''.join(triage_cards)}</div>
    </section>
    <section class="grid">{''.join(cards)}</section>
  </main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def build_export_packet(session_dir: Path) -> dict[str, Any]:
    manifest_path = session_dir / "manifest.json"
    ledger_path = session_dir / "review-ledger.json"
    if not manifest_path.exists():
        raise SystemExit(f"Photo Grove manifest not found: {manifest_path}")
    if not ledger_path.exists():
        raise SystemExit(f"Photo Grove review ledger not found: {ledger_path}")
    manifest = load_json(manifest_path)
    ledger = load_json(ledger_path)
    decisions = enrich_decisions(manifest, ledger)
    groups = manifest.get("reviewGroups") or []
    quality_triage_groups = build_quality_triage_groups(decisions, groups)
    packet_dir = session_dir / "export-packets"
    packet_dir.mkdir(parents=True, exist_ok=True)
    csv_path = packet_dir / "photo-grove-export-prep.csv"
    json_path = packet_dir / "photo-grove-export-prep.json"
    md_path = packet_dir / "START-HERE-review-export-prep.md"
    html_path = packet_dir / "photo-grove-export-prep.html"
    packet: dict[str, Any] = {
        "schema": "quipsly.photo-grove.export-prep.v1",
        "generatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "manifestPath": str(manifest_path),
        "reviewLedgerPath": str(ledger_path),
        "csvPath": str(csv_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "truth": "Local review/export preparation only. Originals are untouched; no client delivery or external publication has happened.",
        "counts": summarize(decisions),
        "decisions": decisions,
        "qualityTriageGroups": quality_triage_groups,
        "copyPlan": build_copy_plan(decisions, packet_dir),
        "copyPlanExecuted": False,
        "actionCards": build_action_cards(decisions, groups, quality_triage_groups),
        "originalsMutated": False,
        "externalDeliveryCreated": False,
    }
    write_csv(csv_path, decisions)
    write_json(json_path, packet)
    write_markdown(md_path, packet)
    write_html(html_path, packet)
    write_json(LATEST_EXPORT_PREP_POINTER, {
        "schema": "quipsly.photo-grove.latest-export-prep.v1",
        "generatedAt": packet["generatedAt"],
        "status": "photo-grove-export-prep-ready",
        "sessionDir": packet["sessionDir"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "htmlPath": packet["htmlPath"],
        "csvPath": packet["csvPath"],
        "counts": packet["counts"],
        "copyPlanRows": len(packet.get("copyPlan") or []),
        "copyPlanExecuted": False,
        "originalsMutated": False,
        "externalDeliveryCreated": False,
        "truth": packet["truth"],
        "firstSafeAction": {
            "label": "Open Photo Grove export prep",
            "command": f"open {shlex.quote(packet['htmlPath'])}",
            "path": packet["htmlPath"],
            "safety": "Opens local review/export-prep evidence only. It does not copy originals, mutate metadata, deliver, upload, publish, schedule, or create receipt truth.",
        },
        "nextSafestAction": "Review selected/favorite/keep rows and quality-triage groups before preparing any client proof packet.",
    })
    return packet


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Photo Grove review/export-prep packet.")
    parser.add_argument("session", nargs="?", default="latest")
    session_dir = resolve_session(parser.parse_args().session)
    packet = build_export_packet(session_dir)
    print(json.dumps({
        "ok": True,
        "sessionDir": packet["sessionDir"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "htmlPath": packet["htmlPath"],
        "csvPath": packet["csvPath"],
        "counts": packet["counts"],
        "copyPlanExecuted": False,
        "originalsMutated": False,
        "externalDeliveryCreated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
