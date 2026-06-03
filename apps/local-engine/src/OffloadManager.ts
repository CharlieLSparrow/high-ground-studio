import fs from 'fs';
import path from 'path';
import xxhash from 'xxhash-wasm';

export class OffloadManager {
  private create64: any;

  async init() {
    if (this.create64) return;
    const xxhashApi = await xxhash();
    this.create64 = xxhashApi.create64;
  }

  public async offload(sourcePath: string, destinations: string[], onProgress: (prog: number) => void) {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const stat = fs.statSync(sourcePath);
      const totalBytes = stat.size;
      let readBytes = 0;

      const readStream = fs.createReadStream(sourcePath);
      const hasher = this.create64();

      // Create write streams for each destination
      const writeStreams = destinations.map(dest => {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        return fs.createWriteStream(dest);
      });

      readStream.on('data', (chunk: Buffer) => {
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

  private generateMHL(sourcePath: string, destinations: string[], hashHex: string) {
    const fileName = path.basename(sourcePath);
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
      fs.writeFileSync(mhlPath, mhlContent);
    });
  }
}
