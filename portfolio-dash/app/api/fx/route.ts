// app/api/fx/route.ts
// Returns live MYR per 1 USD from Yahoo Finance (MYRX=X ticker)
import { NextResponse } from "next/server";

// Cache the rate for 10 minutes to avoid hammering Yahoo Finance
let cachedRate: number | null = null;
let cacheExpiry = 0;

const YF_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchFromYahoo(): Promise<number> {
  // Primary: v8 chart endpoint
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/MYRX=X?interval=1d&range=1d",
      { headers: YF_HEADERS, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const rate: number = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (rate && rate > 0) return rate;
    }
  } catch { /* try next */ }

  // Fallback: v10 quoteSummary
  try {
    const res = await fetch(
      "https://query2.finance.yahoo.com/v10/finance/quoteSummary/MYRX=X?modules=price",
      { headers: YF_HEADERS, cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const rate: number =
        data?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
      if (rate && rate > 0) return rate;
    }
  } catch { /* fall through */ }

  throw new Error("All Yahoo Finance endpoints failed");
}

export async function GET() {
  const now = Date.now();

  if (cachedRate !== null && now < cacheExpiry) {
    return NextResponse.json({ myr_per_usd: cachedRate, cached: true });
  }

  try {
    const rate = await fetchFromYahoo();
    cachedRate = rate;
    cacheExpiry = now + 10 * 60 * 1000; // 10 min
    return NextResponse.json({ myr_per_usd: rate });
  } catch {
    // Return last known cached value if available, otherwise fallback
    if (cachedRate !== null) {
      return NextResponse.json({ myr_per_usd: cachedRate, stale: true });
    }
    return NextResponse.json({ myr_per_usd: 4.4, fallback: true });
  }
}
