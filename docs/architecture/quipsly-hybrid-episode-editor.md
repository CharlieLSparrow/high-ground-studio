# Quipsly hybrid Episode editor

Status: accepted direction, incremental delivery
Date: 2026-08-06

## Decision

The Episode collaboration space is the primary editing product. Recording, transcript editing, media review, timeline work, comments, finishing decisions, and publishing preparation must feel like one workspace at one stable Episode URL.

The browser, native Mac editor, iPhone app, and cloud workers are execution surfaces over the same canonical edit graph. They are not separate products and must not own competing timelines.

The user chooses an editing intent; Quipsly chooses the cheapest capable executor and shows where work is running, what bytes it read, what it produced, what it cost, and how to retry or move the job elsewhere.

## Why

Riverside keeps high-quality participant tracks locally during capture, uploads them, and provides browser-native transcript and timeline editing. Its cloud recording is explicitly a lower-quality reference/backup while local tracks remain the high-quality source. Descript exposes the same editing model in web and desktop apps, automatically syncs work to its cloud, and unifies script, scene, timeline, and media panels. These products demonstrate that users expect the project page itself to be editable; forcing them to understand a separate local-editor product boundary would be a Quipsly UX defect.

Quipsly should go further: keep the unified web experience while making local, native, and cloud compute interchangeable, inspectable execution choices.

Official references:

- [Riverside recording file types](https://support.riverside.fm/hc/en-us/articles/5260131045917-Video-and-audio-file-formats-Overview)
- [Riverside cloud recordings](https://support.riverside.fm/hc/en-us/articles/5260156003485-About-cloud-recording-files)
- [Riverside collaboration and editing](https://support.riverside.fm/hc/en-us/articles/7770433089821-How-can-I-share-my-track-file-recordings-with-an-editor-or-other-collaborator)
- [Descript editor interface](https://help.descript.com/hc/en-us/articles/37585546799757-The-editor-interface)
- [Descript sequence model](https://help.descript.com/hc/en-us/articles/10256430454925-Sequence-overview)
- [Descript cloud synchronization](https://help.descript.com/hc/en-us/articles/13520561812237-Save-your-work-to-the-cloud)
- [WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)
- [Origin private file system](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

## Product surface

An Episode space owns six connected modes:

1. **Plan** — rundown, manuscript, research, clips, guests, tasks, calendar, and readiness.
2. **Record** — call, device preflight, local high-quality capture, clip playback, upload health, and recovery.
3. **Edit** — transcript, program timeline, scene/layout canvas, media library, audio map, and automated proposals.
4. **Review** — anchored comments, A/B comparisons, version history, approvals, and requested changes.
5. **Finish** — mastering, captions, chapters, artwork, show notes, clips, delivery encodes, and proof-listen.
6. **Publish** — destination metadata, enclosure hosting, schedule, explicit release, and destination receipts.

Chat, people, activity, search, and task creation remain reachable in every mode. A comment or task can target an Episode, version, transcript range, timeline range, source-clock moment, clip, or exact derived artifact.

The iPhone app emphasizes Plan, Record, upload recovery, lightweight transcript/timeline review, comments, and approvals. The responsive web surface supports meaningful mobile review, but does not pretend a phone-sized multitrack timeline is the best precision editor.

## Canonical data model

The canonical edit is a non-destructive, append-only edit graph:

- immutable source identities and byte evidence;
- shared-clock source placements and synchronization receipts;
- transcript segments and word timing with provider and human provenance;
- program sequence operations such as trim, split, reorder, mute, gain, layout, and scene boundaries;
- proposals, review receipts, promotions, and withdrawals;
- materialized timeline projections for fast reads;
- immutable preview, master, delivery, and publication artifacts.

Every surface reads and writes this graph through stable operations with actor, request id, base revision, and deterministic digest. Native and cloud executors materialize the graph; they never become the source of timeline truth.

## Four execution lanes

### Browser interaction lane

Always available for timeline/transcript editing, comments, review, waveform display, proxy playback, metadata, and small deterministic transformations. Preview should begin from streamed proxies and range requests without waiting for originals.

### Browser local-compute lane

Dedicated workers may use Web Audio, WebCodecs, Canvas, WebAssembly, and OPFS for waveform analysis, thumbnails, proxy caching, small preview renders, and supported exports. Capability probes decide whether a codec and workload are safe. WebCodecs supplies low-level hardware-assisted encode/decode but not container muxing; muxing and exact-output verification remain explicit components. OPFS is a cache, never the sole copy of canonical media, because it is quota-bound and disappears when site storage is cleared.

### Native execution lane

The Mac app handles long 4K timelines, large local disks, external media, advanced color/audio tools, and high-throughput exports. It subscribes to the same job and edit contracts, reports progress to the Episode space, and registers immutable results back into the shared lineage. Opening the native app is an optimization, not a context switch into another project model.

### Cloud execution lane

Cloud workers handle unattended jobs, shared review renders, mobile-originated work, server-only providers, and reproducible release artifacts. Jobs start at zero idle capacity when possible, use content-addressed cache keys, and publish measured cost and byte evidence. Expensive work requires a visible estimate and policy decision, not a mysterious spinner.

## Execution router

Each materialization request declares:

- operation and exact edit revision;
- source identities, codec/resolution/duration, and required output profile;
- deadline and interactivity class;
- privacy, device, and destination constraints;
- available local/native/cloud capabilities;
- estimated transfer, compute, storage, and latency cost.

The router chooses in this order unless policy overrides it:

1. reuse an exact verified artifact;
2. execute locally in the browser when capability and storage are sufficient;
3. execute through an available native worker;
4. execute in the cloud.

The UI shows the chosen lane and lets an authorized user move a queued job to another lane without changing its canonical request identity.

## UX rules

- One Episode URL; mode switches preserve selection, playhead, and collaborator context.
- Transcript, timeline, waveform, canvas, and comments share one playhead and selection model.
- Default to story-level editing; reveal per-track precision only when needed.
- Autosave canonical operations immediately; render previews asynchronously.
- Never block ordinary editing on a full-resolution download or a final render.
- Make upload, cache, proxy, render, and sync health visible but calm.
- Preserve originals and every promoted version; undo writes a new operation.
- Distinguish technical playback evidence from subjective editorial approval.
- Make costs observable by job and Episode without turning every action into an approval ceremony.

## Delivery sequence

### Now

- Embed existing transcript, audio program, versioned output, chat, and task surfaces into the Episode workspace shell.
- Route all “open exact review” actions to the correct in-workspace mode.
- Share selection and playhead state between transcript, waveform, and timeline components.
- Keep the current native editor operating on the same Episode and edit revision.

### Next

- Introduce a canonical edit-operation API and materialized projection if any remaining editor mutations still write opaque timeline blobs.
- Build proxy-first multitrack playback with byte-range delivery and synchronized audio/video clocks.
- Add anchored collaboration, presence, review assignments, and compare/revert UI.
- Add the execution router and native-worker heartbeat/capability registry.

### Then

- Add browser-worker waveform, thumbnail, and short-preview pipelines backed by OPFS cache.
- Add cloud/native interchangeable render jobs with preflight cost estimates and exact artifact receipts.
- Add transcript-first rough cut, automated multicam proposals, silence/filler proposals, audio repair proposals, layouts, captions, and brand presets.
- Add explicit publishing destinations only after version, metadata, enclosure, and proof gates converge.

## Non-goals

- A second browser-only timeline schema.
- Uploading all original media before any editing can begin.
- Requiring the Mac app for ordinary collaborative edits.
- Treating a client cache, proxy, cloud recording, or render as source truth.
- Hiding execution cost by making every operation cloud-only.
- Letting AI silently rewrite the canonical timeline or source media.
