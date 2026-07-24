# Quipsly shorts improvement plan

This is an actionable improvement plan. It proposes changes but does not mutate Studio state, publish, schedule, upload, or approve.

## 95.2 - Farm Work Teaches Stewardship

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-farm-work-teaches-stewardship-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-farm-work-teaches-stewardship-9x16-short.mp4' 22.65
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### medium / hook - Test a stronger hook variant

The hook is usable, but another angle may earn more attention.

- Human check: Candidate variant: The farm lesson was not just the chore It was learning why...

```bash
script/agentctl.sh shorts-select id '18BC489A-7439-4DA5-B967-9726443A008D' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 92.0 - Learning Why, Not Just What

- Tier: `strong-post-candidate`
- Stage: `exported-needs-visual-review`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-learning-why-not-just-what-9x16-short.mp4`

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / visual - Generate visual proof and check safe zones

Shorts need face-safe vertical crop and caption-safe text. Do not publish until the exported frame actually looks right.

- Human check: Check headroom, face position, captions/overlays, and platform UI danger zones.

```bash
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-learning-why-not-just-what-9x16-short.mp4'
```

### medium / hook - Test a stronger hook variant

The hook is usable, but another angle may earn more attention.

- Human check: Candidate variant: Good mentor does more than explain the task They make sure you...

```bash
script/agentctl.sh shorts-select id '701461B7-CB8F-4732-8F4F-D54698C77F23' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 89.6 - Test Short - Wednesday Rule moment

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-publication-pass/episode1-social-candidates-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-publication-pass/episode1-social-candidates-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4' 8.13
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### medium / timing - Check standalone context

Very short clips can work, but only if the hook and context are immediately clear.

- Human check: Watch without surrounding context and ask whether the point lands.

```bash
script/agentctl.sh shorts-select id 'FC28A75E-451B-4D74-9636-2E842805F106'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 86.4 - Write Things Worth Reading

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-09-Write-Things-Worth-Reading-cleanframe-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/tmp/quipslystudio-episodes-1-3-review-shorts/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-09-Write-Things-Worth-Reading-cleanframe-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: If you do not want to be forgotten write things worth reading...

```bash
script/agentctl.sh shorts-select id '975A2C70-695D-4D9E-BAAE-A47BA3277590' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 86.2 - Mutual Mentorship

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-mutual-mentorship-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-mutual-mentorship-9x16-short.mp4' 40.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: The best mentoring relationship can work both directions

```bash
script/agentctl.sh shorts-select id 'B5387438-09BF-41BD-9BDA-4765C75C36E2' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 85.6 - Record From Anywhere

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-record-from-anywhere-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-record-from-anywhere-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### medium / hook - Test a stronger hook variant

The hook is usable, but another angle may earn more attention.

- Human check: Candidate variant: The show needs to work even when the hosts are remote traveling...

```bash
script/agentctl.sh shorts-select id '0D14A2CD-259E-4DCB-8EE3-62B7A9147FF4' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 85.6 - Identity Changes Behavior

- Tier: `strong-post-candidate`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-identity-changes-behavior-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-identity-changes-behavior-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### medium / hook - Test a stronger hook variant

The hook is usable, but another angle may earn more attention.

- Human check: Candidate variant: Saying am the kind of person who does this changes the decision...

```bash
script/agentctl.sh shorts-select id 'C4C017E7-C630-4C0D-9AF6-95496916ED8C' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 81.7 - Parkinson's Awareness Goal

- Tier: `promising-needs-polish`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-parkinsons-awareness-goal-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-parkinsons-awareness-goal-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: If our channel can raise awareness for Parkinson's research that is goal...

```bash
script/agentctl.sh shorts-select id '7EA786A2-FA74-4D73-AE55-8A23D03AA3FC' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 81.7 - Don't Downplay Yourself

- Tier: `promising-needs-polish`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-dont-downplay-yourself-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-dont-downplay-yourself-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: Sometimes someone needs to remind you that you were already rock star

```bash
script/agentctl.sh shorts-select id '50F4E987-F34E-4DBA-976A-42C80055DFB9' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 79.6 - Episode 1 Review Candidate 01 - 04:27

- Tier: `promising-needs-polish`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-9x16-short.mp4' 40.83
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: Episode Review Candidate

```bash
script/agentctl.sh shorts-select id '0F028DF4-76EF-4245-9349-1EE266C1AAEB' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 79.6 - Episode 1 Review Candidate 03 - 26:13

- Tier: `promising-needs-polish`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-03-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-03-9x16-short.mp4' 41.50
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: Episode Review Candidate

```bash
script/agentctl.sh shorts-select id 'D9526D0B-311E-46D4-B127-824D713EA2F2' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```

## 74.6 - Episode 1 Review Candidate 02 - 08:19

- Tier: `promising-needs-polish`
- Stage: `exported-needs-listen-through`
- Export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-02-9x16-short.mp4`

### high / audio - Run audio sanity and listen once

A short can survive imperfect visuals faster than harsh or broken audio.

- Human check: Listen for clipping, silence, sudden jumps, distracting cuts, or bad levels.

```bash
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-02-9x16-short.mp4' 45.00
```

### high / caption - Create a caption or overlay plan

Muted autoplay is normal. The clip needs readable text that does not sit on faces.

- Human check: Prefer short text chunks and keep important words out of the lower UI zone.

```bash
script/agentctl.sh shorts-overlay-burn-in request_review 'Check captions/overlay for face safety and readability.'
```

### high / hook - Replace or sharpen the opening hook

The first second matters. A weak hook makes a technically good short disappear in the feed.

- Human check: Try this first: Episode Review Candidate

```bash
script/agentctl.sh shorts-select id '33FDE8CC-9080-4EC1-9294-1F03D0EEF61F' && script/agentctl.sh shorts-update-selected hook 'Replace with a sharper opening hook.'
```

### polish / platform-package - Compare YouTube and Reels copy

YouTube title, Reels caption, and Facebook caption should not all sound like the same pasted label.

- Human check: Keep the promise consistent, but make each platform feel native.

```bash

```
