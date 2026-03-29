// app/page.tsx
"use client";

import { useState, useEffect, type ReactNode } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";
import { Activity, DollarSign, PieChart as PieChartIcon, TrendingUp, Plus, Trash2, Award, AlertTriangle, Calendar } from "lucide-react";
import ParticleBackground from "@/components/ParticleBackground";
import { supabase } from "@/lib/supabaseClient";

interface HoldingInput {
  ticker: string;
  reference: string;
  shares: number;
  avg_price: number;
  purchase_date: string;
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
    weight_percent: number;
    weight_contribution_daily_percent: number;
  }[];
  display_currency: "USD" | "MYR";
  total_value: number;
  total_cost: number;
  total_pnl: number;
  total_pnl_percent: number;
  total_daily_pnl: number;
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

  const [newTicker, setNewTicker] = useState("");
  const[newReference, setNewReference] = useState("");
  const [newShares, setNewShares] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const currencySymbol = displayCurrency === "MYR" ? "RM" : "$";

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
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15" },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20" },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01" },
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
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15" },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20" },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01" },
        ];
        setHoldings(defaults);
        setLoadingHoldings(false);
        return;
      }

      if (!data || data.length === 0) {
        const defaults: HoldingInput[] = [
          { ticker: "AAPL", reference: "Apple (Main)", shares: 10, avg_price: 150, purchase_date: "2023-01-15" },
          { ticker: "TSLA", reference: "TSLA", shares: 5, avg_price: 180, purchase_date: "2023-06-20" },
          { ticker: "NVDA", reference: "NVDA", shares: 8, avg_price: 400, purchase_date: "2023-11-01" },
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
        })),
      );
      if (insertError) {
        console.error("Failed to persist holdings to Supabase", insertError);
      }
    };

    void sync();
  }, [clientId, holdings, loadingHoldings]);

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
        holdings,
        display_currency: displayCurrency,
      });
      setMetrics(response.data);
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
        purchase_date: earliestDate
      };

      setHoldings(updatedHoldings);
    } else {
      setHoldings([...holdings, {
        ticker: finalTicker,
        reference: finalReference,
        shares: sharesNum,
        avg_price: priceNum,
        purchase_date: newDate
      }]);
    }

    // Reset Form
    setNewTicker(""); setNewReference(""); setNewShares(""); setNewPrice("");
  };

  const deleteHolding = (indexToRemove: number) => {
    setHoldings(holdings.filter((_, index) => index !== indexToRemove));
  };

  const pieData = metrics?.holdings || holdings.map(h => ({
    reference: h.reference,
    market_value: h.shares * h.avg_price
  }));
  const pieTotal = pieData.reduce((sum, item) => sum + Number(item.market_value || 0), 0);

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
          <KPICard title={`Total Portfolio Value (${displayCurrency})`} value={`${currencySymbol}${metrics?.total_value.toLocaleString() || "0.00"}`} icon={<DollarSign />} glow="rgba(56,189,248,0.15)" />
          <KPICard title={`All-Time Profit / Loss (${displayCurrency})`} value={`${currencySymbol}${metrics?.total_pnl.toLocaleString() || "0.00"}`} subtitle={`${metrics?.total_pnl_percent || 0}%`} icon={<TrendingUp />} isPositive={metrics ? metrics.total_pnl >= 0 : undefined} glow={metrics && metrics.total_pnl >= 0 ? "rgba(52,211,153,0.15)" : "rgba(248,113,113,0.15)"} />
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
                Market data unavailable: {fetchError}. Showing positions only. For local dev, run{" "}
                <code className="text-cyan-300/90">npm run dev:api</code> in another terminal and start{" "}
                <code className="text-cyan-300/90">next dev</code> with <code className="text-cyan-300/90">USE_PYTHON_API=1</code> so{" "}
                <code className="text-cyan-300/90">/api/portfolio</code> can proxy to FastAPI (or use{" "}
                <code className="text-cyan-300/90">vercel dev</code>).
              </p>
            )}
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse whitespace-nowrap">
                <thead>
                  <tr className="text-slate-400 border-b border-white/10 text-xs uppercase tracking-wider">
                    <th className="pb-4 pl-2 font-medium">Asset Identity</th>
                    <th className="pb-4 text-right font-medium">Weight</th>
                    <th className="pb-4 font-medium">Purchased</th>
                    <th className="pb-4 font-medium">Shares</th>
                    <th className="pb-4 font-medium">Avg Cost</th>
                    <th className="pb-4 font-medium">Current</th>
                    <th className="pb-4 text-right font-medium">1d %</th>
                    <th className="pb-4 text-right font-medium">Contrib 1d</th>
                    <th className="pb-4 text-right font-medium">Return %</th>
                    <th className="pb-4 text-right font-medium">Ann. Return</th>
                    <th className="pb-4 text-right font-medium">Value ({displayCurrency})</th>
                    <th className="pb-4 text-right font-medium">Total P/L ({displayCurrency})</th>
                    <th className="pb-4 text-center font-medium">Drop</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding, i) => {
                    const h = metrics?.holdings[i];
                    const live = Boolean(h);
                    return (
                    <tr key={`${holding.reference}-${i}`} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="py-3 pl-2">
                        <div className="font-bold text-white">{holding.reference}</div>
                        {holding.reference !== holding.ticker && <div className="text-[10px] text-cyan-400 uppercase tracking-wider mt-0.5">{holding.ticker}</div>}
                      </td>
                      <td className="py-3 text-right text-slate-300 tabular-nums">{live && h != null && h.weight_percent != null ? `${h.weight_percent.toFixed(2)}%` : "—"}</td>
                      <td className="py-3 text-slate-400 text-sm">{holding.purchase_date}</td>
                      <td className="py-3 text-slate-300">{holding.shares}</td>
                      <td className="py-3 text-slate-300">
                        {live ? `${h!.avg_price.toFixed(2)} ${h!.quote_currency}` : `${holding.avg_price.toFixed(2)}`}
                      </td>
                      <td className="py-3 text-cyan-200 font-medium">
                        {live ? `${h!.current_price.toFixed(2)} ${h!.quote_currency}` : <span className="text-slate-500">—</span>}
                      </td>

                      <td className={`py-3 text-right font-medium tabular-nums ${live ? (h!.daily_return_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.daily_return_percent > 0 ? '+' : ''}${h!.daily_return_percent.toFixed(2)}%` : "—"}
                      </td>
                      <td className={`py-3 text-right tabular-nums ${live ? 'text-slate-300' : 'text-slate-500'} ${live && (h!.weight_contribution_daily_percent ?? 0) < 0 ? 'text-red-400/90' : ''}`}>
                        {live ? `${(h!.weight_contribution_daily_percent ?? 0) > 0 ? '+' : ''}${h!.weight_contribution_daily_percent?.toFixed(3)}%` : "—"}
                      </td>
                      <td className={`py-3 text-right font-medium ${live ? (h!.pnl_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.pnl_percent > 0 ? '+' : ''}${h!.pnl_percent}%` : "—"}
                      </td>
                      <td className={`py-3 text-right font-medium ${live ? (h!.ann_return_percent >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${h!.ann_return_percent > 0 ? '+' : ''}${h!.ann_return_percent}%` : "—"}
                      </td>
                      <td className="py-3 text-right text-slate-300">
                        {live ? `${currencySymbol}${h!.market_value.toLocaleString()}` : "—"}
                      </td>
                      <td className={`py-3 text-right ${live ? (h!.pnl >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'}`}>
                        {live ? `${currencySymbol}${h!.pnl.toLocaleString()}` : "—"}
                      </td>

                      <td className="py-3 text-center">
                        <button
                          onClick={() => deleteHolding(i)}
                          className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 mx-auto" />
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

            {/* Asset Allocation */}
            <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6 shadow-2xl">
              <h2 className="text-sm font-semibold mb-4 text-cyan-100 uppercase tracking-wider">Allocation</h2>
              <div className="h-[250px] -ml-4">
                {holdings.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="market_value"
                        nameKey="reference"
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                        stroke="none"
                        label={false}
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