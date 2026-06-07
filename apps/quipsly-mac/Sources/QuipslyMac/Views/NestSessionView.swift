import SwiftUI

struct NestSessionView: View {
    @EnvironmentObject private var appState: AppState
    @StateObject private var nativeAuthSession = NestNativeAuthSession()
    @State private var sessionStatus = "Not connected yet."
    @State private var isCheckingSession = false
    @State private var isBrowserSignInPending = false
    @State private var pastedCode = ""
    @State private var isAdvancedFallbackVisible = false
    @State private var hasAutoCheckedSavedToken = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    connectionCard
                    profileVault
                    primaryActions
                    advancedFallback
                    explanation
                }
                .padding(24)
                .frame(maxWidth: 980, alignment: .leading)
            }
        }
        .background(QuipslyBackground())
        .onAppear {
            guard !hasAutoCheckedSavedToken, !appState.nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return
            }
            hasAutoCheckedSavedToken = true
            Task {
                await checkSession()
            }
        }
        .onChange(of: appState.nestSessionToken) { _, token in
            guard !token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return
            }

            isBrowserSignInPending = false
            sessionStatus = "Nest device session updated. Verifying connection now..."
            Task {
                await checkSession()
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Nest Sign-In")
                .font(.largeTitle.bold())
            Text("Quipsly Mac uses the normal browser sign-in flow, exchanges a one-time code, then keeps a revocable device session in Keychain.")
                .font(.title3)
                .foregroundStyle(.secondary)
            Text("Google sign-in happens in the system browser where it belongs. Native API calls use short-lived access tokens refreshed from the saved Mac profile.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private var connectionCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                Image(systemName: appState.nestSessionToken.isEmpty ? "person.crop.circle.badge.exclamationmark" : "checkmark.seal.fill")
                    .font(.largeTitle)
                    .foregroundStyle(appState.nestSessionToken.isEmpty ? .orange : .green)

                VStack(alignment: .leading, spacing: 6) {
                    Text(connectionTitle)
                        .font(.title2.bold())
                    Text(sessionStatus)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)

                    if !appState.lastNestSessionEmail.isEmpty {
                        Text("Last verified: \(appState.lastNestSessionEmail) • \(appState.lastNestSessionCheckLabel)")
                            .font(.caption.bold())
                            .foregroundStyle(.green)
                            .textSelection(.enabled)
                    } else {
                        Text("No verified Nest session on this Mac yet.")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                    }

                    Text(signInHelpText)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var primaryActions: some View {
        HStack(alignment: .top, spacing: 12) {
            Button {
                signInWithBrowser()
            } label: {
                Label(primarySignInLabel, systemImage: "safari")
            }
            .buttonStyle(.borderedProminent)
            .disabled(isBrowserSignInPending || isCheckingSession)

            Button {
                Task {
                    await checkSession()
                }
            } label: {
                Label(isCheckingSession ? "Checking..." : "Check connection", systemImage: "checkmark.seal")
            }
            .disabled(isCheckingSession || appState.nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            if isBrowserSignInPending {
                Button {
                    isBrowserSignInPending = false
                    sessionStatus = appState.nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? "Browser sign-in canceled. Click Sign in with browser to try again."
                        : "Browser sign-in canceled. A token is saved; click Check connection to verify it."
                } label: {
                    Label("Cancel sign-in", systemImage: "xmark.circle")
                }
            }

            Button {
                openProjects()
            } label: {
                Label("Open Nest projects", systemImage: "square.and.arrow.up")
            }

            Button {
                openAccountSwitcher()
            } label: {
                Label("Switch browser account", systemImage: "person.2.badge.gearshape")
            }
            .disabled(nativeAuthSession.isSigningIn || isBrowserSignInPending || isCheckingSession)

            Button(role: .destructive) {
                isBrowserSignInPending = false
                pastedCode = ""
                appState.clearActiveNestSession()
                sessionStatus = "Active Nest profile cleared from this Mac."
            } label: {
                Label("Clear active", systemImage: "trash")
            }
            .disabled(appState.nestSessionToken.isEmpty && !isBrowserSignInPending)
        }
    }

    private var profileVault: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Profile vault")
                        .font(.title2.bold())
                    Text("Refresh credentials live in macOS Keychain. Pick a profile to swap the active Nest device session.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(appState.nestSessionProfiles.count) saved")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            if appState.nestSessionProfiles.isEmpty {
                Text("No saved profiles yet. Sign in once for each account you want Quipsly Mac to remember.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                VStack(spacing: 8) {
                    ForEach(appState.nestSessionProfiles) { profile in
                        profileRow(profile)
                    }
                }
            }
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func profileRow(_ profile: NestSessionProfile) -> some View {
        let isActive = profile.email == appState.activeNestSessionProfileEmail

        return HStack(alignment: .center, spacing: 12) {
            Image(systemName: isActive ? "checkmark.seal.fill" : "person.crop.circle")
                .font(.title2)
                .foregroundStyle(isActive ? .green : .secondary)

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(profile.name.isEmpty ? profile.email : profile.name)
                        .font(.headline)
                    if isActive {
                        Text("Active")
                            .font(.caption2.bold())
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.green.opacity(0.18), in: Capsule())
                            .foregroundStyle(.green)
                    }
                }
                Text(profile.email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                if !profile.lastVerifiedAt.isEmpty {
                    Text("Last verified \(profile.lastVerifiedAt)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if let refreshExpiresAt = profile.refreshTokenExpiresAt, !refreshExpiresAt.isEmpty {
                    Text("Device session expires \(refreshExpiresAt)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }

            Spacer()

            Button {
                if appState.switchNestSessionProfile(email: profile.email) {
                    sessionStatus = "Switched active Nest profile to \(profile.email). Verifying now..."
                    Task {
                        await checkSession()
                    }
                } else {
                    sessionStatus = "Could not switch to \(profile.email). Sign in again to refresh that profile."
                }
            } label: {
                Label(isActive ? "Active" : "Use", systemImage: isActive ? "checkmark" : "arrow.right.circle")
            }
            .disabled(isActive || isCheckingSession || isBrowserSignInPending)

            Button(role: .destructive) {
                appState.removeNestSessionProfile(email: profile.email)
                sessionStatus = "Removed \(profile.email) from the local profile vault."
            } label: {
                Label("Remove", systemImage: "trash")
            }
            .disabled(isCheckingSession || isBrowserSignInPending)
        }
        .padding()
        .background(
            isActive ? Color.green.opacity(0.10) : Color.secondary.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
    }

    private var advancedFallback: some View {
        DisclosureGroup(isExpanded: $isAdvancedFallbackVisible) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Use this only if the native browser callback is broken. Paste a one-time code from the recovery page; Quipsly Mac will exchange it for a normal device session.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                HStack {
                    SecureField("One-time recovery code from /api/mac/session-handoff", text: $pastedCode)
                        .textFieldStyle(.roundedBorder)

                    Button("Exchange code") {
                        let code = pastedCode.trimmingCharacters(in: .whitespacesAndNewlines)
                        sessionStatus = code.isEmpty
                            ? "No recovery code entered."
                            : "Exchanging one-time recovery code with Nest..."
                        if !code.isEmpty {
                            Task {
                                if await appState.exchangeRecoveryCode(code) {
                                    pastedCode = ""
                                    sessionStatus = "Recovery code exchanged. Verifying connection now..."
                                    await checkSession()
                                } else {
                                    sessionStatus = appState.lastNestSessionCheckLabel
                                }
                            }
                        }
                    }
                    .disabled(pastedCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Button {
                    NestSessionActions.openExternalHandoff(nestBaseURL: appState.nestURL)
                } label: {
                    Label("Open manual recovery token page", systemImage: "key")
                }
            }
            .padding(.top, 8)
        } label: {
            Label("Advanced recovery fallback", systemImage: "wrench.and.screwdriver")
                .font(.headline)
        }
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var explanation: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("What happens")
                .font(.title2.bold())
            Text("1. Quipsly Mac opens the normal browser sign-in flow pointed at Nest.")
            Text("2. Google/Patreon sign-in happens in the system browser security context, not inside our embedded editor webview.")
            Text("3. Nest redirects back to `quipslymac://auth/session` with a one-time code and matching state.")
            Text("4. Quipsly Mac exchanges that code for a revocable device session and stores the refresh credential in Keychain.")
            Text("5. Native features like chat, imports, episode sync, and timeline attach use short-lived access tokens that refresh automatically.")
        }
        .font(.callout)
        .foregroundStyle(.secondary)
        .padding()
        .background(.bar, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var connectionTitle: String {
        if !appState.lastNestSessionEmail.isEmpty {
            return "Connected to Nest"
        }
        if !appState.nestSessionToken.isEmpty {
            return "Device session saved; verification needed"
        }
        return "Not signed in"
    }

    private var signInHelpText: String {
        if isBrowserSignInPending {
            return "Complete sign-in in the browser. Quipsly Mac will catch the quipslymac:// callback automatically."
        }
        if !appState.lastNestSessionEmail.isEmpty {
            return "Native API calls use this Keychain-stored Mac device session. Switch account if you need a different user's Nests."
        }
        return "Use browser sign-in first. Manual code paste is only a recovery fallback."
    }

    private var primarySignInLabel: String {
        if isBrowserSignInPending {
            return "Waiting for browser..."
        }
        return appState.lastNestSessionEmail.isEmpty ? "Sign in with browser" : "Refresh Mac session"
    }

    private func signInWithBrowser() {
        isBrowserSignInPending = true
        let state = appState.beginNestNativeAuthState()
        let deviceLabel = Host.current().localizedName ?? "Quipsly Mac"
        sessionStatus = "Opening Nest in your browser. Approve “Open Quipsly” if macOS asks."
        NSWorkspace.shared.open(
            NestSessionActions.nativeHandoffURL(
                nestBaseURL: appState.nestURL,
                state: state,
                deviceLabel: deviceLabel
            )
        )

        Task {
            try? await Task.sleep(for: .seconds(45))
            guard isBrowserSignInPending else { return }
            isBrowserSignInPending = false
            sessionStatus = "Still waiting for the browser handoff. If Chrome shows an “Open Quipsly” prompt, approve it. Otherwise use the recovery fallback."
        }
    }

    private func openProjects() {
        guard var components = URLComponents(string: appState.nestURL) else { return }
        components.path = "/projects"
        components.queryItems = nil
        if let url = components.url {
            NSWorkspace.shared.open(url)
        }
    }

    private func openAccountSwitcher() {
        let state = appState.beginNestNativeAuthState()
        let deviceLabel = Host.current().localizedName ?? "Quipsly Mac"
        sessionStatus = "Opening account switcher in your browser. After choosing an account, continue back to Quipsly Mac."
        NSWorkspace.shared.open(
            NestSessionActions.accountSwitchURL(
                nestBaseURL: appState.nestURL,
                state: state,
                deviceLabel: deviceLabel
            )
        )
    }

    private func checkSession() async {
        guard var components = URLComponents(string: appState.nestURL) else {
            sessionStatus = "Nest URL is invalid."
            return
        }

        components.path = "/api/mac/session-check"
        components.queryItems = nil

        guard let url = components.url else {
            sessionStatus = "Could not build the Nest session endpoint."
            return
        }

        isCheckingSession = true
        defer { isCheckingSession = false }

        do {
            sessionStatus = "Refreshing Mac device session..."
            _ = await appState.refreshActiveNestSessionIfNeeded()
            sessionStatus = "Checking Nest session..."
            var baseRequest = URLRequest(url: url)
            baseRequest.timeoutInterval = 15
            let request = await NestCookieBridge.addingCookies(to: baseRequest)
            let (data, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
            let user = root?["user"] as? [String: Any]
            let email = user?["email"] as? String ?? user?["primaryEmail"] as? String ?? ""
            let source = root?["source"] as? String ?? "unknown"
            let error = root?["error"] as? String

                    if (200...299).contains(statusCode), !email.isEmpty {
                sessionStatus = "Verified as \(email) via \(source). Native Mac features can use Nest."
                appState.recordVerifiedNestSession(
                    email: email,
                    name: user?["name"] as? String
                )
            } else {
                sessionStatus = error ?? "Nest session check returned \(statusCode). Sign in with browser, then retry."
                appState.lastNestSessionEmail = ""
                appState.lastNestSessionCheckLabel = Date.now.formatted(date: .abbreviated, time: .shortened)
            }
        } catch {
            sessionStatus = "Session check failed: \(error.localizedDescription)"
            appState.lastNestSessionCheckLabel = Date.now.formatted(date: .abbreviated, time: .shortened)
        }
    }
}
