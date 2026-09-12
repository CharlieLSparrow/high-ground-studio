/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { VoiceWritingEditor } from "./voice-writing-editor";
jest.mock("@/components/document-tags", () => ({ DocumentTags: ({ documentId, actorId }: { documentId: string; actorId: string }) => <div data-testid="document-tags" data-document={documentId} data-actor={actorId} /> }));

const router = { replace: jest.fn(), refresh: jest.fn() };
const chain = new Proxy({ run: () => true }, {
  get(target, property) {
    if (property in target) return target[property as keyof typeof target];
    return () => chain;
  },
});

describe("VoiceWritingEditor save recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
  });
  afterEach(() => { jest.useRealTimers(); });

  async function advance(milliseconds: number) {
    await act(async () => { await jest.advanceTimersByTimeAsync(milliseconds); });
  }

  async function openWithFailure(status?: number, retryAfter?: string) {
    const payload = loadPayload();
    const fetchMock = jest.fn().mockImplementation(async (_url: string, options?: RequestInit) => {
      if (!options?.method) return { ok: true, json: async () => payload };
      if (!status) throw new TypeError("Failed to fetch");
      return { ok: false, status, headers: new Headers(retryAfter ? { "Retry-After": retryAfter } : {}), json: async () => ({
        ok: false, error: "Could not save", ...(status === 409 ? { code: "VOICE_WRITING_CONFLICT", current: payload.drafts[0] } : {}),
      }) };
    });
    globalThis.fetch = fetchMock;
    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);
    await screen.findByLabelText("Writing title");
    fireEvent.change(screen.getByLabelText("Writing title"), { target: { value: "Keep these new words" } });
    await advance(900);
    return fetchMock;
  }

  it("backs off failed saves, keeps new edits, and stops after three automatic retries", async () => {
    const fetchMock = await openWithFailure();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByLabelText("Writing title"), { target: { value: "Still writing while offline" } });
    await advance(900);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(1100);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await advance(5000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await advance(15000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await advance(60000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(screen.getByLabelText("Writing title")).toHaveValue("Still writing while offline");
    expect(screen.getByRole("button", { name: "Save again" })).toBeEnabled();
  });

  it("does not retry a rejected request until explicitly asked, then saves the retained writing", async () => {
    const fetchMock = await openWithFailure(400);
    await advance(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockImplementation(async (_url, options) => ({ ok: true, json: async () => ({
      ok: true, draft: { ...loadPayload().drafts[0], title: JSON.parse(String(options?.body)).title, serverRevision: 3, contentRevision: "revision-3" },
    }) }));
    fireEvent.click(screen.getByRole("button", { name: "Save again" }));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({ title: "Keep these new words", sources: loadPayload().drafts[0].sources });
    expect(screen.queryByRole("button", { name: "Save again" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });

  it("honors the server rate-limit delay", async () => {
    const fetchMock = await openWithFailure(429, "60");
    fireEvent(window, new Event("online"));
    await advance(59999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("bounds a stalled request and keeps the writing available for recovery", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({ok: true, json: async () => loadPayload()})
      .mockImplementation((_url, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
    globalThis.fetch = fetchMock;
    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);
    await screen.findByLabelText("Writing title");
    fireEvent.change(screen.getByLabelText("Writing title"), {target: {value: "Keep this thought through a stalled connection"}});
    await advance(900);
    await advance(20000);
    expect(fetchMock.mock.calls[1][1].signal.aborted).toBe(true);
    expect(screen.getByRole("alert")).toHaveTextContent("Saving is taking longer than expected");
    expect(screen.getByLabelText("Writing title")).toHaveValue("Keep this thought through a stalled connection");
    await advance(2000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a conflict paused even when the person continues typing", async () => {
    const fetchMock = await openWithFailure(409);
    fireEvent.change(screen.getByLabelText("Writing title"), { target: { value: "My next thought" } });
    await advance(60000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Keep my version" })).toBeInTheDocument();
    expect(screen.getByLabelText("Writing title")).toHaveValue("My next thought");
  });

  it("tries again when connectivity returns after the automatic attempts are exhausted", async () => {
    const fetchMock = await openWithFailure();
    await advance(2000);
    await advance(5000);
    await advance(15000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    fireEvent(window, new Event("online"));
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("automatically saves a correction to a rejected input without an extra confirmation", async () => {
    const fetchMock = await openWithFailure(422);
    fireEvent.change(screen.getByLabelText("Writing title"), { target: { value: "Corrected input" } });
    await advance(900);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).title).toBe("Corrected input");
  });

  it("queues edits made during an in-flight save against the returned revision", async () => {
    const payload = loadPayload();
    let complete!: (value: unknown) => void;
    const fetchMock = jest.fn().mockResolvedValueOnce({ok: true, json: async () => payload})
      .mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
      .mockResolvedValueOnce({ok: true, json: async () => ({ok: true, draft: {...payload.drafts[0], serverRevision: 4, contentRevision: "revision-4"}})});
    globalThis.fetch = fetchMock;
    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);
    await screen.findByLabelText("Writing title");
    fireEvent.change(screen.getByLabelText("Writing title"), {target: {value: "First thought"}});
    await advance(900);
    fireEvent.change(screen.getByLabelText("Writing title"), {target: {value: "And a second thought"}});
    await advance(900);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => complete({ok: true, json: async () => ({ok: true, draft: {...payload.drafts[0], title: "First thought", serverRevision: 3, contentRevision: "revision-3"}})}));
    expect(screen.getByLabelText("Writing title")).toHaveValue("And a second thought");
    await advance(900);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toMatchObject({title: "And a second thought", expectedServerRevision: 3, expectedContentRevision: "revision-3"});
    expect(screen.getByRole("status")).toHaveTextContent("Saved");
  });
});
const editor = {
  commands: { setContent: jest.fn() },
  getJSON: () => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Draft body" }] }] }),
  getText: () => "Draft body",
  state: { doc: { descendants: jest.fn() } },
  chain: () => chain,
  can: () => chain,
  isActive: () => false,
};

jest.mock("next/navigation", () => ({ useRouter: () => router }));
jest.mock("@tiptap/react", () => ({
  EditorContent: () => <div aria-label="Paper or note">Draft body</div>,
  useEditor: () => editor,
}));
jest.mock("@tiptap/core", () => ({
  Mark: { create: () => ({}) },
  mergeAttributes: (...attributes: unknown[]) => Object.assign({}, ...attributes),
}));
jest.mock("@tiptap/starter-kit", () => ({}));

const draftId = "11111111-1111-4111-8111-111111111111";

function loadPayload(text = "Home is finishing his PhD.", acceptedCorrectionId: string | null = null) {
  return {
    ok: true,
    drafts: [{
      draftId,
      documentId: `voice-writing-${draftId}`,
      projectId: "project-home",
      projectName: "My Nest",
      projectSlug: "my-nest",
      visibility: "personal",
      title: "Dissertation opening",
      body: "Draft body",
      richText: null,
      localRevision: 2,
      serverRevision: 2,
      contentRevision: "revision-2",
      writingOrigin: "recorded",
      localRecordingId: "recording-1",
      transcriptClientRequestId: "request-1",
      sourceSha256: "a".repeat(64),
      callRoomId: "room-1",
      sources: [{
        localRecordingId: "recording-1",
        transcriptClientRequestId: "request-1",
        sourceSha256: "a".repeat(64),
        callRoomId: "room-1",
      }],
      tags: [],
      updatedAt: "2026-08-30T07:00:00.000Z",
    }],
    destinations: [{ id: "project-home", name: "My Nest", slug: "my-nest", role: "OWNER", isHome: true }],
    transcripts: [{
      transcriptClientRequestId: "request-1",
      transcriptJobId: "job-1",
      roomId: "room-1",
      recordingAssetId: "recording-asset-1",
      mediaUrl: "/api/sessions/room-1/recordings/recording-asset-1/media",
      language: "en-US",
      completedAt: "2026-08-30T07:00:00.000Z",
      segments: [{
        id: "segment-1",
        startSeconds: 4.2,
        endSeconds: 8.8,
        text,
        speakerLabel: "Homer",
        providerText: "Home is finishing his PhD.",
        providerSpeakerLabel: "Speaker 1",
        acceptedCorrectionId,
      }],
    }],
  };
}

describe("VoiceWritingEditor transcript correction", () => {
  it("connects spoken writing to the same actor-scoped document tag editor as notes", async () => {
    const payload = loadPayload();
    globalThis.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({...payload, drafts: [{...payload.drafts[0], tags: [
      {id: "research", slug: "research", label: "Research", hexColor: "#506b46", isActive: true},
      {id: "earlier", slug: "earlier", label: "Earlier focus", hexColor: "#866c52", isActive: false},
    ]}]})});
    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);
    const tags = await screen.findByTestId("document-tags");
    expect(tags).toHaveAttribute("data-document", payload.drafts[0].documentId);
    expect(tags).toHaveAttribute("data-actor", "writer");
    expect(screen.getByLabelText("Writing title")).toHaveValue("Dissertation opening");
  });

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: jest.fn().mockReturnValue({ matches: true }),
    });
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: jest.fn().mockReturnValue("correction-request-1"),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("plays the exact timed passage beside the writing without leaving the page", async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => loadPayload(),
    }) as unknown as typeof fetch;

    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);

    const passage = await screen.findByRole("button", { name: "Play passage at 0:04–0:08" });
    const audio = screen.getByLabelText("Original recording 1") as HTMLAudioElement;
    expect(audio).toHaveAttribute(
      "src",
      "/api/sessions/room-1/recordings/recording-asset-1/media",
    );
    fireEvent.click(passage);

    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());
    expect(audio.currentTime).toBe(4.2);
    expect(await screen.findByRole("button", { name: "Pause passage at 0:04–0:08" })).toBeInTheDocument();
  });

  it("corrects a timed passage beside the writing without entering a review desk", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => loadPayload(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
        ok: true,
        correction: {
          id: "correction-1",
          correctedText: "Homer is finishing his PhD.",
          correctedSpeakerLabel: "Homer",
        },
      }),
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    render(<VoiceWritingEditor draftId={draftId} actorId="writer" />);

    expect(await screen.findByText("Home is finishing his PhD.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Correct words" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Words" }), {
      target: { value: "Homer is finishing his PhD." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save correction" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const request = fetchMock.mock.calls[1];
    expect(request[0]).toBe("/api/mobile/capture/transcripts/corrections");
    expect(JSON.parse(String((request[1] as RequestInit).body))).toMatchObject({
      operation: "accept-human-correction",
      roomId: "room-1",
      segmentId: "segment-1",
      clientRequestId: "correction-request-1",
      expectedText: "Home is finishing his PhD.",
      expectedSpeakerLabel: "Speaker 1",
      expectedAcceptedCorrectionId: null,
      correctedText: "Homer is finishing his PhD.",
      correctedSpeakerLabel: "Homer",
      confirmedAgainstPlayback: false,
    });
    await waitFor(() => expect(screen.getByText((_content, element) => (
      element?.tagName === "SPAN"
        && element.textContent?.includes("Homer is finishing his PhD.") === true
    ))).toBeInTheDocument());
    expect(screen.queryByText("Correct passage · 0:04–0:08")).not.toBeInTheDocument();
  });
});
