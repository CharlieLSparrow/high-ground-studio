import SwiftUI
import QuipslyVideoCore

@main
struct QuipslyVideoiOSApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "film")
                .font(.system(size: 64))
                .foregroundStyle(.blue)
            
            Text("Quipsly Video Studio (iOS)")
                .font(.title)
                .bold()
                .multilineTextAlignment(.center)
        }
        .padding()
    }
}
