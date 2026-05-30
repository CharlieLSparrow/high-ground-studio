import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({});

const SYSTEM_PROMPT = `
You are the head writer for "The AI Tonight Show".
Every day, you receive a summary of the latest AI news.
Your job is to write a 3-minute opening monologue and desk bit.
There are exactly two characters:
1. "Host": A hyper-intelligent, warm, witty, and slightly awe-struck AI.
2. "Sidekick": The human sidekick who is enthusiastic but frequently misunderstands the technology.

Respond ONLY with a valid JSON array of dialogue lines in this exact format:
[
  { "role": "host", "line": "Welcome to The AI Tonight Show! I'm your host, and with me as always is my human sidekick." },
  { "role": "sidekick", "line": "I'm just happy to be here, and honestly, a little terrified of you." }
]
Do not include markdown blocks or any other text outside the JSON array.
`;

async function main() {
  console.log('Writing tonight\'s script...');
  
  // In a real flow, this would read from content/publish/news/ai/today.md
  // For the prototype, we pass in a mock news blurb
  const mockNews = `
  1. DeepMind's new agent can play 3D games with zero prior knowledge.
  2. A new paper shows LLMs can be tricked by adding "ignore previous instructions" to images.
  3. The EU passed a new AI act focusing on deepfake regulation.
  `;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Here is the news for tonight's show:\n${mockNews}`,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.8,
            responseMimeType: "application/json"
        }
    });

    const scriptJson = response.text;
    
    // Save to the AI niche's data folder
    const outputPath = path.join(process.cwd(), 'apps/web/src/app/sites/ai/tonight-show/today-script.json');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    await fs.writeFile(outputPath, scriptJson, 'utf-8');
    console.log(`Successfully generated Tonight Show script at: ${outputPath}`);

  } catch (error) {
    console.error('Error writing script:', error);
  }
}

main();
