"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyGenerator = void 0;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
const path_1 = __importDefault(require("path"));
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
class ProxyGenerator {
    async generateProxyAndThumbnail(sourcePath) {
        return new Promise((resolve, reject) => {
            const dir = path_1.default.dirname(sourcePath);
            const ext = path_1.default.extname(sourcePath);
            const baseName = path_1.default.basename(sourcePath, ext);
            const proxyPath = path_1.default.join(dir, `${baseName}_proxy.mp4`);
            const thumbnailPath = path_1.default.join(dir, `${baseName}_thumb.png`);
            // We use fluent-ffmpeg to take a screenshot at 1 second in, and then encode a 1080p proxy.
            console.log(`🎬 Generating thumbnail for ${sourcePath}...`);
            (0, fluent_ffmpeg_1.default)(sourcePath)
                .screenshots({
                timestamps: ['1'],
                filename: path_1.default.basename(thumbnailPath),
                folder: dir,
                size: '640x360'
            })
                .on('end', () => {
                console.log(`🎬 Generating proxy for ${sourcePath}...`);
                (0, fluent_ffmpeg_1.default)(sourcePath)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .size('1920x1080')
                    .outputOptions(['-preset ultrafast', '-crf 28'])
                    .save(proxyPath)
                    .on('end', () => {
                    console.log(`✅ Proxy generated: ${proxyPath}`);
                    resolve({ proxyPath, thumbnailPath });
                })
                    .on('error', (err) => {
                    console.error(`❌ Proxy generation error: ${err.message}`);
                    reject(err);
                });
            })
                .on('error', (err) => {
                console.error(`❌ Thumbnail generation error: ${err.message}`);
                reject(err);
            });
        });
    }
}
exports.ProxyGenerator = ProxyGenerator;
