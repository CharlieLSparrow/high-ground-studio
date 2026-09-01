//
//  HighGroundCaptureApp.swift
//  HighGroundCapture
//
//  Created by Charlie on 5/29/26.
//

import SwiftUI

@main
struct HighGroundCaptureApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var audioCapture = AudioCaptureController()
    @StateObject private var videoCapture = VideoCaptureController()
    @StateObject private var deepLinkRouter = CaptureDeepLinkRouter.shared

    init() {
        AuthManager.configureRuntimeSmokeAccountResetIfRequested()
        AuthManager.configureShareExtensionUITestOwnerIfRequested()
        // The DEBUG runtime link is a launch argument, not a UIKit URL event.
        // Capture it before authentication can replace the root shell; a
        // SwiftUI task attached to that transition can be legitimately
        // cancelled and would make the operated app-link proof nondeterministic.
        CaptureDeepLinkRouter.shared.receiveConfiguredLaunchLinkIfNeeded()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioCapture)
                .environmentObject(videoCapture)
                .environmentObject(deepLinkRouter)
                .onOpenURL { url in
                    deepLinkRouter.receive(url)
                }
                .task {
                    await OnDeviceTranscriptManager.shared.resumeEligibleRecordings(
                        retryFailures: true
                    )
                }
                .onChange(of: scenePhase) { _, phase in
                    switch phase {
                    case .active:
                        // iOS remembers permission choices in Settings while
                        // Quipsly is backgrounded. Refresh the live controller
                        // on return so the recorder immediately leaves its
                        // stale denied state without another setup ritual.
                        audioCapture.refreshReadinessSnapshot()
                        Task {
                            await OnDeviceTranscriptManager.shared.resumeEligibleRecordings(
                                retryFailures: true
                            )
                        }
                    case .background:
                        if OnDeviceTranscriptManager.shared.hasPendingEligibleWork() {
                            OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
                        }
                    case .inactive:
                        break
                    @unknown default:
                        break
                    }
                }
                .onReceive(
                    NotificationCenter.default.publisher(
                        for: .quipslyCaptureAccountIdentityDidChange
                    )
                ) { _ in
                    Task {
                        // LocalRecordingLibrary intentionally publishes the
                        // new account partition on the next run-loop turn.
                        await Task.yield()
                        await OnDeviceTranscriptManager.shared.resumeEligibleRecordings(
                            retryFailures: true
                        )
                    }
                }
        }
    }
}
