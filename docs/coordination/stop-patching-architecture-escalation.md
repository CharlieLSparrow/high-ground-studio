# Stop patching: architecture escalation rule

## Purpose

Quipsly moves fast, but fast cannot mean repeatedly patching the same broken shape.

This rule exists to protect momentum, money, attention, and morale. It is not a punishment for failed attempts. It is a mechanism for noticing when the system is teaching us that the current approach is wrong.

## Core rule

When a feature or subsystem crosses the escalation threshold, stop patch-mode and switch to architecture-mode.

Architecture-mode means:

1. Name the repeated failure pattern.
2. Preserve what we learned.
3. Identify what parts are still sound.
4. Propose a simpler target design.
5. Migrate deliberately instead of layering more exceptions.
6. Prove the real user workflow works before calling it fixed.

## Escalation triggers

Escalate when any of these happen:

1. The same user-facing symptom survives three attempted fixes.
2. Two or more root causes appear inside the same subsystem.
3. More than 90 minutes pass without a user-visible working result.
4. The workaround requires odd ritual steps for a normal product action.
5. The explanation of the system becomes harder than the user goal.
6. A fix depends on provider behavior, deployment quirks, or environment state that users should not have to understand.
7. The next patch would add another compatibility layer instead of removing complexity.

## Required escalation note

When escalating, write or update a short note with this shape:

```md
# Architecture escalation: <subsystem>

## Failure pattern

## Attempts already made

## What we learned

## What we keep

## What we stop patching

## Simpler target architecture

## Migration path

## Proof required before calling it fixed

## Re-examination date / trigger
```

## Not dogma

This rule is itself revisable.

Do not turn a useful lesson into a new superstition. If the escalation process starts slowing real progress, creating bureaucracy, or forcing re-architecture where a small fix would be safer, challenge it.

Good engineering judgment still applies:

- Small, obvious defects can still be patched.
- Production emergencies may need a temporary containment fix before redesign.
- A mature subsystem should not be rewritten just because it has one bug.
- The goal is lower system anxiety, not ceremonial architecture theater.

## Auth lesson that created this rule

The Quipsly login work crossed the threshold before we admitted it.

Repeated symptoms involved:

- Google OAuth redirect mismatch.
- Cloud Run internal host leaking into auth URLs.
- Provider configuration differing from app-owned access logic.
- Patreon beta access being mentally too close to account truth.
- Mac native session and embedded web session being treated as one problem.

The correct architectural move was:

- Quipsly owns `User`, `Membership`, and Nest access truth.
- Email-code login becomes the durable front door.
- Google and Patreon become optional provider/linking paths.
- Mac device sessions depend on Quipsly-owned identity, not provider cookies.

The lesson is not "never use Google" or "never use Patreon."

The lesson is:

> Providers may help prove identity or entitlement. They should not be the only load-bearing way a beta user enters their workspace.

## Agent operating instruction

When an agent notices a repeated-fix loop, it should say plainly:

> This has crossed the stop-patching threshold. I recommend architecture-mode.

Then it should propose the smallest strong re-architecture that removes complexity instead of hiding it.
