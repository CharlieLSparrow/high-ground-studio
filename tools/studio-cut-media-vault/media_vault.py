#!/usr/bin/env python3
"""Studio Cut media vault operator helper.

This tool creates lightweight manifests and upload plans for local media folders.
It intentionally does not authenticate to Google Cloud or upload by default.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BUCKET = "high-ground-odyssey-media"
DEFAULT_LOCATION = "US"
SCHEMA_VERSION = 1
DEFAULT_INSTA360_COLLECTION_ID = "homer-insta360"
DEFAULT_INSTA360_STAGING_ROOT = "~/Movies/StudioCut/media-vault-intake"
DEFAULT_MAX_DISCOVERY_FILES = 1000
DEFAULT_MIN_FREE_GB = 5.0

VIDEO_EXTENSIONS = {
    ".insv",
    ".mp4",
    ".mov",
    ".m4v",
    ".360",
    ".avi",
    ".mkv",
}
PHOTO_EXTENSIONS = {
    ".insp",
    ".jpg",
    ".jpeg",
    ".png",
    ".dng",
    ".heic",
    ".tif",
    ".tiff",
}
AUDIO_EXTENSIONS = {
    ".wav",
    ".m4a",
    ".mp3",
    ".aac",
    ".flac",
}
SIDECAR_EXTENSIONS = {
    ".json",
    ".xml",
    ".edl",
    ".srt",
    ".vtt",
    ".lrv",
}
INSTA360_SOURCE_EXTENSIONS = {
    ".insv",
    ".insp",
    ".360",
}
INSTA360_EXPORT_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".m4v",
    ".jpg",
    ".jpeg",
    ".png",
    ".dng",
    ".heic",
}
INSTA360_MEDIA_EXTENSIONS = INSTA360_SOURCE_EXTENSIONS | INSTA360_EXPORT_EXTENSIONS


def default_insta360_scan_dirs() -> list[Path]:
    home = Path.home()
    candidates = [
        home / "Movies" / "Insta360",
        home / "Movies" / "Insta360 Studio",
        home / "Movies" / "Insta360Studio",
        home / "Movies" / "StudioCut" / "insta360",
        home / "Movies" / "StudioCut" / "episode-004" / "inbox",
        home / "Pictures" / "Insta360",
        home / "Pictures" / "Insta360 Studio",
        home / "Documents" / "Insta360",
        home / "Downloads" / "Insta360",
        home / "Library" / "Application Support" / "Insta360",
        home / "Library" / "Application Support" / "Insta360 Studio",
        home / "Library" / "Containers" / "com.insta360.studio",
    ]
    return [path for path in candidates if path.exists()]


@dataclass(frozen=True)
class MediaVaultAsset:
    asset_id: str
    file_name: str
    relative_path: str
    size_bytes: int
    content_type: str
    media_kind: str
    capture_source: str
    cloud_object_path: str
    sha256: str


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sanitize_part(value: str) -> str:
    sanitized = "".join(
        character.lower() if character.isalnum() else "-"
        for character in value.strip()
    )
    while "--" in sanitized:
        sanitized = sanitized.replace("--", "-")
    return sanitized.strip("-") or "studio-cut-media"


def sanitize_file_name(value: str) -> str:
    path = Path(value)
    stem = sanitize_part(path.stem)
    suffix = path.suffix.lower()
    if suffix and suffix[1:].isalnum():
        return f"{stem}{suffix}"
    return stem


def unique_child_path(directory: Path, file_name: str) -> Path:
    candidate = directory / sanitize_file_name(file_name)
    if not candidate.exists():
        return candidate

    source_name = Path(file_name)
    stem = sanitize_part(source_name.stem)
    suffix = source_name.suffix.lower()
    counter = 2
    while True:
        candidate = directory / f"{stem}-{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def classify_media_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in VIDEO_EXTENSIONS:
        return "video"
    if suffix in PHOTO_EXTENSIONS:
        return "photo"
    if suffix in AUDIO_EXTENSIONS:
        return "audio"
    if suffix in SIDECAR_EXTENSIONS:
        return "sidecar"
    return "other"


def infer_capture_source(path: Path) -> str:
    normalized = " ".join(path.parts).lower()
    file_name = path.name.lower()
    suffix = path.suffix.lower()

    if suffix in {".insv", ".insp", ".360"} or "insta360" in normalized:
        return "insta360"
    if "canon" in normalized or "r8" in normalized:
        return "canon"
    if "dji" in normalized or "mic" in normalized:
        return "dji"
    if "shure" in normalized or "mv7" in normalized:
        return "shure"
    if "iphone" in normalized or "phone" in normalized:
        return "iphone"
    if file_name.startswith("gopro"):
        return "gopro"
    return "unknown"


def guess_content_type(path: Path) -> str:
    suffix = path.suffix.lower()
    explicit_types = {
        ".insv": "video/mp4",
        ".insp": "image/jpeg",
        ".360": "video/mp4",
        ".m4v": "video/x-m4v",
        ".dng": "image/x-adobe-dng",
    }
    if suffix in explicit_types:
        return explicit_types[suffix]

    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_media_files(source_dir: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(source_dir.rglob("*")):
        if not path.is_file():
            continue
        if any(part.startswith(".") for part in path.relative_to(source_dir).parts):
            continue
        if classify_media_kind(path) == "other":
            continue
        files.append(path)
    return files


def is_likely_insta360_media(path: Path, root: Path) -> bool:
    suffix = path.suffix.lower()
    if suffix not in INSTA360_MEDIA_EXTENSIONS:
        return False
    if suffix in INSTA360_SOURCE_EXTENSIONS:
        return True

    relative_text = path.relative_to(root).as_posix().lower()
    path_text = path.as_posix().lower()
    return (
        "insta360" in relative_text
        or "insta360" in path_text
        or "360" in path.name.lower()
        or path.name.lower().startswith(("insv", "insp"))
    )


def discover_insta360_files(
    *,
    scan_dirs: list[Path],
    max_files: int,
) -> tuple[list[Path], list[str]]:
    discovered: list[Path] = []
    warnings: list[str] = []
    seen: set[Path] = set()

    for scan_dir in scan_dirs:
        resolved_scan_dir = scan_dir.expanduser().resolve()
        if not resolved_scan_dir.exists():
            warnings.append(f"Scan directory not found: {scan_dir}")
            continue
        if not resolved_scan_dir.is_dir():
            warnings.append(f"Scan path is not a directory: {scan_dir}")
            continue

        for path in sorted(resolved_scan_dir.rglob("*")):
            if len(discovered) >= max_files:
                warnings.append(f"Stopped discovery at max file count: {max_files}")
                return discovered, warnings
            if not path.is_file():
                continue
            try:
                relative_parts = path.relative_to(resolved_scan_dir).parts
            except ValueError:
                continue
            if any(part.startswith(".") for part in relative_parts):
                continue
            if not is_likely_insta360_media(path, resolved_scan_dir):
                continue
            resolved_path = path.resolve()
            if resolved_path in seen:
                continue
            seen.add(resolved_path)
            discovered.append(resolved_path)

    return discovered, warnings


def file_summary(path: Path) -> dict[str, Any]:
    return {
        "path": str(path),
        "fileName": path.name,
        "sizeBytes": path.stat().st_size,
        "mediaKind": classify_media_kind(path),
        "contentType": guess_content_type(path),
        "captureSource": infer_capture_source(path),
    }


def stage_files(
    *,
    files: list[Path],
    out_dir: Path,
    mode: str,
) -> list[dict[str, Any]]:
    staged: list[dict[str, Any]] = []
    for source_path in files:
        media_kind = classify_media_kind(source_path)
        capture_source = infer_capture_source(source_path)
        target_dir = out_dir / "inbox" / media_kind / capture_source
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = unique_child_path(target_dir, source_path.name)

        if mode == "copy":
            shutil.copy2(source_path, target_path)
        elif mode == "symlink":
            target_path.symlink_to(source_path)
        else:
            raise ValueError(f"Unknown staging mode: {mode}")

        staged.append(
            {
                "sourcePath": str(source_path),
                "stagedPath": str(target_path),
                "relativePath": target_path.relative_to(out_dir / "inbox").as_posix(),
                "mode": mode,
                "mediaKind": media_kind,
                "captureSource": capture_source,
                "sizeBytes": source_path.stat().st_size,
            }
        )
    return staged


def build_asset(
    *,
    source_dir: Path,
    file_path: Path,
    project_id: str,
    collection_id: str,
    storage_prefix: str,
) -> MediaVaultAsset:
    relative_path = file_path.relative_to(source_dir).as_posix()
    file_hash = hash_file(file_path)
    media_kind = classify_media_kind(file_path)
    capture_source = infer_capture_source(file_path.relative_to(source_dir))
    object_file_name = f"{file_hash[:12]}-{sanitize_file_name(file_path.name)}"
    cloud_object_path = "/".join(
        part.strip("/")
        for part in [
            storage_prefix,
            sanitize_part(project_id),
            sanitize_part(collection_id),
            "originals",
            media_kind,
            capture_source,
            object_file_name,
        ]
        if part.strip("/")
    )

    return MediaVaultAsset(
        asset_id=f"{sanitize_part(file_path.stem)}-{file_hash[:12]}",
        file_name=file_path.name,
        relative_path=relative_path,
        size_bytes=file_path.stat().st_size,
        content_type=guess_content_type(file_path),
        media_kind=media_kind,
        capture_source=capture_source,
        cloud_object_path=cloud_object_path,
        sha256=file_hash,
    )


def build_manifest(
    *,
    source_dir: Path,
    project_id: str,
    collection_id: str,
    bucket: str,
    storage_prefix: str,
    notes: str | None,
) -> dict[str, Any]:
    assets = [
        build_asset(
            source_dir=source_dir,
            file_path=file_path,
            project_id=project_id,
            collection_id=collection_id,
            storage_prefix=storage_prefix,
        )
        for file_path in iter_media_files(source_dir)
    ]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "createdAt": utc_now_iso(),
        "projectId": sanitize_part(project_id),
        "collectionId": sanitize_part(collection_id),
        "bucket": bucket,
        "storagePrefix": storage_prefix.strip("/"),
        "sourceDirectoryName": source_dir.name,
        "assetCount": len(assets),
        "totalSizeBytes": sum(asset.size_bytes for asset in assets),
        "assets": [
            {
                "assetId": asset.asset_id,
                "fileName": asset.file_name,
                "relativePath": asset.relative_path,
                "sizeBytes": asset.size_bytes,
                "contentType": asset.content_type,
                "mediaKind": asset.media_kind,
                "captureSource": asset.capture_source,
                "cloudObjectPath": asset.cloud_object_path,
                "sha256": asset.sha256,
            }
            for asset in assets
        ],
        **({"notes": notes} if notes else {}),
    }


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, indent=2)
        file.write("\n")


def append_jsonl(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as file:
        file.write(json.dumps(payload, sort_keys=True))
        file.write("\n")


def load_uploaded_destinations(ledger_path: Path) -> set[str]:
    uploaded: set[str] = set()
    if not ledger_path.exists():
        return uploaded
    with ledger_path.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("status") in {"uploaded_verified", "local_deleted"}:
                destination = entry.get("destination")
                if isinstance(destination, str) and destination:
                    uploaded.add(destination)
    return uploaded


def is_file_settled(path: Path, settle_seconds: int) -> bool:
    if settle_seconds <= 0:
        return True
    age_seconds = datetime.now(timezone.utc).timestamp() - path.stat().st_mtime
    return age_seconds >= settle_seconds


def byte_count_to_gb(byte_count: int) -> float:
    return round(byte_count / (1024 * 1024 * 1024), 2)


def disk_free_bytes(path: Path) -> int:
    target = path if path.exists() else path.parent
    return shutil.disk_usage(target).free


def is_icloud_managed_path(path: Path) -> bool:
    normalized_parts = [part.lower() for part in path.expanduser().parts]
    normalized_path = path.expanduser().as_posix().lower()
    return any(
        marker in normalized_path
        for marker in [
            "/library/mobile documents/",
            "com~apple~clouddocs",
            "icloud drive",
            "/icloud/",
        ]
    ) or any("icloud" in part for part in normalized_parts)


def is_cloud_mirrored_looking_path(path: Path) -> bool:
    normalized_parts = [part.lower() for part in path.expanduser().parts]
    return any(part.startswith("documents - ") for part in normalized_parts)


def file_has_icloud_placeholder_marker(path: Path) -> bool:
    xattr_path = shutil.which("xattr")
    if not xattr_path:
        return False
    try:
        result = subprocess.run(
            [xattr_path, str(path)],
            check=False,
            capture_output=True,
            text=True,
            timeout=2,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    if result.returncode != 0:
        return False
    attrs = result.stdout.lower()
    return "com.apple.icloud" in attrs or "com.apple.ubd" in attrs


def storage_preflight(source_dir: Path, *, min_free_gb: float, allow_icloud: bool) -> dict[str, Any]:
    free_bytes = disk_free_bytes(source_dir)
    free_gb = byte_count_to_gb(free_bytes)
    errors: list[str] = []
    warnings: list[str] = []
    icloud_managed = is_icloud_managed_path(source_dir)
    mirrored_looking = is_cloud_mirrored_looking_path(source_dir)

    if icloud_managed and not allow_icloud:
        errors.append(
            "Source directory appears to be iCloud-managed. Use a local buffer outside iCloud or pass --allow-icloud."
        )
    if mirrored_looking:
        warnings.append(
            "Source directory looks like a cloud-mirrored Documents folder; prefer ~/Movies/StudioCut/... for the download buffer."
        )
    if free_gb < min_free_gb:
        warnings.append(
            f"Low free space on source volume: {free_gb}GB free, recommended minimum is {min_free_gb}GB."
        )

    return {
        "sourceDir": str(source_dir),
        "freeBytes": free_bytes,
        "freeGb": free_gb,
        "minFreeGb": min_free_gb,
        "icloudManagedPath": icloud_managed,
        "cloudMirroredLookingPath": mirrored_looking,
        "allowIcloud": allow_icloud,
        "warnings": warnings,
        "errors": errors,
    }


def validate_manifest_payload(payload: Any) -> list[str]:
    errors: list[str] = []

    if not isinstance(payload, dict):
        return ["Media vault manifest must be a JSON object."]

    if payload.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("schemaVersion must be 1.")
    for key in ["projectId", "collectionId", "bucket", "storagePrefix"]:
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            errors.append(f"{key} must be a non-empty string.")
    if not isinstance(payload.get("assets"), list):
        errors.append("assets must be an array.")
        return errors

    for index, asset in enumerate(payload["assets"]):
        if not isinstance(asset, dict):
            errors.append(f"assets[{index}] must be an object.")
            continue
        for key in [
            "assetId",
            "fileName",
            "relativePath",
            "contentType",
            "mediaKind",
            "captureSource",
            "cloudObjectPath",
            "sha256",
        ]:
            if not isinstance(asset.get(key), str) or not asset[key].strip():
                errors.append(f"assets[{index}].{key} must be a non-empty string.")
        if not isinstance(asset.get("sizeBytes"), int) or asset["sizeBytes"] < 0:
            errors.append(f"assets[{index}].sizeBytes must be a non-negative integer.")
        relative_path = str(asset.get("relativePath", ""))
        cloud_path = str(asset.get("cloudObjectPath", ""))
        if os.path.isabs(relative_path) or ".." in Path(relative_path).parts:
            errors.append(f"assets[{index}].relativePath must be a safe relative path.")
        if cloud_path.startswith("/") or ".." in cloud_path.split("/"):
            errors.append(f"assets[{index}].cloudObjectPath must be a safe object path.")
        if len(str(asset.get("sha256", ""))) != 64:
            errors.append(f"assets[{index}].sha256 must be a SHA-256 hex digest.")

    return errors


def create_manifest_command(args: argparse.Namespace) -> int:
    source_dir = Path(args.source_dir).expanduser().resolve()
    if not source_dir.is_dir():
        print(f"Source directory not found: {source_dir}", file=sys.stderr)
        return 2

    manifest = build_manifest(
        source_dir=source_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
        bucket=args.bucket,
        storage_prefix=args.storage_prefix,
        notes=args.notes,
    )
    output_path = Path(args.out).expanduser()
    write_json(output_path, manifest)
    print(f"Wrote media vault manifest: {output_path}")
    print(f"Assets: {manifest['assetCount']}")
    print(f"Total size: {manifest['totalSizeBytes']} bytes")
    return 0


def validate_manifest_command(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).expanduser()
    payload = load_json(manifest_path)
    errors = validate_manifest_payload(payload)
    result = {
        "status": "blocked" if errors else "ready",
        "manifestPath": str(manifest_path),
        "assetCount": len(payload.get("assets", [])) if isinstance(payload, dict) else 0,
        "totalSizeBytes": payload.get("totalSizeBytes") if isinstance(payload, dict) else None,
        "errors": errors,
    }
    print(json.dumps(result, indent=2))
    return 1 if errors else 0


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\\''") + "'"


def plan_upload_command(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).expanduser()
    source_dir = Path(args.source_dir).expanduser().resolve()
    payload = load_json(manifest_path)
    errors = validate_manifest_payload(payload)

    if errors:
        print("Manifest is invalid:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 2

    commands = []
    bucket = payload["bucket"]
    for asset in payload["assets"]:
        local_path = source_dir / asset["relativePath"]
        destination = f"gs://{bucket}/{asset['cloudObjectPath']}"
        commands.append(
            " ".join(
                [
                    "gcloud",
                    "storage",
                    "cp",
                    shell_quote(str(local_path)),
                    shell_quote(destination),
                ]
            )
        )

    output = "\n".join(commands)
    if output:
        output += "\n"

    if args.out:
        out_path = Path(args.out).expanduser()
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(output, encoding="utf-8")
        print(f"Wrote upload plan: {out_path}")
    else:
        print(output, end="")

    return 0


def build_upload_commands(payload: dict[str, Any], source_dir: Path) -> list[tuple[Path, str]]:
    bucket = payload["bucket"]
    commands: list[tuple[Path, str]] = []
    for asset in payload["assets"]:
        local_path = source_dir / asset["relativePath"]
        if local_path.is_symlink():
            local_path = local_path.resolve()
        destination = f"gs://{bucket}/{asset['cloudObjectPath']}"
        commands.append((local_path, destination))
    return commands


def upload_manifest_command(args: argparse.Namespace) -> int:
    manifest_path = Path(args.manifest).expanduser()
    source_dir = Path(args.source_dir).expanduser().resolve()
    payload = load_json(manifest_path)
    errors = validate_manifest_payload(payload)

    if errors:
        print("Manifest is invalid:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 2

    gcloud_path = shutil.which("gcloud")
    if not gcloud_path:
        print("gcloud is not on PATH; install Google Cloud CLI before uploading.", file=sys.stderr)
        return 2

    upload_items = build_upload_commands(payload, source_dir)
    missing = [str(local_path) for local_path, _ in upload_items if not local_path.exists()]
    if missing:
        print("Upload blocked because local files are missing:", file=sys.stderr)
        for path in missing:
            print(f"  - {path}", file=sys.stderr)
        return 2

    print(
        json.dumps(
            {
                "mode": "execute" if args.execute else "dry-run",
                "manifestPath": str(manifest_path),
                "sourceDir": str(source_dir),
                "bucket": payload["bucket"],
                "assetCount": len(upload_items),
            },
            indent=2,
        )
    )

    if not args.execute:
        for local_path, destination in upload_items:
            print(f"DRY RUN: gcloud storage cp {shell_quote(str(local_path))} {shell_quote(destination)}")
        print("Add --execute to upload these files.")
        return 0

    failures: list[str] = []
    for index, (local_path, destination) in enumerate(upload_items, start=1):
        print(f"[{index}/{len(upload_items)}] Uploading {local_path.name} -> {destination}")
        result = subprocess.run(
            [gcloud_path, "storage", "cp", str(local_path), destination],
            check=False,
        )
        if result.returncode != 0:
            failures.append(f"{local_path} -> {destination}")
            if not args.continue_on_error:
                break

    if failures:
        print("Upload failed for:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    print("Upload complete.")
    return 0


def describe_gcs_object(gcloud_path: str, destination: str) -> dict[str, Any]:
    result = subprocess.run(
        [gcloud_path, "storage", "objects", "describe", destination, "--format=json"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return {
            "status": "blocked",
            "error": result.stderr.strip() or result.stdout.strip(),
        }
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {
            "status": "blocked",
            "error": "gcloud returned non-JSON object metadata.",
            "raw": result.stdout.strip(),
        }
    return {
        "status": "ready",
        "metadata": payload,
        "sizeBytes": int(payload.get("size", -1)) if str(payload.get("size", "")).isdigit() else None,
        "generation": payload.get("generation"),
        "crc32c": payload.get("crc32c"),
        "md5Hash": payload.get("md5Hash"),
    }


def drain_folder_once(args: argparse.Namespace) -> dict[str, Any]:
    source_dir = Path(args.source_dir).expanduser().resolve()
    ledger_path = Path(args.ledger).expanduser() if args.ledger else source_dir / ".studio-cut-media-vault-ledger.jsonl"
    if not source_dir.is_dir():
        return {
            "status": "blocked",
            "errors": [f"Source directory not found: {source_dir}"],
        }

    preflight = storage_preflight(
        source_dir,
        min_free_gb=args.min_free_gb,
        allow_icloud=args.allow_icloud,
    )
    if preflight["errors"]:
        return {
            "status": "blocked",
            "mode": "execute" if args.execute else "dry-run",
            "sourceDir": str(source_dir),
            "ledgerPath": str(ledger_path),
            "storagePreflight": preflight,
            "processedCount": 0,
            "skippedCount": 0,
            "processed": [],
            "skipped": [],
            "errors": preflight["errors"],
        }

    files = iter_media_files(source_dir)
    uploaded_destinations = load_uploaded_destinations(ledger_path)
    gcloud_path = shutil.which("gcloud")
    if args.execute and not gcloud_path:
        return {
            "status": "blocked",
            "errors": ["gcloud is not on PATH; install Google Cloud CLI before uploading."],
        }

    processed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    errors: list[str] = []

    for file_path in files[: args.max_files]:
        if not args.allow_icloud and file_has_icloud_placeholder_marker(file_path):
            skipped.append(
                {
                    "fileName": file_path.name,
                    "reason": "iCloud placeholder/managed file marker detected; pass --allow-icloud only after confirming the file is fully local",
                }
            )
            continue
        if not is_file_settled(file_path, args.settle_seconds):
            skipped.append(
                {
                    "fileName": file_path.name,
                    "reason": f"waiting for file to settle for {args.settle_seconds}s",
                }
            )
            continue

        asset = build_asset(
            source_dir=source_dir,
            file_path=file_path,
            project_id=args.project_id,
            collection_id=args.collection_id,
            storage_prefix=args.storage_prefix,
        )
        destination = f"gs://{args.bucket}/{asset.cloud_object_path}"
        local_entry = {
            "createdAt": utc_now_iso(),
            "sourcePath": str(file_path),
            "relativePath": asset.relative_path,
            "destination": destination,
            "assetId": asset.asset_id,
            "sha256": asset.sha256,
            "sizeBytes": asset.size_bytes,
            "mediaKind": asset.media_kind,
            "captureSource": asset.capture_source,
        }

        if destination in uploaded_destinations:
            skipped.append({"fileName": file_path.name, "reason": "destination already verified in ledger"})
            continue

        if not args.execute:
            processed.append({**local_entry, "status": "dry_run"})
            continue

        assert gcloud_path is not None
        print(f"Uploading {file_path.name} -> {destination}")
        upload_result = subprocess.run(
            [gcloud_path, "storage", "cp", str(file_path), destination],
            check=False,
        )
        if upload_result.returncode != 0:
            entry = {**local_entry, "status": "upload_failed"}
            append_jsonl(ledger_path, entry)
            errors.append(f"Upload failed: {file_path}")
            if not args.continue_on_error:
                break
            continue

        describe = describe_gcs_object(gcloud_path, destination)
        verified = describe.get("status") == "ready" and describe.get("sizeBytes") == asset.size_bytes
        verified_entry = {
            **local_entry,
            "status": "uploaded_verified" if verified else "uploaded_unverified",
            "gcsGeneration": describe.get("generation"),
            "gcsCrc32c": describe.get("crc32c"),
            "gcsMd5Hash": describe.get("md5Hash"),
            "verifiedSizeBytes": describe.get("sizeBytes"),
        }
        append_jsonl(ledger_path, verified_entry)
        processed.append(verified_entry)

        if not verified:
            errors.append(f"Uploaded object could not be size-verified: {destination}")
            if not args.continue_on_error:
                break
            continue

        if args.delete_local_after_upload:
            file_path.unlink()
            delete_entry = {
                **local_entry,
                "status": "local_deleted",
                "deletedAt": utc_now_iso(),
                "remoteDeletionStatus": "manual_pending",
            }
            append_jsonl(ledger_path, delete_entry)
            processed.append(delete_entry)

    status = "blocked" if errors else "ready"
    return {
        "status": status,
        "mode": "execute" if args.execute else "dry-run",
        "sourceDir": str(source_dir),
        "ledgerPath": str(ledger_path),
        "storagePreflight": preflight,
        "processedCount": len(processed),
        "skippedCount": len(skipped),
        "processed": processed,
        "skipped": skipped,
        "errors": errors,
        "nextStep": (
            "Delete remote files manually in the Insta360 app only after ledger entries show uploaded_verified/local_deleted."
            if args.delete_local_after_upload
            else "Run with --execute after reviewing the dry run. Add --delete-local-after-upload only when GCS verification is trusted."
        ),
    }


def drain_folder_command(args: argparse.Namespace) -> int:
    if args.watch and not args.execute:
        print("Watch mode is dry-run until --execute is set; no uploads will occur.")

    result = drain_folder_once(args)
    print(json.dumps(result, indent=2))
    if result["status"] != "ready" or not args.watch:
        return 0 if result["status"] == "ready" else 1

    try:
        while True:
            time_seconds = max(5, args.poll_seconds)
            print(f"Waiting {time_seconds}s before next drain pass...")
            import time

            time.sleep(time_seconds)
            result = drain_folder_once(args)
            print(json.dumps(result, indent=2))
    except KeyboardInterrupt:
        print("Stopped folder drain watcher.")
        return 0


def storage_preflight_command(args: argparse.Namespace) -> int:
    source_dir = Path(args.source_dir).expanduser().resolve()
    payload = storage_preflight(
        source_dir,
        min_free_gb=args.min_free_gb,
        allow_icloud=args.allow_icloud,
    )
    print(json.dumps(payload, indent=2))
    return 1 if payload["errors"] else 0


def discover_insta360_command(args: argparse.Namespace) -> int:
    scan_dirs = (
        [Path(value) for value in args.scan_dir]
        if args.scan_dir
        else default_insta360_scan_dirs()
    )
    files, warnings = discover_insta360_files(
        scan_dirs=scan_dirs,
        max_files=args.max_files,
    )
    result = {
        "status": "ready" if files else "blocked",
        "scanDirs": [str(path.expanduser()) for path in scan_dirs],
        "assetCount": len(files),
        "totalSizeBytes": sum(path.stat().st_size for path in files),
        "assets": [file_summary(path) for path in files],
        "warnings": warnings,
    }

    if args.out:
        out_path = Path(args.out).expanduser()
        write_json(out_path, result)
        print(f"Wrote Insta360 discovery report: {out_path}")
    else:
        print(json.dumps(result, indent=2))
    return 0 if files else 1


def create_insta360_package_command(args: argparse.Namespace) -> int:
    out_dir = Path(args.out_dir).expanduser().resolve()
    scan_dirs = (
        [Path(value) for value in args.scan_dir]
        if args.scan_dir
        else default_insta360_scan_dirs()
    )
    files, warnings = discover_insta360_files(
        scan_dirs=scan_dirs,
        max_files=args.max_files,
    )

    if not files:
        print("No Insta360 media found.", file=sys.stderr)
        for warning in warnings:
            print(f"  - {warning}", file=sys.stderr)
        print("Use --scan-dir to point at an Insta360 Studio export/download folder.", file=sys.stderr)
        return 1

    staged = stage_files(files=files, out_dir=out_dir, mode=args.mode)
    source_dir = out_dir / "inbox"
    manifest = build_manifest(
        source_dir=source_dir,
        project_id=args.project_id,
        collection_id=args.collection_id,
        bucket=args.bucket,
        storage_prefix=args.storage_prefix,
        notes=args.notes or "Generated from local Insta360 discovery/staging.",
    )
    manifest_path = out_dir / "media-vault-manifest.json"
    upload_plan_path = out_dir / "upload-to-gcs.sh"
    discovery_path = out_dir / "insta360-discovery.json"
    readme_path = out_dir / "README.md"

    write_json(manifest_path, manifest)
    write_json(
        discovery_path,
        {
            "createdAt": utc_now_iso(),
            "scanDirs": [str(path.expanduser()) for path in scan_dirs],
            "stagingMode": args.mode,
            "staged": staged,
            "warnings": warnings,
        },
    )

    plan_args = argparse.Namespace(
        manifest=str(manifest_path),
        source_dir=str(source_dir),
        out=str(upload_plan_path),
    )
    plan_status = plan_upload_command(plan_args)
    readme_path.write_text(
        "\n".join(
            [
                "# Studio Cut Insta360 Media Vault Package",
                "",
                "This folder was generated locally. Do not commit it.",
                "",
                "## Files",
                "",
                "- `inbox/`: staged local media, usually symlinks unless `--mode copy` was used",
                "- `media-vault-manifest.json`: relative-path manifest for Google Cloud Storage",
                "- `upload-to-gcs.sh`: reviewable upload plan",
                "- `insta360-discovery.json`: local discovery/staging report",
                "",
                "## Upload",
                "",
                "Dry run:",
                "",
                "```bash",
                f"pnpm studio-cut:media-vault -- upload-manifest --manifest {manifest_path} --source-dir {source_dir}",
                "```",
                "",
                "Execute upload:",
                "",
                "```bash",
                f"pnpm studio-cut:media-vault -- upload-manifest --manifest {manifest_path} --source-dir {source_dir} --execute",
                "```",
                "",
                "The helper uploads only files listed in the manifest. It does not store third-party passwords.",
                "",
            ]
        ),
        encoding="utf-8",
    )

    result = {
        "status": "ready" if plan_status == 0 else "blocked",
        "outDir": str(out_dir),
        "sourceDir": str(source_dir),
        "manifestPath": str(manifest_path),
        "uploadPlanPath": str(upload_plan_path),
        "discoveryPath": str(discovery_path),
        "readmePath": str(readme_path),
        "assetCount": manifest["assetCount"],
        "totalSizeBytes": manifest["totalSizeBytes"],
        "stagingMode": args.mode,
        "warnings": warnings,
        "nextCommands": [
            f"pnpm studio-cut:media-vault -- upload-manifest --manifest {manifest_path} --source-dir {source_dir}",
            f"pnpm studio-cut:media-vault -- upload-manifest --manifest {manifest_path} --source-dir {source_dir} --execute",
        ],
    }

    if args.execute_upload:
        upload_args = argparse.Namespace(
            manifest=str(manifest_path),
            source_dir=str(source_dir),
            execute=True,
            continue_on_error=False,
        )
        result["uploadStatus"] = upload_manifest_command(upload_args)

    print(json.dumps(result, indent=2))
    if args.execute_upload and result.get("uploadStatus") != 0:
        return int(result["uploadStatus"])
    return plan_status


def doctor_command(_: argparse.Namespace) -> int:
    report = {
        "python": sys.version.split()[0],
        "gcloudPath": shutil.which("gcloud"),
        "gsutilPath": shutil.which("gsutil"),
        "defaultBucket": DEFAULT_BUCKET,
        "defaultLocation": DEFAULT_LOCATION,
        "warnings": [],
    }
    if not report["gcloudPath"]:
        report["warnings"].append("gcloud is not on PATH; install Google Cloud CLI before uploading.")
    print(json.dumps(report, indent=2))
    return 0


def smoke_test_command(_: argparse.Namespace) -> int:
    with tempfile.TemporaryDirectory(prefix="studio-cut-media-vault-smoke-") as tmp:
        root = Path(tmp)
        source_dir = root / "source"
        output_dir = root / "out"
        (source_dir / "insta360").mkdir(parents=True)
        (source_dir / "photos").mkdir(parents=True)
        (source_dir / "audio").mkdir(parents=True)
        (source_dir / "insta360" / "homer-travel.insv").write_bytes(b"fake insta360 video")
        (source_dir / "photos" / "homer-photo.insp").write_bytes(b"fake insta360 photo")
        (source_dir / "audio" / "reference.wav").write_bytes(b"fake audio")

        manifest = build_manifest(
            source_dir=source_dir,
            project_id="episode-004",
            collection_id="homer-insta360-smoke",
            bucket=DEFAULT_BUCKET,
            storage_prefix="media-vault/raw",
            notes="synthetic smoke only",
        )
        manifest_path = output_dir / "media-vault-manifest.synthetic.json"
        plan_path = output_dir / "upload-plan.synthetic.sh"
        write_json(manifest_path, manifest)

        errors = validate_manifest_payload(manifest)
        if errors:
            print(json.dumps({"status": "fail", "errors": errors}, indent=2))
            return 1

        plan_args = argparse.Namespace(
            manifest=str(manifest_path),
            source_dir=str(source_dir),
            out=str(plan_path),
        )
        plan_status = plan_upload_command(plan_args)
        plan_text = plan_path.read_text(encoding="utf-8")
        assertions = [
            manifest["assetCount"] == 3,
            all(not os.path.isabs(asset["relativePath"]) for asset in manifest["assets"]),
            "gs://high-ground-odyssey-media/media-vault/raw/episode-004/homer-insta360-smoke/originals/video/insta360/" in plan_text,
            "homer-travel.insv" in [asset["cloudObjectPath"].split("/")[-1][13:] for asset in manifest["assets"]],
            plan_status == 0,
        ]
        insta360_package_dir = output_dir / "insta360-package"
        package_args = argparse.Namespace(
            project_id="episode-004",
            collection_id="homer-insta360-smoke",
            out_dir=str(insta360_package_dir),
            scan_dir=[str(source_dir)],
            max_files=20,
            mode="symlink",
            bucket=DEFAULT_BUCKET,
            storage_prefix="media-vault/raw",
            notes="synthetic Insta360 package smoke only",
            execute_upload=False,
        )
        package_status = create_insta360_package_command(package_args)
        package_manifest = load_json(insta360_package_dir / "media-vault-manifest.json")
        assertions.extend(
            [
                package_status == 0,
                package_manifest["assetCount"] == 2,
                (insta360_package_dir / "upload-to-gcs.sh").exists(),
                (insta360_package_dir / "README.md").exists(),
            ]
        )
        drain_args = argparse.Namespace(
            source_dir=str(source_dir),
            project_id="episode-004",
            collection_id="homer-insta360-smoke",
            bucket=DEFAULT_BUCKET,
            storage_prefix="media-vault/raw",
            ledger=str(output_dir / "drain-ledger.synthetic.jsonl"),
            execute=False,
            delete_local_after_upload=False,
            continue_on_error=False,
            max_files=10,
            settle_seconds=0,
            min_free_gb=0,
            allow_icloud=False,
            watch=False,
            poll_seconds=60,
        )
        drain_result = drain_folder_once(drain_args)
        preflight_result = storage_preflight(source_dir, min_free_gb=0, allow_icloud=False)
        assertions.extend(
            [
                drain_result["status"] == "ready",
                drain_result["processedCount"] == 3,
                all(entry["status"] == "dry_run" for entry in drain_result["processed"]),
                preflight_result["freeBytes"] > 0,
                not preflight_result["icloudManagedPath"],
            ]
        )
        result = {
            "status": "pass" if all(assertions) else "fail",
            "manifestPath": str(manifest_path),
            "uploadPlanPath": str(plan_path),
            "insta360PackagePath": str(insta360_package_dir),
            "assetCount": manifest["assetCount"],
            "assertionsPassed": sum(1 for assertion in assertions if assertion),
            "assertionCount": len(assertions),
        }
        print(json.dumps(result, indent=2))
        return 0 if all(assertions) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Studio Cut media vault helper")
    subparsers = parser.add_subparsers(dest="command", required=True)

    doctor = subparsers.add_parser("doctor", help="Check local media vault tools")
    doctor.set_defaults(func=doctor_command)

    create_manifest = subparsers.add_parser(
        "create-manifest",
        help="Create a safe media vault manifest from a local folder",
    )
    create_manifest.add_argument("--source-dir", required=True)
    create_manifest.add_argument("--project-id", required=True)
    create_manifest.add_argument("--collection-id", required=True)
    create_manifest.add_argument("--bucket", default=DEFAULT_BUCKET)
    create_manifest.add_argument("--storage-prefix", default="media-vault/raw")
    create_manifest.add_argument("--out", required=True)
    create_manifest.add_argument("--notes")
    create_manifest.set_defaults(func=create_manifest_command)

    validate_manifest = subparsers.add_parser(
        "validate-manifest",
        help="Validate a media vault manifest",
    )
    validate_manifest.add_argument("--manifest", required=True)
    validate_manifest.set_defaults(func=validate_manifest_command)

    plan_upload = subparsers.add_parser(
        "plan-upload",
        help="Write gcloud storage cp commands for a media vault manifest",
    )
    plan_upload.add_argument("--manifest", required=True)
    plan_upload.add_argument("--source-dir", required=True)
    plan_upload.add_argument("--out")
    plan_upload.set_defaults(func=plan_upload_command)

    upload_manifest = subparsers.add_parser(
        "upload-manifest",
        help="Dry-run or execute Google Cloud Storage uploads for a media vault manifest",
    )
    upload_manifest.add_argument("--manifest", required=True)
    upload_manifest.add_argument("--source-dir", required=True)
    upload_manifest.add_argument("--execute", action="store_true")
    upload_manifest.add_argument("--continue-on-error", action="store_true")
    upload_manifest.set_defaults(func=upload_manifest_command)

    storage_preflight_parser = subparsers.add_parser(
        "storage-preflight",
        help="Check disk space and iCloud risk before draining a local media folder",
    )
    storage_preflight_parser.add_argument("--source-dir", required=True)
    storage_preflight_parser.add_argument("--min-free-gb", type=float, default=DEFAULT_MIN_FREE_GB)
    storage_preflight_parser.add_argument("--allow-icloud", action="store_true")
    storage_preflight_parser.set_defaults(func=storage_preflight_command)

    drain_folder = subparsers.add_parser(
        "drain-folder",
        help="Upload settled local media one file at a time, verify GCS metadata, and optionally delete local copies",
    )
    drain_folder.add_argument("--source-dir", required=True)
    drain_folder.add_argument("--project-id", required=True)
    drain_folder.add_argument("--collection-id", required=True)
    drain_folder.add_argument("--bucket", default=DEFAULT_BUCKET)
    drain_folder.add_argument("--storage-prefix", default="media-vault/raw")
    drain_folder.add_argument("--ledger")
    drain_folder.add_argument("--execute", action="store_true")
    drain_folder.add_argument("--delete-local-after-upload", action="store_true")
    drain_folder.add_argument("--continue-on-error", action="store_true")
    drain_folder.add_argument("--max-files", type=int, default=20)
    drain_folder.add_argument("--settle-seconds", type=int, default=30)
    drain_folder.add_argument("--min-free-gb", type=float, default=DEFAULT_MIN_FREE_GB)
    drain_folder.add_argument("--allow-icloud", action="store_true")
    drain_folder.add_argument("--watch", action="store_true")
    drain_folder.add_argument("--poll-seconds", type=int, default=60)
    drain_folder.set_defaults(func=drain_folder_command)

    discover_insta360 = subparsers.add_parser(
        "discover-insta360",
        help="Discover likely Insta360 media in common local Studio/export folders",
    )
    discover_insta360.add_argument("--scan-dir", action="append", default=[])
    discover_insta360.add_argument("--max-files", type=int, default=DEFAULT_MAX_DISCOVERY_FILES)
    discover_insta360.add_argument("--out")
    discover_insta360.set_defaults(func=discover_insta360_command)

    insta360_package = subparsers.add_parser(
        "create-insta360-package",
        help="Discover, stage, manifest, and plan upload for local Insta360 media",
    )
    insta360_package.add_argument("--project-id", required=True)
    insta360_package.add_argument("--collection-id", default=DEFAULT_INSTA360_COLLECTION_ID)
    insta360_package.add_argument(
        "--out-dir",
        default=DEFAULT_INSTA360_STAGING_ROOT,
        help="Local staging output folder; do not place this in git",
    )
    insta360_package.add_argument("--scan-dir", action="append", default=[])
    insta360_package.add_argument("--max-files", type=int, default=DEFAULT_MAX_DISCOVERY_FILES)
    insta360_package.add_argument("--mode", choices=["symlink", "copy"], default="symlink")
    insta360_package.add_argument("--bucket", default=DEFAULT_BUCKET)
    insta360_package.add_argument("--storage-prefix", default="media-vault/raw")
    insta360_package.add_argument("--notes")
    insta360_package.add_argument(
        "--execute-upload",
        action="store_true",
        help="Upload immediately after creating the manifest; requires gcloud auth",
    )
    insta360_package.set_defaults(func=create_insta360_package_command)

    smoke = subparsers.add_parser("smoke-test", help="Run synthetic media vault checks")
    smoke.set_defaults(func=smoke_test_command)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
