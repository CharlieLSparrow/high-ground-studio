#!/usr/bin/env python3
"""Build a Nest idea/output router from existing writing evidence.

The router promotes source-backed draft prep cards into a practical capture and
repurposing surface: book section, article, episode page, social post, quote,
short, or research note. It writes local sidecar artifacts only. It never mutates
source files, canonical manuscript text, publication state, accounts, schedules,
or receipt truth.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
LATEST_CONTROL_ROOM = "latest-nest-writing-control-room.json"
LATEST_POINTER = "latest-nest-idea-output-router.json"
SCHEMA = "quipsly.nest.idea-output-router.v1"

ROUTE_LABELS = {
    "book-section-draft": "Book section",
    "article-draft": "Article",
    "podcast-episode-page-copy": "Episode page",
    "social-caption-pack": "Social post pack",
    "research/source-note": "Research note",
    "source-check-note": "Source check note",
    "video-short-outline": "Video short outline",
    "quote-card": "Quote card",
}


def iso_now() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f-idea-output-router")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            return {}
        target = payload.get("jsonPath") or payload.get("packetPath")
        if target:
            target_path = Path(str(target))
            if target_path.exists() and target_path != path:
                target_payload = json.loads(target_path.read_text(encoding="utf-8"))
                if isinstance(target_payload, dict):
                    return {**payload, **target_payload, "pointerPath": str(path)}
        payload.setdefault("pointerPath", str(path))
        return payload
    except Exception as exc:
        return {"status": "load-error", "path": str(path), "error": str(exc)}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def esc(value: Any) -> str:
    return html.escape(str(value or ""))


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def route_family(route: str) -> str:
    route = route.lower()
    if "book" in route:
        return "book"
    if "article" in route:
        return "article"
    if "episode" in route or "podcast" in route:
        return "podcast"
    if "social" in route or "short" in route or "quote" in route:
        return "social"
    if "source" in route or "research" in route:
        return "research"
    return "idea"


def candidate_routes(card: dict[str, Any]) -> list[str]:
    routes = [str(item) for item in as_list(card.get("candidateOutputs")) if str(item)]
    first_output = str(card.get("firstOutput") or "")
    if first_output and first_output not in routes:
        routes.insert(0, first_output)
    if not routes:
        routes = ["research/source-note", "article-draft", "social-caption-pack"]
    if "video-short-outline" not in routes and any("social" in route for route in routes):
        routes.append("video-short-outline")
    if "quote-card" not in routes:
        routes.append("quote-card")
    return routes


def build_rows(control: dict[str, Any], limit: int) -> list[dict[str, Any]]:
    prep = as_dict(control.get("publishableDraftPrepCards"))
    cards = [item for item in as_list(prep.get("cards")) if isinstance(item, dict)]
    if not cards:
        work = as_dict(control.get("writingWorkCards"))
        cards = [item for item in as_list(work.get("cards")) if isinstance(item, dict)]
    rows: list[dict[str, Any]] = []
    for index, card in enumerate(cards[:limit], start=1):
        routes = candidate_routes(card)
        open_command = str(card.get("openCommand") or card.get("safeCommand") or "")
        open_path = str(card.get("openPath") or card.get("htmlPath") or "")
        if not open_path and open_command.startswith("open "):
            open_path = open_command.removeprefix("open ").strip().strip("'")
        if not open_command and open_path:
            open_command = f"open {shell_quote(open_path)}"
        title = str(card.get("title") or f"Idea route {index}")
        source_trail = str(card.get("sourceTrail") or "source trail pending")
        readiness = str(card.get("readiness") or card.get("status") or "needs-review")
        recommended = str(card.get("recommendedMove") or card.get("firstOutput") or "source-check")
        rows.append({
            "rank": index,
            "title": title,
            "readiness": readiness,
            "recommendedMove": recommended,
            "sourceTrail": source_trail,
            "routes": routes,
            "primaryRoute": routes[0],
            "routeFamilies": sorted({route_family(route) for route in routes}),
            "humanQuestion": str(card.get("humanQuestion") or "Which output, if any, should this idea become next?"),
            "codexSafeMove": str(card.get("codexSafeMove") or card.get("codexCanDo") or "Prepare outlines, alternate draft passes, source questions, and platform-copy previews without canon or publication mutation."),
            "localPrepNoteYaml": str(card.get("localPrepNoteYaml") or card.get("localWorkNoteYaml") or ""),
            "openCommand": open_command,
            "openPath": open_path,
            "truth": str(card.get("truth") or "Idea/output route only. No source, canon, publication, schedule, account, overwrite, approval, or receipt truth changes."),
        })
    return rows


def route_counts(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for row in rows:
        for family in row.get("routeFamilies") or []:
            counts[family] = counts.get(family, 0) + 1
    return counts


def build_payload(nest_root: Path, limit: int) -> dict[str, Any]:
    control = load_json(nest_root / LATEST_CONTROL_ROOM)
    rows = build_rows(control, limit)
    counts = as_dict(control.get("counts"))
    route_counts_payload = route_counts(rows)
    actionable = sum(1 for row in rows if row.get("openCommand"))
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "nest-idea-output-router-ready" if rows else "nest-idea-output-router-needs-writing-control-room",
        "nestRoot": str(nest_root),
        "sourceControlRoomPointerPath": str(nest_root / LATEST_CONTROL_ROOM),
        "sourceControlRoomJsonPath": str(control.get("jsonPath") or ""),
        "sourceControlRoomHtmlPath": str(control.get("htmlPath") or ""),
        "plainEnglish": "Route source-backed ideas into possible outputs without canonizing, publishing, or hiding provenance.",
        "nextSafestAction": "Pick one routed idea, open its source/draft evidence, and prepare only a local outline, source note, article angle, short outline, quote card, or platform-copy preview.",
        "humanAsk": "Choose one promising idea/output route to develop, or mark it hold/source-check in a local note. Do not replace canon or publish from this router.",
        "agentSafeParallelWork": "Codex can prepare outlines, source questions, quote-card candidates, social-caption previews, episode-page angles, and article structures. Stop before canon replacement or external publication.",
        "counts": {
            "routerRows": len(rows),
            "actionableRows": actionable,
            "sourceDocuments": int(counts.get("sourceDocuments") or 0),
            "sourceWords": int(counts.get("sourceWords") or 0),
            "currentDrafts": int(counts.get("currentDrafts") or 0),
            "pendingHumanReview": int(counts.get("pendingHumanReview") or 0),
            "platformDraftItems": int(counts.get("platformDraftItems") or 0),
            "receiptSlots": int(counts.get("receiptSlots") or 0),
            "bookRoutes": route_counts_payload.get("book", 0),
            "articleRoutes": route_counts_payload.get("article", 0),
            "podcastRoutes": route_counts_payload.get("podcast", 0),
            "socialRoutes": route_counts_payload.get("social", 0),
            "researchRoutes": route_counts_payload.get("research", 0),
        },
        "rows": rows,
        "firstSafeAction": {},
        "truth": {
            "description": "Nest idea/output router only. It reads local writing evidence and writes a local routing packet.",
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "accountMutation": False,
            "approvalCreated": False,
            "receiptTruthCreated": False,
        },
    }


def render_markdown(payload: dict[str, Any]) -> str:
    lines = [
        "# Nest idea/output router",
        "",
        f"Status: `{payload.get('status')}`",
        "",
        str(payload.get("plainEnglish") or ""),
        "",
        "## Next safest action",
        str(payload.get("nextSafestAction") or ""),
        "",
        "## Counts",
    ]
    for key, value in as_dict(payload.get("counts")).items():
        lines.append(f"- {key}: `{value}`")
    lines.extend(["", "## Routes"])
    for row in payload.get("rows") or []:
        routes = ", ".join(ROUTE_LABELS.get(route, route) for route in row.get("routes") or [])
        lines.extend([
            f"### {row.get('rank')}. {row.get('title')}",
            f"- Readiness: `{row.get('readiness')}`",
            f"- Recommended move: `{row.get('recommendedMove')}`",
            f"- Routes: {routes}",
            f"- Source trail: {row.get('sourceTrail')}",
            f"- Human question: {row.get('humanQuestion')}",
            f"- Open: `{row.get('openCommand')}`",
            f"- Truth: {row.get('truth')}",
            "",
        ])
    lines.extend([
        "## Boundary",
        "- No source file mutation.",
        "- No canonical manuscript replacement.",
        "- No external publishing, upload, schedule, approval, account mutation, overwrite, or receipt truth.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def render_html(payload: dict[str, Any]) -> str:
    counts = as_dict(payload.get("counts"))
    rows_html = []
    for row in payload.get("rows") or []:
        routes = "".join(f"<span>{esc(ROUTE_LABELS.get(route, route))}</span>" for route in row.get("routes") or [])
        rows_html.append(f"""
        <article class="route-card">
          <div class="rank">{esc(row.get('rank'))}</div>
          <div>
            <h2>{esc(row.get('title'))}</h2>
            <p class="muted">{esc(row.get('sourceTrail'))}</p>
            <div class="routes">{routes}</div>
            <p><b>Recommended:</b> {esc(row.get('recommendedMove'))} · <b>Readiness:</b> {esc(row.get('readiness'))}</p>
            <p>{esc(row.get('humanQuestion'))}</p>
            <code>{esc(row.get('openCommand') or 'No open command available')}</code>
          </div>
        </article>
        """)
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Nest Idea Output Router</title>
  <style>
    :root {{ color-scheme: light dark; --bg:#f2ead8; --paper:#fffaf0; --ink:#30261d; --muted:#6f624e; --leaf:#315a40; --moss:#dfe9d5; --honey:#c5902d; --sky:#427f8e; --line:#dbcaa8; }}
    body {{ margin:0; color:var(--ink); font-family:ui-rounded, "Avenir Next", "Gill Sans", system-ui, sans-serif; background:radial-gradient(circle at 12% 5%, rgba(49,90,64,.18), transparent 26rem), radial-gradient(circle at 90% 10%, rgba(197,144,45,.2), transparent 30rem), var(--bg); }}
    main {{ max-width:1180px; margin:auto; padding:44px 22px 70px; }}
    h1 {{ font-size:clamp(2.8rem,6vw,5.8rem); line-height:.88; letter-spacing:-.06em; margin:.1em 0; }}
    .deck {{ max-width:850px; color:var(--muted); font-size:1.12rem; line-height:1.65; }}
    .status,.stat,.route-card,.panel {{ background:rgba(255,250,240,.92); border:1px solid rgba(48,38,29,.13); box-shadow:0 18px 44px rgba(48,38,29,.08); }}
    .status {{ display:inline-flex; border-radius:999px; padding:9px 13px; color:var(--leaf); font-weight:900; text-transform:uppercase; letter-spacing:.08em; font-size:.78rem; }}
    .stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(155px,1fr)); gap:12px; margin:26px 0; }}
    .stat {{ border-radius:22px; padding:16px; }}
    .stat strong {{ display:block; font-size:2rem; letter-spacing:-.05em; }}
    .route-card {{ display:grid; grid-template-columns:48px 1fr; gap:16px; border-radius:26px; padding:18px; margin:14px 0; }}
    .rank {{ width:40px; height:40px; border-radius:50%; background:var(--leaf); color:white; display:grid; place-items:center; font-weight:900; }}
    h2 {{ margin:.1em 0 .25em; }}
    .muted {{ color:var(--muted); }}
    .routes {{ display:flex; flex-wrap:wrap; gap:8px; margin:10px 0; }}
    .routes span {{ background:rgba(49,90,64,.12); color:var(--leaf); border:1px solid rgba(49,90,64,.18); border-radius:999px; padding:6px 10px; font-size:.78rem; font-weight:900; }}
    code {{ display:block; background:rgba(48,38,29,.08); padding:10px; border-radius:13px; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
<main>
  <div class="status">{esc(payload.get('status'))}</div>
  <h1>Idea Output Router</h1>
  <p class="deck">{esc(payload.get('plainEnglish'))}</p>
  <p class="deck"><b>Next:</b> {esc(payload.get('nextSafestAction'))}</p>
  <section class="stats">
    <div class="stat"><span>Rows</span><strong>{counts.get('routerRows', 0)}</strong></div>
    <div class="stat"><span>Book</span><strong>{counts.get('bookRoutes', 0)}</strong></div>
    <div class="stat"><span>Articles</span><strong>{counts.get('articleRoutes', 0)}</strong></div>
    <div class="stat"><span>Social</span><strong>{counts.get('socialRoutes', 0)}</strong></div>
    <div class="stat"><span>Research</span><strong>{counts.get('researchRoutes', 0)}</strong></div>
    <div class="stat"><span>Podcast</span><strong>{counts.get('podcastRoutes', 0)}</strong></div>
  </section>
  {''.join(rows_html)}
</main>
</body>
</html>
"""


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["rank", "title", "readiness", "recommendedMove", "primaryRoute", "routes", "sourceTrail", "openCommand"])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "rank": row.get("rank"),
                "title": row.get("title"),
                "readiness": row.get("readiness"),
                "recommendedMove": row.get("recommendedMove"),
                "primaryRoute": row.get("primaryRoute"),
                "routes": "; ".join(row.get("routes") or []),
                "sourceTrail": row.get("sourceTrail"),
                "openCommand": row.get("openCommand"),
            })


def main() -> int:
    nest_root = Path(sys.argv[1]) if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else DEFAULT_NEST_ROOT
    limit = 12
    for arg in sys.argv[2:]:
        if arg.startswith("--limit="):
            limit = int(arg.split("=", 1)[1])
    payload = build_payload(nest_root, limit)
    out_dir = nest_root / "IdeaOutputRouters" / stamp()
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "nest-idea-output-router.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-idea-output-router.md"
    csv_path = out_dir / "idea-output-router.csv"
    payload.update({
        "sessionDir": str(out_dir),
        "jsonPath": str(json_path),
        "htmlPath": str(html_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "firstSafeAction": {
            "label": "Open Nest idea output router",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local idea/output routing evidence only. No source, canon, publication, upload, schedule, account, approval, overwrite, delete, or receipt mutation.",
        },
    })
    write_json(json_path, payload)
    html_path.write_text(render_html(payload), encoding="utf-8")
    markdown_path.write_text(render_markdown(payload), encoding="utf-8")
    write_csv(csv_path, payload.get("rows") or [])
    pointer = {
        "schema": "quipsly.nest.idea-output-router.pointer.v1",
        "updatedAt": payload["generatedAt"],
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "nextSafestAction": payload["nextSafestAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "firstSafeAction": payload["firstSafeAction"],
        "truth": payload["truth"],
    }
    write_json(nest_root / LATEST_POINTER, pointer)
    print(json.dumps({
        "status": payload["status"],
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "csvPath": str(csv_path),
        "counts": payload["counts"],
        "sourceFilesMutated": False,
        "canonicalManuscriptReplaced": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
