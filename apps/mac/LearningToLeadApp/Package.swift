// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "LearningToLeadApp",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "LearningToLeadApp", targets: ["LearningToLeadApp"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "LearningToLeadApp",
            dependencies: [],
            path: "Sources/LearningToLeadApp"
        ),
        .testTarget(
            name: "LearningToLeadTests",
            dependencies: ["LearningToLeadApp"],
            path: "Tests/LearningToLeadTests"
        )
    ]
)
