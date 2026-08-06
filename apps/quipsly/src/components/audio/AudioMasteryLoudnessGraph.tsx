type LoudnessSeriesPoint = {
  timeMs: number;
  momentaryLufs: number | null;
  shortTermLufs: number | null;
};

type LoudnessMeasurement = {
  durationSeconds: number;
  series: LoudnessSeriesPoint[];
};

export function AudioMasteryLoudnessGraph({
  measurement,
}: {
  measurement: LoudnessMeasurement;
}) {
  const width = 720;
  const height = 100;
  const points = measurement.series.filter(
    (point) => point.shortTermLufs !== null || point.momentaryLufs !== null,
  );
  const durationMs = Math.max(
    measurement.durationSeconds * 1_000,
    points.at(-1)?.timeMs ?? 1,
  );
  const y = (lufs: number) => Math.max(
    2,
    Math.min(height - 2, ((0 - Math.max(-60, Math.min(0, lufs))) / 60) * height),
  );
  const x = (timeMs: number) => Math.max(
    0,
    Math.min(width, (timeMs / durationMs) * width),
  );
  const pathFor = (key: "shortTermLufs" | "momentaryLufs") => points
    .filter((point) => point[key] !== null)
    .map((point, index) => (
      `${index === 0 ? "M" : "L"}${x(point.timeMs).toFixed(1)},${y(point[key] as number).toFixed(1)}`
    ))
    .join(" ");
  const shortTermPath = pathFor("shortTermLufs");
  const momentaryPath = pathFor("momentaryLufs");

  return (
    <figure
      className="rounded-xl border border-fuchsia-200 bg-[#1d1630] p-3"
      aria-label="Source loudness over time"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-24 w-full"
        role="img"
        aria-labelledby="audio-mastery-chart-title audio-mastery-chart-description"
      >
        <title id="audio-mastery-chart-title">Source loudness over time</title>
        <desc id="audio-mastery-chart-description">
          Momentary and short-term LUFS from a complete source decode. The dashed
          line marks the minus sixteen LUFS podcast target.
        </desc>
        {[-48, -32, -16].map((level) => (
          <g key={level}>
            <line
              x1="0"
              x2={width}
              y1={y(level)}
              y2={y(level)}
              stroke={level === -16 ? "#f0abfc" : "#4c3d64"}
              strokeWidth={level === -16 ? 1.5 : 1}
              strokeDasharray={level === -16 ? "7 5" : "2 6"}
            />
            <text
              x="6"
              y={y(level) - 4}
              fill={level === -16 ? "#f5d0fe" : "#a99abb"}
              fontSize="10"
              fontWeight="700"
            >
              {level} LUFS
            </text>
          </g>
        ))}
        {momentaryPath ? (
          <path d={momentaryPath} fill="none" stroke="#818cf8" strokeWidth="1.3" opacity="0.75" />
        ) : null}
        {shortTermPath ? (
          <path d={shortTermPath} fill="none" stroke="#f0abfc" strokeWidth="2.3" />
        ) : null}
      </svg>
      <figcaption className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[9px] font-bold uppercase tracking-[0.08em] text-fuchsia-100">
        <span><span className="mr-1 inline-block h-0.5 w-2 bg-fuchsia-300 align-middle" />Short-term · 3 s</span>
        <span><span className="mr-1 inline-block h-0.5 w-2 bg-indigo-400 align-middle" />Momentary · 400 ms</span>
        <span className="col-span-2">1 s display bins · complete source decode</span>
      </figcaption>
    </figure>
  );
}
