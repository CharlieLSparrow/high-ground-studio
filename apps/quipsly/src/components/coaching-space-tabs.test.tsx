import { fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { CoachingSpaceTabs } from "./coaching-space-tabs";

jest.mock("next/navigation", () => ({useSearchParams: () => new URLSearchParams(window.location.search)}));

const panels = {
  work: <label>Note draft<textarea /></label>,
  conversation: <label>Message draft<textarea /></label>,
  sessions: <h2>Session history</h2>,
  people: <h2>People settings</h2>,
};

describe("CoachingSpaceTabs", () => {
  beforeEach(() => window.history.replaceState({}, "", "/"));

  it("does not advertise clickable tabs before restoring the saved section during hydration", () => {
    const shell = document.createElement("div");
    shell.innerHTML = renderToString(<CoachingSpaceTabs {...panels} />);
    const serverTabs = [...shell.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(serverTabs).toHaveLength(4);
    expect(serverTabs.every((tab) => tab.disabled)).toBe(true);
    window.history.replaceState({}, "", "#relationship-conversation");
    render(<CoachingSpaceTabs {...panels} />);
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Work" })).toBeEnabled();
    fireEvent.click(screen.getByRole("tab", { name: "Work" }));
    expect(window.location.hash).toBe("#relationship-work");
    expect(screen.getByLabelText("Note draft")).toBeVisible();
  });

  it("opens on work, keeps settings out of the way, and retains drafts across switches", () => {
    render(<CoachingSpaceTabs {...panels} />);
    expect(screen.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Note draft")).toBeVisible();
    expect(screen.getByText("People settings")).not.toBeVisible();
    fireEvent.change(screen.getByLabelText("Note draft"), { target: { value: "Before our session" } });
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    fireEvent.change(screen.getByLabelText("Message draft"), { target: { value: "A thought for next time" } });
    expect(screen.getByLabelText("Note draft")).not.toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "People" }));
    expect(screen.getByText("People settings")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Work" }));
    expect(screen.getByLabelText("Note draft")).toHaveValue("Before our session");
    fireEvent.click(screen.getByRole("tab", { name: "Chat" }));
    expect(screen.getByLabelText("Message draft")).toHaveValue("A thought for next time");
  });

  it("supports arrow keys, Home and End without tabbing through every inactive tab", () => {
    render(<CoachingSpaceTabs {...panels} />);
    const work = screen.getByRole("tab", { name: "Work" });
    work.focus();
    fireEvent.keyDown(work, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveFocus();
    expect(work).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Chat" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "People" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "People" }), { key: "ArrowRight" });
    expect(work).toHaveFocus();
    fireEvent.keyDown(work, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "People" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "People" }), { key: "Home" });
    expect(work).toHaveFocus();
  });

  it("restores a conversation deep link and reacts to the existing message-coach anchor", () => {
    window.history.replaceState({}, "", "#relationship-conversation");
    render(<CoachingSpaceTabs {...panels} />);
    expect(screen.getByRole("tab", { name: "Chat" })).toHaveAttribute("aria-selected", "true");
    window.history.replaceState({}, "", "#relationship-work");
    fireEvent(window, new Event("hashchange"));
    expect(screen.getByRole("tab", { name: "Work" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens a conversation source after client navigation without losing the work draft", () => {
    window.history.replaceState({}, "", "/coaching/engagements/space?work=task#relationship-work");
    const {rerender} = render(<CoachingSpaceTabs {...panels} />);
    fireEvent.change(screen.getByLabelText("Note draft"), {target: {value: "Keep my unfinished thought"}});
    window.history.pushState({}, "", "/coaching/engagements/space?message=idea#relationship-conversation");
    rerender(<CoachingSpaceTabs {...panels} />);
    expect(screen.getByRole("tab", {name: "Chat"})).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Message draft")).toBeVisible();
    expect(screen.getByLabelText("Note draft")).toHaveValue("Keep my unfinished thought");
    window.history.replaceState({}, "", "/coaching/engagements/space?work=task#relationship-work");
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByRole("tab", {name: "Work"})).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Note draft")).toBeVisible();
  });

  it("reveals a same-page source panel even when the router query is already current", () => {
    window.history.replaceState({}, "", "/coaching/engagements/space?message=idea#relationship-work");
    render(<CoachingSpaceTabs {...panels} work={<>{panels.work}<a
      href="/coaching/engagements/space?message=idea#relationship-conversation"
      onClick={event => event.preventDefault()}>From conversation</a></>} />);
    fireEvent.change(screen.getByLabelText("Note draft"), {target: {value: "Do not discard this"}});
    const source = screen.getByRole("link", {name: "From conversation"});
    fireEvent.click(source, {metaKey: true});
    expect(screen.getByRole("tab", {name: "Work"})).toHaveAttribute("aria-selected", "true");
    fireEvent.click(source);
    expect(screen.getByRole("tab", {name: "Chat"})).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Message draft")).toBeVisible();
    expect(screen.getByLabelText("Note draft")).toHaveValue("Do not discard this");
  });

  it("does not expose a management panel to a client, even through a hash", () => {
    window.history.replaceState({}, "", "#relationship-people");
    render(<CoachingSpaceTabs {...panels} people={undefined} />);
    expect(screen.queryByRole("tab", { name: "People" })).not.toBeInTheDocument();
    expect(screen.queryByText("People settings")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Note draft")).toBeVisible();
  });
});
