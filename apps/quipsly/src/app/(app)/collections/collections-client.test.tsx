import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { filePersonalSourceIntoResearchAction } from "./actions";
import { CollectionsClient } from "./collections-client";
import type { CollectionsSnapshot } from "./collections-model";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock("./actions", () => ({ filePersonalSourceIntoResearchAction: jest.fn() }));

const mockFileAction = filePersonalSourceIntoResearchAction as jest.MockedFunction<typeof filePersonalSourceIntoResearchAction>;

const snapshot: CollectionsSnapshot = {
  state: "ready",
  authState: "signed-in",
  collections: [],
  writableResearchProjects: [{ id: "project-1", slug: "high-ground", name: "High Ground Odyssey" }],
  items: [
    { id: "mobile-source-1", itemType: "bookmark", collectionId: null, collectionName: null, title: "Captured interview", excerpt: "Saved bookmark", note: null, sourceUrl: "https://example.com/interview", sourceLabel: "example.com", updatedAt: "2026-07-19T16:00:00.000Z", lastCapturedAt: "2026-07-19T17:00:00.000Z", captureCount: 2, captureHistory: [{ id: "receipt-2", capturedAt: "2026-07-19T17:00:00.000Z", title: "Captured interview revisited" }, { id: "receipt-1", capturedAt: "2026-07-19T16:00:00.000Z", title: "Captured interview" }], researchFilings: [] },
    { id: "older-source", itemType: "snippet", collectionId: null, collectionName: null, title: "Older passage", excerpt: "Another source", note: null, sourceUrl: null, sourceLabel: "No source URL saved", updatedAt: "2026-07-19T15:00:00.000Z", lastCapturedAt: "2026-07-19T15:00:00.000Z", captureCount: 1, captureHistory: [], researchFilings: [] },
  ],
};

describe("Collections Inbox continuation", () => {
  it("opens the exact actor-visible source and can deliberately return to all saved sources", async () => {
    const user = userEvent.setup();
    render(<CollectionsClient snapshot={snapshot} initialCaptureId="mobile-source-1" />);

    expect(screen.getByText(/Opened the exact personal source selected in Inbox/i)).toBeInTheDocument();
    expect(screen.getByText("Captured interview")).toBeInTheDocument();
    expect(screen.queryByText("Older passage")).not.toBeInTheDocument();
    expect(document.getElementById("saved-source-mobile-source-1")).toBeInTheDocument();
    expect(screen.getByText("Captured 2 times")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show all saved sources" }));
    expect(screen.getByText("Older passage")).toBeInTheDocument();
  });

  it("files only after an explicit Nest choice and continues at the canonical Research source", async () => {
    const user = userEvent.setup();
    mockFileAction.mockResolvedValueOnce({
      ok: true,
      filingId: "filing-1",
      sourceUnitId: "source-unit-1",
      projectId: "project-1",
      projectSlug: "high-ground",
      projectName: "High Ground Odyssey",
      captureId: "mobile-source-1",
      captureType: "BOOKMARK",
      reused: false,
      href: "/research?source=source-unit-1",
      annotation: null,
    });
    render(<CollectionsClient snapshot={snapshot} initialCaptureId="mobile-source-1" />);

    expect(screen.getByText(/Your private capture stays unchanged/i)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Destination Nest/i })).toHaveValue("high-ground");
    await user.click(screen.getByRole("button", { name: "File into Research" }));

    expect(mockFileAction).toHaveBeenCalledWith(expect.objectContaining({
      captureId: "mobile-source-1",
      captureType: "BOOKMARK",
      projectSlug: "high-ground",
      clientRequestId: expect.any(String),
    }));
    expect(mockPush).toHaveBeenCalledWith("/research?source=source-unit-1");
  });
});
