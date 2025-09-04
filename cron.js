import cron from "node-cron";
import { runSummarizer } from "./src/jobs/summarize.js";

console.log("🚀 Quick Brew Cron Worker started");

// Run summarizer every 30 minutes
cron.schedule("*/30 * * * *", async () => {
  console.log("⏰ Running summarizer job...");
  try {
    await runSummarizer();
    console.log("✅ Summarizer finished successfully");
  } catch (err) {
    console.error("❌ Summarizer error:", err);
  }
});

// 👇 keep process alive forever
setInterval(() => {
  console.log("⏳ Worker alive, waiting for next run...");
}, 1000 * 60 * 5); // log every 5 minutes
