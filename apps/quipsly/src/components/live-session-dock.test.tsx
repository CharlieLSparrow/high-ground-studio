import React, { useEffect, useRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  LiveSessionDockLauncher,
  LiveSessionDockProvider,
  type LiveSessionDockConfig,
} from "./live-session-dock";

const mockRoomLifecycle = {
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
    useEffect(() => onStatusChange?.("connected"), [onStatusChange]);
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
    return <div data-testid={`live-room-${callRoomId}`}>Mounted LiveKit room {callRoomId} · take {captureGroupId}</div>;
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
    mockRoomLifecycle.mounted.mockClear();
    mockRoomLifecycle.unmounted.mockClear();
    mockRoomLifecycle.leaveRequested.mockClear();
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
