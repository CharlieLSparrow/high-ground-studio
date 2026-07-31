/** @jest-environment node */

import { authorizeIngestMediaSource } from "./mobile-capture-security";

const source = {
  id: "private-source",
  providerSourceId: "/private/source.wav",
  url: "/api/ingest/media/private-source",
};

function harness(options: {
  sourceExists?: boolean;
  global?: boolean;
  projectAllowed?: boolean;
} = {}) {
  return {
    loadSource: jest.fn(async () => options.sourceExists === false ? null : source),
    loadScopes: jest.fn(async () => [{
      isGlobal: options.global === true,
      projectSlugs: ["private-nest"],
    }]),
    canReadProject: jest.fn(async () => options.projectAllowed === true),
  };
}

describe("protected ingest media authorization", () => {
  it("requires a signed-in actor before loading source existence", async () => {
    const access = harness();

    await expect(authorizeIngestMediaSource({
      actor: null,
      sourceId: source.id,
      ...access,
    })).resolves.toEqual({
      allowed: false,
      status: 401,
      error: "Sign in before opening Quipsly media.",
    });
    expect(access.loadSource).not.toHaveBeenCalled();
  });

  it("makes a real private source indistinguishable from a missing source", async () => {
    const missing = harness({ sourceExists: false });
    const outsider = harness({ projectAllowed: false });
    const actor = {
      id: "outsider",
      email: "outsider@example.test",
      isStaff: false,
    };

    const missingResult = await authorizeIngestMediaSource({
      actor,
      sourceId: source.id,
      ...missing,
    });
    const outsiderResult = await authorizeIngestMediaSource({
      actor,
      sourceId: source.id,
      ...outsider,
    });

    expect(outsiderResult).toEqual(missingResult);
    expect(outsiderResult).toEqual({
      allowed: false,
      status: 404,
      error: "Source not found",
    });
  });

  it("allows global, staff, or project-authorized media without weakening other scopes", async () => {
    const projectAccess = harness({ projectAllowed: true });
    await expect(authorizeIngestMediaSource({
      actor: {
        id: "editor",
        email: "editor@example.test",
        isStaff: false,
      },
      sourceId: source.id,
      ...projectAccess,
    })).resolves.toEqual({ allowed: true, source });

    const staffAccess = harness();
    await expect(authorizeIngestMediaSource({
      actor: {
        id: "staff",
        email: "staff@example.test",
        isStaff: true,
      },
      sourceId: source.id,
      ...staffAccess,
    })).resolves.toEqual({ allowed: true, source });
    expect(staffAccess.loadScopes).not.toHaveBeenCalled();

    const globalAccess = harness({ global: true });
    await expect(authorizeIngestMediaSource({
      actor: {
        id: "member",
        email: "member@example.test",
        isStaff: false,
      },
      sourceId: source.id,
      ...globalAccess,
    })).resolves.toEqual({ allowed: true, source });
    expect(globalAccess.canReadProject).not.toHaveBeenCalled();
  });
});
