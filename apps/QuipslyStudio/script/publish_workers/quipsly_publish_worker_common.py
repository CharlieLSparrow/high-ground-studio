#!/usr/bin/env python3
"""Shared helpers for Quipsly publish dry-run workers."""

from __future__ import annotations

from typing import Any


class PublishWorkerValidationError(ValueError):
    """Raised when a publish worker payload is not safe to dry-run."""


def validate_destination_contract(
    payload: dict[str, Any],
    metadata: dict[str, Any],
    expected_destination_ids: set[str],
) -> dict[str, Any]:
    """Validate destination guidance carried by a publish worker payload.

    Destination guidance is the platform contract. Workers should not infer
    upload shape from platform strings alone.
    """

    destination = payload.get("destination") or {}
    if not isinstance(destination, dict):
        raise PublishWorkerValidationError("Destination guidance must be an object.")

    destination_id = str(destination.get("destinationId") or metadata.get("destinationId") or "").strip()
    if not destination_id:
        raise PublishWorkerValidationError("Destination guidance is missing destinationId.")

    if expected_destination_ids and destination_id not in expected_destination_ids:
        expected = ", ".join(sorted(expected_destination_ids))
        raise PublishWorkerValidationError(
            f"Destination id {destination_id!r} does not match this worker. Expected one of: {expected}."
        )

    metadata_destination_id = str(metadata.get("destinationId") or "").strip()
    if metadata_destination_id and metadata_destination_id != destination_id:
        raise PublishWorkerValidationError(
            f"Metadata destinationId {metadata_destination_id!r} does not match worker destinationId {destination_id!r}."
        )

    metadata_guidance = metadata.get("destinationGuidance") or {}
    if isinstance(metadata_guidance, dict):
        metadata_guidance_id = str(metadata_guidance.get("destinationId") or "").strip()
        if metadata_guidance_id and metadata_guidance_id != destination_id:
            raise PublishWorkerValidationError(
                f"Metadata destinationGuidance id {metadata_guidance_id!r} does not match worker destinationId {destination_id!r}."
            )

    requires = destination.get("requires") or []
    if not isinstance(requires, list) or not requires:
        raise PublishWorkerValidationError("Destination guidance must include non-empty required fields.")

    missing_required_fields = [
        field for field in requires
        if not destination_required_field_present(field, payload, metadata)
    ]
    if missing_required_fields:
        missing = ", ".join(missing_required_fields)
        raise PublishWorkerValidationError(
            f"Destination required fields are missing or empty: {missing}."
        )

    agent_guidance = str(destination.get("agentGuidance") or "").strip()
    if not agent_guidance:
        raise PublishWorkerValidationError("Destination guidance is missing agentGuidance.")

    return {
        "destinationId": destination_id,
        "label": destination.get("label") or "",
        "preferredFormat": destination.get("preferredFormat") or "",
        "requiredFields": requires,
        "requiredFieldCount": len(requires),
        "requiredFieldsPresent": True,
        "agentGuidance": agent_guidance,
        "catalogVersion": destination.get("catalogVersion") or "",
    }


def destination_required_field_present(
    field: Any,
    payload: dict[str, Any],
    metadata: dict[str, Any],
) -> bool:
    name = str(field or "").strip()
    if not name:
        return False

    copy = payload.get("copy") or {}
    artifact = payload.get("artifact") or {}

    direct_candidates = [
        metadata.get(name),
        copy.get(name),
    ]
    if any(has_value(value) for value in direct_candidates):
        return True

    if name in {"title", "shortTitle", "episodeTitle"}:
        return has_value(copy.get("title")) or has_value(metadata.get("title"))
    if name in {"description", "memberCopy", "caption", "professionalContextCopy", "showNotes"}:
        return has_value(copy.get("description")) or has_value(metadata.get("description"))
    if name in {"verticalVideo", "video", "audioMaster"}:
        return has_value(artifact.get("path"))
    if name in {"visibility", "visibilityTierIntent"}:
        return has_value(metadata.get("visibility")) or has_value(metadata.get("visibilityTierIntent"))
    if name in {"scheduleIntent", "publishOrScheduleIntent"}:
        return has_value(metadata.get("scheduleIntent")) or has_value(metadata.get("publishOrScheduleIntent"))
    if name == "captionIntent":
        return has_value(metadata.get("captionIntent")) or has_value(copy.get("description")) or has_value(metadata.get("description"))
    if name == "thumbnail":
        return has_value(metadata.get("thumbnail")) or has_value(metadata.get("thumbnailPath")) or has_value(metadata.get("thumbnailIntent"))
    if name == "hashtags":
        return has_value(metadata.get("hashtags")) or has_value(metadata.get("tags"))
    if name == "attachmentOrEmbedIntent":
        return has_value(metadata.get("attachmentOrEmbedIntent"))

    return False


def has_value(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, tuple, set, dict)):
        return bool(value)
    return True
