import Link from "next/link";
import { AudioLines, FileText } from "lucide-react";
import { sessionWorkspaceHref } from "@/app/(app)/sessions/[roomId]/session-workspace-model";

/** Navigation only: the destination loads the authorized session inventory.
 * A recording count is not a claim that every track is already playable. */
export function CoachingSessionMediaLinks({roomId, recordingCount, hasTranscript}: {
  roomId: string;
  recordingCount: number;
  hasTranscript: boolean;
}) {
  const style = "inline-flex min-h-11 items-center gap-2 rounded-full border border-quipsly-divider px-4 py-2 text-sm font-semibold text-quipsly-ink hover:bg-quipsly-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2";
  return <>
    {recordingCount > 0 ? <Link href={sessionWorkspaceHref(roomId, "recordings")} className={style}>
      <AudioLines size={16} aria-hidden="true" />Recordings & edits
    </Link> : null}
    {hasTranscript ? <Link href={sessionWorkspaceHref(roomId, "transcript")} className={style}>
      <FileText size={16} aria-hidden="true" />Transcript
    </Link> : null}
  </>;
}
