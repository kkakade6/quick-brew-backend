import cron from "node-cron";
import { exec } from "child_process";

// tiny helper
function run(script: string) {
  return new Promise<void>((resolve) => {
    const p = exec(
      `npm run ${script}`,
      { env: process.env },
      (err, stdout, stderr) => {
        const ok = !err;
        const stamp = new Date().toISOString();
        console.log(`[${stamp}] ${script} -> ${ok ? "OK" : "FAIL"}`);
        if (!ok) console.warn(stderr || stdout);
        resolve();
      }
    );
  });
}

// Asia/Kolkata friendly schedules (server local time)
console.log("Quick Brew scheduler starting…");

// Ingest: every 10 minutes
cron.schedule("*/10 * * * *", async () => {
  await run("ingest:once");
});

// Summarize: every 5 minutes (keeps catching up)
cron.schedule("*/5 * * * *", async () => {
  await run("summarize:once");
});

// Keeper: every 30 minutes (rebuilds feed_cache to 50)
cron.schedule("*/30 * * * *", async () => {
  await run("keeper:once");
});

// keep process alive
process.stdin.resume();
