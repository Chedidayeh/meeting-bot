import { inngest } from "@/lib/inngest";
import { prisma } from "@/lib/db";

export const resetDailyChat = inngest.createFunction(
  { id: "reset-daily-chat" },
  { cron: "0 0 * * *" }, // midnight UTC daily
  async () => {
    const result = await prisma.user.updateMany({
      where: { subscriptionStatus: "active" },
      data: { chatMessagesToday: 0 },
    });

    return { usersReset: result.count };
  }
);


