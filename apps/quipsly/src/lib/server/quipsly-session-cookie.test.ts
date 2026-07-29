import {
  QUIPSLY_SESSION_COOKIE_DOMAIN,
  quipslySessionCookieDomain,
  quipslySessionCookieOptions,
} from "./quipsly-session-cookie";

function request(url: string, headers: Record<string, string> = {}) {
  const normalizedHeaders = new Map(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    url,
    headers: {
      get(name: string) {
        return normalizedHeaders.get(name.toLowerCase()) ?? null;
      },
    },
  } as Request;
}

describe("Quipsly web session cookie boundary", () => {
  it.each([
    "https://quipsly.com/api/auth/session",
    "https://www.quipsly.com/api/auth/session",
    "https://nest.quipsly.com/api/auth/session",
  ])("shares first-party sessions across controlled Quipsly hosts: %s", (url) => {
    const sessionRequest = request(url);

    expect(quipslySessionCookieDomain(sessionRequest))
      .toBe(QUIPSLY_SESSION_COOKIE_DOMAIN);
    expect(quipslySessionCookieOptions(sessionRequest, 300)).toMatchObject({
      domain: QUIPSLY_SESSION_COOKIE_DOMAIN,
      httpOnly: true,
      maxAge: 300,
      path: "/",
      sameSite: "lax",
      secure: true,
    });
  });

  it("does not leak a Domain attribute into localhost or Cloud Run previews", () => {
    expect(
      quipslySessionCookieDomain(
        request("http://localhost:3000/api/auth/session"),
      ),
    ).toBeUndefined();
    expect(
      quipslySessionCookieDomain(
        request("https://quipsly-preview---studio.example.run.app/api/auth/session"),
      ),
    ).toBeUndefined();
  });

  it("honors the original Quipsly host behind the trusted production proxy", () => {
    const sessionRequest = request(
      "https://studio-hash-uc.a.run.app/api/auth/session",
      { "x-forwarded-host": "nest.quipsly.com" },
    );

    expect(quipslySessionCookieDomain(sessionRequest))
      .toBe(QUIPSLY_SESSION_COOKIE_DOMAIN);
  });
});
