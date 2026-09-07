import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CoachingClientCreate } from "./coaching-client-create";

const push = jest.fn();
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

describe("CoachingClientCreate", () => {
  beforeEach(() => { jest.clearAllMocks(); });
  it("creates a client space using only email, without any schedule or invitation action", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ space: { href: "/coaching/engagements/new-space" } }) });
    global.fetch = fetchMock;
    render(<CoachingClientCreate initiallyOpen />);
    fireEvent.change(screen.getByLabelText("Client email"), { target: { value: "client@example.test" } });
    expect(screen.queryByLabelText(/date|time/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create client space" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/coaching/engagements/new-space"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "client@example.test", name: "" });
  });
  it("keeps entered details when saving fails and allows retry", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Connection lost"));
    render(<CoachingClientCreate initiallyOpen />);
    fireEvent.change(screen.getByLabelText("Client email"), { target: { value: "client@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Create client space" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
    expect(screen.getByLabelText("Client email")).toHaveValue("client@example.test");
    expect(screen.getByRole("button", { name: "Create client space" })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });
});
