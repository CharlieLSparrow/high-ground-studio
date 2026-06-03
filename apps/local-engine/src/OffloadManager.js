"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OffloadManager = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xxhash_wasm_1 = __importDefault(require("xxhash-wasm"));
class OffloadManager {
    create64;
    async init() {
        if (this.create64)
            return;
        const xxhashApi = await (0, xxhash_wasm_1.default)();
        this.create64 = xxhashApi.create64;
    }
    async offload(sourcePath, destinations, onProgress) {
        await this.init();
        return new Promise((resolve, reject) => {
            const stat = fs_1.default.statSync(sourcePath);
            const totalBytes = stat.size;
            let readBytes = 0;
            const readStream = fs_1.default.createReadStream(sourcePath);
            const hasher = this.create64();
            // Create write streams for each destination
            const writeStreams = destinations.map(dest => {
                fs_1.default.mkdirSync(path_1.default.dirname(dest), { recursive: true });
                return fs_1.default.createWriteStream(dest);
            });
            readStream.on('data', (chunk) => {
                readBytes += chunk.length;
                hasher.update(chunk);
                // Push chunk to all write streams
                writeStreams.forEach(ws => ws.write(chunk));
                const prog = Math.floor((readBytes / totalBytes) * 100);
                onProgress(prog);
            });
            readStream.on('end', () => {
                const hashBigInt = hasher.digest();
                const hashHex = hashBigInt.toString(16);
                // Generate MHL (Media Hash List) stub
                this.generateMHL(sourcePath, destinations, hashHex);
                writeStreams.forEach(ws => ws.end());
                resolve({ hash: hashHex, destinations });
            });
            readStream.on('error', (err) => {
                writeStreams.forEach(ws => ws.destroy());
                reject(err);
            });
        });
    }
    generateMHL(sourcePath, destinations, hashHex) {
        const fileName = path_1.default.basename(sourcePath);
        const mhlContent = `<?xml version="1.0" encoding="UTF-8"?>
<hashlist version="1.1">
  <creatorinfo>
    <name>High Ground Studio Engine</name>
  </creatorinfo>
  <hash>
    <file>${fileName}</file>
    <xxhash64>${hashHex}</xxhash64>
  </hash>
</hashlist>`;
        destinations.forEach(dest => {
            const mhlPath = dest + '.mhl';
            fs_1.default.writeFileSync(mhlPath, mhlContent);
        });
    }
}
exports.OffloadManager = OffloadManager;
