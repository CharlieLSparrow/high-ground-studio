import Foundation
import Combine
import StoreKit
import SwiftUI

struct QuipslySaaSEntitlementResponse: Decodable {
    let ok: Bool
    let entitlement: QuipslySaaSEntitlement
}

struct QuipslySaaSEntitlement: Decodable {
    let entitled: Bool
    let enforcementEnabled: Bool
    let accessMode: String
    let planKey: String
    let planName: String
    let provider: String?
    let status: String
    let currentPeriodEnd: String?
    let cancelAtPeriodEnd: Bool
    let verifiedAt: String?
    let capabilities: [String]
    let appAccountToken: String?
    let products: [QuipslySaaSProduct]
    let management: QuipslySaaSManagement
}

struct QuipslySaaSProduct: Decodable, Identifiable {
    let planKey: String
    let productId: String
    let billingPeriod: String

    var id: String { productId }
}

struct QuipslySaaSManagement: Decodable {
    let appStoreURL: String
    let webURL: String
}

private struct QuipslyAppStoreTransactionRequest: Encodable {
    let signedTransactionInfo: String
}

@MainActor
final class QuipslySubscriptionStore: ObservableObject {
    @Published private(set) var entitlement: QuipslySaaSEntitlement?
    @Published private(set) var products: [Product] = []
    @Published private(set) var isLoading = false
    @Published private(set) var purchasingProductID: String?
    @Published var message: String?
    @Published var errorMessage: String?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var transactionUpdatesTask: Task<Void, Never>?

    deinit {
        transactionUpdatesTask?.cancel()
    }

    func start() {
        guard transactionUpdatesTask == nil else { return }
        transactionUpdatesTask = Task { [weak self] in
            for await verification in StoreKit.Transaction.updates {
                guard !Task.isCancelled else { return }
                await self?.handle(verification: verification, finishAfterSync: true)
            }
        }
    }

    func load() async {
        start()
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            entitlement = try await requestEntitlement(method: "GET")
            try await loadProducts()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func purchase(_ product: Product) async {
        guard purchasingProductID == nil else { return }
        purchasingProductID = product.id
        errorMessage = nil
        message = nil
        defer { purchasingProductID = nil }
        do {
            let prepared = try await requestEntitlement(method: "POST")
            entitlement = prepared
            guard let tokenValue = prepared.appAccountToken,
                  let accountToken = UUID(uuidString: tokenValue) else {
                throw SubscriptionStoreError.missingAccountToken
            }
            let result = try await product.purchase(options: [.appAccountToken(accountToken)])
            switch result {
            case .success(let verification):
                try await handlePurchaseVerification(verification)
            case .pending:
                message = "Your purchase is pending approval. Quipsly will update automatically when Apple completes it."
            case .userCancelled:
                break
            @unknown default:
                throw SubscriptionStoreError.unknownPurchaseResult
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func restorePurchases() async {
        guard purchasingProductID == nil else { return }
        purchasingProductID = "restore"
        errorMessage = nil
        message = nil
        defer { purchasingProductID = nil }
        do {
            entitlement = try await requestEntitlement(method: "POST")
            try await AppStore.sync()
            var restored = 0
            let allowedProductIDs = Set(entitlement?.products.map(\.productId) ?? [])
            for await verification in StoreKit.Transaction.currentEntitlements {
                guard case .verified(let transaction) = verification,
                      allowedProductIDs.contains(transaction.productID) else { continue }
                try await submit(verification.jwsRepresentation)
                await transaction.finish()
                restored += 1
            }
            entitlement = try await requestEntitlement(method: "GET")
            message = restored > 0
                ? "Your Quipsly subscription is restored."
                : "No active Quipsly App Store subscription was found for this Apple Account."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handlePurchaseVerification(_ verification: VerificationResult<StoreKit.Transaction>) async throws {
        switch verification {
        case .verified(let transaction):
            try await submit(verification.jwsRepresentation)
            await transaction.finish()
            entitlement = try await requestEntitlement(method: "GET")
            message = "Your Quipsly subscription is active on iPhone and the web."
        case .unverified:
            throw SubscriptionStoreError.unverifiedTransaction
        }
    }

    private func handle(
        verification: VerificationResult<StoreKit.Transaction>,
        finishAfterSync: Bool
    ) async {
        guard case .verified(let transaction) = verification,
              entitlement?.products.contains(where: { $0.productId == transaction.productID }) == true else {
            return
        }
        do {
            try await submit(verification.jwsRepresentation)
            if finishAfterSync { await transaction.finish() }
            entitlement = try await requestEntitlement(method: "GET")
        } catch {
            errorMessage = "Apple completed a transaction, but Quipsly has not synced it yet: \(error.localizedDescription)"
        }
    }

    private func loadProducts() async throws {
        let ids = entitlement?.products.map(\.productId) ?? []
        guard !ids.isEmpty else {
            products = []
            return
        }
        products = try await Product.products(for: ids).sorted { left, right in
            if left.price == right.price { return left.id < right.id }
            return left.price < right.price
        }
    }

    private func requestEntitlement(method: String) async throws -> QuipslySaaSEntitlement {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/entitlements") else {
            throw SubscriptionStoreError.invalidServerURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
        guard response.statusCode < 400 else {
            throw serverError(data: data, statusCode: response.statusCode)
        }
        return try JSONDecoder().decode(QuipslySaaSEntitlementResponse.self, from: data).entitlement
    }

    private func submit(_ signedTransactionInfo: String) async throws {
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/entitlements/app-store/transaction") else {
            throw SubscriptionStoreError.invalidServerURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(
            QuipslyAppStoreTransactionRequest(signedTransactionInfo: signedTransactionInfo)
        )
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
        guard response.statusCode < 400 else {
            throw serverError(data: data, statusCode: response.statusCode)
        }
    }

    private func serverError(data: Data, statusCode: Int) -> Error {
        if let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let detail = payload["error"] as? String, !detail.isEmpty {
            return NSError(
                domain: "QuipslySubscriptionStore",
                code: statusCode,
                userInfo: [NSLocalizedDescriptionKey: detail]
            )
        }
        return NSError(
            domain: "QuipslySubscriptionStore",
            code: statusCode,
            userInfo: [NSLocalizedDescriptionKey: "Quipsly returned HTTP \(statusCode)."]
        )
    }
}

private enum SubscriptionStoreError: LocalizedError {
    case invalidServerURL
    case missingAccountToken
    case unverifiedTransaction
    case unknownPurchaseResult

    var errorDescription: String? {
        switch self {
        case .invalidServerURL:
            return "The Quipsly subscription service URL is invalid."
        case .missingAccountToken:
            return "Quipsly could not safely link this purchase to your signed-in account."
        case .unverifiedTransaction:
            return "Apple did not verify this transaction. No Quipsly access was changed."
        case .unknownPurchaseResult:
            return "Apple returned an unfamiliar purchase result. No Quipsly access was changed."
        }
    }
}

struct QuipslySubscriptionView: View {
    @ObservedObject var store: QuipslySubscriptionStore

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                currentPlanCard

                if store.products.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Plans are coming online", systemImage: "sparkles")
                            .font(.headline)
                        Text("App Store products are not available in this build yet. Your current Quipsly access continues, and none of your Sessions or recordings are affected.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .captureCard()
                } else {
                    ForEach(store.products, id: \.id) { product in
                        productCard(product)
                    }
                }

                Button {
                    Task { await store.restorePurchases() }
                } label: {
                    Label("Restore purchases", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(store.purchasingProductID != nil)
                .accessibilityIdentifier("CaptureRestoreQuipslyPurchases")

                if let url = URL(string: store.entitlement?.management.appStoreURL ?? "https://apps.apple.com/account/subscriptions") {
                    Link(destination: url) {
                        Label("Manage App Store subscription", systemImage: "arrow.up.right.square")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                }

                if let message = store.message {
                    Text(message)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.accentColor)
                        .captureCard()
                }
                if let error = store.errorMessage {
                    Text(error)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)
                        .captureCard()
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 44)
        }
        .background(CaptureCanvas())
        .navigationTitle("Quipsly plan")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.load() }
        .refreshable { await store.load() }
        .accessibilityIdentifier("QuipslySubscriptionView")
    }

    private var currentPlanCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Your Quipsly", systemImage: "checkmark.seal.fill")
                .font(.headline)
                .foregroundStyle(Color.accentColor)
            Text(store.entitlement?.planName ?? "Loading your plan…")
                .font(.title2.bold())
            Text(accessDetail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            if store.isLoading {
                ProgressView().controlSize(.small)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .captureCard()
        .accessibilityIdentifier("CaptureCurrentQuipslyPlan")
    }

    private var accessDetail: String {
        guard let entitlement = store.entitlement else {
            return "Checking access shared by Capture and Nest."
        }
        if entitlement.accessMode == "EARLY_ACCESS" {
            return "Full early access is active. Quipsly will not remove access or hide your work while paid plans are being introduced."
        }
        if entitlement.cancelAtPeriodEnd, let end = formattedDate(entitlement.currentPeriodEnd) {
            return "Your subscription remains active through \(end)."
        }
        if let end = formattedDate(entitlement.currentPeriodEnd) {
            return "Active through \(end), with access shared across iPhone and the web."
        }
        return entitlement.entitled
            ? "Active across Quipsly Capture and Nest."
            : "Choose a plan to unlock the complete coaching workflow."
    }

    private func productCard(_ product: Product) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName).font(.headline)
                    Text(product.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                Text(product.displayPrice).font(.headline)
            }
            Button {
                Task { await store.purchase(product) }
            } label: {
                HStack {
                    if store.purchasingProductID == product.id {
                        ProgressView().tint(.white)
                    }
                    Text(store.entitlement?.planKey == planKey(for: product.id) ? "Current plan" : "Subscribe")
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.purchasingProductID != nil || store.entitlement?.planKey == planKey(for: product.id))
            .accessibilityIdentifier("CaptureSubscribe_\(product.id)")
        }
        .captureCard()
    }

    private func planKey(for productID: String) -> String? {
        store.entitlement?.products.first(where: { $0.productId == productID })?.planKey
    }

    private func formattedDate(_ value: String?) -> String? {
        guard let value,
              let date = ISO8601DateFormatter().date(from: value) else { return nil }
        return date.formatted(date: .abbreviated, time: .omitted)
    }
}
