"use server"

import { auth, signIn } from "@/auth"
import { db } from "@/db"
import { canUserChat, incrementChatUsage, incrementMeetingUsage } from "@/lib/usage"



export const GoogleLogin = async () => {
  await signIn("google", { redirectTo: "/" });
}


export async function getUserId() {
  try {
    const session = await auth()
    if (!session) return null
    const user = await db.user.findUnique({
      where: { id: session.user.id }
    })
    return user?.id
  } catch (error) {
    console.log(error)
  }

}

export async function getUser() {
  try {
    const session = await auth()
    if (!session) return null
    const user = await db.user.findUnique({
      where: { id: session.user.id }
    })
    return user
  } catch (error) {
    console.log(error)
  }

}

export async function getUserUsage(userId: string) {
  try {
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
    return user
  } catch (error) {
    console.log(error)
  }
}
export async function getUserById(userId: string) {
  try {
    const user = await db.user.findUnique({
      where: { id: userId }
    })
    return user
  } catch (error) {
    console.log(error)
  }
}

export async function incrementChatUsageFunction() {
  try {
    const userId = await getUserId()
    if (!userId) {
      return null
    }

    const user = await db.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        currentPlan: true,
        subscriptionStatus: true,
        chatMessagesToday: true
      }
    })

    if (!user) {
      return null
    }

    const chatCheck = await canUserChat(user.id)

    if (!chatCheck.allowed) {
      return {
        error: chatCheck.reason,
        upgradeRequired: true
      }
    }

    await incrementChatUsage(userId)
    return user
  } catch (error) {
    console.log(error)
  }
}

export async function incrementMeetingUsageFunction() {
  try {
    const userId = await getUserId()
    if (!userId) {
      return false
    }

    const user = await db.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
      }
    })

    if (!user) {
      return false
    }

    await incrementMeetingUsage(userId)

    return true

  } catch (error) {
    console.log(error)
  }
}

export async function getUpcomingEvents() {
  try {
    const  userId  = await getUserId()
    if (!userId) {
        return false
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

    const connected = !!(user && user.calendarConnected && user.googleAccessToken)


    return connected
    
} catch (error) {
  console.log(error)
    return false
}
  
}
