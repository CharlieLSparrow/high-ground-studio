import type { SessionReadinessPerson, SessionReadinessTopology } from "@/lib/server/session-readiness-topology";

export type SessionRecordingStatusState =
  | "SAFE"
  | "KEEP_OPEN"
  | "CHECK_DEVICE"
  | "RECOVERY_REQUIRED"
  | "PLAN_REQUIRED"
  | "NOT_STARTED"
  | "NOT_REQUIRED";

export type SessionRecordingPersonStatus = {
  participantId: string;
  label: string;
  isCurrentActor: boolean;
  state: Exclude<SessionRecordingStatusState, "PLAN_REQUIRED">;
  labelText: string;
  detail: string;
  verifiedSourceCount: number;
  requiredSourceCount: number;
  pendingSourceCount: number;
  failedSourceCount: number;
};

export type SessionRecordingStatus = {
  schema: "quipsly-session-recording-status-v1";
  generatedAt: string;
  roomId: string;
  roomStatus: string;
  state: SessionRecordingStatusState;
  label: string;
  detail: string;
  safeToLeave: boolean;
  peopleRequiringRecordingCount: number;
  peopleSafeCount: number;
  people: SessionRecordingPersonStatus[];
  technicalDetail: string;
};

function personStatus(
  person: SessionReadinessPerson,
  topology: SessionReadinessTopology,
  ended: boolean,
): SessionRecordingPersonStatus {
  const required = topology.expectedSources.filter((source) => (
    source.participantId === person.id
    && source.status === "active"
    && source.retentionRole === "required-master"
  ));
  const pendingSourceCount = person.endpointQueues.reduce((total, queue) => total + queue.pendingSourceCount, 0);
  const failedSourceCount = person.endpointQueues.reduce((total, queue) => total + queue.failedSourceCount, 0);
  const verifiedSourceCount = person.sources.filter((source) => source.serverRetention.state === "SERVER_COPY_VERIFIED_RELEASED").length;
  const unresolvedCapture = person.sources.some((source) => source.serverRetention.state === "CAPTURE_AWAITING_MEDIA");
  const failedSource = person.sources.some((source) => source.status === "FAILED" || source.status === "HELD");
  const requiredReady = required.length > 0 && required.every((source) => source.fulfillment === "fulfilled");
  const allReportedQueuesDrained = person.endpointQueues.length > 0 && person.endpointQueues.every((queue) => queue.queueState === "DRAINED");
  let state: SessionRecordingPersonStatus["state"];
  let labelText: string;
  let detail: string;

  if (failedSourceCount > 0 || failedSource) {
    state = "RECOVERY_REQUIRED";
    labelText = "Needs attention";
    detail = person.isCurrentActor
      ? "Open Quipsly on this device and retry the upload. Your original recording stays protected."
      : `Ask ${person.label} to open Quipsly on their recording device and retry the upload.`;
  } else if (pendingSourceCount > 0 || unresolvedCapture) {
    state = "KEEP_OPEN";
    labelText = "Keep device open";
    detail = person.isCurrentActor
      ? "Keep Quipsly open on this device while your recording finishes uploading."
      : `Ask ${person.label} to keep Quipsly open on their recording device.`;
  } else if (requiredReady && allReportedQueuesDrained) {
    state = "SAFE";
    labelText = "Safe";
    detail = "Required recordings are verified and this device reports no pending uploads.";
  } else if (requiredReady || verifiedSourceCount > 0) {
    state = "CHECK_DEVICE";
    labelText = "Confirm device";
    detail = person.isCurrentActor
      ? "Your cloud copy is safe. Wait until this device also says its upload is complete."
      : `${person.label}’s cloud copy is safe. Ask them to confirm their recording device says Upload complete.`;
  } else if (person.sources.length > 0 || person.endpointQueues.length > 0 || required.some((source) => source.fulfillment !== "missing")) {
    state = "KEEP_OPEN";
    labelText = "Keep device open";
    detail = person.isCurrentActor
      ? "Keep Quipsly open while your recording is matched to its verified cloud copy."
      : `Ask ${person.label} to keep Quipsly open while their recording finishes.`;
  } else if (required.length > 0 && ended) {
    state = "RECOVERY_REQUIRED";
    labelText = "Recording missing";
    detail = person.isCurrentActor
      ? "Open Quipsly on the device you recorded with so it can find and upload the protected original."
      : `Ask ${person.label} to open Quipsly on the device they recorded with.`;
  } else if (required.length > 0) {
    state = "NOT_STARTED";
    labelText = "Not recorded yet";
    detail = "No retained recording is visible for this person yet.";
  } else {
    state = "NOT_REQUIRED";
    labelText = "Not recording";
    detail = "No retained master is required from this person.";
  }

  return {
    participantId: person.id,
    label: person.label,
    isCurrentActor: person.isCurrentActor,
    state,
    labelText,
    detail,
    verifiedSourceCount,
    requiredSourceCount: required.length,
    pendingSourceCount,
    failedSourceCount,
  };
}

export function buildSessionRecordingStatus(input: {
  roomId: string;
  roomStatus: string;
  topology: SessionReadinessTopology;
}): SessionRecordingStatus {
  const { topology } = input;
  const ended = input.roomStatus === "ENDED" || input.roomStatus === "CANCELED";
  const topologyState: SessionRecordingStatusState = topology.exitReadiness.state === "SAFE_TO_LEAVE"
    ? "SAFE"
    : topology.exitReadiness.state === "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED"
      ? "CHECK_DEVICE"
      : topology.exitReadiness.state === "RECORDING_PLAN_REQUIRED"
        ? "PLAN_REQUIRED"
        : topology.exitReadiness.state === "NO_CAPTURE_EVIDENCE"
          ? "NOT_STARTED"
          : topology.exitReadiness.state === "PLANNED_SOURCE_INCOMPLETE" && ended
            ? "RECOVERY_REQUIRED"
            : "KEEP_OPEN";
  const people = topology.people.map((person) => personStatus(person, topology, ended));
  const recordingPeople = people.filter((person) => person.state !== "NOT_REQUIRED");
  const peopleSafeCount = recordingPeople.filter((person) => person.state === "SAFE").length;
  // Treat the durable aggregate as necessary but not sufficient. If an old or
  // malformed projection ever disagrees with its person rows, leave guidance
  // fails closed instead of showing a contradictory green result.
  const state: SessionRecordingStatusState = topologyState === "SAFE"
    && recordingPeople.some((person) => person.state !== "SAFE")
    ? "CHECK_DEVICE"
    : topologyState;
  const copy = {
    SAFE: ["Every recording is safe", "All required recordings are verified and every reporting device has finished uploading."],
    KEEP_OPEN: ["Recording is finishing", "Keep Quipsly open on the affected devices while their recordings finish uploading."],
    CHECK_DEVICE: ["Cloud copies are safe", "Before closing an affected device, wait until Quipsly says its upload is complete."],
    RECOVERY_REQUIRED: ["A recording needs attention", "Open Quipsly on the affected recording device and retry its upload."],
    PLAN_REQUIRED: ["Choose the recordings to protect", "Confirm which audio and video sources are required before relying on a Safe result."],
    NOT_STARTED: ["Recording has not started", "No retained recording is visible yet."],
    NOT_REQUIRED: ["No recording is required", "This Session does not require a retained recording."],
  } satisfies Record<SessionRecordingStatusState, [string, string]>;

  return {
    schema: "quipsly-session-recording-status-v1",
    generatedAt: topology.generatedAt,
    roomId: input.roomId,
    roomStatus: input.roomStatus,
    state,
    label: copy[state][0],
    detail: copy[state][1],
    safeToLeave: state === "SAFE" && peopleSafeCount === recordingPeople.length,
    peopleRequiringRecordingCount: recordingPeople.length,
    peopleSafeCount,
    people,
    technicalDetail: topology.exitReadiness.detail,
  };
}
