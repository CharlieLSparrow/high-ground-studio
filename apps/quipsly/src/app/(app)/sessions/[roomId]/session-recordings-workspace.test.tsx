/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { OriginalRecordings, RecordingDetails, RecordingUploadStatus } from "./session-recordings-workspace";
import { EMPTY_SESSION_READINESS_TOPOLOGY, type SessionReadinessPerson } from "./session-readiness-topology";
import type { SessionSourceEvidence } from "./session-source-evidence-model";

const evidence: SessionSourceEvidence = { sources: [], counts: { VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0 } };
afterEach(() => window.history.replaceState(null, "", "/"));

it("keeps troubleshooting closed until requested", () => {
  render(<RecordingDetails><h3 id="source-evidence-heading">Source diagnostics</h3></RecordingDetails>);
  expect(screen.getByText("Source diagnostics")).not.toBeVisible();
  fireEvent.click(screen.getByText("Recording details & troubleshooting"));
  expect(screen.getByRole("heading", { name: "Source diagnostics" })).toBeVisible();
});

it.each(["initial", "navigation"])("reveals the exact linked diagnostic and its nested disclosure on %s", (mode) => {
  if (mode === "initial") window.history.replaceState(null, "", "/#source-evidence-heading");
  render(<RecordingDetails><details><summary>Sources</summary><h3 id="source-evidence-heading">Source diagnostics</h3></details></RecordingDetails>);
  if (mode === "navigation") {
    window.history.replaceState(null, "", "/#source-evidence-heading");
    fireEvent(window, new HashChangeEvent("hashchange"));
  }
  expect(screen.getByRole("heading", { name: "Source diagnostics" })).toBeVisible();
});

it("does not open unrelated or malformed deep links", () => {
  window.history.replaceState(null, "", "/#%E0%A4%A");
  render(<RecordingDetails><h3 id="source-evidence-heading">Source diagnostics</h3></RecordingDetails>);
  expect(screen.getByText("Source diagnostics")).not.toBeVisible();
  window.history.replaceState(null, "", "/#other-panel");
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(screen.getByText("Source diagnostics")).not.toBeVisible();
});

it("keeps originals available on demand and reveals their exact deep link independently", () => {
  render(<>
    <OriginalRecordings><h3 id="original-player">Source player</h3></OriginalRecordings>
    <RecordingDetails><h3 id="source-evidence-heading">Source diagnostics</h3></RecordingDetails>
  </>);
  expect(screen.getByText("Source player")).not.toBeVisible();
  window.history.replaceState(null, "", "/#original-player");
  fireEvent(window, new HashChangeEvent("hashchange"));
  expect(screen.getByRole("heading", { name: "Source player" })).toBeVisible();
  expect(screen.getByText("Source diagnostics")).not.toBeVisible();
});

it("does not tell someone to close a device with a pending recording", () => {
  render(<RecordingUploadStatus evidence={{...evidence, counts: {...evidence.counts, VERIFIED_MATCH: 0}}} topology={{ ...EMPTY_SESSION_READINESS_TOPOLOGY,
    exitReadiness: { ...EMPTY_SESSION_READINESS_TOPOLOGY.exitReadiness, pendingCaptureCount: 1 } }} />);
  expect(screen.getByRole("heading")).toHaveTextContent("Waiting for recordings");
  expect(screen.getByText(/Open Quipsly on the device you recorded with/)).toBeVisible();
  expect(screen.queryByText(/You can leave/)).not.toBeInTheDocument();
});

it("reports saved recordings without requiring a plan or claiming all devices finished", () => {
  render(<RecordingUploadStatus evidence={evidence} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("1 recording saved");
  expect(screen.queryByText(/safe to leave|plan required/i)).not.toBeInTheDocument();
});

it("keeps a real source problem visible outside troubleshooting", () => {
  render(<RecordingUploadStatus evidence={{ ...evidence, counts: { ...evidence.counts, VERIFIED_MATCH: 0, DRIFT: 1 } }} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("A recording needs attention");
  fireEvent.click(screen.getByText("Uploads and recording issues"));
  expect(screen.getByRole("link", { name: "View recording details" })).toHaveAttribute("href", "#session-readiness-topology-heading");
});

const source = (id: string, status: SessionSourceEvidence["sources"][number]["status"]) => ({recordingAssetId: id, fileName: `${id}.wav`, status}) as SessionSourceEvidence["sources"][number];
const retryingPerson: SessionReadinessPerson = {
  id: "coach", label: "Casey", role: "COACH", isCurrentActor: true, consent: "ready", videoConsent: true, transcriptionConsent: true,
  endpoints: [], preflights: [], sources: [], attentionCount: 1,
  endpointQueues: [{id: "queue", clientInstanceId: "ipad", clientKind: "ios", deviceLabel: "Casey's iPad", queueRevision: "3", queueState: "NOT_EMPTY", localSourceCount: 2, pendingSourceCount: 1, failedSourceCount: 1, observedCaptureIds: [], recordingAssetIds: ["saved"], latestLocalMutationAt: "2026-09-01T10:00:00Z", reconciledAt: "2026-09-01T10:01:00Z"}],
};

it("reports the saved selected take separately from an old device queue and another failed source", () => {
  render(<RecordingUploadStatus sourceIds={["saved"]} evidence={{sources: [source("saved", "VERIFIED_MATCH"), source("old", "HELD")], counts: {VERIFIED_MATCH: 1, HELD: 1, DRIFT: 0, INCOMPLETE: 0}}} topology={{...EMPTY_SESSION_READINESS_TOPOLOGY, people: [retryingPerson]}} />);
  expect(screen.getByRole("heading")).toHaveTextContent(/^Recording saved$/);
  expect(screen.queryByText(/upload in progress/i)).not.toBeInTheDocument();
  expect(screen.getByText(/Uploads and recording issues/)).toBeVisible();
  expect(screen.getByText("old.wav")).not.toBeVisible();
  fireEvent.click(screen.getByText(/Uploads and recording issues/));
  expect(screen.getByText("old.wav")).toBeVisible();
  expect(screen.getByText("Casey · Casey's iPad")).toBeVisible();
  expect(screen.getByText("1 upload needs a retry.")).toBeVisible();
  expect(screen.getByText("2026-09-01 10:01 UTC")).toBeVisible();
  expect(screen.queryByText(/all.*safe|safe to leave|confirm device/i)).not.toBeInTheDocument();
});

it.each(["HELD", "DRIFT", "INCOMPLETE"] as const)("does not hide a selected %s track behind other saved tracks", status => {
  render(<RecordingUploadStatus sourceIds={["saved", "problem"]} evidence={{sources: [source("saved", "VERIFIED_MATCH"), source("problem", status)], counts: {VERIFIED_MATCH: 1, HELD: 0, DRIFT: 0, INCOMPLETE: 0, [status]: 1}}} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent(status === "INCOMPLETE" ? "This recording is not ready yet" : "This recording needs attention");
  expect(screen.queryByText("2 tracks saved")).not.toBeInTheDocument();
});

it("does not substitute a different saved source when selected evidence has not loaded", () => {
  render(<RecordingUploadStatus sourceIds={["not-loaded"]} evidence={{...evidence, sources: [source("saved", "VERIFIED_MATCH")]}} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("This recording is not ready yet");
  expect(screen.getByRole("link", {name: "View recording details"})).toHaveAttribute("href", "#source-evidence-heading");
});

it("updates the headline when the selected attempt changes", () => {
  const current = {sources: [source("saved", "VERIFIED_MATCH"), source("old", "HELD")], counts: {VERIFIED_MATCH: 1, HELD: 1, DRIFT: 0, INCOMPLETE: 0}};
  const {rerender} = render(<RecordingUploadStatus sourceIds={["old"]} evidence={current} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("This recording needs attention");
  rerender(<RecordingUploadStatus sourceIds={["saved"]} evidence={current} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent(/^Recording saved$/);
});
