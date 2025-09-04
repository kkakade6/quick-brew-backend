import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { runSummarizer } from "../../../src/jobs/summarize.ts";

serve(async () => {
  try {
    await runSummarizer();
    return new Response("✅ Summarizer ran OK", { status: 200 });
  } catch (e) {
    console.error("❌ Summarizer error:", e);
    return new Response("Error: " + e, { status: 500 });
  }
});
