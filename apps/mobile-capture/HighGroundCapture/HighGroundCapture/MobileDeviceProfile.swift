import SwiftUI
import UIKit

enum MobileDeviceKind {
    case iPad
    case iPhone
    case vision
    case macCatalyst
    case unknown
}

/// Canonical user-facing platform vocabulary for the universal Capture app.
/// Window size decides layout; hardware idiom decides what we call the device.
/// Keeping these separate prevents an iPad Stage Manager window from suddenly
/// describing itself as an iPhone merely because it became compact.
@MainActor
enum CaptureDeviceVocabulary {
    static var kind: MobileDeviceKind {
        #if targetEnvironment(macCatalyst)
        return .macCatalyst
        #else
        switch UIDevice.current.userInterfaceIdiom {
        case .pad: return .iPad
        case .phone: return .iPhone
        case .vision: return .vision
        default: return .unknown
        }
        #endif
    }

    static var deviceName: String {
        switch kind {
        case .iPad: return "iPad"
        case .iPhone: return "iPhone"
        case .vision: return "Apple Vision Pro"
        case .macCatalyst: return "Mac"
        case .unknown: return "device"
        }
    }

    static var thisDevice: String {
        deviceName == "device" ? "this device" : "this \(deviceName)"
    }

    static var thisDeviceCapitalized: String {
        deviceName == "device" ? "This device" : "This \(deviceName)"
    }

    static var yourDevice: String {
        deviceName == "device" ? "your device" : "your \(deviceName)"
    }

    static var thisDevicePossessive: String { "\(thisDevice)’s" }
    static var yourDevicePossessive: String { "\(yourDevice)’s" }

    static var builtInMicrophone: String {
        deviceName == "device" ? "Built-in microphone" : "\(deviceName) microphone"
    }

    static var audioRoute: String {
        deviceName == "device" ? "Device audio" : "\(deviceName) audio"
    }

    static var systemImage: String {
        switch kind {
        case .iPad: return "ipad"
        case .iPhone: return "iphone"
        case .vision: return "visionpro"
        case .macCatalyst: return "laptopcomputer"
        case .unknown: return "rectangle.connected.to.line.below"
        }
    }
}

struct MobileDeviceProfile {
    let kind: MobileDeviceKind
    let horizontalSizeClass: UserInterfaceSizeClass?
    let verticalSizeClass: UserInterfaceSizeClass?

    var isPadLike: Bool {
        kind == .iPad || kind == .macCatalyst || horizontalSizeClass == .regular
    }

    var isPhoneLike: Bool {
        !isPadLike
    }

    var prefersThreePaneStudio: Bool {
        isPadLike && horizontalSizeClass == .regular
    }

    static func current(
        horizontalSizeClass: UserInterfaceSizeClass?,
        verticalSizeClass: UserInterfaceSizeClass?
    ) -> MobileDeviceProfile {
        #if targetEnvironment(macCatalyst)
        let kind: MobileDeviceKind = .macCatalyst
        #else
        let idiom = UIDevice.current.userInterfaceIdiom
        let kind: MobileDeviceKind
        switch idiom {
        case .pad:
            kind = .iPad
        case .phone:
            kind = .iPhone
        case .vision:
            kind = .vision
        default:
            kind = .unknown
        }
        #endif

        return MobileDeviceProfile(
            kind: kind,
            horizontalSizeClass: horizontalSizeClass,
            verticalSizeClass: verticalSizeClass
        )
    }
}
