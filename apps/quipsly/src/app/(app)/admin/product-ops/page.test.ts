import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./page.tsx", import.meta.url)), "utf8");

describe("product operations surface", () => {
  it("is capability-protected and derives coaching health from canonical records", () => {
    expect(source).toContain("requireQuipslyProductAnalyst");
    expect(source).toContain("prisma.coachingBooking.count");
    expect(source).toContain("prisma.callParticipantPreflightReceipt.count");
    expect(source).toContain("prisma.recordingAsset.count");
    expect(source).toContain("prisma.transcriptJob.count");
    expect(source).toContain("prisma.callRoomInvitationDeliveryReceipt.groupBy");
  });

  it("labels activity honestly instead of fabricating conversion rates", () => {
    expect(source).toContain("Counts are operational activity");
    expect(source).not.toContain("conversionRate");
    expect(source).not.toContain("Math.round((");
  });
});
