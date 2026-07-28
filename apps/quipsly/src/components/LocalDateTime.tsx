"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

type LocalDateTimeProps = {
  value: string;
  mode?: "date-time" | "time";
  className?: string;
};

function formatUtc(date: Date, mode: NonNullable<LocalDateTimeProps["mode"]>) {
  return new Intl.DateTimeFormat("en-US", mode === "time"
    ? {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }
    : {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
        timeZoneName: "short",
      }).format(date);
}

function formatLocal(date: Date, mode: NonNullable<LocalDateTimeProps["mode"]>) {
  return mode === "time"
    ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : date.toLocaleString();
}

/**
 * Server output must not depend on the Cloud Run instance timezone or locale.
 * React hydrates the deterministic UTC label first, then switches to the
 * collaborator's local presentation without changing the underlying instant.
 */
export default function LocalDateTime({
  value,
  mode = "date-time",
  className,
}: LocalDateTimeProps) {
  const hasHydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return (
    <time dateTime={date.toISOString()} className={className}>
      {hasHydrated ? formatLocal(date, mode) : formatUtc(date, mode)}
    </time>
  );
}
