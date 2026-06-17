# AG-Fiction-Tools Report: Private Seed Viewer

## Implementation Status
- **Private Route Built:** Created `/fiction-tools/private/[seriesSlug]/[issueSlug]` server component.
- **Strict Access Control:** The route explicitly checks `session.user.email` for `charlielsparrow@gmail.com`. If not found, it returns a 403 Unauthorized view with a strict warning. No data leaks.
- **Filesystem Backed:** Currently, the page securely reads `issue.json` and `story-bible-seed.json` directly from `/content/private/fiction/charlie-l-sparrow/...` using Node `fs`. It does not hit the database yet.
- **Fiction Development Packet UI:** Renders Series overview, Issue subTrope and Creative Rules, a list of Narrative Acts (I, II, III, IV), and Character/Setting cards powered by `story-bible-seed.json`.

## Idempotent Importer Proposal

As requested, we must not push this into production tables until we have a safe, idempotent path. Here is the proposed strategy:

### 1. Database Schema
Currently, we have `StoryEntity` (handling types like `CHARACTER`, `BEAT`, `SETTING`).
We can expand `EntityType` to include `COMIC_ACT` and `COMIC_PANEL`, or we can build specialized `ComicIssue`, `ComicAct`, and `ComicPanel` tables if queries are highly specific. Assuming we use `StoryEntity`:

### 2. Idempotency Key
Every imported entity must have a deterministic identifier.
We will use a unique `slug` (or `externalId`) composed of:
`[projectSlug]-[issueSlug]-entity-[seedId]`
(e.g., `junkyard-starship-issue-001-entity-sundog`)

### 3. Upsert Workflow
An API route (`POST /api/fiction-tools/import-seed`) will read the local `content/` JSON files, map them to Prisma payloads, and perform a transaction of `prisma.storyEntity.upsert` calls:

```typescript
for (const entity of storyBibleData.entities) {
  const externalId = `junkyard-starship-issue-001-${entity.name.toLowerCase()}`;
  await prisma.storyEntity.upsert({
    where: { externalId },
    update: {
      type: entity.type,
      attributes: entity.attributes,
    },
    create: {
      externalId,
      projectId: targetProjectId,
      type: entity.type,
      name: entity.name,
      attributes: entity.attributes,
    }
  });
}
```

By using `upsert` mapped to a deterministic `externalId` constraint, multiple clicks of the import button will safely overwrite without duplicating records. This connects the fiction packet seamlessly into the standard `StoryBibleSidebar` and `TimelineView` components already functioning in Quipsly.
