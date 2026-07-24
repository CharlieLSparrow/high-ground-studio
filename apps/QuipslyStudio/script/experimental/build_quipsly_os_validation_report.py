#!/usr/bin/env python3
"""Build a cross-lane validation report for the latest Quipsly OS artifacts.

This is a read-only safety harness. It checks that the current OS board, return
brief, action deck, and linked lane artifacts exist and preserve the core local
truth boundaries: sources stay intact, publication claims require receipts, and
review/approval state stays separate from publishing state.
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
DEFAULT_BOARD_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-board.json"
DEFAULT_BRIEF_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-return-brief.json"
DEFAULT_DECK_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-action-deck.json"
DEFAULT_REFRESH_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-refresh.json"
DEFAULT_VALIDATION_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-os-validation.json"
DEFAULT_LATEST_SURFACE_AUDIT_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-latest-surface-audit.json"
DEFAULT_HUMAN_HELP_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-human-help-board.json"
DEFAULT_BLOCKER_LEDGER_POINTER = DEFAULT_OS_ROOT / "latest-quipsly-blocker-decision-ledger.json"
DEFAULT_PRODUCTION_RUNWAY_POINTER = DEFAULT_OS_ROOT.parent / "ProductionRunway" / "latest-quipsly-production-runway.json"
DEFAULT_PHOTO_CLIENT_PROOF_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-client-proof-packet.json"
DEFAULT_PHOTO_CONTACT_SHEET_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-contact-sheet.json"
DEFAULT_PHOTO_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-control-room.json"
DEFAULT_PHOTO_CULL_REHEARSAL_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-cull-rehearsal.json"
DEFAULT_PHOTO_COMMAND_SHEET_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-command-sheet.json"
DEFAULT_PHOTO_FIRST_KEEPERS_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-first-keepers.json"
DEFAULT_PHOTO_KEEPER_DESK_POINTER = DEFAULT_OS_ROOT.parent / "PhotoGrove" / "latest-photo-grove-keeper-desk.json"
DEFAULT_NEST_DAILY_WRITING_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-daily-packet.json"
DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-control-room.json"
DEFAULT_NEST_AUTHOR_DESK_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-author-desk.json"
DEFAULT_NEST_WRITING_RUNWAY_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-writing-publication-runway.json"
DEFAULT_NEST_WRITING_MOMENTUM_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-momentum-board.json"
DEFAULT_NEST_WRITING_REVIEW_DESK_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-review-desk.json"
DEFAULT_NEST_WRITING_SPRINT_POINTER = DEFAULT_OS_ROOT.parent / "NestWriting" / "latest-nest-writing-sprint-companion.json"
DEFAULT_STUDIO360_PROOF_REVIEW_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-proof-review-desk.json"
DEFAULT_STUDIO360_PROOF_NEXT_BRIEF_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-proof-next-brief.json"
DEFAULT_STUDIO360_REFRAME_EXPORT_DESK_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-reframe-export-desk.json"
DEFAULT_STUDIO360_RENDERER_PREFLIGHT_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-renderer-preflight.json"
DEFAULT_STUDIO360_SOURCE_DESK_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-source-desk.json"
DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-control-room.json")
DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-sync-decision-rehearsal.json")
DEFAULT_STUDIO_WATCH_LISTEN_REVIEW_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-watch-listen-review-room.json")
DEFAULT_STUDIO_REVIEW_DECISION_LEDGER_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-review-decision-ledger.json")
DEFAULT_STUDIO_REVIEW_COMMAND_SHEET_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-review-command-sheet.json")
DEFAULT_STUDIO_REVIEW_WORK_SESSION_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-review-work-session.json")
DEFAULT_STUDIO_NEXT_REVIEW_CARD_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/latest-studio-next-review-card.json")
DEFAULT_CURRENT_PRODUCTION_BLOCKERS_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/current-production-blockers.json")
DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER = DEFAULT_OS_ROOT / "latest-current-production-blockers.json"
DEFAULT_DESKTOP_BLOCKERS_MARKDOWN = Path("/Users/wall-e/Desktop/Quipsly_Episode_Export_Blockers.md")
DEFAULT_STUDIO_SHORTS_REVIEW_COCKPIT_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/latest-shorts-review-cockpit.json")
DEFAULT_EPISODE4_SYNC_STACK_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/sync-stacks/latest-episode-04-sync-stack.json")
DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER = DEFAULT_OS_ROOT.parent / "Studio360" / "latest-360-proof-control-room.json"
DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-publication-control-room/latest-tower-publication-control-room.json")
DEFAULT_TOWER_PUBLISHER_DESK_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-publisher-desk/latest-tower-publisher-desk.json")
DEFAULT_TOWER_REVIEW_UNBLOCK_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-review-unblock-brief/latest-tower-review-unblock-brief.json")
DEFAULT_TOWER_REVIEW_GATE_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-review-gate-board/latest-tower-review-gate-board.json")
DEFAULT_TOWER_REVIEW_COMMAND_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/review-board/tower-review-command-sheets/latest-tower-review-command-sheet.json")
DEFAULT_TOWER_MANUAL_PACKET_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-manual-packet-board/latest-tower-manual-packet-board.json")
DEFAULT_TOWER_SOCIAL_COMMAND_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-social-command-center/latest-tower-social-command-center.json")
DEFAULT_TOWER_FIRST_REVIEW_POINTER = Path("/Volumes/My Passport/Episode_and_Shorts_Test/tower-first-review-session/latest-tower-first-review-session.json")
SCHEMA = "quipsly.os.validation-report.v1"
REQUIRED_LANES = {
    "Studio podcast/video",
    "Tower publishing/social",
    "Nest writing/research",
    "Photo Grove",
    "360 workflow",
}
REQUIRED_PRODUCTION_MATRIX_IDS = {
    "studio",
    "nest-writing",
    "photo-grove",
    "studio360",
    "tower",
}
EXPECTED_FRONT_DOORS = {
    "Studio podcast/video": "Studio review work session",
    "Nest writing/research": "Small writing session",
    "Photo Grove": "Culling sprint companion",
    "360 workflow": "Studio360 proof control room",
    "Tower publishing/social": "Review gate board",
}
MUTATION_FALSE_KEYS = {
    "sourceFilesMutated",
    "originalsMutated",
    "versionsOverwritten",
    "externalPublishing",
    "externalSchedulesCreated",
    "metadataChanged",
    "clientDeliveryCreated",
    "clientDeliveryCreated",
    "receiptTruthCreated",
    "canonicalManuscriptReplaced",
    "copyPlanExecuted",
    "exportsCreated",
    "decisionsWritten",
}
PUBLICATION_CLAIM_KEYS = {
    "published",
    "publishedAt",
    "publicationComplete",
    "externalPublicationComplete",
}
PATH_SUFFIXES = ("Html", "Json", "Markdown", "Csv", "Path", "Manifest")
FUTURE_INTENT_PATH_KEY_HINTS = ("proposed",)


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-quipsly-os-validation")


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


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def add_check(checks: list[dict[str, Any]], check_id: str, lane: str, status: str, message: str, evidence: Any = None, severity: str | None = None) -> None:
    checks.append({
        "id": check_id,
        "lane": lane,
        "status": status,
        "severity": severity or ("failure" if status == "fail" else "warning" if status == "warn" else "info"),
        "message": message,
        "evidence": evidence,
    })


def resolve_pointer(pointer_path: Path) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer = load_json(pointer_path)
    target_path = Path(str(pointer.get("jsonPath") or "")) if pointer.get("jsonPath") else Path("")
    target = load_json(target_path) if target_path.exists() else {}
    return pointer, target, target_path


def walk_dict(value: Any, path: str = "$") -> list[tuple[str, Any]]:
    rows: list[tuple[str, Any]] = [(path, value)]
    if isinstance(value, dict):
        for key, child in value.items():
            rows.extend(walk_dict(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            rows.extend(walk_dict(child, f"{path}[{index}]"))
    return rows


def looks_like_local_path(value: str) -> bool:
    if not value or value.startswith("http://") or value.startswith("https://"):
        return False
    return value.startswith("/") or value.startswith("./") or value.startswith("../")


def collect_declared_paths(board: dict[str, Any], brief: dict[str, Any], deck: dict[str, Any]) -> list[dict[str, str]]:
    paths: list[dict[str, str]] = []
    for label, payload in [("board", board), ("brief", brief), ("deck", deck)]:
        for path_expr, value in walk_dict(payload):
            if not isinstance(value, str) or not looks_like_local_path(value):
                continue
            key = path_expr.split(".")[-1]
            key_lower = key.lower()
            if any(hint in key_lower for hint in FUTURE_INTENT_PATH_KEY_HINTS):
                # Proposed output paths are versioned future intent, not required
                # artifacts. Validate receipts/render outputs once they are real.
                continue
            if any(key.endswith(suffix) for suffix in PATH_SUFFIXES) or value.endswith(('.html', '.json', '.md', '.csv', '.mp4', '.m4a', '.wav', '.jpg', '.jpeg', '.png')):
                values = [line.strip() for line in value.splitlines() if line.strip()] if "\n" in value else [value]
                for path_value in values:
                    if looks_like_local_path(path_value):
                        paths.append({"source": label, "jsonPath": path_expr, "path": path_value})
    # De-duplicate by concrete path while preserving first source.
    seen: set[str] = set()
    unique: list[dict[str, str]] = []
    for item in paths:
        concrete = item["path"]
        if concrete in seen:
            continue
        seen.add(concrete)
        unique.append(item)
    return unique


def validate_pointers(checks: list[dict[str, Any]], pointer_path: Path, label: str) -> tuple[dict[str, Any], dict[str, Any], Path]:
    pointer, payload, target_path = resolve_pointer(pointer_path)
    add_check(checks, f"{label}-pointer-exists", "Quipsly OS", "pass" if pointer_path.exists() else "fail", f"{label} pointer exists", str(pointer_path))
    add_check(checks, f"{label}-target-exists", "Quipsly OS", "pass" if target_path.exists() else "fail", f"{label} target JSON exists", str(target_path))
    if pointer.get("htmlPath"):
        html_path = Path(str(pointer.get("htmlPath")))
        add_check(checks, f"{label}-html-exists", "Quipsly OS", "pass" if html_path.exists() else "fail", f"{label} HTML exists", str(html_path))
    return pointer, payload, target_path


def validate_handoff_pointer(checks: list[dict[str, Any]], pointer: dict[str, Any], label: str) -> None:
    """Validate the shared human/agent handoff contract on latest pointers."""
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_path = str(first.get("path") or "")
    first_command = str(first.get("command") or "")
    has_openable_first_action = bool(first_path and first_command.startswith("open "))
    first_path_exists = bool(first_path and Path(first_path).exists())
    add_check(
        checks,
        f"{label}-handoff-status",
        "Quipsly OS",
        "pass" if pointer.get("status") else "fail",
        f"{label} latest pointer exposes status",
        pointer.get("status") or "",
    )
    add_check(
        checks,
        f"{label}-handoff-first-safe-action",
        "Quipsly OS",
        "pass" if has_openable_first_action and first_path_exists else "fail",
        f"{label} latest pointer exposes an openable firstSafeAction",
        {"firstSafeAction": first, "pathExists": first_path_exists},
    )
    add_check(
        checks,
        f"{label}-handoff-next-safest-action",
        "Quipsly OS",
        "pass" if pointer.get("nextSafestAction") else "fail",
        f"{label} latest pointer exposes nextSafestAction",
        pointer.get("nextSafestAction") or "",
    )
    safety = str(first.get("safety") or "")
    unsafe_words = ["publish", "upload", "schedule", "delete", "receipt", "mutate"]
    safety_lower = safety.lower()
    mentions_no_external = (
        ("does not" in safety_lower or "no " in safety_lower)
        and any(word in safety_lower for word in unsafe_words)
    )
    add_check(
        checks,
        f"{label}-handoff-safety-boundary",
        "Quipsly OS",
        "pass" if safety and mentions_no_external else "warn",
        f"{label} firstSafeAction states a safety boundary",
        safety,
    )


def validate_specialist_pointer(checks: list[dict[str, Any]], pointer: dict[str, Any], label: str) -> None:
    """Validate lane-local latest pointers that feed the production runway."""
    first = pointer.get("firstSafeAction") if isinstance(pointer.get("firstSafeAction"), dict) else {}
    first_path = str(first.get("path") or "")
    first_command = str(first.get("command") or "")
    first_path_exists = bool(first_path and Path(first_path).exists())
    has_safe_local_command = first_command.startswith(("./script/agentctl.sh ", "python3 "))
    has_openable_path = first_command.startswith("open ") and first_path_exists
    status = str(pointer.get("status") or "")
    human_ask = str(pointer.get("humanAsk") or "")
    agent_work = str(pointer.get("agentSafeParallelWork") or "")
    truth = pointer.get("truth") if isinstance(pointer.get("truth"), dict) else {}
    safe_truth = all(
        truth.get(key) in {False, 0, None, "", "false", "False"}
        for key in (
            "externalPublishing",
            "externalSchedulesCreated",
            "sourceFilesMutated",
            "sourceMediaMutated",
            "originalsMutated",
            "clientDeliveryCreated",
            "canonicalManuscriptReplaced",
            "receiptTruthCreated",
        )
        if key in truth
    )
    add_check(
        checks,
        f"{label}-specialist-status",
        "Quipsly OS",
        "pass" if status else "fail",
        f"{label} specialist pointer exposes status",
        status,
    )
    add_check(
        checks,
        f"{label}-specialist-human-ask",
        "Quipsly OS",
        "pass" if human_ask else "fail",
        f"{label} specialist pointer exposes humanAsk",
        human_ask,
    )
    add_check(
        checks,
        f"{label}-specialist-agent-work",
        "Quipsly OS",
        "pass" if agent_work else "fail",
        f"{label} specialist pointer exposes Codex-safe parallel work",
        agent_work,
    )
    add_check(
        checks,
        f"{label}-specialist-first-safe-action",
        "Quipsly OS",
        "pass" if has_openable_path or has_safe_local_command else "fail",
        f"{label} specialist pointer exposes an actionable firstSafeAction",
        {"firstSafeAction": first, "pathExists": first_path_exists, "hasSafeLocalCommand": has_safe_local_command},
    )
    if truth:
        add_check(
            checks,
            f"{label}-specialist-safe-truth",
            "Quipsly OS",
            "pass" if safe_truth else "fail",
            f"{label} specialist pointer truth does not claim external mutation/publication",
            truth,
        )


def validate_board(checks: list[dict[str, Any]], board: dict[str, Any]) -> None:
    lanes = board.get("lanes") if isinstance(board.get("lanes"), list) else []
    lane_names = {str(lane.get("lane") or "") for lane in lanes if isinstance(lane, dict)}
    add_check(checks, "board-required-lanes", "Quipsly OS", "pass" if REQUIRED_LANES.issubset(lane_names) else "fail", "Board includes all required production lanes", sorted(lane_names))
    queue = board.get("priorityQueue") if isinstance(board.get("priorityQueue"), list) else []
    add_check(checks, "board-priority-queue", "Quipsly OS", "pass" if queue else "fail", "Board has a start-here priority queue", {"count": len(queue)})
    for lane in lanes:
        if not isinstance(lane, dict):
            continue
        lane_name = str(lane.get("lane") or "Unknown")
        cards = lane.get("actionCards") if isinstance(lane.get("actionCards"), list) else []
        add_check(checks, f"lane-{lane_name}-action-cards", lane_name, "pass" if cards else "warn", "Lane has action cards", {"cards": len(cards)})
        add_check(checks, f"lane-{lane_name}-next-action", lane_name, "pass" if lane.get("nextSafestAction") else "warn", "Lane has next safest action", lane.get("nextSafestAction") or "")


def validate_safety_truth(checks: list[dict[str, Any]], payloads: list[tuple[str, dict[str, Any]]]) -> None:
    for label, payload in payloads:
        for path_expr, value in walk_dict(payload):
            key = path_expr.split(".")[-1]
            if key in MUTATION_FALSE_KEYS and value not in {False, 0, None, "", "false", "False"}:
                add_check(checks, f"unsafe-{label}-{path_expr}", label, "fail", f"Safety key {key} is not false/empty", {"path": path_expr, "value": value})
            if key in PUBLICATION_CLAIM_KEYS and value in {True, "true", "published", "complete"}:
                nearby = str(path_expr)
                add_check(checks, f"publication-claim-{label}-{path_expr}", label, "warn", "Publication-like claim found; verify receipt evidence before trusting it", {"path": nearby, "value": value})


def validate_paths(checks: list[dict[str, Any]], declared_paths: list[dict[str, str]]) -> None:
    missing = []
    for item in declared_paths:
        raw = item["path"]
        if "<" in raw or ">" in raw:
            continue
        path = Path(raw)
        if raw.startswith("./") or raw.startswith("../"):
            # Relative commands/templates are not artifact paths to validate here.
            continue
        if not path.exists():
            missing.append(item)
    add_check(checks, "declared-paths-exist", "Quipsly OS", "pass" if not missing else "warn", "Declared local artifact paths exist", {"checked": len(declared_paths), "missing": missing[:20], "missingCount": len(missing)})


def validate_action_deck(checks: list[dict[str, Any]], deck: dict[str, Any]) -> None:
    actions = deck.get("actions") if isinstance(deck.get("actions"), list) else []
    commands = [cmd for action in actions if isinstance(action, dict) for cmd in (action.get("commands") or []) if isinstance(cmd, dict)]
    counts = deck.get("counts") if isinstance(deck.get("counts"), dict) else {}
    add_check(checks, "action-deck-actions-count", "Quipsly OS", "pass" if int(counts.get("actions") or 0) == len(actions) else "warn", "Action deck action count matches rows", {"declared": counts.get("actions"), "actual": len(actions)})
    add_check(checks, "action-deck-command-count", "Quipsly OS", "pass" if int(counts.get("commands") or 0) == len(commands) else "warn", "Action deck command count matches rows", {"declared": counts.get("commands"), "actual": len(commands)})
    unknown = [cmd for cmd in commands if cmd.get("kind") == "review-before-run"]
    add_check(checks, "action-deck-unknown-commands", "Quipsly OS", "pass" if not unknown else "warn", "Action deck has no unknown command shapes", {"unknownCount": len(unknown), "unknown": unknown[:10]})


def priority_rank(value: str) -> int:
    return {"attention": 0, "review": 1, "ready": 2}.get(value, 3)


def front_door_sort_key(card: dict[str, Any]) -> tuple[int, str, str]:
    return (
        priority_rank(str(card.get("priority") or "")),
        str(card.get("deckSortKey") or card.get("title") or card.get("action") or ""),
        str(card.get("title") or card.get("action") or ""),
    )


def validate_front_door_order(checks: list[dict[str, Any]], production_runway: dict[str, Any], deck: dict[str, Any]) -> None:
    cards = production_runway.get("cards") if isinstance(production_runway.get("cards"), list) else []
    actions = deck.get("actions") if isinstance(deck.get("actions"), list) else []
    runway_evidence: dict[str, Any] = {}
    deck_evidence: dict[str, Any] = {}
    runway_failures: list[dict[str, Any]] = []
    deck_failures: list[dict[str, Any]] = []
    for lane, expected_title in EXPECTED_FRONT_DOORS.items():
        lane_cards = [card for card in cards if isinstance(card, dict) and card.get("lane") == lane]
        sorted_cards = sorted(lane_cards, key=front_door_sort_key)
        first_card = sorted_cards[0] if sorted_cards else {}
        actual_title = str(first_card.get("title") or "")
        runway_evidence[lane] = {
            "expected": expected_title,
            "actual": actual_title,
            "deckSortKey": first_card.get("deckSortKey") or "",
            "cardCount": len(lane_cards),
        }
        if actual_title != expected_title:
            runway_failures.append(runway_evidence[lane])
        lane_actions = [row for row in actions if isinstance(row, dict) and row.get("lane") == lane]
        first_action = lane_actions[0] if lane_actions else {}
        actual_action = str(first_action.get("action") or "")
        deck_evidence[lane] = {
            "expected": expected_title,
            "actual": actual_action,
            "actionCount": len(lane_actions),
        }
        if actual_action != expected_title:
            deck_failures.append(deck_evidence[lane])
    add_check(
        checks,
        "production-runway-front-door-order",
        "Quipsly OS",
        "pass" if not runway_failures else "fail",
        "Production Runway starts each major lane with its calm front-door/work-session card",
        {"lanes": runway_evidence, "failures": runway_failures},
    )
    add_check(
        checks,
        "action-deck-front-door-order",
        "Quipsly OS",
        "pass" if not deck_failures else "fail",
        "Action Deck starts each major lane with the same front-door/work-session action",
        {"lanes": deck_evidence, "failures": deck_failures},
    )


def validate_refresh_run(checks: list[dict[str, Any]], refresh: dict[str, Any], pointer: dict[str, Any]) -> None:
    counts = refresh.get("counts") if isinstance(refresh.get("counts"), dict) else pointer.get("counts") if isinstance(pointer.get("counts"), dict) else {}
    steps = refresh.get("steps") if isinstance(refresh.get("steps"), list) else []
    failed = int(counts.get("failed") or 0)
    timed_out = int(counts.get("timeout") or 0)
    reported_blockers = int(counts.get("reportedBlockers") or 0)
    total = int(counts.get("total") or len(steps) or 0)
    status = str(refresh.get("status") or pointer.get("status") or "")
    refresh_completed_cleanly = status in {"passed", "passed-with-known-blockers"} and failed == 0 and timed_out == 0 and total > 0
    if os.environ.get("QUIPSLY_OS_REFRESH_IN_PROGRESS") == "1":
        add_check(
            checks,
            "refresh-run-status",
            "Quipsly OS",
            "pass",
            "Refresh status self-check skipped during an in-progress refresh run",
            {"status": status, "counts": counts, "steps": total, "skippedSelfReference": True},
        )
    else:
        add_check(
            checks,
            "refresh-run-status",
            "Quipsly OS",
            "pass" if refresh_completed_cleanly else "warn",
            "Latest Quipsly OS refresh run completed without failed/timed-out lanes; known content blockers are tracked separately",
            {"status": status, "counts": counts, "steps": total, "reportedBlockers": reported_blockers},
        )
    add_check(
        checks,
        "refresh-run-no-side-effects",
        "Quipsly OS",
        "pass" if (refresh.get("truth") or {}).get("externalPublishing") is False and (refresh.get("truth") or {}).get("sourceMediaMutated") is False else "warn",
        "Refresh run declares no external publishing or source mutation",
        refresh.get("truth") or {},
    )


def validate_human_help_board(checks: list[dict[str, Any]], human_help: dict[str, Any]) -> None:
    counts = human_help.get("counts") if isinstance(human_help.get("counts"), dict) else {}
    items = human_help.get("items") if isinstance(human_help.get("items"), list) else []
    owner_paths = human_help.get("ownerPacketPaths") if isinstance(human_help.get("ownerPacketPaths"), dict) else {}
    missing_owner_paths = [path for path in owner_paths.values() if not Path(str(path)).exists()]
    add_check(
        checks,
        "human-help-items-present",
        "Quipsly OS",
        "pass" if items and int(counts.get("helpItems") or 0) == len(items) else "fail",
        "Human Help Board has item rows matching declared count",
        {"declared": counts.get("helpItems"), "actual": len(items)},
    )
    add_check(
        checks,
        "human-help-owner-packets",
        "Quipsly OS",
        "pass" if owner_paths and not missing_owner_paths else "fail",
        "Human Help Board exposes existing owner packets",
        {"owners": sorted(owner_paths), "missing": missing_owner_paths},
    )
    incomplete_items = [
        item.get("id") or item.get("title")
        for item in items
        if isinstance(item, dict)
        and not (item.get("suggestedOwner") and item.get("humanAsk") and item.get("agentCanContinueWith"))
    ]
    add_check(
        checks,
        "human-help-action-language",
        "Quipsly OS",
        "pass" if not incomplete_items and items else "fail",
        "Human Help Board rows include suggested owner, human ask, and Codex continuation guidance",
        {"incompleteItems": incomplete_items[:20], "incompleteCount": len(incomplete_items)},
    )
    truth = human_help.get("truth") if isinstance(human_help.get("truth"), dict) else {}
    add_check(
        checks,
        "human-help-no-side-effects",
        "Quipsly OS",
        "pass" if truth.get("externalPublishing") is False and truth.get("originalsMutated") is False and truth.get("accountMutation") is False else "fail",
        "Human Help Board declares no publishing, original mutation, or account mutation",
        truth,
    )


def validate_blocker_decision_ledger(checks: list[dict[str, Any]], ledger: dict[str, Any]) -> None:
    counts = ledger.get("counts") if isinstance(ledger.get("counts"), dict) else {}
    rows = ledger.get("rows") if isinstance(ledger.get("rows"), list) else []
    runway = ledger.get("runway") if isinstance(ledger.get("runway"), dict) else {}
    owner_paths = ledger.get("ownerPacketPaths") if isinstance(ledger.get("ownerPacketPaths"), dict) else {}
    missing_owner_paths = [path for path in owner_paths.values() if not Path(str(path)).exists()]
    missing_language = [
        row.get("id") or row.get("title")
        for row in rows
        if isinstance(row, dict)
        and not (
            row.get("suggestedOwner")
            and row.get("humanDecisionNeeded")
            and row.get("codexCanContinueWith")
            and row.get("nextSafestAction")
        )
    ]
    truth = ledger.get("truth") if isinstance(ledger.get("truth"), dict) else {}
    add_check(
        checks,
        "blocker-ledger-rows-present",
        "Quipsly OS",
        "pass" if rows and int(counts.get("rows") or 0) == len(rows) else "fail",
        "Blocker/decision ledger has row count matching declared count",
        {"declared": counts.get("rows"), "actual": len(rows)},
    )
    add_check(
        checks,
        "blocker-ledger-action-language",
        "Quipsly OS",
        "pass" if rows and not missing_language else "fail",
        "Blocker/decision ledger rows include owner, human decision, Codex continuation, and next action",
        {"missingLanguage": missing_language[:20], "missingCount": len(missing_language)},
    )
    add_check(
        checks,
        "blocker-ledger-runway",
        "Quipsly OS",
        "pass" if runway.get("statusSentence") and runway.get("firstHumanActions") is not None and runway.get("firstCodexActions") is not None else "fail",
        "Blocker/decision ledger exposes a restart runway",
        runway,
    )
    add_check(
        checks,
        "blocker-ledger-owner-packets",
        "Quipsly OS",
        "pass" if owner_paths and not missing_owner_paths else "fail",
        "Blocker/decision ledger exposes existing owner packets",
        {"owners": sorted(owner_paths), "missing": missing_owner_paths},
    )
    add_check(
        checks,
        "blocker-ledger-no-side-effects",
        "Quipsly OS",
        "pass" if truth.get("externalPublishing") is False and truth.get("originalsMutated") is False and truth.get("accountMutation") is False else "fail",
        "Blocker/decision ledger declares no publishing, original mutation, or account mutation",
        truth,
    )


def validate_production_readiness_matrix(checks: list[dict[str, Any]], brief: dict[str, Any]) -> None:
    matrix = brief.get("productionReadinessMatrix") if isinstance(brief.get("productionReadinessMatrix"), list) else []
    ids = {str(row.get("id") or "") for row in matrix if isinstance(row, dict)}
    add_check(
        checks,
        "return-brief-production-matrix-present",
        "Quipsly OS",
        "pass" if matrix else "fail",
        "Return brief exposes a production readiness matrix",
        {"rows": len(matrix)},
    )
    add_check(
        checks,
        "return-brief-production-matrix-required-lanes",
        "Quipsly OS",
        "pass" if REQUIRED_PRODUCTION_MATRIX_IDS.issubset(ids) else "fail",
        "Production readiness matrix includes all required proof lanes",
        {"required": sorted(REQUIRED_PRODUCTION_MATRIX_IDS), "actual": sorted(ids)},
    )
    incomplete = []
    missing_paths = []
    for row in matrix:
        if not isinstance(row, dict):
            continue
        row_id = str(row.get("id") or "")
        if not (row.get("lane") and row.get("status") and row.get("readiness") and row.get("gateSummary") and row.get("nextSafestAction")):
            incomplete.append(row_id or row.get("lane") or "unknown")
        for key in ("htmlPath", "jsonPath", "markdownPath", "worksheetPath"):
            value = str(row.get(key) or "")
            if value and not Path(value).exists():
                missing_paths.append({"id": row_id, "key": key, "path": value})
    add_check(
        checks,
        "return-brief-production-matrix-row-language",
        "Quipsly OS",
        "pass" if not incomplete and matrix else "fail",
        "Production readiness matrix rows include status, readiness, gate, and next action",
        {"incomplete": incomplete},
    )
    add_check(
        checks,
        "return-brief-production-matrix-paths",
        "Quipsly OS",
        "pass" if not missing_paths and matrix else "fail",
        "Production readiness matrix openable artifact paths exist",
        {"missing": missing_paths[:20], "missingCount": len(missing_paths)},
    )


def validate_return_review_path(checks: list[dict[str, Any]], pointer: dict[str, Any], brief: dict[str, Any]) -> None:
    path = brief.get("returnReviewPath") if isinstance(brief.get("returnReviewPath"), list) else []
    pointer_path = pointer.get("returnReviewPath") if isinstance(pointer.get("returnReviewPath"), list) else []
    required_lanes = {"Quipsly OS", "Studio podcast/video", "Studio shorts", "Tower publishing/social", "Parallel proof lanes", "Blockers"}
    actual_lanes = {str(step.get("lane") or "") for step in path if isinstance(step, dict)}
    missing_language = []
    missing_paths = []
    unsafe_steps = []
    for step in path:
        if not isinstance(step, dict):
            continue
        if not (step.get("label") and step.get("why") and step.get("safety")):
            missing_language.append(step.get("index") or step.get("lane") or "unknown")
        path_value = str(step.get("path") or "")
        if path_value and not Path(path_value).exists():
            missing_paths.append({"index": step.get("index"), "lane": step.get("lane"), "path": path_value})
        safety = str(step.get("safety") or "").lower()
        unsafe_positive_claims = (
            "will publish",
            "will upload",
            "will schedule",
            "already published",
            "receipt created",
            "receipt captured",
            "external publication complete",
        )
        if not safety or any(claim in safety for claim in unsafe_positive_claims):
            unsafe_steps.append({"index": step.get("index"), "lane": step.get("lane"), "safety": step.get("safety")})
    add_check(
        checks,
        "return-brief-review-path-present",
        "Quipsly OS",
        "pass" if len(path) >= 7 and len(pointer_path) == len(path) else "fail",
        "Return brief exposes the first calm hour path in payload and latest pointer",
        {"payloadSteps": len(path), "pointerSteps": len(pointer_path)},
    )
    add_check(
        checks,
        "return-brief-review-path-required-lanes",
        "Quipsly OS",
        "pass" if required_lanes.issubset(actual_lanes) else "fail",
        "Return brief first calm hour covers OS, Studio, Shorts, Tower, parallel lanes, and blockers",
        {"required": sorted(required_lanes), "actual": sorted(actual_lanes)},
    )
    add_check(
        checks,
        "return-brief-review-path-language",
        "Quipsly OS",
        "pass" if path and not missing_language and not unsafe_steps else "fail",
        "Return brief first calm hour steps include why/safety language and avoid external-action claims",
        {"missingLanguage": missing_language, "unsafeSteps": unsafe_steps},
    )
    add_check(
        checks,
        "return-brief-review-path-paths",
        "Quipsly OS",
        "pass" if path and not missing_paths else "fail",
        "Return brief first calm hour paths exist on disk",
        {"missing": missing_paths[:20], "missingCount": len(missing_paths)},
    )


def validate_production_conveyor(checks: list[dict[str, Any]], pointer: dict[str, Any], brief: dict[str, Any]) -> None:
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    pointer_conveyor = pointer.get("productionConveyor") if isinstance(pointer.get("productionConveyor"), dict) else {}
    rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    pointer_rows = pointer_conveyor.get("rows") if isinstance(pointer_conveyor.get("rows"), list) else []
    required_lanes = {"Studio podcast/video", "Nest writing/research", "Photo Grove", "360 workflow", "Tower publishing/social"}
    actual_lanes = {str(row.get("lane") or "") for row in rows if isinstance(row, dict)}
    path_value = str(brief.get("productionConveyorPath") or pointer.get("productionConveyorPath") or "")
    path = Path(path_value) if path_value else Path("")
    missing_language = []
    missing_paths = []
    unsafe_rows = []
    related_missing_paths = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        if not (row.get("lane") and row.get("label") and row.get("nextMove") and row.get("operatorMicroAction") and row.get("ifStalls") and row.get("safety")):
            missing_language.append(row.get("index") or row.get("lane") or "unknown")
        row_path_value = str(row.get("path") or "")
        if row_path_value and not Path(row_path_value).exists():
            missing_paths.append({"index": row.get("index"), "lane": row.get("lane"), "path": row_path_value})
        for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
            if not isinstance(related, dict) or not related.get("path"):
                continue
            related_path_value = str(related.get("path") or "")
            if related_path_value and not Path(related_path_value).exists():
                related_missing_paths.append({
                    "index": row.get("index"),
                    "lane": row.get("lane"),
                    "field": related.get("field"),
                    "path": related_path_value,
                })
        safety = str(row.get("safety") or "").lower()
        unsafe_positive_claims = (
            "will publish",
            "will upload",
            "will schedule",
            "already published",
            "receipt created",
            "receipt captured",
            "external publication complete",
        )
        if not safety or any(claim in safety for claim in unsafe_positive_claims):
            unsafe_rows.append({"index": row.get("index"), "lane": row.get("lane"), "safety": row.get("safety")})
    add_check(
        checks,
        "return-brief-production-conveyor-present",
        "Quipsly OS",
        "pass" if len(rows) >= 5 and len(pointer_rows) == len(rows) else "fail",
        "Return brief exposes a production conveyor in payload and latest pointer",
        {"payloadRows": len(rows), "pointerRows": len(pointer_rows)},
    )
    add_check(
        checks,
        "return-brief-production-conveyor-path",
        "Quipsly OS",
        "pass" if path.exists() and path.name == "PRODUCTION-CONVEYOR.md" else "fail",
        "Production conveyor Markdown artifact exists",
        {"path": path_value, "exists": path.exists() if path_value else False},
    )
    add_check(
        checks,
        "return-brief-production-conveyor-required-lanes",
        "Quipsly OS",
        "pass" if required_lanes.issubset(actual_lanes) else "fail",
        "Production conveyor covers all current production lanes",
        {"required": sorted(required_lanes), "actual": sorted(actual_lanes)},
    )
    add_check(
        checks,
        "return-brief-production-conveyor-language",
        "Quipsly OS",
        "pass" if rows and not missing_language and not unsafe_rows else "fail",
        "Production conveyor rows include next move, operator micro-action, stall handling, and safe local-only language",
        {"missingLanguage": missing_language, "unsafeRows": unsafe_rows},
    )
    add_check(
        checks,
        "return-brief-production-conveyor-row-paths",
        "Quipsly OS",
        "pass" if rows and not missing_paths and not related_missing_paths else "fail",
        "Production conveyor row and related surface paths exist on disk",
        {"missing": missing_paths[:20], "missingCount": len(missing_paths), "missingRelated": related_missing_paths[:20], "missingRelatedCount": len(related_missing_paths)},
    )


def validate_photo_cull_decision_cards(checks: list[dict[str, Any]], photo_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = photo_control.get("counts") if isinstance(photo_control.get("counts"), dict) else {}
    cards_payload = photo_control.get("cullDecisionCards") if isinstance(photo_control.get("cullDecisionCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("cullDecisionCards") or 0)
    cards_path_value = str(photo_control.get("cullDecisionCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    next_card_path_value = str(photo_control.get("nextCullCardPath") or "")
    next_card_path = Path(next_card_path_value) if next_card_path_value else Path("")
    allowed = set(cards_payload.get("allowedLocalClassifications") if isinstance(cards_payload.get("allowedLocalClassifications"), list) else [])
    required_allowed = {"keep", "favorite", "reject", "review", "pending"}
    cards_missing_note = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localReviewNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not mutate originals", "write metadata"])
    ]
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    conveyor_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    photo_conveyor_paths = [
        str(row.get("path") or "")
        for row in conveyor_rows
        if isinstance(row, dict) and str(row.get("lane") or "") == "Photo Grove"
    ]
    photo_conveyor_related_paths = [
        str(related.get("path") or "")
        for row in conveyor_rows
        if isinstance(row, dict) and str(row.get("lane") or "") == "Photo Grove"
        for related in (row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else [])
        if isinstance(related, dict)
    ]
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    photo_workspace_paths = [
        str(row.get("path") or "")
        for row in workspace_rows
        if isinstance(row, dict) and str(row.get("lane") or "") == "Photo Grove"
    ]
    photo_workspace_related_paths = [
        str(related.get("path") or "")
        for row in workspace_rows
        if isinstance(row, dict) and str(row.get("lane") or "") == "Photo Grove"
        for related in (row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else [])
        if isinstance(related, dict)
    ]
    all_photo_return_paths = set(photo_conveyor_paths + photo_conveyor_related_paths + photo_workspace_paths + photo_workspace_related_paths)
    add_check(
        checks,
        "photo-grove-cull-decision-cards-present",
        "Photo Grove",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Photo Grove exposes cull decision cards in latest control-room truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "photo-grove-cull-decision-cards-path",
        "Photo Grove",
        "pass" if cards_path.exists() and cards_path.name == "CULL-DECISION-CARDS.md" else "fail",
        "Photo Grove cull decision card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "photo-grove-cull-decision-cards-language",
        "Photo Grove",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety else "fail",
        "Cull cards include allowed local classifications, copyable notes, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
        },
    )
    add_check(
        checks,
        "photo-grove-cull-decision-cards-return-brief",
        "Photo Grove",
        "pass" if (
            (next_card_path_value and next_card_path.exists() and next_card_path_value in all_photo_return_paths)
            and (cards_path_value and cards_path_value in all_photo_return_paths)
        ) else "fail",
        "Return brief opens Photo Grove through the next cull card while keeping cull decision cards reachable",
        {
            "nextCullCardPath": next_card_path_value,
            "nextCullCardExists": next_card_path.exists() if next_card_path_value else False,
            "cardsPath": cards_path_value,
            "conveyorPaths": photo_conveyor_paths,
            "workspacePaths": photo_workspace_paths,
            "relatedPaths": sorted(path for path in all_photo_return_paths if path),
        },
    )


def validate_photo_quality_evidence_cards(checks: list[dict[str, Any]], photo_control: dict[str, Any]) -> None:
    counts = photo_control.get("counts") if isinstance(photo_control.get("counts"), dict) else {}
    cards_payload = photo_control.get("qualityEvidenceCards") if isinstance(photo_control.get("qualityEvidenceCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("qualityEvidenceCards") or 0)
    cards_path_value = str(photo_control.get("qualityEvidenceCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    cards_missing_note = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localEvidenceNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not mutate originals", "write metadata"])
    ]
    cards_missing_evidence = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not (str(card.get("attentionRoute") or "").strip() or card.get("qualityFlags") or card.get("attentionReasons"))
    ]
    add_check(
        checks,
        "photo-grove-quality-evidence-cards-present",
        "Photo Grove",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Photo Grove exposes quality evidence cards in latest control-room truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "photo-grove-quality-evidence-cards-path",
        "Photo Grove",
        "pass" if cards_path.exists() and cards_path.name == "QUALITY-EVIDENCE-CARDS.md" else "fail",
        "Photo Grove quality evidence card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "photo-grove-quality-evidence-cards-language",
        "Photo Grove",
        "pass" if not cards_missing_note and not cards_missing_safety and not cards_missing_evidence else "fail",
        "Quality evidence cards include evidence routes, copyable notes, and local-only safety language",
        {
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "missingEvidence": cards_missing_evidence[:20],
        },
    )


def validate_photo_proof_candidate_cards(checks: list[dict[str, Any]], photo_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = photo_control.get("counts") if isinstance(photo_control.get("counts"), dict) else {}
    proof_cards = photo_control.get("proofCandidateCards") if isinstance(photo_control.get("proofCandidateCards"), dict) else {}
    cards = proof_cards.get("cards") if isinstance(proof_cards.get("cards"), list) else []
    card_count = int(counts.get("proofCandidateCards") or 0)
    cards_path_value = str(photo_control.get("proofCandidateCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    allowed = set(proof_cards.get("allowedLocalActions") if isinstance(proof_cards.get("allowedLocalActions"), list) else [])
    required_allowed = {"open-source-and-compare", "copy-proof-candidate-note", "hold-for-review", "mark-ready-for-human-proof-decision"}
    cards_missing_note = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localProofCandidateNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("photoId") or card.get("filename") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not select proof images", "mutate originals", "receipt truth"])
    ]
    unsafe_counts = bool(
        (proof_cards.get("counts") or {}).get("selectedForClientProof")
        or (proof_cards.get("counts") or {}).get("copyPlanExecuted")
        or (proof_cards.get("counts") or {}).get("metadataChanged")
        or (proof_cards.get("counts") or {}).get("clientDeliveryCreated")
    )
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    photo_workspace_paths: list[str] = []
    for row in workspace_rows:
        if not isinstance(row, dict) or str(row.get("lane") or "") != "Photo Grove":
            continue
        photo_workspace_paths.append(str(row.get("path") or ""))
        for related in row.get("relatedPaths") or []:
            if isinstance(related, dict):
                photo_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "photo-grove-proof-candidate-cards-present",
        "Photo Grove",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Photo Grove exposes proof candidate cards without selecting proof images",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "photo-grove-proof-candidate-cards-path",
        "Photo Grove",
        "pass" if cards_path.exists() and cards_path.name == "PROOF-CANDIDATE-CARDS.md" else "fail",
        "Photo Grove proof-candidate Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "photo-grove-proof-candidate-cards-language",
        "Photo Grove",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not unsafe_counts else "fail",
        "Proof candidate cards include copyable notes, allowed local actions, and local-only proof safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "unsafeCounts": unsafe_counts,
        },
    )
    add_check(
        checks,
        "photo-grove-proof-candidate-cards-return-brief",
        "Photo Grove",
        "pass" if cards_path_value and cards_path_value in set(photo_workspace_paths) else "fail",
        "Return brief exposes Photo Grove proof candidate cards as a related local surface",
        {"cardsPath": cards_path_value, "workspacePaths": photo_workspace_paths},
    )


def validate_nest_writing_work_cards(checks: list[dict[str, Any]], nest_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = nest_control.get("counts") if isinstance(nest_control.get("counts"), dict) else {}
    cards_payload = nest_control.get("writingWorkCards") if isinstance(nest_control.get("writingWorkCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("writingWorkCards") or 0)
    cards_path_value = str(nest_control.get("writingWorkCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    next_card_path_value = str(nest_control.get("nextWritingCardPath") or "")
    next_card_path = Path(next_card_path_value) if next_card_path_value else Path("")
    allowed = set(cards_payload.get("allowedLocalMoves") if isinstance(cards_payload.get("allowedLocalMoves"), list) else [])
    required_allowed = {"draft", "revise", "split", "source-check", "hold", "approve-for-human-next-pass"}
    cards_missing_note = [
        card.get("title") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localWorkNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("title") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not mutate sources", "replace canonical"])
    ]
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    conveyor_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    nest_conveyor_paths: list[str] = []
    for row in conveyor_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Nest writing/research":
            nest_conveyor_paths.append(str(row.get("path") or ""))
            for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
                if isinstance(related, dict):
                    nest_conveyor_paths.append(str(related.get("path") or ""))
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    nest_workspace_paths: list[str] = []
    for row in workspace_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Nest writing/research":
            nest_workspace_paths.append(str(row.get("path") or ""))
            for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
                if isinstance(related, dict):
                    nest_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "nest-writing-work-cards-present",
        "Nest writing/research",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Nest writing exposes source-backed writing work cards in latest control-room truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "nest-writing-work-cards-path",
        "Nest writing/research",
        "pass" if cards_path.exists() and cards_path.name == "WRITING-WORK-CARDS.md" else "fail",
        "Nest writing work-card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "nest-writing-work-cards-language",
        "Nest writing/research",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety else "fail",
        "Writing work cards include allowed local moves, copyable notes, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
        },
    )
    add_check(
        checks,
        "nest-writing-work-cards-return-brief",
        "Nest writing/research",
        "pass" if next_card_path_value and next_card_path.exists() and cards_path_value and cards_path_value in set(nest_conveyor_paths + nest_workspace_paths) else "fail",
        "Return brief opens Nest writing through the next writing card while keeping work cards reachable",
        {
            "nextWritingCardPath": next_card_path_value,
            "nextWritingCardExists": next_card_path.exists() if next_card_path_value else False,
            "cardsPath": cards_path_value,
            "conveyorPaths": nest_conveyor_paths,
            "workspacePaths": nest_workspace_paths,
        },
    )


def validate_nest_publishable_draft_prep_cards(checks: list[dict[str, Any]], nest_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = nest_control.get("counts") if isinstance(nest_control.get("counts"), dict) else {}
    cards_payload = nest_control.get("publishableDraftPrepCards") if isinstance(nest_control.get("publishableDraftPrepCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("publishableDraftPrepCards") or 0)
    cards_path_value = str(nest_control.get("publishableDraftPrepCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    allowed = set(cards_payload.get("allowedLocalOutputs") if isinstance(cards_payload.get("allowedLocalOutputs"), list) else [])
    required_allowed = {"source-check-note", "revision-brief", "book-section-draft", "article-draft", "podcast-episode-page-copy", "social-caption-pack"}
    cards_missing_note = [
        card.get("title") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localPrepNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("title") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not mutate sources", "replace canon", "receipt"])
    ]
    unsafe_counts = bool(
        (cards_payload.get("counts") or {}).get("sourceFilesMutated")
        or (cards_payload.get("counts") or {}).get("canonicalManuscriptReplaced")
        or (cards_payload.get("counts") or {}).get("externalPublishing")
        or (cards_payload.get("counts") or {}).get("receiptTruthCreated")
    )
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    nest_workspace_paths: list[str] = []
    for row in workspace_rows:
        if not isinstance(row, dict) or str(row.get("lane") or "") != "Nest writing/research":
            continue
        nest_workspace_paths.append(str(row.get("path") or ""))
        for related in row.get("relatedPaths") or []:
            if isinstance(related, dict):
                nest_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "nest-publishable-draft-prep-cards-present",
        "Nest writing/research",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Nest writing exposes publishable draft prep cards without canon or publication claims",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "nest-publishable-draft-prep-cards-path",
        "Nest writing/research",
        "pass" if cards_path.exists() and cards_path.name == "PUBLISHABLE-DRAFT-PREP-CARDS.md" else "fail",
        "Nest publishable draft prep Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "nest-publishable-draft-prep-cards-language",
        "Nest writing/research",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not unsafe_counts else "fail",
        "Publishable draft prep cards include allowed local outputs, copyable notes, and local-only canon/publication safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "unsafeCounts": unsafe_counts,
        },
    )
    add_check(
        checks,
        "nest-publishable-draft-prep-cards-return-brief",
        "Nest writing/research",
        "pass" if cards_path_value and cards_path_value in set(nest_workspace_paths) else "fail",
        "Return brief exposes Nest publishable draft prep cards as a related local surface",
        {"cardsPath": cards_path_value, "workspacePaths": nest_workspace_paths},
    )


def validate_tower_publishing_action_cards(checks: list[dict[str, Any]], tower_social: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = tower_social.get("counts") if isinstance(tower_social.get("counts"), dict) else {}
    cards_payload = tower_social.get("manualPublishingActionCards") if isinstance(tower_social.get("manualPublishingActionCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("manualPublishingActionCards") or 0)
    cards_path_value = str(tower_social.get("manualPublishingActionCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    next_card_path_value = str(tower_social.get("nextPublishingCardPath") or "")
    next_card_path = Path(next_card_path_value) if next_card_path_value else Path("")
    allowed = set(cards_payload.get("allowedLocalActions") if isinstance(cards_payload.get("allowedLocalActions"), list) else [])
    required_allowed = {"review-packet", "request-approval", "hold", "repair-packet", "manual-post-after-approval", "capture-receipt-after-post"}
    cards_missing_note = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localPostingNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not publish", "receipt truth"])
    ]
    unsafe_claims = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and (
            str(card.get("approvalState") or "") != "not-approved-for-external-action"
            or str(card.get("publicationState") or "") != "not-published"
            or str(card.get("receiptSlot") or "") != "empty-until-real-platform-url-or-provider-id"
        )
    ]
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    conveyor_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    tower_conveyor_paths: list[str] = []
    for row in conveyor_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Tower publishing/social":
            tower_conveyor_paths.append(str(row.get("path") or ""))
            for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
                if isinstance(related, dict):
                    tower_conveyor_paths.append(str(related.get("path") or ""))
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    tower_workspace_paths: list[str] = []
    for row in workspace_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Tower publishing/social":
            tower_workspace_paths.append(str(row.get("path") or ""))
            for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
                if isinstance(related, dict):
                    tower_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "tower-publishing-action-cards-present",
        "Tower publishing/social",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Tower exposes manual publishing action cards in latest social command truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "tower-publishing-action-cards-path",
        "Tower publishing/social",
        "pass" if cards_path.exists() and cards_path.name == "TOWER-PUBLISHING-ACTION-CARDS.md" else "fail",
        "Tower publishing action-card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "tower-publishing-action-cards-language",
        "Tower publishing/social",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not unsafe_claims else "fail",
        "Publishing action cards include allowed local actions, copyable notes, receipt slots, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "unsafeClaims": unsafe_claims[:20],
        },
    )
    add_check(
        checks,
        "tower-publishing-action-cards-return-brief",
        "Tower publishing/social",
        "pass" if next_card_path_value and next_card_path.exists() and cards_path_value and cards_path_value in set(tower_conveyor_paths + tower_workspace_paths) else "fail",
        "Return brief opens Tower through the next publishing card while keeping action cards reachable",
        {
            "nextPublishingCardPath": next_card_path_value,
            "nextPublishingCardExists": next_card_path.exists() if next_card_path_value else False,
            "cardsPath": cards_path_value,
            "conveyorPaths": tower_conveyor_paths,
            "workspacePaths": tower_workspace_paths,
        },
    )


def validate_tower_shorts_publishing_action_cards(checks: list[dict[str, Any]], tower_social: dict[str, Any]) -> None:
    counts = tower_social.get("counts") if isinstance(tower_social.get("counts"), dict) else {}
    cards_payload = tower_social.get("shortsPublishingActionCards") if isinstance(tower_social.get("shortsPublishingActionCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("shortsPublishingActionCards") or 0)
    cards_path_value = str(tower_social.get("shortsPublishingActionCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    long_cards_path_value = str(tower_social.get("manualPublishingActionCardsPath") or "")
    long_cards_text = Path(long_cards_path_value).read_text(encoding="utf-8") if long_cards_path_value and Path(long_cards_path_value).exists() else ""
    allowed = set(cards_payload.get("allowedLocalActions") if isinstance(cards_payload.get("allowedLocalActions"), list) else [])
    required_allowed = {"watch-listen-review", "refine-title-caption", "hold", "request-approval", "manual-post-after-approval", "capture-receipt-after-post"}
    cards_missing_note = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localPostingNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not publish", "receipt truth"])
    ]
    unsafe_claims = [
        card.get("id") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and (
            str(card.get("approvalState") or "") != "not-approved-for-external-action"
            or str(card.get("publicationState") or "") != "not-published"
            or str(card.get("receiptSlot") or "") != "empty-until-real-platform-url-or-provider-id"
        )
    ]
    add_check(
        checks,
        "tower-shorts-publishing-action-cards-present",
        "Tower publishing/social",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Tower exposes shorts publishing action cards in latest social command truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "tower-shorts-publishing-action-cards-path",
        "Tower publishing/social",
        "pass" if cards_path.exists() and cards_path.name == "SHORTS-PUBLISHING-ACTION-CARDS.md" else "fail",
        "Tower shorts publishing action-card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "tower-shorts-publishing-action-cards-language",
        "Tower publishing/social",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not unsafe_claims else "fail",
        "Shorts action cards include allowed local actions, copyable notes, receipt slots, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "unsafeClaims": unsafe_claims[:20],
        },
    )
    add_check(
        checks,
        "tower-shorts-publishing-action-cards-linked",
        "Tower publishing/social",
        "pass" if cards_path_value and cards_path_value in long_cards_text else "fail",
        "Tower long-form action cards point to the shorts action-card companion",
        {"shortsCardsPath": cards_path_value, "manualCardsPath": long_cards_path_value},
    )


def validate_tower_draft_social_calendar(checks: list[dict[str, Any]], tower_social: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = tower_social.get("counts") if isinstance(tower_social.get("counts"), dict) else {}
    review_week = tower_social.get("reviewWeekPlan") if isinstance(tower_social.get("reviewWeekPlan"), dict) else {}
    review_counts = review_week.get("counts") if isinstance(review_week.get("counts"), dict) else {}
    calendar_path_value = str(tower_social.get("draftSocialCalendarPath") or tower_social.get("reviewWeekPlanPath") or "")
    calendar_path = Path(calendar_path_value) if calendar_path_value else Path("")
    calendar_text = calendar_path.read_text(encoding="utf-8") if calendar_path_value and calendar_path.exists() else ""
    mode = str(review_week.get("mode") or "")
    required_language = [
        "not an external calendar",
        "does not approve publication",
        "does not upload, post, schedule",
        "no platform schedule exists",
    ]
    missing_language = [needle for needle in required_language if needle not in calendar_text.lower()]
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    tower_workspace_paths: list[str] = []
    for row in workspace_rows:
        if not isinstance(row, dict) or str(row.get("lane") or "") != "Tower publishing/social":
            continue
        tower_workspace_paths.append(str(row.get("path") or ""))
        for related in row.get("relatedPaths") or []:
            if isinstance(related, dict):
                tower_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "tower-draft-social-calendar-present",
        "Tower publishing/social",
        "pass" if calendar_path.exists() and calendar_path.name == "tower-five-day-local-review-plan.md" else "fail",
        "Tower exposes a draft social calendar / five-day review plan artifact",
        {"path": calendar_path_value, "exists": calendar_path.exists() if calendar_path_value else False},
    )
    add_check(
        checks,
        "tower-draft-social-calendar-counts",
        "Tower publishing/social",
        "pass" if int(counts.get("reviewWeekPlanSlots") or 0) >= 1 and int(counts.get("reviewWeekPlanDays") or 0) >= 1 and int(review_counts.get("slots") or 0) >= 1 else "fail",
        "Tower draft social calendar has local sequencing slots and days",
        {"towerCounts": counts, "reviewWeekCounts": review_counts},
    )
    add_check(
        checks,
        "tower-draft-social-calendar-language",
        "Tower publishing/social",
        "pass" if mode == "draft-only-not-scheduled" and not missing_language else "fail",
        "Tower draft social calendar preserves draft-only scheduling boundaries",
        {"mode": mode, "missingLanguage": missing_language},
    )
    add_check(
        checks,
        "tower-draft-social-calendar-return-brief",
        "Tower publishing/social",
        "pass" if calendar_path_value and calendar_path_value in set(tower_workspace_paths) else "fail",
        "Return brief exposes the Tower draft social calendar as a related local surface",
        {"calendarPath": calendar_path_value, "workspacePaths": tower_workspace_paths},
    )


def validate_studio360_source_routing_cards(checks: list[dict[str, Any]], studio360_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = studio360_control.get("counts") if isinstance(studio360_control.get("counts"), dict) else {}
    cards_payload = studio360_control.get("sourceRoutingCards") if isinstance(studio360_control.get("sourceRoutingCards"), dict) else {}
    cards = cards_payload.get("cards") if isinstance(cards_payload.get("cards"), list) else []
    card_count = int(counts.get("studio360SourceRoutingCards") or 0)
    next_card_path_value = str(studio360_control.get("next360SourceCardPath") or "")
    next_card_path = Path(next_card_path_value) if next_card_path_value else Path("")
    cards_path_value = str(studio360_control.get("sourceRoutingCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    allowed = set(cards_payload.get("allowedLocalActions") if isinstance(cards_payload.get("allowedLocalActions"), list) else [])
    required_allowed = {"open-source-in-finder", "open-source-desk", "copy-evidence-note", "classify-for-review", "hold"}
    cards_missing_note = [
        card.get("groupKey") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localEvidenceNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("groupKey") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(
            needle in str(card.get("truth") or "").lower()
            for needle in ["does not generate proxies", "mutate source media", "write metadata", "create receipts"]
        )
    ]
    cards_missing_route = [
        card.get("groupKey") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and (not str(card.get("route") or "") or not str(card.get("nextSafestAction") or ""))
    ]
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    conveyor_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    studio360_conveyor_paths: list[str] = []
    for row in conveyor_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "360 workflow":
            studio360_conveyor_paths.append(str(row.get("path") or ""))
            related = row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []
            studio360_conveyor_paths.extend(str(item.get("path") or "") for item in related if isinstance(item, dict))
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    studio360_workspace_paths: list[str] = []
    for row in workspace_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "360 workflow":
            studio360_workspace_paths.append(str(row.get("path") or ""))
            related = row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []
            studio360_workspace_paths.extend(str(item.get("path") or "") for item in related if isinstance(item, dict))
    add_check(
        checks,
        "studio360-source-routing-cards-present",
        "360 workflow",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Studio360 exposes source routing cards in latest proof control-room truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "studio360-source-routing-cards-path",
        "360 workflow",
        "pass" if cards_path.exists() and cards_path.name == "SOURCE-ROUTING-CARDS.md" else "fail",
        "Studio360 source routing card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "studio360-source-routing-cards-language",
        "360 workflow",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not cards_missing_route else "fail",
        "Source routing cards include allowed local actions, copyable evidence notes, route labels, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "missingRoute": cards_missing_route[:20],
        },
    )
    add_check(
        checks,
        "studio360-source-routing-cards-return-brief",
        "360 workflow",
        "pass" if next_card_path.exists() and cards_path_value and cards_path_value in set(studio360_conveyor_paths + studio360_workspace_paths) else "fail",
        "Return brief opens Studio360 through the next source card while keeping source routing cards reachable",
        {
            "nextCardPath": next_card_path_value,
            "nextCardExists": next_card_path.exists() if next_card_path_value else False,
            "cardsPath": cards_path_value,
            "conveyorPaths": studio360_conveyor_paths,
            "workspacePaths": studio360_workspace_paths,
        },
    )


def validate_studio360_render_dry_run_cards(checks: list[dict[str, Any]], studio360_control: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = studio360_control.get("counts") if isinstance(studio360_control.get("counts"), dict) else {}
    deck = studio360_control.get("renderDryRunCards") if isinstance(studio360_control.get("renderDryRunCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    card_count = int(counts.get("studio360RenderDryRunCards") or 0)
    cards_path_value = str(studio360_control.get("renderDryRunCardsPath") or "")
    cards_path = Path(cards_path_value) if cards_path_value else Path("")
    allowed = set(deck.get("allowedLocalActions") if isinstance(deck.get("allowedLocalActions"), list) else [])
    required_allowed = {"open-review-source", "open-renderer-preflight", "open-export-candidate-queue", "copy-render-dry-run-note", "mark-needs-proof-review", "hold"}
    cards_missing_note = [
        card.get("candidateId") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("renderDryRunNoteYaml") or "").strip()
    ]
    cards_missing_gates = [
        card.get("candidateId") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and (not str(card.get("proofGate") or "") or not str(card.get("fullRenderGate") or ""))
    ]
    cards_missing_safety = [
        card.get("candidateId") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(
            needle in str(card.get("truth") or "").lower()
            for needle in ["does not execute renderer commands", "mutate source media", "create receipts"]
        )
    ]
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    studio360_workspace_paths: list[str] = []
    for row in workspace_rows:
        if not isinstance(row, dict) or str(row.get("lane") or "") != "360 workflow":
            continue
        if row.get("path"):
            studio360_workspace_paths.append(str(row.get("path") or ""))
        for related in row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []:
            if isinstance(related, dict) and related.get("path"):
                studio360_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "studio360-render-dry-run-cards-present",
        "360 workflow",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Studio360 exposes render dry-run cards in latest proof control-room truth",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "studio360-render-dry-run-cards-path",
        "360 workflow",
        "pass" if cards_path.exists() and cards_path.name == "RENDER-DRY-RUN-CARDS.md" else "fail",
        "Studio360 render dry-run card Markdown artifact exists",
        {"path": cards_path_value, "exists": cards_path.exists() if cards_path_value else False},
    )
    add_check(
        checks,
        "studio360-render-dry-run-cards-language",
        "360 workflow",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_gates and not cards_missing_safety else "fail",
        "Render dry-run cards include allowed local actions, copyable evidence notes, proof/full-render gates, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingGates": cards_missing_gates[:20],
            "missingSafety": cards_missing_safety[:20],
        },
    )
    add_check(
        checks,
        "studio360-render-dry-run-cards-return-brief",
        "360 workflow",
        "pass" if cards_path_value and cards_path_value in set(studio360_workspace_paths) else "fail",
        "Return brief exposes Studio360 render dry-run cards as a related local surface",
        {"cardsPath": cards_path_value, "workspacePaths": studio360_workspace_paths},
    )


def validate_studio_reviewer_daily_checklist(checks: list[dict[str, Any]], studio_review: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = studio_review.get("counts") if isinstance(studio_review.get("counts"), dict) else {}
    checklist = studio_review.get("reviewerDailyChecklist") if isinstance(studio_review.get("reviewerDailyChecklist"), dict) else {}
    items = checklist.get("items") if isinstance(checklist.get("items"), list) else []
    item_count = int(counts.get("reviewerDailyChecklistItems") or 0)
    checklist_path_value = str(studio_review.get("reviewerDailyChecklistPath") or "")
    checklist_path = Path(checklist_path_value) if checklist_path_value else Path("")
    next_card_pointer = load_json(DEFAULT_STUDIO_NEXT_REVIEW_CARD_POINTER)
    next_card_path_value = str(next_card_pointer.get("nextStudioReviewCardPath") or next_card_pointer.get("htmlPath") or "")
    next_card_path = Path(next_card_path_value) if next_card_path_value else Path("")
    allowed = set(checklist.get("allowedLocalDecisions") if isinstance(checklist.get("allowedLocalDecisions"), list) else [])
    required_allowed = {"approve-for-next-local-step", "refine", "hold", "needs-more-evidence"}
    missing_templates = [
        item.get("episode") or index
        for index, item in enumerate(items, 1)
        if isinstance(item, dict) and not str(item.get("copyableDecisionTemplate") or "").strip()
    ]
    missing_paths = [
        item.get("episode") or index
        for index, item in enumerate(items, 1)
        if isinstance(item, dict) and not str(item.get("firstOpenCommand") or "").strip()
    ]
    checklist_text = checklist_path.read_text(encoding="utf-8") if checklist_path.exists() else ""
    safety_ok = all(
        needle in checklist_text.lower()
        for needle in ["does not approve", "does not upload", "does not create platform receipt truth", "does not overwrite"]
    )
    conveyor = brief.get("productionConveyor") if isinstance(brief.get("productionConveyor"), dict) else {}
    conveyor_rows = conveyor.get("rows") if isinstance(conveyor.get("rows"), list) else []
    studio_conveyor_paths: list[str] = []
    for row in conveyor_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Studio podcast/video":
            studio_conveyor_paths.append(str(row.get("path") or ""))
            related = row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []
            studio_conveyor_paths.extend(str(item.get("path") or "") for item in related if isinstance(item, dict))
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    studio_workspace_paths: list[str] = []
    for row in workspace_rows:
        if isinstance(row, dict) and str(row.get("lane") or "") == "Studio podcast/video":
            studio_workspace_paths.append(str(row.get("path") or ""))
            related = row.get("relatedPaths") if isinstance(row.get("relatedPaths"), list) else []
            studio_workspace_paths.extend(str(item.get("path") or "") for item in related if isinstance(item, dict))
    add_check(
        checks,
        "studio-reviewer-daily-checklist-present",
        "Studio podcast/video",
        "pass" if item_count >= 1 and len(items) == item_count else "fail",
        "Studio exposes reviewer daily checklist in latest work-session truth",
        {"count": item_count, "items": len(items)},
    )
    add_check(
        checks,
        "studio-reviewer-daily-checklist-path",
        "Studio podcast/video",
        "pass" if checklist_path.exists() and checklist_path.name == "REVIEWER-DAILY-CHECKLIST.md" else "fail",
        "Studio reviewer daily checklist Markdown artifact exists",
        {"path": checklist_path_value, "exists": checklist_path.exists() if checklist_path_value else False},
    )
    add_check(
        checks,
        "studio-reviewer-daily-checklist-language",
        "Studio podcast/video",
        "pass" if required_allowed.issubset(allowed) and not missing_templates and not missing_paths and safety_ok else "fail",
        "Reviewer daily checklist includes local decisions, copyable notes, open commands, and local-only safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingTemplates": missing_templates[:20],
            "missingOpenCommands": missing_paths[:20],
            "safetyOk": safety_ok,
        },
    )
    add_check(
        checks,
        "studio-reviewer-daily-checklist-return-brief",
        "Studio podcast/video",
        "pass" if next_card_path.exists() and checklist_path_value and checklist_path_value in set(studio_conveyor_paths + studio_workspace_paths) else "fail",
        "Return brief opens Studio through the next review card while keeping the reviewer daily checklist reachable",
        {
            "nextCardPath": next_card_path_value,
            "nextCardExists": next_card_path.exists() if next_card_path_value else False,
            "checklistPath": checklist_path_value,
            "conveyorPaths": studio_conveyor_paths,
            "workspacePaths": studio_workspace_paths,
        },
    )


def validate_studio_duration_warning_cards(checks: list[dict[str, Any]], studio_review: dict[str, Any], brief: dict[str, Any]) -> None:
    counts = studio_review.get("counts") if isinstance(studio_review.get("counts"), dict) else {}
    deck = studio_review.get("durationWarningCards") if isinstance(studio_review.get("durationWarningCards"), dict) else {}
    cards = deck.get("cards") if isinstance(deck.get("cards"), list) else []
    card_count = int(counts.get("durationWarningCards") or 0)
    deck_path_value = str(studio_review.get("durationWarningCardsPath") or "")
    deck_path = Path(deck_path_value) if deck_path_value else Path("")
    allowed = set(deck.get("allowedLocalDecisions") if isinstance(deck.get("allowedLocalDecisions"), list) else [])
    required_allowed = {"review-candidate", "refine", "hold", "sync-investigate", "source-needed"}
    cards_missing_note = [
        card.get("episode") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict) and not str(card.get("localDurationWarningNoteYaml") or "").strip()
    ]
    cards_missing_safety = [
        card.get("episode") or index
        for index, card in enumerate(cards, 1)
        if isinstance(card, dict)
        and not all(needle in str(card.get("truth") or "").lower() for needle in ["does not approve", "repair", "receipt"])
    ]
    unsafe_counts = bool(
        (deck.get("counts") or {}).get("repairsExecuted")
        or (deck.get("counts") or {}).get("exportsCreated")
        or (deck.get("counts") or {}).get("versionsOverwritten")
        or (deck.get("counts") or {}).get("sourceFilesMutated")
        or (deck.get("counts") or {}).get("receiptTruthCreated")
    )
    workspace_rows = brief.get("currentWorkspaces") if isinstance(brief.get("currentWorkspaces"), list) else []
    studio_workspace_paths: list[str] = []
    for row in workspace_rows:
        if not isinstance(row, dict) or str(row.get("lane") or "") != "Studio podcast/video":
            continue
        studio_workspace_paths.append(str(row.get("path") or ""))
        for related in row.get("relatedPaths") or []:
            if isinstance(related, dict):
                studio_workspace_paths.append(str(related.get("path") or ""))
    add_check(
        checks,
        "studio-duration-warning-cards-present",
        "Studio podcast/video",
        "pass" if card_count >= 1 and len(cards) == card_count else "fail",
        "Studio exposes duration warning cards for A/V spread and sync review workorders",
        {"count": card_count, "cards": len(cards)},
    )
    add_check(
        checks,
        "studio-duration-warning-cards-path",
        "Studio podcast/video",
        "pass" if deck_path.exists() and deck_path.name == "DURATION-WARNING-CARDS.md" else "fail",
        "Studio duration warning Markdown artifact exists",
        {"path": deck_path_value, "exists": deck_path.exists() if deck_path_value else False},
    )
    add_check(
        checks,
        "studio-duration-warning-cards-language",
        "Studio podcast/video",
        "pass" if required_allowed.issubset(allowed) and not cards_missing_note and not cards_missing_safety and not unsafe_counts else "fail",
        "Duration warning cards include allowed local decisions, copyable notes, and local-only no-repair safety language",
        {
            "requiredAllowed": sorted(required_allowed),
            "actualAllowed": sorted(str(item) for item in allowed),
            "missingNotes": cards_missing_note[:20],
            "missingSafety": cards_missing_safety[:20],
            "unsafeCounts": unsafe_counts,
        },
    )
    add_check(
        checks,
        "studio-duration-warning-cards-return-brief",
        "Studio podcast/video",
        "pass" if deck_path_value and deck_path_value in set(studio_workspace_paths) else "fail",
        "Return brief exposes Studio duration warning cards as a related local surface",
        {"cardsPath": deck_path_value, "workspacePaths": studio_workspace_paths},
    )


def validate_production_runway_return_path(checks: list[dict[str, Any]], runway: dict[str, Any]) -> None:
    path = runway.get("returnReviewPath") if isinstance(runway.get("returnReviewPath"), list) else []
    first = runway.get("firstSafeAction") if isinstance(runway.get("firstSafeAction"), dict) else {}
    first_path = Path(str(first.get("path") or "")) if first.get("path") else Path("")
    counts = runway.get("counts") if isinstance(runway.get("counts"), dict) else {}
    add_check(
        checks,
        "production-runway-return-path-present",
        "Quipsly OS",
        "pass" if len(path) >= 7 and int(counts.get("returnReviewPathSteps") or 0) == len(path) else "fail",
        "Production runway carries the Return Brief first calm hour path",
        {"steps": len(path), "declared": counts.get("returnReviewPathSteps")},
    )
    add_check(
        checks,
        "production-runway-first-action-return-brief",
        "Quipsly OS",
        "pass" if first_path.exists() and "ReturnBriefs" in str(first_path) else "fail",
        "Production runway first safe action opens the Return Brief front door",
        {"label": first.get("label"), "path": str(first_path), "exists": first_path.exists() if first_path else False},
    )


def validate_episode4_sync_stack_freshness(
    checks: list[dict[str, Any]],
    brief: dict[str, Any],
    production_runway: dict[str, Any],
    human_help: dict[str, Any],
) -> None:
    pointer, target, target_path = resolve_pointer(DEFAULT_EPISODE4_SYNC_STACK_POINTER)
    latest_path = str(pointer.get("htmlPath") or target.get("htmlPath") or "")
    latest_exists = bool(latest_path and Path(latest_path).exists())
    latest_evidence = {
        "pointer": str(DEFAULT_EPISODE4_SYNC_STACK_POINTER),
        "targetJson": str(target_path),
        "latestHtmlPath": latest_path,
        "latestExists": latest_exists,
    }
    add_check(
        checks,
        "episode4-sync-stack-latest-path-exists",
        "Studio podcast/video",
        "pass" if latest_exists else "fail",
        "Latest Episode 4 sync-stack handoff path exists",
        latest_evidence,
    )
    for label, payload in [
        ("return-brief", brief),
        ("production-runway", production_runway),
        ("human-help", human_help),
    ]:
        contains_latest = bool(latest_path and latest_path in json.dumps(payload))
        add_check(
            checks,
            f"{label}-references-latest-episode4-sync-stack",
            "Quipsly OS",
            "pass" if contains_latest else "fail",
            f"{label} references the current latest Episode 4 sync-stack handoff instead of a stale existing artifact",
            {**latest_evidence, "containsLatest": contains_latest},
        )


def validate_current_production_blocker_doc(checks: list[dict[str, Any]]) -> None:
    payload = load_json(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_POINTER)
    os_payload = load_json(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER)
    markdown_exists = DEFAULT_DESKTOP_BLOCKERS_MARKDOWN.exists()
    markdown_text = DEFAULT_DESKTOP_BLOCKERS_MARKDOWN.read_text(encoding="utf-8", errors="replace") if markdown_exists else ""
    counts = payload.get("counts") if isinstance(payload.get("counts"), dict) else {}
    os_counts = os_payload.get("counts") if isinstance(os_payload.get("counts"), dict) else {}
    truth = payload.get("truth") if isinstance(payload.get("truth"), dict) else {}
    os_json_path = Path(str(os_payload.get("jsonPath") or "")) if os_payload.get("jsonPath") else Path("")
    captured_receipts = counts.get("capturedReceipts")
    captured_receipts_count = int(captured_receipts) if captured_receipts is not None else -1
    add_check(
        checks,
        "current-production-blocker-doc-present",
        "Quipsly OS",
        "pass" if payload and markdown_exists else "fail",
        "Current Desktop production blocker sheet and JSON payload exist",
        {
            "jsonPath": str(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_POINTER),
            "jsonExists": DEFAULT_CURRENT_PRODUCTION_BLOCKERS_POINTER.exists(),
            "markdownPath": str(DEFAULT_DESKTOP_BLOCKERS_MARKDOWN),
            "markdownExists": markdown_exists,
        },
    )
    add_check(
        checks,
        "current-production-blocker-os-pointer-present",
        "Quipsly OS",
        "pass" if os_payload and DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER.exists() and os_json_path.exists() else "fail",
        "Current production blocker sheet has a stable OS latest pointer",
        {
            "osPointer": str(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER),
            "osPointerExists": DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER.exists(),
            "targetJsonPath": str(os_json_path),
            "targetJsonExists": os_json_path.exists(),
            "status": os_payload.get("status") or "",
        },
    )
    add_check(
        checks,
        "current-production-blocker-doc-counts",
        "Quipsly OS",
        "pass" if int(counts.get("episodes") or 0) >= 6 and int(counts.get("warningEpisodes") or 0) == 2 and captured_receipts_count == 0 else "fail",
        "Current production blocker sheet reflects Episode 1-6 review runway counts and no captured receipts",
        counts,
    )
    add_check(
        checks,
        "current-production-blocker-doc-carries-next-actions",
        "Quipsly OS",
        "pass" if int(os_counts.get("biteSizedNextActionsByLane") or 0) >= 5 and len(os_payload.get("biteSizedNextActionsByLane") or []) >= 5 else "fail",
        "Current production blocker payload carries bite-sized fallback actions by lane",
        {"counts": os_counts, "actions": len(os_payload.get("biteSizedNextActionsByLane") or [])},
    )
    add_check(
        checks,
        "current-production-blocker-doc-language",
        "Quipsly OS",
        "pass" if "current front doors" in markdown_text.lower() and "not publication approval" in markdown_text.lower() and "no upload, publish, schedule, approval, or platform receipt exists" in markdown_text.lower() else "fail",
        "Desktop blocker sheet uses current front-door and receipt-honest review language",
        {"markdownPath": str(DEFAULT_DESKTOP_BLOCKERS_MARKDOWN), "bytes": len(markdown_text.encode("utf-8")) if markdown_exists else 0},
    )
    add_check(
        checks,
        "current-production-blocker-doc-no-side-effects",
        "Quipsly OS",
        "pass" if truth.get("externalPublishing") is False and truth.get("sourceFilesMutated") is False and truth.get("receiptTruthCreated") is False and truth.get("accountMutation") is False else "fail",
        "Current production blocker payload declares no publishing, source mutation, account mutation, or receipt truth",
        truth,
    )


def build_payload(os_root: Path) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    production_runway_pointer_path = os_root.parent / "ProductionRunway" / "latest-quipsly-production-runway.json"
    board_pointer, board, board_path = validate_pointers(checks, os_root / "latest-quipsly-os-board.json", "board")
    brief_pointer, brief, brief_path = validate_pointers(checks, os_root / "latest-quipsly-return-brief.json", "return-brief")
    deck_pointer, deck, deck_path = validate_pointers(checks, os_root / "latest-quipsly-action-deck.json", "action-deck")
    refresh_pointer, refresh, refresh_path = validate_pointers(checks, os_root / "latest-quipsly-os-refresh.json", "refresh-run")
    latest_surface_audit_pointer, latest_surface_audit, latest_surface_audit_path = validate_pointers(checks, DEFAULT_LATEST_SURFACE_AUDIT_POINTER, "latest-surface-audit")
    human_help_pointer, human_help, human_help_path = validate_pointers(checks, os_root / "latest-quipsly-human-help-board.json", "human-help")
    blocker_ledger_pointer, blocker_ledger, blocker_ledger_path = validate_pointers(checks, DEFAULT_BLOCKER_LEDGER_POINTER, "blocker-decision-ledger")
    production_runway_pointer, production_runway, production_runway_path = validate_pointers(
        checks,
        production_runway_pointer_path if production_runway_pointer_path.exists() else DEFAULT_PRODUCTION_RUNWAY_POINTER,
        "production-runway",
    )
    photo_client_pointer, photo_client, photo_client_path = validate_pointers(checks, DEFAULT_PHOTO_CLIENT_PROOF_POINTER, "photo-client-proof")
    photo_contact_pointer, photo_contact, photo_contact_path = validate_pointers(checks, DEFAULT_PHOTO_CONTACT_SHEET_POINTER, "photo-contact-sheet")
    photo_control_pointer, photo_control, photo_control_path = validate_pointers(checks, DEFAULT_PHOTO_CONTROL_ROOM_POINTER, "photo-control-room")
    photo_cull_rehearsal_pointer, photo_cull_rehearsal, photo_cull_rehearsal_path = validate_pointers(checks, DEFAULT_PHOTO_CULL_REHEARSAL_POINTER, "photo-cull-rehearsal")
    photo_command_pointer, photo_command, photo_command_path = validate_pointers(checks, DEFAULT_PHOTO_COMMAND_SHEET_POINTER, "photo-command-sheet")
    photo_first_keepers_pointer, photo_first_keepers, photo_first_keepers_path = validate_pointers(checks, DEFAULT_PHOTO_FIRST_KEEPERS_POINTER, "photo-first-keepers")
    photo_keeper_desk_pointer, photo_keeper_desk, photo_keeper_desk_path = validate_pointers(checks, DEFAULT_PHOTO_KEEPER_DESK_POINTER, "photo-keeper-desk")
    studio_sync_control_pointer, studio_sync_control, studio_sync_control_path = validate_pointers(checks, DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER, "studio-sync-control-room")
    studio_sync_rehearsal_pointer, studio_sync_rehearsal, studio_sync_rehearsal_path = validate_pointers(checks, DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER, "studio-sync-decision-rehearsal")
    studio_watch_listen_pointer, studio_watch_listen, studio_watch_listen_path = validate_pointers(checks, DEFAULT_STUDIO_WATCH_LISTEN_REVIEW_ROOM_POINTER, "studio-watch-listen-review-room")
    studio_review_decision_pointer, studio_review_decision, studio_review_decision_path = validate_pointers(checks, DEFAULT_STUDIO_REVIEW_DECISION_LEDGER_POINTER, "studio-review-decision-ledger")
    studio_review_command_pointer, studio_review_command, studio_review_command_path = validate_pointers(checks, DEFAULT_STUDIO_REVIEW_COMMAND_SHEET_POINTER, "studio-review-command-sheet")
    studio_review_work_session_pointer, studio_review_work_session, studio_review_work_session_path = validate_pointers(checks, DEFAULT_STUDIO_REVIEW_WORK_SESSION_POINTER, "studio-review-work-session")
    studio_shorts_pointer, studio_shorts, studio_shorts_path = validate_pointers(checks, DEFAULT_STUDIO_SHORTS_REVIEW_COCKPIT_POINTER, "studio-shorts-review-cockpit")
    tower_publication_pointer, tower_publication, tower_publication_path = validate_pointers(checks, DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER, "tower-publication-control-room")
    tower_publisher_pointer, tower_publisher, tower_publisher_path = validate_pointers(checks, DEFAULT_TOWER_PUBLISHER_DESK_POINTER, "tower-publisher-desk")
    tower_unblock_pointer, tower_unblock, tower_unblock_path = validate_pointers(checks, DEFAULT_TOWER_REVIEW_UNBLOCK_POINTER, "tower-review-unblock-brief")
    tower_gate_pointer, tower_gate, tower_gate_path = validate_pointers(checks, DEFAULT_TOWER_REVIEW_GATE_POINTER, "tower-review-gate-board")
    tower_command_pointer, tower_command, tower_command_path = validate_pointers(checks, DEFAULT_TOWER_REVIEW_COMMAND_POINTER, "tower-review-command-sheet")
    tower_manual_pointer, tower_manual, tower_manual_path = validate_pointers(checks, DEFAULT_TOWER_MANUAL_PACKET_POINTER, "tower-manual-packet-board")
    tower_social_pointer, tower_social, tower_social_path = validate_pointers(checks, DEFAULT_TOWER_SOCIAL_COMMAND_POINTER, "tower-social-command-center")
    tower_first_review_pointer, tower_first_review, tower_first_review_path = validate_pointers(checks, DEFAULT_TOWER_FIRST_REVIEW_POINTER, "tower-first-review-session")
    nest_writing_control_pointer, nest_writing_control, nest_writing_control_path = validate_pointers(checks, DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER, "nest-writing-control-room")
    nest_daily_pointer, nest_daily, nest_daily_path = validate_pointers(checks, DEFAULT_NEST_DAILY_WRITING_POINTER, "nest-daily-writing")
    nest_author_pointer, nest_author, nest_author_path = validate_pointers(checks, DEFAULT_NEST_AUTHOR_DESK_POINTER, "nest-author-desk")
    nest_writing_runway_pointer, nest_writing_runway, nest_writing_runway_path = validate_pointers(checks, DEFAULT_NEST_WRITING_RUNWAY_POINTER, "nest-writing-runway")
    nest_writing_momentum_pointer, nest_writing_momentum, nest_writing_momentum_path = validate_pointers(checks, DEFAULT_NEST_WRITING_MOMENTUM_POINTER, "nest-writing-momentum")
    nest_writing_review_pointer, nest_writing_review, nest_writing_review_path = validate_pointers(checks, DEFAULT_NEST_WRITING_REVIEW_DESK_POINTER, "nest-writing-review-desk")
    nest_writing_sprint_pointer, nest_writing_sprint, nest_writing_sprint_path = validate_pointers(checks, DEFAULT_NEST_WRITING_SPRINT_POINTER, "nest-writing-sprint-companion")
    studio360_pointer, studio360, studio360_path = validate_pointers(checks, DEFAULT_STUDIO360_PROOF_REVIEW_POINTER, "studio360-proof-review")
    studio360_proof_next_pointer, studio360_proof_next, studio360_proof_next_path = validate_pointers(checks, DEFAULT_STUDIO360_PROOF_NEXT_BRIEF_POINTER, "studio360-proof-next-brief")
    studio360_reframe_export_pointer, studio360_reframe_export, studio360_reframe_export_path = validate_pointers(checks, DEFAULT_STUDIO360_REFRAME_EXPORT_DESK_POINTER, "studio360-reframe-export-desk")
    studio360_renderer_preflight_pointer, studio360_renderer_preflight, studio360_renderer_preflight_path = validate_pointers(checks, DEFAULT_STUDIO360_RENDERER_PREFLIGHT_POINTER, "studio360-renderer-preflight")
    studio360_source_desk_pointer, studio360_source_desk, studio360_source_desk_path = validate_pointers(checks, DEFAULT_STUDIO360_SOURCE_DESK_POINTER, "studio360-source-desk")
    studio360_control_pointer, studio360_control, studio360_control_path = validate_pointers(checks, DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER, "studio360-proof-control-room")
    validation_pointer = load_json(DEFAULT_VALIDATION_POINTER)
    validate_handoff_pointer(checks, brief_pointer, "return-brief")
    validate_handoff_pointer(checks, deck_pointer, "action-deck")
    validate_handoff_pointer(checks, human_help_pointer, "human-help")
    validate_handoff_pointer(checks, blocker_ledger_pointer, "blocker-decision-ledger")
    validate_handoff_pointer(checks, production_runway_pointer, "production-runway")
    validate_handoff_pointer(checks, validation_pointer, "validation-report")
    validate_specialist_pointer(checks, latest_surface_audit_pointer, "latest-surface-audit")
    validate_specialist_pointer(checks, photo_client_pointer, "photo-client-proof")
    validate_specialist_pointer(checks, photo_contact_pointer, "photo-contact-sheet")
    validate_specialist_pointer(checks, photo_control_pointer, "photo-control-room")
    validate_specialist_pointer(checks, photo_cull_rehearsal_pointer, "photo-cull-rehearsal")
    validate_specialist_pointer(checks, photo_command_pointer, "photo-command-sheet")
    validate_specialist_pointer(checks, photo_first_keepers_pointer, "photo-first-keepers")
    validate_specialist_pointer(checks, photo_keeper_desk_pointer, "photo-keeper-desk")
    validate_specialist_pointer(checks, studio_sync_control_pointer, "studio-sync-control-room")
    validate_specialist_pointer(checks, studio_sync_rehearsal_pointer, "studio-sync-decision-rehearsal")
    validate_specialist_pointer(checks, studio_watch_listen_pointer, "studio-watch-listen-review-room")
    validate_specialist_pointer(checks, studio_review_decision_pointer, "studio-review-decision-ledger")
    validate_specialist_pointer(checks, studio_review_command_pointer, "studio-review-command-sheet")
    validate_specialist_pointer(checks, studio_review_work_session_pointer, "studio-review-work-session")
    validate_specialist_pointer(checks, studio_shorts_pointer, "studio-shorts-review-cockpit")
    validate_specialist_pointer(checks, tower_publication_pointer, "tower-publication-control-room")
    validate_specialist_pointer(checks, tower_publisher_pointer, "tower-publisher-desk")
    validate_specialist_pointer(checks, tower_unblock_pointer, "tower-review-unblock-brief")
    validate_specialist_pointer(checks, tower_gate_pointer, "tower-review-gate-board")
    validate_specialist_pointer(checks, tower_command_pointer, "tower-review-command-sheet")
    validate_specialist_pointer(checks, tower_manual_pointer, "tower-manual-packet-board")
    validate_specialist_pointer(checks, tower_social_pointer, "tower-social-command-center")
    validate_specialist_pointer(checks, tower_first_review_pointer, "tower-first-review-session")
    validate_specialist_pointer(checks, nest_writing_control_pointer, "nest-writing-control-room")
    validate_specialist_pointer(checks, nest_daily_pointer, "nest-daily-writing")
    validate_specialist_pointer(checks, nest_author_pointer, "nest-author-desk")
    validate_specialist_pointer(checks, nest_writing_runway_pointer, "nest-writing-runway")
    validate_specialist_pointer(checks, nest_writing_momentum_pointer, "nest-writing-momentum")
    validate_specialist_pointer(checks, nest_writing_review_pointer, "nest-writing-review-desk")
    validate_specialist_pointer(checks, nest_writing_sprint_pointer, "nest-writing-sprint-companion")
    validate_specialist_pointer(checks, studio360_pointer, "studio360-proof-review")
    validate_specialist_pointer(checks, studio360_proof_next_pointer, "studio360-proof-next-brief")
    validate_specialist_pointer(checks, studio360_reframe_export_pointer, "studio360-reframe-export-desk")
    validate_specialist_pointer(checks, studio360_renderer_preflight_pointer, "studio360-renderer-preflight")
    validate_specialist_pointer(checks, studio360_source_desk_pointer, "studio360-source-desk")
    validate_specialist_pointer(checks, studio360_control_pointer, "studio360-proof-control-room")
    validate_board(checks, board)
    validate_action_deck(checks, deck)
    validate_front_door_order(checks, production_runway, deck)
    validate_refresh_run(checks, refresh, refresh_pointer)
    validate_human_help_board(checks, human_help)
    validate_blocker_decision_ledger(checks, blocker_ledger)
    validate_current_production_blocker_doc(checks)
    validate_production_readiness_matrix(checks, brief)
    validate_return_review_path(checks, brief_pointer, brief)
    validate_production_conveyor(checks, brief_pointer, brief)
    validate_photo_cull_decision_cards(checks, photo_control_pointer, brief)
    validate_photo_quality_evidence_cards(checks, photo_control_pointer)
    validate_photo_proof_candidate_cards(checks, photo_control_pointer, brief)
    validate_nest_writing_work_cards(checks, nest_writing_control_pointer, brief)
    validate_nest_publishable_draft_prep_cards(checks, nest_writing_control_pointer, brief)
    validate_tower_publishing_action_cards(checks, tower_social_pointer, brief)
    validate_tower_shorts_publishing_action_cards(checks, tower_social_pointer)
    validate_tower_draft_social_calendar(checks, tower_social_pointer, brief)
    validate_studio360_source_routing_cards(checks, studio360_control_pointer, brief)
    validate_studio360_render_dry_run_cards(checks, studio360_control_pointer, brief)
    validate_studio_reviewer_daily_checklist(checks, studio_review_work_session_pointer, brief)
    validate_studio_duration_warning_cards(checks, studio_review_work_session_pointer, brief)
    validate_production_runway_return_path(checks, production_runway)
    validate_episode4_sync_stack_freshness(checks, brief, production_runway, human_help)
    validate_safety_truth(checks, [
        ("board", board),
        ("brief", brief),
        ("deck", deck),
        ("refresh", refresh),
        ("latest-surface-audit", latest_surface_audit),
        ("human-help", human_help),
        ("blocker-decision-ledger", blocker_ledger),
        ("production-runway", production_runway),
        ("photo-client-proof", photo_client),
        ("photo-contact-sheet", photo_contact),
        ("photo-control-room", photo_control),
        ("photo-cull-rehearsal", photo_cull_rehearsal),
        ("photo-command-sheet", photo_command),
        ("photo-first-keepers", photo_first_keepers),
        ("photo-keeper-desk", photo_keeper_desk),
        ("studio-sync-control-room", studio_sync_control),
        ("studio-sync-decision-rehearsal", studio_sync_rehearsal),
        ("studio-watch-listen-review-room", studio_watch_listen),
        ("studio-review-decision-ledger", studio_review_decision),
        ("studio-review-command-sheet", studio_review_command),
        ("studio-review-work-session", studio_review_work_session),
        ("studio-shorts-review-cockpit", studio_shorts),
        ("tower-publication-control-room", tower_publication),
        ("tower-publisher-desk", tower_publisher),
        ("tower-review-unblock-brief", tower_unblock),
        ("tower-review-gate-board", tower_gate),
        ("tower-review-command-sheet", tower_command),
        ("tower-manual-packet-board", tower_manual),
        ("tower-social-command-center", tower_social),
        ("nest-writing-control-room", nest_writing_control),
        ("nest-daily-writing", nest_daily),
        ("nest-author-desk", nest_author),
        ("nest-writing-runway", nest_writing_runway),
        ("nest-writing-momentum", nest_writing_momentum),
        ("nest-writing-review-desk", nest_writing_review),
        ("nest-writing-sprint-companion", nest_writing_sprint),
        ("studio360-proof-review", studio360),
        ("studio360-proof-next-brief", studio360_proof_next),
        ("studio360-reframe-export-desk", studio360_reframe_export),
        ("studio360-renderer-preflight", studio360_renderer_preflight),
        ("studio360-source-desk", studio360_source_desk),
        ("studio360-proof-control-room", studio360_control),
    ])
    declared_paths = collect_declared_paths(board, brief, deck)
    declared_paths.extend(collect_declared_paths(refresh, {}, {}))
    declared_paths.extend(collect_declared_paths(latest_surface_audit, {}, {}))
    declared_paths.extend(collect_declared_paths(human_help, {}, {}))
    declared_paths.extend(collect_declared_paths(blocker_ledger, {}, {}))
    declared_paths.extend(collect_declared_paths(production_runway, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_client, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_contact, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_control, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_cull_rehearsal, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_command, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_first_keepers, {}, {}))
    declared_paths.extend(collect_declared_paths(photo_keeper_desk, {}, {}))
    declared_paths.extend(collect_declared_paths(studio_sync_control, {}, {}))
    declared_paths.extend(collect_declared_paths(studio_sync_rehearsal, {}, {}))
    declared_paths.extend(collect_declared_paths(studio_review_work_session, {}, {}))
    declared_paths.extend(collect_declared_paths(studio_shorts, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_publication, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_publisher, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_unblock, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_gate, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_command, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_manual, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_social, {}, {}))
    declared_paths.extend(collect_declared_paths(tower_first_review, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_writing_control, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_daily, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_author, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_writing_runway, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_writing_momentum, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_writing_review, {}, {}))
    declared_paths.extend(collect_declared_paths(nest_writing_sprint, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360_proof_next, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360_reframe_export, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360_renderer_preflight, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360_source_desk, {}, {}))
    declared_paths.extend(collect_declared_paths(studio360_control, {}, {}))
    validate_paths(checks, declared_paths)
    failures = [check for check in checks if check["status"] == "fail"]
    warnings = [check for check in checks if check["status"] == "warn"]
    status = "failed" if failures else "passed-with-warnings" if warnings else "passed"
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": status,
        "osRoot": str(os_root),
        "sourcePointers": {
            "board": str(os_root / "latest-quipsly-os-board.json"),
            "returnBrief": str(os_root / "latest-quipsly-return-brief.json"),
            "actionDeck": str(os_root / "latest-quipsly-action-deck.json"),
            "refreshRun": str(os_root / "latest-quipsly-os-refresh.json"),
            "latestSurfaceAudit": str(DEFAULT_LATEST_SURFACE_AUDIT_POINTER),
            "humanHelp": str(os_root / "latest-quipsly-human-help-board.json"),
            "blockerDecisionLedger": str(DEFAULT_BLOCKER_LEDGER_POINTER),
            "currentProductionBlockers": str(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER),
            "productionRunway": str(production_runway_pointer_path if production_runway_pointer_path.exists() else DEFAULT_PRODUCTION_RUNWAY_POINTER),
            "photoClientProof": str(DEFAULT_PHOTO_CLIENT_PROOF_POINTER),
            "photoContactSheet": str(DEFAULT_PHOTO_CONTACT_SHEET_POINTER),
            "photoControlRoom": str(DEFAULT_PHOTO_CONTROL_ROOM_POINTER),
            "photoCullRehearsal": str(DEFAULT_PHOTO_CULL_REHEARSAL_POINTER),
            "photoCommandSheet": str(DEFAULT_PHOTO_COMMAND_SHEET_POINTER),
            "photoFirstKeepers": str(DEFAULT_PHOTO_FIRST_KEEPERS_POINTER),
            "photoKeeperDesk": str(DEFAULT_PHOTO_KEEPER_DESK_POINTER),
            "studioSyncControlRoom": str(DEFAULT_STUDIO_SYNC_CONTROL_ROOM_POINTER),
            "studioSyncDecisionRehearsal": str(DEFAULT_STUDIO_SYNC_DECISION_REHEARSAL_POINTER),
            "studioReviewWorkSession": str(DEFAULT_STUDIO_REVIEW_WORK_SESSION_POINTER),
            "studioShortsReviewCockpit": str(DEFAULT_STUDIO_SHORTS_REVIEW_COCKPIT_POINTER),
            "towerPublicationControlRoom": str(DEFAULT_TOWER_PUBLICATION_CONTROL_ROOM_POINTER),
            "towerPublisherDesk": str(DEFAULT_TOWER_PUBLISHER_DESK_POINTER),
            "towerReviewUnblockBrief": str(DEFAULT_TOWER_REVIEW_UNBLOCK_POINTER),
            "towerReviewGateBoard": str(DEFAULT_TOWER_REVIEW_GATE_POINTER),
            "towerReviewCommandSheet": str(DEFAULT_TOWER_REVIEW_COMMAND_POINTER),
            "towerManualPacketBoard": str(DEFAULT_TOWER_MANUAL_PACKET_POINTER),
            "towerSocialCommandCenter": str(DEFAULT_TOWER_SOCIAL_COMMAND_POINTER),
            "nestWritingControlRoom": str(DEFAULT_NEST_WRITING_CONTROL_ROOM_POINTER),
            "nestDailyWriting": str(DEFAULT_NEST_DAILY_WRITING_POINTER),
            "nestAuthorDesk": str(DEFAULT_NEST_AUTHOR_DESK_POINTER),
            "nestWritingRunway": str(DEFAULT_NEST_WRITING_RUNWAY_POINTER),
            "nestWritingMomentum": str(DEFAULT_NEST_WRITING_MOMENTUM_POINTER),
            "nestWritingReviewDesk": str(DEFAULT_NEST_WRITING_REVIEW_DESK_POINTER),
            "nestWritingSprintCompanion": str(DEFAULT_NEST_WRITING_SPRINT_POINTER),
            "studio360ProofReview": str(DEFAULT_STUDIO360_PROOF_REVIEW_POINTER),
            "studio360ProofNextBrief": str(DEFAULT_STUDIO360_PROOF_NEXT_BRIEF_POINTER),
            "studio360ReframeExportDesk": str(DEFAULT_STUDIO360_REFRAME_EXPORT_DESK_POINTER),
            "studio360RendererPreflight": str(DEFAULT_STUDIO360_RENDERER_PREFLIGHT_POINTER),
            "studio360SourceDesk": str(DEFAULT_STUDIO360_SOURCE_DESK_POINTER),
            "studio360ProofControlRoom": str(DEFAULT_STUDIO360_PROOF_CONTROL_ROOM_POINTER),
        },
        "sourceArtifacts": {
            "boardJson": str(board_path),
            "boardHtml": board_pointer.get("htmlPath") or "",
            "returnBriefJson": str(brief_path),
            "returnBriefHtml": brief_pointer.get("htmlPath") or "",
            "returnBriefProductionConveyor": brief_pointer.get("productionConveyorPath") or brief.get("productionConveyorPath") or "",
            "actionDeckJson": str(deck_path),
            "actionDeckHtml": deck_pointer.get("htmlPath") or "",
            "refreshRunJson": str(refresh_path),
            "refreshRunHtml": refresh_pointer.get("htmlPath") or "",
            "latestSurfaceAuditJson": str(latest_surface_audit_path),
            "latestSurfaceAuditHtml": latest_surface_audit_pointer.get("htmlPath") or "",
            "humanHelpJson": str(human_help_path),
            "humanHelpHtml": human_help_pointer.get("htmlPath") or "",
            "blockerDecisionLedgerJson": str(blocker_ledger_path),
            "blockerDecisionLedgerHtml": blocker_ledger_pointer.get("htmlPath") or "",
            "currentProductionBlockersJson": str(DEFAULT_CURRENT_PRODUCTION_BLOCKERS_OS_POINTER),
            "currentProductionBlockersMarkdown": str(DEFAULT_DESKTOP_BLOCKERS_MARKDOWN),
            "productionRunwayJson": str(production_runway_path),
            "productionRunwayHtml": production_runway_pointer.get("htmlPath") or "",
            "photoClientProofJson": str(photo_client_path),
            "photoClientProofHtml": photo_client_pointer.get("htmlPath") or "",
            "photoContactSheetJson": str(photo_contact_path),
            "photoContactSheetHtml": photo_contact_pointer.get("htmlPath") or "",
            "photoControlRoomJson": str(photo_control_path),
            "photoControlRoomHtml": photo_control_pointer.get("htmlPath") or "",
            "photoCullRehearsalJson": str(photo_cull_rehearsal_path),
            "photoCullRehearsalHtml": photo_cull_rehearsal_pointer.get("htmlPath") or "",
            "photoCommandSheetJson": str(photo_command_path),
            "photoCommandSheetHtml": photo_command_pointer.get("htmlPath") or "",
            "photoFirstKeepersJson": str(photo_first_keepers_path),
            "photoFirstKeepersHtml": photo_first_keepers_pointer.get("htmlPath") or "",
            "photoKeeperDeskJson": str(photo_keeper_desk_path),
            "photoKeeperDeskHtml": photo_keeper_desk_pointer.get("htmlPath") or "",
            "studioSyncControlRoomJson": str(studio_sync_control_path),
            "studioSyncControlRoomHtml": studio_sync_control_pointer.get("htmlPath") or "",
            "studioSyncDecisionRehearsalJson": str(studio_sync_rehearsal_path),
            "studioSyncDecisionRehearsalHtml": studio_sync_rehearsal_pointer.get("htmlPath") or "",
            "studioReviewWorkSessionJson": str(studio_review_work_session_path),
            "studioReviewWorkSessionHtml": studio_review_work_session_pointer.get("htmlPath") or "",
            "studioShortsReviewCockpitJson": str(studio_shorts_path),
            "studioShortsReviewCockpitHtml": studio_shorts_pointer.get("htmlPath") or "",
            "towerPublicationControlRoomJson": str(tower_publication_path),
            "towerPublicationControlRoomHtml": tower_publication_pointer.get("htmlPath") or "",
            "towerPublisherDeskJson": str(tower_publisher_path),
            "towerPublisherDeskHtml": tower_publisher_pointer.get("htmlPath") or "",
            "towerReviewUnblockBriefJson": str(tower_unblock_path),
            "towerReviewUnblockBriefHtml": tower_unblock_pointer.get("htmlPath") or "",
            "towerReviewGateBoardJson": str(tower_gate_path),
            "towerReviewGateBoardHtml": tower_gate_pointer.get("htmlPath") or "",
            "towerReviewCommandSheetJson": str(tower_command_path),
            "towerReviewCommandSheetHtml": tower_command_pointer.get("htmlPath") or "",
            "towerManualPacketBoardJson": str(tower_manual_path),
            "towerManualPacketBoardHtml": tower_manual_pointer.get("htmlPath") or "",
            "towerSocialCommandCenterJson": str(tower_social_path),
            "towerSocialCommandCenterHtml": tower_social_pointer.get("htmlPath") or "",
            "towerFirstReviewSessionJson": str(tower_first_review_path),
            "towerFirstReviewSessionHtml": tower_first_review_pointer.get("htmlPath") or "",
            "nestWritingControlRoomJson": str(nest_writing_control_path),
            "nestWritingControlRoomHtml": nest_writing_control_pointer.get("htmlPath") or "",
            "nestDailyWritingJson": str(nest_daily_path),
            "nestDailyWritingHtml": nest_daily_pointer.get("htmlPath") or "",
            "nestAuthorDeskJson": str(nest_author_path),
            "nestAuthorDeskHtml": nest_author_pointer.get("htmlPath") or "",
            "nestWritingRunwayJson": str(nest_writing_runway_path),
            "nestWritingRunwayHtml": nest_writing_runway_pointer.get("htmlPath") or "",
            "nestWritingMomentumJson": str(nest_writing_momentum_path),
            "nestWritingMomentumHtml": nest_writing_momentum_pointer.get("htmlPath") or "",
            "nestWritingReviewDeskJson": str(nest_writing_review_path),
            "nestWritingReviewDeskHtml": nest_writing_review_pointer.get("htmlPath") or "",
            "nestWritingSprintCompanionJson": str(nest_writing_sprint_path),
            "nestWritingSprintCompanionHtml": nest_writing_sprint_pointer.get("htmlPath") or "",
            "studio360ProofReviewJson": str(studio360_path),
            "studio360ProofReviewHtml": studio360_pointer.get("htmlPath") or "",
            "studio360ProofNextBriefJson": str(studio360_proof_next_path),
            "studio360ProofNextBriefHtml": studio360_proof_next_pointer.get("htmlPath") or "",
            "studio360ReframeExportDeskJson": str(studio360_reframe_export_path),
            "studio360ReframeExportDeskHtml": studio360_reframe_export_pointer.get("htmlPath") or "",
            "studio360RendererPreflightJson": str(studio360_renderer_preflight_path),
            "studio360RendererPreflightHtml": studio360_renderer_preflight_pointer.get("htmlPath") or "",
            "studio360SourceDeskJson": str(studio360_source_desk_path),
            "studio360SourceDeskHtml": studio360_source_desk_pointer.get("htmlPath") or "",
            "studio360ProofControlRoomJson": str(studio360_control_path),
            "studio360ProofControlRoomHtml": studio360_control_pointer.get("htmlPath") or "",
        },
        "counts": {
            "checks": len(checks),
            "passed": sum(1 for check in checks if check["status"] == "pass"),
            "warnings": len(warnings),
            "failures": len(failures),
            "declaredPaths": len(declared_paths),
            "lanes": len(board.get("lanes") or []) if isinstance(board.get("lanes"), list) else 0,
            "priorityQueue": len(board.get("priorityQueue") or []) if isinstance(board.get("priorityQueue"), list) else 0,
            "productionMatrixRows": len(brief.get("productionReadinessMatrix") or []) if isinstance(brief.get("productionReadinessMatrix"), list) else 0,
            "productionConveyorRows": len((brief.get("productionConveyor") or {}).get("rows") or []) if isinstance(brief.get("productionConveyor"), dict) else 0,
        },
        "checks": checks,
        "truth": "Validation report only. It reads local artifacts and does not publish, upload, schedule, approve, mutate sources, or capture receipts.",
        "nextSafestAction": "If failures exist, fix those before using the board. If only warnings exist, review them as operator context before acting.",
    }


def prepare_output_dir(os_root: Path) -> Path:
    out_dir = os_root / "ValidationReports" / stamp()
    base = out_dir
    counter = 2
    while out_dir.exists():
        out_dir = Path(f"{base}-{counter}")
        counter += 1
    out_dir.mkdir(parents=True, exist_ok=False)
    return out_dir


def write_csv(path: Path, payload: dict[str, Any]) -> None:
    fields = ["id", "lane", "status", "severity", "message", "evidence"]
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for check in payload.get("checks") or []:
            writer.writerow({
                "id": check.get("id", ""),
                "lane": check.get("lane", ""),
                "status": check.get("status", ""),
                "severity": check.get("severity", ""),
                "message": check.get("message", ""),
                "evidence": json.dumps(check.get("evidence"), sort_keys=True)[:4000],
            })


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Quipsly OS validation report",
        "",
        f"Generated: `{payload['generatedAt']}`",
        f"Status: `{payload['status']}`",
        "",
        payload["truth"],
        "",
        "## Counts",
        "",
    ]
    for key, value in payload.get("counts", {}).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Checks", ""])
    for check in payload.get("checks") or []:
        lines.append(f"- `{check.get('status')}` **{check.get('lane')}** `{check.get('id')}` - {check.get('message')}")
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    check_rows = []
    for check in payload.get("checks") or []:
        evidence = json.dumps(check.get("evidence"), indent=2, sort_keys=True)[:5000]
        check_rows.append(f"""
        <article class="check {esc(check.get('status'))}">
          <div class="check-head"><span>{esc(check.get('status'))}</span><b>{esc(check.get('lane'))}</b></div>
          <h2>{esc(check.get('message'))}</h2>
          <p><code>{esc(check.get('id'))}</code></p>
          <details><summary>Evidence</summary><pre>{esc(evidence)}</pre></details>
        </article>
        """)
    counts = payload.get("counts") or {}
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly OS Validation Report</title>
  <style>
    :root {{ color-scheme:dark; --bg:#111711; --panel:#1b2619; --ink:#fff2d6; --muted:#d6c5a2; --gold:#eac75f; --moss:#9ac474; --water:#82d3dd; --clay:#cf7958; --line:rgba(255,242,214,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 18% 0%, rgba(130,211,221,.18), transparent 34%), linear-gradient(180deg,#172218,#0b100a); color:var(--ink); }}
    header {{ padding:44px clamp(22px,5vw,82px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.22em; text-transform:uppercase; font-size:12px; font-weight:950; }}
    h1 {{ max-width:1100px; font-size:clamp(42px,7vw,82px); line-height:.92; margin:10px 0; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .summary {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
    .summary span {{ border:1px solid var(--line); border-radius:999px; padding:8px 11px; background:rgba(255,255,255,.055); color:var(--muted); font-weight:850; }}
    main {{ padding:28px clamp(16px,4vw,58px) 72px; display:grid; grid-template-columns:repeat(auto-fit,minmax(310px,1fr)); gap:14px; }}
    .check {{ border:1px solid var(--line); border-radius:22px; padding:16px; background:rgba(27,38,25,.9); }}
    .check.pass {{ border-color:rgba(154,196,116,.38); }}
    .check.warn {{ border-color:rgba(234,199,95,.5); }}
    .check.fail {{ border-color:rgba(207,121,88,.7); }}
    .check-head {{ display:flex; justify-content:space-between; gap:12px; }}
    .check-head span {{ border-radius:999px; padding:5px 8px; background:rgba(0,0,0,.24); color:var(--gold); text-transform:uppercase; font-size:11px; font-weight:900; }}
    h2 {{ font-size:18px; margin:12px 0 6px; }}
    code {{ color:var(--water); overflow-wrap:anywhere; }}
    summary {{ cursor:pointer; color:var(--moss); font-weight:900; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--muted); font-size:12px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly OS validation</div>
    <h1>Trust the board because the board can be checked.</h1>
    <p>{esc(payload['truth'])}</p>
    <p>Status: <strong>{esc(payload['status'])}</strong>. {esc(payload['nextSafestAction'])}</p>
    <div class="summary"><span>{counts.get('checks', 0)} checks</span><span>{counts.get('passed', 0)} passed</span><span>{counts.get('warnings', 0)} warnings</span><span>{counts.get('failures', 0)} failures</span><span>{counts.get('declaredPaths', 0)} paths</span></div>
  </header>
  <main>{''.join(check_rows)}</main>
</body>
</html>
"""
    path.write_text(html_text, encoding="utf-8")


def update_pointer(os_root: Path, out_dir: Path, payload: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path, csv_path: Path) -> None:
    pointer = {
        "schema": "quipsly.os.latest-validation-report.v1",
        "updatedAt": iso_now(),
        "status": payload.get("status") or "unknown",
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "sessionDir": str(out_dir),
        "counts": payload.get("counts") or {},
        "humanAsk": "Open this validation report before trusting the OS board after a large refresh or code change.",
        "agentSafeParallelWork": "Codex may fix failed local checks, missing handoff fields, broken paths, and unsafe truth claims. Do not mutate originals, approve, publish, upload, schedule, delete, overwrite versions, or create receipt truth.",
        "firstSafeAction": payload.get("firstSafeAction") or {},
        "nextSafestAction": payload.get("nextSafestAction") or "",
        "truth": payload.get("truth") or "",
    }
    write_json(os_root / "latest-quipsly-os-validation.json", pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Quipsly OS validation report.")
    parser.add_argument("--os-root", default=str(DEFAULT_OS_ROOT))
    args = parser.parse_args()
    os_root = Path(args.os_root)
    payload = build_payload(os_root)
    out_dir = prepare_output_dir(os_root)
    json_path = out_dir / "quipsly-os-validation.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-quipsly-os-validation.md"
    csv_path = out_dir / "quipsly-os-validation.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
    })
    payload["firstSafeAction"] = {
        "label": "Open Quipsly OS Validation Report",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local validation evidence only. It does not publish, upload, schedule, approve, mutate sources, or capture receipts.",
    }
    write_json(json_path, payload)
    write_markdown(markdown_path, payload)
    write_csv(csv_path, payload)
    write_html(html_path, payload)
    update_pointer(os_root, out_dir, payload, html_path, json_path, markdown_path, csv_path)
    print(json.dumps({
        "status": payload.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload.get("counts"),
    }, indent=2, sort_keys=True))
    return 1 if payload.get("status") == "failed" else 0


if __name__ == "__main__":
    raise SystemExit(main())
