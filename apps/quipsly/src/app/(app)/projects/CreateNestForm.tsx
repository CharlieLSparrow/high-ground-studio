"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle, Plus } from "lucide-react";

import {
  createNestAction,
  type CreateNestFormState,
} from "./actions";

const INITIAL_STATE: CreateNestFormState = { error: null };

function CreateButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-describedby="create-nest-boundary"
      className="flex w-full items-center justify-center gap-2 rounded-full bg-[#3d3122] px-4 py-3 text-xs font-black uppercase tracking-[0.14em] text-white shadow-sm transition hover:bg-[#59442d] disabled:cursor-wait disabled:bg-[#786b5c]"
    >
      {pending ? (
        <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
      ) : (
        <Plus size={16} aria-hidden="true" />
      )}
      {pending ? "Creating private Nest…" : "Create and open Nest"}
    </button>
  );
}

export function CreateNestForm({
  children,
  clientRequestId,
}: {
  children: ReactNode;
  clientRequestId: string;
}) {
  const [state, formAction] = useActionState(createNestAction, INITIAL_STATE);
  const [requestIdentity] = useState(clientRequestId);

  return (
    <form action={formAction} className="mt-5 space-y-4">
      <input
        type="hidden"
        name="clientRequestId"
        value={requestIdentity}
      />
      {children}
      {state.error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-900"
        >
          {state.error}
        </div>
      ) : null}
      <p id="create-nest-boundary" className="text-xs leading-5 text-[#6b5b45]">
        Private by default. You become the owner. No invitation, message,
        calendar event, recording, or publication is created.
      </p>
      <CreateButton />
    </form>
  );
}
