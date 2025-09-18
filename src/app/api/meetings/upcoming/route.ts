
import { getUserId } from "@/actions/user/actions"
import { db } from "@/db"
import { NextResponse } from "next/server"

export async function GET() {
    try {
        const  userId  = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }

        const user = await db.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const now = new Date()
        const upcomingMeetings = await db.meeting.findMany({
            where: {
                userId: user.id,
                startTime: { gte: now },
                isFromCalendar: true
            },
            orderBy: { startTime: 'asc' },
            take: 10
        })

        console.log(upcomingMeetings)

        const events = upcomingMeetings.map(meeting => ({
            id: meeting.calendarEventId || meeting.id,
            summary: meeting.title,
            start: { dateTime: meeting.startTime.toISOString() },
            end: { dateTime: meeting.endTime.toISOString() },
            attendees: meeting.attendees ? JSON.parse(meeting.attendees as string) : [],
            hangoutLink: meeting.meetingUrl,
            conferenceData: meeting.meetingUrl ? { entryPoints: [{ uri: meeting.meetingUrl }] } : null,
            botScheduled: meeting.botScheduled,
            meetingId: meeting.id
        }))

        return NextResponse.json({
            events,
            connected: user.calendarConnected,
            source: 'database'
        })

    } catch (error) {
        console.error('Error fetching meetings:', error)
        return NextResponse.json({
            error: "Failed to fetch meetings",
            events: [],
            connected: false
        }, { status: 500 })
    }
}