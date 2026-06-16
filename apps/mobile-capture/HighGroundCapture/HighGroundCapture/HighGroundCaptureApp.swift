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

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(audioCapture)
        }
    }
}
