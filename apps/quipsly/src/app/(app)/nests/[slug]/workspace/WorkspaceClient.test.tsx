import { render, screen } from "@testing-library/react";
import { WorkspaceClient } from "./WorkspaceClient";
import { CollaborationThread } from "@/components/session-thread";

jest.mock("@/components/session-thread", () => ({
  CollaborationThread: jest.fn(() => <section aria-label="Shared conversation" />),
}));

describe("Nest conversation workspace", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([true, false])("uses the canonical scoped thread with canPost=%s", (canPost) => {
    render(<WorkspaceClient projectSlug="coach-space" projectName="Coaching" canPost={canPost} />);
    expect(jest.mocked(CollaborationThread).mock.calls[0][0]).toMatchObject({ projectSlug: "coach-space", threadKey: "default", canPost });
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute("href", "/nests/coach-space?view=notes");
    expect(screen.getByRole("link", { name: "Tasks and goals" })).toHaveAttribute("href", "/nests/coach-space?view=work");
    expect(screen.getByRole("link", { name: "Sessions" })).toHaveAttribute("href", "/nests/coach-space?view=sessions");
    expect(screen.getByRole("link", { name: "Nest settings" })).toHaveAttribute("href", "/nests/coach-space/settings");
    expect(screen.queryByText(/Connected|Intro_Shot_01|Storyboard NLE Sandbox/)).not.toBeInTheDocument();
  });
});
