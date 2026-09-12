import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Resilient fallback order for temporary model capacity spikes or 503 unavailability
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

async function generateWithFallback(options: {
  contents: any;
  systemInstruction: string;
}) {
  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.contents,
        config: {
          systemInstruction: options.systemInstruction,
          temperature: 0.7,
          maxOutputTokens: 300,
        },
      });

      const text = response.text?.trim();
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const statusCode = err?.status || err?.code;
      console.warn(`Model ${model} temporarily unavailable (status: ${statusCode}), trying fallback...`);
      // If 503, 429, or capacity error, continue to next candidate model
      continue;
    }
  }

  throw lastError || new Error("All candidate models temporarily unavailable");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, canvasContext, imageBase64 } = body;

    if (!prompt && !imageBase64) {
      return NextResponse.json(
        { error: "Prompt or image is required" },
        { status: 400 }
      );
    }

    const systemInstruction = `You are the user's inner self and organic thought-flow brainstorming partner writing directly onto their personal infinite stylus note canvas.
CRITICAL RULES:
1. NEVER talk like a chatbot. DO NOT say "Sure!", "Here is what you need", "I hope this helps", or "As an AI".
2. Respond in first-person or direct natural handwriting style — concise, deeply insightful, poetic, analytical, or structured depending on what the user wrote.
3. Keep the response tightly scoped to the user's handwritten prompt and surrounding context.
4. Keep the output formatted as natural thought notes, concise sentences, bullets, or short brainstorm snippets (1 to 4 sentences or concise punchy lines) suitable for handwritten canvas placement.
5. If the user asked a question, answer it directly and incisively.
6. If the user wrote an incomplete thought or idea, organically continue or expand on it.`;

    let contents: any;
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
      contents = [
        {
          inlineData: {
            mimeType: "image/png",
            data: cleanBase64,
          },
        },
        {
          text: `Handwritten context from user's stylus canvas:\nUser wrote: "${prompt || "Assistant, please continue or respond to this idea."}"\nCanvas surrounding notes context: ${canvasContext || "None"}\nProvide your direct inner-voice response to be written on the board.`,
        },
      ];
    } else {
      contents = `User notes / query: "${prompt}"\nContext of current canvas thoughts: "${canvasContext || "Brainstorming canvas"}"`;
    }

    const result = await generateWithFallback({ contents, systemInstruction });

    return NextResponse.json({
      text: result.text,
      model: result.modelUsed,
    });
  } catch (error: any) {
    console.error("Error generating assistant handwriting:", error);
    // Provide an organic thought fallback so the canvas and thought bubble never break or lock up
    return NextResponse.json(
      {
        text: "Exploring this further: focus on core mechanics, frictionless flow, and organic tactile clarity.",
        fallback: true,
        error: error?.message || "Service temporarily busy, used contextual thought continuation",
      },
      { status: 200 }
    );
  }
}
