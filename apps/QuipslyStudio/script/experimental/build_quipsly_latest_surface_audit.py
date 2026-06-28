#!/usr/bin/env python3
"""Audit Quipsly's latest-* JSON surfaces for calm handoff truth.

This is intentionally read-only. Latest pointers are product surfaces for both
humans and agents: they should be findable, nameable, openable, and explicit
about what a human should decide versus what Codex can safely improve.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_MEDIA_ROOT = DEFAULT_OS_ROOT.parent
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.os.latest-surface-audit.v1"
MAX_POINTERS = 260
SKIP_DIRS = {
    ".Spotlight-V100",
    ".Trashes",
    ".fseventsd",
    "DerivedData",
    "node_modules",
    "__pycache__",
}
EXTERNAL_MUTATION_KEYS = {
    "externalPublishing",
    "externalSchedulesCreated",
    "receiptTruthCreated",
    "sourceFilesMutated",
    "sourceMediaMutated",
    "originalsMutated",
    "versionsOverwritten",
    "clientDeliveryCreated",
    "canonicalManuscriptReplaced",
    "copyPlanExecuted",
    "uploadsCreated",
    "published",
    "publicationComplete",
}
TECHNICAL_ARTIFACT_POINTER_NAMES = {
    "latest-release-export-manifest.json",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-latest-surface-audit")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def unique_existing_roots(release_root: Path, media_root: Path, os_root: Path) -> list[Path]:
    candidates = [
        release_root,
        release_root / "review-board",
        release_root / "tower-publication-control-room",
        release_root / "tower-manual-packet-board",
        media_root / "PhotoGrove",
        media_root / "NestWriting",
        media_root / "Studio360",
        media_root / "ProductionRunway",
        os_root,
    ]
    seen: set[str] = set()
    roots: list[Path] = []
    for root in candidates:
        key = str(root)
        if key in seen or not root.exists():
            continue
        seen.add(key)
        roots.append(root)
    return roots


def discover_latest_pointers(roots: list[Path]) -> list[Path]:
    pointers: list[Path] = []
    seen: set[str] = set()
    for root in roots:
        if root.is_file():
            paths = [root]
        else:
            paths = []
            for current_root, dirs, files in os.walk(root):
                dirs[:] = [name for name in dirs if name not in SKIP_DIRS]
                for filename in files:
                    if filename.startswith("latest-") and filename.endswith(".json"):
                        paths.append(Path(current_root) / filename)
        for path in sorted(paths):
            key = str(path)
            if key in seen:
                continue
            seen.add(key)
            pointers.append(path)
            if len(pointers) >= MAX_POINTERS:
                return pointers
    return pointers


def choose_text(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def choose_dict(*values: Any) -> dict[str, Any]:
    for value in values:
        if isinstance(value, dict):
            return value
    return {}


def first_path(*values: Any) -> str:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def path_exists(value: str) -> bool:
    if not value or value.startswith(("http://", "https://")):
        return False
    return Path(value).exists()


def walk_dict(value: Any, path: str = "$") -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = [(path, value)]
    if isinstance(value, dict):
        for key, child in value.items():
            rows.extend(walk_dict(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            rows.extend(walk_dict(child, f"{path}[{index}]"))
    return rows


def unsafe_truth_claims(pointer: dict[str, Any], payload: dict[str, Any]) -> list[dict[str, Any]]:
    claims: list[dict[str, Any]] = []
    for label, item in (("pointer", pointer), ("payload", payload)):
        for path_expr, value in walk_dict(item):
            key = path_expr.split(".")[-1]
            if key not in EXTERNAL_MUTATION_KEYS:
                continue
            if value in {True, "true", "True", "published", "complete", "yes", "posted", "uploaded"}:
                claims.append({"source": label, "path": path_expr, "value": value})
    return claims


def normalize_surface(pointer_path: Path) -> dict[str, Any]:
    pointer = load_json(pointer_path)
    json_path_text = choose_text(pointer.get("jsonPath"))
    target_path = Path(json_path_text) if json_path_text else pointer_path
    target_exists = target_path.exists()
    payload = load_json(target_path) if target_exists else {}
    if target_path == pointer_path:
        payload = pointer

    first_action = choose_dict(pointer.get("firstSafeAction"), payload.get("firstSafeAction"))
    title = choose_text(
        pointer.get("title"),
        pointer.get("displayTitle"),
        pointer.get("label"),
        pointer.get("action"),
        payload.get("title"),
        payload.get("displayTitle"),
        payload.get("label"),
        payload.get("action"),
        pointer_path.stem.removeprefix("latest-").replace("-", " ").title(),
    )
    status = choose_text(pointer.get("status"), payload.get("status"))
    human_ask = choose_text(pointer.get("humanAsk"), payload.get("humanAsk"))
    agent_work = choose_text(pointer.get("agentSafeParallelWork"), payload.get("agentSafeParallelWork"))
    next_action = choose_text(pointer.get("nextSafestAction"), payload.get("nextSafestAction"))
    open_path = first_path(
        first_action.get("path"),
        pointer.get("htmlPath"),
        payload.get("htmlPath"),
        pointer.get("markdownPath"),
        payload.get("markdownPath"),
        pointer.get("jsonPath"),
        payload.get("jsonPath"),
        str(pointer_path),
    )
    command = choose_text(first_action.get("command"))
    if not command and open_path:
        command = f"open {shell_quote(open_path)}" if path_exists(open_path) else ""
    open_exists = path_exists(open_path)
    claims = unsafe_truth_claims(pointer, payload)
    is_technical_artifact = pointer_path.name in TECHNICAL_ARTIFACT_POINTER_NAMES
    if is_technical_artifact:
        status = status or "technical-artifact-ready"
        human_ask = human_ask or "No direct human decision is required on this raw manifest; use the paired review board, release board, or Tower packet for approval decisions."
        agent_work = agent_work or "Use this manifest as read-only evidence for validation, review packets, and release comparisons. Do not publish, approve, upload, overwrite, delete, mutate sources, or create receipts from the manifest alone."
        next_action = next_action or "Keep this manifest as evidence and route human decisions through the current review/Tower surfaces."
    missing: list[str] = []
    if not status:
        missing.append("status")
    if not title:
        missing.append("title")
    if not target_exists:
        missing.append("targetJson")
    if not human_ask:
        missing.append("humanAsk")
    if not agent_work:
        missing.append("agentSafeParallelWork")
    if not next_action:
        missing.append("nextSafestAction")
    if not command:
        missing.append("firstSafeAction.command")
    if not open_path:
        missing.append("firstSafeAction.path")
    elif open_path.startswith("/") and not open_exists:
        missing.append("openTargetExists")
    severity = "blocked" if claims or not target_exists else "needs-handoff" if missing else "ready"
    return {
        "pointerPath": str(pointer_path),
        "title": title,
        "status": status,
        "surfaceKind": "technical-artifact" if is_technical_artifact else "handoff-surface",
        "targetJsonPath": str(target_path),
        "targetJsonExists": target_exists,
        "htmlPath": choose_text(pointer.get("htmlPath"), payload.get("htmlPath")),
        "markdownPath": choose_text(pointer.get("markdownPath"), payload.get("markdownPath")),
        "openPath": open_path,
        "openPathExists": open_exists,
        "openCommand": command,
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_work,
        "nextSafestAction": next_action,
        "missing": missing,
        "unsafeTruthClaims": claims,
        "severity": severity,
    }


def build_payload(os_root: Path, release_root: Path, media_root: Path) -> dict[str, Any]:
    roots = unique_existing_roots(release_root, media_root, os_root)
    pointers = discover_latest_pointers(roots)
    surfaces = [normalize_surface(path) for path in pointers]
    blocked = [surface for surface in surfaces if surface["severity"] == "blocked"]
    needs_handoff = [surface for surface in surfaces if surface["severity"] == "needs-handoff"]
    ready = [surface for surface in surfaces if surface["severity"] == "ready"]
    by_missing: dict[str, int] = {}
    for surface in needs_handoff:
        for field in surface.get("missing") or []:
            by_missing[field] = by_missing.get(field, 0) + 1
    status = "blocked" if blocked else "needs-attention" if needs_handoff else "ready"
    next_action = (
        "Fix blocked latest pointers first; they have missing targets or unsafe truth claims."
        if blocked
        else "Add handoff fields to the highest-traffic latest pointers that still need attention."
        if needs_handoff
        else "Keep using latest pointers as calm human/agent front doors."
    )
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "roots": [str(root) for root in roots],
        "counts": {
            "pointers": len(surfaces),
            "ready": len(ready),
            "needsHandoff": len(needs_handoff),
            "blocked": len(blocked),
            "unsafeTruthClaims": sum(len(surface.get("unsafeTruthClaims") or []) for surface in surfaces),
        },
        "missingFieldCounts": dict(sorted(by_missing.items(), key=lambda item: (-item[1], item[0]))),
        "blockedSurfaces": blocked[:20],
        "needsHandoffSurfaces": needs_handoff[:60],
        "readySurfaces": ready[:80],
        "surfaces": surfaces,
        "humanAsk": "Open this audit when a latest board, packet, or review surface feels confusing. Use it to pick which pointer needs clearer handoff language next.",
        "agentSafeParallelWork": "Codex may add missing status, humanAsk, agentSafeParallelWork, nextSafestAction, firstSafeAction, aliases, and open targets to local latest surfaces. Do not mutate originals, approve reviews, create receipt truth, publish, upload, schedule, delete, or overwrite versions.",
        "nextSafestAction": next_action,
        "truth": {
            "readOnlyAudit": True,
            "sourceFilesMutated": False,
            "sourceMediaMutated": False,
            "originalsMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "clientDeliveryCreated": False,
            "canonicalManuscriptReplaced": False,
        },
    }


def prepare_output_dir(os_root: Path) -> Path:
    out_dir = os_root / "LatestSurfaceAudits" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Quipsly latest surface audit",
        "",
        f"- Generated: `{payload['generatedAt']}`",
        f"- Status: `{payload['status']}`",
        f"- Pointers: `{payload['counts']['pointers']}`",
        f"- Ready: `{payload['counts']['ready']}`",
        f"- Needs handoff: `{payload['counts']['needsHandoff']}`",
        f"- Blocked: `{payload['counts']['blocked']}`",
        "",
        payload["humanAsk"],
        "",
        "Agent-safe parallel work:",
        "",
        payload["agentSafeParallelWork"],
        "",
        "## Missing-field pressure",
        "",
    ]
    for field, count in payload.get("missingFieldCounts", {}).items():
        lines.append(f"- `{field}`: `{count}`")
    lines.extend(["", "## Blocked surfaces", ""])
    for surface in payload.get("blockedSurfaces") or []:
        lines.append(f"- **{surface.get('title')}** - `{surface.get('pointerPath')}` - missing `{', '.join(surface.get('missing') or [])}`")
    lines.extend(["", "## Needs handoff", ""])
    for surface in payload.get("needsHandoffSurfaces") or []:
        lines.append(f"- **{surface.get('title')}** - missing `{', '.join(surface.get('missing') or [])}` - `{surface.get('pointerPath')}`")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["severity", "title", "status", "pointerPath", "targetJsonPath", "openPath", "missing", "nextSafestAction"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for surface in payload.get("surfaces") or []:
            writer.writerow({
                "severity": surface.get("severity", ""),
                "title": surface.get("title", ""),
                "status": surface.get("status", ""),
                "pointerPath": surface.get("pointerPath", ""),
                "targetJsonPath": surface.get("targetJsonPath", ""),
                "openPath": surface.get("openPath", ""),
                "missing": ", ".join(surface.get("missing") or []),
                "nextSafestAction": surface.get("nextSafestAction", ""),
            })


def write_html(path: Path, payload: dict[str, Any]) -> None:
    rows = []
    for surface in (payload.get("blockedSurfaces") or []) + (payload.get("needsHandoffSurfaces") or [])[:80]:
        rows.append(f"""
        <article class="surface {esc(surface.get('severity'))}">
          <div class="kicker">{esc(surface.get('severity'))}</div>
          <h2>{esc(surface.get('title'))}</h2>
          <p>Status: <code>{esc(surface.get('status'))}</code></p>
          <p>Missing: <code>{esc(', '.join(surface.get('missing') or []))}</code></p>
          <p>Pointer: <code>{esc(surface.get('pointerPath'))}</code></p>
          <p>Open: <code>{esc(surface.get('openCommand'))}</code></p>
        </article>
        """)
    counts = payload.get("counts") or {}
    missing = "".join(
        f"<span><b>{esc(field)}</b> {esc(count)}</span>"
        for field, count in (payload.get("missingFieldCounts") or {}).items()
    )
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly Latest Surface Audit</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101711; --panel:#1a261c; --ink:#fff4d8; --muted:#d4c5a3; --line:rgba(255,244,216,.16); --honey:#e8bf52; --moss:#79c982; --creek:#62c7d7; --clay:#d9775d; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:radial-gradient(circle at 15% 0%, rgba(98,199,215,.17), transparent 32rem), linear-gradient(180deg,#142116,#080d09); color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:42px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow, .kicker {{ color:var(--honey); font-size:12px; letter-spacing:.22em; text-transform:uppercase; font-weight:950; }}
    h1 {{ margin:10px 0; max-width:1020px; font-size:clamp(42px,7vw,82px); line-height:.92; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary, .missing {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .summary span, .missing span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:14px; }}
    .surface {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(26,38,28,.9); }}
    .surface.blocked {{ border-color:rgba(217,119,93,.7); }}
    .surface.needs-handoff {{ border-color:rgba(232,191,82,.48); }}
    h2 {{ font-size:20px; margin:10px 0 6px; }}
    code {{ color:var(--creek); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly OS latest surfaces</div>
    <h1>Every front door should know what it is, who needs it, and what is safe next.</h1>
    <p>{esc(payload['humanAsk'])}</p>
    <p>{esc(payload['agentSafeParallelWork'])}</p>
    <div class="summary"><span>{counts.get('pointers', 0)} pointers</span><span>{counts.get('ready', 0)} ready</span><span>{counts.get('needsHandoff', 0)} need handoff</span><span>{counts.get('blocked', 0)} blocked</span></div>
    <div class="missing">{missing}</div>
  </header>
  <main>{''.join(rows)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit latest-* Quipsly JSON surfaces for handoff truth.")
    parser.add_argument("--os-root", default=str(DEFAULT_OS_ROOT))
    parser.add_argument("--release-root", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--media-root", default=str(DEFAULT_MEDIA_ROOT))
    args = parser.parse_args()

    os_root = Path(args.os_root)
    release_root = Path(args.release_root)
    media_root = Path(args.media_root)
    payload = build_payload(os_root, release_root, media_root)
    out_dir = prepare_output_dir(os_root)
    json_path = out_dir / "quipsly-latest-surface-audit.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-quipsly-latest-surface-audit.md"
    csv_path = out_dir / "quipsly-latest-surface-audit.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Quipsly Latest Surface Audit",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local latest-surface evidence only. It does not publish, upload, schedule, approve, mutate sources, create receipts, or overwrite versions.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    pointer = {
        "schema": "quipsly.os.latest-surface-audit-pointer.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status"),
        "counts": payload.get("counts"),
        "missingFieldCounts": payload.get("missingFieldCounts"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "humanAsk": payload.get("humanAsk"),
        "agentSafeParallelWork": payload.get("agentSafeParallelWork"),
        "nextSafestAction": payload.get("nextSafestAction"),
        "firstSafeAction": payload.get("firstSafeAction"),
        "truth": payload.get("truth"),
    }
    write_json(os_root / "latest-quipsly-latest-surface-audit.json", pointer)
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload.get("counts"),
        "nextSafestAction": payload.get("nextSafestAction"),
    }, indent=2, sort_keys=True))
    return 1 if payload.get("status") == "blocked" else 0


if __name__ == "__main__":
    raise SystemExit(main())
