export type RetentionTelemetryRecord = {
  segmentIndex: number;
  timestamp: number;
  retentionRate: number;
};

const SHARP_DROP_THRESHOLD = 15;

export function findSharpRetentionDrop(records: RetentionTelemetryRecord[]) {
  for (let index = 1; index < records.length; index += 1) {
    const previous = records[index - 1];
    const current = records[index];
    const dropPercentagePoints = previous.retentionRate - current.retentionRate;
    if (dropPercentagePoints >= SHARP_DROP_THRESHOLD) {
      return {
        type: "SHARP_DROP",
        segmentIndex: current.segmentIndex,
        severity: "high",
        dropPercentagePoints: Number(dropPercentagePoints.toFixed(2)),
        message: `Retention fell ${dropPercentagePoints.toFixed(1)} percentage points at segment ${current.segmentIndex}.`,
      };
    }
  }
  return null;
}
