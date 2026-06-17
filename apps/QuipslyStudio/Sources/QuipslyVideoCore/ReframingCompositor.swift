import AVFoundation
import Metal
import CoreVideo
import CoreImage
import simd

public class ReframingCompositor: NSObject, AVVideoCompositing {

    public var sourcePixelBufferAttributes: [String : Any]? = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]

    public var requiredPixelBufferAttributesForRenderContext: [String : Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferMetalCompatibilityKey as String: true
    ]

    public var supportsWideColorSourceFrames: Bool = false
    public var supportsHDRSourceFrames: Bool = false
    public var canConformColorOfSourceFrames: Bool = false

    private let renderingQueue = DispatchQueue(label: "com.highgroundcapture.reframing.rendering", attributes: .concurrent)
    private var isCancelled = false
    private let isCancelledLock = NSLock()

    private var device: MTLDevice?
    private var commandQueue: MTLCommandQueue?
    private var computePipelineState: MTLComputePipelineState?
    private var textureCache: CVMetalTextureCache?
    
    private let ciContext = CIContext(options: [.workingColorSpace: NSNull()])

    struct ReframingUniforms {
        var rotationMatrix: simd_float3x3
        var fov: Float
        var aspectRatio: Float
    }

    public override init() {
        super.init()
        setupMetal()
    }

    private func setupMetal() {
        guard let device = MTLCreateSystemDefaultDevice() else { return }
        self.device = device
        self.commandQueue = device.makeCommandQueue()

        CVMetalTextureCacheCreate(kCFAllocatorDefault, nil, device, nil, &textureCache)

        guard let library = try? device.makeDefaultLibrary(bundle: Bundle.module),
              let function = library.makeFunction(name: "equirectangularToRectilinear") else {
            print("Failed to load Metal library or function. Make sure ReframingShader.metal is compiled in the package.")
            return
        }

        self.computePipelineState = try? device.makeComputePipelineState(function: function)
    }

    public func renderContextChanged(_ newRenderContext: AVVideoCompositionRenderContext) {
    }

    public func startRequest(_ request: AVAsynchronousVideoCompositionRequest) {
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

            if instruction.is360 {
                self.render(
                    request: request,
                    sourceBuffer: sourcePixelBuffer,
                    destinationBuffer: destinationPixelBuffer,
                    fov: interpolatedFov,
                    rotationMatrix: interpolatedMatrix
                )
            } else {
                self.render2D(
                    request: request,
                    sourceBuffer: sourcePixelBuffer,
                    destinationBuffer: destinationPixelBuffer,
                    keyframes: instruction.keyframes,
                    timeSecs: timeSecs
                )
            }
        }
    }
    
    private func render2D(request: AVAsynchronousVideoCompositionRequest, sourceBuffer: CVPixelBuffer, destinationBuffer: CVPixelBuffer, keyframes: [FramingKeyframe], timeSecs: Double) {
        // Find interpolated scale, offsetX, offsetY
        // For 2D, we interpret fov as scale, yaw as pan, pitch as tilt
        
        var fov: Double = 90.0
        var yaw: Double = 0.0
        var pitch: Double = 0.0
        
        if keyframes.isEmpty {
            // Default
        } else if keyframes.count == 1 {
            fov = keyframes[0].fov
            yaw = keyframes[0].yaw
            pitch = keyframes[0].pitch
        } else {
            let sorted = keyframes.sorted { $0.time < $1.time }
            if timeSecs <= sorted.first!.time {
                fov = sorted.first!.fov
                yaw = sorted.first!.yaw
                pitch = sorted.first!.pitch
            } else if timeSecs >= sorted.last!.time {
                fov = sorted.last!.fov
                yaw = sorted.last!.yaw
                pitch = sorted.last!.pitch
            } else {
                for i in 0..<(sorted.count - 1) {
                    let k1 = sorted[i]
                    let k2 = sorted[i+1]
                    if timeSecs >= k1.time && timeSecs < k2.time {
                        let duration = k2.time - k1.time
                        var t = duration > 0 ? (timeSecs - k1.time) / duration : 0.0
                        
                        // We can apply interpolation mode here if needed, but keeping it simple for 2D fallback:
                        switch k1.interpolation {
                        case .hold:
                            t = 0.0
                        case .linear:
                            break // t is linear
                        case .bezier:
                            t = t * t * (3.0 - 2.0 * t) // Ease in out
                        }
                        
                        fov = k1.fov + (k2.fov - k1.fov) * t
                        yaw = k1.yaw + (k2.yaw - k1.yaw) * t
                        pitch = k1.pitch + (k2.pitch - k1.pitch) * t
                        break
                    }
                }
            }
        }
        
        let sourceImage = CIImage(cvPixelBuffer: sourceBuffer)
        
        let sourceWidth = CGFloat(CVPixelBufferGetWidth(sourceBuffer))
        let sourceHeight = CGFloat(CVPixelBufferGetHeight(sourceBuffer))
        let destWidth = CGFloat(CVPixelBufferGetWidth(destinationBuffer))
        let destHeight = CGFloat(CVPixelBufferGetHeight(destinationBuffer))
        
        // Base aspect fit/fill to match destination
        let widthRatio = destWidth / sourceWidth
        let heightRatio = destHeight / sourceHeight
        let baseScale = max(widthRatio, heightRatio) // Aspect fill
        
        // Map FOV to scale (90 is 1.0x, 30 is 3.0x, 150 is 0.6x)
        let scale = 90.0 / max(fov, 1.0)
        
        // Map yaw to offsetX (0 is 0.5, -180 is 0.0, 180 is 1.0)
        let offsetX = 0.5 + (yaw / 360.0)
        
        // Map pitch to offsetY (0 is 0.5, -90 is 0.0, 90 is 1.0)
        let offsetY = 0.5 + (pitch / 180.0)
        
        // Apply user scale (zoom)
        let finalScale = baseScale * CGFloat(scale)
        
        // User pan/tilt: offsetX/offsetY are 0...1 (0.5 is center)
        // We map 0...1 to moving the image left/right and up/down.
        let moveX = (CGFloat(0.5 - offsetX) * destWidth * 2.0)
        let moveY = (CGFloat(offsetY - 0.5) * destHeight * 2.0) // Invert Y for CIImage origin at bottom-left
        
        let tx = (destWidth - sourceWidth * finalScale) / 2.0 + moveX
        let ty = (destHeight - sourceHeight * finalScale) / 2.0 + moveY
        
        let transform = CGAffineTransform(translationX: tx, y: ty).scaledBy(x: finalScale, y: finalScale)
        
        let transformedImage = sourceImage.transformed(by: transform)
        
        ciContext.render(transformedImage, to: destinationBuffer, bounds: CGRect(x: 0, y: 0, width: destWidth, height: destHeight), colorSpace: nil)
        
        request.finish(withComposedVideoFrame: destinationBuffer)
    }

    private func render(request: AVAsynchronousVideoCompositionRequest, sourceBuffer: CVPixelBuffer, destinationBuffer: CVPixelBuffer, fov: Float, rotationMatrix: simd_float3x3) {
        guard let commandQueue = commandQueue,
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

    private func interpolate(keyframes: [FramingKeyframe], timeSecs: Double) -> (Float, simd_float3x3) {
        guard !keyframes.isEmpty else { return (Float.pi / 2, matrix_identity_float3x3) }

        let getFov = { (k: FramingKeyframe) -> Float in min(max(Float(k.fov) * .pi / 180.0, 0.001), .pi - 0.001) }
        let getYaw = { (k: FramingKeyframe) -> Float in Float(k.yaw) * .pi / 180.0 }
        let getPitch = { (k: FramingKeyframe) -> Float in Float(k.pitch) * .pi / 180.0 }
        let getRoll = { (k: FramingKeyframe) -> Float in Float(k.roll) * .pi / 180.0 }

        if keyframes.count == 1 {
            let k = keyframes[0]
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k), roll: getRoll(k)))
        }

        if timeSecs <= keyframes.first!.time {
            let k = keyframes.first!
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k), roll: getRoll(k)))
        }

        if timeSecs >= keyframes.last!.time {
            let k = keyframes.last!
            return (getFov(k), makeRotationMatrix(yaw: getYaw(k), pitch: getPitch(k), roll: getRoll(k)))
        }

        var k1 = keyframes[0]
        var k2 = keyframes[1]

        for i in 0..<(keyframes.count - 1) {
            if timeSecs >= keyframes[i].time && timeSecs < keyframes[i+1].time {
                k1 = keyframes[i]
                k2 = keyframes[i+1]
                break
            }
        }
        
        if k1.interpolation == .hold {
            return (getFov(k1), makeRotationMatrix(yaw: getYaw(k1), pitch: getPitch(k1), roll: getRoll(k1)))
        }

        let duration = k2.time - k1.time
        var t = duration > 0 ? Float((timeSecs - k1.time) / duration) : 0.0

        if k1.interpolation == .bezier || k1.interpolation == .linear {
            // Bezier approximation (smooth ease-in-out)
            if k1.interpolation == .bezier {
                t = t * t * (3.0 - 2.0 * t)
            }
        }

        let fov1 = getFov(k1)
        let fov2 = getFov(k2)
        let yaw1 = getYaw(k1)
        let yaw2 = getYaw(k2)
        let pitch1 = getPitch(k1)
        let pitch2 = getPitch(k2)
        let roll1 = getRoll(k1)
        let roll2 = getRoll(k2)

        let fov = fov1 + (fov2 - fov1) * t

        var dyaw = (yaw2 - yaw1).truncatingRemainder(dividingBy: 2 * .pi)
        if dyaw > .pi { dyaw -= 2 * .pi }
        else if dyaw < -.pi { dyaw += 2 * .pi }

        var dpitch = (pitch2 - pitch1).truncatingRemainder(dividingBy: 2 * .pi)
        if dpitch > .pi { dpitch -= 2 * .pi }
        else if dpitch < -.pi { dpitch += 2 * .pi }
        
        var droll = (roll2 - roll1).truncatingRemainder(dividingBy: 2 * .pi)
        if droll > .pi { droll -= 2 * .pi }
        else if droll < -.pi { droll += 2 * .pi }

        let yaw = yaw1 + dyaw * t
        let pitch = pitch1 + dpitch * t
        let roll = roll1 + droll * t

        return (fov, makeRotationMatrix(yaw: yaw, pitch: pitch, roll: roll))
    }

    private func makeRotationMatrix(yaw: Float, pitch: Float, roll: Float) -> simd_float3x3 {
        let cy = cos(yaw)
        let sy = sin(yaw)
        let cp = cos(pitch)
        let sp = sin(pitch)
        let cr = cos(roll)
        let sr = sin(roll)

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
        
        let R_z = simd_float3x3(
            simd_float3(cr, -sr, 0),
            simd_float3(sr, cr, 0),
            simd_float3(0, 0, 1)
        )

        return R_y * R_x * R_z
    }

    public func cancelAllPendingVideoCompositionRequests() {
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
