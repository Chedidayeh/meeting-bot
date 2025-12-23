import { db } from "@/db";
import { inngest } from "@/lib/inngest";
import { Prisma } from "@prisma/client";

type MinimalUser = {
  id: string;
  googleAccessToken: string | null;
  googleRefreshToken?: string | null;
  googleTokenExpiry?: Date | string | null;
  calendarConnected: boolean;
  currentPlan: string;
  subscriptionStatus: string;
  meetingsThisMonth: number;
  botName?: string | null;
  botImageUrl?: string | null;
};

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  hangoutLink?: string;
  conferenceData?: { entryPoints?: Array<{ uri?: string }> };
  attendees?: Array<{ email: string }>;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
};

type MeetingWithUser = {
  id: string;
  title: string | null;
  meetingUrl: string | null;
  userId: string;
  botSent: boolean;
  user: MinimalUser;
};

export const syncAndSchedule = inngest.createFunction(
  { id: "sync-and-schedule" },
  { cron: "*/1 * * * *" }, // every minute
  async () => {
    await syncAllUserCalendars();
    return { ok: true };
  }
);

async function syncAllUserCalendars(): Promise<void> {
  const users = await db.user.findMany({
    where: {
      calendarConnected: true,
      googleAccessToken: { not: null },
    },
  });

  for (const user of users as unknown as MinimalUser[]) {
    try {
      await syncUserCalendar(user);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`sync failed for ${user.id}:`, message);
    }
  }
}

/**
 * ROLE: Synchronizes a user's Google Calendar with the database
 *
 * This function:
 * 1. Checks if the user's Google access token is about to expire
 * 2. Refreshes the token if needed (within 10 minutes of expiry)
 * 3. Fetches upcoming events from Google Calendar (next 7 days)
 * 4. Stores new/updated events in the database
 * 5. Identifies and removes events that were deleted from Google Calendar
 * 6. Disconnects calendar on auth failures (401/403)
 *
 * Called by: syncAndSchedule (Inngest cron job running every minute)
 * Purpose: Keep database in sync with user's Google Calendar
 */
async function syncUserCalendar(user: MinimalUser): Promise<void> {
  try {
    // ========== TOKEN REFRESH CHECK ==========
    let accessToken: string | null = user.googleAccessToken;

    const now = new Date();
    const tokenExpiry = user.googleTokenExpiry
      ? new Date(user.googleTokenExpiry)
      : new Date(0);
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    // If token expires within the next 10 minutes, refresh it proactively
    if (tokenExpiry <= tenMinutesFromNow) {
      accessToken = await refreshGoogleToken(user);
      if (!accessToken) return; // If refresh fails, abort sync
    }

    // ========== FETCH UPCOMING EVENTS ==========
    // Get events for the next 7 days (this window is used for bot scheduling)
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${now.toISOString()}&` +
        `timeMax=${sevenDays.toISOString()}&` +
        `singleEvents=true&orderBy=startTime&showDeleted=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    // ========== ERROR HANDLING ==========
    if (!response.ok) {
      if (response.status === 401) {
        // 401 = Unauthorized: disconnect calendar (token invalid)
        await db.user.update({
          where: { id: user.id },
          data: { calendarConnected: false },
        });
        return;
      }
      throw new Error(`Calendar API failed: ${response.status}`);
    }

    // ========== PROCESS EVENTS ==========
    const data = (await response.json()) as { items?: GoogleEvent[] };
    const events: GoogleEvent[] = data.items || [];

    // Get all events from this user that came from Google Calendar
    const existingEvents = await db.meeting.findMany({
      where: { userId: user.id, isFromCalendar: true, startTime: { gte: now } },
    });

    // Track which Google Calendar event IDs are currently in the calendar
    const googleEventIds = new Set<string>();

    // Process each event from Google Calendar
    for (const event of events) {
      // Skip cancelled events and delete them from DB
      if (event.status === "cancelled") {
        await handleDeletedEvent(event);
        continue;
      }

      // Track this event as "still active" in Google Calendar
      googleEventIds.add(event.id);

      // Create or update the event in our database
      await processEvent(user, event);
    }

    // ========== CLEANUP DELETED EVENTS ==========
    // Find events that exist in our DB but not in Google Calendar anymore
    const deletedEvents = existingEvents.filter(
      (dbEvent) =>
        !googleEventIds.has(
          (dbEvent as unknown as { calendarEventId: string | null })
            .calendarEventId || ""
        )
    );

    // Remove deleted events from database
    if (deletedEvents.length > 0) {
      for (const deletedEvent of deletedEvents) {
        await handleDeletedEventFromDB(deletedEvent);
      }
    }
  } catch (error) {
    const message: string =
      error instanceof Error ? error.message : String(error);
    console.error(`calendar error for ${user.id}:`, message);

    // If auth fails, disconnect the calendar to prevent repeated failed attempts
    if (message.includes("401") || message.includes("403")) {
      await db.user.update({
        where: { id: user.id },
        data: { calendarConnected: false },
      });
    }
  }
}

async function refreshGoogleToken(user: MinimalUser): Promise<string | null> {
  try {
    if (!user.googleRefreshToken) {
      await db.user.update({
        where: { id: user.id },
        data: { calendarConnected: false, googleAccessToken: null },
      });
      return null;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: user.googleRefreshToken || "",
        grant_type: "refresh_token",
      }),
    });
    const tokens = (await response.json()) as {
      access_token?: string;
      expires_in: number;
    };

    if (!tokens.access_token) {
      await db.user.update({
        where: { id: user.id },
        data: { calendarConnected: false },
      });
      return null;
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token as string;
  } catch (error) {
    console.error(`token refresh error for ${user.id}: `, error);
    await db.user.update({
      where: { id: user.id },
      data: { calendarConnected: false },
    });
    return null;
  }
}

async function handleDeletedEvent(
  event: Pick<GoogleEvent, "id">
): Promise<void> {
  try {
    const existingMeeting = await db.meeting.findUnique({
      where: { calendarEventId: event.id },
    });
    if (existingMeeting) {
      await db.meeting.delete({ where: { calendarEventId: event.id } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("error deleting event:", message);
  }
}

async function handleDeletedEventFromDB(dbEvent: {
  id: string;
}): Promise<void> {
  await db.meeting.delete({ where: { id: dbEvent.id } });
}

async function processEvent(
  user: MinimalUser,
  event: GoogleEvent
): Promise<void> {
  // Extract meeting URL from Google event (prioritize hangout link, then conference entry point)
  const meetingUrl =
    event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri;

  // Early exit: skip events without a meeting URL or start time
  // (can't join or schedule a meeting without these)
  if (!meetingUrl || !event.start?.dateTime) return;

  // Prepare meeting data from Google Calendar event
  // Note: botScheduled and meetingEnded are NOT included here - they're set explicitly below
  const eventData = {
    calendarEventId: event.id,
    userId: user.id,
    title: event.summary || "Untitled Meeting",
    description: event.description || null,
    meetingUrl,
    startTime: new Date(event.start.dateTime),
    endTime: new Date(event.end?.dateTime || event.start.dateTime),
    attendees: (event.attendees
      ? event.attendees.map((a) => a.email)
      : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
    isFromCalendar: true,
  } as const;

  try {
    // Check if this meeting already exists in our database
    const existingMeeting = await db.meeting.findUnique({
      where: { calendarEventId: event.id },
    });

    if (existingMeeting) {
      // UPDATE CASE: Meeting exists, sync changes from Google Calendar
      // IMPORTANT: Never touch botScheduled during sync - user controls this via UI toggle
      // This preserves user preferences even if Google Calendar event changes
      const updateData: Prisma.MeetingUpdateInput = {
        title: eventData.title || undefined,
        description: eventData.description || undefined,
        meetingUrl: eventData.meetingUrl || undefined,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        attendees: eventData.attendees as unknown as Prisma.InputJsonValue,
      };

      await db.meeting.update({
        where: { calendarEventId: event.id },
        data: updateData,
      });
    } else {
      // CREATE CASE: New meeting from Google Calendar
      // Starts with botScheduled: false (users manually enable via UI toggle)
      // meetingEnded: false (webhook will update this when meeting finishes)
      await db.meeting.create({
        data: {
          calendarEventId: eventData.calendarEventId,
          title: eventData.title,
          description: eventData.description,
          meetingUrl: eventData.meetingUrl,
          startTime: eventData.startTime,
          endTime: eventData.endTime,
          attendees: eventData.attendees as unknown as Prisma.InputJsonValue,
          isFromCalendar: true,
          botScheduled: false,
          meetingEnded: false,
          user: { connect: { id: eventData.userId } },
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error for ${event.id}:`, message);
  }
}

// On-demand function to send bot for a specific meeting (called when user clicks "Send Bot")
export async function sendBotForMeeting(
  meetingId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const meeting = await db.meeting.findUnique({
      where: { id: meetingId },
      include: { user: true },
    });

    if (!meeting) {
      return { success: false, error: "Meeting not found" };
    }

    if (meeting.botSent) {
      return { success: false, error: "Bot already sent for this meeting" };
    }

    if (!meeting.meetingUrl) {
      return { success: false, error: "Meeting URL not available" };
    }

    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    if (new Date(meeting.startTime) > tenMinutesFromNow) {
      return {
        success: false,
        error: "Bot can only be sent within 10 minutes before meeting",
      };
    }

    const canSchedule = await canUserScheduleMeeting(
      meeting.user as MinimalUser
    );
    if (!canSchedule.allowed) {
      return {
        success: false,
        error: canSchedule.reason || "User limit reached",
      };
    }

    const requestBody: Record<string, unknown> & { bot_image?: string } = {
      meeting_url: meeting.meetingUrl,
      bot_name: meeting.user.botName || "Meeting Bot",
      reserved: false,
      transcription_enabled: true,
      transcription_config: {
        provider: "gladia",
      },
      recording_mode: "speaker_view",
      speech_to_text: { provider: "Default" },
      webhook_url: process.env.WEBHOOK_URL,
      extra: { meeting_id: meeting.id, user_id: meeting.userId },
    };

    if (meeting.user.botImageUrl) {
      requestBody.bot_image = meeting.user.botImageUrl;
    }

    const response = await fetch("https://api.meetingbaas.com/v2/bots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-meeting-baas-api-key": process.env.MEETING_BAAS_API_KEY as string,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Failed to send bot: ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      success?: boolean;
      data?: { bot_id?: string };
    };

    // Extract bot_id from nested response structure
    const botId = data.data?.bot_id;

    if (!botId) {
      console.error(
        `⚠️ WARNING: MeetingBaaS API did not return bot_id. Response:`,
        data
      );
      // Still mark as sent but log the issue
    }

    await db.meeting.update({
      where: { id: meeting.id },
      data: {
        botSent: true,
        botId: botId || null,
        botJoinedAt: new Date(),
      },
    });

    await incrementMeetingUsage(meeting.userId);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

async function canUserScheduleMeeting(
  user: MinimalUser
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const PLAN_LIMITS: Record<string, { meetings: number }> = {
      free: { meetings: 0 },
      starter: { meetings: 10 },
      pro: { meetings: 30 },
      premium: { meetings: -1 },
    };
    const limits = PLAN_LIMITS[user.currentPlan] || PLAN_LIMITS.free;
    if (user.currentPlan === "free" || user.subscriptionStatus !== "active") {
      return {
        allowed: false,
        reason: `${user.currentPlan === "free" ? "Free plan" : "Inactive subscription"} - upgrade required`,
      };
    }
    if (limits.meetings !== -1 && user.meetingsThisMonth >= limits.meetings) {
      return {
        allowed: false,
        reason: `Monthly limit reached (${user.meetingsThisMonth}/${limits.meetings})`,
      };
    }
    return { allowed: true };
  } catch (error) {
    console.error("error checking meeting limits:", error);
    return { allowed: false, reason: "Error checking limits" };
  }
}

async function incrementMeetingUsage(userId: string): Promise<void> {
  try {
    await db.user.update({
      where: { id: userId },
      data: { meetingsThisMonth: { increment: 1 } },
    });
  } catch (error) {
    console.error("error incrementing meeting usage:", error);
  }
}

async function scheduleBotsForUpcomingMeetings() {
  const now = new Date();
  console.log(now);
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  const upcomingMeetings = await db.meeting.findMany({
    where: {
      startTime: { gte: now, lte: fiveMinutesFromNow },
      botScheduled: true,
      botSent: false,
      meetingUrl: { not: null },
    },
    include: { user: true },
  });

  for (const meeting of upcomingMeetings as unknown as MeetingWithUser[]) {
    try {
      const canSchedule = await canUserScheduleMeeting(meeting.user);
      if (!canSchedule.allowed) {
        await db.meeting.update({
          where: { id: meeting.id },
          data: { botSent: true, botJoinedAt: new Date() },
        });
        continue;
      }

      const requestBody: Record<string, unknown> & { bot_image?: string } = {
        meeting_url: meeting.meetingUrl,
        bot_name: meeting.user.botName || "Meeting Bot",
        reserved: false,
        recording_mode: "speaker_view",
        speech_to_text: { provider: "Default" },
        webhook_url: process.env.WEBHOOK_URL,
        extra: { meeting_id: meeting.id, user_id: meeting.userId },
      };
      if (meeting.user.botImageUrl) {
        requestBody.bot_image = meeting.user.botImageUrl || undefined;
      }

      const response = await fetch("https://api.meetingbaas.com/v2/bots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-meeting-baas-api-key": process.env.MEETING_BAAS_API_KEY as string,
        },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok)
        throw new Error(`meeting baas api req failed: ${response.status}`);

      const data = (await response.json()) as { bot_id?: string };
      await db.meeting.update({
        where: { id: meeting.id },
        data: {
          botSent: true,
          botId: data.bot_id || null,
          botJoinedAt: new Date(),
        },
      });
      await incrementMeetingUsage(meeting.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`bot failed for ${meeting.title}: `, message);
    }
  }
}
