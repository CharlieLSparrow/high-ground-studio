# Quipsly Studio native-session checkpoint safety

Status: implemented and covered by media-core tests as of 2026-07-28.

## Product contract

Quipsly Studio has two native-session roles:

- **Working session**: a mutable workspace that autosave may update.
- **Checkpoint**: a named snapshot that background autosave may never update.

This distinction protects versioned episode sessions while keeping normal
editing recoverable. It does not claim that a checkpoint is globally
immutable: clicking **Save now** or sending the explicit `save-session`
command is an intentional write and may update the named target. Source media
remains outside this contract and is never mutated by session saves.

## Naming convention

`autosave`, names ending in `-working`, and names containing `-working-` are
mutable working sessions. Every other name is treated as an
autosave-protected checkpoint.

When the first edit occurs after loading a checkpoint, the app reserves a
unique target:

```text
<checkpoint>-working-<UTC timestamp>-<short nonce>
```

The checkpoint stem is capped by UTF-8 byte count so the complete
`.quipsly-session.json` filename stays below the common 255-byte filesystem
component limit, including for non-English names.

## Enforcement layers

Checkpoint protection is enforced twice:

1. `WorkspaceView` reserves and exposes the working-copy target before the
   debounced save. Repeated edits reuse the same pending target. Loading or
   explicitly saving a different session cancels the pending request.
2. `LocalMediaVault` receives a `NativeSessionSaveIntent`. It refuses an
   `.autosave` intent for every non-working name before encoding or writing
   bytes.

The vault boundary is authoritative. A future caller cannot bypass
checkpoint protection by forgetting the UI policy.

Each autosave also carries a request UUID. A canceled or superseded request
cannot take over the active-session label after a load or explicit save. The
working target is unique, so even a save already past cancellation cannot
overwrite the checkpoint.

## Operator-visible truth

The native session panel labels the active name as **WORKING** or
**CHECKPOINT** and explains the first-edit fork in its help and status copy.
The local agent state exposes:

- `activeSessionName`
- `activeSessionRole`
- `pendingAutosaveSessionName`
- `pendingAutosaveCheckpointName`
- `checkpointProtection`
- `autosaveStatus`
- `lastSessionPath`
- `lastMediaAction`

The expected transition is:

```text
load checkpoint
  -> CHECKPOINT / no pending target
  -> first edit reserves unique working target
  -> vault saves working target with autosave intent
  -> active session becomes WORKING
  -> later autosaves update only that working target
```

## Recovery from an older build

If an older build already autosaved into a versioned session:

1. Stop making editorial changes.
2. Preserve the affected file; do not rename, delete, or “repair” it in place.
3. Save the earliest trustworthy recovered state under a new versioned name.
4. Save the live recovery state under a name ending in `-working`.
5. Record modification times and SHA-256 hashes for all three files.
6. Continue in the working session.

Do not claim the pre-policy checkpoint remained pristine unless a previously
recorded hash proves it.

## Verification contract

`NativeSessionNamePolicyTests` covers:

- blank-name normalization;
- working/checkpoint classification;
- deterministic unique working-copy naming;
- idempotence for existing working names;
- ASCII and multibyte filename limits;
- role labels; and
- a real temporary-vault boundary test that saves a checkpoint, attempts an
  autosave into it, expects a fail-closed error, then proves exact bytes and
  decoded session content are unchanged.

The final acceptance gate is app-level:

1. build and launch the exact committed source;
2. load a real checkpoint;
3. hash its file;
4. make a real non-destructive edit that schedules autosave;
5. observe the new working name and file;
6. prove the checkpoint hash did not move; and
7. relaunch and load the working copy.

Automated tests alone do not close that gate.

## Stable signing

QuipslyMac Debug and Release builds use automatic Apple Development signing
for product team `585GUXMY5M`. `script/build_and_run.sh` verifies the deep
signature and team after every build. A collaborator can set
`QUIPSLY_MAC_DEVELOPMENT_TEAM` to an authorized alternate team.

CI that deliberately does not exercise stable TCC identity may set
`QUIPSLY_ALLOW_AD_HOC_SIGNING=1`; the build script then passes explicit
ad-hoc signing overrides and still performs structural signature validation.
Ad-hoc builds are not valid microphone, camera, protected-folder, removable
volume, or physical acceptance evidence.
