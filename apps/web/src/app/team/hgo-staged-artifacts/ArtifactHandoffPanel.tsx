"use client";

import { Copy, Download, ExternalLink } from "lucide-react";
import { useState } from "react";

type ArtifactHandoffPanelProps = {
  artifactFileName: string;
  artifactJson: string;
  artifactTitle: string;
  publishCandidateFileName: string;
  publishCandidateJson: string;
  publishReviewBriefFileName?: string;
  publishReviewBriefJson?: string;
};

function downloadJsonFile(fileName: string, value: string) {
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

export default function ArtifactHandoffPanel({
  artifactFileName,
  artifactJson,
  artifactTitle,
  publishCandidateFileName,
  publishCandidateJson,
  publishReviewBriefFileName,
  publishReviewBriefJson,
}: ArtifactHandoffPanelProps) {
  const [message, setMessage] = useState("");
  const hasReviewBrief = Boolean(
    publishReviewBriefFileName && publishReviewBriefJson,
  );

  function copyToClipboard(label: string, value: string) {
    setMessage("");

    if (!navigator.clipboard?.writeText) {
      setMessage("Clipboard access is not available in this browser.");
      return;
    }

    void navigator.clipboard
      .writeText(value)
      .then(() => setMessage(`${label} copied to clipboard.`))
      .catch(() =>
        setMessage(`${label} copy failed. Download or select the JSON manually.`),
      );
  }

  function copyArtifactAndInspect() {
    copyToClipboard("Artifact JSON", artifactJson);
    window.open(
      "/projection-stage/artifact?source=team-shelf",
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="mt-5 rounded-2xl border border-sky-300/20 bg-sky-300/10 p-4 text-sm leading-6 text-sky-50">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase text-sky-100/75">
            Saved artifact handoff
          </div>
          <h4 className="m-0 mt-1 text-lg leading-tight text-sky-50">
            Reopen immutable review JSON
          </h4>
        </div>
        <span className="rounded-full border border-sky-200/25 bg-black/20 px-3 py-1 font-mono text-xs text-sky-50">
          {artifactTitle}
        </span>
      </div>

      <p className="m-0 mt-3 text-sm leading-6 text-sky-50/85">
        Use this when a saved staged artifact needs to be inspected again,
        shared with another agent, or moved into episode-page publish planning.
        These controls do not publish, approve, mutate the artifact, or call
        providers.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/25 bg-sky-300/12 px-3 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/18"
          onClick={copyArtifactAndInspect}
          type="button"
        >
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
          Copy + Inspect Artifact
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/25 bg-black/20 px-3 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/12"
          onClick={() => copyToClipboard("Artifact JSON", artifactJson)}
          type="button"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy Artifact
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/25 bg-black/20 px-3 py-2 text-sm font-semibold text-sky-50 transition hover:bg-sky-300/12"
          onClick={() => downloadJsonFile(artifactFileName, artifactJson)}
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download Artifact
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200/25 bg-emerald-300/12 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/18"
          onClick={() =>
            copyToClipboard("Publish-candidate packet", publishCandidateJson)
          }
          type="button"
        >
          <Copy aria-hidden="true" className="h-4 w-4" />
          Copy Publish Packet
        </button>
        <button
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200/25 bg-black/20 px-3 py-2 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/12 sm:col-span-2"
          onClick={() =>
            downloadJsonFile(publishCandidateFileName, publishCandidateJson)
          }
          type="button"
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          Download Publish-Candidate Packet
        </button>
        {hasReviewBrief ? (
          <>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/25 bg-amber-300/12 px-3 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/18"
              onClick={() =>
                copyToClipboard(
                  "Publish-review brief",
                  publishReviewBriefJson || "",
                )
              }
              type="button"
            >
              <Copy aria-hidden="true" className="h-4 w-4" />
              Copy Review Brief
            </button>
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200/25 bg-black/20 px-3 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/12"
              onClick={() =>
                downloadJsonFile(
                  publishReviewBriefFileName || "hgo-episode-publish-review-brief.json",
                  publishReviewBriefJson || "",
                )
              }
              type="button"
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Download Review Brief
            </button>
          </>
        ) : null}
      </div>

      {message ? (
        <p className="m-0 mt-3 rounded-xl border border-white/10 bg-black/20 p-3 text-xs font-semibold leading-5 text-sky-50/85">
          {message}
        </p>
      ) : null}
    </section>
  );
}
