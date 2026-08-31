import Combine
import CryptoKit
import Foundation
import Network
import UIKit

final class UploadManager: NSObject, ObservableObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    static let shared = UploadManager()
    static let backgroundSessionIdentifier = "com.quipsly.upload.chunked"
    static let allowsCellularUserDefaultsKey = "com.quipsly.capture.upload.allowsCellular"
    static let allowsExpensiveUserDefaultsKey = "com.quipsly.capture.upload.allowsExpensive"
    static let allowsConstrainedUserDefaultsKey = "com.quipsly.capture.upload.allowsConstrained"

    private static let activeUploadsUserDefaultsKey = "com.quipsly.uploadManager.activeUploads"
    private static let defaultUploadPolicy: [String: Any] = [
        allowsCellularUserDefaultsKey: true,
        allowsExpensiveUserDefaultsKey: true,
        allowsConstrainedUserDefaultsKey: true,
    ]

    @Published var uploadProgress: Double = 0.0
    @Published var isUploading: Bool = false
    @Published var statusText: String? = nil
    @Published var lastUploadedSourceId: String? = nil
    @Published var lastTranscriptJobId: String? = nil
    @Published var lastTranscriptJobStatus: String? = nil
    @Published var recoverableUploadCount: Int = 0
    @Published var lastRecoveryDetail: String? = nil
    @Published var lastServerVerificationStatus: String? = nil
    @Published var lastServerVerificationDetail: String? = nil
    @Published var lastProcessingDisposition: String? = nil
    @Published var lastProcessingHoldReason: String? = nil
    @Published var lastTranscriptDisposition: String? = nil
    @Published var lastLocalRetentionReason: String? = nil

    // WebRTC Adaptive State Hooks
    @Published var networkQuality: String = "Excellent"
    @Published var webrtcVideoEnabled: Bool = true

    private let studioApiBaseUrl = normalizedNestAPIBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
    private let chunkSize: Int = 5 * 1024 * 1024 // 5MB chunks to survive bad cell coverage
    private let maximumRetryCount = 5
    private let baseRetryDelay: TimeInterval = 2
    private let maximumRetryDelay: TimeInterval = 5 * 60
    private let maximumRetryAfterDelay: TimeInterval = 15 * 60
    private let canonicalProtocolKind = "quipsly-mobile-capture-gcs-resumable-v2"

    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "NetworkMonitor")

    private var responseData = [Int: Data]()

    // Track active chunk sessions
    private var activeUploads = [String: UploadSession]()
    private var activeTaskSessionIds = Set<String>()
    private var ignoredTaskIdentifiers = Set<Int>()
    private var quarantinedTaskIdentifiers = Set<Int>()
    private var retryWorkItems = [String: DispatchWorkItem]()
    private var canonicalControlTasks = [String: Task<Void, Never>]()
    private var preparationBackgroundTasks = [String: UIBackgroundTaskIdentifier]()
    private var preparationBackgroundDeadlines = [String: DispatchWorkItem]()
    private var uploadCompletions = [String: (Bool, String?, String?) -> Void]()
    private var isReconcilingBackgroundTasks = false
    private var shouldResumeAfterReconciliation = false
    private var shouldOverrideBackoffAfterReconciliation = false
    private var durableLedgerAvailable = true
    private var shouldReloadDurableLedger = false
    private var activeOwnerAccountID = AuthManager.currentStoredOwnerID()
    private var accountObserver: NSObjectProtocol?

    private struct NetworkPolicy {
        let allowsCellular: Bool
        let allowsExpensive: Bool
        let allowsConstrained: Bool
    }

    private var networkPolicy: NetworkPolicy

    struct UploadSession: Codable {
        var fileUrlBookmark: Data?
        var fileRelativePath: String?
        let projectSlug: String
        let episodeSlug: String
        let callRoomId: String?
        let participantId: String?
        let recordingConsentId: String?
        let recordingConsentGranted: Bool?
        /// True only when this exact source is expected to produce a protected
        /// Apple Speech sidecar locally. Nest keeps a cloud job as a fallback
        /// handle but does not spend provider work automatically.
        let onDeviceTranscriptExpected: Bool?
        let recordingAssetId: String?
        let capturePurpose: String?
        let sourceType: String
        let captureGroupId: UUID?
        let sourceProfileJson: String?
        let trackId: String?
        let startedAt: String?
        let stoppedAt: String?
        let recordingSegmentsJson: String?
        let localRecordingID: UUID?
        let ownerAccountID: String?
        let totalChunks: Int
        var currentChunk: Int
        let sessionId: String
        var lastMediaAssetId: String?
        var lastRecordingAssetId: String? = nil
        var lastSourceId: String?
        var lastTranscriptJobId: String?
        var lastTranscriptJobStatus: String? = nil
        var lastServerVerificationStatus: String? = nil
        var lastServerVerificationDetail: String? = nil
        var lastProcessingDisposition: String? = nil
        var lastProcessingHoldReason: String? = nil
        var lastTranscriptDisposition: String? = nil
        var lastLocalRetentionReason: String? = nil
        var retryCount: Int?
        var nextAttemptAt: Date?
        var taskIdentifier: Int?
        var isHeld: Bool?
        var isAwaitingVerification: Bool?
        // Optional fields keep decoding compatible with pre-resumable ledgers.
        // A nil protocolKind is a legacy server-chunk upload; every new upload
        // is created with the canonical GCS resumable contract.
        var protocolKind: String?
        var protocolPhase: String?
        var resumableUploadURL: String?
        var resumableUploadExpiresAt: String?
        var canonicalFinalizeURL: String?
        var canonicalObjectPath: String?
        var expectedSHA256: String?
        var expectedSizeBytes: Int64?
        var verifiedCloudSHA256: String? = nil
        var verifiedCloudSizeBytes: Int64? = nil
        var verifiedCloudGeneration: String? = nil
        var verifiedCloudAt: Date? = nil
        var uploadContentType: String?
        var requiresFreshUploadSession: Bool? = nil
        let fileName: String

        var fileUrl: URL {
            if let data = fileUrlBookmark {
                var isStale = false
                if let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &isStale),
                   FileManager.default.fileExists(atPath: url.path) {
                    return url
                }
            }

            if let relativeURL = Self.resolveRelativePath(fileRelativePath),
               FileManager.default.fileExists(atPath: relativeURL.path) {
                return relativeURL
            }

            let fallbackRoots = Self.sandboxRoots.map(\.url)
            if let fallback = fallbackRoots
                .map({ $0.appendingPathComponent(fileName, isDirectory: false) })
                .first(where: { FileManager.default.fileExists(atPath: $0.path) }) {
                return fallback
            }

            return Self.sandboxRoots[0].url.appendingPathComponent(fileName, isDirectory: false)
        }

        /// Stable source identity used for destructive local-file coordination.
        /// Unlike `fileUrl`, this never searches by basename and does not require
        /// the source to still exist, so a legacy nil-ID job cannot drift onto a
        /// same-named file or disappear between tombstone and recovery cleanup.
        var durableSourceIdentityURL: URL? {
            if let relativeURL = Self.resolveRelativePath(fileRelativePath),
               let confinedURL = Self.canonicalConfinedSourceURL(for: relativeURL) {
                return confinedURL
            }
            if let data = fileUrlBookmark {
                var isStale = false
                if let bookmarkedURL = try? URL(
                    resolvingBookmarkData: data,
                    options: [.withoutUI],
                    relativeTo: nil,
                    bookmarkDataIsStale: &isStale
                ), let confinedURL = Self.canonicalConfinedSourceURL(for: bookmarkedURL) {
                    return confinedURL
                }
            }
            return nil
        }

        private static var sandboxRoots: [(name: String, url: URL)] {
            let fileManager = FileManager.default
            var roots: [(String, URL)] = []
            if let documents = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first {
                roots.append(("Documents", documents))
            }
            if let applicationSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first {
                roots.append(("Application Support", applicationSupport))
            }
            if let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first {
                roots.append(("Caches", caches))
            }
            if roots.isEmpty {
                roots.append(("Documents", URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Documents", isDirectory: true)))
            }
            return roots
        }

        static func canonicalConfinedSourceURL(for fileURL: URL) -> URL? {
            guard fileURL.isFileURL else { return nil }
            let canonicalURL = fileURL.standardizedFileURL.resolvingSymlinksInPath()
            let canonicalPath = canonicalURL.path
            for root in sandboxRoots {
                let rootURL = root.url.standardizedFileURL.resolvingSymlinksInPath()
                let rootPath = rootURL.path
                guard canonicalPath == rootPath || canonicalPath.hasPrefix(rootPath + "/") else { continue }
                return canonicalURL
            }
            return nil
        }

        private static func relativePath(for fileURL: URL) -> String? {
            let standardizedPath = fileURL.standardizedFileURL.path
            for root in sandboxRoots {
                let rootPath = root.url.standardizedFileURL.path
                guard standardizedPath == rootPath || standardizedPath.hasPrefix(rootPath + "/") else { continue }
                let suffix = String(standardizedPath.dropFirst(rootPath.count)).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
                guard !suffix.isEmpty else { return root.name }
                return "\(root.name)/\(suffix)"
            }
            return nil
        }

        private static func resolveRelativePath(_ relativePath: String?) -> URL? {
            guard let relativePath, !relativePath.isEmpty else { return nil }
            for root in sandboxRoots {
                if relativePath == root.name {
                    return root.url
                }
                let prefix = root.name + "/"
                guard relativePath.hasPrefix(prefix) else { continue }
                let suffix = String(relativePath.dropFirst(prefix.count))
                guard !suffix.split(separator: "/").contains("..") else { return nil }
                return root.url.appendingPathComponent(suffix, isDirectory: false)
            }
            return nil
        }

        init(
            fileUrl: URL,
            projectSlug: String,
            episodeSlug: String,
            callRoomId: String?,
            participantId: String?,
            recordingConsentId: String?,
            recordingConsentGranted: Bool,
            onDeviceTranscriptExpected: Bool = false,
            recordingAssetId: String?,
            capturePurpose: String?,
            sourceType: String,
            captureGroupId: UUID?,
            sourceProfileJson: String?,
            trackId: String?,
            startedAt: String?,
            stoppedAt: String?,
            recordingSegmentsJson: String?,
            localRecordingID: UUID?,
            ownerAccountID: String?,
            fileName: String,
            totalChunks: Int,
            currentChunk: Int,
            sessionId: String,
            protocolKind: String? = nil,
            protocolPhase: String? = nil,
            expectedSizeBytes: Int64? = nil,
            uploadContentType: String? = nil
        ) {
            self.fileUrlBookmark = try? fileUrl.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            self.fileRelativePath = Self.relativePath(for: fileUrl)
            self.projectSlug = projectSlug
            self.episodeSlug = episodeSlug
            self.callRoomId = callRoomId
            self.participantId = participantId
            self.recordingConsentId = recordingConsentId
            self.recordingConsentGranted = recordingConsentGranted
            self.onDeviceTranscriptExpected = onDeviceTranscriptExpected
            self.recordingAssetId = recordingAssetId
            self.capturePurpose = capturePurpose
            self.sourceType = sourceType
            self.captureGroupId = captureGroupId
            self.sourceProfileJson = sourceProfileJson
            self.trackId = trackId
            self.startedAt = startedAt
            self.stoppedAt = stoppedAt
            self.recordingSegmentsJson = recordingSegmentsJson
            self.localRecordingID = localRecordingID
            self.ownerAccountID = ownerAccountID
            self.totalChunks = totalChunks
            self.fileName = fileName
            self.currentChunk = currentChunk
            self.sessionId = sessionId
            self.protocolKind = protocolKind
            self.protocolPhase = protocolPhase
            self.expectedSizeBytes = expectedSizeBytes
            self.uploadContentType = uploadContentType
        }
    }

    private lazy var urlSession: URLSession = {
        // Resumable background configuration
        let config = URLSessionConfiguration.background(withIdentifier: Self.backgroundSessionIdentifier)
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true // CRITICAL: Wait for cell coverage to return instead of failing instantly
        // Keep the long-lived background session permissive. Each task applies
        // the current, user-controlled policy so settings can change safely
        // without invalidating daemon-owned background work.
        config.allowsCellularAccess = true
        config.allowsExpensiveNetworkAccess = true
        config.allowsConstrainedNetworkAccess = true
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()

    override init() {
        let defaults = UserDefaults.standard
        defaults.register(defaults: Self.defaultUploadPolicy)
        networkPolicy = Self.readNetworkPolicy(from: defaults)
        super.init()
        loadActiveUploads()
        _ = urlSession

        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                if path.status == .satisfied {
                    self?.networkQuality = "Excellent"
                    self?.webrtcVideoEnabled = true
                    self?.reassociateBackgroundSession(resumePendingUploads: true)
                    print("📡 NETWORK RECOVERED: WebRTC video restored.")
                } else {
                    self?.networkQuality = "Poor (Audio Only)"
                    self?.webrtcVideoEnabled = false
                    print("📡 NETWORK DROP: Adaptive WebRTC turned off video. Local high-fidelity recording continues flawlessly.")
                }
            }
        }
        pathMonitor.start(queue: monitorQueue)
        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.activateOwner(notification.object as? String)
        }
        reassociateBackgroundSession(resumePendingUploads: true)
    }

    private static func readNetworkPolicy(from defaults: UserDefaults = .standard) -> NetworkPolicy {
        NetworkPolicy(
            allowsCellular: defaults.bool(forKey: allowsCellularUserDefaultsKey),
            allowsExpensive: defaults.bool(forKey: allowsExpensiveUserDefaultsKey),
            allowsConstrained: defaults.bool(forKey: allowsConstrainedUserDefaultsKey)
        )
    }

    /// Stable per-job jitter avoids synchronized retry storms while keeping retry
    /// timing reproducible in tests and after process relaunch. The multiplier is
    /// always within the conventional 90–110% backoff envelope.
    static func deterministicRetryJitterMultiplier(sessionId: String, retryCount: Int) -> Double {
        var hash: UInt64 = 14_695_981_039_346_656_037
        for byte in "\(sessionId.lowercased()):\(max(retryCount, 0))".utf8 {
            hash ^= UInt64(byte)
            hash &*= 1_099_511_628_211
        }
        let tenThousandths = Double(hash % 2_001) / 10_000
        return 0.9 + tenThousandths
    }

    /// Refreshes upload policy for future requests. Background URLSession configuration
    /// is immutable, so each request also receives the current policy explicitly.
    func reloadNetworkPolicy() {
        UserDefaults.standard.register(defaults: Self.defaultUploadPolicy)
        networkPolicy = Self.readNetworkPolicy()
    }

    private func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = normalizedOwnerID(ownerAccountID)
        uploadProgress = 0
        isUploading = false
        statusText = nil
        lastUploadedSourceId = nil
        lastTranscriptJobId = nil
        lastTranscriptJobStatus = nil
        lastServerVerificationStatus = nil
        lastServerVerificationDetail = nil
        lastProcessingDisposition = nil
        lastProcessingHoldReason = nil
        lastTranscriptDisposition = nil
        lastLocalRetentionReason = nil
        lastRecoveryDetail = nil

        for sessionId in Array(canonicalControlTasks.keys)
        where !sessionBelongsToActiveOwner(sessionId) {
            canonicalControlTasks.removeValue(forKey: sessionId)?.cancel()
            endPreparationBackgroundTime(for: sessionId)
        }
        for sessionId in Array(retryWorkItems.keys)
        where !sessionBelongsToActiveOwner(sessionId) {
            retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        }
        reassociateBackgroundSession(resumePendingUploads: activeOwnerAccountID != nil)
        refreshUploadActivity()
    }

    /// Forces creation of the background URLSession and reconnects its tasks to the
    /// durable upload ledger. AppDelegate calls this during launch and background wake.
    func prepareForBackgroundEvents() {
        if shouldReloadDurableLedger {
            loadActiveUploads()
        }
        _ = urlSession
        reassociateBackgroundSession(resumePendingUploads: true)
    }

    func startUpload(
        fileUrl: URL,
        projectSlug: String,
        episodeSlug: String,
        callRoomId: String? = nil,
        participantId: String? = nil,
        recordingConsentId: String? = nil,
        recordingConsentGranted: Bool = false,
        onDeviceTranscriptExpected: Bool = false,
        recordingAssetId: String? = nil,
        capturePurpose: String? = nil,
        sourceType: String = "audio",
        captureGroupId: UUID? = nil,
        sourceProfileJson: String? = nil,
        trackId: String? = nil,
        startedAt: String? = nil,
        stoppedAt: String? = nil,
        recordingSegmentsJson: String? = nil,
        localRecordingID: UUID? = nil,
        ownerAccountID: String? = nil,
        completion: ((Bool, String?, String?) -> Void)? = nil
    ) {
        let currentOwnerAccountID = normalizedOwnerID(AuthManager.currentStoredOwnerID())
        let requestedOwnerAccountID = normalizedOwnerID(ownerAccountID) ?? currentOwnerAccountID
        guard let currentOwnerAccountID,
              requestedOwnerAccountID == currentOwnerAccountID else {
            completion?(false, nil, "Verify the owning Quipsly account before uploading this recording")
            statusText = "Upload held. This protected source is not available to the current account."
            return
        }
        guard FileManager.default.fileExists(atPath: fileUrl.path) else {
            completion?(false, nil, "Recording file is missing")
            statusText = "Recording file is missing"
            return
        }

        do {
            let fileAttr = try FileManager.default.attributesOfItem(atPath: fileUrl.path)
            guard let fileSizeValue = fileAttr[.size] as? NSNumber else {
                completion?(false, nil, "Could not determine recording size")
                statusText = "Could not determine recording size. Local recording preserved."
                return
            }

            let fileSize = fileSizeValue.int64Value
            guard fileSize > 0 else {
                completion?(false, nil, "Recording is empty")
                statusText = "Recording is empty; nothing was uploaded. Local file preserved."
                lastRecoveryDetail = "Quipsly will not finalize a zero-byte recording. Record again or preserve this file for diagnosis."
                return
            }

            if let existingSessionId = activeUploads.first(where: {
                sessionBelongsToActiveOwner($0.key)
                    && $0.value.fileUrl.standardizedFileURL == fileUrl.standardizedFileURL
            })?.key {
                completion?(false, nil, "This recording already has a pending upload")
                statusText = "This recording already has a pending upload. Reconnecting it instead of creating a duplicate."
                lastRecoveryDetail = "Pending upload \(existingSessionId) still owns the preserved local source."
                reassociateBackgroundSession(resumePendingUploads: true)
                return
            }

            // The durable UUID is both the local ledger key and Nest's
            // idempotency key. Lowercasing keeps it byte-for-byte aligned with
            // the canonical server manifest.
            let sessionId = (localRecordingID ?? UUID()).uuidString.lowercased()
            let sourceContentType = contentType(for: fileUrl)
            let normalizedSourceType = sourceType
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            guard ["audio", "video"].contains(normalizedSourceType),
                  (normalizedSourceType == "video") == sourceContentType.hasPrefix("video/") else {
                completion?(false, nil, "Recording media type and file container disagree")
                statusText = "Upload held because the protected source type does not match its file container."
                return
            }
            let session = UploadSession(
                fileUrl: fileUrl,
                projectSlug: projectSlug,
                episodeSlug: episodeSlug,
                callRoomId: callRoomId,
                participantId: participantId,
                recordingConsentId: recordingConsentId,
                recordingConsentGranted: recordingConsentGranted,
                onDeviceTranscriptExpected: onDeviceTranscriptExpected,
                recordingAssetId: recordingAssetId,
                capturePurpose: capturePurpose,
                sourceType: normalizedSourceType,
                captureGroupId: captureGroupId ?? localRecordingID,
                sourceProfileJson: sourceProfileJson,
                trackId: trackId,
                startedAt: startedAt,
                stoppedAt: stoppedAt,
                recordingSegmentsJson: recordingSegmentsJson,
                localRecordingID: localRecordingID,
                ownerAccountID: currentOwnerAccountID,
                fileName: fileUrl.lastPathComponent,
                totalChunks: 1,
                currentChunk: 0,
                sessionId: sessionId,
                protocolKind: canonicalProtocolKind,
                protocolPhase: "hashing",
                expectedSizeBytes: fileSize,
                uploadContentType: sourceContentType
            )

            activeUploads[sessionId] = session
            if let completion {
                uploadCompletions[sessionId] = completion
            }
            guard saveActiveUploads() else {
                var heldSession = session
                heldSession.isHeld = true
                heldSession.protocolPhase = "held"
                heldSession.lastServerVerificationStatus = "held"
                heldSession.lastServerVerificationDetail = "The protected upload job could not be committed before transfer."
                activeUploads[sessionId] = heldSession
                statusText = "Upload held until the protected job ledger can be saved."
                lastRecoveryDetail = "No recording bytes were sent. The local source remains preserved."
                uploadCompletions.removeValue(forKey: sessionId)?(
                    false,
                    nil,
                    "Protected upload ledger unavailable"
                )
                refreshUploadActivity()
                return
            }
            refreshRecoverableUploadCount()

            isUploading = true
            uploadProgress = 0.0
            statusText = "Preparing a secure upload receipt…"
            lastUploadedSourceId = nil
            lastTranscriptJobId = nil
            lastTranscriptJobStatus = nil
            lastServerVerificationStatus = nil
            lastServerVerificationDetail = nil
            lastProcessingDisposition = nil
            lastProcessingHoldReason = nil
            lastTranscriptDisposition = nil
            lastLocalRetentionReason = nil
            lastRecoveryDetail = nil

            // Hash first, then create/recover the idempotent server manifest,
            // then stream the immutable local file to its server-authorized
            // durable destination.
            uploadNextChunk(for: sessionId)

        } catch {
            completion?(false, nil, "Could not read file attributes")
            statusText = "Could not read recording metadata. Local recording preserved."
        }
    }

    private func uploadNextChunk(for sessionId: String) {
        guard var session = activeUploads[sessionId] else { return }
        guard sessionBelongsToActiveOwner(sessionId) else {
            refreshUploadActivity()
            return
        }
        guard durableLedgerAvailable else {
            statusText = "Upload held until the protected job ledger is available."
            refreshUploadActivity()
            return
        }
        if isReconcilingBackgroundTasks {
            shouldResumeAfterReconciliation = true
            refreshUploadActivity()
            return
        }
        guard !activeTaskSessionIds.contains(sessionId), session.taskIdentifier == nil else {
            return
        }
        guard session.isHeld != true else {
            refreshUploadActivity()
            return
        }

        if let nextAttemptAt = session.nextAttemptAt, nextAttemptAt > Date() {
            scheduleRetryWakeup(for: sessionId, at: nextAttemptAt)
            refreshUploadActivity()
            return
        }

        if session.protocolKind == canonicalProtocolKind {
            continueCanonicalUpload(for: sessionId)
            return
        }

        if session.currentChunk >= session.totalChunks {
            // All chunks uploaded! Notify backend to reassemble.
            finalizeUpload(for: sessionId)
            return
        }

        let fileUrl = session.fileUrl
        let chunkIndex = session.currentChunk
        let sourceContentType = contentType(for: fileUrl)

        guard FileManager.default.fileExists(atPath: fileUrl.path) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording could not be located.",
                detail: "Quipsly checked the saved bookmark and sandbox-relative path but could not find \(session.fileName). Restore the preserved local source before retrying."
            )
            return
        }

        // Read the specific chunk into memory (avoids OOM on massive 4K video files)
        guard let fileHandle = try? FileHandle(forReadingFrom: fileUrl) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Quipsly could not open the preserved local recording at \(fileUrl.path). Check file access and retry when the recording is reachable."
            )
            return
        }

        fileHandle.seek(toFileOffset: UInt64(chunkIndex * chunkSize))
        let chunkData = fileHandle.readData(ofLength: chunkSize)
        fileHandle.closeFile()

        guard !chunkData.isEmpty else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Recording data was empty.",
                detail: "Chunk \(chunkIndex + 1) contained no bytes. The local source remains at \(fileUrl.path) for recovery."
            )
            return
        }

        let tempDir = FileManager.default.temporaryDirectory
        let tempFileUrl = tempDir.appendingPathComponent("\(sessionId)_chunk_\(chunkIndex).tmp")
        do {
            try chunkData.write(to: tempFileUrl)
        } catch {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Quipsly could not write a temporary upload chunk. The original recording is still preserved at \(fileUrl.path)."
            )
            return
        }

        // Quipsly's chunk endpoint assembles the recording, creates app-owned
        // recording/upload/transcript evidence, and tells the app whether server
        // verification exists. A 200 is not permission to delete the local source.
        guard let url = URL(string: "\(studioApiBaseUrl)/mobile/capture/uploads/chunk") else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Quipsly could not build the upload URL. The original recording is still preserved at \(fileUrl.path). Check Nest URL settings and retry."
            )
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue(sourceContentType, forHTTPHeaderField: "X-Content-Type")
        request.setValue(fileUrl.lastPathComponent, forHTTPHeaderField: "X-File-Name")
        request.setValue(sessionId, forHTTPHeaderField: "X-Session-ID")
        request.setValue(String(chunkIndex), forHTTPHeaderField: "X-Chunk-Index")
        request.setValue(String(session.totalChunks), forHTTPHeaderField: "X-Total-Chunks")
        if let token = AuthManager.currentStoredAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        request.setValue(session.projectSlug, forHTTPHeaderField: "X-Project-Slug")
        request.setValue(session.episodeSlug, forHTTPHeaderField: "X-Episode-Slug")
        if let callRoomId = session.callRoomId {
            request.setValue(callRoomId, forHTTPHeaderField: "X-Call-Room-Id")
        }
        if let participantId = session.participantId {
            request.setValue(participantId, forHTTPHeaderField: "X-Participant-Id")
        }
        if let consentId = session.recordingConsentId {
            request.setValue(consentId, forHTTPHeaderField: "X-Recording-Consent-Id")
        }
        request.setValue(session.recordingConsentGranted == true ? "true" : "false", forHTTPHeaderField: "X-Recording-Consent-Granted")
        if let assetId = session.recordingAssetId {
            request.setValue(assetId, forHTTPHeaderField: "X-Recording-Asset-Id")
        }
        if let purpose = session.capturePurpose {
            request.setValue(purpose, forHTTPHeaderField: "X-Capture-Purpose")
        }
        request.setValue(session.sourceType, forHTTPHeaderField: "X-Source-Type")
        if let trackId = session.trackId {
            request.setValue(trackId, forHTTPHeaderField: "X-Track-Id")
        }
        if let startedAt = session.startedAt {
            request.setValue(startedAt, forHTTPHeaderField: "X-Recording-Started-At")
        }
        if let stoppedAt = session.stoppedAt {
            request.setValue(stoppedAt, forHTTPHeaderField: "X-Recording-Stopped-At")
        }
        if let segments = session.recordingSegmentsJson {
            request.setValue(segments, forHTTPHeaderField: "X-Recording-Segments")
        }

        // The configuration is immutable after URLSession creation. Applying the
        // current UserDefaults policy to every new request makes Account changes
        // effective without invalidating in-flight background work.
        networkPolicy = Self.readNetworkPolicy()
        request.allowsCellularAccess = networkPolicy.allowsCellular
        request.allowsExpensiveNetworkAccess = networkPolicy.allowsExpensive
        request.allowsConstrainedNetworkAccess = networkPolicy.allowsConstrained

        let task = urlSession.uploadTask(with: request, fromFile: tempFileUrl)
        task.taskDescription = sessionId
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        session.taskIdentifier = task.taskIdentifier
        session.nextAttemptAt = nil
        session.isAwaitingVerification = false
        activeUploads[sessionId] = session
        activeTaskSessionIds.insert(sessionId)
        guard saveActiveUploads() else {
            // A background task is created suspended. Cancel it before its first
            // resume when the matching durable job cannot be committed.
            ignoredTaskIdentifiers.insert(task.taskIdentifier)
            task.cancel()
            try? FileManager.default.removeItem(at: tempFileUrl)
            holdInMemoryForUnavailableLedger(
                sessionId: sessionId,
                detail: "The upload chunk was never started because its protected job could not be committed."
            )
            return
        }
        isUploading = true
        statusText = "Uploading chunk \(chunkIndex + 1) of \(session.totalChunks)..."
        task.resume()
    }

    // MARK: - Canonical resumable upload

    private struct CanonicalUploadEnvelope: Decodable {
        struct UploadInstruction: Decodable {
            let method: String?
            let url: String?
            let expiresAt: String?
            let contentType: String?
            let contentLength: Int64?
        }

        struct Verification: Decodable {
            let expectedSha256: String?
            let computedSha256: String?
            let expectedSizeBytes: Int64?
            let verifiedSizeBytes: Int64?
            let generation: String?
            let verifiedAt: String?
        }

        struct CaptureRecords: Decodable {
            let sourceId: String?
            let mediaAssetId: String?
            let recordingAssetId: String?
            let transcriptJobId: String?
            let transcriptJobStatus: String?
            let processingDisposition: String?
            let holdReason: String?
            let transcriptDisposition: String?
            let transcriptHoldReason: String?
        }

        struct ProcessingHold: Decodable {
            let reasonCode: String?
            let reason: String?
        }

        struct ServerVerification: Decodable {
            let status: String?
            let reason: String?
            let detail: String?
            let recordingAssetId: String?
            let transcriptJobId: String?
            let verifiedAt: String?
            let sizeBytes: Int64?
        }

        struct Failure: Decodable {
            let code: String?
            let message: String?
            let retryable: Bool?
        }

        struct LocalRetention: Decodable {
            let reason: String?
            let message: String?
            let detail: String?
        }

        let ok: Bool?
        let canonical: Bool?
        let uploadSessionId: String?
        let uploadStage: String?
        let expectedSizeBytes: Int64?
        let expectedSha256: String?
        let upload: UploadInstruction?
        let finalizeUrl: String?
        let objectPath: String?
        let objectName: String?
        let storageBackend: String?
        let storageUri: String?
        let gcsUri: String?
        let sha256: String?
        let verification: Verification?
        let storageVerification: Verification?
        let finalization: CaptureRecords?
        let captureRecords: CaptureRecords?
        let processingDisposition: String?
        let processingHold: ProcessingHold?
        let transcriptDisposition: String?
        let transcriptHold: ProcessingHold?
        let serverVerification: ServerVerification?
        let failure: Failure?
        let localRetention: LocalRetention?
        let retryAfterSeconds: Double?
        let error: String?
        let message: String?
    }

    private struct FileDigest {
        let sha256: String
        let sizeBytes: Int64
    }

    private static func computeFileDigest(at fileURL: URL) throws -> FileDigest {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }

        var hasher = SHA256()
        var streamedBytes: Int64 = 0
        while true {
            let data = try handle.read(upToCount: 1024 * 1024) ?? Data()
            guard !data.isEmpty else { break }
            hasher.update(data: data)
            streamedBytes += Int64(data.count)
        }

        let digest = hasher.finalize().map { String(format: "%02x", $0) }.joined()
        return FileDigest(sha256: digest, sizeBytes: streamedBytes)
    }

    private func continueCanonicalUpload(for sessionId: String) {
        guard let uploadSession = activeUploads[sessionId],
              sessionBelongsToActiveOwner(sessionId),
              uploadSession.protocolKind == canonicalProtocolKind,
              uploadSession.isHeld != true,
              uploadSession.taskIdentifier == nil,
              !activeTaskSessionIds.contains(sessionId) else {
            refreshUploadActivity()
            return
        }

        switch uploadSession.protocolPhase ?? "hashing" {
        case "hashing":
            ensurePreparationBackgroundTime(for: sessionId)
            beginCanonicalControlTask(for: sessionId) { manager in
                await manager.hashCanonicalSource(for: sessionId)
            }
        case "creating":
            ensurePreparationBackgroundTime(for: sessionId)
            beginCanonicalControlTask(for: sessionId) { manager in
                await manager.createOrRecoverCanonicalSession(for: sessionId)
            }
        case "uploading":
            startCanonicalBackgroundUpload(for: sessionId)
        case "finalizing", "verifying":
            ensurePreparationBackgroundTime(for: sessionId)
            beginCanonicalControlTask(for: sessionId) { manager in
                await manager.finalizeCanonicalUpload(for: sessionId)
            }
        case "verified":
            finalizeUpload(for: sessionId)
        default:
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Quipsly found an unknown upload phase. The local source remains at \(uploadSession.fileUrl.path)."
            )
        }
    }

    private func beginCanonicalControlTask(
        for sessionId: String,
        operation: @escaping @MainActor (UploadManager) async -> Void
    ) {
        guard canonicalControlTasks[sessionId] == nil else { return }
        let task = Task { @MainActor [weak self] in
            guard let self else { return }
            await operation(self)
            self.canonicalControlTasks.removeValue(forKey: sessionId)
            if let uploadSession = self.activeUploads[sessionId], uploadSession.isHeld != true {
                self.uploadNextChunk(for: sessionId)
            } else {
                self.refreshUploadActivity()
            }
        }
        canonicalControlTasks[sessionId] = task
        refreshUploadActivity()
    }

    /// Bridges the short hash/control-plane window until URLSession's daemon
    /// owns the file upload. iOS still controls the actual allowance; the
    /// explicit 25-second deadline prevents an assertion from leaking if a
    /// control request stalls.
    private func ensurePreparationBackgroundTime(for sessionId: String) {
        guard preparationBackgroundTasks[sessionId] == nil else { return }

        let identifier = UIApplication.shared.beginBackgroundTask(
            withName: "QuipslyCapturePrepareUpload-\(sessionId)"
        ) { [weak self] in
            DispatchQueue.main.async {
                guard let self else { return }
                if self.activeUploads[sessionId] != nil {
                    self.lastRecoveryDetail = "Upload preparation paused safely. Quipsly will resume from the protected local ledger."
                }
                self.endPreparationBackgroundTime(for: sessionId)
            }
        }
        guard identifier != .invalid else { return }
        preparationBackgroundTasks[sessionId] = identifier

        let deadline = DispatchWorkItem { [weak self] in
            self?.endPreparationBackgroundTime(for: sessionId)
        }
        preparationBackgroundDeadlines[sessionId] = deadline
        DispatchQueue.main.asyncAfter(deadline: .now() + 25, execute: deadline)
    }

    private func endPreparationBackgroundTime(for sessionId: String) {
        preparationBackgroundDeadlines.removeValue(forKey: sessionId)?.cancel()
        guard let identifier = preparationBackgroundTasks.removeValue(forKey: sessionId),
              identifier != .invalid else { return }
        UIApplication.shared.endBackgroundTask(identifier)
    }

    @MainActor
    private func hashCanonicalSource(for sessionId: String) async {
        guard sessionBelongsToActiveOwner(sessionId),
              var uploadSession = activeUploads[sessionId] else { return }
        let fileURL = uploadSession.fileUrl
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording could not be located.",
                detail: "Quipsly could not find \(uploadSession.fileName). Restore the preserved source before retrying."
            )
            return
        }

        statusText = "Checking the original recording before upload…"
        lastRecoveryDetail = "Computing a streaming SHA-256 receipt without loading the recording into memory."
        do {
            let digest = try await Task.detached(priority: .utility) {
                try Self.computeFileDigest(at: fileURL)
            }.value
            guard !Task.isCancelled, sessionBelongsToActiveOwner(sessionId) else { return }
            guard digest.sizeBytes > 0 else {
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held. Recording is empty.",
                    detail: "Quipsly will not upload a zero-byte source. The local file remains at \(fileURL.path)."
                )
                return
            }

            let currentSize = ((try FileManager.default.attributesOfItem(atPath: fileURL.path)[.size]) as? NSNumber)?.int64Value
            guard currentSize == digest.sizeBytes else {
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held because the recording changed while it was being checked.",
                    detail: "Quipsly only uploads immutable finalized sources. The local file remains at \(fileURL.path)."
                )
                return
            }

            uploadSession.expectedSHA256 = digest.sha256
            uploadSession.expectedSizeBytes = digest.sizeBytes
            uploadSession.protocolPhase = "creating"
            uploadSession.retryCount = 0
            uploadSession.nextAttemptAt = nil
            uploadSession.lastServerVerificationStatus = "prepared"
            uploadSession.lastServerVerificationDetail = "Local size and SHA-256 receipt prepared."
            activeUploads[sessionId] = uploadSession
            statusText = "Creating a secure cloud upload…"
            saveActiveUploads()
        } catch {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Quipsly could not compute the recording receipt: \(error.localizedDescription). The source remains at \(fileURL.path)."
            )
        }
    }

    @MainActor
    private func createOrRecoverCanonicalSession(for sessionId: String) async {
        guard !Task.isCancelled, sessionBelongsToActiveOwner(sessionId) else { return }
        guard var uploadSession = activeUploads[sessionId],
              let expectedSHA256 = normalizedSHA256(uploadSession.expectedSHA256),
              let expectedSizeBytes = uploadSession.expectedSizeBytes,
              expectedSizeBytes > 0,
              let expectedOwnerAccountID = normalizedOwnerID(uploadSession.ownerAccountID) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. The local verification receipt is incomplete.",
                detail: "Retry to restore the protected owner, size, and SHA-256 receipt before creating its cloud upload."
            )
            return
        }

        guard uploadSession.recordingConsentGranted == true,
              let callRoomId = nonempty(uploadSession.callRoomId),
              let recordingConsentId = nonempty(uploadSession.recordingConsentId),
              let startedAt = nonempty(uploadSession.startedAt),
              let stoppedAt = nonempty(uploadSession.stoppedAt) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held until the recording session and consent receipt are complete.",
                detail: "Canonical uploads require a room, granted consent receipt, and start/stop timestamps. The local source remains at \(uploadSession.fileUrl.path)."
            )
            return
        }

        guard let endpoint = URL(string: "\(studioApiBaseUrl)/mobile/capture/uploads/resumable") else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Quipsly's upload address is invalid.",
                detail: "Check the Nest API configuration. The local source remains at \(uploadSession.fileUrl.path)."
            )
            return
        }

        var body: [String: Any] = [
            "uploadSessionId": uploadSession.sessionId,
            "projectSlug": uploadSession.projectSlug,
            "episodeSlug": uploadSession.episodeSlug,
            "fileName": uploadSession.fileName,
            "contentType": uploadSession.uploadContentType ?? contentType(for: uploadSession.fileUrl),
            "sourceType": uploadSession.sourceType,
            "expectedSizeBytes": expectedSizeBytes,
            "sha256": expectedSHA256,
            "callRoomId": callRoomId,
            "recordingConsentId": recordingConsentId,
            "startedAt": startedAt,
            "stoppedAt": stoppedAt,
        ]
        if let value = nonempty(uploadSession.participantId) { body["participantId"] = value }
        if let value = nonempty(uploadSession.recordingAssetId) { body["recordingAssetId"] = value }
        if uploadSession.onDeviceTranscriptExpected == true {
            body["onDeviceTranscriptExpected"] = true
        }
        if let value = nonempty(uploadSession.capturePurpose) { body["capturePurpose"] = value }
        if let value = uploadSession.captureGroupId?.uuidString.lowercased() {
            body["captureGroupId"] = value
        }
        if let value = nonempty(uploadSession.sourceProfileJson) {
            body["sourceProfileJson"] = value
        }
        if let value = nonempty(uploadSession.trackId) { body["trackId"] = value }
        if let value = nonempty(uploadSession.recordingSegmentsJson) { body["recordingSegmentsJson"] = value }
        if uploadSession.requiresFreshUploadSession == true { body["restartUploadSession"] = true }

        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: expectedOwnerAccountID
            )
            guard !Task.isCancelled, sessionBelongsToActiveOwner(sessionId) else { return }
            let envelope = try decodeCanonicalEnvelope(data)
            guard (200...299).contains(response.statusCode),
                  envelope.ok != false,
                  envelope.canonical == true else {
                handleCanonicalAPIError(
                    for: sessionId,
                    response: response,
                    envelope: envelope,
                    operation: "create the secure upload",
                    retryOnConflict: false
                )
                return
            }
            guard envelope.uploadSessionId?.lowercased() == uploadSession.sessionId.lowercased(),
                  normalizedSHA256(envelope.expectedSha256) == expectedSHA256,
                  envelope.expectedSizeBytes == expectedSizeBytes else {
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held because the server receipt did not match this recording.",
                    detail: "Quipsly rejected a mismatched session, size, or SHA-256 binding. The local source remains at \(uploadSession.fileUrl.path)."
                )
                return
            }

            uploadSession.retryCount = 0
            uploadSession.nextAttemptAt = nil
            uploadSession.isHeld = false
            uploadSession.requiresFreshUploadSession = false
            uploadSession.canonicalFinalizeURL = envelope.finalizeUrl ?? uploadSession.canonicalFinalizeURL
            uploadSession.canonicalObjectPath = envelope.objectPath
                ?? envelope.objectName
                ?? envelope.storageUri
                ?? envelope.gcsUri
                ?? uploadSession.canonicalObjectPath
            if let retention = canonicalRetentionReason(envelope) {
                uploadSession.lastLocalRetentionReason = retention
            }

            let stage = envelope.uploadStage?.lowercased() ?? "uploading"
            switch stage {
            case "verified", "verifying", "uploaded-unverified":
                uploadSession.resumableUploadURL = nil
                uploadSession.resumableUploadExpiresAt = nil
                uploadSession.protocolPhase = "finalizing"
                uploadSession.currentChunk = uploadSession.totalChunks
                uploadSession.isAwaitingVerification = true
                statusText = "Confirming the durable Quipsly receipt…"
            case "uploading":
                guard let instruction = envelope.upload,
                      instruction.method?.uppercased() == "PUT",
                      let uploadURL = instruction.url,
                      let parsedUploadURL = URL(string: uploadURL),
                      isAllowedCanonicalUploadURL(parsedUploadURL),
                      instruction.contentLength == expectedSizeBytes,
                      instruction.contentType?.lowercased() == (uploadSession.uploadContentType ?? contentType(for: uploadSession.fileUrl)).lowercased() else {
                    holdUploadForRecovery(
                        sessionId: sessionId,
                        message: "Upload held because Nest did not return a valid secure-storage destination.",
                        detail: "Retry to recover the idempotent server session. The local source remains at \(uploadSession.fileUrl.path)."
                    )
                    return
                }
                uploadSession.resumableUploadURL = uploadURL
                uploadSession.resumableUploadExpiresAt = instruction.expiresAt
                uploadSession.protocolPhase = "uploading"
                uploadSession.currentChunk = 0
                uploadSession.isAwaitingVerification = false
                uploadSession.requiresFreshUploadSession = false
                statusText = "Ready to upload the original securely."
            case "failed":
                if envelope.failure?.retryable == true {
                    uploadSession.protocolPhase = "finalizing"
                    uploadSession.currentChunk = uploadSession.totalChunks
                    uploadSession.isAwaitingVerification = true
                    activeUploads[sessionId] = uploadSession
                    statusText = "Retrying Quipsly's durable receipt…"
                    saveActiveUploads()
                    return
                }
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held after server verification failed.",
                    detail: envelope.failure?.message ?? envelope.error ?? "The server rejected the durable upload session. The local source remains preserved."
                )
                return
            default:
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held because Nest returned an unknown upload state.",
                    detail: "State \(stage) is not part of the canonical Capture contract. The local source remains preserved."
                )
                return
            }

            activeUploads[sessionId] = uploadSession
            saveActiveUploads()
        } catch {
            scheduleRetry(for: sessionId, reason: "Secure upload session failed: \(error.localizedDescription)", retryAfter: nil)
        }
    }

    private func startCanonicalBackgroundUpload(for sessionId: String) {
        guard var uploadSession = activeUploads[sessionId],
              let rawUploadURL = uploadSession.resumableUploadURL,
              let uploadURL = URL(string: rawUploadURL),
              isAllowedCanonicalUploadURL(uploadURL),
              let expectedSizeBytes = uploadSession.expectedSizeBytes,
              expectedSizeBytes > 0 else {
            if var uploadSession = activeUploads[sessionId] {
                uploadSession.protocolPhase = "creating"
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                uploadNextChunk(for: sessionId)
            }
            return
        }

        if let expiresAt = iso8601Date(uploadSession.resumableUploadExpiresAt),
           expiresAt <= Date().addingTimeInterval(30) {
            uploadSession.protocolPhase = "creating"
            uploadSession.resumableUploadURL = nil
            uploadSession.resumableUploadExpiresAt = nil
            activeUploads[sessionId] = uploadSession
            statusText = "Refreshing the secure upload destination…"
            saveActiveUploads()
            uploadNextChunk(for: sessionId)
            return
        }

        let fileURL = uploadSession.fileUrl
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording could not be located.",
                detail: "Restore \(uploadSession.fileName) before retrying its durable upload."
            )
            return
        }
        guard let currentSize = ((try? FileManager.default.attributesOfItem(atPath: fileURL.path)[.size]) as? NSNumber)?.int64Value,
              currentSize == expectedSizeBytes else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held because the local recording no longer matches its receipt.",
                detail: "Expected \(expectedSizeBytes) bytes before upload. The local source remains preserved for inspection."
            )
            return
        }

        var requestURL = uploadURL
        var localDevelopmentCapability: String?
        #if DEBUG
        if !isAllowedGCSUploadURL(uploadURL),
           var components = URLComponents(url: uploadURL, resolvingAgainstBaseURL: false),
           let token = components.queryItems?.first(where: { $0.name == "token" })?.value,
           !token.isEmpty {
            components.queryItems = nil
            guard let redactedURL = components.url else {
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held because the local development capability could not be protected.",
                    detail: "The local source remains preserved for retry."
                )
                return
            }
            requestURL = redactedURL
            localDevelopmentCapability = token
        }
        #endif

        var request = URLRequest(url: requestURL)
        request.httpMethod = "PUT"
        if let localDevelopmentCapability {
            request.setValue(localDevelopmentCapability, forHTTPHeaderField: "X-Quipsly-Local-Capture-Capability")
        }
        request.setValue(uploadSession.uploadContentType ?? contentType(for: fileURL), forHTTPHeaderField: "Content-Type")
        request.setValue(String(expectedSizeBytes), forHTTPHeaderField: "Content-Length")
        request.setValue("bytes 0-\(expectedSizeBytes - 1)/\(expectedSizeBytes)", forHTTPHeaderField: "Content-Range")
        networkPolicy = Self.readNetworkPolicy()
        request.allowsCellularAccess = networkPolicy.allowsCellular
        request.allowsExpensiveNetworkAccess = networkPolicy.allowsExpensive
        request.allowsConstrainedNetworkAccess = networkPolicy.allowsConstrained

        let task = urlSession.uploadTask(with: request, fromFile: fileURL)
        task.taskDescription = sessionId
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        uploadSession.taskIdentifier = task.taskIdentifier
        uploadSession.nextAttemptAt = nil
        uploadSession.isAwaitingVerification = false
        activeUploads[sessionId] = uploadSession
        activeTaskSessionIds.insert(sessionId)
        uploadProgress = 0
        isUploading = true
        statusText = "Uploading the original directly to secure storage…"
        guard saveActiveUploads() else {
            // URLSession background tasks begin suspended. Never hand the source
            // to the daemon unless its exact task ownership is durably recorded.
            ignoredTaskIdentifiers.insert(task.taskIdentifier)
            task.cancel()
            holdInMemoryForUnavailableLedger(
                sessionId: sessionId,
                detail: "No recording bytes were sent because the protected upload job could not be committed."
            )
            return
        }
        task.resume()
        endPreparationBackgroundTime(for: sessionId)
    }

    @MainActor
    private func finalizeCanonicalUpload(for sessionId: String) async {
        guard !Task.isCancelled, sessionBelongsToActiveOwner(sessionId) else {
            endPreparationBackgroundTime(for: sessionId)
            return
        }
        guard var uploadSession = activeUploads[sessionId] else {
            endPreparationBackgroundTime(for: sessionId)
            return
        }
        guard let expectedSHA256 = normalizedSHA256(uploadSession.expectedSHA256),
              let expectedSizeBytes = uploadSession.expectedSizeBytes,
              let expectedOwnerAccountID = normalizedOwnerID(uploadSession.ownerAccountID) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. The verification receipt is incomplete.",
                detail: "Retry from the protected local source to rebuild its owner, size, and SHA-256 receipt."
            )
            return
        }

        let finalizePath = uploadSession.canonicalFinalizeURL
            ?? "/api/mobile/capture/uploads/resumable/finalize"
        guard let endpoint = absoluteCanonicalURL(from: finalizePath) else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Quipsly's verification address is invalid.",
                detail: "The original remains at \(uploadSession.fileUrl.path)."
            )
            return
        }

        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["uploadSessionId": uploadSession.sessionId])
            statusText = "Verifying size and SHA-256 with Quipsly…"

            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: expectedOwnerAccountID
            )
            guard !Task.isCancelled, sessionBelongsToActiveOwner(sessionId) else { return }
            let envelope = try decodeCanonicalEnvelope(data)
            let stage = envelope.uploadStage?.lowercased()

            if response.statusCode == 202 || stage == "verifying" {
                uploadSession.protocolPhase = "verifying"
                uploadSession.isAwaitingVerification = true
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                scheduleRetry(
                    for: sessionId,
                    reason: "Quipsly is still computing the durable receipt",
                    retryAfter: envelope.retryAfterSeconds ?? retryAfterDelay(from: response)
                )
                return
            }

            if response.statusCode == 409, stage == "uploading" {
                // Recover the idempotent manifest before sending bytes again.
                // This refreshes an expired capability and also detects an
                // object whose background completion callback was missed.
                uploadSession.protocolPhase = "creating"
                uploadSession.currentChunk = 0
                uploadSession.resumableUploadURL = nil
                uploadSession.resumableUploadExpiresAt = nil
                uploadSession.requiresFreshUploadSession = true
                uploadSession.isAwaitingVerification = false
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                scheduleRetry(
                    for: sessionId,
                    reason: envelope.error ?? "Durable storage has not exposed the completed object yet",
                    retryAfter: envelope.retryAfterSeconds ?? retryAfterDelay(from: response)
                )
                return
            }

            guard (200...299).contains(response.statusCode),
                  envelope.ok == true,
                  envelope.canonical == true,
                  stage == "verified" else {
                handleCanonicalAPIError(
                    for: sessionId,
                    response: response,
                    envelope: envelope,
                    operation: "verify the durable recording",
                    retryOnConflict: true
                )
                return
            }

            guard envelope.uploadSessionId?.lowercased() == uploadSession.sessionId.lowercased(),
                  let receipt = envelope.storageVerification,
                  normalizedSHA256(receipt.expectedSha256) == expectedSHA256,
                  normalizedSHA256(receipt.computedSha256) == expectedSHA256,
                  normalizedSHA256(envelope.sha256) == expectedSHA256,
                  receipt.expectedSizeBytes == expectedSizeBytes,
                  receipt.verifiedSizeBytes == expectedSizeBytes,
                  envelope.serverVerification?.status?.lowercased() == "verified",
                  envelope.serverVerification?.sizeBytes == expectedSizeBytes else {
                uploadSession.lastServerVerificationStatus = "receipt_mismatch"
                uploadSession.lastServerVerificationDetail = "Nest did not return matching verified size and SHA-256 evidence."
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held because the durable receipt did not match the local original.",
                    detail: "Quipsly requires matching server-computed size and SHA-256 before completing locally. The original remains at \(uploadSession.fileUrl.path)."
                )
                return
            }

            let captureRecords = envelope.captureRecords ?? envelope.finalization
            let processingDisposition = nonempty(
                captureRecords?.processingDisposition ?? envelope.processingDisposition
            )?.uppercased()
            let processingHoldReason = nonempty(
                captureRecords?.holdReason ?? envelope.processingHold?.reason
            )
            let transcriptDisposition = nonempty(
                captureRecords?.transcriptDisposition ?? envelope.transcriptDisposition
            )?.uppercased()
            uploadSession.protocolPhase = "verified"
            uploadSession.currentChunk = uploadSession.totalChunks
            uploadSession.lastServerVerificationStatus = "verified"
            uploadSession.verifiedCloudSHA256 = expectedSHA256
            uploadSession.verifiedCloudSizeBytes = expectedSizeBytes
            uploadSession.verifiedCloudGeneration = nonempty(receipt.generation)
            uploadSession.verifiedCloudAt = iso8601Date(
                receipt.verifiedAt ?? envelope.serverVerification?.verifiedAt
            )
            uploadSession.lastProcessingDisposition = processingDisposition
            uploadSession.lastProcessingHoldReason = processingHoldReason
            uploadSession.lastTranscriptDisposition = transcriptDisposition
            uploadSession.lastServerVerificationDetail = processingDisposition == "HELD"
                ? "Server verified \(expectedSizeBytes) bytes and SHA-256 \(expectedSHA256). Downstream processing is held for review\(processingHoldReason.map { ": \($0)" } ?? ".")"
                : "Server verified \(expectedSizeBytes) bytes and SHA-256 \(expectedSHA256)."
            uploadSession.lastSourceId = captureRecords?.sourceId
            uploadSession.lastMediaAssetId = captureRecords?.mediaAssetId
            uploadSession.lastRecordingAssetId = captureRecords?.recordingAssetId
                ?? envelope.serverVerification?.recordingAssetId
            uploadSession.lastTranscriptJobId = captureRecords?.transcriptJobId
                ?? envelope.serverVerification?.transcriptJobId
            uploadSession.lastTranscriptJobStatus = captureRecords?.transcriptJobStatus
            uploadSession.canonicalObjectPath = envelope.objectPath
                ?? envelope.objectName
                ?? envelope.storageUri
                ?? envelope.gcsUri
                ?? uploadSession.canonicalObjectPath
            uploadSession.lastLocalRetentionReason = canonicalRetentionReason(envelope)
                ?? "Local recording preserved until an explicit verified-retention policy allows cleanup."
            uploadSession.retryCount = 0
            uploadSession.nextAttemptAt = nil
            uploadSession.isHeld = false
            uploadSession.isAwaitingVerification = false
            activeUploads[sessionId] = uploadSession
            saveActiveUploads()
            finalizeUpload(for: sessionId)
        } catch {
            scheduleRetry(for: sessionId, reason: "Durable verification failed: \(error.localizedDescription)", retryAfter: nil)
        }
    }

    private func handleCanonicalTaskCompletion(
        sessionId: String,
        task: URLSessionTask,
        payloadData: Data?,
        error: Error?
    ) {
        guard var uploadSession = activeUploads[sessionId] else { return }
        uploadSession.taskIdentifier = nil
        activeTaskSessionIds.remove(sessionId)
        activeUploads[sessionId] = uploadSession

        let response = task.response as? HTTPURLResponse
        let statusCode = response?.statusCode
        let retryAfter = response.flatMap(retryAfterDelay(from:))
        let responseMessage = payloadData.flatMap { data -> String? in
            guard !data.isEmpty else { return nil }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (json["error"] as? [String: Any])?["message"] as? String
                    ?? json["error"] as? String
                    ?? json["message"] as? String
            }
            return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if let error {
            prepareFreshCanonicalTransfer(
                for: sessionId,
                reason: responseMessage ?? error.localizedDescription,
                retryAfter: retryAfter
            )
            return
        }

        guard let statusCode, (200...299).contains(statusCode) else {
            let message = responseMessage ?? "Secure storage returned HTTP \(statusCode ?? -1)"
            if statusCode == 401 || statusCode == 403 || statusCode == 404 || statusCode == 410 {
                // The daemon may have completed the object before the app saw
                // the callback. Check finalize first; a 409 safely returns this
                // session to upload/recovery without deleting the source.
                uploadSession.protocolPhase = "finalizing"
                uploadSession.currentChunk = uploadSession.totalChunks
                uploadSession.isAwaitingVerification = true
                activeUploads[sessionId] = uploadSession
                saveActiveUploads()
                scheduleRetry(for: sessionId, reason: message, retryAfter: retryAfter)
            } else if statusCode == 408 || statusCode == 429 || (statusCode ?? 0) >= 500 || statusCode == 308 {
                prepareFreshCanonicalTransfer(for: sessionId, reason: message, retryAfter: retryAfter)
            } else {
                holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held. Secure storage did not accept the recording.",
                    detail: "Secure storage returned HTTP \(statusCode ?? -1): \(message). The original remains at \(uploadSession.fileUrl.path)."
                )
            }
            return
        }

        uploadSession.protocolPhase = "finalizing"
        uploadSession.resumableUploadURL = nil
        uploadSession.resumableUploadExpiresAt = nil
        uploadSession.requiresFreshUploadSession = false
        uploadSession.currentChunk = uploadSession.totalChunks
        uploadSession.retryCount = 0
        uploadSession.nextAttemptAt = nil
        uploadSession.isHeld = false
        uploadSession.isAwaitingVerification = true
        activeUploads[sessionId] = uploadSession
        uploadProgress = 1
        statusText = "Upload received. Quipsly is verifying the durable receipt…"
        saveActiveUploads()
        uploadNextChunk(for: sessionId)
    }

    /// A background file task cannot safely restart a partially-consumed
    /// destination from byte zero. Recover through Nest so it can return
    /// completed object evidence or atomically rotate to a fresh capability.
    private func prepareFreshCanonicalTransfer(
        for sessionId: String,
        reason: String,
        retryAfter: TimeInterval?
    ) {
        guard var uploadSession = activeUploads[sessionId] else { return }
        uploadSession.protocolPhase = "creating"
        uploadSession.currentChunk = 0
        uploadSession.resumableUploadURL = nil
        uploadSession.resumableUploadExpiresAt = nil
        uploadSession.requiresFreshUploadSession = true
        uploadSession.isAwaitingVerification = false
        activeUploads[sessionId] = uploadSession
        saveActiveUploads()
        scheduleRetry(for: sessionId, reason: reason, retryAfter: retryAfter)
    }

    private func handleCanonicalAPIError(
        for sessionId: String,
        response: HTTPURLResponse,
        envelope: CanonicalUploadEnvelope,
        operation: String,
        retryOnConflict: Bool
    ) {
        guard let uploadSession = activeUploads[sessionId] else { return }
        let message = envelope.failure?.message
            ?? envelope.error
            ?? envelope.message
            ?? "Server returned HTTP \(response.statusCode)"
        let retryable = envelope.failure?.retryable == true
            || response.statusCode == 408
            || response.statusCode == 429
            || response.statusCode >= 500
            || (retryOnConflict && response.statusCode == 409)

        if retryable {
            scheduleRetry(
                for: sessionId,
                reason: "Could not \(operation): \(message)",
                retryAfter: envelope.retryAfterSeconds ?? retryAfterDelay(from: response)
            )
        } else {
            let guidance = response.statusCode == 401 || response.statusCode == 403
                ? "Sign in again and confirm project access before retrying."
                : "Correct the session, consent, or project binding before retrying."
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held. Local recording preserved for recovery.",
                detail: "Could not \(operation) (HTTP \(response.statusCode)): \(message). \(guidance) Local source: \(uploadSession.fileUrl.path)."
            )
        }
    }

    private func decodeCanonicalEnvelope(_ data: Data) throws -> CanonicalUploadEnvelope {
        guard !data.isEmpty else { throw URLError(.cannotParseResponse) }
        return try JSONDecoder().decode(CanonicalUploadEnvelope.self, from: data)
    }

    private func normalizedSHA256(_ value: String?) -> String? {
        guard let value else { return nil }
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard normalized.count == 64,
              normalized.unicodeScalars.allSatisfy({
                  (48...57).contains($0.value) || (97...102).contains($0.value)
              }) else { return nil }
        return normalized
    }

    private func nonempty(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else { return nil }
        return normalized
    }

    private func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }

    private func sessionBelongsToActiveOwner(_ sessionId: String) -> Bool {
        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID),
              let sessionOwnerAccountID = normalizedOwnerID(activeUploads[sessionId]?.ownerAccountID) else {
            return false
        }
        return activeOwnerAccountID == sessionOwnerAccountID
    }

    private func absoluteCanonicalURL(from value: String) -> URL? {
        guard let origin = URL(string: studioApiBaseUrl)?.deletingLastPathComponent() else { return nil }
        let candidate: URL?
        if let absolute = URL(string: value), absolute.scheme != nil {
            candidate = absolute
        } else {
            candidate = URL(string: value, relativeTo: origin)?.absoluteURL
        }
        guard let candidate,
              candidate.scheme?.lowercased() == origin.scheme?.lowercased(),
              candidate.host?.lowercased() == origin.host?.lowercased(),
              candidate.port == origin.port else { return nil }
        return candidate
    }

    private func isAllowedGCSUploadURL(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              url.user == nil,
              url.password == nil,
              url.fragment == nil,
              let host = url.host?.lowercased() else { return false }
        return host == "storage.googleapis.com" || host.hasSuffix(".storage.googleapis.com")
    }

    private func isAllowedCanonicalUploadURL(_ url: URL) -> Bool {
        if isAllowedGCSUploadURL(url) { return true }
        return isAllowedLocalDevelopmentUploadURL(url)
    }

    private func isAllowedLocalDevelopmentUploadURL(_ url: URL) -> Bool {
        #if DEBUG
        guard let configuredAPIURL = URL(string: studioApiBaseUrl),
              configuredAPIURL.scheme?.lowercased() == "http",
              let configuredHost = configuredAPIURL.host?.lowercased(),
              ["localhost", "127.0.0.1", "::1"].contains(configuredHost),
              url.scheme?.lowercased() == configuredAPIURL.scheme?.lowercased(),
              url.host?.lowercased() == configuredHost,
              url.port == configuredAPIURL.port,
              url.user == nil,
              url.password == nil,
              url.fragment == nil,
              url.path.hasPrefix("/api/mobile/capture/uploads/local/"),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems,
              queryItems.count == 1,
              queryItems[0].name == "token",
              let token = queryItems[0].value,
              !token.isEmpty else { return false }

        let uploadSessionID = String(url.path.dropFirst("/api/mobile/capture/uploads/local/".count))
        return UUID(uuidString: uploadSessionID) != nil
        #else
        return false
        #endif
    }

    private func iso8601Date(_ value: String?) -> Date? {
        guard let value = nonempty(value) else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    private func canonicalRetentionReason(_ envelope: CanonicalUploadEnvelope) -> String? {
        nonempty(envelope.localRetention?.reason)
            ?? nonempty(envelope.localRetention?.message)
            ?? nonempty(envelope.localRetention?.detail)
    }

    private func finalizeUpload(for sessionId: String) {
        guard Thread.isMainThread else {
            DispatchQueue.main.async { [weak self] in
                self?.finalizeUpload(for: sessionId)
            }
            return
        }
        guard sessionBelongsToActiveOwner(sessionId),
              var session = activeUploads[sessionId] else { return }
        endPreparationBackgroundTime(for: sessionId)
        uploadProgress = 1.0
        lastTranscriptJobId = session.lastTranscriptJobId
        lastTranscriptJobStatus = session.lastTranscriptJobStatus
        lastServerVerificationStatus = session.lastServerVerificationStatus
        lastServerVerificationDetail = session.lastServerVerificationDetail
        lastProcessingDisposition = session.lastProcessingDisposition
        lastProcessingHoldReason = session.lastProcessingHoldReason
        lastTranscriptDisposition = session.lastTranscriptDisposition
        lastLocalRetentionReason = session.lastLocalRetentionReason

        let normalizedVerificationStatus = session.lastServerVerificationStatus?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let verificationStatus = normalizedVerificationStatus.flatMap { status in
            status.isEmpty ? nil : status
        }

        guard verificationStatus == "verified" else {
            let visibleStatus = verificationStatus ?? "awaiting verification"
            let detail = session.lastServerVerificationDetail
                ?? "The server received every chunk but did not return verified durable storage."

            session.lastServerVerificationStatus = verificationStatus ?? "awaiting_verification"
            session.lastServerVerificationDetail = detail
            session.lastLocalRetentionReason = session.lastLocalRetentionReason
                ?? "Local recording preserved until durable server storage is verified."
            session.taskIdentifier = nil
            session.nextAttemptAt = nil
            session.isHeld = true
            session.isAwaitingVerification = true
            activeUploads[sessionId] = session

            lastUploadedSourceId = nil
            lastServerVerificationStatus = session.lastServerVerificationStatus
            lastServerVerificationDetail = detail
            lastLocalRetentionReason = session.lastLocalRetentionReason
            lastRecoveryDetail = detail
            statusText = "Upload \(visibleStatus). Local recording preserved; Quipsly has not marked it verified."
            saveActiveUploads()
            refreshUploadActivity()

            uploadCompletions.removeValue(forKey: sessionId)?(false, nil, detail)
            NotificationCenter.default.post(
                name: Notification.Name("BackgroundUploadFinished"),
                object: nil,
                userInfo: [
                    "success": false,
                    "ownerAccountID": session.ownerAccountID ?? "",
                    "localRecordingID": session.localRecordingID?.uuidString ?? "",
                    "awaitingVerification": true,
                    "error": "Upload is awaiting server verification. Local recording preserved at \(session.fileUrl.path)",
                ]
            )
            return
        }

        lastUploadedSourceId = session.lastMediaAssetId ?? session.lastSourceId
        lastRecoveryDetail = nil
        if session.lastProcessingDisposition?.uppercased() == "HELD" {
            statusText = "Cloud bytes verified. Editor attachment and transcript processing are held for review. Local original preserved."
        } else if session.lastTranscriptDisposition?.uppercased() == "HELD"
                    || session.lastTranscriptJobStatus?.uppercased() == "HELD" {
            statusText = "Upload verified. Transcript held until consent is confirmed. Local original preserved."
        } else if let transcriptJobId = session.lastTranscriptJobId {
            statusText = "Upload verified. Transcript queued: \(transcriptJobId). Local original preserved."
        } else {
            statusText = "Upload verified. Local original preserved until retention policy allows cleanup."
        }

        var completionEvidence: [String: Any] = [
            "success": true,
            "ownerAccountID": session.ownerAccountID ?? "",
            "localRecordingID": session.localRecordingID?.uuidString ?? "",
            "sourceId": session.lastSourceId ?? "",
            "mediaAssetId": session.lastMediaAssetId ?? "",
            "recordingAssetId": session.lastRecordingAssetId ?? session.recordingAssetId ?? "",
            "transcriptJobId": session.lastTranscriptJobId ?? "",
            "serverVerificationStatus": session.lastServerVerificationStatus ?? "",
            "serverVerificationDetail": session.lastServerVerificationDetail ?? "",
            "processingDisposition": session.lastProcessingDisposition ?? "",
            "processingHoldReason": session.lastProcessingHoldReason ?? "",
            "transcriptDisposition": session.lastTranscriptDisposition ?? "",
            "sourceSHA256": session.expectedSHA256 ?? "",
            "verifiedCloudSHA256": session.verifiedCloudSHA256 ?? "",
            "verifiedCloudGeneration": session.verifiedCloudGeneration ?? "",
            "canonicalObjectPath": session.canonicalObjectPath ?? "",
        ]
        if let verifiedCloudSizeBytes = session.verifiedCloudSizeBytes {
            completionEvidence["verifiedCloudSizeBytes"] = NSNumber(value: verifiedCloudSizeBytes)
        }
        if let verifiedCloudAt = session.verifiedCloudAt {
            completionEvidence["verifiedCloudAt"] = verifiedCloudAt
        }

        // Commit verified cloud evidence into the permanent source ledger before
        // retiring the resumable job. A process death at any later boundary can
        // replay the verified job idempotently, but can never erase the only
        // durable hash/size/generation receipt.
        do {
            try MainActor.assumeIsolated {
                try persistVerifiedSourceEvidence(session)
                if let localRecordingID = session.localRecordingID,
                   let recording = LocalRecordingLibrary.shared.recording(
                    id: localRecordingID
                   ) {
                    OnDeviceTranscriptManager.shared.verifiedUploadDidFinish(
                        recording: recording
                    )
                }
            }
        } catch {
            session.isHeld = true
            session.isAwaitingVerification = false
            session.nextAttemptAt = nil
            session.taskIdentifier = nil
            session.lastLocalRetentionReason =
                "Cloud bytes are verified, but the permanent source evidence ledger still needs a durable commit."
            activeUploads[sessionId] = session
            lastLocalRetentionReason = session.lastLocalRetentionReason
            lastRecoveryDetail = error.localizedDescription
            statusText = "Cloud verified. Local source and upload receipt preserved until evidence can be committed."
            _ = saveActiveUploads()
            refreshUploadActivity()
            uploadCompletions.removeValue(forKey: sessionId)?(
                false,
                nil,
                error.localizedDescription
            )
            NotificationCenter.default.post(
                name: Notification.Name("BackgroundUploadFinished"),
                object: nil,
                userInfo: [
                    "success": false,
                    "ownerAccountID": session.ownerAccountID ?? "",
                    "localRecordingID": session.localRecordingID?.uuidString ?? "",
                    "error": "Cloud verification succeeded, but protected source evidence could not be committed. The local original and resumable receipt remain preserved.",
                ]
            )
            return
        }

        // Even verified uploads retain their local source. Only the pending upload
        // ledger entry is cleared; a separate explicit retention policy may prune later.
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        activeUploads.removeValue(forKey: sessionId)
        guard saveActiveUploads() else {
            activeUploads[sessionId] = session
            statusText = "Upload verified and source evidence saved. Protected job cleanup will retry."
            lastRecoveryDetail = "The verified resumable job could not yet be retired from protected storage."
            refreshUploadActivity()
            return
        }
        UploadLedgerStore.deleteCapability(for: sessionId)
        refreshUploadActivity()

        uploadCompletions.removeValue(forKey: sessionId)?(true, session.lastSourceId, nil)
        NotificationCenter.default.post(
            name: Notification.Name("BackgroundUploadFinished"),
            object: nil,
            userInfo: completionEvidence
        )
    }

    @MainActor
    private func persistVerifiedSourceEvidence(_ session: UploadSession) throws {
        guard let localRecordingID = session.localRecordingID else {
            if session.protocolKind == canonicalProtocolKind {
                throw NSError(
                    domain: "QuipslyCaptureSourceEvidence",
                    code: 1,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The verified upload has no durable local source identity. Its resumable receipt was preserved for recovery."
                    ]
                )
            }
            return
        }
        try LocalRecordingLibrary.shared.markUploadFinished(
            localRecordingID,
            sourceId: session.lastSourceId,
            mediaAssetId: session.lastMediaAssetId,
            recordingAssetId: session.lastRecordingAssetId ?? session.recordingAssetId,
            transcriptJobId: session.lastTranscriptJobId,
            serverVerificationStatus: session.lastServerVerificationStatus,
            sourceSHA256: session.expectedSHA256,
            verifiedCloudSHA256: session.verifiedCloudSHA256,
            verifiedCloudSizeBytes: session.verifiedCloudSizeBytes,
            verifiedCloudGeneration: session.verifiedCloudGeneration,
            verifiedCloudAt: session.verifiedCloudAt,
            canonicalObjectPath: session.canonicalObjectPath,
            processingDisposition: session.lastProcessingDisposition,
            processingHoldReason: session.lastProcessingHoldReason,
            transcriptDisposition: session.lastTranscriptDisposition,
            detail: session.lastServerVerificationDetail
        )
    }

    private func holdUploadForRecovery(sessionId: String, message: String, detail: String) {
        guard var uploadSession = activeUploads[sessionId] else { return }
        endPreparationBackgroundTime(for: sessionId)
        let sourcePath = uploadSession.fileUrl.path
        let recoveryDetail = detail.isEmpty
            ? "Local recording preserved at \(sourcePath). Retry upload when auth, storage, and network are ready."
            : detail

        uploadSession.lastServerVerificationStatus = "held"
        uploadSession.lastServerVerificationDetail = recoveryDetail
        uploadSession.lastLocalRetentionReason = "Local recording preserved for recovery."
        uploadSession.taskIdentifier = nil
        uploadSession.nextAttemptAt = nil
        uploadSession.isHeld = true
        uploadSession.isAwaitingVerification = false
        if uploadSession.protocolKind == canonicalProtocolKind {
            uploadSession.protocolPhase = "held"
        }
        activeUploads[sessionId] = uploadSession
        activeTaskSessionIds.remove(sessionId)
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()

        guard sessionBelongsToActiveOwner(sessionId) else {
            saveActiveUploads()
            refreshUploadActivity()
            return
        }

        statusText = message
        lastUploadedSourceId = nil
        lastRecoveryDetail = recoveryDetail
        lastServerVerificationStatus = "held"
        lastServerVerificationDetail = recoveryDetail
        lastLocalRetentionReason = "Local recording preserved for recovery."
        saveActiveUploads()
        refreshUploadActivity()
        uploadCompletions.removeValue(forKey: sessionId)?(false, nil, recoveryDetail)
        NotificationCenter.default.post(
            name: Notification.Name("BackgroundUploadFinished"),
            object: nil,
            userInfo: [
                "success": false,
                "ownerAccountID": uploadSession.ownerAccountID ?? "",
                "localRecordingID": uploadSession.localRecordingID?.uuidString ?? "",
                "error": "Upload held for recovery. Local recording preserved at \(sourcePath)"
            ]
        )
    }

    /// Applies a fail-closed in-memory hold after protected persistence fails.
    /// Deliberately does not attempt another write: the caller already proved
    /// storage unavailable, and no background transfer may start in that state.
    private func holdInMemoryForUnavailableLedger(sessionId: String, detail: String) {
        guard var uploadSession = activeUploads[sessionId] else { return }
        endPreparationBackgroundTime(for: sessionId)
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        canonicalControlTasks.removeValue(forKey: sessionId)?.cancel()
        activeTaskSessionIds.remove(sessionId)
        uploadSession.taskIdentifier = nil
        uploadSession.nextAttemptAt = nil
        uploadSession.isHeld = true
        uploadSession.isAwaitingVerification = false
        if uploadSession.protocolKind == canonicalProtocolKind {
            uploadSession.protocolPhase = "held"
        }
        uploadSession.lastServerVerificationStatus = "held"
        uploadSession.lastServerVerificationDetail = detail
        uploadSession.lastLocalRetentionReason = "Local recording preserved because the protected upload ledger is unavailable."
        activeUploads[sessionId] = uploadSession
        statusText = "Upload held until the protected job ledger can be saved."
        lastRecoveryDetail = "\(detail) The local source remains preserved."
        lastServerVerificationStatus = "held"
        lastServerVerificationDetail = detail
        lastLocalRetentionReason = uploadSession.lastLocalRetentionReason
        refreshUploadActivity()
    }

    // MARK: - URLSessionDataDelegate
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        let taskId = dataTask.taskIdentifier
        if responseData[taskId] == nil {
            responseData[taskId] = Data()
        }
        responseData[taskId]?.append(data)
    }

    // MARK: - URLSessionTaskDelegate
    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64, totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard let sessionId = task.taskDescription,
              sessionBelongsToActiveOwner(sessionId),
              let uploadSession = activeUploads[sessionId] else { return }

        // Calculate global progress across all chunks.
        let chunkProgress: Double
        if totalBytesExpectedToSend > 0 {
            chunkProgress = min(max(Double(totalBytesSent) / Double(totalBytesExpectedToSend), 0), 1)
        } else {
            chunkProgress = 0
        }
        let chunkCount = max(uploadSession.totalChunks, 1)
        let globalProgress = min(
            max((Double(uploadSession.currentChunk) + chunkProgress) / Double(chunkCount), 0),
            1
        )

        uploadProgress = globalProgress
        isUploading = true

        NotificationCenter.default.post(
            name: Notification.Name("BackgroundUploadProgress"),
            object: nil,
            userInfo: [
                "progress": uploadProgress,
                "ownerAccountID": uploadSession.ownerAccountID ?? "",
                "localRecordingID": uploadSession.localRecordingID?.uuidString ?? "",
            ]
        )
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let taskId = task.taskIdentifier
        let payloadData = responseData[taskId]
        responseData.removeValue(forKey: taskId)

        let sessionId = task.originalRequest?.value(forHTTPHeaderField: "X-Session-ID") ?? task.taskDescription ?? ""
        let chunkIndexStr = task.originalRequest?.value(forHTTPHeaderField: "X-Chunk-Index") ?? ""
        let chunkIndex = Int(chunkIndexStr) ?? 0

        guard !sessionId.isEmpty else { return }

        if ignoredTaskIdentifiers.remove(taskId) != nil {
            return
        }
        guard sessionBelongsToActiveOwner(sessionId),
              var uploadSession = activeUploads[sessionId] else { return }

            if uploadSession.taskIdentifier == nil,
               (retryWorkItems[sessionId] != nil || uploadSession.isHeld == true) {
                return
            }

            // A recovered background session can contain legacy duplicate tasks.
            // Only the task currently associated with this upload may advance it.
            if let associatedTaskIdentifier = uploadSession.taskIdentifier,
               associatedTaskIdentifier != taskId {
                return
            }

            if uploadSession.protocolKind == canonicalProtocolKind {
                handleCanonicalTaskCompletion(
                    sessionId: sessionId,
                    task: task,
                    payloadData: payloadData,
                    error: error
                )
                return
            }

            let tempFileUrl = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(sessionId)_chunk_\(chunkIndex).tmp")
            try? FileManager.default.removeItem(at: tempFileUrl)
            uploadSession.taskIdentifier = nil
            self.activeTaskSessionIds.remove(sessionId)
            self.activeUploads[sessionId] = uploadSession

            var chunkResponse: [String: AnyObject]? = nil
            if let payloadData, !payloadData.isEmpty {
                if let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: AnyObject] {
                    chunkResponse = json
                }
            }

            var actualError = error
            var statusCode: Int?
            var retryAfter: TimeInterval?

            if let httpResponse = task.response as? HTTPURLResponse {
                statusCode = httpResponse.statusCode
                retryAfter = self.retryAfterDelay(from: httpResponse)
                if !(200...299).contains(httpResponse.statusCode) {
                    if actualError == nil {
                        actualError = NSError(
                            domain: "HTTPError",
                            code: httpResponse.statusCode,
                            userInfo: [NSLocalizedDescriptionKey: "Server returned HTTP \(httpResponse.statusCode)"]
                        )
                    }
                }
            }

            if let err = actualError {
                let responseMessage = (chunkResponse?["error"] as? String)
                    ?? (chunkResponse?["message"] as? String)
                    ?? err.localizedDescription
                let isAuthenticationError = statusCode == 401
                    || statusCode == 403
                    || (err as? URLError)?.code == .userAuthenticationRequired
                    || (err as? URLError)?.code == .userCancelledAuthentication

                if let statusCode, (400...499).contains(statusCode) {
                    let guidance = isAuthenticationError
                        ? "Sign in again before retrying."
                        : "Correct the request or session state before retrying."
                    print("Chunk upload failed with non-retryable HTTP \(statusCode). Holding local source for recovery.")
                    self.holdUploadForRecovery(
                        sessionId: sessionId,
                        message: "Upload held. Local recording preserved for recovery.",
                        detail: "Upload stopped at HTTP \(statusCode): \(responseMessage). \(guidance) Local recording preserved at \(uploadSession.fileUrl.path)."
                    )
                } else if isAuthenticationError {
                    self.holdUploadForRecovery(
                        sessionId: sessionId,
                        message: "Upload held until authentication is restored.",
                        detail: "Authentication failed: \(responseMessage). Sign in again before retrying. Local recording preserved at \(uploadSession.fileUrl.path)."
                    )
                } else {
                    self.scheduleRetry(
                        for: sessionId,
                        reason: responseMessage,
                        retryAfter: retryAfter
                    )
                }
                return
            }

            guard let chunkResponse else {
                self.scheduleRetry(
                    for: sessionId,
                    reason: "Server response could not be read",
                    retryAfter: retryAfter
                )
                return
            }

            if (chunkResponse["ok"] as? Bool) == false || (chunkResponse["success"] as? Bool) == false {
                let responseMessage = (chunkResponse["error"] as? String)
                    ?? (chunkResponse["message"] as? String)
                    ?? "Server did not accept the chunk"
                self.holdUploadForRecovery(
                    sessionId: sessionId,
                    message: "Upload held. Server did not accept the recording.",
                    detail: "\(responseMessage). Local recording preserved at \(uploadSession.fileUrl.path)."
                )
                return
            }

            if let serverVerification = chunkResponse["serverVerification"] as? [String: AnyObject] {
                if let status = serverVerification["status"] as? String {
                    uploadSession.lastServerVerificationStatus = status
                    self.lastServerVerificationStatus = status
                }
                let reason = (serverVerification["reason"] as? String)
                    ?? (serverVerification["detail"] as? String)
                if let reason, !reason.isEmpty {
                    uploadSession.lastServerVerificationDetail = reason
                    self.lastServerVerificationDetail = reason
                }
                if let recordingAssetId = serverVerification["recordingAssetId"] as? String {
                    uploadSession.lastRecordingAssetId = recordingAssetId
                }
                if let transcriptJobId = serverVerification["transcriptJobId"] as? String {
                    uploadSession.lastTranscriptJobId = transcriptJobId
                }
            }

            if let localRetention = chunkResponse["localRetention"] as? [String: AnyObject] {
                let reason = (localRetention["reason"] as? String)
                    ?? (localRetention["message"] as? String)
                    ?? (localRetention["detail"] as? String)
                if let reason, !reason.isEmpty {
                    uploadSession.lastLocalRetentionReason = reason
                    self.lastLocalRetentionReason = reason
                }
            }

            if let mediaAssetId = chunkResponse["mediaAssetId"] as? String {
                uploadSession.lastMediaAssetId = mediaAssetId
                uploadSession.lastSourceId = (chunkResponse["sourceId"] as? String) ?? uploadSession.lastSourceId
                if let captureRecords = chunkResponse["captureRecords"] as? [String: AnyObject],
                   let transcriptJobId = captureRecords["transcriptJobId"] as? String {
                    uploadSession.lastTranscriptJobId = transcriptJobId
                    if let transcriptJobStatus = captureRecords["transcriptJobStatus"] as? String {
                        uploadSession.lastTranscriptJobStatus = transcriptJobStatus
                    }
                }
            }

            // Chunk succeeded! Move to the next one.
            uploadSession.currentChunk = max(uploadSession.currentChunk, chunkIndex + 1)
            uploadSession.retryCount = 0
            uploadSession.nextAttemptAt = nil
            uploadSession.taskIdentifier = nil
            uploadSession.isHeld = false
            uploadSession.isAwaitingVerification = false
            self.activeUploads[sessionId] = uploadSession
            self.saveActiveUploads()
            if uploadSession.currentChunk < uploadSession.totalChunks {
                self.statusText = "Uploading chunk \(uploadSession.currentChunk + 1) of \(uploadSession.totalChunks)..."
            }
            self.uploadNextChunk(for: sessionId)
    }

    private func scheduleRetry(for sessionId: String, reason: String, retryAfter: TimeInterval?) {
        guard sessionBelongsToActiveOwner(sessionId),
              var uploadSession = activeUploads[sessionId] else { return }
        endPreparationBackgroundTime(for: sessionId)

        let nextRetryCount = (uploadSession.retryCount ?? 0) + 1
        guard nextRetryCount <= maximumRetryCount else {
            holdUploadForRecovery(
                sessionId: sessionId,
                message: "Upload held after \(maximumRetryCount) retry attempts.",
                detail: "Automatic retries were exhausted after: \(reason). Local recording preserved at \(uploadSession.fileUrl.path). Tap retry after network and server health are restored."
            )
            return
        }

        let jitter = Self.deterministicRetryJitterMultiplier(
            sessionId: sessionId,
            retryCount: nextRetryCount
        )
        let exponentialDelay = min(
            baseRetryDelay * pow(2, Double(max(nextRetryCount - 1, 0))) * jitter,
            maximumRetryDelay
        )
        let delay: TimeInterval
        if let retryAfter {
            delay = min(max(retryAfter, 1), maximumRetryAfterDelay)
        } else {
            delay = exponentialDelay
        }
        let nextAttemptAt = Date().addingTimeInterval(delay)

        uploadSession.retryCount = nextRetryCount
        uploadSession.nextAttemptAt = nextAttemptAt
        uploadSession.taskIdentifier = nil
        uploadSession.isHeld = false
        uploadSession.isAwaitingVerification = false
        activeUploads[sessionId] = uploadSession
        activeTaskSessionIds.remove(sessionId)
        statusText = "Upload interrupted. Retry \(nextRetryCount) of \(maximumRetryCount) in \(Int(ceil(delay)))s."
        lastRecoveryDetail = "\(reason). The original remains at \(uploadSession.fileUrl.path)."
        guard saveActiveUploads() else {
            holdInMemoryForUnavailableLedger(
                sessionId: sessionId,
                detail: "Automatic retry was not scheduled because its protected job state could not be committed."
            )
            return
        }
        scheduleRetryWakeup(for: sessionId, at: nextAttemptAt)
        refreshUploadActivity()
    }

    private func scheduleRetryWakeup(for sessionId: String, at date: Date) {
        retryWorkItems.removeValue(forKey: sessionId)?.cancel()

        let delay = max(date.timeIntervalSinceNow, 0)
        let workItem = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.retryWorkItems.removeValue(forKey: sessionId)
            guard var uploadSession = self.activeUploads[sessionId],
                  self.sessionBelongsToActiveOwner(sessionId),
                  uploadSession.taskIdentifier == nil,
                  uploadSession.isHeld != true else {
                self.refreshUploadActivity()
                return
            }
            uploadSession.nextAttemptAt = nil
            self.activeUploads[sessionId] = uploadSession
            guard self.saveActiveUploads() else {
                self.holdInMemoryForUnavailableLedger(
                    sessionId: sessionId,
                    detail: "Retry stayed paused because its protected job state could not be committed."
                )
                return
            }
            self.uploadNextChunk(for: sessionId)
        }
        retryWorkItems[sessionId] = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func retryAfterDelay(from response: HTTPURLResponse) -> TimeInterval? {
        guard let rawValue = response.value(forHTTPHeaderField: "Retry-After")?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !rawValue.isEmpty else {
            return nil
        }

        if let seconds = TimeInterval(rawValue) {
            return min(max(seconds, 0), maximumRetryAfterDelay)
        }

        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        for format in [
            "EEE',' dd MMM yyyy HH':'mm':'ss z",
            "EEEE',' dd-MMM-yy HH':'mm':'ss z",
            "EEE MMM d HH':'mm':'ss yyyy",
        ] {
            formatter.dateFormat = format
            if let date = formatter.date(from: rawValue) {
                return min(max(date.timeIntervalSinceNow, 0), maximumRetryAfterDelay)
            }
        }
        return nil
    }

    // MARK: - URLSessionDelegate
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate {
                appDelegate.uploadManagerDidFinishBackgroundSessionEvents()
            }
        }
    }

    @discardableResult
    private func saveActiveUploads() -> Bool {
        var persisted = false
        do {
            var nonSecretLedger = activeUploads
            var capabilitiesToSave: [(sessionId: String, value: String)] = []
            var capabilitiesToDelete: [String] = []
            for sessionId in Array(nonSecretLedger.keys) {
                guard var uploadSession = nonSecretLedger[sessionId] else { continue }
                if let capability = nonempty(uploadSession.resumableUploadURL) {
                    capabilitiesToSave.append((sessionId, capability))
                } else if uploadSession.protocolKind == canonicalProtocolKind {
                    capabilitiesToDelete.append(sessionId)
                }
                // Capability URLs are bearer secrets. Only the Keychain copy is
                // durable; the atomic ledger stores the recoverable job state.
                uploadSession.resumableUploadURL = nil
                nonSecretLedger[sessionId] = uploadSession
            }
            let data = try JSONEncoder().encode(nonSecretLedger)
            // Commit phase/restart truth before rotating the separate secret.
            // Every crash point then recovers conservatively: a missing new
            // capability is re-fetched, while a stale old capability is ignored
            // by the already-durable creating/restart-needed phase.
            try UploadLedgerStore.saveLedger(data)
            for capability in capabilitiesToSave {
                try UploadLedgerStore.saveCapability(capability.value, for: capability.sessionId)
            }
            for sessionId in capabilitiesToDelete {
                UploadLedgerStore.deleteCapability(for: sessionId)
            }
            durableLedgerAvailable = true
            shouldReloadDurableLedger = false
            // Remove the pre-v2 preferences ledger only after protected storage
            // has committed successfully. This is a one-way safe migration.
            UserDefaults.standard.removeObject(forKey: Self.activeUploadsUserDefaultsKey)
            persisted = true
        } catch {
            durableLedgerAvailable = false
            lastRecoveryDetail = "Could not update the protected upload ledger: \(error.localizedDescription). The local recording remains preserved."
        }
        refreshRecoverableUploadCount()
        return persisted
    }

    private func loadActiveUploads() {
        let legacyData = UserDefaults.standard.data(forKey: Self.activeUploadsUserDefaultsKey)
        let ledgerData: Data?
        var needsMigration = false
        switch UploadLedgerStore.loadLedger() {
        case .data(let data):
            ledgerData = data
        case .missing:
            ledgerData = legacyData
            needsMigration = legacyData != nil
        case .unavailable(let error):
            durableLedgerAvailable = false
            shouldReloadDurableLedger = true
            lastRecoveryDetail = "The protected upload ledger is temporarily unavailable: \(error.localizedDescription). Background tasks will be quarantined, not canceled."
            refreshRecoverableUploadCount()
            return
        }

        guard let ledgerData else {
            activeUploads = [:]
            durableLedgerAvailable = true
            shouldReloadDurableLedger = false
            refreshRecoverableUploadCount()
            return
        }

        do {
            var saved = try JSONDecoder().decode([String: UploadSession].self, from: ledgerData)
            for sessionId in Array(saved.keys) {
                guard var uploadSession = saved[sessionId] else { continue }
                let legacyCapability = nonempty(uploadSession.resumableUploadURL)
                let protectedCapability = UploadLedgerStore.loadCapability(for: sessionId)
                uploadSession.resumableUploadURL = protectedCapability ?? legacyCapability
                if protectedCapability == nil, legacyCapability != nil {
                    needsMigration = true
                }
                saved[sessionId] = uploadSession
            }
            activeUploads = saved
            durableLedgerAvailable = true
            shouldReloadDurableLedger = false
            if needsMigration {
                saveActiveUploads()
            }
        } catch {
            durableLedgerAvailable = false
            shouldReloadDurableLedger = true
            lastRecoveryDetail = "The protected upload ledger could not be decoded: \(error.localizedDescription). Background tasks will be quarantined, not canceled."
            refreshRecoverableUploadCount()
            return
        }
        refreshRecoverableUploadCount()
        let visibleCount = activeUploads.keys.filter(sessionBelongsToActiveOwner).count
        if visibleCount > 0 {
            statusText = "Recovered \(visibleCount) pending upload\(visibleCount == 1 ? "" : "s"). Quipsly will resume automatically when the connection and account are ready."
            lastRecoveryDetail = "Quipsly found preserved local recording upload metadata from a previous session."
        }
    }

    /// Reconnects URLSession tasks delivered by iOS with the durable upload ledger.
    /// Any legacy duplicates are cancelled; a persisted upload can own only one task.
    func reassociateBackgroundSession(
        resumePendingUploads: Bool = true,
        overridingBackoff: Bool = false
    ) {
        _ = urlSession
        shouldResumeAfterReconciliation = shouldResumeAfterReconciliation || resumePendingUploads
        shouldOverrideBackoffAfterReconciliation = shouldOverrideBackoffAfterReconciliation || overridingBackoff
        guard !isReconcilingBackgroundTasks else { return }

        isReconcilingBackgroundTasks = true
        urlSession.getAllTasks { [weak self] tasks in
            DispatchQueue.main.async {
                guard let self else { return }

                var tasksBySessionId = [String: [URLSessionTask]]()
                var tasksToResumeAfterCommit = [URLSessionTask]()
                for task in tasks {
                    if task.state == .completed {
                        self.ignoredTaskIdentifiers.insert(task.taskIdentifier)
                        continue
                    }
                    let sessionId = task.taskDescription
                        ?? task.originalRequest?.value(forHTTPHeaderField: "X-Session-ID")
                    guard let sessionId,
                          self.activeUploads[sessionId] != nil,
                          self.sessionBelongsToActiveOwner(sessionId) else {
                        // A protected ledger can be temporarily unavailable
                        // during launch/unlock. Quarantine the daemon task rather
                        // than destroying recoverable in-flight work. A later
                        // reconciliation resumes it once its ledger reappears.
                        task.suspend()
                        self.quarantinedTaskIdentifiers.insert(task.taskIdentifier)
                        self.lastRecoveryDetail = self.durableLedgerAvailable
                            ? "A background upload has no matching ledger entry and was safely quarantined. The local source was not deleted."
                            : "Background upload paused until the protected ledger becomes available. The local source was not deleted."
                        continue
                    }
                    // Reconciliation first pauses daemon ownership. The task is
                    // resumed only after its exact identifier is committed to the
                    // protected ledger below.
                    if task.state == .running {
                        task.suspend()
                    }
                    self.quarantinedTaskIdentifiers.remove(task.taskIdentifier)
                    tasksBySessionId[sessionId, default: []].append(task)
                }

                self.activeTaskSessionIds.removeAll()
                for sessionId in Array(self.activeUploads.keys) {
                    guard var uploadSession = self.activeUploads[sessionId] else { continue }
                    guard self.sessionBelongsToActiveOwner(sessionId) else { continue }
                    let previouslyHadTask = uploadSession.taskIdentifier != nil
                    let candidates = tasksBySessionId[sessionId] ?? []
                    let sortedCandidates = candidates.sorted {
                        let lhsRank = self.taskStateRank($0.state)
                        let rhsRank = self.taskStateRank($1.state)
                        if lhsRank == rhsRank {
                            return $0.taskIdentifier < $1.taskIdentifier
                        }
                        return lhsRank < rhsRank
                    }

                    if let keptTask = sortedCandidates.first {
                        uploadSession.taskIdentifier = keptTask.taskIdentifier
                        uploadSession.nextAttemptAt = nil
                        self.activeTaskSessionIds.insert(sessionId)
                        for duplicateTask in sortedCandidates.dropFirst() {
                            self.ignoredTaskIdentifiers.insert(duplicateTask.taskIdentifier)
                            duplicateTask.cancel()
                        }
                        if keptTask.state == .suspended {
                            tasksToResumeAfterCommit.append(keptTask)
                        }
                    } else {
                        uploadSession.taskIdentifier = nil
                        if previouslyHadTask,
                           uploadSession.protocolKind == self.canonicalProtocolKind,
                           uploadSession.protocolPhase == "uploading" {
                            // The daemon no longer owns the task, but the app may
                            // have missed its completion callback. Ask Nest to
                            // verify first; a 409 safely returns to upload.
                            uploadSession.protocolPhase = "finalizing"
                            uploadSession.currentChunk = uploadSession.totalChunks
                            uploadSession.isAwaitingVerification = true
                        }
                    }
                    self.activeUploads[sessionId] = uploadSession
                }

                let shouldResume = self.shouldResumeAfterReconciliation
                let overridingBackoff = self.shouldOverrideBackoffAfterReconciliation
                self.shouldResumeAfterReconciliation = false
                self.shouldOverrideBackoffAfterReconciliation = false
                self.isReconcilingBackgroundTasks = false
                let ledgerPersisted = self.saveActiveUploads()

                guard ledgerPersisted else {
                    for task in tasksToResumeAfterCommit {
                        self.quarantinedTaskIdentifiers.insert(task.taskIdentifier)
                    }
                    self.activeTaskSessionIds.removeAll()
                    self.statusText = "Uploads paused until the protected job ledger is available."
                    self.refreshUploadActivity()
                    return
                }

                for task in tasksToResumeAfterCommit {
                    self.quarantinedTaskIdentifiers.remove(task.taskIdentifier)
                    task.resume()
                }

                if shouldResume {
                    self.resumePendingUploads(overridingBackoff: overridingBackoff)
                } else {
                    self.refreshUploadActivity()
                }
            }
        }
    }

    private func resumePendingUploads(overridingBackoff: Bool) {
        for sessionId in Array(activeUploads.keys) {
            guard var uploadSession = activeUploads[sessionId],
                  sessionBelongsToActiveOwner(sessionId),
                  uploadSession.taskIdentifier == nil,
                  !activeTaskSessionIds.contains(sessionId) else {
                continue
            }

            if overridingBackoff {
                retryWorkItems.removeValue(forKey: sessionId)?.cancel()
                uploadSession.retryCount = 0
                uploadSession.nextAttemptAt = nil
                uploadSession.isHeld = false

                if uploadSession.protocolKind == canonicalProtocolKind {
                    if uploadSession.expectedSHA256 == nil {
                        uploadSession.protocolPhase = "hashing"
                    } else if uploadSession.currentChunk >= uploadSession.totalChunks {
                        uploadSession.protocolPhase = "finalizing"
                        uploadSession.isAwaitingVerification = true
                    } else if uploadSession.resumableUploadURL == nil {
                        uploadSession.protocolPhase = "creating"
                    } else {
                        uploadSession.protocolPhase = "uploading"
                    }
                    activeUploads[sessionId] = uploadSession
                // A final response without verified storage is not complete. The
                // compatibility chunk endpoint has no receipt-poll route, so an
                // explicit user retry safely replays the same session from chunk 0.
                } else if uploadSession.currentChunk >= uploadSession.totalChunks,
                   uploadSession.lastServerVerificationStatus?.lowercased() != "verified" {
                    uploadSession.currentChunk = 0
                    uploadSession.lastServerVerificationStatus = nil
                    uploadSession.lastServerVerificationDetail = nil
                    uploadSession.isAwaitingVerification = false
                }
                activeUploads[sessionId] = uploadSession
            } else if uploadSession.isHeld == true {
                continue
            }

            if overridingBackoff, !saveActiveUploads() {
                holdInMemoryForUnavailableLedger(
                    sessionId: sessionId,
                    detail: "The requested retry was not started because its protected job state could not be committed."
                )
                continue
            }

            if uploadSession.protocolKind == canonicalProtocolKind {
                uploadNextChunk(for: sessionId)
                continue
            }

            if uploadSession.currentChunk >= uploadSession.totalChunks {
                if uploadSession.lastServerVerificationStatus?.lowercased() == "verified" {
                    finalizeUpload(for: sessionId)
                }
                continue
            }
            uploadNextChunk(for: sessionId)
        }
        refreshUploadActivity()
    }

    func retryRecoverableUploads() {
        if shouldReloadDurableLedger {
            loadActiveUploads()
        }
        let recoverableSessionIDs = activeUploads.keys.filter(sessionBelongsToActiveOwner)
        guard !recoverableSessionIDs.isEmpty else {
            statusText = "No preserved uploads to retry."
            lastRecoveryDetail = nil
            return
        }

        isUploading = true
        statusText = "Retrying \(recoverableSessionIDs.count) preserved upload\(recoverableSessionIDs.count == 1 ? "" : "s")..."
        lastRecoveryDetail = "Retry started. Originals stay on device until server verification lands."
        reassociateBackgroundSession(resumePendingUploads: true, overridingBackoff: true)
    }

    func hasDurableUpload(localRecordingID: UUID) -> Bool {
        durableLedgerAvailable && activeUploads.contains {
            $0.value.localRecordingID == localRecordingID
                && $0.value.isHeld != true
                && sessionBelongsToActiveOwner($0.key)
        }
    }

    /// Non-mutating safety check for an explicitly confirmed local deletion.
    /// Active, queued, or verifying work remains fail-closed. A held recovery
    /// job is eligible only when no daemon/control task still owns it.
    ///
    /// - Returns: `nil` when deletion may proceed, otherwise a user-facing reason.
    func localDeletionBlocker(
        localRecordingID: UUID,
        ownerAccountID: String,
        fileURL: URL
    ) -> String? {
        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID),
              let expectedOwnerAccountID = normalizedOwnerID(ownerAccountID),
              expectedOwnerAccountID == activeOwnerAccountID,
              expectedOwnerAccountID == AuthManager.currentStoredOwnerID() else {
            return "Verify the current Quipsly account before deleting a protected local original."
        }
        guard let sourceIdentityURL = UploadSession.canonicalConfinedSourceURL(for: fileURL) else {
            return "Quipsly could not verify the selected source path inside its protected app storage, so the local original was left untouched."
        }
        guard durableLedgerAvailable, !shouldReloadDurableLedger else {
            return "The protected upload ledger is unavailable. Unlock this device and try again before deleting the local original."
        }

        let matchingSessionIDs = activeUploads.compactMap { sessionId, uploadSession -> String? in
            guard normalizedOwnerID(uploadSession.ownerAccountID) == expectedOwnerAccountID else {
                return nil
            }
            let matchesLedgerID = uploadSession.localRecordingID == localRecordingID
            let matchesConfinedSourcePath = uploadSession.durableSourceIdentityURL == sourceIdentityURL
            guard matchesLedgerID || matchesConfinedSourcePath else { return nil }
            return sessionId
        }
        guard !matchingSessionIDs.isEmpty else { return nil }

        if isReconcilingBackgroundTasks {
            return "Quipsly is reconciling background upload work. Try deletion again after that check finishes."
        }
        let hasNonDormantJob = matchingSessionIDs.contains { sessionId in
            guard let uploadSession = activeUploads[sessionId] else { return true }
            return uploadSession.isHeld != true
                || uploadSession.taskIdentifier != nil
                || activeTaskSessionIds.contains(sessionId)
                || retryWorkItems[sessionId] != nil
                || canonicalControlTasks[sessionId] != nil
                || preparationBackgroundTasks[sessionId] != nil
        }
        if hasNonDormantJob {
            return "An upload or verification attempt still owns this source. Wait for it to finish or become held before deleting the local original."
        }

        return nil
    }

    /// Retires only owner-scoped dormant recovery state after the Library has
    /// durably recorded the tombstone and removed the explicitly selected bytes.
    /// Keeping this mutation after byte deletion means a failed filesystem delete
    /// can never strand a still-present source without its resumable job.
    /// Server-side manifests and app records are deliberately untouched.
    ///
    /// - Returns: `nil` when cleanup committed, otherwise a user-facing warning.
    func retireDormantUploadAfterConfirmedLocalDeletion(
        localRecordingID: UUID,
        ownerAccountID: String,
        fileURL: URL
    ) -> String? {
        if let blocker = localDeletionBlocker(
            localRecordingID: localRecordingID,
            ownerAccountID: ownerAccountID,
            fileURL: fileURL
        ) {
            return blocker
        }

        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID),
              let expectedOwnerAccountID = normalizedOwnerID(ownerAccountID),
              expectedOwnerAccountID == activeOwnerAccountID,
              expectedOwnerAccountID == AuthManager.currentStoredOwnerID(),
              let sourceIdentityURL = UploadSession.canonicalConfinedSourceURL(for: fileURL) else {
            return "The current Quipsly account could not be verified while retiring local upload recovery state."
        }
        let matchingSessionIDs = activeUploads.compactMap { sessionId, uploadSession -> String? in
            guard normalizedOwnerID(uploadSession.ownerAccountID) == expectedOwnerAccountID else {
                return nil
            }
            let matchesLedgerID = uploadSession.localRecordingID == localRecordingID
            let matchesConfinedSourcePath = uploadSession.durableSourceIdentityURL == sourceIdentityURL
            guard matchesLedgerID || matchesConfinedSourcePath else { return nil }
            return sessionId
        }
        guard !matchingSessionIDs.isEmpty else { return nil }

        let previousUploads = activeUploads
        for sessionId in matchingSessionIDs {
            activeUploads.removeValue(forKey: sessionId)
        }
        guard saveActiveUploads() else {
            activeUploads = previousUploads
            refreshUploadActivity()
            return "The local original was deleted, but Quipsly could not retire its dormant upload-recovery row. The protected tombstone remains and cleanup can be retried after unlock."
        }

        for sessionId in matchingSessionIDs {
            UploadLedgerStore.deleteCapability(for: sessionId)
            uploadCompletions.removeValue(forKey: sessionId)
        }
        statusText = "Dormant upload job cleared after explicit local-original deletion."
        lastRecoveryDetail = "Server/account evidence was left untouched. The protected local deletion receipt remains."
        refreshUploadActivity()
        return nil
    }

    /// Retries one durable local recording without clearing recovery state for
    /// unrelated takes. Other already-running uploads may continue normally.
    @discardableResult
    func retryUpload(localRecordingID: UUID) -> Bool {
        if shouldReloadDurableLedger {
            loadActiveUploads()
        }
        guard let sessionId = activeUploads.first(where: {
            $0.value.localRecordingID == localRecordingID && sessionBelongsToActiveOwner($0.key)
        })?.key,
              var uploadSession = activeUploads[sessionId] else {
            return false
        }

        retryWorkItems.removeValue(forKey: sessionId)?.cancel()
        uploadSession.retryCount = 0
        uploadSession.nextAttemptAt = nil
        uploadSession.isHeld = false
        uploadSession.isAwaitingVerification = false
        if uploadSession.protocolKind == canonicalProtocolKind {
            if uploadSession.expectedSHA256 == nil {
                uploadSession.protocolPhase = "hashing"
            } else if uploadSession.currentChunk >= uploadSession.totalChunks {
                uploadSession.protocolPhase = "finalizing"
                uploadSession.isAwaitingVerification = true
            } else if uploadSession.resumableUploadURL == nil {
                uploadSession.protocolPhase = "creating"
            } else {
                uploadSession.protocolPhase = "uploading"
            }
        } else if uploadSession.currentChunk >= uploadSession.totalChunks,
           uploadSession.lastServerVerificationStatus?.lowercased() != "verified" {
            uploadSession.currentChunk = 0
            uploadSession.lastServerVerificationStatus = nil
            uploadSession.lastServerVerificationDetail = nil
        }
        activeUploads[sessionId] = uploadSession
        statusText = "Retrying \(uploadSession.fileName)…"
        lastRecoveryDetail = "Retry started for the selected local source. The original remains on this device."
        guard saveActiveUploads() else {
            holdInMemoryForUnavailableLedger(
                sessionId: sessionId,
                detail: "The selected retry was not started because its protected job state could not be committed."
            )
            return false
        }
        reassociateBackgroundSession(resumePendingUploads: true)
        return true
    }

    private func refreshRecoverableUploadCount() {
        recoverableUploadCount = activeUploads.keys.filter(sessionBelongsToActiveOwner).count
    }

    private func refreshUploadActivity() {
        let ownedSessionIDs = Set(activeUploads.keys.filter(sessionBelongsToActiveOwner))
        isUploading = activeTaskSessionIds.contains(where: ownedSessionIDs.contains)
            || retryWorkItems.keys.contains(where: ownedSessionIDs.contains)
            || canonicalControlTasks.keys.contains(where: ownedSessionIDs.contains)
            || activeUploads.contains(where: { ownedSessionIDs.contains($0.key) && $0.value.taskIdentifier != nil })
            || (isReconcilingBackgroundTasks && shouldResumeAfterReconciliation && !ownedSessionIDs.isEmpty)
        refreshRecoverableUploadCount()
    }

    private func taskStateRank(_ state: URLSessionTask.State) -> Int {
        switch state {
        case .running:
            return 0
        case .suspended:
            return 1
        case .canceling:
            return 2
        case .completed:
            return 3
        @unknown default:
            return 4
        }
    }

    private func contentType(for fileUrl: URL) -> String {
        switch fileUrl.pathExtension.lowercased() {
        case "m4a", "mp4a":
            return "audio/mp4"
        case "aac":
            return "audio/aac"
        case "wav":
            return "audio/wav"
        case "mp3":
            return "audio/mpeg"
        case "mov":
            return "video/quicktime"
        case "mp4", "m4v":
            return "video/mp4"
        default:
            return "application/octet-stream"
        }
    }
}
