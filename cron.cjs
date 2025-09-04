// cron.cjs  (CommonJS worker that runs forever)

const { runSummarizer } = require("./dist/jobs/summarize.js");

console.log("🚀 Quick Brew Cron Worker started (compiled JS)");

async function tick() {
  console.log("⏰ Running summarizer job...");
  try {
    const res = await runSummarizer();
    console.log(
      `✅ Summarizer OK — picked=${res.picked}, ok=${res.ok}, fail=${res.fail}`
    );
  } catch (err) {
    console.error("❌ Summarizer error:", err);
  }
}

// run immediately on boot
tick();

// then every 30 minutes
setInterval(tick, 30 * 60 * 1000);

// keep the process obviously alive with a heartbeat log
setInterval(
  () => console.log("⏳ Worker alive, waiting for next run..."),
  5 * 60 * 1000
);
