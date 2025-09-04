import { Router, Request, Response } from "express";
import { supabaseService } from "../lib/db";

export const storyRouter = Router();

/**
 * GET /v1/story/:id
 */
storyRouter.get("/story/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!id) return res.status(400).json({ error: "Missing id" });

    // Fetch article + summary
    const { data, error } = await supabaseService
      .from("article")
      .select(
        `
        id, title, url, source_name, image_url, published_at,
        summary ( bullets, why_it_matters )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Not found" });

    const sum = Array.isArray(data.summary) ? data.summary[0] : data.summary;
    if (!sum) return res.status(404).json({ error: "No summary" });

    // Fetch like_count
    const { count, error: likeError } = await supabaseService
      .from("like")
      .select("id", { count: "exact", head: true })
      .eq("article_id", id);

    if (likeError) throw likeError;

    return res.json({
      id: data.id,
      title: data.title,
      source: data.source_name,
      image_url: data.image_url,
      published_at: data.published_at,
      bullets: sum.bullets,
      why_it_matters: sum.why_it_matters,
      url: data.url,
      like_count: count ?? 0,
      liked: false, // until auth phase
    });
  } catch (e: any) {
    console.error("[/v1/story/:id] ERROR", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * POST /v1/story/:id/like
 * Toggle like/unlike for a dummy user (until auth is added)
 */
storyRouter.post("/story/:id/like", async (req: Request, res: Response) => {
  try {
    const articleId = String(req.params.id);
    const userId = "demo-user"; // dummy user until auth

    // Check if already liked
    const { data: existing, error: findError } = await supabaseService
      .from("like")
      .select("id")
      .eq("article_id", articleId)
      .eq("user_id", userId)
      .maybeSingle();

    if (findError) throw findError;

    let liked: boolean;
    if (existing) {
      // Unlike
      const { error: delError } = await supabaseService
        .from("like")
        .delete()
        .eq("id", existing.id);
      if (delError) throw delError;
      liked = false;
    } else {
      // Like
      const { error: insError } = await supabaseService
        .from("like")
        .insert({ article_id: articleId, user_id: userId });
      if (insError) throw insError;
      liked = true;
    }

    // Get updated like_count
    const { count, error: countError } = await supabaseService
      .from("like")
      .select("id", { count: "exact", head: true })
      .eq("article_id", articleId);

    if (countError) throw countError;

    return res.json({ like_count: count ?? 0, liked });
  } catch (e: any) {
    console.error("[/v1/story/:id/like] ERROR", e.message);
    return res.status(500).json({ error: "Server error" });
  }
});
