import * as dotenv from "dotenv";
dotenv.config();

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

/** We’ll add more as we go. For now we just load and check presence. */
export const ENV = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  SUPABASE_URL: process.env.SUPABASE_URL ?? "",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
  SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE ?? "",
  GNEWS_API_KEY: process.env.GNEWS_API_KEY ?? "",
  GROQ_API_KEY: process.env.GROQ_API_KEY ?? "",
};
