#!/usr/bin/env python3
"""Build a non-mutating Episode duration-candidate decision rehearsal packet.

This creates a local decision layer for an Episode duration candidate before any
candidate is promoted, refined, held, or routed back for more evidence. It does
not promote, approve, repair, export, publish, upload, schedule, overwrite,
delete, capture receipts, or mutate source/original media.
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
SCHEMA = "quipsly.studio-duration-candidate-decision-rehearsal.v1"
POINTER_SCHEMA = "quipsly.studio-duration-candidate-decision-rehearsal.latest-pointer.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-studio-duration-candidate-decision-rehearsal")


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


def safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def candidate_packet(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "review-board" / "duration-candidate-reviews" / "latest-duration-candidate-review.json"
    pointer = load_json(pointer_path, resolve_pointer=False)
    if not pointer:
        pointer_path = release_root / "review-board" / "latest-duration-candidate-review.json"
        pointer = load_json(pointer_path, resolve_pointer=False)
    target = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(target, resolve_pointer=False) if target.exists() else {}
    if not packet:
        packet = load_json(pointer_path)
    return pointer, packet, pointer_path


def promotion_packet(release_root: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer_path = release_root / "review-board" / "duration-candidate-promotions" / "latest-duration-candidate-promotion-plan.json"
    pointer = load_json(pointer_path, resolve_pointer=False)
    target = Path(str(pointer.get("jsonPath") or ""))
    packet = load_json(target, resolve_pointer=False) if target.exists() else {}
    if not packet:
        packet = load_json(pointer_path)
    return pointer, packet, pointer_path


def candidate_counts(packet: dict[str, Any]) -> dict[str, int]:
    counts = as_dict(packet.get("counts"))
    artifacts = [item for item in as_list(packet.get("artifacts")) if isinstance(item, dict)]
    return {
        "artifacts": safe_int(counts.get("artifacts")) or len(artifacts),
        "snippets": safe_int(counts.get("snippets")) or sum(len(as_list(item.get("snippets"))) for item in artifacts),
        "stills": safe_int(counts.get("stills")) or sum(len(as_list(item.get("stills"))) for item in artifacts),
        "snippetErrors": safe_int(counts.get("snippetErrors")),
        "stillErrors": safe_int(counts.get("stillErrors")),
    }


def open_command(path_value: str) -> str:
    return f"open {shell_quote(path_value)}" if path_value else ""


def promotion_execute_command(promotion: dict[str, Any]) -> str:
    for key in ("executeCommand", "executeAfterApprovalCommand", "candidatePromotionExecuteCommand", "approvalCommand"):
        value = str(promotion.get(key) or "").strip()
        if value:
            return value
    candidate_manifest = str(promotion.get("candidateManifestPath") or promotion.get("manifestPath") or "").strip()
    release_root = str(promotion.get("releaseRoot") or DEFAULT_RELEASE_ROOT)
    if candidate_manifest:
        return f"./script/agentctl.sh studio-duration-candidate-promotion-plan {shell_quote(candidate_manifest)} {shell_quote(release_root)} --execute"
    return ""


def scenario_rows(candidate: dict[str, Any], promotion: dict[str, Any]) -> list[dict[str, Any]]:
    episode = safe_int(candidate.get("episode")) or 1
    current_version = str(candidate.get("currentVersion") or candidate.get("sourceVersion") or "current package")
    candidate_version = str(candidate.get("candidateVersion") or candidate.get("version") or "candidate")
    execute_command = promotion_execute_command(promotion)
    return [
        {
            "id": "promote-after-watch-listen",
            "label": f"Promote Episode {episode} {candidate_version} after watch/listen review",
            "category": "promotion-requires-human-approval",
            "risk": "medium-local-package-truth-change-after-approval",
            "when": "Use only after the beginning, middle, and ending snippets/stills feel complete and aligned across the candidate artifacts.",
            "humanEvidenceNeeded": "Reviewer explicitly says the duration candidate is better than holding the current package and is safe to turn into the next versioned review package.",
            "nextSafeWork": "Run the promotion plan only after explicit human approval, then regenerate review board, human-review ledger, package quality desk, and Tower packets.",
            "dryRunCommand": open_command(str(promotion.get("htmlPath") or promotion.get("jsonPath") or "")),
            "executeOnlyAfterApproval": execute_command,
            "wouldPromoteCandidate": False,
        },
        {
            "id": "refine-candidate",
            "label": f"Refine {candidate_version} into a newer candidate",
            "category": "versioned-rebuild-needed",
            "risk": "low-if-new-version-only",
            "when": "Use if the candidate is close but the ending, audio boundary, sync feel, or vertical/widescreen pairing still needs work.",
            "humanEvidenceNeeded": "Reviewer names the exact issue and approximate time range instead of giving a vague no.",
            "nextSafeWork": f"Create a new candidate version after {candidate_version}; preserve {current_version} and {candidate_version} evidence.",
            "dryRunCommand": "",
            "executeOnlyAfterApproval": "",
            "wouldPromoteCandidate": False,
        },
        {
            "id": "hold-current-version",
            "label": f"Hold {current_version} as current-best while {candidate_version} remains evidence",
            "category": "safe-hold",
            "risk": "lowest-state-risk",
            "when": "Use if the candidate is not convincingly better or the reviewer cannot make the call from the current evidence.",
            "humanEvidenceNeeded": "Reviewer says hold/refine/pending and explains what would make the decision clearer.",
            "nextSafeWork": "Improve evidence, notes, snippets, or work orders without changing review/package truth.",
            "dryRunCommand": "",
            "executeOnlyAfterApproval": "",
            "wouldPromoteCandidate": False,
        },
        {
            "id": "needs-more-evidence",
            "label": "Generate more local evidence before deciding",
            "category": "evidence-gap",
            "risk": "safe-local-evidence-only",
            "when": "Use if reviewers need more than the prepared snippets/stills to distinguish a real duration fix from a cosmetic-looking mismatch.",
            "humanEvidenceNeeded": "Reviewer identifies which comparison point is missing: opening, middle, ending, audio tail, vertical frame, or widescreen frame.",
            "nextSafeWork": "Create more local snippets/stills/contact sheets and keep all approval/promotion states unchanged.",
            "dryRunCommand": "",
            "executeOnlyAfterApproval": "",
            "wouldPromoteCandidate": False,
        },
        {
            "id": "intentional-duration-spread-with-notes",
            "label": "Record intentional duration spread with notes",
            "category": "explicit-human-exception",
            "risk": "high-if-inferred",
            "when": "Use only if a reviewer understands the spread and explicitly says it is acceptable for this package.",
            "humanEvidenceNeeded": "Reviewer states which artifact is authoritative and why the mismatch does not block review.",
            "nextSafeWork": "Record a cautious local note and keep Tower approval blocked until the review ledger reflects the real decision.",
            "dryRunCommand": "",
            "executeOnlyAfterApproval": "",
            "wouldPromoteCandidate": False,
        },
    ]


def build_payload(release_root: Path, out_dir: Path) -> dict[str, Any]:
    candidate_pointer, candidate, candidate_pointer_path = candidate_packet(release_root)
    promotion_pointer, promotion, promotion_pointer_path = promotion_packet(release_root)
    if not candidate:
        raise SystemExit("No duration candidate review found. Run ./script/agentctl.sh studio-duration-repair-workorders first.")
    counts = candidate_counts(candidate)
    scenarios = scenario_rows(candidate, promotion)
    html_path = out_dir / "index.html"
    json_path = out_dir / "duration-candidate-decision-rehearsal.json"
    markdown_path = out_dir / "START-HERE-duration-candidate-decision-rehearsal.md"
    csv_path = out_dir / "duration-candidate-decision-rehearsal.csv"
    status = "duration-candidate-decision-rehearsal-ready"
    candidate_version = candidate.get("candidateVersion") or candidate.get("version") or candidate_pointer.get("version")
    current_version = candidate.get("currentVersion") or candidate.get("sourceVersion")
    truth = {
        "description": "Studio duration candidate decision rehearsal only. It creates local what-if guidance from candidate evidence.",
        "candidatePromoted": False,
        "reviewLedgerMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "sourceFilesMutated": False,
        "originalMediaMutated": False,
        "versionsOverwritten": False,
        "approvalsChanged": False,
        "liveDecisionExecuted": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "releaseRoot": str(release_root),
        "sessionDir": str(out_dir),
        "episode": safe_int(candidate.get("episode")) or safe_int(candidate_pointer.get("episode")) or 1,
        "currentVersion": current_version,
        "candidateVersion": candidate_version,
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "humanAsk": "Watch/listen the duration candidate evidence, then choose promote, refine, hold, or more-evidence before any package truth changes.",
        "agentSafeParallelWork": "Codex can summarize evidence, prepare reviewer notes, and expand local snippets. It must not promote, approve, publish, upload, schedule, overwrite, delete, create receipts, or mutate sources without explicit approval.",
        "nextSafestAction": "Open the candidate review packet beside this rehearsal, choose one scenario, and only then ask Codex to take the next reversible action.",
        "firstSafeAction": {
            "label": f"Open Episode {safe_int(candidate.get('episode')) or 1} duration candidate decision rehearsal",
            "command": open_command(str(html_path)),
            "path": str(html_path),
            "safety": "Opens local rehearsal evidence only. No candidate promotion, approval, export, publishing, upload, schedule, overwrite, receipt, or source mutation occurs.",
        },
        "counts": {
            **counts,
            "scenarioChoices": len(scenarios),
            "promotionPlanPresent": bool(promotion),
            "candidateReviewPresent": bool(candidate),
            "candidatePromoted": False,
            "reviewLedgerMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "originalMediaMutated": False,
            "versionsOverwritten": False,
            "approvalsChanged": False,
        },
        "scenarioRows": scenarios,
        "sourcePointers": {
            "candidateReviewPointer": str(candidate_pointer_path),
            "candidateReviewHtml": candidate_pointer.get("htmlPath") or candidate.get("htmlPath") or "",
            "candidateReviewJson": candidate_pointer.get("jsonPath") or candidate.get("jsonPath") or "",
            "candidateReviewMarkdown": candidate_pointer.get("markdownPath") or candidate.get("markdownPath") or "",
            "promotionPlanPointer": str(promotion_pointer_path),
            "promotionPlanHtml": promotion_pointer.get("htmlPath") or promotion.get("htmlPath") or "",
            "promotionPlanJson": promotion_pointer.get("jsonPath") or promotion.get("jsonPath") or "",
            "promotionPlanMarkdown": promotion_pointer.get("markdownPath") or promotion.get("markdownPath") or "",
        },
        "candidateEvidence": {
            "status": candidate.get("status") or candidate_pointer.get("status") or "",
            "humanAsk": candidate.get("humanAsk") or "",
            "nextSafestAction": candidate.get("nextSafestAction") or candidate_pointer.get("nextSafestAction") or "",
            "acceptanceRule": candidate.get("candidateAcceptanceNextStep") or "A candidate is not approval. Promote or rebuild it into a versioned package before Tower artifacts can be approved.",
        },
        "promotionPlan": {
            "status": promotion.get("status") or promotion_pointer.get("status") or "",
            "htmlPath": promotion_pointer.get("htmlPath") or promotion.get("htmlPath") or "",
            "jsonPath": promotion_pointer.get("jsonPath") or promotion.get("jsonPath") or "",
            "executeOnlyAfterApproval": promotion_execute_command(promotion),
            "nextSafestAction": promotion.get("nextSafestAction") or promotion_pointer.get("nextSafestAction") or "",
        },
        "truth": truth,
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["id", "label", "category", "risk", "when", "humanEvidenceNeeded", "nextSafeWork", "dryRunCommand", "executeOnlyAfterApproval"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload.get("scenarioRows") or []:
            writer.writerow({field: row.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    source = payload.get("sourcePointers") if isinstance(payload.get("sourcePointers"), dict) else {}
    promotion = payload.get("promotionPlan") if isinstance(payload.get("promotionPlan"), dict) else {}
    lines = [
        f"# Episode {payload.get('episode')} duration candidate decision rehearsal",
        "",
        f"- Status: `{payload.get('status')}`",
        f"- Current version: `{payload.get('currentVersion')}`",
        f"- Candidate version: `{payload.get('candidateVersion')}`",
        f"- Generated: `{payload.get('generatedAt')}`",
        "",
        payload.get("humanAsk") or "",
        "",
        f"Next safest action: {payload.get('nextSafestAction')}",
        "",
        "## Evidence to open",
        "",
        f"- Candidate review packet: `{source.get('candidateReviewHtml', '')}`",
        f"- Candidate JSON evidence: `{source.get('candidateReviewJson', '')}`",
        f"- Promotion plan preview: `{promotion.get('htmlPath', '')}`",
        "",
        "## Scenario choices",
        "",
    ]
    for row in payload.get("scenarioRows") or []:
        lines.extend([
            f"### {row.get('label')}",
            f"- Category: `{row.get('category')}`",
            f"- Risk: `{row.get('risk')}`",
            f"- Use when: {row.get('when')}",
            f"- Human evidence needed: {row.get('humanEvidenceNeeded')}",
            f"- Next safe work: {row.get('nextSafeWork')}",
        ])
        if row.get("dryRunCommand"):
            lines.extend(["", "Open/prep command:", "```bash", row.get("dryRunCommand") or "", "```"])
        if row.get("executeOnlyAfterApproval"):
            lines.extend(["", "Execute only after explicit approval:", "```bash", row.get("executeOnlyAfterApproval") or "", "```"])
        lines.append("")
    lines.extend([
        "## Boundary",
        "",
        "This rehearsal does not promote candidates, approve reviews, repair packages, export, publish, upload, schedule, overwrite, delete, capture receipts, or mutate source/original media.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    source = payload.get("sourcePointers") if isinstance(payload.get("sourcePointers"), dict) else {}
    promotion = payload.get("promotionPlan") if isinstance(payload.get("promotionPlan"), dict) else {}
    count_html = "".join(f"<li><strong>{esc(k)}</strong><span>{esc(v)}</span></li>" for k, v in counts.items())
    scenarios = "".join(f"""
      <article class="card scenario">
        <p class="eyebrow">{esc(row.get('category'))} · {esc(row.get('risk'))}</p>
        <h3>{esc(row.get('label'))}</h3>
        <p><strong>Use when:</strong> {esc(row.get('when'))}</p>
        <p><strong>Evidence needed:</strong> {esc(row.get('humanEvidenceNeeded'))}</p>
        <p><strong>Next safe work:</strong> {esc(row.get('nextSafeWork'))}</p>
        {f"<pre>{esc(row.get('dryRunCommand'))}</pre>" if row.get('dryRunCommand') else ""}
        {f"<details><summary>Execute only after explicit approval</summary><pre>{esc(row.get('executeOnlyAfterApproval'))}</pre></details>" if row.get('executeOnlyAfterApproval') else ""}
      </article>
    """ for row in payload.get("scenarioRows") or [])
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Episode {esc(payload.get('episode'))} duration candidate decision rehearsal</title>
<style>
:root {{ color-scheme: dark; --bg:#101710; --panel:#1b271d; --leaf:#88b36b; --gold:#dfbd56; --clay:#c5704d; --ink:#fff4dc; --muted:#c6c2aa; --line:rgba(255,244,220,.16); }}
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
.counts li {{ border:1px solid var(--line); border-radius:18px; padding:13px; background:rgba(0,0,0,.18); }}
.counts strong {{ display:block; color:var(--gold); font-size:.75rem; text-transform:uppercase; letter-spacing:.09em; }}
.counts span {{ display:block; margin-top:6px; font-size:1.25rem; color:var(--ink); }}
a {{ color:#aee4ff; }}
code,pre {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; padding:12px; border-radius:14px; background:rgba(0,0,0,.32); color:#bfe7b4; }}
.scenario {{ border-color:rgba(223,189,86,.25); }}
.safety {{ border-left:4px solid var(--gold); padding-left:14px; color:#fff0aa; }}
details {{ margin-top:10px; }}
summary {{ cursor:pointer; color:var(--gold); font-weight:900; }}
</style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly Studio · local rehearsal only</p>
    <h1>Episode {esc(payload.get('episode'))} duration candidate decision rehearsal</h1>
    <p>{esc(payload.get('humanAsk'))}</p>
    <p><strong>Current:</strong> {esc(payload.get('currentVersion'))} · <strong>Candidate:</strong> {esc(payload.get('candidateVersion'))}</p>
    <p><strong>Next safest action:</strong> {esc(payload.get('nextSafestAction'))}</p>
    <p class="safety">No candidate promotion, review approval, export, upload, publication, schedule, receipt, overwrite, delete, or source mutation happened here.</p>
  </section>
  <section class="grid">
    <article class="panel">
      <h2>Evidence</h2>
      <p>Open the candidate evidence first. Open the promotion plan only after the candidate passes watch/listen review.</p>
      <p><a href="file://{esc(source.get('candidateReviewHtml'))}">Candidate review packet</a></p>
      <p><a href="file://{esc(promotion.get('htmlPath'))}">Promotion plan preview</a></p>
      <code>{esc(open_command(str(source.get('candidateReviewHtml') or '')))}</code>
    </article>
    <article class="panel">
      <h2>Counts</h2>
      <ul class="counts">{count_html}</ul>
    </article>
  </section>
  <section class="grid">{scenarios}</section>
</main>
</body>
</html>""", encoding="utf-8")


def build_rehearsal(release_root: Path) -> dict[str, Any]:
    out_dir = release_root / "review-board" / "duration-candidate-decision-rehearsals" / stamp()
    out_dir.mkdir(parents=True, exist_ok=False)
    payload = build_payload(release_root, out_dir)
    write_json(Path(payload["jsonPath"]), payload)
    write_markdown(Path(payload["markdownPath"]), payload)
    write_csv(Path(payload["csvPath"]), payload)
    write_html(Path(payload["htmlPath"]), payload)
    pointer = {
        "schema": POINTER_SCHEMA,
        "status": payload["status"],
        "updatedAt": payload["generatedAt"],
        "episode": payload["episode"],
        "currentVersion": payload.get("currentVersion"),
        "candidateVersion": payload.get("candidateVersion"),
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "csvPath": payload["csvPath"],
        "counts": payload["counts"],
        "firstSafeAction": payload["firstSafeAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(release_root / "review-board" / "duration-candidate-decision-rehearsals" / "latest-duration-candidate-decision-rehearsal.json", pointer)
    write_json(release_root / "review-board" / "latest-duration-candidate-decision-rehearsal.json", pointer)
    return pointer


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a local Studio duration candidate decision rehearsal.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    pointer = build_rehearsal(Path(args.release_root).expanduser())
    print(json.dumps(pointer, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
