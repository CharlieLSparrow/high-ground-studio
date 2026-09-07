import React, { useEffect, useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  LiveSessionDockLauncher,
  LiveSessionDockProvider,
  type LiveSessionDockConfig,
  useLiveSessionDock,
  liveSessionStatusLabel,
} from "./live-session-dock";

const mockRoomLifecycle = {
  initialStatus: "connected",
  mounted: jest.fn(),
  unmounted: jest.fn(),
  leaveRequested: jest.fn(),
};

jest.mock("./live-session-room", () => ({
  LiveSessionRoom: ({
    callRoomId,
    captureGroupId,
    onStatusChange,
    onProtectionChange,
    leaveRequestVersion = 0,
    onExitComplete,
  }: {
    callRoomId: string;
    captureGroupId: string;
    onStatusChange?: (status: string) => void;
    onProtectionChange?: (protectedSourceActive: boolean) => void;
    leaveRequestVersion?: number;
    onExitComplete?: () => void;
  }) => {
    const mountedRoomId = useRef(callRoomId).current;
    const handledLeaveRequest = useRef(0);
    useEffect(() => onStatusChange?.(mockRoomLifecycle.initialStatus), [onStatusChange]);
    useEffect(() => onProtectionChange?.(true), [onProtectionChange]);
    useEffect(() => {
      if (leaveRequestVersion <= 0 || leaveRequestVersion === handledLeaveRequest.current) return;
      handledLeaveRequest.current = leaveRequestVersion;
      mockRoomLifecycle.leaveRequested(mountedRoomId);
      onProtectionChange?.(false);
      onStatusChange?.("ended");
      onExitComplete?.();
    }, [leaveRequestVersion, mountedRoomId, onExitComplete, onProtectionChange, onStatusChange]);
    useEffect(() => {
      mockRoomLifecycle.mounted(mountedRoomId);
      return () => mockRoomLifecycle.unmounted(mountedRoomId);
    }, [mountedRoomId]);
    return <div data-testid={`live-room-${callRoomId}`}>Mounted LiveKit room {callRoomId} · take {captureGroupId}<button onClick={() => onStatusChange?.("connected")}>Simulate connection</button><button onClick={() => onStatusChange?.("reconnecting")}>Simulate reconnect</button></div>;
  },
}));

jest.mock("./session-thread", () => ({
  SessionThread: ({ roomId }: { roomId: string }) => <div>Durable thread {roomId}</div>,
}));

const episodeConfig: LiveSessionDockConfig = {
  callRoomId: "episode-session-1",
  captureGroupId: "55555555-5555-4555-8555-555555555551",
  sessionTitle: "Episode 7 recording",
  kind: "episode",
  purpose: "PODCAST",
  projectSlug: "high-ground-odyssey",
  episodeSlug: "episode-7",
  parentLabel: "Episode Room",
  parentHref: "/nests/high-ground-odyssey/episodes/episode-7",
};

const coachingConfig: LiveSessionDockConfig = {
  callRoomId: "coaching-session-2",
  captureGroupId: "55555555-5555-4555-8555-555555555552",
  sessionTitle: "Retained coaching follow-up",
  kind: "coaching",
  purpose: "COACHING",
  projectSlug: "coaching",
  parentLabel: "Coaching engagement",
  parentHref: "/coaching/engagements/engagement-2",
};

describe("LiveSessionDockProvider", () => {
  beforeEach(() => {
    mockRoomLifecycle.initialStatus = "connected";
    mockRoomLifecycle.mounted.mockClear();
    mockRoomLifecycle.unmounted.mockClear();
    mockRoomLifecycle.leaveRequested.mockClear();
  });

  it("distinguishes an open lobby from an actual call and retains state when minimized", async () => {
    mockRoomLifecycle.initialStatus = "ready";
    const user = userEvent.setup();
    function Status() {
      const dock = useLiveSessionDock();
      return <output data-testid="connection-status">{dock.connectionStatus}</output>;
    }
    render(<LiveSessionDockProvider><Status /><LiveSessionDockLauncher config={coachingConfig} autoOpen /></LiveSessionDockProvider>);
    expect(screen.getByTestId("connection-status")).toHaveTextContent("ready");
    expect(screen.getByText("Ready to join")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Transcript" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simulate connection" }));
    expect(screen.getByTestId("connection-status")).toHaveTextContent("connected");
    expect(screen.getByRole("link", { name: "Transcript" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Simulate reconnect" }));
    expect(screen.getByTestId("connection-status")).toHaveTextContent("reconnecting");
    await user.click(screen.getByRole("button", { name: "Minimize live call" }));
    expect(screen.getByLabelText("Minimized live call")).toHaveTextContent("Reconnecting…");
    expect(mockRoomLifecycle.unmounted).not.toHaveBeenCalled();
  });

  it.each(["preflight", "checking", "ready", "joining", "reconnecting", "ended", "error"] as const)("does not label %s as an in-progress connection", (status) => {
    expect(liveSessionStatusLabel(status)).not.toBe("In call");
  });

  it("keeps the real room mounted while the controls are minimized", async () => {
    const user = userEvent.setup();
    render(
      <LiveSessionDockProvider>
        <LiveSessionDockLauncher config={episodeConfig} autoOpen />
      </LiveSessionDockProvider>,
    );

    expect(await screen.findByTestId("live-room-episode-session-1")).toBeInTheDocument();
    expect(screen.getByTestId("live-room-episode-session-1")).toHaveTextContent(
      "take 55555555-5555-4555-8555-555555555551",
    );
    await user.click(screen.getByRole("button", { name: "Minimize live call" }));

    expect(screen.getByTestId("live-room-episode-session-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimized live call")).toBeInTheDocument();
    expect(screen.queryByTestId("live-room-coaching-session-2")).not.toBeInTheDocument();
  });

  it.each(["Notes", "Transcript", "Goals & tasks", "Episode Room"])("reveals %s while retaining the connected room", async (name) => {
    const user = userEvent.setup();
    render(<LiveSessionDockProvider><LiveSessionDockLauncher config={episodeConfig} autoOpen /></LiveSessionDockProvider>);
    await user.click(screen.getByRole("link", { name }));
    expect(screen.getByLabelText("Minimized live call")).toHaveTextContent("In call");
    expect(screen.getByTestId("live-room-episode-session-1")).toBeInTheDocument();
    expect(mockRoomLifecycle.leaveRequested).not.toHaveBeenCalled();
    expect(mockRoomLifecycle.unmounted).not.toHaveBeenCalled();
  });

  it("requires an explicit leave decision instead of treating close like minimize", async () => {
    const user = userEvent.setup();
    render(
      <LiveSessionDockProvider>
        <LiveSessionDockLauncher config={episodeConfig} autoOpen />
      </LiveSessionDockProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Minimize live call" }));
    await user.click(screen.getByRole("button", { name: "Leave or close live call" }));
    expect(screen.getByText("Leave this live call?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave & close" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep call & minimize" }));
    expect(screen.getByTestId("live-room-episode-session-1")).toBeInTheDocument();
  });

  it("does not silently replace an active call when another Session is opened", async () => {
    const user = userEvent.setup();
    render(
      <LiveSessionDockProvider>
        <LiveSessionDockLauncher config={episodeConfig} autoOpen label="Open episode call" />
        <LiveSessionDockLauncher config={coachingConfig} label="Open coaching call" />
      </LiveSessionDockProvider>,
    );

    expect(await screen.findByTestId("live-room-episode-session-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open coaching call" }));

    expect(screen.getByText("Another Session requested")).toBeInTheDocument();
    expect(screen.getByTestId("live-room-episode-session-1")).toBeInTheDocument();
    expect(screen.queryByTestId("live-room-coaching-session-2")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Leave & switch" }));
    expect(await screen.findByTestId("live-room-coaching-session-2")).toBeInTheDocument();
    expect(screen.queryByTestId("live-room-episode-session-1")).not.toBeInTheDocument();
    expect(mockRoomLifecycle.leaveRequested).toHaveBeenCalledWith("episode-session-1");
    expect(mockRoomLifecycle.unmounted).toHaveBeenCalledWith("episode-session-1");
    expect(mockRoomLifecycle.mounted).toHaveBeenCalledWith("coaching-session-2");
    expect(mockRoomLifecycle.leaveRequested.mock.invocationCallOrder[0]).toBeLessThan(
      mockRoomLifecycle.unmounted.mock.invocationCallOrder[0],
    );
  });
});
