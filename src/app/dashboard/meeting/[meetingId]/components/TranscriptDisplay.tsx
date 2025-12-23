'use client'

interface TranscriptWord {
    word: string
    start: number
    end: number
    confidence?: number
}

interface Utterance {
    text: string
    language: string
    start: number
    end: number
    confidence: number
    channel: number
    words: TranscriptWord[]
    speaker: string
}

interface TranscriptResult {
    utterances: Utterance[]
    languages: string[]
    total_utterances: number
    total_duration: number
}

interface TranscriptDisplayProps {
    transcript: TranscriptResult | Utterance[]
}

export default function TranscriptDisplay({ transcript }: TranscriptDisplayProps) {
    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${minutes}:${secs.toString().padStart(2, '0')}`
    }

    // Handle both formats: nested result object or flat utterances array
    let utterances: Utterance[] = []
    
    if (Array.isArray(transcript)) {
        utterances = transcript
    } else if (transcript && 'utterances' in transcript) {
        utterances = transcript.utterances
    }

    if (!utterances || utterances.length === 0) {
        return (
            <div className='bg-card rounded-lg p-6 border border-border text-center'>
                <p className='text-muted-foreground'>
                    No transcript available
                </p>
            </div>
        )
    }

    const getUtteranceTime = (utterance: Utterance) => {
        return `${formatTime(utterance.start)} - ${formatTime(utterance.end)}`
    }

    const getUtteranceText = (utterance: Utterance) => {
        if (utterance.words && Array.isArray(utterance.words)) {
            return utterance.words.map(word => word.word).join('')
        }
        return utterance.text
    }

    return (
        <div className="bg-card rounded-lg p-6 border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">
                Meeting Transcript
            </h3>

            <div className="space-y-4 max-h-96 overflow-y-auto">
                {utterances.map((utterance, index) => (
                    <div key={index} className="pb-4 border-b border-border last:border-b-0">
                        <div className="flex items-center gap-3 mb-2">
                            <span className="font-medium text-foreground">
                                {utterance.speaker}
                            </span>
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                {getUtteranceTime(utterance)}
                            </span>
                            {utterance.confidence && (
                                <span className="text-xs text-muted-foreground">
                                    ({Math.round(utterance.confidence * 100)}% confidence)
                                </span>
                            )}
                        </div>
                        <p className="text-muted-foreground leading-relaxed pl-4">
                            {getUtteranceText(utterance)}
                        </p>
                    </div>
                ))}
            </div>

        </div>
    )
}