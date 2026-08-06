import "@testing-library/jest-dom";

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TranscriptTerminologyDesk } from "./TranscriptTerminologyDesk";

describe("TranscriptTerminologyDesk", () => {
  beforeEach(() => { jest.restoreAllMocks(); });
  afterEach(() => { delete (global as { fetch?: unknown }).fetch; });

  it("makes terminology provenance and future-attempt behavior visible", async () => {
    const onActiveVocabularyChange = jest.fn();
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({
      ok: true,
      terms: [{ id: "term_quipsly_001", canonicalText: "Quipsly", aliases: ["Quip-sly"], category: "brand", pronunciationHint: "quip-slee", contextHint: "Product name", priority: 100, status: "active", revision: 2, updatedAt: "2026-08-06T12:00:00.000Z" }],
      candidates: [],
      activeRevisionToken: "new-revision-token",
      activeTermCount: 1,
    }));
    render(<TranscriptTerminologyDesk projectId="project_terminology_001" projectSlug="high-ground-odyssey" canWrite transcriptRevisionToken="old-revision-token" transcriptApplied onActiveVocabularyChange={onActiveVocabularyChange} />);
    expect(await screen.findByRole("heading", { name: "Project terminology memory" })).toBeInTheDocument();
    expect(await screen.findByText("Quipsly")).toBeInTheDocument();
    expect(screen.getByText("New attempt available")).toBeInTheDocument();
    expect(screen.getByText(/later edits never rewrite old provider evidence/i)).toBeInTheDocument();
    expect(onActiveVocabularyChange).toHaveBeenCalledWith("new-revision-token");
  });

  it("creates a preferred spelling through the authenticated vocabulary API", async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, terms: [], candidates: [], activeRevisionToken: null, activeTermCount: 0 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, term: { id: "term_homer_0001" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, terms: [{ id: "term_homer_0001", canonicalText: "Homer", aliases: ["Scott Sparrow"], category: "person", pronunciationHint: null, contextHint: null, priority: 90, status: "active", revision: 1, updatedAt: "2026-08-06T12:00:00.000Z" }], candidates: [], activeRevisionToken: "revision-homer", activeTermCount: 1 }));
    global.fetch = fetchMock;
    render(<TranscriptTerminologyDesk projectId="project_terminology_001" projectSlug="high-ground-odyssey" canWrite transcriptRevisionToken={null} transcriptApplied={false} onActiveVocabularyChange={jest.fn()} />);
    await screen.findByText(/No preferred spellings yet/i);
    await user.type(screen.getByLabelText("Preferred spelling"), "Homer");
    await user.type(screen.getByLabelText("Aliases, comma separated"), "Scott Sparrow");
    await user.selectOptions(screen.getByLabelText("Category"), "person");
    await user.click(screen.getByRole("button", { name: "Add to future transcripts" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const mutation = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(mutation).toMatchObject({ operation: "create", canonicalText: "Homer", aliases: ["Scott Sparrow"], category: "person" });
    expect(await screen.findByText("Homer")).toBeInTheDocument();
  });

  it("distinguishes a queued matching snapshot from provider-applied evidence", async () => {
    global.fetch = jest.fn().mockResolvedValue(jsonResponse({ ok: true, terms: [{ id: "term_quipsly_001", canonicalText: "Quipsly", aliases: [], category: "brand", pronunciationHint: null, contextHint: null, priority: 50, status: "active", revision: 1, updatedAt: "2026-08-06T12:00:00.000Z" }], candidates: [], activeRevisionToken: "revision-current", activeTermCount: 1 }));
    render(<TranscriptTerminologyDesk projectId="project_terminology_001" projectSlug="high-ground-odyssey" canWrite transcriptRevisionToken="revision-current" transcriptApplied={false} onActiveVocabularyChange={jest.fn()} />);
    expect(await screen.findByText("Snapshot queued")).toBeInTheDocument();
    expect(screen.getByText("Waiting for a matching provider receipt.")).toBeInTheDocument();
  });
});

function jsonResponse(value: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => value } as Response;
}
