#!/usr/bin/env python3
"""Build a small Studio360 next-proof brief from renderer preflight rows.

The renderer preflight can contain hundreds of safe dry-run-ready rows. This
brief selects a small, reviewable set of next proof renders so humans and agents
can move the 360 lane forward without digging through the whole command sheet.

It does not execute renderer commands, create exports, mutate originals, upload,
publish, or overwrite previous versions.
"""
from __future__ import annotations

import csv
import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_STUDIO360_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
SCHEMA = "quipsly.studio360.proof-next-brief.v1"
MIN_USEFUL_PROOF_SOURCE_SECONDS = 3.0


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-proof-next")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        if _depth == 0 and payload.get("jsonPath"):
            target = Path(str(payload.get("jsonPath") or ""))
            if target.exists() and target != path:
                target_payload = load_json(target, _depth=1)
                if target_payload:
                    return {**payload, **target_payload}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def path_exists(value: Any) -> bool:
    try:
        return Path(str(value or "")).exists()
    except Exception:
        return False


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def is_useful_proof_duration(row: dict[str, Any]) -> bool:
    duration = safe_float(row.get("sequenceDurationSeconds"))
    return duration <= 0 or duration >= MIN_USEFUL_PROOF_SOURCE_SECONDS


def compact_row(row: dict[str, Any], rank: int) -> dict[str, Any]:
    proof_output = str(row.get("proposedProofOutputPath") or "")
    source = str(row.get("proofSourcePath") or "")
    source_exists = bool(row.get("proofSourceExists")) and path_exists(source)
    output_exists = path_exists(proof_output)
    if output_exists:
        proof_gate = "proof-already-rendered"
    elif source_exists:
        proof_gate = "ready-to-run-proof"
    else:
        proof_gate = "blocked-missing-proof-source"
    return {
        "rank": rank,
        "candidateId": row.get("candidateId") or "",
        "groupKey": row.get("groupKey") or "",
        "recipeId": row.get("recipeId") or "",
        "aspect": row.get("aspect") or "",
        "version": row.get("version") or "",
        "status": row.get("status") or "",
        "sequenceDurationSeconds": row.get("sequenceDurationSeconds") or 0,
        "minimumUsefulProofSourceSeconds": MIN_USEFUL_PROOF_SOURCE_SECONDS,
        "proofSeconds": row.get("proofSeconds") or 10,
        "proofSourcePath": source,
        "proofSourceExists": source_exists,
        "futureRenderSourcePath": row.get("futureRenderSourcePath") or "",
        "proposedProofOutputPath": proof_output,
        "proofOutputAlreadyExists": output_exists,
        "proofGate": proof_gate,
        "proofOpenCommand": f"open {shell_quote(proof_output)}" if output_exists else "",
        "proofReceiptCommand": row.get("proofReceiptCommand") or "",
        "proofDryRunCommand": row.get("proofDryRunCommand") or "",
        "selectionReason": row.get("selectionReason") or "Next available proof candidate.",
        "humanReviewAsk": "Run or open this small proof, check framing/horizon/crop/motion, then mark it useful, needs reframing, or blocked before full export.",
        "agentSafeParallelWork": "Prepare commands, compare recipe metadata, summarize risks, and update proof-review evidence only after a real proof exists. Do not run full renders or mutate originals.",
        "nextSafestAction": row.get("nextSafestAction") or "Run one proof render, inspect it, then continue with another candidate only if the proof is useful.",
        "truth": row.get("truth") or "Renderer row only. No command has been executed by this brief.",
    }


def proof_review_recipe(selected: list[dict[str, Any]]) -> list[dict[str, Any]]:
    first = selected[0] if selected else {}
    return [
        {
            "label": "1. Open renderer preflight",
            "why": "Confirm the candidate set came from current tool/source evidence.",
            "command": "",
            "safety": "Read-only evidence review.",
        },
        {
            "label": "2. Run exactly one proof",
            "why": "Small proof renders are cheap evidence. Full renders wait until a proof looks useful.",
            "command": first.get("proofReceiptCommand") or first.get("proofDryRunCommand") or "",
            "safety": "Creates or records one local proof only if the operator explicitly runs the command.",
        },
        {
            "label": "3. Inspect the proof output",
            "why": "Check framing, horizon, crop, subject placement, and whether this 16:9/9:16 recipe deserves promotion.",
            "command": first.get("proofOpenCommand") or "",
            "safety": "Opens local proof media only if it already exists.",
        },
        {
            "label": "4. Record proof review",
            "why": "The proof should become evidence: useful, needs reframing, blocked, or promote-to-full-render.",
            "command": "",
            "safety": "Review state only. No external publishing or source mutation.",
        },
    ]


def proof_aspects_by_group(proof_review_rows: list[dict[str, Any]]) -> dict[str, set[str]]:
    aspects_by_group: dict[str, set[str]] = {}
    for row in proof_review_rows:
        if not isinstance(row, dict):
            continue
        group_key = str(row.get("groupKey") or "")
        aspect = str(row.get("aspect") or "")
        output_path = row.get("outputPath") or row.get("proposedProofOutputPath")
        if not group_key or aspect not in {"16:9", "9:16"}:
            continue
        if not bool(row.get("outputExists")) and not path_exists(output_path):
            continue
        aspects_by_group.setdefault(group_key, set()).add(aspect)
    return aspects_by_group


def with_selection_reason(row: dict[str, Any], reason: str) -> dict[str, Any]:
    copy = dict(row)
    copy["selectionReason"] = reason
    return copy


def select_rows(rows: list[dict[str, Any]], proof_review_rows: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    usable = [
        row for row in rows
        if isinstance(row, dict)
        and row.get("status") == "dry-run-ready"
        and bool(row.get("proofSourceExists"))
        and bool(row.get("proofReceiptCommand") or row.get("proofDryRunCommand"))
        and is_useful_proof_duration(row)
    ]
    not_rendered = [row for row in usable if not path_exists(row.get("proposedProofOutputPath"))]
    rendered = [row for row in usable if path_exists(row.get("proposedProofOutputPath"))]
    ordered: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    proven_aspects = proof_aspects_by_group(proof_review_rows)
    paired_missing: list[dict[str, Any]] = []
    for row in not_rendered:
        group_key = str(row.get("groupKey") or "")
        aspect = str(row.get("aspect") or "")
        if not group_key or aspect not in {"16:9", "9:16"}:
            continue
        already_proven = proven_aspects.get(group_key, set())
        if already_proven and aspect not in already_proven:
            proven_label = ", ".join(sorted(already_proven))
            paired_missing.append(with_selection_reason(
                row,
                f"Companion proof: group already has {proven_label}; this checks the missing {aspect} aspect.",
            ))

    for row in paired_missing:
        key = (str(row.get("groupKey") or ""), str(row.get("aspect") or ""))
        if key in seen:
            continue
        seen.add(key)
        ordered.append(row)
        if len(ordered) >= limit:
            return ordered

    fresh_groups = [row for row in not_rendered if str(row.get("groupKey") or "") not in proven_aspects]
    extra_versions = [row for row in not_rendered if str(row.get("groupKey") or "") in proven_aspects]
    pools: list[tuple[list[dict[str, Any]], str]] = [
        (fresh_groups, "First proof for this source group."),
        (extra_versions, "Additional proof version for an already-reviewed source group."),
        (rendered, "Already-rendered proof kept visible for continuity."),
    ]
    for pool, reason in pools:
        for row in pool:
            key = (str(row.get("groupKey") or ""), str(row.get("aspect") or ""))
            if key in seen:
                continue
            seen.add(key)
            ordered.append(with_selection_reason(row, reason))
            if len(ordered) >= limit:
                return ordered
    return ordered[:limit]


def build_payload(studio360_root: Path, limit: int) -> dict[str, Any]:
    preflight = load_json(studio360_root / "latest-360-renderer-preflight.json")
    proof_review = load_json(studio360_root / "latest-360-proof-review-desk.json")
    preflight_rows = preflight.get("preflightRows") if isinstance(preflight.get("preflightRows"), list) else []
    proof_review_rows = proof_review.get("rows") if isinstance(proof_review.get("rows"), list) else []
    too_short_rows = [
        row for row in preflight_rows
        if isinstance(row, dict)
        and row.get("status") == "dry-run-ready"
        and bool(row.get("proofSourceExists"))
        and bool(row.get("proofReceiptCommand") or row.get("proofDryRunCommand"))
        and not is_useful_proof_duration(row)
    ]
    selected = [compact_row(row, index + 1) for index, row in enumerate(select_rows(preflight_rows, proof_review_rows, limit))]
    selected_groups = sorted({str(row.get("groupKey") or "") for row in selected if row.get("groupKey")})
    selected_aspects = sorted({str(row.get("aspect") or "") for row in selected if row.get("aspect")})
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "proof-next-ready" if selected else "proof-next-empty",
        "studio360Root": str(studio360_root),
        "sourceRendererPreflightJson": preflight.get("jsonPath") or "",
        "sourceRendererPreflightHtml": preflight.get("htmlPath") or "",
        "sourceProofReviewJson": proof_review.get("jsonPath") or "",
        "sourceProofReviewHtml": proof_review.get("htmlPath") or "",
        "counts": {
            "selectedRows": len(selected),
            "preflightRows": len(preflight_rows),
            "tooShortProofRowsSkipped": len(too_short_rows),
            "minimumUsefulProofSourceSeconds": MIN_USEFUL_PROOF_SOURCE_SECONDS,
            "proofReviewRows": len(proof_review_rows),
            "companionProofRows": sum(1 for row in selected if str(row.get("selectionReason") or "").startswith("Companion proof:")),
            "proofOutputsAlreadyPresent": sum(1 for row in selected if row["proofOutputAlreadyExists"]),
            "proofOutputsNotYetRendered": sum(1 for row in selected if not row["proofOutputAlreadyExists"]),
            "proofSourceRowsPresent": sum(1 for row in selected if row["proofSourceExists"]),
            "readyToRunProofRows": sum(1 for row in selected if row["proofGate"] == "ready-to-run-proof"),
            "proofAlreadyRenderedRows": sum(1 for row in selected if row["proofGate"] == "proof-already-rendered"),
            "blockedMissingProofSourceRows": sum(1 for row in selected if row["proofGate"] == "blocked-missing-proof-source"),
            "selectedGroups": len(selected_groups),
            "selectedAspects": len(selected_aspects),
            "exportsCreated": False,
            "rendererCommandsExecuted": False,
            "originalsMutated": False,
            "externalPublishing": False,
            "fullRenderCreated": False,
        },
        "selectedGroups": selected_groups,
        "selectedAspects": selected_aspects,
        "rows": selected,
        "firstProofCandidate": selected[0] if selected else {},
        "proofReviewRecipe": proof_review_recipe(selected),
        "nextSafestAction": "Run one proof receipt command, inspect the proof output in the proof-review desk, then only continue toward full renders after review.",
        "truth": "Studio360 proof-next brief only. It does not execute ffmpeg, create exports, mutate originals, upload, publish, overwrite versions, or approve renders.",
        "safety": "Local proof-render queue only. Commands are displayed for explicit operator use; this script does not run them.",
    }


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = [
        "rank", "candidateId", "groupKey", "aspect", "version", "status", "proofGate", "sequenceDurationSeconds", "proofSourcePath", "proposedProofOutputPath", "proofOutputAlreadyExists", "selectionReason", "humanReviewAsk", "agentSafeParallelWork", "proofOpenCommand", "proofReceiptCommand", "proofDryRunCommand", "nextSafestAction",
    ]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in payload["rows"]:
            writer.writerow({key: row.get(key, "") for key in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio360 proof-next brief",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Selected proof rows: `{payload['counts']['selectedRows']}`",
        f"- Not yet rendered: `{payload['counts']['proofOutputsNotYetRendered']}`",
        f"- Companion proof rows: `{payload['counts']['companionProofRows']}`",
        f"- Ready to run proof rows: `{payload['counts']['readyToRunProofRows']}`",
        f"- Already rendered proof rows: `{payload['counts']['proofAlreadyRenderedRows']}`",
        f"- Too-short proof rows skipped: `{payload['counts']['tooShortProofRowsSkipped']}`",
        f"- Minimum useful proof source seconds: `{payload['counts']['minimumUsefulProofSourceSeconds']}`",
        "",
        payload["truth"],
        "",
        "## Proof review recipe",
        "",
    ]
    for step in payload.get("proofReviewRecipe") or []:
        lines.extend([
            f"### {step.get('label')}",
            f"- Why: {step.get('why')}",
            f"- Command: `{step.get('command') or ''}`",
            f"- Safety: {step.get('safety')}",
            "",
        ])
    lines.extend([
        "",
        "## Next proof renders",
        "",
    ])
    for row in payload["rows"]:
        lines.extend([
            f"### {row['rank']}. {row['candidateId']} ({row['aspect']})",
            f"- Group: `{row['groupKey']}`",
            f"- Gate: `{row['proofGate']}`",
            f"- Proof source: `{row['proofSourcePath']}`",
            f"- Proposed proof output: `{row['proposedProofOutputPath']}`",
            f"- Already exists: `{row['proofOutputAlreadyExists']}`",
            f"- Why this row: {row['selectionReason']}",
            f"- Human review ask: {row['humanReviewAsk']}",
            f"- Agent-safe work: {row['agentSafeParallelWork']}",
            f"- Open proof command: `{row['proofOpenCommand']}`",
            f"- Receipt command: `{row['proofReceiptCommand']}`",
            "- Raw dry-run command:",
            "```bash",
            str(row["proofDryRunCommand"]),
            "```",
            "",
        ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    recipe_cards: list[str] = []
    for step in payload.get("proofReviewRecipe") or []:
        recipe_cards.append(f"""
        <article class="card recipe">
          <p class="eyebrow">{html.escape(str(step.get('label')))}</p>
          <p>{html.escape(str(step.get('why')))}</p>
          <p><b>Safety:</b> {html.escape(str(step.get('safety')))}</p>
          <code>{html.escape(str(step.get('command') or 'No command needed.'))}</code>
        </article>
        """)
    cards: list[str] = []
    for row in payload["rows"]:
        cards.append(f"""
        <article class="card {html.escape(str(row['proofGate']))}">
          <p class="eyebrow">{html.escape(str(row['aspect']))} · {html.escape(str(row['groupKey']))} · {html.escape(str(row['version']))}</p>
          <h2>{html.escape(str(row['rank']))}. {html.escape(str(row['candidateId']))}</h2>
          <p class="gate">{html.escape(str(row['proofGate']))}</p>
          <p><b>Proof source</b><br><code>{html.escape(str(row['proofSourcePath']))}</code></p>
          <p><b>Output</b><br><code>{html.escape(str(row['proposedProofOutputPath']))}</code></p>
          <p><b>Already rendered:</b> {html.escape(str(row['proofOutputAlreadyExists']))}</p>
          <p><b>Why this row:</b> {html.escape(str(row['selectionReason']))}</p>
          <p><b>Human review:</b> {html.escape(str(row['humanReviewAsk']))}</p>
          <p><b>Agent-safe:</b> {html.escape(str(row['agentSafeParallelWork']))}</p>
          <p><b>Open proof</b><br><code>{html.escape(str(row['proofOpenCommand'] or 'Proof output not present yet.'))}</code></p>
          <p><b>Proof receipt command</b><br><code>{html.escape(str(row['proofReceiptCommand']))}</code></p>
          <details><summary>Raw ffmpeg proof command</summary><code>{html.escape(str(row['proofDryRunCommand']))}</code></details>
        </article>
        """)
    path.write_text(f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Studio360 proof-next brief</title>
<style>
:root {{ color-scheme: dark; --bg:#101811; --panel:#1f2d22; --ink:#f6f2dc; --muted:#bdd0b8; --line:#37533d; --leaf:#85d28a; --gold:#f0ca54; }}
body {{ margin:0; background:radial-gradient(circle at top left,#27452e,#101811 48%); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif; }}
main {{ max-width:1120px; margin:0 auto; padding:40px 24px; }}
.hero,.card {{ background:rgba(31,45,34,.92); border:1px solid var(--line); border-radius:22px; padding:24px; box-shadow:0 18px 48px rgba(0,0,0,.24); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:16px; margin-top:20px; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.gate {{ display:inline-block; border:1px solid var(--line); border-radius:999px; padding:6px 9px; color:var(--leaf); background:rgba(133,210,138,.12); font-weight:850; }}
.ready-to-run-proof {{ border-color:rgba(133,210,138,.55); }}
.proof-already-rendered {{ border-color:rgba(240,202,84,.55); }}
.blocked-missing-proof-source {{ border-color:rgba(224,104,84,.55); }}
.recipe {{ background:rgba(255,255,255,.045); }}
code {{ white-space:pre-wrap; overflow-wrap:anywhere; color:#d6ffd8; }}
summary {{ cursor:pointer; color:var(--leaf); font-weight:800; }}
</style></head><body><main>
<section class="hero">
  <p class="eyebrow">Quipsly Studio360</p>
  <h1>Next proof renders</h1>
  <p>{html.escape(payload['truth'])}</p>
  <p><b>Selected:</b> {payload['counts']['selectedRows']} · <b>Ready to run:</b> {payload['counts']['readyToRunProofRows']} · <b>Not yet rendered:</b> {payload['counts']['proofOutputsNotYetRendered']} · <b>Sources present:</b> {payload['counts']['proofSourceRowsPresent']}</p>
  <p><b>Too-short candidates skipped:</b> {payload['counts']['tooShortProofRowsSkipped']} below {payload['counts']['minimumUsefulProofSourceSeconds']}s. Tiny clips stay visible in preflight/review evidence, but they are not good proof-next candidates.</p>
  <p><b>Next:</b> {html.escape(payload['nextSafestAction'])}</p>
</section>
<section class="grid">{''.join(recipe_cards)}</section>
<section class="grid">{''.join(cards)}</section>
</main></body></html>""", encoding="utf-8")


def main() -> int:
    studio360_root = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_STUDIO360_ROOT
    limit = int(sys.argv[2]) if len(sys.argv) > 2 and str(sys.argv[2]).isdigit() else 8
    session_dir = studio360_root / "ProofNextBriefs" / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    payload = build_payload(studio360_root, limit)
    json_path = session_dir / "studio360-proof-next-brief.json"
    markdown_path = session_dir / "START-HERE-studio360-proof-next-brief.md"
    csv_path = session_dir / "studio360-proof-next-brief.csv"
    html_path = session_dir / "index.html"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open Studio360 proof-next brief",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local proof-render queue only. Does not render, upload, publish, mutate originals, or overwrite versions.",
        },
    })
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = studio360_root / "latest-360-proof-next-brief.json"
    write_json(pointer, {
        "schema": SCHEMA,
        "status": payload["status"],
        "updatedAt": payload["generatedAt"],
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "htmlPath": str(html_path),
        "counts": payload["counts"],
        "humanAsk": payload.get("humanAsk") or "Review the next proof-render candidates and choose which 360 proof, if any, should be rendered for local review.",
        "agentSafeParallelWork": payload.get("agentSafeParallelWork") or "Codex may improve proof candidate notes, dry-run render packets, and blocker summaries. Do not render, upload, publish, delete, overwrite, mutate originals, or create receipt truth.",
        "firstSafeAction": payload["firstSafeAction"],
        "firstProofCandidate": payload.get("firstProofCandidate") or {},
        "proofReviewRecipe": payload.get("proofReviewRecipe") or [],
        "selectedGroups": payload.get("selectedGroups") or [],
        "selectedAspects": payload.get("selectedAspects") or [],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    })
    print(json.dumps(load_json(pointer), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
