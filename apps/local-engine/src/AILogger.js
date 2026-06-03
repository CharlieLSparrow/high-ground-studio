"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AILogger = void 0;
const genai_1 = require("@google/genai");
const fs_1 = __importDefault(require("fs"));
class AILogger {
    ai;
    constructor() {
        this.ai = new genai_1.GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }
    async extractTagsAndRename(thumbnailPath, originalName) {
        try {
            if (!fs_1.default.existsSync(thumbnailPath)) {
                throw new Error(`Thumbnail not found: ${thumbnailPath}`);
            }
            const mimeType = thumbnailPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const fileBase64 = fs_1.default.readFileSync(thumbnailPath).toString('base64');
            const filePart = {
                inlineData: {
                    data: fileBase64,
                    mimeType
                }
            };
            const prompt = `
        You are an expert video editor assistant. I am offloading a new video file originally named "${originalName}".
        Look at this thumbnail extracted from the video.
        
        Provide your output strictly in the following JSON format:
        {
          "tags": ["3 to 5 descriptive tags (e.g. 'outdoors', 'interview', 'b-roll', 'action')"],
          "smartName": "A short, descriptive, file-system-safe name for this clip (e.g. 'Park_Interview_Broll.mp4')"
        }
        
        Ensure the smartName keeps the original extension. Do not use spaces or special characters in the smartName, use underscores.
      `;
            console.log(`🤖 Asking Gemini 2.5 Pro Vision to auto-log: ${originalName}`);
            const response = await this.ai.models.generateContent({
                model: 'gemini-2.5-pro',
                contents: [prompt, filePart],
                config: {
                    responseMimeType: "application/json",
                }
            });
            const responseText = response.text || '{}';
            const parsed = JSON.parse(responseText);
            console.log(`✅ AI Logged - Tags: ${parsed.tags?.join(', ')} | Smart Name: ${parsed.smartName}`);
            return {
                tags: parsed.tags || [],
                smartName: parsed.smartName || originalName
            };
        }
        catch (err) {
            console.error(`❌ AI Logger Error: ${err.message}`);
            return { tags: [], smartName: originalName };
        }
    }
}
exports.AILogger = AILogger;
