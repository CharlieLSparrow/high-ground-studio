#!/usr/bin/env python3
"""Build a human-first Tower publishing Start Here page.

Tower has many useful local packets. This page is the calm first door: what is
ready to review, what needs explicit approval, what must be done manually, and
what does not count as published until a real platform receipt/URL exists.
"""

from __future__ import annotations

import html
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_OS_POINTER = Path("/Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-os-board.json")
DEFAULT_TOWER_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Tower")
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_POINTER = "latest-tower-start-here.json"

DIRECT_TOWER_POINTERS = [
    ("tower-publication-approval-gate", "Tower publication control room", DEFAULT_RELEASE_ROOT / "tower-publication-control-room" / "latest-tower-publication-control-room.json"),
    ("tower-review-gate-board", "Tower review gate board", DEFAULT_RELEASE_ROOT / "tower-review-gate-board" / "latest-tower-review-gate-board.json"),
    ("tower-next-publishing-card", "Tower next publishing card", DEFAULT_RELEASE_ROOT / "tower-next-publishing-card" / "latest-tower-next-publishing-card.json"),
    ("tower-publisher-desk", "Tower publisher desk", DEFAULT_RELEASE_ROOT / "tower-publisher-desk" / "latest-tower-publisher-desk.json"),
    ("tower-manual-packet-board", "Tower manual publishing packet board", DEFAULT_RELEASE_ROOT / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json"),
    ("tower-receipt-readiness-packet", "Tower receipt readiness packet", DEFAULT_RELEASE_ROOT / "tower-receipt-readiness" / "latest-tower-receipt-readiness-packet.json"),
    ("tower-manual-calendar", "Tower manual calendar", DEFAULT_RELEASE_ROOT / "tower-manual-calendar" / "latest-tower-manual-calendar.json"),
    ("tower-social-command-center", "Tower social command center", DEFAULT_RELEASE_ROOT / "tower-social-command-center" / "latest-tower-social-command-center.json"),
]


def read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"status": "load-error", "path": str(path), "error": str(exc)}
    if not isinstance(payload, dict):
        return {}
    target = payload.get("jsonPath") or payload.get("latest")
    if target:
        target_path = Path(str(target))
        if target_path.exists() and target_path != path:
            try:
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload}
            except Exception:
                return payload
    return payload


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(path: str) -> str:
    return "'" + path.replace("'", "'\\''") + "'"


def as_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def is_tower_text(*values: Any) -> bool:
    text = " ".join(str(value or "") for value in values).lower()
    return "tower" in text or "publishing" in text or "social" in text


def lane_cards(lane: dict[str, Any]) -> list[dict[str, Any]]:
    cards = lane.get("actionCards") or lane.get("cards") or lane.get("actions") or []
    if not isinstance(cards, list):
        return []
    return [card for card in cards if isinstance(card, dict)]


def tower_lane(board: dict[str, Any]) -> dict[str, Any]:
    lanes = board.get("lanes")
    if isinstance(lanes, list):
        for lane in lanes:
            if not isinstance(lane, dict):
                continue
            if is_tower_text(lane.get("lane"), lane.get("name"), lane.get("title")):
                return lane
    if isinstance(lanes, dict):
        for key, lane in lanes.items():
            if not isinstance(lane, dict):
                continue
            if is_tower_text(key, lane.get("lane"), lane.get("name"), lane.get("title")):
                return lane

    lane_statuses = board.get("laneStatuses")
    if isinstance(lane_statuses, list):
        for lane in lane_statuses:
            if isinstance(lane, dict) and is_tower_text(lane.get("lane"), lane.get("name"), lane.get("title")):
                return lane
    if isinstance(lane_statuses, dict):
        for key, lane in lane_statuses.items():
            if isinstance(lane, dict) and is_tower_text(key, lane.get("lane"), lane.get("name"), lane.get("title")):
                return lane
    return {}


def tower_items(board: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(item: dict[str, Any]) -> None:
        key = str(item.get("id") or item.get("title") or item.get("action") or first_path(item) or len(items))
        if key == "tower-start-here":
            return
        if key in seen:
            return
        seen.add(key)
        items.append(item)

    for item in lane_cards(tower_lane(board)):
        add(item)

    for item in board.get("priorityQueue") or []:
        if not isinstance(item, dict):
            continue
        if is_tower_text(item.get("lane"), item.get("sourceLane"), item.get("surface"), item.get("area"), item.get("title"), item.get("action")):
            add(item)
    return items


def first_path(item: dict[str, Any]) -> str:
    for key in ("htmlPath", "runwayHtml", "primaryPath"):
        value = item.get(key)
        if value:
            return str(value)
    first = item.get("firstSafeAction")
    if isinstance(first, dict):
        value = first.get("path")
        if value:
            return str(value)
    return ""


def first_command(item: dict[str, Any]) -> str:
    first = item.get("firstSafeAction")
    if isinstance(first, dict):
        command = first.get("command")
        if command:
            return str(command)
    path = first_path(item)
    return f"open {shell_quote(path)}" if path else ""


def pointer_card(pointer_id: str, fallback_title: str, payload: dict[str, Any]) -> dict[str, Any]:
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    status = str(payload.get("status") or "ready")
    next_action = str(payload.get("nextSafestAction") or "")
    explanation = str(payload.get("explanation") or payload.get("plainEnglish") or next_action)
    first_safe = payload.get("firstSafeAction") if isinstance(payload.get("firstSafeAction"), dict) else {}
    return {
        "id": pointer_id,
        "title": fallback_title,
        "action": fallback_title,
        "status": status,
        "priority": "attention" if counts.get("blockedOrReview") or counts.get("pendingReviewRows") or counts.get("reviewBlockedWithPacket") or counts.get("warningRows") else "review",
        "explanation": explanation,
        "nextSafestAction": next_action or "Open this local Tower packet and keep review, approval, platform action, and receipt truth separate.",
        "humanAsk": str(payload.get("humanAsk") or ""),
        "agentSafeParallelWork": str(payload.get("agentSafeParallelWork") or ""),
        "safety": str(payload.get("truth") or first_safe.get("safety") or "Local Tower packet only. No publish, upload, schedule, approval, account mutation, overwrite, or receipt truth."),
        "firstSafeAction": first_safe,
        "htmlPath": payload.get("htmlPath") or "",
        "jsonPath": payload.get("jsonPath") or "",
        "markdownPath": payload.get("markdownPath") or "",
        "receiptSlots": as_int(counts.get("receiptSlots")),
        "capturedReceipts": as_int(counts.get("capturedReceipts") or counts.get("receiptCaptured")),
        "reviewPending": as_int(counts.get("blockedOrReview") or counts.get("pendingReviewRows") or counts.get("reviewBlockedWithPacket") or counts.get("reviewRows")),
        "warningCount": as_int(counts.get("warningRows") or counts.get("warningCount")),
        "source": "direct-latest-pointer",
    }


def direct_tower_items() -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for pointer_id, title, path in DIRECT_TOWER_POINTERS:
        payload = read_json(path)
        if payload:
            items.append(pointer_card(pointer_id, title, payload))
    return items


def merge_items(*item_lists: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for items in item_lists:
        for item in items:
            key = str(item.get("id") or item.get("title") or item.get("action") or first_path(item) or len(merged))
            if key in seen:
                continue
            seen.add(key)
            merged.append(item)
    return merged


def normalize_item(item: dict[str, Any], index: int) -> dict[str, Any]:
    path = first_path(item)
    return {
        "id": str(item.get("id") or f"tower-item-{index:03d}"),
        "title": str(item.get("displayTitle") or item.get("title") or item.get("action") or f"Tower item {index}"),
        "status": str(item.get("status") or "unknown"),
        "priority": str(item.get("priority") or "attention"),
        "explanation": str(item.get("explanation") or item.get("nextSafestAction") or ""),
        "nextSafestAction": str(item.get("nextSafestAction") or item.get("humanAsk") or ""),
        "humanAsk": str(item.get("humanAsk") or ""),
        "safety": str(item.get("safety") or ""),
        "path": path,
        "command": first_command(item),
        "receiptSlots": as_int(item.get("receiptSlots")),
        "capturedReceipts": as_int(item.get("capturedReceipts")),
        "reviewPending": as_int(item.get("reviewPending")),
        "warningCount": as_int(item.get("warningCount")),
    }


def build_counts(lane: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, int]:
    def max_item_value(key: str) -> int:
        return max((as_int(item.get(key)) for item in items), default=0)

    return {
        "towerActionCards": len(lane_cards(lane)),
        "towerPriorityItems": len(items),
        "receiptSlots": max_item_value("receiptSlots"),
        "capturedReceipts": max_item_value("capturedReceipts"),
        "reviewPending": max_item_value("reviewPending"),
        "warningCount": max_item_value("warningCount"),
    }


def status_from(lane: dict[str, Any], counts: dict[str, int]) -> tuple[str, str, str]:
    lane_status = str(lane.get("status") or "unknown")
    if counts["capturedReceipts"] == 0:
        return (
            "tower-start-here-packets-ready-no-receipts",
            "Packets ready; no receipts captured",
            "Tower has local packets and manual publishing guidance, but nothing should be called published until a platform URL/receipt is captured.",
        )
    if counts["capturedReceipts"] < counts["receiptSlots"]:
        return (
            "tower-start-here-partial-receipts",
            "Some receipts captured",
            "Some external publication receipts exist, but Tower still has open receipt slots. Keep manual readiness and published truth separate.",
        )
    return (
        "tower-start-here-receipts-complete",
        "Receipt slots complete",
        "Tower receipt slots appear filled from current local evidence. Verify platform URLs before claiming broad publication completion.",
    )


def build_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    cards = "\n".join(
        f"""
        <article class="card">
          <div class="pill">{html.escape(item['status'])}</div>
          <h2>{html.escape(item['title'])}</h2>
          <p>{html.escape(item['explanation'])}</p>
          <p><strong>Next:</strong> {html.escape(item['nextSafestAction'])}</p>
          <p class="safety">{html.escape(item['safety'])}</p>
          <code>{html.escape(item['command'] or 'No open command available')}</code>
        </article>
        """
        for item in payload["towerItems"]
    )
    if not cards:
        cards = '<article class="card"><div class="pill">missing</div><h2>No Tower items found</h2><p>Regenerate the Quipsly OS board or Tower control room.</p></article>'
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Tower Start Here</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#eef5f6; --ink:#263033; --muted:#627073; --card:rgba(255,252,244,.9); --sky:#3f7d90; --leaf:#426f4a; --honey:#c99431; }}
    body {{ margin:0; color:var(--ink); font-family: ui-rounded, "Avenir Next", system-ui, sans-serif; background: radial-gradient(circle at 12% 10%, rgba(63,125,144,.18), transparent 30rem), radial-gradient(circle at 88% 18%, rgba(201,148,49,.18), transparent 28rem), var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:44px 24px; }}
    h1 {{ font-size:clamp(2.5rem,6vw,5.3rem); line-height:.92; letter-spacing:-.06em; margin:0; }}
    .deck {{ max-width:840px; color:var(--muted); line-height:1.65; font-size:1.08rem; }}
    .status {{ display:inline-flex; gap:.65rem; align-items:center; padding:10px 14px; border-radius:999px; background:var(--card); border:1px solid rgba(38,48,51,.13); font-weight:900; margin-bottom:20px; }}
    .dot {{ width:12px; height:12px; border-radius:50%; background:var(--honey); box-shadow:0 0 0 5px rgba(201,148,49,.16); }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; margin-top:28px; }}
    .card,.stat {{ background:var(--card); border:1px solid rgba(38,48,51,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(38,48,51,.08); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.04em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(63,125,144,.12); color:var(--sky); text-transform:uppercase; font-weight:900; font-size:.72rem; letter-spacing:.08em; }}
    .safety {{ color:var(--muted); font-size:.92rem; }}
    code {{ display:block; padding:11px; border-radius:13px; background:rgba(38,48,51,.08); overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <div class="status"><span class="dot"></span>{html.escape(payload['statusLabel'])}</div>
  <h1>Tower Start Here</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="grid">
    <div class="stat"><div class="pill">packets</div><strong>{counts['towerPriorityItems']}</strong><span>Tower priority item(s)</span></div>
    <div class="stat"><div class="pill">receipts</div><strong>{counts['capturedReceipts']}/{counts['receiptSlots']}</strong><span>captured receipt truth</span></div>
    <div class="stat"><div class="pill">review</div><strong>{counts['reviewPending']}</strong><span>pending review signal(s)</span></div>
    <div class="stat"><div class="pill">warnings</div><strong>{counts['warningCount']}</strong><span>warning(s)</span></div>
  </section>
  <h2>Open these first</h2>
  <section class="grid">{cards}</section>
</main>
</body>
</html>
"""


def build_markdown(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    lines = [
        "# Tower Start Here",
        "",
        f"Status: {payload['status']} ({payload['statusLabel']})",
        "",
        payload["plainEnglish"],
        "",
        "## Counts",
        f"- Tower priority items: {counts['towerPriorityItems']}",
        f"- Receipt slots: {counts['receiptSlots']}",
        f"- Captured receipts: {counts['capturedReceipts']}",
        f"- Review pending: {counts['reviewPending']}",
        f"- Warnings: {counts['warningCount']}",
        "",
        "## Next safe items",
    ]
    for item in payload["towerItems"]:
        lines += [
            f"- {item['title']}",
            f"  - status: {item['status']}",
            f"  - next: {item['nextSafestAction']}",
            f"  - command: `{item['command'] or 'none'}`",
            f"  - safety: {item['safety']}",
        ]
    lines += ["", "## Boundary", "- This page does not publish, upload, schedule, approve, or create receipts."]
    return "\n".join(lines) + "\n"


def main() -> int:
    if len(sys.argv) > 1 and sys.argv[1] in {"-h", "--help"}:
        print(
            "Usage: build_tower_start_here.py [quipsly-os-board-pointer] [tower-root]\n\n"
            "Builds a local-only Tower Start Here packet from existing Quipsly OS and Tower readiness artifacts.\n"
            "Default OS pointer: /Volumes/My Passport/Quipsly Media Workspace/QuipslyOS/latest-quipsly-os-board.json\n"
            "Default Tower root: /Volumes/My Passport/Quipsly Media Workspace/Tower\n\n"
            "Safety: reads local readiness packets and receipt slots only. It does not publish, upload, "
            "schedule, approve, send, mutate accounts, mutate source files, overwrite versions, "
            "or create external receipt truth."
        )
        return 0

    if len(sys.argv) > 3:
        print("ERROR: expected zero, one, or two arguments: [quipsly-os-board-pointer] [tower-root]", file=sys.stderr)
        return 2

    os_pointer = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OS_POINTER
    tower_root = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_TOWER_ROOT
    board = read_json(os_pointer)
    lane = tower_lane(board)
    raw_items = merge_items(direct_tower_items(), tower_items(board))
    items = [normalize_item(item, index) for index, item in enumerate(raw_items, start=1)]
    counts = build_counts(lane, items)
    status, status_label, plain = status_from(lane, counts)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    out_dir = tower_root / "StartHere" / f"{stamp}-tower-start-here"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "quipsly.tower.startHere.v1",
        "status": status,
        "statusLabel": status_label,
        "plainEnglish": plain,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "osBoardPointer": str(os_pointer),
        "osBoardJsonPath": str(board.get("jsonPath") or ""),
        "lane": lane,
        "counts": counts,
        "towerItems": items,
        "truth": "Tower Start Here only. It reads local readiness packets and receipt slots; it does not publish, upload, schedule, approve, send, mutate accounts, mutate source files, or create external receipt truth.",
        "externalPublishing": False,
        "accountMutation": False,
        "receiptsCreated": False,
    }
    json_path = out_dir / "tower-start-here.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-Tower.md"
    payload.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path)})
    write_json(json_path, payload)
    html_path.write_text(build_html(payload), encoding="utf-8")
    markdown_path.write_text(build_markdown(payload), encoding="utf-8")
    write_json(
        tower_root / LATEST_POINTER,
        {
            "schema": "quipsly.tower.startHerePointer.v1",
            "status": status,
            "statusLabel": status_label,
            "plainEnglish": plain,
            "jsonPath": str(json_path),
            "htmlPath": str(html_path),
            "markdownPath": str(markdown_path),
            "counts": counts,
            "truth": payload["truth"],
            "externalPublishing": False,
            "accountMutation": False,
            "receiptsCreated": False,
        },
    )
    print(json.dumps({"status": status, "jsonPath": str(json_path), "htmlPath": str(html_path), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
