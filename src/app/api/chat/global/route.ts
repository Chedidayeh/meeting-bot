import { auth } from '@/auth'
import { db } from '@/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }


    // Verify the session belongs to the user
    const chatSession = await db.chatSession.findFirst({
      where: { userId: session.user.id }
    })

    if (!chatSession || chatSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Session not found or access denied' },
        { status: 404 }
      )
    }

    const messages = await db.globalChatMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching chat messages:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}

