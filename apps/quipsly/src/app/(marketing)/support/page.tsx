const supportEmail = "charlie@highgroundodyssey.com";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#fdf6ea] px-6 py-12 text-[#3d3122]">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-[2.5rem] border border-[#ead9bc] bg-white shadow-[0_30px_100px_rgba(74,45,18,0.12)]">
        <div className="grid gap-8 p-8 md:grid-cols-[1.15fr_0.85fr] md:p-12">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#b36b24]">
              Quipsly support
            </p>
            <h1 className="mt-4 font-serif text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
              Tell us what got in your way.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[#6b5b45]">
              Get help with Quipsly Capture, Nest, recording recovery, account
              access, or a workflow that does not feel clear. Email is the
              current support channel.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={`mailto:${supportEmail}?subject=Quipsly%20support`}
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#ff424d] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_18px_50px_rgba(255,66,77,0.28)] transition hover:-translate-y-0.5 hover:bg-[#ff5962]"
              >
                Email Quipsly support
              </a>
              <a
                href="https://nest.quipsly.com/projects"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d8bd8e] bg-[#fffaf2] px-6 py-3 text-sm font-black uppercase tracking-[0.12em] text-[#6b451b] transition hover:-translate-y-0.5 hover:bg-[#fff3d8]"
              >
                Open the Nest
              </a>
            </div>
            <p className="mt-4 text-sm leading-6 text-[#7c6851]">
              Contact:{" "}
              <a
                className="font-bold text-[#9a541f] underline underline-offset-4"
                href={`mailto:${supportEmail}`}
              >
                {supportEmail}
              </a>
            </p>
          </div>

          <aside className="rounded-[2rem] border border-[#ead9bc] bg-[#fff9ef] p-6">
            <h2 className="font-serif text-2xl font-black">
              Help us find the problem
            </h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-[#6b5b45]">
              <p>
                Include the app version and build, the screen you were on, what
                you expected, and what happened instead.
              </p>
              <p>
                For recording or upload trouble, say whether the local original
                still appears in Library and which recovery message you see.
              </p>
              <p>
                Never email a password, authentication code, private recording,
                coaching transcript, or unpublished source file.
              </p>
            </div>
          </aside>
        </div>

        <div className="grid gap-4 border-t border-[#ead9bc] bg-[#fffdf8] p-8 md:grid-cols-3 md:p-12">
          <section className="rounded-3xl border border-[#ead9bc] bg-white p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b36b24]">
              Account access
            </p>
            <h2 className="mt-2 font-serif text-2xl font-black">
              Sign-in or recovery
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6b5b45]">
              Use password recovery from the sign-in screen first. If the same
              verified email still cannot open your work, contact support.
            </p>
          </section>

          <section className="rounded-3xl border border-[#ead9bc] bg-white p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b36b24]">
              Privacy
            </p>
            <h2 className="mt-2 font-serif text-2xl font-black">
              Your data and account
            </h2>
            <div className="mt-3 flex flex-col items-start gap-2 text-sm font-bold">
              <a
                className="text-[#9a541f] underline underline-offset-4"
                href="/privacy"
              >
                Read the privacy policy
              </a>
              <a
                className="text-[#9a541f] underline underline-offset-4"
                href="/privacy/account-deletion"
              >
                Review account deletion
              </a>
            </div>
          </section>

          <section className="rounded-3xl border border-[#ead9bc] bg-white p-6">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b36b24]">
              Subscription
            </p>
            <h2 className="mt-2 font-serif text-2xl font-black">
              Plan and billing help
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6b5b45]">
              Review Quipsly Coach pricing here. Purchases made in the iPhone
              app are managed through your Apple Account subscriptions.
            </p>
            <div className="mt-4 flex flex-col items-start gap-2 text-sm font-bold">
              <a className="text-[#9a541f] underline underline-offset-4" href="/pricing">
                Review pricing
              </a>
              <a
                className="text-[#9a541f] underline underline-offset-4"
                href="https://apps.apple.com/account/subscriptions"
              >
                Manage Apple subscriptions
              </a>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
