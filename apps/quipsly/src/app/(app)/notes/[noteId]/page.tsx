import { notFound, redirect } from "next/navigation";
import { getQuipslySession } from "@/lib/server/quipsly-session";
import { readCanonicalDocumentNoteForActor } from "@/lib/server/canonical-document-note-edit";
import { NoteEditor } from "./note-editor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Note - Quipsly" };

export default async function NotePage({ params }: { params: Promise<{ noteId: string }> }) {
  const session = await getQuipslySession();
  const { noteId } = await params;
  const email = session?.user?.primaryEmail || session?.user?.email;
  if (!session?.user?.id || !email) redirect(`/login?callbackUrl=${encodeURIComponent(`/notes/${noteId}`)}`);
  const note = await readCanonicalDocumentNoteForActor({ userId: session.user.id, email }, noteId);
  if (!note) notFound();
  return <NoteEditor key={`${session.user.id}:${note.id}`} initial={note} actorId={session.user.id} />;
}
