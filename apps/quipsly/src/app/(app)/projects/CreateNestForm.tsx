"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Plus } from "lucide-react";
import { createNestAction, type CreateNestFormState } from "./actions";
import { nestCreationTemplates } from "./nest-creation-templates";

const INITIAL_STATE: CreateNestFormState = { error: null };

function CreateButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
      {pending ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}
      {pending ? "Creating Nest…" : "Create Nest"}
    </button>
  );
}

export function CreateNestForm({ clientRequestId }: { clientRequestId: string }) {
  const [state, formAction] = useActionState(createNestAction, INITIAL_STATE);
  const [requestIdentity] = useState(clientRequestId);
  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input type="hidden" name="clientRequestId" value={requestIdentity} />
      <div>
        <label htmlFor="nest-name" className="block text-sm font-semibold">Name</label>
        <input id="nest-name" name="name" required maxLength={120} autoComplete="off" placeholder="My writing, Podcast, Research…"
          className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <details className="rounded-xl border border-border p-3">
        <summary className="cursor-pointer text-sm font-medium">More options</summary>
        <div className="mt-4 space-y-4">
          <div>
            <label htmlFor="nest-description" className="block text-sm font-semibold">Description <span className="font-normal text-muted-foreground">(optional)</span></label>
            <textarea id="nest-description" name="description" maxLength={2000} rows={3} placeholder="What would you like to work on?"
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label htmlFor="nest-type" className="block text-sm font-semibold">Organize for</label>
            <select id="nest-type" name="template" defaultValue="mixed" className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm">
              {nestCreationTemplates.map((template) => <option key={template.value} value={template.value}>{template.label}</option>)}
            </select>
            <p className="mt-2 text-xs text-muted-foreground">General works for anything. Choose a focus if you already have one in mind.</p>
          </div>
          <div>
            <label htmlFor="nest-document-title" className="block text-sm font-semibold">First page title <span className="font-normal text-muted-foreground">(optional)</span></label>
            <input id="nest-document-title" name="documentTitle" maxLength={240} placeholder="Notes"
              className="mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      </details>
      {state.error ? <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p> : null}
      <p className="text-xs text-muted-foreground">Only you can access this Nest until you invite someone.</p>
      <CreateButton />
    </form>
  );
}
