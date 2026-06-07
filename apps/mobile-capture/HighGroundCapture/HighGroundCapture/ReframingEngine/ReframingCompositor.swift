import AVFoundation
import Metal
import CoreVideo
import simd

class ReframingCompositor: NSObject, AVVideoCompositing {

    var sourcePixelBufferAttributes: [String : Any]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]

    var requiredPixelBufferAttributesForRenderContext: [String : Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]

    var supportsWideColorSourceFrames: Bool = false
    var supportsHDRSourceFrames: Bool = false
    var canConformColorOfSourceFrames: Bool = false

    private let renderingQueue = DispatchQueue(label: "com.highgroundcapture.reframing.rendering", attributes: .concurrent)
    private var isCancelled = false
    private let isCancelledLock = NSLock()

    private var device: MTLDevice?
    private var commandQueue: MTLCommandQueue?
    private var computePipelineState: MTLComputePipelineState?
    private var textureCache: CVMetalTextureCache?

    struct ReframingUniforms {
        var rotationMatrix: simd_float3x3
        var fov: Float
        var aspectRatio: Float
    }

    override init() {
        super.init()
        setupMetal()
    }

    private func setupMetal() {
        guard let device = MTLCreateSystemDefaultDevice() else { return }
        self.device = device
        self.commandQueue = device.makeCommandQueue()

        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)

        let bundle = Bundle(for: type(of: self))
        guard let library = try? device.makeDefaultLibrary(bundle: bundle),
              let function = library.makeFunction(name: "equirectangularToRectilinear") else {
            print("Failed to load Metal library or function.")
            return
        }

        do {
            self.computePipelineState = try device.makeComputePipelineState(function: function)
        } catch {
            print("Failed to create compute pipeline state: \(error)")
        }
    }

    func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
    }

    func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
        renderingQueue.async {
            self.isCancelledLock.lock()
            let cancelled = self.isCancelled
            self.isCancelledLock.unlock()

            if cancelled {
                request.finishCancelledRequest()
                return
            }
            self.autoreleasepoolRender(request: request)
        }
    }

    private func autoreleasepoolRender(request: AVAsynchronousVideoCompositionRequest) {
        autoreleasepool {
            guard let instruction = request.videoCompositionInstruction as? ReframingCompositionInstruction,
                  let destinationPixelBuffer = request.renderContext.newPixelBuffer() else {
                request.finish(with: NSError(domain: "com.highgroundcapture", code: -1, userInfo: nil))
                return
            }

            guard let sourcePixelBuffer = request.sourceFrame(byTrackID: instruction.sourceTrackID) else {
                CVPixelBufferLockBaseAddress(destinationPixelBuffer, [])
                if let baseAddress = CVPixelBufferGetBaseAddress(destinationPixelBuffer) {
                    let bytesPerRow = CVPixelBufferGetBytesPerRow(destinationPixelBuffer)
                    let height = CVPixelBufferGetHeight(destinationPixelBuffer)
                    memset(baseAddress, 0, bytesPerRow * height)
                }
                CVPixelBufferUnlockBaseAddress(destinationPixelBuffer, [])
                request.finish(withComposedVideoFrame: destinationPixelBuffer)
                return
            }

            let timeSecs = (request.compositionTime - instruction.timeRange.start).seconds
            let (interpolatedFov, interpolatedMatrix) = self.interpolate(keyframes: instruction.keyframes, timeSecs: timeSecs)

            self.render(
                request: request,
                sourceBuffer: sourcePixelBuffer,
                destinationBuffer: destinationPixelBuffer,
                fov: interpolatedFov,
                rotationMatrix: interpolatedMatrix
            )
        }
    }

    private func render(request: AVAsynchronousVideoCompositionRequest, sourceBuffer: CVPixelBuffer, destinationBuffer: CVPixelBuffer, fov: Float, rotationMatrix: simd_float3x3) {
        guard let device = device,
              let commandQueue = commandQueue,
              let computePipelineState = computePipelineState,
              let textureCache = textureCache else {
            request.finish(with: NSError(domain: "com.highgroundcapture", code: -2, userInfo: nil))
            return
        }

        let width = CVPixelBufferGetWidth(destinationBuffer)
        let height = CVPixelBufferGetHeight(destinationBuffer)
        let aspectRatio = Float(width) / Float(height)

        var uniforms = ReframingUniforms(
            rotationMatrix: rotationMatrix,
            fov: fov,
            aspectRatio: aspectRatio
        )

        guard let (sourceTexture, sourceCVTex) = createTexture(from: sourceBuffer, pixelFormat: .bgra8Unorm, width: CVPixelBufferGetWidth(sourceBuffer), height: CVPixelBufferGetHeight(sourceBuffer), textureCache: textureCache) else {
            request.finish(with: NSError(domain: "com.highgroundcapture", code: -3, userInfo: nil))
            return
        }
        guard let (destinationTexture, destCVTex) = createTexture(from: destinationBuffer, pixelFormat: .bgra8Unorm, width: width, height: height, textureCache: textureCache) else {
            request.finish(with: NSError(domain: "com.highgroundcapture", code: -4, userInfo: nil))
            return
        }

        guard let commandBuffer = commandQueue.makeCommandBuffer(),
              let computeEncoder = commandBuffer.makeComputeCommandEncoder() else {
            request.finish(with: NSError(domain: "com.highgroundcapture", code: -5, userInfo: nil))
            return
        }

        computeEncoder.setComputePipelineState(computePipelineState)
        computeEncoder.setTexture(sourceTexture, index: 0)
        computeEncoder.setTexture(destinationTexture, index: 1)
        computeEncoder.setBytes(&uniforms, length: MemoryLayout<ReframingUniforms>.size, index: 0)

        let w = computePipelineState.threadExecutionWidth
        let h = computePipelineState.maxTotalThreadsPerThreadgroup / w
        let threadsPerThreadgroup = MTLSize(width: w, height: h, depth: 1)
        let threadsPerGrid = MTLSize(width: width, height: height, depth: 1)

        computeEncoder.dispatchThreads(threadsPerGrid, threadsPerThreadgroup: threadsPerThreadgroup)
        computeEncoder.endEncoding()

        commandBuffer.addCompletedHandler { _ in
            request.finish(withComposedVideoFrame: destinationBuffer)
            _ = sourceCVTex
            _ = destCVTex
        }
        commandBuffer.commit()
    }

    private func createTexture(from pixelBuffer: CVPixelBuffer, pixelFormat: MTLPixelFormat, width: Int, height: Int, textureCache: CVMetalTextureCache) -> (MTLTexture, CVMetalTexture)? {
        var cvTexture: CVMetalTexture?
        CVMetalTextureCacheCreateTextureFromImage(
            kCFAllocatorDefault,
            textureCache,
            pixelBuffer,
            nil,
            pixelFormat,
            width,
            height,
            0,
            &cvTexture
        )

        guard let cvTex = cvTexture, let mtlTex = CVMetalTextureGetTexture(cvTex) else { return nil }
        return (mtlTex, cvTex)
    }

    private func interpolate(keyframes: [TransformKeyframe], timeSecs: Double) -> (Float, simd_float3x3) {
        guard !keyframes.isEmpty else { return (Float.pi / 2, matrix_identity_float3x3) }

        let getFov = { (k: TransformKeyframe) -> Float in
            let f = (Float(k.scale ?? 0.5) * 180.0) * (Float.pi / 180.0)
            return min(max(f, 0.001), Float.pi - 0.001)
        }
        let getYaw = { (k: TransformKeyframe) -> Float in ((Float(k.x ?? 0.5) - 0.5) * 360.0) * (Float.pi / 180.0) }
        let getPitch = { (k: TransformKeyframe) -> Float in ((Float(k.y ?? 0.5) - 0.5) * 180.0) * (Float.pi / 180.0) }

        if keyframes.count == 1 {
            let k = keyframes[0]
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k)))
        }

        if timeSecs <= keyframes.first!.timeOffset {
            let k = keyframes.first!
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k)))
        }

        if timeSecs >= keyframes.last!.timeOffset {
            let k = keyframes.last!
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k)))
        }

        var k1 = keyframes[0]
        var k2 = keyframes[1]

        for i in 0..<(keyframes.count - 1) {
            if timeSecs >= keyframes[i].timeOffset && timeSecs < keyframes[i+1].timeOffset {
                k1 = keyframes[i]
                k2 = keyframes[i+1]
                break
            }
        }

        let duration = k2.timeOffset - k1.timeOffset
        var t = duration > 0 ? Float((timeSecs - k1.timeOffset) / duration) : 0.0

        if k1.easing == "ease-in-out" {
            t = t * t * (3.0 - 2.0 * t)
        }

        let fov1 = getFov(k1)
        let fov2 = getFov(k2)
        let yaw1 = getYaw(k1)
        let yaw2 = getYaw(k2)
        let pitch1 = getPitch(k1)
        let pitch2 = getPitch(k2)

        let fov = fov1 + (fov2 - fov1) * t

        var dyaw = (yaw2 - yaw1).truncatingRemainder(dividingBy: 2 * .pi)
        if dyaw > .pi { dyaw -= 2 * .pi }
        else if dyaw < -.pi { dyaw += 2 * .pi }

        var dpitch = (pitch2 - pitch1).truncatingRemainder(dividingBy: 2 * .pi)
        if dpitch > .pi { dpitch -= 2 * .pi }
        else if dpitch < -.pi { dpitch += 2 * .pi }

        let yaw = yaw1 + dyaw * t
        let pitch = pitch1 + dpitch * t

        return (fov, makeRotationMatrix(yaw: yaw, pitch: pitch))
    }

    private func makeRotationMatrix(yaw: Float, pitch: Float) -> simd_float3x3 {
        let cy = cos(yaw)
        let sy = sin(yaw)
        let cp = cos(pitch)
        let sp = sin(pitch)

        let R_y = simd_float3x3(
            simd_float3(cy, 0, sy),
            simd_float3(0, 1, 0),
            simd_float3(-sy, 0, cy)
        )

        let R_x = simd_float3x3(
            simd_float3(1, 0, 0),
            simd_float3(0, cp, sp),
            simd_float3(0, -sp, cp)
        )

        return R_y * R_x
    }

    func cancelAllPendingVideoCompositionRequests() {
        isCancelledLock.lock()
        isCancelled = true
        isCancelledLock.unlock()
        renderingQueue.async(flags: .barrier) {
            self.isCancelledLock.lock()
            self.isCancelled = false
            self.isCancelledLock.unlock()
        }
    }
}
