"use client";

import { Copy, Download, ShieldCheck, Terminal } from "lucide-react";
import { useState } from "react";

type OperatorHandoffPanelProps = {
  fileName: string;
  handoffJson: string;
  route: string;
  approvalStop: string;
  preflightCommands: string[];
};

function downloadTextFile(fileName: string, value: string) {
  const blob = new Blob([value], {
    type: "application/json;charset=utf-8",
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export default function OperatorHandoffPanel({
  approvalStop,
  fileName,
  handoffJson,
  preflightCommands,
  route,
}: OperatorHandoffPanelProps) {
  const [message, setMessage] = useState("");

  function copyToClipboard(label: string, value: string) {
    setMessage("");

    if (!navigator.clipboard?.writeText) {
      setMessage("Clipboard access is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => setMessage(`${label} copied to clipboard.`))
      .catch(() => setMessage(`${label} copy failed.`));
  }

  return (
    <section className="rounded-2xl border border-cyan-200/20 bg-cyan-300/10 p-4 text-cyan-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase text-cyan-100/75">
            <ShieldCheck aria-hidden="true" className="h-4 w-4" />
            Operator Handoff
          </div>
          <h3 className="m-0 mt-1 text-xl leading-tight text-cyan-50">
            Public publish approval packet
          </h3>
        </div>
        <code className="rounded-full border border-cyan-200/25 bg-black/20 px-3 py-1 text-xs">
          {route}
        </code>
      </div>

      <p className="m-0 mt-3 rounded-xl border border-amber-200/25 bg-amber-300/10 p-3 text-sm font-semibold leading-6 text-amber-50">
        {approvalStop}
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200/25 bg-cyan-300/12 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/18"
          onClick={() => copyToClipboard("Operator handoff packet", handoffJson)}
          type="button"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy Handoff Packet
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-cyan-200/25 bg-black/20 px-3 py-2 text-sm font-semibold text-cyan-50 transition hover:bg-cyan-300/12"
          onClick={() => downloadTextFile(fileName, handoffJson)}
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download Handoff Packet
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-cyan-100/75">
          <Terminal aria-hidden="true" className="h-4 w-4" />
          Preflight
        </div>
        <div className="grid gap-2">
          {preflightCommands.map((command) => (
            <code
              className="block overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-xs leading-5 text-cyan-50"
              key={command}
            >
              {command}
            </code>
          ))}
        </div>
      </div>

      {message ? (
        <p className="m-0 mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs font-semibold leading-5 text-cyan-50/85">
          {message}
        </p>
      ) : null}
    </section>
  );
}
