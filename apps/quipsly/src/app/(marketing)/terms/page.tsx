import Link from "next/link";
import { ArrowLeft, FileText } from "lucide-react";

const supportEmail = "charlie@highgroundodyssey.com";

const sections = [
  {
    title: "1. Your agreement with Quipsly",
    body: (
      <>
        These Terms govern your use of Quipsly Capture, Quipsly Nest, and related Quipsly services operated by High Ground Odyssey. By creating an account, purchasing a subscription, or using Quipsly, you agree to these Terms and the <Link href="/privacy">Privacy Policy</Link>. The iOS app is also licensed under Apple&apos;s <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noreferrer">Standard Licensed Application End User License Agreement</a>; these Terms supplement that license for the Quipsly service.
      </>
    ),
  },
  {
    title: "2. Accounts and eligibility",
    body: "You must be at least 18 years old and able to enter a binding agreement. Keep your sign-in methods secure, provide accurate account information, and tell us promptly if you believe someone has accessed your account without permission. You are responsible for activity performed through your account unless it resulted from a Quipsly security failure.",
  },
  {
    title: "3. Coaching Sessions, invitations, and consent",
    body: "A coach controls whom they invite to a private coaching relationship or Session. Every participant must follow applicable recording, privacy, professional, and client-confidentiality rules. Quipsly provides visible recording-consent controls, but it does not determine whether recording is lawful in a participant's location or professionally appropriate. Do not record until every required participant has knowingly consented.",
  },
  {
    title: "4. Your content",
    body: "You keep ownership of recordings, transcripts, notes, tasks, goals, forms, uploads, and other content you provide or create. You give Quipsly a limited license to host, process, copy, transmit, and create technical derivatives of that content only as needed to operate features you request, protect and recover your work, and provide support. You represent that you have the rights and permissions needed to use and share the content.",
  },
  {
    title: "5. Transcription and automated work",
    body: "Transcripts, speaker attribution, summaries, notes, tasks, goals, edits, and other automated results can be incomplete or wrong. Quipsly makes these results editable and keeps them connected to source material where practical, but you remain responsible for reviewing information before relying on it for professional, legal, medical, financial, employment, or safety-sensitive decisions. Quipsly is a workflow tool, not professional advice or a replacement for your judgment.",
  },
  {
    title: "6. Subscriptions and free trials",
    body: "Quipsly Coach subscriptions are offered monthly or annually. If an introductory free trial is shown before purchase, Apple will not charge you until the displayed trial ends; unless canceled, the subscription then renews at the displayed price. Subscriptions renew automatically until canceled at least 24 hours before the end of the current period. Apple processes in-app purchases, renewals, cancellation, and eligible refunds under its terms. Manage an iOS subscription in your Apple Account. Deleting Quipsly does not itself cancel an Apple subscription.",
  },
  {
    title: "7. Acceptable use",
    body: "Do not use Quipsly to violate law or another person's rights; secretly record people; distribute malware; evade access controls; harass, exploit, or impersonate others; interfere with service operation; or upload content you do not have permission to use. Reasonable use limits may apply to protect service reliability and prevent abusive storage, processing, or automated traffic.",
  },
  {
    title: "8. Service changes and account termination",
    body: "We may improve, replace, limit, or discontinue features. We will try to give reasonable notice when a material change affects paid functionality or access to stored work. You may stop using Quipsly at any time. We may suspend or terminate access for a material Terms violation, security threat, unlawful use, nonpayment, or conduct that seriously harms other users or the service. Where practical, we will provide notice and a reasonable export opportunity unless law, safety, or security prevents it.",
  },
  {
    title: "9. Availability, warranties, and liability",
    body: "Quipsly is provided on an as-available basis. To the extent permitted by law, High Ground Odyssey disclaims implied warranties and is not liable for indirect, incidental, special, consequential, or punitive damages, lost profits, or loss caused by content you did not preserve through available export and recovery tools. Our aggregate liability for a claim related to Quipsly will not exceed the amount you paid for the service during the 12 months before the event giving rise to the claim. Some jurisdictions do not allow these limitations, so they may not fully apply to you.",
  },
  {
    title: "10. Changes, governing law, and contact",
    body: "We may update these Terms as Quipsly changes. If a change materially reduces your rights, we will provide reasonable notice through the service or your account email. Continued use after the effective date means you accept the updated Terms. Except where applicable law requires otherwise, these Terms are governed by the laws of the State of Idaho, without regard to conflict-of-law rules. Contact us with questions or disputes so we can try to resolve them promptly.",
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fdf5eb] px-6 py-10 text-[#4a2e1c]">
      <nav className="mx-auto max-w-5xl">
        <Link href="/" className="inline-flex items-center gap-2 font-sans text-sm font-bold text-[#a96735] transition-colors hover:text-[#4a2e1c]">
          <ArrowLeft className="h-4 w-4" /> Back to Quipsly
        </Link>
      </nav>

      <article className="mx-auto mt-10 max-w-5xl rounded-[3rem] border border-[#e8d0b5] bg-white p-8 shadow-sm md:p-14">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-[#e8d0b5] bg-[#fdf5eb]">
          <FileText className="h-8 w-8 text-[#a96735]" />
        </div>
        <p className="mt-6 font-sans text-xs font-black uppercase tracking-[0.24em] text-[#a96735]">Quipsly Terms</p>
        <h1 className="mt-3 font-serif text-4xl font-black tracking-tight text-[#3d2618] md:text-6xl">Terms of Service</h1>
        <p className="mt-4 font-sans text-sm font-semibold text-[#8c552e]">Effective August 26, 2026</p>
        <p className="mt-6 max-w-3xl font-sans text-lg leading-8 text-[#6f523d]">
          Quipsly is built to make creative and coaching work easier. These Terms explain the practical boundaries that let us provide the service while keeping your work and responsibilities clear.
        </p>

        <div className="mt-10 space-y-5">
          {sections.map((section) => (
            <section key={section.title} className="rounded-3xl border border-[#ead8c2] bg-[#fffaf3] p-6 font-sans">
              <h2 className="font-serif text-2xl font-black text-[#3d2618]">{section.title}</h2>
              <p className="mt-3 leading-7 text-[#715742] [&_a]:font-bold [&_a]:text-[#8b4b20] [&_a]:underline [&_a]:underline-offset-4">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-[#315d4f] p-6 font-sans text-[#fff8ec]">
          <h2 className="font-serif text-2xl font-black">Questions?</h2>
          <p className="mt-2 leading-7 text-[#f5e8d1]">Email <a className="font-bold underline underline-offset-4" href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm font-bold">
            <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
            <Link href="/support" className="underline underline-offset-4">Support</Link>
            <a href="https://apps.apple.com/account/subscriptions" className="underline underline-offset-4">Manage Apple subscription</a>
          </div>
        </div>
      </article>
    </main>
  );
}
