#!/usr/bin/env python3
"""Build a non-mutating Episode sync decision rehearsal packet.

This rehearses possible Episode sync decisions from the latest sync control room.
It writes versioned review guidance only. It does not execute decisions, trim,
re-stack, render, publish, upload, schedule, overwrite, delete, approve, create
receipts, or mutate source/original media.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-sync-decision-rehearsal.v1"
POINTER_SCHEMA = "quipsly.studio-sync-decision-rehearsal.latest-pointer.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-sync-decision-rehearsal")


def load_json(path: Path, *, resolve_pointer: bool = True) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(payload, dict):
        return {}
    if resolve_pointer and payload.get("jsonPath"):
        target = Path(str(payload.get("jsonPath") or ""))
        if target.exists() and target != path:
            target_payload = load_json(target, resolve_pointer=False)
            if target_payload:
                return {**payload, **target_payload}
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def format_hms(seconds: float) -> str:
    seconds = max(0, int(round(seconds)))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def pointer_and_control_room(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "review-board" / "latest-sync-control-room.json"
    pointer = load_json(pointer_path, resolve_pointer=False)
    target = Path(str(pointer.get("jsonPath") or ""))
    control = load_json(target, resolve_pointer=False) if target.exists() else {}
    if not control:
        control = load_json(pointer_path)
    return pointer, control, pointer_path


def decision_category(decision_id: str, label: str) -> str:
    probe = f"{decision_id} {label}".lower()
    if "trim" in probe:
        return "trim-candidate"
    if "restack" in probe or "re-stack" in probe or "rebuild" in probe:
        return "restack-or-rebuild"
    if "hold" in probe:
        return "hold-for-resync"
    if "continue" in probe or "approval" in probe:
        return "continue-review"
    return "review-classification"


def risk_for_category(category: str) -> str:
    if category == "trim-candidate":
        return "high-requires-human-tail-confirmation"
    if category == "continue-review":
        return "medium-requires-human-sync-confidence"
    if category == "restack-or-rebuild":
        return "medium-local-versioning-work-after-review"
    if category == "hold-for-resync":
        return "low-safe-hold-state-after-review"
    return "review-only"


def recommended_when(category: str) -> str:
    if category == "hold-for-resync":
        return "Use when snippets suggest the audio tail is real content, wrong source, drifted sync, or otherwise not safe to trim."
    if category == "restack-or-rebuild":
        return "Use after a human decides the package should be rebuilt from whole sources/proxies rather than repaired by trimming."
    if category == "trim-candidate":
        return "Use only after a human confirms the extra audio tail is expendable dead air, duplicate audio, or non-episode material."
    if category == "continue-review":
        return "Use only when a human says the mismatch is understood and does not block normal review."
    return "Use after comparing the sync snippets and documenting why this path is safe."


def rehearsal_from_decision(row: dict[str, Any]) -> dict[str, Any]:
    decision_id = str(row.get("id") or row.get("label") or "decision")
    label = str(row.get("label") or decision_id)
    category = decision_category(decision_id, label)
    dry_run_command = str(row.get("dryRunCommand") or "")
    return {
        "id": decision_id,
        "label": label,
        "category": category,
        "risk": risk_for_category(category),
        "recommendedWhen": recommended_when(category),
        "dryRunCommand": dry_run_command,
        "safeToRunWithoutApproval": False,
        "requiresHumanClassification": True,
        "wouldExecuteDecision": False,
        "wouldCreateExport": False,
        "wouldMutateSources": False,
        "wouldPublish": False,
        "wouldOverwriteVersion": False,
        "simulatedOutcome": {
            "localReviewState": "unchanged-in-rehearsal",
            "nextVersionSuggestion": "Create a new version only after human classification, never overwrite current package.",
            "receiptTruth": "unchanged; no platform receipt can be created from a rehearsal.",
        },
        "operatorQuestion": "If Mako or Charlie watched the snippets, what evidence would make this decision correct?",
    }


def scenario_rows(control: dict[str, Any]) -> list[dict[str, Any]]:
    tail = control.get("tailClassification") if isinstance(control.get("tailClassification"), dict) else {}
    tail_label = str(tail.get("tailLabel") or control.get("spreadLabel") or "unknown tail")
    return [
        {
            "id": "hold-and-restack",
            "label": "Hold package and re-stack from whole sources",
            "risk": "lowest-publishing-risk",
            "when": "Use if any comparison point suggests wrong source, audio/video drift, or real content after the video master ends.",
            "humanEvidenceNeeded": f"A reviewer confirms the {tail_label} tail is not safely expendable.",
            "nextSafeWork": "Prepare a versioned rebuild plan with source/proxy inventory; do not alter v001.",
        },
        {
            "id": "versioned-tail-trim-candidate",
            "label": "Create a versioned audio-tail trim candidate later",
            "risk": "higher-content-risk",
            "when": "Use only if the extra audio is confirmed dead air, duplicate, countdown, or non-episode material.",
            "humanEvidenceNeeded": f"A reviewer listens to tail snippets and explicitly says the {tail_label} tail can be excluded.",
            "nextSafeWork": "Create v002 candidate artifacts and keep v001 untouched for comparison.",
        },
        {
            "id": "source-media-needed",
            "label": "Request missing or better source media",
            "risk": "safe-but-waits-on-human-files",
            "when": "Use if the control room evidence shows a source mismatch or missing camera/audio coverage.",
            "humanEvidenceNeeded": "A reviewer identifies which camera/audio source is missing or suspect.",
            "nextSafeWork": "Write a missing-media task with exact folder, file, and timeline range clues.",
        },
        {
            "id": "continue-normal-review",
            "label": "Continue normal review with warning attached",
            "risk": "only-safe-after-explicit-classification",
            "when": "Use if the mismatch is understood and intentionally acceptable for the current review pass.",
            "humanEvidenceNeeded": "A reviewer states why the spread is acceptable and which artifact is authoritative.",
            "nextSafeWork": "Keep warning visible in Tower until actual approval/receipt truth exists.",
        },
    ]


def build_payload(release_root: Path, out_dir: Path) -> dict[str, Any]:
    pointer, control, pointer_path = pointer_and_control_room(release_root)
    if not control:
        raise SystemExit("No Studio sync control room found. Run ./script/agentctl.sh studio-sync-control-room first.")
    decisions = [rehearsal_from_decision(row) for row in (control.get("decisionRows") or []) if isinstance(row, dict)]
    scenarios = scenario_rows(control)
    counts = {
        "rehearsalScenarios": len(scenarios),
        "decisionDryRuns": len(decisions),
        "highRiskOptions": sum(1 for row in decisions if str(row.get("risk") or "").startswith("high")),
        "requiresHumanClassification": sum(1 for row in decisions if row.get("requiresHumanClassification")),
        "externalPublishing": False,
        "sourceFilesMutated": False,
        "originalMediaMutated": False,
        "versionsOverwritten": False,
        "receiptTruthCreated": False,
        "exportsCreated": False,
        "decisionsWritten": False,
    }
    status = "sync-decision-rehearsal-ready" if scenarios else "sync-decision-rehearsal-needs-control-room"
    first_path = str(out_dir / "index.html")
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(release_root),
        "sessionDir": str(out_dir),
        "episode": control.get("episode"),
        "version": control.get("version"),
        "htmlPath": first_path,
        "jsonPath": str(out_dir / "sync-decision-rehearsal.json"),
        "markdownPath": str(out_dir / "START-HERE-sync-decision-rehearsal.md"),
        "csvPath": str(out_dir / "sync-decision-rehearsal.csv"),
        "tailClassification": control.get("tailClassification") or {},
        "diagnosis": control.get("diagnosis") or "",
        "nextSafestAction": "Open this rehearsal beside the sync control room, choose the evidence-backed scenario, then only execute a live decision if Charlie/Mako explicitly approves it.",
        "humanAsk": "Compare snippets in the sync control room, then use this rehearsal to choose hold/re-stack, trim-candidate, source-needed, or continue-review before any package repair.",
        "agentSafeParallelWork": "Codex can expand evidence notes, missing-media tasks, and versioned rebuild plans. It must not execute a live sync decision without explicit human classification.",
        "firstSafeAction": {
            "label": f"Open Episode {control.get('episode') or 4} sync decision rehearsal",
            "command": f"open {shell_quote(first_path)}",
            "path": first_path,
            "safety": "Opens local rehearsal evidence only. No decisions, exports, publishing, uploads, schedules, overwrites, receipts, or source mutations occur.",
        },
        "counts": counts,
        "scenarioRows": scenarios,
        "decisionRows": decisions,
        "sourcePointers": {
            "syncControlRoomPointer": str(pointer_path),
            "syncControlRoomHtml": pointer.get("htmlPath") or control.get("htmlPath") or "",
            "syncControlRoomJson": pointer.get("jsonPath") or control.get("jsonPath") or "",
        },
        "truth": {
            "description": "Studio sync decision rehearsal only. It creates local what-if guidance from sync evidence.",
            "externalPublishing": False,
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "receiptTruthCreated": False,
            "exportsCreated": False,
            "decisionsWritten": False,
            "liveDecisionExecuted": False,
        },
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["kind", "id", "label", "risk", "when", "dryRunCommand", "humanEvidenceNeeded"])
        writer.writeheader()
        for row in payload.get("scenarioRows") or []:
            writer.writerow({"kind": "scenario", "id": row.get("id"), "label": row.get("label"), "risk": row.get("risk"), "when": row.get("when"), "dryRunCommand": "", "humanEvidenceNeeded": row.get("humanEvidenceNeeded")})
        for row in payload.get("decisionRows") or []:
            writer.writerow({"kind": "decision-dry-run", "id": row.get("id"), "label": row.get("label"), "risk": row.get("risk"), "when": row.get("recommendedWhen"), "dryRunCommand": row.get("dryRunCommand"), "humanEvidenceNeeded": row.get("operatorQuestion")})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        f"# Episode {payload.get('episode')} sync decision rehearsal",
        "",
        f"Status: `{payload.get('status')}`",
        f"Version: `{payload.get('version')}`",
        "",
        payload.get("diagnosis") or "",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Scenario choices",
        "",
    ]
    for row in payload.get("scenarioRows") or []:
        lines.extend([
            f"### {row.get('label')}",
            f"- Risk: `{row.get('risk')}`",
            f"- Use when: {row.get('when')}",
            f"- Evidence needed: {row.get('humanEvidenceNeeded')}",
            f"- Next safe work: {row.get('nextSafeWork')}",
            "",
        ])
    lines.extend(["## Decision dry-runs", ""])
    for row in payload.get("decisionRows") or []:
        lines.extend([
            f"### {row.get('label')}",
            f"- Category: `{row.get('category')}`",
            f"- Risk: `{row.get('risk')}`",
            f"- Recommended when: {row.get('recommendedWhen')}",
            "```bash",
            row.get("dryRunCommand") or "",
            "```",
            "",
        ])
    lines.extend([
        "## Boundary",
        "",
        "This rehearsal does not execute decisions, create exports, publish, upload, schedule, overwrite, delete, approve, create receipts, or mutate source/original media.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    tail = payload.get("tailClassification") if isinstance(payload.get("tailClassification"), dict) else {}
    count_html = "".join(f"<li><strong>{esc(k)}</strong><span>{esc(v)}</span></li>" for k, v in counts.items())
    scenarios = "".join(f"""
      <article class="card scenario">
        <p class="eyebrow">{esc(row.get('risk'))}</p>
        <h3>{esc(row.get('label'))}</h3>
        <p><strong>Use when:</strong> {esc(row.get('when'))}</p>
        <p><strong>Evidence needed:</strong> {esc(row.get('humanEvidenceNeeded'))}</p>
        <p><strong>Next safe work:</strong> {esc(row.get('nextSafeWork'))}</p>
      </article>
    """ for row in payload.get("scenarioRows") or [])
    decisions = "".join(f"""
      <article class="card decision">
        <p class="eyebrow">{esc(row.get('category'))} · {esc(row.get('risk'))}</p>
        <h3>{esc(row.get('label'))}</h3>
        <p>{esc(row.get('recommendedWhen'))}</p>
        <pre>{esc(row.get('dryRunCommand'))}</pre>
      </article>
    """ for row in payload.get("decisionRows") or [])
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Episode {esc(payload.get('episode'))} sync decision rehearsal</title>
<style>
:root {{ color-scheme: dark; --bg:#101710; --panel:#1b271d; --leaf:#88b36b; --moss:#394b2f; --gold:#dfbd56; --clay:#c5704d; --ink:#fff4dc; --muted:#c6c2aa; --line:rgba(255,244,220,.16); }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color:var(--ink); background:radial-gradient(circle at 20% -10%, #355b39 0%, var(--bg) 42%, #070a06 100%); }}
main {{ max-width:1450px; margin:0 auto; padding:30px; }}
.hero,.panel,.card {{ border:1px solid var(--line); border-radius:26px; background:rgba(27,39,29,.86); box-shadow:0 24px 90px rgba(0,0,0,.34); }}
.hero {{ padding:32px; background:linear-gradient(135deg, rgba(136,179,107,.16), rgba(223,189,86,.10)); }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-size:.78rem; font-weight:950; }}
h1 {{ font-size:clamp(2.1rem,5vw,4.8rem); line-height:.95; margin:.2rem 0; }}
h2,h3 {{ margin:.2rem 0 .5rem; }}
p,span {{ color:var(--muted); line-height:1.5; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-top:18px; }}
.panel,.card {{ padding:18px; margin-top:18px; }}
ul.counts {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }}
ul.counts li {{ display:flex; justify-content:space-between; gap:14px; padding:12px; border:1px solid var(--line); border-radius:15px; background:rgba(0,0,0,.22); }}
.scenario {{ border-color:rgba(136,179,107,.42); }}
.decision {{ border-color:rgba(223,189,86,.35); }}
pre {{ white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.36); border:1px solid var(--line); border-radius:14px; padding:12px; color:#ffe89c; }}
.truth {{ border-color:rgba(197,112,77,.55); background:rgba(63,38,26,.72); }}
</style>
</head>
<body>
<main>
<section class="hero">
  <p class="eyebrow">Quipsly Studio sync rehearsal</p>
  <h1>Episode {esc(payload.get('episode'))} decision rehearsal</h1>
  <p>{esc(payload.get('diagnosis'))}</p>
  <p><strong>Tail:</strong> {esc(tail.get('tailLabel'))} · {esc(tail.get('urgency'))}</p>
  <p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p>
  <pre>{esc(payload.get('firstSafeAction', {}).get('command'))}</pre>
</section>
<section class="panel"><h2>Counts</h2><ul class="counts">{count_html}</ul></section>
<section><h2>Pick the evidence-backed path</h2><div class="grid">{scenarios}</div></section>
<section><h2>Dry-run command rehearsal</h2><div class="grid">{decisions}</div></section>
<section class="panel truth"><h2>Boundary</h2><p>No decisions are executed here. No exports, publishing, uploads, schedules, overwrites, deletes, approvals, receipts, or source mutations happen in this rehearsal.</p></section>
</main>
</body>
</html>""", encoding="utf-8")


def build(release_root: Path) -> dict[str, Any]:
    out_dir = release_root / "review-board" / "sync-decision-rehearsals" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(release_root, out_dir)
    json_path = out_dir / "sync-decision-rehearsal.json"
    md_path = out_dir / "START-HERE-sync-decision-rehearsal.md"
    csv_path = out_dir / "sync-decision-rehearsal.csv"
    html_path = out_dir / "index.html"
    write_json(json_path, payload)
    write_markdown(md_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": POINTER_SCHEMA,
        "updatedAt": iso_now(),
        "status": payload["status"],
        "episode": payload["episode"],
        "version": payload["version"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": payload["counts"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "firstSafeAction": payload["firstSafeAction"],
        "tailClassification": payload["tailClassification"],
        "truth": payload["truth"],
    }
    latest_dir = release_root / "review-board" / "sync-decision-rehearsals"
    write_json(latest_dir / "latest-sync-decision-rehearsal.json", pointer)
    write_json(release_root / "review-board" / "latest-sync-decision-rehearsal.json", pointer)
    return pointer


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local Studio sync decision rehearsal")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    pointer = build(Path(args.release_root))
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
