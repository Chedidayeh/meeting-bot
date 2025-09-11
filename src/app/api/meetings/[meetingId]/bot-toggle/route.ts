import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ meetingId: string }> }
) {
    try {
        const  userId  = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: "not authed" }, { status: 401 })
        }

        const { meetingId } = await context.params
        const { botScheduled } = await request.json()

        const user = await db.user.findUnique({
            where: {
                id: userId
            }
        })

        if (!user) {
            return NextResponse.json({ error: "user not found" }, { status: 404 })
        }

        const meeting = await db.meeting.update({
            where: {
                id: meetingId,
                userId: user.id
            },
            data: {
                botScheduled: botScheduled
            }
        })

        return NextResponse.json({
            success: true,
            botScheduled: meeting.botScheduled,
            message: `Bot ${botScheduled ? 'enabled' : 'disabled'} for meeting`
        })
    } catch (error) {
        console.error('Bot toggle error:', error)
        return NextResponse.json({
            error: "Failed to update bot status"
        }, { status: 500 })
    }
}