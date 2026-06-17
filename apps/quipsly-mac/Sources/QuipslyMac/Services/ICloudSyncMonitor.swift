import Foundation
import Combine

class ICloudSyncMonitor: ObservableObject {
    @Published var trackedFiles: [ICloudFileStatus] = []
    @Published var totalLocalBytes: Int64 = 0
    @Published var totalCloudBytes: Int64 = 0
    @Published var totalDownloadingBytes: Int64 = 0
    
    private var query = NSMetadataQuery()
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupQuery()
    }
    
    private func setupQuery() {
        // Monitor everything in the user's Documents and Desktop directories that is synced to iCloud.
        // We look for files where NSMetadataItemFSNameKey exists.
        query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope, NSMetadataQueryUbiquitousDataScope]
        
        // Predicate to find all items that are not hidden
        query.predicate = NSPredicate(format: "%K NOT LIKE %@", NSMetadataItemFSNameKey, ".*")
        
        NotificationCenter.default.publisher(for: .NSMetadataQueryDidFinishGathering, object: query)
            .sink { [weak self] _ in self?.processResults() }
            .store(in: &cancellables)
            
        NotificationCenter.default.publisher(for: .NSMetadataQueryDidUpdate, object: query)
            .sink { [weak self] _ in self?.processResults() }
            .store(in: &cancellables)
            
        query.start()
    }
    
    private func processResults() {
        query.disableUpdates()
        
        var newFiles: [ICloudFileStatus] = []
        var newLocalBytes: Int64 = 0
        var newCloudBytes: Int64 = 0
        var newDownloadingBytes: Int64 = 0
        
        for item in query.results {
            guard let metadataItem = item as? NSMetadataItem,
                  let url = metadataItem.value(forAttribute: NSMetadataItemURLKey) as? URL else {
                continue
            }
            
            var status = ICloudFileStatus(url: url)
            
            // Get sync status
            let isDownloading = metadataItem.value(forAttribute: NSMetadataUbiquitousItemIsDownloadingKey) as? Bool ?? false
            let isUploaded = metadataItem.value(forAttribute: NSMetadataUbiquitousItemIsUploadedKey) as? Bool ?? false
            let isUploading = metadataItem.value(forAttribute: NSMetadataUbiquitousItemIsUploadingKey) as? Bool ?? false
            let downloadingStatus = metadataItem.value(forAttribute: NSMetadataUbiquitousItemDownloadingStatusKey) as? String
            
            status.isUploaded = isUploaded
            status.isUploading = isUploading
            
            if isDownloading {
                status.state = .downloading
                if let percent = metadataItem.value(forAttribute: NSMetadataUbiquitousItemPercentDownloadedKey) as? Double {
                    status.downloadPercentage = percent
                }
            } else if isUploading {
                status.state = .uploading
                if let percent = metadataItem.value(forAttribute: NSMetadataUbiquitousItemPercentUploadedKey) as? Double {
                    status.downloadPercentage = percent
                }
            } else if downloadingStatus == NSMetadataUbiquitousItemDownloadingStatusNotDownloaded {
                status.state = .notDownloaded
            } else if downloadingStatus == NSMetadataUbiquitousItemDownloadingStatusCurrent {
                status.state = .downloaded
                status.downloadPercentage = 100.0
            }
            
            let size = status.fileSize ?? 0
            
            if status.state == .downloaded {
                newLocalBytes += size
            } else if status.state == .notDownloaded {
                newCloudBytes += size
            } else if status.state == .downloading {
                newDownloadingBytes += size
                newCloudBytes += (size - (status.downloadedSize ?? 0))
                newLocalBytes += (status.downloadedSize ?? 0)
            }
            
            // Only add files that are either downloading or completely evicted, or very large files that are uploading.
            // We want to highlight the problematic ones for the user.
            if status.state == .downloading || status.state == .notDownloaded || status.state == .uploading {
                newFiles.append(status)
            }
        }
        
        // Sort by state (downloading first) and then by name
        newFiles.sort {
            if $0.state == .downloading && $1.state != .downloading { return true }
            if $0.state != .downloading && $1.state == .downloading { return false }
            return $0.filename < $1.filename
        }
        
        DispatchQueue.main.async {
            self.trackedFiles = newFiles
            self.totalLocalBytes = newLocalBytes
            self.totalCloudBytes = newCloudBytes
            self.totalDownloadingBytes = newDownloadingBytes
        }
        
        query.enableUpdates()
    }
    
    deinit {
        query.stop()
    }
}
