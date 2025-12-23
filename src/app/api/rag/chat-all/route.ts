import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
import { chatWithAllMeetingsFixed } from "@/lib/rag-fixed";
;
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { question, userId: slackUserId } = await request.json()

        if (!question) {
            return NextResponse.json({ error: 'missing question' }, { status: 400 })
        }

        let targetUserId = slackUserId

        if (!slackUserId) {
            const userId = await getUserId()
            if (!userId) {
                return NextResponse.json({ error: 'not logged in' }, { status: 401 })
            }

            targetUserId = userId
        } else {
            const user = await db.user.findUnique({
                where: {
                    id: slackUserId
                },
                select: {
                    id: true
                }
            })

            if (!user) {
                return NextResponse.json({ error: 'user not found' }, { status: 404 })
            }

            targetUserId = user.id
        }

        const response = await chatWithAllMeetingsFixed(targetUserId, question)

        return NextResponse.json(response)
    } catch (error) {
        console.error('error in chat:', error)
        return NextResponse.json({
            error: 'failed to process question',
            answer: "I encountered an error while searching your meetings. please try again."
        }, { status: 500 })
    }
}