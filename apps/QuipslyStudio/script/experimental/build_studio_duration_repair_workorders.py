#!/usr/bin/env python3
"""Build non-mutating duration repair work orders for release packages.

The work orders translate A/V duration warnings into safe, versioned candidate
commands. They do not execute ffmpeg, copy media, create new release versions, or
change review/approval truth.
"""
from __future__ import annotations

import argparse
import csv
import html
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_RELEASE_ROOT = Path("/Volumes/My Passport/Episode_and_Shorts_Test")
SCHEMA = "quipsly.studio-duration-repair-workorders.v1"


def iso_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def format_duration(seconds: float | None) -> str:
    if seconds is None:
        return "unknown"
    seconds = max(0.0, float(seconds))
    whole = int(seconds)
    ms = int(round((seconds - whole) * 1000))
    h, rem = divmod(whole, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}.{ms:03d}"
    return f"{m}:{s:02d}.{ms:03d}"


def parse_episode(path: Path) -> int:
    match = re.search(r"Episode_(\d+)", str(path))
    return int(match.group(1)) if match else 0


def parse_version(version_dir: Path) -> int:
    match = re.fullmatch(r"v(\d+)", version_dir.name)
    return int(match.group(1)) if match else 0


def next_version_dir(version_dir: Path) -> Path:
    number = parse_version(version_dir)
    return version_dir.with_name(f"v{number + 1:03d}" if number else f"{version_dir.name}-repair-candidate")


def ffprobe_duration(path: Path) -> float | None:
    if not path.exists():
        return None
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=nokey=1:noprint_wrappers=1",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
            timeout=12,
        )
        return float(result.stdout.strip())
    except Exception:
        return None


@dataclass
class Artifact:
    key: str
    label: str
    path: Path
    duration: float | None
    manifest_duration: float | None
    kind: str
    exists: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "path": str(self.path),
            "durationSeconds": self.duration,
            "manifestDurationSeconds": self.manifest_duration,
            "durationLabel": format_duration(self.duration),
            "kind": self.kind,
            "exists": self.exists,
        }


def artifact_kind(key: str, payload: dict[str, Any]) -> str:
    if payload.get("hasVideo"):
        return "video"
    if payload.get("hasAudio"):
        return "audio"
    if "audio" in key.lower():
        return "audio"
    return "video" if "video" in key.lower() else "unknown"


def collect_artifacts(manifest: dict[str, Any]) -> list[Artifact]:
    artifacts: list[Artifact] = []
    raw = manifest.get("artifacts") if isinstance(manifest.get("artifacts"), dict) else {}
    labels = {
        "videoMaster16x9": "16:9 long-form video",
        "videoMaster9x16": "9:16 vertical video",
        "audioOnlyPodcast": "audio-only podcast master",
    }
    for key in ["videoMaster16x9", "videoMaster9x16", "audioOnlyPodcast"]:
        item = raw.get(key)
        if not isinstance(item, dict):
            continue
        raw_path = item.get("path") or item.get("outputPath") or ""
        if not raw_path:
            continue
        path = Path(str(raw_path))
        manifest_duration = item.get("durationSeconds")
        try:
            manifest_duration = float(manifest_duration) if manifest_duration is not None else None
        except (TypeError, ValueError):
            manifest_duration = None
        probed = ffprobe_duration(path)
        artifacts.append(Artifact(
            key=key,
            label=labels.get(key, key),
            path=path,
            duration=probed if probed is not None else manifest_duration,
            manifest_duration=manifest_duration,
            kind=artifact_kind(key, item),
            exists=path.exists(),
        ))
    return artifacts


def duration_spread(artifacts: list[Artifact]) -> float:
    values = [a.duration for a in artifacts if a.duration is not None and a.exists]
    return max(values) - min(values) if len(values) >= 2 else 0.0


def command_for_trim(source: Artifact, target_seconds: float, output_path: Path) -> str:
    map_arg = "-map 0"
    return (
        f"ffmpeg -hide_banner -n -i {shell_quote(str(source.path))} "
        f"-t {target_seconds:.3f} {map_arg} -c copy {shell_quote(str(output_path))}"
    )


def output_for(source: Artifact, target_dir: Path, episode: int, version_name: str) -> Path:
    if source.kind == "audio":
        return target_dir / "audio" / f"episode-{episode:02d}-{version_name}-podcast-audio-duration-candidate.m4a"
    suffix = "9x16" if "9x16" in source.key.lower() else "16x9"
    return target_dir / "video" / f"episode-{episode:02d}-{version_name}-{suffix}-duration-candidate.mp4"


def load_candidate_manifest(candidate_dir: Path) -> dict[str, Any]:
    manifest = load_json(candidate_dir / "duration-candidate-manifest.json")
    if manifest:
        manifest["manifestPath"] = str(candidate_dir / "duration-candidate-manifest.json")
        manifest["markdownPath"] = str(candidate_dir / "START-HERE-duration-candidate.md")
    return manifest


def release_root_for_version_dir(version_dir: Path) -> Path:
    # /ReleaseRoot/Episode_01/v003 -> /ReleaseRoot
    try:
        return version_dir.parent.parent
    except Exception:
        return Path("")


def load_candidate_review_pointer(candidate_dir: Path, manifest_path: Path) -> dict[str, Any]:
    release_root = release_root_for_version_dir(manifest_path.parent.parent if manifest_path.name == "duration-candidate-manifest.json" else candidate_dir)
    pointer = load_json(release_root / "review-board" / "latest-duration-candidate-review.json")
    if not pointer:
        return {}
    pointer_candidate_dir = str(pointer.get("candidateDir") or "")
    pointer_manifest = str(pointer.get("candidateManifestPath") or "")
    if pointer_candidate_dir == str(candidate_dir) or pointer_manifest == str(candidate_dir / "duration-candidate-manifest.json"):
        return pointer
    return {}


def load_sync_investigation_pointer(release_root: Path, episode: int) -> dict[str, Any]:
    pointer = load_json(release_root / "review-board" / "latest-sync-investigation.json")
    if not pointer:
        return {}
    try:
        pointer_episode = int(pointer.get("episode") or 0)
    except (TypeError, ValueError):
        pointer_episode = 0
    return pointer if pointer_episode == episode else {}


def build_workorder(manifest_path: Path) -> dict[str, Any] | None:
    manifest = load_json(manifest_path)
    warnings = manifest.get("warnings") if isinstance(manifest.get("warnings"), list) else []
    if not any("duration" in str(w).lower() for w in warnings):
        return None
    version_dir = manifest_path.parent
    episode = int(manifest.get("episode") or parse_episode(version_dir))
    artifacts = collect_artifacts(manifest)
    if len(artifacts) < 2:
        return None
    spread = duration_spread(artifacts)
    if spread <= 0:
        return None
    existing = [a for a in artifacts if a.exists and a.duration is not None]
    shortest = min(existing, key=lambda a: float(a.duration or 0)) if existing else None
    longest = max(existing, key=lambda a: float(a.duration or 0)) if existing else None
    target_seconds = float(shortest.duration or 0) if shortest else 0.0
    next_dir = next_version_dir(version_dir)
    next_version = next_dir.name
    candidate_manifest = load_candidate_manifest(next_dir)
    candidate_review = load_candidate_review_pointer(next_dir, manifest_path) if candidate_manifest else {}
    release_root = release_root_for_version_dir(version_dir)
    sync_investigation = load_sync_investigation_pointer(release_root, episode)
    severity = "major-human-review" if spread >= 600 else "review-before-repair" if spread >= 60 else "minor-review"
    commands: list[dict[str, str]] = [
        {
            "label": "Create candidate folder",
            "kind": "candidate-local-command",
            "command": f"mkdir -p {shell_quote(str(next_dir / 'video'))} {shell_quote(str(next_dir / 'audio'))}",
            "safety": "Creates a new candidate version folder only. It does not overwrite prior versions or mutate originals.",
        }
    ]
    trim_candidates = [a for a in existing if shortest and a.duration and a.duration > target_seconds + 0.5]
    for artifact in trim_candidates:
        commands.append({
            "label": f"Create trimmed {artifact.label}",
            "kind": "candidate-local-command-human-confirmation-required",
            "command": command_for_trim(artifact, target_seconds, output_for(artifact, next_dir, episode, next_version)),
            "safety": "Creates a new duration-candidate output with ffmpeg -n after human confirmation. It does not overwrite existing files or mutate source artifacts.",
        })
    if shortest:
        commands.append({
            "label": f"Copy shortest reference unchanged ({shortest.label})",
            "kind": "candidate-local-command-human-confirmation-required",
            "command": f"mkdir -p {shell_quote(str(output_for(shortest, next_dir, episode, next_version).parent))} && cp -n {shell_quote(str(shortest.path))} {shell_quote(str(output_for(shortest, next_dir, episode, next_version)))}",
            "safety": "Copies the shortest existing derived artifact into the new candidate version with cp -n. It does not overwrite existing files or mutate originals.",
        })
    recommended = (
        "Do not auto-repair. The spread is large enough that this may be a sync/content issue; review source intent before creating a candidate version."
        if severity == "major-human-review"
        else "Review tail/head evidence, then create a new candidate version by trimming only longer derived outputs to the shortest approved duration."
    )
    if severity == "major-human-review" and not candidate_manifest:
        commands = []
        recommended = (
            "Do not create duration-trim candidates yet. This spread is large enough to be a sync/content issue. "
            "Open or generate the sync investigation packet first, then decide whether this episode needs re-sync, re-stack, hold, or a versioned rebuild."
        )
    if candidate_manifest:
        candidate_status = str(candidate_manifest.get("status") or "candidate-exists-needs-review")
        candidate_spread = candidate_manifest.get("durationSpreadSeconds")
        recommended = (
            f"Candidate {next_version} already exists with status `{candidate_status}`"
            + (f" and duration spread `{candidate_spread}s`" if candidate_spread is not None else "")
            + ". Open the candidate folder and perform watch/listen review before promotion or rejection."
        )
    if candidate_review:
        review_status = str(candidate_review.get("status") or "review-evidence-ready")
        recommended = (
            f"Candidate {next_version} has a review packet with status `{review_status}`. "
            "Open the packet, inspect beginning/middle/ending snippets, then record approve/refine/hold only after watch/listen judgment."
        )
    return {
        "status": "candidate-ready-for-review" if candidate_manifest else "sync-investigation-first" if severity == "major-human-review" else "candidate-commands-ready",
        "episode": episode,
        "currentVersion": version_dir.name,
        "currentVersionDir": str(version_dir),
        "candidateVersion": next_version,
        "candidateVersionDir": str(next_dir),
        "candidateManifestPath": candidate_manifest.get("manifestPath") or "",
        "candidateMarkdownPath": candidate_manifest.get("markdownPath") or "",
        "candidateStatus": candidate_manifest.get("status") or "",
        "candidateDurationSpreadSeconds": candidate_manifest.get("durationSpreadSeconds"),
        "candidateReviewStatus": candidate_review.get("status") or "",
        "candidateReviewHtmlPath": candidate_review.get("htmlPath") or "",
        "candidateReviewJsonPath": candidate_review.get("jsonPath") or "",
        "syncInvestigationStatus": sync_investigation.get("status") or "",
        "syncInvestigationHtmlPath": sync_investigation.get("htmlPath") or "",
        "syncInvestigationJsonPath": sync_investigation.get("jsonPath") or "",
        "manifestPath": str(manifest_path),
        "warnings": warnings,
        "spreadSeconds": spread,
        "spreadLabel": format_duration(spread),
        "severity": severity,
        "shortestArtifact": shortest.as_dict() if shortest else {},
        "longestArtifact": longest.as_dict() if longest else {},
        "artifacts": [a.as_dict() for a in artifacts],
        "recommendedSafeAction": recommended,
        "firstSafeAction": {
            "label": "Open duration candidate review packet" if candidate_review else "Open existing duration candidate" if candidate_manifest else "Open sync investigation packet" if sync_investigation else "Generate sync investigation packet" if severity == "major-human-review" else "Review work order before running candidate commands",
            "command": f"open {shell_quote(str(candidate_review.get('htmlPath')))}" if candidate_review else f"open {shell_quote(str(next_dir))}" if candidate_manifest else f"open {shell_quote(str(sync_investigation.get('htmlPath')))}" if sync_investigation else f"./script/agentctl.sh studio-sync-investigation {episode}" if severity == "major-human-review" else "",
            "path": str(candidate_review.get("htmlPath") or next_dir if candidate_manifest else sync_investigation.get("htmlPath") if sync_investigation else ""),
            "safety": (
                "Opens local beginning/middle/ending review evidence only. It does not approve, publish, upload, schedule, overwrite, delete, create receipts, or mutate originals."
                if candidate_review
                else
                "Opens an existing local duration candidate for watch/listen review. It does not approve, publish, upload, schedule, overwrite, delete, or mutate originals."
                if candidate_manifest
                else
                "Opens local sync investigation evidence only. It does not approve, repair, publish, upload, schedule, overwrite, delete, create receipts, or mutate originals."
                if sync_investigation
                else
                "Generates local sync investigation evidence only. It does not approve, repair, publish, upload, schedule, overwrite, delete, create receipts, or mutate originals."
                if severity == "major-human-review"
                else "Human review first. Candidate commands are local, versioned, and not executed by this packet."
            ),
            "episode": episode,
            "currentVersion": version_dir.name,
            "candidateVersion": next_version,
            "spreadLabel": format_duration(spread),
        },
        "candidateCommands": commands,
        "candidateAlreadyExists": bool(candidate_manifest),
        "syncInvestigationFirst": severity == "major-human-review" and not bool(candidate_manifest),
        "requiresHumanConfirmation": bool(commands) and not bool(candidate_manifest),
        "safety": "Work order only. Commands are not executed; no originals, releases, receipts, approvals, uploads, schedules, or publications are changed.",
    }


def discover_warning_manifests(release_root: Path) -> list[Path]:
    manifests = sorted(release_root.glob("Episode_*/v*/manifest.json"))
    selected: list[Path] = []
    for manifest in manifests:
        payload = load_json(manifest)
        warnings = payload.get("warnings") if isinstance(payload.get("warnings"), list) else []
        if any("duration" in str(w).lower() for w in warnings):
            selected.append(manifest)
    return selected


def hydrate_workorder_affordances(order: dict[str, Any]) -> dict[str, Any]:
    action = order.get("firstSafeAction") if isinstance(order.get("firstSafeAction"), dict) else {}
    primary_path = (
        order.get("candidateReviewHtmlPath")
        or order.get("syncInvestigationHtmlPath")
        or order.get("candidateManifestPath")
        or order.get("manifestPath")
        or order.get("candidateVersionDir")
        or ""
    )
    status = str(order.get("status") or "")
    episode = order.get("episode") or ""
    candidate = order.get("candidateVersion") or ""
    spread = order.get("spreadLabel") or ""
    if status == "candidate-ready-for-review":
        human_ask = f"Watch/listen Episode {episode} candidate {candidate} before promoting or rejecting it. Treat the {spread} spread as review evidence, not approval."
        agent_safe = "Prepare comparison notes, open local review packets, and improve evidence surfaces. Do not promote, publish, upload, schedule, or create receipts."
    elif status == "sync-investigation-first":
        human_ask = f"Inspect Episode {episode} sync evidence before any trim/rebuild. Decide whether this is re-sync, re-stack, hold, or source-content mismatch."
        agent_safe = "Prepare sync comparison evidence and clearer missing/source tasks. Do not force a trim candidate for a major spread."
    else:
        human_ask = f"Review Episode {episode} duration spread before running any local candidate command."
        agent_safe = "Improve the workorder packet and compare artifact durations. Candidate commands require explicit human confirmation."
    order.update({
        "primaryLabel": action.get("label") or "Open duration workorder evidence",
        "primaryCommand": action.get("command") or (f"open {shell_quote(str(primary_path))}" if primary_path else ""),
        "primaryPath": str(primary_path),
        "primarySafety": action.get("safety") or order.get("safety") or "",
        "nextSafestAction": order.get("recommendedSafeAction") or human_ask,
        "humanAsk": human_ask,
        "agentSafeParallelWork": agent_safe,
    })
    return order


def prepare_session(release_root: Path) -> Path:
    session_dir = release_root / "review-board" / "duration-repair-workorders" / f"{stamp()}-duration-repair-workorders"
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


def render_html(payload: dict[str, Any]) -> str:
    rows = []
    for order in payload["workorders"]:
        artifact_rows = "".join(
            f"<tr><td>{html.escape(a['label'])}</td><td>{html.escape(a['kind'])}</td><td>{html.escape(a['durationLabel'])}</td><td><code>{html.escape(a['path'])}</code></td></tr>"
            for a in order.get("artifacts", [])
        )
        command_rows = "".join(
            f"<li><strong>{html.escape(c['label'])}</strong><pre>{html.escape(c['command'])}</pre><p class=\"safety\">{html.escape(c.get('safety') or '')}</p></li>"
            for c in order.get("candidateCommands", [])
        )
        rows.append(f"""
        <article class=\"card {html.escape(order['severity'])}\">
          <div class=\"eyebrow\">Episode {order['episode']} - {html.escape(order['currentVersion'])} to {html.escape(order['candidateVersion'])}</div>
          <h2>{html.escape(order['spreadLabel'])} duration spread</h2>
          <p><strong>Status:</strong> {html.escape(order.get('status') or 'candidate-commands-ready')}</p>
          <p><strong>Human ask:</strong> {html.escape(order.get('humanAsk') or '')}</p>
          <p><strong>Agent-safe parallel work:</strong> {html.escape(order.get('agentSafeParallelWork') or '')}</p>
          <p><strong>Primary action:</strong> {html.escape(order.get('primaryLabel') or '')}</p>
          <p><strong>Primary path:</strong> <code>{html.escape(order.get('primaryPath') or '')}</code></p>
          <p><strong>Primary command:</strong> <code>{html.escape(order.get('primaryCommand') or '')}</code></p>
          <p class=\"action\">{html.escape(order['recommendedSafeAction'])}</p>
          <p><strong>Candidate folder:</strong> <code>{html.escape(order['candidateVersionDir'])}</code></p>
          <p><strong>Candidate already exists:</strong> {html.escape(str(bool(order.get('candidateAlreadyExists'))).lower())}</p>
          <p><strong>Candidate status:</strong> {html.escape(str(order.get('candidateStatus') or 'not-created-yet'))}</p>
          <p><strong>Candidate review packet:</strong> {html.escape(str(order.get('candidateReviewStatus') or 'not-created-yet'))} {f'<a href="file://{html.escape(str(order.get("candidateReviewHtmlPath") or ""))}">open packet</a>' if order.get('candidateReviewHtmlPath') else ''}</p>
          <p><strong>Sync investigation:</strong> {html.escape(str(order.get('syncInvestigationStatus') or 'not-created-yet'))} {f'<a href="file://{html.escape(str(order.get("syncInvestigationHtmlPath") or ""))}">open sync packet</a>' if order.get('syncInvestigationHtmlPath') else ''}</p>
          <p><strong>Candidate duration spread:</strong> {html.escape(str(order.get('candidateDurationSpreadSeconds') if order.get('candidateDurationSpreadSeconds') is not None else 'unknown'))}</p>
          <p><strong>Sync investigation first:</strong> {html.escape(str(bool(order.get('syncInvestigationFirst'))).lower())}</p>
          <p><strong>Human confirmation required to create candidate:</strong> {html.escape(str(bool(order.get('requiresHumanConfirmation'))).lower())}</p>
          <table><thead><tr><th>Artifact</th><th>Kind</th><th>Duration</th><th>Path</th></tr></thead><tbody>{artifact_rows}</tbody></table>
          <h3>Candidate commands (not executed)</h3>
          <ol>{command_rows}</ol>
          <p class=\"safety\">{html.escape(order['safety'])}</p>
        </article>
        """)
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\" />
  <title>Studio duration repair work orders</title>
  <style>
    :root {{ --bg:#101812; --panel:#1b261e; --ink:#f5efd9; --muted:#beb49a; --gold:#e5c759; --clay:#c4795a; --water:#6fbfd0; --line:rgba(245,239,217,.16); }}
    body {{ margin:0; background: radial-gradient(circle at 20% 0%, rgba(111,191,208,.16), transparent 32%), var(--bg); color:var(--ink); font-family:Avenir Next, Helvetica Neue, sans-serif; }}
    header {{ padding:38px clamp(20px,5vw,70px); border-bottom:1px solid var(--line); }}
    .eyebrow {{ color:var(--gold); letter-spacing:.18em; text-transform:uppercase; font-weight:900; font-size:12px; }}
    h1 {{ font-size:clamp(36px,6vw,72px); line-height:.92; margin:10px 0; }}
    main {{ display:grid; gap:18px; padding:26px clamp(16px,4vw,56px) 70px; }}
    .card {{ border:1px solid var(--line); border-radius:24px; background:linear-gradient(180deg, rgba(27,38,30,.96), rgba(11,16,12,.98)); padding:20px; box-shadow:0 18px 42px rgba(0,0,0,.26); }}
    .major-human-review {{ border-color:rgba(196,121,90,.6); }}
    .review-before-repair {{ border-color:rgba(229,199,89,.58); }}
    p {{ color:var(--muted); line-height:1.45; }}
    .action {{ color:var(--ink); font-weight:800; }}
    .safety {{ color:var(--water); }}
    table {{ width:100%; border-collapse:collapse; margin:16px 0; }}
    th,td {{ border-top:1px solid var(--line); padding:9px; text-align:left; vertical-align:top; }}
    code,pre {{ white-space:pre-wrap; overflow-wrap:anywhere; color:var(--ink); }}
    pre {{ background:rgba(0,0,0,.26); border-radius:14px; padding:12px; }}
  </style>
</head>
<body>
  <header>
    <div class=\"eyebrow\">Quipsly Studio safety work orders</div>
    <h1>Duration repair without pretending the repair is approved.</h1>
    <p>These work orders turn A/V duration warnings into explicit candidate commands. They do not execute anything, overwrite any version, mutate original media, publish, schedule, upload, or create receipt truth.</p>
  </header>
  <main>{''.join(rows) if rows else '<article class="card"><h2>No duration work orders</h2><p>No duration warnings were found.</p></article>'}</main>
</body>
</html>"""


def write_markdown(session_dir: Path, payload: dict[str, Any]) -> None:
    lines = [
        "# Studio duration repair work orders",
        "",
        f"Generated: `{payload['generatedAt']}`",
        "",
        payload["truth"],
        "",
    ]
    for order in payload["workorders"]:
        lines.extend([
            f"## Episode {order['episode']} {order['currentVersion']} -> {order['candidateVersion']}",
            "",
            f"- Spread: `{order['spreadLabel']}`",
            f"- Severity: `{order['severity']}`",
            f"- Status: `{order.get('status')}`",
            f"- Human ask: {order.get('humanAsk') or ''}",
            f"- Agent-safe parallel work: {order.get('agentSafeParallelWork') or ''}",
            f"- Primary action: `{order.get('primaryLabel') or ''}`",
            f"- Primary path: `{order.get('primaryPath') or ''}`",
            f"- Primary command: `{order.get('primaryCommand') or ''}`",
            f"- Candidate folder: `{order['candidateVersionDir']}`",
            f"- Candidate already exists: `{order.get('candidateAlreadyExists')}`",
            f"- Candidate status: `{order.get('candidateStatus') or 'not-created-yet'}`",
            f"- Candidate review packet: `{order.get('candidateReviewStatus') or 'not-created-yet'}`",
            f"- Candidate review HTML: `{order.get('candidateReviewHtmlPath') or ''}`",
            f"- Sync investigation: `{order.get('syncInvestigationStatus') or 'not-created-yet'}`",
            f"- Sync investigation HTML: `{order.get('syncInvestigationHtmlPath') or ''}`",
            f"- Candidate duration spread: `{order.get('candidateDurationSpreadSeconds') if order.get('candidateDurationSpreadSeconds') is not None else 'unknown'}`",
            f"- Sync investigation first: `{order.get('syncInvestigationFirst')}`",
            f"- Recommendation: {order['recommendedSafeAction']}",
            f"- Human confirmation required to create candidate: `{order['requiresHumanConfirmation']}`",
            "",
            "### Candidate commands not executed",
            "",
        ])
        for command in order["candidateCommands"]:
            lines.extend([f"- {command['label']}", f"  - Safety: {command.get('safety') or 'Candidate command only; human confirmation required.'}", "", "```bash", command["command"], "```", ""])
    (session_dir / "START-HERE-duration-repair-workorders.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def write_csv(session_dir: Path, payload: dict[str, Any]) -> None:
    with (session_dir / "duration-repair-workorders.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["episode", "currentVersion", "candidateVersion", "status", "spreadSeconds", "severity", "candidateAlreadyExists", "candidateStatus", "candidateReviewStatus", "syncInvestigationStatus", "syncInvestigationFirst", "candidateDurationSpreadSeconds", "humanAsk", "agentSafeParallelWork", "primaryLabel", "primaryPath", "primaryCommand", "recommendedSafeAction", "candidateVersionDir", "candidateManifestPath", "candidateReviewHtmlPath", "syncInvestigationHtmlPath"])
        writer.writeheader()
        for order in payload["workorders"]:
            writer.writerow({key: order.get(key, "") for key in writer.fieldnames or []})


def update_latest(release_root: Path, session_dir: Path, payload: dict[str, Any]) -> None:
    candidate_ready = any(order.get("candidateAlreadyExists") for order in payload["workorders"])
    pointer = {
        "schema": "quipsly.studio-duration-repair-workorders.latest-pointer.v1",
        "updatedAt": iso_now(),
        "status": "candidate-review-ready" if candidate_ready else "workorders-ready" if payload["workorders"] else "no-duration-workorders",
        "latestSessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "duration-repair-workorders.json"),
        "markdownPath": str(session_dir / "START-HERE-duration-repair-workorders.md"),
        "csvPath": str(session_dir / "duration-repair-workorders.csv"),
        "counts": payload["counts"],
        "humanAsk": payload.get("humanAsk") or "",
        "agentSafeParallelWork": payload.get("agentSafeParallelWork") or "",
        "nextSafestAction": payload.get("nextSafestAction") or "",
        "firstSafeAction": payload.get("firstSafeAction") or {},
        "episodes": [order["episode"] for order in payload["workorders"]],
        "sourceFilesMutated": False,
        "versionsOverwritten": False,
        "externalPublishing": False,
        "receiptTruthCreated": False,
    }
    write_json(release_root / "review-board" / "duration-repair-workorders" / "latest-duration-repair-workorders.json", pointer)
    write_json(release_root / "review-board" / "latest-duration-repair-workorders.json", {
        **pointer,
        "schema": "quipsly.studio-duration-repair-workorders.latest-alias.v1",
        "canonicalPointerPath": str(release_root / "review-board" / "duration-repair-workorders" / "latest-duration-repair-workorders.json"),
        "truth": "Alias pointer only. The canonical duration repair workorder pointer remains under review-board/duration-repair-workorders/.",
    })


def build(release_root: Path) -> tuple[Path, dict[str, Any]]:
    session_dir = prepare_session(release_root)
    workorders = [hydrate_workorder_affordances(order) for path in discover_warning_manifests(release_root) if (order := build_workorder(path))]
    first_order = workorders[0] if workorders else {}
    candidate_ready = any(order.get("candidateAlreadyExists") for order in workorders)
    candidate_review_ready = any(order.get("candidateReviewHtmlPath") for order in workorders)
    sync_first = any(order.get("syncInvestigationFirst") for order in workorders)
    payload = {
        "schema": SCHEMA,
        "generatedAt": iso_now(),
        "releaseRoot": str(release_root),
        "sessionDir": str(session_dir),
        "truth": "Duration repair work orders only. Candidate commands are not executed; no originals, versions, approvals, uploads, schedules, publications, or receipts are changed.",
        "workorders": workorders,
        "nextSafestAction": (
            "Open duration candidate review packets and sync investigation packets first. Candidate-ready items need watch/listen review; major spreads need sync/content investigation before any trim candidate."
            if candidate_review_ready and sync_first
            else
            "Open duration candidate review packets first, inspect beginning/middle/ending evidence, then promote or reject candidates without changing receipt truth."
            if candidate_review_ready
            else
            "Open existing duration candidate folders first, perform watch/listen review, then promote or reject candidates without changing receipt truth."
            if candidate_ready
            else
            "Open or generate sync investigation packets first for major A/V spreads. Do not create trim candidates until sync/content intent is understood."
            if sync_first
            else
            "Open the work orders, review each duration spread against evidence snippets, then run candidate commands only after explicit human confirmation."
            if workorders
            else "No duration repair work orders are currently queued."
        ),
        "humanAsk": (
            "Review Episode 1 duration-candidate evidence first, then Episode 4 sync evidence. Record promote/refine/hold/re-stack/source-needed decisions before Tower approval."
            if candidate_review_ready and sync_first
            else
            "Watch/listen the candidate review packet, then decide promote, refine, or hold before any publishing approval."
            if candidate_review_ready or candidate_ready
            else
            "Inspect duration/sync evidence before running any candidate repair command."
            if workorders
            else "No duration workorder human action is needed right now."
        ),
        "agentSafeParallelWork": (
            "Codex can summarize review evidence, improve packets, prepare dry-run decision notes, and keep Episode 1/Episode 4 blocker language precise. "
            "It must not promote, approve, trim, rebuild, publish, upload, schedule, overwrite, delete, mutate sources, or capture receipts without explicit approval."
            if workorders
            else "Codex can keep validation current and avoid creating fake repair work."
        ),
        "firstSafeAction": {
            "label": "Open duration repair work orders",
            "command": f"open {shell_quote(str(session_dir / 'index.html'))}",
            "path": str(session_dir / "index.html"),
            "safety": "Open local work orders only. Candidate repair commands are not executed.",
            "episode": first_order.get("episode") or "",
            "candidateVersion": first_order.get("candidateVersion") or "",
            "spreadLabel": first_order.get("spreadLabel") or "",
        } if workorders else {},
        "firstCandidateReviewAction": first_order.get("firstSafeAction") if candidate_ready and first_order.get("firstSafeAction") else {},
        "counts": {
            "workorders": len(workorders),
            "majorHumanReview": sum(1 for order in workorders if order.get("severity") == "major-human-review"),
            "candidateCommands": sum(len(order.get("candidateCommands", [])) for order in workorders),
            "candidateManifests": sum(1 for order in workorders if order.get("candidateAlreadyExists")),
            "candidatesReadyForReview": sum(1 for order in workorders if order.get("candidateAlreadyExists")),
            "candidateReviewPackets": sum(1 for order in workorders if order.get("candidateReviewHtmlPath")),
            "syncInvestigationFirst": sum(1 for order in workorders if order.get("syncInvestigationFirst")),
            "syncInvestigationPackets": sum(1 for order in workorders if order.get("syncInvestigationHtmlPath")),
            "sourceFilesMutated": False,
            "versionsOverwritten": False,
            "externalPublishing": False,
            "receiptTruthCreated": False,
        },
    }
    write_json(session_dir / "duration-repair-workorders.json", payload)
    (session_dir / "index.html").write_text(render_html(payload), encoding="utf-8")
    write_markdown(session_dir, payload)
    write_csv(session_dir, payload)
    update_latest(release_root, session_dir, payload)
    return session_dir, payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build safe duration repair work orders.")
    parser.add_argument("release_root", nargs="?", default=str(DEFAULT_RELEASE_ROOT))
    args = parser.parse_args()
    session_dir, payload = build(Path(args.release_root))
    candidate_ready = any(order.get("candidateAlreadyExists") for order in payload["workorders"])
    print(json.dumps({
        "ok": True,
        "status": "candidate-review-ready" if candidate_ready else "workorders-ready" if payload["workorders"] else "no-duration-workorders",
        "sessionDir": str(session_dir),
        "htmlPath": str(session_dir / "index.html"),
        "jsonPath": str(session_dir / "duration-repair-workorders.json"),
        "markdownPath": str(session_dir / "START-HERE-duration-repair-workorders.md"),
        "csvPath": str(session_dir / "duration-repair-workorders.csv"),
        "counts": payload["counts"],
        "truth": payload["truth"],
    }, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
