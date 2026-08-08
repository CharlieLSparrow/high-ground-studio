# Quipsly local media workspace

Quipsly uses one versioned machine-wide contract for heavy local media. The
browser upload spool remains temporary; exact Drive replicas, collaboration
proxies, waveforms, thumbnails, audio evidence, and future 360° derivatives
belong in a durable workspace.

The contract prevents three failure modes:

- choosing a folder must not silently redirect a running worker;
- disconnecting an active volume must not fall back to the Mac system disk;
- moving media must not invalidate existing proxy playback or delete the old
  bytes.

## Layout and ownership

The default configuration file is private to the macOS user:

```text
~/Library/Application Support/Quipsly/local-media-workspace.json
```

A chosen workspace contains:

```text
Quipsly Media/
  worker-media/    # exact replicas and generated derivatives
  spatial-vault/   # 360-degree stitch and reframe artifacts
```

Quipsly Mac may also use sibling folders for its native playback cache, source
library, and renders. Nest owns canonical project metadata. Google Drive or a
camera volume remains source truth until Quipsly has verified an exact replica.

## States

`planned` means the folder exists but no durable worker has changed roots. It is
safe to inspect, change, or abandon a plan.

`active` means a stopped lifecycle completed all of the following:

1. verified every registered local source against its stored size and SHA-256;
2. copied missing bytes into deterministic destination paths;
3. fsynced and re-hashed each destination;
4. re-verified that every source remained unchanged;
5. rebound canonical local locators in one database transaction;
6. stored a receipt for the exact target and retained old roots for reads.

The migration never deletes source bytes.

## Runtime visibility and admission control

The local media worker publishes a path-withheld capacity heartbeat. Nest may
show the measured available bytes, the protected reserve, safe available bytes,
and whether the worker is using a `durable` or `temporary` workspace, but it
must never expose the filesystem path.

Drive preparation uses the same capacity contract at three boundaries:

1. the Source Story disables a batch that does not fit after the reserve;
2. the server refuses to create or retry the materialization job;
3. the worker measures the filesystem again immediately before download.

The worker remains the final authority because capacity can change after a web
page is rendered. If no fresh heartbeat is available, Nest reports that the
preflight is unavailable and the worker still enforces the reserve. A temporary
workspace is suitable only for bounded development evidence; production media
must use an activated durable workspace.

## Operator workflow

Choose a dedicated folder in **Quipsly Mac → Settings → Media workspace**, or
plan one from the repository:

```bash
pnpm quipsly:local:storage -- plan \
  --workspace '/Volumes/Quipsly SSD/Quipsly Media' \
  --legacy-root "$(node -p 'require("node:path").join(require("node:os").tmpdir(), "quipsly-media-ingest")')"
```

Inspect the non-secret contract:

```bash
pnpm quipsly:local:storage -- status
```

Before activation, stop only Quipsly-owned services. PostgreSQL intentionally
remains available:

```bash
pnpm quipsly:local:down
pnpm quipsly:local:storage:migrate
pnpm quipsly:local:up
```

Migration refuses a non-loopback database and refuses to run while Nest or a
Quipsly media worker is still active. It also reserves 5 GiB beyond the bytes it
must copy. Existing exact destinations make a retry idempotent.

## Failure and recovery

- **Planned volume missing:** the plan is inert; the existing active/fallback
  worker root is unchanged.
- **Active volume missing:** startup stops with a reconnect message. It never
  writes heavy output to the system disk as a substitute.
- **Checksum or size mismatch:** migration stops before rebinding that record.
- **Database rebind conflict:** the transaction rolls back. Verified copies and
  originals remain available for a retry.
- **Restart after activation:** the launcher fingerprint includes the durable
  root, legacy roots, and spatial vault, so Nest and workers reload instead of
  reusing stale environment state.

Do not use an entire volume, `/`, `/Volumes`, `/Users`, or a home directory as
the workspace. Prefer a dedicated folder on storage with at least 100 GB free
for routine 4K/360° work; larger productions need substantially more.
