#!/usr/bin/env python3
"""Build a package blocker triage board from release-validation output.

This board converts the blunt "blocked episode" truth into a calm repair map.
It is read-only: no exports, uploads, approvals, overwrites, or receipt claims.
"""

from __future__ import annotations

import csv
import html
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
LATEST_POINTER = "latest-studio-package-blocker-triage.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp_now() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def parse_ready_pair(value: str) -> tuple[int, int]:
    match = re.search(r"`?(\d+)\s*/\s*(\d+)`?", value)
    if not match:
        return (0, 0)
    return (int(match.group(1)), int(match.group(2)))


def classify_message(kind: str, message: str) -> tuple[str, str, str]:
    lower = message.lower()
    if "unexpected aspect/resolution" in lower:
        return (
            "long-form-shape-proof",
            "Re-probe or regenerate long-form export proof",
            "The package validator cannot prove the video shape. Usually this means a missing/broken file, bad probe metadata, or a placeholder path.",
        )
    if "short missing media/audio/video proof" in lower:
        return (
            "short-proof-missing",
            "Generate or repair the short media proof",
            "The short exists as a recipe/metadata item, but local package validation cannot prove usable audio/video media.",
        )
    if "minimum is" in lower and "short" in lower:
        return (
            "short-count-insufficient",
            "Produce enough ready shorts or lower the local validation expectation deliberately",
            "The package has fewer ready shorts than the local release policy expects.",
        )
    if "duration" in lower:
        return (
            "duration-review",
            "Watch/listen or regenerate duration-mismatched artifacts",
            "The package may still be useful for review, but publishing needs an explicit duration decision.",
        )
    if kind == "warning":
        return (
            "package-warning",
            "Review warning before publication",
            "This is not a local-review blocker by itself, but it should not disappear into vague readiness language.",
        )
    return (
        "package-readiness",
        "Inspect package artifact and create a new version if needed",
        "The validator reported a package issue that needs human/agent inspection.",
    )


def parse_validation_markdown(markdown_path: Path) -> list[dict[str, Any]]:
    if not markdown_path.exists():
        return []
    text = markdown_path.read_text(encoding="utf-8")
    chunks = re.split(r"(?=^## Episode\s+\d+)", text, flags=re.MULTILINE)
    episodes: list[dict[str, Any]] = []
    for chunk in chunks:
        header = re.match(r"^## Episode\s+(\d+)\s+-\s+(\S+)", chunk, flags=re.MULTILINE)
        if not header:
            continue
        episode = int(header.group(1))
        version = header.group(2)
        item: dict[str, Any] = {
            "episode": episode,
            "version": version,
            "status": "",
            "readyShorts": {"ready": 0, "expected": 0},
            "platformPrep": {"ready": 0, "expected": 0},
            "receiptStatus": "",
            "next": "",
            "blockers": [],
            "warnings": [],
        }
        for line in chunk.splitlines():
            stripped = line.strip()
            if stripped.startswith("- Status:"):
                item["status"] = stripped.split(":", 1)[1].strip().strip("`")
            elif stripped.startswith("- Ready shorts:"):
                ready, expected = parse_ready_pair(stripped)
                item["readyShorts"] = {"ready": ready, "expected": expected}
            elif stripped.startswith("- Platform prep:"):
                ready, expected = parse_ready_pair(stripped)
                item["platformPrep"] = {"ready": ready, "expected": expected}
            elif stripped.startswith("- Receipt status:"):
                item["receiptStatus"] = stripped.split(":", 1)[1].strip().strip("`")
            elif stripped.startswith("- Next:"):
                item["next"] = stripped.split(":", 1)[1].strip()
        current_section = ""
        for line in chunk.splitlines():
            stripped = line.strip()
            if stripped == "### Blockers":
                current_section = "blockers"
                continue
            if stripped == "### Warnings":
                current_section = "warnings"
                continue
            if stripped.startswith("### "):
                current_section = ""
                continue
            if current_section in {"blockers", "warnings"} and stripped.startswith("- "):
                item[current_section].append(stripped[2:].strip())
        episodes.append(item)
    return episodes


def build_rows(episodes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for episode in episodes:
        for kind in ("blocker", "warning"):
            messages = episode["blockers"] if kind == "blocker" else episode["warnings"]
            for message in messages:
                category, next_action, explanation = classify_message(kind, message)
                rows.append(
                    {
                        "episode": episode["episode"],
                        "version": episode["version"],
                        "episodeStatus": episode["status"],
                        "severity": kind,
                        "category": category,
                        "message": message,
                        "nextAction": next_action,
                        "plainEnglish": explanation,
                        "readyShorts": episode["readyShorts"],
                        "platformPrep": episode["platformPrep"],
                        "receiptStatus": episode["receiptStatus"],
                    }
                )
    return rows


def build_summary(episodes: list[dict[str, Any]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    blocked_episodes = sorted({e["episode"] for e in episodes if str(e.get("status")) == "blocked" or e.get("blockers")})
    warning_episodes = sorted({e["episode"] for e in episodes if e.get("warnings")})
    by_category: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for row in rows:
        by_category[row["category"]] = by_category.get(row["category"], 0) + 1
        by_severity[row["severity"]] = by_severity.get(row["severity"], 0) + 1
    return {
        "episodes": len(episodes),
        "blockedEpisodes": len(blocked_episodes),
        "warningEpisodes": len(warning_episodes),
        "blockerRows": by_severity.get("blocker", 0),
        "warningRows": by_severity.get("warning", 0),
        "byCategory": by_category,
        "blockedEpisodeNumbers": blocked_episodes,
        "warningEpisodeNumbers": warning_episodes,
    }


def first_safe_action(rows: list[dict[str, Any]]) -> str:
    for category in ("long-form-shape-proof", "short-proof-missing", "short-count-insufficient", "duration-review"):
        for row in rows:
            if row["severity"] == "blocker" and row["category"] == category:
                return f"Episode {row['episode']:02d}: {row['nextAction']} ({row['category']})."
    for row in rows:
        return f"Episode {row['episode']:02d}: {row['nextAction']} ({row['category']})."
    return "No package blockers found. Keep receipt truth separate before publishing."


def build_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Studio package blocker triage",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
        f"Status: `{payload['status']}`",
        f"Next safest action: {payload['nextSafestAction']}",
        "",
        "## Counts",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines += ["", "## Triage rows"]
    for row in payload["rows"]:
        lines += [
            f"- Episode {row['episode']:02d} `{row['version']}` {row['severity']} `{row['category']}`",
            f"  - Message: {row['message']}",
            f"  - Next: {row['nextAction']}",
            f"  - Meaning: {row['plainEnglish']}",
        ]
    return "\n".join(lines) + "\n"


def build_html(payload: dict[str, Any]) -> str:
    counts = payload["counts"]
    cards = "\n".join(
        f"""
        <article class="card {html.escape(row['severity'])}">
          <div class="pill">{html.escape(row['severity'])} / {html.escape(row['category'])}</div>
          <h3>Episode {row['episode']:02d} · {html.escape(row['version'])}</h3>
          <p class="message">{html.escape(row['message'])}</p>
          <p><b>Next:</b> {html.escape(row['nextAction'])}</p>
          <p>{html.escape(row['plainEnglish'])}</p>
        </article>
        """
        for row in payload["rows"]
    ) or "<article class=\"card\"><h3>No package blockers found</h3><p>Keep receipt truth separate before publishing.</p></article>"
    category_rows = "\n".join(
        f"<tr><th>{html.escape(str(k))}</th><td>{html.escape(str(v))}</td></tr>"
        for k, v in sorted((counts.get("byCategory") or {}).items())
    )
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Studio package blocker triage</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f7efe0; --ink:#2d271f; --muted:#756856; --leaf:#2f6f4f; --honey:#d29b32; --clay:#a84e3f; --card:rgba(255,252,244,.9); }}
    body {{ margin:0; color:var(--ink); font-family:ui-rounded,"Avenir Next","Gill Sans",system-ui,sans-serif; background:radial-gradient(circle at 10% 10%,rgba(210,155,50,.2),transparent 30rem),radial-gradient(circle at 90% 18%,rgba(47,111,79,.16),transparent 28rem),var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:42px 24px; }}
    h1 {{ font-size:clamp(2.3rem,5vw,5rem); line-height:.94; margin:0; letter-spacing:-.06em; }}
    .deck {{ max-width:820px; color:var(--muted); font-size:1.08rem; line-height:1.62; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:14px; margin-top:24px; }}
    .card,.stat {{ background:var(--card); border:1px solid rgba(45,39,31,.12); border-radius:24px; padding:20px; box-shadow:0 18px 44px rgba(45,39,31,.08); }}
    .blocker {{ border-color:rgba(168,78,63,.35); }}
    .warning {{ border-color:rgba(210,155,50,.4); }}
    .stat strong {{ display:block; font-size:2.2rem; letter-spacing:-.04em; }}
    .pill {{ display:inline-flex; padding:5px 9px; border-radius:999px; background:rgba(47,111,79,.12); color:var(--leaf); text-transform:uppercase; font-size:.72rem; font-weight:900; letter-spacing:.08em; }}
    .message {{ font-weight:800; color:var(--ink); }}
    table {{ width:100%; border-collapse:collapse; background:var(--card); border-radius:20px; overflow:hidden; margin-top:18px; }}
    th,td {{ padding:11px 12px; border-bottom:1px solid rgba(45,39,31,.1); text-align:left; }}
  </style>
</head>
<body>
<main>
  <div class="pill">read-only package truth</div>
  <h1>Studio package blocker triage</h1>
  <p class="deck">{html.escape(payload['plainEnglish'])}</p>
  <section class="grid">
    <article class="stat"><div class="pill">episodes</div><strong>{counts['episodes']}</strong><span>{counts['blockedEpisodes']} blocked, {counts['warningEpisodes']} warning</span></article>
    <article class="stat"><div class="pill">blockers</div><strong>{counts['blockerRows']}</strong><span>package issues to fix before review/publish</span></article>
    <article class="stat"><div class="pill">warnings</div><strong>{counts['warningRows']}</strong><span>needs review before external publishing</span></article>
  </section>
  <h2>Next safest action</h2>
  <article class="card"><p>{html.escape(payload['nextSafestAction'])}</p></article>
  <h2>Rows</h2>
  <section class="grid">{cards}</section>
  <h2>Categories</h2>
  <table>{category_rows}</table>
</main>
</body>
</html>
"""


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["episode", "version", "episodeStatus", "severity", "category", "message", "nextAction", "plainEnglish", "receiptStatus"])
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames or []})


def main() -> int:
    release_root = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_RELEASE_ROOT
    review_root = release_root / "review-board"
    markdown_path = review_root / "release-validation.md"
    json_path_in = review_root / "release-validation.json"
    episodes = parse_validation_markdown(markdown_path)
    rows = build_rows(episodes)
    counts = build_summary(episodes, rows)
    status = "studio-package-blockers-found" if counts["blockerRows"] else ("studio-package-warnings-found" if counts["warningRows"] else "studio-package-triage-clear")
    stamp = stamp_now()
    out_dir = review_root / "studio-package-blocker-triage" / f"{stamp}-studio-package-blocker-triage"
    out_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "schema": "quipsly.studio-package-blocker-triage.v1",
        "status": status,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sourceMarkdown": str(markdown_path),
        "sourceJson": str(json_path_in),
        "plainEnglish": "This board translates release package validation into repair categories. It does not publish, upload, approve, overwrite, or mutate media.",
        "truth": "Read-only package triage. No original media, exports, sidecars, approvals, uploads, schedules, account state, publication receipts, deletes, or overwrites changed.",
        "counts": counts,
        "nextSafestAction": first_safe_action(rows),
        "episodes": episodes,
        "rows": rows,
    }
    html_path = out_dir / "index.html"
    markdown_out = out_dir / "START-HERE-studio-package-blocker-triage.md"
    json_out = out_dir / "studio-package-blocker-triage.json"
    csv_out = out_dir / "studio-package-blocker-triage.csv"
    html_path.write_text(build_html(payload), encoding="utf-8")
    markdown_out.write_text(build_markdown(payload), encoding="utf-8")
    write_csv(csv_out, rows)
    write_json(json_out, {**payload, "htmlPath": str(html_path), "markdownPath": str(markdown_out), "jsonPath": str(json_out), "csvPath": str(csv_out)})
    pointer = {
        "status": status,
        "generatedAt": payload["generatedAt"],
        "latest": str(json_out),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_out),
        "jsonPath": str(json_out),
        "csvPath": str(csv_out),
        "counts": counts,
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
    }
    write_json(review_root / LATEST_POINTER, pointer)
    write_json(review_root / "studio-package-blocker-triage" / LATEST_POINTER, pointer)
    print(json.dumps(pointer, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
