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
        // Parse the incoming webhook payload from MeetingBaaS
        // Example input: { event: 'complete', data: { bot_id: 'bot_123', transcript: [...], mp4: 'https://...', speakers: [...] } }
        const webhook = await request.json()

        // Check if the webhook event indicates meeting completion
        if (webhook.event === 'complete') {
            // Extract the meeting data from the webhook payload
            const webhookData = webhook.data

            // Find the meeting record in database using the bot ID from webhook
            // Example: Searches for meeting where botId matches 'bot_123'
            const meeting = await db.meeting.findFirst({
                where: {
                    botId: webhookData.bot_id
                },
                include: {
                    user: true  // Include user data for email sending
                }
            })

            // Handle case where no meeting is found for the given bot ID
            if (!meeting) {
                console.error('meeting not found for bot id:', webhookData.bot_id)
                return NextResponse.json({ error: 'meeting not found' }, { status: 404 })
            }

            // Increment the user's meeting usage count for billing/limits
            // Example: Updates user_456's meeting count from 5 to 6
            await incrementMeetingUsage(meeting.userId)

            // Validate that user has an email address for sending summary
            if (!meeting.user.email) {
                console.error('user email not found for this meeting', meeting.id)
                return NextResponse.json({ error: 'user email not found' }, { status: 400 })
            }

            // Update meeting record with transcript and recording data from webhook
            // Example: Updates meeting with transcript, recording URL, and speaker info
            await db.meeting.update({
                where: {
                    id: meeting.id
                },
                data: {
                    meetingEnded: true,                    // Mark meeting as ended
                    transcriptReady: true,                 // Indicate transcript is available
                    transcript: webhookData.transcript || null,  // Store raw transcript data
                    recordingUrl: webhookData.mp4 || null,       // Store video recording URL
                    speakers: webhookData.speakers || null       // Store speaker information
                }
            })

            // Process transcript only if it exists and hasn't been processed before
            if (webhookData.transcript && !meeting.processed) {
                try {
                    // Generate AI summary and action items from transcript
                    // Example input: Raw transcript data from webhook
                    // Example output: { summary: "Meeting discussed Q1 roadmap...", actionItems: ["Finalize budget by Friday", "Schedule follow-up meeting"] }
                    const processed = await processMeetingTranscript(webhookData.transcript)

                    // Initialize variable to store formatted transcript text
                    let transcriptText = ''

                    // Format transcript based on its structure (array vs string)
                    if (Array.isArray(webhookData.transcript)) {
                        // Convert array format to readable text with speaker attribution
                        // Example input: [{ speaker: "John", words: [{ word: "Hello" }, { word: "everyone" }] }]
                        // Example output: "John: Hello everyone\nSarah: Thanks for joining"
                        transcriptText = webhookData.transcript
                            .map((item: any) => `${item.speaker || 'Speaker'}: ${item.words.map((w: any) => w.word).join(' ')}`)
                            .join('\n')
                    } else {
                        // Use transcript as-is if it's already a string
                        transcriptText = webhookData.transcript
                    }

                    try {
                        // Send email summary to user with meeting details and AI-generated content
                        // Example: Sends email to user@example.com with meeting summary and action items
                        await sendMeetingSummaryEmail({
                            userEmail: meeting.user.email,           // Recipient email
                            userName: meeting.user.name || 'User',    // Recipient name
                            meetingTitle: meeting.title,             // Meeting title
                            summary: processed.summary,              // AI-generated summary
                            actionItems: processed.actionItems,      // AI-extracted action items
                            meetingId: meeting.id,                   // Meeting ID for tracking
                            meetingDate: meeting.startTime.toLocaleDateString()  // Formatted date
                        })

                        // Mark email as sent in database
                        await db.meeting.update({
                            where: {
                                id: meeting.id
                            },
                            data: {
                                emailSent: true,        // Flag indicating email was sent
                                emailSentAt: new Date() // Timestamp of email sending
                            }
                        })
                    } catch (emailError) {
                        // Log email sending errors but don't fail the entire process
                        console.error('failed to send the email:', emailError)
                    }

                    // Process transcript for RAG (Retrieval-Augmented Generation) functionality
                    // This creates embeddings and stores them in Pinecone for semantic search
                    // Example: Converts transcript chunks to vectors and stores in vector database
                    await processTranscript(meeting.id, meeting.userId, transcriptText, meeting.title)

                    // Update meeting with final processing results
                    await db.meeting.update({
                        where: {
                            id: meeting.id
                        },
                        data: {
                            summary: processed.summary,        // Store AI-generated summary
                            actionItems: processed.actionItems, // Store AI-extracted action items
                            processed: true,                   // Mark as processed
                            processedAt: new Date(),           // Processing timestamp
                            ragProcessed: true,                // Mark RAG processing complete
                            ragProcessedAt: new Date()         // RAG processing timestamp
                        }
                    })

                } catch (processingError) {
                    // Handle errors during transcript processing
                    console.error('failed to process the transcript:', processingError)

                    // Mark meeting as processed even if AI processing failed
                    await db.meeting.update({
                        where: {
                            id: meeting.id
                        },
                        data: {
                            processed: true,                    // Mark as processed
                            processedAt: new Date(),           // Processing timestamp
                            summary: 'processing failed. please check the transcript manually.',  // Error message
                            actionItems: []                    // Empty action items on failure
                        }
                    })
                }
            }

            // Return success response with meeting ID
            // Example output: { success: true, message: 'meeting processed succesfully', meetingId: 'meeting_123' }
            return NextResponse.json({
                success: true,
                message: 'meeting processed succesfully',
                meetingId: meeting.id
            })
        }
        // Return response for non-complete webhook events
        // Example output: { success: true, message: 'webhook recieved but no action needed bro' }
        return NextResponse.json({
            success: true,
            message: 'webhook recieved but no action needed bro'
        })
    } catch (error) {
        // Handle any unexpected errors during webhook processing
        console.error('webhook processing errir:', error)
        return NextResponse.json({ error: 'internal server error' }, { status: 500 })
    }
}