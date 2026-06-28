#!/usr/bin/env python3
"""Build a saved-session readiness board for Episodes 1-3 shorts.

The live Quipsly Studio board is intentionally tied to the currently loaded
session. This report looks across saved session truth so the operator and agents
can answer: do Episodes 1, 2, and 3 each have real short candidates, export
state, platform packaging, and next actions?
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

from shorts_board_common import (
    classify_short,
    emit_packet_outputs,
    esc,
    now_iso,
    platform_readiness,
    platform_readiness_summary,
    stage_rank,
)

EPISODE_CANDIDATES = {
    "episode-1": [
        "episode-1-codex-real-edit-v1-youtube-wordtimed",
        "episode-1-codex-real-edit-v1",
        "episode-1-premiere-rescue",
    ],
    "episode-2": [
        "episode-2-codex-overlap-review-v3",
        "episode-2-codex-overlap-review-v3-wordtimed",
        "episode-2-native-proof-v2",
        "episode-2-native-proof-v1",
    ],
    "episode-3": [
        "episode-3-premiere-rescue-youtube-wordtimed",
        "episode-3-premiere-rescue",
    ],
}

PLATFORM_KEYS = [
    "YouTube Shorts",
    "Instagram",
    "Facebook",
    "LinkedIn",
    "Patreon",
]


def default_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def default_session_dir() -> Path:
    override = os.environ.get("QUIPSLY_SESSION_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions"


def default_output_dir() -> Path:
    override = os.environ.get("QUIPSLY_SHORTS_REPORT_DIR")
    if override:
        return Path(override).expanduser()
    return default_repo_root() / "docs/quipsly/current-state"


def parse_args(argv: list[str]) -> tuple[Path, str, str, Path]:
    mode = "--md"
    output_dir = default_output_dir()
    basename = "episodes-1-3-shorts-readiness"
    session_dir = default_session_dir()
    positional: list[str] = []
    index = 0
    while index < len(argv):
        arg = argv[index]
        if arg in {"--json", "--html", "--md"}:
            mode = arg
        elif arg == "--session-dir" and index + 1 < len(argv):
            index += 1
            session_dir = Path(argv[index]).expanduser()
        elif arg in {"-h", "--help"}:
            print(
                "Usage: episodes_shorts_readiness.py [--json|--html|--md] "
                "[--session-dir /path] [/absolute/output/folder] [basename]"
            )
            raise SystemExit(0)
        else:
            positional.append(arg)
        index += 1
    if positional:
        output_dir = Path(positional[0]).expanduser()
    if len(positional) > 1:
        basename = positional[1]
    return output_dir, basename, mode, session_dir


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError(f"Expected object JSON in {path}")
    return payload


def active_sequence(payload: dict[str, Any]) -> dict[str, Any]:
    project = payload.get("project") if isinstance(payload.get("project"), dict) else {}
    sequences = project.get("sequences") if isinstance(project.get("sequences"), list) else []
    active_id = str(payload.get("activeSequenceId") or project.get("activeSequenceId") or "")
    dict_sequences = [seq for seq in sequences if isinstance(seq, dict)]
    if active_id:
        for seq in dict_sequences:
            if str(seq.get("id") or "") == active_id:
                return seq
    return dict_sequences[0] if dict_sequences else {}


def short_rows_from_session(payload: dict[str, Any]) -> list[dict[str, Any]]:
    sequence = active_sequence(payload)
    rows = sequence.get("shortClipQueue")
    if isinstance(rows, list):
        return [row for row in rows if isinstance(row, dict)]
    return []


def first_text(row: dict[str, Any], keys: list[str]) -> str:
    for key in keys:
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def destination_count(row: dict[str, Any]) -> int:
    destinations = row.get("destinations")
    presets = row.get("destinationPresets")
    count = 0
    if isinstance(destinations, list):
        count += len([item for item in destinations if str(item).strip()])
    if isinstance(presets, list):
        count += len([item for item in presets if str(item).strip()])
    elif isinstance(presets, dict):
        count += len(presets)
    return count


def status_contains(row: dict[str, Any], key: str, terms: set[str]) -> bool:
    value = str(row.get(key) or "").lower()
    return any(term in value for term in terms)


def is_exported_by_status(row: dict[str, Any]) -> bool:
    value = str(row.get("exportStatus") or row.get("localExportStatus") or "").strip().lower()
    if not value:
        return False
    negative_markers = {
        "not-exported",
        "not exported",
        "unexported",
        "missing",
        "failed",
        "queued",
        "queue",
        "pending",
    }
    if value in negative_markers or any(marker in value for marker in ["not-exported", "not exported", "unexported"]):
        return False
    return any(term in value for term in {"exported", "completed", "complete", "done"})


def enrich_short_row(row: dict[str, Any], episode_key: str, session_name: str, sequence_name: str) -> dict[str, Any]:
    enriched = dict(row)
    enriched.setdefault("episodeSlug", episode_key)
    enriched.setdefault("sourceEpisode", episode_key)
    enriched.setdefault("sourceSessionName", session_name)
    enriched.setdefault("sourceSequenceName", sequence_name)
    if not enriched.get("destinations"):
        enriched["destinations"] = PLATFORM_KEYS[:4]
    if not enriched.get("hookText"):
        hook = first_text(enriched, ["hook", "openingHook", "socialHook", "title"])
        if hook:
            enriched["hookText"] = hook
    if not enriched.get("overlayText") and enriched.get("primaryOverlayText"):
        enriched["overlayText"] = enriched.get("primaryOverlayText")
    return enriched


def card_from_row(row: dict[str, Any], episode_key: str, session_name: str, sequence_name: str, output_dir: Path, index: int) -> dict[str, Any]:
    enriched = enrich_short_row(row, episode_key, session_name, sequence_name)
    card = classify_short(enriched, str(output_dir), index)
    card["episodeKey"] = episode_key
    card["episodeLabel"] = episode_key.replace("-", " ").title()
    card["sourceSessionName"] = session_name
    card["sourceSequenceName"] = sequence_name
    card["startTime"] = row.get("startTime")
    card["hookText"] = first_text(enriched, ["hookText", "hook", "openingHook", "socialHook"])
    card["overlayText"] = first_text(enriched, ["overlayText", "primaryOverlayText", "captionText"])
    card["destinationCount"] = destination_count(enriched)
    card["destinationPresetCount"] = destination_count({"destinationPresets": enriched.get("destinationPresets")})
    card["exportedByStatus"] = is_exported_by_status(enriched)
    card["queuedByStatus"] = status_contains(enriched, "exportStatus", {"queued", "queue"})
    card["keptByStatus"] = status_contains(enriched, "reviewStatus", {"keep", "kept", "approved", "ready"})
    card["platformReadiness"] = platform_readiness(card)
    card["platformReadinessSummary"] = platform_readiness_summary(card.get("platformReadiness"))
    return card


def session_score(cards: list[dict[str, Any]]) -> float:
    if not cards:
        return -1
    exported_by_status = sum(1 for card in cards if card.get("exportedByStatus"))
    local_files = sum(1 for card in cards if card.get("primaryExportExists"))
    titled = sum(1 for card in cards if str(card.get("title") or "").strip())
    hooks = sum(1 for card in cards if str(card.get("hookText") or "").strip())
    destination_ready = sum(1 for card in cards if int(card.get("destinationCount") or 0) >= 4)
    review_ready = sum(1 for card in cards if str(card.get("reviewStatus") or "").lower() not in {"", "draft"})
    return len(cards) * 8 + exported_by_status * 5 + local_files * 7 + titled + hooks * 2 + destination_ready * 2 + review_ready


def summarize_status(cards: list[dict[str, Any]], key: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for card in cards:
        value = str(card.get(key) or "unknown")
        counts[value] = counts.get(value, 0) + 1
    return dict(sorted(counts.items()))


def episode_status(cards: list[dict[str, Any]]) -> tuple[str, str]:
    short_count = len(cards)
    exported_by_status = sum(1 for card in cards if card.get("exportedByStatus"))
    local_files = sum(1 for card in cards if card.get("primaryExportExists"))
    destination_ready = sum(1 for card in cards if int(card.get("destinationCount") or 0) >= 4)
    if short_count < 5:
        return "blocked", "Needs at least five real short candidates."
    if exported_by_status < 5 and local_files < 5:
        return "needs-export-proof", "Has candidates, but fewer than five have export proof/status."
    if destination_ready < short_count:
        return "needs-platform-packaging", "Some shorts still need destination/package metadata."
    if any(str(card.get("reviewStatus") or "").lower() in {"draft", "needs-human-review", "refine"} for card in cards):
        return "needs-human-review", "Enough candidates exist; the next work is watch/listen/refine."
    return "ready-for-publication-review", "Candidates are present and packaged; do final platform review."


def pick_episode_session(episode_key: str, session_dir: Path, output_dir: Path) -> dict[str, Any]:
    candidates = list(EPISODE_CANDIDATES.get(episode_key, []))
    discovered = sorted(path.stem for path in session_dir.glob(f"{episode_key}*.quipsly-session.json")) if session_dir.exists() else []
    for name in discovered:
        if name not in candidates:
            candidates.append(name)

    evaluated: list[dict[str, Any]] = []
    for session_name in candidates:
        path = session_dir / f"{session_name}.quipsly-session.json"
        if not path.exists():
            evaluated.append({"sessionName": session_name, "path": str(path), "exists": False, "score": -1, "shortCount": 0})
            continue
        try:
            payload = load_json(path)
            sequence = active_sequence(payload)
            sequence_name = str(sequence.get("name") or sequence.get("title") or episode_key)
            rows = short_rows_from_session(payload)
            cards = [card_from_row(row, episode_key, session_name, sequence_name, output_dir, index) for index, row in enumerate(rows, 1)]
            evaluated.append({
                "sessionName": session_name,
                "path": str(path),
                "exists": True,
                "sequenceName": sequence_name,
                "savedAt": payload.get("savedAt"),
                "score": session_score(cards),
                "shortCount": len(cards),
                "cards": cards,
            })
        except Exception as exc:  # keep report robust; surface bad session without crashing all episodes
            evaluated.append({"sessionName": session_name, "path": str(path), "exists": True, "score": -1, "shortCount": 0, "error": str(exc)})

    selected = max(evaluated, key=lambda item: float(item.get("score") or -1), default={})
    cards = selected.get("cards") or []
    status, reason = episode_status(cards)
    selected_summary = {
        "episodeKey": episode_key,
        "selectedSessionName": selected.get("sessionName"),
        "selectedSessionPath": selected.get("path"),
        "sequenceName": selected.get("sequenceName"),
        "savedAt": selected.get("savedAt"),
        "status": status,
        "statusReason": reason,
        "shortCount": len(cards),
        "exportedByStatusCount": sum(1 for card in cards if card.get("exportedByStatus")),
        "localExportedFileCount": sum(1 for card in cards if card.get("primaryExportExists")),
        "platformPackagedCount": sum(1 for card in cards if int(card.get("destinationCount") or 0) >= 4),
        "reviewStatusCounts": summarize_status(cards, "reviewStatus"),
        "exportStatusCounts": summarize_status(cards, "exportStatus"),
        "stageCounts": summarize_status(cards, "stage"),
        "cards": sorted(cards, key=lambda card: (stage_rank(str(card.get("stage") or "")), float(card.get("startTime") or 0), str(card.get("title") or ""))),
        "evaluatedSessions": [
            {key: value for key, value in item.items() if key != "cards"}
            for item in evaluated
        ],
    }
    return selected_summary


def build_packet(output_dir: Path, basename: str, session_dir: Path) -> dict[str, Any]:
    episodes = [pick_episode_session(key, session_dir, output_dir) for key in ["episode-1", "episode-2", "episode-3"]]
    all_cards = [card for episode in episodes for card in episode.get("cards") or []]
    global_gaps: list[dict[str, Any]] = []
    for episode in episodes:
        if episode.get("status") != "ready-for-publication-review":
            global_gaps.append({
                "episodeKey": episode.get("episodeKey"),
                "status": episode.get("status"),
                "why": episode.get("statusReason"),
                "nextAction": next_action_for_episode(episode),
            })
    strongest = sorted(
        all_cards,
        key=lambda card: (
            1 if card.get("exportedByStatus") or card.get("primaryExportExists") else 0,
            1 if int(card.get("destinationCount") or 0) >= 4 else 0,
            float(card.get("durationSeconds") or 0),
        ),
        reverse=True,
    )[:15]
    packet = {
        "packetType": "quipsly-episodes-1-3-shorts-readiness",
        "version": "2026-06-23.episodes-shorts-readiness.v1",
        "generatedAt": now_iso(),
        "truth": "Reads saved Quipsly session files directly. It does not publish, approve, mutate originals, or infer shorts from timeline edit decisions.",
        "operatorFocus": "Make the first three episodes visible as one shorts publication lane: candidates, export truth, platform packaging, review gaps, and next action.",
        "sessionDirectory": str(session_dir),
        "outputDirectory": str(output_dir),
        "basename": basename,
        "json": str(output_dir / f"{basename}.json"),
        "html": str(output_dir / f"{basename}.html"),
        "markdown": str(output_dir / f"{basename}.md"),
        "episodeCount": len(episodes),
        "shortCount": len(all_cards),
        "episodesWithFiveShorts": sum(1 for episode in episodes if int(episode.get("shortCount") or 0) >= 5),
        "exportedByStatusCount": sum(1 for card in all_cards if card.get("exportedByStatus")),
        "localExportedFileCount": sum(1 for card in all_cards if card.get("primaryExportExists")),
        "platformPackagedCount": sum(1 for card in all_cards if int(card.get("destinationCount") or 0) >= 4),
        "globalGapCount": len(global_gaps),
        "summary": {
            "episodeCount": len(episodes),
            "totalShorts": len(all_cards),
            "episodesWithFiveShorts": sum(1 for episode in episodes if int(episode.get("shortCount") or 0) >= 5),
            "totalExportedByStatus": sum(1 for card in all_cards if card.get("exportedByStatus")),
            "totalLocalExportedFiles": sum(1 for card in all_cards if card.get("primaryExportExists")),
            "totalPlatformPackaged": sum(1 for card in all_cards if int(card.get("destinationCount") or 0) >= 4),
            "globalGapCount": len(global_gaps),
        },
        "globalGaps": global_gaps,
        "episodes": episodes,
        "strongestVisibleCandidates": strongest,
    }
    return packet


def next_action_for_episode(episode: dict[str, Any]) -> str:
    status = str(episode.get("status") or "")
    if status == "blocked":
        return "Create or discover more real short candidates for this episode."
    if status == "needs-export-proof":
        return "Export at least five proxy-backed shorts and inspect the files."
    if status == "needs-platform-packaging":
        return "Add platform destinations, hooks, captions, and package notes."
    if status == "needs-human-review":
        return "Watch/listen to candidates, then mark keep/refine/reject."
    return "Do final publication review and queue for Tower/social publishing."


def markdown_page(packet: dict[str, Any]) -> str:
    lines = [
        "# Episodes 1-3 Shorts Readiness",
        "",
        packet["truth"],
        "",
        "## Summary",
        "",
    ]
    summary = packet.get("summary") or {}
    for key in ["totalShorts", "episodesWithFiveShorts", "totalExportedByStatus", "totalLocalExportedFiles", "totalPlatformPackaged", "globalGapCount"]:
        lines.append(f"- `{key}`: `{summary.get(key)}`")
    lines.extend(["", "## Episode lanes", ""])
    for episode in packet.get("episodes") or []:
        lines.extend([
            f"### {episode.get('episodeKey')}",
            "",
            f"- `selectedSession`: `{episode.get('selectedSessionName')}`",
            f"- `sequence`: `{episode.get('sequenceName')}`",
            f"- `status`: `{episode.get('status')}` - {episode.get('statusReason')}",
            f"- `shorts`: `{episode.get('shortCount')}`",
            f"- `exportStatus`: `{episode.get('exportedByStatusCount')}` exported by status, `{episode.get('localExportedFileCount')}` local files detected",
            f"- `platformPackaged`: `{episode.get('platformPackagedCount')}`",
            f"- `nextAction`: {next_action_for_episode(episode)}",
            "",
            "| Short | Time | Duration | Review | Export | Stage | Next |",
            "| --- | ---: | ---: | --- | --- | --- | --- |",
        ])
        for card in (episode.get("cards") or [])[:12]:
            start = card.get("startTime")
            start_text = "" if start in {None, ""} else f"{float(start):.2f}s"
            lines.append(
                f"| {card.get('title')} | {start_text} | {card.get('durationSeconds')}s | "
                f"{card.get('reviewStatus')} | {card.get('exportStatus')} | {card.get('stage')} | {card.get('nextAction')} |"
            )
        lines.append("")
    lines.extend(["## Strongest visible candidates", ""])
    for card in packet.get("strongestVisibleCandidates") or []:
        lines.append(
            f"- `{card.get('episodeKey')}` `{card.get('title')}` - {card.get('durationSeconds')}s, "
            f"review `{card.get('reviewStatus')}`, export `{card.get('exportStatus')}`, platforms `{card.get('platformReadinessSummary')}`"
        )
    if packet.get("globalGaps"):
        lines.extend(["", "## Next practical actions", ""])
        for gap in packet.get("globalGaps") or []:
            lines.append(f"- `{gap.get('episodeKey')}`: {gap.get('nextAction')} ({gap.get('why')})")
    return "\n".join(lines)


def html_page(packet: dict[str, Any]) -> str:
    summary = packet.get("summary") or {}
    summary_cards = "".join(
        f"<article><strong>{esc(summary.get(key))}</strong><span>{esc(label)}</span></article>"
        for key, label in [
            ("totalShorts", "total shorts"),
            ("episodesWithFiveShorts", "episodes with >=5"),
            ("totalExportedByStatus", "exported by status"),
            ("totalLocalExportedFiles", "local files detected"),
            ("totalPlatformPackaged", "platform packaged"),
            ("globalGapCount", "open gaps"),
        ]
    )
    episode_html = []
    for episode in packet.get("episodes") or []:
        rows = "".join(
            f"""
            <tr>
              <td>{esc(card.get('title'))}</td>
              <td>{esc(card.get('startTime'))}</td>
              <td>{esc(card.get('durationSeconds'))}s</td>
              <td>{esc(card.get('reviewStatus'))}</td>
              <td>{esc(card.get('exportStatus'))}</td>
              <td>{esc(card.get('stage'))}</td>
              <td>{esc(card.get('nextAction'))}</td>
            </tr>
            """
            for card in (episode.get("cards") or [])[:12]
        )
        episode_html.append(
            f"""
            <section class="episode {esc(episode.get('status'))}">
              <p class="eyebrow">{esc(episode.get('episodeKey'))}</p>
              <h2>{esc(episode.get('sequenceName') or episode.get('selectedSessionName'))}</h2>
              <p><strong>{esc(episode.get('status'))}</strong> - {esc(episode.get('statusReason'))}</p>
              <dl>
                <div><dt>Session</dt><dd>{esc(episode.get('selectedSessionName'))}</dd></div>
                <div><dt>Shorts</dt><dd>{esc(episode.get('shortCount'))}</dd></div>
                <div><dt>Export status</dt><dd>{esc(episode.get('exportedByStatusCount'))} status / {esc(episode.get('localExportedFileCount'))} local files</dd></div>
                <div><dt>Next</dt><dd>{esc(next_action_for_episode(episode))}</dd></div>
              </dl>
              <table>
                <thead><tr><th>Short</th><th>Start</th><th>Duration</th><th>Review</th><th>Export</th><th>Stage</th><th>Next</th></tr></thead>
                <tbody>{rows}</tbody>
              </table>
            </section>
            """
        )
    gap_html = "".join(
        f"<li><strong>{esc(gap.get('episodeKey'))}</strong>: {esc(gap.get('nextAction'))} <em>{esc(gap.get('why'))}</em></li>"
        for gap in packet.get("globalGaps") or []
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Episodes 1-3 Shorts Readiness</title>
  <style>
    :root {{ color-scheme: dark; --bg:#121814; --panel:#1b251b; --panel2:#263323; --ink:#f7efd8; --muted:#b8ad91; --gold:#f3ca43; --moss:#83c26b; --clay:#d1844d; --red:#e86b65; --line:rgba(247,239,216,.16); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; background:radial-gradient(circle at 10% 0%, rgba(131,194,107,.18), transparent 30rem), radial-gradient(circle at 100% 10%, rgba(243,202,67,.12), transparent 26rem), var(--bg); color:var(--ink); font:15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
    main {{ max-width:1200px; margin:0 auto; padding:42px 24px 72px; }}
    .hero,.episode {{ border:1px solid var(--line); border-radius:28px; background:linear-gradient(135deg, rgba(27,37,27,.95), rgba(38,51,35,.86)); box-shadow:0 24px 80px rgba(0,0,0,.28); }}
    .hero {{ padding:32px; }}
    .episode {{ margin-top:18px; padding:22px; }}
    .eyebrow {{ margin:0 0 8px; color:var(--gold); text-transform:uppercase; letter-spacing:.22em; font-size:.72rem; font-weight:850; }}
    h1 {{ margin:0; font-size:clamp(2.2rem, 6vw, 4.8rem); line-height:.92; letter-spacing:-.06em; }}
    h2 {{ margin:0 0 8px; }}
    p, dd, em {{ color:var(--muted); }}
    .counts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:24px; }}
    .counts article {{ border:1px solid var(--line); border-radius:18px; background:rgba(255,255,255,.045); padding:16px; }}
    .counts strong {{ display:block; font-size:2rem; color:var(--gold); }}
    dl {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:10px; }}
    dt {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:.68rem; }}
    dd {{ margin:2px 0 0; }}
    table {{ width:100%; border-collapse:collapse; overflow:hidden; border-radius:16px; margin-top:14px; }}
    th,td {{ border-bottom:1px solid var(--line); padding:9px 8px; text-align:left; vertical-align:top; }}
    th {{ color:var(--gold); font-size:.72rem; text-transform:uppercase; letter-spacing:.1em; }}
    tr:nth-child(even) td {{ background:rgba(255,255,255,.035); }}
    .gaps {{ border:1px solid rgba(232,107,101,.35); background:rgba(232,107,101,.08); border-radius:22px; padding:18px; margin-top:18px; }}
  </style>
</head>
<body>
<main>
  <section class="hero">
    <p class="eyebrow">Quipsly shorts readiness</p>
    <h1>Episodes 1-3 as one publication lane.</h1>
    <p>{esc(packet.get('truth'))}</p>
    <div class="counts">{summary_cards}</div>
  </section>
  {''.join(episode_html)}
  <section class="gaps"><p class="eyebrow">Next practical actions</p><ul>{gap_html or '<li>No major gaps detected.</li>'}</ul></section>
</main>
</body>
</html>"""


def main(argv: list[str]) -> int:
    output_dir, basename, mode, session_dir = parse_args(argv)
    packet = build_packet(output_dir, basename, session_dir)
    emit_packet_outputs(packet, html_page(packet), markdown_page(packet), mode)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
