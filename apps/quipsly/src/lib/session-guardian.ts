import type { StudioAudioSignalState } from "@/lib/studio-audio-meter";

export type BrowserRetainedSourceStatus =
  | "checking"
  | "ready"
  | "starting"
  | "recording"
  | "stopping"
  | "uploading"
  | "held"
  | "error";

export type BrowserRetainedSourceIssue = {
  kind: "source-muted" | "source-ended" | "source-no-signal" | "encoder-stalled" | "storage-low" | "storage-critical";
  detail: string;
};

export const RETAINED_SOURCE_STORAGE_WATCH_BYTES = 2 * 1024 ** 3;
export const RETAINED_SOURCE_STORAGE_RESERVE_BYTES = 512 * 1024 ** 2;

export function browserRetainedStorageIssue(
  usageBytes: number | null,
  quotaBytes: number | null,
): BrowserRetainedSourceIssue | null {
  if (usageBytes === null || quotaBytes === null || !Number.isFinite(usageBytes) || !Number.isFinite(quotaBytes)) return null;
  const remaining = Math.max(0, quotaBytes - usageBytes);
  if (remaining <= RETAINED_SOURCE_STORAGE_RESERVE_BYTES) {
    return {
      kind: "storage-critical",
      detail: `Browser storage has ${(remaining / 1024 ** 2).toFixed(0)} MB remaining, at or below Quipsly's 512 MB safety reserve.`,
    };
  }
  if (remaining <= RETAINED_SOURCE_STORAGE_WATCH_BYTES) {
    return {
      kind: "storage-low",
      detail: `Browser storage has ${(remaining / 1024 ** 3).toFixed(1)} GB remaining.`,
    };
  }
  return null;
}

export type BrowserRetainedSourceGuardianEvidence = {
  status: BrowserRetainedSourceStatus;
  sourceType: "audio" | "video";
  message: string;
  vaultAvailable: boolean;
  vaultPersistent: boolean;
  readinessOk: boolean;
  readinessReason: string;
  protectedRecoveryCount: number;
  activeCaptureId: string | null;
  activeSizeBytes: number;
  issue: BrowserRetainedSourceIssue | null;
};

export type SessionGuardianProjection = {
  level: "ready" | "watch" | "intervene";
  eyebrow: string;
  title: string;
  detail: string;
  action: string;
  evidence: Array<{ lane: string; value: string }>;
};

export type SessionGuardianInput = {
  conversationStatus: "preflight" | "checking" | "ready" | "joining" | "connected" | "reconnecting" | "ended" | "error";
  callSignalState: StudioAudioSignalState;
  cameraWanted: boolean;
  cameraEvidenceAvailable: boolean;
  pageVisible: boolean;
  retainedSourceAvailable: boolean;
  retained: BrowserRetainedSourceGuardianEvidence | null;
};

function humanStatus(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function retainedLane(retained: BrowserRetainedSourceGuardianEvidence | null, available: boolean) {
  if (!available) return "Held: this Session has no canonical take identity";
  if (!retained) return "Loading retained-source evidence";
  const bytes = retained.activeSizeBytes > 0
    ? ` · ${(retained.activeSizeBytes / 1024 / 1024).toFixed(1)} MB protected locally`
    : "";
  return `${humanStatus(retained.status)}${bytes}`;
}

function evidence(input: SessionGuardianInput) {
  return [
    { lane: "Conversation", value: humanStatus(input.conversationStatus) },
    { lane: "Call microphone", value: humanStatus(input.callSignalState) },
    {
      lane: "Call camera",
      value: input.cameraWanted
        ? input.cameraEvidenceAvailable ? "Measured preview available" : "Not measured in this setup"
        : "Not requested",
    },
    { lane: "Retained master", value: retainedLane(input.retained, input.retainedSourceAvailable) },
    { lane: "Browser", value: input.pageVisible ? "Session visible" : "Session is in the background" },
  ];
}

/**
 * Ranks already-observed Session evidence. This does not infer retained-source
 * audio quality from the browser call meter, nor does it claim upload success
 * from a locally protected file.
 */
export function projectSessionGuardian(input: SessionGuardianInput): SessionGuardianProjection {
  const rows = evidence(input);
  const retained = input.retained;

  if (!input.retainedSourceAvailable) {
    return {
      level: "intervene",
      eyebrow: "Recording boundary",
      title: "Conversation available · retained recording held",
      detail: "The live room can operate, but Quipsly cannot create a protected master without the Session's canonical take identity.",
      action: "Repair or refresh the Session capture group before recording. Do not substitute the room ID.",
      evidence: rows,
    };
  }

  if (!retained) {
    return {
      level: "watch",
      eyebrow: "Recording preflight",
      title: "Checking the retained-source recorder",
      detail: "Quipsly is loading durable-storage, consent, recovery, and source-readiness evidence for this browser.",
      action: "Wait for the retained-source panel to finish checking before recording.",
      evidence: rows,
    };
  }

  if (retained?.issue && ["source-ended", "source-no-signal", "encoder-stalled", "storage-critical"].includes(retained.issue.kind)) {
    return {
      level: "intervene",
      eyebrow: "Retained-source intervention",
      title: retained.issue.kind === "storage-critical"
        ? "Local storage reached the safety reserve"
        : retained.issue.kind === "source-no-signal"
          ? "The retained master has no observed program signal"
          : "The retained source was interrupted",
      detail: retained.issue.detail,
      action: retained.issue.kind === "source-no-signal"
        ? "Check mute, interface routing, gain, and the selected input now. Preserve this diagnostic file, then start a new take only after the retained meter follows speech."
        : "Let Quipsly finish its safe stop. Keep the protected local take, correct the device or storage problem, then start a new take.",
      evidence: rows,
    };
  }

  if (retained?.status === "held" || retained?.status === "error") {
    return {
      level: "intervene",
      eyebrow: "Protected recovery",
      title: retained.protectedRecoveryCount > 0 ? "A protected local take needs attention" : "Retained recording is held",
      detail: retained.message,
      action: retained.protectedRecoveryCount > 0
        ? "Do not delete browser data. Download the source or retry its verified handoff from the protected-takes list."
        : "Resolve the displayed preflight error or use Quipsly Capture before starting the Session.",
      evidence: rows,
    };
  }

  if (retained?.status === "recording") {
    if (retained.issue?.kind === "source-muted") {
      return {
        level: "intervene",
        eyebrow: "Live retained-source watch",
        title: "The selected source stopped delivering media",
        detail: retained.issue.detail,
        action: "Check the cable and device power now. Quipsly will stop safely if the interruption persists.",
        evidence: rows,
      };
    }
    if (retained.issue?.kind === "storage-low") {
      return {
        level: "watch",
        eyebrow: "Live retained-source watch",
        title: "Local recording space is getting low",
        detail: retained.issue.detail,
        action: "Plan to end this take soon. Quipsly will stop before the protected storage reserve is consumed.",
        evidence: rows,
      };
    }
    if (input.conversationStatus !== "connected") {
      return {
        level: "watch",
        eyebrow: "Independent capture",
        title: input.conversationStatus === "reconnecting"
          ? "Retained master continues while the call reconnects"
          : "Retained master continues while the conversation is unavailable",
        detail: "The browser call path is unavailable or reconnecting. The local master is a separate recorder and remains protected on this device.",
        action: "Reconnect the conversation without refreshing or closing this page. Stop the local source only if the conversation cannot recover.",
        evidence: rows,
      };
    }
    if (!input.pageVisible) {
      return {
        level: "watch",
        eyebrow: "Background capture",
        title: "Retained recording continues in a background tab",
        detail: "Quipsly has not observed a source failure, but browsers can throttle background work and hide important interventions.",
        action: "Return to this Session tab and leave it visible while recording.",
        evidence: rows,
      };
    }
    if (!retained.vaultPersistent) {
      return {
        level: "watch",
        eyebrow: "Browser-managed retention",
        title: "Protected master is writing without persistent-storage permission",
        detail: "Durable chunks are advancing in the browser vault, but the browser has not granted Quipsly persistent storage protection.",
        action: "Keep this tab open, finish the take, and download or complete verified handoff promptly.",
        evidence: rows,
      };
    }
    return {
      level: "ready",
      eyebrow: "Session Guardian",
      title: "Protected master is writing",
      detail: "Durable local chunks are advancing independently from the live conversation. Call-path meters remain reference evidence only.",
      action: "Keep this tab visible, monitor through headphones, and stop from Quipsly when the take is complete.",
      evidence: rows,
    };
  }

  if (retained?.status === "starting" || retained?.status === "stopping" || retained?.status === "uploading") {
    return {
      level: "watch",
      eyebrow: "Protected transition",
      title: retained.status === "uploading" ? "Local master protected · verified handoff in progress" : `${humanStatus(retained.status)} the retained source`,
      detail: retained.message,
      action: "Keep this page open until Quipsly reports the next stable state. The local source remains the authority until exact bytes verify.",
      evidence: rows,
    };
  }

  if (retained.issue?.kind === "storage-low") {
    return {
      level: "watch",
      eyebrow: "Browser storage",
      title: "Local recording space is getting low",
      detail: retained.issue.detail,
      action: "Download or complete verified handoff for protected takes before the next long recording.",
      evidence: rows,
    };
  }

  if (retained && !retained.readinessOk) {
    return {
      level: "watch",
      eyebrow: "Recording preflight",
      title: "Finish retained-source readiness",
      detail: retained.readinessReason,
      action: "Complete the highlighted source, consent, headphones, or durable-storage requirement before recording.",
      evidence: rows,
    };
  }

  if (!retained.vaultPersistent) {
    return {
      level: "watch",
      eyebrow: "Browser-managed retention",
      title: "Persistent-storage protection was not granted",
      detail: "The local vault is available, but the browser may manage its retention under storage pressure.",
      action: "Recording remains available. Keep this page open and download or verify each protected take promptly.",
      evidence: rows,
    };
  }

  if (input.callSignalState === "clipping-risk" || input.callSignalState === "no-signal") {
    return {
      level: "intervene",
      eyebrow: "Call-path preflight",
      title: input.callSignalState === "clipping-risk" ? "The call microphone may clip" : "The call microphone has no observed signal",
      detail: "This warning describes the browser call/reference path, not proof of the retained master. A shared physical input can still make it an important setup warning.",
      action: input.callSignalState === "clipping-risk" ? "Lower input gain and rerun the selected setup test." : "Check the selected microphone, cable, mute state, and input routing, then rerun the test.",
      evidence: rows,
    };
  }

  if (input.callSignalState === "hot" || input.callSignalState === "low" || input.callSignalState === "inactive") {
    return {
      level: "watch",
      eyebrow: "Call-path preflight",
      title: input.callSignalState === "inactive" ? "Measure the selected studio setup" : `Call microphone is ${humanStatus(input.callSignalState).toLowerCase()}`,
      detail: "Quipsly has not observed a blocking retained-source failure, but the browser conversation path still needs a clean confidence check.",
      action: "Run the selected setup and private sound check before joining or recording.",
      evidence: rows,
    };
  }

  return {
    level: "ready",
    eyebrow: "Session Guardian",
    title: "Studio paths are ready for a deliberate start",
    detail: "The selected call input has measured signal and the retained-source preflight has no observed blocker.",
    action: "Join the conversation, confirm consent, then start each retained master explicitly.",
    evidence: rows,
  };
}
