import { recordingListenPlan, listenProgramPosition, listenSourcePositions } from "./recording-listen-plan";

test("trim and overlapping transcript cuts produce one continuous listening clock", () => {
  const spans = recordingListenPlan(2, 20, [
    {startSeconds: 12, endSeconds: 15}, {startSeconds: 5, endSeconds: 9}, {startSeconds: 8, endSeconds: 10},
    {startSeconds: -5, endSeconds: 1}, {startSeconds: 30, endSeconds: 32},
  ]);
  expect(spans).toEqual([
    {startSeconds: 2, endSeconds: 5, outputStart: 0, outputEnd: 3},
    {startSeconds: 10, endSeconds: 12, outputStart: 3, outputEnd: 5},
    {startSeconds: 15, endSeconds: 20, outputStart: 5, outputEnd: 10},
  ]);
  expect(listenProgramPosition(spans, 3)?.seconds).toBe(10);
  expect(listenProgramPosition(spans, 5.5)?.seconds).toBe(15.5);
  expect(listenProgramPosition(spans, 999)?.seconds).toBe(20);
});

test("source positions preserve delayed starts, reconnects and gaps", () => {
  const sources = [{id: "coach", label: "Coach", url: "/coach", offset: 0, duration: 8},
    {id: "client", label: "Client", url: "/client", offset: 2.25, duration: 10},
    {id: "reconnect", label: "Coach", url: "/reconnect", offset: 9, duration: 10}];
  expect(listenSourcePositions(sources, 3).map(part => [part.source.id, part.seconds])).toEqual([["coach", 3], ["client", 0.75]]);
  expect(listenSourcePositions(sources, 8).map(part => part.source.id)).toEqual(["client"]);
  expect(listenSourcePositions(sources, 10).map(part => [part.source.id, part.seconds])).toEqual([["client", 7.75], ["reconnect", 1]]);
});

test("fully removed and invalid edits cannot play phantom audio", () => {
  expect(recordingListenPlan(2, 5, [{startSeconds: 0, endSeconds: 6}])).toEqual([]);
  expect(recordingListenPlan(NaN, 5, [])).toEqual([]);
  expect(recordingListenPlan(5, 2, [])).toEqual([]);
  expect(listenProgramPosition([], 2)).toBeNull();
  expect(recordingListenPlan(0, 5, [{startSeconds: NaN, endSeconds: 3}])).toHaveLength(1);
});
