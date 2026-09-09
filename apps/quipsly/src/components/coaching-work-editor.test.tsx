import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {CoachingWorkEditor, mergeCoachingWorkEdits, workEditValues} from "./coaching-work-editor";
import type {CoachingEngagementWorkEntry} from "./coaching-engagement-workspace";

const entry: CoachingEngagementWorkEntry = {
  id: "task-1", kind: "TASK", title: "Bring a paragraph", body: "Before Friday", status: "OPEN",
  owner: {id: "client", label: "Riley"}, visibility: "SHARED", dueAt: "2026-09-20T15:30:00.000Z",
  canEdit: true, createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z",
};
const members = [{id: "client", label: "Riley", role: "CLIENT"}, {id: "coach", label: "Morgan", role: "COACH"}];

it("retains new tag labels in an edit, keeps unrelated remote edits, and clears them on cancel", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, canCreateTags: false, tags: []})});
  const onSave = jest.fn().mockResolvedValue(null);
  try {
    const {rerender} = render(<CoachingWorkEditor entry={entry} engagementId="space" members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByRole("button", {name: "Add tags"}));
    await screen.findByText("Type a name to create your first tag.");
    fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Writing rhythm"}});
    fireEvent.click(screen.getByRole("button", {name: "Add “Writing rhythm” tag"}));
    const latest = {...entry, body: "Coach clarification", updatedAt: "2026-09-09T00:00:00Z"};
    rerender(<CoachingWorkEditor entry={latest} engagementId="space" members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(latest, expect.objectContaining({body: "Coach clarification", newTagLabels: ["Writing rhythm"]})));
    expect(screen.getByRole("button", {name: "Remove new Writing rhythm tag"})).toBeVisible();
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.queryByRole("button", {name: "Remove new Writing rhythm tag"})).not.toBeInTheDocument();
    expect(screen.getByLabelText("task details")).toHaveValue("Coach clarification");
  } finally {globalThis.fetch = originalFetch;}
});

it("preserves unrelated tag updates and identifies conflicting tag choices by identity, not color or order", () => {
  const research = {id: "research", label: "Research", hexColor: "#23543a", isActive: true};
  const next = {...research, id: "next", label: "Next"};
  const base = {...workEditValues(entry), tags: [research]};
  const latest = {...base, tags: [next]};
  expect(mergeCoachingWorkEdits(base, {...base, body: "My writing"}, latest))
    .toEqual({values: {...latest, body: "My writing"}, conflicts: []});
  expect(mergeCoachingWorkEdits(base, {...base, tags: []}, latest).conflicts).toEqual(["tags"]);
  expect(mergeCoachingWorkEdits({...base, tags: [research, next]}, {...base, tags: [next, research]},
    {...base, tags: [{...research, hexColor: "#000000"}, next]}).conflicts).toEqual([]);
});

it.each(["TASK", "GOAL", "NOTE"] as const)("edits %s tags with its wording, retaining both after a failed save and allowing archived tag removal", async (kind) => {
  const tag = {id: "research", label: "Research", hexColor: "#23543a", isActive: true};
  const old = {...tag, id: "old", label: "Old topic", isActive: false};
  const initial = {...entry, kind, status: kind === "TASK" ? "OPEN" : "ACTIVE", tags: [old]};
  const onSave = jest.fn().mockResolvedValueOnce(null).mockResolvedValue({...entry, tags: [tag], body: "New wording"});
  const originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, tags: [tag]})});
  try {
    render(<CoachingWorkEditor entry={initial} engagementId="client-space" members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByRole("button", {name: "Remove Old topic tag"}));
    fireEvent.click(screen.getByRole("button", {name: "Add tags"}));
    fireEvent.click(await screen.findByRole("checkbox", {name: "Research"}));
    expect(globalThis.fetch).toHaveBeenCalledWith(`/api/work/tags?entityKind=${kind.toLowerCase()}&entityId=${entry.id}`, expect.anything());
    fireEvent.change(screen.getByLabelText(`${kind.toLowerCase()} details`), {target: {value: "New wording"}});
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("checkbox", {name: "Research"})).toBeChecked();
    expect(screen.getByLabelText(`${kind.toLowerCase()} details`)).toHaveValue("New wording");
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave.mock.calls[1]).toEqual([initial, {...workEditValues(initial), body: "New wording", tags: [tag]}]);
  } finally { globalThis.fetch = originalFetch; }
});

describe("coaching work editing across concurrent updates", () => {
  it("edits personal work without offering to transfer it to another space member", async () => {
    const personal = {...entry, visibility: "PRIVATE" as const};
    const onSave = jest.fn().mockResolvedValue(personal);
    render(<CoachingWorkEditor entry={personal} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.queryByRole("combobox", {name: "Owner"})).not.toBeInTheDocument();
    expect(screen.getByText(/Only me/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("task name"), {target: {value: "My revised plan"}});
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(personal,
      expect.objectContaining({title: "My revised plan", ownerUserId: entry.owner!.id, visibility: "PRIVATE"})));
  });
  it("merges different fields without changing an untouched due time or ownership", () => {
    const base = workEditValues(entry);
    expect(mergeCoachingWorkEdits(base, {...base, body: "My new wording"}, {...base, status: "DONE", ownerUserId: "coach"}))
      .toEqual({values: {...base, body: "My new wording", status: "DONE", ownerUserId: "coach"}, conflicts: []});
  });

  it.each(["title", "body", "ownerUserId", "targetAt", "visibility", "status"] as const)("only flags a real conflicting change to %s", (key) => {
    const base = workEditValues(entry);
    const mine = {...base, [key]: "mine"};
    const theirs = {...base, [key]: "theirs"};
    expect(mergeCoachingWorkEdits(base, mine, theirs)).toEqual({values: mine, conflicts: [key]});
    expect(mergeCoachingWorkEdits(base, mine, mine)).toEqual({values: mine, conflicts: []});
    expect(mergeCoachingWorkEdits(base, base, theirs)).toEqual({values: theirs, conflicts: []});
  });

  it("updates pristine fields when a fresh server version arrives", () => {
    const onSave = jest.fn();
    const {rerender} = render(<CoachingWorkEditor entry={entry} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    rerender(<CoachingWorkEditor entry={{...entry, title: "A clearer shared title", updatedAt: "2026-09-07T01:00:00Z"}} members={members} busy={false} onSave={onSave} />);
    expect(screen.getByLabelText("task name")).toHaveValue("A clearer shared title");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("preserves the draft and saves non-overlapping changes against the new server version", async () => {
    const updated = {...entry, title: "Their new title", status: "DONE", updatedAt: "2026-09-07T01:00:00Z"};
    const onSave = jest.fn().mockResolvedValue({...updated, body: "My revised commitment"});
    const {rerender} = render(<CoachingWorkEditor entry={entry} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "My revised commitment"}});
    rerender(<CoachingWorkEditor entry={updated} members={members} busy={false} onSave={onSave} />);
    expect(screen.getByLabelText("task details")).toHaveValue("My revised commitment");
    expect(screen.getByRole("status")).toHaveTextContent("Your draft is still here");
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(updated, {...workEditValues(updated), body: "My revised commitment"}));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps both versions visible on a conflict and applies only my changed fields when I choose", async () => {
    const updated = {...entry, body: "Their different commitment", status: "DONE", owner: {id: "coach", label: "Morgan"}, updatedAt: "2026-09-07T01:00:00Z"};
    const onSave = jest.fn().mockResolvedValue({...updated, body: "My revised commitment"});
    const {rerender} = render(<CoachingWorkEditor entry={entry} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "My revised commitment"}});
    rerender(<CoachingWorkEditor entry={updated} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("details changed elsewhere too");
    expect(screen.getByLabelText("task details")).toHaveValue("My revised commitment");
    fireEvent.click(screen.getByRole("button", {name: "Save my changes"}));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(updated, {...workEditValues(updated), body: "My revised commitment"}));
  });

  it("can adopt the latest version or cancel without retaining stale form text", () => {
    const updated = {...entry, body: "Their different commitment", updatedAt: "2026-09-07T01:00:00Z"};
    const onSave = jest.fn();
    const {rerender} = render(<CoachingWorkEditor entry={entry} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "My revised commitment"}});
    rerender(<CoachingWorkEditor entry={updated} members={members} busy={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", {name: "Save changes"}));
    fireEvent.click(screen.getByRole("button", {name: "Use latest version"}));
    expect(screen.getByLabelText("task details")).toHaveValue(updated.body);
    fireEvent.change(screen.getByLabelText("task details"), {target: {value: "An abandoned draft"}});
    fireEvent.click(screen.getByRole("button", {name: "Cancel"}));
    expect(screen.getByText("Edit").closest("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByLabelText("task details")).toHaveValue(updated.body);
    expect(onSave).not.toHaveBeenCalled();
  });
});
