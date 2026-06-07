import SwiftUI

struct NativeLoginView: View {
    @EnvironmentObject var authManager: PatreonAuthManager

    var body: some View {
        ZStack {
            Color(red: 0.05, green: 0.05, blue: 0.05).ignoresSafeArea()

            VStack(spacing: 30) {
                Text("Quipsly")
                    .font(.system(size: 60, weight: .black, design: .rounded))
                    .foregroundColor(Color(red: 0.85, green: 0.71, blue: 0.47))

                Text("Your Story, Everywhere.")
                    .font(.headline)
                    .foregroundColor(.gray)

                Spacer().frame(height: 50)

                Button(action: {
                    authManager.authenticate()
                }) {
                    HStack {
                        Image(systemName: "p.square.fill")
                            .font(.title2)
                        Text("Continue with Patreon")
                            .font(.headline)
                    }
                    .foregroundColor(.white)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.orange)
                    .cornerRadius(12)
                }
                .padding(.horizontal, 40)
                .accessibilityIdentifier("LoginWithPatreonButton")

                if let error = authManager.authError {
                    Text(error)
                        .foregroundColor(.red)
                        .font(.caption)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)
                }
            }
        }
    }
}

#Preview {
    NativeLoginView()
        .environmentObject(PatreonAuthManager())
}
