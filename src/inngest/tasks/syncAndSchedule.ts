import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { addHours } from "date-fns";

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
    await scheduleBotsForUpcomingMeetings();
    return { ok: true };
  }
);

async function syncAllUserCalendars(): Promise<void> {
  const users = await prisma.user.findMany({
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

async function syncUserCalendar(user: MinimalUser): Promise<void> {
  try {
    let accessToken: string | null = user.googleAccessToken;

    const now = new Date();
    const tokenExpiry = user.googleTokenExpiry ? new Date(user.googleTokenExpiry) : new Date(0);
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    if (tokenExpiry <= tenMinutesFromNow) {
      accessToken = await refreshGoogleToken(user);
      if (!accessToken) return;
    }

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

    if (!response.ok) {
      if (response.status === 401) {
        await prisma.user.update({
          where: { id: user.id },
          data: { calendarConnected: false },
        });
        return;
      }
      throw new Error(`Calendar API failed: ${response.status}`);
    }

    const data = (await response.json()) as { items?: GoogleEvent[] };
    const events: GoogleEvent[] = data.items || [];
    const existingEvents = await prisma.meeting.findMany({
      where: { userId: user.id, isFromCalendar: true, startTime: { gte: now } },
    });

    const googleEventIds = new Set<string>();
    for (const event of events) {
      if (event.status === "cancelled") {
        await handleDeletedEvent(event);
        continue;
      }
      googleEventIds.add(event.id);
      await processEvent(user, event);
    }

    const deletedEvents = existingEvents.filter((dbEvent) => !googleEventIds.has(((dbEvent as unknown as { calendarEventId: string | null }).calendarEventId) || ""));
    if (deletedEvents.length > 0) {
      for (const deletedEvent of deletedEvents) {
        await handleDeletedEventFromDB(deletedEvent);
      }
    }
  } catch (error) {
    const message: string = error instanceof Error ? error.message : String(error);
    console.error(`calendar error for ${user.id}:`, message);
    if (message.includes("401") || message.includes("403")) {
      await prisma.user.update({ where: { id: user.id }, data: { calendarConnected: false } });
    }
  }
}

async function refreshGoogleToken(user: MinimalUser): Promise<string | null> {
  try {
    if (!user.googleRefreshToken) {
      await prisma.user.update({
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
    const tokens = (await response.json()) as { access_token?: string; expires_in: number };

    if (!tokens.access_token) {
      await prisma.user.update({ where: { id: user.id }, data: { calendarConnected: false } });
      return null;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token as string;
  } catch (error) {
    console.error(`token refresh error for ${user.id}: `, error);
    await prisma.user.update({ where: { id: user.id }, data: { calendarConnected: false } });
    return null;
  }
}

async function handleDeletedEvent(event: Pick<GoogleEvent, "id">): Promise<void> {
  try {
    const existingMeeting = await prisma.meeting.findUnique({ where: { calendarEventId: event.id } });
    if (existingMeeting) {
      await prisma.meeting.delete({ where: { calendarEventId: event.id } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("error deleting event:", message);
  }
}

async function handleDeletedEventFromDB(dbEvent: { id: string }): Promise<void> {
  await prisma.meeting.delete({ where: { id: dbEvent.id } });
}

async function processEvent(user: MinimalUser, event: GoogleEvent): Promise<void> {
  const meetingUrl = event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri;
  if (!meetingUrl || !event.start?.dateTime) return;

  const eventData = {
    calendarEventId: event.id,
    userId: user.id,
    title: event.summary || "Untitled Meeting",
    description: event.description || null,
    meetingUrl,
    startTime: new Date(event.start.dateTime),
    endTime: new Date(event.end?.dateTime || event.start.dateTime),
    attendees: (event.attendees ? (event.attendees.map((a) => a.email)) : Prisma.JsonNull) as unknown as Prisma.InputJsonValue,
    isFromCalendar: true,
    botScheduled: true,
  } as const;

  try {
    const existingMeeting = await prisma.meeting.findUnique({ where: { calendarEventId: event.id } });
    if (existingMeeting) {
      const updateDataBase: Prisma.MeetingUpdateInput = {
        title: eventData.title || undefined,
        description: eventData.description || undefined,
        meetingUrl: eventData.meetingUrl || undefined,
        startTime: eventData.startTime,
        endTime: eventData.endTime,
        attendees: eventData.attendees as unknown as Prisma.InputJsonValue,
      };
      const updateData: Prisma.MeetingUpdateInput = !existingMeeting.botSent
        ? { ...updateDataBase, botScheduled: eventData.botScheduled }
        : updateDataBase;
      await prisma.meeting.update({ where: { calendarEventId: event.id }, data: updateData });
    } else {
      await prisma.meeting.create({
        data: {
          calendarEventId: eventData.calendarEventId,
          title: eventData.title,
          description: eventData.description,
          meetingUrl: eventData.meetingUrl,
          startTime: addHours(new Date(eventData.startTime), 1),
          endTime: addHours(new Date(eventData.endTime), 1),
          attendees: eventData.attendees as unknown as Prisma.InputJsonValue,
          isFromCalendar: true,
          botScheduled: true,
          user: { connect: { id: eventData.userId } },
        },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error for ${event.id}:`, message);
  }
}

async function scheduleBotsForUpcomingMeetings() {
  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  const upcomingMeetings = await prisma.meeting.findMany({
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
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { botSent: true, botJoinedAt: new Date() },
        });
        continue;
      }

      const requestBody: Record<string, unknown> & { bot_image?: string } = {
        meeting_url: meeting.meetingUrl,
        bot_name: meeting.user.botName || "AI Noteetaker",
        reserved: false,
        recording_mode: "speaker_view",
        speech_to_text: { provider: "Default" },
        webhook_url: process.env.WEBHOOK_URL,
        extra: { meeting_id: meeting.id, user_id: meeting.userId },
      };
      if (meeting.user.botImageUrl) {
        requestBody.bot_image = meeting.user.botImageUrl || undefined;
      }

      const response = await fetch("https://api.meetingbaas.com/bots", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-meeting-baas-api-key": process.env.MEETING_BAAS_API_KEY as string,
        },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) throw new Error(`meeting baas api req failed: ${response.status}`);

      const data = (await response.json()) as { bot_id?: string };
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { botSent: true, botId: data.bot_id || null, botJoinedAt: new Date() },
      });
      await incrementMeetingUsage(meeting.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`bot failed for ${meeting.title}: `, message);
    }
  }
}

async function canUserScheduleMeeting(user: MinimalUser): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const PLAN_LIMITS: Record<string, { meetings: number }> = {
      free: { meetings: 0 },
      starter: { meetings: 10 },
      pro: { meetings: 30 },
      premium: { meetings: -1 },
    };
    const limits = PLAN_LIMITS[user.currentPlan] || PLAN_LIMITS.free;
    if (user.currentPlan === "free" || user.subscriptionStatus !== "active") {
      return { allowed: false, reason: `${user.currentPlan === "free" ? "Free plan" : "Inactive subscription"} - upgrade required` };
    }
    if (limits.meetings !== -1 && user.meetingsThisMonth >= limits.meetings) {
      return { allowed: false, reason: `Monthly limit reached (${user.meetingsThisMonth}/${limits.meetings})` };
    }
    return { allowed: true };
  } catch (error) {
    console.error("error checking meeting limits:", error);
    return { allowed: false, reason: "Error checking limits" };
  }
}

async function incrementMeetingUsage(userId: string): Promise<void> {
  try {
    await prisma.user.update({ where: { id: userId }, data: { meetingsThisMonth: { increment: 1 } } });
  } catch (error) {
    console.error("error incrementing meeting usage:", error);
  }
}


