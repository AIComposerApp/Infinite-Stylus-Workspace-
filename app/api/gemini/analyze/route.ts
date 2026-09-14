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

// Resilient candidate models in preference order (gemini-3.8-flash primary)
const CANDIDATE_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Comprehensive cleaner to guarantee output contains zero asterisks (*) or markdown clutter
function cleanAiOutput(raw: string): string {
  if (!raw) return "";

  let cleaned = raw
    // Strip bold/italic markdown like ***bold***, **bold**, *italic*, ___bold___, __bold__, _italic_
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Remove any remaining stray asterisks anywhere
    .replace(/\*/g, "")
    // Remove markdown headers like # Title, ## Subtitle, ### Section
    .replace(/^[\s]*#+\s*/gm, "")
    // Remove markdown bullet points (- Item, + Item, • Item)
    .replace(/^[\s]*[-+•]\s+/gm, "")
    // Remove numbered list markers at start of lines (1. Item -> Item)
    .replace(/^[\s]*\d+[\.\)]\s+/gm, "")
    // Remove blockquotes (> Quote)
    .replace(/^[\s]*>\s+/gm, "")
    // Remove backticks (`code`, ```code```)
    .replace(/[`~]/g, "")
    // Remove markdown horizontal rules (---, ___, ===)
    .replace(/^[\s]*[-=_]{3,}\s*$/gm, "")
    // Remove bracketed markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Normalize newlines (no more than two consecutive)
    .replace(/(\r\n|\r|\n){3,}/g, "\n\n")
    .trim();

  return cleaned;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64, prompt, mode = "describe" } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image data is required" },
        { status: 400 }
      );
    }

    // Extract exact MIME type and clean base64 data
    let mimeType = "image/png";
    let cleanBase64 = imageBase64;

    if (imageBase64.startsWith("data:")) {
      const commaIndex = imageBase64.indexOf(",");
      if (commaIndex !== -1) {
        const header = imageBase64.substring(5, commaIndex);
        const semicolonIndex = header.indexOf(";");
        if (semicolonIndex !== -1) {
          mimeType = header.substring(0, semicolonIndex).trim();
        }
        cleanBase64 = imageBase64.substring(commaIndex + 1).trim();
      }
    }

    // Normalize standard MIME types
    if (mimeType === "image/jpg") {
      mimeType = "image/jpeg";
    } else if (mimeType.includes("svg")) {
      mimeType = "image/png";
    }

    let systemInstruction = "You are an expert visual intelligence and analysis engine for a creative brainstorming and note-taking canvas. CRITICAL MANDATE: Output clean, natural human text ONLY. NEVER use asterisks (* or **), markdown bold or italics, bullet symbols, hashtags (#), backticks, or bracketed labels. Express everything in clean, natural human sentences.";
    let userPrompt = prompt;

    if (mode === "ocr") {
      systemInstruction = "You are a high-precision OCR and handwriting transcription engine. Extract and transcribe all visible text, handwriting, annotations, and labels accurately. Present the text clearly formatted without extraneous chit-chat. DO NOT use asterisks (* or **) or markdown syntax.";
      userPrompt = prompt || "Extract and transcribe all text and handwriting visible in this image verbatim.";
    } else if (mode === "brainstorm") {
      systemInstruction = "You are a creative brainstorming partner. Analyze this image and extract inspiring ideas, follow-up concepts, structured action steps, and creative connections suitable for a project canvas. DO NOT use asterisks (* or **) or markdown syntax. Write in clean, fluid sentences.";
      userPrompt = prompt || "Brainstorm key concepts, creative insights, and practical next steps based on this image.";
    } else if (mode === "describe") {
      systemInstruction = "You are a visual analyst. Provide a clear, concise, structured breakdown of what is shown in the image, noting key objects, visual context, diagrams, charts, or diagrams. DO NOT use asterisks (* or **) or markdown syntax. Write in clean, fluid sentences.";
      userPrompt = prompt || "Analyze and describe the contents, style, and key elements in this image.";
    } else {
      userPrompt = prompt || "Analyze this image and answer any questions thoroughly.";
    }

    let outputText = "";
    let lastError: any = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            {
              text: userPrompt,
            },
          ],
          config: {
            systemInstruction,
            temperature: mode === "ocr" ? 0.1 : 0.4,
            maxOutputTokens: 800,
          },
        });

        outputText = cleanAiOutput(response.text?.trim() || "");
        if (outputText) {
          return NextResponse.json({
            text: outputText,
            model,
            mode,
          });
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

        // Temporary capacity spike or rate limit (503 / 429) -> brief delay before fallback
        const isTemporaryBusy = statusCode === 503 || statusCode === 429 || statusCode === "UNAVAILABLE" || errMsg.includes("high demand");
        if (isTemporaryBusy) {
          await sleep(400);
        }
        continue;
      }
    }

    // Graceful fallback if external model is temporarily at capacity
    let fallbackText = "";
    if (mode === "ocr") {
      fallbackText = "Image captured on canvas. Note: Vision AI is currently experiencing peak demand. You can re-run OCR shortly, or continue annotating directly on the canvas.";
    } else if (mode === "brainstorm") {
      fallbackText = "Canvas Brainstorm Note:\n1. Deconstruct core visual elements into distinct modules.\n2. Identify relationships and workflow dependencies.\n3. Link connected sketches with directional arrows.";
    } else {
      fallbackText = "Visual asset imported into workspace. Tap AI Vision again to re-analyze once demand eases.";
    }

    return NextResponse.json({
      text: fallbackText,
      model: "fallback",
      fallback: true,
      mode,
      note: lastError?.message ? "Model capacity fallback" : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        text: "Visual element noted on canvas. Ready for sketching and annotation.",
        fallback: true,
        error: error?.message || "Failed to analyze image",
      },
      { status: 200 }
    );
  }
}
