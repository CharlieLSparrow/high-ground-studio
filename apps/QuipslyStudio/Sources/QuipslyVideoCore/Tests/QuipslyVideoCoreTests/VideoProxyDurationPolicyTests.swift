import XCTest
@testable import QuipslyVideoCore

final class VideoProxyDurationPolicyTests: XCTestCase {
    func testSourceVideoTrackWinsOverLongerContainerDuration() {
        let result = VideoProxyDurationPolicy.assess(
            storedLaneDuration: 57.2,
            sourceVideoTrackDuration: 55.156738,
            proxyVideoTrackDuration: 55.166667
        )

        XCTAssertTrue(result.isReady)
        XCTAssertEqual(
            result.canonicalLaneDuration ?? .nan,
            55.156738,
            accuracy: 0.000_001
        )
        XCTAssertEqual(
            result.proxyVideoTrackDuration,
            55.166667,
            accuracy: 0.000_001
        )
    }

    func testTruncatedProxyIsBlockedAgainstSourceVideoTrack() {
        let result = VideoProxyDurationPolicy.assess(
            storedLaneDuration: 100,
            sourceVideoTrackDuration: 100,
            proxyVideoTrackDuration: 97
        )

        XCTAssertEqual(result.status, .blocked)
        XCTAssertNil(result.canonicalLaneDuration)
        XCTAssertTrue(result.detail.contains("does not cover"))
    }

    func testProxyCanUseStoredLaneWhenSourceIsUnavailableAndClose() {
        let result = VideoProxyDurationPolicy.assess(
            storedLaneDuration: 1_220.076667,
            sourceVideoTrackDuration: nil,
            proxyVideoTrackDuration: 1_220.066667
        )

        XCTAssertTrue(result.isReady)
        XCTAssertEqual(
            result.canonicalLaneDuration ?? .nan,
            1_220.066667,
            accuracy: 0.000_001
        )
    }

    func testSourceAccessIsRequiredForMaterialStoredDurationMismatch() {
        let result = VideoProxyDurationPolicy.assess(
            storedLaneDuration: 57.2,
            sourceVideoTrackDuration: nil,
            proxyVideoTrackDuration: 55.166667
        )

        XCTAssertEqual(result.status, .blocked)
        XCTAssertNil(result.canonicalLaneDuration)
        XCTAssertTrue(result.detail.contains("container audio tail"))
    }

    func testInvalidDurationsFailClosed() {
        XCTAssertEqual(
            VideoProxyDurationPolicy.assess(
                storedLaneDuration: 10,
                sourceVideoTrackDuration: 10,
                proxyVideoTrackDuration: .nan
            ).status,
            .blocked
        )
        XCTAssertEqual(
            VideoProxyDurationPolicy.assess(
                storedLaneDuration: 10,
                sourceVideoTrackDuration: 0,
                proxyVideoTrackDuration: 10
            ).status,
            .blocked
        )
    }
}
