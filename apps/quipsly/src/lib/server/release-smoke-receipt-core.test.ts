/** @jest-environment node */

import {
  createReleaseSmokeReceiptToken,
  RELEASE_SMOKE_RECEIPT_HEADER,
  RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  validateReleaseSmokeReceiptToken,
} from "./release-smoke-receipt-core";

const SECRET = "test-release-smoke-secret-that-is-longer-than-32-bytes";
const REVISION = "studio-00042-receipt";
const HOSTS = ["nest.quipsly.com", "quipsly.com"];
const ROUTES = [
  ...RELEASE_SMOKE_REQUIRED_ROUTE_IDS,
  ...HOSTS.map((host) => `public-host:${host}`),
];
const CHECKED_AT = new Date("2026-07-18T16:00:00.000Z");

function createToken(options: {
  secret?: string;
  revision?: string;
  hosts?: string[];
  passedRouteIds?: string[];
  checkedAt?: Date;
  ttlMs?: number;
} = {}) {
  return createReleaseSmokeReceiptToken({
    secret: options.secret ?? SECRET,
    revision: options.revision ?? REVISION,
    hosts: options.hosts ?? HOSTS,
    passedRouteIds: options.passedRouteIds ?? ROUTES,
    checkedAt: options.checkedAt ?? CHECKED_AT,
    ttlMs: options.ttlMs,
  });
}

function validate(token: string, options: {
  secret?: string | null;
  expectedRevision?: string;
  expectedHosts?: string[];
  requiredRouteIds?: readonly string[];
  now?: Date;
} = {}) {
  return validateReleaseSmokeReceiptToken({
    token,
    secret: options.secret === undefined ? SECRET : options.secret,
    expectedRevision: options.expectedRevision ?? REVISION,
    expectedHosts: options.expectedHosts ?? HOSTS,
    requiredRouteIds: options.requiredRouteIds,
    now: options.now ?? new Date("2026-07-18T16:01:00.000Z"),
  });
}

describe("release-smoke receipt core", () => {
  it("creates a bounded versioned token and validates its exact evidence", () => {
    const token = createToken();
    const result = validate(token);

    expect(RELEASE_SMOKE_RECEIPT_HEADER).toBe("x-quipsly-release-smoke-receipt");
    expect(token.startsWith("qsr1.")).toBe(true);
    expect(token).not.toContain(SECRET);
    expect(token).not.toContain(REVISION);
    expect(result).toMatchObject({
      ok: true,
      code: "RELEASE_SMOKE_RECEIPT_VALID",
      payload: {
        version: 1,
        revision: REVISION,
        hosts: [...HOSTS].sort(),
      },
    });
    if (result.ok) {
      expect(result.payload.passedRouteIds).toEqual([...ROUTES].sort());
    }
  });

  it("fails closed when the secret is missing or too short", () => {
    const token = createToken();

    expect(validate(token, { secret: null })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_SECRET_MISSING",
    });
    expect(validate(token, { secret: "short" })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_SECRET_INVALID",
    });
    expect(() => createToken({ secret: "short" })).toThrow(/32-4096/);
  });

  it("rejects a tampered signature before trusting the payload", () => {
    const token = createToken();
    const segments = token.split(".");
    const replacement = segments[2].startsWith("A") ? "B" : "A";
    const tampered = `${segments[0]}.${segments[1]}.${replacement}${segments[2].slice(1)}`;

    expect(validate(tampered)).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_SIGNATURE_INVALID",
      payload: null,
    });
  });

  it("rejects expired receipts and serving-revision mismatches", () => {
    const token = createToken({ ttlMs: 60_000 });

    expect(validate(token, { now: new Date("2026-07-18T16:01:00.000Z") })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_EXPIRED",
    });
    expect(validate(createToken(), { expectedRevision: "studio-00043-other" })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_REVISION_MISMATCH",
    });
  });

  it("requires the exact configured host set and a public-host check for each host", () => {
    const token = createToken();
    expect(validate(token, { expectedHosts: ["nest.quipsly.com"] })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_HOST_MISMATCH",
    });

    const missingPublicHostCheck = createToken({
      passedRouteIds: ROUTES.filter((routeId) => routeId !== "public-host:quipsly.com"),
    });
    expect(validate(missingPublicHostCheck)).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_ROUTES_INCOMPLETE",
    });
  });

  it("requires every server-defined smoke route rather than trusting arbitrary client claims", () => {
    const missingPublishing = createToken({
      passedRouteIds: ROUTES.filter((routeId) => routeId !== "publishing.runway"),
    });

    expect(validate(missingPublishing)).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_ROUTES_INCOMPLETE",
    });
  });

  it("enforces token, host, and route-count bounds before accepting evidence", () => {
    expect(() => createToken({
      passedRouteIds: Array.from({ length: 65 }, (_, index) => `route.${index}`),
    })).toThrow(/exceed the receipt bound/i);
    expect(() => createToken({ hosts: ["HTTPS://QUIPSLY.COM"] })).toThrow(/hosts are invalid/i);
    expect(validateReleaseSmokeReceiptToken({
      token: `qsr1.${"a".repeat(12_001)}.signature`,
      secret: SECRET,
      expectedRevision: REVISION,
      expectedHosts: HOSTS,
    })).toMatchObject({
      ok: false,
      code: "RELEASE_SMOKE_RECEIPT_MALFORMED",
    });
  });
});
