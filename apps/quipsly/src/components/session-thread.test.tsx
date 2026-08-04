import { act, render, screen } from "@testing-library/react";

import { SessionThread } from "./session-thread";

describe("SessionThread", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.useFakeTimers();
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, messages: [] }),
    }) as typeof fetch;
  });

  afterEach(() => {
    jest.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it("makes the recording-Session thread distinct from the episode-wide thread", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="high-ground"
        roomId="room-1"
        sessionTitle="Episode 5 take"
        scopeLabel="This recording Session only"
        scopeDescription="Use the Episode thread for the long-lived production conversation."
      />);
      await Promise.resolve();
    });

    expect(screen.getByText("This recording Session only")).toBeInTheDocument();
    expect(screen.getByText(/Episode thread for the long-lived production conversation/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Write to everyone in this Session…")).toBeEnabled();
  });

  it("keeps a view-only collaborator from composing a message", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="high-ground"
        roomId="room-2"
        sessionTitle="Episode 5 take"
        canPost={false}
      />);
      await Promise.resolve();
    });

    expect(screen.getByPlaceholderText("View-only Session thread")).toBeDisabled();
    expect(screen.getByText(/editor access is required to post/i)).toBeInTheDocument();
  });

  it("uses purpose-neutral default scope language", async () => {
    await act(async () => {
      render(<SessionThread
        projectSlug="coaching"
        roomId="room-3"
        sessionTitle="Retained coaching follow-up"
      />);
      await Promise.resolve();
    });

    expect(screen.getByText(/Reviewed notes, goals, tasks, and outputs stay in their dedicated Session tools/i)).toBeInTheDocument();
    expect(screen.queryByText(/Episode-wide production/i)).not.toBeInTheDocument();
  });
});
