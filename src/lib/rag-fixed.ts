import { db } from "@/db";
import { chatWithAI, createEmbedding } from "./geminiai";
import { searchVectors } from "./pinecone";

/**
 * FIXED VERSION: Deduplicates meetings in results to prevent reporting
 * the same meeting multiple times
 */
export async function chatWithAllMeetingsFixed(
    userId: string,
    question: string
) {
    const questionEmbedding = await createEmbedding(question)

    // Search returns chunks, multiple chunks can be from same meeting
    const results = await searchVectors(
        questionEmbedding,
        { userId },
        8
    )

    // Group results by meeting
    const meetingGroups = new Map<string, typeof results>()
    results.forEach(result => {
        const meetingId = result.metadata?.meetingId
        // Ensure meetingId is a string (Pinecone metadata can have mixed types)
        if (meetingId && typeof meetingId === 'string') {
            if (!meetingGroups.has(meetingId)) {
                meetingGroups.set(meetingId, [])
            }
            meetingGroups.get(meetingId)!.push(result)
        }
    })

    // Build context with one representative chunk per meeting
    const context = Array.from(meetingGroups.entries())
        .map(([meetingId, chunks]) => {
            // Use the chunk with highest confidence
            const bestChunk = chunks.sort((a, b) => 
                (b.score || 0) - (a.score || 0)
            )[0]
            
            const meetingTitle = bestChunk.metadata?.meetingTitle || 'Untitled Meeting'
            const speaker = bestChunk.metadata?.speakerName || 'Unknown'
            const content = bestChunk.metadata?.content || ''
            
            return `Meeting: ${meetingTitle}\n${speaker}: ${content}`
        })
        .join('\n\n---\n\n')

    // Log for debugging
    const uniqueMeetingCount = meetingGroups.size
    console.log(`[RAG] Question: "${question}"`)
    console.log(`[RAG] Found ${results.length} chunks from ${uniqueMeetingCount} unique meetings`)
    console.log(`[RAG] Meeting IDs: ${Array.from(meetingGroups.keys()).join(', ')}`)

    const systemPrompt = `You are helping someone understand their meeting history.
    
Found information from ${uniqueMeetingCount} meeting(s).

Here's what was discussed across their meetings:
${context}

Answer the user's question based only on the meeting content above. When you reference something, mention which meetings it's from.
IMPORTANT: You found information from ${uniqueMeetingCount} different meeting(s), not more.`

    const answer = await chatWithAI(systemPrompt, question)

    return {
        answer,
        meetingCount: uniqueMeetingCount,  // NEW: Return actual count
        sources: results.map(result => ({
            meetingId: result.metadata?.meetingId,
            meetingTitle: result.metadata?.meetingTitle,
            content: result.metadata?.content,
            speakerName: result.metadata?.speakerName,
            confidence: result.score
        }))
    }
}

/**
 * Helper function to debug vector database state
 * Use this to investigate the duplicate meetings issue
 */
export async function debugMeetingVectors(userId: string) {
    const chunks = await db.transcriptChunk.findMany({
        include: {
            meeting: {
                select: {
                    id: true,
                    title: true,
                    userId: true,
                    createdAt: true
                }
            }
        }
    })

    // Group by meeting
    const meetingStats = new Map<string, {
        title: string
        chunkCount: number
        createdAt: Date
    }>()

    chunks.forEach(chunk => {
        if (chunk.meeting.userId === userId) {
            const key = chunk.meetingId
            if (!meetingStats.has(key)) {
                meetingStats.set(key, {
                    title: chunk.meeting.title || 'Untitled',
                    chunkCount: 0,
                    createdAt: chunk.meeting.createdAt
                })
            }
            const stat = meetingStats.get(key)!
            stat.chunkCount += 1
        }
    })

    console.log('\n=== MEETING VECTOR DEBUG ===')
    console.log(`User: ${userId}`)
    console.log(`Total Meetings: ${meetingStats.size}`)
    console.log(`Total Chunks: ${chunks.filter(c => c.meeting.userId === userId).length}\n`)

    meetingStats.forEach((stat, meetingId) => {
        console.log(`📌 ${stat.title}`)
        console.log(`   ID: ${meetingId}`)
        console.log(`   Chunks: ${stat.chunkCount}`)
        console.log(`   Created: ${stat.createdAt.toLocaleString()}`)
    })

    return {
        totalMeetings: meetingStats.size,
        meetings: Array.from(meetingStats.entries()).map(([id, stat]) => ({
            id,
            ...stat
        }))
    }
}
