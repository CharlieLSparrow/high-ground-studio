# Shorts growth research and feature list

This is the practical product read from current short-form tools. The target is not to clone any one editor; it is to give Quipsly Studio the capabilities needed to produce better shorts from long-form creative work.

## Research takeaways

Riverside Magic Clips emphasizes fast highlight generation from recorded or uploaded video, with social-ready clips, aspect-ratio presets, captions, branding, and customization after generation.

Descript emphasizes turning long-form work into social clips, then improving them with templates, captions, text, transitions, stock/GIF/sound effects, brand styling, B-roll, and AI-assisted layout/design.

OpusClip emphasizes AI curation, virality scoring, auto reframe, animated captions, custom templates, social scheduling, and improvement suggestions. Its scoring language is especially useful because it breaks potential into dimensions like hook, flow, engagement, and trend.

CapCut emphasizes frictionless auto captions, subtitle editing, timing adjustments, text splitting, translation/multilingual workflows, and quick social-ready editing.

## Quipsly's angle

Quipsly should combine the best parts without losing our identity:

- Metadata-first editing: decisions live on top of whole source lanes.
- Proxy-first media: originals stay protected.
- Agent-friendly operation: Codex can create, score, inspect, export, and improve shorts.
- Human-friendly refinement: Mako/Charlie can make taste decisions without running a command-line bureaucracy.
- Learning loop: first-pass AI/agent choices, human corrections, performance analytics, and publication receipts become future training signal.

## MVP features to build now

1. Growth quality board.
   - Rank short candidates by hook, pacing, vertical readiness, audio confidence, platform packaging, and standalone clarity.
   - Make the next practical improvement obvious.

2. Local export loop.
   - Export selected 9:16 shorts.
   - Generate contact sheets.
   - Run audio sanity.
   - Keep/refine/reject after real watch/listen.

3. Hook and caption planning.
   - Show missing hook/caption signals.
   - Let Codex suggest stronger opening hooks.
   - Keep captions away from faces and platform UI danger zones.

4. Vertical crop quality.
   - Face/speaker-safe defaults.
   - Easy baseline crop per lane.
   - Short-specific crop overrides.

5. Platform package draft.
   - Per-platform title, description, hook, hashtags, CTA, and destination notes.
   - Distinguish YouTube Shorts, Instagram Reels, Facebook Reels, LinkedIn, Patreon, and site embed needs.
   - Current command:

```bash
script/shortsctl.sh platform-package-board --html
```

6. Agent test driver hooks.
   - Select candidate.
   - Export.
   - Create visual evidence.
   - Listen/analyze.
   - Adjust range/crop/caption.
   - Write package copy.

7. Improvement plan.
   - Convert score and package signals into a concrete action list.
   - Prioritize blockers first: no export, weak hook, missing crop proof, no listen-through, no caption plan.
   - Current command:

```bash
script/shortsctl.sh improvement-plan --html
```

## Differentiators after MVP

1. Transcript-driven candidate discovery.
   - Score transcript moments for story, teaching value, surprise, contrast, emotional turn, and standalone clarity.

2. AI short critique.
   - Ask the assistant to critique a candidate before export: weak hook, missing context, slow opening, caption risk, crop risk, or unclear payoff.

3. Auto reframing assistant.
   - Speaker-aware crop.
   - Side-by-side and stacked layouts.
   - Movement/keyframe suggestions.

4. Batch variant generation.
   - Same segment with different hooks, captions, or crops.
   - Keep the best based on review and later analytics.

5. Performance feedback loop.
   - Pull platform analytics back into Quipsly.
   - Learn which hooks, lengths, topics, formats, and framings perform for each project.

6. Creator voice/brand profiles.
   - Reusable style rules for captions, titles, visual treatment, pacing, and CTAs.

## Current next command

```bash
script/shortsctl.sh growth-quality-board --html
```

The board is a compass, not a prophecy. Its score is there to help us choose what to improve next, not to pretend we can guarantee views.

## Source links to revisit

- Riverside podcast clips and format guidance: https://riverside.com/blog/podcast-clips
- Riverside Magic Clips launch coverage: https://podnews.net/press-release/riverside-magic-clips
- Descript social clips template: https://www.descript.com/templates/create-clips
- OpusClip Virality Score help: https://help.opus.pro/docs/article/virality-score
- OpusClip 3.0 score dimensions: https://www.opus.pro/blog/opusclip-clip-different
- CapCut auto captions: https://www.capcut.com/tools/auto-caption-generator
- CapCut caption correction help: https://www.capcut.com/help/auto-captions-in-capcut
