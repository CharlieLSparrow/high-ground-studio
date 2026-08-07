# Episode evidence workspace — 2026-08-07

## Outcome

The canonical Episode collaboration workspace now owns the first professional
inspection layer required for browser editing:

- an exact attached source selector when multiple released recordings exist;
- source-clock transcript navigation without invented timing;
- waveform and frequency evidence from the selected released source;
- an embedded transcript review desk when the selected Studio source owns the
  protected correction contract;
- actual processing-job status and explicitly recorded execution lanes;
- a retained link to Advanced Studio for heavyweight native work.

The browser is the product surface. Native Mac, browser-local, and cloud workers
are execution options behind the same Episode graph rather than separate copies
of the project.

## Boundary learned through retained dogfood

A completed source transcript is not automatically an Episode paper edit.
Independent recordings may have different source clocks, so Quipsly must bind or
align the source before projecting its words onto the Episode timeline. The UI
now exposes that ambiguity and lets the editor choose the exact source; it does
not silently treat a completed job as proof of Episode-level alignment.

## Verification

- retained signed-in Episode opened with 14 sources, 13 proxies, program
  decisions, one Shared Watch derivative, and four real transcript jobs;
- ambiguous signal evidence remained held until an exact released source was
  selected;
- focused inspection and Episode UI tests passed;
- complete Quipsly Jest run passed (399 suites, 2,078 tests; 44 suites and 139
  tests intentionally skipped);
- TypeScript validation passed;
- production Next.js build passed and enumerated 191 routes.

## Next product slice

Materialize selected/aligned source transcript timing into the shared Episode
paper edit, then add browser-local proxy caching and a visible execution chooser
that explains cost, speed, fidelity, and availability without exposing worker
implementation details during ordinary editing.
