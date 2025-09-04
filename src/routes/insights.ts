import { Router, Request, Response } from "express";
import { supabaseService } from "../lib/db";

export const insightsRouter = Router();

const DAY = 24 * 60 * 60 * 1000;

// Helper: fetch all categories
async function getCategories() {
  const { data, error } = await supabaseService
    .from("category")
    .select("id, slug, name")
    .order("id");
  if (error) throw error;
  return data || [];
}

insightsRouter.get("/categories", async (_req: Request, res: Response) => {
  try {
    const cats = await getCategories();
    const results: any[] = [];

    for (const c of cats) {
      // count cached items
      const cache = await supabaseService
        .from("feed_cache")
        .select("rank", { head: true, count: "exact" })
        .eq("category_id", c.id);

      // count recent unsummarized (last 3 days)
      const since = new Date(Date.now() - 3 * DAY).toISOString();
      const recent = await supabaseService
        .from("article")
        .select("id, summary(id)")
        .eq("category_id", c.id)
        .gte("published_at", since)
        .limit(400);
      if (recent.error) throw recent.error;
      const unsummarized = (recent.data || []).filter(
        (r: any) => !r.summary || r.summary.length === 0
      ).length;

      // newest article time (just for sanity)
      const newest = await supabaseService
        .from("article")
        .select("published_at")
        .eq("category_id", c.id)
        .order("published_at", { ascending: false })
        .limit(1);
      if (newest.error) throw newest.error;

      results.push({
        category: c.slug,
        cache_count: cache.count ?? 0,
        backlog_unsummarized_recent: unsummarized,
        newest_published_at: newest.data?.[0]?.published_at ?? null,
      });
    }

    res.json({ ok: true, categories: results });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
