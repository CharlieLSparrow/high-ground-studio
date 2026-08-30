import { notFound } from "next/navigation";

import { mobileVoiceWritingDraftIdFromDocumentId, mobileVoiceWritingDocumentId } from "@/lib/server/mobile-voice-writing";
import { getQuipslySession } from "@/lib/server/quipsly-session";

import { StudioAccessShell } from "../../studio-access-shell";
import { VoiceWritingEditor } from "./voice-writing-editor";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Writing - Quipsly",
  description: "Continue writing captured from your voice.",
};

export default async function VoiceWritingPage({ params }: { params: Promise<{ draftId: string }> }) {
  const session = await getQuipslySession();
  if (!session?.user) return <StudioAccessShell mode="signed-out" redirectTo="/library?kind=DOCUMENT" />;
  const { draftId: rawDraftId } = await params;
  const draftId = String(rawDraftId || "").trim().toLowerCase();
  if (!mobileVoiceWritingDraftIdFromDocumentId(mobileVoiceWritingDocumentId(draftId))) notFound();
  return <VoiceWritingEditor draftId={draftId} />;
}
