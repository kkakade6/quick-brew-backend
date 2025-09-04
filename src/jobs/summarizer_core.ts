import { supabaseService } from "../lib/db";
import { groq } from "../lib/groq";
import { extract } from "@extractus/article-extractor";
import { z } from "zod";
import { withRetries } from "../lib/rate_limit";

const MODEL = "llama-3.1-8b-instant";
const MAX_OUTPUT_TOKENS = 450;
const MAX_INPUT_CHARS = 6000; // trim article text

export const SummarySchema = z.object({
  bullets: z.array(z.string().min(3)).length(5),
  why_it_matters: z.string().min(10).max(300),
});
export type SummaryJSON = z.infer<typeof SummarySchema>;

function buildSystemPrompt() {
  return [
    "You are a precise news summarizer.",
    "Return STRICT JSON only — no preface, no markdown.",
    "Rules:",
    "- Be extractive; no invented facts.",
    "- Short, information-dense sentences.",
    "- Neutral tone.",
    "- If info is missing, say so.",
    "- Output must match schema exactly.",
  ].join("\n");
}

function buildUserPrompt(input: {
  title: string;
  source: string;
  publishedAtISO: string;
  text: string;
}) {
  const header = `Title: ${input.title}\nSource: ${input.source}\nPublished at: ${input.publishedAtISO}`;
  const body = `Article text/snippet:\n${input.text}`;
  const schema = `Schema:
{
  "bullets": [ "string", "string", "string", "string", "string" ],
  "why_it_matters": "string"
}`;
  const instructions = [
    "Produce exactly 5 bullets that capture key facts.",
    "Add one concise 'why it matters' line (impact/context).",
    "No URLs, emojis, or markdown.",
    "Return ONLY valid JSON per schema.",
  ].join("\n");
  return [header, "", body, "", instructions, "", schema].join("\n");
}

async function getContextText(url: string, lede?: string | null) {
  if (lede && lede.trim().length >= 100) return lede.trim();
  try {
    const art = await extract(url);
    const text = (art?.content || "").trim();
    if (text.length > 0) return text.slice(0, MAX_INPUT_CHARS);
  } catch {}
  return (lede?.trim() || "").slice(0, 1000);
}

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

  const resp = await withRetries(
    () =>
      groq.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_object" },
        messages,
      }),
    { tries: 5, baseDelayMs: 2500 }
  );

  const raw = resp.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  const data = SummarySchema.parse(parsed);
  data.bullets = data.bullets.map((b) => b.trim().slice(0, 180));
  data.why_it_matters = data.why_it_matters.trim().slice(0, 280);
  return data;
}

export type ArticleRow = {
  id: string;
  title: string;
  url: string;
  lede: string | null;
  source_name: string;
  published_at: string;
  category_id: number;
};

export async function summarizeArticleRow(a: ArticleRow) {
  const text = await getContextText(a.url, a.lede ?? undefined);
  const summary = await summarizeOnce({
    title: a.title,
    source: a.source_name,
    publishedAtISO: a.published_at,
    text: text || a.title,
  });
  const { error } = await supabaseService.from("summary").insert({
    article_id: a.id,
    bullets: summary.bullets,
    why_it_matters: summary.why_it_matters,
    model_version: MODEL,
    quality_score: 0.0,
  });
  if (error) throw error;
}
