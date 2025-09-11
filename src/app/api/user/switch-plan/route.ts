import { getUserId } from '@/actions/user/actions'
import { db } from '@/db'
import { NextRequest, NextResponse } from 'next/server'

const VALID_PLANS = ['free', 'starter', 'pro', 'premium']

export async function POST(request: NextRequest) {
    try {
        const userId = await getUserId()

        if (!userId) {
            return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
        }

        const { planName } = await request.json()

        if (!planName || !VALID_PLANS.includes(planName)) {
            return NextResponse.json({ 
                error: 'Invalid plan. Must be one of: free, starter, pro, premium' 
            }, { status: 400 })
        }

        // Get current user
        const user = await db.user.findUnique({
            where: { id: userId }
        })

        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 })
        }

        // Update user plan
        const updatedUser = await db.user.update({
            where: { id: userId },
            data: {
                currentPlan: planName,
                subscriptionStatus: planName === 'free' ? 'inactive' : 'active',
                // Reset usage counters when switching plans
                meetingsThisMonth: 0,
                chatMessagesToday: 0,
                billingPeriodStart: planName === 'free' ? null : new Date()
            }
        })

        return NextResponse.json({ 
            success: true, 
            message: `Successfully switched to ${planName} plan`,
            plan: planName,
            subscriptionStatus: updatedUser.subscriptionStatus
        })

    } catch (error) {
        console.error('Plan switching error:', error)
        return NextResponse.json({ 
            error: 'Failed to switch plan' 
        }, { status: 500 })
    }
}
