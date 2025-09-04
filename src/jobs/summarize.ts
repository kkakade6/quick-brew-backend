import pLimit from "p-limit";
import { supabaseService } from "../lib/db";
import { groq } from "../lib/groq";
import { extract } from "@extractus/article-extractor";
import { SummarySchema, buildSystemPrompt, buildUserPrompt } from "./prompt";

/**
 * Behavior:
 * 1) Ingest latest articles from GNews (small batch per category)
 * 2) Find recently published articles without a summary
 * 3) Summarize with Groq (strict JSON)
 * 4) Insert into `summary`
 *
 * Notes:
 * - No process.exit() inside runSummarizer() so cron worker stays alive
 * - CLI runner at bottom handles exit codes for `npm run summarize:once`
 */

const BATCH_SIZE = 12; // how many to summarize per run
const PARALLEL = 3; // summarize concurrently
const MODEL = "llama-3.1-8b-instant";

type ArticleRow = {
  id: string;
  title: string;
  url: string;
  lede: string | null;
  source_name: string;
  image_url?: string | null;
  published_at: string;
  category_id: number | null;
  summary?: { id: string }[] | null;
};

type CategoryMap = Map<string, number>; // slug -> id

/** Load category slug -> id map (if your schema has a category table). */
async function loadCategoryMap(): Promise<CategoryMap> {
  try {
    const { data, error } = await supabaseService
      .from("category")
      .select("id, slug");

    if (error || !data) return new Map();
    const m = new Map<string, number>();
    for (const row of data) {
      if (row?.slug && row?.id) m.set(String(row.slug), Number(row.id));
    }
    return m;
  } catch {
    return new Map();
  }
}

/** Ingest a handful of the latest GNews items across your 6 categories. */
async function ingestLatestFromGNews(): Promise<number> {
  const API = process.env.GNEWS_API_KEY;
  if (!API) {
    console.warn("[ingest] GNEWS_API_KEY missing — skipping ingestion");
    return 0;
  }

  // Your 6 categories (adjust queries freely)
  const categories: Array<{ slug: string; query: string }> = [
    { slug: "business", query: "business" },
    { slug: "finance", query: "finance OR investing OR stocks" },
    { slug: "markets", query: "markets OR stocks OR bonds OR commodities" },
    { slug: "startups", query: "startup OR venture capital" },
    { slug: "tech", query: "technology" },
    { slug: "politics", query: "politics" },
  ];

  const catMap = await loadCategoryMap();

  let totalInserted = 0;

  for (const c of categories) {
    const u = new URL("https://gnews.io/api/v4/search");
    u.searchParams.set("q", c.query);
    u.searchParams.set("lang", "en");
    u.searchParams.set("max", "20"); // pull a small batch per run
    u.searchParams.set("sortby", "publishedAt");
    u.searchParams.set("apikey", API);

    try {
      // Node 18+ has global fetch; avoid TS DOM types with any cast
      const resp: any = await (globalThis as any).fetch(u.toString());
      if (!resp?.ok) {
        console.warn("[ingest] GNews error", c.slug, resp?.status);
        continue;
      }
      const json: any = await resp.json();
      const items: any[] = Array.isArray(json?.articles) ? json.articles : [];

      if (items.length === 0) {
        console.log(`[ingest] ${c.slug}: 0 articles`);
        continue;
      }

      // Prepare rows shaped like your `article` table
      const candidateRows: Partial<ArticleRow>[] = items
        .map((a) => ({
          title: String(a?.title || "Untitled").slice(0, 280),
          url: String(a?.url || ""),
          lede: a?.description ? String(a.description) : null,
          source_name: a?.source?.name ? String(a.source.name) : "Unknown",
          image_url: a?.image ? String(a.image) : null,
          published_at: a?.publishedAt
            ? String(a.publishedAt)
            : new Date().toISOString(),
          category_id: catMap.get(c.slug) ?? null,
        }))
        .filter((r) => r.url && r.title);

      if (candidateRows.length === 0) continue;

      // Deduplicate: check which URLs already exist, insert only new
      const urls = candidateRows.map((r) => r.url!) as string[];
      const { data: existing, error: existErr } = await supabaseService
        .from("article")
        .select("url")
        .in("url", urls);

      if (existErr) {
        console.warn(
          "[ingest] could not check existing URLs:",
          existErr.message
        );
      }

      const existingSet = new Set((existing || []).map((r) => String(r.url)));
      const newRows = candidateRows.filter((r) => !existingSet.has(r.url!));

      if (newRows.length === 0) {
        console.log(`[ingest] ${c.slug}: all ${candidateRows.length} existed`);
        continue;
      }

      const { data: inserted, error: insErr } = await supabaseService
        .from("article")
        .insert(newRows)
        .select("id");

      if (insErr) {
        console.warn("[ingest] insert error", c.slug, insErr.message);
        continue;
      }

      const count = inserted?.length || 0;
      totalInserted += count;
      console.log(`[ingest] ${c.slug}: inserted ${count} new`);
    } catch (e: any) {
      console.warn("[ingest] fetch failed", c.slug, e?.message || e);
    }
  }

  console.log(`[ingest] total new rows this run: ${totalInserted}`);
  return totalInserted;
}

/** Load unsummarized recent articles (limit BATCH_SIZE). */
async function loadWork(): Promise<ArticleRow[]> {
  const { data, error } = await supabaseService
    .from("article")
    .select(
      "id,title,url,lede,source_name,image_url,published_at,category_id,summary(id)"
    )
    .order("published_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const unsummed = (data || []).filter(
    (a) => !a.summary || a.summary.length === 0
  );
  return unsummed.slice(0, BATCH_SIZE);
}

/** Extract best long-form text to summarize (lede → article extraction → fallback). */
async function getContextText(url: string, lede?: string | null) {
  if (lede && lede.trim().length >= 100) return lede.trim();

  try {
    const art = await extract(url); // { content?, ... }
    const text = (art?.content || "").trim();
    if (text.length > 0) return text.slice(0, 8000);
  } catch {
    // ignore extractor failures; fallback below
  }

  return (lede?.trim() || "").slice(0, 1000);
}

/** Call Groq in JSON mode and validate via Zod schema. */
async function summarizeOnce(input: {
  title: string;
  source: string;
  publishedAtISO: string;
  text: string;
}) {
  const messages = [
    { role: "system" as const, content: buildSystemPrompt() },
    { role: "user" as const, content: buildUserPrompt(input) },
  ];

  const resp = await groq.chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    max_tokens: 600,
    response_format: { type: "json_object" },
    messages,
  });

  const raw = resp.choices?.[0]?.message?.content || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model did not return valid JSON");
  }
  const data = SummarySchema.parse(parsed);
  data.bullets = data.bullets.map((b) => b.trim().slice(0, 180));
  data.why_it_matters = data.why_it_matters.trim().slice(0, 280);
  return data;
}

/** Persist a summary row. */
async function saveSummary(
  articleId: string,
  payload: { bullets: string[]; why_it_matters: string }
) {
  const { error } = await supabaseService.from("summary").insert({
    article_id: articleId,
    bullets: payload.bullets,
    why_it_matters: payload.why_it_matters,
    model_version: MODEL,
    quality_score: 0.0,
  });
  if (error) throw error;
}

/** Work a single article. */
async function workOne(a: ArticleRow) {
  const text = await getContextText(a.url, a.lede ?? undefined);
  const summary = await summarizeOnce({
    title: a.title,
    source: a.source_name,
    publishedAtISO: a.published_at,
    text: text || a.title,
  });
  await saveSummary(a.id, summary);
  console.log(`[summarize] OK ${a.id} (${a.source_name})`);
}

/**
 * Exported function for cron + manual runs:
 * - Ingest fresh articles
 * - Summarize unsummarized
 * - Return counters (no process.exit here)
 */
export async function runSummarizer(): Promise<{
  picked: number;
  ok: number;
  fail: number;
}> {
  await ingestLatestFromGNews();

  const batch = await loadWork();
  const picked = batch.length;

  if (picked === 0) {
    console.log("[summarize] nothing to do");
    return { picked, ok: 0, fail: 0 };
  }

  console.log(`[summarize] picked ${picked} articles`);

  const limit = pLimit(PARALLEL);
  let ok = 0,
    fail = 0;

  await Promise.all(
    batch.map((a) =>
      limit(async () => {
        try {
          await workOne(a);
          ok++;
        } catch (e: any) {
          fail++;
          console.warn("[summarize] FAIL", a.url, e?.message || e);
        }
      })
    )
  );

  console.log(`[summarize] done — ok=${ok}, fail=${fail}`);
  return { picked, ok, fail };
}

/** CLI runner for `npm run summarize:once` */
if (require.main === module) {
  runSummarizer()
    .then(({ picked, ok, fail }) => {
      console.log(
        `[summarize] finished — picked=${picked}, ok=${ok}, fail=${fail}`
      );
      process.exit(fail > 0 ? 1 : 0);
    })
    .catch((e) => {
      console.error("[summarize] FATAL", e?.message || e);
      process.exit(1);
    });
}
