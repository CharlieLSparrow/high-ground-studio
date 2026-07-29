#!/usr/bin/env python3
"""Create a selected-short rhythm refinement work order.

The plan uses rendered-proof audio evidence to suggest where a short might be
tightened, covered with reaction/source variation, or left alone. It does not
edit session metadata, overwrite exports, publish, or mutate source media.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from selected_short_audio_rhythm_proof import (  # noqa: E402
    DEFAULT_BASE_URL,
    build_audio_rhythm_proof,
)
from selected_short_proof_review import dict_value, n, s, slugify  # noqa: E402


DEFAULT_OUTPUT_ROOT = Path.home() / "Movies" / "QuipslyExports" / "ShortRhythmRefinementPlans"


def classify_pause(start: float, end: float, duration: float, total_duration: float) -> tuple[str, str]:
    if start <= 1.0:
        return "opening-drag-risk", "This pause is near the hook. If it is not intentional tension, tighten or start later."
    if total_duration > 0 and end >= total_duration - 1.0:
        return "ending-drift-risk", "This pause is near the ending. Tighten if it weakens the payoff."
    if duration >= 1.0:
        return "long-air-review", "Long air can be emphasis, thought, or dead time. Review by ear before shortening."
    if duration >= 0.7:
        return "medium-air-review", "Medium pause may need shaping. Preserve enough breath to avoid machine pacing."
    return "micro-air-keep", "Likely conversational breath. Do not remove automatically."


def build_candidate_actions(proof: dict[str, Any]) -> list[dict[str, Any]]:
    duration = n(proof.get("duration"))
    silences = [item for item in proof.get("silences") or [] if isinstance(item, dict)]
    actions: list[dict[str, Any]] = []
    for index, item in enumerate(silences, start=1):
        start = n(item.get("start"))
        end = n(item.get("end"))
        silence_duration = n(item.get("duration"))
        if silence_duration < 0.7:
            continue
        kind, rationale = classify_pause(start, end, silence_duration, duration)
        preserve = 0.38 if kind == "long-air-review" else 0.28
        possible_reduction = max(0.0, silence_duration - preserve)
        actions.append(
            {
                "id": f"pause-{index:02d}",
                "kind": kind,
                "start": start,
                "end": end,
                "duration": silence_duration,
                "preserveSeconds": preserve,
                "estimatedReductionSeconds": possible_reduction,
                "rationale": rationale,
                "humanCheck": "Listen at normal speed. If the pause carries thought, warmth, humor, or safety, keep it or cover it visually instead of deleting it.",
                "metadataIntent": {
                    "action": "review-pause-for-tighten-or-cover",
                    "source": "selected-short-audio-rhythm-proof",
                    "nonDestructive": True,
                },
            }
        )
    return actions


def build_plan(base_url: str, output_root: Path, save: bool, noise: str, min_silence: float) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    proof = build_audio_rhythm_proof(base_url, output_root, save=False, noise=noise, min_silence=min_silence)
    selected = dict_value(proof.get("selectedShort"))
    rhythm = dict_value(proof.get("rhythm"))
    duration = n(proof.get("duration"))
    actions = build_candidate_actions(proof)
    estimated_reduction = sum(n(item.get("estimatedReductionSeconds")) for item in actions)
    conservative_reduction = min(estimated_reduction, max(0.0, duration * 0.22))
    target_duration = max(0.0, duration - conservative_reduction)

    warnings: list[str] = []
    strengths: list[str] = []
    next_actions: list[str] = []
    strategy = "listen-first"

    if proof.get("status") == "missing-proof":
        warnings.append("No selected-short proof exists; rhythm refinement cannot be grounded yet.")
        next_actions.append("Export or repair proof before creating a tighter short variant.")
    elif n(rhythm.get("silenceFraction")) >= 0.24:
        strategy = "tighten-or-cover-air"
        warnings.append(f"Silence fraction is high at {n(rhythm.get('silenceFraction')):.0%}; the short may drag unless pauses carry meaning.")
        next_actions.append("Create a tighter branch/variant that reviews long pauses first, not every breath.")
    elif n(rhythm.get("meaningfulPauseCount")) == 0:
        strategy = "restore-human-air"
        warnings.append("No meaningful pauses were detected; the short may be over-compressed.")
        next_actions.append("Listen for missing breath or reaction timing before making it tighter.")
    else:
        strategy = "proof-listen"
        strengths.append("Audio rhythm has detectable conversational air.")
        next_actions.append("Proof-listen before changing rhythm; pauses may be doing useful work.")

    if actions:
        strengths.append(f"Found {len(actions)} long/medium pause(s) worth reviewing individually.")
        next_actions.append("Use the top pause actions as review marks, not automatic deletes.")
    if s(selected.get("reviewStatus")) != "keep":
        next_actions.append(f"Selected short is `{s(selected.get('reviewStatus')) or 'unknown'}`; keep it in Refine until a human/agent proof-listen passes.")
    next_actions.append("After transcript timing exists, tie each pause to words/speaker turns before applying J/L cut advice.")

    plan = {
        "status": "rhythm-refinement-plan",
        "model": "quipslystudio-selected-short-rhythm-refinement-plan",
        "generatedAt": generated_at,
        "selectedShort": selected,
        "proofPath": proof.get("proofPath"),
        "strategy": strategy,
        "currentDurationSeconds": duration,
        "estimatedReductionSeconds": estimated_reduction,
        "conservativeReductionSeconds": conservative_reduction,
        "suggestedTargetDurationSeconds": target_duration,
        "rhythm": rhythm,
        "volume": proof.get("volume") or {},
        "candidateActions": actions,
        "strengths": strengths,
        "warnings": warnings,
        "nextActions": next_actions,
        "safeCommands": {
            "audioRhythmProof": "script/agentctl.sh selected-short-audio-rhythm-proof --save",
            "proofReview": "script/agentctl.sh selected-short-proof-review --save",
            "creativePacket": "script/agentctl.sh selected-short-creative-review-packet-save",
            "markRefine": "script/agentctl.sh shorts-review-selected refine \"rhythm refinement plan created; needs proof-listen\"",
        },
        "truth": "Rhythm refinement plan is a non-destructive work order over rendered-proof evidence. It does not apply edit decisions, overwrite exports, publish, or mutate source media.",
    }

    if save:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        title = s(selected.get("title")) or "selected-short"
        folder = output_root.expanduser().resolve() / f"{stamp}-{slugify(title)}"
        folder.mkdir(parents=True, exist_ok=False)
        (folder / "selected-short-rhythm-refinement-plan.json").write_text(json.dumps(plan, indent=2, sort_keys=True), encoding="utf-8")
        (folder / "selected-short-rhythm-refinement-plan.md").write_text(render_markdown(plan), encoding="utf-8")
        plan["savedTo"] = str(folder)

    return plan


def render_markdown(plan: dict[str, Any]) -> str:
    selected = dict_value(plan.get("selectedShort"))
    rhythm = dict_value(plan.get("rhythm"))
    lines = [
        "# Selected Short Rhythm Refinement Plan",
        "",
        s(plan.get("truth")) or "Non-destructive rhythm work order.",
        "",
        f"- Status: `{s(plan.get('status'))}`",
        f"- Short: {s(selected.get('title'))}",
        f"- Review status: `{s(selected.get('reviewStatus')) or 'unknown'}`",
        f"- Strategy: `{s(plan.get('strategy'))}`",
        f"- Current duration: {n(plan.get('currentDurationSeconds')):.2f}s",
        f"- Conservative target: {n(plan.get('suggestedTargetDurationSeconds')):.2f}s",
        f"- Estimated removable air: {n(plan.get('estimatedReductionSeconds')):.2f}s, capped plan {n(plan.get('conservativeReductionSeconds')):.2f}s",
        f"- Silence fraction: {n(rhythm.get('silenceFraction')):.0%}",
        f"- Long pauses: {int(n(rhythm.get('longPauseCount')))}",
        "",
        "## Candidate pause actions",
    ]
    actions = plan.get("candidateActions") or []
    if not actions:
        lines.append("- none")
    else:
        for item in actions[:12]:
            if not isinstance(item, dict):
                continue
            lines.append(
                f"- `{s(item.get('id'))}` {n(item.get('start')):.2f}s -> {n(item.get('end')):.2f}s "
                f"({n(item.get('duration')):.2f}s), `{s(item.get('kind'))}`, possible reduction {n(item.get('estimatedReductionSeconds')):.2f}s"
            )
            lines.append(f"  Why: {s(item.get('rationale'))}")
            lines.append(f"  Human check: {s(item.get('humanCheck'))}")

    for label, key in [("Strengths", "strengths"), ("Warnings", "warnings"), ("Next actions", "nextActions")]:
        lines.extend(["", f"## {label}"])
        items = plan.get(key) or []
        lines.extend(f"- {s(item)}" for item in items) if items else lines.append("- none")

    lines.extend(["", "## Safe commands"])
    for label, command in dict_value(plan.get("safeCommands")).items():
        lines.append(f"- {label}: `{command}`")

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create selected-short rhythm refinement work order.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--output-root", default=str(DEFAULT_OUTPUT_ROOT))
    parser.add_argument("--noise", default="-35dB")
    parser.add_argument("--min-silence", type=float, default=0.18)
    parser.add_argument("--save", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    args = parser.parse_args()

    plan = build_plan(args.base_url, Path(args.output_root), args.save, args.noise, args.min_silence)
    if args.json:
        print(json.dumps(plan, indent=2, sort_keys=True))
    else:
        print(render_markdown(plan), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
