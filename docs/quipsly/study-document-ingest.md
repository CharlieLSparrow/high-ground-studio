# Study Documents and Source Capture

## Product rule

Writing documents are for original authorship.

Study documents are source-first. They preserve imported source text and layer highlights, notes, tags, questions, examples, and assistant packets on top.

## Desired Chrome/course capture workflow

Future browser extension flow:

1. User chooses an active Study Nest.
2. Extension watches allowed course/research domains only after explicit user opt-in.
3. Each visited page can be captured into the Study Nest as a source block or source document.
4. Quipsly stores source URL, title, capturedAt, normalized text, and page metadata.
5. User can highlight, tag, summarize, question, and link those source passages to writing documents.

## Good fit examples

- Udacity course pages.
- Google Cloud education pages.
- School LMS pages.
- Public docs and articles.
- Imported fiction/nonfiction books for private analysis.

## Guardrails

- Do not silently capture everything the user browses.
- Do not mix private school/account content into public publishing packets.
- Do not let assistant-generated summaries replace the original source.
- Keep every assistant action inspectable and reversible.
