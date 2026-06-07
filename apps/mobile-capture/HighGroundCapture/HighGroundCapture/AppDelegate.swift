import UIKit
import SwiftUI

class AppDelegate: NSObject, UIApplicationDelegate {

    // Store the completion handler for background URL session events
    var backgroundSessionCompletionHandler: (() -> Void)?

    func application(_ application: UIApplication,
                     handleEventsForBackgroundURLSession identifier: String,
                     completionHandler: @escaping () -> Void) {

        // When the OS wakes us up because a background upload finished, we store the closure.
        // We will call it after URLSession finishes delivering all delegate callbacks.
        if identifier == "com.quipsly.upload" {
            backgroundSessionCompletionHandler = completionHandler
        } else {
            completionHandler()
        }
    }
}
