# Google OAuth redirect URI fix for Nest

Date: 2026-06-09

## Current symptom

Google sign-in reaches Google, then fails with:

- `Error 400: redirect_uri_mismatch`

## Confirmed Nest redirect URI

The live Nest auth route currently generates this Google OAuth callback URI:

```text
https://nest.quipsly.com/api/auth/callback/google
```

This was confirmed by posting to:

```text
https://nest.quipsly.com/api/auth/signin/google
```

and decoding the Google authorization redirect. The app is no longer sending `0.0.0.0` or the internal Cloud Run listener as the OAuth callback.

## Required Google Cloud Console change

In the Google Cloud project `high-ground-odyssey`, edit the OAuth 2.0 Web client used by the Cloud Run `studio` service and add this exact Authorized redirect URI:

```text
https://nest.quipsly.com/api/auth/callback/google
```

Useful Console entry points:

```text
https://console.cloud.google.com/auth/clients?project=high-ground-odyssey
https://console.cloud.google.com/apis/credentials?project=high-ground-odyssey
```

## Access note

The browser session Codex could control was signed in as `charlielsparrow@gmail.com`, which did not have `resourcemanager.projects.get` on `high-ground-odyssey`. The screenshot error was for `charlie@highgroundodyssey.com`, which appears to be the Work/profile account that should make the Google Console change.

## Why this matters

Google requires the `redirect_uri` parameter in the OAuth authorization request to exactly match one Authorized redirect URI on the OAuth client. If the client only allows an old Cloud Run callback or another domain, Nest sign-in will fail even when the app code and Cloud Run env are correct.

## After changing it

Smoke the sign-in boundary without exposing secrets:

```bash
TMP_COOKIES=$(mktemp)
CSRF_JSON=$(curl -sS -c "$TMP_COOKIES" https://nest.quipsly.com/api/auth/csrf)
CSRF=$(node -e 'const fs=require("fs"); const j=JSON.parse(fs.readFileSync(0,"utf8")); process.stdout.write(j.csrfToken||"")' <<< "$CSRF_JSON")
LOCATION=$(curl -sS -b "$TMP_COOKIES" -c "$TMP_COOKIES" -o /dev/null -w '%{redirect_url}' -X POST https://nest.quipsly.com/api/auth/signin/google --data-urlencode "csrfToken=$CSRF" --data-urlencode "callbackUrl=/projects")
rm -f "$TMP_COOKIES"
node -e 'const u=new URL(process.argv[1]); console.log(u.searchParams.get("redirect_uri"));' "$LOCATION"
```

Expected output:

```text
https://nest.quipsly.com/api/auth/callback/google
```

Then retry Google sign-in in the Work Chrome profile.
