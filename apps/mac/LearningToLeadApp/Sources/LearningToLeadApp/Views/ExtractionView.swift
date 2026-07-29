import SwiftUI

struct ExtractionView: View {
    @EnvironmentObject var viewModel: DocumentViewModel
    
    var body: some View {
        HStack(spacing: 0) {
            // Left sidebar listing all tags
            VStack(alignment: .leading, spacing: 0) {
                Text("Tags")
                    .font(.headline)
                    .padding()
                
                List {
                    Button(action: {
                        viewModel.selectTag(nil)
                    }) {
                        HStack {
                            Text("All Tags")
                                .bold(viewModel.selectedTag == nil)
                                .foregroundColor(viewModel.selectedTag == nil ? .accentColor : .primary)
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    
                    ForEach(viewModel.tags) { tag in
                        Button(action: {
                            viewModel.selectTag(tag)
                        }) {
                            HStack {
                                Text("#\(tag.name)")
                                    .bold(viewModel.selectedTag == tag)
                                    .foregroundColor(viewModel.selectedTag == tag ? .accentColor : .primary)
                                Spacer()
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .listStyle(.sidebar)
            }
            .frame(width: 200)
            
            Divider()
            
            // Right detail listing matching paragraphs
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let selected = viewModel.selectedTag {
                        Text("Paragraphs with #\(selected.name)")
                            .font(.title2)
                            .bold()
                    } else {
                        Text("All Paragraphs")
                            .font(.title2)
                            .bold()
                    }
                    
                    if viewModel.paragraphs.isEmpty {
                        Text("No paragraphs found.")
                            .foregroundColor(.secondary)
                            .padding()
                    } else {
                        ForEach(viewModel.paragraphs) { paragraph in
                            ParagraphRowView(paragraph: paragraph, viewModel: viewModel)
                        }
                    }
                }
                .padding()
            }
        }
        .frame(minWidth: 600, minHeight: 400)
        .onAppear {
            viewModel.loadData()
        }
    }
}
