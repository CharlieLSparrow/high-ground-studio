import Foundation
import AVFoundation

public enum ProxyError: Error {
    case exportSessionCreationFailed
    case exportFailed(Error?)
}

public actor ProxyEngine {
    public static let shared = ProxyEngine()
    
    private init() {}
    
    public func generateProxy(for url: URL) async throws -> URL {
        let options: [String: Any]? = url.pathExtension.lowercased() == "insv" ? ["AVURLAssetOutOfBandMIMETypeKey": "video/mp4"] : nil
        let asset = AVURLAsset(url: url, options: options)
        
        let outputFileName = UUID().uuidString + "_proxy.mp4"
        let outputURL = FileManager.default.temporaryDirectory.appendingPathComponent(outputFileName)
        
        // Use 960x540 for maximum speed, or 1280x720. 960x540 is very common for proxies.
        guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPreset960x540) else {
            throw ProxyError.exportSessionCreationFailed
        }
        
        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        
        await exportSession.export()
        
        switch exportSession.status {
        case .completed:
            return outputURL
        case .failed, .cancelled:
            throw ProxyError.exportFailed(exportSession.error)
        default:
            throw ProxyError.exportFailed(nil)
        }
    }
}
