import SwiftUI
import UIKit

enum MobileDeviceKind {
    case iPad
    case iPhone
    case vision
    case macCatalyst
    case unknown
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
