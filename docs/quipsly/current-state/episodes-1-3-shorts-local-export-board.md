# Quipsly shorts local export board

Output first: export usable local files, watch them, listen to them, improve the edit, then hand off to publishing.

- Generated: `2026-06-23T08:15:44-06:00`
- Shorts: `13`
- Local exported files found: `12`
- Missing exports: `1`
- Quality review candidates: `12`

## Stage counts

- `missing-export`: `1`
- `exported-needs-listen-through`: `12`

## Episode coverage

- `episode-1`: `13` shorts, `12` exported files, `12` reviewable

## Next practical move

- Short: `Episode 1 Word-Timed Proof Short`
- Stage: `missing-export`
- Why: Export this short locally so we have an actual file to watch and hear.

```bash
script/agentctl.sh shorts-select id '8F4A6296-A542-49B5-A6AC-7D6A712474AA' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'episode-1-word-timed-proof-short'
```

## Shorts

### Episode 1 Word-Timed Proof Short

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `missing-export`
- Duration: `4.19s`
- Segments: `1`
- Local export: `none yet`
- Export file present: `False`
- Next: Export this short locally so we have an actual file to watch and hear.

```bash
script/agentctl.sh shorts-select id '8F4A6296-A542-49B5-A6AC-7D6A712474AA' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'episode-1-word-timed-proof-short'


script/agentctl.sh shorts-review '8F4A6296-A542-49B5-A6AC-7D6A712474AA' keep 'Kept after local export review.'
```

### Test Short - Wednesday Rule moment

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `8.133s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-publication-pass/episode1-social-candidates-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id 'FC28A75E-451B-4D74-9636-2E842805F106' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'test-short-wednesday-rule-moment'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-publication-pass/episode1-social-candidates-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-publication-pass/episode1-social-candidates-01-Test-Short-Wednesday-Rule-moment-9x16-short.mp4' 8.13
script/agentctl.sh shorts-review 'FC28A75E-451B-4D74-9636-2E842805F106' keep 'Kept after local export review.'
```

### Farm Work Teaches Stewardship

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `22.645s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-farm-work-teaches-stewardship-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '18BC489A-7439-4DA5-B967-9726443A008D' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'farm-work-teaches-stewardship'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-farm-work-teaches-stewardship-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-farm-work-teaches-stewardship-9x16-short.mp4' 22.64
script/agentctl.sh shorts-review '18BC489A-7439-4DA5-B967-9726443A008D' keep 'Kept after local export review.'
```

### Learning Why, Not Just What

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `40.833s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-learning-why-not-just-what-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '701461B7-CB8F-4732-8F4F-D54698C77F23' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'learning-why-not-just-what'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-learning-why-not-just-what-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-learning-why-not-just-what-9x16-short.mp4' 40.83
script/agentctl.sh shorts-review '701461B7-CB8F-4732-8F4F-D54698C77F23' keep 'Kept after local export review.'
```

### Mutual Mentorship

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `39.998s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-mutual-mentorship-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id 'B5387438-09BF-41BD-9BDA-4765C75C36E2' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'mutual-mentorship'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-mutual-mentorship-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-mutual-mentorship-9x16-short.mp4' 40.00
script/agentctl.sh shorts-review 'B5387438-09BF-41BD-9BDA-4765C75C36E2' keep 'Kept after local export review.'
```

### Record From Anywhere

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `45.0s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-record-from-anywhere-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '0D14A2CD-259E-4DCB-8EE3-62B7A9147FF4' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'record-from-anywhere'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-record-from-anywhere-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-record-from-anywhere-9x16-short.mp4' 45.00
script/agentctl.sh shorts-review '0D14A2CD-259E-4DCB-8EE3-62B7A9147FF4' keep 'Kept after local export review.'
```

### Parkinson's Awareness Goal

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `45.0s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-parkinsons-awareness-goal-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '7EA786A2-FA74-4D73-AE55-8A23D03AA3FC' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'parkinson-s-awareness-goal'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-parkinsons-awareness-goal-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-parkinsons-awareness-goal-9x16-short.mp4' 45.00
script/agentctl.sh shorts-review '7EA786A2-FA74-4D73-AE55-8A23D03AA3FC' keep 'Kept after local export review.'
```

### Don't Downplay Yourself

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `45.0s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-dont-downplay-yourself-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '50F4E987-F34E-4DBA-976A-42C80055DFB9' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'don-t-downplay-yourself'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-dont-downplay-yourself-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-dont-downplay-yourself-9x16-short.mp4' 45.00
script/agentctl.sh shorts-review '50F4E987-F34E-4DBA-976A-42C80055DFB9' keep 'Kept after local export review.'
```

### Identity Changes Behavior

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `45.0s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-identity-changes-behavior-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id 'C4C017E7-C630-4C0D-9AF6-95496916ED8C' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'identity-changes-behavior'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-identity-changes-behavior-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-identity-changes-behavior-9x16-short.mp4' 45.00
script/agentctl.sh shorts-review 'C4C017E7-C630-4C0D-9AF6-95496916ED8C' keep 'Kept after local export review.'
```

### Write Things Worth Reading

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `45.0s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-write-things-worth-reading-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '975A2C70-695D-4D9E-BAAE-A47BA3277590' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'write-things-worth-reading'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-write-things-worth-reading-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/Episode1Shorts/2026-06-17-codex-pass/episode1-write-things-worth-reading-9x16-short.mp4' 45.00
script/agentctl.sh shorts-review '975A2C70-695D-4D9E-BAAE-A47BA3277590' keep 'Kept after local export review.'
```

### Episode 1 Review Candidate 01 - 04:27

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `40.833s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '0F028DF4-76EF-4245-9349-1EE266C1AAEB' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'episode-1-review-candidate-01-04-27'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-01-9x16-short.mp4' 40.83
script/agentctl.sh shorts-review '0F028DF4-76EF-4245-9349-1EE266C1AAEB' keep 'Kept after local export review.'
```

### Episode 1 Review Candidate 02 - 08:19

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `19.93s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-02-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id '33FDE8CC-9080-4EC1-9294-1F03D0EEF61F' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'episode-1-review-candidate-02-08-19'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-02-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-02-9x16-short.mp4' 19.93
script/agentctl.sh shorts-review '33FDE8CC-9080-4EC1-9294-1F03D0EEF61F' keep 'Kept after local export review.'
```

### Episode 1 Review Candidate 03 - 26:13

- Episode: `episode-1` (`inferred-from-text`)
- Stage: `exported-needs-listen-through`
- Duration: `41.499s`
- Segments: `1`
- Local export: `/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-03-9x16-short.mp4`
- Export file present: `True`
- Next: Listen through the exported file and sanity-check audio.

```bash
script/agentctl.sh shorts-select id 'D9526D0B-311E-46D4-B127-824D713EA2F2' && script/agentctl.sh shorts-export-selected '/Users/wall-e/Dev/high-ground-studio/docs/quipsly/current-state' 'episode-1-review-candidate-03-26-13'
script/agentctl.sh shorts-contact-sheet '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-03-9x16-short.mp4'
script/agentctl.sh shorts-audio-sanity '/Users/wall-e/Movies/QuipslyExports/ReviewShorts/episodes-1-3-first-pass-20260618/episode-1-premiere-rescue/episode-1-premiere-rescue-review-short-03-9x16-short.mp4' 41.50
script/agentctl.sh shorts-review 'D9526D0B-311E-46D4-B127-824D713EA2F2' keep 'Kept after local export review.'
```
