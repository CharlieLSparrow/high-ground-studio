/** @jest-environment jsdom */

import { render, screen } from "@testing-library/react";

import type { SourceStoryTimelineBinding } from "@high-ground/quipsly-domain";

import { SourceStoryProvenanceCard, sourceStoryReturnHref } from "./SourceStoryProvenanceCard";

const binding: SourceStoryTimelineBinding = {
  schema: "quipsly-source-story-timeline-binding-v1",
  placementId: "placement-1",
  cardId: "card-1",
  cardStableId: "episode-9-curious",
  cardRevision: 3,
  sourceRangeId: "range-1",
  sourceRangeStartSeconds: 10,
  sourceRangeEndSeconds: 20,
  selectorSha256: "a".repeat(64),
  sourceRevisionId: "revision-1",
  mediaAssetId: null,
  sourceIdentitySha256: "b".repeat(64),
  sourceContentSha256: "c".repeat(64),
  sourceSetId: "set-1",
  sourceSetIdentitySha256: "d".repeat(64),
  externalReferenceId: "drive-1",
  originBoardId: "board-1",
  originBoardPlacementId: "board-placement-1",
  browseDerivative: { id: "proxy-1", profile: "collaboration-1080p", contentSha256: "e".repeat(64), sizeBytes: "123", mimeType: "video/mp4" },
  reframeRecipe: {
    schema: "quipsly-360-reframe-v1",
    projection: "equirectangular",
    aspectRatio: "16:9",
    stabilization: "flowstate",
    horizonLock: true,
    keyframes: [
      { sourceSeconds: 10, panDegrees: 0, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 80, interpolation: "ease" },
      { sourceSeconds: 20, panDegrees: 30, tiltDegrees: 0, rollDegrees: 0, fieldOfViewDegrees: 70, interpolation: "ease" },
    ],
  },
  promotedAt: "2026-08-07T12:00:00.000Z",
  promotedByUserId: "user-1",
  promotedByEmail: "editor@example.test",
  boundaries: { sourceMediaUnchanged: true, browseDerivativeIsNotOriginal: true, sourceClockPreserved: true, finalRenderMustResolveExactSource: true, publicationNotStarted: true },
};

it("returns to the exact source set, board, and card", () => {
  expect(sourceStoryReturnHref("high-ground-odyssey", binding)).toBe(
    "/nests/high-ground-odyssey/story?set=set-1&board=board-1&card=card-1#story-card-card-1",
  );
});

it("makes retained range, current trim, proxy boundary, and 360 framing visible", () => {
  render(<SourceStoryProvenanceCard projectSlug="high-ground-odyssey" binding={binding} currentSourceStart={11.25} currentSourceEnd={18.75} />);
  expect(screen.getByText("Exact source provenance is attached")).toBeInTheDocument();
  expect(screen.getByText("0:10.000–0:20.000")).toBeInTheDocument();
  expect(screen.getByText("0:11.250–0:18.750")).toBeInTheDocument();
  expect(screen.getByText("verified proxy")).toBeInTheDocument();
  expect(screen.getByText("16:9 · 2 keyframes")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open exact Story card" })).toHaveAttribute("href", expect.stringContaining("card=card-1"));
});
