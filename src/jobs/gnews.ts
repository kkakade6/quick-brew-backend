import axios from "axios";
import { ENV } from "../lib/env";
import { GNEWS, CATEGORY_QUERIES } from "./config";
import type { GNewsResponse, GNewsArticle } from "../types/gnews";

const BASE = "https://gnews.io/api/v4/search";

/** Build a URL for the Search endpoint with safe params */
function buildUrl(query: string, page: number, fromISO?: string) {
  const params = new URLSearchParams({
    q: query,
    apikey: ENV.GNEWS_API_KEY,
    max: String(GNEWS.maxPerPage),
    sortby: "publishedAt",
    page: String(page),
  });
  if (GNEWS.lang) params.set("lang", GNEWS.lang);
  if (GNEWS.country) params.set("country", GNEWS.country);
  if (fromISO) params.set("from", fromISO);
  return `${BASE}?${params.toString()}`;
}

/** Fetch one page of results */
export async function fetchGNewsPage(
  query: string,
  page: number,
  fromISO?: string
): Promise<GNewsResponse> {
  const url = buildUrl(query, page, fromISO);
  const { data } = await axios.get<GNewsResponse>(url, { timeout: 15000 });
  return data;
}

/** Simple normalizer: guarantees required fields and trims */
export function normalize(a: GNewsArticle) {
  const u = new URL(a.url);
  const sourceDomain = u.hostname.replace(/^www\./, "");
  // Prefer description, fallback to content, trim to keep tokens low
  const lede = (a.description?.trim() || a.content?.trim() || "").slice(0, 800);
  return {
    url: a.url,
    source_name: a.source?.name || sourceDomain,
    source_domain: sourceDomain,
    title: a.title?.trim() || "(no title)",
    published_at: new Date(a.publishedAt).toISOString(),
    image_url: a.image || null,
    lede,
  };
}

/** Map our 6 slugs to boolean queries */
export function getQueryForSlug(slug: string): string {
  const q = CATEGORY_QUERIES[slug];
  if (!q) throw new Error(`No query configured for slug=${slug}`);
  return q;
}
