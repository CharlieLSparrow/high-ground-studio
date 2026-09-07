import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CoachingEngagementMemberManager } from "./coaching-engagement-member-manager";

const boundary = { members: [{ id: "member", userId: "client", role: "CLIENT", status: "ACTIVE", accessRevision: 1,
  user: { name: "Client", email: "client@example.test" } }], invitations: [], receipts: [] };
const writeText = jest.fn();
const fetchMock = jest.fn();
const originalFetch = global.fetch;
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalRandomUUID = Object.getOwnPropertyDescriptor(crypto, "randomUUID");

describe("client-space sharing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    Object.defineProperty(crypto, "randomUUID", { configurable: true, value: () => "a79d3f7e-4cf7-4d90-89b0-060918f05e62" });
    writeText.mockResolvedValue(undefined);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ boundary }) });
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
    if (originalRandomUUID) Object.defineProperty(crypto, "randomUUID", originalRandomUUID);
    else Reflect.deleteProperty(crypto, "randomUUID");
  });

  it("copies a members-only space link without any membership mutation", async () => {
    render(<CoachingEngagementMemberManager engagementId="space" />);
    const button = screen.getByRole("button", { name: "Copy space link" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/coaching/engagements/space`));
    expect(await screen.findByRole("button", { name: "Space link copied" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Space link" })).toHaveValue(`${window.location.origin}/coaching/engagements/space`);
  });

  it("leaves a selectable link when browser clipboard access fails", async () => {
    writeText.mockRejectedValue(new Error("Clipboard unavailable"));
    render(<CoachingEngagementMemberManager engagementId="space" />);
    const button = screen.getByRole("button", { name: "Copy space link" });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("Copy the space link from the field below");
    expect(screen.getByRole("textbox", { name: "Space link" })).toHaveValue(`${window.location.origin}/coaching/engagements/space`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retrieves a pending invitation without requiring revoke and recreate", async () => {
    const pending = { ...boundary, invitations: [{ id: "invite", invitedEmail: "new@example.test", role: "CLIENT", status: "PENDING", expiresAt: "2026-10-01" }] };
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ({ ok: true,
      json: async () => init?.method === "POST"
        ? { result: { invitationUrl: "http://localhost/coaching/engagements/join#token=synthetic-token", invitationPath: "/coaching/engagements/join#token=synthetic-token", message: "Their existing client invitation is ready to share." } }
        : { boundary: pending },
    }));
    render(<CoachingEngagementMemberManager engagementId="space" />);
    fireEvent.click(await screen.findByRole("button", { name: "Get invite link" }));
    expect(await screen.findByRole("textbox", { name: "Private invitation URL" })).toHaveValue(`${window.location.origin}/coaching/engagements/join#token=synthetic-token`);
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0][1].body)).toMatchObject({ action: "INVITE", email: "new@example.test", role: "CLIENT" });
  });
});
