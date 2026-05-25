import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAnalyticsMetrics,
  buildMonetizationMetadata,
  buildSeoChecklist,
  normalizeContentPath,
  normalizeGrowthSlug,
  scoreSeoChecklist,
  splitKeywordList,
} from "../apps/web/src/lib/worldhub/growth-tools.ts";

test("normalizes growth slugs and content paths", () => {
  assert.equal(normalizeGrowthSlug("  HGO Home!!! ", "fallback"), "hgo-home");
  assert.equal(normalizeGrowthSlug("", "Leadership Coaching"), "leadership-coaching");
  assert.equal(normalizeContentPath("episodes/test"), "/episodes/test");
  assert.equal(
    normalizeContentPath("https://app.highgroundodyssey.com/library?tag=books"),
    "/library?tag=books",
  );
  assert.equal(normalizeContentPath(""), null);
});

test("deduplicates comma-separated SEO keywords", () => {
  assert.deepEqual(splitKeywordList("leadership, family, leadership,  legacy "), [
    "leadership",
    "family",
    "legacy",
  ]);
});

test("scores SEO briefs from actionable checklist fields", () => {
  const weakChecklist = buildSeoChecklist({
    title: "Untargeted draft",
  });
  const readyChecklist = buildSeoChecklist({
    title: "Leadership Story",
    targetPath: "/episodes/leadership-story",
    primaryKeyword: "leadership story",
    secondaryKeywords: ["family leadership", "legacy"],
    metaTitle: "Leadership Story From High Ground Odyssey",
    metaDescription:
      "A High Ground Odyssey leadership story about family, legacy, and practical lessons from experience.",
    structuredDataType: "Article",
  });

  assert.ok(scoreSeoChecklist(weakChecklist) < 50);
  assert.ok(scoreSeoChecklist(readyChecklist) >= 90);
});

test("builds analytics metrics with derived rates", () => {
  assert.deepEqual(
    buildAnalyticsMetrics({
      pageViews: "100",
      sessions: "50",
      clicks: "10",
      impressions: "200",
      conversions: "5",
      revenueCents: "1234",
    }),
    {
      pageViews: 100,
      sessions: 50,
      clicks: 10,
      impressions: 200,
      conversions: 5,
      revenueCents: 1234,
      clickThroughRate: 0.05,
      conversionRate: 0.1,
    },
  );
});

test("omits blank monetization metadata", () => {
  assert.deepEqual(
    buildMonetizationMetadata({
      affiliateProgram: "Amazon Associates",
      productAuthor: "",
      productIsbn: "9780000000000",
      adSlot: null,
      sponsorCategory: "books",
    }),
    {
      affiliateProgram: "Amazon Associates",
      productIsbn: "9780000000000",
      sponsorCategory: "books",
    },
  );
});
