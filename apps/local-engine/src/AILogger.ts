import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

export class AILogger {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  public async extractTagsAndRename(thumbnailPath: string, originalName: string): Promise<{ tags: string[], smartName: string }> {
    try {
      if (!fs.existsSync(thumbnailPath)) {
        throw new Error(`Thumbnail not found: ${thumbnailPath}`);
      }

      const mimeType = thumbnailPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const fileBase64 = fs.readFileSync(thumbnailPath).toString('base64');
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

    } catch (err: any) {
      console.error(`❌ AI Logger Error: ${err.message}`);
      return { tags: [], smartName: originalName };
    }
  }
}
