// app/page.tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Activity, DollarSign, PieChart as PieChartIcon, TrendingUp, Plus, Trash2, Award, AlertTriangle, Calendar, Wallet } from "lucide-react";
import ParticleBackground from "@/components/ParticleBackground";
import { supabase } from "@/lib/supabaseClient";

interface HoldingInput {
  ticker: string;
  reference: string;
  shares: number;
  avg_price: number;
  purchase_date: string;
  dividends_received: number;
}

interface PortfolioMetrics {
  holdings: {
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
    display_currency: "USD" | "MYR";
    dividends_received: number;
    dividends_received_display: number;
    dividend_yield_percent: number | null;
    weight_percent: number;
    weight_contribution_daily_percent: number;
  }[];
  display_currency: "USD" | "MYR";
  fx_rate_usd_to_display: number;   // the single FX source of truth from the backend
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_percent: number;
  total_daily_pnl: number;
  total_dividends_display: number;
  portfolio_daily_return_percent: number;
  portfolio_weighted_ann_return_percent: number;
  portfolio_weighted_total_return_percent: number;
  best_performer: string;
  best_performer_pnl: number;
  worst_performer: string;
  worst_performer_pnl: number;
}

const COLORS =["#38bdf8", "#c084fc", "#34d399", "#fbbf24", "#f87171", "#818cf8", "#e879f9", "#34d399"];

export default function Dashboard() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingInput[]>([]);

  const [metrics, setMetrics] = useState<PortfolioMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loadingHoldings, setLoadingHoldings] = useState(true);
  const [displayCurrency, setDisplayCurrency] = useState<"USD" | "MYR">("USD");

  // Portfolio deposit amount for absolute return
  const [depositInput, setDepositInput] = useState("");
  const [totalDeposit, setTotalDeposit] = useState(0);
  const [depositCurrency, setDepositCurrency] = useState<"USD" | "MYR">("MYR");
  const [myrUsdRate, setMyrUsdRate] = useState<number>(4.4); // fallback rate
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Cash fund tracking (named funds with additive deposit/value)
  const [cashFundName, setCashFundName] = useState("");
  const [cashFundDeposit, setCashFundDeposit] = useState("");
  const [cashFundValue, setCashFundValue] = useState("");
  const [cashFundCurrency, setCashFundCurrency] = useState<"USD" | "MYR">("USD");
  const [cashFunds, setCashFunds] = useState<{name: string; deposit: number; currentValue: number; currency: "USD" | "MYR"}[]>([]);

  const [newTicker, setNewTicker] = useState("");
  const[newReference, setNewReference] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const currencySymbol = displayCurrency === "MYR" ? "RM" : "$";

  const [divRef, setDivRef] = useState("");
  const [divAmount, setDivAmount] = useState("");

  const [hoveredAssetIndex, setHoveredAssetIndex] = useState<number | null>(null);
  const hoverTimer = useRef<number | null>(null);

  // Ensure each browser has a stable client id
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("hp_portfolio_client_id");
    if (stored) {
      setClientId(stored);
      return;
    }
    const id = uuidv4();
    window.localStorage.setItem("hp_portfolio_client_id", id);
    setClientId(id);
  }, []);

  // Load holdings from Supabase (or seed defaults) once we know clientId
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const load = async () => {
      if (!supabase) {
        // No persistence configured: keep using in-memory defaults.
        setHoldings([
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15", dividends_received: 0 },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20", dividends_received: 0 },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01", dividends_received: 0 },
        ]);
        setLoadingHoldings(false);
        return;
      }
      setLoadingHoldings(true);
      const { data, error } = await supabase
        .from("holdings")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error("Failed to load holdings from Supabase", error);
        // Fall back to in-memory defaults so the UI is still usable
        const defaults: HoldingInput[] = [
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15", dividends_received: 0 },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20", dividends_received: 0 },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01", dividends_received: 0 },
        ];
        setHoldings(defaults);
        setLoadingHoldings(false);
        return;
      }

      if (!data || data.length === 0) {
        const defaults: HoldingInput[] = [
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15", dividends_received: 0 },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20", dividends_received: 0 },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01", dividends_received: 0 },
        ];
        setHoldings(defaults);
        await supabase.from("holdings").insert(
          defaults.map((h) => ({
            client_id: clientId,
            ticker: h.ticker,
            reference: h.reference,
            shares: h.shares,
            avg_price: h.avg_price,
            purchase_date: h.purchase_date,
            dividends_received: h.dividends_received,
          })),
        );
      } else {
        setHoldings(
          data.map((row: any) => ({
            ticker: row.ticker,
            reference: row.reference,
            shares: row.shares,
            avg_price: row.avg_price,
            purchase_date: row.purchase_date,
            dividends_received: Number(row.dividends_received ?? 0) || 0,
          })),
        );
      }

      setLoadingHoldings(false);
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // Persist holdings to Supabase whenever they change
  useEffect(() => {
    if (!clientId || !supabase) return;
    if (loadingHoldings) return; // avoid immediately overwriting while first loading

    const sync = async () => {
      if (!supabase) return;
      const { error } = await supabase
        .from("holdings")
        .delete()
        .eq("client_id", clientId);
      if (error) {
        console.error("Failed to clear holdings before sync", error);
        return;
      }
      if (holdings.length === 0) return;
      const { error: insertError } = await supabase.from("holdings").insert(
        holdings.map((h) => ({
          client_id: clientId,
          ticker: h.ticker,
          reference: h.reference,
          shares: h.shares,
          avg_price: h.avg_price,
          purchase_date: h.purchase_date,
          dividends_received: h.dividends_received,
        })),
      );
      if (insertError) {
        console.error("Failed to persist holdings to Supabase", insertError);
      }
    };

    void sync();
  }, [clientId, holdings, loadingHoldings]);

  // Load portfolio settings (deposit + cash funds) from Supabase
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    const loadSettings = async () => {
      if (!supabase) {
        if (!cancelled) setLoadingSettings(false);
        return;
      }

      const { data, error } = await supabase
        .from("portfolio_settings")
        .select("*")
        .eq("client_id", clientId)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Failed to load portfolio settings", error);
      } else if (data) {
        setTotalDeposit(Number(data.total_deposit) || 0);
        setDepositCurrency((data.deposit_currency as "USD" | "MYR") || "MYR");
        const funds = data.cash_funds;
        if (Array.isArray(funds)) {
          setCashFunds(funds);
        }
      }

      setLoadingSettings(false);
    };

    void loadSettings();
    return () => { cancelled = true; };
  }, [clientId]);

  // Helper: persist portfolio settings to Supabase
  const saveSettings = async (deposit: number, depCurrency: "USD" | "MYR", funds: {name: string; deposit: number; currentValue: number}[]) => {
    if (!clientId || !supabase) return;
    const { error } = await supabase
      .from("portfolio_settings")
      .upsert(
        { client_id: clientId, total_deposit: deposit, deposit_currency: depCurrency, cash_funds: funds },
        { onConflict: "client_id" }
      );
    if (error) console.error("Failed to save portfolio settings", error);
  };

  const fetchMetrics = async () => {
    if (holdings.length === 0) {
      setMetrics(null);
      setFetchError(null);
      return;
    }
    setLoading(true);
    setFetchError(null);
    try {
      const response = await axios.post("/api/portfolio", {
        holdings: holdings.map((h) => ({
          ...h,
          dividends_received: h.dividends_received,
        })),
        display_currency: displayCurrency,
      });
      const data = response.data;
      setMetrics(data);
      // Sync the FX rate used by the backend — this is the single source of truth.
      // The deposit conversion uses this exact same rate so the numbers are consistent.
      if (data.fx_rate_usd_to_display && data.fx_rate_usd_to_display > 0) {
        setMyrUsdRate(data.fx_rate_usd_to_display);
      }
    } catch (error) {
      console.error("Failed to fetch metrics", error);
      setMetrics(null);
      const msg = axios.isAxiosError(error)
        ? `${error.message}${error.response?.status ? ` (${error.response.status})` : ""}`
        : "Could not reach /api/portfolio. Is the FastAPI backend running?";
      setFetchError(msg);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!holdings.length) return;
    fetchMetrics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, displayCurrency]);

  const addTransaction = (e: React.FormEvent) => {
    e.preventDefault();

    // Ticker Defaults to SPY if left blank
    const finalTicker = newTicker.trim() === "" ? "SPY" : newTicker.toUpperCase();

    // Reference Defaults to Ticker if left blank
    const finalReference = newReference.trim() === "" ? finalTicker : newReference.trim();

    const sharesNum = parseFloat(newShares);
    const priceNum = parseFloat(newPrice);

    if (!sharesNum || !priceNum || !newDate) return;

    // We now group auto-summing by REFERENCE instead of TICKER
    const existingIndex = holdings.findIndex(h => h.reference === finalReference);

    if (existingIndex >= 0) {
      const updatedHoldings = [...holdings];
      const existing = updatedHoldings[existingIndex];

      const totalShares = existing.shares + sharesNum;
      const totalCostBasis = (existing.shares * existing.avg_price) + (sharesNum * priceNum);
      const newAveragePrice = totalCostBasis / totalShares;

      const earliestDate = new Date(existing.purchase_date) < new Date(newDate)
        ? existing.purchase_date
        : newDate;

      updatedHoldings[existingIndex] = {
        ticker: finalTicker,
        reference: finalReference,
        shares: totalShares,
        avg_price: newAveragePrice,
        purchase_date: earliestDate,
        dividends_received: existing.dividends_received ?? 0,
      };

      setHoldings(updatedHoldings);
    } else {
      setHoldings([...holdings, {
        ticker: finalTicker,
        reference: finalReference,
        shares: sharesNum,
        avg_price: priceNum,
        purchase_date: newDate,
        dividends_received: 0,
      }]);
    }

    // Reset Form
    setNewTicker(""); setNewReference(""); setNewShares(""); setNewPrice("");
  };

  const deleteHolding = (indexToRemove: number) => {
    setHoldings(holdings.filter((_, index) => index !== indexToRemove));
  };

  const setDividendForHolding = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(divAmount);
    if (!divRef || !Number.isFinite(amount) || amount <= 0) return;
    setHoldings((prev) =>
      prev.map((h) =>
        h.reference === divRef ? { ...h, dividends_received: (h.dividends_received || 0) + amount } : h
      )
    );
    setDivAmount("");
  };

  // Helper: convert an amount from its stored currency to the active display currency
  const toDisplay = (amount: number, fromCurrency: "USD" | "MYR"): number => {
    if (fromCurrency === displayCurrency) return amount;
    if (fromCurrency === "USD" && displayCurrency === "MYR") return amount * myrUsdRate;
    if (fromCurrency === "MYR" && displayCurrency === "USD") return amount / myrUsdRate;
    return amount;
  };

  const addCashFund = (e: React.FormEvent) => {
    e.preventDefault();
    const name = cashFundName.trim();
    const deposit = Number(cashFundDeposit);
    const value = Number(cashFundValue);
    if (!name) return;
    const dep = Number.isFinite(deposit) && deposit > 0 ? deposit : 0;
    const val = Number.isFinite(value) && value > 0 ? value : 0;
    if (dep === 0 && val === 0) return;

    setCashFunds((prev) => {
      let newFunds: {name: string; deposit: number; currentValue: number; currency: "USD" | "MYR"}[];
      const existingIdx = prev.findIndex((f) => f.name === name);
      if (existingIdx >= 0) {
        // Only allow adding to a fund if the currency matches
        const updated = [...prev];
        updated[existingIdx] = {
          ...updated[existingIdx],
          deposit: updated[existingIdx].deposit + dep,
          currentValue: updated[existingIdx].currentValue + val,
          currency: cashFundCurrency, // update currency on top-up
        };
        newFunds = updated;
      } else {
        newFunds = [...prev, { name, deposit: dep, currentValue: val, currency: cashFundCurrency }];
      }
      void saveSettings(totalDeposit, depositCurrency, newFunds);
      return newFunds;
    });
    setCashFundName("");
    setCashFundDeposit("");
    setCashFundValue("");
  };

  const deleteCashFund = (indexToRemove: number) => {
    setCashFunds((prev) => {
      const newFunds = prev.filter((_, i) => i !== indexToRemove);
      void saveSettings(totalDeposit, depositCurrency, newFunds);
      return newFunds;
    });
  };

  const addDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(depositInput);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const newDeposit = totalDeposit + amount;
    setTotalDeposit(newDeposit);
    setDepositInput("");
    void saveSettings(newDeposit, depositCurrency, cashFunds);
  };

  // Computed values for KPI cards
  const totalDividendsReceived = metrics
    ? metrics.holdings.reduce((sum, h) => sum + (h.dividends_received_display || 0), 0)
    : 0;

  const totalCashDeposit = cashFunds.reduce((sum, f) => sum + toDisplay(f.deposit, f.currency ?? "USD"), 0);
  const totalCashValue = cashFunds.reduce((sum, f) => sum + toDisplay(f.currentValue, f.currency ?? "USD"), 0);
  const cashFundReturn = totalCashDeposit > 0 ? ((totalCashValue - totalCashDeposit) / totalCashDeposit) * 100 : 0;
  const cashFundPnl = totalCashValue - totalCashDeposit;

  // Absolute return = (profit + cash fund pnl + total div received) / total deposit amount
  // If deposit is in MYR but display is USD, convert deposit to USD for the ratio
  const totalProfit = (metrics?.total_pnl || 0) + cashFundPnl;
  const absoluteReturnValue = totalProfit + totalDividendsReceived;
  const depositInDisplayCurrency =
    depositCurrency === "MYR" && displayCurrency === "USD"
      ? totalDeposit / myrUsdRate
      : depositCurrency === "USD" && displayCurrency === "MYR"
      ? totalDeposit * myrUsdRate
      : totalDeposit;
  const absoluteReturnPercent = depositInDisplayCurrency > 0 ? (absoluteReturnValue / depositInDisplayCurrency) * 100 : 0;

  // Pie chart data: holdings + cash funds
  const holdingsPieData = metrics?.holdings || holdings.map(h => ({
    reference: h.reference,
    market_value: h.shares * h.avg_price
  }));
  const cashPieData = cashFunds.map(f => ({
    reference: f.name,
    market_value: toDisplay(f.currentValue, f.currency ?? "USD"),
    isCashFund: true,
  }));
  const pieData = [...holdingsPieData, ...cashPieData];
  const pieTotal = pieData.reduce((sum, item) => sum + Number(item.market_value || 0), 0);

  // Total portfolio value = stock holdings value + cash fund current values
  const totalPortfolioValue = (metrics?.total_value || 0) + totalCashValue;

  return (
    <main className="min-h-screen text-slate-300 font-sans p-4 md:p-8 relative selection:bg-cyan-500/30">

      <ParticleBackground />

      <div className="max-w-[90rem] mx-auto space-y-8 relative z-10">

        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center bg-black/40 backdrop-blur-md border border-white/10 p-6 rounded-xl shadow-[0_0_30px_rgba(56,189,248,0.05)]">
          <div className="flex items-center space-x-4">
            <div className="p-3 bg-gradient-to-br from-cyan-500/30 to-purple-600/30 border border-white/10 rounded-xl">
              <Activity className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white tracking-wide">
                HP<span className="text-cyan-500">_Portfolio</span>
              </h1>
              <p className="text-slate-400 text-xs uppercase tracking-wider mt-1">System Metrics Live</p>
            </div>
          </div>
          <div className="mt-4 md:mt-0 flex items-center gap-3">
            <select
              value={displayCurrency}
              onChange={(e) => setDisplayCurrency(e.target.value as "USD" | "MYR")}
              className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm font-medium text-white outline-none"
            >
              <option value="USD">USD</option>
              <option value="MYR">MYR</option>
            </select>
            <button
              onClick={fetchMetrics}
              className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors text-sm font-medium flex items-center space-x-2 text-white"
            >
              {loading ? <span className="animate-pulse text-cyan-400">Syncing...</span> : <span>Fetch Market Data</span>}
            </button>
          </div>
        </header>

        {/* Top KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          <KPICard title={`Total Portfolio Value (${displayCurrency})`} value={`${currencySymbol}${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<DollarSign />} glow="rgba(56,189,248,0.15)" />
          <KPICard title={`All-Time Profit / Loss (${displayCurrency})`} value={`${currencySymbol}${totalProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} subtitle={metrics ? `${metrics.total_pnl_percent || 0}%` : undefined} icon={<TrendingUp />} isPositive={totalProfit >= 0} glow={totalProfit >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"} />
          <KPICard title={`Today's Daily P/L (${displayCurrency})`} value={`${currencySymbol}${metrics?.total_daily_pnl.toLocaleString() || "0.00"}`} icon={<Calendar />} isPositive={metrics ? metrics.total_daily_pnl >= 0 : undefined} glow={metrics && metrics.total_daily_pnl >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"} />
          <KPICard
            title="Portfolio Daily Return (weighted)"
            value={`${metrics?.portfolio_daily_return_percent != null ? (metrics.portfolio_daily_return_percent > 0 ? "+" : "") + metrics.portfolio_daily_return_percent : "0"}%`}
            subtitle="Σ weight × 1d return"
            subtitlePlain
            icon={<Activity />}
            isPositive={metrics ? metrics.portfolio_daily_return_percent >= 0 : undefined}
            glow={metrics && metrics.portfolio_daily_return_percent >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}
          />
          <KPICard
            title="Weighted Avg Ann. Return"
            value={`${metrics?.portfolio_weighted_ann_return_percent != null ? (metrics.portfolio_weighted_ann_return_percent > 0 ? "+" : "") + metrics.portfolio_weighted_ann_return_percent : "0"}%`}
            subtitle="By current allocation"
            subtitlePlain
            icon={<TrendingUp />}
            isPositive={metrics ? metrics.portfolio_weighted_ann_return_percent >= 0 : undefined}
            glow={metrics && metrics.portfolio_weighted_ann_return_percent >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}
          />
          <KPICard
            title="Weighted Total Return"
            value={`${metrics?.portfolio_weighted_total_return_percent != null ? (metrics.portfolio_weighted_total_return_percent > 0 ? "+" : "") + metrics.portfolio_weighted_total_return_percent : "0"}%`}
            subtitle="Σ weight × position return"
            subtitlePlain
            icon={<TrendingUp />}
            isPositive={metrics ? metrics.portfolio_weighted_total_return_percent >= 0 : undefined}
            glow={metrics && metrics.portfolio_weighted_total_return_percent >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}
          />
          <KPICard
            title={`Total Div Received (${displayCurrency})`}
            value={`${currencySymbol}${totalDividendsReceived.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            icon={<DollarSign />}
            glow="rgba(52,211,153,0.15)"
          />
          <KPICard
            title="Absolute Return"
            value={totalDeposit > 0 ? `${absoluteReturnPercent > 0 ? "+" : ""}${absoluteReturnPercent.toFixed(2)}%` : "—"}
            subtitle={`${currencySymbol}${absoluteReturnValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            subtitlePlain
            icon={<TrendingUp />}
            isPositive={absoluteReturnPercent >= 0}
            glow={absoluteReturnPercent >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"}
          />
          <KPICard title="Active Assets" value={holdings.length.toString()} icon={<PieChartIcon />} glow="rgba(192,132,252,0.15)" />
          <KPICard title="Best Performer" value={metrics?.best_performer || "N/A"} subtitle={`${metrics?.best_performer_pnl || 0}%`} icon={<Award />} isPositive={true} glow="rgba(52,211,153,0.15)" />
          <KPICard title="Worst Performer" value={metrics?.worst_performer || "N/A"} subtitle={`${metrics?.worst_performer_pnl || 0}%`} icon={<AlertTriangle />} isPositive={false} glow="rgba(248,113,113,0.15)" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Main Table Area */}
          <div className="xl:col-span-3 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 overflow-hidden flex flex-col shadow-2xl">
            <h2 className="text-sm font-semibold mb-6 uppercase tracking-wider text-cyan-100 flex items-center">
              <span className="w-2 h-2 rounded-full bg-cyan-500 mr-3 shadow-[0_0_10px_rgba(56,189,248,0.8)]"></span> Ledger Overview
            </h2>
            {fetchError && (
              <p className="mb-4 text-xs text-amber-400/95 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Market data unavailable: {fetchError}. Showing positions only.
              </p>
            )}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10 uppercase tracking-wider">
                    <th className="pb-3 pl-2 font-medium w-28 max-w-[7rem]">Asset</th>
                    <th className="pb-3 text-right font-medium">Wt%</th>
                    <th className="pb-3 text-right font-medium">Shares</th>
                    <th className="pb-3 text-right font-medium">Avg</th>
                    <th className="pb-3 text-right font-medium">Price</th>
                    <th className="pb-3 text-right font-medium">1d%</th>
                    <th className="pb-3 text-right font-medium">Ret%</th>
                    <th className="pb-3 text-right font-medium">Ann%</th>
                    <th className="pb-3 text-right font-medium">Div</th>
                    <th className="pb-3 text-right font-medium">Value</th>
                    <th className="pb-3 text-right font-medium">P/L</th>
                    <th className="pb-3 text-center font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding, i) => {
                    const h = metrics?.holdings[i];
                    const live = Boolean(h);
                    return (
                    <tr
                      key={`${holding.reference}-${i}`}
                      className="border-b border-white/5 hover:bg-white/[0.03] transition-colors"
                      onMouseEnter={() => {
                        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                        hoverTimer.current = window.setTimeout(() => setHoveredAssetIndex(i), 1000);
                      }}
                      onMouseLeave={() => {
                        if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                        hoverTimer.current = null;
                        setHoveredAssetIndex(null);
                      }}
                    >
                      <td className="py-2 pl-2 w-28 max-w-[7rem]">
                        <div className="font-bold text-white text-sm relative truncate max-w-[6.5rem]">
                          {holding.reference}
                          {hoveredAssetIndex === i && (
                            <span className="absolute left-0 top-full mt-1 px-2 py-1 rounded bg-black/80 border border-white/10 text-[10px] text-slate-200 whitespace-nowrap z-20">
                              {holding.reference} — Purchased: {holding.purchase_date}
                            </span>
                          )}
                        </div>
                        {holding.reference !== holding.ticker && <div className="text-[10px] text-cyan-400 uppercase tracking-wider truncate max-w-[6.5rem]">{holding.ticker}</div>}
                      </td>
                      <td className="py-2 text-right text-slate-300 tabular-nums">{live && h != null && h.weight_percent != null ? `${h.weight_percent.toFixed(1)}%` : "—"}</td>
                      <td className="py-2 text-right text-slate-300 tabular-nums">{holding.shares}</td>
                      <td className="py-2 text-right text-slate-300 tabular-nums">
                        {live ? h!.avg_price.toFixed(2) : holding.avg_price.toFixed(2)}
                      </td>
                      <td className="py-2 text-right text-cyan-200 font-medium tabular-nums">
                        {live ? h!.current_price.toFixed(2) : <span className="text-slate-500">—</span>}
                      </td>

                      <td className={`py-2 text-right font-medium tabular-nums ${live ? (h!.daily_return_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.daily_return_percent > 0 ? '+' : ''}${h!.daily_return_percent.toFixed(1)}%` : "—"}
                      </td>
                      <td className={`py-2 text-right font-medium tabular-nums ${live ? (h!.pnl_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.pnl_percent > 0 ? '+' : ''}${h!.pnl_percent}%` : "—"}
                      </td>
                      <td className={`py-2 text-right font-medium tabular-nums ${live ? (h!.ann_return_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.ann_return_percent > 0 ? '+' : ''}${h!.ann_return_percent}%` : "—"}
                      </td>

                      <td className="py-2 text-right text-slate-300 tabular-nums">
                        {live ? `${currencySymbol}${h!.dividends_received_display.toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2 text-right text-slate-300 tabular-nums">
                        {live ? `${currencySymbol}${h!.market_value.toLocaleString()}` : "—"}
                      </td>
                      <td className={`py-2 text-right tabular-nums ${live ? (h!.pnl >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${currencySymbol}${h!.pnl.toLocaleString()}` : "—"}
                      </td>

                      <td className="py-2 text-center">
                        <button
                          onClick={() => deleteHolding(i)}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    );
                  })}

                  {/* Cash Fund rows in ledger */}
                  {cashFunds.map((fund, idx) => {
                    const fundCurrency = fund.currency ?? "USD";
                    const dispDeposit = toDisplay(fund.deposit, fundCurrency);
                    const dispValue = toDisplay(fund.currentValue, fundCurrency);
                    const ret = fund.deposit > 0 ? ((fund.currentValue - fund.deposit) / fund.deposit) * 100 : 0;
                    const pnl = dispValue - dispDeposit;
                    return (
                      <tr key={`cash-ledger-${idx}`} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors bg-purple-500/[0.03]">
                        <td className="py-2 pl-2 w-28 max-w-[7rem]">
                          <div className="font-bold text-purple-300 text-sm truncate max-w-[6.5rem]">{fund.name}</div>
                          <div className="text-[10px] text-purple-400/70 uppercase tracking-wider">Cash Fund · {fundCurrency}</div>
                        </td>
                        <td className="py-2 text-right text-slate-500">—</td>
                        <td className="py-2 text-right text-slate-500">—</td>
                        <td className="py-2 text-right text-slate-300 tabular-nums">{currencySymbol}{dispDeposit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className="py-2 text-right text-cyan-200 font-medium tabular-nums">{currencySymbol}{dispValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className="py-2 text-right text-slate-500">—</td>
                        <td className={`py-2 text-right font-medium tabular-nums ${ret >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ret > 0 ? '+' : ''}{ret.toFixed(1)}%
                        </td>
                        <td className="py-2 text-right text-slate-500">—</td>
                        <td className="py-2 text-right text-slate-500">—</td>
                        <td className="py-2 text-right text-cyan-200 tabular-nums">{currencySymbol}{dispValue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className={`py-2 text-right tabular-nums ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {currencySymbol}{pnl.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                        </td>
                        <td className="py-2 text-center">
                          <button
                            onClick={() => deleteCashFund(idx)}
                            className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="space-y-6">

            {/* Add Transaction Form */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Log Transaction</h2>
              <form onSubmit={addTransaction} className="space-y-4">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Ticker (Def: SPY)</label>
                    <input type="text" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="AAPL" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm uppercase" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Ref. (Optional)</label>
                    <input type="text" value={newReference} onChange={(e) => setNewReference(e.target.value)} placeholder="Tech Swing" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Purchase Date</label>
                  <input required type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm [color-scheme:dark]" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Shares</label>
                    <input required type="number" step="any" min="0" value={newShares} onChange={(e) => setNewShares(e.target.value)} placeholder="0.0" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Cost ($)</label>
                    <input required type="number" step="any" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)} placeholder="0.00" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm" />
                  </div>
                </div>
                <button type="submit" className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white py-2.5 rounded-lg font-medium transition-all mt-2 text-sm shadow-[0_0_15px_rgba(56,189,248,0.3)]">
                  <Plus className="w-4 h-4" /> <span>Execute</span>
                </button>
              </form>
            </div>

            {/* Dividends */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Dividends</h2>
              <form onSubmit={setDividendForHolding} className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">Asset</label>
                  <select
                    value={divRef}
                    onChange={(e) => setDivRef(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  >
                    <option value="">Select…</option>
                    {holdings.map((h) => (
                      <option key={`div-${h.reference}`} value={h.reference}>
                        {h.reference}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Total dividends received (in the asset’s currency)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={divAmount}
                    onChange={(e) => setDivAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2.5 rounded-lg font-medium transition-all text-sm"
                >
                  Add Dividends
                </button>
              </form>
            </div>

            {/* Portfolio Deposit */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Portfolio Deposit</h2>
              <form onSubmit={addDeposit} className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Deposit Currency
                  </label>
                  <select
                    value={depositCurrency}
                    onChange={(e) => {
                      const cur = e.target.value as "USD" | "MYR";
                      setDepositCurrency(cur);
                      void saveSettings(totalDeposit, cur, cashFunds);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  >
                    <option value="MYR">MYR (RM)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Add Deposit Amount ({depositCurrency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={depositInput}
                    onChange={(e) => setDepositInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2.5 rounded-lg font-medium transition-all text-sm"
                >
                  Add Deposit
                </button>
              </form>
              <div className="mt-3 flex items-center justify-between bg-white/5 rounded-lg px-3 py-2 text-sm">
                <span className="text-slate-400">Total Deposited</span>
                <span className="text-white font-medium tabular-nums">
                  {depositCurrency === "MYR" ? "RM" : "$"}{totalDeposit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              {depositCurrency !== displayCurrency && totalDeposit > 0 && (
                <div className="mt-1 text-[10px] text-slate-500 px-1">
                  ≈ {displayCurrency === "USD" ? "$" : "RM"}{(depositInDisplayCurrency).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {displayCurrency}
                  <span className="ml-1 text-slate-600">(rate: {myrUsdRate.toFixed(4)})</span>
                </div>
              )}
              {totalDeposit > 0 && (
                <button
                  onClick={() => { setTotalDeposit(0); void saveSettings(0, depositCurrency, cashFunds); }}
                  className="mt-2 text-[10px] text-slate-500 hover:text-red-400 transition-colors"
                >
                  Reset deposit
                </button>
              )}
            </div>

            {/* Cash Fund */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Cash / Fund Deposits</h2>
              <form onSubmit={addCashFund} className="space-y-4">
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Fund Name
                  </label>
                  <input
                    type="text"
                    value={cashFundName}
                    onChange={(e) => setCashFundName(e.target.value)}
                    placeholder="e.g. StashAway, FD"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  />
                  {cashFunds.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cashFunds.map((f) => (
                        <button
                          key={`qf-${f.name}`}
                          type="button"
                          onClick={() => { setCashFundName(f.name); setCashFundCurrency(f.currency ?? "USD"); }}
                          className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                            cashFundName === f.name
                              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                              : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                          }`}
                        >
                          {f.name} <span className="opacity-60">·{f.currency ?? "USD"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                    Fund Currency
                  </label>
                  <select
                    value={cashFundCurrency}
                    onChange={(e) => setCashFundCurrency(e.target.value as "USD" | "MYR")}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="MYR">MYR (RM)</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      + Deposit ({cashFundCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={cashFundDeposit}
                      onChange={(e) => setCashFundDeposit(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1">
                      + Value ({cashFundCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={cashFundValue}
                      onChange={(e) => setCashFundValue(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-500 transition-colors text-sm"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white py-2.5 rounded-lg font-medium transition-all text-sm"
                >
                  Add / Update Fund
                </button>
              </form>
            </div>

            {/* Asset Allocation */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Allocation</h2>
              <div className="h-[250px] -ml-4">
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="market_value"
                        nameKey="reference"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={68}
                        paddingAngle={3}
                        stroke="none"
                        label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`}
                        labelLine={{ stroke: 'rgba(255,255,255,0.2)', strokeWidth: 1 }}
                        className="text-[10px] fill-slate-200 font-medium tracking-wider"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px', backdropFilter: 'blur(10px)' }}
                        itemStyle={{ color: '#f8fafc' }}
                        formatter={(value) =>
                          `${currencySymbol}${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        }
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">Awaiting Data</div>
                )}
              </div>
              {pieData.length > 0 && (
                <div className="mt-3 space-y-1">
                  {pieData.map((entry, index) => (
                    <div key={`alloc-${entry.reference}-${index}`} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 text-slate-300">
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        {entry.reference}
                      </span>
                      <span className="text-cyan-300 tabular-nums">
                        {pieTotal > 0 ? `${((Number(entry.market_value) / pieTotal) * 100).toFixed(1)}%` : "0.0%"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </main>
  );
}

function KPICard({
  title,
  value,
  subtitle,
  subtitlePlain,
  icon,
  isPositive,
  glow,
}: {
  title: string;
  value: string;
  subtitle?: string;
  subtitlePlain?: boolean;
  icon: ReactNode;
  isPositive?: boolean;
  glow?: string;
}) {
  let subtitleColorClass = "bg-white/10 text-slate-300";
  let valueColorClass = "text-white";
  if (!subtitlePlain) {
    if (isPositive === true) subtitleColorClass = "bg-emerald-500/20 text-emerald-400";
    if (isPositive === false) subtitleColorClass = "bg-red-500/20 text-red-400";
  }
  if (isPositive === true) valueColorClass = "text-emerald-400";
  if (isPositive === false) valueColorClass = "text-red-400";

  return (
    <div
      className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 relative overflow-hidden group hover:bg-white/5 transition-colors"
      style={{ boxShadow: glow ? `0 10px 40px -15px ${glow}` : "none" }}
    >
      <div className="absolute top-0 right-0 p-5 opacity-20 transition-opacity text-white group-hover:opacity-40">
        <div className="w-8 h-8 flex items-center justify-center">{icon}</div>
      </div>
      <h3 className="text-slate-400 text-xs font-semibold tracking-wider uppercase">{title}</h3>
      <div className="mt-3 flex items-baseline space-x-2">
        <span className={`text-2xl font-bold tracking-tight ${valueColorClass}`}>{value}</span>
        {subtitle && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${subtitleColorClass}`}>
            {!subtitlePlain && isPositive && subtitle !== "0%" ? "+" : ""}
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}