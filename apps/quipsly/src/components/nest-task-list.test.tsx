import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NestTaskList, type NestTask } from "./nest-task-list";
import { editWorkTask, updateWorkTaskStatus } from "@/app/(app)/work/actions";
import { useRouter } from "next/navigation";

jest.mock("@/app/(app)/work/actions", () => ({ editWorkTask: jest.fn(), updateWorkTaskStatus: jest.fn() }));
jest.mock("next/navigation", () => ({ useRouter: jest.fn() }));
const refresh = jest.fn();
const research = { id: "research", label: "Research", hexColor: "#506b46", isActive: true };
const task: NestTask = { id: "task", title: "Opening ideas", detail: "Gather sources", status: "OPEN", dueAt: null,
  updatedAt: "2026-09-08T12:00:00.000Z", canEdit: true, recurring: false, tags: [research],
  conversationSourceHref: "/nests/book/workspace?message=message", sourceAnchor: null };
beforeEach(() => { jest.clearAllMocks(); jest.mocked(useRouter).mockReturnValue({ refresh } as any); });

test("filters contextual work by status, text, and canonical colored tag", () => {
  render(<NestTaskList projectId="book" tasks={[task, { ...task, id: "two", title: "Draft chapter", detail: null, tags: [] },
    { ...task, id: "three", title: "Earlier sources", status: "DONE" }]} />);
  expect(screen.queryByRole("article", { name: "Earlier sources" })).not.toBeInTheDocument();
  const filter = screen.getByRole("button", { name: "Filter by Research" });
  expect(filter).toHaveStyle({ backgroundColor: "#506b46", color: "#ffffff" });
  fireEvent.click(filter);
  expect(filter).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("article", { name: "Draft chapter" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Completed & canceled (1)" }));
  expect(screen.getByRole("article", { name: "Earlier sources" })).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "not here" } });
  expect(screen.getByText(/No tasks match/)).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("0 tasks tagged Research");
});

test("completes and reopens the same task in place using the latest confirmed revision", async () => {
  const nextRevision = "2026-09-08T12:01:00.000Z";
  jest.mocked(updateWorkTaskStatus).mockResolvedValueOnce({ ok: true, taskId: task.id, status: "DONE", updatedAt: nextRevision, receiptId: "receipt" })
    .mockResolvedValueOnce({ ok: true, taskId: task.id, status: "OPEN", updatedAt: "2026-09-08T12:02:00.000Z", receiptId: "receipt2" });
  render(<NestTaskList projectId="book" tasks={[task]} />);
  expect(screen.getByRole("link", { name: "View conversation" })).toHaveAttribute("href", task.conversationSourceHref);
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Complete Opening ideas" })); });
  expect(updateWorkTaskStatus).toHaveBeenLastCalledWith({ taskId: task.id, nextStatus: "DONE", expectedUpdatedAt: task.updatedAt });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Reopen Opening ideas" })); });
  expect(updateWorkTaskStatus).toHaveBeenLastCalledWith({ taskId: task.id, nextStatus: "OPEN", expectedUpdatedAt: nextRevision });
  expect(refresh).toHaveBeenCalledTimes(2);
});

test("rejects duplicate pending status writes and shows failure without pretending completion", async () => {
  let resolve!: (value: any) => void;
  jest.mocked(updateWorkTaskStatus).mockImplementation(() => new Promise(done => { resolve = done; }));
  render(<NestTaskList projectId="book" tasks={[task]} />);
  const complete = screen.getByRole("button", { name: "Complete Opening ideas" });
  fireEvent.click(complete); fireEvent.click(complete);
  expect(complete).toBeDisabled();
  expect(updateWorkTaskStatus).toHaveBeenCalledTimes(1);
  await act(async () => { resolve({ ok: false, code: "CONFLICT", error: "This task changed elsewhere." }); });
  expect(screen.getByRole("alert")).toHaveTextContent("changed elsewhere");
  expect(screen.getByRole("button", { name: "Complete Opening ideas" })).toBeEnabled();
  expect(refresh).toHaveBeenCalledTimes(1);
});

test("viewers cannot edit shared tasks and recurring work retains its dedicated controls", () => {
  render(<NestTaskList projectId="book" tasks={[{ ...task, canEdit: false }, { ...task, id: "repeat", title: "Daily practice", recurring: true }]} />);
  expect(screen.queryByRole("button", { name: "Complete Opening ideas" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Complete Daily practice" })).not.toBeInTheDocument();
  expect(screen.queryByText("Edit task")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Manage repeat" })).toHaveAttribute("href", "/work?task=repeat");
});

test("task editing keeps the draft on save failure and conflict readback", async () => {
  jest.mocked(editWorkTask).mockResolvedValue({ ok: false, code: "CONFLICT", error: "This task changed elsewhere." });
  const { rerender } = render(<NestTaskList projectId="book" tasks={[task]} />);
  fireEvent.click(screen.getByText("Edit task"));
  fireEvent.change(screen.getByRole("textbox", { name: "Edit task title" }), { target: { value: "My retained wording" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save task changes" })); });
  expect(editWorkTask).toHaveBeenCalledWith(expect.objectContaining({ title: "My retained wording", dueLocal: null, expectedUpdatedAt: task.updatedAt }));
  rerender(<NestTaskList projectId="book" tasks={[{ ...task, title: "Teammate wording", updatedAt: "2026-09-08T12:01:00.000Z" }]} />);
  expect(screen.getByRole("textbox", { name: "Edit task title" })).toHaveValue("My retained wording");
  expect(within(screen.getByRole("article", { name: "Teammate wording" })).getByText("This task changed elsewhere.")).toBeInTheDocument();
});
