#!/usr/bin/env python3
"""Create a research-backed quality-methods matrix for the audio workbench.

This is a control-plane artifact only. It does not render, approve, upload,
publish, mutate source media, or unlock branches. Its job is to keep the
quality conversation honest: the current gate is the high-quality audio spine,
while final episode and shorts quality add editorial and platform concerns on
top of that spine.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def shell_quote(value: str) -> str:
    return shlex.quote(value)


def output_path(value: Any) -> str | None:
    if not value:
        return None
    if isinstance(value, dict):
        for key in ("path", "jsonPath", "markdownPath", "htmlPath"):
            candidate = value.get(key)
            if candidate and Path(str(candidate)).exists():
                return str(candidate)
        return None
    path = Path(str(value))
    return str(path) if path.exists() else None


def load_output_report(outputs: dict[str, Any], key: str) -> dict[str, Any]:
    path = output_path(outputs.get(key))
    if not path:
        return {}
    try:
        return load_json(Path(path))
    except Exception:
        return {}


def int_value(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def bool_value(value: Any) -> bool:
    return bool(value)


def method(
    *,
    name: str,
    target: str,
    status: str,
    proves: str,
    blind_spot: str,
    current_evidence: list[str],
    next_upgrade: str,
    references: list[str],
) -> dict[str, Any]:
    return {
        "name": name,
        "target": target,
        "status": status,
        "proves": proves,
        "blindSpot": blind_spot,
        "currentEvidence": current_evidence,
        "nextUpgrade": next_upgrade,
        "references": references,
    }


def quality_layer(
    *,
    name: str,
    target: str,
    release_decision: str,
    must_prove: list[str],
    not_allowed_to_claim: list[str],
    current_gate: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "target": target,
        "releaseDecision": release_decision,
        "mustProve": must_prove,
        "notAllowedToClaim": not_allowed_to_claim,
        "currentGate": current_gate,
    }


def research_reference(*, label: str, url: str, applied_as: str, caveat: str) -> dict[str, str]:
    return {
        "label": label,
        "url": url,
        "appliedAs": applied_as,
        "caveat": caveat,
    }


def decision_protocol_step(
    *,
    name: str,
    scope: str,
    machine_can_decide: list[str],
    human_must_decide: list[str],
    evidence: list[str],
    output: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "scope": scope,
        "machineCanDecide": machine_can_decide,
        "humanMustDecide": human_must_decide,
        "evidence": evidence,
        "output": output,
    }


def build_report(baseline_dir: Path) -> dict[str, Any]:
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.get("outputs") or {}
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    platform = load_output_report(outputs, "latestAudioPlatformLoudnessAudit")
    broadcast = load_output_report(outputs, "latestAudioBroadcastPolishScorecard")
    sound_director = load_output_report(outputs, "latestAudioSoundDirectorScorecard")
    morning = load_output_report(outputs, "latestAudioMorningPublicationReadinessPacket")
    source_balance = load_output_report(outputs, "latestAudioSourceBalanceTriage")
    speaker_cleanup = load_output_report(outputs, "latestSpeakerCleanupAcceptanceBoard")
    master_smoothness = load_output_report(outputs, "latestAudioMasterSmoothnessAudit")
    spectral_fatigue = load_output_report(outputs, "latestAudioSpectralFatigueAudit")
    translation_survival = load_output_report(outputs, "latestAudioTranslationSurvivalAudit")
    defect_atlas = load_output_report(outputs, "latestAudioDefectAtlas")
    defect_atlas_notes = load_output_report(outputs, "latestAudioDefectAtlasNotesInbox")
    defect_atlas_smoke = load_output_report(outputs, "latestAudioDefectAtlasNotesInboxSmoke")
    blind_listen_sampler = load_output_report(outputs, "latestAudioBlindListenSampler")
    blind_listen_notes = load_output_report(outputs, "latestAudioBlindListenNotesInbox")
    blind_listen_notes_smoke = load_output_report(outputs, "latestAudioBlindListenNotesInboxSmoke")
    final_mission = load_output_report(outputs, "latestAudioFinalListenMissionPacket")
    action_queue = load_output_report(outputs, "latestAudioPostReviewActionQueue")

    platform_summary = platform.get("summary") if isinstance(platform.get("summary"), dict) else {}
    defect_atlas_summary = defect_atlas.get("summary") if isinstance(defect_atlas.get("summary"), dict) else {}
    broadcast_score = broadcast.get("overallScore")
    sound_score = sound_director.get("machineConfidenceScore")
    hard_stops = (
        int_value(platform_summary.get("hardGateAttentionCount"))
        + int_value(sound_director.get("hardStopCount"))
        + int_value(morning.get("hardStopCount"))
    )
    review_risks = (
        int_value(platform_summary.get("advisoryAttentionCount"))
        + int_value(sound_director.get("reviewRiskCount"))
        + int_value(morning.get("reviewRiskCount"))
    )

    quality_layers = [
        quality_layer(
            name="Audio spine quality",
            target="episode-4-mastered-audio-spine-v006",
            release_decision="Can this mastered conversation become the inherited production spine for episode, podcast-audio, and shorts branches?",
            must_prove=[
                "Podcast-safe delivery shape: duration, codec, sample rate, channels, integrated loudness, true peak, and handoff file integrity.",
                "Both Charlie and Homer survive cleanup and remain intelligible in proof windows.",
                "Bleed suppression does not erase natural overlap, laughter, or reactions.",
                "The tired-human review path is short, exact, and reversible.",
            ],
            not_allowed_to_claim=[
                "A good final video episode.",
                "A good social short.",
                "Published, uploaded, scheduled, or externally approved.",
            ],
            current_gate="Machine-ready, human-listen required. This is the active gate.",
        ),
        quality_layer(
            name="Final long-form episode quality",
            target="YouTube episode, podcast audio file, and manual publication packet",
            release_decision="Can this be watched/listened to as a finished episode with intentional pacing, reactions, source clips, and platform-safe audio?",
            must_prove=[
                "Audio spine has a guarded human pass.",
                "Video decisions use the approved spine, not stale raw/sync assumptions.",
                "Clip insertions and reactions feel intentional, not pasted in.",
                "Cadence checks include L/J cut opportunities, reaction coverage, jump-cut handling, and silence rhythm.",
                "Platform packet separates local export readiness from actual publication receipts.",
            ],
            not_allowed_to_claim=[
                "Audio-spine approval by itself proves final episode quality.",
                "A branch render is a publication receipt.",
                "One platform target automatically fits every platform.",
            ],
            current_gate="Locked until the audio spine is approved.",
        ),
        quality_layer(
            name="Shorts and social-clip quality",
            target="YouTube Shorts, Instagram, Facebook, LinkedIn, and Patreon clips",
            release_decision="Can this clip stand alone, hook quickly, stay intelligible, frame faces safely, and justify posting?",
            must_prove=[
                "First-three-second hook is legible without episode context.",
                "Thought arc has a clean beginning, turn, and payoff.",
                "Captions, crop, face safety, and platform duration/aspect are checked.",
                "Audio remains clear after short-specific compression and platform packaging.",
                "Each short maps back to a source decision branch and approved spine.",
            ],
            not_allowed_to_claim=[
                "Technically exported means worth posting.",
                "A viral hook score is the same thing as truth or usefulness.",
                "Shorts can bypass the spine approval gate.",
            ],
            current_gate="Downstream. Locked until the Episode 4 audio spine passes human listen.",
        ),
    ]

    research_references = [
        research_reference(
            label="ITU-R BS.1770",
            url="https://www.itu.int/rec/R-REC-BS.1770",
            applied_as="Use BS.1770-style loudness and true-peak measurement as the objective measurement base.",
            caveat="It measures loudness and true peak; it does not judge story flow, speaker survival, or human naturalness.",
        ),
        research_reference(
            label="EBU R 128",
            url="https://tech.ebu.ch/publications/r128/",
            applied_as="Use R128 thinking for integrated loudness, loudness range, and true-peak discipline.",
            caveat="Broadcast targets are not identical to podcast/social targets; use as metering discipline, not a universal level target.",
        ),
        research_reference(
            label="Apple Podcasts audio requirements",
            url="https://podcasters.apple.com/support/893-audio-requirements",
            applied_as="Keep the podcast-audio branch compatible with Apple-style podcast handoff expectations, especially AAC/MP4 preference and level safety.",
            caveat="Passing technical requirements does not mean the episode is artistically or editorially ready.",
        ),
        research_reference(
            label="Spotify for Creators supported audio types",
            url="https://support.spotify.com/us/creators/article/publishing-audio-episodes/",
            applied_as="Verify podcast upload/export files are in supported MP3, M4A, or WAV mono/stereo shapes.",
            caveat="Container support is only a packaging gate; it says nothing about source balance or listening quality.",
        ),
        research_reference(
            label="Spotify loudness normalization",
            url="https://support.spotify.com/us/artists/article/loudness-normalization/",
            applied_as="Use -14 LUFS / true-peak headroom as a downstream music/streaming reference for video/social auditioning, not as the current podcast-spine approval target.",
            caveat="Spotify music guidance is not the same as Apple podcast delivery; avoid collapsing all platform branches into one master target.",
        ),
        research_reference(
            label="Spotify for Creators supported audio uploads",
            url="https://support.spotify.com/us/creators/article/publishing-audio-episodes/",
            applied_as="Keep podcast-delivery packet checks explicit: Spotify accepts MP3, M4A, and WAV in mono or stereo, while Quipsly still prefers a reviewed high-quality spine plus platform-specific copies.",
            caveat="Supported upload type is not a quality judgment. It is only a delivery gate.",
        ),
        research_reference(
            label="YouTube recommended upload encoding settings",
            url="https://support.google.com/youtube/answer/1722171",
            applied_as="Use YouTube's upload-container and audio-format expectations as downstream episode/short packaging checks after the audio spine is approved.",
            caveat="YouTube packaging rules are not the current audio-spine gate and do not validate editorial quality, reaction timing, or short hook strength.",
        ),
        research_reference(
            label="DNSMOS P.835",
            url="https://www.microsoft.com/en-us/research/publication/dnsmos-a-non-intrusive-perceptual-objective-speech-quality-metric-to-evaluate-noise-suppressors-2/",
            applied_as="Use no-reference speech-quality scoring as a future routing signal for noise, speech quality, background quality, and overall quality.",
            caveat="DNSMOS-like scores should rank proof windows and regressions; they should not approve a mastered spine without human listening.",
        ),
        research_reference(
            label="ITU-R BS.1534 / MUSHRA-style subjective listening",
            url="https://www.itu.int/rec/R-REC-BS.1534/",
            applied_as="Use randomized, label-hidden listening as a bias-reduction pattern for reviewer notes before revealing machine defect labels.",
            caveat="Quipsly is not claiming formal MUSHRA lab scoring; the useful product move is balanced blind sampling that routes exact notes back to evidence.",
        ),
        research_reference(
            label="Apple Podcasts audio best practices",
            url="https://podcasters.apple.com/support/893-audio-requirements",
            applied_as="Treat delivery loudness, file duration, codec, and listener safety as hard technical gates for the podcast branch.",
            caveat="Apple-compatible audio can still be a bad edit or a bad human listen. Technical compatibility is necessary but not sufficient.",
        ),
        research_reference(
            label="YouTube help: recommended upload encoding settings",
            url="https://support.google.com/youtube/answer/1722171",
            applied_as="Treat YouTube audio/video settings as branch-specific packaging checks after the approved spine is inherited.",
            caveat="YouTube upload compatibility is downstream from the current audio-spine gate.",
        ),
    ]

    methods = [
        method(
            name="Platform delivery compliance",
            target="audio-spine",
            status="implemented",
            proves="The master is shaped for podcast/video delivery constraints such as integrated loudness, true peak, codec handoff, and reviewable file paths.",
            blind_spot="Platform-ready loudness does not prove natural conversation, clean speaker overlap, or an interesting final episode.",
            current_evidence=[
                f"Platform hard-gate attention: {platform_summary.get('hardGateAttentionCount', 'not generated')}.",
                f"Podcast profiles machine-ready: {platform_summary.get('podcastProfilesMachineReady', 'not generated')}.",
                f"Translation survival: {translation_survival.get('status', 'not generated')} with {translation_survival.get('hardStopCount', 'n/a')} hard stops.",
            ],
            next_upgrade="Extend translation survival from proof windows into optional device-specific listen reels after the v006 spine passes human review.",
            references=[
                "Apple Podcasts audio requirements: roughly -16 dB LKFS, +/- 1 dB, true peak no higher than -1 dB FS.",
                "YouTube upload guidance: AAC-LC audio and platform-safe bitrate packaging.",
                "EBU R128 / ITU BS.1770 style loudness measurement through FFmpeg loudnorm/ebur128.",
            ],
        ),
        method(
            name="Speaker survival and source balance",
            target="audio-spine",
            status="implemented",
            proves="Charlie and Homer both remain present after source-aware cleanup, instead of one host being accidentally muted by bleed suppression.",
            blind_spot="Activity windows and contribution ledgers can prove presence, but human listening still decides whether overlap, laughter, and reaction timing feel alive.",
            current_evidence=[
                f"Source balance all-speakers-survive: {source_balance.get('allSpeakersSurviveInMaster', 'not generated')}.",
                f"Speaker cleanup acceptance missing artifacts: {speaker_cleanup.get('missingArtifactCount', 'not generated')}.",
            ],
            next_upgrade="Use per-speaker diarization confidence and overlap-aware speech masks as advisory inputs, but keep the editable non-destructive cleanup layer as the source of truth.",
            references=[
                "ITU P.835 style thinking separates speech quality, background noise, and overall quality rather than collapsing them into one value.",
            ],
        ),
        method(
            name="Perceptual speech-quality scoring",
            target="audio-spine",
            status="recommended-next",
            proves="Non-intrusive models can flag likely artifacts such as coloration, discontinuity, noise, and degraded speech before a human wastes time on a full listen.",
            blind_spot="Model scores are regression alarms, not taste. They should route proof windows, not approve a spine.",
            current_evidence=[
                "No dedicated NISQA/DNSMOS-style score is currently registered in the manifest.",
                f"Sound Director score currently aggregates available evidence: {sound_score if sound_score is not None else 'not generated'}.",
            ],
            next_upgrade="Add an optional local perceptual scorer adapter that writes per-window NISQA/DNSMOS-style quality signals into the Defect Atlas and review queue. Treat low-score clusters as listen-priority routing, not as automatic failure.",
            references=[
                "NISQA dimensions: overall quality, noisiness, discontinuity, coloration, and loudness.",
                "DNSMOS P.835 style scores: speech quality (SIG), background quality (BAK), and overall quality (OVRL).",
                "Human subjective evaluation remains the gold standard; perceptual objective metrics are proxy alarms.",
            ],
        ),
        method(
            name="Reference-regression and A/B lineage",
            target="audio-spine",
            status="recommended-next",
            proves="Each new spine version can be compared against the previous candidate and source proof windows so repairs improve a specific symptom without quietly damaging speaker presence, timing, or natural overlap elsewhere.",
            blind_spot="A/B regression can show what changed and where to listen, but it cannot decide whether a subjective tradeoff sounds more human.",
            current_evidence=[
                "The manifest already preserves v005 to v006 lineage and multiple proof/review artifacts.",
                "Current v006 branch inheritance remains locked, so a v007 repair can still be scoped without contaminating final renders.",
            ],
            next_upgrade="Add an explicit version-delta scorecard: per-proof-window loudness delta, spectral delta, activity-mask delta, silence-boundary delta, transcript-agreement delta, and reviewer note impact. Use it before promoting any v007.",
            references=[
                "Quipsly versioning rule: never overwrite previous audio-spine versions; create scoped repair candidates.",
                "Perceptual scores and loudness metrics become more useful when tracked as deltas between candidate versions.",
            ],
        ),
        method(
            name="Transcript and source-audio agreement",
            target="audio-spine",
            status="recommended-next",
            proves="Independent transcripts from raw sources, cleaned stems, and the mastered spine still describe the same conversation and do not reveal dropped speaker content.",
            blind_spot="ASR disagreement can come from transcription error, not audio failure. It is a mismatch detector, not a judge.",
            current_evidence=[
                "Episode 4 experimental transcript chunks exist, but transcript agreement is not yet part of the audio quality gate.",
                "Current gates prove speaker survival with energy/activity evidence, not semantic transcript agreement.",
            ],
            next_upgrade="Run source/master ASR comparisons on proof windows and full-spine chapters: missing-speaker phrases, severe WER spikes, long untranscribed speech, and speaker-label flips should create review queue items.",
            references=[
                "Quipsly source truth: use raw aligned audio/video as evidence before trusting any enhanced master.",
                "Podcast quality includes intelligibility and semantic preservation, not just loudness and file validity.",
            ],
        ),
        method(
            name="Translation-device audition",
            target="audio-spine",
            status="implemented" if translation_survival.get("status") == "translation-survival-audit-ready" else "partial",
            proves="The spine remains understandable and pleasant after realistic listener transformations: laptop speakers, phone speaker, earbuds, car-like EQ, and mono fold-down.",
            blind_spot="Synthetic device filters are approximations. They catch obvious translation failures but do not replace listening on real devices.",
            current_evidence=[
                f"Translation survival status: {translation_survival.get('status', 'not generated')}.",
                f"Derived translation renders: {translation_survival.get('translationRenderCount', 'not generated')}.",
                f"Translation hard stops / risks: {translation_survival.get('hardStopCount', 'not generated')} / {translation_survival.get('reviewRiskCount', 'not generated')}.",
            ],
            next_upgrade="Add optional real-device checklist rows for Charlie/Mako: phone speaker, AirPods, car, and laptop speakers. Keep synthetic snippets as fast regression proof.",
            references=[
                "Apple warns that poor level choices can make spoken content inaudible or distorted for listeners.",
                "YouTube recommends 48 kHz audio and stereo-safe upload settings; platform correctness still needs listener-context proof.",
            ],
        ),
        method(
            name="Spectral and listener-fatigue audit",
            target="audio-spine",
            status="implemented" if spectral_fatigue.get("status") in {"spectral-fatigue-ready", "spectral-fatigue-ready-with-review-risks"} else "partial",
            proves="Sampled proof windows have voice-band measurements for rumble, warmth, mud, body, presence, harshness, air/hiss, and rough over-squash risk before humans spend a full listen.",
            blind_spot="Spectral balance is a proxy for fatigue, not taste. It can say where to listen, not whether the show feels emotionally right.",
            current_evidence=[
                f"Spectral fatigue status: {spectral_fatigue.get('status', 'not generated')}.",
                f"Spectral windows / measurements: {spectral_fatigue.get('windowCount', 'not generated')} / {spectral_fatigue.get('measurementCount', 'not generated')}.",
                f"Spectral hard stops / risks: {spectral_fatigue.get('hardStopCount', 'not generated')} / {spectral_fatigue.get('reviewRiskCount', 'not generated')}.",
            ],
            next_upgrade="Route spectral risk clusters into the Defect Atlas and Studio Sound Control Room so future v007 repairs can target specific EQ/noise symptoms without retuning the whole chain.",
            references=[
                "Podcast voice quality depends on intelligibility bands, low-frequency rumble control, harshness control, and preserved human cadence.",
                "Use spectral evidence as a listen-routing and regression signal, not as a replacement for Charlie's guarded human approval.",
            ],
        ),
        method(
            name="Platform transcode and compression survivability",
            target="final-episode-and-shorts",
            status="recommended-next",
            proves="A platform-specific video/audio branch remains intelligible after realistic AAC/H.264/H.265/social-style compression, mono fold-down, and loudness normalization assumptions.",
            blind_spot="Compression survivability proves technical resilience, not that the edit is funny, meaningful, or paced well.",
            current_evidence=[
                "Current Episode 4 branch renders are locked until audio-spine approval, so this is intentionally not run as a final-branch claim yet.",
                "Platform delivery evidence exists for the audio spine; final YouTube/social branch packaging still needs its own downstream pass.",
            ],
            next_upgrade="After v006 passes, render small branch proof excerpts through YouTube-style and social-style export settings, then re-run loudness, true peak, intelligibility, caption timing, and face/crop safety checks.",
            references=[
                "Spotify accepts MP3, M4A, and WAV mono/stereo uploads, but upload acceptance is not the same thing as audience-ready quality.",
                "YouTube upload settings belong to the final episode and shorts branch, not to the raw audio-spine approval gate.",
            ],
        ),
        method(
            name="Master envelope and smoothness contour",
            target="audio-spine",
            status="implemented" if master_smoothness.get("status") == "smoothness-audit-ready" else "partial",
            proves="The mastered spine has a full-length time-contour scan for abrupt envelope jumps, hard silence edges, long low-level spans, and high-yield listen targets.",
            blind_spot="Envelope smoothness does not know whether a jump is a bad edit, a natural laugh, a good dramatic pause, or a necessary branch point. It routes ears; it does not approve taste.",
            current_evidence=[
                f"Smoothness status: {master_smoothness.get('status', 'not generated')}.",
                f"Smoothness windows / transitions: {(master_smoothness.get('audio') or {}).get('windowCount', 'not generated') if isinstance(master_smoothness.get('audio'), dict) else 'not generated'} / {master_smoothness.get('transitionCount', 'not generated')}.",
                f"Smoothness listen checks / review targets: {master_smoothness.get('listenCheckCount', 'not generated')} / {master_smoothness.get('reviewRiskCount', 'not generated')}.",
                f"Long low-level spans: {master_smoothness.get('longSilenceSpanCount', 'not generated')}.",
            ],
            next_upgrade="Convert recurring contour patterns into editable audio-stage suggestions: deliberate pause, likely over-gate, possible jump-cut, possible missing reaction, or needs human taste check.",
            references=[
                "EBU R128 / ITU BS.1770 style loudness discipline should be paired with time-contour review so one integrated number cannot hide listener-fatigue spots.",
                "Use contour evidence to select review snippets and proof windows; keep approval with the guarded human listen path.",
            ],
        ),
        method(
            name="Source-leakage and bleed regression",
            target="audio-spine",
            status="partial",
            proves="Cleanup suppresses unwanted echo/noise under the inactive speaker without erasing laughter, reactions, or natural overlap.",
            blind_spot="Energy masks can mistake low-volume reaction speech for bleed. The fix must be source-aware and listen-guided.",
            current_evidence=[
                f"Source balance all-speakers-survive: {source_balance.get('allSpeakersSurviveInMaster', 'not generated')}.",
                f"Speaker cleanup acceptance missing artifacts: {speaker_cleanup.get('missingArtifactCount', 'not generated')}.",
            ],
            next_upgrade="Promote source-leakage checks into their own regression board: echo-under-active-speaker, room-noise-under-active-speaker, overgate, preserved-overlap, and reaction-survival windows.",
            references=[
                "ITU P.835 style thinking separates speech quality, background quality, and overall quality.",
                "Quipsly editorial rule: preserve human reactions unless a reviewer explicitly marks them as noise.",
            ],
        ),
        method(
            name="Cadence and edit-flow naturalness",
            target="final-episode",
            status="partial",
            proves="Smoothness packs and listen reels identify sections likely to sound chopped, over-gated, or cadence-broken before final episode rendering.",
            blind_spot="The audio spine can pass while the final episode still has bad pacing, weak reaction cuts, or awkward inserted clips.",
            current_evidence=[
                f"Broadcast polish score: {broadcast_score if broadcast_score is not None else 'not generated'}.",
                f"Final listen mission ready: {final_mission.get('readyForFinalHumanListen', 'not generated')}.",
            ],
            next_upgrade="When episode branches render, add edit-decision QA: jump-cut density, L/J cut opportunities, reaction-shot coverage, silence/gap rhythm, and transcript continuity.",
            references=[
                "Final episode quality requires editorial review on top of audio spine readiness.",
            ],
        ),
        method(
            name="Shorts readiness and hook quality",
            target="final-shorts",
            status="future-downstream",
            proves="A social clip has a clear hook, coherent thought arc, audible speech, platform-safe framing, and caption/readability support.",
            blind_spot="Shorts can be technically perfect and still boring. Hook quality needs editorial scoring and platform feedback loops.",
            current_evidence=[
                "Current Episode 4 goal is still audio-spine first; shorts rendering is locked until branch inheritance is approved.",
                "Existing shorts boards for Episodes 1-3 prove the pattern but are not a substitute for Episode 4 audio approval.",
            ],
            next_upgrade="After Episode 4 audio approval, score every short branch on first-three-second hook, standalone context, emotional/insight payoff, caption density, face/framing safety, and cut rhythm.",
            references=[
                "YouTube upload guidance supports vertical/square aspect adaptation, but platform packaging does not prove audience quality.",
                "Quipsly Tower should track receipts and performance later; Studio should create the best human-readable candidate first.",
            ],
        ),
        method(
            name="Human-review burden minimization",
            target="audio-spine",
            status="implemented",
            proves="The system can route Charlie/Mako to the smallest sufficient listen path instead of dumping every artifact on them.",
            blind_spot="A smaller listen path is only useful if the selected windows are actually representative.",
            current_evidence=[
                f"Morning review ready: {morning.get('readyForMorningReview', 'not generated')}.",
                f"Review action queue sources: {action_queue.get('sourceCount', 'not generated')}.",
            ],
            next_upgrade="Use returned notes to learn which machine warnings matter, then tune future listen missions toward high-yield windows.",
            references=[
                "Quipsly product rule: expose evidence and next safe action; do not hide judgment behind a black box.",
            ],
        ),
        method(
            name="Stratified blind-listen sampling",
            target="audio-spine",
            status="implemented" if blind_listen_sampler.get("status") == "blind-listen-sampler-ready" else "recommended-next",
            proves="A reviewer can hear a balanced sample of easy, risky, speaker-overlap, quiet-floor, high-energy, and transition windows without being biased by machine labels or spending two hours first.",
            blind_spot="Blind sampling can reduce confirmation bias, but it still cannot prove full-episode editorial flow unless followed by a normal listen or representative long segment.",
            current_evidence=[
                f"Blind listen sampler status: {blind_listen_sampler.get('status', 'not generated')}.",
                f"Blind samples / reveal mappings: {blind_listen_sampler.get('sampleCount', 'not generated')} / {blind_listen_sampler.get('hiddenRevealCount', 'not generated')}.",
                f"Stage strata / severity strata: {blind_listen_sampler.get('stageStratumCount', 'not generated')} / {blind_listen_sampler.get('severityStratumCount', 'not generated')}.",
                f"Master audio: {blind_listen_sampler.get('masterAudioPath', 'not generated')}.",
                f"Blind notes inbox: {blind_listen_notes.get('status', 'not generated')} with {blind_listen_notes.get('matchingCandidateCount', 'not generated')} returned note candidates.",
                f"Blind notes smoke: passed={blind_listen_notes_smoke.get('passed', 'not generated')}, scenarios={blind_listen_notes_smoke.get('scenarioCount', 'not generated')}, failures={blind_listen_notes_smoke.get('failureCount', 'not generated')}.",
            ],
            next_upgrade="Import exported blind-listen notes, reveal machine labels after notes are captured, and map human decisions back into the Defect Atlas and scoped v007 repair router.",
            references=[
                "Human subjective listening remains the final gate for naturalness.",
                "MUSHRA-style randomized listening is useful here as a bias-reduction pattern, not as a formal lab-grade score.",
                "ITU P.835-style separate judgments map to Quipsly's clarity, background/bleed, naturalness, fatigue, and final decision prompts.",
            ],
        ),
        method(
            name="Quality defect atlas",
            target="audio-spine-and-final-branches",
            status="implemented" if defect_atlas.get("status") == "ready-for-stage-aware-human-listen" else "recommended-next",
            proves="Every suspected issue is classified by defect family, owner stage, evidence strength, and next reversible action instead of becoming a vague request to rerun the whole audio chain.",
            blind_spot="A defect atlas is only as good as its labels. It should route repair work, not become a bureaucracy or a fake confidence score.",
            current_evidence=[
                f"Defect Atlas status: {defect_atlas.get('status', 'not generated')}.",
                f"Defect Atlas items / high severity / missing evidence: {defect_atlas_summary.get('itemCount', 'not generated')} / {defect_atlas_summary.get('highSeverityCount', 'not generated')} / {defect_atlas_summary.get('missingEvidenceCount', 'not generated')}.",
                f"Defect Atlas stage count: {defect_atlas_summary.get('stageCount', 'not generated')}.",
                f"Defect Atlas notes inbox: {defect_atlas_notes.get('status', 'not generated')} with {defect_atlas_notes.get('matchingCandidateCount', 'not generated')} returned note candidates.",
                f"Defect Atlas notes smoke: passed={defect_atlas_smoke.get('passed', 'not generated')}, scenarios={defect_atlas_smoke.get('scenarioCount', 'not generated')}, failures={defect_atlas_smoke.get('failureCount', 'not generated')}.",
            ],
            next_upgrade="Feed returned human notes, blind-listen results, transcript agreement, and future final-branch QA into the atlas so v007 repairs and episode/short renders inherit the same defect language.",
            references=[
                "Quipsly product rule: transparency before judgment. Defects should expose evidence and reversible action.",
                "A shared atlas lets audio, episode, shorts, and Tower QA talk about the same problem without inventing new labels each time.",
            ],
        ),
    ]

    quality_decision_protocol = [
        decision_protocol_step(
            name="Technical file gate",
            scope="audio-spine",
            machine_can_decide=[
                "File exists, nonzero size, duration matches expectation, codec/sample-rate/channel shape is usable, hashes are recorded.",
                "Integrated loudness and true peak are inside the selected profile's hard delivery limits.",
            ],
            human_must_decide=[
                "Whether the level feels comfortable over real listening devices.",
            ],
            evidence=[
                "Platform loudness audit",
                "Morning publication readiness packet",
                "Editor handoff packet",
            ],
            output="Pass/fail hard technical readiness. Failure blocks human approval until repaired.",
        ),
        decision_protocol_step(
            name="Speaker survival gate",
            scope="audio-spine",
            machine_can_decide=[
                "Charlie and Homer both have measurable contribution in expected windows.",
                "Known overlap/reaction windows are not obviously erased by gating.",
            ],
            human_must_decide=[
                "Whether reactions, laughs, and overlap still feel like people rather than edited artifacts.",
            ],
            evidence=[
                "Source balance triage",
                "Speaker contribution ledger",
                "Speaker preservation proof pack",
                "Speaker cleanup proof pack",
            ],
            output="Machine can route proof windows. Human listen decides if the tradeoff is acceptable.",
        ),
        decision_protocol_step(
            name="Fatigue and translation gate",
            scope="audio-spine",
            machine_can_decide=[
                "Spectral and smoothness warnings cluster around specific time windows.",
                "Device simulation/transcode snippets remain measurable and non-clipping.",
            ],
            human_must_decide=[
                "Whether the voice gets tiring, thin, boomy, harsh, robotic, or unnatural after several minutes.",
            ],
            evidence=[
                "Spectral fatigue audit",
                "Master smoothness audit",
                "Translation survival audit",
                "Final listen fast pass",
            ],
            output="Machine ranks risk. Human listens to representative segments before approval.",
        ),
        decision_protocol_step(
            name="Semantic preservation gate",
            scope="audio-spine-and-final-episode",
            machine_can_decide=[
                "Transcript mismatch spikes, long untranscribed regions, missing phrases, and speaker-label flips should become review items.",
            ],
            human_must_decide=[
                "Whether the meaning, humor, emotional emphasis, and conversation cadence survive.",
            ],
            evidence=[
                "Future source/master ASR comparison",
                "Future transcript continuity board",
            ],
            output="Recommended next implementation. Do not block v006 solely on absent transcript agreement yet.",
        ),
        decision_protocol_step(
            name="Final branch gate",
            scope="episode-and-shorts",
            machine_can_decide=[
                "Approved spine is inherited, branch files render, platform packets are complete, crop/caption/audio checks pass, receipts remain separate.",
            ],
            human_must_decide=[
                "Whether the episode/short is worth publishing and whether it represents the show well.",
            ],
            evidence=[
                "Post-listen outcome router",
                "Branch inheritance gate",
                "Branch render preflight",
                "Future final episode and shorts QA boards",
            ],
            output="Locked until the audio spine receives guarded human-listen approval.",
        ),
    ]

    report = {
        "schema": "quipsly.audio-workbench.quality-methods-matrix.v1",
        "generatedAt": generated_at,
        "baselineId": manifest.get("baselineId"),
        "status": "quality-methods-matrix-ready",
        "currentQuestion": "high-quality-audio-spine-first",
        "qualityTargetInThisGoal": "Episode 4 mastered audio spine",
        "notYetTheSameAs": "final YouTube/podcast episode or social short quality",
        "currentGateAnswer": "We are judging the high-quality mastered audio spine now. Final episodes, podcast delivery copies, and shorts are downstream branches that remain locked until the spine receives guarded human-listen approval.",
        "episode4FirstRule": "Do not scale final renders until Episode 4's audio spine survives machine checks and human listen proof.",
        "hardStopCount": hard_stops,
        "reviewRiskCount": review_risks,
        "methodCount": len(methods),
        "implementedMethodCount": sum(1 for item in methods if item["status"] == "implemented"),
        "recommendedNextMethodCount": sum(1 for item in methods if item["status"] == "recommended-next"),
        "qualityLayerCount": len(quality_layers),
        "qualityLayers": quality_layers,
        "qualityDecisionProtocolStepCount": len(quality_decision_protocol),
        "qualityDecisionProtocol": quality_decision_protocol,
        "researchReferenceCount": len(research_references),
        "researchReferences": research_references,
        "methods": methods,
        "nextSafeAction": "Use the morning packet for Charlie's listen. If it passes, approve through the guarded front door and then render Episode 4 branches. If it fails, return exact notes and create scoped v007 proof/repair candidates.",
        "safety": {
            "approvalStateChanged": False,
            "branchStateChanged": False,
            "renderAttempted": False,
            "uploadAttempted": False,
            "publicationAttempted": False,
            "originalMediaMutated": False,
        },
    }
    return report


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        f"# Audio quality methods matrix: {report['baselineId']}",
        "",
        f"- Status: `{report['status']}`",
        f"- Current question: `{report['currentQuestion']}`",
        f"- Goal target: `{report['qualityTargetInThisGoal']}`",
        f"- Not the same as: `{report['notYetTheSameAs']}`",
        f"- Current gate answer: {report['currentGateAnswer']}",
        f"- Hard stops: `{report['hardStopCount']}`",
        f"- Review risks: `{report['reviewRiskCount']}`",
        f"- Quality layers: `{report['qualityLayerCount']}`",
        f"- Research references: `{report['researchReferenceCount']}`",
        "",
        "## Rule",
        "",
        report["episode4FirstRule"],
        "",
        "## Quality ladder",
        "",
    ]
    for layer in report["qualityLayers"]:
        lines.extend(
            [
                f"### {layer['name']}",
                "",
                f"- Target: `{layer['target']}`",
                f"- Release decision: {layer['releaseDecision']}",
                f"- Current gate: {layer['currentGate']}",
                "- Must prove:",
            ]
        )
        lines.extend(f"  - {item}" for item in layer["mustProve"])
        lines.append("- Not allowed to claim:")
        lines.extend(f"  - {item}" for item in layer["notAllowedToClaim"])
        lines.append("")
    lines.extend(
        [
            "## Research references",
            "",
        ]
    )
    for ref in report["researchReferences"]:
        lines.extend(
            [
                f"### {ref['label']}",
                "",
                f"- URL: {ref['url']}",
                f"- Applied as: {ref['appliedAs']}",
                f"- Caveat: {ref['caveat']}",
                "",
            ]
        )
    lines.extend(["## Quality decision protocol", ""])
    for step in report["qualityDecisionProtocol"]:
        lines.extend(
            [
                f"### {step['name']}",
                "",
                f"- Scope: `{step['scope']}`",
                "- Machine can decide:",
            ]
        )
        lines.extend(f"  - {item}" for item in step["machineCanDecide"])
        lines.append("- Human must decide:")
        lines.extend(f"  - {item}" for item in step["humanMustDecide"])
        lines.append("- Evidence:")
        lines.extend(f"  - {item}" for item in step["evidence"])
        lines.extend(["- Output:", f"  - {step['output']}", ""])
    lines.extend(
        [
        "## Methods",
        "",
        ]
    )
    for item in report["methods"]:
        lines.extend(
            [
                f"### {item['name']}",
                "",
                f"- Target: `{item['target']}`",
                f"- Status: `{item['status']}`",
                f"- Proves: {item['proves']}",
                f"- Blind spot: {item['blindSpot']}",
                "- Current evidence:",
            ]
        )
        lines.extend(f"  - {evidence}" for evidence in item["currentEvidence"])
        lines.extend(["- Next upgrade:", f"  - {item['nextUpgrade']}", "- References:"])
        lines.extend(f"  - {reference}" for reference in item["references"])
        lines.append("")
    lines.extend(["## Next safe action", "", report["nextSafeAction"], ""])
    return "\n".join(lines)


def render_html(report: dict[str, Any]) -> str:
    layers = []
    for layer in report["qualityLayers"]:
        must = "".join(f"<li>{escape(item)}</li>" for item in layer["mustProve"])
        claims = "".join(f"<li>{escape(item)}</li>" for item in layer["notAllowedToClaim"])
        layers.append(
            f"""
            <section class=\"card layer\">
              <h2>{escape(layer['name'])}</h2>
              <p><b>Target:</b> <code>{escape(layer['target'])}</code></p>
              <p><b>Release decision:</b> {escape(layer['releaseDecision'])}</p>
              <p><b>Current gate:</b> {escape(layer['currentGate'])}</p>
              <h3>Must prove</h3><ul>{must}</ul>
              <h3>Not allowed to claim</h3><ul>{claims}</ul>
            </section>
            """
        )
    refs = []
    for ref in report["researchReferences"]:
        refs.append(
            f"""
            <section class=\"reference\">
              <h3>{escape(ref['label'])}</h3>
              <p><a href=\"{escape(ref['url'])}\">{escape(ref['url'])}</a></p>
              <p><b>Applied as:</b> {escape(ref['appliedAs'])}</p>
              <p><b>Caveat:</b> {escape(ref['caveat'])}</p>
            </section>
            """
        )
    protocol_cards = []
    for step in report["qualityDecisionProtocol"]:
        machine = "".join(f"<li>{escape(item)}</li>" for item in step["machineCanDecide"])
        human = "".join(f"<li>{escape(item)}</li>" for item in step["humanMustDecide"])
        evidence = "".join(f"<li>{escape(item)}</li>" for item in step["evidence"])
        protocol_cards.append(
            f"""
            <section class=\"card protocol\">
              <h2>{escape(step['name'])}</h2>
              <p><b>Scope:</b> <code>{escape(step['scope'])}</code></p>
              <h3>Machine can decide</h3><ul>{machine}</ul>
              <h3>Human must decide</h3><ul>{human}</ul>
              <h3>Evidence</h3><ul>{evidence}</ul>
              <p><b>Output:</b> {escape(step['output'])}</p>
            </section>
            """
        )
    cards = []
    for item in report["methods"]:
        evidence = "".join(f"<li>{escape(e)}</li>" for e in item["currentEvidence"])
        refs = "".join(f"<li>{escape(r)}</li>" for r in item["references"])
        cards.append(
            f"""
            <section class=\"card\">
              <h2>{escape(item['name'])}</h2>
              <p><b>Target:</b> <code>{escape(item['target'])}</code> <b>Status:</b> <code>{escape(item['status'])}</code></p>
              <p><b>Proves:</b> {escape(item['proves'])}</p>
              <p><b>Blind spot:</b> {escape(item['blindSpot'])}</p>
              <h3>Current evidence</h3>
              <ul>{evidence}</ul>
              <h3>Next upgrade</h3>
              <p>{escape(item['nextUpgrade'])}</p>
              <h3>References</h3>
              <ul>{refs}</ul>
            </section>
            """
        )
    return f"""<!doctype html>
<html lang=\"en\">
<head>
  <meta charset=\"utf-8\">
  <title>Audio quality methods matrix</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 32px; background: #f8f3e7; color: #2f281f; }}
    .hero, .card {{ background: #fffaf0; border: 1px solid #dfd0ae; border-radius: 18px; padding: 20px; margin-bottom: 18px; box-shadow: 0 8px 24px rgba(47,40,31,.08); }}
    .layer {{ border-left: 6px solid #5a7b53; }}
    .protocol {{ border-left: 6px solid #c78b2c; }}
    .reference {{ background: #fffdf7; border: 1px solid #eadcc0; border-radius: 14px; padding: 14px; margin: 12px 0; }}
    a {{ color: #2c6859; font-weight: 700; }}
    code {{ background: #efe4c7; padding: 2px 6px; border-radius: 6px; }}
    .pill {{ display: inline-block; margin-right: 10px; background: #28463a; color: white; padding: 8px 12px; border-radius: 999px; }}
  </style>
</head>
<body>
  <section class=\"hero\">
    <p class=\"pill\">{escape(report['status'])}</p>
    <p class=\"pill\">hard stops {report['hardStopCount']}</p>
    <p class=\"pill\">review risks {report['reviewRiskCount']}</p>
    <h1>Audio quality methods matrix</h1>
    <p><b>Current question:</b> {escape(report['currentQuestion'])}</p>
    <p><b>Goal target:</b> {escape(report['qualityTargetInThisGoal'])}</p>
    <p><b>Not the same as:</b> {escape(report['notYetTheSameAs'])}</p>
    <p><b>Current gate answer:</b> {escape(report['currentGateAnswer'])}</p>
    <p>{escape(report['episode4FirstRule'])}</p>
  </section>
  <h1>Quality ladder</h1>
  {''.join(layers)}
  <h1>Research references</h1>
  {''.join(refs)}
  <h1>Quality decision protocol</h1>
  {''.join(protocol_cards)}
  <h1>Methods</h1>
  {''.join(cards)}
  <section class=\"hero\"><h2>Next safe action</h2><p>{escape(report['nextSafeAction'])}</p></section>
</body>
</html>
"""


def update_manifest(baseline_dir: Path, report: dict[str, Any], json_path: Path, md_path: Path, html_path: Path, open_path: Path) -> None:
    manifest_path = baseline_dir / "manifest.json"
    manifest = load_json(manifest_path)
    outputs = manifest.setdefault("outputs", {})
    outputs["latestAudioQualityMethodsMatrix"] = str(json_path)
    outputs["latestAudioQualityMethodsMatrixMarkdown"] = str(md_path)
    outputs["latestAudioQualityMethodsMatrixHtml"] = str(html_path)
    outputs["latestAudioQualityMethodsMatrixOpenCommand"] = str(open_path)
    history = outputs.setdefault("audioQualityMethodsMatrixHistory", [])
    history.append(str(json_path))
    history[:] = history[-20:]
    manifest["audioQualityMethodsMatrixLatestStatus"] = report["status"]
    manifest["audioQualityMethodsMatrixHardStopCount"] = report["hardStopCount"]
    manifest["audioQualityMethodsMatrixReviewRiskCount"] = report["reviewRiskCount"]
    manifest["audioQualityMethodsMatrixMethodCount"] = report["methodCount"]
    manifest["audioQualityMethodsMatrixImplementedMethodCount"] = report["implementedMethodCount"]
    manifest["audioQualityMethodsMatrixRecommendedNextMethodCount"] = report["recommendedNextMethodCount"]
    manifest["audioQualityMethodsMatrixQualityLayerCount"] = report["qualityLayerCount"]
    manifest["audioQualityMethodsMatrixQualityDecisionProtocolStepCount"] = report["qualityDecisionProtocolStepCount"]
    manifest["audioQualityMethodsMatrixResearchReferenceCount"] = report["researchReferenceCount"]
    manifest["audioQualityMethodsMatrixQualityTargetInThisGoal"] = report["qualityTargetInThisGoal"]
    manifest["audioQualityMethodsMatrixNotYetTheSameAs"] = report["notYetTheSameAs"]
    manifest["audioQualityMethodsMatrixCurrentGateAnswer"] = report["currentGateAnswer"]
    manifest["audioQualityMethodsMatrixApprovalStateChanged"] = False
    manifest["audioQualityMethodsMatrixBranchStateChanged"] = False
    manifest["audioQualityMethodsMatrixRenderAttempted"] = False
    manifest["audioQualityMethodsMatrixUploadAttempted"] = False
    manifest["audioQualityMethodsMatrixPublicationAttempted"] = False
    manifest["audioQualityMethodsMatrixOriginalMediaMutated"] = False
    write_json(manifest_path, manifest)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline-dir", required=True)
    args = parser.parse_args()
    baseline_dir = Path(args.baseline_dir).expanduser().resolve()
    report = build_report(baseline_dir)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = str(report.get("baselineId") or "audio-baseline").replace("/", "-")
    versioned_dir = baseline_dir / f"audio-quality-methods-matrix-{slug}-{stamp}"
    versioned_dir.mkdir(parents=True, exist_ok=True)
    json_path = versioned_dir / "quality-methods-matrix.json"
    md_path = versioned_dir / "quality-methods-matrix.md"
    html_path = versioned_dir / "quality-methods-matrix.html"
    open_path = versioned_dir / "open-quality-methods-matrix.command"
    stable_json = baseline_dir / "AUDIO_QUALITY_METHODS_MATRIX.json"
    stable_md = baseline_dir / "AUDIO_QUALITY_METHODS_MATRIX.md"
    stable_html = baseline_dir / "AUDIO_QUALITY_METHODS_MATRIX.html"
    stable_open = baseline_dir / "OPEN_AUDIO_QUALITY_METHODS_MATRIX.command"
    for path in (json_path, stable_json):
        write_json(path, report)
    markdown = render_markdown(report)
    for path in (md_path, stable_md):
        write_text(path, markdown)
    html = render_html(report)
    for path in (html_path, stable_html):
        write_text(path, html)
    for path, target in ((open_path, html_path), (stable_open, stable_html)):
        write_text(path, f"#!/bin/zsh\nset -e\nopen {shell_quote(str(target))}\n")
        os.chmod(path, 0o755)
    update_manifest(baseline_dir, report, stable_json, stable_md, stable_html, stable_open)
    print(f"Wrote {stable_html}")


if __name__ == "__main__":
    main()
