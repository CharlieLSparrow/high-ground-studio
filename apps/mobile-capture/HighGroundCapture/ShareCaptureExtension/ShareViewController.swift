import Foundation
import Social
import UIKit
import UniformTypeIdentifiers

private enum ShareCaptureContract {
    static let appGroupIdentifier = "group.com.highgroundodyssey.HighGroundCapture"
    static let ownerDefaultsKey = "quipsly.capture.share.owner-account-id"
    static let inboxDirectoryName = "ShareCaptureInbox"
    static let schema = "quipsly-share-source-capture-v2"
}

private struct ShareSourceEnvelope: Codable {
    let schema: String
    let id: UUID
    let ownerAccountID: String
    let title: String?
    let body: String
    let sourceURL: String?
    let capturedAt: Date
    let sourceApplication: String?
}

private struct ResolvedShareSource {
    let body: String
    let sourceURL: String?
    let sourceTitle: String?

    var description: String {
        sourceURL == nil ? "Text only · no webpage" : body == sourceURL ? "Web link" : "Passage + webpage"
    }
}

final class ShareViewController: SLComposeServiceViewController {
    private var resolvedSource: ResolvedShareSource?
    private var isResolving = false

    override func presentationAnimationDidFinish() {
        super.presentationAnimationDidFinish()
        resolveSourceIfNeeded()
    }

    override func isContentValid() -> Bool {
        verifiedOwnerID != nil && resolvedSource?.body.isEmpty == false
    }

    override func didSelectPost() {
        guard let ownerAccountID = verifiedOwnerID,
              let source = resolvedSource else {
            extensionContext?.cancelRequest(withError: NSError(
                domain: "QuipslyShareCapture",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Open Quipsly Capture and verify your account before saving to its private Inbox."]
            ))
            return
        }
        let body = source.body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty else {
            extensionContext?.cancelRequest(withError: NSError(
                domain: "QuipslyShareCapture",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "Select text or share a webpage before saving to Quipsly."]
            ))
            return
        }

        do {
            try stage(
                ownerAccountID: ownerAccountID,
                title: resolvedTitle(for: source),
                body: body,
                sourceURL: source.sourceURL
            )
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
        } catch {
            extensionContext?.cancelRequest(withError: error)
        }
    }

    override func configurationItems() -> [Any]! {
        let destination = SLComposeSheetConfigurationItem()!
        destination.title = "Destination"
        destination.value = verifiedOwnerID == nil ? "Open Quipsly to sign in" : "Private Inbox · unfiled"
        destination.tapHandler = {}
        let captured = SLComposeSheetConfigurationItem()!
        captured.title = "Captured"
        captured.value = resolvedSource?.description ?? "Reading shared item…"
        captured.tapHandler = {}
        return [destination, captured]
    }

    override func loadPreviewView() -> UIView! { nil }

    private var verifiedOwnerID: String? {
        let value = UserDefaults(suiteName: ShareCaptureContract.appGroupIdentifier)?
            .string(forKey: ShareCaptureContract.ownerDefaultsKey)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value, !value.isEmpty, value.count <= 256 else { return nil }
        return value
    }

    private var normalizedComment: String? {
        let value = contentText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : String(value.prefix(500))
    }

    private func resolvedTitle(for source: ResolvedShareSource) -> String? {
        guard let comment = normalizedComment,
              comment != source.body,
              comment != source.sourceURL else { return source.sourceTitle }
        return comment
    }

    private func resolveSourceIfNeeded() {
        guard !isResolving, resolvedSource == nil else { return }
        isResolving = true
        Task { @MainActor in
            defer { isResolving = false }
            resolvedSource = await resolveSource()
            validateContent()
            reloadConfigurationItems()
        }
    }

    private func resolveSource() async -> ResolvedShareSource? {
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        var sourceURL: String?
        var selectedText: String?
        var preprocessedTitle: String?
        var webpagePreprocessingReceived = false

        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.propertyList.identifier) {
            guard let value = try? await provider.loadItem(forTypeIdentifier: UTType.propertyList.identifier),
                  let propertyList = value as? [String: Any],
                  let results = propertyList[NSExtensionJavaScriptPreprocessingResultsKey] as? [String: Any] else { continue }
            webpagePreprocessingReceived = true
            if let value = results["url"] as? String,
               let url = normalizedWebURL(value) {
                sourceURL = url
            }
            if let value = results["selectedText"] as? String {
                selectedText = normalizedPassage(value, excluding: sourceURL)
            }
            if let value = results["title"] as? String {
                let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
                preprocessedTitle = normalized.isEmpty ? nil : String(normalized.prefix(500))
            }
            break
        }

        for provider in providers where sourceURL == nil && provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let value = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier),
               let url = value as? URL,
               ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                sourceURL = String(url.absoluteString.prefix(20_000))
                break
            }
        }
        for provider in providers where !webpagePreprocessingReceived && selectedText == nil && provider.hasItemConformingToTypeIdentifier(UTType.text.identifier) {
            if let value = try? await provider.loadItem(forTypeIdentifier: UTType.text.identifier),
               let text = value as? String,
               let normalized = normalizedPassage(text, excluding: sourceURL) {
                selectedText = normalized
                break
            }
        }
        if !webpagePreprocessingReceived && selectedText == nil {
            selectedText = items.compactMap { item in
                normalizedPassage(item.attributedContentText?.string, excluding: sourceURL)
            }.first
        }
        let sourceTitle = preprocessedTitle ?? items.compactMap { item -> String? in
            let title = item.attributedTitle?.string.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return title.isEmpty ? nil : String(title.prefix(500))
        }.first

        if let selectedText {
            return ResolvedShareSource(body: selectedText, sourceURL: sourceURL, sourceTitle: sourceTitle)
        }
        if let sourceURL {
            return ResolvedShareSource(body: sourceURL, sourceURL: sourceURL, sourceTitle: sourceTitle)
        }
        return nil
    }

    private func normalizedPassage(_ value: String?, excluding sourceURL: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !normalized.isEmpty, normalized != sourceURL else { return nil }
        return String(normalized.prefix(20_000))
    }

    private func normalizedWebURL(_ value: String) -> String? {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalized.count <= 20_000,
              let url = URL(string: normalized),
              ["http", "https"].contains(url.scheme?.lowercased() ?? "") else { return nil }
        return url.absoluteString
    }

    private func stage(ownerAccountID: String, title: String?, body: String, sourceURL: String?) throws {
        let fileManager = FileManager.default
        guard let container = fileManager.containerURL(forSecurityApplicationGroupIdentifier: ShareCaptureContract.appGroupIdentifier) else {
            throw NSError(domain: "QuipslyShareCapture", code: 2, userInfo: [NSLocalizedDescriptionKey: "Quipsly's protected Share container is unavailable."])
        }
        let directory = container.appendingPathComponent(ShareCaptureContract.inboxDirectoryName, isDirectory: true)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try? fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: directory.path)
        let envelope = ShareSourceEnvelope(
            schema: ShareCaptureContract.schema,
            id: UUID(),
            ownerAccountID: ownerAccountID,
            title: title,
            body: body,
            sourceURL: sourceURL,
            capturedAt: Date(),
            sourceApplication: nil
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        let data = try encoder.encode(envelope)
        let destination = directory.appendingPathComponent("\(envelope.id.uuidString.lowercased()).json")
        try data.write(to: destination, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
