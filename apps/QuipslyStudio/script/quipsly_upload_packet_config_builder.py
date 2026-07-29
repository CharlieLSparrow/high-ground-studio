#!/usr/bin/env python3
"""Build reusable Quipsly upload-packet configs from one compact manifest.

This is glue, not publishing. It creates the JSON configs and run scripts needed
for the generic caption upload-safe pass, generic social-short renderer, and
final upload-packet QC checker.

It never uploads, publishes, mutates source media, or overwrites existing output
unless --force is explicitly supplied.
"""

from __future__ import annotations

import argparse
import json
import shlex
import stat
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

SCHEMA = "quipsly.upload-packet.config-builder.v1"
OUTPUT_SCHEMA = "quipsly.upload-packet.config-builder-output.v1"


@dataclass
class BuilderCheck:
    id: str
    status: str
    detail: str
    path: str | None = None


@dataclass
class BuilderOutput:
    schema: str = OUTPUT_SCHEMA
    status: str = "not-run"
    episodeId: str = ""
    title: str = ""
    readyDir: str = ""
    outputDir: str = ""
    generatedFiles: list[str] = field(default_factory=list)
    checks: list[BuilderCheck] = field(default_factory=list)
    commands: dict[str, str] = field(default_factory=dict)


class BuilderError(RuntimeError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise BuilderError(f"manifest missing: {path}") from exc
    except json.JSONDecodeError as exc:
        raise BuilderError(f"manifest is not valid JSON: {path}: {exc}") from exc


def resolve_path(base: Path, value: str | None) -> Path | None:
    if not value:
        return None
    path = Path(value)
    return path if path.is_absolute() else base / path


def rel_to(path: Path, base: Path) -> str:
    try:
        return str(path.relative_to(base))
    except ValueError:
        return str(path)


def shell_join(parts: list[str | Path]) -> str:
    return " ".join(shlex.quote(str(part)) for part in parts)


def add_check(checks: list[BuilderCheck], check_id: str, path: Path | None, *, optional: bool = False) -> None:
    if path is None:
        if optional:
            checks.append(BuilderCheck(check_id, "skipped", "optional path not configured"))
        else:
            checks.append(BuilderCheck(check_id, "failed", "path not configured"))
        return
    if path.exists() and (path.is_dir() or path.stat().st_size > 0):
        checks.append(BuilderCheck(check_id, "passed", "exists", str(path)))
    elif optional:
        checks.append(BuilderCheck(check_id, "warning", "optional path missing", str(path)))
    else:
        checks.append(BuilderCheck(check_id, "failed", "required path missing or empty", str(path)))


def write_json(path: Path, payload: dict[str, Any], *, force: bool, generated: list[str]) -> None:
    if path.exists() and not force:
        raise BuilderError(f"refusing to overwrite existing file without --force: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    generated.append(str(path))


def write_text(path: Path, text: str, *, force: bool, executable: bool = False, generated: list[str]) -> None:
    if path.exists() and not force:
        raise BuilderError(f"refusing to overwrite existing file without --force: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    if executable:
        mode = path.stat().st_mode
        path.chmod(mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    generated.append(str(path))


def build_caption_config(manifest: dict[str, Any], ready_dir: Path, output_dir: Path) -> tuple[dict[str, Any], Path]:
    section = manifest.get("captionUploadSafe") or {}
    caption_output_dir = section.get("outputDir") or "captions-upload-safe-builder"
    payload = {
        "schema": "quipsly.caption-upload-safe.config.v1",
        "episodeId": manifest["episodeId"],
        "title": manifest.get("episodeTitle", manifest["episodeId"]),
        "readyDir": str(ready_dir),
        "outputDir": caption_output_dir,
        "outputJson": section.get("outputJson", "caption-upload-safe-qc.json"),
        "outputMarkdown": section.get("outputMarkdown", "caption-upload-safe-qc.md"),
        "uploadQcJson": section.get("uploadQcJson"),
        "uploadQcKey": section.get("uploadQcKey", "captionUploadSafe"),
        "uploadQcSummaryKey": section.get("uploadQcSummaryKey", "captionUploadSafeSummary"),
        "shortsManifest": section.get("shortsManifest"),
        "items": section.get("items", []),
    }
    path = output_dir / "caption-upload-safe.config.json"
    return payload, path


def build_social_config(manifest: dict[str, Any], ready_dir: Path, output_dir: Path) -> tuple[dict[str, Any], Path]:
    section = manifest.get("socialShorts") or {}
    payload = {
        "schema": "quipsly.social-shorts.config.v1",
        "episodeId": manifest["episodeId"],
        "episodeTitle": manifest.get("episodeTitle", manifest["episodeId"]),
        "readyDir": str(ready_dir),
        "inputVideo": section["inputVideo"],
        "inputTranscript": section["inputTranscript"],
        "outputDir": section.get("outputDir", "social-shorts-builder"),
        "manifestName": section.get("manifestName", "social-shorts-manifest.json"),
        "readmeName": section.get("readmeName", "START_HERE_SOCIAL_SHORTS.md"),
        "brandTitle": section.get("brandTitle", "High Ground Odyssey"),
        "brandSubtitle": section.get("brandSubtitle", "Leadership stories for the high ground"),
        "hashtags": section.get("hashtags", "#HighGroundOdyssey #Leadership #Podcast"),
        "outputSuffix": section.get("outputSuffix", "9x16-builder"),
        "uploadQcJson": section.get("uploadQcJson"),
        "uploadQcKey": section.get("uploadQcKey", "socialShorts"),
        "uploadQcSummaryKey": section.get("uploadQcSummaryKey", "socialShortsSummary"),
        "candidates": section.get("candidates", []),
    }
    path = output_dir / "social-shorts.config.json"
    return payload, path


def build_final_qc_command(manifest: dict[str, Any], ready_dir: Path) -> list[str]:
    long_form = manifest.get("longForm") or {}
    section = manifest.get("finalPacketQc") or {}
    social = manifest.get("socialShorts") or {}
    captions = long_form.get("captions")
    parts: list[str] = [
        "python3",
        "apps/QuipslyStudio/script/quipsly_final_upload_packet_qc.py",
        "--ready-dir",
        str(ready_dir),
        "--episode-id",
        manifest["episodeId"],
        "--title",
        manifest.get("episodeTitle", manifest["episodeId"]),
        "--recommendation",
        manifest.get("recommendation", "Review the local packet and upload only after human approval."),
        "--youtube-video",
        long_form["youtubeVideo"],
        "--podcast-audio",
        long_form["podcastAudio"],
    ]
    if long_form.get("podcastFallback"):
        parts += ["--podcast-fallback", long_form["podcastFallback"]]
    if captions:
        parts += ["--captions", captions]
    if long_form.get("metadata"):
        parts += ["--metadata", long_form["metadata"]]
    shorts_start = section.get("socialShortsStartHere") or (
        f"{social.get('outputDir', 'social-shorts-builder')}/{social.get('readmeName', 'START_HERE_SOCIAL_SHORTS.md')}"
        if social
        else None
    )
    shorts_manifest = section.get("socialShortsManifest") or (
        f"{social.get('outputDir', 'social-shorts-builder')}/{social.get('manifestName', 'social-shorts-manifest.json')}"
        if social
        else None
    )
    if shorts_start:
        parts += ["--social-shorts-start-here", shorts_start]
    if shorts_manifest:
        parts += ["--social-shorts-manifest", shorts_manifest]
    if section.get("producerHandoff"):
        parts += ["--producer-handoff", section["producerHandoff"]]
    if section.get("uploadQcJson"):
        parts += ["--upload-qc-json", section["uploadQcJson"]]
    if section.get("publicationReceipts"):
        parts += ["--publication-receipts", section["publicationReceipts"]]
    if section.get("expectedShortCount") is not None:
        parts += ["--expected-short-count", str(section["expectedShortCount"])]
    if section.get("outputStem"):
        parts += ["--output-stem", section["outputStem"]]
    if section.get("startHereName"):
        parts += ["--start-here-name", section["startHereName"]]
    if section.get("desktopLauncher"):
        parts += ["--desktop-launcher", section["desktopLauncher"]]
    if section.get("expectedWidth"):
        parts += ["--expected-video-width", str(section["expectedWidth"])]
    if section.get("expectedHeight"):
        parts += ["--expected-video-height", str(section["expectedHeight"])]
    return parts


def build_report(manifest_path: Path, manifest: dict[str, Any], *, dry_run: bool, force: bool) -> BuilderOutput:
    if manifest.get("schema") != SCHEMA:
        raise BuilderError(f"unsupported manifest schema: {manifest.get('schema')!r}; expected {SCHEMA}")
    ready_dir = resolve_path(manifest_path.parent, manifest.get("readyDir", "."))
    if ready_dir is None:
        raise BuilderError("readyDir is required")
    ready_dir = ready_dir.resolve()
    output_dir = resolve_path(ready_dir, manifest.get("outputDir", "upload-packet-config-builder"))
    if output_dir is None:
        raise BuilderError("outputDir is required")
    output_dir = output_dir.resolve()

    generated: list[str] = []
    checks: list[BuilderCheck] = []
    add_check(checks, "ready-dir", ready_dir)

    long_form = manifest.get("longForm") or {}
    add_check(checks, "youtube-video", resolve_path(ready_dir, long_form.get("youtubeVideo")))
    add_check(checks, "podcast-audio", resolve_path(ready_dir, long_form.get("podcastAudio")))
    add_check(checks, "podcast-fallback", resolve_path(ready_dir, long_form.get("podcastFallback")), optional=True)
    add_check(checks, "captions", resolve_path(ready_dir, long_form.get("captions")), optional=True)
    add_check(checks, "metadata", resolve_path(ready_dir, long_form.get("metadata")), optional=True)

    caption_config, caption_config_path = build_caption_config(manifest, ready_dir, output_dir)
    social_config, social_config_path = build_social_config(manifest, ready_dir, output_dir)
    final_qc_command = build_final_qc_command(manifest, ready_dir)

    caption_run = output_dir / "run-caption-upload-safe.sh"
    social_run = output_dir / "run-social-shorts.sh"
    final_run = output_dir / "run-final-packet-qc.sh"
    readme = output_dir / "README.md"
    output_manifest = output_dir / "builder-output-manifest.json"

    caption_command = [
        "python3",
        "apps/QuipslyStudio/script/quipsly_caption_upload_safe.py",
        "--config",
        str(caption_config_path),
    ]
    social_command = [
        "python3",
        "apps/QuipslyStudio/script/quipsly_social_shorts.py",
        "--config",
        str(social_config_path),
    ]

    commands = {
        "captionUploadSafe": shell_join(caption_command),
        "socialShorts": shell_join(social_command),
        "finalPacketQc": shell_join(final_qc_command),
    }

    report = BuilderOutput(
        status="planned" if dry_run else "generated",
        episodeId=manifest["episodeId"],
        title=manifest.get("episodeTitle", manifest["episodeId"]),
        readyDir=str(ready_dir),
        outputDir=str(output_dir),
        checks=checks,
        commands=commands,
    )

    if dry_run:
        return report

    write_json(caption_config_path, caption_config, force=force, generated=generated)
    write_json(social_config_path, social_config, force=force, generated=generated)
    write_text(
        caption_run,
        "#!/usr/bin/env bash\nset -euo pipefail\ncd /Users/wall-e/Dev/high-ground-studio\n" + shell_join(caption_command) + "\n",
        force=force,
        executable=True,
        generated=generated,
    )
    write_text(
        social_run,
        "#!/usr/bin/env bash\nset -euo pipefail\ncd /Users/wall-e/Dev/high-ground-studio\n" + shell_join(social_command) + "\n",
        force=force,
        executable=True,
        generated=generated,
    )
    write_text(
        final_run,
        "#!/usr/bin/env bash\nset -euo pipefail\ncd /Users/wall-e/Dev/high-ground-studio\n" + shell_join(final_qc_command) + "\n",
        force=force,
        executable=True,
        generated=generated,
    )
    write_text(
        readme,
        "\n".join(
            [
                f"# Upload packet config builder: {report.title}",
                "",
                "This folder was generated from a single Quipsly upload-packet manifest.",
                "It does not upload or publish anything. It only creates repeatable local QC/render commands.",
                "",
                "## Commands",
                "",
                "```bash",
                str(caption_run),
                str(social_run),
                str(final_run),
                "```",
                "",
                "## Truth",
                "",
                "- Source media stays untouched.",
                "- Existing upload files are not overwritten by these scripts unless their own tools are pointed at distinct output names.",
                "- External publication still requires explicit human approval and real platform receipts.",
                "",
            ]
        ),
        force=force,
        generated=generated,
    )
    report.generatedFiles = generated + [str(output_manifest)]
    write_json(output_manifest, asdict(report), force=force, generated=[])
    report.generatedFiles = generated + [str(output_manifest)]
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--json", action="store_true", help="print full JSON report")
    args = parser.parse_args()

    try:
        manifest_path = args.manifest.expanduser().resolve()
        manifest = load_json(manifest_path)
        report = build_report(manifest_path, manifest, dry_run=args.dry_run, force=args.force)
    except BuilderError as exc:
        print(f"ERROR {exc}")
        return 1

    if args.json:
        print(json.dumps(asdict(report), indent=2, sort_keys=True))
    else:
        failed = [check for check in report.checks if check.status == "failed"]
        warnings = [check for check in report.checks if check.status == "warning"]
        print(
            f"status={report.status} episode={report.episodeId} "
            f"generated={len(report.generatedFiles)} failedChecks={len(failed)} warnings={len(warnings)}"
        )
        print(f"outputDir={report.outputDir}")
        for name, command in report.commands.items():
            print(f"{name}: {command}")
        for check in failed:
            print(f"FAILED {check.id}: {check.detail} {check.path or ''}")
        for check in warnings:
            print(f"WARNING {check.id}: {check.detail} {check.path or ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
