export type AudioSignalProfileClientStatus = {
  jobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "blocked" | "failed";
  media: null | {
    container: string;
    codec: string;
    sampleRate: number;
    channelCount: number;
    durationSeconds: number;
  };
  audioSignal: Record<string, unknown> | null;
  analyzer: null | {
    algorithm: "quipsly-audio-signal-window-v1";
    completeDecode: true;
    maximumWindows: 1_200;
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    analysisDoesNotChangeMedia: true;
    observationsRequireHumanInterpretation: true;
  };
};

export type StudioSourceTranscriptClientStatus = {
  jobId: string | null;
  transcriptJobId: string | null;
  status: "not-queued" | "queued" | "processing" | "output-ready" | "completed" | "failed";
  provider: string | null;
  language: string | null;
  authorization: null | {
    kind: "participant-consent-confirmed" | "licensed-or-permitted-source";
    importRole: string;
    acceptedAt: string;
    acceptedByEmail: string;
  };
  coverage: null | {
    segmentCount: number;
    wordCount: number;
    timedWordCount: number;
    confidenceWordCount: number;
    speakerLabeledWordCount: number;
    transcriptStartSeconds: number;
    transcriptEndSeconds: number;
    correctionCount: number;
    playbackVerificationCount: number;
  };
  segmentPreview: { count: number; total: number; truncated: boolean };
  segments: Array<{
    id: string;
    ordinal: number;
    startSeconds: number;
    endSeconds: number;
    speakerLabel: string | null;
    text: string;
    confidence: number | null;
  }>;
  capabilities: null | {
    segmentTiming: "provider";
    wordTiming: "provider";
    wordConfidence: "provider";
    segmentConfidence: "unavailable";
    speakerDiarization: "unavailable";
    alternatives: "unavailable";
  };
  terminology: null | {
    termsSha256: string;
    promptSha256: string;
    termCount: number;
    promptCharacterCount: number;
    revisionToken: string;
    compiledAt: string;
    mode: "initial-prompt-first-window" | "initial-prompt-carried";
    appliedByProvider: boolean;
  };
  quality: null | {
    disposition: "provider-evidence" | "review-required";
    warnings: Array<"implausible-timing-density" | "collapsed-word-timing" | "repetitive-provider-output" | "very-low-provider-confidence">;
    metrics: {
      activeTranscriptSeconds: number;
      wordsPerActiveMinute: number;
      zeroDurationWordRatio: number;
      lowConfidenceWordRatio: number | null;
    };
    boundaries: {
      deterministicTriageNotMeasuredAccuracy: true;
      playbackReviewRequiredForTrust: true;
      providerOutputRemainsInspectible: true;
    };
  };
  error: string | null;
  updatedAt: string | null;
  boundaries: {
    originalRemainsSourceTruth: true;
    confidenceIsNotMeasuredAccuracy: true;
    correctionsRequirePlaybackReview: true;
    createsNoTasksGoalsOrEdits: true;
  };
};
