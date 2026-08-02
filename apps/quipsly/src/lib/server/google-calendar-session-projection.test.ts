/** @jest-environment node */

import { createHash } from "node:crypto";

import {
  buildProductionMilestoneCalendarProjectionPreview,
  buildProductionMilestoneCalendarSnapshot,
  buildSessionCalendarProjectionPreview,
  buildSessionCalendarSnapshot,
  cancelSessionGoogleCalendarProjection,
  deterministicGoogleEventId,
  SessionCalendarProjectionError,
  writeSessionGoogleCalendarProjection,
} from "./google-calendar-session-projection";

function snapshot(status = "PLANNED") {
  return buildSessionCalendarSnapshot({
    roomId: "room-1",
    title: "Episode recording",
    purpose: "PODCAST",
    roomStatus: status,
    scheduledStart: new Date("2026-08-10T18:00:00.000Z"),
    scheduledEnd: new Date("2026-08-10T19:00:00.000Z"),
    timezone: "America/Denver",
    url: "https://nest.quipsly.com/sessions/room-1",
    providerVisibility: "default",
  });
}

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "projection-1",
    providerEventId: "provider-1",
    providerEtag: '"etag-1"',
    sourceRevision: "old-revision",
    conflictState: "NONE",
    status: "SYNCED",
    ...overrides,
  };
}

describe("Session Google Calendar projection", () => {
  it("builds an attendee-free snapshot and deterministic provider identity", () => {
    const value = snapshot();
    expect(value.attendeesIncluded).toBe(false);
    expect(value.privateSessionContentIncluded).toBe(false);
    expect(value.description).toContain("Recordings, transcript text, notes, goals, tasks");
    expect(value.description).not.toContain("person@example.com");
    expect(deterministicGoogleEventId("room-1")).toMatch(/^q[0-9a-f]{64}$/);
    expect(deterministicGoogleEventId("room-1")).toBe(deterministicGoogleEventId("room-1"));
  });

  it("distinguishes create, update, no-op, cancellation, and blocked conflict previews", () => {
    const current = snapshot();
    const create = buildSessionCalendarProjectionPreview({ snapshot: current });
    expect(create.action).toBe("CREATE");
    expect(buildSessionCalendarProjectionPreview({ snapshot: current, existing: existing() }).action).toBe("UPDATE");
    expect(buildSessionCalendarProjectionPreview({ snapshot: current, existing: existing({ sourceRevision: create.sourceRevision }) }).action).toBe("NOOP");
    expect(buildSessionCalendarProjectionPreview({ snapshot: snapshot("CANCELED"), existing: existing() }).action).toBe("CANCEL");
    expect(buildSessionCalendarProjectionPreview({ snapshot: snapshot("CANCELED"), existing: existing({ status: "CANCELED" }) }).action).toBe("NOOP");
    expect(buildSessionCalendarProjectionPreview({ snapshot: current, existing: existing({ conflictState: "EXTERNAL_CHANGED" }) }).action).toBe("BLOCKED");
    const stopped = buildSessionCalendarProjectionPreview({ snapshot: current, existing: existing({ status: "REVOKED" }) });
    expect(stopped.action).toBe("BLOCKED");
    expect(stopped.warning).toContain("no longer linked");
  });

  it("creates one deterministic event with notifications off and no attendees", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot() });
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: preview.deterministicProviderEventId, etag: '"etag-2"', updated: "2026-08-02T01:00:00.000Z", status: "confirmed" }), { status: 200 }));
    const result = await writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar@example.test", fetchImpl });
    expect(result.externalMutated).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("?sendUpdates=none");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.id).toBe(preview.deterministicProviderEventId);
    expect(body.visibility).toBe("default");
    expect(body.attendees).toBeUndefined();
    expect(body.extendedProperties.private.quipslySourceRevision).toBe(preview.sourceRevision);
  });

  it("keeps private calendar selections private at the provider", async () => {
    const privateSnapshot = buildSessionCalendarSnapshot({
      roomId: "coaching-room-1",
      title: "Coaching session",
      purpose: "COACHING",
      roomStatus: "PLANNED",
      scheduledStart: new Date("2026-08-10T18:00:00.000Z"),
      scheduledEnd: new Date("2026-08-10T19:00:00.000Z"),
      timezone: "America/Denver",
      url: "https://nest.quipsly.com/sessions/coaching-room-1",
      providerVisibility: "private",
    });
    const preview = buildSessionCalendarProjectionPreview({ snapshot: privateSnapshot });
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: preview.deterministicProviderEventId }), { status: 200 }));
    await writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar", fetchImpl });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).visibility).toBe("private");
  });

  it("recovers an already-created matching event after an ambiguous create retry", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot() });
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "conflict" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: preview.deterministicProviderEventId,
        etag: '"etag-recovered"',
        updated: "2026-08-02T01:00:00.000Z",
        status: "confirmed",
        extendedProperties: { private: { quipslySourceId: "room-1", quipslySourceRevision: preview.sourceRevision } },
      }), { status: 200 }));
    const result = await writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar", fetchImpl });
    expect(result.recoveredCreate).toBe(true);
    expect(result.externalMutated).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("refuses to adopt a deterministic ID occupied by different event evidence", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot() });
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: preview.deterministicProviderEventId, extendedProperties: { private: { quipslySourceId: "other-room" } } }), { status: 200 }));
    await expect(writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar", fetchImpl })).rejects.toMatchObject({ code: "provider-event-identity-conflict" });
  });

  it("updates conditionally with the last provider etag", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot(), existing: existing() });
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({ id: "provider-1", etag: '"etag-2"', status: "confirmed" }), { status: 200 }));
    await writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar", fetchImpl });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(init.headers["If-Match"]).toBe('"etag-1"');
    expect(JSON.parse(init.body).id).toBeUndefined();
  });

  it("turns a stale provider etag into a conflict rather than overwriting Google", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot(), existing: existing() });
    const fetchImpl = jest.fn().mockResolvedValue(new Response("{}", { status: 412 }));
    await expect(writeSessionGoogleCalendarProjection({ preview, accessToken: "access", calendarId: "calendar", fetchImpl })).rejects.toMatchObject({ code: "provider-etag-conflict", status: 409 });
  });

  it("performs no provider request for an exact no-op and blocks cancellation", async () => {
    const base = buildSessionCalendarProjectionPreview({ snapshot: snapshot() });
    const noOp = buildSessionCalendarProjectionPreview({ snapshot: snapshot(), existing: existing({ sourceRevision: base.sourceRevision }) });
    const fetchImpl = jest.fn();
    const result = await writeSessionGoogleCalendarProjection({ preview: noOp, accessToken: "access", calendarId: "calendar", fetchImpl });
    expect(result.outcome).toBe("NOOP");
    expect(fetchImpl).not.toHaveBeenCalled();
    const cancellation = buildSessionCalendarProjectionPreview({ snapshot: snapshot("CANCELED"), existing: existing() });
    await expect(writeSessionGoogleCalendarProjection({ preview: cancellation, accessToken: "access", calendarId: "calendar", fetchImpl })).rejects.toBeInstanceOf(SessionCalendarProjectionError);
  });

  it("conditionally removes a canceled Session event with notifications off", async () => {
    const preview = buildSessionCalendarProjectionPreview({
      snapshot: snapshot("CANCELED"),
      existing: existing(),
    });
    const fetchImpl = jest.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const result = await cancelSessionGoogleCalendarProjection({
      preview,
      accessToken: "access",
      calendarId: "calendar@example.test",
      fetchImpl,
    });
    expect(result).toMatchObject({
      outcome: "CANCELED",
      externalMutated: true,
      providerEventId: "provider-1",
      providerAlreadyAbsent: false,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/events/provider-1?sendUpdates=none");
    expect(init).toMatchObject({
      method: "DELETE",
      headers: {
        Authorization: "Bearer access",
        "If-Match": '"etag-1"',
      },
    });
    expect(init.body).toBeUndefined();
  });

  it.each([404, 410])("converges an already-absent provider event after HTTP %s", async (status) => {
    const preview = buildSessionCalendarProjectionPreview({
      snapshot: snapshot("CANCELED"),
      existing: existing(),
    });
    const result = await cancelSessionGoogleCalendarProjection({
      preview,
      accessToken: "access",
      calendarId: "calendar",
      fetchImpl: jest.fn().mockResolvedValue(new Response(null, { status })),
    });
    expect(result).toMatchObject({
      outcome: "ALREADY_ABSENT",
      externalMutated: false,
      providerAlreadyAbsent: true,
      providerStatus: "already-absent",
    });
  });

  it("turns a stale delete etag into conflict truth", async () => {
    const preview = buildSessionCalendarProjectionPreview({
      snapshot: snapshot("CANCELED"),
      existing: existing(),
    });
    await expect(cancelSessionGoogleCalendarProjection({
      preview,
      accessToken: "access",
      calendarId: "calendar",
      fetchImpl: jest.fn().mockResolvedValue(new Response(null, { status: 412 })),
    })).rejects.toMatchObject({ code: "provider-etag-conflict", status: 409 });
  });

  it("records local absence without provider access when no event was projected", async () => {
    const preview = buildSessionCalendarProjectionPreview({ snapshot: snapshot("CANCELED") });
    const fetchImpl = jest.fn();
    const result = await cancelSessionGoogleCalendarProjection({
      preview,
      accessToken: "",
      calendarId: "calendar",
      fetchImpl,
    });
    expect(result).toMatchObject({
      outcome: "ALREADY_ABSENT",
      externalMutated: false,
      providerEventId: null,
      providerStatus: "not-projected",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("Production milestone Google Calendar projection", () => {
  it("keeps point milestones visible without reserving a participant's time", async () => {
    const milestone = buildProductionMilestoneCalendarSnapshot({
      milestoneId: "milestone-1",
      title: "Rough cut ready for review",
      episodeTitle: "The Swear Jar",
      kind: "ROUGH_CUT",
      milestoneStatus: "PLANNED",
      startsAt: new Date("2026-08-10T18:00:00.000Z"),
      endsAt: null,
      timezone: "America/Denver",
      url: "https://nest.quipsly.com/nests/hgo/episodes/the-swear-jar",
      providerVisibility: "default",
    });
    const preview = buildProductionMilestoneCalendarProjectionPreview({ snapshot: milestone });
    const fetchImpl = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      id: preview.deterministicProviderEventId,
      etag: '"milestone-etag"',
      status: "confirmed",
    }), { status: 200 }));

    await writeSessionGoogleCalendarProjection({
      preview,
      accessToken: "access",
      calendarId: "production-calendar",
      fetchImpl,
    });

    expect(milestone).toMatchObject({
      sourceType: "StudioEpisodeMilestone",
      providerTransparency: "transparent",
      attendeesIncluded: false,
      privateSessionContentIncluded: false,
    });
    expect(milestone.endsAt).toBe("2026-08-10T18:30:00.000Z");
    expect(milestone.description).toContain("The Swear Jar");
    expect(milestone.description).not.toContain("producer@example.test");
    expect(preview.deterministicProviderEventId).not.toBe(deterministicGoogleEventId("milestone-1"));
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
      transparency: "transparent",
      extendedProperties: {
        private: { quipslySourceType: "StudioEpisodeMilestone" },
      },
    });
  });

  it("keeps legacy Session provider identities stable while namespacing new source types", () => {
    expect(deterministicGoogleEventId("room-1")).toBe(`q${createHash("sha256").update("room-1").digest("hex")}`);
    expect(deterministicGoogleEventId("room-1", "StudioEpisodeMilestone"))
      .not.toBe(deterministicGoogleEventId("room-1"));
  });
});
