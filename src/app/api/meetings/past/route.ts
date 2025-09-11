import { db } from "@/db";
import { getUserId } from "@/actions/user/actions";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const  userId  = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: "not authed" }, { status: 401 })
        }
        const user = await db.user.findUnique({
            where: {
                id: userId
            }
        })

        if (!user) {
            return NextResponse.json({ error: "user not found" }, { status: 404 })
        }

        const pastMeetings = await db.meeting.findMany({
            where: {
                userId: user.id,
                meetingEnded: true
            },
            orderBy: {
                endTime: 'desc'
            },
            take: 10
        })

        return NextResponse.json({ meetings: pastMeetings })

    } catch {
        return NextResponse.json({ error: 'failed to fetch past meetings', meetings: [] }, { status: 500 })
    }
}