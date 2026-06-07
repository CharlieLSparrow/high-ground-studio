import SwiftUI
import WebKit

struct NestChatView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var client = NestChatClient()
    @State private var draft = ""

    var body: some View {
        VStack(spacing: 0) {
            header

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        ForEach(client.messages) { message in
                            NestChatMessageCard(message: message)
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
        .task {
            await client.load(baseURL: appState.nestURL, projectSlug: appState.nestChatProjectSlug)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Nest Chat")
                        .font(.largeTitle.bold())
                    Text(client.projectName.isEmpty ? appState.nestChatProjectSlug : client.projectName)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                Link("Open Nest", destination: URL(string: appState.nestURL) ?? URL(string: "https://nest.quipsly.com/projects")!)

                Button {
                    Task {
                        await client.load(baseURL: appState.nestURL, projectSlug: appState.nestChatProjectSlug)
                    }
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
            }

            HStack {
                Label(client.status, systemImage: client.errorMessage == nil ? "checkmark.circle" : "exclamationmark.triangle")
                    .foregroundStyle(client.errorMessage == nil ? .green : .orange)
                if let errorMessage = client.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                if client.status == "Needs login" {
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label("Sign in to Nest", systemImage: "person.crop.circle.badge.checkmark")
                    }
                }
            }
            .font(.caption)
        }
        .padding()
        .background(.bar)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Paste a GIF URL or write a note. Cmd+Return sends.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack(alignment: .bottom) {
                TextEditor(text: $draft)
                    .font(.body)
                    .frame(minHeight: 84, maxHeight: 120)
                    .overlay {
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(.quaternary)
                    }

                Button {
                    Task {
                        let message = draft
                        draft = ""
                        await client.send(baseURL: appState.nestURL, projectSlug: appState.nestChatProjectSlug, body: message)
                    }
                } label: {
                    Label("Send", systemImage: "paperplane.fill")
                }
                .buttonStyle(.borderedProminent)
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .keyboardShortcut(.return, modifiers: [.command])
            }
        }
        .padding()
        .background(.regularMaterial)
    }
}

private struct NestChatMessageCard: View {
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
                    .textSelection(.enabled)
            }

            if let gifUrl = message.gifUrl, let url = URL(string: gifUrl) {
                AnimatedGIFWebView(url: url)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct AnimatedGIFWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let webView = WKWebView()
        webView.setValue(false, forKey: "drawsBackground")
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        let html = """
        <html><head><style>
        html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
        img { width: 100%; height: 100%; object-fit: contain; border-radius: 16px; }
        </style></head><body><img src="\(url.absoluteString)"></body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}
