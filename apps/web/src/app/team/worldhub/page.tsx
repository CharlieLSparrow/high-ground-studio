import type {
  WorldHubEntitlement,
  WorldHubOffer,
  WorldHubProviderConnection,
  WorldHubSite,
} from "@high-ground/worldhub-domain";
import {
  CalendarDays,
  KeyRound,
  LayoutTemplate,
  Package,
  Plug,
  Repeat,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import GlassPanel from "@/components/ui/GlassPanel";
import PageEyebrow from "@/components/ui/PageEyebrow";

const sampleSites: WorldHubSite[] = [
  {
    id: "site-hgo",
    slug: "high-ground-odyssey",
    name: "High Ground Odyssey",
    kind: "public_site",
    status: "active",
    description: "Primary public storytelling and coaching surface.",
  },
  {
    id: "site-quiplore",
    slug: "quiplore",
    name: "QuipLore",
    kind: "future_site",
    status: "draft",
    description: "Future quote, lore, and supporter surface.",
  },
  {
    id: "site-studio",
    slug: "studio",
    name: "Studio",
    kind: "private_app",
    status: "active",
    description: "Private creative operating system and source cockpit.",
  },
];

const sampleOffers: WorldHubOffer[] = [
  {
    id: "offer-coaching-foundation",
    slug: "coaching-foundation",
    name: "Coaching Foundation",
    kind: "coaching",
    status: "draft",
    productIds: ["product-coaching-package"],
    priceIds: ["price-coaching-foundation"],
    entitlementIds: ["entitlement-coaching-access"],
    summary: "Provider-neutral coaching offer placeholder.",
  },
];

const sampleEntitlements: WorldHubEntitlement[] = [
  {
    id: "entitlement-member-content",
    slug: "member-content",
    name: "Member Content",
    kind: "content_access",
    status: "draft",
    siteIds: ["site-hgo"],
  },
  {
    id: "entitlement-coaching-access",
    slug: "coaching-access",
    name: "Coaching Access",
    kind: "coaching_access",
    status: "draft",
    siteIds: ["site-hgo"],
  },
];

const sampleProviderConnections: WorldHubProviderConnection[] = [
  {
    id: "provider-payment-planned",
    slug: "payment-provider-planned",
    name: "Payment Provider",
    kind: "payment",
    status: "planned",
    accountLabel: "No credentials configured",
  },
  {
    id: "provider-fulfillment-planned",
    slug: "fulfillment-provider-planned",
    name: "Fulfillment Provider",
    kind: "fulfillment",
    status: "planned",
    accountLabel: "No vendor calls enabled",
  },
];

type WorldHubCard = {
  title: string;
  description: string;
  status: string;
  icon: LucideIcon;
};

const cards: WorldHubCard[] = [
  {
    title: "Customers",
    description:
      "People and users shared across HGO, QuipLore, Studio, and future sites.",
    status: `${sampleSites.length} site contexts mapped`,
    icon: Users,
  },
  {
    title: "Offers",
    description:
      "Audience-facing propositions that can point to products, prices, and entitlements.",
    status: `${sampleOffers.length} draft offer`,
    icon: ShoppingBag,
  },
  {
    title: "Subscriptions",
    description:
      "Recurring relationships modeled separately from any payment provider.",
    status: "Model scaffold only",
    icon: Repeat,
  },
  {
    title: "Entitlements",
    description:
      "Access rights and grants for content, coaching, supporter, and Studio workflows.",
    status: `${sampleEntitlements.length} draft entitlements`,
    icon: KeyRound,
  },
  {
    title: "Coaching",
    description:
      "Programs, packages, and sessions that can later map from current appointments.",
    status: "No workflow migration yet",
    icon: CalendarDays,
  },
  {
    title: "Merch / POD",
    description:
      "Future products and fulfillment jobs without vendor-specific core state.",
    status: "Provider adapters blocked",
    icon: Package,
  },
  {
    title: "Provider Connections",
    description:
      "External systems stay at the edge as adapters, not core domain owners.",
    status: `${sampleProviderConnections.length} planned connections`,
    icon: Plug,
  },
  {
    title: "Embeds",
    description:
      "Future site widgets for offers, supporter gates, coaching entry, and merch.",
    status: "SDK not started",
    icon: LayoutTemplate,
  },
];

export default function TeamWorldHubPage() {
  return (
    <section className="space-y-8">
      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <PageEyebrow>WorldHub</PageEyebrow>
          <PageEyebrow>Prototype</PageEyebrow>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start">
          <div>
            <h2 className="m-0 text-[clamp(2rem,4vw,3.4rem)] leading-none tracking-[-0.04em] text-[var(--text-light)]">
              WorldHub foundation
            </h2>
            <p className="mb-0 mt-4 max-w-[760px] text-[1rem] leading-7 text-[rgba(245,239,230,0.88)]">
              Central infrastructure for cross-site offers, access, provider
              connections, coaching packages, merch fulfillment, subscriptions,
              and embeds. This shell is internal sample data only.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200/20 bg-amber-200/10 p-4 text-sm leading-6 text-amber-50">
            No payment checkout, provider API call, Prisma migration, payment
            card handling, or vendor credential storage exists in this
            prototype.
          </div>
        </div>
      </GlassPanel>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.title}
              className="min-h-[220px] rounded-2xl border border-white/10 bg-white/8 p-5 text-[var(--text-light)] shadow-[0_18px_45px_rgba(0,0,0,0.16)]"
            >
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/8 p-3">
                  <Icon
                    aria-hidden="true"
                    className="h-5 w-5 text-[var(--accent)]"
                  />
                </div>
                <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-xs font-semibold text-[rgba(245,239,230,0.8)]">
                  {card.status}
                </span>
              </div>

              <h3 className="m-0 text-[1.25rem] leading-tight text-[var(--text-light)]">
                {card.title}
              </h3>
              <p className="mb-0 mt-3 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
                {card.description}
              </p>
            </article>
          );
        })}
      </section>

      <GlassPanel className="p-6 text-[var(--text-light)]">
        <div className="mb-4">
          <PageEyebrow>Boundary</PageEyebrow>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <h3 className="m-0 text-lg text-[var(--text-light)]">
              Core model
            </h3>
            <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
              Provider-neutral TypeScript types live in
              `packages/worldhub-domain`.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <h3 className="m-0 text-lg text-[var(--text-light)]">
              Admin shell
            </h3>
            <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
              This route is behind the existing team auth boundary at
              `/team/worldhub`.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
            <h3 className="m-0 text-lg text-[var(--text-light)]">
              Adapters later
            </h3>
            <p className="mb-0 mt-2 text-sm leading-6 text-[rgba(245,239,230,0.78)]">
              Payment, supporter, storefront, and fulfillment providers stay
              future edge adapters.
            </p>
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}
