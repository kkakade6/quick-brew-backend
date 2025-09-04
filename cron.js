// cron.js (CommonJS)

require("ts-node").register({ transpileOnly: true }); // allow requiring .ts in production

const cron = require("node-cron");
const { runSummarizer } = require("./src/jobs/summarize"); // <- summarize.ts must export runSummarizer()

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

// keep process alive so Railway doesn't stop the container
setInterval(() => {
  console.log("⏳ Worker alive, waiting for next run...");
}, 1000 * 60 * 5);
