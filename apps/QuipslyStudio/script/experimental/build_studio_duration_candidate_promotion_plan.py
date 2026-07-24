#!/usr/bin/env python3
"""Build a dry-run-first promotion plan for a duration candidate.

This bridges the honest gap between a duration-candidate review packet and the
normal Tower/review-board machinery. A candidate is not a current package until
it has a standard manifest.json and release-status points at it. By default this
script writes only a review packet that previews those local changes.
"""

from __future__ import annotations

import argparse
import html
import json
import shlex
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-duration-candidate-promotion-plan.v1"
LATEST_POINTER = "review-board/duration-candidate-promotions/latest-duration-candidate-promotion-plan.json"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, dict) else {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_candidate(candidate: str, release_root: Path) -> Path:
    if candidate == "latest":
        pointer = load_json(release_root / "review-board" / "latest-duration-candidate-review.json")
        manifest = pointer.get("candidateManifestPath")
        if manifest:
            return Path(str(manifest))
    path = Path(candidate).expanduser()
    if path.is_dir():
        path = path / "duration-candidate-manifest.json"
    if not path.exists():
        raise SystemExit(f"Duration candidate manifest not found: {path}")
    return path


def stream_summary(streams: list[dict[str, Any]]) -> list[str]:
    result: list[str] = []
    for stream in streams:
        kind = str(stream.get("codec_type") or "")
        codec = str(stream.get("codec_name") or "unknown")
        if kind == "video":
            width = stream.get("width") or "?"
            height = stream.get("height") or "?"
            result.append(f"video:{codec}:{width}x{height}")
        elif kind == "audio":
            result.append(f"audio:{codec}:{stream.get('sample_rate') or '?'}Hz:{stream.get('channels') or '?'}ch")
        else:
            result.append(f"{kind or 'stream'}:{codec}")
    return result


def artifact_from_candidate(item: dict[str, Any], *, has_video: bool, has_audio: bool) -> dict[str, Any]:
    streams = item.get("streams") if isinstance(item.get("streams"), list) else []
    path = str(item.get("path") or "")
    return {
        "bytes": item.get("sizeBytes") or (Path(path).stat().st_size if path and Path(path).exists() else 0),
        "codecSummary": stream_summary(streams),
        "durationSeconds": item.get("durationSeconds"),
        "exists": bool(path and Path(path).exists()),
        "hasAudio": has_audio,
        "hasVideo": has_video,
        "path": path,
    }


def build_promoted_manifest(candidate_manifest: dict[str, Any], source_manifest: dict[str, Any], candidate_path: Path, release_root: Path) -> dict[str, Any]:
    candidate_dir = candidate_path.parent
    candidate_artifacts = candidate_manifest.get("artifacts") or {}
    promoted = deepcopy(source_manifest) if source_manifest else {}
    promoted.update({
        "packetType": "quipsly-full-release-manifest.duration-candidate-promoted.v1",
        "generatedAt": iso_now(),
        "episode": candidate_manifest.get("episode"),
        "version": candidate_manifest.get("version"),
        "versionName": candidate_manifest.get("version"),
        "versionDir": str(candidate_dir),
        "status": "manual-review-ready",
        "candidatePromotionTruth": "Promoted from a duration candidate after review. Promotion creates local package truth only; it does not publish, upload, schedule, approve, or create external receipt truth.",
        "sourcePolicy": (source_manifest.get("sourcePolicy") if source_manifest else None) or "Derived package manifest only. Original source media remains untouched.",
        "publicationTruth": (source_manifest.get("publicationTruth") if source_manifest else None) or "Local artifact readiness only. Not published until a platform receipt or URL exists.",
        "longFormDurationSpreadSeconds": candidate_manifest.get("durationSpreadSeconds"),
        "longFormDurationAlignmentReady": float(candidate_manifest.get("durationSpreadSeconds") or 0) <= 0.25,
        "longFormDurationReady": True,
        "warnings": [] if float(candidate_manifest.get("durationSpreadSeconds") or 0) <= 0.25 else [
            f"Promoted candidate still has {candidate_manifest.get('durationSpreadSeconds')}s duration spread; review before publishing."
        ],
        "artifacts": {
            "videoMaster16x9": artifact_from_candidate(candidate_artifacts.get("video16x9") or {}, has_video=True, has_audio=True),
            "videoMaster9x16": artifact_from_candidate(candidate_artifacts.get("video9x16") or {}, has_video=True, has_audio=True),
            "audioOnlyPodcast": artifact_from_candidate(candidate_artifacts.get("podcastAudio") or {}, has_video=False, has_audio=True),
        },
        "shorts": source_manifest.get("shorts") or [],
        "shortCount": len(source_manifest.get("shorts") or []),
        "shortsInheritedFrom": candidate_manifest.get("sourceVersion") or source_manifest.get("versionName") or source_manifest.get("version") or "",
        "durationCandidateManifestPath": str(candidate_path),
        "reviewBeforePublicationRequired": True,
        "releaseRoot": str(release_root),
    })
    return promoted


def build_release_status_preview(release_status: dict[str, Any], candidate_manifest: dict[str, Any], candidate_dir: Path, promoted_manifest: dict[str, Any]) -> dict[str, Any]:
    preview = deepcopy(release_status)
    episode_number = int(candidate_manifest.get("episode") or 0)
    updated = False
    for episode in preview.get("episodes") or []:
        if int(episode.get("episode") or 0) != episode_number:
            continue
        episode.update({
            "version": candidate_manifest.get("version"),
            "versionDir": str(candidate_dir),
            "status": "manual-review-ready",
            "longFormDurationAlignmentReady": bool(promoted_manifest.get("longFormDurationAlignmentReady")),
            "longFormDurationReady": True,
            "longFormDurationSpreadSeconds": promoted_manifest.get("longFormDurationSpreadSeconds"),
            "mediaFileCount": 3 + len(promoted_manifest.get("shorts") or []),
            "shortCount": len(promoted_manifest.get("shorts") or []),
            "readyShortCount": len([short for short in promoted_manifest.get("shorts") or [] if short.get("exists")]),
            "warnings": promoted_manifest.get("warnings") or [],
            "nextSafestAction": "Watch/listen promoted duration candidate as the current review package, then mark approve/refine/hold locally before any publishing.",
            "publicationReceiptStatus": "no platform receipts captured",
        })
        updated = True
        break
    if not updated:
        raise SystemExit(f"Episode {episode_number} not found in release-status.json")
    preview["generatedAt"] = iso_now()
    preview["truth"] = "Preview of release-status after duration-candidate promotion. Local readiness only; no publication receipt truth."
    return preview


def build_packet(candidate_path: Path, release_root: Path, execute: bool) -> dict[str, Any]:
    candidate_manifest = load_json(candidate_path)
    candidate_dir = candidate_path.parent
    episode_dir = candidate_dir.parent
    source_version = str(candidate_manifest.get("sourceVersion") or "")
    if not source_version:
        source_version = "v003" if (episode_dir / "v003" / "manifest.json").exists() else ""
    source_manifest_path = episode_dir / source_version / "manifest.json" if source_version else Path("")
    source_manifest = load_json(source_manifest_path) if source_manifest_path else {}
    release_status_path = release_root / "release-status.json"
    release_status = load_json(release_status_path)
    promoted_manifest = build_promoted_manifest(candidate_manifest, source_manifest, candidate_path, release_root)
    release_status_preview = build_release_status_preview(release_status, candidate_manifest, candidate_dir, promoted_manifest)
    target_manifest_path = candidate_dir / "manifest.json"
    target_markdown_path = candidate_dir / "START-HERE-promoted-duration-candidate.md"
    execute_command = (
        f"./script/agentctl.sh studio-duration-candidate-promotion-plan "
        f"{shell_quote(str(candidate_path))} {shell_quote(str(release_root))} --execute"
    )
    safety = {
        "dryRun": not execute,
        "targetManifestWouldBeWritten": str(target_manifest_path),
        "releaseStatusWouldBeUpdated": str(release_status_path),
        "sourceFilesMutated": False,
        "originalMediaMutated": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
        "versionsOverwritten": False,
    }
    if execute:
        if target_manifest_path.exists():
            raise SystemExit(f"Refusing to overwrite existing promoted manifest: {target_manifest_path}")
        write_json(target_manifest_path, promoted_manifest)
        target_markdown_path.write_text(render_promoted_markdown(promoted_manifest), encoding="utf-8")
        write_json(release_status_path, release_status_preview)
        safety.update({
            "dryRun": False,
            "targetManifestWritten": str(target_manifest_path),
            "releaseStatusUpdated": str(release_status_path),
        })
    return {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "status": "promotion-executed" if execute else "promotion-plan-ready",
        "releaseRoot": str(release_root),
        "candidateManifestPath": str(candidate_path),
        "sourceManifestPath": str(source_manifest_path) if source_manifest_path else "",
        "targetManifestPath": str(target_manifest_path),
        "targetMarkdownPath": str(target_markdown_path),
        "releaseStatusPath": str(release_status_path),
        "episode": candidate_manifest.get("episode"),
        "candidateVersion": candidate_manifest.get("version"),
        "sourceVersion": source_version,
        "truth": "Duration candidate promotion plan. Dry-run mode writes only this review packet. Execute mode writes a standard local manifest and release-status pointer, but still does not publish, upload, schedule, approve, create receipts, mutate originals, or overwrite versions.",
        "nextSafestAction": "If humans approve the watch/listen candidate evidence, run the execute command to create the v004 review package, then regenerate review-board and human-review ledger before any artifact approval.",
        "executeCommandRequiresApproval": execute_command,
        "promotedManifestPreview": promoted_manifest,
        "releaseStatusPreview": release_status_preview,
        "safety": safety,
    }


def render_promoted_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        f"# Episode {int(manifest.get('episode') or 0):02d} {manifest.get('version')} promoted duration candidate",
        "",
        manifest.get("candidatePromotionTruth") or "",
        "",
        f"- Duration spread: `{manifest.get('longFormDurationSpreadSeconds')}` seconds",
        f"- Review required before publication: `{manifest.get('reviewBeforePublicationRequired')}`",
        f"- Shorts inherited from: `{manifest.get('shortsInheritedFrom')}`",
        "",
        "## Artifacts",
        "",
    ]
    for key, artifact in (manifest.get("artifacts") or {}).items():
        lines.append(f"- `{key}`: `{artifact.get('path')}` ({artifact.get('durationSeconds')}s)")
    return "\n".join(lines).rstrip() + "\n"


def write_markdown(path: Path, packet: dict[str, Any]) -> None:
    lines = [
        "# Duration Candidate Promotion Plan",
        "",
        packet.get("truth") or "",
        "",
        f"- Status: `{packet.get('status')}`",
        f"- Episode: `{packet.get('episode')}`",
        f"- Candidate version: `{packet.get('candidateVersion')}`",
        f"- Source version: `{packet.get('sourceVersion')}`",
        f"- Candidate manifest: `{packet.get('candidateManifestPath')}`",
        f"- Target manifest: `{packet.get('targetManifestPath')}`",
        "",
        "## Next safest action",
        "",
        packet.get("nextSafestAction") or "",
        "",
        "## Execute only after human approval",
        "",
        "```bash",
        packet.get("executeCommandRequiresApproval") or "",
        "```",
        "",
        "## Safety",
        "",
        "```json",
        json.dumps(packet.get("safety") or {}, indent=2, sort_keys=True),
        "```",
    ]
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_html(path: Path, packet: dict[str, Any]) -> None:
    safety = packet.get("safety") or {}
    manifest = packet.get("promotedManifestPreview") or {}
    artifacts = manifest.get("artifacts") or {}
    artifact_cards = "".join(
        f"<article><h3>{html.escape(key)}</h3><p>{html.escape(str(value.get('path') or ''))}</p><p>{html.escape(str(value.get('durationSeconds')))}s</p></article>"
        for key, value in artifacts.items()
    )
    path.write_text(f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Duration Candidate Promotion Plan</title>
  <style>
    :root {{ color-scheme:dark; --bg:#101711; --panel:#1b271f; --ink:#fff3d8; --muted:#cabe9e; --gold:#edcb52; --moss:#8fbd72; --line:rgba(255,243,216,.15); }}
    body {{ margin:0; font-family:Avenir Next, Helvetica Neue, sans-serif; background:radial-gradient(circle at 20% 0%, rgba(143,189,114,.18), transparent 34%), var(--bg); color:var(--ink); }}
    header, main {{ padding:34px clamp(18px,5vw,72px); }}
    .eyebrow {{ color:var(--gold); text-transform:uppercase; letter-spacing:.18em; font-size:12px; font-weight:900; }}
    h1 {{ font-size:clamp(38px,6vw,78px); line-height:.92; margin:.2em 0; }}
    p {{ color:var(--muted); line-height:1.5; }}
    .grid {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }}
    article, section {{ border:1px solid var(--line); border-radius:24px; padding:18px; background:linear-gradient(180deg,rgba(27,39,31,.96),rgba(9,13,10,.98)); margin-bottom:16px; }}
    pre {{ white-space:pre-wrap; overflow-wrap:anywhere; background:rgba(0,0,0,.3); border-radius:14px; padding:14px; }}
  </style>
</head>
<body>
  <header>
    <div class="eyebrow">Quipsly Studio promotion plan</div>
    <h1>Make the candidate visible only when review says yes.</h1>
    <p>{html.escape(packet.get('truth') or '')}</p>
    <p><strong>Next:</strong> {html.escape(packet.get('nextSafestAction') or '')}</p>
  </header>
  <main>
    <section><h2>Candidate artifacts</h2><div class="grid">{artifact_cards}</div></section>
    <section><h2>Execute only after human approval</h2><pre>{html.escape(packet.get('executeCommandRequiresApproval') or '')}</pre></section>
    <section><h2>Safety</h2><pre>{html.escape(json.dumps(safety, indent=2, sort_keys=True))}</pre></section>
  </main>
</body>
</html>
""", encoding="utf-8")


def update_pointer(release_root: Path, packet: dict[str, Any], html_path: Path, json_path: Path, markdown_path: Path) -> None:
    pointer = {
        "schema": "quipsly.studio-duration-candidate-promotion-plan.latest.v1",
        "updatedAt": iso_now(),
        "status": packet.get("status"),
        "humanAsk": "Review the duration candidate evidence before promoting it into the current local package lane.",
        "agentSafeParallelWork": "Codex may compare manifests, summarize candidate evidence, and prepare dry-run promotion notes. Do not execute promotion, approve, publish, upload, schedule, overwrite, mutate media, or create receipt truth.",
        "episode": packet.get("episode"),
        "candidateVersion": packet.get("candidateVersion"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "candidateManifestPath": packet.get("candidateManifestPath"),
        "targetManifestPath": packet.get("targetManifestPath"),
        "releaseStatusPath": packet.get("releaseStatusPath"),
        "nextSafestAction": packet.get("nextSafestAction"),
        "firstSafeAction": packet.get("firstSafeAction") or {},
        "executeCommandRequiresApproval": packet.get("executeCommandRequiresApproval"),
        "safety": packet.get("safety") or {},
        "truth": "Latest pointer only. Promotion plan is not publication, approval, upload, schedule, or receipt truth.",
    }
    write_json(release_root / LATEST_POINTER, pointer)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build or execute a local duration-candidate promotion plan.")
    parser.add_argument("candidate", nargs="?", default="latest")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    parser.add_argument("--execute", action="store_true", help="Write manifest.json and update release-status.json. Requires explicit human approval.")
    args = parser.parse_args()
    release_root = Path(args.release_root).expanduser()
    candidate_path = resolve_candidate(args.candidate, release_root)
    packet = build_packet(candidate_path, release_root, args.execute)
    out_dir = release_root / "review-board" / "duration-candidate-promotions" / f"{stamp()}-episode-{int(packet.get('episode') or 0):02d}-{packet.get('candidateVersion')}-promotion-plan"
    out_dir.mkdir(parents=True, exist_ok=False)
    json_path = out_dir / "duration-candidate-promotion-plan.json"
    html_path = out_dir / "index.html"
    markdown_path = out_dir / "START-HERE-duration-candidate-promotion-plan.md"
    packet.update({"jsonPath": str(json_path), "htmlPath": str(html_path), "markdownPath": str(markdown_path), "sessionDir": str(out_dir)})
    packet["firstSafeAction"] = {
        "label": "Open duration candidate promotion plan",
        "command": f"open {shell_quote(str(html_path))}",
        "path": str(html_path),
        "safety": "Opens the local promotion plan only. It does not execute promotion, approve, publish, upload, schedule, overwrite, mutate media, or create receipt truth.",
    }
    write_json(json_path, packet)
    write_markdown(markdown_path, packet)
    write_html(html_path, packet)
    update_pointer(release_root, packet, html_path, json_path, markdown_path)
    print(json.dumps({
        "ok": True,
        "status": packet.get("status"),
        "htmlPath": str(html_path),
        "jsonPath": str(json_path),
        "markdownPath": str(markdown_path),
        "targetManifestPath": packet.get("targetManifestPath"),
        "releaseStatusPath": packet.get("releaseStatusPath"),
        "execute": bool(args.execute),
        "safety": packet.get("safety"),
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
