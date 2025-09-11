import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
import { NextResponse } from "next/server";

export async function POST() {
    try {
        const userId = await getUserId()
        if (!userId) {
            return NextResponse.json({ error: "Not authed" }, { status: 401 })
        }

        await db.user.update({
            where: {
                id: userId
            },
            data: {
                calendarConnected: false,
                googleAccessToken: null,
                googleRefreshToken: null,
                googleTokenExpiry: null
            }
        })

        return NextResponse.json({ success: true, message: "cal disconnected succesfuly" })
    } catch (error) {
        console.error('disconnect error:', error)
        return NextResponse.json({ error: 'failed to disconnect calendar ' }, { status: 500 })
    }
}