"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Loader2 } from "lucide-react";
import type { QuipslyPublicCoachingOffering } from "@high-ground/quipsly-domain/coaching-public";
import { dispatchQuipslyProductEvent } from "@/lib/product-analytics";

export function BookingRequestClient({
  offering,
  initialSelectedInstant,
}: {
  offering: QuipslyPublicCoachingOffering;
  initialSelectedInstant?: string | null;
}) {
  const [selectedInstant, setSelectedInstant] = useState(
    offering.bookableSlots.some(
      (slot) => slot.instant === initialSelectedInstant,
    )
      ? initialSelectedInstant || ""
      : offering.bookableSlots[0]?.instant || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [completed, setCompleted] = useState(false);
  const callbackPath = `/coaching/book/${encodeURIComponent(offering.slug)}`;
  const loginHref = `/login?callbackUrl=${encodeURIComponent(
    `${callbackPath}?slot=${encodeURIComponent(selectedInstant)}`,
  )}`;
  const selectedSlot = useMemo(
    () =>
      offering.bookableSlots.find((slot) => slot.instant === selectedInstant) ||
      null,
    [offering.bookableSlots, selectedInstant],
  );

  useEffect(() => {
    dispatchQuipslyProductEvent("booking_link_opened", {
      surface: "booking_page",
      workflow: "coaching",
      participant_role: "client",
      method: "link",
      result: "success",
    });
  }, [offering.slug]);

  async function requestTime() {
    if (!selectedInstant || isSubmitting) return;
    setIsSubmitting(true);
    setMessage(null);
    setNeedsSignIn(false);
    try {
      const response = await fetch("/api/coaching/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offeringId: offering.id,
          scheduledStart: selectedInstant,
        }),
      });
      const payload = await response.json();
      if (response.status === 401) {
        setNeedsSignIn(true);
        setMessage(
          "Sign in or create a free Quipsly account, then you’ll return here with this time still selected.",
        );
        return;
      }
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "That time could not be requested.");
      }
      setCompleted(true);
      setMessage(
        payload.request?.repeated
          ? "You already requested this time. It is still waiting for the coach."
          : "Your time is requested. The coach will confirm it in Quipsly.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "That time could not be requested. Refresh and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!offering.bookableSlots.length) {
    return (
      <div className="rounded-[2rem] border border-[#d7c39e] bg-white/75 p-6">
        <CalendarClock className="h-7 w-7 text-[#315d4f]" />
        <h2 className="mt-4 font-serif text-2xl font-black">
          More times are coming.
        </h2>
        <p className="mt-3 leading-7 text-[#745b3c]">
          {offering.coachName} has not published a new open time yet. You can
          come back later or contact the coach directly.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[2.25rem] border border-[#d7c39e] bg-white/80 p-5 shadow-xl shadow-[#6c4e29]/10 sm:p-7">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8a6a39]">
        Choose one open time
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {offering.bookableSlots.map((slot) => {
          const selected = slot.instant === selectedInstant;
          return (
            <button
              key={slot.instant}
              type="button"
              disabled={completed}
              onClick={() => {
                setSelectedInstant(slot.instant);
                setMessage(null);
                setNeedsSignIn(false);
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                selected
                  ? "border-[#315d4f] bg-[#315d4f] text-[#fff8ec] shadow-md"
                  : "border-[#dbc295] bg-[#fffaf1] text-[#4b3823] hover:border-[#8e7145]"
              } disabled:cursor-default disabled:opacity-70`}
            >
              <span className="block text-sm font-black">{slot.label}</span>
              <span
                className={`mt-1 block text-xs ${
                  selected ? "text-[#fff8ec]/75" : "text-[#8a6a39]"
                }`}
              >
                {offering.durationMinutes} minutes
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl bg-[#f7eddc] p-4 text-sm leading-7 text-[#654d32]">
        {selectedSlot
          ? `You’re requesting ${selectedSlot.label}. The coach confirms next.`
          : "Choose a time to continue."}
        <span className="block text-xs text-[#8a6a39]">
          This does not charge you, add a calendar event, or start a call.
        </span>
      </div>

      {message ? (
        <div
          role="status"
          className={`mt-4 rounded-2xl border p-4 text-sm leading-6 ${
            completed
              ? "border-[#7ba08b] bg-[#edf7f0] text-[#234d3e]"
              : "border-[#d7b772] bg-[#fff7df] text-[#6f5228]"
          }`}
        >
          <div className="flex gap-3">
            {completed ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            ) : null}
            <span>{message}</span>
          </div>
        </div>
      ) : null}

      {needsSignIn ? (
        <Link
          href={loginHref}
          className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#315d4f] px-5 py-4 text-sm font-black text-white no-underline"
        >
          Sign in or create free account
        </Link>
      ) : completed ? (
        <Link
          href="/coaching"
          className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-[#315d4f] px-5 py-4 text-sm font-black text-white no-underline"
        >
          See my coaching
        </Link>
      ) : (
        <button
          type="button"
          onClick={requestTime}
          disabled={!selectedInstant || isSubmitting}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#315d4f] px-5 py-4 text-sm font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {isSubmitting ? "Requesting…" : "Request this time"}
        </button>
      )}
    </div>
  );
}
