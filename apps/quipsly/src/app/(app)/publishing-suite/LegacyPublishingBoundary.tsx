import Link from "next/link";
import { Archive, ArrowRight, BarChart3, CalendarDays, RadioTower } from "lucide-react";

export type LegacyPublishingSurface =
  | "overview"
  | "package-builder"
  | "calendar"
  | "analytics"
  | "connections"
  | "youtube";

type Destination = {
  description: string;
  href: "/publishing" | "/schedule" | "/analytics";
  label: string;
};

type SurfaceCopy = {
  description: string;
  primaryHref: Destination["href"];
  title: string;
};

const destinations: Destination[] = [
  {
    href: "/publishing",
    label: "Publishing runway",
    description: "Inspect persisted output packets, attempts, artifacts, and provider receipts.",
  },
  {
    href: "/schedule",
    label: "Schedule",
    description: "See sessions, committed work, and output dates that Quipsly can read from its own records.",
  },
  {
    href: "/analytics",
    label: "Analytics",
    description: "See only metrics Quipsly can verify; unavailable sources stay explicitly unavailable.",
  },
];

export const legacyPublishingSurfaceCopy: Record<LegacyPublishingSurface, SurfaceCopy> = {
  overview: {
    title: "The Transmitter prototype is retired",
    description:
      "This suite mixed sample data with live-looking publishing controls. It is no longer an operational surface. Nothing on this route can publish, schedule, or connect an account.",
    primaryHref: "/publishing",
  },
  "package-builder": {
    title: "The legacy package builder is retired",
    description:
      "Package state now comes from persisted output packets and publication receipts. The prototype controls on this route are disabled so a local preview cannot be mistaken for a real publish or retraction.",
    primaryHref: "/publishing",
  },
  calendar: {
    title: "The sample dispatch calendar is retired",
    description:
      "The events previously shown here were demonstration fixtures, not scheduled work. Use Schedule for dates and commitments backed by Quipsly records.",
    primaryHref: "/schedule",
  },
  analytics: {
    title: "The sample analytics dashboard is retired",
    description:
      "The audience totals, growth rates, and top-content rows previously shown here were demonstration values. Use Analytics for evidence-backed metrics and honest unavailable states.",
    primaryHref: "/analytics",
  },
  connections: {
    title: "Legacy channel connections are disabled",
    description:
      "This prototype did not provide a verified end-to-end account-management boundary. It cannot start OAuth, connect a channel, or authorize publishing. Publication receipts remain visible in the real runway.",
    primaryHref: "/publishing",
  },
  youtube: {
    title: "The simulated YouTube desk is retired",
    description:
      "The channel identity, subscriber count, quota health, upload progress, and success message on this route were simulated. Use the publishing runway to inspect only persisted YouTube attempts and receipts.",
    primaryHref: "/publishing",
  },
};

const destinationIcons: Record<Destination["href"], typeof RadioTower> = {
  "/publishing": RadioTower,
  "/schedule": CalendarDays,
  "/analytics": BarChart3,
};

export function LegacyPublishingBoundary({ surface }: { surface: LegacyPublishingSurface }) {
  const copy = legacyPublishingSurfaceCopy[surface];
  const orderedDestinations = [
    destinations.find((destination) => destination.href === copy.primaryHref)!,
    ...destinations.filter((destination) => destination.href !== copy.primaryHref),
  ];

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center px-6 py-12">
      <section
        aria-labelledby="legacy-publishing-title"
        className="w-full overflow-hidden rounded-[2rem] border border-amber-200 bg-[#fffdf8] shadow-sm"
      >
        <div className="border-b border-amber-200 bg-amber-50/70 px-7 py-6 sm:px-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-amber-900">
            <Archive aria-hidden="true" className="h-4 w-4" />
            Archived prototype
          </div>
          <h1 id="legacy-publishing-title" className="max-w-3xl text-3xl font-black tracking-tight text-[#332719] sm:text-4xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#705c44]">{copy.description}</p>
        </div>

        <div className="px-7 py-7 sm:px-10 sm:py-9">
          <p className="mb-5 text-sm font-semibold text-[#59452f]">
            Continue in a surface that names the evidence it can verify:
          </p>
          <div className="grid gap-4 lg:grid-cols-3">
            {orderedDestinations.map((destination, index) => {
              const Icon = destinationIcons[destination.href];
              const isPrimary = index === 0;

              return (
                <Link
                  key={destination.href}
                  href={destination.href}
                  className={`group flex min-h-44 flex-col rounded-2xl border p-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
                    isPrimary
                      ? "border-[#3d3122] bg-[#3d3122] text-white hover:bg-[#523f2b]"
                      : "border-[#e6dccd] bg-white text-[#3d3122] hover:border-amber-400 hover:bg-amber-50/40"
                  }`}
                >
                  <Icon aria-hidden="true" className={`h-6 w-6 ${isPrimary ? "text-amber-300" : "text-amber-700"}`} />
                  <span className="mt-5 text-lg font-black">{destination.label}</span>
                  <span className={`mt-2 flex-1 text-sm leading-6 ${isPrimary ? "text-stone-200" : "text-[#78654e]"}`}>
                    {destination.description}
                  </span>
                  <span className={`mt-4 inline-flex items-center gap-2 text-sm font-bold ${isPrimary ? "text-amber-300" : "text-amber-800"}`}>
                    Open {destination.label.toLowerCase()}
                    <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              );
            })}
          </div>

          <p className="mt-7 text-xs leading-5 text-[#88745b]">
            This archived boundary is read-only. It does not call a provider, modify a package, or claim that a service is connected.
          </p>
        </div>
      </section>
    </main>
  );
}
