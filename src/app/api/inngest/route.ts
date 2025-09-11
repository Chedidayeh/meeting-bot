import { inngest } from "@/lib/inngest";
import { serve } from "inngest/next";
import { resetDailyChat } from "@/inngest/tasks/resetDailyChat";
import { syncAndSchedule } from "@/inngest/tasks/syncAndSchedule";

// Create an API that serves zero functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    /* your functions will be passed here later! */
    resetDailyChat,
    syncAndSchedule,
  ],
});