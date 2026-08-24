import type { TranscriptSourceSpeakerAuthority } from "@high-ground/quipsly-domain/transcript-derived-task";

export function transcriptSpeakerEvidenceCopy(authority?: TranscriptSourceSpeakerAuthority | null) {
  if (authority === "correction") {
    return { label: "Name reviewed", detail: "A person reviewed this speaker name." };
  }
  if (authority === "attribution") {
    return { label: "Speaker reviewed", detail: "A person matched this voice to a Session participant." };
  }
  if (authority === "source-binding") {
    return { label: "Participant recording", detail: "This speaker comes from that participant's isolated recording." };
  }
  if (authority === "provider") {
    return { label: "Automatic speaker label", detail: "This speaker name still comes from transcription processing." };
  }
  if (authority === "unresolved") {
    return { label: "Speaker needs review", detail: "Quipsly has not identified this speaker yet." };
  }
  return null;
}

export function TranscriptSpeakerEvidenceBadge({ authority }: {
  authority?: TranscriptSourceSpeakerAuthority | null;
}) {
  const copy = transcriptSpeakerEvidenceCopy(authority);
  if (!copy) return null;
  return (
    <p
      title={copy.detail}
      aria-label={`${copy.label}. ${copy.detail}`}
      className="mt-2 inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-900"
    >
      {copy.label}
    </p>
  );
}
