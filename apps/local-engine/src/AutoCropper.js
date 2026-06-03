"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoCropper = void 0;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
class AutoCropper {
    /**
     * Slices a 16:9 landscape video into a 9:16 vertical video by cropping the center.
     */
    async sliceToVertical(sourcePath, onProgress) {
        return new Promise((resolve, reject) => {
            if (!fs_1.default.existsSync(sourcePath)) {
                return reject(new Error(`Source file not found: ${sourcePath}`));
            }
            const ext = path_1.default.extname(sourcePath);
            const baseName = path_1.default.basename(sourcePath, ext);
            const outputDir = path_1.default.dirname(sourcePath);
            const outputPath = path_1.default.join(outputDir, `${baseName}_vertical${ext}`);
            console.log(`🎬 Slicing to vertical: ${sourcePath} -> ${outputPath}`);
            (0, fluent_ffmpeg_1.default)(sourcePath)
                // crop=w:h:x:y
                // w = ih*9/16, h = ih, x = (iw-ow)/2, y = 0
                .videoFilters('crop=ih*9/16:ih')
                .outputOptions([
                '-c:v libx264',
                '-preset fast',
                '-crf 23',
                '-c:a copy'
            ])
                .on('progress', (progress) => {
                if (progress.percent) {
                    onProgress(Math.floor(progress.percent));
                }
            })
                .on('end', () => {
                console.log(`✅ Vertical slice complete: ${outputPath}`);
                resolve(outputPath);
            })
                .on('error', (err) => {
                console.error(`❌ FFMPEG Error: ${err.message}`);
                reject(err);
            })
                .save(outputPath);
        });
    }
}
exports.AutoCropper = AutoCropper;
