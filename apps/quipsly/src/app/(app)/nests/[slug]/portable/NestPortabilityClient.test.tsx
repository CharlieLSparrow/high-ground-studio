import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NestPortabilityClient } from "./NestPortabilityClient";

const refresh = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const verifiedPlan = {
  manifestSha256: "a".repeat(64),
  sourceNestSlug: "source-nest",
  tagCreates: 2,
  tagReuses: 0,
  tagSlugCollisions: 1,
  aliasCreates: 1,
  aliasReuses: 0,
  aliasesDeferred: 1,
  mergeLinksPreservedAsHistory: 0,
  noteCreates: 1,
  noteReuses: 0,
  blockCreates: 2,
  spanCreates: 1,
  taskCreates: 1,
  taskReuses: 0,
  goalCreates: 1,
  goalReuses: 0,
  progressReceiptCreates: 1,
  goalTaskLinkCreates: 1,
  planBlockCreates: 1,
  planBlockReuses: 0,
  remindersDeferred: 1,
  recurrenceSeriesDeferred: 0,
  planBlocksCanceledForSafety: 1,
  overwrites: 0,
  sourceMutations: 0,
  externalSideEffects: 0,
};
const verifiedPlanSha256 = "b".repeat(64);

function jsonFile(value: unknown) {
  const file = new File([JSON.stringify(value)], "portable-nest.json", { type: "application/json" });
  Object.defineProperty(file, "text", {
    value: async () => JSON.stringify(value),
  });
  return file;
}

function jsonResponse(value: unknown, ok = true) {
  return {
    ok,
    json: async () => value,
  } as Response;
}

describe("Nest portability owner controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("requires a read-only preview before apply and confirms the safety boundaries", async () => {
    const user = userEvent.setup();
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ ok: true, plan: verifiedPlan, planSha256: verifiedPlanSha256 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, plan: verifiedPlan, planSha256: verifiedPlanSha256 }));
    render(<NestPortabilityClient projectSlug="target-nest" projectName="Target Nest" />);

    expect(screen.queryByRole("button", { name: "Apply verified restore" })).not.toBeInTheDocument();
    await user.upload(screen.getByLabelText("Choose a Quipsly Nest JSON file"), jsonFile({ schemaVersion: "test" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Validate its manifest and destination plan");

    await user.click(screen.getByRole("button", { name: "Validate restore plan" }));
    expect(await screen.findByRole("heading", { name: "Verified plan" })).toBeInTheDocument();
    expect(screen.getByText("2 tags + 1 alias created; 0 vocabulary routes reused")).toBeInTheDocument();
    expect(screen.getByText("1 tag versioned · 1 alias deferred")).toBeInTheDocument();
    expect(screen.getByText("0 overwrites · 0 source mutations · 0 external effects")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "/api/nests/target-nest/portable-restore?mode=validate",
      expect.objectContaining({ method: "POST" }),
    );

    await user.click(screen.getByRole("button", { name: "Apply verified restore" }));
    expect(await screen.findByRole("button", { name: "Restore confirmed" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("active reminders and recurrence were not recreated");
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/nests/target-nest/portable-restore?mode=apply",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "x-quipsly-restore-plan-sha256": verifiedPlanSha256,
        }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("keeps apply disabled if a server plan reports any destructive or external effect", async () => {
    const user = userEvent.setup();
    jest.mocked(global.fetch).mockResolvedValueOnce(jsonResponse({
      ok: true,
      plan: { ...verifiedPlan, externalSideEffects: 1 },
      planSha256: verifiedPlanSha256,
    }));
    render(<NestPortabilityClient projectSlug="target-nest" projectName="Target Nest" />);

    await user.upload(screen.getByLabelText("Choose a Quipsly Nest JSON file"), jsonFile({ schemaVersion: "test" }));
    await user.click(screen.getByRole("button", { name: "Validate restore plan" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Apply verified restore" })).toBeDisabled());
    expect(screen.getByText("0 overwrites · 0 source mutations · 1 external effects")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("requires a fresh preview after destination drift", async () => {
    const user = userEvent.setup();
    jest.mocked(global.fetch)
      .mockResolvedValueOnce(jsonResponse({ ok: true, plan: verifiedPlan, planSha256: verifiedPlanSha256 }))
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        error: "This destination changed after validation. Nothing was restored; validate again.",
      }, false));
    render(<NestPortabilityClient projectSlug="target-nest" projectName="Target Nest" />);

    await user.upload(screen.getByLabelText("Choose a Quipsly Nest JSON file"), jsonFile({ schemaVersion: "test" }));
    await user.click(screen.getByRole("button", { name: "Validate restore plan" }));
    await user.click(await screen.findByRole("button", { name: "Apply verified restore" }));

    expect(await screen.findByRole("status")).toHaveTextContent("destination changed after validation");
    expect(screen.queryByRole("button", { name: "Apply verified restore" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Validate restore plan" })).toBeEnabled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
