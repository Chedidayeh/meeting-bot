import { getUserId } from "@/actions/user/actions"
import { sendBotForMeeting } from "@/inngest/tasks/syncAndSchedule"
import { NextRequest, NextResponse } from "next/server"

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ meetingId: string }> }
) {
    try {
        // Verify user is authenticated
        const userId = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
        }

        // Await params before destructuring
        const { meetingId } = await params

        if (!meetingId) {
            return NextResponse.json({ error: "Meeting ID is required" }, { status: 400 })
        }

        // Call the send bot function from syncAndSchedule
        const result = await sendBotForMeeting(meetingId)

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Failed to send bot" },
                { status: 400 }
            )
        }

        return NextResponse.json(
            { success: true, message: "Bot sent successfully" },
            { status: 200 }
        )

    } catch (error) {
        console.error("Error sending bot:", error)
        return NextResponse.json(
            { error: "Failed to send bot" },
            { status: 500 }
        )
    }
}
