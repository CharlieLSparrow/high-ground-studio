import { fireEvent, render, screen } from "@testing-library/react";
import { CallRecordingStatus } from "./call-recording-status";
import type { BrowserRecordingDirective } from "@/lib/browser-recording-directive";

const directive: BrowserRecordingDirective = {
  id:"start", sequence:"1", action:"START", captureGroupId:"take", issuedAt:"2026-09-14T00:00:00Z", shouldRecord:true,
  participantStatuses:[
    {id:"coach",participantLabel:"Casey",state:"RECORDING",endpointCount:2,recordingEndpointCount:2,attentionEndpointCount:0},
    {id:"client",participantLabel:"Riley",state:"WAITING",endpointCount:0,recordingEndpointCount:0,attentionEndpointCount:0},
  ], endpointReceipts:[], recordingHealth:{expectedParticipantCount:2,participantWithEndpointCount:1,
    recordingParticipantCount:1,attentionParticipantCount:0,waitingParticipantCount:1,allParticipantsRecording:false,allParticipantsStoppedSafely:false},
};

it("counts people rather than double-counting a phone and computer and names the missing recorder", () => {
  const open = jest.fn();
  render(<CallRecordingStatus directive={directive} unavailable={false} localRecording muted={false} onOpen={open} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 of 2 people recording");
  expect(screen.getByText("Riley: waiting for recorder")).toBeInTheDocument();
  expect(screen.queryByText("Local recordings are running.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Recording details"}));
  expect(open).toHaveBeenCalledTimes(1);
});

it("does not imply audible speech while the local track is muted", () => {
  const view = render(<CallRecordingStatus directive={directive} unavailable={false} localRecording muted />);
  expect(screen.getByText("Your microphone is muted in the call and recording.")).toBeInTheDocument();
  view.rerender(<CallRecordingStatus directive={directive} unavailable={false} localRecording={false} muted />);
  expect(screen.queryByText("Your microphone is muted in the call and recording.")).not.toBeInTheDocument();
});

it("replaces stale success with reconnecting status without claiming the source stopped", () => {
  render(<CallRecordingStatus directive={directive} unavailable localRecording muted={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("Recording status reconnecting");
  expect(screen.queryByText("1 of 2 people recording")).not.toBeInTheDocument();
  expect(screen.getByText(/Status updates will resume automatically/)).toBeInTheDocument();
});

it("distinguishes stopped local files from uploaded or finished transcripts", () => {
  const stopped: BrowserRecordingDirective = {...directive,action:"STOP",shouldRecord:false,
    participantStatuses:directive.participantStatuses.map(person => ({...person,state:"STOPPED_SAFELY",endpointCount:1})),
    recordingHealth:{...directive.recordingHealth,recordingParticipantCount:0,waitingParticipantCount:0,allParticipantsStoppedSafely:true}};
  render(<CallRecordingStatus directive={stopped} unavailable={false} localRecording={false} muted={false} />);
  expect(screen.getByRole("status")).toHaveTextContent("Everyone’s recording is saved locally");
  expect(screen.queryByText(/uploaded|transcribed/i)).not.toBeInTheDocument();
});
