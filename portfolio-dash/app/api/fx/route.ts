// app/api/fx/route.ts
// Returns live MYR per 1 USD from Yahoo Finance (MYRX=X ticker)
import { NextResponse } from "next/server";

// Cache the rate for 10 minutes to avoid hammering Yahoo Finance
let cachedRate: number | null = null;
let cacheExpiry = 0;

export async function GET() {
  const now = Date.now();

  if (cachedRate !== null && now < cacheExpiry) {
    return NextResponse.json({ myr_per_usd: cachedRate });
  }

  try {
    // Use the Python backend to get the FX rate
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/MYRX=X?interval=1d&range=1d",
      { next: { revalidate: 600 } }
    );

    if (!res.ok) throw new Error("Yahoo Finance request failed");

    const data = await res.json();
    const rate: number =
      data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;

    if (!rate || rate <= 0) throw new Error("Invalid rate");

    cachedRate = rate;
    cacheExpiry = now + 10 * 60 * 1000; // 10 min

    return NextResponse.json({ myr_per_usd: rate });
  } catch {
    // Fallback: return a sensible default so the UI still works
    return NextResponse.json({ myr_per_usd: 4.4, fallback: true });
  }
}
