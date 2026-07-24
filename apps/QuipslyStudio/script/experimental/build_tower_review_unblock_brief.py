#!/usr/bin/env python3
"""Build a focused Tower review unblock brief.

This is a local-only publication runway helper. It reads the latest Publisher
Desk and turns the blocked review pile into a small, ranked operator brief. It
does not publish, upload, schedule, approve, capture receipts, or mutate media.
"""
from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.review-unblock-brief.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-review-unblock")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                target_payload = load_json(target, _depth=1)
                if target_payload:
                    return {**payload, **target_payload}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def warning_score(row: dict[str, Any]) -> int:
    warnings = row.get("warnings") if isinstance(row.get("warnings"), list) else []
    score = len(warnings) * 10
    if row.get("durationCandidateReviewHtml"):
        score += 5
    if row.get("syncInvestigationHtml"):
        score += 5
    if str(row.get("currentDecision") or "").lower() == "pending":
        score += 1
    return score


def summarize_row(row: dict[str, Any], rank: int) -> dict[str, Any]:
    warnings = row.get("warnings") if isinstance(row.get("warnings"), list) else []
    review_packet = (
        row.get("durationCandidateReviewHtml")
        or row.get("syncInvestigationHtml")
        or row.get("primaryPath")
        or ""
    )
    open_review_command = (
        row.get("durationCandidateReviewCommand")
        or row.get("syncInvestigationCommand")
        or (f"open {shell_quote(str(review_packet))}" if review_packet else "")
    )
    return {
        "rank": rank,
        "episode": row.get("episode"),
        "artifactId": row.get("artifactId") or "",
        "label": row.get("label") or row.get("artifactId") or "Artifact",
        "version": row.get("version") or "",
        "currentDecision": row.get("currentDecision") or "",
        "episodeStatus": row.get("episodeStatus") or "",
        "durationLabel": row.get("durationLabel") or "",
        "recommendedFirstAction": row.get("recommendedFirstAction") or "",
        "warnings": warnings,
        "primaryPath": row.get("primaryPath") or "",
        "openArtifactCommand": row.get("openCommand") or "",
        "reviewPacketPath": str(review_packet),
        "openReviewCommand": str(open_review_command),
        "approveDryRunCommand": row.get("approveDryRunCommand") or "",
        "refineDryRunCommand": row.get("refineDryRunCommand") or "",
        "holdDryRunCommand": row.get("holdDryRunCommand") or "",
        "pendingDryRunCommand": row.get("pendingDryRunCommand") or "",
        "reviewPrompt": row.get("reviewPrompt") or "",
        "truth": row.get("truth") or "Local review decision only. No external publication/upload/schedule/receipt.",
    }


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def summarize_safe_queue_item(item: dict[str, Any], rank: int, blocker_by_episode: dict[int, dict[str, Any]]) -> dict[str, Any]:
    episode = int(item.get("episode") or 0)
    blocker = blocker_by_episode.get(episode, {})
    return {
        "rank": rank,
        "id": item.get("id") or f"safe-action-{rank}",
        "lane": item.get("lane") or "Studio podcast/video",
        "kind": item.get("kind") or "local-review-evidence",
        "episode": episode or "",
        "label": item.get("label") or "Open local review evidence",
        "currentVersion": item.get("currentVersion") or blocker.get("version") or "",
        "candidateVersion": item.get("candidateVersion") or "",
        "command": item.get("command") or "",
        "path": item.get("path") or "",
        "safety": item.get("safety") or "Local evidence only. No external platform action.",
        "why": item.get("why") or blocker.get("nextSafestAction") or "Open evidence and choose the next reversible local action.",
        "publishBlockerStatus": blocker.get("status") or "",
        "publishBlockerLabel": blocker.get("label") or "",
        "publishBlockerPlain": blocker.get("plain") or "",
        "dryRunCommandTemplate": item.get("dryRunCommandTemplate") or "",
        "executeCommandTemplateAfterPreview": item.get("executeCommandTemplateAfterPreview") or "",
        "humanDecisionMenu": [
            "approve local review evidence",
            "refine in the editor/export pipeline",
            "hold and explain the blocker",
            "return to pending with notes",
        ],
        "agentCanDoNow": (
            "Open and summarize local evidence, prepare watch/listen notes, compare manifests, "
            "draft metadata packets, and preview dry-run review commands. Do not publish, upload, "
            "schedule, capture receipts, approve on a human's behalf, overwrite, delete, or mutate sources."
        ),
        "reviewerQuestion": item.get("why") or blocker.get("nextSafestAction") or "What is the safest local review decision for this evidence?",
    }


def build_unblock_items(package_quality: dict[str, Any]) -> list[dict[str, Any]]:
    blockers = [item for item in as_list(package_quality.get("publishBlockers")) if isinstance(item, dict)]
    blocker_by_episode = {int(item.get("episode") or 0): item for item in blockers if int(item.get("episode") or 0)}
    queue = [item for item in as_list(package_quality.get("safeReviewQueue")) if isinstance(item, dict)]
    items = [summarize_safe_queue_item(item, index + 1, blocker_by_episode) for index, item in enumerate(queue)]
    existing = {str(item.get("id")) for item in items}
    episodes_with_evidence_actions = {int(item.get("episode") or 0) for item in items if int(item.get("episode") or 0)}
    for blocker in blockers:
        episode = int(blocker.get("episode") or 0)
        synthetic_id = f"episode-{episode}-publish-blocker"
        if not episode or synthetic_id in existing or episode in episodes_with_evidence_actions:
            continue
        items.append({
            "rank": len(items) + 1,
            "id": synthetic_id,
            "lane": "Studio podcast/video",
            "kind": "publish-readiness-blocker",
            "episode": episode,
            "label": f"Episode {episode}: {blocker.get('label') or 'Publishing blocker'}",
            "currentVersion": blocker.get("version") or "",
            "candidateVersion": "",
            "command": "",
            "path": "",
            "safety": "Local readiness note only. No approval, publish, upload, schedule, receipt, overwrite, delete, or source mutation.",
            "why": blocker.get("nextSafestAction") or blocker.get("plain") or "Resolve local review truth before Tower platform prep.",
            "publishBlockerStatus": blocker.get("status") or "",
            "publishBlockerLabel": blocker.get("label") or "",
            "publishBlockerPlain": blocker.get("plain") or "",
            "dryRunCommandTemplate": "",
            "executeCommandTemplateAfterPreview": "",
            "humanDecisionMenu": [
                "hold local package",
                "refine local package",
                "return to pending with clearer notes",
            ],
            "agentCanDoNow": "Make the blocker more visible and gather local evidence. Do not force a bad sync, promote a candidate, publish, upload, schedule, overwrite, delete, capture receipts, or mutate sources.",
            "reviewerQuestion": blocker.get("nextSafestAction") or blocker.get("plain") or "What local evidence is still missing?",
        })
    return items


def build_reviewer_runway(unblock_items: list[dict[str, Any]], review_rows: list[dict[str, Any]], counts: dict[str, Any]) -> dict[str, Any]:
    first_items = unblock_items[:3]
    first = first_items[0] if first_items else {}
    episode_order: list[int] = []
    for item in unblock_items:
        episode = int(item.get("episode") or 0)
        if episode and episode not in episode_order:
            episode_order.append(episode)
    return {
        "mode": "local-review-runway",
        "headline": "Clear local review truth before Tower publishing work.",
        "firstFifteenMinutes": [
            "Open the first unblock item.",
            "Watch or listen only enough to classify the issue honestly.",
            "Record notes as local review truth; do not publish or capture receipts.",
        ],
        "firstHour": [
            "Handle the first three unblock items, or as many as can be judged calmly.",
            "If evidence is unclear, mark hold/refine instead of guessing.",
            "Keep preparing platform packets only as drafts until local review blockers are cleared.",
        ],
        "episodeOrder": episode_order,
        "startHere": {
            "label": first.get("label") or "No local review blockers found",
            "episode": first.get("episode") or "",
            "command": first.get("command") or "",
            "why": first.get("why") or "No unblock action available.",
            "safety": first.get("safety") or "No action.",
        },
        "parallelWorkForCodex": [
            "Improve review packets, manifests, notes, and platform metadata drafts.",
            "Prepare dry-run review commands and receipt slots without writing receipt truth.",
            "Make blockers more precise so Mako/Charlie/Homer can decide quickly.",
        ],
        "doNotDo": [
            "Do not publish, upload, schedule, send, or mutate accounts.",
            "Do not call a packet published without a real external URL or provider receipt.",
            "Do not overwrite old versions or mutate original media.",
            "Do not promote a candidate because it merely exists.",
        ],
        "clearanceDefinition": (
            "A package leaves this runway only when local watch/listen review has an explicit approve, "
            "refine, hold, reject, or pending-with-notes decision. Platform packets still remain drafts until "
            "Charlie explicitly approves external action."
        ),
        "counts": {
            "unblockItems": len(unblock_items),
            "reviewRows": len(review_rows),
            "reviewablePackages": counts.get("reviewablePackages", 0),
            "packetPrepReadyPackages": counts.get("packetPrepReadyPackages", 0),
            "publishBlockedPackages": counts.get("publishBlockedPackages", 0),
            "receiptSlots": counts.get("receiptSlots", 0),
            "capturedReceipts": counts.get("capturedReceipts", 0),
        },
    }


def build_payload(release_root: Path, limit: int) -> dict[str, Any]:
    publisher = load_json(release_root / "tower-publisher-desk" / "latest-tower-publisher-desk.json")
    package_quality = load_json(release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json")
    rows = publisher.get("reviewRowsSample") if isinstance(publisher.get("reviewRowsSample"), list) else []
    ranked = sorted([row for row in rows if isinstance(row, dict)], key=lambda row: (-warning_score(row), int(row.get("episode") or 999), str(row.get("artifactId") or "")))
    review_rows = [summarize_row(row, index + 1) for index, row in enumerate(ranked[:limit])]
    blockers = [str(item) for item in publisher.get("blockers") or [] if str(item).strip()]
    counts = publisher.get("counts") if isinstance(publisher.get("counts"), dict) else {}
    quality_counts = package_quality.get("counts") if isinstance(package_quality.get("counts"), dict) else {}
    unblock_items = build_unblock_items(package_quality)[:limit]
    first_unblock = unblock_items[0] if unblock_items else {}
    counts_payload = {
        "unblockItems": len(unblock_items),
        "reviewRows": len(review_rows),
        "sourceReviewRows": len(rows),
        "blockers": len(blockers),
        "reviewablePackages": quality_counts.get("reviewablePackages", 0),
        "packetPrepReadyPackages": quality_counts.get("packetPrepReadyPackages", 0),
        "publishBlockedPackages": quality_counts.get("publishBlockedPackages", 0),
        "durationWorkorders": quality_counts.get("durationWorkorders", 0),
        "syncInvestigationRows": quality_counts.get("syncInvestigationRows", 0),
        "warningRows": counts.get("warningRows", 0),
        "pendingRows": counts.get("pendingRows", 0),
        "readyForApproval": counts.get("readyForApproval", 0),
        "receiptSlots": counts.get("receiptSlots", 0),
        "capturedReceipts": counts.get("capturedReceipts", 0),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-review-unblock-ready" if review_rows or unblock_items else "tower-review-unblock-empty",
        "releaseRoot": str(release_root),
        "sourcePublisherDeskJson": publisher.get("jsonPath") or "",
        "sourcePublisherDeskHtml": publisher.get("htmlPath") or "",
        "sourcePackageQualityJson": package_quality.get("jsonPath") or str(release_root / "review-board" / "studio-package-quality-desk" / "latest-studio-package-quality-desk.json"),
        "sourcePackageQualityHtml": package_quality.get("htmlPath") or "",
        "counts": counts_payload,
        "blockers": blockers,
        "unblockItems": unblock_items,
        "reviewRows": review_rows,
        "reviewerRunway": build_reviewer_runway(unblock_items, review_rows, counts_payload),
        "firstUnblockAction": first_unblock,
        "nextSafestAction": first_unblock.get("why") or "Open the first review packet, watch/listen locally, then record a dry-run decision before any real review ledger update.",
        "truth": "Tower review unblock brief only. It does not publish, upload, schedule, approve externally, mutate media, or capture receipts.",
        "safety": "Local review triage only. Use dry-run commands first; real ledger decisions still require explicit human judgment.",
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fieldnames = [
        "rank", "episode", "artifactId", "label", "version", "currentDecision", "episodeStatus", "durationLabel", "recommendedFirstAction", "warnings", "openReviewCommand", "openArtifactCommand", "approveDryRunCommand", "refineDryRunCommand", "holdDryRunCommand", "pendingDryRunCommand",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in payload["reviewRows"]:
            csv_row = {key: row.get(key, "") for key in fieldnames}
            csv_row["warnings"] = " | ".join(row.get("warnings") or [])
            writer.writerow(csv_row)


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Tower review unblock brief",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Studio unblock items: `{payload['counts']['unblockItems']}`",
        f"- Review rows in this brief: `{payload['counts']['reviewRows']}`",
        f"- Reviewable packages: `{payload['counts']['reviewablePackages']}`",
        f"- Packet-prep-ready packages: `{payload['counts']['packetPrepReadyPackages']}`",
        f"- Publish-blocked packages: `{payload['counts']['publishBlockedPackages']}`",
        f"- Warning rows in Publisher Desk: `{payload['counts']['warningRows']}`",
        f"- Pending rows in Publisher Desk: `{payload['counts']['pendingRows']}`",
        "",
        payload["truth"],
        "",
        "## Reviewer runway",
        "",
        f"- Mode: `{payload['reviewerRunway']['mode']}`",
        f"- Start here: {payload['reviewerRunway']['startHere']['label']}",
        f"- Why: {payload['reviewerRunway']['startHere']['why']}",
        f"- Command: `{payload['reviewerRunway']['startHere']['command']}`",
        f"- Clearance definition: {payload['reviewerRunway']['clearanceDefinition']}",
        "",
        "### First 15 minutes",
        "",
    ]
    for step in payload["reviewerRunway"]["firstFifteenMinutes"]:
        lines.append(f"- {step}")
    lines.extend(["", "### First hour", ""])
    for step in payload["reviewerRunway"]["firstHour"]:
        lines.append(f"- {step}")
    lines.extend(["", "### Do not do", ""])
    for step in payload["reviewerRunway"]["doNotDo"]:
        lines.append(f"- {step}")
    lines.extend([
        "",
        "## Blockers",
        "",
    ])
    for blocker in payload["blockers"] or ["No blockers reported by Publisher Desk."]:
        lines.append(f"- {blocker}")
    lines.extend(["", "## Start here: Studio package blockers", ""])
    for item in payload["unblockItems"]:
        lines.extend([
            f"### {item['rank']}. {item['label']}",
            f"- Lane: `{item['lane']}` / kind `{item['kind']}`",
            f"- Episode: `{item['episode']}` / current `{item['currentVersion']}` / candidate `{item['candidateVersion']}`",
            f"- Why: {item['why']}",
            f"- Publish blocker: `{item['publishBlockerStatus']}` {item['publishBlockerPlain']}",
            f"- Safety: {item['safety']}",
            f"- Reviewer question: {item.get('reviewerQuestion', '')}",
            f"- Agent can do now: {item.get('agentCanDoNow', '')}",
            f"- Command: `{item['command']}`",
        ])
        if item.get("dryRunCommandTemplate"):
            lines.append(f"- Dry-run template: `{item['dryRunCommandTemplate']}`")
        if item.get("executeCommandTemplateAfterPreview"):
            lines.append(f"- Execute only after preview: `{item['executeCommandTemplateAfterPreview']}`")
        lines.append("")
    lines.extend(["", "## Review first", ""])
    for row in payload["reviewRows"]:
        lines.extend([
            f"### {row['rank']}. Episode {row['episode']} - {row['label']}",
            f"- Artifact: `{row['artifactId']}` / version `{row['version']}`",
            f"- Current decision: `{row['currentDecision']}`",
            f"- Recommended first action: {row['recommendedFirstAction']}",
            f"- Review prompt: {row['reviewPrompt']}",
            f"- Open review packet: `{row['openReviewCommand']}`",
            f"- Open artifact: `{row['openArtifactCommand']}`",
            f"- Dry-run approve: `{row['approveDryRunCommand']}`",
            f"- Dry-run refine: `{row['refineDryRunCommand']}`",
            f"- Dry-run hold: `{row['holdDryRunCommand']}`",
        ])
        if row["warnings"]:
            lines.append("- Warnings:")
            for warning in row["warnings"]:
                lines.append(f"  - {warning}")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    blocker_items = "".join(f"<li>{html.escape(blocker)}</li>" for blocker in payload["blockers"])
    runway = payload.get("reviewerRunway") if isinstance(payload.get("reviewerRunway"), dict) else {}
    first_15 = "".join(f"<li>{html.escape(str(step))}</li>" for step in runway.get("firstFifteenMinutes", []))
    first_hour = "".join(f"<li>{html.escape(str(step))}</li>" for step in runway.get("firstHour", []))
    do_not = "".join(f"<li>{html.escape(str(step))}</li>" for step in runway.get("doNotDo", []))
    start_here = runway.get("startHere") if isinstance(runway.get("startHere"), dict) else {}
    unblock_cards = []
    for item in payload["unblockItems"]:
        dry_run = f"<p><b>Dry-run template</b><br><code>{html.escape(str(item['dryRunCommandTemplate']))}</code></p>" if item.get("dryRunCommandTemplate") else ""
        execute = f"<p><b>Execute only after preview</b><br><code>{html.escape(str(item['executeCommandTemplateAfterPreview']))}</code></p>" if item.get("executeCommandTemplateAfterPreview") else ""
        unblock_cards.append(f"""
        <article class="card unblock">
          <p class="eyebrow">{html.escape(str(item['lane']))} · {html.escape(str(item['kind']))}</p>
          <h2>{html.escape(str(item['rank']))}. {html.escape(str(item['label']))}</h2>
          <p><b>Episode:</b> {html.escape(str(item['episode']))} · <b>Current:</b> {html.escape(str(item['currentVersion']))} · <b>Candidate:</b> {html.escape(str(item['candidateVersion'] or 'none'))}</p>
          <p>{html.escape(str(item['why']))}</p>
          <p><b>Publish blocker:</b> {html.escape(str(item['publishBlockerStatus'] or 'none'))}<br>{html.escape(str(item['publishBlockerPlain'] or ''))}</p>
          <p><b>Reviewer question:</b> {html.escape(str(item.get('reviewerQuestion') or ''))}</p>
          <p><b>Codex can do now:</b> {html.escape(str(item.get('agentCanDoNow') or ''))}</p>
          <p><b>Open evidence</b><br><code>{html.escape(str(item['command']))}</code></p>
          {dry_run}
          {execute}
          <p class="safety">{html.escape(str(item['safety']))}</p>
        </article>
        """)
    cards = []
    for row in payload["reviewRows"]:
        warnings = "".join(f"<li>{html.escape(warning)}</li>" for warning in row["warnings"])
        cards.append(f"""
        <article class="card">
          <p class="eyebrow">Episode {html.escape(str(row['episode']))} · {html.escape(str(row['artifactId']))} · {html.escape(str(row['version']))}</p>
          <h2>{html.escape(str(row['rank']))}. {html.escape(str(row['label']))}</h2>
          <p><b>Decision:</b> {html.escape(str(row['currentDecision']))} · <b>Duration:</b> {html.escape(str(row['durationLabel']))}</p>
          <p>{html.escape(str(row['reviewPrompt']))}</p>
          <p><b>Open review packet</b><br><code>{html.escape(str(row['openReviewCommand']))}</code></p>
          <p><b>Open artifact</b><br><code>{html.escape(str(row['openArtifactCommand']))}</code></p>
          <p><b>Dry-run commands</b><br><code>{html.escape(str(row['approveDryRunCommand']))}</code><br><code>{html.escape(str(row['refineDryRunCommand']))}</code><br><code>{html.escape(str(row['holdDryRunCommand']))}</code></p>
          {f'<ul class="warnings">{warnings}</ul>' if warnings else ''}
        </article>
        """)
    path.write_text(f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Tower review unblock brief</title>
<style>
:root {{ color-scheme: dark; --bg:#15170f; --panel:#222719; --ink:#fff6d7; --muted:#c9bc91; --line:#4a472c; --gold:#f7ca45; --red:#ef6b64; }}
body {{ margin:0; background:radial-gradient(circle at top left,#263621,#15170f 45%); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }}
main {{ max-width:1120px; margin:0 auto; padding:40px 24px; }}
.hero,.card {{ background:rgba(34,39,25,.92); border:1px solid var(--line); border-radius:22px; padding:24px; box-shadow:0 18px 44px rgba(0,0,0,.22); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:16px; margin-top:20px; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
h1,h2 {{ margin:.2em 0; }}
code {{ white-space:pre-wrap; overflow-wrap:anywhere; color:#d7f5d0; }}
.warnings {{ border-left:4px solid var(--red); padding-left:22px; color:#ffd5d2; }}
</style></head><body><main>
<section class="hero">
  <p class="eyebrow">Quipsly Tower</p>
  <h1>Review unblock brief</h1>
  <p>{html.escape(payload['truth'])}</p>
  <p><b>Studio unblock items:</b> {payload['counts']['unblockItems']} · <b>Reviewable packages:</b> {payload['counts']['reviewablePackages']} · <b>Packet-prep-ready:</b> {payload['counts']['packetPrepReadyPackages']} · <b>Publish-blocked:</b> {payload['counts']['publishBlockedPackages']} · <b>Receipts:</b> {payload['counts']['capturedReceipts']}</p>
</section>
<section class="hero runway">
  <p class="eyebrow">Away-mode reviewer runway</p>
  <h1>{html.escape(str(runway.get('headline') or 'Clear local review truth.'))}</h1>
  <p><b>Start here:</b> {html.escape(str(start_here.get('label') or 'No first action'))}</p>
  <p>{html.escape(str(start_here.get('why') or ''))}</p>
  <p><b>Open evidence</b><br><code>{html.escape(str(start_here.get('command') or ''))}</code></p>
  <p><b>Clearance:</b> {html.escape(str(runway.get('clearanceDefinition') or ''))}</p>
  <div class="grid">
    <article class="card"><h2>First 15 minutes</h2><ul>{first_15}</ul></article>
    <article class="card"><h2>First hour</h2><ul>{first_hour}</ul></article>
    <article class="card"><h2>Do not do</h2><ul>{do_not}</ul></article>
  </div>
</section>
<section class="hero">
  <h2>Blockers</h2>
  <ul>{blocker_items}</ul>
</section>
<h1>Start here: Studio package blockers</h1>
<section class="grid">{''.join(unblock_cards)}</section>
<h1>Tower review rows</h1>
<section class="grid">{''.join(cards)}</section>
</main></body></html>""", encoding="utf-8")


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_RELEASE_ROOT
    limit = int(sys.argv[2]) if len(sys.argv) > 2 and str(sys.argv[2]).isdigit() else 12
    session_dir = release_root / "tower-review-unblock-brief" / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(release_root, limit)
    json_path = session_dir / "tower-review-unblock-brief.json"
    markdown_path = session_dir / "START-HERE-tower-review-unblock-brief.md"
    csv_path = session_dir / "tower-review-unblock-brief.csv"
    html_path = session_dir / "index.html"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Tower review unblock brief",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local review evidence only. No external publication, upload, scheduling, account mutation, or receipt capture.",
        },
    })
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = release_root / "tower-review-unblock-brief" / "latest-tower-review-unblock-brief.json"
    write_json(pointer, {
        "schema": SCHEMA,
        "status": payload["status"],
        "updatedAt": payload["generatedAt"],
        "humanAsk": "Open the first unblock item, review the evidence, and record a local review decision before platform work advances.",
        "agentSafeParallelWork": "Codex may prepare evidence summaries, metadata drafts, dry-run commands, and blocker explanations. Do not approve, publish, upload, schedule, mutate accounts, overwrite, or create receipts.",
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "reviewerRunway": payload["reviewerRunway"],
        "firstSafeAction": payload["firstSafeAction"],
        "firstUnblockAction": payload["firstUnblockAction"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    })
    print(json.dumps(load_json(pointer), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
