# main.py — FastAPI backend (used locally and on Vercel Python runtime)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Holding(BaseModel):
    ticker: str
    reference: Optional[str] = None
    shares: float
    avg_price: float
    purchase_date: str
    dividends_received: Optional[float] = 0.0


class PortfolioRequest(BaseModel):
    holdings: List[Holding]
    display_currency: Optional[str] = "USD"


def get_fx_rate(display_currency: str) -> float:
    """Return how many display-currency units equal 1 USD.
    For USD display: 1.0  (no conversion)
    For MYR display: fetch MYRX=X (MYR per 1 USD) from yfinance.
    Falls back to 4.4 if the fetch fails.
    """
    if display_currency != "MYR":
        return 1.0
    try:
        fx = yf.Ticker("MYRX=X")
        hist = fx.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as e:
        print(f"FX fetch failed: {e}")
    return 4.4  # sensible fallback


@app.post("/api/portfolio")
def get_portfolio_metrics(req: PortfolioRequest):
    holdings = req.holdings
    display_currency = req.display_currency or "USD"

    # Fetch the FX rate ONCE — the same rate used for every value in the response
    fx = get_fx_rate(display_currency)

    metrics = []
    total_value_usd = 0
    total_cost_usd = 0
    total_daily_pnl_usd = 0
    total_dividends_display = 0

    today = datetime.now().date()

    for h in holdings:
        try:
            stock = yf.Ticker(h.ticker)
            hist = stock.history(period="5d")

            if len(hist) >= 2:
                current_price = hist["Close"].iloc[-1]
                prev_price = hist["Close"].iloc[-2]
            elif len(hist) == 1:
                current_price = hist["Close"].iloc[-1]
                prev_price = current_price
            else:
                current_price = h.avg_price
                prev_price = h.avg_price

            market_value = current_price * h.shares
            cost = h.avg_price * h.shares

            pnl = market_value - cost
            pnl_percent = (
                ((current_price - h.avg_price) / h.avg_price) * 100 if h.avg_price > 0 else 0
            )
            daily_pnl = (current_price - prev_price) * h.shares

            try:
                p_date = datetime.strptime(h.purchase_date, "%Y-%m-%d").date()
                days_held = (today - p_date).days
            except ValueError:
                days_held = 365

            years_held = days_held / 365.25

            if years_held > 0 and h.avg_price > 0:
                ann_return = ((current_price / h.avg_price) ** (1 / years_held)) - 1
                ann_return_percent = ann_return * 100
            else:
                ann_return_percent = pnl_percent

            total_value_usd += market_value
            total_cost_usd += cost
            total_daily_pnl_usd += daily_pnl

            ref_name = h.reference if h.reference else h.ticker.upper()

            daily_return_percent = (
                ((current_price - prev_price) / prev_price) * 100 if prev_price > 0 else 0
            )

            # Dividends stored in the asset's native currency (USD for US stocks).
            # Convert to display currency using the same fx rate.
            div_display = (h.dividends_received or 0.0) * fx
            total_dividends_display += div_display

            metrics.append(
                {
                    "ticker": h.ticker.upper(),
                    "reference": ref_name,
                    "shares": h.shares,
                    "avg_price": round(h.avg_price * fx, 4),
                    "purchase_date": h.purchase_date,
                    "current_price": round(current_price * fx, 4),
                    "market_value": round(market_value * fx, 2),
                    "pnl": round(pnl * fx, 2),
                    "pnl_percent": round(pnl_percent, 2),
                    "ann_return_percent": round(ann_return_percent, 2),
                    "daily_pnl": round(daily_pnl * fx, 2),
                    "daily_return_percent": round(daily_return_percent, 2),
                    "dividends_received": h.dividends_received or 0.0,
                    "dividends_received_display": round(div_display, 2),
                    "weight_percent": 0,
                    "weight_contribution_daily_percent": 0,
                    "display_currency": display_currency,
                    "fx_rate_to_display": fx,
                }
            )
        except Exception as e:
            print(f"Error fetching {h.ticker}: {e}")

    total_value = round(total_value_usd * fx, 2)
    total_cost  = round(total_cost_usd * fx, 2)
    total_pnl   = round((total_value_usd - total_cost_usd) * fx, 2)
    total_daily_pnl = round(total_daily_pnl_usd * fx, 2)

    portfolio_daily_return_percent = 0.0
    portfolio_weighted_ann_return_percent = 0.0
    portfolio_weighted_total_return_percent = 0.0

    if total_value_usd > 0:
        for m in metrics:
            # weights are currency-neutral (ratio of USD values)
            w = (m["market_value"] / fx) / total_value_usd
            m["weight_percent"] = round(w * 100, 2)
            m["weight_contribution_daily_percent"] = round(w * m["daily_return_percent"], 3)
            portfolio_daily_return_percent += w * m["daily_return_percent"]
            portfolio_weighted_ann_return_percent += w * m["ann_return_percent"]
            portfolio_weighted_total_return_percent += w * m["pnl_percent"]

    best_performer = max(metrics, key=lambda x: x["pnl_percent"], default=None) if metrics else None
    worst_performer = min(metrics, key=lambda x: x["pnl_percent"], default=None) if metrics else None

    return {
        "holdings": metrics,
        "display_currency": display_currency,
        "fx_rate_usd_to_display": fx,          # ← single source of truth for FX
        "total_value": total_value,
        "total_cost": total_cost,
        "total_pnl": total_pnl,
        "total_pnl_percent": round(((total_value_usd - total_cost_usd) / total_cost_usd) * 100, 2)
        if total_cost_usd > 0
        else 0,
        "total_daily_pnl": total_daily_pnl,
        "total_dividends_display": round(total_dividends_display, 2),
        "portfolio_daily_return_percent": round(portfolio_daily_return_percent, 2),
        "portfolio_weighted_ann_return_percent": round(portfolio_weighted_ann_return_percent, 2),
        "portfolio_weighted_total_return_percent": round(portfolio_weighted_total_return_percent, 2),
        "best_performer": best_performer["reference"] if best_performer else "N/A",
        "best_performer_pnl": round(best_performer["pnl_percent"], 2) if best_performer else 0,
        "worst_performer": worst_performer["reference"] if worst_performer else "N/A",
        "worst_performer_pnl": round(worst_performer["pnl_percent"], 2) if worst_performer else 0,
    }