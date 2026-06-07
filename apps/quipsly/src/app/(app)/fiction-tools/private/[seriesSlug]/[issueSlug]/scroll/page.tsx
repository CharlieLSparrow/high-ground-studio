import { auth } from "@/auth";
import { canAccessPrivateFictionNest } from "@/lib/fiction/private-fiction-access";
import { readPrivateFictionJson } from "@/lib/fiction/private-fiction-seeds";
import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

export const metadata = {
  title: "Private Fiction Scroll Preview",
  robots: "noindex, nofollow",
};

type ScrollPageProps = {
  params: Promise<{ seriesSlug: string; issueSlug: string }>;
};

export default async function PrivateFictionScrollPreview({
  params,
}: ScrollPageProps) {
  const session = await auth();
  const actorEmail = session?.user?.primaryEmail || session?.user?.email;

  if (!(await canAccessPrivateFictionNest(actorEmail))) {
    notFound();
  }

  const { seriesSlug, issueSlug } = await params;

  let seed: any;
  try {
    seed = await readPrivateFictionJson<any>(seriesSlug, issueSlug, "scroll");
  } catch {
    notFound();
  }

  const panelsByAct = new Map<string, any[]>();
  for (const panel of seed.panels || []) {
    const panels = panelsByAct.get(panel.actId) || [];
    panels.push(panel);
    panelsByAct.set(panel.actId, panels);
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="fixed left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/15 bg-black/75 px-3 py-2 text-xs font-black uppercase tracking-[0.2em] text-white shadow-2xl backdrop-blur">
        <Lock className="h-3.5 w-3.5 text-amber-300" />
        Private preview
      </div>

      <Link
        href={`/fiction-tools/private/${seriesSlug}/${issueSlug}`}
        className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-bold text-white shadow-2xl backdrop-blur transition hover:bg-white/20"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Packet
      </Link>

      <section className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-20 text-center">
        <p className="text-[0.68rem] font-black uppercase tracking-[0.35em] text-amber-300">
          {seed.experience?.layout || "Phone-first vertical comic"}
        </p>
        <h1 className="mt-4 text-4xl font-black leading-tight">
          {seed.experience?.title}
        </h1>
        <p className="mt-5 text-sm leading-7 text-white/65">
          One panel per screen. Source packet stays private; this is a Quipsly
          reading projection for checking pacing before images exist.
        </p>
      </section>

      {(seed.sections || []).map((section: any) => {
        const panels = panelsByAct.get(section.id) || [];

        return (
          <section key={section.id}>
            <div className="mx-auto flex min-h-[70svh] max-w-md flex-col justify-center border-y border-white/10 px-6 py-20 text-center">
              <p className="text-[0.65rem] font-black uppercase tracking-[0.35em] text-amber-300">
                Act marker
              </p>
              <h2 className="mt-4 text-3xl font-black leading-tight">
                {section.label}
              </h2>
              <p className="mt-4 text-xs uppercase tracking-[0.22em] text-white/45">
                Panels {section.startPanel}-{section.endPanel}
              </p>
            </div>

            {panels.map((panel) => (
              <article
                key={panel.id}
                className="mx-auto flex min-h-[100svh] max-w-md snap-start flex-col justify-end border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.2),_transparent_34%),linear-gradient(180deg,_#15110d,_#050505)] px-5 pb-14 pt-24"
              >
                <div className="rounded-[2rem] border border-white/15 bg-white/[0.04] p-4 shadow-2xl">
                  <div className="aspect-[9/16] rounded-[1.5rem] border border-white/10 bg-black/45 p-4">
                    <div className="flex h-full flex-col justify-between">
                      <div>
                        <p className="text-[0.62rem] font-black uppercase tracking-[0.28em] text-amber-300">
                          Panel {String(panel.number).padStart(3, "0")}
                        </p>
                        <p className="mt-4 text-xs leading-6 text-white/55">
                          {panel.imagePrompt}
                        </p>
                      </div>

                      {panel.captionOrDialogue ? (
                        <div className="rounded-3xl rounded-br-md border-2 border-black bg-white px-4 py-3 text-black shadow-[6px_6px_0_rgba(0,0,0,0.8)]">
                          <p className="whitespace-pre-wrap text-base font-bold leading-7">
                            {panel.captionOrDialogue}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </main>
  );
}
