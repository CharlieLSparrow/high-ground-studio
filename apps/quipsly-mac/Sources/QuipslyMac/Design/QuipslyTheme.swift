import SwiftUI

struct QuipslyTheme {
    static let darkDeepBrown = Color(red: 0.12, green: 0.08, blue: 0.06) // #1E1510
    static let earthyLightBeige = Color(red: 0.95, green: 0.92, blue: 0.85) // #F3EAD8
    static let mossGreen = Color(red: 0.36, green: 0.54, blue: 0.27) // #5D8945
    static let burntOrange = Color(red: 0.66, green: 0.40, blue: 0.24) // #A9653E
    static let clayTeal = Color(red: 0.18, green: 0.51, blue: 0.47) // #2D8277
    static let earthyAmber = Color(red: 0.65, green: 0.49, blue: 0.19) // #A77C31

    @Environment(\.colorScheme) private static var systemColorScheme

    static func backgroundBase(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? darkDeepBrown : earthyLightBeige
    }
}

extension Color {
    static var quipslyMossGreen: Color { QuipslyTheme.mossGreen }
    static var quipslyBurntOrange: Color { QuipslyTheme.burntOrange }
    static var quipslyClayTeal: Color { QuipslyTheme.clayTeal }
    static var quipslyEarthyAmber: Color { QuipslyTheme.earthyAmber }
}

extension ShapeStyle where Self == Color {
    static var quipslyMossGreen: Color { QuipslyTheme.mossGreen }
    static var quipslyBurntOrange: Color { QuipslyTheme.burntOrange }
    static var quipslyClayTeal: Color { QuipslyTheme.clayTeal }
    static var quipslyEarthyAmber: Color { QuipslyTheme.earthyAmber }
}

struct QuipslyBackground: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    QuipslyTheme.backgroundBase(for: colorScheme),
                    Color.quipslyClayTeal.opacity(colorScheme == .dark ? 0.18 : 0.08),
                    Color.quipslyBurntOrange.opacity(colorScheme == .dark ? 0.12 : 0.05),
                    QuipslyTheme.backgroundBase(for: colorScheme)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            // Decorative "liquid" blurred circles using earthy tones
            Circle()
                .fill(Color.quipslyClayTeal.opacity(colorScheme == .dark ? 0.25 : 0.15))
                .frame(width: 420)
                .blur(radius: 64)
                .offset(x: -360, y: -260)

            Circle()
                .fill(Color.quipslyBurntOrange.opacity(colorScheme == .dark ? 0.20 : 0.10))
                .frame(width: 520)
                .blur(radius: 86)
                .offset(x: 460, y: 320)

            Circle()
                .fill(Color.quipslyMossGreen.opacity(colorScheme == .dark ? 0.18 : 0.08))
                .frame(width: 380)
                .blur(radius: 72)
                .offset(x: 120, y: -180)

            // Scattered Quipsly Mascots
            Image("quipsly-mascot", bundle: .module)
                .resizable()
                .scaledToFit()
                .frame(width: 320)
                .opacity(colorScheme == .dark ? 0.12 : 0.05)
                .rotationEffect(.degrees(-12))
                .offset(x: -380, y: 160)
            
            Image("quipsly-mascot", bundle: .module)
                .resizable()
                .scaledToFit()
                .frame(width: 240)
                .opacity(colorScheme == .dark ? 0.08 : 0.04)
                .rotationEffect(.degrees(8))
                .offset(x: 480, y: -220)
        }
    }
}

extension View {
    func panelStyle() -> some View {
        padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(.white.opacity(0.08))
            }
    }
}
