#!/usr/bin/env python3
"""Create a structured human-listen decision matrix for an audio baseline.

This is not an approval tool. It gathers the current review packet, proof
windows, bleed audit, conditional repair workorder, and locked repair preflight
into one reviewer-facing artifact. The output should make it obvious what a
human needs to listen for, what counts as pass/fail, and what guarded command
path should happen next.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_json(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def output_path(value: Any) -> str | None:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        path = value.get("path")
        if isinstance(path, str):
            return path
    return None


def path_from_output(outputs: dict[str, Any], key: str) -> Path | None:
    path = output_path(outputs.get(key))
    return Path(path) if path else None


def resolve_baseline_dir(input_path: Path) -> Path:
    if (input_path / "manifest.json").exists():
        return input_path
    nested = input_path / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested
    raise FileNotFoundError(
        "Could not find manifest.json at "
        f"{input_path}/manifest.json or {nested}/manifest.json"
    )


def safe_slug(value: str) -> str:
    slug = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def warning_mentions_label(warning: Any, label: str) -> bool:
    text = json.dumps(warning, sort_keys=True) if not isinstance(warning, str) else warning
    normalized = label.replace("-", " ").lower()
    return label.lower() in text.lower() or normalized in text.lower()


def collect_proof_snippet_paths(outputs: dict[str, Any], label: str) -> dict[str, str]:
    for snippet in outputs.get("proofSnippets") or []:
        if not isinstance(snippet, dict):
            continue
        if snippet.get("label") != label:
            continue
        result: dict[str, str] = {}
        for key in [
            "rawAligned",
            "sourceAwareContributionMix",
            "conformedMasterSpine",
            "speakerSplitCharlieLeftHomerRight",
        ]:
            path = output_path(snippet.get(key))
            if path:
                result[key] = path
        return result
    return {}


def collect_window_rows(
    *,
    outputs: dict[str, Any],
    review_packet: dict[str, Any],
    proof_comparison: dict[str, Any],
    bleed_audit: dict[str, Any],
    repair_workorder: dict[str, Any],
) -> list[dict[str, Any]]:
    review_windows = review_packet.get("reviewWindows") or []
    proof_warnings = proof_comparison.get("warnings") or []
    bleed_windows = {
        window.get("label"): window
        for window in bleed_audit.get("proofWindows") or []
        if isinstance(window, dict) and window.get("label")
    }
    repair_actions_by_label: dict[str, list[dict[str, Any]]] = {}
    for action in repair_workorder.get("repairActions") or []:
        if not isinstance(action, dict):
            continue
        label = str(action.get("windowLabel") or "")
        repair_actions_by_label.setdefault(label, []).append(action)

    rows: list[dict[str, Any]] = []
    for index, window in enumerate(review_windows, start=1):
        if not isinstance(window, dict):
            continue
        label = str(window.get("label") or f"proof-window-{index}")
        bleed_window = bleed_windows.get(label) or {}
        bleed_warnings = bleed_window.get("warnings") or []
        actions = repair_actions_by_label.get(label, [])
        critical = bool(bleed_warnings or actions or any(warning_mentions_label(item, label) for item in proof_warnings))
        pass_criteria = [
            "Conformed master sounds natural against the raw/source-aware references.",
            "Speaker handoff feels conversational, not chopped or pumpy.",
            "Any warning is harmless enough to inherit into edit branches.",
        ]
        fail_criteria = [
            "Distracting echo, bleed, noise, clipping, pumping, harsh restoration, or missing speech remains audible.",
            "Useful laugh/reaction/overlap was gated away.",
            "The window needs a v007 or timestamped candidate before branch inheritance.",
        ]
        if actions:
            fail_action = "Use the linked conditional repair workorder/preflight path; do not overwrite v006."
        else:
            fail_action = "Record failed-human-listen with notes and render a new v007/timestamped candidate."
        rows.append(
            {
                "listenOrder": window.get("listenOrder", index),
                "label": label,
                "sequenceStartSeconds": window.get("sequenceStartSeconds"),
                "durationSeconds": window.get("durationSeconds"),
                "criticalListen": critical,
                "proofSnippets": collect_proof_snippet_paths(outputs, label),
                "proofComparisonWarnings": [
                    item for item in proof_warnings if warning_mentions_label(item, label)
                ],
                "bleedAudit": bleed_window,
                "bleedWarnings": bleed_warnings,
                "repairActions": actions,
                "passCriteria": pass_criteria,
                "failCriteria": fail_criteria,
                "failAction": fail_action,
                "recommendedDecisionIfPasses": "passed-window",
                "recommendedDecisionIfFails": "failed-window-and-issue",
            }
        )
    return rows


def build_commands(baseline_dir: Path, rows: list[dict[str, Any]]) -> dict[str, str]:
    passed_args = " ".join(
        f"--passed-window {shell_quote(str(row['label']))}"
        for row in rows
    )
    suspicious = [row for row in rows if row.get("criticalListen")]
    issue_label = str(suspicious[0]["label"]) if suspicious else "describe failing window"
    return {
        "approveBranchInheritance": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --status human-approved-for-branch-inheritance \\",
                '  --reviewer "Charlie or Mako" \\',
                '  --notes "Human listened to the v006 matrix/session and approved it for edit branch inheritance." \\',
                f"  {passed_args} \\",
                "  --confirm-human-listened",
                'python3 apps/QuipslyStudio/script/audio_workbench_post_listen_refresh.py --baseline-dir "$OUT"',
            ]
        ),
        "failFocusedWindow": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --status failed-human-listen \\",
                '  --reviewer "Charlie or Mako" \\',
                f"  --failed-window {shell_quote(issue_label)} \\",
                '  --notes "Human listen found a problem; render a new v007/timestamped candidate instead of overwriting v006." \\',
                f"  --issue {shell_quote('Describe what failed in ' + issue_label)} \\",
                "  --confirm-human-listened",
            ]
        ),
        "requestMoreProof": "\n".join(
            [
                "OUT=" + shell_quote(str(baseline_dir)),
                "python3 apps/QuipslyStudio/script/audio_workbench_record_listen_decision.py \\",
                '  --baseline-dir "$OUT" \\',
                "  --status needs-focused-proof \\",
                '  --reviewer "Charlie or Mako" \\',
                '  --notes "Human listen needs more focused proof windows before approving branch inheritance." \\',
                '  --issue "Name the time/window needing more proof." \\',
                "  --confirm-human-listened",
            ]
        ),
    }


def render_markdown(matrix: dict[str, Any]) -> str:
    lines = [
        f"# Audio listen decision matrix: {matrix['baselineId']}",
        "",
        f"Generated: `{matrix['generatedAt']}`",
        "",
        "## Current gate truth",
        "",
        f"- Approval status: `{matrix['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(matrix['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(matrix['branchRenderReady']).lower()}`",
        f"- Repair preflight safe to render: `{str(matrix['repairPreflightSafeToRender']).lower()}`",
        f"- Repair render attempted: `{str(matrix['repairPreflightRenderAttempted']).lower()}`",
        "",
        "This matrix does not approve the candidate. It translates the current machine evidence into a human listen checklist.",
        "",
        "## Review windows",
        "",
        "| Order | Window | Start | Duration | Critical listen | What pass means | What fail does |",
        "|---:|---|---:|---:|---|---|---|",
    ]
    for row in matrix["reviewWindows"]:
        pass_text = "Warnings harmless; may inherit v006."
        fail_text = row["failAction"]
        lines.append(
            "| {order} | `{label}` | {start} | {duration} | {critical} | {pass_text} | {fail_text} |".format(
                order=row.get("listenOrder"),
                label=row.get("label"),
                start=row.get("sequenceStartSeconds"),
                duration=row.get("durationSeconds"),
                critical="yes" if row.get("criticalListen") else "normal",
                pass_text=pass_text,
                fail_text=fail_text,
            )
        )

    for row in matrix["reviewWindows"]:
        lines.extend(
            [
                "",
                f"## Window: {row['label']}",
                "",
                f"- Sequence start: `{row.get('sequenceStartSeconds')}`",
                f"- Duration: `{row.get('durationSeconds')}`",
                f"- Critical listen: `{str(row.get('criticalListen')).lower()}`",
                "",
                "### Listen files",
                "",
            ]
        )
        snippets = row.get("proofSnippets") or {}
        if not snippets:
            lines.append("- No proof snippets linked.")
        for key, path in snippets.items():
            lines.append(f"- {key}: `{path}`")

        lines.extend(["", "### Warnings and repair context", ""])
        warnings = row.get("proofComparisonWarnings") or []
        bleed_warnings = row.get("bleedWarnings") or []
        actions = row.get("repairActions") or []
        if not warnings and not bleed_warnings and not actions:
            lines.append("- No focused warnings for this window.")
        for warning in warnings:
            lines.append(f"- proof comparison: `{warning}`")
        for warning in bleed_warnings:
            lines.append(f"- bleed audit: `{warning}`")
        for action in actions:
            lines.append(f"- conditional repair: `{action.get('safeRepairIfConfirmed')}`")
            lines.append(f"- do not do: `{action.get('doNotDo')}`")

        lines.extend(["", "### Pass criteria", ""])
        for item in row.get("passCriteria") or []:
            lines.append(f"- {item}")
        lines.extend(["", "### Fail criteria", ""])
        for item in row.get("failCriteria") or []:
            lines.append(f"- {item}")

    lines.extend(
        [
            "",
            "## Guarded command paths",
            "",
            "Use these after a real human listen. They still require typed confirmation in the called recorder.",
            "",
            "### Approve for branch inheritance",
            "",
            "```bash",
            matrix["commands"]["approveBranchInheritance"],
            "```",
            "",
            "### Fail focused window",
            "",
            "```bash",
            matrix["commands"]["failFocusedWindow"],
            "```",
            "",
            "### Request more proof",
            "",
            "```bash",
            matrix["commands"]["requestMoreProof"],
            "```",
            "",
            "## Reviewer note",
            "",
            "If the camera-assistant overlap warning is audible and bad, use the failed path first. The locked repair preflight already prepares a v007 proof-window direction, but it should stay locked unless the human listen says v006 failed or we explicitly choose a proof-only render.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir.expanduser()).resolve()
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})

    review_packet = load_json(path_from_output(outputs, "listenReviewPacket"))
    proof_comparison = load_json(path_from_output(outputs, "proofWindowComparison"))
    bleed_audit = load_json(path_from_output(outputs, "latestBleedManagementAudit"))
    repair_workorder = load_json(path_from_output(outputs, "latestBleedRepairWorkorder"))
    repair_preflight = load_json(path_from_output(outputs, "latestBleedRepairPreflight"))

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    baseline_id = str(manifest.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    json_path = baseline_dir / f"audio-listen-decision-matrix-{slug}-{timestamp}.json"
    md_path = baseline_dir / f"audio-listen-decision-matrix-{slug}-{timestamp}.md"

    rows = collect_window_rows(
        outputs=outputs,
        review_packet=review_packet,
        proof_comparison=proof_comparison,
        bleed_audit=bleed_audit,
        repair_workorder=repair_workorder,
    )
    matrix = {
        "schema": "quipsly.audio-workbench.listen-decision-matrix.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "approvalStatus": manifest.get("approvalStatus"),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "repairPreflight": output_path(outputs.get("latestBleedRepairPreflight")),
        "repairPreflightMarkdown": output_path(outputs.get("latestBleedRepairPreflightMarkdown")),
        "repairPreflightSafeToRender": bool(repair_preflight.get("safeToRender")),
        "repairPreflightRenderAttempted": bool(repair_preflight.get("renderAttempted")),
        "reviewWindowCount": len(rows),
        "criticalListenWindowCount": sum(1 for row in rows if row.get("criticalListen")),
        "reviewWindows": rows,
        "commands": build_commands(baseline_dir, rows),
        "markdown": str(md_path),
        "json": str(json_path),
        "nonMutationRule": "This artifact records review guidance only; it does not approve, render, or mutate source media.",
    }

    write_json(json_path, matrix)
    md_path.write_text(render_markdown(matrix) + "\n", encoding="utf-8")

    outputs["latestListenDecisionMatrix"] = str(json_path)
    outputs["latestListenDecisionMatrixMarkdown"] = str(md_path)
    history = outputs.setdefault("listenDecisionMatrices", [])
    if str(json_path) not in history:
        history.append(str(json_path))
    manifest["listenDecisionMatrixCount"] = len(history)
    manifest["latestListenDecisionMatrixGeneratedAt"] = timestamp
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    print(f"Wrote {md_path}")
    print(f"Wrote {json_path}")
    print(f"Review windows: {len(rows)}")
    print(f"Critical-listen windows: {matrix['criticalListenWindowCount']}")
    print("Approval state changed: false")


if __name__ == "__main__":
    main()
