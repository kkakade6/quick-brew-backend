import { Router, Request, Response } from "express";
import { supabaseService } from "../lib/db";
import { getCategoryIdBySlug } from "../lib/categories";
import type { FeedItem, FeedResponse } from "../types/api";

export const feedRouter = Router();

/**
 * GET /v1/feed?category=tech&cursor=1&limit=20
 * - cursor: the rank to start from (1-based). Defaults to 1.
 * - limit: number of items to return (default 20, max 50).
 */
feedRouter.get("/feed", async (req: Request, res: Response) => {
  try {
    const slug = String(req.query.category || "")
      .toLowerCase()
      .trim();
    if (!slug) return res.status(400).json({ error: "Missing ?category" });

    const categoryId = await getCategoryIdBySlug(slug);
    if (!categoryId) return res.status(404).json({ error: "Unknown category" });

    const limitParam = parseInt(String(req.query.limit || "20"), 10);
    const limit = Math.min(
      Math.max(isNaN(limitParam) ? 20 : limitParam, 1),
      50
    );

    const cursorParam = parseInt(String(req.query.cursor || "1"), 10);
    const startRank = Math.max(isNaN(cursorParam) ? 1 : cursorParam, 1);
    const endRank = startRank + limit - 1;

    // Query feed_cache window by rank (inclusive)
    // We pull nested article fields + its single summary
    const { data, error } = await supabaseService
      .from("feed_cache")
      .select(
        `
        rank,
        article:article_id (
          id, title, url, source_name, image_url, published_at,
          summary (
            bullets, why_it_matters
          )
        )
      `
      )
      .eq("category_id", categoryId)
      .gte("rank", startRank)
      .lte("rank", endRank)
      .order("rank", { ascending: true });

    if (error) throw error;

    const items: FeedItem[] = (data || [])
      .map((row: any) => {
        const art = row.article;
        const sum = Array.isArray(art?.summary) ? art.summary[0] : art?.summary;
        if (!art || !sum) return null;
        return {
          id: art.id,
          title: art.title,
          source: art.source_name,
          image_url: art.image_url ?? null,
          published_at: art.published_at,
          bullets: sum.bullets ?? [],
          why_it_matters: sum.why_it_matters ?? "",
          url: art.url,
        } as FeedItem;
      })
      .filter(Boolean) as FeedItem[];

    // Compute next_cursor: if we returned 'limit' items, next starts after the last rank
    const returned = items.length;
    const next_cursor = returned === limit ? endRank + 1 : null;

    const payload: FeedResponse = { items, next_cursor };
    return res.json(payload);
  } catch (e: any) {
    console.error("[/v1/feed] ERROR", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});
