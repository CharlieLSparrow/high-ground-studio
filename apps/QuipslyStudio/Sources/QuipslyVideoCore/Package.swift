// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "QuipslyVideoCore",
    platforms: [
        .macOS(.v14),
        .iOS(.v17)
    ],
    products: [
        .library(
            name: "QuipslyVideoCore",
            targets: ["QuipslyVideoCore"]),
    ],
    targets: [
        .target(
            name: "QuipslyVideoCore",
            dependencies: [],
            path: ".",
            exclude: ["Tests"],
            resources: [.process("ReframingShader.metal")]),
        .testTarget(
            name: "QuipslyVideoCoreTests",
            dependencies: ["QuipslyVideoCore"],
            path: "Tests/QuipslyVideoCoreTests")
    ]
)
