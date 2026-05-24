# Web Custom Domain Readiness Result

Date: 2026-05-23

## Goal

Move the deployed web Cloud Run service closer to the real
`HighGroundOdyssey.com` surface without disrupting the existing root or `www`
public site.

## Live Cloud Run State

Initial web service:

```text
project: high-ground-odyssey
region: us-central1
service: web
latest ready revision: web-00005-r68
url: https://web-hm2odnvjga-uc.a.run.app
runtime service account: web-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
```

Initial Studio service:

```text
project: high-ground-odyssey
region: us-central1
service: studio
latest ready revision: studio-00027-8gx
url: https://studio-hm2odnvjga-uc.a.run.app
runtime service account: studio-cloud-run@high-ground-odyssey.iam.gserviceaccount.com
```

The web runtime currently has:

```text
AUTH_TRUST_HOST=true
AUTH_URL=https://web-hm2odnvjga-uc.a.run.app
HGO_SITE_URL=https://web-hm2odnvjga-uc.a.run.app
```

Those values should stay on the Cloud Run URL until the custom-domain DNS,
managed certificate, and Google OAuth callback are ready.

After PR #13 merged to `main` as `4de9fb8`, GitHub Actions run
`26348319193` redeployed both services successfully:

```text
web latest ready revision: web-00006-m6l
studio latest ready revision: studio-00028-qlk
```

Live smokes passed:

```text
https://web-hm2odnvjga-uc.a.run.app/api/health
https://studio-hm2odnvjga-uc.a.run.app/api/health
https://web-hm2odnvjga-uc.a.run.app/team/progress unauthenticated redirect
```

## Domain Mapping State

Cloud Run domain mapping:

```text
domain: app.highgroundodyssey.com
route: web
requested DNS: app CNAME ghs.googlehosted.com.
domain routable: true
ready: certificate pending
```

Cloud Run is waiting for DNS propagation before it can issue the managed TLS
certificate.

## Public DNS State

Observed public DNS:

```text
highgroundodyssey.com NS ns-cloud-a1.googledomains.com.
highgroundodyssey.com NS ns-cloud-a2.googledomains.com.
highgroundodyssey.com NS ns-cloud-a3.googledomains.com.
highgroundodyssey.com NS ns-cloud-a4.googledomains.com.
highgroundodyssey.com A 216.198.79.1
www.highgroundodyssey.com CNAME 784e41f12c311b3d.vercel-dns-017.com.
app.highgroundodyssey.com NXDOMAIN
```

WHOIS reports the registrar as Squarespace Domains LLC.

Cloud DNS API was not enabled in the accessible Google Cloud projects checked
from this workstation, including `high-ground-odyssey`, so the authoritative
DNS record is not currently editable through `gcloud dns` here. The DNS record
likely needs to be added through Squarespace Domains or the legacy Google
Domains DNS surface.

## Required DNS Record

Add only this staging record:

```text
type: CNAME
host/name: app
value/target: ghs.googlehosted.com.
ttl: default is fine
```

Do not change root `highgroundodyssey.com` or `www.highgroundodyssey.com` in
this pass.

## New Operator Check

Added:

```text
scripts/web-domain-readiness.mjs
```

Wired package script:

```bash
pnpm web:domain:check
```

The check is read-only. It inspects public DNS, the Cloud Run domain mapping,
the managed certificate state, and non-secret web runtime origin values. It
prints the exact cutover steps but does not change DNS, OAuth, Cloud Run,
secrets, IAM, or databases.

## Cutover Sequence

1. Add `app CNAME ghs.googlehosted.com.` in the DNS manager.
2. Run `pnpm web:domain:check` until the CNAME is visible and Cloud Run reports
   the managed certificate ready.
3. Add this Google OAuth authorized redirect URI:

   ```text
   https://app.highgroundodyssey.com/api/auth/callback/google
   ```

4. Update Cloud Run runtime origin:

   ```bash
   gcloud run services update web \
     --project=high-ground-odyssey \
     --region=us-central1 \
     --update-env-vars=AUTH_URL=https://app.highgroundodyssey.com,HGO_SITE_URL=https://app.highgroundodyssey.com,AUTH_TRUST_HOST=true
   ```

5. Smoke:

   ```bash
   curl -i https://app.highgroundodyssey.com/api/health
   curl -I https://app.highgroundodyssey.com/
   curl -i https://app.highgroundodyssey.com/team/progress
   ```

## Safety Notes

- No root or `www` DNS records were changed.
- No Google OAuth client was changed.
- No Cloud Run env vars were changed in this pass.
- No secrets, IAM, databases, Prisma schema, or deploy targets were changed.
