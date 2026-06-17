import SwiftUI

struct CloudSyncView: View {
    @EnvironmentObject private var engine: LocalEngineClient
    @StateObject private var iCloudMonitor = ICloudSyncMonitor()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Cloud Sync",
                    eyebrow: "Vault and verification",
                    description: "The calm place for knowing what is local, what is uploaded, what has a verified hash, and what is safe to remove from fragile laptop storage."
                )

                VStack(alignment: .leading, spacing: 12) {
                    Text("Vault status")
                        .font(.title2.bold())
                    
                    // Storage Summary Visualization
                    let totalBytes = iCloudMonitor.totalLocalBytes + iCloudMonitor.totalCloudBytes + iCloudMonitor.totalDownloadingBytes
                    if totalBytes > 0 {
                        VStack(spacing: 8) {
                            HStack {
                                Text("iCloud Storage Allocation")
                                    .font(.headline)
                                Spacer()
                                Text(ByteCountFormatter.string(fromByteCount: totalBytes, countStyle: .file))
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            
                            GeometryReader { geometry in
                                let width = geometry.size.width
                                let localRatio = Double(iCloudMonitor.totalLocalBytes) / Double(totalBytes)
                                let cloudRatio = Double(iCloudMonitor.totalCloudBytes) / Double(totalBytes)
                                let downloadingRatio = Double(iCloudMonitor.totalDownloadingBytes) / Double(totalBytes)
                                
                                HStack(spacing: 0) {
                                    Rectangle()
                                        .fill(Color.blue)
                                        .frame(width: max(0, width * localRatio))
                                    Rectangle()
                                        .fill(Color.orange)
                                        .frame(width: max(0, width * downloadingRatio))
                                    Rectangle()
                                        .fill(Color.gray.opacity(0.3))
                                        .frame(width: max(0, width * cloudRatio))
                                }
                                .clipShape(Capsule())
                            }
                            .frame(height: 12)
                            
                            HStack(spacing: 16) {
                                Label(ByteCountFormatter.string(fromByteCount: iCloudMonitor.totalLocalBytes, countStyle: .file) + " Local", systemImage: "externaldrive.fill")
                                    .foregroundColor(.blue)
                                Label(ByteCountFormatter.string(fromByteCount: iCloudMonitor.totalDownloadingBytes, countStyle: .file) + " Downloading", systemImage: "arrow.down.circle.fill")
                                    .foregroundColor(.orange)
                                Label(ByteCountFormatter.string(fromByteCount: iCloudMonitor.totalCloudBytes, countStyle: .file) + " Evicted (Cloud only)", systemImage: "icloud.fill")
                                    .foregroundColor(.gray)
                            }
                            .font(.caption2.bold())
                            .padding(.top, 4)
                        }
                        .padding(.vertical, 8)
                        
                        Divider()
                    }
                    
                    CapabilityRow(title: "Cloud sync", enabled: engine.capabilities.cloudSync)
                    CapabilityRow(title: "Safe offload verification", enabled: engine.capabilities.safeOffload)
                }
                .panelStyle()
                
                if !iCloudMonitor.trackedFiles.isEmpty {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Active iCloud Operations")
                            .font(.title2.bold())
                        
                        ForEach(iCloudMonitor.trackedFiles) { file in
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(file.filename)
                                        .font(.headline)
                                    Text(file.state.rawValue)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                
                                Spacer()
                                
                                if let size = file.fileSize {
                                    Text(ByteCountFormatter.string(fromByteCount: size, countStyle: .file))
                                        .font(.subheadline)
                                        .foregroundColor(.secondary)
                                }
                                
                                if file.state == .downloading, let percent = file.downloadPercentage {
                                    ProgressView(value: percent, total: 100.0)
                                        .frame(width: 100)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .panelStyle()
                }
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}
