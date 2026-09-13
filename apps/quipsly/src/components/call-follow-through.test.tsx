import { fireEvent, render, screen } from "@testing-library/react";
import { CallFollowThrough } from "./call-follow-through";

describe("call follow-through", () => {
  it("offers session work without claiming an unrecorded call was saved", () => {
    render(<CallFollowThrough roomId="room" recording={null} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("link", {name: "Open recordings"})).toHaveAttribute("href", "/sessions/room?mode=recordings");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Rejoin call"})).not.toBeInTheDocument();
  });

  it("keeps useful work available during upload without linking to a stale recording", () => {
    const open = jest.fn();
    const progress = jest.fn();
    render(<CallFollowThrough roomId="room" recording={{phase: "uploading", recordingHref: null, transcriptHref: null}} onOpenWork={open} onOpenRecording={progress} />);
    expect(screen.getByRole("status")).toHaveTextContent("Uploading your recording");
    expect(screen.queryByRole("link", {name: /recording/i})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "View upload progress"}));
    expect(progress).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("link", {name: "Notes and recap"}));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", {name: "Tasks and goals"})).toHaveAttribute("href", "/sessions/room?mode=work");
  });

  it("updates in place from pending to saved with exact source recording and transcript links", () => {
    const view = render(<CallFollowThrough roomId="room" recording={{phase: "saving", recordingHref: null, transcriptHref: null}} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Finishing your recording");
    view.rerender(<CallFollowThrough roomId="room" recording={{phase: "ready", recordingHref: "/sessions/room?mode=recordings&source=new", transcriptHref: "/sessions/room?mode=transcript&source=new"}} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("Your recording is saved");
    expect(screen.getByRole("link", {name: "Listen and edit recording"})).toHaveAttribute("href", "/sessions/room?mode=recordings&source=new");
    expect(screen.getByRole("link", {name: "Open transcript"})).toHaveAttribute("href", "/sessions/room?mode=transcript&source=new");
    expect(screen.queryByRole("button", {name: "View upload progress"})).not.toBeInTheDocument();
  });

  it("opens existing recovery controls instead of requiring an approval or retry ceremony", () => {
    const recover = jest.fn();
    const rejoin = jest.fn();
    render(<CallFollowThrough roomId="room" recording={{phase: "attention", recordingHref: null, transcriptHref: null}} onOpenRecording={recover} onRejoin={rejoin} />);
    fireEvent.click(screen.getByRole("button", {name: "Open recording options"}));
    expect(recover).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", {name: "Rejoin call"}));
    expect(rejoin).toHaveBeenCalledTimes(1);
  });
});
