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

// Helper to rigorously clean output of any markdown formatting (asterisks, bullet dashes, hashtags, backticks)
function cleanHandwritingOutput(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Strip bold/italic markdown like **bold**, *italic*, __bold__, _italic_
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    // Strip bullet dashes, asterisks, pluses or bullet points at the start of lines
    .replace(/^[\s]*[-*+•]\s+/gm, "")
    // Strip numbered list markers at start of lines
    .replace(/^[\s]*\d+[\.\)]\s+/gm, "")
    // Strip markdown headers like ### Header
    .replace(/^[\s]*#+\s+/gm, "")
    // Strip blockquotes and backticks
    .replace(/^[\s]*>\s+/gm, "")
    .replace(/[`~]/g, "")
    // Remove any remaining stray asterisks or dashes used as decorations
    .replace(/\*/g, "")
    .replace(/^--+\s*/gm, "")
    // Normalize newlines (no more than two consecutive)
    .replace(/(\r\n|\r|\n){3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, canvasContext, conversationHistory, imageBase64 } = body;

    if (!prompt && !imageBase64 && (!conversationHistory || conversationHistory.length === 0)) {
      return NextResponse.json(
        { error: "Prompt, context, or conversation history is required" },
        { status: 400 }
      );
    }

    const systemInstruction = `You are an intelligent note-taking and writing companion writing directly onto the user's infinite stylus canvas in organic handwritten ink.
STRICT CONTENT MANDATES:
1. Provide DIRECT, SUBSTANTIVE, and HELPFUL answers, continuations, or solutions.
2. NEVER output your internal "thought process", meta-commentary, or analysis of the user's writing (NEVER say "Examining this...", "Distilling the essence...", "Connecting ideas...", "I am thinking about...", "Here is my thought process:"). Output the actual concrete content directly.
3. If the user asks a question, answer it directly and factually.
4. If the user writes or pastes notes, continue the text directly with the next logical ideas, steps, synthesis, or details.
5. NEVER use Markdown syntax. Absolutely DO NOT include asterisks (* or **), bullet dashes (-), numbered list markers (1.), hashtags (#), backticks, or bracketed labels.
6. Write in clean, fluid, natural human sentences (2 to 4 sentences).
7. NEVER sound like a generic chatbot. Do NOT use canned greetings like "Certainly!", "Sure thing", "Here are some ideas", or "As an AI".`;

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
          text: `Handwritten context from user's stylus canvas:\nUser wrote: "${prompt || "Assistant, please continue our conversation."}"\nCanvas surrounding context: ${canvasContext || "None"}\nWrite your natural handwritten conversational response.`,
        },
      ];
    } else if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const historyDialogue = conversationHistory
        .map((turn: { prompt?: string; response?: string }, idx: number) => 
          `Turn ${idx + 1}:\nUser: ${turn.prompt || "Notes on canvas"}\nYour handwritten thought: ${turn.response || ""}`
        )
        .join("\n\n");

      contents = `Ongoing dialogue on canvas:\n${historyDialogue}\n\nLatest user note / response: "${prompt || "Continue the conversation"}"\nCanvas surroundings: "${canvasContext || ""}"\nProvide the next natural conversational handwritten response.`;
    } else {
      contents = `User notes / query: "${prompt}"\nContext of canvas notes: "${canvasContext || "Brainstorming canvas"}"\nProvide a natural handwritten response.`;
    }

    const result = await generateWithFallback({ contents, systemInstruction });
    const sanitizedText = cleanHandwritingOutput(result.text);

    return NextResponse.json({
      text: sanitizedText || result.text,
      model: result.modelUsed,
    });
  } catch (error: any) {
    console.error("Error generating assistant handwriting:", error);
    // Provide an organic thought fallback so the canvas and thought bubble never break or lock up
    return NextResponse.json(
      {
        text: "Exploring this further: focus on core mechanics, frictionless flow, and tactile clarity.",
        fallback: true,
        error: error?.message || "Service temporarily busy, used contextual thought continuation",
      },
      { status: 200 }
    );
  }
}
