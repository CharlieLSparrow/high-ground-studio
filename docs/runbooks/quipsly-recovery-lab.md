# Quipsly isolated recovery lab

Use this lane to prove that a committed Quipsly Nest package can recover into
a separately administered environment. It is intentionally different from the
daily local lane.

| Service | Daily local lane | Recovery lab |
| --- | ---: | ---: |
| Nest | `127.0.0.1:3012` | `127.0.0.1:3022` |
| Firebase Auth emulator | `127.0.0.1:9099` | `127.0.0.1:9199` |
| PostgreSQL | `127.0.0.1:5432/high_ground_studio` | `127.0.0.1:55432/quipsly_portable_recovery_lab` |
| Next build state | `.next` | `.next-recovery-lab` |

The lab does not read an application `.env`, use Google Cloud credentials, or
copy the daily database. It creates an empty loopback-only pgvector container
and applies committed Prisma migrations. Its Firebase project name, users,
session cookie, and generated auth secret are local and separate.

## Start

Use a clean committed revision:

```bash
pnpm quipsly:recovery-lab:up
pnpm quipsly:recovery-lab:doctor
```

`up` refuses a dirty worktree by default because disaster-recovery evidence
must identify exact source. During development only, an engineer may opt into
an explicitly non-authoritative run:

```bash
QUIPSLY_RECOVERY_LAB_ALLOW_DIRTY=1 pnpm quipsly:recovery-lab:up
```

Do not describe that override as disaster-recovery proof.

## Operated acceptance

1. Open [the isolated Nest](http://127.0.0.1:3022).
2. Create a synthetic email/password account.
3. Complete email verification through the Firebase emulator.
4. Confirm Quipsly creates the account and private Home Nest in the lab
   database.
5. Create a dedicated destination Nest.
6. Open **Tools → Backup and transfer**.
7. Load a private exported package, validate its manifest, and require
   `0 overwrites · 0 source mutations · 0 external effects`.
8. Apply once.
9. Open at least one restored note, the Work view, and a restored tag.
10. Independently verify persistence: note blocks, task and goal counts,
    progress, relationships, no active reminders or recurrence, and canceled
    focus blocks.
11. Load and apply the exact same package again. Require zero new durable
    records and deterministic reuse.

Record:

- committed source SHA;
- file SHA-256 and semantic manifest SHA-256;
- migration count/status;
- first-apply plan;
- retry plan;
- rendered-product readback;
- independent database readback.

The package contains private work. Keep it outside Git and do not paste its
contents into an issue or pull request.

## Replace or stop

Replace only this exact owned lab:

```bash
pnpm quipsly:recovery-lab:up -- --replace
```

Stop the app/auth jobs and permanently delete the disposable recovery
database:

```bash
pnpm quipsly:recovery-lab:down
```

Shutdown verifies exact launchd/process and Docker ownership before acting. It
does not stop or change the canonical local database, Nest, or Auth emulator.

## Completion boundary

This closes local second-environment disaster recovery for the included Nest
knowledge-work package. It does not prove production deployment, provider
delivery, media recovery, physical-iPhone behavior, TestFlight availability,
or App Store submission.
