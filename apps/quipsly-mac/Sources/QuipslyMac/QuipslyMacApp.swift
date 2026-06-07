import SwiftUI

@main
struct QuipslyMacApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 1120, minHeight: 720)
        }
        .windowStyle(.hiddenTitleBar)
    }
}
