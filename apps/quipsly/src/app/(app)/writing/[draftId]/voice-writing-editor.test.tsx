/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { VoiceWritingEditor } from "./voice-writing-editor";

const router = { replace: jest.fn(), refresh: jest.fn() };
const chain = new Proxy({ run: () => true }, {
  get(target, property) {
    if (property in target) return target[property as keyof typeof target];
    return () => chain;
  },
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

    render(<VoiceWritingEditor draftId={draftId} />);

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

    render(<VoiceWritingEditor draftId={draftId} />);

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
