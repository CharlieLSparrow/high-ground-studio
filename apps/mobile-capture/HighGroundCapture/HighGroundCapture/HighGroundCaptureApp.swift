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

    init() {
        AuthManager.configureRuntimeSmokeAccountResetIfRequested()
        AuthManager.configureShareExtensionUITestOwnerIfRequested()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioCapture)
                .environmentObject(videoCapture)
        }
    }
}
