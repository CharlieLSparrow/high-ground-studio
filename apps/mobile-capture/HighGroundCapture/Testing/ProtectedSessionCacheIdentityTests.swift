import Foundation

@main
enum ProtectedSessionCacheIdentityTests {
    static func main() {
        expect(
            ProtectedSessionCacheIdentity.permitsRestore(
                cacheSchemaVersion: 3,
                cachedOwnerAccountID: "actor-charlie",
                activeOwnerAccountID: "actor-charlie"
            ),
            "the same immutable actor can restore its Session projection"
        )
        reject(schema: 3, cached: "actor-charlie", active: "actor-scott", "another actor")
        reject(schema: 2, cached: "actor-charlie", active: "actor-charlie", "legacy email-era schema")
        reject(schema: 3, cached: nil, active: "actor-charlie", "missing cached actor")
        reject(schema: 3, cached: "actor-charlie", active: nil, "missing active actor")
        reject(schema: 3, cached: "   ", active: "actor-charlie", "blank cached actor")
        reject(
            schema: 3,
            cached: String(repeating: "a", count: 257),
            active: String(repeating: "a", count: 257),
            "oversized untrusted identity"
        )

        expect(
            ProtectedSessionCacheIdentity.permitsRestore(
                cacheSchemaVersion: 3,
                cachedOwnerAccountID: "  actor-charlie  ",
                activeOwnerAccountID: "actor-charlie"
            ),
            "harmless transport whitespace is normalized"
        )

        let scope = CaptureTranscriptReadScope(roomID: "session-one", recordingAssetID: "source-one",
            transcriptJobID: "transcript-one", ownerAccountID: "actor-charlie")
        expect(scope.permitsDisplay(active: scope, currentOwnerAccountID: "actor-charlie"), "loaded work remains available to the same account")
        expect(!scope.permitsDisplay(active: scope, currentOwnerAccountID: nil), "sign out invalidates loaded work")
        expect(!scope.permitsDisplay(active: scope, currentOwnerAccountID: "actor-scott"), "account switch rejects the older response")
        expect(!scope.permitsDisplay(active: nil, currentOwnerAccountID: "actor-charlie"), "a closed scope rejects a late response")
        let reopened = CaptureTranscriptReadScope(roomID: scope.roomID, recordingAssetID: scope.recordingAssetID,
            transcriptJobID: scope.transcriptJobID, ownerAccountID: scope.ownerAccountID)
        expect(!scope.permitsDisplay(active: reopened, currentOwnerAccountID: "actor-charlie"), "reopening the same transcript invalidates its previous request")
        let otherSource = CaptureTranscriptReadScope(roomID: scope.roomID, recordingAssetID: "source-two",
            transcriptJobID: "transcript-two", ownerAccountID: scope.ownerAccountID)
        expect(!scope.permitsDisplay(active: otherSource, currentOwnerAccountID: "actor-charlie"), "switching sources cannot display the first source response")
        let unsigned = CaptureTranscriptReadScope(roomID: scope.roomID, recordingAssetID: nil,
            transcriptJobID: nil, ownerAccountID: nil)
        expect(!unsigned.permitsDisplay(active: unsigned, currentOwnerAccountID: nil), "two absent identities never authorize display")

        print("PASS 15 protected Session cache and transcript read identity tests")
    }

    private static func reject(
        schema: Int,
        cached: String?,
        active: String?,
        _ label: String
    ) {
        expect(
            !ProtectedSessionCacheIdentity.permitsRestore(
                cacheSchemaVersion: schema,
                cachedOwnerAccountID: cached,
                activeOwnerAccountID: active
            ),
            "must reject \(label)"
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
            Foundation.exit(1)
        }
    }
}
