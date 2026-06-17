import Vision
import Foundation

if #available(macOS 10.15, *) {
    let request = VNClassifyImageRequest()
    if let labels = try? request.supportedIdentifiers() {
        let marineTerms = ["coral", "sponge", "clam", "mollusk", "shell", "anemone", "fish", "starfish", "urchin"]
        let matches = labels.filter { label in
            marineTerms.contains(where: { label.lowercased().contains($0) })
        }
        print("Matches found in Vision Taxonomy:")
        print(matches.joined(separator: "\n"))
    }
}
