import type { BrowserRetainedSourceStatus } from "./session-guardian";

export type BrowserRecordingAction = "START" | "STOP" | "STOP_LOCAL" | "JOIN" | "REOPEN";
export function browserRecordingControl(input: {
  status: BrowserRetainedSourceStatus; canControlRoom: boolean; closed: boolean;
  directiveActive: boolean; directiveBusy: boolean; myConsent: boolean;
  waitingForConsent: boolean; ready: boolean; canJoinActive: boolean;
}) {
  const {status, canControlRoom, directiveBusy} = input;
  let action: BrowserRecordingAction | null = null;
  let label = "Record";
  let disabled = directiveBusy;
  if (input.closed && status !== "recording" && !input.directiveActive) {
    if (canControlRoom) { action = "REOPEN"; label = "Reopen Session to record"; disabled ||= status === "checking"; }
  } else if (status === "recording" || canControlRoom && input.directiveActive) {
    action = canControlRoom ? "STOP" : "STOP_LOCAL";
    label = canControlRoom ? "Stop recording" : "Stop my recording";
    disabled ||= status === "stopping";
  } else if (input.myConsent && !input.waitingForConsent) {
    if (canControlRoom) { action = "START"; disabled ||= !input.ready || ["checking", "starting", "stopping", "uploading"].includes(status); }
    else if (input.directiveActive && input.canJoinActive) { action = "JOIN"; label = status === "error" ? "Try recording again" : "Start my recording"; disabled ||= !input.ready; }
  }
  return {action, label, disabled, recording: status === "recording",
    busy: directiveBusy || ["checking", "starting", "stopping"].includes(status)};
}
