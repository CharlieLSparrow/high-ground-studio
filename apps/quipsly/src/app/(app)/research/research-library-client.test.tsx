import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("./actions", () => ({
  createSourceAnnotationAction: jest.fn(),
  createWritingDraftFromAnnotationAction: jest.fn(),
  setSourceAnnotationStatusAction: jest.fn(),
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }));

import { ResearchLibraryClient } from "./research-library-client";
import type { ResearchLibrarySnapshot } from "./research-library-model";

const readySnapshot: ResearchLibrarySnapshot = {
  state: "ready",
  authState: "signed-in",
  accessibleNestCount: 2,
  projects: [{ id: "project-1", name: "High Ground", slug: "high-ground", canWrite: true }],
  sources: [{
    id: "source-1",
    title: "Preserved production essay",
    kind: "article",
    author: "Charlie",
    sourceUrl: "https://example.com/source",
    sourcePath: null,
    immutableText: "Keep the source intact and let decisions live around it.",
    contentTruncated: false,
    projectName: "High Ground",
    projectSlug: "high-ground",
    canWrite: true,
    tagCatalog: [{ id: "tag-1", label: "Episode seed", slug: "episode-seed" }],
    annotations: [{
      id: "annotation-1",
      kind: "question",
      status: "active",
      visibility: "private",
      body: "Could this become the opening tension?",
      exactText: "Keep the source intact and let decisions live around it.",
      startOffset: 0,
      endOffset: 57,
      tagLabels: ["Episode seed"],
      createdByMe: true,
      updatedAt: "2026-07-18T12:00:00.000Z",
      writingUses: [],
    }],
    personalCaptureOrigin: {
      captureType: "BOOKMARK",
      captureId: "bookmark-1",
      filedAt: "2026-07-18T11:00:00.000Z",
      ownedByMe: true,
    },
    updatedAt: "2026-07-18T12:00:00.000Z",
  }],
  packets: [{
    id: "packet-1",
    title: "Leadership source packet",
    kind: "research-packet",
    status: "needs-review",
    projectName: "High Ground",
    projectSlug: "high-ground",
    documentTitle: "Episode notes",
    hasLineage: true,
    approvedAt: null,
    updatedAt: "2026-07-18T12:00:00.000Z",
  }],
  evidence: [{
    id: "node-1",
    title: "Systems evidence",
    excerpt: "The source describes a calm way to reduce systems anxiety.",
    sourceLabel: "Essay transcript",
    sourcePath: null,
    tagLabel: "Product philosophy",
    nodeType: "source-note",
    reviewStatus: "draft",
    projectionStatus: "projection-not-approved",
    projectName: "Quipsly",
    projectSlug: "quipsly",
    documentTitle: "Philosophy draft",
    updatedAt: "2026-07-18T12:00:00.000Z",
  }],
};

describe("ResearchLibraryClient", () => {
  it("opens a Search All handoff with the matching research query already applied", () => {
    render(<ResearchLibraryClient snapshot={readySnapshot} initialQuery="Preserved production essay" />);
    expect(screen.getByRole("searchbox", { name: /Search loaded evidence and packets/i })).toHaveValue("Preserved production essay");
    expect(screen.getByText("Preserved production essay")).toBeInTheDocument();
    expect(screen.queryByText("Leadership source packet")).not.toBeInTheDocument();
  });

  it("continues from Library at the exact source identity without mixing in unrelated records", async () => {
    const user = userEvent.setup();
    render(<ResearchLibraryClient snapshot={readySnapshot} initialSourceId="source-1" />);

    expect(screen.getByText(/Opened the exact preserved source selected in Library/i)).toBeInTheDocument();
    expect(screen.getByText("Preserved production essay")).toBeInTheDocument();
    expect(screen.queryByText("Leadership source packet")).not.toBeInTheDocument();
    expect(screen.queryByText("Systems evidence")).not.toBeInTheDocument();
    expect(document.getElementById("research-source-source-1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all research" }));
    expect(screen.getByText("Leadership source packet")).toBeInTheDocument();
    expect(screen.getByText("Systems evidence")).toBeInTheDocument();
  });

  it("returns from writing to the exact saved annotation with semantic and keyboard focus", async () => {
    render(
      <ResearchLibraryClient
        snapshot={readySnapshot}
        initialSourceId="source-1"
        initialAnnotationId="annotation-1"
      />,
    );

    const annotation = document.getElementById("research-annotation-annotation-1");
    expect(annotation).toHaveAttribute("aria-current", "true");
    expect(annotation).toHaveTextContent("Exact saved annotation opened from writing");
    await waitFor(() => expect(annotation).toHaveFocus());
    expect(screen.queryByText("Leadership source packet")).not.toBeInTheDocument();
  });

  it("labels connected records as live and filters only the loaded records", async () => {
    const user = userEvent.setup();
    render(<ResearchLibraryClient snapshot={readySnapshot} />);

    expect(screen.getByText(/Nothing below is representative or demo content/i)).toBeInTheDocument();
    expect(screen.getByText("Leadership source packet")).toBeInTheDocument();
    expect(screen.getByText("Preserved production essay")).toBeInTheDocument();
    expect(screen.getByText("Source unchanged")).toBeInTheDocument();
    expect(screen.getByText(/Filed deliberately from a personal link capture/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open my original capture" })).toHaveAttribute("href", "/collections?capture=bookmark-1");
    expect(screen.getByRole("button", { name: /Start private draft with this evidence/i })).toBeInTheDocument();
    expect(screen.getByText("No approval timestamp is recorded for this packet.")).toBeInTheDocument();
    expect(screen.getByText("Systems evidence")).toBeInTheDocument();
    expect(screen.getByText("Projection: Projection Not Approved")).toBeInTheDocument();
    expect(screen.getByLabelText(/Choose Quipsly research JSON/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validate restore plan" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Prepare Research Packet/i })).not.toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: /Search loaded evidence and packets/i }), "essay transcript");

    expect(screen.queryByText("Leadership source packet")).not.toBeInTheDocument();
    expect(screen.getByText("Systems evidence")).toBeInTheDocument();
    expect(screen.getByText(/Showing 0 preserved sources, 0 saved packets, and 1 evidence record/i)).toBeInTheDocument();
  });

  it("does not substitute sample packets when persistence is unavailable", () => {
    render(<ResearchLibraryClient snapshot={{
      state: "unavailable",
      authState: "signed-in",
      message: "The workspace database connection is unavailable.",
    }} />);

    expect(screen.getByRole("heading", { name: /Nothing here has been replaced with sample work/i })).toBeInTheDocument();
    expect(screen.getByText(/Persistence state: unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText("Leadership source packet")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prepare Research Packet/i })).not.toBeInTheDocument();
  });

  it("loads pasted portable JSON locally when the file picker is unavailable", async () => {
    const user = userEvent.setup();
    render(<ResearchLibraryClient snapshot={readySnapshot} />);

    await user.click(screen.getByText("Can't choose a file? Paste portable JSON"));
    fireEvent.change(screen.getByRole("textbox", { name: "Paste Quipsly research JSON" }), {
      target: { value: JSON.stringify({ schemaVersion: "quipsly-research-export-v1" }) },
    });
    await user.click(screen.getByRole("button", { name: "Load pasted JSON" }));

    expect(screen.getByRole("status")).toHaveTextContent(/Bundle loaded locally/i);
    expect(screen.getByRole("button", { name: "Validate restore plan" })).toBeEnabled();
  });

  it("shows an honest empty state instead of representative content", () => {
    render(<ResearchLibraryClient snapshot={{
      state: "ready",
      authState: "local-operator",
      accessibleNestCount: 0,
      projects: [],
      sources: [],
      packets: [],
      evidence: [],
    }} />);

    expect(screen.getByText("No saved research packets yet.")).toBeInTheDocument();
    expect(screen.getByText("No source evidence has been indexed for these Nests.")).toBeInTheDocument();
    expect(screen.getByText(/Local read-only · Persistence connected/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose a source Nest/i })).toHaveAttribute("href", "/projects");
  });

  it("does not expose mutation or private export controls in a local read-only snapshot", () => {
    const localSnapshot: ResearchLibrarySnapshot = {
      ...readySnapshot,
      authState: "local-operator",
      projects: readySnapshot.projects.map((project) => ({ ...project, canWrite: false })),
      sources: readySnapshot.sources.map((source) => ({
        ...source,
        canWrite: false,
        annotations: source.annotations.map((annotation) => ({ ...annotation, createdByMe: false })),
      })),
    };

    render(<ResearchLibraryClient snapshot={localSnapshot} />);

    expect(screen.getByRole("heading", { name: "Read preserved sources" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { name: "Read-only source view" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Sign in to annotate" })).toHaveAttribute("href", "/login?callbackUrl=/research");
    expect(screen.queryByRole("textbox", { name: "Note" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Save source-linked annotation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Start private draft/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Export High Ground/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Sign in before Quipsly exposes an export/i)).toBeInTheDocument();
  });
});
