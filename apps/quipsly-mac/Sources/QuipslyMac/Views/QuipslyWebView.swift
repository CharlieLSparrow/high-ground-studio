import AppKit
import SwiftUI
import WebKit

final class QuipslyWebViewState: ObservableObject {
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var isLoading = false
    @Published var currentURL: URL?
    @Published var pageTitle = ""
    @Published var sessionGuidance: String?
    @Published var webPlayhead: Double?

    fileprivate weak var webView: WKWebView?

    func reload() {
        webView?.reload()
    }

    func goBack() {
        guard webView?.canGoBack == true else { return }
        webView?.goBack()
    }

    func goForward() {
        guard webView?.canGoForward == true else { return }
        webView?.goForward()
    }

    func openExternal() {
        guard let url = currentURL else { return }
        NSWorkspace.shared.open(url)
    }

    func load(_ url: URL) {
        webView?.load(URLRequest(url: url))
    }
}

struct QuipslyWebRouteView: View {
    let url: URL
    var title: String
    var subtitle: String
    var showsSessionGuidance = true
    var useMacWebSession = true
    var onPlayheadUpdate: ((Double) -> Void)? = nil

    @EnvironmentObject private var appState: AppState
    @StateObject private var webState = QuipslyWebViewState()
    @State private var reloadToken = 0

    private var hasConnectedNestProfile: Bool {
        !appState.activeNestSessionProfileEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && NestSessionTokenStore.accessTokenLooksFresh(NestSessionTokenStore.activeProfile(), skewSeconds: 0)
    }

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()

            ZStack(alignment: .top) {
                QuipslyWebView(
                    url: url,
                    reloadToken: reloadToken,
                    state: webState,
                    appState: appState,
                    useMacWebSession: useMacWebSession
                )

                if showsSessionGuidance, let guidance = webState.sessionGuidance {
                    sessionGuidanceBanner(guidance)
                        .padding()
                }
            }
        }
        .onChange(of: webState.webPlayhead) { newValue in
            if let newValue {
                onPlayheadUpdate?(newValue)
            }
        }
    }

    private var toolbar: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.headline)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            Button {
                webState.goBack()
            } label: {
                Label("Back", systemImage: "chevron.left")
            }
            .disabled(!webState.canGoBack)

            Button {
                webState.goForward()
            } label: {
                Label("Forward", systemImage: "chevron.right")
            }
            .disabled(!webState.canGoForward)

            Button {
                reloadToken += 1
            } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }

            if useMacWebSession {
                Button {
                    if hasConnectedNestProfile {
                        reloadToken += 1
                    } else {
                        signInWithBrowser()
                    }
                } label: {
                    Label(hasConnectedNestProfile ? "Connect Mac Session" : "Sign in with Browser", systemImage: hasConnectedNestProfile ? "person.badge.key.fill" : "safari")
                }
            }

            Button {
                webState.openExternal()
            } label: {
                Label("Open in Browser", systemImage: "safari")
            }
            .disabled(webState.currentURL == nil)

            if webState.isLoading {
                ProgressView()
                    .controlSize(.small)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private func sessionGuidanceBanner(_ guidance: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "person.crop.circle.badge.exclamationmark")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 4) {
                Text("Nest session needs attention")
                    .font(.headline)
                Text(guidance)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Open Nest Session") {
                appState.selectedSection = .nestSession
            }
            Button(hasConnectedNestProfile ? "Connect Mac Session" : "Sign in with browser") {
                if hasConnectedNestProfile {
                    reloadToken += 1
                } else {
                    signInWithBrowser()
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(radius: 10, y: 4)
    }

    private func signInWithBrowser() {
        let state = appState.beginNestNativeAuthState()
        let deviceLabel = Host.current().localizedName ?? "Quipsly Mac"
        NSWorkspace.shared.open(
            NestSessionActions.nativeHandoffURL(
                nestBaseURL: appState.nestURL,
                state: state,
                deviceLabel: deviceLabel
            )
        )
        appState.selectedSection = .nestSession
        appState.lastMacCallbackDiagnosticLabel = "Browser sign-in opened from the embedded editor. Approve Open Quipsly Mac if macOS asks."
    }
}

struct QuipslyWebView: NSViewRepresentable {
    let url: URL
    let reloadToken: Int
    @ObservedObject var state: QuipslyWebViewState
    @ObservedObject var appState: AppState
    let useMacWebSession: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(state: state)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let contentController = WKUserContentController()
        contentController.add(context.coordinator, name: "quipslyMacBridge")
        configuration.userContentController = contentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        state.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.state = state

        let sessionProfileKey = useMacWebSession ? appState.activeNestSessionProfileEmail : ""

        if
            context.coordinator.loadedURL != url ||
            context.coordinator.reloadToken != reloadToken ||
            context.coordinator.sessionProfileKey != sessionProfileKey
        {
            context.coordinator.loadedURL = url
            context.coordinator.reloadToken = reloadToken
            context.coordinator.sessionProfileKey = sessionProfileKey
            context.coordinator.load(
                url,
                in: webView,
                appState: appState,
                useMacWebSession: useMacWebSession
            )
            updateState(from: webView)
        }
    }

    private func updateState(from webView: WKWebView) {
        state.webView = webView
        state.canGoBack = webView.canGoBack
        state.canGoForward = webView.canGoForward
        state.currentURL = webView.url
        state.pageTitle = webView.title ?? ""
        state.isLoading = webView.isLoading
        state.sessionGuidance = sessionGuidance(for: webView.url, title: webView.title)
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        var state: QuipslyWebViewState
        var loadedURL: URL?
        var reloadToken = -1
        var sessionProfileKey = ""
        private var activeBootstrapKey = ""

        init(state: QuipslyWebViewState) {
            self.state = state
        }

        @MainActor
        func load(_ targetURL: URL, in webView: WKWebView, appState: AppState, useMacWebSession: Bool) {
            guard useMacWebSession else {
                webView.load(URLRequest(url: targetURL))
                return
            }

            let key = "\(targetURL.absoluteString)|\(reloadToken)|\(appState.activeNestSessionProfileEmail)"
            activeBootstrapKey = key
            state.sessionGuidance = "Preparing a secure Mac web session for this editor route."

            Task { @MainActor [weak webView] in
                guard let webView else { return }
                let refreshed = await appState.refreshActiveNestSessionIfNeeded()
                guard refreshed else {
                    self.state.sessionGuidance = "Open Nest Session, connect a profile, then reload this editor. The embedded editor needs a Mac web session cookie."
                    return
                }

                do {
                    let returnTo = NestSessionActions.callbackPath(for: targetURL)
                    let loginURL = try await NestSessionExchangeClient.webSessionLoginURL(
                        nestBaseURL: appState.nestURL,
                        returnTo: returnTo
                    )
                    guard self.activeBootstrapKey == key else { return }
                    webView.load(URLRequest(url: loginURL))
                } catch {
                    guard self.activeBootstrapKey == key else { return }
                    self.state.sessionGuidance = "Quipsly Mac could not prepare the embedded editor session: \(error.localizedDescription)"
                }
            }
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "quipslyMacBridge", let body = message.body as? [String: Any] else { return }
            if let event = body["event"] as? String {
                if event == "playhead_update", let time = body["time"] as? Double {
                    state.webPlayhead = time
                }
            }
        }

        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
            updateState(from: webView)
        }

        func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
            updateState(from: webView)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            updateState(from: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            updateState(from: webView)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            updateState(from: webView)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
                webView.load(URLRequest(url: url))
            }
            return nil
        }

        private func updateState(from webView: WKWebView) {
            state.webView = webView
            state.canGoBack = webView.canGoBack
            state.canGoForward = webView.canGoForward
            state.currentURL = webView.url
            state.pageTitle = webView.title ?? ""
            state.isLoading = webView.isLoading
            state.sessionGuidance = sessionGuidance(for: webView.url, title: webView.title)
        }
    }
}

private func sessionGuidance(for url: URL?, title: String?) -> String? {
    let absolute = url?.absoluteString.lowercased() ?? ""
    let title = title?.lowercased() ?? ""

    if absolute.contains("/api/auth/signin") || absolute.contains("/login") || title.contains("sign in") {
        return "Connect a Mac Nest profile first. Use Nest Session or Sign in with browser; the embedded editor receives a short-lived web session from the native Mac profile."
    }

    if absolute.contains("accounts.google.com") {
        return "Google is asking for authentication. If this embedded page is stubborn, use Connect Mac Session so Google sign-in happens in your normal browser and returns to Quipsly Mac."
    }

    if title.contains("unauthorized") || title.contains("forbidden") {
        return "This account may not have access to the selected Nest or episode. Check the project slug, episode slug, and collaborator permissions."
    }

    return nil
}
