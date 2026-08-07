import { render, screen } from "@testing-library/react";

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
    global.fetch = jest.fn(async () => jsonResponse({ ok: true, pickerConfigured: true, connections: [] })) as unknown as typeof fetch;
    render(<GoogleDriveSourcePicker projectSlug="high-ground-odyssey" canWrite onAttached={async () => undefined} />);
    const connect = await screen.findByRole("link", { name: /connect google drive/i });
    expect(connect).toHaveAttribute(
      "href",
      "/api/media/connections/google-drive/start?returnTo=%2Fnests%2Fhigh-ground-odyssey%2Fstory",
    );
    expect(screen.getByText(/without uploading originals/i)).toBeInTheDocument();
  });

  it("shows the verified account but holds browsing when the restricted browser key is not deployed", async () => {
    global.fetch = jest.fn(async () => jsonResponse({
      ok: true,
      pickerConfigured: false,
      connections: [{
        id: "drive-connection-1",
        accountLabel: "homer@example.test",
        status: "verified",
        revision: 1,
        verifiedAt: "2026-08-07T20:00:00.000Z",
      }],
    })) as unknown as typeof fetch;
    render(<GoogleDriveSourcePicker projectSlug="high-ground-odyssey" canWrite onAttached={async () => undefined} />);
    expect(await screen.findByText("homer@example.test")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse google drive/i })).toBeDisabled();
    expect(screen.getByText(/browser key still needs deployment configuration/i)).toBeInTheDocument();
  });
});
