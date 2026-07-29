#!/usr/bin/env python3
"""Rehearse the Episode 4 post-failure / focused-proof runway.

This is the sibling to the post-approval render rehearsal. It proves that if
Charlie's human listen does not approve the v006 audio spine, the control plane
routes that decision into scoped v007 repair or focused-proof planning without
approving audio, unlocking branch renders, rendering media, uploading,
publishing, or mutating original files.
"""

from __future__ import annotations

import argparse
import html
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


OUTPUT_STEM = "AUDIO_POST_FAILURE_REPAIR_REHEARSAL"


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


def repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def safe_slug(value: Any) -> str:
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
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedJsonPath"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate:
                return candidate
    return None


def synthetic_queue(kind: str) -> dict[str, Any]:
    repair_actions: list[dict[str, Any]] = []
    focused_proof_actions: list[dict[str, Any]] = []
    pass_context_actions: list[dict[str, Any]] = []

    if kind in {"repair", "mixed"}:
        repair_actions.append(
            {
                "sourceLabel": "Human listen failure rehearsal",
                "sourceRole": "guarded failed-listen notes",
                "sourceManifestKey": "syntheticPostFailureRepairRehearsal",
                "actionType": "needs-repair",
                "decision": "needs-repair",
                "label": "Echo bleed or over-gate repair window",
                "timecode": "00:34:22.000",
                "sequenceStartSeconds": 2062.0,
                "durationSeconds": 18.0,
                "reviewerNotes": "Synthetic rehearsal: Charlie heard a concrete distraction and wants scoped v007 proof before promotion.",
                "firstMove": "Create a timestamped proof-window candidate for this exact range; do not retune the whole spine first.",
            }
        )

    if kind in {"proof", "mixed"}:
        focused_proof_actions.append(
            {
                "sourceLabel": "Human listen uncertainty rehearsal",
                "sourceRole": "guarded needs-proof notes",
                "sourceManifestKey": "syntheticPostFailureRepairRehearsal",
                "actionType": "needs-proof",
                "decision": "needs-proof",
                "label": "Speaker balance uncertainty window",
                "timecode": "01:09:40.000",
                "sequenceStartSeconds": 4180.0,
                "durationSeconds": 16.0,
                "reviewerNotes": "Synthetic rehearsal: not a failure yet, but the reviewer needs A/B proof before approving.",
                "firstMove": "Create focused A/B proof snippets and keep v006 locked until the uncertainty is resolved.",
            }
        )

    if kind == "mixed":
        pass_context_actions.append(
            {
                "sourceLabel": "Human listen pass context rehearsal",
                "sourceRole": "safe pass context",
                "sourceManifestKey": "syntheticPostFailureRepairRehearsal",
                "actionType": "pass-context",
                "decision": "pass",
                "label": "Passed reference window",
                "timecode": "01:35:10.000",
                "sequenceStartSeconds": 5710.0,
                "durationSeconds": 12.0,
                "reviewerNotes": "Synthetic rehearsal: this nearby context sounded natural and should be preserved.",
            }
        )

    return {
        "schema": "quipsly.audio-workbench.post-review-action-queue.v1",
        "status": "ready-for-review-actions",
        "sourceCount": 1,
        "sourceWithNotesCandidateCount": 1,
        "repairActionCount": len(repair_actions),
        "focusedProofActionCount": len(focused_proof_actions),
        "passContextCount": len(pass_context_actions),
        "repairActions": repair_actions,
        "focusedProofActions": focused_proof_actions,
        "passContextActions": pass_context_actions,
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def build_scenario_baseline(real_manifest: dict[str, Any], scenario_dir: Path, kind: str) -> tuple[Path, Path]:
    if scenario_dir.exists():
        shutil.rmtree(scenario_dir)
    scenario_dir.mkdir(parents=True, exist_ok=True)
    baseline_dir = scenario_dir / "baseline"
    baseline_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(json.dumps(real_manifest))
    outputs = manifest.setdefault("outputs", {})
    queue = synthetic_queue(kind)
    queue_path = scenario_dir / f"{kind}-post-review-action-queue.json"
    queue_md = scenario_dir / f"{kind}-post-review-action-queue.md"
    write_json(queue_path, queue)
    queue_md.write_text(f"# Synthetic {kind} post-review action queue\n\nThis is a rehearsal artifact only.\n", encoding="utf-8")
    outputs["latestAudioPostReviewActionQueue"] = str(queue_path)
    outputs["latestAudioPostReviewActionQueueMarkdown"] = str(queue_md)
    manifest["approvalStatus"] = real_manifest.get("approvalStatus")
    manifest["packageReadyForHumanListen"] = bool(real_manifest.get("packageReadyForHumanListen"))
    manifest["branchInheritanceReady"] = bool(real_manifest.get("branchInheritanceReady"))
    manifest["branchRenderReady"] = bool(real_manifest.get("branchRenderReady"))
    manifest["sandboxPostFailureRepairRehearsalOnly"] = True
    manifest["sandboxScenario"] = kind
    write_json(baseline_dir / "manifest.json", manifest)
    return baseline_dir, queue_path


def run_planner(scenario_baseline: Path) -> dict[str, Any]:
    command = [
        sys.executable or "python3",
        str(repo_root() / "apps" / "QuipslyStudio" / "script" / "audio_workbench_scoped_v007_repair_candidate_planner.py"),
        "--baseline-dir",
        str(scenario_baseline),
    ]
    result = subprocess.run(command, cwd=repo_root(), text=True, capture_output=True, check=False)
    manifest = read_json(scenario_baseline / "manifest.json")
    planner_path = output_path((manifest.get("outputs") or {}).get("latestAudioScopedV007RepairCandidatePlan"))
    planner: dict[str, Any] = {}
    if planner_path and Path(planner_path).exists():
        planner = read_json(Path(planner_path))
    return {
        "returncode": result.returncode,
        "stderrTail": result.stderr[-2400:],
        "plannerPath": planner_path,
        "planner": planner,
    }


def run_scenario(real_manifest: dict[str, Any], root_dir: Path, kind: str) -> dict[str, Any]:
    baseline_dir, queue_path = build_scenario_baseline(real_manifest, root_dir / kind, kind)
    result = run_planner(baseline_dir)
    planner = result.get("planner") if isinstance(result.get("planner"), dict) else {}
    expected_repair = 1 if kind in {"repair", "mixed"} else 0
    expected_proof = 1 if kind in {"proof", "mixed"} else 0
    failures: list[str] = []
    if result.get("returncode") != 0:
        failures.append(f"planner exited {result.get('returncode')}")
    if planner.get("status") != "ready-for-scoped-v007-repair-planning":
        failures.append(f"planner status is {planner.get('status')}")
    if int(planner.get("repairActionCount") or 0) != expected_repair:
        failures.append(f"expected {expected_repair} repair action(s), got {planner.get('repairActionCount')}")
    if int(planner.get("focusedProofActionCount") or 0) != expected_proof:
        failures.append(f"expected {expected_proof} focused-proof action(s), got {planner.get('focusedProofActionCount')}")
    if int(planner.get("plannedItemCount") or 0) < expected_repair + expected_proof:
        failures.append(f"expected at least {expected_repair + expected_proof} plan item(s), got {planner.get('plannedItemCount')}")
    for key in ("approvalStateChanged", "branchStateChanged", "renderAttempted", "branchRenderAttempted", "uploadAttempted", "publicationAttempted", "originalMediaMutated"):
        if bool(planner.get(key)):
            failures.append(f"planner safety flag {key} is true")
    return {
        "kind": kind,
        "status": "ready" if not failures else "needs-attention",
        "passed": not failures,
        "scenarioBaselineDir": str(baseline_dir),
        "queuePath": str(queue_path),
        "plannerPath": result.get("plannerPath"),
        "plannerStatus": planner.get("status"),
        "repairActionCount": int(planner.get("repairActionCount") or 0),
        "focusedProofActionCount": int(planner.get("focusedProofActionCount") or 0),
        "passContextCount": int(planner.get("passContextCount") or 0),
        "plannedItemCount": int(planner.get("plannedItemCount") or 0),
        "nextSafeAction": planner.get("nextSafeAction"),
        "planItems": planner.get("planItems") if isinstance(planner.get("planItems"), list) else [],
        "failureCount": len(failures),
        "failures": failures,
        "stderrTail": result.get("stderrTail"),
    }


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    real_before = read_json(manifest_path)
    baseline_id = str(real_before.get("baselineId") or "audio-baseline")
    slug = safe_slug(baseline_id.replace("episode-4-conformed-production-baseline-", ""))
    generated_at = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    generated_iso = datetime.now(timezone.utc).isoformat()
    versioned_dir = baseline_dir / f"audio-post-failure-repair-rehearsal-{slug}-{generated_at}"
    scenarios_root = versioned_dir / "scenarios"
    scenarios = [run_scenario(real_before, scenarios_root, kind) for kind in ("proof", "repair", "mixed")]
    real_after = read_json(manifest_path)
    real_state_before = {
        "approvalStatus": real_before.get("approvalStatus"),
        "branchInheritanceReady": bool(real_before.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_before.get("branchRenderReady")),
    }
    real_state_after = {
        "approvalStatus": real_after.get("approvalStatus"),
        "branchInheritanceReady": bool(real_after.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_after.get("branchRenderReady")),
    }
    failures = [failure for scenario in scenarios for failure in (scenario.get("failures") or [])]
    real_state_preserved = real_state_before == real_state_after
    if not real_state_preserved:
        failures.append("real baseline approval or branch state changed")
    proof_ready = any(s.get("kind") == "proof" and s.get("passed") and int(s.get("focusedProofActionCount") or 0) > 0 for s in scenarios)
    repair_ready = any(s.get("kind") == "repair" and s.get("passed") and int(s.get("repairActionCount") or 0) > 0 for s in scenarios)
    mixed_ready = any(s.get("kind") == "mixed" and s.get("passed") for s in scenarios)
    if not proof_ready:
        failures.append("focused-proof scenario did not produce a safe proof plan")
    if not repair_ready:
        failures.append("repair scenario did not produce a safe repair plan")
    status = "post-failure-repair-rehearsal-ready" if not failures else "post-failure-repair-rehearsal-needs-attention"
    return {
        "schema": "quipsly.audio-workbench.post-failure-repair-rehearsal.v1",
        "generatedAt": generated_at,
        "generatedIso": generated_iso,
        "baselineDir": str(baseline_dir),
        "baselineId": baseline_id,
        "status": status,
        "passed": not failures,
        "approvalStatus": real_after.get("approvalStatus"),
        "packageReadyForHumanListen": bool(real_after.get("packageReadyForHumanListen")),
        "branchInheritanceReady": bool(real_after.get("branchInheritanceReady")),
        "branchRenderReady": bool(real_after.get("branchRenderReady")),
        "realStateBefore": real_state_before,
        "realStateAfter": real_state_after,
        "realApprovalStatePreserved": real_state_preserved,
        "realBranchStatePreserved": real_state_preserved,
        "scenarioCount": len(scenarios),
        "proofScenarioReady": proof_ready,
        "repairScenarioReady": repair_ready,
        "mixedScenarioReady": mixed_ready,
        "scenarioFailureCount": sum(int(s.get("failureCount") or 0) for s in scenarios),
        "failureCount": len(failures),
        "failures": failures,
        "scenarios": scenarios,
        "nextSafeAction": "If Charlie chooses needs-proof or fail after listening, use the returned notes to regenerate the post-review queue and scoped v007 plan; keep final renders locked until the spine is approved.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
        "versionedDir": str(versioned_dir),
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Episode 4 post-failure repair rehearsal: {report['baselineId']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Passed: `{str(report['passed']).lower()}`",
        f"- Real approval state preserved: `{str(report['realApprovalStatePreserved']).lower()}`",
        f"- Real branch state preserved: `{str(report['realBranchStatePreserved']).lower()}`",
        f"- Proof scenario ready: `{str(report['proofScenarioReady']).lower()}`",
        f"- Repair scenario ready: `{str(report['repairScenarioReady']).lower()}`",
        f"- Mixed scenario ready: `{str(report['mixedScenarioReady']).lower()}`",
        f"- Scenario count: `{report['scenarioCount']}`",
        f"- Failure count: `{report['failureCount']}`",
        "",
        "This rehearsal does not approve audio, unlock branches, render final media, upload, publish, or mutate originals.",
        "",
        "## Why this exists",
        "",
        "If Charlie listens to v006 and says `needs-proof` or `fail`, the system should not start over or unlock final renders. It should route the exact notes into focused proof or scoped v007 repair candidates.",
        "",
        "## Scenario results",
        "",
        "| Scenario | Passed | Repair | Proof | Plans | Planner |",
        "| --- | ---: | ---: | ---: | ---: | --- |",
    ]
    for scenario in report.get("scenarios") or []:
        lines.append(
            f"| `{scenario['kind']}` | `{str(scenario['passed']).lower()}` | `{scenario['repairActionCount']}` | `{scenario['focusedProofActionCount']}` | `{scenario['plannedItemCount']}` | `{scenario.get('plannerPath')}` |"
        )
    if report.get("failures"):
        lines.extend(["", "## Failures", ""])
        lines.extend(f"- {failure}" for failure in report["failures"])
    lines.extend(
        [
            "",
            "## Guardrails",
            "",
            "- Approval state changed: `false`",
            "- Branch state changed: `false`",
            "- Render attempted: `false`",
            "- Branch render attempted: `false`",
            "- Upload attempted: `false`",
            "- Publication attempted: `false`",
            "- Original media mutated: `false`",
            "",
            "## Next safe action",
            "",
            report["nextSafeAction"],
            "",
        ]
    )
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    rows = "".join(
        f"<tr><td>{html.escape(str(s['kind']))}</td><td>{str(s['passed']).lower()}</td><td>{s['repairActionCount']}</td><td>{s['focusedProofActionCount']}</td><td>{s['plannedItemCount']}</td><td><code>{html.escape(str(s.get('plannerPath')))}</code></td></tr>"
        for s in report.get("scenarios") or []
    )
    failures = "".join(f"<li>{html.escape(str(failure))}</li>" for failure in report.get("failures") or []) or "<li>None</li>"
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Episode 4 post-failure repair rehearsal</title>
  <style>
    :root {{ color-scheme: dark; --bg:#111813; --panel:#1a281f; --ink:#f7ecd5; --muted:#b7aa8d; --gold:#f1c84b; --moss:#80c990; --clay:#d27452; --line:rgba(247,236,213,.16); }}
    body {{ margin:0; background:radial-gradient(circle at 12% 0%,rgba(128,201,144,.2),transparent 32rem),var(--bg); color:var(--ink); font:15px/1.5 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif; }}
    main {{ width:min(1120px,calc(100vw - 48px)); margin:34px auto 70px; }}
    section {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg,rgba(255,255,255,.04),rgba(0,0,0,.1)),var(--panel); padding:22px; margin:16px 0; box-shadow:0 24px 70px rgba(0,0,0,.24); }}
    h1 {{ font-size:clamp(34px,6vw,64px); line-height:.92; margin:.15em 0 .35em; }}
    .eyebrow {{ color:var(--gold); letter-spacing:.16em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    .truth {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }}
    .pill {{ border:1px solid var(--line); border-radius:999px; padding:10px 13px; background:rgba(0,0,0,.18); color:var(--muted); }}
    .pill strong {{ color:var(--gold); }}
    table {{ width:100%; border-collapse:collapse; }}
    th,td {{ padding:10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }}
    code {{ color:var(--moss); word-break:break-all; }}
  </style>
</head>
<body>
<main>
  <section>
    <div class=\"eyebrow\">Quipsly Audio Workbench</div>
    <h1>Post-failure repair rehearsal</h1>
    <p>This proves the unhappy path is boring: failed or uncertain listening notes become scoped v007 plans, not accidental final renders.</p>
    <div class=\"truth\">
      <div class=\"pill\"><strong>Status</strong> {html.escape(report['status'])}</div>
      <div class=\"pill\"><strong>Passed</strong> {str(report['passed']).lower()}</div>
      <div class=\"pill\"><strong>Proof ready</strong> {str(report['proofScenarioReady']).lower()}</div>
      <div class=\"pill\"><strong>Repair ready</strong> {str(report['repairScenarioReady']).lower()}</div>
      <div class=\"pill\"><strong>Approval preserved</strong> {str(report['realApprovalStatePreserved']).lower()}</div>
      <div class=\"pill\"><strong>Branch preserved</strong> {str(report['realBranchStatePreserved']).lower()}</div>
    </div>
  </section>
  <section>
    <h2>Scenario results</h2>
    <table><thead><tr><th>Scenario</th><th>Passed</th><th>Repair</th><th>Proof</th><th>Plans</th><th>Planner</th></tr></thead><tbody>{rows}</tbody></table>
  </section>
  <section>
    <h2>Failures</h2>
    <ul>{failures}</ul>
  </section>
  <section>
    <h2>Guardrails</h2>
    <p>No approval, branch unlock, final render, upload, publication, or original-media mutation is allowed here.</p>
    <p><strong>Next:</strong> {html.escape(report['nextSafeAction'])}</p>
  </section>
</main>
</body>
</html>
"""


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open -R {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def update_manifest(baseline_dir: Path, report: dict[str, Any], stable_json: Path, stable_md: Path, stable_html: Path, stable_open: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioPostFailureRepairRehearsal"] = str(stable_json)
    outputs["latestAudioPostFailureRepairRehearsalMarkdown"] = str(stable_md)
    outputs["latestAudioPostFailureRepairRehearsalHtml"] = str(stable_html)
    outputs["latestAudioPostFailureRepairRehearsalOpenCommand"] = str(stable_open)
    history = outputs.setdefault("audioPostFailureRepairRehearsals", [])
    if str(stable_json) not in history:
        history.append(str(stable_json))
    manifest["audioPostFailureRepairRehearsalCount"] = len(history)
    manifest["audioPostFailureRepairRehearsalLatestStatus"] = report["status"]
    manifest["audioPostFailureRepairRehearsalPassed"] = report["passed"]
    manifest["audioPostFailureRepairRehearsalScenarioCount"] = report["scenarioCount"]
    manifest["audioPostFailureRepairRehearsalProofScenarioReady"] = report["proofScenarioReady"]
    manifest["audioPostFailureRepairRehearsalRepairScenarioReady"] = report["repairScenarioReady"]
    manifest["audioPostFailureRepairRehearsalMixedScenarioReady"] = report["mixedScenarioReady"]
    manifest["audioPostFailureRepairRehearsalFailureCount"] = report["failureCount"]
    manifest["audioPostFailureRepairRehearsalRealApprovalStatePreserved"] = report["realApprovalStatePreserved"]
    manifest["audioPostFailureRepairRehearsalRealBranchStatePreserved"] = report["realBranchStatePreserved"]
    manifest["audioPostFailureRepairRehearsalApprovalStateChanged"] = False
    manifest["audioPostFailureRepairRehearsalBranchStateChanged"] = False
    manifest["audioPostFailureRepairRehearsalRenderAttempted"] = False
    manifest["audioPostFailureRepairRehearsalBranchRenderAttempted"] = False
    manifest["audioPostFailureRepairRehearsalUploadAttempted"] = False
    manifest["audioPostFailureRepairRehearsalPublicationAttempted"] = False
    manifest["audioPostFailureRepairRehearsalOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True, type=Path)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    report = build_report(baseline_dir)
    versioned_dir = Path(report["versionedDir"])
    versioned_dir.mkdir(parents=True, exist_ok=True)

    stable_json = baseline_dir / f"{OUTPUT_STEM}.json"
    stable_md = baseline_dir / f"{OUTPUT_STEM}.md"
    stable_html = baseline_dir / f"{OUTPUT_STEM}.html"
    stable_open = baseline_dir / f"OPEN_{OUTPUT_STEM}.command"
    versioned_json = versioned_dir / "post-failure-repair-rehearsal.json"
    versioned_md = versioned_dir / "post-failure-repair-rehearsal.md"
    versioned_html = versioned_dir / "post-failure-repair-rehearsal.html"
    versioned_open = versioned_dir / "open-post-failure-repair-rehearsal.command"

    report["jsonPath"] = str(stable_json)
    report["markdownPath"] = str(stable_md)
    report["htmlPath"] = str(stable_html)
    report["openCommand"] = str(stable_open)
    report["versionedJsonPath"] = str(versioned_json)
    report["versionedMarkdownPath"] = str(versioned_md)
    report["versionedHtmlPath"] = str(versioned_html)
    report["versionedOpenCommand"] = str(versioned_open)

    markdown = render_markdown(report)
    html_doc = render_html(report)
    write_json(stable_json, report)
    write_json(versioned_json, report)
    stable_md.write_text(markdown, encoding="utf-8")
    versioned_md.write_text(markdown, encoding="utf-8")
    stable_html.write_text(html_doc, encoding="utf-8")
    versioned_html.write_text(html_doc, encoding="utf-8")
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(versioned_open, versioned_html, versioned_md)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(json.dumps({"status": report["status"], "passed": report["passed"], "scenarioCount": report["scenarioCount"], "json": str(stable_json)}, indent=2))


if __name__ == "__main__":
    main()
