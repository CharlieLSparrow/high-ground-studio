import Foundation
import Combine
import UIKit
import Network
class UploadManager: NSObject, ObservableObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    static let shared = UploadManager()

    @Published var uploadProgress: Double = 0.0
    @Published var isUploading: Bool = false
    @Published var statusText: String? = nil
    @Published var lastUploadedSourceId: String? = nil

    // WebRTC Adaptive State Hooks
    @Published var networkQuality: String = "Excellent"
    @Published var webrtcVideoEnabled: Bool = true

    private let studioApiBaseUrl = "https://studio-hm2odnvjga-uc.a.run.app/api"
    private let chunkSize: Int = 5 * 1024 * 1024 // 5MB chunks to survive bad cell coverage

    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "NetworkMonitor")

    private var responseData = [Int: Data]()

    // Track active chunk sessions
    private var activeUploads = [String: UploadSession]()

    struct UploadSession: Codable {
        var fileUrlBookmark: Data?
        let projectSlug: String
        let episodeSlug: String
        let sourceType: String
        let trackId: String?
        let startedAt: String?
        let stoppedAt: String?
        let recordingSegmentsJson: String?
        let totalChunks: Int
        var currentChunk: Int
        let sessionId: String
        var lastMediaAssetId: String?
        var lastSourceId: String?
        let fileName: String

        var fileUrl: URL {
            if let data = fileUrlBookmark {
                var isStale = false
                if let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &isStale) {
                    return url
                }
            }
            return URL(fileURLWithPath: "") // fallback
        }

        init(
            fileUrl: URL,
            projectSlug: String,
            episodeSlug: String,
            sourceType: String,
            trackId: String?,
            startedAt: String?,
            stoppedAt: String?,
            recordingSegmentsJson: String?,
            fileName: String,
            totalChunks: Int,
            currentChunk: Int,
            sessionId: String
        ) {
            self.fileUrlBookmark = try? fileUrl.bookmarkData(options: .minimalBookmark, includingResourceValuesForKeys: nil, relativeTo: nil)
            self.projectSlug = projectSlug
            self.episodeSlug = episodeSlug
            self.sourceType = sourceType
            self.trackId = trackId
            self.startedAt = startedAt
            self.stoppedAt = stoppedAt
            self.recordingSegmentsJson = recordingSegmentsJson
            self.totalChunks = totalChunks
            self.fileName = fileName
            self.currentChunk = currentChunk
            self.sessionId = sessionId
        }
    }

    private lazy var urlSession: URLSession = {
        // Resumable background configuration
        let config = URLSessionConfiguration.background(withIdentifier: "com.quipsly.upload.chunked")
        config.isDiscretionary = false
        config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true // CRITICAL: Wait for cell coverage to return instead of failing instantly
        return URLSession(configuration: config, delegate: self, delegateQueue: .main)
    }()

    override init() {
        super.init()
        loadActiveUploads()
        _ = urlSession

        pathMonitor.pathUpdateHandler = { [weak self] path in
            DispatchQueue.main.async {
                if path.status == .satisfied {
                    self?.networkQuality = "Excellent"
                    self?.webrtcVideoEnabled = true
                    print("📡 NETWORK RECOVERED: WebRTC video restored.")
                } else {
                    self?.networkQuality = "Poor (Audio Only)"
                    self?.webrtcVideoEnabled = false
                    print("📡 NETWORK DROP: Adaptive WebRTC turned off video. Local high-fidelity recording continues flawlessly.")
                }
            }
        }
        pathMonitor.start(queue: monitorQueue)
    }

    func startUpload(
        fileUrl: URL,
        projectSlug: String,
        episodeSlug: String,
        sourceType: String = "audio",
        trackId: String? = nil,
        startedAt: String? = nil,
        stoppedAt: String? = nil,
        recordingSegmentsJson: String? = nil,
        completion: ((Bool, String?, String?) -> Void)? = nil
    ) {
        guard FileManager.default.fileExists(atPath: fileUrl.path) else {
            completion?(false, nil, "Recording file is missing")
            statusText = "Recording file is missing"
            return
        }

        do {
            let fileAttr = try FileManager.default.attributesOfItem(atPath: fileUrl.path)
            let fileSize = fileAttr[FileAttributeKey.size] as! Int
            let totalChunks = Int(ceil(Double(fileSize) / Double(chunkSize)))

            let sessionId = UUID().uuidString
            let session = UploadSession(
                fileUrl: fileUrl,
                projectSlug: projectSlug,
                episodeSlug: episodeSlug,
                sourceType: sourceType,
                trackId: trackId,
                startedAt: startedAt,
                stoppedAt: stoppedAt,
                recordingSegmentsJson: recordingSegmentsJson,
                fileName: fileUrl.lastPathComponent,
                totalChunks: totalChunks,
                currentChunk: 0,
                sessionId: sessionId
            )

            activeUploads[sessionId] = session
            saveActiveUploads()

            isUploading = true
            uploadProgress = 0.0
            statusText = "Uploading chunk 1 of \(totalChunks)..."
            lastUploadedSourceId = nil

            // Start uploading the first chunk
            uploadNextChunk(for: sessionId)

        } catch {
            completion?(false, nil, "Could not read file attributes")
        }
    }

    private func uploadNextChunk(for sessionId: String) {
        guard let session = activeUploads[sessionId] else { return }

        if session.currentChunk >= session.totalChunks {
            // All chunks uploaded! Notify backend to reassemble.
            finalizeUpload(for: sessionId)
            return
        }

        let fileUrl = session.fileUrl
        let chunkIndex = session.currentChunk

        // Read the specific chunk into memory (avoids OOM on massive 4K video files)
        guard let fileHandle = try? FileHandle(forReadingFrom: fileUrl) else {
            self.statusText = "Failed to open file for chunking"
            return
        }

        fileHandle.seek(toFileOffset: UInt64(chunkIndex * chunkSize))
        let chunkData = fileHandle.readData(ofLength: chunkSize)
        fileHandle.closeFile()

        let tempDir = FileManager.default.temporaryDirectory
        let tempFileUrl = tempDir.appendingPathComponent("\(sessionId)_chunk_\(chunkIndex).tmp")
        do {
            try chunkData.write(to: tempFileUrl)
        } catch {
            self.statusText = "Failed to write temp chunk"
            return
        }

        // We use a mock endpoint for chunking since the main API might not support it yet.
        guard let url = URL(string: "\(studioApiBaseUrl)/ingest/mobile/chunk") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        request.setValue(fileUrl.lastPathComponent, forHTTPHeaderField: "X-File-Name")
        request.setValue(sessionId, forHTTPHeaderField: "X-Session-ID")
        request.setValue(String(chunkIndex), forHTTPHeaderField: "X-Chunk-Index")
        request.setValue(String(session.totalChunks), forHTTPHeaderField: "X-Total-Chunks")
        request.setValue(session.projectSlug, forHTTPHeaderField: "X-Project-Slug")
        request.setValue(session.episodeSlug, forHTTPHeaderField: "X-Episode-Slug")
        request.setValue(session.sourceType, forHTTPHeaderField: "X-Source-Type")
        if let trackId = session.trackId {
            request.setValue(trackId, forHTTPHeaderField: "X-Track-Id")
        }
        if let startedAt = session.startedAt {
            request.setValue(startedAt, forHTTPHeaderField: "X-Started-At")
        }
        if let stoppedAt = session.stoppedAt {
            request.setValue(stoppedAt, forHTTPHeaderField: "X-Stopped-At")
        }
        if let segments = session.recordingSegmentsJson {
            request.setValue(segments, forHTTPHeaderField: "X-Recording-Segments")
        }

        let task = urlSession.uploadTask(with: request, fromFile: tempFileUrl)
        task.taskDescription = sessionId
        task.resume()
    }

    private func finalizeUpload(for sessionId: String) {
        guard let session = activeUploads[sessionId] else { return }
        self.statusText = "Upload complete! Sent \(session.totalChunks) chunks."
        self.uploadProgress = 1.0
        self.isUploading = false
        self.lastUploadedSourceId = session.lastMediaAssetId ?? session.lastSourceId

        // Clean up the massive original video file to free up iPhone storage
        try? FileManager.default.removeItem(at: session.fileUrl)
        activeUploads.removeValue(forKey: sessionId)
        saveActiveUploads()

        NotificationCenter.default.post(
            name: Notification.Name("BackgroundUploadFinished"),
            object: nil,
            userInfo: [
                "success": true,
                "sourceId": session.lastSourceId ?? session.sessionId,
                "mediaAssetId": session.lastMediaAssetId ?? "",
            ]
        )
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
        DispatchQueue.main.async {
            guard let sessionId = task.taskDescription, let uploadSession = self.activeUploads[sessionId] else { return }

            // Calculate global progress across all chunks
            let globalProgress = (Double(uploadSession.currentChunk) + (Double(totalBytesSent) / Double(totalBytesExpectedToSend))) / Double(uploadSession.totalChunks)

            self.uploadProgress = globalProgress
            self.isUploading = true

            NotificationCenter.default.post(
                name: Notification.Name("BackgroundUploadProgress"),
                object: nil,
                userInfo: ["progress": self.uploadProgress]
            )
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let taskId = task.taskIdentifier
        let payloadData = responseData[taskId]
        responseData.removeValue(forKey: taskId)

        let sessionId = task.originalRequest?.value(forHTTPHeaderField: "X-Session-ID") ?? task.taskDescription ?? ""
        let chunkIndexStr = task.originalRequest?.value(forHTTPHeaderField: "X-Chunk-Index") ?? ""
        let chunkIndex = Int(chunkIndexStr) ?? 0

        let tempFileUrl = FileManager.default.temporaryDirectory.appendingPathComponent("\(sessionId)_chunk_\(chunkIndex).tmp")
        try? FileManager.default.removeItem(at: tempFileUrl)

        guard !sessionId.isEmpty else { return }

        DispatchQueue.main.async {
            guard var uploadSession = self.activeUploads[sessionId] else { return }

            var chunkResponse: [String: AnyObject]? = nil
            if let payloadData, !payloadData.isEmpty {
                if let json = try? JSONSerialization.jsonObject(with: payloadData) as? [String: AnyObject] {
                    chunkResponse = json
                }
            }

            var isHardError = false
            var actualError = error

            if let httpResponse = task.response as? HTTPURLResponse {
                if !(200...299).contains(httpResponse.statusCode) {
                    isHardError = (400...499).contains(httpResponse.statusCode)
                    if actualError == nil {
                        actualError = NSError(domain: "HTTPError", code: httpResponse.statusCode, userInfo: nil)
                    }
                }
            }

            if let err = actualError {
                if isHardError {
                    print("Chunk upload failed with hard error: \(err.localizedDescription). Aborting upload.")
                    self.statusText = "Upload failed."
                    try? FileManager.default.removeItem(at: uploadSession.fileUrl)
                    self.activeUploads.removeValue(forKey: sessionId)
                    self.saveActiveUploads()
                } else {
                    print("Chunk upload failed: \(err.localizedDescription). Retrying immediately.")
                    self.statusText = "Retrying upload..."
                    self.uploadNextChunk(for: sessionId)
                }
                return
            }

            if chunkResponse?["mediaAssetId"] != nil,
               let mediaAssetId = chunkResponse?["mediaAssetId"] as? String {
                uploadSession.lastMediaAssetId = mediaAssetId
                uploadSession.lastSourceId = (chunkResponse?["sourceId"] as? String) ?? uploadSession.lastSourceId
                self.activeUploads[sessionId] = uploadSession
                self.saveActiveUploads()
            }

            // Chunk succeeded! Move to the next one.
            uploadSession.currentChunk += 1
            self.activeUploads[sessionId] = uploadSession
            self.saveActiveUploads()
            self.statusText = "Uploading chunk \(uploadSession.currentChunk + 1) of \(uploadSession.totalChunks)..."
            self.uploadNextChunk(for: sessionId)
        }
    }

    // MARK: - URLSessionDelegate
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
               let completionHandler = appDelegate.backgroundSessionCompletionHandler {
                appDelegate.backgroundSessionCompletionHandler = nil
                completionHandler()
            }
        }
    }

    private func saveActiveUploads() {
        if let data = try? JSONEncoder().encode(activeUploads) {
            UserDefaults.standard.set(data, forKey: "com.quipsly.uploadManager.activeUploads")
        }
    }

    private func loadActiveUploads() {
        if let data = UserDefaults.standard.data(forKey: "com.quipsly.uploadManager.activeUploads"),
           let saved = try? JSONDecoder().decode([String: UploadSession].self, from: data) {
            activeUploads = saved
        }
    }
}
