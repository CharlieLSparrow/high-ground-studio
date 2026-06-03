import { NextResponse } from 'next/server';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { getPrismaClient } from '@/lib/prisma';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const emailSequenceSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: { type: Type.STRING },
      dayOffset: { type: Type.INTEGER },
      label: { type: Type.STRING },
      subject: { type: Type.STRING, description: "A highly clickable subject line." },
      body: { type: Type.STRING, description: "The full text body of the email. Use natural, conversational tone." }
    },
    required: ['id', 'dayOffset', 'label', 'subject', 'body']
  },
  description: "A 5-day email sequence"
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

    const systemInstruction = `You are an elite Email Copywriter. 
Your goal is to write a 5-day welcome sequence for this specific target audience:
Demographics: ${persona.demographics}
Psychographics: ${persona.psychographics}
Pain Points: ${JSON.stringify(persona.painPointsJson)}
Desires: ${JSON.stringify(persona.desiresJson)}
Objections: ${JSON.stringify(persona.objectionsJson)}

The sequence must follow this structure exactly:
Day 0 (Immediate Welcome): Deliver the lead magnet and set expectations.
Day 1: Share a relatable story about their primary pain point.
Day 2: Value and objection handling.
Day 3: A soft pitch to the core offer (a solution to their problem).
Day 4: A hard pitch / urgency email.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: "Please write the 5-day email sequence. For the 'id' field, use '1', '2', '3', '4', '5'.",
      config: {
        responseMimeType: 'application/json',
        responseSchema: emailSequenceSchema,
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("Failed to generate content");
    }

    const emails = JSON.parse(response.text);

    return NextResponse.json(emails);

  } catch (error) {
    console.error("Error generating email sequence:", error);
    return NextResponse.json({ error: 'Failed to generate sequence' }, { status: 500 });
  }
}
