import SwiftUI

struct LoginView: View {
    @StateObject private var authManager = AuthManager.shared

    var body: some View {
        VStack(spacing: 32) {
            Image(systemName: "mic.badge.plus")
                .resizable()
                .scaledToFit()
                .frame(width: 80, height: 80)
                .foregroundStyle(.teal)

            VStack(spacing: 8) {
                Text("Quipsly Capture")
                    .font(.largeTitle)
                    .fontWeight(.bold)
                
                Text("Sign in to your Quipsly Nest to record and sync audio directly to your projects.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 32)
            }

            if let error = authManager.errorMessage {
                Text(error)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button(action: {
                authManager.signIn()
            }) {
                HStack {
                    if authManager.isAuthenticating {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text("Connect with Quipsly")
                            .fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding()
                .background(Color.teal)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            .disabled(authManager.isAuthenticating)
            .padding(.horizontal, 32)
            .padding(.top, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }
}

#Preview {
    LoginView()
}
