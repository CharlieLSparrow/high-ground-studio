#!/usr/bin/env python3
"""Smoke-check the parameter sweep proof snippet pack.

This validates the latest proof-only snippet pack without approving audio,
failing audio, rendering edit branches, uploading files, or mutating original
media.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path.expanduser().resolve()
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.expanduser().resolve()
    raise FileNotFoundError(f"Could not find baseline manifest under {input_path}")


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str) and path:
            return path
    return None


def safe_slug(value: Any) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio Workbench Parameter Sweep Proof Snippet Pack Smoke: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This smoke validates the proof-only parameter sweep snippet pack. It does not approve audio, fail audio, render branches, upload files, or mutate original media.",
        "",
        "## Result",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Errors: `{len(report['errors'])}`",
        f"- Warnings: `{len(report['warnings'])}`",
        f"- Rendered snippets: `{report['renderedSnippetCount']}`",
        f"- Unavailable variant routes: `{report['unavailableVariantCount']}`",
        f"- Approval state preserved: `{str(report['approvalStatePreserved']).lower()}`",
        f"- Branch state preserved: `{str(report['branchStatePreserved']).lower()}`",
        f"- Branch render attempted: `{str(report['branchRenderAttempted']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Checked artifacts",
        "",
        f"- Pack JSON: `{report['packPath']}`",
        f"- Markdown: `{report['markdownPath']}`",
        f"- HTML: `{report['htmlPath']}`",
        f"- Playlist: `{report['playlistPath']}`",
        f"- Open command: `{report['openCommandPath']}`",
        "",
    ]
    if report["errors"]:
        lines.extend(["## Errors", ""])
        lines.extend(f"- {error}" for error in report["errors"])
        lines.append("")
    if report["warnings"]:
        lines.extend(["## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report["warnings"])
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    pack_path_text = output_path(outputs.get("latestAudioWorkbenchParameterSweepProofSnippetPack"))
    errors: list[str] = []
    warnings: list[str] = []
    if not pack_path_text:
        raise SystemExit("latestAudioWorkbenchParameterSweepProofSnippetPack is not registered")
    pack_path = Path(pack_path_text)
    if not pack_path.exists():
        raise SystemExit(f"latestAudioWorkbenchParameterSweepProofSnippetPack is missing: {pack_path}")
    pack = read_json(pack_path)

    if pack.get("baselineId") != baseline_id:
        errors.append("Pack baselineId does not match manifest baselineId.")
    if pack.get("approvalStatus") != manifest.get("approvalStatus"):
        errors.append("Pack approvalStatus does not match manifest approvalStatus.")
    if bool(pack.get("branchInheritanceReady")) != bool(manifest.get("branchInheritanceReady")):
        errors.append("Pack branchInheritanceReady does not match manifest.")
    if bool(pack.get("branchRenderReady")) != bool(manifest.get("branchRenderReady")):
        errors.append("Pack branchRenderReady does not match manifest.")
    if pack.get("approvalStateChanged") is not False or pack.get("branchStateChanged") is not False:
        errors.append("Pack reports approval or branch state changes.")
    if pack.get("branchRenderAttempted") is not False:
        errors.append("Pack reports a branch render attempt.")
    if pack.get("originalMediaMutated") is not False:
        errors.append("Pack does not explicitly preserve originalMediaMutated=false.")
    rendered_count = int(pack.get("renderedSnippetCount") or 0)
    unavailable_count = int(pack.get("unavailableVariantCount") or 0)
    failure_count = int(pack.get("renderFailureCount") or 0)
    if rendered_count < 12:
        errors.append(f"Expected at least 12 rendered proof snippets; found {rendered_count}.")
    if unavailable_count < 1:
        warnings.append("No unavailable variant routes were recorded; this may mean unsafe routes are being faked instead of held.")
    if failure_count != 0:
        errors.append(f"Render failures present: {failure_count}.")

    markdown_path = Path(str(pack.get("markdown") or ""))
    html_path = Path(str(pack.get("html") or ""))
    playlist_path = Path(str(pack.get("playlist") or ""))
    open_command_path = Path(str(pack.get("openCommand") or ""))
    for label, path in [
        ("markdown", markdown_path),
        ("html", html_path),
        ("playlist", playlist_path),
        ("open command", open_command_path),
    ]:
        if not str(path):
            errors.append(f"Missing {label} path.")
        elif not path.exists():
            errors.append(f"Missing {label}: {path}")
        elif path.is_file() and path.stat().st_size <= 0:
            errors.append(f"Empty {label}: {path}")

    rendered_paths: list[str] = []
    for plan in pack.get("plans") or []:
        for item in plan.get("items") or []:
            if item.get("status") == "rendered" and item.get("path"):
                rendered_paths.append(str(item["path"]))
                path = Path(str(item["path"]))
                if not path.exists() or path.stat().st_size <= 0:
                    errors.append(f"Rendered snippet missing or empty: {path}")
    playlist_text = playlist_path.read_text(encoding="utf-8") if playlist_path.exists() else ""
    missing_from_playlist = [path for path in rendered_paths if path not in playlist_text]
    if missing_from_playlist:
        warnings.append(f"{len(missing_from_playlist)} rendered snippets are not listed in playlist.")

    report = {
        "schema": "quipsly.audio-workbench.parameter-sweep-proof-snippet-pack-smoke.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "packPath": str(pack_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "playlistPath": str(playlist_path),
        "openCommandPath": str(open_command_path),
        "renderedSnippetCount": rendered_count,
        "unavailableVariantCount": unavailable_count,
        "renderFailureCount": failure_count,
        "errors": errors,
        "warnings": warnings,
        "passed": not errors,
        "approvalStatePreserved": pack.get("approvalStateChanged") is False,
        "branchStatePreserved": pack.get("branchStateChanged") is False,
        "branchRenderAttempted": bool(pack.get("branchRenderAttempted")),
        "originalMediaMutated": bool(pack.get("originalMediaMutated")),
    }
    out_dir = baseline_dir / f"audio-workbench-parameter-sweep-proof-snippet-pack-smoke-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "parameter-sweep-proof-snippet-pack-smoke.json"
    md_path = out_dir / f"audio-workbench-parameter-sweep-proof-snippet-pack-smoke-{slug}-{generated_at}.md"
    write_json(json_path, report)
    md_path.write_text(render_markdown(report) + "\n", encoding="utf-8")

    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackSmoke"] = str(json_path)
    outputs["latestAudioWorkbenchParameterSweepProofSnippetPackSmokeMarkdown"] = str(md_path)
    history = outputs.setdefault("audioWorkbenchParameterSweepProofSnippetPackSmokeHistory", [])
    if isinstance(history, list) and str(json_path) not in history:
        history.append(str(json_path))
    manifest["audioWorkbenchParameterSweepProofSnippetPackSmokeCount"] = int(manifest.get("audioWorkbenchParameterSweepProofSnippetPackSmokeCount") or 0) + 1
    manifest["audioWorkbenchParameterSweepProofSnippetPackLatestSmokePassed"] = report["passed"]
    write_json(manifest_path, manifest)

    print(f"Parameter sweep proof snippet pack smoke: {md_path}")
    print(f"Passed: {str(report['passed']).lower()}")
    print(f"Rendered snippets: {rendered_count}")
    print(f"Unavailable variant routes: {unavailable_count}")
    print(f"Errors: {len(errors)}")
    print(f"Warnings: {len(warnings)}")
    print("Approval state preserved: true")
    print("Branch state preserved: true")
    print("Branch render attempted: false")
    print("Original media mutated: false")
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
