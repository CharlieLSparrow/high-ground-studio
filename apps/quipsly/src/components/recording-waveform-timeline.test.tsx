import {fireEvent, render, screen} from "@testing-library/react";
import {RecordingWaveformTimeline} from "./recording-waveform-timeline";

const points = [{startSeconds: 0, durationSeconds: 10, rmsDbfs: -18}, {startSeconds: 15, durationSeconds: 5, rmsDbfs: -28}];

describe("Recording waveform timeline", () => {
  it("seeks source time, not a point index, and labels fractional seconds", () => {
    const onSeek = jest.fn();
    render(<RecordingWaveformTimeline duration={20} position={3.25} points={points} onSeek={onSeek} />);
    const slider = screen.getByRole("slider", {name: "Seek recording waveform"});
    expect(slider).toHaveAttribute("aria-valuetext", "0:03.3");
    fireEvent.change(slider, {target: {value: "13.75"}});
    expect(onSeek).toHaveBeenCalledWith(13.75);
    // The five-second gap has no invented waveform bars.
    expect(screen.getByRole("img").querySelectorAll("rect")).toHaveLength(180);
  });

  it("zooms around the playhead and pans without seeking or changing an edit", () => {
    const onSeek = jest.fn();
    const view = render(<RecordingWaveformTimeline duration={100} position={50} points={[]} onSeek={onSeek} />);
    fireEvent.change(screen.getByRole("combobox", {name: "Waveform zoom"}), {target: {value: "4"}});
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "37.5");
    expect(slider).toHaveAttribute("max", "62.5");
    fireEvent.click(screen.getByRole("button", {name: "Earlier audio"}));
    expect(slider).toHaveAttribute("min", "25");
    expect(onSeek).not.toHaveBeenCalled();
    view.rerender(<RecordingWaveformTimeline duration={100} position={90} points={[]} onSeek={onSeek} />);
    fireEvent.click(screen.getByRole("button", {name: "Show playhead"}));
    expect(slider).toHaveAttribute("min", "75");
    expect(slider).toHaveAttribute("max", "100");
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("clips trim and cut overlays to this source without mislabeling original playback", () => {
    const {container} = render(<RecordingWaveformTimeline duration={20} position={0} points={points} onSeek={jest.fn()}
      keptRange={{startSeconds: -4, endSeconds: 15}} removedRanges={[{startSeconds: 4, endSeconds: 6}, {startSeconds: 22, endSeconds: 28}]} />);
    expect(container.querySelectorAll("[data-trimmed-range]")).toHaveLength(1);
    expect(container.querySelector("[data-trimmed-range]")).toHaveStyle({left: "75%", width: "25%"});
    expect(container.querySelectorAll("[data-removed-range]")).toHaveLength(1);
    expect(container.querySelector("[data-removed-range]")).toHaveStyle({left: "20%", width: "10%"});
    expect(screen.getByText(/Playback here is the original track/)).toBeVisible();
  });

  it("keeps navigation available without analysis, but disables it until media is ready", () => {
    const view = render(<RecordingWaveformTimeline duration={20} position={0} points={[]} onSeek={jest.fn()} disabled />);
    expect(screen.getByRole("slider")).toBeDisabled();
    view.rerender(<RecordingWaveformTimeline duration={20} position={0} points={[]} onSeek={jest.fn()} />);
    expect(screen.getByRole("slider")).toBeEnabled();
    expect(screen.getByText(/Waveform is being prepared/)).toBeVisible();
    view.rerender(<RecordingWaveformTimeline duration={NaN} position={NaN} points={[]} onSeek={jest.fn()} />);
    expect(screen.getByRole("slider")).toBeDisabled();
    expect(screen.getByRole("slider")).toHaveAttribute("aria-valuetext", "0:00.0");
  });
});
