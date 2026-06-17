import Foundation
import CoreMedia
import AVFoundation

/// Represents a simple Edit Decision List (EDL) representation of a timeline.
public struct EditListSequence {
    public let name: String
    public let events: [EditEvent]
    
    public init(name: String, events: [EditEvent]) {
        self.name = name
        self.events = events
    }
}

/// Represents a single cut from a source video placed on a timeline.
public struct EditEvent {
    public let sourceID: UUID
    public let sourceIn: Double
    public let sourceOut: Double
    public let recordIn: Double
    public let recordOut: Double
    
    public init(sourceID: UUID, sourceIn: Double, sourceOut: Double, recordIn: Double, recordOut: Double) {
        self.sourceID = sourceID
        self.sourceIn = sourceIn
        self.sourceOut = sourceOut
        self.recordIn = recordIn
        self.recordOut = recordOut
    }
}

/// The importer treats the EDL as a "source of information" and maps edits to VideoTags
/// rather than destructively breaking the continuous VideoLanes.
public class EditListImporter {
    
    /// Checks if the video at the given URL contains 360-degree equirectangular metadata
    public static func validateVideo360Metadata(url: URL) async -> Bool {
        if url.pathExtension.lowercased() == "insv" { return true }
        let options: [String: Any]? = url.pathExtension.lowercased() == "insv" ? ["AVURLAssetOutOfBandMIMETypeKey": "video/mp4"] : nil
        let asset = AVURLAsset(url: url, options: options)
        do {
            let tracks = try await asset.loadTracks(withMediaType: .video)
            guard let videoTrack = tracks.first else { return false }
            
            // Check for spherical video metadata (e.g., projection type)
            let formats = try await videoTrack.load(.formatDescriptions)
            for format in formats {
                if let extensions = CMFormatDescriptionGetExtensions(format) as Dictionary? {
                    // This is a basic heuristic. Real 360 video parsing checks for 'spherical' atoms
                    // like 'sv3d' or specific projection type strings in the format description.
                    let extString = String(describing: extensions).lowercased()
                    if extString.contains("spherical") || extString.contains("equirectangular") || extString.contains("projection") {
                        return true
                    }
                }
            }
            return false
        } catch {
            return false
        }
    }
    
    /// Generates VideoTags for a specific lane based on an EditListSequence
    public static func tagsFromEditList(sequence: EditListSequence, forSourceID sourceID: UUID, tagType: TagType = .highlight) -> [VideoTag] {
        var tags: [VideoTag] = []
        
        for event in sequence.events {
            // Only create tags for edits that reference this specific source media
            if event.sourceID == sourceID {
                let duration = event.sourceOut - event.sourceIn
                
                let tag = VideoTag(
                    type: tagType,
                    startTime: event.sourceIn,
                    duration: duration
                )
                tags.append(tag)
            }
        }
        
        return tags
    }
    
    /// Utility to simulate an EDL from a 3-episode multi-cam sequence for testing
    public static func generateMockPremiereEdit(sourceID: UUID) -> EditListSequence {
        var events: [EditEvent] = []
        
        // Let's create 50 simulated cuts (e.g. they cut to this camera every 10 seconds for 5 seconds)
        for i in 0..<50 {
            let startSeconds = Double(i * 10)
            let endSeconds = startSeconds + 5.0
            
            let event = EditEvent(
                sourceID: sourceID,
                sourceIn: startSeconds,
                sourceOut: endSeconds,
                recordIn: startSeconds, // Mock simplification
                recordOut: endSeconds
            )
            events.append(event)
        }
        
        return EditListSequence(name: "Episode 1 Mock Edit", events: events)
    }
}
