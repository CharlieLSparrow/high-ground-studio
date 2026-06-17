import Foundation

struct NestProjectPreset: Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let title: String
    let subtitle: String
    let symbol: String

    static let known: [NestProjectPreset] = [
        NestProjectPreset(
            slug: "high-ground-odyssey-manuscript",
            title: "High Ground Odyssey",
            subtitle: "Book, episodes, publishing, and podcast workflow",
            symbol: "book.pages"
        ),
        NestProjectPreset(
            slug: "marine-biology-research",
            title: "Marine Biology Research",
            subtitle: "Photo research, MLE prep, and study documents",
            symbol: "camera.macro"
        ),
        NestProjectPreset(
            slug: "charlie-melissa-fiction-lab",
            title: "Fiction Lab",
            subtitle: "Private fiction, comics, story worlds, and analysis",
            symbol: "theatermasks"
        ),
        NestProjectPreset(
            slug: "quipsly-dev-lab",
            title: "Quipsly Dev Lab",
            subtitle: "Safe sandbox for testing editor and media workflows",
            symbol: "hammer"
        ),
    ]
}
