/* eslint-disable @typescript-eslint/no-explicit-any */
// Import required modules for meeting processing, database operations, email service, RAG processing, and usage tracking
import { processMeetingTranscript } from "@/lib/ai-processor";
import { db } from "@/db";
import { sendMeetingSummaryEmail } from "@/lib/email-service-free";
import { processTranscript } from "@/lib/rag";
import { incrementMeetingUsage } from "@/lib/usage";
import { NextRequest, NextResponse } from "next/server";
import { saveWebhookPayload } from "./route copy";

/**
 * Normalize raw transcript into human-readable format
 * Handles array-based transcripts with speaker/words structure
 */
function normalizeTranscript(rawTranscript: any): string {
  if (typeof rawTranscript === "string") {
    return rawTranscript;
  }

  if (typeof rawTranscript === "object" && rawTranscript !== null) {
    // Handle Gladia format: { full_transcript: string } or { transcription: { full_transcript: string } }
    if (rawTranscript.full_transcript) {
      return rawTranscript.full_transcript;
    }

    // Handle array of utterances with speaker info
    if (Array.isArray(rawTranscript.utterances)) {
      return rawTranscript.utterances
        .map((utterance: any) => {
          const speaker = utterance.speaker || "Speaker";
          const text = utterance.text || "";
          return `${speaker}: ${text}`;
        })
        .join("\n");
    }

    // Handle nested transcription object
    if (
      rawTranscript.transcription &&
      typeof rawTranscript.transcription === "object"
    ) {
      return normalizeTranscript(rawTranscript.transcription);
    }
  }

  return "Transcript could not be parsed";
}

/**
 * Extract speaker names from normalized transcript
 */
function extractSpeakersFromTranscript(normalizedText: string): string[] {
  const speakerPattern = /^([^:]+):/gm;
  const matches = Array.from(normalizedText.matchAll(speakerPattern));
  const uniqueSpeakers = new Set(matches.map((m) => m[1].trim()));
  return Array.from(uniqueSpeakers);
}

export async function POST(request: NextRequest) {
  let meetingId: string | null = null;

  try {
    // ========== 1️⃣ WEBHOOK INGESTION (TRIGGER LAYER) ==========
    // Parse the incoming webhook payload from MeetingBaaS
    const webhook = await request.json();

    // Only process completed meetings
    if (webhook.event !== "bot.completed") {
      console.log(
        `Webhook event '${webhook.event}' is not a completion event, acknowledging...`
      );
      return NextResponse.json({
        status: "acknowledged",
        message: "Non-completion event received",
      });
    }
    // save webhook data locally for debugging
    await saveWebhookPayload(webhook, webhook.data.bot_id);
    
    const webhookData = webhook.data;
    console.log("✅ Webhook data received:", {
      botId: webhookData.bot_id,
      duration: webhookData.duration_seconds,
      participantCount: webhookData.participants?.length,
    });

    // ========== 2️⃣ MEETING IDENTIFICATION & VALIDATION ==========
    // Query database to find the meeting by botId
    const meeting = await db.meeting.findFirst({
      where: { botId: webhookData.bot_id },
      include: { user: true },
    });

    // Validation: Meeting exists
    if (!meeting) {
      console.error(`❌ Meeting not found for bot_id: ${webhookData.bot_id}`);
      return NextResponse.json(
        { error: "Meeting not found", botId: webhookData.bot_id },
        { status: 404 }
      );
    }

    meetingId = meeting.id;

    // Validation: User exists
    if (!meeting.user) {
      console.error(`❌ User not found for meeting: ${meeting.id}`);
      return NextResponse.json(
        { error: "User not found for this meeting" },
        { status: 400 }
      );
    }

    // Validation: User has valid email
    if (!meeting.user.email) {
      console.error(`❌ User has no email: ${meeting.user.id}`);
      return NextResponse.json(
        { error: "User email not configured" },
        { status: 400 }
      );
    }

    console.log(
      `✅ Meeting identified: ${meeting.id} | User: ${meeting.user.email}`
    );

    // ========== 3️⃣ USAGE TRACKING & BILLING CONTROL ==========
    // Increment user's meeting usage counter for billing/rate limiting
    await incrementMeetingUsage(meeting.userId);
    console.log(`✅ Usage incremented for user: ${meeting.user.email}`);

    // ========== 4️⃣ RAW MEETING DATA PERSISTENCE ==========
    // Store raw meeting data in the database before processing
    // This ensures data durability even if subsequent processing fails
    // Fetch transcript from URL and extract the actual transcript data
    let transcriptData: any = null;
    let rawTranscriptContent: any = null;

    // Try fetching from raw_transcription first (contains utterances with speaker info)
    if (webhookData.raw_transcription) {
      try {
        const rawResponse = await fetch(webhookData.raw_transcription);
        const rawJson = await rawResponse.json();
        rawTranscriptContent = rawJson;

        // Extract utterances from Gladia format
        if (
          rawJson.transcriptions &&
          Array.isArray(rawJson.transcriptions) &&
          rawJson.transcriptions[0]?.transcription?.utterances
        ) {
          transcriptData = rawJson.transcriptions[0].transcription.utterances;
        } else if (rawJson.utterances) {
          transcriptData = rawJson.utterances;
        } else {
          transcriptData = rawJson;
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to fetch raw_transcription:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Fallback: Try fetching from transcription URL
    if (!transcriptData && webhookData.transcription) {
      try {
        const transcriptResponse = await fetch(webhookData.transcription);
        const transcriptJson = await transcriptResponse.json();

        // Extract data from processed transcription format
        if (transcriptJson.transcriptions?.[0]?.transcription) {
          transcriptData = transcriptJson.transcriptions[0].transcription;
        } else if (transcriptJson.utterances) {
          transcriptData = transcriptJson.utterances;
        } else if (transcriptJson.full_transcript) {
          transcriptData = transcriptJson.full_transcript;
        } else {
          transcriptData = transcriptJson;
        }
      } catch (error) {
        console.warn(
          `⚠️ Failed to fetch transcription:`,
          error instanceof Error ? error.message : "Unknown error"
        );
      }
    }

    // Normalize transcript to human-readable format for storage
    // This ensures it's in a consistent format when read back from DB
    let normalizedForStorage: string;

    if (typeof transcriptData === "string") {
      normalizedForStorage = transcriptData;
    } else if (Array.isArray(transcriptData)) {
      // Convert utterance array to readable format
      normalizedForStorage = transcriptData
        .map((utterance: any) => {
          const speaker = utterance.speaker || "Speaker";
          const text = utterance.text || "";
          return `${speaker}: ${text}`;
        })
        .join("\n");
    } else if (
      transcriptData &&
      typeof transcriptData === "object" &&
      transcriptData.full_transcript
    ) {
      normalizedForStorage = transcriptData.full_transcript;
    } else if (
      transcriptData &&
      typeof transcriptData === "object" &&
      transcriptData.utterances &&
      Array.isArray(transcriptData.utterances)
    ) {
      // Handle nested utterances
      normalizedForStorage = transcriptData.utterances
        .map((utterance: any) => {
          const speaker = utterance.speaker || "Speaker";
          const text = utterance.text || "";
          return `${speaker}: ${text}`;
        })
        .join("\n");
    } else {
      normalizedForStorage = "Transcript could not be parsed";
    }

    console.log(`ℹ️ Transcript normalized for storage:`, {
      length: normalizedForStorage.length,
      preview: normalizedForStorage.substring(0, 100) + "...",
    });

    const updatedMeeting = await db.meeting.update({
      where: { id: meeting.id },
      data: {
        meetingEnded: true,
        transcriptReady: true,
        transcript: normalizedForStorage,
        recordingUrl: webhookData.video,
        speakers: webhookData.speakers,
        processingStartedAt: new Date(),
        webhookId: webhookData.bot_id,
      },
    });

    console.log(`✅ Raw meeting data persisted for: ${meeting.id}`);

    // ========== 5️⃣ IDEMPOTENCY CHECK ==========
    // Verify that we haven't already processed this meeting
    if (meeting.processed) {
      console.warn(
        `⚠️ Meeting ${meeting.id} already processed, returning early`
      );
      return NextResponse.json({
        status: "acknowledged",
        message: "Meeting already processed",
        meetingId: meeting.id,
      });
    }

    // ========== 6️⃣ AI TRANSCRIPT PROCESSING (NLP LAYER) ==========
    // Pass transcript to AI for summary and action item extraction
    console.log(`⏳ Processing transcript with AI for meeting: ${meeting.id}`);

    const aiResult = await processMeetingTranscript(
      updatedMeeting.transcript
    );

    console.log(`✅ AI processing complete:`, {
      summary: aiResult.summary.substring(0, 100) + "...",
      actionItemCount: aiResult.actionItems.length,
    });

    // ========== 7️⃣ TRANSCRIPT NORMALIZATION & FORMATTING ==========
    // Transcript is already normalized during storage (step 4)
    // If it was re-normalized, it would be idempotent anyway
    const normalizedTranscript = typeof updatedMeeting.transcript === "string" 
      ? updatedMeeting.transcript 
      : normalizeTranscript(updatedMeeting.transcript);

    const extractedSpeakers = extractSpeakersFromTranscript(
      normalizedTranscript
    );

    console.log(`✅ Transcript normalized | Speakers found: ${extractedSpeakers.length}`);

    // ========== 8️⃣ EMAIL NOTIFICATION DELIVERY ==========
    // Send AI-generated summary email to the user (non-blocking on failure)
    let emailSent = false;
    let emailError: string | null = null;

    try {
      await sendMeetingSummaryEmail({
        userEmail: meeting.user.email,
        userName: meeting.user.name || "User",
        meetingTitle: meeting.title || "Meeting Summary",
        summary: aiResult.summary,
        actionItems: aiResult.actionItems,
        meetingId: meeting.id,
        meetingDate: meeting.startTime
          ? new Date(meeting.startTime).toLocaleDateString()
          : "Unknown Date",
      });

      emailSent = true;
      console.log(`✅ Email sent successfully to: ${meeting.user.email}`);
    } catch (error) {
      emailError = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `⚠️ Email sending failed (non-blocking):`,
        emailError
      );
    }

    // ========== 9️⃣ RAG PROCESSING (KNOWLEDGE LAYER) ==========
    // Pass formatted transcript to RAG pipeline for semantic search indexing
    try {
      console.log(`⏳ Starting RAG processing for meeting: ${meeting.id}`);

      await processTranscript(
        meeting.id,
        meeting.userId,
        normalizedTranscript,
        meeting.title || undefined
      );

      console.log(`✅ RAG processing complete | Vectors stored in Pinecone`);
    } catch (ragError) {
      const ragErrorMsg =
        ragError instanceof Error ? ragError.message : "Unknown RAG error";
      console.error(`⚠️ RAG processing failed (non-blocking):`, ragErrorMsg);
    }

    // ========== 🔟 FINAL MEETING STATE UPDATE ==========
    // Persist final AI outputs and mark processing as complete
    const finalMeeting = await db.meeting.update({
      where: { id: meeting.id },
      data: {
        summary: aiResult.summary,
        actionItems: aiResult.actionItems,
        processed: true,
        processingFailed: false,
        processedAt: new Date(),
        emailSent: emailSent,
        emailSentAt: emailSent ? new Date() : null,
        emailError: emailError,
        emailLastAttempt: new Date(),
        ragProcessed: true,
        ragProcessedAt: new Date(),
      },
    });

    console.log(`✅ Meeting processing complete: ${meeting.id}`);
    console.log(`✅ Summary saved | Email: ${emailSent ? "sent" : "failed"}`);

    // ========== 1️⃣2️⃣ WEBHOOK RESPONSE & ACKNOWLEDGMENT ==========
    return NextResponse.json({
      status: "success",
      meetingId: meeting.id,
      message: "Meeting processed successfully",
      processed: {
        aiSummary: true,
        emailSent: emailSent,
        ragIndexed: true,
      },
    });
  } catch (error) {
    // ========== 1️⃣1️⃣ FAILURE HANDLING & RECOVERY ==========
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Webhook processing failed:", errorMsg);

    // Mark meeting as processed even on failure to prevent infinite retries
    if (meetingId) {
      try {
        await db.meeting.update({
          where: { id: meetingId },
          data: {
            processed: true,
            processingFailed: true,
            emailError: errorMsg,
            emailLastAttempt: new Date(),
          },
        });
        console.log(`⚠️ Meeting marked as failed: ${meetingId}`);
      } catch (updateError) {
        console.error(`Failed to update meeting with error status:`, updateError);
      }
    }

    return NextResponse.json(
      {
        error: "Internal server error during meeting processing",
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
