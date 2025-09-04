export type GNewsArticle = {
  title: string;
  description?: string | null;
  content?: string | null;
  url: string;
  image?: string | null;
  publishedAt: string; // ISO
  source: { name: string; url?: string | null };
};

export type GNewsResponse = {
  totalArticles: number;
  articles: GNewsArticle[];
};
