# Quipsly Creative OS North Star

Date: 2026-06-02

This is the canonical product vision for the current Quipsly sprint. It
supersedes older Studio, Content Studio, Manuscript Desk, Quipsly/QuipLore, and
browser-local manuscript planning docs when they conflict.

Older docs are still useful as source material. They are not current authority
unless this file or `docs/plans/quipsly-kernel-now-next-later.md` points back to
them.

## Product Thesis

Quipsly is a private creative operating system for writing, studying, editing,
publishing, and research-guided creative work.

The human-facing experience should feel like a normal notebook:

- open a workspace
- write in one continuous manuscript
- highlight text
- tag it
- filter through sidebar lenses
- publish or export from an operator layer

The system-facing model should be much richer:

- durable document kernel
- source corpus
- semantic annotations
- structure boundaries
- media anchors
- entity references
- projections
- agent-readable context

The writer edits prose. The system derives data.

## Core Commitments

### One manuscript, many lenses

The manuscript is not a collection of disconnected paragraph cards. It is one
continuous document with structure and annotations layered over it.

Sidebar modes such as Episode 4, Chapter 3, Quote Database, Study Notes, and
Publisher Mode are projections over the same source, not separate files.

### Database durability is non-negotiable

Browser state is convenience. Local snapshots are recovery. Yjs can be
collaboration transport.

The studio brain must live in durable records:

- canonical document state
- structural boundaries
- regions and story threads
- inline annotations
- quote/source entities
- materialized projections
- agent operation logs

### The kernel is the source of truth

Do not make TipTap, Slate, Lexical, a textarea, ReactFlow, or the video editor
the canonical brain.

Quipsly should own a document kernel that can be rendered and edited through
different surfaces.

Editor engines are adapters.

### Text and media share one substrate

Video editing is not a separate universe. A timeline is another kind of
structured document.

The kernel must be able to represent:

- text anchors
- node anchors
- media time anchors
- timeline anchors
- annotations that connect manuscript text to audio/video/source material

This lets a selected quote become a show note, clip candidate, video range,
article pull quote, or podcast metadata item without copy/paste chaos.

### Agents find examples, not vibes

Quipsly's AI posture is not black-box generation by default.

The companion should act like a research librarian and example finder:

- read the current kernel context
- search trusted corpora
- show source-backed cards
- explain why each result appeared
- propose explicit operations
- wait for approval before mutating important state

Every agent action should be auditable.

### Privacy and workspace walls matter

High Ground Odyssey, Romance Lab, study notebooks, articles, talks, and future
domains can share the same kernel, but their content must not leak across
workspaces.

Romance Lab is a private workspace type, not public HGO material.

Homer's default surface should remain clean and intuitive. Operator and private
workspaces can expose more powerful tools.

## Workspace Modes

### High Ground Odyssey

Purpose:

- book manuscript
- podcast episode prep
- video editing
- show notes
- HGO publishing
- YouTube and social publishing

Default user feel:

- OneNote-like notebook with semantic sidebar lenses.

### Romance Lab

Purpose:

- private fiction planning and writing
- studied-book corpus
- trope and market-comp analysis
- character and relationship graph
- story mapping
- source/example sidebar

Privacy:

- hidden from HGO collaborators unless explicitly shared.

### Study Notebook

Purpose:

- study books and articles
- collect examples and quotes
- map ideas
- connect research to active writing

### Publisher Mode

Purpose:

- private operator layer for publish/export/package actions.

Default:

- hidden unless explicitly enabled.

## Non-Goals

Quipsly should not become:

- a visible database editor
- a block-card writing toy
- a generic AI writing generator
- a pile of disconnected vertical apps
- a ReactFlow graph pretending to be source truth
- a video editor bolted next to a manuscript editor with no shared model

## Current Live Reality

As of 2026-06-02:

- `nest.quipsly.com` serves the Quipsly workbench.
- `/` and `/create` render the book editor/tagger workbench.
- `/editor` is the video editor surface.
- `/notebooks` creates and opens persisted writing notebooks.
- `/files` and `/study` provide lightweight workspace hubs.
- `?publisher=1` enables the hidden Publisher Mode overlay in the browser.
- The current workbench uses real DB records but still has a temporary
  textarea/block editor that must be replaced or wrapped by the kernel path.

## Guiding Sentence

Quipsly is a notebook that understands what you are making, remembers it
durably, finds relevant examples with receipts, and projects the same source
into books, episodes, clips, articles, notes, and publishing packets.
