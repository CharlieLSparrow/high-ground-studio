import SwiftUI

struct LocalFilesView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                HeroPanel(
                    title: "Local Files",
                    eyebrow: "Watched folders",
                    description: "A native file workflow for downloads, iCloud, SD cards, external drives, and research folders. Everything can start in the user home nest before being attached to a specific Nest."
                )

                VStack(alignment: .leading, spacing: 12) {
                    Text("Design rule")
                        .font(.title2.bold())
                    Text("The app should make assets available without forcing the user to know where they belong yet. Attach first to the user's home nest, then let them link assets to project nests when the story becomes clear.")
                        .foregroundStyle(.secondary)
                }
                .panelStyle()
            }
            .padding(28)
        }
        .background(QuipslyBackground())
    }
}
