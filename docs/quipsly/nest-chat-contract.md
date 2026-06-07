# Nest Chat contract

Last updated: 2026-06-06

Status: first-pass implementation

## Product rule

Every Nest gets one default async chat thread.

The thread is project memory first: lightweight notes, coordination, GIFs, and handoff context attached to the Nest instead of scattered across external chats.

Thread splitting, channel taxonomy, reactions, task conversion, and live realtime updates can come later.

## Web API

Route:

- `GET /api/nest-chat?projectSlug=<slug>`
- `POST /api/nest-chat`

Read access:

- Requires signed-in user with read access to the Nest.
- Local/operator owner override can provide owner access when configured.

Write access:

- First pass uses the same project access resolution and accepts signed-in collaborators.
- Future pass should distinguish read vs write if viewer-only chat becomes a product need.

## GET response shape

```json
{
  "ok": true,
  "project": {
    "id": "project-id",
    "slug": "high-ground-odyssey-manuscript",
    "name": "High Ground Odyssey Manuscript"
  },
  "thread": {
    "id": "thread-id",
    "key": "default",
    "title": "High Ground Odyssey Manuscript Chat"
  },
  "actor": {
    "email": "user@example.com",
    "name": "User Name",
    "role": "OWNER"
  },
  "messages": []
}
```

## POST body

```json
{
  "projectSlug": "high-ground-odyssey-manuscript",
  "body": "Believe. https://giphy.com/gifs/AppleTVPlus-apple-tv-app-5B925WaCAIWojy3KMG",
  "gifUrl": "https://media.giphy.com/media/5B925WaCAIWojy3KMG/giphy.gif"
}
```

`gifUrl` is optional. If omitted, the server tries to detect a GIF URL in `body`.

## GIF handling

Accepted first pass:

- Direct `.gif` URLs.
- Giphy page URLs like `https://giphy.com/gifs/...-5B925WaCAIWojy3KMG`.
- Giphy media URLs.
- Selected media URLs from Giphy/Tenor/GIFDB domains.

The first message in each new Nest thread is seeded from Quipsly with the Ted Lasso "Believe" GIF.

Source reference:

- `https://giphy.com/gifs/AppleTVPlus-apple-tv-app-5B925WaCAIWojy3KMG`

## Database models

- `StudioNestChatThread`
- `StudioNestChatMessage`

The thread is unique on `(projectId, key)`, with `key = "default"` for the first pass.

Messages belong to both `StudioProject` and `StudioNestChatThread`, so future queries can answer both "what happened in this Nest" and "what happened in this thread."

## Web UI

`NestChatPanel` is mounted inside the shared `SidebarLayout`.

It infers the current Nest from:

- `?project=<slug>`
- `?projectSlug=<slug>`
- `?nest=<slug>`
- `/nests/<slug>`

If no project context exists, the panel hides itself.

## Native app UI

Mac:

- `Nest Chat` sidebar section.
- Uses `NestChatClient`, `NestChatView`, and `NestChatModels`.

iPhone/iPad:

- `Chat` workspace section.
- Uses `MobileNestChatView`, `NestChatClient`, and `NestChatModels`.

Native first pass is honest about auth: if the backend returns a sign-in/access error, the UI shows the error and offers an Open Nest path instead of pretending native auth is complete.

## Next steps

- Add cookie/session-aware native auth instead of relying on browser login.
- Add live polling or websocket refresh after the async proof of concept.
- Add "turn message into task/review request" once the project-management lane stabilizes.
- Add GIF search and GIF maker integration from the media editor.
- Add block/asset/episode-scoped chat anchors without splitting the primary Nest thread too early.
