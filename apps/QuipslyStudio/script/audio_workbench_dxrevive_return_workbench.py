#!/usr/bin/env python3
"""Create a dxRevive return workbench for manual restoration bounces.

The manual dxRevive lane intentionally sits outside the automatic v006 master
until returned bounces exist, validate, and get compared as proof candidates.
This script gathers the packet, validator, validator smoke, proof planner, and
planner smoke into one stable reviewer/agent surface without approving audio,
unlocking branches, rendering branches, uploading, publishing, or mutating
original media.
"""

from __future__ import annotations

import argparse
import html
import json
import os
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


def output_path(value: Any) -> Path | None:
    if isinstance(value, str) and value:
        return Path(value)
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return Path(subvalue)
    return None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path or not path.exists() or path.suffix.lower() != ".json":
        return {}
    try:
        return read_json(path)
    except json.JSONDecodeError:
        return {}


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def e(value: Any) -> str:
    return html.escape(str(value))


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def first_existing_path(*paths: Any) -> str | None:
    for value in paths:
        path = output_path(value)
        if path and path.exists():
            return str(path)
    return None


def summarize_return(stem: dict[str, Any], validation_by_key: dict[str, dict[str, Any]]) -> dict[str, Any]:
    key = str(stem.get("key") or "unknown-stem")
    validation = validation_by_key.get(key, {})
    probe = stem.get("probe") if isinstance(stem.get("probe"), dict) else {}
    returned_path = str(stem.get("expectedReturnPath") or validation.get("returnedPath") or "")
    return {
        "key": key,
        "sourcePath": str(stem.get("sourcePath") or ""),
        "packetPath": str(stem.get("packetPath") or ""),
        "expectedReturnPath": returned_path,
        "sourceDurationSeconds": probe.get("durationSeconds"),
        "sourceSampleRate": probe.get("sampleRate"),
        "sourceChannels": probe.get("channels"),
        "validationStatus": str(validation.get("status") or "not-yet-validated"),
        "valid": bool(validation.get("valid")),
        "durationDeltaSeconds": validation.get("durationDeltaSeconds"),
        "errors": validation.get("errors") if isinstance(validation.get("errors"), list) else [],
        "warnings": validation.get("warnings") if isinstance(validation.get("warnings"), list) else [],
        "returnedExists": bool(returned_path and Path(returned_path).exists()),
    }


def determine_status(validation: dict[str, Any], validator_smoke: dict[str, Any], planner: dict[str, Any], planner_smoke: dict[str, Any]) -> tuple[str, str]:
    expected = int_value(validation.get("expectedCount"))
    validated = int_value(validation.get("validatedCount"))
    missing = int_value(validation.get("missingCount"))
    errors = int_value(validation.get("errorCount"))
    validation_status = str(validation.get("status") or "missing-validation")
    planner_status = str(planner.get("status") or "missing-planner")
    if not validation:
        return "missing-validation", "Generate or repair dxRevive bounce validation before restoration can be considered."
    if not bool(validator_smoke.get("passed")):
        return "validator-smoke-needs-attention", "Repair validator smoke before trusting returned restoration bounces."
    if missing > 0 or validation_status == "waiting-for-bounces":
        return "waiting-for-bounces", "Run the manual dxRevive/Logic bounce pass, place returned files in the packet return-bounces folder, then rerun validation and this workbench."
    if errors > 0:
        return "invalid-bounces-need-repair", "Reject invalid returned bounces or recreate them without changing duration, sample rate, or channel count."
    if expected > 0 and validated == expected and not bool(planner_smoke.get("passed")):
        return "planner-smoke-needs-attention", "Returned bounces validate, but the proof planner smoke must pass before A/B proof candidates are trusted."
    if expected > 0 and validated == expected and planner_status != "waiting-for-validated-dxrevive-bounces":
        return "validated-bounces-ready-for-proof-candidate-review", "Use the proof candidate planner outputs to audition returned restoration against v006 before any promotion."
    if expected > 0 and validated == expected:
        return "validated-bounces-ready-for-proof-candidate-planning", "Regenerate the dxRevive proof candidate planner so validated returned bounces become proof-only comparison windows."
    return "needs-human-routing", "Open the workbench and route the exact restoration state before changing audio."


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# dxRevive Return Workbench",
        "",
        f"Generated: `{report['generatedAt']}`",
        f"Baseline: `{report['baselineId']}`",
        "",
        "This is the control surface for the optional dxRevive/manual restoration path. It does not approve v006, replace v006, unlock branch inheritance, render branches, upload, publish, or mutate original media.",
        "",
        "## Current truth",
        "",
        f"- Status: `{report['status']}`",
        f"- Approval status: `{report['approvalStatus']}`",
        f"- Branch inheritance ready: `{str(report['branchInheritanceReady']).lower()}`",
        f"- Branch render ready: `{str(report['branchRenderReady']).lower()}`",
        f"- Expected returned bounces: `{report['expectedCount']}`",
        f"- Present returned bounces: `{report['presentCount']}`",
        f"- Validated returned bounces: `{report['validatedCount']}`",
        f"- Missing returned bounces: `{report['missingCount']}`",
        f"- Validator smoke passed: `{str(report['validatorSmokePassed']).lower()}`",
        f"- Proof planner status: `{report['plannerStatus']}`",
        f"- Proof planner smoke passed: `{str(report['plannerSmokePassed']).lower()}`",
        "",
        "## Open surfaces",
        "",
        f"- Manual bounce packet: `{report['manualBouncePacketMarkdown'] or 'not registered'}`",
        f"- Return folder: `{report['returnDir'] or 'not registered'}`",
        f"- Bounce validation: `{report['bounceValidationMarkdown'] or 'not registered'}`",
        f"- Validator smoke: `{report['validatorSmokeMarkdown'] or 'not registered'}`",
        f"- Proof candidate planner: `{report['proofCandidatePlannerMarkdown'] or 'not registered'}`",
        f"- Proof planner smoke: `{report['proofCandidatePlannerSmokeMarkdown'] or 'not registered'}`",
        "",
        "## Expected return bounces",
        "",
        "| Stem | Status | Expected return | Source duration | Notes |",
        "|---|---:|---|---:|---|",
    ]
    for item in report["stems"]:
        notes = []
        if item["errors"]:
            notes.append("errors: " + "; ".join(str(x) for x in item["errors"]))
        if item["warnings"]:
            notes.append("warnings: " + "; ".join(str(x) for x in item["warnings"]))
        if not notes and not item["returnedExists"]:
            notes.append("waiting for returned bounce")
        lines.append(
            f"| `{item['key']}` | `{item['validationStatus']}` | `{item['expectedReturnPath']}` | `{item.get('sourceDurationSeconds') or 'n/a'}` | {'; '.join(notes)} |"
        )
    lines.extend(["", "## Next safe actions", ""])
    for action in report["nextSafeActions"]:
        lines.append(f"- {action}")
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            f"- Approval state changed: `{str(report['approvalStateChanged']).lower()}`",
            f"- Branch state changed: `{str(report['branchStateChanged']).lower()}`",
            f"- Render attempted: `{str(report['renderAttempted']).lower()}`",
            f"- Upload attempted: `{str(report['uploadAttempted']).lower()}`",
            f"- Publication attempted: `{str(report['publicationAttempted']).lower()}`",
            f"- Original media mutated: `{str(report['originalMediaMutated']).lower()}`",
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    stem_rows = []
    for item in report["stems"]:
        status_class = "ok" if item["valid"] else "missing" if not item["returnedExists"] else "warn"
        notes = "; ".join([*(str(x) for x in item["errors"]), *(str(x) for x in item["warnings"])]) or ("waiting for returned bounce" if not item["returnedExists"] else "ready")
        stem_rows.append(
            f"""
            <article class=\"stem {status_class}\">
              <div class=\"status\">{e(item['validationStatus'])}</div>
              <h3>{e(item['key'])}</h3>
              <p><strong>Expected return</strong><br><code>{e(item['expectedReturnPath'])}</code></p>
              <p><strong>Source</strong><br><code>{e(item['sourcePath'])}</code></p>
              <p>{e(notes)}</p>
            </article>
            """
        )
    actions = "".join(f"<li>{e(action)}</li>" for action in report["nextSafeActions"])
    link_cards = []
    for label, key in [
        ("Manual bounce packet", "manualBouncePacketMarkdown"),
        ("Return folder", "returnDir"),
        ("Bounce validation", "bounceValidationMarkdown"),
        ("Validator smoke", "validatorSmokeMarkdown"),
        ("Proof candidate planner", "proofCandidatePlannerMarkdown"),
        ("Proof planner smoke", "proofCandidatePlannerSmokeMarkdown"),
    ]:
        path = report.get(key)
        if path:
            href = Path(path).as_uri() if Path(path).exists() else "#"
            link_cards.append(f"<a class=\"linkcard\" href=\"{e(href)}\"><strong>{e(label)}</strong><span>{e(path)}</span></a>")
        else:
            link_cards.append(f"<div class=\"linkcard missing\"><strong>{e(label)}</strong><span>not registered</span></div>")
    return f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<title>dxRevive Return Workbench</title>
<style>
:root {{ color-scheme: dark; --bg:#101711; --panel:#17251c; --panel2:#213426; --ink:#f5ecd7; --muted:#beb39d; --gold:#efc84a; --moss:#75d28a; --clay:#d97050; --sky:#6fc6d8; --line:rgba(245,236,215,.16); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,\"Avenir Next\",\"Segoe UI\",sans-serif; background:radial-gradient(circle at top left, rgba(117,210,138,.18), transparent 30rem), radial-gradient(circle at bottom right, rgba(239,200,74,.14), transparent 34rem), var(--bg); }}
main {{ width:min(1380px, calc(100vw - 48px)); margin:32px auto 60px; }}
.hero {{ border:1px solid var(--line); border-radius:30px; padding:30px; background:linear-gradient(135deg, rgba(239,200,74,.12), rgba(117,210,138,.08)), var(--panel); box-shadow:0 28px 90px rgba(0,0,0,.36); }}
.eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-weight:900; font-size:12px; }}
h1 {{ margin:.2em 0; font-size:clamp(34px,5vw,68px); line-height:.95; letter-spacing:-.05em; }}
.truth {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
.pill {{ border:1px solid var(--line); background:rgba(0,0,0,.22); padding:10px 14px; border-radius:999px; color:var(--muted); }}
.pill strong {{ color:var(--ink); }}
section {{ margin-top:24px; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; }}
.linkgrid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:10px; }}
.linkcard, .stem {{ border:1px solid var(--line); background:rgba(23,37,28,.88); border-radius:22px; padding:16px; display:grid; gap:8px; }}
.linkcard {{ color:var(--ink); text-decoration:none; }}
.linkcard span {{ color:var(--muted); font-size:12px; overflow-wrap:anywhere; }}
.status {{ display:inline-flex; width:fit-content; border-radius:999px; padding:6px 10px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; background:rgba(239,200,74,.14); color:var(--gold); }}
.stem.ok {{ border-color:rgba(117,210,138,.44); }}
.stem.warn {{ border-color:rgba(239,200,74,.44); }}
.stem.missing, .linkcard.missing {{ border-color:rgba(217,112,80,.5); }}
code {{ color:var(--sky); overflow-wrap:anywhere; }}
ol {{ border:1px solid var(--line); border-radius:24px; padding:20px 20px 20px 42px; background:rgba(0,0,0,.18); }}
li {{ margin:10px 0; }}
footer {{ color:var(--muted); margin-top:28px; }}
</style>
</head>
<body>
<main>
  <div class=\"hero\">
    <div class=\"eyebrow\">Quipsly Audio Workbench</div>
    <h1>dxRevive return workbench</h1>
    <p>This is the honest bridge between manual restoration bounces and proof-candidate comparison. If bounces are missing, it says so. If they validate, it routes proof. It does not sneak restored audio into v006.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Status</strong> {e(report['status'])}</div>
      <div class=\"pill\"><strong>Expected</strong> {report['expectedCount']}</div>
      <div class=\"pill\"><strong>Validated</strong> {report['validatedCount']}</div>
      <div class=\"pill\"><strong>Missing</strong> {report['missingCount']}</div>
      <div class=\"pill\"><strong>Branch render</strong> {str(report['branchRenderReady']).lower()}</div>
    </div>
  </div>
  <section><h2>Open surfaces</h2><div class=\"linkgrid\">{''.join(link_cards)}</div></section>
  <section><h2>Expected returned bounces</h2><div class=\"grid\">{''.join(stem_rows)}</div></section>
  <section><h2>Next safe actions</h2><ol>{actions}</ol></section>
  <footer>Generated {e(report['generatedAt'])}. Approval, branches, renders, uploads, publication, and original media remain unchanged.</footer>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, markdown_path: Path) -> None:
    path.write_text(
        "\n".join([
            "#!/bin/zsh",
            "set -euo pipefail",
            f"open {shell_quote(str(html_path))}",
            f"open {shell_quote(str(markdown_path))}",
        ]) + "\n",
        encoding="utf-8",
    )
    os.chmod(path, 0o755)


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    packet = load_output_report(outputs, "latestDxReviveManualBouncePacket")
    validation = load_output_report(outputs, "latestDxReviveBounceValidation")
    validator_smoke = load_output_report(outputs, "latestDxReviveBounceValidatorSmoke")
    planner = load_output_report(outputs, "latestDxReviveProofCandidatePlanner")
    planner_smoke = load_output_report(outputs, "latestDxReviveProofCandidatePlannerSmoke")
    validation_by_key = {
        str(item.get("key")): item
        for item in validation.get("results") or []
        if isinstance(item, dict)
    }
    stems = [summarize_return(stem, validation_by_key) for stem in packet.get("treatmentStems") or [] if isinstance(stem, dict)]
    status, next_action = determine_status(validation, validator_smoke, planner, planner_smoke)
    expected_count = int_value(validation.get("expectedCount")) or len(stems)
    present_count = int_value(validation.get("presentCount"))
    validated_count = int_value(validation.get("validatedCount"))
    missing_count = int_value(validation.get("missingCount")) if validation else sum(1 for stem in stems if not stem["returnedExists"])
    return_dir = str(packet.get("returnDir") or outputs.get("latestDxReviveManualBouncePacketReturnDir") or "")
    safe_actions = [
        next_action,
        "Keep v006 as the current machine candidate until returned bounces validate and a proof candidate beats it by ear.",
        "Use only derived treatment stems in the bounce packet; never process or replace original media.",
        "After returned files appear, rerun bounce validation, proof candidate planning, producer command center, START_HERE, handoff index, review gate, and goal audit.",
    ]
    if status == "waiting-for-bounces" and return_dir:
        safe_actions.insert(1, f"Put returned files in: {return_dir}")
    return {
        "schema": "quipsly.audio-workbench.dxrevive-return-workbench.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": str(manifest.get("baselineId") or "audio-baseline"),
        "approvalStatus": manifest.get("approvalStatus"),
        "packageReadyForHumanListen": bool(manifest.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(manifest.get("branchInheritanceReady")),
        "branchRenderReady": bool(manifest.get("branchRenderReady")),
        "status": status,
        "nextSafeActions": safe_actions,
        "expectedCount": expected_count,
        "presentCount": present_count,
        "validatedCount": validated_count,
        "missingCount": missing_count,
        "validatorSmokePassed": bool(validator_smoke.get("passed")),
        "plannerStatus": str(planner.get("status") or "not-generated"),
        "plannerSmokePassed": bool(planner_smoke.get("passed")),
        "manualBouncePacketMarkdown": first_existing_path(outputs.get("latestDxReviveManualBouncePacketMarkdown")),
        "manualBouncePacketOpenCommand": first_existing_path(outputs.get("latestDxReviveManualBouncePacketOpenCommand")),
        "returnDir": return_dir,
        "bounceValidationMarkdown": first_existing_path(outputs.get("latestDxReviveBounceValidationMarkdown")),
        "validatorSmokeMarkdown": first_existing_path(outputs.get("latestDxReviveBounceValidatorSmokeMarkdown")),
        "proofCandidatePlannerMarkdown": first_existing_path(outputs.get("latestDxReviveProofCandidatePlannerMarkdown")),
        "proofCandidatePlannerSmokeMarkdown": first_existing_path(outputs.get("latestDxReviveProofCandidatePlannerSmokeMarkdown")),
        "stems": stems,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest_before = read_json(manifest_path)
    baseline_id = str(manifest_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output_dir = baseline_dir / f"dxrevive-return-workbench-{slug}-{generated_at}"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_json = output_dir / "dxrevive-return-workbench.json"
    output_md = output_dir / "dxrevive-return-workbench.md"
    output_html = output_dir / "dxrevive-return-workbench.html"
    output_open = output_dir / "open-dxrevive-return-workbench.command"
    stable_json = baseline_dir / "DXREVIVE_RETURN_WORKBENCH.json"
    stable_md = baseline_dir / "DXREVIVE_RETURN_WORKBENCH.md"
    stable_html = baseline_dir / "DXREVIVE_RETURN_WORKBENCH.html"
    stable_open = baseline_dir / "OPEN_DXREVIVE_RETURN_WORKBENCH.command"

    report = build_report(manifest_before, baseline_dir, generated_at)
    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(output_json, report)
    output_md.write_text(markdown + "\n", encoding="utf-8")
    output_html.write_text(html_doc, encoding="utf-8")
    write_open_command(output_open, output_html, output_md)
    write_json(stable_json, report)
    stable_md.write_text(markdown + "\n", encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)

    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(output_json),
        "versionedMarkdownPath": str(output_md),
        "versionedHtmlPath": str(output_html),
        "versionedOpenCommand": str(output_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "expectedCount": report["expectedCount"],
        "validatedCount": report["validatedCount"],
        "missingCount": report["missingCount"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("dxReviveReturnWorkbenches", [])
    history.append(entry)
    outputs["latestDxReviveReturnWorkbench"] = entry
    outputs["latestDxReviveReturnWorkbenchMarkdown"] = str(stable_md)
    outputs["latestDxReviveReturnWorkbenchHtml"] = str(stable_html)
    outputs["latestDxReviveReturnWorkbenchOpenCommand"] = str(stable_open)
    manifest["dxReviveReturnWorkbenchCount"] = len(history)
    manifest["dxReviveReturnWorkbenchStatus"] = report["status"]
    manifest["dxReviveReturnWorkbenchExpectedCount"] = report["expectedCount"]
    manifest["dxReviveReturnWorkbenchValidatedCount"] = report["validatedCount"]
    manifest["dxReviveReturnWorkbenchMissingCount"] = report["missingCount"]
    manifest["approvalStatus"] = manifest_before.get("approvalStatus")
    manifest["branchInheritanceReady"] = bool(manifest_before.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(manifest_before.get("branchRenderReady"))
    write_json(manifest_path, manifest)

    print(json.dumps({
        "baselineId": baseline_id,
        "status": report["status"],
        "expectedCount": report["expectedCount"],
        "validatedCount": report["validatedCount"],
        "missingCount": report["missingCount"],
        "json": str(stable_json),
        "markdown": str(stable_md),
        "html": str(stable_html),
        "openCommand": str(stable_open),
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "originalMediaMutated": False,
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
