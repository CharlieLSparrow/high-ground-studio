import SwiftUI

struct ProductAssumptionsView: View {
    @State private var selectedLessonTag: LessonTag = .all
    @State private var lessonSort: LessonSort = .newest

    private let assumptions: [ProductAssumption] = [
        ProductAssumption(
            title: "Nest is the collaborative source of truth",
            summary: "Projects, access, publishing state, chat, and shared episode truth belong in Nest. The Mac app should not become a second private universe.",
            implication: "Mac features should sync or stage toward Nest instead of inventing hidden local-only truth."
        ),
        ProductAssumption(
            title: "Mac owns local media muscle",
            summary: "The native app is where huge files, proxies, local playback, Premiere rescue, proof renders, and device-specific workflows belong.",
            implication: "Use native file access and local processing when web workflows would create anxiety, waiting, or brittle browser behavior."
        ),
        ProductAssumption(
            title: "Skipped ranges are edit decisions, not missing data",
            summary: "Premiere rescue keeps the full timeline with inactive ranges preserved, so cuts remain inspectable and reversible.",
            implication: "A finished edit can hide skipped gaps, but the editor should always make them visible when we need to inspect or adjust."
        ),
        ProductAssumption(
            title: "Everything should reduce systems anxiety",
            summary: "Transparency matters more than judgment. The app should show what is linked, available, blocked, partial, or local without grading the user's process.",
            implication: "Avoid fake red/yellow/green quality gates unless they directly answer what the user can safely do next."
        ),
        ProductAssumption(
            title: "AI is allowed to draft, but the work should stay inspectable",
            summary: "Quipsly should not be preachy about AI writing. The product value is making sources, structure, revisions, and choices visible enough that users stay in command.",
            implication: "Prefer ledgers, examples, citations, reversible drafts, and human approval flows over hidden black-box mutation."
        ),
        ProductAssumption(
            title: "Native familiarity beats cleverness",
            summary: "When a feature can feel like a normal Mac editor, it should. Novel Quipsly ideas need to sit inside familiar windows, menus, sidebars, commands, and inspectors.",
            implication: "If a clever interaction makes the app harder to trust, simplify it or move it behind progressive disclosure."
        ),
    ]

    private let challengeTriggers: [String] = [
        "A local shortcut creates a second source of truth that will fight collaboration later.",
        "A validation badge starts judging creative rigor instead of explaining what is available.",
        "A feature works in a smoke harness but cannot be understood by someone trying to edit an episode under pressure.",
        "A workflow depends on chat-history context instead of being visible inside Quipsly.",
        "A web/native split causes login, file access, or media playback to feel haunted.",
    ]

    private let lessons: [ProductLesson] = [
        ProductLesson(
            title: "A healthy revision is not live until traffic reaches it",
            learnedAt: Date(timeIntervalSince1970: 1_781_053_200),
            tags: [.devops, .cloud, .qa],
            summary: "Nest login stayed broken after multiple healthy Cloud Run revisions because traffic was pinned to an older revision.",
            implication: "Deployment validation must check both revision readiness and live traffic routing. In Google Cloud terms, building and deploying are not the same as serving."
        ),
        ProductLesson(
            title: "Canonical public origin belongs at the auth boundary",
            learnedAt: Date(timeIntervalSince1970: 1_781_052_900),
            tags: [.development, .cloud, .support],
            summary: "Auth.js could render internal Cloud Run listener URLs into the sign-in page when the route did not own the public Nest origin.",
            implication: "OAuth flows should be tested from the user-facing domain, including rendered form actions and provider redirect URLs, not just app health endpoints."
        ),
        ProductLesson(
            title: "State truth and visual truth are not the same thing",
            learnedAt: Date(timeIntervalSince1970: 1_781_022_690),
            tags: [.development, .qa, .mac],
            summary: "The Episode Editor snapshot passed while the screenshot briefly captured the launch shell. A model can be correct before the UI has finished painting.",
            implication: "When UI trust matters, validate both the state contract and the user-visible artifact. Avoid declaring victory from JSON alone."
        ),
        ProductLesson(
            title: "Classify source blockers by user action",
            learnedAt: Date(timeIntervalSince1970: 1_781_022_320),
            tags: [.support, .media, .product],
            summary: "Missing media became calmer once it was grouped into download known files, choose replacements, already reachable, and review-only.",
            implication: "Support-friendly software translates internal failure modes into the next safe human action."
        ),
        ProductLesson(
            title: "Launch readiness should not wait for heavyweight hydration",
            learnedAt: Date(timeIntervalSince1970: 1_781_020_700),
            tags: [.devops, .mac, .development],
            summary: "The Mac app could take too long to report visible-window readiness when the full editor attached before the shell came forward.",
            implication: "Bring up the stable shell first, then hydrate expensive content. This mirrors cloud readiness probes: answer 'can receive traffic' before all warm caches finish."
        ),
        ProductLesson(
            title: "Skipped ranges are preserved decisions",
            learnedAt: Date(timeIntervalSince1970: 1_781_018_900),
            tags: [.editing, .data, .product],
            summary: "Premiere rescue should keep the full timeline and mark removed sections inactive instead of deleting them.",
            implication: "A non-destructive editor keeps the dataset richer, makes AI assistance safer, and gives humans a rollback path without turning the UI into archaeology."
        ),
        ProductLesson(
            title: "Tests should prove the promise, not the implementation trivia",
            learnedAt: Date(timeIntervalSince1970: 1_781_016_600),
            tags: [.qa, .devops, .product],
            summary: "The highest-value smoke is whether Episodes 1-3 open, show active/inactive ranges, expose source blockers, and preserve Play Edit semantics.",
            implication: "Good validation is built around user promises. Internal markers help, but only if they serve a real workflow."
        ),
        ProductLesson(
            title: "No fake quality gates",
            learnedAt: Date(timeIntervalSince1970: 1_780_746_600),
            tags: [.product, .ux],
            summary: "The product should show what is available and linked without judging whether the user's creative or research process is rigorous enough.",
            implication: "Transparency reduces systems anxiety. Judgment-flavored badges create bureaucracy and can accidentally become hostile."
        ),
        ProductLesson(
            title: "AI drafting is allowed; hidden mutation is the danger",
            learnedAt: Date(timeIntervalSince1970: 1_780_660_800),
            tags: [.ai, .product, .writing],
            summary: "Quipsly should not ban AI writing or rewrites. The safeguard is provenance, inspectability, reversible actions, and human ownership.",
            implication: "The product position is 'more than a black box,' not 'no black box allowed.'"
        ),
        ProductLesson(
            title: "One repeatable entrypoint beats clever command piles",
            learnedAt: Date(timeIntervalSince1970: 1_781_021_500),
            tags: [.devops, .cloud, .development],
            summary: "The Mac app is healthier when build, launch, and verification go through the project-owned script instead of scattered ad hoc commands.",
            implication: "This is the same discipline as CI/CD on Google Cloud: a boring, repeatable path makes failures diagnosable."
        ),
    ]

    private var visibleLessons: [ProductLesson] {
        let filtered = selectedLessonTag == .all
            ? lessons
            : lessons.filter { $0.tags.contains(selectedLessonTag) }

        switch lessonSort {
        case .newest:
            return filtered.sorted { $0.learnedAt > $1.learnedAt }
        case .oldest:
            return filtered.sorted { $0.learnedAt < $1.learnedAt }
        case .title:
            return filtered.sorted { $0.title.localizedCaseInsensitiveCompare($1.title) == .orderedAscending }
        case .tagCount:
            return filtered.sorted {
                if $0.tags.count == $1.tags.count {
                    return $0.learnedAt > $1.learnedAt
                }
                return $0.tags.count > $1.tags.count
            }
        }
    }

    private var lessonFeedSummary: String {
        if selectedLessonTag == .all {
            return "\(lessons.count) lessons across \(lessonTagCount) tags"
        }
        return "\(visibleLessons.count) \(selectedLessonTag.label.lowercased()) lessons"
    }

    private var lessonTagCount: Int {
        Set(lessons.flatMap(\.tags)).count
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                hero

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 340), spacing: 14)], spacing: 14) {
                    ForEach(assumptions) { assumption in
                        assumptionCard(assumption)
                    }
                }

                challengePanel

                lessonsLearnedFeed
            }
            .padding(28)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(QuipslyBackground())
        .accessibilityIdentifier("product-assumptions-root")
    }

    private var hero: some View {
        HStack(alignment: .top, spacing: 16) {
            ZStack {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [.quipslyClayTeal.opacity(0.95), .quipslyBurntOrange.opacity(0.78)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "list.bullet.clipboard.fill")
                    .font(.system(size: 30, weight: .bold))
                    .foregroundStyle(.white)
            }
            .frame(width: 58, height: 58)

            VStack(alignment: .leading, spacing: 8) {
                Text("Quipsly Product Assumptions")
                    .font(.largeTitle.bold())
                Text("The current bets we are building from. These are not commandments; they are visible working assumptions so we can evolve the product without accidentally hardening a bad idea.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(20)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(.white.opacity(0.08))
        }
    }

    private func assumptionCard(_ assumption: ProductAssumption) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(assumption.title, systemImage: "sparkles")
                .font(.headline)
                .foregroundStyle(.primary)

            Text(assumption.summary)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Divider()

            Text("Build implication")
                .font(.caption.bold())
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(.quipslyClayTeal)
            Text(assumption.implication)
                .font(.callout)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, minHeight: 210, alignment: .topLeading)
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.white.opacity(0.07))
        }
    }

    private var challengePanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("When Codex should challenge the path", systemImage: "wand.and.stars.inverse")
                .font(.title2.bold())

            Text("This is the place for me to be useful without becoming a little metal dictator. If one of these triggers appears, I should label the tension plainly, propose a safer product direction, and keep building instead of turning the whole sprint into bureaucracy.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(challengeTriggers, id: \.self) { trigger in
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "arrow.turn.down.right")
                        .foregroundStyle(.orange)
                    Text(trigger)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.orange.opacity(0.18))
        }
    }

    private var lessonsLearnedFeed: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Lessons learned feed", systemImage: "books.vertical.fill")
                        .font(.title2.bold())

                    Text(lessonFeedSummary)
                        .font(.caption.bold())
                        .textCase(.uppercase)
                        .tracking(0.8)
                        .foregroundStyle(.quipslyClayTeal)
                        .accessibilityIdentifier("product-lessons-learned-summary")
                }

                Spacer(minLength: 12)

                Picker("Tag", selection: $selectedLessonTag) {
                    ForEach(LessonTag.allCases) { tag in
                        Text(tag.label).tag(tag)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: 190)
                .accessibilityIdentifier("product-lessons-tag-picker")

                Picker("Sort", selection: $lessonSort) {
                    ForEach(LessonSort.allCases) { sort in
                        Text(sort.label).tag(sort)
                    }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: 190)
                .accessibilityIdentifier("product-lessons-sort-picker")
            }

            Text("A running product-and-engineering memory for the stuff we learn the hard way. These are intentionally tagged so we can build a real searchable feed later without losing the trail.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            lessonCapturePattern

            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(visibleLessons) { lesson in
                    lessonCard(lesson)
                }
            }
        }
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(.quipslyClayTeal.opacity(0.18))
        }
        .accessibilityIdentifier("product-lessons-learned-feed")
    }

    private var lessonCapturePattern: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "square.and.pencil")
                .font(.title3.bold())
                .foregroundStyle(.orange)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 8) {
                Text("How we add lessons")
                    .font(.headline)

                Text("Capture the real event, tag the affected system, and write the next safer default. Lessons should reduce future anxiety without becoming new dogma.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 8) {
                    lessonPatternPill("Observed")
                    lessonPatternPill("Changed")
                    lessonPatternPill("Next safer default")
                }
            }
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.orange.opacity(0.16))
        }
        .accessibilityIdentifier("product-lessons-capture-pattern")
    }

    private func lessonPatternPill(_ label: String) -> some View {
        Text(label)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.orange.opacity(0.14), in: Capsule())
            .foregroundStyle(.orange)
    }

    private func lessonCard(_ lesson: ProductLesson) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(lesson.title)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 10)

                Text(lesson.learnedAt, style: .date)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(lesson.summary)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(lesson.implication)
                .font(.callout.weight(.medium))
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                ForEach(lesson.tags) { tag in
                    Text(tag.label)
                        .font(.caption.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(tag.color.opacity(0.18), in: Capsule())
                        .foregroundStyle(tag.color)
                }
            }
        }
        .padding(14)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(.white.opacity(0.07))
        }
    }
}

private struct ProductAssumption: Identifiable {
    let id = UUID()
    let title: String
    let summary: String
    let implication: String
}

private struct ProductLesson: Identifiable {
    let id = UUID()
    let title: String
    let learnedAt: Date
    let tags: [LessonTag]
    let summary: String
    let implication: String
}

private enum LessonSort: String, CaseIterable, Identifiable {
    case newest
    case oldest
    case title
    case tagCount

    var id: String { rawValue }

    var label: String {
        switch self {
        case .newest:
            return "Newest first"
        case .oldest:
            return "Oldest first"
        case .title:
            return "Title A-Z"
        case .tagCount:
            return "Most tagged"
        }
    }
}

private enum LessonTag: String, CaseIterable, Identifiable {
    case all
    case ai
    case cloud
    case data
    case development
    case devops
    case editing
    case mac
    case media
    case product
    case qa
    case support
    case ux
    case writing

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all:
            return "All tags"
        case .ai:
            return "AI"
        case .cloud:
            return "Cloud"
        case .data:
            return "Data"
        case .development:
            return "Development"
        case .devops:
            return "DevOps"
        case .editing:
            return "Editing"
        case .mac:
            return "Mac"
        case .media:
            return "Media"
        case .product:
            return "Product"
        case .qa:
            return "QA"
        case .support:
            return "Support"
        case .ux:
            return "UX"
        case .writing:
            return "Writing"
        }
    }

    var color: Color {
        switch self {
        case .all:
            return .secondary
        case .ai:
            return .purple
        case .cloud:
            return .blue
        case .data:
            return .green
        case .development:
            return .quipslyClayTeal
        case .devops:
            return .orange
        case .editing:
            return .pink
        case .mac:
            return .cyan
        case .media:
            return .red
        case .product:
            return .yellow
        case .qa:
            return .mint
        case .support:
            return .indigo
        case .ux:
            return .brown
        case .writing:
            return .primary
        }
    }
}
