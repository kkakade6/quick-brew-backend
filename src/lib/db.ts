// src/lib/db.ts
import { createClient } from "@supabase/supabase-js";
import { ENV } from "./env";

export const supabaseService = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE, // server-only key
  { auth: { persistSession: false } }
);
