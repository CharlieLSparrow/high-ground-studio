import Foundation

public enum NativeSessionSaveIntent: Sendable {
    case explicitCheckpoint
    case autosave
}

public enum NativeSessionNamePolicy {
    public static func normalized(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "autosave" : trimmed
    }

    public static func isMutableWorkingSession(_ value: String) -> Bool {
        let name = normalized(value).lowercased()
        return name == "autosave"
            || name.hasSuffix("-working")
            || name.contains("-working-")
    }

    public static func workingCopyName(
        checkpointName: String,
        createdAt: Date = Date(),
        nonce: UUID = UUID()
    ) -> String {
        let checkpoint = normalized(checkpointName)
        guard !isMutableWorkingSession(checkpoint) else {
            return checkpoint
        }

        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd'T'HHmmssSSS'Z'"
        let timestamp = formatter.string(from: createdAt)
        let shortNonce = nonce.uuidString
            .lowercased()
            .replacingOccurrences(of: "-", with: "")
            .prefix(8)
        let checkpointStem = utf8Prefix(checkpoint, maxBytes: 180)

        return "\(checkpointStem)-working-\(timestamp)-\(shortNonce)"
    }

    public static func roleLabel(_ value: String) -> String {
        isMutableWorkingSession(value) ? "working" : "checkpoint"
    }

    private static func utf8Prefix(
        _ value: String,
        maxBytes: Int
    ) -> String {
        var result = ""
        var byteCount = 0
        for character in value {
            let next = String(character)
            let nextByteCount = next.utf8.count
            guard byteCount + nextByteCount <= maxBytes else {
                break
            }
            result.append(character)
            byteCount += nextByteCount
        }
        return result
    }
}
