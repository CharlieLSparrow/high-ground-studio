import Foundation

struct LocalEngineCapabilities: Codable, Equatable {
    var mediaEditing: Bool
    var localIngest: Bool
    var cloudSync: Bool
    var safeOffload: Bool
    var aiLogging: Bool
    var visionLab: Bool
    var mlTraining: Bool
    var marineBiologyWorkflow: Bool

    static let offline = LocalEngineCapabilities(
        mediaEditing: false,
        localIngest: false,
        cloudSync: false,
        safeOffload: false,
        aiLogging: false,
        visionLab: false,
        mlTraining: false,
        marineBiologyWorkflow: false
    )
}

struct VisionLabJob: Codable, Identifiable, Equatable {
    var id: String
    var type: String
    var status: String
    var label: String
    var startedAt: String?
    var completedAt: String?
    var summary: String?
}

struct VisionLabStatus: Codable, Equatable {
    var enabled: Bool
    var workflow: String
    var activeDatasetName: String?
    var activeDatasetPath: String?
    var datasetCount: Int
    var imageCount: Int
    var annotationCount: Int
    var trainingJobCount: Int
    var manifest: VisionDatasetManifest?
    var jobs: [VisionLabJob]
    var suggestedRoots: [String]
    var nextActions: [String]
    var notes: [String]

    static let empty = VisionLabStatus(
        enabled: false,
        workflow: "not-connected",
        activeDatasetName: nil,
        activeDatasetPath: nil,
        datasetCount: 0,
        imageCount: 0,
        annotationCount: 0,
        trainingJobCount: 0,
        manifest: nil,
        jobs: [],
        suggestedRoots: [],
        nextActions: ["Start the local engine to inspect research workflows."],
        notes: []
    )
}

struct VisionDatasetManifestFile: Codable, Identifiable, Equatable {
    var id: String
    var name: String
    var path: String
    var relativePath: String
    var `extension`: String
    var kind: String
    var sizeBytes: Int
    var modifiedAt: String
    var quickFingerprint: String
    var contentSha256: String?
}

struct VisionDatasetManifestSafety: Codable, Equatable {
    var movedFiles: Bool
    var renamedFiles: Bool
    var uploadedFiles: Bool
    var contentHashesComputed: Bool
    var note: String
}

struct VisionDatasetManifest: Codable, Equatable {
    var id: String
    var datasetName: String
    var rootPath: String
    var savedManifestPath: String?
    var createdAt: String
    var fileCount: Int
    var imageCount: Int
    var videoCount: Int
    var metadataCount: Int
    var otherCount: Int
    var totalBytes: Int
    var files: [VisionDatasetManifestFile]
    var extensionCounts: [String: Int]
    var safety: VisionDatasetManifestSafety
    var warnings: [String]
}

struct VisionDatasetManifestSummary: Codable, Identifiable, Equatable {
    var id: String
    var datasetName: String
    var rootPath: String
    var savedManifestPath: String?
    var createdAt: String
    var fileCount: Int
    var imageCount: Int
    var videoCount: Int
    var totalBytes: Int
}

enum EngineConnectionState: String {
    case offline = "Offline"
    case connecting = "Connecting"
    case online = "Online"

    var isOnline: Bool { self == .online }
}
