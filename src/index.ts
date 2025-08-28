import express from "express";
import { ENV } from "./lib/env";

const app = express();
const port = 4000;

app.get("/", (_req, res) => {
  res.send("Quick Brew server is running! ✅");
});

app.listen(port, () => {
  console.log("Quick Brew dev server on http://localhost:" + port);
  // Just to confirm envs are loaded (don’t print real secrets!)
  console.log("ENVs loaded:", {
    hasSupabaseUrl: !!ENV.SUPABASE_URL,
    hasAnonKey: !!ENV.SUPABASE_ANON_KEY,
    hasServiceRole: !!ENV.SUPABASE_SERVICE_ROLE,
    hasGnewsKey: !!ENV.GNEWS_API_KEY,
    hasGroqKey: !!ENV.GROQ_API_KEY,
  });
});
