/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { webhookDataExample } from "../../../../../webhooks/webhookdata";
import { transcriptionExample } from "../../../../../webhooks/2064446a-079a-4e49-a55f-ac71834e77ee - transcription";

export async function POST(request: NextRequest) {
  try {
    console.log("🧪 TEST WEBHOOK TRIGGERED");

    // Prepare the exact payload - matching the real webhook format
    const payload = {
      event: "bot.completed",
      data: webhookDataExample.data,
      extra: webhookDataExample.fullPayload.extra,
      _transcriptionData: transcriptionExample, // Injected for testing (would be fetched from URL in production)
    };

    console.log("📤 Sending payload to webhook route...");

    // Call the actual webhook route
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/webhooks/meetingbaas`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    console.log("✅ Webhook route response:", result);

    return NextResponse.json(
      {
        success: true,
        message: "Test webhook executed successfully",
        webhookResponse: result
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Test webhook error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Test webhook route ready",
    instructions:
      "POST to this endpoint to trigger a test webhook with sample data",
    endpoint: "/api/test/webhook",
    method: "POST",
  });
}
