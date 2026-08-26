import Link from "next/link";
import { ArrowLeft, CheckCircle2, Mail, Trash2 } from "lucide-react";

export default function AccountDeletionPage() {
  return (
    <div className="min-h-screen bg-[#fdf5eb] text-[#4a2e1c] font-serif selection:bg-[#f4dab0]/50 relative p-6">
      <nav className="fixed top-0 w-full z-50 p-6 flex justify-start max-w-7xl mx-auto">
        <Link
          href="/privacy"
          className="text-sm font-bold text-[#a96735] hover:text-[#4a2e1c] transition-colors flex items-center gap-2 font-sans"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Privacy
        </Link>
      </nav>

      <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center py-24">
        <div className="bg-white border border-[#e8d0b5] rounded-[3rem] p-10 md:p-16 shadow-sm">
          <p className="mb-3 font-sans text-xs font-black uppercase tracking-[0.32em] text-[#a96735]">
            Account deletion
          </p>
          <h1 className="text-3xl md:text-5xl font-bold text-[#3d2618] tracking-tight mb-4">
            Delete your account without a scavenger hunt.
          </h1>
          <p className="text-[#8c552e] font-sans leading-relaxed mb-8 text-lg">
            Start from Account in Quipsly Capture. Confirm once, and Quipsly
            begins the deletion process for your account and eligible personal
            data. You do not need to find every Session, file, or setting first.
          </p>

          <div className="grid gap-4 md:grid-cols-3">
            <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
              <Trash2 className="mb-3 h-6 w-6 text-[#a96735]" />
              <h2 className="mb-2 font-serif text-xl font-bold text-[#3d2618]">
                1. Start the request
              </h2>
              <p className="leading-relaxed text-[#7a604c]">
                In the app, open Account, choose Delete account, and confirm.
                If you cannot sign in, email support from the address tied to
                your Quipsly account.
              </p>
            </section>
            <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
              <CheckCircle2 className="mb-3 h-6 w-6 text-[#a96735]" />
              <h2 className="mb-2 font-serif text-xl font-bold text-[#3d2618]">
                2. Quipsly handles the work
              </h2>
              <p className="leading-relaxed text-[#7a604c]">
                Quipsly removes eligible personal data and disconnects your
                access. Shared records or legally required evidence are retained
                only when necessary and are deleted or anonymized when possible.
              </p>
            </section>
            <section className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
              <Mail className="mb-3 h-6 w-6 text-[#a96735]" />
              <h2 className="mb-2 font-serif text-xl font-bold text-[#3d2618]">
                3. Follow progress
              </h2>
              <p className="leading-relaxed text-[#7a604c]">
                Reopen Account to see progress. Quipsly uses your account email
                only if identity confirmation is needed and to confirm
                completion.
              </p>
            </section>
          </div>

          <div className="mt-8 rounded-3xl border border-[#e4b77d] bg-[#fff6e8] p-6 font-sans text-[#6c4528]">
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">
              Expected timing
            </h2>
            <p className="leading-relaxed">
              Quipsly targets completion within 30 days. If legal retention or
              unusually complex attached records require more time, Quipsly will
              explain the delay. Questions can be sent to{" "}
              <a
                className="font-bold text-[#a65f2c] underline underline-offset-4"
                href="mailto:charlie@highgroundodyssey.com"
              >
                charlie@highgroundodyssey.com
              </a>
              .
            </p>
          </div>

          <div className="mt-8 rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans text-[#7a604c]">
            <h2 className="mb-2 font-serif text-2xl font-bold text-[#3d2618]">
              What may be deleted or retained
            </h2>
            <p className="leading-relaxed">
              Personal account access can be removed and eligible personal data
              can be deleted. Some records may need to be retained or anonymized
              when they are tied to payment evidence, fraud/security logs,
              consent history, legal obligations, or shared workspaces where
              other people still rely on the record.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
