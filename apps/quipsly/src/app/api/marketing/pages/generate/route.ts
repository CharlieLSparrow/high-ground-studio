import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { getPrismaClient } from '@/lib/prisma';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const landingPageSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    headline: {
      type: Type.STRING,
      description: "A short, punchy, high-converting headline targeting the persona's core desire or pain point."
    },
    subheadline: {
      type: Type.STRING,
      description: "A compelling subheadline (1-2 sentences) explaining the value proposition and handling a major objection."
    },
    ctaText: {
      type: Type.STRING,
      description: "A short action-oriented Call to Action button text (e.g., 'Get My Free Guide')."
    }
  },
  required: ['headline', 'subheadline', 'ctaText']
};

export async function POST(req: Request) {
  try {
    const { personaId } = await req.json();

    if (!personaId) {
      return NextResponse.json({ error: 'personaId is required' }, { status: 400 });
    }

    const prisma = getPrismaClient();
    const persona = await prisma.marketingPersona.findUnique({
      where: { id: personaId }
    });

    if (!persona) {
      return NextResponse.json({ error: 'Persona not found' }, { status: 404 });
    }

    const systemInstruction = `You are an elite Direct Response Copywriter. 
Your goal is to write a high-converting landing page for this specific target audience:
Demographics: ${persona.demographics}
Psychographics: ${persona.psychographics}
Pain Points: ${JSON.stringify(persona.painPointsJson)}
Desires: ${JSON.stringify(persona.desiresJson)}
Objections: ${JSON.stringify(persona.objectionsJson)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Please generate the headline, subheadline, and CTA text for a lead capture landing page designed specifically to convert this persona.",
      config: {
        responseMimeType: 'application/json',
        responseSchema: landingPageSchema,
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("Failed to generate content");
    }

    const pageData = JSON.parse(response.text);

    return NextResponse.json(pageData);

  } catch (error) {
    console.error("Error generating landing page copy:", error);
    return NextResponse.json({ error: 'Failed to generate copy' }, { status: 500 });
  }
}
