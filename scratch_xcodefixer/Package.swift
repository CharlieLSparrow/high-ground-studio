// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "XcodeFixer",
    platforms: [.macOS(.v13)],
    dependencies: [
        .package(url: "https://github.com/tuist/XcodeProj.git", .upToNextMajor(from: "8.15.0"))
    ],
    targets: [
        .executableTarget(name: "XcodeFixer", dependencies: [
            .product(name: "XcodeProj", package: "XcodeProj")
        ])
    ]
)
