# Active Goal: Quipsly shorts-first production loop

## Goal text to paste into Codex

Build Quipsly Studio into a shorts-first production system that can create genuinely strong short-form content from long-form source material, starting with High Ground Odyssey Episode 1 as the proof lane.

The priority is not simply exporting clips. The priority is making shorts that have a real chance of earning attention on YouTube Shorts, Instagram Reels, Facebook Reels, TikTok-style vertical feeds, LinkedIn, Patreon teasers, and HighGroundOdyssey.com embeds.

Work in tight research-build-dogfood loops:

1. Research what the best current tools do well, especially Riverside.fm, Descript, OpusClip, Captions, CapCut, YouTube Create/Studio, Instagram/Meta tools, Canva, Adobe Express, Premiere, Final Cut, and other relevant short-form editors.
2. Convert that research into Quipsly-specific features that match our architecture: metadata-first, proxy-first, whole synced source lanes, non-destructive edit decisions, agent-accessible controls, and low-anxiety human refinement.
3. Use Episode 1 shorts as the live proving ground. Create, score, refine, export, inspect, listen to, and package actual 9:16 shorts.
4. Improve the software whenever the real editing/export loop exposes friction, weak UX, weak automation, missing state, poor crop tools, caption risk, bad pacing visibility, or fragile agent control.
5. Keep output quality above process. Avoid approval theater, fake done states, and bureaucracy. A short is not useful until it is exported locally, watchable, listenable, visually safe, clearly packaged, and ready for a platform-specific publishing path.

Near-term product priorities:

1. Candidate discovery and scoring.
   - Score shorts by hook strength, standalone clarity, emotional or teaching value, pacing, duration, vertical readiness, audio confidence, and platform fit.

2. Local export quality loop.
   - Export real local 9:16 files.
   - Generate contact sheets.
   - Run audio sanity checks.
   - Make keep/refine/reject decisions from actual files, not queue labels.

3. Vertical presentation quality.
   - Face-safe crop.
   - Speaker-aware framing.
   - Side-by-side and stacked layouts.
   - Caption-safe zones.
   - Easy baseline and keyframe crop adjustments.

4. Caption and transcript assist.
   - Word-aware transcript/caption previews.
   - Readable text placement.
   - Caption styling that feels native to social platforms without covering faces.

5. Platform packaging.
   - Generate and refine hooks, titles, descriptions, hashtags, CTAs, destination notes, and reuse plans for YouTube Shorts, Instagram, Facebook, TikTok-style feeds, LinkedIn, Patreon, and site embeds.

6. Agent and human workflow.
   - Give Codex practical controls to find, score, edit, export, inspect, and package shorts directly.
   - Give humans an intuitive refinement loop that feels like editing, not operating a compliance machine.

Success looks like this:

Codex and a human can use Quipsly Studio to pull multiple strong shorts out of Episode 1, improve them, export them locally, inspect and listen to them, prepare platform-specific copy, and know exactly what is ready to publish next.

Do not broaden into disconnected product work until this loop is honest. Keep Nest and Tower connected where they directly support the shorts loop, but Studio shorts quality is the center of gravity for this goal.

## Current commands

```bash
script/shortsctl.sh growth-quality-board --html
script/shortsctl.sh local-export-board --html
script/shortsctl.sh platform-package-board --html
script/shortsctl.sh improvement-plan --html
```

## Recall note

When Charlie asks for "the current shorts goal," "the replacement goal," or "the active goal," recall this document first.
