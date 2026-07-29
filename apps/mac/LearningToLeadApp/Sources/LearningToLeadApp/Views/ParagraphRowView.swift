import SwiftUI

struct ParagraphRowView: View {
    let paragraph: Paragraph
    @ObservedObject var viewModel: DocumentViewModel
    @State private var selectedOptionId: Int64?
    @State private var newAnnotationText: String = ""
    
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("ID: \(paragraph.id)")
                    .font(.caption)
                    .bold()
                Spacer()
                Text("Author: \(paragraph.author)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                if paragraph.isMutable {
                    Text("Mutable")
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.green.opacity(0.15))
                        .foregroundColor(.green)
                        .cornerRadius(4)
                } else {
                    Text("Immutable")
                        .font(.caption)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(Color.gray.opacity(0.15))
                        .foregroundColor(.secondary)
                        .cornerRadius(4)
                }
            }
            
            let displayText = viewModel.paragraphText(for: paragraph.id)
            Text(displayText)
                .font(.body)
                .padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
            
            if !paragraph.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(paragraph.tags, id: \.self) { tag in
                        Text("#\(tag)")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.accentColor.opacity(0.12))
                            .foregroundColor(.accentColor)
                            .cornerRadius(4)
                    }
                }
            }
            
            if !paragraph.clips.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Clips:")
                        .font(.caption)
                        .bold()
                        .foregroundColor(.secondary)
                    
                    ForEach(paragraph.clips) { clip in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(clip.title).font(.subheadline).bold()
                            Text(clip.description).font(.caption).foregroundColor(.secondary)
                            if let url = URL(string: clip.url) {
                                Link("Watch Video", destination: url)
                                    .font(.caption)
                            }
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.blue.opacity(0.05))
                        .cornerRadius(6)
                    }
                }
            }
            
            if paragraph.isMutable {
                let options = viewModel.getOptions(for: paragraph.id)
                if options.isEmpty {
                    Button(action: {
                        viewModel.generateOptions(for: paragraph.id)
                    }) {
                        Label("Generate Options", systemImage: "wand.and.stars")
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Co-Authoring Options:")
                            .font(.caption)
                            .bold()
                            .foregroundColor(.secondary)
                        
                        Picker("Select Option", selection: $selectedOptionId) {
                            Text("Original Text").tag(nil as Int64?)
                            ForEach(options) { option in
                                Text("\(option.voice): \(option.text)")
                                    .tag(option.id as Int64?)
                            }
                        }
                        .pickerStyle(.menu)
                        
                        if selectedOptionId != paragraph.activeOptionId {
                            Button("Activate") {
                                viewModel.hotSwapOption(paragraphId: paragraph.id, optionId: selectedOptionId)
                            }
                            .buttonStyle(.bordered)
                        }
                    }
                    .padding(8)
                    .background(Color.secondary.opacity(0.06))
                    .cornerRadius(6)
                    .onAppear {
                        selectedOptionId = paragraph.activeOptionId
                    }
                }
            }
            
            Divider().padding(.vertical, 4)
            
            // Annotations Section
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: "note.text")
                        .foregroundColor(.orange)
                    Text("Annotations")
                        .font(.caption)
                        .bold()
                        .foregroundColor(.secondary)
                }
                
                ForEach(paragraph.annotations) { annotation in
                    HStack(alignment: .top) {
                        Text(annotation.author + ":")
                            .font(.caption)
                            .bold()
                            .foregroundColor(.orange)
                        Text(annotation.text)
                            .font(.caption)
                    }
                    .padding(6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(4)
                }
                
                HStack {
                    TextField("Add annotation...", text: $newAnnotationText)
                        .textFieldStyle(.roundedBorder)
                        .font(.caption)
                    Button(action: {
                        guard !newAnnotationText.isEmpty else { return }
                        viewModel.addAnnotation(paragraphId: paragraph.id, text: newAnnotationText)
                        newAnnotationText = ""
                    }) {
                        Image(systemName: "plus.circle.fill")
                            .foregroundColor(.orange)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding()
        .background(Color.secondary.opacity(0.04))
        .cornerRadius(8)
        .onChange(of: paragraph.activeOptionId) { oldValue, newValue in
            selectedOptionId = newValue
        }
    }
}
