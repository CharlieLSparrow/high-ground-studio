import { RefreshCw, ShieldCheck } from "lucide-react";

export function NestRegistryUnavailableState() {
  return (
    <section
      aria-labelledby="nest-registry-unavailable-title"
      aria-live="polite"
      className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 shadow-sm md:p-8"
      role="status"
    >
      <div className="flex max-w-3xl flex-col gap-5 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-amber-200 bg-white text-amber-800 shadow-sm">
          <ShieldCheck aria-hidden="true" size={24} />
        </div>
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">
            Access check paused
          </div>
          <h2
            className="mt-2 font-serif text-2xl font-black text-amber-950 md:text-3xl"
            id="nest-registry-unavailable-title"
          >
            Your Nest list could not be loaded
          </h2>
          <p className="mt-3 text-sm leading-7 text-amber-950/85 md:text-base">
            Quipsly cannot verify which Nests you own or share right now. To protect those access boundaries,
            the list is hidden and creating or bootstrapping Nests is paused.
          </p>
          <p className="mt-3 text-sm leading-7 text-amber-900">
            This is a connection problem, not an empty workspace. When the registry reconnects, this page will
            show your Home Nest, owned Nests, and invited Nests according to your current access.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              className="inline-flex w-fit items-center justify-center gap-2 rounded-full bg-amber-950 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 focus-visible:ring-offset-2"
              href="/projects"
            >
              <RefreshCw aria-hidden="true" size={15} />
              Try again
            </a>
            <p className="text-xs leading-5 text-amber-900/80">
              If it is still unavailable, wait a moment and retry. No substitute Nest list is being shown.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
