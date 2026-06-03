"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportGenerator = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class ReportGenerator {
    generateDailyReport(data) {
        if (data.length === 0)
            return;
        // We put the report in the first destination folder of the first file offloaded
        const reportDir = path_1.default.dirname(data[0].destinations[0]);
        const reportPath = path_1.default.join(reportDir, `Offload_Report_${new Date().toISOString().split('T')[0]}.html`);
        let html = `
    <html>
      <head>
        <title>High Ground Daily Offload Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f111a; color: #fff; padding: 40px; }
          h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
          .clip { display: flex; align-items: center; background: #1a1d2d; padding: 20px; margin-bottom: 20px; border-radius: 8px; border: 1px solid #333; }
          .thumb { max-width: 200px; border-radius: 4px; margin-right: 20px; }
          .details { flex-grow: 1; }
          .hash { font-family: monospace; color: #4ade80; }
          .dest { color: #94a3b8; font-size: 0.9em; }
          .tags { margin-top: 10px; }
          .tag { display: inline-block; background: #6366f1; color: white; padding: 2px 8px; border-radius: 12px; font-size: 0.8em; margin-right: 5px; }
          .smart-name { color: #facc15; font-weight: bold; margin-bottom: 5px; }
        </style>
      </head>
      <body>
        <h1>High Ground Daily Offload Report</h1>
        <p>Generated at: ${new Date().toISOString()}</p>
        <div class="clips">
    `;
        for (const clip of data) {
            const thumbSrc = fs_1.default.existsSync(clip.thumbnailPath) ? `file://${clip.thumbnailPath}` : '';
            const tagsHtml = clip.tags ? clip.tags.map(t => `<span class="tag">${t}</span>`).join('') : '';
            html += `
          <div class="clip">
            ${thumbSrc ? `<img src="${thumbSrc}" class="thumb" />` : '<div class="thumb" style="width:200px;height:112px;background:#333;"></div>'}
            <div class="details">
              ${clip.smartName && clip.smartName !== path_1.default.basename(clip.sourceFile) ? `<div class="smart-name">✨ ${clip.smartName}</div>` : ''}
              <h2>${path_1.default.basename(clip.sourceFile)}</h2>
              <p>Size: ${clip.sizeMb} MB</p>
              <p class="dest">Destinations: ${clip.destinations.join(', ')}</p>
              <p>xxHash64: <span class="hash">${clip.hashHex}</span></p>
              ${tagsHtml ? `<div class="tags">${tagsHtml}</div>` : ''}
            </div>
          </div>
      `;
        }
        html += `
        </div>
      </body>
    </html>`;
        fs_1.default.writeFileSync(reportPath, html);
        console.log(`📄 Daily Report generated at ${reportPath}`);
        return reportPath;
    }
}
exports.ReportGenerator = ReportGenerator;
