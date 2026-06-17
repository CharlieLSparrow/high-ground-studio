import Foundation

enum ICloudSyncState: String {
    case downloaded = "Downloaded"
    case downloading = "Downloading"
    case notDownloaded = "Not Downloaded"
    case uploading = "Uploading"
    case unknown = "Unknown"
}

struct ICloudFileStatus: Identifiable, Hashable {
    let id = UUID()
    let url: URL
    let filename: String
    
    var state: ICloudSyncState
    var downloadPercentage: Double?
    var isUploaded: Bool
    var isUploading: Bool
    
    var fileSize: Int64?
    var downloadedSize: Int64? {
        guard let size = fileSize, let percentage = downloadPercentage else { return nil }
        return Int64(Double(size) * (percentage / 100.0))
    }
    
    init(url: URL) {
        self.url = url
        self.filename = url.lastPathComponent
        self.state = .unknown
        self.downloadPercentage = nil
        self.isUploaded = false
        self.isUploading = false
        
        do {
            let resourceValues = try url.resourceValues(forKeys: [.fileSizeKey])
            self.fileSize = Int64(resourceValues.fileSize ?? 0)
        } catch {
            self.fileSize = nil
        }
    }
}
