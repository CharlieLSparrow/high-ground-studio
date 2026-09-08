import { conversationWorkSourceHref } from "./conversation-work-source";
const source = { conversationSource: { schema: "quipsly-conversation-work-v1", engagementId: "space", messageId: "message-1" } };
test("opens the exact message in the right client-space tab", () => {
  expect(conversationWorkSourceHref("space", source)).toBe("/coaching/engagements/space?message=message-1#relationship-conversation");
});
test("rejects mismatched spaces and malformed or untyped pointers", () => {
  expect(conversationWorkSourceHref("other", source)).toBeNull();
  expect(conversationWorkSourceHref(null, source)).toBeNull();
  expect(conversationWorkSourceHref("space", { conversationSource: { ...source.conversationSource, messageId: "../foreign#" } })).toBeNull();
  expect(conversationWorkSourceHref("space", {})).toBeNull();
});
