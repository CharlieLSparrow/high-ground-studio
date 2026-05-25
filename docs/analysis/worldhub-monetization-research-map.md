# WorldHub Monetization Research Map

Date: 2026-05-25

This is the first research map for how High Ground Odyssey can monetize without
letting provider platforms become the business model. The matching app-owned
research records live in `WorldHubMonetizationResearchNote` and are seeded from
`/team/growth`.

## Operating Thesis

High Ground should monetize like a creator-led education, podcast, book, and
coaching business:

- owned offers first
- provider integrations as adapters
- public content as discovery
- paid products as projections of private source work
- every ad, affiliate, and sponsor placement tied to disclosure and review
- no platform should become the canonical record of customers, members,
  episode readiness, book state, or coaching state

## Monetization Lanes

| Lane | Best First Use | Provider Pattern | Studio Implication |
| --- | --- | --- | --- |
| Supporter membership | Listener and reader support, bonus updates, community access | Patreon or owned Stripe subscription | Keep tiers and member grants app-owned before provider sync. |
| Owned checkout | Coaching packages, digital products, later memberships | Stripe Checkout/Billing | Reconcile webhooks into WorldHub orders and entitlements. |
| Podcast subscriptions | Bonus episodes, early access, ad-free feeds | Apple Podcasts / Spotify | Treat paid feeds as projections from Studio Cut and Content Studio. |
| Video platform revenue | Discovery clips, full episodes, later channel monetization | YouTube Partner Program | Track channel milestones before optimizing the whole workflow around it. |
| Display ads | Evergreen library and episode pages after traffic grows | Google AdSense | Keep scripts env-gated and add page-level no-ad zones. |
| Book affiliates | Reading lists, show notes, manuscript source references | Amazon Associates / Bookshop | Store ISBN, recommendation reason, provider, and disclosure with each link. |
| Direct sponsorships | Values-aligned podcast reads, episode series, newsletters | Direct sales or marketplace later | Create sponsor inventory, approval, category, and make-good tracking. |
| Merch | Proven phrases, book/show artifacts, field-guide goods | Print-on-demand first | Keep catalog and fulfillment state app-owned before public sales. |
| SEO research | Episode pages, coaching pages, book pages, library pages | Search Console / sitemap workflows | Feed query data back into SEO briefs and production priorities. |
| Compliance | Affiliate links, sponsor reads, gifted products | FTC disclosure baseline | Disclosure must travel with every monetized placement. |

## Seeded Source Set

The first seed set favors primary or official sources:

- Patreon creator fees overview:
  `https://support.patreon.com/hc/en-us/articles/11111747095181-Creator-fees-overview`
- Stripe pricing:
  `https://stripe.com/pricing`
- Apple Podcasters Program overview:
  `https://podcasters.apple.com/support/892-apple-podcasters-program-overview`
- Spotify for Creators monetization:
  `https://creators.spotify.com/features/monetization`
- YouTube Partner Program overview:
  `https://support.google.com/youtube/answer/72851`
- Google AdSense Program policies:
  `https://support.google.com/adsense/answer/48182`
- Google Search Central sitemap guidance:
  `https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap`
- FTC Endorsement Guides:
  `https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides`
- Amazon Associates Operating Agreement:
  `https://affiliate-program.amazon.com/help/operating/agreement/`
- IAB/PwC Internet Advertising Revenue Report, Full Year 2025:
  `https://www.iab.com/wp-content/uploads/2026/04/IAB_PwC_Internet_Ad_Revenue_Report_Full_Year_2025_April_2026.pdf`
- Printful pricing:
  `https://www.printful.com/pricing`

## Near-Term Product Moves

1. Use `/team/growth` to seed the research library.
2. Convert the highest-confidence research notes into concrete placements:
   book recommendations, sponsor slots, AdSense candidates, and coaching offers.
3. Add disclosure readiness to public publishing gates before any public
   affiliate or sponsor placement goes live.
4. Connect Search Console and Analytics imports once credentials are mounted.
5. Add Stripe Checkout for one coaching package before building a large store.
6. Model merch as catalog and fulfillment records before provider calls.

## Explicit Non-Goals For This Slice

- no public affiliate links
- no public sponsor reads
- no AdSense activation without env and policy review
- no Stripe checkout session creation
- no Patreon entitlement mutation
- no merch provider fulfillment call
- no platform-owned canonical customer model

