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

    @StateObject private var webState = QuipslyWebViewState()
    @State private var reloadToken = 0

    var body: some View {
        VStack(spacing: 0) {
            toolbar
            Divider()

            ZStack(alignment: .top) {
                QuipslyWebView(url: url, reloadToken: reloadToken, state: webState)

                if showsSessionGuidance, let guidance = webState.sessionGuidance {
                    sessionGuidanceBanner(guidance)
                        .padding()
                }
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
                webState.reload()
            } label: {
                Label("Reload", systemImage: "arrow.clockwise")
            }

            Button {
                NestSessionActions.openExternalLogin(
                    nestBaseURL: url.absoluteString,
                    callbackPath: NestSessionActions.callbackPath(for: webState.currentURL ?? url)
                )
            } label: {
                Label("Sign in in Browser", systemImage: "safari")
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
            Button("Sign in in browser") {
                NestSessionActions.openExternalLogin(
                    nestBaseURL: url.absoluteString,
                    callbackPath: NestSessionActions.callbackPath(for: webState.currentURL ?? url)
                )
            }
            Button("Browser fallback") {
                NestSessionActions.openExternalLogin(
                    nestBaseURL: url.absoluteString,
                    callbackPath: NestSessionActions.callbackPath(for: webState.currentURL ?? url)
                )
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(radius: 10, y: 4)
    }
}

struct QuipslyWebView: NSViewRepresentable {
    let url: URL
    let reloadToken: Int
    @ObservedObject var state: QuipslyWebViewState

    func makeCoordinator() -> Coordinator {
        Coordinator(state: state)
    }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        state.webView = webView
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.state = state

        if context.coordinator.loadedURL != url || context.coordinator.reloadToken != reloadToken {
            context.coordinator.loadedURL = url
            context.coordinator.reloadToken = reloadToken
            webView.load(URLRequest(url: url))
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

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var state: QuipslyWebViewState
        var loadedURL: URL?
        var reloadToken = -1

        init(state: QuipslyWebViewState) {
            self.state = state
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
        return "Sign in inside this Mac window first. Native Mac actions reuse this embedded Nest session for chat, imports, sync, and draft staging."
    }

    if absolute.contains("accounts.google.com") {
        return "Google is asking for authentication. Finish the flow here so the Mac app can reuse the same Nest session."
    }

    if title.contains("unauthorized") || title.contains("forbidden") {
        return "This account may not have access to the selected Nest or episode. Check the project slug, episode slug, and collaborator permissions."
    }

    return nil
}
