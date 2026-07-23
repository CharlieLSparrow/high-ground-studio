import SwiftUI

struct IPhoneQuipslySessionView: View {
    @Binding var selectedSection: MobileWorkspaceSection
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?
    @Binding var showFocusMode: Bool
    
    var body: some View {
        CapturePhoneShell()
    }
}
