import { z } from "zod";

export const SummarySchema = z.object({
  bullets: z.array(z.string().min(3)).length(5), // 5 bullets, each non-empty
  why_it_matters: z.string().min(10).max(300),
});

export type SummaryJSON = z.infer<typeof SummarySchema>;

export function buildSystemPrompt() {
  return [
    "You are a precise news summarizer.",
    "Return STRICT JSON only — no preface, no markdown.",
    "Rules:",
    "- Be extractive: do NOT invent facts beyond the provided text.",
    "- Use short, information-dense sentences.",
    "- Neutral tone; no sensational words.",
    "- If key info is missing, say so explicitly.",
    "- Output must match schema exactly.",
  ].join("\n");
}

export function buildUserPrompt(input: {
  title: string;
  source: string;
  publishedAtISO: string;
  text: string; // lede or extracted article text
}) {
  const header = `Title: ${input.title}\nSource: ${input.source}\nPublished at: ${input.publishedAtISO}`;
  const body = `Article text/snippet:\n${input.text}`;
  const schema = `Schema:
{
  "bullets": [ "string", "string", "string", "string", "string" ],
  "why_it_matters": "string"
}`;
  const instructions = [
    "Produce exactly 5 bullets that capture the key facts.",
    "Add a concise 'why it matters' line that explains impact/context.",
    "No URLs, no emojis, no markdown.",
    "Return ONLY valid JSON per schema.",
  ].join("\n");
  return [header, "", body, "", instructions, "", schema].join("\n");
}
