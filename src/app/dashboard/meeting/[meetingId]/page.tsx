/* eslint-disable react/no-unescaped-entities */
'use client'

import React from 'react'
import { useMeetingDetail } from './hooks/useMeetingDetail'
import MeetingHeader from './components/MeetingHeader'
import MeetingInfo from './components/MeetingInfo'
import { Button } from '@/components/ui/button'
import ActionItems from './components/action-items/ActionItems'
import TranscriptDisplay from './components/TranscriptDisplay'
import ChatSidebar from './components/ChatSidebar'
import CustomAudioPlayer from './components/AudioPlayer'

function MeetingDetail() {

    const {
        meetingId,
        isOwner,
        userChecked,
        chatInput,
        setChatInput,
        messages,
        setMessages,
        showSuggestions,
        activeTab,
        setActiveTab,
        meetingData,
        loading,
        notFound,
        error,
        handleSendMessage: originalHandleSendMessage,
        handleSuggestionClick: originalHandleSuggestionClick,
        handleInputChange,
        deleteActionItem,
        addActionItem,
        displayActionItems,
        meetingInfoData
    } = useMeetingDetail()

    // Track messages to detect user and bot responses
    const prevMessagesLengthRef = React.useRef(0)

    const saveMessage = async (message: any) => {
        try {
            await fetch('/api/chat/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingId,
                    content: message.content,
                    isBot: message.isBot
                })
            })
        } catch (error) {
            console.error('Error saving chat message:', error)
        }
    }

    // Save messages when user sends or AI responds
    React.useEffect(() => {
        if (messages.length > prevMessagesLengthRef.current) {
            // Get newly added messages
            const startIndex = Math.max(0, prevMessagesLengthRef.current)
            const newMessages = messages.slice(startIndex)

            // Save each new message
            newMessages.forEach(message => {
                // Only save if it's a complete message (not a temp ID that starts with 'temp-')
                // This ensures we save after the message is properly created
                if (!message.id.startsWith('temp-')) {
                    saveMessage(message)
                } else {
                    // For temp IDs, save them immediately
                    saveMessage(message)
                }
            })
        }
        prevMessagesLengthRef.current = messages.length
    }, [messages, meetingId])

    const handleMessagesLoaded = React.useCallback((loadedMessages: any[]) => {
        // Only load if messages are currently empty (initial load)
        if (messages.length === 0) {
            setMessages(loadedMessages)
            prevMessagesLengthRef.current = loadedMessages.length
        }
    }, [messages.length, setMessages])

    const handleSendMessage = async () => {
        await originalHandleSendMessage()
    }

    const handleSuggestionClick = (suggestion: string) => {
        originalHandleSuggestionClick(suggestion)
    }

    return (
        <div className='min-h-screen bg-background'>
            {notFound ? (
                <div className='flex items-center justify-center min-h-screen'>
                    <div className='text-center max-w-md'>
                        <div className='mb-4'>
                            <div className='text-6xl font-bold text-muted-foreground mb-4'>404</div>
                            <h1 className='text-2xl font-semibold text-foreground mb-2'>Meeting Not Found</h1>
                            <p className='text-muted-foreground mb-6'>
                                The meeting you're looking for doesn't exist or may have been deleted.
                            </p>
                        </div>
                        <div className='flex gap-3 justify-center'>
                            <Button onClick={() => window.location.href = '/dashboard/main'} className='bg-primary'>
                                Go to Dashboard
                            </Button>
                            <Button variant='outline' onClick={() => window.history.back()}>
                                Go Back
                            </Button>
                        </div>
                    </div>
                </div>
            ) : error ? (
                <div className='flex items-center justify-center min-h-screen'>
                    <div className='text-center max-w-md'>
                        <div className='mb-4'>
                            <div className='text-4xl mb-4'>⚠️</div>
                            <h1 className='text-2xl font-semibold text-foreground mb-2'>Error Loading Meeting</h1>
                            <p className='text-muted-foreground mb-6'>
                                {error}. Please try again later or contact support.
                            </p>
                        </div>
                        <div className='flex gap-3 justify-center'>
                            <Button onClick={() => window.location.reload()} className='bg-primary'>
                                Retry
                            </Button>
                            <Button variant='outline' onClick={() => window.location.href = '/dashboard/main'}>
                                Go to Dashboard
                            </Button>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    <MeetingHeader
                        title={meetingData?.title || 'Meeting'}
                        meetingId={meetingId}
                        summary={meetingData?.summary}
                        actionItems={meetingData?.actionItems?.map(item => `• ${item.text}`).join('\n') || ''}
                        isOwner={isOwner}
                        isLoading={!userChecked}
                    />
                    <div className='flex h-[calc(100vh-73px)]'>
                        <div className={`flex-1 p-6 overflow-auto pb-24 ${!userChecked
                            ? ''
                            : !isOwner
                                ? 'max-w-4xl mx-auto'
                                : ''
                            }`}>
                            <MeetingInfo meetingData={meetingInfoData} />

                            <div className='mb-8'>
                                <div className='flex border-b border-border'>
                                    <Button
                                        variant='ghost'
                                        onClick={() => setActiveTab('summary')}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 rounded-none shadow-none transition-colors
                                        ${activeTab === 'summary'
                                                ? 'border-primary text-primary'
                                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
                                            }`}
                                        style={{ boxShadow: 'none' }}
                                        type='button'
                                    >
                                        Summary
                                    </Button>
                                    <Button
                                        variant='ghost'
                                        onClick={() => setActiveTab('transcript')}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 rounded-none shadow-none transition-colors
                                        ${activeTab === 'transcript'
                                                ? 'border-primary text-primary'
                                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50'
                                            }`}
                                        style={{ boxShadow: 'none' }}
                                        type='button'
                                    >
                                        Transcript
                                    </Button>
                                </div>

                                <div className='mt-6'>
                                    {activeTab === 'summary' && (
                                        <div>
                                            {loading ? (
                                                <div className='bg-card border border-border rounded-lg p-6 text-center'>
                                                    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
                                                    <p className='text-muted-foreground'>Loading meeting data..</p>
                                                </div>
                                            ) : meetingData?.processed ? (
                                                <div className='space-y-6'>
                                                    {meetingData.summary && (
                                                        <div className='bg-card border border-border rounded-lg p-6'>
                                                            <h3 className='text-lg font-semibold text-foreground mb-3'>Meeting Summary</h3>
                                                            <p className='text-muted-foreground leading-relaxed'>
                                                                {meetingData.summary}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {!userChecked ? (
                                                        <div className='bg-card border border-border rounded-lg p-6'>
                                                            <div className='animate-pulse'>
                                                                <div className='h-4 bg-muted rounded w-1/4 mb-4'></div>
                                                                <div className='space-y-2'>
                                                                    <div className='h-3 bg-muted rounded w-3/4'></div>
                                                                    <div className='h-3 bg-muted rounded w-1/2'></div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <>
                                                            {isOwner && displayActionItems.length > 0 && (
                                                                <ActionItems
                                                                    actionItems={displayActionItems}
                                                                    onDeleteItem={deleteActionItem}
                                                                    onAddItem={addActionItem}
                                                                    meetingId={meetingId}
                                                                />
                                                            )}

                                                            {!isOwner && displayActionItems.length > 0 && (
                                                                <div className='bg-card rounded-lg p-6 border border-border'>
                                                                    <h3 className='text-lg font-semibold text-foreground mb-4'>
                                                                        Action Items
                                                                    </h3>
                                                                    <div className='space-y-3'>
                                                                        {displayActionItems.map((item) => (
                                                                            <div key={item.id} className='flex items-start gap-3'>
                                                                                <div className='w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0'></div>
                                                                                <p className='text-sm text-foreground'>{item.text}</p>

                                                                            </div>
                                                                        ))}

                                                                    </div>

                                                                </div>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className='bg-card border border-border rounded-lg p-6 text-center'>
                                                    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
                                                    <p className='text-muted-foreground'>Processing meeting with AI..</p>
                                                    <p className='text-sm text-muted-foreground mt-2'>You'll receive an email when ready</p>

                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'transcript' && (
                                        <div>
                                            {loading ? (
                                                <div className='bg-card border border-border rounded-lg p-6 text-center'>
                                                    <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4'></div>
                                                    <p className='text-muted-foreground'>Loading meeting data..</p>
                                                </div>
                                            ) : meetingData?.transcript ? (
                                                <TranscriptDisplay transcript={meetingData.transcript} />
                                            ) : (
                                                <div className='bg-card rounded-lg p-6 border border-border text-center'>
                                                    <p className='text-muted-foreground'>No transcript avaialable</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                </div>

                            </div>

                        </div>

                        {!userChecked ? (
                            <div className='w-90 border-l border-border p-4 bg-card'>
                                <div className='animate-pulse'>
                                    <div className='h-4 bg-muted rounded w-1/2 mb-4'></div>
                                    <div className='space-y-3'>
                                        <div className='h-8 bg-muted rounded'></div>
                                        <div className='h-8 bg-muted rounded'></div>
                                        <div className='h-8 bg-muted rounded'></div>
                                    </div>
                                </div>
                            </div>
                        ) : isOwner && (
                            <ChatSidebar
                                meetingId={meetingId}
                                messages={messages}
                                chatInput={chatInput}
                                showSuggestions={showSuggestions}
                                onInputChange={handleInputChange}
                                onSendMessage={handleSendMessage}
                                onSuggestionClick={handleSuggestionClick}
                                onMessagesLoaded={handleMessagesLoaded}
                            />
                        )}

                    </div>

                    <CustomAudioPlayer
                        recordingUrl={meetingData?.recordingUrl}
                        isOwner={isOwner}
                    />
                </>
            )}
        </div>
    )
}

export default MeetingDetail
