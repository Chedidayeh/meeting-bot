/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pinecone } from '@pinecone-database/pinecone'

let pinecone: Pinecone | null = null
let index: any = null

function getPineconeClient() {
    if (!pinecone) {
        pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY!,
        })
    }
    return pinecone
}

function getPineconeIndex() {
    if (!index) {
        const client = getPineconeClient()
        index = client.index(process.env.PINECONE_INDEX_NAME!)
    }
    return index
}

export async function saveManyVectors(vectors: Array<{
    id: string
    embedding: number[]
    metadata: any
}>) {
    const upsertData = vectors.map(v => ({
        id: v.id,
        values: v.embedding,
        metadata: v.metadata
    }))

    await getPineconeIndex().upsert(upsertData)
}

export async function searchVectors(
    embedding: number[],
    filter: any = {},
    topK: number = 5
) {
    const result = await getPineconeIndex().query({
        vector: embedding,
        filter,
        topK,
        includeMetadata: true
    })

    return result.matches || []
}

