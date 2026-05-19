"use client";

import type { JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import mammoth from "mammoth";
import { useEffect, useMemo, useRef, useState } from "react";

import { StudioNav } from "../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import { AuthorMark, SemanticHighlightMark } from "./manuscript-editor-marks";
import {
  collectBlockSummaries,
  collectSemanticHighlights,
  countWordsAndCharacters,
  createDefaultManuscriptDraft,
  createEmptyManuscriptDoc,
  ensureManuscriptBlockIds,
  getManuscriptAuthorDefinition,
  getSemanticHighlightDefinition,
  MANUSCRIPT_SCHEMA_VERSION,
  MANUSCRIPT_STORAGE_KEY,
  manuscriptAuthorDefinitions,
  semanticHighlightDefinitions,
  safeManuscriptDraft,
  summarizeAuthorMarkedSpans,
  validateEditorJsonShape,
  type ManuscriptAuthorId,
  type ManuscriptDraft,
  type ManuscriptEditorJson,
  type SemanticHighlightType,
} from "./manuscript-editor-model";

type StudioManuscriptClientProps = {
  actor: {
    primaryEmail: string;
  };
};

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const fieldClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.9rem] leading-6 text-studio-ink disabled:text-studio-dim";

const smallButtonClassName =
  "min-h-8 rounded-lg border border-studio-line bg-studio-ink/5 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-source disabled:text-studio-dim";

const activeButtonClassName =
  "border-studio-tag/55 bg-studio-tag/15 text-studio-tag";

const dangerButtonClassName =
  "min-h-8 rounded-lg border border-studio-danger/45 bg-studio-danger/10 px-2.5 py-1.5 text-[0.78rem] font-extrabold text-studio-danger";

const blockNodeTypes = ["paragraph", "heading", "listItem"];

function createId(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
  );
}

function createBlockId(nodeType: string, index = 0) {
  return `block-${nodeType}-${index}-${createId("m")}`;
}

function createHighlightId() {
  return `semantic-${createId("highlight")}`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not saved yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getAuthorMarkAttrs(authorId: ManuscriptAuthorId) {
  const author = getManuscriptAuthorDefinition(authorId);

  return {
    authorId: author.id,
    authorLabel: author.label,
  };
}

function createDraftFromState(input: {
  title: string;
  sourceFileName: string | null;
  editorJson: ManuscriptEditorJson;
  activeAuthorId: ManuscriptAuthorId;
  showAuthorColors: boolean;
  showSemanticColors: boolean;
  lastUpdatedAt: string | null;
}): ManuscriptDraft {
  return {
    schemaVersion: MANUSCRIPT_SCHEMA_VERSION,
    title: input.title.trim() || "Untitled manuscript",
    sourceFileName: input.sourceFileName,
    editorJson: input.editorJson,
    activeAuthorId: input.activeAuthorId,
    showAuthorColors: input.showAuthorColors,
    showSemanticColors: input.showSemanticColors,
    lastUpdatedAt: input.lastUpdatedAt,
  };
}

function ensureBlockIds(json: ManuscriptEditorJson) {
  return ensureManuscriptBlockIds(json, createBlockId);
}

function setCursorAtDocumentEnd(editor: NonNullable<ReturnType<typeof useEditor>>) {
  editor.commands.setTextSelection(editor.state.doc.content.size);
}

export function StudioManuscriptClient({
  actor,
}: StudioManuscriptClientProps) {
  const skipNextPersistRef = useRef(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [title, setTitle] = useState("Untitled manuscript");
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [activeAuthorId, setActiveAuthorId] =
    useState<ManuscriptAuthorId>("homer");
  const [showAuthorColors, setShowAuthorColors] = useState(true);
  const [showSemanticColors, setShowSemanticColors] = useState(true);
  const [semanticType, setSemanticType] =
    useState<SemanticHighlightType>("insight");
  const [semanticNote, setSemanticNote] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [editorJson, setEditorJson] = useState<ManuscriptEditorJson>(
    createEmptyManuscriptDoc(),
  );
  const [exportJson, setExportJson] = useState("");
  const [importJson, setImportJson] = useState("");
  const [exportHtml, setExportHtml] = useState("");
  const [exportPlainText, setExportPlainText] = useState("");
  const [message, setMessage] = useState(
    "Browser-local Manuscript Desk draft.",
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      UniqueID.configure({
        attributeName: "blockId",
        types: blockNodeTypes,
        generateID: ({ node, pos }) => createBlockId(node.type.name, pos),
      }),
      AuthorMark,
      SemanticHighlightMark,
    ],
    content: createEmptyManuscriptDoc() as JSONContent,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "manuscript-prosemirror min-h-[560px] rounded-lg border border-studio-line-strong bg-[#0f1512] px-5 py-4 text-[1rem] leading-8 text-studio-ink outline-none",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      setEditorJson(currentEditor.getJSON() as ManuscriptEditorJson);
    },
  });

  useEffect(() => {
    if (!editor || isHydrated) {
      return;
    }

    try {
      const rawDraft = window.localStorage.getItem(MANUSCRIPT_STORAGE_KEY);

      if (rawDraft) {
        const parsed = safeManuscriptDraft(JSON.parse(rawDraft));

        if (parsed) {
          setTitle(parsed.title);
          setSourceFileName(parsed.sourceFileName);
          setActiveAuthorId(parsed.activeAuthorId);
          setShowAuthorColors(parsed.showAuthorColors);
          setShowSemanticColors(parsed.showSemanticColors);
          setLastUpdatedAt(parsed.lastUpdatedAt);
          setEditorJson(parsed.editorJson);
          editor.commands.setContent(parsed.editorJson as JSONContent);
          setMessage("Loaded browser-local Manuscript Desk draft.");
        }
      }
    } catch (error) {
      console.error("Manuscript Desk draft load failed.", error);
      setMessage("Could not load the browser-local manuscript draft.");
    } finally {
      setIsHydrated(true);
    }
  }, [editor, isHydrated]);

  useEffect(() => {
    if (!editor || !isHydrated) {
      return;
    }

    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }

    const timestamp = new Date().toISOString();
    const draft = createDraftFromState({
      title,
      sourceFileName,
      editorJson: ensureBlockIds(editor.getJSON() as ManuscriptEditorJson),
      activeAuthorId,
      showAuthorColors,
      showSemanticColors,
      lastUpdatedAt: timestamp,
    });

    try {
      window.localStorage.setItem(
        MANUSCRIPT_STORAGE_KEY,
        JSON.stringify(draft),
      );
      setLastUpdatedAt(timestamp);
    } catch (error) {
      console.error("Manuscript Desk draft save failed.", error);
      setMessage("Could not save the browser-local manuscript draft.");
    }
  }, [
    activeAuthorId,
    editor,
    editorJson,
    isHydrated,
    showAuthorColors,
    showSemanticColors,
    sourceFileName,
    title,
  ]);

  const currentEditorJson = useMemo(
    () => ensureBlockIds(editorJson),
    [editorJson],
  );
  const textStats = useMemo(
    () => countWordsAndCharacters(currentEditorJson),
    [currentEditorJson],
  );
  const blockSummaries = useMemo(
    () => collectBlockSummaries(currentEditorJson),
    [currentEditorJson],
  );
  const authorSummaries = useMemo(
    () => summarizeAuthorMarkedSpans(currentEditorJson),
    [currentEditorJson],
  );
  const semanticHighlights = useMemo(
    () => collectSemanticHighlights(currentEditorJson),
    [currentEditorJson],
  );

  function updateActiveAuthor(authorId: ManuscriptAuthorId) {
    setActiveAuthorId(authorId);

    if (!editor) {
      return;
    }

    if (authorId === "unassigned") {
      editor.chain().focus().unsetMark("authorMark").run();
      return;
    }

    editor.chain().focus().setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
  }

  function markSelectionAsAuthor(authorId: ManuscriptAuthorId) {
    if (!editor) {
      return;
    }

    if (authorId === "unassigned") {
      editor.chain().focus().unsetMark("authorMark").run();
      setActiveAuthorId("unassigned");
      setMessage("Author mark cleared from the current selection.");
      return;
    }

    editor.chain().focus().setMark("authorMark", getAuthorMarkAttrs(authorId)).run();
    setActiveAuthorId(authorId);
    setMessage(`Marked selection as ${getManuscriptAuthorDefinition(authorId).label}.`);
  }

  function markAllAsHomer() {
    if (!editor) {
      return;
    }

    editor
      .chain()
      .focus()
      .selectAll()
      .setMark("authorMark", getAuthorMarkAttrs("homer"))
      .run();
    setCursorAtDocumentEnd(editor);
    editor.chain().focus().setMark("authorMark", getAuthorMarkAttrs("homer")).run();
    setActiveAuthorId("homer");
    setMessage("Marked the full manuscript as Homer / Scott.");
  }

  function applySemanticHighlight() {
    if (!editor) {
      return;
    }

    const definition = getSemanticHighlightDefinition(semanticType);

    editor
      .chain()
      .focus()
      .setMark("semanticHighlightMark", {
        highlightId: createHighlightId(),
        tagType: definition.id,
        label: definition.label,
        colorKey: definition.colorKey,
        note: semanticNote.trim(),
        createdAt: new Date().toISOString(),
      })
      .run();
    setSemanticNote("");
    setMessage(`Applied ${definition.label} semantic highlight.`);
  }

  function clearSemanticHighlight() {
    if (!editor) {
      return;
    }

    editor.chain().focus().unsetMark("semanticHighlightMark").run();
    setMessage("Semantic highlight cleared from the current selection.");
  }

  async function importDocx(file: File | null) {
    if (!editor || !file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith(".docx")) {
      setMessage("Choose a .docx file for manuscript import.");
      return;
    }

    try {
      setMessage("Converting .docx to editor content...");
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({
        arrayBuffer,
      });
      const html = result.value.trim() || "<p></p>";

      editor.commands.setContent(html);
      const jsonWithBlockIds = ensureBlockIds(
        editor.getJSON() as ManuscriptEditorJson,
      );
      editor.commands.setContent(jsonWithBlockIds as JSONContent);
      editor
        .chain()
        .focus()
        .selectAll()
        .setMark("authorMark", getAuthorMarkAttrs("homer"))
        .run();
      setCursorAtDocumentEnd(editor);
      editor
        .chain()
        .focus()
        .setMark("authorMark", getAuthorMarkAttrs("homer"))
        .run();

      const importedJson = ensureBlockIds(
        editor.getJSON() as ManuscriptEditorJson,
      );
      setEditorJson(importedJson);
      setSourceFileName(file.name);
      setTitle(file.name.replace(/\.docx$/i, "").trim() || title);
      setActiveAuthorId("homer");
      setMessage(
        result.messages.length
          ? `.docx imported with ${result.messages.length} Mammoth message(s). Imported text was marked Homer / Scott by default.`
          : ".docx imported. Imported text was marked Homer / Scott by default.",
      );
    } catch (error) {
      console.error("Manuscript .docx import failed.", error);
      setMessage(".docx import failed. Try a simpler Word document or paste text.");
    }
  }

  function exportEditorJson() {
    if (!editor) {
      return;
    }

    const json = ensureBlockIds(editor.getJSON() as ManuscriptEditorJson);
    setExportJson(JSON.stringify(json, null, 2));
    setMessage("Editor JSON exported.");
  }

  function exportEditorHtml() {
    if (!editor) {
      return;
    }

    setExportHtml(editor.getHTML());
    setMessage("HTML exported.");
  }

  function exportEditorPlainText() {
    if (!editor) {
      return;
    }

    setExportPlainText(editor.getText());
    setMessage("Plain text exported.");
  }

  function importEditorJson() {
    if (!editor) {
      return;
    }

    try {
      const parsed = JSON.parse(importJson);
      const parsedDraft = safeManuscriptDraft(parsed);

      if (parsedDraft) {
        setTitle(parsedDraft.title);
        setSourceFileName(parsedDraft.sourceFileName);
        setActiveAuthorId(parsedDraft.activeAuthorId);
        setShowAuthorColors(parsedDraft.showAuthorColors);
        setShowSemanticColors(parsedDraft.showSemanticColors);
        setLastUpdatedAt(parsedDraft.lastUpdatedAt);
        editor.commands.setContent(parsedDraft.editorJson as JSONContent);
        setEditorJson(parsedDraft.editorJson);
        setImportJson("");
        setMessage("Full Manuscript Desk draft JSON imported.");
        return;
      }

      if (!validateEditorJsonShape(parsed)) {
        setMessage("Import JSON did not match editor JSON or draft shape.");
        return;
      }

      const jsonWithBlockIds = ensureBlockIds(parsed);
      editor.commands.setContent(jsonWithBlockIds as JSONContent);
      setEditorJson(jsonWithBlockIds);
      setImportJson("");
      setMessage("Editor JSON imported.");
    } catch {
      setMessage("Import JSON could not be parsed.");
    }
  }

  function exportFullDraft() {
    if (!editor) {
      return;
    }

    const timestamp = new Date().toISOString();
    const draft = createDraftFromState({
      title,
      sourceFileName,
      editorJson: ensureBlockIds(editor.getJSON() as ManuscriptEditorJson),
      activeAuthorId,
      showAuthorColors,
      showSemanticColors,
      lastUpdatedAt: timestamp,
    });

    setExportJson(JSON.stringify(draft, null, 2));
    setMessage("Full browser-local draft JSON exported.");
  }

  function clearLocalDraft() {
    if (!editor) {
      return;
    }

    const confirmed = window.confirm(
      `Clear this Manuscript Desk browser draft? This removes only ${MANUSCRIPT_STORAGE_KEY} from localStorage in this browser.`,
    );

    if (!confirmed) {
      return;
    }

    const emptyDraft = createDefaultManuscriptDraft(null);
    skipNextPersistRef.current = true;
    window.localStorage.removeItem(MANUSCRIPT_STORAGE_KEY);
    editor.commands.setContent(emptyDraft.editorJson as JSONContent);
    setTitle(emptyDraft.title);
    setSourceFileName(null);
    setActiveAuthorId(emptyDraft.activeAuthorId);
    setShowAuthorColors(emptyDraft.showAuthorColors);
    setShowSemanticColors(emptyDraft.showSemanticColors);
    setLastUpdatedAt(null);
    setEditorJson(emptyDraft.editorJson);
    setExportJson("");
    setImportJson("");
    setExportHtml("");
    setExportPlainText("");
    setMessage("Manuscript Desk browser draft cleared.");
  }

  const statusTone =
    message.includes("failed") || message.includes("Could not")
      ? "danger"
      : message.includes("exported") ||
          message.includes("imported") ||
          message.includes("Marked") ||
          message.includes("Applied") ||
          message.includes("cleared") ||
          message.includes("Loaded")
        ? "tag"
        : "default";

  return (
    <main className="min-h-screen p-3.5 md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr] gap-[18px] md:min-h-[calc(100vh-48px)]">
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Manuscript Desk status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <p className={labelClassName}>Studio Manuscript Desk</p>
              <h1 className="mt-1.5 mb-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                Block-aware attribution
              </h1>
              <p className="mt-1.5 mb-0 max-w-[840px] text-[0.94rem] leading-relaxed text-studio-muted">
                Import a manuscript, edit block by block, and mark spans for
                authorship and meaning.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="tag">Studio access</StudioChip>
            <StudioChip className="normal-case" tone="source">
              {actor.primaryEmail}
            </StudioChip>
            <StudioChip tone="review">Browser-local draft</StudioChip>
            <StudioChip tone="source">No database writes</StudioChip>
          </div>
        </header>

        <section
          className={cn(panelClassName, "grid gap-3 px-4 py-3.5")}
          aria-label="Manuscript persistence status"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid gap-2">
              <p className={labelClassName}>Draft status</p>
              <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
                Saved locally in this browser. Not yet synced to Studio database.
              </p>
              <p className="m-0 font-mono text-[0.76rem] leading-relaxed text-studio-muted">
                {MANUSCRIPT_STORAGE_KEY}
              </p>
              <p className="m-0 text-[0.84rem] leading-relaxed text-studio-muted">
                Active author:{" "}
                {getManuscriptAuthorDefinition(activeAuthorId).label}
                {" | "}Last saved: {formatDateTime(lastUpdatedAt)}
                {sourceFileName ? ` | Source: ${sourceFileName}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 lg:justify-end">
              <button
                className={smallButtonClassName}
                type="button"
                onClick={() => setShowAuthorColors((current) => !current)}
              >
                {showAuthorColors ? "Hide author colors" : "Show author colors"}
              </button>
              <button
                className={smallButtonClassName}
                type="button"
                onClick={() => setShowSemanticColors((current) => !current)}
              >
                {showSemanticColors
                  ? "Hide semantic colors"
                  : "Show semantic colors"}
              </button>
              <button
                className={dangerButtonClassName}
                type="button"
                onClick={clearLocalDraft}
              >
                Clear local draft
              </button>
            </div>
          </div>
        </section>

        <section
          className="grid gap-[18px] xl:grid-cols-[minmax(310px,0.55fr)_minmax(520px,1fr)_minmax(340px,0.55fr)]"
          aria-label="Manuscript Desk workspace"
        >
          <aside className={panelClassName} aria-label="Import and toolbar">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Import</p>
              <StudioChip tone="source">.docx to HTML</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Source document</h2>
            <p className={panelCopyClassName}>
              Import Word content into TipTap JSON. Imported text is marked
              Homer / Scott by default.
            </p>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Title</span>
                <input
                  className={fieldClassName}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>

              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Upload .docx</span>
                <input
                  className={fieldClassName}
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  type="file"
                  onChange={(event) => {
                    void importDocx(event.target.files?.[0] ?? null);
                    event.target.value = "";
                  }}
                />
              </label>

              <button
                className={smallButtonClassName}
                type="button"
                onClick={markAllAsHomer}
              >
                Mark all as Homer / Scott
              </button>
            </div>

            <div className="mt-6 grid gap-3">
              <p className={labelClassName}>Active author</p>
              <div className="grid gap-2">
                {manuscriptAuthorDefinitions.map((author) => (
                  <button
                    className={cn(
                      smallButtonClassName,
                      activeAuthorId === author.id ? activeButtonClassName : "",
                    )}
                    key={author.id}
                    type="button"
                    onClick={() => updateActiveAuthor(author.id)}
                  >
                    {author.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              <p className={labelClassName}>Toolbar</p>
              <div className="grid gap-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("charlie")}
                >
                  Mark selection as Charlie
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("homer")}
                >
                  Mark selection as Homer / Scott
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => markSelectionAsAuthor("unassigned")}
                >
                  Clear author mark
                </button>
              </div>

              <div className="grid gap-2">
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Semantic tag</span>
                  <select
                    className={fieldClassName}
                    value={semanticType}
                    onChange={(event) =>
                      setSemanticType(event.target.value as SemanticHighlightType)
                    }
                  >
                    {semanticHighlightDefinitions.map((definition) => (
                      <option key={definition.id} value={definition.id}>
                        {definition.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2">
                  <span className={fieldLabelClassName}>Semantic note</span>
                  <textarea
                    className={cn(textareaClassName, "min-h-[84px]")}
                    value={semanticNote}
                    onChange={(event) => setSemanticNote(event.target.value)}
                  />
                </label>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={applySemanticHighlight}
                >
                  Apply semantic highlight
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={clearSemanticHighlight}
                >
                  Clear semantic highlight
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  className={cn(
                    smallButtonClassName,
                    editor?.isActive("bold") ? activeButtonClassName : "",
                  )}
                  type="button"
                  onClick={() => editor?.chain().focus().toggleBold().run()}
                >
                  Bold
                </button>
                <button
                  className={cn(
                    smallButtonClassName,
                    editor?.isActive("italic") ? activeButtonClassName : "",
                  )}
                  type="button"
                  onClick={() => editor?.chain().focus().toggleItalic().run()}
                >
                  Italic
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => editor?.chain().focus().undo().run()}
                >
                  Undo
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={() => editor?.chain().focus().redo().run()}
                >
                  Redo
                </button>
              </div>
            </div>

            <div
              className={cn(
                "mt-5 rounded-lg border border-studio-line p-3 text-[0.82rem] leading-relaxed text-studio-muted",
                statusTone === "tag" && "border-studio-tag/45 text-studio-tag",
                statusTone === "danger" &&
                  "border-studio-danger/50 text-studio-danger",
              )}
            >
              {message}
            </div>
          </aside>

          <section
            className={cn(
              panelClassName,
              "grid gap-3",
              !showAuthorColors && "manuscript-hide-author-colors",
              !showSemanticColors && "manuscript-hide-semantic-colors",
            )}
            aria-label="Editable manuscript"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className={labelClassName}>Editor</p>
                <h2 className={panelTitleClassName}>Manuscript surface</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <StudioChip tone="tag">
                  {textStats.words.toLocaleString()} words
                </StudioChip>
                <StudioChip tone="source">
                  {blockSummaries.length.toLocaleString()} blocks
                </StudioChip>
              </div>
            </div>

            <EditorContent editor={editor} />

            <p className="m-0 text-[0.78rem] leading-relaxed text-studio-muted">
              Paragraphs, headings, and list items carry `blockId` attributes in
              the editor JSON. Author marks and semantic highlights are separate
              inline marks and can overlap.
            </p>
          </section>

          <aside className={panelClassName} aria-label="Block and highlight panel">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Inspector</p>
              <StudioChip tone="node">Blocks + marks</StudioChip>
            </div>

            <section className={cn(cardClassName, "grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Author counts
              </h2>
              <div className="grid gap-2">
                {authorSummaries.map((summary) => (
                  <div
                    className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5"
                    key={summary.authorId}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[0.82rem] font-extrabold text-studio-ink">
                        {summary.label}
                      </span>
                      <span className="font-mono text-[0.72rem] text-studio-dim">
                        {summary.spans} spans
                      </span>
                    </div>
                    <span className="font-mono text-[0.72rem] text-studio-muted">
                      {summary.words} words / {summary.characters} chars
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Block IDs
              </h2>
              <div className="grid max-h-[310px] gap-2 overflow-auto pr-1">
                {blockSummaries.length ? (
                  blockSummaries.map((block, index) => (
                    <article
                      className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5"
                      key={`${block.blockId ?? "missing"}-${index}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StudioChip tone={block.blockId ? "source" : "danger"}>
                          {block.type}
                        </StudioChip>
                        <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                          {block.blockId ?? "missing blockId"}
                        </span>
                      </div>
                      <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                        {block.preview || "Empty block"}
                      </p>
                    </article>
                  ))
                ) : (
                  <p className={panelCopyClassName}>No blocks yet.</p>
                )}
              </div>
            </section>

            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Semantic highlights
              </h2>
              <div className="grid max-h-[250px] gap-2 overflow-auto pr-1">
                {semanticHighlights.length ? (
                  semanticHighlights.map((highlight, index) => (
                    <article
                      className="grid gap-1 rounded-lg border border-studio-line bg-black/20 p-2.5"
                      key={`${highlight.highlightId}-${index}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <StudioChip tone="tag">{highlight.label}</StudioChip>
                        <span className="font-mono text-[0.68rem] leading-tight text-studio-dim">
                          {highlight.highlightId || "no id"}
                        </span>
                      </div>
                      <p className="m-0 text-[0.8rem] leading-relaxed text-studio-muted">
                        {highlight.preview}
                      </p>
                      {highlight.note ? (
                        <p className="m-0 text-[0.75rem] leading-relaxed text-studio-review">
                          {highlight.note}
                        </p>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p className={panelCopyClassName}>No semantic highlights yet.</p>
                )}
              </div>
            </section>

            <section className={cn(cardClassName, "mt-3.5 grid gap-2 p-3.5")}>
              <h2 className="m-0 text-[1rem] leading-snug text-studio-ink">
                Export / backup
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorJson}
                >
                  Export editor JSON
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportFullDraft}
                >
                  Export full draft
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorHtml}
                >
                  Export HTML
                </button>
                <button
                  className={smallButtonClassName}
                  type="button"
                  onClick={exportEditorPlainText}
                >
                  Export plain text
                </button>
              </div>
              <textarea
                className={cn(textareaClassName, "min-h-[150px] font-mono text-xs")}
                readOnly
                value={exportJson}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[110px] font-mono text-xs")}
                readOnly
                value={exportHtml}
              />
              <textarea
                className={cn(textareaClassName, "min-h-[110px]")}
                readOnly
                value={exportPlainText}
              />
              <label className="grid gap-2">
                <span className={fieldLabelClassName}>Import JSON</span>
                <textarea
                  className={cn(textareaClassName, "min-h-[120px] font-mono text-xs")}
                  value={importJson}
                  onChange={(event) => setImportJson(event.target.value)}
                />
              </label>
              <button
                className={smallButtonClassName}
                type="button"
                onClick={importEditorJson}
              >
                Import editor JSON
              </button>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
