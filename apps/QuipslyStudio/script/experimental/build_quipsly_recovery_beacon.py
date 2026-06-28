#!/usr/bin/env python3
"""Build a compact Quipsly recovery beacon.

The beacon is intentionally smaller than the OS board. It exists for crash,
context-window, thread, and handoff recovery: open this first, then follow the
few linked artifacts that prove what is moving, what is blocked, and what is
safe. It reads existing pointer files and writes a local report only.
"""

from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OS_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS")
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_PHOTO_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/PhotoGrove")
SCHEMA = "quipsly.recovery-beacon.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"status": "load-error", "path": str(path)}
    return payload if isinstance(payload, dict) else {}


def load_pointer(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    target = pointer.get("jsonPath") or pointer.get("latest")
    if target:
        target_path = Path(str(target))
        if target_path.exists() and target_path != path:
            target_payload = load_json(target_path)
            if target_payload:
                return {**pointer, **target_payload}
    return pointer


def best_path(payload: dict[str, Any]) -> str:
    for key in ("htmlPath", "markdownPath", "jsonPath", "path"):
        value = payload.get(key)
        if value:
            return str(value)
    return ""


def card(
    *,
    lane: str,
    label: str,
    pointer_path: Path,
    why: str,
    safe_action: str,
    risk: str = "local-read-only",
) -> dict[str, Any]:
    payload = load_pointer(pointer_path)
    path = best_path(payload)
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    return {
        "lane": lane,
        "label": label,
        "status": str(payload.get("status") or "missing-pointer"),
        "pointerPath": str(pointer_path),
        "path": path,
        "pathExists": bool(path and Path(path).exists()),
        "openCommand": f"open {shell_quote(path)}" if path else "",
        "why": why,
        "safeAction": safe_action,
        "risk": risk,
        "counts": counts,
        "truth": str(payload.get("truth") or ""),
    }


def status_from(cards: list[dict[str, Any]]) -> str:
    missing = [row for row in cards if row["status"] == "missing-pointer" or not row["pathExists"]]
    blockers = [row for row in cards if "blocker" in row["status"] or "found" in row["status"] or "known" in row["status"]]
    copying = [row for row in cards if "copying" in row["status"]]
    if missing:
        return "recovery-beacon-needs-pointer-refresh"
    if copying or blockers:
        return "recovery-beacon-ready-with-known-work"
    return "recovery-beacon-ready"


def build_html(payload: dict[str, Any]) -> str:
    rows = "\n".join(
        f"""
        <article class="card">
          <div class="meta">{html.escape(row['lane'])}</div>
          <h2>{html.escape(row['label'])}</h2>
          <p class="status">{html.escape(row['status'])}</p>
          <p>{html.escape(row['why'])}</p>
          <p><strong>Next:</strong> {html.escape(row['safeAction'])}</p>
          <code>{html.escape(row['openCommand'] or row['pointerPath'])}</code>
          <details><summary>Counts</summary><pre>{html.escape(json.dumps(row['counts'], indent=2, sort_keys=True))}</pre></details>
        </article>
        """
        for row in payload["cards"]
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quipsly recovery beacon</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f7f0e3; --ink:#30281f; --muted:#756b5c; --leaf:#2f6f4e; --honey:#d7a139; --clay:#b96145; --card:rgba(255,252,244,.9); }}
    body {{ margin:0; font-family:ui-rounded,"Avenir Next","Gill Sans",system-ui,sans-serif; color:var(--ink); background:radial-gradient(circle at top left,rgba(47,111,78,.18),transparent 30rem),radial-gradient(circle at 80% 12%,rgba(215,161,57,.22),transparent 28rem),var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:42px 24px; }}
    .eyebrow {{ text-transform:uppercase; letter-spacing:.18em; color:var(--leaf); font-weight:900; font-size:.75rem; }}
    h1 {{ margin:.2rem 0 1rem; font-size:clamp(2.5rem,6vw,5.5rem); line-height:.9; letter-spacing:-.065em; }}
    .deck {{ max-width:820px; color:var(--muted); line-height:1.55; font-size:1.08rem; }}
    .banner {{ display:inline-flex; padding:10px 14px; border-radius:999px; border:1px solid rgba(48,40,31,.16); background:var(--card); font-weight:900; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-top:28px; }}
    .card {{ background:var(--card); border:1px solid rgba(48,40,31,.12); border-radius:26px; padding:22px; box-shadow:0 18px 42px rgba(48,40,31,.08); }}
    .meta {{ color:var(--honey); text-transform:uppercase; letter-spacing:.14em; font-size:.72rem; font-weight:900; }}
    h2 {{ margin:.35rem 0 .45rem; font-size:1.3rem; }}
    .status {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(47,111,78,.12); color:var(--leaf); font-weight:900; }}
    code, pre {{ display:block; white-space:pre-wrap; overflow-wrap:anywhere; border-radius:14px; background:rgba(48,40,31,.08); padding:11px; }}
    .safety {{ margin-top:28px; padding:18px 20px; border-radius:22px; background:rgba(47,111,78,.12); }}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Quipsly OS</div>
  <h1>Recovery beacon</h1>
  <p class="deck">If a thread, app, context window, or human train of thought crashes, start here. This page does not prove finished publication; it points to the latest local truth surfaces and keeps the next action reversible.</p>
  <div class="banner">{html.escape(payload['status'])} · {html.escape(payload['updatedAt'])}</div>
  <section class="grid">{rows}</section>
  <section class="safety">
    <strong>Safety truth:</strong> local recovery report only. It does not mutate original media, photos, manuscripts, exports, approvals, uploads, schedules, accounts, public publications, or receipt truth.
  </section>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Quipsly recovery beacon",
        "",
        f"Status: {payload['status']}",
        f"Updated: {payload['updatedAt']}",
        "",
        "Open this after a thread, context window, app, or workflow crash.",
        "",
    ]
    for row in payload["cards"]:
        lines += [
            f"## {row['label']}",
            f"- Lane: {row['lane']}",
            f"- Status: {row['status']}",
            f"- Why: {row['why']}",
            f"- Next safe action: {row['safeAction']}",
            f"- Open: `{row['openCommand'] or row['pointerPath']}`",
            "",
        ]
    lines += [
        "## Safety",
        "- Source media/photos/manuscripts mutated: false",
        "- Versions overwritten: false",
        "- External upload/publish/schedule/account mutation: false",
        "- Receipt truth created: false",
        "",
    ]
    return "\n".join(lines)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    os_root = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] else DEFAULT_OS_ROOT
    release_root = DEFAULT_RELEASE_ROOT
    photo_root = DEFAULT_PHOTO_ROOT
    out_dir = os_root / "RecoveryBeacons" / f"{stamp()}-quipsly-recovery-beacon"
    out_dir.mkdir(parents=True, exist_ok=True)

    cards = [
        card(
            lane="Whole OS",
            label="Latest full refresh",
            pointer_path=os_root / "latest-quipsly-os-refresh.json",
            why="Shows whether the cross-lane conveyor ran, which failures were automation issues, and which blockers are honest content/readiness truth.",
            safe_action="Open first when recovering a long goal run.",
        ),
        card(
            lane="Whole OS",
            label="Return brief",
            pointer_path=os_root / "latest-quipsly-return-brief.json",
            why="Human/agent friendly front door for the next reversible action across Studio, Nest, Tower, Photo Grove, and 360.",
            safe_action="Use this for the next work item after checking refresh status.",
        ),
        card(
            lane="Photo Grove",
            label="Live card intake",
            pointer_path=photo_root / "latest-photo-grove-live-intake-status.json",
            why="Shows whether Bender/My Passport copying is still moving and whether Photo Grove has safe local intake material.",
            safe_action="Keep drives mounted while status says copying; do not cloud-mirror until receipts are clean and approved.",
        ),
        card(
            lane="Studio",
            label="Package blocker triage",
            pointer_path=release_root / "review-board/latest-studio-package-blocker-triage.json",
            why="Turns package validation blockers into grouped next actions instead of a vague scary failure.",
            safe_action="Fix or route around the first package blocker without claiming publication readiness.",
        ),
        card(
            lane="Whole OS",
            label="Final OS validation",
            pointer_path=os_root / "latest-quipsly-os-validation.json",
            why="Confirms the current pointer/readiness surfaces are internally navigable.",
            safe_action="Use this as confidence evidence, not as proof that creative output is finished.",
        ),
    ]
    payload = {
        "schema": SCHEMA,
        "status": status_from(cards),
        "updatedAt": iso_now(),
        "cards": cards,
        "counts": {
            "cards": len(cards),
            "missingPointers": sum(1 for row in cards if row["status"] == "missing-pointer" or not row["pathExists"]),
            "knownWorkCards": sum(1 for row in cards if "copying" in row["status"] or "blocker" in row["status"] or "found" in row["status"] or "known" in row["status"]),
        },
        "truth": "Recovery beacon only. It reads latest local pointer files and writes a local report; it does not mutate sources, metadata, exports, approvals, uploads, schedules, account state, public publication, or receipt truth.",
        "safety": {
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalUpload": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "accountMutation": False,
            "receiptTruthCreated": False,
        },
    }
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-quipsly-recovery-beacon.md"
    json_path = out_dir / "quipsly-recovery-beacon.json"
    html_path.write_text(build_html(payload), encoding="utf-8")
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")
    full_payload = {**payload, "htmlPath": str(html_path), "markdownPath": str(markdown_path), "jsonPath": str(json_path)}
    write_json(json_path, full_payload)
    pointer = {
        "status": payload["status"],
        "updatedAt": payload["updatedAt"],
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "jsonPath": str(json_path),
        "counts": payload["counts"],
        "truth": payload["truth"],
    }
    write_json(os_root / "latest-quipsly-recovery-beacon.json", pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
