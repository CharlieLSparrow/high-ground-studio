#!/usr/bin/env python3
"""Create the Episode 4 source-aware stem manifest.

This artifact keeps the editor truth separate from the listening artifact:
refined Charlie, Homer, and clip/source stems stay synced to one sequence clock,
while the mastered audio spine remains a review/export convenience. The script
only reads and records evidence. It does not approve audio, unlock branches,
render media, upload, publish, or mutate source media.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)

EDITOR_AUDIO_TRUTH_RULE = (
    "The editor-grade truth is aligned, source-aware refined stems plus a mix recipe; "
    "the combined mastered spine is a review/export convenience artifact."
)

ROLE_SPECS = [
    {
        "id": "charlie",
        "label": "Charlie refined dialogue stem",
        "speaker": "Charlie",
        "alignedKey": "charlieAligned",
        "contributionKey": "charlieContribution",
        "proofStemName": "charlie-contribution.wav",
        "purpose": "Primary Charlie voice, laughs, reactions, and intentional room texture after contribution gating.",
        "doNotDo": "Do not mute Charlie's whole source whenever Homer speaks; preserve real overlap and reactions.",
    },
    {
        "id": "homer",
        "label": "Homer refined dialogue stem",
        "speaker": "Homer",
        "alignedKey": "homerDjiAligned",
        "contributionKey": "homerContribution",
        "proofStemName": "homer-contribution.wav",
        "purpose": "Primary Homer/Scott voice from DJI audio after source-aware contribution gating.",
        "doNotDo": "Do not treat low activity percentage as disappearance; use survival/source-balance evidence before repair.",
    },
    {
        "id": "clip-source",
        "label": "Clip/source audio stem",
        "speaker": "Reference / watched clip",
        "alignedKey": "referenceAligned",
        "contributionKey": "referenceContribution",
        "proofStemName": "reference-contribution.wav",
        "purpose": "Watched/reference clip audio preserved as its own editable source lane.",
        "doNotDo": "Do not bake clip ducking into the only master; branch edits need clip/source timing control.",
    },
]


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


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = output_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "openCommand",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(outputs: dict[str, Any], key: str, fallback: Path | None = None) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if path:
        candidate = Path(path)
        if candidate.exists() and candidate.suffix.lower() == ".json":
            try:
                return read_json(candidate)
            except json.JSONDecodeError:
                return {}
    if fallback and fallback.exists():
        try:
            return read_json(fallback)
        except json.JSONDecodeError:
            return {}
    return {}


def probe_audio(path_value: Any, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    fallback = fallback or {}
    if not path_value:
        return {"exists": False, "path": None, "probeSource": "missing"}
    path = Path(str(path_value))
    base: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "probeSource": "fallback-metadata",
    }
    if path.exists():
        base["sizeBytes"] = path.stat().st_size
    for key in ("durationSeconds", "sampleRate", "channels", "codec", "windowCount", "windowSeconds"):
        if key in fallback:
            base[key] = fallback[key]
    if not path.exists():
        return base
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        base["probeWarning"] = "ffprobe not available; using existing manifest metadata"
        return base
    proc = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,channels,sample_rate",
            "-of",
            "json",
            str(path),
        ],
        text=True,
        capture_output=True,
    )
    if proc.returncode != 0:
        base["probeWarning"] = (proc.stderr or proc.stdout or "ffprobe failed").strip()[:500]
        return base
    try:
        raw = json.loads(proc.stdout)
    except json.JSONDecodeError:
        base["probeWarning"] = "ffprobe returned non-JSON output"
        return base
    streams = raw.get("streams") if isinstance(raw.get("streams"), list) else []
    stream = streams[0] if streams else {}
    fmt = raw.get("format") if isinstance(raw.get("format"), dict) else {}
    duration = fmt.get("duration")
    base.update(
        {
            "probeSource": "ffprobe",
            "durationSeconds": round(float(duration), 3) if duration not in (None, "") else base.get("durationSeconds"),
            "sampleRate": int(stream.get("sample_rate")) if str(stream.get("sample_rate", "")).isdigit() else base.get("sampleRate"),
            "channels": int(stream.get("channels")) if str(stream.get("channels", "")).isdigit() else base.get("channels"),
            "codec": stream.get("codec_name") or base.get("codec"),
        }
    )
    return base


def path_exists(path_value: Any) -> bool:
    return bool(path_value and Path(str(path_value)).exists())


def find_latest_derived_stem_dirs(baseline_dir: Path) -> list[Path]:
    dirs = [p for p in baseline_dir.glob("audio-reusable-profile-smoke-*/derived-stems") if p.is_dir()]
    return sorted(dirs, key=lambda p: p.stat().st_mtime if p.exists() else 0, reverse=True)


def matching_proof_stem(derived_dirs: list[Path], stem_name: str) -> str | None:
    for directory in derived_dirs:
        candidate = directory / stem_name
        if candidate.exists():
            return str(candidate)
    return None


def duration_delta(a: Any, b: Any) -> float | None:
    try:
        return round(abs(float(a) - float(b)), 3)
    except (TypeError, ValueError):
        return None


def build_role_report(
    spec: dict[str, Any],
    stem_meta: dict[str, Any],
    stem_summary: dict[str, Any],
    derived_dirs: list[Path],
    master_duration: Any,
) -> dict[str, Any]:
    aligned_meta = stem_meta.get(spec["alignedKey"]) if isinstance(stem_meta.get(spec["alignedKey"]), dict) else {}
    contribution_meta = stem_meta.get(spec["contributionKey"]) if isinstance(stem_meta.get(spec["contributionKey"]), dict) else {}
    contribution_summary = stem_summary.get(spec["contributionKey"]) if isinstance(stem_summary.get(spec["contributionKey"]), dict) else {}
    aligned_summary = stem_summary.get(spec["alignedKey"]) if isinstance(stem_summary.get(spec["alignedKey"]), dict) else {}

    refined_path = contribution_meta.get("path")
    aligned_path = aligned_meta.get("path")
    proof_path = matching_proof_stem(derived_dirs, spec["proofStemName"])
    refined_probe = probe_audio(refined_path, contribution_meta)
    aligned_probe = probe_audio(aligned_path, aligned_meta)
    proof_probe = probe_audio(proof_path) if proof_path else {"exists": False, "path": None, "probeSource": "missing"}
    delta = duration_delta(refined_probe.get("durationSeconds"), master_duration)

    warnings: list[str] = []
    if not refined_probe.get("exists"):
        warnings.append("Selected refined/contribution stem file is missing.")
    if not aligned_probe.get("exists"):
        warnings.append("Aligned pre-contribution source stem file is missing.")
    if delta is None:
        warnings.append("Could not compare refined stem duration against mastered spine duration.")
    elif delta > 0.25:
        warnings.append(f"Refined stem duration differs from mastered spine by {delta}s.")
    if not proof_probe.get("exists"):
        warnings.append("Reusable/profile proof copy is missing; editor truth still uses the sync-layer contribution stem.")

    return {
        "roleId": spec["id"],
        "label": spec["label"],
        "speaker": spec["speaker"],
        "purpose": spec["purpose"],
        "doNotDo": spec["doNotDo"],
        "sequenceClockPolicy": "Starts at sequence 0.0 and stays sample-aligned to the Episode 4 sync layer; edit branches may mute/duck/keyframe but must not trim source timing.",
        "selectedRefinedStem": refined_probe,
        "alignedSourceStem": aligned_probe,
        "proofDerivedStem": proof_probe,
        "contributionSummary": contribution_summary,
        "alignedSummary": aligned_summary,
        "durationDeltaToMasterSeconds": delta,
        "status": "ready" if not warnings or warnings == ["Reusable/profile proof copy is missing; editor truth still uses the sync-layer contribution stem."] else "needs-attention",
        "warnings": warnings,
        "warningCount": len(warnings),
    }


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    source_activity = load_report(outputs, "sourceActivity")
    lineage = load_report(outputs, "latestAudioTransformationLineageLedger", baseline_dir / "AUDIO_TRANSFORMATION_LINEAGE_LEDGER.json")
    source_balance = load_report(outputs, "latestAudioSourceBalanceTriage", baseline_dir / "AUDIO_SOURCE_BALANCE_TRIAGE.json")
    quality_plan = load_report(outputs, "latestAudioQualityEscalationPlan", baseline_dir / "AUDIO_QUALITY_ESCALATION_PLAN.json")

    stem_meta = source_activity.get("stemMeta") if isinstance(source_activity.get("stemMeta"), dict) else {}
    stem_summary = source_activity.get("stemSummary") if isinstance(source_activity.get("stemSummary"), dict) else {}
    derived_dirs = find_latest_derived_stem_dirs(baseline_dir)

    source_mix = manifest.get("sourceAwareMix") if isinstance(manifest.get("sourceAwareMix"), dict) else {}
    master_wav = output_path(outputs.get("masterWav")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.wav")
    master_m4a = output_path(outputs.get("masterM4a")) or str(baseline_dir / "episode4-mastered-audio-spine-v006.m4a")
    source_mix_probe = source_mix.get("probe") if isinstance(source_mix.get("probe"), dict) else {}
    master_probe = probe_audio(master_wav)
    master_m4a_probe = probe_audio(master_m4a)
    master_duration = master_probe.get("durationSeconds") or master_m4a_probe.get("durationSeconds") or source_mix_probe.get("durationSeconds")

    roles = [build_role_report(spec, stem_meta, stem_summary, derived_dirs, master_duration) for spec in ROLE_SPECS]
    required_count = len(ROLE_SPECS)
    resolved_count = sum(1 for role in roles if role["selectedRefinedStem"].get("exists"))
    ready_count = sum(1 for role in roles if role["status"] == "ready")
    warning_count = sum(int(role["warningCount"]) for role in roles)
    missing_required = [role["roleId"] for role in roles if not role["selectedRefinedStem"].get("exists")]

    status = "source-aware-stems-ready-human-listen-gated"
    if missing_required:
        status = "source-aware-stems-needs-attention"
    elif warning_count:
        status = "source-aware-stems-ready-with-warnings-human-listen-gated"

    safety = {
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }

    return {
        "schema": "quipsly.audio.sourceAwareStemManifest.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "editorAudioTruthRule": EDITOR_AUDIO_TRUTH_RULE,
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "requiredStemCount": required_count,
        "resolvedStemCount": resolved_count,
        "readyStemCount": ready_count,
        "warningCount": warning_count,
        "missingRequiredRoles": missing_required,
        "sequenceClock": {
            "clock": "Episode 4 conformed production sequence time",
            "startsAtSeconds": 0.0,
            "expectedDurationSeconds": master_duration,
            "rule": "All source-aware stems remain full-length and aligned; edit decisions sit above them as metadata.",
        },
        "mixRecipe": {
            "sourceAwareProfileMix": source_mix,
            "masterWav": master_probe,
            "masterM4a": master_m4a_probe,
            "recipe": "aligned stems + source-aware contribution gates + preserved overlap/reaction policy + mastering chain -> v006 mastered spine",
            "canonicalEditorTruth": "Use the role stems below plus metadata decisions for editor branches; use the mastered spine for listening, Premiere handoff, and final podcast audio after approval.",
        },
        "roles": roles,
        "lineage": {
            "status": lineage.get("lineageStatus"),
            "stageCount": lineage.get("stageCount"),
            "missingEvidenceCount": lineage.get("missingEvidenceCount"),
            "partialOrWaitingStages": lineage.get("partialOrWaitingStages"),
            "safeNextActions": lineage.get("safeNextActions"),
        },
        "sourceBalance": {
            "status": source_balance.get("status"),
            "allSpeakersSurviveInMaster": source_balance.get("allSpeakersSurviveInMaster"),
            "machineWarningCount": source_balance.get("machineWarningCount"),
            "queueBalanceItemCount": source_balance.get("queueBalanceItemCount"),
            "conclusion": source_balance.get("conclusion"),
        },
        "qualityEscalationPlan": {
            "status": quality_plan.get("status"),
            "nextMethodCount": quality_plan.get("nextMethodCount"),
            "requiredStemCount": quality_plan.get("requiredStemCount"),
            "editorAudioTruthRule": quality_plan.get("editorAudioTruthRule") or quality_plan.get("editorAudioTruth", {}).get("rule"),
        },
        "safety": safety,
        **safety,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Episode 4 Source-Aware Stem Manifest",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        f"Status: `{report['status']}`",
        "",
        f"Baseline: `{report.get('baselineId')}`",
        "",
        f"Editor truth: {report['editorAudioTruthRule']}",
        "",
        "## Current gate",
        "",
        f"- Approval: `{report.get('approvalStatus')}`",
        f"- Human listen still required: `{str(report.get('humanListenStillRequired')).lower()}`",
        f"- Branch inheritance ready: `{str(report.get('branchInheritanceReady')).lower()}`",
        f"- Branch render ready: `{str(report.get('branchRenderReady')).lower()}`",
        "",
        "## Required stems",
        "",
        "| Role | Status | Refined stem | Duration | Active | Warnings |",
        "| --- | --- | --- | ---: | ---: | ---: |",
    ]
    for role in report["roles"]:
        refined = role["selectedRefinedStem"]
        summary = role.get("contributionSummary") or {}
        lines.append(
            "| "
            + " | ".join(
                [
                    role["label"],
                    f"`{role['status']}`",
                    f"`{Path(str(refined.get('path'))).name if refined.get('path') else 'missing'}`",
                    str(refined.get("durationSeconds") or "unknown"),
                    f"{summary.get('activePercent', 'unknown')}%",
                    str(role["warningCount"]),
                ]
            )
            + " |"
        )
    lines.extend([
        "",
        "## Role details",
        "",
    ])
    for role in report["roles"]:
        lines.extend([
            f"### {role['label']}",
            "",
            f"Purpose: {role['purpose']}",
            "",
            f"Do not do: {role['doNotDo']}",
            "",
            f"Refined stem: `{role['selectedRefinedStem'].get('path')}`",
            "",
            f"Aligned source stem: `{role['alignedSourceStem'].get('path')}`",
            "",
            f"Proof copy: `{role['proofDerivedStem'].get('path')}`",
            "",
            f"Duration delta to master: `{role.get('durationDeltaToMasterSeconds')}` seconds",
            "",
        ])
        if role["warnings"]:
            lines.append("Warnings:")
            for warning in role["warnings"]:
                lines.append(f"- {warning}")
            lines.append("")
    lines.extend([
        "## Mix recipe",
        "",
        f"- Source-aware mix: `{(report.get('mixRecipe') or {}).get('sourceAwareProfileMix', {}).get('path')}`",
        f"- Master WAV: `{(report.get('mixRecipe') or {}).get('masterWav', {}).get('path')}`",
        f"- Master M4A: `{(report.get('mixRecipe') or {}).get('masterM4a', {}).get('path')}`",
        "- Rule: aligned stems plus non-destructive metadata decisions produce review/export spines only when needed.",
        "",
        "## Safety",
        "",
    ])
    for key, value in report["safety"].items():
        lines.append(f"- `{key}`: `{str(value).lower()}`")
    lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any], markdown: str) -> str:
    role_cards = []
    for role in report["roles"]:
        refined = role["selectedRefinedStem"]
        summary = role.get("contributionSummary") or {}
        warnings = "".join(f"<li>{html.escape(w)}</li>" for w in role["warnings"]) or "<li>None</li>"
        role_cards.append(
            f"""
            <section class=\"card\">
              <h2>{html.escape(role['label'])}</h2>
              <p><strong>Status:</strong> <code>{html.escape(role['status'])}</code></p>
              <p>{html.escape(role['purpose'])}</p>
              <p><strong>Refined stem:</strong> <code>{html.escape(str(refined.get('path')))}</code></p>
              <p><strong>Duration:</strong> {html.escape(str(refined.get('durationSeconds') or 'unknown'))}s | <strong>Active:</strong> {html.escape(str(summary.get('activePercent', 'unknown')))}%</p>
              <p><strong>Do not do:</strong> {html.escape(role['doNotDo'])}</p>
              <ul>{warnings}</ul>
            </section>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Episode 4 Source-Aware Stem Manifest</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 32px; background: #f8f2e7; color: #2f261d; }}
    .hero, .card {{ background: #fffaf0; border: 1px solid #dbc79b; border-radius: 18px; padding: 22px; margin-bottom: 18px; box-shadow: 0 12px 36px rgba(88,65,32,.10); }}
    .pill {{ display:inline-block; padding: 6px 10px; border-radius:999px; background:#244d3a; color:#f6ffe8; font-weight:700; }}
    code {{ background: rgba(65,43,25,.10); padding: 2px 5px; border-radius: 6px; }}
    pre {{ white-space: pre-wrap; background:#1e2b22; color:#f9ffe8; padding:18px; border-radius:14px; overflow:auto; }}
  </style>
</head>
<body>
  <section class=\"hero\">
    <p class=\"pill\">{html.escape(report['status'])}</p>
    <h1>Episode 4 Source-Aware Stem Manifest</h1>
    <p>{html.escape(report['editorAudioTruthRule'])}</p>
    <p><strong>Human listen still required:</strong> {html.escape(str(report.get('humanListenStillRequired')).lower())}</p>
  </section>
  {''.join(role_cards)}
  <section class=\"card\">
    <h2>Machine-readable report</h2>
    <pre>{html.escape(json.dumps(report, indent=2, sort_keys=True))}</pre>
  </section>
</body>
</html>
"""


def update_manifest(manifest_path: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_command: Path, versioned: dict[str, str]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "schema": report["schema"],
        "status": report["status"],
        "generatedAt": report["generatedAt"],
        "path": str(json_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "openCommand": str(open_command),
        "versionedPath": versioned["json"],
        "versionedJsonPath": versioned["json"],
        "versionedMarkdownPath": versioned["markdown"],
        "versionedHtmlPath": versioned["html"],
        "versionedOpenCommand": versioned["openCommand"],
        "requiredStemCount": report["requiredStemCount"],
        "resolvedStemCount": report["resolvedStemCount"],
        "readyStemCount": report["readyStemCount"],
        "warningCount": report["warningCount"],
        "editorAudioTruthRule": report["editorAudioTruthRule"],
        "humanListenStillRequired": report["humanListenStillRequired"],
        **report["safety"],
    }
    outputs["latestAudioSourceAwareStemManifest"] = entry
    outputs["latestAudioSourceAwareStemManifestMarkdown"] = str(md_path)
    outputs["latestAudioSourceAwareStemManifestHtml"] = str(html_path)
    outputs["latestAudioSourceAwareStemManifestOpenCommand"] = str(open_command)
    history = outputs.setdefault("audioSourceAwareStemManifests", [])
    if isinstance(history, list):
        history.append(entry)
    else:
        outputs["audioSourceAwareStemManifests"] = [entry]

    manifest["audioSourceAwareStemManifestLatestStatus"] = report["status"]
    manifest["audioSourceAwareStemManifestLatestGeneratedAt"] = report["generatedAt"]
    manifest["audioSourceAwareStemManifestRoleCount"] = len(report["roles"])
    manifest["audioSourceAwareStemManifestRequiredStemCount"] = report["requiredStemCount"]
    manifest["audioSourceAwareStemManifestResolvedStemCount"] = report["resolvedStemCount"]
    manifest["audioSourceAwareStemManifestReadyStemCount"] = report["readyStemCount"]
    manifest["audioSourceAwareStemManifestWarningCount"] = report["warningCount"]
    manifest["audioSourceAwareStemManifestHumanListenStillRequired"] = report["humanListenStillRequired"]
    manifest["audioSourceAwareStemManifestEditorAudioTruthRule"] = report["editorAudioTruthRule"]
    manifest["audioSourceAwareStemManifestLatestMarkdown"] = str(md_path)
    for key, value in report["safety"].items():
        manifest["audioSourceAwareStemManifest" + key[0].upper() + key[1:]] = value
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = iso_now()
    stamp = utc_stamp()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))

    report = build_report(manifest, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html_doc = render_html(report, markdown)

    json_path = baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json"
    md_path = baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.md"
    html_path = baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.html"
    open_command = baseline_dir / "OPEN_AUDIO_SOURCE_AWARE_STEM_MANIFEST.command"
    version_json = baseline_dir / f"audio-source-aware-stem-manifest-{baseline_slug}-{stamp}.json"
    version_md = baseline_dir / f"audio-source-aware-stem-manifest-{baseline_slug}-{stamp}.md"
    version_html = baseline_dir / f"audio-source-aware-stem-manifest-{baseline_slug}-{stamp}.html"
    version_open = baseline_dir / f"open-audio-source-aware-stem-manifest-{baseline_slug}-{stamp}.command"

    write_json(json_path, report)
    md_path.write_text(markdown + "\n", encoding="utf-8")
    html_path.write_text(html_doc, encoding="utf-8")
    write_json(version_json, report)
    version_md.write_text(markdown + "\n", encoding="utf-8")
    version_html.write_text(html_doc, encoding="utf-8")
    command_text = "#!/bin/zsh\nopen " + shell_quote(str(html_path)) + "\n"
    open_command.write_text(command_text, encoding="utf-8")
    version_open.write_text(command_text.replace(str(html_path), str(version_html)), encoding="utf-8")
    open_command.chmod(0o755)
    version_open.chmod(0o755)

    update_manifest(
        manifest_path,
        report,
        json_path,
        md_path,
        html_path,
        open_command,
        {"json": str(version_json), "markdown": str(version_md), "html": str(version_html), "openCommand": str(version_open)},
    )

    print(json.dumps({
        "status": report["status"],
        "requiredStemCount": report["requiredStemCount"],
        "resolvedStemCount": report["resolvedStemCount"],
        "readyStemCount": report["readyStemCount"],
        "warningCount": report["warningCount"],
        "json": str(json_path),
        "html": str(html_path),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
