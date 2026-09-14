export type CallView = "gallery" | "speaker";

/** Maximize 16:9 video area within the available stage, including a sidebar. */
export function callGalleryGrid(count: number, width: number, height: number) {
  if (count < 2) return { columns: 1, rows: 1 };
  let best = { columns: 1, rows: count, area: 0 };
  for (let columns = 1; columns <= Math.min(count, 4); columns++) {
    const rows = Math.ceil(count / columns);
    const cellWidth = Math.max(1, (width - 12 * (columns - 1)) / columns);
    const cellHeight = Math.max(1, (height - 12 * (rows - 1)) / rows);
    const videoWidth = Math.min(cellWidth, cellHeight * 16 / 9);
    const area = videoWidth * videoWidth * 9 / 16;
    if (area > best.area) best = { columns, rows, area };
  }
  return { columns: best.columns, rows: best.rows };
}

export function callGalleryPage<T>(items: T[], requestedPage: number, capacity: number) {
  const pageCount = Math.max(1, Math.ceil(items.length / capacity));
  const page = Math.max(0, Math.min(pageCount - 1, requestedPage));
  return { page, pageCount, items: items.slice(page * capacity, (page + 1) * capacity) };
}

export function nextCallSpeaker(people: { identity: string; isLocal: boolean; speaking: boolean }[], previous: string | null) {
  const remote = people.filter(person => !person.isLocal);
  const candidates = remote.length ? remote : people;
  const current = candidates.find(person => person.identity === previous);
  return (current?.speaking ? current : candidates.find(person => person.speaking) ?? current ?? candidates[0])?.identity ?? null;
}
