"use client";

import { Mark, mergeAttributes, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  BookOpenText,
  Check,
  ChevronLeft,
  Cloud,
  CloudAlert,
  Download,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  LoaderCircle,
  MessageSquareQuote,
  Mic2,
  Pilcrow,
  Redo2,
  RefreshCw,
  Strikethrough,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceWritingRichText } from "@/lib/voice-writing-contract";
import {
  tiptapToVoiceWritingRichText,
  voiceWritingRichTextToTiptap,
} from "@/lib/voice-writing-tiptap";

const Underline = Mark.create({
  name: "underline",
  parseHTML() {
    return [
      { tag: "u" },
      {
        style: "text-decoration",
        consuming: false,
        getAttrs: (value) => String(value).includes("underline") ? {} : false,
      },
    ];
  },
  renderHTML({ HTMLAttributes }) {
    return ["u", mergeAttributes(HTMLAttributes), 0];
  },
});

type WritingSource = {
  localRecordingId: string;
  transcriptClientRequestId: string;
  sourceSha256: string;
  callRoomId: string | null;
};

type WritingDraft = {
  draftId: string;
  documentId: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  title: string;
  body: string;
  richText: VoiceWritingRichText | null;
  localRevision: number;
  serverRevision: number;
  contentRevision: string;
  localRecordingId: string;
  transcriptClientRequestId: string;
  sourceSha256: string;
  callRoomId: string | null;
  sources: WritingSource[];
  tags: Array<{ id: string; label: string; slug: string }>;
  createdAt?: string;
  updatedAt: string;
};

type LoadResponse = {
  ok: boolean;
  drafts?: WritingDraft[];
  error?: string;
};

type SaveResponse = {
  ok: boolean;
  draft?: WritingDraft;
  current?: WritingDraft | null;
  code?: string;
  error?: string;
};

type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

function formatSavedTime(value: string | undefined) {
  if (!value) return "Saved to your Nest";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Saved to your Nest";
  return `Saved ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return <button
    type="button"
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-black transition ${active
      ? "border-[#3e2f21] bg-[#3e2f21] text-white"
      : "border-[#dcc9a5] bg-white text-[#58442d] hover:border-[#92744d] hover:bg-[#fff9ef]"
    } disabled:cursor-not-allowed disabled:opacity-35`}
  >{children}</button>;
}

function SaveStatus({ state, updatedAt }: { state: SaveState; updatedAt?: string }) {
  const details = state === "saving"
    ? { Icon: LoaderCircle, text: "Saving…", className: "text-[#765f40]" }
    : state === "unsaved"
      ? { Icon: Cloud, text: "Saving shortly…", className: "text-[#765f40]" }
      : state === "conflict"
        ? { Icon: CloudAlert, text: "Changed elsewhere", className: "text-amber-800" }
        : state === "error"
          ? { Icon: CloudAlert, text: "Not saved yet", className: "text-red-800" }
          : { Icon: Check, text: formatSavedTime(updatedAt), className: "text-emerald-800" };
  return <span role="status" className={`inline-flex min-h-10 items-center gap-2 text-xs font-bold ${details.className}`}>
    <details.Icon className={`h-4 w-4 ${state === "saving" ? "animate-spin" : ""}`} aria-hidden="true" />
    {details.text}
  </span>;
}

export function VoiceWritingEditor({ draftId }: { draftId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<WritingDraft | null>(null);
  const [title, setTitle] = useState("");
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [exportingWord, setExportingWord] = useState(false);
  const [exportError, setExportError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [changeVersion, setChangeVersion] = useState(0);
  const [conflictingDraft, setConflictingDraft] = useState<WritingDraft | null>(null);
  const draftRef = useRef<WritingDraft | null>(null);
  const titleRef = useRef("");
  const dirtyRef = useRef(false);
  const loadingEditorRef = useRef(true);
  const savingRef = useRef(false);
  const saveAgainRef = useRef(false);

  const noteChanged = useCallback(() => {
    if (loadingEditorRef.current) return;
    dirtyRef.current = true;
    setSaveState("unsaved");
    setChangeVersion((value) => value + 1);
  }, []);

  const editor = useEditor({
    extensions: [StarterKit, Underline],
    content: { type: "doc", content: [{ type: "paragraph" }] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "voice-writing-editor min-h-[52vh] max-w-none px-5 py-6 font-serif text-[1.08rem] leading-8 text-[#34291e] outline-none sm:px-8 sm:py-8 md:text-[1.16rem] [&_h1]:mb-3 [&_h1]:mt-7 [&_h1]:text-3xl [&_h1]:font-black [&_h1]:leading-tight [&_h2]:mb-2 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-black [&_h2]:leading-tight",
        "aria-label": "Paper or note",
      },
    },
    onUpdate: noteChanged,
  });

  const installDraft = useCallback((next: WritingDraft) => {
    if (!editor) return;
    loadingEditorRef.current = true;
    editor.commands.setContent(voiceWritingRichTextToTiptap(next.richText, next.body), { emitUpdate: false });
    titleRef.current = next.title;
    draftRef.current = next;
    dirtyRef.current = false;
    setTitle(next.title);
    setDraft(next);
    setConflictingDraft(null);
    setSaveError("");
    setSaveState("saved");
    queueMicrotask(() => { loadingEditorRef.current = false; });
  }, [editor]);

  const loadDraft = useCallback(async () => {
    if (!editor) return;
    setLoadError("");
    try {
      const response = await fetch(`/api/mobile/capture/voice-writing?draftId=${encodeURIComponent(draftId)}`, {
        cache: "no-store",
      });
      const payload = await response.json() as LoadResponse;
      const next = payload.drafts?.[0] ?? null;
      if (!response.ok || !payload.ok || !next) {
        throw new Error(payload.error || "This writing could not be loaded.");
      }
      installDraft(next);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "This writing could not be loaded.");
    }
  }, [draftId, editor, installDraft]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

  const persist = useCallback(async () => {
    if (!editor || !dirtyRef.current || !draftRef.current) return;
    if (savingRef.current) {
      saveAgainRef.current = true;
      return;
    }
    const base = draftRef.current;
    const richText = tiptapToVoiceWritingRichText(editor.getJSON() as JSONContent);
    if (!richText.text.trim()) {
      setSaveState("error");
      setSaveError("Add at least one word before saving this writing.");
      return;
    }
    const titleToSave = titleRef.current.replace(/\s+/g, " ").trim().slice(0, 320) || "Voice note";
    const localRevision = Math.max(base.localRevision, base.serverRevision) + 1;
    savingRef.current = true;
    dirtyRef.current = false;
    setSaveError("");
    setSaveState("saving");
    try {
      const response = await fetch("/api/mobile/capture/voice-writing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: base.draftId,
          localRecordingId: base.localRecordingId,
          transcriptClientRequestId: base.transcriptClientRequestId,
          sourceSha256: base.sourceSha256,
          callRoomId: base.callRoomId,
          sources: base.sources,
          title: titleToSave,
          body: richText.text,
          richText,
          localRevision,
          expectedServerRevision: base.serverRevision,
          expectedContentRevision: base.contentRevision,
        }),
      });
      const payload = await response.json() as SaveResponse;
      if (response.status === 409 && payload.code === "VOICE_WRITING_CONFLICT" && payload.current) {
        dirtyRef.current = true;
        setConflictingDraft(payload.current);
        setSaveError(payload.error || "This writing changed on another device.");
        setSaveState("conflict");
        return;
      }
      if (!response.ok || !payload.ok || !payload.draft) {
        throw new Error(payload.error || "Your changes have not reached your Nest yet.");
      }
      draftRef.current = payload.draft;
      setDraft(payload.draft);
      if (dirtyRef.current) {
        setSaveState("unsaved");
      } else {
        setSaveState("saved");
      }
    } catch (error) {
      dirtyRef.current = true;
      setSaveError(error instanceof Error ? error.message : "Your changes have not reached your Nest yet.");
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (saveAgainRef.current || dirtyRef.current) {
        saveAgainRef.current = false;
        setChangeVersion((value) => value + 1);
      }
    }
  }, [editor]);

  useEffect(() => {
    if (!draft || !dirtyRef.current || saveState === "conflict") return;
    const timer = window.setTimeout(() => { void persist(); }, 900);
    return () => window.clearTimeout(timer);
  }, [changeVersion, draft, persist, saveState]);

  function changeTitle(value: string) {
    const next = value.slice(0, 320);
    titleRef.current = next;
    setTitle(next);
    noteChanged();
  }

  function useNestVersion() {
    if (conflictingDraft) installDraft(conflictingDraft);
  }

  function keepMyVersion() {
    if (!conflictingDraft || !draftRef.current) return;
    draftRef.current = {
      ...draftRef.current,
      localRevision: conflictingDraft.serverRevision,
      serverRevision: conflictingDraft.serverRevision,
      contentRevision: conflictingDraft.contentRevision,
    };
    setConflictingDraft(null);
    setSaveError("");
    dirtyRef.current = true;
    setSaveState("unsaved");
    setChangeVersion((value) => value + 1);
  }

  async function downloadWordDocument() {
    if (!editor || exportingWord) return;
    const richText = tiptapToVoiceWritingRichText(editor.getJSON() as JSONContent);
    if (!richText.text.trim()) {
      setExportError("Add at least one word before downloading a Word document.");
      return;
    }
    setExportingWord(true);
    setExportError("");
    try {
      const currentTitle = titleRef.current.replace(/\s+/g, " ").trim().slice(0, 320) || "Voice note";
      const response = await fetch("/api/mobile/capture/voice-writing/export", {
        method: "POST",
        headers: {
          accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "content-type": "application/json",
        },
        body: JSON.stringify({ title: currentTitle, body: richText.text, richText }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The Word document could not be created yet.");
      }
      const blob = await response.blob();
      if (!blob.type.includes("wordprocessingml.document") || blob.size <= 1_000) {
        throw new Error("Quipsly did not receive a complete Word document. Please try again.");
      }
      const safeTitle = currentTitle
        .replace(/[^a-z0-9 ._()-]+/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 96) || "Voice note";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${safeTitle}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "The Word document could not be created yet.");
    } finally {
      setExportingWord(false);
    }
  }

  async function deleteWriting() {
    if (deleting || !draftRef.current) return;
    const confirmed = window.confirm(
      "Delete this writing?\n\nThe editable writing will leave your Library. Its original recording and timed transcript stay safe.",
    );
    if (!confirmed) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await fetch("/api/mobile/capture/voice-writing", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          draftId: draftRef.current.draftId,
          clientRequestId: crypto.randomUUID(),
        }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "This writing could not be deleted yet.");
      }
      router.replace("/library?kind=NOTE");
      router.refresh();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "This writing could not be deleted yet.");
      setDeleting(false);
    }
  }

  if (loadError) {
    return <main className="mx-auto grid min-h-[70vh] max-w-2xl place-items-center px-4 py-10 text-[#3d3122]">
      <section className="w-full rounded-3xl border border-red-200 bg-red-50 p-7">
        <CloudAlert className="h-8 w-8 text-red-700" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-3xl font-black">We couldn’t open this writing.</h1>
        <p className="mt-3 font-semibold text-[#765f40]">{loadError}</p>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => void loadDraft()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#3e2f21] px-5 py-2.5 text-sm font-black text-white"><RefreshCw className="h-4 w-4" />Try again</button><Link href="/library?kind=NOTE" className="inline-flex min-h-11 items-center rounded-full border border-red-200 bg-white px-5 py-2.5 text-sm font-black text-red-900">Back to Library</Link></div>
      </section>
    </main>;
  }

  if (!draft || !editor) {
    return <main className="grid min-h-[70vh] place-items-center text-[#765f40]"><p role="status" className="inline-flex items-center gap-3 font-bold"><LoaderCircle className="h-5 w-5 animate-spin" />Opening your writing…</p></main>;
  }

  return <main className="mx-auto max-w-[1120px] px-2 py-2 text-[#3d3122] sm:px-4">
    <header className="rounded-[2rem] border border-[#dfcba6] bg-[radial-gradient(circle_at_top_right,_#d8eee5,_transparent_45%),linear-gradient(135deg,#fffaf0,#f8edda)] px-5 py-5 shadow-sm sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/library?kind=NOTE" className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#d8c4a1] bg-white/85 px-4 text-sm font-black text-[#5b472f]"><ChevronLeft className="h-4 w-4" />Library</Link>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SaveStatus state={saveState} updatedAt={draft.updatedAt} />
          <button
            type="button"
            onClick={() => void downloadWordDocument()}
            disabled={exportingWord}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[#c8b188] bg-white/90 px-4 text-sm font-black text-[#4d3b27] shadow-sm transition hover:border-[#87663d] hover:bg-white disabled:cursor-wait disabled:opacity-60"
            aria-label={exportingWord ? "Creating Word document" : "Download as Word document"}
          >
            {exportingWord
              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Download className="h-4 w-4" aria-hidden="true" />}
            {exportingWord ? "Creating…" : "Word document"}
          </button>
          <button
            type="button"
            onClick={() => void deleteWriting()}
            disabled={deleting}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-red-200 bg-white/90 px-4 text-sm font-black text-red-800 shadow-sm transition hover:border-red-400 hover:bg-red-50 disabled:cursor-wait disabled:opacity-60"
          >
            {deleting
              ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              : <Trash2 className="h-4 w-4" aria-hidden="true" />}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      <div className="mt-5 flex items-start gap-3">
        <span className="mt-1 rounded-2xl border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800"><BookOpenText className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#87663d]">Private writing · {draft.projectName}</p>
          <input value={title} onChange={(event) => changeTitle(event.target.value)} maxLength={320} aria-label="Writing title" className="mt-1 w-full border-0 bg-transparent p-0 font-serif text-3xl font-black leading-tight text-[#33281d] outline-none placeholder:text-[#a18b6c] sm:text-4xl" placeholder="Give this a title" />
        </div>
      </div>
    </header>

    {saveError ? <section role="alert" className={`mt-4 rounded-2xl border p-4 ${saveState === "conflict" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
      <p className="font-black text-[#3d3122]">{saveState === "conflict" ? "This writing changed on another device." : "Your latest changes are still in this editor."}</p>
      <p className="mt-1 text-sm font-semibold text-[#765f40]">{saveError}</p>
      <div className="mt-3 flex flex-wrap gap-2">{saveState === "conflict" ? <><button type="button" onClick={keepMyVersion} className="min-h-11 rounded-full bg-[#3e2f21] px-5 text-sm font-black text-white">Keep my version</button><button type="button" onClick={useNestVersion} className="min-h-11 rounded-full border border-amber-300 bg-white px-5 text-sm font-black text-amber-900">Use the other version</button></> : <button type="button" onClick={() => void persist()} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#3e2f21] px-5 text-sm font-black text-white"><RefreshCw className="h-4 w-4" />Save again</button>}</div>
    </section> : null}

    {exportError ? <section role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-950">{exportError}</p>
      <button type="button" onClick={() => setExportError("")} className="min-h-10 rounded-full border border-amber-300 bg-white px-4 text-xs font-black text-amber-950">Dismiss</button>
    </section> : null}

    {deleteError ? <section role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm font-bold text-red-950">{deleteError}</p>
      <button type="button" onClick={() => setDeleteError("")} className="min-h-10 rounded-full border border-red-300 bg-white px-4 text-xs font-black text-red-950">Dismiss</button>
    </section> : null}

    <section className="mt-4 overflow-hidden rounded-[2rem] border border-[#dfcba6] bg-[#fffefb] shadow-sm" aria-label="Writing editor">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-[#eadcc2] bg-[#fffaf2]/95 px-3 py-3 backdrop-blur sm:px-5" role="toolbar" aria-label="Text formatting">
        <ToolbarButton label="Body" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}><Pilcrow className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Heading" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().setHeading({ level: 1 }).run()}><Heading1 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Subheading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().setHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-[#e0cfb1]" aria-hidden="true" />
        <ToolbarButton label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleMark("underline").run()}><UnderlineIcon className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-[#e0cfb1]" aria-hidden="true" />
        <ToolbarButton label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><MessageSquareQuote className="h-4 w-4" /></ToolbarButton>
        <span className="mx-1 h-7 w-px bg-[#e0cfb1]" aria-hidden="true" />
        <ToolbarButton label="Undo" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
        <ToolbarButton label="Redo" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </section>

    <section className="mt-4 grid gap-4 pb-10 md:grid-cols-[1fr_auto]">
      <div className="rounded-2xl border border-[#dfcba6] bg-white p-5">
        <div className="flex items-center gap-2"><Mic2 className="h-5 w-5 text-[#87663d]" aria-hidden="true" /><h2 className="font-serif text-xl font-black">Connected to your voice</h2></div>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">{draft.sources.length} source recording{draft.sources.length === 1 ? " stays" : "s stay"} connected while you rewrite the paper. Editing these words never changes the original recording or timed transcript.</p>
        <div className="mt-3 flex flex-wrap gap-2">{draft.sources.map((source, index) => source.callRoomId
          ? <Link key={source.localRecordingId} href={`/sessions/${encodeURIComponent(source.callRoomId)}`} className="inline-flex min-h-10 items-center rounded-full border border-[#d8c4a1] bg-[#fffaf3] px-4 text-xs font-black text-[#5b472f]">Open recording {index + 1}</Link>
          : <span key={source.localRecordingId} className="inline-flex min-h-10 items-center rounded-full border border-[#d8c4a1] bg-[#fffaf3] px-4 text-xs font-black text-[#5b472f]">iPhone recording {index + 1}</span>)}</div>
      </div>
      <div className="rounded-2xl border border-[#dfcba6] bg-[#fffaf3] p-5 md:max-w-xs">
        <p className="text-xs font-black uppercase tracking-wide text-[#87663d]">Keep going by voice</p>
        <p className="mt-2 text-sm font-semibold leading-6 text-[#765f40]">Open this writing in Quipsly Capture and tap <strong>Continue by voice</strong>. Your next recording appends here automatically.</p>
      </div>
    </section>
  </main>;
}
