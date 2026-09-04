import AuthenticationServices
import Foundation
import SwiftUI
import GoogleSignInSwift

private struct QuipslyAppleSignInButton: UIViewRepresentable {
    let colorScheme: ColorScheme
    let action: () -> Void

    final class Coordinator: NSObject {
        let action: () -> Void

        init(action: @escaping () -> Void) {
            self.action = action
        }

        @objc func activate() {
            action()
        }
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(action: action)
    }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(
            authorizationButtonType: .continue,
            authorizationButtonStyle: colorScheme == .dark ? .white : .black
        )
        button.cornerRadius = 10
        button.addTarget(context.coordinator, action: #selector(Coordinator.activate), for: .touchUpInside)
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {}
}

struct LoginView: View {
    @StateObject private var authManager = AuthManager.shared
    @Environment(\.colorScheme) private var colorScheme
    @State private var email = ""
    @State private var password = ""
    @State private var passwordMode: PasswordMode = .signIn
    @State private var showsEmailAccess = CaptureLaunchConfiguration.usesRuntimeSmoke
    @State private var didApplyRuntimeSmokeCredentials = false
    @FocusState private var focusedField: Field?

    private enum PasswordMode: Equatable {
        case signIn
        case createAccount
    }

    private enum Field {
        case email
        case password
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                Spacer(minLength: 46)

                VStack(spacing: 18) {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [CapturePalette.accent, CapturePalette.accent],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 84, height: 84)
                            .shadow(color: CapturePalette.accent.opacity(0.24), radius: 18, y: 9)

                        Image(systemName: "waveform.badge.mic")
                            .font(.system(size: 35, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    .accessibilityHidden(true)

                    VStack(spacing: 7) {
                        Text("Quipsly Capture")
                            .font(.largeTitle.weight(.bold))

                        Text("Sign in to your sessions, recordings, notes, and tasks.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: 340)
                    }
                }

                VStack(spacing: 14) {
                    federatedSignInSection

                    authFeedback

                    emailAccessSection

                    DisclosureGroup {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Share a small redacted snapshot if Quipsly will not sign in. It never includes the email or password you typed.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )

                            LabeledContent(
                                "App",
                                value: versionLine
                            )
                            LabeledContent(
                                "Nest",
                                value: supportNestHost
                            )

                            ShareLink(
                                item:
                                    signInSupportSnapshot
                                        .shareText,
                                subject: Text(
                                    "Quipsly Capture sign-in support snapshot"
                                )
                            ) {
                                Label(
                                    "Share sign-in diagnostics",
                                    systemImage:
                                        "square.and.arrow.up"
                                )
                                .frame(
                                    maxWidth: .infinity,
                                    alignment: .center
                                )
                            }
                            .buttonStyle(.bordered)
                            .accessibilityHint(
                                "Opens the system share sheet with redacted build, device, system, and Nest-host diagnostics."
                            )
                            .accessibilityIdentifier(
                                "QuipslyCaptureShareSignInSupport"
                            )

                            Text(
                                CaptureSupportSnapshot
                                    .privacyBoundary
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                            .accessibilityIdentifier(
                                "QuipslyCaptureSignInSupportPrivacyBoundary"
                            )
                        }
                        .padding(.top, 10)
                    } label: {
                        Label(
                            "Having trouble signing in?",
                            systemImage: "lifepreserver"
                        )
                        .font(.subheadline.weight(.semibold))
                        .accessibilityIdentifier(
                            "QuipslyCaptureSignInSupportDisclosure"
                        )
                    }
                    .padding(14)
                    .background(
                        .regularMaterial,
                        in: RoundedRectangle(
                            cornerRadius: 14,
                            style: .continuous
                        )
                    )
                }
                .padding(.top, 36)

                Spacer(minLength: 42)

                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 18) { legalLinks }
                    VStack(spacing: 12) { legalLinks }
                }
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.bottom, 24)
            }
            .frame(maxWidth: 460)
            .padding(.horizontal, 24)
            .frame(maxWidth: .infinity)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(
            LinearGradient(
                colors: [Color(.systemBackground), CapturePalette.accent.opacity(0.045), Color(.systemBackground)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()
        )
        .onAppear {
            applyRuntimeSmokeCredentialsIfNeeded()
        }
        .onChange(of: authManager.recentlyCreatedEmail) { _, createdEmail in
            guard let createdEmail else { return }
            passwordMode = .signIn
            email = createdEmail
            password = ""
            focusedField = .password
        }
        .accessibilityIdentifier("QuipslyCaptureLoginView")
    }

    private var emailAccessSection: some View {
        VStack(spacing: 14) {
            HStack(spacing: 12) {
                Divider()
                Text("or")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .fixedSize()
                Divider()
            }
            .accessibilityElement(children: .combine)

            Button {
                guard !authManager.isAuthenticating else { return }
                withAnimation(.easeInOut(duration: 0.2)) {
                    showsEmailAccess.toggle()
                }
                focusedField = showsEmailAccess && email.isEmpty ? .email : nil
            } label: {
                HStack(spacing: 10) {
                    Label(
                        showsEmailAccess ? "Email" : "Continue with email",
                        systemImage: "envelope.fill"
                    )
                    .font(.headline)
                    Spacer()
                    Image(systemName: showsEmailAccess ? "chevron.up" : "chevron.down")
                        .font(.caption.weight(.bold))
                }
                .frame(maxWidth: .infinity, minHeight: 50)
            }
            .buttonStyle(.bordered)
            .disabled(authManager.isAuthenticating)
            .accessibilityHint(showsEmailAccess ? "Hides email sign in." : "Shows email sign in and account creation.")
            .accessibilityIdentifier("QuipslyCaptureContinueWithEmail")

            if showsEmailAccess {
                passwordModeSelector

                Text(passwordModeDescription)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)

                TextField("Email", text: $email)
                    .textContentType(.username)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.next)
                    .focused($focusedField, equals: .email)
                    .onSubmit { focusedField = .password }
                    .captureLoginField()
                    .accessibilityIdentifier("QuipslyCaptureEmailField")

                SecureField(
                    passwordMode == .createAccount ? "Create password" : "Password",
                    text: $password
                )
                .textContentType(
                    passwordMode == .createAccount && !CaptureLaunchConfiguration.usesLoginPreview
                        ? .newPassword
                        : .password
                )
                .submitLabel(.go)
                .focused($focusedField, equals: .password)
                .onSubmit { submitPasswordAuthIfReady() }
                .captureLoginField()
                .accessibilityIdentifier("QuipslyCapturePasswordField")

                if passwordMode == .createAccount {
                    if !password.isEmpty, password.count < 8 {
                        authValidationLabel(
                            "Use at least 8 characters. A short phrase is easier to remember.",
                            systemImage: "character.cursor.ibeam"
                        )
                        .accessibilityIdentifier("QuipslyCapturePasswordLengthHint")
                    }
                }

                Button(action: submitPasswordAuthIfReady) {
                    HStack(spacing: 10) {
                        if authManager.isAuthenticating {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: passwordMode == .createAccount ? "person.badge.plus" : "arrow.right")
                        }
                        Text(primaryActionTitle)
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity, minHeight: 52)
                }
                .captureProminentButton(fill: CapturePalette.actionFill)
                .disabled(!canSubmitPasswordAuth)
                .accessibilityIdentifier(
                    passwordMode == .createAccount
                        ? "QuipslyCaptureCreateAccountButton"
                        : "QuipslyCaptureSignInButton"
                )

                if passwordMode == .signIn {
                    Button {
                        focusedField = nil
                        authManager.sendPasswordReset(email: email)
                    } label: {
                        Label("Forgot password?", systemImage: "envelope.badge")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(authManager.isAuthenticating)
                    .accessibilityIdentifier("QuipslyCapturePasswordResetButton")
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("QuipslyCaptureEmailAccess")
    }

    private var federatedSignInSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            QuipslyAppleSignInButton(colorScheme: colorScheme) {
                focusedField = nil
                authManager.signInWithApple()
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .disabled(authManager.isAuthenticating)
            .opacity(authManager.isAuthenticating ? 0.55 : 1)
            .accessibilityLabel("Continue with Apple")
            .accessibilityIdentifier("QuipslyCaptureAppleSignInButton")

            GoogleSignInButton(
                scheme: colorScheme == .dark ? .dark : .light,
                style: .wide,
                state: authManager.isAuthenticating || !authManager.googleSignInAvailable
                    ? .disabled
                    : .normal
            ) {
                focusedField = nil
                authManager.signInWithGoogle()
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .accessibilityIdentifier("QuipslyCaptureGoogleSignInButton")

            if !authManager.googleSignInAvailable {
                Text("Google sign-in is temporarily unavailable. You can still sign in with email below.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("QuipslyCaptureGoogleIdentityContinuityHint")
            }
        }
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var authFeedback: some View {
        if let status = authManager.statusMessage {
            Label(status, systemImage: "checkmark.circle.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(CapturePalette.success)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("QuipslyCaptureLoginStatus")
        }

        if let error = authManager.errorMessage {
            Label(error, systemImage: "exclamationmark.triangle.fill")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.red)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("QuipslyCaptureLoginError")
        }
    }

    private var passwordModeSelector: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                passwordModeButton(.signIn)
                passwordModeButton(.createAccount)
            }
            VStack(spacing: 10) {
                passwordModeButton(.signIn)
                passwordModeButton(.createAccount)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("QuipslyCapturePasswordModeSelector")
    }

    private func passwordModeButton(_ mode: PasswordMode) -> some View {
        Button {
            guard !authManager.isAuthenticating else { return }
            passwordMode = mode
            password = ""
            authManager.clearAuthFeedback()
            focusedField = email.isEmpty ? .email : .password
        } label: {
            Label(
                mode == .signIn ? "Sign in" : "Create account",
                systemImage: mode == .signIn ? "person.crop.circle" : "person.crop.circle.badge.plus"
            )
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
        }
        .captureProminentButton(fill: passwordMode == mode ? CapturePalette.actionFill : Color.secondary.opacity(0.16))
        .foregroundStyle(passwordMode == mode ? Color.white : Color.primary)
        .disabled(authManager.isAuthenticating)
        .accessibilityIdentifier(
            mode == .signIn
                ? "QuipslyCaptureSignInModeButton"
                : "QuipslyCaptureCreateAccountModeButton"
        )
        .accessibilityAddTraits(passwordMode == mode ? .isSelected : [])
    }

    @ViewBuilder
    private var legalLinks: some View {
        Link(destination: URL(string: "https://www.quipsly.com/support")!) {
            Text("Help")
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
            .accessibilityIdentifier("QuipslyCaptureAccountSupportLink")
        Link(destination: URL(string: "https://www.quipsly.com/privacy")!) {
            Text("Privacy")
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        Link(destination: URL(string: "https://www.quipsly.com/terms")!) {
            Text("Terms")
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
    }

    private var passwordModeDescription: String {
        switch passwordMode {
        case .signIn:
            return "Use the email and password for your Quipsly account."
        case .createAccount:
            return "Create an account with email and password."
        }
    }

    private var primaryActionTitle: String {
        if authManager.isAuthenticating { return "Working…" }
        return passwordMode == .createAccount ? "Create account" : "Sign in"
    }

    private var versionLine: String {
        let version =
            Bundle.main.object(
                forInfoDictionaryKey:
                    "CFBundleShortVersionString"
            ) as? String
            ?? "unknown"
        let build =
            Bundle.main.object(
                forInfoDictionaryKey: "CFBundleVersion"
            ) as? String
            ?? "unknown"
        return "Quipsly Capture \(version) (\(build))"
    }

    private var supportNestHost: String {
        let baseURL = normalizedNestBaseURL(
            ProcessInfo.processInfo.environment[
                "QUIPSLY_API_BASE_URL"
            ]
                ?? (
                    Bundle.main.object(
                        forInfoDictionaryKey:
                            "QUIPSLY_API_BASE_URL"
                    ) as? String
                )
                ?? "https://nest.quipsly.com"
        )
        return URL(string: baseURL)?.host
            ?? "configured Nest"
    }

    private var signInSupportSnapshot: CaptureSupportSnapshot {
        let runtime = CaptureRuntimeEvidence.current()
        return CaptureSupportSnapshot(
            generatedAt: Date(),
            surface: "Sign-in",
            appVersion: runtime.appVersion,
            appBuild: runtime.appBuild,
            installationClass: runtime.installationClass,
            deviceModelIdentifier:
                runtime.deviceModelIdentifier,
            systemName: runtime.systemName,
            systemVersion: runtime.systemVersion,
            accountAccessMode:
                authManager.accessMode.rawValue,
            nestHost: supportNestHost,
            audioCaptureState: "not started",
            videoCaptureState: "not started",
            microphonePermissionState:
                runtime.microphonePermissionState,
            cameraPermissionState:
                runtime.cameraPermissionState,
            speechRecognitionPermissionState:
                runtime.speechRecognitionPermissionState,
            roomState: "not connected",
            audioRoutePortType: nil,
            localOriginalCount: nil,
            recoverableUploadCount: nil,
            captureAttentionCount: nil,
            latestCaptureAttentionAt: nil,
            latestCaptureAttentionCategory: nil,
            latestCaptureTransitionState: nil,
            latestCaptureSelectedSessionWasLocal: nil,
            latestCaptureCanonicalSessionCount: nil,
            latestCaptureLocalDraftSessionCount: nil,
            previewMode:
                CaptureLaunchConfiguration
                    .usesLoginPreview
        )
    }

    private var canSubmitPasswordAuth: Bool {
        guard !authManager.isAuthenticating,
              !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !password.isEmpty else {
            return false
        }
        if passwordMode == .createAccount {
            return password.count >= 8
        }
        return true
    }

    private func submitPasswordAuthIfReady() {
        guard canSubmitPasswordAuth else { return }
        focusedField = nil
        let normalizedEmail = email.trimmingCharacters(in: .whitespacesAndNewlines)
        switch passwordMode {
        case .signIn:
            authManager.signIn(email: normalizedEmail, password: password)
        case .createAccount:
            authManager.createAccount(email: normalizedEmail, password: password)
        }
    }

    private func authValidationLabel(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(CapturePalette.brass)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func applyRuntimeSmokeCredentialsIfNeeded() {
        #if DEBUG
        guard !didApplyRuntimeSmokeCredentials else { return }
        guard ProcessInfo.processInfo.arguments.contains("--quipsly-capture-runtime-smoke") else { return }
        didApplyRuntimeSmokeCredentials = true

        let environment = ProcessInfo.processInfo.environment
        let credentialsPath = environment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"] ?? "/tmp/quipsly-capture-runtime-ui-smoke-credentials.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: credentialsPath)),
              let payload = try? JSONDecoder().decode(RuntimeSmokeCredentialPayload.self, from: data),
              !payload.email.isEmpty,
              !payload.password.isEmpty else {
            return
        }

        email = payload.email
        password = payload.password
        passwordMode = .signIn
        guard !authManager.isAuthenticated, !authManager.isAuthenticating else { return }
        authManager.signIn(email: payload.email, password: payload.password)
        #endif
    }
}

private struct RuntimeSmokeCredentialPayload: Decodable {
    let baseURL: String
    let email: String
    let password: String
}

private extension View {
    func captureLoginField() -> some View {
        self
            .padding(.horizontal, 16)
            .frame(minHeight: 54)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(Color.primary.opacity(0.08), lineWidth: 1)
            }
    }
}

#Preview {
    LoginView()
}
