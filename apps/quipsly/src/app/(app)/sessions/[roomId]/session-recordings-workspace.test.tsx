/** @jest-environment jsdom */
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecordingDetails, RecordingUploadStatus } from "./session-recordings-workspace";
import { EMPTY_SESSION_READINESS_TOPOLOGY } from "./session-readiness-topology";
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

it("does not tell someone to close a device with a pending recording", () => {
  render(<RecordingUploadStatus evidence={evidence} topology={{ ...EMPTY_SESSION_READINESS_TOPOLOGY,
    exitReadiness: { ...EMPTY_SESSION_READINESS_TOPOLOGY.exitReadiness, pendingCaptureCount: 1 } }} />);
  expect(screen.getByRole("heading")).toHaveTextContent("Recording upload in progress");
  expect(screen.getByText(/Keep Quipsly open on the recording devices/)).toBeVisible();
  expect(screen.queryByText(/You can leave/)).not.toBeInTheDocument();
});

it("reports saved recordings without requiring a plan or claiming all devices finished", () => {
  render(<RecordingUploadStatus evidence={evidence} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("1 recording saved");
  expect(screen.queryByText(/safe to leave|plan required/i)).not.toBeInTheDocument();
});

it("keeps a real source problem visible outside troubleshooting", () => {
  render(<RecordingUploadStatus evidence={{ ...evidence, counts: { ...evidence.counts, DRIFT: 1 } }} topology={EMPTY_SESSION_READINESS_TOPOLOGY} />);
  expect(screen.getByRole("heading")).toHaveTextContent("A recording needs attention");
  expect(screen.getByRole("link", { name: "View recording details" })).toHaveAttribute("href", "#session-readiness-topology-heading");
});
