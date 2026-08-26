export const QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA =
  "quipsly-coaching-form-definition-v1" as const;

export type QuipslyCoachingFormPurpose =
  | "INTAKE"
  | "PRE_SESSION"
  | "POST_SESSION"
  | "REFLECTION"
  | "ASSESSMENT"
  | "FEEDBACK";

export type QuipslyCoachingFormFieldType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "NUMBER"
  | "SCALE"
  | "BOOLEAN"
  | "SINGLE_SELECT"
  | "MULTI_SELECT"
  | "DATE";

export interface QuipslyCoachingFormField {
  readonly id: string;
  readonly type: QuipslyCoachingFormFieldType;
  readonly label: string;
  readonly help?: string | null;
  readonly placeholder?: string | null;
  readonly required: boolean;
  readonly options?: readonly string[];
  readonly minimum?: number | null;
  readonly maximum?: number | null;
  readonly maximumLength?: number | null;
}

export interface QuipslyCoachingFormDefinition {
  readonly schema: typeof QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA;
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly purpose: QuipslyCoachingFormPurpose;
  readonly submitLabel: string;
  readonly fields: readonly QuipslyCoachingFormField[];
}

export interface QuipslyCoachingFormAnswerError {
  readonly fieldId: string;
  readonly code:
    | "UNKNOWN_FIELD"
    | "REQUIRED"
    | "WRONG_TYPE"
    | "TOO_LONG"
    | "OUT_OF_RANGE"
    | "INVALID_OPTION"
    | "INVALID_DATE";
  readonly message: string;
}

export type QuipslyCoachingFormAnswers = Readonly<Record<string, unknown>>;

const FIELD_ID = /^[a-z][a-z0-9-]{1,63}$/;
const DEFINITION_KEY = /^[a-z][a-z0-9-]{2,79}$/;
const FIELD_TYPES = new Set<QuipslyCoachingFormFieldType>([
  "SHORT_TEXT",
  "LONG_TEXT",
  "NUMBER",
  "SCALE",
  "BOOLEAN",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "DATE",
]);
const PURPOSES = new Set<QuipslyCoachingFormPurpose>([
  "INTAKE",
  "PRE_SESSION",
  "POST_SESSION",
  "REFLECTION",
  "ASSESSMENT",
  "FEEDBACK",
]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function options(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.map((candidate) => text(candidate, 120)).filter(Boolean)),
  ].slice(0, 40);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseQuipslyCoachingFormDefinition(
  value: unknown,
): QuipslyCoachingFormDefinition {
  if (
    !isRecord(value) ||
    value.schema !== QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA
  ) {
    throw new Error("The coaching form definition schema is invalid.");
  }
  const key = text(value.key, 80);
  const title = text(value.title, 160);
  const description = text(value.description, 2_000);
  const submitLabel = text(value.submitLabel, 80) || "Submit";
  const purpose = value.purpose as QuipslyCoachingFormPurpose;
  if (!DEFINITION_KEY.test(key) || !title || !PURPOSES.has(purpose)) {
    throw new Error("The coaching form identity is invalid.");
  }
  if (
    !Array.isArray(value.fields) ||
    value.fields.length < 1 ||
    value.fields.length > 40
  ) {
    throw new Error("A coaching form needs between 1 and 40 fields.");
  }
  const ids = new Set<string>();
  const fields = value.fields.map((candidate) => {
    if (!isRecord(candidate))
      throw new Error("A coaching form field is invalid.");
    const id = text(candidate.id, 64);
    const label = text(candidate.label, 240);
    const type = candidate.type as QuipslyCoachingFormFieldType;
    if (!FIELD_ID.test(id) || ids.has(id) || !label || !FIELD_TYPES.has(type)) {
      throw new Error("A coaching form field identity is invalid or repeated.");
    }
    ids.add(id);
    const fieldOptions = options(candidate.options);
    if (
      ["SINGLE_SELECT", "MULTI_SELECT"].includes(type) &&
      fieldOptions.length < 2
    ) {
      throw new Error(`The ${id} field needs at least two distinct choices.`);
    }
    let minimum = finite(candidate.minimum);
    let maximum = finite(candidate.maximum);
    if (type === "SCALE") {
      minimum ??= 0;
      maximum ??= 10;
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      throw new Error(`The ${id} field range is invalid.`);
    }
    const requestedMaximumLength = finite(candidate.maximumLength);
    const maximumLength = ["SHORT_TEXT", "LONG_TEXT"].includes(type)
      ? Math.max(
          1,
          Math.min(
            type === "SHORT_TEXT" ? 500 : 10_000,
            Math.floor(
              requestedMaximumLength ?? (type === "SHORT_TEXT" ? 500 : 4_000),
            ),
          ),
        )
      : null;
    return {
      id,
      type,
      label,
      help: text(candidate.help, 1_000) || null,
      placeholder: text(candidate.placeholder, 240) || null,
      required: candidate.required === true,
      ...(fieldOptions.length ? { options: fieldOptions } : {}),
      ...(minimum !== null ? { minimum } : {}),
      ...(maximum !== null ? { maximum } : {}),
      ...(maximumLength !== null ? { maximumLength } : {}),
    } satisfies QuipslyCoachingFormField;
  });
  return {
    schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
    key,
    title,
    description,
    purpose,
    submitLabel,
    fields,
  };
}

function dateOnly(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

export function validateQuipslyCoachingFormAnswers(input: {
  definition: QuipslyCoachingFormDefinition;
  answers: unknown;
  state: "DRAFT" | "SUBMITTED";
}) {
  const answers = isRecord(input.answers) ? input.answers : {};
  const normalized: Record<string, unknown> = {};
  const errors: QuipslyCoachingFormAnswerError[] = [];
  const fieldById = new Map(
    input.definition.fields.map((field) => [field.id, field]),
  );
  for (const key of Object.keys(answers)) {
    if (!fieldById.has(key)) {
      errors.push({
        fieldId: key,
        code: "UNKNOWN_FIELD",
        message: "This question is not part of the assigned form version.",
      });
    }
  }
  for (const field of input.definition.fields) {
    const value = answers[field.id];
    const missing = value === undefined || value === null || value === "";
    if (missing) {
      if (input.state === "SUBMITTED" && field.required) {
        errors.push({
          fieldId: field.id,
          code: "REQUIRED",
          message: "Answer this question.",
        });
      }
      continue;
    }
    if (["SHORT_TEXT", "LONG_TEXT"].includes(field.type)) {
      if (typeof value !== "string") {
        errors.push({
          fieldId: field.id,
          code: "WRONG_TYPE",
          message: "Enter text.",
        });
        continue;
      }
      const answer = value.trim();
      if (answer.length > (field.maximumLength ?? 4_000)) {
        errors.push({
          fieldId: field.id,
          code: "TOO_LONG",
          message: "Shorten this answer.",
        });
        continue;
      }
      normalized[field.id] = answer;
      continue;
    }
    if (["NUMBER", "SCALE"].includes(field.type)) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({
          fieldId: field.id,
          code: "WRONG_TYPE",
          message: "Enter a number.",
        });
        continue;
      }
      if (
        (field.minimum !== undefined &&
          field.minimum !== null &&
          value < field.minimum) ||
        (field.maximum !== undefined &&
          field.maximum !== null &&
          value > field.maximum)
      ) {
        errors.push({
          fieldId: field.id,
          code: "OUT_OF_RANGE",
          message: "Choose a value in range.",
        });
        continue;
      }
      normalized[field.id] = value;
      continue;
    }
    if (field.type === "BOOLEAN") {
      if (typeof value !== "boolean") {
        errors.push({
          fieldId: field.id,
          code: "WRONG_TYPE",
          message: "Choose yes or no.",
        });
      } else normalized[field.id] = value;
      continue;
    }
    if (field.type === "SINGLE_SELECT") {
      if (typeof value !== "string" || !field.options?.includes(value)) {
        errors.push({
          fieldId: field.id,
          code: "INVALID_OPTION",
          message: "Choose one listed option.",
        });
      } else normalized[field.id] = value;
      continue;
    }
    if (field.type === "MULTI_SELECT") {
      if (
        !Array.isArray(value) ||
        value.some(
          (candidate) =>
            typeof candidate !== "string" ||
            !field.options?.includes(candidate),
        )
      ) {
        errors.push({
          fieldId: field.id,
          code: "INVALID_OPTION",
          message: "Use only listed choices.",
        });
      } else normalized[field.id] = [...new Set(value)];
      continue;
    }
    if (field.type === "DATE") {
      if (typeof value !== "string" || !dateOnly(value)) {
        errors.push({
          fieldId: field.id,
          code: "INVALID_DATE",
          message: "Choose a valid date.",
        });
      } else normalized[field.id] = value;
    }
  }
  return { ok: errors.length === 0, answers: normalized, errors } as const;
}

export const QUIPSLY_COACHING_STARTER_FORMS: readonly QuipslyCoachingFormDefinition[] =
  [
    parseQuipslyCoachingFormDefinition({
      schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
      key: "first-conversation",
      title: "First conversation",
      description:
        "A welcoming intake that gives the client a head start without turning coaching into paperwork.",
      purpose: "INTAKE",
      submitLabel: "Share with my coach",
      fields: [
        {
          id: "why-now",
          type: "LONG_TEXT",
          label: "What brings you to coaching right now?",
          required: true,
        },
        {
          id: "meaningful-change",
          type: "LONG_TEXT",
          label: "What change would make this coaching feel worthwhile?",
          required: true,
        },
        {
          id: "already-tried",
          type: "LONG_TEXT",
          label: "What have you already tried or learned?",
          required: false,
        },
        {
          id: "best-support",
          type: "MULTI_SELECT",
          label: "What kind of support tends to help you?",
          required: false,
          options: [
            "Clear questions",
            "Accountability",
            "Practical experiments",
            "Space to reflect",
            "Direct feedback",
          ],
        },
        {
          id: "anything-else",
          type: "LONG_TEXT",
          label: "Anything else you want your coach to understand?",
          required: false,
        },
      ],
    }),
    parseQuipslyCoachingFormDefinition({
      schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
      key: "before-session-reflection",
      title: "Before our Session",
      description:
        "A short reflection that helps both people arrive ready for the conversation.",
      purpose: "PRE_SESSION",
      submitLabel: "Share reflection",
      fields: [
        {
          id: "proud-of",
          type: "LONG_TEXT",
          label: "What are you proud of since our last conversation?",
          required: false,
        },
        {
          id: "stuck-on",
          type: "LONG_TEXT",
          label: "Where do you feel stuck or uncertain?",
          required: false,
        },
        {
          id: "session-focus",
          type: "LONG_TEXT",
          label: "What would be most useful to focus on?",
          required: true,
        },
        {
          id: "progress",
          type: "SCALE",
          label: "How is your progress feeling today?",
          help: "0 means no movement yet; 10 means fully on track.",
          required: false,
          minimum: 0,
          maximum: 10,
        },
      ],
    }),
    parseQuipslyCoachingFormDefinition({
      schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
      key: "after-session-reflection",
      title: "After our Session",
      description:
        "Capture the insight and next step while the conversation is still fresh.",
      purpose: "POST_SESSION",
      submitLabel: "Save reflection",
      fields: [
        {
          id: "takeaway",
          type: "LONG_TEXT",
          label: "What is your most useful takeaway?",
          required: true,
        },
        {
          id: "commitment",
          type: "LONG_TEXT",
          label: "What will you do next?",
          required: true,
        },
        {
          id: "support-needed",
          type: "LONG_TEXT",
          label: "What support or accountability would help?",
          required: false,
        },
        {
          id: "confidence",
          type: "SCALE",
          label: "How confident are you that you will follow through?",
          required: false,
          minimum: 0,
          maximum: 10,
        },
        {
          id: "session-feedback",
          type: "LONG_TEXT",
          label: "Anything you want your coach to do differently next time?",
          required: false,
        },
      ],
    }),
  ];
