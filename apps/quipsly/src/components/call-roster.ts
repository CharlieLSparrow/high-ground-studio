/** Presentation only. Provider endpoints still own their tracks; this never
 * grants access or replaces the canonical room membership. */
export type CallParticipant = {
  identity: string;
  name: string;
  speaking: boolean;
  isLocal: boolean;
  microphoneMuted: boolean;
  personKey?: string;
  deviceLabel?: string;
  companion?: boolean;
};

export function callEndpointDetails(identity: string, metadata?: string): Pick<CallParticipant, "personKey" | "deviceLabel" | "companion"> {
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(metadata || "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>;
  } catch { /* Missing metadata must not collapse unrelated people. */ }
  const text = (key: string) => typeof value[key] === "string" ? value[key].trim() : "";
  const room = text("callRoomId"), participant = text("participantId");
  const client = text("clientKind");
  return {
    personKey: room && participant ? JSON.stringify([room, participant]) : `endpoint:${identity}`,
    deviceLabel: text("deviceLabel").slice(0, 80) || (client === "web" ? "Browser" : client === "ios" ? "iPhone or iPad" : client === "macos" ? "Mac" : "Device"),
    companion: text("endpointRole") === "companion",
  };
}

export function groupCallPeople(participants: CallParticipant[]) {
  const groups = new Map<string, {key: string; name: string; isLocal: boolean; endpoints: CallParticipant[]}>();
  for (const endpoint of participants) {
    const key = endpoint.personKey || `endpoint:${endpoint.identity}`;
    const group = groups.get(key);
    if (group) {
      group.endpoints.push(endpoint);
      group.isLocal ||= endpoint.isLocal;
      if (endpoint.isLocal) group.name = endpoint.name;
    } else groups.set(key, {key, name: endpoint.name, isLocal: endpoint.isLocal, endpoints: [endpoint]});
  }
  return [...groups.values()];
}

export function callEndpointLabel(endpoint: CallParticipant, participants: CallParticipant[]) {
  const group = groupCallPeople(participants).find(person => person.endpoints.some(device => device.identity === endpoint.identity));
  const name = `${endpoint.name}${endpoint.isLocal ? " (you)" : group?.isLocal ? " (your other device)" : ""}`;
  return group && group.endpoints.length > 1 ? `${name} · ${endpoint.deviceLabel || "Device"}` : name;
}
