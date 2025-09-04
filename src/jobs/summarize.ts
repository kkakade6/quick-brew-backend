import pLimit from "p-limit";
import { supabaseService } from "../lib/db";
import { groq } from "../lib/groq";
import { extract } from "@extractus/article-extractor";
import { SummarySchema, buildSystemPrompt, buildUserPrompt } from "./prompt";
export async function runSummarizer() {
  // How many articles per run (keep small at first)
  const BATCH_SIZE = 12;
  const PARALLEL = 3;
  const MODEL = "llama-3.1-8b-instant"; // Groq model id :contentReference[oaicite:4]{index=4}

  type ArticleRow = {
    id: string;
    title: string;
    url: string;
    lede: string | null;
    source_name: string;
    published_at: string;
    category_id: number;
    // `summary` will be null/[] depending on select; we filter in code
    summary?: { id: string }[] | null;
  };

  // 1) Load recent unsummarized articles
  async function loadWork(): Promise<ArticleRow[]> {
    const { data, error } = await supabaseService
      .from("article")
      .select(
        "id,title,url,lede,source_name,published_at,category_id,summary(id)"
      )
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    // Keep only items without a summary
    const unsummed = (data || []).filter(
      (a) => !a.summary || a.summary.length === 0
    );
    return unsummed.slice(0, BATCH_SIZE);
  }

  // 2) Get best available text (lede → article extraction → title)
  // 2) Get best available text (lede → article extraction → title)
  async function getContextText(url: string, lede?: string | null) {
    // If we already have a decent lede, use it
    if (lede && lede.trim().length >= 100) return lede.trim();

    try {
      // The extractor returns { title?, content?, ... }
      // We call it with just the URL to avoid TS type issues.
      const art = await extract(url);
      const text = (art?.content || "").trim();
      if (text.length > 0) {
        // keep it reasonable for token budget
        return text.slice(0, 8000);
      }
    } catch {
      // ignore extraction errors; we'll fall back
    }

    // fallback: trimmed lede or empty
    return (lede?.trim() || "").slice(0, 1000);
  }

  // 3) Call Groq with strict JSON response
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
      response_format: { type: "json_object" }, // JSON mode :contentReference[oaicite:5]{index=5}
      messages,
    });

    const raw = resp.choices?.[0]?.message?.content || "{}";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new Error("Model did not return valid JSON");
    }
    const data = SummarySchema.parse(parsed);
    // Trim bullets to ~180 chars each to stay crisp
    data.bullets = data.bullets.map((b) => b.trim().slice(0, 180));
    data.why_it_matters = data.why_it_matters.trim().slice(0, 280);
    return data;
  }

  // 4) Save summary to DB
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

  async function main() {
    try {
      const batch = await loadWork();
      if (batch.length === 0) {
        console.log("[summarize] nothing to do");
        process.exit(0);
        return;
      }
      console.log(`[summarize] picked ${batch.length} articles`);
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
              console.warn("[summarize] FAIL", a.url, e.message);
            }
          })
        )
      );

      console.log(`[summarize] done — ok=${ok}, fail=${fail}`);
      process.exit(fail > 0 ? 1 : 0);
    } catch (e: any) {
      console.error("[summarize] FATAL", e.message);
      process.exit(1);
    }
  }

  main();
}
