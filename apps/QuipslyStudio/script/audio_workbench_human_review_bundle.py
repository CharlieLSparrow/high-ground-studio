#!/usr/bin/env python3
"""Create a single human review bundle for an Audio Workbench candidate.

The bundle is a convenience layer over existing evidence. It symlinks review
artifacts, audio handoffs, proof snippets, reports, and command plans into one
timestamped folder with a README and an open-review.command launcher.

It does not approve audio, render branches, mutate source media, or overwrite
older bundles.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def output_path(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "artifact"


def rel_link(target: Path, link: Path) -> None:
    if link.exists() or link.is_symlink():
        raise FileExistsError(f"Refusing to overwrite bundle link: {link}")
    relative = os.path.relpath(target, link.parent)
    link.symlink_to(relative, target_is_directory=target.is_dir())


def unique_link_path(folder: Path, label: str, target: Path, used: set[str]) -> Path:
    suffix = "".join(target.suffixes)
    if target.is_dir():
        suffix = ""
    stem = safe_slug(label)
    candidate = f"{stem}{suffix}"
    counter = 2
    while candidate in used:
        candidate = f"{stem}-{counter}{suffix}"
        counter += 1
    used.add(candidate)
    return folder / candidate


def collect_artifacts(manifest: dict[str, Any]) -> list[dict[str, str]]:
    outputs = manifest.get("outputs") or {}
    specs = [
        ("00-open-review-handoff", "latestReviewHandoffIndexMarkdown"),
        ("01-audio-review-cockpit", "audioReviewCockpitHtml"),
        ("02-listen-review-packet", "listenReviewPacketMarkdown"),
        ("03-listening-copy-m4a", "masterM4a"),
        ("04-full-handoff-wav", "masterWav"),
        ("05-listen-proof-bundle", "listenProofBundle"),
        ("06-visual-proof-window-qc", "latestVisualProofWindowsHtml"),
        ("07-visual-proof-window-report", "latestVisualProofWindowsMarkdown"),
        ("08-proof-window-workorder", "proofWindowListenWorkorderMarkdown"),
        ("09-proof-window-comparison", "proofWindowComparisonMarkdown"),
        ("10-qc-report", "qualityReportMarkdown"),
        ("11-source-activity", "sourceActivityMarkdown"),
        ("12-source-contribution", "sourceContributionMarkdown"),
        ("13-review-readiness", "latestReviewReadinessVerificationMarkdown"),
        ("14-post-listen-next-actions", "latestPostListenNextActionsMarkdown"),
        ("15-listen-decision-command-verification", "latestListenDecisionCommandVerificationMarkdown"),
        ("16-approved-branch-render-executor", "latestApprovedBranchRenderExecutorMarkdown"),
        ("17-approval-path-smoke", "latestApprovalPathSmokeMarkdown"),
        ("18-branch-render-preflight", "branchRenderPreflightMarkdown"),
        ("19-branch-proof-evidence", "latestBranchRenderProofMarkdown"),
        ("20-listen-decision-template", "latestListenDecisionTemplateMarkdown"),
        ("21-branch-inheritance-gate", "latestBranchInheritanceGateMarkdown"),
    ]
    artifacts: list[dict[str, str]] = []
    for label, key in specs:
        path = output_path(outputs.get(key))
        if path:
            artifacts.append({"label": label, "key": key, "path": path})

    for index, snippet in enumerate(outputs.get("proofSnippets") or [], start=1):
        if not isinstance(snippet, dict):
            continue
        snippet_label = safe_slug(str(snippet.get("label") or f"proof-window-{index}"))
        for key in [
            "rawAligned",
            "sourceAwareContributionMix",
            "conformedMasterSpine",
            "speakerSplitCharlieLeftHomerRight",
        ]:
            path = output_path(snippet.get(key))
            if path:
                artifacts.append(
                    {
                        "label": f"proof-snippets/{index:02d}-{snippet_label}-{safe_slug(key)}",
                        "key": f"proofSnippets.{index}.{key}",
                        "path": path,
                    }
                )
    return artifacts


def build_readme(report: dict[str, Any]) -> str:
    lines = [
        f"# Human Review Bundle: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This bundle is a convenience layer. It does not approve audio, render branches, publish, or mutate source media.",
        "",
        "## Current truth",
        "",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Human listen still required: `{str(report['humanListenStillRequired']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Bundle ready: `{str(report['bundleReady']).lower()}`",
        f"- Missing links: `{report['missingLinkCount']}`",
        "",
        "## Start here",
        "",
        "1. Run `open-review.command`, or open `00-open-review-handoff.md` manually.",
        "2. Listen to the full M4A and the focused proof windows.",
        "3. Use the proof-window workorder for the five listen-priority warnings.",
        "4. Record pass or fail using the tested commands in the handoff.",
        "",
        "## Artifacts",
        "",
        "| Link | Source key | Status | Target |",
        "|---|---:|---:|---|",
    ]
    for item in report["links"]:
        lines.append(
            f"| `{item['linkRelative']}` | `{item['key']}` | `{item['status']}` | `{item['target']}` |"
        )
    if report["missingLinks"]:
        lines.extend(["", "## Missing links", ""])
        lines.extend(f"- {item['label']}: `{item['target']}`" for item in report["missingLinks"])
    lines.extend(["", "## Next safest action", "", report["nextSafestAction"], ""])
    return "\n".join(lines)


def build_open_script(bundle_dir: Path, report: dict[str, Any]) -> str:
    paths = []
    for item in report["links"]:
        if item["label"].startswith("00-") or item["label"].startswith("01-") or item["label"].startswith("06-"):
            paths.append(item["linkRelative"])
    lines = ["#!/bin/zsh", "set -e", f"cd {zsh_quote(str(bundle_dir))}"]
    for path in paths:
        lines.append(f"open {zsh_quote(path)}")
    lines.append("echo 'Opened Quipsly Episode 4 v006 review artifacts. Human listen proof is still required.'")
    return "\n".join(lines) + "\n"


def zsh_quote(text: str) -> str:
    return "'" + text.replace("'", "'\"'\"'") + "'"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = args.baseline_dir.expanduser().resolve()
    manifest_path = baseline_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")

    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    bundle_dir = baseline_dir / f"human-review-bundle-{slug}-{generated_at}"
    bundle_dir.mkdir(parents=True, exist_ok=False)

    links: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    used_names: set[str] = set()
    artifacts = collect_artifacts(manifest)
    for artifact in artifacts:
        target = Path(artifact["path"])
        subdir = bundle_dir
        label = artifact["label"]
        if "/" in label:
            parent, child = label.split("/", 1)
            subdir = bundle_dir / safe_slug(parent)
            subdir.mkdir(parents=True, exist_ok=True)
            label = child
        link = unique_link_path(subdir, label, target, used_names)
        status = "present"
        if not target.exists():
            status = "missing-target"
            missing.append({**artifact, "target": str(target), "link": str(link)})
        else:
            rel_link(target, link)
        links.append(
            {
                "label": artifact["label"],
                "key": artifact["key"],
                "target": str(target),
                "link": str(link),
                "linkRelative": str(link.relative_to(bundle_dir)),
                "status": status,
            }
        )

    report = {
        "schema": "quipsly.audio-workbench.human-review-bundle.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "bundleDir": str(bundle_dir),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "humanListenStillRequired": manifest.get("approvalStatus") == "machine-candidate-needs-human-listen-proof",
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "linkCount": len(links),
        "missingLinkCount": len(missing),
        "bundleReady": not missing,
        "links": links,
        "missingLinks": missing,
        "nextSafestAction": (
            "Open this bundle, complete human listen proof, then record pass or fail. "
            "Do not render real branches until approval and gates pass."
        ),
    }

    readme_path = bundle_dir / "README.md"
    command_path = bundle_dir / "open-review.command"
    report_json_path = bundle_dir / "human-review-bundle.json"
    report_md_path = bundle_dir / "human-review-bundle-report.md"
    readme_path.write_text(build_readme(report) + "\n")
    report_md_path.write_text(build_readme(report) + "\n")
    write_json(report_json_path, report)
    command_path.write_text(build_open_script(bundle_dir, report))
    command_path.chmod(0o755)

    outputs["latestHumanReviewBundle"] = str(report_json_path)
    outputs["latestHumanReviewBundleMarkdown"] = str(report_md_path)
    outputs["latestHumanReviewBundleReadme"] = str(readme_path)
    outputs["latestHumanReviewBundleOpenCommand"] = str(command_path)
    history = outputs.setdefault("humanReviewBundles", [])
    if str(report_json_path) not in history:
        history.append(str(report_json_path))
    manifest["latestHumanReviewBundleGeneratedAt"] = generated_at
    manifest["humanReviewBundleCount"] = len(history)
    manifest["humanReviewBundleReady"] = not missing
    manifest["humanReviewBundleMissingLinkCount"] = len(missing)
    write_json(manifest_path, manifest)

    print(f"Wrote {readme_path}")
    print(f"Wrote {report_json_path}")
    print(f"Bundle ready: {not missing}")
    print(f"Links: {len(links)}")
    print(f"Missing: {len(missing)}")


if __name__ == "__main__":
    main()
