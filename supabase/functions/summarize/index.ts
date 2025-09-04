import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import express from "express";
import cors from "cors";
import { runSummarizer } from "../../../src/jobs/summarize.ts";
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
// ... your routes, e.g. app.use('/v1', storyRouter);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on port ${PORT}`);
});

serve(async () => {
  try {
    await runSummarizer();
    return new Response("✅ Summarizer ran OK", { status: 200 });
  } catch (e) {
    console.error("❌ Summarizer error:", e);
    return new Response("Error: " + e, { status: 500 });
  }
});
