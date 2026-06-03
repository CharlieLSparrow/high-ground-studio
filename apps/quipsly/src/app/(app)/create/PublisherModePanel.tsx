"use client";

import Link from "next/link";
import type { ViewDefinition } from "./types";

type PublisherModePanelProps = {
  activeView: ViewDefinition;
  documentTitle?: string;
};

const publishingTargets = [
  {
    label: "High Ground Odyssey",
    description: "Prepare the current manuscript lens for the public content site.",
    href: "/publishing",
  },
  {
    label: "Podcast",
    description: "Package episode notes, transcript material, and publish-ready metadata.",
    href: "/podcast",
  },
  {
    label: "YouTube",
    description: "Move selected quotes, clips, and episode beats toward video publishing.",
    href: "/editor",
  },
  {
    label: "Social",
    description: "Use quote and media tags as the source pool for short-form posts.",
    href: "/collections",
  },
];

export default function PublisherModePanel({
  activeView,
  documentTitle,
}: PublisherModePanelProps) {
  return (
    <section className="mb-6 rounded-2xl border border-[#d3a24f] bg-[#fff5df] p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.22em] text-[#9a5f13]">
            Publisher Mode
          </div>
          <h2 className="mt-1 font-serif text-2xl font-bold text-[#342618]">
            Publish from the current lens.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b5b45]">
            Current source: {documentTitle ?? "Untitled manuscript"} / {activeView.name}. This stays operator-only so the writing surface can remain simple.
          </p>
        </div>
        <div className="rounded-full border border-[#d3a24f] bg-white px-3 py-1 text-xs font-bold text-[#9a5f13]">
          Private operator layer
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        {publishingTargets.map((target) => (
          <Link
            key={target.href}
            href={target.href}
            className="rounded-xl border border-[#e3c88f] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#c58b2a] hover:shadow-md"
          >
            <div className="font-serif text-lg font-bold text-[#3d3122]">{target.label}</div>
            <p className="mt-2 text-xs leading-5 text-[#6b5b45]">{target.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
