/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useEffect, useState, useRef } from 'react'
import useChatAll from './hooks/useChatAll'
import ChatSuggestions from './components/ChatSuggestions'
import ChatMessages from './components/ChatMessages'
import ChatInput from './components/ChatInput'
import ChatHistorySidebar from './components/ChatHistorySidebar'

interface ChatSession {
    id: string
    title: string
    createdAt: string
    messages?: any[]
}

function Chat() {
    const {
        chatInput,
        setChatInput,
        messages,
        setMessages,
        showSuggestions,
        isLoading,
        chatSuggestions,
        handleSendMessage: originalHandleSendMessage,
        handleSuggestionClick,
        handleInputChange
    } = useChatAll()

    const [sessions, setSessions] = useState<ChatSession[]>([])
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
    const [isLoadingSessions, setIsLoadingSessions] = useState(true)
    const prevMessagesLengthRef = useRef(0)

    // Load all sessions on mount
    useEffect(() => {
        loadSessions()
    }, [])

    // Create a new session on mount if no current session
    useEffect(() => {
        if (!isLoadingSessions && !currentSessionId && sessions.length === 0) {
            createNewSession()
        }
    }, [isLoadingSessions, currentSessionId])

    const loadSessions = async () => {
        try {
            setIsLoadingSessions(true)
            const response = await fetch('/api/chat/sessions')
            if (response.ok) {
                const savedSessions = await response.json()
                setSessions(savedSessions)
                
                // Set the first session as current if available
                if (savedSessions.length > 0 && !currentSessionId) {
                    setCurrentSessionId(savedSessions[0].id)
                    setMessages(savedSessions[0].messages || [])
                    prevMessagesLengthRef.current = savedSessions[0].messages?.length || 0
                }
            }
        } catch (error) {
            console.error('Error loading sessions:', error)
        } finally {
            setIsLoadingSessions(false)
        }
    }

    const createNewSession = async () => {
        try {
            const response = await fetch('/api/chat/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'New Chat' })
            })

            if (response.ok) {
                const newSession = await response.json()
                setSessions(prev => [newSession, ...prev])
                setCurrentSessionId(newSession.id)
                setMessages([])
                prevMessagesLengthRef.current = 0
            }
        } catch (error) {
            console.error('Error creating session:', error)
        }
    }

    const switchSession = async (sessionId: string) => {
        setCurrentSessionId(sessionId)
        // Load messages for this session
        const session = sessions.find(s => s.id === sessionId)
        if (session) {
            setMessages(session.messages || [])
            prevMessagesLengthRef.current = session.messages?.length || 0
        }
    }

    const deleteSession = async (sessionId: string) => {
        try {
            // You can add a DELETE endpoint if needed
            setSessions(prev => prev.filter(s => s.id !== sessionId))
            if (currentSessionId === sessionId) {
                createNewSession()
            }
        } catch (error) {
            console.error('Error deleting session:', error)
        }
    }

    // Save messages when user sends or AI responds
    useEffect(() => {
        if (messages.length > prevMessagesLengthRef.current && currentSessionId) {
            // Get newly added messages
            const startIndex = Math.max(0, prevMessagesLengthRef.current)
            const newMessages = messages.slice(startIndex)

            // Save each new message
            newMessages.forEach(message => {
                saveMessage(message)
            })
        }
        prevMessagesLengthRef.current = messages.length
    }, [messages, currentSessionId])

    const saveMessage = async (message: any) => {
        if (!currentSessionId) return

        try {
            const response = await fetch('/api/chat/global/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: currentSessionId,
                    content: message.content,
                    isBot: message.isBot
                })
            })

            if (response.ok) {
                const savedMessage = await response.json()
                // Update session in state with new message
                setSessions(prev =>
                    prev.map(session =>
                        session.id === currentSessionId
                            ? {
                                ...session,
                                messages: [...(session.messages || []), savedMessage]
                            }
                            : session
                    )
                )
            }
        } catch (error) {
            console.error('Error saving chat message:', error)
        }
    }

    const handleSendMessage = async () => {
        await originalHandleSendMessage()
    }

    return (
        <div className='h-screen bg-background flex'>
            {/* Main chat area */}
            <div className='flex-1 flex flex-col'>
                <div className='flex-1 flex flex-col max-w-4xl mx-auto w-full'>

                    <div className='flex-1 p-6 overflow-auto'>
                        {messages.length === 0 && showSuggestions ? (
                            <ChatSuggestions
                                suggestions={chatSuggestions}
                                onSuggestionClick={handleSuggestionClick}
                            />
                        ) : (
                            <ChatMessages
                                messages={messages}
                                isLoading={isLoading}
                            />
                        )}

                    </div>
                    <ChatInput
                        chatInput={chatInput}
                        onInputChange={handleInputChange}
                        onSendMessage={handleSendMessage}
                        isLoading={isLoading}
                    />

                </div>

            </div>

            {/* Sidebar with chat sessions - moved to right */}
            <ChatHistorySidebar
                sessions={sessions}
                currentSessionId={currentSessionId}
                isLoading={isLoadingSessions}
                onSelectSession={switchSession}
                onNewChat={createNewSession}
                onDeleteSession={deleteSession}
            />
        </div>
    )
}

export default Chat
