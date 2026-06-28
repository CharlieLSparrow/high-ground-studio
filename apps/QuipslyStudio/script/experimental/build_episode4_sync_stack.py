#!/usr/bin/env python3
"""Build a first-pass native Quipsly Studio sync-stack session for Episode 4.

This intentionally creates whole-source lanes with sync offsets and held lanes.
It does not chop media, copy originals, generate proxies, or claim final edit truth.
"""

from __future__ import annotations

import argparse
import html
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

APP_NAMESPACE = uuid.UUID("4c843490-4b67-4cd8-891b-000000000004")
SESSION_NAME = "episode-4-sync-stack-v1"
DEFAULT_ROOT = Path("/Volumes/My Passport/Episode 4")
DEFAULT_SESSION_DIR = Path.home() / "Library/Application Support/Quipsly/MediaVault/sessions"
DEFAULT_REPORT_DIR = Path("reports")
DEFAULT_VAULT_ROOT = Path.home() / "Library/Application Support/Quipsly/MediaVault"
DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
DEFAULT_HANDOFF_ROOT = DEFAULT_RELEASE_ROOT / "review-board" / "sync-stacks"
SCHEMA = "quipsly.studio.episode-sync-stack.v1"

FNV_OFFSET = 0xCBF29CE484222325
FNV_PRIME = 0x100000001B3
AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff", ".mp3", ".m4a", ".aac", ".flac"}


def stable_uuid(label: str) -> str:
    return str(uuid.uuid5(APP_NAMESPACE, label)).upper()


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def fnv1a64_hex(value: str) -> str:
    h = FNV_OFFSET
    for b in value.encode("utf-8"):
        h ^= b
        h = (h * FNV_PRIME) & 0xFFFFFFFFFFFFFFFF
    return f"{h:016x}"


def safe_filename(value: str) -> str:
    allowed = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._- "
    cleaned = "".join(ch if ch in allowed else "-" for ch in value)
    cleaned = cleaned.replace(" ", "_")
    while "__" in cleaned:
        cleaned = cleaned.replace("__", "_")
    return cleaned or "asset"


def file_uri(path: Path) -> str:
    # URL(fileURLWithPath:) encodes spaces as %20 in existing session payloads.
    return "file://" + quote(str(path), safe="/:")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def esc(value: object) -> str:
    return html.escape(str(value or ""))


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def expected_proxy_path(path: Path, vault_root: Path) -> Path:
    asset_id = fnv1a64_hex(str(path.resolve(strict=False)))
    ext = "m4a" if path.suffix.lower() in AUDIO_EXTENSIONS else "mp4"
    safe_base = safe_filename(path.stem or asset_id)
    return vault_root / "proxy" / asset_id / f"{safe_base}_proxy.{ext}"


def probe(path: Path) -> dict:
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        str(path),
    ]
    try:
        data = json.loads(subprocess.check_output(cmd, text=True, timeout=30, stderr=subprocess.STDOUT) or "{}")
    except Exception as exc:  # Keep a held lane possible even if probe fails.
        return {
            "path": str(path),
            "file": path.name,
            "exists": path.exists(),
            "duration": 0.0,
            "probeError": str(exc),
            "videoStreams": 0,
            "audioStreams": 0,
            "creationTime": "",
        }

    fmt = data.get("format") or {}
    streams = data.get("streams") or []
    video = [s for s in streams if s.get("codec_type") == "video"]
    audio = [s for s in streams if s.get("codec_type") == "audio"]
    tags = fmt.get("tags") or {}
    return {
        "path": str(path),
        "file": path.name,
        "exists": path.exists(),
        "sizeMB": round(path.stat().st_size / 1024 / 1024, 2) if path.exists() else 0,
        "duration": round(float(fmt.get("duration") or 0), 6),
        "videoStreams": len(video),
        "audioStreams": len(audio),
        "video": [
            {
                "codec": s.get("codec_name"),
                "width": s.get("width"),
                "height": s.get("height"),
                "rate": s.get("r_frame_rate"),
            }
            for s in video
        ],
        "audio": [
            {
                "codec": s.get("codec_name"),
                "sampleRate": s.get("sample_rate"),
                "channels": s.get("channels"),
            }
            for s in audio
        ],
        "creationTime": tags.get("creation_time") or "",
    }


def tag(tag_type: str, start: float, duration: float, label: str) -> dict:
    return {
        "id": stable_uuid(f"tag::{label}::{tag_type}::{start:.3f}::{duration:.3f}"),
        "type": tag_type,
        "startTime": max(0.0, round(start, 6)),
        "duration": max(0.0, round(duration, 6)),
    }


def lane(
    *,
    name: str,
    path: Path,
    role: str,
    media_kind: str,
    track_ids: list[str],
    duration: float,
    offset: float,
    vault_root: Path,
    is360: bool = False,
    proxy_path: Path | None = None,
    sidecar_path: Path | None = None,
    tag_type: str = "Cut",
    ignore: bool = False,
    label: str = "",
) -> dict:
    label = label or name
    source_id = stable_uuid(f"source::{path}")
    lane_id = stable_uuid(f"lane::{name}::{path}")
    expected_proxy = proxy_path or expected_proxy_path(path, vault_root)
    source_video = {
        "id": source_id,
        "mediaURL": file_uri(path),
        "duration": round(duration, 6),
        "offset": round(offset, 6),
        "is360": bool(is360),
    }
    if expected_proxy.exists():
        source_video["proxyURL"] = file_uri(expected_proxy)

    return {
        "id": lane_id,
        "name": name,
        "sourceVideo": source_video,
        "tags": [tag(tag_type, 0, duration, label)] if duration > 0 else [],
        "metadata": {
            "sourceAssetId": f"episode-4-{stable_uuid(str(path))[:8].lower()}",
            "mediaKind": media_kind,
            "role": role,
            "trackIds": track_ids,
            "sourcePath": str(path),
            "originalPath": str(path),
            "vaultProxyPath": str(expected_proxy),
            "sidecarPreviewPath": str(sidecar_path) if sidecar_path else None,
            "assetFingerprint": stable_uuid(f"asset::{path}").lower(),
            "declaredExists": path.exists(),
            "sourceLabel": label,
            "isPremiereRescue": False,
            "ignoreForProduction": bool(ignore),
        },
    }


def media_item(path: Path, vault_root: Path, proxy_path: Path | None = None) -> dict:
    item = {
        "id": stable_uuid(f"media::{path}"),
        "url": file_uri(path),
        "name": path.name,
    }
    expected_proxy = proxy_path or expected_proxy_path(path, vault_root)
    if expected_proxy.exists():
        item["proxyURL"] = file_uri(expected_proxy)
    return item


def render_handoff_markdown(payload: dict) -> str:
    lines = [
        "# Episode 4 native sync stack",
        "",
        f"Generated: `{payload['createdAt']}`",
        "",
        payload["truth"],
        "",
        "## What this is",
        "",
        "A local, proxy-first whole-source stack for Episode 4. It preserves source media and records candidate/held lanes as metadata.",
        "",
        "## Counts",
        "",
    ]
    for key, value in payload["counts"].items():
        lines.append(f"- {key}: `{value}`")
    lines.extend([
        "",
        "## Start here",
        "",
        "Review these rows first. They are sorted toward the safest useful production evidence: proxy-ready video lanes, then audio lanes, then a small held-media recovery sample.",
        "",
    ])
    for index, row in enumerate(payload["startHereQueue"], start=1):
        tracks = ", ".join(row.get("trackIds") or [])
        lines.extend([
            f"### {index}. {row.get('name')}",
            "",
            f"- Track(s): `{tracks}`",
            f"- Status: `{row.get('status')}`",
            f"- Role: `{row.get('role')}`",
            f"- Media: `{row.get('mediaKind')}`",
            f"- Offset: `{row.get('offset')}` seconds",
            f"- Duration: `{row.get('duration')}` seconds",
            f"- Source: `{row.get('sourcePath')}`",
            f"- Proxy: `{row.get('vaultProxyPath') or 'not attached'}`",
            f"- Next: {row.get('nextSafestAction')}",
            "",
        ])
    lines.extend([
        "",
        "## Candidate lanes",
        "",
    ])
    for lane_info in payload["candidateLanes"]:
        lines.append(
            f"- `{lane_info['trackIds']}` {lane_info['name']} — offset `{lane_info['offset']}`s, duration `{lane_info['duration']}`s, role `{lane_info['role']}`"
        )
    lines.extend([
        "",
        "## Held lanes",
        "",
    ])
    for lane_info in payload["heldLanes"]:
        lines.append(
            f"- `{lane_info['trackIds']}` {lane_info['name']} — {lane_info['label']}"
        )
    lines.extend([
        "",
        "## Sync assumptions",
        "",
    ])
    for item in payload["syncAssumptions"]:
        lines.append(f"- {item}")
    lines.extend([
        "",
        "## Open",
        "",
        f"- Session JSON: `{payload['sessionPath']}`",
        f"- Report JSON: `{payload['reportPath']}`",
        f"- Handoff HTML: `{payload['htmlPath']}`",
        "",
        "## Safety",
        "",
        "- This does not publish, upload, delete, overwrite previous versions, mutate sources, or create receipt truth.",
        "- Held lanes are visible recovery/context evidence, not deleted media.",
        "- SHOW/SKIP decisions still need review/edit work before any publication claim.",
    ])
    return "\n".join(lines).rstrip() + "\n"


def render_handoff_html(payload: dict) -> str:
    def path_line(label: str, value: object) -> str:
        if not value:
            return ""
        return f"""<p class="pathline"><span>{esc(label)}</span><code>{esc(value)}</code></p>"""

    def status_badge(item: dict) -> str:
        status = item.get("status") or sync_lane_status(item)
        if status == "held":
            label = "Held"
            css = "held"
        elif item.get("proxyReady"):
            label = "Proxy ready"
            css = "ready"
        else:
            label = "Needs proxy"
            css = "needs"
        return f"""<span class="badge {css}">{esc(label)}</span>"""

    def lane_card(item: dict, card_class: str, show_action: bool = True) -> str:
        tracks = ", ".join(item.get("trackIds") or [])
        action = item.get("nextSafestAction") or (
            "Keep visible as recovery/context evidence. Do not promote into production until a human confirms it belongs."
            if item.get("ignoreForProduction")
            else "Open this lane in the sync stack/source wall and compare timing against the spine before creating SHOW/SKIP decisions."
        )
        return f"""
        <article class="lane {card_class}">
          <div class="lane-head">
            <p class="eyebrow">{esc(tracks)} · {esc(item.get('role'))}</p>
            {status_badge(item)}
          </div>
          <h3>{esc(item.get('name'))}</h3>
          <p class="meta">Offset {esc(item.get('offset'))}s · duration {esc(item.get('duration'))}s · {esc(item.get('mediaKind'))}</p>
          <p>{esc(item.get('label'))}</p>
          {f'<p class="action"><b>Next:</b> {esc(action)}</p>' if show_action else ''}
          {path_line('source', item.get('sourcePath'))}
          {path_line('proxy', item.get('vaultProxyPath'))}
          {path_line('sidecar', item.get('sidecarPreviewPath'))}
        </article>
        """

    start_rows = "".join(
        f"""
        <article class="queue-row">
          <div class="queue-rank">{index}</div>
          {lane_card(item, 'queue', show_action=True)}
        </article>
        """
        for index, item in enumerate(payload.get("startHereQueue") or [], start=1)
    )
    candidate_cards = "".join(
        lane_card(compact_sync_lane(item), "candidate", show_action=False)
        for item in payload["candidateLanes"]
    )
    held_cards = "".join(
        lane_card(compact_sync_lane(item), "held", show_action=True)
        for item in payload["heldLanes"]
    )
    assumptions = "".join(f"<li>{esc(item)}</li>" for item in payload["syncAssumptions"])
    metrics = "".join(f"<div><b>{esc(value)}</b><span>{esc(key)}</span></div>" for key, value in payload["counts"].items())
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Episode 4 Sync Stack</title>
<style>
  :root {{ color-scheme:dark; --bg:#10150e; --panel:#1d2519; --panel2:#151b13; --ink:#f7f0d9; --muted:#b9ad8b; --gold:#ecc94f; --leaf:#6ed47f; --water:#7bcbd8; --clay:#d07155; --line:#394830; }}
  body {{ margin:0; color:var(--ink); background:radial-gradient(circle at 20% 0%,rgba(110,212,127,.16),transparent 34%),var(--bg); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
  main {{ max-width:1180px; margin:0 auto; padding:34px 24px 70px; }}
  header, section {{ border:1px solid var(--line); background:rgba(29,37,25,.93); border-radius:28px; padding:24px; margin-bottom:16px; box-shadow:0 18px 60px rgba(0,0,0,.22); }}
  .eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-size:12px; font-weight:900; margin:0 0 8px; }}
  h1 {{ font-size:clamp(38px,6vw,72px); line-height:.9; margin:0 0 12px; }}
  h2, h3 {{ margin:0 0 8px; }}
  p, li {{ color:var(--muted); line-height:1.45; }}
  .metrics {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; margin-top:18px; }}
  .metrics div {{ border:1px solid var(--line); background:var(--panel2); border-radius:18px; padding:12px; }}
  .metrics b {{ display:block; font-size:24px; color:var(--leaf); }}
  .metrics span {{ color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:12px; }}
  .queue {{ display:grid; gap:12px; }}
  .queue-row {{ display:grid; grid-template-columns:44px 1fr; gap:10px; align-items:start; }}
  .queue-rank {{ border:1px solid rgba(236,201,79,.45); background:rgba(236,201,79,.14); color:#ffe89a; border-radius:16px; min-height:44px; display:grid; place-items:center; font-size:18px; font-weight:900; }}
  .lane {{ border:1px solid var(--line); border-radius:18px; padding:14px; background:var(--panel2); }}
  .lane.queue {{ border-color:rgba(123,203,216,.5); background:linear-gradient(135deg,rgba(123,203,216,.12),rgba(21,27,19,.96)); }}
  .lane.candidate {{ border-color:rgba(110,212,127,.48); }}
  .lane.held {{ border-color:rgba(208,113,85,.62); }}
  .lane-head {{ display:flex; gap:8px; align-items:flex-start; justify-content:space-between; }}
  .badge {{ display:inline-flex; align-items:center; border-radius:999px; padding:5px 8px; font-size:11px; font-weight:900; text-transform:uppercase; letter-spacing:.08em; white-space:nowrap; }}
  .badge.ready {{ color:#b9ffd0; background:rgba(110,212,127,.15); border:1px solid rgba(110,212,127,.35); }}
  .badge.needs {{ color:#ffe89a; background:rgba(236,201,79,.12); border:1px solid rgba(236,201,79,.35); }}
  .badge.held {{ color:#ffc3b7; background:rgba(208,113,85,.15); border:1px solid rgba(208,113,85,.42); }}
  .meta {{ color:#dfd4b4; }}
  .action {{ border-left:3px solid var(--water); padding-left:10px; }}
  .pathline {{ margin:.45rem 0 0; font-size:12px; }}
  .pathline span {{ display:inline-block; min-width:58px; color:var(--water); text-transform:uppercase; letter-spacing:.08em; font-weight:900; }}
  code {{ color:#ffe89a; overflow-wrap:anywhere; }}
</style>
</head>
<body><main>
<header>
  <p class="eyebrow">Quipsly Studio · Episode 4</p>
  <h1>Whole-source sync stack, not chopped clips.</h1>
  <p>Generated {esc(payload['createdAt'])}. This is local metadata evidence for Episode 4: candidate sources stay intact, questionable sources stay held and visible, and original media is untouched.</p>
  <p>{esc(payload['truth'])}</p>
  <div class="metrics">{metrics}</div>
</header>
<section><h2>Start here: human review queue</h2><p>These are the safest rows to inspect first. Green proxy-ready lanes can be reviewed now. Held rows stay visible so nothing disappears, but they are not production candidates until a human confirms them.</p><div class="queue">{start_rows}</div></section>
<section><h2>Candidate lanes</h2><div class="grid">{candidate_cards}</div></section>
<section><h2>Held/questionable lanes</h2><div class="grid">{held_cards}</div></section>
<section><h2>Sync assumptions</h2><ul>{assumptions}</ul></section>
<section>
  <h2>Open evidence</h2>
  <p>Session JSON: <code>{esc(payload['sessionPath'])}</code></p>
  <p>Report JSON: <code>{esc(payload['reportPath'])}</code></p>
  <p>Markdown: <code>{esc(payload['markdownPath'])}</code></p>
</section>
</main></body></html>"""


def sync_lane_status(lane_info: dict) -> str:
    if lane_info.get("ignoreForProduction"):
        return "held"
    if lane_info.get("proxyReady"):
        return "candidate-proxy-ready"
    return "candidate-needs-proxy"


def compact_sync_lane(lane_info: dict) -> dict:
    status = sync_lane_status(lane_info)
    next_action = {
        "candidate-proxy-ready": "Open this lane in the sync stack/source wall and compare timing against the spine before creating SHOW/SKIP decisions.",
        "candidate-needs-proxy": "Generate or attach a safe proxy before relying on this lane for production playback.",
        "held": "Keep visible as recovery/context evidence. Do not promote into production until a human confirms it belongs.",
    }.get(status, "Open local evidence and choose the next reversible action.")
    return {
        "name": lane_info.get("name") or "",
        "role": lane_info.get("role") or "",
        "mediaKind": lane_info.get("mediaKind") or "",
        "trackIds": lane_info.get("trackIds") or [],
        "offset": lane_info.get("offset") or 0,
        "duration": lane_info.get("duration") or 0,
        "status": status,
        "proxyReady": bool(lane_info.get("proxyReady")),
        "proxyURL": lane_info.get("proxyURL") or "",
        "sourcePath": lane_info.get("sourcePath") or "",
        "vaultProxyPath": lane_info.get("vaultProxyPath") or "",
        "sidecarPreviewPath": lane_info.get("sidecarPreviewPath") or "",
        "ignoreForProduction": bool(lane_info.get("ignoreForProduction")),
        "label": lane_info.get("label") or "",
        "nextSafestAction": next_action,
        "truth": "Sync lane row only. It does not mutate source media, create edits, export, publish, upload, schedule, delete, or create receipt truth.",
    }


def build_sync_start_queue(candidate_lanes: list[dict], held_lanes: list[dict]) -> list[dict]:
    candidate_rows = [compact_sync_lane(item) for item in candidate_lanes]
    held_rows = [compact_sync_lane(item) for item in held_lanes]
    videos = [row for row in candidate_rows if row.get("mediaKind") == "video"]
    audio = [row for row in candidate_rows if row.get("mediaKind") == "audio"]
    held = held_rows[:4]
    return (videos[:6] + audio[:3] + held)[:12]


def write_handoff(report: dict, session_path: Path, report_path: Path, handoff_root: Path) -> dict:
    session_dir = handoff_root / f"{stamp()}-episode-04-sync-stack"
    session_dir.mkdir(parents=True, exist_ok=False)
    html_path = session_dir / "index.html"
    json_path = session_dir / "episode-04-sync-stack.json"
    markdown_path = session_dir / "START-HERE-episode-04-sync-stack.md"
    candidate_lanes = [item for item in report["lanes"] if not item.get("ignoreForProduction")]
    held_lanes = [item for item in report["lanes"] if item.get("ignoreForProduction")]
    candidate_rows = [compact_sync_lane(item) for item in candidate_lanes]
    held_rows = [compact_sync_lane(item) for item in held_lanes]
    start_here_queue = build_sync_start_queue(candidate_lanes, held_lanes)
    payload = {
        "schema": SCHEMA,
        "status": "episode-sync-stack-ready",
        "episode": 4,
        "title": "Episode 4 native sync stack",
        "createdAt": report["createdAt"],
        "sourceRoot": report["sourceRoot"],
        "sessionPath": str(session_path),
        "reportPath": str(report_path),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "counts": report["counts"],
        "syncAssumptions": report["syncAssumptions"],
        "candidateLanes": candidate_lanes,
        "heldLanes": held_lanes,
        "rows": candidate_rows + held_rows,
        "candidateRows": candidate_rows,
        "heldRows": held_rows,
        "startHereQueue": start_here_queue,
        "truth": report["truth"],
        "humanAsk": "Open this stack to verify Episode 4 candidate lanes and held/questionable media before edit decisions or publication review.",
        "agentSafeParallelWork": "Codex may inspect this local stack, improve metadata, create review packets, and prepare versioned follow-up stacks. Do not mutate source media or create publication receipts.",
        "nextSafestAction": "Open the Episode 4 sync stack handoff, confirm the candidate/held lanes, then continue with sync-control evidence before any edit/export/publishing decision.",
        "firstSafeAction": {
            "label": "Open Episode 4 native sync stack",
            "command": f"open {shell_quote(str(html_path))}",
            "path": str(html_path),
            "safety": "Opens local stack evidence only. No publish/upload/schedule/delete/overwrite/source mutation/receipt action.",
        },
        "explicitNonClaims": [
            "Not a final edit.",
            "Not publication approval.",
            "Not external publishing or receipt truth.",
            "Not a destructive media operation.",
        ],
    }
    html_path.write_text(render_handoff_html(payload), encoding="utf-8")
    markdown_path.write_text(render_handoff_markdown(payload), encoding="utf-8")
    write_json(json_path, payload)
    pointer_payload = {
        "schema": "quipsly.studio.episode-sync-stack.latest-pointer.v1",
        "generatedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "status": payload["status"],
        "episode": payload["episode"],
        "title": payload["title"],
        "htmlPath": payload["htmlPath"],
        "jsonPath": payload["jsonPath"],
        "markdownPath": payload["markdownPath"],
        "sessionDir": str(session_dir),
        "sessionPath": payload["sessionPath"],
        "reportPath": payload["reportPath"],
        "counts": payload["counts"],
        "rows": payload["rows"],
        "candidateRows": payload["candidateRows"],
        "heldRows": payload["heldRows"],
        "startHereQueue": payload["startHereQueue"],
        "firstSafeAction": payload["firstSafeAction"],
        "humanAsk": payload["humanAsk"],
        "agentSafeParallelWork": payload["agentSafeParallelWork"],
        "nextSafestAction": payload["nextSafestAction"],
        "truth": payload["truth"],
        "explicitNonClaims": payload["explicitNonClaims"],
    }
    write_json(handoff_root / "latest-episode-04-sync-stack.json", pointer_payload)
    write_json(handoff_root / "latest-sync-stack.json", pointer_payload)
    return payload


def build(root: Path, session_dir: Path, report_dir: Path, vault_root: Path, handoff_root: Path) -> tuple[Path, Path, dict]:
    if not root.exists():
        raise SystemExit(f"Episode 4 root does not exist: {root}")

    media_exts = {".mov", ".mp4", ".m4v", ".wav", ".m4a", ".mp3", ".aif", ".aiff", ".insv", ".lrv"}
    probes = {
        p.name: probe(p)
        for p in sorted(root.iterdir(), key=lambda item: item.name.lower())
        if p.is_file() and p.suffix.lower() in media_exts
    }
    def dur(name: str) -> float:
        return float(probes.get(name, {}).get("duration") or 0.0)

    lrv = {
        "005": root / "LRV_20260225_163604_01_005.lrv",
        "006": root / "LRV_20260225_163604_01_006.lrv",
        "007": root / "LRV_20260225_163604_01_007.lrv",
    }

    lanes: list[dict] = []
    media: list[dict] = []

    def add_lane(**kwargs):
        lanes.append(lane(**kwargs))
        media.append(media_item(kwargs["path"], kwargs["vault_root"], kwargs.get("proxy_path")))

    spine = root / "Charlie Ep4.wav"
    spine_duration = dur(spine.name)
    add_lane(
        name="Charlie Audio Spine - Charlie Ep4.wav",
        path=spine,
        role="spine_audio",
        media_kind="audio",
        track_ids=["A1"],
        duration=spine_duration,
        offset=0,
        vault_root=vault_root,
        tag_type="Active",
        label="Spine audio. Sequence truth starts here.",
    )

    # Rode/TX chunks: keep long chunks as stacked whole-source lanes; hold tiny tests and duplicate.
    tx_offsets = {
        "TX00_MIC005_20260226_070456_orig.wav": 0.0,
        "TX00_MIC006_20260226_073457_orig.wav": dur("TX00_MIC005_20260226_070456_orig.wav"),
        "TX00_MIC007_20260226_080457_orig.wav": dur("TX00_MIC005_20260226_070456_orig.wav") + dur("TX00_MIC006_20260226_073457_orig.wav"),
        "TX00_MIC008_20260226_083457_orig.wav": dur("TX00_MIC005_20260226_070456_orig.wav") + dur("TX00_MIC006_20260226_073457_orig.wav") + dur("TX00_MIC007_20260226_080457_orig.wav"),
    }
    for index, (filename, offset) in enumerate(tx_offsets.items(), start=2):
        add_lane(
            name=f"Homer/TX Audio Take {index - 1} - {filename}",
            path=root / filename,
            role="homer_audio_take",
            media_kind="audio",
            track_ids=[f"A{index}"],
            duration=dur(filename),
            offset=offset,
            vault_root=vault_root,
            tag_type="Active",
            label="Stacked TX audio chunk. Needs ear/sync review against spine.",
        )

    held_audio = [
        "TX00_MIC001_20260226_070412_orig.wav",
        "TX00_MIC002_20260226_070427_orig.wav",
        "TX00_MIC003_20260226_070436_orig.wav",
        "TX00_MIC004_20260226_070441_orig.wav",
        "TX00_MIC006_20260226_073457_orig (1).wav",
    ]
    for n, filename in enumerate(held_audio, start=20):
        add_lane(
            name=f"HELD audio review - {filename}",
            path=root / filename,
            role="held_questionable_audio",
            media_kind="audio",
            track_ids=[f"A{n}"],
            duration=dur(filename),
            offset=0,
            vault_root=vault_root,
            tag_type="Cut",
            ignore=True,
            label="Held aside: tiny test, duplicate, or unclear episode fit.",
        )

    # Charlie iPhone chunks. Tiny false starts and duplicate are held; larger takes are stacked.
    phone_stack = [
        ("IMG_3746.MOV", 0.0),
        ("IMG_3749.MOV", dur("IMG_3746.MOV")),
        ("IMG_3751.MOV", dur("IMG_3746.MOV") + dur("IMG_3749.MOV")),
    ]
    for idx, (filename, offset) in enumerate(phone_stack, start=1):
        add_lane(
            name=f"Charlie Phone Camera {idx} - {filename}",
            path=root / filename,
            role="charlie_phone_camera",
            media_kind="video",
            track_ids=[f"V{idx}"],
            duration=dur(filename),
            offset=offset,
            vault_root=vault_root,
            tag_type="Cut",
            label="Stacked phone camera chunk. Use Source Grove to review and promote to SHOW decisions.",
        )

    for n, filename in enumerate(["IMG_3746 2.MOV", "IMG_3747.MOV", "IMG_3748.MOV"], start=20):
        add_lane(
            name=f"HELD phone review - {filename}",
            path=root / filename,
            role="held_questionable_video",
            media_kind="video",
            track_ids=[f"V{n}"],
            duration=dur(filename),
            offset=0,
            vault_root=vault_root,
            tag_type="Cut",
            ignore=True,
            label="Held aside: duplicate or very short false-start candidate.",
        )

    # Insta360: use LRV sidecars as preview proxies, originals remain untouched.
    insta_specs = [
        ("VID_20260225_163604_00_005.insv", lrv["005"], 0.0),
        ("VID_20260225_163604_00_006.insv", lrv["006"], dur("VID_20260225_163604_00_005.insv")),
        ("VID_20260225_163604_00_007.insv", lrv["007"], dur("VID_20260225_163604_00_005.insv") + dur("VID_20260225_163604_00_006.insv")),
    ]
    for idx, (filename, proxy, offset) in enumerate(insta_specs, start=10):
        add_lane(
            name=f"Homer Insta360 Camera {idx - 9} - {filename}",
            path=root / filename,
            sidecar_path=proxy if proxy.exists() else None,
            role="homer_360_camera",
            media_kind="video",
            track_ids=[f"V{idx}"],
            duration=dur(filename),
            offset=offset,
            vault_root=vault_root,
            is360=True,
            tag_type="Cut",
            label="Stacked Insta360 source. LRV sidecar is preserved as a review clue; Quipsly MP4 proxy is required for production readiness.",
        )

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    sequence_id = stable_uuid("sequence::episode-4-sync-stack-v1")
    project_id = stable_uuid("project::episode-4-sync-stack-v1")
    session = {
        "activeSequenceId": sequence_id,
        "savedAt": now,
        "project": {
            "id": project_id,
            "title": "Episode 4 Sync Stack",
            "mediaBin": media,
            "nestDocuments": [],
            "sequences": [
                {
                    "id": sequence_id,
                    "title": "Episode 4 Sync Stack",
                    "orientationTrack": {"id": stable_uuid("orientation::episode4::16x9"), "keyframes": []},
                    "verticalOrientationTrack": {"id": stable_uuid("orientation::episode4::9x16"), "keyframes": []},
                    "lanes": lanes,
                    "shortClipQueue": [],
                    "transcriptSegments": [],
                    "transcriptJobs": [],
                    "editCorrectionNotes": [],
                    "editActionLedger": [],
                    "publishReceipts": [],
                    "editPassContext": {
                        "label": "Episode 4 first sync stack",
                        "actor": "Codex",
                        "actorType": "agent",
                        "passNumber": 1,
                        "goal": "Create a proxy-first whole-source sync stack. Held/questionable media stays visible and out of production decisions.",
                        "status": "active",
                        "startedAt": now,
                        "updatedAt": now,
                    },
                }
            ],
        },
    }

    session_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)
    run_id = stamp()
    session_path = session_dir / f"{run_id}-{SESSION_NAME}.quipsly-session.json"
    report_path = report_dir / f"{run_id}-{SESSION_NAME}-report.json"
    report = {
        "model": "episode-4-sync-stack-builder",
        "version": "2026-06-23.v1",
        "sessionName": SESSION_NAME,
        "sessionPath": str(session_path),
        "sourceRoot": str(root),
        "createdAt": now,
        "counts": {
            "lanes": len(lanes),
            "mediaItems": len(media),
            "heldLanes": sum(1 for item in lanes if (item.get("metadata") or {}).get("ignoreForProduction")),
            "candidateLanes": sum(1 for item in lanes if not (item.get("metadata") or {}).get("ignoreForProduction")),
            "proxyReadyLanes": sum(1 for item in lanes if item.get("sourceVideo", {}).get("proxyURL")),
            "needsProxyLanes": sum(
                1
                for item in lanes
                if not (item.get("metadata") or {}).get("ignoreForProduction")
                and not item.get("sourceVideo", {}).get("proxyURL")
            ),
        },
        "syncAssumptions": [
            "Charlie Ep4.wav is the initial sequence spine.",
            "TX MIC005-008 are stacked end-to-end as separate whole audio takes.",
            "Charlie phone chunks are stacked by filename/duration; duplicate/tiny starts are held.",
            "Insta360 chunks are stacked by segment order and paired with matching LRV sidecar proxies.",
            "This is a sync stack, not a final edit. SHOW/SKIP decisions should be created after review.",
        ],
        "heldReason": "Tiny tests, duplicate media, or unclear fit are retained as visible held lanes instead of deleted or forced into the program edit.",
        "probes": probes,
        "lanes": [
            {
                "name": item["name"],
                "role": item["metadata"]["role"],
                "mediaKind": item["metadata"]["mediaKind"],
                "trackIds": item["metadata"]["trackIds"],
                "offset": item["sourceVideo"]["offset"],
                "duration": item["sourceVideo"]["duration"],
                "proxyURL": item["sourceVideo"].get("proxyURL", ""),
                "proxyReady": bool(item["sourceVideo"].get("proxyURL")),
                "sourcePath": item["metadata"].get("sourcePath", ""),
                "vaultProxyPath": item["metadata"].get("vaultProxyPath", ""),
                "sidecarPreviewPath": item["metadata"].get("sidecarPreviewPath") or "",
                "ignoreForProduction": item["metadata"].get("ignoreForProduction", False),
                "label": item["metadata"].get("sourceLabel", ""),
            }
            for item in lanes
        ],
        "truth": "Whole sources are intact. This builder writes native Quipsly session metadata only and does not mutate original media.",
    }
    write_json(session_path, session)
    write_json(report_path, report)
    handoff = write_handoff(report, session_path, report_path, handoff_root)
    report["handoff"] = {
        "htmlPath": handoff["htmlPath"],
        "jsonPath": handoff["jsonPath"],
        "markdownPath": handoff["markdownPath"],
        "firstSafeAction": handoff["firstSafeAction"],
    }
    write_json(report_path, report)
    return session_path, report_path, report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--session-dir", type=Path, default=DEFAULT_SESSION_DIR)
    parser.add_argument("--report-dir", type=Path, default=DEFAULT_REPORT_DIR)
    parser.add_argument("--vault-root", type=Path, default=DEFAULT_VAULT_ROOT)
    parser.add_argument("--handoff-root", type=Path, default=DEFAULT_HANDOFF_ROOT)
    args = parser.parse_args()
    session_path, report_path, report = build(args.root, args.session_dir, args.report_dir, args.vault_root, args.handoff_root)
    print(json.dumps({
        "ok": True,
        "sessionName": SESSION_NAME,
        "sessionPath": str(session_path),
        "reportPath": str(report_path),
        "handoff": report.get("handoff"),
        "counts": report["counts"],
        "truth": report["truth"],
    }, indent=2))


if __name__ == "__main__":
    main()
