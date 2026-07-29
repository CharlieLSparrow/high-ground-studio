#!/usr/bin/env python3
"""Fast readback check for the active Episode audio review package.

This is the cheap confidence tier. It reads existing manifest/report/artifact
truth and writes a compact status report. It does not regenerate audio
evidence, approve audio, unlock branches, render media, upload, publish, or
mutate original/source media.
"""

from __future__ import annotations

import argparse
import html
import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class Check:
    name: str
    passed: bool
    severity: str
    expected: Any
    actual: Any
    detail: str


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


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        for key in (
            "path",
            "jsonPath",
            "markdownPath",
            "htmlPath",
            "csvPath",
            "openCommand",
            "m4aPath",
            "wavPath",
            "versionedPath",
            "versionedJsonPath",
            "versionedMarkdownPath",
            "versionedHtmlPath",
        ):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(path: Path) -> dict[str, Any]:
    if not path.exists() or path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def add_check(
    checks: list[Check],
    name: str,
    passed: bool,
    expected: Any,
    actual: Any,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    checks.append(Check(name=name, passed=passed, severity=severity, expected=expected, actual=actual, detail=detail))


def add_equal(
    checks: list[Check],
    name: str,
    expected: Any,
    actual: Any,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    add_check(checks, name, expected == actual, expected, actual, detail, severity=severity)


def add_false(
    checks: list[Check],
    name: str,
    actual: Any,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    add_equal(checks, name, False, bool_value(actual), detail, severity=severity)


def add_file(
    checks: list[Check],
    name: str,
    path: str | None,
    detail: str,
    *,
    severity: str = "hard-stop",
) -> None:
    exists = bool(path and Path(path).exists())
    add_check(checks, name, exists, "present file", path or "missing", detail, severity=severity)


def e(value: Any) -> str:
    return html.escape(str(value))


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Fast Audio Readback Check: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This is the fast validation tier. It checks that the current human-listen package is coherent and still locked without regenerating slow audio evidence.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Warnings: `{report['warningCount']}`",
        f"- Check count: `{report['checkCount']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Final episode gate: `{report['finalEpisodeGateStatus']}`",
        f"- Shorts gate: `{report['shortsGateStatus']}`",
        f"- Final-listen packet: `{report['finalListenMissionStatus']}`",
        f"- Source-aware stems: `{report['sourceAwareStemResolvedCount']}` resolved",
        f"- Source-aware timing: `{report['sourceAwareTimingContractStatus']}` ready=`{str(report['sourceAwareTimingContractReady']).lower()}`",
        f"- Segment review windows: `{report['segmentLoudnessReviewWindowCount']}`",
        f"- Post-approval rehearsal: `{report['postApprovalRenderRehearsalStatus']}`",
        f"- Approved sandbox branches: `{report['postApprovalApprovedSandboxBranchCount']}`",
        f"- Post-listen router: `{report['postListenOutcomeRouterStatus']}`",
        f"- Router source-aware gate ready: `{str(report['postListenOutcomeRouterSourceAwareBranchGateReady']).lower()}`",
        f"- Router audio truth: `{report['postListenOutcomeRouterBranchRenderAudioTruth']}`",
        f"- Router flat-master editable: `{str(report['postListenOutcomeRouterMasteredSpineOnlyEditingAllowed']).lower()}`",
        f"- Branch preflight: `{report['branchRenderPreflightStatus']}`",
        f"- Branch preflight source-aware ready: `{str(report['branchRenderPreflightSourceAwareAudioTruthReady']).lower()}`",
        f"- Branch preflight commands exposed: `{str(report['branchRenderPreflightRealBranchRenderCommandsExposed']).lower()}`",
        "",
        "## Checks",
        "",
        "| Result | Severity | Check | Expected | Actual | Detail |",
        "|---|---|---|---|---|---|",
    ]
    for check in report["checks"]:
        result = "pass" if check["passed"] else "fail"
        lines.append(
            "| "
            + " | ".join(
                [
                    f"`{result}`",
                    f"`{check['severity']}`",
                    e(check["name"]),
                    f"`{e(check['expected'])}`",
                    f"`{e(check['actual'])}`",
                    e(check["detail"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Safety",
            "",
            "- This check does not approve audio.",
            "- This check does not unlock branch inheritance or branch rendering.",
            "- This check does not render, upload, publish, or mutate original media.",
            "",
            "## Next action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    failed = [check for check in report["checks"] if not check["passed"]]
    rows = "\n".join(
        f"<tr class=\"{'pass' if check['passed'] else 'fail'}\"><td>{'PASS' if check['passed'] else 'FAIL'}</td><td>{e(check['severity'])}</td><td>{e(check['name'])}</td><td>{e(check['expected'])}</td><td>{e(check['actual'])}</td><td>{e(check['detail'])}</td></tr>"
        for check in report["checks"]
    )
    failed_list = "\n".join(f"<li>{e(check['name'])}: {e(check['actual'])}</li>" for check in failed) or "<li>None</li>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Fast Audio Readback Check</title>
  <style>
    :root {{
      color-scheme: dark;
      --bg: #111713;
      --card: #1a241d;
      --ink: #f2ead7;
      --muted: #b9ad96;
      --ok: #79d487;
      --bad: #ff746f;
      --gold: #f0c95b;
      --line: rgba(242,234,215,.16);
    }}
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Avenir Next', sans-serif; background: radial-gradient(circle at top left, #263824, var(--bg)); color: var(--ink); }}
    main {{ max-width: 1120px; margin: 0 auto; padding: 42px 24px 64px; }}
    h1 {{ font-size: 42px; line-height: 1.02; margin: 0 0 12px; }}
    h2 {{ margin-top: 34px; }}
    .card {{ background: color-mix(in oklab, var(--card), transparent 8%); border: 1px solid var(--line); border-radius: 22px; padding: 22px; box-shadow: 0 18px 60px rgba(0,0,0,.24); }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 22px 0; }}
    .pill {{ border: 1px solid var(--line); border-radius: 16px; padding: 14px; background: rgba(255,255,255,.04); }}
    .pill b {{ display:block; color: var(--gold); font-size: 12px; text-transform: uppercase; letter-spacing: .12em; margin-bottom: 6px; }}
    .pass td:first-child {{ color: var(--ok); font-weight: 800; }}
    .fail td:first-child {{ color: var(--bad); font-weight: 800; }}
    table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
    th, td {{ border-bottom: 1px solid var(--line); padding: 9px 8px; text-align: left; vertical-align: top; }}
    th {{ color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; }}
    code {{ color: var(--gold); }}
    .muted {{ color: var(--muted); }}
  </style>
</head>
<body>
<main>
  <section class=\"card\">
    <p class=\"muted\">Quipsly Studio</p>
    <h1>Fast Audio Readback Check</h1>
    <p>This fast tier proves the current v006 listen package is coherent and safely locked. It does not regenerate audio evidence or unlock rendering.</p>
    <div class=\"grid\">
      <div class=\"pill\"><b>Status</b>{e(report['status'])}</div>
      <div class=\"pill\"><b>Passed</b>{e(str(report['passed']).lower())}</div>
      <div class=\"pill\"><b>Hard stops</b>{e(report['hardStopCount'])}</div>
      <div class=\"pill\"><b>Warnings</b>{e(report['warningCount'])}</div>
      <div class=\"pill\"><b>Checks</b>{e(report['checkCount'])}</div>
      <div class=\"pill\"><b>Gate</b>{e(report['approvalStatus'])}</div>
      <div class=\"pill\"><b>Final episode</b>{e(report['finalEpisodeGateStatus'])}</div>
      <div class=\"pill\"><b>Shorts</b>{e(report['shortsGateStatus'])}</div>
    </div>
  </section>
  <section class=\"card\">
    <h2>Failures</h2>
    <ul>{failed_list}</ul>
    <h2>Checks</h2>
    <table>
      <thead><tr><th>Result</th><th>Severity</th><th>Check</th><th>Expected</th><th>Actual</th><th>Detail</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
  </section>
</main>
</body>
</html>
"""


def build_report(baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.get("outputs") if isinstance(manifest.get("outputs"), dict) else {}
    baseline_id = str(manifest.get("baselineId") or manifest.get("id") or baseline_dir.name)

    packet = load_report(baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.json")
    smoke = load_report(baseline_dir / "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.json")
    source_stems = load_report(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json")
    source_timing = load_report(baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json")
    segment_map = load_report(baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json")
    post_approval = load_report(baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json")
    post_listen_router = load_report(baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.json")
    branch_preflight = load_report(baseline_dir / "BRANCH_RENDER_PREFLIGHT.json")
    post_listen_refresh = load_report(baseline_dir / "POST_LISTEN_REFRESH.json")
    checks: list[Check] = []

    required_files = {
        "mastered-listening-m4a": baseline_dir / "episode4-mastered-audio-spine-v006.m4a",
        "mastered-handoff-wav": baseline_dir / "episode4-mastered-audio-spine-v006.wav",
        "final-listen-mission-html": baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.html",
        "final-listen-mission-json": baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.json",
        "source-aware-stem-html": baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.html",
        "source-aware-stem-json": baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json",
        "source-aware-timing-contract-html": baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.html",
        "source-aware-timing-contract-json": baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json",
        "segment-loudness-map-html": baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.html",
        "segment-loudness-map-json": baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json",
        "post-approval-render-rehearsal-html": baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.html",
        "post-approval-render-rehearsal-json": baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json",
        "post-listen-router-html": baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.html",
        "post-listen-router-json": baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.json",
        "branch-render-preflight-html": baseline_dir / "BRANCH_RENDER_PREFLIGHT.html",
        "branch-render-preflight-json": baseline_dir / "BRANCH_RENDER_PREFLIGHT.json",
        "post-listen-refresh-html": baseline_dir / "POST_LISTEN_REFRESH.html",
        "post-listen-refresh-json": baseline_dir / "POST_LISTEN_REFRESH.json",
        "start-here-review": baseline_dir / "START_HERE_EPISODE_4_AUDIO_REVIEW.md",
        "review-status-board": baseline_dir / "EPISODE_4_AUDIO_REVIEW_STATUS.md",
        "desktop-listen-launcher": Path("/Users/wall-e/Desktop/EPISODE_4_LISTEN_NOW.command"),
    }
    for name, path in required_files.items():
        add_file(checks, name, str(path), "required fast-review artifact")

    add_equal(checks, "approval-status-locked", "machine-candidate-needs-human-listen-proof", manifest.get("approvalStatus"), "manifest approval state")
    add_equal(checks, "package-ready-for-human-listen", True, bool_value(manifest.get("packageReadyForHumanListen")), "manifest review readiness")
    add_false(checks, "branch-inheritance-ready-false", manifest.get("branchInheritanceReady"), "branch inheritance must stay locked")
    add_false(checks, "branch-render-ready-false", manifest.get("branchRenderReady"), "branch rendering must stay locked")
    add_equal(checks, "branch-inheritance-gate-status", "blocked-waiting-for-human-listen-proof", manifest.get("branchInheritanceGateStatus"), "manifest branch gate")
    add_equal(checks, "branch-inheritance-gate-source-aware-ready", True, bool_value(manifest.get("branchInheritanceGateSourceAwareBranchContractReady")), "branch gate must prove source-aware refined stems before later unlock")
    add_equal(checks, "branch-inheritance-gate-source-aware-status", "ready-source-aware-branch-inheritance", manifest.get("branchInheritanceGateSourceAwareBranchContractStatus"), "branch gate source-aware contract")
    add_equal(checks, "branch-inheritance-gate-stem-ready-count", 3, int_value(manifest.get("branchInheritanceGateSourceAwareStemReadyCount")), "branch gate Charlie/Homer/clip-source stems")
    add_equal(checks, "branch-inheritance-gate-stem-resolved-count", 3, int_value(manifest.get("branchInheritanceGateSourceAwareStemResolvedCount")), "branch gate resolved stems")
    add_equal(checks, "branch-inheritance-gate-timing-ready", True, bool_value(manifest.get("branchInheritanceGateSourceAwareTimingContractReady")), "branch gate timing contract")
    add_equal(checks, "branch-inheritance-gate-timing-hard-stops", 0, int_value(manifest.get("branchInheritanceGateSourceAwareTimingContractHardStopCount")), "branch gate timing hard stops")
    add_equal(checks, "branch-inheritance-gate-post-approval-inherits", True, bool_value(manifest.get("branchInheritanceGatePostApprovalInheritsSourceAwareAudioTruth")), "branch gate post-approval inheritance")
    add_equal(checks, "branch-inheritance-gate-post-approval-status", "ready-source-aware-editable", manifest.get("branchInheritanceGatePostApprovalSourceAwareAudioContractStatus"), "branch gate post-approval source-aware status")
    add_equal(checks, "branch-inheritance-gate-master-only-forbidden", False, bool_value(manifest.get("branchInheritanceGatePostApprovalMasteredSpineOnlyEditingAllowed")), "branch gate must reject mastered-spine-only editing")
    add_equal(checks, "branch-render-audio-truth", "source-aware-refined-stems", manifest.get("branchRenderAudioTruth"), "manifest branch audio truth")
    add_equal(checks, "manifest-mastered-spine-only-forbidden", False, bool_value(manifest.get("masteredSpineOnlyEditingAllowed")), "manifest must forbid flat master as editable branch truth")
    add_equal(checks, "post-listen-final-episode-gate", "locked-until-audio-spine-approved", manifest.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus"), "downstream final episode gate")
    add_equal(checks, "post-listen-shorts-gate", "locked-until-audio-spine-approved", manifest.get("audioPostListenEpisodeRunwayShortsGateStatus"), "downstream shorts gate")
    add_equal(checks, "approved-branch-executor-blocked", "blocked-waiting-for-human-listen", manifest.get("approvedBranchRenderExecutorStatus"), "approved branch executor must remain blocked")
    add_false(checks, "approved-branch-executor-cannot-execute", manifest.get("approvedBranchRenderExecutorCanExecuteRealRenders"), "real branch renders forbidden before listen approval")
    add_false(checks, "approved-branch-commands-not-exposed", manifest.get("approvedBranchRenderCommandsExposed"), "real render commands not exposed before listen approval")
    add_equal(checks, "approved-branch-executor-audio-truth", "source-aware-refined-stems", manifest.get("approvedBranchRenderExecutorBranchRenderAudioTruth"), "approved branch executor must not plan flattened-master-only branch audio")
    add_equal(checks, "approved-branch-executor-will-use-refined-stems", True, bool_value(manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems")), "approved branch renderer will use Charlie/Homer/clip-source stems after approval")
    add_equal(checks, "approved-branch-executor-mastered-spine-only-prevented", True, bool_value(manifest.get("approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented")), "mastered spine is convenience, not editable branch truth")

    add_check(checks, "final-listen-packet-report-loads", bool(packet), "loadable JSON", str(baseline_dir / "AUDIO_FINAL_LISTEN_MISSION_PACKET.json"), "final mission packet")
    if packet:
        add_equal(checks, "final-listen-packet-status", "ready-for-final-human-listen-mission", packet.get("status"), "final mission packet")
        add_equal(checks, "final-listen-packet-missing-required", 0, len(packet.get("missingRequiredArtifacts") or []), "required artifacts")
        add_equal(checks, "final-listen-stem-manifest-included", True, bool_value(packet.get("sourceAwareStemManifestIncluded")), "packet includes source-aware stem evidence")
        add_check(checks, "final-listen-stem-resolved-count", int_value(packet.get("sourceAwareStemResolvedCount")) >= 3, ">=3", packet.get("sourceAwareStemResolvedCount"), "Charlie/Homer/clip-source stems")
        add_equal(checks, "final-listen-segment-map-included", True, bool_value(packet.get("segmentLoudnessMapIncluded")), "packet includes segment map")
        add_check(checks, "final-listen-segment-review-windows", int_value(packet.get("segmentLoudnessMapOutlierCount")) > 0, ">0", packet.get("segmentLoudnessMapOutlierCount"), "focused listen windows")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"final-listen-safety-{key}", packet.get(key), "packet must not mutate state")

    add_check(checks, "manifest-readback-smoke-loads", bool(smoke), "loadable JSON", str(baseline_dir / "AUDIO_MANIFEST_READBACK_CONSISTENCY_SMOKE.json"), "latest manifest readback smoke")
    if smoke:
        add_equal(checks, "manifest-readback-smoke-status", "passed", smoke.get("status"), "latest smoke status")
        add_equal(checks, "manifest-readback-smoke-passed", True, bool_value(smoke.get("passed")), "latest smoke boolean")
        add_equal(checks, "manifest-readback-smoke-failures", 0, int_value(smoke.get("failureCount")), "latest smoke failures")
        add_check(checks, "manifest-readback-smoke-coverage", int_value(smoke.get("checkCount")) >= 1000, ">=1000 checks", smoke.get("checkCount"), "broad manifest coverage")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"manifest-smoke-safety-{key}", smoke.get(key), "smoke must not mutate state")

    add_check(checks, "source-aware-stem-manifest-loads", bool(source_stems), "loadable JSON", str(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json"), "source-aware stems")
    if source_stems:
        add_equal(checks, "source-aware-stem-status", "source-aware-stems-ready-human-listen-gated", source_stems.get("status"), "stem manifest status")
        add_equal(checks, "source-aware-required-stems", 3, int_value(source_stems.get("requiredStemCount")), "required stems")
        add_equal(checks, "source-aware-resolved-stems", 3, int_value(source_stems.get("resolvedStemCount")), "resolved stems")
        add_equal(checks, "source-aware-ready-stems", 3, int_value(source_stems.get("readyStemCount")), "ready stems")
        add_equal(checks, "source-aware-warning-count", 0, int_value(source_stems.get("warningCount")), "stem warnings")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"source-aware-safety-{key}", source_stems.get(key), "stem manifest must not mutate state")

    add_check(checks, "source-aware-timing-contract-loads", bool(source_timing), "loadable JSON", str(baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json"), "source-aware timing/edit contract")
    if source_timing:
        add_equal(checks, "source-aware-timing-contract-status", "source-aware-timing-contract-ready-human-listen-gated", source_timing.get("status"), "timing contract status")
        add_equal(checks, "source-aware-timing-contract-ready", True, bool_value(source_timing.get("sourceAwareTimingReady")), "timing contract readiness")
        add_equal(checks, "source-aware-timing-contract-hard-stops", 0, int_value(source_timing.get("hardStopCount")), "timing contract hard stops")
        add_equal(checks, "source-aware-timing-contract-ready-roles", 3, int_value(source_timing.get("readyRoleCount")), "Charlie/Homer/clip-source source timing")
        add_equal(checks, "source-aware-timing-contract-full-length-stems", 3, int_value(source_timing.get("fullLengthStemCount")), "full-length sequence-aligned stems")
        add_check(checks, "source-aware-timing-contract-duration-delta", float(source_timing.get("maxDurationDeltaToMasterSeconds") or 999) <= float(source_timing.get("durationToleranceSeconds") or 0), f"<= {source_timing.get('durationToleranceSeconds')}s", source_timing.get("maxDurationDeltaToMasterSeconds"), "duration agreement with mastered review spine")
        add_check(checks, "source-aware-timing-contract-capabilities", int_value(source_timing.get("branchTimingCapabilityCount")) >= 5, ">=5", source_timing.get("branchTimingCapabilityCount"), "conversation spacing, clip weaving, reactions, J/L cuts, source repair")
        add_equal(checks, "source-aware-timing-contract-post-approval-inherits", True, bool_value(source_timing.get("postApprovalInheritsSourceAwareAudioTruth")), "future branches inherit source-aware timing truth")
        add_equal(checks, "source-aware-timing-contract-post-approval-status", "ready-source-aware-editable", source_timing.get("postApprovalSourceAwareAudioContractStatus"), "future branch source-aware status")
        add_equal(checks, "source-aware-timing-contract-master-only-forbidden", False, bool_value(source_timing.get("postApprovalMasteredSpineOnlyEditingAllowed")), "mastered-spine-only branch editing forbidden")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"source-aware-timing-contract-safety-{key}", source_timing.get(key), "timing contract must not mutate state")

    add_check(checks, "segment-loudness-map-loads", bool(segment_map), "loadable JSON", str(baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json"), "segment map")
    if segment_map:
        segment_outlier_count = int_value(segment_map.get("outlierCount"))
        if segment_outlier_count == 0 and isinstance(segment_map.get("outliers"), list):
            segment_outlier_count = len(segment_map["outliers"])
        segment_track_count = int_value(segment_map.get("trackCount"))
        if segment_track_count == 0 and isinstance(segment_map.get("tracks"), list):
            segment_track_count = len(segment_map["tracks"])
        add_equal(checks, "segment-map-status", "segment-audio-map-ready-with-review-windows-human-listen-gated", segment_map.get("status"), "segment map status")
        add_equal(checks, "segment-map-track-count", 4, segment_track_count, "master + stems")
        add_check(checks, "segment-map-review-windows", segment_outlier_count > 0, ">0", segment_outlier_count, "review windows")
        add_check(checks, "segment-map-window-coverage", segment_track_count > 0, ">0 tracks", segment_track_count, "window coverage via track rows")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"segment-map-safety-{key}", segment_map.get(key), "segment map must not mutate state")

    add_check(checks, "post-approval-render-rehearsal-loads", bool(post_approval), "loadable JSON", str(baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json"), "post-approval branch runway rehearsal")
    if post_approval:
        add_equal(checks, "post-approval-rehearsal-status", "post-approval-render-rehearsal-ready-blocked-as-expected", post_approval.get("status"), "real baseline remains locked before human approval")
        add_equal(checks, "post-approval-rehearsal-expected-blocked", True, bool_value(post_approval.get("expectedBlockedUntilHumanListen")), "real baseline expected to be blocked")
        add_equal(checks, "post-approval-rehearsal-real-dry-run-blocked", True, bool_value(post_approval.get("rendererDryRunBlocked")), "real renderer dry-run must stay blocked before approval")
        add_check(checks, "post-approval-rehearsal-real-branches", int_value(post_approval.get("branchCount")) >= 3, ">=3", post_approval.get("branchCount"), "planned branch count")
        add_equal(checks, "post-approval-rehearsal-source-aware-inherited", True, bool_value(post_approval.get("inheritsSourceAwareAudioTruth")), "branch renders must inherit source-aware stems")
        add_equal(checks, "post-approval-rehearsal-source-aware-status", "ready-source-aware-editable", post_approval.get("sourceAwareAudioContractStatus"), "source-aware audio contract")
        post_approval_roles = set(str(item) for item in (post_approval.get("sourceAwareAudioRoleIds") or []))
        add_check(checks, "post-approval-rehearsal-source-aware-roles", {"charlie", "homer", "clip-source"}.issubset(post_approval_roles), "charlie,homer,clip-source", sorted(post_approval_roles), "source-aware role coverage")
        add_equal(checks, "post-approval-rehearsal-master-only-forbidden", False, bool_value(post_approval.get("masteredSpineOnlyEditingAllowed")), "flat master alone is not editable truth")
        add_equal(checks, "post-approval-rehearsal-missing-inputs", 0, int_value(post_approval.get("missingInputCount")), "renderer input readiness")
        add_equal(checks, "post-approval-rehearsal-hard-stops", 0, int_value(post_approval.get("hardStopCount")), "rehearsal hard stops")
        add_equal(checks, "post-approval-approved-sandbox-passed", True, bool_value(post_approval.get("approvedStateSandboxPassed")), "approved-state sandbox")
        add_equal(checks, "post-approval-approved-sandbox-state-preserved", True, bool_value(post_approval.get("approvedStateSandboxRealApprovalStatePreserved")), "real v006 state preserved")
        add_equal(checks, "post-approval-approved-sandbox-renderer-status", "dry-run", post_approval.get("approvedStateSandboxRendererDryRunStatus"), "approved sandbox renderer")
        add_equal(checks, "post-approval-approved-sandbox-renderer-blocked", False, bool_value(post_approval.get("approvedStateSandboxRendererDryRunBlocked")), "approved sandbox should not be blocked")
        add_equal(checks, "post-approval-approved-sandbox-renderer-blockers", 0, int_value(post_approval.get("approvedStateSandboxRendererDryRunBlockerCount")), "approved sandbox renderer blockers")
        add_equal(checks, "post-approval-approved-sandbox-missing-inputs", 0, int_value(post_approval.get("approvedStateSandboxRendererMissingInputCount")), "approved sandbox missing inputs")
        add_check(checks, "post-approval-approved-sandbox-branches", int_value(post_approval.get("approvedStateSandboxRendererBranchCount")) >= 3, ">=3", post_approval.get("approvedStateSandboxRendererBranchCount"), "approved sandbox branch count")
        add_equal(checks, "post-approval-approved-sandbox-executor-status", "ready-dry-run", post_approval.get("approvedStateSandboxExecutorStatus"), "approved sandbox executor")
        add_equal(checks, "post-approval-approved-sandbox-can-execute", True, bool_value(post_approval.get("approvedStateSandboxExecutorCanExecuteRealRenders")), "approved sandbox executor can execute after approval")
        add_equal(checks, "post-approval-approved-sandbox-commands", True, bool_value(post_approval.get("approvedStateSandboxExecutorCommandsExposed")), "approved sandbox render commands exposed")
        add_equal(checks, "post-approval-approved-sandbox-executor-source-aware-ready", True, bool_value(post_approval.get("approvedStateSandboxExecutorSourceAwareRenderContractReady")), "approved sandbox executor source-aware contract")
        add_equal(checks, "post-approval-approved-sandbox-executor-source-aware-inherited", True, bool_value(post_approval.get("approvedStateSandboxExecutorInheritsSourceAwareAudioTruth")), "approved sandbox executor source-aware inheritance")
        add_equal(checks, "post-approval-approved-sandbox-executor-source-aware-status", "ready-source-aware-editable", post_approval.get("approvedStateSandboxExecutorSourceAwareAudioContractStatus"), "approved sandbox executor source-aware status")
        executor_roles = set(str(item) for item in (post_approval.get("approvedStateSandboxExecutorSourceAwareAudioRoleIds") or []))
        add_check(checks, "post-approval-approved-sandbox-executor-source-aware-roles", {"charlie", "homer", "clip-source"}.issubset(executor_roles), "charlie,homer,clip-source", sorted(executor_roles), "approved sandbox executor source-aware role coverage")
        add_equal(checks, "post-approval-approved-sandbox-executor-master-only-forbidden", False, bool_value(post_approval.get("approvedStateSandboxExecutorMasteredSpineOnlyEditingAllowed")), "approved sandbox executor must reject flat-master-only editing")
        for key in ("approvedStateSandboxExecutorRenderAttempted", "approvedStateSandboxExecutorUploadAttempted", "approvedStateSandboxExecutorPublicationAttempted", "approvedStateSandboxExecutorOriginalMediaMutated", "approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"post-approval-rehearsal-safety-{key}", post_approval.get(key), "post-approval rehearsal must not mutate real state")

    add_check(checks, "post-listen-router-loads", bool(post_listen_router), "loadable JSON", str(baseline_dir / "POST_LISTEN_OUTCOME_ROUTER.json"), "post-listen route guard")
    if post_listen_router:
        router_route = post_listen_router.get("route") if isinstance(post_listen_router.get("route"), dict) else {}
        add_equal(checks, "post-listen-router-status", "waiting-for-human-listen", router_route.get("routeStatus"), "real router must still wait for human listen")
        add_equal(checks, "post-listen-router-source-aware-required", True, bool_value(router_route.get("sourceAwareBranchGateRequired")), "router must require source-aware branch gate")
        add_equal(checks, "post-listen-router-source-aware-ready", True, bool_value(router_route.get("sourceAwareBranchGateReady")), "router must see source-aware branch contract proof")
        add_equal(checks, "post-listen-router-audio-truth", "source-aware-refined-stems", router_route.get("branchRenderAudioTruth"), "router branch render truth")
        add_equal(checks, "post-listen-router-master-only-forbidden", False, bool_value(router_route.get("masteredSpineOnlyEditingAllowed")), "router must not allow flat master as editable branch truth")
        add_equal(checks, "post-listen-router-stem-ready-count", 3, int_value(router_route.get("sourceAwareStemReadyCount")), "router stem readiness")
        add_equal(checks, "post-listen-router-stem-resolved-count", 3, int_value(router_route.get("sourceAwareStemResolvedCount")), "router resolved stems")
        add_equal(checks, "post-listen-router-timing-ready", True, bool_value(router_route.get("sourceAwareTimingContractReady")), "router timing contract")
        add_equal(checks, "post-listen-router-timing-hard-stops", 0, int_value(router_route.get("sourceAwareTimingHardStopCount")), "router timing hard stops")
        add_equal(checks, "post-listen-router-no-render-commands", False, bool_value(post_listen_router.get("realBranchRenderCommandsExposed")), "router must not expose branch render commands before human listen")
        for key in ("approvalStateChanged", "renderAttempted", "originalMediaMutated"):
            add_false(checks, f"post-listen-router-safety-{key}", post_listen_router.get(key), "router must not mutate state")

    add_check(checks, "branch-render-preflight-loads", bool(branch_preflight), "loadable JSON", str(baseline_dir / "BRANCH_RENDER_PREFLIGHT.json"), "branch render preflight")
    if branch_preflight:
        preflight_truth = branch_preflight.get("truth") if isinstance(branch_preflight.get("truth"), dict) else {}
        add_equal(checks, "branch-render-preflight-status", "blocked-before-branch-render", branch_preflight.get("status"), "real preflight must stay blocked before human listen approval")
        add_equal(checks, "branch-render-preflight-can-render", False, bool_value(branch_preflight.get("canRenderBranches")), "preflight cannot render branches before approval")
        add_equal(checks, "branch-render-preflight-commands-hidden", False, bool_value(branch_preflight.get("realBranchRenderCommandsExposed")), "real render command must stay hidden while blocked")
        add_equal(checks, "branch-render-preflight-source-aware-required", True, bool_value(branch_preflight.get("sourceAwareAudioTruthRequired")), "preflight requires source-aware audio truth")
        add_equal(checks, "branch-render-preflight-source-aware-ready", True, bool_value(branch_preflight.get("sourceAwareAudioTruthReady")), "preflight sees source-aware stem/timing contract")
        add_equal(checks, "branch-render-preflight-audio-truth", "source-aware-refined-stems", branch_preflight.get("branchRenderAudioTruth"), "preflight branch render truth")
        add_equal(checks, "branch-render-preflight-branch-audio-plan-status", "ready-source-aware-refined-stem-plan", branch_preflight.get("branchAudioPlanStatus"), "preflight branch audio plan")
        add_check(checks, "branch-render-preflight-branch-audio-plan-stems", int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")) >= 3, ">=3", branch_preflight.get("branchAudioPlanSelectedRefinedStemCount"), "preflight selected refined stems")
        add_equal(checks, "branch-render-preflight-branch-audio-plan-missing-roles", [], sorted(str(role) for role in (branch_preflight.get("branchAudioPlanMissingRoleIds") or [])), "preflight has all required source-aware roles")
        add_equal(checks, "branch-render-preflight-branch-audio-plan-missing-paths", 0, int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")), "preflight has no missing refined stem paths")
        add_equal(checks, "branch-render-preflight-will-use-refined-stems", True, bool_value(branch_preflight.get("sourceAwareBranchRenderWillUseRefinedStems")), "preflight will use refined stems after approval")
        add_equal(checks, "branch-render-preflight-stem-paths-proved", True, bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")), "preflight proves refined stem paths exist")
        add_equal(checks, "branch-render-preflight-master-only-forbidden", False, bool_value(branch_preflight.get("masteredSpineOnlyEditingAllowed")), "preflight must not allow flat master as editable branch truth")
        add_equal(checks, "branch-render-preflight-mastered-only-output", False, bool_value(branch_preflight.get("branchAudioRenderedFromMasteredSpineOnly")), "branch audio cannot render from flat master only")
        add_equal(checks, "branch-render-preflight-truth-commands-hidden", False, bool_value(preflight_truth.get("realBranchRenderCommandsExposed")), "preflight truth must hide real render commands while blocked")
        for key in ("approvalStateChanged", "branchStateChanged", "renderExecuted", "originalMediaMutated"):
            add_false(checks, f"branch-render-preflight-safety-{key}", preflight_truth.get(key), "preflight must not mutate state")

    add_check(checks, "post-listen-refresh-loads", bool(post_listen_refresh), "loadable JSON", str(baseline_dir / "POST_LISTEN_REFRESH.json"), "post-listen refresh bridge")
    if post_listen_refresh:
        add_equal(checks, "post-listen-refresh-status", "post-listen-refresh-waiting-for-human-listen", post_listen_refresh.get("status"), "refresh must keep waiting before human approval")
        add_equal(checks, "post-listen-refresh-steps", 7, int_value(post_listen_refresh.get("stepCount")), "refresh runs all post-listen branch/readiness steps")
        add_equal(checks, "post-listen-refresh-step-failures", 0, int_value(post_listen_refresh.get("stepFailureCount")), "refresh step failures")
        add_equal(checks, "post-listen-refresh-hard-stops", 0, int_value(post_listen_refresh.get("hardStopCount")), "refresh hard stops")
        add_equal(checks, "post-listen-refresh-audio-truth", "source-aware-refined-stems", post_listen_refresh.get("branchRenderAudioTruth"), "refresh branch audio truth")
        add_equal(checks, "post-listen-refresh-master-only-forbidden", False, bool_value(post_listen_refresh.get("masteredSpineOnlyEditingAllowed")), "refresh must forbid flat master as editable branch truth")
        add_equal(checks, "post-listen-refresh-preflight-plan-status", "ready-source-aware-refined-stem-plan", post_listen_refresh.get("branchPreflightBranchAudioPlanStatus"), "refresh preflight branch-audio plan")
        add_check(checks, "post-listen-refresh-preflight-plan-stems", int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanSelectedRefinedStemCount")) >= 3, ">=3", post_listen_refresh.get("branchPreflightBranchAudioPlanSelectedRefinedStemCount"), "refresh preflight selected refined stems")
        add_equal(checks, "post-listen-refresh-preflight-missing-roles", [], sorted(str(role) for role in (post_listen_refresh.get("branchPreflightBranchAudioPlanMissingRoleIds") or [])), "refresh preflight has all required roles")
        add_equal(checks, "post-listen-refresh-preflight-missing-paths", 0, int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanMissingStemPathCount")), "refresh preflight has no missing stem paths")
        add_equal(checks, "post-listen-refresh-preflight-stem-paths-proved", True, bool_value(post_listen_refresh.get("branchPreflightSourceAwareBranchRenderStemPathsProved")), "refresh preflight proves refined stem paths")
        add_equal(checks, "post-listen-refresh-executor-plan-status", "ready-source-aware-refined-stem-plan", post_listen_refresh.get("branchExecutorBranchAudioPlanStatus"), "refresh executor branch-audio plan")
        add_check(checks, "post-listen-refresh-executor-plan-stems", int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanSelectedRefinedStemCount")) >= 3, ">=3", post_listen_refresh.get("branchExecutorBranchAudioPlanSelectedRefinedStemCount"), "refresh executor selected refined stems")
        add_equal(checks, "post-listen-refresh-executor-missing-roles", [], sorted(str(role) for role in (post_listen_refresh.get("branchExecutorBranchAudioPlanMissingRoleIds") or [])), "refresh executor has all required roles")
        add_equal(checks, "post-listen-refresh-executor-missing-paths", 0, int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanMissingStemPathCount")), "refresh executor has no missing stem paths")
        add_equal(checks, "post-listen-refresh-executor-will-use-refined-stems", True, bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderWillUseRefinedStems")), "refresh executor will use refined stems after approval")
        add_equal(checks, "post-listen-refresh-executor-stem-paths-proved", True, bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderStemPathsProved")), "refresh executor proves refined stem paths")
        for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
            add_false(checks, f"post-listen-refresh-safety-{key}", post_listen_refresh.get(key), "post-listen refresh must not mutate state")

    for manifest_key in (
        "audioFinalListenMissionPacketApprovalStateChanged",
        "audioFinalListenMissionPacketBranchStateChanged",
        "audioFinalListenMissionPacketBranchRenderAttempted",
        "audioSourceAwareStemManifestApprovalStateChanged",
        "audioSourceAwareStemManifestBranchStateChanged",
        "audioSourceAwareStemManifestBranchRenderAttempted",
        "audioSegmentLoudnessMapApprovalStateChanged",
        "audioSegmentLoudnessMapBranchStateChanged",
        "audioSegmentLoudnessMapBranchRenderAttempted",
        "audioPostApprovalRenderRehearsalApprovalStateChanged",
        "audioPostApprovalRenderRehearsalBranchStateChanged",
        "audioPostApprovalRenderRehearsalRenderAttempted",
        "audioPostApprovalRenderRehearsalBranchRenderAttempted",
        "audioPostApprovalRenderRehearsalUploadAttempted",
        "audioPostApprovalRenderRehearsalPublicationAttempted",
        "audioPostApprovalRenderRehearsalOriginalMediaMutated",
        "audioPostApprovalRenderRehearsalApprovedSandboxExecutorRenderAttempted",
        "audioPostApprovalRenderRehearsalApprovedSandboxExecutorUploadAttempted",
        "audioPostApprovalRenderRehearsalApprovedSandboxExecutorPublicationAttempted",
        "audioPostApprovalRenderRehearsalApprovedSandboxExecutorOriginalMediaMutated",
    ):
        add_false(checks, f"manifest-safety-{manifest_key}", manifest.get(manifest_key), "manifest safety readback")

    # Readback for registered output paths without requiring slow regeneration.
    for key in (
        "latestAudioFinalListenMissionPacketHtml",
        "latestAudioFinalListenMissionPacket",
        "latestAudioSourceAwareStemManifestHtml",
        "latestAudioSourceAwareStemManifest",
        "latestAudioSourceAwareTimingContractHtml",
        "latestAudioSourceAwareTimingContract",
        "latestAudioSegmentLoudnessMapHtml",
        "latestAudioSegmentLoudnessMap",
        "latestAudioManifestReadbackConsistencySmoke",
        "latestAudioManifestReadbackConsistencySmokeHtml",
        "latestAudioPostApprovalRenderRehearsal",
        "latestAudioPostApprovalRenderRehearsalMarkdown",
        "latestAudioPostApprovalRenderRehearsalHtml",
        "latestAudioPostApprovalRenderRehearsalOpenCommand",
        "latestAudioPostListenOutcomeRouter",
        "latestAudioPostListenOutcomeRouterHtml",
        "latestAudioPostListenOutcomeRouterStableJson",
        "latestAudioPostListenOutcomeRouterStableHtml",
        "latestAudioPostListenOutcomeRouterOpenCommand",
        "latestAudioPostListenRefresh",
        "latestAudioPostListenRefreshHtml",
        "latestAudioPostListenRefreshOpenCommand",
    ):
        add_file(checks, f"registered-output-{key}", output_path(outputs.get(key)), "manifest output registry")

    hard_stops = [check for check in checks if not check.passed and check.severity == "hard-stop"]
    warnings = [check for check in checks if not check.passed and check.severity != "hard-stop"]
    status = "fast-readback-passed-human-listen-still-required" if not hard_stops else "fast-readback-needs-attention"

    return {
        "schema": "quipsly.audio-workbench.fast-readback-check.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_at,
        "status": status,
        "passed": not hard_stops,
        "checkCount": len(checks),
        "hardStopCount": len(hard_stops),
        "warningCount": len(warnings),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool_value(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "branchInheritanceGateStatus": manifest.get("branchInheritanceGateStatus"),
        "finalEpisodeGateStatus": manifest.get("audioPostListenEpisodeRunwayFinalEpisodeGateStatus"),
        "shortsGateStatus": manifest.get("audioPostListenEpisodeRunwayShortsGateStatus"),
        "finalListenMissionStatus": packet.get("status") if packet else None,
        "sourceAwareStemStatus": source_stems.get("status") if source_stems else None,
        "sourceAwareStemResolvedCount": int_value(source_stems.get("resolvedStemCount")) if source_stems else 0,
        "sourceAwareTimingContractStatus": source_timing.get("status") if source_timing else None,
        "sourceAwareTimingContractReady": bool_value(source_timing.get("sourceAwareTimingReady")) if source_timing else False,
        "sourceAwareTimingContractReadyRoleCount": int_value(source_timing.get("readyRoleCount")) if source_timing else 0,
        "sourceAwareTimingContractFullLengthStemCount": int_value(source_timing.get("fullLengthStemCount")) if source_timing else 0,
        "sourceAwareTimingContractHardStopCount": int_value(source_timing.get("hardStopCount")) if source_timing else 0,
        "sourceAwareTimingContractMaxDurationDeltaToMasterSeconds": source_timing.get("maxDurationDeltaToMasterSeconds") if source_timing else None,
        "segmentLoudnessMapStatus": segment_map.get("status") if segment_map else None,
        "segmentLoudnessReviewWindowCount": (
            int_value(segment_map.get("outlierCount"))
            if segment_map and segment_map.get("outlierCount") not in (None, "")
            else (len(segment_map.get("outliers") or []) if segment_map else 0)
        ),
        "postApprovalRenderRehearsalStatus": post_approval.get("status") if post_approval else None,
        "postApprovalRenderRehearsalBranchCount": int_value(post_approval.get("branchCount")) if post_approval else 0,
        "postApprovalRenderRehearsalMissingInputCount": int_value(post_approval.get("missingInputCount")) if post_approval else 0,
        "postApprovalRenderRehearsalHardStopCount": int_value(post_approval.get("hardStopCount")) if post_approval else 0,
        "postApprovalRenderRehearsalInheritsSourceAwareAudioTruth": bool_value(post_approval.get("inheritsSourceAwareAudioTruth")) if post_approval else False,
        "postApprovalRenderRehearsalSourceAwareAudioContractStatus": post_approval.get("sourceAwareAudioContractStatus") if post_approval else None,
        "postApprovalRenderRehearsalSourceAwareAudioRoleIds": post_approval.get("sourceAwareAudioRoleIds") if post_approval else [],
        "postApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed": bool_value(post_approval.get("masteredSpineOnlyEditingAllowed")) if post_approval else True,
        "postApprovalApprovedSandboxPassed": bool_value(post_approval.get("approvedStateSandboxPassed")) if post_approval else False,
        "postApprovalApprovedSandboxBranchCount": int_value(post_approval.get("approvedStateSandboxRendererBranchCount")) if post_approval else 0,
        "postApprovalApprovedSandboxExecutorStatus": post_approval.get("approvedStateSandboxExecutorStatus") if post_approval else None,
        "postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady": bool_value(post_approval.get("approvedStateSandboxExecutorSourceAwareRenderContractReady")) if post_approval else False,
        "postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth": bool_value(post_approval.get("approvedStateSandboxExecutorInheritsSourceAwareAudioTruth")) if post_approval else False,
        "postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus": post_approval.get("approvedStateSandboxExecutorSourceAwareAudioContractStatus") if post_approval else None,
        "postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds": post_approval.get("approvedStateSandboxExecutorSourceAwareAudioRoleIds") if post_approval else [],
        "postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed": bool_value(post_approval.get("approvedStateSandboxExecutorMasteredSpineOnlyEditingAllowed")) if post_approval else True,
        "postListenOutcomeRouterStatus": (post_listen_router.get("route") or {}).get("routeStatus") if post_listen_router else None,
        "postListenOutcomeRouterSourceAwareBranchGateReady": bool_value((post_listen_router.get("route") or {}).get("sourceAwareBranchGateReady")) if post_listen_router else False,
        "postListenOutcomeRouterBranchRenderAudioTruth": (post_listen_router.get("route") or {}).get("branchRenderAudioTruth") if post_listen_router else None,
        "postListenOutcomeRouterMasteredSpineOnlyEditingAllowed": bool_value((post_listen_router.get("route") or {}).get("masteredSpineOnlyEditingAllowed")) if post_listen_router else True,
        "postListenOutcomeRouterRealBranchRenderCommandsExposed": bool_value(post_listen_router.get("realBranchRenderCommandsExposed")) if post_listen_router else False,
        "branchRenderPreflightStatus": branch_preflight.get("status") if branch_preflight else None,
        "branchRenderPreflightCanRenderBranches": bool_value(branch_preflight.get("canRenderBranches")) if branch_preflight else False,
        "branchRenderPreflightSourceAwareAudioTruthReady": bool_value(branch_preflight.get("sourceAwareAudioTruthReady")) if branch_preflight else False,
        "branchRenderPreflightBranchRenderAudioTruth": branch_preflight.get("branchRenderAudioTruth") if branch_preflight else None,
        "branchRenderPreflightBranchAudioPlanStatus": branch_preflight.get("branchAudioPlanStatus") if branch_preflight else None,
        "branchRenderPreflightBranchAudioPlanSelectedRefinedStemCount": int_value(branch_preflight.get("branchAudioPlanSelectedRefinedStemCount")) if branch_preflight else 0,
        "branchRenderPreflightBranchAudioPlanMissingRoleIds": branch_preflight.get("branchAudioPlanMissingRoleIds") if branch_preflight else [],
        "branchRenderPreflightBranchAudioPlanMissingStemPathCount": int_value(branch_preflight.get("branchAudioPlanMissingStemPathCount")) if branch_preflight else 0,
        "branchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems": bool_value(branch_preflight.get("sourceAwareBranchRenderWillUseRefinedStems")) if branch_preflight else False,
        "branchRenderPreflightSourceAwareBranchRenderStemPathsProved": bool_value(branch_preflight.get("sourceAwareBranchRenderStemPathsProved")) if branch_preflight else False,
        "branchRenderPreflightMasteredSpineOnlyEditingAllowed": bool_value(branch_preflight.get("masteredSpineOnlyEditingAllowed")) if branch_preflight else True,
        "branchRenderPreflightRealBranchRenderCommandsExposed": bool_value(branch_preflight.get("realBranchRenderCommandsExposed")) if branch_preflight else False,
        "postListenRefreshStatus": post_listen_refresh.get("status") if post_listen_refresh else None,
        "postListenRefreshStepCount": int_value(post_listen_refresh.get("stepCount")) if post_listen_refresh else 0,
        "postListenRefreshStepFailureCount": int_value(post_listen_refresh.get("stepFailureCount")) if post_listen_refresh else 0,
        "postListenRefreshHardStopCount": int_value(post_listen_refresh.get("hardStopCount")) if post_listen_refresh else 0,
        "postListenRefreshBranchRenderAudioTruth": post_listen_refresh.get("branchRenderAudioTruth") if post_listen_refresh else None,
        "postListenRefreshMasteredSpineOnlyEditingAllowed": bool_value(post_listen_refresh.get("masteredSpineOnlyEditingAllowed")) if post_listen_refresh else True,
        "postListenRefreshBranchPreflightBranchAudioPlanStatus": post_listen_refresh.get("branchPreflightBranchAudioPlanStatus") if post_listen_refresh else None,
        "postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount": int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanSelectedRefinedStemCount")) if post_listen_refresh else 0,
        "postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds": post_listen_refresh.get("branchPreflightBranchAudioPlanMissingRoleIds") if post_listen_refresh else [],
        "postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount": int_value(post_listen_refresh.get("branchPreflightBranchAudioPlanMissingStemPathCount")) if post_listen_refresh else 0,
        "postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved": bool_value(post_listen_refresh.get("branchPreflightSourceAwareBranchRenderStemPathsProved")) if post_listen_refresh else False,
        "postListenRefreshBranchExecutorBranchAudioPlanStatus": post_listen_refresh.get("branchExecutorBranchAudioPlanStatus") if post_listen_refresh else None,
        "postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount": int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanSelectedRefinedStemCount")) if post_listen_refresh else 0,
        "postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds": post_listen_refresh.get("branchExecutorBranchAudioPlanMissingRoleIds") if post_listen_refresh else [],
        "postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount": int_value(post_listen_refresh.get("branchExecutorBranchAudioPlanMissingStemPathCount")) if post_listen_refresh else 0,
        "postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems": bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderWillUseRefinedStems")) if post_listen_refresh else False,
        "postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved": bool_value(post_listen_refresh.get("branchExecutorSourceAwareBranchRenderStemPathsProved")) if post_listen_refresh else False,
        "approvedBranchRenderExecutorBranchRenderAudioTruth": manifest.get("approvedBranchRenderExecutorBranchRenderAudioTruth"),
        "approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems": bool_value(manifest.get("approvedBranchRenderExecutorSourceAwareBranchRenderWillUseRefinedStems")),
        "approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented": bool_value(manifest.get("approvedBranchRenderExecutorMasteredSpineOnlyBranchRenderPrevented")),
        "manifestReadbackSmokeStatus": smoke.get("status") if smoke else None,
        "manifestReadbackSmokeFailureCount": int_value(smoke.get("failureCount")) if smoke else 0,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafeAction": (
            "Fast readback passed. Charlie should listen to the v006 spine through the Desktop launcher or final mission packet; branch renders remain locked until guarded human-listen approval is recorded."
            if not hard_stops
            else "Fast readback found hard stops. Fix the named missing/stale review package evidence before recording approval or rendering downstream branches."
        ),
        "failedChecks": [asdict(check) for check in checks if not check.passed],
        "checks": [asdict(check) for check in checks],
    }


def write_open_command(path: Path, html_path: Path) -> None:
    path.write_text(
        "#!/bin/zsh\n"
        "set -e\n"
        f"/usr/bin/open {shell_quote(str(html_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def update_manifest(manifest_path: Path, report: dict[str, Any], paths: dict[str, str]) -> None:
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioFastReadbackCheck"] = {"path": paths["json"], "jsonPath": paths["json"]}
    outputs["latestAudioFastReadbackCheckMarkdown"] = paths["markdown"]
    outputs["latestAudioFastReadbackCheckHtml"] = paths["html"]
    outputs["latestAudioFastReadbackCheckOpenCommand"] = paths["openCommand"]
    manifest.update(
        {
            "audioFastReadbackCheckLatestStatus": report["status"],
            "audioFastReadbackCheckPassed": report["passed"],
            "audioFastReadbackCheckCheckCount": report["checkCount"],
            "audioFastReadbackCheckHardStopCount": report["hardStopCount"],
            "audioFastReadbackCheckWarningCount": report["warningCount"],
            "audioFastReadbackCheckApprovalStatus": report["approvalStatus"],
            "audioFastReadbackCheckPackageReadyForHumanListen": report["packageReadyForHumanListen"],
            "audioFastReadbackCheckBranchInheritanceReady": report["branchInheritanceReady"],
            "audioFastReadbackCheckBranchRenderReady": report["branchRenderReady"],
            "audioFastReadbackCheckFinalEpisodeGateStatus": report["finalEpisodeGateStatus"],
            "audioFastReadbackCheckShortsGateStatus": report["shortsGateStatus"],
            "audioFastReadbackCheckSourceAwareStemResolvedCount": report["sourceAwareStemResolvedCount"],
            "audioFastReadbackCheckSourceAwareTimingContractStatus": report["sourceAwareTimingContractStatus"],
            "audioFastReadbackCheckSourceAwareTimingContractReady": report["sourceAwareTimingContractReady"],
            "audioFastReadbackCheckSourceAwareTimingContractReadyRoleCount": report["sourceAwareTimingContractReadyRoleCount"],
            "audioFastReadbackCheckSourceAwareTimingContractFullLengthStemCount": report["sourceAwareTimingContractFullLengthStemCount"],
            "audioFastReadbackCheckSourceAwareTimingContractHardStopCount": report["sourceAwareTimingContractHardStopCount"],
            "audioFastReadbackCheckSourceAwareTimingContractMaxDurationDeltaToMasterSeconds": report["sourceAwareTimingContractMaxDurationDeltaToMasterSeconds"],
            "audioFastReadbackCheckSegmentReviewWindowCount": report["segmentLoudnessReviewWindowCount"],
            "audioFastReadbackCheckPostApprovalRenderRehearsalStatus": report["postApprovalRenderRehearsalStatus"],
            "audioFastReadbackCheckPostApprovalRenderRehearsalBranchCount": report["postApprovalRenderRehearsalBranchCount"],
            "audioFastReadbackCheckPostApprovalRenderRehearsalMissingInputCount": report["postApprovalRenderRehearsalMissingInputCount"],
            "audioFastReadbackCheckPostApprovalRenderRehearsalHardStopCount": report["postApprovalRenderRehearsalHardStopCount"],
            "audioFastReadbackCheckPostApprovalInheritsSourceAwareAudioTruth": report["postApprovalRenderRehearsalInheritsSourceAwareAudioTruth"],
            "audioFastReadbackCheckPostApprovalSourceAwareAudioContractStatus": report["postApprovalRenderRehearsalSourceAwareAudioContractStatus"],
            "audioFastReadbackCheckPostApprovalSourceAwareAudioRoleIds": report["postApprovalRenderRehearsalSourceAwareAudioRoleIds"],
            "audioFastReadbackCheckPostApprovalMasteredSpineOnlyEditingAllowed": report["postApprovalRenderRehearsalMasteredSpineOnlyEditingAllowed"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxPassed": report["postApprovalApprovedSandboxPassed"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxBranchCount": report["postApprovalApprovedSandboxBranchCount"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorStatus": report["postApprovalApprovedSandboxExecutorStatus"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareRenderContractReady": report["postApprovalApprovedSandboxExecutorSourceAwareRenderContractReady"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth": report["postApprovalApprovedSandboxExecutorInheritsSourceAwareAudioTruth"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus": report["postApprovalApprovedSandboxExecutorSourceAwareAudioContractStatus"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds": report["postApprovalApprovedSandboxExecutorSourceAwareAudioRoleIds"],
            "audioFastReadbackCheckPostApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed": report["postApprovalApprovedSandboxExecutorMasteredSpineOnlyEditingAllowed"],
            "audioFastReadbackCheckPostListenOutcomeRouterStatus": report["postListenOutcomeRouterStatus"],
            "audioFastReadbackCheckPostListenOutcomeRouterSourceAwareBranchGateReady": report["postListenOutcomeRouterSourceAwareBranchGateReady"],
            "audioFastReadbackCheckPostListenOutcomeRouterBranchRenderAudioTruth": report["postListenOutcomeRouterBranchRenderAudioTruth"],
            "audioFastReadbackCheckPostListenOutcomeRouterMasteredSpineOnlyEditingAllowed": report["postListenOutcomeRouterMasteredSpineOnlyEditingAllowed"],
            "audioFastReadbackCheckPostListenOutcomeRouterRealBranchRenderCommandsExposed": report["postListenOutcomeRouterRealBranchRenderCommandsExposed"],
            "audioFastReadbackCheckBranchRenderPreflightStatus": report["branchRenderPreflightStatus"],
            "audioFastReadbackCheckBranchRenderPreflightCanRenderBranches": report["branchRenderPreflightCanRenderBranches"],
            "audioFastReadbackCheckBranchRenderPreflightSourceAwareAudioTruthReady": report["branchRenderPreflightSourceAwareAudioTruthReady"],
            "audioFastReadbackCheckBranchRenderPreflightBranchRenderAudioTruth": report["branchRenderPreflightBranchRenderAudioTruth"],
            "audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanStatus": report["branchRenderPreflightBranchAudioPlanStatus"],
            "audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanSelectedRefinedStemCount": report["branchRenderPreflightBranchAudioPlanSelectedRefinedStemCount"],
            "audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanMissingRoleIds": report["branchRenderPreflightBranchAudioPlanMissingRoleIds"],
            "audioFastReadbackCheckBranchRenderPreflightBranchAudioPlanMissingStemPathCount": report["branchRenderPreflightBranchAudioPlanMissingStemPathCount"],
            "audioFastReadbackCheckBranchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems": report["branchRenderPreflightSourceAwareBranchRenderWillUseRefinedStems"],
            "audioFastReadbackCheckBranchRenderPreflightSourceAwareBranchRenderStemPathsProved": report["branchRenderPreflightSourceAwareBranchRenderStemPathsProved"],
            "audioFastReadbackCheckBranchRenderPreflightMasteredSpineOnlyEditingAllowed": report["branchRenderPreflightMasteredSpineOnlyEditingAllowed"],
            "audioFastReadbackCheckBranchRenderPreflightRealBranchRenderCommandsExposed": report["branchRenderPreflightRealBranchRenderCommandsExposed"],
            "audioFastReadbackCheckPostListenRefreshStatus": report["postListenRefreshStatus"],
            "audioFastReadbackCheckPostListenRefreshStepCount": report["postListenRefreshStepCount"],
            "audioFastReadbackCheckPostListenRefreshStepFailureCount": report["postListenRefreshStepFailureCount"],
            "audioFastReadbackCheckPostListenRefreshHardStopCount": report["postListenRefreshHardStopCount"],
            "audioFastReadbackCheckPostListenRefreshBranchRenderAudioTruth": report["postListenRefreshBranchRenderAudioTruth"],
            "audioFastReadbackCheckPostListenRefreshMasteredSpineOnlyEditingAllowed": report["postListenRefreshMasteredSpineOnlyEditingAllowed"],
            "audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanStatus": report["postListenRefreshBranchPreflightBranchAudioPlanStatus"],
            "audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount": report["postListenRefreshBranchPreflightBranchAudioPlanSelectedRefinedStemCount"],
            "audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds": report["postListenRefreshBranchPreflightBranchAudioPlanMissingRoleIds"],
            "audioFastReadbackCheckPostListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount": report["postListenRefreshBranchPreflightBranchAudioPlanMissingStemPathCount"],
            "audioFastReadbackCheckPostListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved": report["postListenRefreshBranchPreflightSourceAwareBranchRenderStemPathsProved"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanStatus": report["postListenRefreshBranchExecutorBranchAudioPlanStatus"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount": report["postListenRefreshBranchExecutorBranchAudioPlanSelectedRefinedStemCount"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds": report["postListenRefreshBranchExecutorBranchAudioPlanMissingRoleIds"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount": report["postListenRefreshBranchExecutorBranchAudioPlanMissingStemPathCount"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems": report["postListenRefreshBranchExecutorSourceAwareBranchRenderWillUseRefinedStems"],
            "audioFastReadbackCheckPostListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved": report["postListenRefreshBranchExecutorSourceAwareBranchRenderStemPathsProved"],
            "audioFastReadbackCheckApprovalStateChanged": False,
            "audioFastReadbackCheckBranchStateChanged": False,
            "audioFastReadbackCheckRenderAttempted": False,
            "audioFastReadbackCheckUploadAttempted": False,
            "audioFastReadbackCheckPublicationAttempted": False,
            "audioFastReadbackCheckOriginalMediaMutated": False,
        }
    )
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    generated_at = datetime.now(timezone.utc).isoformat()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    baseline_id = str(manifest.get("baselineId") or manifest.get("id") or baseline_dir.name)
    slug = safe_slug(baseline_id)

    report = build_report(baseline_dir, generated_at)
    stable_json = baseline_dir / "AUDIO_FAST_READBACK_CHECK.json"
    stable_md = baseline_dir / "AUDIO_FAST_READBACK_CHECK.md"
    stable_html = baseline_dir / "AUDIO_FAST_READBACK_CHECK.html"
    stable_open = baseline_dir / "OPEN_AUDIO_FAST_READBACK_CHECK.command"
    version_dir = baseline_dir / f"audio-fast-readback-check-{slug}-{stamp}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "fast-readback-check.json"
    version_md = version_dir / "fast-readback-check.md"
    version_html = version_dir / "fast-readback-check.html"
    version_open = version_dir / "open-fast-readback-check.command"

    markdown = render_markdown(report)
    html_doc = render_html(report)
    for path in (stable_json, version_json):
        write_json(path, report)
    for path in (stable_md, version_md):
        path.write_text(markdown, encoding="utf-8")
    for path in (stable_html, version_html):
        path.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html)
    write_open_command(version_open, version_html)

    paths = {
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "versionedJson": str(version_json),
        "versionedMarkdown": str(version_md),
        "versionedHtml": str(version_html),
        "versionedOpenCommand": str(version_open),
    }
    report.update(
        {
            "path": str(stable_json),
            "jsonPath": str(stable_json),
            "markdownPath": str(stable_md),
            "htmlPath": str(stable_html),
            "openCommand": str(stable_open),
            "versionedPath": str(version_json),
            "versionedJsonPath": str(version_json),
            "versionedMarkdownPath": str(version_md),
            "versionedHtmlPath": str(version_html),
            "versionedOpenCommand": str(version_open),
        }
    )
    write_json(stable_json, report)
    write_json(version_json, report)
    update_manifest(manifest_path, report, paths)
    print(json.dumps({k: report[k] for k in ("status", "passed", "checkCount", "hardStopCount", "warningCount", "htmlPath", "openCommand")}, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
