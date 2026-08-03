# Transcript evaluation v2 checkpoint

Date: 2026-08-02

Scope: private-corpus evidence contract and operator review

External mutation: none

## Outcome

Quipsly can no longer make a podcast or coaching transcription candidate look
release-ready through one blended aggregate. Corpus v2 requires explicit
workload, controlled recording condition, speaker-attribution capability, and
timing granularity. Its report separates podcast from coaching, clean from
difficult audio, and measured failures from missing evidence.

The evaluator remains downstream of immutable capture. It does not upload
media, invoke a transcription provider, approve a transcript, create notes or
work, or change any production default.

## Production defect closed

Corpus v1 described a 12-window acceptance matrix in prose but did not encode
the workload or condition on each window. The report grouped candidates only by
provider identity across the entire corpus. That allowed all of these unsafe
interpretations:

- strong podcast audio hiding weak coaching audio;
- clean speech hiding watched-clip bleed, overlap, or degraded remote audio;
- a provider appearing complete even when it was absent from some windows;
- a provider without diarization being scored as if it attempted diarization;
- segment timing being treated like word timing;
- a good average being mistaken for a release decision.

## Contract

The current kinds are:

- `quipsly-private-transcript-evaluation-corpus-v2`;
- `quipsly-private-transcript-evaluation-report-v2`.

Podcast requires six conditions: clean Charlie, clean Homer, normal exchange,
overlap/interruption, watched-clip bleed, and degraded remote audio. Coaching
requires coach/client turn-taking, names/domain terms, commitments/dates,
interruption/emotional speech, quiet/distant voice, and noisy/recovery-prone
capture.

Each candidate declares:

- speaker attribution: word, segment, or unavailable;
- timing granularity: word, segment, or unavailable;
- the existing provider/model/adapter/config identity and policy receipt.

A workload threshold assessment is `pass` only when:

1. all six required conditions exist across at least six windows;
2. the provider candidate succeeds on every workload window;
3. clean WER is at most 5%;
4. difficult WER is at most 10%; and
5. measured speaker error is at most 3%.

Missing corpus conditions, missing provider candidates, failed windows, and
unsupported capability evidence produce `insufficient-evidence`. Complete
evidence outside a numeric bar produces `fail`. No status chooses a universal
provider or bypasses policy, correction-effort, recovery, or real-session
review.

## Compatibility and privacy

The parser reads v1 corpora and normalizes them without rewriting the input. A
legacy single-purpose corpus retains its workload but has no condition proof. A
legacy mixed corpus remains explicitly unclassified. IDs, speaker names, or
transcript text are never used to guess classification.

The aggregate JSON and standalone HTML review omit transcript text, speaker and
reviewer identities, provider policy URLs, and source paths. The HTML is
generated only from the aggregate report. Window source/reference hashes and
classification remain visible as audit receipts.

## Operated evidence

- media-processing TypeScript passes with pinned TypeScript 7.0.2;
- focused evaluator suite passes 10/10;
- a complete synthetic 12-condition corpus passes both workload bars;
- a difficult-audio WER regression fails the difficult threshold;
- a provider missing one required window stays insufficient;
- Apple-style unavailable speaker evidence and segment timing remain null and
  insufficient rather than becoming fabricated word metrics;
- a v1 mixed corpus reads with two unclassified windows and incomplete
  coverage;
- report and HTML serialization contain none of the synthetic private phrases,
  speaker/reviewer identities, or policy URL;
- the actual CLI produced create-once JSON and HTML artifacts;
- the HTML board was rendered and inspected at 1280 px and 390 px. At 390 px,
  the page has no horizontal overflow, the content stacks to one column, and
  wide provider tables scroll inside their bounded containers.

Wider workspace verification then exposed a stale coaching boundary in the
legacy web surface: it still called the shared action-candidate constructor
without the current source span fields. The builder now fingerprints the exact
normalized provider text, preserves the ordered segment IDs in both candidates
and packet briefs, declares `sourceSpan: null` when it has no word-level proof,
and keeps `transcriptReviewStatus: provider`. It therefore compiles without
pretending that provider output was human-reviewed or materializable work. The
web boundary suite passes 5/5 and all 26 workspace projects with typecheck
scripts pass.

The public example is deliberately incomplete, so its rendered status is
`insufficient-evidence`. That proves the fail-closed path; it is not a provider
benchmark.

## Operator command

```bash
cd /Users/wall-e/Dev/high-ground-studio-product
pnpm quipsly:transcript:evaluate -- \
  --input /private/path/corpus-v2.json \
  --output /private/path/report-v2.json \
  --html-output /private/path/review-v2.html
```

Both outputs are create-only. Keep the corpus and raw provider receipts in the
private evaluation store; distribute the aggregate review only through an
authorized Quipsly surface.

## Remaining gate

No private High Ground corpus or provider was operated in this checkpoint.
Next, a human must select and approve the 12 source-linked windows under current
all-party consent, then run pinned Deepgram, OpenAI diarized, and physical-device
Apple candidates (or record a dated exclusion decision). At least one measured
correction pass per provider and workload, failure/retry exercise, full HGO and
coaching sessions, and separate-account authorization proof remain required
before a production default changes.
