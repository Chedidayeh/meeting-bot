import { auth } from '@/auth'
import { db } from '@/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { sessionId, content, isBot } = await req.json()

    if (!sessionId || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the session belongs to the user
    const chatSession = await db.chatSession.findUnique({
      where: { id: sessionId }
    })

    if (!chatSession || chatSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      )
    }

    const chatMessage = await db.globalChatMessage.create({
      data: {
        sessionId,
        userId: session.user.id,
        content,
        isBot: isBot || false
      }
    })

    return NextResponse.json(chatMessage)
  } catch (error) {
    console.error('Error saving global chat message:', error)
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 500 }
    )
  }
}

