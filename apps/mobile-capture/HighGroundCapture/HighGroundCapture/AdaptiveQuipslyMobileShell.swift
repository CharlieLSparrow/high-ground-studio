import SwiftUI

struct AdaptiveQuipslyMobileShell: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.verticalSizeClass) private var verticalSizeClass

    @State private var selectedSection: MobileWorkspaceSection = .session
    @State private var selectedInspector: MobileInspectorMode = .outline
    @State private var selectedBlockID: MobileManuscriptBlock.ID? = MobileManuscriptBlock.sample.first?.id
    @State private var showFocusMode = false

    private var profile: MobileDeviceProfile {
        MobileDeviceProfile.current(
            horizontalSizeClass: horizontalSizeClass,
            verticalSizeClass: verticalSizeClass
        )
    }

    var body: some View {
        Group {
            if profile.prefersThreePaneStudio {
                IPadQuipslyStudioView(
                    selectedSection: $selectedSection,
                    selectedInspector: $selectedInspector,
                    selectedBlockID: $selectedBlockID,
                    showFocusMode: $showFocusMode
                )
            } else {
                IPhoneQuipslySessionView(
                    selectedSection: $selectedSection,
                    selectedBlockID: $selectedBlockID,
                    showFocusMode: $showFocusMode
                )
            }
        }
        .tint(.teal)
    }
}
