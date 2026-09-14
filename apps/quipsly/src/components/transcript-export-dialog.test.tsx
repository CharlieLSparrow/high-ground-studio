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

it("allows a clearly labeled partial export and replaces it automatically when all sources arrive", async () => {
  const view = render(<TranscriptExportDialog title="Coaching" segments={segments} partial />);
  openExport();
  expect(await screen.findByRole("link", {name: "Download TXT"})).toHaveAttribute("download", "coaching-partial-transcript.txt");
  expect(screen.getByLabelText("Transcript export preview")).toHaveTextContent("Partial transcript: some participant recordings are not included yet.");
  view.rerender(<TranscriptExportDialog title="Coaching" segments={segments} partial={false} />);
  expect(await screen.findByRole("link", {name: "Download TXT"})).toHaveAttribute("download", "coaching-transcript.txt");
  expect(screen.getByLabelText("Transcript export preview")).not.toHaveTextContent("Partial transcript:");
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

it("loads only the selected edited recording and refreshes authorization on every open", async () => {
  global.fetch = jest.fn().mockResolvedValue({ok: true, json: async () => ({ok: true, segments, partial: true, notice: "Some words cut at a boundary were omitted."})});
  render(<TranscriptExportDialog title="Edited coaching" sourceUrl="/api/sessions/one/recording-share/transcript/output-one" description="Times match this edited file." />);
  openExport();
  expect(await screen.findByRole("link", {name: "Download TXT"})).toBeVisible();
  expect(global.fetch).toHaveBeenCalledWith("/api/sessions/one/recording-share/transcript/output-one?format=json", expect.objectContaining({cache: "no-store"}));
  expect(screen.getByRole("status")).toHaveTextContent("Some words cut at a boundary");
  expect(screen.getByLabelText("Transcript export preview")).toHaveTextContent("Some words cut at a boundary were omitted.");
  expect(screen.getByRole("link", {name: "Download TXT"})).toHaveAttribute("download", "edited-coaching-partial-transcript.txt");
  fireEvent.click(screen.getByRole("button", {name: "Close transcript export"}));
  jest.mocked(global.fetch).mockResolvedValue({ok: false, json: async () => ({ok: false, error: "This recording is no longer shared."})} as Response);
  openExport();
  expect(await screen.findByRole("alert")).toHaveTextContent("no longer shared");
  expect(screen.queryByRole("link", {name: "Download TXT"})).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Transcript export preview")).not.toBeInTheDocument();
});

it("discards a response for a previous output when the selected recording changes", async () => {
  let resolveOld!: (response: Response) => void;
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
    .mockResolvedValue({ok: true, json: async () => ({ok: true, segments: [{...segments[0], text: "Current edit only"}]})});
  const view = render(<TranscriptExportDialog title="Edit" sourceUrl="/old-output" />);
  openExport();
  view.rerender(<TranscriptExportDialog title="Edit" sourceUrl="/new-output" />);
  expect(await screen.findByLabelText("Transcript export preview")).toHaveTextContent("Current edit only");
  resolveOld({ok: true, json: async () => ({ok: true, segments})} as Response);
  await waitFor(() => expect(screen.getByLabelText("Transcript export preview")).not.toHaveTextContent("The corrected chapter title."));
});
