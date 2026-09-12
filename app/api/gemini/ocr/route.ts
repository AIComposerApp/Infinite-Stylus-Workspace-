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

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          inlineData: {
            mimeType: "image/png",
            data: cleanBase64,
          },
        },
        {
          text: `You are an OCR and handwriting transcription engine. Read the handwriting in the image accurately and return ONLY the exact text written. Do not add markdown or conversational preamble. If words include "assistant" followed by a query or note, extract the exact text.`,
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 200,
      },
    });

    const text = response.text || "";
    return NextResponse.json({
      text: text.trim(),
    });
  } catch (error: any) {
    console.error("OCR handwriting error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to transcribe handwriting" },
      { status: 500 }
    );
  }
}
