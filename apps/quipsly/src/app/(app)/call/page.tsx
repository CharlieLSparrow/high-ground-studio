import { redirect } from "next/navigation";

function queryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CallRoomPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query: Record<string, string | string[] | undefined> = await (
    searchParams ?? Promise.resolve({})
  );
  const roomId = queryValue(query.roomId) || queryValue(query.room);
  return redirect(roomId
    ? `/sessions/${encodeURIComponent(roomId)}?mode=live`
    : "/coaching/sessions");
}
