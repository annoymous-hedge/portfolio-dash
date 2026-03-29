# main.py
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
    reference: Optional[str] = None  # New field added
    shares: float
    avg_price: float
    purchase_date: str


@app.post("/api/portfolio")
def get_portfolio_metrics(holdings: List[Holding]):
    metrics = []
    total_value = 0
    total_cost = 0
    total_daily_pnl = 0

    today = datetime.now().date()

    for h in holdings:
        try:
            stock = yf.Ticker(h.ticker)
            hist = stock.history(period="5d")

            if len(hist) >= 2:
                current_price = hist['Close'].iloc[-1]
                prev_price = hist['Close'].iloc[-2]
            elif len(hist) == 1:
                current_price = hist['Close'].iloc[-1]
                prev_price = current_price
            else:
                current_price = h.avg_price
                prev_price = h.avg_price

            market_value = current_price * h.shares
            cost = h.avg_price * h.shares

            pnl = market_value - cost
            pnl_percent = ((current_price - h.avg_price) / h.avg_price) * 100 if h.avg_price > 0 else 0
            daily_pnl = (current_price - prev_price) * h.shares

            # CAGR Calculation
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

            total_value += market_value
            total_cost += cost
            total_daily_pnl += daily_pnl

            # Determine the reference name
            ref_name = h.reference if h.reference else h.ticker.upper()

            daily_return_percent = ((current_price - prev_price) / prev_price) * 100 if prev_price > 0 else 0

            metrics.append({
                "ticker": h.ticker.upper(),
                "reference": ref_name,
                "shares": h.shares,
                "avg_price": h.avg_price,
                "purchase_date": h.purchase_date,
                "current_price": round(current_price, 2),
                "market_value": round(market_value, 2),
                "pnl": round(pnl, 2),
                "pnl_percent": round(pnl_percent, 2),
                "ann_return_percent": round(ann_return_percent, 2),
                "daily_pnl": round(daily_pnl, 2),
                "daily_return_percent": round(daily_return_percent, 2),
                "weight_percent": 0,
                "weight_contribution_daily_percent": 0,
            })
        except Exception as e:
            print(f"Error fetching {h.ticker}: {e}")

    portfolio_daily_return_percent = 0
    portfolio_weighted_ann_return_percent = 0
    portfolio_weighted_total_return_percent = 0

    if total_value > 0:
        for m in metrics:
            w = m["market_value"] / total_value
            m["weight_percent"] = round(w * 100, 2)
            m["weight_contribution_daily_percent"] = round(w * m["daily_return_percent"], 3)
            portfolio_daily_return_percent += w * m["daily_return_percent"]
            portfolio_weighted_ann_return_percent += w * m["ann_return_percent"]
            portfolio_weighted_total_return_percent += w * m["pnl_percent"]

    best_performer = max(metrics, key=lambda x: x['pnl_percent'], default=None) if metrics else None
    worst_performer = min(metrics, key=lambda x: x['pnl_percent'], default=None) if metrics else None

    return {
        "holdings": metrics,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pnl": round(total_value - total_cost, 2),
        "total_pnl_percent": round(((total_value - total_cost) / total_cost) * 100, 2) if total_cost > 0 else 0,
        "total_daily_pnl": round(total_daily_pnl, 2),
        "portfolio_daily_return_percent": round(portfolio_daily_return_percent, 2),
        "portfolio_weighted_ann_return_percent": round(portfolio_weighted_ann_return_percent, 2),
        "portfolio_weighted_total_return_percent": round(portfolio_weighted_total_return_percent, 2),
        "best_performer": best_performer['reference'] if best_performer else "N/A",
        "best_performer_pnl": round(best_performer['pnl_percent'], 2) if best_performer else 0,
        "worst_performer": worst_performer['reference'] if worst_performer else "N/A",
        "worst_performer_pnl": round(worst_performer['pnl_percent'], 2) if worst_performer else 0
    }