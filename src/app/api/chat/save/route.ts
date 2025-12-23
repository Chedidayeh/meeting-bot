import { auth } from '@/auth'
import { db } from '@/db'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { meetingId, content, isBot } = await req.json()

    if (!meetingId || !content) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Verify the meeting belongs to the user
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { user: true }
    })

    if (!meeting || meeting.user.email !== session.user.email) {
      return NextResponse.json(
        { error: 'Meeting not found or access denied' },
        { status: 404 }
      )
    }

    const chatMessage = await db.chatMessage.create({
      data: {
        meetingId,
        content,
        isBot: isBot || false
      }
    })

    return NextResponse.json(chatMessage)
  } catch (error) {
    console.error('Error saving chat message:', error)
    return NextResponse.json(
      { error: 'Failed to save message' },
      { status: 500 }
    )
  }
}
