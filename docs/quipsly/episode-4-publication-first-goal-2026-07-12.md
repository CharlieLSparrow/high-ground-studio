# Episode 4 publication-first goal

Date: 2026-07-12

## Goal text

Make Episode 4 the proof that Quipsly can create a publishable podcast episode from messy multi-source media, with the highest-quality audio spine as the first gate and final episode/short outputs inheriting from that spine only after proof.

Primary rule: get the best Episode 4 possible before expanding attention. Episode 4 quality outranks cross-episode throughput until it has a human-listened audio spine, usable long-form episode branch, and practical publication packet for YouTube, Spotify, Apple Podcasts, and HighGroundOdyssey.

Current distinction:
- High-quality audio spine is the active gate now.
- Final long-form episodes and shorts come after the spine passes machine checks plus Charlie's human listen.
- Existing v006 machine state is candidate-ready, not approved.

Quality methods to keep strengthening:
1. Platform delivery checks: file exists, duration, codec, channels, loudness, true peak, silence, clipping, RSS/platform compatibility.
2. Speaker survival checks: Charlie and Homer both remain audible, natural, and not over-gated.
3. Speech intelligibility checks: transcript/source agreement and spot checks around known risk moments.
4. Device translation checks: derived snippets auditioned as full-range, narrow/phone-like, and small-speaker style playback.
5. Source leakage checks: echo, bleed, park noise, phone/call leakage, abrupt floor shifts, or missing laughter/reactions.
6. Cadence/edit-flow checks: natural conversation rhythm, not too clean, no artificial chopped feeling.
7. Final episode checks: inherited audio spine, playable video, correct aspect, sync, safe cuts, intelligible voices, valid export package.
8. Shorts checks: hook strength, readable framing, captions/text safety, platform duration/aspect, clear source episode mapping.

Execution:
- Keep originals untouched.
- Use sidecars, manifests, ledgers, derived review clips, and versioned outputs.
- Do not publish, upload, schedule, or claim publication without explicit approval.
- If v006 audio passes Charlie's morning listen, unlock guarded branch rendering and create the best Episode 4 long-form publish candidate first.
- If v006 fails, create a scoped v007 repair only for the failed section/stage, prove it with targeted clips, then rerun the gates.
- After Episode 4 has a publishable candidate, apply the improved audio/episode/shorts tools to Episodes 1-6, prioritizing reversible proof packages and avoiding stale sync baselines.

Acceptance:
- Episode 4 has a current-best mastered audio spine with machine checks passing and Charlie listen decision recorded.
- Episode 4 has at least one current-best long-form publish candidate with metadata packet and clear platform readiness status.
- Episode 4 has a useful shorts candidate set, or a clear blocker explaining why shorts are waiting.
- Quality reports distinguish audio spine readiness from final episode readiness and shorts readiness.
- All outputs are versioned and no original media is mutated.
- Review surfaces tell Charlie exactly what to listen/watch, what is safe to post, and what still needs repair.

## Current checkpoint

As of this checkpoint, the Episode 4 v006 control plane was refreshed after strengthening technical-audition readback.

- Sequential refresh: passed.
- Sequential refresh steps: 47.
- Step failures: 0.
- Post-check failures: 0.
- Manifest readback smoke: passed.
- Manifest readback checks: 751.
- Manifest readback failures: 0.
- Quality methods matrix: ready.
- Quality layers tracked: 3: audio spine, final episode, shorts/social clips.
- Research references tracked: 6.
- Technical audition snippet pack: ready for human technical audition snippets.
- Technical audition snippets: 12.
- Technical audition rendered items: 12.
- Technical audition missing snippets: 0.
- Branch inheritance: locked until human listen.
- Branch render: locked until human listen.
- Publication/upload: not attempted.
- Original media mutation: false.

## Research anchors

- ITU-R BS.1770 defines loudness and true-peak measurement.
- Apple Podcasts requires valid podcast audio delivery and uses playback loudness handling such as Sound Check metadata.
- Spotify documents preferred high-quality delivery formats and loudness normalization behavior.
- DNSMOS/P.835-style checks are useful as perceptual speech-quality proxies, but human listening remains the gold standard for final approval.


## 2026-07-12 checkpoint: morning decision contract hardened

The morning review launcher now states the exact review target and decision contract:

- Review target: `episode-4-v006-high-quality-audio-spine`
- Decision rules: `4`
- Technical audition snippets ready: `true`
- Hard stops: `0`
- Critical fast checks: `4`

This prevents a pass on the audio spine from being confused with final YouTube/Spotify/Apple/shorts readiness. A pass means the audio spine may inherit into final episode and shorts branches. It does not mean final media is published or ready without branch render/package checks.

Validation:

- Sequential refresh: `passed`
- Steps: `47`
- Step failures: `0`
- Post-check failures: `0`
- Manifest readback smoke: `754` checks, `0` failures
- Branch inheritance: `false`
- Branch render: `false`
- Approved branch executor: `blocked-waiting-for-human-listen`

Next action remains Charlie's morning listen of the v006 spine. If it passes, record guarded approval and refresh branch gates. If it fails, keep v006 locked and route exact timestamps into scoped v007 repair/proof work.
