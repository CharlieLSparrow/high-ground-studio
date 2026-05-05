# Learning to Lead Living Manuscript Audit

Date: 2026-05-05

## Current State Summary

The living manuscript system now has five meaningful layers for `Learning to Lead`:

- preserved source inputs in `apps/web/content/books/learning-to-lead/sources/`
- one seeded living manuscript in `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx`
- starter arrangement maps in `apps/web/content/books/learning-to-lead/arrangements/`
- starter generated-output placeholder docs in `apps/web/content/books/learning-to-lead/generated/`
- starter templates in `apps/web/content/books/learning-to-lead/templates/`

The manuscript was seeded from the root DOCX into:

- `leadership-my-story-24MAR19.baseline.md`
- `leadership-my-story-24MAR19.comments.json`
- `leadership-my-story-24MAR19.outline.md`

The living manuscript currently contains `17` coarse `ManuscriptBlock` entries. They are preservation-first baseline blocks, not polished editorial units.

Important boundaries still hold:

- `apps/web/content/publish` remains the current route-facing public layer
- `apps/web/content/episodes/.../packet.mdx` remains the current episode packet layer
- the living manuscript is not yet feeding public pages or packet generation

Structural truth of the current seed:

- the source manuscript relies mostly on textual chapter markers, not consistent Word heading styles
- several chapters are already usable as coarse blocks
- several later sections are mixed, fragmentary, or clearly under-developed
- comments cluster heavily around early book material and around the oversized values section

## Block Inventory

| Block ID | Title | Type | Chapter | Approx Size | Status | Roughness | Likely Reuse Value | Recommended Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `homer-acknowledgments` | Acknowledgments | acknowledgment | acknowledgments | 184 words / 5 paras | baseline | low | low | Leave intact for now; only revisit if acknowledgments need trimming for book format. |
| `homer-preface-write-it-down` | Preface | preface | preface | 384 words / 2 paras | baseline | low | high | Keep intact short-term; pair later with Charlie reflection and quote handling. |
| `homer-introduction-look-for-lessons` | Introduction | preface | introduction | 674 words / 3 paras | baseline | low | high | Keep intact for now; later split only if the swallow/stained-glass origin needs separate reuse. |
| `homer-chapter-zero-in-the-beginning` | Chapter Zero: In The Beginning | story | chapter-zero | 550 words / 4 paras | baseline | medium | high | Later split ancestry narrative from explicit principle/legacy teaching if reused across outputs. |
| `homer-chapter-one-early-days` | Chapter One: The Early Days | story | chapter-one | 900 words / 8 paras | baseline | medium | high | First-wave split candidate; separate school lessons, busy-work insight, farm/work play, and transition to later life. |
| `homer-chapter-two-values-get-some` | Chapter Two: Values: Get Some | story | chapter-two | 9.8k words / 60 paras | baseline | high | high | Split first; this is too large and too internally varied for reliable reuse. |
| `homer-chapter-three-none-of-it-works-unless-you-do` | Chapter Three: None of it Works Unless You Do | story | chapter-three | 1.8k words / 24 paras | baseline | medium | high | Later split mission call, Costa Rica leadership, standards, and AIT/Icon follow-through. |
| `homer-chapter-four-it-doesnt-hurt-to-get-lucky` | Chapter Four: It doesn’t hurt to get lucky | story | chapter-four | 3.5k words / 33 paras | baseline | high | medium | Split later; romance, priorities, ROTC, Ranger Challenge, and career opportunity are currently jammed together. |
| `homer-chapter-five-leaders-make-it-happen` | Chapter five: Leaders Make It Happen | story | chapter-five | 2.0k words / 18 paras | baseline | medium | high | Later split OBC clarity story from deployment-prep and organization material. |
| `homer-chapter-six-individuals-make-a-team` | Chapter Six: Individuals make a team | story | chapter-six | 3.3k words / 42 paras | baseline | medium | high | Split later; people-asset philosophy, Porath material, counseling, and combat-team examples need separate handles. |
| `homer-chapter-seven-clear-task-purpose-end-state` | Chapter Seven: The team needs a clear task, purpose, and end state | story | chapter-seven | 1.5k words / 8 paras | baseline | medium | high | Keep temporarily; later split the abstract framing from the cache-search operation story. |
| `homer-chapter-eight-learn` | Chapter 8: Learn | story | chapter-eight | 2.3k words / 41 paras | baseline | medium | high | Strong split candidate; separate learn-thesis from Hanson/MEDEVAC and long-duration patrol aftermath. |
| `homer-chapter-nine-leadership-philosophy` | Chapter Nine: Leadership Philosophy | leadership-principle | chapter-nine | 86 words / 1 para | baseline | high | medium | Do not split yet; decide whether to expand it, merge it, or treat it as a bridge heading rather than a real standalone chapter. |
| `homer-chapter-ten-risk-assessment-risk-reduction` | Chapter Ten: Risk assessment and risk reduction | leadership-principle | chapter-ten | 839 words / 18 paras | baseline | high | high | Structural recovery needed before fine reuse; several note-like fragments should become discrete child blocks. |
| `homer-chapter-eleven-what-is-important` | Chapter Eleven: What is Important | leadership-principle | chapter-eleven | 658 words / 10 paras | baseline | medium | medium | Keep for now; later separate boss-priority thesis from Afghanistan/company-command examples. |
| `homer-chapter-twelve-dont-forget-to-enjoy-it` | Chapter Twelve: Don’t Forget to Enjoy It | story | chapter-twelve | 1.2k words / 15 paras | baseline | high | high | Later split joy thesis from Afghanistan loss/reintegration and attitude material. |
| `homer-ending-and-extra-material` | Ending and Extra Material | story | ending | 849 words / 10 paras | baseline | high | medium | Treat as a parking-lot / epilogue candidate; later separate closing counsel, family/faith coda, and leftovers. |

## Oversized Blocks

These blocks are too large, too mixed, or too structurally uneven to remain coarse forever.

### 1. `homer-chapter-two-values-get-some`

Why it is oversized:

- it carries the thesis on values and integrity
- it also contains multiple strong stories that deserve their own handles
- comments already indicate the section needs work and has expansion opportunities

Possible child block IDs and titles:

- `homer-values-definition-and-relative-worth` — Values, worth, and relative value
- `homer-values-army-leadership-and-integrity` — LDRSHIP and uncompromising values
- `homer-values-tip-nevada-promise` — Tip, Nevada, and keeping promises
- `homer-values-farm-work-and-time-investment` — Farm work, listening, and time
- `homer-values-simple-solutions-and-listening` — Simple fixes and hearing unexpected voices
- `homer-values-fast-food-and-theater-freedom` — Work, autonomy, and creative energy
- `homer-values-basic-training-confidence` — Wrestling, grit, and self-knowledge
- `homer-values-simmons-and-discipline` — Language, standards, and disciplined example
- `homer-values-icon-health-and-fitness` — Production lines, process improvement, and promotion

### 2. `homer-chapter-four-it-doesnt-hurt-to-get-lucky`

Why it is oversized:

- it bundles romance, priorities, school/career direction, ROTC, and Ranger Challenge
- it contains obvious fragments and unfinished transitions
- it shifts tone and theme several times without clean boundaries

Possible child block IDs and titles:

- `homer-luck-and-foresight-thesis` — Luck, choice, and foresight
- `homer-paige-first-date` — The first date with Paige
- `homer-priorities-marriage-and-bold-decisions` — Marriage and choosing priorities
- `homer-rotc-opportunity` — ROTC as the next turning point
- `homer-ranger-challenge-confidence` — Ranger Challenge and discovering capacity
- `homer-changing-units-and-opportunity` — Looking for bigger opportunities

### 3. `homer-chapter-six-individuals-make-a-team`

Why it is oversized:

- it is long and operationally dense
- it includes several different people-management examples
- its title implies a reusable people-leadership toolkit, but the seed is still a single large combat-era block

Possible child block IDs and titles:

- `homer-people-asset-left-seat-first-patrol` — First combat patrol in the left seat
- `homer-people-asset-counsel-evaluate-punish-reward` — Management framework material
- `homer-people-asset-porath-and-the-meerkat` — SPC Porath and finding a role
- `homer-people-asset-team-trust-under-fire` — Trust, friction, and combat reality
- `homer-people-asset-leader-investment-in-subordinates` — Investing in people over machinery

### 4. `homer-chapter-eight-learn`

Why it is oversized:

- it contains one of the best combat stories in the manuscript
- it is currently doing too many jobs at once: learning thesis, action narrative, aftermath, and reflective lesson

Possible child block IDs and titles:

- `homer-learn-thesis-and-road-backward` — Learning thesis and looking back
- `homer-route-gnat-hanson-blast` — Hanson, the blast, and the immediate response
- `homer-battle-main-rtd` — RTD, disbelief, and the radio exchange
- `homer-forty-five-days-straight` — Sustained tempo and blending days
- `homer-learn-lesson-and-pride` — Reflective lessons from the episode

### 5. `homer-chapter-ten-risk-assessment-risk-reduction`

Why it is oversized in structure if not raw word count:

- it is short but internally fragmented
- it mixes doctrine, Iraq friction points, movie analogy, Afghanistan anxiety, and sketch notes
- several paragraphs feel like outline residue rather than fully written prose

Possible child block IDs and titles:

- `homer-risk-gunners-up-or-down` — Gunners up or down
- `homer-risk-secondary-ied-response` — Rush in or sweep first
- `homer-risk-third-option-solution` — Outside-the-binary answers
- `homer-risk-reign-of-fire-analogy` — The Reign of Fire analogy
- `homer-risk-afghanistan-gap-between-right-and-real` — Anxiety and the gap between ideal and reality
- `homer-risk-pave-the-roads-not-fiber-optic` — Bureaucracy, roads, and fighting the wrong problem

### 6. `homer-chapter-twelve-dont-forget-to-enjoy-it`

Why it is oversized in theme:

- it mixes joy, balance, reintegration, loss, attitude, and closing counsel
- some of its most emotionally serious material arrives late and compressed
- the later ending block continues related material rather than finishing cleanly here

Possible child block IDs and titles:

- `homer-enjoy-it-thesis` — Enjoy life and remember the purpose of work
- `homer-leaving-afghanistan-and-reintegration` — Leaving Afghanistan and coming home
- `homer-arruda-loss-and-leadership-weight` — Arruda, loss, and moral burden
- `homer-attitude-and-balance` — Attitude, balance, and home-life cost
- `homer-ask-for-help-and-help-others` — Closing counsel on help and responsibility

## Strongest Story Material

### `homer-preface-write-it-down`

- Story title: Write It Down
- Why it is strong: clear thesis, personal reason for the book, immediate voice, strong legacy hook
- Likely themes: legacy, writing, reflection, learning
- Likely episode use: direct opening episode or season/podcast manifesto
- Charlie should: **respond** with a reflection or framing pass, not a joke pass

### `homer-introduction-look-for-lessons`

- Story title: Look for Lessons
- Why it is strong: strong family scene, clear origin story, memorable swallow and stained-glass imagery
- Likely themes: learning, family, perception, meaning-making
- Likely episode use: obvious episode anchor for `look-for-lessons`
- Charlie should: **research bridge** or **pop culture bridge**, with light voice support

### `homer-chapter-zero-in-the-beginning`

- Story title: Know Where You Came From
- Why it is strong: rich ancestry material, war/farm/welder lineage, explicit leadership thesis about origin and identity
- Likely themes: legacy, ancestry, service, identity
- Likely episode use: obvious anchor for `know-where-you-came-from`
- Charlie should: **research** and **emotional context**, not humor-first

### `homer-chapter-two-values-get-some`

- Story title: Tip, Nevada, and Keeping Promises
- Why it is strong: vivid family story, clear integrity payoff, memorable geography hook
- Likely themes: integrity, fatherhood, promises, values
- Likely episode use: very strong short episode or book-side sidebar once split
- Charlie should: **leadership application** with maybe a small humor pass

### `homer-chapter-two-values-get-some`

- Story title: Simmons, the Gas Mask, and Standards
- Why it is strong: comic and cinematic, high recall value, strong discipline/identity lesson
- Likely themes: standards, discipline, self-command, belonging
- Likely episode use: standout podcast segment if isolated cleanly
- Charlie should: **humor/voice pass** plus **leadership application**

### `homer-chapter-four-it-doesnt-hurt-to-get-lucky`

- Story title: Paige, the First Date, and Choosing Boldly
- Why it is strong: warm, human, funny, relational, and narratively complete enough to carry attention
- Likely themes: priorities, partnership, boldness, providence
- Likely episode use: strong relationship/decision episode or companion essay
- Charlie should: **humor/voice pass** and **emotional context**

### `homer-chapter-five-leaders-make-it-happen`

- Story title: Southern Cordon and Instant Clarity
- Why it is strong: compact leadership problem, live ambiguity, immediate lesson about confident direction
- Likely themes: clarity, decisiveness, mission command, leader effect
- Likely episode use: obvious leadership lesson episode
- Charlie should: **leadership application**, not heavy research

### `homer-chapter-seven-clear-task-purpose-end-state`

- Story title: Cache Search in the Desert
- Why it is strong: purpose and end-state lesson attached to an operational story instead of abstract advice
- Likely themes: purpose, end state, clarity, tactical execution
- Likely episode use: strong operations/leadership episode once split from framing
- Charlie should: **leadership application** and **research bridge** if needed

### `homer-chapter-eight-learn`

- Story title: Hanson, MEDEVAC, and “RTD”
- Why it is strong: high stakes, memorable radio texture, emotional pressure, strong after-action reflection potential
- Likely themes: learning, grit, survival, leadership under fire
- Likely episode use: one of the strongest single episode anchors in the whole seed
- Charlie should: **emotional context** and possibly **research bridge**; do not joke over the core moment

### `homer-chapter-ten-risk-assessment-risk-reduction`

- Story title: Gunners Up or Down
- Why it is strong: immediately concrete, morally weighty, and ideal for a leadership tradeoff discussion
- Likely themes: risk, judgment, tradeoffs, command responsibility
- Likely episode use: strong future episode once fragments around it are cleaned up
- Charlie should: **leadership application** and **historical example**

## Weakest / Most Fragmentary Material

### `homer-chapter-two-values-get-some`

- Issue: enormous section with too many internal arcs and several author comments saying it needs help
- Likely repair type: **structural edit needed**

### `homer-chapter-four-it-doesnt-hurt-to-get-lucky`

- Issue: contains obvious fragments and unfinished transitions; relationship and career material are crowded together
- Likely repair type: **Scott expansion needed** and **structural edit needed**

### `homer-chapter-nine-leadership-philosophy`

- Issue: only one short paragraph; does not yet read like a real chapter
- Likely repair type: **Scott expansion needed** or **possible merge/parking lot**

### `homer-chapter-ten-risk-assessment-risk-reduction`

- Issue: contains note-like fragments (`Orton shot`, `Arruda died`, `Build roads`, `Consistency plans changing`) that read like seed notes rather than finished prose
- Likely repair type: **structural edit needed** and **research needed**

### `homer-chapter-twelve-dont-forget-to-enjoy-it`

- Issue: joy thesis, reintegration, grief, and attitude material are all crammed together late
- Likely repair type: **Charlie bridge needed** and **structural edit needed**

### `homer-ending-and-extra-material`

- Issue: behaves like leftover ending notes, epilogue material, and additional counsel rather than one clean ending block
- Likely repair type: **possible cut/parking lot** or epilogue restructuring

### Unanchored comment residue (`comments.json` IDs 9, 10, 12)

- Issue: comments imply missing chapter boundaries, weak story-to-lesson connection, and at least one missing story setup
- Likely repair type: **structural edit needed** and possibly **Scott expansion needed**

## Charlie Insertion Opportunities

### High Priority

- Paired Homer block/story: `homer-preface-write-it-down`
- Suggested Charlie block ID: `charlie-preface-write-it-down-reflection`
- Contribution type: `reflection`
- Description: respond to why writing the story down matters now, not just later
- Priority: **high**

- Paired Homer block/story: `homer-chapter-zero-in-the-beginning`
- Suggested Charlie block ID: `charlie-chapter-zero-legacy-research-bridge`
- Contribution type: `research bridge`
- Description: connect ancestry, origin, and identity to leadership inheritance without flattening the family story
- Priority: **high**

- Paired Homer block/story: `homer-chapter-one-early-days`
- Suggested Charlie block ID: `charlie-chapter-one-busy-work-and-purpose`
- Contribution type: `leadership application`
- Description: translate the busy-work and keyboarding lessons into modern leadership and education language
- Priority: **high**

- Paired Homer block/story: `homer-chapter-two-values-get-some`
- Suggested Charlie block ID: `charlie-chapter-two-values-integrity-bridge`
- Contribution type: `leadership application`
- Description: frame values/integrity for modern leaders without diluting the father/Tip/Nevada material
- Priority: **high**

- Paired Homer block/story: `homer-chapter-five-leaders-make-it-happen`
- Suggested Charlie block ID: `charlie-chapter-five-clarity-under-ambiguity`
- Contribution type: `leadership application`
- Description: sharpen the lesson that calm clarity can stabilize a confused team faster than perfect information
- Priority: **high**

- Paired Homer block/story: `homer-chapter-eight-learn`
- Suggested Charlie block ID: `charlie-chapter-eight-hanson-emotional-context`
- Contribution type: `emotional context`
- Description: honor the emotional weight of the Hanson story without stepping on the operational reality of it
- Priority: **high**

- Paired Homer block/story: `homer-chapter-ten-risk-assessment-risk-reduction`
- Suggested Charlie block ID: `charlie-chapter-ten-risk-vs-risk-aversion`
- Contribution type: `historical example`
- Description: bridge the risk tradeoff discussion to broader leadership or military examples
- Priority: **high**

### Medium Priority

- Paired Homer block/story: `homer-introduction-look-for-lessons`
- Suggested Charlie block ID: `charlie-introduction-look-for-lessons-bridge`
- Contribution type: `pop culture bridge`
- Description: connect the “look for lessons” instinct to how modern people make meaning from ordinary life
- Priority: **medium**

- Paired Homer block/story: `homer-chapter-two-values-get-some`
- Suggested Charlie block ID: `charlie-chapter-two-language-and-standards`
- Contribution type: `humor/voice pass`
- Description: help the Simmons / language / standards story land with tonal control and pace
- Priority: **medium**

- Paired Homer block/story: `homer-chapter-four-it-doesnt-hurt-to-get-lucky`
- Suggested Charlie block ID: `charlie-chapter-four-luck-preparation-partnership`
- Contribution type: `reflection`
- Description: frame the Paige story as partnership plus preparedness instead of fuzzy providence talk alone
- Priority: **medium**

- Paired Homer block/story: `homer-chapter-twelve-dont-forget-to-enjoy-it`
- Suggested Charlie block ID: `charlie-chapter-twelve-joy-after-trauma`
- Contribution type: `emotional context`
- Description: help bridge from joy thesis into loss, reintegration, and attitude without sounding pasted on
- Priority: **medium**

### Low Priority

- Paired Homer block/story: `homer-acknowledgments`
- Suggested Charlie block ID: `charlie-acknowledgments-context-note`
- Contribution type: `humor/voice pass`
- Description: only needed if acknowledgments later become part of a public-facing package rather than a pure book element
- Priority: **low**

## QuoteRef Candidates

All of these should be treated as candidate quote records with `citationStatus: needs-verification` until formally checked.

| Quote ID | Source Block ID | Quote / Reference | Attributed To | citationStatus | Note |
| --- | --- | --- | --- | --- | --- |
| `quote-benjamin-franklin-write-things-worth-reading` | `homer-preface-write-it-down` | “If you will not be forgotten after you are dead and rotten either write things worth the reading or do things worth the writing of” | Benjamin Franklin | `needs-verification` | Important opening epigraph; wording should be formally checked. |
| `quote-mary-poppins-spoonful-of-sugar` | `homer-chapter-one-early-days` | “A spoon full of sugar helps the medicine go down.” | Mary Poppins | `needs-verification` | Keep because it is already serving a memory hook inside the manuscript. |
| `quote-dwight-d-eisenhower-integrity` | `homer-chapter-two-values-get-some` | “The supreme quality for a leader is unquestionably integrity...” | Dwight D. Eisenhower | `needs-verification` | Strong leadership quote candidate with direct reuse value. |
| `quote-j-c-watts-character-when-nobodys-looking` | `homer-chapter-two-values-get-some` | “Character is doing the right thing when nobody's looking...” | J. C. Watts | `needs-verification` | Good values/integrity companion quote. |
| `quote-orson-welles-happy-ending` | `homer-ending-and-extra-material` | “If you want a happy ending, that depends, of course, on where you stop your story.” | Orson Welles | `needs-verification` | Strong ending/epilogue quote candidate. |
| `quote-charles-r-swindoll-attitude` | `homer-ending-and-extra-material` | “The longer I love, the more I realize the impact of attitude on life...” | Charles R. Swindoll | `needs-verification` | Very long quote; may need excerpting policy later. |

## Podcast / Episode Arrangement Opportunities

The current podcast arrangement files are intentionally conservative, but still too thin to function as a real production map. A better first-pass arrangement can still use only current top-level block IDs.

| Episode Slug | Working Title | Existing Block IDs | Rationale | Missing / Split Blocks Needed Before Strong |
| --- | --- | --- | --- | --- |
| `write-it-down` | Write It Down | `homer-preface-write-it-down` | Strong statement of why the project exists; good as a season thesis or opening short | Needs Charlie reflection and likely a smaller opening chunk inside the preface |
| `look-for-lessons` | Look for Lessons | `homer-introduction-look-for-lessons`, `homer-chapter-one-early-days` | The introduction carries the thesis; Chapter One gives concrete early-life proof of the pattern | Needs Chapter One split so the keyboard/busy-work lesson can stand alone cleanly |
| `know-where-you-came-from` | Know Where You Came From | `homer-chapter-zero-in-the-beginning` | Already has a strong ancestry-and-identity arc | Needs Charlie research bridge and maybe a separate “family line / leadership lesson” split |
| `early-life-lessons` | Early Life Lessons | `homer-chapter-one-early-days` | Natural episode once the school/farm material is separated into tighter segments | Needs block split; current chapter is still broad for one clean episode |
| `values` | Values | `homer-chapter-two-values-get-some` | Obvious candidate but currently too huge to be a real episode map | Needs major split first |
| `none-of-it-works-unless-you-do` | None of it Works Unless You Do | `homer-chapter-three-none-of-it-works-unless-you-do` | Strong title and a usable personal discipline frame | Needs sub-blocking around mission call, companions, and standards |
| `leaders-make-it-happen` | Leaders Make It Happen | `homer-chapter-five-leaders-make-it-happen`, `homer-chapter-seven-clear-task-purpose-end-state` | Together these blocks create a better leadership-clarity episode than either does alone at coarse scale | Needs both blocks split so the decisive story and the cache-search story can be combined intentionally |
| `learn` | Learn | `homer-chapter-eight-learn` | Contains one of the strongest single action stories in the seed | Needs split before production; the Hanson material should become its own block |
| `risk-assessment-risk-reduction` | Risk Assessment and Risk Reduction | `homer-chapter-ten-risk-assessment-risk-reduction`, `homer-chapter-eleven-what-is-important` | The ideas belong together more than they currently stand apart | Needs structural cleanup in Chapter Ten and stronger boundaries in Chapter Eleven |

## Book Arrangement Opportunities

At book scale, the current top-level order is still the right provisional order.

Recommended near-term rule:

- preserve the original large arc before making thematic rearrangements
- split internally first, then reorganize with evidence

Current best book-level reading of the seeded manuscript:

- `Acknowledgments`, `Preface`, `Introduction`, and `Chapter Zero` form a strong opening runway
- `Chapter One` through `Chapter Four` read like formative-years and values-building material
- `Chapter Five` through `Chapter Eight` read like the operational leadership spine
- `Chapter Nine` through `Chapter Twelve` read more like philosophy, risk, command weight, and late-life synthesis, but they are structurally less stable than the earlier material
- `Ending and Extra Material` currently behaves more like a future epilogue + appendix + parking lot than a clean final chapter

Book-structure recommendation for now:

- keep the top-level chapter order as-is
- do not reorganize around themes yet
- after splitting, decide whether `Chapter Nine` should remain standalone or become a bridge into `Chapter Ten`
- after splitting, decide whether `Ending and Extra Material` should become:
  - epilogue
  - appendix / notes
  - a handful of redistributed late blocks

## First Split Recommendations

### 1. `homer-chapter-two-values-get-some`

Why split first:

- it is by far the largest block
- it contains multiple reusable story units already proven useful in packet/public thinking
- comments explicitly say the section needs work and has opportunities to expand

Proposed child block IDs:

- `homer-values-definition-and-relative-worth`
- `homer-values-army-integrity-framework`
- `homer-values-tip-nevada-promise`
- `homer-values-farm-work-and-listening`
- `homer-values-simple-solutions-and-listening`
- `homer-values-basic-training-confidence`
- `homer-values-simmons-and-discipline`
- `homer-values-icon-health-and-fitness`

Arrangements that would benefit:

- `book-v1`
- `podcast-season-1`
- future quote/reference and public summary slices

### 2. `homer-chapter-one-early-days`

Why split second:

- it is an obvious early podcast candidate
- it contains cleanly separable childhood lessons already
- it will teach the splitting workflow without the chaos of Chapter Two

Proposed child block IDs:

- `homer-early-days-preschool-running-in-circles`
- `homer-early-days-termite-and-name-calling`
- `homer-early-days-busy-work-and-keyboarding`
- `homer-early-days-farm-work-and-play`
- `homer-early-days-spoonful-of-sugar`

Arrangements that would benefit:

- `podcast-season-1`
- `book-v1`
- future public-facing “early lessons” excerpts

### 3. `homer-chapter-eight-learn`

Why split third:

- it contains one of the strongest action narratives in the manuscript
- it is a high-value candidate for episode use
- its opening thesis and Hanson story want different treatment

Proposed child block IDs:

- `homer-learn-thesis-and-retrospection`
- `homer-learn-route-gnat-hanson-blast`
- `homer-learn-battle-main-rtd`
- `homer-learn-forty-five-days-straight`

Arrangements that would benefit:

- future combat/leadership episodes
- book-v1 chapter refinement
- future show-prep and clip extraction work

## Risks and Guardrails

### Over-splitting

Risk:

- turning every paragraph into a “smart” block before reuse pressure justifies it

Guardrail:

- split only when a block is too mixed, too large, or clearly needed by arrangements

### Under-splitting

Risk:

- leaving giant blocks so long that arrangements become fake placeholders

Guardrail:

- split the worst offenders first, starting with Chapter Two and then one of Chapter One or Eight

### Quote / citation drift

Risk:

- seeded quotes get reused publicly before they are verified

Guardrail:

- mark all quote candidates `needs-verification` until checked against reliable sources

### Public derivative drift

Risk:

- the living manuscript evolves while `apps/web/content/publish` stays stale in different ways

Guardrail:

- do not treat the living manuscript as route-facing content until explicit derivative workflows exist

### Generated files becoming accidental source of truth

Risk:

- future generated outputs get hand-edited and silently outrank the manuscript

Guardrail:

- keep the rule that generated outputs are derivative only

### Codex rewriting too soon

Risk:

- an AI pass starts “improving” Scott/Homer’s prose before provenance has been respected

Guardrail:

- preserve baseline wording until a later editing pass explicitly authorizes rewrites

## Recommended Next Prompt

Use this exact next prompt for the first split pass:

> Split exactly one living-manuscript block: `homer-chapter-two-values-get-some`.
> 
> Rules:
> - preserve source wording
> - do not rewrite Scott/Homer’s prose stylistically
> - create child `ManuscriptBlock` entries inside `learning-to-lead.living.mdx`
> - keep the parent content recoverable in structure or comments if useful
> - use these child IDs where they fit the source naturally:
>   - `homer-values-definition-and-relative-worth`
>   - `homer-values-army-integrity-framework`
>   - `homer-values-tip-nevada-promise`
>   - `homer-values-farm-work-and-listening`
>   - `homer-values-simple-solutions-and-listening`
>   - `homer-values-basic-training-confidence`
>   - `homer-values-simmons-and-discipline`
>   - `homer-values-icon-health-and-fitness`
> - update only the living manuscript and, if needed, the source outline note
> - do not touch `apps/web/content/publish`
> - do not touch `apps/web/content/episodes`
> - do not add Charlie prose yet
> - validate that all new block IDs are unique
