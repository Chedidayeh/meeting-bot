import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
;
import { NextResponse } from "next/server";

export async function POST() {
    const  userId  = await getUserId()

    if (!userId) {
        return NextResponse.json({ error: 'unauthoarized' }, { status: 401 })
    }

    try {
        await db.userIntegration.delete({
            where: {
                userId_platform: {
                    userId,
                    platform: 'jira'
                }
            }
        })

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Error disconnecting jira:', error)
        return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 })
    }

}