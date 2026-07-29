#!/usr/bin/env python3
"""Create the Episode 4 source-aware timing/edit contract.

This artifact answers the practical editor question: can the approved audio
truth still support video-aware timing edits, conversation spacing, clip
weaving, J/L cuts, and source-specific repair?

It reads existing control-plane artifacts and writes evidence. It does not
approve audio, unlock branch inheritance, render media, upload, publish, or
mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)

REQUIRED_ROLES = ["charlie", "homer", "clip-source"]
TIMING_TOLERANCE_SECONDS = 0.25


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
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def bool_value(value: Any) -> bool:
    return bool(value)


def float_value(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_json_if_present(path: Path) -> dict[str, Any]:
    if not path.exists() or path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def role_duration(role: dict[str, Any], key: str) -> float | None:
    stem = role.get(key) if isinstance(role.get(key), dict) else {}
    return float_value(stem.get("durationSeconds"))


def role_path(role: dict[str, Any], key: str) -> str | None:
    stem = role.get(key) if isinstance(role.get(key), dict) else {}
    path = stem.get("path")
    return str(path) if path else None


def path_exists(path_value: str | None) -> bool:
    return bool(path_value and Path(path_value).exists())


def build_role_contract(role: dict[str, Any], master_duration: float | None, expected_duration: float | None) -> dict[str, Any]:
    role_id = str(role.get("roleId") or "")
    selected_duration = role_duration(role, "selectedRefinedStem")
    aligned_duration = role_duration(role, "alignedSourceStem")
    selected_path = role_path(role, "selectedRefinedStem")
    aligned_path = role_path(role, "alignedSourceStem")
    delta_to_master = float_value(role.get("durationDeltaToMasterSeconds"))
    if delta_to_master is None and master_duration is not None and selected_duration is not None:
        delta_to_master = round(abs(selected_duration - master_duration), 3)
    delta_to_sequence = None
    if expected_duration is not None and selected_duration is not None:
        delta_to_sequence = round(abs(selected_duration - expected_duration), 3)

    full_length = (
        role.get("status") == "ready"
        and path_exists(selected_path)
        and path_exists(aligned_path)
        and delta_to_master is not None
        and delta_to_master <= TIMING_TOLERANCE_SECONDS
    )
    warnings: list[str] = []
    if role.get("status") != "ready":
        warnings.append("Role is not marked ready in source-aware stem manifest.")
    if not path_exists(selected_path):
        warnings.append("Selected refined stem is missing.")
    if not path_exists(aligned_path):
        warnings.append("Aligned source stem is missing.")
    if delta_to_master is None:
        warnings.append("Could not compare selected refined stem duration to mastered spine.")
    elif delta_to_master > TIMING_TOLERANCE_SECONDS:
        warnings.append(f"Selected refined stem differs from mastered spine by {delta_to_master}s.")

    return {
        "roleId": role_id,
        "label": role.get("label"),
        "speaker": role.get("speaker"),
        "status": "ready-for-source-timed-editing" if full_length else "needs-attention",
        "selectedRefinedStemPath": selected_path,
        "alignedSourceStemPath": aligned_path,
        "selectedRefinedStemExists": path_exists(selected_path),
        "alignedSourceStemExists": path_exists(aligned_path),
        "selectedDurationSeconds": selected_duration,
        "alignedDurationSeconds": aligned_duration,
        "durationDeltaToMasterSeconds": delta_to_master,
        "durationDeltaToSequenceSeconds": delta_to_sequence,
        "startsAtSequenceSeconds": 0.0,
        "fullLengthSequenceAligned": full_length,
        "sequenceClockPolicy": role.get("sequenceClockPolicy"),
        "allowedBranchOperations": [
            "mute/duck source over ranges as metadata",
            "keyframe levels and source emphasis without trimming source timing",
            "shift edit-decision boundaries above the full-length stem",
            "route scoped repair to this role without altering other source roles",
        ],
        "forbiddenBranchOperations": [
            "destructively trimming this stem to match an edit branch",
            "using the mastered spine as the only editable timing source",
            "resyncing this role independently without writing a new timing contract",
        ],
        "warningCount": len(warnings),
        "warnings": warnings,
    }


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest = read_json(baseline_dir / "manifest.json")
    stem_manifest = load_json_if_present(baseline_dir / "AUDIO_SOURCE_AWARE_STEM_MANIFEST.json")
    segment_map = load_json_if_present(baseline_dir / "AUDIO_SEGMENT_LOUDNESS_MAP.json")
    post_approval = load_json_if_present(baseline_dir / "EPISODE_4_POST_APPROVAL_RENDER_REHEARSAL.json")
    generated_at = iso_now()
    baseline_id = str(manifest.get("baselineId") or manifest.get("id") or baseline_dir.name)

    sequence_clock = stem_manifest.get("sequenceClock") if isinstance(stem_manifest.get("sequenceClock"), dict) else {}
    mix_recipe = stem_manifest.get("mixRecipe") if isinstance(stem_manifest.get("mixRecipe"), dict) else {}
    master_wav = mix_recipe.get("masterWav") if isinstance(mix_recipe.get("masterWav"), dict) else {}
    master_duration = float_value(master_wav.get("durationSeconds"))
    expected_duration = float_value(sequence_clock.get("expectedDurationSeconds")) or master_duration
    roles = stem_manifest.get("roles") if isinstance(stem_manifest.get("roles"), list) else []
    role_contracts = [build_role_contract(role, master_duration, expected_duration) for role in roles]
    role_ids = [str(role.get("roleId")) for role in role_contracts if role.get("roleId")]
    missing_roles = [role for role in REQUIRED_ROLES if role not in set(role_ids)]
    ready_roles = [role for role in role_contracts if role.get("fullLengthSequenceAligned")]
    role_warnings = [warning for role in role_contracts for warning in role.get("warnings", [])]

    branch_timing_capabilities = [
        {
            "id": "conversation-spacing",
            "label": "Conversation spacing",
            "contract": "Move SHOW/SKIP/edit-decision boundaries on the shared sequence clock while stems remain full length.",
        },
        {
            "id": "clip-weaving",
            "label": "Clip weaving",
            "contract": "Use clip/source stem timing plus Charlie/Homer ducking metadata instead of baking the watched clip into the master only.",
        },
        {
            "id": "reaction-cuts",
            "label": "Reaction cuts",
            "contract": "Video can cut to reactions while the source-aware dialogue stems continue on the same clock.",
        },
        {
            "id": "j-l-cuts",
            "label": "J/L cuts",
            "contract": "Audio lead/lag is represented as branch metadata above aligned stems, not destructive source offsets.",
        },
        {
            "id": "source-specific-repair",
            "label": "Source-specific repair",
            "contract": "A problem in Charlie, Homer, or clip audio routes to that role without flattening or rewriting the other roles.",
        },
    ]

    hard_stops: list[str] = []
    if stem_manifest.get("status") != "source-aware-stems-ready-human-listen-gated":
        hard_stops.append("Source-aware stem manifest is not ready.")
    if missing_roles:
        hard_stops.append(f"Missing required source-aware roles: {', '.join(missing_roles)}.")
    if len(ready_roles) < len(REQUIRED_ROLES):
        hard_stops.append("Not every required role has a full-length sequence-aligned refined stem.")
    if not bool_value(post_approval.get("inheritsSourceAwareAudioTruth")):
        hard_stops.append("Post-approval branch rehearsal does not inherit source-aware audio truth.")
    if post_approval.get("sourceAwareAudioContractStatus") != "ready-source-aware-editable":
        hard_stops.append("Post-approval branch rehearsal does not report ready-source-aware-editable.")
    if bool_value(post_approval.get("masteredSpineOnlyEditingAllowed")):
        hard_stops.append("Post-approval branch rehearsal allows mastered-spine-only editing.")

    max_delta = 0.0
    deltas = [float_value(role.get("durationDeltaToMasterSeconds")) for role in role_contracts]
    numeric_deltas = [delta for delta in deltas if delta is not None]
    if numeric_deltas:
        max_delta = round(max(numeric_deltas), 3)

    status = (
        "source-aware-timing-contract-ready-human-listen-gated"
        if not hard_stops
        else "source-aware-timing-contract-needs-attention-human-listen-gated"
    )
    ready = not hard_stops
    return {
        "schema": "quipsly.audio-workbench.source-aware-timing-contract.v1",
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "generatedAt": generated_at,
        "status": status,
        "sourceAwareTimingReady": ready,
        "humanListenStillRequired": True,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool_value(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool_value(manifest.get("branchRenderReady")),
        "sequenceClock": {
            "name": sequence_clock.get("clock") or "Episode 4 conformed production sequence time",
            "startsAtSeconds": float_value(sequence_clock.get("startsAtSeconds")) or 0.0,
            "expectedDurationSeconds": expected_duration,
            "rule": sequence_clock.get("rule")
            or "All source-aware stems remain full-length and aligned; edit decisions sit above them as metadata.",
        },
        "masterDurationSeconds": master_duration,
        "durationToleranceSeconds": TIMING_TOLERANCE_SECONDS,
        "maxDurationDeltaToMasterSeconds": max_delta,
        "requiredRoleIds": REQUIRED_ROLES,
        "roleIds": role_ids,
        "missingRoleIds": missing_roles,
        "requiredRoleCount": len(REQUIRED_ROLES),
        "readyRoleCount": len(ready_roles),
        "fullLengthStemCount": len(ready_roles),
        "roleWarningCount": len(role_warnings),
        "roleContracts": role_contracts,
        "branchTimingCapabilityCount": len(branch_timing_capabilities),
        "branchTimingCapabilities": branch_timing_capabilities,
        "sourceAwareStemManifestStatus": stem_manifest.get("status"),
        "segmentLoudnessMapStatus": segment_map.get("status"),
        "segmentLoudnessMapTrackCount": segment_map.get("trackCount"),
        "postApprovalRenderRehearsalStatus": post_approval.get("status"),
        "postApprovalInheritsSourceAwareAudioTruth": bool_value(post_approval.get("inheritsSourceAwareAudioTruth")),
        "postApprovalSourceAwareAudioContractStatus": post_approval.get("sourceAwareAudioContractStatus"),
        "postApprovalMasteredSpineOnlyEditingAllowed": bool_value(post_approval.get("masteredSpineOnlyEditingAllowed")),
        "editorPolicy": {
            "masteredSpineUse": "review/export/Premiere/final podcast convenience after approval",
            "sourceAwareStemUse": "editor timing truth for video-aware conversation spacing, clip weaving, reactions, J/L cuts, and scoped repair",
            "branchDecisionUse": "branches adjust metadata above the full-length sequence-aligned stems",
        },
        "hardStopCount": len(hard_stops),
        "hardStops": hard_stops,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "nextSafeAction": (
            "Charlie listens to v006 and records pass/fail/needs-proof. If approved, branch rendering may inherit this source-aware timing contract."
        ),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Source-aware Timing Contract: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This proves the audio spine remains useful for video-aware editing. The mastered spine is not the only editable truth; Charlie, Homer, and clip/source stems stay full length on one sequence clock.",
        "",
        "## Summary",
        "",
        f"- Status: `{report['status']}`",
        f"- Source-aware timing ready: `{str(report['sourceAwareTimingReady']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Required roles: `{', '.join(report['requiredRoleIds'])}`",
        f"- Ready roles: `{report['readyRoleCount']}` / `{report['requiredRoleCount']}`",
        f"- Max duration delta to mastered spine: `{report['maxDurationDeltaToMasterSeconds']}s`",
        f"- Tolerance: `{report['durationToleranceSeconds']}s`",
        f"- Branch timing capabilities: `{report['branchTimingCapabilityCount']}`",
        "",
        "## Role contracts",
        "",
        "| Role | Status | Full length | Delta to master | Refined stem |",
        "|---|---|---:|---:|---|",
    ]
    for role in report["roleContracts"]:
        lines.append(
            "| "
            + " | ".join(
                [
                    str(role.get("roleId")),
                    f"`{role.get('status')}`",
                    str(role.get("fullLengthSequenceAligned")).lower(),
                    f"`{role.get('durationDeltaToMasterSeconds')}s`",
                    f"`{role.get('selectedRefinedStemPath')}`",
                ]
            )
            + " |"
        )
    lines.extend(["", "## Capabilities", ""])
    for item in report["branchTimingCapabilities"]:
        lines.append(f"- **{item['label']}**: {item['contract']}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- Do not destructively trim stems for branch edits.",
            "- Do not allow mastered-spine-only editing for final branch renders.",
            "- Do not independently resync one role without writing a new timing contract.",
            "- Keep SHOW/SKIP, ducking, J/L cuts, and clip-weaving decisions as metadata above the aligned stems.",
            "",
            "## Safety",
            "",
            "- Approval state changed: `false`",
            "- Branch state changed: `false`",
            "- Render attempted: `false`",
            "- Upload attempted: `false`",
            "- Publication attempted: `false`",
            "- Original media mutated: `false`",
            "",
            "## Next action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    if report["hardStops"]:
        lines.extend(["## Hard stops", ""])
        lines.extend(f"- {item}" for item in report["hardStops"])
        lines.append("")
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    role_cards = "\n".join(
        f"""
        <article class=\"role\">
          <h3>{e(role.get('roleId'))}</h3>
          <p><b>{e(role.get('status'))}</b></p>
          <p>Delta to master: <code>{e(role.get('durationDeltaToMasterSeconds'))}s</code></p>
          <p class=\"path\">{e(role.get('selectedRefinedStemPath'))}</p>
        </article>
        """
        for role in report["roleContracts"]
    )
    capability_rows = "\n".join(
        f"<li><b>{e(item['label'])}</b>: {e(item['contract'])}</li>"
        for item in report["branchTimingCapabilities"]
    )
    hard_stops = "\n".join(f"<li>{e(item)}</li>" for item in report["hardStops"]) or "<li>None</li>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Source-aware Timing Contract</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111713; --card:#1c261f; --ink:#f4ecd8; --muted:#b9ad96; --gold:#efc85a; --ok:#7dd88a; --bad:#ff746f; --line:rgba(244,236,216,.16); }}
    body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Avenir Next',sans-serif; background:radial-gradient(circle at top left,#2f3f26,var(--bg)); color:var(--ink); }}
    main {{ max-width:1120px; margin:0 auto; padding:44px 24px 64px; }}
    h1 {{ font-size:42px; line-height:1.02; margin:0 0 10px; }}
    .card,.role {{ background:color-mix(in oklab,var(--card),transparent 8%); border:1px solid var(--line); border-radius:22px; padding:20px; box-shadow:0 18px 50px rgba(0,0,0,.22); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:12px; margin:22px 0; }}
    .metric b {{ display:block; color:var(--gold); font-size:11px; letter-spacing:.13em; text-transform:uppercase; margin-bottom:6px; }}
    .metric strong {{ font-size:22px; }}
    .roles {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; }}
    code {{ color:var(--gold); }}
    .ok {{ color:var(--ok); }}
    .bad {{ color:var(--bad); }}
    .muted,.path {{ color:var(--muted); }}
    .path {{ font-size:12px; overflow-wrap:anywhere; }}
    li {{ margin:8px 0; }}
  </style>
</head>
<body>
<main>
  <p class=\"muted\">Quipsly Episode 4 audio workbench</p>
  <h1>Source-aware timing contract</h1>
  <p class=\"muted\">The mastered spine is the listen/export artifact. The editable truth is Charlie, Homer, and clip/source stems on one sequence clock.</p>
  <section class=\"grid\">
    <div class=\"card metric\"><b>Status</b><strong class=\"{'ok' if report['sourceAwareTimingReady'] else 'bad'}\">{e(report['status'])}</strong></div>
    <div class=\"card metric\"><b>Ready roles</b><strong>{e(report['readyRoleCount'])}/{e(report['requiredRoleCount'])}</strong></div>
    <div class=\"card metric\"><b>Max delta</b><strong>{e(report['maxDurationDeltaToMasterSeconds'])}s</strong></div>
    <div class=\"card metric\"><b>Capabilities</b><strong>{e(report['branchTimingCapabilityCount'])}</strong></div>
  </section>
  <section class=\"roles\">{role_cards}</section>
  <section class=\"card\">
    <h2>What this unlocks after human approval</h2>
    <ul>{capability_rows}</ul>
  </section>
  <section class=\"card\">
    <h2>Hard stops</h2>
    <ul>{hard_stops}</ul>
  </section>
  <section class=\"card\">
    <h2>Safety</h2>
    <p>No approval, branch unlock, render, upload, publication, or original-media mutation happened.</p>
    <p>{e(report['nextSafeAction'])}</p>
  </section>
</main>
</body>
</html>
"""


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
    outputs["latestAudioSourceAwareTimingContract"] = {"path": paths["json"], "jsonPath": paths["json"]}
    outputs["latestAudioSourceAwareTimingContractMarkdown"] = paths["markdown"]
    outputs["latestAudioSourceAwareTimingContractHtml"] = paths["html"]
    outputs["latestAudioSourceAwareTimingContractOpenCommand"] = paths["openCommand"]
    manifest.update(
        {
            "audioSourceAwareTimingContractLatestStatus": report["status"],
            "audioSourceAwareTimingContractReady": report["sourceAwareTimingReady"],
            "audioSourceAwareTimingContractRequiredRoleCount": report["requiredRoleCount"],
            "audioSourceAwareTimingContractReadyRoleCount": report["readyRoleCount"],
            "audioSourceAwareTimingContractFullLengthStemCount": report["fullLengthStemCount"],
            "audioSourceAwareTimingContractRoleIds": report["roleIds"],
            "audioSourceAwareTimingContractMissingRoleIds": report["missingRoleIds"],
            "audioSourceAwareTimingContractDurationToleranceSeconds": report["durationToleranceSeconds"],
            "audioSourceAwareTimingContractMaxDurationDeltaToMasterSeconds": report["maxDurationDeltaToMasterSeconds"],
            "audioSourceAwareTimingContractBranchTimingCapabilityCount": report["branchTimingCapabilityCount"],
            "audioSourceAwareTimingContractHardStopCount": report["hardStopCount"],
            "audioSourceAwareTimingContractPostApprovalStatus": report["postApprovalRenderRehearsalStatus"],
            "audioSourceAwareTimingContractPostApprovalInheritsSourceAwareAudioTruth": report["postApprovalInheritsSourceAwareAudioTruth"],
            "audioSourceAwareTimingContractPostApprovalSourceAwareAudioContractStatus": report["postApprovalSourceAwareAudioContractStatus"],
            "audioSourceAwareTimingContractPostApprovalMasteredSpineOnlyEditingAllowed": report["postApprovalMasteredSpineOnlyEditingAllowed"],
            "audioSourceAwareTimingContractApprovalStateChanged": False,
            "audioSourceAwareTimingContractBranchStateChanged": False,
            "audioSourceAwareTimingContractRenderAttempted": False,
            "audioSourceAwareTimingContractBranchRenderAttempted": False,
            "audioSourceAwareTimingContractUploadAttempted": False,
            "audioSourceAwareTimingContractPublicationAttempted": False,
            "audioSourceAwareTimingContractOriginalMediaMutated": False,
        }
    )
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    report = build_report(baseline_dir)
    slug = safe_slug(str(report["baselineId"]))
    stamp = utc_stamp()

    stable_json = baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.json"
    stable_md = baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.md"
    stable_html = baseline_dir / "AUDIO_SOURCE_AWARE_TIMING_CONTRACT.html"
    stable_open = baseline_dir / "OPEN_AUDIO_SOURCE_AWARE_TIMING_CONTRACT.command"
    version_dir = baseline_dir / f"audio-source-aware-timing-contract-{slug}-{stamp}"
    version_dir.mkdir(parents=True, exist_ok=True)
    version_json = version_dir / "source-aware-timing-contract.json"
    version_md = version_dir / "source-aware-timing-contract.md"
    version_html = version_dir / "source-aware-timing-contract.html"
    version_open = version_dir / "open-source-aware-timing-contract.command"

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
    update_manifest(manifest_path, report, paths)
    print(
        json.dumps(
            {
                "status": report["status"],
                "sourceAwareTimingReady": report["sourceAwareTimingReady"],
                "readyRoleCount": report["readyRoleCount"],
                "hardStopCount": report["hardStopCount"],
                "maxDurationDeltaToMasterSeconds": report["maxDurationDeltaToMasterSeconds"],
                "htmlPath": report["htmlPath"],
                "openCommand": report["openCommand"],
            },
            indent=2,
        )
    )
    return 0 if report["sourceAwareTimingReady"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
