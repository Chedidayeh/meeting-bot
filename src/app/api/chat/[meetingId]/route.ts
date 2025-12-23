import { auth } from '@/auth'
import { db } from '@/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const session = await auth()
    
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { meetingId } = await params

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

    const messages = await db.chatMessage.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'asc' }
    })

    return NextResponse.json(messages)
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}
