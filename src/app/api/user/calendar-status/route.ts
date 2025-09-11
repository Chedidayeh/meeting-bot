import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
;
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const  userId  = await getUserId()
        if (!userId) {
            return NextResponse.json({ connected: false })
        }

        const user = await db.user.findUnique({
            where: {
                id: userId
            },
            select: {
                calendarConnected: true,
                googleAccessToken: true
            }
        })

        return NextResponse.json({
            connected: user?.calendarConnected && !!user.googleAccessToken
        })
    } catch (error) {
        return NextResponse.json({ connected: false })
    }
}