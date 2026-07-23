import Foundation
import Combine

struct MobileWorkspace: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let projects: [MobileProject]
}

struct MobileProject: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let episodes: [MobileEpisode]
}

struct MobileEpisode: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let status: String
}

struct MobileContextResponse: Codable {
    let ok: Bool
    let user: MobileUser?
    let workspaces: [MobileWorkspace]?
}

struct MobileUser: Codable {
    let id: String
    let name: String?
    let email: String
}

@MainActor
final class MobileContextManager: ObservableObject {
    static let shared = MobileContextManager()
    
    @Published var workspaces: [MobileWorkspace] = []
    @Published var selectedWorkspaceId: String?
    @Published var selectedProjectId: String?
    @Published var selectedEpisodeId: String?
    
    @Published var isLoading = false
    @Published var errorMessage: String?
    
    private let authUrlBase = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
    
    private init() {}
    
    func fetchContext() async {
        guard AuthManager.currentStoredOwnerID() != nil else {
            self.errorMessage = "Not signed in."
            return
        }
        
        self.isLoading = true
        self.errorMessage = nil
        
        do {
            guard let url = URL(string: "\(authUrlBase)/api/mac/mobile-context") else {
                throw URLError(.badURL)
            }
            
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw NSError(
                    domain: "MobileContext",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: "Context request failed with HTTP \(response.statusCode)."]
                )
            }
            
            let payload = try JSONDecoder().decode(MobileContextResponse.self, from: data)
            if !payload.ok {
                throw NSError(domain: "MobileContext", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to load context."])
            }
            
            self.workspaces = payload.workspaces ?? []
            
            // Auto-select if there's only one option
            if let firstWs = workspaces.first, selectedWorkspaceId == nil {
                selectedWorkspaceId = firstWs.id
                if let firstProj = firstWs.projects.first, selectedProjectId == nil {
                    selectedProjectId = firstProj.id
                }
            }
            
        } catch {
            self.errorMessage = error.localizedDescription
        }
        
        self.isLoading = false
    }
    
    func getTargetSlugs() -> (projectSlug: String?, episodeSlug: String?) {
        guard let wsId = selectedWorkspaceId,
              let projId = selectedProjectId,
              let workspace = workspaces.first(where: { $0.id == wsId }),
              let project = workspace.projects.first(where: { $0.id == projId }) else {
            return (nil, nil)
        }
        
        let episodeSlug = project.episodes.first(where: { $0.id == selectedEpisodeId })?.slug
        return (project.slug, episodeSlug)
    }
}
