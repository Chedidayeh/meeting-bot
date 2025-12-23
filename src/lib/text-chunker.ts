export function chunkTranscript(transcript: string) {
    const maxChunkSize = 500
    const chunks = []

    const speakerLines = transcript.split('\n').filter(line => line.trim())

    let currentChunk = ''
    let chunkIndex = 0

    for (const line of speakerLines) {
        if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
            chunks.push({
                content: currentChunk.trim(),
                chunkIndex: chunkIndex
            })
            chunkIndex++
            currentChunk = line + '\n'
        } else {
            currentChunk += line + '\n'
        }
    }

    if (currentChunk.trim()) {
        chunks.push({
            content: currentChunk.trim(),
            chunkIndex: chunkIndex
        })
    }

    // Example input:
    // "John: Welcome everyone to today's product planning meeting.\nSarah: Thanks John. Let's start with the Q1 roadmap discussion.\nJohn: I've prepared a draft roadmap that covers our main initiatives.\nSarah: Great, I'd like to focus on the mobile app features first.\nJohn: The mobile team has identified three key features to prioritize.\nSarah: What are the estimated timelines for these features?\nJohn: We're looking at 6-8 weeks for the first feature, 4-6 weeks for the second.\nSarah: That sounds reasonable. Let's also discuss the budget allocation.\nJohn: I have the budget breakdown ready for review."
    //
    // Example output:
    // [
    //   {
    //     content: "John: Welcome everyone to today's product planning meeting.\nSarah: Thanks John. Let's start with the Q1 roadmap discussion.\nJohn: I've prepared a draft roadmap that covers our main initiatives.\nSarah: Great, I'd like to focus on the mobile app features first.\nJohn: The mobile team has identified three key features to prioritize.",
    //     chunkIndex: 0
    //   },
    //   {
    //     content: "Sarah: What are the estimated timelines for these features?\nJohn: We're looking at 6-8 weeks for the first feature, 4-6 weeks for the second.\nSarah: That sounds reasonable. Let's also discuss the budget allocation.\nJohn: I have the budget breakdown ready for review.",
    //     chunkIndex: 1
    //   }
    // ]
    // Each chunk is limited to ~500 characters and contains complete speaker lines

    return chunks
}

export function extractSpeaker(text: string) {
    const match = text.match(/^([A-Za-z\s]+):\s*/)
    return match ? match[1].trim() : 'Unknown Speaker'
}