/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, Trash2 } from 'lucide-react'

interface ChatSession {
    id: string
    title: string
    createdAt: string
    messages?: any[]
}

interface ChatHistorySidebarProps {
    sessions: ChatSession[]
    currentSessionId: string | null
    isLoading: boolean
    onSelectSession: (sessionId: string) => void
    onNewChat: () => void
    onDeleteSession?: (sessionId: string) => void
}

function ChatHistorySidebar({
    sessions,
    currentSessionId,
    isLoading,
    onSelectSession,
    onNewChat,
    onDeleteSession
}: ChatHistorySidebarProps) {
    return (
        <div className='w-80 border-r border-border bg-card flex flex-col h-screen'>
            <div className='p-4 border-b border-border'>
                <Button
                    onClick={onNewChat}
                    className='w-full bg-primary hover:bg-primary/90'
                >
                    <Plus className='h-4 w-4 mr-2' />
                    New Chat
                </Button>
            </div>

            <div className='p-4 border-b border-border'>
                <h3 className='font-semibold text-foreground text-sm'>
                    Chat History
                </h3>
            </div>

            <ScrollArea className='flex-1'>
                <div className='p-2 space-y-1'>
                    {isLoading && sessions.length === 0 ? (
                        <div className='flex justify-center items-center h-20'>
                            <p className='text-xs text-muted-foreground'>Loading sessions...</p>
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className='text-center py-8'>
                            <p className='text-xs text-muted-foreground'>No chats yet</p>
                        </div>
                    ) : (
                        <div className='space-y-1'>
                            {sessions.map((session) => (
                                <div
                                    key={session.id}
                                    className={`p-3 rounded-lg transition-colors cursor-pointer group flex items-center justify-between ${
                                        currentSessionId === session.id
                                            ? 'bg-primary/20 border border-primary/30'
                                            : 'bg-muted/50 hover:bg-muted'
                                    }`}
                                    onClick={() => onSelectSession(session.id)}
                                >
                                    <div className='flex-1 min-w-0'>
                                        <p className='text-xs font-medium text-foreground truncate'>
                                            {session.title}
                                        </p>
                                        <p className='text-xs text-muted-foreground'>
                                            {new Date(session.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            onDeleteSession?.(session.id)
                                        }}
                                        className='opacity-0 group-hover:opacity-100 ml-2 p-1 hover:bg-destructive/20 rounded transition-all'
                                    >
                                        <Trash2 className='h-3 w-3 text-destructive' />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    )
}

export default ChatHistorySidebar

