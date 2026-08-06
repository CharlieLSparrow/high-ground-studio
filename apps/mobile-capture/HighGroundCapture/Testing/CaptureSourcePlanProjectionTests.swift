import Foundation

@main
enum CaptureSourcePlanProjectionTests {
    static func main() throws {
        try deterministicIdentitySurvivesRelaunch()
        try projectionPreservesExactSourceIdentity()
        try transportJSONMatchesNestContract()
        print("PASS 3 Capture source-plan projection tests")
    }

    private static func deterministicIdentitySurvivesRelaunch() throws {
        let captureID = UUID(uuidString: "2a32f19d-8770-4c35-a157-96884d566e82")!
        let first = CaptureSourcePlanProjection.payload(
            captureID: captureID,
            participantID: "participant-1",
            sourceKind: "VIDEO",
            deviceModelIdentifier: "iPhone17,3"
        )
        let reconstructed = CaptureSourcePlanProjection.payload(
            captureID: captureID,
            participantID: "participant-1",
            sourceKind: "VIDEO",
            deviceModelIdentifier: "iPhone17,3"
        )
        expect(first == reconstructed, "relaunch must reconstruct the same payload")
        expect(
            first.requestId.uuidString.split(separator: "-")[2].first == "5",
            "request identity must advertise deterministic UUID version 5"
        )
    }

    private static func projectionPreservesExactSourceIdentity() throws {
        let captureID = UUID(uuidString: "8fb5f3ca-2898-41fc-b84d-0b6fcb2f9c6c")!
        let payload = CaptureSourcePlanProjection.payload(
            captureID: captureID,
            participantID: "participant-scott",
            sourceKind: "audio",
            deviceModelIdentifier: "  "
        )
        expect(payload.captureId == captureID, "capture UUID must stay exact")
        expect(payload.participantId == "participant-scott", "participant identity must stay exact")
        expect(payload.sourceKind == "AUDIO", "source kind must normalize to Nest enum")
        expect(payload.retentionRole == "REQUIRED_MASTER", "phone source must be required")
        expect(payload.expectedClientKind == "ios", "client kind must be iOS")
        expect(payload.expectedDeviceLabel == "Quipsly Capture · iPhone", "blank model must fail to a stable label")
    }

    private static func transportJSONMatchesNestContract() throws {
        let captureID = UUID(uuidString: "2a32f19d-8770-4c35-a157-96884d566e82")!
        let payload = CaptureSourcePlanProjection.payload(
            captureID: captureID,
            participantID: nil,
            sourceKind: "VIDEO",
            deviceModelIdentifier: "iPhone17,3"
        )
        let data = try JSONEncoder().encode(payload)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        expect(object?["requestId"] is String, "requestId must encode as a UUID string")
        expect(object?["captureId"] as? String == captureID.uuidString, "captureId must use the exact UUID")
        expect(object?["sourceKind"] as? String == "VIDEO", "sourceKind must be VIDEO")
        expect(object?["retentionRole"] as? String == "REQUIRED_MASTER", "role must be required master")
        expect(object?["expectedClientKind"] as? String == "ios", "client kind must be ios")
    }

    private static func expect(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) {
        guard condition() else { fatalError("FAIL \(message)") }
    }
}
