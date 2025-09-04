import pLimit from "p-limit";
import { supabaseService } from "../lib/db";
import { groq } from "../lib/groq";
import { extract } from "@extractus/article-extractor";
import { SummarySchema, buildSystemPrompt, buildUserPrompt } from "./prompt";

/**
 * Refactored:
 * - runSummarizer() runs ONE batch and RETURNS stats (no process.exit here)
 * - A small CLI runner at bottom handles process.exit when run via `npm run summarize:once`
 */

const BATCH_SIZE = 12;
const PARALLEL = 3;
const MODEL = "llama-3.1-8b-instant"; // Groq model id

type ArticleRow = {
  id: string;
  title: string;
  url: string;
  lede: string | null;
  source_name: string;
  published_at: string;
  category_id: number;
  summary?: { id: string }[] | null;
};

// 1) Pick recent unsummarized articles
async function loadWork(): Promise<ArticleRow[]> {
  const { data, error } = await supabaseService
    .from("article")
    .select(
      "id,title,url,lede,source_name,published_at,category_id,summary(id)"
    )
    .order("published_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const unsummed = (data || []).filter(
    (a) => !a.summary || a.summary.length === 0
  );
  return unsummed.slice(0, BATCH_SIZE);
}

// 2) Get best available text (lede → article extraction → fallback)
async function getContextText(url: string, lede?: string | null) {
  if (lede && lede.trim().length >= 100) return lede.trim();

  try {
    const art = await extract(url); // returns { title?, content?, ... }
    const text = (art?.content || "").trim();
    if (text.length > 0) return text.slice(0, 8000); // keep token budget sane
  } catch {
    // ignore extraction errors; fallback below
  }

  return (lede?.trim() || "").slice(0, 1000);
}

// 3) Summarize with Groq (strict JSON mode)
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

// 4) Persist to DB
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

async function workOne(a: ArticleRow) {
  const text = await getContextText(a.url, a.lede ?? undefined);
  const summary = await summarizeOnce({
    title: a.title,
    source: a.source_name,
    publishedAtISO: a.published_at,
    text: text || a.title, // absolute fallback
  });
  await saveSummary(a.id, summary);
  console.log(`[summarize] OK ${a.id} (${a.source_name})`);
}

/**
 * Exported function for the cron worker.
 * - Runs one batch
 * - Returns stats
 * - DOES NOT call process.exit()
 */
export async function runSummarizer(): Promise<{
  picked: number;
  ok: number;
  fail: number;
}> {
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

/**
 * CLI runner for local/manual runs:
 * - `npm run summarize:once`
 * This block is ONLY for direct execution, not when imported by cron.js.
 */
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
