// Client-Side Offline Intelligence Engine
// Checks for on-device local models (such as Chrome's built-in Gemini Nano / window.ai)
// If available, it executes genuine on-device inference without internet.
// If not available, it reports availability status so the UI never outputs simulated meta-commentary.

export interface OfflineAIResult {
  success: boolean;
  text: string;
  source: 'chrome-nano' | 'none';
  message?: string;
}

// Clean any markdown formatting from model outputs
function cleanHandwritingOutput(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/^[\s]*[-*+•]\s+/gm, '')
    .replace(/^[\s]*\d+[\.\)]\s+/gm, '')
    .replace(/^[\s]*#+\s+/gm, '')
    .replace(/^[\s]*>\s+/gm, '')
    .replace(/[`~]/g, '')
    .replace(/\*/g, '')
    .replace(/^--+\s*/gm, '')
    .replace(/(\r\n|\r|\n){3,}/g, '\n\n')
    .trim();
}

export async function generateOfflineAssistantThought(
  prompt: string,
  canvasContext: string
): Promise<OfflineAIResult> {
  // 1. Check for Chrome's Built-in On-Device AI (Gemini Nano via window.ai)
  if (typeof window !== 'undefined') {
    const navAi = (window as any).ai;
    if (navAi?.languageModel) {
      try {
        const capabilities = await navAi.languageModel.capabilities?.();
        if (capabilities?.available !== 'no') {
          const session = await navAi.languageModel.create({
            systemPrompt:
              'You are an intelligent handwriting note assistant on an infinite stylus canvas. Provide direct, substantive answers or continuations. Never output your internal thought process or meta-commentary. Never use markdown asterisks or bullet lists.',
          });
          const raw = await session.prompt(
            `Context:\n${canvasContext.slice(0, 1200)}\n\nUser Question or Note:\n${prompt}`
          );
          if (raw && raw.trim()) {
            return {
              success: true,
              text: cleanHandwritingOutput(raw),
              source: 'chrome-nano',
            };
          }
        }
      } catch (err) {
        console.warn('Chrome on-device AI session error:', err);
      }
    }
  }

  // No on-device neural model is currently installed in this browser environment
  return {
    success: false,
    text: '',
    source: 'none',
    message: 'Full generative AI requires internet or an on-device model.',
  };
}
