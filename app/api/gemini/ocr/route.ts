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

const CANDIDATE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { imageBase64 } = body;

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Image base64 required" },
        { status: 400 }
      );
    }

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

    if (mimeType === "image/jpg") {
      mimeType = "image/jpeg";
    } else if (mimeType.includes("svg")) {
      mimeType = "image/png";
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
              text: `You are an OCR and handwriting transcription engine. Read the handwriting in the image accurately and return ONLY the exact text written. Do not add markdown or conversational preamble. If words include "assistant" followed by a query or note, extract the exact text.`,
            },
          ],
          config: {
            temperature: 0.1,
            maxOutputTokens: 300,
          },
        });

        outputText = response.text?.trim() || "";
        if (outputText) {
          return NextResponse.json({
            text: outputText,
            model,
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

        const isTemporaryBusy = statusCode === 503 || statusCode === 429 || statusCode === "UNAVAILABLE" || errMsg.includes("high demand");
        if (isTemporaryBusy) {
          await sleep(350);
        }
        continue;
      }
    }

    return NextResponse.json({
      text: outputText || "Handwritten text captured on canvas.",
      fallback: true,
      note: lastError?.message ? "Model capacity fallback" : undefined,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        text: "Handwriting recorded on canvas.",
        fallback: true,
        error: error?.message || "Failed to transcribe handwriting",
      },
      { status: 200 }
    );
  }
}
