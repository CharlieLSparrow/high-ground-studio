import SwiftUI

struct IPhoneQuipslySessionView: View {
    @Binding var selectedSection: MobileWorkspaceSection
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?
    @Binding var showFocusMode: Bool

    private let blocks = MobileManuscriptBlock.sample

    var body: some View {
        TabView(selection: $selectedSection) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        MobileHeroCard(
                            eyebrow: "iPhone Session",
                            title: "Manuscript first. Controls at thumb distance.",
                            description: "Homer should see the session, the clip cue, and the record state. Nothing else gets to shout."
                        )
                        ManuscriptReaderPanel(blocks: blocks, selectedBlockID: $selectedBlockID)
                        QuickActionRail(actions: MobileQuickAction.iPhoneActions)
                    }
                    .padding()
                }
                .background(MobileStudioBackground())
                .navigationTitle("Session")
                .toolbar {
                    Button {
                        showFocusMode.toggle()
                    } label: {
                        Label("Focus", systemImage: "text.alignleft")
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    MobileTransportDock(contextLabel: "Session")
                        .padding(.horizontal)
                }
            }
            .tabItem { Label("Session", systemImage: "doc.text") }
            .tag(MobileWorkspaceSection.session)

            RecorderControlBoard()
                .tabItem { Label("Record", systemImage: "mic.circle") }
                .tag(MobileWorkspaceSection.recorder)

            MediaCueBoard(blocks: blocks)
                .tabItem { Label("Clips", systemImage: "play.rectangle") }
                .tag(MobileWorkspaceSection.media)

            MobileNestChatView()
                .tabItem { Label("Chat", systemImage: "bubble.left.and.bubble.right") }
                .tag(MobileWorkspaceSection.chat)

            NativeEditorView()
                .tabItem { Label("Editor", systemImage: "slider.horizontal.3") }
                .tag(MobileWorkspaceSection.editor)
        }
    }
}
