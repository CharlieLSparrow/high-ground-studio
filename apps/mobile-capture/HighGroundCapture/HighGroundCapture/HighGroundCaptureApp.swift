//
//  HighGroundCaptureApp.swift
//  HighGroundCapture
//
//  Created by Charlie on 5/29/26.
//

import SwiftUI

@main
struct HighGroundCaptureApp: App {
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
        }
    }
}
