import SwiftUI

struct MobileStudioBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.teal.opacity(0.10),
                Color.orange.opacity(0.08),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct MobileHeroCard: View {
    let eyebrow: String
    let title: String
    let description: String

    var bodyView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow.uppercased())
                .font(.caption.bold())
                .tracking(1.1)
                .foregroundStyle(.teal)
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .black))
                .fixedSize(horizontal: false, vertical: true)
            Text(description)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    var body: some View {
        bodyView
    }
}

struct ManuscriptReaderPanel: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Living document", systemImage: "doc.text")
                    .font(.headline)
                Spacer()
                Text("3 visible cues")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            ForEach(blocks) { block in
                Button {
                    selectedBlockID = block.id
                } label: {
                    ManuscriptBlockCard(block: block, isSelected: selectedBlockID == block.id)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ManuscriptBlockCard: View {
    let block: MobileManuscriptBlock
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(block.label)
                    .font(.caption.bold())
                    .foregroundStyle(.teal)
                Spacer()
                if let speaker = block.speaker {
                    Label(speaker, systemImage: "person.wave.2")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(block.title)
                .font(.title3.bold())
                .foregroundStyle(.primary)

            Text(block.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let cue = block.clipCue {
                ClipCuePill(cue: cue)
            }

            TagWrap(tags: block.tags)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(isSelected ? Color.teal : Color.clear, lineWidth: 2)
        }
    }
}

struct ClipCuePill: View {
    let cue: MobileClipCue

    var body: some View {
        HStack {
            Image(systemName: "play.rectangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(cue.title)
                    .font(.caption.bold())
                Text("\(cue.timeRange) · \(cue.status)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Preview") {}
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(10)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct TagWrap: View {
    let tags: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.thinMaterial, in: Capsule())
            }
        }
    }
}

struct QuickActionRail: View {
    let actions: [MobileQuickAction]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Fast controls")
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(actions) { action in
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: action.systemImage)
                                .font(.title2)
                                .foregroundStyle(.teal)
                            Text(action.title)
                                .font(.headline)
                            Text(action.detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 160, alignment: .leading)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }
}

struct NativeCaptureContractPanel: View {
    let contract: NativeCaptureContract

    init(contract: NativeCaptureContract = .production) {
        self.contract = contract
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Production capture contract", systemImage: "checkmark.seal")
                        .font(.headline)
                    Text(contract.localSourceTruth)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let primaryCallPath = contract.primaryCallPath {
                        Text(primaryCallPath)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.teal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if let fallbackCallImport = contract.fallbackCallImport {
                        Text(fallbackCallImport)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer()
                Text(contract.productionFirst ? "SOURCE-SAFE" : "REVIEW")
                    .font(.caption2.bold())
                    .foregroundStyle(contract.productionFirst ? .green : .orange)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background((contract.productionFirst ? Color.green : Color.orange).opacity(0.14), in: Capsule())
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 148), spacing: 8)], alignment: .leading, spacing: 8) {
                ForEach(contract.modes) { mode in
                    VStack(alignment: .leading, spacing: 7) {
                        Image(systemName: mode.systemImage)
                            .font(.title3)
                            .foregroundStyle(.teal)
                        Text(mode.label)
                            .font(.subheadline.bold())
                        Text(mode.purpose)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(12)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
            }

            VStack(alignment: .leading, spacing: 6) {
                ContractRuleLine(systemImage: "icloud.and.arrow.up", text: contract.uploadRule)
                ContractRuleLine(systemImage: "checkmark.shield", text: contract.verificationRule)
                ContractRuleLine(systemImage: "externaldrive.badge.checkmark", text: contract.deletionRule)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.green.opacity(0.24), lineWidth: 1)
        }
        .accessibilityIdentifier("NativeCaptureContractPanel")
    }
}

private struct ContractRuleLine: View {
    let systemImage: String
    let text: String

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(.green)
                .frame(width: 18)
            Text(text)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

struct AppReviewProofPanel: View {
    private let proofLines: [(String, String, String)] = [
        (
            "person.badge.key",
            "Reviewer account",
            "Sign in with the reviewer email/password account, then confirm at least one visible capture session is available."
        ),
        (
            "hand.raised.fill",
            "Explicit consent",
            "Recording controls stay held until consent and microphone permission are visible. Joining a room is not recording."
        ),
        (
            "externaldrive.badge.checkmark",
            "Local source safety",
            "Recordings stay local until Quipsly verifies upload. Failed uploads become recoverable, not silent losses."
        ),
        (
            "doc.text.magnifyingglass",
            "Reviewable evidence",
            "Transcripts, packets, notes, action items, payment evidence, and provider receipts stay inspectable as separate states."
        ),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Label("App Review proof path", systemImage: "checklist.checked")
                        .font(.headline)
                    Text("What App Review can verify without triggering hidden side effects.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text("NO HIDDEN RECORDING")
                    .font(.caption2.bold())
                    .foregroundStyle(.orange)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(Color.orange.opacity(0.14), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 10) {
                ForEach(proofLines, id: \.1) { line in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: line.0)
                            .foregroundStyle(.teal)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.1)
                                .font(.caption.bold())
                            Text(line.2)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(Color.orange.opacity(0.22), lineWidth: 1)
        }
        .accessibilityIdentifier("AppReviewProofPanel")
    }
}

struct MobileCaptureRunwayPanel: View {
    @Binding var selectedSection: MobileWorkspaceSection
    @StateObject private var sessionClient = CaptureSessionClient()
    @StateObject private var readinessClient = CaptureReadinessClient()
    @StateObject private var uploadManager = UploadManager.shared
    @EnvironmentObject var audioCapture: AudioCaptureController

    private var session: MobileCaptureSession? {
        sessionClient.sessions.first
    }

    private var overallTint: Color {
        if audioCapture.isRecording { return .red }
        if uploadManager.recoverableUploadCount > 0 { return .orange }
        if session?.captureReadinessIsSafeToRecord == true { return .green }
        if session?.recordingConsentGranted == true { return .green }
        return .teal
    }

    private var primaryLine: String {
        if audioCapture.isRecording {
            return "Recording is active and visible. Keep this screen calm."
        }
        if uploadManager.recoverableUploadCount > 0 {
            return "A preserved local upload needs retry. Nothing was thrown away."
        }
        if let session {
            return session.captureReadinessNextAction
        }
        return sessionClient.errorMessage ?? "Create or assign a Quipsly coaching or podcast session, then refresh."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Capture runway", systemImage: "point.3.filled.connected.trianglepath.dotted")
                        .font(.headline)
                    Text(primaryLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(audioCapture.isRecording ? "LIVE" : sessionClient.status.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(overallTint)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(overallTint.opacity(0.14), in: Capsule())
            }

            if let session {
                VStack(alignment: .leading, spacing: 10) {
                    Text(session.displayTitle)
                        .font(.title3.bold())
                    Text(session.detailLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    CaptureReadinessVerdictCard(session: session)
                    MobileCaptureJourneyCard(session: session)
                    MobileCaptureActionPacketCard(session: session)
                    MobileCaptureLifecycleCard(session: session)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8)], alignment: .leading, spacing: 8) {
                        SafetyFact(
                            title: session.bookingBadgeLabel,
                            detail: session.scheduleEvidenceLine,
                            systemImage: "calendar.badge.clock",
                            tint: session.bookingTintIsReady ? .green : .orange
                        )
                        SafetyFact(
                            title: session.recordingConsentGranted ? "Consent ready" : "Consent needed",
                            detail: session.recordingConsentStatus ?? "not-created",
                            systemImage: session.recordingConsentGranted ? "checkmark.shield.fill" : "exclamationmark.shield",
                            tint: session.recordingConsentGranted ? .green : .orange
                        )
                        SafetyFact(
                            title: audioCapture.isRecording ? "Recording active" : "Recording locked",
                            detail: audioCapture.isRecording ? formattedDuration(audioCapture.currentDuration) : "Start from Record tab",
                            systemImage: audioCapture.isRecording ? "record.circle.fill" : "lock.shield",
                            tint: audioCapture.isRecording ? .red : .secondary
                        )
                        SafetyFact(
                            title: uploadManager.recoverableUploadCount > 0 ? "Upload recovery" : "Upload state",
                            detail: uploadManager.statusText ?? "No active upload",
                            systemImage: uploadManager.recoverableUploadCount > 0 ? "externaldrive.badge.icloud" : "icloud.and.arrow.up",
                            tint: uploadManager.recoverableUploadCount > 0 ? .orange : uploadManager.isUploading ? .teal : .secondary
                        )
                        SafetyFact(
                            title: session.transcriptBadgeLabel,
                            detail: session.packetBadgeLabel,
                            systemImage: "text.bubble",
                            tint: session.latestTranscriptStatus == "COMPLETED" ? .green : .orange
                        )
                    }

                    HStack(spacing: 8) {
                        StatusChip(label: session.providerBadgeLabel, tint: session.providerCanJoin == true ? .green : .orange)
                        StatusChip(label: "\(session.recordingCount) recording\(session.recordingCount == 1 ? "" : "s")", tint: session.recordingCount > 0 ? .green : .secondary)
                        StatusChip(label: "\(session.latestTranscriptSegmentCount ?? 0) transcript segments", tint: (session.latestTranscriptSegmentCount ?? 0) > 0 ? .teal : .secondary)
                    }

                    Text(session.afterCaptureLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text(sessionClient.status)
                        .font(.subheadline.bold())
                    Text(sessionClient.errorMessage ?? "No assigned capture sessions are visible yet. The Record tab can still explain readiness and account state.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            HStack(spacing: 10) {
                Button {
                    selectedSection = .recorder
                } label: {
                    Label(audioCapture.isRecording ? "Open live recorder" : "Open Record controls", systemImage: audioCapture.isRecording ? "record.circle.fill" : "mic.circle")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    Task {
                        await sessionClient.load()
                        await readinessClient.load()
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .disabled(sessionClient.status == "Loading" || readinessClient.isLoading)
            }

            if let readiness = readinessClient.readiness {
                Text(readiness.appStoreRiskLine)
                    .font(.caption2.bold())
                    .foregroundStyle(readiness.appStoreReadiness?.hiddenRecordingAllowed == false ? .green : .orange)
            }

            NativeCaptureContractPanel(
                contract: readinessClient.readiness?.nativeCaptureContract ?? .production
            )
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(overallTint.opacity(0.35), lineWidth: 1)
        }
        .task {
            if sessionClient.sessions.isEmpty {
                await sessionClient.load()
            }
            if readinessClient.readiness == nil {
                await readinessClient.load()
            }
        }
        .accessibilityIdentifier("RecorderControlBoard")
    }

    private func formattedDuration(_ value: TimeInterval) -> String {
        let totalSeconds = Int(value)
        return String(format: "%02d:%02d", totalSeconds / 60, totalSeconds % 60)
    }
}

struct MobileCaptureReviewDigestPanel: View {
    @StateObject private var digestClient = CaptureReviewDigestClient()

    private var response: MobileCaptureReviewDigestResponse? {
        digestClient.response
    }

    private var digest: MobileCaptureReviewDigest? {
        response?.digest
    }

    private var tint: Color {
        if digestClient.errorMessage != nil { return .orange }
        if (digest?.reviewReady ?? 0) > 0 { return .green }
        if (digest?.readyToCapture ?? 0) > 0 || (digest?.localFallbackReady ?? 0) > 0 { return .teal }
        return .blue
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "list.bullet.clipboard.fill")
                    .foregroundStyle(tint)
                    .font(.title3)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Review digest")
                        .font(.headline)
                    Text(response?.boundaries?.safetyLine ?? "Authenticated readback for capture readiness, blockers, and next actions.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(digestClient.status.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 9)
                    .padding(.vertical, 5)
                    .background(tint.opacity(0.14), in: Capsule())
            }

            if let error = digestClient.errorMessage {
                Text(error)
                    .font(.caption.bold())
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }

            ReviewerDigestBoundaryCard(
                sourceOfTruth: response?.boundaries?.sourceOfTruth,
                safetyLine: response?.boundaries?.safetyLine
            )

            if let digest {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], alignment: .leading, spacing: 8) {
                    SafetyFact(
                        title: "\(digest.sessionCount ?? 0) sessions",
                        detail: "visible to this account",
                        systemImage: "rectangle.stack.person.crop",
                        tint: digest.hasVisibleWork ? .teal : .secondary
                    )
                    SafetyFact(
                        title: "\(digest.readyToCapture ?? 0) ready",
                        detail: "safe to capture now",
                        systemImage: "mic.badge.plus",
                        tint: (digest.readyToCapture ?? 0) > 0 ? .green : .secondary
                    )
                    SafetyFact(
                        title: "\(digest.needsConsent ?? 0) consent",
                        detail: "needs explicit yes",
                        systemImage: "checkmark.shield",
                        tint: (digest.needsConsent ?? 0) > 0 ? .orange : .green
                    )
                    SafetyFact(
                        title: "\(digest.paymentHold ?? 0) payment",
                        detail: "held before capture",
                        systemImage: "creditcard",
                        tint: (digest.paymentHold ?? 0) > 0 ? .orange : .secondary
                    )
                    SafetyFact(
                        title: "\(digest.capturePlumbingEvidence ?? digest.recordingEvidence ?? 0) capture proofs",
                        detail: "receipt or uploaded source exists",
                        systemImage: "waveform",
                        tint: (digest.capturePlumbingEvidence ?? digest.recordingEvidence ?? 0) > 0 ? .orange : .secondary
                    )
                    SafetyFact(
                        title: "\(digest.substantialRecordingEvidence ?? 0) substantial",
                        detail: "non-simulator verified content",
                        systemImage: "waveform.badge.checkmark",
                        tint: (digest.substantialRecordingEvidence ?? 0) > 0 ? .green : .secondary
                    )
                    SafetyFact(
                        title: "\(digest.reviewReady ?? 0) review",
                        detail: "packet ready for human",
                        systemImage: "doc.text.magnifyingglass",
                        tint: (digest.reviewReady ?? 0) > 0 ? .green : .secondary
                    )
                }

                if let blockers = digest.blockers, !blockers.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Label("Most common blockers", systemImage: "exclamationmark.triangle")
                            .font(.caption.bold())
                        ForEach(blockers.prefix(5)) { blocker in
                            Text(blocker.displayLine)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                if let nextActions = digest.nextActions, !nextActions.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Next safe actions", systemImage: "arrow.forward.circle")
                            .font(.caption.bold())
                        ForEach(nextActions.prefix(4)) { action in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(action.titleLabel)
                                    .font(.caption.bold())
                                Text(action.nextAction ?? action.stage ?? "Review this capture session.")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                if let actionPackets = digest.actionPackets, !actionPackets.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Action packets", systemImage: "switch.2")
                            .font(.caption.bold())
                        ForEach(Array(actionPackets.prefix(4).enumerated()), id: \.offset) { _, packet in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(packet.stage ?? packet.packetKind ?? "Capture action packet")
                                    .font(.caption.bold())
                                    .lineLimit(1)
                                Text(packet.nextAction ?? "Review this packet before acting.")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                if let blockers = packet.blockers, !blockers.isEmpty {
                                    Text("\(blockers.count) blocker\(blockers.count == 1 ? "" : "s"): \(blockers.prefix(2).joined(separator: ", "))")
                                        .font(.caption2)
                                        .foregroundStyle(.orange)
                                        .lineLimit(2)
                                }
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                if let sessions = digest.sessions, !sessions.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Visible session receipts", systemImage: "checklist")
                            .font(.caption.bold())
                        ForEach(sessions.prefix(4)) { session in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: session.canRecordNow == true ? "checkmark.seal.fill" : "circle.dashed")
                                    .foregroundStyle(session.canRecordNow == true ? .green : .secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(session.titleLabel)
                                        .font(.caption.bold())
                                        .lineLimit(1)
                                    Text(session.nextAction ?? session.stageLabel)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                Spacer()
                                StatusChip(label: session.stageLabel, tint: session.isReviewReady ? .green : .teal)
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }

                Text(response?.boundaries?.sourceOfTruth ?? "Nest owns operational capture truth. This panel summarizes it without starting anything.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("Refresh after sign-in to show what is ready, blocked, recorded, transcribed, and reviewable.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Button {
                Task { await digestClient.load() }
            } label: {
                Label(digestClient.isLoading ? "Refreshing" : "Refresh digest", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.bordered)
            .disabled(digestClient.isLoading)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(tint.opacity(0.30), lineWidth: 1)
        }
        .accessibilityIdentifier("MobileCaptureReviewDigestPanel")
        .task {
            if digestClient.response == nil {
                await digestClient.load()
            }
        }
    }
}

struct ReviewerDigestBoundaryCard: View {
    let sourceOfTruth: String?
    let safetyLine: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Read-only reviewer packet", systemImage: "eye")
                .font(.caption.bold())
            Text(safetyLine ?? "Refresh only reads Nest capture evidence. It does not join a room, start recording, charge, publish, schedule, invite, upload, or delete media.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Text(sourceOfTruth ?? "Nest owns session, consent, recording, transcript, packet, and review truth.")
                .font(.caption2)
                .foregroundStyle(.teal)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("ReviewerDigestBoundaryCard")
    }
}

struct RecorderControlBoard: View {
    @StateObject private var uploadManager = UploadManager.shared
    @StateObject private var sessionClient = CaptureSessionClient()
    @StateObject private var readinessClient = CaptureReadinessClient()
    @StateObject private var providerRoom = ProviderRoomController()
    @EnvironmentObject var audioCapture: AudioCaptureController
    @State private var sessionLabel = "Ad hoc coaching or podcast capture"
    @State private var quickSessionPurpose = "COACHING"
    @State private var selectedSessionId: String?
    @State private var isCreatingSession = false
    @State private var isPreparingRecording = false
    @State private var isUpdatingConsent = false
    @State private var showsConsentConfirmation = false
    @State private var isUpdatingRoom = false
    @State private var isRunningTranscript = false
    @State private var isBuildingPacket = false
    @State private var isReviewingPacketLane = false
    @State private var isPreparingProviderRecording = false
    @State private var isControllingProviderRecording = false
    @State private var isPromotingRecording = false
    @State private var roomJoinMessage: String?
    @State private var roomJoinResponse: MobileCaptureRoomJoinResponse?
    @State private var roomJoinOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    @State private var roomJoinDiagnostic: MobileCaptureRoomJoinDiagnosticResponse?
    @State private var createSessionMessage: String?
    @State private var afterCaptureMessage: String?

    private var selectedSession: MobileCaptureSession? {
        selectedSessionId.flatMap { id in sessionClient.sessions.first { $0.id == id } } ?? sessionClient.sessions.first
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                MobileHeroCard(
                    eyebrow: "Capture spine",
                    title: "Record locally. Upload calmly.",
                    description: "The iPhone app should keep high quality local audio even if the network gets weird, then upload in chunks when it can."
                )

                CaptureReadinessPanel(client: readinessClient)

                RecordingSafetyStrip(
                    readiness: readinessClient.readiness,
                    selectedSession: selectedSession,
                    isRecording: audioCapture.isRecording
                )

                CaptureWorkflowMapCard(
                    selectedSession: selectedSession,
                    isRecording: audioCapture.isRecording
                )

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Quipsly session", systemImage: "calendar.badge.clock")
                            .font(.headline)
                        Spacer()
                        Button {
                            Task {
                                await sessionClient.load()
                                if let sessionID = selectedSessionId ?? sessionClient.sessions.first?.id {
                                    await sessionClient.refreshClientFollowUp(forSessionID: sessionID)
                                }
                                await readinessClient.load()
                            }
                        } label: {
                            Label("Refresh", systemImage: "arrow.clockwise")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Session title", text: $sessionLabel)
                            .textFieldStyle(.roundedBorder)
                            .disabled(audioCapture.isRecording || isCreatingSession)

                        Picker("Purpose", selection: $quickSessionPurpose) {
                            Text("Coaching").tag("COACHING")
                            Text("Podcast").tag("PODCAST")
                            Text("Research").tag("RESEARCH_INTERVIEW")
                            Text("Meeting").tag("INTERNAL_MEETING")
                        }
                        .pickerStyle(.menu)
                        .disabled(audioCapture.isRecording || isCreatingSession)

                        Button {
                            Task { await createQuickCaptureSession() }
                        } label: {
                            Label(
                                isCreatingSession ? "Creating Quipsly session" : "Create Quipsly session",
                                systemImage: "plus.circle"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(audioCapture.isRecording || isCreatingSession)

                        Text(createSessionMessage ?? "Creates a Quipsly-owned room, host participant, and requested consent record. It does not start recording, join LiveKit, charge, schedule, invite, or publish.")
                            .font(.caption)
                            .foregroundColor(createSessionMessage == nil ? Color.secondary : Color.teal)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityIdentifier("QuickCaptureSessionCreator")

                    if sessionClient.sessions.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(sessionClient.status)
                                .font(.subheadline.bold())
                            Text(sessionClient.errorMessage ?? "Create a Quipsly session here, or assign a coaching/podcast session in Nest, then refresh before recording.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } else {
                        Picker("Session", selection: Binding(
                            get: { selectedSessionId ?? selectedSession?.id },
                            set: {
                                selectedSessionId = $0
                                roomJoinResponse = nil
                                roomJoinOwnerSnapshot = nil
                                roomJoinDiagnostic = nil
                                roomJoinMessage = nil
                                if let sessionID = $0 {
                                    Task {
                                        await sessionClient.refreshClientFollowUp(forSessionID: sessionID)
                                    }
                                }
                            }
                        )) {
                            ForEach(sessionClient.sessions) { session in
                                VStack(alignment: .leading) {
                                    Text(session.displayTitle)
                                    Text(session.detailLine)
                                }
                                .tag(Optional(session.id))
                            }
                        }
                        .pickerStyle(.menu)
                        .disabled(audioCapture.isRecording)

                        if let session = selectedSession {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(session.displayTitle)
                                    .font(.subheadline.bold())
                                Text(session.detailLine)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text(session.nextAction ?? "Confirm consent before recording.")
                                    .font(.caption.bold())
                                    .foregroundStyle(session.recordingConsentGranted ? .green : .orange)
                                if let errorMessage = sessionClient.errorMessage {
                                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                                        .font(.caption2)
                                        .foregroundStyle(.orange)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .accessibilityIdentifier("CaptureSessionSyncStatus")
                                } else {
                                    Label(
                                        session.clientFollowUp == nil
                                            ? "Session current · no released client follow-up"
                                            : "Session current · released client follow-up ready",
                                        systemImage: session.clientFollowUp == nil
                                            ? "checkmark.icloud"
                                            : "person.crop.circle.badge.checkmark"
                                    )
                                    .font(.caption2.bold())
                                    .foregroundStyle(session.clientFollowUp == nil ? Color.secondary : Color.green)
                                    .accessibilityIdentifier("CaptureSessionSyncStatus")
                                }
                                CaptureReadinessVerdictCard(session: session)
                                MobileCaptureJourneyCard(session: session)
                                MobileCaptureLifecycleCard(session: session)
                                CaptureSessionContextPanel(session: session, sessionClient: sessionClient)
                                if session.clientFollowUp != nil {
                                    MobileClientFollowUpCard(
                                        session: session,
                                        sessionClient: sessionClient
                                    )
                                }
                                RoomSpinePanel(
                                    session: session,
                                    roomJoinResponse: roomJoinResponse,
                                    roomJoinDiagnostic: roomJoinDiagnostic,
                                    roomJoinMessage: roomJoinMessage,
                                    isRecording: audioCapture.isRecording,
                                    isUpdatingRoom: isUpdatingRoom,
                                    onInspect: {
                                        Task {
                                            let diagnostic = await sessionClient.inspectRoomJoin(for: session)
                                            roomJoinDiagnostic = diagnostic
                                            roomJoinMessage = diagnostic?.readinessLine
                                        }
                                    },
                                    onPrepare: {
                                        Task {
                                            guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
                                                roomJoinMessage = "Verify the current Quipsly account before preparing the provider room."
                                                return
                                            }
                                            let response = await sessionClient.prepareRoomJoin(for: session)
                                            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                                                roomJoinResponse = nil
                                                roomJoinOwnerSnapshot = nil
                                                roomJoinMessage = "The account changed while the room was prepared. The prior join packet was discarded."
                                                return
                                            }
                                            roomJoinResponse = response
                                            roomJoinOwnerSnapshot = response == nil ? nil : ownerSnapshot
                                            roomJoinMessage = response?.readinessLine
                                        }
                                    },
                                    onOpen: {
                                        Task { await updateRoomState("OPEN") }
                                    },
                                    onEnd: {
                                        Task { await updateRoomState("END") }
                                    }
                                )

                                ProviderRoomView(
                                    controller: providerRoom,
                                    session: session,
                                    joinResponse: roomJoinResponse,
                                    joinOwnerSnapshot: roomJoinOwnerSnapshot,
                                    joinDiagnostic: roomJoinDiagnostic,
                                    isRecording: audioCapture.isRecording,
                                    isPreparingProviderRecording: isPreparingProviderRecording,
                                    isControllingProviderRecording: isControllingProviderRecording,
                                    onPrepareProviderRecording: {
                                        Task { await prepareProviderRecordingReceiptSlot() }
                                    },
                                    onStartProviderRecording: {
                                        Task { await providerRecordingAction(ProviderRecordingAction.startEgress) }
                                    },
                                    onStopProviderRecording: {
                                        Task { await providerRecordingAction(ProviderRecordingAction.stopEgress) }
                                    }
                                )

                                VStack(alignment: .leading, spacing: 8) {
                                    Label("After capture", systemImage: "sparkles.rectangle.stack")
                                        .font(.caption.bold())
                                    Text(session.afterCaptureLine)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                    HStack(spacing: 8) {
                                        StatusChip(label: "\(session.recordingCount) recording\(session.recordingCount == 1 ? "" : "s")", tint: session.recordingCount > 0 ? .green : .secondary)
                                        if session.hasProviderRecordingReceiptSlot {
                                            StatusChip(label: "provider receipt slot", tint: .teal)
                                        }
                                        StatusChip(label: session.recordingPromotionBadgeLabel, tint: session.recordingPromotedToStudioMedia ? .green : session.canPromoteRecordingToStudioMedia ? .teal : .secondary)
                                            .accessibilityIdentifier("CaptureStudioPromotionStatus_\(session.id)")
                                        if let projectName = session.projectName, !projectName.isEmpty {
                                            StatusChip(label: projectName, tint: .indigo)
                                                .accessibilityIdentifier("CaptureSessionProject_\(session.id)")
                                        } else if session.projectBindingSource == "unfiled-session" {
                                            StatusChip(label: "Unfiled Session", tint: .orange)
                                                .accessibilityIdentifier("CaptureSessionProject_\(session.id)")
                                        }
                                        StatusChip(label: session.transcriptBadgeLabel, tint: session.latestTranscriptStatus == "COMPLETED" ? .green : .orange)
                                        StatusChip(label: session.packetBadgeLabel, tint: session.coachingPacketSummaryNoteId == nil ? .orange : .green)
                                    }
                                    if session.hasProviderRecordingReceiptSlot {
                                        ProviderReceiptSlotNotice(session: session)
                                    }
                                    CaptureSessionReceiptCard(
                                        session: session,
                                        uploadManager: uploadManager
                                    )
                                    CapturePostCaptureRunwayCard(session: session)
                                    MobileCaptureLifecycleCard(session: session)
                                    if let fileName = session.latestRecordingFileName, !fileName.isEmpty {
                                        Text(fileName)
                                            .font(.system(.caption2, design: .monospaced))
                                            .foregroundStyle(.secondary)
                                            .lineLimit(1)
                                    }
                                    if let packetTitle = session.coachingPacketTitle, !packetTitle.isEmpty {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Label(packetTitle, systemImage: "doc.text.magnifyingglass")
                                                .font(.caption.bold())
                                            if let preview = session.coachingPacketPreview, !preview.isEmpty {
                                                Text(preview)
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                                    .lineLimit(3)
                                            }
                                            HStack(spacing: 8) {
                                                StatusChip(label: "\(session.coachingPacketHighlightCount ?? 0) highlights", tint: .teal)
                                                StatusChip(label: "\(session.coachingPacketActionItemCount ?? 0) actions", tint: .orange)
                                            }
                                        }
                                        .padding(8)
                                        .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    HStack {
                                        Button {
                                            Task { await promoteRecordingToStudioMedia() }
                                        } label: {
                                            Label(isPromotingRecording ? "Attaching" : "Attach to Studio", systemImage: "film.stack")
                                        }
                                        .disabled(audioCapture.isRecording || isPromotingRecording || !session.canPromoteRecordingToStudioMedia)
                                        .accessibilityIdentifier("CaptureAttachToStudioButton_\(session.id)")

                                        Button {
                                            Task { await runTranscript() }
                                        } label: {
                                            Label(
                                                isRunningTranscript
                                                    ? "Running"
                                                    : session.latestTranscriptJobId == nil
                                                        ? "Repair transcript"
                                                        : "Run transcript",
                                                systemImage: "text.bubble"
                                            )
                                        }
                                        .disabled(audioCapture.isRecording || isRunningTranscript || !session.canRunTranscript)

                                        Button {
                                            Task { await buildPacket() }
                                        } label: {
                                            Label(isBuildingPacket ? "Building" : "Build packet", systemImage: "doc.badge.gearshape")
                                        }
                                        .disabled(audioCapture.isRecording || isBuildingPacket || !session.canBuildPacket)
                                    }
                                    .buttonStyle(.bordered)
                                    .controlSize(.small)

                                    if let afterCaptureMessage {
                                        Text(afterCaptureMessage)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }

                                    if let roomStateResponse = sessionClient.latestRoomStateResponse {
                                        VStack(alignment: .leading, spacing: 6) {
                                            Label("Room state evidence", systemImage: "point.3.connected.trianglepath.dotted")
                                                .font(.caption.bold())
                                            Text(roomStateResponse.roomStateTruthLine)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                                .fixedSize(horizontal: false, vertical: true)
                                            Text(roomStateResponse.roomStateNextActionLine)
                                                .font(.caption2.bold())
                                                .foregroundStyle(roomStateResponse.ok ? .teal : .orange)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        .padding(8)
                                        .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .accessibilityIdentifier("RoomStateEvidenceCard")
                                    }

                                    if let transcriptResponse = sessionClient.latestTranscriptRunResponse {
                                        VStack(alignment: .leading, spacing: 6) {
                                            Label("Transcript evidence", systemImage: "waveform.and.magnifyingglass")
                                                .font(.caption.bold())
                                            Text(transcriptResponse.transcriptTruthLine)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                                .fixedSize(horizontal: false, vertical: true)
                                            Text(transcriptResponse.transcriptNextActionLine)
                                                .font(.caption2.bold())
                                                .foregroundStyle(transcriptResponse.ok ? .teal : .orange)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                        .padding(8)
                                        .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .accessibilityIdentifier("TranscriptRunEvidenceCard")
                                    }

                                    if let packetResponse = sessionClient.latestPacketBuildResponse {
                                        VStack(alignment: .leading, spacing: 6) {
                                            Label("Packet truth", systemImage: "shield.lefthalf.filled")
                                                .font(.caption.bold())
                                            Text(packetResponse.packetTruthLine)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                            Text(packetResponse.packetReviewLine)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                            Text(packetResponse.packetNextActionLine)
                                                .font(.caption2.bold())
                                                .foregroundStyle(.teal)
                                            if let reviewLanes = packetResponse.reviewLanes, !reviewLanes.isEmpty {
                                                Divider()
                                                    .padding(.vertical, 2)
                                                Text("Review lanes")
                                                    .font(.caption2.bold())
                                                    .foregroundStyle(.secondary)
                                                Text(packetResponse.reviewLaneSummaryLine)
                                                    .font(.caption2)
                                                    .foregroundStyle(.secondary)
                                                ForEach(reviewLanes.prefix(4)) { lane in
                                                    MobileCapturePacketReviewLaneRow(
                                                        lane: lane,
                                                        isReviewing: isReviewingPacketLane,
                                                        onReview: { reviewStatus in
                                                            Task {
                                                                await reviewPacketLane(lane, reviewStatus: reviewStatus)
                                                            }
                                                        }
                                                    )
                                                }
                                            }
                                        }
                                        .padding(8)
                                        .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                        .accessibilityIdentifier("MobileCapturePacketTruthPanel")
                                    }

                                    CaptureDiagnosticsPanel(
                                        session: session,
                                        uploadManager: uploadManager
                                    )
                                }
                                .padding(10)
                                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                            }
                        }
                    }
                }
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Session consent", systemImage: "checkmark.shield")
                            .font(.headline)
                        Text("Start recording only after every participant knows the call is being recorded and agrees. Quipsly keeps local source audio until upload is verified.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let session = selectedSession {
                            HStack {
                                Label(session.recordingConsentStatus ?? "not-created", systemImage: session.recordingConsentGranted ? "checkmark.shield.fill" : "exclamationmark.shield")
                                    .font(.caption.bold())
                                    .foregroundStyle(session.recordingConsentGranted ? .green : .orange)
                                Spacer()
                                if let id = session.recordingConsentId {
                                    Text(id)
                                        .font(.system(.caption2, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                }
                            }
                            HStack {
                                Button {
                                    showsConsentConfirmation = true
                                } label: {
                                    Label("Review choices", systemImage: "checkmark.circle")
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(audioCapture.isRecording || isUpdatingConsent)

                                Button(role: .cancel) {
                                    Task { await updateConsent("DECLINE") }
                                } label: {
                                    Label("Decline", systemImage: "xmark.circle")
                                }
                                .buttonStyle(.bordered)
                                .disabled(isUpdatingConsent)

                                Button(role: .destructive) {
                                    Task { await updateConsent("REVOKE") }
                                } label: {
                                    Label("Revoke", systemImage: "arrow.uturn.backward.circle")
                                }
                                .buttonStyle(.bordered)
                                .disabled(isUpdatingConsent || session.recordingConsentId == nil)
                            }
                            .labelStyle(.titleAndIcon)
                        } else {
                            Text("Select a Quipsly session before setting recording consent.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                    HStack {
                        Label("Network", systemImage: "antenna.radiowaves.left.and.right")
                        Spacer()
                        Text(uploadManager.networkQuality)
                            .font(.headline)
                            .foregroundStyle(uploadManager.webrtcVideoEnabled ? .green : .orange)
                    }

                    ProgressView(value: uploadManager.uploadProgress)
                    Text(uploadManager.statusText ?? "No active upload")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let recoveryDetail = uploadManager.lastRecoveryDetail {
                        Text(recoveryDetail)
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                    if uploadManager.recoverableUploadCount > 0 {
                        Button {
                            uploadManager.retryRecoverableUploads()
                        } label: {
                            Label("Retry \(uploadManager.recoverableUploadCount) preserved upload\(uploadManager.recoverableUploadCount == 1 ? "" : "s")", systemImage: "arrow.clockwise.icloud")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(audioCapture.isRecording || uploadManager.isUploading)
                    }
                    if let transcriptJobId = uploadManager.lastTranscriptJobId {
                        Label("Transcript queued: \(transcriptJobId)", systemImage: "text.bubble")
                            .font(.caption.bold())
                            .foregroundStyle(.teal)
                    }

                    if audioCapture.isRecording {
                        HStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 10, height: 10)
                            Text("Recording (Take \(audioCapture.currentTakeOrder), Seg \(audioCapture.currentSegmentOrder))")
                                .font(.headline)
                                .foregroundStyle(.red)
                        }
                    }

                    HStack {
                        Button {
                            Task { await startSelectedSessionRecording() }
                        } label: {
                            Label(isPreparingRecording ? "Preparing" : "Start", systemImage: "record.circle")
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(audioCapture.isRecording || isPreparingRecording || selectedSession?.captureReadinessIsSafeToRecord != true || selectedSession == nil)
                        if selectedSession?.captureReadinessIsSafeToRecord != true {
                            Text(selectedSession?.captureReadinessNextAction ?? "Start unlocks only after a Quipsly session is selected and capture readiness is safe.")
                                .font(.caption2.bold())
                                .foregroundStyle(.orange)
                        }

                        Button {
                            audioCapture.handleCommand(.markBreak)
                        } label: {
                            Label("Mark break", systemImage: "scissors")
                        }
                        .buttonStyle(.bordered)
                        .disabled(!audioCapture.isRecording)

                        Button {
                            Task { await stopSelectedSessionRecording() }
                        } label: {
                            Label("Stop", systemImage: "stop.circle")
                        }
                        .buttonStyle(.bordered)
                        .disabled(!audioCapture.isRecording)
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding()
        }
        .accessibilityIdentifier("RecorderControlBoard")
        .background(MobileStudioBackground())
        .sheet(isPresented: $showsConsentConfirmation) {
            if let session = selectedSession {
                CaptureConsentConfirmationSheet(session: session) { canRecordAudio, canRecordVideo, canTranscribe, allAudibleParticipantsNotifiedAndAgreed, presentedAt in
                    await grantConsent(
                        for: session,
                        attestation: MobileCaptureConsentGrantAttestation(
                            canRecordAudio: canRecordAudio,
                            canRecordVideo: canRecordVideo,
                            canTranscribe: canTranscribe,
                            allAudibleParticipantsNotifiedAndAgreed: allAudibleParticipantsNotifiedAndAgreed,
                            presentedAt: presentedAt
                        )
                    )
                }
            }
        }
        .task {
            _ = await sessionClient.load()
            if readinessClient.readiness == nil {
                await readinessClient.load()
            }
        }
    }

    private func createQuickCaptureSession() async {
        isCreatingSession = true
        createSessionMessage = nil
        defer { isCreatingSession = false }

        guard let created = await sessionClient.createQuickSession(
            title: sessionLabel,
            purpose: quickSessionPurpose
        ) else {
            createSessionMessage = sessionClient.errorMessage ?? "Quipsly could not create the capture session."
            return
        }

        selectedSessionId = created.id
        roomJoinResponse = nil
        roomJoinOwnerSnapshot = nil
        roomJoinDiagnostic = nil
        roomJoinMessage = nil
        afterCaptureMessage = nil
        createSessionMessage = "Created \(created.displayTitle). Grant consent before recording or joining."
        await readinessClient.load()
    }

    private func startSelectedSessionRecording() async {
        guard let session = selectedSession else { return }
        guard session.captureReadinessIsSafeToRecord else {
            roomJoinMessage = session.captureReadinessNextAction
            return
        }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else {
            roomJoinMessage = "Verify the current Quipsly account before recording."
            return
        }

        isPreparingRecording = true
        defer { isPreparingRecording = false }

        if roomJoinDiagnostic == nil {
            let diagnostic = await sessionClient.inspectRoomJoin(for: session)
            guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
                roomJoinMessage = "The account changed during recording preflight. Nothing was recorded."
                return
            }
            roomJoinDiagnostic = diagnostic
            roomJoinMessage = roomJoinDiagnostic?.readinessLine
        }

        let microphonePrepared = await audioCapture.prepareForRecording()
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            roomJoinMessage = "The account changed while microphone permission was open. Nothing was recorded."
            return
        }
        guard microphonePrepared else {
            roomJoinMessage = audioCapture.lastErrorMessage ?? "The microphone is not ready."
            return
        }

        let authoritativeSession = await sessionClient.updateRoomState(for: session, action: "START_RECORDING")
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            roomJoinMessage = "The account changed while Nest verified the recording boundary. Nothing was recorded."
            return
        }
        guard let recordingSession = authoritativeSession else {
            return
        }

        let captureID = UUID()
        let clockSamples = await CaptureClockClient.shared.measureBurst(
            callRoomID: recordingSession.callRoomId,
            captureGroupID: captureID,
            expectedOwnerAccountID: ownerSnapshot.ownerAccountID
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            roomJoinMessage = "The account changed during source-clock measurement. Nothing was recorded."
            return
        }
        do {
            try audioCapture.armNextCapture(
                captureID: captureID,
                sessionID: recordingSession.id,
                callRoomID: recordingSession.callRoomId,
                requiresDurableRoomReceipt: true,
                expectedOwnerSnapshot: ownerSnapshot,
                clockSamples: clockSamples
            )
        } catch {
            roomJoinMessage = "Quipsly could not durably arm this take. Nothing was recorded: \(error.localizedDescription)"
            return
        }
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else {
            audioCapture.abortArmedCaptureBeforeRecording()
            roomJoinMessage = "The account changed after the start boundary was armed. Quipsly closed it and recorded no audio."
            return
        }

        let slugs = MobileContextManager.shared.getTargetSlugs()
        let cmd = RecorderCommand(
            action: .start,
            projectSlug: recordingSession.projectSlug ?? slugs.projectSlug ?? "high-ground-odyssey",
            episodeSlug: recordingSession.episodeSlug ?? slugs.episodeSlug ?? "session-capture",
            callRoomId: recordingSession.callRoomId,
            participantId: recordingSession.participantId,
            recordingConsentId: recordingSession.recordingConsentId,
            recordingConsentGranted: recordingSession.recordingConsentGranted,
            capturePurpose: recordingSession.purpose ?? "coaching-or-podcast"
        )
        audioCapture.handleCommand(cmd)
        let audioStarted = await audioCapture.waitUntilRecordingOrTerminal()
        if !audioStarted
            || audioCapture.captureState != .recording
            || audioCapture.activeLocalRecordingID != captureID {
            roomJoinMessage = audioCapture.lastErrorMessage ?? "The local recorder did not start. Nothing was recorded."
        }
    }

    private func stopSelectedSessionRecording() async {
        audioCapture.handleCommand(.stop)
        if let session = selectedSession {
            _ = await sessionClient.updateRoomState(for: session, action: "STOP_RECORDING")
        }
    }

    private func updateConsent(_ action: String) async {
        guard let session = selectedSession else { return }
        isUpdatingConsent = true
        defer { isUpdatingConsent = false }

        if action != "GRANT", audioCapture.isRecording {
            audioCapture.handleCommand(.stop)
        }

        if action == "DECLINE" {
            _ = await sessionClient.declineRecordingConsent(for: session)
        } else if action == "REVOKE" {
            _ = await sessionClient.revokeRecordingConsent(for: session)
        }
    }

    private func grantConsent(
        for session: MobileCaptureSession,
        attestation: MobileCaptureConsentGrantAttestation
    ) async -> Bool {
        guard selectedSession?.id == session.id, !audioCapture.isRecording else { return false }
        guard let ownerSnapshot = AuthManager.shared.stableOwnerSnapshot() else { return false }
        isUpdatingConsent = true
        defer { isUpdatingConsent = false }
        let updated = await sessionClient.grantRecordingConsent(
            for: session,
            attestation: attestation
        )
        guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot) else { return false }
        return updated != nil
    }

    private func updateRoomState(_ action: String) async {
        guard let session = selectedSession else { return }
        isUpdatingRoom = true
        defer { isUpdatingRoom = false }
        _ = await sessionClient.updateRoomState(for: session, action: action)
    }

    private func prepareProviderRecordingReceiptSlot() async {
        guard let session = selectedSession else { return }
        isPreparingProviderRecording = true
        defer { isPreparingProviderRecording = false }
        let ok = await sessionClient.prepareProviderRecordingReceiptSlot(for: session)
        roomJoinMessage = ok
            ? "Provider recording receipt slot is ready. External recording still has not started."
            : sessionClient.errorMessage
    }

    private func providerRecordingAction(_ action: String) async {
        guard let session = selectedSession else { return }
        isControllingProviderRecording = true
        defer { isControllingProviderRecording = false }
        let payload = await sessionClient.providerRecordingAction(for: session, action: action)
        roomJoinMessage = payload?.providerRecording?.nextAction ?? payload?.nextAction ?? sessionClient.errorMessage
    }

    private func promoteRecordingToStudioMedia() async {
        guard let session = selectedSession else { return }
        isPromotingRecording = true
        defer { isPromotingRecording = false }
        let ok = await sessionClient.promoteRecordingToStudioMedia(for: session)
        if ok {
            await sessionClient.load()
        }
        afterCaptureMessage = ok
            ? "Recording is attached to Quipsly Studio media. Original capture evidence is still preserved."
            : sessionClient.errorMessage
    }

    private func runTranscript() async {
        guard let session = selectedSession else { return }
        isRunningTranscript = true
        defer { isRunningTranscript = false }
        let ok = await sessionClient.runTranscript(for: session)
        if ok {
            await sessionClient.load()
        }
        if ok, let transcriptResponse = sessionClient.latestTranscriptRunResponse {
            afterCaptureMessage = "\(transcriptResponse.transcriptNextActionLine) Session evidence refreshed."
        } else {
            afterCaptureMessage = sessionClient.errorMessage
        }
    }

    private func buildPacket() async {
        guard let session = selectedSession else { return }
        isBuildingPacket = true
        defer { isBuildingPacket = false }
        let ok = await sessionClient.buildCoachingPacket(for: session)
        if ok {
            await sessionClient.load()
        }
        if ok, let packetResponse = sessionClient.latestPacketBuildResponse {
            afterCaptureMessage = "\(packetResponse.packetNextActionLine) Session evidence refreshed."
        } else {
            afterCaptureMessage = sessionClient.errorMessage
        }
    }

    private func reviewPacketLane(_ lane: MobileCapturePacketReviewLane, reviewStatus: String) async {
        guard let session = selectedSession else { return }
        isReviewingPacketLane = true
        defer { isReviewingPacketLane = false }
        let ok = await sessionClient.reviewPacketLane(for: session, laneId: lane.id, reviewStatus: reviewStatus)
        if ok {
            await sessionClient.load()
            afterCaptureMessage = sessionClient.errorMessage ?? "Packet lane review state updated inside Quipsly."
        } else {
            afterCaptureMessage = sessionClient.errorMessage
        }
    }
}

struct RoomSpinePanel: View {
    let session: MobileCaptureSession
    let roomJoinResponse: MobileCaptureRoomJoinResponse?
    let roomJoinDiagnostic: MobileCaptureRoomJoinDiagnosticResponse?
    let roomJoinMessage: String?
    let isRecording: Bool
    let isUpdatingRoom: Bool
    let onInspect: () -> Void
    let onPrepare: () -> Void
    let onOpen: () -> Void
    let onEnd: () -> Void

    private var normalizedStatus: String {
        session.status?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() ?? "PLANNED"
    }

    private var isClosed: Bool {
        ["ENDED", "CANCELED", "FAILED"].contains(normalizedStatus)
    }

    private var roomTint: Color {
        if isRecording || normalizedStatus == "RECORDING" { return .red }
        if normalizedStatus == "OPEN" { return .green }
        if isClosed { return .secondary }
        return .orange
    }

    private var providerReady: Bool {
        roomJoinResponse?.canJoin == true || roomJoinDiagnostic?.canJoin == true || session.providerCanJoin == true
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Meeting spine", systemImage: "point.3.connected.trianglepath.dotted")
                        .font(.caption.bold())
                    Text("Provider room and local recording move together, but local capture stays safe if the provider room is not ready.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(normalizedStatus.capitalized)
                    .font(.caption2.bold())
                    .foregroundStyle(roomTint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(roomTint.opacity(0.14), in: Capsule())
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 138), spacing: 8)], alignment: .leading, spacing: 8) {
                SafetyFact(
                    title: session.providerLabel,
                    detail: roomJoinResponse?.readinessLine ?? roomJoinDiagnostic?.readinessLine ?? session.providerReadinessLine,
                    systemImage: session.provider?.lowercased() == "livekit" ? "video.badge.checkmark" : "iphone.and.arrow.forward",
                    tint: providerReady ? .green : .orange
                )
                SafetyFact(
                    title: session.recordingConsentGranted ? "Consent granted" : "Consent needed",
                    detail: session.recordingConsentStatus ?? "not-created",
                    systemImage: session.recordingConsentGranted ? "checkmark.shield.fill" : "exclamationmark.shield",
                    tint: session.recordingConsentGranted ? .green : .orange
                )
                SafetyFact(
                    title: isRecording ? "Local capture active" : "Local capture idle",
                    detail: isRecording ? "Keep visible indicator on" : "Original audio stays local first",
                    systemImage: isRecording ? "record.circle.fill" : "externaldrive.badge.checkmark",
                    tint: isRecording ? .red : .teal
                )
            }

            RoomJoinDiagnosticsCard(diagnostic: roomJoinDiagnostic)

            HStack(spacing: 8) {
                Button(action: onInspect) {
                    Label("Inspect readiness", systemImage: "stethoscope")
                }
                .accessibilityIdentifier("CaptureInspectRoomReadinessButton")
                .accessibilityHint("Checks room readiness without creating tokens, joining provider media, or starting recording.")

                Button(action: onPrepare) {
                    Label(roomJoinResponse?.canJoin == true ? "Refresh join key" : "Prepare join key", systemImage: "phone.connection")
                }
                .accessibilityIdentifier("CapturePrepareJoinKeyButton")
                .accessibilityHint("Prepares a short lived provider join key. This does not join the room or start recording.")

                Button(action: onOpen) {
                    Label("Open room", systemImage: "door.left.hand.open")
                }
                .accessibilityIdentifier("CaptureOpenRoomButton")
                .accessibilityHint("Marks the Quipsly-owned room open without starting local or provider recording.")

                Button(role: .destructive, action: onEnd) {
                    Label("End room", systemImage: "phone.down")
                }
                .accessibilityIdentifier("CaptureEndRoomButton")
                .accessibilityHint("Ends the Quipsly-owned room. Upload, transcript, and packet review can continue after capture.")
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .disabled(isRecording || isUpdatingRoom)

            if let roomJoinMessage {
                Text(roomJoinMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("RoomSpinePanel")
    }
}

struct CaptureWorkflowMapCard: View {
    let selectedSession: MobileCaptureSession?
    let isRecording: Bool

    private var hasSession: Bool {
        selectedSession != nil
    }

    private var consentReady: Bool {
        selectedSession?.recordingConsentGranted == true
    }

    private var roomReady: Bool {
        selectedSession?.providerCanJoin == true || selectedSession?.providerReadiness?.lowercased() == "ready"
    }

    private var hasRecordingEvidence: Bool {
        let recordingCount = selectedSession?.recordingCount ?? 0
        return selectedSession?.latestRecordingAssetId?.isEmpty == false || recordingCount > 0
    }

    private var transcriptReady: Bool {
        selectedSession?.latestTranscriptStatus?.uppercased() == "COMPLETED"
    }

    private var packetReady: Bool {
        selectedSession?.coachingPacketSummaryNoteId?.isEmpty == false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Capture workflow map", systemImage: "map")
                        .font(.headline)
                    Text("Quipsly keeps each step visible: room truth, consent, recording evidence, upload, transcript, and review packet.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(isRecording ? "Recording visible" : "Safe idle")
                    .font(.caption2.bold())
                    .foregroundStyle(isRecording ? .red : .green)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((isRecording ? Color.red : Color.green).opacity(0.14), in: Capsule())
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 142), spacing: 8)], alignment: .leading, spacing: 8) {
                CaptureWorkflowStepPill(
                    number: "1",
                    title: "Create session",
                    detail: hasSession ? selectedSession?.displayTitle ?? "Session selected" : "Make or select a Quipsly room",
                    complete: hasSession,
                    current: !hasSession,
                    tint: .teal
                )
                CaptureWorkflowStepPill(
                    number: "2",
                    title: "Grant consent",
                    detail: consentReady ? "Recording consent is granted" : "Explicit consent before capture",
                    complete: consentReady,
                    current: hasSession && !consentReady,
                    tint: .green
                )
                CaptureWorkflowStepPill(
                    number: "3",
                    title: "Join room",
                    detail: roomReady ? "Provider room can join" : "Inspect readiness first",
                    complete: roomReady,
                    current: consentReady && !roomReady,
                    tint: .blue
                )
                CaptureWorkflowStepPill(
                    number: "4",
                    title: "Record locally",
                    detail: isRecording ? "Visible recording active" : "Original stays preserved",
                    complete: hasRecordingEvidence,
                    current: consentReady && !hasRecordingEvidence,
                    tint: .red
                )
                CaptureWorkflowStepPill(
                    number: "5",
                    title: "Upload source",
                    detail: hasRecordingEvidence ? selectedSession?.latestRecordingAssetStatus ?? "Recording evidence exists" : "No upload evidence yet",
                    complete: hasRecordingEvidence,
                    current: false,
                    tint: .orange
                )
                CaptureWorkflowStepPill(
                    number: "6",
                    title: "Transcribe",
                    detail: transcriptReady ? "Transcript complete" : selectedSession?.transcriptBadgeLabel ?? "Waiting on recording",
                    complete: transcriptReady,
                    current: hasRecordingEvidence && !transcriptReady,
                    tint: .purple
                )
                CaptureWorkflowStepPill(
                    number: "7",
                    title: "Build packet",
                    detail: packetReady ? "Packet ready for review" : selectedSession?.packetBadgeLabel ?? "Transcript first",
                    complete: packetReady,
                    current: transcriptReady && !packetReady,
                    tint: .mint
                )
            }

            Text("Truth rule: joining a room is not recording; provider receipts are not media; packets are review artifacts until a human approves delivery.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .accessibilityIdentifier("CaptureWorkflowMapCard")
    }
}

struct CaptureWorkflowStepPill: View {
    let number: String
    let title: String
    let detail: String
    let complete: Bool
    let current: Bool
    let tint: Color

    private var icon: String {
        if complete { return "checkmark.circle.fill" }
        if current { return "arrow.right.circle.fill" }
        return "circle"
    }

    private var effectiveTint: Color {
        if complete || current { return tint }
        return .secondary
    }

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ZStack {
                Circle()
                    .fill(effectiveTint.opacity(0.14))
                    .frame(width: 28, height: 28)
                if complete || current {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundStyle(effectiveTint)
                } else {
                    Text(number)
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.bold())
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(9)
        .background(effectiveTint.opacity(current ? 0.14 : 0.08), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
}

struct RoomJoinDiagnosticsCard: View {
    let diagnostic: MobileCaptureRoomJoinDiagnosticResponse?

    private var tint: Color {
        guard let diagnostic else { return .secondary }
        if diagnostic.effects?.sideEffectFree == true && diagnostic.paymentBoundary?.blocked != true {
            return diagnostic.canJoin == true || diagnostic.localFallback?.safeToRecordLocally == true ? .teal : .orange
        }
        return .orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Room readiness inspection", systemImage: "stethoscope")
                        .font(.caption.bold())
                    Text(diagnostic?.noSideEffectsLine ?? "Tap Inspect readiness for a side-effect-free room check before preparing a provider join key.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(diagnostic?.providerBadge ?? "NOT CHECKED")
                    .font(.caption2.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.14), in: Capsule())
            }

            Text(diagnostic?.readinessLine ?? "Inspection checks access, payment evidence, consent, provider readiness, local fallback, token safety, and media-vault boundaries without changing the room.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                StatusChip(label: diagnostic?.effects?.participantCreated == false ? "no participant" : "inspect first", tint: diagnostic?.effects?.participantCreated == false ? .green : .secondary)
                StatusChip(label: diagnostic?.effects?.tokenMinted == false ? "no token" : "inspect first", tint: diagnostic?.effects?.tokenMinted == false ? .green : .secondary)
                StatusChip(label: diagnostic?.effects?.recordingStarted == false ? "not recording" : "review", tint: diagnostic?.effects?.recordingStarted == false ? .green : .orange)
            }

            Text(diagnostic?.mediaTruthLine ?? "Buckets store bytes. Quipsly records own meaning, access, review, and publishing truth.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("RoomJoinDiagnosticsCard")
    }
}

struct CaptureSessionContextPanel: View {
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    @State private var draft = CaptureSessionContextDraft()
    @State private var loadedSessionID: String?
    @State private var syncStatus = "Saved on this device"
    @State private var isSyncingContext = false
    @State private var remoteConflictDraft: CaptureSessionContextDraft?
    @State private var conflictMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Session context", systemImage: "note.text.badge.plus")
                        .font(.caption.bold())
                    Text("Local-first prep notes, goals, and tasks for this coaching, podcast, or research session.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    Text(isSyncingContext ? "SYNCING" : syncStatus.uppercased())
                        .font(.caption2.bold())
                        .foregroundStyle(syncStatus == "Saved to Nest" || syncStatus == "Loaded from Nest" ? .green : .orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background((syncStatus == "Saved to Nest" || syncStatus == "Loaded from Nest" ? Color.green : Color.orange).opacity(0.14), in: Capsule())
                    HStack(spacing: 6) {
                        Button {
                            Task { await loadNestContext() }
                        } label: {
                            Label("Load Nest", systemImage: "arrow.down.doc")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.mini)
                        .disabled(isSyncingContext)

                        Button {
                            Task { await saveNestContext() }
                        } label: {
                            Label("Save Nest", systemImage: "arrow.up.doc")
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.mini)
                        .disabled(isSyncingContext)
                    }
                }
            }

            if let remoteConflictDraft {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Nest changed elsewhere", systemImage: "arrow.triangle.branch")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                    Text(conflictMessage ?? "Your phone draft is still saved on this device. Compare it with the latest Nest revision before choosing.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("PHONE DRAFT")
                            .font(.caption2.bold())
                            .foregroundStyle(.teal)
                        Text(draft.contextConflictSummary)
                            .font(.caption2)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("LATEST NEST")
                            .font(.caption2.bold())
                            .foregroundStyle(.orange)
                        Text(remoteConflictDraft.contextConflictSummary)
                            .font(.caption2)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                    HStack(spacing: 8) {
                        Button("Use Nest version") {
                            draft = remoteConflictDraft
                            draft.persist(sessionID: session.id)
                            self.remoteConflictDraft = nil
                            conflictMessage = nil
                            syncStatus = "Loaded from Nest"
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .accessibilityIdentifier("UseNestContextVersion")

                        Button("Keep phone draft") {
                            draft.rebaseRevision(onto: remoteConflictDraft)
                            draft.persist(sessionID: session.id)
                            self.remoteConflictDraft = nil
                            conflictMessage = nil
                            syncStatus = "Phone draft ready to resave"
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .accessibilityIdentifier("KeepPhoneContextVersion")
                    }

                    Text("Keeping the phone draft only rebases it onto the latest revision. Tap Save Nest again to make the overwrite explicit.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                }
                .accessibilityIdentifier("SessionContextConflictCard")
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Quick note")
                    .font(.caption.bold())
                TextEditor(text: Binding(
                    get: { draft.note },
                    set: {
                        draft.note = $0
                        persist()
                    }
                ))
                .frame(minHeight: 82)
                .padding(8)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
                }
            }

            CaptureChecklistEditor(
                title: "Goals",
                systemImage: "target",
                placeholder: "What should this session help with?",
                items: Binding(
                    get: { draft.goals },
                    set: {
                        draft.goals = $0
                        persist()
                    }
                )
            )

            CaptureChecklistEditor(
                title: "Tasks",
                systemImage: "checklist",
                placeholder: "Follow-up, question, or next action",
                items: Binding(
                    get: { draft.tasks },
                    set: {
                        draft.tasks = $0
                        persist()
                    }
                )
            )

            HStack(spacing: 8) {
                Label("Saved on this device", systemImage: "iphone.gen3")
                    .font(.caption2)
                    .foregroundStyle(.teal)
                Spacer()
                Text(draft.updatedAtDisplay)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text("Phone-local drafts are recovery-friendly. Nest sync makes notes, goals, and tasks visible to the shared room, packet, and review workflow.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("CaptureSessionContextPanel")
        .onAppear { loadIfNeeded(force: true) }
        .onChange(of: session.id) { _, _ in loadIfNeeded(force: true) }
    }

    private func loadIfNeeded(force: Bool = false) {
        guard force || loadedSessionID != session.id else { return }
        draft = CaptureSessionContextDraft.load(sessionID: session.id)
        loadedSessionID = session.id
        syncStatus = "Loaded local draft"
        remoteConflictDraft = nil
        conflictMessage = nil
    }

    private func persist() {
        var next = draft
        next.touch()
        draft = next
        draft.persist(sessionID: session.id)
        syncStatus = "Local changes not synced"
    }

    private func loadNestContext() async {
        guard !isSyncingContext else { return }
        isSyncingContext = true
        defer { isSyncingContext = false }

        if let remoteDraft = await sessionClient.loadSessionContext(for: session) {
            if hasUnsyncedPhoneContext, remoteDraft != draft {
                remoteConflictDraft = remoteDraft
                conflictMessage = "Nest loaded a different revision. Your unsynced phone draft stayed on this device."
                syncStatus = "Phone draft kept — review Nest"
                return
            }
            draft = remoteDraft
            draft.persist(sessionID: session.id)
            remoteConflictDraft = nil
            conflictMessage = nil
            syncStatus = "Loaded from Nest"
        } else {
            syncStatus = sessionClient.errorMessage ?? "Nest load needs attention"
        }
    }

    private func saveNestContext() async {
        guard !isSyncingContext else { return }
        isSyncingContext = true
        defer { isSyncingContext = false }

        switch await sessionClient.saveSessionContext(for: session, draft: draft) {
        case .saved(let serverDraft):
            draft = serverDraft
            draft.persist(sessionID: session.id)
            remoteConflictDraft = nil
            conflictMessage = nil
            syncStatus = "Saved to Nest"
        case .conflict(let remote, _, let message):
            // Keep the exact phone draft in place. The remote copy lives beside
            // it until the user explicitly chooses a revision.
            draft.persist(sessionID: session.id)
            remoteConflictDraft = remote
            conflictMessage = message
            syncStatus = "Phone draft kept — review conflict"
        case .failed(let message):
            draft.persist(sessionID: session.id)
            syncStatus = message
        }
    }

    private var hasUnsyncedPhoneContext: Bool {
        syncStatus == "Local changes not synced"
            || syncStatus == "Phone draft ready to resave"
            || remoteConflictDraft != nil
    }
}

struct CaptureChecklistEditor: View {
    let title: String
    let systemImage: String
    let placeholder: String
    @Binding var items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(title, systemImage: systemImage)
                    .font(.caption.bold())
                Spacer()
                Button {
                    items.append("")
                } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            }

            ForEach(Array(items.indices), id: \.self) { index in
                HStack(spacing: 8) {
                    TextField(placeholder, text: Binding(
                        get: {
                            guard items.indices.contains(index) else { return "" }
                            return items[index]
                        },
                        set: { value in
                            guard items.indices.contains(index) else { return }
                            items[index] = value
                        }
                    ))
                    .textFieldStyle(.roundedBorder)

                    Button(role: .destructive) {
                        guard items.indices.contains(index) else { return }
                        items.remove(at: index)
                        if items.isEmpty {
                            items = [""]
                        }
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Remove \(title.lowercased()) item")
                }
            }
        }
    }
}

struct CaptureSessionContextDraft: Codable, Equatable {
    var note: String = ""
    var goals: [String] = [""]
    var tasks: [String] = [""]
    var updatedAt: Date = Date()
    var revisionId: String?
    var entries: MobileCaptureSessionContextEntries?

    var updatedAtDisplay: String {
        updatedAt.formatted(date: .omitted, time: .shortened)
    }

    var contextConflictSummary: String {
        let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let notePreview = cleanNote.isEmpty ? "No quick note" : String(cleanNote.prefix(140))
        let goalCount = goals.lazy.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.count
        let taskCount = tasks.lazy.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.count
        return "\(notePreview) · \(goalCount) goal\(goalCount == 1 ? "" : "s") · \(taskCount) task\(taskCount == 1 ? "" : "s")"
    }

    mutating func touch() {
        updatedAt = Date()
        if goals.isEmpty { goals = [""] }
        if tasks.isEmpty { tasks = [""] }
        reconcileStructuredEntries()
    }

    mutating func rebaseRevision(onto remote: CaptureSessionContextDraft) {
        revisionId = remote.revisionId
        touch()
    }

    func persist(sessionID: String) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults.standard.set(data, forKey: Self.storageKey(sessionID: sessionID))
    }

    static func load(sessionID: String) -> CaptureSessionContextDraft {
        guard let data = UserDefaults.standard.data(forKey: storageKey(sessionID: sessionID)),
              let draft = try? JSONDecoder().decode(CaptureSessionContextDraft.self, from: data)
        else {
            return CaptureSessionContextDraft()
        }
        return draft.normalized()
    }

    static func storageKey(sessionID: String) -> String {
        "quipsly.capture.session-context.\(sessionID)"
    }

    private func normalized() -> CaptureSessionContextDraft {
        var copy = self
        if copy.goals.isEmpty { copy.goals = [""] }
        if copy.tasks.isEmpty { copy.tasks = [""] }
        copy.reconcileStructuredEntries()
        return copy
    }

    private mutating func reconcileStructuredEntries() {
        guard var current = entries else { return }
        let now = ISO8601DateFormatter().string(from: updatedAt)
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedNote.isEmpty {
            current.note = nil
        } else if var existing = current.note {
            existing.kind = "quick-note"
            existing.text = trimmedNote
            existing.position = 0
            existing.updatedAt = now
            current.note = existing
        } else {
            current.note = MobileCaptureSessionContextEntry(
                id: nil,
                kind: "quick-note",
                text: trimmedNote,
                position: 0,
                projectionId: nil,
                createdAt: now,
                updatedAt: now,
                source: "ios-capture"
            )
        }

        current.goals = Self.reconcileList(
            goals,
            kind: "goal",
            current: current.goals,
            now: now
        )
        current.tasks = Self.reconcileList(
            tasks,
            kind: "task",
            current: current.tasks,
            now: now
        )
        entries = current
    }

    private static func reconcileList(
        _ values: [String],
        kind: String,
        current: [MobileCaptureSessionContextEntry],
        now: String
    ) -> [MobileCaptureSessionContextEntry] {
        let desired = values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var used = Set<Int>()

        return desired.enumerated().map { position, text in
            var match = current.indices.first {
                !used.contains($0) && current[$0].text == text
            }
            if match == nil, current.indices.contains(position), !used.contains(position) {
                match = position
            }

            if let match {
                used.insert(match)
                var entry = current[match]
                entry.kind = kind
                entry.text = text
                entry.position = position
                entry.updatedAt = now
                return entry
            }

            return MobileCaptureSessionContextEntry(
                id: nil,
                kind: kind,
                text: text,
                position: position,
                projectionId: nil,
                createdAt: now,
                updatedAt: now,
                source: "ios-capture"
            )
        }
    }
}

struct ProviderRoomView: View {
    @ObservedObject var controller: ProviderRoomController
    let session: MobileCaptureSession
    let joinResponse: MobileCaptureRoomJoinResponse?
    let joinOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    let joinDiagnostic: MobileCaptureRoomJoinDiagnosticResponse?
    let isRecording: Bool
    let isPreparingProviderRecording: Bool
    let isControllingProviderRecording: Bool
    let onPrepareProviderRecording: () -> Void
    let onStartProviderRecording: () -> Void
    let onStopProviderRecording: () -> Void

    private var serverCanJoin: Bool {
        joinResponse?.canJoin == true
    }

    private var canJoin: Bool {
        serverCanJoin && controller.providerRuntimeAvailable
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Live room", systemImage: "wave.3.right.circle")
                        .font(.caption.bold())
                    Text("Join the conversation here. CallKit presents the native iPhone call surface; Quipsly recording remains a separate consent-gated action.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(controller.connectionStateLabel)
                    .font(.caption2.bold())
                    .foregroundStyle(controller.isConnected ? .green : serverCanJoin ? .orange : .secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((controller.isConnected ? Color.green : serverCanJoin ? Color.orange : Color.secondary).opacity(0.14), in: Capsule())
            }

            if let activeRoomName = controller.activeRoomName {
                Text(activeRoomName)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            HStack(spacing: 8) {
                Button {
                    Task {
                        guard let joinOwnerSnapshot else { return }
                        await controller.connect(
                            using: joinResponse,
                            session: session,
                            expectedOwnerSnapshot: joinOwnerSnapshot
                        )
                    }
                } label: {
                    Label(controller.isConnecting ? "Joining" : "Join room", systemImage: "phone.arrow.up.right")
                }
                .accessibilityIdentifier("ProviderJoinRoomButton")
                .accessibilityHint("Joins the LiveKit room through the native provider runtime. Joining is not recording.")
                .disabled(!canJoin || joinOwnerSnapshot == nil || controller.isConnecting || controller.isConnected)

                Button {
                    Task { await controller.setMuted(!controller.isMuted) }
                } label: {
                    Label(controller.isMuted ? "Unmute" : "Mute", systemImage: controller.isMuted ? "mic.slash" : "mic")
                }
                .accessibilityIdentifier("ProviderMuteButton")
                .accessibilityHint("Toggles provider room microphone audio after joining.")
                .disabled(!controller.isConnected)

                Button(role: .cancel) {
                    Task { await controller.disconnect() }
                } label: {
                    Label("Leave", systemImage: "rectangle.portrait.and.arrow.right")
                }
                .accessibilityIdentifier("ProviderLeaveRoomButton")
                .accessibilityHint("Leaves the provider room without deleting local recordings or transcript evidence.")
                .disabled(!controller.isConnected && !controller.isConnecting)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            HStack(spacing: 8) {
                StatusChip(label: controller.isMuted ? "provider mic muted" : "provider mic live", tint: controller.isConnected && !controller.isMuted ? .green : .secondary)
                StatusChip(label: "\(controller.remoteParticipantCount) remote", tint: controller.remoteParticipantCount > 0 ? .teal : .secondary)
                StatusChip(label: controller.providerRuntimeLabel, tint: controller.providerRuntimeAvailable ? .green : .orange)
                StatusChip(label: controller.nativeCallPresentationLabel, tint: controller.isNativeCallPresentationActive ? .teal : .secondary)
                StatusChip(label: controller.callAudioSessionLabel, tint: controller.isCallAudioSessionActive ? .green : .secondary)
                StatusChip(label: isRecording ? "Quipsly recording" : "not recording", tint: isRecording ? .red : .secondary)
            }

            CallKitBoundaryCard(
                isActive: controller.isNativeCallPresentationActive,
                label: controller.nativeCallPresentationLabel,
                callUUID: controller.activeCallUUIDString,
                isRecording: isRecording
            )

            ProviderRuntimeBoundaryCard(
                runtimeAvailable: controller.providerRuntimeAvailable,
                runtimeDetail: controller.providerRuntimeDetail,
                serverCanJoin: serverCanJoin
            )

            ProviderRoomDiagnosticCard(diagnostic: joinDiagnostic)

            ProviderJoinTokenBoundaryCard(joinResponse: joinResponse)

            if let callUUID = controller.activeCallUUIDString {
                Label("Native call surface active: \(callUUID)", systemImage: "phone.connection")
                    .font(.caption2)
                    .foregroundStyle(.teal)
                    .lineLimit(1)
            }

            ProviderRecordingCard(
                joinResponse: joinResponse,
                isProviderConnected: controller.isConnected,
                isPreparingProviderRecording: isPreparingProviderRecording,
                isControllingProviderRecording: isControllingProviderRecording,
                onPrepareProviderRecording: onPrepareProviderRecording,
                onStartProviderRecording: onStartProviderRecording,
                onStopProviderRecording: onStopProviderRecording
            )

            Text(controller.statusText)
                .font(.caption)
                .foregroundStyle(controller.lastError == nil ? Color.secondary : Color.red)

            if !canJoin {
                Text(joinResponse?.nextAction ?? session.providerReadinessLine)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ProviderRoomView")
    }
}

struct CallKitBoundaryCard: View {
    let isActive: Bool
    let label: String
    let callUUID: String?
    let isRecording: Bool

    private var tint: Color {
        isActive ? .teal : .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Native call presentation", systemImage: "phone.connection")
                        .font(.caption.bold())
                    Text("CallKit makes a Quipsly-owned room feel native on iPhone. It does not dial a phone number, start FaceTime, or decide recording truth.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(label.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.14), in: Capsule())
            }

            HStack(spacing: 6) {
                StatusChip(label: "after Join room", tint: isActive ? .teal : .secondary)
                StatusChip(label: "not phone/FaceTime", tint: .green)
                StatusChip(label: isRecording ? "recording visible" : "join not recording", tint: isRecording ? .red : .green)
                StatusChip(label: "Nest CallRoom truth", tint: .teal)
            }

            if let callUUID, !callUUID.isEmpty {
                Text("CallKit UUID: \(callUUID)")
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Text("Source of truth: Nest owns room lifecycle, participant consent, recording receipts, transcript jobs, and packets. CallKit can present or end the live room, but it never creates recording evidence by itself.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CallKitBoundaryCard")
    }
}

struct ProviderRuntimeBoundaryCard: View {
    let runtimeAvailable: Bool
    let runtimeDetail: String
    let serverCanJoin: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Native media runtime", systemImage: runtimeAvailable ? "wave.3.forward.circle.fill" : "shippingbox")
                        .font(.caption.bold())
                    Text(runtimeDetail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(runtimeAvailable ? "APP CAN JOIN" : serverCanJoin ? "SERVER READY, APP HELD" : "INSPECT ROOM")
                    .font(.caption2.bold())
                    .foregroundStyle(runtimeAvailable ? .green : .orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((runtimeAvailable ? Color.green : Color.orange).opacity(0.14), in: Capsule())
            }

            Text("Lesson from the backend: provider credentials, room tokens, and SDK linkage are separate readiness facts. Quipsly shows each one instead of pretending a room is usable because one layer is green.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(8)
        .background((runtimeAvailable ? Color.green : Color.orange).opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ProviderRuntimeBoundaryCard")
    }
}

struct ProviderRoomDiagnosticCard: View {
    let diagnostic: MobileCaptureRoomJoinDiagnosticResponse?

    private var canPrepareJoinKey: Bool {
        diagnostic?.canMintJoinToken == true && diagnostic?.effects?.tokenMinted == false
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Before you join", systemImage: "checkmark.shield")
                        .font(.caption.bold())
                    Text(diagnostic?.readinessLine ?? "Inspect readiness before preparing the provider join key. Inspection is safe; joining is an action.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(canPrepareJoinKey ? "JOIN KEY READY" : "INSPECT FIRST")
                    .font(.caption2.bold())
                    .foregroundStyle(canPrepareJoinKey ? .teal : .secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((canPrepareJoinKey ? Color.teal : Color.secondary).opacity(0.14), in: Capsule())
            }

            HStack(spacing: 6) {
                StatusChip(label: diagnostic?.canMintJoinToken == true ? "can mint key" : "key held", tint: diagnostic?.canMintJoinToken == true ? .teal : .secondary)
                StatusChip(label: diagnostic?.recordingBoundary?.joiningStartsRecording == false ? "join not recording" : "review", tint: diagnostic?.recordingBoundary?.joiningStartsRecording == false ? .green : .orange)
                StatusChip(label: diagnostic?.paymentBoundary?.noPaymentMutation == true ? "no Stripe mutation" : "inspect", tint: diagnostic?.paymentBoundary?.noPaymentMutation == true ? .green : .secondary)
            }
        }
        .padding(8)
        .background((canPrepareJoinKey ? Color.teal : Color.secondary).opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ProviderRoomDiagnosticCard")
    }
}

struct ProviderJoinTokenBoundaryCard: View {
    let joinResponse: MobileCaptureRoomJoinResponse?

    private var boundary: MobileCaptureRoomJoinResponse.TokenBoundary? {
        joinResponse?.visibleTokenBoundary
    }

    private var tint: Color {
        guard let boundary else { return .secondary }
        if boundary.providerCredentialExposed == false && boundary.startsRecording == false && boundary.reusableAcrossRooms == false {
            return .teal
        }
        return .orange
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Provider key boundary", systemImage: "key.radiowaves.forward")
                        .font(.caption.bold())
                    Text(joinResponse?.tokenBoundaryLine ?? "Prepare the room to see exactly what the provider key can and cannot do.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let joinResponse {
                        Text(joinResponse.joinEffectsLine)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer()
                Text(joinResponse?.tokenExpiryLabel.uppercased() ?? "NO KEY")
                    .font(.caption2.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.14), in: Capsule())
            }

            HStack(spacing: 6) {
                StatusChip(label: boundary?.shortLived == true ? "short-lived" : "prepare first", tint: boundary?.shortLived == true ? .teal : .secondary)
                StatusChip(label: boundary?.tokenRoomScoped == true || boundary?.reusableAcrossRooms == false ? "room-scoped" : "scope review", tint: boundary?.tokenRoomScoped == true || boundary?.reusableAcrossRooms == false ? .teal : .orange)
                StatusChip(label: boundary?.startsRecording == false ? "not recording" : "review recording", tint: boundary?.startsRecording == false ? .green : .orange)
                StatusChip(label: boundary?.recordingRequiresConsent == true ? "consent first" : "consent review", tint: boundary?.recordingRequiresConsent == true ? .green : .orange)
                StatusChip(label: boundary?.providerCredentialExposed == false || boundary?.providerSecretsExposed == false ? "no provider secret" : "review secret", tint: boundary?.providerCredentialExposed == false || boundary?.providerSecretsExposed == false ? .green : .orange)
            }
        }
        .padding(8)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("ProviderJoinTokenBoundaryCard")
    }
}

struct ProviderRecordingCard: View {
    let joinResponse: MobileCaptureRoomJoinResponse?
    let isProviderConnected: Bool
    let isPreparingProviderRecording: Bool
    let isControllingProviderRecording: Bool
    let onPrepareProviderRecording: () -> Void
    let onStartProviderRecording: () -> Void
    let onStopProviderRecording: () -> Void

    private var recording: MobileCaptureRoomJoinResponse.ProviderRecording? {
        joinResponse?.providerRecording
    }

    private var consentReady: Bool {
        joinResponse?.recordingBoundary?.recordingConsentGranted == true || joinResponse?.recordingConsentGranted == true
    }

    private var statusLabel: String {
        recording?.currentStatus?.replacingOccurrences(of: "-", with: " ").capitalized ?? "Not Started"
    }

    private var tint: Color {
        if recording?.currentStatus == "recording" { return .red }
        if consentReady && isProviderConnected { return .orange }
        return .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Provider recording", systemImage: "recordingtape.circle")
                        .font(.caption.bold())
                    Text("Provider recording is separate from joining the live room. Nest has receipt/start/stop/reconcile routes, but start and stop stay explicit and operator-gated until the in-app UX proves itself.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(statusLabel.uppercased())
                    .font(.caption2.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(tint.opacity(0.14), in: Capsule())
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 128), spacing: 8)], alignment: .leading, spacing: 8) {
                SafetyFact(
                    title: recording?.startsWithJoin == false ? "Not automatic" : "Needs review",
                    detail: recording?.startsWithJoin == false ? "Join does not record" : "Provider behavior unknown",
                    systemImage: "door.left.hand.open",
                    tint: recording?.startsWithJoin == false ? .green : .orange
                )
                SafetyFact(
                    title: consentReady ? "Consent ready" : "Consent needed",
                    detail: recording?.requiresAllParticipantConsent == true ? "All participants" : "Policy needs review",
                    systemImage: consentReady ? "checkmark.shield.fill" : "exclamationmark.shield",
                    tint: consentReady ? .green : .orange
                )
                SafetyFact(
                    title: recording?.receiptRequiredBeforeTranscript == true ? "Receipt required" : "Receipt missing",
                    detail: recording?.evidenceSource ?? "provider-egress-planned",
                    systemImage: "doc.badge.clock",
                    tint: recording?.receiptRequiredBeforeTranscript == true ? .teal : .orange
                )
            }

            HStack(spacing: 8) {
                Button(action: onPrepareProviderRecording) {
                    Label(isPreparingProviderRecording ? "Preparing" : "Prepare receipt slot", systemImage: "doc.badge.plus")
                }
                .disabled(!consentReady || isPreparingProviderRecording)

                Button {
                    onStartProviderRecording()
                } label: {
                    Label(isControllingProviderRecording ? "Starting" : "Operator start", systemImage: "record.circle")
                }
                .disabled(!consentReady || !isProviderConnected || isControllingProviderRecording)

                Button(role: .cancel) {
                    onStopProviderRecording()
                } label: {
                    Label(isControllingProviderRecording ? "Stopping" : "Operator stop", systemImage: "stop.circle")
                }
                .disabled(!isProviderConnected || isControllingProviderRecording)

                Text("Non-staff users may see this rejected by Nest. That is intentional until we finish the human-proof recording controls.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text(recording?.nextAction ?? "Prepare the room first. Local consented recording remains the safe fallback.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("ProviderRecordingCard")
    }
}

struct RecordingSafetyStrip: View {
    let readiness: MobileCaptureReadinessResponse?
    let selectedSession: MobileCaptureSession?
    let isRecording: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(isRecording ? "Recording is visibly active" : selectedSession?.captureReadinessLabel ?? "Recording readiness", systemImage: isRecording ? "record.circle.fill" : "lock.shield")
                    .font(.headline)
                    .foregroundStyle(isRecording ? .red : .primary)
                Spacer()
                Text(selectedSession?.captureReadinessLabel.uppercased() ?? "CHOOSE SESSION")
                    .font(.caption2.bold())
                    .foregroundStyle(selectedSession?.captureReadinessIsSafeToRecord == true ? .green : .orange)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background((selectedSession?.captureReadinessIsSafeToRecord == true ? Color.green : Color.orange).opacity(0.14), in: Capsule())
            }

            if let selectedSession {
                CaptureReadinessVerdictCard(session: selectedSession)
                MobileCaptureJourneyCard(session: selectedSession)
                MobileCaptureActionPacketCard(session: selectedSession)
                MobileCaptureLifecycleCard(session: selectedSession)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 8)], alignment: .leading, spacing: 8) {
                SafetyFact(
                    title: "Explicit consent",
                    detail: readiness?.recordingPolicy?.requiresExplicitConsent == true ? "Required by Nest policy" : "Policy needs review",
                    systemImage: "checkmark.shield",
                    tint: readiness?.recordingPolicy?.requiresExplicitConsent == true ? .green : .orange
                )
                SafetyFact(
                    title: "Visible state",
                    detail: readiness?.recordingPolicy?.visibleRecordingIndicatorRequired == true ? "Required in app" : "Indicator needs review",
                    systemImage: "eye",
                    tint: readiness?.recordingPolicy?.visibleRecordingIndicatorRequired == true ? .green : .orange
                )
                SafetyFact(
                    title: "Local fallback",
                    detail: "Original stays on device until verified",
                    systemImage: "externaldrive.badge.checkmark",
                    tint: .teal
                )
                SafetyFact(
                    title: "No hidden capture",
                    detail: readiness?.appStoreReadiness?.hiddenRecordingAllowed == false ? "Hidden recording blocked" : "Needs policy check",
                    systemImage: "hand.raised",
                    tint: readiness?.appStoreReadiness?.hiddenRecordingAllowed == false ? .green : .orange
                )
            }

            Text(selectedSession?.captureReadinessNextAction ?? "Choose a Quipsly session, grant consent, then start capture. If upload fails, Quipsly keeps a retryable local recording.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct MobileCaptureJourneyCard: View {
    let session: MobileCaptureSession

    private var blockersLine: String? {
        guard let blockers = session.journeySummary?.blockers, !blockers.isEmpty else { return nil }
        return blockers.joined(separator: ", ")
    }

    var body: some View {
        if session.journeySummary != nil {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "point.3.connected.trianglepath.dotted")
                        .foregroundStyle(.teal)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Session journey")
                            .font(.caption.bold())
                        Text(session.journeyNextAction)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    StatusChip(label: session.journeyStageLabel, tint: session.captureReadinessIsSafeToRecord ? .green : .teal)
                }

                if !session.journeyEvidenceChips.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 6)], alignment: .leading, spacing: 6) {
                        ForEach(Array(session.journeyEvidenceChips.enumerated()), id: \.offset) { _, chip in
                            StatusChip(label: chip.0, tint: chip.1 ? .green : .orange)
                        }
                    }
                }

                if let content = session.contentReadiness {
                    Divider()
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Image(systemName: content.isSubstantial ? "waveform.badge.checkmark" : "waveform.badge.exclamationmark")
                                .foregroundStyle(content.isSubstantial ? .green : .orange)
                            Text(content.label ?? "Recording content truth")
                                .font(.caption.bold())
                            Spacer()
                            StatusChip(label: content.isSubstantial ? "Content found" : "Proof only", tint: content.isSubstantial ? .green : .orange)
                        }
                        Text(content.detail ?? "Quipsly has not classified the source recording evidence yet.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Text(content.evidenceLine)
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                        if let nextAction = content.nextAction, !nextAction.isEmpty {
                            Text("Next: \(nextAction)")
                                .font(.caption2.bold())
                                .foregroundStyle(content.isSubstantial ? .green : .orange)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("MobileCaptureContentReadiness")
                }

                if let blockersLine {
                    Text("Needs: \(blockersLine)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("MobileCaptureJourneyCard")
        }
    }
}

struct MobileCaptureActionPacketCard: View {
    let session: MobileCaptureSession

    private var packet: MobileCaptureActionPacket? {
        session.actionPacket
    }

    private var tint: Color {
        guard let packet else { return .secondary }
        if packet.capabilities?.canStartLocalRecording == true { return .green }
        if packet.blockers?.isEmpty == false { return .orange }
        if packet.capabilities?.canJoin == true { return .teal }
        return .secondary
    }

    private var capabilityChips: [(String, Bool?)] {
        guard let capabilities = packet?.capabilities else { return [] }
        return [
            ("Join", capabilities.canJoin),
            ("Local record", capabilities.canStartLocalRecording),
            ("Provider record", capabilities.canStartProviderRecording),
            ("Receipt slot", capabilities.canPrepareProviderRecordingReceipt),
            ("Studio media", capabilities.canPromoteRecordingToMedia),
            ("Transcript", capabilities.canRunTranscript),
            ("Build packet", capabilities.canBuildPacket),
            ("Review", capabilities.canReviewPacket),
        ]
    }

    var body: some View {
        if let packet {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "switch.2")
                        .foregroundStyle(tint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Action packet")
                            .font(.caption.bold())
                        Text(packet.nextAction ?? "Review this session before acting.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    StatusChip(label: packet.stage ?? "capture", tint: tint)
                }

                if !capabilityChips.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 6)], alignment: .leading, spacing: 6) {
                        ForEach(Array(capabilityChips.enumerated()), id: \.offset) { _, chip in
                            StatusChip(label: chip.0, tint: chip.1 == true ? .green : .secondary)
                        }
                    }
                }

                if packet.capabilities?.canStartProviderRecording == false
                    || packet.boundaries?.providerRecordingStartAvailable == false {
                    Text("Provider recording is not started by joining. Receipt proof is required before transcript use.")
                        .font(.caption2.bold())
                        .foregroundStyle(.orange)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if packet.boundaries?.noHiddenRecording == true {
                    Text("No hidden recording: every capture action must stay visible and consent-backed.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let blockers = packet.blockers, !blockers.isEmpty {
                    Text("Needs: \(blockers.joined(separator: ", "))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("MobileCaptureActionPacketCard")
        }
    }
}

struct MobileCapturePacketReviewLaneRow: View {
    let lane: MobileCapturePacketReviewLane
    var isReviewing = false
    var onReview: ((String) -> Void)? = nil

    private var tint: Color {
        if lane.status == "APPROVED_FOR_INTERNAL_USE" { return .green }
        if lane.status == "NEEDS_REVISION" { return .orange }
        if lane.status == "REJECTED_BY_HUMAN" { return .red }
        if lane.status == "READY_FOR_HUMAN_REVIEW" { return .teal }
        return .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Image(systemName: lane.status == "READY_FOR_HUMAN_REVIEW" ? "tray.full" : "tray")
                    .font(.caption2)
                    .foregroundStyle(tint)
                Text(lane.titleLabel)
                    .font(.caption2.bold())
                Spacer()
                StatusChip(label: lane.displayStatus, tint: tint)
            }

            if let meaning = lane.meaning, !meaning.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                Text(meaning)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text(lane.boundaryLine)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let review = lane.humanReview, let reviewedAt = review.reviewedAt, !reviewedAt.isEmpty {
                Text("Reviewed: \(reviewedAt)")
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if onReview != nil {
                HStack(spacing: 6) {
                    Button("Approve") {
                        onReview?("APPROVED_FOR_INTERNAL_USE")
                    }
                    .disabled(isReviewing || lane.status == "APPROVED_FOR_INTERNAL_USE")

                    Button("Revise") {
                        onReview?("NEEDS_REVISION")
                    }
                    .disabled(isReviewing || lane.status == "NEEDS_REVISION")

                    Button("Reject") {
                        onReview?("REJECTED_BY_HUMAN")
                    }
                    .disabled(isReviewing || lane.status == "REJECTED_BY_HUMAN")
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
                .accessibilityIdentifier("MobileCapturePacketReviewLaneControls")
            }
        }
        .padding(7)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityIdentifier("MobileCapturePacketReviewLaneRow")
    }
}

struct MobileCaptureLifecycleCard: View {
    let session: MobileCaptureSession

    private var chips: [(String, Bool, Bool)] {
        session.lifecycleReceiptChips
    }

    private var safeActions: [MobileCaptureLifecycleSafeAction] {
        session.lifecycleSafeActions
    }

    private var stageTint: Color {
        if session.lifecycle?.readyForReview == true { return .green }
        if session.lifecycle?.readyForPacket == true || session.lifecycle?.readyForTranscript == true { return .teal }
        if session.lifecycle?.readyForCapture == true { return .green }
        return .orange
    }

    var body: some View {
        if session.lifecycle != nil {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "list.bullet.rectangle.portrait")
                        .foregroundStyle(stageTint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Capture lifecycle receipts")
                            .font(.caption.bold())
                        Text(session.lifecycleNextAction)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    StatusChip(label: session.lifecycleStageLabel, tint: stageTint)
                }

                Text(session.lifecycleReceiptLine)
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)

                if !chips.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 118), spacing: 6)], alignment: .leading, spacing: 6) {
                        ForEach(Array(chips.enumerated()), id: \.offset) { _, chip in
                            StatusChip(
                                label: chip.0,
                                tint: chip.1 ? .green : chip.2 ? .orange : .secondary
                            )
                        }
                    }
                }

                if !safeActions.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Safe next actions")
                            .font(.caption2.bold())
                            .foregroundStyle(.primary)

                        ForEach(safeActions.prefix(4)) { action in
                            MobileCaptureLifecycleSafeActionRow(action: action)
                        }
                    }
                    .padding(8)
                    .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(stageTint.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("MobileCaptureLifecycleCard")
        }
    }
}

struct MobileCaptureLifecycleSafeActionRow: View {
    let action: MobileCaptureLifecycleSafeAction

    private var tint: Color {
        if action.enabled {
            return action.risk.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "approval"
                ? .orange
                : .green
        }
        return .secondary
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Image(systemName: action.enabled ? "checkmark.seal.fill" : "hourglass")
                    .font(.caption2)
                    .foregroundStyle(tint)
                Text(action.label)
                    .font(.caption2.bold())
                    .lineLimit(1)
                Spacer(minLength: 4)
                StatusChip(label: action.statusLabel, tint: tint)
                StatusChip(label: action.riskLabel, tint: action.enabled ? tint : .secondary)
            }

            Text(action.why)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text("Action boundary: \(action.boundary)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(7)
        .background(tint.opacity(0.08), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .accessibilityIdentifier("MobileCaptureLifecycleSafeActionRow")
    }
}

struct CaptureReadinessVerdictCard: View {
    let session: MobileCaptureSession

    private var tint: Color {
        switch session.captureReadinessTone {
        case "ready":
            return .green
        case "complete":
            return .teal
        case "fallback":
            return .blue
        case "blocked":
            return .red
        case "attention":
            return .orange
        default:
            return session.captureReadinessIsSafeToRecord ? .green : .orange
        }
    }

    private var icon: String {
        if session.captureReadinessIsSafeToRecord { return "checkmark.seal.fill" }
        switch session.captureReadiness?.status {
        case "review-ready":
            return "doc.text.magnifyingglass"
        case "post-capture":
            return "sparkles.rectangle.stack"
        case "payment-hold":
            return "creditcard.trianglebadge.exclamationmark"
        case "blocked":
            return "xmark.octagon"
        default:
            return "exclamationmark.shield"
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: icon)
                    .foregroundStyle(tint)
                VStack(alignment: .leading, spacing: 2) {
                    Text(session.captureReadinessLabel)
                        .font(.caption.bold())
                    Text(session.captureReadinessDetail)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                if session.captureReadinessIsSafeToRecord {
                    Text("SAFE")
                        .font(.caption2.bold())
                        .foregroundStyle(.green)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.green.opacity(0.14), in: Capsule())
                }
            }

            if let blockers = session.captureReadiness?.blockers, !blockers.isEmpty {
                Text("Needs: \(blockers.joined(separator: ", "))")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("CaptureReadinessVerdictCard")
    }
}

struct SafetyFact: View {
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: systemImage)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption.bold())
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct CaptureDiagnosticsPanel: View {
    let session: MobileCaptureSession
    @ObservedObject var uploadManager: UploadManager

    private var transcriptRepairLine: String {
        if session.hasProviderRecordingReceiptSlot, session.latestRecordingAssetId == nil {
            return "provider receipt is not media"
        }
        if session.latestTranscriptJobId == nil, session.canRunTranscript {
            return "repair available from uploaded recording"
        }
        if session.latestTranscriptJobId != nil {
            return "job linked"
        }
        if session.latestRecordingAssetId != nil {
            return "waiting for upload verification"
        }
        return "record first"
    }

    private var preservedUploadLine: String {
        if uploadManager.recoverableUploadCount == 0 {
            return "no preserved upload recovery needed"
        }
        return "\(uploadManager.recoverableUploadCount) preserved upload\(uploadManager.recoverableUploadCount == 1 ? "" : "s")"
    }

    private var serverVerificationLine: String {
        if let status = uploadManager.lastServerVerificationStatus, !status.isEmpty {
            return "server verification: \(status.lowercased())"
        }
        if let status = session.latestRecordingAssetStatus, !status.isEmpty {
            return "server verification: \(status.lowercased())"
        }
        return "server verification: not yet received"
    }

    private var serverVerificationTint: Color {
        let status = (uploadManager.lastServerVerificationStatus ?? session.latestRecordingAssetStatus ?? "").lowercased()
        if status.contains("verified") { return .green }
        if status.contains("held") || status.contains("failed") || status.contains("missing") { return .orange }
        return .secondary
    }

    private var localRetentionLine: String {
        if let reason = uploadManager.lastLocalRetentionReason, !reason.isEmpty {
            return reason
        }
        return "Original stays on device until Quipsly verifies upload and retention policy allows cleanup."
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Capture diagnostics", systemImage: "stethoscope")
                .font(.caption.bold())

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 136), spacing: 8)], alignment: .leading, spacing: 8) {
                StatusChip(label: preservedUploadLine, tint: uploadManager.recoverableUploadCount == 0 ? .green : .orange)
                StatusChip(label: transcriptRepairLine, tint: session.canRunTranscript ? .teal : .secondary)
                StatusChip(label: "background upload", tint: .teal)
                StatusChip(label: session.latestRecordingAssetStatus?.lowercased() ?? "no recording asset", tint: session.latestRecordingAssetId == nil ? .secondary : .green)
                StatusChip(label: session.recordingPromotionBadgeLabel, tint: session.recordingPromotedToStudioMedia ? .green : session.canPromoteRecordingToStudioMedia ? .teal : .secondary)
                if session.hasProviderRecordingReceiptSlot {
                    StatusChip(label: "provider receipt: \(session.providerReceiptStatusLabel)", tint: .teal)
                }
                StatusChip(label: serverVerificationLine, tint: serverVerificationTint)
                StatusChip(label: "local source preserved", tint: .green)
            }

            Text("Background spine: \(UploadManager.backgroundSessionIdentifier)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)

            if let detail = uploadManager.lastServerVerificationDetail, !detail.isEmpty {
                Text("Server verification: \(detail)")
                    .font(.caption2)
                    .foregroundStyle(serverVerificationTint)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Text("Local source: \(localRetentionLine)")
                .font(.caption2)
                .foregroundStyle(.green)
                .fixedSize(horizontal: false, vertical: true)

            Text("Studio handoff: \(session.recordingMediaVaultLine)")
                .font(.caption2)
                .foregroundStyle(session.recordingPromotedToStudioMedia ? .green : .secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let detail = uploadManager.lastRecoveryDetail, !detail.isEmpty {
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(8)
        .background(Color.teal.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("QuipslyCaptureDiagnosticsPanel")
    }
}

struct CapturePostCaptureRunwayCard: View {
    let session: MobileCaptureSession

    private var sourceTint: Color {
        if session.latestRecordingAssetId != nil { return .green }
        if session.recordingCount > 0 || session.hasProviderRecordingReceiptSlot { return .orange }
        return .secondary
    }

    private var sourceStatus: String {
        if session.latestRecordingAssetId != nil {
            return session.latestRecordingAssetStatus?.lowercased() ?? "server evidence linked"
        }
        if session.hasProviderRecordingReceiptSlot {
            return "provider receipt slot only"
        }
        if session.recordingCount > 0 {
            return "waiting for upload verification"
        }
        return "record first"
    }

    private var studioTint: Color {
        if session.recordingPromotedToStudioMedia { return .green }
        if session.canPromoteRecordingToStudioMedia { return .teal }
        return .secondary
    }

    private var studioStatus: String {
        if session.recordingPromotedToStudioMedia {
            return "attached as Studio media"
        }
        if session.canPromoteRecordingToStudioMedia {
            return "ready to attach"
        }
        if session.latestRecordingAssetId != nil {
            return "waiting for safe attach"
        }
        return "waits on recording evidence"
    }

    private var transcriptTint: Color {
        if session.latestTranscriptStatus?.uppercased() == "COMPLETED" { return .green }
        if session.canRunTranscript { return .teal }
        return .secondary
    }

    private var transcriptStatus: String {
        if session.latestTranscriptStatus?.uppercased() == "COMPLETED" {
            let count = session.latestTranscriptSegmentCount ?? 0
            return count > 0 ? "\(count) segments ready" : "transcript ready"
        }
        if session.canRunTranscript {
            return session.latestTranscriptJobId == nil ? "repair/run available" : "rerun available"
        }
        return "waits on verified recording"
    }

    private var packetTint: Color {
        if session.coachingPacketSummaryNoteId != nil { return .green }
        if session.canBuildPacket { return .teal }
        return .secondary
    }

    private var packetStatus: String {
        if session.coachingPacketSummaryNoteId != nil {
            return "packet ready for review"
        }
        if session.canBuildPacket {
            return "can build packet"
        }
        return "waits on transcript"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Post-capture runway", systemImage: "point.topleft.down.curvedto.point.bottomright.up")
                .font(.caption.bold())

            Text("Each step is evidence, not magic. Attach to Studio does not publish, charge, schedule, delete local media, or start a provider recording.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 6) {
                CaptureRunwayStep(
                    number: "1",
                    title: "Source evidence",
                    status: sourceStatus,
                    detail: "CallRoom and RecordingAsset keep consent, upload, and provider receipt truth.",
                    tint: sourceTint
                )
                CaptureRunwayStep(
                    number: "2",
                    title: "Studio attachment",
                    status: studioStatus,
                    detail: "Promotion creates reusable Studio media and whole-source episode-editor meaning without mutating the original. Video then needs a media-vault proxy before collaborative editing treats it as playback-ready.",
                    tint: studioTint
                )
                CaptureRunwayStep(
                    number: "3",
                    title: "Transcript",
                    status: transcriptStatus,
                    detail: "Transcript work starts from verified recording evidence and remains repairable.",
                    tint: transcriptTint
                )
                CaptureRunwayStep(
                    number: "4",
                    title: "Packet review",
                    status: packetStatus,
                    detail: "Notes, goals, actions, podcast material, and follow-up packets stay reviewable.",
                    tint: packetTint
                )
            }
        }
        .padding(8)
        .background(Color.indigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("CapturePostCaptureRunwayCard")
    }
}

struct CaptureRunwayStep: View {
    let number: String
    let title: String
    let status: String
    let detail: String
    let tint: Color

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Text(number)
                .font(.caption2.bold())
                .foregroundStyle(tint)
                .frame(width: 22, height: 22)
                .background(tint.opacity(0.16), in: Circle())

            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(title)
                        .font(.caption.bold())
                    Text(status)
                        .font(.caption2.bold())
                        .foregroundStyle(tint)
                }
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("CaptureRunwayStep-\(number)")
    }
}

struct ProviderReceiptSlotNotice: View {
    let session: MobileCaptureSession

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Provider receipt slot prepared", systemImage: "doc.badge.clock")
                .font(.caption.bold())
                .foregroundStyle(.teal)
            Text("This is not a recording yet. \(session.providerReceiptActionLabel)")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if let id = session.providerRecordingReceiptSlotId, !id.isEmpty {
                Text(id)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("ProviderReceiptSlotNotice")
    }
}

struct CaptureSessionReceiptCard: View {
    let session: MobileCaptureSession
    @ObservedObject var uploadManager: UploadManager

    private var serverReceiptStatus: String {
        let uploadStatus = uploadManager.lastServerVerificationStatus?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let uploadStatus, !uploadStatus.isEmpty {
            return uploadStatus.lowercased()
        }

        let assetStatus = session.latestRecordingAssetStatus?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let assetStatus, !assetStatus.isEmpty {
            return assetStatus.lowercased()
        }

        if uploadManager.recoverableUploadCount > 0 {
            return "upload held for retry"
        }

        if session.hasProviderRecordingReceiptSlot {
            return "provider receipt slot only"
        }

        if session.recordingCount > 0 {
            return "waiting for server receipt"
        }

        return "recording not started"
    }

    private var serverReceiptTint: Color {
        let status = serverReceiptStatus
        if status.contains("verified") || status.contains("uploaded") { return .green }
        if status.contains("held") || status.contains("failed") || status.contains("missing") { return .orange }
        return .secondary
    }

    private var transcriptStatus: String {
        if session.latestTranscriptStatus?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased() == "COMPLETED" {
            return "transcript ready"
        }
        if session.canRunTranscript {
            return session.latestTranscriptJobId == nil ? "repair transcript next" : "rerun transcript available"
        }
        return session.transcriptBadgeLabel.lowercased()
    }

    private var packetStatus: String {
        if session.coachingPacketSummaryNoteId != nil {
            return "packet ready"
        }
        if session.canBuildPacket {
            return "packet can be built"
        }
        return "packet waits on transcript"
    }

    private var nextSafeAction: String {
        if uploadManager.recoverableUploadCount > 0 {
            return "Retry the preserved upload. Do not delete the local recording."
        }
        if session.hasProviderRecordingReceiptSlot, session.latestRecordingAssetId == nil {
            return session.providerReceiptActionLabel
        }
        if session.canRunTranscript {
            return session.latestTranscriptJobId == nil ? "Repair the transcript from the uploaded recording." : "Run transcript again if the current result needs repair."
        }
        if session.canBuildPacket {
            return "Build the client packet for review."
        }
        if session.coachingPacketSummaryNoteId != nil {
            return "Open the packet, review highlights and actions, then approve any follow-up."
        }

        let next = session.afterCaptureNextAction?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let next, !next.isEmpty {
            return next
        }
        return session.afterCaptureLine
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Capture receipt", systemImage: "checklist.checked")
                .font(.caption.bold())

            Text("Local original preserved. Quipsly keeps the source recording safe while server, Studio media, transcript, and packet receipts catch up.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 126), spacing: 8)], alignment: .leading, spacing: 8) {
                StatusChip(label: "local original safe", tint: .green)
                StatusChip(label: "server: \(serverReceiptStatus)", tint: serverReceiptTint)
                StatusChip(label: session.recordingPromotionBadgeLabel, tint: session.recordingPromotedToStudioMedia ? .green : session.canPromoteRecordingToStudioMedia ? .teal : .secondary)
                StatusChip(label: transcriptStatus, tint: session.latestTranscriptStatus == "COMPLETED" ? .green : .orange)
                StatusChip(label: packetStatus, tint: session.coachingPacketSummaryNoteId == nil ? .secondary : .teal)
            }

            Label(nextSafeAction, systemImage: "arrow.forward.circle")
                .font(.caption2.bold())
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(8)
        .background(Color.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("CaptureSessionReceiptCard")
    }
}

struct MobileClientFollowUpCard: View {
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    @State private var isExpanded = true
    @State private var isConfirmingOpen = false

    private var followUp: MobileCaptureClientFollowUp? {
        session.clientFollowUp
    }

    private func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    var body: some View {
        if let followUp {
            DisclosureGroup(isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: 10) {
                    if let intro = followUp.intro?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !intro.isEmpty {
                        Text(intro)
                            .font(.caption)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    if !followUp.notes.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("What we want to keep")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                            ForEach(followUp.notes) { note in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(nonempty(note.title) ?? "Session note")
                                        .font(.caption.bold())
                                    Text(note.body)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .padding(8)
                                .background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                            }
                        }
                    }

                    if !followUp.goals.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Label("Goals", systemImage: "target")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                            ForEach(followUp.goals) { goal in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "circle")
                                        .font(.caption2)
                                        .padding(.top, 2)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(goal.title)
                                            .font(.caption.bold())
                                        Text(goal.status.replacingOccurrences(of: "_", with: " ").capitalized)
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }

                    if !followUp.tasks.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Label("Commitments", systemImage: "checklist")
                                .font(.caption2.bold())
                                .foregroundStyle(.secondary)
                            ForEach(followUp.tasks) { task in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: task.status == "DONE" ? "checkmark.circle.fill" : "circle")
                                        .font(.caption)
                                        .foregroundStyle(task.status == "DONE" ? .green : .secondary)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(task.title)
                                            .font(.caption.bold())
                                        if let detail = nonempty(task.detail) {
                                            Text(detail)
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if let next = followUp.nextSessionFocus?.trimmingCharacters(in: .whitespacesAndNewlines),
                       !next.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Bring into the next Session")
                                .font(.caption2.bold())
                                .foregroundStyle(.purple)
                            Text(next)
                                .font(.caption)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(8)
                        .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    }

                    HStack(spacing: 8) {
                        StatusChip(label: "revision \(followUp.revision)", tint: .green)
                        StatusChip(
                            label: followUp.openedAt == nil ? "open not confirmed" : "open confirmed",
                            tint: followUp.openedAt == nil ? .orange : .green
                        )
                    }

                    if followUp.canAcknowledge {
                        Button {
                            isConfirmingOpen = true
                            Task {
                                _ = await sessionClient.acknowledgeClientFollowUp(for: session)
                                isConfirmingOpen = false
                            }
                        } label: {
                            Label(
                                followUp.openedAt != nil
                                    ? "Open confirmed"
                                    : isConfirmingOpen
                                        ? "Confirming"
                                        : "Confirm I opened this",
                                systemImage: followUp.openedAt != nil ? "checkmark.seal.fill" : "eye"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(followUp.openedAt != nil || isConfirmingOpen)
                        .accessibilityIdentifier("CaptureClientFollowUpAcknowledge_\(followUp.id)")
                        .accessibilityHint("Records an in-app open receipt for this exact follow-up. It does not complete any task or goal.")
                    }

                    Text("This released snapshot contains only deliberately client-safe notes and client-owned goals or tasks. It is not an email, public post, calendar action, or proof that any commitment is complete.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("SHA-256 \(followUp.contentSha256)")
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .padding(.top, 8)
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Client follow-up", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(.green)
                    Text(followUp.title)
                        .font(.subheadline.bold())
                    Text("Released to \(followUp.recipientLabel) in Quipsly")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("CaptureClientFollowUp_\(followUp.id)")
            }
            .padding(10)
            .background(Color.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct StatusChip: View {
    let label: String
    let tint: Color

    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.14), in: Capsule())
    }
}

struct OutlineInspector: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Document outline")
                .font(.headline)
            ForEach(blocks) { block in
                Button {
                    selectedBlockID = block.id
                } label: {
                    HStack {
                        Text(block.label)
                            .font(.caption.bold())
                            .foregroundStyle(.teal)
                        Text(block.title)
                            .lineLimit(1)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ClipInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Selected clip")
                .font(.headline)
            if let cue = block?.clipCue {
                ClipCuePill(cue: cue)
            } else {
                Text("No clip cue on the selected block.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct TagInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tags")
                .font(.headline)
            TagWrap(tags: block?.tags ?? [])
            Text("Mobile tagging should stay fast: Chapter, Episode, speaker, show note, quote, clip cue.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct SyncInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sync")
                .font(.headline)
            Text(block?.clipCue == nil ? "Select a clip cue to review sync." : "Clip cue is ready for mobile preview. Detailed sync lives in Nest or Mac.")
                .foregroundStyle(.secondary)
            HStack {
                Button("-10s") {}
                Button("-1s") {}
                Button("-0.1s") {}
                Button("+0.1s") {}
                Button("+1s") {}
                Button("+10s") {}
            }
            .buttonStyle(.bordered)
            .disabled(block?.clipCue == nil)
        }
    }
}

struct FocusModePanel: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    private var selectedBlock: MobileManuscriptBlock? {
        blocks.first { $0.id == selectedBlockID } ?? blocks.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Focus")
                .font(.largeTitle.bold())
            if let block = selectedBlock {
                ManuscriptBlockCard(block: block, isSelected: true)
            }
            Spacer()
            Text("Focus mode is the anti-panic surface: current text, current cue, and only the controls needed right now.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial)
    }
}

struct AccountSafetyPanel: View {
    @StateObject private var deletionClient = AccountDeletionClient()
    @StateObject private var authManager = AuthManager.shared
    @State private var deletionReason = ""
    private let policyBaseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                MobileHeroCard(
                    eyebrow: "Account",
                    title: "Your exit door stays visible.",
                    description: "Quipsly records coaching calls, transcripts, and payment evidence, so deletion is a reviewed request rather than a surprise bonfire."
                )

                VStack(alignment: .leading, spacing: 12) {
                    Label(authManager.userName ?? "Signed in to Quipsly", systemImage: "person.crop.circle")
                        .font(.headline)
                    Text("Sign out removes this device session. It does not delete your Quipsly account, recordings, transcripts, notes, bookings, or receipts.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Button(role: .cancel) {
                        authManager.signOut()
                    } label: {
                        Label("Sign out on this device", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                    .buttonStyle(.bordered)
                }
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                VStack(alignment: .leading, spacing: 12) {
                    Label("Request account deletion", systemImage: "trash.circle")
                        .font(.headline)
                    Text("This starts a support-reviewed deletion flow. Quipsly needs to review recordings, transcripts, consent records, payment evidence, and legal retention before destructive deletion.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    TextField("Optional reason", text: $deletionReason, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .lineLimit(3, reservesSpace: true)
                    Button(role: .destructive) {
                        Task { await deletionClient.requestDeletion(reason: deletionReason) }
                    } label: {
                        if deletionClient.isSubmitting {
                            Label("Submitting", systemImage: "hourglass")
                        } else {
                            Label("Request deletion review", systemImage: "trash")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(deletionClient.isSubmitting)

                    Text(deletionClient.status)
                        .font(.caption.bold())
                        .foregroundStyle(deletionClient.errorMessage == nil ? .teal : .red)
                    if let error = deletionClient.errorMessage {
                        Text(error)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                    if let nextAction = deletionClient.latestNextAction {
                        Text(nextAction)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let requestId = deletionClient.latestRequestId {
                        Text("Request ID: \(requestId)")
                            .font(.system(.caption2, design: .monospaced))
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))

                VStack(alignment: .leading, spacing: 12) {
                    Label("Privacy and recording", systemImage: "lock.shield")
                        .font(.headline)
                    Text("Review how Quipsly handles recording consent, uploads, transcripts, coaching notes, Stripe evidence, and deletion requests.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack {
                        if let privacyURL = URL(string: "\(policyBaseURL)/privacy") {
                            Link(destination: privacyURL) {
                                Label("Privacy", systemImage: "safari")
                            }
                        }
                        if let deletionURL = URL(string: "\(policyBaseURL)/privacy/account-deletion") {
                            Link(destination: deletionURL) {
                                Label("Deletion details", systemImage: "trash")
                            }
                        }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }
                .padding()
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .padding()
        }
        .background(MobileStudioBackground())
    }
}

struct CaptureReadinessPanel: View {
    @ObservedObject var client: CaptureReadinessClient

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Label("Capture readiness", systemImage: "checklist.checked")
                    .font(.headline)
                Spacer()
                Button {
                    Task { await client.load() }
                } label: {
                    Label(client.isLoading ? "Checking" : "Check", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(client.isLoading)
            }

            if let readiness = client.readiness {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 142), spacing: 10)], alignment: .leading, spacing: 10) {
                    ReadinessBadge(
                        title: readiness.signedInLabel,
                        detail: readiness.user?.email ?? "Nest session",
                        systemImage: readiness.signedIn == true ? "person.crop.circle.badge.checkmark" : "person.crop.circle.badge.exclamationmark",
                        tint: readiness.signedIn == true ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.providerLabel,
                        detail: readiness.providerReadiness?.nextAction ?? "Provider room state",
                        systemImage: "wave.3.right.circle",
                        tint: readiness.appStoreReadiness?.nativeProviderRoomUiReady == true ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.providerEgressLabel,
                        detail: readiness.providerEgressDetail,
                        systemImage: "recordingtape.circle",
                        tint: readiness.providerEgressReady ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.uploadTranscriptLabel,
                        detail: readiness.uploadAndTranscriptReadiness?.transcriptBoundary ?? "Upload and transcript chain",
                        systemImage: "icloud.and.arrow.up",
                        tint: readiness.uploadAndTranscriptReadiness?.cloudStorageConfigured == true ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.mediaVaultLabel,
                        detail: readiness.mediaVaultDetail,
                        systemImage: "externaldrive.badge.checkmark",
                        tint: readiness.mediaVaultReady ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.calendarLabel,
                        detail: readiness.calendarDetail.isEmpty ? "Google Calendar is evidence; Quipsly owns booking truth." : readiness.calendarDetail,
                        systemImage: "calendar.badge.clock",
                        tint: readiness.calendarReadiness?.accessOk == true ? .green : .orange
                    )
                    ReadinessBadge(
                        title: readiness.paymentBoundary?.stripeConfigured == true ? "Stripe configured" : "Stripe held",
                        detail: "One-to-one coaching evidence only",
                        systemImage: "creditcard",
                        tint: readiness.paymentBoundary?.stripeConfigured == true ? .green : .orange
                    )
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text(readiness.appStoreRiskLine)
                        .font(.caption.bold())
                        .foregroundStyle(readiness.appStoreReadiness?.nativeProviderRoomUiReady == true ? .green : .orange)

                    if let localFallback = readiness.recordingPolicy?.localFallback {
                        Text(localFallback)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let providerTruth = readiness.providerReadiness?.sourceOfTruth {
                        Text(providerTruth)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let mediaVaultTruth = readiness.mediaVaultReadiness?.sourceOfTruth {
                        Text(mediaVaultTruth)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if let calendarTruth = readiness.calendarReadiness?.sourceOfTruth {
                        Text(calendarTruth)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    HStack(spacing: 10) {
                        if let privacy = readiness.policyUrls?.privacy, let url = URL(string: privacy) {
                            Link("Privacy", destination: url)
                                .font(.caption.bold())
                        }
                        if let deletion = readiness.policyUrls?.accountDeletion, let url = URL(string: deletion) {
                            Link("Delete account", destination: url)
                                .font(.caption.bold())
                        }
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text(client.status)
                        .font(.subheadline.bold())
                    Text(client.errorMessage ?? "Quipsly checks sign-in, privacy routes, recording consent policy, provider room setup, upload, transcript, Stripe boundary, and App Store review flags here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .task {
            await client.load()
        }
    }
}

struct ReadinessBadge: View {
    let title: String
    let detail: String
    let systemImage: String
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: systemImage)
                .font(.caption.bold())
                .foregroundStyle(tint)
            Text(detail)
                .font(.caption2)
                .lineLimit(3)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
        .padding(10)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
