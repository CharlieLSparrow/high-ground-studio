import {callGalleryGrid, callGalleryPage, nextCallSpeaker} from "./call-gallery-layout";

it("fits a conversation to portrait, landscape and narrow sidebar stages", () => {
  expect(callGalleryGrid(2, 390, 550)).toEqual({columns: 1, rows: 2});
  expect(callGalleryGrid(2, 1000, 500)).toEqual({columns: 2, rows: 1});
  expect(callGalleryGrid(4, 1000, 600)).toEqual({columns: 2, rows: 2});
  expect(callGalleryGrid(0, 0, 0)).toEqual({columns: 1, rows: 1});
});

it("clamps pagination as people leave", () => {
  expect(callGalleryPage([1, 2, 3], 4, 2)).toEqual({page: 1, pageCount: 2, items: [3]});
  expect(callGalleryPage([], 2, 9)).toEqual({page: 0, pageCount: 1, items: []});
});

it("prefers the other person and retains the last speaker during silence or overlap", () => {
  const people = [{identity: "me", isLocal: true, speaking: true}, {identity: "one", isLocal: false, speaking: false}, {identity: "two", isLocal: false, speaking: false}];
  expect(nextCallSpeaker(people, null)).toBe("one");
  expect(nextCallSpeaker(people, "two")).toBe("two");
  expect(nextCallSpeaker(people.map(person => ({...person, speaking: true})), "two")).toBe("two");
  expect(nextCallSpeaker([], "two")).toBeNull();
  expect(nextCallSpeaker([people[0]], "two")).toBe("me");
});
