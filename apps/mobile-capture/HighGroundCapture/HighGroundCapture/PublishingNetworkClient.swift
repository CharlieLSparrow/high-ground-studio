import Foundation
import Combine

struct PublicPublishPacket: Codable {
    var title: String
    var description: String
    var tags: [String]
    var destinations: [String] // e.g., ["youtube", "patreon"]
    var mediaAssetId: String
}

class PublishingNetworkClient: ObservableObject {
    @Published var isPublishing = false
    @Published var publishStatus: String?
    @Published var publishError: String?

    private let publishApiUrl = URL(string: "https://studio-hm2odnvjga-uc.a.run.app/api/handoff/publish")!

    func publishPacket(_ packet: PublicPublishPacket) {
        guard !isPublishing else { return }

        isPublishing = true
        publishStatus = "Preparing payload..."
        publishError = nil

        var request = URLRequest(url: publishApiUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // Note: In a real implementation, we would attach an Authorization header here.

        do {
            let data = try JSONEncoder().encode(packet)
            request.httpBody = data
        } catch {
            self.publishError = "Failed to encode packet: \(error.localizedDescription)"
            self.isPublishing = false
            return
        }

        self.publishStatus = "Sending to Quipsly Cloud..."

        // Simulate network delay for prototype
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            // Uncomment the URLSession block for real backend communication
            /*
            let task = URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
                DispatchQueue.main.async {
                    self?.isPublishing = false

                    if let error = error {
                        self?.publishError = "Network error: \(error.localizedDescription)"
                        return
                    }

                    if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                        self?.publishError = "Server returned error code: \(httpResponse.statusCode)"
                        return
                    }

                    self?.publishStatus = "Successfully dispatched to Cloud Worker!"
                }
            }
            task.resume()
            */

            // Simulated Success:
            self.isPublishing = false
            self.publishStatus = "Successfully dispatched to Quipsly Cloud for background rendering & upload!"
        }
    }
}
