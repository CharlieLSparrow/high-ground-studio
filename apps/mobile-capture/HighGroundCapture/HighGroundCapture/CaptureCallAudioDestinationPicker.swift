import SwiftUI

/// Makes the remembered companion-device choice visible before joining.
struct CaptureCallAudioDestinationPicker: View {
    @Binding var audioOnAnotherDevice: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var disabled = false

    private var layout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 8))
            : AnyLayout(HStackLayout(spacing: 8))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Call audio").font(.subheadline.weight(.medium))
            layout {
                choice("This device", otherDevice: false, systemImage: "headphones")
                choice("Another device", otherDevice: true, systemImage: "iphone.and.arrow.forward")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureCallAudioDestinationPicker")
    }

    private func choice(_ title: String, otherDevice: Bool, systemImage: String) -> some View {
        let selected = audioOnAnotherDevice == otherDevice
        return Button { audioOnAnotherDevice = otherDevice } label: {
            Label(title, systemImage: systemImage)
                .font(.subheadline.weight(.medium))
                .frame(maxWidth: .infinity, minHeight: 44)
                .padding(.horizontal, 8)
                .foregroundStyle(selected ? CapturePalette.primaryText : CapturePalette.secondaryText)
                .background(selected ? CapturePalette.accent.opacity(0.12) : Color.clear,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(selected ? CapturePalette.accent : CapturePalette.secondaryText.opacity(0.25)))
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityIdentifier(otherDevice ? "CaptureCallAudioOtherDevice" : "CaptureCallAudioThisDevice")
    }
}
