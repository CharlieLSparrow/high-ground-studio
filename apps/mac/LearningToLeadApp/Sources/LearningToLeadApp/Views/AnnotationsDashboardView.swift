import SwiftUI

struct AnnotationsDashboardView: View {
    @EnvironmentObject var viewModel: DocumentViewModel
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Annotations Dashboard")
                .font(.largeTitle)
                .bold()
                .padding([.top, .leading, .trailing])
            
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    let allParagraphsWithAnnotations = viewModel.paragraphs.filter { !$0.annotations.isEmpty }
                    
                    if allParagraphsWithAnnotations.isEmpty {
                        Text("No annotations found. Add some in the Main Editor.")
                            .foregroundColor(.secondary)
                            .padding()
                    } else {
                        ForEach(allParagraphsWithAnnotations) { paragraph in
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Paragraph ID: \(paragraph.id)")
                                    .font(.caption)
                                    .bold()
                                    .foregroundColor(.secondary)
                                
                                let textPreview = String(paragraph.text.prefix(100)) + (paragraph.text.count > 100 ? "..." : "")
                                Text(textPreview)
                                    .font(.caption)
                                    .italic()
                                    .padding(.bottom, 4)
                                
                                ForEach(paragraph.annotations) { annotation in
                                    HStack(alignment: .top) {
                                        Text(annotation.author + ":")
                                            .font(.subheadline)
                                            .bold()
                                            .foregroundColor(.orange)
                                        Text(annotation.text)
                                            .font(.subheadline)
                                    }
                                    .padding(8)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(Color.orange.opacity(0.1))
                                    .cornerRadius(6)
                                }
                            }
                            .padding()
                            .background(Color.secondary.opacity(0.05))
                            .cornerRadius(8)
                        }
                    }
                }
                .padding()
            }
        }
    }
}
