import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import type { SessionTranscriptTimingAuthority } from "./session-transcript-assembly";

export const COACHING_TRANSCRIPT_REPORT_SCHEMA =
  "quipsly-coaching-transcript-report-v2";

export const COACHING_COMPETENCIES = [
  "Demonstrates Ethical Practice",
  "Embodies a Coaching Mindset",
  "Establishes and Maintains Agreements",
  "Cultivates Trust and Safety",
  "Maintains Presence",
  "Listens Actively",
  "Evokes Awareness",
  "Facilitates Client Growth",
] as const;

export class CoachingTranscriptReportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "CoachingTranscriptReportError";
  }
}

type ReportParticipant = {
  id: string;
  displayLabel: string;
  role: string;
};

type ReportSegment = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  speakerLabel: string | null;
  providerSpeakerLabel?: string | null;
  speakerAttribution?: { participantId?: string | null } | null;
  acceptedCorrection?: { id?: string } | null;
  acceptedVerification?: { id?: string } | null;
  transcriptJobId?: string;
  recordingAssetId?: string;
};

export type CoachingTranscriptReportSource = {
  transcriptJobId: string;
  recordingAssetId: string;
  sourceSha256?: string | null;
  participantId?: string | null;
  programOffsetSeconds?: number;
  timingAuthority?: SessionTranscriptTimingAuthority;
  timingUncertaintyMilliseconds?: number | null;
  timingReviewRequired?: boolean;
  sampleAccurateClaimed?: false;
};

type ReportSpeakerGroup = {
  providerSpeakerLabel: string;
  attribution?: { participantId?: string | null } | null;
};

export type CoachingTranscriptReportInput = {
  roomId: string;
  title: string;
  scheduledStart?: string | Date | null;
  generatedAt: string | Date;
  sources: CoachingTranscriptReportSource[];
  participants: ReportParticipant[];
  speakerGroups?: ReportSpeakerGroup[];
  segments: ReportSegment[];
  incomplete?: boolean;
};

export type CoachingTranscriptReportTurn = {
  segmentId: string;
  speaker: "coach" | "client" | "unassigned";
  speakerLabel: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  text: string;
  reviewState: "corrected" | "confirmed" | "unreviewed";
  transcriptJobId: string;
  recordingAssetId: string;
};

export type CoachingTranscriptReport = {
  schema: typeof COACHING_TRANSCRIPT_REPORT_SCHEMA;
  roomId: string;
  title: string;
  sessionDate: string;
  generatedAt: string;
  incomplete: boolean;
  sources: Array<{
    transcriptJobId: string;
    recordingAssetId: string;
    sourceSha256: string | null;
    participantId: string | null;
    programOffsetSeconds: number;
    timingAuthority: SessionTranscriptTimingAuthority;
    timingUncertaintyMilliseconds: number | null;
    timingReviewRequired: boolean;
    sampleAccurateClaimed: false;
  }>;
  coach: ReportParticipant;
  client: ReportParticipant;
  turns: CoachingTranscriptReportTurn[];
  review: {
    correctedTurns: number;
    confirmedTurns: number;
    unreviewedTurns: number;
  };
  speakerCoverage: {
    unassignedTurns: number;
    hasCoach: boolean;
    hasClient: boolean;
  };
  timelineTiming: {
    authority: SessionTranscriptTimingAuthority | "mixed";
    waveformReviewRequired: boolean;
    maximumUncertaintyMilliseconds: number | null;
    sampleAccurateClaimed: false;
  };
};

function clean(value: unknown, max = 10_000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalized(value: unknown) {
  return clean(value, 320)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function iso(value: string | Date | null | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

export function transcriptTimestamp(seconds: number) {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const remaining = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function chooseParticipants(participants: ReportParticipant[]) {
  const coaches = participants.filter(
    (participant) => participant.role.toUpperCase() === "COACH",
  );
  const fallbackHosts = participants.filter(
    (participant) => participant.role.toUpperCase() === "HOST",
  );
  const clients = participants.filter(
    (participant) => participant.role.toUpperCase() === "CLIENT",
  );
  const coachCandidates = coaches.length ? coaches : fallbackHosts;
  if (coachCandidates.length !== 1 || clients.length !== 1) {
    throw new CoachingTranscriptReportError(
      "Choose exactly one coach and one client before creating the mentor transcript.",
      409,
      "REPORT_PARTICIPANTS_AMBIGUOUS",
    );
  }
  return { coach: coachCandidates[0], client: clients[0] };
}

export function buildCoachingTranscriptReport(
  input: CoachingTranscriptReportInput,
): CoachingTranscriptReport {
  const sources = input.sources.map((source) => ({
    transcriptJobId: clean(source.transcriptJobId, 240),
    recordingAssetId: clean(source.recordingAssetId, 240),
    sourceSha256: clean(source.sourceSha256, 64).toLowerCase() || null,
    participantId: clean(source.participantId, 240) || null,
    programOffsetSeconds: Number.isFinite(source.programOffsetSeconds)
      ? Math.max(0, Number(source.programOffsetSeconds))
      : 0,
    timingAuthority:
      source.timingAuthority === "reviewed-waveform-placement" ||
      source.timingAuthority === "mixed-waveform-clock-placement" ||
      source.timingAuthority === "capture-clock-proposal" ||
      source.timingAuthority === "reported-wall-clock-fallback" ||
      source.timingAuthority === "single-source-origin"
        ? source.timingAuthority
        : input.sources.length === 1
          ? ("single-source-origin" as const)
          : ("reported-wall-clock-fallback" as const),
    timingUncertaintyMilliseconds: Number.isFinite(
      source.timingUncertaintyMilliseconds,
    )
      ? Math.max(0, Number(source.timingUncertaintyMilliseconds))
      : null,
    timingReviewRequired:
      input.sources.length > 1 || source.timingReviewRequired === true,
    sampleAccurateClaimed: false as const,
  }));
  if (
    !sources.length ||
    sources.some(
      (source) =>
        !source.transcriptJobId ||
        !source.recordingAssetId ||
        !/^[a-f0-9]{64}$/.test(source.sourceSha256 ?? ""),
    ) ||
    new Set(sources.map((source) => source.transcriptJobId)).size !==
      sources.length ||
    new Set(sources.map((source) => source.recordingAssetId)).size !==
      sources.length
  ) {
    throw new CoachingTranscriptReportError(
      "A source-bound transcript and recording are required before creating the mentor transcript.",
      409,
      "REPORT_SOURCE_MISSING",
    );
  }
  const { coach, client } = chooseParticipants(input.participants);
  const sourcesByJobId = new Map(
    sources.map((source) => [source.transcriptJobId, source]),
  );
  const sourcesByRecordingId = new Map(
    sources.map((source) => [source.recordingAssetId, source]),
  );
  const participantsById = new Map(
    input.participants.map((participant) => [participant.id, participant]),
  );
  const participantsByLabel = new Map<string, ReportParticipant | null>();
  for (const participant of input.participants) {
    const key = normalized(participant.displayLabel);
    if (!key) continue;
    participantsByLabel.set(
      key,
      participantsByLabel.has(key) ? null : participant,
    );
  }
  const groupParticipantByLabel = new Map(
    (input.speakerGroups ?? [])
      .filter(
        (group) =>
          clean(group.providerSpeakerLabel) &&
          clean(group.attribution?.participantId),
      )
      .map((group) => [
        normalized(group.providerSpeakerLabel),
        clean(group.attribution?.participantId),
      ]),
  );

  const turns = input.segments
    .map((segment) => {
      const source =
        sourcesByJobId.get(clean(segment.transcriptJobId, 240)) ??
        sourcesByRecordingId.get(clean(segment.recordingAssetId, 240)) ??
        (sources.length === 1 ? sources[0] : null);
      if (!source) {
        throw new CoachingTranscriptReportError(
          "A transcript passage no longer matches its recording. Refresh the transcript before exporting.",
          409,
          "REPORT_SOURCE_MISSING",
        );
      }
      if ((segment.transcriptJobId && segment.transcriptJobId !== source.transcriptJobId)
        || (segment.recordingAssetId && segment.recordingAssetId !== source.recordingAssetId)) {
        throw new CoachingTranscriptReportError("A transcript passage points to conflicting recording sources.", 409, "REPORT_SOURCE_CHANGED");
      }
      const attributedId =
        clean(segment.speakerAttribution?.participantId) ||
        clean(source.participantId) ||
        groupParticipantByLabel.get(normalized(segment.providerSpeakerLabel)) ||
        groupParticipantByLabel.get(normalized(segment.speakerLabel)) ||
        "";
      const participant =
        (attributedId ? participantsById.get(attributedId) : null) ??
        participantsByLabel.get(normalized(segment.speakerLabel)) ??
        null;
      const participantRole =
        participant?.id === coach.id
          ? ("coach" as const)
          : participant?.id === client.id
            ? ("client" as const)
            : ("unassigned" as const);
      const sourceStartSeconds = Number(segment.startSeconds);
      const sourceEndSeconds = Number(segment.endSeconds);
      if (!Number.isFinite(sourceStartSeconds) || !Number.isFinite(sourceEndSeconds)
        || sourceStartSeconds < 0 || sourceEndSeconds < sourceStartSeconds) {
        throw new CoachingTranscriptReportError("A transcript passage has invalid timing. Refresh the transcript before exporting.", 409, "REPORT_TIMING_INVALID");
      }
      const startSeconds = source.programOffsetSeconds + sourceStartSeconds;
      const endSeconds = source.programOffsetSeconds + sourceEndSeconds;
      return {
        segmentId: segment.id,
        speaker: participantRole,
        speakerLabel: participant?.displayLabel || clean(segment.speakerLabel, 320)
          || clean(segment.providerSpeakerLabel, 320) || "Speaker not named",
        timestamp: transcriptTimestamp(startSeconds),
        startSeconds,
        endSeconds,
        sourceStartSeconds,
        sourceEndSeconds,
        text: typeof segment.text === "string" ? segment.text.trim() : "",
        reviewState: segment.acceptedCorrection
          ? ("corrected" as const)
          : segment.acceptedVerification
            ? ("confirmed" as const)
            : ("unreviewed" as const),
        transcriptJobId: source.transcriptJobId,
        recordingAssetId: source.recordingAssetId,
      };
    })
    .filter((turn): turn is CoachingTranscriptReportTurn => Boolean(turn?.text))
    .sort(
      (left, right) =>
        left.startSeconds - right.startSeconds ||
        left.segmentId.localeCompare(right.segmentId),
    );

  if (!turns.length) {
    throw new CoachingTranscriptReportError(
      "There is no transcript text to export yet.",
      409,
      "REPORT_TRANSCRIPT_EMPTY",
    );
  }
  const generatedAt = iso(input.generatedAt) ?? new Date(0).toISOString();
  const sessionDate = iso(input.scheduledStart) ?? generatedAt;
  const timingAuthorities = [
    ...new Set(sources.map((source) => source.timingAuthority)),
  ];
  const uncertainties = sources
    .map((source) => source.timingUncertaintyMilliseconds)
    .filter((value): value is number => value !== null);
  return {
    schema: COACHING_TRANSCRIPT_REPORT_SCHEMA,
    roomId: clean(input.roomId, 240),
    title: clean(input.title, 240) || "Coaching Session",
    sessionDate,
    generatedAt,
    incomplete: input.incomplete === true,
    sources,
    coach,
    client,
    turns,
    review: {
      correctedTurns: turns.filter((turn) => turn.reviewState === "corrected")
        .length,
      confirmedTurns: turns.filter((turn) => turn.reviewState === "confirmed")
        .length,
      unreviewedTurns: turns.filter((turn) => turn.reviewState === "unreviewed")
        .length,
    },
    speakerCoverage: {
      unassignedTurns: turns.filter(turn => turn.speaker === "unassigned").length,
      hasCoach: turns.some(turn => turn.speaker === "coach"),
      hasClient: turns.some(turn => turn.speaker === "client"),
    },
    timelineTiming: {
      authority:
        timingAuthorities.length === 1 ? timingAuthorities[0]! : "mixed",
      waveformReviewRequired: sources.some(
        (source) => source.timingReviewRequired,
      ),
      maximumUncertaintyMilliseconds: uncertainties.length
        ? Math.max(...uncertainties)
        : null,
      sampleAccurateClaimed: false,
    },
  };
}

const BRAND = "000000";
const INK = "34291F";
const MUTED = "746453";
const PAPER = "FFFDF8";
const LINE = "D9D9D9";

function borders(color = LINE) {
  const side = { style: BorderStyle.SINGLE, size: 5, color };
  return { top: side, bottom: side, left: side, right: side };
}

function reportCell(children: Paragraph[], shaded = false, columnSpan?: number) {
  return new TableCell({
    children,
    columnSpan,
    verticalAlign: VerticalAlign.TOP,
    shading: shaded ? { fill: "FFF5E8", type: ShadingType.CLEAR } : undefined,
    borders: borders(),
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
  });
}

function reportHeaderCell(label: string) {
  return new TableCell({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: label,
            bold: true,
            color: "FFFFFF",
            size: 18,
            font: "Aptos",
          }),
        ],
      }),
    ],
    verticalAlign: VerticalAlign.CENTER,
    shading: { fill: INK, type: ShadingType.CLEAR },
    borders: borders(INK),
    margins: { top: 140, bottom: 140, left: 160, right: 160 },
  });
}

function speakerTurnParagraph(turn: CoachingTranscriptReportTurn, includeName = false) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `${turn.timestamp}${includeName ? `  ${turn.speakerLabel}` : ""}  `,
        bold: true,
        color: BRAND,
        size: 18,
        font: "Aptos",
      }),
      new TextRun({ text: turn.text, color: INK, size: 21, font: "Aptos" }),
    ],
  });
}

export function coachingTranscriptReportFileName(
  report: CoachingTranscriptReport,
) {
  const date = report.sessionDate.slice(0, 10).replaceAll("-", "");
  const title =
    report.title
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .slice(0, 64) || "Coaching Session";
  return `${date} ${title} Transcript.docx`;
}

export async function renderCoachingTranscriptReport(
  report: CoachingTranscriptReport,
) {
  const sessionDate = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(report.sessionDate));
  const speakerDescription = report.speakerCoverage.unassignedTurns > 0
    ? "Voices not linked to a coach or client appear across both columns with their available speaker label."
    : !report.speakerCoverage.hasCoach || !report.speakerCoverage.hasClient
      ? "This export contains the available transcript. Only one participant has text in this recording."
      : "Coach and client turns appear in recording order.";
  const coverageDescription = `${report.incomplete
    ? "Partial transcript. Some participant audio is not included because its transcript is not available yet. "
    : ""}${speakerDescription}`;
  const uncertaintyDescription =
    report.timelineTiming.maximumUncertaintyMilliseconds === null
      ? ""
      : ` (up to ${report.timelineTiming.maximumUncertaintyMilliseconds} ms estimated uncertainty)`;
  const timingDescription =
    report.timelineTiming.authority === "capture-clock-proposal"
      ? `Cross-device timestamps are estimated from the recording clocks${uncertaintyDescription}.`
      : report.timelineTiming.authority === "reported-wall-clock-fallback"
        ? "Cross-device timestamps are estimated from the recording start times."
        : report.timelineTiming.authority === "reviewed-waveform-placement"
          ? "Cross-device timestamps use measured waveform alignment."
          : report.timelineTiming.authority === "mixed-waveform-clock-placement" || report.timelineTiming.authority === "mixed"
            ? "Cross-device timestamps combine measured alignment and recording-clock estimates."
            : "Timestamps refer to the original recording.";
  const transcriptRows = report.turns.map(
    (turn) =>
      new TableRow({
        // A long answer must continue onto the next page instead of overflowing
        // a single unsplittable row. Word repeats the column headings.
        cantSplit: false,
        children:
          turn.speaker === "unassigned"
            ? [reportCell([speakerTurnParagraph(turn, true)], true, 2)]
            : turn.speaker === "coach"
            ? [
                reportCell([speakerTurnParagraph(turn)]),
                reportCell([new Paragraph("")]),
              ]
            : [
                reportCell([new Paragraph("")]),
                reportCell([speakerTurnParagraph(turn)]),
              ],
      }),
  );
  const competencyRows = COACHING_COMPETENCIES.map(
    (competency, index) =>
      new TableRow({
        cantSplit: true,
        children: [
          reportCell(
            [
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${index + 1}. ${competency}`,
                    bold: true,
                    color: INK,
                    size: 20,
                    font: "Aptos",
                  }),
                ],
              }),
            ],
            index % 2 === 0,
          ),
          reportCell([
            new Paragraph({
              children: [
                new TextRun({
                  text: "Mentor notes:",
                  bold: true,
                  color: MUTED,
                  size: 17,
                  font: "Aptos",
                }),
              ],
              spacing: { after: 360 },
            }),
          ]),
        ],
      }),
  );
  const document = new Document({
    creator: "Quipsly",
    title: `${report.title} coaching transcript`,
    subject: "Source-bound coaching transcript for mentor review",
    description: `${report.schema}; room ${report.roomId}; ${report.sources.length} exact recording source(s)`,
    customProperties: [
      { name: "Quipsly source map", value: JSON.stringify({
        schema: report.schema, roomId: report.roomId, generatedAt: report.generatedAt,
        sources: report.sources,
        turns: report.turns.map(({segmentId, transcriptJobId, recordingAssetId, sourceStartSeconds, sourceEndSeconds, startSeconds, endSeconds}) =>
          ({segmentId, transcriptJobId, recordingAssetId, sourceStartSeconds, sourceEndSeconds, startSeconds, endSeconds})),
      }) },
    ],
    styles: {
      default: { document: { run: { font: "Aptos", color: INK, size: 21 } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
              header: 360,
              footer: 360,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: "QUIPSLY  /  COACHING TRANSCRIPT",
                    bold: true,
                    color: BRAND,
                    size: 16,
                    font: "Aptos",
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: "Quipsly  •  Page ",
                    color: MUTED,
                    size: 16,
                    font: "Aptos",
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    color: MUTED,
                    size: 16,
                    font: "Aptos",
                  }),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: "COACHING SESSION TRANSCRIPT",
                bold: true,
                color: BRAND,
                size: 20,
                font: "Aptos",
              }),
            ],
          }),
          new Paragraph({
            style: "Title",
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: report.title,
                bold: true,
                color: "000000",
                size: 34,
                font: "Aptos Display",
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                children: [
                  reportCell(
                    [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "DATE",
                            bold: true,
                            color: MUTED,
                            size: 16,
                          }),
                          new TextRun({
                            break: 1,
                            text: sessionDate,
                            bold: true,
                            color: INK,
                            size: 21,
                          }),
                        ],
                      }),
                    ],
                    true,
                  ),
                  reportCell(
                    [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "COACH",
                            bold: true,
                            color: MUTED,
                            size: 16,
                          }),
                          new TextRun({
                            break: 1,
                            text: report.coach.displayLabel,
                            bold: true,
                            color: INK,
                            size: 21,
                          }),
                        ],
                      }),
                    ],
                    true,
                  ),
                  reportCell(
                    [
                      new Paragraph({
                        children: [
                          new TextRun({
                            text: "CLIENT",
                            bold: true,
                            color: MUTED,
                            size: 16,
                          }),
                          new TextRun({
                            break: 1,
                            text: report.client.displayLabel,
                            bold: true,
                            color: INK,
                            size: 21,
                          }),
                        ],
                      }),
                    ],
                    true,
                  ),
                ],
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 180, after: 180 },
            children: [
              new TextRun({
                text: coverageDescription,
                color: MUTED,
                size: 19,
              }),
              new TextRun({
                break: 1,
                text: timingDescription,
                color: MUTED,
                size: 17,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  reportHeaderCell(`COACH  /  ${report.coach.displayLabel}`),
                  reportHeaderCell(`CLIENT  /  ${report.client.displayLabel}`),
                ],
              }),
              ...transcriptRows,
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: "RECAP OF THE COMPETENCIES",
                bold: true,
                color: "000000",
                size: 28,
                font: "Aptos Display",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 180 },
            children: [
              new TextRun({
                text: "Use the open column for mentor observations and assessment notes.",
                color: MUTED,
                size: 19,
              }),
            ],
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            rows: competencyRows,
          }),
          new Paragraph({
            spacing: { before: 180 },
            children: [
              new TextRun({
                text: "Assessment legend  ",
                bold: true,
                color: INK,
                size: 18,
              }),
              new TextRun({
                text: "ACC or AACC: approaching ACC  •  PCC or APCC: approaching PCC  •  MCC or AMCC: approaching MCC",
                color: MUTED,
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 180 },
            children: [
              new TextRun({
                text: `Exported ${new Intl.DateTimeFormat("en-US", {dateStyle: "medium", timeZone: "UTC"}).format(new Date(report.generatedAt))}. Recording references are retained in the document properties.`,
                color: MUTED,
                size: 15,
              }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(document);
}
