#!/usr/bin/env python3
"""Create the Episode audio quality escalation plan.

This is a research-backed control-plane artifact. It does not approve audio,
unlock branches, render media, upload files, publish, or mutate source media.
It keeps the next quality upgrades explicit so Episode 4 can move to final
renders after human audio approval without sliding back into vague tinkering.
"""

from __future__ import annotations

import argparse
import html
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_BASELINE_DIR = Path(
    "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/"
    "20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/"
    "conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
)


RESEARCH_BASE = [
    {
        "label": "EBU R 128 loudness discipline",
        "url": "https://tech.ebu.ch/publications/r128/",
        "whyItMatters": "Use integrated loudness, loudness range, and true peak as delivery hygiene and regression evidence.",
        "quipslyCaveat": "Broadcast loudness discipline cannot judge conversation naturalness, missing reactions, or final edit quality.",
    },
    {
        "label": "Apple Podcasts audio requirements and best practices",
        "url": "https://podcasters.apple.com/support/893-audio-requirements",
        "whyItMatters": "Apple gives concrete RSS/subscriber audio format, bitrate, loudness, and true-peak guidance for podcast delivery branches.",
        "quipslyCaveat": "Apple-compatible files are not automatically good episodes; this is a delivery gate, not a taste gate.",
    },
    {
        "label": "DNSMOS / no-reference perceptual speech scoring",
        "url": "https://www.microsoft.com/en-us/research/publication/dnsmos-a-non-intrusive-perceptual-objective-speech-quality-metric-to-evaluate-noise-suppressors-2/",
        "whyItMatters": "No-reference speech metrics can rank proof windows for speech, background, and overall perceived quality when no clean reference exists.",
        "quipslyCaveat": "Use as a review router and regression alarm only. Human listening remains the approval gate.",
    },
    {
        "label": "ITU BS.1770 loudness/true-peak measurement basis",
        "url": "https://www.itu.int/rec/R-REC-BS.1770",
        "whyItMatters": "BS.1770 underpins LKFS/LUFS and true-peak measurement used by podcast and broadcast guidance.",
        "quipslyCaveat": "It measures signal level. It does not know whether Homer disappeared, cadence got weird, or a joke landed.",
    },
]


EDITOR_AUDIO_TRUTH = {
    "rule": "The editor-grade truth is aligned, source-aware refined stems plus a mix recipe; the combined mastered spine is a review/export convenience artifact.",
    "requiredStems": [
        "Charlie refined dialogue stem",
        "Homer refined dialogue stem",
        "Clip/source audio stem",
    ],
    "whyItMatters": "Episode 4 still needs timing, clip weaving, ducking, and branch-specific choices. A single combined waveform is useful for listening and manual Premiere use, but it is too rigid to be the canonical editing layer.",
    "implementationBias": "Keep stems synced to the same sequence clock as video. Keep non-destructive mute/duck/cleanup decisions as sidecar metadata and mix them down into review/export spines only when needed.",
}


NEXT_METHODS = [
    {
        "id": "source-aware-refined-stems-manifest",
        "priority": 1,
        "when": "before branch renders, safe now",
        "scope": "Episode 4 source-aware audio truth",
        "what": "Create or verify a manifest that names Charlie, Homer, and clip refined stems, their sync offsets, mute/duck decision layers, cleanup profile, and the exact mix recipe used to produce the v006 spine.",
        "why": "The combined spine is useful, but branch editing needs separate stems so Charlie/Homer/clip timing, clip integration, and cleanup can be adjusted without destructive waveform surgery.",
        "proof": "A source-aware stem map with file existence, duration, sync offset, speaker role, cleanup lineage, and mixdown contribution for every stem.",
        "risk": "Do not promote a single mastered file into the only canonical audio truth. That recreates the Premiere pain in prettier clothes.",
    },
    {
        "id": "segment-loudness-map",
        "priority": 2,
        "when": "before or after human listen, safe now",
        "scope": "audio spine",
        "what": "Generate rolling LUFS/LRA/true-peak windows across the full v006 spine and route outliers into the listen-priority queue.",
        "why": "Average loudness can hide one painfully loud or too-quiet section. Segment mapping makes delivery quality visible over time.",
        "proof": "JSON/HTML timeline map with outlier count, max true peak, quiet speech spans, and links to review windows.",
        "risk": "Do not retune the whole master from outliers unless a human confirms they are audible problems.",
    },
    {
        "id": "nisqa-dnsmos-adapter",
        "priority": 3,
        "when": "after v006 listen unless obvious tooling path is cheap",
        "scope": "audio spine and future candidates",
        "what": "Add optional no-reference perceptual speech scoring for proof windows and candidate deltas.",
        "why": "It can flag speech/noise/overall quality regressions that simple loudness and RMS checks miss.",
        "proof": "Per-window SIG/BAK/OVRL-style scores or NISQA-style dimensions in the Defect Atlas; no score unlocks approval.",
        "risk": "Model confidence can seduce us into false certainty. Scores must route ears, not replace ears.",
    },
    {
        "id": "full-spine-chapter-asr",
        "priority": 4,
        "when": "after proof-window ASR remains useful or if human listen flags intelligibility",
        "scope": "audio spine and final episode",
        "what": "Transcribe chapter-sized source/master windows and compare missing clusters, low-confidence spans, speaker flips, and timing drift.",
        "why": "ASR comparison can catch semantic loss, dropped words, or unnatural cleanup that energy checks miss.",
        "proof": "Chapter ASR agreement board with exact risky spans and confidence that points to listen windows.",
        "risk": "ASR errors are not audio defects. Low agreement needs a listen/proof path, not automatic repair.",
    },
    {
        "id": "candidate-delta-scorecard",
        "priority": 5,
        "when": "only if v007 repair is needed",
        "scope": "v006 to v007 promotion",
        "what": "Compare every repair candidate against v006 for loudness, spectrum, speech activity, ASR agreement, silence boundaries, and human note closure.",
        "why": "Prevents fixing one echo window while quietly damaging Homer, reactions, or cadence elsewhere.",
        "proof": "Version delta report: improved, unchanged, degraded, needs-listen by proof window and global metric.",
        "risk": "Do not create v007 churn without a real human-listen note or focused proof need.",
    },
    {
        "id": "final-branch-editorial-qa",
        "priority": 6,
        "when": "after audio approval and first branch renders",
        "scope": "long-form episode and shorts",
        "what": "Evaluate L/J cut opportunities, jump-cut density, reaction coverage, source-clip integration, hook quality, caption timing, and crop/face safety.",
        "why": "A passed audio spine is not a finished episode. Editorial flow needs its own evidence after branch render.",
        "proof": "Branch QA board for YouTube, podcast audio, and shorts with next-safe actions and no false publication claims.",
        "risk": "Do not let editorial QA delay audio approval. It belongs downstream of the spine gate.",
    },
    {
        "id": "episodes-1-6-rollout-board",
        "priority": 7,
        "when": "after Episode 4 spine path is approved or while waiting only if no Episode 4 progress is possible",
        "scope": "Episodes 1-6",
        "what": "Apply the same spine-first audio evidence stack to each episode where source files exist, then mark missing media or human decisions clearly.",
        "why": "The value is reusable process, not Episode 4 artifact archaeology.",
        "proof": "Per-episode board: current-best spine, hard stops, human-listen status, branch readiness, shorts readiness, missing media.",
        "risk": "Never let Episode 1-6 rollout block Episode 4's immediate publication path.",
    },
]


COMPACT_GOAL = """Make Episode 4 publishable by approving the current-best audio spine first, then rendering final branches from source-aware audio truth. Keep v006 as the machine-preferred listen/export candidate unless human listening proves a scoped v007 repair is needed. In the editor, preserve separate refined Charlie, Homer, and clip/source audio stems synced to the same sequence clock, with mute/duck/cleanup decisions and the mix recipe stored as metadata; the combined mastered spine is useful for review, manual Premiere use, and final podcast audio, not the only canonical editing layer. Strengthen quality through layered evidence: delivery loudness/true peak, speaker survival, source/master ASR agreement, translation/device survival, review-risk windows, and human listen notes. Do not confuse audio-spine readiness with final YouTube/podcast/shorts readiness. If v006 passes, refresh the control plane, unlock branch inheritance, and render YouTube long-form, podcast/RSS audio, shorts/social, and reference branches. If v006 fails or needs proof, capture exact timestamps and route only scoped v007 proof/repair candidates. Preserve originals, use versioned derived artifacts, do not publish/upload/schedule externally without explicit approval, and roll this workflow to Episodes 1-6 only after Episode 4 is no longer blocked by the audio gate."""


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def resolve_baseline_dir(input_path: Path) -> Path:
    expanded = input_path.expanduser()
    if (expanded / "manifest.json").exists():
        return expanded.resolve()
    nested = expanded / "work" / "conformed-production-baseline"
    if (nested / "manifest.json").exists():
        return nested.resolve()
    raise FileNotFoundError(f"Could not find manifest.json under {input_path}")


def utc_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_slug(value: str) -> str:
    out = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value))
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-") or "audio-baseline"


def shell_quote(value: str) -> str:
    return "'" + value.replace("'", "'\"'\"'") + "'"


def output_path(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, list):
        for item in reversed(value):
            path = output_path(item)
            if path:
                return path
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath", "openCommand", "versionedPath"):
            subvalue = value.get(key)
            if isinstance(subvalue, str) and subvalue:
                return subvalue
    return None


def load_report(outputs: dict[str, Any], key: str, fallback: Path | None = None) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if path:
        candidate = Path(path)
        if candidate.exists() and candidate.suffix.lower() == ".json":
            try:
                return read_json(candidate)
            except json.JSONDecodeError:
                return {}
    if fallback and fallback.exists():
        try:
            return read_json(fallback)
        except json.JSONDecodeError:
            return {}
    return {}


def bool_value(value: Any) -> bool:
    return bool(value)


def int_value(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def build_report(manifest: dict[str, Any], baseline_dir: Path, generated_at: str) -> dict[str, Any]:
    outputs = manifest.get("outputs") or {}
    matrix = load_report(outputs, "latestAudioQualityMethodsMatrix", baseline_dir / "AUDIO_QUALITY_METHODS_MATRIX.json")
    post_approval = load_report(outputs, "latestAudioPostApprovalBranchRunwayPacket", baseline_dir / "AUDIO_POST_APPROVAL_BRANCH_RUNWAY_PACKET.json")
    asr_focus = load_report(outputs, "latestAudioAsrReviewFocusPacket", baseline_dir / "AUDIO_ASR_REVIEW_FOCUS_PACKET.json")
    spine_gate = load_report(outputs, "latestAudioSpineQualityGate", baseline_dir / "AUDIO_SPINE_QUALITY_GATE.json")
    runway = load_report(outputs, "latestAudioRunwayState", baseline_dir / "AUDIO_RUNWAY_STATE.json")

    approval_status = str(manifest.get("approvalStatus") or "unknown")
    current_gate = str(manifest.get("audioRunwayStateCurrentGate") or runway.get("currentGate") or "unknown")
    blocking_condition = str(manifest.get("audioRunwayStateBlockingCondition") or runway.get("blockingCondition") or "unknown")
    episode4_locked = approval_status == "machine-candidate-needs-human-listen-proof" and current_gate == "audio-spine-human-listen"
    post_approval_ready = bool_value(manifest.get("audioPostApprovalBranchRunwayPacketReadyWhenHumanApproved")) or bool_value(post_approval.get("readyWhenHumanApproved"))
    hard_stops = int_value(spine_gate.get("failCount") or manifest.get("audioSpineQualityGateFailCount"))
    asr_risks = int_value(asr_focus.get("reviewRiskCount") or manifest.get("audioAsrReviewFocusPacketReviewRiskCount"))

    immediate = [
        item
        for item in NEXT_METHODS
        if item["when"] in {"before or after human listen, safe now", "before branch renders, safe now"}
    ]
    after_approval = [item for item in NEXT_METHODS if "after audio approval" in item["when"] or item["id"] in {"final-branch-editorial-qa"}]
    if not after_approval:
        after_approval = [item for item in NEXT_METHODS if item["id"] == "final-branch-editorial-qa"]

    status = "quality-escalation-ready-human-listen-gated"
    if hard_stops:
        status = "quality-escalation-needs-hard-stop-review"
    elif not post_approval_ready:
        status = "quality-escalation-needs-runway-attention"

    return {
        "schema": "quipsly.audio.qualityEscalationPlan.v1",
        "generatedAt": generated_at,
        "baselineDir": str(baseline_dir),
        "baselineId": manifest.get("baselineId"),
        "status": status,
        "currentJudgementTarget": "Episode 4 v006 high-quality mastered audio spine",
        "editorAudioTruth": EDITOR_AUDIO_TRUTH,
        "notJudgingYet": [
            "Final YouTube episode quality",
            "Spotify/Apple podcast publication package",
            "YouTube Shorts / Instagram / Facebook / LinkedIn shorts quality",
            "External publication receipts",
        ],
        "approvalStatus": approval_status,
        "currentGate": current_gate,
        "blockingCondition": blocking_condition,
        "episode4StillLockedByHumanListen": episode4_locked,
        "postApprovalRunwayReadyWhenHumanApproved": post_approval_ready,
        "machineHardStopCount": hard_stops,
        "asrReviewRiskCount": asr_risks,
        "qualityMethodsMatrixStatus": matrix.get("status") or manifest.get("audioQualityMethodsMatrixLatestStatus"),
        "qualityMethodsCount": int_value(matrix.get("methodCount") or manifest.get("audioQualityMethodsMatrixMethodCount")),
        "implementedMethodsCount": int_value(matrix.get("implementedMethodCount") or manifest.get("audioQualityMethodsMatrixImplementedMethodCount")),
        "recommendedNextMethodsCount": int_value(matrix.get("recommendedNextMethodCount") or manifest.get("audioQualityMethodsMatrixRecommendedNextMethodCount")),
        "researchBase": RESEARCH_BASE,
        "nextMethods": NEXT_METHODS,
        "safeNowMethods": immediate,
        "afterApprovalMethods": after_approval,
        "episodeOneToSixRolloutRule": "Roll this playbook to Episodes 1-6 only after Episode 4's spine path is clear, or while waiting if the work cannot block Episode 4. Each episode gets its own current-best spine, human-listen state, branch readiness, and missing-media truth.",
        "compactGoalRewrite": COMPACT_GOAL,
        "nextSafeAction": "Charlie listens to v006 and records pass/fail/needs-proof. Meanwhile, the safest machine-only upgrades are a source-aware refined-stems manifest and a segment-level loudness/true-peak map; the higher-leverage perceptual/ASR/full-branch methods should wait unless the listen reveals a concrete need.",
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }


def markdown_path(path: str | None) -> str:
    return f"`{path}`" if path else "`missing`"


def write_markdown(path: Path, report: dict[str, Any]) -> None:
    lines = [
        "# Episode 4 Audio Quality Escalation Plan",
        "",
        f"Status: **{report['status']}**",
        f"Current judgement target: **{report['currentJudgementTarget']}**",
        "",
        "## Current gate",
        "",
        f"Approval status: `{report['approvalStatus']}`",
        f"Current gate: `{report['currentGate']}`",
        f"Blocking condition: `{report['blockingCondition']}`",
        f"Machine hard stops: `{report['machineHardStopCount']}`",
        f"ASR review risks: `{report['asrReviewRiskCount']}`",
        f"Post-approval runway ready when human approved: `{report['postApprovalRunwayReadyWhenHumanApproved']}`",
        "",
        "## What we are not judging yet",
        "",
    ]
    lines.extend(f"- {item}" for item in report["notJudgingYet"])
    truth = report["editorAudioTruth"]
    lines.extend([
        "",
        "## Editor audio truth",
        "",
        truth["rule"],
        "",
        f"Why it matters: {truth['whyItMatters']}",
        "",
        f"Implementation bias: {truth['implementationBias']}",
        "",
        "Required stems:",
        "",
    ])
    lines.extend(f"- {item}" for item in truth["requiredStems"])
    lines.extend(["", "## Research base", ""])
    for item in report["researchBase"]:
        lines.append(f"- **{item['label']}**: {item['whyItMatters']} Caveat: {item['quipslyCaveat']} ({item['url']})")
    lines.extend(["", "## Next stronger methods", ""])
    for item in report["nextMethods"]:
        lines.extend([
            f"### {item['priority']}. {item['id']}",
            f"- When: {item['when']}",
            f"- Scope: {item['scope']}",
            f"- What: {item['what']}",
            f"- Why: {item['why']}",
            f"- Proof: {item['proof']}",
            f"- Risk: {item['risk']}",
            "",
        ])
    lines.extend([
        "## Episodes 1-6 rollout rule",
        "",
        report["episodeOneToSixRolloutRule"],
        "",
        "## Compact goal rewrite",
        "",
        report["compactGoalRewrite"],
        "",
        "## Next safe action",
        "",
        report["nextSafeAction"],
        "",
        "## Safety readback",
        "",
        f"Approval changed: `{report['approvalStateChanged']}`",
        f"Branch changed: `{report['branchStateChanged']}`",
        f"Render attempted: `{report['renderAttempted']}`",
        f"Upload attempted: `{report['uploadAttempted']}`",
        f"Publication attempted: `{report['publicationAttempted']}`",
        f"Original media mutated: `{report['originalMediaMutated']}`",
        "",
    ])
    path.write_text("\n".join(lines), encoding="utf-8")


def html_link(url: str) -> str:
    return f'<a href="{html.escape(url)}">{html.escape(url)}</a>'


def write_html(path: Path, report: dict[str, Any]) -> None:
    method_cards = "\n".join(
        f"<article><h3>{item['priority']}. {html.escape(item['id'])}</h3>"
        f"<p><strong>When:</strong> {html.escape(item['when'])}<br>"
        f"<strong>Scope:</strong> {html.escape(item['scope'])}<br>"
        f"<strong>What:</strong> {html.escape(item['what'])}<br>"
        f"<strong>Why:</strong> {html.escape(item['why'])}<br>"
        f"<strong>Proof:</strong> {html.escape(item['proof'])}<br>"
        f"<strong>Risk:</strong> {html.escape(item['risk'])}</p></article>"
        for item in report["nextMethods"]
    )
    research_items = "\n".join(
        f"<li><strong>{html.escape(item['label'])}</strong>: {html.escape(item['whyItMatters'])}<br>"
        f"Caveat: {html.escape(item['quipslyCaveat'])}<br>{html_link(item['url'])}</li>"
        for item in report["researchBase"]
    )
    truth = report["editorAudioTruth"]
    stem_items = "".join(f"<li>{html.escape(item)}</li>" for item in truth["requiredStems"])
    body = f"""<!doctype html><html><head><meta charset=\"utf-8\"><title>Episode 4 Quality Escalation Plan</title>
<style>
body{{font-family:-apple-system,BlinkMacSystemFont,sans-serif;background:#f5efe2;color:#2d2417;margin:32px;line-height:1.5;}}
main{{max-width:1120px;margin:auto;background:#fffaf1;border:1px solid #decda8;border-radius:24px;padding:28px;box-shadow:0 16px 44px rgba(65,45,20,.14);}}
.badge{{display:inline-block;background:#2e5d42;color:#efffea;border-radius:999px;padding:8px 12px;font-weight:800;letter-spacing:.03em;}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;}}
.card, article{{background:#fff;border:1px solid #eadbbb;border-radius:16px;padding:16px;}}
code{{background:#efe5cf;padding:2px 5px;border-radius:6px;}}
a{{color:#27624a;}}
</style></head><body><main>
<p class=\"badge\">{html.escape(report['status'])}</p>
<h1>Episode 4 Audio Quality Escalation Plan</h1>
<div class=\"grid\">
<div class=\"card\"><strong>Current target</strong><br>{html.escape(report['currentJudgementTarget'])}</div>
<div class=\"card\"><strong>Gate</strong><br><code>{html.escape(report['currentGate'])}</code></div>
<div class=\"card\"><strong>Blocking condition</strong><br><code>{html.escape(report['blockingCondition'])}</code></div>
<div class=\"card\"><strong>Post-approval runway</strong><br>ready when approved: <code>{report['postApprovalRunwayReadyWhenHumanApproved']}</code></div>
</div>
<h2>Not judging yet</h2><ul>{''.join(f'<li>{html.escape(item)}</li>' for item in report['notJudgingYet'])}</ul>
<h2>Editor audio truth</h2><p>{html.escape(truth['rule'])}</p><p>{html.escape(truth['whyItMatters'])}</p><p><strong>Implementation bias:</strong> {html.escape(truth['implementationBias'])}</p><ul>{stem_items}</ul>
<h2>Research base</h2><ul>{research_items}</ul>
<h2>Next stronger methods</h2>{method_cards}
<h2>Episodes 1-6 rollout rule</h2><p>{html.escape(report['episodeOneToSixRolloutRule'])}</p>
<h2>Compact goal rewrite</h2><p>{html.escape(report['compactGoalRewrite'])}</p>
<h2>Next safe action</h2><p>{html.escape(report['nextSafeAction'])}</p>
<h2>Safety readback</h2><p>Approval changed: <code>{report['approvalStateChanged']}</code> | Branch changed: <code>{report['branchStateChanged']}</code> | Render attempted: <code>{report['renderAttempted']}</code> | Upload attempted: <code>{report['uploadAttempted']}</code> | Publication attempted: <code>{report['publicationAttempted']}</code> | Original media mutated: <code>{report['originalMediaMutated']}</code></p>
</main></body></html>"""
    path.write_text(body, encoding="utf-8")


def write_open_command(path: Path, html_path: Path, md_path: Path) -> None:
    path.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        f"open {shell_quote(str(html_path))}\n"
        f"open {shell_quote(str(md_path))}\n",
        encoding="utf-8",
    )
    path.chmod(0o755)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", type=Path, default=DEFAULT_BASELINE_DIR)
    args = parser.parse_args()

    baseline_dir = resolve_baseline_dir(args.baseline_dir)
    manifest_path = baseline_dir / "manifest.json"
    manifest = read_json(manifest_path)
    generated_at = iso_now()
    stamp = utc_stamp()
    baseline_slug = safe_slug(str(manifest.get("baselineId") or baseline_dir.name))
    report = build_report(manifest, baseline_dir, generated_at)

    stable_json = baseline_dir / "AUDIO_QUALITY_ESCALATION_PLAN.json"
    stable_md = baseline_dir / "AUDIO_QUALITY_ESCALATION_PLAN.md"
    stable_html = baseline_dir / "AUDIO_QUALITY_ESCALATION_PLAN.html"
    stable_open = baseline_dir / "OPEN_AUDIO_QUALITY_ESCALATION_PLAN.command"
    versioned_json = baseline_dir / f"audio-quality-escalation-plan-{baseline_slug}-{stamp}.json"
    versioned_md = baseline_dir / f"audio-quality-escalation-plan-{baseline_slug}-{stamp}.md"
    versioned_html = baseline_dir / f"audio-quality-escalation-plan-{baseline_slug}-{stamp}.html"
    versioned_open = baseline_dir / f"open-audio-quality-escalation-plan-{baseline_slug}-{stamp}.command"

    write_json(stable_json, report)
    write_json(versioned_json, report)
    write_markdown(stable_md, report)
    write_markdown(versioned_md, report)
    write_html(stable_html, report)
    write_html(versioned_html, report)
    write_open_command(stable_open, stable_html, stable_md)
    write_open_command(versioned_open, versioned_html, versioned_md)

    manifest_after = read_json(manifest_path)
    outputs = manifest_after.setdefault("outputs", {})
    entry = {
        "path": str(stable_json),
        "jsonPath": str(stable_json),
        "markdownPath": str(stable_md),
        "htmlPath": str(stable_html),
        "openCommand": str(stable_open),
        "versionedPath": str(versioned_json),
        "versionedJsonPath": str(versioned_json),
        "versionedMarkdownPath": str(versioned_md),
        "versionedHtmlPath": str(versioned_html),
        "versionedOpenCommand": str(versioned_open),
        "generatedAt": generated_at,
        "schema": report["schema"],
        "status": report["status"],
        "machineHardStopCount": report["machineHardStopCount"],
        "asrReviewRiskCount": report["asrReviewRiskCount"],
        "nextMethodCount": len(report["nextMethods"]),
        "safeNowMethodCount": len(report["safeNowMethods"]),
        "editorAudioTruthRule": report["editorAudioTruth"]["rule"],
        "requiredStemCount": len(report["editorAudioTruth"]["requiredStems"]),
        "postApprovalRunwayReadyWhenHumanApproved": report["postApprovalRunwayReadyWhenHumanApproved"],
        "approvalStateChanged": False,
        "branchStateChanged": False,
        "renderAttempted": False,
        "branchRenderAttempted": False,
        "uploadAttempted": False,
        "publicationAttempted": False,
        "originalMediaMutated": False,
    }
    history = outputs.setdefault("audioQualityEscalationPlans", [])
    history.append(entry)
    outputs["latestAudioQualityEscalationPlan"] = entry
    outputs["latestAudioQualityEscalationPlanMarkdown"] = str(stable_md)
    outputs["latestAudioQualityEscalationPlanHtml"] = str(stable_html)
    outputs["latestAudioQualityEscalationPlanOpenCommand"] = str(stable_open)

    manifest_after["audioQualityEscalationPlanCount"] = len(history)
    manifest_after["audioQualityEscalationPlanLatestStatus"] = report["status"]
    manifest_after["audioQualityEscalationPlanMachineHardStopCount"] = report["machineHardStopCount"]
    manifest_after["audioQualityEscalationPlanAsrReviewRiskCount"] = report["asrReviewRiskCount"]
    manifest_after["audioQualityEscalationPlanNextMethodCount"] = len(report["nextMethods"])
    manifest_after["audioQualityEscalationPlanSafeNowMethodCount"] = len(report["safeNowMethods"])
    manifest_after["audioQualityEscalationPlanEditorAudioTruthRule"] = report["editorAudioTruth"]["rule"]
    manifest_after["audioQualityEscalationPlanRequiredStemCount"] = len(report["editorAudioTruth"]["requiredStems"])
    manifest_after["audioQualityEscalationPlanPostApprovalRunwayReadyWhenHumanApproved"] = report["postApprovalRunwayReadyWhenHumanApproved"]
    manifest_after["audioQualityEscalationPlanLatestGeneratedAt"] = generated_at
    manifest_after["audioQualityEscalationPlanLatestMarkdown"] = str(stable_md)
    manifest_after["audioQualityEscalationPlanApprovalStateChanged"] = False
    manifest_after["audioQualityEscalationPlanBranchStateChanged"] = False
    manifest_after["audioQualityEscalationPlanRenderAttempted"] = False
    manifest_after["audioQualityEscalationPlanBranchRenderAttempted"] = False
    manifest_after["audioQualityEscalationPlanUploadAttempted"] = False
    manifest_after["audioQualityEscalationPlanPublicationAttempted"] = False
    manifest_after["audioQualityEscalationPlanOriginalMediaMutated"] = False
    write_json(manifest_path, manifest_after)
    print(json.dumps(entry, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
