import { supabaseService } from "./db";

const cache = new Map<string, number>();

export async function getCategoryIdBySlug(
  slug: string
): Promise<number | null> {
  if (cache.has(slug)) return cache.get(slug)!;
  const { data, error } = await supabaseService
    .from("category")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  cache.set(slug, data.id);
  return data.id;
}
