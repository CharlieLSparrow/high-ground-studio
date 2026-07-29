import SwiftUI

struct CaptureSourceEvidenceView: View {
    let recordingID: UUID

    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var evidenceFileURL: URL?
    @State private var isPreparing = false
    @State private var errorMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let recording = library.recording(id: recordingID) {
                    explanation
                    identityCard(recording)
                    captureCard(recording)
                    roomCard(recording)
                    cloudCard(recording)
                    evidenceAction(recording)
                } else {
                    ContentUnavailableView(
                        "Source unavailable",
                        systemImage: "waveform.badge.exclamationmark",
                        description: Text("This source is not visible in the active account library.")
                    )
                }
            }
            .padding(18)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Source evidence")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureSourceEvidenceView")
    }

    private var explanation: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Proof attached to the original", systemImage: "checkmark.shield")
                .font(.title3.weight(.bold))
            Text("Quipsly keeps capture-time device details, room boundaries, local integrity, and verified cloud evidence together without changing the recording.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func identityCard(_ recording: LocalRecording) -> some View {
        evidenceCard(title: "Source identity", systemImage: "fingerprint") {
            EvidenceRow(label: "Source ID", value: recording.id.uuidString.lowercased())
            EvidenceRow(label: "Group ID", value: recording.captureGroupId?.uuidString.lowercased() ?? "Not grouped")
            EvidenceRow(label: "Kind", value: recording.effectiveMediaKind.rawValue.capitalized)
            EvidenceRow(label: "Started", value: recording.startedAt.formatted(date: .abbreviated, time: .standard))
            EvidenceRow(label: "Duration", value: durationLabel(recording.durationSeconds))
            EvidenceRow(
                label: "Local bytes",
                value: ByteCountFormatter.string(fromByteCount: recording.byteCount, countStyle: .file)
            )
        }
    }

    private func captureCard(_ recording: LocalRecording) -> some View {
        evidenceCard(title: "Captured with", systemImage: "iphone.gen3") {
            EvidenceRow(label: "App", value: appLabel(recording.sourceProfile))
            EvidenceRow(label: "Device", value: deviceLabel(recording.sourceProfile))
            EvidenceRow(label: "Audio route", value: routeLabel(recording.sourceProfile))
            EvidenceRow(label: "Pipeline", value: nonempty(recording.sourceProfile?.audioCapturePipeline) ?? "Not recorded")
            if recording.effectiveMediaKind == .video {
                EvidenceRow(label: "Camera", value: nonempty(recording.sourceProfile?.cameraPosition)?.capitalized ?? "Not recorded")
                EvidenceRow(label: "Recorded media", value: recording.recordedVideoProfileLabel ?? "Awaiting full decode evidence")
            }
        }
    }

    private func roomCard(_ recording: LocalRecording) -> some View {
        let roomRequired = nonempty(recording.callRoomId) != nil
        let complete = !roomRequired
            || (recording.roomStartReceiptId != nil && recording.roomStopReceiptId != nil)
        return evidenceCard(title: "Room boundary", systemImage: complete ? "lock.shield.fill" : "exclamationmark.shield") {
            EvidenceRow(label: "Room", value: nonempty(recording.callRoomId) ?? "Standalone capture")
            EvidenceRow(label: "START receipt", value: recording.roomStartReceiptId?.uuidString.lowercased() ?? (roomRequired ? "Missing" : "Not required"))
            EvidenceRow(label: "STOP receipt", value: recording.roomStopReceiptId?.uuidString.lowercased() ?? (roomRequired ? "Missing" : "Not required"))
            Label(
                complete ? "Complete capture boundary" : "Boundary evidence needs attention",
                systemImage: complete ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(complete ? .green : .orange)
            .accessibilityIdentifier("CaptureSourceEvidenceRoomBoundaryStatus")
        }
    }

    private func cloudCard(_ recording: LocalRecording) -> some View {
        let claimsVerified =
            nonempty(recording.serverVerificationStatus)?.lowercased() == "verified"
        let hasCompleteStoredProof =
            claimsVerified
            && nonempty(recording.verifiedCloudSHA256) != nil
            && recording.verifiedCloudSizeBytes != nil
            && nonempty(recording.verifiedCloudGeneration) != nil
            && recording.verifiedCloudAt != nil
        let statusLabel = hasCompleteStoredProof
            ? "Server verified · local comparison ready"
            : claimsVerified
                ? "Verified claim · proof incomplete"
                : nonempty(recording.serverVerificationStatus)?.capitalized
                    ?? "Not verified"
        return evidenceCard(
            title: "Cloud copy",
            systemImage: hasCompleteStoredProof ? "checkmark.icloud.fill" : "icloud"
        ) {
            EvidenceRow(label: "Status", value: statusLabel)
            EvidenceRow(label: "Source record", value: nonempty(recording.uploadedSourceId) ?? "Not assigned")
            EvidenceRow(label: "Media asset", value: nonempty(recording.uploadedMediaAssetId) ?? "Not assigned")
            EvidenceRow(label: "Transcript job", value: nonempty(recording.transcriptJobId) ?? "Not assigned")
            EvidenceRow(label: "Verified hash", value: shortenedDigest(recording.verifiedCloudSHA256))
            EvidenceRow(
                label: "Verified bytes",
                value: recording.verifiedCloudSizeBytes.map {
                    ByteCountFormatter.string(fromByteCount: $0, countStyle: .file)
                } ?? "Not verified"
            )
            EvidenceRow(label: "Generation", value: nonempty(recording.verifiedCloudGeneration) ?? "Not verified")
            if let verifiedAt = recording.verifiedCloudAt {
                EvidenceRow(label: "Verified at", value: verifiedAt.formatted(date: .abbreviated, time: .standard))
            }
        }
    }

    private func evidenceAction(_ recording: LocalRecording) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Portable evidence receipt", systemImage: "doc.badge.gearshape")
                .font(.headline)
            Text("This recomputes SHA-256 from every local source byte, checks that the file stayed unchanged, redacts the account identifier, and writes a protected versioned JSON snapshot.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureSourceEvidenceError")
            }

            if let evidenceFileURL {
                Label("Evidence receipt prepared", systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CaptureSourceEvidencePrepared")
                ShareLink(item: evidenceFileURL) {
                    Label("Share evidence receipt", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("CaptureSourceEvidenceShare")
            } else {
                Button {
                    prepareEvidence()
                } label: {
                    HStack {
                        if isPreparing {
                            ProgressView()
                        }
                        Label(
                            isPreparing ? "Verifying every byte…" : "Verify and prepare receipt",
                            systemImage: isPreparing ? "hourglass" : "checkmark.shield"
                        )
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isPreparing || !recording.status.isPlaybackEligible)
                .accessibilityIdentifier("CaptureSourceEvidencePrepare")
            }
        }
        .evidenceSurface()
    }

    private func prepareEvidence() {
        isPreparing = true
        errorMessage = nil
        Task {
            do {
                evidenceFileURL = try await CaptureSourceEvidenceExporter.prepare(
                    recordingID: recordingID,
                    library: library
                )
            } catch {
                errorMessage = error.localizedDescription
            }
            isPreparing = false
        }
    }

    private func evidenceCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .evidenceSurface()
    }

    private func appLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let version = nonempty(profile?.captureAppVersion) ?? "unknown"
        let build = nonempty(profile?.captureAppBuild) ?? "unknown"
        return "Quipsly Capture \(version) (\(build))"
    }

    private func deviceLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let label = [
            nonempty(profile?.deviceModelIdentifier),
            nonempty(profile?.deviceSystemName),
            nonempty(profile?.deviceSystemVersion),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return nonempty(label) ?? "Not recorded"
    }

    private func routeLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let label = [
            nonempty(profile?.audioRouteName),
            nonempty(profile?.audioRoutePortType),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return nonempty(label) ?? "No captured audio route"
    }

    private func shortenedDigest(_ value: String?) -> String {
        guard let value = nonempty(value), value.count >= 16 else {
            return "Not verified"
        }
        return "\(value.prefix(10))…\(value.suffix(10))"
    }

    private func durationLabel(_ duration: TimeInterval) -> String {
        let totalSeconds = max(0, Int(duration.rounded()))
        let hours = totalSeconds / 3_600
        let minutes = (totalSeconds % 3_600) / 60
        let seconds = totalSeconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%d:%02d", minutes, seconds)
    }

    private func nonempty(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }
}

private struct EvidenceRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.monospaced())
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value)")
    }
}

private extension View {
    func evidenceSurface() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            }
    }
}

struct CaptureSourceEvidencePreviewView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Proof attached to the original", systemImage: "checkmark.shield")
                        .font(.title3.weight(.bold))
                    Text("Preview data demonstrates the review surface only. It never claims that synthetic media was captured or verified.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                previewCard(title: "Source identity", systemImage: "fingerprint") {
                    EvidenceRow(label: "Source ID", value: "preview-source")
                    EvidenceRow(label: "Group ID", value: "preview-capture-group")
                    EvidenceRow(label: "Kind", value: "Audio")
                    EvidenceRow(label: "Local bytes", value: "18.4 MB")
                }

                previewCard(title: "Captured with", systemImage: "iphone.gen3") {
                    EvidenceRow(label: "App", value: "Quipsly Capture preview")
                    EvidenceRow(label: "Device", value: "iPhone · iOS preview")
                    EvidenceRow(label: "Audio route", value: "Preview microphone")
                    EvidenceRow(label: "Pipeline", value: "livekit-local-input-pcm")
                }

                previewCard(title: "Room boundary", systemImage: "lock.shield.fill") {
                    EvidenceRow(label: "Room", value: "room-preview-coaching-ready")
                    EvidenceRow(label: "START receipt", value: "preview-start-receipt")
                    EvidenceRow(label: "STOP receipt", value: "preview-stop-receipt")
                    Label("Complete capture boundary", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CaptureSourceEvidenceRoomBoundaryStatus")
                }

                previewCard(title: "Cloud copy", systemImage: "icloud") {
                    EvidenceRow(label: "Status", value: "Not verified")
                    EvidenceRow(label: "Verified hash", value: "Not verified")
                    Text("A real receipt becomes shareable only after Quipsly hashes an actual finalized local source.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Label(
                    "Preview only · no evidence file created",
                    systemImage: "eye"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureSourceEvidencePreviewBoundary")
            }
            .padding(18)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Source evidence")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureSourceEvidenceView")
    }

    private func previewCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .evidenceSurface()
    }
}
