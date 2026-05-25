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
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BUCKET = "high-ground-odyssey-media"
DEFAULT_LOCATION = "US"
SCHEMA_VERSION = 1

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
            "homer-travel.insv" not in [asset["cloudObjectPath"].split("/")[-1] for asset in manifest["assets"]],
            plan_status == 0,
        ]
        result = {
            "status": "pass" if all(assertions) else "fail",
            "manifestPath": str(manifest_path),
            "uploadPlanPath": str(plan_path),
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

    smoke = subparsers.add_parser("smoke-test", help="Run synthetic media vault checks")
    smoke.set_defaults(func=smoke_test_command)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
