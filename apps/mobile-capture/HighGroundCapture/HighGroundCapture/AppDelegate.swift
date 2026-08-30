import UIKit
import GoogleSignIn

final class AppDelegate: NSObject, UIApplicationDelegate {

    // Store the completion handler for background URL session events
    private var backgroundSessionCompletionHandler: (() -> Void)?
    private var backgroundSessionEventsFinishedAt: Date?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        OnDeviceTranscriptBackgroundCoordinator.shared.register()
        // Create the background URLSession during launch even when SwiftUI does
        // not visit upload UI, then reconcile daemon-owned tasks with the ledger.
        DispatchQueue.main.async {
            UploadManager.shared.prepareForBackgroundEvents()
        }
        return true
    }

    func application(
        _ application: UIApplication,
        configurationForConnecting connectingSceneSession: UISceneSession,
        options: UIScene.ConnectionOptions
    ) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(
            name: nil,
            sessionRole: connectingSceneSession.role
        )
        // SwiftUI still owns the WindowGroup. This narrow scene delegate only
        // receives Home Screen quick actions, which UIKit does not deliver to
        // UIApplicationDelegate for a scene-based app.
        configuration.delegateClass = CaptureSceneDelegate.self
        return configuration
    }

    func application(
        _ application: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        if GIDSignIn.sharedInstance.handle(url) {
            return true
        }

        // Keep Quipsly's own deep-link surface independent from Google OAuth.
        // Returning false lets SwiftUI continue routing any URL that Google did
        // not claim.
        return false
    }

    func application(
        _ application: UIApplication,
        handleEventsForBackgroundURLSession identifier: String,
        completionHandler: @escaping () -> Void
    ) {
        // When iOS wakes the app because a background upload finished, retain
        // the closure until URLSession has delivered every delegate callback.
        if identifier == UploadManager.backgroundSessionIdentifier {
            if let finishedAt = backgroundSessionEventsFinishedAt,
               Date().timeIntervalSince(finishedAt) < 10 {
                backgroundSessionEventsFinishedAt = nil
                completionHandler()
            } else {
                backgroundSessionEventsFinishedAt = nil
                let previousCompletionHandler = backgroundSessionCompletionHandler
                backgroundSessionCompletionHandler = {
                    previousCompletionHandler?()
                    completionHandler()
                }
            }
            UploadManager.shared.prepareForBackgroundEvents()
        } else {
            completionHandler()
        }
    }

    func uploadManagerDidFinishBackgroundSessionEvents() {
        if let completionHandler = backgroundSessionCompletionHandler {
            backgroundSessionCompletionHandler = nil
            completionHandler()
        } else {
            // A background URLSession can reconnect during launch just before
            // UIKit supplies its wake completion closure. Keep only a short-lived
            // marker so a later, unrelated wake can never consume stale state.
            backgroundSessionEventsFinishedAt = Date()
        }
    }
}

@MainActor
final class CaptureSceneDelegate: NSObject, UIWindowSceneDelegate {
    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let shortcutItem = connectionOptions.shortcutItem else { return }
        _ = CaptureHomeScreenQuickAction.handle(shortcutItem)
    }

    func windowScene(
        _ windowScene: UIWindowScene,
        performActionFor shortcutItem: UIApplicationShortcutItem,
        completionHandler: @escaping (Bool) -> Void
    ) {
        completionHandler(CaptureHomeScreenQuickAction.handle(shortcutItem))
    }
}

enum CaptureHomeScreenQuickAction {
    static let speakToWriteType = "com.highgroundodyssey.HighGroundCapture.speak-to-write"

    @MainActor
    @discardableResult
    static func handle(_ shortcutItem: UIApplicationShortcutItem) -> Bool {
        guard shortcutItem.type == speakToWriteType else { return false }
        CaptureDeepLinkRouter.shared.requestVoiceNote()
        return true
    }
}
