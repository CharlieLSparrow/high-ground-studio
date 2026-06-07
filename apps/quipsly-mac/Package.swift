// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "QuipslyMac",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "QuipslyMac", targets: ["QuipslyMac"])
    ],
    targets: [
        .executableTarget(
            name: "QuipslyMac"
        )
    ]
)
