#!/usr/bin/env python3
"""Build local duration experiment recommendations for Quipsly episodes.

This reads current exported package evidence and writes a review-only matrix for
possible alternate cuts. It does not render, trim, approve, publish, upload,
mutate originals, overwrite versions, or create receipt truth.
"""
from __future__ import annotations

import json
import shlex
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
OUT_ROOT = RELEASE_ROOT / "review-board" / "duration-experiment-matrix"
SCHEMA = "quipsly.episode-duration-experiment-matrix.v1"

PLATFORM_NOTES = {
    "youtubeLongForm": {
        "label": "YouTube long-form",
        "constraint": "Long episodes are fine if the channel is verified and file size/length stay under YouTube upload limits; the practical question is retention, pacing, and title/thumbnail promise.",
        "source": "https://support.google.com/youtube/answer/71673",
    },
    "spotifyVideoPodcast": {
        "label": "Spotify video podcast",
        "constraint": "Spotify video podcast uploads can be long, but should contain one video track and one audio track; practical risk is upload/process reliability and listener completion.",
        "source": "https://support.spotify.com/us/creators/article/publishing-videos/",
    },
    "applePodcastRss": {
        "label": "Apple Podcasts / RSS audio",
        "constraint": "Apple validates RSS/enclosure metadata. Duration is less the blocker than correct enclosure URL/length/type, stable GUID, byte-range hosting, and clean audio boundaries.",
        "source": "https://podcasters.apple.com/support/823-podcast-requirements",
    },
    "shorts": {
        "label": "Shorts/Reels/social clips",
        "constraint": "Use 15-45 seconds for high-retention tests, 45-90 seconds for fuller ideas, and up to 3 minutes when the clip has a real arc worth the added duration.",
        "source": "https://support.google.com/youtube/answer/15424877",
    },
}

EPISODE_CANDIDATES: dict[int, list[dict[str, str]]] = {
    1: [
        {"name": "Podcast-tight", "target": "32-34 min", "use": "Audio-first RSS/Spotify version", "tradeoff": "Best if the v004 duration candidate proves the audio boundary is right. Keeps the episode focused and avoids publishing the extra 2:09 tail unless that tail has value."},
        {"name": "YouTube conversational", "target": "34-36 min", "use": "Primary YouTube version", "tradeoff": "Preserves more of the existing v003 flow while staying compact. Needs a duration decision because v003 video is longer than podcast audio."},
        {"name": "Highlights chapter", "target": "18-24 min", "use": "Experimental faster cut", "tradeoff": "Potentially stronger retention and easier entry point, but may lose the slower relationship-building feel of Episode 1."},
    ],
    2: [
        {"name": "Lean proof", "target": "28-32 min", "use": "Fastest YouTube test", "tradeoff": "Forces stronger pacing and likely improves completion, but risks cutting context that explains the Wednesday Rule/book framing."},
        {"name": "Standard episode", "target": "36-40 min", "use": "Balanced YouTube + podcast candidate", "tradeoff": "Keeps enough conversation for trust while trimming weaker loops. Good first experiment because current package is 43:45 and aligned."},
        {"name": "Full conversation", "target": "43-44 min", "use": "Archive/podcast-complete version", "tradeoff": "Least editing effort and maximum context, but higher retention risk."},
    ],
    3: [
        {"name": "Discovery cut", "target": "30-35 min", "use": "YouTube search/discovery candidate", "tradeoff": "Creates a clearer promise and faster payoff. Harder edit because 45:18 has to be reduced without making the conversation feel chopped."},
        {"name": "Standard episode", "target": "38-42 min", "use": "Primary YouTube/podcast candidate", "tradeoff": "Safer human-feeling cut; trims obvious dead space while preserving episode identity."},
        {"name": "Full conversation", "target": "45 min", "use": "Patreon/archive/completionist version", "tradeoff": "Good for existing fans and source truth; probably weaker for first-time discovery."},
    ],
    4: [
        {"name": "Sync salvage", "target": "35-45 min", "use": "Fast repair experiment", "tradeoff": "Best way to ship something if the camera/audio breaks are painful. Sacrifices completeness to avoid letting the broken capture sink the episode."},
        {"name": "Main topic cut", "target": "55-70 min", "use": "Potential primary release after sync repair", "tradeoff": "More faithful to the long session, but only worth it if sync is stable and the core arc holds."},
        {"name": "Full video boundary", "target": "79:29", "use": "Video-first reference candidate", "tradeoff": "Matches current video export length, but podcast audio is 1:53:13, so this cannot be treated as RSS-ready without investigation."},
    ],
    5: [
        {"name": "YouTube digest", "target": "45-60 min", "use": "Most realistic public first cut", "tradeoff": "Cuts a 1:45:58 session into something more approachable. Risks losing nuance, but likely needed for audience growth."},
        {"name": "Deep episode", "target": "75-90 min", "use": "Podcast/Patreon long-form candidate", "tradeoff": "Keeps depth and coaching texture. Stronger for committed listeners than casual viewers."},
        {"name": "Full conversation", "target": "105-106 min", "use": "Archive/source-truth version", "tradeoff": "Maximum context, maximum retention/upload/review burden."},
    ],
    6: [
        {"name": "Repair cut", "target": "35-45 min", "use": "First publishable proof if review says current edit needs work", "tradeoff": "Gives us a shippable candidate quickly. May feel less complete, but it lets the editor learn from a clear target."},
        {"name": "Standard episode", "target": "55-65 min", "use": "Primary public candidate", "tradeoff": "Balances substance with watchability. Good target if the current 74:14 file feels padded."},
        {"name": "Full conversation", "target": "74-75 min", "use": "Podcast/archive candidate", "tradeoff": "Keeps source continuity, but current review status says the edit needs work, so this should not be the first publish push."},
    ],
}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-duration-experiment-matrix")


def ffprobe_duration(path: Path) -> float | None:
    try:
        out = subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)
        ], text=True, timeout=10).strip()
        return float(out) if out else None
    except Exception:
        return None


def fmt(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    total = int(round(seconds))
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    return f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def card_by_episode() -> dict[int, dict[str, Any]]:
    payload = load_json(RELEASE_ROOT / "review-board" / "current-production-blockers.json")
    cards = {}
    for card in payload.get("reviewCards") or []:
        if not isinstance(card, dict):
            continue
        try:
            ep = int(card.get("episode") or 0)
        except Exception:
            continue
        if ep:
            cards[ep] = card
    return cards


def evidence_path(card: dict[str, Any], label: str) -> Path | None:
    for item in card.get("evidencePaths") or []:
        if isinstance(item, dict) and item.get("label") == label and item.get("path"):
            return Path(str(item["path"]))
    return None


def build() -> dict[str, Any]:
    cards = card_by_episode()
    episodes = []
    for ep in range(1, 7):
        card = cards.get(ep, {})
        v16 = evidence_path(card, "16:9 video")
        v9 = evidence_path(card, "9:16 video")
        audio = evidence_path(card, "Podcast audio")
        durations = {
            "video16x9": fmt(ffprobe_duration(v16)) if v16 else "missing",
            "video9x16": fmt(ffprobe_duration(v9)) if v9 else "missing",
            "podcastAudio": fmt(ffprobe_duration(audio)) if audio else "missing",
        }
        episodes.append({
            "episode": ep,
            "status": card.get("status") or "unknown",
            "versionDisplay": card.get("versionDisplay") or "unknown",
            "durationSpreadLabel": card.get("durationSpreadLabel") or "unknown",
            "durationSeverity": card.get("durationSeverity") or "unknown",
            "readyShorts": card.get("readyShorts") or 0,
            "currentDurations": durations,
            "evidence": {
                "video16x9": str(v16) if v16 else "",
                "video9x16": str(v9) if v9 else "",
                "podcastAudio": str(audio) if audio else "",
            },
            "experiments": EPISODE_CANDIDATES.get(ep, []),
            "firstRecommendation": EPISODE_CANDIDATES.get(ep, [{}])[0],
        })
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "duration-experiment-matrix-ready",
        "releaseRoot": str(RELEASE_ROOT),
        "truth": {
            "reviewOnly": True,
            "externalPublishing": False,
            "externalUpload": False,
            "externalSchedulesCreated": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "exportsRendered": False,
        },
        "platformNotes": PLATFORM_NOTES,
        "episodes": episodes,
        "nextSafestAction": "Pick one target duration per episode, then generate versioned edit recipes before rendering any new files.",
    }


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Episode duration experiment matrix",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        "This is a review-only planning artifact. It proposes duration targets and tradeoffs before any new version is rendered.",
        "",
        "## Platform guardrails",
        "",
    ]
    for note in payload["platformNotes"].values():
        lines.append(f"- **{note['label']}**: {note['constraint']} Source: {note['source']}")
    lines.extend(["", "## Recommended experiment ladder", ""])
    lines.append("1. Start with aligned Episodes 2, 3, and 5 because they are easiest to compare cleanly.")
    lines.append("2. Treat Episode 1 as a duration-boundary decision before experimenting heavily.")
    lines.append("3. Treat Episode 4 as sync/audio investigation first; only then render alternate durations.")
    lines.append("4. Treat Episode 6 as a repair/edit-quality experiment before publishing.")
    lines.append("")
    for ep in payload["episodes"]:
        lines.extend([
            f"## Episode {ep['episode']}",
            "",
            f"- Current status: `{ep['status']}`",
            f"- Current version: `{ep['versionDisplay']}`",
            f"- Current durations: 16:9 `{ep['currentDurations']['video16x9']}`, 9:16 `{ep['currentDurations']['video9x16']}`, podcast audio `{ep['currentDurations']['podcastAudio']}`",
            f"- Duration spread: `{ep['durationSpreadLabel']}` / `{ep['durationSeverity']}`",
            f"- Ready shorts: `{ep['readyShorts']}`",
            "",
            "| Version idea | Target duration | Best use | Tradeoff |",
            "|---|---:|---|---|",
        ])
        for option in ep["experiments"]:
            lines.append(f"| {option['name']} | {option['target']} | {option['use']} | {option['tradeoff']} |")
        lines.append("")
    lines.extend([
        "## Safety boundary",
        "",
        "- No source media, original photos, manuscripts, existing exports, external accounts, schedules, approvals, publications, or receipts were mutated.",
        "- The next implementation step should create edit recipes first, then render versioned outputs only after the target duration is selected.",
    ])
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    rows = []
    for ep in payload["episodes"]:
        options = "".join(
            f"<li><b>{o['name']}</b> <span>{o['target']}</span><br><em>{o['use']}</em><p>{o['tradeoff']}</p></li>"
            for o in ep["experiments"]
        )
        rows.append(f"""
        <section class="episode">
          <p class="eyebrow">Episode {ep['episode']} · {ep['status']}</p>
          <h2>{ep['versionDisplay']}</h2>
          <p><b>Current:</b> 16:9 {ep['currentDurations']['video16x9']} · 9:16 {ep['currentDurations']['video9x16']} · podcast {ep['currentDurations']['podcastAudio']}</p>
          <p><b>Duration status:</b> {ep['durationSpreadLabel']} / {ep['durationSeverity']}</p>
          <ul>{options}</ul>
        </section>
        """)
    html_text = f"""<!doctype html><html><head><meta charset="utf-8"><title>Episode duration experiment matrix</title>
<style>
:root {{ color-scheme:dark; --bg:#11170f; --panel:#1d271b; --ink:#f8efd8; --muted:#bdae91; --gold:#e7c85a; --leaf:#77d58a; --line:#3b4a32; }}
body {{ margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:radial-gradient(circle at top left,rgba(119,213,138,.18),transparent 30%),var(--bg); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:34px 24px 70px; }}
header,.episode,.guardrails {{ border:1px solid var(--line); border-radius:24px; background:rgba(29,39,27,.92); padding:24px; margin:18px 0; box-shadow:0 18px 50px rgba(0,0,0,.25); }}
h1 {{ font-size:clamp(38px,6vw,78px); line-height:.9; margin:0 0 12px; }}
h2 {{ margin:.15rem 0 1rem; }}
.eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:900; }}
p {{ color:var(--muted); line-height:1.5; }}
ul {{ padding-left:22px; }} li {{ margin:14px 0; }} li span {{ color:var(--leaf); font-weight:800; }} em {{ color:var(--gold); font-style:normal; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(320px,1fr)); gap:16px; }}
code {{ color:var(--leaf); }}
</style></head><body><main>
<header><p class="eyebrow">Quipsly Studio · Review only</p><h1>Duration experiments before rendering.</h1><p>Pick target durations deliberately. Whole sources stay intact; alternate versions should be edit recipes first, then versioned renders only when chosen.</p></header>
<section class="guardrails"><p class="eyebrow">Platform guardrails</p>{''.join(f"<p><b>{n['label']}:</b> {n['constraint']} <br><code>{n['source']}</code></p>" for n in payload['platformNotes'].values())}</section>
<div class="grid">{''.join(rows)}</div>
<section class="guardrails"><p class="eyebrow">Safety</p><p>No original media, existing exports, accounts, uploads, schedules, approvals, publications, or receipts were mutated. This matrix is a planning artifact only.</p></section>
</main></body></html>"""
    path.write_text(html_text, encoding="utf-8")


def main() -> int:
    payload = build()
    out_dir = OUT_ROOT / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "duration-experiment-matrix.json"
    md_path = out_dir / "START-HERE-duration-experiment-matrix.md"
    html_path = out_dir / "index.html"
    payload.update({"jsonPath": str(json_path), "markdownPath": str(md_path), "htmlPath": str(html_path), "sessionDir": str(out_dir)})
    payload["firstSafeAction"] = {
        "label": "Open episode duration experiment matrix",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens local duration planning evidence only. It does not render, approve, upload, publish, schedule, overwrite, mutate sources, delete, or create receipt truth.",
    }
    json_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    write_markdown(md_path, payload)
    write_html(html_path, payload)
    latest = OUT_ROOT / "latest-duration-experiment-matrix.json"
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
