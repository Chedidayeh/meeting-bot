import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
;
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
    try {
        const  userId  = await getUserId()

        if (!userId) {
            return NextResponse.json({ error: 'not authed' }, { status: 401 })
        }

        const user = await db.user.findUnique({
            where: {
                id: userId
            },
            select: {
                currentPlan: true,
                subscriptionStatus: true,
                meetingsThisMonth: true,
                chatMessagesToday: true,
                billingPeriodStart: true,
            }
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }
        return NextResponse.json(user)
    } catch (error) {
        return NextResponse.json({ error: 'failed to fetch usaged' }, { status: 500 })
    }
}