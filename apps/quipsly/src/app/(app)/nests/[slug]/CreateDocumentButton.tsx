"use client";

import { useTransition } from "react";
import { Plus } from "lucide-react";
import { createDocumentAction } from "./actions";

export function CreateDocumentButton({ projectSlug }: { projectSlug: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => {
        startTransition(() => {
          createDocumentAction(projectSlug);
        });
      }}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:bg-[#fff8eb] disabled:opacity-50"
    >
      <Plus size={14} />
      {isPending ? "Creating..." : "New Document"}
    </button>
  );
}
