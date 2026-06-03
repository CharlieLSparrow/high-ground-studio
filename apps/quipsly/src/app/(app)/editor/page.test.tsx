import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CloudEditor from "./page";
import { submitRenderJob } from "../render-queue/actions";
import { useRouter } from "next/navigation";

// Mock the router
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Mock the server action
jest.mock("../render-queue/actions", () => ({
  submitRenderJob: jest.fn(),
}));

describe("CloudEditor", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ push: mockPush });
  });

  it("renders CloudEditor component in timeline mode by default", () => {
    render(<CloudEditor />);
    
    // Header check
    expect(screen.getByText("NLE // Editor")).toBeInTheDocument();
    
    // Toolbar checks
    expect(screen.getByText("TIMELINE")).toBeInTheDocument();
    expect(screen.getByText("TRANSCRIPT (DESCRIPT)")).toBeInTheDocument();
    expect(screen.getByText("REFRAME (INSTA360)")).toBeInTheDocument();
    
    // Media Pool should show mock assets
    expect(screen.getByText("A-Roll_Take_1.mp4")).toBeInTheDocument();
    expect(screen.getByText("B-Roll_City.mp4")).toBeInTheDocument();
    
    // Timeline mode is active (TELEMETRY track should be visible)
    expect(screen.getByText("TELEMETRY")).toBeInTheDocument();
    expect(screen.getByText("24% Drop")).toBeInTheDocument();
  });

  it("switches out of timeline mode when clicking Transcript button", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);
    
    // Initially TELEMETRY is in document because we are in timeline mode
    expect(screen.getByText("TELEMETRY")).toBeInTheDocument();
    
    // Click Transcript button
    const transcriptBtn = screen.getByText("TRANSCRIPT (DESCRIPT)");
    await user.click(transcriptBtn);
    
    // Timeline mode should be false, TELEMETRY should not be visible
    expect(screen.queryByText("TELEMETRY")).not.toBeInTheDocument();
  });

  it("imports Studio Cut correctly and updates timeline clips and graphics track", async () => {
    const user = userEvent.setup();
    render(<CloudEditor />);
    
    // Click Import Studio Cut
    const importBtn = screen.getByText("Import Studio Cut");
    await user.click(importBtn);
    
    // After importing, the timeline clips should update to the parsed cut
    expect(screen.getByText("[Beat] Source Mapping")).toBeInTheDocument();
    expect(screen.getByText("[Beat] Shape Production")).toBeInTheDocument();
    expect(screen.getByText("[Beat] Publish Stage")).toBeInTheDocument();
    
    // The graphics track should also update
    expect(screen.getByText("🎙️ Charlie: Confirm the host framing")).toBeInTheDocument();
    expect(screen.getByText("🎙️ Homer: Confirm what must be revised")).toBeInTheDocument();
  });

  it("calls submitRenderJob with correct payload when Export to Queue is clicked", async () => {
    const user = userEvent.setup();
    (submitRenderJob as jest.Mock).mockResolvedValue({ success: true, jobId: "mock_job_123" });
    
    render(<CloudEditor />);
    
    // Click Export to Queue
    const exportBtn = screen.getByText("Export to Queue");
    await user.click(exportBtn);
    
    // submitRenderJob should have been called with the EDL payload
    expect(submitRenderJob).toHaveBeenCalledTimes(1);
    
    const expectedJobName = "The AI Revolution (Final Cut)";
    
    // Check the args passed to submitRenderJob
    const args = (submitRenderJob as jest.Mock).mock.calls[0];
    expect(args[0]).toBe(expectedJobName);
    expect(args[1]).toHaveProperty("clips");
    expect(args[1]).toHaveProperty("graphics");
    expect(args[1]).toHaveProperty("transcript");
    
    // It should have the mock default transcript blocks
    expect(args[1].transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: "Welcome back to the podcast. Today we are talking about the AI revolution." })
      ])
    );
    
    // It should redirect to /render-queue after exporting
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/render-queue");
    });
  });

  it("disables export button while exporting", async () => {
    const user = userEvent.setup();
    
    // Make the submitRenderJob take some time so we can check the disabled state
    let resolveSubmit: (value: any) => void;
    (submitRenderJob as jest.Mock).mockImplementation(() => {
      return new Promise((resolve) => {
        resolveSubmit = resolve;
      });
    });
    
    render(<CloudEditor />);
    
    const exportBtn = screen.getByRole("button", { name: "Export to Queue" });
    expect(exportBtn).not.toBeDisabled();
    
    // Click Export
    await user.click(exportBtn);
    
    // Button should change to Sending... and be disabled
    const exportingBtn = screen.getByRole("button", { name: "Sending..." });
    expect(exportingBtn).toBeDisabled();
    
    // Resolve the submission
    resolveSubmit!({ success: true });
    
    // Wait for the button to go back to "Export to Queue"
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Export to Queue" })).not.toBeDisabled();
    });
  });
});
