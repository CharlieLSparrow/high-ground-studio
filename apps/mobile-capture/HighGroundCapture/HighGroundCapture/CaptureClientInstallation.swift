import Foundation

enum CaptureClientInstallation {
    private static let key = "quipsly.capture.client-instance-id.v1"

    static var id: String {
        if let existing = UserDefaults.standard.string(forKey: key)?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           existing.hasPrefix("ios-") {
            return existing.lowercased()
        }
        let created = "ios-\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(created, forKey: key)
        return created
    }
}
