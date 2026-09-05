import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { AccountDeletionPanel } from "./account-deletion-panel";

function response(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

describe("AccountDeletionPanel", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("starts self-service deletion after one explicit confirmation", async () => {
    const fetchMock = jest.mocked(global.fetch)
      .mockImplementationOnce(() => response({
        ok: true,
        request: null,
        policy: { timing: "Quipsly targets completion within 30 days." },
      }))
      .mockImplementationOnce(() => response({
        ok: true,
        request: {
          id: "deletion-1",
          status: "READY_FOR_DELETION",
          statusLabel: "Deletion queued",
          statusDetail: "Your account is queued for secure deletion.",
          active: true,
          targetCompletionAt: "2026-10-05T00:00:00.000Z",
        },
        nextAction: "No action is required.",
      }));

    render(<AccountDeletionPanel />);

    const initialButton = await screen.findByRole("button", { name: "Delete account…" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/account/deletion-request", expect.objectContaining({ method: "GET" }));

    fireEvent.click(initialButton);
    expect(screen.getByRole("alertdialog", { name: "Delete this account?" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("Deletion queued")).toBeInTheDocument();
    expect(screen.getByText("No action is required.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/account/deletion-request", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ source: "quipsly-web", appSurface: "settings-support" }),
    }));
  });

  it("shows an existing request without offering a duplicate destructive action", async () => {
    jest.mocked(global.fetch).mockImplementation(() => response({
      ok: true,
      request: {
        id: "deletion-1",
        status: "EXECUTING",
        statusLabel: "Deletion in progress",
        statusDetail: "Quipsly is removing account access.",
        active: true,
        targetCompletionAt: "2026-10-05T00:00:00.000Z",
      },
      nextAction: "No action is required.",
    }));

    render(<AccountDeletionPanel />);

    expect(await screen.findByText("Deletion in progress")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete account…" })).not.toBeInTheDocument();
  });

  it("keeps a provider error visible and retryable", async () => {
    jest.mocked(global.fetch).mockImplementation(() => response({
      ok: false,
      error: "Sign in again to continue.",
    }, false));

    render(<AccountDeletionPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sign in again to continue.");
    await waitFor(() => expect(screen.getByRole("button", { name: "Refresh status" })).toBeEnabled());
    expect(screen.queryByRole("button", { name: "Delete account…" })).not.toBeInTheDocument();
  });

  it("allows a canceled request to be started again", async () => {
    jest.mocked(global.fetch)
      .mockImplementationOnce(() => response({
        ok: true,
        request: {
          id: "deletion-old",
          status: "CANCELED",
          statusLabel: "Request canceled",
          statusDetail: "This account deletion request was canceled.",
          active: false,
        },
      }))
      .mockImplementationOnce(() => response({
        ok: true,
        request: {
          id: "deletion-new",
          status: "READY_FOR_DELETION",
          statusLabel: "Deletion queued",
          active: true,
        },
      }));

    render(<AccountDeletionPanel />);

    fireEvent.click(await screen.findByRole("button", { name: "Start a new deletion request…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));

    expect(await screen.findByText("Deletion queued")).toBeInTheDocument();
  });
});
