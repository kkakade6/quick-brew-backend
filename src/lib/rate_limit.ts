export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withRetries<T>(
  fn: () => Promise<T>,
  opts: { tries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const tries = opts.tries ?? 5;
  const base = opts.baseDelayMs ?? 2000; // 2s base

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      const msg = e?.message || "";
      const code = e?.code || e?.response?.data?.error?.code;

      // If it's not rate-limit or timeout-ish, rethrow fast
      const isRate =
        /rate[_ -]?limit/i.test(msg) || code === "rate_limit_exceeded";
      const isTimeout = /timeout/i.test(msg);
      if (!isRate && !isTimeout && attempt >= 2) throw e;

      if (attempt >= tries) throw e;

      // Exponential backoff + jitter; if Groq said "try again in Xs", honor ~that
      let delay = Math.min(base * 2 ** (attempt - 1), 20_000);
      const match = msg.match(/try again in ([0-9.]+)s/i);
      if (match)
        delay = Math.max(delay, Math.ceil(parseFloat(match[1]) * 1000) + 500);

      // Jitter 0–300ms
      delay += Math.floor(Math.random() * 300);

      console.warn(`[retry] attempt ${attempt}/${tries} — waiting ${delay}ms`);
      await sleep(delay);
    }
  }
}
