import { driveBrowsePreparationShortfall } from "./SourceStoryClient";

jest.mock("../actions", () => ({
  createNestQuickWorkAction: jest.fn(),
}));

describe("Source Story Drive storage preflight", () => {
  const library = (safeAvailableBytes: string) =>
    ({
      id: "library-1",
      navigationHealth: {
        executorStorage: {
          status: "measured",
          safeAvailableBytes,
          availableBytes: "6777458688",
          reserveBytes: "5368709120",
          measuredAt: "2026-08-08T06:31:01.181Z",
          workspaceMode: "temporary",
          localPathWithheld: true,
        },
      },
    }) as Parameters<typeof driveBrowsePreparationShortfall>[1][number];

  it("reports the exact bytes a source exceeds the safest active executor", () => {
    expect(
      driveBrowsePreparationShortfall("1900000000", [
        library("1408749568"),
        library("5000000000"),
      ]),
    ).toBe("491250432");
  });

  it("stays permissive when no fresh measurement can be projected", () => {
    expect(driveBrowsePreparationShortfall("1900000000", [])).toBeNull();
  });
});
