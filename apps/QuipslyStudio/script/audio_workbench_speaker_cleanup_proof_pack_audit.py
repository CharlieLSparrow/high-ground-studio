#!/usr/bin/env python3
"""Audit the focused speaker-cleanup proof pack for completeness.

The proof pack renders A/B snippets. This audit verifies that those snippets are
complete, non-empty, mechanically playable, duration-sane, and still guarded by
the current human-listen/branch-lock truth. It writes evidence only. It does not
approve audio, fail audio, render branches, upload files, or mutate original
media.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


EXPECTED_ROLES = (
    "master",
    "charlie-aligned",
    "charlie-contribution",
    "homer-aligned",
    "homer-contribution",
    "reference-contribution",
)
MIN_FOCUS_WINDOWS = 15
DURATION_TOLERANCE_SECONDS = 0.65


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


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for subkey in ("path", "markdownPath", "htmlPath", "jsonPath"):
            subvalue = value.get(subkey)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "speaker-cleanup-proof-pack"


def run_capture(command: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)


def ffprobe_duration(path: Path) -> float | None:
    proc = run_capture(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nokey=1:noprint_wrappers=1",
            str(path),
        ]
    )
    if proc.returncode != 0:
        return None
    try:
        return float(proc.stdout.strip())
    except ValueError:
        return None


def check_file(path_text: Any) -> tuple[bool, Path | None, int | None]:
    if not isinstance(path_text, str) or not path_text:
        return False, None, None
    path = Path(path_text)
    if not path.exists() or not path.is_file():
        return False, path, None
    return path.stat().st_size > 0, path, path.stat().st_size


def sorted_role_gap(actual_roles: set[str]) -> list[str]:
    return [role for role in EXPECTED_ROLES if role not in actual_roles]


def audit_window(window: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    snippets = window.get("snippets") if isinstance(window.get("snippets"), list) else []
    expected_duration = float(window.get("durationSeconds") or 0.0)
    actual_roles = {str(item.get("role") or "") for item in snippets if isinstance(item, dict)}
    missing_roles = sorted_role_gap(actual_roles)
    if missing_roles:
        errors.append("missing snippet roles: " + ", ".join(missing_roles))
    if len(snippets) < len(EXPECTED_ROLES):
        errors.append(f"expected at least {len(EXPECTED_ROLES)} snippets, found {len(snippets)}")

    snippet_checks: list[dict[str, Any]] = []
    for snippet in snippets:
        if not isinstance(snippet, dict):
            errors.append("snippet is not an object")
            continue
        role = str(snippet.get("role") or "unknown")
        label = str(snippet.get("label") or role)
        ok = bool(snippet.get("ok"))
        path_ok, snippet_path, size = check_file(snippet.get("path"))
        probed_duration = ffprobe_duration(snippet_path) if path_ok and snippet_path else None
        manifest_duration = snippet.get("durationSeconds")
        duration_delta = None
        if probed_duration is not None and expected_duration > 0:
            duration_delta = abs(probed_duration - expected_duration)
            if duration_delta > DURATION_TOLERANCE_SECONDS:
                warnings.append(
                    f"{label} duration differs from window by {duration_delta:.3f}s "
                    f"({probed_duration:.3f}s vs {expected_duration:.3f}s)"
                )
        if not ok:
            errors.append(f"{label} is marked not ok")
        if not path_ok:
            errors.append(f"{label} file missing or empty: {snippet.get('path')}")
        if probed_duration is None:
            errors.append(f"{label} has no ffprobe duration")
        snippet_checks.append(
            {
                "role": role,
                "label": label,
                "markedOk": ok,
                "path": str(snippet_path) if snippet_path else snippet.get("path"),
                "existsAndNonzero": path_ok,
                "sizeBytes": size,
                "manifestDurationSeconds": manifest_duration,
                "probedDurationSeconds": round(probed_duration, 3) if probed_duration is not None else None,
                "expectedWindowDurationSeconds": round(expected_duration, 3),
                "durationDeltaSeconds": round(duration_delta, 3) if duration_delta is not None else None,
            }
        )
    return {
        "windowIndex": window.get("index"),
        "timecode": window.get("timecode"),
        "reason": window.get("reason"),
        "expectedDurationSeconds": round(expected_duration, 3),
        "snippetCount": len(snippets),
        "missingRoles": missing_roles,
        "errors": errors,
        "warnings": warnings,
        "passed": not errors,
        "snippetChecks": snippet_checks,
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Speaker Cleanup Proof Pack Audit: {report['baselineId']}",
        "",
        f"Generated: `{report['generatedAt']}`",
        "",
        "This audit verifies that the speaker-cleanup A/B proof pack is complete enough to trust for human listening. It is evidence only: no approval, no branch unlock, no edit render, no upload, and no source-media mutation.",
        "",
        "## Summary",
        "",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Focus windows audited: `{report['focusWindowCount']}`",
        f"- Snippets audited: `{report['snippetCount']}`",
        f"- Error count: `{report['errorCount']}`",
        f"- Warning count: `{report['warningCount']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Package ready for human listen: `{str(report['packageReadyForHumanListen']).lower()}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
        "",
        "## Pack paths",
        "",
        f"- JSON: `{report['proofPackJson']}`",
        f"- Markdown: `{report['proofPackMarkdown']}`",
        f"- HTML: `{report['proofPackHtml']}`",
        f"- Playlist: `{report['proofPackPlaylist']}`",
        "",
        "## Window checks",
        "",
        "| # | Time | Passed | Snippets | Missing roles | Errors | Warnings |",
        "|---:|---|---:|---:|---|---|---|",
    ]
    for window in report["windowChecks"]:
        lines.append(
            "| {index} | {timecode} | `{passed}` | `{snippets}` | {missing} | {errors} | {warnings} |".format(
                index=window.get("windowIndex"),
                timecode=window.get("timecode") or "",
                passed=str(window.get("passed")).lower(),
                snippets=window.get("snippetCount"),
                missing=", ".join(window.get("missingRoles") or []) or "-",
                errors="<br>".join(window.get("errors") or []) or "-",
                warnings="<br>".join(window.get("warnings") or []) or "-",
            )
        )
    lines.extend(
        [
            "",
            "## Meaning",
            "",
            "A passing audit means the proof pack is mechanically complete and the reviewer can compare the mastered spine against raw aligned and gated contribution stems without hunting for missing files. It still does not mean the audio is approved; only human listening can unlock branch inheritance.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    outputs = manifest_before.setdefault("outputs", {})
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    proof_pack_json = output_path(outputs.get("latestSpeakerCleanupProofPack"))
    proof_pack_markdown = output_path(outputs.get("latestSpeakerCleanupProofPackMarkdown"))
    proof_pack_html = output_path(outputs.get("latestSpeakerCleanupProofPackHtml"))
    proof_pack_playlist = output_path(outputs.get("latestSpeakerCleanupProofPackPlaylist"))
    path_errors: list[str] = []
    for label, path in (
        ("proof pack JSON", proof_pack_json),
        ("proof pack Markdown", proof_pack_markdown),
        ("proof pack HTML", proof_pack_html),
        ("proof pack playlist", proof_pack_playlist),
    ):
        if not path or not path.exists() or path.stat().st_size <= 0:
            path_errors.append(f"missing or empty {label}: {path}")
    if not proof_pack_json or not proof_pack_json.exists():
        raise FileNotFoundError("Missing latestSpeakerCleanupProofPack JSON in manifest outputs")

    proof_pack = read_json(proof_pack_json)
    windows = proof_pack.get("windows") if isinstance(proof_pack.get("windows"), list) else []
    window_checks = [audit_window(window) for window in windows if isinstance(window, dict)]
    snippet_count = sum(int(item.get("snippetCount") or 0) for item in window_checks)
    errors = [*path_errors]
    warnings: list[str] = []
    if str(proof_pack.get("baselineId")) != baseline_id:
        errors.append(f"proof pack baselineId {proof_pack.get('baselineId')} does not match manifest baselineId {baseline_id}")
    if len(window_checks) < MIN_FOCUS_WINDOWS:
        errors.append(f"expected at least {MIN_FOCUS_WINDOWS} focus windows, found {len(window_checks)}")
    if int(proof_pack.get("renderFailureCount") or 0) != 0:
        errors.append(f"proof pack reports render failures: {proof_pack.get('renderFailureCount')}")
    if int(proof_pack.get("renderSuccessCount") or 0) != snippet_count:
        warnings.append(f"proof pack renderSuccessCount {proof_pack.get('renderSuccessCount')} differs from audited snippet count {snippet_count}")
    if proof_pack.get("approvalStateChanged") is not False:
        errors.append("proof pack did not preserve approval state")
    if proof_pack.get("branchStateChanged") is not False:
        errors.append("proof pack did not preserve branch state")
    if proof_pack.get("originalMediaMutated") is not False:
        errors.append("proof pack reports original media mutation")
    if proof_pack.get("branchInheritanceReady") is not False:
        errors.append("proof pack unexpectedly marks branch inheritance ready")
    if proof_pack.get("branchRenderReady") is not False:
        errors.append("proof pack unexpectedly marks branch render ready")

    for window in window_checks:
        errors.extend(f"window {window.get('windowIndex')}: {error}" for error in window.get("errors") or [])
        warnings.extend(f"window {window.get('windowIndex')}: {warning}" for warning in window.get("warnings") or [])

    passed = not errors
    out_dir = baseline_dir / f"speaker-cleanup-proof-pack-audit-{slug}-{generated_at}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_json = out_dir / "speaker-cleanup-proof-pack-audit.json"
    report_md = out_dir / "speaker-cleanup-proof-pack-audit.md"

    report = {
        "schema": "quipsly.audio.speaker-cleanup-proof-pack-audit.v1",
        "generatedAt": generated_at,
        "baselineId": baseline_id,
        "baselineDir": str(baseline_dir),
        "passed": passed,
        "focusWindowCount": len(window_checks),
        "minimumFocusWindowCount": MIN_FOCUS_WINDOWS,
        "snippetCount": snippet_count,
        "errorCount": len(errors),
        "warningCount": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "windowChecks": window_checks,
        "proofPackJson": str(proof_pack_json),
        "proofPackMarkdown": str(proof_pack_markdown) if proof_pack_markdown else None,
        "proofPackHtml": str(proof_pack_html) if proof_pack_html else None,
        "proofPackPlaylist": str(proof_pack_playlist) if proof_pack_playlist else None,
        "approvalStatus": manifest_before.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest_before.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest_before.get("branchRenderReady")),
        "originalMediaMutated": False,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "json": str(report_json),
        "markdown": str(report_md),
    }
    write_json(report_json, report)
    report_md.write_text(render_markdown(report), encoding="utf-8")

    manifest_after = read_json(manifest_path)
    outputs_after = manifest_after.setdefault("outputs", {})
    outputs_after["latestSpeakerCleanupProofPackAudit"] = str(report_json)
    outputs_after["latestSpeakerCleanupProofPackAuditMarkdown"] = str(report_md)
    history = outputs_after.setdefault("speakerCleanupProofPackAudits", [])
    if isinstance(history, list):
        history.append(str(report_json))
    manifest_after["speakerCleanupProofPackAuditCount"] = int(manifest_after.get("speakerCleanupProofPackAuditCount") or 0) + 1
    manifest_after["speakerCleanupProofPackAuditPassed"] = passed
    manifest_after["speakerCleanupProofPackAuditErrorCount"] = len(errors)
    manifest_after["speakerCleanupProofPackAuditWarningCount"] = len(warnings)
    manifest_after["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest_after["packageReadyForHumanListen"] = bool(manifest_before.get("packageReadyForHumanListen"))
    manifest_after["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest_after["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest_after)

    print(f"Wrote {report_md}")
    print(f"passed={passed} windows={len(window_checks)} snippets={snippet_count} errors={len(errors)} warnings={len(warnings)}")
    if not passed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
