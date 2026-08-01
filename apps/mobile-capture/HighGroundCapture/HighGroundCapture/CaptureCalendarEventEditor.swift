import EventKit
import EventKitUI
import SwiftUI

/// A privacy-minimized, one-event projection. Quipsly creates this value from
/// canonical Session scheduling data, then relinquishes control to Apple's
/// out-of-process editor. It never reads the person's calendars or the saved
/// event back into Quipsly.
struct CaptureCalendarEventDraft: Identifiable, Equatable {
    let id: String
    let title: String
    let startDate: Date
    let endDate: Date
    let notes: String
    let sessionURL: URL

    init?(session: MobileCaptureSession) {
        guard let startDate = Self.date(session.scheduledStart),
              let endDate = Self.date(session.scheduledEnd),
              endDate > startDate else { return nil }

        let baseURL = URL(
            string: normalizedNestBaseURL(
                Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                    ?? "https://nest.quipsly.com"
            )
        )
        guard let sessionURL = baseURL?
            .appendingPathComponent("sessions", isDirectory: true)
            .appendingPathComponent(session.callRoomId) else { return nil }

        let projectLine = session.projectName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let visibleProject = projectLine?.isEmpty == false ? projectLine : nil
        let context = visibleProject.map { "Nest: \($0). " } ?? ""

        id = session.id
        title = session.displayTitle
        self.startDate = startDate
        self.endDate = endDate
        notes = "\(context)Open the exact Quipsly Session for consent, recordings, transcript, notes, goals, tasks, and follow-through. Private Session content is not copied into Calendar."
        self.sessionURL = sessionURL
    }

    private static func date(_ value: String?) -> Date? {
        guard let value, !value.isEmpty else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }
}

struct CaptureCalendarEventEditor: UIViewControllerRepresentable {
    let draft: CaptureCalendarEventDraft
    let onComplete: (EKEventEditViewAction) -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onComplete: onComplete)
    }

    func makeUIViewController(context: Context) -> EKEventEditViewController {
        let store = EKEventStore()
        let event = EKEvent(eventStore: store)
        event.title = draft.title
        event.startDate = draft.startDate
        event.endDate = draft.endDate
        event.notes = draft.notes
        event.url = draft.sessionURL

        let controller = EKEventEditViewController()
        controller.eventStore = store
        controller.event = event
        controller.editViewDelegate = context.coordinator
        context.coordinator.retain(store: store)
        return controller
    }

    func updateUIViewController(
        _ uiViewController: EKEventEditViewController,
        context: Context
    ) {}

    final class Coordinator: NSObject, EKEventEditViewDelegate {
        private let onComplete: (EKEventEditViewAction) -> Void
        private var eventStore: EKEventStore?

        init(onComplete: @escaping (EKEventEditViewAction) -> Void) {
            self.onComplete = onComplete
        }

        func retain(store: EKEventStore) {
            eventStore = store
        }

        func eventEditViewController(
            _ controller: EKEventEditViewController,
            didCompleteWith action: EKEventEditViewAction
        ) {
            onComplete(action)
        }
    }
}

struct CaptureCalendarEventEditorSheet: View {
    @Environment(\.dismiss) private var dismiss

    let draft: CaptureCalendarEventDraft
    let onComplete: (EKEventEditViewAction) -> Void

    var body: some View {
        CaptureCalendarEventEditor(draft: draft) { action in
            onComplete(action)
            dismiss()
        }
        .ignoresSafeArea()
    }
}
