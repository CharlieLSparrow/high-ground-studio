#!/usr/bin/env python3
"""Build a non-mutating 360 import/proxy/reframe workflow packet."""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_ROOTS = [Path("/Volumes/My Passport/Insta360"), Path("/Volumes/My Passport/Insta360 Download")]
DEFAULT_OUTPUT_ROOT = Path("/Volumes/My Passport/Quipsly Media Workspace/Studio360")
MEDIA_EXTENSIONS = {".insv", ".insp", ".mp4", ".mov", ".lrv"}


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def run_command(args: list[str], timeout: int = 20) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(args, check=False, capture_output=True, text=True, timeout=timeout)
        return completed.returncode, completed.stdout, completed.stderr
    except Exception as exc:
        return 99, "", str(exc)


def media_group_key(path: Path) -> str:
    stem = path.stem
    match = re.search(r"(VID|LRV|IMG)_(\d{8})_(\d{6})", stem)
    if match:
        return f"{match.group(2)}-{match.group(3)}"
    parent = path.parent.name.replace("-Original", "")
    if parent in {"Insta360", "Insta360 Download"}:
        return stem
    if parent:
        return parent
    return stem


def discover_assets(roots: list[Path], limit: int) -> list[Path]:
    assets: list[Path] = []
    for root in roots:
        if not root.exists():
            continue
        for current_root, dirs, files in os.walk(root):
            dirs[:] = [d for d in dirs if d not in {".Spotlight-V100", ".Trashes", ".fseventsd"}]
            for filename in sorted(files):
                path = Path(current_root) / filename
                if path.suffix.lower() in MEDIA_EXTENSIONS:
                    assets.append(path)
                    if limit > 0 and len(assets) >= limit:
                        return assets
    return assets


def ffprobe(path: Path) -> dict[str, Any]:
    if path.suffix.lower() == ".insp":
        return {}
    code, stdout, stderr = run_command([
        "ffprobe",
        "-v", "error",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        str(path),
    ], timeout=25)
    if code != 0:
        return {"ffprobeError": stderr.strip() or "ffprobe failed"}
    try:
        payload = json.loads(stdout)
    except Exception:
        return {"ffprobeError": "ffprobe returned invalid JSON"}
    streams = payload.get("streams") or []
    video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    fmt = payload.get("format") or {}
    return {
        "durationSeconds": float(fmt.get("duration") or 0) if str(fmt.get("duration") or "").replace(".", "", 1).isdigit() else 0,
        "formatName": fmt.get("format_name") or "",
        "hasVideo": bool(video),
        "hasAudio": bool(audio),
        "width": video.get("width") if video else None,
        "height": video.get("height") if video else None,
        "videoCodec": video.get("codec_name") if video else "",
        "audioCodec": audio.get("codec_name") if audio else "",
    }


def classify_asset(path: Path) -> str:
    name = path.name.lower()
    ext = path.suffix.lower()
    if ext == ".insv":
        return "insta360-original-video"
    if ext == ".insp":
        return "insta360-original-photo"
    if ext == ".lrv":
        return "insta360-low-res-companion"
    if name.endswith("_proxy.mp4") or "proxy" in name:
        return "proxy"
    if ext in {".mp4", ".mov"}:
        return "video-export-or-source"
    return "media"


def build_items(assets: list[Path]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for index, path in enumerate(assets, start=1):
        stat = path.stat()
        probe = ffprobe(path)
        item = {
            "index": index,
            "id": f"asset-{index:04d}",
            "filename": path.name,
            "sourcePath": str(path),
            "parent": str(path.parent),
            "extension": path.suffix.lower(),
            "kind": classify_asset(path),
            "groupKey": media_group_key(path),
            "bytes": stat.st_size,
            "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "probe": probe,
            "review": {
                "status": "pending-route",
                "role": "source" if path.suffix.lower() in {".insv", ".insp"} else "companion-or-proxy",
                "note": "",
            },
        }
        items.append(item)
    return items


def build_groups(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        grouped.setdefault(item["groupKey"], []).append(item)
    groups: list[dict[str, Any]] = []
    for index, (key, group_items) in enumerate(sorted(grouped.items()), start=1):
        kinds = sorted({item["kind"] for item in group_items})
        has_original = any(item["kind"].startswith("insta360-original") for item in group_items)
        has_proxy = any(item["kind"] == "proxy" for item in group_items)
        has_lrv = any(item["kind"] == "insta360-low-res-companion" for item in group_items)
        status = "proxy-ready" if has_proxy else "has-low-res-companion" if has_lrv else "needs-proxy" if has_original else "review-source"
        groups.append({
            "id": f"group-{index:04d}",
            "groupKey": key,
            "status": status,
            "assetCount": len(group_items),
            "kinds": kinds,
            "assets": [item["id"] for item in group_items],
            "nextSafestAction": "Use proxy for review/reframe." if has_proxy else "Generate proxy before editing/reframing." if has_original else "Classify this media before using it.",
        })
    return groups


def summarize(items: list[dict[str, Any]], groups: list[dict[str, Any]]) -> dict[str, Any]:
    counts_by_kind: dict[str, int] = {}
    for item in items:
        counts_by_kind[item["kind"]] = counts_by_kind.get(item["kind"], 0) + 1
    counts_by_status: dict[str, int] = {}
    for group in groups:
        counts_by_status[group["status"]] = counts_by_status.get(group["status"], 0) + 1
    return {
        "assets": len(items),
        "groups": len(groups),
        "countsByKind": dict(sorted(counts_by_kind.items())),
        "countsByGroupStatus": dict(sorted(counts_by_status.items())),
        "originalsMutated": False,
    }


def prepare_session(output_root: Path) -> Path:
    session_dir = output_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}-360-workflow"
    base = session_dir
    counter = 2
    while session_dir.exists():
        session_dir = Path(f"{base}-{counter}")
        counter += 1
    session_dir.mkdir(parents=True, exist_ok=False)
    return session_dir


def write_packet(session_dir: Path, roots: list[Path], output_root: Path, items: list[dict[str, Any]], groups: list[dict[str, Any]]) -> dict[str, Any]:
    packet = {
        "schema": "quipsly.360.workflow-packet.v1",
        "generatedAt": iso_now(),
        "sourceRoots": [str(root) for root in roots],
        "outputRoot": str(output_root),
        "sessionDir": str(session_dir),
        "truth": "360 import/proxy/reframe routing packet. Originals are untouched.",
        "safety": {
            "originalsMutated": False,
            "externalPublishing": False,
            "exportsCreated": False,
        },
        "counts": summarize(items, groups),
        "items": items,
        "groups": groups,
    }
    (session_dir / "360-workflow-packet.json").write_text(json.dumps(packet, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return packet


def write_markdown(session_dir: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    lines = [
        "# 360 workflow packet",
        "",
        f"Generated: {packet['generatedAt']}",
        "",
        "This packet routes Insta360-style sources into safe review/proxy/reframe work. It does not mutate originals.",
        "",
        "## Counts",
        "",
        f"- Assets: {counts['assets']}",
        f"- Groups: {counts['groups']}",
        f"- Originals mutated: {counts['originalsMutated']}",
        "",
        "## Group statuses",
        "",
    ]
    for status, count in counts["countsByGroupStatus"].items():
        lines.append(f"- {status}: {count}")
    lines.extend([
        "",
        "## Next safe actions",
        "",
        "- Generate missing proxies for `needs-proxy` groups.",
        "- Route `proxy-ready` groups into reframing/keyframe review.",
        "- Keep `.insv` and `.insp` originals whole.",
        "- Export 16:9 and 9:16 derivatives only from approved metadata.",
    ])
    (session_dir / "START-HERE-360-workflow.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(session_dir: Path, packet: dict[str, Any]) -> None:
    cards = []
    items_by_id = {item["id"]: item for item in packet["items"]}
    for group in packet["groups"][:240]:
        assets = [items_by_id[item_id] for item_id in group["assets"] if item_id in items_by_id]
        rows = []
        for asset in assets:
            probe = asset.get("probe") or {}
            duration = probe.get("durationSeconds") or 0
            rows.append(f"<li>{html.escape(asset['filename'])} <span>{html.escape(asset['kind'])} · {duration:.1f}s</span></li>")
        cards.append(f"""
        <article class="{html.escape(group['status'])}">
          <div class="status">{html.escape(group['status'])}</div>
          <h2>{html.escape(group['groupKey'])}</h2>
          <p>{html.escape(group['nextSafestAction'])}</p>
          <ul>{''.join(rows)}</ul>
        </article>
        """)
    counts = packet["counts"]
    html_text = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quipsly 360 Workflow</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101719; --panel:#172427; --ink:#f4f0df; --muted:#b8c0ad; --cyan:#78c9d8; --gold:#e6c35c; --clay:#c87957; --line:rgba(244,240,223,.15); }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; color:var(--ink); background:radial-gradient(circle at top, rgba(120,201,216,.18), transparent 38%), var(--bg); }}
    header {{ padding:34px clamp(20px,5vw,72px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--cyan); letter-spacing:.22em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ font-size:clamp(36px,6vw,78px); line-height:.92; margin:10px 0; }}
    header p {{ color:var(--muted); max-width:880px; line-height:1.5; }}
    .stats {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:18px; }}
    .stats span {{ border:1px solid var(--line); border-radius:999px; padding:8px 12px; background:rgba(0,0,0,.18); }}
    main {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(320px,1fr)); gap:16px; padding:24px clamp(16px,4vw,56px) 64px; }}
    article {{ border:1px solid var(--line); border-radius:22px; padding:18px; background:linear-gradient(180deg,var(--panel),#11191b); }}
    article.proxy-ready {{ border-color:rgba(120,201,216,.5); }}
    article.needs-proxy {{ border-color:rgba(200,121,87,.55); }}
    article.has-low-res-companion {{ border-color:rgba(230,195,92,.45); }}
    .status {{ color:var(--gold); text-transform:uppercase; letter-spacing:.12em; font-size:11px; font-weight:900; }}
    h2 {{ font-size:18px; margin:10px 0; overflow-wrap:anywhere; }}
    p, li span {{ color:var(--muted); }}
    ul {{ padding-left:18px; }}
    li {{ margin:8px 0; overflow-wrap:anywhere; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly 360</div>
    <h1>Whole spheres in, safe reframes out.</h1>
    <p>Insta360-style assets are grouped for proxy generation, reframe prep, and export routing. Originals stay whole; edits and crops live as metadata.</p>
    <div class="stats">
      <span>{counts['assets']} assets</span>
      <span>{counts['groups']} groups</span>
      <span>{counts['countsByGroupStatus'].get('needs-proxy', 0)} need proxy</span>
      <span>{counts['countsByGroupStatus'].get('proxy-ready', 0)} proxy ready</span>
    </div>
  </header>
  <main>{''.join(cards)}</main>
</body>
</html>
"""
    (session_dir / "index.html").write_text(html_text, encoding="utf-8")


def compact_asset_row(asset: dict[str, Any]) -> dict[str, Any]:
    probe = asset.get("probe") if isinstance(asset.get("probe"), dict) else {}
    return {
        "id": asset.get("id") or "",
        "filename": asset.get("filename") or "",
        "kind": asset.get("kind") or "",
        "sourcePath": asset.get("sourcePath") or "",
        "durationSeconds": round(float(probe.get("durationSeconds") or 0), 3),
        "hasVideo": bool(probe.get("hasVideo")),
        "hasAudio": bool(probe.get("hasAudio")),
        "width": probe.get("width"),
        "height": probe.get("height"),
        "ffprobeError": probe.get("ffprobeError") or "",
    }


def compact_group_row(group: dict[str, Any], items_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    assets = [
        compact_asset_row(items_by_id[item_id])
        for item_id in group.get("assets") or []
        if item_id in items_by_id
    ]
    status = str(group.get("status") or "")
    first_action = "Generate proxy" if status == "needs-proxy" else "Open reframe review" if status == "proxy-ready" else "Review companion/source"
    return {
        "groupId": group.get("id") or "",
        "groupKey": group.get("groupKey") or "",
        "status": status,
        "assetCount": group.get("assetCount") or len(assets),
        "kinds": group.get("kinds") or [],
        "assets": assets[:6],
        "firstAction": first_action,
        "nextSafestAction": group.get("nextSafestAction") or "",
        "truth": "Workflow row only. It does not transcode, move, delete, upload, publish, or mutate originals.",
    }


def workflow_priority(status: str) -> int:
    if status == "needs-proxy":
        return 10
    if status == "has-low-res-companion":
        return 20
    if status == "proxy-ready":
        return 30
    return 40


def build_start_queue(groups: list[dict[str, Any]], items_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [compact_group_row(group, items_by_id) for group in groups]
    rows.sort(key=lambda row: (workflow_priority(str(row.get("status") or "")), str(row.get("groupKey") or "")))
    return rows[:24]


def update_latest(output_root: Path, session_dir: Path, packet: dict[str, Any]) -> None:
    counts = packet["counts"]
    blocked = int((counts.get("countsByGroupStatus") or {}).get("needs-proxy") or 0)
    ready = int((counts.get("countsByGroupStatus") or {}).get("proxy-ready") or 0) + int((counts.get("countsByGroupStatus") or {}).get("has-low-res-companion") or 0)
    status = "needs-proxy-prep" if blocked else "review-ready" if ready else "needs-classification"
    next_safest_action = (
        "Open the workflow packet, create managed proxies for needs-proxy groups, and keep originals untouched."
        if blocked
        else "Open the workflow packet, route proxy-ready and companion-backed groups into reframe review."
        if ready
        else "Open the workflow packet and classify source groups before proxy or reframe work."
    )
    items_by_id = {
        str(item.get("id")): item
        for item in packet.get("items") or []
        if isinstance(item, dict) and item.get("id")
    }
    group_rows = [compact_group_row(group, items_by_id) for group in packet.get("groups") or []]
    pointer = {
        "schema": "quipsly.360.latest-pointer.v1",
        "updatedAt": iso_now(),
        "latestSessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "packetPath": str(session_dir / "360-workflow-packet.json"),
        "jsonPath": str(session_dir / "360-workflow-packet.json"),
        "markdownPath": str(session_dir / "START-HERE-360-workflow.md"),
        "counts": packet["counts"],
        "status": status,
        "rows": group_rows,
        "groups": group_rows,
        "startHereQueue": build_start_queue(packet.get("groups") or [], items_by_id),
        "humanAsk": "Review the discovered 360 groups and decide which sources need proxy generation, repair evidence, parking, or reframe work.",
        "agentSafeParallelWork": "Codex may classify groups, improve workflow packets, and prepare safe proxy/reframe instructions. Do not transcode, delete, upload, publish, overwrite, mutate originals, or create receipts.",
        "truth": packet.get("truth") or "360 workflow pointer only. Originals are untouched.",
        "nextSafestAction": next_safest_action,
        "firstSafeAction": {
            "label": "Open 360 workflow packet",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Opens local 360 workflow evidence only. No media is moved, transcoded, deleted, uploaded, published, or mutated.",
        },
    }
    (output_root / "latest-360-workflow-packet.json").write_text(json.dumps(pointer, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a safe 360 workflow packet.")
    parser.add_argument("--roots", nargs="*", default=[str(root) for root in DEFAULT_ROOTS])
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--limit", type=int, default=220)
    args = parser.parse_args()
    roots = [Path(value).expanduser() for value in args.roots]
    output_root = Path(args.output_root).expanduser()
    if not any(root.exists() for root in roots):
        raise SystemExit("No 360 source roots exist: " + ", ".join(str(root) for root in roots))
    session_dir = prepare_session(output_root)
    assets = discover_assets(roots, args.limit)
    items = build_items(assets)
    groups = build_groups(items)
    packet = write_packet(session_dir, roots, output_root, items, groups)
    write_markdown(session_dir, packet)
    write_html(session_dir, packet)
    update_latest(output_root, session_dir, packet)
    print(json.dumps({
        "ok": True,
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "packetPath": str(session_dir / "360-workflow-packet.json"),
        "markdownPath": str(session_dir / "START-HERE-360-workflow.md"),
        "counts": packet["counts"],
        "originalsMutated": False,
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
