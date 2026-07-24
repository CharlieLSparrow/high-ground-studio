#!/usr/bin/env python3
"""Build Studio360 reframe/export-prep recipes from workflow/proxy truth.

This script creates metadata recipes only. It does not render, transcode, move,
delete, upload, or mutate source media. It reads the latest 360 workflow packet
and optional managed proxy receipts, then writes reviewable 16:9 and 9:16
reframe plans for each source group.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
DEFAULT_WORKFLOW_POINTER = DEFAULT_OUTPUT_ROOT / "latest-360-workflow-packet.json"
DEFAULT_PROXY_POINTER = DEFAULT_OUTPUT_ROOT / "latest-360-proxy-prep.json"
DEFAULT_FAILURE_POINTER = DEFAULT_OUTPUT_ROOT / "latest-360-proxy-prep-failure.json"
DEFAULT_REPAIR_DECISIONS = DEFAULT_OUTPUT_ROOT / "repair-decisions.json"
PARKED_REPAIR_ACTIONS = {"park", "not-needed"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_workflow(value: str) -> Path:
    if value and value != "latest":
        path = Path(value).expanduser()
        if path.is_dir():
            return path / "360-workflow-packet.json"
        return path
    pointer = load_json(DEFAULT_WORKFLOW_POINTER)
    packet_path = pointer.get("packetPath")
    if not packet_path:
        raise SystemExit(f"No latest Studio360 workflow pointer found at {DEFAULT_WORKFLOW_POINTER}")
    return Path(str(packet_path))


def prepare_session(output_root: Path) -> Path:
    base = output_root / "reframe-prep" / datetime.now().strftime("%Y%m%d-%H%M%S")
    candidate = base
    counter = 2
    while candidate.exists():
        candidate = Path(f"{base}-{counter}")
        counter += 1
    candidate.mkdir(parents=True, exist_ok=False)
    return candidate


def asset_maps(packet: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        str(item.get("id")): item
        for item in packet.get("items") or []
        if isinstance(item, dict) and item.get("id")
    }


def first_asset(assets: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    return next((asset for asset in assets if asset.get("kind") == kind), None)


def asset_probe_error(asset: dict[str, Any]) -> str:
    probe = asset.get("probe") if isinstance(asset.get("probe"), dict) else {}
    return str(probe.get("ffprobeError") or probe.get("error") or "")


def best_duration(assets: list[dict[str, Any]]) -> float:
    for preferred in ("insta360-original-video", "proxy", "insta360-low-res-companion", "video-export-or-source"):
        asset = first_asset(assets, preferred)
        if not asset:
            continue
        probe = asset.get("probe") or {}
        try:
            duration = float(probe.get("durationSeconds") or 0)
        except Exception:
            duration = 0
        if duration > 0:
            return duration
    return 0


def select_review_source(group: dict[str, Any], assets: list[dict[str, Any]], latest_proxy: dict[str, Any]) -> dict[str, Any]:
    if latest_proxy.get("groupKey") == group.get("groupKey") and latest_proxy.get("proxyPath"):
        proxy_path = Path(str(latest_proxy.get("proxyPath")))
        return {
            "kind": "managed-proxy",
            "path": str(proxy_path),
            "available": proxy_path.exists(),
            "source": "latest-360-proxy-prep",
        }
    for kind, label in [
        ("proxy", "existing-proxy"),
        ("insta360-low-res-companion", "camera-low-res-companion"),
        ("video-export-or-source", "video-source"),
        ("insta360-original-video", "original-needs-proxy"),
    ]:
        asset = first_asset(assets, kind)
        if asset:
            path = Path(str(asset.get("sourcePath") or ""))
            probe_error = asset_probe_error(asset)
            return {
                "kind": label,
                "path": str(path),
                "available": path.exists() and not probe_error,
                "assetId": asset.get("id"),
                "source": "workflow-packet",
                "probeError": probe_error,
            }
    return {"kind": "missing-review-source", "path": "", "available": False, "source": "none"}


def load_repair_decisions(output_root: Path) -> dict[str, dict[str, Any]]:
    ledger = load_json(output_root / "repair-decisions.json")
    latest = ledger.get("latestByGroup") if isinstance(ledger.get("latestByGroup"), dict) else {}
    return {
        str(group_key): decision
        for group_key, decision in latest.items()
        if isinstance(decision, dict)
    }


def default_keyframes(duration: float, aspect: str) -> list[dict[str, Any]]:
    end_time = max(duration, 0)
    fov = 82 if aspect == "16:9" else 72
    return [
        {
            "timeSeconds": 0,
            "yaw": 0,
            "pitch": 0,
            "roll": 0,
            "fov": fov,
            "easing": "hold-baseline",
            "note": "Baseline framing. Adjust in Studio before export.",
        },
        {
            "timeSeconds": round(end_time, 3),
            "yaw": 0,
            "pitch": 0,
            "roll": 0,
            "fov": fov,
            "easing": "linear",
            "note": "End keyframe mirrors baseline until human/agent reframing changes it.",
        },
    ]


def build_recipe(group: dict[str, Any], aspect: str, duration: float, review_source: dict[str, Any]) -> dict[str, Any]:
    recipe_id = f"{group.get('id')}-{aspect.replace(':', 'x')}"
    return {
        "id": recipe_id,
        "groupId": group.get("id"),
        "groupKey": group.get("groupKey"),
        "outputAspect": aspect,
        "format": "mp4",
        "sequenceDurationSeconds": round(duration, 3),
        "reviewSource": review_source,
        "status": "ready-for-reframe-review" if review_source.get("available") and review_source.get("kind") != "original-needs-proxy" else "needs-proxy-or-source-repair",
        "keyframes": default_keyframes(duration, aspect),
        "exportCreated": False,
        "externalPublishing": False,
        "truth": "Recipe only. No video export has been rendered.",
    }


def build_group_payloads(packet: dict[str, Any], limit: int, output_root: Path) -> list[dict[str, Any]]:
    latest_proxy = load_json(DEFAULT_PROXY_POINTER)
    latest_failure = load_json(DEFAULT_FAILURE_POINTER)
    repair_decisions = load_repair_decisions(output_root)
    items_by_id = asset_maps(packet)
    payloads: list[dict[str, Any]] = []
    for group in (packet.get("groups") or [])[:limit if limit > 0 else None]:
        assets = [items_by_id[item_id] for item_id in group.get("assets") or [] if item_id in items_by_id]
        duration = best_duration(assets)
        review_source = select_review_source(group, assets, latest_proxy)
        failure = latest_failure if latest_failure.get("groupKey") == group.get("groupKey") else {}
        damaged_assets = [
            {
                "id": asset.get("id"),
                "filename": asset.get("filename"),
                "kind": asset.get("kind"),
                "sourcePath": asset.get("sourcePath"),
                "error": asset_probe_error(asset),
            }
            for asset in assets
            if asset_probe_error(asset)
        ]
        has_insta360_original = any(
            str(asset.get("kind") or "").startswith("insta360-original")
            for asset in assets
        )
        recipes = [
            build_recipe(group, "16:9", duration, review_source),
            build_recipe(group, "9:16", duration, review_source),
        ]
        repair_decision = repair_decisions.get(str(group.get("groupKey") or ""))
        status = "reframe-ready" if any(recipe["status"] == "ready-for-reframe-review" for recipe in recipes) else "blocked-needs-proxy"
        if not review_source.get("available") and (failure or damaged_assets):
            status = "blocked-media-repair" if has_insta360_original else "parked-damaged-source"
        if repair_decision:
            action = str(repair_decision.get("action") or "")
            if action in PARKED_REPAIR_ACTIONS:
                status = "parked-by-decision"
                for recipe in recipes:
                    recipe["status"] = "parked-source-not-for-export"
            elif action in {"needs-source", "needs-redownload", "needs-companion", "use-companion", "review", "pending"}:
                status = "blocked-media-repair" if status != "reframe-ready" else "reframe-ready"
        if status == "reframe-ready":
            next_action = "Open recipe for reframe review."
        elif status == "parked-by-decision":
            next_action = f"Parked by sidecar decision: {repair_decision.get('action')}. Keep source intact; do not include in exports unless a human reopens it."
        elif status == "blocked-media-repair":
            if repair_decision:
                next_action = f"Repair decision recorded as {repair_decision.get('action')}: {repair_decision.get('note') or 'repair/re-copy/companion needed before reframing.'}"
            else:
                next_action = "Repair or re-download source media, or attach a usable low-res companion/proxy before reframing."
        elif status == "parked-damaged-source":
            next_action = "Park this damaged non-360/root-level source unless a human confirms it belongs in the 360 workflow."
        else:
            next_action = "Generate a managed proxy before reframing."
        payloads.append({
            "id": group.get("id"),
            "groupKey": group.get("groupKey"),
            "workflowStatus": group.get("status"),
            "reframeStatus": status,
            "assetCount": group.get("assetCount"),
            "durationSeconds": round(duration, 3),
            "reviewSource": review_source,
            "latestFailure": {
                "manifestPath": failure.get("manifestPath") or "",
                "error": failure.get("error") or "",
                "sourcePath": failure.get("sourcePath") or "",
            } if failure else {},
            "repairDecision": repair_decision or {},
            "damagedAssets": damaged_assets,
            "sourceAssets": [
                {
                    "id": asset.get("id"),
                    "filename": asset.get("filename"),
                    "kind": asset.get("kind"),
                    "sourcePath": asset.get("sourcePath"),
                    "durationSeconds": (asset.get("probe") or {}).get("durationSeconds") or 0,
                    "probeError": asset_probe_error(asset),
                }
                for asset in assets
            ],
            "recipes": recipes,
            "nextSafestAction": next_action,
        })
    return payloads


def summarize(groups: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "groups": len(groups),
        "reframeReady": sum(1 for group in groups if group.get("reframeStatus") == "reframe-ready"),
        "blockedNeedsProxy": sum(1 for group in groups if group.get("reframeStatus") == "blocked-needs-proxy"),
        "blockedMediaRepair": sum(1 for group in groups if group.get("reframeStatus") == "blocked-media-repair"),
        "parkedDamagedSources": sum(1 for group in groups if group.get("reframeStatus") == "parked-damaged-source"),
        "parkedByDecision": sum(1 for group in groups if group.get("reframeStatus") == "parked-by-decision"),
        "damagedAssets": sum(len(group.get("damagedAssets") or []) for group in groups),
        "recipes": sum(len(group.get("recipes") or []) for group in groups),
        "exportsCreated": 0,
        "originalsMutated": 0,
    }


def write_csv(path: Path, groups: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "groupId",
            "groupKey",
            "reframeStatus",
            "reviewSourceKind",
            "reviewSourcePath",
            "durationSeconds",
            "damagedAssetCount",
            "recipeCount",
            "nextSafestAction",
        ])
        writer.writeheader()
        for group in groups:
            source = group.get("reviewSource") or {}
            writer.writerow({
                "groupId": group.get("id"),
                "groupKey": group.get("groupKey"),
                "reframeStatus": group.get("reframeStatus"),
                "reviewSourceKind": source.get("kind"),
                "reviewSourcePath": source.get("path"),
                "durationSeconds": group.get("durationSeconds"),
                "damagedAssetCount": len(group.get("damagedAssets") or []),
                "recipeCount": len(group.get("recipes") or []),
                "nextSafestAction": group.get("nextSafestAction"),
            })


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    lines = [
        "# Studio360 reframe/export prep",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        packet["truth"],
        "",
        "## Counts",
        "",
        f"- Groups: {counts['groups']}",
        f"- Reframe-ready: {counts['reframeReady']}",
        f"- Blocked, needs proxy: {counts['blockedNeedsProxy']}",
        f"- Blocked, media repair: {counts['blockedMediaRepair']}",
        f"- Parked damaged sources: {counts['parkedDamagedSources']}",
        f"- Parked by decision: {counts['parkedByDecision']}",
        f"- Damaged/unprobeable assets: {counts['damagedAssets']}",
        f"- Recipes: {counts['recipes']}",
        f"- Exports created: {counts['exportsCreated']}",
        "",
        "## First groups",
        "",
        "| Group | Status | Review source | Recipes | Next action |",
        "| --- | --- | --- | ---: | --- |",
    ]
    for group in packet.get("groups")[:80]:
        source = group.get("reviewSource") or {}
        damaged = len(group.get("damagedAssets") or [])
        lines.append(
            f"| `{group.get('groupKey')}` | {group.get('reframeStatus')} | {source.get('kind')} ({damaged} damaged) | {len(group.get('recipes') or [])} | {group.get('nextSafestAction')} |"
        )
    lines.extend([
        "",
        "## Safety",
        "",
        "- Originals mutated: false.",
        "- Exports created: false.",
        "- External publishing: false.",
        "- Recipes are metadata until an explicit approved export command renders derivatives.",
    ])
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    cards = []
    for group in packet.get("groups")[:160]:
        source = group.get("reviewSource") or {}
        recipes = "".join(
            f"<span>{html.escape(recipe['outputAspect'])}: {html.escape(recipe['status'])}</span>"
            for recipe in group.get("recipes") or []
        )
        cards.append(f"""
          <article class="{html.escape(str(group.get('reframeStatus')))}">
            <div class="eyebrow">{html.escape(str(group.get('reframeStatus')))}</div>
            <h2>{html.escape(str(group.get('groupKey')))}</h2>
            <p>{html.escape(str(group.get('nextSafestAction')))}</p>
            <p><b>{html.escape(str(source.get('kind')))}</b><br><small>{html.escape(str(source.get('path')))}</small></p>
            <p><small>{len(group.get('damagedAssets') or [])} damaged/unprobeable asset(s) tracked</small></p>
            <div class="recipes">{recipes}</div>
          </article>
        """)
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Studio360 Reframe Prep</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101719; --panel:#172427; --ink:#f4f0df; --muted:#b8c0ad; --cyan:#78c9d8; --gold:#e6c35c; --clay:#c87957; --line:rgba(244,240,223,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top, rgba(120,201,216,.18), transparent 38%), var(--bg); }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--cyan); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:900; }}
    h1 {{ font-size:clamp(36px,6vw,78px); line-height:.92; margin:10px 0; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr)); gap:12px; padding:24px clamp(16px,4vw,56px); }}
    .stat {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(0,0,0,.18); }}
    .stat b {{ display:block; font-size:30px; }}
    .stat span {{ color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    main {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; padding:0 clamp(16px,4vw,56px) 64px; }}
    article {{ border:1px solid var(--line); border-radius:22px; padding:18px; background:linear-gradient(180deg,var(--panel),#11191b); }}
    article.reframe-ready {{ border-color:rgba(120,201,216,.55); }}
    article.blocked-needs-proxy, article.blocked-media-repair {{ border-color:rgba(200,121,87,.55); }}
    article.parked-damaged-source, article.parked-by-decision {{ border-color:rgba(230,195,92,.45); opacity:.82; }}
    h2 {{ font-size:20px; margin:10px 0; overflow-wrap:anywhere; }}
    small {{ color:var(--muted); overflow-wrap:anywhere; }}
    .recipes {{ display:flex; gap:7px; flex-wrap:wrap; margin-top:12px; }}
    .recipes span {{ border:1px solid var(--line); border-radius:999px; padding:6px 8px; color:var(--gold); font-size:11px; font-weight:900; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Studio360</div>
    <h1>Reframe recipes before renders.</h1>
    <p>{html.escape(packet['truth'])}</p>
  </header>
  <div class="stats">
    <div class="stat"><b>{counts['groups']}</b><span>Groups</span></div>
    <div class="stat"><b>{counts['reframeReady']}</b><span>Ready</span></div>
    <div class="stat"><b>{counts['blockedNeedsProxy']}</b><span>Need proxy</span></div>
    <div class="stat"><b>{counts['blockedMediaRepair']}</b><span>Repair</span></div>
    <div class="stat"><b>{counts['parkedDamagedSources']}</b><span>Parked damaged</span></div>
    <div class="stat"><b>{counts['parkedByDecision']}</b><span>Parked by decision</span></div>
    <div class="stat"><b>{counts['damagedAssets']}</b><span>Damaged assets</span></div>
    <div class="stat"><b>{counts['recipes']}</b><span>Recipes</span></div>
  </div>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def compact_reframe_rows(groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group in groups:
        source = group.get("reviewSource") if isinstance(group.get("reviewSource"), dict) else {}
        recipes = group.get("recipes") if isinstance(group.get("recipes"), list) else []
        recipe_rows = [
            {
                "recipeId": recipe.get("id") or "",
                "aspect": recipe.get("outputAspect") or "",
                "status": recipe.get("status") or "",
                "durationSeconds": recipe.get("sequenceDurationSeconds") or 0,
                "exportCreated": bool(recipe.get("exportCreated")),
            }
            for recipe in recipes
            if isinstance(recipe, dict)
        ]
        rows.append({
            "groupId": group.get("id") or "",
            "groupKey": group.get("groupKey") or "",
            "status": group.get("reframeStatus") or "",
            "workflowStatus": group.get("workflowStatus") or "",
            "durationSeconds": group.get("durationSeconds") or 0,
            "reviewSourceKind": source.get("kind") or "",
            "reviewSourcePath": source.get("path") or "",
            "reviewSourceAvailable": bool(source.get("available")),
            "damagedAssetCount": len(group.get("damagedAssets") or []),
            "recipes": recipe_rows,
            "recipeCount": len(recipe_rows),
            "nextSafestAction": group.get("nextSafestAction") or "",
            "truth": "Reframe row only. It is metadata for review/proof prep, not a render, publication, repair, upload, or source mutation.",
        })
    return rows


def reframe_priority(status: str) -> int:
    if status == "blocked-media-repair":
        return 10
    if status == "blocked-needs-proxy":
        return 20
    if status == "reframe-ready":
        return 30
    if status.startswith("parked"):
        return 50
    return 40


def build_reframe_start_queue(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordered = list(rows)
    ordered.sort(key=lambda row: (reframe_priority(str(row.get("status") or "")), str(row.get("groupKey") or "")))
    return ordered[:24]


def build_packet(args: argparse.Namespace) -> dict[str, Any]:
    output_root = Path(args.output_root).expanduser()
    workflow_path = resolve_workflow(args.workflow)
    workflow = load_json(workflow_path)
    if not workflow:
        raise SystemExit(f"Could not read 360 workflow packet: {workflow_path}")
    session_dir = prepare_session(output_root)
    groups = build_group_payloads(workflow, args.limit, output_root)
    json_path = session_dir / "360-reframe-packet.json"
    md_path = session_dir / "START-HERE-360-reframe-prep.md"
    html_path = session_dir / "index.html"
    csv_path = session_dir / "360-reframe-recipes.csv"
    counts = summarize(groups)
    status = (
        "blocked-media-repair"
        if counts["blockedMediaRepair"]
        else "blocked-needs-proxy"
        if counts["blockedNeedsProxy"]
        else "reframe-review-ready"
        if counts["reframeReady"]
        else "needs-review"
    )
    next_safest_action = (
        "Open the reframe packet and repair/preflight blocked media before proxy or export work."
        if counts["blockedMediaRepair"]
        else "Open the reframe packet and create managed proxies for blocked groups before reframing."
        if counts["blockedNeedsProxy"]
        else "Open the reframe packet, review 16:9 and 9:16 recipes, then tune baseline/keyframes before any real export."
        if counts["reframeReady"]
        else "Open the reframe packet and classify source readiness before export work."
    )
    packet = {
        "schema": "quipsly.360.reframe-packet.v1",
        "generatedAt": iso_now(),
        "workflowPacketPath": str(workflow_path),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "truth": "360 reframe/export-prep metadata only. Originals are untouched; no exports or external publishing occurred.",
        "status": status,
        "nextSafestAction": next_safest_action,
        "firstSafeAction": {
            "label": "Open Studio360 reframe packet",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local reframe recipe evidence only. No render, upload, delete, source mutation, or external publication occurs.",
        },
        "counts": counts,
        "groups": groups,
        "safety": {
            "originalsMutated": False,
            "exportsCreated": False,
            "externalPublishing": False,
            "previousVersionsOverwritten": False,
        },
    }
    write_json(json_path, packet)
    write_csv(csv_path, groups)
    write_markdown(md_path, packet)
    write_html(html_path, packet)
    compact_rows = compact_reframe_rows(groups)
    pointer = {
        "schema": "quipsly.360.latest-reframe-packet.v1",
        "updatedAt": iso_now(),
        "sessionDir": str(session_dir),
        "jsonPath": str(json_path),
        "markdownPath": str(md_path),
        "htmlPath": str(html_path),
        "csvPath": str(csv_path),
        "counts": packet["counts"],
        "status": packet["status"],
        "rows": compact_rows,
        "groups": compact_rows,
        "startHereQueue": build_reframe_start_queue(compact_rows),
        "humanAsk": "Review the Studio360 reframe packet before using recipes for proof renders. Confirm source routing, framing defaults, and any damaged-source notes.",
        "agentSafeParallelWork": "Codex may improve reframe recipe notes, source-routing explanations, blocker summaries, and dry-run proof/export packets. Do not render, repair, publish, upload, delete, overwrite, mutate originals, or create receipt truth.",
        "nextSafestAction": packet["nextSafestAction"],
        "firstSafeAction": packet["firstSafeAction"],
        "truth": "Pointer only. Versioned Studio360 reframe-prep sessions are preserved.",
    }
    write_json(output_root / "latest-360-reframe-packet.json", pointer)
    return packet


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a safe Studio360 reframe/export-prep packet.")
    parser.add_argument("--workflow", default="latest")
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--limit", type=int, default=120)
    packet = build_packet(parser.parse_args())
    print(json.dumps({
        "ok": True,
        "sessionDir": packet["sessionDir"],
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "counts": packet["counts"],
        "originalsMutated": False,
        "exportsCreated": False,
        "externalPublishing": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
