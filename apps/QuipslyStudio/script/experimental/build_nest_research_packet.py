#!/usr/bin/env python3
"""Build a standalone Nest research packet from the writing source packet.

This is a read-model: it routes attention to source-backed research work without
mutating sources, drafts, manuscripts, approval state, or publication receipts.
"""
from __future__ import annotations

import csv
import html
import json
import shlex
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.nest-writing.research-packet.v1"
DEFAULT_NEST_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/NestWriting")
SOURCE_PACKET_POINTER = "latest-nest-writing-source-packet.json"
LATEST_POINTER = "latest-nest-research-packet.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def e(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def safe_int(value: Any) -> int:
    try:
        return int(float(value or 0))
    except (TypeError, ValueError):
        return 0


def safe_float(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def string_list(value: Any) -> list[str]:
    return [str(v).strip() for v in as_list(value) if str(v).strip()]


def first_string(*values: Any) -> str:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and value.strip():
            return value.strip()
        if not isinstance(value, (dict, list, tuple)) and str(value).strip():
            return str(value).strip()
    return ""


def source_path_for(item: dict[str, Any], root: Path) -> str:
    raw = first_string(
        item.get("sourcePath"),
        item.get("path"),
        item.get("absolutePath"),
        item.get("filePath"),
    )
    if raw:
        return raw
    rel = first_string(item.get("relativePath"), item.get("documentPath"), item.get("sourceRelativePath"))
    if rel:
        return str((root / rel).resolve())
    return ""


def open_command(path: str, fallback: Path) -> str:
    target = path if path else str(fallback)
    return "open " + shlex.quote(target)


def infer_title(item: dict[str, Any], index: int) -> str:
    title = first_string(item.get("title"), item.get("name"), item.get("documentTitle"), item.get("label"))
    if title:
        return title
    rel = first_string(item.get("relativePath"), item.get("path"), item.get("sourcePath"))
    if rel:
        return Path(rel).stem.replace("-", " ").replace("_", " ").strip().title()
    return f"Source {index + 1}"


def infer_workstream(item: dict[str, Any]) -> str:
    existing = first_string(item.get("workstream"), item.get("lane"), item.get("kind"), item.get("type"))
    if existing:
        return existing
    tags = " ".join(string_list(item.get("tags"))).lower()
    title = first_string(item.get("title"), item.get("name"), item.get("relativePath")).lower()
    blob = f"{tags} {title}"
    if "episode" in blob or "podcast" in blob:
        return "episode"
    if "chapter" in blob or "book" in blob or "manuscript" in blob:
        return "book"
    if "research" in blob or "source" in blob:
        return "research"
    if "article" in blob or "post" in blob:
        return "article"
    return "source"


def infer_research_question(item: dict[str, Any], workstream: str) -> str:
    title = infer_title(item, 0)
    lower = f"{workstream} {' '.join(string_list(item.get('tags')))} {title}".lower()
    if "episode" in lower or workstream == "episode":
        return "What context, claims, quotes, and unanswered questions should this episode page preserve?"
    if "book" in lower or "chapter" in lower or workstream == "book":
        return "What idea in the living manuscript needs source support, examples, tension, or clearer structure?"
    if "article" in lower or workstream == "article":
        return "What useful angle could become a source-backed article without flattening the author's voice?"
    if "research" in lower or workstream == "research":
        return "What can this source help us retrieve, compare, cite, or teach?"
    return "What does this source help us understand, cite, compare, or turn into useful creative work?"


def sample_for(item: dict[str, Any]) -> str:
    return first_string(
        item.get("sample"),
        item.get("excerpt"),
        item.get("description"),
        item.get("summary"),
        item.get("note"),
    )[:500]


def normalize_item(item: dict[str, Any], index: int, root: Path) -> dict[str, Any]:
    tags = string_list(item.get("tags"))
    workstream = infer_workstream(item)
    source_path = source_path_for(item, root)
    rel = first_string(item.get("relativePath"), item.get("documentPath"), item.get("sourceRelativePath"))
    if not rel and source_path:
        try:
            rel = str(Path(source_path).resolve().relative_to(root.resolve()))
        except Exception:
            rel = Path(source_path).name
    row_id = first_string(item.get("id"), item.get("sourceId"), item.get("documentId")) or f"source-{index + 1:03d}"
    word_count = safe_int(item.get("wordCount") or item.get("words") or item.get("sourceWords"))
    status = first_string(item.get("status"), item.get("state")) or "source-visible"
    return {
        "id": row_id,
        "rank": index + 1,
        "title": infer_title(item, index),
        "relativePath": rel,
        "sourcePath": source_path,
        "sourceExists": bool(source_path and Path(source_path).exists()),
        "wordCount": word_count,
        "tags": tags,
        "workstream": workstream,
        "status": status,
        "sample": sample_for(item),
        "researchQuestion": infer_research_question(item, workstream),
        "safeNextAction": "Extract claims, open questions, useful quotes, and source notes; do not mutate the source file.",
        "openCommand": open_command(source_path, root),
        "safety": "Read-only research routing. Originals and canonical manuscript stay untouched.",
    }


def load_packet(root: Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    pointer = load_json(root / SOURCE_PACKET_POINTER)
    packet_path = first_string(pointer.get("packetPath"), pointer.get("path"), pointer.get("jsonPath"))
    packet = load_json(Path(packet_path)) if packet_path else {}
    workbench_path = first_string(
        pointer.get("workbenchJsonPath"),
        packet.get("workbenchJsonPath"),
        pointer.get("workbenchPath"),
    )
    workbench = load_json(Path(workbench_path)) if workbench_path else packet.get("workbench") or pointer.get("workbench") or {}
    return pointer, packet, workbench


def build_rows(root: Path, packet: dict[str, Any], pointer: dict[str, Any]) -> list[dict[str, Any]]:
    raw_items = packet.get("items") or packet.get("sourceItems") or packet.get("documents") or pointer.get("items") or []
    rows = []
    for index, item in enumerate(as_list(raw_items)):
        if isinstance(item, dict):
            rows.append(normalize_item(item, index, root))
    rows.sort(key=lambda row: ("research" not in [t.lower() for t in row["tags"]], -row["wordCount"], row["title"]))
    return rows


def build_clusters(rows: list[dict[str, Any]], workbench: dict[str, Any]) -> dict[str, Any]:
    by_workstream: dict[str, dict[str, Any]] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["workstream"]].append(row)
    for key, group in sorted(grouped.items(), key=lambda kv: (-sum(r["wordCount"] for r in kv[1]), kv[0])):
        by_workstream[key] = {
            "label": key.replace("-", " ").title(),
            "sourceCount": len(group),
            "wordCount": sum(row["wordCount"] for row in group),
            "sourceIds": [row["id"] for row in group[:8]],
            "sampleTitles": [row["title"] for row in group[:4]],
            "recommendedUse": "Use this cluster to gather source notes before drafting or revising outputs.",
        }

    outline_groups = []
    for index, group in enumerate(as_list(workbench.get("outlineGroups") or workbench.get("outline") or [])):
        if not isinstance(group, dict):
            continue
        outline_groups.append({
            "id": first_string(group.get("id"), group.get("slug")) or f"outline-{index + 1:03d}",
            "label": first_string(group.get("label"), group.get("title"), group.get("name")) or f"Outline group {index + 1}",
            "wordCount": safe_int(group.get("wordCount") or group.get("words")),
            "sourceIds": string_list(group.get("sourceIds") or group.get("documentIds")),
            "recommendedUse": first_string(group.get("recommendedUse"), group.get("nextAction")) or "Turn this outline group into source notes before drafting.",
        })

    episode_groups = []
    for index, group in enumerate(as_list(workbench.get("episodeGroups") or workbench.get("episodes") or [])):
        if not isinstance(group, dict):
            continue
        episode_groups.append({
            "id": first_string(group.get("id"), group.get("episodeSlug"), group.get("slug")) or f"episode-{index + 1:03d}",
            "label": first_string(group.get("label"), group.get("title"), group.get("name")) or f"Episode group {index + 1}",
            "wordCount": safe_int(group.get("wordCount") or group.get("words")),
            "sourceIds": string_list(group.get("sourceIds") or group.get("documentIds")),
            "researchPrompt": "What context, callbacks, claims, and quotable moments should this episode keep attached?",
        })

    return {
        "workstreams": by_workstream,
        "outlineGroups": outline_groups[:12],
        "episodeGroups": episode_groups[:12],
    }


def build_research_queue(rows: list[dict[str, Any]], clusters: dict[str, Any], root: Path, pointer: dict[str, Any]) -> list[dict[str, Any]]:
    queue: list[dict[str, Any]] = []
    research_rows = [row for row in rows if "research" in [tag.lower() for tag in row["tags"]] or row["workstream"] == "research"]
    first = (research_rows or rows or [None])[0]
    if first:
        queue.append({
            "queueRank": len(queue) + 1,
            "kind": "source-note-pass",
            "label": f"Research-note {first['title']}",
            "why": "A visible source-backed starting point prevents the writing lane from becoming a black-box drafting lane.",
            "safeCommand": first["openCommand"],
            "humanDecision": "Mark useful claims, questions, quotes, and where the source should be used.",
            "codexCanDo": "Prepare source notes, comparison questions, and draft-adjacent packets without changing the source.",
            "nextSafestAction": first["safeNextAction"],
            "path": first.get("sourcePath") or str(root),
        })

    workstreams = list(clusters.get("workstreams", {}).values())
    if workstreams:
        largest = sorted(workstreams, key=lambda c: (-safe_int(c.get("wordCount")), c.get("label", "")))[0]
        queue.append({
            "queueRank": len(queue) + 1,
            "kind": "cluster-review",
            "label": f"Review {largest['label']} source cluster",
            "why": "The largest source cluster is likely carrying the most manuscript or episode gravity.",
            "safeCommand": "open " + shlex.quote(str(root)),
            "humanDecision": "Decide which sources in this cluster are ready for drafting, need cleanup, or need more evidence.",
            "codexCanDo": "Summarize the cluster and propose source-note tasks with citations back to files.",
            "nextSafestAction": largest.get("recommendedUse"),
            "path": str(root),
        })

    episode_groups = clusters.get("episodeGroups") or []
    if episode_groups:
        episode = episode_groups[0]
        queue.append({
            "queueRank": len(queue) + 1,
            "kind": "episode-research-pass",
            "label": f"Attach research notes to {episode['label']}",
            "why": "Episode pages and podcast notes need source/context packets before publishing polish.",
            "safeCommand": "open " + shlex.quote(str(root)),
            "humanDecision": "Confirm what context belongs on the episode page and what stays private/internal.",
            "codexCanDo": "Prepare episode research prompts and platform metadata candidates without claiming approval.",
            "nextSafestAction": episode.get("researchPrompt"),
            "path": str(root),
        })

    for label, key in [("Open latest source packet", "packetPath"), ("Open source workbench", "workbenchHtmlPath")]:
        path = first_string(pointer.get(key))
        if path:
            queue.append({
                "queueRank": len(queue) + 1,
                "kind": "open-existing-artifact",
                "label": label,
                "why": "Use the existing source truth before making any draft or research assumption.",
                "safeCommand": open_command(path, root),
                "humanDecision": "Use this as source context, not canonical approval.",
                "codexCanDo": "Read and route the artifact into research tasks.",
                "nextSafestAction": "Open, inspect, and decide what source trail is missing.",
                "path": path,
            })

    return queue


def build_prompts() -> list[dict[str, str]]:
    return [
        {
            "label": "Claims to preserve",
            "prompt": "What factual claims, lived-experience claims, or conceptual claims should stay traceable to this source?",
        },
        {
            "label": "Questions raised",
            "prompt": "What open questions, counterexamples, tensions, or missing evidence does this source create?",
        },
        {
            "label": "Useful quotes and examples",
            "prompt": "What short quotations, examples, metaphors, or scenes might be worth bringing into a draft?",
        },
        {
            "label": "Where it belongs",
            "prompt": "Should this support a book chapter, podcast episode page, article, coaching exercise, social post, or private note?",
        },
        {
            "label": "Do not smooth over",
            "prompt": "What voice, uncertainty, contradiction, or rough edge should Quipsly preserve instead of normalizing?",
        },
    ]


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    fields = [
        "id",
        "title",
        "relativePath",
        "wordCount",
        "workstream",
        "tags",
        "status",
        "sourceExists",
        "researchQuestion",
        "safeNextAction",
        "sourcePath",
        "openCommand",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            out = dict(row)
            out["tags"] = ", ".join(row.get("tags") or [])
            writer.writerow({field: out.get(field, "") for field in fields})


def write_markdown(path: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Nest Research Packet",
        "",
        "This packet routes attention to source-backed research work. It is not canonical manuscript truth and it does not approve publication.",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: {value}")
    lines += ["", "## Start here", ""]
    for row in payload["researchStartQueue"]:
        lines += [
            f"### {row['queueRank']}. {row['label']}",
            f"- Why: {row['why']}",
            f"- Safe command: `{row['safeCommand']}`",
            f"- Human decision: {row['humanDecision']}",
            f"- Codex can do: {row['codexCanDo']}",
            f"- Next safest action: {row['nextSafestAction']}",
            "",
        ]
    lines += ["## Source note prompts", ""]
    for prompt in payload["sourceNotePrompts"]:
        lines.append(f"- {prompt['label']}: {prompt['prompt']}")
    lines += ["", "## Research rows", ""]
    for row in payload["researchRows"][:25]:
        tags = ", ".join(row.get("tags") or []) or "none"
        lines += [
            f"### {row['title']}",
            f"- Workstream: {row['workstream']}",
            f"- Words: {row['wordCount']}",
            f"- Tags: {tags}",
            f"- Question: {row['researchQuestion']}",
            f"- Safe command: `{row['openCommand']}`",
            "",
        ]
    lines += ["## Safety", ""]
    for key, value in payload["truth"].items():
        lines.append(f"- {key}: {value}")
    write_text(path, "\n".join(lines).rstrip() + "\n")


def write_html(path: Path, payload: dict[str, Any]) -> None:
    counts = payload["counts"]
    queue_html = "\n".join(
        f"""
        <article class=\"queue-card\">
          <div class=\"rank\">{e(row['queueRank'])}</div>
          <div>
            <h3>{e(row['label'])}</h3>
            <p>{e(row['why'])}</p>
            <code>{e(row['safeCommand'])}</code>
            <p><strong>Next:</strong> {e(row['nextSafestAction'])}</p>
          </div>
        </article>
        """
        for row in payload["researchStartQueue"]
    )
    prompts_html = "\n".join(
        f"<li><strong>{e(prompt['label'])}</strong><span>{e(prompt['prompt'])}</span></li>"
        for prompt in payload["sourceNotePrompts"]
    )
    rows_html = "\n".join(
        f"""
        <article class=\"source-row\">
          <div>
            <h3>{e(row['title'])}</h3>
            <p>{e(row['researchQuestion'])}</p>
            <small>{e(row['workstream'])} | {e(row['wordCount'])} words | {e(', '.join(row.get('tags') or []) or 'no tags')}</small>
          </div>
          <div class=\"truth {('ok' if row.get('sourceExists') else 'warn')}\">{('source visible' if row.get('sourceExists') else 'source path needs review')}</div>
          <code>{e(row['openCommand'])}</code>
        </article>
        """
        for row in payload["researchRows"][:40]
    )
    workstream_html = "\n".join(
        f"""
        <article class=\"cluster\">
          <h3>{e(cluster['label'])}</h3>
          <div>{e(cluster['sourceCount'])} sources | {e(cluster['wordCount'])} words</div>
          <p>{e(cluster['recommendedUse'])}</p>
        </article>
        """
        for cluster in payload["clusters"].get("workstreams", {}).values()
    )
    html_text = f"""<!doctype html>
<html lang=\"en\">
<head>
<meta charset=\"utf-8\" />
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
<title>Nest Research Packet</title>
<style>
:root {{
  --soil:#342819; --bark:#5b4630; --moss:#476947; --leaf:#7fa36c;
  --cream:#fff8e9; --paper:#fffdf5; --gold:#c79635; --ink:#241b13;
  --warn:#b6652f; --ok:#2e7d4f;
}}
* {{ box-sizing:border-box; }}
body {{ margin:0; font-family: ui-serif, Georgia, serif; background:linear-gradient(135deg,#fff8e9,#edf4df); color:var(--ink); }}
main {{ max-width:1180px; margin:0 auto; padding:32px 20px 64px; }}
.hero {{ border:1px solid rgba(91,70,48,.22); border-radius:28px; padding:30px; background:rgba(255,253,245,.88); box-shadow:0 20px 60px rgba(52,40,25,.12); }}
.kicker {{ color:var(--gold); letter-spacing:.24em; font:800 12px ui-sans-serif, system-ui; text-transform:uppercase; }}
h1 {{ margin:.4rem 0; font-size:clamp(36px,6vw,72px); line-height:.9; }}
section {{ margin-top:28px; }}
.metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-top:20px; }}
.metric {{ background:#f4ecd7; border:1px solid rgba(91,70,48,.16); border-radius:18px; padding:14px; }}
.metric strong {{ display:block; font:900 26px ui-sans-serif, system-ui; color:var(--moss); }}
.metric span {{ font:800 11px ui-sans-serif, system-ui; letter-spacing:.1em; text-transform:uppercase; color:var(--bark); }}
.queue-card,.source-row,.cluster {{ display:grid; gap:12px; padding:16px; border-radius:20px; background:rgba(255,253,245,.88); border:1px solid rgba(91,70,48,.18); margin:10px 0; }}
.queue-card {{ grid-template-columns:44px 1fr; }}
.rank {{ width:38px; height:38px; display:grid; place-items:center; border-radius:999px; background:var(--moss); color:white; font:900 16px ui-sans-serif, system-ui; }}
.source-row {{ grid-template-columns:1fr auto; align-items:start; }}
h2 {{ font:900 26px ui-sans-serif, system-ui; color:var(--soil); margin:0 0 10px; }}
h3 {{ margin:0 0 6px; }}
p {{ color:#6d5a45; line-height:1.5; }}
code {{ display:block; padding:8px 10px; border-radius:12px; background:#21180f; color:#f6e2ad; overflow:auto; font-size:12px; }}
ul.prompts {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; padding:0; list-style:none; }}
ul.prompts li {{ background:#f7efd8; border-radius:18px; padding:14px; border:1px solid rgba(91,70,48,.14); }}
ul.prompts strong {{ display:block; margin-bottom:6px; color:var(--moss); }}
ul.prompts span {{ color:#695842; }}
.grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }}
.truth {{ font:900 11px ui-sans-serif, system-ui; letter-spacing:.08em; text-transform:uppercase; padding:8px 10px; border-radius:999px; white-space:nowrap; }}
.truth.ok {{ background:#dff1de; color:var(--ok); }}
.truth.warn {{ background:#ffe2c5; color:var(--warn); }}
.notice {{ padding:14px; border-radius:18px; background:#e9f2dd; border:1px solid rgba(71,105,71,.22); font-weight:700; color:var(--moss); }}
</style>
</head>
<body>
<main>
  <header class=\"hero\">
    <div class=\"kicker\">Quipsly Nest Research</div>
    <h1>Source trails before smooth drafts.</h1>
    <p>This packet helps humans and agents retrieve, compare, cite, and prepare research. It does not mutate sources, replace the manuscript, approve publication, or create receipt truth.</p>
    <div class=\"metrics\">
      <div class=\"metric\"><strong>{e(counts.get('sourceDocuments'))}</strong><span>sources</span></div>
      <div class=\"metric\"><strong>{e(counts.get('sourceWords'))}</strong><span>words</span></div>
      <div class=\"metric\"><strong>{e(counts.get('researchRows'))}</strong><span>research rows</span></div>
      <div class=\"metric\"><strong>{e(counts.get('startQueueRows'))}</strong><span>start actions</span></div>
    </div>
  </header>
  <section>
    <h2>Start here</h2>
    <div class=\"notice\">These are safe, reversible next actions. They route attention; they are not verdicts.</div>
    {queue_html}
  </section>
  <section>
    <h2>Source note prompts</h2>
    <ul class=\"prompts\">{prompts_html}</ul>
  </section>
  <section>
    <h2>Research clusters</h2>
    <div class=\"grid\">{workstream_html}</div>
  </section>
  <section>
    <h2>Research/source rows</h2>
    {rows_html}
  </section>
</main>
</body>
</html>
"""
    write_text(path, html_text)


def build_payload(root: Path) -> tuple[dict[str, Any], dict[str, Path]]:
    pointer, packet, workbench = load_packet(root)
    rows = build_rows(root, packet, pointer)
    clusters = build_clusters(rows, workbench)
    queue = build_research_queue(rows, clusters, root, pointer)
    tags = Counter(tag.lower() for row in rows for tag in row.get("tags", []))
    counts = {
        "sourceDocuments": len(rows),
        "sourceWords": sum(row["wordCount"] for row in rows),
        "researchTaggedSources": tags.get("research", 0),
        "researchRows": len(rows),
        "sourcesVisible": sum(1 for row in rows if row.get("sourceExists")),
        "sourcePathNeedsReview": sum(1 for row in rows if not row.get("sourceExists")),
        "workstreams": len(clusters.get("workstreams", {})),
        "outlineGroups": len(clusters.get("outlineGroups") or []),
        "episodeGroups": len(clusters.get("episodeGroups") or []),
        "startQueueRows": len(queue),
    }
    status = "research-packet-ready" if rows else "research-packet-needs-source-packet"
    payload = {
        "schema": SCHEMA,
        "updatedAt": iso_now(),
        "status": status,
        "root": str(root),
        "sourcePacketPointerPath": str(root / SOURCE_PACKET_POINTER),
        "sourcePacketPath": first_string(pointer.get("packetPath"), pointer.get("path"), pointer.get("jsonPath")),
        "sourceWorkbenchPath": first_string(pointer.get("workbenchHtmlPath"), pointer.get("workbenchJsonPath")),
        "counts": counts,
        "researchStartQueue": queue,
        "sourceNotePrompts": build_prompts(),
        "clusters": clusters,
        "researchRows": rows,
        "nextSafestAction": queue[0]["nextSafestAction"] if queue else "Run nest-writing-source-packet first, then rebuild the research packet.",
        "humanAsk": "Use this packet to decide what sources need notes, quotes, questions, or source trails before drafting or publishing.",
        "agentSafeParallelWork": [
            "Prepare source-note summaries that cite file paths and source rows.",
            "Find related sources by tags, workstream, and outline group.",
            "Propose article, episode, or chapter packets without changing canonical text.",
            "Create draft-adjacent research scaffolds that stay clearly marked as suggestions.",
        ],
        "truth": {
            "sourceFilesMutated": False,
            "canonicalManuscriptReplaced": False,
            "draftsApproved": False,
            "externalPublishing": False,
            "externalSchedulesCreated": False,
            "receiptTruthCreated": False,
            "accountMutation": False,
            "blackBoxWritingRequired": False,
        },
    }
    out_dir = root / "ResearchPackets" / f"{stamp()}-nest-research-packet"
    paths = {
        "outputDir": out_dir,
        "jsonPath": out_dir / "nest-research-packet.json",
        "markdownPath": out_dir / "START-HERE-nest-research-packet.md",
        "csvPath": out_dir / "nest-research-packet.csv",
        "htmlPath": out_dir / "index.html",
        "latestPointerPath": root / LATEST_POINTER,
    }
    payload.update({key: str(path) for key, path in paths.items() if key != "latestPointerPath"})
    return payload, paths


def main(argv: list[str]) -> int:
    root = Path(argv[1]).expanduser() if len(argv) > 1 and argv[1] else DEFAULT_NEST_ROOT
    root.mkdir(parents=True, exist_ok=True)
    payload, paths = build_payload(root)
    write_json(paths["jsonPath"], payload)
    write_markdown(paths["markdownPath"], payload)
    write_csv(paths["csvPath"], payload["researchRows"])
    write_html(paths["htmlPath"], payload)
    pointer = {
        "schema": SCHEMA + ".pointer",
        "updatedAt": payload["updatedAt"],
        "status": payload["status"],
        "root": str(root),
        "packetPath": str(paths["jsonPath"]),
        "markdownPath": str(paths["markdownPath"]),
        "csvPath": str(paths["csvPath"]),
        "htmlPath": str(paths["htmlPath"]),
        "counts": payload["counts"],
        "researchStartQueue": payload["researchStartQueue"],
        "firstSafeAction": payload["researchStartQueue"][0] if payload["researchStartQueue"] else None,
        "nextSafestAction": payload["nextSafestAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": " ".join(payload["agentSafeParallelWork"]),
        "agentSafeParallelWorkItems": payload["agentSafeParallelWork"],
        "truth": payload["truth"],
    }
    write_json(paths["latestPointerPath"], pointer)
    print(json.dumps(pointer, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
