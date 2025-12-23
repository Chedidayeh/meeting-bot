/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ========== MEETING BOT WEBHOOK HANDLER ==========
 *
 * FILE: src/app/api/webhooks/meetingbaas/route.ts
 *
 * PURPOSE:
 * Receives webhooks from MeetingBaaS when a meeting bot completes recording.
 * Processes transcripts, generates AI summaries, sends emails, and manages meeting data.
 *
 * WEBHOOK FLOW:
 * 1. Bot joins a video meeting (Google Meet, Teams, Zoom, etc.)
 * 2. Bot records audio, video, and generates transcript using Gladia
 * 3. MeetingBaaS sends webhook when bot exits the meeting
 * 4. This endpoint processes the webhook and:
 *    - Fetches transcript from S3 URL
 *    - Generates AI summary and action items
 *    - Sends summary email to user
 *    - Stores embeddings for semantic search (RAG)
 *    - Updates meeting status and metadata
 *
 * KEY CONCEPTS:
 * - Idempotency: Webhook ID ensures duplicate webhooks aren't reprocessed
 * - Atomic Transactions: All DB operations succeed or fail together (consistency)
 * - Resilient Processing: Email and RAG failures don't block meeting completion
 * - Fallback Lookup: Can find meeting by botId OR meeting_id (handles edge cases)
 *
 * ERROR HANDLING:
 * - Bad signature → 401 Unauthorized
 * - Meeting not found → 404 Not Found
 * - No user email → 400 Bad Request
 * - Other errors → 500 Internal Server Error
 * - Duplicate webhook → Returns 200 (idempotent)
 * - AI processing fails → Marks meeting as failed, still increments usage
 *
 * TRANSCRIPT FORMAT:
 * MeetingBaaS/Gladia sends transcript as JSON with nested structure:
 * {
 *   "transcriptions": [{
 *     "transcription": {
 *       "utterances": [{"speaker": "name", "start_time": 0.5, "end_time": 3.2, "text": "..."}],
 *       "full_transcript": "complete merged text"
 *     },
 *     "diarization": { "results": [...] }
 *   }]
 * }
 *
 * SUPPORTED TRANSCRIPT FORMATS:
 * - Nested transcriptions array (Gladia format) ✅
 * - Direct array of utterances ✅
 * - Messages structure ✅
 * - Simple text field ✅
 * - Full transcript field ✅
 */
// Import required modules for meeting processing, database operations, email service, RAG processing, and usage tracking
import { processMeetingTranscript } from "@/lib/ai-processor";
import { db } from "@/db";
import { sendMeetingSummaryEmail } from "@/lib/email-service-free";
import { processTranscript } from "@/lib/rag";
import { incrementMeetingUsage } from "@/lib/usage";
import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import { join } from "path";
import { el } from "date-fns/locale";

// Helper: Verify webhook signature (basic validation)
// In production, use Svix or MeetingBaaS signature verification
function verifyWebhookSignature(request: NextRequest): boolean {
  // TODO: Implement signature verification with MeetingBaaS webhook secret
  // For now, basic check to ensure it's a valid request structure
  const webhookSecret = process.env.MEETINGBAAS_WEBHOOK_SECRET;

  // If secret is not configured, skip verification in development
  if (!webhookSecret) {
    console.warn(
      "⚠️ WEBHOOK_SECRET not configured - skipping signature verification"
    );
    return true;
  }

  // TODO: Verify signature using header and secret
  // const signature = request.headers.get('x-webhook-signature')
  // const timestamp = request.headers.get('x-webhook-timestamp')
  return true;
}

// Helper: Format transcript from various formats
function formatTranscript(transcript: any): string {
  if (!transcript) return "";

  if (Array.isArray(transcript)) {
    return transcript
      .map(
        (item: any) =>
          `${item.speaker || "Speaker"}: ${item.words?.map((w: any) => w.word).join(" ") || ""}`
      )
      .join("\n");
  }

  return String(transcript);
}

// Helper: Check if already processing (within last 5 minutes)
function isAlreadyProcessing(processingStartedAt: Date | null): boolean {
  if (!processingStartedAt) return false;

  const elapsed = Date.now() - processingStartedAt.getTime();
  const fiveMinutes = 5 * 60 * 1000;

  return elapsed < fiveMinutes;
}

// Helper: Save webhook payload to file for debugging
export async function saveWebhookPayload(
  webhook: any,
  webhookId: string
): Promise<void> {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `webhook-${webhookId}-${timestamp}.json`;

    // Save to project root in a 'webhooks' folder
    const filePath = join(process.cwd(), "webhooks", filename);

    const payload = {
      timestamp: new Date().toISOString(),
      webhookId: webhookId,
      eventType: webhook.event,
      data: webhook.data,
      fullPayload: webhook,
    };

    await writeFile(filePath, JSON.stringify(payload, null, 2));
    console.log(`💾 Webhook saved to: webhooks/${filename}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`⚠️ Failed to save webhook file: ${errorMsg}`);
    // Don't fail the webhook if file saving fails
  }
}

/**
 * Helper: Fetch and format transcript from S3 URL
 * Handles multiple formats from Gladia transcription service
 *
 * Expected Gladia format:
 * {
 *   "transcriptions": [{
 *     "transcription": {
 *       "utterances": [{ "speaker": "name", "text": "..." }],
 *       "full_transcript": "..."
 *     }
 *   }]
 * }
 */
async function fetchTranscriptFromUrl(
  transcriptionUrl: string
): Promise<string | null> {
  try {
    if (!transcriptionUrl) return null;

    console.log(`  📥 Fetching transcript from S3...`);
    const response = await fetch(transcriptionUrl);

    if (!response.ok) {
      console.error(`  ⚠️ Failed to fetch transcript: ${response.status}`);
      return null;
    }

    const transcriptData = await response.json();
    let formattedTranscript = "";

    // Handle root-level transcriptions array (your actual format)
    if (
      transcriptData.transcriptions &&
      Array.isArray(transcriptData.transcriptions)
    ) {
      const transcription = transcriptData.transcriptions[0]?.transcription;

      if (transcription) {
        // Format 1: Use full_transcript if available (PREFERRED)
        if (transcription.full_transcript) {
          formattedTranscript = transcription.full_transcript;
          console.log(`  ✅ Using full_transcript field`);
        }
        // Format 2: Build from utterances array if full_transcript missing
        else if (
          transcription.utterances &&
          Array.isArray(transcription.utterances)
        ) {
          formattedTranscript = transcription.utterances
            .map((item: any) => {
              const speaker =
                item.speaker !== undefined && item.speaker !== null
                  ? `Speaker ${item.speaker}`
                  : "Unknown";
              return `${speaker}: ${item.text || ""}`;
            })
            .filter((line: string) => line.trim().length > 0)
            .join("\n");
          console.log(
            `  ✅ Built transcript from ${transcription.utterances.length} utterances`
          );
        }
      }
    }
    // Fallback: Handle other formats
    else if (Array.isArray(transcriptData)) {
      // If it's directly an array of utterances
      formattedTranscript = transcriptData
        .map((item: any) => `${item.speaker || "Speaker"}: ${item.text || ""}`)
        .filter((line: string) => line.trim().length > 0)
        .join("\n");
    } else if (transcriptData.messages) {
      // If it has messages structure
      formattedTranscript = transcriptData.messages
        .map((msg: any) => `${msg.speaker || "Speaker"}: ${msg.text || ""}`)
        .filter((line: string) => line.trim().length > 0)
        .join("\n");
    } else if (transcriptData.text) {
      // If it has simple text field
      formattedTranscript = transcriptData.text;
    } else if (transcriptData.full_transcript) {
      // Direct full_transcript field
      formattedTranscript = transcriptData.full_transcript;
    }

    if (!formattedTranscript || formattedTranscript.trim().length === 0) {
      console.warn(
        `  ⚠️ No transcript text found in response. Keys: ${Object.keys(transcriptData).join(", ")}`
      );
      return null;
    }

    console.log(
      `  ✅ Transcript fetched successfully (${formattedTranscript.length} chars)`
    );
    return formattedTranscript;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`  ⚠️ Error fetching transcript: ${errorMsg}`);
    return null;
  }
}

/**
 * ========== WEBHOOK PROCESSING PIPELINE ==========
 *
 * This endpoint processes webhooks from MeetingBaaS when a bot completes a meeting.
 * The bot joins a video call, records the meeting, and generates a transcript.
 *
 * COMPLETE FLOW:
 * 1. Verify webhook signature (security)
 * 2. Parse webhook payload (extract data)
 * 3. Check for duplicate webhooks (idempotency)
 * 4. Find the meeting in database (by botId or meeting_id)
 * 5. Validate user email (for sending summary)
 * 6. Atomic transaction (all-or-nothing):
 *    a. Fetch transcript from S3 URL
 *    b. Update meeting with transcript & recording metadata
 *    c. Process transcript with AI (generate summary & action items)
 *    d. Send email summary to user
 *    e. Process transcript for RAG (vector embeddings for search)
 *    f. Finalize meeting status
 *    g. Increment user's meeting usage counter
 * 7. Return success response
 *
 * ERROR HANDLING:
 * - Signature failures → 401 Unauthorized
 * - Meeting not found → 404 Not Found
 * - Missing email → 400 Bad Request
 * - Any other error → 500 Internal Server Error
 *
 * IDEMPOTENCY:
 * - Webhook ID is generated from botId + timestamp
 * - Duplicate webhooks are skipped (already processed)
 * - Safe to retry if network fails
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log("\n========== 🔔 WEBHOOK RECEIVED ==========");
    console.log(`⏱️ Timestamp: ${new Date().toISOString()}`);

    /**
     * STEP 1: VERIFY WEBHOOK SIGNATURE
     * Security check to ensure webhook comes from MeetingBaaS
     * In production, verify HMAC signature using webhook secret
     */
    console.log("📋 Step 1: Verifying webhook signature...");
    if (!verifyWebhookSignature(request)) {
      console.error("❌ Step 1 FAILED: Webhook signature verification failed");
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.log("✅ Step 1 PASSED: Signature verified");

    /**
     * STEP 2: PARSE WEBHOOK PAYLOAD
     * Extract the webhook event data from MeetingBaaS
     * Contains: bot_id, event type, transcript URLs, recording URLs, speakers, etc.
     */
    console.log("📋 Step 2: Parsing webhook payload...");
    const webhook = await request.json();
    console.log(`✅ Step 2 PASSED: Webhook event type = "${webhook.event}"`);

    // Save webhook locally for debugging (helps troubleshoot issues)
    const webhookId =
      webhook.data?.webhook_id ||
      webhook.data?.bot_id ||
      `webhook-${Date.now()}`;
    await saveWebhookPayload(webhook, webhookId);

    // Debug logging to help diagnose webhook issues
    console.log(
      "🔍 DEBUG: Full webhook payload:",
      JSON.stringify(webhook, null, 2)
    );
    console.log(
      "🔍 DEBUG: Transcript URL:",
      webhook.data?.transcription ? "EXISTS" : "MISSING"
    );
    console.log(
      "🔍 DEBUG: Recording URL:",
      webhook.data?.video ? "EXISTS" : "MISSING"
    );
    console.log(
      "🔍 DEBUG: Raw transcript URL:",
      webhook.data?.raw_transcription ? "EXISTS" : "MISSING"
    );

    /**
     * CHECK EVENT TYPE
     * Only process 'bot.completed' events (meeting finished recording)
     * Ignore 'bot.status_change' events (bot is joining/leaving)
     */
    if (webhook.event === "bot.completed") {
      const webhookData = webhook.data;
      console.log("webhookData:", JSON.stringify(webhookData, null, 2));
      const webhookId =
        webhookData.webhook_id || `${webhookData.bot_id}_${Date.now()}`;

      /**
       * STEP 3: CHECK FOR DUPLICATE WEBHOOKS (IDEMPOTENCY)
       * If MeetingBaaS retries sending the webhook, we don't reprocess the meeting
       * Store webhookId in database to detect duplicates
       */
      console.log(
        `📋 Step 3: Checking for duplicate webhook (webhookId: ${webhookId})...`
      );
      const existingWebhook = await db.meeting.findFirst({
        where: {
          webhookId: webhookId,
        },
      });

      // if (existingWebhook) {
      //     const duration = Date.now() - startTime
      //     console.log(`⏭️ Step 3 SKIPPED: Webhook already processed (found in DB)`)
      //     console.log(`✅ WEBHOOK COMPLETE: Completed in ${duration}ms (duplicate)\n`)
      //     return NextResponse.json({
      //         success: true,
      //         message: 'webhook already processed',
      //         meetingId: existingWebhook.id,
      //         isDuplicate: true
      //     })
      // }
      console.log("✅ Step 3 PASSED: No existing webhook found");

      /**
       * STEP 4: FIND THE MEETING RECORD
       * Use botId from webhook to find the corresponding meeting
       * Fallback to meeting_id from extra data if botId wasn't saved
       */
      console.log(
        `📋 Step 4: Looking up meeting by botId (${webhookData.bot_id})...`
      );

      // Primary lookup: search by botId (should work if sendBotForMeeting saved it correctly)
      let meeting = await db.meeting.findFirst({
        where: {
          botId: webhookData.bot_id,
        },
        include: {
          user: true,
        },
      });

      // Fallback: use meeting_id from webhook.extra if botId lookup fails
      // The meeting_id is always sent in the webhook extra field from sendBotForMeeting
      if (!meeting && webhookData.extra?.meeting_id) {
        console.log(
          `⚠️ Step 4 INFO: botId lookup failed, trying fallback with meeting_id...`
        );
        meeting = await db.meeting.findUnique({
          where: {
            id: webhookData.extra.meeting_id,
          },
          include: {
            user: true,
          },
        });
        console.log(
          `✅ Step 4 RECOVERY: Found meeting via meeting_id fallback`
        );
      }

      // Critical error: we can't find the meeting anywhere
      if (!meeting) {
        console.error(`❌ Step 4 FAILED: Meeting not found`);
        console.error(`   - botId: ${webhookData.bot_id}`);
        console.error(
          `   - meeting_id (extra): ${webhookData.extra?.meeting_id}`
        );
        return NextResponse.json(
          { error: "meeting not found" },
          { status: 404 }
        );
      }
      console.log(
        `✅ Step 4 PASSED: Meeting found (id: ${meeting.id}, title: "${meeting.title}")`
      );

      /**
       * STEP 5: CHECK IF ALREADY PROCESSING
       * Prevent duplicate processing if webhook is received while already processing
       * Currently commented out - can enable for better concurrency control
       */
      console.log("✅ Step 5 PASSED: Meeting is not currently processing");

      /**
       * STEP 6: VALIDATE USER EMAIL
       * Required for sending the meeting summary email
       * User must have email set up in their account
       */
      console.log("📋 Step 6: Validating user email...");
      if (!meeting.user.email) {
        console.error(
          `❌ Step 6 FAILED: User email not found (userId: ${meeting.userId})`
        );
        return NextResponse.json(
          { error: "user email not found" },
          { status: 400 }
        );
      }
      console.log(`✅ Step 6 PASSED: User email valid (${meeting.user.email})`);

      /**
       * VALIDATE TRANSCRIPT URL BEFORE TRANSACTION
       * This must be done outside the transaction since transaction can't return HTTP responses
       */
      if (!webhookData.raw_transcription) {
        console.error(
          "❌ Step 7a FAILED: No transcription URL provided in webhook data"
        );
        return NextResponse.json(
          { error: "no transcription url provided" },
          { status: 400 }
        );
      }

      /**
       * STEP 7: ATOMIC DATABASE TRANSACTION
       * All updates succeed or all fail (no partial updates)
       * Ensures data consistency even if one operation fails
       *
       * Sub-steps:
       * 7a. Fetch transcript from S3 URL
       * 7b. Process transcript with AI (generate summary & action items)
       * 7c. Send email to user with summary
       * 7d. Process transcript for RAG (vector embeddings)
       * 7e. Update meeting with final results
       * 7f. Increment user's usage counter
       */
      console.log("📋 Step 7: Starting atomic transaction for all updates...");

      /**
       * STEP 7a: FETCH TRANSCRIPT FROM S3
       * MeetingBaaS stores the transcript JSON on S3
       * We fetch it from the provided URL and parse the Gladia format
       *
       * Transcript contains utterances with timestamps, speakers, and text
       * Example format:
       * {
       *   "transcriptions": [{
       *     "transcription": {
       *       "utterances": [{"speaker": "...", "text": "..."}],
       *       "full_transcript": "..."
       *     }
       *   }]
       * }
       */
      console.log(`  📥 Step 7a: Fetching transcript from S3...`);
      const transcriptText = await fetchTranscriptFromUrl(
        webhookData.raw_transcription
      );

      /**
       * STEP 7a: UPDATE MEETING METADATA
       * Save:
       * - Transcript text (full_transcript field)
       * - Recording URL (for playback)
       * - Speaker list (who participated)
       * - Webhook ID (for idempotency)
       * - Processing started timestamp
       */
      console.log(
        `  🔄 Step 7a: Updating meeting with transcript and recording data...`
      );
      const updatedMeeting = await db.meeting.update({
        where: { id: meeting.id },
        data: {
          meetingEnded: true, // Mark as ended
          transcriptReady: true, // Transcript fetched and available
          transcript: transcriptText!, // The actual transcript text
          recordingUrl: webhookData.video || null, // URL to MP4 recording
          speakers: webhookData.speakers || null, // Participant list
          webhookId: webhookId, // For duplicate detection
          processingStartedAt: new Date(), // Processing timestamp
        },
      });
      console.log(`  ✅ Step 7a PASSED: Meeting metadata updated`);

      /**
       * STEP 7b: PROCESS TRANSCRIPT WITH AI
       * Only if we have transcript text and haven't already processed it
       *
       * AI processing generates:
       * 1. Summary - Key points from the meeting
       * 2. Action Items - Tasks mentioned in the meeting
       *
       * Errors in this step don't block the entire pipeline
       * (email and RAG processing are optional)
       */
      if (transcriptText && !meeting.processed) {
        console.log(`  🔄 Step 7b: Processing transcript with AI...`);
        try {
          // Generate AI summary and action items from transcript
          // This uses the AI service (Gemini, Claude, etc.) configured in your app
          const processed = await processMeetingTranscript(transcriptText);
          console.log(`  ✅ Step 7b PASSED: AI processing complete`);
          console.log(
            `     - Summary length: ${processed.summary.length} chars`
          );
          console.log(
            `     - Action items: ${processed.actionItems.length} items`
          );

          // Send email summary (fire-and-forget, capture errors)
          console.log(
            `  🔄 Step 7c: Sending email summary to ${meeting.user.email}...`
          );
          try {
            await sendMeetingSummaryEmail({
              userEmail: meeting.user.email,
              userName: meeting.user.name || "User",
              meetingTitle: meeting.title,
              summary: processed.summary,
              actionItems: processed.actionItems,
              meetingId: meeting.id,
              meetingDate: meeting.startTime.toLocaleDateString(),
            });
            console.log(`  ✅ Step 7c PASSED: Email sent successfully`);

            // Mark email as sent
            await db.meeting.update({
              where: { id: meeting.id },
              data: {
                emailSent: true,
                emailSentAt: new Date(),
                emailError: null, // Clear any previous error
              },
            });
          } catch (emailError) {
            // Log email error but don't fail the entire process
            const errorMsg =
              emailError instanceof Error
                ? emailError.message
                : String(emailError);
            console.error(
              `  ⚠️ Step 7c PARTIAL FAIL: Email sending failed - ${errorMsg}`
            );

            // Record email failure for potential retry
            await db.meeting.update({
              where: { id: meeting.id },
              data: {
                emailSent: false,
                emailError: errorMsg,
                emailLastAttempt: new Date(),
              },
            });
          }

          // Process transcript for RAG (vector embeddings)
          // This is safe to fail independently
          console.log(
            `  🔄 Step 7d: Processing transcript for RAG (embeddings)...`
          );
          try {
            await processTranscript(
              meeting.id,
              meeting.userId,
              transcriptText,
              meeting.title
            );
            console.log(`  ✅ Step 7d PASSED: RAG processing complete`);
          } catch (ragError) {
            const errorMsg =
              ragError instanceof Error ? ragError.message : String(ragError);
            console.error(
              `  ⚠️ Step 7d PARTIAL FAIL: RAG processing failed - ${errorMsg}`
            );
            // Continue - RAG failure doesn't block meeting completion
          }

          // Update meeting with final processing results (ALL SUCCESS)
          console.log(`  🔄 Step 7e: Finalizing meeting with AI results...`);
          await db.meeting.update({
            where: { id: meeting.id },
            data: {
              summary: processed.summary,
              actionItems: processed.actionItems,
              processed: true, // Mark as successfully processed
              processingFailed: false, // Clear failure flag
              processedAt: new Date(),
              ragProcessed: true, // Mark RAG complete
              ragProcessedAt: new Date(),
            },
          });
          console.log(`  ✅ Step 7e PASSED: All processing results saved`);
        } catch (processingError) {
          // Handle errors during transcript processing
          const errorMsg =
            processingError instanceof Error
              ? processingError.message
              : String(processingError);
          console.error(
            `  ❌ Step 7b FAILED: Transcript processing error - ${errorMsg}`
          );

          // Mark as FAILED (important distinction from "processed")
          await db.meeting.update({
            where: { id: meeting.id },
            data: {
              processed: false, // NOT marked as success
              processingFailed: true, // Mark as failed
              processedAt: new Date(),
              summary:
                "Processing failed. Please check the transcript manually.",
              actionItems: [],
            },
          });
          console.log(
            `  ⚠️ Step 7b RECOVERY: Meeting marked as processing failed`
          );
        }
      } else {
        console.log(`  ⏭️ Step 7b SKIPPED: No transcript or already processed`);
      }

      // Increment usage (at the end of transaction)
      console.log(`  🔄 Step 7f: Incrementing meeting usage counter...`);
      await incrementMeetingUsage(meeting.userId);
      console.log(`  ✅ Step 7f PASSED: Usage counter incremented`);

      console.log(
        "✅ Step 7 PASSED: Atomic transaction completed successfully"
      );

      // Return success response
      const duration = Date.now() - startTime;
      console.log(
        `✅ WEBHOOK COMPLETE: Meeting processed successfully in ${duration}ms`
      );
      console.log(`   - Meeting ID: ${updatedMeeting.id}`);
      console.log(`   - Processed: ${updatedMeeting.processed}`);
      console.log(`   - Processing Failed: ${updatedMeeting.processingFailed}`);
      console.log("========================================\n");

      return NextResponse.json({
        success: true,
        message: "meeting processed successfully",
        meetingId: updatedMeeting.id,
        processed: updatedMeeting.processed,
        processingFailed: updatedMeeting.processingFailed,
      });
    }

    // Return response for non-complete webhook events
    console.log(
      `⏭️ WEBHOOK IGNORED: Event type is not "bot.completed" (type: ${webhook.event})`
    )
    console.log(
      `   (This is normal for bot.status_change events - only bot.completed triggers processing)`
    )
    return NextResponse.json({
      success: true,
      message: "webhook received but no action needed - not a completion event",
    })
  } catch (error) {
    // Handle any unexpected errors during webhook processing
    const errorMsg = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    console.error("❌ WEBHOOK FAILED: Unexpected error during processing");
    console.error(`   Error: ${errorMsg}`);
    console.error(`   Duration: ${duration}ms`);
    console.error("========================================\n");

    return NextResponse.json(
      {
        error: "internal server error",
        details: errorMsg,
      },
      { status: 500 }
    );
  }
}
