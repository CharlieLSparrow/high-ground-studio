import {fireEvent, render, screen} from "@testing-library/react";
import {TranscriptRecordingPicker} from "./transcript-recording-picker";
const push = jest.fn();
jest.mock("next/navigation", () => ({useRouter: () => ({push})}));
const sources = [{recordingAssetId: "first", fileName: "First conversation.wav"}, {recordingAssetId: "second", fileName: "Second conversation.wav"}];
beforeEach(() => push.mockClear());

it("opens an older recording's transcript without carrying a timestamp from another source", () => {
  render(<TranscriptRecordingPicker roomId="room" sources={sources} selectedSourceId={null} />);
  fireEvent.change(screen.getByRole("combobox", {name: "Transcript recording"}), {target: {value: "first"}});
  expect(push).toHaveBeenCalledWith("/sessions/room?mode=transcript&source=first");
});
it("makes the selected source explicit and can return to the latest session transcript", () => {
  render(<TranscriptRecordingPicker roomId="room" sources={sources} selectedSourceId="second" />);
  expect(screen.getByRole("combobox")).toHaveValue("second");
  fireEvent.change(screen.getByRole("combobox"), {target: {value: ""}});
  expect(push).toHaveBeenCalledWith("/sessions/room?mode=transcript");
});
it("does not relabel a missing source as latest or navigate automatically", () => {
  render(<TranscriptRecordingPicker roomId="room" sources={sources} selectedSourceId="missing" />);
  expect(screen.getByRole("combobox")).toHaveValue("missing");
  expect(screen.getByRole("option", {name: "Selected recording unavailable"})).toBeDisabled();
  expect(push).not.toHaveBeenCalled();
});
it("does not add a picker when there is no choice", () => {
  render(<TranscriptRecordingPicker roomId="room" sources={[sources[0]]} selectedSourceId={null} />);
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});
it("labels generated captures with readable dates while retaining user file names", () => {
  render(<TranscriptRecordingPicker roomId="room" selectedSourceId={null} sources={[
    ...sources,
    {recordingAssetId: "new", fileName: "quipsly-20260914-054002-acadfb86.caf",
      startBoundary: {occurredAt: "2026-09-14T05:40:02Z"}},
  ]} />);
  expect(screen.getByRole("option", {name: /Audio recording · Recorded/})).toHaveValue("new");
  expect(screen.getByRole("option", {name: "First conversation.wav"})).toBeVisible();
  expect(screen.getAllByRole("option")[1]).toHaveValue("new");
  expect(screen.queryByRole("option", {name: /acadfb86/})).not.toBeInTheDocument();
});
