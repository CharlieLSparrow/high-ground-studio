#!/usr/bin/env python3
"""Build a stage-aware audio defect atlas for a mastered audio baseline.

This is a synthesis layer, not a renderer and not an approval tool. It gathers
existing machine evidence into one time-indexed atlas so humans and agents can
see which moments deserve listening, which stage owns each risk, and what the
next reversible action should be.

It does not approve audio, fail audio, unlock branch inheritance, render media,
upload, publish, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "m4aPath",
            "playlistPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(outputs: dict[str, Any], key: str) -> tuple[dict[str, Any], str | None]:
    path = output_path(outputs.get(key))
    if not path:
        return {}, None
    report_path = Path(path)
    if not report_path.exists() or report_path.suffix.lower() != ".json":
        return {}, path
    try:
        return read_json(report_path), path
    except json.JSONDecodeError:
        return {}, path


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def write_open_command(path: Path, target: Path) -> None:
    path.write_text("\n".join(["#!/bin/sh", "set -e", "open " + shell_quote(str(target)), ""]), encoding="utf-8")
    path.chmod(0o755)


def float_value(value: Any, default: float | None = None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def timecode(seconds: Any) -> str:
    value = float_value(seconds, None)
    if value is None:
        return "global"
    total = max(0, int(round(value)))
    h = total // 3600
    m = (total % 3600) // 60
    s = total % 60
    if h:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def clean_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value if str(item)]
    if isinstance(value, dict):
        return [f"{key}: {val}" for key, val in value.items()]
    text = str(value)
    return [text] if text else []


def severity_from_score(score: Any, default: str = "medium") -> str:
    value = float_value(score, None)
    if value is None:
        return default
    if value >= 75:
        return "critical"
    if value >= 45:
        return "high"
    if value >= 18:
        return "medium"
    return "low"


def severity_rank(severity: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}.get(severity, 1)


def add_item(
    items: list[dict[str, Any]],
    *,
    stage: str,
    title: str,
    start: Any = None,
    end: Any = None,
    severity: str = "medium",
    reasons: Any = None,
    evidence: Any = None,
    next_action: str = "Human listen before repair.",
    artifact_path: str | None = None,
    source_key: str | None = None,
    kind: str = "timed",
) -> None:
    start_value = float_value(start, None)
    end_value = float_value(end, None)
    duration = None
    if start_value is not None and end_value is not None:
        duration = round(max(0.0, end_value - start_value), 3)
    items.append(
        {
            "id": f"{safe_slug(stage)}-{len(items) + 1:04d}-{safe_slug(title)[:72]}",
            "stage": stage,
            "kind": "timed" if start_value is not None else kind,
            "title": str(title),
            "severity": severity,
            "severityRank": severity_rank(severity),
            "startSeconds": start_value,
            "endSeconds": end_value,
            "durationSeconds": duration,
            "timecode": timecode(start_value),
            "reasons": clean_list(reasons),
            "evidence": clean_list(evidence),
            "nextAction": next_action,
            "artifactPath": artifact_path,
            "sourceKey": source_key,
        }
    )


def choose_first(row: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = row.get(key)
        if value not in (None, ""):
            return value
    return None


def build_items(manifest: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, str | None]]:
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    items: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    source_paths: dict[str, str | None] = {}

    def report(key: str) -> dict[str, Any]:
        payload, path = load_report(outputs, key)
        source_paths[key] = path
        if not payload:
            missing.append({"key": key, "path": path, "reason": "missing or unreadable JSON report"})
        return payload

    technical = report("latestAudioTechnicalAuditionAudit")
    for section in sorted(technical.get("sections") or [], key=lambda row: float_value(row.get("riskScore"), 0) or 0, reverse=True)[:20]:
        risk = float_value(section.get("riskScore"), 0) or 0
        if risk <= 0 and not section.get("reasons"):
            continue
        add_item(
            items,
            stage="technical-audition",
            title=f"Technical section {section.get('index')} risk {risk:.1f}",
            start=section.get("startSeconds"),
            end=section.get("endSeconds"),
            severity=severity_from_score(risk, "medium"),
            reasons=section.get("reasons"),
            evidence=[
                f"riskScore={risk:.2f}",
                f"quietRatio={section.get('quietRatio')}",
                f"activeRatio={section.get('activeRatio')}",
                f"p50Dbfs={section.get('p50Dbfs')}",
            ],
            next_action="Use the technical audition snippet/control room before changing mastering or cleanup parameters.",
            source_key="latestAudioTechnicalAuditionAudit",
            artifact_path=source_paths.get("latestAudioTechnicalAuditionAudit"),
        )

    control = report("latestAudioStudioSoundControlRoom")
    for window in sorted(control.get("windows") or [], key=lambda row: (int_value(row.get("priority")) * -1, float_value(row.get("startSeconds"), 0) or 0))[:30]:
        metrics = window.get("metrics") if isinstance(window.get("metrics"), dict) else {}
        flags = metrics.get("riskFlags") or []
        priority = int_value(window.get("priority"))
        severity = "high" if flags or priority >= 50 else "medium"
        add_item(
            items,
            stage="studio-sound-control-room",
            title=window.get("label") or f"Control-room window {window.get('index')}",
            start=window.get("startSeconds"),
            end=window.get("endSeconds"),
            severity=severity,
            reasons=[window.get("reason"), *clean_list(flags)],
            evidence=[
                f"rmsDbfs={metrics.get('rmsDbfs')}",
                f"peakDbfs={metrics.get('peakDbfs')}",
                f"quietRatio={metrics.get('quietRatio')}",
                f"activeRatio={metrics.get('activeRatio')}",
            ],
            next_action="Open the control-room snippet, waveform, and spectrogram; if confirmed, route through Studio Sound Repair Planner.",
            artifact_path=window.get("snippetPath") or window.get("spectrogramPath") or source_paths.get("latestAudioStudioSoundControlRoom"),
            source_key="latestAudioStudioSoundControlRoom",
        )

    smooth = report("latestAudioSmoothnessProofPack")
    for moment in (smooth.get("moments") or [])[:30]:
        evidence = moment.get("evidence") if isinstance(moment.get("evidence"), dict) else {}
        severity = "high" if "hard" in str(evidence.get("classification") or moment.get("kind")).lower() else "medium"
        add_item(
            items,
            stage="smoothness",
            title=moment.get("title") or moment.get("id") or "Smoothness proof moment",
            start=moment.get("windowStartSeconds"),
            end=moment.get("windowEndSeconds"),
            severity=severity,
            reasons=[moment.get("kind"), evidence.get("classification")],
            evidence=[
                f"deltaDb={evidence.get('deltaDb')}",
                f"fromDbfs={evidence.get('fromDbfs')}",
                f"toDbfs={evidence.get('toDbfs')}",
            ],
            next_action=moment.get("suggestedNextAction") or "Listen for chopped cadence, hard mutes, and unnatural silence edges.",
            artifact_path=moment.get("snippetPath") or source_paths.get("latestAudioSmoothnessProofPack"),
            source_key="latestAudioSmoothnessProofPack",
        )

    source_balance = report("latestAudioSourceBalanceTriage")
    for row in (source_balance.get("representativeWindows") or [])[:30]:
        start = choose_first(row, "startSeconds", "sequenceStartSeconds", "start")
        end = choose_first(row, "endSeconds", "sequenceEndSeconds", "end")
        title = choose_first(row, "title", "label", "classification", "flag") or "Source-balance representative window"
        add_item(
            items,
            stage="source-balance",
            title=title,
            start=start,
            end=end,
            severity="high" if "missing" in str(row).lower() or "risk" in str(row).lower() else "medium",
            reasons=choose_first(row, "flags", "reasons", "reason", "classification"),
            evidence=[f"speakerSurvival={source_balance.get('allSpeakersSurviveInMaster')}", f"warningCount={source_balance.get('machineWarningCount')}", f"queueItems={source_balance.get('queueBalanceItemCount')}"],
            next_action=choose_first(row, "safeActionIfFails", "nextAction") or "Use source-balance triage before tuning speaker gates or gain automation.",
            artifact_path=source_paths.get("latestAudioSourceBalanceTriage"),
            source_key="latestAudioSourceBalanceTriage",
        )

    cleanup = report("latestSpeakerCleanupListenReel")
    for row in cleanup.get("items") or []:
        add_item(
            items,
            stage="speaker-cleanup",
            title=f"Speaker cleanup: {row.get('symptom') or row.get('reason') or row.get('windowIndex')}",
            start=row.get("sourceStartSeconds"),
            end=row.get("sourceEndSeconds"),
            severity="high" if row.get("mustListen", True) else "medium",
            reasons=[row.get("reason"), *clean_list(row.get("flags"))],
            evidence=[row.get("reviewerPrompt"), row.get("failurePrompt"), f"reelTimecode={row.get('reelTimecode')}"],
            next_action=row.get("safeActionIfFails") or "If this fails by ear, create a scoped v007 repair candidate for this exact source window.",
            artifact_path=row.get("snippetPath") or cleanup.get("m4aPath") or source_paths.get("latestSpeakerCleanupListenReel"),
            source_key="latestSpeakerCleanupListenReel",
        )

    repair = report("latestAudioStudioSoundRepairPlanner")
    for action in repair.get("actions") or []:
        add_item(
            items,
            stage="repair-planner",
            title=action.get("label") or action.get("actionType") or "Repair planner action",
            start=action.get("startSeconds"),
            end=action.get("endSeconds"),
            severity=action.get("severity") or "medium",
            reasons=[action.get("reason"), *clean_list(action.get("flags"))],
            evidence=action.get("safeTreatmentPath"),
            next_action=action.get("firstMove") or "Do the first reversible repair-planning move before rendering a full candidate.",
            artifact_path=source_paths.get("latestAudioStudioSoundRepairPlanner"),
            source_key="latestAudioStudioSoundRepairPlanner",
        )

    sound_director = report("latestAudioSoundDirectorScorecard")
    for risk in sound_director.get("reviewRisks") or []:
        if isinstance(risk, dict):
            title = risk.get("label") or risk.get("id") or "Sound Director review risk"
            reasons = risk.get("risks")
            evidence = risk.get("evidence")
            next_action = risk.get("nextAction") or sound_director.get("nextSafeAction") or "Use Sound Director routing before changing audio."
            artifact_path = risk.get("artifactPath") or source_paths.get("latestAudioSoundDirectorScorecard")
        else:
            title = "Sound Director review risk"
            reasons = [risk]
            evidence = [f"machineConfidenceScore={sound_director.get('machineConfidenceScore')}"]
            next_action = sound_director.get("nextSafeAction") or "Use Sound Director routing before changing audio."
            artifact_path = source_paths.get("latestAudioSoundDirectorScorecard")
        add_item(
            items,
            stage="sound-director",
            title=title,
            severity="medium",
            reasons=reasons,
            evidence=evidence,
            next_action=next_action,
            artifact_path=artifact_path,
            source_key="latestAudioSoundDirectorScorecard",
            kind="global",
        )

    post_queue = report("latestAudioPostReviewActionQueue")
    for action in (post_queue.get("actions") or [])[:40]:
        decision = str(action.get("decision") or "pending")
        if decision == "pass":
            continue
        add_item(
            items,
            stage="post-review-queue",
            title=action.get("label") or action.get("actionType") or "Post-review queue item",
            start=action.get("sequenceStartSeconds"),
            end=(float_value(action.get("sequenceStartSeconds"), 0) or 0) + (float_value(action.get("durationSeconds"), 0) or 0) if action.get("sequenceStartSeconds") is not None else None,
            severity=action.get("severity") or "medium",
            reasons=[action.get("actionType"), action.get("decision"), action.get("sourceLabel")],
            evidence=action.get("reviewerNotes"),
            next_action=action.get("firstMove") or "Route notes without approving or unlocking branches.",
            artifact_path=action.get("sourceReport") or source_paths.get("latestAudioPostReviewActionQueue"),
            source_key="latestAudioPostReviewActionQueue",
        )

    items.sort(key=lambda row: (row["kind"] != "timed", row["startSeconds"] if row["startSeconds"] is not None else 10**9, -row["severityRank"], row["stage"]))
    return items, missing, source_paths


def summarize(items: list[dict[str, Any]], missing: list[dict[str, Any]]) -> dict[str, Any]:
    stage_counts = Counter(item["stage"] for item in items)
    severity_counts = Counter(item["severity"] for item in items)
    timed_count = sum(1 for item in items if item["kind"] == "timed")
    high_count = sum(1 for item in items if item["severity"] in {"high", "critical"})
    top_items = sorted(items, key=lambda row: (-row["severityRank"], row["startSeconds"] if row["startSeconds"] is not None else 10**9))[:20]
    return {
        "itemCount": len(items),
        "timedItemCount": timed_count,
        "globalItemCount": len(items) - timed_count,
        "stageCount": len(stage_counts),
        "stageCounts": dict(sorted(stage_counts.items())),
        "severityCounts": dict(sorted(severity_counts.items())),
        "highSeverityCount": high_count,
        "missingEvidenceCount": len(missing),
        "topItemIds": [item["id"] for item in top_items],
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Defect Atlas: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This atlas is a producer map of machine-visible audio risks by timeline location and stage owner. It is evidence, not approval. Use it to make scoped listen and repair decisions without turning the audio chain into a mystery box.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Items: `{report['summary']['itemCount']}`",
        f"- Timed items: `{report['summary']['timedItemCount']}`",
        f"- High/critical items: `{report['summary']['highSeverityCount']}`",
        f"- Missing evidence: `{report['summary']['missingEvidenceCount']}`",
        "",
        "## Stage counts",
        "",
        "| Stage | Items |",
        "|---|---:|",
    ]
    for stage, count in report["summary"]["stageCounts"].items():
        lines.append(f"| `{stage}` | {count} |")
    lines.extend(["", "## Highest-priority listen/repair map", "", "| Time | Severity | Stage | Title | Next action |", "|---|---:|---|---|---|"])
    for item in sorted(report["items"], key=lambda row: (-row["severityRank"], row["startSeconds"] if row["startSeconds"] is not None else 10**9))[:40]:
        title = item["title"].replace("|", "\\|")
        next_action = item["nextAction"].replace("|", "\\|")
        lines.append(f"| `{item['timecode']}` | `{item['severity']}` | `{item['stage']}` | {title} | {next_action} |")
    lines.extend(["", "## Full timeline atlas", "", "| Time | End | Stage | Severity | Reasons | Artifact |", "|---|---|---|---:|---|---|"])
    for item in report["items"]:
        reasons = "; ".join(item["reasons"][:3]).replace("|", "\\|")
        artifact = item.get("artifactPath") or ""
        lines.append(f"| `{item['timecode']}` | `{timecode(item.get('endSeconds'))}` | `{item['stage']}` | `{item['severity']}` | {reasons} | `{artifact}` |")
    if report["missingEvidence"]:
        lines.extend(["", "## Missing evidence", ""])
        for item in report["missingEvidence"]:
            lines.append(f"- `{item['key']}`: {item['reason']} ({item.get('path') or 'not registered'})")
    lines.extend([
        "",
        "## Guardrail",
        "",
        "This atlas should guide human listening and scoped v007 repairs. It must not be used to approve v006, fail v006, unlock branch inheritance, render branches, upload, publish, or mutate originals by itself.",
        "",
    ])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    cards = []
    for item in sorted(report["items"], key=lambda row: (-row["severityRank"], row["startSeconds"] if row["startSeconds"] is not None else 10**9))[:80]:
        reasons = "".join(f"<li>{html.escape(reason)}</li>" for reason in item["reasons"][:5]) or "<li>No machine reason text.</li>"
        evidence = "".join(f"<li>{html.escape(ev)}</li>" for ev in item["evidence"][:5])
        artifact = item.get("artifactPath")
        artifact_html = f'<a href="file://{html.escape(artifact)}">open evidence</a>' if artifact else '<span class="muted">no direct artifact</span>'
        cards.append(f"""
        <article class="card {html.escape(item['severity'])}">
          <div class="meta"><span>{html.escape(item['timecode'])}</span><span>{html.escape(item['stage'])}</span><span>{html.escape(item['severity'])}</span></div>
          <h2>{html.escape(item['title'])}</h2>
          <p><strong>Next:</strong> {html.escape(item['nextAction'])}</p>
          <details open><summary>Reasons</summary><ul>{reasons}</ul></details>
          <details><summary>Evidence</summary><ul>{evidence}</ul></details>
          <p>{artifact_html}</p>
        </article>""")
    stage_rows = "".join(f"<tr><td>{html.escape(stage)}</td><td>{count}</td></tr>" for stage, count in report["summary"]["stageCounts"].items())
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Audio Defect Atlas</title>
<style>
:root {{ color-scheme: dark; --bg:#101512; --panel:#17221b; --ink:#f3ead8; --muted:#b6aa91; --gold:#f2c84b; --red:#ff6b64; --green:#72d68a; --blue:#73c7ff; }}
body {{ margin:0; font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:radial-gradient(circle at top left,#243b2f,var(--bg)); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:34px; }}
.hero,.card,table {{ background:rgba(23,34,27,.86); border:1px solid rgba(242,200,75,.18); border-radius:22px; box-shadow:0 18px 60px rgba(0,0,0,.28); }}
.hero {{ padding:30px; margin-bottom:22px; }}
h1 {{ margin:0; font-size:34px; }}
.sub {{ color:var(--muted); max-width:880px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:18px 0; }}
.metric {{ padding:14px 16px; border-radius:16px; background:rgba(255,255,255,.055); }}
.metric b {{ display:block; color:var(--gold); font-size:24px; }}
table {{ width:100%; border-collapse:collapse; overflow:hidden; margin:18px 0 28px; }}
td,th {{ padding:10px 14px; border-bottom:1px solid rgba(255,255,255,.08); text-align:left; }}
.cards {{ display:grid; gap:14px; }}
.card {{ padding:20px; }}
.card.critical,.card.high {{ border-color:rgba(255,107,100,.55); }}
.card.medium {{ border-color:rgba(242,200,75,.35); }}
.meta {{ display:flex; gap:10px; flex-wrap:wrap; color:var(--muted); text-transform:uppercase; letter-spacing:.08em; font-size:12px; }}
.meta span {{ background:rgba(255,255,255,.07); padding:4px 8px; border-radius:999px; }}
a {{ color:var(--blue); }}
.muted {{ color:var(--muted); }}
</style></head><body><main>
<section class="hero"><h1>Audio Defect Atlas</h1><p class="sub">Stage-aware map for {html.escape(report['baselineId'])}. This is evidence, not approval. It tells the next human or agent where to listen and which stage owns the likely repair.</p>
<div class="grid">
<div class="metric"><b>{report['summary']['itemCount']}</b>items</div>
<div class="metric"><b>{report['summary']['timedItemCount']}</b>timed</div>
<div class="metric"><b>{report['summary']['highSeverityCount']}</b>high/critical</div>
<div class="metric"><b>{report['summary']['missingEvidenceCount']}</b>missing evidence</div>
<div class="metric"><b>{html.escape(str(report['approvalStatus']))}</b>approval</div>
</div></section>
<h2>Stage counts</h2><table><tbody>{stage_rows}</tbody></table>
<h2>Priority map</h2><section class="cards">{''.join(cards)}</section>
</main></body></html>"""


def update_manifest(manifest_path: Path, report: dict[str, Any]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioDefectAtlas"] = report["jsonPath"]
    outputs["latestAudioDefectAtlasMarkdown"] = report["markdownPath"]
    outputs["latestAudioDefectAtlasHtml"] = report["htmlPath"]
    outputs["latestAudioDefectAtlasOpenCommand"] = report["openCommand"]
    outputs.setdefault("audioDefectAtlases", []).append(report["jsonPath"])
    manifest["audioDefectAtlasLatestStatus"] = report["status"]
    manifest["audioDefectAtlasItemCount"] = report["summary"]["itemCount"]
    manifest["audioDefectAtlasTimedItemCount"] = report["summary"]["timedItemCount"]
    manifest["audioDefectAtlasStageCount"] = report["summary"]["stageCount"]
    manifest["audioDefectAtlasHighSeverityCount"] = report["summary"]["highSeverityCount"]
    manifest["audioDefectAtlasMissingEvidenceCount"] = report["summary"]["missingEvidenceCount"]
    manifest["audioDefectAtlasApprovalStateChanged"] = False
    manifest["audioDefectAtlasBranchStateChanged"] = False
    manifest["audioDefectAtlasRenderAttempted"] = False
    manifest["audioDefectAtlasUploadAttempted"] = False
    manifest["audioDefectAtlasPublicationAttempted"] = False
    manifest["audioDefectAtlasOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    items, missing, source_paths = build_items(manifest)
    summary = summarize(items, missing)
    status = "ready-for-stage-aware-human-listen" if items and not missing else "needs-evidence-routing"

    versioned_dir = baseline_dir / f"audio-defect-atlas-{slug}-{generated_at}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    stable_json = baseline_dir / "AUDIO_DEFECT_ATLAS.json"
    stable_md = baseline_dir / "AUDIO_DEFECT_ATLAS.md"
    stable_html = baseline_dir / "AUDIO_DEFECT_ATLAS.html"
    open_cmd = baseline_dir / "OPEN_AUDIO_DEFECT_ATLAS.command"
    versioned_json = versioned_dir / "audio-defect-atlas.json"
    versioned_md = versioned_dir / "audio-defect-atlas.md"
    versioned_html = versioned_dir / "audio-defect-atlas.html"

    report = {
        "schema": "quipsly.audio-workbench.defect-atlas.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_at,
        "status": status,
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "summary": summary,
        "items": items,
        "missingEvidence": missing,
        "sourceReports": source_paths,
        "nextSafeAction": "Use the atlas to pick exact listen windows and stage-owned repairs; do not approve or render branches without guarded human listen approval.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(open_cmd),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
    }

    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, versioned_json):
        write_json(path, report)
    for path in (stable_md, versioned_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, versioned_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(open_cmd, stable_html)
    update_manifest(manifest_path, report)
    print(json.dumps({k: report[k] for k in ["status", "jsonPath", "htmlPath", "itemCount"] if k in report} | {"itemCount": summary["itemCount"], "timedItemCount": summary["timedItemCount"], "missingEvidenceCount": summary["missingEvidenceCount"]}, indent=2))


if __name__ == "__main__":
    main()
