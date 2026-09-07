/** @jest-environment node */
import { GET, POST } from "./route";
import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { createCoachingClientSpace, coachingClientSchedulingContext, CoachingClientSpaceError } from "@/lib/server/coaching-client-space";
jest.mock("@/lib/server/quipsly-session", () => ({ getQuipslySessionFromRequest: jest.fn() }));
jest.mock("@/lib/server/coaching-client-space", () => ({
  createCoachingClientSpace: jest.fn(), coachingClientSchedulingContext: jest.fn(),
  CoachingClientSpaceError: class extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
const actor = { id: "coach", primaryEmail: "coach@example.test" };
describe("client space creation adapter", () => {
  beforeEach(() => jest.clearAllMocks());
  it("requires sign-in before running a command", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    expect((await POST(new Request("http://localhost/api/coaching/engagements", { method: "POST" }))).status).toBe(401);
    expect(createCoachingClientSpace).not.toHaveBeenCalled();
  });
  it("takes identity only from the authenticated session", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    jest.mocked(createCoachingClientSpace).mockResolvedValue({ id: "space", title: "Client", href: "/coaching/engagements/space" });
    const response = await POST(new Request("http://localhost/api/coaching/engagements", { method: "POST", body: JSON.stringify({ email: "client@example.test", name: "Client", actor: { id: "victim" }, projectId: "private-other-project", role: "OWNER" }) }));
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(createCoachingClientSpace).toHaveBeenCalledWith({ actor, email: "client@example.test", name: "Client" });
  });
  it("loads scheduling context through the signed-in actor, never a query-string identity", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    const context = { engagementId: "space", title: "Client", projectId: "project", projectSlug: "nest", coachUserId: actor.id, clientUserId: "client", clientEmail: "client@example.test", clientName: "Client" };
    jest.mocked(coachingClientSchedulingContext).mockResolvedValue(context);
    const response = await GET(new Request("http://localhost/api/coaching/engagements?engagementId=space&actor=victim"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(await response.json()).toEqual({ context });
    expect(coachingClientSchedulingContext).toHaveBeenCalledWith({ actor, engagementId: "space" });
  });
  it("does not reveal an inaccessible space or run a query for an anonymous visitor", async () => {
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/coaching/engagements?engagementId=space"))).status).toBe(401);
    expect(coachingClientSchedulingContext).not.toHaveBeenCalled();
    jest.mocked(getQuipslySessionFromRequest).mockResolvedValue({ user: actor } as never);
    jest.mocked(coachingClientSchedulingContext).mockRejectedValue(new CoachingClientSpaceError("This client space is not available for scheduling.", 404));
    expect((await GET(new Request("http://localhost/api/coaching/engagements?engagementId=space"))).status).toBe(404);
  });
});
