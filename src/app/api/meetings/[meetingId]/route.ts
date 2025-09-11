import { getUserId } from "@/actions/user/actions";
import { db } from "@/db";
;
import { NextRequest, NextResponse } from "next/server";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ meetingId: string }> }
) {
    try {
        const userId = await getUserId()

        const { meetingId } = await params

        const meeting = await db.meeting.findUnique({
            where: {
                id: meetingId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    }
                }
            }
        })

        if (!meeting) {
            return NextResponse.json({ error: 'meeting not found' }, { status: 404 })
        }

        const responseData = {
            ...meeting,
            isOwner: userId === meeting.user?.id
        }

        return NextResponse.json(responseData)
    } catch (error) {
        console.error('api error:', error)
        return NextResponse.json({ error: 'failed to fetch meeting' }, { status: 500 })
    }
}

export async function DELETE(
    request: NextRequest,
    context: { params: Promise<{ meetingId: string }> }
) {
    try {
        const  userId  = await getUserId()

        if (!userId) {
            return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
        }

        const { meetingId } = await context.params

        const meeting = await db.meeting.findUnique({
            where: {
                id: meetingId
            },
            include: {
                user: true
            }
        })

        if (!meeting) {
            return NextResponse.json({ error: 'meeting not found' }, { status: 404 })
        }

        if (meeting.user.id !== userId) {
            return NextResponse.json({ error: 'not authorized to delete this meeting' }, { status: 403 })
        }

        await db.meeting.delete({
            where: {
                id: meetingId
            }
        })

        return NextResponse.json({
            success: true,
            message: 'meeting deleted succesfully'
        })

    } catch (error) {
        console.error('failed to delere meeting', error)
        return NextResponse.json({ error: 'failed to delete meeting' }, { status: 500 })
    }
}