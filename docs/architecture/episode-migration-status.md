# Episode Migration Status

Date: 2026-04-28

This file maps the current reality across:

- validated creative packet paths
- current public semantic files
- numbered legacy public files
- staging folders
- inbox folders

## Current Mapping

| Creative episode | Public semantic file | Public numbered legacy file | Staging folder | Inbox folder | Canonical packet path | Confidence | Ambiguity / mismatch notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pilot` | `apps/web/content/publish/write-it-down.mdx` | `apps/web/content/publish/episode-001.mdx` | `apps/web/content/_staging/learning-to-lead/episodes/pilot` | `apps/web/content/_inbox/Podcast Year 1/1 - March 25 - Pilot` | `apps/web/content/episodes/learning-to-lead/pilot/packet.mdx` | Medium | Upstream creative title is `Pilot` / `Preface Pilot Episode`; current public semantic title is `Write It Down`. `_staging` marks the separate Charlie file as empty, but the Scott main source already embeds Charlie's preface text. |
| `its-a-metaphor` | `apps/web/content/publish/look-for-lessons.mdx` | `apps/web/content/publish/episode-002.mdx` | `apps/web/content/_staging/learning-to-lead/episodes/its-a-metaphor` | `apps/web/content/_inbox/Podcast Year 1/2 - April 1 - It's a Metaphor!` | `apps/web/content/episodes/learning-to-lead/its-a-metaphor/packet.mdx` | High | Upstream creative title is `It's a Metaphor!`; current public semantic title is `Look for Lessons`. Staging and inbox both contain dedicated Scott and Charlie material, so the source alignment is strong even though the public title changed. |
| `chub-and-jack` | `apps/web/content/publish/know-where-you-came-from.mdx` | `apps/web/content/publish/episode-003.mdx` | `apps/web/content/_staging/learning-to-lead/episodes/chub-and-jack` | `apps/web/content/_inbox/Podcast Year 1/3 - April 8 - Chub and Jack` | `apps/web/content/episodes/learning-to-lead/chub-and-jack/packet.mdx` | Medium | Upstream creative title is `Chub and Jack`; current public semantic title is `Know Where You Came From`. The public page is concept-driven, while the upstream packet is story-and-ancestry driven. Research and Charlie material are much richer upstream than in the public derivative. |
| `early-life-lessons` | none yet | none yet | `apps/web/content/_staging/learning-to-lead/episodes/early-life-lessons` | `apps/web/content/_inbox/Podcast Year 1/4 - April 15 - Early Life Lessons` | `apps/web/content/episodes/learning-to-lead/early-life-lessons/packet.mdx` | High | Selected as the next packet-first migration because staging already contains a selected Scott main file, a usable dedicated Charlie file, a substantial research dossier, and preserved alternate extras. No public semantic or numbered derivative is assigned yet. The main open questions are future public title/slug, paired-reading target, and whether Charlie's eventual public shape stays as sidebars or becomes a single response. |

## Preserved First-Pass Bridge Packets

These files were created in the first packet-architecture pass before the upstream creative slug validation happened:

- `apps/web/content/episodes/learning-to-lead/write-it-down/packet.mdx`
- `apps/web/content/episodes/learning-to-lead/look-for-lessons/packet.mdx`
- `apps/web/content/episodes/learning-to-lead/know-where-you-came-from/packet.mdx`

They are preserved to avoid deleting writing, but they should now be treated as:

- bridge packets aligned to the public semantic layer
- not the validated creative canonical packet paths

## Operational Guidance

When editing the next batch of real episode content:

- start in the validated creative packet
- inspect staging and inbox provenance
- treat `publish` as the current website derivative layer
- treat numbered public files as preserved legacy forms
