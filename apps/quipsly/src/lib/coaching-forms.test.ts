import {
  parseQuipslyCoachingFormDefinition,
  QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
  QUIPSLY_COACHING_STARTER_FORMS,
  validateQuipslyCoachingFormAnswers,
} from "@high-ground/quipsly-domain/coaching-forms";

const definition = parseQuipslyCoachingFormDefinition({
  schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
  key: "weekly-reflection",
  title: "Weekly reflection",
  description: "Notice what changed.",
  purpose: "REFLECTION",
  submitLabel: "Share reflection",
  fields: [
    {
      id: "insight",
      type: "LONG_TEXT",
      label: "What did you notice?",
      required: true,
    },
    {
      id: "progress",
      type: "SCALE",
      label: "Progress",
      required: false,
      minimum: 0,
      maximum: 10,
    },
    {
      id: "support",
      type: "MULTI_SELECT",
      label: "Useful support",
      required: false,
      options: ["Questions", "Accountability"],
    },
  ],
});

describe("coaching forms", () => {
  it("normalizes a bounded immutable definition", () => {
    expect(definition).toMatchObject({
      schema: QUIPSLY_COACHING_FORM_DEFINITION_SCHEMA,
      key: "weekly-reflection",
      purpose: "REFLECTION",
      fields: [
        { id: "insight", maximumLength: 4000 },
        { id: "progress", minimum: 0, maximum: 10 },
        { id: "support", options: ["Questions", "Accountability"] },
      ],
    });
  });

  it("allows incomplete draft saves but enforces required answers on submit", () => {
    expect(
      validateQuipslyCoachingFormAnswers({
        definition,
        answers: { progress: 6 },
        state: "DRAFT",
      }),
    ).toMatchObject({ ok: true, answers: { progress: 6 }, errors: [] });

    expect(
      validateQuipslyCoachingFormAnswers({
        definition,
        answers: { progress: 6 },
        state: "SUBMITTED",
      }),
    ).toMatchObject({
      ok: false,
      errors: [{ fieldId: "insight", code: "REQUIRED" }],
    });
  });

  it("rejects version-skewed fields, out-of-range scales, and invented choices", () => {
    const result = validateQuipslyCoachingFormAnswers({
      definition,
      answers: {
        insight: "A useful pattern",
        progress: 11,
        support: ["Questions", "Surprise me"],
        obsoletePrompt: "old answer",
      },
      state: "SUBMITTED",
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "obsoletePrompt",
          code: "UNKNOWN_FIELD",
        }),
        expect.objectContaining({ fieldId: "progress", code: "OUT_OF_RANGE" }),
        expect.objectContaining({ fieldId: "support", code: "INVALID_OPTION" }),
      ]),
    );
  });

  it("ships calm lifecycle templates without making every prompt required", () => {
    expect(QUIPSLY_COACHING_STARTER_FORMS.map((form) => form.key)).toEqual([
      "first-conversation",
      "before-session-reflection",
      "after-session-reflection",
    ]);
    expect(
      QUIPSLY_COACHING_STARTER_FORMS.every(
        (form) =>
          form.fields.some((field) => !field.required) &&
          form.fields.length <= 5,
      ),
    ).toBe(true);
  });

  it("refuses duplicate field identities and malformed select choices", () => {
    expect(() =>
      parseQuipslyCoachingFormDefinition({
        ...definition,
        fields: [definition.fields[0], definition.fields[0]],
      }),
    ).toThrow(/invalid or repeated/i);
    expect(() =>
      parseQuipslyCoachingFormDefinition({
        ...definition,
        fields: [
          {
            id: "choice",
            type: "SINGLE_SELECT",
            label: "Choose",
            required: true,
            options: ["Only one"],
          },
        ],
      }),
    ).toThrow(/at least two/i);
  });
});
