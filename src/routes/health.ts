import { Router, Request, Response } from "express";
import { supabaseService } from "../lib/db";

export const healthRouter = Router();

// 1) Liveness
healthRouter.get("/live", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "quick-brew", status: "alive" });
});

// 2) DB connectivity quick check
healthRouter.get("/db", async (_req: Request, res: Response) => {
  try {
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

// 3) Basic stats: counts you care about
healthRouter.get("/stats", async (_req: Request, res: Response) => {
  try {
    // total articles
    const a = await supabaseService
      .from("article")
      .select("id", { head: true, count: "exact" });
    // total summaries
    const s = await supabaseService
      .from("summary")
      .select("id", { head: true, count: "exact" });
    // cached items
    const c = await supabaseService
      .from("feed_cache")
      .select("category_id", { head: true, count: "exact" });

    res.json({
      ok: true,
      totals: {
        articles: a.count ?? 0,
        summaries: s.count ?? 0,
        cached_items: c.count ?? 0,
      },
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
