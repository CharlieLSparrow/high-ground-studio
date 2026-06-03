import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // Combine prompt with cinematic keywords for better storyboard results
    const fullPrompt = `${prompt}, cinematic shot, movie storyboard, dramatic lighting, high quality, highly detailed`;
    
    // Use Pollinations AI for rapid prototyping without API keys
    // We add a cache buster so regenerating the same prompt produces a new seed
    const seed = Math.floor(Math.random() * 1000000);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(fullPrompt)}?width=800&height=450&seed=${seed}&nologo=true`;

    // Return the URL directly to the client
    return NextResponse.json({ url: imageUrl, success: true });
    
  } catch (error) {
    console.error("Storyboard image generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate image" },
      { status: 500 }
    );
  }
}
