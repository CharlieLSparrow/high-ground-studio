import SwiftUI

struct IPadQuipslyStudioView: View {
    @Binding var selectedSection: MobileWorkspaceSection
    @Binding var selectedInspector: MobileInspectorMode
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?
    @Binding var showFocusMode: Bool

    private let blocks = MobileManuscriptBlock.sample

    var body: some View {
        NavigationSplitView {
            List {
                ForEach(MobileWorkspaceSection.allCases) { section in
                    Button {
                        selectedSection = section
                    } label: {
                        Label(section.title, systemImage: section.systemImage)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(selectedSection == section ? Color.teal.opacity(0.16) : Color.clear)
                }
            }
            .navigationTitle("Quipsly")
            .safeAreaInset(edge: .bottom) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("High Ground Odyssey")
                        .font(.headline)
                    Text("Episode workspace")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(.bar)
            }
        } content: {
            iPadCenterPane
                .navigationTitle(selectedSection.title)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        Button {
                            showFocusMode.toggle()
                        } label: {
                            Label("Focus", systemImage: showFocusMode ? "rectangle.compress.vertical" : "rectangle.expand.vertical")
                        }

                        Button {} label: {
                            Label("Sync", systemImage: "arrow.triangle.2.circlepath")
                        }
                    }
                }
        } detail: {
            if showFocusMode {
                FocusModePanel(blocks: blocks, selectedBlockID: $selectedBlockID)
            } else {
                InspectorPane(
                    selectedInspector: $selectedInspector,
                    blocks: blocks,
                    selectedBlockID: $selectedBlockID
                )
            }
        }
        .navigationSplitViewStyle(.balanced)
        .safeAreaInset(edge: .bottom) {
            MobileTransportDock(contextLabel: selectedSection.title)
        }
    }

    @ViewBuilder
    private var iPadCenterPane: some View {
        switch selectedSection {
        case .session:
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    MobileHeroCard(
                        eyebrow: "iPad Studio",
                        title: "Write, cue, record, and edit from one living document.",
                        description: "The iPad version keeps the manuscript in the middle, clip cues inline, and precision tools one panel away."
                    )

                    ManuscriptReaderPanel(blocks: blocks, selectedBlockID: $selectedBlockID)
                    QuickActionRail(actions: MobileQuickAction.iPadActions)
                }
                .padding()
            }
            .background(MobileStudioBackground())

        case .editor:
            NativeEditorView()
                .background(MobileStudioBackground())

        case .media:
            MediaCueBoard(blocks: blocks)
                .background(MobileStudioBackground())

        case .recorder:
            RecorderControlBoard()
                .background(MobileStudioBackground())

        case .chat:
            MobileNestChatView()
                .background(MobileStudioBackground())

        case .publish:
            NativePublishingView()
                .background(MobileStudioBackground())
        }
    }
}

private struct InspectorPane: View {
    @Binding var selectedInspector: MobileInspectorMode
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    private var selectedBlock: MobileManuscriptBlock? {
        blocks.first { $0.id == selectedBlockID }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Inspector", selection: $selectedInspector) {
                ForEach(MobileInspectorMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)

            switch selectedInspector {
            case .outline:
                OutlineInspector(blocks: blocks, selectedBlockID: $selectedBlockID)
            case .clip:
                ClipInspector(block: selectedBlock)
            case .tags:
                TagInspector(block: selectedBlock)
            case .sync:
                SyncInspector(block: selectedBlock)
            }

            Spacer()
        }
        .padding()
        .background(.regularMaterial)
    }
}
