import { render, screen, waitFor } from "@testing-library/react";

import { AudioMasteryWorkspaceClient } from "./audio-mastery-workspace-client";

const replace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

jest.mock("../editor/DialogueRepairDesk", () => ({
  DialogueRepairDesk: () => <div>Dialogue Repair workspace</div>,
}));

jest.mock("../editor/AudioMasteryAudition", () => ({
  AudioMasteryAudition: () => <div>Matched audition workspace</div>,
}));

const projects = [{
  id: "project-1",
  slug: "high-ground-odyssey",
  name: "High Ground Odyssey",
  role: "EDITOR" as const,
  episodes: [{
    id: "episode-1",
    slug: "episode-9",
    title: "Episode 9",
    status: "active",
    updatedAt: "2026-08-05T20:00:00.000Z",
  }],
}];

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response);
}

function inventory(released: boolean) {
  return {
    ok: true,
    project: { id: "project-1", slug: "high-ground-odyssey", name: "High Ground Odyssey" },
    episode: { found: true, id: "episode-1", slug: "episode-9", title: "Episode 9" },
    importedMedia: [{
      id: "asset-1",
      sourceId: "source-1",
      originalName: "Homer local master.wav",
      kind: "audio",
      contentType: "audio/wav",
      importRole: "local-audio-master",
      recordingAssetId: "recording-1",
      unresolvedRecordingReference: false,
      syncStatus: "synced",
      storage: { playbackUrl: "/api/media-vault/source/source-1" },
      asset: { readiness: { sourceSafe: true } },
      recording: { readiness: { mediaProcessingReleased: released, transcriptProcessingReleased: released } },
      safeNextAction: released ? "Review sync role and timeline use in the episode editor." : "Preserve only; media processing is held.",
    }],
    summary: { importedMediaCount: 1, audioCount: 1 },
    safeNextActions: [],
  };
}

function masteryStatus() {
  return {
    ok: true,
    jobId: null,
    status: "not-queued",
    profileId: null,
    sourceMeasurement: null,
    signalDiagnosis: null,
    proposal: null,
    derivative: null,
    review: { latest: null, approvalCount: 0, rejectionCount: 0 },
    promotion: { active: false, latest: null, activePromotion: null, promoteCount: 0, withdrawalCount: 0, candidatePlaybackUrl: null, boundaries: {} },
    delivery: { jobId: null, status: "not-queued", masteryJobId: null, promotionReceiptId: null, profileId: null, output: null, review: { latest: null, approvalCount: 0, rejectionCount: 0 }, promotionStillActive: false, error: null, updatedAt: null, boundaries: {} },
    error: null,
    updatedAt: null,
    boundaries: { originalRemainsSourceTruth: true, outputIsUnpromotedPreview: true, explicitApprovalStillRequired: true },
  };
}

describe("AudioMasteryWorkspaceClient", () => {
  beforeEach(() => {
    replace.mockReset();
  });

  it("opens a real episode source and exposes its source-to-delivery workflow", async () => {
    global.fetch = jest.fn((input) => String(input).includes("episode-inventory")
      ? response(inventory(true))
      : response(masteryStatus()));

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByRole("heading", { name: "Homer local master.wav" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Measure and prepare mastering preview/ })).toBeEnabled();
    expect(screen.getByLabelText("Audio delivery lifecycle")).toHaveTextContent("Measure");
    expect(screen.getByRole("link", { name: /Open video editor/ })).toHaveAttribute("href", "/editor?project=high-ground-odyssey&episode=episode-9&asset=asset-1");
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/media-vault/audio-mastery?"), expect.objectContaining({ cache: "no-store" })));
  });

  it("shows held source evidence but disables processing operations", async () => {
    global.fetch = jest.fn((input) => String(input).includes("episode-inventory")
      ? response(inventory(false))
      : response(masteryStatus()));

    render(<AudioMasteryWorkspaceClient projects={projects} initialProjectSlug="high-ground-odyssey" initialEpisodeSlug="episode-9" initialAssetId="asset-1" />);

    expect(await screen.findByRole("heading", { name: "Homer local master.wav" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Processing held/ })).toBeDisabled();
    expect(screen.getByText(/will not derive new media until its current release ledger authorizes processing/i)).toBeInTheDocument();
  });
});
