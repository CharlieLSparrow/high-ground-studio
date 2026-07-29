#!/usr/bin/env python3
"""Build a product-facing source-aware listen workbench for Episode 4 audio.

This is intentionally not another approval form. It turns the existing v006
audio truth into a small editor-like surface:

- one mastered spine player;
- separate Charlie, Homer, and clip/source refined stem players;
- synced jump/play controls on the same sequence clock;
- loudness summaries and review windows in one glanceable page.

The workbench does not approve audio, unlock branches, render final media,
upload, publish, or mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser().resolve()
    if (expanded / "manifest.json").exists():
        return expanded
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def safe_slug(value: Any) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-workbench"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def bool_value(value: Any) -> bool:
    return value is True or str(value).strip().lower() == "true"


def number(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def path_uri(path: str | None) -> str:
    if not path:
        return ""
    try:
        return Path(path).resolve().as_uri()
    except ValueError:
        return ""


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "htmlPath",
            "markdownPath",
            "m4aPath",
            "wavPath",
            "openCommand",
            "versionedPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def format_time(seconds: Any) -> str:
    total = max(0, int(round(number(seconds))))
    hours, rem = divmod(total, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"


def load_optional(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def loudness_by_role(loudness: dict[str, Any]) -> dict[str, dict[str, Any]]:
    by_role: dict[str, dict[str, Any]] = {}
    for track in loudness.get("tracks") or []:
        role_id = str(track.get("roleId") or "")
        if role_id:
            by_role[role_id] = track
    return by_role


def build_workbench(baseline_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    stem_manifest = load_optional(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json")
    loudness = load_optional(baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json")
    mission = load_optional(baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.json")
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    mix_recipe = stem_manifest.get("mixRecipe") if isinstance(stem_manifest.get("mixRecipe"), dict) else {}
    by_role = loudness_by_role(loudness)

    master_m4a = mix_recipe.get("masterM4a") if isinstance(mix_recipe.get("masterM4a"), dict) else {}
    master_wav = mix_recipe.get("masterWav") if isinstance(mix_recipe.get("masterWav"), dict) else {}
    master_track = by_role.get("master", {})

    stems: list[dict[str, Any]] = []
    for role in stem_manifest.get("roles") or []:
        if not isinstance(role, dict):
            continue
        role_id = str(role.get("roleId") or "")
        selected = role.get("selectedRefinedStem") if isinstance(role.get("selectedRefinedStem"), dict) else {}
        aligned = role.get("alignedSourceStem") if isinstance(role.get("alignedSourceStem"), dict) else {}
        contribution_summary = role.get("contributionSummary") if isinstance(role.get("contributionSummary"), dict) else {}
        aligned_summary = role.get("alignedSummary") if isinstance(role.get("alignedSummary"), dict) else {}
        loudness_track = by_role.get(role_id, {})
        stems.append(
            {
                "roleId": role_id,
                "label": role.get("label") or role_id,
                "speaker": role.get("speaker") or role_id,
                "status": role.get("status") or "unknown",
                "purpose": role.get("purpose") or "",
                "doNotDo": role.get("doNotDo") or "",
                "sequenceClockPolicy": role.get("sequenceClockPolicy") or "",
                "selectedRefinedStem": selected,
                "alignedSourceStem": aligned,
                "durationDeltaToMasterSeconds": role.get("durationDeltaToMasterSeconds"),
                "contributionSummary": contribution_summary,
                "alignedSummary": aligned_summary,
                "loudnessSummary": loudness_track.get("summary") if isinstance(loudness_track.get("summary"), dict) else {},
            }
        )

    mission_steps: list[dict[str, Any]] = []
    for step in mission.get("minimumSufficientListenPath") or []:
        if not isinstance(step, dict):
            continue
        if step.get("path"):
            mission_steps.append(
                {
                    "step": step.get("step"),
                    "title": step.get("title"),
                    "path": step.get("path"),
                    "required": bool_value(step.get("required")),
                    "passCondition": step.get("passCondition"),
                }
            )

    outliers = []
    for outlier in loudness.get("outliers") or []:
        if not isinstance(outlier, dict):
            continue
        outliers.append(
            {
                "time": outlier.get("time"),
                "startSeconds": number(outlier.get("startSeconds")),
                "endSeconds": number(outlier.get("endSeconds")),
                "flags": outlier.get("flags") if isinstance(outlier.get("flags"), list) else [],
                "activeStems": outlier.get("activeStems") if isinstance(outlier.get("activeStems"), list) else [],
                "masterRmsDbfs": outlier.get("masterRmsDbfs"),
                "masterSamplePeakDbfs": outlier.get("masterSamplePeakDbfs"),
                "stemRmsDbfs": outlier.get("stemRmsDbfs") if isinstance(outlier.get("stemRmsDbfs"), dict) else {},
                "listenQuestion": outlier.get("listenQuestion"),
            }
        )

    status = "source-aware-listen-workbench-ready"
    missing = []
    if not master_m4a.get("exists") and not master_wav.get("exists"):
        missing.append("mastered spine audio")
    for stem in stems:
        if not stem.get("selectedRefinedStem", {}).get("exists"):
            missing.append(f"{stem.get('roleId')} refined stem")
    if missing:
        status = "source-aware-listen-workbench-missing-audio"

    return {
        "schema": "quipsly.audio-workbench.source-aware-listen-workbench.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId") or stem_manifest.get("baselineId") or "episode-4-audio",
        "status": status,
        "missingAudio": missing,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "sourceAwareStemStatus": stem_manifest.get("status"),
        "sourceAwareStemResolvedCount": stem_manifest.get("resolvedStemCount"),
        "sourceAwareStemReadyCount": stem_manifest.get("readyStemCount"),
        "sourceAwareMissingRoles": stem_manifest.get("missingRequiredRoles") or [],
        "segmentLoudnessStatus": loudness.get("status"),
        "segmentLoudnessOutlierCount": len(outliers),
        "windowSeconds": loudness.get("windowSeconds"),
        "master": {
            "m4a": master_m4a,
            "wav": master_wav,
            "loudnessSummary": master_track.get("summary") if isinstance(master_track.get("summary"), dict) else {},
        },
        "stems": stems,
        "missionSteps": mission_steps,
        "reviewWindows": outliers,
        "safety": {
            "renderAttempted": bool_value(manifest.get("renderAttempted")),
            "branchRenderAttempted": bool_value(manifest.get("branchRenderAttempted")),
            "uploadAttempted": bool_value(manifest.get("uploadAttempted")),
            "publicationAttempted": bool_value(manifest.get("publicationAttempted")),
            "originalMediaMutated": bool_value(manifest.get("originalMediaMutated")),
        },
        "productUse": [
            "Start with the mastered spine to judge the listener experience.",
            "Solo Charlie, Homer, and clip/source stems to understand what the editor can still control.",
            "Use review-window jump buttons to inspect suspicious timing or loudness moments.",
            "Branch edits should use the refined stems on the same sequence clock, not only the flat master.",
        ],
        "links": {
            "finalListenMissionPacket": str(baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.html"),
            "sourceAwareStemManifest": str(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.html"),
            "segmentLoudnessMap": str(baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.html"),
            "humanListenDecisionFrontDoor": str(baseline_dir / "HUMAN_LISTEN_DECISION_FRONT_DOOR.html"),
            "branchPreflight": output_path(outputs.get("latestAudioBranchRenderPreflightHtml")) or str(baseline_dir / "BRANCH_RENDER_PREFLIGHT.html"),
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Source-Aware Audio Listen Workbench: {report['baselineId']}",
        "",
        "This is the product-facing audio surface for Episode 4. It is for listening, comparing, and deciding what the editor needs next. It is not an approval ceremony.",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Source-aware stems: `{report['sourceAwareStemReadyCount']}` ready, missing `{report['sourceAwareMissingRoles']}`",
        f"- Review windows: `{report['segmentLoudnessOutlierCount']}`",
        "",
        "## Players",
        "",
        f"- Master M4A: `{report['master'].get('m4a', {}).get('path')}`",
        f"- Master WAV: `{report['master'].get('wav', {}).get('path')}`",
    ]
    for stem in report.get("stems") or []:
        lines.append(f"- {stem['label']}: `{stem.get('selectedRefinedStem', {}).get('path')}`")
    lines.extend(["", "## First review windows", ""])
    for window in (report.get("reviewWindows") or [])[:20]:
        flags = ", ".join(str(flag) for flag in window.get("flags") or [])
        active = ", ".join(str(stem) for stem in window.get("activeStems") or [])
        lines.append(f"- `{window.get('time')}` {flags}; active stems: {active or 'none'}")
    return "\n".join(lines) + "\n"


def stat_card(title: str, value: Any, subtitle: str = "") -> str:
    return f"<article class=\"stat\"><span>{e(title)}</span><strong>{e(value)}</strong><small>{e(subtitle)}</small></article>"


def audio_element(element_id: str, path: str | None, label: str, *, class_name: str = "") -> str:
    if not path or not Path(path).exists():
        return f"<p class=\"missing\">Missing audio: {e(label)}</p>"
    return (
        f"<audio id=\"{e(element_id)}\" class=\"{e(class_name)}\" controls preload=\"metadata\">"
        f"<source src=\"{e(path_uri(path))}\">"
        f"</audio>"
    )


def render_html(report: dict[str, Any]) -> str:
    master_m4a = report["master"].get("m4a") or {}
    master_wav = report["master"].get("wav") or {}
    master_summary = report["master"].get("loudnessSummary") or {}
    master_rms = master_summary.get("rmsDbfs") if isinstance(master_summary.get("rmsDbfs"), dict) else {}
    master_peak = master_summary.get("samplePeakDbfs") if isinstance(master_summary.get("samplePeakDbfs"), dict) else {}

    stem_cards = []
    for stem in report.get("stems") or []:
        role = stem.get("roleId")
        selected = stem.get("selectedRefinedStem") or {}
        summary = stem.get("contributionSummary") or {}
        loud = stem.get("loudnessSummary") or {}
        rms = loud.get("rmsDbfs") if isinstance(loud.get("rmsDbfs"), dict) else {}
        peak = loud.get("samplePeakDbfs") if isinstance(loud.get("samplePeakDbfs"), dict) else {}
        stem_cards.append(
            f"""
            <section class="stem-card role-{e(role)}">
              <div class="stem-head">
                <p>{e(stem.get('speaker'))}</p>
                <h3>{e(stem.get('label'))}</h3>
                <span>{e(stem.get('status'))}</span>
              </div>
              {audio_element('stem-' + str(role), selected.get('path'), str(stem.get('label')), class_name='stem-audio')}
              <div class="mini-grid">
                {stat_card('active', f"{summary.get('activePercent', 'n/a')}%", 'contribution')}
                {stat_card('median', f"{summary.get('medianActiveDbfs', 'n/a')} dBFS", 'active voice')}
                {stat_card('mean RMS', f"{rms.get('mean', 'n/a')} dBFS", '10s windows')}
                {stat_card('peak', f"{peak.get('max', 'n/a')} dBFS", 'sample peak')}
              </div>
              <p class="purpose">{e(stem.get('purpose'))}</p>
              <p class="dont">{e(stem.get('doNotDo'))}</p>
              <p class="clock">{e(stem.get('sequenceClockPolicy'))}</p>
            </section>
            """
        )

    review_rows = []
    for idx, window in enumerate(report.get("reviewWindows") or [], start=1):
        flags = ", ".join(str(flag) for flag in window.get("flags") or [])
        active = ", ".join(str(stem) for stem in window.get("activeStems") or []) or "none"
        stem_rms = window.get("stemRmsDbfs") or {}
        review_rows.append(
            f"""
            <tr>
              <td><button class="jump" data-start="{e(window.get('startSeconds'))}">Jump</button></td>
              <td><strong>{e(window.get('time') or format_time(window.get('startSeconds')))}</strong><small>{e(format_time(window.get('startSeconds')))} - {e(format_time(window.get('endSeconds')))}</small></td>
              <td>{e(flags)}</td>
              <td>{e(active)}</td>
              <td>{e(window.get('masterRmsDbfs'))}</td>
              <td><code>C {e(stem_rms.get('charlie'))}</code> <code>H {e(stem_rms.get('homer'))}</code> <code>Clip {e(stem_rms.get('clip-source'))}</code></td>
            </tr>
            """
        )

    mission_links = []
    for step in report.get("missionSteps") or []:
        path = step.get("path")
        mission_links.append(
            f"<a href=\"{e(path_uri(path))}\" class=\"mission-link\"><span>{e(step.get('step'))}</span><strong>{e(step.get('title'))}</strong><small>{e(step.get('passCondition'))}</small></a>"
        )

    links = report.get("links") or {}
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Episode 4 Source-Aware Audio Workbench</title>
<style>
:root {{
  --ink: #241d16;
  --muted: #756957;
  --paper: #f5eedf;
  --card: #fff9ea;
  --moss: #2e5f45;
  --fern: #6da06f;
  --gold: #c59b31;
  --clay: #b05a3c;
  --sky: #3b7d8f;
  --line: rgba(36,29,22,.14);
  --shadow: 0 24px 70px rgba(36,29,22,.16);
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif;
  color: var(--ink);
  background:
    radial-gradient(circle at 12% 0%, rgba(109,160,111,.24), transparent 32rem),
    radial-gradient(circle at 88% 12%, rgba(197,155,49,.26), transparent 30rem),
    linear-gradient(135deg, #efe5cf 0%, #f7f1e5 42%, #e6ead8 100%);
}}
a {{ color: inherit; }}
.shell {{ width: min(1480px, calc(100vw - 40px)); margin: 24px auto 56px; }}
.hero {{
  border: 1px solid var(--line);
  border-radius: 34px;
  padding: 28px;
  background: linear-gradient(135deg, rgba(255,249,234,.92), rgba(238,230,208,.84));
  box-shadow: var(--shadow);
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(360px, .8fr);
  gap: 24px;
}}
.eyebrow {{ letter-spacing: .22em; text-transform: uppercase; color: var(--moss); font-weight: 900; font-size: 12px; }}
h1 {{ margin: 8px 0 12px; font-size: clamp(38px, 5vw, 76px); line-height: .9; letter-spacing: -.06em; }}
.lead {{ max-width: 820px; color: var(--muted); font-size: 18px; line-height: 1.5; }}
.status-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
.stat {{
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: rgba(255,255,255,.45);
}}
.stat span {{ display:block; color: var(--muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; font-weight: 800; }}
.stat strong {{ display:block; margin-top: 4px; font-size: 24px; }}
.stat small {{ display:block; color: var(--muted); margin-top: 3px; }}
.transport {{
  position: sticky;
  top: 0;
  z-index: 5;
  margin: 18px 0;
  border: 1px solid rgba(36,29,22,.2);
  border-radius: 24px;
  background: rgba(36,29,22,.9);
  color: #fff9ea;
  padding: 14px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  box-shadow: 0 18px 48px rgba(36,29,22,.22);
}}
button, .button {{
  appearance: none;
  border: 0;
  border-radius: 999px;
  padding: 10px 14px;
  font-weight: 900;
  cursor: pointer;
  background: #fff4cf;
  color: var(--ink);
  text-decoration: none;
}}
button.primary {{ background: var(--gold); color: #21180f; }}
button.secondary {{ background: rgba(255,255,255,.14); color: #fff9ea; border: 1px solid rgba(255,255,255,.18); }}
.clock-readout {{ margin-left: auto; font-weight: 900; color: #d8f4e0; }}
.players {{ display: grid; grid-template-columns: minmax(0, .95fr) minmax(0, 1.25fr); gap: 18px; }}
.panel {{
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 20px;
  background: rgba(255,249,234,.82);
  box-shadow: 0 12px 34px rgba(36,29,22,.08);
}}
.panel h2 {{ margin: 0 0 8px; font-size: 28px; letter-spacing: -.04em; }}
audio {{ width: 100%; margin: 12px 0; }}
.mini-grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }}
.stem-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }}
.stem-card {{
  border: 1px solid var(--line);
  border-radius: 24px;
  padding: 16px;
  background: rgba(255,255,255,.46);
}}
.stem-card.role-charlie {{ box-shadow: inset 0 0 0 2px rgba(59,125,143,.18); }}
.stem-card.role-homer {{ box-shadow: inset 0 0 0 2px rgba(46,95,69,.18); }}
.stem-card.role-clip-source {{ box-shadow: inset 0 0 0 2px rgba(197,155,49,.22); }}
.stem-head {{ display: grid; gap: 4px; }}
.stem-head p {{ margin: 0; font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .12em; font-weight: 900; }}
.stem-head h3 {{ margin: 0; font-size: 20px; }}
.stem-head span {{ width: max-content; padding: 4px 9px; border-radius: 999px; background: rgba(46,95,69,.14); color: var(--moss); font-size: 12px; font-weight: 900; }}
.purpose, .dont, .clock {{ color: var(--muted); line-height: 1.45; font-size: 13px; }}
.dont {{ color: #7a3525; font-weight: 800; }}
.mission-grid {{ display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }}
.mission-link {{
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 8px 12px;
  text-decoration: none;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: rgba(255,255,255,.42);
}}
.mission-link span {{ grid-row: span 2; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--moss); color: #fff; font-weight: 900; }}
.mission-link strong {{ display: block; }}
.mission-link small {{ display: block; color: var(--muted); line-height: 1.35; }}
.review {{ margin-top: 18px; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ padding: 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }}
th {{ color: var(--muted); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }}
td small {{ display:block; color: var(--muted); }}
code {{ padding: 3px 6px; border-radius: 7px; background: rgba(36,29,22,.08); }}
.links {{ display:flex; flex-wrap:wrap; gap: 8px; margin-top: 14px; }}
.missing {{ padding: 12px; border-radius: 14px; background: rgba(176,90,60,.14); color: #7a3525; font-weight: 800; }}
@media (max-width: 1100px) {{
  .hero, .players {{ grid-template-columns: 1fr; }}
  .stem-grid, .mission-grid {{ grid-template-columns: 1fr; }}
  .clock-readout {{ margin-left: 0; width: 100%; }}
}}
</style>
</head>
<body>
<main class="shell">
  <section class="hero">
    <div>
      <p class="eyebrow">Quipsly Audio Workbench</p>
      <h1>Mastered spine, visible sources.</h1>
      <p class="lead">Episode 4 v006 is source-aware: Charlie, Homer, and clip/source audio remain separate refined stems on one sequence clock. This page is for listening and production judgment, not paperwork.</p>
      <div class="links">
        <a class="button" href="{e(path_uri(links.get('finalListenMissionPacket')))}">Mission packet</a>
        <a class="button" href="{e(path_uri(links.get('segmentLoudnessMap')))}">Loudness map</a>
        <a class="button" href="{e(path_uri(links.get('sourceAwareStemManifest')))}">Stem manifest</a>
      </div>
    </div>
    <div class="status-grid">
      {stat_card('status', report.get('status'), 'workbench')}
      {stat_card('approval', report.get('approvalStatus'), 'current lock')}
      {stat_card('ready stems', report.get('sourceAwareStemReadyCount'), 'Charlie, Homer, clip')}
      {stat_card('review windows', report.get('segmentLoudnessOutlierCount'), 'jump targets')}
    </div>
  </section>

  <nav class="transport">
    <button class="primary" onclick="playMaster()">Play master</button>
    <button class="primary" onclick="playAllSynced()">Play all stems synced</button>
    <button class="secondary" onclick="pauseAll()">Pause all</button>
    <button class="secondary" onclick="syncToMaster()">Sync stems to master</button>
    <button class="secondary" onclick="jumpTo(0)">Jump 00:00</button>
    <span class="clock-readout">Master time <span id="master-clock">00:00</span></span>
  </nav>

  <section class="players">
    <article class="panel">
      <h2>Mastered listener copy</h2>
      <p class="purpose">Judge the final podcast listening experience here. If it passes, branch rendering can inherit from the source-aware stems. If it fails, repair the owning source/stem stage.</p>
      {audio_element('master-player', master_m4a.get('path') or master_wav.get('path'), 'mastered spine')}
      <div class="mini-grid">
        {stat_card('duration', format_time(master_m4a.get('durationSeconds') or master_wav.get('durationSeconds')), 'full spine')}
        {stat_card('mean RMS', f"{master_rms.get('mean', 'n/a')} dBFS", 'master')}
        {stat_card('max peak', f"{master_peak.get('max', 'n/a')} dBFS", 'master')}
        {stat_card('quiet windows', master_summary.get('quietWindowCount', 'n/a'), '10s windows')}
      </div>
      <div class="links">
        <a class="button" href="{e(path_uri(master_m4a.get('path')))}">Open M4A</a>
        <a class="button" href="{e(path_uri(master_wav.get('path')))}">Open WAV</a>
      </div>
    </article>

    <article class="panel">
      <h2>Minimum useful listen path</h2>
      <p class="purpose">These are shortcuts to actual listening and diagnosis surfaces. They replace hunting through report files.</p>
      <div class="mission-grid">{''.join(mission_links)}</div>
    </article>
  </section>

  <section class="panel">
    <h2>Source-aware refined stems</h2>
    <p class="purpose">These are the editable audio sources branch renders must use. They stay aligned to sequence time so timing edits can follow video, reactions, and clip spacing.</p>
    <div class="stem-grid">{''.join(stem_cards)}</div>
  </section>

  <section class="panel review">
    <h2>Review windows</h2>
    <p class="purpose">Click Jump to sync the master and stem players to the same suspicious moment. This is the editor-facing version of transparency.</p>
    <table>
      <thead><tr><th></th><th>Time</th><th>Flags</th><th>Active stems</th><th>Master RMS</th><th>Stem RMS</th></tr></thead>
      <tbody>{''.join(review_rows)}</tbody>
    </table>
  </section>
</main>
<script>
const master = document.getElementById('master-player');
const stemPlayers = Array.from(document.querySelectorAll('.stem-audio'));
const allPlayers = () => [master, ...stemPlayers].filter(Boolean);
function fmt(t) {{
  t = Math.max(0, Math.floor(t || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h ? `${{String(h).padStart(2,'0')}}:${{String(m).padStart(2,'0')}}:${{String(s).padStart(2,'0')}}` : `${{String(m).padStart(2,'0')}}:${{String(s).padStart(2,'0')}}`;
}}
function setAllTime(t) {{
  for (const player of allPlayers()) {{
    try {{ player.currentTime = t; }} catch (_) {{}}
  }}
  document.getElementById('master-clock').textContent = fmt(t);
}}
function syncToMaster() {{
  if (!master) return;
  setAllTime(master.currentTime || 0);
}}
function jumpTo(t) {{
  setAllTime(Number(t) || 0);
  if (master) master.play();
}}
function playMaster() {{
  if (!master) return;
  for (const player of stemPlayers) player.pause();
  master.play();
}}
function playAllSynced() {{
  if (!master) return;
  const t = master.currentTime || 0;
  setAllTime(t);
  for (const player of allPlayers()) player.play();
}}
function pauseAll() {{
  for (const player of allPlayers()) player.pause();
}}
if (master) {{
  master.addEventListener('timeupdate', () => {{
    document.getElementById('master-clock').textContent = fmt(master.currentTime || 0);
  }});
  master.addEventListener('seeked', syncToMaster);
}}
document.querySelectorAll('.jump').forEach(button => {{
  button.addEventListener('click', () => jumpTo(button.dataset.start));
}});
</script>
</body>
</html>
"""


def update_manifest(baseline_dir: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_command: Path, versioned: dict[str, str]) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioSourceAwareListenWorkbench"] = str(json_path)
    outputs["latestAudioSourceAwareListenWorkbenchJson"] = str(json_path)
    outputs["latestAudioSourceAwareListenWorkbenchMarkdown"] = str(md_path)
    outputs["latestAudioSourceAwareListenWorkbenchHtml"] = str(html_path)
    outputs["latestAudioSourceAwareListenWorkbenchOpenCommand"] = str(open_command)
    outputs["latestAudioSourceAwareListenWorkbenchVersioned"] = versioned["json"]
    history = outputs.setdefault("audioSourceAwareListenWorkbenches", [])
    if versioned["json"] not in history:
        history.append(versioned["json"])
    manifest["audioSourceAwareListenWorkbenchLatestStatus"] = report["status"]
    manifest["audioSourceAwareListenWorkbenchMissingAudioCount"] = len(report.get("missingAudio") or [])
    manifest["audioSourceAwareListenWorkbenchStemCount"] = len(report.get("stems") or [])
    manifest["audioSourceAwareListenWorkbenchReviewWindowCount"] = len(report.get("reviewWindows") or [])
    manifest["audioSourceAwareListenWorkbenchApprovalStateChanged"] = False
    manifest["audioSourceAwareListenWorkbenchBranchRenderAttempted"] = False
    manifest["audioSourceAwareListenWorkbenchPublicationAttempted"] = False
    manifest["audioSourceAwareListenWorkbenchOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    report = build_workbench(baseline_dir)
    slug = safe_slug(report["baselineId"])
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    json_path = baseline_dir / "AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.json"
    md_path = baseline_dir / "AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.md"
    html_path = baseline_dir / "AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.html"
    open_command = baseline_dir / "OPEN_AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.command"
    version_dir = baseline_dir / f"audio-source-aware-listen-workbench-{slug}-{stamp}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "audio-source-aware-listen-workbench.json"
    version_md = version_dir / "audio-source-aware-listen-workbench.md"
    version_html = version_dir / "audio-source-aware-listen-workbench.html"
    version_open = version_dir / "open-audio-source-aware-listen-workbench.command"

    report.update(
        {
            "jsonPath": str(json_path),
            "markdownPath": str(md_path),
            "htmlPath": str(html_path),
            "openCommand": str(open_command),
            "versionedJsonPath": str(version_json),
            "versionedMarkdownPath": str(version_md),
            "versionedHtmlPath": str(version_html),
            "versionedOpenCommand": str(version_open),
        }
    )

    html_doc = render_html(report)
    md_doc = render_markdown(report)
    write_json(json_path, report)
    md_path.write_text(md_doc, encoding="utf-8")
    html_path.write_text(html_doc, encoding="utf-8")
    write_json(version_json, report)
    version_md.write_text(md_doc, encoding="utf-8")
    version_html.write_text(html_doc, encoding="utf-8")
    open_command.write_text("#!/bin/zsh\nopen " + shell_quote(str(html_path)) + "\n", encoding="utf-8")
    version_open.write_text("#!/bin/zsh\nopen " + shell_quote(str(version_html)) + "\n", encoding="utf-8")
    open_command.chmod(0o755)
    version_open.chmod(0o755)

    update_manifest(
        baseline_dir,
        report,
        json_path,
        md_path,
        html_path,
        open_command,
        {"json": str(version_json), "md": str(version_md), "html": str(version_html), "open": str(version_open)},
    )

    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
