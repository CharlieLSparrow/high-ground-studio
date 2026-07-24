#!/usr/bin/env python3
"""Build one Studio360 next source-inspection card.

This reads the latest Studio360 proof control room and writes a tiny local card
for the next source group to inspect. It does not proxy, render, repair, export,
upload, publish, schedule, delete, overwrite, write metadata, mutate original
media, or create receipts.
"""
from __future__ import annotations

import argparse
import html
import json
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
LATEST_CONTROL_ROOM = "latest-360-proof-control-room.json"
LATEST_RENDERER_PREFLIGHT = "latest-360-renderer-preflight.json"
LATEST_NEXT_CARD = "latest-360-next-source-card.json"
ALIAS_NEXT_CARD = "latest-studio360-next-source-card.json"
SCHEMA = "quipsly.studio360.next-source-card.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-360-next-source-card")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_control_room(root: Path) -> tuple[dict[str, Any], Path]:
    pointer_path = root / LATEST_CONTROL_ROOM
    pointer = load_json(pointer_path)
    packet_path_value = str(pointer.get("jsonPath") or "")
    packet_path = Path(packet_path_value) if packet_path_value else pointer_path
    packet = load_json(packet_path)
    return ({**pointer, **packet} if packet else pointer), pointer_path


def load_pointer_target(root: Path, filename: str) -> dict[str, Any]:
    pointer = load_json(root / filename)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else None
    target = load_json(target_path) if target_path and target_path.exists() else {}
    return {**pointer, **target} if target else pointer


def pick_source_card(control: dict[str, Any], group_key: str | None) -> dict[str, Any]:
    deck = control.get("sourceRoutingCards") if isinstance(control.get("sourceRoutingCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    if group_key:
        for card in cards:
            if isinstance(card, dict) and str(card.get("groupKey") or "") == group_key:
                return card
    return next((card for card in cards if isinstance(card, dict)), {})


def pick_renderer_proof_row(root: Path, group_key: str) -> dict[str, Any]:
    preflight = load_pointer_target(root, LATEST_RENDERER_PREFLIGHT)
    rows = preflight.get("preflightRows") if isinstance(preflight.get("preflightRows"), list) else []
    ready = [
        row for row in rows
        if isinstance(row, dict) and row.get("status") == "dry-run-ready" and row.get("proofDryRunCommand")
    ]
    matching = [row for row in ready if str(row.get("groupKey") or "") == group_key]
    for row in matching:
        if str(row.get("aspect") or "") == "16:9":
            return row
    return (matching or ready or [{}])[0]


def build_payload(root: Path, group_key: str | None = None) -> dict[str, Any]:
    control, pointer_path = load_control_room(root)
    card = pick_source_card(control, group_key)
    counts = control.get("counts") if isinstance(control.get("counts"), dict) else {}
    source_paths = [str(path) for path in card.get("sourcePaths") if isinstance(card.get("sourcePaths"), list)] if isinstance(card.get("sourcePaths"), list) else []
    group = str(card.get("groupKey") or group_key or "")
    proof_row = pick_renderer_proof_row(root, group)
    proof_output_path = str(proof_row.get("proposedProofOutputPath") or "")
    proof_output_exists = Path(proof_output_path).exists() if proof_output_path else False
    first_local_proof_command = "" if proof_output_exists else str(proof_row.get("proofDryRunCommand") or "")
    first_local_proof_review_command = f"open {shell_quote(proof_output_path)}" if proof_output_exists else ""
    first_local_proof_safety = (
        "Proof output already exists. Open/review the local proof instead of rerunning the render command; this does not mutate originals, create full exports, upload, publish, schedule, delete, overwrite, write metadata, or create receipt truth."
        if proof_output_exists
        else "Local proof command only. This card does not execute it. If run later with explicit approval, it creates a short proof file from proxy/source evidence; it does not mutate originals, create full exports, upload, publish, schedule, delete, overwrite, write metadata, or create receipt truth."
    )
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "studio360-next-source-card-ready" if card else "studio360-next-source-card-needs-control-room",
        "studio360Root": str(root),
        "sourceControlRoomPointerPath": str(pointer_path),
        "sourceControlRoomJsonPath": str(control.get("jsonPath") or ""),
        "sourceControlRoomHtmlPath": str(control.get("htmlPath") or ""),
        "cardId": str(card.get("id") or "studio360-next-source-card"),
        "groupKey": group,
        "label": str(card.get("label") or "Inspect one 360 source group"),
        "route": str(card.get("route") or ""),
        "statusLabel": str(card.get("status") or ""),
        "durationSeconds": card.get("durationSeconds") or 0,
        "assetCount": card.get("assetCount") or 0,
        "originalCount": card.get("originalCount") or 0,
        "proxyCount": card.get("proxyCount") or 0,
        "companionCount": card.get("companionCount") or 0,
        "humanQuestion": str(card.get("humanQuestion") or "Is this the intended 360 source group?"),
        "codexSafeMove": str(card.get("codexSafeMove") or "Summarize source/proxy evidence and prepare a review note without rendering or mutating originals."),
        "nextSafestAction": str(card.get("nextSafestAction") or control.get("nextSafestAction") or "Open source evidence and confirm intent before any proxy/proof/render work."),
        "sourceDeskCommand": str(card.get("sourceDeskCommand") or ""),
        "openSourceCommand": str(card.get("openSourceCommand") or ""),
        "candidateProxyPrepCommand": str(card.get("candidateProxyPrepCommand") or ""),
        "candidateProxyPrepSafety": str(card.get("candidateProxyPrepSafety") or "Candidate command only; do not run unless explicitly approved for this source group."),
        "firstLocalProofCommand": first_local_proof_command,
        "firstLocalProofCandidateId": str(proof_row.get("candidateId") or ""),
        "firstLocalProofAspect": str(proof_row.get("aspect") or ""),
        "firstLocalProofSourcePath": str(proof_row.get("proofSourcePath") or ""),
        "firstLocalProofOutputPath": proof_output_path,
        "firstLocalProofOutputExists": proof_output_exists,
        "firstLocalProofReviewCommand": first_local_proof_review_command,
        "firstLocalProofSafety": first_local_proof_safety,
        "sourcePaths": source_paths,
        "localEvidenceNoteYaml": str(card.get("localEvidenceNoteYaml") or ""),
        "countsContext": {
            "assetGroups": counts.get("assetGroups", 0),
            "readyGroupsCanContinue": counts.get("readyGroupsCanContinue", 0),
            "repairTickets": counts.get("repairTickets", 0),
            "studio360SourceRoutingCards": counts.get("studio360SourceRoutingCards", 0),
            "rendererCommandsExecuted": counts.get("rendererCommandsExecuted", False),
            "exportsCreated": counts.get("exportsCreated", False),
        },
        "firstSafeAction": {
            "label": "Open this 360 source card",
            "command": "",
            "path": "",
            "safety": "Opens one local 360 source-inspection card. No proxy, render, repair, export, upload, publication, schedule, metadata write, delete, overwrite, source mutation, or receipt truth.",
        },
        "truth": {
            "description": "Studio360 next source card only. It reads local source-routing evidence and writes a local inspection card.",
            "proxiesCreated": False,
            "rendererCommandsExecuted": False,
            "exportsCreated": False,
            "fullRenderCreated": False,
            "sourceFilesMutated": False,
            "metadataWritten": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
        },
    }


def render_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio360 next source card",
        "",
        f"**Group:** `{payload.get('groupKey')}`",
        f"**Route:** `{payload.get('route')}`",
        f"**Status:** `{payload.get('statusLabel')}`",
        "",
        "## Human question",
        str(payload.get("humanQuestion") or ""),
        "",
        "## Next safest action",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Codex-safe move",
        str(payload.get("codexSafeMove") or ""),
        "",
        "## Commands",
        f"- Source desk: `{payload.get('sourceDeskCommand')}`",
        f"- Open source: `{payload.get('openSourceCommand')}`",
        f"- Candidate proxy prep: `{payload.get('candidateProxyPrepCommand')}`",
        f"- Candidate proxy prep safety: {payload.get('candidateProxyPrepSafety')}",
        f"- First local proof output exists: `{payload.get('firstLocalProofOutputExists')}`",
        f"- First local proof review command: `{payload.get('firstLocalProofReviewCommand')}`",
        f"- First local proof command: `{payload.get('firstLocalProofCommand')}`",
        f"- First local proof safety: {payload.get('firstLocalProofSafety')}",
        "",
        "## Source paths",
    ]
    for source in payload.get("sourcePaths") or []:
        lines.append(f"- `{source}`")
    lines.extend([
        "",
        "## Local evidence note",
        "",
        "```yaml",
        str(payload.get("localEvidenceNoteYaml") or ""),
        "```",
        "",
        "## Safety",
        "- Does not create proxies.",
        "- Does not render proof or full exports.",
        "- Does not repair, delete, overwrite, or mutate source media.",
        "- Does not upload, publish, schedule, write metadata, or create receipts.",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def render_html(path: Path, payload: dict[str, Any]) -> None:
    sources = "".join(f"<li><code>{esc(source)}</code></li>" for source in payload.get("sourcePaths") or []) or "<li>No direct source paths carried by this card.</li>"
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 next source card</title>
  <style>
    :root {{ color-scheme: dark; --ink:#e9f3eb; --fern:#8dcf93; --water:#73bdd6; --bark:#231d15; --soil:#161b17; --line:#38513d; --amber:#e6b759; }}
    body {{ margin:0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif; background: radial-gradient(circle at top left,#1d3d31,#141915 48%,#241b13); color:var(--ink); }}
    main {{ max-width: 1020px; margin: 34px auto; padding: 0 20px 52px; }}
    .card {{ border:1px solid var(--line); border-radius:30px; padding:28px; background:rgba(18,24,18,.88); box-shadow:0 24px 70px rgba(0,0,0,.35); }}
    .eyebrow {{ color:var(--amber); letter-spacing:.25em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font:900 clamp(34px,5vw,62px)/.95 ui-serif, Georgia, serif; margin:12px 0; }}
    .meta {{ display:flex; gap:8px; flex-wrap:wrap; margin:16px 0; }}
    .meta span {{ padding:8px 12px; border-radius:999px; background:rgba(141,207,147,.15); border:1px solid rgba(141,207,147,.3); font-size:12px; font-weight:800; }}
    .grid {{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }}
    section {{ border:1px solid var(--line); border-radius:18px; padding:18px; background:rgba(255,255,255,.04); }}
    h2 {{ margin:0 0 10px; color:var(--fern); font-size:16px; }}
    code, pre {{ display:block; white-space:pre-wrap; word-break:break-word; background:rgba(0,0,0,.25); border:1px solid var(--line); border-radius:12px; padding:10px; }}
    .safety {{ color:#b8c8ba; font-size:14px; }}
    @media(max-width:760px) {{ .grid {{ grid-template-columns:1fr; }} }}
  </style>
</head>
<body><main><div class="card">
  <div class="eyebrow">Quipsly Studio360</div>
  <h1>Inspect one source group.</h1>
  <p>{esc(payload.get('nextSafestAction'))}</p>
  <div class="meta"><span>{esc(payload.get('groupKey'))}</span><span>{esc(payload.get('route'))}</span><span>{esc(payload.get('statusLabel'))}</span><span>{esc(payload.get('proxyCount'))} proxies</span><span>{esc(payload.get('originalCount'))} originals</span></div>
  <div class="grid">
    <section><h2>Human question</h2><p>{esc(payload.get('humanQuestion'))}</p></section>
    <section><h2>Codex-safe move</h2><p>{esc(payload.get('codexSafeMove'))}</p></section>
    <section><h2>Commands</h2><p>Source desk</p><code>{esc(payload.get('sourceDeskCommand'))}</code><p>Candidate proxy prep</p><code>{esc(payload.get('candidateProxyPrepCommand'))}</code><p>First local proof review</p><code>{esc(payload.get('firstLocalProofReviewCommand'))}</code><p>First local proof command</p><code>{esc(payload.get('firstLocalProofCommand'))}</code><p class="safety">{esc(payload.get('firstLocalProofSafety'))}</p></section>
    <section><h2>Source paths</h2><ul>{sources}</ul></section>
  </div>
  <section style="margin-top:16px"><h2>Local evidence note</h2><pre>{esc(payload.get('localEvidenceNoteYaml'))}</pre></section>
  <p class="safety">Safety: no proxy, render, repair, export, upload, publish, schedule, metadata write, delete, overwrite, source mutation, or receipt truth.</p>
</div></main></body></html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Studio360 next source card.")
    parser.add_argument("studio360_root", nargs="?", default=str(DEFAULT_ROOT))
    parser.add_argument("--group-key", default="")
    args = parser.parse_args()
    root = Path(args.studio360_root).expanduser().resolve()
    payload = build_payload(root, args.group_key or None)
    out_dir = root / "NextSourceCards" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "studio360-next-source-card.json"
    markdown_path = out_dir / "START-HERE-studio360-next-source-card.md"
    html_path = out_dir / "index.html"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "htmlPath": str(html_path),
        "firstSafeAction": {
            "label": "Open this 360 source card",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens one local 360 source-inspection card. No proxy, render, repair, export, upload, publication, schedule, metadata write, delete, overwrite, source mutation, or receipt truth.",
        },
    })
    write_json(json_path, payload)
    render_markdown(markdown_path, payload)
    render_html(html_path, payload)
    pointer = {
        "schema": "quipsly.studio360.latest-next-source-card.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "label": payload.get("label"),
        "groupKey": payload.get("groupKey"),
        "route": payload.get("route"),
        "statusLabel": payload.get("statusLabel"),
        "humanAsk": payload.get("humanQuestion"),
        "humanQuestion": payload.get("humanQuestion"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "codexSafeMove": payload.get("codexSafeMove"),
        "counts": {
            "assetCount": payload.get("assetCount"),
            "originalCount": payload.get("originalCount"),
            "proxyCount": payload.get("proxyCount"),
            "companionCount": payload.get("companionCount"),
            "sourcePaths": len(payload.get("sourcePaths") or []),
            "localProofCommandReady": bool(payload.get("firstLocalProofCommand")),
            "localProofOutputExists": bool(payload.get("firstLocalProofOutputExists")),
            "localProofReviewReady": bool(payload.get("firstLocalProofReviewCommand")),
        },
        "countsContext": payload.get("countsContext"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "sessionDir": str(out_dir),
        "firstSafeAction": payload.get("firstSafeAction"),
        "firstLocalProofCommand": payload.get("firstLocalProofCommand"),
        "firstLocalProofCandidateId": payload.get("firstLocalProofCandidateId"),
        "firstLocalProofAspect": payload.get("firstLocalProofAspect"),
        "firstLocalProofOutputPath": payload.get("firstLocalProofOutputPath"),
        "firstLocalProofOutputExists": payload.get("firstLocalProofOutputExists"),
        "firstLocalProofReviewCommand": payload.get("firstLocalProofReviewCommand"),
        "firstLocalProofSafety": payload.get("firstLocalProofSafety"),
        "truth": payload.get("truth"),
    }
    write_json(root / LATEST_NEXT_CARD, pointer)
    write_json(root / ALIAS_NEXT_CARD, pointer)
    print(json.dumps({
        "status": payload.get("status"),
        "label": payload.get("label"),
        "groupKey": payload.get("groupKey"),
        "route": payload.get("route"),
        "humanAsk": payload.get("humanQuestion"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "counts": pointer.get("counts"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "firstSafeAction": payload.get("firstSafeAction"),
        "firstLocalProofCommand": payload.get("firstLocalProofCommand"),
        "firstLocalProofCandidateId": payload.get("firstLocalProofCandidateId"),
        "firstLocalProofAspect": payload.get("firstLocalProofAspect"),
        "firstLocalProofOutputPath": payload.get("firstLocalProofOutputPath"),
        "firstLocalProofOutputExists": payload.get("firstLocalProofOutputExists"),
        "firstLocalProofReviewCommand": payload.get("firstLocalProofReviewCommand"),
        "truth": payload.get("truth"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
