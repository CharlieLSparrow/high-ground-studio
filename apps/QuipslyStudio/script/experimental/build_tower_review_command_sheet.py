#!/usr/bin/env python3
"""Build a Tower local review command sheet.

This is the bridge before publishing: it surfaces local approve/refine/hold/
pending commands for each episode artifact, while keeping external receipt
capture separate. It does not execute any command, approve anything, publish,
upload, schedule, mutate accounts, or capture receipts.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower.review-command-sheet.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-tower-review-command-sheet")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def dry_run_review_command(command: str) -> str:
    if not command:
        return ""
    return command.replace("./script/agentctl.sh tower-review-decision ", "./script/agentctl.sh tower-review-decision-dry-run ", 1)


def load_latest_runway(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "tower-runway" / "latest-tower-runway.json"
    pointer = load_json(pointer_path)
    runway_path = Path(str(pointer.get("jsonPath") or ""))
    runway = load_json(runway_path) if runway_path.exists() else {}
    if not runway:
        raise SystemExit("No Tower runway found. Run ./script/agentctl.sh tower-runway first.")
    return pointer, runway, runway_path


def load_duration_candidate_review(release_root: Path) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-duration-candidate-review.json")
    if not pointer:
        return {}
    pointer.setdefault("openCommand", f"open {shell_quote(str(pointer.get('htmlPath') or ''))}" if pointer.get("htmlPath") else "")
    return pointer


def load_sync_investigation(release_root: Path) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-sync-investigation.json")
    if not pointer:
        return {}
    pointer.setdefault("openCommand", f"open {shell_quote(str(pointer.get('htmlPath') or ''))}" if pointer.get("htmlPath") else "")
    return pointer


def receipt_preview(ep: dict[str, Any]) -> list[dict[str, str]]:
    action_cards = ep.get("actionCards") if isinstance(ep.get("actionCards"), dict) else {}
    receipts = action_cards.get("receiptActions") if isinstance(action_cards.get("receiptActions"), list) else []
    rows: list[dict[str, str]] = []
    for item in receipts:
        if not isinstance(item, dict):
            continue
        rows.append({
            "platform": str(item.get("platform") or ""),
            "currentStatus": str(item.get("currentStatus") or ""),
            "commandTemplate": str(item.get("commandTemplate") or ""),
            "truth": str(item.get("truth") or ""),
        })
    return rows


def artifact_media_evidence(ep: dict[str, Any], artifact_id: str) -> dict[str, Any]:
    long_form = ep.get("longForm") if isinstance(ep.get("longForm"), dict) else {}
    shorts = ep.get("shorts") if isinstance(ep.get("shorts"), dict) else {}
    if artifact_id == "longForm16x9":
        media = long_form.get("video16x9") if isinstance(long_form.get("video16x9"), dict) else {}
        return {
            "primaryPath": media.get("path") or "",
            "durationLabel": media.get("durationLabel") or "",
            "status": media.get("status") or "",
            "reviewPrompt": "Watch the episode master. Check story flow, sync, audio/video drift, obvious black/gap spots, and whether the ending feels intentional.",
            "openCommand": f"open {shell_quote(str(media.get('path') or ''))}" if media.get("path") else "",
            "samplePaths": [],
        }
    if artifact_id == "longForm9x16":
        media = long_form.get("video9x16") if isinstance(long_form.get("video9x16"), dict) else {}
        return {
            "primaryPath": media.get("path") or "",
            "durationLabel": media.get("durationLabel") or "",
            "status": media.get("status") or "",
            "reviewPrompt": "Watch enough of the vertical master to confirm framing, stacked/split-screen defaults, captions/text placement, and no accidental face-covering overlays.",
            "openCommand": f"open {shell_quote(str(media.get('path') or ''))}" if media.get("path") else "",
            "samplePaths": [],
        }
    if artifact_id == "podcastAudio":
        media = long_form.get("podcastAudio") if isinstance(long_form.get("podcastAudio"), dict) else {}
        return {
            "primaryPath": media.get("path") or "",
            "durationLabel": media.get("durationLabel") or "",
            "status": media.get("status") or "",
            "reviewPrompt": "Listen for intro/outro completeness, sync with the approved video edit, dead air, abrupt cuts, and any duration mismatch warning.",
            "openCommand": f"open {shell_quote(str(media.get('path') or ''))}" if media.get("path") else "",
            "samplePaths": [],
        }
    if artifact_id == "shorts":
        samples = [item for item in (shorts.get("sample") or []) if isinstance(item, dict)]
        sample_paths = [str(item.get("path") or "") for item in samples if item.get("path")]
        first_path = sample_paths[0] if sample_paths else ""
        return {
            "primaryPath": first_path,
            "durationLabel": ", ".join(str(item.get("durationLabel") or "") for item in samples[:5] if item.get("durationLabel")),
            "status": f"{shorts.get('readyCount') or 0}/{shorts.get('count') or 0} ready",
            "reviewPrompt": "Review the short set for hook strength, framing, captions/text placement, ending, platform usefulness, and duplicate/weak clips.",
            "openCommand": f"open {shell_quote(first_path)}" if first_path else "",
            "samplePaths": sample_paths[:8],
        }
    return {
        "primaryPath": "",
        "durationLabel": "",
        "status": "",
        "reviewPrompt": "Open the local artifact and decide approve/refine/hold/pending from evidence.",
        "openCommand": "",
        "samplePaths": [],
    }


def artifact_rows(ep: dict[str, Any]) -> list[dict[str, Any]]:
    action_cards = ep.get("actionCards") if isinstance(ep.get("actionCards"), dict) else {}
    review_actions = action_cards.get("reviewActions") if isinstance(action_cards.get("reviewActions"), list) else []
    rows: list[dict[str, Any]] = []
    for item in review_actions:
        if not isinstance(item, dict):
            continue
        commands = item.get("commands") if isinstance(item.get("commands"), dict) else {}
        approve_command = commands.get("approve") or ""
        refine_command = commands.get("refine") or ""
        hold_command = commands.get("hold") or ""
        pending_command = commands.get("pending") or ""
        reject_command = commands.get("reject") or ""
        current = str(item.get("currentDecision") or "pending")
        artifact_id = str(item.get("artifactId") or "")
        media = artifact_media_evidence(ep, artifact_id)
        rows.append({
            "episode": ep.get("episode"),
            "version": ep.get("version") or "",
            "episodeStatus": ep.get("status") or "",
            "artifactId": artifact_id,
            "label": item.get("label") or item.get("artifactId") or "artifact",
            "currentDecision": current,
            "assetCount": item.get("assetCount") or 0,
            "primaryPath": media.get("primaryPath") or "",
            "samplePaths": media.get("samplePaths") or [],
            "openCommand": media.get("openCommand") or "",
            "durationLabel": media.get("durationLabel") or "",
            "mediaStatus": media.get("status") or "",
            "reviewPrompt": media.get("reviewPrompt") or "",
            "warnings": ep.get("warnings") or [],
            "recommendedFirstAction": "dry-run-then-review-warning-before-approval" if ep.get("warnings") else "dry-run-after-watching-then-decide",
            "approveDryRunCommand": dry_run_review_command(approve_command),
            "refineDryRunCommand": dry_run_review_command(refine_command),
            "holdDryRunCommand": dry_run_review_command(hold_command),
            "pendingDryRunCommand": dry_run_review_command(pending_command),
            "needsHumanDryRunCommand": dry_run_review_command(pending_command),
            "rejectDryRunCommand": dry_run_review_command(reject_command),
            "approveCommand": approve_command,
            "refineCommand": refine_command,
            "holdCommand": hold_command,
            "pendingCommand": pending_command,
            "needsHumanCommand": pending_command,
            "rejectCommand": reject_command,
            "truth": item.get("truth") or "Local review ledger decision only; not an external publication receipt.",
        })
    return rows


def review_plan_by_episode(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(str(row.get("episode") or ""), []).append(row)
    plans: list[dict[str, Any]] = []
    for episode in sorted(grouped, key=lambda value: int(value) if value.isdigit() else 0):
        episode_rows = grouped[episode]
        pending = [row for row in episode_rows if row.get("currentDecision") == "pending"]
        warnings = sorted({warning for row in episode_rows for warning in (row.get("warnings") or [])})
        plans.append({
            "episode": int(episode) if episode.isdigit() else episode,
            "version": str(episode_rows[0].get("version") or ""),
            "pendingReviewRows": len(pending),
            "warningCount": len(warnings),
            "warnings": warnings,
            "reviewOrder": [
                {
                    "artifactId": row.get("artifactId") or "",
                    "label": row.get("label") or "",
                    "decision": row.get("currentDecision") or "",
                    "path": row.get("primaryPath") or "",
                    "durationLabel": row.get("durationLabel") or "",
                    "prompt": row.get("reviewPrompt") or "",
                    "samplePaths": row.get("samplePaths") or [],
                }
                for row in episode_rows
            ],
            "nextSafestAction": "Open each local artifact, review warnings first, then record approve/refine/hold/pending decisions as local ledger metadata.",
        })
    return plans


def attach_duration_candidate_review(rows: list[dict[str, Any]], candidate_review: dict[str, Any]) -> None:
    if not candidate_review:
        return
    episode = candidate_review.get("episode")
    for row in rows:
        if row.get("episode") != episode:
            continue
        if row.get("artifactId") not in {"longForm16x9", "longForm9x16", "podcastAudio"}:
            continue
        row["durationCandidateReviewStatus"] = candidate_review.get("status") or ""
        row["durationCandidateReviewHtml"] = candidate_review.get("htmlPath") or ""
        row["durationCandidateReviewCommand"] = candidate_review.get("openCommand") or ""
        row["durationCandidateReviewSafety"] = "Open beginning/middle/ending candidate snippets before approving or refining this artifact. This does not publish or create receipts."
        row["recommendedFirstAction"] = "review-duration-candidate-before-artifact-decision"


def attach_sync_investigation(rows: list[dict[str, Any]], sync_investigation: dict[str, Any]) -> None:
    if not sync_investigation:
        return
    episode = sync_investigation.get("episode")
    for row in rows:
        if row.get("episode") != episode:
            continue
        if row.get("artifactId") not in {"longForm16x9", "longForm9x16", "podcastAudio"}:
            continue
        row["syncInvestigationStatus"] = sync_investigation.get("status") or ""
        row["syncInvestigationHtml"] = sync_investigation.get("htmlPath") or ""
        row["syncInvestigationCommand"] = sync_investigation.get("openCommand") or ""
        row["syncInvestigationSpreadLabel"] = sync_investigation.get("spreadLabel") or ""
        row["syncInvestigationSafety"] = "Open shared beginning/middle/video-ending and extra-tail sync evidence before approving, trimming, or rebuilding this artifact. This does not publish or create receipts."
        row["recommendedFirstAction"] = "review-sync-investigation-before-artifact-decision"


def build_packet(release_root: Path) -> dict[str, Any]:
    pointer, runway, runway_path = load_latest_runway(release_root)
    duration_candidate_review = load_duration_candidate_review(release_root)
    sync_investigation = load_sync_investigation(release_root)
    episodes = [ep for ep in (runway.get("episodes") or []) if isinstance(ep, dict)]
    rows: list[dict[str, Any]] = []
    receipt_rows: list[dict[str, Any]] = []
    for ep in episodes:
        rows.extend(artifact_rows(ep))
        receipt_rows.append({
            "episode": ep.get("episode"),
            "version": ep.get("version") or "",
            "episodeStatus": ep.get("status") or "",
            "receiptSummary": ep.get("receiptSummary") if isinstance(ep.get("receiptSummary"), dict) else {},
            "receiptPreview": receipt_preview(ep),
        })
    attach_duration_candidate_review(rows, duration_candidate_review)
    attach_sync_investigation(rows, sync_investigation)
    review_plans = review_plan_by_episode(rows)
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sourceTowerRunwayPointer": str(release_root / "tower-runway" / "latest-tower-runway.json"),
        "sourceTowerRunwayJson": str(runway_path),
        "sourceTowerRunwayHtml": pointer.get("htmlPath") or runway.get("htmlPath") or "",
        "truth": "Tower review command sheet only. It does not execute commands, approve, publish, upload, schedule, mutate accounts/media, or capture receipts.",
        "counts": {
            "episodes": len(episodes),
            "reviewRows": len(rows),
            "pendingRows": sum(1 for row in rows if row.get("currentDecision") == "pending"),
            "warningRows": sum(1 for row in rows if row.get("warnings")),
            "durationCandidateReviewRows": sum(1 for row in rows if row.get("durationCandidateReviewHtml")),
            "durationCandidateReviewPackets": 1 if duration_candidate_review else 0,
            "syncInvestigationRows": sum(1 for row in rows if row.get("syncInvestigationHtml")),
            "syncInvestigationPackets": 1 if sync_investigation else 0,
            "receiptSlots": sum(int((item.get("receiptSummary") or {}).get("receiptSlots") or 0) for item in receipt_rows),
            "capturedReceipts": sum(int((item.get("receiptSummary") or {}).get("capturedReceipts") or 0) for item in receipt_rows),
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
        },
        "reviewRows": rows,
        "durationCandidateReview": duration_candidate_review,
        "syncInvestigation": sync_investigation,
        "reviewPlanByEpisode": review_plans,
        "receiptPreviewByEpisode": receipt_rows,
        "nextSafestAction": "Open local artifacts, watch/listen, then record approve/refine/hold/pending decisions. Capture receipts only after explicitly approved external publication returns real proof.",
        "reviewCommandTemplate": "./script/agentctl.sh tower-review-decision EPISODE artifact_id approve|refine|hold|pending '<reviewer>' '<notes>'",
        "reviewDryRunCommandTemplate": "./script/agentctl.sh tower-review-decision-dry-run EPISODE artifact_id approve|refine|hold|pending '<reviewer>' '<notes>'",
        "receiptCommandSafety": "Receipt capture is intentionally separate. Only record a receipt after explicitly approved external publication returns a real URL/provider id.",
    }


def prepare_output_dir(release_root: Path) -> Path:
    out_dir = release_root / "review-board" / "tower-review-command-sheets" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    fields = [
        "episode",
        "version",
        "artifactId",
        "label",
        "currentDecision",
        "recommendedFirstAction",
        "reviewPrompt",
        "primaryPath",
        "durationLabel",
        "mediaStatus",
        "openCommand",
        "durationCandidateReviewStatus",
        "durationCandidateReviewHtml",
        "durationCandidateReviewCommand",
        "syncInvestigationStatus",
        "syncInvestigationHtml",
        "syncInvestigationCommand",
        "approveDryRunCommand",
        "refineDryRunCommand",
        "holdDryRunCommand",
        "pendingDryRunCommand",
        "needsHumanDryRunCommand",
        "rejectDryRunCommand",
        "approveCommand",
        "refineCommand",
        "holdCommand",
        "pendingCommand",
        "needsHumanCommand",
    ]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in packet.get("reviewRows") or []:
            writer.writerow({key: row.get(key, "") for key in fields})


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Tower review command sheet",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        f"Next safest action: {packet['nextSafestAction']}",
        "",
        f"Source Tower runway: `{packet['sourceTowerRunwayJson']}`",
        "",
    ]
    current_episode = None
    for row in packet.get("reviewRows") or []:
        if row.get("episode") != current_episode:
            current_episode = row.get("episode")
            lines.extend(["", f"## Episode {current_episode} {row.get('version')}", ""])
        lines.extend([
            f"### {row.get('label')} (`{row.get('artifactId')}`)",
            f"- Current decision: `{row.get('currentDecision')}`",
            f"- Recommended first action: `{row.get('recommendedFirstAction')}`",
            f"- Review prompt: {row.get('reviewPrompt') or 'Open and inspect this artifact before deciding.'}",
        ])
        if row.get("primaryPath"):
            lines.append(f"- Open local artifact: `{row.get('primaryPath')}`")
        if row.get("durationLabel"):
            lines.append(f"- Duration/status: `{row.get('durationLabel')}` / `{row.get('mediaStatus')}`")
        for sample_path in (row.get("samplePaths") or [])[:5]:
            lines.append(f"- Short sample: `{sample_path}`")
        if row.get("warnings"):
            lines.append(f"- Warnings: {'; '.join(row.get('warnings') or [])}")
        if row.get("openCommand"):
            lines.append(f"- `openCommand`: `{row.get('openCommand')}`")
        if row.get("durationCandidateReviewHtml"):
            lines.append(f"- Duration candidate review packet: `{row.get('durationCandidateReviewHtml')}`")
        if row.get("durationCandidateReviewCommand"):
            lines.append(f"- `durationCandidateReviewCommand`: `{row.get('durationCandidateReviewCommand')}`")
        if row.get("syncInvestigationHtml"):
            lines.append(f"- Sync investigation packet: `{row.get('syncInvestigationHtml')}`")
        if row.get("syncInvestigationCommand"):
            lines.append(f"- `syncInvestigationCommand`: `{row.get('syncInvestigationCommand')}`")
        for key in ["approveDryRunCommand", "refineDryRunCommand", "holdDryRunCommand", "pendingDryRunCommand"]:
            if row.get(key):
                lines.append(f"- `{key}`: `{row.get(key)}`")
        for key in ["approveCommand", "refineCommand", "holdCommand", "pendingCommand"]:
            if row.get(key):
                lines.append(f"- `{key}`: `{row.get(key)}`")
        if row.get("needsHumanCommand"):
            lines.append(f"- `needsHumanCommand`: `{row.get('needsHumanCommand')}`")
        lines.append("")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    by_episode: dict[str, list[dict[str, Any]]] = {}
    for row in packet.get("reviewRows") or []:
        by_episode.setdefault(str(row.get("episode") or ""), []).append(row)
    sections: list[str] = []
    for episode, rows in by_episode.items():
        cards = []
        for row in rows:
            warnings = "".join(f"<li>{esc(warning)}</li>" for warning in row.get("warnings") or [])
            warning_block = f"<ul class=\"warnings\">{warnings}</ul>" if warnings else ""
            path_block = ""
            if row.get("primaryPath"):
                path_block = f"""
                <div class="review-path">
                  <strong>Open local artifact</strong>
                  <code>{esc(row.get('primaryPath'))}</code>
                  {f"<code>{esc(row.get('openCommand'))}</code>" if row.get('openCommand') else ""}
                </div>
                """
            sample_paths = "".join(f"<li><code>{esc(path)}</code></li>" for path in (row.get("samplePaths") or [])[:6])
            sample_block = f"<details><summary>Short samples</summary><ul>{sample_paths}</ul></details>" if sample_paths else ""
            duration_candidate_block = ""
            if row.get("durationCandidateReviewHtml"):
                duration_candidate_block = f"""
                <div class="candidate-review">
                  <strong>Duration candidate evidence first</strong>
                  <p>{esc(row.get('durationCandidateReviewSafety'))}</p>
                  <code>{esc(row.get('durationCandidateReviewHtml'))}</code>
                  {f"<code>{esc(row.get('durationCandidateReviewCommand'))}</code>" if row.get('durationCandidateReviewCommand') else ""}
                </div>
                """
            sync_investigation_block = ""
            if row.get("syncInvestigationHtml"):
                sync_investigation_block = f"""
                <div class="sync-investigation">
                  <strong>Sync investigation evidence first</strong>
                  <p>{esc(row.get('syncInvestigationSafety'))}</p>
                  <p><strong>Spread:</strong> {esc(row.get('syncInvestigationSpreadLabel'))}</p>
                  <code>{esc(row.get('syncInvestigationHtml'))}</code>
                  {f"<code>{esc(row.get('syncInvestigationCommand'))}</code>" if row.get('syncInvestigationCommand') else ""}
                </div>
                """
            dry_run_command_rows = "".join(
                f"<div class=\"command dry-run\"><strong>{label}</strong><code>{esc(row.get(key))}</code></div>"
                for label, key in [("Preview approve", "approveDryRunCommand"), ("Preview refine", "refineDryRunCommand"), ("Preview hold", "holdDryRunCommand"), ("Preview needs Charlie/Mako", "needsHumanDryRunCommand"), ("Preview reset pending", "pendingDryRunCommand")]
                if row.get(key)
            )
            command_rows = "".join(
                f"<div class=\"command\"><strong>{label}</strong><code>{esc(row.get(key))}</code></div>"
                for label, key in [("Approve after review", "approveCommand"), ("Refine", "refineCommand"), ("Hold", "holdCommand"), ("Needs Charlie/Mako", "needsHumanCommand"), ("Reset pending", "pendingCommand")]
                if row.get(key)
            )
            cards.append(f"""
            <article class="artifact-card">
              <div class="artifact-head"><div><span>{esc(row.get('artifactId'))}</span><h3>{esc(row.get('label'))}</h3></div><b>{esc(row.get('currentDecision'))}</b></div>
              <p>{esc(row.get('truth'))}</p>
              <p><strong>First:</strong> {esc(row.get('recommendedFirstAction'))}</p>
              <p><strong>Review:</strong> {esc(row.get('reviewPrompt'))}</p>
              <p><strong>Media:</strong> {esc(row.get('durationLabel'))} {esc(row.get('mediaStatus'))}</p>
              {path_block}
              {duration_candidate_block}
              {sync_investigation_block}
              {sample_block}
              {warning_block}
              <details open><summary>Dry-run first: preview local ledger change</summary>{dry_run_command_rows}</details>
              <details><summary>Execute local review command after preview</summary>{command_rows}</details>
            </article>
            """)
        sections.append(f"""
        <section class="episode">
          <div class="episode-head"><div class="eyebrow">Episode {esc(episode)}</div><h2>Local review decisions before Tower publishes anything.</h2></div>
          <div class="artifact-grid">{''.join(cards)}</div>
        </section>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tower Review Command Sheet</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101714; --panel:#18251f; --ink:#fff0d2; --muted:#d2c0a0; --gold:#ecc65d; --sky:#8fcfe2; --moss:#8fc071; --clay:#d27b5d; --line:rgba(255,240,210,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at 18% 0%, rgba(143,207,226,.20), transparent 32%), linear-gradient(180deg,#14211c,#090d0b); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.2em; text-transform:uppercase; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1100px; font-size:clamp(42px,7vw,82px); line-height:.92; margin:10px 0; }}
    h2 {{ margin:8px 0 0; font-size:30px; }}
    h3 {{ margin:4px 0 0; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; gap:22px; }}
    .episode {{ border:1px solid var(--line); border-radius:30px; padding:20px; background:rgba(24,37,31,.88); box-shadow:0 24px 68px rgba(0,0,0,.28); }}
    .artifact-grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; margin-top:16px; }}
    .artifact-card {{ border:1px solid var(--line); border-radius:20px; padding:14px; background:rgba(0,0,0,.24); }}
    .artifact-head {{ display:flex; justify-content:space-between; gap:12px; align-items:start; }}
    .artifact-head span {{ color:var(--sky); font-size:12px; text-transform:uppercase; letter-spacing:.12em; font-weight:900; }}
    .artifact-head b {{ border-radius:999px; padding:6px 9px; background:rgba(236,198,93,.14); color:var(--gold); }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; }}
    .command {{ border-top:1px solid var(--line); padding:10px 0; }}
    .command.dry-run {{ background:rgba(143,207,226,.07); border-radius:12px; padding:10px; margin-top:8px; }}
    .review-path {{ border:1px solid var(--line); border-radius:14px; padding:10px; background:rgba(143,207,226,.08); margin:10px 0; }}
    .candidate-review {{ border:1px solid rgba(236,198,93,.35); border-radius:14px; padding:10px; background:rgba(236,198,93,.10); margin:10px 0; }}
    .sync-investigation {{ border:1px solid rgba(143,207,226,.42); border-radius:14px; padding:10px; background:rgba(143,207,226,.10); margin:10px 0; }}
    code {{ display:block; color:var(--sky); overflow-wrap:anywhere; margin-top:5px; }}
    .warnings {{ color:#ffc0a8; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Tower</div>
    <h1>Review decisions first. Receipts only after reality.</h1>
    <p>{esc(packet['truth'])}</p>
    <p>{esc(packet['nextSafestAction'])}</p>
    <div class="summary"><span>{packet['counts']['episodes']} episodes</span><span>{packet['counts']['reviewRows']} review rows</span><span>{packet['counts']['pendingRows']} pending</span><span>{packet['counts']['warningRows']} warning rows</span><span>{packet['counts']['durationCandidateReviewRows']} duration candidate rows</span><span>{packet['counts']['syncInvestigationRows']} sync investigation rows</span><span>{packet['counts']['capturedReceipts']} receipts captured</span></div>
  </header>
  <main>{''.join(sections)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(release_root: Path, out_dir: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    pointer = {
        "schema": "quipsly.tower.latest-review-command-sheet.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status") or "tower-review-command-sheet-ready",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": packet.get("counts") or {},
        "humanAsk": packet.get("humanAsk") or "Use this command sheet to record local review decisions only after watching/listening to the relevant evidence.",
        "agentSafeParallelWork": packet.get("agentSafeParallelWork") or "Codex may prepare dry-run review commands, summarize review rows, and improve local packet clarity. Do not execute approval/publishing/receipt actions without explicit approval.",
        "truth": packet.get("truth") or "",
        "nextSafestAction": packet.get("nextSafestAction") or "",
        "firstSafeAction": packet.get("firstSafeAction") or {
            "label": "Open Tower review command sheet",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local review evidence only; no external publish, upload, schedule, account mutation, approval execution, or receipt capture.",
        },
        "reviewCommandTemplate": packet.get("reviewCommandTemplate") or "",
        "reviewDryRunCommandTemplate": packet.get("reviewDryRunCommandTemplate") or "",
        "receiptCommandSafety": packet.get("receiptCommandSafety") or "",
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
    }
    write_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json", pointer)
    write_json(release_root / "review-board" / "latest-tower-review-command-sheet.json", {
        **pointer,
        "schema": "quipsly.tower.latest-review-command-sheet-alias.v1",
        "canonicalPointerPath": str(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json"),
        "truth": "Alias pointer only. The canonical Tower review command sheet pointer remains under review-board/tower-review-command-sheets/.",
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Tower local review command sheet.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()

    release_root = Path(args.release_root)
    packet = build_packet(release_root)
    out_dir = prepare_output_dir(release_root)
    json_path = out_dir / "tower-review-command-sheet.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-tower-review-command-sheet.md"
    csv_path = out_dir / "tower-review-command-sheet.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    packet["firstSafeAction"] = {
        "label": "Open Tower review command sheet",
        "path": str(html_path),
        "command": f"open {shell_quote(str(html_path))}",
        "safety": "Opens local review evidence only; no external publish, upload, schedule, account mutation, approval execution, or receipt capture.",
    }
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_csv(csv_path, packet)
    write_html(html_path, packet)
    update_pointer(release_root, out_dir, packet, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": "ok",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": packet.get("counts"),
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
