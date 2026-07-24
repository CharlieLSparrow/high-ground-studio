#!/usr/bin/env python3
"""Build a Tower review-gate board for local publishing readiness.

This is a Hootsuite-like gate view without platform actions. It groups local
review blockers by episode and shows which platform packets are waiting for
human/agent review before any approval, upload, schedule, or receipt capture.
"""

from __future__ import annotations

import csv
import html
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.tower-review-gate-board.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def esc(value: object) -> str:
    return html.escape(str(value or ""))


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def load_json(path: Path, *, _depth: int = 0) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath")
        if _depth == 0 and isinstance(target, str) and target:
            target_path = Path(target)
            if target_path.exists() and target_path != path:
                resolved = load_json(target_path, _depth=1)
                if resolved:
                    return {**payload, **resolved}
        return payload
    except Exception:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def safe_int(value: object) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def episode_key(value: object) -> int:
    return safe_int(value)


def collect_payloads(release_root: Path) -> dict[str, dict[str, Any]]:
    return {
        "publisher": load_json(release_root / "tower-publisher-desk" / "latest-tower-publisher-desk.json"),
        "unblock": load_json(release_root / "tower-review-unblock-brief" / "latest-tower-review-unblock-brief.json"),
        "manual": load_json(release_root / "tower-manual-packet-board" / "latest-tower-manual-packet-board.json"),
        "control": load_json(release_root / "tower-publication-control-room" / "latest-tower-publication-control-room.json"),
        "reviewCommand": load_json(release_root / "review-board" / "tower-review-command-sheets" / "latest-tower-review-command-sheet.json"),
    }


def build_episode_rows(payloads: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    publisher = payloads["publisher"]
    unblock = payloads["unblock"]
    manual = payloads["manual"]
    approval_rows = publisher.get("approvalRunway") if isinstance(publisher.get("approvalRunway"), list) else []
    unblock_items = unblock.get("unblockItems") if isinstance(unblock.get("unblockItems"), list) else []
    review_rows = unblock.get("reviewRows") if isinstance(unblock.get("reviewRows"), list) else []
    manual_episode_review = manual.get("episodeReview") if isinstance(manual.get("episodeReview"), list) else []

    platforms_by_episode: dict[int, set[str]] = defaultdict(set)
    gates_by_episode: dict[int, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    platform_rows_by_episode: dict[int, int] = defaultdict(int)
    ready_by_episode: dict[int, int] = defaultdict(int)
    pending_by_episode: dict[int, int] = defaultdict(int)
    warning_by_episode: dict[int, int] = defaultdict(int)
    review_targets_by_episode: dict[int, set[str]] = defaultdict(set)

    for row in approval_rows:
        if not isinstance(row, dict):
            continue
        episode = episode_key(row.get("episode"))
        if not episode:
            continue
        platforms_by_episode[episode].add(str(row.get("platform") or "Unknown"))
        gate = str(row.get("gate") or row.get("stage") or "unknown")
        gates_by_episode[episode][gate] += 1
        platform_rows_by_episode[episode] += 1
        if gate in {"ready-for-approval", "ready"} or str(row.get("stage") or "") == "ready-for-approval":
            ready_by_episode[episode] += 1
        pending_by_episode[episode] += safe_int(row.get("pendingReviewRows"))
        warning_by_episode[episode] += safe_int(row.get("warningRows"))
        target = str(row.get("reviewTargetVersion") or row.get("version") or "")
        if target:
            review_targets_by_episode[episode].add(target)

    unblock_by_episode: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in unblock_items:
        if not isinstance(item, dict):
            continue
        episode = episode_key(item.get("episode"))
        if episode:
            unblock_by_episode[episode].append(item)

    review_by_episode: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in review_rows:
        if not isinstance(row, dict):
            continue
        episode = episode_key(row.get("episode"))
        if episode:
            review_by_episode[episode].append(row)

    manual_by_episode: dict[int, dict[str, Any]] = {}
    for row in manual_episode_review:
        if not isinstance(row, dict):
            continue
        episode = episode_key(row.get("episode"))
        if episode:
            manual_by_episode[episode] = row

    episode_numbers = sorted(
        set(platform_rows_by_episode)
        | set(unblock_by_episode)
        | set(review_by_episode)
        | set(manual_by_episode)
        | set(range(1, 7))
    )
    rows: list[dict[str, Any]] = []
    for episode in episode_numbers:
        blockers = unblock_by_episode.get(episode, [])
        reviews = review_by_episode.get(episode, [])
        first_blocker = blockers[0] if blockers else {}
        first_review = reviews[0] if reviews else {}
        gate_counts = dict(sorted(gates_by_episode.get(episode, {}).items()))
        waiting_platforms = sorted(platforms_by_episode.get(episode, set()))
        publish_status = "ready-for-approval" if ready_by_episode[episode] and not blockers and not reviews else "review-gated"
        first_command = str(
            first_blocker.get("command")
            or first_review.get("openReviewCommand")
            or first_review.get("openArtifactCommand")
            or ""
        )
        first_path = str(first_blocker.get("path") or first_review.get("reviewPacketPath") or first_review.get("primaryPath") or "")
        rows.append({
            "episode": episode,
            "status": publish_status,
            "platformRowsWaiting": platform_rows_by_episode[episode],
            "platformsWaiting": waiting_platforms,
            "gateCounts": gate_counts,
            "readyForApprovalRows": ready_by_episode[episode],
            "pendingReviewRows": pending_by_episode[episode],
            "warningRows": warning_by_episode[episode],
            "reviewRows": len(reviews),
            "unblockItems": len(blockers),
            "reviewTargetVersions": sorted(review_targets_by_episode.get(episode, set())),
            "firstUnblockLabel": str(first_blocker.get("label") or first_review.get("label") or "Open local review evidence"),
            "firstUnblockKind": str(first_blocker.get("kind") or first_review.get("recommendedFirstAction") or "local-review"),
            "firstUnblockWhy": str(first_blocker.get("why") or first_blocker.get("reviewerQuestion") or first_review.get("reviewPrompt") or "Review local evidence before platform approval."),
            "firstUnblockCommand": first_command,
            "firstUnblockPath": first_path,
            "manualEpisodeReview": manual_by_episode.get(episode, {}),
            "truth": "Episode review gate only. This is not approval, upload, schedule, publication, or receipt truth.",
        })
    return rows


def build_packet(release_root: Path) -> dict[str, Any]:
    payloads = collect_payloads(release_root)
    rows = build_episode_rows(payloads)
    counts = {
        "episodes": len(rows),
        "reviewGatedEpisodes": sum(1 for row in rows if row["status"] == "review-gated"),
        "readyForApprovalEpisodes": sum(1 for row in rows if row["status"] == "ready-for-approval"),
        "platformRowsWaiting": sum(row["platformRowsWaiting"] for row in rows),
        "readyForApprovalRows": sum(row["readyForApprovalRows"] for row in rows),
        "unblockItems": sum(row["unblockItems"] for row in rows),
        "reviewRows": sum(row["reviewRows"] for row in rows),
        "pendingReviewRows": sum(row["pendingReviewRows"] for row in rows),
        "warningRows": sum(row["warningRows"] for row in rows),
        "receiptSlots": safe_int((payloads["publisher"].get("counts") or {}).get("receiptSlots")),
        "capturedReceipts": safe_int((payloads["publisher"].get("counts") or {}).get("capturedReceipts")),
        "externalPublishing": False,
        "externalSchedulesCreated": False,
        "receiptTruthCreated": False,
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "accountMutation": False,
    }
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "tower-review-gate-board-review-gated" if counts["reviewGatedEpisodes"] else "tower-review-gate-board-ready-for-approval",
        "releaseRoot": str(release_root),
        "counts": counts,
        "episodeRows": rows,
        "humanAsk": "Use this board to choose one episode review gate to clear before touching platform posting packets.",
        "agentSafeParallelWork": "Codex may summarize local review evidence, improve packets, prepare metadata, and draft dry-run receipt commands. Do not approve, publish, upload, schedule, mutate accounts, overwrite versions, mutate sources, or create receipt truth.",
        "nextSafestAction": "Open the first episode gate, review local watch/listen evidence, then decide approve/refine/hold/pending in the local review ledger before any platform action.",
        "truth": "Tower review gate board only. It groups local blockers and waiting platform packets but does not approve, publish, upload, schedule, mutate accounts, overwrite versions, mutate source files, or capture receipts.",
        "sourcePointers": {
            "publisherDesk": payloads["publisher"].get("htmlPath") or "",
            "reviewUnblockBrief": payloads["unblock"].get("htmlPath") or "",
            "manualPacketBoard": payloads["manual"].get("htmlPath") or "",
            "publicationControlRoom": payloads["control"].get("htmlPath") or "",
            "reviewCommandSheet": payloads["reviewCommand"].get("htmlPath") or "",
        },
    }


def render_markdown(packet: dict[str, Any]) -> str:
    lines = [
        "# Tower review gate board",
        "",
        f"Generated: `{packet['generatedAt']}`",
        "",
        packet["truth"],
        "",
        "## Counts",
        "",
    ]
    for key, value in packet["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Episode gates", ""])
    for row in packet["episodeRows"]:
        lines.extend([
            f"### Episode {row['episode']} - {row['status']}",
            "",
            f"- Platform rows waiting: `{row['platformRowsWaiting']}`",
            f"- Platforms: {', '.join(row['platformsWaiting']) or 'none'}",
            f"- Review rows: `{row['reviewRows']}`",
            f"- Unblock items: `{row['unblockItems']}`",
            f"- Pending review rows: `{row['pendingReviewRows']}`",
            f"- Warning rows: `{row['warningRows']}`",
            f"- First action: {row['firstUnblockLabel']}",
            f"- Why: {row['firstUnblockWhy']}",
            f"- Command: `{row['firstUnblockCommand'] or 'No command available.'}`",
            "",
        ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(packet: dict[str, Any]) -> str:
    metrics = "".join(f"<div><b>{esc(value)}</b><span>{esc(key)}</span></div>" for key, value in packet["counts"].items())
    cards = []
    for row in packet["episodeRows"]:
        gates = "".join(f"<li><span>{esc(key)}</span><b>{esc(value)}</b></li>" for key, value in row["gateCounts"].items())
        platforms = "".join(f"<span>{esc(platform)}</span>" for platform in row["platformsWaiting"])
        command = row["firstUnblockCommand"] or "No command available."
        cards.append(f"""
        <article class="episode {esc(row['status'])}">
          <p class="eyebrow">Episode {esc(row['episode'])} · {esc(row['status'])}</p>
          <h2>{esc(row['firstUnblockLabel'])}</h2>
          <p>{esc(row['firstUnblockWhy'])}</p>
          <div class="chips">{platforms or '<span>No waiting platform packets</span>'}</div>
          <ul class="mini">
            <li><span>platform rows waiting</span><b>{esc(row['platformRowsWaiting'])}</b></li>
            <li><span>review rows</span><b>{esc(row['reviewRows'])}</b></li>
            <li><span>unblock items</span><b>{esc(row['unblockItems'])}</b></li>
            <li><span>warnings</span><b>{esc(row['warningRows'])}</b></li>
          </ul>
          <h3>Gate mix</h3>
          <ul class="mini">{gates or '<li><span>none</span><b>0</b></li>'}</ul>
          <pre>{esc(command)}</pre>
        </article>
        """)
    sources = "".join(
        f"<li><span>{esc(key)}</span><code>{esc(value)}</code></li>"
        for key, value in packet["sourcePointers"].items()
        if value
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tower Review Gate Board</title>
<style>
  :root {{ color-scheme:dark; --bg:#10150e; --panel:#1d2519; --panel2:#151b13; --ink:#f7f0d9; --muted:#b9ad8b; --gold:#ecc94f; --leaf:#6ed47f; --water:#7bcbd8; --clay:#d07155; --line:#394830; }}
  body {{ margin:0; color:var(--ink); background:radial-gradient(circle at top right,rgba(123,203,216,.16),transparent 32%),var(--bg); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
  main {{ max-width:1280px; margin:0 auto; padding:34px 24px 70px; }}
  header,.episode,section {{ border:1px solid var(--line); background:rgba(29,37,25,.93); border-radius:28px; padding:24px; margin-bottom:16px; box-shadow:0 18px 60px rgba(0,0,0,.22); }}
  .eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
  h1 {{ font-size:clamp(40px,7vw,78px); line-height:.9; margin:0 0 12px; }}
  h2,h3 {{ margin:.2rem 0 .5rem; }}
  p,li {{ color:var(--muted); line-height:1.45; }}
  .metrics,.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
  .metrics div {{ border:1px solid var(--line); background:var(--panel2); border-radius:18px; padding:12px; }}
  .metrics b {{ display:block; color:var(--leaf); font-size:26px; }}
  .metrics span,.mini span {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
  .episode.review-gated {{ border-color:rgba(236,201,79,.5); }}
  .episode.ready-for-approval {{ border-color:rgba(110,212,127,.58); }}
  .chips {{ display:flex; flex-wrap:wrap; gap:8px; margin:14px 0; }}
  .chips span {{ border:1px solid var(--line); background:rgba(123,203,216,.1); border-radius:999px; padding:6px 10px; color:#dff8fb; font-size:12px; font-weight:800; }}
  .mini {{ list-style:none; padding:0; display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:8px; }}
  .mini li {{ border:1px solid var(--line); background:var(--panel2); border-radius:14px; padding:10px; }}
  .mini b {{ display:block; color:var(--gold); font-size:20px; }}
  pre,code {{ white-space:pre-wrap; overflow-wrap:anywhere; color:#ffe89a; }}
  pre {{ border:1px solid var(--line); background:#0c110b; border-radius:16px; padding:12px; }}
</style>
</head>
<body><main>
<header>
  <p class="eyebrow">Quipsly Tower · review gate</p>
  <h1>Publishing waits here until the work is actually reviewed.</h1>
  <p>{esc(packet['truth'])}</p>
  <p><strong>Next safest action:</strong> {esc(packet['nextSafestAction'])}</p>
  <div class="metrics">{metrics}</div>
</header>
<div class="grid">{''.join(cards)}</div>
<section>
  <h2>Source surfaces</h2>
  <ul>{sources}</ul>
</section>
</main></body></html>"""


def write_csv(path: Path, packet: dict[str, Any]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "episode",
                "status",
                "platformRowsWaiting",
                "platformsWaiting",
                "reviewRows",
                "unblockItems",
                "pendingReviewRows",
                "warningRows",
                "firstUnblockLabel",
                "firstUnblockCommand",
            ],
        )
        writer.writeheader()
        for row in packet["episodeRows"]:
            writer.writerow({
                "episode": row["episode"],
                "status": row["status"],
                "platformRowsWaiting": row["platformRowsWaiting"],
                "platformsWaiting": ", ".join(row["platformsWaiting"]),
                "reviewRows": row["reviewRows"],
                "unblockItems": row["unblockItems"],
                "pendingReviewRows": row["pendingReviewRows"],
                "warningRows": row["warningRows"],
                "firstUnblockLabel": row["firstUnblockLabel"],
                "firstUnblockCommand": row["firstUnblockCommand"],
            })


def main() -> int:
    release_root = Path(__import__("sys").argv[1]) if len(__import__("sys").argv) > 1 else DEFAULT_RELEASE_ROOT
    packet = build_packet(release_root)
    out_dir = release_root / "tower-review-gate-board" / f"{stamp()}-tower-review-gate-board"
    out_dir.mkdir(parents=True, exist_ok=False)
    html_path = out_dir / "index.html"
    json_path = out_dir / "tower-review-gate-board.json"
    markdown_path = out_dir / "START-HERE-tower-review-gate-board.md"
    csv_path = out_dir / "tower-review-gate-board.csv"
    packet.update({
        "sessionDir": str(out_dir),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Tower review gate board",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local review-gate evidence only. No approval, publication, upload, schedule, account mutation, overwrite, source mutation, or receipt capture.",
        },
    })
    html_path.write_text(render_html(packet), encoding="utf-8")
    markdown_path.write_text(render_markdown(packet), encoding="utf-8")
    write_csv(csv_path, packet)
    write_json(json_path, packet)
    pointer = {
        "schema": "quipsly.tower-review-gate-board.latest-pointer.v1",
        "generatedAt": iso_now(),
        "status": packet["status"],
        "htmlPath": packet["htmlPath"],
        "jsonPath": packet["jsonPath"],
        "markdownPath": packet["markdownPath"],
        "csvPath": packet["csvPath"],
        "sessionDir": packet["sessionDir"],
        "counts": packet["counts"],
        "firstSafeAction": packet["firstSafeAction"],
        "humanAsk": packet["humanAsk"],
        "agentSafeParallelWork": packet["agentSafeParallelWork"],
        "nextSafestAction": packet["nextSafestAction"],
        "truth": packet["truth"],
    }
    write_json(release_root / "tower-review-gate-board" / "latest-tower-review-gate-board.json", pointer)
    write_json(release_root / "latest-tower-review-gate-board.json", pointer)
    print(json.dumps({"ok": True, **pointer}, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
