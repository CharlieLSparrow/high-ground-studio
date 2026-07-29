import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#endif

struct Episode4CutIntelligenceBoardView: View {
    private static let startHerePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/latest-episode4-start-here.json"
    private static let applyPreviewPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-apply-preview/latest-episode4-apply-preview.json"
    private static let sourceClipIntakePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-intake/latest-episode4-source-clip-intake.json"
    private static let sourceClipCueReviewPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-clip-cue-review/latest-episode4-source-clip-cue-review.json"
    private static let editIntelligencePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence/latest-episode4-edit-intelligence.json"
    private static let editReviewLedgerPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-intelligence-review/latest-episode4-edit-review-ledger.json"
    private static let editRehearsalPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-edit-rehearsal/latest-episode4-edit-rehearsal.json"
    private static let watchedSourceRecoveryPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-watched-source-recovery-packet/latest-episode4-watched-source-recovery-packet.json"
    private static let sourcePlaceholderWorkbenchPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-source-placeholder-workbench/latest-episode4-source-placeholder-workbench.json"
    private static let youtubeStandardRecipePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe/latest-episode4-youtube-standard-recipe.json"
    private static let youtubeRecipeReviewPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe-review/latest-episode4-youtube-standard-recipe-review-ledger.json"
    private static let recipeProofListenQueuePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-queue.json"
    private static let recipeProofListenNextPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-next.json"
    private static let sourceDropPath = "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"

    @State private var snapshot = Episode4CutIntelligenceSnapshot.empty
    @State private var lastLoadedAt: Date?
    @State private var statusNote = "Load the latest Episode 4 intelligence surfaces."
    @State private var proofListenReviewer = "Codex"
    @State private var proofListenDecision = "needs-listen"
    @State private var proofListenNote = "Proof-listened: add what changed your mind."
    @State private var proofListenAudioNote = ""
    @State private var proofListenVisualNote = ""
    @State private var proofListenCadenceNote = ""
    @State private var proofListenComposerOperationId = ""

    fileprivate static let proofListenDecisionOptions = [
        "needs-listen",
        "refine",
        "keep",
        "reject",
        "hold",
        "needs-source",
        "needs-visual-review"
    ]

    private var activeSourceDropPath: String {
        snapshot.sourceClipCueReviewDropFolder.isEmpty ? Self.sourceDropPath : snapshot.sourceClipCueReviewDropFolder
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            QuipslySectionHeader(
                eyebrow: "Episode 4 Control Room",
                title: "Transcript to edit, without pretending",
                detail: "One place to see transcript readiness, source-clip gaps, proposal review, and apply-preview state. Read-only; no timeline writes.",
                systemImage: "point.3.connected.trianglepath.dotted",
                tint: QuipslyStudioTheme.creekMist,
                compact: true
            )

            actionStrip

            if snapshot.sourceClipIntakeFiles == 0 || snapshot.applyCounts.blocked > 0 {
                currentBlockerCard
            }

            if let next = snapshot.nextActions.first {
                nextActionCard(next)
            }

            if snapshot.hasCutStyleGuide {
                cutStyleGuideCard
            }

            if snapshot.hasEditRehearsal {
                editRehearsalCard
            }

            if !snapshot.applyOperations.isEmpty || snapshot.applyCounts.hasAnySignal {
                applyPreviewCard
            }

            if snapshot.hasYouTubeStandardRecipe {
                youtubeStandardRecipeCard
            }

            if snapshot.hasYouTubeRecipeReviewLedger {
                youtubeRecipeReviewCard
            }

            if snapshot.hasRecipeProofListenQueue {
                recipeProofListenQueueCard
            }

            if snapshot.hasRecipeProofListenNext {
                recipeProofListenNextCard
            }

            if !snapshot.clipRecoveryItems.isEmpty {
                clipRecoveryCard
            }

            if snapshot.cards.isEmpty {
                emptyCard
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(snapshot.cards) { card in
                        artifactCard(card)
                    }
                }
            }

            truthFooter
        }
        .padding(10)
        .background(QuipslyStudioTheme.mossGlassGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .onAppear(perform: reload)
        .accessibilityIdentifier("quipsly.cutIntelligence.episode4ControlRoom")
        .accessibilityLabel("Episode 4 Control Room. Read-only cut intelligence, source clip intake, review ledger, and apply preview state.")
    }

    private var actionStrip: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Button {
                    reload()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Reload latest Episode 4 start-here and apply-preview JSON artifacts.")

                Button {
                    openPath(snapshot.startHerePath)
                } label: {
                    Label("Open board", systemImage: "safari")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.startHerePath.isEmpty)
                .help("Open the latest Episode 4 Start Here board.")

                Button {
                    copyText("./script/agentctl.sh episode4-source-clip-review --extract-audio && ./script/agentctl.sh episode4-source-clip-intake && ./script/agentctl.sh episode4-apply-preview && ./script/agentctl.sh episode4-source-placeholder-workbench && ./script/agentctl.sh episode4-host-spine-duration-workbench && ./script/agentctl.sh episode4-youtube-standard-recipe && ./script/agentctl.sh episode4-youtube-recipe-review-ledger && ./script/agentctl.sh episode4-recipe-proof-listen-queue && ./script/agentctl.sh episode4-recipe-proof-listen-next --markdown && ./script/agentctl.sh episode4-start-here")
                } label: {
                    Label("Copy refresh command", systemImage: "terminal")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Copy the safe agent command to regenerate cue review, intake, apply preview, and start-here boards.")
            }

            HStack(spacing: 6) {
                Button {
                    revealPath(Self.sourceDropPath)
                } label: {
                    Label("Reveal clip dropbox", systemImage: "folder")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Reveal where likely Episode 4 watched/source clips should be dropped.")

                Button {
                    copyText(Self.sourceDropPath)
                } label: {
                    Label("Copy drop path", systemImage: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                Button {
                    openPath(snapshot.sourcePlaceholderWorkbenchPath)
                } label: {
                    Label("Open placeholders", systemImage: "doc.text.magnifyingglass")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.sourcePlaceholderWorkbenchPath.isEmpty)
                .help("Open the source-placeholder workbench: what the missing clip is supposed to do and what remains safe now.")

                Button {
                    openPath(snapshot.youtubeRecipePath)
                } label: {
                    Label("Open recipe", systemImage: "map")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.youtubeRecipePath.isEmpty)
                .help("Open the current metadata-only 35-45 minute Episode 4 recipe.")
            }

            Text(statusNote)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var currentBlockerCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Current Episode 4 blocker", systemImage: "exclamationmark.magnifyingglass")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text(snapshot.sourceClipIntakeStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.sourceClipIntakeFiles == 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.moss)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            Text("Clip-weave can stay smart without becoming fake: source-required edit proposals remain blocked until a real watched/source clip is dropped and matched.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("dropbox files", "\(snapshot.sourceClipIntakeFiles)", snapshot.sourceClipIntakeFiles == 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.moss)
                metricPill("cue matched", "\(snapshot.sourceClipIntakeCueMatched)", snapshot.sourceClipIntakeCueMatched > 0 ? QuipslyStudioTheme.moss : QuipslyStudioTheme.sage)
                metricPill("cue audio", "\(snapshot.sourceClipCueReviewAudioCount)", snapshot.sourceClipCueReviewAudioCount > 0 ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.sage)
            }

            if snapshot.sourceClipIntakeFiles == 0 && snapshot.sourceClipCueReviewCount > 0 {
                Text("No watched/source clips are in the dropbox yet. Listen to the cue audio, identify the clip we watched, then drop the real media file into the folder below with the cue ID in the filename.")
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if snapshot.hasCueReviewPrompt {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Label("First cue to identify", systemImage: "ear")
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.creekMist)
                        Spacer()
                        Text("\(snapshot.sourceClipCueReviewAudioCount) audio window(s)")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    Text(snapshot.sourceClipCueReviewFirstPrompt)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)

                    if !snapshot.sourceClipCueReviewFirstAudioPath.isEmpty {
                        Text(snapshot.sourceClipCueReviewFirstAudioPath)
                            .font(.caption2.monospaced())
                            .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.88))
                            .lineLimit(1)
                            .truncationMode(.middle)
                    }

                    HStack(spacing: 6) {
                        Button {
                            copyText(snapshot.sourceClipCueReviewFirstPrompt)
                        } label: {
                            Text("Copy prompt")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(snapshot.sourceClipCueReviewFirstPrompt.isEmpty)

                        Button {
                            copyText(snapshot.sourceClipCueReviewFirstAudioPath)
                        } label: {
                            Text("Copy audio path")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(snapshot.sourceClipCueReviewFirstAudioPath.isEmpty)
                    }
                }
                .padding(8)
                .background(QuipslyStudioTheme.creekMist.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            if let cue = snapshot.primaryMissingCue {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(cue.cueId)
                            .font(.caption2.monospaced())
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.honey)
                        Text(cue.confidenceLabel)
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(cue.confidenceColor)
                        Spacer()
                        Text(cue.timeWindow)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(QuipslyStudioTheme.creekMist)
                    }

                    Text(cue.evidencePreview.isEmpty ? "No transcript evidence found yet." : cue.evidencePreview)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("Suggested filename: \(cue.filenameSuggestion)")
                        .font(.caption2.monospaced())
                        .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.88))
                        .lineLimit(2)
                        .truncationMode(.middle)

                    HStack(spacing: 6) {
                        Button {
                            copyText(cue.filenameSuggestion)
                        } label: {
                            Text("Copy name")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)

                        Button {
                            copyText(activeSourceDropPath)
                        } label: {
                            Text("Copy dropbox")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }
                }
                .padding(8)
                .background(QuipslyStudioTheme.panel.opacity(0.44))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.sourceClipRecoveryBoardPath.isEmpty ? snapshot.sourceClipIntakePath : snapshot.sourceClipRecoveryBoardPath)
                } label: {
                    Label("Open recovery board", systemImage: "checklist")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.sourceClipRecoveryBoardPath.isEmpty && snapshot.sourceClipIntakePath.isEmpty)

                Button {
                    openPath(snapshot.sourceClipCueReviewPath)
                } label: {
                    Label("Hear cue windows", systemImage: "waveform")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.sourceClipCueReviewPath.isEmpty)
            }

            HStack(spacing: 6) {
                Button {
                    revealPath(activeSourceDropPath)
                } label: {
                    Label("Reveal dropbox", systemImage: "folder")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke((snapshot.sourceClipIntakeFiles == 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.moss).opacity(0.26), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var cutStyleGuideCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label("Human-feeling cut style", systemImage: "wand.and.stars.inverse")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text(snapshot.editIntelligenceStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }

            Text("Use these rules while reviewing suggested cuts. They protect warmth, cadence, and source truth before any SHOW/SKIP/source metadata is written.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let short = snapshot.topShortCandidate {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Label("Top short candidate", systemImage: "rectangle.portrait.on.rectangle.portrait")
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.creekMist)
                        Spacer()
                        Text(short.timeLabel)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    Text(short.summary)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .fixedSize(horizontal: false, vertical: true)

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                        metricPill("hook", short.hookType, QuipslyStudioTheme.honey)
                        metricPill("captions", short.captionDensity, QuipslyStudioTheme.creekMist)
                        metricPill("pacing", short.pacingRisk, QuipslyStudioTheme.lichen)
                        metricPill("platforms", short.platformFitSummary, QuipslyStudioTheme.moss)
                    }

                    Text(short.captionGuidance)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if let review = snapshot.topShortReview {
                        Divider()
                            .overlay(QuipslyStudioTheme.creekMist.opacity(0.22))

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                            metricPill("review", review.statusLabel, review.statusColor)
                            metricPill("decision", review.decisionLabel, review.decisionColor)
                            metricPill("reviewer", review.reviewerLabel, QuipslyStudioTheme.sage)
                            metricPill("missing notes", review.missingLaneSummary, review.missingLaneColor)
                        }

                        if !review.targetedNoteSummary.isEmpty {
                            Text(review.targetedNoteSummary)
                                .font(.caption2)
                                .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.9))
                                .lineLimit(4)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            Text("No hook/caption/platform/framing notes recorded yet. Keep the candidate visible, but do not treat it as taste-trained.")
                                .font(.caption2)
                                .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.9))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
                .padding(8)
                .background(QuipslyStudioTheme.creekMist.opacity(0.10))
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            ForEach(snapshot.cutStylePrinciples.prefix(3)) { principle in
                VStack(alignment: .leading, spacing: 4) {
                    Text(principle.label)
                        .font(.caption)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.lichen)
                    Text(principle.rule)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Risk: \(principle.riskIfIgnored)")
                        .font(.caption2)
                        .foregroundStyle(QuipslyStudioTheme.clay.opacity(0.88))
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
                .background(QuipslyStudioTheme.panel.opacity(0.38))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            if !snapshot.cutStyleTechniques.isEmpty {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    ForEach(snapshot.cutStyleTechniques.prefix(4)) { technique in
                        VStack(alignment: .leading, spacing: 3) {
                            Text(technique.label)
                                .font(.caption2)
                                .fontWeight(.black)
                                .foregroundStyle(QuipslyStudioTheme.honey)
                            Text(technique.defaultRange.isEmpty ? "Review before applying" : technique.defaultRange)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                            Text(technique.reviewQuestion)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(QuipslyStudioTheme.creekMist.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
            }

            if !snapshot.cutStyleNotAllowed.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Not allowed yet")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.clay)
                    ForEach(snapshot.cutStyleNotAllowed.prefix(3), id: \.self) { rule in
                        Text("• \(rule)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(8)
                .background(QuipslyStudioTheme.clay.opacity(0.09))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.editIntelligencePath)
                } label: {
                    Label("Open edit board", systemImage: "rectangle.and.text.magnifyingglass")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.editIntelligencePath.isEmpty)

                Button {
                    copyText(snapshot.cutStyleSummary)
                } label: {
                    Label("Copy rules", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.26), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var editRehearsalCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Edit rehearsal", systemImage: "figure.socialdance")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                Spacer()
                Text(snapshot.editRehearsalStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.editRehearsalMoves > 0 ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            Text("A rehearsal is the safe bridge between an interesting suggestion and a real edit decision: try the move, protect cadence, then record review notes before apply-preview.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("moves", "\(snapshot.editRehearsalMoves)", QuipslyStudioTheme.creekMist)
                metricPill("unreviewed", "\(snapshot.editRehearsalUnreviewedMoves)", snapshot.editRehearsalUnreviewedMoves > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss)
                metricPill("source needed", "\(snapshot.editRehearsalSourceRequiredMoves)", snapshot.editRehearsalSourceRequiredMoves > 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.sage)
            }

            if let move = snapshot.topRehearsalMove {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(move.proposalId)
                            .font(.caption2.monospaced())
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.honey)
                        Text(move.kindLabel)
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(move.kindColor)
                        Spacer()
                        Text(move.timeLabel)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }

                    Text(move.wouldCreate)
                        .font(.caption)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.lichen)

                    Text(move.programMove)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("Guardrail: \(move.cadenceGuardrail)")
                        .font(.caption2)
                        .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.92))
                        .lineLimit(4)
                        .fixedSize(horizontal: false, vertical: true)

                    if !move.reviewQuestion.isEmpty {
                        Text("Ask: \(move.reviewQuestion)")
                            .font(.caption2)
                            .foregroundStyle(QuipslyStudioTheme.creekMist.opacity(0.94))
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    HStack(spacing: 6) {
                        Button {
                            copyText(move.dryRunReviewCommand)
                        } label: {
                            Text("Copy dry-run")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(move.dryRunReviewCommand.isEmpty)

                        Button {
                            copyText(move.reviewCommand)
                        } label: {
                            Text("Copy review")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .disabled(move.reviewCommand.isEmpty)
                    }
                }
                .padding(8)
                .background(move.kindColor.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 11, style: .continuous)
                        .stroke(move.kindColor.opacity(0.18), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            Text(snapshot.editRehearsalNextSafestAction.isEmpty ? "Open the rehearsal board, try one move in Studio, then record a review decision." : snapshot.editRehearsalNextSafestAction)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.editRehearsalPath)
                } label: {
                    Label("Open rehearsal", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.editRehearsalPath.isEmpty)

                Button {
                    openPath(snapshot.editRehearsalMarkdownPath)
                } label: {
                    Label("Open notes", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.editRehearsalMarkdownPath.isEmpty)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.mossGlassGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.24), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func nextActionCard(_ action: Episode4NextAction) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top, spacing: 8) {
                Text(action.priority)
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.night)
                    .frame(width: 22, height: 22)
                    .background(QuipslyStudioTheme.honey)
                    .clipShape(Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(action.title)
                        .font(.caption)
                        .fontWeight(.black)
                    Text(action.why)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            Text(action.command)
                .font(.caption2.monospaced())
                .foregroundStyle(QuipslyStudioTheme.honey)
                .lineLimit(3)
                .truncationMode(.middle)

            Button {
                copyText(action.command)
            } label: {
                Label("Copy next action", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(10)
        .background(QuipslyStudioTheme.quietInsetGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.20), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var applyPreviewCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Apply preview", systemImage: "eye.trianglebadge.exclamationmark")
                    .font(.caption)
                    .fontWeight(.black)
                Spacer()
                Text(snapshot.applyStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.applyCounts.statusColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("reviewed", "\(snapshot.applyCounts.reviewed)", QuipslyStudioTheme.creek)
                metricPill("ready", "\(snapshot.applyCounts.ready)", snapshot.applyCounts.ready > 0 ? QuipslyStudioTheme.moss : QuipslyStudioTheme.sage)
                metricPill("placeholders", "\(snapshot.applyCounts.sourcePlaceholders)", snapshot.applyCounts.sourcePlaceholders > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
                metricPill("blocked", "\(snapshot.applyCounts.blocked)", snapshot.applyCounts.blocked > 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.sage)
                metricPill("noop", "\(snapshot.applyCounts.noop)", QuipslyStudioTheme.sage)
            }

            ForEach(snapshot.applyOperations.prefix(3)) { operation in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(operation.proposalId)
                            .font(.caption2.monospaced())
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.honey)
                        Spacer()
                        Text(operation.operationStatus)
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(operation.statusColor)
                    }
                    Text(operation.reason)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
                .background(QuipslyStudioTheme.panel.opacity(0.42))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            Button {
                openPath(snapshot.applyPreviewPath)
            } label: {
                Label("Open apply preview", systemImage: "doc.richtext")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(snapshot.applyPreviewPath.isEmpty)
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(snapshot.applyCounts.statusColor.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var youtubeStandardRecipeCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("YouTube standard recipe", systemImage: "map.fill")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.lichen)
                Spacer()
                Text(snapshot.youtubeRecipeStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.youtubeRecipeInTargetWindow ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            Text("A reviewable branch recipe over the intact Episode 4 spine. SHOW/SKIP islands are suggestions with reasons, not chopped media and not auto-applied edits.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("branch", snapshot.youtubeRecipeBranchId.isEmpty ? "v001" : snapshot.youtubeRecipeBranchId, QuipslyStudioTheme.creekMist)
                metricPill("target", snapshot.youtubeRecipeTargetLabel.isEmpty ? "35-45 min" : snapshot.youtubeRecipeTargetLabel, QuipslyStudioTheme.honey)
                metricPill("keep", snapshot.youtubeRecipeEstimatedKeepLabel.isEmpty ? "unknown" : snapshot.youtubeRecipeEstimatedKeepLabel, snapshot.youtubeRecipeInTargetWindow ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey)
                metricPill("remove", snapshot.youtubeRecipeEstimatedRemoveLabel.isEmpty ? "unknown" : snapshot.youtubeRecipeEstimatedRemoveLabel, QuipslyStudioTheme.clay)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("SHOW islands", "\(snapshot.youtubeRecipeShowCount)", QuipslyStudioTheme.honey)
                metricPill("SKIP gaps", "\(snapshot.youtubeRecipeSkipCount)", QuipslyStudioTheme.clay)
                metricPill("specialist", "\(snapshot.youtubeRecipeSpecialistCount)", QuipslyStudioTheme.creekMist)
                metricPill("placeholders", "\(snapshot.youtubeRecipePlaceholderCount)", snapshot.youtubeRecipePlaceholderCount > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
            }

            Text(snapshot.youtubeRecipeNextSafestAction.isEmpty ? "Review the recipe, then promote accepted ranges into branch metadata." : snapshot.youtubeRecipeNextSafestAction)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.youtubeRecipePath)
                } label: {
                    Label("Open recipe board", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.youtubeRecipePath.isEmpty)

                Button {
                    openPath(snapshot.youtubeRecipeMarkdownPath)
                } label: {
                    Label("Open notes", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.youtubeRecipeMarkdownPath.isEmpty)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke((snapshot.youtubeRecipeInTargetWindow ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey).opacity(0.24), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var youtubeRecipeReviewCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Recipe review ledger", systemImage: "checklist.checked")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                Spacer()
                Text(snapshot.youtubeRecipeReviewStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.youtubeRecipeReviewNeeded > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            Text("Review decisions live beside the generated recipe. Accept, refine, reject, or mark needs-listen without changing source media or writing timeline metadata.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("operations", "\(snapshot.youtubeRecipeReviewOperations)", QuipslyStudioTheme.creekMist)
                metricPill("reviewed", "\(snapshot.youtubeRecipeReviewReviewed)", QuipslyStudioTheme.moss)
                metricPill("needs review", "\(snapshot.youtubeRecipeReviewNeeded)", snapshot.youtubeRecipeReviewNeeded > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
                metricPill("events", "\(snapshot.youtubeRecipeReviewEvents)", QuipslyStudioTheme.clay)
            }

            Text(snapshot.youtubeRecipeReviewNextSafestAction.isEmpty ? "Proof-listen one recipe range, then record a sidecar decision." : snapshot.youtubeRecipeReviewNextSafestAction)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.youtubeRecipeReviewPath)
                } label: {
                    Label("Open review board", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.youtubeRecipeReviewPath.isEmpty)

                Button {
                    openPath(snapshot.youtubeRecipeReviewMarkdownPath)
                } label: {
                    Label("Open review notes", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.youtubeRecipeReviewMarkdownPath.isEmpty)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.mossGlassGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke((snapshot.youtubeRecipeReviewNeeded > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss).opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var recipeProofListenQueueCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Proof-listen queue", systemImage: "ear.and.waveform")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text(snapshot.recipeProofListenQueueStatus.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.recipeProofListenQueueTasks > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            Text("Review rhythm before promotion: cadence, reaction covers, context-loss skips, J/L cut hints, and when not to cut.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("tasks", "\(snapshot.recipeProofListenQueueTasks)", QuipslyStudioTheme.creekMist)
                metricPill("listen-first", "\(snapshot.recipeProofListenQueueListenFirst)", QuipslyStudioTheme.honey)
                metricPill("visual review", "\(snapshot.recipeProofListenQueueVisualReview)", QuipslyStudioTheme.moss)
                metricPill("source recovery", "\(snapshot.recipeProofListenQueueSourceRecovery)", snapshot.recipeProofListenQueueSourceRecovery > 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.sage)
            }

            Text(snapshot.recipeProofListenQueueNextSafestAction.isEmpty ? "Proof-listen the top task, then record a sidecar review decision." : snapshot.recipeProofListenQueueNextSafestAction)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.recipeProofListenQueuePath)
                } label: {
                    Label("Open queue", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenQueuePath.isEmpty)

                Button {
                    openPath(snapshot.recipeProofListenQueueMarkdownPath)
                } label: {
                    Label("Open checklist", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenQueueMarkdownPath.isEmpty)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.24), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var recipeProofListenNextCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "waveform.badge.magnifyingglass")
                    .foregroundStyle(QuipslyStudioTheme.honey)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Next proof-listen")
                        .font(.caption)
                        .fontWeight(.black)
                    Text(snapshot.recipeProofListenNextOperationId.isEmpty ? "No operation selected" : snapshot.recipeProofListenNextOperationId)
                        .font(.caption2.monospaced())
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.lichen)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 6)
                Text(snapshot.recipeProofListenNextReviewMode.replacingOccurrences(of: "-", with: " ").uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                    .lineLimit(1)
                    .minimumScaleFactor(0.62)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("sequence", snapshot.recipeProofListenNextSequenceLabel.isEmpty ? "unknown" : snapshot.recipeProofListenNextSequenceLabel, QuipslyStudioTheme.creekMist)
                metricPill("decision", snapshot.recipeProofListenNextSuggestedDecision.isEmpty ? "needs-listen" : snapshot.recipeProofListenNextSuggestedDecision, QuipslyStudioTheme.honey)
                metricPill("kind", snapshot.recipeProofListenNextOperationKind.isEmpty ? "review" : snapshot.recipeProofListenNextOperationKind.replacingOccurrences(of: "-", with: " "), QuipslyStudioTheme.sage)
                metricPill("risk", snapshot.recipeProofListenNextRisk.isEmpty ? "human cadence" : snapshot.recipeProofListenNextRisk, snapshot.recipeProofListenNextRisk.localizedCaseInsensitiveContains("robot") ? QuipslyStudioTheme.clay : QuipslyStudioTheme.honey)
            }

            proofListenCoverageStrip
            proofListenEvidenceStrip
            proofListenCutCraftStrip

            if !snapshot.recipeProofListenNextProofQuestion.isEmpty {
                Text(snapshot.recipeProofListenNextProofQuestion)
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !snapshot.recipeProofListenNextWhyFirst.isEmpty {
                Text(snapshot.recipeProofListenNextWhyFirst)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !snapshot.recipeProofListenNextAudioPath.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Proof audio window", systemImage: "speaker.wave.2.fill")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.creekMist)
                    Text(snapshot.recipeProofListenNextAudioPath)
                        .font(.caption2.monospaced())
                        .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.86))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .padding(8)
                .background(QuipslyStudioTheme.panel.opacity(0.38))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            if !snapshot.recipeProofListenNextListenChecks.isEmpty || !snapshot.recipeProofListenNextVisualChecks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(snapshot.recipeProofListenNextListenChecks.prefix(2), id: \.self) { check in
                        Label(check, systemImage: "ear")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    ForEach(snapshot.recipeProofListenNextVisualChecks.prefix(2), id: \.self) { check in
                        Label(check, systemImage: "eye")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }

            HStack(spacing: 6) {
                Button {
                    copyText(snapshot.recipeProofListenReviewerPrompt)
                } label: {
                    Label("Copy prompt", systemImage: "text.bubble")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenReviewerPrompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .help("Copy a plain-English listen/watch prompt for Charlie, Mako, or Homer. This is not a command and records nothing.")

                Button {
                    copyText(snapshot.recipeProofListenReviewPacket)
                } label: {
                    Label("Copy review packet", systemImage: "doc.on.clipboard")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenReviewPacket.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .help("Copy one self-contained proof-listen packet with the question, evidence state, and safety boundary. This records nothing.")
            }

            proofListenReviewComposer

            if snapshot.recipeProofListenNextTimelineWriteAllowed || snapshot.recipeProofListenNextSourceMutationAllowed {
                Text("Warning: this proof card claims write permissions. Treat it as unsafe until the sidecar contract is corrected.")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Safe boundary: this card can open/copy review evidence only. Timeline, clips, source files, exports, and publishing stay untouched.")
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.moss)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let primary = snapshot.recipeProofListenPrimaryAction {
                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 6) {
                        Text(primary.label)
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(QuipslyStudioTheme.honey)
                        Spacer()
                        Text(primary.risk)
                            .font(.caption2)
                            .fontWeight(.black)
                            .foregroundStyle(primary.riskColor)
                    }

                    Text(primary.intent)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        copyText(primary.command)
                    } label: {
                        Label("Copy safe dry-run", systemImage: "terminal")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .disabled(primary.command.isEmpty)
                    .help("Copy the safe preview command. It records nothing unless you run the real record command intentionally.")
                }
                .padding(8)
                .background(QuipslyStudioTheme.honey.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                ForEach(snapshot.recipeProofListenSecondaryActions.prefix(6)) { action in
                    Button {
                        if !action.targetPath.isEmpty {
                            openPath(action.targetPath)
                        } else {
                            copyText(action.command)
                        }
                    } label: {
                        Text(action.targetPath.isEmpty ? "Copy \(action.label)" : action.label)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(action.command.isEmpty && action.targetPath.isEmpty)
                    .help(action.targetPath.isEmpty
                          ? "Copies a command for deliberate review. It does not record anything by clicking here."
                          : (action.intent.isEmpty ? "Open safe proof-listen evidence." : action.intent))
                }
            }

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.recipeProofListenNextPath)
                } label: {
                    Label("Open proof card", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenNextPath.isEmpty)

                Button {
                    openPath(snapshot.recipeProofListenNextMarkdownPath)
                } label: {
                    Label("Open proof notes", systemImage: "doc.text")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.recipeProofListenNextMarkdownPath.isEmpty)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.quietInsetGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.26), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("quipsly.cutIntelligence.episode4.nextProofListenCard")
        .accessibilityLabel("Next proof listen card. Safe read only review of the next Episode 4 host spine operation.")
    }

    private var proofListenCoverageStrip: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Label("Review coverage", systemImage: "list.bullet.clipboard")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.lichen)
                Spacer()
                Text(snapshot.proofListenCoverageLabel)
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.proofListenCoverageColor)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("reviewed", "\(snapshot.youtubeRecipeReviewReviewed)", snapshot.proofListenCoverageColor)
                metricPill("needs review", "\(snapshot.youtubeRecipeReviewNeeded)", snapshot.youtubeRecipeReviewNeeded > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss)
                metricPill("events", "\(snapshot.youtubeRecipeReviewEvents)", snapshot.youtubeRecipeReviewEvents > 0 ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.sage)
            }

            Text(snapshot.proofListenCoverageGuidance)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(snapshot.proofListenCoverageColor.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private var proofListenEvidenceStrip: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Label("Proof evidence", systemImage: "sparkle.magnifyingglass")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text(snapshot.youtubeRecipeReviewEvents == 0 ? "NO EVENTS YET" : "\(snapshot.youtubeRecipeReviewEvents) EVENT(S)")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(snapshot.youtubeRecipeReviewEvents == 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.moss)
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("pending", "\(snapshot.youtubeRecipeReviewPending)", snapshot.youtubeRecipeReviewPending > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
                metricPill("needs listen", "\(snapshot.youtubeRecipeReviewNeedsListen)", snapshot.youtubeRecipeReviewNeedsListen > 0 ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.sage)
                metricPill("needs source", "\(snapshot.youtubeRecipeReviewNeedsSource)", snapshot.youtubeRecipeReviewNeedsSource > 0 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.sage)
            }

            Text(snapshot.proofListenEvidenceGuidance)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(QuipslyStudioTheme.honey.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private var proofListenCutCraftStrip: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("Cut craft checks", systemImage: "scissors.badge.ellipsis")
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.creekMist)

            ForEach(snapshot.recipeProofListenCutCraftRubric.prefix(4), id: \.self) { check in
                Label(check, systemImage: "checkmark.circle")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(8)
        .background(QuipslyStudioTheme.creekMist.opacity(0.055))
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private var proofListenReviewComposer: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 7) {
                Label("Sidecar review composer", systemImage: "square.and.pencil")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                Spacer()
                Text("COPIES COMMANDS ONLY")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.moss)
            }

            Text("Write the evidence once for the active Episode 4 proof target. This is the same review habit we want across Episodes 1-6: listen, explain the tradeoff, dry-run first, then record only on purpose.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                TextField("Reviewer", text: $proofListenReviewer)
                    .textFieldStyle(.roundedBorder)
                    .font(.caption)

                Picker("Decision", selection: $proofListenDecision) {
                    ForEach(Self.proofListenDecisionOptions, id: \.self) { option in
                        Text(option.replacingOccurrences(of: "-", with: " "))
                            .tag(option)
                    }
                }
                .labelsHidden()
                .frame(maxWidth: 150)
            }

            Label(snapshot.recipeProofListenDecisionGuidance(decision: proofListenDecision), systemImage: "signpost.right")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.lichen)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 4) {
                Text("Before recording this decision, make sure the note answers:")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                ForEach(snapshot.recipeProofListenEvidenceRequirements(decision: proofListenDecision), id: \.self) { requirement in
                    Label(requirement, systemImage: "smallcircle.filled.circle")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(8)
            .background(QuipslyStudioTheme.honey.opacity(0.05))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            if !proofListenMissingEvidenceWarnings.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Missing or weak evidence")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.clay)
                    ForEach(proofListenMissingEvidenceWarnings, id: \.self) { warning in
                        Label(warning, systemImage: "exclamationmark.triangle")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(8)
                .background(QuipslyStudioTheme.clay.opacity(0.06))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            Label(proofListenRecordRecommendation, systemImage: proofListenMissingEvidenceWarnings.isEmpty ? "checkmark.seal" : "lock.trianglebadge.exclamationmark")
                .font(.caption2)
                .foregroundStyle(proofListenMissingEvidenceWarnings.isEmpty ? QuipslyStudioTheme.moss : QuipslyStudioTheme.clay)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenEvidenceStrengthSummary, systemImage: "waveform.path.ecg")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenNextSafeActionSummary, systemImage: "arrow.triangle.branch")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.lichen)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenPromotionReadinessSummary, systemImage: "arrow.up.doc")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenApplyPreviewCandidateSummary, systemImage: proofListenCanCreateApplyPreviewBrief ? "sparkles.rectangle.stack" : "rectangle.stack.badge.minus")
                .font(.caption2)
                .foregroundStyle(proofListenCanCreateApplyPreviewBrief ? QuipslyStudioTheme.moss : QuipslyStudioTheme.clay)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenQueueTriageSummary, systemImage: "list.bullet.clipboard")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.creek)
                .fixedSize(horizontal: false, vertical: true)

            Label(proofListenCutCraftIntentSummary, systemImage: "waveform.and.magnifyingglass")
                .font(.caption2)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .fixedSize(horizontal: false, vertical: true)

            TextField("Short decision note", text: $proofListenNote)
                .textFieldStyle(.roundedBorder)
                .font(.caption)

            TextField("Audio/cadence evidence", text: $proofListenAudioNote)
                .textFieldStyle(.roundedBorder)
                .font(.caption)

            TextField("Visual/reaction evidence", text: $proofListenVisualNote)
                .textFieldStyle(.roundedBorder)
                .font(.caption)

            TextField("Preserve or tighten", text: $proofListenCadenceNote)
                .textFieldStyle(.roundedBorder)
                .font(.caption)

            HStack(spacing: 6) {
                Button {
                    copyText(proofListenDecisionCommand(record: false))
                } label: {
                    Label("Copy dry-run note", systemImage: "terminal")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.small)
                .disabled(!snapshot.hasRecipeProofListenNext)
                .help("Copy the dry-run command first. This previews the review event and records nothing.")

                Button {
                    copyText(proofListenDecisionCommand(record: true))
                } label: {
                    Label("Copy record note", systemImage: "checkmark.seal")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(!snapshot.hasRecipeProofListenNext || !proofListenMissingEvidenceWarnings.isEmpty)
                .help(proofListenMissingEvidenceWarnings.isEmpty
                    ? "Copy the deliberate sidecar ledger command. It still does not run from this button."
                    : "Resolve the missing/weak evidence warnings first. Dry-run remains available because it writes nothing.")
            }

            Button {
                copyText(proofListenApplyPreviewBrief)
            } label: {
                Label("Copy apply-preview brief", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy a review packet for the next apply-preview pass. This writes nothing."
                : "Apply-preview briefs require evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenSourceRecoveryBrief)
            } label: {
                Label("Copy source-recovery brief", systemImage: "tray.and.arrow.down")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateSourceRecoveryBrief)
            .help(proofListenCanCreateSourceRecoveryBrief
                ? "Copy a source-recovery packet for missing watched clips, b-roll, references, or camera context. This writes nothing."
                : "Source-recovery briefs are for needs-source decisions.")

            Button {
                copyText(proofListenVisualReviewBrief)
            } label: {
                Label("Copy visual-review brief", systemImage: "eye.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateVisualReviewBrief)
            .help(proofListenCanCreateVisualReviewBrief
                ? "Copy a visual-review packet for checking reaction cover, eye-line, jump cuts, source wall, and program frame proof. This writes nothing."
                : "Visual-review briefs are for needs-visual-review decisions.")

            Button {
                copyText(proofListenDecisionOutcomeBrief)
            } label: {
                Label("Copy outcome brief", systemImage: "archivebox")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateDecisionOutcomeBrief)
            .help(proofListenCanCreateDecisionOutcomeBrief
                ? "Copy a no-write outcome packet for reject, hold, or needs-listen decisions."
                : "Outcome briefs are for non-promoting decisions: reject, hold, or needs-listen.")

            Button {
                copyText(proofListenCutCraftReviewBrief)
            } label: {
                Label("Copy craft review brief", systemImage: "waveform.path.ecg.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext)
            .help("Copy a no-write craft packet with what to listen for, what to watch for, and what to adjust next.")

            Button {
                copyText(proofListenApplyPreviewWorkOrder)
            } label: {
                Label("Copy apply-preview work order", systemImage: "checklist.checked")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy a no-write work order for the next reversible apply-preview pass."
                : "Apply-preview work orders require evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewCandidateJSON)
            } label: {
                Label("Copy preview JSON", systemImage: "curlybraces")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy a structured no-write apply-preview candidate payload for agent tooling."
                : "Preview JSON requires evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewPatchPlanJSON)
            } label: {
                Label("Copy patch plan JSON", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy a structured no-write plan for the reversible metadata patch that would be previewed next."
                : "Patch plan JSON requires evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewApprovalChecklistJSON)
            } label: {
                Label("Copy approval checklist", systemImage: "checklist")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy the no-write checklist a preview must satisfy before metadata promotion."
                : "Approval checklist JSON requires evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewApprovalReceiptTemplateJSON)
            } label: {
                Label("Copy receipt template", systemImage: "doc.badge.gearshape")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy the no-write approval receipt template a reviewer would fill after preview review."
                : "Receipt templates require evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewPromotionProposalJSON)
            } label: {
                Label("Copy promotion proposal", systemImage: "arrow.up.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy the no-write proposal for what could become timeline metadata after an approve-preview receipt exists."
                : "Promotion proposals require evidence-ready keep/refine review notes.")

            Button {
                copyText(proofListenApplyPreviewPromotionReadinessBoardJSON)
            } label: {
                Label("Copy readiness board", systemImage: "list.bullet.rectangle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(!snapshot.hasRecipeProofListenNext || !proofListenCanCreateApplyPreviewBrief)
            .help(proofListenCanCreateApplyPreviewBrief
                ? "Copy the no-write readiness board showing which gates block timeline promotion."
                : "Readiness boards require evidence-ready keep/refine review notes.")
        }
        .padding(9)
        .background(QuipslyStudioTheme.creek.opacity(0.055))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var proofListenRecordRecommendation: String {
        if proofListenMissingEvidenceWarnings.isEmpty {
            return "Evidence-ready: dry-run first, then record only if the proof-listen result still matches."
        }
        return "Record is locked until the review note answers the weak-evidence warnings. Dry-run stays safe."
    }

    private var proofListenEvidenceStrengthSummary: String {
        let usableFieldCount = [
            proofListenNote,
            proofListenAudioNote,
            proofListenVisualNote,
            proofListenCadenceNote
        ]
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .count

        if proofListenMissingEvidenceWarnings.isEmpty {
            return "Evidence strength: ready. \(usableFieldCount)/4 fields started and no weak-evidence warnings remain."
        }

        return "Evidence strength: needs work. \(usableFieldCount)/4 fields started, \(proofListenMissingEvidenceWarnings.count) warning(s) remain."
    }

    private var proofListenNextSafeActionSummary: String {
        if !proofListenMissingEvidenceWarnings.isEmpty {
            return "Next safe action: proof-listen and dry-run only; strengthen evidence before any sidecar record."
        }

        switch proofListenDecision {
        case "keep":
            return "Next safe action: dry-run, record evidence, then review apply-preview before metadata promotion."
        case "refine":
            return "Next safe action: record the refinement target, then tune one boundary, reaction, source timing, framing, or cadence choice."
        case "reject":
            return "Next safe action: record what this harms so future suggestions avoid the same bad cut."
        case "hold":
            return "Next safe action: preserve this as context and revisit after human taste, source, or episode-shape review."
        case "needs-source":
            return "Next safe action: route to source recovery or watched-clip search; do not invent confidence."
        case "needs-visual-review":
            return "Next safe action: inspect the source wall/program frame before deciding."
        case "needs-listen":
            fallthrough
        default:
            return "Next safe action: play the proof audio and write what the ear actually proved."
        }
    }

    private var proofListenPromotionReadinessSummary: String {
        if !proofListenMissingEvidenceWarnings.isEmpty {
            return "Promotion readiness: not ready. Review evidence is too weak for apply-preview or metadata promotion."
        }

        switch proofListenDecision {
        case "keep":
            return "Promotion readiness: ready for apply-preview review only; timeline truth still needs deliberate promotion."
        case "refine":
            return "Promotion readiness: ready for refinement preview; tune one metadata choice before any promotion."
        case "reject":
            return "Promotion readiness: do not promote; keep the rejection as learning evidence."
        case "hold":
            return "Promotion readiness: parked for context; no edit promotion yet."
        case "needs-source":
            return "Promotion readiness: source recovery required before any edit promotion."
        case "needs-visual-review":
            return "Promotion readiness: visual proof required before any edit promotion."
        case "needs-listen":
            fallthrough
        default:
            return "Promotion readiness: proof-listen first; no edit promotion yet."
        }
    }

    private var proofListenApplyPreviewCandidateSummary: String {
        if proofListenCanCreateApplyPreviewBrief {
            return "Apply-preview candidate: yes. Create a reversible preview packet before any timeline promotion."
        }
        if !proofListenMissingEvidenceWarnings.isEmpty {
            return "Apply-preview candidate: no. Strengthen review evidence first."
        }
        switch proofListenDecision {
        case "needs-source":
            return "Apply-preview candidate: no. Recover source/clip context first."
        case "needs-visual-review":
            return "Apply-preview candidate: no. Inspect source wall or program frame first."
        case "reject":
            return "Apply-preview candidate: no. Keep as learning evidence, not an edit candidate."
        case "hold":
            return "Apply-preview candidate: parked. Revisit after human taste or episode-shape review."
        default:
            return "Apply-preview candidate: no. Proof-listen or refine the decision first."
        }
    }

    private var proofListenQueueTriageSummary: String {
        if !proofListenMissingEvidenceWarnings.isEmpty {
            return "Queue triage: evidence is weak. Use proof-listen/dry-run before any record or preview path."
        }
        switch proofListenDecision {
        case "keep":
            return "Queue triage: candidate can move toward apply-preview review, not timeline truth."
        case "refine":
            return "Queue triage: candidate needs one named tuning target before preview work."
        case "reject":
            return "Queue triage: preserve the rejection as learning evidence; do not promote."
        case "hold":
            return "Queue triage: parked for human taste, episode-shape, or source-context review."
        case "needs-source":
            return "Queue triage: source recovery lane. Find watched clips, b-roll, reference, or camera context."
        case "needs-visual-review":
            return "Queue triage: visual review lane. Check reaction cover, jump cuts, and frame truth."
        case "needs-listen":
            fallthrough
        default:
            return "Queue triage: listen-first lane. Ears decide before metadata changes."
        }
    }

    private var proofListenCutCraftIntentSummary: String {
        let haystack = [
            proofListenDecision,
            proofListenNote,
            proofListenAudioNote,
            proofListenVisualNote,
            proofListenCadenceNote
        ]
            .joined(separator: " ")
            .lowercased()
        let intent: String
        if haystack.contains("reaction") || haystack.contains("cover") || haystack.contains("face") {
            intent = "reaction cover"
        } else if haystack.contains("j-cut") || haystack.contains("j cut") || haystack.contains("hear before") || haystack.contains("audio lead") {
            intent = "J-cut"
        } else if haystack.contains("l-cut") || haystack.contains("l cut") || haystack.contains("carry audio") || haystack.contains("audio tail") {
            intent = "L-cut"
        } else if haystack.contains("jump") || haystack.contains("twitchy") || haystack.contains("same speaker") {
            intent = "jump-cut handling"
        } else if haystack.contains("b-roll") || haystack.contains("clip") || haystack.contains("source") || haystack.contains("reference") {
            intent = "source/b-roll insertion"
        } else if haystack.contains("pause") || haystack.contains("breath") || haystack.contains("cadence") || haystack.contains("rhythm") {
            intent = "cadence preservation"
        } else if proofListenDecision == "reject" {
            intent = "avoid bad cut"
        } else {
            intent = "listen-first craft choice"
        }
        return "Cut craft: \(intent). Use the notes to preserve human cadence before tightening."
    }

    private var proofListenCutCraftReviewBrief: String {
        let haystack = [
            proofListenDecision,
            proofListenNote,
            proofListenAudioNote,
            proofListenVisualNote,
            proofListenCadenceNote
        ]
            .joined(separator: " ")
            .lowercased()

        let intent: String
        let listenFor: [String]
        let watchFor: [String]
        let nextAdjustment: String

        if haystack.contains("reaction") || haystack.contains("cover") || haystack.contains("face") {
            intent = "reaction cover"
            listenFor = [
                "Does the reaction preserve the speaker's meaning instead of feeling like filler?",
                "Does the cover hide a jump without flattening the human pause?"
            ]
            watchFor = [
                "Meaningful listener expression",
                "Clean eye-line/body continuity",
                "No accidental dead stare or false emphasis"
            ]
            nextAdjustment = "Try a reversible preview where the reaction covers only the unstable visual moment, then return to the speaker as soon as meaning requires it."
        } else if haystack.contains("j-cut") || haystack.contains("j cut") || haystack.contains("hear before") || haystack.contains("audio lead") {
            intent = "J-cut"
            listenFor = [
                "Does the next voice enter early enough to feel intentional?",
                "Does the overlap clarify the handoff rather than rushing the thought?"
            ]
            watchFor = [
                "Picture change lands after the audio lead",
                "No confusing mouth mismatch during the overlap"
            ]
            nextAdjustment = "Preview the next speaker audio slightly before the visual switch, keeping the overlap short and conversational."
        } else if haystack.contains("l-cut") || haystack.contains("l cut") || haystack.contains("carry audio") || haystack.contains("audio tail") {
            intent = "L-cut"
            listenFor = [
                "Does the previous voice carry emotional or explanatory context?",
                "Does the tail preserve meaning without feeling late?"
            ]
            watchFor = [
                "Reaction or source image earns the carried audio",
                "No mismatched mouth movement"
            ]
            nextAdjustment = "Preview the previous speaker audio carrying over a reaction/source frame, then cut back before it becomes visually stale."
        } else if haystack.contains("jump") || haystack.contains("twitchy") || haystack.contains("same speaker") {
            intent = "jump-cut handling"
            listenFor = [
                "Is the jump audible, meaningful, or too abrupt?",
                "Would preserving a breath or sentence tail make it feel less robotic?"
            ]
            watchFor = [
                "Visible head/body pop",
                "Need for reaction cover, crop shift, or accepted jump"
            ]
            nextAdjustment = "Choose one: cover with reaction/source, soften with cadence, or accept the jump only if it adds energy."
        } else if haystack.contains("b-roll") || haystack.contains("clip") || haystack.contains("source") || haystack.contains("reference") {
            intent = "source/b-roll insertion"
            listenFor = [
                "Where does the spoken context create a natural source entrance?",
                "Should conversation audio stay under the inserted clip?"
            ]
            watchFor = [
                "Correct watched/source clip",
                "Enough visual context without hijacking the conversation"
            ]
            nextAdjustment = "Recover or select source media first, then preview source insertion as an overlay/insert without replacing the conversation spine."
        } else if haystack.contains("pause") || haystack.contains("breath") || haystack.contains("cadence") || haystack.contains("rhythm") {
            intent = "cadence preservation"
            listenFor = [
                "Which pause carries thought, humor, or emotion?",
                "Which pause is pure drag?"
            ]
            watchFor = [
                "Reaction or posture that makes the pause worth keeping",
                "Avoid twitchy overcutting"
            ]
            nextAdjustment = "Tighten drag only; preserve the breath or pause if it carries thought, anticipation, or human warmth."
        } else if proofListenDecision == "reject" {
            intent = "avoid bad cut"
            listenFor = [
                "What made the suggestion fail?",
                "What should future cut scoring penalize?"
            ]
            watchFor = [
                "False emphasis",
                "Visual mismatch",
                "Continuity harm"
            ]
            nextAdjustment = "Keep this as negative learning evidence; do not turn it into an edit preview."
        } else {
            intent = "listen-first craft choice"
            listenFor = [
                "Cadence, breath, overlap, sentence meaning, and whether the cut feels human"
            ]
            watchFor = [
                "Reaction cover",
                "Source wall truth",
                "Frame continuity if audio sounds plausible"
            ]
            nextAdjustment = "Proof-listen first, then choose the smallest reversible preview that preserves meaning."
        }

        var lines = [
            "Episode 4 cut-craft review brief",
            "",
            "Purpose: turn proof-listen notes into a concrete craft review without writing timeline truth.",
            "Decision: \(proofListenDecision)",
            "Craft intent: \(intent)",
            "Evidence strength: \(proofListenEvidenceStrengthSummary)",
            "Queue triage: \(proofListenQueueTriageSummary)",
            "",
            "Listen for:"
        ]
        lines.append(contentsOf: listenFor.map { "- \($0)" })
        lines.append("")
        lines.append("Watch for:")
        lines.append(contentsOf: watchFor.map { "- \($0)" })
        lines.append("")
        lines.append("Next reversible adjustment:")
        lines.append("- \(nextAdjustment)")
        lines.append("")
        lines.append("Review evidence:")
        lines.append("- Summary: \(proofListenNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Audio/cadence evidence: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Visual/reaction evidence: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Preserve/tighten guidance: \(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("")

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Craft-review boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private var proofListenApplyPreviewCandidateJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        let status = proofListenCanCreateApplyPreviewBrief ? "candidate" : "blocked"
        return """
        {
          "type": "episode4.applyPreviewCandidate",
          "episode": "episode-4",
          "status": "\(status)",
          "decision": "\(escape(proofListenDecision))",
          "canCreateApplyPreview": \(proofListenCanCreateApplyPreviewBrief ? "true" : "false"),
          "cutCraftSummary": "\(escape(proofListenCutCraftIntentSummary))",
          "queueTriage": "\(escape(proofListenQueueTriageSummary))",
          "promotionReadiness": "\(escape(proofListenPromotionReadinessSummary))",
          "summary": "\(escape(proofListenNote.trimmedNonEmpty(defaultValue: "not written")))",
          "audioEvidence": "\(escape(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written")))",
          "visualEvidence": "\(escape(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written")))",
          "cadenceGuidance": "\(escape(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written")))",
          "writesTimelineMetadata": false,
          "mutatesSourceMedia": false,
          "exportsRendered": false,
          "externalPublishing": false
        }
        """
    }

    private var proofListenApplyPreviewApprovalReceiptTemplateJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        return """
        {
          "type": "episode4.applyPreviewApprovalReceiptTemplate",
          "episode": "episode-4",
          "status": "\(proofListenCanCreateApplyPreviewBrief ? "template-ready" : "blocked")",
          "decision": "\(escape(proofListenDecision))",
          "allowedReceiptOutcomes": [
            "approve-preview",
            "reject-preview",
            "request-refinement",
            "needs-source",
            "needs-visual-review"
          ],
          "requiredReceiptFields": [
            "reviewer",
            "outcome",
            "whatWorked",
            "whatFailedOrStillNeedsWork",
            "humanCadenceNote",
            "promotionDecision"
          ],
          "reviewQuestions": [
            "Did the preview preserve cadence, breath, humor, warmth, or useful silence?",
            "Did it avoid over-cleaned robotic pacing?",
            "Did the visual/source choice support the audio meaning?",
            "Is this ready for metadata promotion, or only useful as learning evidence?"
          ],
          "summary": "\(escape(proofListenNote.trimmedNonEmpty(defaultValue: "not written")))",
          "audioEvidence": "\(escape(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written")))",
          "visualEvidence": "\(escape(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written")))",
          "cadenceGuidance": "\(escape(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written")))",
          "writesTimelineMetadata": false,
          "mutatesSourceMedia": false,
          "exportsRendered": false,
          "externalPublishing": false
        }
        """
    }

    private var proofListenApplyPreviewPromotionProposalJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        return """
        {
          "type": "episode4.applyPreviewPromotionProposal",
          "episode": "episode-4",
          "status": "\(proofListenCanCreateApplyPreviewBrief ? "proposal-ready" : "blocked")",
          "decision": "\(escape(proofListenDecision))",
          "requiresReceiptOutcome": "approve-preview",
          "canPromoteNow": false,
          "proposedMetadataPromotion": {
            "target": "timelineDecisionMetadata",
            "operation": "promoteApprovedApplyPreviewMetadata",
            "sourceOfTruth": "approvedPreviewReceipt",
            "previewKind": "\(escape(proofListenCutCraftIntentSummary))",
            "fieldsToPromote": [
              "decisionIntent",
              "cutCraftIntent",
              "previewKind",
              "reviewer",
              "humanAudioNote",
              "humanVisualNote",
              "humanCadenceNote",
              "approvedPreviewReceiptId"
            ]
          },
          "mustNotPromoteIf": [
            "No approve-preview receipt exists.",
            "Proof-listen evidence is placeholder or too vague.",
            "Source or visual review is unresolved.",
            "The proposed patch would mutate original media.",
            "The reviewer marked hold, reject, needs-listen, needs-source, or needs-visual-review."
          ],
          "truth": {
            "recordsApproval": false,
            "writesTimelineMetadata": false,
            "mutatesSourceMedia": false,
            "exportsMedia": false,
            "publishesExternally": false,
            "overwritesExistingVersion": false
          }
        }
        """
    }

    private var proofListenApplyPreviewPromotionReadinessBoardJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        return """
        {
          "type": "episode4.applyPreviewPromotionReadinessBoard",
          "episode": "episode-4",
          "status": "\(proofListenCanCreateApplyPreviewBrief ? "awaiting-approval-receipt" : "blocked")",
          "decision": "\(escape(proofListenDecision))",
          "canCreateApplyPreview": \(proofListenCanCreateApplyPreviewBrief ? "true" : "false"),
          "canPromoteNow": false,
          "nextSafeAction": "\(proofListenCanCreateApplyPreviewBrief ? "Create or inspect a reversible preview, then collect an approve-preview receipt before metadata promotion." : "Strengthen proof-listen evidence before preview work.")",
          "gates": [
            {
              "id": "proof-listen-evidence",
              "status": "\(proofListenCanCreateApplyPreviewBrief ? "pass" : "blocked")",
              "why": "\(escape(proofListenEvidenceStrengthSummary))"
            },
            {
              "id": "candidate-payload",
              "status": "\(proofListenCanCreateApplyPreviewBrief ? "ready" : "blocked")",
              "why": "Preview JSON exists only for evidence-ready keep/refine decisions."
            },
            {
              "id": "approval-receipt",
              "status": "missing",
              "why": "No reviewer has recorded approve-preview yet; promotion remains forbidden."
            },
            {
              "id": "timeline-write",
              "status": "forbidden",
              "why": "This board is read-only and must not mutate timeline metadata."
            }
          ],
          "truth": {
            "recordsApproval": false,
            "writesTimelineMetadata": false,
            "mutatesSourceMedia": false,
            "exportsMedia": false,
            "publishesExternally": false,
            "overwritesExistingVersion": false
          }
        }
        """
    }

    private var proofListenApplyPreviewApprovalChecklistJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        return """
        {
          "type": "episode4.applyPreviewApprovalChecklist",
          "episode": "episode-4",
          "status": "\(proofListenCanCreateApplyPreviewBrief ? "review-ready" : "blocked")",
          "decision": "\(escape(proofListenDecision))",
          "mustPassBeforePromotion": [
            "Proof-listen evidence is specific and non-placeholder.",
            "Visual/source evidence supports the craft intent.",
            "The preview preserves whole synced sources and uses metadata only.",
            "The preview is the smallest reversible adjustment that tests the hypothesis.",
            "Human or agent reviewer explicitly approves the preview before timeline metadata promotion."
          ],
          "humanFeelingChecks": [
            "Does it preserve speaker cadence, breath, humor, warmth, or useful silence?",
            "Does it avoid over-cleaned robotic pacing?",
            "Does the visual cut feel motivated instead of twitchy?"
          ],
          "summary": "\(escape(proofListenNote.trimmedNonEmpty(defaultValue: "not written")))",
          "audioEvidence": "\(escape(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written")))",
          "visualEvidence": "\(escape(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written")))",
          "cadenceGuidance": "\(escape(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written")))",
          "writesTimelineMetadata": false,
          "mutatesSourceMedia": false,
          "exportsRendered": false,
          "externalPublishing": false
        }
        """
    }

    private var proofListenApplyPreviewPatchPlanJSON: String {
        let escape: (String) -> String = { value in
            value
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
                .replacingOccurrences(of: "\n", with: "\\n")
        }
        let patchKind: String
        let proposedAdjustment: String
        let craft = proofListenCutCraftIntentSummary.lowercased()
        if craft.contains("reaction") {
            patchKind = "reaction-cover-preview"
            proposedAdjustment = "Add a reversible SHOW preview for a reaction/source cover over the unstable visual moment."
        } else if craft.contains("j-cut") {
            patchKind = "j-cut-preview"
            proposedAdjustment = "Preview a short audio-lead overlap before the picture switch."
        } else if craft.contains("l-cut") {
            patchKind = "l-cut-preview"
            proposedAdjustment = "Preview an audio-tail carry over a reaction/source frame."
        } else if craft.contains("jump") {
            patchKind = "jump-cut-handling-preview"
            proposedAdjustment = "Preview cover, cadence softening, or intentional jump acceptance as a reversible choice."
        } else if craft.contains("source") || craft.contains("b-roll") {
            patchKind = "source-insertion-preview"
            proposedAdjustment = "Preview source or b-roll insertion only after source context is named."
        } else if craft.contains("cadence") {
            patchKind = "cadence-timing-preview"
            proposedAdjustment = "Preview timing changes that tighten drag while preserving meaningful breath or pause."
        } else {
            patchKind = "generic-proof-listen-preview"
            proposedAdjustment = "Preview the smallest reversible metadata adjustment that tests the proof-listen hypothesis."
        }
        return """
        {
          "type": "episode4.applyPreviewPatchPlan",
          "episode": "episode-4",
          "status": "\(proofListenCanCreateApplyPreviewBrief ? "plan-ready" : "blocked")",
          "decision": "\(escape(proofListenDecision))",
          "patchKind": "\(patchKind)",
          "proposedAdjustment": "\(escape(proposedAdjustment))",
          "sourcePolicy": "preserve whole synced sources; use proxies/session metadata only",
          "reviewRequirement": "human or agent review must approve this preview before metadata promotion",
          "summary": "\(escape(proofListenNote.trimmedNonEmpty(defaultValue: "not written")))",
          "audioEvidence": "\(escape(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written")))",
          "visualEvidence": "\(escape(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written")))",
          "cadenceGuidance": "\(escape(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written")))",
          "writesTimelineMetadata": false,
          "mutatesSourceMedia": false,
          "exportsRendered": false,
          "externalPublishing": false
        }
        """
    }

    private var proofListenApplyPreviewWorkOrder: String {
        var lines = [
            "Episode 4 apply-preview work order",
            "",
            "Purpose: prepare one reversible edit-preview task from proof-listen evidence without writing timeline truth.",
            "Decision: \(proofListenDecision)",
            "Evidence strength: \(proofListenEvidenceStrengthSummary)",
            "Cut craft: \(proofListenCutCraftIntentSummary)",
            "Queue triage: \(proofListenQueueTriageSummary)",
            "Promotion readiness: \(proofListenPromotionReadinessSummary)",
            "",
            "Work order:",
            "- Create a reversible preview only; do not promote directly to timeline metadata.",
            "- Preserve whole synced sources and the current source-media files.",
            "- Apply the smallest adjustment that tests the craft hypothesis.",
            "- Compare against the proof-listen notes before any human approval.",
            "",
            "Review evidence:",
            "- Summary: \(proofListenNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Audio/cadence evidence: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Visual/reaction evidence: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written"))",
            ""
        ]

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Apply-preview work-order boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private var proofListenCanCreateSourceRecoveryBrief: Bool {
        proofListenDecision == "needs-source"
    }

    private var proofListenCanCreateVisualReviewBrief: Bool {
        proofListenDecision == "needs-visual-review"
    }

    private var proofListenCanCreateApplyPreviewBrief: Bool {
        proofListenMissingEvidenceWarnings.isEmpty && ["keep", "refine"].contains(proofListenDecision)
    }

    private var proofListenCanCreateDecisionOutcomeBrief: Bool {
        ["reject", "hold", "needs-listen"].contains(proofListenDecision)
    }

    private var proofListenDecisionOutcomeBrief: String {
        let outcomeFocus: [String]
        switch proofListenDecision {
        case "reject":
            outcomeFocus = [
                "What the suggestion harmed: name the jump, cadence break, visual mismatch, or false emphasis.",
                "Future learning: avoid repeating this cut pattern unless stronger source or reaction cover evidence appears.",
                "Reviewer stance: rejection is useful evidence, not a failed workflow."
            ]
        case "hold":
            outcomeFocus = [
                "Missing choice: name the taste, episode-shape, source-context, or human-review decision that would unblock this.",
                "Revisit trigger: decide what evidence or reviewer perspective should bring it back.",
                "Reviewer stance: parked means protected, not forgotten."
            ]
        case "needs-listen":
            outcomeFocus = [
                "Proof still needed: listen for cadence, breath, overlap, sentence meaning, and whether the cut feels human.",
                "Risk: do not record or promote while the audio evidence is still prompt-like or incomplete.",
                "Reviewer stance: ears first, metadata later."
            ]
        default:
            outcomeFocus = [
                "This decision does not have a non-promoting outcome packet. Use apply-preview, source-recovery, or visual-review instead."
            ]
        }

        var lines = [
            "Episode 4 decision-outcome brief",
            "",
            "Purpose: preserve proof-listen learning without writing timeline truth.",
            "Decision: \(proofListenDecision)",
            "Evidence strength: \(proofListenEvidenceStrengthSummary)",
            "Next safe action: \(proofListenNextSafeActionSummary)",
            "Promotion readiness: \(proofListenPromotionReadinessSummary)",
            "",
            "Outcome focus:"
        ]
        lines.append(contentsOf: outcomeFocus.map { "- \($0)" })
        lines.append("")
        lines.append("Review evidence:")
        lines.append("- Summary: \(proofListenNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Audio/cadence evidence: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Visual/reaction evidence: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("- Preserve/tighten guidance: \(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written"))")
        lines.append("")

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Outcome boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private var proofListenSourceRecoveryBrief: String {
        var lines = [
            "Episode 4 source-recovery brief",
            "",
            "Purpose: route a proof-listen idea to real source recovery instead of inventing confidence.",
            "Decision: \(proofListenDecision)",
            "Next safe action: \(proofListenNextSafeActionSummary)",
            "Promotion readiness: \(proofListenPromotionReadinessSummary)",
            "",
            "What appears missing:",
            "- Watched clip, b-roll, reference media, or camera context named in notes: \(proofListenNote.trimmedNonEmpty(defaultValue: "not named yet"))",
            "- Visual/source evidence: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Audio/cadence reason this source matters: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))",
            "",
            "Recovery questions:",
            "- What source media would make this edit honest?",
            "- Is the missing media a watched clip, b-roll cutaway, camera angle, reference image/video, or transcript context?",
            "- Can the episode still work without it, or should this operation stay parked?",
            ""
        ]

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Source-recovery boundary:")
        lines.append("- This packet does not import media.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private var proofListenVisualReviewBrief: String {
        var lines = [
            "Episode 4 visual-review brief",
            "",
            "Purpose: route an audio-plausible proof-listen idea to visual proof before any apply-preview or metadata promotion.",
            "Decision: \(proofListenDecision)",
            "Next safe action: \(proofListenNextSafeActionSummary)",
            "Promotion readiness: \(proofListenPromotionReadinessSummary)",
            "",
            "Visual checks:",
            "- Reaction cover: does the listener face carry meaning or cover a jump better than another speaker cut?",
            "- Eye-line/body continuity: does the cut feel intentional rather than twitchy?",
            "- Source wall/program frame: does the visible frame support what the audio suggests?",
            "- Same-speaker jump: should this be covered, reframed, accepted, or rejected?",
            "",
            "Review evidence:",
            "- Summary: \(proofListenNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Audio/cadence evidence: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Visual/reaction evidence needed: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written"))",
            ""
        ]

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Visual-review boundary:")
        lines.append("- This packet does not inspect media by itself.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private var proofListenApplyPreviewBrief: String {
        var lines = [
            "Episode 4 apply-preview brief",
            "",
            "Purpose: carry one proof-listen decision into a reversible apply-preview review without writing timeline truth.",
            "Decision: \(proofListenDecision)",
            "Record guidance: \(proofListenRecordRecommendation)",
            "Evidence strength: \(proofListenEvidenceStrengthSummary)",
            "Next safe action: \(proofListenNextSafeActionSummary)",
            "Promotion readiness: \(proofListenPromotionReadinessSummary)",
            "",
            "Review note:",
            "- Summary: \(proofListenNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Audio/cadence evidence: \(proofListenAudioNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Visual/reaction evidence: \(proofListenVisualNote.trimmedNonEmpty(defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "not written"))",
            ""
        ]

        if !proofListenMissingEvidenceWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: proofListenMissingEvidenceWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Apply-preview boundary:")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        lines.append("- A later apply-preview pass must remain reversible until explicitly promoted.")
        return lines.joined(separator: "\n")
    }

    private var proofListenMissingEvidenceWarnings: [String] {
        snapshot.recipeProofListenMissingEvidenceWarnings(
            decision: proofListenDecision,
            summary: proofListenNote,
            audio: proofListenAudioNote,
            visual: proofListenVisualNote,
            cadence: proofListenCadenceNote
        )
    }

    private func proofListenDecisionCommand(record: Bool) -> String {
        let commandName = record
            ? "episode4-recipe-proof-listen-next-decision"
            : "episode4-recipe-proof-listen-next-decision-dry-run"
        return [
            "./script/agentctl.sh",
            commandName,
            proofListenDecision,
            shellQuoted(proofListenReviewer.trimmedNonEmpty(defaultValue: "Codex")),
            shellQuoted(proofListenNote.trimmedNonEmpty(defaultValue: "Proof-listened: add note here.")),
            "--audio-note",
            shellQuoted(proofListenAudioNote.trimmedNonEmpty(defaultValue: "Add what the ear proved.")),
            "--visual-note",
            shellQuoted(proofListenVisualNote.trimmedNonEmpty(defaultValue: "Add what the picture proved.")),
            "--cadence-note",
            shellQuoted(proofListenCadenceNote.trimmedNonEmpty(defaultValue: "Add what to preserve or tighten.")),
            "--markdown"
        ].joined(separator: " ")
    }

    private func shellQuoted(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
    }

    private func primeProofListenComposerForCurrentOperation() {
        let operationId = snapshot.recipeProofListenNextOperationId
        guard !operationId.isEmpty, operationId != proofListenComposerOperationId else { return }

        proofListenComposerOperationId = operationId
        proofListenDecision = snapshot.recipeProofListenNextSuggestedDecision.trimmedNonEmpty(defaultValue: "needs-listen")

        let range = snapshot.recipeProofListenNextSequenceLabel.trimmedNonEmpty(defaultValue: "current proof window")
        let risk = snapshot.recipeProofListenNextRisk.trimmedNonEmpty(defaultValue: "human-feeling cadence")
        proofListenNote = "Proof-listened \(range): review \(risk) before metadata promotion."
        proofListenAudioNote = snapshot.recipeProofListenNextListenChecks.first ?? ""
        proofListenVisualNote = snapshot.recipeProofListenNextVisualChecks.first ?? ""
        proofListenCadenceNote = snapshot.recipeProofListenNextProofQuestion.trimmedNonEmpty(defaultValue: "Preserve human rhythm unless the evidence says to tighten.")
    }

    private var clipRecoveryCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 8) {
                Label("Watched clip recovery", systemImage: "magnifyingglass.circle.fill")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text("\(snapshot.clipRecoveryItems.count) CUES")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
            }

            Text("Start here instead of re-watching blind. Drop likely files into the clip dropbox with the cue ID in the filename; Quipsly can match and weave after intake confirms media.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                metricPill("high confidence", "\(snapshot.watchedSourceHighConfidence)", snapshot.watchedSourceHighConfidence > 0 ? QuipslyStudioTheme.moss : QuipslyStudioTheme.sage)
                metricPill("audio windows", "\(snapshot.watchedSourceAudioReviewClips)", snapshot.watchedSourceAudioReviewClips > 0 ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.sage)
                metricPill("primary gaps", "\(snapshot.watchedSourcePrimaryPlaceholders)", snapshot.watchedSourcePrimaryPlaceholders > 0 ? QuipslyStudioTheme.honey : QuipslyStudioTheme.sage)
                metricPill("media dropped", "\(snapshot.watchedSourceDropboxMediaFiles)", snapshot.watchedSourceReadyForIntake ? QuipslyStudioTheme.moss : QuipslyStudioTheme.clay)
            }

            if !snapshot.watchedSourceNextSafestAction.isEmpty {
                Text(snapshot.watchedSourceNextSafestAction)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(snapshot.clipRecoveryItems.prefix(7))) { item in
                    clipRecoveryRow(item)
                }
            }

            if snapshot.clipRecoveryItems.count > 7 {
                Text("+ \(snapshot.clipRecoveryItems.count - 7) more cue window(s) in the shopping list.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 6) {
                Button {
                    openPath(snapshot.sourceClipShoppingListPath)
                } label: {
                    Label("Open full list", systemImage: "doc.text.magnifyingglass")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.sourceClipShoppingListPath.isEmpty)

                Button {
                    openPath(snapshot.watchedSourceRecoveryPath)
                } label: {
                    Label("Open packet", systemImage: "leaf")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(snapshot.watchedSourceRecoveryPath.isEmpty)

                Button {
                    copyText(activeSourceDropPath)
                } label: {
                    Label("Copy dropbox", systemImage: "folder.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.recipeCardGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.24), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func clipRecoveryRow(_ item: Episode4ClipRecoveryItem) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(item.cueId)
                    .font(.caption2.monospaced())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Text(item.confidenceLabel)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(item.confidenceColor)
                Spacer()
                Text(item.timeWindow)
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
            }

            if !item.evidencePreview.isEmpty {
                Text(item.evidencePreview)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !item.humanAction.isEmpty {
                Text(item.humanAction)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.86))
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !item.jCutHint.isEmpty || !item.lCutHint.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    if !item.jCutHint.isEmpty {
                        Text("J-cut: \(item.jCutHint)")
                            .font(.caption2)
                            .foregroundStyle(QuipslyStudioTheme.creekMist)
                    }
                    if !item.lCutHint.isEmpty {
                        Text("L-cut: \(item.lCutHint)")
                            .font(.caption2)
                            .foregroundStyle(QuipslyStudioTheme.creekMist)
                    }
                }
                .lineLimit(2)
            }

            HStack(spacing: 6) {
                if !item.audioReviewClipPath.isEmpty {
                    Button {
                        openPath(item.audioReviewClipPath)
                    } label: {
                        Text("Hear cue")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Open the extracted audio review window for this cue.")
                }

                Button {
                    copyText(item.filenameSuggestion)
                } label: {
                    Text("Copy name")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Copy a cue-safe filename starter for the watched/source clip.")

                Button {
                    copyText(item.timeWindow)
                } label: {
                    Text("Copy time")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
        }
        .padding(8)
        .background(item.confidenceColor.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(item.confidenceColor.opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
    }

    private func artifactCard(_ card: Episode4ArtifactCard) -> some View {
        let tint = tintForLevel(card.level)
        return VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 7) {
                Image(systemName: iconForLevel(card.level))
                    .foregroundStyle(tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(card.label)
                        .font(.caption)
                        .fontWeight(.black)
                    Text(card.status.replacingOccurrences(of: "-", with: " "))
                        .font(.caption2)
                        .foregroundStyle(tint)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 6)
            }

            Text(card.safeAction)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if !card.countsSummary.isEmpty {
                Text(card.countsSummary)
                    .font(.caption2.monospaced())
                    .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.86))
                    .lineLimit(2)
                    .truncationMode(.middle)
            }

            HStack(spacing: 6) {
                Button {
                    openPath(card.link)
                } label: {
                    Text("Open")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(card.link.isEmpty)

                Button {
                    copyText(card.link)
                } label: {
                    Image(systemName: "doc.on.doc")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(card.link.isEmpty)
            }
        }
        .padding(9)
        .background(tint.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 13, style: .continuous)
                .stroke(tint.opacity(0.16), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }

    private var emptyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("No Episode 4 board loaded", systemImage: "leaf")
                .font(.caption)
                .fontWeight(.black)
            Text("Generate the board with `./script/agentctl.sh episode4-start-here`, then refresh this panel.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(QuipslyStudioTheme.quietInsetGradient)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var truthFooter: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label("Truth boundary", systemImage: "checkmark.shield")
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
            Text("This panel reads sidecar artifacts only. It does not import clips, write SHOW/SKIP decisions, create shorts, export, publish, overwrite, or mutate source media.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(9)
        .background(QuipslyStudioTheme.creek.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func metricPill(_ label: String, _ value: String, _ tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.caption.monospacedDigit())
                .fontWeight(.black)
                .foregroundStyle(tint)
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(8)
        .background(tint.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func reload() {
        snapshot = Episode4CutIntelligenceSnapshot.load(
            startHerePointerPath: Self.startHerePointerPath,
            applyPreviewPointerPath: Self.applyPreviewPointerPath,
            sourceClipIntakePointerPath: Self.sourceClipIntakePointerPath,
            sourceClipCueReviewPointerPath: Self.sourceClipCueReviewPointerPath,
            editIntelligencePointerPath: Self.editIntelligencePointerPath,
            editReviewLedgerPointerPath: Self.editReviewLedgerPointerPath,
            editRehearsalPointerPath: Self.editRehearsalPointerPath,
            watchedSourceRecoveryPointerPath: Self.watchedSourceRecoveryPointerPath,
            sourcePlaceholderWorkbenchPointerPath: Self.sourcePlaceholderWorkbenchPointerPath,
            youtubeStandardRecipePointerPath: Self.youtubeStandardRecipePointerPath,
            youtubeRecipeReviewPointerPath: Self.youtubeRecipeReviewPointerPath,
            recipeProofListenQueuePointerPath: Self.recipeProofListenQueuePointerPath,
            recipeProofListenNextPointerPath: Self.recipeProofListenNextPointerPath
        )
        lastLoadedAt = Date()
        statusNote = snapshot.statusNote(loadedAt: lastLoadedAt)
        primeProofListenComposerForCurrentOperation()
    }

    private func tintForLevel(_ level: String) -> Color {
        if level.localizedCaseInsensitiveContains("attention") { return QuipslyStudioTheme.clay }
        if level.localizedCaseInsensitiveContains("review") { return QuipslyStudioTheme.honey }
        if level.localizedCaseInsensitiveContains("ready") { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.creekMist
    }

    private func iconForLevel(_ level: String) -> String {
        if level.localizedCaseInsensitiveContains("attention") { return "exclamationmark.triangle.fill" }
        if level.localizedCaseInsensitiveContains("review") { return "eye.fill" }
        if level.localizedCaseInsensitiveContains("ready") { return "checkmark.seal.fill" }
        return "circle.dashed"
    }

    private func openPath(_ path: String) {
        guard !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        #if os(macOS)
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
        #endif
    }

    private func revealPath(_ path: String) {
        guard !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        #if os(macOS)
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
        #endif
    }

    private func copyText(_ text: String) {
        #if os(macOS)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        statusNote = "Copied to clipboard."
        #else
        statusNote = text
        #endif
    }
}

private struct Episode4CutIntelligenceSnapshot {
    var status: String
    var startHerePath: String
    var applyPreviewPath: String
    var nextActions: [Episode4NextAction]
    var cards: [Episode4ArtifactCard]
    var applyStatus: String
    var applyCounts: Episode4ApplyCounts
    var applyOperations: [Episode4ApplyOperation]
    var sourceClipShoppingListPath: String
    var sourceClipIntakePath: String
    var sourceClipIntakeMarkdownPath: String
    var sourceClipRecoveryBoardPath: String
    var sourceClipRecoveryMarkdownPath: String
    var sourceClipCueReviewPath: String
    var sourceClipCueReviewMarkdownPath: String
    var sourceClipCueReviewAudioCount: Int
    var sourceClipCueReviewDropFolder: String
    var sourceClipCueReviewFirstPrompt: String
    var sourceClipCueReviewFirstAudioPath: String
    var editIntelligencePath: String
    var editIntelligenceMarkdownPath: String
    var editIntelligenceStatus: String
    var topShortCandidate: Episode4ShortCandidate?
    var topShortReview: Episode4ShortReview?
    var editRehearsalPath: String
    var editRehearsalMarkdownPath: String
    var editRehearsalStatus: String
    var editRehearsalMoves: Int
    var editRehearsalUnreviewedMoves: Int
    var editRehearsalSourceRequiredMoves: Int
    var editRehearsalNextSafestAction: String
    var topRehearsalMove: Episode4RehearsalMove?
    var cutStylePrinciples: [Episode4CutStylePrinciple]
    var cutStyleTechniques: [Episode4CutStyleTechnique]
    var cutStyleNotAllowed: [String]
    var watchedSourceRecoveryPath: String
    var watchedSourceRecoveryMarkdownPath: String
    var watchedSourceRecoveryStatus: String
    var watchedSourceHighConfidence: Int
    var watchedSourceAudioReviewClips: Int
    var watchedSourcePrimaryPlaceholders: Int
    var watchedSourceDropboxMediaFiles: Int
    var watchedSourceReadyForIntake: Bool
    var watchedSourceNextSafestAction: String
    var sourcePlaceholderWorkbenchPath: String
    var sourcePlaceholderWorkbenchStatus: String
    var sourcePlaceholderWorkbenchCount: Int
    var sourceClipCueReviewStatus: String
    var sourceClipCueReviewCount: Int
    var sourceClipIntakeStatus: String
    var sourceClipIntakeFiles: Int
    var sourceClipIntakeCueMatched: Int
    var sourceClipIntakeUnmatched: Int
    var clipRecoveryItems: [Episode4ClipRecoveryItem]
    var youtubeRecipePath: String
    var youtubeRecipeMarkdownPath: String
    var youtubeRecipeStatus: String
    var youtubeRecipeBranchId: String
    var youtubeRecipeTargetLabel: String
    var youtubeRecipeEstimatedKeepLabel: String
    var youtubeRecipeEstimatedRemoveLabel: String
    var youtubeRecipeInTargetWindow: Bool
    var youtubeRecipeShowCount: Int
    var youtubeRecipeSkipCount: Int
    var youtubeRecipeSpecialistCount: Int
    var youtubeRecipePlaceholderCount: Int
    var youtubeRecipeNextSafestAction: String
    var youtubeRecipeReviewPath: String
    var youtubeRecipeReviewMarkdownPath: String
    var youtubeRecipeReviewStatus: String
    var youtubeRecipeReviewOperations: Int
    var youtubeRecipeReviewReviewed: Int
    var youtubeRecipeReviewUnreviewed: Int
    var youtubeRecipeReviewNeeded: Int
    var youtubeRecipeReviewEvents: Int
    var youtubeRecipeReviewPending: Int
    var youtubeRecipeReviewNeedsListen: Int
    var youtubeRecipeReviewNeedsSource: Int
    var youtubeRecipeReviewNextSafestAction: String
    var recipeProofListenQueuePath: String
    var recipeProofListenQueueMarkdownPath: String
    var recipeProofListenQueueStatus: String
    var recipeProofListenQueueTasks: Int
    var recipeProofListenQueueListenFirst: Int
    var recipeProofListenQueueVisualReview: Int
    var recipeProofListenQueueSourceRecovery: Int
    var recipeProofListenQueueNextSafestAction: String
    var recipeProofListenNextPath: String
    var recipeProofListenNextMarkdownPath: String
    var recipeProofListenNextStatus: String
    var recipeProofListenNextOperationId: String
    var recipeProofListenNextOperationKind: String
    var recipeProofListenNextSequenceLabel: String
    var recipeProofListenNextReviewMode: String
    var recipeProofListenNextSuggestedDecision: String
    var recipeProofListenNextRisk: String
    var recipeProofListenNextProofQuestion: String
    var recipeProofListenNextWhyFirst: String
    var recipeProofListenNextAudioPath: String
    var recipeProofListenNextListenChecks: [String]
    var recipeProofListenNextVisualChecks: [String]
    var recipeProofListenPrimaryAction: Episode4ProofListenAction?
    var recipeProofListenSecondaryActions: [Episode4ProofListenAction]
    var recipeProofListenNextTimelineWriteAllowed: Bool
    var recipeProofListenNextSourceMutationAllowed: Bool

    static let empty = Episode4CutIntelligenceSnapshot(
        status: "not-loaded",
        startHerePath: "",
        applyPreviewPath: "",
        nextActions: [],
        cards: [],
        applyStatus: "not-loaded",
        applyCounts: Episode4ApplyCounts(),
        applyOperations: [],
        sourceClipShoppingListPath: "",
        sourceClipIntakePath: "",
        sourceClipIntakeMarkdownPath: "",
        sourceClipRecoveryBoardPath: "",
        sourceClipRecoveryMarkdownPath: "",
        sourceClipCueReviewPath: "",
        sourceClipCueReviewMarkdownPath: "",
        sourceClipCueReviewAudioCount: 0,
        sourceClipCueReviewDropFolder: "",
        sourceClipCueReviewFirstPrompt: "",
        sourceClipCueReviewFirstAudioPath: "",
        editIntelligencePath: "",
        editIntelligenceMarkdownPath: "",
        editIntelligenceStatus: "not-loaded",
        topShortCandidate: nil,
        topShortReview: nil,
        editRehearsalPath: "",
        editRehearsalMarkdownPath: "",
        editRehearsalStatus: "not-loaded",
        editRehearsalMoves: 0,
        editRehearsalUnreviewedMoves: 0,
        editRehearsalSourceRequiredMoves: 0,
        editRehearsalNextSafestAction: "",
        topRehearsalMove: nil,
        cutStylePrinciples: [],
        cutStyleTechniques: [],
        cutStyleNotAllowed: [],
        watchedSourceRecoveryPath: "",
        watchedSourceRecoveryMarkdownPath: "",
        watchedSourceRecoveryStatus: "not-loaded",
        watchedSourceHighConfidence: 0,
        watchedSourceAudioReviewClips: 0,
        watchedSourcePrimaryPlaceholders: 0,
        watchedSourceDropboxMediaFiles: 0,
        watchedSourceReadyForIntake: false,
        watchedSourceNextSafestAction: "",
        sourcePlaceholderWorkbenchPath: "",
        sourcePlaceholderWorkbenchStatus: "not-loaded",
        sourcePlaceholderWorkbenchCount: 0,
        sourceClipCueReviewStatus: "not-loaded",
        sourceClipCueReviewCount: 0,
        sourceClipIntakeStatus: "not-loaded",
        sourceClipIntakeFiles: 0,
        sourceClipIntakeCueMatched: 0,
        sourceClipIntakeUnmatched: 0,
        clipRecoveryItems: [],
        youtubeRecipePath: "",
        youtubeRecipeMarkdownPath: "",
        youtubeRecipeStatus: "not-loaded",
        youtubeRecipeBranchId: "",
        youtubeRecipeTargetLabel: "",
        youtubeRecipeEstimatedKeepLabel: "",
        youtubeRecipeEstimatedRemoveLabel: "",
        youtubeRecipeInTargetWindow: false,
        youtubeRecipeShowCount: 0,
        youtubeRecipeSkipCount: 0,
        youtubeRecipeSpecialistCount: 0,
        youtubeRecipePlaceholderCount: 0,
        youtubeRecipeNextSafestAction: "",
        youtubeRecipeReviewPath: "",
        youtubeRecipeReviewMarkdownPath: "",
        youtubeRecipeReviewStatus: "not-loaded",
        youtubeRecipeReviewOperations: 0,
        youtubeRecipeReviewReviewed: 0,
        youtubeRecipeReviewUnreviewed: 0,
        youtubeRecipeReviewNeeded: 0,
        youtubeRecipeReviewEvents: 0,
        youtubeRecipeReviewPending: 0,
        youtubeRecipeReviewNeedsListen: 0,
        youtubeRecipeReviewNeedsSource: 0,
        youtubeRecipeReviewNextSafestAction: "",
        recipeProofListenQueuePath: "",
        recipeProofListenQueueMarkdownPath: "",
        recipeProofListenQueueStatus: "not-loaded",
        recipeProofListenQueueTasks: 0,
        recipeProofListenQueueListenFirst: 0,
        recipeProofListenQueueVisualReview: 0,
        recipeProofListenQueueSourceRecovery: 0,
        recipeProofListenQueueNextSafestAction: "",
        recipeProofListenNextPath: "",
        recipeProofListenNextMarkdownPath: "",
        recipeProofListenNextStatus: "not-loaded",
        recipeProofListenNextOperationId: "",
        recipeProofListenNextOperationKind: "",
        recipeProofListenNextSequenceLabel: "",
        recipeProofListenNextReviewMode: "",
        recipeProofListenNextSuggestedDecision: "",
        recipeProofListenNextRisk: "",
        recipeProofListenNextProofQuestion: "",
        recipeProofListenNextWhyFirst: "",
        recipeProofListenNextAudioPath: "",
        recipeProofListenNextListenChecks: [],
        recipeProofListenNextVisualChecks: [],
        recipeProofListenPrimaryAction: nil,
        recipeProofListenSecondaryActions: [],
        recipeProofListenNextTimelineWriteAllowed: false,
        recipeProofListenNextSourceMutationAllowed: false
    )

    static func load(
        startHerePointerPath: String,
        applyPreviewPointerPath: String,
        sourceClipIntakePointerPath: String,
        sourceClipCueReviewPointerPath: String,
        editIntelligencePointerPath: String,
        editReviewLedgerPointerPath: String,
        editRehearsalPointerPath: String,
        watchedSourceRecoveryPointerPath: String,
        sourcePlaceholderWorkbenchPointerPath: String,
        youtubeStandardRecipePointerPath: String,
        youtubeRecipeReviewPointerPath: String,
        recipeProofListenQueuePointerPath: String,
        recipeProofListenNextPointerPath: String
    ) -> Episode4CutIntelligenceSnapshot {
        let startPointer = loadJSON(path: startHerePointerPath)
        let startPayload = loadPointedPayload(pointer: startPointer)
        let applyPointer = loadJSON(path: applyPreviewPointerPath)
        let applyPayload = loadPointedPayload(pointer: applyPointer)
        let intakePointer = loadJSON(path: sourceClipIntakePointerPath)
        let intakePayload = loadPointedPayload(pointer: intakePointer)
        let cueReviewPointer = loadJSON(path: sourceClipCueReviewPointerPath)
        let cueReviewPayload = loadPointedPayload(pointer: cueReviewPointer)
        let editIntelligencePointer = loadJSON(path: editIntelligencePointerPath)
        let editIntelligencePayload = loadPointedPayload(pointer: editIntelligencePointer)
        let editReviewLedgerPointer = loadJSON(path: editReviewLedgerPointerPath)
        let editReviewLedgerPayload = loadPointedPayload(pointer: editReviewLedgerPointer)
        let editRehearsalPointer = loadJSON(path: editRehearsalPointerPath)
        let editRehearsalPayload = loadPointedPayload(pointer: editRehearsalPointer)
        let watchedSourceRecoveryPointer = loadJSON(path: watchedSourceRecoveryPointerPath)
        let watchedSourceRecoveryPayload = loadPointedPayload(pointer: watchedSourceRecoveryPointer)
        let sourcePlaceholderPointer = loadJSON(path: sourcePlaceholderWorkbenchPointerPath)
        let sourcePlaceholderPayload = loadPointedPayload(pointer: sourcePlaceholderPointer)
        let youtubeRecipePointer = loadJSON(path: youtubeStandardRecipePointerPath)
        let youtubeRecipePayload = loadPointedPayload(pointer: youtubeRecipePointer)
        let youtubeRecipeReviewPointer = loadJSON(path: youtubeRecipeReviewPointerPath)
        let youtubeRecipeReviewPayload = loadPointedPayload(pointer: youtubeRecipeReviewPointer)
        let recipeProofListenQueuePointer = loadJSON(path: recipeProofListenQueuePointerPath)
        let recipeProofListenQueuePayload = loadPointedPayload(pointer: recipeProofListenQueuePointer)
        let recipeProofListenNextPointer = loadJSON(path: recipeProofListenNextPointerPath)
        let recipeProofListenNextPayload = loadPointedPayload(pointer: recipeProofListenNextPointer)
        let cards = array(startPayload["cards"]).map(Episode4ArtifactCard.init(payload:))
        let shoppingListPath = cards.first(where: { $0.key == "sourceClipShoppingList" })?.link ?? ""
        let intakeCounts = dictionary(intakePayload["counts"])
        let youtubeBranch = dictionary(youtubeRecipePayload["branch"]).isEmpty ? dictionary(youtubeRecipePointer["branch"]) : dictionary(youtubeRecipePayload["branch"])
        let youtubeDurationPlan = dictionary(youtubeRecipePayload["durationPlan"]).isEmpty ? dictionary(youtubeRecipePointer["durationPlan"]) : dictionary(youtubeRecipePayload["durationPlan"])
        let youtubeOperationCounts = dictionary(youtubeRecipePayload["operationCounts"]).isEmpty ? dictionary(youtubeRecipePointer["operationCounts"]) : dictionary(youtubeRecipePayload["operationCounts"])
        let youtubeRecipeReviewCounts = dictionary(youtubeRecipeReviewPayload["counts"]).isEmpty ? dictionary(youtubeRecipeReviewPointer["counts"]) : dictionary(youtubeRecipeReviewPayload["counts"])
        let youtubeRecipeReviewDecisionCounts = dictionary(youtubeRecipeReviewCounts["decisionCounts"])
        let recipeProofListenQueueCounts = dictionary(recipeProofListenQueuePayload["counts"]).isEmpty ? dictionary(recipeProofListenQueuePointer["counts"]) : dictionary(recipeProofListenQueuePayload["counts"])
        let recipeProofListenNextItem = dictionary(recipeProofListenNextPayload["item"])
        let recipeProofListenNextAudioClip = dictionary(recipeProofListenNextItem["audioReviewClip"])
        let recipeProofListenNextUIContract = dictionary(recipeProofListenNextPayload["uiContract"])
        let recipeProofListenNextPrimaryPayload = dictionary(recipeProofListenNextUIContract["primaryAction"])
        let recipeProofListenNextSafety = dictionary(recipeProofListenNextUIContract["safety"])
        let intakeNextActions = array(intakePayload["nextActions"]).map(Episode4NextAction.init(payload:))
        let startNextActions = array(startPayload["nextActions"]).map(Episode4NextAction.init(payload:))
        let watchedSourceCounts = dictionary(watchedSourceRecoveryPayload["counts"]).isEmpty
            ? dictionary(watchedSourceRecoveryPointer["counts"])
            : dictionary(watchedSourceRecoveryPayload["counts"])
        let watchedSourceRecoveryItems = array(watchedSourceRecoveryPayload["items"]).map(Episode4ClipRecoveryItem.init(payload:))
        let structuredRecoveryItems = array(intakePayload["cueRecoveryChecklist"]).map(Episode4ClipRecoveryItem.init(payload:))
        let markdownRecoveryItems = parseClipRecoveryItems(markdownPath: shoppingListPath)
        let cueReviewItems = array(cueReviewPayload["reviewItems"])
        let firstCueReviewPayload = dictionary(cueReviewPayload["firstReviewItem"]).isEmpty
            ? (cueReviewItems.first ?? [:])
            : dictionary(cueReviewPayload["firstReviewItem"])
        let firstCueReviewAudioClip = dictionary(firstCueReviewPayload["audioReviewClip"])
        let inferredCueAudioCount = cueReviewItems.filter { item in
            bool(item["audioReviewClipOk"]) || bool(dictionary(item["audioReviewClip"])["ok"])
        }.count
        let explicitCueAudioCount = int(cueReviewPayload["audioReviewClipCount"]) > 0
            ? int(cueReviewPayload["audioReviewClipCount"])
            : int(cueReviewPointer["audioReviewClipCount"])
        let cutStyleGuide = dictionary(editIntelligencePayload["cutStyleGuide"])
        let topShortPayload = array(editIntelligencePayload["shortCandidates"]).first ?? [:]
        let topShortId = string(topShortPayload["id"]) ?? ""
        let topShortReviewPayload = dictionary(dictionary(editReviewLedgerPayload["reviews"])[topShortId])
        let editRehearsalCounts = dictionary(editRehearsalPayload["counts"]).isEmpty
            ? dictionary(editRehearsalPointer["counts"])
            : dictionary(editRehearsalPayload["counts"])
        let topRehearsalPayload = array(editRehearsalPayload["moves"]).first ?? [:]

        return Episode4CutIntelligenceSnapshot(
            status: string(startPayload["status"]) ?? string(startPointer["status"]) ?? "missing",
            startHerePath: string(startPayload["htmlPath"]) ?? string(startPointer["htmlPath"]) ?? "",
            applyPreviewPath: string(applyPayload["htmlPath"]) ?? string(applyPointer["htmlPath"]) ?? "",
            nextActions: Self.mergedNextActions(primary: intakeNextActions, fallback: startNextActions),
            cards: cards,
            applyStatus: string(applyPayload["status"]) ?? string(applyPointer["status"]) ?? "missing",
            applyCounts: Episode4ApplyCounts(payload: dictionary(applyPayload["counts"])),
            applyOperations: array(applyPayload["operations"]).map(Episode4ApplyOperation.init(payload:)),
            sourceClipShoppingListPath: shoppingListPath,
            sourceClipIntakePath: string(intakePayload["htmlPath"]) ?? string(intakePointer["htmlPath"]) ?? "",
            sourceClipIntakeMarkdownPath: string(intakePayload["markdownPath"]) ?? string(intakePointer["markdownPath"]) ?? "",
            sourceClipRecoveryBoardPath: string(intakePayload["recoveryHtmlPath"]) ?? string(intakePointer["recoveryHtmlPath"]) ?? "",
            sourceClipRecoveryMarkdownPath: string(intakePayload["recoveryMarkdownPath"]) ?? string(intakePointer["recoveryMarkdownPath"]) ?? "",
            sourceClipCueReviewPath: string(cueReviewPayload["htmlPath"]) ?? string(cueReviewPointer["htmlPath"]) ?? "",
            sourceClipCueReviewMarkdownPath: string(cueReviewPayload["markdownPath"]) ?? string(cueReviewPointer["markdownPath"]) ?? "",
            sourceClipCueReviewAudioCount: explicitCueAudioCount > 0 ? explicitCueAudioCount : inferredCueAudioCount,
            sourceClipCueReviewDropFolder: string(cueReviewPayload["needsHumanIdentificationFolder"]) ?? string(cueReviewPointer["needsHumanIdentificationFolder"]) ?? "",
            sourceClipCueReviewFirstPrompt: string(firstCueReviewPayload["reviewPrompt"]) ?? "",
            sourceClipCueReviewFirstAudioPath: string(firstCueReviewPayload["audioReviewClipPath"]) ?? string(firstCueReviewAudioClip["path"]) ?? "",
            editIntelligencePath: string(editIntelligencePayload["htmlPath"]) ?? string(editIntelligencePointer["htmlPath"]) ?? "",
            editIntelligenceMarkdownPath: string(editIntelligencePayload["markdownPath"]) ?? string(editIntelligencePointer["markdownPath"]) ?? "",
            editIntelligenceStatus: string(editIntelligencePayload["status"]) ?? string(editIntelligencePointer["status"]) ?? "missing",
            topShortCandidate: topShortPayload.isEmpty ? nil : Episode4ShortCandidate(payload: topShortPayload),
            topShortReview: topShortId.isEmpty ? nil : Episode4ShortReview(proposalId: topShortId, payload: topShortReviewPayload),
            editRehearsalPath: string(editRehearsalPayload["htmlPath"]) ?? string(editRehearsalPointer["htmlPath"]) ?? "",
            editRehearsalMarkdownPath: string(editRehearsalPayload["markdownPath"]) ?? string(editRehearsalPointer["markdownPath"]) ?? "",
            editRehearsalStatus: string(editRehearsalPayload["status"]) ?? string(editRehearsalPointer["status"]) ?? "missing",
            editRehearsalMoves: int(editRehearsalCounts["moves"]),
            editRehearsalUnreviewedMoves: int(editRehearsalCounts["unreviewedMoves"]),
            editRehearsalSourceRequiredMoves: int(editRehearsalCounts["sourceRequiredMoves"]),
            editRehearsalNextSafestAction: string(editRehearsalPayload["nextSafestAction"]) ?? string(editRehearsalPointer["nextSafestAction"]) ?? "",
            topRehearsalMove: topRehearsalPayload.isEmpty ? nil : Episode4RehearsalMove(payload: topRehearsalPayload),
            cutStylePrinciples: array(cutStyleGuide["principles"]).map(Episode4CutStylePrinciple.init(payload:)),
            cutStyleTechniques: array(cutStyleGuide["techniques"]).map(Episode4CutStyleTechnique.init(payload:)),
            cutStyleNotAllowed: stringArray(cutStyleGuide["notAllowedYet"]),
            watchedSourceRecoveryPath: string(watchedSourceRecoveryPayload["htmlPath"]) ?? string(watchedSourceRecoveryPointer["htmlPath"]) ?? "",
            watchedSourceRecoveryMarkdownPath: string(watchedSourceRecoveryPayload["markdownPath"]) ?? string(watchedSourceRecoveryPointer["markdownPath"]) ?? "",
            watchedSourceRecoveryStatus: string(watchedSourceRecoveryPayload["status"]) ?? string(watchedSourceRecoveryPointer["status"]) ?? "missing",
            watchedSourceHighConfidence: int(watchedSourceCounts["highConfidence"]),
            watchedSourceAudioReviewClips: int(watchedSourceCounts["audioReviewClips"]),
            watchedSourcePrimaryPlaceholders: int(watchedSourceCounts["primaryPlaceholders"]),
            watchedSourceDropboxMediaFiles: int(watchedSourceCounts["dropboxFiles"]),
            watchedSourceReadyForIntake: bool(watchedSourceCounts["readyForIntake"]),
            watchedSourceNextSafestAction: string(watchedSourceRecoveryPayload["nextSafestAction"]) ?? string(watchedSourceRecoveryPointer["nextSafestAction"]) ?? "",
            sourcePlaceholderWorkbenchPath: string(sourcePlaceholderPayload["htmlPath"]) ?? string(sourcePlaceholderPointer["htmlPath"]) ?? "",
            sourcePlaceholderWorkbenchStatus: string(sourcePlaceholderPayload["status"]) ?? string(sourcePlaceholderPointer["status"]) ?? "missing",
            sourcePlaceholderWorkbenchCount: int(dictionary(sourcePlaceholderPayload["counts"])["sourcePlaceholders"]) > 0
                ? int(dictionary(sourcePlaceholderPayload["counts"])["sourcePlaceholders"])
                : int(dictionary(sourcePlaceholderPointer["counts"])["sourcePlaceholders"]),
            sourceClipCueReviewStatus: string(cueReviewPayload["status"]) ?? string(cueReviewPointer["status"]) ?? "missing",
            sourceClipCueReviewCount: int(cueReviewPayload["reviewItemCount"]) > 0
                ? int(cueReviewPayload["reviewItemCount"])
                : int(cueReviewPointer["reviewItemCount"]),
            sourceClipIntakeStatus: string(intakePayload["status"]) ?? string(intakePointer["status"]) ?? "missing",
            sourceClipIntakeFiles: int(intakeCounts["files"]),
            sourceClipIntakeCueMatched: int(intakeCounts["cueMatched"]),
            sourceClipIntakeUnmatched: int(intakeCounts["unmatched"]),
            clipRecoveryItems: watchedSourceRecoveryItems.isEmpty
                ? (structuredRecoveryItems.isEmpty ? markdownRecoveryItems : structuredRecoveryItems)
                : watchedSourceRecoveryItems,
            youtubeRecipePath: string(youtubeRecipePayload["htmlPath"]) ?? string(youtubeRecipePointer["htmlPath"]) ?? "",
            youtubeRecipeMarkdownPath: string(youtubeRecipePayload["markdownPath"]) ?? string(youtubeRecipePointer["markdownPath"]) ?? "",
            youtubeRecipeStatus: string(youtubeRecipePayload["status"]) ?? string(youtubeRecipePointer["status"]) ?? "missing",
            youtubeRecipeBranchId: string(youtubeBranch["branchId"]) ?? "",
            youtubeRecipeTargetLabel: string(youtubeDurationPlan["targetLabel"]) ?? "",
            youtubeRecipeEstimatedKeepLabel: string(youtubeDurationPlan["estimatedKeepLabel"]) ?? "",
            youtubeRecipeEstimatedRemoveLabel: string(youtubeDurationPlan["estimatedRemoveLabel"]) ?? "",
            youtubeRecipeInTargetWindow: bool(youtubeDurationPlan["inTargetWindow"]),
            youtubeRecipeShowCount: int(youtubeOperationCounts["showRangeReviews"]),
            youtubeRecipeSkipCount: int(youtubeOperationCounts["skipRangeReviews"]),
            youtubeRecipeSpecialistCount: int(youtubeOperationCounts["specialistReviews"]),
            youtubeRecipePlaceholderCount: int(youtubeOperationCounts["sourcePlaceholders"]),
            youtubeRecipeNextSafestAction: string(youtubeRecipePayload["nextSafestAction"]) ?? string(youtubeRecipePointer["nextSafestAction"]) ?? "",
            youtubeRecipeReviewPath: string(youtubeRecipeReviewPayload["htmlPath"]) ?? string(youtubeRecipeReviewPointer["htmlPath"]) ?? "",
            youtubeRecipeReviewMarkdownPath: string(youtubeRecipeReviewPayload["markdownPath"]) ?? string(youtubeRecipeReviewPointer["markdownPath"]) ?? "",
            youtubeRecipeReviewStatus: string(youtubeRecipeReviewPayload["status"]) ?? string(youtubeRecipeReviewPointer["status"]) ?? "missing",
            youtubeRecipeReviewOperations: int(youtubeRecipeReviewCounts["operations"]),
            youtubeRecipeReviewReviewed: int(youtubeRecipeReviewCounts["reviewed"]),
            youtubeRecipeReviewUnreviewed: int(youtubeRecipeReviewCounts["unreviewed"]),
            youtubeRecipeReviewNeeded: int(youtubeRecipeReviewCounts["reviewNeeded"]),
            youtubeRecipeReviewEvents: int(youtubeRecipeReviewCounts["events"]),
            youtubeRecipeReviewPending: int(youtubeRecipeReviewDecisionCounts["pending"]),
            youtubeRecipeReviewNeedsListen: int(youtubeRecipeReviewDecisionCounts["needs-listen"]),
            youtubeRecipeReviewNeedsSource: int(youtubeRecipeReviewDecisionCounts["needs-source"]),
            youtubeRecipeReviewNextSafestAction: string(youtubeRecipeReviewPayload["nextSafestAction"]) ?? string(youtubeRecipeReviewPointer["nextSafestAction"]) ?? "",
            recipeProofListenQueuePath: string(recipeProofListenQueuePayload["htmlPath"]) ?? string(recipeProofListenQueuePointer["htmlPath"]) ?? "",
            recipeProofListenQueueMarkdownPath: string(recipeProofListenQueuePayload["markdownPath"]) ?? string(recipeProofListenQueuePointer["markdownPath"]) ?? "",
            recipeProofListenQueueStatus: string(recipeProofListenQueuePayload["status"]) ?? string(recipeProofListenQueuePointer["status"]) ?? "missing",
            recipeProofListenQueueTasks: int(recipeProofListenQueueCounts["tasks"]),
            recipeProofListenQueueListenFirst: int(recipeProofListenQueueCounts["listenFirst"]),
            recipeProofListenQueueVisualReview: int(recipeProofListenQueueCounts["visualReview"]),
            recipeProofListenQueueSourceRecovery: int(recipeProofListenQueueCounts["sourceRecovery"]),
            recipeProofListenQueueNextSafestAction: string(recipeProofListenQueuePayload["nextSafestAction"]) ?? string(recipeProofListenQueuePointer["nextSafestAction"]) ?? "",
            recipeProofListenNextPath: string(recipeProofListenNextPayload["htmlPath"]) ?? string(recipeProofListenNextPointer["htmlPath"]) ?? "",
            recipeProofListenNextMarkdownPath: string(recipeProofListenNextPayload["markdownPath"]) ?? string(recipeProofListenNextPointer["markdownPath"]) ?? "",
            recipeProofListenNextStatus: string(recipeProofListenNextPayload["status"]) ?? string(recipeProofListenNextPointer["status"]) ?? "missing",
            recipeProofListenNextOperationId: string(recipeProofListenNextItem["operationId"]) ?? string(recipeProofListenNextPayload["operationId"]) ?? string(recipeProofListenNextPointer["operationId"]) ?? "",
            recipeProofListenNextOperationKind: string(recipeProofListenNextItem["operationKind"]) ?? string(recipeProofListenNextPayload["operationKind"]) ?? "",
            recipeProofListenNextSequenceLabel: string(recipeProofListenNextItem["sequenceLabel"]) ?? "",
            recipeProofListenNextReviewMode: string(recipeProofListenNextItem["reviewMode"]) ?? "",
            recipeProofListenNextSuggestedDecision: string(recipeProofListenNextItem["suggestedDecision"]) ?? string(recipeProofListenNextPayload["suggestedDecision"]) ?? string(recipeProofListenNextPointer["suggestedDecision"]) ?? "",
            recipeProofListenNextRisk: string(recipeProofListenNextItem["risk"]) ?? "",
            recipeProofListenNextProofQuestion: string(recipeProofListenNextItem["proofQuestion"]) ?? "",
            recipeProofListenNextWhyFirst: string(recipeProofListenNextItem["whyFirst"]) ?? "",
            recipeProofListenNextAudioPath: string(recipeProofListenNextAudioClip["path"]) ?? string(dictionary(recipeProofListenNextUIContract["bindsTo"])["audioReviewClipPath"]) ?? "",
            recipeProofListenNextListenChecks: stringArray(recipeProofListenNextItem["firstListenFor"]),
            recipeProofListenNextVisualChecks: stringArray(recipeProofListenNextItem["firstVisualCheck"]),
            recipeProofListenPrimaryAction: recipeProofListenNextPrimaryPayload.isEmpty ? nil : Episode4ProofListenAction(payload: recipeProofListenNextPrimaryPayload),
            recipeProofListenSecondaryActions: array(recipeProofListenNextUIContract["secondaryActions"]).map(Episode4ProofListenAction.init(payload:)),
            recipeProofListenNextTimelineWriteAllowed: bool(recipeProofListenNextSafety["timelineWriteAllowed"]),
            recipeProofListenNextSourceMutationAllowed: bool(recipeProofListenNextSafety["sourceMutationAllowed"])
        )
    }

    var hasYouTubeStandardRecipe: Bool {
        !youtubeRecipePath.isEmpty || !youtubeRecipeStatus.localizedCaseInsensitiveContains("not-loaded")
    }

    var hasYouTubeRecipeReviewLedger: Bool {
        !youtubeRecipeReviewPath.isEmpty || !youtubeRecipeReviewStatus.localizedCaseInsensitiveContains("not-loaded")
    }

    var hasRecipeProofListenQueue: Bool {
        !recipeProofListenQueuePath.isEmpty || !recipeProofListenQueueStatus.localizedCaseInsensitiveContains("not-loaded")
    }

    var hasRecipeProofListenNext: Bool {
        !recipeProofListenNextPath.isEmpty || !recipeProofListenNextOperationId.isEmpty || !recipeProofListenNextStatus.localizedCaseInsensitiveContains("not-loaded")
    }

    var proofListenCoverageLabel: String {
        guard youtubeRecipeReviewOperations > 0 else { return "0%" }
        let percent = Int((Double(youtubeRecipeReviewReviewed) / Double(max(youtubeRecipeReviewOperations, 1)) * 100).rounded())
        return "\(percent)%"
    }

    var proofListenCoverageColor: Color {
        guard youtubeRecipeReviewOperations > 0 else { return QuipslyStudioTheme.sage }
        if youtubeRecipeReviewNeeded == 0 { return QuipslyStudioTheme.moss }
        if youtubeRecipeReviewReviewed == 0 { return QuipslyStudioTheme.honey }
        return QuipslyStudioTheme.creekMist
    }

    var proofListenCoverageGuidance: String {
        if youtubeRecipeReviewOperations == 0 {
            return "No review ledger coverage has been loaded yet. Generate the recipe review ledger, then proof-listen the first host-spine item."
        }
        if youtubeRecipeReviewReviewed == 0 {
            return "No recipe operations have human/agent review evidence yet. Start with the current proof audio, then copy a dry-run note before recording anything."
        }
        if youtubeRecipeReviewNeeded > 0 {
            return "\(youtubeRecipeReviewNeeded) recipe operation(s) still need review evidence. Keep moving one proof-listen item at a time; do not promote metadata from unreviewed suggestions."
        }
        return "All loaded recipe operations have review evidence. The next safe step is an apply-preview pass, not source mutation."
    }

    var proofListenEvidenceGuidance: String {
        if youtubeRecipeReviewEvents == 0 {
            return "No sidecar review decisions have been recorded yet. That is honest, not bad: proof-listen one operation, copy the dry-run command, then record only if the evidence is clear."
        }
        if youtubeRecipeReviewNeedsSource > 0 {
            return "\(youtubeRecipeReviewNeedsSource) operation(s) need real watched/source media before they can become confident edit decisions."
        }
        if youtubeRecipeReviewNeedsListen > 0 {
            return "\(youtubeRecipeReviewNeedsListen) operation(s) still need ears-on proof. Keep cadence human; do not auto-tighten just because silence exists."
        }
        if youtubeRecipeReviewPending > 0 {
            return "\(youtubeRecipeReviewPending) operation(s) are still pending. Work one proof window at a time so review evidence stays useful."
        }
        return "Review evidence exists for the loaded operation set. Use it to refine the edit, not to pretend the whole episode is finished."
    }

    var recipeProofListenCutCraftRubric: [String] {
        var checks: [String] = []
        let kindAndRisk = "\(recipeProofListenNextOperationKind) \(recipeProofListenNextRisk)".lowercased()

        if kindAndRisk.contains("reaction") {
            checks.append("Reaction cover: use the listener's face when the reaction carries meaning or covers a jump cut better than another speaker cut.")
        }
        if kindAndRisk.contains("cadence") || kindAndRisk.contains("tight") || kindAndRisk.contains("pause") {
            checks.append("Cadence: tighten dead air and false starts, but preserve thinking pauses, breath, surprise, warmth, and the moment before a real answer.")
        }

        checks.append("J-cut: let incoming audio lead the picture only when it smooths a turn or prevents a harsh visual jump.")
        checks.append("L-cut: let outgoing audio or reaction linger when it preserves emotion, context, or conversational overlap.")
        checks.append("Jump cut: avoid same-speaker visual pops; cover with reaction, source media, reframing, or accept the cut only if the rhythm matters more.")
        checks.append("Needs-source: if the watched clip or b-roll is required to understand the moment, mark it needs-source instead of inventing confidence.")

        return Array(checks.prefix(6))
    }

    var recipeProofListenDecisionGuidanceLines: [String] {
        [
            "keep: \(recipeProofListenDecisionGuidance(decision: "keep"))",
            "refine: \(recipeProofListenDecisionGuidance(decision: "refine"))",
            "reject: \(recipeProofListenDecisionGuidance(decision: "reject"))",
            "hold: \(recipeProofListenDecisionGuidance(decision: "hold"))",
            "needs-listen: \(recipeProofListenDecisionGuidance(decision: "needs-listen"))",
            "needs-source: \(recipeProofListenDecisionGuidance(decision: "needs-source"))",
            "needs-visual-review: \(recipeProofListenDecisionGuidance(decision: "needs-visual-review"))"
        ]
    }

    var recipeProofListenEvidenceRequirementLines: [String] {
        Episode4CutIntelligenceBoardView.proofListenDecisionOptions.map { decision in
            "\(decision): \(recipeProofListenEvidenceRequirements(decision: decision).joined(separator: " | "))"
        }
    }

    func recipeProofListenDecisionGuidance(decision: String) -> String {
        switch decision {
        case "keep":
            return "Use keep only after the proof audio and picture both support the cut; this means the edit preserves rhythm and can move toward apply-preview."
        case "refine":
            return "Use refine when the idea is right but the boundary, cadence, reaction cover, source timing, or framing still needs adjustment."
        case "reject":
            return "Use reject when the suggestion makes the conversation feel less human, creates a bad jump, loses meaning, or solves a problem that was not real."
        case "hold":
            return "Use hold when the edit may be useful later but should not move forward until more context, source media, or human taste review is available."
        case "needs-source":
            return "Use needs-source when watched clips, b-roll, reference media, or missing camera context are required before the decision can be honest."
        case "needs-visual-review":
            return "Use needs-visual-review when the audio sounds plausible but the picture, reaction, eye-line, or jump-cut cover has not been verified."
        case "needs-listen":
            fallthrough
        default:
            return "Use needs-listen when nobody has proof-listened enough yet; do not promote a generated suggestion from this state."
        }
    }

    func recipeProofListenEvidenceRequirements(decision: String) -> [String] {
        switch decision {
        case "keep":
            return [
                "Audio proof: the cadence still sounds human after the proposed change.",
                "Visual proof: the picture/reaction/source cut supports the moment.",
                "Tradeoff proof: the edit removes friction without removing meaning."
            ]
        case "refine":
            return [
                "Name what needs refinement: boundary, cadence, reaction cover, source timing, framing, or caption/shorts context.",
                "Describe the failure mode so the next pass can change one thing on purpose.",
                "Keep the source intact; refinement is metadata, not clip damage."
            ]
        case "reject":
            return [
                "Say what the suggestion harms: rhythm, meaning, reaction, continuity, or trust.",
                "Prefer rejecting over forcing a clever edit that feels artificial.",
                "Leave enough evidence so the same bad suggestion is less likely next time."
            ]
        case "hold":
            return [
                "State what context is missing before this can move forward.",
                "Use hold for taste/context uncertainty, not for source-media gaps.",
                "Write the next safest review action."
            ]
        case "needs-source":
            return [
                "Name the missing watched clip, b-roll, reference media, or camera context if known.",
                "Explain why the edit cannot be honest without that media.",
                "Route to source recovery instead of inventing confidence."
            ]
        case "needs-visual-review":
            return [
                "Audio may be plausible, but picture/reaction/eye-line/jump-cut cover still needs checking.",
                "Identify the visual risk before metadata promotion.",
                "Use this when ears are ahead of eyes."
            ]
        case "needs-listen":
            fallthrough
        default:
            return [
                "Proof-listen the audio window before promoting the suggestion.",
                "Write what the ear proved about cadence, pause, breath, or over-cleaning risk.",
                "Do not mark keep/refine/reject until there is actual listening evidence."
            ]
        }
    }

    func recipeProofListenMissingEvidenceWarnings(
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String
    ) -> [String] {
        var warnings: [String] = []

        if Self.looksLikeEmptyOrPrompt(summary) {
            warnings.append("Short note still looks blank or prompt-like; summarize the actual review decision.")
        }
        if Self.looksLikeEmptyOrPrompt(audio) {
            warnings.append("Audio evidence is missing or still prompt-like; write what the ear actually proved.")
        }
        if decision == "keep", Self.looksLikeEmptyOrPrompt(visual) {
            warnings.append("Keep needs visual proof too; write what the picture/reaction/source cut actually supports.")
        }
        if decision == "needs-source", !Self.mentionsSourceNeed(summary: summary, visual: visual, cadence: cadence) {
            warnings.append("Needs-source should name the missing clip, b-roll, reference, or camera context if known.")
        }
        if decision == "refine", !Self.mentionsRefinementTarget(summary: summary, cadence: cadence) {
            warnings.append("Refine should name what changes next: boundary, cadence, reaction, source timing, framing, or captions.")
        }
        if decision == "reject", Self.looksLikeEmptyOrPrompt(cadence) {
            warnings.append("Reject should say what the suggestion harms so the same bad cut is less likely next time.")
        }
        if decision == "needs-visual-review", Self.looksLikeEmptyOrPrompt(visual) {
            warnings.append("Needs-visual-review should identify the picture/reaction/eye-line/jump-cut risk.")
        }

        return warnings
    }

    private static func looksLikeEmptyOrPrompt(_ value: String) -> Bool {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.isEmpty { return true }
        let promptMarkers = [
            "add what",
            "add note",
            "proof-listened: add",
            "preserve human rhythm unless",
            "what the ear proved",
            "what the picture proved",
            "current proof window"
        ]
        if promptMarkers.contains(where: { text.contains($0) }) { return true }
        return text.hasSuffix("?")
    }

    private static func mentionsSourceNeed(summary: String, visual: String, cadence: String) -> Bool {
        let text = "\(summary) \(visual) \(cadence)".lowercased()
        return ["source", "clip", "b-roll", "broll", "camera", "reference", "watched"].contains { text.contains($0) }
    }

    private static func mentionsRefinementTarget(summary: String, cadence: String) -> Bool {
        let text = "\(summary) \(cadence)".lowercased()
        return ["boundary", "cadence", "reaction", "source", "timing", "framing", "caption", "short", "pause", "jump"].contains { text.contains($0) }
    }

    var recipeProofListenReviewPacket: String {
        guard hasRecipeProofListenNext else { return "" }
        var lines = [
            "Episode 4 proof-listen review packet",
            "",
            "Purpose: review one generated edit idea for human rhythm before it can become trusted metadata.",
            "Operation: \(recipeProofListenNextOperationId.isEmpty ? "unknown" : recipeProofListenNextOperationId)",
            "Range: \(recipeProofListenNextSequenceLabel.isEmpty ? "unknown" : recipeProofListenNextSequenceLabel)",
            "Kind: \(recipeProofListenNextOperationKind.isEmpty ? "review" : recipeProofListenNextOperationKind)",
            "Mode: \(recipeProofListenNextReviewMode.isEmpty ? "listen-first" : recipeProofListenNextReviewMode)",
            "Suggested decision: \(recipeProofListenNextSuggestedDecision.isEmpty ? "needs-listen" : recipeProofListenNextSuggestedDecision)",
            "Risk: \(recipeProofListenNextRisk.isEmpty ? "human cadence" : recipeProofListenNextRisk)",
            "",
            "Current review evidence:",
            "- Operations: \(youtubeRecipeReviewOperations)",
            "- Reviewed: \(youtubeRecipeReviewReviewed)",
            "- Needs review: \(youtubeRecipeReviewNeeded)",
            "- Recorded events: \(youtubeRecipeReviewEvents)",
            "- Pending: \(youtubeRecipeReviewPending)",
            "- Needs listen: \(youtubeRecipeReviewNeedsListen)",
            "- Needs source: \(youtubeRecipeReviewNeedsSource)",
            "- Guidance: \(proofListenEvidenceGuidance)",
            ""
        ]

        lines.append("Cut craft checks:")
        lines.append(contentsOf: recipeProofListenCutCraftRubric.map { "- \($0)" })
        lines.append("")
        lines.append("Decision meanings:")
        lines.append(contentsOf: recipeProofListenDecisionGuidanceLines.map { "- \($0)" })
        lines.append("")
        lines.append("Decision evidence requirements:")
        lines.append(contentsOf: recipeProofListenEvidenceRequirementLines.map { "- \($0)" })
        lines.append("")

        if !recipeProofListenNextAudioPath.isEmpty {
            lines.append("Proof audio: \(recipeProofListenNextAudioPath)")
            lines.append("")
        }

        if !recipeProofListenNextProofQuestion.isEmpty {
            lines.append("Question:")
            lines.append(recipeProofListenNextProofQuestion)
            lines.append("")
        }

        if !recipeProofListenNextWhyFirst.isEmpty {
            lines.append("Why this is first:")
            lines.append(recipeProofListenNextWhyFirst)
            lines.append("")
        }

        if !recipeProofListenNextListenChecks.isEmpty {
            lines.append("Listen for:")
            lines.append(contentsOf: recipeProofListenNextListenChecks.map { "- \($0)" })
            lines.append("")
        }

        if !recipeProofListenNextVisualChecks.isEmpty {
            lines.append("Look for:")
            lines.append(contentsOf: recipeProofListenNextVisualChecks.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Review notes to fill:")
        lines.append("- Decision: keep / refine / reject / hold / needs-listen / needs-source / needs-visual-review")
        lines.append("- Audio evidence:")
        lines.append("- Visual evidence:")
        lines.append("- Cadence guidance:")
        lines.append("")
        lines.append("Safety boundary: this packet records nothing. Do not write timeline metadata, import clips, mutate source files, export, publish, or overwrite versions from this packet.")
        return lines.joined(separator: "\n")
    }

    var recipeProofListenReviewerPrompt: String {
        guard hasRecipeProofListenNext else { return "" }
        var lines = [
            "Episode 4 proof-listen review",
            "",
            "Operation: \(recipeProofListenNextOperationId.isEmpty ? "unknown" : recipeProofListenNextOperationId)",
            "Range: \(recipeProofListenNextSequenceLabel.isEmpty ? "unknown" : recipeProofListenNextSequenceLabel)",
            "Mode: \(recipeProofListenNextReviewMode.isEmpty ? "listen-first" : recipeProofListenNextReviewMode)",
            "Suggested decision: \(recipeProofListenNextSuggestedDecision.isEmpty ? "needs-listen" : recipeProofListenNextSuggestedDecision)",
            ""
        ]

        if !recipeProofListenNextAudioPath.isEmpty {
            lines.append("Proof audio: \(recipeProofListenNextAudioPath)")
            lines.append("")
        }

        if !recipeProofListenNextProofQuestion.isEmpty {
            lines.append("Main question: \(recipeProofListenNextProofQuestion)")
            lines.append("")
        }

        if !recipeProofListenNextWhyFirst.isEmpty {
            lines.append("Why this matters: \(recipeProofListenNextWhyFirst)")
            lines.append("")
        }

        if !recipeProofListenNextListenChecks.isEmpty {
            lines.append("Listen for:")
            lines.append(contentsOf: recipeProofListenNextListenChecks.map { "- \($0)" })
            lines.append("")
        }

        if !recipeProofListenNextVisualChecks.isEmpty {
            lines.append("Watch for:")
            lines.append(contentsOf: recipeProofListenNextVisualChecks.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Answer in plain English:")
        lines.append("- Keep, refine, reject, or needs-listen?")
        lines.append("- What did the audio/cadence prove?")
        lines.append("- What did the picture/reaction prove?")
        lines.append("- What should Quipsly preserve or tighten?")
        lines.append("")
        lines.append("Safety: this prompt is review-only. Do not overwrite edits or publish from this note.")

        return lines.joined(separator: "\n")
    }

    var hasCueReviewPrompt: Bool {
        !sourceClipCueReviewFirstPrompt.isEmpty || !sourceClipCueReviewFirstAudioPath.isEmpty
    }

    var hasCutStyleGuide: Bool {
        !cutStylePrinciples.isEmpty || !cutStyleTechniques.isEmpty || !editIntelligencePath.isEmpty
    }

    var hasEditRehearsal: Bool {
        !editRehearsalPath.isEmpty || editRehearsalMoves > 0 || !editRehearsalStatus.localizedCaseInsensitiveContains("not-loaded")
    }

    var cutStyleSummary: String {
        var lines = ["Episode 4 human-feeling cut style"]
        for principle in cutStylePrinciples {
            lines.append("- \(principle.label): \(principle.rule) Risk: \(principle.riskIfIgnored)")
        }
        if !cutStyleTechniques.isEmpty {
            lines.append("Techniques:")
            for technique in cutStyleTechniques {
                lines.append("- \(technique.label): \(technique.defaultRange.isEmpty ? "review before applying" : technique.defaultRange). \(technique.reviewQuestion)")
            }
        }
        if !cutStyleNotAllowed.isEmpty {
            lines.append("Not allowed yet:")
            for rule in cutStyleNotAllowed {
                lines.append("- \(rule)")
            }
        }
        return lines.joined(separator: "\n")
    }

    var primaryMissingCue: Episode4ClipRecoveryItem? {
        clipRecoveryItems.first(where: { $0.status.localizedCaseInsensitiveContains("missing") }) ?? clipRecoveryItems.first
    }

    func statusNote(loadedAt: Date?) -> String {
        let timeText = loadedAt.map { Self.timeFormatter.string(from: $0) } ?? "now"
        if cards.isEmpty {
            return "No start-here cards loaded at \(timeText). Generate artifacts, then refresh."
        }
        let blocked = applyCounts.blocked
        let placeholders = applyCounts.sourcePlaceholders
        let files = sourceClipIntakeFiles
        if files == 0 && placeholders > 0 {
            let cueText = clipRecoveryItems.isEmpty ? "" : " \(clipRecoveryItems.count) cue window(s) are ready for clip recovery."
            return "Loaded at \(timeText). Source clip intake is empty; \(placeholders) visible placeholder(s) keep the edit moving until clips are recovered.\(cueText)"
        }
        if files == 0 {
            let cueText = clipRecoveryItems.isEmpty ? "" : " \(clipRecoveryItems.count) cue window(s) are ready for clip recovery."
            return "Loaded at \(timeText). Source clip intake is empty; clip-weave operations cannot become real media yet.\(cueText)"
        }
        if blocked > 0 {
            return "Loaded at \(timeText). \(blocked) apply-preview operation(s) need review before timeline metadata."
        }
        return "Loaded at \(timeText). Review ready preview operations before applying anything."
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()

    private static func mergedNextActions(primary: [Episode4NextAction], fallback: [Episode4NextAction]) -> [Episode4NextAction] {
        guard !primary.isEmpty else { return fallback }
        var seen = Set(primary.map(\.id))
        var merged = primary
        for action in fallback where !seen.contains(action.id) {
            merged.append(action)
            seen.insert(action.id)
        }
        return merged
    }
}

private struct Episode4NextAction: Identifiable {
    var id: String { "\(priority)-\(title)" }
    let priority: String
    let title: String
    let why: String
    let command: String

    init(payload: [String: Any]) {
        priority = Episode4CutIntelligenceSnapshot.string(payload["priority"]) ?? "-"
        title = Episode4CutIntelligenceSnapshot.string(payload["title"]) ?? "Review Episode 4 state"
        why = Episode4CutIntelligenceSnapshot.string(payload["why"]) ?? ""
        command = Episode4CutIntelligenceSnapshot.string(payload["command"]) ?? ""
    }
}

private struct Episode4ProofListenAction: Identifiable {
    let id: String
    let label: String
    let intent: String
    let risk: String
    let writes: String
    let command: String
    let targetPath: String

    init(payload: [String: Any]) {
        id = Episode4CutIntelligenceSnapshot.string(payload["id"]) ?? UUID().uuidString
        label = Episode4CutIntelligenceSnapshot.string(payload["label"]) ?? "Review"
        intent = Episode4CutIntelligenceSnapshot.string(payload["intent"]) ?? ""
        risk = Episode4CutIntelligenceSnapshot.string(payload["risk"]) ?? "safe-review"
        writes = Episode4CutIntelligenceSnapshot.string(payload["writes"]) ?? "none"
        command = Episode4CutIntelligenceSnapshot.string(payload["command"]) ?? ""
        targetPath = Episode4CutIntelligenceSnapshot.string(payload["targetPath"]) ?? ""
    }

    var riskColor: Color {
        if risk.localizedCaseInsensitiveContains("ledger") { return QuipslyStudioTheme.honey }
        if risk.localizedCaseInsensitiveContains("preview") { return QuipslyStudioTheme.creekMist }
        if risk.localizedCaseInsensitiveContains("safe") { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.sage
    }
}

private struct Episode4ArtifactCard: Identifiable {
    var id: String { key }
    let key: String
    let label: String
    let status: String
    let level: String
    let link: String
    let safeAction: String
    let counts: [String: Any]

    init(payload: [String: Any]) {
        key = Episode4CutIntelligenceSnapshot.string(payload["key"]) ?? UUID().uuidString
        label = Episode4CutIntelligenceSnapshot.string(payload["label"]) ?? key
        status = Episode4CutIntelligenceSnapshot.string(payload["status"]) ?? "unknown"
        level = Episode4CutIntelligenceSnapshot.string(payload["level"]) ?? "info"
        link = Episode4CutIntelligenceSnapshot.string(payload["link"]) ?? ""
        safeAction = Episode4CutIntelligenceSnapshot.string(payload["safeAction"]) ?? ""
        counts = Episode4CutIntelligenceSnapshot.dictionary(payload["counts"])
    }

    var countsSummary: String {
        let preferred = ["files", "cueMatched", "proposals", "reviewed", "unreviewed", "events", "chunks", "segments", "words"]
        let parts = preferred.compactMap { key -> String? in
            guard let value = countValue(key) else { return nil }
            return "\(key): \(value)"
        }
        return parts.prefix(4).joined(separator: " · ")
    }

    func countInt(_ key: String) -> Int {
        if let value = counts[key] as? Int { return value }
        if let value = counts[key] as? NSNumber { return value.intValue }
        return 0
    }

    private func countValue(_ key: String) -> String? {
        if let value = counts[key] as? Int { return "\(value)" }
        if let value = counts[key] as? Double { return "\(Int(value))" }
        if let value = counts[key] as? NSNumber { return "\(value.intValue)" }
        if let value = counts[key] as? String { return value }
        return nil
    }
}

private struct Episode4ApplyCounts {
    var reviewed = 0
    var ready = 0
    var sourcePlaceholders = 0
    var blocked = 0
    var noop = 0

    init() {}

    init(payload: [String: Any]) {
        reviewed = Self.int(payload["reviewedOperations"])
        ready = Self.int(payload["readyForApplyPreviewReview"])
        sourcePlaceholders = Self.int(payload["sourcePlaceholders"])
        blocked = Self.int(payload["blocked"])
        noop = Self.int(payload["noop"])
    }

    var hasAnySignal: Bool {
        reviewed + ready + sourcePlaceholders + blocked + noop > 0
    }

    var statusColor: Color {
        if blocked > 0 { return QuipslyStudioTheme.clay }
        if sourcePlaceholders > 0 { return QuipslyStudioTheme.honey }
        if ready > 0 { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.sage
    }

    private static func int(_ value: Any?) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) ?? 0 }
        return 0
    }
}

private struct Episode4ApplyOperation: Identifiable {
    var id: String { proposalId }
    let proposalId: String
    let proposalGroup: String
    let decision: String
    let operationStatus: String
    let operationKind: String
    let reason: String

    var statusColor: Color {
        if operationStatus.localizedCaseInsensitiveContains("blocked") { return QuipslyStudioTheme.clay }
        if operationStatus.localizedCaseInsensitiveContains("placeholder") { return QuipslyStudioTheme.honey }
        if operationStatus.localizedCaseInsensitiveContains("ready") { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.sage
    }

    init(payload: [String: Any]) {
        proposalId = Episode4CutIntelligenceSnapshot.string(payload["proposalId"]) ?? UUID().uuidString
        proposalGroup = Episode4CutIntelligenceSnapshot.string(payload["proposalGroup"]) ?? ""
        decision = Episode4CutIntelligenceSnapshot.string(payload["decision"]) ?? ""
        operationStatus = Episode4CutIntelligenceSnapshot.string(payload["operationStatus"]) ?? "unknown"
        operationKind = Episode4CutIntelligenceSnapshot.string(payload["operationKind"]) ?? "unknown"
        reason = Episode4CutIntelligenceSnapshot.string(payload["reason"]) ?? ""
    }
}

private struct Episode4CutStylePrinciple: Identifiable {
    let id: String
    let label: String
    let rule: String
    let riskIfIgnored: String

    init(payload: [String: Any]) {
        id = Episode4CutIntelligenceSnapshot.string(payload["key"]) ?? UUID().uuidString
        label = Episode4CutIntelligenceSnapshot.string(payload["label"]) ?? "Cut principle"
        rule = Episode4CutIntelligenceSnapshot.string(payload["rule"]) ?? ""
        riskIfIgnored = Episode4CutIntelligenceSnapshot.string(payload["riskIfIgnored"]) ?? ""
    }
}

private struct Episode4CutStyleTechnique: Identifiable {
    let id: String
    let label: String
    let defaultRange: String
    let reviewQuestion: String

    init(payload: [String: Any]) {
        id = Episode4CutIntelligenceSnapshot.string(payload["key"]) ?? UUID().uuidString
        label = Episode4CutIntelligenceSnapshot.string(payload["label"]) ?? "Edit move"
        defaultRange = Episode4CutIntelligenceSnapshot.string(payload["defaultRange"]) ?? ""
        reviewQuestion = Episode4CutIntelligenceSnapshot.string(payload["reviewQuestion"]) ?? ""
    }
}

private struct Episode4ShortCandidate: Identifiable {
    let id: String
    let timeLabel: String
    let summary: String
    let hookType: String
    let captionDensity: String
    let captionGuidance: String
    let pacingRisk: String
    let platformFitSummary: String

    init(payload: [String: Any]) {
        id = Episode4CutIntelligenceSnapshot.string(payload["id"]) ?? UUID().uuidString
        timeLabel = Episode4CutIntelligenceSnapshot.string(payload["timeLabel"]) ?? "time unknown"
        summary = Episode4CutIntelligenceSnapshot.string(payload["summary"]) ?? ""
        hookType = Episode4CutIntelligenceSnapshot.string(payload["hookType"]) ?? "hook-review"
        let captionPlan = Episode4CutIntelligenceSnapshot.dictionary(payload["captionPlan"])
        captionDensity = Episode4CutIntelligenceSnapshot.string(captionPlan["density"]) ?? "review"
        captionGuidance = Episode4CutIntelligenceSnapshot.string(captionPlan["guidance"]) ?? "Review captions before export."
        pacingRisk = Episode4CutIntelligenceSnapshot.string(payload["pacingRisk"]) ?? "review"
        let variants = Episode4CutIntelligenceSnapshot.array(payload["platformVariants"])
        let strongCount = variants.filter { Episode4CutIntelligenceSnapshot.string($0["fit"]) == "strong" }.count
        let trimCount = variants.filter { Episode4CutIntelligenceSnapshot.string($0["fit"]) == "needs-trim" }.count
        if strongCount > 0 || trimCount > 0 {
            platformFitSummary = "\(strongCount) strong / \(trimCount) trim"
        } else {
            platformFitSummary = "review"
        }
    }
}

private struct Episode4ShortReview {
    let proposalId: String
    let status: String
    let decision: String
    let reviewer: String
    let hookNote: String
    let captionNote: String
    let platformNote: String
    let framingNote: String

    init(proposalId: String, payload: [String: Any]) {
        self.proposalId = proposalId
        status = Episode4CutIntelligenceSnapshot.string(payload["status"]) ?? "not-reviewed"
        decision = Episode4CutIntelligenceSnapshot.string(payload["decision"]) ?? "pending"
        reviewer = Episode4CutIntelligenceSnapshot.string(payload["reviewer"]) ?? ""
        hookNote = Episode4CutIntelligenceSnapshot.string(payload["hookNote"]) ?? ""
        captionNote = Episode4CutIntelligenceSnapshot.string(payload["captionNote"]) ?? ""
        platformNote = Episode4CutIntelligenceSnapshot.string(payload["platformNote"]) ?? ""
        framingNote = Episode4CutIntelligenceSnapshot.string(payload["framingNote"]) ?? ""
    }

    var statusLabel: String {
        status.replacingOccurrences(of: "-", with: " ")
    }

    var decisionLabel: String {
        decision.replacingOccurrences(of: "-", with: " ")
    }

    var reviewerLabel: String {
        reviewer.isEmpty ? "none" : reviewer
    }

    var missingLaneSummary: String {
        let missing = [
            ("hook", hookNote),
            ("caption", captionNote),
            ("platform", platformNote),
            ("framing", framingNote)
        ].compactMap { label, note in
            note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? label : nil
        }
        return missing.isEmpty ? "none" : missing.joined(separator: ", ")
    }

    var targetedNoteSummary: String {
        [
            ("Hook", hookNote),
            ("Caption", captionNote),
            ("Platform", platformNote),
            ("Framing", framingNote)
        ].compactMap { label, note in
            let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : "\(label): \(trimmed)"
        }.joined(separator: "\n")
    }

    var statusColor: Color {
        let normalized = status.lowercased()
        if normalized.contains("reviewed") || normalized.contains("complete") {
            return QuipslyStudioTheme.moss
        }
        if normalized.contains("blocked") || normalized.contains("rejected") {
            return QuipslyStudioTheme.clay
        }
        return QuipslyStudioTheme.honey
    }

    var decisionColor: Color {
        let normalized = decision.lowercased()
        if normalized.contains("accept") || normalized.contains("keep") {
            return QuipslyStudioTheme.moss
        }
        if normalized.contains("reject") {
            return QuipslyStudioTheme.clay
        }
        if normalized.contains("refine") {
            return QuipslyStudioTheme.creekMist
        }
        return QuipslyStudioTheme.honey
    }

    var missingLaneColor: Color {
        missingLaneSummary == "none" ? QuipslyStudioTheme.moss : QuipslyStudioTheme.honey
    }
}

private struct Episode4RehearsalMove: Identifiable {
    let id: String
    let proposalId: String
    let rehearsalKind: String
    let timeLabel: String
    let wouldCreate: String
    let programMove: String
    let cadenceGuardrail: String
    let reviewQuestion: String
    let reviewStatus: String
    let reviewDecision: String
    let reviewCommand: String
    let dryRunReviewCommand: String

    init(payload: [String: Any]) {
        proposalId = Episode4CutIntelligenceSnapshot.string(payload["proposalId"]) ?? UUID().uuidString
        id = proposalId
        rehearsalKind = Episode4CutIntelligenceSnapshot.string(payload["rehearsalKind"]) ?? "review-rehearsal"
        timeLabel = Episode4CutIntelligenceSnapshot.string(payload["timeLabel"]) ?? "time unknown"
        wouldCreate = Episode4CutIntelligenceSnapshot.string(payload["wouldCreate"]) ?? "reviewable edit move"
        programMove = Episode4CutIntelligenceSnapshot.string(payload["programMove"]) ?? "Open this move and review before applying."
        cadenceGuardrail = Episode4CutIntelligenceSnapshot.string(payload["cadenceGuardrail"]) ?? "Listen before tightening; preserve human cadence."
        reviewQuestion = Episode4CutIntelligenceSnapshot.string(payload["reviewQuestion"]) ?? ""
        reviewStatus = Episode4CutIntelligenceSnapshot.string(payload["reviewStatus"]) ?? "unreviewed"
        reviewDecision = Episode4CutIntelligenceSnapshot.string(payload["reviewDecision"]) ?? "pending"
        reviewCommand = Episode4CutIntelligenceSnapshot.string(payload["reviewCommand"]) ?? ""
        dryRunReviewCommand = Episode4CutIntelligenceSnapshot.string(payload["dryRunReviewCommand"]) ?? ""
    }

    var kindLabel: String {
        rehearsalKind.replacingOccurrences(of: "-", with: " ")
    }

    var kindColor: Color {
        if rehearsalKind.localizedCaseInsensitiveContains("source") { return QuipslyStudioTheme.clay }
        if rehearsalKind.localizedCaseInsensitiveContains("short") { return QuipslyStudioTheme.creekMist }
        if rehearsalKind.localizedCaseInsensitiveContains("cadence") { return QuipslyStudioTheme.honey }
        if rehearsalKind.localizedCaseInsensitiveContains("reaction") { return QuipslyStudioTheme.moss }
        return QuipslyStudioTheme.sage
    }
}

private struct Episode4ClipRecoveryItem: Identifiable {
    var id: String { cueId }
    let cueId: String
    let confidence: String
    let timeWindow: String
    let hitCount: String
    let suggestedFilename: String
    let status: String
    let humanAction: String
    let audioReviewClipPath: String
    let jCutHint: String
    let lCutHint: String
    let evidenceLines: [String]

    init(
        cueId: String,
        confidence: String,
        timeWindow: String,
        hitCount: String,
        suggestedFilename: String = "",
        status: String = "",
        humanAction: String = "",
        audioReviewClipPath: String = "",
        jCutHint: String = "",
        lCutHint: String = "",
        evidenceLines: [String]
    ) {
        self.cueId = cueId
        self.confidence = confidence
        self.timeWindow = timeWindow
        self.hitCount = hitCount
        self.suggestedFilename = suggestedFilename
        self.status = status
        self.humanAction = humanAction
        self.audioReviewClipPath = audioReviewClipPath
        self.jCutHint = jCutHint
        self.lCutHint = lCutHint
        self.evidenceLines = evidenceLines
    }

    init(payload: [String: Any]) {
        cueId = Episode4CutIntelligenceSnapshot.string(payload["cueId"]) ?? UUID().uuidString
        confidence = Episode4CutIntelligenceSnapshot.string(payload["confidence"]) ?? ""
        timeWindow = Episode4CutIntelligenceSnapshot.string(payload["reviewWindowLabel"])
            ?? Episode4CutIntelligenceSnapshot.string(payload["timeWindow"])
            ?? "time unknown"
        hitCount = Episode4CutIntelligenceSnapshot.string(payload["hitCount"]) ?? ""
        suggestedFilename = Episode4CutIntelligenceSnapshot.string(payload["suggestedFilename"]) ?? ""
        status = Episode4CutIntelligenceSnapshot.string(payload["status"]) ?? ""
        humanAction = Episode4CutIntelligenceSnapshot.string(payload["humanAction"]) ?? ""
        audioReviewClipPath = Episode4CutIntelligenceSnapshot.string(payload["audioReviewClipPath"]) ?? ""
        jCutHint = Episode4CutIntelligenceSnapshot.string(payload["jCutHint"]) ?? ""
        lCutHint = Episode4CutIntelligenceSnapshot.string(payload["lCutHint"]) ?? ""
        evidenceLines = (payload["evidence"] as? [String]) ?? []
    }

    var confidenceLabel: String {
        confidence.isEmpty ? "cue" : confidence.uppercased()
    }

    var confidenceColor: Color {
        if confidence.localizedCaseInsensitiveContains("high") { return QuipslyStudioTheme.moss }
        if confidence.localizedCaseInsensitiveContains("medium") { return QuipslyStudioTheme.honey }
        if confidence.localizedCaseInsensitiveContains("low") { return QuipslyStudioTheme.clay }
        return QuipslyStudioTheme.creekMist
    }

    var evidencePreview: String {
        let prefix = hitCount.isEmpty ? "" : "\(hitCount) hit(s): "
        return prefix + evidenceLines.prefix(2).joined(separator: " ")
    }

    var filenameSuggestion: String {
        suggestedFilename.isEmpty ? "\(cueId)-short-description.mp4" : suggestedFilename
    }
}

private extension Episode4CutIntelligenceSnapshot {
    static func loadJSON(path: String) -> [String: Any] {
        guard !path.isEmpty,
              let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return object
    }

    static func loadPointedPayload(pointer: [String: Any]) -> [String: Any] {
        for key in ["jsonPath", "ledgerPath", "manifestPath"] {
            guard let path = string(pointer[key]), !path.isEmpty else { continue }
            let payload = loadJSON(path: path)
            if !payload.isEmpty { return payload }
        }
        return pointer
    }

    static func array(_ value: Any?) -> [[String: Any]] {
        value as? [[String: Any]] ?? []
    }

    static func dictionary(_ value: Any?) -> [String: Any] {
        value as? [String: Any] ?? [:]
    }

    static func stringArray(_ value: Any?) -> [String] {
        (value as? [Any] ?? []).compactMap { string($0) }
    }

    static func string(_ value: Any?) -> String? {
        if let value = value as? String { return value }
        if let value { return String(describing: value) }
        return nil
    }

    static func int(_ value: Any?) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) ?? 0 }
        return 0
    }

    static func bool(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String {
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return ["true", "yes", "1"].contains(normalized)
        }
        return false
    }

    static func parseClipRecoveryItems(markdownPath: String) -> [Episode4ClipRecoveryItem] {
        guard !markdownPath.isEmpty,
              let text = try? String(contentsOfFile: markdownPath, encoding: .utf8) else {
            return []
        }

        var items: [Episode4ClipRecoveryItem] = []
        var cueId = ""
        var confidence = ""
        var timeWindow = ""
        var hitCount = ""
        var evidenceLines: [String] = []

        func flush() {
            guard !cueId.isEmpty else { return }
            items.append(
                Episode4ClipRecoveryItem(
                    cueId: cueId,
                    confidence: confidence,
                    timeWindow: timeWindow.isEmpty ? "time unknown" : timeWindow,
                    hitCount: hitCount,
                    evidenceLines: evidenceLines
                )
            )
        }

        for rawLine in text.components(separatedBy: .newlines) {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("### ep4-cue-") {
                flush()
                let title = line.replacingOccurrences(of: "### ", with: "")
                let parts = title.components(separatedBy: " - ")
                cueId = parts.first ?? ""
                confidence = parts.last?.replacingOccurrences(of: " confidence", with: "") ?? ""
                timeWindow = ""
                hitCount = ""
                evidenceLines = []
                continue
            }

            guard !cueId.isEmpty else { continue }

            if line.hasPrefix("- Episode review window:") {
                timeWindow = line.replacingOccurrences(of: "- Episode review window:", with: "")
                    .replacingOccurrences(of: "`", with: "")
                    .trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("- Hit count:") {
                hitCount = line.replacingOccurrences(of: "- Hit count:", with: "")
                    .replacingOccurrences(of: "`", with: "")
                    .trimmingCharacters(in: .whitespaces)
                continue
            }

            if line.hasPrefix("- `") {
                let cleaned = line
                    .replacingOccurrences(of: "- `", with: "")
                    .replacingOccurrences(of: "`", with: "")
                    .trimmingCharacters(in: .whitespaces)
                if !cleaned.localizedCaseInsensitiveContains("evidence words:") {
                    evidenceLines.append(cleaned)
                }
            }
        }

        flush()
        return items
    }
}

private extension String {
    func trimmedNonEmpty(defaultValue: String) -> String {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? defaultValue : trimmed
    }
}
