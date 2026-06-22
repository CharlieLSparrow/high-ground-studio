#!/usr/bin/env python3
import argparse
import json
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

DEFAULT_AGENT_URL = "http://127.0.0.1:8080"

STATUS_MAP = {
    "keep": "keep",
    "approve": "keep",
    "approved": "keep",
    "publish": "keep",
    "queue": "keep",
    "refine": "refine",
    "revise": "refine",
    "needs-refinement": "refine",
    "needs-work": "refine",
    "needs-edit": "refine",
    "reject": "reject",
    "rejected": "reject",
    "skip": "reject",
    "needs-review": "needs-review",
    "needs_review": "needs-review",
    "": "needs-review",
}


def get_json(base_url: str, path: str, timeout: float = 30) -> dict:
    with urllib.request.urlopen(f"{base_url.rstrip('/')}{path}", timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def command(base_url: str, path: str, timeout: float = 30) -> dict:
    return get_json(base_url, path, timeout=timeout)


def wait_for(base_url: str, predicate, timeout: float = 20, interval: float = 0.25) -> dict:
    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        last = get_json(base_url, "/state")
        if predicate(last):
            return last
        time.sleep(interval)
    return last


def parse_candidate_id(candidate_id: str) -> tuple[str, str]:
    if "::" not in candidate_id:
        return "", ""
    session, title = candidate_id.split("::", 1)
    return session.strip(), title.strip()


def normalize_status(status: str) -> str:
    return STATUS_MAP.get((status or "").strip().lower(), (status or "needs-review").strip().lower())


def append_decision_note(existing: str, decision_note: str, status: str, exported_at: str) -> str:
    lines = []
    if existing.strip():
        lines.append(existing.strip())
    stamped = f"Review packet decision imported {exported_at or 'unknown time'}: {status}"
    if decision_note.strip():
        stamped += f" — {decision_note.strip()}"
    lines.append(stamped)
    return "\n".join(lines)


def build_plan(payload: dict) -> list[dict]:
    decisions = payload.get("decisions") or []
    exported_at = payload.get("exportedAt") or payload.get("generatedAt") or ""
    plan = []
    for decision in decisions:
        candidate_id = decision.get("candidateId") or ""
        session, title = parse_candidate_id(candidate_id)
        if not session:
            # Fallback for future decision files that may split the fields.
            session = (decision.get("session") or decision.get("sessionName") or "").strip()
        if not title:
            title = (decision.get("title") or "").strip()
        if not session or not title:
            plan.append({
                "status": "skipped",
                "reason": "missing session or title",
                "candidateId": candidate_id,
                "title": title,
                "session": session,
            })
            continue
        review_status = normalize_status(decision.get("status") or "")
        notes = decision.get("notes") or ""
        plan.append({
            "status": "planned",
            "session": session,
            "title": title,
            "reviewStatus": review_status,
            "notes": notes,
            "exportedAt": exported_at,
            "candidateId": candidate_id,
        })
    return plan


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Quipsly review-shorts decision JSON into native short queues through the local agent API.")
    parser.add_argument("path", help="Path to review-shorts-decisions.json")
    parser.add_argument("--agent-url", default=DEFAULT_AGENT_URL)
    parser.add_argument("--execute", action="store_true", help="Apply decisions. Default is dry-run.")
    parser.add_argument("--save", action="store_true", help="Save each session after applying decisions. Only used with --execute.")
    parser.add_argument("--wait-seconds", type=float, default=20)
    args = parser.parse_args()

    decision_path = Path(args.path).expanduser()
    payload = json.loads(decision_path.read_text())
    plan = build_plan(payload)
    planned = [item for item in plan if item.get("status") == "planned"]
    skipped = [item for item in plan if item.get("status") != "planned"]

    result = {
        "model": "quipsly-review-shorts-decision-import",
        "version": "2026-06-18.review-shorts-decision-import.v1",
        "sourcePath": str(decision_path),
        "dryRun": not args.execute,
        "sourceModel": payload.get("model", ""),
        "plannedCount": len(planned),
        "skippedCount": len(skipped),
        "appliedCount": 0,
        "failedCount": 0,
        "planned": plan,
        "applied": [],
        "failed": [],
        "truth": "Imports review status and notes onto existing short recipes. It does not alter source media, timeline decisions, exports, or platform receipts.",
    }

    if not args.execute:
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0 if planned else 1

    by_session: dict[str, list[dict]] = defaultdict(list)
    for item in planned:
        by_session[item["session"]].append(item)

    for session, items in by_session.items():
        state = get_json(args.agent_url, "/state")
        if state.get("activeSessionName") != session:
            command(args.agent_url, "/load_session?name=" + urllib.parse.quote(session))
            state = wait_for(args.agent_url, lambda s: s.get("activeSessionName") == session and s.get("laneCount", 0) > 0, timeout=args.wait_seconds)
        if state.get("activeSessionName") != session:
            for item in items:
                failure = {**item, "status": "failed", "reason": f"session did not load; active={state.get('activeSessionName')}"}
                result["failed"].append(failure)
                result["failedCount"] += 1
            continue

        for item in items:
            try:
                command(args.agent_url, "/shorts_queue_select?title=" + urllib.parse.quote(item["title"]))
                selected_state = wait_for(
                    args.agent_url,
                    lambda s, title=item["title"]: (s.get("selectedShortClip") or {}).get("title") == title,
                    timeout=args.wait_seconds,
                )
                selected = selected_state.get("selectedShortClip") or {}
                if selected.get("title") != item["title"]:
                    raise RuntimeError("short candidate not found or not selected")
                existing_notes = selected.get("notes") or ""
                merged_notes = append_decision_note(existing_notes, item.get("notes") or "", item["reviewStatus"], item.get("exportedAt") or "")
                command(args.agent_url, "/shorts_queue_update_selected?field=review_status&value=" + urllib.parse.quote(item["reviewStatus"]))
                command(args.agent_url, "/shorts_queue_update_selected?field=notes&value=" + urllib.parse.quote(merged_notes))
                applied_state = wait_for(
                    args.agent_url,
                    lambda s, title=item["title"], status=item["reviewStatus"]: (s.get("selectedShortClip") or {}).get("title") == title and (s.get("selectedShortClip") or {}).get("reviewStatus") == status,
                    timeout=args.wait_seconds,
                )
                applied_clip = applied_state.get("selectedShortClip") or {}
                result["applied"].append({
                    **item,
                    "status": "applied",
                    "shortClipId": applied_clip.get("id", ""),
                })
                result["appliedCount"] += 1
            except Exception as error:
                result["failed"].append({**item, "status": "failed", "reason": f"{type(error).__name__}: {error}"})
                result["failedCount"] += 1
        if args.save:
            command(args.agent_url, "/save_session?name=" + urllib.parse.quote(session))

    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["failedCount"] == 0 and result["appliedCount"] > 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
