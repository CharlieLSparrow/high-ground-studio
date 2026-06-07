import SwiftUI
import WebKit

// Weak wrapper to prevent WKScriptMessageHandler from retaining the Coordinator
class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(_ delegate: WKScriptMessageHandler) {
        self.delegate = delegate
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

struct HybridWebView: UIViewRepresentable {
    let url: URL
    private let recorderController = AudioCaptureController()

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        let userContentController = WKUserContentController()

        // Pass the weak wrapper instead of context.coordinator directly to avoid memory leaks
        userContentController.add(WeakScriptMessageHandler(context.coordinator), name: "recorderControl")
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator

        // Disable pinch to zoom and scroll bouncing for app-like feel
        webView.scrollView.bounces = false
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.isOpaque = false
        webView.backgroundColor = .clear

        recorderController.onStateChange = { [weak webView] event in
            guard let webView = webView else { return }
            do {
                let jsonData = try JSONEncoder().encode(event)
                if let jsonString = String(data: jsonData, encoding: .utf8) {
                    let jsCode = "window.dispatchEvent(new CustomEvent('nativeRecorderState', { detail: \(jsonString) }));"
                    DispatchQueue.main.async {
                        webView.evaluateJavaScript(jsCode, completionHandler: nil)
                    }
                }
            } catch {
                print("Failed to encode RecorderEvent: \(error)")
            }
        }

        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        let request = URLRequest(url: url)
        uiView.load(request)
    }

    // Clean up the message handler when the view is dismantled
    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        uiView.configuration.userContentController.removeScriptMessageHandler(forName: "recorderControl")
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self, recorderController: recorderController)
    }

    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var parent: HybridWebView
        var recorderController: AudioCaptureController

        init(_ parent: HybridWebView, recorderController: AudioCaptureController) {
            self.parent = parent
            self.recorderController = recorderController
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "recorderControl", let dict = message.body as? [String: Any] {
                do {
                    let jsonData = try JSONSerialization.data(withJSONObject: dict, options: [])
                    let command = try JSONDecoder().decode(RecorderCommand.self, from: jsonData)
                    recorderController.handleCommand(command)
                } catch {
                    print("Failed to parse recorder command: \(error)")
                }
            }
        }
    }
}
