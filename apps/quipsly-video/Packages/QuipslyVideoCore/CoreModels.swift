import Foundation

public struct MediaItem: Identifiable, Codable, Equatable {
    public let id: UUID
    public let url: URL
    public var proxyURL: URL?
    public let name: String
    
    public init(id: UUID = UUID(), url: URL, proxyURL: URL? = nil, name: String) {
        self.id = id
        self.url = url
        self.proxyURL = proxyURL
        self.name = name
    }
}

public enum PlaybackMode: String, Codable, Equatable, CaseIterable {
    case playEdit = "Play Edit"
    case playAll = "Play All"
}

public struct VideoProject: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var mediaBin: [MediaItem]
    public var sequences: [MediaSequence]
    
    public init(id: UUID = UUID(), title: String, mediaBin: [MediaItem] = [], sequences: [MediaSequence] = []) {
        self.id = id
        self.title = title
        self.mediaBin = mediaBin
        self.sequences = sequences
    }
}

public struct MediaSequence: Identifiable, Codable, Equatable {
    public let id: UUID
    public var title: String
    public var orientationTrack: OrientationTrack
    public var lanes: [VideoLane]
    
    public var duration: Double {
        lanes.map { $0.duration }.max() ?? 0
    }
    
    public init(id: UUID = UUID(), title: String, orientationTrack: OrientationTrack = OrientationTrack(), lanes: [VideoLane] = []) {
        self.id = id
        self.title = title
        self.orientationTrack = orientationTrack
        self.lanes = lanes
    }
    
    /// Applies an array of imported VideoTags to a specific lane, replacing existing tags.
    public mutating func importTags(_ newTags: [VideoTag], toLaneWithID laneID: UUID) {
        guard let index = lanes.firstIndex(where: { $0.id == laneID }) else { return }
        lanes[index].tags = newTags
    }
}

public struct OrientationTrack: Identifiable, Codable, Equatable {
    public let id: UUID
    public var keyframes: [FramingKeyframe]
    
    public init(id: UUID = UUID(), keyframes: [FramingKeyframe] = []) {
        self.id = id
        self.keyframes = keyframes
    }
    
    public func interpolatedFrame(at time: Double) -> FramingKeyframe {
        guard !keyframes.isEmpty else {
            return FramingKeyframe(time: time, scale: 1.0, offsetX: 0, offsetY: 0)
        }
        
        let sorted = keyframes.sorted { $0.time < $1.time }
        
        if time <= sorted.first!.time { return sorted.first! }
        if time >= sorted.last!.time { return sorted.last! }
        
        for i in 0..<(sorted.count - 1) {
            let k1 = sorted[i]
            let k2 = sorted[i+1]
            if time >= k1.time && time < k2.time {
                let progress = (time - k1.time) / (k2.time - k1.time)
                let scale = k1.scale + (k2.scale - k1.scale) * progress
                let offsetX = k1.offsetX + (k2.offsetX - k1.offsetX) * progress
                let offsetY = k1.offsetY + (k2.offsetY - k1.offsetY) * progress
                return FramingKeyframe(time: time, scale: scale, offsetX: offsetX, offsetY: offsetY)
            }
        }
        
        return sorted.last!
    }
}

public struct FramingKeyframe: Identifiable, Codable, Equatable {
    public let id: UUID
    public var time: Double
    public var scale: Double
    public var offsetX: Double
    public var offsetY: Double
    
    public init(id: UUID = UUID(), time: Double, scale: Double = 1.0, offsetX: Double = 0, offsetY: Double = 0) {
        self.id = id
        self.time = time
        self.scale = scale
        self.offsetX = offsetX
        self.offsetY = offsetY
    }
}

public struct VideoLane: Identifiable, Codable, Equatable {
    public let id: UUID
    public var name: String
    public var sourceVideo: SourceVideo?
    public var tags: [VideoTag]
    
    public var duration: Double {
        sourceVideo?.duration ?? 0
    }
    
    public init(id: UUID = UUID(), name: String, sourceVideo: SourceVideo? = nil, tags: [VideoTag] = []) {
        self.id = id
        self.name = name
        self.sourceVideo = sourceVideo
        self.tags = tags
    }
}

public struct SourceVideo: Identifiable, Codable, Equatable {
    public let id: UUID
    public var mediaURL: URL
    public var proxyURL: URL?
    public var duration: Double
    public var offset: Double
    
    public init(id: UUID = UUID(), mediaURL: URL, proxyURL: URL? = nil, duration: Double, offset: Double = 0) {
        self.id = id
        self.mediaURL = mediaURL
        self.proxyURL = proxyURL
        self.duration = duration
        self.offset = offset
    }
}

public enum TagType: String, Codable, Equatable, CaseIterable {
    case highlight = "Highlight"
    case meme = "Meme"
    case keep = "Keep"
    case cut = "Cut"
    case active = "Active"
    case focus = "Focus"
}

public struct VideoTag: Identifiable, Codable, Equatable {
    public let id: UUID
    public var type: TagType
    public var startTime: Double
    public var duration: Double
    
    public init(id: UUID = UUID(), type: TagType = .highlight, startTime: Double, duration: Double) {
        self.id = id
        self.type = type
        self.startTime = startTime
        self.duration = duration
    }
}
