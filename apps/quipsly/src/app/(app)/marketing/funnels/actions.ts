'use server';

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { getPrismaClient } from '@/lib/prisma';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const insightsSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    insights: {
      type: Type.ARRAY,
      description: "A list of actionable insights about the marketing funnel's performance.",
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: "The type of insight. Must be 'warning', 'success', or 'info'.",
          },
          title: {
            type: Type.STRING,
            description: "A short, punchy title for the insight."
          },
          message: {
            type: Type.STRING,
            description: "A detailed description of the insight, explaining what is happening."
          },
          recommendation: {
            type: Type.STRING,
            description: "A specific, actionable recommendation to improve or capitalize on the insight."
          }
        },
        required: ["type", "title", "message"]
      }
    }
  },
  required: ["insights"]
};

export async function generateFunnelInsights(funnelStepsData: any[], personaId?: string) {
  try {
    let personaContext = "";
    if (personaId) {
      const prisma = getPrismaClient();
      const persona = await prisma.marketingPersona.findUnique({ where: { id: personaId } });
      if (persona) {
        personaContext = `\nTarget Audience Persona:\n${JSON.stringify({
          name: persona.name,
          painPoints: persona.painPointsJson,
          desires: persona.desiresJson,
          objections: persona.objectionsJson
        }, null, 2)}`;
      }
    }

    const inputToGemini = `I have a marketing funnel with the following performance data:\n\n${JSON.stringify(funnelStepsData, null, 2)}\n${personaContext}\n\nPlease analyze this funnel as an expert fractional CMO and Data Scientist. Identify bottlenecks (warnings), overperforming areas (successes), and general observations (info). Provide actionable recommendations for each insight, tailored to the target audience persona if one is provided.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: inputToGemini,
      config: {
        responseMimeType: 'application/json',
        responseSchema: insightsSchema,
        systemInstruction: "You are a world-class Marketing Strategist and Data Scientist. You provide actionable, data-driven insights on marketing funnels.",
        temperature: 0.2,
      }
    });

    if (!response.text) {
      throw new Error("Failed to generate insights from Gemini");
    }

    const result = JSON.parse(response.text);
    return { success: true, insights: result.insights };

  } catch (error: any) {
    console.error("Error generating funnel insights:", error);
    return { success: false, error: error.message || 'Failed to generate insights' };
  }
}
