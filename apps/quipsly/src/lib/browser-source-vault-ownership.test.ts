import type { BrowserSourceCaptureLedger } from "@high-ground/quipsly-domain";

import { browserSourceLedgersOwnedByParticipant } from "./browser-source-vault";

function ledger(
  captureId: string,
  participantId: string | null,
): BrowserSourceCaptureLedger {
  return {
    captureId,
    participantId,
    updatedAt: "2026-08-25T12:00:00.000Z",
  } as BrowserSourceCaptureLedger;
}

describe("browser source vault ownership", () => {
  it("projects only the exact signed-in Session participant", () => {
    const coach = ledger("coach-source", "participant-coach");
    const client = ledger("client-source", "participant-client");
    const unownedLegacy = ledger("legacy-source", null);

    expect(browserSourceLedgersOwnedByParticipant(
      [coach, client, unownedLegacy],
      "participant-client",
    )).toEqual([client]);
    expect(browserSourceLedgersOwnedByParticipant(
      [coach, client, unownedLegacy],
      "participant-coach",
    )).toEqual([coach]);
  });

  it("fails closed when canonical participant identity is absent", () => {
    expect(browserSourceLedgersOwnedByParticipant(
      [ledger("coach-source", "participant-coach")],
      "   ",
    )).toEqual([]);
  });
});
