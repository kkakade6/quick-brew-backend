import express from "express";
import { ENV } from "./lib/env";
import { supabaseService } from "./lib/db"; // move import up
import { feedRouter } from "./routes/feed";
import { healthRouter } from "./routes/health";
import { insightsRouter } from "./routes/insights";
import { adminRouter } from "./routes/admin";
import pinoHttp from "pino-http";
import { logger } from "./lib/logger";
import { storyRouter } from "./routes/story";

const app = express();
const port = 4000;
const host = "0.0.0.0";
app.get("/", (_req, res) => {
  res.send("Quick Brew server is running! ✅");
});

app.use("/v1", feedRouter);
app.use("/insights", insightsRouter);
app.use("/health", healthRouter);
app.use("/admin", adminRouter);
app.use(pinoHttp({ logger }));
app.use("/v1", storyRouter);

app.get("/health/articles-count", async (_req, res) => {
  const { data, error } = await supabaseService
    .from("article")
    .select("id", { count: "exact", head: true });
  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, count: data?.length ?? 0 });
});

app.get("/health/db", async (_req, res) => {
  try {
    console.log("GET /health/db"); // so you see a log when it’s hit
    const { data, error } = await supabaseService
      .from("category")
      .select("id, slug")
      .limit(1);
    if (error) throw error;
    res.json({ ok: true, sample: data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "UNHANDLED_REJECTION");
});
process.on("uncaughtException", (err) => {
  logger.error({ err }, "UNCAUGHT_EXCEPTION");
  // optional: process.exit(1);
});

app.listen(port, () => {
  console.log("Quick Brew dev server on http://localhost:" + port);
  console.log("ENVs loaded:", {
    hasSupabaseUrl: !!ENV.SUPABASE_URL,
    hasAnonKey: !!ENV.SUPABASE_ANON_KEY,
    hasServiceRole: !!ENV.SUPABASE_SERVICE_ROLE,
    hasGnewsKey: !!ENV.GNEWS_API_KEY,
    hasGroqKey: !!ENV.GROQ_API_KEY,
  });
});
