import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {CoachingWorkEditor, mergeCoachingWorkEdits, workEditValues} from "./coaching-work-editor";
import type {CoachingEngagementWorkEntry} from "./coaching-engagement-workspace";

const entry: CoachingEngagementWorkEntry = {
  id: "task-1", kind: "TASK", title: "Bring a paragraph", body: "Before Friday", status: "OPEN",
  owner: {id: "client", label: "Riley"}, visibility: "SHARED", dueAt: "2026-09-20T15:30:00.000Z",
  canEdit: true, createdAt: "2026-09-07T00:00:00Z", updatedAt: "2026-09-07T00:00:00Z",
};
const members = [{id: "client", label: "Riley", role: "CLIENT"}, {id: "coach", label: "Morgan", role: "COACH"}];

describe("coaching work editing across concurrent updates", () => {
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
