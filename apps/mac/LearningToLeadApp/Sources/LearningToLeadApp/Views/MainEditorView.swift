import SwiftUI
#if canImport(AppKit)
import AppKit
#endif

enum ViewMode: String, CaseIterable, Identifiable {
    case mainEditor = "Main Editor"
    case tagExtraction = "Tag Extraction"
    case timeline = "Timeline"
    case annotationsDashboard = "Annotations Dashboard"
    
    var id: String { self.rawValue }
    
    var iconName: String {
        switch self {
        case .mainEditor: return "square.and.pencil"
        case .tagExtraction: return "tag"
        case .timeline: return "calendar"
        case .annotationsDashboard: return "note.text"
        }
    }
}

struct MainEditorView: View {
    @StateObject private var viewModel: DocumentViewModel
    @State private var selectedMode: ViewMode = .mainEditor
    
    let timer = Timer.publish(every: 1.0, on: .main, in: .common).autoconnect()
    
    init() {
        let vm: DocumentViewModel
        do {
            vm = try DocumentViewModel()
        } catch {
            print("Failed to initialize DocumentViewModel: \(error)")
            // Fallback for previews or missing db files
            vm = DocumentViewModel(databaseManager: try! DatabaseManager(databasePath: ":memory:"))
        }
        _viewModel = StateObject(wrappedValue: vm)
    }
    
    var body: some View {
        HStack(spacing: 0) {
            // Navigation Sidebar
            VStack(alignment: .leading, spacing: 10) {
                Text("Learning to Lead")
                    .font(.headline)
                    .padding()
                
                ForEach(ViewMode.allCases) { mode in
                    Button(action: {
                        // Clear selected tag when switching to Main Editor or Timeline
                        if mode != .tagExtraction {
                            viewModel.selectTag(nil)
                        }
                        selectedMode = mode
                    }) {
                        HStack {
                            Image(systemName: mode.iconName)
                            Text(mode.rawValue)
                            Spacer()
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, 12)
                        .background(selectedMode == mode ? Color.accentColor.opacity(0.15) : Color.clear)
                        .foregroundColor(selectedMode == mode ? .accentColor : .primary)
                        .cornerRadius(6)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 8)
                
                Spacer()
                
                // Import from Inbox Button
                Button(action: {
                    let defaultPath = "/Users/wall-e/Dev/high-ground-studio/apps/web/content/_inbox"
                    var isDir: ObjCBool = false
                    if FileManager.default.fileExists(atPath: defaultPath, isDirectory: &isDir) && isDir.boolValue {
                        viewModel.importFromInbox(path: defaultPath)
                    } else {
                        #if canImport(AppKit)
                        let panel = NSOpenPanel()
                        panel.canChooseDirectories = true
                        panel.canChooseFiles = false
                        panel.allowsMultipleSelection = false
                        panel.title = "Select Inbox Folder"
                        panel.prompt = "Select"
                        if panel.runModal() == .OK {
                            if let path = panel.url?.path {
                                viewModel.importFromInbox(path: path)
                            }
                        }
                        #endif
                    }
                }) {
                    HStack {
                        Image(systemName: "square.and.arrow.down")
                        Text("Import Drafts")
                    }
                    .padding(.vertical, 8)
                    .padding(.horizontal, 12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.accentColor)
                    .foregroundColor(.white)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .padding()
            }
            .frame(width: 200)
            .background(Color.secondary.opacity(0.05))
            
            Divider()
            
            // Detail area based on selection
            VStack(spacing: 0) {
                switch selectedMode {
                case .mainEditor:
                    VStack(alignment: .leading, spacing: 16) {
                        HStack {
                            Text("Main Editor")
                                .font(.largeTitle)
                                .bold()
                            Spacer()
                            Button("Reload Data") {
                                viewModel.loadData()
                            }
                            .buttonStyle(.bordered)
                        }
                        .padding([.top, .leading, .trailing])
                        
                        HStack(spacing: 0) {
                            // Main Editor Scroll Area
                            ScrollViewReader { proxy in
                                ScrollView {
                                    VStack(alignment: .leading, spacing: 16) {
                                        if viewModel.paragraphs.isEmpty {
                                            Text("No paragraphs imported. Click 'Import Drafts' to load paragraphs from the inbox.")
                                                .foregroundColor(.secondary)
                                                .padding()
                                        } else {
                                            ForEach(viewModel.paragraphs) { paragraph in
                                                ParagraphRowView(paragraph: paragraph, viewModel: viewModel)
                                                    .id(paragraph.id)
                                            }
                                        }
                                    }
                                    .padding()
                                }
                                // TOC Sidebar
                                Divider()
                                
                                VStack(alignment: .leading, spacing: 10) {
                                    Text("Contents")
                                        .font(.headline)
                                        .padding(.bottom, 4)
                                    
                                    if viewModel.tableOfContents.isEmpty {
                                        Text("No chapters found.")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    } else {
                                        ScrollView {
                                            VStack(alignment: .leading, spacing: 6) {
                                                ForEach(viewModel.tableOfContents) { item in
                                                    Button(action: {
                                                        withAnimation {
                                                            proxy.scrollTo(item.id, anchor: .top)
                                                        }
                                                    }) {
                                                        Text(item.title)
                                                            .font(.caption)
                                                            .multilineTextAlignment(.leading)
                                                            .frame(maxWidth: .infinity, alignment: .leading)
                                                    }
                                                    .buttonStyle(.plain)
                                                    .padding(6)
                                                    .background(Color.secondary.opacity(0.1))
                                                    .cornerRadius(4)
                                                }
                                            }
                                        }
                                    }
                                }
                                .padding()
                                .frame(width: 250)
                                .background(Color.secondary.opacity(0.02))
                            }
                        }
                    }
                    
                case .tagExtraction:
                    ExtractionView()
                        .environmentObject(viewModel)
                    
                case .timeline:
                    TimelineView()
                        .environmentObject(viewModel)
                    
                case .annotationsDashboard:
                    AnnotationsDashboardView()
                        .environmentObject(viewModel)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 900, minHeight: 600)
        .alert(isPresented: $viewModel.showImportAlert) {
            Alert(
                title: Text("Import Error"),
                message: Text(viewModel.importErrorMessage ?? "An unknown error occurred."),
                dismissButton: .default(Text("OK")) {
                    viewModel.importErrorMessage = nil
                }
            )
        }
        .onAppear {
            viewModel.loadData()
        }
        .onReceive(timer) { _ in
            viewModel.loadData()
        }
    }
}
