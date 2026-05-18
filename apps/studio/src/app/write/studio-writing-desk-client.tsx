"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateWritingDeskBlockAction } from "./actions";
import { StudioNav } from "../studio-nav";
import {
  cardClassName,
  cn,
  labelClassName,
  monoMetaClassName,
  panelClassName,
  panelCopyClassName,
  panelTitleClassName,
  primaryButtonClassName,
  StudioChip,
  StudioGlyph,
} from "../studio-ui";
import type {
  StudioWritingDeskActionResult,
  StudioWritingDeskData,
} from "@/lib/server/studio-writing-desk";

type StudioWritingDeskClientProps = StudioWritingDeskData & {
  actor: {
    primaryEmail: string;
  };
};

type DraftBlockState = {
  title: string;
  body: string;
};

function createDraftState(document: StudioWritingDeskData["document"]) {
  return Object.fromEntries(
    document.blocks.map((block) => [
      block.id,
      {
        title: block.title,
        body: block.body,
      },
    ]),
  ) as Record<string, DraftBlockState>;
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ");
}

const fieldLabelClassName =
  "text-[0.78rem] font-extrabold uppercase text-studio-muted";

const inputClassName =
  "min-h-10 w-full rounded-lg border border-studio-line-strong bg-[#0f1512] px-2.5 py-2 text-studio-ink disabled:text-studio-dim";

const textareaClassName =
  "min-h-[220px] w-full resize-y rounded-lg border border-studio-line-strong bg-[#0f1512] px-3 py-2.5 text-[0.95rem] leading-7 text-studio-ink disabled:text-studio-dim";

export function StudioWritingDeskClient({
  document,
  persistence,
  actor,
}: StudioWritingDeskClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [draftBlocks, setDraftBlocks] = useState(() =>
    createDraftState(document),
  );
  const [actionState, setActionState] = useState<
    Record<string, StudioWritingDeskActionResult | undefined>
  >({});

  function updateDraftBlock(
    blockId: string,
    field: keyof DraftBlockState,
    value: string,
  ) {
    setDraftBlocks((current) => ({
      ...current,
      [blockId]: {
        ...current[blockId],
        [field]: value,
      },
    }));
  }

  function saveBlock(blockId: string) {
    const draft = draftBlocks[blockId];

    if (!draft || !persistence.canWrite) {
      return;
    }

    startTransition(() => {
      void updateWritingDeskBlockAction({
        documentStableId: document.id,
        blockStableId: blockId,
        title: draft.title,
        body: draft.body,
      }).then((result) => {
        setActionState((current) => ({
          ...current,
          [blockId]: result,
        }));
        router.refresh();
      });
    });
  }

  return (
    <main className="min-h-screen p-3.5 md:p-6">
      <div className="grid min-h-[calc(100vh-28px)] grid-rows-[auto_auto_1fr_auto] gap-[18px] md:min-h-[calc(100vh-48px)]">
        <header
          className={cn(
            panelClassName,
            "flex min-h-[72px] flex-col items-stretch justify-between gap-[18px] px-[18px] py-4 lg:flex-row lg:items-center",
          )}
          aria-label="Writing desk status"
        >
          <div className="flex min-w-0 flex-col items-stretch gap-3.5 sm:flex-row sm:items-center">
            <StudioGlyph />
            <div>
              <p className={labelClassName}>Studio Writing Desk</p>
              <h1 className="mt-1.5 mb-0 text-[1.75rem] leading-[1.08] tracking-normal text-studio-ink max-sm:text-[1.45rem]">
                {document.title}
              </h1>
              <p className="mt-1.5 mb-0 max-w-[780px] text-[0.94rem] leading-relaxed text-studio-muted">
                Private draft blocks for book writing inside Studio.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap justify-start gap-2 lg:justify-end">
            <StudioNav />
            <StudioChip tone="tag">Studio access</StudioChip>
            <StudioChip className="normal-case" tone="source">
              {actor.primaryEmail}
            </StudioChip>
            <StudioChip tone={persistence.canWrite ? "tag" : "review"}>
              {persistence.mode === "database" ? "Local draft" : "Fixture"}
            </StudioChip>
            <StudioChip tone="source">Private</StudioChip>
            <StudioChip tone="review">
              {formatStatus(document.projectionStatus)}
            </StudioChip>
          </div>
        </header>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
          aria-label="Writing desk orientation"
        >
          <p className={labelClassName}>Writing Desk</p>
          <p className="m-0 text-[0.92rem] leading-relaxed text-studio-muted">
            Create private draft material.
          </p>
        </section>

        <section
          className="grid gap-[18px] xl:grid-cols-[minmax(320px,0.7fr)_minmax(0,1.3fr)]"
          aria-label="Writing desk"
        >
          <aside className={panelClassName} aria-label="Draft metadata">
            <div className="mb-3.5 flex items-start justify-between gap-3">
              <p className={labelClassName}>Draft Document</p>
              <StudioChip tone="source">{document.blocks.length} blocks</StudioChip>
            </div>

            <h2 className={panelTitleClassName}>Private book draft</h2>
            <p className={panelCopyClassName}>{document.sourceLabel}</p>

            <div
              className={cn(
                "mt-3.5 rounded-lg border border-studio-line p-3 text-[0.82rem] leading-relaxed text-studio-muted",
                persistence.canWrite && "border-studio-tag/45 text-studio-tag",
              )}
            >
              {persistence.message}
            </div>

            <dl className="mt-4 grid gap-2.5">
              <div className="min-w-0">
                <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                  Document ID
                </dt>
                <dd className={monoMetaClassName}>{document.id}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                  Updated
                </dt>
                <dd className={monoMetaClassName}>
                  {formatDateTime(document.updatedAt)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[0.72rem] font-extrabold uppercase leading-tight text-studio-dim">
                  Persistence
                </dt>
                <dd className={monoMetaClassName}>
                  {persistence.canWrite
                    ? "Local database writes enabled"
                    : "Read-only fixture mode"}
                </dd>
              </div>
            </dl>
          </aside>

          <section className="grid gap-[18px]" aria-label="Draft blocks">
            {document.blocks.map((block) => {
              const draft = draftBlocks[block.id] ?? {
                title: block.title,
                body: block.body,
              };
              const status = actionState[block.id];
              const isDirty =
                draft.title !== block.title || draft.body !== block.body;
              const hasBody = Boolean(draft.body.trim());

              return (
                <article
                  className={cn(cardClassName, "grid gap-3.5 p-[18px]")}
                  key={block.id}
                >
                  <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className={labelClassName}>Draft block</p>
                      <h2 className="mt-1.5 mb-0 text-[1.1rem] leading-snug text-studio-ink">
                        {draft.title || "Untitled draft block"}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <StudioChip tone="source">{block.id}</StudioChip>
                      <StudioChip tone="review">
                        {formatStatus(block.projectionStatus)}
                      </StudioChip>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className={fieldLabelClassName} htmlFor={`${block.id}-title`}>
                      Title
                    </label>
                    <input
                      className={inputClassName}
                      disabled={!persistence.canWrite}
                      id={`${block.id}-title`}
                      maxLength={160}
                      value={draft.title}
                      onChange={(event) =>
                        updateDraftBlock(block.id, "title", event.target.value)
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className={fieldLabelClassName} htmlFor={`${block.id}-body`}>
                      Body
                    </label>
                    <textarea
                      className={textareaClassName}
                      disabled={!persistence.canWrite}
                      id={`${block.id}-body`}
                      value={draft.body}
                      onChange={(event) =>
                        updateDraftBlock(block.id, "body", event.target.value)
                      }
                    />
                  </div>

                  <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
                    <div className="grid gap-1 font-mono text-[0.75rem] leading-relaxed text-studio-muted">
                      <span>created {formatDateTime(block.createdAt)}</span>
                      <span>
                        updated{" "}
                        {status?.savedAt
                          ? formatDateTime(status.savedAt)
                          : formatDateTime(block.updatedAt)}
                      </span>
                    </div>

                    <button
                      className={cn(primaryButtonClassName, "mt-0 md:w-auto")}
                      disabled={
                        !persistence.canWrite || !isDirty || !hasBody || isPending
                      }
                      type="button"
                      onClick={() => saveBlock(block.id)}
                    >
                      {isPending ? "Saving..." : isDirty ? "Save block" : "Saved"}
                    </button>
                  </div>

                  {status ? (
                    <div
                      className={cn(
                        "rounded-lg border p-3 text-[0.82rem] leading-relaxed",
                        status.ok
                          ? "border-studio-tag/45 text-studio-tag"
                          : "border-studio-danger/50 text-studio-danger",
                      )}
                    >
                      {status.message}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </section>
        </section>

        <section
          className={cn(panelClassName, "grid gap-2 px-4 py-3.5")}
          aria-label="Canonical file safety"
        >
          <p className={labelClassName}>Canonical safety</p>
          <div className="break-words font-mono text-[0.76rem] leading-relaxed text-studio-muted">
            Writes target local Studio draft rows only. No manuscript MDX,
            publish content, staging content, or inbox content is written by
            this route.
          </div>
        </section>
      </div>
    </main>
  );
}
