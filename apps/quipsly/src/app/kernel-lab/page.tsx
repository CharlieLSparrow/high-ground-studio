import Link from "next/link";
import {
  applyOperation,
  createBenjaminFranklinFixture,
  createDocumentFromStudioProjection,
  getAgentVisibleContext,
  projectDocumentToStudioProjection,
  validateDocument,
} from "@high-ground/quipsly-document-kernel";

export const dynamic = "force-dynamic";

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <section className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
      <h2 className="font-serif text-xl font-bold text-[#342618]">{title}</h2>
      <pre className="mt-4 max-h-[420px] overflow-auto rounded-xl bg-[#1f1a14] p-4 text-xs leading-5 text-[#f8f3e6]">
        {JSON.stringify(value, null, 2)}
      </pre>
    </section>
  );
}

export default function KernelLabPage() {
  const fixture = createBenjaminFranklinFixture();
  const splitOffset = fixture.nodes[0].text.indexOf("Benjamin Franklin");
  const splitResult = applyOperation(fixture, {
    type: "splitNode",
    nodeId: "node-opening",
    offset: splitOffset,
    newNodeId: "node-franklin-quote",
  });
  const validation = validateDocument(splitResult.document);
  const context = getAgentVisibleContext(splitResult.document, {
    nodeId: "node-franklin-quote",
  });

  const studioDocument = createDocumentFromStudioProjection({
    documentId: "studio-bridge-fixture",
    title: "Current Workbench Bridge Fixture",
    now: "2026-06-02T00:00:00.000Z",
    blocks: [
      {
        id: "studio-block-setup",
        text: "Setup before quote. Benjamin Franklin quote goes here.",
        order: 0,
      },
    ],
    spans: [
      {
        id: "studio-span-quote",
        blockId: "studio-block-setup",
        tagSlug: "quote",
        label: "Quote",
        startOffset: 20,
        endOffset: 52,
      },
    ],
  });
  const studioSplit = applyOperation(studioDocument, {
    type: "splitNode",
    nodeId: "studio-block-setup",
    offset: 20,
    newNodeId: "studio-block-quote",
  });
  const studioProjection = projectDocumentToStudioProjection(studioSplit.document);

  return (
    <main className="min-h-screen bg-[#fdfaf6] px-6 py-10 text-[#3d3122]">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#a36f2e]">
              Quipsly / Kernel Lab
            </div>
            <h1 className="mt-2 font-serif text-4xl font-bold">
              The kernel keeps meaning attached when text moves.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#6b5b45]">
              This lab proves the first hard case: split a paragraph before a
              quote, keep the quote annotation on the quote text, and project
              the result back into block/span records.
            </p>
          </div>
          <Link
            href="/?publisher=1"
            className="rounded-full border border-[#c8a66b] bg-[#3d3122] px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#59442d]"
          >
            Back to Workbench
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a7659]">
              Nodes after split
            </div>
            <div className="mt-2 font-serif text-3xl font-bold">
              {splitResult.document.nodes.length}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a7659]">
              Projected spans
            </div>
            <div className="mt-2 font-serif text-3xl font-bold">
              {splitResult.projection.taggedSpans.length}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e8dcc4] bg-white p-5 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-[#8a7659]">
              Validation
            </div>
            <div className="mt-2 font-serif text-3xl font-bold">
              {validation.ok ? "Clean" : "Needs work"}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          <JsonPanel title="Kernel document after split" value={splitResult.document} />
          <JsonPanel title="Kernel projection" value={splitResult.projection} />
          <JsonPanel title="Agent-visible context" value={context} />
          <JsonPanel title="Studio block/span bridge output" value={studioProjection} />
        </div>
      </div>
    </main>
  );
}
