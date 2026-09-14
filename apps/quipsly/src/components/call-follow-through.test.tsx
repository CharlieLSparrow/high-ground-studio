import { fireEvent, render, screen } from "@testing-library/react";
import { CallFollowThrough } from "./call-follow-through";
import { useSessionAfterCall } from "@/hooks/use-session-after-call";

jest.mock("@/hooks/use-session-after-call", () => ({ useSessionAfterCall: jest.fn() }));
beforeEach(() => jest.mocked(useSessionAfterCall).mockReturnValue({ summary: null, error: null, retry: jest.fn() }));

describe("call follow-through", () => {
  it("makes the actual recap and next steps usable beside the call while uploads continue", () => {
    const onOpenNotes = jest.fn(), onOpenTasks = jest.fn(), onOpenChat = jest.fn(), onOpenWork = jest.fn();
    jest.mocked(useSessionAfterCall).mockReturnValue({summary: {roomId: "room", recordings: {uploaded: 1, pending: 1, attention: 0},
      transcripts: {available: 1, processing: 0, attention: 0}, transcriptSourceId: "source",
      followThrough: {recap: {id: "recap", title: "What matters next", excerpt: "Our edited recap, not a generated snapshot.", visibility: "AUTHOR_PRIVATE"},
        openTasks: 1, openGoals: 0, nextSteps: [{id: "task", title: "Draft one paragraph", kind: "TASK", ownerLabel: "Casey", visibility: "SESSION_SHARED"}]}}, error: null, retry: jest.fn()});
    render(<CallFollowThrough roomId="room" recording={{phase: "uploading", recordingHref: null, transcriptHref: null}}
      onOpenRecording={jest.fn()} onOpenNotes={onOpenNotes} onOpenTasks={onOpenTasks} onOpenChat={onOpenChat} onOpenWork={onOpenWork} />);
    expect(screen.getByLabelText("Session recap")).toHaveTextContent("Our edited recap, not a generated snapshot.");
    expect(screen.getByLabelText("Session recap")).toHaveTextContent("Only you");
    expect(screen.getByLabelText("Session next steps")).toHaveTextContent("Draft one paragraph");
    fireEvent.click(screen.getByRole("button", {name: "Open recap"}));
    expect(onOpenNotes).toHaveBeenCalledWith("recap");
    fireEvent.click(screen.getByRole("button", {name: "Tasks and goals"}));
    fireEvent.click(screen.getByRole("button", {name: "Continue conversation"}));
    expect(onOpenTasks).toHaveBeenCalledTimes(1);
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenWork).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "View upload progress"})).toBeEnabled();
  });
  it("opens the latest shared take explicitly instead of restoring an older editor draft", () => {
    jest.mocked(useSessionAfterCall).mockReturnValue({summary: {roomId: "room", recordings: {uploaded: 2, pending: 0, attention: 0},
      transcripts: {available: 0, processing: 1, attention: 0}, transcriptSourceId: null, recordingSourceId: "new-take-source", otherRecordingCount: 4}, error: null, retry: jest.fn()});
    render(<CallFollowThrough roomId="room" recording={null} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("link", {name: "Listen and edit recording"})).toHaveAttribute("href", "/sessions/room?mode=recordings&source=new-take-source");
    expect(screen.getByRole("link", {name: "View all session recordings"})).toHaveAttribute("href", "/sessions/room?mode=recordings");
  });
  it("labels the current take and keeps earlier recordings reachable without claiming their text is current", () => {
    jest.mocked(useSessionAfterCall).mockReturnValue({summary: {roomId: "room", recordings: {uploaded: 0, pending: 1, attention: 0},
      transcripts: {available: 0, processing: 0, attention: 0}, transcriptSourceId: null, otherRecordingCount: 4}, error: null, retry: jest.fn()});
    render(<CallFollowThrough roomId="room" recording={null} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("heading", {name: "Latest recording"})).toBeVisible();
    expect(screen.getByRole("link", {name: "View all session recordings"})).toHaveAttribute("href", "/sessions/room?mode=recordings");
    expect(screen.queryByText(/available to open and edit/)).not.toBeInTheDocument();
  });
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

  it("finds the other person's phone recording and transcript even when this browser never recorded", () => {
    jest.mocked(useSessionAfterCall).mockReturnValue({ summary: { roomId: "room", recordings: { uploaded: 1, pending: 1, attention: 0 }, transcripts: { available: 1, processing: 0, attention: 0 }, transcriptSourceId: "phone" }, error: null, retry: jest.fn() });
    render(<CallFollowThrough roomId="room" recording={null} onOpenRecording={jest.fn()} />);
    expect(screen.getByLabelText("Session updates")).toHaveTextContent("1 uploaded recording available");
    expect(screen.getByLabelText("Session updates")).toHaveTextContent("1 more uploading");
    expect(screen.getByRole("link", { name: "Listen and edit recording" })).toHaveAttribute("href", "/sessions/room?mode=recordings");
    expect(screen.getByRole("link", { name: "Open transcript" })).toHaveAttribute("href", "/sessions/room?mode=transcript");
    expect(screen.getByRole("link", { name: "Continue conversation" })).toHaveAttribute("href", "/sessions/room?mode=conversation");
  });

  it.each([null, { phase: "ready" as const, recordingHref: "/local", transcriptHref: "/sessions/room?mode=transcript&source=my-mic" }])("opens the combined session transcript when both sides are available (local=%s)", recording => {
    jest.mocked(useSessionAfterCall).mockReturnValue({ summary: { roomId: "room", recordings: { uploaded: 2, pending: 0, attention: 0 }, transcripts: { available: 2, processing: 0, attention: 0 }, transcriptSourceId: "phone" }, error: null, retry: jest.fn() });
    render(<CallFollowThrough roomId="room" recording={recording} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("link", { name: "Open transcript" })).toHaveAttribute("href", "/sessions/room?mode=transcript");
  });

  it("keeps a single recording bound to its exact transcript", () => {
    jest.mocked(useSessionAfterCall).mockReturnValue({ summary: { roomId: "room", recordings: { uploaded: 1, pending: 0, attention: 0 }, transcripts: { available: 1, processing: 0, attention: 0 }, transcriptSourceId: "phone" }, error: null, retry: jest.fn() });
    render(<CallFollowThrough roomId="room" recording={null} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("link", {name: "Open transcript"})).toHaveAttribute("href", "/sessions/room?mode=transcript&source=phone");
  });

  it("keeps local upload recovery and existing shared recordings reachable together", () => {
    jest.mocked(useSessionAfterCall).mockReturnValue({ summary: { roomId: "room", recordings: { uploaded: 1, pending: 1, attention: 1 }, transcripts: { available: 0, processing: 1, attention: 0 }, transcriptSourceId: null }, error: null, retry: jest.fn() });
    render(<CallFollowThrough roomId="room" recording={{ phase: "uploading", recordingHref: null, transcriptHref: null }} onOpenRecording={jest.fn()} />);
    expect(screen.getByRole("button", { name: "View upload progress" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Open session recordings" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Check transcription" })).toBeVisible();
    expect(screen.queryByText("Your recording is saved")).not.toBeInTheDocument();
  });
});
