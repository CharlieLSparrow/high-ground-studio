// @ts-nocheck
import type {
  ApiEndpointProjection,
  EvidenceProjection,
  LorelistItemProjection,
  LorelistProjection,
  MerchConceptProjection,
  NestProjection,
  PageCompanionProjection,
  PersonProjection,
  QuipCardProjection,
  QuipStreamCardProjection,
  QuipslyAssetSheetProjection,
  ResearchActionProjection,
  ResearchPacketProjection,
  ResearchPriority,
  ResearchQueueItemProjection,
  ResearchQueueStatus,
  QuoteStoryProjection,
  QuotePassportProjection,
  QuoteProjection,
  QuoteVariantProjection,
  SourceWorkProjection,
  StreamMode,
  ThemeProjection,
} from "./index";

const EINSTEIN_QUIPSLY_SPRITES =
  "/illustrations/einstein-quipsly-sprite-sheet.png";
const QUOTE_COMPANION_SPRITES =
  "/illustrations/quipsly-quote-companions-sprite-sheet.png";
const PAGE_COMPANION_SPRITES =
  "/illustrations/quipsly-page-companions-sprite-sheet.png";

export const apiEndpoints: readonly ApiEndpointProjection[] = [
  {
    id: "api-quotes-search",
    method: "GET",
    path: "/v1/quotes/search",
    group: "Quotes",
    title: "Search quote cards",
    description:
      "Returns source-aware quote card projections filtered by text, verification status, theme, and limit.",
    gatewayUse:
      "Public discovery endpoint suitable for API key quotas, cache policy, and partner demos.",
    example: {
      label: "Verified courage quotes",
      path: "/v1/quotes/search?status=verified&theme=courage&limit=4",
      description: "A compact search example for high-trust quote discovery.",
    },
  },
  {
    id: "api-quote-passport",
    method: "GET",
    path: "/v1/quote-passports/{slug}",
    group: "Passports",
    title: "Quote Passport",
    description:
      "Returns the canonical quote reference projection with person, source work, evidence, variants, themes, and related quotes.",
    gatewayUse:
      "Core paid/reference API candidate because it exposes trust metadata, not just quote text.",
    example: {
      label: "High-trust public speech",
      path: "/v1/quote-passports/fear-itself",
      description: "A clean source benchmark with speaker, source, date, and confidence.",
    },
  },
  {
    id: "api-quote-story",
    method: "GET",
    path: "/v1/quote-stories/{slug}",
    group: "Stories",
    title: "Quote story trail",
    description:
      "Returns source-aware story beats that can power QuipLore explainers, shorts, and editorial collections.",
    gatewayUse:
      "Editorial API surface for apps that want quote context without inventing their own source narrative.",
    example: {
      label: "Story trail",
      path: "/v1/quote-stories/fear-itself",
      description: "Source beats and a video seed for a public speech quote.",
    },
  },
  {
    id: "api-merch-quote",
    method: "GET",
    path: "/v1/merch/quote/{slug}",
    group: "Merch",
    title: "Merch readiness",
    description:
      "Returns product concept guidance and blocks unsafe quote records from merchandise use.",
    gatewayUse:
      "Internal and partner commerce guardrail before quote text moves into print-on-demand workflows.",
    example: {
      label: "Blocked attribution",
      path: "/v1/merch/quote/explain-it-simply",
      description: "Shows how a charming line can be blocked when attribution is unsafe.",
    },
  },
  {
    id: "api-person",
    method: "GET",
    path: "/v1/people/{slug}",
    group: "People",
    title: "Quotable person",
    description:
      "Returns a person projection with quote cards, domains, related people, and Quipsly visual posture.",
    gatewayUse:
      "SEO, discovery, and partner profile endpoint for author/person pages.",
    example: {
      label: "Einstein test profile",
      path: "/v1/people/albert-einstein",
      description: "Quote-famous person page with attributed and disputed examples.",
    },
  },
  {
    id: "api-research-queue",
    method: "GET",
    path: "/v1/research/queue",
    group: "Research",
    title: "Research queue",
    description:
      "Returns source-review work items with risk flags, priority, and next actions for quote researchers.",
    gatewayUse:
      "Internal researcher API surface before persistence and assignment workflows land in the database.",
    example: {
      label: "Needs source lane",
      path: "/v1/research/queue?status=needs-source",
      description: "Quotes that need source location, wording review, or archive evidence.",
    },
  },
  {
    id: "api-research-packet",
    method: "GET",
    path: "/v1/research/quotes/{slug}",
    group: "Research",
    title: "Research packet",
    description:
      "Returns one quote's Passport, story, merch guardrail, checklist, decision log, and database write plan.",
    gatewayUse:
      "Internal review packet for source researchers, editors, and future admin tooling.",
    example: {
      label: "Disputed Einstein packet",
      path: "/v1/research/quotes/explain-it-simply",
      description: "A source-risk packet for a popular disputed attribution.",
    },
  },
  {
    id: "api-quipsly-assets",
    method: "GET",
    path: "/v1/assets/quipsly",
    group: "Assets",
    title: "Quipsly asset registry",
    description:
      "Returns sprite sheets, cells, intended uses, and ambient page companions.",
    gatewayUse:
      "Asset metadata endpoint for apps that need quote-attached Quipsly companions.",
    example: {
      label: "Sprite registry",
      path: "/v1/assets/quipsly",
      description: "Lists every current Quipsly sheet and cell mapping.",
    },
  },
  {
    id: "api-stream-modes",
    method: "GET",
    path: "/v1/quipstream/modes",
    group: "QuipStream",
    title: "Stream modes",
    description:
      "Returns available discovery modes for stream sessions and recommendation experiments.",
    gatewayUse:
      "Client bootstrapping endpoint for discovery apps.",
    example: {
      label: "Mode catalog",
      path: "/v1/quipstream/modes",
      description: "Available QuipStream modes for discovery clients.",
    },
  },
  {
    id: "api-stream-session",
    method: "POST",
    path: "/v1/quipstream/sessions",
    group: "QuipStream",
    title: "Create stream session",
    description:
      "Creates an anonymous prototype QuipStream session for collecting discovery interaction events.",
    gatewayUse:
      "Future ML/recommendation telemetry entrypoint with account, abuse, and privacy controls.",
    example: {
      label: "Anonymous stream session",
      path: "/v1/quipstream/sessions",
      description: "Creates a session for the stream event ledger.",
    },
  },
  {
    id: "api-stream-next",
    method: "GET",
    path: "/v1/quipstream/sessions/{sessionId}/next",
    group: "QuipStream",
    title: "Next stream card",
    description:
      "Returns the next quote card for a mode and cursor within a stream session.",
    gatewayUse:
      "Recommendation delivery surface before later MLE ranking services sit behind it.",
    example: {
      label: "First curiosity card",
      path: "/v1/quipstream/sessions/demo/next?mode=by-theme&cursor=0",
      description: "A deterministic prototype card for discovery UI testing.",
    },
  },
  {
    id: "api-stream-event",
    method: "POST",
    path: "/v1/quipstream/events",
    group: "QuipStream",
    title: "Record stream event",
    description:
      "Accepts prototype impressions, saves, skips, Passport opens, and story/merch interest events.",
    gatewayUse:
      "Telemetry ingestion boundary for future ranking, analytics, and partner reporting.",
    example: {
      label: "Event payload",
      path: "/v1/quipstream/events",
      description: "Accepts explicit user interaction events from discovery surfaces.",
    },
  },
  {
    id: "api-openapi",
    method: "GET",
    path: "/openapi.json",
    group: "Spec",
    title: "OpenAPI document",
    description:
      "Returns a prototype OpenAPI 3.1 document for gateway review, client generation, and API marketing.",
    gatewayUse:
      "Seed input for Apigee, API Gateway, partner documentation, and generated SDKs.",
    example: {
      label: "OpenAPI 3.1",
      path: "/openapi.json",
      description: "Machine-readable route catalog.",
    },
  },
] as const;

export const quipslyAssetSheets: readonly QuipslyAssetSheetProjection[] = [
  {
    id: "asset-sheet-einstein-quipsly",
    title: "Einstein Quipsly cosplay sheet",
    assetSrc: EINSTEIN_QUIPSLY_SPRITES,
    spriteColumns: 3,
    spriteRows: 2,
    usage: "person-cosplay",
    cells: [
      {
        id: "einstein-idea-spark",
        label: "Idea spark",
        spriteCell: "top-left",
        alt: "Einstein-inspired Quipsly holding up a glowing idea bulb beside books and notes.",
        mood: "idea spark",
        intendedUse: "Einstein quotes about imagination and invention.",
      },
      {
        id: "einstein-balance",
        label: "Balance in motion",
        spriteCell: "top-center",
        alt: "Einstein-inspired Quipsly studying stars through a telescope with notes nearby.",
        mood: "balance in motion",
        intendedUse: "Einstein quotes about movement, persistence, and inquiry.",
      },
      {
        id: "einstein-question-board",
        label: "Question board",
        spriteCell: "top-right",
        alt: "Einstein-inspired Quipsly at a chalkboard with science sketches and chalk.",
        mood: "question board",
        intendedUse: "Einstein quotes about questions, learning, and source review.",
      },
      {
        id: "einstein-value-study",
        label: "Value study",
        spriteCell: "bottom-left",
        alt: "Einstein-inspired Quipsly reading in a plum chair with a lamp, books, and tea.",
        mood: "value study",
        intendedUse: "Einstein quotes that need slower ethical framing.",
      },
      {
        id: "einstein-working-draft",
        label: "Working draft",
        spriteCell: "bottom-center",
        alt: "Einstein-inspired Quipsly writing notes with a radio microphone and crumpled paper.",
        mood: "working draft",
        intendedUse: "Popular Einstein attributions still in review.",
      },
      {
        id: "einstein-source-doubt",
        label: "Source doubt",
        spriteCell: "bottom-right",
        alt: "Einstein-inspired Quipsly reclining with orbit sketches and folded paper models.",
        mood: "source doubt",
        intendedUse: "Disputed or misattributed Einstein-style quote records.",
      },
    ],
  },
  {
    id: "asset-sheet-quote-companions",
    title: "Quote companion Quipsly sheet",
    assetSrc: QUOTE_COMPANION_SPRITES,
    spriteColumns: 4,
    spriteRows: 2,
    usage: "quote-companion",
    cells: [
      {
        id: "quote-source-anchor",
        label: "Source anchor",
        spriteCell: "top-left",
        alt: "Quipsly stamping an archive record beside a verified check seal.",
        mood: "source anchor",
        intendedUse: "High-trust quote records with clean source metadata.",
      },
      {
        id: "quote-field-explorer",
        label: "Field explorer",
        spriteCell: "top-center-left",
        alt: "Quipsly as a field explorer with cap, magnifier, papers, and compass.",
        mood: "open field",
        intendedUse: "Discovery cards that invite more context.",
      },
      {
        id: "quote-social-reader",
        label: "Social reader",
        spriteCell: "top-center-right",
        alt: "Quipsly as a cozy reader in a plum chair with books and tea.",
        mood: "social reader",
        intendedUse: "Literary quotes that depend on surrounding text.",
      },
      {
        id: "quote-stage-context",
        label: "Stage context",
        spriteCell: "top-right",
        alt: "Quipsly on a small theater stage with curtain, candle, and prop skull.",
        mood: "stage context",
        intendedUse: "Dramatic quotes where speaker and scene matter.",
      },
      {
        id: "quote-slant-letter",
        label: "Slant letter",
        spriteCell: "bottom-left",
        alt: "Quipsly holding a sealed letter with small flowers and writing paper.",
        mood: "slant letter",
        intendedUse: "Poetry, letters, and variant-sensitive records.",
      },
      {
        id: "quote-lantern-courage",
        label: "Lantern courage",
        spriteCell: "bottom-center-left",
        alt: "Quipsly in a green cloak holding a lantern on a rocky path.",
        mood: "lantern courage",
        intendedUse: "Courage quotes that need context instead of slogan treatment.",
      },
      {
        id: "quote-attribution-doubt",
        label: "Attribution doubt",
        spriteCell: "bottom-center-right",
        alt: "Quipsly in a rust jacket studying scattered notes, warning marks, and question signs.",
        mood: "attribution doubt",
        intendedUse: "Disputed, misattributed, or needs-review quote records.",
      },
      {
        id: "quote-nest-curator",
        label: "Nest curator",
        spriteCell: "bottom-right",
        alt: "Quipsly organizing quote cards in a nest beside a small source box.",
        mood: "nest curator",
        intendedUse: "Curation, saved quotes, and Lorelist collection moments.",
      },
    ],
  },
  {
    id: "asset-sheet-page-companions",
    title: "Ambient page companion Quipsly sheet",
    assetSrc: PAGE_COMPANION_SPRITES,
    spriteColumns: 3,
    spriteRows: 2,
    usage: "page-companion",
    cells: [
      {
        id: "page-bookmark",
        label: "Bookmark perch",
        spriteCell: "top-left",
        alt: "Quipsly perched on tall bookmarks at the page edge.",
        mood: "page-edge guide",
        intendedUse: "Quiet navigation decoration.",
      },
      {
        id: "page-card-peek",
        label: "Card peek",
        spriteCell: "top-center",
        alt: "Quipsly peeking over the top of an index card.",
        mood: "card-edge peek",
        intendedUse: "Ambient discovery surfaces.",
      },
      {
        id: "page-reading-stack",
        label: "Reading stack",
        spriteCell: "top-right",
        alt: "Quipsly reading on a stack of source papers.",
        mood: "reading stack",
        intendedUse: "Reference and source-heavy pages.",
      },
      {
        id: "page-source-courier",
        label: "Source courier",
        spriteCell: "bottom-left",
        alt: "Quipsly carrying a blank source tag.",
        mood: "source-tag courier",
        intendedUse: "Metadata and citation moments.",
      },
      {
        id: "page-nest-keeper",
        label: "Nest keeper",
        spriteCell: "bottom-center",
        alt: "Quipsly asleep in a nest made of quote cards.",
        mood: "nest keeper",
        intendedUse: "Saved library and collection surfaces.",
      },
      {
        id: "page-discovery-scout",
        label: "Discovery scout",
        spriteCell: "bottom-right",
        alt: "Quipsly waving beside a compass and magnifying glass.",
        mood: "discovery scout",
        intendedUse: "Search, stream, and exploration surfaces.",
      },
    ],
  },
] as const;

export const themes: readonly ThemeProjection[] = [
  {
    id: "theme-curiosity",
    slug: "curiosity",
    label: "Curiosity",
    color: "#4f7f52",
  },
  {
    id: "theme-courage",
    slug: "courage",
    label: "Courage",
    color: "#ad6b35",
  },
  {
    id: "theme-wit",
    slug: "wit",
    label: "Wit",
    color: "#6d4d78",
  },
  {
    id: "theme-sourcecraft",
    slug: "sourcecraft",
    label: "Sourcecraft",
    color: "#436a7d",
  },
  {
    id: "theme-freedom",
    slug: "freedom",
    label: "Freedom",
    color: "#806934",
  },
  {
    id: "theme-perception",
    slug: "perception",
    label: "Perception",
    color: "#8a5a44",
  },
] as const;

export const people: readonly PersonProjection[] = [
  {
    id: "person-albert-einstein",
    slug: "albert-einstein",
    name: "Albert Einstein",
    displayName: "Albert Einstein",
    dates: "1879-1955",
    roles: ["speaker", "author"],
    domains: ["physics", "public thought", "education"],
    summary:
      "A theoretical physicist whose public interviews and essays made him one of the most quoted scientific figures of the twentieth century.",
    whyQuotable:
      "Einstein is quote-famous because he combined technical authority with compact public language. QuipLore should treat his popular quotes carefully because many viral versions are paraphrases or misattributions.",
    visualPrompt:
      "A Quipsly sparrow in a soft archive coat with chalk dust, orbit lines, and a desk lamp, representing scientific curiosity without using a human portrait.",
    quipslyState: "thinking",
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
    themeIds: ["theme-curiosity", "theme-sourcecraft", "theme-perception"],
    relatedPersonIds: ["person-mary-shelley", "person-emily-dickinson"],
  },
  {
    id: "person-jane-austen",
    slug: "jane-austen",
    name: "Jane Austen",
    displayName: "Jane Austen",
    dates: "1775-1817",
    roles: ["author"],
    domains: ["fiction", "social comedy", "manners"],
    summary:
      "A novelist whose sentences turn social pressure, irony, and desire into durable literary machinery.",
    whyQuotable:
      "Austen's opening lines and turns of irony are useful because the source trail is often clear, but the social meaning still rewards context.",
    visualPrompt:
      "A Quipsly sparrow with a tiny writing desk, ribbon bookmark, and tea-stained paper textures.",
    quipslyState: "writing",
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
    themeIds: ["theme-wit", "theme-perception"],
    relatedPersonIds: ["person-william-shakespeare", "person-emily-dickinson"],
  },
  {
    id: "person-mary-shelley",
    slug: "mary-shelley",
    name: "Mary Shelley",
    displayName: "Mary Shelley",
    dates: "1797-1851",
    roles: ["author"],
    domains: ["fiction", "gothic literature", "ethics"],
    summary:
      "A novelist whose work ties ambition, loneliness, responsibility, and invention into one of literature's great cautionary frames.",
    whyQuotable:
      "Shelley is quotable because her characters speak in sharp emotional claims, but context matters: many lines are voiced by unreliable or wounded narrators.",
    visualPrompt:
      "A Quipsly sparrow in a storm-lit reading nook with stitched paper, brass instruments, and a candle.",
    quipslyState: "found",
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
    themeIds: ["theme-courage", "theme-perception"],
    relatedPersonIds: ["person-jane-austen", "person-william-shakespeare"],
  },
  {
    id: "person-frederick-douglass",
    slug: "frederick-douglass",
    name: "Frederick Douglass",
    displayName: "Frederick Douglass",
    dates: "1818-1895",
    roles: ["speaker", "author"],
    domains: ["abolition", "memoir", "public speech"],
    summary:
      "An abolitionist, orator, editor, and author whose speeches and autobiographies remain central to American moral argument.",
    whyQuotable:
      "Douglass's lines should be handled with source care because the power is inseparable from the speech, audience, and historical stakes around them.",
    visualPrompt:
      "A Quipsly sparrow at a lectern with a newspaper press, laurel-green drapery, and archive labels.",
    quipslyState: "curious",
    themeIds: ["theme-freedom", "theme-courage", "theme-sourcecraft"],
    relatedPersonIds: ["person-walt-whitman", "person-franklin-roosevelt"],
  },
  {
    id: "person-emily-dickinson",
    slug: "emily-dickinson",
    name: "Emily Dickinson",
    displayName: "Emily Dickinson",
    dates: "1830-1886",
    roles: ["author"],
    domains: ["poetry", "attention", "truth"],
    summary:
      "A poet whose compressed lines turn slant, silence, and startling syntax into a discovery engine.",
    whyQuotable:
      "Dickinson's poems make short lines feel shareable, but dashes, variants, and editorial history make exact wording important.",
    visualPrompt:
      "A Quipsly sparrow beside folded letters, pressed flowers, and narrow shafts of light.",
    quipslyState: "idle",
    themeIds: ["theme-curiosity", "theme-perception", "theme-sourcecraft"],
    relatedPersonIds: ["person-jane-austen", "person-walt-whitman"],
  },
  {
    id: "person-william-shakespeare",
    slug: "william-shakespeare",
    name: "William Shakespeare",
    displayName: "William Shakespeare",
    dates: "1564-1616",
    roles: ["author"],
    domains: ["drama", "poetry", "language"],
    summary:
      "A playwright and poet whose lines have been quoted, adapted, clipped, and misremembered for centuries.",
    whyQuotable:
      "Shakespeare is a perfect QuipLore test case because the quote can be famous while its speaker, scene, and dramatic irony change the meaning.",
    visualPrompt:
      "A Quipsly sparrow on a tiny stage with ink, script pages, and a warm footlight glow.",
    quipslyState: "celebrating",
    themeIds: ["theme-wit", "theme-perception", "theme-sourcecraft"],
    relatedPersonIds: ["person-jane-austen", "person-mary-shelley"],
  },
  {
    id: "person-franklin-roosevelt",
    slug: "franklin-roosevelt",
    name: "Franklin D. Roosevelt",
    displayName: "Franklin D. Roosevelt",
    dates: "1882-1945",
    roles: ["speaker"],
    domains: ["public speech", "leadership", "government"],
    summary:
      "A U.S. president whose first inaugural address contains one of the clearest examples of a source-stable public quote.",
    whyQuotable:
      "Roosevelt's famous line is useful for the platform because the source, date, setting, and public-domain status are unusually clear.",
    visualPrompt:
      "A Quipsly sparrow with a radio microphone, brass seal shapes, and a folded speech page.",
    quipslyState: "found",
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
    themeIds: ["theme-courage", "theme-sourcecraft"],
    relatedPersonIds: ["person-frederick-douglass", "person-albert-einstein"],
  },
  {
    id: "person-walt-whitman",
    slug: "walt-whitman",
    name: "Walt Whitman",
    displayName: "Walt Whitman",
    dates: "1819-1892",
    roles: ["author"],
    domains: ["poetry", "democracy", "selfhood"],
    summary:
      "A poet whose long, rolling lines turn contradiction, body, nation, and self into expansive song.",
    whyQuotable:
      "Whitman is quotable at several scales: one-line excerpts, full stanzas, and whole movements. QuipLore should show the excerpt's place in the larger poem.",
    visualPrompt:
      "A Quipsly sparrow with field notes, leaves, and a wide-open notebook under daylight.",
    quipslyState: "nesting",
    themeIds: ["theme-freedom", "theme-perception"],
    relatedPersonIds: ["person-emily-dickinson", "person-frederick-douglass"],
  },
  {
    id: "person-dorothy-parker",
    slug: "dorothy-parker",
    name: "Dorothy Parker",
    displayName: "Dorothy Parker",
    dates: "1893-1967",
    roles: ["author", "speaker"],
    domains: ["wit", "criticism", "poetry"],
    summary:
      "A writer, critic, and poet whose reputation for compact wit makes her a frequent target for unstable quote attributions.",
    whyQuotable:
      "Parker is a useful early QuipLore case because a quote can sound like her without having a stable source trail. That makes the page a source-skepticism surface, not just a fan page.",
    visualPrompt:
      "A Quipsly sparrow with a notebook, theater program, sharp pencil, and plum-toned archive labels.",
    quipslyState: "oops",
    themeIds: ["theme-wit", "theme-curiosity", "theme-sourcecraft"],
    relatedPersonIds: ["person-jane-austen", "person-albert-einstein"],
  },
  {
    id: "person-jean-luc-picard",
    slug: "jean-luc-picard",
    name: "Jean-Luc Picard",
    displayName: "Captain Jean-Luc Picard",
    roles: ["leader", "captain", "diplomat"],
    domains: ["leadership", "ethics", "science fiction"],
    summary: "Captain of the USS Enterprise, known for his wisdom, diplomacy, and ethical leadership.",
    whyQuotable: "Picard embodies a thoughtful, measured approach to leadership that emphasizes morals over force.",
    visualPrompt: "A Quipsly in a red and black uniform, holding a cup of Earl Grey tea.",
    quipslyState: "thinking",
    themeIds: ["theme-courage"],
    relatedPersonIds: ["person-gandalf"],
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
  },
  {
    id: "person-gandalf",
    slug: "gandalf",
    name: "Gandalf",
    displayName: "Gandalf the Grey",
    roles: ["wizard", "guide", "leader"],
    domains: ["leadership", "fantasy", "courage"],
    summary: "A wizard and mentor who guides others through impossible odds.",
    whyQuotable: "His words offer comfort, courage, and a deep understanding of duty.",
    visualPrompt: "A Quipsly with a grey hat and a wooden staff, smoking a tiny pipe.",
    quipslyState: "curious",
    themeIds: ["theme-courage"],
    relatedPersonIds: ["person-samwise-gamgee", "person-jean-luc-picard"],
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
  },
  {
    id: "person-samwise-gamgee",
    slug: "samwise-gamgee",
    name: "Samwise Gamgee",
    displayName: "Samwise Gamgee",
    roles: ["sidekick", "friend"],
    domains: ["loyalty", "friendship", "fantasy"],
    summary: "The ultimate sidekick, embodying unwavering loyalty and quiet strength.",
    whyQuotable: "Sam's quotes capture the essence of friendship, endurance, and hope in dark times.",
    visualPrompt: "A Quipsly with a small frying pan and a very determined expression.",
    quipslyState: "found",
    themeIds: ["theme-courage"],
    relatedPersonIds: ["person-gandalf"],
    imageUrl: "/images/examples/quipsly-person-cosplay-card-grid.png",
  },
] as const;

export const sourceWorks: readonly SourceWorkProjection[] = [
  {
    id: "source-austen-pride-prejudice",
    slug: "pride-and-prejudice",
    title: "Pride and Prejudice",
    type: "book",
    year: "1813",
    creatorName: "Jane Austen",
    publicDomain: true,
    sourceNote:
      "Public-domain novel; exact chapter and edition handling should be added before production citation.",
  },
  {
    id: "source-shelley-frankenstein",
    slug: "frankenstein-1818",
    title: "Frankenstein; or, The Modern Prometheus",
    type: "book",
    year: "1818",
    creatorName: "Mary Shelley",
    publicDomain: true,
    sourceNote:
      "Public-domain novel; quote context should distinguish narrator, creature, and edition.",
  },
  {
    id: "source-shakespeare-hamlet",
    slug: "hamlet",
    title: "Hamlet",
    type: "book",
    year: "c. 1600",
    creatorName: "William Shakespeare",
    publicDomain: true,
    sourceNote:
      "Public-domain play; production records should track act, scene, line, and edition.",
  },
  {
    id: "source-dickinson-complete-poems",
    slug: "tell-all-the-truth-but-tell-it-slant",
    title: "Tell all the truth but tell it slant",
    type: "poem",
    creatorName: "Emily Dickinson",
    publicDomain: true,
    sourceNote:
      "Public-domain poem; production records should track manuscript/editorial variant.",
  },
  {
    id: "source-fdr-first-inaugural",
    slug: "fdr-first-inaugural-address",
    title: "First Inaugural Address",
    type: "speech",
    year: "1933",
    creatorName: "Franklin D. Roosevelt",
    publicDomain: true,
    sourceNote:
      "Public presidential address with clear date, speaker, and venue.",
  },
  {
    id: "source-whitman-song-of-myself",
    slug: "song-of-myself",
    title: "Song of Myself",
    type: "poem",
    year: "1855",
    creatorName: "Walt Whitman",
    publicDomain: true,
    sourceNote:
      "Public-domain poem with multiple editions; exact edition should be explicit.",
  },
  {
    id: "source-douglass-west-india-emancipation",
    slug: "west-india-emancipation-speech",
    title: "West India Emancipation Speech",
    type: "speech",
    year: "1857",
    creatorName: "Frederick Douglass",
    publicDomain: true,
    sourceNote:
      "Public speech; source locator and transcription lineage should be verified before production.",
  },
  {
    id: "source-einstein-saturday-evening-post",
    slug: "what-life-means-to-einstein",
    title: "What Life Means to Einstein",
    type: "interview",
    year: "1929",
    creatorName: "George Sylvester Viereck",
    publicDomain: false,
    sourceNote:
      "Popular interview source. Use short source metadata in public UI until rights and exact citation are reviewed.",
  },
  {
    id: "source-einstein-letter-eduard",
    slug: "einstein-letter-to-eduard",
    title: "Letter to Eduard Einstein",
    type: "letter",
    year: "1930",
    creatorName: "Albert Einstein",
    publicDomain: false,
    sourceNote:
      "Often cited source path for the bicycle quote. Production needs archive locator and rights review.",
  },
  {
    id: "source-einstein-life-interview",
    slug: "life-magazine-einstein-interview",
    title: "LIFE magazine Einstein interview",
    type: "interview",
    year: "1955",
    creatorName: "Albert Einstein",
    publicDomain: false,
    sourceNote:
      "Popular late-life interview source path. Use as attribution context until exact issue/page review is complete.",
  },
  {
    id: "source-einstein-attribution-review",
    slug: "einstein-popular-attribution-review",
    title: "Einstein popular attribution review",
    type: "unknown",
    creatorName: "Unknown",
    publicDomain: false,
    sourceNote:
      "Prototype bucket for viral Einstein-style lines that need source research before being treated as verified.",
  },
  {
    id: "source-parker-unknown",
    slug: "dorothy-parker-curiosity-attribution",
    title: "Popular Dorothy Parker attribution trail",
    type: "unknown",
    creatorName: "Unknown",
    publicDomain: false,
    sourceNote:
      "Placeholder dispute record for a popular attribution that needs source research.",
  },
  {
    id: "source-star-trek-tng",
    slug: "star-trek-tng",
    title: "Star Trek: The Next Generation",
    authorId: "person-jean-luc-picard",
    type: "television",
    genres: ["science fiction", "drama"],
    status: "verified",
  },
  {
    id: "source-lotr-fellowship",
    slug: "lotr-fellowship",
    title: "The Fellowship of the Ring",
    authorId: "person-gandalf",
    type: "book",
    year: "1954",
    genres: ["fantasy"],
    status: "verified",
  },
  {
    id: "source-lotr-two-towers",
    slug: "lotr-two-towers",
    title: "The Two Towers",
    authorId: "person-samwise-gamgee",
    type: "book",
    year: "1954",
    genres: ["fantasy"],
    status: "verified",
  },
] as const;

export const evidence: readonly EvidenceProjection[] = [
  {
    id: "evidence-austen-opening",
    sourceWorkId: "source-austen-pride-prejudice",
    label: "Opening sentence",
    locator: "Chapter 1",
    excerpt: "It is a truth universally acknowledged...",
    evidenceNote:
      "Sample evidence stub. A production record should include edition and archive reference.",
  },
  {
    id: "evidence-shelley-creature",
    sourceWorkId: "source-shelley-frankenstein",
    label: "Creature's declaration",
    locator: "1818 text",
    excerpt: "Beware; for I am fearless, and therefore powerful.",
    evidenceNote:
      "Sample source occurrence for demonstrating speaker/context handling.",
  },
  {
    id: "evidence-hamlet-thinking",
    sourceWorkId: "source-shakespeare-hamlet",
    label: "Hamlet on perception",
    locator: "Act 2, Scene 2",
    excerpt: "There is nothing either good or bad, but thinking makes it so.",
    evidenceNote:
      "Sample play locator; production data should store act, scene, and line edition.",
  },
  {
    id: "evidence-dickinson-slant",
    sourceWorkId: "source-dickinson-complete-poems",
    label: "Poem opening",
    excerpt: "Tell all the truth but tell it slant",
    evidenceNote:
      "Sample poem locator. Dickinson variants need editorial review.",
  },
  {
    id: "evidence-fdr-fear",
    sourceWorkId: "source-fdr-first-inaugural",
    label: "Address opening",
    locator: "March 4, 1933",
    excerpt: "the only thing we have to fear is fear itself",
    evidenceNote:
      "Clear public-address evidence suitable for a high-trust sample record.",
  },
  {
    id: "evidence-whitman-contradict",
    sourceWorkId: "source-whitman-song-of-myself",
    label: "Contradiction passage",
    excerpt: "Do I contradict myself? Very well then I contradict myself",
    evidenceNote:
      "Sample excerpt; production should record edition and section.",
  },
  {
    id: "evidence-douglass-struggle",
    sourceWorkId: "source-douglass-west-india-emancipation",
    label: "Power and struggle passage",
    excerpt: "If there is no struggle there is no progress.",
    evidenceNote:
      "Sample source occurrence; source trail should be verified before production.",
  },
  {
    id: "evidence-einstein-imagination",
    sourceWorkId: "source-einstein-saturday-evening-post",
    label: "Interview attribution",
    excerpt: "Imagination is more important than knowledge.",
    evidenceNote:
      "Sample attribution record for a popular line with rights and citation review still needed.",
  },
  {
    id: "evidence-einstein-bicycle",
    sourceWorkId: "source-einstein-letter-eduard",
    label: "Letter attribution path",
    excerpt: "Life is like riding a bicycle. To keep your balance you must keep moving.",
    evidenceNote:
      "Sample attribution path only. Production needs archive locator, exact wording, translation posture, and rights review.",
  },
  {
    id: "evidence-einstein-questioning",
    sourceWorkId: "source-einstein-life-interview",
    label: "Interview attribution path",
    excerpt: "The important thing is not to stop questioning.",
    evidenceNote:
      "Sample attribution path only. Production needs exact issue, page, and surrounding interview context.",
  },
  {
    id: "evidence-einstein-success-value",
    sourceWorkId: "source-einstein-life-interview",
    label: "Interview attribution path",
    excerpt: "Try not to become a man of success, but rather try to become a man of value.",
    evidenceNote:
      "Sample attribution path only. Production should track exact wording and gendered-language handling.",
  },
  {
    id: "evidence-einstein-mistake-new",
    sourceWorkId: "source-einstein-attribution-review",
    label: "Popular attribution needing source",
    excerpt: "A person who never made a mistake never tried anything new.",
    evidenceNote:
      "Common Einstein attribution in circulation. Keep as needs-review until a stable source occurrence is found.",
  },
  {
    id: "evidence-einstein-simple",
    sourceWorkId: "source-einstein-attribution-review",
    label: "Popular attribution needing source",
    excerpt: "If you can't explain it simply, you don't understand it well enough.",
    evidenceNote:
      "Popular Einstein attribution with an unstable source trail. Prototype should show why this needs review.",
  },
  {
    id: "evidence-einstein-difficulty-opportunity",
    sourceWorkId: "source-einstein-attribution-review",
    label: "Common misattribution candidate",
    excerpt: "In the middle of difficulty lies opportunity.",
    evidenceNote:
      "Frequently attributed to Einstein online, but useful here as a disputed/misattribution demo record.",
  },
  {
    id: "evidence-parker-curiosity",
    sourceWorkId: "source-parker-unknown",
    label: "Unverified common attribution",
    evidenceNote:
      "Deliberately unresolved sample showing how QuipLore should handle popular-but-shaky quotes.",
  },
] as const;

export const variants: readonly QuoteVariantProjection[] = [
  {
    id: "variant-einstein-knowledge",
    text: "Imagination is more important than knowledge. Knowledge is limited. Imagination encircles the world.",
    status: "variant",
    note: "Longer viral versions vary by source and quotation context.",
  },
  {
    id: "variant-parker-curiosity",
    text: "The cure for boredom is curiosity. There is no cure for curiosity.",
    status: "disputed",
    note: "Often attributed to Dorothy Parker; source trail remains unresolved in this sample set.",
  },
  {
    id: "variant-wilde-yourself",
    text: "Be yourself; everyone else is already taken.",
    status: "misattributed",
    note: "A popular quote commonly assigned to Oscar Wilde without a stable source record.",
  },
] as const;

export const quotes: readonly QuoteProjection[] = [
  {
    id: "quote-austen-truth-acknowledged",
    slug: "truth-universally-acknowledged",
    text: "It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.",
    personId: "person-jane-austen",
    sourceWorkId: "source-austen-pride-prejudice",
    evidenceIds: ["evidence-austen-opening"],
    verificationStatus: "verified",
    confidence: 0.98,
    reviewNote:
      "High-confidence public-domain sample; production record still needs edition metadata.",
    contextNote:
      "The line opens the novel with a social claim that the narrative immediately complicates.",
    quipslyNote:
      "Quipsly flags this as a great example of a quote whose humor depends on what follows.",
    themeIds: ["theme-wit", "theme-perception"],
    variantIds: [],
    relatedQuoteIds: ["quote-hamlet-good-bad", "quote-dickinson-slant"],
    merchEligibility: "safe",
    storyHook:
      "A first sentence that acts like a trapdoor: the joke is already moving before the plot begins.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly as a cozy reader in a plum chair with books and tea.",
      spriteCell: "top-center-right",
      spriteColumns: 4,
      mood: "social reader",
      caption: "Quipsly reads the joke, then checks what the novel does next.",
    },
  },
  {
    id: "quote-shelley-fearless-powerful",
    slug: "fearless-and-therefore-powerful",
    text: "Beware; for I am fearless, and therefore powerful.",
    personId: "person-mary-shelley",
    sourceWorkId: "source-shelley-frankenstein",
    evidenceIds: ["evidence-shelley-creature"],
    verificationStatus: "verified",
    confidence: 0.94,
    reviewNote:
      "Public-domain sample; production needs edition and speaker handling before high-confidence display.",
    contextNote:
      "A dramatic character line, not a direct author motto. That distinction should stay visible.",
    quipslyNote:
      "Quipsly would not put this on a mug without the speaker/context badge nearby.",
    themeIds: ["theme-courage", "theme-perception"],
    variantIds: [],
    relatedQuoteIds: ["quote-fdr-fear-itself", "quote-douglass-struggle-progress"],
    merchEligibility: "safe",
    storyHook:
      "The line sounds empowering in isolation, but its source context is more haunted and morally charged.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly in a green cloak holding a lantern on a rocky path.",
      spriteCell: "bottom-center-left",
      spriteColumns: 4,
      mood: "lantern courage",
      caption: "Quipsly keeps the candle near the speaker context.",
    },
  },
  {
    id: "quote-hamlet-good-bad",
    slug: "nothing-good-or-bad",
    text: "There is nothing either good or bad, but thinking makes it so.",
    personId: "person-william-shakespeare",
    sourceWorkId: "source-shakespeare-hamlet",
    evidenceIds: ["evidence-hamlet-thinking"],
    verificationStatus: "verified",
    confidence: 0.96,
    reviewNote:
      "High-confidence Shakespeare sample. Production should add act, scene, line, and edition records.",
    contextNote:
      "A character line from Hamlet, not a universal platform claim from Shakespeare the person.",
    quipslyNote:
      "Quipsly recommends showing the speaker badge whenever Shakespeare cards enter QuipStream.",
    themeIds: ["theme-perception", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-austen-truth-acknowledged", "quote-whitman-contradict"],
    merchEligibility: "safe",
    storyHook:
      "One sentence turns the quote database into theater: who said it matters.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly on a small theater stage with curtain, candle, and prop skull.",
      spriteCell: "top-right",
      spriteColumns: 4,
      mood: "stage context",
      caption: "Quipsly asks who is speaking before the line becomes advice.",
    },
  },
  {
    id: "quote-dickinson-slant",
    slug: "tell-truth-slant",
    text: "Tell all the truth but tell it slant",
    personId: "person-emily-dickinson",
    sourceWorkId: "source-dickinson-complete-poems",
    evidenceIds: ["evidence-dickinson-slant"],
    verificationStatus: "variant",
    confidence: 0.88,
    reviewNote:
      "Public-domain poem sample. Dickinson punctuation and editorial variants require careful handling.",
    contextNote:
      "A compressed poetics of indirectness; exact punctuation can vary by edition.",
    quipslyNote:
      "Quipsly likes this as a perfect Quote Passport demo because tiny wording choices matter.",
    themeIds: ["theme-curiosity", "theme-sourcecraft", "theme-perception"],
    variantIds: [],
    relatedQuoteIds: ["quote-austen-truth-acknowledged", "quote-einstein-imagination"],
    merchEligibility: "safe",
    storyHook:
      "A short line that explains why quote verification needs humility, not just confidence.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly holding a sealed letter with small flowers and writing paper.",
      spriteCell: "bottom-left",
      spriteColumns: 4,
      mood: "slant letter",
      caption: "Quipsly treats punctuation like evidence, not decoration.",
    },
  },
  {
    id: "quote-fdr-fear-itself",
    slug: "fear-itself",
    text: "The only thing we have to fear is fear itself.",
    personId: "person-franklin-roosevelt",
    sourceWorkId: "source-fdr-first-inaugural",
    evidenceIds: ["evidence-fdr-fear"],
    verificationStatus: "verified",
    confidence: 0.99,
    reviewNote:
      "Clear public speech sample with date and source work. Strong early benchmark for verified status.",
    contextNote:
      "A public crisis line from the first inaugural address, not a generic bravery slogan.",
    quipslyNote:
      "Quipsly marks this as a high-trust anchor card for onboarding and API demos.",
    themeIds: ["theme-courage", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-shelley-fearless-powerful", "quote-douglass-struggle-progress"],
    merchEligibility: "safe",
    storyHook:
      "A quote with unusually clean metadata: speaker, place, date, moment, and source all line up.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly stamping an archive record beside a verified check seal.",
      spriteCell: "top-left",
      spriteColumns: 4,
      mood: "source anchor",
      caption: "Quipsly stamps this one as a clean onboarding anchor.",
    },
  },
  {
    id: "quote-whitman-contradict",
    slug: "do-i-contradict-myself",
    text: "Do I contradict myself? Very well then I contradict myself.",
    personId: "person-walt-whitman",
    sourceWorkId: "source-whitman-song-of-myself",
    evidenceIds: ["evidence-whitman-contradict"],
    verificationStatus: "verified",
    confidence: 0.93,
    reviewNote:
      "Public-domain poem sample. Production should track edition and section-level context.",
    contextNote:
      "Often clipped as self-acceptance, but it belongs inside a larger democratic, expansive poem.",
    quipslyNote:
      "Quipsly suggests pairing this with a context foldout rather than a bare share card.",
    themeIds: ["theme-freedom", "theme-perception"],
    variantIds: [],
    relatedQuoteIds: ["quote-hamlet-good-bad", "quote-dickinson-slant"],
    merchEligibility: "safe",
    storyHook:
      "A line about contradiction that gets more interesting when the surrounding poem is visible.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly as a field explorer with cap, magnifier, papers, and compass.",
      spriteCell: "top-center-left",
      spriteColumns: 4,
      mood: "open field",
      caption: "Quipsly follows the clipped line back into the larger poem.",
    },
  },
  {
    id: "quote-douglass-struggle-progress",
    slug: "no-struggle-no-progress",
    text: "If there is no struggle there is no progress.",
    personId: "person-frederick-douglass",
    sourceWorkId: "source-douglass-west-india-emancipation",
    evidenceIds: ["evidence-douglass-struggle"],
    verificationStatus: "attributed",
    confidence: 0.86,
    reviewNote:
      "Strong sample attribution, but production needs exact source trail and transcription review.",
    contextNote:
      "The line is part of an argument about power, demand, and emancipation, not self-help grit.",
    quipslyNote:
      "Quipsly wants the whole paragraph nearby before this becomes a shareable quote card.",
    themeIds: ["theme-freedom", "theme-courage", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-fdr-fear-itself", "quote-whitman-contradict"],
    merchEligibility: "safe",
    storyHook:
      "A line whose moral force depends on the political argument around it.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly carrying a lantern through a dark path with leaves and papers.",
      spriteCell: "bottom-center-left",
      spriteColumns: 4,
      mood: "argument light",
      caption: "Quipsly keeps the broader speech in view.",
    },
  },
  {
    id: "quote-einstein-imagination",
    slug: "imagination-more-important-than-knowledge",
    text: "Imagination is more important than knowledge.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-saturday-evening-post",
    evidenceIds: ["evidence-einstein-imagination"],
    verificationStatus: "attributed",
    confidence: 0.82,
    reviewNote:
      "Popular Einstein attribution sample. Needs source-rights and exact interview-context review.",
    contextNote:
      "A widely repeated line from an interview context; longer versions and paraphrases circulate.",
    quipslyNote:
      "Quipsly treats this as the Einstein page's test case for variants and careful confidence language.",
    themeIds: ["theme-curiosity", "theme-perception"],
    variantIds: ["variant-einstein-knowledge"],
    relatedQuoteIds: ["quote-dickinson-slant", "quote-austen-truth-acknowledged"],
    merchEligibility: "needs-rights-review",
    storyHook:
      "A perfect seed for QuipLore: beloved, useful, source-sensitive, and surrounded by variants.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly holding up a glowing idea bulb beside books and notes.",
      spriteCell: "top-left",
      spriteColumns: 3,
      mood: "idea spark",
      caption: "Quipsly catches the first flicker of imagination.",
    },
  },
  {
    id: "quote-einstein-bicycle",
    slug: "life-like-riding-bicycle",
    text: "Life is like riding a bicycle. To keep your balance you must keep moving.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-letter-eduard",
    evidenceIds: ["evidence-einstein-bicycle"],
    verificationStatus: "attributed",
    confidence: 0.74,
    reviewNote:
      "Popular Einstein attribution with a plausible letter source path. Production needs archive locator and exact wording review.",
    contextNote:
      "A compact resilience metaphor. The prototype treats it as attributed rather than fully verified.",
    quipslyNote:
      "Quipsly pairs this one with a moving-forward visual instead of a generic genius pose.",
    themeIds: ["theme-courage", "theme-perception"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-questioning", "quote-einstein-imagination"],
    merchEligibility: "needs-rights-review",
    storyHook:
      "A quote that feels simple until the source question asks: letter, translation, edition, or paraphrase?",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly studying stars through a telescope with notes nearby.",
      spriteCell: "top-center",
      spriteColumns: 3,
      mood: "balance in motion",
      caption: "Quipsly keeps moving while checking the source trail.",
    },
  },
  {
    id: "quote-einstein-questioning",
    slug: "important-thing-not-stop-questioning",
    text: "The important thing is not to stop questioning.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-life-interview",
    evidenceIds: ["evidence-einstein-questioning"],
    verificationStatus: "attributed",
    confidence: 0.78,
    reviewNote:
      "Commonly tied to a late-life interview source path. Production needs exact issue/page review.",
    contextNote:
      "Useful as a QuipStream onboarding card because it says what discovery is for.",
    quipslyNote:
      "Quipsly marks this as the house rule for the archive: curiosity is allowed, certainty is earned.",
    themeIds: ["theme-curiosity", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-imagination", "quote-dickinson-slant"],
    merchEligibility: "needs-rights-review",
    storyHook:
      "The archive can turn a famous sentence into a habit: keep asking what the wording rests on.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly at a chalkboard with science sketches and chalk.",
      spriteCell: "top-right",
      spriteColumns: 3,
      mood: "question board",
      caption: "Quipsly takes the question back to the board.",
    },
  },
  {
    id: "quote-einstein-success-value",
    slug: "success-and-value",
    text: "Try not to become a person of success, but rather try to become a person of value.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-life-interview",
    evidenceIds: ["evidence-einstein-success-value"],
    verificationStatus: "variant",
    confidence: 0.72,
    reviewNote:
      "Adapted to gender-neutral wording for the prototype. Production must preserve canonical wording and expose any adaptation.",
    contextNote:
      "A useful line for values-based curation, but this card intentionally shows that modernized wording creates a variant.",
    quipslyNote:
      "Quipsly likes the meaning, but the Passport should flag the wording change instead of hiding it.",
    themeIds: ["theme-courage", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-bicycle", "quote-douglass-struggle-progress"],
    merchEligibility: "needs-rights-review",
    storyHook:
      "A quote-card design problem: when inclusive wording helps readability, the source layer still needs the original.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly reading in a plum chair with a lamp, books, and tea.",
      spriteCell: "bottom-left",
      spriteColumns: 3,
      mood: "value study",
      caption: "Quipsly slows down to ask what the quote is for.",
    },
  },
  {
    id: "quote-einstein-mistake-new",
    slug: "never-made-mistake",
    text: "A person who never made a mistake never tried anything new.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-attribution-review",
    evidenceIds: ["evidence-einstein-mistake-new"],
    verificationStatus: "needs-review",
    confidence: 0.45,
    reviewNote:
      "Useful popular attribution, but this seed record deliberately keeps it in needs-review state.",
    contextNote:
      "The product should be able to show a quote people love while making the uncertainty obvious.",
    quipslyNote:
      "Quipsly can still make this charming in the stream, but not high-trust in the archive.",
    themeIds: ["theme-curiosity", "theme-courage"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-questioning", "quote-parker-curiosity"],
    merchEligibility: "do-not-use",
    storyHook:
      "This is the kind of quote that teaches users what a confidence badge means.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly writing notes with a radio microphone and crumpled paper.",
      spriteCell: "bottom-center",
      spriteColumns: 3,
      mood: "working draft",
      caption: "Quipsly leaves room for the useful mistake and the review note.",
    },
  },
  {
    id: "quote-einstein-simple",
    slug: "explain-it-simply",
    text: "If you can't explain it simply, you don't understand it well enough.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-attribution-review",
    evidenceIds: ["evidence-einstein-simple"],
    verificationStatus: "disputed",
    confidence: 0.28,
    reviewNote:
      "Commonly attributed to Einstein, but the source trail is not stable enough for a high-trust card.",
    contextNote:
      "A good demo for how the stream can show attractive quotes without laundering attribution uncertainty.",
    quipslyNote:
      "Quipsly would route this to a disputed Quote Passport before any merch or share-card campaign.",
    themeIds: ["theme-sourcecraft", "theme-wit"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-imagination", "quote-parker-curiosity"],
    merchEligibility: "do-not-use",
    storyHook:
      "A sentence can be useful and still be a poor reference. That tension is the product.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly reclining with orbit sketches and folded paper models.",
      spriteCell: "bottom-right",
      spriteColumns: 3,
      mood: "source doubt",
      caption: "Quipsly enjoys the line, then checks the receipt.",
    },
  },
  {
    id: "quote-einstein-difficulty-opportunity",
    slug: "difficulty-opportunity",
    text: "In the middle of difficulty lies opportunity.",
    personId: "person-albert-einstein",
    sourceWorkId: "source-einstein-attribution-review",
    evidenceIds: ["evidence-einstein-difficulty-opportunity"],
    verificationStatus: "misattributed",
    confidence: 0.18,
    reviewNote:
      "Included as a misattribution demo. Do not present as an Einstein quote without a disputed/misattributed badge.",
    contextNote:
      "This is exactly the kind of viral quote QuipLore should make useful by explaining the attribution problem.",
    quipslyNote:
      "Quipsly treats this as a teachable dead end: pretty card, bright warning label.",
    themeIds: ["theme-courage", "theme-sourcecraft"],
    variantIds: [],
    relatedQuoteIds: ["quote-einstein-simple", "quote-shelley-fearless-powerful"],
    merchEligibility: "do-not-use",
    storyHook:
      "A misquote page can redirect users toward better-sourced courage quotes instead of just saying no.",
    visual: {
      assetSrc: EINSTEIN_QUIPSLY_SPRITES,
      alt: "Einstein-inspired Quipsly with a glowing bulb and archive papers, used as a warning-label contrast.",
      spriteCell: "top-left",
      spriteColumns: 3,
      mood: "bright warning",
      caption: "Quipsly keeps the charm, but refuses to hide the warning.",
    },
  },
  {
    id: "quote-parker-curiosity",
    slug: "cure-for-boredom-curiosity",
    text: "The cure for boredom is curiosity. There is no cure for curiosity.",
    personId: "person-dorothy-parker",
    sourceWorkId: "source-parker-unknown",
    evidenceIds: ["evidence-parker-curiosity"],
    verificationStatus: "disputed",
    confidence: 0.32,
    reviewNote:
      "Intentionally disputed sample. The person link is provisional so the UI can demonstrate uncertainty.",
    contextNote:
      "This quote is often attributed to Dorothy Parker, but the source trail is unstable.",
    quipslyNote:
      "Quipsly uses this to show that a good quote can still be a bad reference record.",
    themeIds: ["theme-curiosity", "theme-wit"],
    variantIds: ["variant-parker-curiosity", "variant-wilde-yourself"],
    relatedQuoteIds: ["quote-einstein-imagination", "quote-dickinson-slant"],
    merchEligibility: "do-not-use",
    storyHook:
      "A misquote/disputed quote page can be useful instead of becoming a dead end.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly in a rust jacket studying scattered notes, warning marks, and question signs.",
      spriteCell: "bottom-center-right",
      spriteColumns: 4,
      mood: "attribution doubt",
      caption: "Quipsly lets the line be interesting without pretending it is settled.",
    },
  },
  {
    id: "quote-picard-mistakes",
    slug: "picard-no-mistakes",
    text: "It is possible to commit no mistakes and still lose. That is not a weakness. That is life.",
    personId: "person-jean-luc-picard",
    sourceWorkId: "source-star-trek-tng",
    evidenceIds: [],
    verificationStatus: "verified",
    confidence: 1.0,
    reviewNote: "Verified from Peak Performance.",
    contextNote: "Picard advising Data after a defeat in a strategy game.",
    quipslyNote: "A perfect quote on resilience.",
    themeIds: ["theme-courage"],
    variantIds: [],
    relatedQuoteIds: [],
    merchEligibility: "safe",
    storyHook: "A reminder that sometimes you do everything right, and things still go wrong.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly offering comfort over a cup of tea.",
      spriteCell: "top-center-right",
      spriteColumns: 4,
      mood: "direct quote",
      caption: "Resilience in leadership.",
    },
  },
  {
    id: "quote-gandalf-time",
    slug: "gandalf-all-we-have-to-decide",
    text: "All we have to decide is what to do with the time that is given us.",
    personId: "person-gandalf",
    sourceWorkId: "source-lotr-fellowship",
    evidenceIds: [],
    verificationStatus: "verified",
    confidence: 1.0,
    reviewNote: "Verified from Fellowship of the Ring.",
    contextNote: "Gandalf comforting Frodo in the Mines of Moria.",
    quipslyNote: "A classic quote on facing difficult circumstances.",
    themeIds: ["theme-courage"],
    variantIds: [],
    relatedQuoteIds: [],
    merchEligibility: "safe",
    storyHook: "When the weight of the world feels too heavy, focus only on what you can control.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly holding a tiny glowing staff.",
      spriteCell: "top-center-right",
      spriteColumns: 4,
      mood: "direct quote",
      caption: "Wisdom in dark places.",
    },
  },
  {
    id: "quote-samwise-good",
    slug: "samwise-some-good-in-this-world",
    text: "There's some good in this world, Mr. Frodo, and it's worth fighting for.",
    personId: "person-samwise-gamgee",
    sourceWorkId: "source-lotr-two-towers",
    evidenceIds: [],
    verificationStatus: "verified",
    confidence: 1.0,
    reviewNote: "Verified from The Two Towers film adaptation.",
    contextNote: "Sam offering hope at the end of their darkest hour in Osgiliath.",
    quipslyNote: "The ultimate sidekick quote about loyalty and hope.",
    themeIds: ["theme-courage"],
    variantIds: [],
    relatedQuoteIds: [],
    merchEligibility: "safe",
    storyHook: "A reminder of why we endure hardships.",
    visual: {
      assetSrc: QUOTE_COMPANION_SPRITES,
      alt: "Quipsly standing bravely with a frying pan.",
      spriteCell: "top-center-right",
      spriteColumns: 4,
      mood: "direct quote",
      caption: "The strength of a loyal friend.",
    },
  },
] as const;

export const lorelistItems: readonly LorelistItemProjection[] = [
  {
    id: "loreitem-1",
    quoteId: "quote-einstein-imagination",
    curatorNote:
      "Start with a quote people know, but make the confidence language visible.",
  },
  {
    id: "loreitem-2",
    quoteId: "quote-dickinson-slant",
    curatorNote:
      "Use Dickinson to show how tiny wording and editorial decisions affect quote trust.",
  },
  {
    id: "loreitem-3",
    quoteId: "quote-austen-truth-acknowledged",
    curatorNote:
      "A funny quote whose meaning depends on narrative setup and social irony.",
  },
  {
    id: "loreitem-4",
    quoteId: "quote-parker-curiosity",
    curatorNote:
      "End with a disputed quote so the collection teaches source skepticism.",
  },
] as const;

export const lorelists: readonly LorelistProjection[] = [
  {
    id: "lorelist-curiosity-without-cliche",
    slug: "curiosity-without-cliche",
    title: "Curiosity Without Cliche",
    description:
      "A starter Lorelist for quotes that reward wonder, source care, and a little suspicion.",
    visibility: "public",
    coverThemeId: "theme-curiosity",
    itemIds: ["loreitem-1", "loreitem-2", "loreitem-3", "loreitem-4"],
    curatorName: "QuipLore Seed Desk",
    arcLabel: "from popular spark to source-aware curiosity",
  },
] as const;

export const starterNest: NestProjection = {
  id: "nest-starter",
  title: "Starter Nest",
  description:
    "A UI-only saved space for the first prototype. Real accounts and sync come later.",
  savedQuoteIds: ["quote-fdr-fear-itself", "quote-dickinson-slant"],
  activeLorelistId: "lorelist-curiosity-without-cliche",
} as const;

export const pageCompanions: readonly PageCompanionProjection[] = [
  {
    id: "companion-bookmark",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly perched on tall bookmarks at the page edge.",
    spriteCell: "top-left",
    spriteColumns: 3,
    placement: "bookmark",
    caption: "Page-edge guide",
  },
  {
    id: "companion-peek",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly peeking over the top of an index card.",
    spriteCell: "top-center",
    spriteColumns: 3,
    placement: "peek",
    caption: "Card-edge peek",
  },
  {
    id: "companion-stack",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly reading on a stack of source papers.",
    spriteCell: "top-right",
    spriteColumns: 3,
    placement: "stack",
    caption: "Reading stack",
  },
  {
    id: "companion-source-tag",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly carrying a blank source tag.",
    spriteCell: "bottom-left",
    spriteColumns: 3,
    placement: "source-tag",
    caption: "Source-tag courier",
  },
  {
    id: "companion-nest",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly asleep in a nest made of quote cards.",
    spriteCell: "bottom-center",
    spriteColumns: 3,
    placement: "nest",
    caption: "Nest keeper",
  },
  {
    id: "companion-compass",
    assetSrc: PAGE_COMPANION_SPRITES,
    alt: "Quipsly waving beside a compass and magnifying glass.",
    spriteCell: "bottom-right",
    spriteColumns: 3,
    placement: "compass",
    caption: "Discovery scout",
  },
] as const;

const themeById = new Map(themes.map((theme) => [theme.id, theme]));
const personById = new Map(people.map((person) => [person.id, person]));
const sourceById = new Map(sourceWorks.map((sourceWork) => [sourceWork.id, sourceWork]));
const evidenceById = new Map(evidence.map((item) => [item.id, item]));
const variantById = new Map(variants.map((variant) => [variant.id, variant]));
const quoteById = new Map(quotes.map((quote) => [quote.id, quote]));
const lorelistItemById = new Map(lorelistItems.map((item) => [item.id, item]));

function requireSeed<T>(value: T | undefined, label: string): T {
  if (!value) {
    throw new Error(`Missing QuipLore seed record: ${label}`);
  }

  return value;
}

export function getThemeById(id: string): ThemeProjection {
  return requireSeed(themeById.get(id), id);
}

export function getPersonBySlug(slug: string): PersonProjection | undefined {
  return people.find((person) => person.slug === slug);
}

export function getSourceBySlug(slug: string): SourceWorkProjection | undefined {
  return sourceWorks.find((source) => source.slug === slug);
}

export function getQuoteBySlug(slug: string): QuoteProjection | undefined {
  return quotes.find((quote) => quote.slug === slug);
}

export function getLorelistBySlug(slug: string): LorelistProjection | undefined {
  return lorelists.find((lorelist) => lorelist.slug === slug);
}

export function getQuoteById(id: string): QuoteProjection {
  return requireSeed(quoteById.get(id), id);
}

export function createQuipCard(quote: QuoteProjection): QuipCardProjection {
  const person = requireSeed(personById.get(quote.personId), quote.personId);
  const sourceWork = requireSeed(sourceById.get(quote.sourceWorkId), quote.sourceWorkId);

  return {
    quote,
    person,
    sourceWork,
    themes: quote.themeIds.map(getThemeById),
  };
}

export function getAllQuipCards(): readonly QuipCardProjection[] {
  return quotes.map(createQuipCard);
}

export function getQuotePassportBySlug(
  slug: string,
): QuotePassportProjection | undefined {
  const quote = getQuoteBySlug(slug);

  if (!quote) {
    return undefined;
  }

  return {
    quote,
    person: requireSeed(personById.get(quote.personId), quote.personId),
    sourceWork: requireSeed(sourceById.get(quote.sourceWorkId), quote.sourceWorkId),
    evidence: quote.evidenceIds.map((id) => requireSeed(evidenceById.get(id), id)),
    variants: quote.variantIds.map((id) => requireSeed(variantById.get(id), id)),
    themes: quote.themeIds.map(getThemeById),
    relatedQuotes: quote.relatedQuoteIds.map(getQuoteById),
  };
}

export function getQuotesForPersonSlug(
  slug: string,
): readonly QuipCardProjection[] {
  const person = getPersonBySlug(slug);

  if (!person) {
    return [];
  }

  return quotes
    .filter((quote) => quote.personId === person.id)
    .map(createQuipCard);
}

export function getRelatedPeople(
  person: PersonProjection,
): readonly PersonProjection[] {
  return person.relatedPersonIds.map((id) => requireSeed(personById.get(id), id));
}

export function getLorelistItems(
  lorelist: LorelistProjection,
): readonly (LorelistItemProjection & { card: QuipCardProjection })[] {
  return lorelist.itemIds.map((id) => {
    const item = requireSeed(lorelistItemById.get(id), id);
    return {
      ...item,
      card: createQuipCard(getQuoteById(item.quoteId)),
    };
  });
}

function formatReviewStatus(status: string): string {
  return status
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getQuoteStoryBySlug(
  slug: string,
): QuoteStoryProjection | undefined {
  const passport = getQuotePassportBySlug(slug);

  if (!passport) {
    return undefined;
  }

  const primaryEvidence = passport.evidence[0];
  const reviewStatus = formatReviewStatus(passport.quote.verificationStatus);
  const sourceLabel = `${passport.sourceWork.title}${
    passport.sourceWork.year ? ` (${passport.sourceWork.year})` : ""
  }`;

  return {
    id: `story-${passport.quote.id}`,
    slug: `${passport.quote.slug}-source-story`,
    quoteId: passport.quote.id,
    title: `The story behind "${passport.quote.shortText ?? passport.quote.text}"`,
    deck: passport.quote.storyHook,
    beats: [
      {
        id: `${passport.quote.id}-story-line`,
        title: "The line people remember",
        body: `The shareable wording is short enough to travel quickly, so QuipLore keeps the quote card attractive while sending the reference work into the Passport.`,
        evidenceIds: [],
      },
      {
        id: `${passport.quote.id}-story-source`,
        title: "Where the archive starts",
        body: primaryEvidence
          ? `The current seed record starts from ${sourceLabel}: ${primaryEvidence.evidenceNote}`
          : `The current seed record starts from ${sourceLabel}, but still needs stronger locator evidence before production use.`,
        evidenceIds: primaryEvidence ? [primaryEvidence.id] : [],
        caution: passport.sourceWork.sourceNote,
      },
      {
        id: `${passport.quote.id}-story-context`,
        title: "The context shift",
        body: passport.quote.contextNote,
        evidenceIds: passport.evidence.map((item) => item.id),
      },
      {
        id: `${passport.quote.id}-story-review`,
        title: "What the badge teaches",
        body: `This record currently carries a ${reviewStatus} badge with ${Math.round(
          passport.quote.confidence * 100,
        )}% confidence. The product should make that state visible anywhere the quote is saved, shared, streamed, or sold.`,
        evidenceIds: passport.evidence.map((item) => item.id),
        caution: passport.quote.reviewNote,
      },
    ],
    sourceCaution: passport.quote.reviewNote,
    videoSeed: `A 45 second QuipLore short could open with the remembered line, cut to Quipsly checking ${sourceLabel}, then show how the badge changes the way the quote should be curated.`,
    recommendedRuntimeSeconds: 45,
  };
}

export function getMerchConceptByQuoteSlug(
  slug: string,
): MerchConceptProjection | undefined {
  const passport = getQuotePassportBySlug(slug);

  if (!passport) {
    return undefined;
  }

  const statusByEligibility: Record<
    QuoteProjection["merchEligibility"],
    MerchConceptProjection["status"]
  > = {
    safe: "draft-ready",
    "needs-rights-review": "rights-review",
    "do-not-use": "blocked",
  };
  const status = statusByEligibility[passport.quote.merchEligibility];
  const sourceRequirement =
    status === "draft-ready"
      ? "Keep attribution, source title, and verification badge visible on public merchandise proofs."
      : status === "rights-review"
        ? "Do not publish merchandise until source rights, exact wording, and attribution posture are reviewed."
        : "Do not sell this quote. Use it only as an educational attribution-warning example.";
  const productTypes: readonly MerchConceptProjection["productTypes"][number][] =
    status === "draft-ready"
      ? ["desk-card", "sticker", "poster", "notebook"]
      : status === "rights-review"
        ? ["internal-review-card"]
        : ["internal-review-card"];

  return {
    id: `merch-${passport.quote.id}`,
    quoteId: passport.quote.id,
    title:
      status === "draft-ready"
        ? `${passport.person.displayName} source-aware keepsake`
        : `${passport.person.displayName} review-only concept`,
    status,
    statusNote:
      status === "draft-ready"
        ? "Prototype can explore product fit, but production should still keep citation metadata visible."
        : status === "rights-review"
          ? "The quote is appealing, but public merchandise needs rights and wording clearance."
          : "The record is intentionally blocked from merchandise because attribution is not safe enough.",
    productTypes,
    audience:
      status === "draft-ready"
        ? "Readers who want a thoughtful quote object with the source trail attached."
        : "Internal reviewers and curators deciding whether the quote can ever become public product material.",
    visualDirection: passport.quote.visual
      ? `${passport.quote.visual.mood}: ${passport.quote.visual.caption}`
      : "Use a Quipsly-led sourcecraft treatment rather than a human portrait.",
    sourceRequirement,
    quipslyAngle:
      status === "blocked"
        ? "Quipsly should visibly refuse to turn charm into false certainty."
        : "Quipsly should make the object feel collectible while keeping the receipt nearby.",
  };
}

function getResearchStatus(quote: QuoteProjection): ResearchQueueStatus {
  if (
    quote.verificationStatus === "misattributed" ||
    quote.verificationStatus === "disputed"
  ) {
    return "blocked";
  }

  if (
    quote.verificationStatus === "needs-review" ||
    quote.verificationStatus === "needs-source" ||
    quote.confidence < 0.6
  ) {
    return "needs-source";
  }

  if (quote.merchEligibility === "do-not-use") {
    return "blocked";
  }

  if (quote.verificationStatus === "variant" || quote.variantIds.length > 0) {
    return "variant-check";
  }

  if (quote.merchEligibility === "needs-rights-review") {
    return "rights-review";
  }

  return "ready-for-review";
}

function getResearchPriority(
  quote: QuoteProjection,
  status: ResearchQueueStatus,
): ResearchPriority {
  if (status === "blocked" && quote.personId === "person-albert-einstein") {
    return "urgent";
  }

  if (status === "blocked" || quote.confidence < 0.5) {
    return "high";
  }

  if (status === "needs-source" || status === "rights-review") {
    return "medium";
  }

  return "low";
}

function createResearchActions(
  quote: QuoteProjection,
  status: ResearchQueueStatus,
): readonly ResearchActionProjection[] {
  const baseActions: ResearchActionProjection[] = [
    {
      id: `${quote.id}-action-wording`,
      kind: "verify-wording",
      title: "Verify exact wording",
      description:
        "Confirm the visible quote text against the best available source occurrence before treating the card as production-ready.",
    },
    {
      id: `${quote.id}-action-public-note`,
      kind: "prepare-public-note",
      title: "Draft public review note",
      description:
        "Turn the research result into a clear user-facing note for the Passport, stream card, and API response.",
    },
  ];

  if (status === "blocked") {
    return [
      {
        id: `${quote.id}-action-misattribution`,
        kind: "check-misattribution",
        title: "Check misattribution trail",
        description:
          "Find the earliest stable occurrence and record why the popular attribution is unsafe.",
      },
      {
        id: `${quote.id}-action-merch-block`,
        kind: "approve-merch-block",
        title: "Lock merch block",
        description:
          "Keep merchandise and share-card campaigns blocked until attribution risk changes.",
      },
      ...baseActions,
    ];
  }

  if (status === "needs-source") {
    return [
      {
        id: `${quote.id}-action-source`,
        kind: "locate-primary-source",
        title: "Locate primary source",
        description:
          "Find archive, edition, page, issue, speech, letter, or transcript metadata strong enough for production citation.",
      },
      ...baseActions,
    ];
  }

  if (status === "rights-review") {
    return [
      {
        id: `${quote.id}-action-rights`,
        kind: "review-rights",
        title: "Review rights and usage",
        description:
          "Check public-domain posture, fair-use limits, source rights, and merchandise eligibility before publishing product concepts.",
      },
      ...baseActions,
    ];
  }

  if (status === "variant-check") {
    return [
      {
        id: `${quote.id}-action-variant`,
        kind: "map-variant",
        title: "Map variants",
        description:
          "Record canonical wording, common variants, modernized text, and what the UI should display in each projection.",
      },
      ...baseActions,
    ];
  }

  return baseActions;
}

function createResearchQueueItem(quote: QuoteProjection): ResearchQueueItemProjection {
  const status = getResearchStatus(quote);
  const card = createQuipCard(quote);
  const sourceWork = requireSeed(sourceById.get(quote.sourceWorkId), quote.sourceWorkId);
  const riskFlags = [
    quote.verificationStatus !== "verified"
      ? `${formatReviewStatus(quote.verificationStatus)} review state`
      : null,
    quote.confidence < 0.8 ? `${Math.round(quote.confidence * 100)}% confidence` : null,
    quote.merchEligibility !== "safe"
      ? `${formatReviewStatus(quote.merchEligibility)} merch posture`
      : null,
    sourceWork.type === "unknown" ? "Unknown source work" : null,
    quote.variantIds.length ? `${quote.variantIds.length} variant record` : null,
    sourceWork.publicDomain === false ? "Rights review likely" : null,
  ].filter(Boolean) as string[];

  return {
    id: `research-${quote.id}`,
    quote: card,
    status,
    priority: getResearchPriority(quote, status),
    confidenceGap: Math.max(0, Math.round((0.95 - quote.confidence) * 100)),
    assignedLane:
      status === "blocked"
        ? "Attribution risk"
        : status === "needs-source"
          ? "Source hunt"
          : status === "rights-review"
            ? "Rights and usage"
            : status === "variant-check"
              ? "Variant map"
              : "Citation polish",
    riskFlags,
    nextActions: createResearchActions(quote, status),
  };
}

export function getResearchQueue(input?: {
  readonly status?: ResearchQueueStatus;
  readonly limit?: number;
}): readonly ResearchQueueItemProjection[] {
  const priorityRank: Record<ResearchPriority, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  const queue = quotes
    .map(createResearchQueueItem)
    .filter((item) => !input?.status || item.status === input.status)
    .sort((a, b) => {
      const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];

      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return b.confidenceGap - a.confidenceGap;
    });

  return input?.limit ? queue.slice(0, input.limit) : queue;
}

export function getResearchQueueStats() {
  const queue = getResearchQueue();

  return {
    total: queue.length,
    urgent: queue.filter((item) => item.priority === "urgent").length,
    blocked: queue.filter((item) => item.status === "blocked").length,
    needsSource: queue.filter((item) => item.status === "needs-source").length,
    rightsReview: queue.filter((item) => item.status === "rights-review").length,
    variantCheck: queue.filter((item) => item.status === "variant-check").length,
    readyForReview: queue.filter((item) => item.status === "ready-for-review").length,
  };
}

export function getResearchPacketByQuoteSlug(
  slug: string,
): ResearchPacketProjection | undefined {
  const passport = getQuotePassportBySlug(slug);
  const story = getQuoteStoryBySlug(slug);
  const merch = getMerchConceptByQuoteSlug(slug);

  if (!passport || !story || !merch) {
    return undefined;
  }

  const queueItem = createResearchQueueItem(passport.quote);

  return {
    id: `packet-${passport.quote.id}`,
    queueItem,
    passport,
    story,
    merch,
    sourceChecklist: [
      "Canonical quote text is stored separately from share-card copy.",
      "Attribution is attached to quote, person, source work, evidence, and review state together.",
      "Evidence records need locator, edition/transcript lineage, and excerpt posture before production.",
      "Variants and misattributions must remain visible in every public projection.",
      "Merch and story use inherit review state instead of overriding it.",
    ],
    decisionLog: [
      `Current review state: ${formatReviewStatus(passport.quote.verificationStatus)}.`,
      `Current confidence: ${Math.round(passport.quote.confidence * 100)}%.`,
      `Research lane: ${queueItem.assignedLane}.`,
      `Merch posture: ${formatReviewStatus(passport.quote.merchEligibility)}.`,
    ],
    databaseWritePlan: [
      "Quote row stores canonical text, normalized text, language, review state, confidence, and merch eligibility.",
      "Attribution row joins quote, person, source work, evidence set, role, certainty, and public note.",
      "Evidence row stores source locator, citation text, rights posture, excerpt policy, and transcript/archive provenance.",
      "Variant row stores alternate wording, normalization key, relation type, and misattribution status.",
      "Review event row stores researcher, decision, reason, createdAt, and rollback pointer.",
      "Embedding jobs run from approved quote/source text projections, not from mutable UI cards.",
    ],
  };
}

export function getQuipStreamCards(
  mode: StreamMode = "for-you",
): readonly QuipStreamCardProjection[] {
  const modeFiltered = quotes.filter((quote) => {
    if (mode === "verified") {
      return quote.verificationStatus === "verified";
    }

    if (mode === "by-theme") {
      return quote.themeIds.includes("theme-curiosity");
    }

    if (mode === "by-person") {
      return quote.personId === "person-albert-einstein";
    }

    return true;
  });

  return modeFiltered.map((quote, index) => {
    const card = createQuipCard(quote);
    const sourceReason =
      mode === "verified"
        ? "High-trust source trail"
        : mode === "by-theme"
          ? "Curiosity trail"
          : mode === "by-person"
            ? "Focused person stream"
            : quote.verificationStatus === "disputed"
              ? "Source-skepticism test"
              : "Mixed discovery seed";

    return {
      ...card,
      streamReason: sourceReason,
      rank: index + 1,
      mode,
    };
  });
}

export function getPersonThemes(person: PersonProjection): readonly ThemeProjection[] {
  return person.themeIds.map(getThemeById);
}
