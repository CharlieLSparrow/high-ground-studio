"use client";

import { Headphones, Smartphone } from "lucide-react";

/** The same call-audio preference used by device settings, visible before Join. */
export function CallAudioDestinationPicker({value, disabled, onChange}: {
  value: "this-device" | "other-device";
  disabled?: boolean;
  onChange: (value: "this-device" | "other-device") => void;
}) {
  return <div className="mb-3 min-w-0" role="group" aria-label="Call audio">
    <p className="mb-2 text-sm font-medium text-foreground">Call audio</p>
    <div className="grid grid-cols-2 gap-2">
      {(["this-device", "other-device"] as const).map(mode => {
        const selected = value === mode;
        const Icon = mode === "this-device" ? Headphones : Smartphone;
        return <button key={mode} type="button" aria-pressed={selected} disabled={disabled}
          onClick={() => onChange(mode)}
          className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium disabled:opacity-50 ${selected ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}>
          <Icon size={17} className="shrink-0" aria-hidden="true" />
          {mode === "this-device" ? "This device" : "Another device"}
        </button>;
      })}
    </div>
  </div>;
}
