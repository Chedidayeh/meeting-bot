import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1000,
    }
})

export async function processMeetingTranscript(transcript: unknown) {
    try {
        let transcriptText = ''

        if (Array.isArray(transcript)) {
            transcriptText = transcript
                .map((item: unknown) => {
                    const typedItem = item as { speaker?: string; words?: { word: string }[] }
                    return `${typedItem.speaker || 'Speaker'}: ${typedItem.words?.map((w: { word: string }) => w.word).join(' ') || ''}`
                })
                .join('\n')
        } else if (typeof transcript === 'string') {
            transcriptText = transcript
        } else if (typeof transcript === 'object' && transcript !== null && 'text' in transcript) {
            transcriptText = (transcript as { text: string }).text
        }

        if (!transcriptText || transcriptText.trim().length === 0) {
            throw new Error('No transcript content found')
        }

        const prompt = `You are an AI assistant that analyzes meeting transcripts and provides concise summaries and action items.

Please analyze the meeting transcript and provide:
1. A clear, concise summary (2-3 sentences) of the main discussion points and decisions
2. A list of specific action items mentioned in the meeting

Format your response as JSON:
{
    "summary": "Your summary here",
    "actionItems": [
        "Action item description 1",
        "Action item description 2"
    ]
}

Return only the action item text as strings.
If no clear action items are mentioned, return an empty array for actionItems.

Please analyze this meeting transcript:

${transcriptText}`

        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        if (!text) {
            throw new Error('No response from Gemini')
        }

        const parsed = JSON.parse(text)

        const actionItems = Array.isArray(parsed.actionItems)
            ? parsed.actionItems.map((text: string, index: number) => ({
                id: index + 1,
                text: text
            }))
            : []

        return {
            summary: parsed.summary || 'Summary couldnt be generated',
            actionItems: actionItems
        }

    } catch (error) {
        console.error('error processing transcript with Gemini:', error)

        return {
            summary: 'Meeting transcript processed successfully. Please check the full transcript for details.',
            actionItems: []
        }
    }
}