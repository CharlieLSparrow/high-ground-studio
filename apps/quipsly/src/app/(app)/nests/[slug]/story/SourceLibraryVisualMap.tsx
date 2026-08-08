import type { SourceLibraryVisualOverview } from "@/lib/source-library-projection";

function formatSampleTime(seconds: number) {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function sourceLibraryVisualSampleIndexes(
  sampleCount: number,
  maximumSamples = 3,
) {
  const count = Math.max(0, Math.floor(sampleCount));
  const maximum = Math.max(0, Math.floor(maximumSamples));
  if (!count || !maximum) return [];
  const visible = Math.min(count, maximum);
  if (visible === 1) return [Math.floor((count - 1) / 2)];
  return Array.from({ length: visible }, (_, index) =>
    Math.round((index * (count - 1)) / (visible - 1)),
  );
}

export function SourceLibraryVisualMap({
  visualOverview,
  sourceLabel,
  compact = false,
}: {
  visualOverview: SourceLibraryVisualOverview;
  sourceLabel: string;
  compact?: boolean;
}) {
  const frames = visualOverview.navigationFrames;
  if (
    !frames ||
    !Number.isInteger(frames.columns) ||
    !Number.isInteger(frames.rows) ||
    frames.columns < 1 ||
    frames.rows < 1
  )
    return null;

  const samples = frames.sampleTimesSeconds
    .slice(0, frames.columns * frames.rows)
    .filter((seconds) => Number.isFinite(seconds) && seconds >= 0);
  const sampleIndexes = sourceLibraryVisualSampleIndexes(
    samples.length,
    compact ? 2 : 3,
  );
  if (!sampleIndexes.length) return null;

  const first = samples[0] ?? 0;
  const last = samples.at(-1) ?? first;
  return (
    <span
      role="img"
      aria-label={`${sourceLabel} visual map with ${samples.length} source-time samples from ${formatSampleTime(first)} to ${formatSampleTime(last)}`}
      className={`grid h-full w-full overflow-hidden bg-black ${compact ? "grid-cols-2" : "grid-cols-3"}`}
    >
      {sampleIndexes.map((sampleIndex) => {
        const column = sampleIndex % frames.columns;
        const row = Math.floor(sampleIndex / frames.columns);
        const x =
          frames.columns === 1 ? 0 : (column / (frames.columns - 1)) * 100;
        const y = frames.rows === 1 ? 0 : (row / (frames.rows - 1)) * 100;
        const seconds = samples[sampleIndex] ?? 0;
        return (
          <span
            key={`${sampleIndex}:${seconds}`}
            aria-hidden="true"
            className="relative min-w-0 overflow-hidden border-r border-black/50 last:border-r-0"
          >
            <span
              className="absolute inset-0 bg-cover bg-no-repeat"
              style={{
                backgroundImage: `url(${visualOverview.playbackUrl})`,
                backgroundSize: `${frames.columns * 100}% ${frames.rows * 100}%`,
                backgroundPosition: `${x}% ${y}%`,
              }}
            />
            <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-center font-mono text-[8px] font-black text-white">
              {formatSampleTime(seconds)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
