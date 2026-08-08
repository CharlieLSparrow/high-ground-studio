import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { GoogleDriveSourcePicker } from "./GoogleDriveSourcePicker";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

describe("Google Drive source picker entry", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("offers a scoped connection from the current Nest when no account is connected", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({ ok: true, pickerConfigured: true, connections: [] }),
    ) as unknown as typeof fetch;
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[]}
        onAttached={async () => undefined}
      />,
    );
    const connect = await screen.findByRole("link", {
      name: /connect google drive/i,
    });
    expect(connect).toHaveAttribute(
      "href",
      "/api/media/connections/google-drive/start?returnTo=%2Fnests%2Fhigh-ground-odyssey%2Fstory",
    );
    expect(
      screen.getByText(/without uploading originals/i),
    ).toBeInTheDocument();
  });

  it("shows the verified account but holds browsing when the restricted browser key is not deployed", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        pickerConfigured: false,
        connections: [
          {
            id: "drive-connection-1",
            accountLabel: "homer@example.test",
            status: "verified",
            revision: 1,
            verifiedAt: "2026-08-07T20:00:00.000Z",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[]}
        onAttached={async () => undefined}
      />,
    );
    expect(await screen.findByText("homer@example.test")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /choose 360 folder/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /choose 360 files/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /choose other drive files/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/browser key still needs deployment configuration/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/quipsly groups them into camera segments/i),
    ).toBeInTheDocument();
  });

  it("shows safe followed-library health without exposing another collaborator's refresh authority", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        pickerConfigured: true,
        connections: [],
      }),
    ) as unknown as typeof fetch;
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[
          {
            id: "library-1",
            name: "Homer 360 Library",
            status: "attention",
            revision: 2,
            totalFileCount: 30,
            totalSizeBytes: "435214857419",
            readySegmentCount: 13,
            heldSegmentCount: 11,
            heldSegments: [
              {
                batchName: "VID_20260114_145426_00_025_027-Original",
                displayName: "2026-01-14 14:54:26 · segment 027",
                segment: "027",
                status: "held-incomplete",
                reasons: [
                  "The exact INSV original is missing.",
                  "At least one file is empty or still syncing.",
                ],
                observedMemberCount: 1,
              },
            ],
            heldSegmentsOmittedCount: 10,
            notObservedCount: 1,
            lastCheckedAt: "2026-08-07T20:00:00.000Z",
            canRefresh: false,
            connectionState: "verified",
            connectedByCurrentUser: false,
            discoveryMode: "selected-files",
          },
        ]}
        onAttached={async () => undefined}
      />,
    );
    expect(await screen.findByText("Homer 360 Library")).toBeInTheDocument();
    expect(screen.getByText(/30 files/i)).toBeInTheDocument();
    expect(
      screen.getByText(/previously seen file was not observed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/never deletes source history/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/refresh rechecks only the exact files you selected/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/review 11 held camera segments/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/exact insv original is missing/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/10 additional held segments/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^refresh$/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /add another camera batch/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/connected account owner can refresh/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /connect google drive/i }),
    ).toBeInTheDocument();
  });

  it("gives the connection owner a direct add-to-library action", async () => {
    global.fetch = jest.fn(async () =>
      jsonResponse({
        ok: true,
        pickerConfigured: true,
        connections: [
          {
            id: "drive-connection-1",
            accountLabel: "homer@example.test",
            status: "verified",
            revision: 1,
            verifiedAt: "2026-08-08T20:00:00.000Z",
          },
        ],
      }),
    ) as unknown as typeof fetch;
    const onAttached = jest.fn(async () => undefined);
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[
          {
            id: "library-1",
            name: "Insta360",
            status: "ready",
            revision: 3,
            totalFileCount: 6,
            totalSizeBytes: "77181151118",
            readySegmentCount: 3,
            heldSegmentCount: 0,
            notObservedCount: 0,
            lastCheckedAt: "2026-08-08T20:00:00.000Z",
            canRefresh: true,
            connectionState: "verified",
            connectedByCurrentUser: true,
            connectionId: "drive-connection-1",
            discoveryMode: "selected-files",
            navigationHealth: {
              eligibleSourceCount: 3,
              retainedBrowseCount: 2,
              proxyReadyCount: 2,
              visualReadyCount: 1,
              audioReadyCount: 1,
              browseReadyCount: 1,
              remainingCount: 2,
              nextBatchCount: 2,
              pendingTransferBytes: "1900000000",
              inventoryTruncated: false,
              captureDays: [
                {
                  date: "2026-05-07",
                  eligibleSourceCount: 2,
                  browseReadyCount: 1,
                  pendingTransferBytes: "1900000000",
                },
                {
                  date: null,
                  eligibleSourceCount: 1,
                  browseReadyCount: 0,
                  pendingTransferBytes: "0",
                },
              ],
            },
          },
        ]}
        onAttached={onAttached}
      />,
    );

    expect(await screen.findByText("Insta360")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add another camera batch/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/does not scan unrelated drive content/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: /insta360 browse readiness/i }),
    ).toHaveAttribute("aria-valuenow", "1");
    expect(
      screen.getByText(/1 of 3 camera segments ready to scan/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /prepare next 2/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/1\.8 GB of LRV companions remain/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/camera days · 2/i)).toBeInTheDocument();
    expect(screen.getByText(/May 7, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/capture date unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 ready to scan/i)).toBeInTheDocument();
    expect(screen.getAllByText(/LRV retained/i)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /check progress/i }));
    await waitFor(() => expect(onAttached).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/updated insta360 browse readiness/i),
    ).toBeInTheDocument();
  });

  it("reports exact file and package deltas after a library refresh", async () => {
    const fetchMock = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/media/connections/google-drive") {
          return jsonResponse({
            ok: true,
            pickerConfigured: true,
            connections: [
              {
                id: "drive-connection-1",
                accountLabel: "homer@example.test",
                status: "verified",
                revision: 1,
                verifiedAt: "2026-08-08T20:00:00.000Z",
              },
            ],
          });
        }
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toMatchObject({
          action: "refresh-google-drive-library",
          libraryId: "library-1",
        });
        return jsonResponse({
          operation: {
            library: {
              id: "library-1",
              name: "Insta360",
              status: "attention",
              revision: 4,
              totalFileCount: 32,
              totalSizeBytes: "435214857419",
              readySegmentCount: 14,
              heldSegmentCount: 10,
              notObservedCount: 0,
              lastCheckedAt: "2026-08-08T21:00:00.000Z",
              canRefresh: true,
              connectionState: "verified",
              connectedByCurrentUser: true,
            },
          },
        });
      },
    );
    global.fetch = fetchMock as unknown as typeof fetch;
    const onAttached = jest.fn(async () => undefined);
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[
          {
            id: "library-1",
            name: "Insta360",
            status: "attention",
            revision: 3,
            totalFileCount: 30,
            totalSizeBytes: "435214857419",
            readySegmentCount: 13,
            heldSegmentCount: 11,
            notObservedCount: 0,
            lastCheckedAt: "2026-08-08T20:00:00.000Z",
            canRefresh: true,
            connectionState: "verified",
            connectedByCurrentUser: true,
            connectionId: "drive-connection-1",
          },
        ]}
        onAttached={onAttached}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /^refresh$/i }));
    expect(
      await screen.findByText(
        /32 files \(\+2\), 14 ready \(\+1\), 10 held \(-1\)/i,
      ),
    ).toBeInTheDocument();
    expect(onAttached).toHaveBeenCalledTimes(1);
  });

  it("plans aggregate final-quality storage without starting original downloads", async () => {
    global.fetch = jest.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/media/connections/google-drive") {
          return jsonResponse({
            ok: true,
            pickerConfigured: true,
            connections: [],
          });
        }
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          action: "plan-google-drive-library-conform",
          libraryId: "library-1",
        });
        return jsonResponse({
          operation: {
            schema: "quipsly-google-drive-library-conform-plan-v1",
            library: {
              id: "library-1",
              name: "Insta360",
              unattachedHeldSegmentCount: 3,
            },
            summary: {
              segmentCount: 2,
              renderReady: 1,
              readyToBind: 0,
              preparing: 0,
              needsPreparation: 0,
              held: 1,
              totalOriginalBytes: "429496729600",
              remainingBytes: "322122547200",
              aggregateShortfallBytes: "107374182400",
              inventoryTruncated: false,
            },
            executor: {
              status: "measured",
              safeAvailableBytes: "214748364800",
              availableBytes: "322122547200",
              reserveBytes: "107374182400",
              measuredAt: "2026-08-08T20:00:00.000Z",
              localPathWithheld: true,
            },
            days: [
              {
                date: "2026-05-07",
                segmentCount: 2,
                renderReadyCount: 1,
                heldCount: 1,
                remainingBytes: "322122547200",
                originalBytes: "429496729600",
                segments: [
                  {
                    sourceUnitId: "source-unit-1",
                    title: "May 7 segment 080",
                    captureKey: "VID_20260507_180459_080",
                    status: "render-ready",
                    remainingBytes: "0",
                    originalBytes: "214748364800",
                    holds: [],
                  },
                  {
                    sourceUnitId: "source-unit-2",
                    title: "May 7 segment 081",
                    captureKey: "VID_20260507_180459_081",
                    status: "held",
                    remainingBytes: "322122547200",
                    originalBytes: "214748364800",
                    holds: ["Reconnect the owning Drive account."],
                  },
                ],
              },
            ],
            boundaries: {
              inspectionOnly: true,
              originalsRemainInDrive: true,
              preparationRequiresOneExplicitSegment: true,
              providerLocatorsWithheld: true,
              localPathsWithheld: true,
            },
          },
        });
      },
    ) as unknown as typeof fetch;
    render(
      <GoogleDriveSourcePicker
        projectSlug="high-ground-odyssey"
        canWrite
        libraries={[
          {
            id: "library-1",
            name: "Insta360",
            status: "attention",
            revision: 3,
            totalFileCount: 30,
            totalSizeBytes: "435214857419",
            readySegmentCount: 2,
            heldSegmentCount: 3,
            notObservedCount: 0,
            lastCheckedAt: "2026-08-08T20:00:00.000Z",
            canRefresh: true,
            connectionState: "verified",
            connectedByCurrentUser: true,
            connectionId: "drive-connection-1",
          },
        ]}
        onAttached={async () => undefined}
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: /plan final-quality storage/i,
      }),
    );
    expect(
      await screen.findByText(/1 of 2 attached segments are render-ready/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/300\.0 GB remain across 400\.0 GB/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/100\.0 GB over this Mac/i)).toBeInTheDocument();
    expect(screen.getByText(/No downloads have started/i)).toBeInTheDocument();
    expect(screen.getByText(/May 7, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/May 7 segment 081/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Reconnect the owning Drive account/i),
    ).toBeInTheDocument();
  });
});
