import { db } from "@/db";
import { chatWithAI, createEmbedding, createManyEmbeddings } from "./geminiai";
import { saveManyVectors, searchVectors } from "./pinecone";
import { chunkTranscript, extractSpeaker } from "./text-chunker";

export async function processTranscript(
    meetingId: string,
    userId: string,
    transcript: string,
    meetingTitle?: string
) {
    const chunks = chunkTranscript(transcript)

    const texts = chunks.map(chunk => chunk.content)

    const embeddings = await createManyEmbeddings(texts)

    const dbChunks = chunks.map((chunk) => ({
        meetingId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        speakerName: extractSpeaker(chunk.content),
        vectorId: `${meetingId}_chunk_${chunk.chunkIndex}`
    }))

    await db.transcriptChunk.createMany({
        data: dbChunks,
        skipDuplicates: true
    })

    const vectors = chunks.map((chunk, index) => ({
        id: `${meetingId}_chunk_${chunk.chunkIndex}`,
        embedding: embeddings[index],
        metadata: {
            meetingId,
            userId,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            speakerName: extractSpeaker(chunk.content),
            meetingTitle: meetingTitle || 'Untitled Meeting'

        }
    }))

    // Example inputs:
    // meetingId: "meeting_123"
    // userId: "user_456"
    // transcript: "John: Welcome to the product meeting.\nSarah: Let's discuss the roadmap.\nJohn: I have the Q1 priorities ready."
    // meetingTitle: "Product Planning Session"
    //
    // Example outputs:
    // 1. Database records created in transcriptChunk table:
    //    - { meetingId: "meeting_123", chunkIndex: 0, content: "John: Welcome to the product meeting.\nSarah: Let's discuss the roadmap.", speakerName: "John", vectorId: "meeting_123_chunk_0" }
    //    - { meetingId: "meeting_123", chunkIndex: 1, content: "John: I have the Q1 priorities ready.", speakerName: "John", vectorId: "meeting_123_chunk_1" }
    //
    // 2. Vectors stored in Pinecone:
    //    - { id: "meeting_123_chunk_0", embedding: [0.123, -0.456, ...], metadata: { meetingId: "meeting_123", userId: "user_456", chunkIndex: 0, content: "John: Welcome...", speakerName: "John", meetingTitle: "Product Planning Session" } }
    //    - { id: "meeting_123_chunk_1", embedding: [0.789, -0.321, ...], metadata: { meetingId: "meeting_123", userId: "user_456", chunkIndex: 1, content: "John: I have...", speakerName: "John", meetingTitle: "Product Planning Session" } }

    await saveManyVectors(vectors)
}

export async function chatWithMeeting(
    userId: string,
    meetingId: string,
    question: string
) {
    const questionEmbedding = await createEmbedding(question)

    const results = await searchVectors(
        questionEmbedding,
        { userId, meetingId },
        5
    )

    const meeting = await db.meeting.findUnique({
        where: {
            id: meetingId
        }
    })

    const context = results
        .map(result => {
            const speaker = result.metadata?.speakerName || 'Unknown'
            const content = result.metadata?.content || ''
            return `${speaker}: ${content}`
        })
        .join('\n\n')

    const systemPrompt = `You are helping someone understand their meeting.
    Meeting: ${meeting?.title || 'Untitled Meeting'}
    Date: ${meeting?.createdAt ? new Date(meeting.createdAt).toDateString() : 'Unknown'}

    Here's what was discussed:
    ${context}

    Answer the user's question based only on the meeting content above. If the answer isn't in the meeting, say so`

    const answer = await chatWithAI(systemPrompt, question)

    return {
        answer,
        sources: results.map(result => ({
            meetingId: result.metadata?.meetingId,
            content: result.metadata?.content,
            speakerName: result.metadata?.speakerName,
            confidence: result.score
        }))
    }
}

export async function chatWithAllMeetings(
    userId: string,
    question: string
) {
    const questionEmbedding = await createEmbedding(question)

    const results = await searchVectors(
        questionEmbedding,
        { userId },
        8
    )

    const context = results
        .map(result => {
            const meetingTitle = result.metadata?.meetingTitle || 'Untitled Meeting'
            const speaker = result.metadata?.speakerName || 'Unknown'
            const content = result.metadata?.content || ''
            return `Meeting: ${meetingTitle}\n${speaker}: ${content}`
        })
        .join('\n\n---\n\n')

    const systemPrompt = `You are helping someone understand their meeting history.
    
    Here's what was discussed across their meetings:
    ${context}

    Answer the user's question based only on the meeting content above. When you reference something, mention which meetings its from.`

    const answer = await chatWithAI(systemPrompt, question)

    return {
        answer,
        sources: results.map(result => ({
            meetingId: result.metadata?.meetingId,
            meetingTitle: result.metadata?.meetingTitle,
            content: result.metadata?.content,
            speakerName: result.metadata?.speakerName,
            confidence: result.score
        }))
    }
}