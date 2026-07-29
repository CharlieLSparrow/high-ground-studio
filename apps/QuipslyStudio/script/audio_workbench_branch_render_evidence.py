#!/usr/bin/env python3
"""Register branch-render proof evidence against a conformed audio baseline.

This keeps proof renders from becoming loose files on an external drive. It
does not approve, publish, or mutate source media; it records that a branch
render attempted to inherit a baseline and what QC concluded.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True, default=str), encoding="utf-8")


def path_exists(path_text: str | None) -> bool:
    return bool(path_text) and Path(path_text).exists()


def build_evidence(branch_manifest_path: Path) -> dict[str, Any]:
    branch_manifest = read_json(branch_manifest_path)
    branch_dir = branch_manifest_path.parent
    qc_path = branch_dir / "audio-workbench-branch-qc.json"
    qc = read_json(qc_path) if qc_path.exists() else {}
    baseline = branch_manifest.get("conformedProductionBaseline") or {}
    truth = branch_manifest.get("truth") or {}
    source_aware = baseline.get("sourceAwareAudioContract") if isinstance(baseline.get("sourceAwareAudioContract"), dict) else {}
    outputs = branch_manifest.get("outputs") or {}
    video = outputs.get("video16x9") or outputs.get("video") or {}
    podcast_audio = outputs.get("podcastAudio") or outputs.get("audio") or {}
    generated_at = datetime.now(timezone.utc).isoformat()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    branch_id = (branch_manifest.get("branch") or {}).get("id") or branch_dir.name
    json_path = branch_dir / f"audio-workbench-branch-render-evidence-{branch_id}-{timestamp}.json"
    md_path = branch_dir / f"audio-workbench-branch-render-evidence-{branch_id}-{timestamp}.md"

    return {
        "schema": "quipsly.audio-workbench.branch-render-evidence.v1",
        "generatedAt": generated_at,
        "branchManifestPath": str(branch_manifest_path),
        "branchDir": str(branch_dir),
        "branch": branch_manifest.get("branch"),
        "truth": {
            "originalMediaMutated": truth.get("originalMediaMutated") is True,
            "audioInheritedFromConformedProductionBaseline": truth.get("audioInheritedFromConformedProductionBaseline") is True,
            "audioBaselineWasApprovedForBranchInheritance": truth.get("audioBaselineWasApprovedForBranchInheritance") is True,
            "audioBaselineRenderMode": truth.get("audioBaselineRenderMode"),
            "sourceAwareAudioTruthInherited": truth.get("sourceAwareAudioTruthInherited") is True,
            "sourceAwareAudioContractStatus": truth.get("sourceAwareAudioContractStatus"),
            "sourceAwareAudioRoleIds": truth.get("sourceAwareAudioRoleIds") or source_aware.get("roleIds"),
            "sourceAwareAudioReadyStemCount": truth.get("sourceAwareAudioReadyStemCount") or source_aware.get("readyStemCount"),
            "branchAudioRenderedFromSourceAwareStems": truth.get("branchAudioRenderedFromSourceAwareStems") is True,
            "branchAudioRenderedFromMasteredSpineOnly": truth.get("branchAudioRenderedFromMasteredSpineOnly") is True,
            "masteredSpineOnlyEditingAllowed": truth.get("masteredSpineOnlyEditingAllowed") is True,
            "branchAudioMixPath": truth.get("branchAudioMixPath"),
            "proofRunSeconds": truth.get("proofRunSeconds"),
            "externalPublicationReceipt": truth.get("externalPublicationReceipt"),
            "publicationApproved": False,
        },
        "conformedProductionBaseline": baseline,
        "outputs": {
            "video": {
                "path": video.get("path"),
                "exists": path_exists(video.get("path")),
            },
            "podcastAudio": {
                "path": podcast_audio.get("path"),
                "exists": path_exists(podcast_audio.get("path")),
            },
            "qc": {
                "json": str(qc_path) if qc_path.exists() else None,
                "markdown": str(branch_dir / "audio-workbench-branch-qc.md")
                if (branch_dir / "audio-workbench-branch-qc.md").exists()
                else None,
                "machineVerdict": qc.get("machineVerdict"),
                "warnings": qc.get("warnings", []),
            },
        },
        "status": (
            "proof-render-source-aware-media-valid-but-unapproved"
            if (qc.get("machineVerdict") or {}).get("mediaFilesValid") is True
            and (qc.get("machineVerdict") or {}).get("sourceAwareAudioReady") is True
            and (qc.get("machineVerdict") or {}).get("branchAudioRenderedFromSourceAwareStems") is True
            and truth.get("audioBaselineWasApprovedForBranchInheritance") is not True
            else "proof-render-needs-attention"
        ),
        "nextSafestAction": (
            "Use this proof to verify renderer mechanics only. Complete human listen proof before full branch renders."
        ),
        "outputsWritten": {
            "json": str(json_path),
            "markdown": str(md_path),
        },
    }


def render_markdown(evidence: dict[str, Any]) -> str:
    branch = evidence.get("branch") or {}
    qc = (evidence.get("outputs") or {}).get("qc") or {}
    lines = [
        "# Audio Workbench branch-render evidence",
        "",
        f"- Branch: `{branch.get('id')}`",
        f"- Status: `{evidence.get('status')}`",
        f"- Generated: `{evidence.get('generatedAt')}`",
        f"- Baseline: `{(evidence.get('conformedProductionBaseline') or {}).get('baselineId')}`",
        f"- Render mode: `{(evidence.get('truth') or {}).get('audioBaselineRenderMode')}`",
        f"- Baseline approved for branch inheritance: `{(evidence.get('truth') or {}).get('audioBaselineWasApprovedForBranchInheritance')}`",
        f"- Source-aware audio inherited: `{(evidence.get('truth') or {}).get('sourceAwareAudioTruthInherited')}`",
        f"- Source-aware roles: `{(evidence.get('truth') or {}).get('sourceAwareAudioRoleIds')}`",
        f"- Source-aware ready stems: `{(evidence.get('truth') or {}).get('sourceAwareAudioReadyStemCount')}`",
        f"- Rendered from source-aware stems: `{(evidence.get('truth') or {}).get('branchAudioRenderedFromSourceAwareStems')}`",
        f"- Rendered from mastered spine only: `{(evidence.get('truth') or {}).get('branchAudioRenderedFromMasteredSpineOnly')}`",
        f"- Proof seconds: `{(evidence.get('truth') or {}).get('proofRunSeconds')}`",
        "",
        "## Output files",
        "",
        f"- Video: `{((evidence.get('outputs') or {}).get('video') or {}).get('path')}`",
        f"- Podcast audio: `{((evidence.get('outputs') or {}).get('podcastAudio') or {}).get('path')}`",
        f"- QC: `{qc.get('markdown')}`",
        "",
        "## QC warnings",
        "",
    ]
    warnings = qc.get("warnings") or []
    lines.extend([f"- {item}" for item in warnings] or ["- none"])
    lines.extend(
        [
            "",
            "## Truth",
            "",
            "- This is a proof render, not a publication render.",
            "- It does not approve the audio baseline.",
            "- It does not mutate original media.",
            "- It proves branch rendering can mechanically inherit the source-aware Charlie/Homer/clip-source audio truth.",
            "- The mastered spine is allowed as review/export convenience, not as the only editable branch truth.",
            "",
            "## Next safest action",
            "",
            evidence.get("nextSafestAction", ""),
            "",
        ]
    )
    return "\n".join(lines)


def register_with_baseline(evidence: dict[str, Any]) -> None:
    baseline = evidence.get("conformedProductionBaseline") or {}
    manifest_path = baseline.get("manifestPath")
    if not manifest_path or not Path(manifest_path).exists():
        return
    baseline_manifest_path = Path(manifest_path)
    manifest = read_json(baseline_manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestBranchRenderProof"] = evidence["outputsWritten"]["json"]
    outputs["latestBranchRenderProofMarkdown"] = evidence["outputsWritten"]["markdown"]
    proofs = outputs.setdefault("branchRenderProofs", [])
    if evidence["outputsWritten"]["json"] not in proofs:
        proofs.append(evidence["outputsWritten"]["json"])
    manifest["branchRenderProofCount"] = len(proofs)
    write_json(baseline_manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--branch-manifest", required=True, type=Path)
    args = parser.parse_args()

    evidence = build_evidence(args.branch_manifest)
    json_path = Path(evidence["outputsWritten"]["json"])
    md_path = Path(evidence["outputsWritten"]["markdown"])
    write_json(json_path, evidence)
    md_path.write_text(render_markdown(evidence), encoding="utf-8")
    register_with_baseline(evidence)
    print(json.dumps(evidence["outputsWritten"], indent=2))


if __name__ == "__main__":
    main()
