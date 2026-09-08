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
test("Nest task source links use the actual project, never an arbitrary source URL or private thread", () => {
  const nestSource = { conversationSource: { schema: "quipsly-conversation-work-v1", projectId: "nest", threadKey: "default", messageId: "message-2" } };
  expect(conversationWorkSourceHref(null, nestSource, { id: "nest", slug: "our-book" })).toBe("/nests/our-book/workspace?message=message-2");
  expect(conversationWorkSourceHref(null, nestSource, { id: "other", slug: "our-book" })).toBeNull();
  expect(conversationWorkSourceHref(null, { conversationSource: { ...nestSource.conversationSource, threadKey: "engagement:private" } }, { id: "nest", slug: "our-book" })).toBeNull();
});
