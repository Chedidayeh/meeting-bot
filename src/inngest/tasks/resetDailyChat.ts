import { db } from "@/db";
import { inngest } from "@/lib/inngest";

export const resetDailyChat = inngest.createFunction(
  { id: "reset-daily-chat" },
  { cron: "0 0 * * *" }, // midnight UTC daily
  async () => {
    const result = await db.user.updateMany({
      where: { subscriptionStatus: "active" },
      data: { chatMessagesToday: 0 },
    });

    return { usersReset: result.count };
  }
);


