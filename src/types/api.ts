export type FeedItem = {
  id: string;
  title: string;
  source: string;
  image_url: string | null;
  published_at: string; // ISO
  bullets: string[]; // length 5
  why_it_matters: string;
  url: string; // original article
};

export type FeedResponse = {
  items: FeedItem[];
  next_cursor: number | null; // pass this as ?cursor=... for the next page
};
