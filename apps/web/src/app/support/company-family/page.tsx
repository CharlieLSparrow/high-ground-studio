import { readdir } from "node:fs/promises";
import path from "node:path";

import Image from "next/image";
import Link from "next/link";

import GlassPanel from "@/components/ui/GlassPanel";
import PageContainer from "@/components/ui/PageContainer";
import PageEyebrow from "@/components/ui/PageEyebrow";

import { submitCompanySupportRequestAction } from "./actions";

type SearchParams = Promise<{
  support?: string;
  error?: string;
}>;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif"]);

async function getCompanySupportImages() {
  const directory = path.join(
    process.cwd(),
    "apps/web/public/images/company-support",
  );

  try {
    const entries = await readdir(directory, { withFileTypes: true });

    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => IMAGE_EXTENSIONS.has(path.extname(name).toLowerCase()))
      .sort((left, right) => left.localeCompare(right))
      .slice(0, 6)
      .map((name) => `/images/company-support/${name}`);
  } catch {
    return [];
  }
}

function StatusMessage({
  success,
  error,
}: {
  success?: string;
  error?: string;
}) {
  if (!success && !error) {
    return null;
  }

  const isError = Boolean(error);
  const message = error ?? success ?? "";

  return (
    <div
      className={[
        "rounded-2xl border px-4 py-3 text-sm font-medium",
        isError
          ? "border-amber-200/20 bg-amber-100/8 text-[rgba(245,239,230,0.92)]"
          : "border-emerald-300/20 bg-emerald-300/10 text-[rgba(245,239,230,0.94)]",
      ].join(" ")}
    >
      {message}
    </div>
  );
}

function PlaceholderFrame({ label }: { label: string }) {
  return (
    <div className="flex min-h-[180px] items-end rounded-[24px] border border-dashed border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-[rgba(245,239,230,0.56)]">
        {label}
      </div>
    </div>
  );
}

export default async function CompanyFamilySupportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { support, error } = await searchParams;
  const familySupportUrl =
    process.env.HGO_COMPANY_FAMILY_SUPPORT_URL?.trim() || null;
  const images = await getCompanySupportImages();

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#081316_0%,#11272d_24%,#1a3034_58%,#263235_100%)] pb-20 text-[var(--text-light)]">
      <PageContainer className="pt-10">
        <div className="space-y-8">
          <StatusMessage
            success={
              support === "requested"
                ? "Thank you. We received your note and will get it to the right person."
                : undefined
            }
            error={error}
          />

          <section className="rounded-[40px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.24)] md:p-10 lg:p-14">
            <div className="max-w-[820px]">
              <PageEyebrow>Company Support</PageEyebrow>
              <h1 className="m-0 mt-5 text-[clamp(3rem,7vw,5.9rem)] leading-[0.9] tracking-[-0.06em] text-[var(--text-light)]">
                Honoring one of our own.
              </h1>
              <p className="mb-0 mt-6 max-w-[720px] text-[1.08rem] leading-8 text-[rgba(245,239,230,0.94)]">
                We are gathering support for the family and helping members of
                the company coordinate travel, lodging, and connection.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                {familySupportUrl ? (
                  <Link
                    href={familySupportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex rounded-full border border-flare/35 bg-flare/18 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-flare/50 hover:bg-flare/24"
                  >
                    Support the Family
                  </Link>
                ) : (
                  <span className="inline-flex rounded-full border border-white/12 bg-white/8 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[rgba(245,239,230,0.64)]">
                    Support the Family
                  </span>
                )}

                <a
                  href="#request-help"
                  className="inline-flex rounded-full border border-white/12 bg-white/8 px-7 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] no-underline transition hover:border-white/18 hover:bg-white/12"
                >
                  Request lodging help
                </a>
              </div>

              {!familySupportUrl ? (
                <p className="mb-0 mt-4 text-sm leading-7 text-[rgba(245,239,230,0.76)]">
                  The family support link will be added soon.
                </p>
              ) : null}
            </div>
          </section>

          <section className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <GlassPanel className="p-7 text-[var(--text-light)] md:p-8">
              <PageEyebrow>Support</PageEyebrow>
              <h2 className="m-0 mt-4 text-[2rem] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
                Support for the family
              </h2>
              <p className="mb-0 mt-5 text-[1rem] leading-8 text-[rgba(245,239,230,0.9)]">
                This page is being set up to help gather practical support for
                the family. Contributions will go through the linked giving page
                once it is available.
              </p>

              <div className="mt-6 rounded-2xl border border-white/10 bg-white/6 p-4 text-sm leading-7 text-[rgba(245,239,230,0.8)]">
                Please do not treat this as tax advice. Contributions are not
                described as tax-deductible unless the giving platform or
                receiving organization explicitly says so.
              </div>
            </GlassPanel>

            <section id="request-help">
              <GlassPanel className="p-7 text-[var(--text-light)] md:p-8">
                <PageEyebrow>Coordination</PageEyebrow>
                <h2 className="m-0 mt-4 text-[2rem] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
                  Help coordinating places to stay
                </h2>
                <p className="mb-0 mt-5 text-[1rem] leading-8 text-[rgba(245,239,230,0.9)]">
                  If you served with the company, are traveling in, or may be able
                  to help someone find a place to stay, leave your contact
                  information and a short note. We will pass it to the right
                  person coordinating support.
                </p>

                <form
                  action={submitCompanySupportRequestAction}
                  className="mt-6 space-y-4"
                >
                  <input
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    className="hidden"
                    aria-hidden="true"
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="name"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Name
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        maxLength={160}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="email"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Email
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        required
                        maxLength={240}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label
                        htmlFor="phone"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Phone <span className="font-normal text-[rgba(245,239,230,0.66)]">optional</span>
                      </label>
                      <input
                        id="phone"
                        name="phone"
                        type="tel"
                        maxLength={80}
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="preferredContactMethod"
                        className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                      >
                        Preferred contact method
                      </label>
                      <select
                        id="preferredContactMethod"
                        name="preferredContactMethod"
                        required
                        defaultValue="EMAIL"
                        className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      >
                        <option value="EMAIL" className="text-black">
                          Email
                        </option>
                        <option value="PHONE_CALL" className="text-black">
                          Phone call
                        </option>
                        <option value="TEXT" className="text-black">
                          Text
                        </option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="supportType"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      How can we route your note?
                    </label>
                    <select
                      id="supportType"
                      name="supportType"
                      required
                      defaultValue="NEED_LODGING"
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                    >
                      <option value="NEED_LODGING" className="text-black">
                        I need help finding a place to stay
                      </option>
                      <option value="OFFER_LODGING_HELP" className="text-black">
                        I may be able to help with lodging
                      </option>
                      <option value="OTHER_SUPPORT" className="text-black">
                        Other
                      </option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="note"
                      className="mb-2 block text-sm font-semibold text-[var(--text-light)]"
                    >
                      Note
                    </label>
                    <textarea
                      id="note"
                      name="note"
                      rows={6}
                      maxLength={1600}
                      className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-[var(--text-light)] outline-none"
                      placeholder="Anything that would help the coordinator know what you need or what you may be able to offer."
                    />
                  </div>

                  <button
                    type="submit"
                    className="rounded-full border border-flare/35 bg-flare/18 px-6 py-3 text-sm font-bold uppercase tracking-[0.08em] text-[var(--text-light)] transition hover:border-flare/50 hover:bg-flare/24"
                  >
                    Send request
                  </button>
                </form>
              </GlassPanel>
            </section>
          </section>

          <section className="space-y-5">
            <div className="max-w-[760px]">
              <PageEyebrow>Company</PageEyebrow>
              <h2 className="m-0 mt-4 text-[2rem] leading-[0.95] tracking-[-0.05em] text-[var(--text-light)]">
                Photos from the company
              </h2>
              <p className="mb-0 mt-4 text-[1rem] leading-8 text-[rgba(245,239,230,0.88)]">
                We will add photos here as they come in from the men who served
                with him.
              </p>
            </div>

            {images.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((imageSrc, index) => (
                  <div
                    key={imageSrc}
                    className="relative min-h-[220px] overflow-hidden rounded-[24px] border border-white/10 bg-white/4"
                  >
                    <Image
                      src={imageSrc}
                      alt={`Company photo ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 50vw, 33vw"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <PlaceholderFrame label="Photo placeholder one" />
                <PlaceholderFrame label="Photo placeholder two" />
                <PlaceholderFrame label="Photo placeholder three" />
              </div>
            )}
          </section>
        </div>
      </PageContainer>
    </main>
  );
}
