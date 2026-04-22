# main.py — FastAPI backend (used locally and on Vercel Python runtime)
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, date

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ────────────────────────────────────────────────────────────

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


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_fx_rate(display_currency: str) -> float:
    """Return how many display-currency units equal 1 USD.
    Uses fast_info for a real-time rate, falls back to history, then 4.4.
    """
    if display_currency != "MYR":
        return 1.0
    try:
        fx_ticker = yf.Ticker("MYRX=X")
        rate = float(fx_ticker.fast_info.last_price)
        if rate and rate > 0:
            return rate
    except Exception:
        pass
    try:
        hist = fx_ticker.history(period="1d")
        if not hist.empty:
            return float(hist["Close"].iloc[-1])
    except Exception as e:
        print(f"FX fetch failed: {e}")
    return 4.4  # last-resort fallback


def get_stock_price(ticker_obj: yf.Ticker, avg_price: float):
    """Return (current_price, prev_close) using fast_info for real-time data.
    Falls back to history() if fast_info is unavailable.
    """
    try:
        fi = ticker_obj.fast_info
        current = float(fi.last_price)
        prev = float(fi.previous_close) if fi.previous_close else current
        if current and current > 0:
            return current, prev
    except Exception:
        pass

    # Fallback: daily history (previous-day close during market hours)
    try:
        hist = ticker_obj.history(period="5d")
        if len(hist) >= 2:
            return float(hist["Close"].iloc[-1]), float(hist["Close"].iloc[-2])
        elif len(hist) == 1:
            v = float(hist["Close"].iloc[-1])
            return v, v
    except Exception:
        pass

    return avg_price, avg_price


def xirr(cash_flows: list, dates: list, guess: float = 0.1) -> Optional[float]:
    """Newton-Raphson XIRR (annualised IRR for irregular cash flows).
    cash_flows: list of floats — negative = outflow, positive = inflow
    dates:      list of datetime.date objects, same length as cash_flows
    Returns annualised rate as a decimal (e.g. 0.12 = 12 %), or None if it fails.
    """
    if len(cash_flows) < 2 or len(cash_flows) != len(dates):
        return None

    t0 = dates[0]
    t  = [(d - t0).days / 365.25 for d in dates]

    r = guess
    for _ in range(1000):
        try:
            npv  = sum(c / (1 + r) ** ti for c, ti in zip(cash_flows, t))
            dnpv = sum(-ti * c / (1 + r) ** (ti + 1) for c, ti in zip(cash_flows, t))
        except (ZeroDivisionError, OverflowError):
            return None
        if abs(dnpv) < 1e-15:
            break
        r2 = r - npv / dnpv
        r2 = max(min(r2, 100.0), -0.9999)
        if abs(r2 - r) < 1e-8:
            return r2
        r = r2

    return r if -0.9999 < r < 100 else None


def compute_twr(holding_metrics: list) -> Optional[float]:
    """Chain-link TWR using each holding's individual holding-period return.
    TWR = Π(1 + HPR_i) − 1
    This equals true TWR when each position has a single cash flow (purchase).
    Returns total TWR as a decimal (e.g. 0.25 = 25%).
    """
    if not holding_metrics:
        return None
    product = 1.0
    for m in holding_metrics:
        factor = 1.0 + m["pnl_percent"] / 100.0
        product *= factor
    return product - 1.0


# ── Endpoint ───────────────────────────────────────────────────────────────────

@app.post("/api/portfolio")
def get_portfolio_metrics(req: PortfolioRequest):
    holdings = req.holdings
    display_currency = req.display_currency or "USD"

    # Fetch FX rate ONCE — the single source of truth for all converted values
    fx = get_fx_rate(display_currency)

    metrics       = []
    total_value_usd      = 0.0
    total_cost_usd       = 0.0
    total_daily_pnl_usd  = 0.0
    total_dividends_disp = 0.0

    # Cash-flow lists for XIRR (all in USD before conversion)
    cf_values: list[float] = []
    cf_dates:  list[date]  = []

    today = datetime.now().date()

    for h in holdings:
        try:
            stock = yf.Ticker(h.ticker)
            current_price, prev_price = get_stock_price(stock, h.avg_price)

            market_value = current_price * h.shares
            cost         = h.avg_price  * h.shares

            pnl         = market_value - cost
            pnl_percent = ((current_price - h.avg_price) / h.avg_price * 100
                           if h.avg_price > 0 else 0)
            daily_pnl   = (current_price - prev_price) * h.shares

            try:
                p_date    = datetime.strptime(h.purchase_date, "%Y-%m-%d").date()
                days_held = max((today - p_date).days, 1)
            except ValueError:
                p_date    = today
                days_held = 365

            years_held = days_held / 365.25

            if years_held > 0 and h.avg_price > 0:
                ann_return_percent = (((current_price / h.avg_price) ** (1 / years_held)) - 1) * 100
            else:
                ann_return_percent = pnl_percent

            total_value_usd     += market_value
            total_cost_usd      += cost
            total_daily_pnl_usd += daily_pnl

            daily_return_percent = ((current_price - prev_price) / prev_price * 100
                                    if prev_price > 0 else 0)

            div_disp = (h.dividends_received or 0.0) * fx
            total_dividends_disp += div_disp

            # Cash flows for XIRR: outflow at purchase date, inflow (current value) added later
            cf_values.append(-cost)   # negative = money out
            cf_dates.append(p_date)

            ref_name = h.reference if h.reference else h.ticker.upper()

            metrics.append({
                "ticker":                        h.ticker.upper(),
                "reference":                     ref_name,
                "shares":                        h.shares,
                "avg_price":                     round(h.avg_price   * fx, 4),
                "purchase_date":                 h.purchase_date,
                "current_price":                 round(current_price * fx, 4),
                "market_value":                  round(market_value  * fx, 2),
                "pnl":                           round(pnl           * fx, 2),
                "pnl_percent":                   round(pnl_percent,      2),
                "ann_return_percent":             round(ann_return_percent, 2),
                "daily_pnl":                     round(daily_pnl     * fx, 2),
                "daily_return_percent":           round(daily_return_percent, 2),
                "dividends_received":            h.dividends_received or 0.0,
                "dividends_received_display":    round(div_disp, 2),
                "weight_percent":                0,
                "weight_contribution_daily_percent": 0,
                "display_currency":              display_currency,
                "fx_rate_to_display":            fx,
            })

        except Exception as e:
            print(f"Error fetching {h.ticker}: {e}")

    # ── Portfolio-level aggregates ─────────────────────────────────────────────
    total_value     = round(total_value_usd     * fx, 2)
    total_cost      = round(total_cost_usd      * fx, 2)
    total_pnl       = round((total_value_usd - total_cost_usd) * fx, 2)
    total_daily_pnl = round(total_daily_pnl_usd * fx, 2)

    portfolio_daily_return_percent          = 0.0
    portfolio_weighted_ann_return_percent   = 0.0
    portfolio_weighted_total_return_percent = 0.0

    if total_value_usd > 0:
        for m in metrics:
            w = (m["market_value"] / fx) / total_value_usd
            m["weight_percent"]                     = round(w * 100, 2)
            m["weight_contribution_daily_percent"]  = round(w * m["daily_return_percent"], 3)
            portfolio_daily_return_percent          += w * m["daily_return_percent"]
            portfolio_weighted_ann_return_percent   += w * m["ann_return_percent"]
            portfolio_weighted_total_return_percent += w * m["pnl_percent"]

    # ── TWR (chain-link of individual holding HPRs) ────────────────────────────
    twr_raw     = compute_twr(metrics)
    twr_percent = round(twr_raw * 100, 2) if twr_raw is not None else None

    # ── IRR / MWR (XIRR) ──────────────────────────────────────────────────────
    irr_percent: Optional[float] = None
    if cf_dates and total_value_usd > 0:
        # Final inflow = today's total portfolio value (USD)
        all_cf    = cf_values + [total_value_usd]
        all_dates = cf_dates  + [today]
        # Sort by date
        pairs     = sorted(zip(all_dates, all_cf))
        s_dates, s_cf = zip(*pairs)
        raw_irr   = xirr(list(s_cf), list(s_dates))
        if raw_irr is not None:
            irr_percent = round(raw_irr * 100, 2)

    best_performer  = max(metrics, key=lambda x: x["pnl_percent"], default=None) if metrics else None
    worst_performer = min(metrics, key=lambda x: x["pnl_percent"], default=None) if metrics else None

    return {
        "holdings":                              metrics,
        "display_currency":                      display_currency,
        "fx_rate_usd_to_display":                fx,
        "total_value":                           total_value,
        "total_cost":                            total_cost,
        "total_pnl":                             total_pnl,
        "total_pnl_percent":                     round(((total_value_usd - total_cost_usd) / total_cost_usd) * 100, 2)
                                                 if total_cost_usd > 0 else 0,
        "total_daily_pnl":                       total_daily_pnl,
        "total_dividends_display":               round(total_dividends_disp, 2),
        "portfolio_daily_return_percent":        round(portfolio_daily_return_percent, 2),
        "portfolio_weighted_ann_return_percent": round(portfolio_weighted_ann_return_percent, 2),
        "portfolio_weighted_total_return_percent": round(portfolio_weighted_total_return_percent, 2),
        "twr_percent":                           twr_percent,
        "irr_percent":                           irr_percent,
        "best_performer":                        best_performer["reference"] if best_performer else "N/A",
        "best_performer_pnl":                    round(best_performer["pnl_percent"], 2) if best_performer else 0,
        "worst_performer":                       worst_performer["reference"] if worst_performer else "N/A",
        "worst_performer_pnl":                   round(worst_performer["pnl_percent"], 2) if worst_performer else 0,
    }