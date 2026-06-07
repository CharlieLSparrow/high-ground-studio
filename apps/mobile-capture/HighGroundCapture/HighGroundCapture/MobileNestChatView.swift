import SwiftUI
import WebKit

struct MobileNestChatView: View {
    @StateObject private var client = NestChatClient()
    @State private var baseURL = "https://nest.quipsly.com"
    @State private var projectSlug = "high-ground-odyssey-manuscript"
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                configStrip

                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            ForEach(client.messages) { message in
                                MobileNestChatMessageCard(message: message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: client.messages.count) {
                        if let last = client.messages.last {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }

                composer
            }
            .background(MobileStudioBackground())
            .navigationTitle("Nest Chat")
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Link(destination: URL(string: "\(baseURL)/projects") ?? URL(string: "https://nest.quipsly.com/projects")!) {
                        Label("Open Nest", systemImage: "safari")
                    }

                    Button {
                        Task { await client.load(baseURL: baseURL, projectSlug: projectSlug) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                }
            }
            .task {
                await client.load(baseURL: baseURL, projectSlug: projectSlug)
            }
        }
    }

    private var configStrip: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(client.projectName.isEmpty ? projectSlug : client.projectName)
                .font(.headline)

            HStack {
                TextField("Nest URL", text: $baseURL)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                TextField("Project", text: $projectSlug)
                    .textInputAutocapitalization(.never)
            }
            .textFieldStyle(.roundedBorder)

            HStack {
                Label(client.status, systemImage: client.errorMessage == nil ? "checkmark.circle" : "exclamationmark.triangle")
                    .foregroundStyle(client.errorMessage == nil ? .green : .orange)
                if let errorMessage = client.errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            .font(.caption)
        }
        .padding()
        .background(.regularMaterial)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Paste a GIF URL or write a note.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(alignment: .bottom) {
                TextEditor(text: $draft)
                    .frame(minHeight: 72, maxHeight: 110)
                    .padding(4)
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))

                Button {
                    Task {
                        let message = draft
                        draft = ""
                        await client.send(baseURL: baseURL, projectSlug: projectSlug, body: message)
                    }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
        .background(.ultraThinMaterial)
    }
}

private struct MobileNestChatMessageCard: View {
    let message: NestChatMessage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(message.authorName ?? message.authorEmail ?? "Quipsly friend")
                    .font(.headline)
                Spacer()
                Text(message.createdAt)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            if !message.body.isEmpty {
                Text(message.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if let gifUrl = message.gifUrl, let url = URL(string: gifUrl) {
                MobileAnimatedGIFWebView(url: url)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct MobileAnimatedGIFWebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = """
        <html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
        img { width: 100%; height: 100%; object-fit: contain; border-radius: 16px; }
        </style></head><body><img src="\(url.absoluteString)"></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}
