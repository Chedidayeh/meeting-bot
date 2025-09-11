'use client'

import { getUserUsage, incrementChatUsageFunction, incrementMeetingUsageFunction } from "@/actions/user/actions"
import { useSession } from "next-auth/react"
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react"

interface PlanLimits {
    meetings: number
    chatMessages: number
}

interface UsageData {
    currentPlan: string
    subscriptionStatus: string
    meetingsThisMonth: number
    chatMessagesToday: number
    billingPeriodStart: Date | null
}

interface UsageContextType {
    usage: UsageData | null
    loading: boolean
    canChat: boolean
    canScheduleMeeting: boolean
    limits: PlanLimits
    incrementChatUsage: () => Promise<void>
    incrementMeetingUsage: () => Promise<void>
    refreshUsage: () => Promise<void>
}

const PLAN_LIMITS: Record<string, PlanLimits> = {
    free: { meetings: 0, chatMessages: 0 },
    starter: { meetings: 10, chatMessages: 30 },
    pro: { meetings: 30, chatMessages: 100 },
    premium: { meetings: -1, chatMessages: -1 }
}

const UsageContext = createContext<UsageContextType | undefined>(undefined)


export function UsageProvider({ children }: { children: ReactNode }) {
    const { data , status } = useSession()
    const userId = data?.user.id
    const [usage, setUsage] = useState<UsageData | null>(null)
    const [loading, setLoading] = useState(true)

    const limits = usage ? PLAN_LIMITS[usage.currentPlan] || PLAN_LIMITS.free : PLAN_LIMITS.free

    const canChat = usage ? (
        usage.currentPlan !== 'free' &&
        usage.subscriptionStatus === 'active' &&
        (limits.chatMessages === -1 || usage.chatMessagesToday < limits.chatMessages)
    ) : false

    const canScheduleMeeting = usage ? (
        usage.currentPlan !== 'free' &&
        usage.subscriptionStatus === 'active' &&
        (limits.meetings === -1 || usage.meetingsThisMonth < limits.meetings)
    ) : false

    const fetchUsage = useCallback(async () => {
        if (!userId) return

        try {
            const user = await getUserUsage(userId)
            if (user) {
                setUsage(user)
            }
        } catch (error) {
            console.error('failed to fetch usage', error)
        } finally {
            setLoading(false)
        }
    }, [userId])
    const incrementChatUsage = async () => {
        if (!canChat) {
            return
        }

        try {
            const data = await incrementChatUsageFunction()

            if (!data) return

            if ('id' in data && typeof data.id === 'string') {
                setUsage(prev => prev ? {
                    ...prev,
                    chatMessagesToday: prev.chatMessagesToday + 1
                } : null)
                return
            }

            if ('upgradeRequired' in data && data.upgradeRequired) {
                console.log(data.error)
            }
        } catch (error) {
            console.error('failed to increment chat usage', error)
        }
    }

    const incrementMeetingUsage = async () => {
        if (!canScheduleMeeting) {
            return
        }

        try {
            const res = await incrementMeetingUsageFunction()


            if (res === true) {
                setUsage(prev => prev ? {
                    ...prev,
                    meetingsThisMonth: prev.meetingsThisMonth + 1
                } : null)
            }
        } catch (error) {
            console.error('failed to increment meetign usage:', error)
        }
    }

    const refreshUsage = async () => {
        await fetchUsage()
    }

    useEffect(() => {
        if (status === 'authenticated' && userId) {
            fetchUsage()
        } else if (status === 'authenticated' && !userId) {
            setLoading(false)
        }
    }, [userId, status, fetchUsage])


    return (
        <UsageContext.Provider value={{
            usage,
            loading,
            canChat,
            canScheduleMeeting,
            limits,
            incrementChatUsage,
            incrementMeetingUsage,
            refreshUsage
        }}>
            {children}
        </UsageContext.Provider>
    )
}

export function useUsage() {
    const context = useContext(UsageContext)
    if (context === undefined) {
        throw new Error('useUsage must be defined')
    }

    return context
}