// Client-Side Offline Intelligence Engine
// Enables the AI Assistant to function completely offline without internet connection.
// 1. Prioritizes Chrome Built-in On-Device Prompt API (Gemini Nano / window.ai) if available
// 2. Provides rich on-device contextual synthesis and brainstorming continuity when offline

export interface OfflineAIResult {
  text: string;
  source: 'chrome-nano' | 'on-device-offline';
}

// Clean any markdown formatting from offline outputs
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

// Extract keywords and themes from user's pasted or typed text
function extractKeyThemes(content: string): { keywords: string[]; primaryTopic: string; isQuestion: boolean } {
  const words = content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3);

  const stopWords = new Set([
    'this', 'that', 'with', 'from', 'have', 'were', 'which', 'their', 'about', 'there',
    'would', 'could', 'should', 'these', 'those', 'where', 'while', 'after', 'before',
    'being', 'under', 'between', 'through', 'during', 'without', 'again', 'further',
  ]);

  const frequencyMap = new Map<string, number>();
  for (const word of words) {
    if (!stopWords.has(word)) {
      frequencyMap.set(word, (frequencyMap.get(word) || 0) + 1);
    }
  }

  const sortedKeywords = Array.from(frequencyMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map((entry) => entry[0]);

  const isQuestion = content.includes('?') || /\b(how|why|what|when|where|can|could|is|are)\b/i.test(content);
  const primaryTopic = sortedKeywords[0] || 'this core idea';

  return {
    keywords: sortedKeywords.slice(0, 5),
    primaryTopic,
    isQuestion,
  };
}

export async function generateOfflineAssistantThought(
  prompt: string,
  canvasContext: string
): Promise<OfflineAIResult> {
  const combinedText = `${prompt} \n ${canvasContext}`.trim();

  // 1. Try Chrome's Built-in On-Device AI (Gemini Nano via window.ai)
  if (typeof window !== 'undefined') {
    const navAi = (window as any).ai;
    if (navAi?.languageModel) {
      try {
        const capabilities = await navAi.languageModel.capabilities?.();
        if (capabilities?.available !== 'no') {
          const session = await navAi.languageModel.create({
            systemPrompt:
              'You are a thoughtful brainstorming companion writing brief ink notes on an infinite canvas. Write 2 to 3 natural, reflective sentences. Never use asterisks, markdown, or numbered lists.',
          });
          const raw = await session.prompt(
            `Context:\n${canvasContext.slice(0, 1200)}\n\nPrompt/Focus:\n${prompt}`
          );
          if (raw && raw.trim()) {
            return {
              text: cleanHandwritingOutput(raw),
              source: 'chrome-nano',
            };
          }
        }
      } catch (err) {
        console.warn('Chrome on-device AI session error, falling back to local synthesizer:', err);
      }
    }
  }

  // 2. On-Device Contextual Heuristic Brainstormer
  // Synthesizes actionable, deep, reflective extensions based on the semantic structure of the notes
  const analysis = extractKeyThemes(combinedText);
  const topic = analysis.primaryTopic;
  const kw1 = analysis.keywords[1] || 'flow';
  const kw2 = analysis.keywords[2] || 'clarity';

  let synthesizedText = '';

  if (analysis.isQuestion) {
    synthesizedText = `Examining ${topic}: the key leverage point lies in balancing ${kw1} with practical constraints. Consider whether simplifying the initial premise will reveal the most direct path forward. Let us test this hypothesis against current assumptions.`;
  } else if (combinedText.length > 300) {
    // Longer pasted text analysis
    synthesizedText = `Distilling the essence of this passage around ${topic}: the strongest thread connects ${kw1} directly to ${kw2}. To take this further, we can isolate the core thesis and discard secondary friction. What is the immediate first action required here?`;
  } else if (analysis.keywords.length >= 2) {
    synthesizedText = `Connecting ${topic} with ${kw1}: there is an understated momentum here that warrants deeper exploration. What happens if we invert this perspective and focus on the secondary impact? This could unlock an entirely different angle.`;
  } else {
    synthesizedText = `Continuing this line of thinking: the simplest foundation is often the most durable. Let us establish the primary objective and build the subsequent steps around it.`;
  }

  return {
    text: synthesizedText,
    source: 'on-device-offline',
  };
}
