"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyInviteLinkButton({ inviteLink }: { inviteLink: string }) {
  const [copied, setCopied] = useState(false);

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyInviteLink}
      className="inline-flex items-center gap-2 rounded-full border border-[#eadfca] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#8c6b4a] shadow-sm transition hover:-translate-y-0.5 hover:border-[#c28a37]"
      title={inviteLink}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      <span>{copied ? "Copied" : "Copy invite link"}</span>
    </button>
  );
}
