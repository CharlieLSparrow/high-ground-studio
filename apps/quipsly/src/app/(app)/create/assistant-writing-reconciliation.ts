/** A delayed assistant response must not replace text typed since the last save. */
export function keepLocalWriting(localText: string, committedText: string | undefined, savedAssistantText: string) {
  return localText !== savedAssistantText && localText !== committedText;
}
