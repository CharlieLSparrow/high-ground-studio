import SwiftUI

struct DashboardView: View {
    @EnvironmentObject private var engine: LocalEngineClient
    @EnvironmentObject private var appState: AppState

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Quipsly Mac",
                    eyebrow: "Native local cockpit",
                    description: "A Mac-first control room for files, video, proxies, local AI jobs, and research workflows that should not depend on browser sandcastles."
                )

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 16)], spacing: 16) {
                    CapabilityCard(title: "Media editing", enabled: engine.capabilities.mediaEditing, detail: "Timeline, proxies, render prep")
                    CapabilityCard(title: "Local ingest", enabled: engine.capabilities.localIngest, detail: "SD cards, watched folders, camera dumps")
                    CapabilityCard(title: "Cloud sync", enabled: engine.capabilities.cloudSync, detail: "Vault push and verification")
                    CapabilityCard(title: "Safe offload", enabled: engine.capabilities.safeOffload, detail: "Checksum-first delete confidence")
                    CapabilityCard(title: "AI logging", enabled: engine.capabilities.aiLogging, detail: "Gemini-assisted file triage")
                    CapabilityCard(title: "Vision Lab", enabled: engine.capabilities.visionLab, detail: "Research image identification")
                    CapabilityCard(title: "ML training", enabled: engine.capabilities.mlTraining, detail: "Local model jobs, gated")
                    CapabilityCard(title: "Marine biology", enabled: engine.capabilities.marineBiologyWorkflow, detail: "Species and individual ID workflow")
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Local-first product split")
                        .font(.title2.bold())
                    Text("Nest owns collaboration, permissions, publishing, and project memory. The Mac app owns local files, media horsepower, proxies, training jobs, and anything that benefits from native OS access.")
                        .foregroundStyle(.secondary)
                }
                .panelStyle()
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}

struct HeroPanel: View {
    var title: String
    var eyebrow: String
    var description: String

    var bodyView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(eyebrow.uppercased())
                .font(.caption.bold())
                .foregroundStyle(.teal)
                .tracking(1.2)
            Text(title)
                .font(.system(size: 44, weight: .black, design: .rounded))
            Text(description)
                .font(.title3)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(28)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(alignment: .topTrailing) {
            Image(systemName: "sparkles.rectangle.stack.fill")
                .font(.system(size: 72))
                .foregroundStyle(.teal.opacity(0.28))
                .padding(28)
        }
    }

    var body: some View {
        bodyView
    }
}

struct CapabilityCard: View {
    var title: String
    var enabled: Bool
    var detail: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Circle()
                    .fill(enabled ? .green : .secondary.opacity(0.35))
                    .frame(width: 10, height: 10)
                Text(enabled ? "Available" : "Off")
                    .font(.caption.bold())
                    .foregroundStyle(enabled ? .green : .secondary)
            }
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct QuipslyBackground: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    Color.teal.opacity(0.10),
                    Color.orange.opacity(0.06)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            Circle()
                .fill(.teal.opacity(0.10))
                .frame(width: 420)
                .blur(radius: 64)
                .offset(x: -360, y: -260)
        }
    }
}

extension View {
    func panelStyle() -> some View {
        padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
