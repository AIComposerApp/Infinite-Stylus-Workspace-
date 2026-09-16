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
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
          temperature: 0.4,
          maxOutputTokens: 800,
        },
      });

      const text = response.text?.trim();
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      let statusCode = err?.status || err?.code;
      let errMsg = typeof err?.message === "string" ? err.message : "";
      try {
        const parsed = JSON.parse(errMsg);
        if (parsed?.error?.status) statusCode = parsed.error.status;
        if (parsed?.error?.code) statusCode = parsed.error.code;
        if (parsed?.error?.message) errMsg = parsed.error.message;
      } catch (_) {}

      // If temporary busy (503 / 429), brief pause before fallback
      const isTemporaryBusy = statusCode === 503 || statusCode === 429 || statusCode === "UNAVAILABLE" || errMsg.includes("high demand");
      if (isTemporaryBusy) {
        await sleep(350);
      }
      continue;
    }
  }

  throw lastError || new Error("All candidate models temporarily unavailable");
}

// Helper to rigorously clean output of any markdown formatting (asterisks, bullet dashes, hashtags, backticks)
function cleanHandwritingOutput(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Strip bold/italic markdown like ***bold***, **bold**, *italic*, ___bold___, __bold__, _italic_
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove any remaining stray asterisks anywhere
    .replace(/\*/g, "")
    // Remove markdown headers like # Title, ## Subtitle, ### Section
    .replace(/^[\s]*#+\s*/gm, "")
    // Strip bullet dashes, asterisks, pluses or bullet points at the start of lines
    .replace(/^[\s]*[-*+•]\s+/gm, "")
    // Strip numbered list markers at start of lines (1. Item -> Item)
    .replace(/^[\s]*\d+[\.\)]\s+/gm, "")
    // Strip blockquotes (> Quote)
    .replace(/^[\s]*>\s+/gm, "")
    // Strip backticks or tildes
    .replace(/[`~]/g, "")
    // Strip markdown horizontal rules (---, ___, ===)
    .replace(/^[\s]*[-=_]{3,}\s*$/gm, "")
    // Strip bracketed markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
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

    const systemInstruction = `You are an exceptionally insightful, thoughtful, and intelligent AI creative assistant writing handwritten thoughts directly onto the user's canvas notes.
CRITICAL FORMATTING MANDATES:
1. Provide THOROUGH, HIGH-QUALITY, and GENUINELY SUBSTANTIVE answers, continuations, insights, and solutions.
2. NEVER output asterisks (* or **), markdown bold or italics, bullet symbols, hashtags (#), backticks, or bracketed labels. Clean plain text only.
3. NEVER output meta-commentary about your own thoughts (do NOT say "Here is what I think", "Let me examine this", "As an AI"). Output the actual ideas and answers directly.
4. If the user asks a question, answer it clearly, deeply, and accurately.
5. If the user has brainstorming notes, continue them with brilliant connected ideas, strategic next steps, and profound observations.
6. Express your answer in articulate, beautifully flowing human paragraphs without any markdown clutter.`;

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
