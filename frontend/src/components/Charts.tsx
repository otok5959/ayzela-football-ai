import React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ModelPerformanceChart({
  data,
  emptyMessage = "Henüz gerçek backtest veya sonuç verisi bulunmuyor.",
}: {
  data: Array<{ model: string; accuracy: number; brier: number; logLoss: number }>;
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-pitch-900/50 px-4 text-center text-xs text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.65} />
            </linearGradient>
            <linearGradient id="ensGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.95} />
              <stop offset="100%" stopColor="#0284C7" stopOpacity={0.7} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="model" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
          <Tooltip
            cursor={{ fill: "rgba(30, 41, 59, 0.45)" }}
            contentStyle={{
              backgroundColor: "#0B1120",
              borderColor: "#334155",
              borderRadius: 10,
              fontSize: 12,
              color: "#F8FAFC",
            }}
            formatter={(val: any, name: string) => {
              if (name.includes("Doğruluk")) return [`%${Number(val).toFixed(1)}`, name];
              return [Number(val).toFixed(4), name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <Bar dataKey="accuracy" name="Doğruluk (%)" radius={[6, 6, 0, 0]} maxBarSize={44}>
            {data.map((entry, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={entry.model.toLowerCase().includes("ensemble") ? "url(#ensGrad)" : "url(#accGrad)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CalibrationCurveChart({
  data,
  emptyMessage = "Kalibrasyon eğrisi için henüz yeterli tamamlanmış tahmin yok.",
}: {
  data: Array<{ bin: string; predicted: number; actual: number }>;
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-slate-800 bg-pitch-900/50 px-4 text-center text-xs text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="predArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.28} />
              <stop offset="95%" stopColor="#38BDF8" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="actualArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10B981" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
          <XAxis dataKey="bin" stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} />
          <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
          <Tooltip
            contentStyle={{
              backgroundColor: "#0B1120",
              borderColor: "#334155",
              borderRadius: 10,
              fontSize: 12,
              color: "#F8FAFC",
            }}
            formatter={(val: any, name: string) => [`%${Number(val).toFixed(1)}`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
          <Area
            type="monotone"
            dataKey="predicted"
            name="Tahmin Edilen (%)"
            stroke="#38BDF8"
            strokeWidth={2}
            fill="url(#predArea)"
          />
          <Area
            type="monotone"
            dataKey="actual"
            name="Gerçekleşen (%)"
            stroke="#10B981"
            strokeWidth={2.5}
            fill="url(#actualArea)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ProbabilitySplitBar({
  probHome,
  probDraw,
  probAway,
  compact = false,
}: {
  probHome?: number | null;
  probDraw?: number | null;
  probAway?: number | null;
  compact?: boolean;
}) {
  if (probHome === undefined || probHome === null) return null;
  const p1 = Math.max(0, Math.round(probHome * 100));
  const px = Math.max(0, Math.round((probDraw || 0) * 100));
  const p2 = Math.max(0, 100 - p1 - px);

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <div className="mb-1 flex items-center justify-between text-[10px] font-medium tabular-nums text-slate-400">
        <span className="text-emerald-300">MS 1: %{p1}</span>
        <span className="text-slate-300">X: %{px}</span>
        <span className="text-sky-300">MS 2: %{p2}</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div className="bg-emerald-500 transition-all" style={{ width: `${p1}%` }} />
        <div className="bg-slate-500 transition-all" style={{ width: `${px}%` }} />
        <div className="bg-sky-500 transition-all" style={{ width: `${p2}%` }} />
      </div>
    </div>
  );
}
