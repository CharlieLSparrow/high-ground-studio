import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TranscriptExportDialog } from "./transcript-export-dialog";

const segments = [{text: "The corrected chapter title.", speakerLabel: "Riley", startSeconds: 2, endSeconds: 5}];
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = jest.fn(function(this: HTMLDialogElement) {this.open = true;});
  HTMLDialogElement.prototype.close = jest.fn(function(this: HTMLDialogElement) {this.open = false;});
  URL.createObjectURL = jest.fn(() => "blob:transcript-export");
  URL.revokeObjectURL = jest.fn();
});

function openExport() {fireEvent.click(screen.getByRole("button", {name: "Export transcript"}));}

it("opens a normal export dialog with a downloadable full transcript and preview", async () => {
  render(<TranscriptExportDialog title="Coaching" segments={segments} />);
  openExport();
  expect(await screen.findByRole("dialog", {name: "Export transcript"})).toBeVisible();
  expect(screen.getByRole("link", {name: "Download TXT"})).toHaveAttribute("download", "coaching-transcript.txt");
  expect(screen.getByLabelText("Transcript export preview")).toHaveTextContent("The corrected chapter title.");
  expect(screen.getByText(/full available transcript/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("File format"), {target: {value: "srt"}});
  expect(await screen.findByRole("link", {name: "Download SRT"})).toHaveAttribute("download", "coaching-transcript.srt");
  expect(screen.getByLabelText("Include timestamps")).toBeDisabled();
  expect(screen.getByLabelText("Transcript export preview")).toHaveTextContent("00:00:02,000 --> 00:00:05,000");
});

it("updates the file after corrections and revokes the old preview URL", async () => {
  const {rerender, unmount} = render(<TranscriptExportDialog title="Coaching" segments={segments} />);
  openExport();
  rerender(<TranscriptExportDialog title="Coaching" segments={[{...segments[0], text: "New correction."}]} />);
  expect(screen.getByLabelText("Transcript export preview")).toHaveTextContent("New correction.");
  expect(screen.getByLabelText("Transcript export preview")).not.toHaveTextContent(segments[0].text);
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  unmount();
});

it("hides protected content and download links when access becomes unavailable", () => {
  const {rerender} = render(<TranscriptExportDialog title="Coaching" segments={segments} />);
  openExport();
  rerender(<TranscriptExportDialog title="Coaching" segments={segments} disabled />);
  expect(screen.queryByRole("link", {name: "Download TXT"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Transcript export preview")).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});

it("keeps text export usable when subtitles lack timing", () => {
  render(<TranscriptExportDialog title="Coaching" segments={[{...segments[0], endSeconds: 1}]} />);
  openExport();
  expect(screen.getByRole("option", {name: "Subtitles (.srt)"})).toBeDisabled();
  expect(screen.getByRole("link", {name: "Download TXT"})).toBeVisible();
});

it("does not claim delivery when the user cancels the system share sheet", async () => {
  Object.defineProperty(navigator, "share", {configurable: true, value: jest.fn().mockRejectedValue(new DOMException("Canceled", "AbortError"))});
  render(<TranscriptExportDialog title="Coaching" segments={segments} />);
  openExport();
  fireEvent.click(screen.getByRole("button", {name: "Share file"}));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Sharing canceled."));
  expect(screen.getByRole("link", {name: "Download TXT"})).toBeVisible();
  Object.defineProperty(navigator, "share", {configurable: true, value: undefined});
});
