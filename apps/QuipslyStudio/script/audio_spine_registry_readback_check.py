#!/usr/bin/env python3
"""Validate the Quipsly Studio audio spine registry contract.

This is intentionally a narrow, cheap readback check. It does not approve audio,
render branches, publish, upload, or mutate original media.
"""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path
from typing import Any


DEFAULT_REGISTRY = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/"
    "Episode_4_Audio_Spine_Registry/episode4-audio-spine-registry.json"
)


def artifact_exists(candidate: dict[str, Any], key: str) -> bool:
    artifact = (candidate.get("artifacts") or {}).get(key)
    return bool(isinstance(artifact, dict) and artifact.get("exists") and Path(artifact.get("path", "")).exists())


def artifact_duration(candidate: dict[str, Any], key: str) -> float:
    artifact = (candidate.get("artifacts") or {}).get(key)
    if not isinstance(artifact, dict):
        return 0.0
    value = artifact.get("durationSeconds")
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def stem_roles(candidate: dict[str, Any]) -> list[dict[str, Any]]:
    stem_set = candidate.get("sourceAwareStemSet")
    if not isinstance(stem_set, dict):
        return []
    roles = stem_set.get("roles")
    return roles if isinstance(roles, list) else []


def stem_duration(role: dict[str, Any]) -> float:
    stem = role.get("selectedRefinedStem")
    if not isinstance(stem, dict):
        return 0.0
    try:
        return float(stem.get("durationSeconds") or 0)
    except (TypeError, ValueError):
        return 0.0


def candidate_by_id(registry: dict[str, Any], candidate_id: str) -> dict[str, Any] | None:
    for candidate in registry.get("candidates") or []:
        if candidate.get("id") == candidate_id:
            return candidate
    return None


def add_check(checks: list[dict[str, Any]], name: str, passed: bool, detail: str) -> None:
    checks.append({"name": name, "passed": bool(passed), "detail": detail})


def render_markdown(result: dict[str, Any]) -> str:
    status = result["status"]
    lines = [
        "# Audio Spine Registry Readback",
        "",
        f"- Status: `{status}`",
        f"- Passed: `{result['passed']}`",
        f"- Checks: `{result['checkCount']}`",
        f"- Failures: `{result['failureCount']}`",
        f"- Registry: `{result['registryPath']}`",
        "",
        "## Why this exists",
        "",
        "This check proves the editor-facing audio spine registry still respects the Episode 4 gate:",
        "",
        "- v006 remains the current full-source audio spine default.",
        "- Branch rendering remains locked until human listen approval.",
        "- The duration-safe remaster remains branch-scoped, not canonical source truth.",
        "",
        "## Checks",
        "",
        "| Check | Result | Detail |",
        "|---|---:|---|",
    ]
    for check in result["checks"]:
        badge = "PASS" if check["passed"] else "FAIL"
        detail = str(check.get("detail") or "").replace("\n", " ")
        lines.append(f"| {check['name']} | {badge} | `{detail}` |")
    lines.append("")
    return "\n".join(lines)


def render_html(markdown: str, result: dict[str, Any]) -> str:
    rows = []
    for check in result["checks"]:
        badge = "PASS" if check["passed"] else "FAIL"
        cls = "pass" if check["passed"] else "fail"
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(check['name']))}</td>"
            f"<td class='{cls}'>{badge}</td>"
            f"<td><code>{html.escape(str(check.get('detail') or ''))}</code></td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Audio Spine Registry Readback</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 40px; background: #fbf6ea; color: #31271e; }}
    main {{ max-width: 1040px; margin: 0 auto; background: #fffaf0; border: 1px solid #dfcfaf; border-radius: 22px; padding: 28px; box-shadow: 0 12px 36px rgba(74, 54, 28, .12); }}
    h1 {{ margin-top: 0; }}
    .status {{ display: inline-block; padding: 8px 12px; border-radius: 999px; background: #e4f3d6; color: #245520; font-weight: 800; letter-spacing: .04em; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: 22px; }}
    th, td {{ border-bottom: 1px solid #eadfc9; padding: 10px; text-align: left; vertical-align: top; }}
    code {{ white-space: pre-wrap; overflow-wrap: anywhere; }}
    .pass {{ color: #15713a; font-weight: 800; }}
    .fail {{ color: #b42318; font-weight: 800; }}
  </style>
</head>
<body>
<main>
  <p class="status">{html.escape(str(result["status"]))}</p>
  <h1>Audio Spine Registry Readback</h1>
  <p>This proves v006 is still the current full-source audio spine default, branch rendering is still locked, and the 59m26 remaster is still branch-scoped.</p>
  <p><strong>Checks:</strong> {result["checkCount"]} &nbsp; <strong>Failures:</strong> {result["failureCount"]}</p>
  <p><strong>Registry:</strong> <code>{html.escape(str(result["registryPath"]))}</code></p>
  <table>
    <thead><tr><th>Check</th><th>Result</th><th>Detail</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
</main>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--registry", default=str(DEFAULT_REGISTRY))
    args = parser.parse_args()

    registry_path = Path(args.registry)
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    policy = registry.get("selectionPolicy") or {}
    checks: list[dict[str, Any]] = []

    default_id = policy.get("fullSourceDefault")
    deadline_id = policy.get("deadlineUploadDefault")
    default_candidate = candidate_by_id(registry, default_id)
    deadline_candidate = candidate_by_id(registry, deadline_id)

    add_check(checks, "registry exists", registry_path.exists(), str(registry_path))
    add_check(checks, "schema is v1", registry.get("schema") == "quipsly.audioSpineRegistry.v1", str(registry.get("schema")))
    add_check(checks, "episode is episode-4", registry.get("episodeSlug") == "episode-4", str(registry.get("episodeSlug")))
    add_check(checks, "explicit selection required", policy.get("selectionMustBeExplicit") is True, str(policy))
    add_check(
        checks,
        "branch rendering locked until human listen approval",
        policy.get("branchRenderingLockedUntilHumanListenApproval") is True,
        str(policy),
    )
    add_check(
        checks,
        "v006 is current full source default",
        default_id == "episode4-full-source-master-v006-homer-preserving-clean",
        str(default_id),
    )
    add_check(checks, "default candidate present", default_candidate is not None, str(default_id))

    if default_candidate:
        add_check(
            checks,
            "default candidate is full source master",
            default_candidate.get("kind") == "fullSourceMaster"
            and default_candidate.get("scope") == "full-sync-source-layer",
            f"{default_candidate.get('kind')} / {default_candidate.get('scope')}",
        )
        add_check(
            checks,
            "default candidate remains human listen gated",
            "human-listen" in str(default_candidate.get("status", ""))
            or "publication-without-human-listen-approval" in (default_candidate.get("notSafeFor") or []),
            str(default_candidate.get("status")),
        )
        add_check(
            checks,
            "default candidate master M4A exists",
            artifact_exists(default_candidate, "masterM4a"),
            str((default_candidate.get("artifacts") or {}).get("masterM4a", {}).get("path")),
        )
        add_check(
            checks,
            "default candidate duration is full source length",
            artifact_duration(default_candidate, "masterM4a") > 6000,
            str(artifact_duration(default_candidate, "masterM4a")),
        )
        reports = default_candidate.get("reports") or {}
        stem_set = default_candidate.get("sourceAwareStemSet") if isinstance(default_candidate.get("sourceAwareStemSet"), dict) else {}
        roles = stem_roles(default_candidate)
        role_ids = {str(role.get("roleId")) for role in roles}
        add_check(
            checks,
            "default candidate links source-aware stem manifest",
            bool(reports.get("sourceAwareStemManifest") and Path(reports["sourceAwareStemManifest"]).exists()),
            str(reports.get("sourceAwareStemManifest")),
        )
        add_check(
            checks,
            "default candidate links fast readback",
            bool(reports.get("fastReadback") and Path(reports["fastReadback"]).exists()),
            str(reports.get("fastReadback")),
        )
        add_check(
            checks,
            "default candidate embeds source-aware stem set",
            isinstance(stem_set, dict) and stem_set.get("readyStemCount") == 3 and len(roles) >= 3,
            f"ready={stem_set.get('readyStemCount') if isinstance(stem_set, dict) else None}, roles={len(roles)}",
        )
        add_check(
            checks,
            "default candidate has Charlie Homer and clip source roles",
            {"charlie", "homer", "clip-source"}.issubset(role_ids),
            ", ".join(sorted(role_ids)),
        )
        add_check(
            checks,
            "source-aware stems are full sequence length",
            all(stem_duration(role) > 6000 for role in roles if role.get("roleId") in {"charlie", "homer", "clip-source"}),
            ", ".join(f"{role.get('roleId')}={stem_duration(role):.3f}" for role in roles),
        )
        add_check(
            checks,
            "editor truth says stems plus metadata not flat master",
            "source-aware refined stems plus a mix recipe" in str(stem_set.get("editorAudioTruthRule", "")),
            str(stem_set.get("editorAudioTruthRule", "")),
        )
        mix_recipe = stem_set.get("mixRecipe") if isinstance(stem_set.get("mixRecipe"), dict) else {}
        add_check(
            checks,
            "mix recipe frames master as review export convenience",
            "review/export convenience" in str(mix_recipe.get("canonicalEditorTruth", "")),
            str(mix_recipe.get("canonicalEditorTruth", "")),
        )

    add_check(checks, "deadline upload candidate present", deadline_candidate is not None, str(deadline_id))
    if deadline_candidate:
        add_check(
            checks,
            "deadline upload candidate is branch remaster",
            deadline_candidate.get("kind") == "branchRemaster"
            and deadline_candidate.get("scope") == "rendered-final-edit-branch",
            f"{deadline_candidate.get('kind')} / {deadline_candidate.get('scope')}",
        )
        add_check(
            checks,
            "deadline candidate is not safe as full source sync layer",
            "full-source-sync-layer" in (deadline_candidate.get("notSafeFor") or []),
            str(deadline_candidate.get("notSafeFor") or []),
        )
        add_check(
            checks,
            "deadline candidate duration is final branch length",
            3500 <= artifact_duration(deadline_candidate, "masterM4a") <= 3650,
            str(artifact_duration(deadline_candidate, "masterM4a")),
        )

    failure_count = sum(1 for check in checks if not check["passed"])
    result = {
        "status": "audio-spine-registry-readback-passed" if failure_count == 0 else "audio-spine-registry-readback-failed",
        "passed": failure_count == 0,
        "checkCount": len(checks),
        "failureCount": failure_count,
        "registryPath": str(registry_path),
        "checks": checks,
    }
    output_path = registry_path.with_name("AUDIO_SPINE_REGISTRY_READBACK_CHECK.json")
    markdown_path = registry_path.with_name("AUDIO_SPINE_REGISTRY_READBACK_CHECK.md")
    html_path = registry_path.with_name("AUDIO_SPINE_REGISTRY_READBACK_CHECK.html")
    result["markdownPath"] = str(markdown_path)
    result["htmlPath"] = str(html_path)
    output_path.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    markdown = render_markdown(result)
    markdown_path.write_text(markdown, encoding="utf-8")
    html_path.write_text(render_html(markdown, result), encoding="utf-8")
    print(json.dumps({key: result[key] for key in ["status", "passed", "checkCount", "failureCount", "registryPath"]}, indent=2))
    if failure_count:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
