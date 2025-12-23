/* eslint-disable @typescript-eslint/no-explicit-any */
// Import required modules for meeting processing, database operations, email service, RAG processing, and usage tracking
import { processMeetingTranscript } from "@/lib/ai-processor";
import { db } from "@/db";
import { sendMeetingSummaryEmail } from "@/lib/email-service-free";
import { processTranscript } from "@/lib/rag";
import { incrementMeetingUsage } from "@/lib/usage";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const webhook = await request.json();

    if (webhook.event === "bot.completed") {
      const webhookData = webhook.data;
      const { user_id, meeting_id } = webhook.extra;
      console.log("webhook extra data:", webhook.extra);
      // STEP 1: Validate webhook data - ensure we have the required identifiers
      console.log("Processing webhook for meeting ID:", meeting_id, "and user ID:", user_id);
      if (!user_id || !meeting_id) {
        console.error("Missing user_id or meeting_id in webhook");
        return NextResponse.json(
          { error: "Missing required identifiers" },
          { status: 400 }
        );
      }

      // STEP 2: Find the meeting record in database using user_id and meeting_id
      console.log("Finding meeting with ID:", meeting_id, "and user ID:", user_id);
      const meeting = await db.meeting.findUnique({
        where: { id: meeting_id },
      });

      if (!meeting || meeting.userId !== user_id) {
        console.error("Meeting not found or user mismatch");
        return NextResponse.json(
          { error: "Meeting not found" },
          { status: 404 }
        );
      }

      // STEP 3: Update meeting with raw webhook data (recording URLs, speakers, participants, timestamps)
      console.log("Updating meeting with webhook data...");
      await db.meeting.update({
        where: { id: meeting_id },
        data: {
          recordingUrl: webhookData.video,
          speakers: webhookData.speakers,
          attendees: webhookData.participants,
          botJoinedAt: new Date(webhookData.joined_at),
          endTime: new Date(webhookData.exited_at),
          meetingEnded: true,
          processingStartedAt: new Date(),
        },
      });

      // STEP 4: Fetch the transcription data from the URL (or use injected test data)
      console.log("Fetching transcription data...");
      let transcriptionData;
      if ((webhook as any)._transcriptionData) {
        // Test mode - use injected transcription data
        console.log("Using injected transcription data (test mode)");
        transcriptionData = (webhook as any)._transcriptionData;
      } else {
        // Production mode - fetch from URL
        try {
          console.log("Fetching from URL:", webhookData.transcription);
          const transcriptionResponse = await fetch(webhookData.transcription);
          if (!transcriptionResponse.ok) {
            throw new Error(
              `Failed to fetch transcription: ${transcriptionResponse.status} ${transcriptionResponse.statusText}`
            );
          }
          transcriptionData = await transcriptionResponse.json();
        } catch (fetchError) {
          console.error("Error fetching transcription:", fetchError);
          throw fetchError;
        }
      }

      // STEP 5: Store the raw transcription in database
      console.log("Storing transcription data in database...");
      const transcriptJson = transcriptionData.result;
      await db.meeting.update({
        where: { id: meeting_id },
        data: {
          transcript: transcriptJson,
        },
      });

      // STEP 6: Process transcription with AI to extract summary and action items
      console.log("Processing transcription with AI...");
      const aiProcessResult = await processMeetingTranscript(
        transcriptJson.utterances
      );

      await db.meeting.update({
        where: { id: meeting_id },
        data: {
          summary: aiProcessResult.summary,
          actionItems: aiProcessResult.actionItems,
          processed: true,
          processedAt: new Date(),
        },
      });

      // STEP 7: Process transcription for RAG (vector embeddings for semantic search)
      // Convert utterances array to formatted string for RAG processing
      console.log("Processing transcription for RAG...");
      const transcriptString = transcriptJson.utterances
        .map((utterance: any) => `${utterance.speaker}: ${utterance.text}`)
        .join("\n");

      await processTranscript(meeting_id, user_id, transcriptString, meeting.title || "");

      await db.meeting.update({
        where: { id: meeting_id },
        data: {
          ragProcessed: true,
          ragProcessedAt: new Date(),
        },
      });

      // STEP 8: Fetch user and send meeting summary email
      console.log("Fetching user for email notification...");
      const user = await db.user.findUnique({
        where: { id: user_id },
      });

      if (user && user.email) {
        try {
          // await sendMeetingSummaryEmail(user, {
          //   title: meeting.title,
          //   summary: aiProcessResult.summary,
          //   actionItems: aiProcessResult.actionItems,
          //   attendees: webhookData.participants,
          //   duration: webhookData.duration_seconds,
          // });

          await db.meeting.update({
            where: { id: meeting_id },
            data: {
              emailSent: true,
              emailSentAt: new Date(),
            },
          });
        } catch (emailError) {
          console.error("Email sending failed:", emailError);
          await db.meeting.update({
            where: { id: meeting_id },
            data: {
              emailError: String(emailError),
              emailLastAttempt: new Date(),
            },
          });
        }
      }

      // STEP 9: Increment user's monthly meeting usage counter for billing/quota tracking
      console.log("Incrementing meeting usage for user ID:", user_id);
      await incrementMeetingUsage(user_id);

      console.log("✅ Meeting processing completed successfully");
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("webhook processing error:", error);
    return NextResponse.json(
      { error: "internal server error" },
      { status: 500 }
    );
  }
}
