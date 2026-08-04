# Agent Authority and Reversible Decisions

Date: 2026-08-03

## Product principle

Human-in-the-loop is an authority and recovery design, not a universal pause
button. Quipsly should let an authorized software agent complete reversible
internal work when it can bind the exact inputs, expose the evidence and
reasoning, preserve provenance, verify the result, and undo or supersede the
decision. A person should be able to understand and correct the work later
without reconstructing hidden state.

The system must never turn an agent action into a false person-review label.
Person and software-agent reviewers are distinct principals. This follows the
same provenance distinction made by W3C PROV-O between people and software
agents: <https://www.w3.org/TR/prov-o/>.

## Impact boundary

Every action is classified by impact rather than by whether an agent or person
clicked the control.

| Class | Examples | Default authority | Required product behavior |
| --- | --- | --- | --- |
| Reversible internal metadata | source alignment, draft tags, organization, candidate selection | Authorized agent or person | Exact input/revision binding, disclosed evidence and actor, idempotent operation, visible receipt, undo/supersession |
| Rebuildable derived artifacts | proxies, waveforms, transcripts, private draft exports | Authorized agent or person | Preserve source identity, tool/model/version and parameters, verify output, replace by version rather than overwrite |
| Canonical creative decisions | final prose, editorial cut, coaching interpretation | Agent may prepare and may activate when authority is explicitly delegated and history is recoverable | Show authorship/evidence/confidence; retain the prior state; make comparison and rollback easy; do not mislabel as person-authored |
| External communication or commitment | invites, messages, scheduling another person, client delivery, public posting | Person authorization or a narrow explicit delegation | Preview exact destination and payload; provider readback; append delivery receipt; safe retry behavior |
| Rights, money, privacy, or destructive action | recording consent, contracts, purchases, credential/policy changes, deletion/retention | Person authorization at the consequential boundary | Explain consequence; target exact resource; prefer recoverable operation; verify provider state; keep audit trail |

An agent is not blocked merely because evidence requires judgment. It is
blocked when the evidence is missing, the actor lacks authority, the action
cannot be safely recovered, or the system cannot verify the claimed outcome.

## Review receipt contract

A decision receipt should carry:

- stable operation and decision IDs;
- actor kind, actor ID, display label, and tool/model version;
- delegation scope;
- exact source identities and revisions;
- decision basis and bounded evidence summary;
- old and new state;
- verification result;
- reversibility and source-mutation truth;
- any receipt it supersedes; and
- time and environment identity.

Retrying an operation with the same ID and same intent is a no-op. Reusing the
ID with changed intent fails closed. Undo is a new append-only activity that
references the exact decision being reversed, comparable to the explicit Undo
activity in the W3C Activity Streams vocabulary:
<https://www.w3.org/TR/activitystreams-vocabulary/>.

## Capture synchronization v2

Source alignment is the first implemented example of this policy.

- A person review requires a verified native Quipsly identity.
- An agent qualification requires its software-agent identity, tool version,
  delegation scope, decision basis, and substantive evidence summary.
- Both paths revalidate immutable source identity, Capture group, Episode
  Space, current target offset, opening cue, later drift check, and assembled
  playback checks.
- Both append receipts and change only reversible timeline metadata.
- An active receipt can be superseded only by naming it exactly.
- Undo restores the recorded prior offset and status. If the undone receipt
  superseded another review, that earlier review becomes active again.
- Agent qualification and agent undo are available through the loopback agent
  interface. State readback exposes exact active receipts and executable undo
  commands.
- Neither path changes source bytes or claims sample accuracy.
- The native agent control listener is bound to `127.0.0.1` with Network
  framework local-only acceptance. LAN peers cannot invoke editor authority;
  ordinary cross-site browser requests are rejected from fetch metadata,
  Origin, and Referer evidence. The canonical CLI sends a custom local-control
  header while older local CLI smoke tools remain compatible. A local process
  still operates under the logged-in Mac user's trust boundary.

AVFoundation synchronized capture timestamps are tied to the capture session's
master clock, which is useful placement evidence but not a substitute for
cross-device audiovisual validation:
<https://developer.apple.com/documentation/avfoundation/avcapturesynchronizeddata/timestamp>.
Where devices provide it, timecode is a stronger explicit synchronization
source and should be preserved as evidence:
<https://developer.apple.com/documentation/avfoundation/avcapturetimecode>.

## Boundary audit

The current codebase contains legacy `needs-human-review` and
`humanReviewRequired` values. They are not all equivalent.

1. Keep hard person authorization around consent, public/client delivery,
   real-person communication, spending/contracts, destructive retention, and
   credentials or organization policy.
2. Convert internal media, transcript, research, writing, and organization
   queues from blanket human gates into review tasks with actor kind, evidence,
   confidence, authority, and recovery semantics.
3. Preserve old wire values until their persistence and API consumers are
   migrated. UI can say **Evidence review required** while compatibility code
   still decodes an older `machine-pass-human-review-required` enum value.
4. A publication proof requirement is not the same as a publication approval
   requirement. Agents may inspect, prepare, export, and validate privately;
   an external provider action needs the appropriate delegation and provider
   readback.
5. “Agent suggestion” must not become a permanent lower class of work. If an
   agent has adequate evidence and delegated authority, it should be able to
   create the real reversible decision receipt.
6. “Local automation” must be enforced by the socket, not by documentation or
   CORS headers. The prior listener accepted on every interface at `*:8080`;
   the corrected listener requires the IPv4 loopback endpoint, local-only
   connections, and rejects cross-site browser request evidence. The canonical
   CLI additionally identifies itself with the local-control header.

## UX requirements

The UI should answer, without opening logs:

- What changed?
- Who or what decided it?
- What evidence did it use?
- What authority allowed the action?
- What did verification prove and not prove?
- What decision did this supersede?
- Can I undo it, and what will be restored?

Review history is product UI, not compliance paperwork. The default surface
should show the current decision and one-line evidence; expanded history shows
the full receipt chain. Undo and supersede actions must be adjacent to the
decision they affect.

## Follow-through

Use the same receipt primitive next for transcript corrections, canonical
writing changes, task extraction, research claims, and private export
qualification. Do not build separate approval bureaucracies for each feature.
The shared primitive should compose with provider-specific confirmation and
readback only where an action crosses Quipsly's boundary.
