#!/usr/bin/env python3
"""Build review-only work orders for alternate episode duration versions.

This turns the duration experiment matrix into concrete, named local work
orders. It does not render, trim, approve, publish, upload, schedule, mutate
sources, overwrite versions, delete files, or create receipt truth.
"""
from __future__ import annotations

import html
import json
import re
import shlex
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
MATRIX_POINTER = RELEASE_ROOT / "review-board" / "duration-experiment-matrix" / "latest-duration-experiment-matrix.json"
OUT_ROOT = RELEASE_ROOT / "review-board" / "duration-version-workorders"
SCHEMA = "quipsly.episode-duration-version-workorders.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-duration-version-workorders")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def slug(value: str) -> str:
    value = value.lower().strip()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "duration-version"


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except Exception:
        return {}


def load_pointer_target(path: Path) -> dict[str, Any]:
    pointer = load_json(path)
    json_path = str(pointer.get("jsonPath") or "")
    target = load_json(Path(json_path)) if json_path and Path(json_path).exists() else {}
    return {**pointer, **target} if target else pointer


def option_family(index: int, option: dict[str, Any]) -> str:
    text = f"{option.get('name', '')} {option.get('target', '')} {option.get('use', '')}".lower()
    if any(word in text for word in ["highlight", "lean", "digest", "discovery", "salvage", "repair"]):
        return "lean-public-cut"
    if any(word in text for word in ["full", "archive", "complete", "boundary"]):
        return "archive-complete-cut"
    if index == 0:
        return "first-experiment-cut"
    if index == 1:
        return "standard-public-cut"
    return "archive-complete-cut"


def target_minutes_hint(target: str) -> dict[str, Any]:
    numbers = [int(n) for n in re.findall(r"\d+", str(target or ""))]
    if not numbers:
        return {"min": None, "max": None, "center": None}
    if len(numbers) == 1:
        return {"min": numbers[0], "max": numbers[0], "center": numbers[0]}
    low, high = min(numbers[:2]), max(numbers[:2])
    return {"min": low, "max": high, "center": round((low + high) / 2, 1)}


def platform_focus(family: str, target: str) -> list[str]:
    hint = target_minutes_hint(target)
    center = hint.get("center")
    if family == "archive-complete-cut" or (center and center >= 70):
        return ["Patreon/archive", "RSS podcast", "committed YouTube audience"]
    if center and center <= 35:
        return ["YouTube discovery", "new listener entry", "shorter podcast test"]
    return ["Primary YouTube", "Spotify video", "RSS podcast"]


def build_workorder(ep: dict[str, Any], option: dict[str, Any], index: int) -> dict[str, Any]:
    episode_number = int(ep.get("episode") or 0)
    family = option_family(index, option)
    variant_slug = slug(str(option.get("name") or f"option-{index + 1}"))
    workorder_id = f"ep{episode_number:02d}-{variant_slug}"
    target = str(option.get("target") or "needs-duration-target")
    warning = str(ep.get("durationSeverity") or "unknown")
    caution = []
    if warning not in {"aligned", "none", "ok", "unknown"}:
        caution.append("Duration mismatch exists in current package evidence; verify A/V boundaries before rendering this version.")
    if episode_number == 4:
        caution.append("Episode 4 has known capture/sync complexity; prefer recipe and sync review before any export attempt.")
    if family == "archive-complete-cut":
        caution.append("Archive/complete cuts preserve context but should not be mistaken for the best discovery cut.")
    if family == "lean-public-cut":
        caution.append("Lean cuts improve approachability but need human review to ensure the conversation still feels fair and complete.")
    return {
        "workOrderId": workorder_id,
        "episode": episode_number,
        "episodeLabel": f"Episode {episode_number}",
        "priority": index + 1,
        "versionFamily": family,
        "variantName": str(option.get("name") or "Duration candidate"),
        "targetDuration": target,
        "targetMinutesHint": target_minutes_hint(target),
        "intendedUse": str(option.get("use") or "Review candidate"),
        "editorialTradeoff": str(option.get("tradeoff") or "Needs human review."),
        "platformFocus": platform_focus(family, target),
        "currentVersionDisplay": str(ep.get("versionDisplay") or "unknown"),
        "currentStatus": str(ep.get("status") or "unknown"),
        "currentDurations": ep.get("currentDurations") or {},
        "durationSpreadLabel": str(ep.get("durationSpreadLabel") or "unknown"),
        "durationSeverity": warning,
        "evidence": ep.get("evidence") or {},
        "readyShorts": int(ep.get("readyShorts") or 0),
        "renderStatus": "not-rendered",
        "approvalState": "not-approved",
        "publicationState": "not-published",
        "receiptState": "empty-local-planning-only",
        "recipeState": "not-created",
        "safeNextAction": f"Create a versioned edit recipe for {workorder_id}, then review the recipe before rendering.",
        "operatorCautions": caution,
        "truth": {
            "reviewOnly": True,
            "workOrderOnly": True,
            "editRecipeCreated": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
        },
    }


def build() -> dict[str, Any]:
    matrix = load_pointer_target(MATRIX_POINTER)
    episodes = matrix.get("episodes") if isinstance(matrix.get("episodes"), list) else []
    episode_packets: list[dict[str, Any]] = []
    workorders: list[dict[str, Any]] = []
    for ep in episodes:
        if not isinstance(ep, dict):
            continue
        ep_workorders = []
        for index, option in enumerate(ep.get("experiments") or []):
            if not isinstance(option, dict):
                continue
            workorder = build_workorder(ep, option, index)
            ep_workorders.append(workorder)
            workorders.append(workorder)
        episode_packets.append({
            "episode": ep.get("episode"),
            "status": ep.get("status"),
            "currentVersionDisplay": ep.get("versionDisplay"),
            "currentDurations": ep.get("currentDurations") or {},
            "durationSpreadLabel": ep.get("durationSpreadLabel"),
            "durationSeverity": ep.get("durationSeverity"),
            "workOrders": ep_workorders,
            "recommendedFirstWorkOrderId": ep_workorders[0]["workOrderId"] if ep_workorders else "",
        })
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "duration-version-workorders-ready" if workorders else "duration-version-workorders-empty",
        "releaseRoot": str(RELEASE_ROOT),
        "sourceDurationMatrixJson": str(matrix.get("jsonPath") or MATRIX_POINTER),
        "sourceDurationMatrixHtml": str(matrix.get("htmlPath") or ""),
        "counts": {
            "episodes": len(episode_packets),
            "workOrders": len(workorders),
            "firstPriorityWorkOrders": len([w for w in workorders if w.get("priority") == 1]),
            "warningWorkOrders": len([w for w in workorders if w.get("operatorCautions")]),
            "exportsRendered": 0,
            "receiptTruthCreated": 0,
        },
        "truth": {
            "reviewOnly": True,
            "workOrdersOnly": True,
            "editRecipesCreated": False,
            "exportsRendered": False,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "filesDeleted": False,
        },
        "nextSafestAction": "Pick one work order per episode and create edit recipes before rendering any new duration versions.",
        "episodes": episode_packets,
        "workOrders": workorders,
    }


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Episode duration version work orders",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "These are local, review-only work orders for alternate episode runtimes. They name the target and tradeoff; they do not render files.",
        "",
        f"Source matrix: `{payload.get('sourceDurationMatrixHtml') or payload.get('sourceDurationMatrixJson')}`",
        "",
        "## Recommended sequence",
        "",
        "1. Start with the first-priority work order for Episodes 2 and 3 because their current A/V evidence is aligned enough for clean comparison.",
        "2. Treat Episode 1 as a boundary repair/review before choosing whether to preserve the longer video tail.",
        "3. Treat Episode 4 as sync repair first, duration version second.",
        "4. Use Episodes 5 and 6 to compare long-form audience depth against leaner discovery cuts.",
        "",
        "## Work orders",
        "",
        "| ID | Target | Use | Tradeoff | Safe next action |",
        "|---|---:|---|---|---|",
    ]
    for workorder in payload.get("workOrders") or []:
        lines.append(
            f"| `{workorder['workOrderId']}` | {workorder['targetDuration']} | {workorder['intendedUse']} | {workorder['editorialTradeoff']} | {workorder['safeNextAction']} |"
        )
    lines.extend([
        "",
        "## Safety boundary",
        "",
        "- No source media, original photos, manuscripts, existing exports, external accounts, schedules, approvals, publications, or receipts were mutated.",
        "- These work orders are a bridge from duration planning to versioned edit recipes. They are not exports and not publication approval.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    cards = []
    for episode in payload.get("episodes") or []:
        order_cards = []
        for workorder in episode.get("workOrders") or []:
            cautions = "".join(f"<li>{esc(caution)}</li>" for caution in workorder.get("operatorCautions") or [])
            platforms = " · ".join(str(x) for x in workorder.get("platformFocus") or [])
            order_cards.append(f"""
            <article class="workorder family-{esc(workorder.get('versionFamily'))}">
              <p class="eyebrow">{esc(workorder.get('workOrderId'))} · priority {esc(workorder.get('priority'))}</p>
              <h3>{esc(workorder.get('variantName'))} <span>{esc(workorder.get('targetDuration'))}</span></h3>
              <p><b>Use:</b> {esc(workorder.get('intendedUse'))}</p>
              <p><b>Tradeoff:</b> {esc(workorder.get('editorialTradeoff'))}</p>
              <p><b>Platform focus:</b> {esc(platforms)}</p>
              <p><b>State:</b> recipe {esc(workorder.get('recipeState'))} · render {esc(workorder.get('renderStatus'))} · receipt {esc(workorder.get('receiptState'))}</p>
              {f'<ul class="cautions">{cautions}</ul>' if cautions else ''}
              <p class="next">{esc(workorder.get('safeNextAction'))}</p>
            </article>
            """)
        cards.append(f"""
        <section class="episode">
          <p class="eyebrow">Episode {esc(episode.get('episode'))} · {esc(episode.get('status'))}</p>
          <h2>{esc(episode.get('currentVersionDisplay'))}</h2>
          <p class="muted">Current: 16:9 {esc((episode.get('currentDurations') or {}).get('video16x9'))} · 9:16 {esc((episode.get('currentDurations') or {}).get('video9x16'))} · podcast {esc((episode.get('currentDurations') or {}).get('podcastAudio'))}</p>
          <p class="muted">Duration state: {esc(episode.get('durationSpreadLabel'))} / {esc(episode.get('durationSeverity'))}</p>
          <div class="grid">{''.join(order_cards)}</div>
        </section>
        """)
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Episode duration version work orders</title>
<style>
:root {{ color-scheme:dark; --bg:#101710; --panel:#1d281b; --panel2:#253420; --ink:#fbf2db; --muted:#c5b99e; --gold:#eacb5a; --leaf:#7bd98b; --clay:#d27854; --line:#3b4f34; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(123,217,139,.18),transparent 32%),linear-gradient(145deg,#101710,#1a1d14); color:var(--ink); }}
main {{ max-width:1240px; margin:0 auto; padding:36px 24px 72px; }}
header,.episode {{ border:1px solid var(--line); border-radius:26px; background:rgba(29,40,27,.93); padding:24px; margin:18px 0; box-shadow:0 18px 50px rgba(0,0,0,.25); }}
h1 {{ margin:0 0 12px; font-size:clamp(38px,6vw,72px); line-height:.92; }}
h2 {{ margin:.1rem 0 .4rem; }}
h3 {{ margin:.2rem 0 .7rem; }}
h3 span {{ color:var(--gold); float:right; font-size:.92rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.16em; font-size:12px; font-weight:900; }}
.muted {{ color:var(--muted); }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(270px,1fr)); gap:14px; }}
.workorder {{ background:linear-gradient(180deg,rgba(37,52,32,.96),rgba(21,30,20,.96)); border:1px solid var(--line); border-radius:20px; padding:16px; }}
.family-lean-public-cut {{ border-color:rgba(123,217,139,.65); }}
.family-standard-public-cut,.family-first-experiment-cut {{ border-color:rgba(234,203,90,.65); }}
.family-archive-complete-cut {{ border-color:rgba(210,120,84,.65); }}
.cautions {{ color:#ffd8a8; }}
.next {{ color:var(--leaf); font-weight:800; }}
code {{ color:var(--gold); }}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Studio · Review-only</p><h1>Duration version work orders</h1><p>Named alternate runtime targets for Episodes 1-6. These are recipe cards, not renders. Originals stay whole; decisions stay transparent.</p><p><b>Next safest action:</b> {esc(payload.get('nextSafestAction'))}</p></header>
{''.join(cards)}
<section class="episode"><p class="eyebrow">Safety</p><p>No export, approval, upload, publication, schedule, overwrite, source mutation, delete, or receipt truth was created by this packet.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    payload = build()
    session_dir = OUT_ROOT / stamp()
    session_dir.mkdir(parents=True, exist_ok=True)
    json_path = session_dir / "duration-version-workorders.json"
    html_path = session_dir / "index.html"
    markdown_path = session_dir / "START-HERE-duration-version-workorders.md"
    payload.update({
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open duration version work orders",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local duration work-order evidence only. It does not render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_html(html_path, payload)
    latest = OUT_ROOT / "latest-duration-version-workorders.json"
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": payload["status"],
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "counts": payload.get("counts") or {},
        "firstSafeAction": payload.get("firstSafeAction") or {},
    }, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
