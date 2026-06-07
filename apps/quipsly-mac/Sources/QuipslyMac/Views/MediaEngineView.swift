import SwiftUI

struct MediaEngineView: View {
    @EnvironmentObject private var engine: LocalEngineClient

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Media Engine",
                    eyebrow: "Local video power",
                    description: "The future home for camera ingest, proxy generation, render prep, waveform sync, and safe offload. Native Mac gets the file and hardware access the browser should not pretend to own."
                )

            EpisodeImportPanelView()

            EpisodeSyncPrepPanelView()

            VStack(alignment: .leading, spacing: 12) {
                    Text("Current engine capabilities")
                        .font(.title2.bold())
                    CapabilityRow(title: "Media editing", enabled: engine.capabilities.mediaEditing)
                    CapabilityRow(title: "Local ingest", enabled: engine.capabilities.localIngest)
                    CapabilityRow(title: "Safe offload", enabled: engine.capabilities.safeOffload)
                    CapabilityRow(title: "AI logging", enabled: engine.capabilities.aiLogging)
                }
                .panelStyle()

                VStack(alignment: .leading, spacing: 12) {
                    Text("Build direction")
                        .font(.title2.bold())
                    Text("This app should become the heavy-duty counterpart to Nest: browse local drives, prepare proxies, inspect sync, and send clean episode assets back to the cloud workspace.")
                        .foregroundStyle(.secondary)
                }
                .panelStyle()
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}

struct CapabilityRow: View {
    var title: String
    var enabled: Bool

    var body: some View {
        HStack {
            Image(systemName: enabled ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(enabled ? .green : .secondary)
            Text(title)
            Spacer()
            Text(enabled ? "Ready" : "Off")
                .font(.caption.bold())
                .foregroundStyle(enabled ? .green : .secondary)
        }
        .padding(.vertical, 4)
    }
}
