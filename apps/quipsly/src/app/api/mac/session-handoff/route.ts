import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  createMacFirebaseHandoff,
  MacFirebaseHandoffError,
  validateMacCallbackScheme,
  validateMacCodeChallenge,
  validateMacHandoffState,
} from "@/lib/server/mac-firebase-handoff";

export const dynamic = "force-dynamic";

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noStoreHtml(body: string, status = 200, scriptNonce?: string) {
  const scriptPolicy = scriptNonce
    ? `'nonce-${scriptNonce}'`
    : "'none'";
  return new NextResponse(body, {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-security-policy":
        `default-src 'none'; style-src 'unsafe-inline'; script-src ${scriptPolicy}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function errorPage(error: MacFirebaseHandoffError) {
  return noStoreHtml(
    `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Quipsly Mac sign-in needs attention</title>
        <style>
          body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f1e4; color: #3e3326; font-family: ui-sans-serif, system-ui, sans-serif; }
          main { width: min(36rem, calc(100vw - 3rem)); padding: 2rem; border: 1px solid #e2d2b8; border-radius: 1.5rem; background: #fffaf0; box-shadow: 0 1.5rem 4rem rgb(62 51 38 / .12); }
          h1 { font-family: ui-serif, Georgia, serif; font-size: 2rem; }
          p { color: #6f604f; line-height: 1.6; }
        </style>
      </head>
      <body>
        <main>
          <p>Quipsly Studio</p>
          <h1>Start sign-in again from the Mac app.</h1>
          <p>${htmlEscape(error.message)}</p>
          <p>No account or project data was changed.</p>
        </main>
      </body>
    </html>`,
    error.status,
  );
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get("native") !== "1") {
    return errorPage(
      new MacFirebaseHandoffError(
        "native-handoff-required",
        "This endpoint only accepts a sign-in request created by Quipsly Studio.",
      ),
    );
  }

  let callbackScheme: string;
  let state: string;
  let codeChallenge: string;
  try {
    callbackScheme = validateMacCallbackScheme(
      requestUrl.searchParams.get("callbackScheme"),
    );
    state = validateMacHandoffState(requestUrl.searchParams.get("state"));
    codeChallenge = validateMacCodeChallenge(
      requestUrl.searchParams.get("codeChallenge"),
    );
  } catch (error) {
    if (error instanceof MacFirebaseHandoffError) return errorPage(error);
    throw error;
  }

  const session = await auth();
  if (!session?.user?.id) {
    const callbackPath = `${requestUrl.pathname}${requestUrl.search}`;
    const loginUrl = new URL("/login", requestUrl.origin);
    loginUrl.searchParams.set("callbackUrl", callbackPath);
    return NextResponse.redirect(loginUrl, {
      headers: {
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  }

  try {
    const handoff = await createMacFirebaseHandoff({
      user: {
        id: session.user.id,
        firebaseUid: session.user.firebaseUid,
        primaryEmail: session.user.primaryEmail,
        name: session.user.name,
      },
      callbackScheme,
      state,
      codeChallenge,
      deviceLabel: requestUrl.searchParams.get("deviceLabel"),
      userAgent: request.headers.get("user-agent"),
    });

    const callback = new URL(`${handoff.callbackScheme}://auth/session`);
    callback.hash = new URLSearchParams({
      code: handoff.code,
      state: handoff.state,
      expiresAt: handoff.expiresAt,
    }).toString();
    const callbackHref = callback.toString();
    const scriptNonce = randomBytes(24).toString("base64");

    return noStoreHtml(`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Opening Quipsly Studio</title>
          <style>
            body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at 15% 10%, rgb(226 171 90 / .22), transparent 30rem), #f7f1e4; color: #3e3326; font-family: ui-sans-serif, system-ui, sans-serif; }
            main { width: min(42rem, calc(100vw - 3rem)); padding: 2.5rem; border: 1px solid #e2d2b8; border-radius: 1.75rem; background: #fffaf0; box-shadow: 0 1.5rem 4rem rgb(62 51 38 / .12); }
            h1 { margin: .5rem 0; font-family: ui-serif, Georgia, serif; font-size: clamp(2.2rem, 8vw, 4rem); line-height: 1; }
            p { color: #6f604f; line-height: 1.6; }
            a { display: inline-flex; margin-top: 1rem; padding: .85rem 1.2rem; border-radius: 999px; background: #315d4e; color: white; font-weight: 800; text-decoration: none; }
          </style>
        </head>
        <body>
          <main>
            <p>Signed in as ${htmlEscape(handoff.user.email)}</p>
            <h1>Opening Quipsly Studio.</h1>
            <p>The browser created a one-time connection for this Mac. The code expires in five minutes and cannot be replayed.</p>
            <a href="${htmlEscape(callbackHref)}">Open Quipsly Studio</a>
            <p>You can close this page after the app reports that Nest is verified.</p>
          </main>
          <script nonce="${htmlEscape(scriptNonce)}">
            window.setTimeout(() => window.location.replace(${JSON.stringify(callbackHref)}), 150);
          </script>
        </body>
      </html>`, 200, scriptNonce);
  } catch (error) {
    if (error instanceof MacFirebaseHandoffError) return errorPage(error);
    console.error("Quipsly Mac Firebase handoff creation failed", {
      reason: error instanceof Error ? error.message : "unknown",
    });
    return errorPage(
      new MacFirebaseHandoffError(
        "handoff-unavailable",
        "Nest could not create the one-time Mac connection. Try again.",
        503,
      ),
    );
  }
}
