import { GoogleGenerativeAI } from '@google/generative-ai'

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

// For embeddings, we'll use the text-embedding-004 model
const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })

// For chat completions
const chatModel = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
    }
})

export async function createEmbedding(text: string) {
    try {
        const result = await embeddingModel.embedContent(text)
        // Returns an array of 768 floating-point numbers representing the text's semantic meaning
        // Example output for text "What decisions were made in the meeting?":
        // [0.1234567, -0.2345678, 0.3456789, ..., 0.9876543] (768 numbers total)
        // Each number represents a dimension in the embedding space
        // Similar texts will have similar embedding vectors (cosine similarity close to 1)
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
        
        // Returns an array of embedding arrays, one for each input text
        // Example input: ["John: Let's discuss the project timeline", "Sarah: We need to finalize the budget"]
        // Example output: [
        //   [0.1234567, -0.2345678, 0.3456789, ..., 0.9876543], // 768 numbers for first text
        //   [0.2345678, -0.3456789, 0.4567890, ..., 0.8765432]  // 768 numbers for second text
        // ]
        // Each inner array is a 768-dimensional vector representing the semantic meaning of the corresponding text
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
        
        // Example inputs:
        // systemPrompt: "You are helping someone understand their meeting. Meeting: Product Planning Session. Here's what was discussed: John: Let's finalize the Q1 roadmap. Sarah: We need to prioritize the mobile app features."
        // userQuestion: "What decisions were made about the mobile app?"
        //
        // Example output:
        // "Based on the meeting discussion, Sarah mentioned that mobile app features need to be prioritized. However, no specific decisions about which mobile app features to prioritize were finalized in this meeting. You may want to follow up with Sarah or schedule another meeting to discuss the specific mobile app features that should be prioritized for Q1."
        
        return text || 'Sorry, I could not generate a response.'
    } catch (error) {
        console.error('Error in chat completion:', error)
        throw new Error('Failed to generate chat response with Gemini')
    }
}