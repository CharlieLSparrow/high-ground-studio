import SwiftUI

struct NativePublishingView: View {
    @StateObject private var publishClient = PublishingNetworkClient()

    @State private var title: String = ""
    @State private var description: String = ""
    @State private var tagsString: String = ""

    @State private var publishToYouTube: Bool = true
    @State private var publishToPatreon: Bool = false

    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Video Metadata").foregroundColor(.gray)) {
                    TextField("Title", text: $title)
                        .accessibilityIdentifier("PublishTitle")

                    TextEditor(text: $description)
                        .frame(height: 100)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.gray.opacity(0.2), lineWidth: 1)
                        )
                        .accessibilityIdentifier("PublishDescription")

                    TextField("Tags (comma separated)", text: $tagsString)
                        .accessibilityIdentifier("PublishTags")
                }
                .listRowBackground(Color.white.opacity(0.05))

                Section(header: Text("Destinations").foregroundColor(.gray)) {
                    Toggle(isOn: $publishToYouTube) {
                        HStack {
                            Image(systemName: "play.rectangle.fill")
                                .foregroundColor(.red)
                            Text("YouTube")
                        }
                    }
                    .accessibilityIdentifier("ToggleYouTube")

                    Toggle(isOn: $publishToPatreon) {
                        HStack {
                            Image(systemName: "p.square.fill")
                                .foregroundColor(.orange)
                            Text("Patreon")
                        }
                    }
                    .accessibilityIdentifier("TogglePatreon")
                }
                .listRowBackground(Color.white.opacity(0.05))

                Section {
                    Button(action: {
                        let tags = tagsString.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
                        var destinations: [String] = []
                        if publishToYouTube { destinations.append("youtube") }
                        if publishToPatreon { destinations.append("patreon") }

                        let packet = PublicPublishPacket(
                            title: title,
                            description: description,
                            tags: tags,
                            destinations: destinations,
                            mediaAssetId: "export_12345" // Normally from the TimelineState/ExportManager
                        )

                        publishClient.publishPacket(packet)
                    }) {
                        HStack {
                            Spacer()
                            if publishClient.isPublishing {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            } else {
                                Text("Publish to Cloud")
                                    .fontWeight(.bold)
                            }
                            Spacer()
                        }
                    }
                    .disabled(publishClient.isPublishing || title.isEmpty)
                    .accessibilityIdentifier("PublishButton")
                    .listRowBackground(publishClient.isPublishing || title.isEmpty ? Color.gray : Color(red: 0.85, green: 0.71, blue: 0.47))
                    .foregroundColor(publishClient.isPublishing || title.isEmpty ? .white : .black)
                }

                if let status = publishClient.publishStatus {
                    Section {
                        Text(status)
                            .foregroundColor(.green)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                    .listRowBackground(Color.clear)
                }

                if let error = publishClient.publishError {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: .infinity)
                    }
                    .listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Publishing Desk")
            .navigationBarTitleDisplayMode(.inline)
            .background(Color(red: 0.05, green: 0.05, blue: 0.05).ignoresSafeArea())
            .onAppear {
                // To style the form background
                UITableView.appearance().backgroundColor = .clear
            }
        }
        .preferredColorScheme(.dark)
    }
}

#Preview {
    NativePublishingView()
}
