/** @jest-environment jsdom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { useQuipslyAssistant } from "./useQuipslyAssistant";
import { applyAssistantDocumentEditAction } from "@/app/(app)/create/actions";

jest.mock("@/app/(app)/create/actions", () => ({ applyAssistantDocumentEditAction: jest.fn() }));

const props = { projectSlug: "writing", documentId: "doc-1", documentTitle: "My writing", visibleBlocks: [],
  activeView: { id: "default", name: "All" } as any };
const receipt = { actionId: "action-1", operationId: "operation-1", projectId: "project-1", documentId: "doc-1",
  blockId: "block-2", kind: "draft", text: "A clear opening.", insertAfterBlockId: null };
const originalFetch = global.fetch;
beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { global.fetch = originalFetch; });

it("shows a server-saved draft in the editor without requiring or duplicating Apply", async () => {
  const listener = jest.fn();
  window.addEventListener("quipsly:assistant-edit-applied", listener);
  global.fetch = jest.fn(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? {
    ok: true, sessionId: "session-1", assistantMessage: "Here is the opening.", documentEdits: [receipt],
    toolIntents: [{ id: "action-1", kind: "PROPOSE_DRAFT", label: "Opening", payload: { draftText: receipt.text }, status: "applied" }],
  } : { ok: true, actions: [] } })) as unknown as typeof fetch;
  try {
    const { result } = renderHook(() => useQuipslyAssistant(props));
    await act(async () => { result.current.setMessage("Write an opening paragraph."); });
    await act(async () => { await result.current.askAssistant(); });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual(receipt);
    expect(result.current.actions[0].status).toBe("applied");
    expect(applyAssistantDocumentEditAction).not.toHaveBeenCalled();
  } finally { window.removeEventListener("quipsly:assistant-edit-applied", listener); }
});

it("keeps the prompt retryable without claiming a write when AI is unavailable", async () => {
  global.fetch = jest.fn(async (_url, init) => ({ ok: init?.method !== "POST", json: async () => init?.method === "POST" ? {
    ok: false, error: "AI writing is unavailable right now. Your page is unchanged.",
  } : { ok: true, actions: [] } })) as unknown as typeof fetch;
  const listener = jest.fn();
  window.addEventListener("quipsly:assistant-edit-applied", listener);
  try {
    const { result } = renderHook(() => useQuipslyAssistant(props));
    await act(async () => { result.current.setMessage("Write an opening paragraph."); });
    await act(async () => { await result.current.askAssistant(); });
    expect(result.current.warning).toMatch(/page is unchanged/i);
    expect(result.current.message).toBe("Write an opening paragraph.");
    expect(result.current.actions).toEqual([]);
    expect(listener).not.toHaveBeenCalled();
    expect(applyAssistantDocumentEditAction).not.toHaveBeenCalled();
  } finally { window.removeEventListener("quipsly:assistant-edit-applied", listener); }
});

it("does not execute historical unchosen edits merely because a page was reopened", async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, sessionId: "older-session",
    actions: [{ id: "older-action", kind: "PROPOSE_REWRITE", status: "proposed", payload: {}, label: "Old suggestion" }],
  }) })) as unknown as typeof fetch;
  const { result } = renderHook(() => useQuipslyAssistant(props));
  await waitFor(() => expect(result.current.actions).toHaveLength(1));
  expect(applyAssistantDocumentEditAction).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
