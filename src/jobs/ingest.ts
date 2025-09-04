import pLimit from "p-limit";
import { supabaseService } from "../lib/db";
import { fetchGNewsPage, normalize, getQueryForSlug } from "./gnews";
import { GNEWS } from "./config";

/** Get all categories from DB (slug -> id) */
async function getCategoryMap() {
  const { data, error } = await supabaseService
    .from("category")
    .select("id, slug");
  if (error) throw error;
  const map = new Map<string, number>();
  (data || []).forEach((r) => map.set(r.slug, r.id));
  return map;
}

/** Find the newest published_at we already have per category */
async function getLatestTimestampByCategory(categoryId: number) {
  const { data, error } = await supabaseService
    .from("article")
    .select("published_at")
    .eq("category_id", categoryId)
    .order("published_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.published_at as string | undefined;
}

/** Insert (or skip) articles by unique URL */
async function upsertArticles(rows: any[]) {
  if (rows.length === 0) return { inserted: 0, errored: 0 };
  const { data, error } = await supabaseService
    .from("article")
    .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
    .select("id");
  if (error) throw error;
  return { inserted: data?.length || 0, errored: 0 };
}

async function ingestOneCategory(slug: string, categoryId: number) {
  console.log(`\n[ingest] ${slug} — start`);
  const query = getQueryForSlug(slug);
  const fromISO = await getLatestTimestampByCategory(categoryId);

  let page = 1;
  let totalFetched = 0;
  let totalInserted = 0;

  while (page <= GNEWS.maxPages) {
    const res = await fetchGNewsPage(query, page, fromISO);
    const items = res.articles || [];
    if (items.length === 0) break;

    // Normalize & attach category
    const rows = items.map((a) => {
      const base = normalize(a);
      return {
        ...base,
        category_id: categoryId,
      };
    });

    // Insert (dedupe via unique url)
    const { inserted } = await upsertArticles(rows);
    totalFetched += items.length;
    totalInserted += inserted;
    console.log(
      `[ingest] ${slug} page ${page}: fetched=${items.length}, inserted=${inserted}`
    );

    // Stop early if we didn’t get a full page
    if (items.length < GNEWS.maxPerPage) break;
    page += 1;
  }

  console.log(
    `[ingest] ${slug} — done. fetched=${totalFetched}, inserted=${totalInserted}`
  );
  return { fetched: totalFetched, inserted: totalInserted };
}

async function main() {
  try {
    const catMap = await getCategoryMap();
    const slugs = [
      "business",
      "finance",
      "markets",
      "startups",
      "tech",
      "politics",
    ];
    const limit = pLimit(2); // run 2 categories in parallel for safety

    const results = await Promise.all(
      slugs.map((slug) =>
        limit(async () => {
          const id = catMap.get(slug);
          if (!id) throw new Error(`Category not found in DB: ${slug}`);
          return ingestOneCategory(slug, id);
        })
      )
    );

    const total = results.reduce(
      (acc, r) => ({
        fetched: acc.fetched + r.fetched,
        inserted: acc.inserted + r.inserted,
      }),
      { fetched: 0, inserted: 0 }
    );
    console.log(
      `\n[ingest] ALL DONE — fetched=${total.fetched}, inserted=${total.inserted}`
    );
    process.exit(0);
  } catch (e: any) {
    console.error("[ingest] FAILED:", e.message);
    process.exit(1);
  }
}

main();
