import AppKit
import SwiftUI

struct SourceProxyQueueView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var queue = SourceProxyQueueStore()

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Source hydration + proxy queue", systemImage: "externaldrive.badge.timemachine")
                        .font(.title2.bold())
                    Text("Make big originals safe and local, then generate lightweight editor proxies. The timeline should play proxies; final export can still trace back to originals.")
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    Text(appState.editorEpisodeSlug)
                        .font(.caption.monospaced().bold())
                        .foregroundStyle(.secondary)
                    Text(queue.lastMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.trailing)
                        .lineLimit(3)
                }
                .frame(maxWidth: 420, alignment: .trailing)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 130), spacing: 10)], spacing: 10) {
                sourceProxyMetric("Sources", value: "\(queue.summary.total)", systemImage: "tray.full", color: .quipslyClayTeal)
                sourceProxyMetric("Proxy ready", value: "\(queue.summary.proxyReady)", systemImage: "checkmark.circle.fill", color: .green)
                sourceProxyMetric("Need proxy", value: "\(queue.summary.proxyNeeded)", systemImage: "film.stack", color: .orange)
                sourceProxyMetric("Need download", value: "\(queue.summary.sourceNeedsHydration)", systemImage: "icloud.and.arrow.down", color: .blue)
                sourceProxyMetric("Missing", value: "\(queue.summary.sourceMissing)", systemImage: "exclamationmark.triangle.fill", color: .red)
            }

            SourceProxyWorkspaceStatusCard(
                status: queue.workspaceStatus,
                onRefresh: { queue.refreshWorkspaceStatus(workspacePath: appState.mediaWorkspacePath) },
                onClearStaleLock: { queue.clearStaleProxyLock(workspacePath: appState.mediaWorkspacePath) }
            )

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Button {
                        scanCurrentEpisode()
                    } label: {
                        Label(queue.isScanning ? "Scanning..." : "Scan current episode", systemImage: "magnifyingglass")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(queue.isScanning)
                    .accessibilityIdentifier("source-proxy-queue-scan-current")

                    Button {
                        queue.scanPremiereRescueEpisodes(projectSlug: appState.editorProjectSlug, workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Scan Episodes 1-3", systemImage: "rectangle.stack")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.isScanning)
                    .accessibilityIdentifier("source-proxy-queue-scan-rescue-episodes")

                    Button {
                        queue.revealFirstHydrationNeed()
                    } label: {
                        Label("Reveal first download", systemImage: "icloud.and.arrow.down")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.first(where: { $0.sourceState.needsHumanHydration }) == nil)
                    .accessibilityIdentifier("source-proxy-queue-reveal-first-download")

                    Button {
                        queue.prepareHydration(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Prepare downloads", systemImage: "folder.badge.gearshape")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.first(where: { $0.sourceState.needsHumanHydration }) == nil)
                    .accessibilityIdentifier("source-proxy-queue-prepare-downloads")

                    Spacer(minLength: 0)
                }

                HStack(spacing: 10) {
                    Button {
                        queue.vaultNextReadySource(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Vault next ready source", systemImage: "externaldrive.badge.plus")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.activeVaultItemID != nil || queue.items.first(where: { $0.canVaultSource(in: appState.mediaWorkspacePath) }) == nil)
                    .accessibilityIdentifier("source-proxy-queue-vault-next-ready")

                    Button {
                        queue.generateNextReadyProxy(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Generate next ready proxy", systemImage: "play.circle")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.activeProxyItemID != nil || queue.items.first(where: { $0.canGenerateProxy }) == nil)
                    .accessibilityIdentifier("source-proxy-queue-generate-next-ready")

                    Spacer(minLength: 0)
                }

                HStack(spacing: 10) {
                    Button {
                        queue.copyHydrationChecklist()
                    } label: {
                        Label("Copy download checklist", systemImage: "checklist")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.first(where: { $0.sourceState.needsHumanHydration }) == nil)
                    .accessibilityIdentifier("source-proxy-queue-copy-download-checklist")

                    Button {
                        queue.copyDiagnostics(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Copy diagnostics", systemImage: "doc.on.doc")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.isEmpty)
                    .accessibilityIdentifier("source-proxy-queue-copy-diagnostics")

                    Button {
                        queue.copyReadyActionPlan(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Copy action plan", systemImage: "list.clipboard")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.isEmpty)
                    .accessibilityIdentifier("source-proxy-queue-copy-action-plan")

                    Button {
                        queue.saveActionPlan(workspacePath: appState.mediaWorkspacePath)
                    } label: {
                        Label("Save action plan", systemImage: "square.and.arrow.down")
                    }
                    .buttonStyle(.bordered)
                    .disabled(queue.items.isEmpty)
                    .accessibilityIdentifier("source-proxy-queue-save-action-plan")

                    Spacer()

                    Text(QuipslyMediaWorkspace.rootURL(rootPath: appState.mediaWorkspacePath).path)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            if queue.items.isEmpty {
                ContentUnavailableView {
                    Label("No source queue yet", systemImage: "film")
                } description: {
                    Text("Scan the current episode or Episodes 1-3. Quipsly will group timeline decisions by original media, classify source readiness, and show what can be proxied safely.")
                }
                .frame(maxWidth: .infinity, minHeight: 180)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                VStack(spacing: 10) {
                    ForEach(queue.items) { item in
                        SourceProxyQueueRow(
                            item: item,
                            isGenerating: queue.activeProxyItemID == item.id,
                            isVaulting: queue.activeVaultItemID == item.id,
                            workspacePath: appState.mediaWorkspacePath,
                            onPrimary: { performPrimaryAction(item) },
                            onRevealSource: { queue.revealSource(itemID: item.id) },
                            onRevealProxy: { queue.revealProxy(itemID: item.id) },
                            onGenerateProxy: { queue.generateProxy(for: item.id, workspacePath: appState.mediaWorkspacePath) },
                            onVaultSource: { queue.vaultSource(itemID: item.id, workspacePath: appState.mediaWorkspacePath) }
                        )
                    }
                }
            }
        }
        .panelStyle()
        .onAppear {
            if queue.items.isEmpty {
                scanCurrentEpisode()
            }
        }
        .onChange(of: appState.editorProjectSlug) { scanCurrentEpisode() }
        .onChange(of: appState.editorEpisodeSlug) { scanCurrentEpisode() }
        .onChange(of: appState.mediaWorkspacePath) { scanCurrentEpisode() }
    }

    private func performPrimaryAction(_ item: SourceProxyQueueItem) {
        if item.proxyState == .ready {
            queue.revealProxy(itemID: item.id)
        } else if item.canGenerateProxy {
            queue.generateProxy(for: item.id, workspacePath: appState.mediaWorkspacePath)
        } else {
            queue.revealSource(itemID: item.id)
        }
    }

    private func scanCurrentEpisode() {
        queue.scanCurrentEpisode(
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug,
            workspacePath: appState.mediaWorkspacePath
        )
    }

    private func sourceProxyMetric(_ title: String, value: String, systemImage: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Label(title, systemImage: systemImage)
                .font(.caption.bold())
                .foregroundStyle(color)
            Text(value)
                .font(.title3.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct SourceProxyWorkspaceStatusCard: View {
    var status: SourceProxyWorkspaceStatus
    var onRefresh: () -> Void
    var onClearStaleLock: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: statusIcon)
                .font(.title3)
                .foregroundStyle(statusColor)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 8) {
                    Text("Workspace readiness")
                        .font(.headline)
                    Text(status.lastCheckedAt.formatted(date: .omitted, time: .standard))
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }

                Text(status.workspacePath.isEmpty ? "Workspace path has not been checked yet." : status.workspacePath)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)

                HStack(spacing: 8) {
                    sourceProxyBadge("Available: \(status.availableLabel)", color: .green)
                    sourceProxyBadge(status.lockLabel, color: status.lockExists ? .orange : .green)
                    if status.hasStaleProxyLock {
                        sourceProxyBadge("Stale lock can be cleared", color: .red)
                    }
                }

                if let lockDetails = status.lockDetails, !lockDetails.isEmpty {
                    Text(lockDetails)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 8) {
                Button {
                    onRefresh()
                } label: {
                    Label("Refresh workspace", systemImage: "arrow.clockwise")
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("source-proxy-workspace-refresh")

                Button {
                    onClearStaleLock()
                } label: {
                    Label("Clear stale lock", systemImage: "lock.open")
                }
                .buttonStyle(.bordered)
                .disabled(!status.canClearStaleProxyLock)
                .accessibilityIdentifier("source-proxy-workspace-clear-stale-lock")
            }
        }
        .padding(12)
        .background(statusColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(statusColor.opacity(0.20), lineWidth: 1)
        )
    }

    private var statusColor: Color {
        if status.hasStaleProxyLock { return .red }
        if status.lockExists { return .orange }
        return .quipslyClayTeal
    }

    private var statusIcon: String {
        if status.hasStaleProxyLock { return "lock.trianglebadge.exclamationmark" }
        if status.lockExists { return "lock.fill" }
        return "externaldrive.fill.badge.checkmark"
    }

    private func sourceProxyBadge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.16), in: Capsule())
            .foregroundStyle(color)
    }
}

private struct SourceProxyQueueRow: View {
    var item: SourceProxyQueueItem
    var isGenerating: Bool
    var isVaulting: Bool
    var workspacePath: String
    var onPrimary: () -> Void
    var onRevealSource: () -> Void
    var onRevealProxy: () -> Void
    var onGenerateProxy: () -> Void
    var onVaultSource: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: statusIcon)
                    .font(.title3)
                    .foregroundStyle(statusColor)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 5) {
                    HStack(spacing: 8) {
                        Text(item.displayName)
                            .font(.headline)
                            .lineLimit(1)
                        Text(item.episodeSlug)
                            .font(.caption.monospaced().bold())
                            .foregroundStyle(.secondary)
                        Text(item.trackIds.joined(separator: ", "))
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                    }

                    Text(item.sourceLocationLabel)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)

                    HStack(spacing: 8) {
                        sourceProxyBadge(item.sourceState.label, color: sourceColor)
                        sourceProxyBadge(isGenerating ? SourceProxyState.generating.label : item.proxyState.label, color: proxyColor)
                        sourceProxyBadge(item.isVaulted(in: workspacePath) ? "Vaulted original" : "Not vaulted", color: item.isVaulted(in: workspacePath) ? .green : .secondary)
                        sourceProxyBadge("\(item.clipCount) decisions", color: .secondary)
                        sourceProxyBadge("\(item.allocatedSizeLabel) / \(item.logicalSizeLabel)", color: .secondary)
                    }

                    if let lastError = item.lastError, !lastError.isEmpty {
                        Text(lastError)
                            .font(.caption)
                            .foregroundStyle(.red)
                            .lineLimit(3)
                    } else if item.sourceState.needsHumanHydration {
                        Text(blockedExplanation)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    } else if item.proxyState == .needed && !item.canGenerateProxy {
                        Text("Proxy is needed, but Quipsly is waiting for the source to become local and readable.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    Button(isVaulting ? "Vaulting..." : item.primaryActionLabel, action: onPrimary)
                        .buttonStyle(.borderedProminent)
                        .disabled(isGenerating || isVaulting)
                        .accessibilityLabel(item.primaryActionLabel)
                        .accessibilityIdentifier("source-proxy-row-\(item.id)-primary")

                    HStack(spacing: 6) {
                        Button("Source", action: onRevealSource)
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("source-proxy-row-\(item.id)-source")
                        Button("Proxy", action: onRevealProxy)
                            .buttonStyle(.bordered)
                            .disabled(item.proxyState != .ready)
                            .accessibilityIdentifier("source-proxy-row-\(item.id)-proxy")
                        Button("Vault", action: onVaultSource)
                            .buttonStyle(.bordered)
                            .disabled(!item.canVaultSource(in: workspacePath) || isGenerating || isVaulting)
                            .accessibilityIdentifier("source-proxy-row-\(item.id)-vault")
                        Button("Build", action: onGenerateProxy)
                            .buttonStyle(.bordered)
                            .disabled(!item.canGenerateProxy || isGenerating || isVaulting)
                            .accessibilityIdentifier("source-proxy-row-\(item.id)-build")
                    }
                    .controlSize(.small)
                }
            }
        }
        .padding(14)
        .background(statusColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(statusColor.opacity(0.22), lineWidth: 1)
        )
    }

    private var statusColor: Color {
        if isVaulting { return .purple }
        if isGenerating { return .blue }
        if item.proxyState == .ready { return .green }
        if item.sourceState == .missing { return .red }
        if item.sourceState.needsHumanHydration { return .orange }
        return .quipslyClayTeal
    }

    private var sourceColor: Color {
        switch item.sourceState {
        case .localReady: return .green
        case .cloudLinked, .partialLocal: return .orange
        case .missing: return .red
        case .proxyOnly: return .blue
        case .unknown: return .secondary
        }
    }

    private var proxyColor: Color {
        if isGenerating { return .blue }
        switch item.proxyState {
        case .ready: return .green
        case .needed: return .orange
        case .notVideo: return .secondary
        case .generating: return .blue
        case .failed: return .red
        }
    }

    private var statusIcon: String {
        if isVaulting { return "externaldrive.fill.badge.checkmark" }
        if isGenerating { return "gearshape.2.fill" }
        if item.proxyState == .ready { return "checkmark.circle.fill" }
        if item.sourceState == .missing { return "exclamationmark.triangle.fill" }
        if item.sourceState.needsHumanHydration { return "icloud.and.arrow.down" }
        return "film.stack"
    }

    private var blockedExplanation: String {
        switch item.sourceState {
        case .cloudLinked:
            return "Cloud-backed source. Reveal it in Finder, choose Download Now or Make Available Offline, then rescan. Quipsly will not proxy a placeholder."
        case .partialLocal:
            return "Partial local bytes. Let Finder, Google Drive, or iCloud finish the download before vaulting or proxying."
        case .missing:
            return "Missing source path. Use Source to inspect the expected folder, then relink or import the file if it is not there."
        case .unknown:
            return "Needs review. Reveal the file, confirm it is readable locally, then rescan."
        case .proxyOnly:
            return "Proxy is linked but the original source is not. Final export needs the original relinked later."
        case .localReady:
            return item.sourceState.explanation
        }
    }

    private func sourceProxyBadge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
            .foregroundStyle(color)
    }
}
