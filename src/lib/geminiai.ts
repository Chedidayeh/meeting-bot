import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// For embeddings, we'll use the text-embedding-004 model
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })

// For chat completions
const chatModel = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
    }
})

export async function createEmbedding(text: string) {
    try {
        const result = await embeddingModel.embedContent(text)
        return result.embedding.values
    } catch (error) {
        console.error('Error creating embedding:', error)
        throw new Error('Failed to create embedding with Gemini')
    }
}

export async function createManyEmbeddings(texts: string[]) {
    try {
        // Process embeddings in batches to avoid rate limits
        const batchSize = 5
        const allEmbeddings = []
        
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize)
            const batchPromises = batch.map(text => createEmbedding(text))
            const batchEmbeddings = await Promise.all(batchPromises)
            allEmbeddings.push(...batchEmbeddings)
        }
        
        return allEmbeddings
    } catch (error) {
        console.error('Error creating many embeddings:', error)
        throw new Error('Failed to create embeddings with Gemini')
    }
}

export async function chatWithAI(systemPrompt: string, userQuestion: string) {
    try {
        const prompt = `${systemPrompt}\n\nUser question: ${userQuestion}`
        
        const result = await chatModel.generateContent(prompt)
        const response = await result.response
        const text = response.text()
        
        return text || 'Sorry, I could not generate a response.'
    } catch (error) {
        console.error('Error in chat completion:', error)
        throw new Error('Failed to generate chat response with Gemini')
    }
}