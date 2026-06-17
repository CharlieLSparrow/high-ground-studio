import Foundation

enum NestRouteBuilder {
    static func route(baseURL: String, path: String, queryItems: [URLQueryItem] = []) -> URL {
        let fallback = "https://nest.quipsly.com"
        let safeBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : baseURL
        var components = URLComponents(string: safeBase) ?? URLComponents(string: fallback)!
        components.path = path
        components.queryItems = queryItems.isEmpty ? nil : queryItems
        return components.url ?? URL(string: "\(fallback)\(path)")!
    }

    static func projects(baseURL: String) -> URL {
        route(baseURL: baseURL, path: "/projects")
    }

    static func adminUsers(baseURL: String) -> URL {
        route(baseURL: baseURL, path: "/admin/users")
    }

    static func nestAccess(baseURL: String, projectSlug: String) -> URL {
        route(
            baseURL: baseURL,
            path: "/nests/\(normalizedSlug(projectSlug, fallback: "high-ground-odyssey-manuscript"))/access"
        )
    }

    static func create(baseURL: String, projectSlug: String, publisher: Bool = true) -> URL {
        var items = [
            URLQueryItem(name: "project", value: normalizedSlug(projectSlug, fallback: "high-ground-odyssey-manuscript")),
        ]

        if publisher {
            items.append(URLQueryItem(name: "publisher", value: "1"))
        }

        return route(baseURL: baseURL, path: "/create", queryItems: items)
    }

    static func editor(baseURL: String, projectSlug: String, episodeSlug: String) -> URL {
        route(
            baseURL: baseURL,
            path: "/editor",
            queryItems: [
                URLQueryItem(name: "project", value: normalizedSlug(projectSlug, fallback: "high-ground-odyssey-manuscript")),
                URLQueryItem(name: "episode", value: normalizedSlug(episodeSlug, fallback: "episode-4")),
            ]
        )
    }

    static func chat(baseURL: String, projectSlug: String) -> URL {
        route(
            baseURL: baseURL,
            path: "/projects",
            queryItems: [
                URLQueryItem(name: "project", value: normalizedSlug(projectSlug, fallback: "high-ground-odyssey-manuscript")),
                URLQueryItem(name: "open", value: "chat"),
            ]
        )
    }

    private static func normalizedSlug(_ value: String, fallback: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? fallback : trimmed
    }
}
