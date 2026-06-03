import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

// Initialize the Gemini client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const psychographicsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    painPointsJson: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 key pain points or things that keep this audience up at night."
    },
    desiresJson: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 core desires or outcomes this audience secretly wants."
    },
    objectionsJson: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 reasons this audience might say 'no' to buying a product (objections)."
    },
    demographics: {
      type: Type.STRING,
      description: "A short sentence describing their age, occupation, and income."
    },
    psychographics: {
      type: Type.STRING,
      description: "A short paragraph describing their deep psychological state, fears, and ultimate desires."
    },
    contentPillarsJson: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-5 topics or content pillars that this audience would find incredibly valuable."
    },
    name: {
      type: Type.STRING,
      description: "A catchy persona name, e.g. 'Overwhelmed Agency Owner Alex'"
    }
  },
  required: ['painPointsJson', 'desiresJson', 'objectionsJson', 'demographics', 'psychographics', 'contentPillarsJson', 'name']
};

export async function POST(req: Request) {
  try {
    const { prompt, csvData } = await req.json();

    let inputToGemini = '';

    if (csvData) {
      inputToGemini = `I have uploaded raw data (survey responses, reviews, or support emails) from my target audience. \n\nRaw Data:\n${csvData}\n\nPlease analyze this data to extract the statistically significant pain points, desires, and objections, and construct a complete Living Avatar Matrix persona.`;
    } else if (prompt) {
      inputToGemini = `I want to help the following niche: "${prompt}". \n\nPlease generate a complete Living Avatar Matrix persona based on the market psychology of this niche.`;
    } else {
      return NextResponse.json({ error: 'Must provide either prompt or csvData' }, { status: 400 });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: inputToGemini,
      config: {
        responseMimeType: 'application/json',
        responseSchema: psychographicsSchema,
        systemInstruction: "You are a world-class Marketing Strategist and Data Scientist. Your job is to create deeply accurate psychological profiles of target audiences.",
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("Failed to generate content");
    }

    const personaData = JSON.parse(response.text);

    // Sprint 3: Dynamic Quipsly Cosplay Engine using Imagen 3
    let avatarImageUrl = '';
    try {
      const imagePrompt = `A 3D Pixar style cute robot mascot named Quipsly cosplaying for this demographic: ${personaData.demographics}. The robot is looking stressed about ${personaData.painPointsJson[0]}. High quality, 4k, clean studio background.`;
      
      const imageResponse = await ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: '1:1'
        }
      });

      const generatedImage = imageResponse.generatedImages?.[0];
      const base64Data = generatedImage?.image?.imageBytes;

      if (base64Data) {
        
        // Generate a safe filename
        const safeName = personaData.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const filename = `${safeName}_${Date.now()}.png`;
        
        // Save to public/avatars
        const publicAvatarsDir = path.join(process.cwd(), 'public', 'avatars');
        await fs.mkdir(publicAvatarsDir, { recursive: true });
        
        const filePath = path.join(publicAvatarsDir, filename);
        await fs.writeFile(filePath, Buffer.from(base64Data, 'base64'));
        
        avatarImageUrl = `/avatars/${filename}`;
        personaData.avatarImageUrl = avatarImageUrl;
      }
    } catch (imageError) {
      console.error("Failed to generate cosplay image:", imageError);
      // We still want to return the persona data even if image generation fails
      personaData.avatarImageUrl = null;
    }

    return NextResponse.json(personaData);

  } catch (error) {
    console.error("Error generating persona:", error);
    return NextResponse.json({ error: 'Failed to generate persona' }, { status: 500 });
  }
}
