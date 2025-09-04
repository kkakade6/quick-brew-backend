import pLimit from "p-limit";
import { supabaseService } from "../lib/db";
import { KEEPER } from "./keeper_config";
import { summarizeArticleRow, ArticleRow } from "./summarizer_core";

/** Get all categories */
async function getCategories() {
  const { data, error } = await supabaseService
    .from("category")
    .select("id, slug");
  if (error) throw error;
  return data || [];
}

/** Summarized articles in category within N days, newest first */
async function getReadyArticles(categoryId: number, days: number) {
  const { data, error } = await supabaseService
    .from("article")
    .select(
      "id,title,url,lede,source_name,published_at,category_id,summary!inner(id)"
    )
    .eq("category_id", categoryId)
    .gte("published_at", new Date(Date.now() - days * 864e5).toISOString())
    .order("published_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  // data contains only rows with a summary (inner join)
  return (data as unknown as ArticleRow[]) || [];
}

/** Unsummarized recent articles (to top-up) */
async function getUnsummarized(categoryId: number, limit: number) {
  const { data, error } = await supabaseService
    .from("article")
    .select(
      "id,title,url,lede,source_name,published_at,category_id,summary(id)"
    )
    .eq("category_id", categoryId)
    .order("published_at", { ascending: false })
    .limit(400);
  if (error) throw error;
  const rows = (data || []).filter(
    (a: any) => !a.summary || a.summary.length === 0
  );
  return (rows as ArticleRow[]).slice(0, limit);
}

/** Rewrite feed_cache for a category with ranked list */
async function writeFeedCache(categoryId: number, articles: ArticleRow[]) {
  // wipe old and insert fresh ranked list
  const del = await supabaseService
    .from("feed_cache")
    .delete()
    .eq("category_id", categoryId);
  if (del.error) throw del.error;

  const rows = articles.slice(0, KEEPER.minReadyPerCategory).map((a, i) => ({
    category_id: categoryId,
    article_id: a.id,
    rank: i + 1,
  }));
  if (rows.length === 0) return;

  const ins = await supabaseService.from("feed_cache").insert(rows);
  if (ins.error) throw ins.error;
}

/** Ensure the category has at least N ready; summarize more if needed; then refresh cache */
async function ensureCategory(categoryId: number, slug: string) {
  console.log(`\n[keeper] ${slug} — start`);

  // Step A: try within primary window
  let ready = await getReadyArticles(categoryId, KEEPER.windowDaysPrimary);

  if (ready.length < KEEPER.minReadyPerCategory) {
    // Need top-up: summarize recent unsummarized
    const deficit = KEEPER.minReadyPerCategory - ready.length;
    const toSummarize = await getUnsummarized(
      categoryId,
      Math.min(KEEPER.maxNewSummariesPerCategory, deficit * 2) // small buffer
    );
    console.log(
      `[keeper] ${slug} — top-up need=${deficit}, will summarize=${toSummarize.length}`
    );

    const limit = pLimit(KEEPER.parallel);
    let ok = 0,
      fail = 0;
    await Promise.all(
      toSummarize.map((a) =>
        limit(async () => {
          try {
            await summarizeArticleRow(a);
            ok++;
          } catch (e: any) {
            fail++;
            console.warn("[keeper] summarize FAIL", a.url, e.message);
          }
        })
      )
    );
    console.log(`[keeper] ${slug} — summarized ok=${ok}, fail=${fail}`);

    // Reload ready after top-up
    ready = await getReadyArticles(categoryId, KEEPER.windowDaysPrimary);
  }

  // Step B: if still short, extend window to fallback days
  if (ready.length < KEEPER.minReadyPerCategory) {
    const fallbackReady = await getReadyArticles(
      categoryId,
      KEEPER.windowDaysFallback
    );
    // Merge keeping order (they are both sorted; fallbackReady is superset)
    ready = fallbackReady;
  }

  // Step C: write cache (rank newest first)
  const finalCount = Math.min(ready.length, KEEPER.minReadyPerCategory);
  console.log(`[keeper] ${slug} — caching ${finalCount} items`);
  await writeFeedCache(categoryId, ready);
  console.log(`[keeper] ${slug} — done`);
}

async function main() {
  try {
    const cats = await getCategories();
    for (const c of cats) {
      await ensureCategory(c.id, c.slug);
    }
    console.log("\n[keeper] ALL DONE");
    process.exit(0);
  } catch (e: any) {
    console.error("[keeper] FATAL", e.message);
    process.exit(1);
  }
}

main();
