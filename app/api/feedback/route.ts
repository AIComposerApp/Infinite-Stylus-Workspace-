import { NextRequest, NextResponse } from "next/server";

// In-memory feedback store for development and fast retrieval
interface FeedbackRecord {
  id: string;
  rating: number;
  feedbackText: string;
  category: string;
  userEmail?: string;
  metrics?: {
    strokesCount?: number;
    itemsCount?: number;
    sessionDurationSec?: number;
    sharedThoughtsCount?: number;
  };
  clientTimestamp: string;
  receivedAt: string;
}

const feedbackStore: FeedbackRecord[] = [];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { rating, feedbackText, category = "general", userEmail, metrics, clientTimestamp } = body;

    if (typeof rating !== "number" || rating < 1 || rating > 5) {
      return NextResponse.json(
        { error: "Rating must be a number between 1 and 5" },
        { status: 400 }
      );
    }

    const newRecord: FeedbackRecord = {
      id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      rating,
      feedbackText: (feedbackText || "").trim(),
      category,
      userEmail: (userEmail || "").trim() || undefined,
      metrics: metrics || {},
      clientTimestamp: clientTimestamp || new Date().toISOString(),
      receivedAt: new Date().toISOString(),
    };

    feedbackStore.unshift(newRecord);
    // Keep max 200 records in memory
    if (feedbackStore.length > 200) {
      feedbackStore.pop();
    }

    const developerEmail = process.env.FEEDBACK_NOTIFICATION_EMAIL || "mathewudochukwu656@gmail.com";

    // Structured server log for developers
    console.log(`[Thoughtspace Feedback] ⭐ ${rating}/5 Stars (${category}) | Recipient: ${developerEmail}`);
    if (newRecord.feedbackText) {
      console.log(`[Feedback Message] "${newRecord.feedbackText}"`);
    }
    if (newRecord.userEmail) {
      console.log(`[User Contact] ${newRecord.userEmail}`);
    }
    if (newRecord.metrics) {
      console.log(`[Engagement Metrics] Strokes: ${newRecord.metrics.strokesCount || 0}, Items: ${newRecord.metrics.itemsCount || 0}, Session: ${newRecord.metrics.sessionDurationSec || 0}s`);
    }

    return NextResponse.json({
      success: true,
      id: newRecord.id,
      message: "Thank you! Your feedback has been recorded.",
    });
  } catch (error: any) {
    console.error("Error processing feedback:", error);
    return NextResponse.json(
      { error: "Failed to record feedback", details: error?.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Public/developer status endpoint returning count and latest summary
  return NextResponse.json({
    totalCount: feedbackStore.length,
    latest: feedbackStore.slice(0, 10),
  });
}
