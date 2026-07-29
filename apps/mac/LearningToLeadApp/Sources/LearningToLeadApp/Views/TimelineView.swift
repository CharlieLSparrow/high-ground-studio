import SwiftUI

struct TimelineView: View {
    @EnvironmentObject var viewModel: DocumentViewModel
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Chronological Timeline")
                    .font(.largeTitle)
                    .bold()
                    .padding(.bottom, 8)
                
                if viewModel.timelineEvents.isEmpty {
                    Text("No timeline events found.")
                        .foregroundColor(.secondary)
                        .padding()
                } else {
                    ForEach(viewModel.timelineEvents) { event in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text(event.title)
                                    .font(.headline)
                                Spacer()
                                Text(event.dateString)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                            
                            if !event.description.isEmpty {
                                Text(event.description)
                                    .font(.body)
                                    .foregroundColor(.secondary)
                            }
                            
                            // Associated paragraph text
                            let assocText = viewModel.paragraphText(for: event.paragraphId)
                            if !assocText.isEmpty {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("Associated Paragraph (ID \(event.paragraphId)):")
                                        .font(.caption)
                                        .bold()
                                        .foregroundColor(.accentColor)
                                    Text(assocText)
                                        .font(.callout)
                                        .italic()
                                        .padding(.leading, 8)
                                        .padding(.vertical, 4)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .background(Color.gray.opacity(0.1))
                                        .cornerRadius(4)
                                }
                                .padding(.top, 4)
                            }
                            
                            Divider()
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .padding()
        }
        .frame(minWidth: 600, minHeight: 400)
    }
}
