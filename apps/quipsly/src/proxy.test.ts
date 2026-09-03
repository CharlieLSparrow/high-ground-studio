/** @jest-environment node */

import { NextRequest } from "next/server";

import { proxy } from "./proxy";

function request(host: string, pathname: string) {
  return new NextRequest(`https://${host}${pathname}`, {
    headers: { host },
  });
}

describe("Quipsly host boundary", () => {
  it.each(["quipsly.com", "www.quipsly.com"])(
    "keeps the public coaching product page on %s",
    (host) => {
      const response = proxy(request(host, "/coaching"));

      expect(response.status).toBe(200);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-rewrite")).toBe(
        `https://${host}/public/coaching`,
      );
    },
  );

  it("keeps the private coaching workspace on Nest", () => {
    const response = proxy(request("nest.quipsly.com", "/coaching"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("moves private workbench paths from the marketing domain to Nest", () => {
    const response = proxy(request("quipsly.com", "/projects?view=recent"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://nest.quipsly.com/projects?view=recent",
    );
  });
});
