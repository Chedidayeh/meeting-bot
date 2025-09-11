import { getUser } from "@/actions/user/actions";
import { db } from "@/db";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const user = await getUser()
        if (!user) {
            return NextResponse.json({ error: 'unautorized' }, { status: 401 })
        }

        const dbUser = await db.user.findUnique({
            where: {
                id: user.id
            },
            select: {
                botName: true,
                botImageUrl: true,
                currentPlan: true
            }
        })

        return NextResponse.json({
            botName: dbUser?.botName || 'Meeting Bot',
            botImageUrl: dbUser?.botImageUrl || null,
            plan: dbUser?.currentPlan || 'free'
        })
    } catch (error) {
        console.error('error fetching bot settings:', error)
        return NextResponse.json({ error: 'internal server error' }, { status: 500 })
    }
}


export async function POST(request: Request) {
    try {
        const user = await getUser()
        if (!user) {
            return NextResponse.json({ error: 'unautorized' }, { status: 401 })
        }

        const { botName, botImageUrl } = await request.json()

        await db.user.update({
            where: {
                id: user.id
            },
            data: {
                botName: botName || 'Meeting Bot',
                botImageUrl: botImageUrl
            }
        })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('error saving bot settings:', error)
        return NextResponse.json({ error: 'internal server error' }, { status: 500 })
    }
}