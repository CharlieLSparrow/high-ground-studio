import { SessionOutputRequestJournal } from "./session-output-request-journal";

describe("Session output request journal", () => {
  it("reuses the exact request identity and timestamped evidence after an ambiguous response", () => {
    let sequence = 0;
    let built = 0;
    const journal = new SessionOutputRequestJournal(() => `request-${++sequence}`);
    const createBody = () => {
      built += 1;
      return { decision: "approved", completedAt: "2026-08-24T18:00:00.000Z" };
    };

    const first = journal.preserve("delivery-1|approved|0,5,9", createBody);
    const retry = journal.preserve("delivery-1|approved|0,5,9", () => ({ decision: "rejected", completedAt: "later" }));

    expect(retry).toBe(first);
    expect(retry).toEqual({ key: "delivery-1|approved|0,5,9", clientRequestId: "request-1", body: { decision: "approved", completedAt: "2026-08-24T18:00:00.000Z" } });
    expect(built).toBe(1);
  });

  it("creates a new request only for a different intent or after acknowledgement", () => {
    let sequence = 0;
    const journal = new SessionOutputRequestJournal(() => `request-${++sequence}`);
    const first = journal.preserve("select|asset-1", () => ({ assetId: "asset-1" }));
    const other = journal.preserve("select|asset-2", () => ({ assetId: "asset-2" }));
    journal.acknowledge(first.key);
    const acknowledgedRetry = journal.preserve("select|asset-1", () => ({ assetId: "asset-1" }));

    expect(first.clientRequestId).toBe("request-1");
    expect(other.clientRequestId).toBe("request-2");
    expect(acknowledgedRetry.clientRequestId).toBe("request-3");
  });
});
