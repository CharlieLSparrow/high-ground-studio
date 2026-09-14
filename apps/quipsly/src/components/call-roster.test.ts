import { callEndpointDetails, callEndpointLabel, groupCallPeople, type CallParticipant } from "./call-roster";

const endpoint = (identity: string, metadata?: string): CallParticipant => ({identity, name: "Riley", isLocal: false,
  microphoneMuted: true, speaking: false, ...callEndpointDetails(identity, metadata)});
const metadata = (participantId = "riley", callRoomId = "room") => JSON.stringify({participantId, callRoomId,
  clientKind: "web", deviceLabel: "Laptop", endpointRole: "companion"});

it("groups one person on multiple devices without discarding their endpoint identities", () => {
  const phone = endpoint("phone", metadata()), browser = {...endpoint("browser", metadata()), isLocal: true};
  const people = groupCallPeople([phone, browser]);
  expect(people).toHaveLength(1);
  expect(people[0].endpoints.map(device => device.identity)).toEqual(["phone", "browser"]);
  expect(people[0].isLocal).toBe(true);
  expect(callEndpointLabel(phone, [phone, browser])).toBe("Riley (your other device) · Laptop");
  expect(groupCallPeople([phone])).toHaveLength(1);
  expect(callEndpointLabel(phone, [phone])).toBe("Riley");
});

it("never merges people by display name, partial metadata, or another room's participant ID", () => {
  const devices = [endpoint("a", metadata()), endpoint("b", metadata("other")), endpoint("c", metadata("riley", "other-room")),
    endpoint("d", '{"participantId":"riley"}'), endpoint("e", '{"participantId":"riley"}')];
  expect(groupCallPeople(devices)).toHaveLength(5);
});

it.each([undefined, "", "{", "null", "[]", "true", '{"participantId":1,"callRoomId":2}'])("keeps malformed metadata isolated: %s", value => {
  expect(groupCallPeople([endpoint("a", value), endpoint("b", value)])).toHaveLength(2);
});

it("uses bounded plain-text device names and exposes companion role without granting capabilities", () => {
  const details = callEndpointDetails("x", JSON.stringify({deviceLabel: "x".repeat(200), endpointRole: "companion"}));
  expect(details.deviceLabel).toHaveLength(80);
  expect(details.companion).toBe(true);
  expect(callEndpointDetails("x", '{"clientKind":"web"}').deviceLabel).toBe("Browser");
  expect(callEndpointDetails("x", '{"clientKind":"__proto__"}').deviceLabel).toBe("Device");
});
