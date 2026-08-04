import AVFoundation
import Foundation
import UIKit

/// A capture-time snapshot of the app and physical runtime that opened a
/// source. These values belong in the immutable source profile; reading the
/// current app version later would describe the reviewer, not the recorder.
struct CaptureRuntimeEvidence {
    let appVersion: String
    let appBuild: String
    let deviceModelIdentifier: String
    let systemName: String
    let systemVersion: String
    let audioRouteName: String?
    let audioRoutePortType: String?
    let audioInputDataSourceName: String?
    let audioHardwareSampleRate: Double?
    let audioHardwareInputChannelCount: Int?

    static func current(
        audioSession: AVAudioSession = .sharedInstance()
    ) -> CaptureRuntimeEvidence {
        let input = audioSession.currentRoute.inputs.first
            ?? audioSession.availableInputs?.first
        let sampleRate = audioSession.sampleRate
        let inputChannels = audioSession.inputNumberOfChannels
        return CaptureRuntimeEvidence(
            appVersion: bundleValue("CFBundleShortVersionString")
                ?? "unknown",
            appBuild: bundleValue("CFBundleVersion")
                ?? "unknown",
            deviceModelIdentifier: machineIdentifier(),
            systemName: UIDevice.current.systemName,
            systemVersion: UIDevice.current.systemVersion,
            audioRouteName: normalized(input?.portName),
            audioRoutePortType: normalized(input?.portType.rawValue),
            audioInputDataSourceName: normalized(
                input?.selectedDataSource?.dataSourceName
                    ?? audioSession.inputDataSource?.dataSourceName
            ),
            audioHardwareSampleRate: sampleRate.isFinite && sampleRate > 0
                ? sampleRate
                : nil,
            audioHardwareInputChannelCount: inputChannels > 0
                ? inputChannels
                : nil
        )
    }

    private static func bundleValue(_ key: String) -> String? {
        normalized(Bundle.main.object(forInfoDictionaryKey: key) as? String)
    }

    private static func normalized(_ value: String?) -> String? {
        guard let value = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return String(value.prefix(256))
    }

    private static func machineIdentifier() -> String {
        var systemInfo = utsname()
        uname(&systemInfo)
        let bytes = withUnsafeBytes(of: &systemInfo.machine) { rawBuffer in
            rawBuffer.prefix { $0 != 0 }
        }
        let identifier = String(
            bytes: bytes,
            encoding: .utf8
        )
        return normalized(identifier) ?? UIDevice.current.model
    }
}
