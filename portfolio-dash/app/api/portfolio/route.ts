import YahooFinance from "yahoo-finance2";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const yahooFinance = new YahooFinance();

type HoldingIn = {
  ticker: string;
  reference?: string;
  shares: number;
  avg_price: number;
  purchase_date: string;
};

type DisplayCurrency = "USD" | "MYR";

async function fetchTickerSnapshot(
  ticker: string
): Promise<{ current: number; prev: number; quoteCurrency: string } | null> {
  const chart = await yahooFinance.chart(ticker, {
    period1: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000),
    interval: "1d",
  });
  const quotes = chart.quotes?.filter((q) => q.close != null && q.close > 0) ?? [];
  const quoteCurrency = String(chart.meta?.currency ?? "USD").toUpperCase();
  if (quotes.length >= 2) {
    const current = quotes[quotes.length - 1].close!;
    const prev = quotes[quotes.length - 2].close!;
    return { current, prev, quoteCurrency };
  }
  if (quotes.length === 1) {
    const c = quotes[0].close!;
    return { current: c, prev: c, quoteCurrency };
  }
  return null;
}

async function fetchFxRate(fromCurrency: string, toCurrency: string): Promise<number> {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return 1;

  const pair = `${from}${to}=X`;
  try {
    const chart = await yahooFinance.chart(pair, {
      period1: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      interval: "1d",
    });
    const quotes = chart.quotes?.filter((q) => q.close != null && q.close > 0) ?? [];
    if (quotes.length > 0) return quotes[quotes.length - 1].close!;
  } catch {
    // try inverse below
  }

  const inversePair = `${to}${from}=X`;
  try {
    const chart = await yahooFinance.chart(inversePair, {
      period1: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      interval: "1d",
    });
    const quotes = chart.quotes?.filter((q) => q.close != null && q.close > 0) ?? [];
    if (quotes.length > 0) {
      const inverse = quotes[quotes.length - 1].close!;
      return inverse > 0 ? 1 / inverse : 1;
    }
  } catch {
    // fallback
  }

  return 1;
}

export async function POST(request: Request) {
  let holdings: HoldingIn[] = [];
  let displayCurrency: DisplayCurrency = "USD";
  try {
    const payload = await request.json();
    if (Array.isArray(payload)) {
      holdings = payload;
    } else {
      holdings = Array.isArray(payload?.holdings) ? payload.holdings : [];
      const requestedCurrency = String(payload?.display_currency ?? "USD").toUpperCase();
      displayCurrency = requestedCurrency === "MYR" ? "MYR" : "USD";
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!Array.isArray(holdings)) {
    return NextResponse.json({ error: "Expected array of holdings" }, { status: 400 });
  }

  const today = new Date();
  const metrics: Array<{
    ticker: string;
    reference: string;
    shares: number;
    avg_price: number;
    purchase_date: string;
    current_price: number;
    market_value: number;
    pnl: number;
    pnl_percent: number;
    ann_return_percent: number;
    daily_pnl: number;
    daily_return_percent: number;
    quote_currency: string;
    fx_rate_to_display: number;
    display_currency: DisplayCurrency;
    weight_percent: number;
    weight_contribution_daily_percent: number;
  }> = [];

  let totalValue = 0;
  let totalCost = 0;
  let totalDailyPnl = 0;

  for (const h of holdings) {
    try {
      const ticker = String(h.ticker || "").toUpperCase();
      const snapshot = await fetchTickerSnapshot(ticker);

      let currentPrice: number;
      let prevPrice: number;
      let quoteCurrency = "USD";
      if (snapshot) {
        currentPrice = snapshot.current;
        prevPrice = snapshot.prev;
        quoteCurrency = snapshot.quoteCurrency;
      } else {
        currentPrice = h.avg_price;
        prevPrice = h.avg_price;
      }

      const fxRate = await fetchFxRate(quoteCurrency, displayCurrency);

      const marketValue = currentPrice * h.shares * fxRate;
      const cost = h.avg_price * h.shares * fxRate;
      const pnl = marketValue - cost;
      const pnlPercent =
        h.avg_price > 0 ? ((currentPrice - h.avg_price) / h.avg_price) * 100 : 0;
      const dailyPnl = (currentPrice - prevPrice) * h.shares * fxRate;
      const dailyReturnPercent =
        prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

      let daysHeld = 365;
      try {
        const pDate = new Date(h.purchase_date);
        if (!Number.isNaN(pDate.getTime())) {
          daysHeld = Math.max(
            0,
            Math.floor((today.getTime() - pDate.getTime()) / (24 * 60 * 60 * 1000))
          );
        }
      } catch {
        /* keep default */
      }
      const yearsHeld = daysHeld / 365.25;
      let annReturnPercent: number;
      if (yearsHeld > 0 && h.avg_price > 0) {
        annReturnPercent = (Math.pow(currentPrice / h.avg_price, 1 / yearsHeld) - 1) * 100;
      } else {
        annReturnPercent = pnlPercent;
      }

      const refName = h.reference?.trim() || ticker;

      totalValue += marketValue;
      totalCost += cost;
      totalDailyPnl += dailyPnl;

      metrics.push({
        ticker,
        reference: refName,
        shares: h.shares,
        avg_price: round2(h.avg_price * fxRate),
        purchase_date: h.purchase_date,
        current_price: round2(currentPrice * fxRate),
        market_value: round2(marketValue),
        pnl: round2(pnl),
        pnl_percent: round2(pnlPercent),
        ann_return_percent: round2(annReturnPercent),
        daily_pnl: round2(dailyPnl),
        daily_return_percent: round2(dailyReturnPercent),
        quote_currency: quoteCurrency,
        fx_rate_to_display: round4(fxRate),
        display_currency: displayCurrency,
        weight_percent: 0,
        weight_contribution_daily_percent: 0,
      });
    } catch (e) {
      console.error(`Error fetching ${h.ticker}:`, e);
    }
  }

  let portfolioDailyReturnPercent = 0;
  let portfolioWeightedAnnReturnPercent = 0;
  let portfolioWeightedTotalReturnPercent = 0;

  if (totalValue > 0) {
    for (const m of metrics) {
      const w = m.market_value / totalValue;
      m.weight_percent = round2(w * 100);
      m.weight_contribution_daily_percent = round2(w * m.daily_return_percent);
      portfolioDailyReturnPercent += w * m.daily_return_percent;
      portfolioWeightedAnnReturnPercent += w * m.ann_return_percent;
      portfolioWeightedTotalReturnPercent += w * m.pnl_percent;
    }
  }

  const bestPerformer = metrics.length
    ? metrics.reduce((a, b) => (a.pnl_percent >= b.pnl_percent ? a : b))
    : null;
  const worstPerformer = metrics.length
    ? metrics.reduce((a, b) => (a.pnl_percent <= b.pnl_percent ? a : b))
    : null;

  return NextResponse.json({
    holdings: metrics,
    display_currency: displayCurrency,
    total_value: round2(totalValue),
    total_cost: round2(totalCost),
    total_pnl: round2(totalValue - totalCost),
    total_pnl_percent:
      totalCost > 0 ? round2(((totalValue - totalCost) / totalCost) * 100) : 0,
    total_daily_pnl: round2(totalDailyPnl),
    portfolio_daily_return_percent: round2(portfolioDailyReturnPercent),
    portfolio_weighted_ann_return_percent: round2(portfolioWeightedAnnReturnPercent),
    portfolio_weighted_total_return_percent: round2(portfolioWeightedTotalReturnPercent),
    best_performer: bestPerformer?.reference ?? "N/A",
    best_performer_pnl: bestPerformer ? round2(bestPerformer.pnl_percent) : 0,
    worst_performer: worstPerformer?.reference ?? "N/A",
    worst_performer_pnl: worstPerformer ? round2(worstPerformer.pnl_percent) : 0,
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
