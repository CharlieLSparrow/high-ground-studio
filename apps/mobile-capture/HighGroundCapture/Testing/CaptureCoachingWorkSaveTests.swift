import Foundation

@main
enum CaptureCoachingWorkSaveTests {
    static func main() {
        for kind in ["NOTE", "TASK", "GOAL"] {
            let original = CaptureCoachingWorkDraft(
                kind: kind, title: "First step", body: "Write a page", visibility: "PRIVATE",
                ownerUserID: "client", status: kind == "GOAL" ? "ACTIVE" : "OPEN", targetAt: nil
            )
            let attempt = CaptureCoachingCreateAttempt(requestID: "one-command", original: original)
            var edited = original
            edited.title = "A clearer first step"
            expect(attempt.body["title"] as? String == original.title, "retry retains submitted content")
            expect(attempt.body["clientRequestId"] as? String == "one-command", "retry identity remains stable")
            expect(attempt.body["kind"] as? String == kind, "kind remains bound to the command")
            var latest = original
            latest.body = "A collaborator's additional context"
            let merged = edited.amendment(from: original, to: latest)
            expect(merged.conflicts.isEmpty, "independent edits merge")
            expect(merged.body["title"] as? String == edited.title, "changed title applies")
            expect(merged.body["body"] as? String == latest.body, "collaborator details survive")
            latest.title = "A competing title"
            expect(edited.amendment(from: original, to: latest).conflicts == ["title"], "overlap is explicit")
            latest.title = edited.title
            expect(edited.amendment(from: original, to: latest).conflicts.isEmpty, "lost amendment reply is retryable")
            if kind == "NOTE" {
                expect(attempt.body["ownerUserId"] == nil, "notes do not assign an owner")
                expect(merged.body["visibility"] as? String == "PRIVATE", "private stays private")
            } else {
                expect(attempt.body["targetAt"] is NSNull, "no date is JSON null")
                latest.status = kind == "TASK" ? "DONE" : "ACHIEVED"
                let result = edited.amendment(from: original, to: latest)
                expect(result.body["status"] as? String == latest.status, "collaborator completion survives retry")
                expect(result.body["targetAt"] is NSNull, "cleared date remains JSON null")
            }
        }
        print("PASS 32 canonical work creation retry and amendment checks")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }
}
