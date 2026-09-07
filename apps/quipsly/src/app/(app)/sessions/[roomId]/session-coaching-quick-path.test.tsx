import { render, screen } from "@testing-library/react";
import { buildCoachingQuickPath, SessionCoachingQuickPath } from "./session-coaching-quick-path";
import type { SessionPreparation } from "./session-preparation-model";
import type { SessionFinishingEvidence } from "./session-finishing-cockpit";

const preparation = { participants: [{ id: "coach" }, { id: "client" }] } as SessionPreparation;
const emptyFinishing: SessionFinishingEvidence = { transcriptJobs: [], outputs: [], analyzedSourceCount: 0 };
const recording = {
  recordingAssetId: "short-source", status: "VERIFIED_MATCH" as const,
  protectedPlayback: { sourceId: "source", url: "/protected/source", kind: "audio" as const, durationSeconds: 11.642 },
};
const transcript = {
  id: "transcript", recordingAssetId: "short-source", status: "COMPLETED", segmentCount: 4,
  updatedAt: "2026-09-07T10:00:00.000Z",
};
const input = { roomId: "room-1", preparation, recordingSources: [], finishingEvidence: emptyFinishing };

describe("Coaching Session shortcuts", () => {
  it("keeps every tool reachable without a required sequence", () => {
    render(<SessionCoachingQuickPath {...input} />);
    expect(screen.getByRole("heading", { name: "Your session workspace" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open recordings" })).toHaveAttribute("href", "/sessions/room-1?mode=recordings");
    expect(screen.getByRole("link", { name: "Open transcript" })).toHaveAttribute("href", "/sessions/room-1?mode=transcript");
    expect(screen.getByRole("link", { name: "Open shared work" })).toHaveAttribute("href", "/sessions/room-1?mode=work");
    expect(screen.queryByLabelText(/Done|Next|Later/)).not.toBeInTheDocument();
  });

  it.each(["producer", "participant"] as const)("uses the %s's actual capabilities for invitations", (audience) => {
    render(<SessionCoachingQuickPath {...input} audience={audience}
      preparation={{ participants: [{ id: "person" }] } as SessionPreparation} />);
    if (audience === "producer") {
      expect(screen.getByRole("link", { name: "Invite client" })).toHaveAttribute("href", "/sessions/room-1?mode=prepare");
      expect(screen.getByRole("link", { name: "Prepare follow-up" })).toBeVisible();
    } else {
      expect(screen.queryByRole("link", { name: "Invite client" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Prepare follow-up" })).not.toBeInTheDocument();
    }
    expect(screen.getAllByRole("link", { name: "Join call" }).every(link => link.getAttribute("href") === "/sessions/room-1?mode=live")).toBe(true);
  });

  it("opens a real short recording instead of sending people back into the call", () => {
    const cards = buildCoachingQuickPath({ ...input, recordingSources: [recording] });
    expect(cards.find(card => card.id === "record")).toMatchObject({
      status: "Available", href: "/sessions/room-1?mode=recordings", action: "Open recordings",
    });
    render(<SessionCoachingQuickPath {...input} recordingSources={[recording]} />);
    expect(screen.getByRole("navigation", { name: "Session actions" })).toHaveTextContent("Open recordings");
  });

  it("does not present a held or missing protected source as playable", () => {
    for (const source of [{ ...recording, status: "HELD" as const }, { ...recording, protectedPlayback: null }]) {
      expect(buildCoachingQuickPath({ ...input, recordingSources: [source] }).find(card => card.id === "record"))
        .toMatchObject({ status: "Needs attention", action: "Open recordings" });
    }
  });

  it("keeps existing text editable while speaker labels need attention", () => {
    const cards = buildCoachingQuickPath({ ...input, recordingSources: [recording], finishingEvidence: {
      ...emptyFinishing, transcriptJobs: [{ ...transcript, readiness: {
        state: "REVIEW_REQUIRED", detail: "Speaker labels may need correction.",
      } as NonNullable<SessionFinishingEvidence["transcriptJobs"][number]["readiness"]> }],
    } });
    expect(cards.find(card => card.id === "transcript")).toMatchObject({ status: "Available", action: "Open transcript" });
    expect(cards.find(card => card.id === "transcript")?.detail).toMatch(/speaker|timing/i);
    expect(cards.find(card => card.id === "work")).toMatchObject({ status: "Always available" });
  });

  it("does not let old completed text conceal a newer failed attempt", () => {
    const cards = buildCoachingQuickPath({ ...input, finishingEvidence: {
      ...emptyFinishing, transcriptJobs: [transcript, { ...transcript, id: "retry", status: "FAILED", segmentCount: 0, updatedAt: "2026-09-07T11:00:00.000Z" }],
    } });
    expect(cards.find(card => card.id === "transcript")).toMatchObject({ status: "Needs attention", action: "Open transcript" });
  });

  it("links a released follow-up independently of recording length or transcript review", () => {
    render(<SessionCoachingQuickPath {...input} audience="participant" finishingEvidence={{ ...emptyFinishing, outputs: [{
      id: "follow-up", kind: "CLIENT_FOLLOW_UP", status: "RELEASED", deliveryCount: 0, updatedAt: "2026-09-07T10:00:00.000Z",
    }] }} />);
    expect(screen.getByRole("link", { name: "Shared follow-up" })).toHaveAttribute("href", "/sessions/room-1?mode=outputs#client-follow-up");
    expect(screen.getByRole("link", { name: "Session notes" })).toHaveAttribute("href", "/sessions/room-1?mode=notes");
  });
});
