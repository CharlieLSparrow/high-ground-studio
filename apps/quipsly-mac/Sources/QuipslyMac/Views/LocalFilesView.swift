import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct LocalFilesView: View {
    @EnvironmentObject private var mediaAccess: MediaAccessStore
    @State private var isChoosingMediaRoot = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Local Files",
                    eyebrow: "Media access vault",
                    description: "Grant Quipsly Mac durable access to podcast folders, iCloud/Google Drive folders, SD cards, external drives, and research photo libraries once. The editor can then relink, probe, proxy, and render without asking for the same folder over and over."
                )

                permissionsSummary
                quickRootActions
                grantedRoots
                fullDiskAccessPanel
            }
            .padding(28)
        }
        .background(QuipslyBackground())
        .fileImporter(isPresented: $isChoosingMediaRoot, allowedContentTypes: [.folder], allowsMultipleSelection: false) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                mediaAccess.addRoot(url)
            case .failure(let error):
                mediaAccess.recordMessage("Could not choose media folder: \(error.localizedDescription)")
            }
        }
        .onAppear {
            mediaAccess.restoreAccessIfNeeded()
        }
    }

    private var permissionsSummary: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: mediaAccess.needsAttentionCount == 0 && mediaAccess.activeRootCount > 0 ? "externaldrive.fill.badge.checkmark" : "externaldrive.badge.questionmark")
                    .font(.title2)
                    .foregroundStyle(mediaAccess.needsAttentionCount == 0 && mediaAccess.activeRootCount > 0 ? .green : .orange)

                VStack(alignment: .leading, spacing: 5) {
                    Text("Durable folder access")
                        .font(.title2.bold())
                    Text(mediaAccess.lastMessage)
                        .foregroundStyle(.secondary)
                    Text("\(mediaAccess.activeRootCount) active root\(mediaAccess.activeRootCount == 1 ? "" : "s") · \(mediaAccess.needsAttentionCount) need\(mediaAccess.needsAttentionCount == 1 ? "s" : "") attention")
                        .font(.caption.bold())
                        .foregroundStyle(mediaAccess.needsAttentionCount == 0 ? .green : .orange)
                }

                Spacer()

                Button {
                    mediaAccess.restoreAccessIfNeeded()
                } label: {
                    Label("Restore access", systemImage: "arrow.clockwise")
                }
            }

            Text("Best practice: grant Quipsly the folders where media actually lives. Use Full Disk Access only for broad local rescue work or when cloud-provider privacy prompts keep interrupting exports.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .panelStyle()
    }

    private var quickRootActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Grant media roots")
                .font(.title2.bold())

            HStack(spacing: 10) {
                Button {
                    isChoosingMediaRoot = true
                } label: {
                    Label("Choose media folder", systemImage: "folder.badge.plus")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    mediaAccess.addRoot(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Desktop/Podcast", isDirectory: true), label: "Desktop Podcast")
                } label: {
                    Label("Podcast folder", systemImage: "waveform.and.person.filled")
                }

                Button {
                    mediaAccess.addRoot(FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/CloudStorage", isDirectory: true), label: "CloudStorage")
                } label: {
                    Label("CloudStorage", systemImage: "cloud")
                }

                Button {
                    mediaAccess.addRoot(URL(fileURLWithPath: "/Volumes", isDirectory: true), label: "External drives")
                } label: {
                    Label("External drives", systemImage: "externaldrive")
                }
            }

            Text("Quipsly stores security-scoped bookmarks in Application Support. If a drive moves or a cloud provider revokes the bookmark, regrant that root here.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .panelStyle()
    }

    private var grantedRoots: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Granted roots")
                    .font(.title2.bold())
                Spacer()
                Button {
                    mediaAccess.revealVaultFile()
                } label: {
                    Label("Reveal vault", systemImage: "doc.text.magnifyingglass")
                }
            }

            if mediaAccess.roots.isEmpty {
                Text("No roots yet. Add your Podcast folder, camera dump folder, research photo folder, or external drive before doing serious local editing.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            } else {
                ForEach(mediaAccess.roots) { root in
                    MediaAccessRootRow(root: root) {
                        mediaAccess.removeRoot(id: root.id)
                    }
                }
            }
        }
        .panelStyle()
    }

    private var fullDiskAccessPanel: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "lock.shield")
                    .foregroundStyle(.blue)
                VStack(alignment: .leading, spacing: 5) {
                    Text("Whole-system access is a macOS Privacy choice")
                        .font(.headline)
                    Text("Quipsly cannot grant itself permanent access to the whole Mac. For broad rescue work, add Quipsly Mac to System Settings > Privacy & Security > Full Disk Access. For production distribution, we should sign the app with a stable Developer ID so macOS keeps that grant across releases.")
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 8) {
                    Button {
                        mediaAccess.openFullDiskAccessSettings()
                    } label: {
                        Label("Open Full Disk Access", systemImage: "gearshape")
                    }
                    Button {
                        mediaAccess.testFullDiskAccessProbe()
                    } label: {
                        Label("Test access", systemImage: "checkmark.shield")
                    }
                }
            }
        }
        .panelStyle()
    }
}

private struct MediaAccessRootRow: View {
    let root: MediaAccessRoot
    let onRemove: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: root.status == "active" ? "checkmark.seal.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(root.status == "active" ? .green : .orange)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 4) {
                Text(root.displayLabel)
                    .font(.headline)
                Text(root.path)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                HStack(spacing: 8) {
                    Text(root.status == "active" ? "Active" : root.status)
                        .font(.caption.bold())
                        .foregroundStyle(root.status == "active" ? .green : .orange)
                    if root.isStale {
                        Text("Regrant recommended")
                            .font(.caption.bold())
                            .foregroundStyle(.orange)
                    }
                    if let lastAccessedAt = root.lastAccessedAt {
                        Text("Last restored \(lastAccessedAt.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            Button {
                NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: root.path)])
            } label: {
                Label("Reveal", systemImage: "folder")
            }

            Button(role: .destructive) {
                onRemove()
            } label: {
                Label("Remove", systemImage: "trash")
            }
        }
        .padding(12)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
