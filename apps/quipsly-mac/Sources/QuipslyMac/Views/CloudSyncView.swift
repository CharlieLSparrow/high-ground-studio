import SwiftUI

struct CloudSyncView: View {
    @EnvironmentObject private var engine: LocalEngineClient

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
                    CapabilityRow(title: "Cloud sync", enabled: engine.capabilities.cloudSync)
                    CapabilityRow(title: "Safe offload verification", enabled: engine.capabilities.safeOffload)
                }
                .panelStyle()
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}
