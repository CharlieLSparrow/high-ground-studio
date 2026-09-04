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

        print("PASS 8 protected Session cache identity tests")
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
