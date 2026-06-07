import Foundation

@MainActor
final class NestChatClient: ObservableObject {
    @Published var messages: [NestChatMessage] = []
    @Published var projectName = ""
    @Published var threadTitle = "Nest Chat"
    @Published var status = "Idle"
    @Published var errorMessage: String?

    func load(baseURL: String, projectSlug: String) async {
        guard let url = endpoint(baseURL: baseURL, projectSlug: projectSlug) else {
            errorMessage = "Nest URL is not valid."
            return
        }

        status = "Loading"
        errorMessage = nil

        do {
            let request = await NestCookieBridge.addingCookies(to: URLRequest(url: url))
            let (data, response) = try await URLSession.shared.data(for: request)
            let payload = try JSONDecoder().decode(NestChatLoadResponse.self, from: data)
            guard let http = response as? HTTPURLResponse, http.statusCode < 400, payload.ok else {
                throw NSError(domain: "NestChat", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: payload.error ?? "Nest chat could not load."
                ])
            }

            messages = payload.messages ?? []
            projectName = payload.project?.name ?? projectSlug
            threadTitle = payload.thread?.title ?? "Nest Chat"
            status = "Ready"
        } catch {
            errorMessage = error.localizedDescription
            status = "Needs login"
        }
    }

    func send(baseURL: String, projectSlug: String, body: String) async {
        guard let url = endpoint(baseURL: baseURL, projectSlug: projectSlug) else {
            errorMessage = "Nest URL is not valid."
            return
        }

        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        status = "Sending"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "projectSlug": projectSlug,
                "body": trimmed,
            ])

            let authenticatedRequest = await NestCookieBridge.addingCookies(to: request)
            let (data, response) = try await URLSession.shared.data(for: authenticatedRequest)
            let payload = try JSONDecoder().decode(NestChatPostResponse.self, from: data)
            guard let http = response as? HTTPURLResponse, http.statusCode < 400, payload.ok, let message = payload.message else {
                throw NSError(domain: "NestChat", code: 2, userInfo: [
                    NSLocalizedDescriptionKey: payload.error ?? "Message could not send."
                ])
            }

            messages.append(message)
            status = "Ready"
        } catch {
            errorMessage = error.localizedDescription
            status = "Needs login"
        }
    }

    private func endpoint(baseURL: String, projectSlug: String) -> URL? {
        guard var components = URLComponents(string: baseURL) else { return nil }
        components.path = "/api/nest-chat"
        components.queryItems = [
            URLQueryItem(name: "projectSlug", value: projectSlug.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        ]
        return components.url
    }
}
