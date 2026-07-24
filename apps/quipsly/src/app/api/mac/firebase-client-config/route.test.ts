import { GET } from "./route";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const REQUIRED_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "public-test-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "example-project",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "example.firebasestorage.app",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("native Firebase client configuration", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEmulator =
    process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL;
  const originalValues = Object.fromEntries(
    Object.keys(REQUIRED_ENV).map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (originalEmulator === undefined) {
      delete process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL;
    } else {
      process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL =
        originalEmulator;
    }
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
    });
  });

  it("returns a validated localhost emulator origin in development", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
      writable: true,
    });
    process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL =
      "http://127.0.0.1:9099";

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      firebase: { authEmulatorUrl: "http://127.0.0.1:9099" },
    });
  });

  it("never advertises an emulator origin in production", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      writable: true,
    });
    process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL =
      "http://127.0.0.1:9099";

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      firebase: { authEmulatorUrl: null },
    });
  });

  it("refuses a remote emulator-like origin", async () => {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "development",
      configurable: true,
      writable: true,
    });
    process.env.NEXT_PUBLIC_QUIPSLY_FIREBASE_AUTH_EMULATOR_URL =
      "http://attacker.example:9099";

    const response = await GET();

    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      firebase: { authEmulatorUrl: null },
    });
  });
});
