# Web Cloud Run Domain Mapping Result

Date: 2026-05-23

## Scope

Created a low-risk Cloud Run custom-domain mapping for the web service at
`app.highgroundodyssey.com`.

This does not move the root `highgroundodyssey.com` site yet.

## Mapping Created

- project: `high-ground-odyssey`
- region: `us-central1`
- Cloud Run service: `web`
- mapped domain: `app.highgroundodyssey.com`
- mapped route: `web`
- mapping status: domain routable, certificate pending DNS

Cloud Run requested this DNS record:

```text
app CNAME ghs.googlehosted.com.
```

## Current DNS Findings

Public nameservers for `highgroundodyssey.com`:

```text
ns-cloud-a1.googledomains.com.
ns-cloud-a2.googledomains.com.
ns-cloud-a3.googledomains.com.
ns-cloud-a4.googledomains.com.
```

Current public records observed:

```text
highgroundodyssey.com A 216.198.79.1
www.highgroundodyssey.com CNAME 784e41f12c311b3d.vercel-dns-017.com.
www.highgroundodyssey.com A 64.29.17.1
www.highgroundodyssey.com A 216.198.79.1
```

`high-ground-odyssey` currently has no visible Cloud DNS zone for this domain,
and Cloud DNS / Cloud Domains APIs are not enabled in that project. The active
DNS zone likely lives in another Google project/account or a managed DNS surface
not visible through the current project.

## Next Step

Add this DNS record wherever the active `highgroundodyssey.com` DNS zone is
managed:

```text
Name: app
Type: CNAME
Value: ghs.googlehosted.com.
TTL: default or 300
```

After DNS propagates:

1. Wait for Cloud Run certificate provisioning.
2. Verify `https://app.highgroundodyssey.com/api/health`.
3. Add Google OAuth callback:
   `https://app.highgroundodyssey.com/api/auth/callback/google`
4. Update the web Cloud Run service:

   ```bash
   gcloud run services update web \
     --project=high-ground-odyssey \
     --region=us-central1 \
     --update-env-vars=AUTH_URL=https://app.highgroundodyssey.com,HGO_SITE_URL=https://app.highgroundodyssey.com,AUTH_TRUST_HOST=true
   ```

5. Smoke `/`, `/api/health`, and `/team/progress`.

## Boundaries Preserved

- No root-domain DNS change.
- No OAuth client mutation.
- No production database mutation.
- No Prisma schema change.
- No `db:push`.
