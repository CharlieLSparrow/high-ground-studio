# QuipslyStudio publish destinations

QuipslyStudio publishing starts from exported artifacts and platform metadata. It does not rewrite source lanes, proxy media, edit decisions, crop recipes, or transcript truth.

The machine-readable destination catalog lives at:

```text
docs/quipslystudio-publish-destinations.json
```

Agents and humans can inspect it with:

```bash
script/agentctl.sh publish-destinations
```

Agents can inspect one destination contract with:

```bash
script/agentctl.sh publish-destination-guidance "YouTube Shorts" short-9x16-01 9:16
```

When the app agent server is running, connected tools can also inspect it with:

```bash
curl http://127.0.0.1:8080/publish_destinations
curl "http://127.0.0.1:8080/publish_destination_guidance?platform=YouTube%20Shorts&lane_id=short-9x16-01&format=9:16"
```

## Current destination model

- `youtube_episode`: 16:9 YouTube episode master.
- `patreon_episode`: Patreon episode post, embed, upload, or attachment workflow.
- `youtube_short`: 9:16 YouTube Short.
- `instagram_reel`: 9:16 Instagram Reel.
- `facebook_reel`: 9:16 Facebook Reel.
- `linkedin_video`: professional-context LinkedIn video post.
- `spotify_podcast`: podcast audio episode.
- `apple_podcasts`: podcast audio episode.

## Operating rule

Manual publishing and API publishing should use the same packet metadata. A human upload should still leave a receipt. An API upload should still produce a human-readable packet. This keeps Quipsly from splitting into two publishing systems.

## Publish packet inclusion

When QuipslyStudio generates a publish packet, the release folder includes:

- `*-publish-destinations.json`: the destination catalog copied into the handoff.
- `*-publish-manifest.json`: per-record destination ids and destination guidance.
- `*-publish-ledger.json`: live receipt records with destination guidance attached.
- `*-checklist.md`: human-readable destination guidance for each platform record.

This keeps the rules with the exported artifacts. A human uploader, API worker, or Codex handoff should not need to hunt through app source to know what a destination expects.

## In-app visibility

The publish ledger UI surfaces destination guidance in two places:

- Each platform card shows compact destination guidance: destination id, preferred format, required fields, and agent guidance.
- The manual receipt editor shows fuller destination guidance before platform copy and receipt fields.
- Each platform card and receipt editor can copy destination guidance JSON for handoff to Codex, another agent, or a future upload worker.

This keeps the human operator from saving a receipt or uploading manually without seeing what that platform record is supposed to become.

## Worker payload inclusion

Generated publish metadata, generated upload jobs, connector readiness, connector preflight, and dry-run worker payloads include destination guidance:

- `destinationId`: the catalog destination id, such as `youtube_episode` or `instagram_reel`.
- `destinationGuidance`: required fields, nice-to-have fields, human checklist, preferred format, and agent guidance from the catalog.

Upload workers should treat this as their platform contract. They may validate or use the guidance, but they must not silently reinterpret the destination or publish to a different platform shape.

This means new ledger records are born with destination intent in:

- `metadataJson.destinationId`
- `metadataJson.destinationGuidance`
- `uploadJobJson.destinationId`
- `uploadJobJson.destinationGuidance`

## Dry-run rule

Dry-run workers may validate:

- exported artifact paths
- title and copy fields
- destination ids and destination guidance
- destination lane ids
- platform metadata completeness
- expected receipt shape

Bundled dry-run workers currently reject payloads when:

- `destinationId` is missing.
- `destinationGuidance` is missing required fields.
- destination-required fields are missing from the worker payload, generated metadata, copy block, or artifact block.
- metadata destination ids disagree with worker payload destination ids.
- a worker receives a destination outside its lane, such as the podcast worker receiving `youtube_short`.

Generated metadata may use explicit placeholders such as `manual-review-required`.
That means Quipsly has represented the required publishing decision in the packet,
but a human or future connector still has to resolve it before real API publishing.
Examples: thumbnail choice, schedule intent, and Patreon tier visibility.

Dry-run workers must not:

- upload
- schedule
- publish
- create provider receipts
- create public URLs
- mutate edit/source/proxy state

## Why this matters

The editor goal ends at publication, not export. This catalog gives Codex and human operators the same destination vocabulary before generating upload packets, platform copy, receipts, and future API integrations.
