import AppKit
import SwiftUI

struct NestSessionInlineStatusView: View {
    @EnvironmentObject private var appState: AppState

    var context: String
    var compact = false
    var showsActions = true

    private var hasConnectedProfile: Bool {
        !appState.activeNestSessionProfileEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !appState.nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: compact ? .center : .top, spacing: 10) {
            Image(systemName: hasConnectedProfile ? "checkmark.seal.fill" : "person.crop.circle.badge.exclamationmark")
                .foregroundStyle(hasConnectedProfile ? .green : .orange)
                .font(compact ? .body : .title3)

            VStack(alignment: .leading, spacing: compact ? 1 : 4) {
                Text(hasConnectedProfile ? "Nest connected" : "Nest sign-in needed")
                    .font(compact ? .caption.bold() : .headline)

                Text(statusText)
                    .font(compact ? .caption2 : .caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(compact ? 2 : nil)
                    .textSelection(.enabled)
            }

            Spacer(minLength: 8)

            if showsActions {
                HStack(spacing: 8) {
                    Button {
                        appState.selectedSection = .nestSession
                    } label: {
                        Label(hasConnectedProfile ? "Details" : "Session", systemImage: "person.badge.key")
                    }

                    if !hasConnectedProfile {
                        Button {
                            signInWithBrowser()
                        } label: {
                            Label("Sign in", systemImage: "safari")
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
        }
        .padding(compact ? 10 : 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            hasConnectedProfile ? Color.green.opacity(0.09) : Color.orange.opacity(0.12),
            in: RoundedRectangle(cornerRadius: compact ? 14 : 16, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: compact ? 14 : 16, style: .continuous)
                .stroke(hasConnectedProfile ? Color.green.opacity(0.18) : Color.orange.opacity(0.22))
        }
    }

    private var statusText: String {
        if hasConnectedProfile {
            return "\(context) can use \(appState.activeNestSessionProfileEmail)."
        }

        return "\(context) needs a Mac Nest profile before it can write to Nest."
    }

    private func signInWithBrowser() {
        let state = appState.beginNestNativeAuthState()
        let deviceLabel = Host.current().localizedName ?? "Quipsly Mac"
        NSWorkspace.shared.open(
            NestSessionActions.nativeHandoffURL(
                nestBaseURL: appState.nestURL,
                state: state,
                deviceLabel: deviceLabel
            )
        )
        appState.selectedSection = .nestSession
        appState.lastMacCallbackDiagnosticLabel = "Browser sign-in opened from \(context). Approve Open Quipsly Mac if macOS asks."
    }
}
