import SwiftUI

/// The same workspace can be a standalone sheet or an in-call column. An
/// inspector has no independent navigation bar, so its actions belong in the
/// column itself rather than being merged into the call's navigation toolbar.
struct CaptureWorkspaceNavigation<Content: View, Actions: View>: View {
    let title: String
    var embedded = false
    let onDismiss: () -> Void
    @ViewBuilder let actions: () -> Actions
    @ViewBuilder let content: () -> Content

    var body: some View {
        if embedded {
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text(title).font(.headline).accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    actions()
                    Button("Done", action: onDismiss)
                        .frame(minHeight: 44)
                }
                .padding(.horizontal, 16)
                .background(.bar)
                Divider()
                content()
            }
        } else {
            NavigationStack {
                content()
                    .navigationTitle(title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .primaryAction) { actions() }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done", action: onDismiss)
                        }
                    }
            }
        }
    }
}
