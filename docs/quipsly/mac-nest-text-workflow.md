# Quipsly Mac Nest + Text Editor Workflow

Date: 2026-06-09

## Product intent

Quipsly Mac should feel like the native local cockpit for creative work, but Nest remains the collaborative source of truth.

The Mac app should not fork the manuscript or project system into a second data model. It should provide native navigation, local media/file muscle, session clarity, durable settings, and fast context switching around the live Nest web routes.

## Current Mac sections

### The Nest

Mac sidebar section: `The Nest`

Primary embedded route:

```text
/projects
```

Purpose:

- Browse assigned Nests/projects.
- Set the current working Nest.
- Jump to Text Editor, Nest Chat, Episode Editor, Access, and Users.
- Keep one current project context across writing, chat, and episode work.

Known preset launch targets currently exposed in Mac:

```text
high-ground-odyssey-manuscript
marine-biology-research
charlie-melissa-fiction-lab
quipsly-dev-lab
```

### Text Editor

Mac sidebar section: `Text Editor`

Primary embedded route:

```text
/create?project=<projectSlug>&publisher=1
```

Purpose:

- Use the existing living-document editor inside the Mac app.
- Support writing documents and study documents without creating a second native text model.
- Keep project switching tied to the same `editorProjectSlug` used by episode and chat workflows.

### Related sections

- `Nest Chat`: one thread per Nest/project, using the same project slug context.
- `Episode Editor`: native local episode editor for recovered media/timelines.
- `Episode Sync`: collaboration and asset handoff path.
- `Nest Session`: native profile/session health and browser sign-in handoff.

## Route helper contract

Mac route construction is centralized in:

```text
apps/quipsly-mac/Sources/QuipslyMac/Support/NestRouteBuilder.swift
```

Current route helpers:

```text
projects(baseURL:)
adminUsers(baseURL:)
nestAccess(baseURL:projectSlug:)
create(baseURL:projectSlug:publisher:)
editor(baseURL:projectSlug:episodeSlug:)
chat(baseURL:projectSlug:)
```

Do not build ad hoc Nest URLs in views or menu commands if a helper belongs here.

## Native command smoke

The new Nest/Text shell smoke is:

```bash
apps/quipsly-mac/script/smoke_nest_text_shell.sh
```

It verifies that the native Navigate menu can select:

```text
The Nest -> selectedSection=nestProjects
Text Editor -> selectedSection=manuscriptEditor
```

## Google OAuth note

If embedded or browser sign-in fails at Google with:

```text
Error 400: redirect_uri_mismatch
```

see:

```text
docs/coordination/google-oauth-redirect-uri-fix.md
```

The confirmed Nest callback URI is:

```text
https://nest.quipsly.com/api/auth/callback/google
```

That URI must be authorized on the Google OAuth web client used by the live Nest service.

## Design principle

Mac-native does not mean rewriting every web feature in Swift.

Mac should own:

- Windowing, menus, keyboard shortcuts, settings, and app context.
- Local files, media roots, proxies, thumbnails, downloads, and renders.
- Native session/profile clarity.
- Fast movement between projects, writing, chat, and episode work.

Nest should own:

- Project/Nest records.
- Access control and collaborators.
- Living text documents.
- Shared chat truth.
- Publishing state.
- Cloud-backed episode production state.

Only port a feature fully native when local performance, file access, media editing, or desktop UX clearly requires it.
