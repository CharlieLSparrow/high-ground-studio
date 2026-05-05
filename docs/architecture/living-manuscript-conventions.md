# Living Manuscript Conventions

Date: 2026-05-05

This document defines the working conventions for the `Learning to Lead` living manuscript.

It is the operational companion to [Living Manuscript System](/Users/wall-e/Dev/high-ground-studio/docs/architecture/living-manuscript-system.md).
The system doc explains the structure.
This conventions doc explains how to work inside that structure without making the source of truth ambiguous.

## Core Principle

The manuscript stays whole.
Outputs get sliced.

That rule drives the whole design.

Current file-based equivalents:

- `learning-to-lead.living.mdx` is the canonical whole-manuscript source file
- each `ManuscriptBlock` is the current file-based equivalent of one database row
- each arrangement YAML file is the current file-based equivalent of an output playlist or join table
- generated output files are derivatives, not source of truth

Implications:

- do not move prose around just to make one episode or page easier
- do not duplicate the same source text into multiple output files as a primary workflow
- change output composition in arrangement files before changing source text structure
- treat generated public files as disposable derivatives unless explicitly elevated into a maintained layer

## ManuscriptBlock Schema

Recommended `ManuscriptBlock` fields:

- `id`
- `title`
- `type`
- `voice`
- `status`
- `chapter`
- `tags`
- `source`
- `pairsWith`
- `quoteRefs`
- `notes`

### Required now

These fields should be present on every working `ManuscriptBlock` now:

- `id`
- `title`
- `type`
- `voice`
- `status`
- `chapter`
- `tags`
- `source`

### Optional now

These fields are useful, but not mandatory in the current file-based phase:

- `pairsWith`
- `quoteRefs`
- `notes`

### Recommended meaning of each field

- `id`: stable machine-safe block identifier
- `title`: human-readable label for editors and arrangement authors
- `type`: what kind of content unit this is
- `voice`: who is speaking or framing the material
- `status`: editorial maturity of the block
- `chapter`: current manuscript neighborhood, not permanent destiny
- `tags`: lightweight thematic and workflow hints
- `source`: provenance pointer for the underlying source text
- `pairsWith`: links between related blocks, especially Homer/Charlie pairings
- `quoteRefs`: future stable references into a quote library
- `notes`: short editorial or provenance context when needed

## Stable ID Rules

Rules:

- IDs must be `kebab-case`
- IDs must remain stable once arrangement files point at them
- IDs must not depend on paragraph numbers
- IDs must not depend only on episode number
- IDs should describe the material, not just where it currently sits

Prefer IDs like:

- `homer-values-tip-nevada-promise`
- `homer-keyboarding-busywork`
- `charlie-keyboarding-purpose-bridge`
- `quote-franklin-write-worth-reading`

Avoid IDs like:

- `chapter-2-para-7`
- `episode-005-part-2`
- `block-17`

Reason:

A good ID survives movement.
If a block later moves from a book chapter into a podcast episode, or from one arrangement to another, the ID should still make sense.

## Block Granularity Rules

Rules:

- do not make every paragraph a block
- do not split just because a block is long
- split when a section clearly contains multiple stories, lessons, quote targets, reuse cases, or Charlie insertion points
- preserve source text exactly when doing structural splitting passes
- once split, prefer one complete story or lesson unit per block
- keep rough material coarse until there is a concrete editorial reason to split it

Good reasons to split:

- one block contains multiple distinct stories
- one block would be reused in different episode arrangements in different combinations
- one block contains multiple quote-worthy units that need independent citation handling
- one block has several clear Charlie response points
- one block mixes story, principle, and production/editorial notes in a way that harms reuse

Bad reasons to split:

- “more blocks feels more structured”
- “the database might want this later”
- “every paragraph looks neat as its own unit”

## Block Types

Recommended types:

- `acknowledgment`
- `preface`
- `introduction`
- `story`
- `leadership-principle`
- `charlie-reflection`
- `research-bridge`
- `historical-example`
- `pop-culture-bridge`
- `quote-context`
- `podcast-question`
- `clip-candidate`
- `production-note`
- `source-note`
- `ending`
- `extra-material`

Usage guidance:

- use `story` when the block is primarily narrative
- use `leadership-principle` when the block is primarily teaching or framing
- use `charlie-reflection` for Charlie’s personal response or interpretive layer
- use `research-bridge`, `historical-example`, or `pop-culture-bridge` when the value is contextualization rather than source narrative
- use `quote-context` when a block primarily introduces, frames, or interprets a quote rather than telling a story
- use `production-note` and `source-note` sparingly; they are support material, not narrative assets

## Voices

Allowed voices:

- `homer`
- `charlie`
- `joint`
- `research`
- `editorial`

Guidance:

- use `homer` for baseline source text from Homer/Scott
- use `charlie` for Charlie-authored additions, reflections, or bridges
- use `joint` only when the block truly becomes co-written and inseparable
- use `research` when the block exists primarily to supply supporting context
- use `editorial` for internal framing that should not be confused with publishable prose

## Status Values

Allowed statuses:

- `baseline`
- `draft`
- `revised`
- `review`
- `ready`
- `published`
- `archived`

Meaning:

- `baseline`: preserved from source, structurally ingested, not yet polished
- `draft`: newly written or actively changing
- `revised`: intentionally reworked from baseline or draft form
- `review`: stable enough for focused editorial review, but not final
- `ready`: stable enough to feed a generated derivative or manual output draft
- `published`: already used in an official output and should be changed carefully
- `archived`: intentionally retired from active use, but preserved

Important:

- `baseline` does not mean weak; it means source-preserved
- `ready` does not mean universally final; it means fit for the specific derivative it is feeding

## Tag Taxonomy

Tags currently live as a flat array.
Keep them short, human-readable, and useful.
Do not force prefix syntax yet.

Recommended tag categories:

### Theme tags

Examples:

- `legacy`
- `values`
- `integrity`
- `trust`
- `purpose`
- `communication`
- `risk`
- `joy`
- `family`
- `faith`
- `service`

### Function tags

Examples:

- `opening`
- `story`
- `setup`
- `payoff`
- `bridge`
- `application`
- `discussion`
- `clip`
- `quote-context`

### Production tags

Examples:

- `needs-charlie`
- `needs-research`
- `needs-citation`
- `needs-split`
- `public-candidate`
- `podcast-candidate`

### Source / context tags

Examples:

- `childhood`
- `mission`
- `army`
- `ramadi`
- `afghanistan`
- `family-farm`
- `marriage`

Current recommendation:

- keep tags flat
- keep tags few
- prefer clarity over taxonomy purity
- do not refactor all existing tags into prefixes until there is real search or generation pressure

## Arrangement Map Rules

Arrangement maps decide output order.
They do not own the prose.

Rules:

- change arrangement YAML before changing source structure when the goal is a different output view
- book arrangements and podcast arrangements are allowed to disagree
- public-site arrangements should stay conservative and should not pretend unfinished content is public-ready
- do not copy prose into arrangement files
- arrangement files should reference stable block IDs only

Example:

```yml
episodes:
  values:
    title: "Values"
    status: "candidate"
    blocks:
      - homer-values-definition-and-relative-worth
      - homer-values-army-leadership-and-integrity
      - homer-values-tip-nevada-promise
      - homer-values-milk-down-the-drain
```

Implication:

If an episode sequence is wrong, fix the YAML.
If a source unit is too coarse for good YAML composition, then split the source block.
Do not solve arrangement problems by cloning prose.

## QuoteRef Rules

The quote system is not built yet, but the convention should be clear before quotes proliferate.

Rules:

- each quote should eventually live once in a quote library
- manuscript blocks should reference quotes by stable ID instead of duplicating quote metadata everywhere
- use `quoteRefs` metadata for block-level references when helpful
- inline `<QuoteRef id="..." />` is acceptable later when the component exists
- every quote candidate should preserve citation status
- unverified quotes must not be treated as publication-ready

Suggested future pattern:

- block metadata:
  - `quoteRefs={["quote-eisenhower-integrity", "quote-jc-watts-character"]}`
- or inline references in prose comments / components once the rendering layer exists

Citation guidance:

- if attribution is uncertain, mark it `needs-verification`
- do not “clean up” quote wording into false certainty
- preserve the difference between a memorable line and a verified citation

## Charlie Layer Rules

Charlie additions should remain separate blocks.
Do not overwrite Homer baseline prose just to add commentary.

Rules:

- Charlie blocks should use `voice="charlie"`
- Charlie blocks should usually sit near the Homer block they answer or extend
- use `pairsWith` to connect Charlie blocks to Homer blocks when the relationship matters
- keep Charlie prose additive, not destructive to the preserved baseline

Example:

```mdx
<ManuscriptBlock
  id="charlie-values-tip-nevada-bridge"
  title="Charlie on Trust and Follow-Through"
  type="charlie-reflection"
  voice="charlie"
  status="draft"
  chapter="chapter-two-values"
  tags={["trust", "application", "needs-citation"]}
  source="editorial-original"
  pairsWith={["homer-values-tip-nevada-promise"]}
>
...
</ManuscriptBlock>
```

## Splitting Procedure

When a block needs to be split, use this procedure:

1. Identify the parent block.
2. Extract the body exactly as it exists.
3. Choose natural seams based on story, lesson, or reuse boundaries.
4. Create child blocks that preserve source order.
5. Remove the parent block only after all children are present.
6. Validate text preservation.
7. Update arrangement maps that referenced the parent block.
8. Create a session note describing the split and any uncertain seams.
9. Commit and push only the scoped files.

Guardrails:

- do not rewrite prose during a structural split unless the task explicitly authorizes editing
- do not lose separators, quote lines, or rough fragments unless there is an intentional editorial reason later
- when seams are uncertain, prefer a slightly larger child block over a false clean split

## Validation Rules

Minimum validation checks for future passes:

- all block IDs are unique
- all arrangement references resolve to existing block IDs
- required metadata fields are present on every working block
- no `.DS_Store` files are staged or committed
- once a quote library exists, every `quoteRefs` entry must resolve
- generated files must not be hand-edited as if they were source of truth

Recommended validation habits:

- use `rg 'id="'` to inspect IDs quickly
- check arrangement files against manuscript IDs after every split
- verify that a split preserves the original source text exactly when the pass is structural only
- keep session notes for non-trivial structural changes so later editors can see why the boundaries changed

## Recommended Next Content Pass

Recommended next pass:

- split Chapter One into reusable childhood and early-life blocks

Rationale:

- Chapter Two has already proven the splitting procedure
- Chapter One is likely the next highest-value source for both book structure and podcast reuse
- splitting Chapter One will create cleaner story units without needing Charlie prose or quote infrastructure first
- QuoteRef scaffolding is useful, but it will be stronger once a few more blocks exist at the right narrative granularity
