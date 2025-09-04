export const GNEWS = {
  // Change these if you want India etc. (supported lists in docs)
  // lang/country are optional; leaving them empty returns mixed results.
  lang: "en", // e.g., "en", "hi"
  country: "us", // e.g., "us", "in"
  maxPerPage: 10, // keep 10 if you're on the free plan
  maxPages: 2, // be gentle with rate limits for now
};

export const CATEGORY_QUERIES: Record<string, string> = {
  // We'll use the Search endpoint with boolean queries
  // Keep these simple; we’ll tune later.
  business: "(business OR corporate OR industry)",
  finance:
    '(finance OR banking OR fintech OR "interest rates" OR "central bank")',
  markets:
    '(markets OR "stock market" OR stocks OR equities OR bonds OR commodities OR forex OR crypto)',
  startups:
    '(startup OR "seed funding" OR "Series A" OR "venture capital" OR VC)',
  tech: '(technology OR tech OR software OR AI OR "artificial intelligence" OR gadgets OR semiconductor)',
  politics:
    "(politics OR government OR election OR policy OR parliament OR congress)",
};
