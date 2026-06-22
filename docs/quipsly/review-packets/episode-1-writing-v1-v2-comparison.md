# Episode 1 Writing Review: First Pass vs Second Pass

Packet status: review aid
Authorship: agent-authored comparison packet
Review status: needs-human-review
Canon status: not canon-approved
Publication status: not published
Receipt status: no external receipts captured

Compared artifacts:

- First pass: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md`
- Second pass: `/Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-second-pass.md`

## Recommendation

Use the second-pass draft as the current working draft for Episode 1 review.

The first pass is useful as the proof-of-concept draft: it clearly names the Nest -> Studio -> Tower loop and establishes the product metaphor. The second pass is stronger as public-facing writing because it has a clearer opening, stronger emotional arc, less demo-language weight, and more room for the High Ground Odyssey voice to breathe before Quipsly appears as the tool principle underneath it.

## What improved in v2

### Stronger opening

The second pass starts with a sharper sentence: "By Wednesday, the fantasy version of the week is usually dead."

That line is more memorable than the first pass opening because it creates immediate tension and relief. It also sounds more like an episode/article hook than an internal product note.

### Less product-first gravity

The first pass turns toward Quipsly quickly and usefully. The second pass lets the human problem stand on its own longer before connecting it to Quipsly.

For High Ground Odyssey public material, that is probably the right order:

1. Name the lived human problem.
2. Offer the practical principle.
3. Connect the principle to the tool and workflow.

### Better emotional precision

The second pass names shame more concretely without becoming melodramatic:

- missed plans become evidence
- the checklist becomes a prosecutor
- shame produces urgency without clarity

That gives the episode more usable language for readers/listeners who are stuck in systems anxiety.

### Stronger Nest / Studio / Tower explanation

The second pass keeps the three-lens explanation short:

- Nest is where the thread lands.
- Studio is where the thread becomes shape.
- Tower is where the shaped thing goes out into the world with proof instead of vibes.

That is cleaner than a long architecture explanation and should be easier to reuse in marketing, onboarding, and episode copy.

## What still needs review

### Voice match

The second pass is emotionally strong, but Charlie/Homer need to decide whether it sounds enough like High Ground Odyssey or whether it needs more of their personal voice, humor, and lived examples.

### Source grounding

This is still an agent-authored creative draft. Before canon approval, review should decide what episode/book/source moments should be cited, embedded, or explicitly tied to the actual Episode 1 conversation.

### Quipsly mention

The Quipsly connection works as a dogfooding principle, but public HGO copy may need a lighter touch depending on whether the page is primarily for the episode audience or also for Quipsly beta storytelling.

## Suggested review decision

Recommended ledger outcome: `mixed-authorship-ready`

Reason: the second pass is strong enough to become the working draft, but it should not be canon-approved until a human review pass decides voice, source grounding, and public Quipsly emphasis.

Suggested command:

```bash
script/agentctl.sh episode1-writing-review-decision mixed-authorship-ready Codex "Recommend v2 as working draft; needs human voice/source review before canon approval."
```

## Truth boundary

This comparison packet does not approve canon, mutate Nest, publish, schedule, or capture external receipts. It exists to make review easier and more transparent.
