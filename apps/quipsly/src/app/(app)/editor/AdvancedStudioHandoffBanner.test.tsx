import { render, screen, waitFor } from "@testing-library/react";

import type { AdvancedStudioHandoffRequest } from "@/lib/editor/advanced-studio-handoff";

import { AdvancedStudioHandoffBanner } from "./AdvancedStudioHandoffBanner";

const BRANCH_FINGERPRINT = "a".repeat(64);
const TIMELINE_FINGERPRINT_SHA256 = "b".repeat(64);
const SOURCE_PROJECTION_FINGERPRINT = "c".repeat(64);

const request: AdvancedStudioHandoffRequest = {
  schema: "quipsly-episode-studio-handoff-v1",
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-9",
  branchId: "branch-1",
  branchRevision: 7,
  branchFingerprint: BRANCH_FINGERPRINT,
  timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
  sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT,
  sequenceAtSeconds: 42.25,
  storyCardId: "card-curious",
  storyPlacementId: "placement-1",
};

function response(value: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: async () => value,
  } as Response);
}

describe("AdvancedStudioHandoffBanner", () => {
  afterEach(() => {
    Reflect.deleteProperty(global, "fetch");
  });

  it("revalidates the canonical branch before delivering sequence focus", async () => {
    global.fetch = jest.fn(() => response({
      selectedEpisode: { slug: "episode-9" },
      branch: {
        id: "branch-1",
        headRevision: 7,
        stateFingerprint: BRANCH_FINGERPRINT,
      },
      timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
      state: { sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT },
    }));
    const onVerified = jest.fn();

    render(<AdvancedStudioHandoffBanner request={request} onVerified={onVerified} />);

    expect(screen.getByText(/Checking the exact shared-edit revision/)).toBeInTheDocument();
    expect(await screen.findByText("Episode handoff verified")).toBeInTheDocument();
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith(request));
    expect(screen.getByRole("link", { name: "Return to Episode editor" })).toHaveAttribute(
      "href",
      "/nests/high-ground-odyssey/episodes/episode-9?mode=edit&storyCard=card-curious&storyPlacement=placement-1",
    );
  });

  it("shows a changed revision and never applies its focus", async () => {
    global.fetch = jest.fn(() => response({
      selectedEpisode: { slug: "episode-9" },
      branch: {
        id: "branch-1",
        headRevision: 8,
        stateFingerprint: "d".repeat(64),
      },
      timelineFingerprintSha256: TIMELINE_FINGERPRINT_SHA256,
      state: { sourceProjectionFingerprint: SOURCE_PROJECTION_FINGERPRINT },
    }));
    const onVerified = jest.fn();

    render(<AdvancedStudioHandoffBanner request={request} onVerified={onVerified} />);

    expect(await screen.findByText("Episode handoff not applied")).toBeInTheDocument();
    expect(screen.getByText(/shared edit changed/)).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("fails visibly when the handoff envelope is malformed", () => {
    global.fetch = jest.fn();
    const onVerified = jest.fn();

    render(<AdvancedStudioHandoffBanner
      request={null}
      malformed
      fallbackReturnHref="/nests/high-ground-odyssey/episodes/episode-9?mode=edit"
      onVerified={onVerified}
    />);

    expect(screen.getByText("Episode handoff malformed")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("does not apply context when the authenticated projection is unavailable", async () => {
    global.fetch = jest.fn(() => response({ error: "Episode access denied." }, false));
    const onVerified = jest.fn();

    render(<AdvancedStudioHandoffBanner request={request} onVerified={onVerified} />);

    expect(await screen.findByText("Episode handoff not applied")).toBeInTheDocument();
    expect(screen.getByText("Episode access denied.")).toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });
});
