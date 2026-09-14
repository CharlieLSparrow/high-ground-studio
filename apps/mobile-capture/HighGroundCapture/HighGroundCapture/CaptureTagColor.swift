import Foundation

/// The web and native clients use the saved RGB color with whichever opaque
/// foreground has better contrast. Missing colors inherit the app's theme.
struct CaptureTagColor: Equatable {
    let red: Double
    let green: Double
    let blue: Double

    init?(hex: String?) {
        guard let hex,
              hex.range(of: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$", options: .regularExpression) != nil else { return nil }
        let digits = String(hex.dropFirst())
        let expanded = digits.count == 3 ? digits.map { "\($0)\($0)" }.joined() : digits
        guard let value = UInt32(expanded, radix: 16) else { return nil }
        red = Double((value >> 16) & 255) / 255
        green = Double((value >> 8) & 255) / 255
        blue = Double(value & 255) / 255
    }

    init?(red: Double, green: Double, blue: Double) {
        guard red.isFinite, green.isFinite, blue.isFinite else { return nil }
        self.red = min(1, max(0, red))
        self.green = min(1, max(0, green))
        self.blue = min(1, max(0, blue))
    }

    var hexString: String {
        String(format: "#%02x%02x%02x", Int((red * 255).rounded()),
               Int((green * 255).rounded()), Int((blue * 255).rounded()))
    }

    private var luminance: Double {
        func linear(_ channel: Double) -> Double {
            channel <= 0.04045 ? channel / 12.92 : pow((channel + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }

    var usesWhiteText: Bool { (1.05 / (luminance + 0.05)) > ((luminance + 0.05) / 0.05) }
    var textContrastRatio: Double { max(1.05 / (luminance + 0.05), (luminance + 0.05) / 0.05) }
}
