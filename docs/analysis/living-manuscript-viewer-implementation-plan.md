# Living Manuscript Viewer Implementation Plan

Date: 2026-05-05

## Current App Structure Findings

Relevant findings from the current `apps/web` app:

- Internal team pages already live under `apps/web/src/app/team/*`.
- The shared internal shell is `apps/web/src/app/team/layout.tsx`.
- That layout already handles:
  - sign-in redirect via `auth()` and `redirect(buildSignInHref(...))`
  - welcome gating via `redirectToWelcomeIfNeeded(...)`
  - internal access gating via `canAccessInternalContent(roles)`
  - the common `Team Console` header and nav pills
- The existing internal dashboard precedent is the Show Prep Room:
  - server page: `apps/web/src/app/team/show-prep/page.tsx`
  - client viewer/filter shell: `apps/web/src/app/team/show-prep/ShowPrepFiltersClient.tsx`
  - server-side parser/helper: `apps/web/src/lib/server/show-prep.ts`
- The app already has reusable UI pieces that fit this kind of internal read-only viewer:
  - `PageContainer`
  - `GlassPanel`
  - `PaperCard`
  - `PageEyebrow`
  - `BackLink`
- Path alias conventions are already in place in `apps/web/tsconfig.json`:
  - `@/* -> src/*`
- There is already a public MDX content loader in `apps/web/src/lib/source.ts`, but it is specifically for the public Fumadocs layer and should not be reused for the living manuscript viewer.
- There is no obvious generic living-manuscript parser yet.
- There are MDX display components under `apps/web/src/components/mdx/*`, but the living manuscript viewer should treat the manuscript as structured source text, not as a normal compiled MDX route in this pass.

Implication:

The cleanest implementation path is the same broad shape as Show Prep:

1. server-only file parser/helper
2. server route that loads parsed manuscript data
3. client viewer for filters, collapsible groups, and metadata toggles

## Recommended Route

Recommended route:

- `/team/books/learning-to-lead`

Why:

- It belongs in the existing internal/team space.
- It is clearly book-oriented, not episode-oriented.
- It avoids overloading `/team/show-prep`, which is packet/candidate inventory rather than whole-manuscript viewing.
- It naturally leaves room for later routes such as:
  - `/team/books/learning-to-lead/quotes`
  - `/team/books/learning-to-lead/arrangements`
  - `/team/books/learning-to-lead/history`

Recommended file location:

- `apps/web/src/app/team/books/learning-to-lead/page.tsx`

Recommended nav follow-up in the build pass:

- add `Books` or `Living Manuscript` to the team nav in `apps/web/src/app/team/layout.tsx`

That nav change should happen in the implementation pass, not in this planning pass.

## Access Control

Recommended access model:

- Reuse the existing `/team` layout and its current gate.
- Do not add a new auth mechanism.
- Do not duplicate auth checks inside the page unless a page-specific role distinction appears later.

Current effective access behavior already provided by `apps/web/src/app/team/layout.tsx`:

- unauthenticated users are redirected to sign-in
- signed-in users may be redirected through the welcome flow
- users without internal roles are denied via `notFound()`

Relevant helper:

- `canAccessInternalContent(roles)` in `apps/web/src/lib/authz.ts`

Recommendation:

- Place the manuscript viewer under `/team` so it inherits the existing access control automatically.
- Treat it as internal read-only editorial tooling.

## Parser Strategy

### Goals

The parser should read the living manuscript file directly from disk and extract:

- frontmatter
- top-level manuscript title/note content if needed
- each `<ManuscriptBlock ...>...</ManuscriptBlock>`
- block metadata props
- block body as source text
- tags arrays and other array-like metadata when present

### Recommended file location

Create a server-only helper such as:

- `apps/web/src/lib/server/living-manuscript.ts`

Why there:

- it matches the existing `show-prep.ts` pattern
- it keeps file I/O and parsing logic out of route components
- it makes unit-like parser validation easier later

### Parsing approach

Recommended approach:

1. Read the file from disk with `fs/promises`.
2. Split frontmatter from body with a small explicit frontmatter parser.
3. Parse `ManuscriptBlock` entries from the remaining MDX source using a purpose-built block parser.
4. Normalize parsed data into plain serializable objects before passing it to a client component.

### Frontmatter parsing

Use a simple explicit parser similar in spirit to the existing server helpers:

- detect opening `---` and closing `---`
- parse simple scalar fields as strings/booleans where obvious
- do not try to build a full YAML engine if it is not already available

This manuscript frontmatter currently appears simple enough for a lightweight parser.

### ManuscriptBlock parsing

Do not rely on one giant regex for the entire file.

Recommended method:

- scan for `<ManuscriptBlock`
- find the matching closing `>` of the opening tag
- find the next `</ManuscriptBlock>`
- extract:
  - raw opening tag text
  - raw body text
- parse props from the opening tag using targeted prop parsing rules

This is more robust than a single all-in-one regex and easier to debug when the MDX evolves.

### Prop parsing

Recommended first-pass supported prop shapes:

- `id="..."`
- `title="..."`
- `type="..."`
- `voice="..."`
- `status="..."`
- `chapter="..."`
- `source="..."`
- `tags={["a", "b"]}`
- `pairsWith={["..."]}`
- `quoteRefs={["..."]}`
- `notes="..."`

For this MVP, it is acceptable to support the prop shapes that already exist in the manuscript and fail closed on unexpected shapes.

### Body rendering strategy

Do not compile the block body as MDX yet.

For the first viewer pass, treat the block body as source text and render it read-only in a prose-safe container.

Two safe display options:

- preserve paragraphs by splitting on blank lines and rendering text blocks
- or render in `<pre>` / whitespace-preserving mode with light formatting

Recommendation:

- start with readable source-text rendering, not compiled MDX execution

Reason:

- the viewer is for editorial inspection of structured source text
- it avoids confusion between source parsing and route-ready MDX rendering
- it reduces runtime complexity and security ambiguity

## Viewer Data Shape

Recommended server-side normalized shapes:

```ts
interface LivingManuscriptFrontmatter {
  title: string | null;
  project: string | null;
  series: string | null;
  canonical: boolean | null;
  sourceDocument: string | null;
  sourceBaseline: string | null;
  workflowStatus: string | null;
  publicationStatus: string | null;
}

interface LivingManuscriptBlock {
  id: string;
  title: string;
  type: string;
  voice: string;
  status: string;
  chapter: string;
  tags: string[];
  source: string | null;
  pairsWith: string[];
  quoteRefs: string[];
  notes: string | null;
  body: string;
  rawTag: string;
  order: number;
  wordCount: number;
}

interface LivingManuscriptDocument {
  frontmatter: LivingManuscriptFrontmatter;
  introNote: string | null;
  blocks: LivingManuscriptBlock[];
  sourcePath: string;
}

interface LivingManuscriptFilterOptions {
  chapters: string[];
  voices: string[];
  statuses: string[];
  types: string[];
  tags: string[];
}
```

Recommended client-bound shapes:

- Keep them plain JSON-serializable.
- Avoid passing `Map`, `Set`, class instances, or null-prototype objects.
- Derive filter option arrays on the server or client, but pass plain arrays either way.

## UI Strategy

### Page layout

Recommended page structure:

1. page header / intro panel
2. viewer workspace
   - left sidebar for filters and outline
   - right content area for full manuscript blocks

Follow the successful internal-tool precedent used by Show Prep:

- server page loads data
- client component handles interactivity

### Sidebar

Recommended sidebar sections:

1. manuscript summary
   - title
   - source document
   - block count
   - chapter count
2. filter controls
   - chapter
   - voice
   - status
   - type
   - tags
3. metadata toggle
   - show all metadata
   - hide metadata
4. outline/navigation groups
   - collapsible by chapter
   - each chapter shows matching blocks
   - click scrolls to the block in the main panel

### Collapsible groups

Recommended grouping model:

- group blocks by `chapter`
- allow collapsing each chapter group in the sidebar
- main content stays in manuscript order

Reason:

- chapter is already the strongest stable grouping key in the current manuscript
- it fits both book review and editorial scanning

### Filter controls

Recommended filters:

- chapter
- voice
- status
- type
- tags

Recommended behavior:

- multi-select checkboxes for each category
- client-side filtering only for MVP
- visible result counts
- clear filters action
- keep filtered results in manuscript order

### Metadata toggle

Recommended toggle behavior:

- default: compact metadata shown
- optional expanded metadata panel per block or global toggle

Metadata that is worth showing when enabled:

- id
- type
- voice
- status
- chapter
- tags
- source
- pairsWith
- quoteRefs
- notes
- word count

### Full manuscript body rendering

Recommended block presentation:

- one `PaperCard` or equivalent content panel per `ManuscriptBlock`
- header with block title and compact metadata chips
- body rendered as readable source text

For MVP, render source body plainly and reliably.
Do not try to interpret arbitrary MDX inside block bodies yet.

### Empty states

Needed states:

- manuscript file missing
- frontmatter parsed but zero blocks found
- filters produce zero matches
- parser finds malformed blocks

Recommendation:

- show explicit internal-tool error panels with actionable explanations
- do not silently swallow parse failures

### Mobile fallback

Recommended mobile behavior:

- stacked layout
- sidebar/filter controls above content
- collapsible filter sections
- no split-pane requirement on small screens

Reason:

- this is primarily an internal desktop workflow, but it should still degrade cleanly

## Build Order

Recommended implementation order:

1. **Parser helper**
   - create `apps/web/src/lib/server/living-manuscript.ts`
   - read file
   - parse frontmatter
   - parse `ManuscriptBlock` entries
   - normalize plain objects

2. **Parser validation**
   - add a small local validation path or helper assertions
   - verify block count
   - verify required fields
   - verify unique IDs

3. **Server page**
   - create `apps/web/src/app/team/books/learning-to-lead/page.tsx`
   - load parsed manuscript on the server
   - pass serializable data into client viewer

4. **Client viewer component**
   - create something like `LivingManuscriptViewerClient.tsx`
   - render layout, block list, and chapter outline

5. **Sidebar filters**
   - add client-side filter state and result counts
   - filter by chapter, voice, status, type, tags

6. **Metadata toggle**
   - add global show/hide metadata state
   - optionally allow per-block expansion later

7. **Polish**
   - chapter anchor navigation
   - empty states
   - better chip styling
   - team nav entry

## Risks

### Regex parser fragility

Risk:

- JSX-like block syntax is easy to parse incorrectly with overly clever regex.

Guardrail:

- use a small explicit scanner for opening tags and closing blocks
- use targeted prop parsing, not one monolithic regex for the whole file

### Large manuscript rendering

Risk:

- a large manuscript with many long blocks may produce a heavy client payload.

Guardrail:

- keep the parser server-side
- pass only normalized data
- if performance becomes an issue later, add chapter virtualization or lazy block expansion

### MDX component vs source text confusion

Risk:

- future contributors may assume this route is compiling and executing the manuscript as real MDX.

Guardrail:

- document clearly that this viewer is rendering structured source, not route-ready MDX execution
- keep the parser/helper name explicit

### Hydration and serialization problems

Risk:

- server parser output can accidentally include non-serializable structures.

Guardrail:

- normalize all client-bound data into plain objects and arrays
- follow the same discipline that fixed the Show Prep serialization issue

### Route access control drift

Risk:

- adding a route outside `/team` would require duplicating access logic and may leak the tool.

Guardrail:

- keep the route under `/team`

### Generated files vs source files confusion

Risk:

- users may confuse the viewer with a generated/public route.

Guardrail:

- label the page explicitly as an internal read-only source viewer
- reference the living manuscript file path and source-of-truth status in the UI

## Recommended Next Codex Prompt

Use this exact next prompt:

> You are Codex working inside my local `high-ground-studio` repo.
>
> Build the first MVP of an internal living manuscript viewer for Learning to Lead.
>
> Constraints:
> - Do not modify the manuscript file.
> - Do not modify arrangement YAML.
> - Do not touch public route behavior.
> - Do not create a database.
> - Do not add package dependencies unless absolutely necessary.
>
> Route:
> - Create `/team/books/learning-to-lead`
>
> Implementation requirements:
> 1. Create a server-only parser helper at `apps/web/src/lib/server/living-manuscript.ts`.
> 2. Read `apps/web/content/books/learning-to-lead/manuscript/learning-to-lead.living.mdx` directly from disk.
> 3. Parse frontmatter.
> 4. Parse each `<ManuscriptBlock ...>...</ManuscriptBlock>` into plain serializable objects.
> 5. Validate required metadata and unique block IDs.
> 6. Build a server page at `apps/web/src/app/team/books/learning-to-lead/page.tsx`.
> 7. Build a client component for:
>    - chapter/voice/status/type/tag filters
>    - collapsible chapter groups in a sidebar
>    - a show/hide metadata toggle
>    - read-only rendering of the full manuscript in source order
> 8. Reuse existing team/internal UI components where practical.
> 9. Keep access under the existing `/team` route protection.
>
> Validation:
> - Run a cheap validation path for the parser.
> - Run `pnpm --filter web build` if the implementation reaches app code cleanly.
>
> Git behavior:
> - Commit only the scoped implementation files.
> - Do not stage `.DS_Store` files.
>
> Commit message:
> - `app: add living manuscript viewer MVP`
