import {browserRecordingControl} from "./browser-recording-control";
const ready = {status: "ready" as const, canControlRoom: true, closed: false, directiveActive: false,
  directiveBusy: false, myConsent: true, waitingForConsent: false, ready: true, canJoinActive: false};
it("offers direct Record only to a ready host", () => {
  expect(browserRecordingControl(ready)).toMatchObject({action:"START",disabled:false});
  expect(browserRecordingControl({...ready,canControlRoom:false})).toMatchObject({action:null});
  expect(browserRecordingControl({...ready,myConsent:false})).toMatchObject({action:null});
  expect(browserRecordingControl({...ready,waitingForConsent:true})).toMatchObject({action:null});
  expect(browserRecordingControl({...ready,ready:false})).toMatchObject({action:"START",disabled:true});
});
it("lets the host stop an active directive even if this device did not start", () => {
  expect(browserRecordingControl({...ready,directiveActive:true,ready:false,myConsent:false})).toMatchObject({action:"STOP",disabled:false});
  expect(browserRecordingControl({...ready,closed:true,directiveActive:true})).toMatchObject({action:"STOP"});
});
it("lets participants stop their own recording, without granting a room-wide stop", () => {
  expect(browserRecordingControl({...ready,status:"recording",canControlRoom:false})).toMatchObject({action:"STOP_LOCAL",recording:true});
});
it("offers recovery for a client joining an active recording", () => {
  expect(browserRecordingControl({...ready,canControlRoom:false,directiveActive:true,canJoinActive:true})).toMatchObject({action:"JOIN",disabled:false});
  expect(browserRecordingControl({...ready,canControlRoom:false,directiveActive:true,canJoinActive:false})).toMatchObject({action:null});
});
it.each(["checking","starting","stopping","uploading"] as const)("does not start another take while %s", status => {
  expect(browserRecordingControl({...ready,status})).toMatchObject({disabled:true});
});
it("reopens a closed session only for its host", () => {
  expect(browserRecordingControl({...ready,closed:true})).toMatchObject({action:"REOPEN"});
  expect(browserRecordingControl({...ready,closed:true,canControlRoom:false})).toMatchObject({action:null});
});
