import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DocumentTags } from "./document-tags";

const moss = { id: "moss", label: "Book ideas", hexColor: "#506b46", isActive: true };
const context = { ok: true, projectId: "nest", entityId: "document", updatedAt: "2026-09-09T00:00:00Z", tagRevision: 3,
  tags: [moss], selectedTagIds: [], canCreateTags: true };
const response = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const success = { ok: true, tagRevision: 4, tagIds: ["moss"], updatedAt: "2026-09-09T00:01:00Z" };
const key = "quipsly:document-tags:writer:nest:document";
const open = () => render(<DocumentTags key="writer" documentId="document" projectId="nest" actorId="writer" />);
async function selectTag() {
  fireEvent.click(await screen.findByRole("button", { name: "Add tags" }));
  fireEvent.click(await screen.findByRole("checkbox", { name: "Book ideas" }));
}

describe("document tags in the writing surface", () => {
  beforeEach(() => { localStorage.clear(); global.fetch = jest.fn(); });

  it("autosaves a colored tag independently of prose and reloads its selection", async () => {
    jest.mocked(fetch).mockImplementation(async (_url, options) => response(options?.method ? success : context));
    const view = open();
    await selectTag();
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Book ideas tag" })).toBeEnabled());
    const calls = jest.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "POST");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toMatchObject({ entityKind: "document", entityId: "document", tagIds: ["moss"], expectedTagRevision: 3 });
    expect(screen.getByRole("button", { name: "Remove Book ideas tag" }).getAttribute("style")).toContain("80, 107, 70");
    expect(localStorage.getItem(key)).toBeNull();
    view.unmount();
    jest.mocked(fetch).mockResolvedValue(response({ ...context, tagRevision: 4, selectedTagIds: ["moss"] }));
    open();
    expect(await screen.findByRole("link", { name: "Find all accessible work tagged Book ideas" })).toHaveAttribute("href", "/find?tag=moss");
  });

  it("replays a lost response after reload with the same request identity", async () => {
    jest.mocked(fetch).mockImplementation(async (_url, options) => { if (options?.method) throw new Error("lost reply"); return response(context); });
    const view = open();
    await selectTag();
    await screen.findByRole("button", { name: "Retry tags" });
    const sent = jest.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")![1]!.body;
    expect(localStorage.getItem(key)).not.toBeNull();
    view.unmount();
    jest.mocked(fetch).mockClear().mockImplementation(async (_url, options) => response(options?.method ? success : { ...context, tagRevision: 4, selectedTagIds: ["moss"] }));
    open();
    await waitFor(() => expect(localStorage.getItem(key)).toBeNull());
    expect(jest.mocked(fetch).mock.calls.find(([, options]) => options?.method === "POST")![1]!.body).toBe(sent);
  });

  it("creates colored vocabulary and immediately applies it to this document", async () => {
    const newTag = { id: "new-tag", label: "First draft", hexColor: "#8b5e3c", isActive: true };
    jest.mocked(fetch).mockImplementation(async (_url, options) => {
      if (!options?.method) return response(context);
      const input = JSON.parse(String(options.body));
      return response(input.operation === "CREATE" ? { ok: true, tag: newTag } : { ...success, tagIds: [newTag.id] });
    });
    open();
    fireEvent.click(await screen.findByRole("button", { name: "Add tags" }));
    await screen.findByRole("checkbox", { name: "Book ideas" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Find document tags" }), { target: { value: newTag.label } });
    fireEvent.change(screen.getByLabelText("New tag color"), { target: { value: newTag.hexColor } });
    fireEvent.click(screen.getByRole("button", { name: "Create “First draft” tag" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove First draft tag" })).toBeEnabled());
    const writes = jest.mocked(fetch).mock.calls.filter(([, options]) => options?.method === "POST").map(([, options]) => JSON.parse(String(options?.body)));
    expect(writes).toEqual([
      { operation: "CREATE", projectId: "nest", label: "First draft", hexColor: "#8b5e3c" },
      expect.objectContaining({ entityKind: "document", entityId: "document", tagIds: ["new-tag"], expectedTagRevision: 3 }),
    ]);
  });

  it("keeps archived colors and exact tag navigation when not editing", async () => {
    const archived = { id: "earlier", label: "Earlier focus", hexColor: "#866c52", isActive: false };
    jest.mocked(fetch).mockResolvedValue(response({ ...context, tags: [moss, archived], selectedTagIds: [moss.id, archived.id] }));
    open();
    const research = await screen.findByRole("link", { name: "Find all accessible work tagged Book ideas" });
    expect(research).toHaveAttribute("href", "/find?tag=moss");
    expect(research).toHaveStyle({ backgroundColor: "#506b46" });
    const earlier = screen.getByRole("link", { name: "Find all accessible work tagged Earlier focus (archived)" });
    expect(earlier).toHaveAttribute("href", "/find?tag=earlier");
    expect(earlier).toHaveStyle({ backgroundColor: "#866c52" });
  });

  it("keeps conflict recovery inside tags without reloading or overwriting the document", async () => {
    jest.mocked(fetch).mockImplementation(async (_url, options) => response(options?.method ? { ok: false } : context, options?.method ? 409 : 200));
    open(); await selectTag();
    expect(await screen.findByRole("button", { name: "Use current tags" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove Book ideas tag" })).toBeDisabled();
    jest.mocked(fetch).mockResolvedValue(response({ ...context, tagRevision: 5 }));
    fireEvent.click(screen.getByRole("button", { name: "Use current tags" }));
    await screen.findByRole("button", { name: "Add tags" });
    expect(localStorage.getItem(key)).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Book ideas tag" })).not.toBeInTheDocument();
  });

  it("does not display or replay another person's pending tags", async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, projectId: "nest", selected: [moss], request: {
      entityKind: "document", entityId: "document", tagIds: ["moss"], expectedTagRevision: 3, expectedUpdatedAt: context.updatedAt, clientRequestId: "saved-request",
    } }));
    jest.mocked(fetch).mockResolvedValue(response(context));
    render(<DocumentTags documentId="document" projectId="nest" actorId="another-person" />);
    await screen.findByRole("button", { name: "Add tags" });
    expect(screen.queryByText("Book ideas")).not.toBeInTheDocument();
    expect(jest.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
  });

  it("authorizes before showing recovered tags and allows retrying a failed load", async () => {
    localStorage.setItem(key, JSON.stringify({ version: 1, projectId: "nest", selected: [moss] }));
    jest.mocked(fetch).mockResolvedValue(response({ ok: false }, 404));
    open();
    await screen.findByRole("button", { name: "Retry tags" });
    expect(screen.queryByText("Book ideas")).not.toBeInTheDocument();
    jest.mocked(fetch).mockResolvedValue(response(context));
    fireEvent.click(screen.getByRole("button", { name: "Retry tags" }));
    await screen.findByRole("button", { name: "Add tags" });
  });
});
