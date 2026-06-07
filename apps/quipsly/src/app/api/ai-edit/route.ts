import { GoogleGenAI, Type } from "@google/genai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { transcriptBlocks } = await req.json();

    if (!transcriptBlocks || !Array.isArray(transcriptBlocks) || transcriptBlocks.length === 0) {
      return NextResponse.json({ edits: [] });
    }

    // Ensure API key is present
    if (!process.env.GEMINI_API_KEY) {
      console.warn("No GEMINI_API_KEY found, returning mock response for testing.");
      // Return a mock response if we have no key (useful for local dev)
      return NextResponse.json({
        edits: [
          { type: "deactivate", blockId: transcriptBlocks[0]?.id },
          { type: "add_keyframe", timeOffset: 2.5, x: 45, y: 0, scale: 70 },
        ]
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Format the transcript for the AI to read
    const formattedTranscript = transcriptBlocks.map((block: any) =>
      `[BlockID: ${block.id}] [Time: ${block.startIn.toFixed(2)}s - ${(block.startIn + block.duration).toFixed(2)}s]: ${block.text}`
    ).join("\n");

    const prompt = `
You are an expert video editor. You have been given the transcript of a video, broken down into blocks with timestamps.
Your job is to analyze the text and suggest edits to make the video more engaging.

1. **Deactivate Filler**: Find blocks that seem like filler words, pauses, stumbles, or completely off-topic rambling, and suggest deactivating them.
2. **Keyframe Reframing (360 Video)**: If the speaker says something exciting, a punchline, or mentions a specific direction (like "look over there"), suggest adding a keyframe to reframe the 360 camera.
   - 'x' is Yaw (Pan left/right, -180 to 180)
   - 'y' is Pitch (Tilt up/down, -90 to 90)
   - 'scale' is Field of View (FOV, 10 to 150. Lower is zoomed in, 90 is default).

Transcript:
${formattedTranscript}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            edits: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "Either 'deactivate' to cut a block, or 'add_keyframe' to move the camera.",
                    enum: ["deactivate", "add_keyframe"]
                  },
                  blockId: {
                    type: Type.STRING,
                    description: "The BlockID to deactivate (only required if type is 'deactivate')."
                  },
                  timeOffset: {
                    type: Type.NUMBER,
                    description: "The time in seconds to add the keyframe (only required if type is 'add_keyframe')."
                  },
                  x: {
                    type: Type.NUMBER,
                    description: "Yaw angle (-180 to 180)"
                  },
                  y: {
                    type: Type.NUMBER,
                    description: "Pitch angle (-90 to 90)"
                  },
                  scale: {
                    type: Type.NUMBER,
                    description: "Field of View (10 to 150)"
                  }
                },
                required: ["type"]
              }
            }
          },
          required: ["edits"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      return NextResponse.json({ edits: [] });
    }

    const parsedResult = JSON.parse(resultText);
    return NextResponse.json(parsedResult);

  } catch (error: any) {
    console.error("Error in AI Auto-Edit API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
